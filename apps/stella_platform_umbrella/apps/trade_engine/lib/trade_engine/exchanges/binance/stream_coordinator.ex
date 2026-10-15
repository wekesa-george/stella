defmodule TradeEngine.Exchanges.Binance.StreamCoordinator do
  @moduledoc """
  Coordinates WebSocket stream allocation.
  Simplified version that uses configured symbols.
  """

  use GenServer
  require Logger

  @health_check_interval 60_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def add_kline(symbol, timeframe) do
    GenServer.call(__MODULE__, {:add_kline, symbol, timeframe})
  end

  def add_depth(symbol, tier \\ :tier2) do
    GenServer.call(__MODULE__, {:add_depth, symbol, tier})
  end

  def status do
    GenServer.call(__MODULE__, :status)
  end

  def tracked_symbols do
    GenServer.call(__MODULE__, :tracked_symbols)
  end

  @impl true
  def init(opts) do
    config = Keyword.get(opts, :config)
    symbols = Application.get_env(:trade_engine, :tracked_symbols, ~w(BTCUSDT ETHUSDT BNBUSDT SOLUSDT))
    
    state = %{
      config: config,
      symbols: symbols,
      initialized: true
    }
    
    Logger.info("📊 StreamCoordinator started with #{length(symbols)} symbols: #{inspect(symbols)}")
    
    schedule_health_check()
    {:ok, state}
  end

  @impl true
  def handle_call({:add_kline, symbol, timeframe}, _from, state) do
    Logger.info("📈 Add kline request: #{symbol}@#{timeframe}")
    {:reply, {:ok, :noted}, state}
  end

  def handle_call({:add_depth, symbol, _tier}, _from, state) do
    Logger.info("📊 Add depth request: #{symbol}")
    {:reply, {:ok, :noted}, state}
  end

  def handle_call(:status, _from, state) do
    status = %{
      initialized: state.initialized,
      symbol_count: length(state.symbols),
      symbols: state.symbols
    }
    {:reply, status, state}
  end

  def handle_call(:tracked_symbols, _from, state) do
    {:reply, state.symbols, state}
  end

  @impl true
  def handle_info(:health_check, state) do
    schedule_health_check()
    {:noreply, state}
  end

  defp schedule_health_check do
    Process.send_after(self(), :health_check, @health_check_interval)
  end
end
