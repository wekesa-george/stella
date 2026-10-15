# Manual Migration Files - Schema by Schema

These migration files allow you to review and apply database changes one schema at a time.

## Database Connection

```bash
export PGPASSWORD="REDACTED"
export PGHOST="170.168.103.207"
export PGPORT="3212"
export PGUSER="postgres"
export PGDATABASE="stella_platform_new"
```

## Migration Files

### ✅ Migration 001 - Already Applied
- kyc schema: 9 tables
- operations schema: 3 tables  
- platform schema: 2 tables (security_config, ip_allowlist)
- auth schema: 4 tables (admin_users, sessions, invite_tokens, login_attempts)

### 📋 Migration 002 - Apply in Order

#### 1. Finance Schema (5 tables)
**File:** `01_finance_schema.sql`
**Tables:**
- platform.billing_config
- finance.fees_collected
- finance.subscriptions
- finance.strategy_stats
- finance.risk_metrics

**Apply:**
```bash
psql -f manual_migrations/01_finance_schema.sql
```

**Verify:**
```bash
psql -c "\dt finance.*"
psql -c "SELECT COUNT(*) FROM platform.billing_config;"
```

---

#### 2. Compliance Schema (4 tables + seed data)
**File:** `02_compliance_schema.sql`
**Tables:**
- compliance.compliance_settings
- compliance.jurisdiction_restrictions (12 blocked countries)
- compliance.aml_flags
- compliance.sanctions_screening_log

**Apply:**
```bash
psql -f manual_migrations/02_compliance_schema.sql
```

**Verify:**
```bash
psql -c "\dt compliance.*"
psql -c "SELECT COUNT(*) FROM compliance.jurisdiction_restrictions;" # Should be 12
```

---

#### 3. Exchange Schema (3 tables + seed data)
**File:** `03_exchange_schema.sql`
**Tables:**
- exchange.platform_exchanges (5 exchanges)
- exchange.exchange_health_checks
- exchange.exchange_trading_pairs

**Apply:**
```bash
psql -f manual_migrations/03_exchange_schema.sql
```

**Verify:**
```bash
psql -c "\dt exchange.*"
psql -c "SELECT COUNT(*) FROM exchange.platform_exchanges;" # Should be 5
```

---

#### 4. Platform Schema Part 1 (8 tables)
**File:** `04_platform_schema_part1.sql`
**Tables:**
- platform.risk_controls
- platform.circuit_breaker_events
- platform.user_drawdown_tracking
- platform.integrations
- platform.outbound_webhooks
- platform.webhook_deliveries
- platform.webhook_signing_keys
- platform.bot_engine_defaults

**Apply:**
```bash
psql -f manual_migrations/04_platform_schema_part1.sql
```

**Verify:**
```bash
psql -c "SELECT COUNT(*) FROM platform.risk_controls;" # Should be 1
psql -c "SELECT COUNT(*) FROM platform.bot_engine_defaults;" # Should be 1
```

---

#### 5. Platform Schema Part 2 (14 tables)
**File:** `05_platform_schema_part2.sql`
**Tables:**
- platform.email_settings (+ 8 email templates)
- platform.email_templates
- platform.email_logs
- platform.infrastructure_settings
- platform.feature_flags (+ 7 flags)
- platform.background_job_runs
- platform.notification_channels (+ 4 channels)
- platform.notification_routing
- platform.notification_settings
- platform.alert_types (+ 8 types)
- platform.notification_log

**Apply:**
```bash
psql -f manual_migrations/05_platform_schema_part2.sql
```

**Verify:**
```bash
psql -c "SELECT COUNT(*) FROM platform.email_templates;" # Should be 8
psql -c "SELECT COUNT(*) FROM platform.feature_flags;" # Should be 7
psql -c "SELECT COUNT(*) FROM platform.notification_channels;" # Should be 4
psql -c "SELECT COUNT(*) FROM platform.alert_types;" # Should be 8
```

---

#### 6. Auth & Trading Schemas (5 tables)
**File:** `06_auth_trading_schemas.sql`
**Tables:**
- auth.user_follows
- auth.user_suspensions
- auth.activity_logs (+ ENUM)
- trading.bot_equity_snapshots
- trading.alerts (ALTER TABLE + indexes)

**Apply:**
```bash
psql -f manual_migrations/06_auth_trading_schemas.sql
```

**Verify:**
```bash
psql -c "\dt auth.*"
psql -c "\dt trading.*"
psql -c "\d trading.alerts" # Should show deleted_at column
```

---

## Complete Verification

After applying all migrations:

```bash
# Count all tables by schema
psql -c "
SELECT 
    table_schema,
    COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema IN ('kyc', 'operations', 'compliance', 'platform', 'finance', 'exchange', 'auth', 'trading')
  AND table_type = 'BASE TABLE'
GROUP BY table_schema
ORDER BY table_schema;
"

# Expected results:
# auth: 9 tables (5 existing + 4 new)
# compliance: 4 tables
# exchange: 7 tables (4 existing + 3 new)
# finance: 5 tables
# kyc: 9 tables
# operations: 3 tables
# platform: 24 tables (2 from migration 001 + 22 new)
# trading: 11 tables (10 existing + 1 new)
```

## Rollback Instructions

If you need to rollback any migration, drop the tables in reverse order:

```sql
-- Example: Rollback Finance schema
DROP TABLE IF EXISTS finance.risk_metrics CASCADE;
DROP TABLE IF EXISTS finance.strategy_stats CASCADE;
DROP TABLE IF EXISTS finance.subscriptions CASCADE;
DROP TABLE IF EXISTS finance.fees_collected CASCADE;
DROP TABLE IF NOT EXISTS platform.billing_config CASCADE;
DROP SCHEMA IF EXISTS finance CASCADE;
```

## Notes

- All foreign keys use `auth.users(id)` and `trading.bots(id)` (not user_id/bot_id)
- All migrations use `IF NOT EXISTS` for idempotency
- Seed data uses `ON CONFLICT DO NOTHING`
- All singleton tables use CHECK constraint `CHECK (id = id)`
