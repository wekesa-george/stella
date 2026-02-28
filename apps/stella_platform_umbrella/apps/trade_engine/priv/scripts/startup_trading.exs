# Save this as: apps/trade_engine/priv/scripts/startup_trading.exs
# Run with: mix run apps/trade_engine/priv/scripts/startup_trading.exs

import Ecto.Query

IO.puts("\n" <> String.duplicate("=", 80))
IO.puts("🚀 TRADE ENGINE - STARTUP SCRIPT")
IO.puts(String.duplicate("=", 80) <> "\n")

# Step 1: Wait for application to be ready
IO.puts("⏳ Waiting for application to be ready...")
Process.sleep(2000)

# Step 2: Check Market Data Fetcher
IO.puts("\n📊 Market Data Fetcher Status:")
try do
  fetcher_state = :sys.get_state(TradeEngine.MarketData.Fetcher)
  pairs_count = length(Map.get(fetcher_state, :trading_pairs, []))
  IO.puts("   ✅ Fetcher is running")
  IO.puts("   📋 Trading pairs loaded: #{pairs_count}")
rescue
  _ ->
    IO.puts("   ⚠️  Fetcher not responding (may still be initializing)")
end

Process.sleep(1000)

# Step 3: Check trading accounts
IO.puts("\n💰 Checking Trading Accounts:")
account_count = TradeEngine.Repo.aggregate(
  from(a in TradeEngine.Accounts.TradingAccount),
  :count,
  :id
)
IO.puts("   ✅ Found #{account_count} trading accounts")

if account_count == 0 do
  IO.puts("   ⚠️  WARNING: No trading accounts! System won't execute trades.")
end

# Show sample account balances
if account_count > 0 do
  sample_accounts = TradeEngine.Repo.all(
    from a in TradeEngine.Accounts.TradingAccount,
    limit: 3,
    preload: [:user]
  )
  
  IO.puts("\n   Sample accounts:")
  Enum.each(sample_accounts, fn acc ->
    IO.puts("      • #{acc.user.email}: $#{Decimal.to_string(acc.available_balance)}")
  end)
end

Process.sleep(1000)

# Step 4: Start Automated Trader (Long/Bullish)
IO.puts("\n🟢 Starting AutomatedTrader (Bullish/Long)...")
try do
  TradeEngine.Orchestrator.AutomatedTrader.start_trading()
  IO.puts("   ✅ AutomatedTrader started")
  Process.sleep(1000)
  
  stats = TradeEngine.Orchestrator.AutomatedTrader.get_stats()
  IO.puts("      Status: #{stats.status}")
  IO.puts("      Pairs: #{stats.trading_pairs_count}")
rescue
  e ->
    IO.puts("   ❌ Failed to start AutomatedTrader: #{inspect(e)}")
end

Process.sleep(1000)

# Step 5: Start Margin Short Trader (Bearish/Short)
IO.puts("\n🔴 Starting MarginShortTrader (Bearish/Short)...")
try do
  TradeEngine.Orchestrator.MarginShortTrader.start_shorting()
  IO.puts("   ✅ MarginShortTrader started")
  Process.sleep(1000)
  
  stats = TradeEngine.Orchestrator.MarginShortTrader.get_stats()
  IO.puts("      Active: #{stats.shorting_active}")
  IO.puts("      Pairs: #{stats.trading_pairs_count}")
rescue
  e ->
    IO.puts("   ❌ Failed to start MarginShortTrader: #{inspect(e)}")
end

Process.sleep(1000)

# Step 6: Display startup summary
IO.puts("\n" <> String.duplicate("=", 80))
IO.puts("✅ STARTUP COMPLETE")
IO.puts(String.duplicate("=", 80))

long_stats = TradeEngine.Orchestrator.AutomatedTrader.get_stats()
short_stats = TradeEngine.Orchestrator.MarginShortTrader.get_stats()

long_status = case long_stats.status do
  "ACTIVE" -> "🟢 ACTIVE"
  _ -> "🔴 INACTIVE"
end

short_status = if short_stats.shorting_active do
  "🟢 ACTIVE"
else
  "🔴 INACTIVE"
end

IO.puts("""

📈 SYSTEM STATUS:
   • Market Data Fetcher: Running (#{long_stats.trading_pairs_count} pairs)
   • AutomatedTrader: #{long_status}
   • MarginShortTrader: #{short_status}

🔍 MONITORING COMMANDS (in iex):

   # View trading status
   TradeEngine.Orchestrator.AutomatedTrader.get_stats()
   TradeEngine.Orchestrator.MarginShortTrader.get_stats()

   # View open positions
   import Ecto.Query
   TradeEngine.Repo.all(
     from p in TradeEngine.Trading.Position,
     where: p.status == "open",
     order_by: [desc: p.entry_time],
     limit: 20
   ) |> Enum.each(fn p ->
     IO.puts("\#{p.symbol}: \#{Decimal.to_string(p.quantity)} @ $\#{Decimal.to_string(p.entry_price)}")
   end)

   # View closed positions (today's trades)
   today = Date.utc_today()
   TradeEngine.Repo.all(
     from p in TradeEngine.Trading.Position,
     where: p.status == "closed" and 
            fragment("DATE(?)", p.exit_time) == ^today,
     order_by: [desc: p.exit_time],
     limit: 20
   )

   # View aggregate stats
   TradeEngine.Orchestrator.AutomatedTrader.get_trading_statistics()

⏹️  STOP TRADING (if needed):
   TradeEngine.Orchestrator.AutomatedTrader.stop_trading()
   TradeEngine.Orchestrator.MarginShortTrader.stop_shorting()

""")

IO.puts(String.duplicate("=", 80) <> "\n")