# Stella Admin Backoffice — Feature List

Derived from the database schema (34 permissions, 7 roles, 49 tables).
Organized by navigation section as it would appear in the UI.

---

## 1. Dashboard (Home)

**Purpose:** Platform-wide health at a glance

- Active users count (currently trading vs total registered)
- Active bots count and aggregate status breakdown (running, paused, error, circuit_broken)
- Total platform equity across all users
- Today's aggregate P&L (realized + unrealized)
- Open positions count across all bots
- Circuit breaker events in the last 24 hours (count + severity breakdown)
- Service health status panel (from `system_ops.service_health` — each service as green/yellow/red)
- Pending items requiring attention: KYC reviews awaiting approval, withdrawal requests pending, circuit breakers needing manual resolution
- Exchange adapter status (which exchanges are active/degraded/down)

**Permission:** `system.view_health`, `reports.view`

---

## 2. User Management

### 2a. User List & Profiles

- Searchable/filterable user table: email, name, tier, status, KYC level, country, registration date
- User detail view: profile info, connected exchanges, active bots, subscription, current equity, P&L history
- Change user status (active, suspended, banned, pending_verification)
- Change user tier (stella_one → stella_unum → stella_eon → stella_plenum) with reason field
- Suspend/unsuspend user accounts with reason (logged to `admin.admin_audit_log`)
- Export user data (CSV/JSON) for compliance

**Permissions:** `users.view`, `users.update`, `users.update_tier`, `users.suspend`, `users.export`

### 2b. KYC Review

- Queue of pending KYC submissions sorted by submission date
- KYC detail view: document type, provider, provider reference, submitted data, document expiry
- Approve or reject KYC with notes (updates `auth.kyc_records.reviewed_by`)
- Filter by KYC level (basic, enhanced, full) and status (pending, approved, rejected, expired)
- Flag expired KYC documents for re-verification

**Permission:** Compliance Officer role (`users.view`, `users.update`)

---

## 3. Exchange Management

### 3a. Adapter Configuration

- List all exchange adapters with status (active, inactive, maintenance, deprecated)
- Adapter detail view: endpoints, capabilities (spot, margin, futures), execution capabilities JSONB, rate limits, fee schedule, supported tiers
- Activate/deactivate adapters (records `activated_by`/`deactivated_by` admin, timestamps)
- Edit adapter configuration: rate limits, min/max order sizes, supported pairs list, execution capabilities
- Set maintenance message (displayed to users when adapter is in maintenance)
- View connection health: recent connection logs per adapter, average latency, error rates

**Permissions:** `exchanges.view`, `exchanges.activate`, `exchanges.configure`

### 3b. User Credentials Overview

- View all user-exchange connections (read-only, never expose decrypted keys)
- Filter by adapter, status (active, invalid, expired, revoked), last validated date
- See credential validation errors across the platform (spot patterns like the Dec 8-12 mass failures)
- Trigger re-validation for stale credentials

**Permission:** `exchanges.view`

---

## 4. Trading Operations

### 4a. Live Trading Monitor

- Real-time view of all active bots: user, strategy, exchange, trading pairs, status, last heartbeat, last trade, open position count, session P&L
- Filter by: bot status, exchange, strategy, user tier
- Force-stop a specific bot with reason (logged to audit)
- Force-stop all bots for a specific user
- Force-stop all bots platform-wide (emergency kill switch)

**Permissions:** `trading.view`, `trading.force_stop`

### 4b. Position Viewer

- Searchable table of all positions (open and closed): user, bot, pair, side, entry price, current/exit price, unrealized/realized P&L, hold duration, exit reason
- Filter by: status (open, closed, liquidated), exchange, trading pair, P&L range, date range
- Force-close specific positions with reason (triggers sell order on exchange, logged to audit)
- Bulk force-close: all positions for a user, all positions for a bot, all positions for a trading pair
- Position detail view: full physics parameters (momentum, gravity, peak_price, trajectory), linked orders, linked fills, SL/TP config, entry/exit signals

**Permissions:** `trading.view`, `trading.close_positions`

### 4c. Order & Fill History

- Searchable order history: user, bot, pair, side, type, status, quantity, price, fees, timestamps
- Fill detail per order
- Filter by: status (filled, cancelled, rejected, failed), exchange, date range
- View exchange responses and error messages for failed/rejected orders

**Permission:** `trading.view`

---

## 5. Strategy Management

### 5a. Core Strategies

- List all core strategies (`is_core: true`) with performance metadata (avg return, drawdown, Sharpe, win rate, total backtests, total live trades)
- Create/edit core strategy: name, type, description, config JSONB, entry/exit conditions, position sizing, indicators, risk parameters (default SL/TP), supported pairs, supported exchanges, timeframe, min tier
- Publish/unpublish core strategies (sets `status` and `published_at`)
- Archive deprecated strategies
- View all user customizations derived from a core strategy (child strategies via `parent_strategy_id`)

**Permissions:** `strategies.view`, `strategies.manage_core`

### 5b. User Strategies & Marketplace

- View all user-created strategies: owner, parent strategy, status, config overrides
- Approve/reject strategies submitted for marketplace visibility (`is_public`)
- Review backtest results for submitted strategies before approval
- Flag or remove strategies that violate platform guidelines

**Permissions:** `strategies.view`, `strategies.approve`

### 5c. Backtest Results

- View all backtest runs across the platform: strategy, user, pair, exchange, results (return, drawdown, Sharpe, Sortino, win rate, trade count)
- Filter by strategy type, performance thresholds, date range
- View equity curve and trade log for individual backtest runs

**Permission:** `strategies.view`

---

## 6. Risk Management

### 6a. Risk Dashboard

- Real-time platform risk overview: total exposure, aggregate drawdown, users near limit thresholds
- Users currently in circuit breaker cooldown
- Top 10 users by exposure, by drawdown, by loss today
- Heatmap of position concentration by trading pair

**Permission:** `risk.view`

### 6b. Limit Configuration

- View hierarchical limit tree: global → tier → user overrides
- Set/edit global limits (applies to all users as safety net): max drawdown %, max single trade USD, max daily volume, max leverage, max open positions, allowed/blocked assets
- Set/edit tier-specific limits (overrides global for each tier)
- Set per-user limit overrides with reason and optional expiration date
- Set per-strategy and per-exchange limits
- View effective limit for any user (shows which layer — global, tier, or user — is the binding constraint via `risk.get_effective_limit()`)

**Permissions:** `risk.view`, `risk.update_limits`, `risk.override_user`

### 6c. Circuit Breaker Management

- List all circuit breaker events: user, bot, trigger type (max_drawdown, max_daily_loss, max_position_size, max_leverage, etc.), severity, trigger value vs threshold, positions closed, orders cancelled
- Filter by: status (triggered, cooldown, resolved, expired), severity, date range
- Manually resolve circuit breakers with notes (sets `resolved_by`, `resolution_type: 'manual_admin'`, `resolution_notes`)
- Reset circuit breakers for a specific user/bot to allow trading to resume
- View cooldown timers

**Permissions:** `risk.view`, `risk.reset_breakers`

### 6d. Risk Audit Log

- Searchable log of all risk-related changes: who changed what limit, old value → new value, reason, timestamp
- Filter by actor type (admin, system, user), action, resource type

**Permission:** `risk.view`

---

## 7. Billing & Finance

### 7a. Subscription Overview

- List all subscriptions: user, plan (tier), status (active, past_due, cancelled, trial), billing cycle, current period dates, Stripe subscription ID
- View subscription detail: payment history, invoice history, P&L snapshots per billing period
- Manage subscriptions: cancel, refund, change plan, extend trial
- Filter by: tier, status, billing cycle, overdue invoices

**Permissions:** `billing.view`, `billing.manage`

### 7b. Invoice Management

- List all invoices: user, invoice number, type (subscription, performance_fee, one_time), status (draft, issued, paid, overdue, void, refunded), amount, due date
- View invoice detail: line items, linked subscription, linked payment(s)
- Issue manual invoices
- Void or refund invoices with reason
- Overdue invoice queue with aging

**Permissions:** `billing.view`, `billing.manage`

### 7c. Payment Tracking

- List all payments: user, invoice, amount, method (stripe, pegpay_momo, pegpay_bank, manual), status, Stripe/PegPay reference IDs
- Payment reconciliation: match payments to invoices
- View failed payment attempts and retry history

**Permission:** `billing.view`

### 7d. Performance Fee Management

- P&L snapshot review per user per billing period: realized P&L, high water mark, performance fee calculated, is_finalized
- Finalize P&L periods for fee invoicing
- View performance fee revenue across the platform

**Permissions:** `billing.view`, `billing.manage`

### 7e. Financial Reports & Export

- Revenue summary: subscription revenue, performance fee revenue, by tier, by period
- Export financial data as CSV for accounting

**Permissions:** `billing.view`, `billing.export`

---

## 8. Stella One Pool

### 8a. Pool Wallet Overview

- List all pool wallets: exchange, total capital, allocated, available, reserved for fees, active user count, status
- Pool wallet detail: allocation breakdown per user, transaction journal, reimbursement history
- Manage pool wallet config: max allocation per user, max total users

**Permission:** `pool.view`

### 8b. Allocation Management

- View all allocations: user, pool wallet, allocated amount, current value, P&L, Stella's share, user's share, status
- Reclaim capital from users (with reason) — sets `reclaimed_at`, `reclaim_reason` on allocation
- View allocation lifecycle: activated → trading → reclaimed/completed

**Permissions:** `pool.view`, `pool.manage`, `pool.reclaim`

### 8c. Withdrawal Requests

- Queue of pending withdrawal requests sorted by request date
- Request detail: user, allocation, amount requested, available profit, wallet address, network, withdrawal method
- Approve or reject with notes (sets `approved_by_admin_id`, `approved_at` or `rejected_at`, `rejection_reason`)
- Track processing: mark as processing, record transaction hash, gas fees, network fees, net amount, processing time
- Mark as completed or failed
- Filter by: status (pending, approved, rejected, processing, completed, failed), date range, amount range

**Permissions:** `pool.view`, `pool.manage`

### 8d. Reimbursement Tracking

- List all reimbursements: allocation, user, gross profit, Stella's share, user's share, gas fees covered, net reimbursement, processed status
- Mark reimbursements as processed
- View reimbursement by period

**Permissions:** `pool.view`, `pool.manage`

---

## 9. Predictions & AI

### 9a. Prediction Accuracy Dashboard

- Aggregate prediction accuracy: % of buy/sell/hold signals that were correct by symbol, by model type, by time horizon
- Model performance over time: accuracy trend, confidence calibration (are 80% confidence predictions right 80% of the time?)
- Prediction volume: signals generated per day/hour, by symbol, by model type

### 9b. Prediction Explorer

- Searchable table of all predictions: symbol, model type, predicted signal, confidence, predicted peak/dip prices, actual outcome (if tracked), physics parameters (p0, v0, acceleration, r_squared)
- Filter by: model type, symbol, confidence range, date range, signal direction
- View prediction → signal → order → position chain for individual predictions

**Permission:** `strategies.view`

---

## 10. Monitoring & Alerts

### 10a. User Alert Overview

- View all monitoring alerts configured by users across the platform: user, bot, alert type, condition, status, trigger count
- Identify users with excessive triggered alerts (potential issues)
- Platform-wide alert statistics

**Permission:** `trading.view`

---

## 11. Reports & Audit

### 11a. Platform Reports

- Daily/weekly/monthly platform summary: new users, active traders, total volume, total P&L, revenue, positions opened/closed
- Performance leaderboard: top performing users/strategies by ROI, Sharpe, win rate (anonymized or named based on user consent)
- Exchange volume distribution: which exchanges handle the most volume
- Tier distribution: user counts and revenue per tier

**Permissions:** `reports.view`, `reports.export`

### 11b. Audit Log

- Full immutable audit trail of all admin actions: who, what, when, on which resource, old value → new value, reason, IP address, permission used, request path
- Searchable by: admin user, action type, resource type, date range, correlation ID
- Cannot be edited or deleted (append-only by design)

**Permission:** `reports.audit_log`

---

## 12. System Administration

### 12a. Service Health

- Live status of all platform services: name, status (healthy, degraded, down), last check time, latency, error details
- Health history over time

### 12b. Admin User Management

- List all admin users: email, name, roles, status, MFA enabled, last login, invited by
- Invite new admin users (sets `invited_by`)
- Assign/remove roles with optional expiration
- Deactivate admin accounts
- View admin session history

**Permissions:** `admins.view`, `admins.create`, `admins.update`, `admins.delete`

### 12c. System Configuration

- Platform-wide config settings (via system config or feature flags)
- Toggle maintenance mode (displays maintenance message, pauses bot spawning)

**Permissions:** `system.view_health`, `system.manage_config`, `system.maintenance_mode`

---

## Role → Feature Access Matrix

| Feature | Super Admin | Ops Manager | Risk Officer | Compliance | Finance | Strategy Curator | Support Agent |
|---|---|---|---|---|---|---|---|
| Dashboard | Full | Full | Risk focus | KYC queue | Billing focus | Strategy focus | Read-only |
| User Management | Full | Full | View only | KYC review | View only | View only | View + basic |
| Exchange Mgmt | Full | Full | View only | — | — | — | — |
| Trading Ops | Full | Full | View + breakers | View only | — | View only | View only |
| Strategy Mgmt | Full | — | — | — | — | Full | — |
| Risk Mgmt | Full | View only | Full | — | — | — | — |
| Billing | Full | — | — | — | Full | — | — |
| Stella One Pool | Full | — | — | — | Full | — | — |
| Predictions | Full | — | View only | — | — | Full | — |
| Reports | Full | Full | Risk reports | Compliance | Financial | — | — |
| Audit Log | Full | — | — | Full | — | — | — |
| System Admin | Full | Health only | — | — | — | — | — |

---

## Implementation Notes

- Every write action (create, update, delete, approve, reject, force-stop, etc.) must write to `admin.admin_audit_log` with the acting admin's ID, email, name, action, resource, old/new values, reason, and permission used
- All sensitive actions (`is_sensitive: true` on permission) should require confirmation dialogs in the UI
- Admin authentication flows through Logto (same provider, separate admin app) with MFA enforcement for sensitive roles
- The UI should check `admin.has_permission(admin_user_id, permission_code)` before rendering action buttons — super_admin bypasses all checks
- Session management: track active sessions in `admin.admin_sessions`, enforce expiry, show concurrent session warnings
