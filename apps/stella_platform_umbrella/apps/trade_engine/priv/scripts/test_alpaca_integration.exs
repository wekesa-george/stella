# test_alpaca_integration.exs
# Run with: iex -S mix run apps/trade_engine/priv/scripts/test_alpaca_integration.exs

require Logger

# ========== HELPER FUNCTIONS ==========

defmodule AlpacaTestHelper do
  # Convert string or number to float
  def parse_numeric(value) when is_float(value), do: value
  def parse_numeric(value) when is_integer(value), do: Float.to_string(value) |> String.to_float()
  def parse_numeric(value) when is_binary(value) do
    case Float.parse(value) do
      {num, _} -> num
      :error -> 0.0
    end
  end
  def parse_numeric(_), do: 0.0
end

Logger.info("🧪 Testing Alpaca Paper Trading Integration...")

# ========== 1. TEST CONNECTION ==========
Logger.info("\n1️⃣  Testing Alpaca Connection...")

case TradeEngine.Orchestrator.Alpaca.Client.test_connection() do
  {:ok, account} ->
    Logger.info("✅ Connection successful!")
    Logger.info("   Account Number: #{account["account_number"]}")
    Logger.info("   Status: #{account["status"]}")
    
    buying_power = AlpacaTestHelper.parse_numeric(account["buying_power"])
    cash = AlpacaTestHelper.parse_numeric(account["cash"])
    
    Logger.info("   Buying Power: $#{Float.round(buying_power, 2)}")
    Logger.info("   Cash: $#{Float.round(cash, 2)}")
  
  {:error, reason} ->
    Logger.error("❌ Connection failed: #{inspect(reason)}")
    Logger.error("⚠️  Check ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables")
    System.halt(1)
end

# ========== 2. TEST SYMBOL NORMALIZATION ==========
Logger.info("\n2️⃣  Testing Symbol Normalization...")

test_symbols = [
  {"BTC", "BTCUSD"},
  {"BTCUSD", "BTCUSD"},
  {"BTC/USD", "BTCUSD"},
  {"ETH", "ETHUSD"},
  {"ETHUSD", "ETHUSD"},
  {"eth/usd", "ETHUSD"}
]

Enum.each(test_symbols, fn {input, expected} ->
  result = TradeEngine.Orchestrator.Alpaca.Client.normalize_symbol(input)
  status = if result == expected, do: "✅", else: "❌"
  Logger.info("   #{status} #{input} → #{result} (expected: #{expected})")
end)

# ========== 3. TEST MARKET ORDERS (PAPER ONLY - DRY RUN) ==========
Logger.info("\n3️⃣  Testing Market Order Placement (DRY RUN)...")
Logger.warning("   ⚠️  This will place a REAL order on paper account!")
Logger.warning("   Sleeping 3 seconds... Press Ctrl+C to cancel")
Process.sleep(3_000)

case TradeEngine.Orchestrator.Alpaca.Client.place_market_order("ETHUSD", "buy", 0.01) do
  {:ok, order} ->
    Logger.info("✅ Market order placed successfully!")
    Logger.info("   Order ID: #{order["id"]}")
    Logger.info("   Symbol: #{order["symbol"]}")
    Logger.info("   Side: #{order["side"]}")
    Logger.info("   Qty: #{order["qty"]}")
    Logger.info("   Type: #{order["order_type"]}")
    Logger.info("   Status: #{order["status"]}")
  
  {:error, reason} ->
    Logger.warning("⚠️  Market order failed: #{inspect(reason)}")
    Logger.info("   (This might be due to market hours or order sizing)")
end

# ========== 4. TEST SECOND MARKET ORDER (DIFFERENT PAIR) ==========
Logger.info("\n4️⃣  Testing Another Market Order (BTCUSD)...")
Logger.warning("   ⚠️  This will place a REAL order on paper account!")
Logger.warning("   Sleeping 3 seconds... Press Ctrl+C to cancel")
Process.sleep(3_000)

case TradeEngine.Orchestrator.Alpaca.Client.place_market_order("BTCUSD", "buy", 0.001) do
  {:ok, order} ->
    Logger.info("✅ Market order placed successfully!")
    Logger.info("   Order ID: #{order["id"]}")
    Logger.info("   Symbol: #{order["symbol"]}")
    Logger.info("   Side: #{order["side"]}")
    Logger.info("   Qty: #{order["qty"]}")
    Logger.info("   Status: #{order["status"]}")
  
  {:error, reason} ->
    Logger.warning("⚠️  Market order failed: #{inspect(reason)}")
end

# ========== 5. TEST GET POSITIONS ==========
Logger.info("\n5️⃣  Fetching Open Positions...")

case TradeEngine.Orchestrator.Alpaca.Client.get_positions() do
  {:ok, positions} ->
    if Enum.empty?(positions) do
      Logger.info("✅ No open positions")
    else
      Logger.info("✅ Found #{length(positions)} open position(s):")
      
      Enum.each(positions, fn pos ->
        qty = AlpacaTestHelper.parse_numeric(pos["qty"])
        avg_price = AlpacaTestHelper.parse_numeric(pos["avg_fill_price"])
        current_price = AlpacaTestHelper.parse_numeric(pos["current_price"])
        unrealized_pl = AlpacaTestHelper.parse_numeric(pos["unrealized_pl"])
        
        Logger.info("   • #{pos["symbol"]}")
        Logger.info("     Qty: #{Float.round(qty, 4)}")
        Logger.info("     Entry Price: $#{Float.round(avg_price, 2)}")
        Logger.info("     Current Price: $#{Float.round(current_price, 2)}")
        Logger.info("     P&L: $#{Float.round(unrealized_pl, 2)}")
      end)
    end
  
  {:error, reason} ->
    Logger.error("❌ Failed to fetch positions: #{inspect(reason)}")
end

# ========== 6. TEST ACCOUNT BALANCE COMMAND ==========
Logger.info("\n6️⃣  Testing Account Balance Check...")

TradeEngine.Orchestrator.AutomatedTrader.check_account()

# ========== 7. SUMMARY ==========
Logger.info("\n" <> String.duplicate("=", 70))
Logger.info("✅ INTEGRATION TESTS COMPLETE")
Logger.info(String.duplicate("=", 70))

Logger.info("""

🚀 NEXT STEPS:

1. View all paper trades at: https://app.alpaca.markets
   - Switch to "Paper Trading" mode
   - Login with your Alpaca account

2. Start automated trading:
   iex(1)> TradeEngine.Orchestrator.AutomatedTrader.start_trading()

3. Monitor trading stats:
   iex(1)> TradeEngine.Orchestrator.AutomatedTrader.get_stats()

4. Stop trading:
   iex(1)> TradeEngine.Orchestrator.AutomatedTrader.stop_trading()

⚠️  IMPORTANT:
   - Paper account has 24/7 crypto trading
   - USD pairs only (no USDT)
   - Market orders used for crypto (bracket orders not supported)
   - Minimum order value: $10
   - Always verify positions on dashboard

""")