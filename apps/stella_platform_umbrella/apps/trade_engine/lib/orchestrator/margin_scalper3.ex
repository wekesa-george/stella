defmodule TradeEngine.Orchestrator.MarginScalper3 do
  @moduledoc """
  ⚡ MARGIN SCALPER v16.0 - HIGH-VELOCITY VOLATILITY HARVESTER
  
  ═══════════════════════════════════════════════════════════════════════════════
  🌊 OCEAN SWEEP + 🔄 RELAX WINDOW + ⏰ TIME HORIZON + 🧠 AI + 🌀 COILED SPRING
  ═══════════════════════════════════════════════════════════════════════════════
  
  PHILOSOPHY SHIFT (Polymarket Whale Adaptation):
  ─────────────────────────────────────────────────────────────────────────────
  The Polymarket whale turned $313 → $438,000 in one month with 98% win rate
  across 6,615 trades. Key insight: EXPLOIT LAG between momentum and price.
  
  OLD: Predict direction in efficient markets (BTC/ETH) → Low edge
  NEW: Harvest volatility in inefficient markets (PEPE/WIF) → High edge
  
  KEY PRINCIPLES:
  1. INEFFICIENCY > PREDICTION - Trade where pricing is broken
  2. VELOCITY > MAGNITUDE - 10 trades @ 1% beats 1 trade @ 10%
  3. COILED SPRING - High momentum + low velocity = snap-move incoming
  4. SNOWBALL EFFECT - Compound every 5 min, not 30 min
  
  ═══════════════════════════════════════════════════════════════════════════════
  """

  use GenServer
  require Logger

  alias TradeEngine.Risk.VirtualBalanceManager
  alias TradeEngine.Analytics.HFTPerformance
  alias TradeEngine.AI.{Brain, Bridge, FeatureExtractor}
  @pubsub TradeEngine.PubSub

  # ═══════════════════════════════════════════════════════════════════════════════
  # 📝 FILE LOGGING CONFIGURATION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @enable_file_logging true
  @log_directory "/var/www/umbrella_app/trade_logs"
  @log_trades true
  @log_ai_decisions true
  @log_rejections true
  @log_hourly_summary true

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🔄 RELAX WINDOW CONFIGURATION - FASTER FOR MEME COINS
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @enable_relax_window true
  @relax_min_seconds 3           # FASTER: Meme coins move fast
  @relax_max_seconds 20          # FASTER: Don't wait too long
  @relax_confirm_signals 2       # FASTER: Fewer signals needed
  @relax_confirm_ratio 0.6
  @relax_min_confidence 55       # LOWER: Accept noisier signals
  @peak_energy_threshold 0.75    # LOWER: Catch reversals earlier
  @trough_energy_threshold 0.25  # HIGHER: Catch reversals earlier
  @relax_min_profit_to_flip 0.0

  # ═══════════════════════════════════════════════════════════════════════════════
  # LEVERAGE & MARGIN CONFIGURATION - HIGHER BASE FOR VELOCITY
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @default_leverage 4            # INCREASED: Higher base
  @max_leverage 10
  @margin_mode :isolated

  # ═══════════════════════════════════════════════════════════════════════════════
  # 1️⃣ GRAVITY NET ENTRY (Limit Orders Only) - TIGHTER FOR FAST FILLS
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @use_limit_orders true
  @limit_order_depth 0.3         # TIGHTER: Faster fills
  @limit_order_timeout_ms 15_000 # FASTER: Don't wait too long
  @maker_fee_pct 0.0002
  @taker_fee_pct 0.0004
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 2️⃣ STEEL NET FILTER (Quality Control) - SAFETY PRESERVED
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @min_confidence_long 60        # LOWER: Accept more on inefficient assets
  @min_confidence_short 60
  @min_projected_move_pct 0.001  # LOWER: Smaller moves are fine
  @min_energy_level :low         # LOWER: Trade more frequently
  @fee_floor_multiplier 2.5      # LOWER: Tighter for faster exits
  @use_ai_brain true
  @ai_min_confidence 0.60        # LOWER: AI doesn't need to be as certain

  # ═══════════════════════════════════════════════════════════════════════════════
  # 3️⃣ ASSET WHITELIST - INEFFICIENCY FOCUS (Polymarket Philosophy)
  # ═══════════════════════════════════════════════════════════════════════════════
  # 
  # 🎯 PRIORITY: HIGH-VOLATILITY "INEFFICIENT" ASSETS
  # These have wider spreads, less arbitrage, more retail flow = MORE EDGE
  # 
  # 🚫 BLOCKED: BTC/ETH/BNB have tight spreads, institutional arb = NO EDGE
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @priority_assets ~w(
    PEPEUSDT 1000PEPEUSDT WIFUSDT BONKUSDT FLOKIUSDT MEMEUSDT
    SHIBUSDT 1000SHIBUSDT PEOPLEUSDT DOGEUSDT
    SUIUSDT SEIUSDT TIAUSDT ARBUSDT OPUSDT
  )
  
  @blocked_assets ~w(BTCUSDT ETHUSDT BNBUSDT)
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 4️⃣ PHYSICS TRAJECTORY EXIT - VELOCITY FOCUS
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @use_physics_exits true
  @max_hold_minutes 15           # SHORTER: Capture and release fast
  @fallback_stop_loss_pct 0.006  # TIGHTER: Cut losses faster
  @fallback_take_profit_pct 0.010 # TIGHTER: Take profits faster
  
  # ⏰ Time horizon filter - FASTER for velocity strategy
  @min_time_to_target_minutes 2  # LOWER: Accept faster moves
  @max_time_to_target_minutes 30 # LOWER: Don't wait for slow setups
  
  # 🎯 TIER-SPECIFIC MAX HOLD - Ultra-fast on memes
  @tier_max_hold %{
    tier1: 5,    # Ultra-volatile (Memes): 5 mins - IN AND OUT
    tier2: 8,    # High-volatile: 8 mins
    tier3: 12,   # Mid-volatile: 12 mins
    tier4: 0     # Blocked - never trade
  }

  # ═══════════════════════════════════════════════════════════════════════════════
  # 5️⃣ FEE-AWARE TRAILING STOP - TIGHTER FOR VELOCITY
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @trailing_activation_fee_multiple 2.0  # LOWER: Activate earlier
  @trailing_stop_distance_pct 0.002      # TIGHTER: Lock gains faster
  @trailing_ratchet_pct 0.0008           # TIGHTER: Ratchet up faster
  @trailing_stop_distance 0.15           # TIGHTER
  @stop_loss_pct 0.006                   # TIGHTER: Cut losses fast
  @take_profit_pct 0.012                 # TIGHTER: Take profits fast
  @volatility_buffer_pct 0.05
  @max_daily_drawdown_pct 5.0            # ⚠️ SAFETY PRESERVED
  @max_consecutive_losses 8              # ⚠️ SAFETY PRESERVED

  # ═══════════════════════════════════════════════════════════════════════════════
  # POSITION SIZING - MORE POSITIONS, SMALLER SIZE
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @max_positions 12              # INCREASED: More positions = velocity
  @base_position_pct 0.02        # SMALLER: Per-position risk
  @max_position_pct 0.03
  @max_loss_per_trade_pct 0.004  # TIGHTER: Risk management
  @max_loss_per_trade_usd 4.0
  
  # 🎯 TIER-SPECIFIC LEVERAGE - Higher on inefficient assets
  @leverage_tiers %{
    # Tier 1: Memes - HIGH leverage, SHORT duration
    "PEPEUSDT" => 6, "1000PEPEUSDT" => 6, "WIFUSDT" => 6, "BONKUSDT" => 6,
    "FLOKIUSDT" => 5, "MEMEUSDT" => 5, "SHIBUSDT" => 5, "1000SHIBUSDT" => 5,
    # Tier 2: High-vol alts
    "DOGEUSDT" => 5, "SUIUSDT" => 5, "SEIUSDT" => 5, "TIAUSDT" => 5,
    "ARBUSDT" => 5, "OPUSDT" => 5, "PEOPLEUSDT" => 5,
    # Tier 3: Mid-vol
    "SOLUSDT" => 4, "NEARUSDT" => 4, "APTUSDT" => 4, "INJUSDT" => 4,
    "XRPUSDT" => 4, "ADAUSDT" => 4, "LINKUSDT" => 4
  }

  @use_prime_scaling true
  
  # 📊 PRIME ALLOCATION - Up to 12 positions
  @prime_allocation %{
    1 => %{prime: 83, pct: 0.083},
    2 => %{prime: 89, pct: 0.089},
    3 => %{prime: 97, pct: 0.097},
    4 => %{prime: 101, pct: 0.101},
    5 => %{prime: 103, pct: 0.103},
    6 => %{prime: 107, pct: 0.107},
    7 => %{prime: 109, pct: 0.109},
    8 => %{prime: 113, pct: 0.113},
    9 => %{prime: 127, pct: 0.127},
    10 => %{prime: 131, pct: 0.131},
    11 => %{prime: 137, pct: 0.137},
    12 => %{prime: 139, pct: 0.139}
  }
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 🎯 TIER-SPECIFIC TAKE PROFIT - SPREAD CAPTURE (Polymarket Core Strategy)
  # ═══════════════════════════════════════════════════════════════════════════════
  # KEY INSIGHT: Smaller, faster profits compound better than waiting for big moves
  
  @tier_take_profit %{
    tier1: 0.008,   # 0.8% - Ultra-fast capture on memes
    tier2: 0.010,   # 1.0% - Fast capture on high-vol
    tier3: 0.012,   # 1.2% - Standard capture on mid-vol
    tier4: 0.015    # Never used (blocked)
  }
  
  @tier_stop_loss %{
    tier1: 0.010,   # 1.0% - Tight stop on memes (wider than TP for asymmetry)
    tier2: 0.008,   # 0.8% 
    tier3: 0.006,   # 0.6%
    tier4: 0.005    # Never used
  }
  
  @tier_leverage_map %{
    tier1: 6,       # Higher leverage on memes (short duration)
    tier2: 5,       # High leverage on high-vol
    tier3: 4,       # Standard on mid-vol
    tier4: 3        # Never used
  }
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 💰 PROFIT PROTECTION & COMPOUNDING - SNOWBALL EFFECT
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @session_profit_lock_pct 0.3          # LOWER: Keep more in play
  @daily_target_usd 100.0               # HIGHER: More aggressive
  @compound_interval_minutes 5          # 🔑 CRITICAL: 5 min (was 30)
  @daily_close_hour 23
  @daily_close_minute 45
  @daily_resume_hour 0
  @daily_resume_minute 15
  @liquidation_buffer 0.85              # TIGHTER: More margin efficiency

  @futures_testnet_url "https://testnet.binancefuture.com"

  # ═══════════════════════════════════════════════════════════════════════════════
  # VOLATILITY TIERS - REORDERED FOR INEFFICIENCY FOCUS
  # ═══════════════════════════════════════════════════════════════════════════════

  # 🎯 TIER 1: ULTRA-VOLATILE MEMES - PRIMARY HUNTING GROUND
  @tier1_ultra_volatile ~w(PEPEUSDT SHIBUSDT FLOKIUSDT BONKUSDT LUNCUSDT 1000PEPEUSDT 
                           1000SHIBUSDT 1000FLOKIUSDT 1000BONKUSDT 1000LUNCUSDT 
                           BTTCUSDT HOTUSDT WIFUSDT MEMEUSDT PEOPLEUSDT)

  # 🎯 TIER 2: HIGH-VOLATILE ALTS - SECONDARY HUNTING GROUND
  @tier2_high_volatile ~w(DOGEUSDT XRPUSDT ADAUSDT TRXUSDT VETUSDT ALGOUSDT XLMUSDT 
                          ICPUSDT FILUSDT GALAUSDT SANDUSDT MANAUSDT APEUSDT CRVUSDT 
                          LDOUSDT ARBUSDT OPUSDT SUIUSDT SEIUSDT TIAUSDT)

  # ⚠️ TIER 3: MID-VOLATILE - LOWER PRIORITY
  @tier3_medium_volatile ~w(SOLUSDT LINKUSDT AVAXUSDT DOTUSDT ATOMUSDT NEARUSDT APTUSDT 
                            INJUSDT UNIUSDT AAVEUSDT MKRUSDT LTCUSDT BCHUSDT ETCUSDT RUNEUSDT)

  # 🚫 TIER 4: LOW-VOLATILE EFFICIENT - BLOCKED (No edge here)
  @tier4_low_volatile ~w(BTCUSDT ETHUSDT BNBUSDT)

  @tradeable_assets @tier1_ultra_volatile ++ @tier2_high_volatile ++ @tier3_medium_volatile

  @min_profit_target 0.30        # LOWER: Accept smaller wins
  @ideal_profit_target 1.00      # LOWER: Don't wait for big wins

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🌀 COILED SPRING DETECTION - NEW PHYSICS ENHANCEMENT
  # ═══════════════════════════════════════════════════════════════════════════════
  # 
  # KEY INSIGHT FROM POLYMARKET WHALE:
  # Trade when momentum CONFIRMS direction but price HASN'T MOVED YET.
  # 
  # High momentum + Low velocity = Energy building up for snap-move
  # Like a coiled spring ready to release
  # 
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @coiled_spring_enabled true
  @coiled_spring_momentum_min 0.25      # Minimum momentum building
  @coiled_spring_velocity_max 0.15      # Price not moving yet
  @coiled_spring_confidence_boost 15    # Boost confidence when detected

  # ═══════════════════════════════════════════════════════════════════════════════
  # 📝 FILE LOGGING FUNCTIONS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp ensure_log_directory do
    File.mkdir_p!(@log_directory)
  end

  defp get_log_file_path do
    date = Date.utc_today() |> Date.to_string()
    Path.join(@log_directory, "trades_#{date}.log")
  end

  defp get_csv_file_path do
    date = Date.utc_today() |> Date.to_string()
    Path.join(@log_directory, "trades_#{date}.csv")
  end

  defp log_to_file(event_type, data) when @enable_file_logging do
    ensure_log_directory()
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()
    
    log_entry = %{
      timestamp: timestamp,
      event: event_type,
      data: data
    }
    
    line = Jason.encode!(log_entry) <> "\n"
    File.write!(get_log_file_path(), line, [:append])
  rescue
    _ -> :ok
  end
  defp log_to_file(_, _), do: :ok

  defp log_trade_open(position) when @log_trades do
    log_to_file("TRADE_OPEN", %{
      id: position.id,
      symbol: position.symbol,
      direction: position.direction,
      entry_price: position.entry_price,
      quantity: position.quantity,
      leverage: position.leverage,
      margin: position.margin,
      notional: position.notional,
      stop_loss: position.stop_loss,
      take_profit: position.take_profit,
      confidence: position.confidence,
      coiled_spring: Map.get(position, :coiled_spring, false),
      latency_us: position.entry_latency_us
    })
    append_trade_csv(:open, position)
  end
  defp log_trade_open(_), do: :ok

  defp log_trade_close(trade_record) when @log_trades do
    log_to_file("TRADE_CLOSE", %{
      id: trade_record.id,
      symbol: trade_record.symbol,
      direction: trade_record.direction,
      entry_price: trade_record.entry_price,
      exit_price: trade_record.exit_price,
      quantity: trade_record.quantity,
      leverage: trade_record.leverage,
      pnl: trade_record.pnl,
      pnl_pct: trade_record.pnl_pct,
      exit_reason: trade_record.exit_reason,
      hold_time_seconds: trade_record.hold_time,
      total_fees: trade_record.total_fees,
      slippage: trade_record.total_slippage
    })
    append_trade_csv(:close, trade_record)
  end
  defp log_trade_close(_), do: :ok

  defp log_ai_decision(symbol, signal_direction, ai_action, ai_conf, decision) when @log_ai_decisions do
    log_to_file("AI_DECISION", %{
      symbol: symbol,
      signal_direction: signal_direction,
      ai_direction: ai_action,
      ai_confidence: ai_conf,
      decision: decision,
      override: signal_direction != ai_action
    })
  end
  defp log_ai_decision(_, _, _, _, _), do: :ok

  defp log_rejection(symbol, direction, reason, details \\ %{}) when @log_rejections do
    log_to_file("REJECTED", %{
      symbol: symbol,
      direction: direction,
      reason: reason,
      details: details
    })
  end
  defp log_rejection(_, _, _, _), do: :ok

  defp log_coiled_spring(symbol, momentum, velocity, boost) do
    log_to_file("COILED_SPRING", %{
      symbol: symbol,
      momentum: momentum,
      velocity: velocity,
      confidence_boost: boost
    })
  end

  defp log_hourly_summary(state) when @log_hourly_summary do
    uptime = if state.started_at, do: DateTime.diff(DateTime.utc_now(), state.started_at), else: 0
    total_closed = state.winning_trades + state.losing_trades
    win_rate = if total_closed > 0, do: state.winning_trades / total_closed * 100.0, else: 0.0
    
    log_to_file("HOURLY_SUMMARY", %{
      uptime_seconds: uptime,
      total_trades: state.total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades,
      win_rate: Float.round(win_rate * 1.0, 2),
      total_pnl: Float.round(state.total_pnl * 1.0, 4),
      total_fees: Float.round(state.total_fees * 1.0, 4),
      time_horizon_filtered: state.time_horizon_filtered,
      ai_direction_overrides: Map.get(state, :ai_direction_overrides, 0),
      coiled_spring_trades: Map.get(state, :coiled_spring_trades, 0),
      compound_count: state.compound_count,
      signals_received: state.signals_received,
      signals_traded: state.signals_traded,
      signals_filtered: state.signals_filtered,
      open_positions: map_size(state.positions),
      balance: Float.round(state.margin_balance * 1.0, 2)
    })
  end
  defp log_hourly_summary(_), do: :ok

  defp append_trade_csv(:open, position) do
    ensure_log_directory()
    csv_path = get_csv_file_path()
    
    unless File.exists?(csv_path) do
      header = "timestamp,event,id,symbol,direction,entry_price,exit_price,quantity,leverage,margin,pnl,pnl_pct,exit_reason,hold_time,fees,slippage,confidence,latency_us,coiled_spring\n"
      File.write!(csv_path, header)
    end
    
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()
    coiled = if Map.get(position, :coiled_spring, false), do: "true", else: "false"
    line = "#{timestamp},OPEN,#{position.id},#{position.symbol},#{position.direction},#{position.entry_price},,#{position.quantity},#{position.leverage},#{position.margin},,,,,,#{position.confidence},#{position.entry_latency_us},#{coiled}\n"
    File.write!(csv_path, line, [:append])
  rescue
    _ -> :ok
  end

  defp append_trade_csv(:close, trade) do
    ensure_log_directory()
    csv_path = get_csv_file_path()
    
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()
    line = "#{timestamp},CLOSE,#{trade.id},#{trade.symbol},#{trade.direction},#{trade.entry_price},#{trade.exit_price},#{trade.quantity},#{trade.leverage},#{trade.margin},#{Float.round(trade.pnl * 1.0, 4)},#{Float.round(trade.pnl_pct * 1.0, 2)},#{trade.exit_reason},#{trade.hold_time},#{Float.round(trade.total_fees * 1.0, 4)},#{Float.round(trade.total_slippage * 100.0, 4)},,\n"
    File.write!(csv_path, line, [:append])
  rescue
    _ -> :ok
  end

  defp log_session_start(state) do
    log_to_file("SESSION_START", %{
      version: "v16.0-VELOCITY",
      strategy: "High-Velocity Volatility Harvesting",
      starting_balance: state.margin_balance,
      ai_brain_enabled: @use_ai_brain,
      coiled_spring_enabled: @coiled_spring_enabled,
      time_horizon_filter: "#{@min_time_to_target_minutes}-#{@max_time_to_target_minutes}m",
      compound_interval: @compound_interval_minutes,
      max_positions: @max_positions
    })
  end

  defp log_session_end(state) do
    log_to_file("SESSION_END", %{
      final_balance: state.margin_balance,
      total_pnl: state.total_pnl,
      total_trades: state.total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades,
      compound_count: state.compound_count,
      coiled_spring_trades: Map.get(state, :coiled_spring_trades, 0)
    })
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # PUBLIC API
  # ═══════════════════════════════════════════════════════════════════════════════

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  def start_trading, do: GenServer.cast(__MODULE__, :start_trading)
  def stop_trading, do: GenServer.cast(__MODULE__, :stop_trading)
  def status, do: GenServer.call(__MODULE__, :status, 10_000)
  def positions, do: GenServer.call(__MODULE__, :positions, 10_000)
  def stats, do: GenServer.call(__MODULE__, :stats, 10_000)
  def set_leverage(symbol, leverage), do: GenServer.call(__MODULE__, {:set_leverage, symbol, leverage})
  def close_all, do: GenServer.call(__MODULE__, :close_all, 30_000)
  def force_trade(symbol, direction), do: GenServer.call(__MODULE__, {:force_trade, symbol, direction}, 10_000)
  def account_info, do: GenServer.call(__MODULE__, :account_info, 10_000)
  def analytics, do: GenServer.call(__MODULE__, :analytics, 30_000) |> elem(1) |> IO.puts()
  def analytics_data, do: GenServer.call(__MODULE__, :analytics_data, 30_000)
  def hft_dashboard, do: GenServer.call(__MODULE__, :hft_dashboard, 10_000)
  def hft_stats, do: GenServer.call(__MODULE__, :hft_stats, 10_000)
  def relax_windows, do: GenServer.call(__MODULE__, :relax_windows, 10_000)
  def export_trades, do: GenServer.call(__MODULE__, :export_trades, 30_000)
  
  def dashboard do
    case status() do
      {:ok, s} -> print_dashboard(s)
      error -> IO.puts("Error: #{inspect(error)}")
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # GENSERVER INIT
  # ═══════════════════════════════════════════════════════════════════════════════

  @impl true
  def init(_opts) do
    ensure_log_directory()
    
    Logger.info("""
    
    ⚡ ═══════════════════════════════════════════════════════════════════════════════
    ⚡ MARGIN SCALPER v16.0 - HIGH-VELOCITY VOLATILITY HARVESTER
    ⚡ ═══════════════════════════════════════════════════════════════════════════════
    ⚡ 
    ⚡ STRATEGY: Polymarket Whale Adaptation
    ⚡ PHILOSOPHY: Harvest inefficiency, not predict direction
    ⚡ 
    ⚡ KEY CHANGES FROM v15.4:
    ⚡   🎯 Priority: MEME COINS (PEPE, WIF, BONK) - High inefficiency
    ⚡   🚫 Blocked: BTC/ETH/BNB - Too efficient, no edge
    ⚡   💰 Compounding: Every #{@compound_interval_minutes} min (SNOWBALL EFFECT)
    ⚡   🌀 Coiled Spring: #{if @coiled_spring_enabled, do: "✅ ENABLED", else: "❌ DISABLED"}
    ⚡   📊 Max Positions: #{@max_positions} (increased for velocity)
    ⚡   ⏰ Time Horizon: #{@min_time_to_target_minutes}-#{@max_time_to_target_minutes}m
    ⚡ 
    ⚡ ═══════════════════════════════════════════════════════════════════════════════
    """)

    Phoenix.PubSub.subscribe(@pubsub, "signals:all")

    state = %{
      trading_active: false,
      started_at: nil,
      positions: %{},
      relax_windows: %{},
      relax_flips: 0,
      relax_timeouts: 0,
      time_horizon_filtered: 0,
      ai_direction_overrides: 0,
      coiled_spring_trades: 0,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_pnl: 0.0,
      total_fees: 0.0,
      largest_win: 0.0,
      largest_loss: 0.0,
      signals_received: 0,
      signals_traded: 0,
      signals_filtered: 0,
      recent_signals: %{},
      price_cache: %{},
      energy_cache: %{},
      momentum_cache: %{},
      velocity_cache: %{},
      leverage_settings: @leverage_tiers,
      margin_balance: 0.0,
      available_margin: 0.0,
      trades_history: [],
      balance_history: [],
      completed_trades: [],
      hourly_pnl: [],
      starting_balance: 0.0,
      session_profit: 0.0,
      locked_profit: 0.0,
      last_compound_at: nil,
      compound_count: 0,
      daily_closed: false,
      trading_paused: false,
      daily_profit: 0.0,
      trades_today: 0,
      errors: 0
    }
    state = HFTPerformance.init_analytics_state(state)
    {:ok, state}
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # START/STOP TRADING
  # ═══════════════════════════════════════════════════════════════════════════════

  @impl true
  def handle_cast(:start_trading, state) do
    Logger.info("""
    
    ⚡ ═══════════════════════════════════════════════════════════════════════════════
    ⚡ VELOCITY HARVESTER v16.0 ACTIVE
    ⚡ ═══════════════════════════════════════════════════════════════════════════════
    ⚡ 📝 Log file: #{get_log_file_path()}
    ⚡ 💰 Compounding: Every #{@compound_interval_minutes} minutes
    ⚡ 🎯 Priority assets: #{inspect(Enum.take(@priority_assets, 5))}...
    ⚡ ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    Process.send_after(self(), :check_positions, 1_000)
    Process.send_after(self(), :update_prices, 1_000)
    Process.send_after(self(), :check_trailing_stops, 1_000)
    Process.send_after(self(), :check_relax_timeouts, 2_000)
    Process.send_after(self(), :log_performance, 60_000)
    Process.send_after(self(), :compound_profits, @compound_interval_minutes * 60_000)
    Process.send_after(self(), :check_daily_schedule, 60_000)
    
    margin_balance = get_margin_balance()
    
    new_state = %{state | 
      trading_active: true, 
      started_at: DateTime.utc_now(),
      margin_balance: margin_balance,
      available_margin: margin_balance,
      starting_balance: margin_balance,
      session_profit: 0.0,
      last_compound_at: DateTime.utc_now(),
      daily_profit: 0.0,
      trades_today: 0
    }
    
    log_session_start(new_state)
    
    {:noreply, new_state}
  end

  @impl true
  def handle_cast(:stop_trading, state) do
    Logger.info("🔴 VELOCITY HARVESTER STOPPED")
    log_session_end(state)
    {:noreply, %{state | trading_active: false}}
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # STATUS & STATS
  # ═══════════════════════════════════════════════════════════════════════════════

  @impl true
  def handle_call(:status, _from, state) do
    uptime = if state.started_at, do: DateTime.diff(DateTime.utc_now(), state.started_at), else: 0
    total_closed = state.winning_trades + state.losing_trades
    win_rate = if total_closed > 0, do: Float.round(state.winning_trades / total_closed * 100, 1), else: 0.0
    unrealized_pnl = calculate_unrealized_pnl(state)

    status = %{
      active: state.trading_active,
      version: "v16.0-VELOCITY",
      uptime_seconds: uptime,
      uptime_formatted: format_uptime(uptime),
      open_positions: map_size(state.positions),
      max_positions: @max_positions,
      realized_pnl: Float.round(state.total_pnl * 1.0, 2),
      unrealized_pnl: Float.round(unrealized_pnl * 1.0, 2),
      total_pnl: Float.round((state.total_pnl + unrealized_pnl) * 1.0, 2),
      total_fees: Float.round(state.total_fees * 1.0, 2),
      total_trades: state.total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades,
      win_rate: win_rate,
      largest_win: Float.round(state.largest_win * 1.0, 2),
      largest_loss: Float.round(state.largest_loss * 1.0, 2),
      signals_received: state.signals_received,
      signals_traded: state.signals_traded,
      signals_filtered: state.signals_filtered,
      margin_balance: Float.round(state.margin_balance * 1.0, 2),
      available_margin: Float.round(state.available_margin * 1.0, 2),
      leverage: @default_leverage,
      relax_windows_active: map_size(state.relax_windows),
      relax_flips: state.relax_flips,
      relax_timeouts: state.relax_timeouts,
      time_horizon_filtered: state.time_horizon_filtered,
      ai_direction_overrides: Map.get(state, :ai_direction_overrides, 0),
      coiled_spring_trades: Map.get(state, :coiled_spring_trades, 0),
      compound_count: state.compound_count,
      trades_per_hour: if(uptime > 0, do: Float.round(state.total_trades / (uptime / 3600), 1), else: 0.0),
      pnl_per_hour: if(uptime > 0, do: Float.round(state.total_pnl / (uptime / 3600), 2), else: 0.0),
      errors: state.errors,
      log_file: get_log_file_path(),
      csv_file: get_csv_file_path(),
      timestamp: DateTime.utc_now()
    }

    {:reply, {:ok, status}, state}
  end

  @impl true
  def handle_call(:positions, _from, state) do
    positions = state.positions
      |> Map.values()
      |> Enum.map(fn pos ->
        current = Map.get(state.price_cache, pos.symbol, pos.entry_price)
        pnl = calculate_position_pnl(pos, current)
        pnl_pct = if pos.margin > 0, do: pnl / pos.margin * 100, else: 0
        
        Map.merge(pos, %{
          current_price: current,
          unrealized_pnl: Float.round(pnl * 1.0, 2),
          unrealized_pnl_pct: Float.round(pnl_pct * 1.0, 1),
          hold_time: DateTime.diff(DateTime.utc_now(), pos.opened_at)
        })
      end)
    
    {:reply, positions, state}
  end

  @impl true
  def handle_call(:relax_windows, _from, state) do
    windows = state.relax_windows
    |> Enum.map(fn {symbol, relax} ->
      elapsed = DateTime.diff(DateTime.utc_now(), relax.started_at, :second)
      %{
        symbol: symbol,
        reversal_type: relax.reversal_type,
        expected_direction: relax.expected_direction,
        elapsed_seconds: elapsed,
        signals_collected: length(relax.signals),
        signals_needed: @relax_confirm_signals
      }
    end)
    
    {:reply, windows, state}
  end

  @impl true
  def handle_call(:hft_dashboard, _from, state) do
    HFTPerformance.render_dashboard(state)
    {:reply, :ok, state}
  end

  @impl true  
  def handle_call(:hft_stats, _from, state) do
    {:reply, HFTPerformance.calculate_stats(state), state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply, state.trades_history |> Enum.take(50), state}
  end

  @impl true
  def handle_call(:export_trades, _from, state) do
    {:reply, {:ok, %{
      log_file: get_log_file_path(),
      csv_file: get_csv_file_path(),
      trades_count: length(state.completed_trades)
    }}, state}
  end

  @impl true
  def handle_call(:account_info, _from, state) do
    info = %{
      margin_balance: state.margin_balance,
      available_margin: state.available_margin,
      used_margin: state.margin_balance - state.available_margin,
      leverage: @default_leverage,
      margin_mode: @margin_mode,
      open_positions: map_size(state.positions),
      relax_windows: map_size(state.relax_windows),
      compound_count: state.compound_count
    }
    {:reply, info, state}
  end

  @impl true
  def handle_call(:analytics, _from, state) do
    report = """
    
    ⚡ VELOCITY HARVESTER v16.0 ANALYTICS
    ═══════════════════════════════════════════════════════════════
    Total Trades:       #{state.total_trades}
    Win Rate:           #{if (state.winning_trades + state.losing_trades) > 0, do: Float.round(state.winning_trades / (state.winning_trades + state.losing_trades) * 100.0, 1), else: 0.0}%
    Total P&L:          $#{Float.round(state.total_pnl * 1.0, 2)}
    Largest Win:        $#{Float.round(state.largest_win * 1.0, 2)}
    Largest Loss:       $#{Float.round(state.largest_loss * 1.0, 2)}
    
    🌀 COILED SPRING TRADES: #{Map.get(state, :coiled_spring_trades, 0)}
    💰 COMPOUND COUNT: #{state.compound_count}
    
    📝 LOG FILES
    JSON Log:           #{get_log_file_path()}
    CSV File:           #{get_csv_file_path()}
    ═══════════════════════════════════════════════════════════════
    """
    {:reply, {:ok, report}, state}
  end

  @impl true
  def handle_call(:analytics_data, _from, state) do
    total_closed = state.winning_trades + state.losing_trades
    win_rate = if total_closed > 0, do: state.winning_trades / total_closed, else: 0
    
    {:reply, {:ok, %{
      total_trades: state.total_trades,
      win_rate: win_rate,
      total_pnl: state.total_pnl,
      relax_flips: state.relax_flips,
      relax_timeouts: state.relax_timeouts,
      time_horizon_filtered: state.time_horizon_filtered,
      ai_direction_overrides: Map.get(state, :ai_direction_overrides, 0),
      coiled_spring_trades: Map.get(state, :coiled_spring_trades, 0),
      compound_count: state.compound_count
    }}, state}
  end

  @impl true
  def handle_call({:set_leverage, symbol, leverage}, _from, state) do
    clamped = min(max(leverage, 1), @max_leverage)
    new_settings = Map.put(state.leverage_settings, symbol, clamped)
    {:reply, :ok, %{state | leverage_settings: new_settings}}
  end

  @impl true
  def handle_call(:close_all, _from, state) do
    count = map_size(state.positions)
    
    new_state = if count > 0 do
      state.positions
      |> Map.values()
      |> Enum.reduce(state, &close_position(&1, &2, :manual_close))
    else
      state
    end
    
    {:reply, {:ok, count}, %{new_state | relax_windows: %{}}}
  end

  @impl true
  def handle_call({:force_trade, symbol, direction}, _from, state) do
    if state.trading_active do
      case force_execute_trade(symbol, direction, state) do
        {:ok, position, new_state} -> {:reply, {:ok, position}, new_state}
        {:error, reason} -> {:reply, {:error, reason}, state}
      end
    else
      {:reply, {:error, :trading_not_active}, state}
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # SIGNAL PROCESSING
  # ═══════════════════════════════════════════════════════════════════════════════

  @impl true
  def handle_info({:signal, signal}, state) do
    if state.trading_active do
      state = HFTPerformance.increment_throughput(state)
      {:noreply, process_candlebridge_signal(signal, state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info({:physics_signal, signal}, state) do
    if state.trading_active do
      {:noreply, process_candlebridge_signal(signal, state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info({:candle_closed, candle}, state) do
    if state.trading_active and Map.has_key?(candle, :signal) do
      {:noreply, process_candlebridge_signal(candle.signal, state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:check_positions, state) do
    if state.trading_active do
      Process.send_after(self(), :check_positions, 1_000)
      {:noreply, check_all_positions(state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:update_prices, state) do
    if state.trading_active do
      Process.send_after(self(), :update_prices, 1_000)
      {:noreply, update_prices(state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:check_trailing_stops, state) do
    if state.trading_active do
      Process.send_after(self(), :check_trailing_stops, 2_000)
      {:noreply, update_trailing_stops(state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:check_relax_timeouts, state) do
    if state.trading_active do
      Process.send_after(self(), :check_relax_timeouts, 2_000)
      
      now = DateTime.utc_now()
      
      {expired, active} = state.relax_windows
      |> Enum.split_with(fn {_symbol, relax} ->
        DateTime.diff(now, relax.started_at, :second) >= @relax_max_seconds
      end)
      
      Enum.each(expired, fn {symbol, relax} ->
        Logger.debug("⏰ [RELAX] #{symbol} window expired - no #{relax.expected_direction} confirmation")
      end)
      
      timeout_count = length(expired)
      
      {:noreply, %{state | 
        relax_windows: Map.new(active),
        relax_timeouts: state.relax_timeouts + timeout_count
      }}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:log_performance, state) do
    if state.trading_active do
      Process.send_after(self(), :log_performance, 60_000)
      log_hourly_performance(state)
      log_hourly_summary(state)
    end
    {:noreply, state}
  end

  @impl true
  def handle_info(:compound_profits, state) do
    if state.trading_active do
      # Schedule next compound (FAST: every 5 min)
      Process.send_after(self(), :compound_profits, @compound_interval_minutes * 60_000)
      
      session_profit = state.total_pnl - state.locked_profit
      
      if session_profit > 0 do
        lock_amount = session_profit * @session_profit_lock_pct
        new_locked = state.locked_profit + lock_amount
        new_balance = state.starting_balance + state.total_pnl
        
        Logger.info("💰 COMPOUND ##{state.compound_count + 1}: +$#{Float.round(session_profit * 1.0, 2)} session → Locked $#{Float.round(lock_amount * 1.0, 2)} | Balance: $#{Float.round(new_balance * 1.0, 2)}")
        
        log_to_file("COMPOUND", %{
          count: state.compound_count + 1,
          session_profit: session_profit,
          locked_amount: lock_amount,
          new_balance: new_balance
        })
        
        VirtualBalanceManager.set_balance("default", new_balance)
        
        {:noreply, %{state |
          margin_balance: new_balance,
          available_margin: new_balance - calculate_used_margin(state),
          locked_profit: new_locked,
          compound_count: state.compound_count + 1,
          last_compound_at: DateTime.utc_now()
        }}
      else
        {:noreply, state}
      end
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:check_daily_schedule, state) do
    if state.trading_active do
      Process.send_after(self(), :check_daily_schedule, 60_000)
      
      now = DateTime.utc_now()
      hour = now.hour
      minute = now.minute
      
      cond do
        hour == @daily_close_hour and minute >= @daily_close_minute and not state.daily_closed ->
          Logger.info("⚡ DAILY CLOSE - 23:45 UTC")
          state = close_all_positions(state, :daily_close)
          report_daily_performance(state)
          log_session_end(state)
          {:noreply, %{state | daily_closed: true, trading_paused: true, relax_windows: %{}}}
        
        hour == @daily_resume_hour and minute >= @daily_resume_minute and state.daily_closed ->
          Logger.info("⚡ NEW DAY - RESUMING at 00:15 UTC")
          log_session_start(state)
          {:noreply, %{state | daily_closed: false, trading_paused: false, daily_profit: 0.0, trades_today: 0}}
        
        true ->
          {:noreply, state}
      end
    else
      {:noreply, state}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ═══════════════════════════════════════════════════════════════════════════════
  # CANDLEBRIDGE SIGNAL PROCESSING WITH COILED SPRING
  # ═══════════════════════════════════════════════════════════════════════════════

  defp process_candlebridge_signal(signal, state) do
    symbol = signal[:symbol] || signal["symbol"]
    direction = signal[:direction] || signal["direction"]
    confidence = signal[:confidence] || signal["confidence"] || 50
    
    direction = normalize_direction(direction)
    
    # Extract physics values
    energy_level = extract_energy_level(signal)
    momentum = extract_momentum(signal)
    velocity = extract_velocity(signal)
    
    # Update caches
    state = state
    |> Map.put(:energy_cache, Map.put(state.energy_cache, symbol, energy_level))
    |> Map.put(:momentum_cache, Map.put(Map.get(state, :momentum_cache, %{}), symbol, momentum))
    |> Map.put(:velocity_cache, Map.put(Map.get(state, :velocity_cache, %{}), symbol, velocity))
    
    time_to_target = extract_time_to_target_from_signal(signal)
    
    now = DateTime.utc_now()

    # Rate limit: 15 seconds between same symbol (FASTER for velocity)
    last = Map.get(state.recent_signals, symbol)
    if last && DateTime.diff(now, last, :second) < 15 do
      state
    else
      # 🌀 COILED SPRING DETECTION - THE KEY POLYMARKET INSIGHT
      {is_coiled, confidence_boost} = detect_coiled_spring(symbol, momentum, velocity)
      boosted_confidence = if is_coiled, do: min(confidence + confidence_boost, 95), else: confidence
      
      if is_coiled do
        Logger.info("🌀 COILED SPRING #{symbol}: momentum=#{Float.round(momentum * 1.0, 3)} velocity=#{Float.round(velocity * 1.0, 3)} → +#{confidence_boost}% conf")
        log_coiled_spring(symbol, momentum, velocity, confidence_boost)
      end

      normalized_signal = %{
        symbol: symbol,
        direction: direction,
        confidence: boosted_confidence,
        original_confidence: confidence,
        coiled_spring: is_coiled,
        entry_price: to_float(signal[:entry_price] || signal[:current_price]),
        current_price: to_float(signal[:current_price] || signal[:entry_price]),
        stop_loss: to_float(signal[:stop_loss]),
        take_profit: to_float(signal[:take_profit]),
        momentum: momentum,
        velocity: velocity,
        peak_price: signal[:peak_price],
        peak_time: signal[:peak_time],
        time_to_target: time_to_target,
        energy_zones: signal[:energy_zones] || %{},
        physics: %{
          momentum: momentum,
          velocity: velocity,
          gravity: signal[:gravity] || 0,
          peak_price: signal[:peak_price],
          peak_time: signal[:peak_time],
          time_to_peak: time_to_target,
          kinetic_energy: signal[:kinetic_energy]
        }
      }
      
      new_state = %{state |
        signals_received: state.signals_received + 1,
        recent_signals: Map.put(state.recent_signals, symbol, now)
      }
      
      new_state = if Map.has_key?(new_state.relax_windows, symbol) do
        feed_relax_window(symbol, normalized_signal, new_state)
      else
        new_state
      end
      
      if not Map.has_key?(new_state.relax_windows, symbol) do
        case should_trade_margin?(normalized_signal, new_state) do
          {:trade, final_direction, updated_state} ->
            trade_signal = %{normalized_signal | direction: final_direction}
            execute_margin_trade(trade_signal, updated_state)
          
          {:reject, _reason, updated_state} ->
            %{updated_state | signals_filtered: updated_state.signals_filtered + 1}
        end
      else
        %{new_state | signals_filtered: new_state.signals_filtered + 1}
      end
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🌀 COILED SPRING DETECTION - NEW FOR v16.0
  # ═══════════════════════════════════════════════════════════════════════════════
  # 
  # KEY INSIGHT FROM POLYMARKET WHALE:
  # "When price movements already confirm direction, but market hasn't accounted yet"
  # 
  # In physics terms:
  # - High Momentum = Force building up (direction confirmed)
  # - Low Velocity = Price hasn't moved yet (market hasn't adjusted)
  # - Result: Potential energy building → snap-move imminent
  # 
  # Like a coiled spring ready to release
  # ═══════════════════════════════════════════════════════════════════════════════
  
  defp detect_coiled_spring(_symbol, momentum, velocity) when @coiled_spring_enabled do
    abs_momentum = abs(momentum)
    abs_velocity = abs(velocity)
    
    is_coiled = abs_momentum >= @coiled_spring_momentum_min and 
                abs_velocity <= @coiled_spring_velocity_max
    
    if is_coiled do
      # Confidence boost proportional to how "coiled" it is
      coil_ratio = abs_momentum / max(abs_velocity, 0.01)
      boost = min(round(coil_ratio * 5), @coiled_spring_confidence_boost)
      {true, boost}
    else
      {false, 0}
    end
  end
  defp detect_coiled_spring(_, _, _), do: {false, 0}

  defp normalize_direction(dir) when is_atom(dir), do: dir
  defp normalize_direction("long"), do: :long
  defp normalize_direction("short"), do: :short
  defp normalize_direction("neutral"), do: :neutral
  defp normalize_direction("hold"), do: :neutral
  defp normalize_direction(_), do: :neutral

  defp extract_energy_level(signal) do
    get_in(signal, [:energy_zones, :current_energy]) ||
    get_in(signal, ["energy_zones", "current_energy"]) ||
    get_in(signal, [:physics, :energy_zones, :current_energy]) ||
    get_in(signal, [:analysis, :energy_level]) ||
    0.5
  end

  defp extract_momentum(signal) do
    raw = signal[:momentum] || 
          get_in(signal, [:physics, :momentum]) ||
          get_in(signal, ["momentum"]) ||
          0.0
    
    # Normalize to -1 to 1 range
    cond do
      raw > 1.0 -> min(raw / 10.0, 1.0)
      raw < -1.0 -> max(raw / 10.0, -1.0)
      true -> raw * 1.0
    end
  end

  defp extract_velocity(signal) do
    raw = signal[:velocity] ||
          get_in(signal, [:physics, :velocity]) ||
          get_in(signal, ["velocity"]) ||
          0.0
    
    cond do
      raw > 1.0 -> min(raw / 10.0, 1.0)
      raw < -1.0 -> max(raw / 10.0, -1.0)
      true -> raw * 1.0
    end
  end

  defp extract_time_to_target_from_signal(signal) do
    raw = signal[:peak_time] ||
          signal[:time_to_target] ||
          get_in(signal, [:physics, :time_to_peak]) ||
          get_in(signal, [:physics, :peak_time]) ||
          get_in(signal, [:energy_zones, :time_to_peak]) ||
          get_in(signal, ["peak_time"]) ||
          get_in(signal, ["physics", "time_to_peak"]) ||
          15.0  # DEFAULT: Lower for velocity strategy
    
    parse_time_value(raw)
  end

  defp parse_time_value(raw) do
    case raw do
      t when is_number(t) -> t * 1.0
      t when is_binary(t) ->
        cleaned = t 
          |> String.downcase() 
          |> String.replace("m", "") 
          |> String.replace("min", "")
          |> String.trim()
        
        case Float.parse(cleaned) do
          {f, _} -> f
          :error -> 15.0
        end
      _ -> 15.0
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🔄 RELAX WINDOW FUNCTIONS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp check_for_reversal_point(pos, current_price, state) do
    energy_level = Map.get(state.energy_cache, pos.symbol, 0.5)
    current_pnl = calculate_position_pnl(pos, current_price)
    
    cond do
      not @enable_relax_window -> :continue
      Map.has_key?(state.relax_windows, pos.symbol) -> :in_relax
      current_pnl < @relax_min_profit_to_flip -> :continue
      pos.direction == :long and energy_level >= @peak_energy_threshold ->
        {:enter_relax, :peak, :short, energy_level}
      pos.direction == :short and energy_level <= @trough_energy_threshold ->
        {:enter_relax, :trough, :long, energy_level}
      true -> :continue
    end
  end

  defp enter_relax_window(pos, reversal_type, expected_direction, energy_level, state) do
    Logger.debug("⏸️ [RELAX] #{pos.symbol} #{reversal_type} → #{expected_direction}")
    
    log_to_file("RELAX_ENTER", %{
      symbol: pos.symbol,
      reversal_type: reversal_type,
      expected_direction: expected_direction,
      energy_level: energy_level
    })
    
    state = close_position(pos, state, :"#{reversal_type}_reached")
    
    relax_entry = %{
      symbol: pos.symbol,
      started_at: DateTime.utc_now(),
      reversal_type: reversal_type,
      expected_direction: expected_direction,
      signals: [],
      entry_price: Map.get(state.price_cache, pos.symbol, pos.entry_price),
      original_direction: pos.direction
    }
    
    %{state | relax_windows: Map.put(state.relax_windows, pos.symbol, relax_entry)}
  end

  defp feed_relax_window(symbol, signal, state) do
    case Map.get(state.relax_windows, symbol) do
      nil -> state
      
      relax ->
        direction = normalize_direction(signal[:direction] || signal.direction)
        confidence = signal[:confidence] || signal.confidence || 0
        
        new_signal = %{
          direction: direction,
          confidence: confidence,
          timestamp: DateTime.utc_now()
        }
        
        updated_relax = %{relax | signals: [new_signal | relax.signals]}
        elapsed = DateTime.diff(DateTime.utc_now(), relax.started_at, :second)
        
        cond do
          length(updated_relax.signals) >= @relax_confirm_signals and elapsed >= @relax_min_seconds ->
            check_relax_confirmation(symbol, updated_relax, state)
          true ->
            %{state | relax_windows: Map.put(state.relax_windows, symbol, updated_relax)}
        end
    end
  end

  defp check_relax_confirmation(symbol, relax, state) do
    confirming = Enum.count(relax.signals, fn sig ->
      sig.direction == relax.expected_direction and
      sig.confidence >= @relax_min_confidence
    end)
    
    total = length(relax.signals)
    ratio = confirming / max(total, 1)
    
    if ratio >= @relax_confirm_ratio do
      Logger.info("✅ [FLIP] #{symbol} → #{relax.expected_direction} (#{confirming}/#{total})")
      
      log_to_file("RELAX_FLIP", %{
        symbol: symbol,
        new_direction: relax.expected_direction,
        confirming_signals: confirming,
        total_signals: total,
        ratio: ratio
      })
      
      state = %{state | 
        relax_windows: Map.delete(state.relax_windows, symbol),
        relax_flips: state.relax_flips + 1
      }
      
      flip_signal = %{
        symbol: symbol,
        direction: relax.expected_direction,
        confidence: 65,
        coiled_spring: false,
        entry_price: Map.get(state.price_cache, symbol, relax.entry_price),
        current_price: Map.get(state.price_cache, symbol, relax.entry_price),
        time_to_target: 10,
        momentum: 0,
        velocity: 0,
        energy_zones: %{energy_level: :medium},
        physics: %{time_to_peak: 10, momentum: 0, velocity: 0}
      }
      
      execute_margin_trade(flip_signal, state)
    else
      %{state | relax_windows: Map.put(state.relax_windows, symbol, relax)}
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # SIGNAL VALIDATION - VELOCITY FOCUS WITH COILED SPRING
  # ═══════════════════════════════════════════════════════════════════════════════
  
  defp should_trade_margin?(signal, state) do
    symbol = signal.symbol
    direction = signal.direction
    confidence = signal.confidence || 0
    time_to_target = signal[:time_to_target] || signal.time_to_target || 15
    is_coiled = Map.get(signal, :coiled_spring, false)
    
    energy_level = get_in(signal, [:energy_zones, :energy_level]) ||
                   get_in(signal, [:physics, :energy_zones, :energy_level]) || 
                   :medium

    cond do
      # 🚫 BLOCKED: Efficient assets - NO EDGE
      symbol in @blocked_assets -> 
        log_rejection(symbol, direction, :blocked_asset)
        {:reject, :blocked_asset, state}
      
      state.trading_paused -> 
        {:reject, :trading_paused, state}
      
      symbol not in @tradeable_assets -> 
        log_rejection(symbol, direction, :not_tradeable)
        {:reject, :not_tradeable, state}
      
      direction not in [:long, :short] -> 
        {:reject, :neutral_direction, state}
      
      has_position?(symbol, state) -> 
        {:reject, :has_position, state}
      
      map_size(state.positions) >= @max_positions -> 
        log_rejection(symbol, direction, :max_positions)
        {:reject, :max_positions, state}
      
      # ⏰ Time horizon filter (skip for coiled springs)
      not is_coiled and not time_horizon_valid?(time_to_target) ->
        log_rejection(symbol, direction, :time_horizon, %{time_to_target: time_to_target})
        {:reject, :time_horizon, %{state | time_horizon_filtered: state.time_horizon_filtered + 1}}
      
      # 🧠 AI BRAIN MODE
      @use_ai_brain ->
        consult_ai_brain_for_trade(signal, direction, state)
      
      # Physics-only mode
      true ->
        if physics_filter_velocity(signal, direction, confidence, energy_level, is_coiled) do
          {:trade, direction, state}
        else
          log_rejection(symbol, direction, :physics_filter, %{confidence: confidence})
          {:reject, :physics_filter, state}
        end
    end
  end

  defp time_horizon_valid?(time_to_target) when is_number(time_to_target) do
    time_to_target >= @min_time_to_target_minutes and 
    time_to_target <= @max_time_to_target_minutes
  end
  defp time_horizon_valid?(_), do: true

  defp consult_ai_brain_for_trade(signal, original_direction, state) do
    features = build_ai_features(signal, state)
    
    case Brain.decide(features, timeout: 50) do
      {:ok, %{action: ai_action, confidence: ai_conf}} when ai_action in [:long, :short] ->
        if ai_conf >= @ai_min_confidence do
          if ai_action != original_direction do
            Logger.info("🧠 AI OVERRIDE #{signal.symbol}: #{original_direction} → #{ai_action} @ #{Float.round(ai_conf * 100, 1)}%")
            log_ai_decision(signal.symbol, original_direction, ai_action, ai_conf, :override)
            {:trade, ai_action, %{state | ai_direction_overrides: Map.get(state, :ai_direction_overrides, 0) + 1}}
          else
            Logger.debug("🧠 AI CONFIRMED #{signal.symbol} #{ai_action}")
            log_ai_decision(signal.symbol, original_direction, ai_action, ai_conf, :confirmed)
            {:trade, ai_action, state}
          end
        else
          log_ai_decision(signal.symbol, original_direction, ai_action, ai_conf, :low_confidence)
          {:reject, :ai_low_confidence, state}
        end
      
      {:ok, %{action: :hold}} -> 
        {:reject, :ai_hold, state}
        
      {:error, _reason} ->
        # Fallback to physics
        is_coiled = Map.get(signal, :coiled_spring, false)
        if physics_filter_velocity(signal, original_direction, signal.confidence, :medium, is_coiled) do
          {:trade, original_direction, state}
        else
          {:reject, :physics_fallback_filter, state}
        end
    end
  end

  # 🎯 VELOCITY PHYSICS FILTER - Optimized for meme coins + coiled springs
  defp physics_filter_velocity(signal, direction, confidence, energy_level, is_coiled) do
    is_priority = signal.symbol in @priority_assets
    
    # Lower thresholds for priority assets and coiled springs
    min_conf = cond do
      is_coiled -> 50           # Very low for coiled springs
      is_priority -> 55         # Low for priority assets
      true -> @min_confidence_long
    end
    
    cond do
      confidence < min_conf -> false
      energy_level == :low and confidence < 50 and not is_coiled -> false
      not has_sufficient_projected_move?(signal) and not is_coiled -> false
      @use_physics_exits and not has_valid_physics_zones?(signal) and not is_coiled -> false
      true ->
        emoji = cond do
          is_coiled -> "🌀 COILED"
          is_priority -> "⭐ PRIORITY"
          true -> "✅"
        end
        Logger.info("#{emoji} #{signal.symbol} #{direction} #{confidence}%")
        true
    end
  end

  defp build_ai_features(signal, state) do
    physics = signal[:physics] || signal.physics || %{}
    energy_zones = signal[:energy_zones] || physics[:energy_zones] || %{}
    zone_distances = energy_zones[:zone_distances] || %{}
    
    price = signal.current_price || signal.entry_price || 1.0
    
    momentum = signal[:momentum] || physics[:momentum] || 0.0
    velocity = signal[:velocity] || physics[:velocity] || 0.0
    
    position = state.positions |> Map.values() |> Enum.find(& &1.symbol == signal.symbol)
    pnl = if position, do: (position[:unrealized_pnl_pct] || 0.0) / 100.0, else: 0.0
    
    %{
      momentum: momentum,
      velocity: velocity,
      gravity: physics[:gravity] || 0.0001,
      kinetic_energy: energy_zones[:kinetic_energy] || physics[:kinetic_energy] || 0.0,
      dist_to_peak_pct: safe_pct(zone_distances[:to_peak], price),
      dist_to_injection_pct: safe_pct(zone_distances[:to_injection], price),
      unrealized_pnl_pct: max(-1.0, min(1.0, pnl)),
      coiled_spring: if(Map.get(signal, :coiled_spring, false), do: 1.0, else: 0.0)
    }
  end

  defp safe_pct(nil, _), do: 0.0
  defp safe_pct(_, 0), do: 0.0
  defp safe_pct(_, 0.0), do: 0.0
  defp safe_pct(dist, price), do: max(-0.1, min(0.1, dist / price))

  defp has_position?(symbol, state) do
    state.positions |> Map.values() |> Enum.any?(& &1.symbol == symbol)
  end

  defp has_sufficient_projected_move?(signal) do
    zone_distances = get_in(signal, [:energy_zones, :zone_distances]) ||
                     get_in(signal, [:physics, :energy_zones, :zone_distances]) ||
                     get_in(signal, [:physics, :zone_distances]) || %{}
    
    projected_move = cond do
      to_peak = zone_distances[:to_peak] -> to_peak / 100
      true ->
        entry = to_float(signal[:entry_price]) || to_float(signal[:current_price])
        target = get_target_price(signal)
        if entry && target && entry > 0, do: abs(target - entry) / entry, else: 0
    end
    
    projected_move >= @min_projected_move_pct
  end

  defp has_valid_physics_zones?(signal) do
    zones = get_in(signal, [:energy_zones, :zone_boundaries]) ||
            get_in(signal, [:physics, :energy_zones, :zone_boundaries]) ||
            get_in(signal, [:physics, :zone_boundaries]) || %{}
    
    zones[:injection] != nil and zones[:peak] != nil
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # TRADE EXECUTION
  # ═══════════════════════════════════════════════════════════════════════════════

  defp execute_margin_trade(signal, state) do
    start_time = System.monotonic_time(:microsecond)
    symbol = signal.symbol
    direction = signal.direction
    confidence = signal.confidence || 50
    is_coiled = Map.get(signal, :coiled_spring, false)

    case get_current_price(symbol) do
      {:ok, current_price} ->
        base_leverage = get_leverage(symbol, state)
        leverage = calculate_dynamic_leverage(base_leverage, confidence, is_coiled)
        position_slot = map_size(state.positions) + 1
        
        {margin, position_size, notional} = calculate_margin_position(
          state.margin_balance, current_price, leverage, confidence, position_slot
        )

        entry_price = if @use_limit_orders do
          calculate_limit_entry(signal, current_price, direction)
        else
          current_price
        end

        # Use tier-specific exits for velocity strategy
        {stop_loss, take_profit} = calculate_velocity_exits(current_price, direction, symbol)
        
        fee_rate = if @use_limit_orders, do: @maker_fee_pct, else: @taker_fee_pct
        entry_fee = notional * fee_rate
        liquidation_price = calculate_liquidation_price(current_price, direction, leverage)
        safe_stop = ensure_safe_stop(stop_loss, liquidation_price, direction)
        position_id = Ecto.UUID.generate()
        order_type = if @use_limit_orders, do: :limit, else: :market

        case execute_futures_order(symbol, direction, position_size, leverage, entry_price, order_type) do
          {:ok, order_result} ->
            latency_us = System.monotonic_time(:microsecond) - start_time
            
            executed_price = order_result[:executed_price] || entry_price
            executed_qty = order_result[:executed_qty] || position_size
            
            signal_price = to_float(signal.entry_price) || to_float(signal.current_price) || entry_price
            entry_slippage = if signal_price > 0 do
              abs(executed_price - signal_price) / signal_price
            else
              0.0
            end

            position = %{
              id: position_id,
              symbol: symbol,
              direction: direction,
              quantity: executed_qty,
              entry_price: executed_price,
              current_price: executed_price,
              leverage: leverage,
              margin: margin,
              notional: notional,
              target_price: take_profit,
              stop_loss: safe_stop,
              take_profit: take_profit,
              trailing_stop: nil,
              trailing_activated: false,
              liquidation_price: liquidation_price,
              entry_fee: entry_fee,
              expected_exit_fee: notional * fee_rate,
              total_fees: entry_fee,
              fee_floor: entry_fee * 2 * @fee_floor_multiplier,
              confidence: confidence,
              coiled_spring: is_coiled,
              opened_at: DateTime.utc_now(),
              max_hold_until: DateTime.add(DateTime.utc_now(), get_tier_max_hold(symbol) * 60, :second),
              highest_price: executed_price,
              lowest_price: executed_price,
              fee: entry_fee,
              order_id: order_result[:order_id],
              order_type: order_type,
              entry_slippage: entry_slippage,
              entry_latency_us: latency_us
            }

            direction_emoji = if direction == :long, do: "🟢", else: "🔴"
            coiled_tag = if is_coiled, do: " 🌀", else: ""
            Logger.info("#{direction_emoji} OPENED #{symbol} #{direction}#{coiled_tag} @ $#{Float.round(executed_price * 1.0, 4)} (#{leverage}x) [#{latency_us}μs]")

            log_trade_open(position)

            coiled_count = Map.get(state, :coiled_spring_trades, 0)
            
            state
            |> HFTPerformance.record_latency(latency_us)
            |> HFTPerformance.increment_throughput()
            |> Map.merge(%{
              positions: Map.put(state.positions, position_id, position),
              signals_traded: state.signals_traded + 1,
              total_trades: state.total_trades + 1,
              total_fees: state.total_fees + entry_fee,
              available_margin: state.available_margin - margin,
              price_cache: Map.put(state.price_cache, symbol, executed_price),
              coiled_spring_trades: if(is_coiled, do: coiled_count + 1, else: coiled_count)
            })

          {:error, reason} ->
            Logger.error("❌ Failed to open #{symbol}: #{inspect(reason)}")
            %{state | errors: state.errors + 1}
        end

      {:error, _} ->
        Logger.error("❌ Failed to get price for #{symbol}")
        state
    end
  end

  defp force_execute_trade(symbol, direction, state) do
    case get_current_price(symbol) do
      {:ok, price} ->
        signal = %{
          symbol: symbol, direction: direction, confidence: 70,
          entry_price: price, current_price: price,
          time_to_target: 10,
          coiled_spring: false,
          momentum: 0, velocity: 0,
          energy_zones: %{}, physics: %{time_to_peak: 10, momentum: 0, velocity: 0}
        }
        
        new_state = execute_margin_trade(signal, state)
        new_position = new_state.positions |> Map.values() |> Enum.find(& &1.symbol == symbol)
        
        if new_position, do: {:ok, new_position, new_state}, else: {:error, :execution_failed}
      error -> error
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # POSITION MANAGEMENT
  # ═══════════════════════════════════════════════════════════════════════════════

  defp check_all_positions(state) do
    now = DateTime.utc_now()
    
    state.positions
    |> Map.values()
    |> Enum.reduce(state, fn pos, acc ->
      current = Map.get(acc.price_cache, pos.symbol, pos.entry_price)
      current_pnl = calculate_position_pnl(pos, current)
      max_loss_usd = min(@max_loss_per_trade_usd, acc.margin_balance * @max_loss_per_trade_pct)
      
      cond do
        current_pnl < -max_loss_usd ->
          Logger.warning("🚨 #{pos.symbol} MAX LOSS")
          close_position(pos, acc, :max_loss_protection)
        
        current_pnl > 0 ->
          case check_for_reversal_point(pos, current, acc) do
            {:enter_relax, reversal_type, expected_dir, energy} ->
              enter_relax_window(pos, reversal_type, expected_dir, energy, acc)
            _ ->
              check_normal_exits(pos, acc, current, now)
          end
        
        true ->
          check_normal_exits(pos, acc, current, now)
      end
    end)
  end

  defp check_normal_exits(pos, state, current, now) do
    cond do
      DateTime.compare(now, pos.max_hold_until) == :gt ->
        close_position(pos, state, :time_exit)
      stop_hit?(pos, current) ->
        close_position(pos, state, :stop_loss)
      tp_hit?(pos, current) ->
        close_position(pos, state, :take_profit)
      trailing_stop_hit?(pos, current) ->
        close_position(pos, state, :trailing_stop)
      near_liquidation?(pos, current) ->
        close_position(pos, state, :liquidation_protection)
      true ->
        state
    end
  end

  defp stop_hit?(pos, current) do
    case pos.direction do
      :long -> current <= pos.stop_loss
      :short -> current >= pos.stop_loss
      _ -> false
    end
  end

  defp tp_hit?(pos, current) do
    case pos.direction do
      :long -> current >= pos.take_profit
      :short -> current <= pos.take_profit
      _ -> false
    end
  end

  defp trailing_stop_hit?(pos, current) do
    case pos.trailing_stop do
      nil -> false
      ts -> if pos.direction == :long, do: current <= ts, else: current >= ts
    end
  end

  defp near_liquidation?(pos, current) do
    distance_to_liq = abs(current - pos.liquidation_price)
    entry_to_liq = abs(pos.entry_price - pos.liquidation_price)
    distance_to_liq / entry_to_liq < 0.15  # TIGHTER: 15% buffer
  end

  defp update_trailing_stops(state) do
    state.positions
    |> Map.to_list()
    |> Enum.reduce(state, fn {id, pos}, acc ->
      current = Map.get(acc.price_cache, pos.symbol, pos.entry_price)
      current_pnl = calculate_position_pnl(pos, current)
      
      updated_pos = cond do
        pos.trailing_activated ->
          update_trailing_level(pos, current)
        should_activate_trailing?(pos, current_pnl) ->
          %{pos | trailing_activated: true, trailing_stop: calculate_trailing_stop(pos, current)}
        true ->
          pos
      end

      updated_pos = %{updated_pos |
        highest_price: max(updated_pos.highest_price, current),
        lowest_price: min(updated_pos.lowest_price, current)
      }

      %{acc | positions: Map.put(acc.positions, id, updated_pos)}
    end)
  end

  defp should_activate_trailing?(pos, current_pnl) do
    fee_floor = Map.get(pos, :fee_floor, pos.fee * @fee_floor_multiplier * 2)
    current_pnl > fee_floor
  end

  defp update_trailing_level(pos, current) do
    new_trailing = calculate_trailing_stop(pos, current)
    current_stop = pos.trailing_stop
    
    case pos.direction do
      :long -> if is_nil(current_stop) or new_trailing > current_stop, do: %{pos | trailing_stop: new_trailing}, else: pos
      :short -> if is_nil(current_stop) or new_trailing < current_stop, do: %{pos | trailing_stop: new_trailing}, else: pos
      _ -> pos
    end
  end

  defp calculate_trailing_stop(pos, current) do
    trail_distance = current * @trailing_stop_distance * @take_profit_pct
    if pos.direction == :long, do: current - trail_distance, else: current + trail_distance
  end

  defp close_position(pos, state, reason) do
    exit_price = Map.get(state.price_cache, pos.symbol, pos.entry_price)
    
    case execute_close_order(pos.symbol, pos.direction, pos.quantity) do
      {:ok, result} ->
        final_price = result[:executed_price] || exit_price
        close_fee = calculate_fee(pos.notional)
        pnl = calculate_position_pnl(pos, final_price) - close_fee
        pnl_pct = if pos.margin > 0, do: pnl / pos.margin * 100, else: 0
        is_win = pnl >= 0
        hold_time = DateTime.diff(DateTime.utc_now(), pos.opened_at)

        exit_slippage = cond do
          reason == :take_profit and pos.take_profit > 0 ->
            abs(final_price - pos.take_profit) / pos.take_profit
          reason == :stop_loss and pos.stop_loss > 0 ->
            abs(final_price - pos.stop_loss) / pos.stop_loss
          true ->
            0.0
        end
        
        entry_slippage = Map.get(pos, :entry_slippage, 0.0)
        total_slippage = (entry_slippage + exit_slippage) / 2

        emoji = cond do
          pnl >= @ideal_profit_target -> "🎯"
          pnl >= @min_profit_target -> "✅"
          pnl >= 0 -> "➖"
          true -> "❌"
        end

        Logger.info("#{emoji} CLOSED #{pos.symbol} #{reason}: #{if pnl >= 0, do: "+", else: ""}$#{Float.round(pnl * 1.0, 2)} (#{hold_time}s)")

        trade_record = Map.merge(pos, %{
          exit_price: final_price, 
          exit_reason: reason, 
          pnl: pnl, 
          pnl_pct: pnl_pct,
          close_fee: close_fee, 
          total_fees: pos.fee + close_fee,
          closed_at: DateTime.utc_now(), 
          hold_time: hold_time,
          exit_slippage: exit_slippage,
          total_slippage: total_slippage
        })

        log_trade_close(trade_record)

        new_balance = state.margin_balance + pnl
        balance_snapshot = {DateTime.utc_now(), new_balance}

        state
        |> HFTPerformance.record_trade(pnl, total_slippage)
        |> HFTPerformance.record_equity(new_balance)
        |> Map.merge(%{
          positions: Map.delete(state.positions, pos.id),
          winning_trades: state.winning_trades + if(is_win, do: 1, else: 0),
          losing_trades: state.losing_trades + if(is_win, do: 0, else: 1),
          total_pnl: state.total_pnl + pnl,
          total_fees: state.total_fees + close_fee,
          largest_win: max(state.largest_win, if(is_win, do: pnl, else: 0)),
          largest_loss: min(state.largest_loss, if(is_win, do: 0, else: pnl)),
          available_margin: state.available_margin + pos.margin,
          margin_balance: new_balance,
          trades_history: [trade_record | state.trades_history] |> Enum.take(100),
          completed_trades: [trade_record | state.completed_trades] |> Enum.take(500),
          balance_history: [balance_snapshot | state.balance_history] |> Enum.take(1000)
        })

      {:error, reason} ->
        Logger.error("❌ Failed to close #{pos.symbol}: #{inspect(reason)}")
        %{state | errors: state.errors + 1}
    end
  end

  defp close_all_positions(state, reason) do
    if map_size(state.positions) > 0 do
      state.positions |> Map.values() |> Enum.reduce(state, &close_position(&1, &2, reason))
    else
      state
    end
  end

  defp report_daily_performance(state) do
    Logger.info("⚡ Daily P&L: $#{Float.round(state.total_pnl * 1.0, 2)} | Trades: #{state.total_trades} | Compounds: #{state.compound_count}")
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # CALCULATIONS - VELOCITY OPTIMIZED
  # ═══════════════════════════════════════════════════════════════════════════════

  defp calculate_limit_entry(signal, current_price, direction) do
    physics = signal[:physics] || %{}
    zone_distances = physics[:zone_distances] || %{}
    to_balance = zone_distances[:to_balance] || 0
    offset_pct = (to_balance / 100) * @limit_order_depth
    offset = current_price * offset_pct
    
    if direction == :long, do: current_price - offset, else: current_price + offset
  end

  # 🎯 VELOCITY EXITS - Tier-specific, faster targets (Polymarket Whale strategy)
  defp calculate_velocity_exits(current_price, direction, symbol) do
    tier = get_asset_tier(symbol)
    tp_pct = Map.get(@tier_take_profit, tier, @take_profit_pct)
    sl_pct = Map.get(@tier_stop_loss, tier, @stop_loss_pct)
    
    case direction do
      :long ->
        sl = current_price * (1 - sl_pct)
        tp = current_price * (1 + tp_pct)
        {sl, tp}
      :short ->
        sl = current_price * (1 + sl_pct)
        tp = current_price * (1 - tp_pct)
        {sl, tp}
    end
  end

  defp calculate_liquidation_price(entry, direction, leverage) do
    liquidation_distance = entry / leverage * 0.9
    if direction == :long, do: entry - liquidation_distance, else: entry + liquidation_distance
  end

  defp ensure_safe_stop(stop, liquidation, direction) do
    distance_to_liq = abs(stop - liquidation)
    safe_distance = distance_to_liq * @liquidation_buffer
    if direction == :long, do: max(stop, liquidation + safe_distance), else: min(stop, liquidation - safe_distance)
  end

  defp calculate_position_pnl(pos, current_price) do
    price_diff = if pos.direction == :long, do: current_price - pos.entry_price, else: pos.entry_price - current_price
    price_diff * pos.quantity
  end

  defp calculate_unrealized_pnl(state) do
    state.positions
    |> Map.values()
    |> Enum.reduce(0.0, fn pos, acc ->
      current = Map.get(state.price_cache, pos.symbol, pos.entry_price)
      acc + calculate_position_pnl(pos, current)
    end)
  end

  defp calculate_used_margin(state) do
    state.positions |> Map.values() |> Enum.reduce(0.0, fn pos, acc -> acc + (pos.margin || 0) end)
  end

  defp calculate_fee(notional), do: notional * 0.0004

  # 🎯 DYNAMIC LEVERAGE - Higher for coiled springs and high confidence
  defp calculate_dynamic_leverage(base_leverage, confidence, is_coiled) do
    boost = if is_coiled, do: 1, else: 0
    
    cond do
      confidence >= 85 -> min(base_leverage + 2 + boost, @max_leverage)
      confidence >= 75 -> min(base_leverage + 1 + boost, 8)
      confidence >= 65 -> min(base_leverage + boost, 7)
      true -> base_leverage
    end
  end

  defp calculate_margin_position(balance, price, leverage, confidence, position_slot \\ 1) do
    if @use_prime_scaling do
      calculate_prime_position(balance, price, leverage, position_slot)
    else
      calculate_percentage_position(balance, price, leverage, confidence, position_slot)
    end
  end

  defp calculate_prime_position(available_balance, price, leverage, position_slot) do
    capped_slot = min(max(position_slot, 1), 12)  # Up to 12 positions
    allocation = Map.get(@prime_allocation, capped_slot, %{prime: 139})
    base_margin = allocation.prime
    margin = min(base_margin * 1.0, available_balance * 0.90)  # 90% max
    notional = margin * leverage
    quantity = notional / price
    
    {margin, quantity, notional}
  end

  defp calculate_percentage_position(balance, price, leverage, confidence, _position_slot) do
    position_pct = cond do
      confidence >= 85 -> 0.03
      confidence >= 75 -> 0.025
      confidence >= 65 -> 0.02
      true -> 0.015
    end
    
    margin = balance * position_pct
    notional = margin * leverage
    quantity = notional / price
    
    {margin, quantity, notional}
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # TIER HELPERS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp get_asset_tier(symbol) do
    cond do
      symbol in @tier1_ultra_volatile -> :tier1
      symbol in @tier2_high_volatile -> :tier2
      symbol in @tier3_medium_volatile -> :tier3
      symbol in @tier4_low_volatile -> :tier4
      true -> :tier2  # Default to tier2 for unknown
    end
  end

  defp get_leverage(symbol, state) do
    Map.get(state.leverage_settings, symbol) || 
    Map.get(@leverage_tiers, symbol) ||
    Map.get(@tier_leverage_map, get_asset_tier(symbol), @default_leverage)
  end

  defp get_tier_max_hold(symbol), do: Map.get(@tier_max_hold, get_asset_tier(symbol), @max_hold_minutes)

  defp get_target_price(signal) do
    cond do
      is_map(signal.physics) ->
        case signal.direction do
          :long -> Map.get(signal.physics, :peak_price)
          :short -> Map.get(signal.physics, :trough_price) || Map.get(signal.physics, :peak_price)
          _ -> nil
        end
      Map.get(signal, :target_price) -> to_float(signal.target_price)
      Map.get(signal, :take_profit) -> to_float(signal.take_profit)
      true -> nil
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # EXCHANGE INTERACTION
  # ═══════════════════════════════════════════════════════════════════════════════

  defp execute_futures_order(symbol, direction, quantity, leverage, entry_price, order_type) do
    case get_current_price(symbol) do
      {:ok, current_price} ->
        executed_price = if order_type == :limit, do: entry_price || current_price, else: current_price
        {:ok, %{order_id: "SIM_#{:erlang.system_time(:millisecond)}", executed_price: executed_price, executed_qty: quantity, status: :filled}}
      error -> error
    end
  end

  defp execute_close_order(symbol, _direction, quantity) do
    case get_current_price(symbol) do
      {:ok, price} -> {:ok, %{executed_price: price, executed_qty: quantity, status: :filled}}
      error -> error
    end
  end

  defp get_current_price(symbol) do
    case :ets.lookup(:binance_ticker_cache, symbol) do
      [{^symbol, ticker}] when is_map(ticker) ->
        price = ticker[:last_price] || ticker[:price]
        if price, do: {:ok, to_float(price)}, else: fetch_price_http(symbol)
      _ -> fetch_price_http(symbol)
    end
  rescue
    _ -> fetch_price_http(symbol)
  end

  defp fetch_price_http(symbol) do
    url = "https://testnet.binance.vision/api/v3/ticker/price?symbol=#{symbol}"
    case HTTPoison.get(url, [], timeout: 2000, recv_timeout: 2000) do
      {:ok, %{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"price" => p}} -> {:ok, String.to_float(p)}
          _ -> {:error, :decode_error}
        end
      _ -> {:error, :http_error}
    end
  rescue
    _ -> {:error, :exception}
  end

  defp get_margin_balance do
    case VirtualBalanceManager.get_balance("default") do
      {:ok, %{available: balance}} -> balance
      {:ok, %{total: balance}} -> balance
      _ -> 1000.0
    end
  end

  defp update_prices(state) do
    symbols = state.positions |> Map.values() |> Enum.map(& &1.symbol) |> Enum.uniq()
    new_cache = Enum.reduce(symbols, state.price_cache, fn symbol, cache ->
      case get_current_price(symbol) do
        {:ok, price} -> Map.put(cache, symbol, price)
        _ -> cache
      end
    end)
    %{state | price_cache: new_cache}
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # DISPLAY
  # ═══════════════════════════════════════════════════════════════════════════════

  defp print_dashboard(status) do
    IO.puts("""
    
    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║  ⚡ VELOCITY HARVESTER #{status.version}                                     ║
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  Status:           #{if status.active, do: "🟢 ACTIVE", else: "🔴 STOPPED"}
    ║  Uptime:           #{status.uptime_formatted}
    ║  Positions:        #{status.open_positions}/#{status.max_positions}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  P&L:              #{format_pnl(status.total_pnl)}
    ║  Win Rate:         #{status.win_rate}%
    ║  Trades/Hour:      #{status.trades_per_hour}
    ║  Compounds:        #{status.compound_count}
    ║  🌀 Coiled Springs: #{status.coiled_spring_trades}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  📝 Log: #{status.log_file}
    ╚══════════════════════════════════════════════════════════════════════════════╝
    """)
  end

  defp format_pnl(pnl) when pnl >= 0, do: "+$#{Float.round(pnl * 1.0, 2)}"
  defp format_pnl(pnl), do: "-$#{Float.round(abs(pnl) * 1.0, 2)}"

  defp format_uptime(seconds) do
    hours = div(seconds, 3600)
    minutes = div(rem(seconds, 3600), 60)
    secs = rem(seconds, 60)
    "#{hours}h #{minutes}m #{secs}s"
  end

  defp log_hourly_performance(state) do
    uptime_hours = if state.started_at, do: DateTime.diff(DateTime.utc_now(), state.started_at) / 3600, else: 0
    if uptime_hours > 0 do
      Logger.info("📊 $#{Float.round(state.total_pnl * 1.0 / uptime_hours, 2)}/hr | #{state.total_trades} trades | #{state.compound_count} compounds | 🌀 #{Map.get(state, :coiled_spring_trades, 0)}")
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # HELPERS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp to_float(nil), do: nil
  defp to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp to_float(n) when is_float(n), do: n
  defp to_float(n) when is_integer(n), do: n * 1.0
  defp to_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> nil
    end
  end
  defp to_float(_), do: nil
end