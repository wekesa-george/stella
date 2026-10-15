# Plan: Make Mission Critical Dashboard Fully Live

## Current State

The Mission Critical page has **27 data sections** fed by **5 WebSocket channels** and **12+ REST endpoints**. Most sections already receive live data, but several have gaps that make them show stale or incomplete data.

### What's Already Live (WebSocket) ✅
| Section | WS Channel | Tick Rate |
|---|---|---|
| Bot Fleet (status, heartbeat) | BotChannel | on-change |
| P&L Card | PlatformChannel | 60s |
| Win Rate Card | BotChannel | on-change |
| Open Positions Card | PlatformChannel | 60s |
| Circuit Breaker Card | PlatformChannel | 60s |
| Volume 24h Card | PlatformChannel | 60s |
| Trades Today | PlatformChannel | 60s |
| Latency Chart | InfraChannel | 4s |
| Services Card | InfraChannel | 4s |
| Exchange Gate Card | InfraChannel | 4s |
| Uptime Card | InfraChannel | 4s |
| Live Order Stream | OrderChannel | on-change |
| Alerts | AlertChannel | on-change |
| Heartbeat Health | BotChannel | on-change |
| All risk cards (slippage, correlation, credential health, reconciler, etc.) | PlatformChannel | 60s |

### What's REST-Only (polled, stale after fetch) ⚠️
| Section | Endpoint | Stale Time | Issue |
|---|---|---|---|
| Platform Equity Curve | `getPlatformEquityCurve(200)` | 30s | Chart only updates on page refresh or React Query refetch |
| Capital Allocation | `getAllCapitalAllocations()` | 30s | Static after mount |
| Incidents tab | `getOpenIncidents(30)` | 15s | No WS channel for incidents |
| Exchange Adapter balances | `getCredentialBalance()` | Manual | Only refreshes on button click |
| Coolify container status | `getInfrastructureStatus()` | 30s | NestJS endpoint, no WS |

### What's Broken or Missing ❌
| Issue | Impact |
|---|---|
| Kill switch calls stub endpoint | Fixed — now calls `/api/bots/kill-all` |
| Exchange Positions modal close doesn't work | Fixed — `reduceOnly` added |
| Order prices show 0 | Fixed — `execution_price` fallback |
| Balance shows $0 in reconciliation | Fixed — key mismatch `total_balance` vs `total_wallet_balance` |
| Position reconciler symbol mismatch | Fixed — delivery futures normalization |

---

## Plan: Make Everything Live

### Phase 1: Add Polling to REST-Only Components (No Backend Changes)

These sections use React Query but don't have `refetchInterval`. Add polling.

#### 1.1 Platform Equity Curve — poll every 60s
**File:** `page.tsx` — `useMCEquityCurve` hook
**Change:** Add `refetchInterval: 60_000` to React Query options
**Why:** Equity curve should update as bots make/lose money

#### 1.2 Capital Allocation — poll every 60s
**File:** `page.tsx` — `useMCCapital` hook
**Change:** Add `refetchInterval: 60_000`
**Why:** Capital changes as bots lock/unlock capital for grid orders

#### 1.3 Incidents — poll every 15s
**File:** `page.tsx` — `useMCIncidents` hook
**Change:** Add `refetchInterval: 15_000`
**Why:** No WS channel exists for incidents. 15s keeps it reasonably fresh.

#### 1.4 Exchange Adapter Balances — auto-refresh every 30s
**File:** `page.tsx` — `fetchBalances` function
**Change:** Add `useEffect` with `setInterval(fetchBalances, 30_000)` when exchange card is visible
**Why:** Currently only refreshes on manual button click. Balance changes as positions gain/lose.

---

### Phase 2: Improve WS → UI Data Flow (No Backend Changes)

#### 2.1 Order Stream — show order price + fill price
**File:** `page.tsx` — Live Order Stream rendering
**Change:** Display `order_price` for unfilled and `execution_price` for filled, like the bot detail page fix
**Why:** Currently shows 0 for limit orders

#### 2.2 Bot Fleet — show sparklines from real equity data
**File:** `page.tsx` — Bot Fleet sidebar
**Change:** Currently uses deterministic pseudo-random sparklines from bot ID. Replace with real equity curve data (same as bot-fleet page sparklines).
**Why:** Fake sparklines mislead operators

#### 2.3 Platform Stats — handle missing/null fields gracefully
**File:** `page.tsx` — multiple risk cards
**Change:** Add null checks for `platformStats.risk.*` fields that may not exist yet
**Why:** First few minutes after engine start, platform stats are empty → cards show errors or 0

---

### Phase 3: Add Missing WS Events (Backend Changes Required)

#### 3.1 Position Updates via WS
**Current:** Open positions count comes from `platformStats` (60s). Individual position PnL is not streamed.
**Change:** The PositionChannel (`positions:lobby`) already exists. Ensure `sync_exchange_positions_to_db` broadcasts position updates to the channel.
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex` — `sync_exchange_positions_to_db`
**Broadcast:** After updating position in DB, broadcast to `positions:{bot_id}` channel

#### 3.2 Grid Order Fill Events via WS
**Current:** Order fills are detected by polling exchange every 10s. The fill result is logged but not broadcast to the OrderChannel.
**Change:** After `process_grid_fill`, broadcast the fill event to `orders:{bot_id}` channel
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex` — `process_grid_fill`
**Why:** Live Order Stream would show fills in real-time instead of waiting for REST poll

#### 3.3 Equity Curve via WS
**Current:** Equity curve fetched via REST every 30s.
**Change:** When `record_equity_snapshot` runs (every stats sync, 60s), broadcast the latest point to `platform:stats` channel
**File:** `apps/trade_engine/lib/bots/bot_registry.ex` — stats sync handler
**Why:** Equity chart updates live without polling

---

### Phase 4: Data Quality & Accuracy

#### 4.1 Reconcile open orders count
**Current:** `DB Open Orders: 71` but exchange has 8. The 63 extras are stale duplicates.
**Change:** After deploying fix #21 (float precision), run reconciliation to clean up:
- Cancel duplicate exchange orders (keep 1 per price level)
- Mark stale DB orders as cancelled
**Action:** Manual via `POST /api/reconciliation/clean-stale`

#### 4.2 Ensure PnL accuracy
**Current:** Bot PnL ($23.55) is from fill logs. Verify against actual exchange trade history.
**Change:** Add a `reconcile_trades` action that compares DB fills against exchange `userTrades` API
**Endpoint:** Already exists at `GET /api/reconciliation/trades/:credential_id`

#### 4.3 Position sync accuracy
**Current:** Position adoption works but reconciler shows orphans due to symbol mismatch (now fixed).
**Verify:** After deploy, reconciler should show Matched: 1, Orphaned: 0

---

## Implementation Order

| Priority | Task | Effort | Impact |
|---|---|---|---|
| 1 | Phase 1 (polling intervals) | 30 min | High — all REST sections become live |
| 2 | Phase 2.1 (order prices) | 15 min | Medium — operators see real prices |
| 3 | Phase 4.1 (cleanup stale orders) | 10 min | High — accurate order counts |
| 4 | Phase 3.2 (grid fill WS broadcast) | 30 min | High — real-time fill visibility |
| 5 | Phase 3.1 (position WS broadcast) | 20 min | Medium — live position tracking |
| 6 | Phase 2.2 (real sparklines) | 30 min | Low — cosmetic improvement |
| 7 | Phase 3.3 (equity WS) | 20 min | Low — equity updates 60s faster |
| 8 | Phase 2.3 (null safety) | 15 min | Low — prevents edge case errors |

**Total estimate: ~3 hours**

---

## Files to Modify

### Frontend (stella-nextjs)
- `src/app/dashboard/mission-critical/page.tsx` — polling intervals, order price display, sparklines

### Backend (stella_platform_umbrella)
- `apps/trade_engine/lib/bots/bot_trading_process.ex` — broadcast fills + position updates to WS
- `apps/trade_engine/lib/bots/bot_registry.ex` — broadcast equity snapshot to WS
- `apps/admin_gateway/lib/admin_gateway_web/channels/order_channel.ex` — handle fill broadcasts
- `apps/admin_gateway/lib/admin_gateway_web/channels/position_channel.ex` — handle position broadcasts
