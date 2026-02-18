# Stella Admin Implementation Checklist

Track progress for all admin features. Check off items as they're completed.

**Last Updated:** 2026-02-16
**Database:** stella_platform_new (170.168.103.207:3212)

---

## Phase 0: Foundation (CRITICAL - Do First)

**Priority:** CRITICAL | **Estimated Time:** 3-4 days

### 0.1 Admin Authentication & Authorization

#### Ecto Schemas
- [ ] Create `lib/stella_admin/auth/admin_user.ex`
- [ ] Create `lib/stella_admin/auth/admin_role.ex`
- [ ] Create `lib/stella_admin/auth/admin_permission.ex`
- [ ] Create `lib/stella_admin/auth/admin_user_role.ex`
- [ ] Create `lib/stella_admin/auth/admin_role_permission.ex`
- [ ] Create `lib/stella_admin/auth/admin_session.ex`
- [ ] Create `lib/stella_admin/admin/audit_log.ex`

#### Context Layer
- [ ] Create `lib/stella_admin/auth.ex` context
- [ ] Implement `get_admin_user/1`
- [ ] Implement `get_admin_user_by_email/1`
- [ ] Implement `authenticate_admin/1`
- [ ] Implement `create_admin_session/2`
- [ ] Implement `get_session_by_token/1`
- [ ] Implement `update_session_activity/1`
- [ ] Implement `expire_admin_session/1`
- [ ] Implement `expire_all_sessions/1`
- [ ] Implement `has_permission?/2`
- [ ] Implement `get_effective_permissions/1`
- [ ] Implement `list_roles/0`
- [ ] Implement `assign_role/4`
- [ ] Implement `remove_role/2`

#### Admin Context & Audit Logging
- [ ] Create `lib/stella_admin/admin.ex` context
- [ ] Implement `log_action/8` function

#### Plugs
- [ ] Create `lib/stella_admin_web/plugs/load_admin_user.ex`
- [ ] Create `lib/stella_admin_web/plugs/require_admin_auth.ex`
- [ ] Create `lib/stella_admin_web/plugs/require_permission.ex`

#### LiveView Hooks
- [ ] Create `lib/stella_admin_web/live/live_auth.ex`
- [ ] Implement `on_mount(:require_admin, ...)`
- [ ] Implement `on_mount({:require_permission, code}, ...)`

#### Webhook Updates
- [ ] Add `admin_webhooks/2` endpoint to `webhook_controller.ex`
- [ ] Implement admin PostSignIn handler
- [ ] Add `post "/admin-webhooks"` route

#### Router Updates
- [ ] Update browser pipeline to use `LoadAdminUser` plug
- [ ] Create `:require_admin_auth` pipeline
- [ ] Update protected routes to use `:require_admin` on_mount

#### Testing
- [ ] Test admin authentication flow via Logto
- [ ] Test permission checking (`has_permission?`)
- [ ] Test session management (create, expire)
- [ ] Test role assignment
- [ ] Test audit logging
- [ ] Verify super admin bypasses permission checks

---

## Phase 1: Core Admin Experience

### 1.1 Dashboard (Home)

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `system.view_health`, `reports.view`

#### Context
- [ ] Create `lib/stella_admin/dashboard.ex`
- [ ] Implement `get_platform_metrics/0`
- [ ] Implement `count_active_users/0`
- [ ] Implement `count_total_users/0`
- [ ] Implement `count_active_bots/0`
- [ ] Implement `get_bot_status_counts/0`
- [ ] Implement `calculate_total_platform_equity/0`
- [ ] Implement `calculate_todays_aggregate_pnl/0`
- [ ] Implement `count_open_positions/0`
- [ ] Implement `count_recent_breakers/0`
- [ ] Implement `get_service_health_summary/0`
- [ ] Implement `count_pending_kyc/0`
- [ ] Implement `count_pending_withdrawals/0`
- [ ] Implement `get_exchange_status_summary/0`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/dashboard_live.ex`
- [ ] Implement mount with metrics loading
- [ ] Add 10-second auto-refresh
- [ ] Handle `:refresh_metrics` message
- [ ] Create `lib/stella_admin_web/live/dashboard_live.html.heex`

#### Components
- [ ] Create `lib/stella_admin_web/components/dashboard_components.ex`
- [ ] Implement `metric_card/1` component
- [ ] Implement `service_status_badge/1` component
- [ ] Implement `pending_items_list/1` component
- [ ] Implement `pending_item/1` component
- [ ] Implement `exchange_status_badge/1` component

#### Styling
- [ ] Add dashboard CSS to `assets/css/admin.css`
- [ ] Style metrics grid (responsive)
- [ ] Style service health panel
- [ ] Style pending items panel

#### Testing
- [ ] Test metric calculations with real data
- [ ] Test real-time updates (10s refresh)
- [ ] Test permission check (`system.view_health`)
- [ ] Verify performance (queries optimized)

---

### 1.2 Admin User Management

**Priority:** HIGH | **Estimated Time:** 3 days | **Permissions:** `admins.view`, `admins.create`, `admins.update`, `admins.delete`

#### Context
- [x] Create `lib/stella_admin/admin.ex` (if not from Phase 0)
- [x] Implement `list_admin_users/1` with filters
- [x] Implement `get_admin_user!/1`
- [x] Implement `invite_admin_user/2`
- [x] Implement `deactivate_admin_user/3`
- [x] Implement `assign_role/4` (wrapper with audit)
- [x] Implement `remove_role/4` (wrapper with audit)
- [x] Implement `get_admin_user_roles/1`
- [x] Implement `count_admin_users/1`
- [x] Add filter helpers (status, role, search)

#### LiveView
- [x] Create `lib/stella_admin_web/live/admin_users_live.ex`
- [x] Implement mount with admin list loading
- [x] Implement handle_params for filter management
- [x] Handle `filter` event
- [x] Handle `clear_filters` event
- [x] Handle `toggle_filters` event
- [x] Create `lib/stella_admin_web/live/invite_admin_live.ex`
- [x] Handle `validate` event (invite form)
- [x] Handle `invite` event (invite form submission)
- [x] Create `lib/stella_admin_web/live/admin_user_detail_live.ex`
- [x] Implement mount with admin detail loading
- [x] Handle `show_deactivate_modal` event
- [x] Handle `hide_deactivate_modal` event
- [x] Handle `deactivate` event
- [x] Handle `show_assign_role_modal` event
- [x] Handle `hide_assign_role_modal` event
- [x] Handle `assign_role` event
- [x] Handle `show_remove_role_modal` event
- [x] Handle `hide_remove_role_modal` event
- [x] Handle `remove_role` event

#### UI Components
- [x] Create admin users table with filters
- [x] Create invite admin form at `/system/admins/new`
- [x] Improved phone input with JavaScript hook and validation
- [x] Create deactivate admin confirmation modal
- [x] Create admin detail page with comprehensive information:
  - [x] User avatar/initials
  - [x] Status badges (Active, Invited, Suspended, Deactivated, Super Admin)
  - [x] Basic information section
  - [x] Security & Access section (MFA, last login, failed logins, etc.)
  - [x] Account history section
  - [x] Roles section (displays assigned roles with hover-to-remove)
  - [x] Quick actions panel
- [x] Create role assignment modal with available roles list
- [x] Create role removal confirmation modal

#### Routes
- [x] Add `live "/system/admins", AdminUsersLive`
- [x] Add `live "/system/admins/new", InviteAdminLive`
- [x] Add `live "/system/admins/:id", AdminUserDetailLive`

#### Testing
- [ ] Test invite admin (creates user in Logto + DB + sends invitation)
- [x] Test deactivate admin (updates status + logs audit)
- [ ] Test role assignment (creates user_role + logs audit)
- [ ] Test role removal (deletes user_role + logs audit)
- [ ] Test permission checks for each action
- [ ] Verify audit log entries

---

## Phase 2: User Management

### 2.1 User List & Profiles

**Priority:** HIGH | **Estimated Time:** 3 days | **Permissions:** `users.view`, `users.update`, `users.update_tier`, `users.suspend`, `users.export`

#### Context
- [x] Create `lib/stella_admin/users.ex`
- [x] Implement `list_users/1` with filters and pagination
- [x] Implement filter helpers (email, status, tier, verification status, date range)
- [x] Implement `get_user_detail/1`
- [x] Implement `update_user_status/4`
- [x] Implement `change_user_tier/4`
- [x] Implement `suspend_user/3`
- [x] Implement `export_user_data/1` (GDPR compliance - placeholder)
- [x] Implement `calculate_user_equity/1` (placeholder)
- [x] Implement `calculate_user_pnl/1` (placeholder)
- [x] Implement `get_user_stats/0`

#### LiveView
- [x] Update `lib/stella_admin_web/live/users_live.ex` with database integration
- [x] Implement mount with user list loading
- [x] Implement handle_params for URL-based filtering and pagination
- [x] Implement pagination with URL params
- [x] Handle `filter` event (status filtering)
- [x] Handle `filter_tier` event
- [x] Handle `search` event (email search)
- [x] Handle `change_tier` event
- [x] Handle `update_tier_selection` event
- [x] Handle `update_tier_reason` event
- [x] Handle `show_change_tier_modal` event
- [x] Handle `close_change_tier_modal` event
- [x] Handle `suspend_user` event
- [x] Handle `update_suspend_reason` event
- [x] Handle `show_suspend_modal` event
- [x] Handle `close_suspend_modal` event
- [x] Handle `toggle_filters` event
- [x] Handle `clear_filters` event

#### UI Components
- [x] Create users table with real database columns (email, username, status, tier, verification badges, joined, last login)
- [x] Create status filter buttons (all, active, suspended, pending, banned)
- [x] Create email search input
- [x] Create tier change modal with tier dropdown and reason field
- [x] Create suspend user confirmation modal with reason field
- [x] Create stats dashboard (total, active, verified, suspended, new users)
- [x] Create pagination controls with URL navigation

#### User Detail Page
- [x] Update `lib/stella_admin_web/live/user_detail_live.ex` with database integration
- [x] Display full user profile (email, username, phone, tier, status, verification badges)
- [x] Display user stats (equity, P&L, positions value, account lock status)
- [x] Display account info (joined date, last login, last IP, failed logins)
- [x] Display tier history (placeholder for tier_history table)
- [x] Display KYC records (placeholder for KYC context)
- [x] Display connected exchanges (placeholder for exchange context)
- [x] Display active bots (placeholder for bots context)
- [x] Display current equity & P&L (using placeholder data)
- [x] Display user metadata (JSON viewer)
- [x] Add export user data button
- [x] Add suspend user modal with reason field

#### Routes
- [x] Routes already exist: `live "/users", UsersLive`
- [x] Routes already exist: `live "/users/:id", UserDetailLive`

#### Testing
- [ ] Test user list with filters
- [ ] Test pagination
- [ ] Test tier change (updates user + creates tier_history + logs audit)
- [ ] Test user suspension (updates status + stops bots + logs audit)
- [ ] Test user data export (returns complete JSON)
- [ ] Test permission checks
- [ ] Verify audit logs

---

### 2.2 KYC Review ✅ COMPLETE

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `users.view`, `users.update` | **Role:** Compliance Officer

#### Context Updates
- [x] Add `list_pending_kyc_submissions/1` to Users context
- [x] Add `get_kyc_detail/1`
- [x] Add `approve_kyc/3`
- [x] Add `reject_kyc/3`
- [x] Add `maybe_upgrade_tier/2` (auto-upgrade based on KYC level)

#### LiveView
- [x] Create `lib/stella_admin_web/live/users/kyc_review_live.ex`
- [x] Implement mount with pending KYC queue
- [x] Handle `approve` event
- [x] Handle `reject` event
- [x] Create `lib/stella_admin_web/live/users/kyc_review_live.html.heex`

#### UI Components
- [x] Create KYC queue cards
- [x] Create approve KYC modal (with notes field)
- [x] Create reject KYC modal (with reason field)
- [x] Display pending count

#### KYC Detail Page
- [x] Create `lib/stella_admin_web/live/users/kyc_detail_live.ex`
- [x] Display full KYC record
- [x] Display submitted documents
- [x] Display provider information
- [x] Show approve/reject actions
- [x] Create `lib/stella_admin_web/live/users/kyc_detail_live.html.heex`

#### Routes
- [x] Add `live "/users/kyc-review", Users.KycReviewLive`
- [x] Add `live "/users/kyc-review/:id", Users.KycDetailLive`

#### Testing
- [x] Test KYC approval (updates status + triggers tier upgrade + logs audit)
- [x] Test KYC rejection (updates status + sets rejection_reason + logs audit)
- [x] Test automatic tier upgrade logic
- [x] Test permission checks (Compliance Officer role)
- [x] Verify audit logs

---

## Phase 3: Trading Operations

### 3.1 Live Trading Monitor

**Priority:** HIGH | **Estimated Time:** 3 days | **Permissions:** `trading.view`, `trading.force_stop`

#### Context
- [ ] Create `lib/stella_admin/trading.ex`
- [ ] Implement `list_active_bots/1` with filters
- [ ] Implement filter helpers (status, exchange, strategy, user_tier)
- [ ] Implement `force_stop_bot/3`
- [ ] Implement `force_stop_user_bots/3`
- [ ] Implement `emergency_stop_all_bots/2` (super admin only)
- [ ] Implement `publish_bot_stop_command/2` (RabbitMQ)

#### LiveView
- [ ] Create `lib/stella_admin_web/live/trading/live_monitor_live.ex`
- [ ] Implement mount with bot list loading
- [ ] Add 5-second auto-refresh
- [ ] Handle `:refresh` message
- [ ] Handle `filter` event
- [ ] Handle `force_stop` event
- [ ] Handle `force_stop_user` event
- [ ] Handle `emergency_stop_all` event
- [ ] Create `lib/stella_admin_web/live/trading/live_monitor_live.html.heex`

#### UI Components
- [ ] Create bots table (user, strategy, exchange, pairs, status, heartbeat, trades, positions, P&L)
- [ ] Create filter panel
- [ ] Create force stop modal with reason field
- [ ] Create force stop user confirmation
- [ ] Create emergency stop all modal (super admin only)

#### RabbitMQ Integration
- [ ] Set up AMQP connection
- [ ] Publish to `trading.commands` exchange
- [ ] Use routing key `bot.stop.{bot_id}`
- [ ] Payload: `%{bot_id, command: "stop", reason}`

#### Routes
- [ ] Add `live "/trading/monitor", Trading.LiveMonitorLive`

#### Testing
- [ ] Test bot listing with real-time updates
- [ ] Test force stop single bot (publishes command + updates DB + logs audit)
- [ ] Test force stop all user bots
- [ ] Test emergency stop all (super admin only)
- [ ] Test permission checks
- [ ] Verify RabbitMQ messages published
- [ ] Verify audit logs

---

### 3.2 Position Viewer

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `trading.view`, `trading.close_positions`

#### Context Updates
- [ ] Add `list_positions/1` to Trading context
- [ ] Add position filter helpers (status, exchange, pair, P&L range, dates)
- [ ] Add `get_position_detail/1`
- [ ] Add `force_close_position/3`
- [ ] Add `force_close_positions_bulk/3`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/trading/positions_live.ex`
- [ ] Implement mount with position list
- [ ] Handle `filter` event
- [ ] Handle `force_close` event
- [ ] Handle `force_close_bulk` event
- [ ] Create `lib/stella_admin_web/live/trading/positions_live.html.heex`

#### UI Components
- [ ] Create positions table
- [ ] Create filter panel
- [ ] Create position detail modal (physics, orders, fills, signals)
- [ ] Create force close confirmation
- [ ] Create bulk close confirmation

#### Routes
- [ ] Add `live "/trading/positions", Trading.PositionsLive`
- [ ] Add `live "/trading/positions/:id", Trading.PositionDetailLive`

#### Testing
- [ ] Test position listing with filters
- [ ] Test force close position (creates market order + logs audit)
- [ ] Test bulk close
- [ ] Test permission checks
- [ ] Verify audit logs

---

### 3.3 Order & Fill History

**Priority:** MEDIUM | **Estimated Time:** 1 day | **Permissions:** `trading.view`

#### Context Updates
- [ ] Add `list_orders/1` to Trading context
- [ ] Add order filter helpers
- [ ] Add `get_order_detail/1`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/trading/orders_live.ex`
- [ ] Create `lib/stella_admin_web/live/trading/orders_live.html.heex`

#### Routes
- [ ] Add `live "/trading/orders", Trading.OrdersLive`

#### Testing
- [ ] Test order listing with filters
- [ ] Test permission checks

---

## Phase 4: Risk Management

### 4.1 Risk Dashboard

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `risk.view`

#### Context
- [ ] Create `lib/stella_admin/risk.ex`
- [ ] Implement `get_risk_overview/0`
- [ ] Implement aggregate risk calculations

#### LiveView
- [ ] Create `lib/stella_admin_web/live/risk/dashboard_live.ex`
- [ ] Create `lib/stella_admin_web/live/risk/dashboard_live.html.heex`

#### Routes
- [ ] Add `live "/risk", Risk.DashboardLive`

---

### 4.2 Limit Configuration

**Priority:** HIGH | **Estimated Time:** 3 days | **Permissions:** `risk.view`, `risk.update_limits`, `risk.override_user`

#### Context Updates
- [ ] Add `list_global_limits/0`
- [ ] Add `update_global_limit/3`
- [ ] Add `list_tier_limits/1`
- [ ] Add `update_tier_limit/4`
- [ ] Add `list_user_overrides/1`
- [ ] Add `set_user_override/5`
- [ ] Add `get_effective_limit/2` (shows which layer is binding)

#### LiveView
- [ ] Create `lib/stella_admin_web/live/risk/limits_live.ex`
- [ ] Create `lib/stella_admin_web/live/risk/limits_live.html.heex`

#### Routes
- [ ] Add `live "/risk/limits", Risk.LimitsLive`

---

### 4.3 Circuit Breaker Management

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `risk.view`, `risk.reset_breakers`

#### Context Updates
- [ ] Add `list_circuit_breaker_events/1`
- [ ] Add `get_circuit_breaker_detail/1`
- [ ] Add `manually_resolve_breaker/3`
- [ ] Add `reset_circuit_breaker/3`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/risk/breakers_live.ex`
- [ ] Create `lib/stella_admin_web/live/risk/breakers_live.html.heex`

#### Routes
- [ ] Add `live "/risk/circuit-breakers", Risk.BreakersLive`

---

### 4.4 Risk Audit Log

**Priority:** MEDIUM | **Estimated Time:** 1 day | **Permissions:** `risk.view`

#### Context Updates
- [ ] Add `list_risk_audit_log/1` with filters

#### LiveView
- [ ] Create `lib/stella_admin_web/live/risk/audit_live.ex`
- [ ] Create `lib/stella_admin_web/live/risk/audit_live.html.heex`

#### Routes
- [ ] Add `live "/risk/audit", Risk.AuditLive`

---

## Phase 5: Exchange Management

### 5.1 Adapter Configuration

**Priority:** MEDIUM | **Estimated Time:** 3 days | **Permissions:** `exchanges.view`, `exchanges.activate`, `exchanges.configure`

#### Context
- [ ] Create `lib/stella_admin/exchanges.ex`
- [ ] Implement `list_adapters/1`
- [ ] Implement `get_adapter_detail/1`
- [ ] Implement `activate_adapter/3`
- [ ] Implement `deactivate_adapter/3`
- [ ] Implement `update_adapter_config/3`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/exchanges/adapters_live.ex`
- [ ] Create `lib/stella_admin_web/live/exchanges/adapters_live.html.heex`

#### Routes
- [ ] Add `live "/exchanges/adapters", Exchanges.AdaptersLive`

---

### 5.2 User Credentials Overview

**Priority:** MEDIUM | **Estimated Time:** 1 day | **Permissions:** `exchanges.view`

#### Context Updates
- [ ] Add `list_user_credentials/1` (read-only, no key exposure)
- [ ] Add `trigger_revalidation/2`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/exchanges/credentials_live.ex`
- [ ] Create `lib/stella_admin_web/live/exchanges/credentials_live.html.heex`

#### Routes
- [ ] Add `live "/exchanges/credentials", Exchanges.CredentialsLive`

---

## Phase 6: Strategy Management

### 6.1 Core Strategies

**Priority:** MEDIUM | **Estimated Time:** 3 days | **Permissions:** `strategies.view`, `strategies.manage_core`

#### Context
- [ ] Create `lib/stella_admin/strategies.ex`
- [ ] Implement `list_core_strategies/1`
- [ ] Implement `create_core_strategy/2`
- [ ] Implement `update_core_strategy/3`
- [ ] Implement `publish_strategy/3`
- [ ] Implement `archive_strategy/3`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/strategies/core_strategies_live.ex`
- [ ] Create `lib/stella_admin_web/live/strategies/core_strategies_live.html.heex`

#### Routes
- [ ] Add `live "/strategies/core", Strategies.CoreStrategiesLive`

---

### 6.2 User Strategies & Marketplace

**Priority:** MEDIUM | **Estimated Time:** 2 days | **Permissions:** `strategies.view`, `strategies.approve`

#### Context Updates
- [ ] Add `list_user_strategies/1`
- [ ] Add `approve_strategy_for_marketplace/3`
- [ ] Add `reject_strategy/3`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/strategies/marketplace_live.ex`
- [ ] Create `lib/stella_admin_web/live/strategies/marketplace_live.html.heex`

#### Routes
- [ ] Add `live "/strategies/marketplace", Strategies.MarketplaceLive`

---

### 6.3 Backtest Results

**Priority:** LOW | **Estimated Time:** 1 day | **Permissions:** `strategies.view`

#### Context Updates
- [ ] Add `list_backtest_results/1`
- [ ] Add `get_backtest_detail/1`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/strategies/backtests_live.ex`
- [ ] Create `lib/stella_admin_web/live/strategies/backtests_live.html.heex`

#### Routes
- [ ] Add `live "/strategies/backtests", Strategies.BacktestsLive`

---

## Phase 7: Billing & Finance

### 7.1 Subscription Overview

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `billing.view`, `billing.manage`

#### Context
- [ ] Create `lib/stella_admin/billing.ex`
- [ ] Implement `list_subscriptions/1`
- [ ] Implement `get_subscription_detail/1`
- [ ] Implement `cancel_subscription/3`
- [ ] Implement `refund_subscription/3`
- [ ] Implement `change_plan/4`
- [ ] Implement `extend_trial/4`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/billing/subscriptions_live.ex`
- [ ] Create `lib/stella_admin_web/live/billing/subscriptions_live.html.heex`

#### Routes
- [ ] Add `live "/billing/subscriptions", Billing.SubscriptionsLive`

---

### 7.2 Invoice Management

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `billing.view`, `billing.manage`

#### Context Updates
- [ ] Add `list_invoices/1`
- [ ] Add `get_invoice_detail/1`
- [ ] Add `issue_manual_invoice/2`
- [ ] Add `void_invoice/3`
- [ ] Add `refund_invoice/3`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/billing/invoices_live.ex`
- [ ] Create `lib/stella_admin_web/live/billing/invoices_live.html.heex`

#### Routes
- [ ] Add `live "/billing/invoices", Billing.InvoicesLive`

---

### 7.3 Payment Tracking

**Priority:** MEDIUM | **Estimated Time:** 1 day | **Permissions:** `billing.view`

#### Context Updates
- [ ] Add `list_payments/1`
- [ ] Add `get_payment_detail/1`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/billing/payments_live.ex`
- [ ] Create `lib/stella_admin_web/live/billing/payments_live.html.heex`

#### Routes
- [ ] Add `live "/billing/payments", Billing.PaymentsLive`

---

### 7.4 Performance Fee Management

**Priority:** MEDIUM | **Estimated Time:** 2 days | **Permissions:** `billing.view`, `billing.manage`

#### Context Updates
- [ ] Add `list_pnl_snapshots/1`
- [ ] Add `finalize_pnl_period/3`
- [ ] Add `calculate_performance_fees/1`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/billing/performance_fees_live.ex`
- [ ] Create `lib/stella_admin_web/live/billing/performance_fees_live.html.heex`

#### Routes
- [ ] Add `live "/billing/performance-fees", Billing.PerformanceFeesLive`

---

### 7.5 Financial Reports

**Priority:** MEDIUM | **Estimated Time:** 1 day | **Permissions:** `billing.view`, `billing.export`

#### Context Updates
- [ ] Add `generate_revenue_summary/2`
- [ ] Add `export_financial_data/2` (CSV)

#### LiveView
- [ ] Create `lib/stella_admin_web/live/billing/reports_live.ex`
- [ ] Create `lib/stella_admin_web/live/billing/reports_live.html.heex`

#### Routes
- [ ] Add `live "/billing/reports", Billing.ReportsLive`

---

## Phase 8: Stella One Pool

### 8.1 Pool Wallet Overview

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `pool.view`

#### Context
- [ ] Create `lib/stella_admin/pool.ex`
- [ ] Implement `list_pool_wallets/0`
- [ ] Implement `get_pool_wallet_detail/1`
- [ ] Implement `update_pool_config/3`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/pool/wallets_live.ex`
- [ ] Create `lib/stella_admin_web/live/pool/wallets_live.html.heex`

#### Routes
- [ ] Add `live "/pool/wallets", Pool.WalletsLive`

---

### 8.2 Allocation Management

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `pool.view`, `pool.manage`, `pool.reclaim`

#### Context Updates
- [ ] Add `list_allocations/1`
- [ ] Add `get_allocation_detail/1`
- [ ] Add `reclaim_capital/3`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/pool/allocations_live.ex`
- [ ] Create `lib/stella_admin_web/live/pool/allocations_live.html.heex`

#### Routes
- [ ] Add `live "/pool/allocations", Pool.AllocationsLive`

---

### 8.3 Withdrawal Requests

**Priority:** HIGH | **Estimated Time:** 3 days | **Permissions:** `pool.view`, `pool.manage`

#### Context Updates
- [ ] Add `list_withdrawal_requests/1`
- [ ] Add `get_withdrawal_request_detail/1`
- [ ] Add `approve_withdrawal/3`
- [ ] Add `reject_withdrawal/3`
- [ ] Add `mark_processing/3`
- [ ] Add `mark_completed/4`
- [ ] Add `mark_failed/3`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/pool/withdrawals_live.ex`
- [ ] Create `lib/stella_admin_web/live/pool/withdrawals_live.html.heex`

#### Routes
- [ ] Add `live "/pool/withdrawals", Pool.WithdrawalsLive`

---

### 8.4 Reimbursement Tracking

**Priority:** MEDIUM | **Estimated Time:** 1 day | **Permissions:** `pool.view`, `pool.manage`

#### Context Updates
- [ ] Add `list_reimbursements/1`
- [ ] Add `mark_reimbursement_processed/2`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/pool/reimbursements_live.ex`
- [ ] Create `lib/stella_admin_web/live/pool/reimbursements_live.html.heex`

#### Routes
- [ ] Add `live "/pool/reimbursements", Pool.ReimbursementsLive`

---

## Phase 9: Predictions & AI

### 9.1 Prediction Accuracy Dashboard

**Priority:** LOW | **Estimated Time:** 2 days | **Permissions:** `strategies.view`

#### Context
- [ ] Create `lib/stella_admin/predictions.ex`
- [ ] Implement `get_prediction_accuracy_metrics/1`
- [ ] Implement accuracy calculations by symbol, model, time horizon

#### LiveView
- [ ] Create `lib/stella_admin_web/live/predictions/accuracy_live.ex`
- [ ] Create `lib/stella_admin_web/live/predictions/accuracy_live.html.heex`

#### Routes
- [ ] Add `live "/predictions/accuracy", Predictions.AccuracyLive`

---

### 9.2 Prediction Explorer

**Priority:** LOW | **Estimated Time:** 1 day | **Permissions:** `strategies.view`

#### Context Updates
- [ ] Add `list_predictions/1`
- [ ] Add `get_prediction_detail/1`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/predictions/explorer_live.ex`
- [ ] Create `lib/stella_admin_web/live/predictions/explorer_live.html.heex`

#### Routes
- [ ] Add `live "/predictions/explorer", Predictions.ExplorerLive`

---

## Phase 10: Monitoring & Alerts

### 10.1 User Alert Overview

**Priority:** LOW | **Estimated Time:** 1 day | **Permissions:** `trading.view`

#### Context
- [ ] Create `lib/stella_admin/monitoring.ex`
- [ ] Implement `list_user_alerts/1`
- [ ] Implement `get_alert_statistics/0`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/monitoring/alerts_live.ex`
- [ ] Create `lib/stella_admin_web/live/monitoring/alerts_live.html.heex`

#### Routes
- [ ] Add `live "/monitoring/alerts", Monitoring.AlertsLive`

---

## Phase 11: Reports & Audit

### 11.1 Platform Reports

**Priority:** MEDIUM | **Estimated Time:** 2 days | **Permissions:** `reports.view`, `reports.export`

#### Context
- [ ] Create `lib/stella_admin/reports.ex`
- [ ] Implement `generate_platform_summary/2`
- [ ] Implement `generate_leaderboard/2`
- [ ] Implement `generate_volume_distribution/2`
- [ ] Implement `generate_tier_distribution/0`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/reports/platform_reports_live.ex`
- [ ] Create `lib/stella_admin_web/live/reports/platform_reports_live.html.heex`

#### Routes
- [ ] Add `live "/reports", Reports.PlatformReportsLive`

---

### 11.2 Audit Log Viewer

**Priority:** HIGH | **Estimated Time:** 2 days | **Permissions:** `reports.audit_log`

#### Context Updates
- [ ] Add `list_audit_log/1` with filters (admin, action, resource, dates)
- [ ] Add `get_audit_log_detail/1`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/reports/audit_log_live.ex`
- [ ] Create `lib/stella_admin_web/live/reports/audit_log_live.html.heex`

#### Routes
- [ ] Add `live "/reports/audit-log", Reports.AuditLogLive`

---

## Phase 12: System Administration

### 12.1 Service Health Monitor

**Priority:** MEDIUM | **Estimated Time:** 1 day | **Permissions:** `system.view_health`

#### Context
- [ ] Create `lib/stella_admin/system.ex`
- [ ] Implement `list_service_health/0`
- [ ] Implement `get_service_health_history/2`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/system/health_live.ex`
- [ ] Create `lib/stella_admin_web/live/system/health_live.html.heex`

#### Routes
- [ ] Add `live "/system/health", System.HealthLive`

---

### 12.2 System Configuration

**Priority:** LOW | **Estimated Time:** 2 days | **Permissions:** `system.manage_config`, `system.maintenance_mode`

#### Context Updates
- [ ] Add `get_system_config/0`
- [ ] Add `update_system_config/3`
- [ ] Add `enable_maintenance_mode/2`
- [ ] Add `disable_maintenance_mode/2`

#### LiveView
- [ ] Create `lib/stella_admin_web/live/system/config_live.ex`
- [ ] Create `lib/stella_admin_web/live/system/config_live.html.heex`

#### Routes
- [ ] Add `live "/system/config", System.ConfigLive`

---

## Dependencies & Setup

### Add Dependencies to mix.exs
- [ ] Add `{:uuid, "~> 1.1"}` for correlation IDs
- [ ] Add `{:number, "~> 1.0"}` for currency formatting
- [ ] Add `{:csv, "~> 3.0"}` for data export
- [ ] Add `{:amqp, "~> 3.3"}` for RabbitMQ
- [ ] Add `{:timex, "~> 3.7"}` for date/time formatting
- [ ] Run `mix deps.get`

### Update Database Configuration
- [ ] Update `config/runtime.exs` to use `stella_platform_new` database
- [ ] Verify connection: `170.168.103.207:3212`
- [ ] Test database connectivity

### RabbitMQ Setup
- [ ] Configure RabbitMQ connection in `config/runtime.exs`
- [ ] Create `trading.commands` exchange
- [ ] Test message publishing

---

## Testing & QA

### Unit Tests
- [ ] Write tests for all context functions
- [ ] Test all audit logging
- [ ] Test all permission checks
- [ ] Test edge cases and error handling

### Integration Tests
- [ ] Test full flows (e.g., approve KYC → tier upgrade → limit recalculation)
- [ ] Test transaction rollbacks
- [ ] Test RabbitMQ message publishing

### LiveView Tests
- [ ] Test all user interactions
- [ ] Test real-time updates
- [ ] Test modal interactions
- [ ] Test form submissions

### Performance Tests
- [ ] Optimize database queries (use `EXPLAIN ANALYZE`)
- [ ] Test with large datasets
- [ ] Verify no N+1 queries
- [ ] Test real-time update performance

---

## Deployment

### Pre-Deployment
- [ ] All tests passing
- [ ] Code review completed
- [ ] Security audit completed
- [ ] Documentation updated

### Staging Deployment
- [ ] Deploy to staging environment
- [ ] Run smoke tests
- [ ] Test with real admin users
- [ ] Gather feedback

### Production Deployment
- [ ] Deploy to production
- [ ] Monitor error rates
- [ ] Monitor performance
- [ ] Verify audit logs working

---

## Progress Summary

**Phase 0 (Foundation):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 1 (Core Admin):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 2 (User Management):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 3 (Trading Ops):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 4 (Risk Management):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 5 (Exchange Management):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 6 (Strategy Management):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 7 (Billing & Finance):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 8 (Stella One Pool):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 9 (Predictions & AI):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 10 (Monitoring & Alerts):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 11 (Reports & Audit):** ☐ Not Started | ☐ In Progress | ☐ Complete
**Phase 12 (System Admin):** ☐ Not Started | ☐ In Progress | ☐ Complete

---

**Overall Progress:** 0% (0/12 phases complete)
**Estimated Total Time:** 12 weeks (60 working days)
**Target Completion Date:** [Set based on start date]

---

## Notes

- Update this checklist as you complete tasks
- Mark phases as "In Progress" when you start working on them
- Mark phases as "Complete" when all tests pass and code is deployed
- Use this alongside `IMPLEMENTATION_STRATEGY.md` for detailed implementation guidance
