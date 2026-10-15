defmodule AdminGatewayWeb.PlatformChannel do
  use AdminGatewayWeb, :channel

  @pubsub TradeEngine.PubSub

  @impl true
  def join("platform:stats", _params, socket) do
    send(self(), :after_join)
    {:ok, socket}
  end

  @impl true
  def handle_info(:after_join, socket) do
    Phoenix.PubSub.subscribe(@pubsub, "platform:stats_update")
    Phoenix.PubSub.subscribe(@pubsub, "trading:stats")
    Phoenix.PubSub.subscribe(@pubsub, "physics:stats")

    # Push cached platform stats if available
    try do
      case :ets.lookup(:platform_stats_cache, :current) do
        [{:current, stats}] -> push(socket, "platform_snapshot", stats)
        _ -> :ok
      end
    rescue
      _ -> :ok
    end

    {:noreply, socket}
  end

  # Platform-wide stats update (from future PlatformStatsAggregator)
  def handle_info({:platform_stats_update, stats}, socket) do
    push(socket, "platform_stats_update", stats)
    {:noreply, socket}
  end

  # Trading stats from existing orchestrators
  def handle_info({:stats_update, stats}, socket) do
    push(socket, "trading_stats_update", stats)
    {:noreply, socket}
  end

  # Physics engine stats
  def handle_info({:stats, stats}, socket) do
    push(socket, "physics_stats_update", stats)
    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}
end
