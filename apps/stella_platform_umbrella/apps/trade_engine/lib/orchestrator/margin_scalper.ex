defmodule TradeEngine.Orchestrator.MarginScalper do
  @moduledoc """
  ⚡ MARGIN SCALPER v16.9 - ALL ASSETS OPTIMIZED ($43/hr TARGET)
  
  ═══════════════════════════════════════════════════════════════════════════════
  💰 TARGET: 0.43%/hr = $43/hr on $10K = ~$1,000/day
  
  🔧 v16.9 CHANGES:
    - SOL OPTIMIZED (tier6): 0.15% TP (moves only 0.12%/3min!)
    - BNB RE-ENABLED (tier7): 0.2% TP, conservative settings
    - PROFIT COMPOUNDING: Lock profits but KEEP TRADING
    - SESSION END: 23:45 UTC daily
    - NO MORE BLOCKING: All assets have optimized tiers
  
  📊 Asset Analysis:
    - SOL moves: ~0.12%/3min → TP must be ≤0.15%
    - BNB moves: ~0.08%/3min → TP must be ≤0.2%
    - BTC moves: ~0.15%/5min → TP = 0.3% ✓
    - ETH moves: ~0.15%/3min → TP = 0.8% (hits via stop_loss wins)
  
  🎯 Tier Structure:
    tier1-3: Altcoins (0.5-0.7% TP)
    tier4: ETH (0.8% TP, 8x lev)
    tier5: BTC (0.3% TP, 5x lev, 5min hold)
    tier6: SOL (0.15% TP, 10x lev, 3min hold) 
    tier7: BNB (0.2% TP, 8x lev, 4min hold)
  ═══════════════════════════════════════════════════════════════════════════════
  """

  use GenServer
  require Logger

  alias TradeEngine.Risk.VirtualBalanceManager
  alias TradeEngine.Analytics.HFTPerformance
  alias TradeEngine.AI.Brain
  @pubsub TradeEngine.PubSub

  # ═══════════════════════════════════════════════════════════════════════════════
  # 🧪 EXECUTION MODE - SIMULATION vs TESTNET vs PRODUCTION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  # Set to :simulation, :testnet, or :production
  # For testnet/production, set environment variables:
  #   BINANCE_FUTURES_API_KEY
  #   BINANCE_FUTURES_API_SECRET
  @execution_mode :testnet  # ⬅️ CHANGE THIS: :simulation | :testnet | :production
  
  @futures_testnet_rest "https://testnet.binancefuture.com"
  @futures_production_rest "https://fapi.binance.com"
  
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
  @profit_lock_threshold 5.0        # Lock profits after $5 gain per position
  @profit_lock_percentage 0.80      # Lock 80% of gains (compound!)
  @session_profit_lock_pct 0.70     # Lock 70% of session profits (compound!)
  @max_profit_giveback_pct 0.40     # Allow 40% giveback - DON'T stop trading!
  
  # SESSION SETTINGS - Trade until 23:45 UTC
  @session_end_hour 23
  @session_end_minute 45
  @enable_session_time_limit true
  
  # Break-even protection
  @enable_breakeven_stop true         # Re-enabled with higher threshold
  @breakeven_trigger_pct 0.015        # Move SL to break-even after 1.5% profit (was 0.6% - too fast)
  @breakeven_buffer_pct 0.002         # Small buffer above entry for fees

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
  
  @min_confidence_long 50   # Lowered from 55 for more trades
  @min_confidence_short 50  # Lowered from 55 for more trades
  @min_projected_move_pct 0.003
  @min_energy_level :medium
  @fee_floor_multiplier 2.0  # Only trade when expected profit > 2x fees (was 3x)
  @use_ai_brain true   # AI Brain enabled for smarter entries
  @ai_min_confidence 0.48  # Lowered from 0.50 for more trades

  # ═══════════════════════════════════════════════════════════════════════════════
  # 3️⃣ EXPANDED MEME COIN POOL ($0.0001 - $10 range)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  # 🏆 ALL MAJOR ASSETS - OPTIMIZED TIERS - NO BLOCKING!
  @priority_assets ~w(
    BTCUSDT ETHUSDT SOLUSDT BNBUSDT LTCUSDT NEARUSDT AVAXUSDT INJUSDT ATOMUSDT SUIUSDT
    PEPEUSDT 1000PEPEUSDT WIFUSDT BONKUSDT 1000BONKUSDT FLOKIUSDT 1000FLOKIUSDT
    SHIBUSDT 1000SHIBUSDT DOGEUSDT MEMEUSDT PEOPLEUSDT LUNCUSDT 1000LUNCUSDT
    BTTCUSDT HOTUSDT ACHUSDT SPELLUSDT REEFUSDT ANKRUSDT CELRUSDT
    DENTUSDT SCUSDT STMXUSDT CKBUSDT JSTUSDT SUNUSDT WINUSDT
    NKNUSDT OGNUSDT OAXUSDT VITEUSDT DREPUSDT MDTUSDT CTKUSDT
  )
  
  # 📈 EXPANDED SAMPLE SPACE - More assets for more opportunities
  @secondary_assets ~w(
    SUIUSDT APTUSDT ARBUSDT OPUSDT SEIUSDT TIAUSDT UNIUSDT
    XRPUSDT ADAUSDT MATICUSDT FILUSDT GALAUSDT SANDUSDT MANAUSDT
    APEUSDT CRVUSDT LDOUSDT GMXUSDT MAGICUSDT RDNTUSDT PENDLEUSDT
    STXUSDT CFXUSDT FETUSDT AGIXUSDT OCEANUSDT RLCUSDT CTSIUSDT
    ARPAUSDT PHBUSDT AMBUSDT VOXELUSDT JASMYUSDT ROSEUSDT WOOUSDT
    AUDIOUSDT ENSUSDT LPTUSDT SKLUSDT CELOUSDT API3USDT BANDUSDT
    KAVAUSDT ZILUSDT IOTAUSDT ONEUSDT VETUSDT ZRXUSDT SNXUSDT
    COMPUSDT YFIUSDT SUSHIUSDT BALUSDT RENUSDT KNCUSDT LRCUSDT
  )
  
  # 🚫 ONLY STABLECOINS BLOCKED - All trading assets have optimized tiers!
  # BNB re-enabled with tier7 settings (0.2% TP)
  # SOL re-enabled with tier6 settings (0.15% TP)
  @blocked_assets ~w(USDCUSDT BUSDUSDT TUSDUSDT USDTUSDT LINKUSDT DOTUSDT)
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 4️⃣ PHYSICS TRAJECTORY EXIT - FIXED TP DIRECTION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @use_physics_exits true
  @max_hold_minutes 15
  @fallback_stop_loss_pct 0.008
  @fallback_take_profit_pct 0.006  # Tighter TP - 0.6% to actually hit TP
  
  @min_time_to_target_minutes 1
  @max_time_to_target_minutes 30  # Accept 15-30 min signals (was 12 - too tight)
  
  @tier_max_hold %{
    tier1: 2,   # Ultra volatile - super quick scalps
    tier2: 2,   # High volatile
    tier3: 3,   # Medium volatile
    tier4: 3,   # ETH - steady movers
    tier5: 5,   # BTC - more time to hit 0.3% TP
    tier6: 3,   # SOL - quick scalps with tiny TP
    tier7: 4    # BNB - medium hold
  }
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # 🤖 MULTI-BOT ASSET POOLS (8 bots × $1000 = $8000 total)
  # Set BOT_ID environment variable: export BOT_ID=1 (1-8)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @bot_asset_pools %{
    1 => ~w(LTCUSDT ATOMUSDT AVAXUSDT LINKUSDT),
    2 => ~w(INJUSDT UNIUSDT APTUSDT ARBUSDT),
    3 => ~w(DOTUSDT NEARUSDT DOGEUSDT SHIBUSDT 1000SHIBUSDT),
    4 => ~w(PEPEUSDT 1000PEPEUSDT FLOKIUSDT 1000FLOKIUSDT BONKUSDT 1000BONKUSDT WIFUSDT),
    5 => ~w(XRPUSDT ADAUSDT ALGOUSDT MATICUSDT),
    6 => ~w(FTMUSDT SANDUSDT MANAUSDT GALAUSDT),
    7 => ~w(OPUSDT IMXUSDT BLURUSDT MASKUSDT),
    8 => ~w(SUIUSDT SEIUSDT TIAUSDT JUPUSDT)
  }

  # ═══════════════════════════════════════════════════════════════════════════════
  # 5️⃣ FEE-AWARE TRAILING STOP + PROFIT PROTECTION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  # Get bot ID from environment (default: 0 = use all assets)
  defp get_bot_id do
    case System.get_env("BOT_ID") do
      nil -> 0
      id -> String.to_integer(id)
    end
  end
  
  # Check if symbol is in this bot's asset pool
  defp symbol_in_bot_pool?(symbol) do
    bot_id = get_bot_id()
    if bot_id == 0 do
      true  # No bot ID set, accept all assets
    else
      pool = Map.get(@bot_asset_pools, bot_id, [])
      symbol in pool
    end
  end
  
  @trailing_activation_fee_multiple 2.0
  @trailing_stop_distance_pct 0.004
  @trailing_ratchet_pct 0.001
  @trailing_stop_distance 0.15
  @stop_loss_pct 0.005      # Tighter SL for quick scalps
  @take_profit_pct 0.006    # Tighter TP - 0.6% target
  @volatility_buffer_pct 0.05
  @max_daily_drawdown_pct 3.0
  @max_consecutive_losses 5

  # ═══════════════════════════════════════════════════════════════════════════════
  # POSITION SIZING
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @max_positions 10  # Increased for 50 trades/hr target
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
    LINKUSDT AVAXUSDT DOTUSDT ATOMUSDT NEARUSDT APTUSDT 
    INJUSDT UNIUSDT AAVEUSDT MKRUSDT LTCUSDT BCHUSDT ETCUSDT RUNEUSDT
    FETUSDT AGIXUSDT OCEANUSDT RLCUSDT CTSIUSDT
  )

  # ETH stays in tier4 (working great - hit +$32.72 TP!)
  @tier4_eth ~w(ETHUSDT)
  
  # BTC gets tier5 with conservative settings (0.3% TP)
  @tier5_btc ~w(BTCUSDT)
  
  # SOL gets tier6 - only moves 0.12%/3min, needs tiny TP!
  @tier6_sol ~w(SOLUSDT)
  
  # BNB gets tier7 - similar to SOL, needs small TP
  @tier7_bnb ~w(BNBUSDT)

  # Include all tiers - NO BLOCKING!
  @tradeable_assets @tier1_ultra_volatile ++ @tier2_high_volatile ++ @tier3_medium_volatile ++ @tier4_eth ++ @tier5_btc ++ @tier6_sol ++ @tier7_bnb

  # OPTIMIZED LEVERAGE BY TIER - Higher leverage for smaller moves
  @tier_leverage %{
    tier1: 5,   # Meme coins - volatile
    tier2: 6,   # High volatile alts
    tier3: 7,   # Medium volatile
    tier4: 8,   # ETH
    tier5: 5,   # BTC - conservative
    tier6: 10,  # SOL - need higher lev for tiny moves
    tier7: 8    # BNB - medium
  }
  
  # OPTIMIZED TP BY TIER - Based on actual price movement data!
  @tier_take_profit %{
    tier1: 0.005,   # 0.5% - meme coins move fast
    tier2: 0.006,   # 0.6%
    tier3: 0.007,   # 0.7%
    tier4: 0.008,   # 0.8% - ETH (working!)
    tier5: 0.003,   # 0.3% - BTC
    tier6: 0.0015,  # 0.15% - SOL only moves 0.12%/3min!
    tier7: 0.002    # 0.2% - BNB
  }
  
  # OPTIMIZED SL BY TIER
  @tier_stop_loss %{
    tier1: 0.004,   # 0.4%
    tier2: 0.005,   # 0.5%
    tier3: 0.005,   # 0.5%
    tier4: 0.006,   # 0.6% - ETH
    tier5: 0.004,   # 0.4% - BTC (tight)
    tier6: 0.002,   # 0.2% - SOL (very tight)
    tier7: 0.003    # 0.3% - BNB
  }

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
    bot_id = get_bot_id()
    bot_pool = if bot_id > 0, do: Map.get(@bot_asset_pools, bot_id, []), else: ["ALL"]
    
    log_to_file("SESSION_START", %{
      version: "v16.9-HFT",
      execution_mode: @execution_mode,
      bot_id: bot_id,
      asset_pool: bot_pool,
      starting_balance: state.margin_balance,
      ai_brain_enabled: @use_ai_brain,
      time_horizon_filter: "#{@min_time_to_target_minutes}-#{@max_time_to_target_minutes}m",
      max_positions: @max_positions,
      max_hold_minutes: "5-7 (HFT)",
      relax_window_enabled: @enable_relax_window,
      profit_lock_enabled: @enable_profit_lock,
      daily_target: @daily_target_usd,
      hourly_target: 25,
      trades_per_hour_target: 50,
      tp_targets: "1.5%+ (fee optimized)",
      blocked_assets: @blocked_assets
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
  def close_exchange_positions, do: GenServer.call(__MODULE__, :close_exchange_positions, 60_000)
  def sync_with_exchange, do: GenServer.call(__MODULE__, :sync_with_exchange, 30_000)
  def force_trade(symbol, direction), do: GenServer.call(__MODULE__, {:force_trade, symbol, direction}, 10_000)
  def account_info, do: GenServer.call(__MODULE__, :account_info, 10_000)
  def trade_history(limit \\ 50), do: GenServer.call(__MODULE__, {:trade_history, limit}, 30_000)
  def audit_report, do: GenServer.call(__MODULE__, :audit_report, 60_000)
  def income_history(limit \\ 100), do: GenServer.call(__MODULE__, {:income_history, limit}, 30_000)
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
    
    bot_id = get_bot_id()
    bot_pool = if bot_id > 0, do: Map.get(@bot_asset_pools, bot_id, []) |> Enum.join(", "), else: "ALL ASSETS"
    
    # Check credentials for testnet/production
    mode_status = case @execution_mode do
      :simulation -> "🎮 SIMULATION (no real orders)"
      :testnet -> 
        if System.get_env("BINANCE_FUTURES_API_KEY"), 
          do: "🧪 TESTNET (real orders on testnet)", 
          else: "🧪 TESTNET ⚠️ MISSING API KEYS!"
      :production ->
        if System.get_env("BINANCE_FUTURES_API_KEY"),
          do: "🔴 PRODUCTION (REAL MONEY!)",
          else: "🔴 PRODUCTION ⚠️ MISSING API KEYS!"
    end
    
    Logger.info("""
    
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 MARGIN SCALPER v16.9 HFT - ALL ASSETS OPTIMIZED ($43/hr TARGET)
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 
    🌊 🔧 Execution Mode: #{mode_status}
    🌊 🤖 Bot ID: #{if bot_id > 0, do: bot_id, else: "NOT SET (using all assets)"}
    🌊 📋 Asset Pool: #{bot_pool}
    🌊 📝 Logging to: #{@log_directory}
    🌊 ⏰ Session: Trade until 23:45 UTC
    🌊 📊 Max Positions: #{@max_positions}
    🌊 🧠 AI Brain: ✅ ENABLED (48% threshold)
    🌊 
    🌊 💰 TIER SETTINGS (ALL OPTIMIZED - NO BLOCKING!):
    🌊    tier4 ETH:  0.8% TP, 8x lev, 3min (working great!)
    🌊    tier5 BTC:  0.3% TP, 5x lev, 5min (conservative)
    🌊    tier6 SOL:  0.15% TP, 10x lev, 3min (tiny moves!)
    🌊    tier7 BNB:  0.2% TP, 8x lev, 4min (re-enabled!)
    🌊 
    🌊 🔄 PROFIT COMPOUNDING: Lock 70% of gains, KEEP TRADING!
    🌊 🎯 Target: 30+ trades/hr × $1.43/trade = $43/hr
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
    bot_id = get_bot_id()
    bot_pool = if bot_id > 0, do: Map.get(@bot_asset_pools, bot_id, []) |> Enum.join(", "), else: "ALL"
    
    Logger.info("""
    
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 MARGIN SCALPER v16.7 HFT - BOT #{bot_id} ACTIVE
    🌊 ═══════════════════════════════════════════════════════════════════════════════
    🌊 🤖 Bot ID: #{bot_id} | Assets: #{bot_pool}
    🌊 📝 Daily Log:  #{get_log_file_path()}
    🌊 ⏰ Hourly Log: #{get_hourly_log_file_path()}
    🌊 🎯 Target: 50 trades/hr → $25/hr
    🌊 💰 Profit Lock: #{@profit_lock_percentage * 100}% locked after $#{@profit_lock_threshold}
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
      version: "v16.9-HFT",
      bot_id: get_bot_id(),
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
    # Determine execution mode
    mode_info = case @execution_mode do
      :simulation -> %{mode: "SIMULATION", endpoint: "N/A (local)", balance_source: "virtual"}
      :testnet -> %{mode: "TESTNET", endpoint: @futures_testnet_rest, balance_source: "testnet"}
      :production -> %{mode: "PRODUCTION ⚠️", endpoint: @futures_production_rest, balance_source: "real"}
    end
    
    # Try to fetch real account data if not simulation
    {exchange_balance, exchange_positions} = if @execution_mode != :simulation do
      {fetch_exchange_balance(), fetch_exchange_positions()}
    else
      {nil, []}
    end
    
    # Calculate used margin from local positions
    local_used_margin = state.positions 
      |> Map.values() 
      |> Enum.reduce(0.0, fn pos, acc -> acc + (pos.margin || 0) end)
    
    # Format balance properly (avoid scientific notation)
    format_money = fn val -> :erlang.float_to_binary(val * 1.0, decimals: 2) end
    format_pct = fn val -> :erlang.float_to_binary(val * 1.0, decimals: 2) end
    
    # Calculate balance progression
    starting_balance = Map.get(state, :starting_balance, 1000.0)
    current_balance = state.margin_balance + state.total_pnl
    balance_change = current_balance - starting_balance
    balance_change_pct = if starting_balance > 0, do: (balance_change / starting_balance) * 100, else: 0.0
    
    # Calculate unrealized P&L from exchange positions
    unrealized_pnl = exchange_positions 
      |> Enum.reduce(0.0, fn pos, acc -> acc + (pos.unrealized_pnl || 0) end)
    
    # Session duration
    uptime_seconds = if state.started_at do
      DateTime.diff(DateTime.utc_now(), state.started_at)
    else
      0
    end
    uptime_hours = uptime_seconds / 3600
    
    info = %{
      execution_mode: mode_info.mode,
      api_endpoint: mode_info.endpoint,
      balance_source: mode_info.balance_source,
      starting_balance: Float.round(starting_balance, 2),
      current_balance: Float.round(current_balance, 2),
      balance_change: Float.round(balance_change, 2),
      balance_change_pct: Float.round(balance_change_pct, 2),
      local_margin_balance: Float.round(state.margin_balance * 1.0, 2),
      local_available_margin: Float.round(state.available_margin * 1.0, 2),
      local_used_margin: Float.round(local_used_margin, 2),
      exchange_balance: exchange_balance,
      exchange_positions: length(exchange_positions),
      unrealized_pnl: Float.round(unrealized_pnl, 2),
      realized_pnl: Float.round(state.total_pnl, 2),
      total_fees: Float.round(state.total_fees, 2),
      net_pnl: Float.round(state.total_pnl - state.total_fees, 2),
      leverage: @default_leverage,
      margin_mode: @margin_mode,
      open_positions: map_size(state.positions),
      relax_windows: map_size(state.relax_windows),
      locked_profit: Float.round(Map.get(state, :locked_profit, 0) * 1.0, 2),
      total_pnl: Float.round(state.total_pnl * 1.0, 2),
      total_trades: state.total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades,
      win_rate: (if state.total_trades > 0, do: Float.round(state.winning_trades / state.total_trades * 100, 1), else: 0.0),
      uptime_hours: Float.round(uptime_hours, 2),
      pnl_per_hour: (if uptime_hours > 0, do: Float.round(state.total_pnl / uptime_hours, 2), else: 0.0),
      trades_per_hour: (if uptime_hours > 0, do: Float.round(state.total_trades / uptime_hours, 1), else: 0.0),
      api_key_set: not is_nil(System.get_env("BINANCE_FUTURES_API_KEY"))
    }
    
    # Balance change emoji
    change_emoji = cond do
      balance_change > 10 -> "🟢"
      balance_change > 0 -> "🔹"
      balance_change < -10 -> "🔴"
      balance_change < 0 -> "🔸"
      true -> "⚪"
    end
    
    # Print nicely formatted
    IO.puts("""
    
    🔐 ═══════════════════════════════════════════════════════════════════════════════
    🔐 ACCOUNT INFO - #{mode_info.mode}
    🔐 ═══════════════════════════════════════════════════════════════════════════════
    🔐 
    🔐 Execution Mode:    #{mode_info.mode}
    🔐 API Endpoint:      #{mode_info.endpoint}
    🔐 API Key Set:       #{if info.api_key_set, do: "✅ YES", else: "❌ NO"}
    🔐 
    🔐 📈 Balance Progression:
    🔐   Starting Balance: $#{format_money.(starting_balance)}
    🔐   Current Balance:  $#{format_money.(current_balance)} #{change_emoji}
    🔐   Change:           #{if balance_change >= 0, do: "+", else: ""}$#{format_money.(balance_change)} (#{if balance_change >= 0, do: "+", else: ""}#{format_pct.(balance_change_pct)}%)
    🔐   Exchange Balance: #{if exchange_balance, do: "$#{format_money.(exchange_balance)}", else: "N/A"}
    🔐 
    🔐 💰 P&L Breakdown:
    🔐   Realized P&L:     #{if state.total_pnl >= 0, do: "+", else: ""}$#{format_money.(state.total_pnl)}
    🔐   Unrealized P&L:   #{if unrealized_pnl >= 0, do: "+", else: ""}$#{format_money.(unrealized_pnl)}
    🔐   Total Fees:       -$#{format_money.(state.total_fees)}
    🔐   Net P&L:          #{if info.net_pnl >= 0, do: "+", else: ""}$#{format_money.(info.net_pnl)}
    🔐 
    🔐 📊 Session Stats (#{format_pct.(uptime_hours)}h):
    🔐   Total Trades:     #{info.total_trades} (#{info.winning_trades}W / #{info.losing_trades}L)
    🔐   Win Rate:         #{info.win_rate}%
    🔐   P&L/Hour:         #{if info.pnl_per_hour >= 0, do: "+", else: ""}$#{format_money.(info.pnl_per_hour)}/hr
    🔐   Trades/Hour:      #{info.trades_per_hour}/hr
    🔐   Locked Profit:    $#{format_money.(Map.get(state, :locked_profit, 0) * 1.0)}
    🔐 
    🔐 💼 Margin Usage:
    🔐   Local Used:       $#{format_money.(local_used_margin)} (#{info.open_positions} positions)
    🔐   Local Available:  $#{format_money.(state.available_margin)}
    🔐   Exchange Positions: #{length(exchange_positions)}
    🔐 
    🔐 📍 Open Positions (Local):
    """)
    
    # List local positions
    if map_size(state.positions) > 0 do
      state.positions |> Map.values() |> Enum.each(fn pos ->
        current_price = Map.get(state.price_cache, pos.symbol, pos.entry_price)
        pos_pnl = calculate_position_pnl(pos, current_price)
        pnl_emoji = if pos_pnl >= 0, do: "🟢", else: "🔴"
        IO.puts("🔐   #{pnl_emoji} #{pos.symbol} #{pos.direction}: qty=#{pos.quantity}, entry=$#{format_money.(pos.entry_price)}, P&L=#{if pos_pnl >= 0, do: "+", else: ""}$#{format_money.(pos_pnl)}")
      end)
    else
      IO.puts("🔐   (none)")
    end
    
    # List exchange positions
    IO.puts("\n🔐 📍 Open Positions (Exchange):")
    if length(exchange_positions) > 0 do
      exchange_positions |> Enum.each(fn pos ->
        pnl_emoji = if pos.unrealized_pnl >= 0, do: "🟢", else: "🔴"
        IO.puts("🔐   #{pnl_emoji} #{pos.symbol} #{pos.side}: qty=#{pos.qty}, entry=$#{Float.round(pos.entry_price, 2)}, P&L=#{if pos.unrealized_pnl >= 0, do: "+", else: ""}$#{pos.unrealized_pnl}")
      end)
    else
      IO.puts("🔐   (none)")
    end
    
    IO.puts("""
    🔐 
    🔐 ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    {:reply, info, state}
  end
  
  defp fetch_exchange_balance do
    api_key = System.get_env("BINANCE_FUTURES_API_KEY")
    api_secret = System.get_env("BINANCE_FUTURES_API_SECRET")
    
    if is_nil(api_key) or is_nil(api_secret) do
      nil
    else
      base_url = if @execution_mode == :testnet, do: @futures_testnet_rest, else: @futures_production_rest
      timestamp = System.system_time(:millisecond)
      
      query_string = "timestamp=#{timestamp}"
      signature = :crypto.mac(:hmac, :sha256, api_secret, query_string) |> Base.encode16(case: :lower)
      
      url = "#{base_url}/fapi/v2/balance?#{query_string}&signature=#{signature}"
      headers = [{"X-MBX-APIKEY", api_key}]
      
      case HTTPoison.get(url, headers, timeout: 10_000, recv_timeout: 10_000) do
        {:ok, %{status_code: 200, body: body}} ->
          balances = Jason.decode!(body)
          usdt = Enum.find(balances, fn b -> b["asset"] == "USDT" end)
          if usdt, do: parse_float(usdt["balance"]), else: nil
        _ ->
          nil
      end
    end
  end
  
  defp fetch_exchange_positions do
    api_key = System.get_env("BINANCE_FUTURES_API_KEY")
    api_secret = System.get_env("BINANCE_FUTURES_API_SECRET")
    
    if is_nil(api_key) or is_nil(api_secret) do
      []
    else
      base_url = if @execution_mode == :testnet, do: @futures_testnet_rest, else: @futures_production_rest
      timestamp = System.system_time(:millisecond)
      
      query_string = "timestamp=#{timestamp}"
      signature = :crypto.mac(:hmac, :sha256, api_secret, query_string) |> Base.encode16(case: :lower)
      
      url = "#{base_url}/fapi/v2/positionRisk?#{query_string}&signature=#{signature}"
      headers = [{"X-MBX-APIKEY", api_key}]
      
      case HTTPoison.get(url, headers, timeout: 10_000, recv_timeout: 10_000) do
        {:ok, %{status_code: 200, body: body}} ->
          positions = Jason.decode!(body)
          # Filter positions with non-zero quantity
          positions
          |> Enum.filter(fn p -> 
            qty = parse_float(p["positionAmt"]) || 0.0
            qty != 0.0
          end)
          |> Enum.map(fn p ->
            qty = parse_float(p["positionAmt"]) || 0.0
            %{
              symbol: p["symbol"],
              side: if(qty > 0, do: "LONG", else: "SHORT"),
              qty: abs(qty),
              entry_price: parse_float(p["entryPrice"]) || 0.0,
              mark_price: parse_float(p["markPrice"]) || 0.0,
              unrealized_pnl: Float.round((parse_float(p["unRealizedProfit"]) || 0.0), 2),
              leverage: p["leverage"]
            }
          end)
        _ ->
          []
      end
    end
  end
  
  defp fetch_exchange_trades(limit \\ 50) do
    api_key = System.get_env("BINANCE_FUTURES_API_KEY")
    api_secret = System.get_env("BINANCE_FUTURES_API_SECRET")
    
    if is_nil(api_key) or is_nil(api_secret) do
      []
    else
      base_url = if @execution_mode == :testnet, do: @futures_testnet_rest, else: @futures_production_rest
      timestamp = System.system_time(:millisecond)
      
      # Fetch trades for all major symbols
      symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "LTCUSDT", "XRPUSDT", "AVAXUSDT", "APTUSDT", "SUIUSDT"]
      
      trades = symbols
      |> Enum.flat_map(fn symbol ->
        query_string = "symbol=#{symbol}&limit=#{limit}&timestamp=#{timestamp}"
        signature = :crypto.mac(:hmac, :sha256, api_secret, query_string) |> Base.encode16(case: :lower)
        
        url = "#{base_url}/fapi/v1/userTrades?#{query_string}&signature=#{signature}"
        headers = [{"X-MBX-APIKEY", api_key}]
        
        case HTTPoison.get(url, headers, timeout: 10_000, recv_timeout: 10_000) do
          {:ok, %{status_code: 200, body: body}} ->
            Jason.decode!(body)
            |> Enum.map(fn t ->
              %{
                id: t["id"],
                order_id: t["orderId"],
                symbol: t["symbol"],
                side: t["side"],
                price: parse_float(t["price"]) || 0.0,
                qty: parse_float(t["qty"]) || 0.0,
                realized_pnl: parse_float(t["realizedPnl"]) || 0.0,
                commission: parse_float(t["commission"]) || 0.0,
                commission_asset: t["commissionAsset"],
                time: t["time"] |> DateTime.from_unix!(:millisecond) |> DateTime.to_string(),
                timestamp: t["time"],
                buyer: t["buyer"],
                maker: t["maker"]
              }
            end)
          _ ->
            []
        end
      end)
      |> Enum.sort_by(& &1.timestamp, :desc)
      |> Enum.take(limit)
      
      trades
    end
  end
  
  defp fetch_exchange_income(limit \\ 100) do
    api_key = System.get_env("BINANCE_FUTURES_API_KEY")
    api_secret = System.get_env("BINANCE_FUTURES_API_SECRET")
    
    if is_nil(api_key) or is_nil(api_secret) do
      []
    else
      base_url = if @execution_mode == :testnet, do: @futures_testnet_rest, else: @futures_production_rest
      timestamp = System.system_time(:millisecond)
      
      query_string = "limit=#{limit}&timestamp=#{timestamp}"
      signature = :crypto.mac(:hmac, :sha256, api_secret, query_string) |> Base.encode16(case: :lower)
      
      url = "#{base_url}/fapi/v1/income?#{query_string}&signature=#{signature}"
      headers = [{"X-MBX-APIKEY", api_key}]
      
      case HTTPoison.get(url, headers, timeout: 10_000, recv_timeout: 10_000) do
        {:ok, %{status_code: 200, body: body}} ->
          Jason.decode!(body)
          |> Enum.map(fn i ->
            %{
              symbol: i["symbol"] || "N/A",
              income_type: i["incomeType"],
              income: parse_float(i["income"]) || 0.0,
              asset: i["asset"],
              time: i["time"] |> DateTime.from_unix!(:millisecond) |> DateTime.to_string(),
              timestamp: i["time"],
              info: i["info"],
              tran_id: i["tranId"],
              trade_id: i["tradeId"]
            }
          end)
          |> Enum.sort_by(& &1.timestamp, :desc)
        _ ->
          []
      end
    end
  end

  @impl true
  def handle_call(:analytics, _from, state) do
    total_closed = state.winning_trades + state.losing_trades
    win_rate = if total_closed > 0, do: Float.round(state.winning_trades / total_closed * 100.0, 1), else: 0.0
    
    report = """
    
    📊 ANALYTICS REPORT v16.7 HFT - BOT #{get_bot_id()}
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
  def handle_call(:close_exchange_positions, _from, state) do
    IO.puts("\n⚠️  CLOSING ALL EXCHANGE POSITIONS...")
    
    exchange_positions = fetch_exchange_positions()
    
    if length(exchange_positions) == 0 do
      IO.puts("✅ No exchange positions to close")
      {:reply, {:ok, 0}, state}
    else
      IO.puts("📍 Found #{length(exchange_positions)} positions on exchange")
      
      results = Enum.map(exchange_positions, fn pos ->
        # execute_close_order expects the ORIGINAL direction (it calculates opposite internally)
        original_direction = if pos.side == "LONG", do: :long, else: :short
        IO.puts("   Closing #{pos.symbol} #{pos.side} qty=#{pos.qty}...")
        
        result = execute_close_order(pos.symbol, original_direction, pos.qty)
        
        case result do
          {:ok, _} -> 
            IO.puts("   ✅ Closed #{pos.symbol}")
            :ok
          {:error, reason} -> 
            IO.puts("   ❌ Failed to close #{pos.symbol}: #{inspect(reason)}")
            {:error, pos.symbol, reason}
        end
        
        # Small delay to avoid rate limits
        Process.sleep(500)
        result
      end)
      
      closed_count = Enum.count(results, fn r -> r == {:ok, %{}} or match?({:ok, _}, r) end)
      IO.puts("\n✅ Closed #{closed_count}/#{length(exchange_positions)} exchange positions")
      
      {:reply, {:ok, closed_count}, state}
    end
  end

  @impl true
  def handle_call(:sync_with_exchange, _from, state) do
    IO.puts("\n🔄 SYNCING LOCAL STATE WITH EXCHANGE...")
    
    exchange_positions = fetch_exchange_positions()
    
    if length(exchange_positions) == 0 do
      IO.puts("✅ No exchange positions - local state already clean")
      {:reply, {:ok, 0}, %{state | positions: %{}}}
    else
      IO.puts("📍 Found #{length(exchange_positions)} positions on exchange")
      
      # Convert exchange positions to local format
      new_positions = exchange_positions
      |> Enum.map(fn pos ->
        direction = if pos.side == "LONG", do: :long, else: :short
        leverage = case pos.leverage do
          l when is_binary(l) -> String.to_integer(l)
          l when is_integer(l) -> l
          _ -> @default_leverage
        end
        margin = pos.qty * pos.entry_price / leverage
        notional = pos.qty * pos.entry_price
        
        # Calculate SL/TP using existing function
        {stop_loss, take_profit} = calculate_sl_tp_fixed(pos.entry_price, direction, pos.symbol)
        
        position = %{
          id: Ecto.UUID.generate(),
          symbol: pos.symbol,
          direction: direction,
          entry_price: pos.entry_price,
          current_price: pos.mark_price,
          quantity: pos.qty,
          leverage: leverage,
          margin: margin,
          notional: notional,
          stop_loss: stop_loss,
          take_profit: take_profit,
          opened_at: DateTime.utc_now(),
          max_hold_until: DateTime.add(DateTime.utc_now(), get_tier_max_hold(pos.symbol) * 60, :second),
          confidence: 50,
          fee: calculate_fee(notional),
          peak_profit: 0.0,
          locked_profit: 0.0,
          synced_from_exchange: true,
          exchange_unrealized_pnl: pos.unrealized_pnl
        }
        
        IO.puts("   Synced #{pos.symbol} #{direction}: qty=#{pos.qty}, entry=$#{Float.round(pos.entry_price, 2)}, unrealized=$#{pos.unrealized_pnl}")
        {position.id, position}
      end)
      |> Map.new()
      
      used_margin = Enum.reduce(new_positions, 0.0, fn {_, pos}, acc -> acc + pos.margin end)
      
      IO.puts("\n✅ Synced #{map_size(new_positions)} positions (margin: $#{Float.round(used_margin, 2)})")
      
      {:reply, {:ok, map_size(new_positions)}, %{state | 
        positions: new_positions,
        available_margin: state.margin_balance - used_margin
      }}
    end
  end

  @impl true
  def handle_call({:trade_history, limit}, _from, state) do
    IO.puts("\n📜 FETCHING EXCHANGE TRADE HISTORY (last #{limit} trades)...")
    
    trades = fetch_exchange_trades(limit)
    
    if length(trades) == 0 do
      IO.puts("   (no trades found)")
    else
      IO.puts("\n📜 ═══════════════════════════════════════════════════════════════════════════════")
      IO.puts("📜 EXCHANGE TRADE HISTORY - #{length(trades)} trades")
      IO.puts("📜 ═══════════════════════════════════════════════════════════════════════════════\n")
      
      # Group by symbol
      trades_by_symbol = Enum.group_by(trades, & &1.symbol)
      
      Enum.each(trades_by_symbol, fn {symbol, symbol_trades} ->
        total_pnl = Enum.reduce(symbol_trades, 0.0, fn t, acc -> acc + t.realized_pnl end)
        total_commission = Enum.reduce(symbol_trades, 0.0, fn t, acc -> acc + t.commission end)
        pnl_emoji = if total_pnl >= 0, do: "🟢", else: "🔴"
        
        IO.puts("📜 #{pnl_emoji} #{symbol}: #{length(symbol_trades)} trades, P&L: #{if total_pnl >= 0, do: "+", else: ""}$#{Float.round(total_pnl, 2)}, Fees: -$#{Float.round(total_commission, 2)}")
        
        # Show recent trades for this symbol
        symbol_trades
        |> Enum.take(5)
        |> Enum.each(fn t ->
          side_emoji = if t.side == "BUY", do: "🟢", else: "🔴"
          IO.puts("📜     #{side_emoji} #{t.side} #{t.qty} @ $#{Float.round(t.price, 2)} | P&L: $#{Float.round(t.realized_pnl, 2)} | #{t.time}")
        end)
        
        if length(symbol_trades) > 5 do
          IO.puts("📜     ... and #{length(symbol_trades) - 5} more trades")
        end
        IO.puts("")
      end)
      
      # Summary
      total_realized = Enum.reduce(trades, 0.0, fn t, acc -> acc + t.realized_pnl end)
      total_fees = Enum.reduce(trades, 0.0, fn t, acc -> acc + t.commission end)
      IO.puts("📜 ═══════════════════════════════════════════════════════════════════════════════")
      IO.puts("📜 TOTAL: #{length(trades)} trades | Realized P&L: #{if total_realized >= 0, do: "+", else: ""}$#{Float.round(total_realized, 2)} | Fees: -$#{Float.round(total_fees, 2)}")
      IO.puts("📜 ═══════════════════════════════════════════════════════════════════════════════\n")
    end
    
    {:reply, {:ok, trades}, state}
  end

  @impl true
  def handle_call({:income_history, limit}, _from, state) do
    IO.puts("\n💰 FETCHING INCOME HISTORY (last #{limit} entries)...")
    
    income = fetch_exchange_income(limit)
    
    if length(income) == 0 do
      IO.puts("   (no income records found)")
    else
      IO.puts("\n💰 ═══════════════════════════════════════════════════════════════════════════════")
      IO.puts("💰 INCOME HISTORY - #{length(income)} entries")
      IO.puts("💰 ═══════════════════════════════════════════════════════════════════════════════\n")
      
      # Group by income type
      by_type = Enum.group_by(income, & &1.income_type)
      
      Enum.each(by_type, fn {type, entries} ->
        total = Enum.reduce(entries, 0.0, fn e, acc -> acc + e.income end)
        emoji = cond do
          type == "REALIZED_PNL" and total >= 0 -> "🟢"
          type == "REALIZED_PNL" -> "🔴"
          type == "COMMISSION" -> "💸"
          type == "FUNDING_FEE" -> "📊"
          true -> "📝"
        end
        
        IO.puts("💰 #{emoji} #{type}: #{length(entries)} entries, Total: #{if total >= 0, do: "+", else: ""}$#{Float.round(total, 2)}")
      end)
      
      IO.puts("")
      
      # Recent entries
      IO.puts("💰 Recent Entries:")
      income
      |> Enum.take(10)
      |> Enum.each(fn e ->
        emoji = if e.income >= 0, do: "🟢", else: "🔴"
        IO.puts("💰   #{emoji} #{e.income_type} #{e.symbol}: #{if e.income >= 0, do: "+", else: ""}$#{Float.round(e.income, 2)} @ #{e.time}")
      end)
      
      IO.puts("\n💰 ═══════════════════════════════════════════════════════════════════════════════\n")
    end
    
    {:reply, {:ok, income}, state}
  end

  @impl true
  def handle_call(:audit_report, _from, state) do
    IO.puts("\n📋 GENERATING COMPREHENSIVE AUDIT REPORT...")
    
    # Fetch all data
    exchange_balance = fetch_exchange_balance()
    exchange_positions = fetch_exchange_positions()
    trades = fetch_exchange_trades(100)
    income = fetch_exchange_income(200)
    
    # Calculate totals from exchange
    realized_pnl = income 
      |> Enum.filter(& &1.income_type == "REALIZED_PNL")
      |> Enum.reduce(0.0, fn e, acc -> acc + e.income end)
    
    commissions = income 
      |> Enum.filter(& &1.income_type == "COMMISSION")
      |> Enum.reduce(0.0, fn e, acc -> acc + e.income end)
    
    funding_fees = income 
      |> Enum.filter(& &1.income_type == "FUNDING_FEE")
      |> Enum.reduce(0.0, fn e, acc -> acc + e.income end)
    
    unrealized_pnl = exchange_positions 
      |> Enum.reduce(0.0, fn p, acc -> acc + p.unrealized_pnl end)
    
    # Format helpers
    format_money = fn val -> :erlang.float_to_binary(val * 1.0, decimals: 2) end
    
    uptime_hours = if state.started_at do
      DateTime.diff(DateTime.utc_now(), state.started_at) / 3600
    else
      0.0
    end
    
    report = """
    
    📋 ═══════════════════════════════════════════════════════════════════════════════
    📋 COMPREHENSIVE AUDIT REPORT
    📋 MarginScalper v16.9 - #{@execution_mode |> to_string() |> String.upcase()}
    📋 Generated: #{DateTime.utc_now() |> DateTime.to_string()}
    📋 ═══════════════════════════════════════════════════════════════════════════════
    
    📋 SESSION OVERVIEW
    📋 ───────────────────────────────────────────────────────────────────────────────
    📋   Started:           #{if state.started_at, do: DateTime.to_string(state.started_at), else: "N/A"}
    📋   Uptime:            #{Float.round(uptime_hours, 2)} hours
    📋   Starting Balance:  $#{format_money.(Map.get(state, :starting_balance, 1000.0))}
    📋   Current Balance:   $#{format_money.(state.margin_balance + state.total_pnl)}
    📋   Exchange Balance:  #{if exchange_balance, do: "$#{format_money.(exchange_balance)}", else: "N/A"}
    
    📋 P&L BREAKDOWN (Exchange Verified)
    📋 ───────────────────────────────────────────────────────────────────────────────
    📋   Realized P&L:      #{if realized_pnl >= 0, do: "+", else: ""}$#{format_money.(realized_pnl)}
    📋   Unrealized P&L:    #{if unrealized_pnl >= 0, do: "+", else: ""}$#{format_money.(unrealized_pnl)}
    📋   Commissions:       $#{format_money.(commissions)}
    📋   Funding Fees:      #{if funding_fees >= 0, do: "+", else: ""}$#{format_money.(funding_fees)}
    📋   ─────────────────────────────────────────────────────────────────────────────
    📋   NET P&L:           #{if (realized_pnl + unrealized_pnl + commissions + funding_fees) >= 0, do: "+", else: ""}$#{format_money.(realized_pnl + unrealized_pnl + commissions + funding_fees)}
    
    📋 LOCAL TRACKING (Bot State)
    📋 ───────────────────────────────────────────────────────────────────────────────
    📋   Total Trades:      #{state.total_trades}
    📋   Winning Trades:    #{state.winning_trades}
    📋   Losing Trades:     #{state.losing_trades}
    📋   Win Rate:          #{if state.total_trades > 0, do: Float.round(state.winning_trades / state.total_trades * 100, 1), else: 0.0}%
    📋   Local P&L:         #{if state.total_pnl >= 0, do: "+", else: ""}$#{format_money.(state.total_pnl)}
    📋   Local Fees:        -$#{format_money.(state.total_fees)}
    📋   Locked Profit:     $#{format_money.(Map.get(state, :locked_profit, 0))}
    
    📋 OPEN POSITIONS (#{length(exchange_positions)})
    📋 ───────────────────────────────────────────────────────────────────────────────
    """
    
    IO.puts(report)
    
    if length(exchange_positions) > 0 do
      Enum.each(exchange_positions, fn pos ->
        pnl_emoji = if pos.unrealized_pnl >= 0, do: "🟢", else: "🔴"
        IO.puts("📋   #{pnl_emoji} #{pos.symbol} #{pos.side}: qty=#{pos.qty}, entry=$#{Float.round(pos.entry_price, 2)}, mark=$#{Float.round(pos.mark_price, 2)}, P&L=#{if pos.unrealized_pnl >= 0, do: "+", else: ""}$#{pos.unrealized_pnl}")
      end)
    else
      IO.puts("📋   (no open positions)")
    end
    
    IO.puts("""
    
    📋 RECENT TRADES (Last 10)
    📋 ───────────────────────────────────────────────────────────────────────────────
    """)
    
    if length(trades) > 0 do
      trades
      |> Enum.take(10)
      |> Enum.each(fn t ->
        side_emoji = if t.side == "BUY", do: "🟢", else: "🔴"
        IO.puts("📋   #{side_emoji} #{t.symbol} #{t.side} #{t.qty} @ $#{Float.round(t.price, 2)} | P&L: $#{Float.round(t.realized_pnl, 2)} | #{t.time}")
      end)
    else
      IO.puts("📋   (no recent trades)")
    end
    
    IO.puts("""
    
    📋 ═══════════════════════════════════════════════════════════════════════════════
    📋 END OF AUDIT REPORT
    📋 ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    audit_data = %{
      timestamp: DateTime.utc_now(),
      execution_mode: @execution_mode,
      session: %{
        started_at: state.started_at,
        uptime_hours: Float.round(uptime_hours, 2),
        starting_balance: Map.get(state, :starting_balance, 1000.0),
        current_balance: state.margin_balance + state.total_pnl
      },
      exchange: %{
        balance: exchange_balance,
        positions: length(exchange_positions),
        realized_pnl: Float.round(realized_pnl, 2),
        unrealized_pnl: Float.round(unrealized_pnl, 2),
        commissions: Float.round(commissions, 2),
        funding_fees: Float.round(funding_fees, 2)
      },
      local: %{
        total_trades: state.total_trades,
        winning_trades: state.winning_trades,
        losing_trades: state.losing_trades,
        total_pnl: Float.round(state.total_pnl, 2),
        total_fees: Float.round(state.total_fees, 2),
        locked_profit: Float.round(Map.get(state, :locked_profit, 0), 2)
      },
      positions: exchange_positions,
      recent_trades: Enum.take(trades, 20)
    }
    
    {:reply, {:ok, audit_data}, state}
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
    locked = Map.get(state, :locked_profit, 0)
    
    if peak > @profit_lock_threshold do
      max_giveback = peak * @max_profit_giveback_pct
      
      if (peak - current) > max_giveback and map_size(state.positions) > 0 do
        # Close positions to protect profits
        Logger.warning("🛡️ PROFIT PROTECTION: Locking $#{Float.round(peak * @session_profit_lock_pct, 2)} - closing positions but CONTINUING to trade!")
        state = close_all_positions(state, :session_profit_protection)
        
        # Lock the profits but DON'T STOP TRADING!
        new_locked = max(locked, peak * @session_profit_lock_pct)
        
        # Reset peak to current level so we can continue trading
        %{state | 
          locked_profit: new_locked,
          peak_session_profit: current,  # Reset peak so we don't keep triggering
          trading_paused: false  # KEEP TRADING!
        }
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
      
      # Multi-bot filter: only trade assets in this bot's pool
      not symbol_in_bot_pool?(symbol) ->
        {:reject, :not_in_bot_pool, state}
      
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
            
            # VALIDATION: Reject positions with 0 quantity or price
            if executed_qty <= 0 or executed_price <= 0 do
              Logger.error("❌ Invalid execution for #{symbol}: price=#{executed_price}, qty=#{executed_qty} - NOT storing position")
              state
            else
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
            end  # End of if executed_qty/price validation

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
    
    # First, filter out any invalid positions (qty=0, price=0) - cleanup from bad orders
    {valid_positions, invalid_positions} = state.positions
    |> Enum.split_with(fn {_id, pos} -> 
      pos.quantity > 0 and pos.entry_price > 0
    end)
    
    if length(invalid_positions) > 0 do
      invalid_symbols = invalid_positions |> Enum.map(fn {_id, pos} -> pos.symbol end) |> Enum.uniq()
      Logger.warning("🧹 Removing #{length(invalid_positions)} invalid positions: #{Enum.join(invalid_symbols, ", ")}")
    end
    
    state = %{state | positions: Map.new(valid_positions)}
    
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
    # Handle invalid positions (qty=0) - just remove from state without exchange order
    if pos.quantity <= 0 or pos.entry_price <= 0 do
      Logger.warning("🧹 Removing invalid position #{pos.symbol} (qty=#{pos.quantity}, price=#{pos.entry_price})")
      %{state | positions: Map.delete(state.positions, pos.id)}
    else
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

        {:error, close_reason} ->
          Logger.error("❌ Failed to close #{pos.symbol}: #{inspect(close_reason)}")
          %{state | errors: state.errors + 1}
      end
    end  # end of if pos.quantity > 0
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
      symbol in @tier4_eth -> :tier4  # ETH
      symbol in @tier5_btc -> :tier5  # BTC with optimized settings
      symbol in @tier6_sol -> :tier6  # SOL with tiny TP (0.15%)
      symbol in @tier7_bnb -> :tier7  # BNB with small TP (0.2%)
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
  # EXCHANGE INTERACTION - SUPPORTS SIMULATION, TESTNET, AND PRODUCTION
  # ═══════════════════════════════════════════════════════════════════════════════

  defp execute_futures_order(symbol, direction, quantity, leverage, entry_price, order_type) do
    case @execution_mode do
      :simulation ->
        execute_simulated_order(symbol, quantity, entry_price, order_type)
      
      mode when mode in [:testnet, :production] ->
        execute_real_futures_order(symbol, direction, quantity, leverage, order_type, mode)
    end
  end

  defp execute_close_order(symbol, direction, quantity) do
    case @execution_mode do
      :simulation ->
        case get_current_price(symbol) do
          {:ok, price} -> {:ok, %{executed_price: price, executed_qty: quantity, status: :filled}}
          error -> error
        end
      
      mode when mode in [:testnet, :production] ->
        execute_real_close_order(symbol, direction, quantity, mode)
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # SIMULATION MODE
  # ═══════════════════════════════════════════════════════════════════════════════

  defp execute_simulated_order(symbol, quantity, entry_price, order_type) do
    case get_current_price(symbol) do
      {:ok, current_price} ->
        executed_price = if order_type == :limit, do: entry_price || current_price, else: current_price
        {:ok, %{order_id: "SIM_#{:erlang.system_time(:millisecond)}", executed_price: executed_price, executed_qty: quantity, status: :filled}}
      error -> error
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # REAL EXCHANGE EXECUTION (TESTNET / PRODUCTION)
  # ═══════════════════════════════════════════════════════════════════════════════

  defp execute_real_futures_order(symbol, direction, quantity, leverage, order_type, mode) do
    base_url = if mode == :testnet, do: @futures_testnet_rest, else: @futures_production_rest
    
    # Get API credentials
    api_key = System.get_env("BINANCE_FUTURES_API_KEY")
    api_secret = System.get_env("BINANCE_FUTURES_API_SECRET")
    
    if is_nil(api_key) or is_nil(api_secret) do
      Logger.error("❌ Missing API credentials! Set BINANCE_FUTURES_API_KEY and BINANCE_FUTURES_API_SECRET")
      {:error, :missing_credentials}
    else
      # Get current price FIRST - this is required for testnet fallback
      case get_current_price(symbol) do
        {:ok, current_price} when current_price > 0 ->
          # Format quantity and validate
          formatted_qty = format_quantity(quantity, symbol)
          qty_float = case Float.parse(formatted_qty) do
            {f, _} -> f
            :error -> 0.0
          end
          
          # Check minimum quantity - reject if too small
          min_qty = get_min_quantity(symbol)
          if qty_float < min_qty do
            Logger.error("❌ Quantity too small for #{symbol}: #{formatted_qty} < min #{min_qty}")
            {:error, :quantity_too_small}
          else
            execute_futures_order_with_price(symbol, direction, qty_float, formatted_qty, leverage, order_type, mode, base_url, api_key, api_secret, current_price)
          end
          
        _ ->
          Logger.error("❌ Cannot get price for #{symbol} - skipping order")
          {:error, :no_price}
      end
    end
  end
  
  defp execute_futures_order_with_price(symbol, direction, qty_float, formatted_qty, leverage, order_type, mode, base_url, api_key, api_secret, current_price) do
    # Set leverage first
    set_leverage_for_symbol(symbol, leverage, base_url, api_key, api_secret)
    
    # Determine side based on direction
    side = if direction in [:long, :buy, "long", "buy", "BUY"], do: "BUY", else: "SELL"
    type = if order_type == :limit, do: "LIMIT", else: "MARKET"
    
    # Place order
    timestamp = System.system_time(:millisecond)
    
    # Base params
    params = %{
      "symbol" => symbol,
      "side" => side,
      "type" => type,
      "quantity" => formatted_qty,
      "timestamp" => timestamp
    }
    
    # Add timeInForce for LIMIT orders (required!)
    params = if type == "LIMIT" do
      params
      |> Map.put("timeInForce", "GTC")  # Good Till Cancelled
      |> Map.put("price", format_price(current_price, symbol))
    else
      params
    end
    
    Logger.debug("📤 Sending order: #{symbol} #{side} qty=#{formatted_qty} type=#{type} price=$#{Float.round(current_price, 2)}")
    
    query_string = URI.encode_query(params)
    signature = sign_request(query_string, api_secret)
    
    url = "#{base_url}/fapi/v1/order?#{query_string}&signature=#{signature}"
    
    headers = [
      {"X-MBX-APIKEY", api_key},
      {"Content-Type", "application/json"}
    ]
    
    case HTTPoison.post(url, "", headers, timeout: 15_000, recv_timeout: 15_000) do
      {:ok, %{status_code: 200, body: body}} ->
        order = Jason.decode!(body)
        
        # Parse executed values - ALWAYS use current_price as fallback for testnet
        raw_avg_price = order["avgPrice"]
        raw_exec_qty = order["executedQty"]
        
        executed_price = case parse_float(raw_avg_price) do
          nil -> current_price
          0.0 -> current_price  # Testnet often returns 0
          p when p > 0 -> p
          _ -> current_price
        end
        
        executed_qty = case parse_float(raw_exec_qty) do
          nil -> qty_float
          0.0 -> qty_float  # Testnet often returns 0
          q when q > 0 -> q
          _ -> qty_float
        end
        
        Logger.info("🔥 #{mode |> to_string |> String.upcase()} ORDER: #{side} #{symbol} @ $#{Float.round(executed_price, 2)} | Qty: #{Float.round(executed_qty, 4)} | ID: #{order["orderId"]}")
        
        {:ok, %{
          order_id: order["orderId"],
          executed_price: executed_price,
          executed_qty: executed_qty,
          status: parse_order_status(order["status"]),
          raw: order
        }}
      
      {:ok, %{status_code: code, body: body}} ->
        error = Jason.decode!(body)
        Logger.error("❌ Order failed [#{code}]: #{error["msg"]} (#{error["code"]}) - qty=#{formatted_qty}")
        {:error, %{code: error["code"], msg: error["msg"]}}
      
      {:error, reason} ->
        Logger.error("❌ HTTP error: #{inspect(reason)}")
        {:error, {:http_error, reason}}
    end
  end
  
  defp parse_order_status("FILLED"), do: :filled
  defp parse_order_status("NEW"), do: :new
  defp parse_order_status("PARTIALLY_FILLED"), do: :partial
  defp parse_order_status(_), do: :unknown
  
  # Minimum quantities for Binance Futures
  defp get_min_quantity("BTCUSDT"), do: 0.001
  defp get_min_quantity("ETHUSDT"), do: 0.001
  defp get_min_quantity("BNBUSDT"), do: 0.01
  defp get_min_quantity("SOLUSDT"), do: 1
  defp get_min_quantity("SUIUSDT"), do: 1
  defp get_min_quantity("XRPUSDT"), do: 1
  defp get_min_quantity("DOGEUSDT"), do: 1
  defp get_min_quantity("LTCUSDT"), do: 0.001
  defp get_min_quantity("AVAXUSDT"), do: 0.1
  defp get_min_quantity(_), do: 0.001  # Default

  defp execute_real_close_order(symbol, direction, quantity, mode) do
    # Validate quantity before closing
    if quantity <= 0 do
      Logger.error("❌ Cannot close #{symbol}: quantity is #{quantity}")
      {:error, :invalid_quantity}
    else
      # Close = opposite direction, always use MARKET for closes
      close_direction = if direction in [:long, :buy, "long", "buy"], do: :short, else: :long
      execute_real_futures_order(symbol, close_direction, quantity, 1, :market, mode)
    end
  end

  defp set_leverage_for_symbol(symbol, leverage, base_url, api_key, api_secret) do
    timestamp = System.system_time(:millisecond)
    
    params = %{
      "symbol" => symbol,
      "leverage" => leverage,
      "timestamp" => timestamp
    }
    
    query_string = URI.encode_query(params)
    signature = sign_request(query_string, api_secret)
    
    url = "#{base_url}/fapi/v1/leverage?#{query_string}&signature=#{signature}"
    
    headers = [{"X-MBX-APIKEY", api_key}]
    
    case HTTPoison.post(url, "", headers, timeout: 10_000, recv_timeout: 10_000) do
      {:ok, %{status_code: 200, body: body}} ->
        result = Jason.decode!(body)
        Logger.debug("⚙️ Leverage set: #{symbol} = #{result["leverage"]}x")
        :ok
      
      {:ok, %{status_code: _, body: _}} ->
        # Often fails if leverage already set - that's OK
        :ok
      
      {:error, _} ->
        :ok
    end
  end

  defp sign_request(query_string, secret) do
    :crypto.mac(:hmac, :sha256, secret, query_string)
    |> Base.encode16(case: :lower)
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # QUANTITY & PRICE PRECISION (Binance Futures requirements)
  # ═══════════════════════════════════════════════════════════════════════════════
  
  # Quantity precision (decimal places for quantity)
  @quantity_precision %{
    "BTCUSDT" => 3,
    "ETHUSDT" => 3,
    "BNBUSDT" => 2,
    "SOLUSDT" => 0,
    "SUIUSDT" => 0,
    "XRPUSDT" => 1,
    "DOGEUSDT" => 0,
    "ADAUSDT" => 0,
    "LTCUSDT" => 3,
    "AVAXUSDT" => 0,   # FIXED: Was 1, should be 0 (whole numbers)
    "DOTUSDT" => 1,
    "MATICUSDT" => 0,
    "LINKUSDT" => 2,
    "ATOMUSDT" => 2,
    "NEARUSDT" => 0,
    "APTUSDT" => 1,
    "ARBUSDT" => 0,
    "OPUSDT" => 0,
    "INJUSDT" => 1,
    "SEIUSDT" => 0,
    "TIAUSDT" => 1,
    "PEPEUSDT" => 0,
    "SHIBUSDT" => 0,
    "FLOKIUSDT" => 0,
    "WIFUSDT" => 0,
    "RUNEUSDT" => 0,
    "FETUSDT" => 0,
    "FILUSDT" => 1,
    "ICPUSDT" => 2,
    "AAVEUSDT" => 2,
    "MKRUSDT" => 3,
    "UNIUSDT" => 1
  }
  
  # Price precision (decimal places for price)
  @price_precision %{
    "BTCUSDT" => 1,
    "ETHUSDT" => 2,
    "BNBUSDT" => 2,
    "SOLUSDT" => 2,
    "SUIUSDT" => 4,      # Added
    "XRPUSDT" => 4,
    "DOGEUSDT" => 5,
    "ADAUSDT" => 4,
    "LTCUSDT" => 2,
    "AVAXUSDT" => 2,
    "DOTUSDT" => 3,
    "MATICUSDT" => 4,
    "LINKUSDT" => 3,
    "ATOMUSDT" => 3,
    "NEARUSDT" => 3,
    "APTUSDT" => 3,
    "ARBUSDT" => 4,
    "OPUSDT" => 4,
    "INJUSDT" => 3,
    "SEIUSDT" => 4,
    "TIAUSDT" => 3,
    "PEPEUSDT" => 7,
    "SHIBUSDT" => 8,
    "FLOKIUSDT" => 7,
    "WIFUSDT" => 4,
    "RUNEUSDT" => 3,
    "FETUSDT" => 4,
    "FILUSDT" => 3,
    "ICPUSDT" => 3,
    "AAVEUSDT" => 2,
    "MKRUSDT" => 1,
    "UNIUSDT" => 3
  }

  defp format_quantity(qty, symbol) do
    precision = Map.get(@quantity_precision, symbol, 3)  # Default to 3 decimals
    
    # Round to precision and format
    rounded = Float.round(qty * 1.0, precision)
    
    if precision == 0 do
      rounded |> trunc() |> Integer.to_string()
    else
      :erlang.float_to_binary(rounded, decimals: precision)
    end
  end
  
  defp format_price(price, symbol) do
    precision = Map.get(@price_precision, symbol, 2)  # Default to 2 decimals
    :erlang.float_to_binary(price * 1.0, decimals: precision)
  end

  defp parse_float(nil), do: nil
  defp parse_float(val) when is_float(val), do: val
  defp parse_float(val) when is_integer(val), do: val * 1.0
  defp parse_float(val) when is_binary(val) do
    case Float.parse(val) do
      {f, _} -> f
      :error -> nil
    end
  end

  defp get_price_fallback(symbol) do
    case get_current_price(symbol) do
      {:ok, price} -> price
      _ -> 0.0
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
    # Use appropriate endpoint based on execution mode
    url = case @execution_mode do
      :production -> "https://fapi.binance.com/fapi/v1/ticker/price?symbol=#{symbol}"
      :testnet -> "https://testnet.binancefuture.com/fapi/v1/ticker/price?symbol=#{symbol}"
      :simulation -> "https://testnet.binancefuture.com/fapi/v1/ticker/price?symbol=#{symbol}"
    end
    
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
    balance = case VirtualBalanceManager.get_balance("default") do
      {:ok, %{available: bal}} -> bal
      {:ok, %{total: bal}} -> bal
      _ -> 1000.0
    end
    # Ensure proper float (avoids scientific notation like 1.0e3)
    Float.round(balance * 1.0, 2)
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
    bot_id = get_bot_id()
    
    IO.puts("""
    
    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║  🌊 MARGIN SCALPER v16.7 HFT - BOT #{bot_id} ($200/hr MULTI-BOT TARGET)           ║
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