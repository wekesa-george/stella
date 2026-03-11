defmodule TradeEngine.API.TradingControl do
  @moduledoc """
  🎯 TRADING CONTROL CENTER

  Handles the complete trading lifecycle:
  1. Launch — set up balance, create bot, start trading in ONE call
  2. Live Signals — real-time signals with entry/exit/target analysis
  3. Execute — manually trigger a trade from a signal
  4. Monitor — active trades with PnL, time remaining, exit targets
  5. Close — capture profit or cut losses on specific positions
  """

  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Orchestrator.SignalTrader
  alias TradeEngine.Strategy.CandleBridge
  alias TradeEngine.Risk.{VirtualBalanceManager, CapitalAllocator, AssetTierManager}
  alias TradeEngine.Bots.BotRegistry

  # ============================================================================
  # 1. LAUNCH TRADING — One-call setup
  # ============================================================================

  @doc """
  Full trading setup in one call.

  ## Example
      TradingControl.launch("user_id", %{
        balance: 5000,
        bot_name: "My Scalper",
        strategy: "impulse_scalper",
        exchange: "binance_testnet"
      })

  Steps performed:
  1. Set virtual balance
  2. Configure capital allocation
  3. Create bot (if name provided)
  4. Start SignalTrader
  """
  def launch(user_id, opts \\ %{}) do
    balance = Map.get(opts, :balance, 5000.0)
    total_capital = Map.get(opts, :total_capital, balance)
    bot_name = Map.get(opts, :bot_name, "Default Scalper")
    strategy = Map.get(opts, :strategy, "impulse_scalper")
    exchange = Map.get(opts, :exchange, "binance_testnet")

    results = %{steps: [], errors: []}

    # Step 1: Set virtual balance
    results = case VirtualBalanceManager.set_balance(user_id, balance) do
      {:ok, _} ->
        Logger.info("✅ Balance set: $#{balance} for #{user_id}")
        add_step(results, :balance, :ok, "Set virtual balance to $#{balance}")
      error ->
        add_step(results, :balance, :error, "Failed: #{inspect(error)}")
    end

    # Step 2: Configure capital allocation
    results = case CapitalAllocator.configure(user_id, %{
      total_capital: total_capital,
      active_capital: balance,
      scaling_mode: :manual
    }) do
      {:ok, _} ->
        add_step(results, :capital, :ok, "Capital configured: $#{balance} active of $#{total_capital}")
      error ->
        add_step(results, :capital, :error, "Failed: #{inspect(error)}")
    end

    # Step 3: Create bot (best-effort)
    results = try do
      case BotRegistry.register_bot(user_id, %{
        name: bot_name,
        strategy_type: strategy,
        exchange: exchange,
        trading_pairs: get_default_pairs(balance),
        allocated_capital: balance,
        active_capital: balance
      }) do
        {:ok, bot} ->
          BotRegistry.start_bot(bot.id)
          add_step(results, :bot, :ok, "Bot '#{bot_name}' created and started (#{bot.id})")
        {:error, _} ->
          add_step(results, :bot, :skipped, "Bot creation skipped (may already exist)")
      end
    rescue
      _ -> add_step(results, :bot, :skipped, "Bot registry not available")
    end

    # Step 4: Start trading
    SignalTrader.start_trading()
    results = add_step(results, :trading, :ok, "SignalTrader ACTIVE — processing signals now")

    status = if Enum.any?(results.errors), do: :partial, else: :ready
    {:ok, Map.merge(results, %{status: status, user_id: user_id, balance: balance, timestamp: DateTime.utc_now()})}
  end

  @doc "Quick launch with defaults — $5K balance, start immediately"
  def quick_start(user_id) do
    launch(user_id, %{balance: 5000.0, total_capital: 50_000.0})
  end

  @doc "Stop trading completely"
  def shutdown do
    SignalTrader.stop_trading()
    {:ok, %{status: :stopped, timestamp: DateTime.utc_now()}}
  end

  @doc "Emergency: close ALL positions (SignalTrader + BotRegistry bots), cancel pending orders, stop everything"
  def emergency_stop do
    Logger.error("EMERGENCY STOP triggered — closing all positions and stopping all bots")

    # 1. Close SignalTrader positions (legacy orchestrator)
    signal_result = try do
      SignalTrader.close_all_positions()
    rescue
      _ -> {:error, :signal_trader_unavailable}
    end

    # 2. Stop all BotRegistry bots and close their DB positions
    bot_results = try do
      bots = BotRegistry.list_bots()
      running = Enum.filter(bots, fn b -> Map.get(b, :status) in ["running", "paused"] end)

      Enum.map(running, fn bot ->
        bot_id = Map.get(bot, :bot_id) || bot.id
        # Stop bot (triggers terminate/2 which tries to close positions)
        try do
          BotRegistry.stop_bot(bot_id)
        rescue
          _ -> :ok
        end
        bot_id
      end)
    rescue
      _ -> []
    end

    # 3. Force-close all open positions in DB via exchange
    db_closed = try do
      import Ecto.Query
      open_positions = Repo.all(
        from(p in TradeEngine.Trading.Position,
          where: p.status == "open",
          select: %{
            id: p.id,
            bot_id: p.bot_id,
            credential_id: p.credential_id,
            symbol: p.symbol,
            side: p.position_type,
            quantity: p.quantity,
            entry_price: p.entry_price
          },
          limit: 100
        ),
        timeout: 10_000
      )

      Enum.map(open_positions, fn pos ->
        if pos.credential_id do
          qty = decimal_to_float(pos.quantity)
          entry = decimal_to_float(pos.entry_price)

          close_result = case pos.side do
            side when side in ["long", "buy"] ->
              TradeEngine.Exchanges.Executor.close_long(pos.credential_id, pos.symbol, qty, entry, [])
            side when side in ["short", "sell"] ->
              TradeEngine.Exchanges.Executor.close_short(pos.credential_id, pos.symbol, qty, entry, [])
            _ ->
              TradeEngine.Exchanges.Executor.close_long(pos.credential_id, pos.symbol, qty, entry, [])
          end

          # Mark position as closed in DB regardless
          now = NaiveDateTime.utc_now()
          Repo.query(
            "UPDATE trading.positions SET status = 'closed', exit_reason = 'emergency_stop', closed_at = $1, updated_at = $1 WHERE id = $2 AND status = 'open'",
            [now, pos.id],
            timeout: 5_000
          )

          %{position_id: pos.id, symbol: pos.symbol, exchange_result: inspect(close_result)}
        else
          Repo.query(
            "UPDATE trading.positions SET status = 'closed', exit_reason = 'emergency_stop_no_cred', closed_at = $1, updated_at = $1 WHERE id = $2 AND status = 'open'",
            [NaiveDateTime.utc_now(), pos.id],
            timeout: 5_000
          )
          %{position_id: pos.id, symbol: pos.symbol, exchange_result: "no_credential"}
        end
      end)
    rescue
      e ->
        Logger.error("Emergency stop DB close error: #{Exception.message(e)}")
        []
    end

    # 4. Stop SignalTrader
    try do
      SignalTrader.stop_trading()
    rescue
      _ -> :ok
    end

    # 5. Broadcast emergency alert
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "alerts:new", {:new_alert, %{
      id: Ecto.UUID.generate(),
      alert_type: "kill_switch",
      category: "risk",
      severity: "critical",
      title: "Emergency Stop Executed",
      message: "All bots stopped, #{length(db_closed)} positions force-closed",
      metadata: %{bots_stopped: length(bot_results), positions_closed: length(db_closed)},
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    }})

    {:ok, %{
      status: :emergency_stopped,
      signal_trader: signal_result,
      bots_stopped: length(bot_results),
      positions_closed: length(db_closed),
      position_details: db_closed,
      timestamp: DateTime.utc_now()
    }}
  end

  defp decimal_to_float(nil), do: 0.0
  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(n) when is_number(n), do: n * 1.0
  defp decimal_to_float(_), do: 0.0

  # ============================================================================
  # 2. LIVE SIGNALS — Entry/Exit Points
  # ============================================================================

  @doc """
  Get all current signals with full entry/exit analysis.

  Returns per signal:
  - symbol, direction, confidence
  - entry_price (current price = entry point)
  - exit_target (P1 — impulse target, where to take profit)
  - stop_loss (φ-based protective stop)
  - expected_profit_pct
  - time_horizon (how long the impulse should take)
  - physics breakdown (momentum, gravity, energy state)
  - predictions (5m, 15m, 30m, 60m)
  - tradeable? (meets all criteria for execution)
  """
  def get_live_signals do
    signals = CandleBridge.get_signals()

    enriched = signals
    |> Enum.map(fn {symbol, signal} ->
      entry = safe_float(signal.entry_price)
      peak = safe_float(signal.peak_price)
      stop = safe_float(signal.stop_loss)
      take_profit = safe_float(signal.take_profit)

      # Calculate exit target (P1) based on direction
      exit_target = case signal.direction do
        :long -> max(peak, take_profit)
        :short -> if peak > 0 and peak < entry, do: peak, else: take_profit
        _ -> take_profit
      end

      # Expected profit
      impulse_size = abs(exit_target - entry)
      impulse_pct = if entry > 0, do: impulse_size / entry * 100, else: 0

      # Risk/reward
      risk = abs(entry - stop)
      reward = impulse_size
      rr_ratio = if risk > 0, do: Float.round(reward / risk, 2), else: 0

      # Is this tradeable?
      tradeable = signal.confidence >= 55 and
                  impulse_pct >= 0.1 and
                  direction_aligned?(signal.direction, entry, exit_target)

      # Position size for $0.50 target profit
      qty_for_target = if impulse_size > 0, do: 0.50 / impulse_size, else: 0
      position_value = qty_for_target * entry

      {symbol, %{
        symbol: symbol,
        direction: to_string(signal.direction),
        confidence: signal.confidence,

        # 🎯 ENTRY/EXIT POINTS
        entry_price: Float.round(entry, 6),
        exit_target: Float.round(exit_target, 6),
        stop_loss: Float.round(stop, 6),
        take_profit: Float.round(take_profit, 6),

        # 📊 ANALYSIS
        impulse_size: Float.round(impulse_size, 6),
        impulse_pct: Float.round(impulse_pct, 3),
        risk_reward_ratio: rr_ratio,
        expected_profit_pct: Float.round(impulse_pct, 2),

        # 💰 SIZING (for $0.50 target)
        recommended_qty: Float.round(qty_for_target, 6),
        recommended_value: Float.round(position_value, 2),

        # ⏱️ TIME
        peak_time_minutes: safe_float(signal.peak_time),
        time_horizon: "#{round(safe_float(signal.peak_time))}m",

        # 🔬 PHYSICS
        momentum: safe_float(signal.momentum),
        gravity: safe_float(signal.gravity),
        kinetic_energy: safe_float(signal.kinetic_energy),
        energy_state: to_string(signal.energy_state || :unknown),
        balance_point: safe_float(Map.get(signal, :balance_point, 0)),

        # 📈 PREDICTIONS
        predictions: %{
          "5m" => safe_float(Map.get(signal, :target_5m)),
          "15m" => safe_float(Map.get(signal, :target_15m)),
          "30m" => safe_float(Map.get(signal, :target_30m)),
          "60m" => safe_float(Map.get(signal, :target_60m))
        },

        # ✅ TRADEABLE?
        tradeable: tradeable,
        trade_grade: trade_grade(signal.confidence, impulse_pct, rr_ratio),

        timestamp: signal.timestamp
      }}
    end)
    |> Enum.sort_by(fn {_, s} -> {!s.tradeable, -s.confidence} end)
    |> Map.new()

    summary = %{
      total_signals: map_size(enriched),
      tradeable: Enum.count(enriched, fn {_, s} -> s.tradeable end),
      best_long: enriched |> Enum.filter(fn {_, s} -> s.direction == "long" and s.tradeable end) |> Enum.max_by(fn {_, s} -> s.confidence end, fn -> nil end) |> then(fn nil -> nil; {sym, _} -> sym end),
      best_short: enriched |> Enum.filter(fn {_, s} -> s.direction == "short" and s.tradeable end) |> Enum.max_by(fn {_, s} -> s.confidence end, fn -> nil end) |> then(fn nil -> nil; {sym, _} -> sym end),
      timestamp: DateTime.utc_now()
    }

    {:ok, %{signals: enriched, summary: summary}}
  end

  @doc "Get detailed signal for a specific symbol"
  def get_signal_detail(symbol) do
    symbol = String.upcase(symbol)
    case CandleBridge.get_signal(symbol) do
      nil -> {:error, :no_signal}
      signal ->
        {:ok, signals} = get_live_signals()
        case Map.get(signals.signals, symbol) do
          nil -> {:error, :not_enriched}
          enriched -> {:ok, enriched}
        end
    end
  end

  @doc "Analyze a symbol fresh (force re-analysis)"
  def analyze_fresh(symbol) do
    symbol = String.upcase(symbol)
    case CandleBridge.analyze_now(symbol) do
      {:ok, signal} ->
        # Return enriched version
        get_signal_detail(symbol)
      error -> error
    end
  end

  # ============================================================================
  # 3. ACTIVE TRADES — Monitor open positions
  # ============================================================================

  @doc """
  Get all active trades with real-time monitoring data.

  Returns per trade:
  - entry/current/target prices
  - unrealized PnL ($ and %)
  - time remaining before forced exit
  - distance to target and stop loss
  - exit recommendation
  """
  def get_active_trades do
    positions = SignalTrader.get_open_positions()
    stats = SignalTrader.get_stats()
    now = DateTime.utc_now()

    enriched = Enum.map(positions, fn pos ->
      entry = pos.entry_price
      current = pos.current_price || entry
      target = pos.impulse_target || entry
      stop = pos.stop_loss || entry
      qty = pos.quantity

      # PnL calculation
      pnl = case pos.direction do
        :long -> (current - entry) * qty
        :short -> (entry - current) * qty
        _ -> 0.0
      end
      pnl_pct = if entry > 0 and qty > 0, do: pnl / (entry * qty) * 100, else: 0.0

      # Distance to target/stop
      {dist_to_target, dist_to_stop} = case pos.direction do
        :long -> {target - current, current - stop}
        :short -> {current - target, stop - current}
        _ -> {0, 0}
      end
      progress_pct = if abs(target - entry) > 0, do: abs(current - entry) / abs(target - entry) * 100, else: 0

      # Time analysis
      target_exit = pos.target_exit_time
      seconds_remaining = if target_exit, do: max(DateTime.diff(target_exit, now), 0), else: 0
      age_seconds = if pos.opened_at, do: DateTime.diff(now, pos.opened_at), else: 0
      time_expired = seconds_remaining <= 0

      # Exit recommendation
      recommendation = cond do
        dist_to_target <= 0 -> "🎯 TARGET HIT — Close for profit!"
        dist_to_stop <= 0 -> "🛑 STOP HIT — Close to limit loss!"
        time_expired -> "⏰ TIME UP — Close now"
        progress_pct > 70 -> "📈 Almost there (#{Float.round(progress_pct, 0)}%) — let it run"
        pnl > 0 -> "✅ In profit — monitor closely"
        true -> "⏳ Waiting for impulse..."
      end

      %{
        position_id: pos.id,
        symbol: pos.symbol,
        direction: to_string(pos.direction),

        # Prices
        entry_price: Float.round(entry, 6),
        current_price: Float.round(current, 6),
        exit_target: Float.round(target, 6),
        stop_loss: Float.round(stop, 6),

        # P&L
        unrealized_pnl: Float.round(pnl, 4),
        unrealized_pnl_pct: Float.round(pnl_pct, 2),
        quantity: Float.round(qty, 6),
        position_value: Float.round(current * qty, 2),

        # Progress
        distance_to_target: Float.round(dist_to_target, 6),
        distance_to_stop: Float.round(dist_to_stop, 6),
        progress_to_target_pct: Float.round(progress_pct, 1),

        # Time
        age_seconds: age_seconds,
        age_formatted: format_duration(age_seconds),
        seconds_remaining: seconds_remaining,
        time_remaining: format_duration(seconds_remaining),
        time_expired: time_expired,

        # Meta
        confidence: pos.confidence,
        exchange_order_id: pos.exchange_order_id,
        user_id: pos.user_id,
        opened_at: pos.opened_at,
        target_exit_time: pos.target_exit_time,

        # Recommendation
        recommendation: recommendation,
        should_close: dist_to_target <= 0 or dist_to_stop <= 0 or time_expired
      }
    end)

    summary = %{
      total_positions: length(enriched),
      total_pnl: enriched |> Enum.map(& &1.unrealized_pnl) |> Enum.sum() |> Float.round(4),
      profitable: Enum.count(enriched, & &1.unrealized_pnl > 0),
      losing: Enum.count(enriched, & &1.unrealized_pnl < 0),
      should_close: Enum.count(enriched, & &1.should_close),
      trading_active: stats[:status] == "ACTIVE",
      total_trades_today: stats[:total_trades] || 0,
      realized_pnl: stats[:realized_pnl] || 0.0,
      win_rate: stats[:win_rate] || 0.0
    }

    {:ok, %{trades: enriched, summary: summary, stats: stats}}
  end

  # ============================================================================
  # 4. POSITION MANAGEMENT — Close/Modify
  # ============================================================================

  @doc """
  Close a specific position by ID.
  Can optionally specify reason: :take_profit, :stop_loss, :manual
  """
  def close_position(position_id, reason \\ :manual) do
    # SignalTrader doesn't expose individual close, so we use close_all
    # and filter. For now, use the Trading context directly.
    case get_position_from_state(position_id) do
      nil ->
        # Try DB
        close_position_db(position_id, reason)
      _pos ->
        # Position is in SignalTrader's state — need to close via GenServer
        # For now, use close_all as the mechanism
        {:error, :use_close_all_for_live_positions}
    end
  end

  @doc "Close all positions and capture profits"
  def close_all_and_capture do
    # Get current positions for reporting
    positions = SignalTrader.get_open_positions()

    pre_stats = Enum.map(positions, fn pos ->
      current = pos.current_price || pos.entry_price
      pnl = case pos.direction do
        :long -> (current - pos.entry_price) * pos.quantity
        :short -> (pos.entry_price - current) * pos.quantity
        _ -> 0.0
      end
      %{symbol: pos.symbol, direction: pos.direction, pnl: Float.round(pnl, 4)}
    end)

    # Execute close all
    result = SignalTrader.close_all_positions()

    total_pnl = pre_stats |> Enum.map(& &1.pnl) |> Enum.sum()

    {:ok, %{
      positions_closed: length(pre_stats),
      position_details: pre_stats,
      total_pnl: Float.round(total_pnl, 4),
      result: result,
      timestamp: DateTime.utc_now()
    }}
  end

  # ============================================================================
  # 5. TRADING STATUS — Overview
  # ============================================================================

  @doc "Complete trading status in one call"
  def get_status do
    stats = safe_call(fn -> SignalTrader.get_stats() end, %{})
    {:ok, signals} = get_live_signals()
    {:ok, trades} = get_active_trades()

    {:ok, %{
      engine: %{
        active: stats[:status] == "ACTIVE",
        uptime_seconds: stats[:uptime] || 0,
        uptime: format_duration(stats[:uptime] || 0)
      },
      trading: %{
        total_trades: stats[:total_trades] || 0,
        winning: stats[:winning_trades] || 0,
        losing: stats[:losing_trades] || 0,
        win_rate: stats[:win_rate] || 0.0,
        realized_pnl: stats[:realized_pnl] || 0.0,
        unrealized_pnl: stats[:unrealized_pnl] || 0.0,
        total_pnl: stats[:total_pnl] || 0.0,
        dollar_targets_hit: stats[:dollar_targets_hit] || 0
      },
      positions: trades.summary,
      signals: signals.summary,
      timestamp: DateTime.utc_now()
    }}
  end

  # ============================================================================
  # PRIVATE HELPERS
  # ============================================================================

  defp get_position_from_state(position_id) do
    SignalTrader.get_open_positions()
    |> Enum.find(& &1.id == position_id)
  end

  defp close_position_db(position_id, reason) do
    try do
      case Repo.get(TradeEngine.Trading.Position, position_id) do
        nil -> {:error, :not_found}
        pos ->
          pos
          |> Ecto.Changeset.change(%{
            status: "closed",
            exit_time: NaiveDateTime.utc_now(),
            exit_reason: to_string(reason)
          })
          |> Repo.update()
      end
    rescue
      e -> {:error, Exception.message(e)}
    end
  end

  defp direction_aligned?(:long, entry, target), do: target > entry
  defp direction_aligned?(:short, entry, target), do: target < entry
  defp direction_aligned?(_, _, _), do: false

  defp trade_grade(confidence, impulse_pct, rr_ratio) do
    score = confidence * 0.4 + impulse_pct * 20 + rr_ratio * 10
    cond do
      score >= 60 -> "A"
      score >= 45 -> "B"
      score >= 30 -> "C"
      true -> "D"
    end
  end

  defp get_default_pairs(balance) when balance >= 1000 do
    ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "LTCUSDT",
     "XRPUSDT", "ADAUSDT", "DOTUSDT", "AVAXUSDT", "LINKUSDT",
     "UNIUSDT", "ATOMUSDT", "NEARUSDT", "SUIUSDT", "INJUSDT"]
  end
  defp get_default_pairs(_) do
    ["DOGEUSDT", "ADAUSDT", "XRPUSDT", "DOTUSDT", "ATOMUSDT",
     "NEARUSDT", "OPUSDT", "ARBUSDT", "SUIUSDT", "APTUSDT"]
  end

  defp add_step(results, step, status, message) do
    entry = %{step: step, status: status, message: message}
    case status do
      :error -> %{results | steps: results.steps ++ [entry], errors: results.errors ++ [entry]}
      _ -> %{results | steps: results.steps ++ [entry]}
    end
  end

  defp safe_float(nil), do: 0.0
  defp safe_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp safe_float(n) when is_number(n), do: n + 0.0
  defp safe_float(_), do: 0.0

  defp safe_call(func, default) do
    try do func.()
    rescue _ -> default
    catch :exit, _ -> default end
  end

  defp format_duration(nil), do: "0s"
  defp format_duration(s) when is_integer(s) and s >= 0 do
    m = div(s, 60)
    sec = rem(s, 60)
    cond do
      m >= 60 -> "#{div(m, 60)}h #{rem(m, 60)}m"
      m > 0 -> "#{m}m #{sec}s"
      true -> "#{sec}s"
    end
  end
  defp format_duration(s) when is_float(s), do: format_duration(round(s))
  defp format_duration(_), do: "0s"
end
