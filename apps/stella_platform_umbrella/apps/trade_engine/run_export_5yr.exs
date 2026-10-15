# Export ML features for all assets — 5 years
# Uses prod DB directly since ohlcv_5m table only exists there
# Usage: cd apps/trade_engine && mix run --no-start run_export_5yr.exs

Application.ensure_all_started(:postgrex)
Application.ensure_all_started(:ecto_sql)
Application.ensure_all_started(:telemetry)

# Connect to PROD DB directly (ohlcv_5m only exists there)
{:ok, _} = TradeEngine.Repo.start_link(
  hostname: "88.216.70.194",
  port: 6786,
  username: "postgres",
  password: "REDACTED",
  database: "stella_platform_new"
)

IO.puts("\n=== Exporting ML Features (6 assets, 60 months / 5 years) ===\n")

symbols = ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"]

# Export per-asset files for individual analysis
Enum.each(symbols, fn symbol ->
  IO.puts("--- #{symbol} ---")
  case TradeEngine.Analytics.PhysicsBacktest.export_features(symbol,
    months: 60,
    path: "priv/ml/features_#{String.downcase(symbol)}.csv"
  ) do
    {:ok, path, count} ->
      IO.puts("  #{count} trades → #{path}")
    {:error, reason} ->
      IO.puts("  FAILED: #{inspect(reason)}")
  end
end)

# Export combined file
IO.puts("\n--- Combined export ---")
case TradeEngine.Analytics.PhysicsBacktest.export_multi(symbols,
  months: 60,
  path: "priv/ml/features_all_5yr.csv"
) do
  {:ok, path, count} ->
    IO.puts("\n=== EXPORT COMPLETE: #{count} trades → #{path} ===")
  {:error, reason} ->
    IO.puts("\n=== EXPORT FAILED: #{inspect(reason)} ===")
end
