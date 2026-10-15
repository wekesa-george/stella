# Page-by-Page Data Source Analysis - INDEX

**Stella Platform - UI to Backend Data Mapping**

**Date:** February 21, 2026
**Purpose:** Map each UI page's data requirements to backend sources (Phoenix/Elixir WebSocket, NestJS API, PostgreSQL, ETS cache)

---

## Analysis Scope

This document analyzes:
- **Frontend:** stella-nextjs Next.js application
- **Backend 1:** umbrella-app Phoenix/Elixir (Trading Engine - Real-time)
- **Backend 2:** NestJS API (Planned - CRUD, User Management, Compliance)
- **Database:** PostgreSQL (stella-database.sql schema)
- **Cache:** ETS tables (in-memory for real-time data)

---

## Analyzed Pages

1. **[Page 1: Bot Fleet](./01-bot-fleet.md)** - `/dashboard/bot-fleet`
   - Bot list display with real-time metrics
   - WebSocket channels for bot status, heartbeat, CPU/RAM
   - Bot lifecycle actions (start/stop/pause/kill)

2. **[Page 2: Trading/Positions](./02-trading-positions.md)** - `/trading`
   - Live candlestick charts with real-time price updates
   - Position management with live P&L calculations
   - Order stream with execution tracking

3. **[Page 3: Mission Control](./03-mission-control.md)** - `/dashboard/mission-control`
   - Platform-wide statistics aggregation
   - Infrastructure health monitoring
   - Alert management system

4. **[Page 4: Infrastructure](./04-infrastructure.md)** - `/dashboard/infra`
   - Service detail cards (Phoenix, Postgres, RabbitMQ, Redis)
   - Resource usage graphs
   - System status monitoring

5. **[Page 5: Alerts](./05-alerts.md)** - `/dashboard/alerts`
   - Real-time alert feed with filtering and search
   - Alert acknowledgment and bulk actions
   - Critical/warning/info severity levels
   - Alert rule evaluation and generation

6. **[Page 6: Shift Handoff](./06-shift-handoff.md)** - `/dashboard/shift-handoff`
   - Shift session tracking and activity logging
   - Platform status summary for handoff
   - Watch list for critical items
   - Handoff notes with autosave

7. **[Page 7: Bot Detail](./07-bot-detail.md)** - `/dashboard/bot/[id]`
   - Single bot detail view with real-time metrics
   - Equity curve chart with session tracking
   - Open positions table with live P&L
   - Manual order submission panel
   - Bot lifecycle actions (pause/resume/kill)

8. **[Page 8: Users List](./08-users-list.md)** - `/users`
   - User list with summary cards (total, traders, followers, verified)
   - Search and filter functionality (type, status, verification)
   - Client-side filtering with materialized view optimization
   - User statistics and trading performance metrics

9. **[Page 9: User Detail](./09-user-detail.md)** - `/users/[id]`
   - User detail view with tabbed interface (Overview, Transactions, Activity)
   - User suspension and status management
   - Activity logging and audit trail
   - Exchange credentials and bot ownership display

10. **[Page 10: Admin Users List](./10-admin-users-list.md)** - `/admin-users`
   - Admin users list with summary cards (active, invited, suspended, deactivated)
   - Search and filter functionality (status, email, name)
   - Logto integration for authentication
   - Super admin and MFA status indicators

11. **[Page 11: Admin User Detail](./11-admin-user-detail.md)** - `/admin-users/[id]`
   - Admin user detail view with profile, security, and role management
   - Role assignment and removal with audit trail
   - Deactivation workflow with reason tracking
   - Quick actions (password reset, email, activity log)

12. **[Page 12: Finance Dashboard (Redirect)](./12-finance-dashboard.md)** - `/finance`
   - Client-side redirect to `/finance/overview`
   - No data sources required

12b. **[Page 12: KYC Regions](./12-kyc-regions.md)** - `/kyc-review/regions`
   - Regional routing configuration for KYC providers
   - Provider management (SumSub, Onfido, Persona)
   - Coverage visualization and country mapping
   - Re-verification rules and triggers

13. **[Page 13: Finance Overview](./13-finance-overview.md)** - `/finance/overview`
   - Equity curve, monthly returns, and drawdown charts
   - Platform-wide financial KPIs and performance metrics

13b. **[Page 13: KYC Audit Trail](./13-kyc-audit.md)** - `/kyc-review/audit`
   - Immutable audit log for KYC/compliance actions
   - Event filtering (decisions, credentials, routing, providers)
   - 7-year retention for regulatory compliance
   - Export to CSV functionality

14. **[Page 14: Finance Strategies](./14-finance-strategies.md)** - `/finance/strategies`
   - Trading strategy performance comparison
   - Sharpe/Sortino ratios, win rate, max drawdown metrics
   - Per-strategy P&L and trade statistics

15. **[Page 15: Finance Risk](./15-finance-risk.md)** - `/finance/risk`
   - Risk management dashboard with VaR calculations
   - Exchange concentration and exposure analysis
   - Platform-wide risk KPIs

16. **[Page 16: Finance Market](./16-finance-market.md)** - `/finance/market`
   - Market intelligence and pair performance analysis
   - Exchange breakdown and volume concentration
   - Trading pair analytics

17. **[Page 17: Finance Users](./17-finance-users.md)** - `/finance/users`
   - User analytics with AUM and P&L tracking
   - User growth metrics and tier distribution
   - Per-user performance breakdown

18. **[Page 18: KYC Review (Redirect)](./18-kyc-review.md)** - `/kyc-review`
   - Server-side redirect to `/kyc-review/applicants`
   - No data sources required

19. **[Page 19: KYC Applicants](./19-kyc-applicants.md)** - `/kyc-review/applicants`
   - KYC applicant review and compliance workflow
   - Risk scoring, document verification, face match
   - Multi-provider support (SumSub, Onfido, Persona)
   - Sanctions/PEP watchlist screening

20. **[Page 20: KYC Providers](./20-kyc-providers.md)** - `/kyc-review/providers`
   - KYC provider management and configuration
   - Provider health monitoring and workflow setup

20b. **[Page 20: Settings Risk](./20-settings-risk.md)** - `/settings/risk`
   - Platform-wide risk controls (max drawdown, daily loss limit)
   - Circuit breaker and position size limits
   - Changes apply immediately to running bots

21. **[Page 21: Settings (Redirect)](./21-settings.md)** - `/settings`
   - Redirect to `/settings/risk`
   - No data sources required

21b. **[Page 21: Settings Integrations](./21-settings-integrations.md)** - `/settings/integrations`
   - Third-party integrations (Xero, Slack, PagerDuty, Mixpanel)
   - Webhook configuration and connection management

22. **[Page 22: Settings Billing](./22-settings-billing.md)** - `/settings/billing`
   - Billing and fee configuration (performance fees, high watermark)
   - Fee calculation period and platform fee structure

22b. **[Page 22: Settings Bot Engine](./22-settings-bot-engine.md)** - `/settings/bot-engine`
   - Bot engine default configuration
   - Heartbeat interval, order timeout, retry settings
   - Reconciliation frequency defaults

23. **[Page 23: Settings Security](./23-settings-security.md)** - `/settings/security`
   - Security and access control configuration
   - Admin user management with 2FA status
   - Role-based access control

23b. **[Page 23: Settings Communications](./23-settings-communications.md)** - `/settings/communications`
   - Communications and branding configuration
   - Email templates (KYC, bot, billing notifications)

24. **[Page 24: Settings Compliance](./24-settings-compliance.md)** - `/settings/compliance`
   - Compliance and regulatory configuration
   - AML thresholds, sanctions lists, trade reporting
   - Data retention policies

25. **[Page 25: Settings Exchanges](./25-settings-exchanges.md)** - `/settings/exchanges`
   - Exchange management (Binance, Bybit, OKX, Kraken, Kucoin)
   - API key configuration and connection health monitoring
   - Rate limits, trading pairs, and fee display

26. **[Page 26: Settings Infrastructure](./26-settings-infrastructure.md)** - `/settings/infrastructure`
   - Infrastructure and performance configuration
   - Scheduled jobs management (fee calc, AML scan, reconciliation)
   - Cron job monitoring and status

27. **[Page 27: Settings Notifications](./27-settings-notifications.md)** - `/settings/notifications`
   - Notification channel configuration (Slack, PagerDuty, Email, SMS)
   - Alert routing and webhook setup

---

## Supporting Documents

- **[Analysis Strategy](./ANALYSIS_STRATEGY.md)** - Methodology and quality standards for page analysis
- **[Multi-Exchange Assessment Report](../MULTI_EXCHANGE_ASSESSMENT_REPORT.md)** - Review of multi-exchange support and credential management

---

## Backend Responsibility Split: Phoenix vs NestJS

### **Phoenix/Elixir Handles:**
- ✅ **Real-time Trading Operations** - Order execution, position management, bot lifecycle
- ✅ **Market Data Streaming** - WebSocket channels for prices, candles, order book
- ✅ **Bot Management** - Start/stop/pause bots, bot heartbeat monitoring
- ✅ **Performance-Critical Reads** - Current bot status, live position P&L, active orders
- ✅ **Infrastructure Metrics** - System health, service monitoring, resource usage

**Phoenix REST Endpoints:**
- `GET /api/phoenix/bots/:id/status` - Live bot status (from GenServer)
- `POST /api/phoenix/bots/:id/start` - Start bot
- `POST /api/phoenix/bots/:id/stop` - Stop bot
- `POST /api/phoenix/bots/:id/pause` - Pause bot
- `GET /api/phoenix/positions/open` - Live open positions (from ETS cache)
- `GET /api/phoenix/system/health` - Infrastructure health check
- `GET /api/phoenix/platform/stats` - Platform aggregates
- `GET /api/phoenix/infra/metrics` - Infrastructure metrics
- `GET /api/phoenix/infra/services/:name` - Service details

### **NestJS Handles:**
- ✅ **CRUD Operations** - User management, bot configuration, strategies
- ✅ **Historical Data** - Past trades, historical P&L, audit logs
- ✅ **Compliance & KYC** - Document uploads, verification workflows
- ✅ **Billing & Subscriptions** - Invoice generation, payment processing
- ✅ **Admin Operations** - User administration, role management
- ✅ **Reporting** - Performance reports, analytics, exports

**NestJS REST Endpoints:**
- `GET /api/bots` - List all bots (with pagination, filters)
- `POST /api/bots` - Create new bot
- `PUT /api/bots/:id` - Update bot configuration
- `DELETE /api/bots/:id` - Delete bot
- `GET /api/users` - User management (Page 8)
- `GET /api/users/:id` - User detail (Page 9)
- `POST /api/users/:id/suspend` - Suspend user (Page 9)
- `POST /api/users/:id/reactivate` - Reactivate user (Page 9)
- `GET /api/users/:id/transactions` - User transactions (Page 9)
- `GET /api/users/:id/activity` - User activity log (Page 9)
- `GET /api/admin/admin-users` - Admin users list (Page 10)
- `GET /api/admin/admin-users/:id` - Admin user detail (Page 10, 11)
- `POST /api/admin/admin-users/:id/deactivate` - Deactivate admin user (Page 11)
- `GET /api/admin/admin-users/:id/roles` - Get admin roles (Page 11)
- `POST /api/admin/admin-users/:id/roles` - Assign role to admin (Page 11)
- `DELETE /api/admin/admin-users/:id/roles/:roleId` - Remove role from admin (Page 11)
- `POST /api/admin/admin-users/:id/reset-password` - Reset admin password (Page 11)
- `GET /api/admin/roles/available` - Get available roles for assignment (Page 11)
- `GET /api/kyc/regions` - Get KYC regional routing configuration (Page 12)
- `POST /api/kyc/regions` - Create KYC region (Page 12)
- `PUT /api/kyc/regions/:id` - Update KYC region (Page 12)
- `GET /api/kyc/providers` - Get KYC provider configurations (Page 12)
- `GET /api/kyc/reverification-rules` - Get re-verification rules (Page 12)
- `POST /api/kyc/reverification-rules` - Create re-verification rule (Page 12)
- `GET /api/kyc/audit` - Get KYC audit log (Page 13)
- `GET /api/kyc/audit/export` - Export KYC audit log to CSV (Page 13)
- `GET /api/orders/history` - Historical order data
- `GET /api/reports/performance` - Generate performance reports
- `GET /api/market-data/candles` - Historical OHLCV data
- `GET /api/positions` - Historical positions with filtering
- `GET /api/alerts` - Alert list with filtering (Page 5)
- `POST /api/alerts/:id/acknowledge` - Acknowledge alert (Page 5)
- `POST /api/alerts/acknowledge-bulk` - Bulk acknowledge alerts (Page 5)
- `DELETE /api/alerts/:id` - Delete alert (Page 5)
- `GET /api/shift/current` - Get current shift session (Page 6)
- `POST /api/shift/start` - Start new shift (Page 6)
- `GET /api/shift/activities` - Get shift activity log (Page 6)
- `POST /api/shift/activities` - Log shift activity (Page 6)
- `GET /api/shift/watch-list` - Get watch list items (Page 6)
- `POST /api/shift/watch-list` - Add watch list item (Page 6)
- `POST /api/shift/handoff` - Submit shift handoff (Page 6)
- `PUT /api/shift/:id/notes` - Save handoff draft (Page 6)

---

## Real-Time Update Frequency Best Practices

Based on industry standards (Binance, Coinbase, Interactive Brokers):

| Data Type | Proposed Frequency | Industry Standard | Status |
|-----------|-------------------|-------------------|---------|
| **Market Prices** | 100-500ms | 100ms - 1s | ✅ Optimal |
| **Position P&L** | 1s | 500ms - 2s | ✅ Optimal |
| **Bot Heartbeat** | 5s | 5s - 10s | ✅ Optimal |
| **Bot Metrics (CPU/RAM)** | 10s | 10s - 30s | ✅ Optimal |
| **Infrastructure Health** | 4s | 5s - 15s | ✅ Optimal |
| **Order Status** | Event-driven | Event-driven | ✅ Optimal |
| **Candlestick Updates** | On close (1m-1D) | On close | ✅ Optimal |

**Conclusion:** All proposed frequencies are within best practices and won't cause performance issues.

---

## COMPREHENSIVE SUMMARY

### Database Schema Modifications Required

#### **High Priority (Blocking)**

1. **Add `initial_equity_usd` to `trading.bots`**
   ```sql
   ALTER TABLE trading.bots
   ADD COLUMN initial_equity_usd DECIMAL(15,4) NOT NULL DEFAULT 0;
   ```

2. **Create `platform.stats_snapshot` Materialized View**
   - See [Page 3: Mission Control](./03-mission-control.md#database-schema-gaps)

3. **Update Alert Status Enum**
   ```sql
   ALTER TYPE trading.alert_status ADD VALUE IF NOT EXISTS 'acknowledged';
   ```

#### **Medium Priority (Performance)**

4. **Create `trading.bot_dashboard_view` Materialized View**
   - See [Page 1: Bot Fleet](./01-bot-fleet.md#database-schema-gaps)

5. **Verify TimescaleDB Hypertables for OHLCV Data**
   - See [Page 2: Trading/Positions](./02-trading-positions.md#database-schema-gaps)

6. **Add Indexes to `trading.alerts` Table**
   ```sql
   ALTER TABLE trading.alerts ADD COLUMN deleted_at TIMESTAMPTZ;
   CREATE INDEX idx_alerts_status ON trading.alerts(status) WHERE status = 'active';
   CREATE INDEX idx_alerts_severity ON trading.alerts(severity);
   CREATE INDEX idx_alerts_triggered_at ON trading.alerts(triggered_at DESC);
   ```
   - See [Page 5: Alerts](./05-alerts.md#database-schema-requirements)

#### **New Tables Required**

7. **Create `operations` Schema and Shift Management Tables**
   ```sql
   CREATE SCHEMA operations;
   CREATE TABLE operations.shifts (...);
   CREATE TABLE operations.shift_activities (...);
   CREATE TABLE operations.watch_list_items (...);
   ```
   - See [Page 6: Shift Handoff](./06-shift-handoff.md#database-schema-requirements)

8. **Create `auth.user_follows` Table for Social Features**
   ```sql
   CREATE TABLE auth.user_follows (
       follower_user_id UUID NOT NULL REFERENCES auth.users(id),
       followed_user_id UUID NOT NULL REFERENCES auth.users(id),
       ...
   );
   ```
   - See [Page 8: Users List](./08-users-list.md#missing-tables-views)

9. **Create `auth.user_list_stats` Materialized View**
   - Pre-computed user statistics for performance
   - See [Page 8: Users List](./08-users-list.md#database-schema-requirements)

10. **Create User Management Tables**
   ```sql
   CREATE TABLE auth.user_suspensions (...);
   CREATE TABLE auth.activity_logs (...);
   ```
   - See [Page 9: User Detail](./09-user-detail.md#database-schema-requirements)

**Note on Admin User Management:**
- Pages 10-11 (Admin Users) use existing `admin.admin_users`, `admin.roles`, `admin.admin_user_roles`, and `admin.admin_audit_log` tables
- No schema changes required - all fields already present in stella-database.sql
- See [Page 10](./10-admin-users-list.md) and [Page 11](./11-admin-user-detail.md) for details

11. **Create KYC Schema and Tables**
   ```sql
   CREATE SCHEMA kyc;
   CREATE TABLE kyc.region_routing (...);
   CREATE TABLE kyc.providers (...);
   CREATE TABLE kyc.provider_workflows (...);
   CREATE TABLE kyc.reverification_rules (...);
   CREATE TABLE kyc.audit_log (...) PARTITION BY RANGE (created_at);
   ```
   - See [Page 12: KYC Regions](./12-kyc-regions.md#database-schema-requirements) for detailed schemas
   - See [Page 13: KYC Audit Trail](./13-kyc-audit.md#database-schema-requirements) for audit log with 7-year partitioning
   - Update `auth.kyc_records` to add `region_id`, `provider_workflow_id`, `reverification_trigger` columns

---

### ETS Tables Required

| ETS Table | Purpose | Update Frequency | Used By |
|-----------|---------|------------------|---------|
| `:bot_metrics_cache` | Bot CPU/RAM tracking | Every 10s | Pages 1, 3 |
| `:position_pnl_cache` | Real-time position P&L | Every 1s | Pages 2, 3 |
| `:price_cache` | Current market prices | Every tick | Page 2 |
| `:infra_metrics_cache` | Infrastructure health | Every 4s | Pages 3, 4 |
| `:platform_stats_cache` | Platform aggregates | Every 60s | Page 3 |
| `:bot_heartbeat_cache` | Bot heartbeat timestamps | Every 5s | Page 1 |

---

### Phoenix GenServers Required

| GenServer | Purpose | Responsibilities |
|-----------|---------|------------------|
| `TradeEngine.Bots.Worker` | Individual bot runtime | Execute strategy, heartbeat, metrics |
| `TradeEngine.Trading.PositionPnLManager` | Real-time P&L calculation | Calculate P&L, broadcast updates |
| `TradeEngine.Infra.Monitor` | Infrastructure monitoring | Collect metrics, broadcast to WS |
| `TradeEngine.Schedulers.PlatformStats` | Platform stats aggregation | Refresh materialized view, cache |
| `TradeEngine.Cache.PriceCache` | Price caching | Store current prices in ETS |
| `TradeEngine.Alerts.Manager` | Alert generation & evaluation | Create alerts, broadcast (Page 5) |

---

### Phoenix WebSocket Channels Required

| Channel | Topic Pattern | Purpose | Defined In |
|---------|---------------|---------|------------|
| `BotChannel` | `bot:user:{user_id}` | Bot status, heartbeat, actions | Page 1 |
| `PositionChannel` | `positions:user:{user_id}` | Position updates, P&L changes | Page 2 |
| `OrderChannel` | `orders:user:{user_id}` | Order stream, status updates | Page 2 |
| `MarketDataChannel` | `market_data:{symbol}` | Price ticks, candles, orderbook | Page 2 |
| `InfraChannel` | `infra:metrics` | Infrastructure health updates | Pages 3, 4 |
| `PlatformChannel` | `platform:stats` | Platform-wide statistics | Page 3 |
| `AlertChannel` | `alerts:platform` | New alerts, acknowledgments | Pages 3, 5 |
| `ShiftChannel` | `shift:activities` | Shift activity log updates | Page 6 |

---

### Implementation Phases

#### **Phase 1: Core Trading Engine (Weeks 1-4)**
1. Create `trading.bots` schema modifications
2. Implement `BotWorker` GenServer
3. Implement `PositionPnLManager` GenServer
4. Create ETS caches: `bot_metrics`, `position_pnl`, `price_cache`
5. Implement Phoenix channels: `BotChannel`, `PositionChannel`, `MarketDataChannel`
6. Implement Phoenix bot lifecycle endpoints

#### **Phase 2: Infrastructure & Monitoring (Weeks 5-6)**
1. Implement `InfraMonitor` GenServer
2. Create `infra_metrics_cache` ETS table
3. Implement `InfraChannel` WebSocket
4. Set up RabbitMQ/Redis metric collection
5. Create `platform.stats_snapshot` materialized view
6. Implement `PlatformStats` scheduler

#### **Phase 3: Alert System (Week 7)**
1. Implement `AlertManager` GenServer
2. Update alert status enum
3. Implement `AlertChannel` WebSocket
4. Create alert evaluation rules
5. Implement alert acknowledgment

#### **Phase 4: NestJS API (Weeks 8-10)**
1. Set up NestJS project structure
2. Implement bot CRUD endpoints
3. Implement historical data endpoints
4. Implement user management endpoints
5. Implement alert CRUD endpoints
6. Add pagination, filtering, sorting

---

### Performance Benchmarks

Based on industry standards, target metrics:

| Metric | Target | Notes |
|--------|--------|-------|
| **WebSocket Latency** | < 50ms | Ping-pong time |
| **Position P&L Update Frequency** | 1s | Acceptable for retail trading |
| **Bot Heartbeat Frequency** | 5s | Standard for process monitoring |
| **Infrastructure Metrics Update** | 4s | Standard for dashboards |
| **REST API Response Time (p95)** | < 200ms | Acceptable for admin pages |
| **Database Query Time (p95)** | < 100ms | With proper indexing |
| **Concurrent Bots Supported** | 100+ | Per Phoenix instance |
| **WebSocket Connections** | 10,000+ | Phoenix standard capacity |

---

## External Service Integrations Required

1. **RabbitMQ Management API**
   - Endpoint: `http://localhost:15672/api/nodes`
   - Auth: Basic auth (guest:guest)
   - Purpose: Queue metrics for infrastructure monitoring

2. **Redis INFO Command**
   - Command: `Redix.command(:redix, ["INFO", "server"])`
   - Purpose: Cache metrics for infrastructure monitoring

3. **PostgreSQL Statistics**
   - Tables: `pg_stat_database`, `pg_stat_activity`
   - Purpose: Database performance metrics

---

## Navigation

### Trading & Operations (Pages 1-7)
- **[Page 1: Bot Fleet →](./01-bot-fleet.md)**
- **[Page 2: Trading/Positions →](./02-trading-positions.md)**
- **[Page 3: Mission Control →](./03-mission-control.md)**
- **[Page 4: Infrastructure →](./04-infrastructure.md)**
- **[Page 5: Alerts →](./05-alerts.md)**
- **[Page 6: Shift Handoff →](./06-shift-handoff.md)**
- **[Page 7: Bot Detail →](./07-bot-detail.md)**

### User Management (Pages 8-11)
- **[Page 8: Users List →](./08-users-list.md)**
- **[Page 9: User Detail →](./09-user-detail.md)**
- **[Page 10: Admin Users List →](./10-admin-users-list.md)**
- **[Page 11: Admin User Detail →](./11-admin-user-detail.md)**

### Finance (Pages 12-17)
- **[Page 12: Finance Dashboard (Redirect) →](./12-finance-dashboard.md)**
- **[Page 13: Finance Overview →](./13-finance-overview.md)**
- **[Page 14: Finance Strategies →](./14-finance-strategies.md)**
- **[Page 15: Finance Risk →](./15-finance-risk.md)**
- **[Page 16: Finance Market →](./16-finance-market.md)**
- **[Page 17: Finance Users →](./17-finance-users.md)**

### KYC & Compliance (Pages 12b, 13b, 18-20)
- **[Page 12b: KYC Regions →](./12-kyc-regions.md)**
- **[Page 13b: KYC Audit Trail →](./13-kyc-audit.md)**
- **[Page 18: KYC Review (Redirect) →](./18-kyc-review.md)**
- **[Page 19: KYC Applicants →](./19-kyc-applicants.md)**
- **[Page 20: KYC Providers →](./20-kyc-providers.md)**

### Settings (Pages 20b-27)
- **[Page 20b: Settings Risk →](./20-settings-risk.md)**
- **[Page 21: Settings (Redirect) →](./21-settings.md)**
- **[Page 21b: Settings Integrations →](./21-settings-integrations.md)**
- **[Page 22: Settings Billing →](./22-settings-billing.md)**
- **[Page 22b: Settings Bot Engine →](./22-settings-bot-engine.md)**
- **[Page 23: Settings Security →](./23-settings-security.md)**
- **[Page 23b: Settings Communications →](./23-settings-communications.md)**
- **[Page 24: Settings Compliance →](./24-settings-compliance.md)**
- **[Page 25: Settings Exchanges →](./25-settings-exchanges.md)**
- **[Page 26: Settings Infrastructure →](./26-settings-infrastructure.md)**
- **[Page 27: Settings Notifications →](./27-settings-notifications.md)**

### Reference
- **[Analysis Strategy →](./ANALYSIS_STRATEGY.md)**
- **[KYC Review Section Analysis →](./KYC_REVIEW_SECTION_ANALYSIS.md)**
- **[Providers & Settings Analysis →](./PROVIDERS_AND_SETTINGS_ANALYSIS.md)**
- **[Multi-Exchange Assessment →](../MULTI_EXCHANGE_ASSESSMENT_REPORT.md)**
