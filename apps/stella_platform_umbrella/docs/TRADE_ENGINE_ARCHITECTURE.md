# Stella Trade Engine — Architecture & Bot Trading Flow

## Overview

The Stella Trade Engine is an Elixir Phoenix umbrella application that runs automated cryptocurrency trading bots. It consists of two OTP apps:

- **trade_engine** — Trading core: bots, strategies, exchanges, risk management, market data
- **admin_gateway** — Phoenix 1.8 WebSocket gateway with JWT authentication and 7 real-time channels

The engine runs on the BEAM VM, leveraging GenServers for concurrent bot processes, ETS for low-latency in-process caching, and Phoenix PubSub for real-time event broadcasting.

---

## Supervision Tree

The application starts ~28 supervised processes in a `:one_for_one` strategy (sibling failures are isolated):

```
TradeEngine.Application
├── Phoenix.PubSub (TradeEngine.PubSub)
├── TradeEngine.Repo (Ecto — remote PostgreSQL)
│
├── Binance WebSocket Infrastructure
│   ├── RateLimiter
│   └── StreamSupervisor
│       ├── CacheManager (creates ETS tables)
│       ├── TickerStream (24h mini-ticker WebSocket)
│       ├── KlineStreamPool (DynamicSupervisor — per-symbol candle streams)
│       ├── DepthStreamPool (DynamicSupervisor — order book streams)
│       └── StreamCoordinator
│
├── Trading Core
│   ├── SignalTrader (entry/exit signal routing)
│   ├── VirtualBalanceManager (Stella One pool capital)
│   ├── CandleBridge (routes candle closes → strategies)
│   ├── PositionManager (bulk DB position updates, 500/cycle)
│   ├── PositionPnLManager (real-time P&L, 1s tick)
│   ├── PositionCloseManager (exit signal detection, 5s tick)
│   ├── StaleOrderCanceller (hung orders, 30s tick)
│   ├── CapitalAllocator (virtual balance allocation)
│   ├── BotSupervisor (DynamicSupervisor for BotTradingProcess instances)
│   └── BotRegistry (ETS :bot_registry + DB sync)
│
├── Monitoring & Risk
│   ├── Infra.Monitor (BEAM/DB metrics, 4s → :infra_metrics_cache)
│   ├── PlatformStatsAggregator (KPIs, 60s → :platform_stats_cache)
│   ├── ExchangeHealthMonitor (30s → :exchange_health_cache)
│   ├── ServiceHealthMonitor (→ :service_health_cache)
│   ├── HeartbeatTracker (stale bot detection, >60s = error)
│   └── RiskMonitor (drawdown/daily loss enforcement, 60s)
│
├── Alerting
│   ├── AlertPersister (event-driven normalization + re-broadcast)
│   ├── NotificationDispatcher
│   ├── IncidentManager
│   └── BotLogPersister (structured logging → trading.bot_logs)
│
├── Market Data
│   ├── CandlePersister (ETS → TimescaleDB ohlcv_*)
│   └── BacktestManager (queue → VectorBT worker)
│
└── HTTP API (Bandit on port 4002)
```

---

## ETS Cache Architecture

The engine uses 14 ETS tables for sub-millisecond data access. No Redis — everything is in-process.

| Cache | Writer | Reader(s) | Purpose |
|-------|--------|-----------|---------|
| `:bot_registry` | BotRegistry | Channels, API, RiskMonitor | Bot runtime state |
| `:position_pnl_cache` | PositionPnLManager (1s) | PositionChannel | Per-position unrealized P&L |
| `:infra_metrics_cache` | Infra.Monitor (4s) | InfraChannel | BEAM memory, schedulers, DB pool |
| `:platform_stats_cache` | PlatformStatsAggregator (60s) | PlatformChannel | Platform KPIs |
| `:exchange_health_cache` | ExchangeHealthMonitor (30s) | InfraChannel | Exchange WS/API status |
| `:service_health_cache` | ServiceHealthMonitor | InfraChannel | Service health checks |
| `:binance_ticker_cache` | TickerStream | PositionPnLManager, Channels | Latest 24h ticker data |
| `:binance_price_cache` | TickerStream | Executor, PnL, Channels | Simple symbol→price lookup |
| `:binance_candle_cache` | KlineStream | Strategies, CandleBridge | Last 20 candles per symbol/timeframe |
| `:binance_orderbook_cache` | DepthStream | Order flow analysis | Top-of-book bids/asks |
| `:virtual_balances` | VirtualBalanceManager | BotTradingProcess | User virtual capital |
| `:capital_allocations` | CapitalAllocator | BotTradingProcess | Capital allocations per bot |
| `:executor_credential_cache` | Executor (5m TTL) | Executor | Resolved exchange credentials |
| `:price_cache` | PriceCache | Multi-exchange lookups | Unified price cache |

---

## Bot Lifecycle

### State Machine (FSM)

```
                    ┌──────────────┐
                    │ initializing │
                    └──────┬───────┘
                           │ start_bot()
                    ┌──────▼───────┐
              ┌─────│   running    │─────┐
              │     └──────┬───────┘     │
              │            │             │
        pause_bot()   stop_bot()   heartbeat timeout
              │            │         (>60s) or error
       ┌──────▼──┐  ┌──────▼───┐  ┌──────▼──────┐
       │ paused  │  │ stopping │  │   error      │
       └─────────┘  └──────┬───┘  └──────────────┘
                           │
                    ┌──────▼───────┐
                    │   stopped    │
                    └──────────────┘
```

Additional states: `circuit_broken` (risk limit breach), `maintenance` (manual).

### Bot Creation

```
API Request (or WebSocket command)
  │
  ▼
BotRegistry.register_bot(user_id, %{
  name: "ETH Momentum Bot",
  strategy_id: "uuid",           # → strategy.strategies row
  credential_id: "uuid",         # → exchange.user_credentials row
  trading_pairs: ["ETHUSDT"],
  config: %{...},                # Strategy config overrides
  allocated_capital: 1000.0,
  risk_overrides: %{...}
})
  │
  ├─ Insert into trading.bots (status: "initializing")
  ├─ Insert into :bot_registry ETS
  └─ Schedule start_bot() after 200ms
```

### Bot Startup (5-Step Initialization)

```
BotRegistry.start_bot(bot_id)
  │
  ├─ FSM: initializing → running
  ├─ BotSupervisor.start_trading_process(bot_id)
  │   │
  │   ▼
  │ BotTradingProcess.init(bot_id)
  │   │
  │   ├─ Step 1: "validating_credentials"
  │   │   └─ Verify credential_id exists and adapter is configured
  │   │
  │   ├─ Step 2: "loading_strategy"
  │   │   └─ Resolve strategy module from DB (class_module or type)
  │   │   └─ Merge default_config with user overrides
  │   │
  │   ├─ Step 3: "subscribing_market_data"
  │   │   └─ Prepare for candle polling
  │   │
  │   ├─ Step 4: "allocating_capital"
  │   │   └─ Record allocated_capital from bot record
  │   │
  │   ├─ Step 5: "ready"
  │   │   └─ Schedule periodic timers:
  │   │       - :poll_candles    every 60s
  │   │       - :check_exits     every 5s
  │   │       - :update_prices   every 3s
  │   │       - :heartbeat       every 10s
  │   │
  │   └─ State: %{bot_id, strategy, config, positions: %{}, price_cache: %{}, ...}
  │
  ├─ Update ETS: status=running, started_at, elixir_pid
  └─ Broadcast: {:bot_started, bot_data} → "bots:updates"
```

---

## Trading Flow — Signal to Order

### 1. Candle Polling (every 60s)

```
BotTradingProcess :poll_candles
  │
  ▼
For each trading_pair in bot config:
  │
  ├─ Executor.get_bars(credential_id, "ETHUSDT", "5Min", 25)
  │   ├─ Resolve credential → {Binance adapter, creds}
  │   └─ Binance.get_bars("ETHUSDT", "5m", 25, creds)
  │       └─ GET /api/v3/klines?symbol=ETHUSDT&interval=5m&limit=25
  │       └─ Returns: [{timestamp, o, h, l, c, volume}, ...]
  │
  ├─ Extract most recently CLOSED candle (second-to-last bar)
  │   └─ The last bar is still forming — don't trade on incomplete data
  │
  ├─ Check: is this a NEW candle close? (timestamp changed since last poll)
  │   └─ If same timestamp → skip (already processed)
  │
  └─ If new candle → process_candle(candle, state)
```

### 2. Signal Generation

```
process_candle(candle, state)
  │
  ├─ Rate limit: skip if <30s since last signal for this symbol
  │
  ├─ Build context: %{bot_id, credential_id, positions, balance, config}
  │
  ▼
strategy.generate_signal(candle_buffer, order_flow, context)
  │
  ▼ (PhysicsImpulse strategy)
  │
  ├─ Try KlineStream.get_recent_candles(symbol, 20) from ETS cache
  │   └─ Fallback to passed candle_buffer
  │
  └─ SignalGenerator.generate_signal(candles, order_flow, symbol)
      │
      ├─ VelocityAnalyzer.calculate_momentum(prices)
      │   └─ Linear regression slope / mean_price → % per candle
      │
      ├─ VelocityAnalyzer.calculate_atr_pct(candles)
      │   └─ Average True Range as % of price
      │
      ├─ VelocityAnalyzer.calculate_momentum_acceleration(prices)
      │   └─ Split prices in half, compare momentum of each
      │
      ├─ GravityCalculator.calculate_gravity(candles, order_flow)
      │   └─ Composite: volatility + decay + reversal signals
      │
      ├─ MarketProjectile.analyze_projectile(candles, order_flow)
      │   ├─ Peak time: t = |momentum| / gravity (candle units)
      │   ├─ Peak price: P₀ × (1 + v²/2g), clamped to 3x ATR
      │   ├─ Trajectory angle: atan(momentum/gravity) in degrees
      │   └─ Predictions: 5m, 15m, 30m, 60m (ATR-clamped)
      │
      ├─ RegimeDetector.detect(candles)
      │   └─ Kaufman efficiency + directional bias + volatility ratio
      │   └─ Returns: :trending_up | :trending_down | :ranging | :volatile
      │
      └─ determine_direction_and_confidence(...)
          ├─ Direction: momentum > 0.3x ATR → :long, < -0.3x → :short
          └─ Confidence: scored 5-95 from:
              - Momentum/ATR ratio (sweet spot 0.5-0.7x)
              - Gravity level (0.0003-0.0005 best)
              - Momentum/gravity sustainability ratio
              - Trajectory angle (<75° preferred)
              - Energy state (low KE = less overextended)
              - Momentum acceleration (penalty for deceleration)
              - Regime (penalty for ranging, counter-trend)

Returns:
  {:ok, %{
    symbol: "ETHUSDT",
    direction: :long,
    confidence: 68,
    type: :bullish_moderate,
    current_price: Decimal(3850.00),
    entry_price: Decimal(3850.00),
    stop_loss: Decimal(3821.07),        # 1.5x ATR below entry
    take_profit: Decimal(3902.06),       # 1.8x SL distance above entry
    physics: %{momentum, gravity, atr_pct, peak_price, ...},
    predictions: %{"5m" => ..., "15m" => ..., "30m" => ..., "60m" => ...},
    energy_zones: %{current_zone, boundaries, distances},
    recommendation: "MODERATE LONG | momentum=0.001234 conf=68%"
  }}
```

### 3. Entry Decision

```
strategy.should_enter?(signal, context)
  │
  ├─ Check confidence ≥ min_confidence_long (60) or min_confidence_short (70)
  ├─ Check direction is :long or :short (not :neutral)
  ├─ Check impulse size ≥ min_impulse_pct (0.2%)
  ├─ Check open positions < max_positions (1)
  └─ Check symbol not already open
  │
  └─ Returns: true | false
```

### 4. Trade Execution

```
execute_trade(signal, state)
  │
  ├─ Check balance > 0
  ├─ AssetTierManager: verify symbol allowed for user's account level
  │
  ├─ Executor.get_price(credential_id, "ETHUSDT")
  │   └─ Current market price for sizing
  │
  ├─ strategy.calculate_position_size(signal, context)
  │   ├─ ideal_qty = target_profit_usd / sl_distance
  │   ├─ Cap to max_position_pct (15%) of balance
  │   ├─ Enforce min_notional ($10 spot, $100 futures)
  │   └─ Returns: {:ok, quantity, position_value}
  │
  ├─ strategy.calculate_stop_loss(signal, entry_price, context)
  │   └─ Uses signal's ATR-based stop loss level
  │
  ▼
OrderManager.execute_long(credential_id, "ETHUSDT", 0.05, %{
  bot_id: "uuid", user_id: "uuid", strategy_id: "uuid"
})
  │
  ├─ 1. Insert trading.orders row (status: "submitted")
  ├─ 2. Broadcast {:order_created, order} → PubSub
  │
  ├─ 3. Executor.execute_long(credential_id, "ETHUSDT", 0.05, opts)
  │      │
  │      ├─ Resolve credential → {Binance adapter, creds}
  │      │   ├─ Check ETS :executor_credential_cache (5min TTL)
  │      │   └─ Miss: query exchange.user_credentials + exchange.adapters
  │      │
  │      └─ Binance.execute_long("ETHUSDT", 0.05, creds, opts)
  │          │
  │          ├─ Normalize symbol: "ETHUSDT" (already correct)
  │          ├─ Format qty: "0.05000" (5 decimal precision)
  │          ├─ Build params: {symbol, side: BUY, type: MARKET, quantity}
  │          │
  │          ├─ signed_request(:post, "https://api.binance.com/api/v3/order", params, creds)
  │          │   ├─ Add timestamp (Unix ms)
  │          │   ├─ URL-encode params
  │          │   ├─ HMAC-SHA256 sign with secret_key
  │          │   ├─ Add header: X-MBX-APIKEY
  │          │   └─ POST with &signature=...
  │          │
  │          └─ Parse response:
  │              {:ok, %{
  │                order_id: "12345",
  │                executed_price: 3850.25,
  │                executed_qty: 0.05,
  │                status: "FILLED"
  │              }}
  │
  ├─ 4. Update trading.orders (status: "filled", execution_price, exchange_order_id)
  ├─ 5. Broadcast {:order_filled, order} → PubSub
  │
  ▼
  │
  ├─ Create Position in memory:
  │   %{id: uuid, bot_id, symbol: "ETHUSDT", direction: :long,
  │     quantity: 0.05, entry_price: 3850.25,
  │     stop_loss: 3821.07, impulse_target: 3902.06,
  │     target_exit_time: now + 120min, status: :open}
  │
  ├─ persist_position_open(position) → Insert trading.positions
  ├─ Update BotRegistry: increment open_positions count
  └─ Broadcast {:position_opened, position} → PubSub
```

### 5. Exit Monitoring (every 5s)

```
BotTradingProcess :check_exits
  │
  For each open position:
  │
  ├─ strategy.should_exit?(position, context)
  │   ├─ current_price ≥ impulse_target?     → exit (take profit)
  │   ├─ current_price ≤ stop_loss?           → exit (stop loss)
  │   └─ DateTime.utc_now() ≥ target_exit_time? → exit (time expiry)
  │
  └─ If true → close_position(position, state)
      │
      ├─ OrderManager.close_long(credential_id, "ETHUSDT", 0.05, 3850.25, context)
      │   └─ [Same flow as execute: DB insert → Executor → Binance SELL → DB update]
      │   └─ Returns: {:ok, %{exit_price: 3902.06, pnl: 2.59, ...}}
      │
      ├─ persist_position_close(position, exit_price, pnl)
      │   └─ Update trading.positions: status=closed, exit_price, profit_loss, exit_time
      │
      ├─ BotRegistry.report_trade(bot_id, pnl=2.59, won?=true)
      │   ├─ Increment winning_trades
      │   ├─ Accumulate total_pnl
      │   ├─ Record equity_snapshot
      │   └─ Broadcast {:bot_updated, ...} → PubSub
      │
      └─ Remove position from state.positions
```

---

## Risk Management

### RiskMonitor (60s cycle)

For each running bot:

1. **Daily Loss Check**: Sum `profit_loss` from `trading.positions` closed today
   - If exceeds `max_daily_loss` (default $500) → pause bot + alert
2. **Drawdown Check**: `(peak_equity - current_equity) / peak_equity × 100`
   - If exceeds `max_drawdown_pct` (default 10%) → pause bot + alert

On breach:
```elixir
BotRegistry.pause_bot(bot_id)
PubSub.broadcast("alerts:risk_breach", {:risk_breach, %{
  bot_id: bot_id,
  reason: "daily_loss_exceeded",
  severity: "critical",
  details: %{daily_loss: -550, limit: 500}
}})
```

### HeartbeatTracker (5s cycle)

- BotTradingProcess sends heartbeat every 10s
- If no heartbeat for >60s → mark bot as `error` status
- Prevents zombie bots that are technically running but stuck

---

## Market Data Pipeline

### Real-Time Price Flow

```
Binance WebSocket (wss://stream.binance.com)
  │
  ├─ TickerStream: !miniTicker@arr → parse 24h ticker
  │   ├─ Write to :binance_ticker_cache (full ticker)
  │   ├─ Write to :binance_price_cache (symbol → price)
  │   └─ Broadcast: "ticker:{symbol}" → MarketDataChannel
  │
  └─ KlineStream: {symbol}@kline_{tf} → parse OHLCV candle
      ├─ Write to :binance_candle_cache (last 20 per symbol/tf)
      ├─ If candle closed: broadcast "candle_closed:{tf}"
      │   └─ CandleBridge picks up → routes to strategies
      │   └─ CandlePersister picks up → writes to TimescaleDB
      └─ Broadcast: "kline:{symbol}:{tf}" → MarketDataChannel
```

### WebSocket Health

Both streams implement:
- **Ping/pong handling**: Reply immediately to server pings
- **Stale detection**: No data for >120s → force reconnect
- **Exponential backoff**: Failed reconnects increase delay (capped at 30-120s)
- **Jitter**: Random delay added to prevent thundering herd

---

## WebSocket Channels (Admin Gateway)

Clients connect via `ws://localhost:4000/socket?token=JWT` and join topics.

| Channel | Topic(s) | Key Events |
|---------|----------|------------|
| **BotChannel** | `bot:lobby`, `bot:{id}` | bot_started, bot_stopped, bot_heartbeat, bot_error, bot_transition |
| **PositionChannel** | `positions:lobby`, `positions:{bot_id}` | position_opened, position_closed, pnl_batch_update |
| **OrderChannel** | `orders:lobby`, `orders:{bot_id}` | order_created, order_filled, order_failed |
| **MarketDataChannel** | `market_data:{exchange}:{pair}` | ticker_update, candle_closed, order_flow_update |
| **InfraChannel** | `infra:metrics` | infra_snapshot, exchange_health, service_health |
| **PlatformChannel** | `platform:stats` | platform_stats_update |
| **AlertChannel** | `alerts:platform` | new_alert (risk breaches, system errors) |

### Client Commands (inbound)

- `start_bot`, `stop_bot`, `pause_bot` → BotChannel → BotRegistry
- `acknowledge_alert` → AlertChannel → PubSub broadcast
- `close_position` → PositionChannel → PositionManager

---

## Strategy System

All strategies implement `TradeEngine.Strategies.Behaviour` with 7 callbacks:

```elixir
@callback generate_signal(candles :: [map], order_flow, context :: map) ::
  {:ok, signal :: map} | {:error, atom}

@callback should_enter?(signal :: map, context :: map) :: boolean

@callback should_exit?(position :: map, context :: map) :: boolean

@callback calculate_position_size(signal :: map, context :: map) ::
  {:ok, quantity :: float, position_value :: float} | {:error, atom}

@callback calculate_stop_loss(signal :: map, entry_price :: float, context :: map) :: float

@callback default_config() :: map

@callback strategy_type() :: String.t()
```

### Implemented Strategies

| Module | DB Type | Status |
|--------|---------|--------|
| PhysicsImpulse | `core_momentum` | Production-ready |
| GridBot | `core_grid` | Production-ready |
| DCA | `core_dca` | Stub |
| MeanReversionGrid | `core_mean_reversion` | Stub |
| TrendFollower | `core_trend_following` | Stub |

### PhysicsImpulse — Physics Engine Pipeline

```
Raw Candles (OHLCV)
  │
  ├─ VelocityAnalyzer
  │   ├─ calculate_momentum(prices)       → % per candle (normalized slope)
  │   ├─ calculate_atr_pct(candles)       → ATR as % of price
  │   └─ calculate_momentum_acceleration  → trend strengthening/weakening
  │
  ├─ GravityCalculator
  │   └─ calculate_gravity(candles, order_flow) → market resistance composite
  │
  ├─ EnergyModel
  │   ├─ calculate_kinetic_energy(momentum, price)
  │   └─ classify_energy(ke) → :high | :medium | :low
  │
  ├─ RegimeDetector
  │   └─ detect(candles) → :trending_up | :trending_down | :ranging | :volatile
  │
  ├─ MarketProjectile
  │   ├─ Peak price: P₀ × (1 + v²/2g), clamped to 3x ATR
  │   ├─ Peak time: |momentum| / gravity (in candle units)
  │   ├─ Trajectory angle: atan(momentum/gravity)
  │   └─ Predictions: 5m/15m/30m/60m price forecasts
  │
  └─ SignalGenerator
      ├─ Direction: momentum > 0.3x ATR → long, < -0.3x → short
      ├─ Confidence: 5-95 scale (data-driven scoring)
      ├─ Entry/exit: ATR-based SL (1.5x ATR), TP (1.8x SL distance)
      └─ Produces complete trading signal with physics metadata
```

---

## Exchange Adapter Architecture

```
OrderManager
  │
  ▼
Executor (credential resolution + adapter dispatch)
  │
  ├─ resolve(credential_id)
  │   ├─ ETS cache hit? → return {adapter_module, creds}
  │   └─ DB: exchange.user_credentials JOIN exchange.adapters
  │       ├─ Extract api_key, secret_key, base_url
  │       ├─ Determine adapter module from adapter_code
  │       ├─ Cache in :executor_credential_cache (5min TTL)
  │       └─ Return {adapter_module, creds}
  │
  ▼
Adapter (implements ExchangeAdapter behaviour)
  │
  ├─ Binance
  │   ├─ Spot: api.binance.com/api/v3/
  │   ├─ USDS-M Futures: fapi.binance.com/fapi/v1/
  │   ├─ COIN-M Futures: dapi.binance.com/dapi/v1/
  │   ├─ Testnet: testnet.binance.vision/api/
  │   ├─ Auth: HMAC-SHA256 signed requests
  │   └─ Features: market/limit orders, simulated shorts on spot
  │
  └─ Alpaca
      ├─ Paper: paper-api.alpaca.markets
      ├─ US equities only
      └─ Auth: API key + secret headers
```

### Binance Request Signing

```
1. Build params: {symbol: ETHUSDT, side: BUY, type: MARKET, quantity: 0.05}
2. Add timestamp: {timestamp: 1710000000000}
3. URL-encode: "symbol=ETHUSDT&side=BUY&type=MARKET&quantity=0.05&timestamp=1710000000000"
4. HMAC-SHA256: sign(query_string, secret_key) → signature
5. POST: url?query_string&signature=abc123
   Header: X-MBX-APIKEY: api_key
```

---

## Database Tables (Trading Schema)

| Table | Purpose |
|-------|---------|
| `trading.bots` | Bot configuration, status, stats |
| `trading.positions` | Open/closed positions with entry/exit prices, P&L |
| `trading.orders` | Order lifecycle (submitted → filled/failed) |
| `trading.fills` | Individual fill events from exchange |
| `trading.bot_logs` | Structured log entries per bot |
| `trading.bot_state_transitions` | FSM transition audit trail |
| `trading.equity_snapshots` | Periodic equity curve snapshots |
| `trading.monitoring_alerts` | Risk breach and system alerts |
| `strategy.strategies` | Strategy definitions with config JSONB |
| `exchange.user_credentials` | Per-user API keys (encrypted) |
| `exchange.adapters` | Exchange adapter configuration |
| `market_data.ohlcv_5m` | 5-minute candles (TimescaleDB hypertable) |

---

## Configuration

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Hardcoded in config.exs |
| `PHX_SERVER` | Enable HTTP server | false |
| `TRADE_ENGINE_API_PORT` | HTTP API port | 4002 |
| `BINANCE_API_KEY` | Binance API key | "" |
| `BINANCE_API_SECRET` | Binance API secret | "" |
| `BINANCE_TESTNET` | Use testnet endpoints | "true" |

### Testnet vs Mainnet

Trading defaults to **Binance testnet** (safe, no real money). Mainnet is controlled per-credential:

```sql
-- In exchange.user_credentials:
-- is_sandbox = true  → testnet endpoints (default)
-- is_sandbox = false → mainnet endpoints (real trading)
```

---

## Key Design Decisions

1. **ETS over Redis** — Sub-millisecond reads for price data, position P&L, bot state. No network hop.
2. **GenServer per bot** — Each bot is an isolated process. Crash isolation. Independent polling cycles.
3. **PubSub bridge** — trade_engine broadcasts events → admin_gateway channels forward to WebSocket clients.
4. **Strategy callback pattern** — BotTradingProcess is strategy-agnostic. All trading logic delegated to strategy modules.
5. **Bulk DB updates** — PositionManager batches 50 positions per SQL statement, caps at 500/cycle. Prevents DB exhaustion.
6. **Credential caching** — 5-minute ETS cache prevents DB hit on every order.
7. **Physics-based signals** — Proprietary momentum/gravity/energy model replaces traditional indicators. Validated via backtest across 6 assets.
