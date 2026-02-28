# ============================================================================
# RESULTS FORMATTER & REPORT GENERATOR
# ============================================================================
defmodule TradeEngine.Analytics.ResultsFormatter do
  @moduledoc "Format backtest results into readable reports"

  def format_full_report(symbol, backtest_result) do
    %{
      trades: trades,
      metrics: metrics,
      final_balance: final_balance,
      total_return: total_return
    } = backtest_result

    """
    
    ╔════════════════════════════════════════════════════════════════════════════╗
    ║                    PHYSICS-FINANCE BACKTEST REPORT                         ║
    ║                                                                            ║
    ║ Symbol: #{String.pad_trailing(symbol, 40)}
    ╚════════════════════════════════════════════════════════════════════════════╝
    
    📊 PERFORMANCE METRICS
    ═══════════════════════════════════════════════════════════════════════════
    
    Trades Executed:      #{metrics.total_trades} total
    ├─ Winning:          #{metrics.winning_trades} (#{metrics.win_rate}%)
    ├─ Losing:           #{metrics.losing_trades}
    └─ P&L:              $#{metrics.total_pnl}
    
    Returns & Risk:
    ├─ Total Return:      #{Float.round(total_return, 2)}%
    ├─ Final Balance:     $#{Float.round(final_balance, 2)}
    ├─ Average Trade:     $#{metrics.average_pnl}
    └─ Max Drawdown:      #{metrics.max_drawdown_pct}%
    
    🎯 PROFITABILITY
    ═══════════════════════════════════════════════════════════════════════════
    
    Gross Profit:        $#{metrics.gross_profit}
    Gross Loss:          $#{metrics.gross_loss}
    Profit Factor:       #{metrics.profit_factor}x
    ├─ (> 1.5 is excellent)
    └─ (< 1.0 is unprofitable)
    
    📈 RISK-ADJUSTED METRICS
    ═══════════════════════════════════════════════════════════════════════════
    
    Sharpe Ratio:        #{metrics.sharpe_ratio}
    ├─ (> 1.0 is good)
    └─ (> 2.0 is excellent)
    
    🎲 BEST/WORST TRADES
    ═══════════════════════════════════════════════════════════════════════════
    
    Best Trade:          $#{metrics.best_trade.pnl} (#{metrics.best_trade.pnl_pct}%)
    Worst Trade:         $#{metrics.worst_trade.pnl} (#{metrics.worst_trade.pnl_pct}%)
    
    ═══════════════════════════════════════════════════════════════════════════
    """
  end

  def format_trade_summary(trades) when is_list(trades) do
    """
    
    📋 TRADE-BY-TRADE SUMMARY
    ═══════════════════════════════════════════════════════════════════════════
    
    """ <>
      Enum.with_index(trades, fn trade, idx ->
        """
        Trade #{idx + 1}:
        ├─ Entry:  $#{Float.round(trade.entry_price, 4)}
        ├─ Exit:   $#{Float.round(trade.exit_price, 4)}
        ├─ P&L:    $#{Float.round(trade.pnl, 2)} (#{Float.round(trade.pnl_pct, 1)}%)
        ├─ Reason: #{trade.reason}
        └─ Physics: v₀=#{Float.round(trade.physics.momentum, 4)}, g=#{Float.round(trade.physics.gravity, 4)}, θ=#{trade.physics.trajectory_angle}°
        """
      end)
      |> Enum.join("\n")
  end

  def format_physics_analysis(physics) do
    """
    
    ⚙️  PHYSICS PARAMETERS
    ═══════════════════════════════════════════════════════════════════════════
    
    Momentum (v₀):       #{Float.round(physics.momentum, 6)}
    ├─ Initial bullish force
    
    Gravity (g):         #{Float.round(physics.gravity, 6)}
    ├─ Market selling pressure
    
    Peak Time (t*):      #{Float.round(physics.peak_time, 1)} candles
    ├─ Time to momentum exhaustion
    
    Peak Price (P*):     $#{Float.round(physics.peak_price, 2)}
    ├─ Predicted maximum price
    
    Trajectory (θ):      #{Float.round(physics.trajectory_angle, 2)}°
    ├─ Entry angle (>18° = strong signal)
    
    Kinetic Energy (E_k): #{Float.round(physics.kinetic_energy, 4)}
    ├─ Market movement capacity
    
    Energy State:        #{physics.energy_state}
    ├─ :high = strong, :medium = moderate, :low = exhausted
    
    ═══════════════════════════════════════════════════════════════════════════
    """
  end
end