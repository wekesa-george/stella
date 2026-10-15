# Mission Critical Dashboard — Gap Analysis

## Database Reality (as of 2026-03-07)

| Data Source | Rows | Notes |
|---|---|---|
| `trading.bots` | **1** | "BTC/USDT Binance Futures Bot(TestNet)" — status: `error`, 19 errors, 8 trades (all wins), $8k allocated, $0 active |
| `trading.positions` | **0** | No positions ever opened successfully |
| `trading.orders` | **0** | No orders in DB |
| `trading.fills` | **0** | No fills |
| `trading.equity_snapshots` | **0** | No equity history |
| `trading.bot_logs` | **265** | Bot activity logs exist |
| `trading.bot_state_transitions` | **5** | initializing → running → error cycles |
| `trading.monitoring_alerts` | **0** | User-defined alert rules — NOT system alerts |
| `platform.system_alerts` | **197** | Actual system alerts (181 bot warnings, 13 service health, 3 warnings) |
| `platform.service_health_checks` | **66,647** | 7 services monitored: binance_mainnet, binance_testnet, coolify, email, telegram, webhook, kyc |
| `platform.risk_controls` | **1** | Singleton config: 10% drawdown, 5% daily loss, 15% circuit breaker, 5x max leverage |
| `platform.service_accounts` | **2** | "System Trading" + "System Testing" (both active) |
| `risk.circuit_breaker_events` | **0** | Never triggered |
| `risk.limit_configs` | **26** | Scoped risk limits configured |
| `exchange.adapters` | **4** | Binance (active), Alpaca (active), Hyperliquid (inactive), Robinhood (inactive) |
| `exchange.user_credentials` | **2** | Both on "System Testing" SA: Binance (sandbox) + Alpaca (sandbox) |
| `operations.shifts` | **11** | Shift handoff data exists |
| `operations.incidents` | exists | Incident management functional |
| `finance.*` | **all 0** | fees_collected, risk_metrics, strategy_stats, subscriptions — all empty |
| `market_data.*` | **all 0** | ohlcv_1m/1h/1d, ticker_metadata — all empty |

## The Single Bot

- **Name**: BTC/USDT Binance Futures Bot(TestNet)
- **Status**: `error` — "Order's notional must be no smaller than 100"
- **Market type**: `usds_futures` (Binance testnet)
- **Credential**: `4c8ba41b` → Binance adapter (sandbox), owned by "System Testing" SA
- **Service Account**: `a9984b3a` ("System Testing") — bot has NO user_id
- **Capital**: $8,000 allocated, $0 active
- **Last heartbeat**: 2026-03-05 (2 days stale)
- **Error count**: 19, **Total trades**: 8, **Winning**: 8, **Losing**: 0

---

## Card-by-Card Wiring Assessment

### TIER 1 — Ready to wire (has real data NOW)

| Card | Data Source | Backend | Notes |
|---|---|---|---|
| **Service Health** | `useInfraChannel()` → `service_health_snapshot` | Phoenix WS | 66K health checks, 7 services with latency + uptime |
| **Platform Uptime** | `getServiceHealth()` REST | Phoenix REST | Same data source, historical view |
| **API Latency** | `useInfraChannel()` → `infra_snapshot` / `infra_update` | Phoenix WS | BEAM VM metrics, DB pool stats, response times |
| **Bot Fleet Table** | `useBotChannel()` → `bots` array | Phoenix WS | 1 bot with real status, P&L, heartbeat |
| **Bot Fleet Gauge** | Same as above | Phoenix WS | 0/1 running (derived) |
| **Heartbeats** | `useBotChannel()` → `bot_heartbeat` events | Phoenix WS | Last heartbeat tracked per bot, >60s = stale |
| **Incidents** | `platform.system_alerts` via Phoenix `useAlertChannel()` | Phoenix WS | 197 real alerts — bot errors, service transitions |

### TIER 2 — Ready to wire (will show zeros, correct when trading starts)

| Card | Data Source | Backend | Notes |
|---|---|---|---|
| **Platform Equity** | `usePlatformChannel()` → `stats.positions.total` / PnL | Phoenix WS | PlatformStatsAggregator queries DB every 60s |
| **24h Realized P&L** | `usePlatformChannel()` → `stats.pnl.realized_today` | Phoenix WS | Will be $0 until positions close |
| **Open Positions** | `usePlatformChannel()` → `stats.positions.open` | Phoenix WS | Currently 0 |
| **Live Order Stream** | `useOrderChannel()` → `order_created/filled/cancelled/failed` | Phoenix WS | Will populate when bots trade |
| **Failed Orders** | `useOrderChannel()` → count `order_failed` events | Phoenix WS | Client-side rolling window |
| **Circuit Breakers** | Derive from `useBotChannel()` → bots with `status === 'circuit_broken'` | Phoenix WS | 0 currently, `bot_status` enum has `circuit_broken` value |
| **Max Drawdown** | `usePlatformChannel()` or `getFinanceRiskOverview()` | Mixed | `finance.risk_metrics` empty; could derive from equity snapshots when they exist |

### TIER 3 — Needs PlatformStatsAggregator enhancements (Elixir change)

| Card | What's Missing | Current State | Required Change |
|---|---|---|---|
| **Win Rate** | Not in platform stats | BotRegistry tracks `winning_trades`/`losing_trades` per bot | Add `win_rate` to PlatformStatsAggregator: `SUM(winning) / SUM(winning + losing) * 100` |
| **24h Volume** | Not computed | Orders table has `quantity * price` but no aggregation | Add `volume_24h` to PlatformStatsAggregator: `SUM(quantity * avg_fill_price)` for filled orders today |
| **Trades Today** | Not in platform stats | `orders.filled_today` exists but returns count, not trades | Already partially there — `stats.orders.filled_today`. May need renaming |
| **Fill Rate** | Not tracked | Orders have statuses but no fill rate computation | Client-side: `filled / (filled + cancelled + failed + rejected) * 100` from order stream, OR add to aggregator |

### TIER 4 — Needs backend implementation (Elixir change)

| Card | What's Missing | Why | Required Change |
|---|---|---|---|
| **Avg Slippage** | Not tracked anywhere | Executor dispatches orders but doesn't compare expected vs fill price | Track `expected_price` (from signal/limit) vs `avg_fill_price` (from fill) in Executor or fill pipeline. Store rolling average. |
| **Avg Exec Time** | Not tracked anywhere | `submitted_at` and `first_fill_at` columns exist on `trading.orders` but are never populated | Populate `submitted_at` when order dispatched, `first_fill_at` on first fill callback. Compute `AVG(first_fill_at - submitted_at)` in aggregator. |

### TIER 5 — Exchange Adapters Card (needs new endpoint + balance support)

| Component | Current State | What's Needed |
|---|---|---|
| **Service Account selection** | 2 SAs in DB ("System Trading", "System Testing") | Frontend: `listServiceAccounts()` → dropdown/selector |
| **Credentials per SA** | 2 creds on "System Testing": Binance + Alpaca (both sandbox) | Frontend: `listServiceAccountCredentials(saId)` → list exchanges with creds |
| **Exchange health/latency** | Available via `useInfraChannel()` → `exchange_health_snapshot` | Already wirable — shows status, latency per exchange |
| **Live exchange balances** | **NO endpoint exists** | **New Phoenix endpoint needed**: `GET /api/credentials/:id/balance` |
| **Futures balance** | Binance adapter only has `get_account` for spot (`/v3/account`). Bot runs on `usds_futures` (`/fapi`) | **New adapter function needed**: `get_futures_account(credentials)` calling `/fapi/v2/account` |
| **Pairs count** | `exchange.exchange_trading_pairs` — Binance: 4,236 pairs, Alpaca: 73 | Available via `getAdapterTradingPairs(adapterId)` or NestJS `GET /settings/exchanges/:id/trading-pairs/stats` |
| **Allocated capital per exchange** | Derivable from `useBotChannel()` → sum `allocated_capital` grouped by exchange | Client-side computation from bot data |

#### Exchange Balance Endpoint — Implementation Plan

1. **Phoenix Router** — add `GET /api/credentials/:id/balance` (authenticated)
2. **New Controller action** — resolve credential via Executor, call adapter's `get_account`/`get_futures_account`
3. **Binance adapter** — add `get_futures_account(credentials)`:
   ```elixir
   def get_futures_account(credentials) do
     case signed_request(:get, futures_url(credentials) <> "/v2/account", %{}, credentials) do
       {:ok, %{"assets" => assets}} ->
         non_zero = Enum.filter(assets, fn a ->
           {wb, _} = Float.parse(a["walletBalance"] || "0")
           wb > 0
         end)
         {:ok, %{assets: non_zero, totalWalletBalance: ...}}
       error -> error
     end
   end
   ```
4. **Alpaca adapter** — `get_account` already returns account data via `/v2/account`
5. **Frontend** — call balance endpoint per credential, display in Exchange tile

#### Interim Approach (no backend changes)

Wire Exchange card with what's available today:
- SA selector via `listServiceAccounts()`
- Credentials via `listServiceAccountCredentials(saId)`
- Health/latency via `useInfraChannel()` → `exchange_health_snapshot`
- Capital via `useBotChannel()` → `allocated_capital` per bot grouped by exchange
- Pairs count from adapter config
- Show "Balance: requires endpoint" placeholder

### TIER 6 — NestJS Alerts API Bug

| Issue | Details |
|---|---|
| **Wrong table** | NestJS `GET /alerts` queries `trading.monitoring_alerts` (0 rows) — these are user-defined alert rules |
| **Correct table** | System alerts live in `platform.system_alerts` (197 rows) — written by Elixir AlertPersister |
| **Impact** | Dashboard Incidents card and Alerts page will show 0 alerts via NestJS API |
| **Fix** | Either: (a) Create new NestJS entity pointing to `platform.system_alerts`, or (b) Use Phoenix AlertChannel WS exclusively for alert data |
| **AlertChannel works** | Phoenix WS `alerts:platform` correctly reads from `platform.system_alerts` and pushes `new_alert` events + `alert_snapshot` on join |

---

## Capital Allocation Card

| Component | Current State | Notes |
|---|---|---|
| **CapitalAllocator GenServer** | Has `get_dashboard_status/1` returning full allocation breakdown | Per-user, tracks total/active/reserved capital, scaling mode, drawdown, win rate |
| **REST endpoint** | `GET /api/capital` exists in frontend client (`getAllCapitalAllocations()`) | Needs verification that Phoenix actually serves this route — NOT in router.ex currently |
| **Missing route** | Phoenix router has NO `/api/capital` endpoint | Need to add controller + route, or expose via PlatformChannel |
| **Data available** | CapitalAllocator stores in ETS `:capital_allocations` | Data exists in memory when bots are running; empty when no bots active |

---

## Summary: Implementation Priority

| Phase | Scope | Cards Affected | Backend Changes? |
|---|---|---|---|
| **Phase 1** | Wire 7 Tier 1 cards (real data exists) | Service Health, Uptime, Latency, Bot Fleet (table+gauge), Heartbeats, Incidents | None — frontend only |
| **Phase 2** | Wire 7 Tier 2 cards (will show zeros gracefully) | Equity, P&L, Open Positions, Orders, Failed Orders, Circuit Breakers, Drawdown | None — frontend only |
| **Phase 3** | Wire Exchange card with available data | Exchange Adapters | None — frontend only (interim) |
| **Phase 4** | Extend PlatformStatsAggregator | Win Rate, Volume, Trades Today, Fill Rate | Elixir: ~50 lines in aggregator |
| **Phase 5** | Add balance endpoint + futures support | Exchange Adapters (full) | Elixir: new route + controller + adapter function |
| **Phase 6** | Add execution metrics tracking | Avg Slippage, Avg Exec Time | Elixir: modify Executor/fill pipeline |
| **Phase 7** | Fix NestJS alerts table reference | Alerts consistency across pages | NestJS: new entity or query change |
| **Phase 8** | Add capital allocation endpoint | Capital Allocation card | Elixir: new route + controller |

### Effort Estimates

- **Phase 1-3** (frontend only): All existing APIs/WS hooks, follow mission-control pattern
- **Phase 4** (aggregator): Small Elixir change, add 4-5 fields to existing GenServer
- **Phase 5** (balances): Medium — new endpoint, adapter function, credential resolution
- **Phase 6** (execution metrics): Medium — instrument fill pipeline, new aggregation
- **Phase 7** (alerts fix): Small — entity change or query redirect
- **Phase 8** (capital): Small — expose existing GenServer data via REST

---

## Data Flow Reference

```
                    ┌──────────────────┐
                    │   PostgreSQL DB   │
                    │ (170.168.103.207) │
                    └───────┬──────────┘
                            │
              ┌─────────────┼─────────────┐
              │                           │
     ┌────────┴────────┐        ┌─────────┴─────────┐
     │  Elixir Phoenix  │        │   NestJS Admin    │
     │   (port 4000)    │        │   (port 3001)     │
     │                  │        │                   │
     │ GenServers:      │        │ Modules:          │
     │ • BotRegistry    │        │ • Finance         │
     │ • PlatformStats  │        │ • Alerts (WRONG   │
     │ • PositionPnL    │        │   TABLE!)         │
     │ • RiskMonitor    │        │ • Incidents       │
     │ • CapitalAlloc   │        │ • Settings        │
     │ • AlertPersister │        │ • Shifts          │
     │                  │        │                   │
     │ WebSocket:       │        │ REST:             │
     │ • bot:lobby      │        │ • /finance/*      │
     │ • positions:*    │        │ • /alerts         │
     │ • orders:*       │        │ • /incidents/*    │
     │ • infra:metrics  │        │ • /settings/*     │
     │ • platform:stats │        │ • /shift/*        │
     │ • alerts:platform│        │                   │
     │                  │        │                   │
     │ REST (fallback): │        │                   │
     │ • /api/phoenix/* │        │                   │
     └────────┬─────────┘        └─────────┬─────────┘
              │                            │
              └──────────┬─────────────────┘
                         │
              ┌──────────┴──────────┐
              │   Mission Critical   │
              │   Dashboard (Next)   │
              │                      │
              │ Uses:                │
              │ • useBotChannel()    │
              │ • usePlatformChannel │
              │ • useAlertChannel()  │
              │ • useOrderChannel()  │
              │ • useInfraChannel()  │
              │ • REST fallback      │
              └──────────────────────┘
```
