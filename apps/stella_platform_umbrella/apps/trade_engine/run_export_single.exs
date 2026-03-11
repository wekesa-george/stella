# Export ML features for a single asset — 5 years
# Usage: cd apps/trade_engine && SYMBOL=ETHUSDT mix run --no-start run_export_single.exs

Application.ensure_all_started(:postgrex)
Application.ensure_all_started(:ecto_sql)
Application.ensure_all_started(:telemetry)

symbol = System.get_env("SYMBOL") || raise "Set SYMBOL env var"

# Connect to PROD DB (ohlcv_5m only exists there)
{:ok, _} = TradeEngine.Repo.start_link(
  hostname: "88.216.70.194",
  port: 6786,
  username: "postgres",
  password: "REDACTED",
  database: "stella_platform_new"
)

IO.puts("Exporting #{symbol} (60 months)...")

case TradeEngine.Analytics.PhysicsBacktest.export_features(symbol,
  months: 60,
  path: "priv/ml/features_#{String.downcase(symbol)}.csv"
) do
  {:ok, path, count} ->
    IO.puts("DONE: #{symbol} → #{count} trades → #{path}")
  {:error, reason} ->
    IO.puts("FAILED: #{symbol} → #{inspect(reason)}")
end
