# Trading Accounts Analysis

## Where `trading_accounts` Records Come From

### Schema Definition
**Location:** `apps/trade_engine/lib/accounts/trading_account.ex`

**Fields:**
- `account_balance` - Total account balance
- `available_balance` - Available for trading
- `locked_balance` - Locked in open positions
- `total_deposit` - Cumulative deposits
- `total_withdrawal` - Cumulative withdrawals
- `leverage_ratio` - Trading leverage (default: 1)
- `margin_used` - Used margin
- `margin_available` - Available margin
- `account_status` - active/suspended/closed
- `risk_level` - low/medium/high
- `user_id` - Foreign key to users table

### Creation Logic

**Primary Creation Functions:**

1. **`SysAdmin.Trading.create_trading_account/1`**
   - Location: `apps/sys_admin/lib/trading/trading.ex:58`
   - Creates a new trading account for a user
   - Called when a new user registers or needs a trading account

2. **Manual Admin Creation**
   - Through sys_admin web interface
   - Admins can create accounts for users

### Current Data Pattern

**From database sample:**
```sql
-- All 1,000 accounts follow same pattern:
- account_balance = available_balance (no locked funds)
- locked_balance = 0 (no open positions holding funds)
- total_deposit = account_balance (no withdrawals made)
- account_status = 'active'
- Balances range: ~4,500 to ~9,100 USDT
```

**Key Insight:** These appear to be **seeded/test accounts** with initial deposits but no actual trading activity (no locked balance, no withdrawals).

### Relationship to Other Tables

**Referenced by:**
- `trading_transactions.trading_account_id` - All deposits/withdrawals/trades
- `withdrawal_requests.trading_account_id` - Withdrawal requests
- **Linked via user_id:**
  - `trading_positions` (through user_id)
  - `trading_orders` (through user_id)

### Business Logic Dependencies

**Critical Operations:**
1. **Deposit Processing** (`process_deposit/2`)
   - Updates `account_balance`, `available_balance`, `total_deposit`
   - Creates transaction record

2. **Withdrawal Processing** (`process_withdrawal/2`)
   - Updates balances
   - Creates withdrawal request
   - Creates transaction record

3. **Position Opening**
   - Locks balance (moves from available → locked)
   - Updates `margin_used`

4. **Position Closing**
   - Unlocks balance
   - Updates profit/loss
   - Adjusts `account_balance`

---

## Impact on New Schema

### Problem: `trading_accounts` Missing in New Schema

The new schema has:
- ❌ NO `trading.accounts` table
- ❌ NO equivalent wallet/balance tracking
- ✅ `pool.pool_wallets` - But this is for POOL trading, not individual users
- ✅ `pool.allocations` - Pool capital allocation, not user accounts

### What This Breaks:

1. **User Balance Tracking**
   - No place to store individual user balances
   - No deposit/withdrawal tracking per user

2. **Margin Management**
   - Can't track leverage, margin used/available
   - Risk management breaks

3. **Account Status**
   - Can't suspend/close user accounts at trading level

4. **Transaction History**
   - `pool.transactions` is for POOL, not individual users
   - Need user-level transaction tracking

---

## Solution Options

### Option 1: Add `trading.user_accounts` Table to New Schema ⭐

```sql
CREATE TABLE trading.user_accounts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    -- Balances
    account_balance     DECIMAL(18,8) DEFAULT 0.0 NOT NULL,
    available_balance   DECIMAL(18,8) DEFAULT 0.0 NOT NULL,
    locked_balance      DECIMAL(18,8) DEFAULT 0.0 NOT NULL,
    -- Deposits/Withdrawals
    total_deposit       DECIMAL(18,8) DEFAULT 0.0 NOT NULL,
    total_withdrawal    DECIMAL(18,8) DEFAULT 0.0 NOT NULL,
    -- Margin
    leverage_ratio      DECIMAL(5,2) DEFAULT 1.0 NOT NULL,
    margin_used         DECIMAL(18,8) DEFAULT 0.0 NOT NULL,
    margin_available    DECIMAL(18,8) DEFAULT 0.0 NOT NULL,
    -- Status
    account_status      VARCHAR(50) DEFAULT 'active' NOT NULL,
    risk_level          VARCHAR(50) DEFAULT 'medium' NOT NULL,
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Also add user transaction table
CREATE TABLE trading.user_transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_account_id     UUID NOT NULL REFERENCES trading.user_accounts(id),
    transaction_type    VARCHAR(50) NOT NULL, -- deposit, withdrawal, trade, fee, pnl
    amount              DECIMAL(18,8) NOT NULL,
    balance_before      DECIMAL(18,8),
    balance_after       DECIMAL(18,8),
    related_order_id    UUID REFERENCES trading.orders(id),
    related_position_id UUID REFERENCES trading.positions(id),
    status              VARCHAR(50) NOT NULL,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Option 2: Keep Both Schemas (Hybrid) ⭐⭐⭐

**Keep existing `public.trading_accounts` and add new schema for pool trading:**
- Individual user trading → `public.trading_accounts` (existing)
- Pool-based bot trading → `trading.positions` + `pool.*` (new)

**This is cleanest because:**
- The new schema is designed for POOL trading (bots managing shared capital)
- The old schema is for INDIVIDUAL user trading (each user has own account)
- They serve different purposes!

### Option 3: Merge Concepts

Treat `pool.pool_wallets` as master wallets and add user sub-accounts:
```sql
CREATE TABLE pool.user_sub_accounts (
    user_id UUID REFERENCES auth.users(id),
    pool_wallet_id UUID REFERENCES pool.pool_wallets(id),
    allocated_balance DECIMAL(18,8),
    -- track user's slice of pool
);
```

---

## RECOMMENDATION

### ✅ **Use HYBRID APPROACH (Option 2)**

**Reasoning:**
1. **Different Trading Models:**
   - OLD: Individual users trade with own capital
   - NEW: Bot pool trading with shared capital

2. **Minimal Code Changes:**
   - Keep `public.trading_accounts` as-is
   - Trade engine continues working
   - New pool features use new schema

3. **Clear Separation:**
   - Individual trading: `public.*` schema
   - Pool/bot trading: `trading.*` + `pool.*` schemas

**Implementation:**
```sql
-- In new database, apply BOTH:
1. Old schema (for individual user trading)
2. New schema (for pool/bot trading)

-- Bridge views for compatibility
CREATE VIEW public.all_positions AS
  SELECT * FROM public.trading_positions  -- individual
  UNION ALL
  SELECT * FROM trading.positions;        -- pool bots
```

This way:
- ✅ Existing trade_engine keeps working
- ✅ New pool features have clean architecture
- ✅ Can migrate individual → pool gradually
- ✅ Both systems can coexist
