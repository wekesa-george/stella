defmodule AdminGatewayWeb.PositionChannel do
  use AdminGatewayWeb, :channel

  @pubsub TradeEngine.PubSub

  @impl true
  def join("positions:lobby", _params, socket) do
    send(self(), :after_join)
    {:ok, socket}
  end

  def join("positions:" <> bot_id, _params, socket) do
    send(self(), :after_join)
    {:ok, assign(socket, :bot_id, bot_id)}
  end

  @impl true
  def handle_info(:after_join, socket) do
    Phoenix.PubSub.subscribe(@pubsub, "positions:updates")
    Phoenix.PubSub.subscribe(@pubsub, "positions:pnl_update")
    Phoenix.PubSub.subscribe(@pubsub, "trading:positions")

    if bot_id = socket.assigns[:bot_id] do
      Phoenix.PubSub.subscribe(@pubsub, "positions:bot:#{bot_id}")
    end

    {:noreply, socket}
  end

  # PubSub: bulk position stats update (from PositionManager)
  def handle_info({:positions_updated, stats}, socket) do
    push(socket, "positions_stats", stats)
    {:noreply, socket}
  end

  # PubSub: individual position P&L update
  def handle_info({:position_pnl, position_id, pnl_data}, socket) do
    push(socket, "position_pnl_update", Map.put(pnl_data, :position_id, position_id))
    {:noreply, socket}
  end

  # PubSub: batch P&L updates (from future PositionPnLManager)
  def handle_info({:pnl_batch_update, updates}, socket) do
    push(socket, "pnl_batch_update", %{positions: updates})
    {:noreply, socket}
  end

  # PubSub: position opened
  def handle_info({:position_opened, position}, socket) do
    push(socket, "position_opened", serialize_position(position))
    {:noreply, socket}
  end

  # PubSub: position closed
  def handle_info({:position_closed, position}, socket) do
    push(socket, "position_closed", serialize_position(position))
    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  # Inbound: request manual position close
  @impl true
  def handle_in("close_position", %{"position_id" => position_id}, socket) do
    case TradeEngine.Trading.PositionManager.force_update() do
      _ -> {:reply, {:ok, %{position_id: position_id, status: "close_requested"}}, socket}
    end
  end

  defp serialize_position(position) when is_struct(position) do
    %{
      id: position.id,
      bot_id: Map.get(position, :bot_id),
      symbol: position.symbol,
      side: position.side,
      entry_price: to_string(position.entry_price),
      current_price: Map.get(position, :current_price) |> to_string(),
      quantity: to_string(position.quantity),
      unrealized_pnl: Map.get(position, :unrealized_pnl, 0) |> to_string(),
      status: position.status,
      opened_at: position.inserted_at
    }
  end

  defp serialize_position(position) when is_map(position) do
    %{
      id: Map.get(position, :id),
      bot_id: Map.get(position, :bot_id),
      symbol: Map.get(position, :symbol),
      side: Map.get(position, :side),
      entry_price: Map.get(position, :entry_price) |> to_string(),
      quantity: Map.get(position, :quantity) |> to_string(),
      unrealized_pnl: Map.get(position, :unrealized_pnl, 0) |> to_string(),
      status: Map.get(position, :status)
    }
  end
end
