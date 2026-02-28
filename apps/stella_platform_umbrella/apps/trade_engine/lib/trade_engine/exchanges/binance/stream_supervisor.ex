defmodule TradeEngine.Exchanges.Binance.StreamSupervisor do
  @moduledoc """
  Supervisor for all Binance WebSocket streams.
  
  Starts and manages:
  - TickerStream - Real-time prices for all tracked symbols
  - KlineStream - Candlestick data for strategy analysis
  - DepthStream - Order book depth for order flow analysis
  
  ## Architecture
  
  ```
  StreamSupervisor
  ├── Registry (:binance_stream_registry)
  ├── CacheManager (ETS tables)
  ├── TickerStream (real-time prices)
  ├── KlineStream (candlestick data)
  ├── DepthStream (order book)
  └── StreamCoordinator (manages subscriptions)
  ```
  """

  use Supervisor
  require Logger

  alias TradeEngine.Exchanges.Binance.{
    Config,
    CacheManager,
    TickerStream,
    KlineStream,
    DepthStream,
    StreamCoordinator
  }

  @registry :binance_stream_registry

  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Get the current configuration.
  """
  def get_config do
    case :ets.lookup(:binance_stream_config, :config) do
      [{:config, config}] -> config
      [] -> Config.from_env()
    end
  rescue
    _ -> Config.from_env()
  end

  @doc """
  Get status of all streams.
  """
  def status do
    %{
      ticker_stream: get_process_status(TickerStream),
      kline_stream: get_process_status(KlineStream),
      depth_stream: get_process_status(DepthStream),
      coordinator: get_process_status(StreamCoordinator),
      registry_size: safe_registry_count()
    }
  end

  @impl true
  def init(opts) do
    config = Keyword.get(opts, :config) || Config.from_env()
    symbols = get_tracked_symbols()
    timeframes = get_strategy_timeframes()
    
    # Store config in ETS
    init_config_store(config)
    
    Logger.info("""
    
    🚀 Starting Binance Stream Infrastructure
    ═══════════════════════════════════════════
    Symbols: #{length(symbols)} (#{Enum.take(symbols, 5) |> Enum.join(", ")}...)
    Timeframes: #{Enum.join(timeframes, ", ")}
    Mode: #{if config.testnet, do: "TESTNET", else: "MAINNET"}
    ═══════════════════════════════════════════
    """)

    children = [
      # Registry for tracking streams
      #{Registry, keys: :unique, name: @registry},
      {Registry, keys: :unique, name: TradeEngine.StreamRegistry},
      
      # Cache manager for ETS tables
      {CacheManager, []},
      
      # Real-time ticker prices
      {TickerStream, config: config, symbols: symbols},
      
      # Candlestick data
      {KlineStream, config: config, symbols: symbols, timeframes: timeframes},
      
      # Order book depth
      {DepthStream, config: config, symbols: symbols, tier: :tier2},
      
      # Stream coordinator
      {StreamCoordinator, config: config}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  # ============================================================================
  # PRIVATE
  # ============================================================================

  defp init_config_store(config) do
    try do
      :ets.new(:binance_stream_config, [:named_table, :public, :set])
    rescue
      ArgumentError -> :ok  # Already exists
    end
    :ets.insert(:binance_stream_config, {:config, config})
  end

  defp get_tracked_symbols do
    Application.get_env(:trade_engine, :tracked_symbols, ~w(BTCUSDT ETHUSDT BNBUSDT SOLUSDT))
  end

  defp get_strategy_timeframes do
    Application.get_env(:trade_engine, :strategy_timeframes, ~w(5m 15m 1h 4h))
  end

  defp get_process_status(module) do
    case Process.whereis(module) do
      nil -> :not_running
      pid -> if Process.alive?(pid), do: :running, else: :dead
    end
  end

  defp safe_registry_count do
    case Registry.count(@registry) do
      count when is_integer(count) -> count
      _ -> 0
    end
  rescue
    _ -> 0
  end
end