# Database Migration Strategy Analysis

## Current Situation

**Old Schema:** `public.*` (flat structure, 23 tables, 42,570 rows of live trading data)
**New Schema:** Multi-schema design (`auth.*`, `trading.*`, `risk.*`, etc.)

## Key Differences

### 1. Schema Organization
- **Old:** Everything in `public` schema
- **New:** Organized by domain (auth, trading, risk, pool, admin, etc.)

### 2. Table Name Changes
| Old | New | Breaking Change? |
|-----|-----|------------------|
| `public.trading_positions` | `trading.positions` | YES - schema + name |
| `public.trading_transactions` | `trading.fills` + `pool.transactions` | YES - split into 2 tables |
| `public.predictions` | `trading.predictions` | YES - schema change |
| `public.users` | `auth.users` | YES - schema change |
| `public.kyc_records` | `auth.kyc_records` | YES - schema change |
| `public.trading_accounts` | Missing? | CRITICAL - no equivalent |
| `public.risk_limits` | `risk.limit_configs` | YES - schema + name |

### 3. Column Changes in `positions` Table

**Old Schema:**
- `symbol` (VARCHAR 255)
- `position_type` (text)
- `user_strategy_id` (uuid)
- `exchange_config_id` (uuid)
- `profit_loss` (numeric)

**New Schema:**
- `trading_pair` (VARCHAR 30) - renamed from symbol
- `side` (enum) - renamed from position_type
- `bot_id` (uuid) - replaces user_strategy_id?
- `credential_id` (uuid) - replaces exchange_config_id
- `realized_pnl_usd` (decimal) - renamed from profit_loss
- **ADDED:** base_asset, quote_asset, leverage, stop_loss_price, etc.
- **ADDED:** Rich physics model fields preserved

### 4. Missing Critical Table
**`trading_accounts`** has NO equivalent in new schema - this is a CRITICAL gap!

## Risk Assessment

### HIGH RISK Issues ⚠️
1. **`trading_accounts` table missing** - 1,000 rows of account balance data will be lost
2. **`trading_transactions` split** - Need to map to both `fills` and `pool.transactions`
3. **Foreign key changes** - `user_strategy_id` → `bot_id`, `exchange_config_id` → `credential_id`
4. **Schema prefixes everywhere** - All queries need updating

### MEDIUM RISK Issues ⚙️
1. Column renames (`symbol` → `trading_pair`, `position_type` → `side`)
2. Data type changes (text → enums)
3. Multi-schema navigation complexity

### LOW RISK Issues ✓
1. Physics model fields preserved (momentum, gravity, peak_price, etc.)
2. Core trading logic columns exist

---

## Recommended Strategy: **HYBRID APPROACH**

### Option 1: Maintain Old Schema + Add New (RECOMMENDED) ⭐

**Keep the current working system while gradually migrating:**

```sql
-- In new database, keep BOTH schemas:

-- 1. Existing data (working system)
public.trading_positions (31,468 rows)
public.trading_transactions (2,197 rows)
public.trading_accounts (1,000 rows)
public.predictions (6,903 rows)
-- ... all existing tables

-- 2. New schema (for future features)
trading.positions (empty, for new bots)
trading.fills (empty)
auth.users (empty, for new auth system)
-- ... new tables
```

**Create database views to bridge old → new:**

```sql
-- View: trading.positions_v (combines old + new)
CREATE VIEW trading.positions_v AS
SELECT
    id, user_id,
    symbol as trading_pair,
    position_type as side,
    -- map all fields
FROM public.trading_positions
UNION ALL
SELECT * FROM trading.positions;
```

**Benefits:**
- ✅ Zero downtime - trade_engine keeps working
- ✅ Gradual migration - migrate feature by feature
- ✅ Easy rollback - keep old data intact
- ✅ Test new schema without breaking production

**Implementation Steps:**
1. Deploy new schema alongside old (parallel)
2. Create compatibility views/functions
3. Update trade_engine config to use views
4. Gradually migrate features to new schema
5. Once stable, deprecate old schema

---

### Option 2: Full Migration (HIGH RISK) ⚠️

**Rewrite trade_engine to use new schema:**

**Benefits:**
- ✅ Clean architecture
- ✅ Better organization

**Drawbacks:**
- ❌ Requires rewriting ~50+ Elixir modules
- ❌ High risk of bugs
- ❌ Weeks of development time
- ❌ Data migration complexity (especially trading_transactions split)
- ❌ Missing trading_accounts table needs to be added

---

### Option 3: Compatibility Layer (MEDIUM COMPLEXITY)

**Add SQL compatibility layer in new database:**

```sql
-- Create aliases in public schema pointing to new schema
CREATE VIEW public.trading_positions AS
SELECT
    id, user_id,
    trading_pair as symbol,
    side::text as position_type,
    bot_id as user_strategy_id,
    credential_id as exchange_config_id,
    -- map all columns back to old names
FROM trading.positions;

-- Same for all other tables
CREATE VIEW public.users AS SELECT * FROM auth.users;
CREATE VIEW public.predictions AS SELECT * FROM trading.predictions;
-- etc.
```

**Benefits:**
- ✅ Trade engine works without code changes
- ✅ Clean new schema for future development
- ✅ Medium implementation time

**Drawbacks:**
- ❌ View complexity (especially INSERTS/UPDATES)
- ❌ Performance overhead
- ❌ Still need to solve trading_accounts issue

---

## FINAL RECOMMENDATION

### ✅ **Go with OPTION 1: HYBRID APPROACH**

**Immediate Actions:**

1. **Deploy new database with BOTH schemas:**
   ```bash
   # Apply old schema (existing data)
   psql -d new_db -f schema_only.sql

   # Apply new schema (parallel structure)
   psql -d new_db -f stella-database.sql
   ```

2. **Add missing `trading.accounts` table to new schema** (critical!)

3. **Create bridge views:**
   ```sql
   -- Make new tables accessible from public schema too
   CREATE VIEW public.trading_positions_new AS SELECT * FROM trading.positions;
   ```

4. **No code changes needed immediately** - trade_engine continues using `public.*` tables

5. **Gradual migration path:**
   - Phase 1: New bots use new schema
   - Phase 2: Migrate admin features
   - Phase 3: Migrate reporting
   - Phase 4: Deprecate old schema (6-12 months)

**This gives you:**
- ✅ Continuity (no breaking changes)
- ✅ Evolution (new architecture available)
- ✅ Safety (rollback possible)
- ✅ Time (migrate at your pace)
