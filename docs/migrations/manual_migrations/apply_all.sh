#!/bin/bash

# Migration 002 - Apply All Script
# Apply all migration files in order with verification

set -e  # Exit on error

export PGPASSWORD="REDACTED"
export PGHOST="170.168.103.207"
export PGPORT="3212"
export PGUSER="postgres"
export PGDATABASE="stella_platform_new"

echo "=========================================="
echo "Migration 002 - Applying All Migrations"
echo "=========================================="
echo ""

# Function to apply migration and verify
apply_migration() {
    local file=$1
    local verify_cmd=$2
    
    echo "📋 Applying: $file"
    psql -f "$file"
    
    if [ $? -eq 0 ]; then
        echo "✅ Success: $file"
        if [ -n "$verify_cmd" ]; then
            echo "🔍 Verifying..."
            eval "$verify_cmd"
        fi
        echo ""
    else
        echo "❌ Error applying $file"
        exit 1
    fi
}

# Apply migrations in order
apply_migration "01_finance_schema.sql" "psql -c 'SELECT COUNT(*) as billing_config_count FROM platform.billing_config;'"

apply_migration "02_compliance_schema.sql" "psql -c 'SELECT COUNT(*) as blocked_countries FROM compliance.jurisdiction_restrictions;'"

apply_migration "03_exchange_schema.sql" "psql -c 'SELECT COUNT(*) as exchanges FROM exchange.platform_exchanges;'"

apply_migration "04_platform_schema_part1.sql" "psql -c 'SELECT COUNT(*) as risk_controls FROM platform.risk_controls;'"

apply_migration "05_platform_schema_part2.sql" "psql -c 'SELECT COUNT(*) as email_templates FROM platform.email_templates;'"

apply_migration "06_auth_trading_schemas.sql" "psql -c '\d trading.alerts' | grep deleted_at"

echo "=========================================="
echo "✅ ALL MIGRATIONS APPLIED SUCCESSFULLY"
echo "=========================================="
echo ""
echo "Final verification:"
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

echo ""
echo "Migration 002 complete! 🎉"
