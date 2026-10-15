# Standalone backtest runner — starts only Repo, no HTTP listener
# Usage: cd apps/trade_engine && mix run run_backtest.exs

# Start just the Repo (no supervision tree / no Bandit)
{:ok, _} = TradeEngine.Repo.start_link([])

IO.puts("\n=== Starting Physics Backtest ===\n")

case TradeEngine.Analytics.PhysicsBacktest.run("ETHUSDT", months: 6) do
  {:ok, result} ->
    IO.puts("\n=== BACKTEST COMPLETE ===")

  {:error, reason} ->
    IO.puts("\n=== BACKTEST FAILED: #{inspect(reason)} ===")
end
