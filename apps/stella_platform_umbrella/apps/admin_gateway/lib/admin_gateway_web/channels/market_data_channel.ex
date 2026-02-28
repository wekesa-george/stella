defmodule AdminGatewayWeb.MarketDataChannel do
  use AdminGatewayWeb, :channel

  @pubsub TradeEngine.PubSub

  @impl true
  def join("market_data:" <> topic, _params, socket) do
    # Supports both "market_data:BTCUSDT" (legacy) and "market_data:binance:BTCUSDT"
    {exchange, pair} = parse_topic(topic)

    send(self(), :after_join)

    {:ok,
     socket
     |> assign(:exchange, exchange)
     |> assign(:pair, pair)}
  end

  @impl true
  def handle_info(:after_join, socket) do
    exchange = socket.assigns.exchange
    pair = socket.assigns.pair

    # Subscribe to exchange-qualified topics (new format)
    Phoenix.PubSub.subscribe(@pubsub, "ticker:#{exchange}:#{pair}")
    Phoenix.PubSub.subscribe(@pubsub, "order_flow:#{exchange}:#{pair}")

    # Subscribe to legacy topics (backward compat)
    Phoenix.PubSub.subscribe(@pubsub, "ticker:#{pair}")
    Phoenix.PubSub.subscribe(@pubsub, "order_flow:#{pair}")
    Phoenix.PubSub.subscribe(@pubsub, "kline:#{pair}:1m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:5m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:15m")

    # Push latest cached price — try unified cache first, then legacy
    push_initial_price(socket, exchange, pair)

    {:noreply, socket}
  end

  # Ticker updates (both legacy and exchange-qualified)
  def handle_info({:ticker_update, %{symbol: symbol, price: price} = data}, socket) do
    push(socket, "ticker_update", %{
      exchange: Map.get(data, :exchange, socket.assigns.exchange),
      symbol: symbol,
      price: to_string(price)
    })

    {:noreply, socket}
  end

  # Full ticker data from stream
  def handle_info({:ticker_data, data}, socket) do
    push(socket, "ticker_data", data)
    {:noreply, socket}
  end

  # Order flow updates
  def handle_info({:order_flow_update, data}, socket) do
    push(socket, "order_flow_update", serialize_order_flow(data))
    {:noreply, socket}
  end

  # Candle closed events
  def handle_info({:candle_closed, candle}, socket) do
    if Map.get(candle, :symbol) == socket.assigns.pair do
      push(socket, "candle_closed", serialize_candle(candle))
    end

    {:noreply, socket}
  end

  # Kline updates
  def handle_info({:kline_update, data}, socket) do
    push(socket, "kline_update", data)
    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  # ============================================================================
  # HELPERS
  # ============================================================================

  # "binance:BTCUSDT" -> {"binance", "BTCUSDT"}
  # "BTCUSDT" -> {"binance", "BTCUSDT"} (default to binance)
  defp parse_topic(topic) do
    case String.split(topic, ":", parts: 2) do
      [exchange, pair] when byte_size(pair) > 0 -> {exchange, pair}
      [pair] -> {"binance", pair}
    end
  end

  defp push_initial_price(socket, exchange, pair) do
    price =
      case TradeEngine.Exchanges.PriceCache.get(exchange, pair) do
        {:ok, p} -> p
        _ ->
          case :ets.lookup(:binance_price_cache, pair) do
            [{^pair, p, _ts}] -> p
            [{^pair, p}] -> p
            _ -> nil
          end
      end

    if price do
      push(socket, "ticker_update", %{
        exchange: exchange,
        symbol: pair,
        price: to_string(price)
      })
    end
  rescue
    _ -> :ok
  end

  defp serialize_order_flow(data) do
    %{
      symbol: Map.get(data, :symbol),
      exchange: Map.get(data, :exchange, "binance"),
      buy_volume: Map.get(data, :buy_volume, 0) |> to_string(),
      sell_volume: Map.get(data, :sell_volume, 0) |> to_string(),
      imbalance: Map.get(data, :imbalance, 0),
      pressure: Map.get(data, :pressure, "neutral")
    }
  end

  defp serialize_candle(candle) do
    %{
      symbol: Map.get(candle, :symbol),
      exchange: Map.get(candle, :exchange, "binance"),
      timeframe: Map.get(candle, :timeframe),
      open: Map.get(candle, :open) |> to_string(),
      high: Map.get(candle, :high) |> to_string(),
      low: Map.get(candle, :low) |> to_string(),
      close: Map.get(candle, :close) |> to_string(),
      volume: Map.get(candle, :volume) |> to_string(),
      closed_at: Map.get(candle, :closed_at)
    }
  end
end
