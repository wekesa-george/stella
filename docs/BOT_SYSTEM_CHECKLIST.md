# Bot System — Full Implementation Checklist

> Master tracker for the bot management system across Elixir, NestJS, and Next.js.
> Updated: 2026-02-26

---

## Phase 1 — Data Pipeline Fixes ✅

- [x] `src/lib/types/dashboard.ts` — Bot interface with all 8 statuses + new fields
- [x] `src/lib/api/mappers.ts` — mapApiBotToUiBot, mapWsBotSnapshotToUiBot, normalizeStatus
- [x] `src/hooks/usePhoenixChannel.ts` — BotSnapshot expanded, useBotChannel upserts bot list
- [x] `src/app/dashboard/bot/[id]/page.tsx` — WS overlay correct fields, chart uses tradingPairs
- [x] `src/components/dashboard/bot-card.tsx` — PAUSE wired, all 8 status colors
- [x] `src/app/dashboard/bot-fleet/page.tsx` — Status filter all states, pause/resume handlers

## Phase 2 — Create Bot & Bot Engine Settings ✅

- [x] `src/lib/tradingEngineApi.ts` — createSystemBot, service account CRUD, bot engine defaults
- [x] `src/components/dashboard/deploy-bot-modal.tsx` — Deploy modal (basic, needs wizard upgrade)
- [x] `src/app/dashboard/bot-fleet/page.tsx` — Deploy button wired
- [x] `src/app/settings/bot-engine/page.tsx` — Loads/saves from API
- [x] Elixir: BotEngineDefaults schema, API + controller endpoints

---

## Phase 5 — Strategy Engine Foundation (Current)

### Step A: Strategy Behaviour + PhysicsImpulse Extraction (Elixir) ✅

- [x] `lib/trade_engine/strategies/behaviour.ex` — StrategyBehaviour with 7 callbacks + module resolver
- [x] `lib/trade_engine/strategies/physics_impulse.ex` — Extracted from BotTradingProcess
- [x] `lib/trade_engine/strategies/grid_bot.ex` — Grid bot strategy (stub with behaviour)
- [x] `lib/trade_engine/strategies/dca.ex` — DCA strategy (stub with behaviour)
- [x] `lib/trade_engine/strategies/mean_reversion_grid.ex` — Mean reversion grid (stub with behaviour)
- [x] `lib/trade_engine/strategies/trend_follower.ex` — Trend following (stub with behaviour)
- [x] `lib/bots/bot_trading_process.ex` — Refactored: resolves strategy module, delegates signal/entry/exit/sizing

### Step B: Strategy CRUD Endpoints (Elixir) ✅

- [x] `lib/trade_engine/strategies/strategies.ex` — Context module (list, get, create, update with filters)
- [x] `lib/stubs/sys_admin/strategies/strategy.ex` — Updated with all JSONB fields + changeset
- [x] `lib/api.ex` — list_strategies, get_strategy, create_strategy, update_strategy
- [x] `lib/api/controller.ex` — GET/POST /api/strategies, GET/PUT /api/strategies/:id

### Step C: Exchange/Pairs/Credentials Endpoints (Elixir) ✅

- [x] `lib/stubs/sys_admin/exchanges/platform_exchange.ex` — NEW schema
- [x] `lib/stubs/sys_admin/exchanges/exchange_trading_pair.ex` — NEW schema
- [x] `lib/trade_engine/exchanges/exchanges.ex` — Context (list exchanges, pairs, credentials)
- [x] `lib/api.ex` — list_exchanges, get_exchange, list_trading_pairs, list_user_credentials
- [x] `lib/api/controller.ex` — GET /api/exchanges, /exchanges/:id, /exchanges/:id/trading-pairs, /users/:id/credentials

### Step D: Seed Core Strategies ✅

- [x] `docs/migrations/manual_migrations/09_seed_core_strategies.sql` — All 5 core strategies seeded
- [x] Physics Impulse Scalper: active, is_live_enabled=true, full config JSONB
- [x] Grid Bot, DCA, Mean Reversion Grid, Trend Follower: draft status, config schemas ready

### Step E: Config Resolution Chain (Elixir) — Future

- [ ] `lib/trade_engine/strategies/config_resolver.ex` — Merge strategy.config + user overrides + exchange constraints
- [ ] Wire into BotTradingProcess init (read resolved_config from user_strategies)
- [ ] Update user_strategies Ecto stub with resolved_config field

---

## Phase 3 — Service Accounts Management Page ✅

- [x] `src/app/settings/service-accounts/page.tsx` — Table with list/create/edit/delete
- [x] `src/app/settings/layout.tsx` — Added "Service Accounts" nav item under Operations

## Phase 4 — Trade History & Manual Orders (Pending)

- [ ] Bot detail: Trade history tab
- [ ] Bot detail: Wire "Submit Order" button
- [ ] Bot detail: Display live orders from useOrderChannel

## Phase 6 — Deploy Bot Wizard (depends on 5B, 5C) ✅

- [x] Refactor deploy-bot-modal.tsx into multi-step wizard
- [x] Step 1: Owner type (user/system) — card-style selection
- [x] Step 2: Searchable user table or service account picker
- [x] Step 3: Exchange + trading pairs (multi-select grid) + credential selection
- [x] Step 4: Strategy picker with type badges + live indicator
- [x] Step 5: Bot name + capital + configuration summary + deploy
- [x] `src/lib/tradingEngineApi.ts` — Added listStrategies, getStrategy, listExchanges, getExchange, listTradingPairs, listUserCredentials

## Phase 7 — Strategy Management Page (depends on 5B)

- [ ] `src/app/settings/strategies/page.tsx` — Browse/create/edit strategies
- [ ] Strategy detail view with config editor

---

## Architecture Reference

### Strategy Dispatch Model
```
BotTradingProcess.init →
  strategy_module = resolve_module(bot.strategy.class_module)

BotTradingProcess.handle_info(:candle_closed) →
  signal = strategy_module.generate_signal(candles, context)
  if strategy_module.should_enter?(signal, context) → open position

BotTradingProcess.handle_info(:check_exits) →
  if strategy_module.should_exit?(position, context) → close position
```

### Config Resolution Chain
```
strategy.strategies.config      (core defaults)
  + user_strategies.parameters  (user overrides)
  + exchange constraints        (pair limits, leverage caps)
  → resolved_config             (what bot runs)
  → constraint_sources          (audit trail)
```

### Strategy Types
| DB Enum | Module | Status |
|---------|--------|--------|
| core_momentum | Strategies.PhysicsImpulse | Extract from current code |
| core_grid | Strategies.GridBot | Stub |
| core_dca | Strategies.DCA | Stub |
| core_mean_reversion | Strategies.MeanReversionGrid | Stub |
| core_trend_following | Strategies.TrendFollower | Stub |
| core_arbitrage | — | Future |
| custom_rule_based | — | Future |
| custom_config | — | Future |
