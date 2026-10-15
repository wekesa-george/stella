# Remaining Schema Migrations TODO

## Migration 001 Status: ✅ COMPLETE

**File:** `001_page_analysis_schema_additions.sql`

**Includes:**
- 4 new schemas: `kyc`, `operations`, `compliance`, `platform`
- 18 tables extracted from 4 analysis files
- ALTER TABLE statements for `auth.users`
- Utility functions for cleanup

## Migration 002: Remaining Tables

The following analysis files still need schema extraction for Migration 002:

### High Priority Tables

#### 1. Finance & Billing (from 22-settings-billing.md)
- `platform.billing_config` - Platform fee structure
- `finance.fees_collected` - Fee collection history
- `finance.subscriptions` - User subscriptions

#### 2. Compliance (from 24-settings-compliance.md)
- `compliance.compliance_settings` - Compliance configuration
- `compliance.jurisdiction_restrictions` - Geographic restrictions
- `compliance.aml_flags` - AML/CTF flags
- `compliance.sanctions_screening_log` - Sanctions screening

#### 3. Exchange Management (from 25-settings-exchanges.md)
- `exchange.platform_exchanges` - Multi-exchange configuration
- `exchange.exchange_health_checks` - Exchange health monitoring
- `exchange.exchange_trading_pairs` - Supported trading pairs

#### 4. Platform Risk (from 20-settings-risk.md)
- `platform.risk_controls` - Risk management settings
- `platform.circuit_breaker_events` - Circuit breaker history
- `platform.user_drawdown_tracking` - Drawdown monitoring

### Medium Priority Tables

#### 5. Integrations & Webhooks (from 21-settings-integrations.md)
- `platform.integrations` - Third-party integrations
- `platform.outbound_webhooks` - Outbound webhook configs
- `platform.webhook_deliveries` - Delivery logs
- `platform.webhook_signing_keys` - Signing key management

#### 6. Bot Engine Settings (from 22-settings-bot-engine.md)
- `platform.bot_engine_defaults` - Default bot settings

#### 7. Communications (from 23-settings-communications.md)
- `platform.email_settings` - Email configuration
- `platform.email_templates` - Email templates
- `platform.email_logs` - Email delivery logs

#### 8. Infrastructure (from 26-settings-infrastructure.md)
- `platform.infrastructure_settings` - Infrastructure config
- `platform.feature_flags` - Feature toggles
- `platform.background_job_runs` - Job execution logs

#### 9. Notifications (from 27-settings-notifications.md)
- `platform.notification_channels` - Notification channels
- `platform.notification_routing` - Routing rules
- `platform.notification_settings` - Settings
- `platform.alert_types` - Alert type definitions
- `platform.notification_log` - Notification history

### Lower Priority Tables

#### 10. Trading Alerts (from 05-alerts.md)
- `trading.alerts` - Trading alerts and monitoring

#### 11. Bot Detail (from 07-bot-detail.md)
- `trading.bot_equity_snapshots` - Bot equity tracking

#### 12. User Management (from 08-users-list.md, 09-user-detail.md)
- `auth.user_follows` - User following system
- `auth.user_suspensions` - User suspension history
- `auth.activity_logs` - User activity audit trail

#### 13. Finance Analytics (from 14-finance-strategies.md, 15-finance-risk.md)
- `finance.strategy_stats` - Strategy performance metrics
- `finance.risk_metrics` - Platform risk metrics

## Extraction Process

For each file:

1. **Read the file** - Locate "Database Schema Requirements" section
2. **Extract CREATE TABLE statements** - Copy complete SQL with all columns
3. **Extract ALTER TABLE statements** - Any modifications to existing tables
4. **Extract CREATE INDEX statements** - All indexes
5. **Extract seed data** - Any INSERT statements
6. **Add to /tmp/schema_extraction.sql** - Append with file header comment
7. **Test syntax** - Ensure SQL is valid PostgreSQL

## Generation Command

Once extraction is complete:

```bash
# Combine all extractions into migration 002
cat /tmp/schema_extraction_part2.sql > /Users/16-inchmacbook/development/crypto-stella/docs/migrations/002_remaining_schema_additions.sql
```

## Validation Steps

Before applying migrations:

1. **Check for conflicts** - Ensure tables don't already exist in `stella-database.sql`
2. **Verify foreign keys** - All referenced tables must exist
3. **Test on dev database** - Apply to development environment first
4. **Review indexes** - Ensure proper indexing strategy
5. **Check constraints** - Validate all CHECK constraints
6. **Seed data review** - Verify all seed data is appropriate

## Status Tracking

- [x] Migration 001: Core tables (KYC, Operations, Security)
- [ ] Migration 002: Remaining tables (Finance, Compliance, Platform)
- [ ] Migration testing on dev database
- [ ] Migration review and approval
- [ ] Production migration plan

## Notes

- All extractions are in `/tmp/schema_extraction.sql` (366 lines so far)
- Use `IF NOT EXISTS` clauses to make migrations idempotent
- Include rollback instructions in migration comments
- Document any data migrations needed
