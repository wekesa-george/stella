# Grid Bot Lifecycle Fixes Checklist

## Context
Tested full grid bot lifecycle on Binance testnet (2026-03-14). The grid bot places limit orders but they never fill because of several issues. This checklist tracks all fixes needed to get the grid bot producing real trades and profit.

**Testnet credential:** `4c8ba41b-f086-44e9-ac9d-6240fbd6619f` (Binance Sandbox, dev DB)
**Prod credential (shared):** `44baf44d-bf84-4958-9b55-24885ea4c9d1`

---

## Fixes

### 1. [DONE] Bots cancel each other's orders on shared credentials
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex`
**Problem:** `cancel_all_exchange_orders_for_symbol` and `reconcile_grid_orders_with_exchange` fetch ALL open orders for the credential and cancel anything not in local state. With shared credentials, Bot A cancels Bot B's orders.
**Fix:** Filter by `clientOrderId` prefix (first 8 chars of bot_id) before cancelling. Only touch orders belonging to this bot.
**Commit:** `b0d586a`

### 2. [DONE] `reduceOnly` missing on close_long/close_short
**File:** `apps/trade_engine/lib/trade_engine/exchanges/adapters/binance.ex`
**Problem:** Close position orders don't include `reduceOnly=true`. On one-way mode (positionSide=BOTH), a SELL meant to close a LONG opens a new SHORT instead.
**Fix:** Added `reduceOnly: "true"` for futures in both `close_long` and `close_short`. Also added hedge mode detection — uses `positionSide` instead of `reduceOnly` when account is in hedge mode.
**Commit:** `0985c1a` + subsequent hedge mode commit

### 3. [DONE] Hedge mode detection
**File:** `apps/trade_engine/lib/trade_engine/exchanges/adapters/binance.ex`
**Problem:** Binance rejects orders with both `reduceOnly` and `positionSide`. Need to detect which mode the account uses.
**Fix:** Added `get_position_mode/2`, `get_hedge_mode/1` (cached per process), `is_hedge_mode?/2`, and `maybe_add_position_side/3`. All order functions now auto-detect and use the correct params.

### 4. [DONE] `buy_orders_placed: 0` counter bug
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex`
**Problem:** Counter calculates `map_size(state.grid_orders) - current_order_count` but when price levels overlap (same rounded price), the map doesn't grow and counter shows 0.
**Fix:** Changed to `map_size(state.grid_orders) - pre_buy_count` / `pre_sell_count` — captures actual delta from each placement phase.
**Commit:** `b0d586a`

### 5. [DONE] Counter-orders after grid fill need `reduceOnly` for futures
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex`
**Function:** `process_grid_fill` → calls `place_grid_limit_order`
**Problem:** When a BUY fills (opening a LONG), the bot places a counter SELL one level above. This SELL should close the LONG (`reduceOnly=true`), but `place_grid_limit_order` places a plain SELL which opens a new SHORT instead. Same issue in reverse for sell fills.
**Fix needed:** Pass a `reduce_only: true` option through `place_grid_limit_order` → `OrderManager.place_limit_order` → Binance adapter for counter-orders. The initial grid placement orders should NOT be reduceOnly (they open positions). Only counter-orders should be.

### 6. [DONE] Min notional validation hardcoded ($5 futures, $10 spot)
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex` line ~1283
**Problem:** Hardcoded `min_notional = 5.0` for futures, but Binance testnet requires $100 min notional. Prod may differ too. Orders silently rejected by exchange.
**Fix needed:** Fetch min notional from exchange info (already cached in `ExchangeInfoCache`) instead of hardcoding. Or at minimum, make it configurable per adapter.

### 7. [DONE] No ongoing exchange→DB position sync
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex`
**Problem:** `adopt_exchange_positions` runs once at startup. After that, positions only get created/updated when `grid_check_fills` detects a fill. If the bot restarts, DB positions are stale. There's no periodic reconciliation of exchange positions with DB.
**Fix needed:** Add a periodic `:sync_exchange_positions` timer (every 60s) that fetches position risk from exchange and updates DB positions to match. This ensures DB always reflects reality.

### 8. [DONE] Grid bot doesn't verify clean slate before starting (already existed)
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex`
**Problem:** If the exchange already has positions on the same symbol from manual trading or another bot, the grid bot's orders interact unpredictably. A BUY meant to open a LONG actually reduces an existing SHORT.
**Fix needed:** On startup, check if there are existing positions on the trading pair. If so, either adopt them into the grid or warn and refuse to start. Currently `adopt_exchange_positions` exists but doesn't integrate with the grid state properly.

### 9. [DONE] `stop_bot` channel handler pattern mismatch
**File:** `apps/admin_gateway/lib/admin_gateway_web/channels/bot_channel.ex`
**Problem:** `BotRegistry.stop_bot` returns `{:ok, updated}` but channel matched on `:ok`, silently failing.
**Fix:** Now matches both `{:ok, _}` and `:ok`.
**Commit:** `11b7fb6`

### 10. [DONE] Kill switch didn't kill processes (race condition)
**File:** `apps/trade_engine/lib/bots/bot_registry.ex`
**Problem:** Old kill_all killed processes BEFORE setting ETS to stopped. DynamicSupervisor could restart them in the gap.
**Fix:** Set ETS+DB to stopped FIRST, then kill processes, then double-check with `Process.exit(pid, :kill)`.
**Commit:** `11b7fb6`

---

## Testing

### Testnet API test results (2026-03-14)
- Market BUY → FILLED, opens LONG ✅
- Limit BUY below market → status NEW, sits on book ✅
- Market SELL with reduceOnly → closes LONG ✅
- reduceOnly SELL rejected when no LONG exists (SHORT was open) → correct behavior ✅
- Cancel order → works ✅
- Min notional $100 on testnet (not $5) → orders < $100 rejected ❌

### What needs end-to-end testing after fixes
1. Deploy grid bot on testnet with tight grid (~$200 range, 3-5 levels, $200+ capital)
2. Verify: limit orders placed and NOT cancelled on next cycle
3. Wait for price to hit a buy level → verify position created in DB
4. Verify counter-sell placed with reduceOnly
5. Wait for counter-sell fill → verify PnL recorded, position updated
6. Verify wallet balance changed on exchange

---

### 11. [DONE] Symbol normalization loses delivery futures expiry suffix
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex`
**Problem:** `"BTC/USDT:USDT-260327"` was normalized to `"BTCUSDT"` instead of `"BTCUSDT_260327"`. The `:` split dropped the expiry suffix. Caused `adopt_exchange_positions` to not match exchange positions, and `ExchangeInfoCache.min_notional` lookups to fail.
**Fix:** New `normalize_to_exchange_symbol/1` helper that correctly handles CCXT delivery format. Replaced all 4 occurrences of the broken inline normalization.

### 12. [DONE] Order ID type mismatch: integer vs string causes false "cancelled"
**File:** `apps/trade_engine/lib/bots/bot_trading_process.ex`
**Problem:** `reconcile_stale_db_orders` compares DB `exchange_order_id` (string "38708077") against exchange open order IDs (integer 38708077). MapSet membership always fails → every DB order gets marked `cancelled` after 10 seconds.
**Fix:** Convert exchange order IDs to strings with `to_string()` when building the MapSet. Applied to both `open_ids` in `do_grid_check_fills` and the fill detection comparison.

## UI Changes

### [DONE] Min notional warning in bot wizard
**File:** `stella-nextjs/src/app/dashboard/bot-fleet/new-bot/page.tsx`
- Grid metrics panel shows "Notional per grid order" with red highlight when below minimum
- Warning banner when notional < exchange min ($100 futures, $10 spot)
- Deploy button disabled when below min notional
- Prevents users from creating bots that will have all orders rejected

---

## Round 2 Issues (found during live dev testing 2026-03-14 22:00)

**Test bot:** `15abc926-bec1-4d78-963c-6449c63317b2` (TEST, $2000, BTC/USDT:USDT-260327)

### 13. [DONE] `get_open_orders` returns `:open_orders_not_supported` — CRITICAL
**Symptom:** `grid_check_fills` fails every 10s with "Failed to check open orders: :open_orders_not_supported". Without this, fill detection is completely broken — the bot cannot detect when limit orders get filled.
**Root cause:** Need to investigate — the Executor resolves the adapter and calls `adapter.get_open_orders`. Either the adapter doesn't export this function, or `function_exported?` check is failing, or the credential resolves to wrong adapter.
**Impact:** Fill detection dead → no counter-orders → no profit → bot is useless.

### 14. [DONE] Position adoption failed — UUID binary + schema mismatch + NOT NULL constraints
**Symptom:** `adopt_exchange_positions` detected the SHORT position and logged "Adopting exchange position" but the INSERT failed. First UUID binary error (fixed), but the Position Ecto schema fields don't match the raw SQL column names (`trading.positions` table has different columns than what the Ecto schema expects).
**Root cause:** The `update_grid_position` function uses `Position.changeset` with fields like `symbol`, `position_type`, `profit_loss` — but the DB table has `trading_pair`, `side`, `unrealized_pnl_usd`. Schema-to-DB column mismatch.
**Impact:** No positions ever created in DB despite exchange having them.

### 15. [DONE] `sync_exchange_positions` also fails — same adapter issue (fixed by #13)
**Symptom:** The 60s position sync calls `Executor.get_position_risk` which returns `:position_risk_not_supported`. Same root cause as #13.
**Impact:** Periodic sync broken.

### 16. [DONE] False fill detection from stale data
**Symptom:** Bot detected "Grid fills detected: filled_count 1" for SELL order 38717181, but it was actually a cancelled order from previous run. `filled_price: 0.0, net_pnl: 0.0` — not a real fill.
**Root cause:** On restart, bot recovered a grid order with `price: 0.0` (from the old price-not-saved bug). The reconciliation found this order not on exchange → assumed filled → processed as fill with price 0.
**Fix needed:** Don't treat orders with `order_id` that were previously marked `cancelled` in DB as fills. Or validate that `filled_price > 0` before processing.

### 17. [DONE] `set_leverage` returns `:set_leverage_not_supported` (fixed by #13)
**Symptom:** "Failed to set leverage for BTC/USDT:USDT-260327: :set_leverage_not_supported"
**Root cause:** Same adapter routing issue as #13.
**Impact:** Bot runs at whatever leverage the exchange has (currently 5x), ignoring config.

### 18. [DONE] `BotLogger.warn` → `BotLogger.warning`
**Commit:** `bb5cbe0`

### 19. [DONE] UUID binary format for raw SQL
**Commit:** `d430dba`

### 20. [DONE] Order price saved as 0
**Commit:** `90fd038`

## Investigation Plan

### Phase 1: Fix adapter routing (Issues #13, #15, #17) — CRITICAL
All three share the same root cause: the Executor resolves the credential to an adapter module, but that module either doesn't have `get_open_orders`, `get_position_risk`, or `set_leverage`. Need to:
1. Check which adapter module resolves for credential `4c8ba41b`
2. Check if that module exports these functions
3. Fix the adapter or routing

### Phase 2: Fix Position schema mismatch (Issue #14)
The `update_grid_position` and `sync_exchange_positions_to_db` use `Position.changeset` with wrong field names. Need to:
1. Compare Position Ecto schema fields vs actual DB columns
2. Fix field mappings

### Phase 3: Fix false fill detection (Issue #16)
Prevent stale/cancelled orders from being treated as fills:
1. Validate `filled_price > 0` before processing
2. Skip orders recovered from DB with `price: 0`

### 21. [DONE] Grid level float precision mismatch causes duplicate orders every cycle
**File:** `apps/trade_engine/lib/trade_engine/strategies/grid_bot.ex`
**Problem:** Strategy computes grid levels as raw floats (e.g. `71285.71428571`) but `place_grid_limit_order` rounds to exchange precision (e.g. `71285.7`) and stores in `grid_orders` map with rounded key. Next cycle, strategy checks `Map.has_key?(grid_orders, 71285.71428571)` → `false` because key is `71285.7`. Places duplicate orders at every level every 5 minutes.
**Evidence:** 12 duplicate orders at each price level on prod, 79 open orders in 1 hour, `buy_orders_placed: 0` but orders still appearing.
**Fix:** `analyze_grid_state` now uses fuzzy matching (within 0.01%) when checking if a level is already covered by an existing order, instead of exact `Map.has_key?`.

## Priority Order
1. **Fix #13** — adapter routing (blocks ALL exchange sync) ✅
2. **Fix #14** — position schema mismatch (blocks position tracking) ✅
3. **Fix #16** — false fill detection (causes wrong PnL) ✅
4. **Fix #21** — duplicate orders every cycle 🔴 DEPLOY TO PROD
5. All previous fixes ✅
