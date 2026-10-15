## Page 17: `/finance/users` - User Analytics & Management

### UI Mock Data Structure

```typescript
interface UserPerformance {
  name: string;              // "alice.k"
  aum: number;               // 85000 (Assets Under Management)
  pnl: number;               // 12400
  pnlPct: number;            // 14.6%
  bots: number;              // 3
  tier: string;              // "Pro", "Enterprise", "Basic"
  joined: string;            // "Jan 2025"
  winRate: number;           // 71.2%
  active: boolean;           // true/false
}

interface UserGrowth {
  month: string;             // "Jan", "Feb", etc.
  total: number;             // Cumulative users
  new: number;               // New signups
  churned: number;           // Users who left
}

interface SubscriptionTier {
  name: string;              // "Basic", "Pro", "Enterprise"
  count: number;             // 42, 31, 9
  color: string;             // Visual color
}

interface UserKPIs {
  totalUsers: number;              // 82
  totalAUM: number;                // Sum of all user AUM
  avgAUMPerUser: number;           // Average
  churnRate: number;               // % churned
  churnedCount: number;            // 7
}
```

### UI Features & Requirements

1. **User KPIs** - 4 cards (Total Users, Total AUM, Avg AUM/User, Churn Rate)
2. **Subscription Tier Distribution** - Pie/donut chart showing tier breakdown
3. **User Growth Chart** - Monthly bar chart showing total, new, and churned users
4. **User Performance Leaderboard** - Sortable table ranked by return %
5. **No Direct Multi-Exchange Data** - User-level aggregation (exchange-agnostic)

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Total Users** | PostgreSQL Count | COUNT `auth.users` | On page load | All registered users |
| **Total AUM** | PostgreSQL Aggregate | SUM of user equity | On page load | Across all exchanges |
| **Avg AUM/User** | Calculated | `total_aum / user_count` | On page load | Average per user |
| **Churn Rate** | PostgreSQL Aggregate | `(churned / total) * 100` | On page load | Last 90 days |
| **Subscription Tiers** | PostgreSQL Count | COUNT GROUP BY tier | On page load | From `auth.users.subscription_tier` |
| **User Growth** | PostgreSQL Time-Series | Monthly user signups | On page load | Historical growth |
| **User Performance** | PostgreSQL Aggregate | Per-user P&L, AUM, win rate | On page load | Aggregated from positions |
| **User Bots** | PostgreSQL Count | COUNT `trading.bots` WHERE `user_id` | On page load | Active bots per user |

---

### Data Delivery Strategy

#### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/finance/users/kpis`

**Response:**
```json
{
  "totalUsers": 82,
  "totalAUM": 512000.00,
  "avgAUMPerUser": 6243.90,
  "churnRate": 8.5,
  "churnedCount": 7,
  "growth": {
    "newUsers30d": 12,
    "churnedUsers30d": 3
  }
}
```

**PostgreSQL Query:**
```sql
WITH user_stats AS (
  SELECT
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_30d,
    COUNT(*) FILTER (WHERE deleted_at > NOW() - INTERVAL '30 days') as churned_30d
  FROM auth.users
),
aum_stats AS (
  SELECT
    SUM(latest_eq.total_equity_usd) as total_aum
  FROM (
    SELECT DISTINCT ON (user_id)
      user_id,
      total_equity_usd
    FROM trading.equity_snapshots es
    JOIN trading.bots b ON es.bot_id = b.id
    ORDER BY user_id, snapshot_at DESC
  ) latest_eq
)
SELECT
  us.total_users,
  aum.total_aum,
  aum.total_aum / NULLIF(us.total_users, 0) as avg_aum_per_user,
  (us.churned_30d::FLOAT / NULLIF(us.total_users, 0) * 100) as churn_rate,
  us.churned_30d as churned_count,
  us.new_30d as new_users_30d
FROM user_stats us
CROSS JOIN aum_stats aum;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 2:** `GET /api/finance/users/performance`

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "name": "alice.k",
      "email": "alice.k@example.com",
      "aum": 85000.00,
      "pnl": 12400.00,
      "pnlPct": 14.6,
      "bots": 3,
      "tier": "Pro",
      "joined": "2025-01-15",
      "winRate": 71.2,
      "active": true
    },
    ...
  ]
}
```

**PostgreSQL Query:**
```sql
WITH user_equity AS (
  SELECT
    b.user_id,
    SUM(latest_eq.total_equity_usd) as total_equity
  FROM trading.bots b
  LEFT JOIN LATERAL (
    SELECT total_equity_usd
    FROM trading.equity_snapshots
    WHERE bot_id = b.id
    ORDER BY snapshot_at DESC
    LIMIT 1
  ) latest_eq ON true
  GROUP BY b.user_id
),
user_pnl AS (
  SELECT
    b.user_id,
    SUM(p.realized_pnl_usd) as total_pnl,
    (COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0)::FLOAT / NULLIF(COUNT(*), 0)) * 100 as win_rate
  FROM trading.positions p
  JOIN trading.bots b ON p.bot_id = b.id
  WHERE p.status = 'closed'
    AND p.closed_at > NOW() - INTERVAL '90 days'
  GROUP BY b.user_id
),
user_bots AS (
  SELECT
    user_id,
    COUNT(*) as bot_count
  FROM trading.bots
  WHERE status IN ('running', 'paused')
  GROUP BY user_id
)
SELECT
  u.id,
  u.username as name,
  u.email,
  COALESCE(ue.total_equity, 0) as aum,
  COALESCE(up.total_pnl, 0) as pnl,
  (COALESCE(up.total_pnl, 0) / NULLIF(ue.total_equity, 0) * 100) as pnl_pct,
  COALESCE(ub.bot_count, 0) as bots,
  u.subscription_tier as tier,
  u.created_at as joined,
  COALESCE(up.win_rate, 0) as win_rate,
  u.status = 'active' as active
FROM auth.users u
LEFT JOIN user_equity ue ON ue.user_id = u.id
LEFT JOIN user_pnl up ON up.user_id = u.id
LEFT JOIN user_bots ub ON ub.user_id = u.id
WHERE u.role = 'user'
ORDER BY pnl_pct DESC;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 3:** `GET /api/finance/users/tiers`

**Response:**
```json
{
  "tiers": [
    { "name": "Basic", "count": 42, "color": "#A89F93" },
    { "name": "Pro", "count": 31, "color": "#00e5a0" },
    { "name": "Enterprise", "count": 9, "color": "#f5a623" }
  ]
}
```

**PostgreSQL Query:**
```sql
SELECT
  subscription_tier as name,
  COUNT(*) as count
FROM auth.users
WHERE role = 'user'
  AND status = 'active'
GROUP BY subscription_tier
ORDER BY
  CASE subscription_tier
    WHEN 'Enterprise' THEN 1
    WHEN 'Pro' THEN 2
    WHEN 'Basic' THEN 3
    ELSE 4
  END;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 4:** `GET /api/finance/users/growth?months=12`

**Response:**
```json
{
  "growth": [
    { "month": "Jan", "total": 12, "new": 8, "churned": 0 },
    { "month": "Feb", "total": 19, "new": 7, "churned": 0 },
    { "month": "Mar", "total": 27, "new": 9, "churned": 1 },
    ...
  ]
}
```

**PostgreSQL Query:**
```sql
WITH monthly_signups AS (
  SELECT
    TO_CHAR(created_at, 'Mon') as month,
    EXTRACT(MONTH FROM created_at) as month_num,
    COUNT(*) as new_users
  FROM auth.users
  WHERE created_at > NOW() - INTERVAL '12 months'
  GROUP BY TO_CHAR(created_at, 'Mon'), EXTRACT(MONTH FROM created_at)
),
monthly_churn AS (
  SELECT
    TO_CHAR(deleted_at, 'Mon') as month,
    EXTRACT(MONTH FROM deleted_at) as month_num,
    COUNT(*) as churned_users
  FROM auth.users
  WHERE deleted_at > NOW() - INTERVAL '12 months'
  GROUP BY TO_CHAR(deleted_at, 'Mon'), EXTRACT(MONTH FROM deleted_at)
),
cumulative_users AS (
  SELECT
    TO_CHAR(date_trunc('month', created_at), 'Mon') as month,
    EXTRACT(MONTH FROM created_at) as month_num,
    COUNT(*) OVER (ORDER BY date_trunc('month', created_at)) as total
  FROM auth.users
  WHERE created_at > NOW() - INTERVAL '12 months'
  GROUP BY date_trunc('month', created_at), EXTRACT(MONTH FROM created_at)
)
SELECT
  cu.month,
  cu.total,
  COALESCE(ms.new_users, 0) as new,
  COALESCE(mc.churned_users, 0) as churned
FROM cumulative_users cu
LEFT JOIN monthly_signups ms ON ms.month_num = cu.month_num
LEFT JOIN monthly_churn mc ON mc.month_num = cu.month_num
ORDER BY cu.month_num;
```

**Data Source:** **NestJS API** → PostgreSQL

---

### Multi-Exchange Context

#### **User-Level Aggregation (Exchange-Agnostic)**

This page shows **user-level metrics** aggregated across all exchanges. Users don't typically care which exchange their P&L came from—they care about total performance.

However, we can add an optional drill-down:

**Additional Endpoint:** `GET /api/finance/users/:id/by-exchange`

**Response:**
```json
{
  "userId": "uuid",
  "byExchange": {
    "binance": {
      "aum": 50000,
      "pnl": 7200,
      "bots": 2
    },
    "bybit": {
      "aum": 35000,
      "pnl": 5200,
      "bots": 1
    }
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  a.code as exchange,
  SUM(latest_eq.total_equity_usd) as aum,
  SUM(p.realized_pnl_usd) as pnl,
  COUNT(DISTINCT b.id) as bots
FROM trading.bots b
JOIN exchange.user_credentials uc ON b.credential_id = uc.id
JOIN exchange.adapters a ON uc.adapter_id = a.id
LEFT JOIN LATERAL (
  SELECT total_equity_usd
  FROM trading.equity_snapshots
  WHERE bot_id = b.id
  ORDER BY snapshot_at DESC
  LIMIT 1
) latest_eq ON true
LEFT JOIN trading.positions p ON p.bot_id = b.id
  AND p.status = 'closed'
  AND p.closed_at > NOW() - INTERVAL '90 days'
WHERE b.user_id = $1
GROUP BY a.code;
```

---

### Database Schema Requirements

#### **Existing Schema Support**

✅ **Already Supported:**
- `auth.users` - User data, subscription tier, status
- `trading.bots` - Bot count per user
- `trading.positions` - P&L, win rate
- `trading.equity_snapshots` - User AUM

#### **Recommended Additions**

**1. Add `subscription_tier` field to `auth.users`**

```sql
-- If not already present
CREATE TYPE auth.subscription_tier AS ENUM ('Basic', 'Pro', 'Enterprise');

ALTER TABLE auth.users
ADD COLUMN subscription_tier auth.subscription_tier DEFAULT 'Basic';

CREATE INDEX idx_users_subscription_tier ON auth.users(subscription_tier);
```

**2. Add `deleted_at` for soft delete tracking (churn)**

```sql
ALTER TABLE auth.users
ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_users_deleted_at ON auth.users(deleted_at) WHERE deleted_at IS NOT NULL;
```

**3. Add index for user performance queries**

```sql
CREATE INDEX idx_equity_snapshots_user
ON trading.equity_snapshots(bot_id, snapshot_at DESC);

CREATE INDEX idx_positions_user_closed
ON trading.positions(bot_id, closed_at)
WHERE status = 'closed';
```

---

### Summary: Finance Users Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|----------------------|
| **User KPIs** | NestJS API | HTTP REST | On page load | Aggregated across all exchanges |
| **Subscription Tiers** | NestJS API | HTTP REST | On page load | User-level metric |
| **User Growth** | NestJS API | HTTP REST | On page load | Historical signups |
| **Performance Leaderboard** | NestJS API | HTTP REST | On page load | **User total P&L (all exchanges)** |
| **Per-User Exchange Breakdown** | NestJS API | HTTP REST | On drill-down | **Optional: Show user's exchanges** |

**Schema Changes Required:**
1. ✅ Add `subscription_tier` enum and column to `auth.users`
2. ✅ Add `deleted_at` column for churn tracking
3. ✅ Add indexes: `idx_equity_snapshots_user`, `idx_positions_user_closed`

**No Real-Time WebSocket Required** - User analytics updated on page load

---

**[← Previous: Finance Market](./16-finance-market.md)** | **[Back to Index](./00-INDEX.md)**
