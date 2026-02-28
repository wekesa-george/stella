defmodule TradeEngine.Analytics.PhysicsBacktest do
# ============================================================================
# PHYSICS-FINANCE BACKTEST ENGINE & ANALYTICS
# ============================================================================
  @moduledoc """
  🔬 PHYSICS-FINANCE BACKTEST ENGINE
  
  Tests the physics model against historical data:
  
  1. Load historical candles
  2. Apply physics analysis to each candle
  3. Generate signals
  4. Execute virtual trades
  5. Calculate P&L, Sharpe ratio, max drawdown
  6. Generate results report
  
  Key Metrics:
  - Win Rate: % of profitable trades
  - Profit Factor: (Gross Profit) / (Gross Loss)
  - Sharpe Ratio: Return / Volatility
  - Max Drawdown: Largest peak-to-trough decline
  - Expectancy: Average P&L per trade
  """

  require Logger
  alias TradeEngine.Physics.{MarketProjectile, SignalGenerator, RiskManagement}

  defstruct [
    :symbol,
    :candles,
    :trades,
    :results,
    :metrics
  ]

  # ========================================================================
  # MAIN BACKTEST FUNCTION
  # ========================================================================

  def backtest(symbol, candles) when is_list(candles) and length(candles) >= 20 do
    Logger.info("🔬 Starting backtest for #{symbol} with #{length(candles)} candles...")

    state = %{
      symbol: symbol,
      candles: candles,
      trades: [],
      open_position: nil,
      balance_history: [1000.0],  # Start with $1000
      current_balance: 1000.0,
      timestamps: []
    }

    final_state = Enum.reduce(candles, state, fn candle, acc ->
      process_candle_backtest(candle, acc)
    end)

    # Close any remaining open position
    final_state = if final_state.open_position do
      close_backtest_position(final_state, List.last(candles).close, "end_of_backtest")
    else
      final_state
    end

    # Calculate metrics
    metrics = calculate_metrics(final_state)

    result = %{
      symbol: symbol,
      trades: final_state.trades,
      metrics: metrics,
      balance_history: final_state.balance_history,
      final_balance: final_state.current_balance,
      total_return: (final_state.current_balance - 1000.0) / 1000.0 * 100
    }

    {:ok, result}
  end
  def backtest(_, _), do: {:error, :insufficient_candles}

  # ========================================================================
  # CANDLE PROCESSING
  # ========================================================================

  defp process_candle_backtest(candle, state) do
    # Collect recent candles (last 20)
    recent = [candle | Enum.take(state.candles, 19)]
      |> Enum.reverse()

    # Generate signal
    case SignalGenerator.generate_signal(recent) do
      {:ok, signal} ->
        process_signal_backtest(signal, candle, state)

      {:error, _} ->
        state
    end
  end

  defp process_signal_backtest(signal, current_candle, state) do
    current_price = Decimal.to_float(current_candle.close)

    case signal.type do
      :bullish_lift ->
        if not state.open_position do
          # Open long position
          position_size = state.current_balance * 0.05  # 5% risk
          quantity = position_size / current_price

          %{
            state
            | open_position: %{
                entry_price: current_price,
                quantity: quantity,
                position_size: position_size,
                entry_time: current_candle.timestamp,
                physics: signal.physics,
                signal: signal,
                max_price: current_price
              }
          }
        else
          state
        end

      :peak_approaching ->
        if state.open_position do
          close_backtest_position(state, current_price, :take_profit)
        else
          state
        end

      :bearish_dump ->
        if state.open_position do
          close_backtest_position(state, current_price, :stop_loss)
        else
          state
        end

      _ ->
        # Update max price for trailing stop
        if state.open_position do
          max_p = max(state.open_position.max_price, current_price)
          %{state | open_position: Map.put(state.open_position, :max_price, max_p)}
        else
          state
        end
    end
  end

  defp close_backtest_position(state, exit_price, reason) do
    pos = state.open_position
    entry = pos.entry_price
    pnl = (exit_price - entry) * pos.quantity
    pnl_pct = (exit_price - entry) / entry * 100
    new_balance = state.current_balance + pnl

    trade = %{
      entry_price: entry,
      exit_price: exit_price,
      quantity: pos.quantity,
      pnl: pnl,
      pnl_pct: pnl_pct,
      reason: reason,
      entry_time: pos.entry_time,
      physics: pos.physics,
      duration_minutes: 1  # Simplified
    }

    %{
      state
      | trades: [trade | state.trades],
        open_position: nil,
        current_balance: new_balance,
        balance_history: [new_balance | state.balance_history]
    }
  end

  # ========================================================================
  # METRICS CALCULATION
  # ========================================================================

  defp calculate_metrics(state) do
    trades = state.trades
    n = length(trades)

    if n == 0 do
      empty_metrics()
    else
      winning = Enum.count(trades, &(&1.pnl >= 0))
      losing = n - winning
      win_rate = winning / n * 100

      total_pnl = Enum.reduce(trades, 0.0, &(&1.pnl + &2))
      avg_pnl = total_pnl / n

      gross_profit = Enum.reduce(trades, 0.0, fn t, acc ->
        if t.pnl > 0, do: acc + t.pnl, else: acc
      end)

      gross_loss = Enum.reduce(trades, 0.0, fn t, acc ->
        if t.pnl < 0, do: acc + abs(t.pnl), else: acc
      end)

      profit_factor = if gross_loss > 0, do: gross_profit / gross_loss, else: 999.0

      # Sharpe ratio (simplified)
      pnl_values = Enum.map(trades, & &1.pnl)
      mean_pnl = Enum.sum(pnl_values) / n
      variance = Enum.reduce(pnl_values, 0.0, fn x, acc ->
        acc + (x - mean_pnl) ** 2
      end) / n
      std_dev = :math.sqrt(variance)
      sharpe = if std_dev > 0, do: mean_pnl / std_dev, else: 0.0

      # Max drawdown
      max_drawdown = calculate_max_drawdown(state.balance_history)

      # Best/worst trade
      best_trade = Enum.max_by(trades, & &1.pnl)
      worst_trade = Enum.min_by(trades, & &1.pnl)

      %{
        total_trades: n,
        winning_trades: winning,
        losing_trades: losing,
        win_rate: Float.round(win_rate, 1),
        total_pnl: Float.round(total_pnl, 2),
        average_pnl: Float.round(avg_pnl, 2),
        gross_profit: Float.round(gross_profit, 2),
        gross_loss: Float.round(gross_loss, 2),
        profit_factor: Float.round(profit_factor, 2),
        sharpe_ratio: Float.round(sharpe, 2),
        max_drawdown_pct: Float.round(max_drawdown, 2),
        best_trade: %{
          pnl: Float.round(best_trade.pnl, 2),
          pnl_pct: Float.round(best_trade.pnl_pct, 2)
        },
        worst_trade: %{
          pnl: Float.round(worst_trade.pnl, 2),
          pnl_pct: Float.round(worst_trade.pnl_pct, 2)
        }
      }
    end
  end

  defp empty_metrics do
    %{
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0.0,
      total_pnl: 0.0,
      average_pnl: 0.0,
      gross_profit: 0.0,
      gross_loss: 0.0,
      profit_factor: 0.0,
      sharpe_ratio: 0.0,
      max_drawdown_pct: 0.0
    }
  end

  defp calculate_max_drawdown(balance_history) when is_list(balance_history) do
    if Enum.empty?(balance_history) do
      0.0
    else
      {_peak, max_dd} = Enum.reduce(balance_history, {0.0, 0.0}, fn balance, {peak, max_drawdown} ->
        new_peak = max(peak, balance)
        dd = (new_peak - balance) / new_peak * 100
        new_max_dd = max(max_drawdown, dd)
        {new_peak, new_max_dd}
      end)

      max_dd
    end
  end
end
