defmodule TradeEngine.Risk.Analytics do
  @moduledoc """
  Comprehensive Risk Analytics Module
  
  Calculates professional trading metrics:
  - Sharpe Ratio
  - Sortino Ratio
  - Calmar Ratio
  - Expectancy
  - Value at Risk (VaR)
  - Conditional Value at Risk (CVaR)
  - Mean Adverse Excursion (MAE)
  - Maximum Drawdown
  - Win Rate & Profit Factor
  """

  require Logger

  # Risk-free rate (annualized) - US Treasury ~5% as of 2024
  @risk_free_rate_annual 0.05
  # Trading days per year (crypto = 365)
  @trading_days_per_year 365
  # Hours per trading day (crypto = 24)
  @hours_per_day 24

  # ═══════════════════════════════════════════════════════════════════════════════
  # PUBLIC API
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc """
  Calculate all risk metrics from trade history.
  
  ## Parameters
  - trades: List of completed trades with :pnl, :entry_price, :exit_price, :lowest_price, :highest_price
  - balance_history: List of {timestamp, balance} tuples
  - current_balance: Current account balance
  - starting_balance: Initial account balance
  - runtime_hours: How long the strategy has been running
  """
  def calculate_all_metrics(trades, balance_history, current_balance, starting_balance, runtime_hours) do
    returns = extract_returns(trades)
    pnls = Enum.map(trades, & &1.pnl)
    
    %{
      # Core Performance
      total_pnl: Enum.sum(pnls),
      total_trades: length(trades),
      win_rate: calculate_win_rate(trades),
      profit_factor: calculate_profit_factor(trades),
      
      # Risk-Adjusted Returns
      sharpe_ratio: calculate_sharpe_ratio(returns, runtime_hours),
      sortino_ratio: calculate_sortino_ratio(returns, runtime_hours),
      calmar_ratio: calculate_calmar_ratio(returns, balance_history, starting_balance, runtime_hours),
      
      # Expectancy
      expectancy: calculate_expectancy(trades),
      expectancy_per_trade: calculate_expectancy_per_trade(trades),
      
      # Risk Metrics
      var_95: calculate_var(pnls, 0.95),
      var_99: calculate_var(pnls, 0.99),
      cvar_95: calculate_cvar(pnls, 0.95),
      cvar_99: calculate_cvar(pnls, 0.99),
      
      # Drawdown
      max_drawdown: calculate_max_drawdown(balance_history, starting_balance),
      current_drawdown: calculate_current_drawdown(current_balance, balance_history, starting_balance),
      
      # Trade Analysis
      avg_win: calculate_avg_win(trades),
      avg_loss: calculate_avg_loss(trades),
      largest_win: calculate_largest_win(trades),
      largest_loss: calculate_largest_loss(trades),
      avg_mae: calculate_avg_mae(trades),
      max_mae: calculate_max_mae(trades),
      
      # Time-based
      trades_per_hour: if(runtime_hours > 0, do: length(trades) / runtime_hours, else: 0),
      pnl_per_hour: if(runtime_hours > 0, do: Enum.sum(pnls) / runtime_hours, else: 0),
      
      # Volatility
      return_std: calculate_std(returns),
      downside_std: calculate_downside_std(returns)
    }
  end

  @doc """
  Generate a formatted analytics report string.
  """
  def generate_report(metrics) do
    """
    
    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║  📊 COMPREHENSIVE RISK ANALYTICS REPORT                                       ║
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  CORE PERFORMANCE                                                            ║
    ║  ├─ Total P&L:        #{format_currency(metrics.total_pnl)}
    ║  ├─ Total Trades:     #{metrics.total_trades}
    ║  ├─ Win Rate:         #{format_pct(metrics.win_rate)}
    ║  ├─ Profit Factor:    #{format_ratio(metrics.profit_factor)}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  RISK-ADJUSTED RETURNS                                                       ║
    ║  ├─ Sharpe Ratio:     #{format_ratio(metrics.sharpe_ratio)} #{sharpe_rating(metrics.sharpe_ratio)}
    ║  ├─ Sortino Ratio:    #{format_ratio(metrics.sortino_ratio)} #{sortino_rating(metrics.sortino_ratio)}
    ║  ├─ Calmar Ratio:     #{format_ratio(metrics.calmar_ratio)}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  EXPECTANCY                                                                  ║
    ║  ├─ Expectancy:       #{format_currency(metrics.expectancy)}/trade
    ║  ├─ Expected Value:   #{format_pct(metrics.expectancy_per_trade)} per trade
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  VALUE AT RISK (VaR)                                                         ║
    ║  ├─ VaR (95%):        #{format_currency(metrics.var_95)} max loss per trade
    ║  ├─ VaR (99%):        #{format_currency(metrics.var_99)} max loss per trade
    ║  ├─ CVaR (95%):       #{format_currency(metrics.cvar_95)} expected tail loss
    ║  ├─ CVaR (99%):       #{format_currency(metrics.cvar_99)} expected tail loss
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  DRAWDOWN                                                                    ║
    ║  ├─ Max Drawdown:     #{format_pct(metrics.max_drawdown)}
    ║  ├─ Current Drawdown: #{format_pct(metrics.current_drawdown)}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  TRADE ANALYSIS                                                              ║
    ║  ├─ Avg Win:          #{format_currency(metrics.avg_win)}
    ║  ├─ Avg Loss:         #{format_currency(metrics.avg_loss)}
    ║  ├─ Largest Win:      #{format_currency(metrics.largest_win)}
    ║  ├─ Largest Loss:     #{format_currency(metrics.largest_loss)}
    ║  ├─ Avg MAE:          #{format_currency(metrics.avg_mae)}
    ║  ├─ Max MAE:          #{format_currency(metrics.max_mae)}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  VOLATILITY                                                                  ║
    ║  ├─ Return Std Dev:   #{format_pct(metrics.return_std)}
    ║  ├─ Downside Std Dev: #{format_pct(metrics.downside_std)}
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║  EFFICIENCY                                                                  ║
    ║  ├─ Trades/Hour:      #{Float.round(metrics.trades_per_hour, 1)}
    ║  ├─ P&L/Hour:         #{format_currency(metrics.pnl_per_hour)}
    ╚══════════════════════════════════════════════════════════════════════════════╝
    """
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # SHARPE RATIO
  # Formula: (R_p - R_f) / σ_p
  # ═══════════════════════════════════════════════════════════════════════════════

  def calculate_sharpe_ratio(returns, runtime_hours) when length(returns) < 2 do
    0.0
  end

  def calculate_sharpe_ratio(returns, runtime_hours) do
    # Annualize based on runtime
    periods_per_year = (@trading_days_per_year * @hours_per_day) / max(runtime_hours, 1)
    
    avg_return = Enum.sum(returns) / length(returns)
    std_return = calculate_std(returns)
    
    # Risk-free rate per period
    rf_per_period = @risk_free_rate_annual / periods_per_year
    
    if std_return > 0 do
      # Annualized Sharpe
      excess_return = avg_return - rf_per_period
      (excess_return / std_return) * :math.sqrt(min(periods_per_year, 8760))
    else
      0.0
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # SORTINO RATIO
  # Formula: (R_p - R_f) / σ_d (downside deviation only)
  # ═══════════════════════════════════════════════════════════════════════════════

  def calculate_sortino_ratio(returns, runtime_hours) when length(returns) < 2 do
    0.0
  end

  def calculate_sortino_ratio(returns, runtime_hours) do
    periods_per_year = (@trading_days_per_year * @hours_per_day) / max(runtime_hours, 1)
    
    avg_return = Enum.sum(returns) / length(returns)
    downside_std = calculate_downside_std(returns)
    
    rf_per_period = @risk_free_rate_annual / periods_per_year
    
    if downside_std > 0 do
      excess_return = avg_return - rf_per_period
      (excess_return / downside_std) * :math.sqrt(min(periods_per_year, 8760))
    else
      if avg_return > 0, do: 999.0, else: 0.0  # Infinite if no downside
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # CALMAR RATIO
  # Formula: CAGR / Max Drawdown
  # ═══════════════════════════════════════════════════════════════════════════════

  def calculate_calmar_ratio(_returns, _balance_history, _starting_balance, runtime_hours) 
      when runtime_hours < 0.1 do
    0.0
  end

  def calculate_calmar_ratio(returns, balance_history, starting_balance, runtime_hours) do
    max_dd = calculate_max_drawdown(balance_history, starting_balance)
    
    if max_dd > 0 and length(returns) > 0 do
      # Annualized return
      total_return = Enum.sum(returns)
      annualized_return = total_return * (@trading_days_per_year * @hours_per_day / runtime_hours)
      
      annualized_return / max_dd
    else
      0.0
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # EXPECTANCY
  # Formula: (W/T × AWR) - (L/T × ALR)
  # ═══════════════════════════════════════════════════════════════════════════════

  def calculate_expectancy(trades) when length(trades) == 0, do: 0.0

  def calculate_expectancy(trades) do
    winners = Enum.filter(trades, & &1.pnl > 0)
    losers = Enum.filter(trades, & &1.pnl <= 0)
    
    total = length(trades)
    w = length(winners)
    l = length(losers)
    
    avg_win = if w > 0, do: Enum.sum(Enum.map(winners, & &1.pnl)) / w, else: 0
    avg_loss = if l > 0, do: abs(Enum.sum(Enum.map(losers, & &1.pnl)) / l), else: 0
    
    win_rate = w / total
    loss_rate = l / total
    
    (win_rate * avg_win) - (loss_rate * avg_loss)
  end

  def calculate_expectancy_per_trade(trades) when length(trades) == 0, do: 0.0

  def calculate_expectancy_per_trade(trades) do
    # As percentage of average trade size
    avg_trade_size = Enum.map(trades, fn t -> abs(t[:notional] || t[:margin] || 100) end)
                     |> Enum.sum()
                     |> Kernel./(length(trades))
    
    expectancy = calculate_expectancy(trades)
    
    if avg_trade_size > 0 do
      expectancy / avg_trade_size
    else
      0.0
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # VALUE AT RISK (VaR)
  # Historical VaR - percentile of loss distribution
  # ═══════════════════════════════════════════════════════════════════════════════

  def calculate_var(pnls, confidence) when length(pnls) < 2, do: 0.0

  def calculate_var(pnls, confidence) do
    sorted = Enum.sort(pnls)
    index = trunc((1 - confidence) * length(sorted))
    
    # VaR is the loss at the given percentile (as positive number for loss)
    -Enum.at(sorted, max(index, 0), 0)
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # CONDITIONAL VALUE AT RISK (CVaR) / Expected Shortfall
  # Formula: E[Loss | Loss ≥ VaR]
  # ═══════════════════════════════════════════════════════════════════════════════

  def calculate_cvar(pnls, confidence) when length(pnls) < 2, do: 0.0

  def calculate_cvar(pnls, confidence) do
    var = calculate_var(pnls, confidence)
    
    # Get all losses worse than VaR
    tail_losses = Enum.filter(pnls, fn pnl -> -pnl >= var end)
    
    if length(tail_losses) > 0 do
      -Enum.sum(tail_losses) / length(tail_losses)
    else
      var
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # MEAN ADVERSE EXCURSION (MAE)
  # Formula: max(P_entry - P_min) for longs, max(P_max - P_entry) for shorts
  # ═══════════════════════════════════════════════════════════════════════════════

  def calculate_mae(trade) do
    entry = trade[:entry_price] || 0
    direction = trade[:direction]
    quantity = trade[:quantity] || 0
    
    case direction do
      :long ->
        lowest = trade[:lowest_price] || entry
        (entry - lowest) * quantity
        
      :short ->
        highest = trade[:highest_price] || entry
        (highest - entry) * quantity
        
      _ ->
        0.0
    end
  end

  def calculate_avg_mae(trades) when length(trades) == 0, do: 0.0

  def calculate_avg_mae(trades) do
    maes = Enum.map(trades, &calculate_mae/1)
    Enum.sum(maes) / length(maes)
  end

  def calculate_max_mae(trades) when length(trades) == 0, do: 0.0

  def calculate_max_mae(trades) do
    trades
    |> Enum.map(&calculate_mae/1)
    |> Enum.max(fn -> 0.0 end)
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # DRAWDOWN
  # Formula: (Peak - Trough) / Peak
  # ═══════════════════════════════════════════════════════════════════════════════

  def calculate_max_drawdown([], starting_balance), do: 0.0

  def calculate_max_drawdown(balance_history, starting_balance) do
    balances = [starting_balance | Enum.map(balance_history, fn {_ts, bal} -> bal end)]
    
    {_peak, max_dd} = Enum.reduce(balances, {starting_balance, 0.0}, fn balance, {peak, max_dd} ->
      new_peak = max(peak, balance)
      drawdown = if new_peak > 0, do: (new_peak - balance) / new_peak, else: 0.0
      {new_peak, max(max_dd, drawdown)}
    end)
    
    max_dd
  end

  def calculate_current_drawdown(current_balance, balance_history, starting_balance) do
    balances = [starting_balance | Enum.map(balance_history, fn {_ts, bal} -> bal end)]
    peak = Enum.max(balances, fn -> starting_balance end)
    
    if peak > 0 do
      (peak - current_balance) / peak
    else
      0.0
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # SUPPORTING CALCULATIONS
  # ═══════════════════════════════════════════════════════════════════════════════

  def calculate_win_rate(trades) when length(trades) == 0, do: 0.0

  def calculate_win_rate(trades) do
    winners = Enum.count(trades, & &1.pnl > 0)
    winners / length(trades)
  end

  def calculate_profit_factor(trades) do
    gross_profit = trades
                   |> Enum.filter(& &1.pnl > 0)
                   |> Enum.map(& &1.pnl)
                   |> Enum.sum()
    
    gross_loss = trades
                 |> Enum.filter(& &1.pnl < 0)
                 |> Enum.map(& abs(&1.pnl))
                 |> Enum.sum()
    
    if gross_loss > 0 do
      gross_profit / gross_loss
    else
      if gross_profit > 0, do: 999.0, else: 0.0
    end
  end

  def calculate_avg_win(trades) do
    winners = Enum.filter(trades, & &1.pnl > 0)
    if length(winners) > 0 do
      Enum.sum(Enum.map(winners, & &1.pnl)) / length(winners)
    else
      0.0
    end
  end

  def calculate_avg_loss(trades) do
    losers = Enum.filter(trades, & &1.pnl <= 0)
    if length(losers) > 0 do
      Enum.sum(Enum.map(losers, & &1.pnl)) / length(losers)
    else
      0.0
    end
  end

  def calculate_largest_win(trades) do
    trades
    |> Enum.map(& &1.pnl)
    |> Enum.max(fn -> 0.0 end)
  end

  def calculate_largest_loss(trades) do
    trades
    |> Enum.map(& &1.pnl)
    |> Enum.min(fn -> 0.0 end)
  end

  defp extract_returns(trades) do
    Enum.map(trades, fn trade ->
      margin = trade[:margin] || trade[:notional] || 100
      if margin > 0, do: trade.pnl / margin, else: 0.0
    end)
  end

  defp calculate_std(values) when length(values) < 2, do: 0.0

  defp calculate_std(values) do
    mean = Enum.sum(values) / length(values)
    
    variance = values
               |> Enum.map(fn v -> :math.pow(v - mean, 2) end)
               |> Enum.sum()
               |> Kernel./(length(values) - 1)
    
    :math.sqrt(variance)
  end

  defp calculate_downside_std(values) when length(values) < 2, do: 0.0

  defp calculate_downside_std(values) do
    # Only consider negative returns
    negative_returns = Enum.filter(values, & &1 < 0)
    
    if length(negative_returns) < 2 do
      0.0
    else
      mean = 0  # Target return (usually 0 or risk-free rate)
      
      variance = negative_returns
                 |> Enum.map(fn v -> :math.pow(min(v - mean, 0), 2) end)
                 |> Enum.sum()
                 |> Kernel./(length(negative_returns))
      
      :math.sqrt(variance)
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # FORMATTING HELPERS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp format_currency(value) when is_number(value) do
    sign = if value >= 0, do: "+", else: ""
    "#{sign}$#{Float.round(value * 1.0, 2)}"
  end
  defp format_currency(_), do: "$0.00"

  defp format_pct(value) when is_number(value) do
    "#{Float.round(value * 100, 2)}%"
  end
  defp format_pct(_), do: "0.0%"

  defp format_ratio(value) when is_number(value) do
    Float.round(value * 1.0, 3)
  end
  defp format_ratio(_), do: "0.0"

  defp sharpe_rating(sharpe) when sharpe >= 3.0, do: "🟢 Excellent"
  defp sharpe_rating(sharpe) when sharpe >= 2.0, do: "🟢 Great"
  defp sharpe_rating(sharpe) when sharpe >= 1.0, do: "🟡 Good"
  defp sharpe_rating(sharpe) when sharpe >= 0.5, do: "🟡 Acceptable"
  defp sharpe_rating(sharpe) when sharpe >= 0, do: "🔴 Poor"
  defp sharpe_rating(_), do: "🔴 Negative"

  defp sortino_rating(sortino) when sortino >= 3.0, do: "🟢 Excellent"
  defp sortino_rating(sortino) when sortino >= 2.0, do: "🟢 Great"
  defp sortino_rating(sortino) when sortino >= 1.0, do: "🟡 Good"
  defp sortino_rating(sortino) when sortino >= 0, do: "🔴 Poor"
  defp sortino_rating(_), do: "🔴 Negative"
end