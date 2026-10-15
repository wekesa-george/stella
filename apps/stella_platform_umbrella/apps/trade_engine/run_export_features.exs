# Export ML features for all assets — 12 months
# Usage: cd apps/trade_engine && mix run --no-start run_export_features.exs

Application.ensure_all_started(:postgrex)
Application.ensure_all_started(:ecto_sql)
Application.ensure_all_started(:telemetry)

{:ok, _} = TradeEngine.Repo.start_link([])

IO.puts("\n=== Exporting ML Features (6 assets, 12 months) ===\n")

case TradeEngine.Analytics.PhysicsBacktest.export_multi(
       ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"],
       months: 12,
       path: "priv/ml/features_all.csv"
     ) do
  {:ok, path, count} ->
    IO.puts("\n=== EXPORT COMPLETE: #{count} trades → #{path} ===")

  {:error, reason} ->
    IO.puts("\n=== EXPORT FAILED: #{inspect(reason)} ===")
end
