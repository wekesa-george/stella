defmodule TradeEngine.Analytics.PhysicsBacktest do
  @moduledoc """
  Physics-Finance Backtest Engine

  Faithful replica of the live PhysicsImpulse strategy for backtesting.
  Uses the same SignalGenerator, same entry/exit logic, same position sizing.

  ## Usage from IEx

      # Load candles from DB and run
      TradeEngine.Analytics.PhysicsBacktest.run("ETHUSDT", months: 6)

      # Run with custom config
      TradeEngine.Analytics.PhysicsBacktest.run("ETHUSDT",
        months: 3,
        config: %{"max_positions" => 1, "min_confidence_long" => 60}
      )

      # Run on raw candles directly
      TradeEngine.Analytics.PhysicsBacktest.backtest("ETHUSDT", candles, config)
  """

  require Logger

  alias TradeEngine.Physics.SignalGenerator
  alias TradeEngine.Repo

  @default_config %{
    "target_profit_usd" => 0.50,
    "min_impulse_pct" => 0.001,
    "max_hold_minutes" => 5,
    "golden_ratio" => 0.618,
    "min_notional" => 10.0,
    "min_trade_value" => 12.0,
    "min_confidence_long" => 55,
    "min_confidence_short" => 60,
    "max_positions" => 3,
    "max_position_pct" => 0.15
  }

  @initial_balance 10_000.0
  @fee_rate 0.001  # 0.1% per side (Binance taker fee)
  @lookback 20     # Candles for signal generation

  # ========================================================================
  # PUBLIC API
  # ========================================================================

  @doc """
  Load candles from DB and run backtest.
  Options: months (default 6), config (override defaults), timeframe (default "5m")
  """
  def run(symbol, opts \\ []) do
    months = Keyword.get(opts, :months, 6)
    timeframe = Keyword.get(opts, :timeframe, "5m")
    user_config = Keyword.get(opts, :config, %{})
    config = Map.merge(@default_config, user_config)

    Logger.info("Loading #{timeframe} candles for #{symbol} (#{months} months)...")

    case load_candles(symbol, timeframe, months) do
      {:ok, candles} ->
        Logger.info("Loaded #{length(candles)} candles. Running backtest...")
        result = backtest(symbol, candles, config)
        print_report(result)
        {:ok, result}

      {:error, reason} ->
        Logger.error("Failed to load candles: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Run backtest on provided candles with given config.
  """
  def backtest(symbol, candles, config \\ @default_config) when is_list(candles) do
    if length(candles) < @lookback do
      {:error, :insufficient_candles}
    else
      config = Map.merge(@default_config, config)
      do_backtest(symbol, candles, config)
    end
  end

  # ========================================================================
  # CORE BACKTEST LOOP
  # ========================================================================

  defp do_backtest(symbol, candles, config) do
    state = %{
      symbol: symbol,
      config: config,
      balance: @initial_balance,
      positions: %{},           # position_id => position
      closed_trades: [],
      balance_history: [@initial_balance],
      candle_index: 0,
      total_signals: 0,
      entries_attempted: 0,
      entries_rejected: 0
    }

    # Process each candle with a proper sliding window
    final_state =
      candles
      |> Enum.with_index()
      |> Enum.reduce(state, fn {_candle, idx}, acc ->
        if idx < @lookback - 1 do
          # Not enough history yet
          acc
        else
          window = Enum.slice(candles, (idx - @lookback + 1)..idx)
          current_candle = Enum.at(candles, idx)
          process_candle(window, current_candle, idx, acc)
        end
      end)

    # Force-close any remaining open positions at last candle price
    last_candle = List.last(candles)
    last_price = decimal_to_float(last_candle.close)

    final_state =
      Enum.reduce(Map.keys(final_state.positions), final_state, fn pos_id, acc ->
        close_position(acc, pos_id, last_price, last_candle.timestamp, :end_of_backtest)
      end)

    # Calculate metrics
    trades = Enum.reverse(final_state.closed_trades)
    metrics = calculate_metrics(trades, final_state.balance_history)

    %{
      symbol: symbol,
      config: config,
      initial_balance: @initial_balance,
      final_balance: final_state.balance,
      total_return_pct: (final_state.balance - @initial_balance) / @initial_balance * 100,
      total_candles: length(candles),
      total_signals: final_state.total_signals,
      entries_attempted: final_state.entries_attempted,
      entries_rejected: final_state.entries_rejected,
      trades: trades,
      metrics: metrics,
      balance_history: Enum.reverse(final_state.balance_history)
    }
  end

  defp process_candle(window, current_candle, candle_idx, state) do
    current_price = decimal_to_float(current_candle.close)
    current_time = current_candle.timestamp

    # 1. Check exits first (like the live bot's :check_exits timer)
    state = check_exits(state, current_price, current_time)

    # 2. Generate signal from the window
    case SignalGenerator.generate_signal(window, nil, state.symbol) do
      {:ok, signal} ->
        state = %{state | total_signals: state.total_signals + 1}

        # 3. Check entry (replicates PhysicsImpulse.should_enter?)
        if should_enter?(signal, state) do
          state = %{state | entries_attempted: state.entries_attempted + 1}
          attempt_entry(signal, current_price, current_time, candle_idx, state)
        else
          state
        end

      {:error, _} ->
        state
    end
  end

  # ========================================================================
  # ENTRY LOGIC (mirrors PhysicsImpulse.should_enter? + execute_trade)
  # ========================================================================

  defp should_enter?(signal, state) do
    config = state.config
    min_conf_long = config["min_confidence_long"]
    min_conf_short = config["min_confidence_short"]
    max_positions = config["max_positions"]

    count = map_size(state.positions)
    has_symbol = Enum.any?(Map.values(state.positions), &(&1.symbol == signal.symbol))

    confidence_ok = case signal.direction do
      :long -> signal.confidence >= min_conf_long
      :short -> signal.confidence >= min_conf_short
      _ -> false
    end

    impulse_ok = has_tradeable_impulse?(signal, config)
    position_ok = count < max_positions and not has_symbol

    confidence_ok and impulse_ok and position_ok
  end

  defp attempt_entry(signal, current_price, current_time, candle_idx, state) do
    config = state.config
    entry_price = current_price

    # Position sizing (mirrors PhysicsImpulse.calculate_position_size)
    impulse_target = get_impulse_target(signal)
    impulse_size = if impulse_target, do: abs(impulse_target - entry_price), else: 0

    if impulse_size <= 0 do
      %{state | entries_rejected: state.entries_rejected + 1}
    else
      target_profit = config["target_profit_usd"]
      max_pct = config["max_position_pct"]
      min_trade = config["min_trade_value"]

      ideal_qty = target_profit / impulse_size
      ideal_value = ideal_qty * entry_price
      max_value = state.balance * max_pct
      position_value = ideal_value |> min(max_value) |> max(min_trade)
      quantity = position_value / entry_price

      # Entry fee
      entry_fee = position_value * @fee_rate

      if position_value + entry_fee > state.balance do
        %{state | entries_rejected: state.entries_rejected + 1}
      else
        # Stop loss (mirrors PhysicsImpulse.calculate_stop_loss)
        golden = config["golden_ratio"]
        stop_loss = case signal.direction do
          :long -> entry_price - (impulse_size * golden)
          :short -> entry_price + (impulse_size * golden)
          _ -> entry_price
        end

        # Max hold time
        max_hold = config["max_hold_minutes"]
        exit_deadline = DateTime.add(current_time, max_hold * 60, :second)

        pos_id = "pos_#{candle_idx}_#{:rand.uniform(10000)}"

        position = %{
          id: pos_id,
          symbol: state.symbol,
          direction: signal.direction,
          entry_price: entry_price,
          quantity: quantity,
          position_value: position_value,
          impulse_target: impulse_target,
          stop_loss: stop_loss,
          entry_time: current_time,
          exit_deadline: exit_deadline,
          confidence: signal.confidence,
          entry_fee: entry_fee,
          physics: signal.physics
        }

        %{state |
          positions: Map.put(state.positions, pos_id, position),
          balance: state.balance - entry_fee
        }
      end
    end
  end

  # ========================================================================
  # EXIT LOGIC (mirrors PhysicsImpulse.should_exit? + PositionCloseManager)
  # ========================================================================

  defp check_exits(state, current_price, current_time) do
    Enum.reduce(Map.keys(state.positions), state, fn pos_id, acc ->
      pos = acc.positions[pos_id]
      if pos do
        check_position_exit(acc, pos_id, pos, current_price, current_time)
      else
        acc
      end
    end)
  end

  defp check_position_exit(state, pos_id, pos, current_price, current_time) do
    {hit_target, hit_stop} = case pos.direction do
      :long ->
        {current_price >= pos.impulse_target, current_price <= pos.stop_loss}
      :short ->
        {current_price <= pos.impulse_target, current_price >= pos.stop_loss}
      _ ->
        {false, false}
    end

    time_expired = DateTime.compare(current_time, pos.exit_deadline) in [:gt, :eq]

    cond do
      hit_target -> close_position(state, pos_id, current_price, current_time, :take_profit)
      hit_stop -> close_position(state, pos_id, current_price, current_time, :stop_loss)
      time_expired -> close_position(state, pos_id, current_price, current_time, :time_exit)
      true -> state
    end
  end

  defp close_position(state, pos_id, exit_price, exit_time, reason) do
    pos = state.positions[pos_id]
    unless pos do
      state
    else
      # P&L calculation
      raw_pnl = case pos.direction do
        :long -> (exit_price - pos.entry_price) * pos.quantity
        :short -> (pos.entry_price - exit_price) * pos.quantity
        _ -> 0.0
      end

      exit_fee = abs(pos.quantity * exit_price) * @fee_rate
      net_pnl = raw_pnl - exit_fee  # entry_fee already deducted at entry
      new_balance = state.balance + pos.position_value + net_pnl

      trade = %{
        id: pos.id,
        symbol: pos.symbol,
        direction: pos.direction,
        entry_price: pos.entry_price,
        exit_price: exit_price,
        quantity: pos.quantity,
        position_value: pos.position_value,
        impulse_target: pos.impulse_target,
        stop_loss: pos.stop_loss,
        confidence: pos.confidence,
        raw_pnl: raw_pnl,
        entry_fee: pos.entry_fee,
        exit_fee: exit_fee,
        net_pnl: net_pnl,
        pnl_pct: raw_pnl / pos.position_value * 100,
        entry_time: pos.entry_time,
        exit_time: exit_time,
        duration_minutes: DateTime.diff(exit_time, pos.entry_time, :second) / 60,
        reason: reason,
        physics: pos.physics
      }

      %{state |
        positions: Map.delete(state.positions, pos_id),
        closed_trades: [trade | state.closed_trades],
        balance: new_balance,
        balance_history: [new_balance | state.balance_history]
      }
    end
  end

  # ========================================================================
  # HELPERS (mirrors PhysicsImpulse internals)
  # ========================================================================

  defp has_tradeable_impulse?(signal, config) do
    entry = decimal_to_float(signal.entry_price)
    target = get_impulse_target(signal)
    min_pct = config["min_impulse_pct"]

    if entry && target && entry > 0 do
      impulse_pct = abs(target - entry) / entry
      impulse_pct >= min_pct and direction_aligned?(signal.direction, entry, target)
    else
      false
    end
  end

  defp direction_aligned?(:long, entry, target), do: target > entry
  defp direction_aligned?(:short, entry, target), do: target < entry
  defp direction_aligned?(_, _, _), do: false

  defp get_impulse_target(signal) do
    physics_target = if signal[:physics] do
      case signal.direction do
        :long -> signal.physics[:peak_price] || signal.physics[:predicted_price]
        :short -> signal.physics[:trough_price] || signal.physics[:peak_price] || signal.physics[:predicted_price]
        _ -> signal.physics[:peak_price] || signal.physics[:predicted_price]
      end
    end

    cond do
      physics_target -> to_float(physics_target)
      signal[:take_profit] -> to_float(signal[:take_profit])
      signal[:target_price] -> to_float(signal[:target_price])
      true -> nil
    end
  end

  # ========================================================================
  # METRICS CALCULATION
  # ========================================================================

  defp calculate_metrics(trades, balance_history) do
    n = length(trades)

    if n == 0 do
      empty_metrics()
    else
      winning = Enum.filter(trades, &(&1.net_pnl > 0))
      losing = Enum.filter(trades, &(&1.net_pnl <= 0))
      win_count = length(winning)
      loss_count = length(losing)
      win_rate = win_count / n * 100

      total_pnl = Enum.reduce(trades, 0.0, &(&1.net_pnl + &2))
      avg_pnl = total_pnl / n
      total_fees = Enum.reduce(trades, 0.0, fn t, acc -> acc + t.entry_fee + t.exit_fee end)

      gross_profit = Enum.reduce(winning, 0.0, &(&1.net_pnl + &2))
      gross_loss = Enum.reduce(losing, 0.0, fn t, acc -> acc + abs(t.net_pnl) end)
      profit_factor = if gross_loss > 0, do: gross_profit / gross_loss, else: 999.0

      avg_win = if win_count > 0, do: gross_profit / win_count, else: 0.0
      avg_loss = if loss_count > 0, do: gross_loss / loss_count, else: 0.0

      # Sharpe ratio (per-trade)
      pnl_values = Enum.map(trades, & &1.net_pnl)
      mean_pnl = Enum.sum(pnl_values) / n
      variance = Enum.reduce(pnl_values, 0.0, fn x, acc -> acc + (x - mean_pnl) ** 2 end) / n
      std_dev = :math.sqrt(max(variance, 0.0))
      sharpe = if std_dev > 0, do: mean_pnl / std_dev, else: 0.0

      # Max drawdown from balance history
      max_drawdown = calculate_max_drawdown(balance_history)

      # Duration stats
      durations = Enum.map(trades, & &1.duration_minutes)
      avg_duration = Enum.sum(durations) / n

      # Exit reason breakdown
      exit_reasons = Enum.frequencies_by(trades, & &1.reason)

      # Best/worst
      best = Enum.max_by(trades, & &1.net_pnl)
      worst = Enum.min_by(trades, & &1.net_pnl)

      # Long vs short breakdown
      long_trades = Enum.filter(trades, &(&1.direction == :long))
      short_trades = Enum.filter(trades, &(&1.direction == :short))
      long_wins = Enum.count(long_trades, &(&1.net_pnl > 0))
      short_wins = Enum.count(short_trades, &(&1.net_pnl > 0))

      %{
        total_trades: n,
        winning_trades: win_count,
        losing_trades: loss_count,
        win_rate: r(win_rate),
        total_pnl: r(total_pnl),
        total_fees: r(total_fees),
        average_pnl: r(avg_pnl),
        avg_win: r(avg_win),
        avg_loss: r(avg_loss),
        gross_profit: r(gross_profit),
        gross_loss: r(gross_loss),
        profit_factor: r(profit_factor),
        sharpe_ratio: r(sharpe),
        max_drawdown_pct: r(max_drawdown),
        avg_duration_minutes: r(avg_duration),
        exit_reasons: exit_reasons,
        long_trades: length(long_trades),
        long_win_rate: if(length(long_trades) > 0, do: r(long_wins / length(long_trades) * 100), else: 0.0),
        short_trades: length(short_trades),
        short_win_rate: if(length(short_trades) > 0, do: r(short_wins / length(short_trades) * 100), else: 0.0),
        best_trade: %{pnl: r(best.net_pnl), pnl_pct: r(best.pnl_pct), reason: best.reason},
        worst_trade: %{pnl: r(worst.net_pnl), pnl_pct: r(worst.pnl_pct), reason: worst.reason}
      }
    end
  end

  defp empty_metrics do
    %{
      total_trades: 0, winning_trades: 0, losing_trades: 0,
      win_rate: 0.0, total_pnl: 0.0, total_fees: 0.0,
      average_pnl: 0.0, avg_win: 0.0, avg_loss: 0.0,
      gross_profit: 0.0, gross_loss: 0.0, profit_factor: 0.0,
      sharpe_ratio: 0.0, max_drawdown_pct: 0.0,
      avg_duration_minutes: 0.0, exit_reasons: %{},
      long_trades: 0, long_win_rate: 0.0,
      short_trades: 0, short_win_rate: 0.0,
      best_trade: nil, worst_trade: nil
    }
  end

  defp calculate_max_drawdown(balance_history) when is_list(balance_history) do
    if Enum.empty?(balance_history) do
      0.0
    else
      {_peak, max_dd} =
        balance_history
        |> Enum.reduce({0.0, 0.0}, fn balance, {peak, max_drawdown} ->
          new_peak = max(peak, balance)
          dd = if new_peak > 0, do: (new_peak - balance) / new_peak * 100, else: 0.0
          {new_peak, max(max_drawdown, dd)}
        end)

      max_dd
    end
  end

  # ========================================================================
  # DB CANDLE LOADING
  # ========================================================================

  defp load_candles(symbol, timeframe, months) do
    table = case timeframe do
      "1m" -> "market_data.ohlcv_1m"
      "5m" -> "market_data.ohlcv_5m"
      "15m" -> "market_data.ohlcv_15m"
      "1h" -> "market_data.ohlcv_1h"
      "1d" -> "market_data.ohlcv_1d"
      _ -> nil
    end

    unless table do
      {:error, "Unsupported timeframe: #{timeframe}"}
    else
      start_date = DateTime.utc_now() |> DateTime.add(-months * 30 * 24 * 3600, :second)

      sql = """
      SELECT time, open, high, low, close, volume, quote_volume, trade_count
      FROM #{table}
      WHERE trading_pair = $1 AND time >= $2
      ORDER BY time ASC
      """

      case Repo.query(sql, [symbol, start_date]) do
        {:ok, %{rows: rows}} when rows != [] ->
          candles = Enum.map(rows, fn [time, open, high, low, close, volume, quote_vol, trades] ->
            %{
              timestamp: time,
              open: ensure_decimal(open),
              high: ensure_decimal(high),
              low: ensure_decimal(low),
              close: ensure_decimal(close),
              volume: ensure_decimal(volume),
              quote_volume: ensure_decimal(quote_vol),
              trade_count: trades || 0,
              symbol: symbol,
              timeframe: timeframe,
              exchange: :binance,
              closed: true
            }
          end)

          {:ok, candles}

        {:ok, %{rows: []}} ->
          {:error, :no_data}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  # ========================================================================
  # REPORT PRINTING
  # ========================================================================

  defp print_report({:error, reason}) do
    Logger.error("Backtest failed: #{inspect(reason)}")
  end

  defp print_report(result) do
    m = result.metrics

    IO.puts("""

    ══════════════════════════════════════════════════════════════
    PHYSICS IMPULSE BACKTEST REPORT — #{result.symbol}
    ══════════════════════════════════════════════════════════════

    Period:           #{result.total_candles} candles
    Initial Balance:  $#{r(result.initial_balance)}
    Final Balance:    $#{r(result.final_balance)}
    Total Return:     #{r(result.total_return_pct)}%

    ── TRADE STATISTICS ──────────────────────────────────────────
    Total Trades:     #{m.total_trades}
    Win Rate:         #{m.win_rate}%
    Winning:          #{m.winning_trades}
    Losing:           #{m.losing_trades}

    ── P&L ───────────────────────────────────────────────────────
    Total P&L:        $#{m.total_pnl}
    Total Fees:       $#{m.total_fees}
    Avg P&L/Trade:    $#{m.average_pnl}
    Avg Win:          $#{m.avg_win}
    Avg Loss:         $#{m.avg_loss}
    Profit Factor:    #{m.profit_factor}

    ── RISK ──────────────────────────────────────────────────────
    Sharpe Ratio:     #{m.sharpe_ratio}
    Max Drawdown:     #{m.max_drawdown_pct}%

    ── DIRECTION ─────────────────────────────────────────────────
    Long Trades:      #{m.long_trades} (#{m.long_win_rate}% win)
    Short Trades:     #{m.short_trades} (#{m.short_win_rate}% win)

    ── EXIT REASONS ──────────────────────────────────────────────
    #{format_exit_reasons(m.exit_reasons)}
    ── DURATION ──────────────────────────────────────────────────
    Avg Hold:         #{m.avg_duration_minutes} minutes

    ── BEST / WORST ──────────────────────────────────────────────
    Best Trade:       $#{if m.best_trade, do: m.best_trade.pnl, else: "N/A"} (#{if m.best_trade, do: m.best_trade.reason, else: "N/A"})
    Worst Trade:      $#{if m.worst_trade, do: m.worst_trade.pnl, else: "N/A"} (#{if m.worst_trade, do: m.worst_trade.reason, else: "N/A"})

    ── SIGNAL STATS ──────────────────────────────────────────────
    Signals Generated: #{result.total_signals}
    Entries Attempted: #{result.entries_attempted}
    Entries Rejected:  #{result.entries_rejected}
    ══════════════════════════════════════════════════════════════
    """)
  end

  defp format_exit_reasons(reasons) do
    reasons
    |> Enum.map(fn {reason, count} -> "    #{reason}: #{count}" end)
    |> Enum.join("\n")
  end

  # ========================================================================
  # UTILITY
  # ========================================================================

  defp r(n) when is_float(n), do: Float.round(n, 2)
  defp r(n), do: n

  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(n) when is_float(n), do: n
  defp decimal_to_float(n) when is_integer(n), do: n * 1.0
  defp decimal_to_float(n) when is_binary(n) do
    case Float.parse(n) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  defp decimal_to_float(_), do: 0.0

  defp ensure_decimal(%Decimal{} = d), do: d
  defp ensure_decimal(n) when is_float(n), do: Decimal.from_float(n)
  defp ensure_decimal(n) when is_integer(n), do: Decimal.new(n)
  defp ensure_decimal(n) when is_binary(n) do
    case Decimal.parse(n) do
      {d, ""} -> d
      {d, _} -> d
      :error -> Decimal.new(0)
    end
  end
  defp ensure_decimal(_), do: Decimal.new(0)

  defp to_float(nil), do: nil
  defp to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp to_float(n) when is_float(n), do: n
  defp to_float(n) when is_integer(n), do: n * 1.0
  defp to_float(_), do: nil
end
