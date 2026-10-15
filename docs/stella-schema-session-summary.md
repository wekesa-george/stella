# Stella Platform — Schema Design Session Summary

**Date:** February 16, 2026
**Purpose:** Resume context for continued development
**Deliverables produced:** `stella-database.sql` (2,354 lines), `stella-er-diagram.mermaid`

---

## What We Built

A complete PostgreSQL database schema for the Stella algorithmic trading platform — 11 schemas, 49 tables, 182 indexes, 33 enums, 5 functions. The schema covers authentication (Logto), admin RBAC, exchange adapters, trading execution, strategy management with inheritance, billing with Stripe + PegPay, hierarchical risk limits, TimescaleDB market data, Stella One pool accounting, system health monitoring, and a platform-wide event store.

---

## Key Architectural Decisions Made

**Stella is an algorithmic execution layer, not a brokerage.** Users connect their own exchange accounts; capital lives on the exchanges. Stella's job is to run strategies on the user's behalf and track performance. This distinction drove several table removals and reframings throughout the session.

**Admin is fully separated from customers.** `admin.admin_users` is a completely separate identity system from `auth.users`. All admin actions (activating adapters, setting risk limits, approving withdrawals, reviewing KYC) reference `admin.admin_users` with a full RBAC system: 7 roles, 34 permissions, and an immutable audit log with denormalized admin identity for permanence.

**Strategy inheritance model.** Core strategies are Stella-maintained (`is_core: true`, `parent_strategy_id: NULL`). Users create custom strategies by referencing a parent and layering `user_overrides` JSONB on top. Custom risk guardrails (trailing stops, custom SL/TP percentages) live on the strategy. The `trading.user_strategies` table then binds a user's chosen strategy to a specific exchange credential with allocated capital.

**Validation chain for user configs.** When a user configures a strategy, their desired settings flow through: exchange adapter capabilities → enabled asset pair constraints → user credential permissions → tier risk limits → resolved config. The `trading.user_strategies` table stores both the user's intent (`parameters`, `selected_pairs`, `user_stop_loss_pct`) and the validated output (`resolved_config`, `resolved_pairs`, `validation_status`, `constraint_sources`). The bot receives only the resolved config.

**Equity snapshots replaced trading accounts.** We removed `trading.trading_accounts` (brokerage balance ledger) because Stella doesn't hold funds. Instead, `trading.equity_snapshots` captures point-in-time equity at both user-level (aggregate) and per-bot/per-strategy level, with `starting_capital_usd` as the performance baseline. This drives ROI calculations, drawdown monitoring, and dashboard analytics without maintaining an internal balance ledger.

**Monitoring alerts, not price alerts.** `trading.monitoring_alerts` tracks bot health events (bot_error, bot_idle, drawdown_warning, exchange_disconnect, strategy_drift), not manual "notify me when BTC hits $50K" alerts. Users define conditions against their bots and strategies, not against raw price feeds.

**Pool withdrawals scoped to Stella One.** `pool.withdrawal_requests` handles profit withdrawals from the Stella One shared pool only. Paid tier users withdraw directly from their own exchange accounts — Stella isn't in the loop. The withdrawal workflow includes admin approval, blockchain tracking (transaction hash, gas fees, network), and multi-method support.

---

## Tables Removed and Why

| Table | Reason |
|---|---|
| `trading.trading_accounts` | Brokerage concept — Stella doesn't hold user funds, balances live on exchanges |
| `trading.transactions` | Orders + fills + pool.transactions already cover the audit trail |
| `billing.withdrawal_requests` | Moved to `pool.withdrawal_requests`, scoped to Stella One only |

## Tables Reframed

| Original | Became | Reason |
|---|---|---|
| `trading.trading_alerts` | `trading.monitoring_alerts` | Bot/strategy health monitoring, not manual price alerts |
| `trading.user_strategies` | Enhanced with resolved_config | Now carries the full validation chain output |

---

## Trading Engine Assessment Findings

Three documents were analyzed: the trading engine architecture doc, a schema analysis verification, and a comprehensive engine reality report. Here's what we found:

### The Engine Has Two Evolutionary Stages

**v1 (`signal_trader1.ex`, Nov 30 – Dec 6):** Wrote positions directly to `trading_positions` via Ecto. Produced 31,468 position rows across 30+ symbols and ~200 users. No corresponding transaction records from this period.

**v2 (`signal_trader.ex`, Dec 8 – Dec 13):** Stores positions in GenServer memory only. Writes transactions via `TestnetExecutor.log_transaction()`. Produced 2,197 transaction records. The two periods never overlapped — v2 replaced v1 after a 2-day gap (Dec 6–8) suggesting a system reconfiguration.

### Critical Data Integrity Issues

**Zero positions ever closed.** All 31,468 positions have `status = 'open'`. Despite 67 successful spot_sell transactions on Dec 13, no position row was ever updated to `closed`. The exit path is broken — the engine executes sells on the exchange but never updates the database.

**Position-transaction disconnect.** Every transaction has `position_id = NULL`. There is no foreign key link between any transaction and any position. The 71 successful buys and 67 successful sells from Dec 13 cannot be matched to positions. Realized P&L cannot be reconstructed from existing data.

**87% failure rate during Dec 8–12.** 1,911 failed buy attempts: 1,542 insufficient balance errors, 344 invalid API key errors, 26 timestamp errors. All caused by global env var credentials pointing to a misconfigured or empty testnet account. On Dec 13, something was fixed and success rate jumped to 94.4%.

**Orders table completely empty.** `trading_orders` has 0 rows. The engine goes Signal → Exchange API → Transaction log, skipping the order lifecycle entirely. No order state tracking (NEW → PARTIALLY_FILLED → FILLED), no partial fill handling, no cancellation records.

### What the Engine Does Well

**Physics model is implemented and producing data.** `trading.predictions` has 6,903 rows with physics parameters (p0, v0, acceleration, r_squared, predicted signals, confidence scores). The `trading.positions` table carries physics columns (momentum, gravity, peak_price, peak_time, trajectory_angle, kinetic_energy, energy_state). This is Stella's core IP and it works.

**Transaction logging captures rich context.** Successful transactions include exchange order ID, client order ID, executed quantity, executed price, confidence score, peak_price, peak_time, and raw Binance API response. Failed transactions capture error messages with Binance error codes. This pattern is correct — it just needs to write to `trading.orders` + `trading.fills` instead of a flat transactions table.

**The bot can execute.** Dec 13 proves the execution path works: 71 buys and 67 sells executed successfully on Binance testnet with a 94.4% success rate. The `TestnetExecutor` correctly signs requests, handles rate limiting, and parses responses.

### Signal-to-Execution Chain: Current vs Required

**What the engine does today:**
```
candle_closed:5m
  → Physics.MarketProjectile.analyze_projectile()
  → Physics.SignalGenerator.generate_signal()
  → SignalTrader filters by confidence
  → TestnetExecutor.place_order() [Binance API]
  → log_transaction() → INSERT trading_transactions
  → Position stored in GenServer state (v2) or DB (v1)
  → No order record, no fill record, no equity snapshot
```

**What Stella's schema requires:**
```
candle_closed:5m
  → Physics engine → INSERT trading.predictions
  → Signal generator → INSERT strategy.signals (with prediction_id)
  → Bot validates against:
      risk.limit_configs, exchange.enabled_asset_pairs,
      trading.user_strategies.resolved_config
  → INSERT trading.orders (status: pending)
  → Submit to exchange via encrypted credential
  → INSERT trading.fills (from exchange response)
  → UPDATE trading.orders (status: filled)
  → INSERT/UPDATE trading.positions
  → INSERT trading.equity_snapshots (per-bot + user aggregate)
  → On exit: UPDATE position (closed), capture hold_duration, exit_reason, realized_pnl
```

---

## Recommended Engine Changes (Priority Order)

### 1. Find and Consolidate the Position Writer
Determine exactly which module writes to `trading_positions`. Run `grep -r "Repo.insert" --include="*.ex" | grep -i position` across the codebase. Merge v1's database persistence with v2's in-memory performance using a hybrid model: ETS for hot cache during trading, Ecto for persistence on every state change, ETS populated from DB on bot restart.

### 2. Build the Order Lifecycle
Refactor `TestnetExecutor` to create a `trading.orders` row before calling the exchange API and a `trading.fills` row after receiving the response. The order carries the full intent (side, type, quantity, price, strategy context); the fill carries the execution result. This is the foundation everything else depends on.

### 3. Fix the Exit Path
Every position close must: execute the sell order on the exchange, update `trading.positions` (status → closed, exit_price, realized_pnl_usd, hold_duration_sec, exit_reason, exit_order_id), and capture an equity snapshot. The current engine executes sells but never updates positions — this must be atomic.

### 4. Seed "Impulse Scalping" as a Core Strategy
Move the hardcoded config from SignalTrader module attributes into a `strategy.strategies` row: `is_core: true`, `type: 'core_momentum'`, `config` JSONB containing `target_profit_usd`, `min_impulse_pct`, `max_hold_minutes`, `min_confidence_long`, `min_confidence_short`. All positions and signals should reference this strategy_id.

### 5. Replace Env Var Credentials with Per-User Encrypted Credentials
Refactor `TestnetExecutor` function signatures from `execute_long(symbol, quantity, opts)` to `execute_long(credential, symbol, quantity, opts)` where credential is a decrypted struct from `exchange.user_credentials`. Remove hardcoded fallback API keys from `application.ex`.

### 6. Move from Global Bot to Per-User Bot Spawning
Current: one global SignalTrader auto-starts on app boot. Stella: each `trading.user_strategies` row with `is_active: true` and `validation_status: 'valid'` spawns a dedicated bot GenServer. Each bot manages only its own positions, tracked by `bot_id` foreign keys throughout the schema.

### 7. Wire Up Risk Limits
Replace `VirtualBalanceManager` (in-memory) with the database risk chain: `risk.limit_configs` (hierarchical limits), `trading.equity_snapshots` (tracked equity), and `risk.circuit_breaker_events` (automatic halt on threshold breach). The `risk.get_effective_limit()` function cascades global → tier → user limits.

### 8. Handle Simulated Shorts Properly
75 simulated_short and 72 simulated_cover transactions show the engine tries to short on Binance spot (impossible). In Stella: `exchange.adapters.execution_capabilities` declares whether an exchange supports margin/futures. When a strategy generates a short signal on a spot-only credential, the bot should skip it or route to a futures credential. Paper P&L mixed with real P&L corrupts performance metrics — simulated trades must not exist in production.

### 9. Add prediction_id to strategy.signals
Currently three tables store overlapping physics data (predictions, signals, positions) with no linkage. Add a `prediction_id` FK on `strategy.signals` so the chain is: prediction → signal → order → fill → position. Each layer references the one before it.

---

## Data Migration Guidance

**Migrate (high value):**
- 6,903 predictions → `trading.predictions` (clean physics model outputs, highest value)
- 138 successful transactions (71 buys + 67 sells from Dec 13) → split into `trading.orders` + `trading.fills` as proof of execution capability
- 31,468 positions → archive as backtest training data, NOT as live positions (all are orphaned `status: open` with no exit data)

**Skip (low value):**
- 1,912 failed transactions (config error noise)
- 147 simulated transactions (paper trading, corrupts real metrics)
- 3,002 seed data rows (test users, fake KYC, unused trading_accounts)

**Do not migrate the 31,468 positions into `trading.positions` as live data.** They have no corresponding orders, no fills, no exits, no realized P&L, and would pollute every dashboard metric and equity calculation from day one. Preserve them in a separate analytics/backtest table for strategy validation.

---

## Schema Files Produced

| File | Contents |
|---|---|
| `stella-database.sql` | Complete migration — DDL, indexes, enums, functions, seed data, retention policies, comments (2,354 lines) |
| `stella-er-diagram.mermaid` | Full ER diagram with all 49 tables and relationships |

Both files are internally consistent: all FK references resolve, no orphan indexes, no stale comments, seed data included for plans, tiers, limits, roles, permissions, and exchange adapters.

---

## Open Questions for Next Session

1. Where exactly does `signal_trader1.ex` write positions — need to trace the full Repo.insert path and confirm the Ecto schema/changeset
2. Is there a batch persistence module that flushes GenServer state to DB periodically (explains the 31k rows)?
3. How should multi-horizon predictions (P1/P2/P3 at 5m/15m/30m) be stored — multiple rows per `run_id` or structured JSONB?
4. Should we add `core_physics_impulse` to the `strategy.strategy_type` enum for the Impulse Scalping strategy, or is `core_momentum` sufficient?
5. What's the plan for the 5-minute candle aggregation — continue handling in Elixir via PubSub, or add a TimescaleDB continuous aggregate from 1m source?
6. How do we handle the transition period — run old engine alongside new Stella engine, or cut over?
