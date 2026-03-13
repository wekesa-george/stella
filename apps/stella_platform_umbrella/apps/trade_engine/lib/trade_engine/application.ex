defmodule TradeEngine.Application do
  @moduledoc """
  TradeEngine Application - Full supervision tree with Binance WebSocket infrastructure.
  
  ## Supervision Tree
  
  ```
  TradeEngine.Application
  ├── TradeEngine.PubSub (Phoenix.PubSub)
  ├── TradeEngine.Repo (Ecto)
  ├── TradeEngine.MarketData.APIThrottle
  ├── TradeEngine.Exchanges.Binance.RateLimiter
  ├── TradeEngine.Exchanges.Binance.StreamSupervisor
  │   ├── Registry (:binance_stream_registry)
  │   ├── CacheManager (ETS tables)
  │   ├── TickerStream (price updates)
  │   ├── KlineStreamPool (DynamicSupervisor)
  │   ├── DepthStreamPool (DynamicSupervisor)
  │   └── StreamCoordinator
  ├── TradeEngine.Physics.OrderFlowBridge (Phase 3)
  ├── TradeEngine.Strategy.CandleBridge (Phase 3)
  ├── TradeEngine.Orchestrator.Supervisor
  │   ├── AccountBalancePool
  │   ├── AutomatedTrader
  │   └── Monitor (optional)
  └── Trading Auto-Start Task
  ```
  """


  use Application
  require Logger

  @impl true
  def start(_type, _args) do
    Logger.info("🚀 Starting TradeEngine Application...")
    
    children = [
      # Core infrastructure
      {Phoenix.PubSub, name: TradeEngine.PubSub},
      TradeEngine.Repo,
      
      # Market data throttling
      #TradeEngine.MarketData.APIThrottle,
      
      # Binance WebSocket infrastructure (Phase 2)
      binance_children(),
      
      # Physics & Strategy bridges (Phase 3)
      #phase3_children(),
      {TradeEngine.Orchestrator.SignalTrader,[]},
      {TradeEngine.Risk.VirtualBalanceManager, []},
      TradeEngine.Strategy.CandleBridge,
      #TradeEngine.Physics.MagneticCenter,
      TradeEngine.Trading.PositionManager,
      #TradeEngine.Dashboard.TradingStats
      # Trading orchestration
      TradeEngine.Orchestrator.Supervisor,
      TradeEngine.Debug.PubSubMonitor,
      TradeEngine.Physics.PredictionTracker,
      TradeEngine.AI.Supervisor,
      # Auto-start trading (if configured)
      #auto_start_child()
      {TradeEngine.Risk.CapitalAllocator, []},
      {TradeEngine.Bots.BotSupervisor, []},
      {TradeEngine.Bots.BotRegistry, []},

      # Multi-exchange price cache (composite key store)
      {TradeEngine.Exchanges.PriceCache, []},

      # Config-driven exchange executor (credential resolution + dispatch)
      {TradeEngine.Exchanges.Executor, []},

      # Phase 2: Real-time P&L and position management
      {TradeEngine.Trading.PositionPnLManager, []},
      {TradeEngine.Trading.PositionCloseManager, []},
      {TradeEngine.Trading.StaleOrderCanceller, []},

      # Phase 2: Monitoring and observability
      {TradeEngine.Infra.Monitor, []},
      {TradeEngine.Dashboard.PlatformStatsAggregator, []},
      {TradeEngine.Exchanges.HealthMonitor, []},
      {Task.Supervisor, name: TradeEngine.TaskSupervisor},
      {TradeEngine.Infra.ServiceHealthMonitor, []},
      {TradeEngine.Bots.HeartbeatTracker, []},
      {TradeEngine.Risk.RiskMonitor, []},

      # Phase 3: Advanced risk monitors
      {TradeEngine.Risk.PlatformCircuitBreaker, []},
      {TradeEngine.Risk.PositionReconciler, []},
      {TradeEngine.Risk.SlippageMonitor, []},
      {TradeEngine.Risk.BalanceVerifier, []},
      {TradeEngine.Risk.FundingTracker, []},

      # Phase: Alert persistence, notification, and incident auto-creation
      {TradeEngine.Alerts.AlertPersister, []},
      {TradeEngine.Alerts.NotificationDispatcher, []},
      {TradeEngine.Operations.IncidentManager, []},

      # Per-bot structured logging persistence
      {TradeEngine.Bots.BotLogPersister, []},

      # Binance User Data Stream infrastructure (real-time fills + account updates)
      {Registry, keys: :unique, name: :binance_user_data_registry},
      {TradeEngine.Exchanges.Binance.UserDataStreamSupervisor, []},

      # Exchange info cache (symbol filters, precisions — refreshes every 6h)
      {TradeEngine.Exchanges.Binance.ExchangeInfoCache, []},

      # OHLCV candle persistence (ETS → TimescaleDB)
      {TradeEngine.MarketData.CandlePersister, []},

      # Backtest manager (queues → VectorBT worker → results)
      {TradeEngine.Strategies.BacktestManager, []},

      {Bandit, plug: TradeEngine.API.Router, port: String.to_integer(System.get_env("TRADE_ENGINE_API_PORT") || "4002")}
    ]
    |> List.flatten()
    |> Enum.reject(&is_nil/1)

    opts = [strategy: :one_for_one, name: TradeEngine.Supervisor]
    
    case Supervisor.start_link(children, opts) do
      {:ok, pid} ->
        log_startup_info()
        {:ok, pid}
      error ->
        Logger.error("Failed to start TradeEngine: #{inspect(error)}")
        error
    end
  end

  # ============================================================================
  # BINANCE WEBSOCKET INFRASTRUCTURE (Phase 2)
  # ============================================================================

  defp binance_children do
    if websocket_enabled?() do
      Logger.info("📡 WebSocket streams ENABLED")
      
      [
        # Rate limiter for REST API
        TradeEngine.Exchanges.Binance.RateLimiter,
        
        # Stream supervisor (manages all WebSocket connections)
        {TradeEngine.Exchanges.Binance.StreamSupervisor, [config: binance_config()]}
      ]
    else
      Logger.info("📡 WebSocket streams DISABLED")
      []
    end
  end

  defp binance_config do
    testnet = Application.get_env(:trade_engine, :binance_testnet, true)
    
    %TradeEngine.Exchanges.Binance.Config{
      api_key: System.get_env("BINANCE_API_KEY", "REDACTED"),
      api_secret: System.get_env("BINANCE_API_SECRET", "REDACTED"),
      testnet: testnet,
      base_url: if(testnet, 
        do: "https://testnet.binance.vision/api",
        else: "https://api.binance.com"
      ),
      ws_base_url: if(testnet,
        do: "wss://testnet.binance.vision/ws",
        else: "wss://stream.binance.com:9443/ws"
      )
    }
  end

  defp websocket_enabled? do
    Application.get_env(:trade_engine, :enable_websocket_streams, false)
  end

  # ============================================================================
  # PHASE 3 BRIDGES
  # ============================================================================

  defp phase3_children do
    if websocket_enabled?() and phase3_enabled?() do
      Logger.info("🌉 Phase 3 bridges ENABLED")
      
      tracked_symbols = Application.get_env(:trade_engine, :tracked_symbols, 
        ~w(BTCUSDT ETHUSDT BNBUSDT SOLUSDT XRPUSDT)
      )
      
      [
        # Order flow → Physics engine bridge
        {TradeEngine.Physics.OrderFlowBridge, [symbols: tracked_symbols]},
        
        # Candle closes → Strategy bridge
        {TradeEngine.Strategy.CandleBridge, [symbols: tracked_symbols]}
      ]
    else
      Logger.info("🌉 Phase 3 bridges DISABLED")
      []
    end
  end

  defp phase3_enabled? do
    Application.get_env(:trade_engine, :enable_phase3_bridges, false)
  end

  # ============================================================================
  # TRADING AUTO-START
  # ============================================================================

  defp auto_start_child do
    auto_long = Application.get_env(:trade_engine, :auto_start_long, false)
    auto_short = Application.get_env(:trade_engine, :auto_start_short, false)
    delay = Application.get_env(:trade_engine, :startup_delay_ms, 15_000)
    
    if auto_long or auto_short do
      Logger.info("⏱️  Auto-start scheduled in #{delay}ms (long: #{auto_long}, short: #{auto_short})")
      
      {Task.Supervisor, name: TradeEngine.TradingStarter}
      # Note: Actual auto-start logic is handled by TradingStarter module
    else
      nil
    end
  end

  # ============================================================================
  # STARTUP LOGGING
  # ============================================================================

  defp log_startup_info do
    testnet = Application.get_env(:trade_engine, :binance_testnet, true)
    ws_enabled = websocket_enabled?()
    phase3 = phase3_enabled?()
    
    Logger.info("""
    
    ═══════════════════════════════════════════════════════════════
    🎯 TradeEngine Started Successfully
    ═══════════════════════════════════════════════════════════════
    
    Mode:           #{if testnet, do: "🧪 TESTNET", else: "🔴 MAINNET"}
    WebSocket:      #{if ws_enabled, do: "✅ Enabled", else: "❌ Disabled"}
    Phase 3:        #{if phase3, do: "✅ Enabled", else: "❌ Disabled"}
    
    PubSub Topics:
      • ticker:SYMBOL     - Real-time prices
      • kline:SYMBOL:TF   - Candlestick updates
      • candle_closed:TF  - Completed candles (strategy triggers)
      • depth:SYMBOL      - Order book updates
      • order_flow:SYMBOL - Imbalance/pressure data
      • signals:SYMBOL    - Trading signals
      • physics:SYMBOL    - Physics engine updates
    
    ═══════════════════════════════════════════════════════════════
    """)
  end
end