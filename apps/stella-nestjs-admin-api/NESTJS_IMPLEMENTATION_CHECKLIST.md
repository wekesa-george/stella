# NestJS Admin API - Implementation Checklist

**Project:** stella-nestjs-admin-api
**Database:** stella_platform_new (170.168.103.207:3212)
**Started:** February 25, 2026

---

## Phase 0: Foundation
- [x] Project scaffolding (NestJS 11, pnpm)
- [x] Environment config (.env, database.config.ts)
- [x] TypeORM connection (multi-schema, synchronize: false)
- [x] Shared DTOs (pagination)
- [x] main.ts (Swagger, ValidationPipe, CORS, /api prefix)
- [x] Build & DB connection verified

---

## Batch 1: Pages 5, 6, 8, 9 — Alerts, Shifts, Users

### Page 5: Alerts (`/api/alerts`)
- [x] Entity: `trading.monitoring_alerts`
- [x] GET `/api/alerts` — List with filters + pagination
- [x] POST `/api/alerts/:id/acknowledge` — Acknowledge single
- [x] POST `/api/alerts/acknowledge-bulk` — Bulk acknowledge
- [x] DELETE `/api/alerts/:id` — Soft-delete
- [x] Tested & working

### Page 6: Shift Handoff (`/api/shift`)
- [x] Entity: `operations.shifts`
- [x] Entity: `operations.shift_activities`
- [x] Entity: `operations.watch_list_items`
- [x] GET `/api/shift/current` — Current active shift
- [x] POST `/api/shift/start` — Start new shift
- [x] GET `/api/shift/activities` — Activity log
- [x] POST `/api/shift/activities` — Log activity
- [x] GET `/api/shift/watch-list` — Watch list items
- [x] POST `/api/shift/watch-list` — Add watch item
- [x] POST `/api/shift/handoff` — Submit handoff
- [x] PUT `/api/shift/:id/notes` — Save draft notes
- [x] Tested & working

### Page 8: Users List (`/api/users`)
- [x] Entity: `auth.users`
- [x] Entity: `auth.user_profiles`
- [x] GET `/api/users` — User list with filters + pagination
- [x] Tested & working

### Page 9: User Detail (`/api/users/:id`)
- [x] GET `/api/users/:id` — User profile
- [x] GET `/api/users/:id/transactions` — Transaction history
- [ ] GET `/api/users/:id/activities` — Activity log (deferred: `auth.activity_logs` table doesn't exist)
- [x] PUT `/api/users/:id` — Edit user
- [x] POST `/api/users/:id/suspend` — Suspend user
- [x] POST `/api/users/:id/reactivate` — Reactivate user
- [x] Tested & working

**Batch 1 Status: COMPLETE** ✅

---

## Batch 2: Pages 10, 11, 19, 20 — Admin Users + KYC

### Page 10: Admin Users List (`/api/admin/admin-users`)
- [x] Entity: `admin.admin_users`
- [x] GET `/api/admin/admin-users` — List with filters + pagination + summary counts
- [x] Tested & working

### Page 11: Admin User Detail (`/api/admin/admin-users/:id`)
- [x] Entity: `admin.roles`
- [x] Entity: `admin.admin_user_roles`
- [x] Entity: `admin.admin_audit_log`
- [x] GET `/api/admin/admin-users/:id` — Admin detail
- [x] POST `/api/admin/admin-users/:id/deactivate` — Deactivate
- [x] GET `/api/admin/admin-users/:id/roles` — Get roles
- [x] POST `/api/admin/admin-users/:id/roles` — Assign role
- [x] DELETE `/api/admin/admin-users/:id/roles/:roleId` — Remove role
- [x] POST `/api/admin/admin-users/:id/reset-password` — Reset password
- [x] GET `/api/admin/roles/available` — Available roles
- [x] Tested & working

### Page 19: KYC Applicants (`/api/kyc/applicants`)
- [x] Entity: `kyc.applicants`
- [x] GET `/api/kyc/applicants/stats` — Status counts + work queue
- [x] GET `/api/kyc/applicants` — List with filters + pagination
- [x] GET `/api/kyc/applicants/:id` — Applicant detail with notes & history
- [x] POST `/api/kyc/applicants/:id/action` — Approve/decline/re-verify
- [x] Tested & working

### Page 20: KYC Providers (`/api/kyc/providers`)
- [x] Entity: `kyc.provider_config`
- [x] GET `/api/kyc/providers/stats` — Provider statistics
- [x] GET `/api/kyc/providers` — List providers
- [x] PUT `/api/kyc/providers/:id` — Update provider config
- [x] Tested & working

**Batch 2 Status: COMPLETE** ✅

---

## Batch 3: Pages 13, 14, 15, 16 — Finance

### Page 13: Finance Overview (`/api/finance`)
- [x] GET `/api/finance/platform-kpis` — Platform-wide financial KPIs
- [x] GET `/api/finance/equity-curve` — Equity curve data points
- [x] GET `/api/finance/monthly-returns` — Monthly return data
- [x] GET `/api/finance/drawdown-curve` — Drawdown profile data
- [x] Tested & working

### Page 14: Finance Strategies (`/api/finance/strategies`)
- [x] GET `/api/finance/strategies/performance` — Strategy performance metrics
- [x] GET `/api/finance/strategies/equity-curves` — Strategy equity curves
- [x] Tested & working

### Page 15: Finance Risk (`/api/finance/risk`)
- [x] GET `/api/finance/risk/overview` — Risk KPIs and VaR levels
- [x] GET `/api/finance/risk/concentration` — Capital concentration by exchange/strategy
- [x] GET `/api/finance/risk/correlation-matrix` — Strategy correlation matrix
- [x] GET `/api/finance/risk/position-sizing` — Position sizing distribution
- [x] Tested & working

### Page 16: Finance Market (`/api/finance/market`)
- [x] GET `/api/finance/market/kpis` — Market intelligence KPIs
- [x] GET `/api/finance/market/pairs` — Trading pair performance
- [x] GET `/api/finance/market/hourly-heatmap` — Hourly return heatmap
- [x] GET `/api/finance/market/exchanges` — Exchange P&L breakdown
- [x] Tested & working

**Batch 3 Status: COMPLETE** ✅

---

## Batch 4: Pages 17, 20b, 21b, 22 — Finance Users + Settings

### Page 17: Finance Users (`/api/finance/users`)
- [x] GET `/api/finance/users/kpis` — User analytics KPIs
- [x] GET `/api/finance/users/performance` — User performance leaderboard
- [x] GET `/api/finance/users/tiers` — Subscription tier distribution
- [x] GET `/api/finance/users/growth` — User growth over time
- [x] Tested & working

### Page 20b: Settings Risk (`/api/settings/risk`)
- [x] Entity: `platform.risk_controls`
- [x] GET `/api/settings/risk` — Get risk controls
- [x] PUT `/api/settings/risk` — Update risk controls
- [x] Tested & working

### Page 21b: Settings Integrations (`/api/settings/integrations`)
- [x] Entity: `platform.integrations`
- [x] Entity: `platform.outbound_webhooks`
- [x] Entity: `platform.webhook_signing_keys`
- [x] GET `/api/settings/integrations` — Get integrations & webhooks
- [x] PUT `/api/settings/integrations/:id` — Update integration
- [x] POST `/api/settings/integrations/webhooks` — Add webhook
- [x] PUT `/api/settings/integrations/webhooks/:id` — Update webhook
- [x] DELETE `/api/settings/integrations/webhooks/:id` — Remove webhook
- [x] POST `/api/settings/integrations/rotate-signing-key` — Rotate signing key
- [x] Tested & working

### Page 22: Settings Billing (`/api/settings/billing`)
- [x] Entity: `platform.billing_config`
- [x] GET `/api/settings/billing` — Get billing config
- [x] PUT `/api/settings/billing` — Update billing config
- [x] GET `/api/settings/billing/revenue-stats` — Revenue statistics
- [x] Tested & working

**Batch 4 Status: COMPLETE** ✅

---

## Batch 5: Pages 22b, 23, 23b, 24 — Settings (Bot, Security, Comms, Compliance)

### Page 22b: Settings Bot Engine (`/api/settings/bot-engine`)
- [x] Entity: `platform.bot_engine_defaults`
- [x] GET `/api/settings/bot-engine` — Get bot engine defaults
- [x] PUT `/api/settings/bot-engine` — Update bot engine defaults
- [x] Tested & working

### Page 23: Settings Security (`/api/settings/security`)
- [x] Entity: `platform.security_config`
- [x] Entity: `platform.ip_allowlist`
- [x] GET `/api/settings/security` — Get security config + IP allowlist
- [x] PUT `/api/settings/security` — Update security config + sync IP allowlist
- [x] Tested & working

### Page 23b: Settings Communications (`/api/settings/communications`)
- [x] Entity: `platform.email_settings`
- [x] Entity: `platform.email_templates`
- [x] GET `/api/settings/communications` — Get email settings & templates
- [x] PUT `/api/settings/communications/email` — Update email sender settings
- [x] PUT `/api/settings/communications/templates/:id` — Update email template
- [x] Tested & working

### Page 24: Settings Compliance (`/api/settings/compliance`)
- [x] Entity: `compliance.compliance_settings`
- [x] Entity: `compliance.jurisdiction_restrictions`
- [x] GET `/api/settings/compliance` — Get compliance settings & restrictions
- [x] PUT `/api/settings/compliance` — Update compliance settings
- [x] POST `/api/settings/compliance/restrictions` — Add jurisdiction restriction
- [x] PUT `/api/settings/compliance/restrictions/:id` — Update restriction
- [x] Tested & working

**Batch 5 Status: COMPLETE** ✅

---

## Batch 6: Pages 25, 26, 27 + KYC extras — Settings (Exchanges, Infra, Notifications)

### Page 25: Settings Exchanges (`/api/settings/exchanges`)
- [x] Entity: `exchange.platform_exchanges`
- [x] Entity: `exchange.exchange_health_checks`
- [x] Entity: `exchange.exchange_trading_pairs`
- [x] GET `/api/settings/exchanges` — List exchanges with KPIs
- [x] POST `/api/settings/exchanges` — Add new exchange
- [x] PUT `/api/settings/exchanges/:id` — Update exchange config
- [x] POST `/api/settings/exchanges/:id/test-connection` — Test exchange health
- [x] POST `/api/settings/exchanges/:id/rotate-credentials` — Rotate API credentials (pgcrypto)
- [x] POST `/api/settings/exchanges/:id/reveal-credentials` — Reveal encrypted credentials (pgcrypto)
- [x] Build verified

### Page 26: Settings Infrastructure (`/api/settings/infrastructure`)
- [x] Entity: `platform.infrastructure_settings`
- [x] Entity: `platform.feature_flags`
- [x] Entity: `platform.background_job_runs`
- [x] GET `/api/settings/infrastructure` — Load settings + feature flags + background jobs
- [x] PUT `/api/settings/infrastructure` — Update pool sizes and cache TTLs
- [x] PUT `/api/settings/infrastructure/feature-flags/:id` — Toggle feature flag per environment
- [x] POST `/api/settings/infrastructure/jobs/:jobName/trigger` — Record manual job trigger
- [x] Build verified

### Page 27: Settings Notifications (`/api/settings/notifications`)
- [x] Entity: `platform.notification_channels`
- [x] Entity: `platform.notification_routing`
- [x] Entity: `platform.notification_settings`
- [x] Entity: `platform.alert_types`
- [x] GET `/api/settings/notifications` — Load channels + routing + settings + alert types
- [x] PUT `/api/settings/notifications/channels/:id` — Update channel config
- [x] PUT `/api/settings/notifications/routing/:id` — Toggle severity routing
- [x] PUT `/api/settings/notifications/settings` — Update dedup window
- [x] PUT `/api/settings/notifications/alert-types/:id` — Toggle alert type enabled
- [x] Build verified

### Page 12b: KYC Regions (`/api/kyc/regions`)
- [x] Entity: `kyc.region_routing`
- [x] Entity: `kyc.reverification_rules`
- [x] GET `/api/kyc/regions` — List regions with summary stats
- [x] POST `/api/kyc/regions` — Create region (with country code conflict validation)
- [x] PUT `/api/kyc/regions/:id` — Update region
- [x] GET `/api/kyc/reverification-rules` — List re-verification rules
- [x] POST `/api/kyc/reverification-rules` — Create rule
- [x] PUT `/api/kyc/reverification-rules/:id` — Update rule
- [x] Build verified

### Page 13b: KYC Audit (`/api/kyc/audit`)
- [x] Entity: `kyc.audit_log`
- [x] GET `/api/kyc/audit` — Paginated audit log with filters
- [x] GET `/api/kyc/audit/export` — CSV export with same filters
- [x] Build verified

**Batch 6 Status: COMPLETE** ✅

---

## Skipped Pages (No NestJS endpoints needed)
- Page 1: Bot Fleet — Phoenix WebSocket only
- Page 2: Trading/Positions — Phoenix WebSocket only
- Page 3: Mission Control — Phoenix WebSocket only
- Page 4: Infrastructure — Phoenix WebSocket only
- Page 7: Bot Detail — Phoenix WebSocket only
- Page 12: Finance Dashboard — Redirect only
- Page 18: KYC Review — Redirect only
- Page 21: Settings — Redirect only

---

## Notes
- `auth.activity_logs` and `auth.user_suspensions` tables don't exist in DB — related endpoints deferred
- TypeORM cross-schema join bug: use `find()` API instead of `createQueryBuilder` with `leftJoinAndSelect` + `orderBy`
- Watch item status enum: `active`, `resolved`, `escalated` (not `open`)
- Shift status enum: `active`, `ended`, `abandoned` (not `handed_off`)
