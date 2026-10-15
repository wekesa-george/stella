## Page 10: `/admin-users` - Admin Users List Page

### UI Features & Requirements

1. **Summary Cards (4 metrics)**
   - Active admins count
   - Invited admins count
   - Suspended admins count
   - Deactivated admins count

2. **Search Functionality**
   - Search by email, first name, or last name
   - Real-time filtering

3. **Filter System**
   - Status filter (All, Active, Invited, Suspended, Deactivated)
   - Show/Hide filters toggle
   - Results counter

4. **Admin Users Table (Desktop)**
   - Columns: Name (with Super Admin badge), Email, Status, Last Login, MFA, Actions
   - Click row or "View" button to navigate to detail page
   - Hover effect on rows

5. **Invite Admin Button**
   - Navigates to `/admin-users/invite`
   - Prominent placement in header

6. **Responsive Design**
   - Mobile-optimized filters
   - Scrollable table on small screens

---

### Data Source Mapping

| Component | Data Source | Endpoint/Channel | Update Frequency | Notes |
|-----------|-------------|------------------|------------------|-------|
| **Admin Users List** | Logto Management API | `GET /api/admin/admin-users` | On page load | Returns admin users from Logto + enriched DB data |
| **Summary Counts** | Client-side Derived | Calculated from loaded list | Real-time | Total by status |
| **Search Results** | Client-side Filter | JavaScript filter on loaded data | Instant | No API call |
| **Filter Results** | Client-side Filter | JavaScript filter on loaded data | Instant | No API call |
| **User Detail Navigation** | Client-side Router | Next.js router push | On click | Navigate to `/admin-users/[id]` |

---

### NestJS REST API Endpoints

#### 1. Get Admin Users List

**Endpoint:** `GET /api/admin/admin-users`

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50, max: 100)
- `status` - Filter by status (active, invited, suspended, deactivated)
- `search` - Search query (email, first name, last name)
- `sort_by` - Sort field (created_at, last_login_at, email)
- `sort_order` - Sort direction (asc, desc)

**Response:**
```json
{
  "adminUsers": [
    {
      "id": "usr_01h8g3j9k2m4n5p6",
      "logtoUserId": "usr_abc123",
      "firstName": "Sarah",
      "lastName": "Chen",
      "email": "sarah.chen@stella.io",
      "phone": "+1 (555) 123-4567",
      "displayName": "Sarah C.",
      "status": "active",
      "isSuperAdmin": true,
      "mfaEnabled": true,
      "forcePasswordChange": false,
      "lastLoginAt": "2026-02-18T14:23:00Z",
      "lastLoginIp": "192.168.1.100",
      "failedLoginCount": 0,
      "lockedUntil": null,
      "invitedAt": "2025-11-14T16:00:00Z",
      "activatedAt": "2025-11-15T10:30:00Z",
      "createdAt": "2025-11-15T08:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12,
    "totalPages": 1
  },
  "summary": {
    "total": 12,
    "active": 8,
    "invited": 2,
    "suspended": 1,
    "deactivated": 1
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  au.id,
  au.logto_user_id,
  au.email,
  au.phone,
  au.first_name,
  au.last_name,
  au.display_name,
  au.status,
  au.is_super_admin,
  au.mfa_enabled,
  au.force_password_change,
  au.last_login_at,
  au.last_login_ip,
  au.failed_login_count,
  au.locked_until,
  au.invited_at,
  au.activated_at,
  au.deactivated_at,
  au.created_at
FROM admin.admin_users au
WHERE ($1::text IS NULL OR au.status::text = $1)  -- Status filter
  AND (
    $2::text IS NULL OR
    au.email ILIKE '%' || $2 || '%' OR
    au.first_name ILIKE '%' || $2 || '%' OR
    au.last_name ILIKE '%' || $2 || '%'
  )  -- Search filter
ORDER BY
  CASE WHEN $3 = 'email' THEN au.email END ASC,
  CASE WHEN $3 = 'last_login_at' THEN au.last_login_at END DESC NULLS LAST,
  CASE WHEN $3 = 'created_at' THEN au.created_at END DESC,
  au.created_at DESC
LIMIT $4 OFFSET $5;

-- Get summary counts
SELECT
  COUNT(*) FILTER (WHERE status = 'active') as active_count,
  COUNT(*) FILTER (WHERE status = 'invited') as invited_count,
  COUNT(*) FILTER (WHERE status = 'suspended') as suspended_count,
  COUNT(*) FILTER (WHERE status = 'deactivated') as deactivated_count,
  COUNT(*) as total_count
FROM admin.admin_users;
```

**Data Source:** NestJS API → PostgreSQL `admin.admin_users` table

---

### Database Schema Requirements

#### Current Schema: `admin.admin_users`

✅ **Already Supported:**
- Admin identification (id, logto_user_id, email)
- Admin status (active, invited, suspended, deactivated)
- Security features (mfa_enabled, force_password_change, failed_login_count, locked_until)
- Super admin flag (is_super_admin)
- Login tracking (last_login_at, last_login_ip)
- Account lifecycle (invited_at, activated_at, deactivated_at, deactivated_by)
- Profile data (first_name, last_name, display_name, phone, timezone, avatar_url)

**Complete Schema from stella-database.sql:**
```sql
CREATE TABLE admin.admin_users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    logto_user_id       VARCHAR(255) UNIQUE,                 -- Logto ID (separate Logto app/tenant for admin)
    email               VARCHAR(255) UNIQUE NOT NULL,
    phone               VARCHAR(50),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    display_name        VARCHAR(200),
    -- Authentication & Security
    password_hash       VARCHAR(255),
    mfa_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret          VARCHAR(255),
    force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'invited',  -- invited, active, suspended, deactivated
    is_super_admin      BOOLEAN NOT NULL DEFAULT FALSE,
    -- Login tracking
    last_login_at       TIMESTAMPTZ,
    last_login_ip       INET,
    failed_login_count  INTEGER NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    -- Invitation
    invited_by          UUID REFERENCES admin.admin_users(id),
    invited_at          TIMESTAMPTZ,
    activated_at        TIMESTAMPTZ,
    deactivated_at      TIMESTAMPTZ,
    deactivated_by      UUID REFERENCES admin.admin_users(id),
    deactivation_reason TEXT,
    -- Metadata
    avatar_url          TEXT,
    timezone            VARCHAR(50) DEFAULT 'UTC',
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_admin_users_email ON admin.admin_users(email);
CREATE INDEX idx_admin_users_logto_id ON admin.admin_users(logto_user_id);
CREATE INDEX idx_admin_users_status ON admin.admin_users(status);
CREATE INDEX idx_admin_users_super ON admin.admin_users(is_super_admin) WHERE is_super_admin = TRUE;
```

#### No Missing Tables Required

All fields displayed on the Admin Users List page are already present in the `admin.admin_users` table. No schema changes needed.

---

### Data Flow Summary

```
1. PAGE LOAD
   Frontend → NestJS GET /api/admin/admin-users → Query admin.admin_users → Return admin list

2. FILTERING
   Frontend → JavaScript client-side filter → Update displayed admins (no API call)

3. SEARCH
   Frontend → JavaScript client-side filter → Update displayed admins (no API call)

4. NAVIGATION TO DETAIL
   Click admin row → Next.js router.push(`/admin-users/${adminId}`) → Load detail page

5. NAVIGATION TO INVITE
   Click "Invite Admin" → Next.js router.push('/admin-users/invite') → Load invite form
```

**Note:** All filtering and search is client-side in the current implementation. For large admin teams (100+), consider moving to server-side with API query parameters.

---

### Summary Table

| Component | Data Source | Protocol | Frequency | Storage |
|-----------|-------------|----------|-----------|---------|
| **Admin Users List** | NestJS API | HTTP REST | On page load | PostgreSQL `admin.admin_users` |
| **Summary Stats** | Client-side | JavaScript | Real-time | Derived from loaded admins |
| **Search Filter** | Client-side | JavaScript | Instant | In-memory array filter |
| **Status Filter** | Client-side | JavaScript | Instant | In-memory array filter |

---

### Frontend Implementation Notes

**API Integration:**
```typescript
interface AdminUser {
  id: string;
  logtoUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  displayName?: string;
  status: "active" | "invited" | "suspended" | "deactivated";
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  forcePasswordChange: boolean;
  lastLoginAt?: string;
  lastLoginIp?: string;
  failedLoginCount: number;
  lockedUntil?: string;
  invitedAt?: string;
  activatedAt?: string;
  createdAt: string;
}

// Load admin users
async function loadAdminUsers() {
  const res = await fetch("/api/admin/admin-users?limit=100");
  const data = await res.json();
  setAdminUsers(data.adminUsers);
  setSummary(data.summary);
}

// Client-side filtering
const filteredUsers = adminUsers.filter((user) => {
  const matchesSearch =
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.lastName.toLowerCase().includes(searchQuery.toLowerCase());

  const matchesStatus = filterStatus === "" || user.status === filterStatus;

  return matchesSearch && matchesStatus;
});

// Calculate summary stats
const summary = {
  total: adminUsers.length,
  active: adminUsers.filter(u => u.status === "active").length,
  invited: adminUsers.filter(u => u.status === "invited").length,
  suspended: adminUsers.filter(u => u.status === "suspended").length,
  deactivated: adminUsers.filter(u => u.status === "deactivated").length,
};
```

**Navigate to Admin Detail:**
```typescript
function handleAdminClick(adminUserId: string) {
  router.push(`/admin-users/${adminUserId}`);
}
```

---

### Logto Integration Notes

**Logto Management API Integration:**

The admin users are managed through **Logto** for authentication, but the application stores additional metadata in the local `admin.admin_users` table.

**Hybrid Data Approach:**
1. **Logto Manages**: Email verification, password storage, MFA enrollment, authentication tokens
2. **Local DB Manages**: Admin-specific metadata (super admin flag, status, roles, activity tracking)

**Sync Strategy:**
```typescript
// When admin logs in via Logto
async function syncAdminUserFromLogto(logtoUserId: string, logtoProfile: any) {
  // Check if admin exists in local DB
  let adminUser = await db.adminUsers.findByLogtoId(logtoUserId);

  if (!adminUser) {
    // Create new admin user record
    adminUser = await db.adminUsers.create({
      logtoUserId,
      email: logtoProfile.email,
      firstName: logtoProfile.firstName,
      lastName: logtoProfile.lastName,
      status: 'invited', // Must be activated by super admin
      mfaEnabled: logtoProfile.mfaEnabled || false,
    });
  } else {
    // Update profile from Logto
    await db.adminUsers.update(adminUser.id, {
      email: logtoProfile.email,
      mfaEnabled: logtoProfile.mfaEnabled || false,
      lastLoginAt: new Date(),
      lastLoginIp: req.ip,
    });
  }

  return adminUser;
}
```

**API Endpoints for Logto Integration:**
- `POST /api/admin/auth/callback` - Handle Logto OAuth callback, sync admin user
- `GET /api/admin/auth/me` - Get current admin user profile
- `POST /api/admin/auth/logout` - Invalidate session

---

### Performance Considerations

1. **Client-Side Filtering Limits**
   - Works well for < 100 admin users
   - For 500+ admins, implement server-side pagination
   - Add lazy loading/infinite scroll

2. **Query Optimization**
   - Indexes on email, status, logto_user_id (already present)
   - Consider partial index for active admins only

3. **API Response Size**
   - Current: Returns all admins (up to limit)
   - Optimization: Return only essential fields for list view
   - Full details loaded on admin detail page

4. **Caching Strategy**
   - Cache admin list results in Redis for 5 minutes
   - Invalidate on admin status changes
   - Client-side cache with SWR/React Query

---

### Multi-Exchange Context

**Not Applicable** - This page displays platform administrators (backoffice staff) who manage the platform itself. Admin users are completely separate from:
- Customer users (`auth.users`) who trade on the platform
- Exchange credentials managed by customer users
- Trading operations

No exchange-specific filtering or data needed on this page.

---

### Testing Checklist

- [ ] Admin users list loads correctly with all fields
- [ ] Summary cards display accurate counts by status
- [ ] Search filters admins by email, first name, and last name
- [ ] Status filter works correctly
- [ ] Multiple filters can be applied simultaneously
- [ ] Super Admin badge displays correctly
- [ ] MFA enabled/disabled indicator displays correctly
- [ ] Clicking an admin row navigates to detail page
- [ ] "Invite Admin" button navigates to invite page
- [ ] Results counter updates with filters
- [ ] No errors with empty search results
- [ ] Performance acceptable with 50+ admins loaded
- [ ] Mobile responsive layout works correctly

---

### Recommended Enhancements

1. **Server-Side Pagination**
   - Add page navigation controls
   - Implement cursor-based pagination for performance
   - Show "Load More" button

2. **Advanced Filters**
   - Filter by super admin status
   - Filter by MFA enabled/disabled
   - Filter by last login date range
   - Filter by role assignments

3. **Bulk Actions**
   - Select multiple admins
   - Bulk suspend/activate
   - Bulk role assignment

4. **Activity Indicators**
   - "Online now" indicator for active sessions
   - Last active timestamp
   - Login failure warnings

5. **Export Functionality**
   - Export admin list to CSV
   - Include filters in export
   - Audit requirement

6. **Role Display**
   - Show primary role in table column
   - Tooltip with all assigned roles
   - Role badge color coding

---

**[← Previous: User Detail](./09-user-detail.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Admin User Detail →](./11-admin-user-detail.md)**
