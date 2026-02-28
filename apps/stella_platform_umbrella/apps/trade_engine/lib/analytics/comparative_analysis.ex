# ============================================================================
# COMPARATIVE ANALYSIS (PHYSICS vs TRADITIONAL)
# ============================================================================
defmodule TradeEngine.Analytics.ComparativeAnalysis do
  @moduledoc """
  Compare physics-based trading vs traditional indicators
  """

  def compare_models(symbol, candles) do
    physics_result = TradeEngine.Analytics.PhysicsBacktest.backtest(symbol, candles)

    case physics_result do
      {:ok, result} ->
        %{
          symbol: symbol,
          physics_model: result.metrics,
          strategy_comparison: %{
            physics_advantage: "Predictive peak pricing, momentum-based exits",
            traditional_advantage: "Simpler to understand, wider tooling",
            key_difference: "Physics uses gravity+momentum equations; Traditional uses MA/RSI"
          },
          recommendations: generate_recommendations(result.metrics)
        }

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp generate_recommendations(metrics) do
    cond do
      metrics.win_rate >= 55 and metrics.profit_factor > 1.5 ->
        ["✅ Model is PROFITABLE - Win rate: #{metrics.win_rate}%, PF: #{metrics.profit_factor}x"]

      metrics.win_rate >= 50 and metrics.profit_factor > 1.2 ->
        ["⚠️  Model is BREAKEVEN/SLIGHTLY PROFITABLE - Optimize entry thresholds"]

      metrics.win_rate < 50 or metrics.profit_factor < 1.0 ->
        [
          "❌ Model is UNPROFITABLE",
          "├─ Reduce position size",
          "├─ Increase min_trajectory_angle to >20°",
          "└─ Tighten stop loss to 1%"
        ]

      true ->
        ["📊 Insufficient data for recommendations"]
    end
  end
end