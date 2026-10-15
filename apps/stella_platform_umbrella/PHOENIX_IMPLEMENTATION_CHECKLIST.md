# Phoenix Umbrella Implementation Checklist

> admin_gateway = real-time WebSocket layer (channels)
> trade_engine = trading core (GenServers, ETS caches, business logic)
> NestJS API = REST endpoints (already complete — Batches 1-6 done)

---

## Phase 1: WebSocket Channels (admin_gateway)

Phoenix channels are the primary reason admin_gateway exists. The Svelte frontend
connects via WebSocket to receive real-time updates. trade_engine already broadcasts
to PubSub topics — channels subscribe and forward to the browser.

### Channel Setup

- [x] Create `AdminGatewayWeb.UserSocket` with authentication (token-based)
- [x] Wire socket in `endpoint.ex`
- [x] Add channel route entries in UserSocket

### Channels

- [x] **BotChannel** (`bot:lobby` / `bot:{bot_id}`)
  - Subscribe to: bot registry events, bot heartbeats
  - Events out: `bot_started`, `bot_stopped`, `bot_heartbeat`, `bot_error`, `bot_metrics_update`
  - Events in: `start_bot`, `stop_bot`, `restart_bot`

- [x] **PositionChannel** (`positions:lobby` / `positions:{bot_id}`)
  - Subscribe to: position lifecycle events
  - Events out: `position_opened`, `position_closed`, `position_pnl_update`
  - Events in: `close_position` (manual close)

- [x] **OrderChannel** (`orders:lobby` / `orders:{bot_id}`)
  - Subscribe to: order lifecycle events
  - Events out: `order_created`, `order_filled`, `order_cancelled`, `order_failed`
  - Events in: `cancel_order`

- [x] **MarketDataChannel** (`market_data:{exchange}:{pair}`)
  - Subscribe to: `"ticker:{symbol}"`, `"order_flow:{symbol}"`
  - Events out: `ticker_update`, `candle_closed`, `order_flow_update`
  - Existing PubSub topics in trade_engine already broadcast this data

- [x] **InfraChannel** (`infra:metrics`)
  - Subscribe to: infrastructure metric updates
  - Events out: `infra_update` (CPU, memory, DB pool, latency)
  - Singleton channel — all admins see same data

- [x] **PlatformChannel** (`platform:stats`)
  - Subscribe to: aggregated platform statistics
  - Events out: `platform_stats_update` (total bots, total P&L, active positions, etc.)
  - Singleton channel — all admins see same data

- [x] **AlertChannel** (`alerts:platform`)
  - Subscribe to: platform alert events
  - Events out: `new_alert`, `alert_acknowledged`, `alert_resolved`
  - Events in: `acknowledge_alert`

---

## Phase 2: Missing GenServers (trade_engine)

These GenServers produce the data that channels deliver to the frontend.

### Critical (blocking channel data)

- [x] **PositionPnLManager** — Calculate real-time unrealized P&L for open positions
  - Tick every 1s
  - Read open positions, fetch current price from `:binance_price_cache`
  - Write to `:position_pnl_cache` ETS table
  - Broadcast `"positions:pnl_update"` via PubSub
  - _This is what makes the P&L column update live on the dashboard_

- [x] **PositionCloseManager** — Detect exit signals and close positions
  - Tick every 5s
  - Check TP/SL/trailing stop conditions against current price
  - Execute close order via exchange adapter
  - _Currently ~31k positions stuck open because nothing closes them_

### Important (enriches dashboard)

- [x] **InfraMonitor** — Collect system health metrics
  - Tick every 4s
  - Metrics: BEAM memory, process count, DB pool checkout time, message queue lengths
  - Write to `:infra_metrics_cache` ETS
  - Broadcast `"infra:update"` via PubSub

- [x] **PlatformStatsAggregator** — Aggregate platform-wide KPIs
  - Tick every 60s
  - Query: total bots (active/stopped), total open positions, total realized P&L, 24h volume
  - Write to `:platform_stats_cache` ETS
  - Broadcast `"platform:stats_update"` via PubSub

- [x] **ExchangeHealthMonitor** — Monitor exchange API health
  - Tick every 30s
  - Check WebSocket connection status, API latency, error rates
  - Write to `:exchange_health_cache` ETS
  - Broadcast `"infra:exchange_health"` via PubSub

### Nice to have

- [x] **HeartbeatTracker** — Detect stale/unresponsive bots
  - Tick every 5s
  - Compare last heartbeat timestamp in `:bot_registry` ETS
  - Mark bots as `stale` if heartbeat > 30s old
  - Broadcast `"bot:stale"` via PubSub

- [x] **StaleOrderCanceller** — Auto-cancel hung pending orders
  - Tick every 30s
  - Query orders with `status=pending` older than configured timeout
  - Cancel via exchange adapter

- [x] **RiskMonitor** — Enforce platform risk controls
  - Tick every 60s
  - Check drawdown limits, daily loss limits, leverage limits
  - Auto-pause bots that breach limits
  - Broadcast `"alerts:risk_breach"` via PubSub

---

## Phase 3: ETS Caches (trade_engine)

New caches needed to support the GenServers above. Existing caches are listed for reference.

### New Caches

- [x] `:position_pnl_cache` — `{position_id} => %{unrealized_pnl, pnl_pct, current_price, updated_at}`
- [x] `:infra_metrics_cache` — `:current => %{cpu, memory, db_pool, process_count, ...}`
- [x] `:platform_stats_cache` — `:current => %{total_bots, active_bots, open_positions, ...}`
- [x] `:exchange_health_cache` — `{exchange_code} => %{status, latency_ms, error_rate, ...}`
- [x] `:bot_heartbeat_cache` — `{bot_id} => %{last_heartbeat, status, ...}`

### Existing Caches (already in trade_engine, no work needed)

- `:binance_ticker_cache` — Latest ticker data per symbol
- `:binance_price_cache` — Current prices per symbol
- `:binance_candle_cache` — OHLCV candle buffers
- `:binance_orderbook_cache` — Order book snapshots
- `:binance_order_flow_cache` — Order flow analysis
- `:bot_registry` — Bot runtime status and metrics
- `:virtual_balances` — User virtual balance tracking
- `:capital_allocations` — User capital allocations

---

## Phase 4: Database Additions

### New Tables

- [x] `platform.risk_controls` (singleton) — max_drawdown_pct, circuit_breaker_pct, max_leverage, max_daily_loss_pct
- [x] `platform.bot_engine_defaults` (singleton) — heartbeat_interval_sec, order_timeout_sec, position_sync_interval_sec

### Column Additions

- [x] `trading.bots` — add `initial_equity_usd DECIMAL(15,4)` (needed for P&L % calculation)
- [x] `trading.bots` — add `credential_id UUID` (link to exchange credentials for multi-exchange)

---

## Phase 5: Multi-Exchange Support

Currently trade_engine is Binance-only. These changes enable multiple exchanges.

- [x] Update `:binance_price_cache` → `:price_cache` with composite key `{exchange, pair}`
- [x] Update PubSub topics: `"ticker:BTC/USDT"` → `"ticker:binance:BTC/USDT"`
- [x] Create exchange adapter behaviour (`TradeEngine.Exchanges.Adapter`)
- [x] Implement Bybit adapter (second exchange)
- [x] Update MarketDataChannel to handle exchange-qualified topics

---

## Phase 6: Supporting REST Endpoints (trade_engine Plug.Router)

A few REST endpoints that the NestJS API proxies to Phoenix for real-time data.

- [x] `GET /api/phoenix/platform/stats` — Read from `:platform_stats_cache`
- [x] `GET /api/phoenix/infra/metrics` — Read from `:infra_metrics_cache`
- [x] `GET /api/phoenix/infra/exchanges` — Read from `:exchange_health_cache`

---

## Progress Tracker

| Phase | Items | Done | Status |
|-------|-------|------|--------|
| 1. WebSocket Channels | 10 | 10 | Complete |
| 2. GenServers | 8 | 8 | Complete |
| 3. ETS Caches | 5 | 5 | Complete |
| 4. Database | 4 | 4 | Complete |
| 5. Multi-Exchange | 5 | 5 | Complete |
| 6. REST Endpoints | 3 | 3 | Complete |
| **Total** | **35** | **35** | **All complete** |
