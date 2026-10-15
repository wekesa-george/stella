defmodule TradeEngine.Orchestrator.MarginScalper4 do
  @moduledoc """
  ⚡ MARGIN SCALPER v16.0 - MEME COIN HUNTER + PROFIT LOCK
  Updates on Jan 18 2026 at 09:21 am but it has potential of making 25 dollars per houts 
  ═══════════════════════════════════════════════════════════════════════════════
  🔧 FIXES FROM v15.4:
    - TP direction bug FIXED (shorts now profit when price goes DOWN)
    - Expanded meme coin pool ($0.0001 - $10 range)
    - Profit protection (lock gains, don't give back to market)
    - Break-even stop loss after profit threshold
  
  💰 ARCHITECTURE:
    - $1000 capital → Target $15-35/day
    - Meme coin focus for higher volatility
    - Profit lock prevents giving back gains
  ═══════════════════════════════════════════════════════════════════════════════
  """

  use GenServer
  require Logger

  alias TradeEngine.Risk.VirtualBalanceManager
  alias TradeEngine.Analytics.HFTPerformance
  alias TradeEngine.AI.Brain
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
  # 💰 PROFIT PROTECTION - DON'T GIVE BACK GAINS
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @enable_profit_lock true
  @profit_lock_threshold 3.0        # Lock profits after $3 gain per position
  @profit_lock_percentage 0.70      # Lock 70% of gains (let 30% ride)
  @session_profit_lock_pct 0.60     # Lock 60% of session profits
  @max_profit_giveback_pct 0.30     # Never give back more than 30% of peak profit
  
  # Break-even protection
  @enable_breakeven_stop true
  @breakeven_trigger_pct 0.006      # Move SL to break-even after 0.6% profit
  @breakeven_buffer_pct 0.001       # Small buffer above entry for fees

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🔄 RELAX WINDOW CONFIGURATION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @enable_relax_window true
  @relax_min_seconds 5
  @relax_max_seconds 30
  @relax_confirm_signals 3
  @relax_confirm_ratio 0.6
  @relax_min_confidence 60
  @peak_energy_threshold 0.80
  @trough_energy_threshold 0.20
  @relax_min_profit_to_flip 0.0

  # ═══════════════════════════════════════════════════════════════════════════════
  # LEVERAGE & MARGIN CONFIGURATION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @default_leverage 5
  @max_leverage 10
  @margin_mode :isolated

  # ═══════════════════════════════════════════════════════════════════════════════
  # 1️⃣ GRAVITY NET ENTRY (Limit Orders)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @use_limit_orders true
  @limit_order_depth 0.3
  @limit_order_timeout_ms 15_000
  @maker_fee_pct 0.0002
  @taker_fee_pct 0.0004
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 2️⃣ STEEL NET FILTER (Quality Control)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @min_confidence_long 60
  @min_confidence_short 60
  @min_projected_move_pct 0.003
  @min_energy_level :medium
  @fee_floor_multiplier 2.5
  @use_ai_brain true
  @ai_min_confidence 0.55

  # ═══════════════════════════════════════════════════════════════════════════════
  # 3️⃣ EXPANDED MEME COIN POOL ($0.0001 - $10 range)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @priority_assets ~w(
    PEPEUSDT 1000PEPEUSDT WIFUSDT BONKUSDT 1000BONKUSDT FLOKIUSDT 1000FLOKIUSDT
    SHIBUSDT 1000SHIBUSDT DOGEUSDT MEMEUSDT PEOPLEUSDT LUNCUSDT 1000LUNCUSDT
    BTTCUSDT HOTUSDT ACHUSDT SPELLUSDT REEFUSDT ANKRUSDT CELRUSDT
    DENTUSDT SCUSDT STMXUSDT CKBUSDT JSTUSDT SUNUSDT WINUSDT
    NKNUSDT OGNUSDT OAXUSDT VITEUSDT DREPUSDT MDTUSDT CTKUSDT
  )
  
  @secondary_assets ~w(
    SOLUSDT NEARUSDT SUIUSDT APTUSDT INJUSDT ARBUSDT OPUSDT SEIUSDT TIAUSDT
    XRPUSDT ADAUSDT AVAXUSDT DOTUSDT ATOMUSDT LINKUSDT UNIUSDT LTCUSDT
    MATICUSDT FILUSDT GALAUSDT SANDUSDT MANAUSDT APEUSDT CRVUSDT LDOUSDT
    GMXUSDT MAGICUSDT RDNTUSDT PENDLEUSDT STXUSDT CFXUSDT FETUSDT AGIXUSDT
    OCEANUSDT RLCUSDT CTSIUSDT ARPAUSDT PHBUSDT AMBUSDT VOXELUSDT
  )
  
  @blocked_assets ~w(BTCUSDT ETHUSDT BNBUSDT USDCUSDT BUSDUSDT TUSDUSDT)
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 4️⃣ PHYSICS TRAJECTORY EXIT - FIXED TP DIRECTION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @use_physics_exits true
  @max_hold_minutes 15
  @fallback_stop_loss_pct 0.008
  @fallback_take_profit_pct 0.012
  
  @min_time_to_target_minutes 1
  @max_time_to_target_minutes 30
  
  @tier_max_hold %{
    tier1: 8,
    tier2: 10,
    tier3: 12,
    tier4: 0
  }

  # ═══════════════════════════════════════════════════════════════════════════════
  # 5️⃣ FEE-AWARE TRAILING STOP + PROFIT PROTECTION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @trailing_activation_fee_multiple 2.0
  @trailing_stop_distance_pct 0.004
  @trailing_ratchet_pct 0.001
  @trailing_stop_distance 0.15
  @stop_loss_pct 0.008
  @take_profit_pct 0.012
  @volatility_buffer_pct 0.05
  @max_daily_drawdown_pct 3.0
  @max_consecutive_losses 5

  # ═══════════════════════════════════════════════════════════════════════════════
  # POSITION SIZING
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @max_positions 8
  @base_position_pct 0.10
  @max_position_pct 0.12
  @max_loss_per_trade_pct 0.02
  @max_loss_per_trade_usd 2.0
  
  @leverage_tiers %{
    "PEPEUSDT" => 5, "1000PEPEUSDT" => 5, "WIFUSDT" => 5, "BONKUSDT" => 5,
    "FLOKIUSDT" => 5, "SHIBUSDT" => 5, "DOGEUSDT" => 5, "MEMEUSDT" => 5,
    "1000BONKUSDT" => 5, "1000FLOKIUSDT" => 5, "1000SHIBUSDT" => 5,
    "SOLUSDT" => 6, "NEARUSDT" => 6, "SUIUSDT" => 6, "APTUSDT" => 6,
    "ARBUSDT" => 6, "OPUSDT" => 6, "INJUSDT" => 6,
    "XRPUSDT" => 7, "ADAUSDT" => 7, "LINKUSDT" => 7, "LTCUSDT" => 7
  }

  @use_prime_scaling true
  
  @prime_allocation %{
    1 => %{prime: 101, pct: 0.101},
    2 => %{prime: 103, pct: 0.103},
    3 => %{prime: 107, pct: 0.107},
    4 => %{prime: 109, pct: 0.109},
    5 => %{prime: 113, pct: 0.113},
    6 => %{prime: 127, pct: 0.127},
    7 => %{prime: 131, pct: 0.131},
    8 => %{prime: 137, pct: 0.137}
  }
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # PROFIT TARGETS & SCHEDULE
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @daily_target_usd 25.0
  @min_daily_target_usd 15.0
  @stretch_daily_target_usd 35.0
  @compound_interval_minutes 15
  @daily_close_hour 23
  @daily_close_minute 45
  @daily_resume_hour 0
  @daily_resume_minute 15
  @liquidation_buffer 0.85

  @futures_testnet_url "https://testnet.binancefuture.com"

  # ═══════════════════════════════════════════════════════════════════════════════
  # VOLATILITY TIERS - EXPANDED FOR MEME COINS
  # ═══════════════════════════════════════════════════════════════════════════════

  @tier1_ultra_volatile ~w(
    PEPEUSDT SHIBUSDT FLOKIUSDT BONKUSDT LUNCUSDT 1000PEPEUSDT 
    1000SHIBUSDT 1000FLOKIUSDT 1000BONKUSDT 1000LUNCUSDT 
    BTTCUSDT HOTUSDT WIFUSDT MEMEUSDT PEOPLEUSDT
    ACHUSDT SPELLUSDT REEFUSDT ANKRUSDT CELRUSDT DENTUSDT
    SCUSDT STMXUSDT CKBUSDT JSTUSDT SUNUSDT WINUSDT
    NKNUSDT OGNUSDT OAXUSDT VITEUSDT DREPUSDT MDTUSDT
  )

  @tier2_high_volatile ~w(
    DOGEUSDT XRPUSDT ADAUSDT TRXUSDT VETUSDT ALGOUSDT XLMUSDT 
    ICPUSDT FILUSDT GALAUSDT SANDUSDT MANAUSDT APEUSDT CRVUSDT 
    LDOUSDT ARBUSDT OPUSDT SUIUSDT SEIUSDT TIAUSDT
    GMXUSDT MAGICUSDT RDNTUSDT PENDLEUSDT STXUSDT CFXUSDT
  )

  @tier3_medium_volatile ~w(
    SOLUSDT LINKUSDT AVAXUSDT DOTUSDT ATOMUSDT NEARUSDT APTUSDT 
    INJUSDT UNIUSDT AAVEUSDT MKRUSDT LTCUSDT BCHUSDT ETCUSDT RUNEUSDT
    FETUSDT AGIXUSDT OCEANUSDT RLCUSDT CTSIUSDT
  )

  @tier4_low_volatile ~w(BTCUSDT ETHUSDT BNBUSDT)

  @tradeable_assets @tier1_ultra_volatile ++ @tier2_high_volatile ++ @tier3_medium_volatile

  @tier_leverage %{tier1: 5, tier2: 6, tier3: 7, tier4: 0}
  @tier_take_profit %{tier1: 0.010, tier2: 0.012, tier3: 0.015, tier4: 0.020}
  @tier_stop_loss %{tier1: 0.008, tier2: 0.008, tier3: 0.008, tier4: 0.008}

  @min_profit_target 0.30
  @ideal_profit_target 1.50

  # ═══════════════════════════════════════════════════════════════════════════════
  # 📝 FILE LOGGING FUNCTIONS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp ensure_log_directory, do: File.mkdir_p!(@log_directory)

  # ═══════════════════════════════════════════════════════════════════════════════
  # 📝 HOURLY LOG FILES - For granular performance monitoring
  # ═══════════════════════════════════════════════════════════════════════════════
  
  # Daily log file (aggregated)
  defp get_log_file_path do
    date = Date.utc_today() |> Date.to_string()
    Path.join(@log_directory, "trades_#{date}.log")
  end

  # Hourly log file (granular)
  defp get_hourly_log_file_path do
    now = DateTime.utc_now()
    date = Date.to_string(DateTime.to_date(now))
    hour = now.hour |> Integer.to_string() |> String.pad_leading(2, "0")
    Path.join(@log_directory, "trades_#{date}_#{hour}h.log")
  end

  # Daily CSV file (aggregated)
  defp get_csv_file_path do
    date = Date.utc_today() |> Date.to_string()
    Path.join(@log_directory, "trades_#{date}.csv")
  end

  # Hourly CSV file (granular)
  defp get_hourly_csv_file_path do
    now = DateTime.utc_now()
    date = Date.to_string(DateTime.to_date(now))
    hour = now.hour |> Integer.to_string() |> String.pad_leading(2, "0")
    Path.join(@log_directory, "trades_#{date}_#{hour}h.csv")
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
    
    # Write to daily aggregate log
    File.write!(get_log_file_path(), line, [:append])
    
    # Write to hourly granular log
    File.write!(get_hourly_log_file_path(), line, [:append])
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
      slippage: trade_record.total_slippage,
      peak_profit: Map.get(trade_record, :peak_profit, 0),
      locked_profit: Map.get(trade_record, :locked_profit, 0)
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

  defp log_hourly_summary(state) when @log_hourly_summary do
    now = DateTime.utc_now()
    uptime = if state.started_at, do: DateTime.diff(now, state.started_at), else: 0
    total_closed = state.winning_trades + state.losing_trades
    win_rate = if total_closed > 0, do: state.winning_trades / total_closed * 100.0, else: 0.0
    
    # Calculate hourly metrics
    hour_str = now.hour |> Integer.to_string() |> String.pad_leading(2, "0")
    uptime_hours = if uptime > 0, do: uptime / 3600, else: 1
    trades_per_hour = state.total_trades / max(uptime_hours, 1)
    pnl_per_hour = state.total_pnl / max(uptime_hours, 1)
    
    log_to_file("HOURLY_SUMMARY", %{
      hour: "#{hour_str}:00 UTC",
      uptime_seconds: uptime,
      uptime_hours: Float.round(uptime_hours * 1.0, 2),
      total_trades: state.total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades,
      win_rate: Float.round(win_rate * 1.0, 2),
      total_pnl: Float.round(state.total_pnl * 1.0, 4),
      pnl_per_hour: Float.round(pnl_per_hour * 1.0, 4),
      trades_per_hour: Float.round(trades_per_hour * 1.0, 2),
      total_fees: Float.round(state.total_fees * 1.0, 4),
      net_pnl_after_fees: Float.round((state.total_pnl - state.total_fees) * 1.0, 4),
      locked_session_profit: Float.round(Map.get(state, :locked_profit, 0) * 1.0, 4),
      peak_session_profit: Float.round(Map.get(state, :peak_session_profit, 0) * 1.0, 4),
      time_horizon_filtered: state.time_horizon_filtered,
      ai_direction_overrides: Map.get(state, :ai_direction_overrides, 0),
      signals_received: state.signals_received,
      signals_traded: state.signals_traded,
      signals_filtered: state.signals_filtered,
      signal_conversion_rate: if(state.signals_received > 0, do: Float.round(state.signals_traded / state.signals_received * 100, 2), else: 0.0),
      open_positions: map_size(state.positions),
      balance: Float.round(state.margin_balance * 1.0, 2),
      consecutive_losses: Map.get(state, :consecutive_losses, 0),
      largest_win: Float.round(state.largest_win * 1.0, 2),
      largest_loss: Float.round(state.largest_loss * 1.0, 2),
      hourly_log_file: get_hourly_log_file_path(),
      hourly_csv_file: get_hourly_csv_file_path()
    })
  end
  defp log_hourly_summary(_), do: :ok

  defp append_trade_csv(:open, position) do
    ensure_log_directory()
    
    header = "timestamp,event,id,symbol,direction,entry_price,exit_price,quantity,leverage,margin,pnl,pnl_pct,exit_reason,hold_time,fees,slippage,confidence,latency_us,peak_profit,locked_profit\n"
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()
    line = "#{timestamp},OPEN,#{position.id},#{position.symbol},#{position.direction},#{position.entry_price},,#{position.quantity},#{position.leverage},#{position.margin},,,,,,#{position.confidence},#{position.entry_latency_us},,\n"
    
    # Write to daily CSV
    csv_path = get_csv_file_path()
    unless File.exists?(csv_path), do: File.write!(csv_path, header)
    File.write!(csv_path, line, [:append])
    
    # Write to hourly CSV
    hourly_csv_path = get_hourly_csv_file_path()
    unless File.exists?(hourly_csv_path), do: File.write!(hourly_csv_path, header)
    File.write!(hourly_csv_path, line, [:append])
  end

  defp append_trade_csv(:close, trade) do
    ensure_log_directory()
    
    header = "timestamp,event,id,symbol,direction,entry_price,exit_price,quantity,leverage,margin,pnl,pnl_pct,exit_reason,hold_time,fees,slippage,confidence,latency_us,peak_profit,locked_profit\n"
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()
    peak_profit = Map.get(trade, :peak_profit, 0)
    locked_profit = Map.get(trade, :locked_profit, 0)
    line = "#{timestamp},CLOSE,#{trade.id},#{trade.symbol},#{trade.direction},#{trade.entry_price},#{trade.exit_price},#{trade.quantity},#{trade.leverage},#{trade.margin},#{Float.round(trade.pnl, 4)},#{Float.round(trade.pnl_pct, 2)},#{trade.exit_reason},#{trade.hold_time},#{Float.round(trade.total_fees, 4)},#{Float.round(trade.total_slippage * 100, 4)},,#{peak_profit},#{locked_profit}\n"
    
    # Write to daily CSV
    csv_path = get_csv_file_path()
    unless File.exists?(csv_path), do: File.write!(csv_path, header)
    File.write!(csv_path, line, [:append])
    
    # Write to hourly CSV  
    hourly_csv_path = get_hourly_csv_file_path()
    unless File.exists?(hourly_csv_path), do: File.write!(hourly_csv_path, header)
    File.write!(hourly_csv_path, line, [:append])
  end

  defp log_session_start(state) do
    log_to_file("SESSION_START", %{
      version: "v16.0",
      starting_balance: state.margin_balance,
      ai_brain_enabled: @use_ai_brain,
      time_horizon_filter: "#{@min_time_to_target_minutes}-#{@max_time_to_target_minutes}m",
      max_positions: @max_positions,
      relax_window_enabled: @enable_relax_window,
      profit_lock_enabled: @enable_profit_lock,
      daily_target: @daily_target_usd
    })
  end

  defp log_session_end(state) do
    log_to_file("SESSION_END", %{
      final_balance: state.margin_balance,
      total_pnl: state.total_pnl,
      locked_profit: Map.get(state, :locked_profit, 0),
      total_trades: state.total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades
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
  def profit_status, do: GenServer.call(__MODULE__, :profit_status, 10_000)
  def hourly_files, do: GenServer.call(__MODULE__, :hourly_files, 10_000)
  
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
    
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 MARGIN SCALPER v16.0 - MEME COIN HUNTER + PROFIT LOCK
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 
    🌊 📝 Logging to: #{@log_directory}
    🌊 ⏰ Time Horizon: #{@min_time_to_target_minutes}-#{@max_time_to_target_minutes} minutes
    🌊 🧠 AI Brain: #{if @use_ai_brain, do: "✅ ENABLED", else: "❌ DISABLED"}
    🌊 💰 Profit Lock: #{if @enable_profit_lock, do: "✅ ENABLED (#{@profit_lock_percentage * 100}%)", else: "❌ DISABLED"}
    🌊 🎯 Daily Target: $#{@daily_target_usd}
    🌊 🔧 TP Direction: FIXED (shorts profit when price drops)
    🌊 
    🌊 ═══════════════════════════════════════════════════════════════════════════════
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
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      consecutive_losses: 0,
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
      peak_session_profit: 0.0,
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
    
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 MARGIN SCALPER v16.0 + PROFIT LOCK ACTIVE
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 📝 Daily Log:  #{get_log_file_path()}
    🌊 📊 Daily CSV:  #{get_csv_file_path()}
    🌊 ⏰ Hourly Log: #{get_hourly_log_file_path()}
    🌊 ⏰ Hourly CSV: #{get_hourly_csv_file_path()}
    🌊 💰 Profit Lock: #{@profit_lock_percentage * 100}% locked after $#{@profit_lock_threshold}
    🌊 🔧 TP Fix: Shorts now take profit BELOW entry price
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    Process.send_after(self(), :check_positions, 1_000)
    Process.send_after(self(), :update_prices, 1_000)
    Process.send_after(self(), :check_trailing_stops, 1_000)
    Process.send_after(self(), :check_profit_locks, 2_000)
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
      peak_session_profit: 0.0,
      locked_profit: 0.0,
      last_compound_at: DateTime.utc_now(),
      daily_profit: 0.0,
      trades_today: 0,
      consecutive_losses: 0
    }
    
    log_session_start(new_state)
    {:noreply, new_state}
  end

  @impl true
  def handle_cast(:stop_trading, state) do
    Logger.info("🔴 MARGIN SCALPER v16.0 STOPPED")
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
      version: "v16.0",
      uptime_seconds: uptime,
      uptime_formatted: format_uptime(uptime),
      open_positions: map_size(state.positions),
      max_positions: @max_positions,
      realized_pnl: Float.round(state.total_pnl * 1.0, 2),
      unrealized_pnl: Float.round(unrealized_pnl * 1.0, 2),
      total_pnl: Float.round((state.total_pnl + unrealized_pnl) * 1.0, 2),
      locked_profit: Float.round(Map.get(state, :locked_profit, 0) * 1.0, 2),
      peak_session_profit: Float.round(Map.get(state, :peak_session_profit, 0) * 1.0, 2),
      total_fees: Float.round(state.total_fees * 1.0, 2),
      total_trades: state.total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades,
      consecutive_losses: Map.get(state, :consecutive_losses, 0),
      win_rate: win_rate,
      largest_win: Float.round(state.largest_win * 1.0, 2),
      largest_loss: Float.round(state.largest_loss * 1.0, 2),
      signals_received: state.signals_received,
      signals_traded: state.signals_traded,
      signals_filtered: state.signals_filtered,
      margin_balance: Float.round(state.margin_balance * 1.0, 2),
      available_margin: Float.round(state.available_margin * 1.0, 2),
      daily_target: @daily_target_usd,
      daily_progress_pct: if(@daily_target_usd > 0, do: Float.round(state.total_pnl / @daily_target_usd * 100, 1), else: 0.0),
      relax_windows_active: map_size(state.relax_windows),
      relax_flips: state.relax_flips,
      relax_timeouts: state.relax_timeouts,
      time_horizon_filtered: state.time_horizon_filtered,
      ai_direction_overrides: Map.get(state, :ai_direction_overrides, 0),
      trades_per_hour: if(uptime > 0, do: Float.round(state.total_trades / (uptime / 3600), 1), else: 0.0),
      pnl_per_hour: if(uptime > 0, do: Float.round(state.total_pnl / (uptime / 3600), 2), else: 0.0),
      errors: state.errors,
      log_file: get_log_file_path(),
      hourly_log_file: get_hourly_log_file_path(),
      csv_file: get_csv_file_path(),
      hourly_csv_file: get_hourly_csv_file_path(),
      timestamp: DateTime.utc_now()
    }

    {:reply, {:ok, status}, state}
  end

  @impl true
  def handle_call(:profit_status, _from, state) do
    status = %{
      total_pnl: state.total_pnl,
      locked_profit: Map.get(state, :locked_profit, 0),
      peak_session_profit: Map.get(state, :peak_session_profit, 0),
      available_profit: state.total_pnl - Map.get(state, :locked_profit, 0),
      profit_lock_enabled: @enable_profit_lock,
      profit_lock_threshold: @profit_lock_threshold,
      profit_lock_percentage: @profit_lock_percentage
    }
    {:reply, status, state}
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
          hold_time: DateTime.diff(DateTime.utc_now(), pos.opened_at),
          peak_profit: Map.get(pos, :peak_profit, 0),
          locked_profit: Map.get(pos, :locked_profit, 0)
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
      hourly_log_file: get_hourly_log_file_path(),
      hourly_csv_file: get_hourly_csv_file_path(),
      trades_count: length(state.completed_trades)
    }}, state}
  end

  @impl true
  def handle_call(:hourly_files, _from, state) do
    now = DateTime.utc_now()
    hour = now.hour |> Integer.to_string() |> String.pad_leading(2, "0")
    date = Date.to_string(DateTime.to_date(now))
    
    # List all hourly files for today
    {:ok, files} = File.ls(@log_directory)
    
    today_hourly_logs = files
      |> Enum.filter(&String.contains?(&1, "#{date}_"))
      |> Enum.filter(&String.ends_with?(&1, ".log"))
      |> Enum.sort()
    
    today_hourly_csvs = files
      |> Enum.filter(&String.contains?(&1, "#{date}_"))
      |> Enum.filter(&String.ends_with?(&1, ".csv"))
      |> Enum.sort()
    
    {:reply, %{
      current_hour: "#{hour}:00 UTC",
      current_hourly_log: get_hourly_log_file_path(),
      current_hourly_csv: get_hourly_csv_file_path(),
      today_hourly_logs: today_hourly_logs,
      today_hourly_csvs: today_hourly_csvs,
      daily_log: get_log_file_path(),
      daily_csv: get_csv_file_path()
    }, state}
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
      locked_profit: Map.get(state, :locked_profit, 0)
    }
    {:reply, info, state}
  end

  @impl true
  def handle_call(:analytics, _from, state) do
    total_closed = state.winning_trades + state.losing_trades
    win_rate = if total_closed > 0, do: Float.round(state.winning_trades / total_closed * 100.0, 1), else: 0.0
    
    report = """
    
    📊 ANALYTICS REPORT v16.0 - PROFIT LOCK
    ═══════════════════════════════════════════════════════════════
    Total Trades:       #{state.total_trades}
    Win Rate:           #{win_rate}%
    Total P&L:          $#{Float.round(state.total_pnl * 1.0, 2)}
    Locked Profit:      $#{Float.round(Map.get(state, :locked_profit, 0) * 1.0, 2)}
    Peak Session:       $#{Float.round(Map.get(state, :peak_session_profit, 0) * 1.0, 2)}
    Daily Target:       $#{@daily_target_usd} (#{Float.round(state.total_pnl / max(@daily_target_usd, 1) * 100, 1)}%)
    Largest Win:        $#{Float.round(state.largest_win * 1.0, 2)}
    Largest Loss:       $#{Float.round(state.largest_loss * 1.0, 2)}
    
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
      locked_profit: Map.get(state, :locked_profit, 0),
      relax_flips: state.relax_flips,
      relax_timeouts: state.relax_timeouts,
      time_horizon_filtered: state.time_horizon_filtered,
      ai_direction_overrides: Map.get(state, :ai_direction_overrides, 0)
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
    if state.trading_active and not trading_paused?(state) do
      state = HFTPerformance.increment_throughput(state)
      {:noreply, process_candlebridge_signal(signal, state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info({:physics_signal, signal}, state) do
    if state.trading_active and not trading_paused?(state) do
      {:noreply, process_candlebridge_signal(signal, state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info({:candle_closed, candle}, state) do
    if state.trading_active and Map.has_key?(candle, :signal) and not trading_paused?(state) do
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
  def handle_info(:check_profit_locks, state) do
    if state.trading_active do
      Process.send_after(self(), :check_profit_locks, 2_000)
      {:noreply, update_session_profit_locks(state)}
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
      log_hourly_summary(state)
    end
    {:noreply, state}
  end

  @impl true
  def handle_info(:compound_profits, state) do
    if state.trading_active do
      Process.send_after(self(), :compound_profits, @compound_interval_minutes * 60_000)
      
      session_profit = state.total_pnl - Map.get(state, :locked_profit, 0)
      
      if session_profit > @profit_lock_threshold do
        lock_amount = session_profit * @session_profit_lock_pct
        new_locked = Map.get(state, :locked_profit, 0) + lock_amount
        new_balance = state.starting_balance + state.total_pnl
        
        Logger.info("💰 Compound ##{state.compound_count + 1}: Locked $#{Float.round(lock_amount * 1.0, 2)} (Total: $#{Float.round(new_locked * 1.0, 2)})")
        
        log_to_file("PROFIT_LOCKED", %{
          lock_amount: lock_amount,
          total_locked: new_locked,
          session_profit: session_profit
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
          Logger.info("🌊 DAILY CLOSE - 23:45 UTC")
          state = close_all_positions(state, :daily_close)
          report_daily_performance(state)
          log_session_end(state)
          {:noreply, %{state | daily_closed: true, trading_paused: true, relax_windows: %{}}}
        
        hour == @daily_resume_hour and minute >= @daily_resume_minute and state.daily_closed ->
          Logger.info("🌊 NEW DAY - RESUMING at 00:15 UTC")
          log_session_start(state)
          {:noreply, %{state | 
            daily_closed: false, 
            trading_paused: false, 
            daily_profit: 0.0, 
            trades_today: 0,
            consecutive_losses: 0,
            peak_session_profit: 0.0,
            locked_profit: 0.0
          }}
        
        true ->
          {:noreply, state}
      end
    else
      {:noreply, state}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ═══════════════════════════════════════════════════════════════════════════════
  # 💰 PROFIT LOCK SYSTEM
  # ═══════════════════════════════════════════════════════════════════════════════

  defp update_session_profit_locks(state) when @enable_profit_lock do
    # Update session peak profit
    state = if state.total_pnl > Map.get(state, :peak_session_profit, 0) do
      %{state | peak_session_profit: state.total_pnl}
    else
      state
    end
    
    # Check if we're giving back too much session profit
    peak = Map.get(state, :peak_session_profit, 0)
    current = state.total_pnl
    
    if peak > @profit_lock_threshold do
      max_giveback = peak * @max_profit_giveback_pct
      
      if (peak - current) > max_giveback and map_size(state.positions) > 0 do
        Logger.warning("🛡️ SESSION PROTECTION: Giving back $#{Float.round(peak - current, 2)} - closing all")
        state = close_all_positions(state, :session_profit_protection)
        %{state | trading_paused: true}
      else
        state
      end
    else
      state
    end
  end
  defp update_session_profit_locks(state), do: state

  defp update_position_profit_tracking(pos, current_pnl) when @enable_profit_lock do
    peak_profit = max(Map.get(pos, :peak_profit, 0), current_pnl)
    
    locked_profit = if peak_profit >= @profit_lock_threshold do
      peak_profit * @profit_lock_percentage
    else
      Map.get(pos, :locked_profit, 0)
    end
    
    %{pos | peak_profit: peak_profit, locked_profit: locked_profit}
  end
  defp update_position_profit_tracking(pos, _), do: pos

  defp should_close_for_profit_protection?(pos, current_pnl) when @enable_profit_lock do
    peak = Map.get(pos, :peak_profit, 0)
    locked = Map.get(pos, :locked_profit, 0)
    
    cond do
      locked > 0 and current_pnl < locked -> true
      peak > @profit_lock_threshold and (peak - current_pnl) > (peak * @max_profit_giveback_pct) -> true
      true -> false
    end
  end
  defp should_close_for_profit_protection?(_, _), do: false

  defp maybe_update_breakeven_stop(pos, current_pnl, state) when @enable_breakeven_stop do
    pnl_pct = if pos.margin > 0, do: current_pnl / pos.margin, else: 0
    
    if pnl_pct >= @breakeven_trigger_pct and not Map.get(pos, :breakeven_activated, false) do
      new_sl = case pos.direction do
        :long -> pos.entry_price * (1 + @breakeven_buffer_pct)
        :short -> pos.entry_price * (1 - @breakeven_buffer_pct)
      end
      
      Logger.info("🔒 #{pos.symbol} moved to BREAK-EVEN @ $#{format_price(new_sl)}")
      
      updated_pos = %{pos | stop_loss: new_sl, breakeven_activated: true}
      %{state | positions: Map.put(state.positions, pos.id, updated_pos)}
    else
      state
    end
  end
  defp maybe_update_breakeven_stop(_, _, state), do: state

  defp trading_paused?(state) do
    cond do
      state.trading_paused -> true
      Map.get(state, :consecutive_losses, 0) >= @max_consecutive_losses -> 
        Logger.warning("⚠️ Trading paused: #{@max_consecutive_losses} consecutive losses")
        true
      true -> false
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # CANDLEBRIDGE SIGNAL PROCESSING
  # ═══════════════════════════════════════════════════════════════════════════════

  defp process_candlebridge_signal(signal, state) do
    symbol = signal[:symbol] || signal["symbol"]
    direction = signal[:direction] || signal["direction"]
    confidence = signal[:confidence] || signal["confidence"] || 50
    
    direction = normalize_direction(direction)
    
    energy_level = extract_energy_level(signal)
    state = %{state | energy_cache: Map.put(state.energy_cache, symbol, energy_level)}
    
    time_to_target = extract_time_to_target_from_signal(signal)
    
    now = DateTime.utc_now()

    last = Map.get(state.recent_signals, symbol)
    if last && DateTime.diff(now, last, :second) < 15 do
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
        trough_price: signal[:trough_price],
        peak_time: signal[:peak_time],
        time_to_target: time_to_target,
        energy_zones: signal[:energy_zones] || %{},
        physics: %{
          momentum: signal[:momentum] || 0,
          velocity: signal[:velocity] || 0,
          gravity: signal[:gravity] || 0,
          peak_price: signal[:peak_price],
          trough_price: signal[:trough_price],
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

  defp extract_time_to_target_from_signal(signal) do
    raw = signal[:peak_time] ||
          signal[:time_to_target] ||
          get_in(signal, [:physics, :time_to_peak]) ||
          get_in(signal, [:physics, :peak_time]) ||
          get_in(signal, [:energy_zones, :time_to_peak]) ||
          get_in(signal, ["peak_time"]) ||
          get_in(signal, ["physics", "time_to_peak"]) ||
          15.0
    
    parse_time_value(raw)
  end

  defp parse_time_value(raw) do
    case raw do
      t when is_number(t) -> t
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
    Logger.info("⏸️ [RELAX] #{pos.symbol} entering #{reversal_type} observation - looking for #{expected_direction}")
    
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
      Logger.info("✅ [RELAX] #{symbol} FLIP to #{relax.expected_direction}! (#{confirming}/#{total})")
      
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
        confidence: 70,
        entry_price: Map.get(state.price_cache, symbol, relax.entry_price),
        current_price: Map.get(state.price_cache, symbol, relax.entry_price),
        time_to_target: 10,
        energy_zones: %{energy_level: :medium},
        physics: %{time_to_peak: 10}
      }
      
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
    time_to_target = signal[:time_to_target] || signal.time_to_target || 15
    
    energy_level = get_in(signal, [:energy_zones, :energy_level]) ||
                   get_in(signal, [:physics, :energy_zones, :energy_level]) || 
                   :medium

    cond do
      symbol in @blocked_assets -> 
        log_rejection(symbol, direction, :blocked_asset)
        {:reject, :blocked_asset, state}
      
      trading_paused?(state) -> 
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
      
      not time_horizon_valid?(time_to_target) ->
        log_rejection(symbol, direction, :time_horizon, %{time_to_target: time_to_target})
        {:reject, :time_horizon, %{state | time_horizon_filtered: state.time_horizon_filtered + 1}}
      
      @use_ai_brain ->
        consult_ai_brain_for_trade(signal, direction, state)
      
      true ->
        if physics_filter_basic(signal, direction, confidence, energy_level) do
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
            Logger.info("🧠 AI OVERRIDE #{signal.symbol}: signal=#{original_direction} → AI=#{ai_action} @ #{Float.round(ai_conf * 100, 1)}%")
            log_ai_decision(signal.symbol, original_direction, ai_action, ai_conf, :override)
            {:trade, ai_action, %{state | ai_direction_overrides: Map.get(state, :ai_direction_overrides, 0) + 1}}
          else
            log_ai_decision(signal.symbol, original_direction, ai_action, ai_conf, :confirmed)
            {:trade, ai_action, state}
          end
        else
          log_ai_decision(signal.symbol, original_direction, ai_action, ai_conf, :low_confidence)
          log_rejection(signal.symbol, original_direction, :ai_low_confidence, %{ai_conf: ai_conf})
          {:reject, :ai_low_confidence, state}
        end
      
      {:ok, %{action: :hold}} -> 
        log_ai_decision(signal.symbol, original_direction, :hold, 0, :hold)
        {:reject, :ai_hold, state}
        
      {:error, _reason} ->
        if physics_filter_basic(signal, original_direction, signal.confidence, :medium) do
          {:trade, original_direction, state}
        else
          {:reject, :physics_fallback_filter, state}
        end
    end
  end

  defp physics_filter_basic(signal, direction, confidence, energy_level) do
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
    
    raw_momentum = physics[:momentum] || physics[:velocity] || 0.0
    momentum = cond do
      raw_momentum > 1.0 -> min(raw_momentum / 10.0, 1.0)
      raw_momentum < -1.0 -> max(raw_momentum / 10.0, -1.0)
      true -> raw_momentum
    end
    
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
    
    zones[:injection] != nil or zones[:peak] != nil
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

        # 🔧 FIXED: Use correct TP direction calculation
        {stop_loss, take_profit} = if @use_physics_exits do
          calculate_physics_exits_fixed(signal, current_price, direction, symbol)
        else
          calculate_sl_tp_fixed(current_price, direction, symbol)
        end
        
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
              breakeven_activated: false,
              liquidation_price: liquidation_price,
              entry_fee: entry_fee,
              expected_exit_fee: notional * fee_rate,
              total_fees: entry_fee,
              fee_floor: entry_fee * 2 * @fee_floor_multiplier,
              confidence: confidence,
              opened_at: DateTime.utc_now(),
              max_hold_until: DateTime.add(DateTime.utc_now(), get_tier_max_hold(symbol) * 60, :second),
              highest_price: executed_price,
              lowest_price: executed_price,
              peak_profit: 0.0,
              locked_profit: 0.0,
              fee: entry_fee,
              order_id: order_result[:order_id],
              order_type: order_type,
              entry_slippage: entry_slippage,
              entry_latency_us: latency_us
            }

            direction_emoji = if direction == :long, do: "🟢", else: "🔴"
            Logger.info("#{direction_emoji} OPENED #{symbol} #{direction} @ $#{format_price(executed_price)} | SL: $#{format_price(safe_stop)} | TP: $#{format_price(take_profit)} (#{leverage}x)")

            log_trade_open(position)

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
              consecutive_losses: 0
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
          time_to_target: 10,
          energy_zones: %{}, physics: %{time_to_peak: 10}
        }
        
        new_state = execute_margin_trade(signal, state)
        new_position = new_state.positions |> Map.values() |> Enum.find(& &1.symbol == symbol)
        
        if new_position, do: {:ok, new_position, new_state}, else: {:error, :execution_failed}
      error -> error
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🔧🔧🔧 FIXED: TP/SL CALCULATIONS WITH CORRECT DIRECTION 🔧🔧🔧
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc """
  🔧 FIXED: Calculate TP/SL with correct direction logic
  
  LONG positions:
    - Stop Loss = BELOW entry (we lose if price goes DOWN)
    - Take Profit = ABOVE entry (we profit if price goes UP)
  
  SHORT positions:
    - Stop Loss = ABOVE entry (we lose if price goes UP)  
    - Take Profit = BELOW entry (we profit if price goes DOWN) ← THE FIX!
  """
  defp calculate_sl_tp_fixed(entry_price, direction, symbol) do
    sl_pct = get_tier_stop_loss(symbol)
    tp_pct = get_tier_take_profit(symbol)
    
    case direction do
      :long ->
        stop_loss = entry_price * (1 - sl_pct)    # BELOW entry
        take_profit = entry_price * (1 + tp_pct)  # ABOVE entry
        {stop_loss, take_profit}
        
      :short ->
        stop_loss = entry_price * (1 + sl_pct)    # ABOVE entry
        take_profit = entry_price * (1 - tp_pct)  # BELOW entry ← THE FIX!
        {stop_loss, take_profit}
        
      _ ->
        {entry_price * (1 - sl_pct), entry_price * (1 + tp_pct)}
    end
  end

  @doc """
  🔧 FIXED: Physics-based exits with correct direction awareness
  """
  defp calculate_physics_exits_fixed(signal, current_price, direction, symbol) do
    zones = get_in(signal, [:energy_zones, :zone_boundaries]) ||
            get_in(signal, [:physics, :energy_zones, :zone_boundaries]) ||
            get_in(signal, [:physics, :zone_boundaries]) || %{}
    
    physics = signal[:physics] || %{}
    peak_price = to_float(zones[:peak]) || to_float(physics[:peak_price])
    trough_price = to_float(zones[:trough]) || to_float(physics[:trough_price]) || to_float(zones[:injection])
    
    tier_sl = get_tier_stop_loss(symbol)
    tier_tp = get_tier_take_profit(symbol)
    
    case direction do
      :long ->
        # LONG: SL below entry, TP above entry (or at physics peak)
        sl = current_price * (1 - tier_sl)
        tp = cond do
          peak_price && peak_price > current_price -> peak_price
          true -> current_price * (1 + tier_tp)
        end
        {sl, tp}
        
      :short ->
        # SHORT: SL above entry, TP BELOW entry (or at physics trough)
        sl = current_price * (1 + tier_sl)
        tp = cond do
          # For shorts, we want a price LOWER than current
          trough_price && trough_price < current_price -> trough_price
          true -> current_price * (1 - tier_tp)  # ← THE FIX: TP BELOW entry!
        end
        {sl, tp}
        
      _ ->
        {current_price * (1 - tier_sl), current_price * (1 + tier_tp)}
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
      
      # Update profit tracking
      pos = update_position_profit_tracking(pos, current_pnl)
      acc = %{acc | positions: Map.put(acc.positions, pos.id, pos)}
      
      cond do
        # Emergency stop loss
        current_pnl < -max_loss_usd ->
          Logger.warning("🚨 #{pos.symbol} MAX LOSS $#{Float.round(abs(current_pnl), 2)} - EMERGENCY CLOSE")
          close_position(pos, acc, :max_loss_protection)
        
        # Profit protection - don't give back gains
        should_close_for_profit_protection?(pos, current_pnl) ->
          Logger.info("🛡️ #{pos.symbol} PROFIT LOCK triggered @ $#{Float.round(current_pnl, 2)}")
          close_position(pos, acc, :profit_lock)
        
        # Profitable - check for reversal or normal exits
        current_pnl > 0 ->
          case check_for_reversal_point(pos, current, acc) do
            {:enter_relax, reversal_type, expected_dir, energy} ->
              enter_relax_window(pos, reversal_type, expected_dir, energy, acc)
            _ ->
              # Update breakeven stop if enabled
              acc = maybe_update_breakeven_stop(pos, current_pnl, acc)
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

  # 🔧 FIXED: Stop loss check
  defp stop_hit?(pos, current) do
    case pos.direction do
      :long -> current <= pos.stop_loss   # Long loses when price goes DOWN
      :short -> current >= pos.stop_loss  # Short loses when price goes UP
      _ -> false
    end
  end

  # 🔧 FIXED: Take profit check - THIS WAS THE BUG!
  defp tp_hit?(pos, current) do
    case pos.direction do
      :long -> current >= pos.take_profit   # Long profits when price goes UP
      :short -> current <= pos.take_profit  # Short profits when price goes DOWN ← THE FIX!
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
    entry_to_liq > 0 and distance_to_liq / entry_to_liq < 0.2
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
          Logger.info("📈 #{pos.symbol} trailing stop ACTIVATED")
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
    trail_distance = current * @trailing_stop_distance_pct
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

        Logger.info("#{emoji} CLOSED #{pos.symbol} #{reason}: #{if pnl >= 0, do: "+", else: ""}$#{Float.round(pnl, 2)} (#{Float.round(pnl_pct, 1)}%) [#{hold_time}s]")

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
          total_slippage: total_slippage,
          peak_profit: Map.get(pos, :peak_profit, 0),
          locked_profit: Map.get(pos, :locked_profit, 0)
        })

        log_trade_close(trade_record)

        new_balance = state.margin_balance + pnl
        balance_snapshot = {DateTime.utc_now(), new_balance}
        
        # Update consecutive losses
        new_consecutive = if is_win, do: 0, else: Map.get(state, :consecutive_losses, 0) + 1

        state
        |> HFTPerformance.record_trade(pnl, total_slippage)
        |> HFTPerformance.record_equity(new_balance)
        |> Map.merge(%{
          positions: Map.delete(state.positions, pos.id),
          winning_trades: state.winning_trades + if(is_win, do: 1, else: 0),
          losing_trades: state.losing_trades + if(is_win, do: 0, else: 1),
          consecutive_losses: new_consecutive,
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
    total_closed = state.winning_trades + state.losing_trades
    win_rate = if total_closed > 0, do: Float.round(state.winning_trades / total_closed * 100, 1), else: 0.0
    target_pct = Float.round(state.total_pnl / max(@daily_target_usd, 1) * 100, 1)
    
    Logger.info("""
    
    📊 DAILY REPORT v16.0
    ═══════════════════════════════════════
    P&L:          $#{Float.round(state.total_pnl * 1.0, 2)} (#{target_pct}% of target)
    Locked:       $#{Float.round(Map.get(state, :locked_profit, 0) * 1.0, 2)}
    Win Rate:     #{win_rate}%
    Trades:       #{state.total_trades}
    Fees:         $#{Float.round(state.total_fees * 1.0, 2)}
    ═══════════════════════════════════════
    """)
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # CALCULATIONS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp calculate_limit_entry(signal, current_price, direction) do
    physics = signal[:physics] || %{}
    zone_distances = physics[:zone_distances] || %{}
    to_balance = zone_distances[:to_balance] || 0
    offset_pct = (to_balance / 100) * @limit_order_depth
    offset = current_price * max(offset_pct, 0.001)
    
    if direction == :long, do: current_price - offset, else: current_price + offset
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
      confidence >= 85 -> min(base_leverage + 2, @max_leverage)
      confidence >= 75 -> min(base_leverage + 1, 8)
      confidence >= 65 -> base_leverage
      true -> max(base_leverage - 1, 3)
    end
  end

  defp calculate_margin_position(balance, price, leverage, confidence, position_slot \\ 1) do
    if @use_prime_scaling do
      calculate_prime_position(balance, price, leverage, position_slot)
    else
      calculate_percentage_position(balance, price, leverage, confidence)
    end
  end

  defp calculate_prime_position(available_balance, price, leverage, position_slot) do
    capped_slot = min(max(position_slot, 1), 8)
    allocation = Map.get(@prime_allocation, capped_slot, %{prime: 101})
    base_margin = allocation.prime
    margin = min(base_margin, available_balance * 0.20)
    notional = margin * leverage
    quantity = notional / price
    
    {margin, quantity, notional}
  end

  defp calculate_percentage_position(balance, price, leverage, confidence) do
    position_pct = cond do
      confidence >= 85 -> 0.12
      confidence >= 75 -> 0.10
      confidence >= 65 -> 0.08
      true -> 0.06
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
      true -> :tier2
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

  defp execute_futures_order(symbol, _direction, quantity, _leverage, entry_price, order_type) do
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
    progress_bar = make_progress_bar(status.daily_progress_pct)
    
    IO.puts("""
    
    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║  🌊 MARGIN SCALPER v16.0 - MEME COIN HUNTER + PROFIT LOCK                    ║
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  Status:           #{if status.active, do: "🟢 ACTIVE", else: "🔴 STOPPED"}
    ║  Uptime:           #{status.uptime_formatted}
    ║  Positions:        #{status.open_positions}/#{status.max_positions}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  P&L:              #{format_pnl(status.total_pnl)}
    ║  Locked Profit:    $#{Float.round(status.locked_profit * 1.0, 2)}
    ║  Peak Session:     $#{Float.round(status.peak_session_profit * 1.0, 2)}
    ║  Win Rate:         #{status.win_rate}%
    ║  Daily Target:     $#{status.daily_target} #{progress_bar} #{status.daily_progress_pct}%
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  Time Filtered:    #{status.time_horizon_filtered}
    ║  AI Overrides:     #{status.ai_direction_overrides}
    ║  Consecutive Loss: #{status.consecutive_losses}/#{@max_consecutive_losses}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  📝 Daily Log:  #{status.log_file}
    ║  📊 Daily CSV:  #{status.csv_file}
    ║  ⏰ Hourly Log: #{status.hourly_log_file}
    ║  ⏰ Hourly CSV: #{status.hourly_csv_file}
    ║  🔧 TP Direction: FIXED (shorts profit when price drops)
    ╚══════════════════════════════════════════════════════════════════════════════╝
    """)
  end

  defp make_progress_bar(pct) do
    filled = min(round(pct / 10), 10)
    empty = 10 - max(filled, 0)
    "[" <> String.duplicate("█", max(filled, 0)) <> String.duplicate("░", empty) <> "]"
  end

  defp format_pnl(pnl) when pnl >= 0, do: "+$#{Float.round(pnl * 1.0, 2)}"
  defp format_pnl(pnl), do: "-$#{Float.round(abs(pnl) * 1.0, 2)}"

  defp format_price(price) when price >= 1, do: Float.round(price * 1.0, 4) |> to_string()
  defp format_price(price) when price >= 0.01, do: Float.round(price * 1.0, 6) |> to_string()
  defp format_price(price) when price >= 0.0001, do: Float.round(price * 1.0, 8) |> to_string()
  defp format_price(price), do: :erlang.float_to_binary(price * 1.0, decimals: 10)

  defp format_uptime(seconds) do
    hours = div(seconds, 3600)
    minutes = div(rem(seconds, 3600), 60)
    secs = rem(seconds, 60)
    "#{hours}h #{minutes}m #{secs}s"
  end

  defp log_hourly_performance(state) do
    now = DateTime.utc_now()
    hour = now.hour |> Integer.to_string() |> String.pad_leading(2, "0")
    uptime_hours = if state.started_at, do: DateTime.diff(now, state.started_at) / 3600, else: 0
    
    if uptime_hours > 0 do
      pnl_per_hour = state.total_pnl / uptime_hours
      locked = Map.get(state, :locked_profit, 0)
      Logger.info("📊 [#{hour}:00] Hourly: $#{Float.round(pnl_per_hour, 2)}/hr | Total: $#{Float.round(state.total_pnl, 2)} | Locked: $#{Float.round(locked, 2)} | Trades: #{state.total_trades} | Consec Loss: #{Map.get(state, :consecutive_losses, 0)}")
      Logger.info("📁 Hourly files: #{get_hourly_log_file_path()}")
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