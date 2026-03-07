defmodule AdminGatewayWeb.OrderChannel do
  use AdminGatewayWeb, :channel

  @pubsub TradeEngine.PubSub

  @impl true
  def join("orders:lobby", _params, socket) do
    send(self(), :after_join)
    {:ok, socket}
  end

  def join("orders:" <> bot_id, _params, socket) do
    send(self(), :after_join)
    {:ok, assign(socket, :bot_id, bot_id)}
  end

  @impl true
  def handle_info(:after_join, socket) do
    Phoenix.PubSub.subscribe(@pubsub, "orders:updates")

    if bot_id = socket.assigns[:bot_id] do
      Phoenix.PubSub.subscribe(@pubsub, "orders:bot:#{bot_id}")
    end

    {:noreply, socket}
  end

  def handle_info({:order_created, order}, socket) do
    push(socket, "order_created", serialize_order(order))
    {:noreply, socket}
  end

  def handle_info({:order_filled, order}, socket) do
    push(socket, "order_filled", serialize_order(order))
    {:noreply, socket}
  end

  def handle_info({:order_cancelled, order}, socket) do
    push(socket, "order_cancelled", serialize_order(order))
    {:noreply, socket}
  end

  def handle_info({:order_failed, order_id, reason}, socket) do
    push(socket, "order_failed", %{order_id: order_id, reason: to_string(reason)})
    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  @impl true
  def handle_in("cancel_order", %{"order_id" => order_id}, socket) do
    # Delegate to trade engine order cancellation
    {:reply, {:ok, %{order_id: order_id, status: "cancel_requested"}}, socket}
  end

  defp serialize_order(order) when is_struct(order) do
    %{
      id: order.id,
      bot_id: Map.get(order, :bot_id),
      user_id: Map.get(order, :user_id),
      symbol: order.symbol,
      side: order.side,
      order_type: Map.get(order, :order_type, "market"),
      price: Map.get(order, :price) |> to_string(),
      execution_price: Map.get(order, :execution_price) |> to_string(),
      quantity: Map.get(order, :quantity) |> to_string(),
      filled_quantity: Map.get(order, :filled_quantity, 0) |> to_string(),
      status: order.status,
      exchange_order_id: Map.get(order, :exchange_order_id),
      created_at: Map.get(order, :created_at) || Map.get(order, :inserted_at)
    }
  end

  defp serialize_order(order) when is_map(order) do
    %{
      id: Map.get(order, :id),
      bot_id: Map.get(order, :bot_id),
      user_id: Map.get(order, :user_id),
      symbol: Map.get(order, :symbol),
      side: Map.get(order, :side),
      order_type: Map.get(order, :order_type, "market"),
      price: Map.get(order, :price) |> to_string(),
      execution_price: Map.get(order, :execution_price) |> to_string(),
      quantity: Map.get(order, :quantity) |> to_string(),
      filled_quantity: Map.get(order, :filled_quantity, 0) |> to_string(),
      status: Map.get(order, :status),
      exchange_order_id: Map.get(order, :exchange_order_id),
      created_at: Map.get(order, :created_at)
    }
  end
end
