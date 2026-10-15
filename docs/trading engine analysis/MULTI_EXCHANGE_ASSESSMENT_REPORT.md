# Multi-Exchange Support Assessment Report

**Date:** February 21, 2026
**Scope:** Review all page-by-page analysis documents for multi-exchange architecture compliance
**Focus:** Trading pairs must be exchange-scoped, credentials required for exchange connections

---

## Executive Summary

✅ **GOOD NEWS:** The database schema and most of the page analyses already correctly implement multi-exchange support through the `exchange.user_credentials` and `exchange.adapters` architecture.

⚠️ **GAPS IDENTIFIED:** Some analyses need minor updates to explicitly reference credential-based exchange scoping and authentication flows.

---

## Database Schema Review

### ✅ Multi-Exchange Architecture is CORRECT

The existing database schema (`stella-database.sql`) has **proper multi-exchange support**:

#### **1. Exchange Adapters Table**
```sql
CREATE TABLE exchange.adapters (
    id                  UUID PRIMARY KEY,
    code                VARCHAR(50) UNIQUE NOT NULL,  -- 'binance', 'bybit', 'okx', etc.
    name                VARCHAR(100) NOT NULL,
    status              exchange.adapter_status NOT NULL,
    auth_model          exchange.auth_model NOT NULL,
    -- Supports: api_key_secret, oauth2, wallet_connect, hybrid
    ...
);
```

#### **2. User Credentials Table (Per-Exchange)**
```sql
CREATE TABLE exchange.user_credentials (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    adapter_id          UUID NOT NULL REFERENCES exchange.adapters(id),
    label               VARCHAR(100),  -- e.g., "My Binance Account"
    status              exchange.credential_status NOT NULL,
    auth_model          exchange.auth_model NOT NULL,

    -- Encrypted credentials
    api_key_encrypted   BYTEA,
    api_secret_encrypted BYTEA,
    passphrase_encrypted BYTEA,
    oauth_token_encrypted BYTEA,

    -- Permissions
    is_trading_enabled  BOOLEAN DEFAULT FALSE,
    is_readonly         BOOLEAN DEFAULT FALSE,

    -- Validation
    last_validated_at   TIMESTAMPTZ,
    validation_error    TEXT,

    CONSTRAINT uq_user_adapter_label UNIQUE (user_id, adapter_id, label)
);
```

**Key Features:**
- ✅ Users can have **multiple credentials per exchange** (e.g., 2 Binance accounts)
- ✅ Encrypted credential storage using `pgcrypto`
- ✅ Per-credential permissions (trading enabled/readonly)
- ✅ Validation tracking (last validated, error messages)

#### **3. Enabled Trading Pairs (Per-Credential)**
```sql
CREATE TABLE exchange.enabled_asset_pairs (
    id                  UUID PRIMARY KEY,
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id),
    adapter_id          UUID NOT NULL REFERENCES exchange.adapters(id),
    symbol              VARCHAR(30) NOT NULL,  -- 'BTC/USDT'
    base_asset          VARCHAR(20) NOT NULL,
    quote_asset         VARCHAR(20) NOT NULL,
    is_trading_enabled  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Exchange-specific constraints
    min_order_size      DECIMAL(20,8),
    max_order_size      DECIMAL(20,8),
    price_precision     INTEGER,
    quantity_precision  INTEGER,

    CONSTRAINT uq_credential_symbol UNIQUE (credential_id, symbol)
);
```

**Key Features:**
- ✅ Trading pairs are **scoped to credentials** (not global)
- ✅ Exchange-specific trading constraints per pair
- ✅ Precision rules per pair (different across exchanges)

#### **4. Trading Bots Reference Credentials**
```sql
CREATE TABLE trading.bots (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    strategy_id         UUID REFERENCES strategy.strategies(id),
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id),  -- ✅ CORRECT
    trading_pairs       TEXT[] NOT NULL,  -- ['BTC/USDT', 'ETH/USDT']
    ...
);
```

**Key Features:**
- ✅ Bots are **tied to a specific credential** (which implies a specific exchange)
- ✅ Trading pairs array is validated against `exchange.enabled_asset_pairs` for that credential
- ✅ Exchange is derived via `credential_id → user_credentials → adapter_id → adapters.code`

#### **5. Orders and Positions Reference Credentials**
```sql
CREATE TABLE trading.orders (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL,
    bot_id              UUID REFERENCES trading.bots(id),
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id),  -- ✅ CORRECT
    exchange_code       VARCHAR(50) NOT NULL,  -- Denormalized for performance
    trading_pair        VARCHAR(30) NOT NULL,
    ...
);

CREATE TABLE trading.positions (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL,
    bot_id              UUID REFERENCES trading.bots(id),
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id),  -- ✅ CORRECT
    exchange_code       VARCHAR(50) NOT NULL,  -- Denormalized for performance
    trading_pair        VARCHAR(30) NOT NULL,
    ...
);
```

**Key Features:**
- ✅ Orders and positions are **scoped to credentials**
- ✅ Exchange code is denormalized for query performance
- ✅ Each order/position knows which exchange account it belongs to

---

## Page Analysis Review

### Page 1: Bot Fleet (`01-bot-fleet.md`)

#### ✅ **CORRECT Multi-Exchange Handling**

**Exchange Derivation:**
```sql
-- Correctly derives exchange from credential
SELECT
  b.id,
  uc.exchange_name,  -- From exchange.user_credentials
  b.trading_pairs[1] as primary_pair
FROM trading.bots b
JOIN exchange.user_credentials uc ON b.credential_id = uc.id
```

**Data Mapping:**
| Field | Source | Status |
|-------|--------|--------|
| `exchange` | `trading.bots.credential_id → exchange.user_credentials.exchange_name` | ✅ CORRECT |
| `pair` | `trading.bots.trading_pairs[0]` (first pair) | ✅ CORRECT |

**WebSocket Event Schema:**
```typescript
interface BotHeartbeatPayload {
  bot_id: string;
  exchange: string;  // ✅ Included
  pair: string;
  // ...
}
```

#### ⚠️ **MINOR GAPS:**

1. **Missing Credential Validation Check**
   - Page should mention that bot creation requires `credential_id` with `status = 'active'`
   - Should validate that trading pairs are enabled for that credential

2. **No Mention of Multi-Account Scenario**
   - User can have multiple Binance credentials
   - UI should show credential label (e.g., "Binance - Main Account", "Binance - Backup")

**Recommended Addition:**
```typescript
interface Bot {
  // ... existing fields
  credential_label: string;  // "Main Binance Account"
  credential_status: "active" | "expired" | "invalid";
}
```

---

### Page 2: Trading/Positions (`02-trading-positions.md`)

#### ✅ **EXCELLENT Multi-Exchange Handling**

This page has the **BEST multi-exchange support** of all analyzed pages!

**Highlights:**
- ✅ Explicitly includes `exchange` parameter in all API calls
- ✅ Uses composite ETS cache key: `{exchange, pair}` instead of just `pair`
- ✅ Market data channel scoped to exchange: `market_data:{exchange}:{pair}`
- ✅ TimescaleDB hypertables per exchange: `market_data.ohlcv_{exchange}_{pair}`

**API Endpoint (CORRECT):**
```
GET /api/market-data/candles?exchange=binance&pair=BTC/USDT&timeframe=1h
```

**WebSocket Channel (CORRECT):**
```typescript
const marketChannel = socket.channel(`market_data:${exchange}:${pair}`, {});
```

**ETS Price Cache (CORRECT):**
```elixir
def put_price(exchange, pair, price) do
  :ets.insert(:price_cache, {{exchange, pair}, price, System.system_time(:second)})
end

def get_price({exchange, pair}) do
  case :ets.lookup(:price_cache, {exchange, pair}) do
    [{{^exchange, ^pair}, price, _timestamp}] -> price
    [] -> nil
  end
end
```

**Position Query (CORRECT):**
```sql
SELECT
  p.*,
  a.code as exchange_code,
  a.name as exchange_name
FROM trading.positions p
LEFT JOIN exchange.user_credentials uc ON p.credential_id = uc.id
LEFT JOIN exchange.adapters a ON uc.adapter_id = a.id
WHERE p.status = 'open'
  AND ($1::text IS NULL OR a.code = $1)  -- Filter by exchange
```

#### ⚠️ **MINOR GAPS:**

1. **Credential Selection UI Not Mentioned**
   - When closing a position, which credential is used?
   - Should specify that position close uses the same credential as position open

2. **Multi-Credential Price Feeds**
   - If user has 2 Binance accounts, do they get 1 or 2 price feeds?
   - Recommendation: 1 shared price feed per exchange+pair (not per credential)

---

### Page 7: Bot Detail (`07-bot-detail.md`)

#### ⚠️ **NEEDS UPDATES - Missing Credential Context**

**Current Issues:**

1. **Exchange Shown But Not Credential**
   - Bot header shows: "Exchange: Binance"
   - Should also show: "Account: Main Binance Account" (credential label)

2. **Manual Order Panel Missing Credential Validation**
   - Manual order submission should validate:
     - Trading pair is enabled for this bot's credential
     - Order size within credential's allowed limits
     - Credential status is 'active'

3. **No Credential Status Indicator**
   - Bot could be in error state because credential expired/invalid
   - Should show credential status in bot header

**Recommended Updates:**

**Bot Header Should Include:**
```typescript
interface BotDetailHeader {
  id: string;
  name: string;
  status: "running" | "paused" | "error";
  exchange: string;  // "Binance"
  credential_label: string;  // ✅ ADD THIS
  credential_status: "active" | "expired" | "invalid";  // ✅ ADD THIS
  pair: string;
  // ...
}
```

**API Response Should Include Credential:**
```json
{
  "bot": {
    "id": "BOT-0001",
    "name": "Momentum Grid-742",
    "exchange": "Binance",
    "credential": {  // ✅ ADD THIS
      "id": "cred_123",
      "label": "Main Binance Account",
      "status": "active",
      "last_validated_at": "2026-02-21T14:00:00Z"
    },
    "pair": "BTC/USDT"
  }
}
```

**Manual Order Validation:**
```elixir
def submit_manual_order(bot_id, order_params) do
  bot = Repo.get!(Bot, bot_id) |> Repo.preload([:credential])

  # ✅ Validate credential is active
  unless bot.credential.status == :active do
    {:error, "Credential is not active. Current status: #{bot.credential.status}"}
  end

  # ✅ Validate pair is enabled for credential
  unless pair_enabled_for_credential?(bot.credential_id, order_params.pair) do
    {:error, "Trading pair #{order_params.pair} is not enabled for this credential"}
  end

  # ✅ Validate order size within credential limits
  # ... (check exchange.enabled_asset_pairs for min/max)

  # Submit order
  TradingAdapter.submit_order(bot.credential, order_params)
end
```

---

### Pages 3-6: Mission Control, Infrastructure, Alerts, Shift Handoff

#### ✅ **CORRECT - No Exchange-Specific Logic Needed**

These pages are **platform-wide dashboards** that aggregate data across all exchanges. They correctly:
- Show counts aggregated across all exchanges
- Don't need exchange filtering
- Display exchange name when showing bot/position details

**No changes needed.**

---

### Pages 8-11: Users & Admin Users

#### ✅ **CORRECT - User Management is Exchange-Agnostic**

These pages manage user accounts and admin access, which is **separate from exchange credentials**. Correctly structured.

**No changes needed.**

---

## Critical Multi-Exchange Flows

### 1. Bot Creation Flow

**UI Flow:**
```
1. User clicks "Create Bot"
2. Select Exchange → Shows dropdown of user's credentials
   - Option: "Binance - Main Account" (credential_id: abc)
   - Option: "Binance - Backup Account" (credential_id: def)
   - Option: "Bybit - Trading Account" (credential_id: ghi)
3. Select Trading Pair → Shows only pairs enabled for selected credential
   - Fetches: GET /api/exchange/credentials/{credential_id}/enabled-pairs
4. Configure Strategy Parameters
5. Submit → Creates bot with credential_id
```

**Backend Validation:**
```elixir
def create_bot(user_id, params) do
  # ✅ Validate credential belongs to user and is active
  credential = Repo.get_by!(UserCredential, id: params.credential_id, user_id: user_id)

  unless credential.status == :active do
    {:error, "Credential is not active"}
  end

  # ✅ Validate trading pairs are enabled for credential
  enabled_pairs = get_enabled_pairs(credential.id)

  Enum.each(params.trading_pairs, fn pair ->
    unless pair in enabled_pairs do
      {:error, "Trading pair #{pair} not enabled for this credential"}
    end
  end)

  # ✅ Create bot
  %Bot{}
  |> Bot.changeset(%{
    user_id: user_id,
    credential_id: params.credential_id,
    trading_pairs: params.trading_pairs,
    # ...
  })
  |> Repo.insert()
end
```

### 2. Order Execution Flow

**Process:**
```
1. Bot wants to submit order
2. Bot GenServer has credential_id in state
3. Load credential from database (with decrypted API keys)
4. Pass credential to TradingAdapter
5. Adapter uses credential to authenticate with exchange
6. Exchange executes order
7. Order confirmation returned with exchange_order_id
8. Store order in database with credential_id
```

**Code Example:**
```elixir
defmodule TradeEngine.Bots.Worker do
  def submit_order(bot_id, order_params) do
    bot = Repo.get!(Bot, bot_id) |> Repo.preload(:credential)

    # ✅ Decrypt credentials for exchange connection
    decrypted_creds = decrypt_credentials(bot.credential)

    # ✅ Submit to exchange using credential
    case TradeEngine.Adapters.submit_order(bot.credential.adapter_id, decrypted_creds, order_params) do
      {:ok, exchange_response} ->
        # Store order with credential reference
        insert_order(%{
          user_id: bot.user_id,
          bot_id: bot.id,
          credential_id: bot.credential_id,
          exchange_code: bot.credential.adapter.code,
          exchange_order_id: exchange_response.order_id,
          # ...
        })

      {:error, reason} ->
        # Handle exchange error (invalid API key, insufficient balance, etc.)
        {:error, reason}
    end
  end
end
```

### 3. Market Data Streaming Flow

**Architecture:**
```
1. User has active positions on Binance and Bybit
2. TradeEngine.MarketData.Supervisor starts 2 streams:
   - MarketData.BinanceStream (connects using ANY valid Binance credential for market data)
   - MarketData.BybitStream (connects using ANY valid Bybit credential)
3. Each stream subscribes to price feeds for active pairs
4. Price updates broadcast via PubSub with {exchange, pair} key
5. PositionPnLManager listens and updates P&L for positions on that exchange+pair
```

**Note:** Market data streams can use ANY credential for that exchange (doesn't need to be user-specific, since market data is public). However, private account data (balances, orders) requires user's specific credential.

---

## Required Schema Additions

Based on this assessment, **NO new tables are needed**. However, some **minor enhancements** would improve UX:

### 1. Add `display_name` to `exchange.user_credentials`

**Purpose:** User-friendly label for dropdown selection

```sql
ALTER TABLE exchange.user_credentials
ADD COLUMN display_name VARCHAR(100);

-- Default to label if not set
UPDATE exchange.user_credentials
SET display_name = COALESCE(label, 'Account ' || SUBSTRING(id::TEXT, 1, 8));
```

### 2. Add credential validation tracking

**Purpose:** Show users when credentials were last validated and if there are issues

```sql
-- Already exists! ✅
-- last_validated_at TIMESTAMPTZ
-- validation_error TEXT
```

### 3. Add credential usage stats

**Purpose:** Show users which credentials are actively used by bots

```sql
CREATE OR REPLACE VIEW exchange.credential_usage_stats AS
SELECT
  uc.id as credential_id,
  uc.user_id,
  uc.label,
  a.code as exchange_code,
  COUNT(DISTINCT b.id) as active_bots,
  COUNT(DISTINCT p.id) as open_positions,
  SUM(p.unrealized_pnl_usd) as total_unrealized_pnl
FROM exchange.user_credentials uc
LEFT JOIN exchange.adapters a ON uc.adapter_id = a.id
LEFT JOIN trading.bots b ON uc.id = b.credential_id AND b.status = 'running'
LEFT JOIN trading.positions p ON uc.id = p.credential_id AND p.status = 'open'
GROUP BY uc.id, uc.user_id, uc.label, a.code;
```

---

## Recommended API Endpoints for Credential Management

### 1. List User Credentials

**Endpoint:** `GET /api/exchange/credentials`

**Response:**
```json
{
  "credentials": [
    {
      "id": "cred_abc123",
      "exchange_code": "binance",
      "exchange_name": "Binance",
      "label": "Main Trading Account",
      "status": "active",
      "is_trading_enabled": true,
      "last_validated_at": "2026-02-21T14:00:00Z",
      "active_bots": 3,
      "open_positions": 5,
      "enabled_pairs": ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    },
    {
      "id": "cred_def456",
      "exchange_code": "bybit",
      "exchange_name": "Bybit",
      "label": "Backup Account",
      "status": "active",
      "is_trading_enabled": true,
      "last_validated_at": "2026-02-21T13:30:00Z",
      "active_bots": 1,
      "open_positions": 2,
      "enabled_pairs": ["BTC/USDT"]
    }
  ]
}
```

### 2. Get Enabled Pairs for Credential

**Endpoint:** `GET /api/exchange/credentials/:id/enabled-pairs`

**Response:**
```json
{
  "credential_id": "cred_abc123",
  "exchange_code": "binance",
  "enabled_pairs": [
    {
      "symbol": "BTC/USDT",
      "is_trading_enabled": true,
      "min_order_size": 0.0001,
      "max_order_size": 100.0,
      "price_precision": 2,
      "quantity_precision": 6
    }
  ]
}
```

### 3. Validate Credential

**Endpoint:** `POST /api/exchange/credentials/:id/validate`

**Process:**
1. Load credential and decrypt API keys
2. Make test API call to exchange (e.g., fetch account info)
3. Update `last_validated_at` and `validation_error` fields
4. Return validation result

**Response:**
```json
{
  "valid": true,
  "validated_at": "2026-02-21T15:00:00Z",
  "permissions": {
    "can_read": true,
    "can_trade": true,
    "can_withdraw": false
  }
}
```

---

## Summary of Required Updates

### ✅ Already Correct (No Changes Needed)
- Database schema (`exchange.*` tables)
- Page 1: Bot Fleet (with minor label addition)
- Page 2: Trading/Positions (excellent!)
- Pages 3-6: Platform dashboards
- Pages 8-11: User management

### ⚠️ Needs Minor Updates

#### **Page 7: Bot Detail**
1. Add `credential_label` and `credential_status` to bot header
2. Update `GET /api/phoenix/bots/:id` to include credential object
3. Add credential validation to manual order submission
4. Show credential status indicator in UI

#### **All Bot-Related Pages**
1. When showing exchange, also show credential label
2. Add credential selection dropdown when creating bots
3. Validate trading pairs against credential's enabled pairs
4. Show credential validation warnings

### 📝 New Endpoints Recommended
1. `GET /api/exchange/credentials` - List user's credentials
2. `GET /api/exchange/credentials/:id/enabled-pairs` - Get enabled pairs for credential
3. `POST /api/exchange/credentials/:id/validate` - Validate credential with exchange
4. `POST /api/exchange/credentials` - Add new credential
5. `PUT /api/exchange/credentials/:id` - Update credential
6. `DELETE /api/exchange/credentials/:id` - Remove credential (cascade check for active bots)

---

## Credential Security Best Practices

### 1. Encryption at Rest
```elixir
# Use pgcrypto for database-level encryption
defp encrypt_api_key(api_key, user_id) do
  # Derive encryption key from user's master key + app secret
  encryption_key = derive_encryption_key(user_id)

  # Encrypt using AES-256-GCM
  :crypto.crypto_one_time(:aes_256_gcm, encryption_key, iv, api_key, true)
end

defp decrypt_api_key(encrypted_data, user_id) do
  encryption_key = derive_encryption_key(user_id)
  :crypto.crypto_one_time(:aes_256_gcm, encryption_key, iv, encrypted_data, false)
end
```

### 2. Credentials Never Sent to Frontend
```elixir
# ❌ WRONG - Never expose credentials
%{
  credential_id: cred.id,
  api_key: cred.api_key,  # ❌ NEVER DO THIS
  api_secret: cred.api_secret  # ❌ NEVER DO THIS
}

# ✅ CORRECT - Only send metadata
%{
  credential_id: cred.id,
  label: cred.label,
  exchange_code: cred.exchange_code,
  status: cred.status,
  last_validated_at: cred.last_validated_at
}
```

### 3. Credential Rotation Support
```sql
ALTER TABLE exchange.user_credentials
ADD COLUMN previous_api_key_encrypted BYTEA,
ADD COLUMN key_rotation_at TIMESTAMPTZ;

-- Allow 24-hour grace period for old keys during rotation
```

### 4. Audit Logging
```sql
CREATE TABLE exchange.credential_access_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id UUID NOT NULL REFERENCES exchange.user_credentials(id),
    accessed_by VARCHAR(100) NOT NULL,  -- 'bot_worker_pid', 'manual_order_api', etc.
    action VARCHAR(50) NOT NULL,  -- 'decrypt', 'validate', 'order_submit'
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Conclusion

### Overall Assessment: ✅ **EXCELLENT FOUNDATION**

The database schema has **comprehensive multi-exchange support** with proper credential management, encrypted storage, and per-credential trading pair configuration.

### Critical Path Items:

1. **Update Bot Detail Page (Page 7)** to show credential label and status
2. **Add credential selection UI** to bot creation flow
3. **Implement 4 credential management endpoints** (list, get enabled pairs, validate, CRUD)
4. **Add credential validation** to all order submission flows
5. **Update bot-related WebSocket events** to include credential_label

### Non-Critical Enhancements:

1. Add credential usage stats view
2. Add credential rotation support
3. Add credential access audit log
4. Add credential health monitoring (auto-validate every hour)

### Estimated Implementation Time:

- Critical updates: **2-3 days**
- Full credential management UI: **5-7 days**
- Security hardening: **3-4 days**

**Total:** 10-14 days for complete multi-exchange credential management system.

---

**Assessment Complete** ✅
