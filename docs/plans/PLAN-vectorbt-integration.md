# VectorBT Integration Plan — Stella Platform

## Overview

VectorBT is a Python backtesting library that runs strategy simulations at high speed using vectorized NumPy operations. It complements Stella by providing **strategy validation before live deployment** and **post-trade performance analysis**.

**Flow**: Strategy defined in Stella DB → VectorBT backtests it against historical OHLCV → Results stored in `strategy.backtest_runs` → Admin reviews metrics in dashboard → Approve & deploy as live bot.

---

## Current State

| Component | Status |
|-----------|--------|
| `strategy.backtest_runs` table | EXISTS in DB, empty, fully structured with 30+ columns |
| `strategy.backtest_status` enum | EXISTS: `queued`, `running`, `completed`, `failed`, `cancelled` |
| `market_data.ohlcv_1m/1h/1d` | EXISTS as TimescaleDB hypertables (currently empty — candles go to ETS only) |
| `strategy.strategies` table | EXISTS with 5 strategies, `is_backtest_enabled` flag |
| `PhysicsBacktest` module | EXISTS in Elixir — in-memory only, no DB persistence |
| BacktestRun Ecto schema | MISSING — old `BacktestResult` schema is misaligned |
| VectorBT Python code | MISSING — no Python anywhere in the codebase |
| Backtest API endpoints | MISSING |
| Backtest admin UI | MISSING |
| OHLCV Ecto schemas | MISSING — no Ecto mapping for `market_data.ohlcv_*` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Admin Dashboard (Next.js)                │
│  Strategy page → "Run Backtest" → Config form → Results view │
└────────────────┬─────────────────────────────┬───────────────┘
                 │ POST /api/backtests          │ GET /api/backtests/:id
                 ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│               Trade Engine (Elixir/Phoenix)                  │
│  BacktestManager GenServer — queue, dispatch, track status   │
│  Writes `strategy.backtest_runs` row (status: queued)        │
│  Broadcasts progress via PubSub → WS channel                │
└────────────────┬─────────────────────────────────────────────┘
                 │ HTTP call to Python worker
                 ▼
┌──────────────────────────────────────────────────────────────┐
│              VectorBT Worker (Python / FastAPI)               │
│  POST /run — receives {strategy_config, pair, timeframe,     │
│              start_date, end_date, initial_capital}           │
│  1. Reads OHLCV from DB (or fetches via CCXT if missing)     │
│  2. Translates strategy config → VectorBT portfolio          │
│  3. Runs backtest                                            │
│  4. Returns metrics + equity_curve + trade_log               │
└──────────────────────────────────────────────────────────────┘
```

**Why a separate Python worker?**
- VectorBT requires Python + NumPy/pandas — can't run in BEAM
- Isolation: heavy computation doesn't block trading processes
- Can scale independently (multiple workers, GPU if needed)
- Can be deployed as a sidecar container or separate service

---

## Phase 1: Foundation (Elixir + DB)

### 1a. Create `BacktestRun` Ecto schema

New file: `apps/trade_engine/lib/trade_engine/strategies/backtest_run.ex`

Maps to the existing `strategy.backtest_runs` table with `@schema_prefix "strategy"`. All 30+ columns.

### 1b. Create `Backtests` context module

New file: `apps/trade_engine/lib/trade_engine/strategies/backtests.ex`

```elixir
defmodule TradeEngine.Strategies.Backtests do
  def create(strategy_id, user_id, config)    # Insert row with status: queued
  def get(id)                                  # Get single run
  def list(filters \\ %{})                     # List by strategy_id, user_id, status
  def list_by_strategy(strategy_id)            # All runs for a strategy
  def update_status(id, status, attrs \\ %{})  # Update status + results
  def update_progress(id, pct, candles)        # Progress callback
  def cancel(id)                               # Set status to cancelled
end
```

### 1c. Add API facade + controller routes

In `api.ex`:
```elixir
def create_backtest(strategy_id, user_id, config)
def get_backtest(id)
def list_backtests(filters)
def cancel_backtest(id)
```

In `controller.ex`:
```
POST   /api/backtests                    # Create (queue) a backtest
GET    /api/backtests                    # List with filters
GET    /api/backtests/:id               # Get single with results
POST   /api/backtests/:id/cancel        # Cancel
GET    /api/strategies/:id/backtests    # List backtests for strategy
```

### 1d. Add `tradingEngineApi.ts` frontend functions

```typescript
export async function createBacktest(config: {...})
export async function getBacktest(id: string)
export async function listBacktests(filters?: {...})
export async function cancelBacktest(id: string)
export async function listStrategyBacktests(strategyId: string)
```

---

## Phase 2: VectorBT Python Worker

### 2a. Project structure

```
stella-vectorbt-worker/
├── pyproject.toml          # Dependencies: vectorbt, fastapi, uvicorn, psycopg2, ccxt
├── Dockerfile
├── app/
│   ├── main.py             # FastAPI app
│   ├── runner.py           # VectorBT execution engine
│   ├── strategy_adapter.py # Translate Stella strategy config → VectorBT signals
│   ├── data_loader.py      # Load OHLCV from DB or fetch via CCXT
│   └── models.py           # Pydantic request/response models
└── README.md
```

### 2b. FastAPI endpoints

```python
POST /run
  Request: {
    backtest_run_id: str,       # UUID from strategy.backtest_runs
    strategy_type: str,         # core_momentum, core_grid, etc.
    config: dict,               # Strategy config snapshot
    trading_pair: str,          # e.g. "BTCUSDT"
    exchange_code: str,         # e.g. "binance"
    timeframe: str,             # e.g. "1h"
    start_date: str,            # ISO 8601
    end_date: str,
    initial_capital: float
  }
  Response: {
    status: "completed" | "failed",
    metrics: {
      final_capital: float,
      total_return_pct: float,
      max_drawdown_pct: float,
      sharpe_ratio: float,
      sortino_ratio: float,
      calmar_ratio: float,
      win_rate: float,
      profit_factor: float,
      total_trades: int,
      winning_trades: int,
      losing_trades: int,
      avg_trade_return_pct: float,
      avg_win_pct: float,
      avg_loss_pct: float,
      largest_win: float,
      largest_loss: float,
      avg_hold_duration_sec: int
    },
    equity_curve: [{timestamp, equity, drawdown}, ...],
    trade_log: [{entry_time, exit_time, side, entry_price, exit_price, pnl, duration_sec}, ...],
    candles_processed: int,
    execution_time_ms: int
  }

GET /health
  Response: { status: "ok", vectorbt_version: "x.y.z" }
```

### 2c. Strategy adapter pattern

Each Stella strategy type maps to a VectorBT signal generation function:

| Stella Type | VectorBT Approach |
|-------------|-------------------|
| `core_momentum` | RSI + MACD crossover signals, configurable thresholds from `config` |
| `core_grid` | Grid levels generated from price range, buy low/sell high |
| `core_dca` | Fixed-interval entries, optional price-drop multiplier |
| `core_mean_reversion` | Bollinger Band mean reversion entries/exits |
| `core_trend_following` | SMA/EMA crossover with ATR-based stops |
| `custom_rule_based` | Parse `entry_conditions`/`exit_conditions` JSON into VectorBT indicator combos |

The adapter reads the strategy's `config`, `entry_conditions`, `exit_conditions`, `indicators`, `default_stop_loss_pct`, `default_take_profit_pct` from the frozen `config_snapshot` and translates them into VectorBT entry/exit signals.

### 2d. Data loading

Priority order:
1. **DB first**: Query `market_data.ohlcv_1m` / `ohlcv_1h` / `ohlcv_1d` based on timeframe
2. **CCXT fallback**: If DB has no data for the requested range, fetch from exchange via CCXT and optionally backfill to DB
3. **Cache**: Store fetched data in a local parquet file for repeat runs

---

## Phase 3: BacktestManager GenServer (Elixir)

### 3a. BacktestManager

New file: `apps/trade_engine/lib/trade_engine/strategies/backtest_manager.ex`

Responsibilities:
- Accept backtest requests, create `backtest_runs` DB row with `status: queued`
- Maintain a queue (max concurrent: configurable, default 3)
- Dispatch to VectorBT worker via HTTP (`Req.post`)
- Poll or receive webhook for completion
- Write results back to `backtest_runs` row
- Broadcast progress updates via PubSub → `backtests:{id}` topic

```elixir
defmodule TradeEngine.Strategies.BacktestManager do
  use GenServer

  def queue_backtest(strategy_id, user_id, config)
  def cancel_backtest(backtest_id)
  def get_queue_status()

  # GenServer callbacks handle:
  # - :process_queue — dequeue next, dispatch to worker
  # - {:backtest_complete, id, results} — write to DB, broadcast
  # - {:backtest_failed, id, error} — write error, broadcast
  # - :check_timeouts — cancel runs stuck > 10 minutes
end
```

### 3b. Configuration

In `platform.bot_engine_defaults` or runtime config:
```elixir
config :trade_engine, :vectorbt,
  worker_url: System.get_env("VECTORBT_WORKER_URL", "http://localhost:8100"),
  max_concurrent: 3,
  timeout_ms: 600_000  # 10 minutes
```

### 3c. WebSocket channel (optional)

Add `BacktestChannel` to `admin_gateway` for real-time progress:
- Topic: `backtest:{run_id}`
- Events: `progress` (pct, candles_processed), `completed` (full results), `failed` (error)

---

## Phase 4: OHLCV Data Pipeline

### 4a. OHLCV Ecto schemas

New files mapping to existing TimescaleDB hypertables:
- `OhlcvCandle1m` → `market_data.ohlcv_1m`
- `OhlcvCandle1h` → `market_data.ohlcv_1h`
- `OhlcvCandle1d` → `market_data.ohlcv_1d`
- `TickerMetadata` → `market_data.ticker_metadata`

### 4b. Candle persistence

Currently, Binance WebSocket streams write to ETS only. Add a `CandlePersister` GenServer that:
1. Subscribes to candle PubSub events
2. Batches completed candles (every 60s or 100 candles)
3. Bulk-inserts into `market_data.ohlcv_1m`
4. TimescaleDB continuous aggregates handle 1h/1d rollups

This is essential — VectorBT needs historical data in the DB, not just live ETS.

### 4c. Historical backfill

Add a mix task or admin endpoint to backfill historical data:
```elixir
# Fetch last 30 days of 1m candles for BTCUSDT from Binance
TradeEngine.MarketData.Backfill.run("binance", "BTCUSDT", "1m", ~U[2026-01-28], ~U[2026-02-28])
```

Uses CCXT or Binance REST API to paginate through historical candles and insert into TimescaleDB.

---

## Phase 5: Admin Dashboard UI

### 5a. Strategy detail page — Backtest tab

On `/dashboard/strategies/:id`, add a "Backtest" tab:
- **Run form**: Trading pair, timeframe, date range, initial capital, config overrides
- **Run history**: Table of past `backtest_runs` with status badges
- **Results view** (click into a completed run):
  - KPI cards: Return %, Sharpe, Max DD, Win Rate, Profit Factor
  - Equity curve chart (LightweightCharts or ApexCharts)
  - Trade log table with entry/exit prices, P&L, duration
  - Drawdown chart overlay
  - Compare button → overlay multiple runs

### 5b. Backtest comparison view

Side-by-side comparison of 2-3 backtest runs:
- Same chart with overlaid equity curves
- Metrics comparison table
- Useful for: different configs, different timeframes, different date ranges

### 5c. Strategy approval workflow

After a backtest passes thresholds (configurable):
- Min Sharpe > 1.0
- Max Drawdown < 20%
- Min Win Rate > 40%
- Min trades > 50

Show a green "Ready for Live" badge. Admin can then deploy a bot using that strategy directly from the backtest results page.

---

## Phase 6: Post-Trade Analysis

### 6a. Live vs Backtest comparison

Once a bot has live trading history, compare:
- Backtest predicted return vs actual return
- Backtest equity curve vs live equity curve
- Slippage analysis (backtest assumes perfect fills)
- Strategy drift detection

### 6b. Automated re-backtesting

Periodic job (weekly) that:
1. Takes each active strategy
2. Re-runs backtest on latest 30/90/180 days
3. Compares metrics to the original approval backtest
4. Alerts if performance degrades beyond threshold

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `stella-vectorbt-worker/` | Entire Python FastAPI project |
| `apps/trade_engine/lib/trade_engine/strategies/backtest_run.ex` | Ecto schema for `strategy.backtest_runs` |
| `apps/trade_engine/lib/trade_engine/strategies/backtests.ex` | Context module |
| `apps/trade_engine/lib/trade_engine/strategies/backtest_manager.ex` | GenServer queue + dispatch |
| `apps/trade_engine/lib/trade_engine/market_data/ohlcv_candle.ex` | Ecto schemas for OHLCV |
| `apps/trade_engine/lib/trade_engine/market_data/candle_persister.ex` | ETS → DB candle writer |
| `apps/trade_engine/lib/trade_engine/market_data/backfill.ex` | Historical data fetcher |
| `stella-nextjs/src/app/dashboard/strategies/[id]/backtest/` | Backtest UI pages |

### Modified Files
| File | Change |
|------|--------|
| `apps/trade_engine/lib/api.ex` | Add backtest facade functions |
| `apps/trade_engine/lib/api/controller.ex` | Add backtest routes |
| `stella-nextjs/src/lib/tradingEngineApi.ts` | Add backtest API functions |
| `apps/trade_engine/lib/trade_engine/application.ex` | Add BacktestManager + CandlePersister to supervision tree |

---

## Implementation Priority

| Phase | Effort | Dependency | Priority |
|-------|--------|------------|----------|
| Phase 1: Foundation | 1 day | None | **Start here** |
| Phase 4: OHLCV pipeline | 1 day | None (parallel with Phase 1) | **High** — data needed first |
| Phase 2: VectorBT worker | 2-3 days | Phase 4 (needs data) | **High** |
| Phase 3: BacktestManager | 1 day | Phase 1 + 2 | **Medium** |
| Phase 5: Dashboard UI | 2-3 days | Phase 1 + 3 | **Medium** |
| Phase 6: Post-trade | 2 days | Phase 5 + live trading data | **Low** (future) |

**Total estimated effort: ~8-10 days**

---

## Configuration & Deployment

### Python Worker
```bash
cd stella-vectorbt-worker
pip install -e .
uvicorn app.main:app --port 8100
```

### Environment Variables
```env
VECTORBT_WORKER_URL=http://localhost:8100   # For Elixir to call
DATABASE_URL=postgresql://postgres:REDACTED@170.168.103.207:3212/stella_platform_new  # For Python to read OHLCV
```

### Docker (production)
```yaml
services:
  vectorbt-worker:
    build: ./stella-vectorbt-worker
    ports: ["8100:8100"]
    environment:
      DATABASE_URL: ${DATABASE_URL}
    deploy:
      resources:
        limits:
          memory: 2G  # VectorBT can be memory-hungry
```
