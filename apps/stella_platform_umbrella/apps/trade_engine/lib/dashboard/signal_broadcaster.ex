defmodule TradeEngine.Dashboard.SignalBroadcaster do
  @moduledoc """
  🔌 SIGNAL BROADCASTER - Bridges Binance WebSocket streams to Dashboard PubSub
  
  This module ensures all signal and market data from the Binance infrastructure
  is properly broadcast to the Phoenix PubSub for LiveView consumption.
  
  Subscribes to:
  - CandleBridge signals (candle close triggers)
  - OrderFlowBridge updates (depth stream analysis)
  - TickerStream updates (price ticks)
  
  Broadcasts to:
  - "signals:all" - All trading signals
  - "ticker:all" - All price updates  
  - "order_flow:all" - Order flow metrics
  - "signals:{symbol}" - Per-symbol signals
  - "ticker:{symbol}" - Per-symbol prices
  """

  use GenServer
  require Logger

  @pubsub TradeEngine.PubSub

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Broadcast a trading signal to all subscribers"
  def broadcast_signal(signal) do
    Phoenix.PubSub.broadcast(@pubsub, "signals:all", {:signal, signal})
    Phoenix.PubSub.broadcast(@pubsub, "signals:#{signal.symbol}", {:signal, signal})
  end

  @doc "Broadcast a ticker update"
  def broadcast_ticker(symbol, price) do
    Phoenix.PubSub.broadcast(@pubsub, "ticker:all", {:ticker_update, %{symbol: symbol, price: price}})
    Phoenix.PubSub.broadcast(@pubsub, "ticker:#{symbol}", {:ticker_update, %{symbol: symbol, price: price}})
  end

  @doc "Broadcast order flow data"
  def broadcast_order_flow(symbol, data) do
    Phoenix.PubSub.broadcast(@pubsub, "order_flow:all", {:order_flow_update, Map.put(data, :symbol, symbol)})
    Phoenix.PubSub.broadcast(@pubsub, "order_flow:#{symbol}", {:order_flow_update, data})
  end

  @doc "Broadcast physics analysis update"
  def broadcast_physics(payload) do
    Phoenix.PubSub.broadcast(@pubsub, "market_data:updates", {:physics_update, payload})
  end

  @doc "Get broadcast statistics"
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    Logger.info("📡 SignalBroadcaster started - bridging streams to PubSub")
    
    state = %{
      signals_broadcast: 0,
      tickers_broadcast: 0,
      order_flow_broadcast: 0,
      physics_broadcast: 0,
      started_at: DateTime.utc_now()
    }
    
    {:ok, state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply, state, state}
  end

  @impl true
  def handle_cast({:signal, signal}, state) do
    broadcast_signal(signal)
    {:noreply, %{state | signals_broadcast: state.signals_broadcast + 1}}
  end

  @impl true
  def handle_cast({:ticker, symbol, price}, state) do
    broadcast_ticker(symbol, price)
    {:noreply, %{state | tickers_broadcast: state.tickers_broadcast + 1}}
  end

  @impl true
  def handle_cast({:order_flow, symbol, data}, state) do
    broadcast_order_flow(symbol, data)
    {:noreply, %{state | order_flow_broadcast: state.order_flow_broadcast + 1}}
  end

  @impl true
  def handle_cast({:physics, payload}, state) do
    broadcast_physics(payload)
    {:noreply, %{state | physics_broadcast: state.physics_broadcast + 1}}
  end
end