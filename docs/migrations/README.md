# Stella Platform - Database Migrations

## Overview

This directory contains database migration scripts derived from the page-by-page analysis documents.

## Migration Files

### ✅ Migration 001: Core Schema Additions
**File:** `001_page_analysis_schema_additions.sql`
**Status:** Complete and ready to apply
**Created:** February 21, 2026

**What's Included:**
- **4 new schemas**: `kyc`, `operations`, `compliance`, `platform`
- **18 new tables**:
  - KYC Schema (9 tables): applicants, compliance_notes, verification_history, rejection_reasons, region_config, provider_config, health_checks, provider_workflows, webhook_logs
  - Operations Schema (3 tables): shifts, shift_activities, watch_list_items
  - Platform Schema (2 tables): security_config, ip_allowlist
  - Auth Schema (4 tables): admin_users, sessions, invite_tokens, login_attempts

- **ALTER TABLE modifications**:
  - `auth.users`: Added `account_tier`, `kyc_status` columns
  - `kyc.provider_config`: Added branding fields (via migration 001)
  - `kyc.region_config`: Added `provider_ids` array

- **Utility Functions**:
  - `cleanup_old_login_attempts()` - Auto-cleanup for login history
  - `cleanup_old_webhook_logs()` - Auto-cleanup for webhook logs

**Source Files Analyzed:**
- `19-kyc-applicants.md`
- `20-kyc-providers.md`
- `06-shift-handoff.md`
- `23-settings-security.md`

### ✅ Migration 002: Remaining Schema Additions
**File:** `002_remaining_schema_additions.sql`
**Status:** Complete and ready to apply
**Created:** February 21, 2026

**What's Included:**
- **2 new schemas**: `finance`, `exchange`
- **42 new tables**:
  - Finance Schema (5 tables): billing_config, fees_collected, subscriptions, strategy_stats, risk_metrics
  - Compliance Schema (4 tables): compliance_settings, jurisdiction_restrictions, aml_flags, sanctions_screening_log
  - Exchange Schema (3 tables): platform_exchanges, exchange_health_checks, exchange_trading_pairs
  - Platform Schema (22 tables): risk_controls, circuit_breaker_events, user_drawdown_tracking, integrations, outbound_webhooks, webhook_deliveries, webhook_signing_keys, bot_engine_defaults, email_settings, email_templates, email_logs, infrastructure_settings, feature_flags, background_job_runs, notification_channels, notification_routing, notification_settings, alert_types, notification_log
  - Trading Schema (1 table): bot_equity_snapshots
  - Auth Schema (4 tables): user_follows, user_suspensions, activity_logs

- **ALTER TABLE modifications**:
  - `trading.alerts`: Added `deleted_at` column and performance indexes
  - `trading.bots`: Custom override columns (commented out - apply if needed)

- **Seed Data**:
  - Compliance: jurisdiction_restrictions (blocked countries)
  - Exchange: platform_exchanges (5 exchanges)
  - Email: email_templates (8 templates)
  - Infrastructure: feature_flags (7 flags)
  - Notifications: channels, routing, alert_types

**Source Files Analyzed:**
- `22-settings-billing.md`
- `24-settings-compliance.md`
- `25-settings-exchanges.md`
- `20-settings-risk.md`
- `21-settings-integrations.md`
- `22-settings-bot-engine.md`
- `23-settings-communications.md`
- `26-settings-infrastructure.md`
- `27-settings-notifications.md`
- `05-alerts.md`
- `07-bot-detail.md`
- `08-users-list.md`
- `09-user-detail.md`
- `14-finance-strategies.md`
- `15-finance-risk.md`

## How to Apply Migrations

### Prerequisites
```bash
# Ensure you have PostgreSQL client installed
psql --version

# Ensure database exists
psql -U postgres -d stella_platform -c "\dt"
```

### Apply Migration 001 (if not already applied)

```bash
# Connect to your database
psql -U postgres -d stella_platform

# Apply the migration
\i /Users/16-inchmacbook/development/crypto-stella/docs/migrations/001_page_analysis_schema_additions.sql

# Verify schemas were created
\dn

# Verify tables were created
\dt kyc.*
\dt operations.*
\dt platform.*
\dt auth.*

# Check for errors
SELECT * FROM kyc.applicants LIMIT 1;
```

### Apply Migration 002

```bash
# Connect to your database
psql -U postgres -d stella_platform

# Apply the migration
\i /Users/16-inchmacbook/development/crypto-stella/docs/migrations/002_remaining_schema_additions.sql

# Verify schemas were created
\dn

# Verify tables were created
\dt finance.*
\dt exchange.*
\dt platform.*
\dt auth.*
\dt trading.*

# Check seed data was inserted
SELECT COUNT(*) FROM compliance.jurisdiction_restrictions;
SELECT COUNT(*) FROM exchange.platform_exchanges;
SELECT COUNT(*) FROM platform.email_templates;
SELECT COUNT(*) FROM platform.feature_flags;
SELECT COUNT(*) FROM platform.alert_types;
```

### Rollback Migration 002 (if needed)

See the rollback instructions at the end of `002_remaining_schema_additions.sql`

### Rollback Migration 001 (if needed)

```sql
-- WARNING: This will delete all data in these tables!

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS kyc.webhook_logs CASCADE;
DROP TABLE IF EXISTS kyc.provider_workflows CASCADE;
DROP TABLE IF EXISTS kyc.health_checks CASCADE;
DROP TABLE IF EXISTS kyc.rejection_reasons CASCADE;
DROP TABLE IF EXISTS kyc.verification_history CASCADE;
DROP TABLE IF EXISTS kyc.compliance_notes CASCADE;
DROP TABLE IF EXISTS kyc.applicants CASCADE;
DROP TABLE IF EXISTS kyc.region_config CASCADE;
DROP TABLE IF EXISTS kyc.provider_config CASCADE;

DROP TABLE IF EXISTS operations.watch_list_items CASCADE;
DROP TABLE IF EXISTS operations.shift_activities CASCADE;
DROP TABLE IF EXISTS operations.shifts CASCADE;

DROP TABLE IF EXISTS auth.login_attempts CASCADE;
DROP TABLE IF EXISTS auth.invite_tokens CASCADE;
DROP TABLE IF EXISTS auth.sessions CASCADE;
DROP TABLE IF EXISTS platform.ip_allowlist CASCADE;
DROP TABLE IF EXISTS platform.security_config CASCADE;
DROP TABLE IF EXISTS auth.admin_users CASCADE;

-- Drop sequences
DROP SEQUENCE IF EXISTS kyc.applicant_id_seq CASCADE;

-- Drop enums
DROP TYPE IF EXISTS operations.watch_item_status CASCADE;
DROP TYPE IF EXISTS operations.activity_priority CASCADE;
DROP TYPE IF EXISTS operations.shift_status CASCADE;

-- Drop schemas (only if empty)
DROP SCHEMA IF EXISTS kyc CASCADE;
DROP SCHEMA IF EXISTS operations CASCADE;
DROP SCHEMA IF EXISTS compliance CASCADE;
DROP SCHEMA IF EXISTS platform CASCADE;

-- Remove columns from auth.users
ALTER TABLE auth.users DROP COLUMN IF EXISTS account_tier;
ALTER TABLE auth.users DROP COLUMN IF EXISTS kyc_status;

-- Drop functions
DROP FUNCTION IF EXISTS cleanup_old_login_attempts();
DROP FUNCTION IF EXISTS cleanup_old_webhook_logs();
```

## Testing Migrations

### Unit Test Migration 001

```sql
-- Test 1: Schema existence
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('kyc', 'operations', 'compliance', 'platform');
-- Expected: 4 rows

-- Test 2: Table creation
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('kyc', 'operations', 'platform', 'auth')
  AND table_name IN ('applicants', 'shifts', 'security_config', 'admin_users')
ORDER BY table_schema, table_name;
-- Expected: 4 rows

-- Test 3: Foreign key constraints
SELECT COUNT(*)
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY'
  AND table_schema IN ('kyc', 'operations', 'platform', 'auth');
-- Expected: > 10 constraints

-- Test 4: Indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname IN ('kyc', 'operations', 'platform', 'auth')
ORDER BY schemaname, tablename;
-- Expected: Multiple indexes per table

-- Test 5: Insert test data
INSERT INTO kyc.region_config (name, countries)
VALUES ('Test Region', ARRAY['US', 'CA'])
RETURNING id;
-- Expected: Success with UUID

-- Clean up test data
DELETE FROM kyc.region_config WHERE name = 'Test Region';
```

## Migration Dependencies

### Migration 001 Dependencies
```
auth.users (existing)
  ↓
auth.admin_users (migration 001)
  ↓
platform.security_config (migration 001)
  ↓
auth.sessions (migration 001)
  ↓
auth.invite_tokens (migration 001)

kyc.provider_config (migration 001)
  ↓
kyc.health_checks (migration 001)
kyc.provider_workflows (migration 001)
kyc.webhook_logs (migration 001)

kyc.applicants (migration 001)
  ↓
kyc.compliance_notes (migration 001)
kyc.verification_history (migration 001)
kyc.rejection_reasons (migration 001)

operations.shifts (migration 001)
  ↓
operations.shift_activities (migration 001)
operations.watch_list_items (migration 001)
```

### Migration 002 Dependencies
```
auth.users (existing)
  ↓
auth.user_follows (migration 002)
auth.user_suspensions (migration 002)
auth.activity_logs (migration 002)

platform.notification_channels (migration 002)
  ↓
platform.notification_routing (migration 002)
platform.notification_log (migration 002)

platform.email_templates (migration 002)
  ↓
platform.email_logs (migration 002)

platform.outbound_webhooks (migration 002)
  ↓
platform.webhook_deliveries (migration 002)

exchange.platform_exchanges (migration 002)
  ↓
exchange.exchange_health_checks (migration 002)
exchange.exchange_trading_pairs (migration 002)

trading.bots (existing)
  ↓
trading.bot_equity_snapshots (migration 002)

trading.alerts (existing - enhanced in migration 002)
```

## Best Practices

1. **Always backup before migrations**
   ```bash
   pg_dump -U postgres stella_platform > backup_before_migration_001.sql
   ```

2. **Test in development first**
   - Apply to dev database
   - Run integration tests
   - Verify application functionality

3. **Use transactions for safety**
   ```sql
   BEGIN;
   \i 002_remaining_schema_additions.sql
   -- Test queries here
   COMMIT;  -- or ROLLBACK if issues found
   ```

   Note: Migration 002 already wraps everything in BEGIN/COMMIT

4. **Monitor performance after migration**
   - Check query execution plans
   - Monitor index usage
   - Verify foreign key performance

5. **Document any manual steps**
   - Data migrations
   - Application configuration changes
   - Required restarts

## Migration History

| Migration | Date | Status | Tables Added | Notes |
|-----------|------|--------|--------------|-------|
| 001 | 2026-02-21 | ✅ Complete | 18 | Core KYC, Operations, Security tables |
| 002 | 2026-02-21 | ✅ Complete | 42 | Finance, Compliance, Exchange, Platform, Auth, Trading enhancements |

## Support

If you encounter issues:
1. Check PostgreSQL logs: `tail -f /var/log/postgresql/postgresql.log`
2. Verify schema version: `SELECT * FROM system_ops.schema_migrations;`
3. Review constraint violations
4. Contact: DevOps team

## References

- Source analysis documents: `/docs/trading engine analysis/page-by-page-analysis/`
- Database schema: `/docs/files (1)/stella-database.sql`
- Migration planning: `/docs/migrations/REMAINING_TABLES_TODO.md`
