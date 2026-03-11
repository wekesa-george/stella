defmodule AdminGatewayWeb.AlertChannel do
  @moduledoc """
  WebSocket channel for real-time platform alerts.

  Subscribes to:
  - "alerts:new"        — all normalized alerts (including bot errors re-broadcast by AlertPersister)
  - "alerts:risk_breach" — critical risk breach alerts

  Dead subscriptions to "alerts:bot_error" and "alerts:exchange_error" have been removed.
  Bot errors are now re-broadcast to "alerts:new" by AlertPersister.
  """

  use AdminGatewayWeb, :channel

  alias TradeEngine.Alerts.SystemAlert

  @pubsub TradeEngine.PubSub

  @impl true
  def join("alerts:platform", _params, socket) do
    send(self(), :after_join)
    {:ok, socket}
  end

  @impl true
  def handle_info(:after_join, socket) do
    Phoenix.PubSub.subscribe(@pubsub, "alerts:new")
    Phoenix.PubSub.subscribe(@pubsub, "alerts:risk_breach")
    Phoenix.PubSub.subscribe(@pubsub, "platform:circuit_breaker")
    Phoenix.PubSub.subscribe(@pubsub, "platform:reconciliation")

    # Push recent unacknowledged alerts as snapshot on join
    alerts =
      SystemAlert.recent(50)
      |> Enum.map(&serialize_alert/1)

    push(socket, "alert_snapshot", %{alerts: alerts})

    {:noreply, socket}
  end

  def handle_info({:new_alert, alert}, socket) do
    push(socket, "new_alert", serialize_alert(alert))
    {:noreply, socket}
  end

  def handle_info({:risk_breach, alert}, socket) do
    push(socket, "new_alert", serialize_alert(Map.put(alert, :severity, "critical")))
    {:noreply, socket}
  end

  def handle_info({:circuit_breaker_tripped, alert}, socket) do
    push(socket, "circuit_breaker_tripped", serialize_alert(alert))
    push(socket, "new_alert", serialize_alert(alert))
    {:noreply, socket}
  end

  def handle_info({:position_reconciled, event}, socket) do
    push(socket, "position_reconciled", event)
    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  # Acknowledge an alert from the frontend
  @impl true
  def handle_in("acknowledge_alert", %{"alert_id" => alert_id}, socket) do
    Phoenix.PubSub.broadcast(@pubsub, "alerts:acknowledged", {:alert_acknowledged, alert_id})
    {:reply, {:ok, %{alert_id: alert_id, status: "acknowledged"}}, socket}
  end

  defp serialize_alert(%SystemAlert{} = alert) do
    %{
      id: alert.id,
      alert_type: alert.alert_type,
      category: alert.category,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      metadata: alert.metadata || %{},
      source: alert.source,
      acknowledged: alert.acknowledged,
      timestamp: (alert.created_at || DateTime.utc_now()) |> DateTime.to_iso8601()
    }
  end

  defp serialize_alert(alert) when is_map(alert) do
    %{
      id: Map.get(alert, :id, Ecto.UUID.generate()),
      alert_type: Map.get(alert, :alert_type, "system"),
      category: Map.get(alert, :category, "system"),
      severity: Map.get(alert, :severity, "info"),
      title: Map.get(alert, :title, "Alert"),
      message: Map.get(alert, :message, ""),
      metadata: Map.get(alert, :metadata, %{}),
      source: Map.get(alert, :source),
      acknowledged: Map.get(alert, :acknowledged, false),
      timestamp: Map.get(alert, :timestamp, DateTime.utc_now() |> DateTime.to_iso8601())
    }
  end
end
