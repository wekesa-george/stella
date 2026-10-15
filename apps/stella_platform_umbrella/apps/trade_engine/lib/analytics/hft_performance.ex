defmodule TradeEngine.Analytics.HFTPerformance do
  @moduledoc """
  ⚡ HFT Performance Analytics Engine
  
  Institutional-grade metrics for high-frequency trading systems.
  
  ## Technical Metrics
  - Latency (Mean, P95, P99, Jitter)
  - Throughput (TPS)
  - Uptime percentage
  - Message queue depth
  
  ## Financial Metrics
  - Sharpe Ratio (Annualized)
  - Sortino Ratio
  - Profit Factor
  - Max Drawdown (MDD)
  - Calmar Ratio
  - Average Slippage
  
  ## Usage
  
  ```elixir
  # Initialize state
  state = HFTPerformance.init_analytics_state(state)
  
  # Record metrics
  state = HFTPerformance.record_latency(state, latency_us)
  state = HFTPerformance.record_trade(state, pnl, slippage)
  state = HFTPerformance.record_equity(state, balance)
  
  # Get stats
  stats = HFTPerformance.calculate_stats(state)
  
  # Render dashboard
  HFTPerformance.render_dashboard(state)
  ```
  """

  require Logger

  # ═══════════════════════════════════════════════════════════════════════════════
  # CONFIGURATION
  # ═══════════════════════════════════════════════════════════════════════════════

  @latency_buffer_size 1000
  @equity_buffer_size 500
  @slippage_buffer_size 500
  @hourly_returns_buffer 168  # 1 week of hourly data

  # Annualization factors
  @hours_per_year 8760
  @trading_hours_per_year 8760  # 24/7 crypto

  # Performance targets
  @targets %{
    latency_mean_us: 500,       # < 500μs
    latency_p99_us: 1000,       # < 1ms
    sharpe_ratio: 2.0,          # > 2.0
    profit_factor: 1.75,        # > 1.75
    max_drawdown_pct: 25.0,     # < 25%
    slippage_pct: 0.05,         # < 0.05%
    uptime_pct: 99.9            # > 99.9%
  }

  # ═══════════════════════════════════════════════════════════════════════════════
  # STATE INITIALIZATION
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc """
  Initialize HFT analytics fields in the GenServer state.
  Call this in your init/1 callback.
  """
  def init_analytics_state(state) do
    Map.merge(state, %{
      # Technical metrics
      latency_history: [],           # Circular buffer of latencies (μs)
      throughput_counter: 0,         # Messages per second
      throughput_last_reset: System.monotonic_time(:second),
      throughput_history: [],        # Historical TPS values
      message_count: 0,              # Total messages processed
      
      # Financial metrics
      equity_curve: [],              # [{timestamp, balance}]
      high_water_mark: 0.0,          # Peak equity
      gross_profit: 0.0,             # Sum of winning trades
      gross_loss: 0.0,               # Sum of losing trades (positive number)
      slippage_history: [],          # Slippage percentages
      hourly_returns: [],            # For Sharpe calculation
      last_hourly_equity: nil,       # For hourly return calc
      last_hourly_timestamp: nil,
      
      # Tracking
      analytics_started_at: DateTime.utc_now(),
      total_orders: 0,
      filled_orders: 0,
      rejected_orders: 0,
      timeout_count: 0
    })
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # METRIC RECORDING (Hot Path - Must Be Fast)
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc """
  Record order execution latency.
  Call this after each order execution.
  """
  def record_latency(state, latency_us) when is_number(latency_us) do
    new_history = [latency_us | state.latency_history]
    |> Enum.take(@latency_buffer_size)
    
    %{state | 
      latency_history: new_history,
      total_orders: state.total_orders + 1
    }
  end

  @doc """
  Record trade result for P&L tracking.
  """
  def record_trade(state, pnl, slippage_pct \\ 0.0) do
    {new_gross_profit, new_gross_loss} = 
      if pnl >= 0 do
        {state.gross_profit + pnl, state.gross_loss}
      else
        {state.gross_profit, state.gross_loss + abs(pnl)}
      end
    
    new_slippage = [slippage_pct | state.slippage_history]
    |> Enum.take(@slippage_buffer_size)
    
    %{state |
      gross_profit: new_gross_profit,
      gross_loss: new_gross_loss,
      slippage_history: new_slippage
    }
  end

  @doc """
  Record equity snapshot for drawdown calculation.
  Call this after balance changes.
  """
  def record_equity(state, balance) when is_number(balance) do
    now = DateTime.utc_now()
    timestamp = DateTime.to_unix(now, :millisecond)
    
    new_curve = [{timestamp, balance} | state.equity_curve]
    |> Enum.take(@equity_buffer_size)
    
    new_hwm = max(state.high_water_mark, balance)
    
    # Update hourly returns for Sharpe calculation
    state = maybe_record_hourly_return(state, balance, now)
    
    %{state |
      equity_curve: new_curve,
      high_water_mark: new_hwm
    }
  end

  @doc """
  Increment throughput counter.
  Call this for each message processed.
  """
  def increment_throughput(state) do
    now = System.monotonic_time(:second)
    
    if now > state.throughput_last_reset do
      # New second - record and reset
      new_history = [state.throughput_counter | state.throughput_history]
      |> Enum.take(60)  # Keep 60 seconds
      
      %{state |
        throughput_counter: 1,
        throughput_last_reset: now,
        throughput_history: new_history,
        message_count: state.message_count + 1
      }
    else
      %{state |
        throughput_counter: state.throughput_counter + 1,
        message_count: state.message_count + 1
      }
    end
  end

  defp maybe_record_hourly_return(state, balance, now) do
    case state.last_hourly_timestamp do
      nil ->
        %{state | last_hourly_equity: balance, last_hourly_timestamp: now}
      
      last_ts ->
        if DateTime.diff(now, last_ts, :minute) >= 60 do
          # Calculate hourly return
          hourly_return = if state.last_hourly_equity > 0 do
            (balance - state.last_hourly_equity) / state.last_hourly_equity
          else
            0.0
          end
          
          new_returns = [hourly_return | state.hourly_returns]
          |> Enum.take(@hourly_returns_buffer)
          
          %{state |
            hourly_returns: new_returns,
            last_hourly_equity: balance,
            last_hourly_timestamp: now
          }
        else
          state
        end
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # STATISTICAL CALCULATIONS
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc """
  Calculate all HFT performance statistics.
  Returns a map with technical and financial metrics.
  """
  def calculate_stats(state) do
    %{
      technical: calculate_technical_metrics(state),
      financial: calculate_financial_metrics(state),
      targets: @targets,
      timestamp: DateTime.utc_now()
    }
  end

  defp calculate_technical_metrics(state) do
    latencies = state.latency_history
    
    %{
      # Latency stats
      latency_mean_us: mean(latencies),
      latency_stddev_us: stddev(latencies),
      latency_p50_us: percentile(latencies, 50),
      latency_p95_us: percentile(latencies, 95),
      latency_p99_us: percentile(latencies, 99),
      latency_min_us: safe_min(latencies),
      latency_max_us: safe_max(latencies),
      jitter_us: stddev(latencies),  # Jitter = StdDev of latency
      
      # Throughput
      current_tps: state.throughput_counter,
      avg_tps: mean(state.throughput_history),
      peak_tps: safe_max(state.throughput_history),
      total_messages: state.message_count,
      
      # Orders
      total_orders: state.total_orders,
      filled_orders: state.filled_orders,
      rejected_orders: state.rejected_orders,
      fill_rate_pct: safe_div(state.filled_orders, state.total_orders) * 100,
      
      # Uptime
      uptime_seconds: calculate_uptime_seconds(state),
      uptime_pct: 100.0  # Simplified - track downtime events for real calc
    }
  end

  defp calculate_financial_metrics(state) do
    %{
      # Profit/Loss
      gross_profit: state.gross_profit,
      gross_loss: state.gross_loss,
      net_pnl: state.gross_profit - state.gross_loss,
      
      # Ratios
      profit_factor: safe_div(state.gross_profit, state.gross_loss),
      sharpe_ratio: calculate_sharpe_ratio(state.hourly_returns),
      sortino_ratio: calculate_sortino_ratio(state.hourly_returns),
      calmar_ratio: calculate_calmar_ratio(state),
      
      # Drawdown
      max_drawdown_pct: calculate_max_drawdown(state.equity_curve, state.high_water_mark),
      current_drawdown_pct: calculate_current_drawdown(state),
      high_water_mark: state.high_water_mark,
      
      # Slippage
      avg_slippage_pct: mean(state.slippage_history) * 100,
      max_slippage_pct: safe_max(state.slippage_history) * 100,
      
      # Returns
      total_return_pct: calculate_total_return(state),
      avg_hourly_return_pct: mean(state.hourly_returns) * 100
    }
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # RATIO CALCULATIONS
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc """
  Sharpe Ratio = (Mean Return - Risk Free Rate) / StdDev(Returns) * sqrt(periods_per_year)
  Assuming Risk Free Rate = 0 for crypto
  """
  def calculate_sharpe_ratio(returns) when length(returns) < 2, do: 0.0
  def calculate_sharpe_ratio(returns) do
    avg_return = mean(returns)
    std_return = stddev(returns)
    
    if std_return > 0 do
      (avg_return / std_return) * :math.sqrt(@hours_per_year)
    else
      0.0
    end
  end

  @doc """
  Sortino Ratio = Mean Return / Downside Deviation
  Only considers negative returns for volatility
  """
  def calculate_sortino_ratio(returns) when length(returns) < 2, do: 0.0
  def calculate_sortino_ratio(returns) do
    avg_return = mean(returns)
    negative_returns = Enum.filter(returns, &(&1 < 0))
    downside_dev = stddev(negative_returns)
    
    if downside_dev > 0 do
      (avg_return / downside_dev) * :math.sqrt(@hours_per_year)
    else
      if avg_return > 0, do: 999.99, else: 0.0  # Infinite if no downside
    end
  end

  @doc """
  Calmar Ratio = Annualized Return / Max Drawdown
  """
  def calculate_calmar_ratio(state) do
    total_return = calculate_total_return(state)
    max_dd = calculate_max_drawdown(state.equity_curve, state.high_water_mark)
    
    uptime_hours = calculate_uptime_seconds(state) / 3600
    annualized_return = if uptime_hours > 0 do
      total_return * (@hours_per_year / uptime_hours)
    else
      0.0
    end
    
    safe_div(annualized_return, max_dd)
  end

  @doc """
  Max Drawdown = Maximum peak-to-trough decline as percentage
  """
  def calculate_max_drawdown([], _hwm), do: 0.0
  def calculate_max_drawdown(equity_curve, high_water_mark) when high_water_mark <= 0, do: 0.0
  def calculate_max_drawdown(equity_curve, _high_water_mark) do
    # Calculate running max and drawdown at each point
    {max_dd, _} = equity_curve
    |> Enum.reverse()  # Chronological order
    |> Enum.reduce({0.0, 0.0}, fn {_ts, equity}, {max_dd, running_max} ->
      new_max = max(running_max, equity)
      dd = if new_max > 0, do: (new_max - equity) / new_max * 100, else: 0.0
      {max(max_dd, dd), new_max}
    end)
    
    Float.round(max_dd, 2)
  end

  defp calculate_current_drawdown(state) do
    case state.equity_curve do
      [{_, current} | _] when state.high_water_mark > 0 ->
        (state.high_water_mark - current) / state.high_water_mark * 100
      _ ->
        0.0
    end
    |> Float.round(2)
  end

  defp calculate_total_return(state) do
    case {state.equity_curve, state.starting_balance} do
      {[{_, current} | _], start} when start > 0 ->
        (current - start) / start * 100
      _ ->
        0.0
    end
  end

  defp calculate_uptime_seconds(state) do
    DateTime.diff(DateTime.utc_now(), state.analytics_started_at)
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # STATISTICAL HELPERS (Pure Functions)
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc "Calculate mean of a list"
  def mean([]), do: 0.0
  def mean(list) do
    Enum.sum(list) / length(list)
  end

  @doc "Calculate standard deviation"
  def stddev([]), do: 0.0
  def stddev([_]), do: 0.0
  def stddev(list) do
    avg = mean(list)
    n = length(list)
    
    variance = list
    |> Enum.map(fn x -> (x - avg) * (x - avg) end)
    |> Enum.sum()
    |> Kernel./(n)
    
    :math.sqrt(variance)
  end

  @doc "Calculate percentile (0-100)"
  def percentile([], _p), do: 0.0
  def percentile(list, p) when p >= 0 and p <= 100 do
    sorted = Enum.sort(list)
    n = length(sorted)
    k = (p / 100) * (n - 1)
    f = trunc(k)
    c = Float.ceil(k) |> trunc()
    
    if f == c do
      Enum.at(sorted, f, 0.0)
    else
      lower = Enum.at(sorted, f, 0.0)
      upper = Enum.at(sorted, c, 0.0)
      lower + (upper - lower) * (k - f)
    end
  end

  defp safe_div(_, 0), do: 0.0
  defp safe_div(_, 0.0), do: 0.0
  defp safe_div(a, b), do: a / b

  defp safe_min([]), do: 0.0
  defp safe_min(list), do: Enum.min(list)

  defp safe_max([]), do: 0.0
  defp safe_max(list), do: Enum.max(list)

  # ═══════════════════════════════════════════════════════════════════════════════
  # DASHBOARD RENDERING
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc """
  Render professional HFT dashboard to console.
  """
  def render_dashboard(state, opts \\ []) do
    stats = calculate_stats(state)
    tech = stats.technical
    fin = stats.financial
    
    show_ai = Keyword.get(opts, :show_ai, true)
    
    IO.puts("""
    
    ╔══════════════════════════════════════════════════════════════════════════════════════╗
    ║                         ⚡ HFT PERFORMANCE DASHBOARD ⚡                                ║
    ║                      MarginScalper v16.0 "Endgame" Edition                           ║
    ╠══════════════════════════════════════════════════════════════════════════════════════╣
    ║                                                                                      ║
    ║  ┌─────────────────────────────── TECHNICAL HEALTH ───────────────────────────────┐  ║
    ║  │                                                                                │  ║
    ║  │  LATENCY (μs)           THROUGHPUT              RELIABILITY                    │  ║
    ║  │  ├─ Mean:    #{pad_num(tech.latency_mean_us, 8)}    ├─ Current: #{pad_num(tech.current_tps, 6)} TPS   ├─ Uptime:  #{pad_num(tech.uptime_pct, 6)}%       │  ║
    ║  │  ├─ P50:     #{pad_num(tech.latency_p50_us, 8)}     ├─ Average: #{pad_num(tech.avg_tps, 6)} TPS   ├─ Orders:  #{pad_int(tech.total_orders, 6)}          │  ║
    ║  │  ├─ P95:     #{pad_num(tech.latency_p95_us, 8)}     ├─ Peak:    #{pad_num(tech.peak_tps, 6)} TPS   ├─ Fill %:  #{pad_num(tech.fill_rate_pct, 6)}%       │  ║
    ║  │  ├─ P99:     #{pad_num(tech.latency_p99_us, 8)}     └─ Total:   #{pad_int(tech.total_messages, 6)} msgs  └─ Errors:  #{pad_int(state.errors, 6)}        │  ║
    ║  │  └─ Jitter:  #{pad_num(tech.jitter_us, 8)}                                                         │  ║
    ║  │                                                                                │  ║
    ║  │  STATUS: #{latency_status(tech.latency_mean_us)}                                                   │  ║
    ║  │                                                                                │  ║
    ║  └────────────────────────────────────────────────────────────────────────────────┘  ║
    ║                                                                                      ║
    ║  ┌─────────────────────────── FINANCIAL PERFORMANCE ──────────────────────────────┐  ║
    ║  │                                                                                │  ║
    ║  │  PROFIT/LOSS            RISK METRICS            EFFICIENCY                     │  ║
    ║  │  ├─ Net P&L:  #{pad_pnl(fin.net_pnl, 9)}   ├─ Sharpe:    #{pad_num(fin.sharpe_ratio, 6)}    ├─ Profit Factor: #{pad_num(fin.profit_factor, 5)}   │  ║
    ║  │  ├─ Gross +:  #{pad_pnl(fin.gross_profit, 9)}   ├─ Sortino:   #{pad_num(fin.sortino_ratio, 6)}    ├─ Calmar:        #{pad_num(fin.calmar_ratio, 5)}   │  ║
    ║  │  ├─ Gross -:  #{pad_pnl(-fin.gross_loss, 9)}   ├─ Max DD:    #{pad_num(fin.max_drawdown_pct, 6)}%   ├─ Avg Slip:     #{pad_num(fin.avg_slippage_pct, 5)}%  │  ║
    ║  │  └─ Return:   #{pad_num(fin.total_return_pct, 8)}%  └─ Curr DD:   #{pad_num(fin.current_drawdown_pct, 6)}%   └─ HWM:        $#{pad_num(fin.high_water_mark, 4)}   │  ║
    ║  │                                                                                │  ║
    ║  │  GRADE: #{performance_grade(fin)}                                                           │  ║
    ║  │                                                                                │  ║
    ║  └────────────────────────────────────────────────────────────────────────────────┘  ║
    #{if show_ai, do: ai_section(state), else: ""}║                                                                                      ║
    ╠══════════════════════════════════════════════════════════════════════════════════════╣
    ║  #{timestamp_line()}              ║
    ╚══════════════════════════════════════════════════════════════════════════════════════╝
    """)
  end

  defp ai_section(state) do
    ai_status = get_ai_status()
    """
    ║  ┌──────────────────────────────── AI BRAIN STATUS ────────────────────────────────┐  ║
    ║  │                                                                                │  ║
    ║  │  MODE: #{pad_str(ai_status.mode, 12)}  DECISIONS: #{pad_int(ai_status.total, 8)}  AVG LATENCY: #{pad_num(ai_status.latency, 6)}μs     │  ║
    ║  │  MODEL: #{pad_str(if(ai_status.loaded, do: "✅ LOADED", else: "❌ MISSING"), 11)} INFERENCE: #{pad_int(ai_status.inference, 8)}  HEURISTIC:  #{pad_int(ai_status.heuristic, 6)}      │  ║
    ║  │                                                                                │  ║
    ║  └────────────────────────────────────────────────────────────────────────────────┘  ║
    """
  end

  defp get_ai_status do
    try do
      case TradeEngine.AI.Brain.status() do
        %{} = s -> 
          %{
            mode: s.mode,
            loaded: s.model_loaded,
            total: s.total_decisions,
            inference: s.inference_count,
            heuristic: s.heuristic_count,
            latency: s.avg_latency_us
          }
        _ -> default_ai_status()
      end
    catch
      _, _ -> default_ai_status()
    end
  end

  defp default_ai_status do
    %{mode: :offline, loaded: false, total: 0, inference: 0, heuristic: 0, latency: 0.0}
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # FORMATTING HELPERS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp pad_num(num, width) when is_float(num) do
    num |> Float.round(2) |> to_string() |> String.pad_leading(width)
  end
  defp pad_num(num, width) when is_integer(num) do
    num |> to_string() |> String.pad_leading(width)
  end
  defp pad_num(nil, width), do: String.pad_leading("0.0", width)

  defp pad_int(num, width) when is_integer(num) do
    num |> to_string() |> String.pad_leading(width)
  end
  defp pad_int(num, width) when is_float(num) do
    num |> trunc() |> to_string() |> String.pad_leading(width)
  end
  defp pad_int(nil, width), do: String.pad_leading("0", width)

  defp pad_str(atom, width) when is_atom(atom) do
    atom |> to_string() |> String.upcase() |> String.pad_trailing(width)
  end
  defp pad_str(str, width) when is_binary(str) do
    str |> String.pad_trailing(width)
  end

  defp pad_pnl(num, width) when is_float(num) do
    prefix = if num >= 0, do: "+$", else: "-$"
    (prefix <> (abs(num) |> Float.round(2) |> to_string())) |> String.pad_leading(width)
  end
  defp pad_pnl(num, width) when is_integer(num), do: pad_pnl(num * 1.0, width)
  defp pad_pnl(nil, width), do: String.pad_leading("$0.00", width)

  defp latency_status(mean) when mean < 500, do: "🟢 EXCELLENT (Sub-500μs)"
  defp latency_status(mean) when mean < 1000, do: "🟡 GOOD (Sub-1ms)"
  defp latency_status(mean) when mean < 5000, do: "🟠 ACCEPTABLE (Sub-5ms)"
  defp latency_status(_), do: "🔴 DEGRADED (>5ms)"

  defp performance_grade(fin) do
    score = calculate_score(fin)
    
    cond do
      score >= 90 -> "🏆 ELITE (#{score}/100) - Institutional Grade"
      score >= 75 -> "🥇 EXCELLENT (#{score}/100) - Professional Grade"
      score >= 60 -> "🥈 GOOD (#{score}/100) - Retail+ Grade"
      score >= 40 -> "🥉 FAIR (#{score}/100) - Needs Optimization"
      true -> "⚠️  POOR (#{score}/100) - Review Strategy"
    end
  end

  defp calculate_score(fin) do
    # Weight each metric
    pf_score = min(fin.profit_factor / 2.0 * 25, 25)  # 0-25 pts
    sharpe_score = min(fin.sharpe_ratio / 3.0 * 25, 25)  # 0-25 pts
    dd_score = max(0, (50 - fin.max_drawdown_pct) / 50 * 25)  # 0-25 pts
    slip_score = max(0, (0.1 - fin.avg_slippage_pct) / 0.1 * 25)  # 0-25 pts
    
    (pf_score + sharpe_score + dd_score + slip_score) |> trunc()
  end

  defp timestamp_line do
    now = DateTime.utc_now()
    "Generated: #{Calendar.strftime(now, "%Y-%m-%d %H:%M:%S UTC")}                               "
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # ALERTS & MONITORING
  # ═══════════════════════════════════════════════════════════════════════════════

  @doc """
  Check metrics against targets and return alerts.
  """
  def check_alerts(state) do
    stats = calculate_stats(state)
    tech = stats.technical
    fin = stats.financial
    
    alerts = []
    
    alerts = if tech.latency_p99_us > @targets.latency_p99_us do
      [{:warning, :latency, "P99 latency #{tech.latency_p99_us}μs exceeds #{@targets.latency_p99_us}μs target"} | alerts]
    else
      alerts
    end
    
    alerts = if fin.max_drawdown_pct > @targets.max_drawdown_pct do
      [{:critical, :drawdown, "Max drawdown #{fin.max_drawdown_pct}% exceeds #{@targets.max_drawdown_pct}% limit"} | alerts]
    else
      alerts
    end
    
    alerts = if fin.profit_factor < @targets.profit_factor and state.total_trades > 10 do
      [{:warning, :profit_factor, "Profit factor #{fin.profit_factor} below #{@targets.profit_factor} target"} | alerts]
    else
      alerts
    end
    
    alerts
  end

  @doc """
  Export stats to map for external monitoring systems.
  """
  def export_metrics(state) do
    stats = calculate_stats(state)
    
    %{
      # Prometheus-style flat metrics
      "hft_latency_mean_us" => stats.technical.latency_mean_us,
      "hft_latency_p99_us" => stats.technical.latency_p99_us,
      "hft_throughput_tps" => stats.technical.current_tps,
      "hft_sharpe_ratio" => stats.financial.sharpe_ratio,
      "hft_profit_factor" => stats.financial.profit_factor,
      "hft_max_drawdown_pct" => stats.financial.max_drawdown_pct,
      "hft_net_pnl" => stats.financial.net_pnl,
      "hft_total_orders" => stats.technical.total_orders
    }
  end

    def calculate_expectancy(state) do
    wins = Enum.filter(state.completed_trades, & &1.pnl >= 0)
    losses = Enum.filter(state.completed_trades, & &1.pnl < 0)
    
    win_rate = length(wins) / max(length(state.completed_trades), 1)
    avg_win = if length(wins) > 0, do: Enum.sum(Enum.map(wins, & &1.pnl)) / length(wins), else: 0
    avg_loss = if length(losses) > 0, do: abs(Enum.sum(Enum.map(losses, & &1.pnl))) / length(losses), else: 0
    
    expectancy = (win_rate * avg_win) - ((1 - win_rate) * avg_loss)
    expectancy_per_dollar = expectancy / avg_loss  # R-multiple
    
    %{
        expectancy: expectancy,
        expectancy_r: expectancy_per_dollar,
        win_rate: win_rate,
        avg_win: avg_win,
        avg_loss: avg_loss,
        profit_factor: avg_win * win_rate / (avg_loss * (1 - win_rate))
    }
    end

end