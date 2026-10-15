defmodule TradeEngine.Alerts.NotificationDispatcher do
  @moduledoc """
  GenServer that routes alerts to notification channels based on severity.

  Routing rules:
  - critical → Slack (+ future: PagerDuty, email)
  - warning  → Slack
  - info     → skip (dashboard only)

  Deduplication: 5-minute window per alert_key to prevent flooding from flapping services.
  """

  use GenServer
  require Logger

  alias TradeEngine.Alerts.Channels.Slack

  @pubsub TradeEngine.PubSub
  @dedup_window_ms :timer.minutes(5)
  @cleanup_interval_ms :timer.minutes(10)

  # --- Client API ---

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  # --- Server Callbacks ---

  @impl true
  def init(_opts) do
    Phoenix.PubSub.subscribe(@pubsub, "alerts:new")

    # ETS table for dedup tracking
    :ets.new(:notification_dedup, [:set, :named_table, :public])

    schedule_cleanup()

    Logger.info("[NotificationDispatcher] Started — routing alerts to notification channels")
    {:ok, %{}}
  end

  @impl true
  def handle_info({:new_alert, alert}, state) do
    if notifications_enabled?() do
      severity = Map.get(alert, :severity, "info")
      dispatch(severity, alert)
    end

    {:noreply, state}
  end

  def handle_info(:cleanup_dedup, state) do
    cleanup_expired_entries()
    schedule_cleanup()
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # --- Private ---

  defp dispatch("critical", alert) do
    unless deduplicated?(alert) do
      Task.start(fn -> Slack.send_alert(alert) end)
      # Future: PagerDuty, email
    end
  end

  defp dispatch("warning", alert) do
    unless deduplicated?(alert) do
      Task.start(fn -> Slack.send_alert(alert) end)
    end
  end

  defp dispatch(_severity, _alert) do
    # info → dashboard only, no external notification
    :ok
  end

  defp deduplicated?(alert) do
    key = alert_key(alert)
    now = System.monotonic_time(:millisecond)

    case :ets.lookup(:notification_dedup, key) do
      [{^key, last_sent}] when now - last_sent < @dedup_window_ms ->
        Logger.debug("[NotificationDispatcher] Dedup suppressed: #{key}")
        true

      _ ->
        :ets.insert(:notification_dedup, {key, now})
        false
    end
  end

  defp alert_key(alert) do
    category = Map.get(alert, :category, "unknown")
    source = Map.get(alert, :source, "unknown")
    title = Map.get(alert, :title, "unknown")
    "#{category}:#{source}:#{title}"
  end

  defp cleanup_expired_entries do
    now = System.monotonic_time(:millisecond)

    :ets.foldl(
      fn {key, timestamp}, acc ->
        if now - timestamp > @dedup_window_ms do
          :ets.delete(:notification_dedup, key)
        end

        acc
      end,
      :ok,
      :notification_dedup
    )
  end

  defp schedule_cleanup do
    Process.send_after(self(), :cleanup_dedup, @cleanup_interval_ms)
  end

  defp notifications_enabled? do
    Application.get_env(:trade_engine, :notifications_enabled, false)
  end
end
