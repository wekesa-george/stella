## Page 9: `/users/[id]` - User Detail Page

### UI Features & Requirements

1. **Header Section**
   - Breadcrumb navigation (Users / {user_id})
   - User avatar (initials if no image)
   - User name with status badge
   - Verified badge
   - Email and user ID
   - Edit User and Suspend buttons

2. **Metrics Row (6 metrics)**
   - Type (trader/follower/both)
   - Verification level
   - Total trades
   - Followers count
   - Following count
   - Last active timestamp

3. **Tab Navigation**
   - Overview tab
   - Transactions tab
   - Activity Log tab

4. **Overview Tab**
   - Performance metrics cards (Total P&L, Win Rate, Member Since)
   - User details grid (all profile information)

5. **Transactions Tab**
   - Transaction history table
   - Columns: ID, Type, Amount, Currency, Status, Description, Date
   - Transaction types: deposit, withdrawal, trade, fee

6. **Activity Log Tab**
   - Activity feed with timeline
   - Activity types: login, trade, withdraw, deposit, settings_change
   - Shows description, timestamp, IP address, and type badge

---

### Data Source Mapping

| Component | Data Source | Endpoint/Channel | Update Frequency | Notes |
|-----------|-------------|------------------|------------------|-------|
| **User Profile** | NestJS API | `GET /api/users/:id` | On page load | Basic user info and metrics |
| **Performance Metrics** | NestJS API | `GET /api/users/:id` | On page load | Aggregated trading stats |
| **User Details** | NestJS API | `GET /api/users/:id` | On page load | Full profile data |
| **Transactions** | NestJS API | `GET /api/users/:id/transactions` | On tab load | Historical transaction data |
| **Activity Log** | NestJS API | `GET /api/users/:id/activities` | On tab load | User activity history |
| **Edit User** | NestJS API | `PUT /api/users/:id` | On form submit | Update user profile |
| **Suspend User** | NestJS API | `POST /api/users/:id/suspend` | On button click | Change user status |

---

### NestJS REST API Endpoints

#### 1. Get User Detail

**Endpoint:** `GET /api/users/:id`

**Response:**
```json
{
  "user": {
    "id": "USER-0001",
    "email": "alice.j@trader.io",
    "name": "Alice Johnson",
    "first_name": "Alice",
    "last_name": "Johnson",
    "phone": "+1 (555) 123-4567",
    "display_name": "AliceJ",
    "timezone": "America/New_York",
    "avatar_url": null,
    "status": "active",
    "type": "trader",
    "verified": true,
    "verification_level": "full",
    "copy_trading": true,
    "join_date": "2025-08-15",
    "last_active": "2h ago",
    "last_login_at": "2026-02-21T12:30:00Z",
    "last_login_ip": "192.168.1.100",

    "total_trades": 247,
    "followers": 143,
    "following": 5,
    "total_pnl": 12473.89,
    "win_rate": 68.5,

    "member_since_formatted": "Aug '25",

    "created_at": "2025-08-15T10:00:00Z",
    "updated_at": "2026-02-21T12:30:00Z"
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  u.id,
  u.email,
  u.status,
  u.created_at,
  u.updated_at,
  u.last_login_at,
  u.last_login_ip,
  up.first_name,
  up.last_name,
  up.first_name || ' ' || up.last_name as name,
  up.phone,
  up.display_name,
  up.timezone,
  up.avatar_url,
  up.verification_level,
  up.copy_trading_enabled,
  CASE
    WHEN up.is_trader AND up.is_follower THEN 'both'
    WHEN up.is_trader THEN 'trader'
    WHEN up.is_follower THEN 'follower'
    ELSE 'none'
  END as user_type,
  CASE WHEN up.verification_level IS NOT NULL AND up.verification_level != 'none' THEN true ELSE false END as verified,
  -- Trading stats
  COALESCE(
    (SELECT SUM(total_pnl_usd) FROM trading.bots WHERE user_id = u.id),
    0
  ) as total_pnl,
  COALESCE(
    (SELECT SUM(total_trades) FROM trading.bots WHERE user_id = u.id),
    0
  ) as total_trades,
  COALESCE(
    (SELECT AVG(win_rate) FROM trading.bots WHERE user_id = u.id),
    0
  ) as avg_win_rate,
  -- Social stats
  (SELECT COUNT(*) FROM auth.user_follows WHERE followed_user_id = u.id) as followers_count,
  (SELECT COUNT(*) FROM auth.user_follows WHERE follower_user_id = u.id) as following_count
FROM auth.users u
LEFT JOIN auth.user_profiles up ON u.id = up.user_id
WHERE u.id = $1;
```

**Data Source:** NestJS API → PostgreSQL

#### 2. Get User Transactions

**Endpoint:** `GET /api/users/:id/transactions`

**Query Parameters:**
- `limit` - Number of results (default: 50, max: 100)
- `offset` - Pagination offset
- `type` - Filter by transaction type (deposit, withdrawal, trade, fee)
- `status` - Filter by status (completed, pending, failed)
- `from_date` - Start date (ISO 8601)
- `to_date` - End date (ISO 8601)

**Response:**
```json
{
  "transactions": [
    {
      "id": "TXN-000001",
      "type": "deposit",
      "amount": 5000.00,
      "currency": "USDT",
      "status": "completed",
      "description": "Deposit via bank transfer",
      "timestamp": "2026-02-15T10:30:00Z",
      "exchange": "binance",
      "txn_hash": "0x1234...",
      "fee": 0,
      "metadata": {
        "method": "bank_transfer",
        "reference": "BNK-12345"
      }
    },
    {
      "id": "TXN-000002",
      "type": "trade",
      "amount": 150.50,
      "currency": "USDT",
      "status": "completed",
      "description": "BTC/USDT trade",
      "timestamp": "2026-02-16T14:22:00Z",
      "exchange": "binance",
      "bot_id": "BOT-0001",
      "order_id": "ORD-12345"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 247
  }
}
```

**PostgreSQL Query:**
```sql
-- Unified transactions view combining multiple sources
WITH all_transactions AS (
  -- Deposits/Withdrawals from billing.transactions
  SELECT
    t.id,
    t.type,
    t.amount_usd as amount,
    'USD' as currency,
    t.status,
    t.description,
    t.created_at as timestamp,
    NULL as exchange,
    NULL as bot_id,
    NULL as order_id,
    t.metadata
  FROM billing.transactions t
  WHERE t.user_id = $1
    AND t.type IN ('deposit', 'withdrawal', 'fee')

  UNION ALL

  -- Trades from trading.orders
  SELECT
    o.id,
    'trade' as type,
    o.filled_quantity * o.average_price as amount,
    o.quote_asset as currency,
    o.status::text as status,
    o.trading_pair || ' trade' as description,
    o.created_at as timestamp,
    o.exchange_code as exchange,
    o.bot_id,
    o.id as order_id,
    jsonb_build_object(
      'side', o.side,
      'order_type', o.order_type,
      'filled_qty', o.filled_quantity,
      'avg_price', o.average_price
    ) as metadata
  FROM trading.orders o
  WHERE o.user_id = $1
    AND o.status = 'filled'
)
SELECT *
FROM all_transactions
WHERE ($2::text IS NULL OR type = $2)  -- Type filter
  AND ($3::text IS NULL OR status = $3)  -- Status filter
  AND ($4::timestamptz IS NULL OR timestamp >= $4)  -- From date
  AND ($5::timestamptz IS NULL OR timestamp <= $5)  -- To date
ORDER BY timestamp DESC
LIMIT $6 OFFSET $7;
```

**Data Source:** NestJS API → PostgreSQL (multiple tables unified)

#### 3. Get User Activity Log

**Endpoint:** `GET /api/users/:id/activities`

**Query Parameters:**
- `limit` - Number of results (default: 50, max: 100)
- `offset` - Pagination offset
- `type` - Filter by activity type (login, trade, withdraw, deposit, settings_change)
- `from_date` - Start date (ISO 8601)
- `to_date` - End date (ISO 8601)

**Response:**
```json
{
  "activities": [
    {
      "id": "ACT-000001",
      "type": "login",
      "description": "User logged in",
      "timestamp": "2026-02-21T12:30:00Z",
      "ip": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "location": "New York, US",
      "metadata": {
        "device": "Desktop",
        "browser": "Chrome"
      }
    },
    {
      "id": "ACT-000002",
      "type": "trade",
      "description": "Executed BTC/USDT trade",
      "timestamp": "2026-02-21T11:15:00Z",
      "ip": "192.168.1.100",
      "metadata": {
        "bot_id": "BOT-0001",
        "exchange": "binance",
        "pair": "BTC/USDT",
        "side": "buy",
        "amount": 0.05
      }
    },
    {
      "id": "ACT-000003",
      "type": "settings_change",
      "description": "Changed account settings",
      "timestamp": "2026-02-20T16:45:00Z",
      "ip": "192.168.1.100",
      "metadata": {
        "changes": ["timezone", "notifications"]
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 847
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  al.id,
  al.activity_type as type,
  al.description,
  al.created_at as timestamp,
  al.ip_address as ip,
  al.user_agent,
  al.metadata
FROM auth.activity_logs al
WHERE al.user_id = $1
  AND ($2::text IS NULL OR al.activity_type = $2)  -- Type filter
  AND ($3::timestamptz IS NULL OR al.created_at >= $3)  -- From date
  AND ($4::timestamptz IS NULL OR al.created_at <= $4)  -- To date
ORDER BY al.created_at DESC
LIMIT $5 OFFSET $6;
```

**Data Source:** NestJS API → PostgreSQL `auth.activity_logs`

#### 4. Update User

**Endpoint:** `PUT /api/users/:id`

**Request Body:**
```json
{
  "first_name": "Alice",
  "last_name": "Johnson",
  "phone": "+1 (555) 123-4567",
  "display_name": "AliceJ",
  "timezone": "America/New_York",
  "copy_trading_enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "USER-0001",
    "updated_at": "2026-02-21T14:00:00Z"
  }
}
```

**Side Effects:**
- Updates `auth.user_profiles` table
- Creates audit log entry in `auth.activity_logs`
- No real-time broadcast needed (admin action)

#### 5. Suspend User

**Endpoint:** `POST /api/users/:id/suspend`

**Request Body:**
```json
{
  "reason": "Violation of terms of service",
  "duration_days": 30,
  "notify_user": true
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "USER-0001",
    "status": "suspended",
    "suspended_at": "2026-02-21T14:00:00Z",
    "suspended_until": "2026-03-23T14:00:00Z"
  }
}
```

**Side Effects:**
- Updates `auth.users.status` to 'suspended'
- Stops all user's active bots
- Creates suspension record in `auth.user_suspensions` table
- Sends email notification to user (if enabled)
- Creates audit log entry

#### 6. Reactivate User

**Endpoint:** `POST /api/users/:id/reactivate`

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "USER-0001",
    "status": "active",
    "reactivated_at": "2026-02-21T14:00:00Z"
  }
}
```

---

### Database Schema Requirements

#### Current Schema: Sufficient for Basic Features

✅ **Already Supported:**
- `auth.users` - Core user data
- `auth.user_profiles` - Extended profile data
- `auth.activity_logs` - Activity tracking
- `billing.transactions` - Financial transactions

#### Missing Tables

**1. User Suspensions Table**

```sql
CREATE TABLE auth.user_suspensions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    suspended_by UUID REFERENCES admin.admin_users(id),
    reason TEXT NOT NULL,
    suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    suspended_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    reactivated_at TIMESTAMPTZ,
    reactivated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_suspensions_user_id ON auth.user_suspensions(user_id);
CREATE INDEX idx_user_suspensions_active ON auth.user_suspensions(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE auth.user_suspensions IS 'Tracks user suspension history and durations';
```

**2. Activity Logs Table** (if not exists)

```sql
CREATE TYPE auth.activity_type AS ENUM (
    'login', 'logout', 'login_failed',
    'trade', 'withdraw', 'deposit',
    'settings_change', 'password_change', 'email_change',
    'bot_created', 'bot_started', 'bot_stopped',
    'kyc_submitted', 'kyc_approved', 'kyc_rejected',
    'account_suspended', 'account_reactivated'
);

CREATE TABLE auth.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type auth.activity_type NOT NULL,
    description TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user_id ON auth.activity_logs(user_id);
CREATE INDEX idx_activity_logs_type ON auth.activity_logs(activity_type);
CREATE INDEX idx_activity_logs_created_at ON auth.activity_logs(created_at DESC);

COMMENT ON TABLE auth.activity_logs IS 'Comprehensive user activity audit trail';
```

---

### Data Flow Summary

```
1. PAGE LOAD
   Frontend → NestJS GET /api/users/:id → Query PostgreSQL → Return user profile

2. TAB SWITCH TO TRANSACTIONS
   Frontend → NestJS GET /api/users/:id/transactions → Query billing + trading tables → Return unified list

3. TAB SWITCH TO ACTIVITY LOG
   Frontend → NestJS GET /api/users/:id/activities → Query activity_logs → Return activity feed

4. SUSPEND USER
   Admin clicks Suspend → Modal opens → Enter reason → POST /api/users/:id/suspend
   → Update user status → Stop bots → Create suspension record → Send notification

5. EDIT USER
   Admin clicks Edit → Modal opens → Update fields → PUT /api/users/:id
   → Update profile → Create audit log → Return success
```

---

### Summary Table

| Component | Data Source | Protocol | Frequency | Storage |
|-----------|-------------|----------|-----------|---------|
| **User Profile** | NestJS API | HTTP REST | On page load | PostgreSQL `auth.users` + `auth.user_profiles` |
| **Performance Metrics** | NestJS API | HTTP REST | On page load | Aggregated from `trading.bots` |
| **User Details** | NestJS API | HTTP REST | On page load | PostgreSQL `auth.user_profiles` |
| **Transactions** | NestJS API | HTTP REST | On tab load | PostgreSQL `billing.transactions` + `trading.orders` |
| **Activity Log** | NestJS API | HTTP REST | On tab load | PostgreSQL `auth.activity_logs` |
| **Edit User** | NestJS API | HTTP REST | On form submit | PostgreSQL `auth.user_profiles` |
| **Suspend User** | NestJS API | HTTP REST | On action | PostgreSQL `auth.users` + `auth.user_suspensions` |

---

### Frontend Implementation Notes

**API Integration:**
```typescript
// Load user profile
async function loadUser(userId: string) {
  const res = await fetch(`/api/users/${userId}`);
  const data = await res.json();
  setUser(data.user);
}

// Load transactions (lazy load on tab switch)
async function loadTransactions(userId: string) {
  const res = await fetch(`/api/users/${userId}/transactions?limit=50`);
  const data = await res.json();
  setTransactions(data.transactions);
}

// Load activity log (lazy load on tab switch)
async function loadActivities(userId: string) {
  const res = await fetch(`/api/users/${userId}/activities?limit=50`);
  const data = await res.json();
  setActivities(data.activities);
}

// Suspend user
async function suspendUser(userId: string, reason: string) {
  const res = await fetch(`/api/users/${userId}/suspend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reason,
      duration_days: 30,
      notify_user: true
    })
  });

  if (res.ok) {
    const data = await res.json();
    setUser(prev => ({ ...prev, status: "suspended" }));
    showToast("User suspended successfully", "success");
  }
}
```

**Tab State Management:**
```typescript
const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "activity">("overview");

useEffect(() => {
  if (activeTab === "transactions" && transactions.length === 0) {
    loadTransactions(userId);
  } else if (activeTab === "activity" && activities.length === 0) {
    loadActivities(userId);
  }
}, [activeTab]);
```

---

### Performance Considerations

1. **Lazy Loading Tabs**
   - Only load data when tab is activated
   - Cache loaded data to avoid re-fetching
   - Use React Query or SWR for caching

2. **Activity Log Pagination**
   - Implement infinite scroll or "Load More" button
   - Don't load all activities at once (could be thousands)
   - Consider virtual scrolling for long lists

3. **Query Optimization**
   - Use indexes on user_id for all queries
   - Limit transaction/activity queries to recent data by default
   - Add date range filters for historical queries

4. **Aggregation Caching**
   - Cache user stats (P&L, trades, win rate) in Redis
   - Invalidate cache on bot status change
   - Refresh every 5 minutes for admin views

---

### Multi-Exchange Context

**Exchange Credentials Display** should be added to user detail page:

#### Add "Exchange Accounts" Section to Overview Tab

```typescript
interface UserExchangeCredential {
  id: string;
  exchange_code: string;
  exchange_name: string;
  label: string;
  status: "active" | "expired" | "invalid";
  last_validated_at: string;
  active_bots: number;
  open_positions: number;
  created_at: string;
}
```

**New Endpoint:** `GET /api/users/:id/exchange-credentials`

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
      "last_validated_at": "2026-02-21T14:00:00Z",
      "active_bots": 5,
      "open_positions": 12,
      "created_at": "2025-09-01T10:00:00Z"
    },
    {
      "id": "cred_def456",
      "exchange_code": "bybit",
      "exchange_name": "Bybit",
      "label": "Secondary Account",
      "status": "active",
      "last_validated_at": "2026-02-21T13:30:00Z",
      "active_bots": 2,
      "open_positions": 4,
      "created_at": "2025-10-15T12:00:00Z"
    }
  ]
}
```

**UI Display:**
```typescript
<div className="exchange-credentials">
  <h3>Exchange Accounts ({credentials.length})</h3>
  {credentials.map(cred => (
    <div key={cred.id} className="credential-card">
      <div className="exchange-name">{cred.exchange_name}</div>
      <div className="credential-label">{cred.label}</div>
      <div className="status-badge">{cred.status}</div>
      <div className="stats">
        <span>{cred.active_bots} bots</span>
        <span>{cred.open_positions} positions</span>
      </div>
    </div>
  ))}
</div>
```

---

### Testing Checklist

- [ ] User profile loads correctly with all fields
- [ ] Metrics row displays accurate stats
- [ ] Overview tab shows performance and details
- [ ] Transactions tab loads and displays correctly
- [ ] Activity log tab loads and displays correctly
- [ ] Tab switching works smoothly
- [ ] Edit user modal opens and saves changes
- [ ] Suspend user modal works and updates status
- [ ] Reactivate button appears for suspended users
- [ ] Breadcrumb navigation works
- [ ] Avatar displays initials correctly
- [ ] Status badges display correct colors
- [ ] Pagination works on transactions/activities
- [ ] No errors with missing optional fields
- [ ] Exchange credentials section displays (if added)

---

**[← Previous: Users List](./08-users-list.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Admin Users List →](./10-admin-users-list.md)**
