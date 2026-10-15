# Stella Trading Engine — Complete Technical Documentation

> **Last Updated**: 2026-03-09
> **Engine**: Elixir/Phoenix Umbrella (`stella_platform_umbrella/apps/trade_engine`)
> **Status**: Production (PhysicsImpulse strategy active, others in draft)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Supervision Tree & Startup](#2-supervision-tree--startup)
3. [Bot Lifecycle & State Machine](#3-bot-lifecycle--state-machine)
4. [The Trading Loop](#4-the-trading-loop)
5. [Strategy System](#5-strategy-system)
6. [Physics Engine (Signal Generation)](#6-physics-engine)
7. [Configured Strategies (Production DB)](#7-configured-strategies)
8. [Exchange Adapter Layer](#8-exchange-adapter-layer)
9. [Market Data Infrastructure](#9-market-data-infrastructure)
10. [Position & Order Management](#10-position--order-management)
11. [Risk Management](#11-risk-management)
12. [ETS Cache Architecture](#12-ets-cache-architecture)
13. [PubSub Event System](#13-pubsub-event-system)
14. [Active Bot Status](#14-active-bot-status)

---

## 1. Architecture Overview

The trading engine is an Elixir/OTP application built on the BEAM VM, leveraging:

- **GenServers** — 14+ stateful processes for bot management, risk monitoring, position tracking
- **ETS Tables** — 14 in-memory caches for sub-millisecond price lookups
- **WebSocket Streams** — Real-time Binance market data (tickers, candles, order books)
- **Phoenix PubSub** — Internal event bus connecting trading processes to WebSocket channels
- **PostgreSQL** — Persistent storage across 15 schemas (remote, not localhost)

The engine handles the full trading lifecycle:
```
Market Data → Signal Generation → Entry Decision → Order Execution → Position Management → Exit Detection → P&L Settlement
```

---

## 2. Supervision Tree & Startup

The application starts a comprehensive supervision tree (`one_for_one` strategy):

```
TradeEngine.Application
├── Phoenix.PubSub (event broadcast)
├── TradeEngine.Repo (PostgreSQL connection pool)
│
├── Binance WebSocket Infrastructure
│   ├── RateLimiter (1200 weight/min, 10 orders/sec)
│   └── StreamSupervisor
│       ├── Registry (:binance_stream_registry)
│       ├── CacheManager (initializes all ETS tables)
│       ├── TickerStream (24h rolling ticker updates)
│       ├── KlineStreamPool (DynamicSupervisor for candle streams)
│       ├── DepthStreamPool (order book streams)
│       └── StreamCoordinator (symbol/stream tracking)
│
├── Trading Core
│   ├── CapitalAllocator (virtual balance management)
│   ├── BotSupervisor (DynamicSupervisor for BotTradingProcess)
│   ├── BotRegistry (ETS registry + lifecycle FSM)
│   ├── PriceCache (multi-exchange unified prices)
│   ├── Executor (credential resolution + exchange dispatch)
│   ├── PositionPnLManager (1s tick — real-time P&L)
│   ├── PositionCloseManager (5s tick — exit detection)
│   ├── StaleOrderCanceller (30s tick — cancel hung orders)
│   ├── HeartbeatTracker (5s tick — detect dead bots)
│   └── RiskMonitor (60s tick — drawdown/loss enforcement)
│
├── Observability
│   ├── Infra.Monitor (4s tick — BEAM/DB metrics)
│   ├── PlatformStatsAggregator (60s tick — platform KPIs)
│   ├── ExchangeHealthMonitor (30s tick — exchange status)
│   └── ServiceHealthMonitor (service registry)
│
├── Persistence & Async
│   ├── AlertPersister (event-driven)
│   ├── NotificationDispatcher (event-driven)
│   ├── IncidentManager (event-driven)
│   ├── BotLogPersister (structured logging to DB)
│   ├── CandlePersister (ETS → TimescaleDB)
│   └── BacktestManager (VectorBT queue processor)
│
└── Bandit HTTP (port 4002 — internal REST API)
```

---

## 3. Bot Lifecycle & State Machine

### 3.1 State Transitions (FSM)

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
stopped ──► initializing ──► running ──┬──► paused ───────►│
                                       ├──► stopping ─────►│
                                       ├──► error ────────►│
                                       ├──► circuit_broken►│
                                       └──► maintenance ──►│
                                                          stopped
```

### 3.2 Bot Registry (ETS-backed)

Central registry tracking all bots. Uses `:bot_registry` ETS table for O(1) lookups.

**Registry Entry**:
```elixir
%{
  id: bot_id,
  name: "ETH/USDT",
  user_id: user_id,
  strategy_id: strategy_id,
  credential_id: credential_id,
  market_type: "spot" | "usds_futures" | "coinm_futures",
  config: %{...},
  risk_overrides: %{...},
  status: "running",
  trading_pairs: ["ETHUSDT"],
  allocated_capital: 1000.0,
  active_capital: 0.0,
  total_trades: 107,
  winning_trades: 0,
  losing_trades: 0,
  total_pnl: -0.7399,
  open_positions: 0,
  error_count: 0,
  started_at: ~U[...],
  last_heartbeat: ~U[...],
  last_trade_at: ~U[...],
  elixir_node: "trade_engine@host",
  elixir_pid: "#PID<0.123.0>"
}
```

**Key Operations**:
| Operation | Description |
|-----------|-------------|
| `register_bot/2` | Create bot + add to ETS |
| `start_bot/1` | FSM: stopped → initializing → running, spawn BotTradingProcess |
| `pause_bot/1` | FSM: running → paused |
| `stop_bot/1` | FSM: any → stopping → stopped |
| `heartbeat/1` | Update last_heartbeat timestamp |
| `report_trade/3` | Update stats after position close (pnl, win/loss) |

**Automatic Behaviors**:
- Every 30s: Health check — if no heartbeat for >60s, transition to `error`
- Every 60s: Sync stats to `trading.bots` DB table
- On startup: Auto-start bots with `status = "running"` (5s delay)

---

## 4. The Trading Loop

### 4.1 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ BOT START                                                              │
│   BotRegistry.start_bot(bot_id)                                        │
│   → Load from DB → FSM: stopped → initializing                        │
│   → BotSupervisor.start_trading_process(bot_id)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ INITIALIZATION (5 steps)                                               │
│   1. validating_credentials → Load exchange credentials                │
│   2. loading_strategy → Resolve module + merge config                  │
│   3. subscribing_market_data → Prepare candle polling                  │
│   4. allocating_capital → Validate available balance                   │
│   5. ready → Schedule periodic timers → FSM: running                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
         ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
         │ :poll_candles │  │ :check_exits │  │ :heartbeat   │
         │  every 60s   │  │  every 5s    │  │  every 10s   │
         └──────┬───────┘  └──────┬───────┘  └──────────────┘
                │                 │
                ▼                 ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│ For each trading_pair│  │ For each open position:          │
│                      │  │   strategy.should_exit?(pos, ctx)│
│ Executor.get_bars()  │  │   If true → close_position()     │
│ → Binance REST API   │  │     → OrderManager.close_long()  │
│ → Get 25 5-min bars  │  │     → Calculate P&L              │
│                      │  │     → Update DB + broadcast      │
│ Detect new candle    │  └──────────────────────────────────┘
│ (timestamp changed)  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│ SIGNAL GENERATION                                            │
│                                                              │
│ strategy.generate_signal(candle_buffer, order_flow, context) │
│   → PhysicsImpulse delegates to SignalGenerator              │
│   → MarketProjectile.analyze_projectile(candles)             │
│     → VelocityAnalyzer (momentum via linear regression)      │
│     → GravityCalculator (market resistance)                  │
│     → EnergyModel (kinetic energy classification)            │
│   → Returns {:ok, signal} with direction, confidence, levels │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ ENTRY DECISION                                               │
│                                                              │
│ strategy.should_enter?(signal, context)                      │
│   ✓ Confidence ≥ threshold (long: 55, short: 60)            │
│   ✓ Impulse size ≥ min_impulse_pct (0.1%)                   │
│   ✓ Open positions < max_positions (3)                       │
│   ✓ No duplicate symbol in existing positions                │
└──────────────────────┬───────────────────────────────────────┘
                       │ (if true)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ TRADE EXECUTION                                              │
│                                                              │
│ 1. strategy.calculate_position_size(signal, context)         │
│    → quantity = target_profit_usd / impulse_size             │
│    → Clamp to max_position_pct of balance                    │
│    → Validate notional ≥ $10 (spot) / $100 (futures)         │
│                                                              │
│ 2. strategy.calculate_stop_loss(signal, entry_price, ctx)    │
│    → stop = entry - (impulse_size × 0.618)  [golden ratio]   │
│                                                              │
│ 3. OrderManager.execute_long/short(...)                      │
│    → Insert trading.orders (status="submitted")              │
│    → Executor → Binance adapter → REST POST                  │
│    → HMAC-SHA256 signed request                              │
│    → Update order (status="filled", executed_price)          │
│    → Broadcast {:order_filled, order}                        │
│                                                              │
│ 4. Insert trading.positions (status="open")                  │
│    → BotRegistry.update_position_count()                     │
│    → Broadcast {:position_opened, ...}                       │
└──────────────────────────────────────────────────────────────┘
                       │
           ┌───────────┼───────────┬───────────┐
           ▼           ▼           ▼           ▼
    ┌────────────┐┌─────────┐┌──────────┐┌──────────┐
    │ PnLManager ││CloseMgr ││ RiskMon  ││ Heartbeat│
    │  every 1s  ││ every 5s││ every 60s││ every 5s │
    │            ││         ││          ││          │
    │ Calc P&L   ││ Check   ││ Check    ││ Detect   │
    │ from ETS   ││ TP/SL/  ││ drawdown ││ stale    │
    │ prices     ││ trail/  ││ daily    ││ bots     │
    │            ││ time    ││ loss     ││ >60s     │
    │ Broadcast  ││         ││          ││ → error  │
    │ pnl_update ││ Close   ││ Pause    ││          │
    │            ││ if hit  ││ if breach││          │
    └────────────┘└─────────┘└──────────┘└──────────┘
```

### 4.2 BotTradingProcess State

Each running bot holds this state in its GenServer:

```elixir
%{
  bot_id: "e448d90c-...",
  user_id: "user-uuid",
  credential_id: "credential-uuid",
  strategy_id: "37e85bba-...",
  market_type: "usds_futures",
  trading_pairs: ["ETH/USDT:USDT-260327"],
  config: %{...merged strategy + bot config...},
  strategy_module: TradeEngine.Strategies.PhysicsImpulse,

  # Active positions (in-memory mirror)
  positions: %{
    "pos-id" => %{
      id: "pos-id",
      symbol: "ETHUSDT",
      direction: :long,
      quantity: 0.05,
      entry_price: 2150.0,
      current_price: 2165.0,
      impulse_target: 2180.0,
      stop_loss: 2131.42,
      confidence: 68,
      entry_time: ~U[...],
      target_exit_time: ~U[...],
      status: :open,
      position_value: 107.5,
      exchange_order_id: "12345"
    }
  },

  # Market data buffers
  price_cache: %{"ETHUSDT" => 2165.0},
  last_candle_times: %{"ETHUSDT" => 1709913600000},
  candle_buffers: %{
    "ETHUSDT" => [%{open: 2148.0, high: 2170.0, low: 2145.0, close: 2165.0, volume: 5000, ...}, ...]
  },

  # Cumulative stats
  total_trades: 107,
  winning_trades: 0,
  losing_trades: 0,
  total_realized_pnl: -0.7399,
  allocated_capital: 1000.0
}
```

### 4.3 Strategy Context (Passed to All Strategy Callbacks)

```elixir
%{
  bot_id: "e448d90c-...",
  user_id: "user-uuid",
  credential_id: "credential-uuid",
  strategy_id: "37e85bba-...",
  config: %{
    "target_profit_usd" => 0.50,
    "min_impulse_pct" => 0.001,
    "max_hold_minutes" => 5,
    "golden_ratio" => 0.618,
    "min_notional" => 10.0,
    "min_trade_value" => 12.0,
    "min_confidence_long" => 55,
    "min_confidence_short" => 60,
    "max_positions" => 3,
    "max_position_pct" => 0.15
  },
  positions: %{...},       # Current open positions
  price_cache: %{...},     # Latest prices
  balance: 1000.0,         # Available capital
  symbol: "ETHUSDT"        # Current symbol being evaluated
}
```

---

## 5. Strategy System

### 5.1 Strategy Behaviour (Interface)

All strategies implement `TradeEngine.Strategies.Behaviour` with 7 callbacks:

```elixir
@callback generate_signal(candles :: [candle()], order_flow :: any(), context :: context()) ::
    {:ok, signal()} | {:error, atom()}

@callback should_enter?(signal :: signal(), context :: context()) :: boolean()

@callback should_exit?(position :: position(), context :: context()) :: boolean()

@callback calculate_position_size(signal :: signal(), context :: context()) ::
    {:ok, float(), float()} | {:error, atom()}

@callback calculate_stop_loss(signal :: signal(), entry_price :: float(), context :: context()) :: float()

@callback default_config() :: map()

@callback strategy_type() :: String.t()
```

### 5.2 Module Resolution

```elixir
@strategy_modules %{
  "core_momentum"        => TradeEngine.Strategies.PhysicsImpulse,
  "core_grid"            => TradeEngine.Strategies.GridBot,
  "core_dca"             => TradeEngine.Strategies.DCA,
  "core_mean_reversion"  => TradeEngine.Strategies.MeanReversionGrid,
  "core_trend_following" => TradeEngine.Strategies.TrendFollower
}
```

### 5.3 Configuration Merge Order

When a bot runs a strategy, config is merged in this priority (highest wins):

1. **Strategy `default_config()`** — Module-level defaults
2. **`strategy.strategies.config`** — DB row config (set by admin)
3. **`trading.bots.config`** — Bot-level overrides (user customization)
4. **Runtime context** — Real-time data (prices, balances, positions)

### 5.4 Strategy Comparison

| Aspect | PhysicsImpulse | GridBot | DCA | MeanReversionGrid | TrendFollower |
|--------|:-:|:-:|:-:|:-:|:-:|
| **Status** | ✅ Production | ✅ Complete | ❌ Stub | ❌ Stub | ❌ Stub |
| **DB Status** | `active` | `draft` | `draft` | `draft` | `draft` |
| **Live Enabled** | Yes | No | No | No | No |
| **Signal Type** | Momentum scalp | Grid placement | Scheduled buy | Mean reversion | Trend follow |
| **Timeframe** | 5m candles | Indefinite | 4h intervals | 1h candles | 1h multi-TF |
| **Max Positions** | 3 | 20 | 50 | 16 | 5 |
| **Entry Trigger** | Physics confidence | Price at grid level | Timer tick | EMA deviation | EMA alignment |
| **Exit Method** | Target/SL/timeout | Opposite grid fill | % aggregate gain | Mean reversion | Trailing stop |
| **Physics Used** | ✅ Full engine | ❌ | ❌ | ❌ | ❌ |

---

## 6. Physics Engine

The proprietary physics engine treats price movement as **projectile motion in a gravity field**. This is the core intellectual property of the platform.

### 6.1 Core Concept

```
Price movement = Projectile launched with initial velocity (momentum)
                 Subject to gravity (market resistance)
                 With kinetic energy (momentum strength)
                 Following a parabolic trajectory
```

### 6.2 Physics Modules

```
physics/
├── signal_generator.ex      # Converts physics → trading signal
├── market_projectile.ex     # Core projectile motion analysis
├── velocity_analyzer.ex     # Momentum via linear regression
├── gravity_calculator.ex    # Market resistance (3 components)
├── energy_model.ex          # Kinetic/potential energy states
├── trajectory.ex            # Full price path prediction
├── calculator.ex            # Lower-level physics functions
├── constants.ex             # Physical constants & thresholds
├── projectile.ex            # Order book liquidity physics
├── risk_management.ex       # Physics-based position sizing
├── momentum_validator.ex    # 7-part momentum diagnostics
└── prediction_tracker.ex    # Real-time prediction accuracy tracking
```

### 6.3 Momentum Calculation (Velocity)

**Module**: `velocity_analyzer.ex`

Momentum is calculated as the **linear regression slope** of the price series:

```
momentum = Σ[(x - x̄) × (y - ȳ)] / Σ[(x - x̄)²]

Where:
  x = time index (0 to n-1)
  y = close prices

Returns: signed float [-1.0, 1.0]
  Positive → bullish (upward momentum)
  Negative → bearish (downward momentum)
  Near zero → neutral/exhausted
```

### 6.4 Gravity Calculation (Market Resistance)

**Module**: `gravity_calculator.ex`

Gravity represents the deceleration force pulling price back toward equilibrium. Composed of three weighted components:

```
┌─────────────────────────────────────────────────────────┐
│ VOLATILITY COMPONENT (60% weight)                       │
│                                                         │
│ volatility_pct = avg_candle_range / mean_price          │
│ gravity_vol = volatility_pct / 50                       │
│ Range: 0.00005 - 0.01                                   │
│                                                         │
│ Higher volatility = higher gravity = faster exhaustion   │
├─────────────────────────────────────────────────────────┤
│ DECAY COMPONENT (30% weight)                            │
│                                                         │
│ decay_ratio = 1.0 - (recent_momentum / older_momentum)  │
│ decay_gravity = decay_ratio × 0.005                     │
│                                                         │
│ Detects if momentum is slowing down                     │
├─────────────────────────────────────────────────────────┤
│ REVERSAL COMPONENT (10% weight)                         │
│                                                         │
│ reversal_rate = direction_changes / total_changes        │
│ reversal_gravity = reversal_rate × 0.01                 │
│                                                         │
│ Counts sign changes in price deltas (choppy = high)     │
└─────────────────────────────────────────────────────────┘

Final gravity = (vol × 0.6) + (decay × 0.3) + (reversal × 0.1)
Clamped to: [0.0001, 0.05]
```

**Interpretation**:
- **High gravity (0.03–0.05)**: Choppy, volatile market. Momentum exhausts quickly. Short peak times.
- **Low gravity (0.0001–0.001)**: Smooth trend. Price travels far before exhaustion. Long peak times.

### 6.5 Peak Price Prediction (Projectile Apex)

**Module**: `market_projectile.ex`

Using the projectile motion formula to predict the price extreme:

```
height = v₀² / (2g)

peak_price = current_price + height  (for longs)
peak_price = current_price - height  (for shorts)

Clamped to ±20% of current price (realistic for scalping)
```

**Peak Time** (time to exhaustion):
```
peak_time = |v₀| / g

Clamped to [1, 30] minutes
```

### 6.6 Trajectory Angle

```
angle = arctan(|v₀| / g) × (180 / π)

Range: [-90°, +90°]

Interpretation:
  > 75°: Nearly vertical — extreme momentum (rare)
  25-75°: Strong directional move
  15-25°: Moderate move
  < 15°: Weak, likely noise
```

### 6.7 Energy Model

**Module**: `energy_model.ex`

```
Kinetic Energy:
  E_k = 0.5 × market_mass × momentum²
  where market_mass = price / 100.0

Energy States:
  :high    → E_k > 0.7  (strong momentum, full position size)
  :medium  → E_k > 0.3  (moderate, 80% position size)
  :low     → E_k ≤ 0.3  (exhausted, 50% position size)
```

### 6.8 Confidence Scoring

**Module**: `signal_generator.ex`

```
Base confidence: 50

Momentum Boost (0-25 points):
  speed > 0.01   → +25
  speed > 0.005  → +15
  speed > 0.001  → +8

Angle Boost (0-15 points):
  |angle| ≥ 25°  → +15
  |angle| ≥ 20°  → +10
  |angle| ≥ 15°  → +5

Energy Boost (0-10 points):
  :high           → +10
  :medium         → +5
  :low            → +0

Gravity Penalty (0 to -10 points):
  gravity > 0.01  → -10
  gravity > 0.005 → -5

Final: clamp(sum, 10, 100)
```

**Signal Classification**:
| Confidence | Long | Short |
|:---:|:---:|:---:|
| ≥ 70 | `bullish_strong` | `bearish_strong` |
| ≥ 55 | `bullish_moderate` | `bearish_moderate` |
| < 55 | `bullish_weak` | `bearish_weak` |

### 6.9 Energy Zones

```
Peak distance = momentum² / (2 × gravity)

Zone boundaries (for uptrend):
  ┌─────────────────────────────────────────────────────┐
  │ INJECTION (0-33%)  │ RISING (33-67%) │ PEAKING (67-100%) │
  │ Early entry phase  │ Acceleration    │ Approaching apex  │
  │ Tight stops        │ Trail stops up  │ Take profits      │
  └─────────────────────────────────────────────────────┘
```

### 6.10 Price Predictions (Multi-Timeframe)

```
P(t) = P₀ + (v₀ × t) - (0.5 × g × t²)

Generated for: 1m, 5m, 15m, 30m
All clamped to ±20% of current price
```

### 6.11 Order Book Liquidity Physics

**Module**: `projectile.ex`

The order book modifies the physics trajectory:

```
SELL WALL detected (ask volume >> bid volume):
  → Upward momentum gets drag: acceleration -= 0.05

BUY WALL detected (bid volume >> ask volume):
  → Downward momentum gets support: acceleration += 0.05

BALANCED BOOK:
  → Check taker buy ratio:
     > 60% → acceleration += 0.02 (buying pressure)
     < 40% → acceleration -= 0.02 (selling pressure)
```

### 6.12 Complete Signal Output

```elixir
%{
  symbol: "ETHUSDT",
  direction: :long,
  type: :bullish_moderate,
  confidence: 68,

  # Trading levels
  current_price: Decimal.new("2165.00"),
  entry_price: Decimal.new("2165.00"),
  stop_loss: Decimal.new("2121.70"),     # current × 0.98
  take_profit: Decimal.new("2188.16"),   # peak × 0.96

  # Physics data
  physics: %{
    momentum: 0.0234,
    velocity: 0.0234,
    gravity: 0.0018,
    peak_time: 13.0,                     # minutes to exhaustion
    peak_price: 2279.33,                 # projectile apex
    trajectory_angle: 85.6,              # degrees
    kinetic_energy: 0.000277,
    energy_state: :low,
    current_price: 2165.0
  },

  # Analysis
  balance_point: 2222.17,               # market equilibrium
  distance_from_balance: -57.17,
  energy_zones: %{
    current_zone: :injection,
    energy_level: :low,
    zone_boundaries: %{injection: 2185.0, peak: 2240.0, balance_point: 2222.17}
  },

  # Time-based predictions
  predictions: %{
    "5m" => 2177.63,
    "15m" => 2192.56,
    "30m" => 2189.05
  },

  recommendation: "MODERATE LONG",
  timestamp: ~U[2026-03-09 12:00:00Z]
}
```

---

## 7. Configured Strategies (Production DB)

These are the 5 strategies currently defined in `strategy.strategies`:

### 7.1 Physics Impulse Scalper ✅ ACTIVE

| Field | Value |
|-------|-------|
| **ID** | `37e85bba-c72e-4a15-9242-5ff2af4ff153` |
| **Type** | `core_momentum` |
| **Status** | `active` |
| **Live Enabled** | Yes |
| **Class Module** | `TradeEngine.Strategies.PhysicsImpulse` |
| **Timeframe** | 5m |
| **Supported Pairs** | BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT, ADAUSDT, AVAXUSDT |
| **Supported Exchanges** | binance, binance_testnet |
| **Min Tier** | stella_one |
| **Default SL** | 1.5% |
| **Default TP** | 2.0% |
| **Max Position Size** | 15% |

**Config**:
```json
{
  "target_profit_usd": 0.50,
  "min_impulse_pct": 0.001,
  "max_hold_minutes": 5,
  "golden_ratio": 0.618,
  "min_notional": 10.0,
  "min_trade_value": 12.0,
  "min_confidence_long": 55,
  "min_confidence_short": 60,
  "max_positions": 3,
  "max_position_pct": 0.15
}
```

**Entry Conditions** (from DB):
```json
[
  {"indicator": "confidence", "operator": ">=", "value": 55, "note": "Long threshold"},
  {"indicator": "confidence", "operator": ">=", "value": 60, "note": "Short threshold"},
  {"indicator": "impulse_pct", "operator": ">=", "value": 0.001, "note": "Min impulse size"},
  {"indicator": "trajectory_angle", "operator": ">=", "value": 18, "note": "Min angle degrees"},
  {"indicator": "energy_state", "operator": "in", "value": ["high", "medium"], "note": "Sufficient energy"}
]
```

**Exit Conditions** (from DB):
```json
[
  {"type": "take_profit", "method": "impulse_target", "note": "Physics peak prediction P₀ + v²/2g"},
  {"type": "stop_loss", "method": "golden_ratio", "value": 0.618, "note": "0.618 × impulse below entry"},
  {"type": "time_exit", "max_hold_minutes": 5, "note": "Force close after max hold"}
]
```

**Indicators** (from DB):
```json
[
  {"name": "physics_momentum", "type": "custom", "params": {"method": "linear_regression_slope"}},
  {"name": "physics_gravity", "type": "custom", "params": {"components": ["volatility", "decay", "reversals"]}},
  {"name": "physics_energy", "type": "custom", "params": {"formula": "0.5 * mass * v²"}},
  {"name": "trajectory_angle", "type": "custom", "params": {"formula": "arctan(v/g)"}},
  {"name": "ai_brain", "type": "onnx", "params": {"model": "margin_scalper_brain.onnx", "features": 6}}
]
```

> **Note**: The `ai_brain` ONNX indicator is defined in the DB but not yet implemented in the Elixir strategy code.

**Position Sizing**:
```json
{
  "method": "impulse_based",
  "formula": "quantity = target_profit_usd / impulse_size",
  "min_notional": 10.0,
  "min_trade_value": 12.0,
  "max_position_pct": 0.15
}
```

---

### 7.2 Grid Bot (Draft)

| Field | Value |
|-------|-------|
| **ID** | `9d547c3e-8c5a-423a-bda0-1d1f1b4772a2` |
| **Type** | `core_grid` |
| **Status** | `draft` |
| **Live/Backtest** | No / No |
| **Supported Exchanges** | binance, bybit, okx |

**Config**:
```json
{
  "grid_levels": 20,
  "lower_price": 0,
  "upper_price": 0,
  "max_positions": 20,
  "total_investment": 2000.0,
  "investment_per_grid": 100.0,
  "rebalance_on_breakout": true
}
```

**How it works**: Unlike signal-based strategies, GridBot places a grid of limit orders:
1. Calculate grid levels between `lower_price` and `upper_price` (arithmetic or geometric spacing)
2. Place buy limit orders below current price
3. Place sell limit orders above current price
4. When a buy fills → place sell one grid level above
5. When a sell fills → place buy one grid level below
6. Profit from range-bound oscillation

**Grid Computation**:
```
Arithmetic: step = (upper - lower) / n_levels
Geometric: ratio = (upper / lower)^(1/n_levels)
```

---

### 7.3 Dollar-Cost Averaging (Draft)

| Field | Value |
|-------|-------|
| **ID** | `e2e2828e-e899-4ebf-8989-9e7c15dcdece` |
| **Type** | `core_dca` |
| **Status** | `draft` |
| **Supported Exchanges** | binance, bybit, okx, kraken, kucoin |

**Config**:
```json
{
  "interval": "4h",
  "use_twap": false,
  "amount_usd": 100.0,
  "max_positions": 50,
  "dip_thresholds": [
    {"drop_pct": 3.0, "multiplier": 1.5},
    {"drop_pct": 6.0, "multiplier": 2.0},
    {"drop_pct": 10.0, "multiplier": 3.0}
  ],
  "max_budget_usd": 3000.0,
  "take_profit_pct": 10.0
}
```

**Concept**: Timer-driven buying strategy with dip-enhanced amounts:
- Buy $100 every 4 hours
- If price drops 3% → buy $150 instead (1.5× multiplier)
- If price drops 6% → buy $200 (2× multiplier)
- If price drops 10% → buy $300 (3× multiplier)
- Close all positions when aggregate gain reaches 10%
- TWAP option splits large buys into smaller chunks

---

### 7.4 Mean Reversion Grid (Draft)

| Field | Value |
|-------|-------|
| **ID** | `b9488da8-c3fe-465a-b890-6714fa171591` |
| **Type** | `core_mean_reversion` |
| **Status** | `draft` |
| **Timeframe** | 1h |
| **Supported Exchanges** | binance, bybit, okx |

**Config**:
```json
{
  "ema_period": 20,
  "grid_levels": 8,
  "max_positions": 16,
  "rebalance_mode": "auto",
  "grid_spacing_pct": 0.8,
  "max_deviation_pct": 5.0,
  "position_size_pct": 5.0
}
```

**Concept**: Grid anchored to moving average (not fixed prices):
- Calculate 20-period EMA as center
- Place 8 buy levels below EMA, 8 sell levels above
- Grid spacing = 0.8% between levels
- Profit when price reverts to EMA
- Auto-pause if price deviates >5% from EMA (trend breakout)
- `rebalance_mode: "auto"` → grid re-centers when EMA moves

---

### 7.5 Multi-Timeframe Trend Follower (Draft)

| Field | Value |
|-------|-------|
| **ID** | `1407896d-9163-4bc5-8a06-2b92b5f7400c` |
| **Type** | `core_trend_following` |
| **Status** | `draft` |
| **Timeframe** | 1h |
| **Default SL** | 2.0% |
| **Supported Exchanges** | binance, bybit, okx |

**Config**:
```json
{
  "fast_ema": 9,
  "slow_ema": 21,
  "signal_ema": 50,
  "timeframes": ["1h", "4h", "1d"],
  "max_positions": 5,
  "trailing_step_pct": 0.5,
  "trailing_stop_pct": 2.0,
  "min_trend_strength": 0.6,
  "volume_confirmation": true
}
```

**Concept**: Multi-timeframe EMA alignment with trailing stops:
- **Entry**: All 3 timeframes must show bullish EMA alignment (fast > slow > signal)
- **Trend strength**: Alignment score must exceed 0.6 (on 0-1 scale)
- **Volume**: Must be above average for confirmation
- **Exit**: 2% trailing stop with 0.5% step increments
- **Reversal**: Close when macro (1d) timeframe flips bearish

**Indicators** (from DB):
```json
[
  {"name": "ema_fast", "type": "moving_average", "params": {"type": "exponential", "period": 9}},
  {"name": "ema_slow", "type": "moving_average", "params": {"type": "exponential", "period": 21}},
  {"name": "ema_signal", "type": "moving_average", "params": {"type": "exponential", "period": 50}},
  {"name": "volume_sma", "type": "volume_average", "params": {"period": 20}}
]
```

---

## 8. Exchange Adapter Layer

### 8.1 Architecture

```
BotTradingProcess
    │
    ▼
Executor (GenServer)
    │ resolve credential_id → adapter module
    │ ETS cache: :executor_credential_cache (5-min TTL)
    │
    ├──► Binance Adapter (spot, usds_futures, coinm_futures)
    │       │
    │       ├── REST: execute_long/short, get_price, get_bars
    │       └── WebSocket: TickerStream, KlineStream, DepthStream
    │
    └──► Alpaca Adapter (US equities)
            └── REST: market orders, quotes
```

### 8.2 Binance Adapter

**Supported Market Types**:
| Type | API Base | Description |
|------|----------|-------------|
| `spot` | `/api/v3/` | Spot trading |
| `usds_futures` | `/fapi/v1/` | USDT-margined futures |
| `coinm_futures` | `/dapi/v1/` | Coin-margined futures |

**Request Signing** (HMAC-SHA256):
```
1. Add timestamp to params
2. Build query string from all params
3. signature = HMAC-SHA256(secret_key, query_string)
4. Append &signature=... to URL
5. Set header: X-MBX-APIKEY: api_key
```

**Symbol Normalization**:
```
"BTC/USD"              → "BTCUSDT"
"BTC/USDT:USDT"        → "BTCUSDT"        (perpetual swap)
"BTC/USDT:USDT-260327" → "BTCUSDT_260327" (quarterly delivery)
"ETH/USDT:USDT-260327" → "ETHUSDT_260327" (active bot pair)
```

**Short Selling on Spot**:
- Spot market doesn't support native shorts
- `simulate_shorts: true` (default) → Returns synthetic order with `status: "simulated"`
- Futures: Real SELL orders

**Executed Price Calculation** (priority order):
1. `avgPrice` field (if non-zero)
2. Weighted average from `fills[]` array
3. `price` field (limit orders)
4. `cumQuote / executedQty` (calculated)
5. Default 0.0

### 8.3 Rate Limiting

```
Token Bucket Algorithm:
  :weight         → 1200 per minute (refills every 60s)
  :orders_second  → 10 per second (refills every 1s)

Tracks actual usage from response headers:
  X-MBX-Used-Weight-1m
```

---

## 9. Market Data Infrastructure

### 9.1 WebSocket Streams

Three concurrent WebSocket connections to Binance:

#### TickerStream
- **Purpose**: 24h rolling ticker updates for all tracked symbols
- **ETS**: `:binance_ticker_cache`, `:binance_price_cache`
- **Reconnect**: Intelligent backoff based on connection stability
  - Stable (>2min uptime): 2s reconnect
  - Unstable: Exponential backoff up to 15s
  - Rate limited: Up to 60s

#### KlineStream
- **Purpose**: Candlestick (OHLCV) updates
- **ETS**: `:binance_candle_cache[{symbol, timeframe}]` → last 20 candles
- **Stale Detection**: If no message for 2 minutes → force reconnect
- **PubSub events**:
  - `"kline:BTCUSDT:1h"` → `{:kline, candle}`
  - `"candle_closed:1h"` → `{:candle_closed, candle}` (only when candle finalizes)

**Tracked Symbols** (4 tiers by volatility):
| Tier | Category | Examples |
|------|----------|----------|
| 1 | Ultra-volatile memes | PEPEUSDT, SHIBUSDT, BONKUSDT |
| 2 | High-volatile alts | DOGEUSDT, XRPUSDT, ADAUSDT |
| 3 | Medium-volatile | SOLUSDT, LINKUSDT, AVAXUSDT |
| 4 | Large caps | BTCUSDT, ETHUSDT, BNBUSDT |

#### DepthStream
- **Purpose**: Order book depth + order flow analysis
- **ETS**: `:binance_orderbook_cache`, `:binance_order_flow_cache`
- **Order Flow Metrics**:
  ```
  imbalance = (bid_vol - ask_vol) / total_vol
  pressure_ratio = bid_vol / total_vol
  wall_detection = buy_wall if bid/ask > 3.0, sell_wall if < 0.33
  spread = best_ask - best_bid
  ```

### 9.2 Candle Persistence

**CandlePersister** flushes ETS candle data to TimescaleDB hypertables:
- `market_data.ohlcv_1m` — 1-minute candles
- `market_data.ohlcv_1h` — 1-hour candles
- `market_data.ohlcv_1d` — 1-day candles

---

## 10. Position & Order Management

### 10.1 Order Manager

Wraps Executor calls with DB persistence and PubSub broadcasts:

```
1. Insert trading.orders (status="submitted")
2. Broadcast {:order_created, order} via PubSub
3. Call Executor adapter → Binance REST
4. Update order:
   - status = "filled" | "failed"
   - executed_price, executed_qty, slippage, latency
5. Broadcast {:order_filled, order} or {:order_failed, ...}
```

### 10.2 Position PnL Manager (1-second tick)

Real-time unrealized P&L calculator:

```
Every 1 second:
  1. Load open positions (max 1000) from DB
  2. For each position:
     - Get current price from ETS price cache
     - unrealized_pnl = (current - entry) × quantity  [longs]
     - pnl_pct = ((current - entry) / entry) × 100
  3. Write to :position_pnl_cache ETS
  4. Broadcast {:pnl_batch_update, [...]} via PubSub

Every 30 seconds:
  - Reload position list from DB (detect new/closed)
```

### 10.3 Position Close Manager (5-second tick)

Detects exit conditions and closes positions:

**Exit Conditions** (checked in order):
| # | Condition | Formula |
|---|-----------|---------|
| 1 | Fixed Take Profit | current ≥ tp_price |
| 2 | Fixed Stop Loss | current ≤ sl_price |
| 3 | Percentage TP | current ≥ entry × (1 + tp_pct) |
| 4 | Percentage SL | current ≤ entry × (1 - sl_pct) |
| 5 | Trailing Stop | current ≤ (peak - trailing_distance) |
| 6 | Max Hold Time | now > entry_time + max_seconds |

### 10.4 Stale Order Canceller (30-second tick)

Cancels orders stuck in `pending` or `submitted` status for too long (configurable via `platform.bot_engine_defaults.max_order_age_sec` = 300s).

---

## 11. Risk Management

### 11.1 Platform Risk Controls (from DB)

**`platform.risk_controls`** — Global singleton:

| Setting | Value | Description |
|---------|-------|-------------|
| max_drawdown_pct | 10% | Maximum portfolio drawdown |
| daily_loss_limit_pct | 5% | Maximum daily loss |
| circuit_breaker_pct | 15% | Emergency halt threshold |
| circuit_breaker_window_hours | 4 | Circuit breaker lookback |
| max_slippage_pct | 0.5% | Maximum acceptable slippage |
| max_position_size_pct | 8% | Max single position vs portfolio |
| max_concurrent_positions | 20 | Max open positions |
| max_leverage | 5× | Maximum leverage allowed |
| max_bots_per_user | 10 | Bot limit per user |
| force_limit_orders | Yes | Prefer limit over market orders |
| auto_halt_on_circuit | Yes | Auto-halt on circuit breaker |
| notify_on_drawdown | Yes | Alert on drawdown approach |
| allow_market_orders | Yes | Allow market orders |
| require_stop_loss | No | Require SL on every position |

### 11.2 Bot Engine Defaults (from DB)

**`platform.bot_engine_defaults`** — Singleton:

| Setting | Value | Description |
|---------|-------|-------------|
| heartbeat_interval_sec | 5 | Bot heartbeat frequency |
| order_timeout_sec | 30 | Order placement timeout |
| max_order_age_sec | 300 | Cancel orders older than this |
| retry_attempts | 3 | Failed order retry count |
| retry_backoff_multiplier | 2.0 | Exponential backoff multiplier |
| reconcile_frequency_min | 18 | Position/order reconciliation |
| default_slippage_pct | 0.10 | Default slippage tolerance |
| position_precision | 3 | Decimal places for positions |
| enable_heartbeat_alert | Yes | Alert on missed heartbeat |
| enable_stale_order_cancel | Yes | Auto-cancel stale orders |
| enable_auto_reconcile | Yes | Auto-reconcile positions |
| enable_partial_fill_continue | Yes | Continue on partial fills |

### 11.3 Tier-Based Risk Limits (from DB)

**`risk.limit_configs`** — 26 active rules across 5 scopes:

#### Global Limits
| Limit Type | Value |
|------------|-------|
| max_drawdown_pct | 50% |
| max_trade_size_usd | $100,000 |
| daily_volume_cap_usd | $500,000 |
| max_leverage | 10× |
| max_open_positions | 100 |
| max_orders_per_minute | 30 |

#### Per-Tier Limits

| Limit | Stella One | Stella Unum | Stella Eon | Stella Plenum |
|-------|:---:|:---:|:---:|:---:|
| **Max Drawdown** | 10% | 15% | 25% | 40% |
| **Max Trade Size** | $50 | $500 | $5,000 | $50,000 |
| **Daily Volume** | $200 | $5,000 | $50,000 | $500,000 |
| **Max Leverage** | 1× (none) | 2× | 5× | 10× |
| **Max Positions** | 3 | 10 | 50 | 100 |

**Available Limit Types** (enum):
- `max_drawdown_pct`, `max_trade_size_usd`, `daily_volume_cap_usd`
- `max_leverage`, `max_open_positions`, `max_orders_per_minute`
- `cooldown_period_minutes`, `max_loss_per_trade_usd`
- `allowed_assets`, `blocked_assets`, `allowed_exchanges`

**Limit Scopes**: `global`, `tier`, `user`, `strategy`, `exchange`

### 11.4 Risk Monitor (60-second tick)

The `RiskMonitor` GenServer enforces limits every 60 seconds:

```
For each running bot:
  1. Calculate daily loss:
     sum(profit_loss) WHERE exit_time > TODAY
     If exceeds daily_loss_limit → BREACH

  2. Calculate drawdown:
     (allocated - (allocated + total_pnl)) / allocated
     If exceeds max_drawdown_pct → BREACH

  On breach:
  → BotRegistry.pause_bot(bot_id)
  → Update bot status = "paused"
  → Broadcast {:risk_breach, details} on "alerts:risk_breach"
```

---

## 12. ETS Cache Architecture

| Cache | Writer | Key | TTL | Purpose |
|-------|--------|-----|-----|---------|
| `:bot_registry` | BotRegistry | `bot_id` | — | Bot runtime state |
| `:position_pnl_cache` | PositionPnLManager | `position_id` | 1s refresh | Per-position P&L |
| `:infra_metrics_cache` | Infra.Monitor | `:metrics` | 4s | BEAM/DB metrics |
| `:platform_stats_cache` | PlatformStatsAggregator | `:stats` | 60s | Platform KPIs |
| `:exchange_health_cache` | ExchangeHealthMonitor | `exchange` | 30s | Exchange status |
| `:service_health_cache` | ServiceHealthMonitor | `service` | — | Service health |
| `:binance_ticker_cache` | TickerStream | `symbol` | Real-time | 24h ticker data |
| `:binance_price_cache` | TickerStream | `symbol` | Real-time | Simple price lookup |
| `:binance_candle_cache` | KlineStream | `{symbol, tf}` | Real-time | Last 20 candles |
| `:binance_orderbook_cache` | DepthStream | `symbol` | Real-time | Order book |
| `:binance_order_flow_cache` | DepthStream | `symbol` | Real-time | Order flow metrics |
| `:virtual_balances` | CapitalAllocator | `user_id` | — | User virtual capital |
| `:capital_allocations` | CapitalAllocator | `allocation_id` | — | Capital reservations |
| `:executor_credential_cache` | Executor | `credential_id` | 5 min | Cached exchange creds |
| `:price_cache` | PriceCache | `{exchange, symbol}` | — | Multi-exchange prices |

---

## 13. PubSub Event System

### Bot Events (`"bots:updates"` / `"bot:#{bot_id}"`)
| Event | Payload |
|-------|---------|
| `{:bot_started, runtime}` | Full bot runtime state |
| `{:bot_stopped, runtime}` | Bot + reason |
| `{:bot_updated, runtime}` | Stats update |
| `{:bot_error, details}` | `%{bot_id, error}` |
| `{:bot_heartbeat, details}` | `%{bot_id, timestamp, status}` |
| `{:bot_init_step, details}` | `%{bot_id, init_step, name}` |
| `{:bot_transition, details}` | `%{bot_id, from_status, to_status}` |

### Position Events (`"positions:pnl_update"` / `"trading:positions"`)
| Event | Payload |
|-------|---------|
| `{:pnl_batch_update, list}` | Array of P&L data (every 1s) |
| `{:position_closed, details}` | `%{id, symbol, side, exit_price, profit_loss, exit_reason}` |

### Order Events (`"orders:updates"`)
| Event | Payload |
|-------|---------|
| `{:order_created, order}` | New order submitted |
| `{:order_filled, order}` | Order executed on exchange |
| `{:order_failed, id, reason}` | Order rejected/failed |

### Risk Events (`"alerts:risk_breach"`)
| Event | Payload |
|-------|---------|
| `{:risk_breach, details}` | `%{bot_id, reason, severity, title, message}` |

### Market Data Events
| Topic | Event |
|-------|-------|
| `"ticker:#{symbol}"` | `{:ticker, ticker}` |
| `"kline:#{symbol}:#{tf}"` | `{:kline, candle}` |
| `"candle_closed:#{tf}"` | `{:candle_closed, candle}` |
| `"depth:#{symbol}"` | `{:depth, orderbook}` |
| `"order_flow:#{symbol}"` | `{:order_flow, metrics}` |

---

## 14. Active Bot Status

### Currently Running Bot (from Production DB)

| Field | Value |
|-------|-------|
| **Bot ID** | `e448d90c-4248-4795-913d-dc9abac7363b` |
| **Name** | ETH/USDT |
| **Status** | `running` |
| **Strategy** | Physics Impulse Scalper (`37e85bba-...`) |
| **Market Type** | `usds_futures` |
| **Trading Pair** | `ETH/USDT:USDT-260327` (quarterly delivery future) |
| **Allocated Capital** | $1,000.00 |
| **Active Capital** | $0.00 |
| **Total Trades** | 107 |
| **Total P&L** | -$0.7399 |
| **Win Rate** | — (not yet calculated) |
| **Config** | `{}` (using strategy defaults) |
| **Risk Overrides** | `{}` (using platform defaults) |

**Observations**:
- Bot has executed 107 trades with a small net loss of -$0.74
- Running on Binance USDS-M futures (ETH quarterly delivery)
- Using pure strategy defaults (no bot-level config overrides)
- No active capital currently deployed (no open positions)
- Win/loss breakdown not tracked at bot level yet

---

## Appendix A: Key Formulas Reference

| Concept | Formula | Description |
|---------|---------|-------------|
| Momentum | `slope = Σ[(x-x̄)(y-ȳ)] / Σ[(x-x̄)²]` | Linear regression of prices |
| Gravity | `(vol×0.6) + (decay×0.3) + (rev×0.1)` | Weighted market resistance |
| Peak Time | `t = \|v₀\| / g` | Minutes to momentum exhaustion |
| Peak Price | `P_peak = P₀ + v₀²/(2g)` | Predicted price extreme |
| Trajectory Angle | `θ = arctan(\|v₀\|/g) × 180/π` | Angle of price ascent/descent |
| Kinetic Energy | `E = 0.5 × (price/100) × v₀²` | Momentum strength |
| Price at time t | `P(t) = P₀ + v₀t - 0.5gt²` | Future price prediction |
| Stop Loss | `SL = entry - (impulse × 0.618)` | Golden ratio stop |
| Position Size | `qty = target_profit / impulse_size` | Impulse-based sizing |
| Balance Point | `P₀ + v₀²/(4g)` | Market equilibrium price |

## Appendix B: File Reference

| File | Purpose |
|------|---------|
| `application.ex` | Supervision tree startup |
| `bots/bot_registry.ex` | ETS registry + FSM lifecycle |
| `bots/bot_trading_process.ex` | Per-bot main trading loop |
| `bots/bot_supervisor.ex` | DynamicSupervisor for trading processes |
| `bots/heartbeat_tracker.ex` | Detect stale bots (5s) |
| `trading/order_manager.ex` | Order persistence + broadcasting |
| `trading/position_manager.ex` | Batch position updates |
| `trading/position_pnl_manager.ex` | Real-time P&L (1s) |
| `trading/position_close_manager.ex` | Exit detection (5s) |
| `trading/stale_order_canceller.ex` | Cancel hung orders (30s) |
| `exchanges/executor.ex` | Credential dispatch |
| `exchanges/adapters/binance.ex` | Binance REST adapter |
| `exchanges/adapters/alpaca.ex` | Alpaca adapter |
| `exchanges/binance/rest_client.ex` | Higher-level Binance REST |
| `exchanges/binance/ticker_stream.ex` | Price WebSocket |
| `exchanges/binance/kline_stream.ex` | Candle WebSocket |
| `exchanges/binance/depth_stream.ex` | Order book WebSocket |
| `exchanges/binance/rate_limiter.ex` | Token bucket limiter |
| `exchanges/binance/cache_manager.ex` | ETS cache initializer |
| `exchanges/price_cache.ex` | Multi-exchange price store |
| `exchanges/health_monitor.ex` | Exchange health (30s) |
| `risk/risk_monitor.ex` | Risk enforcement (60s) |
| `risk/capital_allocator.ex` | Virtual balance management |
| `strategies/behaviour.ex` | 7-callback interface |
| `strategies/physics_impulse.ex` | Production strategy |
| `strategies/grid_bot.ex` | Grid trading (complete) |
| `strategies/dca.ex` | DCA (stub) |
| `strategies/mean_reversion_grid.ex` | Mean reversion (stub) |
| `strategies/trend_follower.ex` | Trend following (stub) |
| `physics/signal_generator.ex` | Physics → trading signal |
| `physics/market_projectile.ex` | Core projectile analysis |
| `physics/velocity_analyzer.ex` | Momentum calculation |
| `physics/gravity_calculator.ex` | Market resistance |
| `physics/energy_model.ex` | Energy states |
| `physics/trajectory.ex` | Price path prediction |
| `physics/calculator.ex` | Low-level physics |
| `physics/constants.ex` | Physical constants |
| `physics/projectile.ex` | Order book physics |
| `physics/risk_management.ex` | Physics-based sizing |
| `physics/momentum_validator.ex` | 7-part diagnostics |
| `physics/prediction_tracker.ex` | Prediction accuracy |
| `strategies/backtest_manager.ex` | VectorBT integration |
| `market_data/candle_persister.ex` | ETS → TimescaleDB |
| `infra/monitor.ex` | BEAM metrics (4s) |
| `dashboard/platform_stats_aggregator.ex` | Platform KPIs (60s) |
| `alerts/alert_persister.ex` | Alert storage |
| `alerts/notification_dispatcher.ex` | Alert routing |
