## Page 8: `/users` - Users List Page

### UI Features & Requirements

1. **Summary Cards (4 metrics)**
   - Total Users count
   - Traders count (providing signals)
   - Followers count (copy trading)
   - Verified users count with percentage

2. **Search Functionality**
   - Search by name, email, or ID
   - Real-time filtering

3. **Filter System (4 filters)**
   - Type filter (All, Trader, Follower, Both)
   - Status filter (All, Active, Inactive, Suspended)
   - Verification filter (All, Unverified, Basic, Advanced, Full)
   - Results counter

4. **Users Table (Desktop)**
   - Columns: User (name + email), Type, Status, Verification, Trades, Total P&L, Win Rate, Join Date
   - Click row to navigate to user detail
   - View button per row

5. **Users Cards (Mobile)**
   - Responsive card layout
   - Same data as table in card format

6. **Pagination/Count Display**
   - Shows "X of Y users shown"
   - Client-side filtering (no server pagination in mock)

---

### Data Source Mapping

| Component | Data Source | Endpoint/Channel | Update Frequency | Notes |
|-----------|-------------|------------------|------------------|-------|
| **Users List** | NestJS API | `GET /api/users` | On page load | Paginated list with filters |
| **Summary Counts** | Client-side Derived | Calculated from users list | Real-time | Total, traders, followers, verified |
| **Search Results** | Client-side Filter | JavaScript filter on loaded data | Instant | No API call for search |
| **Filter Results** | Client-side Filter | JavaScript filter on loaded data | Instant | No API call for filters |
| **User Detail Navigation** | Client-side Router | Next.js router push | On click | Navigate to `/users/[id]` |

---

### NestJS REST API Endpoints

#### 1. Get Users List

**Endpoint:** `GET /api/users`

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50, max: 100)
- `type` - Filter by user type (trader, follower, both)
- `status` - Filter by status (active, inactive, suspended)
- `verification` - Filter by verification level (unverified, basic, advanced, full)
- `search` - Search query (name, email, ID)
- `sort_by` - Sort field (created_at, total_pnl, total_trades, win_rate)
- `sort_order` - Sort direction (asc, desc)

**Response:**
```json
{
  "users": [
    {
      "id": "USER-0001",
      "name": "Alice Johnson",
      "email": "alice.j@trader.io",
      "type": "trader",
      "status": "active",
      "verified": true,
      "verification_level": "full",
      "join_date": "2025-08-15",
      "last_active": "2h ago",
      "total_trades": 247,
      "followers": 143,
      "following": 0,
      "total_pnl": 12473.89,
      "win_rate": 68.5
    },
    {
      "id": "USER-0002",
      "name": "Bob Martinez",
      "email": "bob.m@gmail.com",
      "type": "follower",
      "status": "active",
      "verified": true,
      "verification_level": "basic",
      "join_date": "2025-11-22",
      "last_active": "5h ago",
      "total_trades": 0,
      "followers": 0,
      "following": 3,
      "total_pnl": 0,
      "win_rate": 0
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 247,
    "total_pages": 5
  },
  "summary": {
    "total_users": 247,
    "active_users": 198,
    "traders": 87,
    "followers": 160,
    "verified_users": 189
  }
}
```

**PostgreSQL Query:**
```sql
WITH user_stats AS (
  SELECT
    u.id,
    u.email,
    u.status,
    u.created_at,
    up.first_name || ' ' || up.last_name as full_name,
    up.verification_level,
    up.is_trader,
    up.is_follower,
    -- Derived type
    CASE
      WHEN up.is_trader AND up.is_follower THEN 'both'
      WHEN up.is_trader THEN 'trader'
      WHEN up.is_follower THEN 'follower'
      ELSE 'none'
    END as user_type,
    -- Last activity
    GREATEST(
      COALESCE(u.last_login_at, u.created_at),
      COALESCE((SELECT MAX(created_at) FROM trading.orders WHERE user_id = u.id), u.created_at)
    ) as last_activity_at,
    -- Trading stats (for traders)
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
    COALESCE(
      (SELECT COUNT(*) FROM auth.user_follows WHERE followed_user_id = u.id),
      0
    ) as followers_count,
    COALESCE(
      (SELECT COUNT(*) FROM auth.user_follows WHERE follower_user_id = u.id),
      0
    ) as following_count
  FROM auth.users u
  LEFT JOIN auth.user_profiles up ON u.id = up.user_id
  WHERE u.role = 'user'  -- Exclude admin users
)
SELECT
  id,
  email,
  full_name as name,
  user_type as type,
  status,
  CASE WHEN verification_level IS NOT NULL AND verification_level != 'none' THEN true ELSE false END as verified,
  verification_level,
  created_at::date as join_date,
  last_activity_at,
  total_trades,
  followers_count as followers,
  following_count as following,
  total_pnl,
  avg_win_rate as win_rate
FROM user_stats
WHERE ($1::text IS NULL OR user_type = $1)  -- Type filter
  AND ($2::text IS NULL OR status::text = $2)  -- Status filter
  AND ($3::text IS NULL OR verification_level::text = $3)  -- Verification filter
  AND (
    $4::text IS NULL OR
    email ILIKE '%' || $4 || '%' OR
    full_name ILIKE '%' || $4 || '%' OR
    id::text ILIKE '%' || $4 || '%'
  )  -- Search filter
ORDER BY
  CASE WHEN $5 = 'created_at' THEN created_at END DESC,
  CASE WHEN $5 = 'total_pnl' THEN total_pnl END DESC,
  CASE WHEN $5 = 'total_trades' THEN total_trades END DESC,
  CASE WHEN $5 = 'win_rate' THEN avg_win_rate END DESC,
  created_at DESC
LIMIT $6 OFFSET $7;
```

**Data Source:** NestJS API → PostgreSQL with aggregated user statistics

---

### Database Schema Requirements

#### Current Schema: `auth.users` and `auth.user_profiles`

✅ **Already Supported:**
- User identification (id, email)
- User status (pending_verification, active, suspended, deactivated, banned)
- Authentication data (password_hash, last_login_at)
- Timestamps (created_at, updated_at)

✅ **User Profiles Table:**
- User profile data (first_name, last_name)
- Verification level (none, basic, standard, enhanced)
- Trader/follower flags (is_trader, is_follower)
- Social features support

#### Missing Tables/Views

**1. User Follows Table** (for followers/following counts)

If not already exists:
```sql
CREATE TABLE auth.user_follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    followed_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_follow UNIQUE (follower_user_id, followed_user_id),
    CONSTRAINT chk_no_self_follow CHECK (follower_user_id != followed_user_id)
);

CREATE INDEX idx_user_follows_follower ON auth.user_follows(follower_user_id);
CREATE INDEX idx_user_follows_followed ON auth.user_follows(followed_user_id);

COMMENT ON TABLE auth.user_follows IS 'Tracks user follow relationships for copy trading';
```

**2. Materialized View for User Statistics** (Performance optimization)

```sql
CREATE MATERIALIZED VIEW auth.user_list_stats AS
SELECT
  u.id as user_id,
  u.email,
  u.status,
  u.created_at,
  u.last_login_at,
  up.first_name || ' ' || up.last_name as full_name,
  up.verification_level,
  CASE
    WHEN up.is_trader AND up.is_follower THEN 'both'
    WHEN up.is_trader THEN 'trader'
    WHEN up.is_follower THEN 'follower'
    ELSE 'none'
  END as user_type,
  -- Trading aggregates
  COALESCE(SUM(b.total_pnl_usd), 0) as total_pnl,
  COALESCE(SUM(b.total_trades), 0) as total_trades,
  COALESCE(AVG(b.win_rate), 0) as avg_win_rate,
  -- Social counts
  (SELECT COUNT(*) FROM auth.user_follows WHERE followed_user_id = u.id) as followers_count,
  (SELECT COUNT(*) FROM auth.user_follows WHERE follower_user_id = u.id) as following_count,
  -- Last activity
  GREATEST(
    COALESCE(u.last_login_at, u.created_at),
    COALESCE(MAX(o.created_at), u.created_at)
  ) as last_activity_at
FROM auth.users u
LEFT JOIN auth.user_profiles up ON u.id = up.user_id
LEFT JOIN trading.bots b ON u.id = b.user_id
LEFT JOIN trading.orders o ON u.id = o.user_id
WHERE u.role = 'user'
GROUP BY u.id, u.email, u.status, u.created_at, u.last_login_at, up.first_name, up.last_name, up.verification_level, up.is_trader, up.is_follower;

-- Create indexes
CREATE UNIQUE INDEX idx_user_list_stats_user_id ON auth.user_list_stats(user_id);
CREATE INDEX idx_user_list_stats_type ON auth.user_list_stats(user_type);
CREATE INDEX idx_user_list_stats_status ON auth.user_list_stats(status);
CREATE INDEX idx_user_list_stats_verification ON auth.user_list_stats(verification_level);

-- Refresh policy: Every 5 minutes
CREATE OR REPLACE FUNCTION refresh_user_list_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY auth.user_list_stats;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh with pg_cron (if available) or call from application
```

**Benefits of Materialized View:**
- Pre-computed aggregates (P&L, trades, followers)
- Much faster queries for user list page
- Refresh every 5 minutes is acceptable for admin view
- Reduces load on trading tables

---

### Data Flow Summary

```
1. PAGE LOAD
   Frontend → NestJS GET /api/users → Query materialized view → Return user list

2. FILTERING
   Frontend → JavaScript client-side filter → Update displayed users (no API call)

3. SEARCH
   Frontend → JavaScript client-side filter → Update displayed users (no API call)

4. NAVIGATION
   Click user row → Next.js router.push(`/users/${userId}`) → Load user detail page

5. DATA REFRESH
   Admin clicks "Refresh" → NestJS triggers REFRESH MATERIALIZED VIEW → Updated data
```

**Note:** All filtering and search is client-side in the current implementation. For large user bases (10,000+), this should be moved to server-side with API query parameters.

---

### Summary Table

| Component | Data Source | Protocol | Frequency | Storage |
|-----------|-------------|----------|-----------|---------|
| **Users List** | NestJS API | HTTP REST | On page load | PostgreSQL `auth.user_list_stats` (materialized view) |
| **Summary Stats** | Client-side | JavaScript | Real-time | Derived from loaded users |
| **Search Filter** | Client-side | JavaScript | Instant | In-memory array filter |
| **Type Filter** | Client-side | JavaScript | Instant | In-memory array filter |
| **Status Filter** | Client-side | JavaScript | Instant | In-memory array filter |
| **Verification Filter** | Client-side | JavaScript | Instant | In-memory array filter |

---

### Frontend Implementation Notes

**API Integration:**
```typescript
interface User {
  id: string;
  name: string;
  email: string;
  type: "trader" | "follower" | "both";
  status: "active" | "inactive" | "suspended";
  verified: boolean;
  verification_level: "unverified" | "basic" | "advanced" | "full";
  join_date: string;
  last_active: string;
  total_trades: number;
  followers: number;
  following: number;
  total_pnl: number;
  win_rate: number;
}

// Load users
async function loadUsers() {
  const res = await fetch("/api/users?limit=100");
  const data = await res.json();
  setUsers(data.users);
  setSummary(data.summary);
}

// Client-side filtering
const filteredUsers = users.filter((user) => {
  const matchesSearch =
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.id.toLowerCase().includes(searchQuery.toLowerCase());

  const matchesType = filterType === "all" || user.type === filterType;
  const matchesStatus = filterStatus === "all" || user.status === filterStatus;
  const matchesVerification =
    filterVerification === "all" ||
    user.verification_level === filterVerification;

  return matchesSearch && matchesType && matchesStatus && matchesVerification;
});

// Calculate summary stats
const summary = {
  total: users.length,
  active: users.filter(u => u.status === "active").length,
  traders: users.filter(u => u.type === "trader" || u.type === "both").length,
  followers: users.filter(u => u.type === "follower" || u.type === "both").length,
  verified: users.filter(u => u.verified).length,
  verifiedPercent: ((users.filter(u => u.verified).length / users.length) * 100).toFixed(0)
};
```

**Navigate to User Detail:**
```typescript
function handleUserClick(userId: string) {
  router.push(`/users/${userId}`);
}
```

---

### Performance Considerations

1. **Materialized View Refresh**
   - Refresh every 5 minutes via cron job or scheduled task
   - Use CONCURRENTLY to avoid locking table
   - For real-time needs, query base tables directly

2. **Client-Side Filtering Limits**
   - Works well for < 1,000 users
   - For 10,000+ users, implement server-side pagination
   - Add lazy loading/infinite scroll

3. **Query Optimization**
   - Materialized view eliminates expensive joins
   - Indexes on filter columns (type, status, verification)
   - Consider partial indexes for common filters

4. **API Response Size**
   - Current: Returns all users (up to limit)
   - Optimization: Return only essential fields for list view
   - Full details loaded on user detail page

5. **Caching Strategy**
   - Cache materialized view results in Redis for 5 minutes
   - Invalidate on user status changes
   - Client-side cache with SWR/React Query

---

### Multi-Exchange Context

**Not Applicable** - This page displays user accounts, which are exchange-agnostic. Exchange credentials are managed separately and would be shown on:
- User detail page (showing which exchanges the user has connected)
- Settings > Exchanges page (credential management)

No exchange-specific filtering or data needed on this page.

---

### Testing Checklist

- [ ] Users list loads correctly with all fields
- [ ] Summary cards display accurate counts
- [ ] Search filters users by name, email, and ID
- [ ] Type filter works correctly
- [ ] Status filter works correctly
- [ ] Verification filter works correctly
- [ ] Multiple filters can be applied simultaneously
- [ ] Clicking a user row navigates to detail page
- [ ] Mobile card layout displays correctly
- [ ] Results counter updates with filters
- [ ] No errors with empty search results
- [ ] Performance acceptable with 100+ users loaded
- [ ] Pagination works correctly (if implemented)

---

### Recommended Enhancements

1. **Server-Side Pagination**
   - Add page navigation controls
   - Implement cursor-based pagination for performance
   - Show "Load More" button

2. **Real-Time User Counts**
   - WebSocket updates for active user count
   - Live indicator for currently online users
   - Last active timestamp updates

3. **Export Functionality**
   - Export user list to CSV
   - Include filters in export
   - Admin audit requirement

4. **Bulk Actions**
   - Select multiple users
   - Bulk suspend/activate
   - Bulk verification level changes

5. **Advanced Filters**
   - Filter by join date range
   - Filter by P&L range
   - Filter by number of followers
   - Filter by trading activity

---

**[← Previous: Bot Detail](./07-bot-detail.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: User Detail →](./09-user-detail.md)**
