# File: apps/trade_engine/priv/scripts/start_integrated_trading.exs
# Integrated trading script with both long and short positions
# Run with: mix run apps/trade_engine/priv/scripts/start_integrated_trading.exs

require Logger

IO.puts("""
╔════════════════════════════════════════════════════════════════╗
║     INTEGRATED TRADING SYSTEM - 1000 USERS                     ║
║    Binance Testnet | Long + Margin Short Trading               ║
║         Dual-Direction Strategy with Risk Management           ║
╚════════════════════════════════════════════════════════════════╝
""")

alias TradeEngine.Orchestrator.AutomatedTrader
alias TradeEngine.Orchestrator.MarginShortTrader
alias TradeEngine.Orchestrator.BinanceClient
alias TradeEngine.Trading.PositionTracker

# Step 1: Test Binance Connection
IO.puts("\n🔗 Testing Binance Testnet Connection...")

case BinanceClient.test_connection() do
  {:ok, _} ->
    IO.puts("   ✅ Connected to Binance Testnet")

  {:error, reason} ->
    IO.puts("   ❌ Connection Failed: #{reason}")
    System.halt(1)
end

# Step 2: Initialize Traders
IO.puts("\n🤖 Initializing Trading Systems...")

case AutomatedTrader.start_link([]) do
  {:ok, _pid} ->
    IO.puts("   ✅ Long Trader Started")

  {:error, reason} ->
    IO.puts("   ❌ Failed to start long trader: #{reason}")
    System.halt(1)
end

case MarginShortTrader.start_link([]) do
  {:ok, _pid} ->
    IO.puts("   ✅ Short Trader Started")

  {:error, reason} ->
    IO.puts("   ❌ Failed to start short trader: #{reason}")
    System.halt(1)
end

# Step 3: Configuration Summary
IO.puts("""

📋 LONG TRADING (BULLISH):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENTRY SIGNALS:
  ✓ Bullish (Strong, Moderate, Weak)
  ✗ Neutral
  ✗ Bearish

POSITION SIZING:
  • Position Size: 10% of account balance
  • Risk Per Trade: 1%
  • Max Positions: 10 per symbol per user

EXIT STRATEGY:
  • Take Profit: +5%
  • Stop Loss: -2%
  • Time-Based Exit 1: Held >30m with 0% < profit < 5%
  • Time-Based Exit 2: Held >30m with no upside (profit ≤ 0%)
  • Time-Based Exit 3: Held >2h with minimal gains (0% < profit < 2%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 SHORT TRADING (BEARISH - CONSERVATIVE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENTRY SIGNALS (VERY STRICT):
  ✓ Bearish with >70% confidence
  ✓ Macro (1d/4h) must be BEARISH
  ✓ Intermediate (1h/30m) bearish or neutral
  ✓ Trigger (15m/5m/1m) should align
  ✗ Any bullish alignment = SKIP

POSITION SIZING:
  • Position Size: 5% of account balance (conservative)
  • Max Shorts: 1 per symbol per user
  • Margin Type: Cross Margin

EXIT STRATEGY:
  • Take Profit: -5% (price DOWN = profit)
  • Stop Loss: +2% (price UP = loss)
  • Time-Based Exit: Held >2 hours
  • Auto-Repay: On close order

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMON CONFIGURATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TRADING PAIRS:
  • BTC/USDT, ETH/USDT, SOL/USDT

EXECUTION:
  • Entry Interval: 60 seconds (check all users)
  • Exit Interval: 60 seconds (process all positions)
  • Users: 1000
  • Batching: 50 users per batch
  • Max Concurrent Batches: 2

ANALYSIS:
  • Multi-Timeframe: 1m, 5m, 15m, 30m, 1h, 4h, 1d
  • Strategy: Physics-based (velocity & acceleration)
  • Timeframe Weights:
    - Macro (1d/4h): 40%
    - Intermediate (1h/30m): 36%
    - Trigger (15m/5m/1m): 24%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

# Step 4: Get initial stats
IO.puts("\n📊 Checking Initial Account Status...")

case PositionTracker.get_all_accounts_stats() do
  {_account_stats, total_stats} ->
    IO.puts("""
    
    Initial Account Metrics:
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Active Accounts:        #{total_stats.total_accounts}
    Total Account Balance:  $#{Decimal.to_string(total_stats.total_account_balance)}
    Total Capital:          $#{Decimal.to_string(total_stats.total_account_balance)}
    Per-Account Average:    $#{Decimal.to_string(Decimal.div(total_stats.total_account_balance, total_stats.total_accounts))}
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    """)

  _ ->
    IO.puts("   ⚠️  Could not fetch initial stats")
end

# Step 5: Start Trading
IO.puts("🚀 Starting Integrated Trading System...\n")
AutomatedTrader.start_trading()
MarginShortTrader.start_shorting()

IO.puts("""
✅ INTEGRATED TRADING ACTIVE!

═══════════════════════════════════════════════════════════════════════════

📱 MONITORING COMMANDS (from IEx):

📊 Statistics:
  iex> AutomatedTrader.get_stats()
  iex> AutomatedTrader.get_trading_statistics()
  iex> MarginShortTrader.get_stats()

📈 Long Positions:
  iex> AutomatedTrader.get_stats()
  Output: %{
    status: "ACTIVE",
    total_orders: 245,
    total_profit: #Decimal<"1234.56">,
    uptime_seconds: 3600,
    recent_trades: [...]
  }

📉 Short Positions:
  iex> MarginShortTrader.get_stats()
  Output: %{
    status: "ACTIVE",
    total_shorts: 78,
    total_profit: #Decimal<"567.89">,
    uptime_seconds: 3600
  }

📈 Export Data:
  iex> user_id = "your-user-id"
  iex> csv = AutomatedTrader.export_user_transactions(user_id)
  iex> File.write!("transactions.csv", csv)

🛑 Controls:
  iex> AutomatedTrader.stop_trading()      # Stop long trading
  iex> MarginShortTrader.stop_shorting()   # Stop short trading

📋 View Logs:
  tail -f logs/trade_engine.log

═══════════════════════════════════════════════════════════════════════════

DUAL TRADING CYCLE (Every 60 seconds):

PHASE 1: Exit Management ✅
  ├─ Long Positions
  │  ├─ Check TP: +5% profit
  │  ├─ Check SL: -2% loss
  │  └─ Time exits: >30m or >2h conditions
  └─ Short Positions
     ├─ Check TP: -5% (price down)
     ├─ Check SL: +2% (price up)
     └─ Time exits: >2h hold

PHASE 2: Entry Analysis ✅
  ├─ Multi-Timeframe Analysis (7 timeframes)
  │  └─ Direction, Strength, Confidence calculation
  ├─ Long Entry Check
  │  └─ Bullish signals → Open positions (10% of account)
  └─ Short Entry Check
     └─ Strong bearish signals (>70% confidence) → Open shorts (5% of account)

PHASE 3: Position Management ✅
  ├─ Update P&L for all positions
  ├─ Aggregate account balances
  ├─ Calculate win rates
  └─ Log system statistics

═══════════════════════════════════════════════════════════════════════════

🎯 EXPECTED BEHAVIOR:

Initial (Minutes 0-5):
  • MTF Analysis on all pairs
  • Bullish signals detected → Long entries
  • Strong bearish signals detected → Short entries
  • Order validations
  • Position creation logging

Active (Minutes 5+):
  • Continuous cycle of entries & exits
  • Mixed long and short positions
  • Exits triggered by TP/SL/Time conditions
  • Account balances updated in real-time
  • Statistics aggregating for both strategies

Performance Targets:
  • Win Rate (Longs): 55-65%
  • Win Rate (Shorts): 50-60%
  • Average Hold Time: 15-30 minutes
  • Daily Expected ROI: 1-3% (combined)
  • Monthly Expected ROI: 15-30% (conservative)

═══════════════════════════════════════════════════════════════════════════

💰 Account Summary:
  • Total Users: 1000
  • Starting Capital: $5.5M
  • Per-User Average: $5,500
  
  Long Positions:
    • Size: 10% of balance per trade
    • Max Positions: 10 per user
    • Capital Deployed: 100% available for longs
  
  Short Positions:
    • Size: 5% of balance per trade
    • Max Positions: 1 per user (conservative)
    • Margin Required: 50-75% of position value

🚀 Session Started: #{DateTime.utc_now() |> DateTime.to_string()}

═══════════════════════════════════════════════════════════════════════════

📊 EXPECTED LOG OUTPUT:

[info] 🟢 BULLISH BTC/USDT for user_1@tradingapp.io: strong_bullish (85.3%)
[info] 💰 Order Calculation: BTCUSDT
[info] ✅ LIVE Order Placed! Order ID: 123456789
[info] 📊 MOCK Position Created | Qty: 0.01 BTC | Entry: $87,332.05

[info] 🔴 STRONG BEARISH ETH/USDT for user_2@tradingapp.io: strong_bearish (78.9%)
[info] 🩳 SHORT Order: ETHUSDT | Qty: 0.1 ETH | Entry: $2,450.00

[info] ✅ TP LONG: BTC/USDT | Entry: $87,332.05 | Exit: $91,698.65 | Profit: $436.60 (+5.00%)
[info] ✅ TP SHORT: ETH/USDT | Entry: $2,450.00 | Exit: $2,327.50 | Profit: $12.25 (-5.00%)

═══════════════════════════════════════════════════════════════════════════

To stop trading and see final statistics:
  iex> AutomatedTrader.stop_trading()
  iex> MarginShortTrader.stop_shorting()
  iex> AutomatedTrader.get_trading_statistics()

Press Ctrl+C to exit the script.

""")

# Step 6: Periodic logging (every 5 minutes)
spawn(fn ->
  Process.sleep(5 * 60 * 1000)

  loop_stats = fn ->
    case {
      AutomatedTrader.get_trading_statistics(),
      AutomatedTrader.get_stats()
    } do
      {{:ok, _account_stats, long_stats}, long_info} ->
        io_line = """

        ⏰ 5-MINUTE CHECKPOINT
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        📈 LONG POSITIONS:
        ├─ Open: #{long_stats.total_open_positions}
        ├─ Closed: #{long_stats.total_closed_positions}
        ├─ Total Orders: #{long_info.total_orders}
        └─ Session Profit: $#{Decimal.to_string(long_info.total_profit)}
        
        💰 ACCOUNT STATUS:
        ├─ Total Balance: $#{Decimal.to_string(long_stats.total_account_balance)}
        ├─ Unrealized P&L: $#{Decimal.to_string(long_stats.total_unrealized_pl)}
        ├─ Realized P&L: $#{Decimal.to_string(long_stats.total_realized_pl)}
        └─ Net P&L: $#{Decimal.to_string(Decimal.add(long_stats.total_unrealized_pl, long_stats.total_realized_pl))}
        
        📊 METRICS:
        ├─ Win Rate: #{Float.round(long_stats.average_win_rate, 1)}%
        ├─ Avg Hold Time: #{long_stats.average_hold_time}m
        └─ ROI: #{Float.round(Decimal.to_float(Decimal.div(Decimal.add(long_stats.total_unrealized_pl, long_stats.total_realized_pl), long_stats.total_account_balance)) * 100, 2)}%
        
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """
        IO.puts(io_line)

      _ ->
        IO.puts("   ⚠️  Stats unavailable")
    end
  end

  # Log stats every 5 minutes
  Stream.cycle([0])
  |> Stream.each(fn _ ->
    loop_stats.()
    Process.sleep(5 * 60 * 1000)
  end)
  |> Stream.run()
end)

# Keep script running
Process.sleep(:infinity)