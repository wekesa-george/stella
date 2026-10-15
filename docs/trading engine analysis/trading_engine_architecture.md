# Trading Engine Architecture - How It Works

## TL;DR
**This is a physics-based AI trading bot that:**
1. Watches cryptocurrency prices in real-time (Binance WebSocket)
2. Uses physics equations (momentum, gravity, projectile motion) to predict price movements
3. Generates trading signals when it detects opportunities
4. Automatically executes trades on Binance Testnet
5. Manages positions and calculates P&L

**Strategy:** "Impulse Scalping" - Capture quick 5-minute price moves for $0.50-$1 profit per trade

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 TradeEngine.Application                         │
│                 (Supervision Tree)                              │
└───────┬─────────────────────────────────────────────────────────┘
        │
        ├─── Phoenix.PubSub (Message Bus)
        │    • ticker:SYMBOL - Real-time prices
        │    • candle_closed:5m - 5-min candle completion triggers
        │    • signals:SYMBOL - Trading signals
        │
        ├─── TradeEngine.Repo (Database - Ecto)
        │
        ├─── Binance WebSocket Infrastructure
        │    ├─── RateLimiter (API request throttling)
        │    ├─── StreamSupervisor
        │    │    ├─── TickerStream (price updates)
        │    │    ├─── KlineStream (candlesticks)
        │    │    └─── DepthStream (order book)
        │    └─── TestnetExecutor (places orders)
        │
        ├─── AI & Analytics Layer
        │    ├─── Physics.SignalGenerator (generates signals)
        │    ├─── Physics.MarketProjectile (predicts using physics)
        │    ├─── Physics.PredictionTracker (tracks accuracy)
        │    └─── AI.Supervisor (ML models)
        │
        ├─── Trading Orchestration
        │    ├─── SignalTrader (main bot - listens for signals)
        │    ├─── PositionManager (updates P&L for 31k positions)
        │    └─── VirtualBalanceManager (risk management)
        │
        └─── Risk Management
             ├─── AssetTierManager (classifies assets by price)
             └─── RiskLimits (per-user limits)
```

---

## Trading Flow: From Signal to Execution

### Phase 1: Market Data Collection

```
Binance Exchange (Real-time)
    ↓
WebSocket Streams
    ↓
TickerStream Process
    ↓
Phoenix.PubSub.broadcast("ticker:BTCUSDT", %{price: 98543.21})
```

**Key Files:**
- `/lib/trade_engine/exchanges/binance/ticker_stream.ex`
- `/lib/trade_engine/exchanges/binance/kline_stream.ex`

### Phase 2: Signal Generation (Every 5 minutes)

```
candle_closed:5m event
    ↓
SignalTrader.handle_info({:candle_closed, symbol, candles})
    ↓
Physics.MarketProjectile.analyze_projectile(candles)
    • Calculates momentum = velocity × mass
    • Calculates gravity (resistance)
    • Predicts peak price (P1) at 5 minutes
    • Predicts trajectory angle
    • Estimates kinetic energy
    ↓
Physics.SignalGenerator.generate_signal(candles, symbol)
    • Determines direction (LONG/SHORT)
    • Calculates confidence (0-100%)
    • Sets entry_price, stop_loss, take_profit
    ↓
Returns %{
  symbol: "BTCUSDT",
  direction: :long,
  confidence: 75,
  current_price: 98543.21,
  entry_price: 98545.00,
  stop_loss: 98400.00,
  take_profit: 98650.00,  # P1 (5-min target)
  physics: %{
    momentum: 1234.56,
    peak_time: 5,  # minutes
    peak_price: 98650.00
  }
}
```

**Key Files:**
- `/lib/trade_engine/physics/market_projectile.ex`
- `/lib/trade_engine/physics/signal_generator.ex`

### Phase 3: Trade Decision & Execution

```
SignalTrader receives signal
    ↓
Filter by confidence
  • LONG: requires >= 55% confidence
  • SHORT: requires >= 60% confidence
    ↓
Calculate position size
  • Target: $0.50 profit per trade
  • Formula: qty = $0.50 / (peak_price - current_price)
  • Min notional: $12 (Binance requirement)
    ↓
Check risk limits
  • Max 3 positions per user
  • Virtual balance check
  • Asset tier classification
    ↓
Execute on Binance Testnet
  Binance.TestnetExecutor.place_order(%{
    symbol: "BTCUSDT",
    side: "BUY",
    type: "MARKET",
    quantity: 0.001234
  })
    ↓
Create database record
  INSERT INTO trading_positions (
    symbol, entry_price, quantity,
    momentum, peak_price, peak_time,
    ...
  )
    ↓
Create transaction record
  INSERT INTO trading_transactions (
    transaction_type: "spot_buy",
    symbol: "BTCUSDT",
    quantity: 0.001234,
    price: 98545.00,
    ...
  )
```

**Key Files:**
- `/lib/orchestrator/signal_trader.ex` (lines 1-150)
- `/lib/trade_engine/exchanges/binance/testnet_executor.ex`

### Phase 4: Position Monitoring & Exit

```
PositionManager (runs every 60 seconds)
    ↓
Fetch open positions (up to 500 most recent)
  SELECT * FROM trading_positions
  WHERE status = 'open'
  ORDER BY inserted_at DESC
  LIMIT 500
    ↓
For each position:
  • Fetch current price from cache
  • Calculate unrealized P&L
  • Check exit conditions:
    ✓ Hit take_profit (P1)
    ✓ Hit stop_loss
    ✓ Exceeded 5-minute hold time
    ✓ Confidence dropped
    ↓
If exit condition met:
  • Execute SELL order on Binance
  • Update position: status = 'closed'
  • Calculate realized P&L
  • Record exit transaction
```

**Key Files:**
- `/lib/trading/position_manager.ex`
- `/lib/trading/exit_signals.ex`

---

## Key Components Explained

### 1. SignalTrader (Main Bot)
**File:** `/lib/orchestrator/signal_trader.ex`

**Role:** Core trading bot that executes the "Impulse Scalping" strategy

**Configuration:**
```elixir
@target_profit_usd 0.50       # Target $0.50 per trade
@min_impulse_pct 0.001        # Min 0.1% price move
@max_hold_minutes 5           # Exit after 5 minutes
@min_confidence_long 55       # 55% confidence for LONG
@min_confidence_short 60      # 60% confidence for SHORT
```

**Listens to:**
- `candle_closed:5m` - Triggers signal generation every 5 minutes
- `candle_closed:15m` - Additional timeframe analysis

**Trading Assets:**
- Cheap coins like DOGE, ADA, XRP (< $1)
- Medium coins like LINK, AVAX ($1-20)
- Goal: Enable trading with small $100 accounts

### 2. Physics.MarketProjectile
**File:** `/lib/trade_engine/physics/market_projectile.ex`

**Role:** Treats price movements as physics projectiles

**Physics Model:**
```
Price(t) = P0 + V0×t - (1/2)×g×t²

Where:
  P0 = Current price (initial position)
  V0 = Momentum (initial velocity)
  g  = Gravity (market resistance/drag)
  t  = Time in minutes

Predictions:
  • P1 (5min):  Peak of impulse
  • P2 (15min): Decay phase
  • P3 (30min): Exhaustion
```

**Why Physics?**
- Markets exhibit momentum (like thrown objects)
- Resistance/support acts like gravity
- Volume acts like mass
- Energy conservation principles apply

### 3. PositionManager
**File:** `/lib/trading/position_manager.ex`

**Role:** Updates P&L for all open positions

**Challenge:** 31,468 positions in database!

**Solution (v2 - Aggressive Optimization):**
```elixir
@update_interval_ms 60_000       # Update every 60 seconds
@max_positions_per_cycle 500     # Only update 500 most recent
@batch_size 50                   # 50 positions per SQL batch
@price_change_threshold 0.0001   # Skip if price < 0.01% change
```

**Optimization:** Single SQL UPDATE statement per batch instead of individual updates

### 4. VirtualBalanceManager
**File:** `/lib/risk/virtual_balance_manager.ex`

**Role:** Risk management without real account integration

**Why?**
- `trading_accounts` table is unused (all test data)
- Bot trades independently without user accounts
- Tracks virtual balances in-memory

### 5. Binance.TestnetExecutor
**File:** `/lib/trade_engine/exchanges/binance/testnet_executor.ex`

**Role:** Places real orders on Binance Testnet

**Features:**
- Signs requests with API key/secret
- Handles rate limiting
- Validates min notional ($10)
- Parses order responses

---

## Database Usage Patterns

### Tables ACTIVELY Used:

1. **`trading_positions` (31,468 rows)** ✅
   - **Created:** When bot opens position after signal
   - **Updated:** Every 60 seconds by PositionManager (P&L updates)
   - **Closed:** When exit condition met (take_profit/stop_loss/timeout)

2. **`trading_transactions` (2,197 rows)** ✅
   - **Created:** On every BUY/SELL execution
   - **Types:** spot_buy, spot_sell, simulated_short, simulated_cover
   - **Never updated** - append-only log

3. **`predictions` (6,903 rows)** ✅
   - **Created:** By Physics.SignalGenerator for each signal
   - **Contains:** P1/P2/P3 predictions, confidence, physics data
   - **Used by:** PredictionTracker to evaluate accuracy

### Tables NOT Used:

- ❌ `trading_accounts` - All seed data, never touched
- ❌ `users` - Test users, bot doesn't authenticate
- ❌ `kyc_records` - Test data
- ❌ `risk_limits` - Unused (virtual balance used instead)
- ❌ `trading_orders` - Empty table

---

## Trading Strategy: "Impulse Scalping"

### Core Principle:
**Capture the FIRST 5 minutes of a price move (the impulse), not the full trajectory**

```
Physics Insight:
─────────────────────────────────────────────
Time    | Impulse | Status
─────────────────────────────────────────────
0-5min  | MAX     | ← WE TRADE THIS
5-15min | Decayed | ← Too late
15-30min| Exhaust | ← Risk too high
─────────────────────────────────────────────
```

### Execution:
1. **Signal detected:** P0 (current) → P1 (5-min target)
2. **Calculate move:** impulse_size = |P1 - P0|
3. **Size position:** qty = $0.50 / impulse_size
4. **Enter:** Market BUY at P0
5. **Exit:** Limit SELL at P1 OR after 5 minutes

### Stop Loss:
- Golden Ratio: SL = P0 - (impulse × 0.618)
- Physics-aligned risk management

### Example Trade:
```
Signal: DOGEUSDT
  P0 (current):  $0.1000
  P1 (5-min):    $0.1015  (1.5% move)
  Impulse:       $0.0015

Position Size:
  Target $0.50 profit
  Qty = $0.50 / $0.0015 = 333 DOGE
  Cost = 333 × $0.1000 = $33.30

Exit:
  SELL at P1 ($0.1015) after 5 minutes
  Revenue = 333 × $0.1015 = $33.80
  Profit = $0.50 ✅
```

---

## Performance Metrics (From Database)

```sql
SELECT
    COUNT(*) as total_positions,
    COUNT(*) FILTER (WHERE status = 'open') as open,
    COUNT(*) FILTER (WHERE status = 'closed') as closed,
    COUNT(*) FILTER (WHERE profit_loss > 0) as winners,
    COUNT(*) FILTER (WHERE profit_loss < 0) as losers
FROM trading_positions;

Results:
- Total: 31,468 positions
- Created: Nov 27 - Dec 6 (10 days)
- Average: 3,147 positions/day
- Traded assets: 30+ symbols
```

**Transaction Breakdown:**
```sql
SELECT transaction_type, COUNT(*)
FROM trading_transactions
GROUP BY transaction_type;

Results:
- spot_buy: 1,982 (90%)
- simulated_short: 75
- simulated_cover: 72
- spot_sell: 68
```

---

## Key Insights

### 1. Bot Operates Independently
- **No user authentication** - Bot runs autonomously
- **No account balance tracking** - Uses virtual balances
- **Test mode** - All trades on Binance Testnet
- **Fully automated** - Starts on app boot

### 2. Physics-Based AI
- **Not traditional TA** - No RSI, MACD, moving averages
- **Physics equations** - Momentum, gravity, kinetic energy
- **Projectile motion** - Treats prices like thrown objects
- **Energy conservation** - Predicts exhaustion points

### 3. High-Frequency Scalping
- **Short hold times** - Max 5 minutes per trade
- **Small profits** - Target $0.50 per trade
- **High volume** - 3,000+ trades/day
- **Cheap assets** - Focus on sub-$1 coins

### 4. Database Bottleneck
- **31k positions** - Updating all is impossible
- **Optimization v2** - Only update 500 most recent
- **Batch SQL** - Single UPDATE per 50 positions
- **Price caching** - Avoid repeated queries

---

## Configuration

**Enable Trading:**
```elixir
# In config.exs
config :trade_engine,
  enable_websocket_streams: true,     # Binance WebSocket
  binance_testnet: true,              # Use testnet
  auto_start_long: true,              # Auto-start bot
  startup_delay_ms: 15_000            # Wait 15s for data
```

**API Keys:**
```bash
export BINANCE_API_KEY="your_testnet_key"
export BINANCE_API_SECRET="your_testnet_secret"
```

**Start Trading:**
```elixir
# Automatic on app start, or manually:
TradeEngine.Orchestrator.SignalTrader.start_trading()

# Check stats:
TradeEngine.Orchestrator.SignalTrader.get_stats()

# Stop:
TradeEngine.Orchestrator.SignalTrader.stop_trading()
```

---

## Summary

**The trading engine is a sophisticated physics-based AI trading bot that:**

✅ Uses real-time market data (Binance WebSocket)
✅ Applies physics equations to predict price movements
✅ Generates high-confidence trading signals
✅ Executes trades automatically on Binance Testnet
✅ Manages 31,000+ positions with optimized batch updates
✅ Targets small, quick profits ($0.50 in 5 minutes)
✅ Operates completely autonomously without user accounts

**Core Innovation:** Treating cryptocurrency prices as physics projectiles with momentum, gravity, and energy - enabling predictive trading based on fundamental motion laws rather than traditional technical analysis.
