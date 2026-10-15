defmodule TradeEngine.Orchestrator.MarginScalper1 do
  @moduledoc """
  ⚡ MARGIN SCALPER v15.2 - RELAX WINDOW EDITION
  
  ═══════════════════════════════════════════════════════════════════════════════
  🌊 OCEAN SWEEP + 🔄 RELAX WINDOW = Bidirectional Capture
  ═══════════════════════════════════════════════════════════════════════════════
  
  NEW in v15.2: RELAX WINDOW for bidirectional profit capture
  
  The Concept (from Hudson's diagrams):
  ─────────────────────────────────────────────────────────────────────────────
  
      Price moves in stair-step patterns (P1 → P2 → P3 → P4)
      
      BULLISH ↗ → PEAK → [RELAX 5-30s] → Confirm BEARISH? → SHORT ↘
                                                                ↓
      BULLISH ↗ ← [RELAX 5-30s] ← TROUGH ← ──────────────────────┘
      
  The "Relax Window":
  - At PEAK (high energy): Pause, observe 5-30s for BEARISH confirmation → Flip SHORT
  - At TROUGH (low energy): Pause, observe 5-30s for BULLISH confirmation → Flip LONG
  - Captures BOTH directions continuously
  - Physics model identifies peaks/troughs via energy zones
  
  ═══════════════════════════════════════════════════════════════════════════════
  """

  use GenServer
  require Logger

  alias TradeEngine.Risk.VirtualBalanceManager
  alias TradeEngine.Analytics.HFTPerformance
  alias TradeEngine.AI.{Brain, Bridge, FeatureExtractor}
  @pubsub TradeEngine.PubSub

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🔄 RELAX WINDOW CONFIGURATION (NEW in v15.2)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @enable_relax_window true           # Master switch for relax window feature
  @relax_min_seconds 5                # Minimum observation at reversal
  @relax_max_seconds 30               # Maximum wait for confirmation  
  @relax_confirm_signals 3            # Signals needed to confirm flip
  @relax_confirm_ratio 0.6            # 60% of signals must confirm direction
  @relax_min_confidence 60            # Minimum confidence for confirming signal
  
  # Energy thresholds for peak/trough detection
  @peak_energy_threshold 0.80         # Energy >= 80% indicates PEAK (apex)
  @trough_energy_threshold 0.20       # Energy <= 20% indicates TROUGH (bottom)
  
  # Only flip if current position is profitable
  @relax_min_profit_to_flip 0.0       # Minimum profit before considering flip (0 = any profit)

  # ═══════════════════════════════════════════════════════════════════════════════
  # LEVERAGE & MARGIN CONFIGURATION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @default_leverage 3
  @max_leverage 10
  @margin_mode :isolated

  # ═══════════════════════════════════════════════════════════════════════════════
  # 1️⃣ GRAVITY NET ENTRY (Limit Orders Only)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @use_limit_orders true
  @limit_order_depth 0.5
  @limit_order_timeout_ms 30_000
  @maker_fee_pct 0.0002
  @taker_fee_pct 0.0004
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 2️⃣ STEEL NET FILTER (Quality Control)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @min_confidence_long 65             # Was 65. Now accepts 50%+ signals.
  @min_confidence_short 65            # Was 65. Now accepts 50%+ signals.
  @min_projected_move_pct 0.002       # 0.0035
  @min_energy_level :medium
  @fee_floor_multiplier 3.0
  @use_ai_brain true
  @ai_min_confidence 0.65


  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 3️⃣ ASSET WHITELIST
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @priority_assets ~w(SOLUSDT NEARUSDT SUIUSDT APTUSDT INJUSDT PEPEUSDT 1000PEPEUSDT 
                      WIFUSDT BONKUSDT FLOKIUSDT ARBUSDT OPUSDT SEIUSDT TIAUSDT)
  
  @blocked_assets ~w(BTCUSDT ETHUSDT BNBUSDT)
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 4️⃣ PHYSICS TRAJECTORY EXIT
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @use_physics_exits true
  @max_hold_minutes 30  # 45 mins
  @fallback_stop_loss_pct 0.008
  @fallback_take_profit_pct 0.015
  
  @tier_max_hold %{
    tier1: 10,   # Ultra-volatile (Memes): 10 mins
    tier2: 12,   # High-volatile (XRP, ADA): 12 mins
    tier3: 30,   # Mid-volatile (SOL, LINK): 15 mins
    tier4: 0     # Blocked
  }
  


  # ═══════════════════════════════════════════════════════════════════════════════
  # 5️⃣ FEE-AWARE TRAILING STOP
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @trailing_activation_fee_multiple 3.0
  @trailing_stop_distance_pct 0.003
  @trailing_ratchet_pct 0.001
  @trailing_stop_distance 0.20
  @stop_loss_pct 0.008
  @take_profit_pct 0.015
  @volatility_buffer_pct 0.072  # 7.2% reserved
  @max_daily_drawdown_pct 5.0  # Pause if down 5% in a day
  @max_consecutive_losses 8    # Pause and analyze

  # ═══════════════════════════════════════════════════════════════════════════════
  # POSITION SIZING
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @max_positions 8
  @base_position_pct 0.025
  @max_position_pct 0.04
  @max_loss_per_trade_pct 0.005
  @max_loss_per_trade_usd 5.0
  
  @leverage_tiers %{
    "SOLUSDT" => 4, "NEARUSDT" => 4, "SUIUSDT" => 4, "APTUSDT" => 4, "INJUSDT" => 4,
    "PEPEUSDT" => 3, "1000PEPEUSDT" => 3, "WIFUSDT" => 3,
    "XRPUSDT" => 5, "ADAUSDT" => 5, "DOGEUSDT" => 4, "ARBUSDT" => 4, "OPUSDT" => 4
  }

 @use_prime_scaling true
  
 @prime_allocation %{
  1 => %{prime: 101, pct: 0.101},  # $101
  2 => %{prime: 103, pct: 0.103},  # $103
  3 => %{prime: 107, pct: 0.107},  # $107
  4 => %{prime: 109, pct: 0.109},  # $109
  5 => %{prime: 113, pct: 0.113},  # $113
  6 => %{prime: 127, pct: 0.127},  # $127
  7 => %{prime: 131, pct: 0.131},  # $131
  8 => %{prime: 137, pct: 0.137}   # $137
}
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # PROFIT PROTECTION & DAILY SCHEDULE
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @session_profit_lock_pct 0.5
  @daily_target_usd 85.0
  @compound_interval_minutes 30
  @daily_close_hour 23
  @daily_close_minute 45
  @daily_resume_hour 0
  @daily_resume_minute 15
  @liquidation_buffer 0.8
  @physics_history_size 4

  @futures_testnet_url "https://testnet.binancefuture.com"

  # ═══════════════════════════════════════════════════════════════════════════════
  # VOLATILITY TIERS
  # ═══════════════════════════════════════════════════════════════════════════════

  @tier1_ultra_volatile ~w(PEPEUSDT SHIBUSDT FLOKIUSDT BONKUSDT LUNCUSDT 1000PEPEUSDT 
                           1000SHIBUSDT 1000FLOKIUSDT 1000BONKUSDT 1000LUNCUSDT 
                           BTTCUSDT HOTUSDT WIFUSDT MEMEUSDT PEOPLEUSDT)

  @tier2_high_volatile ~w(DOGEUSDT XRPUSDT ADAUSDT TRXUSDT VETUSDT ALGOUSDT XLMUSDT 
                          ICPUSDT FILUSDT GALAUSDT SANDUSDT MANAUSDT APEUSDT CRVUSDT 
                          LDOUSDT ARBUSDT OPUSDT SUIUSDT SEIUSDT TIAUSDT)

  @tier3_medium_volatile ~w(SOLUSDT LINKUSDT AVAXUSDT DOTUSDT ATOMUSDT NEARUSDT APTUSDT 
                            INJUSDT UNIUSDT AAVEUSDT MKRUSDT LTCUSDT BCHUSDT ETCUSDT RUNEUSDT)

  @tier4_low_volatile ~w(BTCUSDT ETHUSDT BNBUSDT)

  @tradeable_assets @tier1_ultra_volatile ++ @tier2_high_volatile ++ 
                    @tier3_medium_volatile ++ @tier4_low_volatile

  @tier_leverage %{tier1: 3, tier2: 3, tier3: 4, tier4: 5}
  @tier_take_profit %{tier1: 0.012, tier2: 0.015, tier3: 0.018, tier4: 0.020}
  @tier_stop_loss %{tier1: 0.015, tier2: 0.012, tier3: 0.010, tier4: 0.008}

  # Profit targets (for logging)
  @min_profit_target 0.50
  @ideal_profit_target 2.00

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
  
  @doc "View active relax windows"
  def relax_windows, do: GenServer.call(__MODULE__, :relax_windows, 10_000)
  
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
    Logger.info("""
    
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 OCEAN SWEEP v15.2 + RELAX WINDOW - Bidirectional Capture
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 
    🌊 NEW: RELAX WINDOW for bidirectional profit capture!
    🌊 
    🌊 FLOW:
    🌊   LONG ↗ → PEAK → [RELAX #{@relax_min_seconds}-#{@relax_max_seconds}s] → BEARISH? → SHORT ↘
    🌊   SHORT ↘ → TROUGH → [RELAX #{@relax_min_seconds}-#{@relax_max_seconds}s] → BULLISH? → LONG ↗
    🌊 
    🌊 SETTINGS:
    🌊 ├─ Relax Window:   #{if @enable_relax_window, do: "✅ ENABLED", else: "❌ DISABLED"}
    🌊 ├─ Peak Energy:    >= #{@peak_energy_threshold * 100}%
    🌊 ├─ Trough Energy:  <= #{@trough_energy_threshold * 100}%
    🌊 ├─ Confirm Signals: #{@relax_confirm_signals} (#{@relax_confirm_ratio * 100}% ratio)
    🌊 ├─ Leverage:       #{@default_leverage}x (dynamic)
    🌊 ├─ Max Positions:  #{@max_positions}
    🌊 
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    """)

    Phoenix.PubSub.subscribe(@pubsub, "signals:all")

    state = %{
      trading_active: false,
      started_at: nil,
      positions: %{},
      
      # 🔄 RELAX WINDOW STATE (NEW)
      relax_windows: %{},           # symbol => relax_window_data
      relax_flips: 0,               # Count of successful flips
      relax_timeouts: 0,            # Count of timeouts (no confirmation)
      
      # Statistics
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_pnl: 0.0,
      total_fees: 0.0,
      largest_win: 0.0,
      largest_loss: 0.0,
      
      # Signals
      signals_received: 0,
      signals_traded: 0,
      signals_filtered: 0,
      
      # Caches
      recent_signals: %{},
      price_cache: %{},
      energy_cache: %{},            # symbol => last_energy_level (NEW)
      
      leverage_settings: @leverage_tiers,
      margin_balance: 0.0,
      available_margin: 0.0,
      
      # Analytics
      trades_history: [],
      balance_history: [],
      completed_trades: [],
      hourly_pnl: [],
      
      # Compounding
      starting_balance: 0.0,
      session_profit: 0.0,
      locked_profit: 0.0,
      last_compound_at: nil,
      compound_count: 0,
      
      # Daily schedule
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
    
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 OCEAN SWEEP v15.2 + RELAX WINDOW ACTIVE
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 Strategy: Gravity Net entry + Physics exits + Bidirectional flips
    🌊 Relax Window: #{if @enable_relax_window, do: "✅ ENABLED", else: "❌ DISABLED"}
    🌊 Peak Detection: Energy >= #{@peak_energy_threshold * 100}%
    🌊 Trough Detection: Energy <= #{@trough_energy_threshold * 100}%
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    # Start monitoring loops
    Process.send_after(self(), :check_positions, 1_000)
    Process.send_after(self(), :update_prices, 1_000)
    Process.send_after(self(), :check_trailing_stops, 1_000)
    Process.send_after(self(), :check_relax_timeouts, 2_000)  # NEW: Relax timeout check
    Process.send_after(self(), :log_performance, 60_000)
    Process.send_after(self(), :compound_profits, @compound_interval_minutes * 60_000)
    Process.send_after(self(), :check_daily_schedule, 60_000)
    
    margin_balance = get_margin_balance()
    
    {:noreply, %{state | 
      trading_active: true, 
      started_at: DateTime.utc_now(),
      margin_balance: margin_balance,
      available_margin: margin_balance,
      starting_balance: margin_balance,
      session_profit: 0.0,
      last_compound_at: DateTime.utc_now(),
      daily_profit: 0.0,
      trades_today: 0
    }}
  end

  @impl true
  def handle_cast(:stop_trading, state) do
    Logger.info("🔴 MARGIN SCALPER STOPPED")
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
      uptime_seconds: uptime,
      uptime_formatted: format_uptime(uptime),
      open_positions: map_size(state.positions),
      max_positions: @max_positions,
      realized_pnl: Float.round(state.total_pnl, 2),
      unrealized_pnl: Float.round(unrealized_pnl, 2),
      total_pnl: Float.round(state.total_pnl + unrealized_pnl, 2),
      total_fees: Float.round(state.total_fees, 2),
      total_trades: state.total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades,
      win_rate: win_rate,
      largest_win: Float.round(state.largest_win, 2),
      largest_loss: Float.round(state.largest_loss, 2),
      signals_received: state.signals_received,
      signals_traded: state.signals_traded,
      signals_filtered: state.signals_filtered,
      margin_balance: Float.round(state.margin_balance, 2),
      available_margin: Float.round(state.available_margin, 2),
      leverage: @default_leverage,
      # 🔄 RELAX WINDOW STATS
      relax_windows_active: map_size(state.relax_windows),
      relax_flips: state.relax_flips,
      relax_timeouts: state.relax_timeouts,
      trades_per_hour: if(uptime > 0, do: Float.round(state.total_trades / (uptime / 3600), 1), else: 0),
      pnl_per_hour: if(uptime > 0, do: Float.round(state.total_pnl / (uptime / 3600), 2), else: 0),
      errors: state.errors,
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
          unrealized_pnl: Float.round(pnl, 2),
          unrealized_pnl_pct: Float.round(pnl_pct, 1),
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
  def handle_call(:account_info, _from, state) do
    info = %{
      margin_balance: state.margin_balance,
      available_margin: state.available_margin,
      used_margin: state.margin_balance - state.available_margin,
      leverage: @default_leverage,
      margin_mode: @margin_mode,
      open_positions: map_size(state.positions),
      relax_windows: map_size(state.relax_windows)
    }
    {:reply, info, state}
  end

  @impl true
  def handle_call(:analytics, _from, state) do
    # Simplified analytics
    report = """
    
    📊 ANALYTICS REPORT
    ═══════════════════════════════════════════════════════════════
    Total Trades:    #{state.total_trades}
    Win Rate:        #{if (state.winning_trades + state.losing_trades) > 0, do: Float.round(state.winning_trades / (state.winning_trades + state.losing_trades) * 100, 1), else: 0}%
    Total P&L:       $#{Float.round(state.total_pnl, 2)}
    Largest Win:     $#{Float.round(state.largest_win, 2)}
    Largest Loss:    $#{Float.round(state.largest_loss, 2)}
    
    🔄 RELAX WINDOW STATS
    Successful Flips: #{state.relax_flips}
    Timeouts:         #{state.relax_timeouts}
    Active Windows:   #{map_size(state.relax_windows)}
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
      relax_timeouts: state.relax_timeouts
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
    
    # Also clear relax windows
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
      state = HFTPerformance.increment_throughput(state)  # 🆕 Track TPS
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

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🔄 RELAX WINDOW TIMEOUT CHECK (NEW)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @impl true
  def handle_info(:check_relax_timeouts, state) do
    if state.trading_active do
      Process.send_after(self(), :check_relax_timeouts, 2_000)
      
      now = DateTime.utc_now()
      
      {expired, active} = state.relax_windows
      |> Enum.split_with(fn {_symbol, relax} ->
        DateTime.diff(now, relax.started_at, :second) >= @relax_max_seconds
      end)
      
      # Log expired windows
      Enum.each(expired, fn {symbol, relax} ->
        Logger.info("⏰ [RELAX] #{symbol} window expired - no #{relax.expected_direction} confirmation")
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
    end
    {:noreply, state}
  end

  @impl true
  def handle_info(:compound_profits, state) do
    if state.trading_active do
      Process.send_after(self(), :compound_profits, @compound_interval_minutes * 60_000)
      
      session_profit = state.total_pnl - state.locked_profit
      
      if session_profit > 0 do
        lock_amount = session_profit * @session_profit_lock_pct
        new_locked = state.locked_profit + lock_amount
        new_balance = state.starting_balance + state.total_pnl
        
        Logger.info("💰 Compound ##{state.compound_count + 1}: Locked $#{Float.round(lock_amount, 2)}")
        
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
          Logger.info("🌊 DAILY CLOSE - 23:45 UTC")
          state = close_all_positions(state, :daily_close)
          report_daily_performance(state)
          {:noreply, %{state | daily_closed: true, trading_paused: true, relax_windows: %{}}}
        
        hour == @daily_resume_hour and minute >= @daily_resume_minute and state.daily_closed ->
          Logger.info("🌊 NEW DAY - RESUMING at 00:15 UTC")
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
  # CANDLEBRIDGE SIGNAL PROCESSING
  # ═══════════════════════════════════════════════════════════════════════════════

  defp process_candlebridge_signal(signal, state) do
    symbol = signal[:symbol] || signal["symbol"]
    direction = signal[:direction] || signal["direction"]
    confidence = signal[:confidence] || signal["confidence"] || 50
    
    direction = normalize_direction(direction)
    
    # Cache energy level for reversal detection
    energy_level = extract_energy_level(signal)
    state = %{state | energy_cache: Map.put(state.energy_cache, symbol, energy_level)}
    
    now = DateTime.utc_now()

    # Rate limit: 20 seconds between same symbol
    last = Map.get(state.recent_signals, symbol)
    if last && DateTime.diff(now, last, :second) < 20 do
      state
    else
      normalized_signal = %{
        symbol: symbol,
        direction: direction,
        confidence: confidence,
        entry_price: to_float(signal[:entry_price] || signal[:current_price]),
        current_price: to_float(signal[:current_price] || signal[:entry_price]),
        stop_loss: to_float(signal[:stop_loss]),
        take_profit: to_float(signal[:take_profit]),
        momentum: signal[:momentum] || 0,
        peak_price: signal[:peak_price],
        peak_time: signal[:peak_time],
        energy_zones: signal[:energy_zones] || %{},
        physics: %{
          momentum: signal[:momentum] || 0,
          velocity: signal[:velocity] || 0,
          gravity: signal[:gravity] || 0,
          peak_price: signal[:peak_price],
          kinetic_energy: signal[:kinetic_energy]
        }
      }
      
      new_state = %{state |
        signals_received: state.signals_received + 1,
        recent_signals: Map.put(state.recent_signals, symbol, now)
      }
      
      # 🔄 RELAX WINDOW: Feed signal if in relax window for this symbol
      new_state = if Map.has_key?(new_state.relax_windows, symbol) do
        feed_relax_window(symbol, normalized_signal, new_state)
      else
        new_state
      end
      
      # Only trade if NOT in relax window
      if not Map.has_key?(new_state.relax_windows, symbol) and should_trade_margin?(normalized_signal, new_state) do
        execute_margin_trade(normalized_signal, new_state)
      else
        %{new_state | signals_filtered: new_state.signals_filtered + 1}
      end
    end
  end

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

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🔄 RELAX WINDOW FUNCTIONS (NEW)
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc """
  Check if position has reached a peak or trough - enter relax window.
  """
  defp check_for_reversal_point(pos, current_price, state) do
    energy_level = Map.get(state.energy_cache, pos.symbol, 0.5)
    current_pnl = calculate_position_pnl(pos, current_price)
    
    cond do
      # Not enabled
      not @enable_relax_window ->
        :continue
      
      # Already in relax window
      Map.has_key?(state.relax_windows, pos.symbol) ->
        :in_relax
      
      # Must be profitable to flip
      current_pnl < @relax_min_profit_to_flip ->
        :continue
      
      # LONG at PEAK → Flip to SHORT
      pos.direction == :long and energy_level >= @peak_energy_threshold ->
        {:enter_relax, :peak, :short, energy_level}
      
      # SHORT at TROUGH → Flip to LONG
      pos.direction == :short and energy_level <= @trough_energy_threshold ->
        {:enter_relax, :trough, :long, energy_level}
      
      true ->
        :continue
    end
  end

  @doc """
  Enter relax window - close current position and start observing.
  """
  defp enter_relax_window(pos, reversal_type, expected_direction, energy_level, state) do
    Logger.info("""
    
    ⏸️ ═══════════════════════════════════════════════════════════════════════════════
    ⏸️ [RELAX WINDOW] Entering observation phase
    ⏸️ ═══════════════════════════════════════════════════════════════════════════════
    ⏸️ Symbol:        #{pos.symbol}
    ⏸️ Reversal:      #{reversal_type} (energy: #{Float.round(energy_level * 100, 1)}%)
    ⏸️ Looking for:   #{expected_direction}
    ⏸️ Observing:     #{@relax_min_seconds}-#{@relax_max_seconds} seconds
    ⏸️ ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    # Close current position with profit
    state = close_position(pos, state, :"#{reversal_type}_reached")
    
    # Create relax window
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

  @doc """
  Feed signal to relax window - collect confirmation signals.
  """
  defp feed_relax_window(symbol, signal, state) do
    case Map.get(state.relax_windows, symbol) do
      nil -> 
        state
      
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
          # Enough signals AND minimum time → check confirmation
          length(updated_relax.signals) >= @relax_confirm_signals and elapsed >= @relax_min_seconds ->
            check_relax_confirmation(symbol, updated_relax, state)
          
          # Still collecting
          true ->
            %{state | relax_windows: Map.put(state.relax_windows, symbol, updated_relax)}
        end
    end
  end

  @doc """
  Check if collected signals confirm the expected direction.
  """
  defp check_relax_confirmation(symbol, relax, state) do
    confirming = Enum.count(relax.signals, fn sig ->
      sig.direction == relax.expected_direction and
      sig.confidence >= @relax_min_confidence
    end)
    
    total = length(relax.signals)
    ratio = confirming / max(total, 1)
    
    if ratio >= @relax_confirm_ratio do
      Logger.info("""
      
      ✅ ═══════════════════════════════════════════════════════════════════════════════
      ✅ [RELAX CONFIRMED] #{symbol} FLIP to #{relax.expected_direction}!
      ✅ ═══════════════════════════════════════════════════════════════════════════════
      ✅ Confirmation: #{confirming}/#{total} signals (#{Float.round(ratio * 100, 1)}%)
      ✅ Reversal:     #{relax.reversal_type} → #{relax.expected_direction}
      ✅ ═══════════════════════════════════════════════════════════════════════════════
      """)
      
      # Remove relax window
      state = %{state | 
        relax_windows: Map.delete(state.relax_windows, symbol),
        relax_flips: state.relax_flips + 1
      }
      
      # Create flip signal
      flip_signal = %{
        symbol: symbol,
        direction: relax.expected_direction,
        confidence: 70,
        entry_price: Map.get(state.price_cache, symbol, relax.entry_price),
        current_price: Map.get(state.price_cache, symbol, relax.entry_price),
        energy_zones: %{energy_level: :medium},
        physics: %{}
      }
      
      # Execute flip trade
      execute_margin_trade(flip_signal, state)
    else
      %{state | relax_windows: Map.put(state.relax_windows, symbol, relax)}
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # SIGNAL VALIDATION
  # ═══════════════════════════════════════════════════════════════════════════════
  defp should_trade_margin?(signal, state) do
    symbol = signal.symbol
    direction = signal.direction
    confidence = signal.confidence || 0
    
    energy_level = get_in(signal, [:energy_zones, :energy_level]) ||
                  get_in(signal, [:physics, :energy_zones, :energy_level]) || 
                  :medium

    cond do
      # Quick rejections
      symbol in @blocked_assets -> false
      state.trading_paused -> false
      symbol not in @tradeable_assets -> false
      direction not in [:long, :short] -> false
      has_position?(symbol, state) -> false
      map_size(state.positions) >= @max_positions -> false
      
      # 🧠 AI BRAIN MODE
      @use_ai_brain ->
        features = build_ai_features(signal, state)
        
        case Brain.decide(features, timeout: 50) do
          {:ok, %{action: ai_action, confidence: ai_conf}} when ai_action in [:long, :short] ->
            if ai_conf >= @ai_min_confidence do
              Logger.info("🧠 AI APPROVED #{symbol} #{ai_action} @ #{Float.round(ai_conf * 100, 1)}%")
              true
            else
              false
            end
          
          {:ok, _} -> 
            false
            
          {:error, _} ->
            # Fallback to physics
            physics_filter(signal, direction, confidence, energy_level)
        end
      
      # Physics-only mode
      true ->
        physics_filter(signal, direction, confidence, energy_level)
    end
  end

  defp physics_filter(signal, direction, confidence, energy_level) do
    cond do
      direction == :long and confidence < @min_confidence_long -> false
      direction == :short and confidence < @min_confidence_short -> false
      energy_level == :low and confidence < 65 -> false
      not has_sufficient_projected_move?(signal) -> false
      @use_physics_exits and not has_valid_physics_zones?(signal) -> false
      true ->
        priority = if signal.symbol in @priority_assets, do: "⭐ PRIORITY", else: "✅ APPROVED"
        Logger.info("🌊 #{priority} #{signal.symbol} #{direction} #{confidence}%")
        true
    end
  end

  defp build_ai_features(signal, state) do
    physics = signal[:physics] || signal.physics || %{}
    energy_zones = signal[:energy_zones] || physics[:energy_zones] || %{}
    zone_distances = energy_zones[:zone_distances] || %{}
    
    price = signal.current_price || signal.entry_price || 1.0
    
    # Get momentum - normalize large values
    raw_momentum = physics[:momentum] || physics[:velocity] || 0.0
    momentum = cond do
      raw_momentum > 1.0 -> min(raw_momentum / 10.0, 1.0)
      raw_momentum < -1.0 -> max(raw_momentum / 10.0, -1.0)
      true -> raw_momentum
    end
    
    # Check for existing position
    position = state.positions |> Map.values() |> Enum.find(& &1.symbol == signal.symbol)
    pnl = if position, do: (position[:unrealized_pnl_pct] || 0.0) / 100.0, else: 0.0
    
    %{
      momentum: momentum,
      gravity: physics[:gravity] || 0.0001,
      kinetic_energy: energy_zones[:kinetic_energy] || physics[:kinetic_energy] || 0.0,
      dist_to_peak_pct: safe_pct(zone_distances[:to_peak], price),
      dist_to_injection_pct: safe_pct(zone_distances[:to_injection], price),
      unrealized_pnl_pct: max(-1.0, min(1.0, pnl))
    }
  end

  defp safe_pct(nil, _), do: 0.0
  defp safe_pct(_, 0), do: 0.0
  defp safe_pct(_, 0.0), do: 0.0
  defp safe_pct(dist, price), do: max(-0.1, min(0.1, dist / price))

  defp has_stable_physics_prediction?(signal, state) do
    symbol = signal.symbol
    direction = signal.direction
    
    history = Map.get(state.physics_history, symbol, [])
    
    if length(history) < 4 do
      false  # Not enough history, skip
    else
      # All 3 recent predictions should agree on direction
      Enum.all?(history, fn pred -> 
        pred.direction == direction and pred.time_to_target > 10  # At least 10 min
      end)
    end
  end


  defp should_trade_margin2?(signal, state) do
    symbol = signal.symbol
    direction = signal.direction
    confidence = signal.confidence || 0
    
    energy_level = get_in(signal, [:energy_zones, :energy_level]) ||
                   get_in(signal, [:physics, :energy_zones, :energy_level]) || 
                   :medium

    cond do
      symbol in @blocked_assets -> false
      state.trading_paused -> false
      symbol not in @tradeable_assets -> false
      direction not in [:long, :short] -> false
      has_position?(symbol, state) -> false
      map_size(state.positions) >= @max_positions -> false
      direction == :long and confidence < @min_confidence_long -> false
      direction == :short and confidence < @min_confidence_short -> false
      energy_level == :low and confidence < 65 -> false
      not has_sufficient_projected_move?(signal) -> false
      @use_physics_exits and not has_valid_physics_zones?(signal) -> false
      true ->
        priority = if symbol in @priority_assets, do: "⭐ PRIORITY", else: "✅ APPROVED"
        Logger.info("🌊 #{priority} #{symbol} #{direction} #{confidence}%")
        true
    end
  end

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

    case get_current_price(symbol) do
      {:ok, current_price} ->
        base_leverage = get_leverage(symbol, state)
        leverage = calculate_dynamic_leverage(base_leverage, confidence)
        position_slot = map_size(state.positions) + 1
        
        {margin, position_size, notional} = calculate_margin_position(
          state.margin_balance, current_price, leverage, confidence, position_slot
        )

        entry_price = if @use_limit_orders do
          calculate_limit_entry(signal, current_price, direction)
        else
          current_price
        end

        {stop_loss, take_profit} = if @use_physics_exits do
          calculate_physics_exits(signal, current_price, direction)
        else
          impulse_pct = calculate_impulse_pct(signal, current_price)
          calculate_sl_tp(current_price, direction, impulse_pct, leverage, symbol)
        end
        
        fee_rate = if @use_limit_orders, do: @maker_fee_pct, else: @taker_fee_pct
        entry_fee = notional * fee_rate
        liquidation_price = calculate_liquidation_price(current_price, direction, leverage)
        safe_stop = ensure_safe_stop(stop_loss, liquidation_price, direction)
        position_id = Ecto.UUID.generate()
        order_type = if @use_limit_orders, do: :limit, else: :market

        case execute_futures_order(symbol, direction, position_size, leverage, entry_price, order_type) do
          {:ok, order_result} ->
            # 🆕 HFT: Record execution latency
            latency_us = System.monotonic_time(:microsecond) - start_time
            
            executed_price = order_result[:executed_price] || entry_price
            executed_qty = order_result[:executed_qty] || position_size
            pos_impulse_pct = calculate_impulse_pct(signal, executed_price)
            
            # 🆕 HFT: Calculate entry slippage
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
              impulse_pct: pos_impulse_pct,
              opened_at: DateTime.utc_now(),
              max_hold_until: DateTime.add(DateTime.utc_now(), get_tier_max_hold(symbol) * 60, :second),
              highest_price: executed_price,
              lowest_price: executed_price,
              fee: entry_fee,
              order_id: order_result[:order_id],
              order_type: order_type,
              entry_slippage: entry_slippage,  # 🆕 Track for analytics
              entry_latency_us: latency_us     # 🆕 Track for analytics
            }

            direction_emoji = if direction == :long, do: "🟢", else: "🔴"
            Logger.info("#{direction_emoji} OPENED #{symbol} #{direction} @ $#{Float.round(executed_price, 4)} (#{leverage}x) [#{latency_us}μs]")

            # 🆕 HFT: Update analytics state
            state
            |> HFTPerformance.record_latency(latency_us)
            |> HFTPerformance.increment_throughput()
            |> Map.merge(%{
              positions: Map.put(state.positions, position_id, position),
              signals_traded: state.signals_traded + 1,
              total_trades: state.total_trades + 1,
              total_fees: state.total_fees + entry_fee,
              available_margin: state.available_margin - margin,
              price_cache: Map.put(state.price_cache, symbol, executed_price)
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
          symbol: symbol, direction: direction, confidence: 75,
          entry_price: price, current_price: price,
          energy_zones: %{}, physics: %{}
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
        # Max loss exceeded
        current_pnl < -max_loss_usd ->
          Logger.warning("🚨 #{pos.symbol} MAX LOSS - EMERGENCY CLOSE")
          close_position(pos, acc, :max_loss_protection)
        
        # 🔄 Check for reversal point (peak/trough) when profitable
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
    distance_to_liq / entry_to_liq < 0.2
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

        # 🆕 HFT: Calculate exit slippage (vs target)
        exit_slippage = cond do
          reason == :take_profit and pos.take_profit > 0 ->
            abs(final_price - pos.take_profit) / pos.take_profit
          reason == :stop_loss and pos.stop_loss > 0 ->
            abs(final_price - pos.stop_loss) / pos.stop_loss
          true ->
            0.0
        end
        
        # 🆕 HFT: Combined slippage (entry + exit average)
        entry_slippage = Map.get(pos, :entry_slippage, 0.0)
        total_slippage = (entry_slippage + exit_slippage) / 2

        emoji = cond do
          pnl >= @ideal_profit_target -> "🎯"
          pnl >= @min_profit_target -> "✅"
          pnl >= 0 -> "➖"
          true -> "❌"
        end

        Logger.info("#{emoji} CLOSED #{pos.symbol} #{reason}: #{if pnl >= 0, do: "+", else: ""}$#{Float.round(pnl, 2)} [slip: #{Float.round(total_slippage * 100, 3)}%]")

        trade_record = Map.merge(pos, %{
          exit_price: final_price, 
          exit_reason: reason, 
          pnl: pnl, 
          pnl_pct: pnl_pct,
          close_fee: close_fee, 
          total_fees: pos.fee + close_fee,
          closed_at: DateTime.utc_now(), 
          hold_time: hold_time,
          exit_slippage: exit_slippage,      # 🆕
          total_slippage: total_slippage     # 🆕
        })

        new_balance = state.margin_balance + pnl
        balance_snapshot = {DateTime.utc_now(), new_balance}

        # 🆕 HFT: Record trade and equity for analytics
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
    Logger.info("🌊 Daily P&L: $#{Float.round(state.total_pnl, 2)} | Trades: #{state.total_trades} | Flips: #{state.relax_flips}")
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # CALCULATIONS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp calculate_margin_position2(balance, price, leverage, confidence, position_slot \\ 1) do
    position_pct = if @use_prime_scaling do
      slot = min(max(position_slot, 1), 10)
      allocation = Map.get(@prime_allocation, slot, %{pct: @base_position_pct})
      base_pct = allocation.pct
      confidence_multiplier = cond do
        confidence >= 85 -> 1.15
        confidence >= 75 -> 1.08
        true -> 1.0
      end
      base_pct * confidence_multiplier
    else
      if confidence >= 80, do: @max_position_pct, else: @base_position_pct
    end

    margin = balance * position_pct
    notional = margin * leverage
    quantity = notional / price
    {margin, quantity, notional}
  end

  defp calculate_limit_entry(signal, current_price, direction) do
    physics = signal[:physics] || %{}
    zone_distances = physics[:zone_distances] || %{}
    to_balance = zone_distances[:to_balance] || 0
    offset_pct = (to_balance / 100) * @limit_order_depth
    offset = current_price * offset_pct
    
    if direction == :long, do: current_price - offset, else: current_price + offset
  end

  defp calculate_physics_exits(signal, current_price, direction) do
    zones = get_in(signal, [:energy_zones, :zone_boundaries]) ||
            get_in(signal, [:physics, :energy_zones, :zone_boundaries]) ||
            get_in(signal, [:physics, :zone_boundaries]) || %{}
    
    injection = zones[:injection]
    peak = zones[:peak]
    
    cond do
      injection != nil and peak != nil ->
        case direction do
          :long ->
            sl = current_price * (1 - @fallback_stop_loss_pct)
            tp = to_float(peak)
            {sl, tp}
          :short ->
            sl = current_price * (1 + @fallback_stop_loss_pct)
            tp = to_float(peak)
            {sl, tp}
        end
      true ->
        sl_distance = current_price * @fallback_stop_loss_pct
        tp_distance = current_price * @fallback_take_profit_pct
        if direction == :long do
          {current_price - sl_distance, current_price + tp_distance}
        else
          {current_price + sl_distance, current_price - tp_distance}
        end
    end
  end

  defp calculate_sl_tp(entry, direction, impulse_pct, _leverage, symbol \\ nil) do
    sl_pct = if symbol, do: get_tier_stop_loss(symbol), else: @stop_loss_pct
    tp_pct = if symbol, do: get_tier_take_profit(symbol), else: @take_profit_pct
    
    sl_distance = entry * sl_pct
    tp_distance = entry * max(tp_pct, impulse_pct * 1.2)

    if direction == :long do
      {entry - sl_distance, entry + tp_distance}
    else
      {entry + sl_distance, entry - tp_distance}
    end
  end

  defp calculate_impulse_pct(signal, current_price) do
    target = get_target_price(signal) || current_price
    if current_price > 0, do: abs(target - current_price) / current_price, else: 0
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

  defp calculate_dynamic_leverage(base_leverage, confidence) do
    cond do
      confidence >= 85 -> min(base_leverage * 2, 7)
      confidence >= 75 -> min(round(base_leverage * 1.5), 5)
      confidence >= 70 -> min(base_leverage, 4)
      true -> 3
    end
  end



  defp calculate_margin_position(balance, price, leverage, confidence, position_slot \\ 1) do
    if @use_prime_scaling do
      calculate_prime_position(balance, price, leverage, position_slot)
    else
      calculate_percentage_position(balance, price, leverage, confidence, position_slot)
    end
  end

  @doc """
  Prime Sequence 928: Fixed USD allocation per slot.
  Slot 1-8 maps to $101, $103, $107, $109, $113, $127, $131, $137
  Total: $928, leaving $72 (7.2%) buffer on $1,000 account.
  """
  defp calculate_prime_position(available_balance, price, leverage, position_slot) do
    # Cap slot at 8 for risk control
    capped_slot = min(max(position_slot, 1), 8)
    
    # Get prime allocation for this slot
    allocation = Map.get(@prime_allocation, capped_slot, %{prime: 137})
    base_margin = allocation.prime
    
    # Safety: Don't exceed available balance
    margin = min(base_margin, available_balance * 0.95)
    
    # Calculate notional and quantity
    notional = margin * leverage
    quantity = notional / price
    
    # Log for monitoring
    if margin < base_margin do
      Logger.warning("[PRIME] Slot #{capped_slot}: Reduced $#{base_margin} → $#{Float.round(margin, 2)} (insufficient balance)")
    end
    
    {margin, quantity, notional}
  end

  @doc """
  Legacy percentage-based position sizing (fallback).
  """
  defp calculate_percentage_position(balance, price, leverage, confidence, position_slot) do
    position_pct = cond do
      confidence >= 85 -> 0.04
      confidence >= 75 -> 0.035
      confidence >= 65 -> 0.03
      true -> 0.025
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
      true -> :tier3
    end
  end

  defp get_leverage(symbol, state) do
    Map.get(state.leverage_settings, symbol) || Map.get(@tier_leverage, get_asset_tier(symbol), @default_leverage)
  end

  defp get_tier_take_profit(symbol), do: Map.get(@tier_take_profit, get_asset_tier(symbol), @take_profit_pct)
  defp get_tier_stop_loss(symbol), do: Map.get(@tier_stop_loss, get_asset_tier(symbol), @stop_loss_pct)
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
    case HTTPoison.get(url, [], timeout: 3000, recv_timeout: 3000) do
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
    ║  🌊 OCEAN SWEEP v15.2 + RELAX WINDOW                                         ║
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  Status:         #{if status.active, do: "🟢 ACTIVE", else: "🔴 STOPPED"}.    
    ║  Uptime:         #{status.uptime_formatted}
    ║  Positions:      #{status.open_positions}/#{status.max_positions}
    ║  Relax Windows:  #{status.relax_windows_active}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  P&L:            #{format_pnl(status.total_pnl)}
    ║  Win Rate:       #{status.win_rate}%
    ║  Flips:          #{status.relax_flips} (timeouts: #{status.relax_timeouts})
    ╚══════════════════════════════════════════════════════════════════════════════╝
    """)
  end

  defp format_pnl(pnl) when pnl >= 0, do: "+$#{Float.round(pnl, 2)}"
  defp format_pnl(pnl), do: "-$#{Float.round(abs(pnl), 2)}"

  defp format_uptime(seconds) do
    hours = div(seconds, 3600)
    minutes = div(rem(seconds, 3600), 60)
    secs = rem(seconds, 60)
    "#{hours}h #{minutes}m #{secs}s"
  end

  defp log_hourly_performance(state) do
    uptime_hours = if state.started_at, do: DateTime.diff(DateTime.utc_now(), state.started_at) / 3600, else: 0
    if uptime_hours > 0 do
      Logger.info("📊 Hourly: $#{Float.round(state.total_pnl / uptime_hours, 2)}/hr | Flips: #{state.relax_flips}")
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

  @doc """
  Consult the RL Brain for a trading decision.

  This is the main bridge function that:
  1. Extracts features from the physics signal
  2. Queries the AI Brain for a decision
  3. Returns a normalized action tuple

  ## Returns
  - `{:trade, :long | :short, confidence}` - Execute trade with given confidence
  - `{:hold, reason}` - Do not trade
  - `{:error, reason}` - AI unavailable, use physics fallback
  """
  defp consult_rl_brain(signal, state) do
    # Extract features from signal for AI input
    features = extract_ai_features(signal, state)
    
    # Query the Brain
    case Brain.decide(features, timeout: 50) do
      {:ok, decision} ->
        handle_ai_decision(decision, signal)
        
      {:error, reason} ->
        Logger.warning("[AI] Brain error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Extract features from physics signal for AI Brain input.
  """

  defp extract_ai_features(signal, state) do
    # Find any existing position for this symbol
    position = Enum.find(state.positions, fn p -> 
      p.symbol == signal.symbol 
    end)
    
    # Get physics data
    physics = signal[:physics] || %{}
    energy_zones = physics[:energy_zones] || %{}
    zone_distances = energy_zones[:zone_distances] || %{}
    
    price = signal.price || signal[:current_price] || 1.0
    
    # Build feature map
    %{
      momentum: clamp(physics[:momentum] || physics[:v0] || 0.0, -1.0, 1.0),
      gravity: physics[:gravity] || 0.0001,
      kinetic_energy: energy_zones[:kinetic_energy] || 0.0,
      dist_to_peak_pct: safe_div(zone_distances[:to_peak] || 0.0, price),
      dist_to_injection_pct: safe_div(zone_distances[:to_injection] || 0.0, price),
      unrealized_pnl_pct: if(position, do: (position.unrealized_pnl_pct || 0.0) / 100.0, else: 0.0)
    }
  end

  defp handle_ai_decision(decision, signal) do
    %{action: action, confidence: confidence, mode: mode} = decision
    
    case action do
      :hold ->
        {:hold, :ai_hold}
        
      direction when direction in [:long, :short] ->
        # Apply minimum confidence threshold
        if confidence >= 0.65 do
          Logger.info("🧠 [#{mode}] #{signal.symbol} #{direction} @ #{Float.round(confidence * 100, 1)}%")
          {:trade, direction, confidence}
        else
          {:hold, :low_confidence}
        end
    end
  end

  defp safe_div(_, 0), do: 0.0
  defp safe_div(_, 0.0), do: 0.0
  defp safe_div(num, denom), do: num / denom

  defp clamp(val, min_v, max_v) do
    val |> max(min_v) |> min(max_v)
  end


  defp process_signal(signal, state) do
    symbol = signal.symbol
    
    # First, check physics filters (keep existing logic)
    cond do
      # Skip if already have position in this symbol
      Enum.any?(state.positions, &(&1.symbol == symbol)) ->
        {:noreply, state}
      
      # Skip if at max positions
      length(state.positions) >= state.config.max_positions ->
        {:noreply, state}
      
      true ->
        # Consult AI Brain for decision
        case consult_rl_brain(signal, state) do
          {:trade, direction, confidence} ->
            # Record that we're acting on this signal
            new_state = %{state | signals_traded: state.signals_traded + 1}
            open_position(direction, signal, confidence, new_state)
          
          {:hold, reason} ->
            Logger.debug("🧠 HOLD #{symbol}: #{reason}")
            new_state = %{state | signals_filtered: state.signals_filtered + 1}
            {:noreply, new_state}
          
          {:error, _reason} ->
            # Fallback to physics-only decision
            process_signal_physics_only(signal, state)
        end
    end
  end

  # Keep your existing physics logic as fallback
  defp process_signal_physics_only(signal, state) do
    # Your existing filter logic here...
    # This is called when AI is unavailable
    {:noreply, state}
  end

  defp open_position(direction, signal, confidence, state) do
    updated_signal = %{signal | direction: direction, confidence: confidence}
    execute_margin_trade(updated_signal, state)
  end

  # ==============================================================================
  # ADD TRAINING DATA RECORDING TO close_position/3
  # ==============================================================================

  # Add this to your existing close_position function:
  defp record_trade_for_training(position, exit_info, pnl) do
    # Only record if we have entry signal data
    if position[:entry_signal] do
      features = extract_ai_features(position.entry_signal, %{positions: []})
      
      action = case position.direction do
        :long -> :long
        :short -> :short
        _ -> :hold
      end
      
      # Calculate reward: positive for profit, negative for loss
      # Scaled and clipped to [-1, 1]
      reward = cond do
        pnl > 0 -> min(pnl / 10.0, 1.0)
        pnl < 0 -> max(pnl / 10.0, -1.0)
        true -> 0.0
      end
      
      # Bonus for good exits
      reward = reward + case exit_info[:exit_type] do
        :take_profit -> 0.2
        :trailing_stop -> 0.1
        :stop_loss -> -0.1
        _ -> 0.0
      end
      
      Brain.record_outcome(features, action, min(max(reward, -1.0), 1.0))
    end
  end

  # ==============================================================================
  # ADD AI STATUS TO YOUR dashboard/0 FUNCTION
  # ==============================================================================

  # Add this to your dashboard output:
  defp ai_status_line do
    case Brain.status() do
      %{mode: :inference, avg_latency_us: latency} ->
        "║  AI Brain:      🟢 INFERENCE (#{Float.round(latency, 0)}μs avg)"
      %{mode: :heuristic, training_samples: samples} ->
        "║  AI Brain:      🟡 HEURISTIC (#{samples} samples collected)"
      _ ->
        "║  AI Brain:      🔴 OFFLINE"
    end
  end
end