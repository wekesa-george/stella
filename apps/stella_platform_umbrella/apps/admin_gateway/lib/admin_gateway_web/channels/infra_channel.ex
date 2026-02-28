defmodule AdminGatewayWeb.InfraChannel do
  use AdminGatewayWeb, :channel
  require Logger

  @pubsub TradeEngine.PubSub

  @impl true
  def join("infra:metrics", _params, socket) do
    Logger.info("[InfraChannel] Client JOINING infra:metrics")
    send(self(), :after_join)
    {:ok, socket}
  end

  @impl true
  def handle_info(:after_join, socket) do
    Phoenix.PubSub.subscribe(@pubsub, "infra:update")
    Phoenix.PubSub.subscribe(@pubsub, "infra:exchange_health")
    Phoenix.PubSub.subscribe(@pubsub, "infra:service_health")
    Logger.info("[InfraChannel] Subscribed to PubSub topics, pushing snapshots...")

    # Push current snapshot from ETS if available
    push_cached_metrics(socket)
    push_service_health_snapshot(socket)

    {:noreply, socket}
  end

  # Periodic infra metrics update (from future InfraMonitor GenServer)
  def handle_info({:infra_update, metrics}, socket) do
    Logger.debug("[InfraChannel] Forwarding infra_update → client (collected_at=#{metrics[:collected_at]})")
    push(socket, "infra_update", metrics)
    {:noreply, socket}
  end

  # Exchange health update
  def handle_info({:exchange_health, health_data}, socket) do
    Logger.debug("[InfraChannel] Forwarding exchange_health → client")
    push(socket, "exchange_health", health_data)
    {:noreply, socket}
  end

  # Service health update (from ServiceHealthMonitor)
  def handle_info({:service_health_update, data}, socket) do
    Logger.debug("[InfraChannel] Forwarding service_health_update → client (#{data[:service_name]} = #{data[:status]})")
    push(socket, "service_health_update", data)
    {:noreply, socket}
  end

  def handle_info(msg, socket) do
    Logger.debug("[InfraChannel] Unhandled message: #{inspect(msg, limit: 200)}")
    {:noreply, socket}
  end

  defp push_cached_metrics(socket) do
    # Try to read from infra_metrics_cache ETS (created by future InfraMonitor)
    try do
      case :ets.lookup(:infra_metrics_cache, :current) do
        [{:current, metrics}] ->
          Logger.info("[InfraChannel] Pushing infra_snapshot (collected_at=#{metrics[:collected_at]})")
          push(socket, "infra_snapshot", metrics)
        _ ->
          Logger.warning("[InfraChannel] No infra_metrics_cache data to push as snapshot")
          :ok
      end
    rescue
      e ->
        Logger.warning("[InfraChannel] infra_metrics_cache ETS not available: #{inspect(e)}")
        :ok
    end

    # Try exchange health cache (existing)
    try do
      health =
        :ets.tab2list(:exchange_health_cache)
        |> Enum.map(fn {exchange, data} -> Map.put(data, :exchange, exchange) end)

      if health != [] do
        Logger.info("[InfraChannel] Pushing exchange_health_snapshot (#{length(health)} exchanges)")
        push(socket, "exchange_health_snapshot", %{exchanges: health})
      else
        Logger.info("[InfraChannel] No exchange_health_cache data")
      end
    rescue
      e ->
        Logger.warning("[InfraChannel] exchange_health_cache ETS not available: #{inspect(e)}")
        :ok
    end
  end

  defp push_service_health_snapshot(socket) do
    try do
      services =
        :ets.tab2list(:service_health_cache)
        |> Enum.map(fn {_name, data} ->
          %{
            service_name: to_string(data.service_name),
            category: to_string(data.category),
            environment: to_string(data.environment),
            status: to_string(data.status),
            message: data.message,
            response_time_ms: data.response_time_ms,
            checked_at: DateTime.to_iso8601(data.checked_at)
          }
        end)

      if services != [] do
        Logger.info("[InfraChannel] Pushing service_health_snapshot (#{length(services)} services)")
        push(socket, "service_health_snapshot", %{services: services})
      else
        Logger.warning("[InfraChannel] No service_health_cache data yet for snapshot")
      end
    rescue
      e ->
        Logger.warning("[InfraChannel] service_health_cache ETS not available: #{inspect(e)}")
        :ok
    end
  end
end
