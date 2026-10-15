defmodule TradeEngine.Alerts.AlertPersister do
  @moduledoc """
  GenServer that subscribes to all alert PubSub topics and persists
  system alerts to platform.system_alerts.

  Also fixes wiring gaps:
  - Bot errors from "bots:updates" are re-broadcast to "alerts:new"
    so AlertChannel picks them up.
  - Acknowledged alerts are written to DB.
  """

  use GenServer
  require Logger

  alias TradeEngine.Alerts.SystemAlert

  @pubsub TradeEngine.PubSub

  # --- Client API ---

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  # --- Server Callbacks ---

  @impl true
  def init(_opts) do
    Phoenix.PubSub.subscribe(@pubsub, "alerts:new")
    Phoenix.PubSub.subscribe(@pubsub, "alerts:risk_breach")
    Phoenix.PubSub.subscribe(@pubsub, "bots:updates")
    Phoenix.PubSub.subscribe(@pubsub, "alerts:acknowledged")

    Logger.info("[AlertPersister] Started — subscribed to alert topics")
    {:ok, %{}}
  end

  # New alert from any source — persist it
  @impl true
  def handle_info({:new_alert, alert}, state) do
    persist_async(%{
      alert_type: Map.get(alert, :alert_type, "system"),
      category: Map.get(alert, :category, "system"),
      severity: Map.get(alert, :severity, "info"),
      title: Map.get(alert, :title, "Alert"),
      message: Map.get(alert, :message, ""),
      metadata: Map.get(alert, :metadata, %{}),
      source: Map.get(alert, :source, "unknown")
    })

    {:noreply, state}
  end

  # Risk breach — persist with critical severity
  def handle_info({:risk_breach, alert}, state) do
    persist_async(%{
      alert_type: "risk_breach",
      category: Map.get(alert, :category, "risk"),
      severity: "critical",
      title: Map.get(alert, :title, "Risk Breach"),
      message: Map.get(alert, :message, ""),
      metadata: Map.get(alert, :metadata, %{}),
      source: Map.get(alert, :source, "risk_monitor")
    })

    {:noreply, state}
  end

  # Bot error from bots:updates — persist AND re-broadcast to alerts:new
  def handle_info({:bot_error, %{bot_id: bot_id, error: error}}, state) do
    alert = %{
      alert_type: "bot_error",
      category: "bot",
      severity: "warning",
      title: "Bot Error",
      message: to_string(error),
      metadata: %{bot_id: bot_id},
      source: "bot_registry"
    }

    persist_async(alert)

    # Re-broadcast so AlertChannel (subscribed to "alerts:new") picks it up
    Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, alert})

    {:noreply, state}
  end

  # Bot error with positional args (alternate tuple format)
  def handle_info({:bot_error, bot_id, error}, state) do
    handle_info({:bot_error, %{bot_id: bot_id, error: error}}, state)
  end

  # Alert acknowledged — persist to DB
  def handle_info({:alert_acknowledged, alert_id}, state) do
    Task.start(fn ->
      case SystemAlert.acknowledge(alert_id, "ws_client") do
        {:ok, _} ->
          Logger.debug("[AlertPersister] Acknowledged alert #{alert_id}")

        {:error, reason} ->
          Logger.warning("[AlertPersister] Failed to acknowledge alert #{alert_id}: #{inspect(reason)}")
      end
    end)

    {:noreply, state}
  end

  # Ignore other bots:updates messages
  def handle_info({topic, _data}, state)
      when topic in [:bot_started, :bot_stopped, :bot_paused, :bot_resumed, :bot_status] do
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # --- Private ---

  defp persist_async(attrs) do
    Task.start(fn ->
      case SystemAlert.insert(attrs) do
        {:ok, record} ->
          Logger.debug("[AlertPersister] Persisted alert: #{record.title} (#{record.severity})")

        {:error, reason} ->
          Logger.warning("[AlertPersister] Failed to persist alert: #{inspect(reason)}")
      end
    end)
  end
end
