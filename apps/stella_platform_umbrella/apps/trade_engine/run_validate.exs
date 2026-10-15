# Validate signal generator changes across all assets
# Usage: cd apps/trade_engine && mix run --no-start run_validate.exs

Application.ensure_all_started(:postgrex)
Application.ensure_all_started(:ecto_sql)
Application.ensure_all_started(:telemetry)

{:ok, _} = TradeEngine.Repo.start_link([])

IO.puts("\n=== VALIDATING SIGNAL GENERATOR (6 assets, 12 months) ===\n")

symbols = ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"]

results = Enum.map(symbols, fn symbol ->
  IO.puts("\n--- #{symbol} ---")
  case TradeEngine.Analytics.PhysicsBacktest.run(symbol, months: 12) do
    {:ok, result} -> {symbol, result}
    {:error, reason} ->
      IO.puts("FAILED: #{inspect(reason)}")
      {symbol, nil}
  end
end)

IO.puts("\n\n========================================")
IO.puts("CROSS-ASSET SUMMARY")
IO.puts("========================================")

Enum.each(results, fn {symbol, result} ->
  if result do
    stats = result.stats
    IO.puts("#{symbol}: #{stats.total_trades} trades | WR: #{stats.win_rate}% | PF: #{stats.profit_factor} | Net: $#{stats.net_pnl}")
  end
end)

# Also export features for ML retraining
IO.puts("\n\nExporting features...")
case TradeEngine.Analytics.PhysicsBacktest.export_multi(symbols, months: 12, path: "priv/ml/features_all.csv") do
  {:ok, path, count} -> IO.puts("Exported #{count} trades → #{path}")
  {:error, reason} -> IO.puts("Export failed: #{inspect(reason)}")
end
