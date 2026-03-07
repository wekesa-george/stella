defmodule TradeEngine.Operations.IncidentManager do
  @moduledoc """
  Listens for system alerts and auto-creates formal incidents for P1/P2 conditions.

  Subscribes to:
    - "alerts:new" — new system alerts
    - "alerts:risk_breach" — risk limit violations
    - "bots:updates" — bot state transitions

  Auto-incident rules (from OPERATIONS-FRAMEWORK.md Section 4):
    P1: kill switch, >2 bots error in 5min, rogue bot, credential auth failure, circuit breaker, DB down >30s
    P2: daily loss breach, drawdown breach, bot heartbeat lost with open positions

  Deduplication: won't create duplicate incidents for the same source_alert_id.
  Throttling: won't create more than 1 incident per bot per category within 10 minutes.
  """

  use GenServer
  require Logger

  alias TradeEngine.Operations.Incident

  @pubsub TradeEngine.PubSub
  @throttle_window_ms 10 * 60 * 1_000  # 10 minutes

  # ── Alert type → incident mapping ──
  @auto_incident_rules %{
    # P1 auto-create
    "circuit_breaker" => %{priority: "P1", category: "risk_breach"},
    "credential_auth_failure" => %{priority: "P1", category: "exchange_failure"},
    "kill_switch" => %{priority: "P1", category: "kill_switch"},
    "rogue_bot" => %{priority: "P1", category: "rogue_bot"},
    "db_connection_lost" => %{priority: "P1", category: "infrastructure"},
    "multi_bot_error" => %{priority: "P1", category: "bot_error"},

    # P2 auto-create
    "daily_loss_breach" => %{priority: "P2", category: "risk_breach"},
    "drawdown_breach" => %{priority: "P2", category: "risk_breach"},
    "bot_error" => %{priority: "P2", category: "bot_error"},
    "exchange_down" => %{priority: "P2", category: "exchange_failure"},
  }

  # ── Public API ──

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Manually create an incident (operator-initiated)."
  def create_incident(attrs) do
    Incident.create(attrs)
  end

  @doc "List open incidents."
  def open_incidents(limit \\ 50) do
    Incident.list_open(limit)
  end

  @doc "List recent incidents."
  def recent_incidents(limit \\ 50) do
    Incident.list_recent(limit)
  end

  # ── GenServer callbacks ──

  @impl true
  def init(_opts) do
    Phoenix.PubSub.subscribe(@pubsub, "alerts:new")
    Phoenix.PubSub.subscribe(@pubsub, "alerts:risk_breach")
    Phoenix.PubSub.subscribe(@pubsub, "bots:updates")

    Logger.info("[IncidentManager] Started — listening for auto-incident triggers")

    # Track recent incidents to throttle duplicates: %{"bot_id:category" => timestamp}
    {:ok, %{recent: %{}, bot_error_window: []}}
  end

  # ── New alert ──
  @impl true
  def handle_info({:new_alert, alert}, state) do
    state = maybe_create_incident(alert, state)
    {:noreply, state}
  end

  # ── Risk breach ──
  @impl true
  def handle_info({:risk_breach, data}, state) do
    alert = %{
      id: data[:alert_id],
      alert_type: data[:breach_type] || "risk_breach",
      severity: "critical",
      title: data[:title] || "Risk limit breached",
      message: data[:message] || inspect(data),
      metadata: data[:metadata] || %{},
      source: "risk_monitor",
      category: "risk"
    }
    state = maybe_create_incident(alert, state)
    {:noreply, state}
  end

  # ── Bot state transition (detect multi-bot errors) ──
  @impl true
  def handle_info({:bot_updated, bot}, state) when is_map(bot) do
    if bot[:status] == "error" do
      state = track_bot_error(bot, state)
    end
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ── Private ──

  defp maybe_create_incident(alert, state) when is_map(alert) do
    alert_type = to_string(alert[:alert_type] || alert["alert_type"] || "unknown")
    alert_id = alert[:id] || alert["id"]
    severity = to_string(alert[:severity] || alert["severity"] || "info")

    # Check if this alert type triggers auto-incident
    rule = Map.get(@auto_incident_rules, alert_type)

    cond do
      # No rule for this alert type
      is_nil(rule) ->
        state

      # Only create incidents for warning+ severity
      severity == "info" ->
        state

      # Already created incident for this alert
      alert_id && safe_exists_for_alert?(alert_id) ->
        state

      # Throttled — same bot+category within window
      throttled?(alert, rule, state) ->
        state

      # Create the incident
      true ->
        create_auto_incident(alert, rule, state)
    end
  end

  defp create_auto_incident(alert, rule, state) do
    bot_ref = extract_bot_ref(alert)
    now = DateTime.utc_now()
    time = DateTime.to_time(now)

    # Determine active shift
    shift_type = determine_shift_type(now)

    attrs = %{
      priority: rule.priority,
      category: rule.category,
      title: to_string(alert[:title] || alert["title"] || "System alert"),
      description: to_string(alert[:message] || alert["message"] || ""),
      bot_ref: bot_ref,
      date: Date.utc_today(),
      time_detected: time,
      shift_type: shift_type,
      status: "open",
      source_alert_id: alert[:id] || alert["id"],
      notes: "Auto-created from system alert. See OPERATIONS-FRAMEWORK.md for response procedures."
    }

    case Incident.create(attrs) do
      {:ok, incident} ->
        Logger.info("[IncidentManager] Auto-created #{incident.incident_number} (#{rule.priority}/#{rule.category}): #{attrs.title}")

        # Broadcast for real-time UI updates
        Phoenix.PubSub.broadcast(
          @pubsub,
          "incidents:new",
          {:new_incident, incident}
        )

        # Update throttle state
        throttle_key = "#{bot_ref || "system"}:#{rule.category}"
        put_in(state, [:recent, throttle_key], System.monotonic_time(:millisecond))

      {:error, changeset} ->
        Logger.warning("[IncidentManager] Failed to create incident: #{inspect(changeset.errors)}")
        state
    end
  end

  defp throttled?(alert, rule, state) do
    bot_ref = extract_bot_ref(alert)
    key = "#{bot_ref || "system"}:#{rule.category}"
    last = Map.get(state.recent, key)

    if last do
      elapsed = System.monotonic_time(:millisecond) - last
      elapsed < @throttle_window_ms
    else
      false
    end
  end

  defp extract_bot_ref(alert) do
    metadata = alert[:metadata] || alert["metadata"] || %{}
    bot_id = metadata["bot_id"] || metadata[:bot_id] || alert[:bot_id] || alert["bot_id"]
    if bot_id, do: String.slice(to_string(bot_id), 0, 8), else: nil
  end

  defp determine_shift_type(datetime) do
    hour = datetime.hour
    cond do
      hour >= 6 and hour < 14 -> "AM"
      hour >= 14 and hour < 22 -> "PM"
      true -> "Night"
    end
  end

  defp track_bot_error(bot, state) do
    now = System.monotonic_time(:millisecond)
    window_start = now - 5 * 60 * 1_000  # 5 minutes

    # Add this error, prune old ones
    errors = [{bot[:id] || bot["id"], now} | state.bot_error_window]
    |> Enum.filter(fn {_, ts} -> ts > window_start end)

    state = %{state | bot_error_window: errors}

    # If >2 unique bots errored in 5 min window, trigger P1
    unique_bots = errors |> Enum.map(&elem(&1, 0)) |> Enum.uniq() |> length()

    if unique_bots > 2 do
      alert = %{
        id: nil,
        alert_type: "multi_bot_error",
        severity: "critical",
        title: "Multiple bots entered error state (#{unique_bots} bots in 5 min)",
        message: "Bot IDs: #{errors |> Enum.map(&elem(&1, 0)) |> Enum.uniq() |> Enum.join(", ")}",
        metadata: %{bot_count: unique_bots},
        source: "incident_manager"
      }
      maybe_create_incident(alert, state)
    else
      state
    end
  end

  defp safe_exists_for_alert?(alert_id) do
    Incident.exists_for_alert?(alert_id)
  rescue
    _ -> false
  end
end
