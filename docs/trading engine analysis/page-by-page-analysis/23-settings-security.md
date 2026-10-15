# Page 23: `/settings/security` - Security & Access Control

**Document Version:** 1.0
**Last Updated:** February 21, 2026
**Route:** `/settings/security`
**Page Type:** Configuration & User Management
**User Persona:** Platform Admin (exclusive access)
**Multi-Exchange Impact:** L None (platform-level security configuration)

---

## UI Mock Data Structure

```typescript
interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;                        // "Platform Admin", "Compliance Officer", "Ops Engineer", "Read Only"
  twoFA: boolean;                      // 2FA enabled status
  lastLogin: string;                   // "Just now", "2h ago", "1d ago"
  color: string;                       // UI color for avatar
  initials: string;                    // "GW", "AN", etc.
  sessions: number;                    // Count of active sessions
  createdAt?: string;                  // Account creation timestamp
  invitedBy?: string;                  // Email of admin who invited
  lastLoginIP?: string;                // IP address of last login
}

interface SecurityConfig {
  // Session Management
  sessionTimeout: number;              // Minutes of inactivity before logout

  // Authentication Policy
  forceTwoFA: boolean;                 // Require 2FA for all admins
  minPasswordLength: number;           // Minimum password characters
  requireSpecialChars: boolean;        // Password must have symbols
  maxLoginAttempts: number;            // Login attempts before lockout

  // Access Control
  ipAllowlist: boolean;                // Enable IP allowlist
  ipAddresses: string[];               // Allowed IPs (CIDR notation)

  // Audit & Compliance
  auditRetentionYears: number;         // Years to retain audit logs

  // Metadata
  updatedAt: string;
  updatedBy: string;                   // Admin who last modified
}

interface AdminSession {
  id: string;
  userId: number;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
}
```

---

## UI Features & Requirements

1. **Admin Users Table**:
   - List all admin users with avatar, name, email
   - Role dropdown (editable inline)
   - 2FA status badge (enabled/disabled)
   - Active sessions count
   - Last login timestamp
   - Edit and Revoke buttons
   - "Invite Admin" button

2. **Authentication Policy Section**:
   - Session Timeout (minutes input)
   - Min Password Length (number input)
   - Max Login Attempts (number input)
   - Audit Log Retention (years input)
   - 2FA enforcement toggle
   - Special characters requirement toggle
   - IP allowlist toggle

3. **IP Allowlist Section** (conditional, shown if enabled):
   - List of allowed IPs/CIDR blocks
   - Add IP input with validation
   - Remove IP (click X on chip)
   - CIDR notation support (e.g., `196.0.0.0/8`)

4. **Dirty State Management**:
   - Track unsaved changes
   - Show "Discard Changes" and "Save Changes" buttons
   - Confirm before discarding

5. **Role-Based Access**:
   - Platform Admin: Full access (invite, edit, revoke, configure)
   - All other roles: No access (redirect or permission error)

6. **Multi-Exchange Context**: **NOT APPLICABLE** - Security configuration is platform-level

---

## Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Admin Users List** | PostgreSQL | `auth.admin_users` | On page load | All admin accounts |
| **User Role** | PostgreSQL | `auth.admin_users.role` | Static (admin edits) | RBAC roles |
| **2FA Status** | PostgreSQL | `auth.admin_users.two_fa_enabled` | Static | Updated when user configures 2FA |
| **Last Login** | PostgreSQL | `auth.sessions.last_activity` | Real-time | Most recent session |
| **Active Sessions** | PostgreSQL | `auth.sessions` COUNT | Real-time | Where `expires_at > NOW()` |
| **Session Timeout** | PostgreSQL | `platform.security_config` | Static (admin edits) | Applied to new sessions |
| **Force 2FA** | PostgreSQL | `platform.security_config` | Static | Enforced at login |
| **Min Password Length** | PostgreSQL | `platform.security_config` | Static | Validated on password change |
| **Special Chars Required** | PostgreSQL | `platform.security_config` | Static | Password validation |
| **Max Login Attempts** | PostgreSQL | `platform.security_config` | Static | Lockout threshold |
| **IP Allowlist Enabled** | PostgreSQL | `platform.security_config` | Static | Firewall toggle |
| **IP Addresses** | PostgreSQL | `platform.ip_allowlist` | Static (admin edits) | CIDR notation |
| **Audit Retention** | PostgreSQL | `platform.security_config` | Static | Retention policy |

---

## Data Delivery Strategy

### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/platform/security/users`

**Authorization:** Platform Admin only

**Response:**
```json
{
  "users": [
    {
      "id": 1,
      "name": "George Wekesa",
      "email": "george@stella.io",
      "role": "Platform Admin",
      "twoFA": true,
      "lastLogin": "2026-02-21T16:00:00Z",
      "lastLoginIP": "41.210.45.123",
      "sessions": 1,
      "createdAt": "2025-12-01T00:00:00Z",
      "invitedBy": "system@stella.io"
    },
    {
      "id": 2,
      "name": "Amara Nwosu",
      "email": "amara@stella.io",
      "role": "Compliance Officer",
      "twoFA": true,
      "lastLogin": "2026-02-21T14:00:00Z",
      "lastLoginIP": "196.10.0.45",
      "sessions": 1,
      "createdAt": "2026-01-10T10:00:00Z",
      "invitedBy": "george@stella.io"
    }
  ],
  "total": 4
}
```

**PostgreSQL Query:**
```sql
WITH latest_sessions AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    ip_address as last_login_ip,
    last_activity as last_login
  FROM auth.sessions
  WHERE user_type = 'admin'
    AND expires_at > NOW()
  ORDER BY user_id, last_activity DESC
),
active_sessions AS (
  SELECT
    user_id,
    COUNT(*) as session_count
  FROM auth.sessions
  WHERE user_type = 'admin'
    AND expires_at > NOW()
  GROUP BY user_id
)
SELECT
  au.id,
  au.full_name as name,
  au.email,
  au.role,
  au.two_fa_enabled as "twoFA",
  COALESCE(ls.last_login, au.created_at) as last_login,
  ls.last_login_ip,
  COALESCE(acs.session_count, 0) as sessions,
  au.created_at,
  inv.email as invited_by
FROM auth.admin_users au
LEFT JOIN latest_sessions ls ON ls.user_id = au.id
LEFT JOIN active_sessions acs ON acs.user_id = au.id
LEFT JOIN auth.admin_users inv ON au.invited_by_user_id = inv.id
WHERE au.deleted_at IS NULL
  AND au.status != 'revoked'
ORDER BY au.role, au.created_at;
```

**Data Source:** **NestJS API** ’ PostgreSQL

---

**Endpoint 2:** `GET /api/platform/security/config`

**Authorization:** Platform Admin only

**Response:**
```json
{
  "config": {
    "sessionTimeout": 480,
    "forceTwoFA": true,
    "minPasswordLength": 12,
    "requireSpecialChars": true,
    "maxLoginAttempts": 5,
    "ipAllowlist": true,
    "ipAddresses": ["41.210.0.0/16", "196.0.0.0/8"],
    "auditRetentionYears": 7,
    "updatedAt": "2026-02-15T10:30:00Z",
    "updatedBy": "george@stella.io"
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  sc.session_timeout_minutes as session_timeout,
  sc.force_two_fa as force_two_fa,
  sc.min_password_length,
  sc.require_special_chars,
  sc.max_login_attempts,
  sc.ip_allowlist_enabled as ip_allowlist,
  (
    SELECT ARRAY_AGG(ip_cidr ORDER BY created_at)
    FROM platform.ip_allowlist
    WHERE deleted_at IS NULL
  ) as ip_addresses,
  sc.audit_retention_years,
  sc.updated_at,
  au.email as updated_by
FROM platform.security_config sc
LEFT JOIN auth.admin_users au ON sc.updated_by_user_id = au.id
WHERE sc.id = 1  -- Single-row config
  AND sc.deleted_at IS NULL;
```

**Data Source:** **NestJS API** ’ PostgreSQL

---

**Endpoint 3:** `PUT /api/platform/security/config`

**Authorization:** Platform Admin only

**Request Body:**
```json
{
  "sessionTimeout": 480,
  "forceTwoFA": true,
  "minPasswordLength": 14,
  "requireSpecialChars": true,
  "maxLoginAttempts": 5,
  "ipAllowlist": true,
  "ipAddresses": ["41.210.0.0/16", "196.0.0.0/8", "105.0.0.0/8"],
  "auditRetentionYears": 7
}
```

**Response:**
```json
{
  "success": true,
  "config": {
    "sessionTimeout": 480,
    "forceTwoFA": true,
    "minPasswordLength": 14,
    "requireSpecialChars": true,
    "maxLoginAttempts": 5,
    "ipAllowlist": true,
    "ipAddresses": ["41.210.0.0/16", "196.0.0.0/8", "105.0.0.0/8"],
    "auditRetentionYears": 7,
    "updatedAt": "2026-02-21T16:15:00Z",
    "updatedBy": "george@stella.io"
  },
  "auditId": "uuid"
}
```

**PostgreSQL Transaction:**
```sql
-- 1. Update security configuration
UPDATE platform.security_config
SET
  session_timeout_minutes = $1,
  force_two_fa = $2,
  min_password_length = $3,
  require_special_chars = $4,
  max_login_attempts = $5,
  ip_allowlist_enabled = $6,
  audit_retention_years = $7,
  updated_at = NOW(),
  updated_by_user_id = $8  -- Admin user ID
WHERE id = 1
RETURNING *;

-- 2. Sync IP allowlist (delete removed IPs, insert new ones)
WITH existing_ips AS (
  SELECT ip_cidr FROM platform.ip_allowlist WHERE deleted_at IS NULL
),
new_ips AS (
  SELECT unnest($9::TEXT[]) as ip_cidr
)
-- Soft delete removed IPs
UPDATE platform.ip_allowlist
SET deleted_at = NOW()
WHERE ip_cidr NOT IN (SELECT ip_cidr FROM new_ips)
  AND deleted_at IS NULL;

-- Insert new IPs (ignore if already exists)
INSERT INTO platform.ip_allowlist (ip_cidr, created_at)
SELECT ip_cidr, NOW()
FROM new_ips
WHERE ip_cidr NOT IN (SELECT ip_cidr FROM existing_ips)
ON CONFLICT (ip_cidr) WHERE deleted_at IS NULL DO NOTHING;

-- 3. Log configuration change
INSERT INTO platform.audit_log (
  event_type,
  actor_user_id,
  target_type,
  target_id,
  metadata,
  created_at
) VALUES (
  'security_config_updated',
  $8,
  'security_config',
  '1',
  jsonb_build_object(
    'changes', jsonb_build_object(
      'min_password_length', $3,
      'force_two_fa', $2,
      'ip_allowlist_enabled', $6,
      'ip_count', array_length($9::TEXT[], 1)
    )
  ),
  NOW()
);
```

**Side Effects:**
- If `forceTwoFA` changed to `true`, admins without 2FA will be locked out at next login
- If `ipAllowlist` enabled, only listed IPs can access admin panel
- New `minPasswordLength` applies to next password change
- Active sessions remain valid until timeout, new timeout applies to future sessions

**Data Source:** **NestJS API** ’ PostgreSQL

---

**Endpoint 4:** `POST /api/platform/security/users/invite`

**Authorization:** Platform Admin only

**Request Body:**
```json
{
  "email": "newadmin@stella.io",
  "name": "Sarah Chen",
  "role": "Compliance Officer"
}
```

**Response:**
```json
{
  "success": true,
  "userId": 5,
  "inviteToken": "secure-token-here",
  "inviteUrl": "https://admin.stella.io/invite/secure-token-here",
  "expiresAt": "2026-02-28T16:30:00Z"
}
```

**PostgreSQL Transaction:**
```sql
-- 1. Create admin user (inactive until they accept invite)
INSERT INTO auth.admin_users (
  email,
  full_name,
  role,
  status,
  two_fa_enabled,
  invited_by_user_id,
  created_at
) VALUES (
  $1,  -- email
  $2,  -- name
  $3,  -- role
  'invited',
  false,
  $4,  -- inviting admin user ID
  NOW()
)
RETURNING id;

-- 2. Generate invite token
INSERT INTO auth.invite_tokens (
  user_id,
  token,
  expires_at,
  created_at
) VALUES (
  (SELECT id FROM auth.admin_users WHERE email = $1),
  $5,  -- secure random token
  NOW() + INTERVAL '7 days',
  NOW()
);

-- 3. Log invite action
INSERT INTO platform.audit_log (
  event_type,
  actor_user_id,
  target_type,
  target_id,
  metadata,
  created_at
) VALUES (
  'admin_user_invited',
  $4,
  'admin_user',
  (SELECT id FROM auth.admin_users WHERE email = $1)::TEXT,
  jsonb_build_object('email', $1, 'role', $3),
  NOW()
);
```

**Data Source:** **NestJS API** ’ PostgreSQL

---

**Endpoint 5:** `PUT /api/platform/security/users/:id/role`

**Authorization:** Platform Admin only

**Request Body:**
```json
{
  "role": "Ops Engineer"
}
```

**Response:**
```json
{
  "success": true,
  "userId": 3,
  "newRole": "Ops Engineer",
  "auditId": "uuid"
}
```

**PostgreSQL Transaction:**
```sql
-- Update user role
UPDATE auth.admin_users
SET
  role = $2,
  updated_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL
RETURNING *;

-- Log role change
INSERT INTO platform.audit_log (
  event_type,
  actor_user_id,
  target_type,
  target_id,
  metadata,
  created_at
) VALUES (
  'admin_role_changed',
  $3,  -- Acting admin user ID
  'admin_user',
  $1::TEXT,
  jsonb_build_object(
    'old_role', (SELECT role FROM auth.admin_users WHERE id = $1),
    'new_role', $2
  ),
  NOW()
);
```

**Data Source:** **NestJS API** ’ PostgreSQL

---

**Endpoint 6:** `POST /api/platform/security/users/:id/revoke`

**Authorization:** Platform Admin only

**Request:** Empty body

**Response:**
```json
{
  "success": true,
  "userId": 3,
  "sessionsTerminated": 2,
  "auditId": "uuid"
}
```

**PostgreSQL Transaction:**
```sql
-- 1. Revoke user access
UPDATE auth.admin_users
SET
  status = 'revoked',
  deleted_at = NOW()
WHERE id = $1
RETURNING *;

-- 2. Terminate all active sessions
UPDATE auth.sessions
SET expires_at = NOW()
WHERE user_id = $1
  AND user_type = 'admin'
  AND expires_at > NOW()
RETURNING id;

-- 3. Log revocation
INSERT INTO platform.audit_log (
  event_type,
  actor_user_id,
  target_type,
  target_id,
  metadata,
  created_at
) VALUES (
  'admin_user_revoked',
  $2,  -- Acting admin user ID
  'admin_user',
  $1::TEXT,
  jsonb_build_object(
    'sessions_terminated', (SELECT COUNT(*) FROM auth.sessions WHERE user_id = $1 AND user_type = 'admin')
  ),
  NOW()
);
```

**Data Source:** **NestJS API** ’ PostgreSQL

---

## Database Schema Requirements

### Schema Changes

**1. Create `auth.admin_users` table**

```sql
CREATE TABLE auth.admin_users (
    id SERIAL PRIMARY KEY,

    -- User Identity
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash TEXT,                          -- Hashed password (bcrypt)

    -- Role & Status
    role VARCHAR(50) NOT NULL,                   -- "Platform Admin", "Compliance Officer", "Ops Engineer", "Read Only"
    status VARCHAR(50) NOT NULL DEFAULT 'invited', -- "invited", "active", "suspended", "revoked"

    -- Security
    two_fa_enabled BOOLEAN DEFAULT false,
    two_fa_secret TEXT,                          -- TOTP secret (encrypted)

    -- Invitation
    invited_by_user_id INTEGER REFERENCES auth.admin_users(id),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_role CHECK (role IN ('Platform Admin', 'Compliance Officer', 'Ops Engineer', 'Read Only'))
);

CREATE INDEX idx_admin_users_email ON auth.admin_users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_admin_users_role ON auth.admin_users(role);
CREATE INDEX idx_admin_users_status ON auth.admin_users(status);

COMMENT ON TABLE auth.admin_users IS 'Admin panel user accounts with RBAC roles';
```

**2. Create `platform.security_config` table**

```sql
CREATE TABLE platform.security_config (
    id INTEGER PRIMARY KEY DEFAULT 1,  -- Single-row config

    -- Session Management
    session_timeout_minutes INTEGER NOT NULL DEFAULT 480,  -- 8 hours

    -- Authentication Policy
    force_two_fa BOOLEAN DEFAULT true,
    min_password_length INTEGER NOT NULL DEFAULT 12,
    require_special_chars BOOLEAN DEFAULT true,
    max_login_attempts INTEGER NOT NULL DEFAULT 5,

    -- Access Control
    ip_allowlist_enabled BOOLEAN DEFAULT false,

    -- Audit & Compliance
    audit_retention_years INTEGER NOT NULL DEFAULT 7,

    -- Metadata
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id INTEGER REFERENCES auth.admin_users(id),
    deleted_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT single_row_config CHECK (id = 1),
    CONSTRAINT session_timeout_positive CHECK (session_timeout_minutes > 0),
    CONSTRAINT min_password_valid CHECK (min_password_length BETWEEN 8 AND 128),
    CONSTRAINT max_login_attempts_positive CHECK (max_login_attempts > 0),
    CONSTRAINT audit_retention_positive CHECK (audit_retention_years > 0)
);

-- Insert default configuration
INSERT INTO platform.security_config (
    id,
    session_timeout_minutes,
    force_two_fa,
    min_password_length,
    require_special_chars,
    max_login_attempts,
    ip_allowlist_enabled,
    audit_retention_years
) VALUES (
    1,
    480,
    true,
    12,
    true,
    5,
    false,
    7
);

COMMENT ON TABLE platform.security_config IS 'Platform-wide security and authentication policy (single row)';
```

**3. Create `platform.ip_allowlist` table**

```sql
CREATE TABLE platform.ip_allowlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- IP/CIDR Block
    ip_cidr VARCHAR(50) NOT NULL,  -- "41.210.0.0/16", "196.0.0.0/8"

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id INTEGER REFERENCES auth.admin_users(id),
    deleted_at TIMESTAMPTZ,

    -- Unique constraint for active IPs
    CONSTRAINT unique_active_ip UNIQUE (ip_cidr) WHERE (deleted_at IS NULL)
);

CREATE INDEX idx_ip_allowlist_cidr ON platform.ip_allowlist(ip_cidr) WHERE deleted_at IS NULL;

-- Seed data
INSERT INTO platform.ip_allowlist (ip_cidr) VALUES
  ('41.210.0.0/16'),   -- Uganda telecom
  ('196.0.0.0/8');     -- Africa ISPs

COMMENT ON TABLE platform.ip_allowlist IS 'Allowed IP addresses for admin panel access (CIDR notation)';
```

**4. Create `auth.sessions` table** (if not exists)

```sql
CREATE TABLE auth.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- User Reference
    user_id INTEGER NOT NULL,  -- References auth.admin_users(id) or auth.users(id)
    user_type VARCHAR(20) NOT NULL,  -- "admin" or "customer"

    -- Session Data
    token TEXT NOT NULL UNIQUE,      -- Session token (hashed)
    ip_address INET NOT NULL,
    user_agent TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Constraints
    CONSTRAINT valid_user_type CHECK (user_type IN ('admin', 'customer'))
);

CREATE INDEX idx_sessions_token ON auth.sessions(token);
CREATE INDEX idx_sessions_user ON auth.sessions(user_id, user_type);
CREATE INDEX idx_sessions_expiry ON auth.sessions(expires_at);

COMMENT ON TABLE auth.sessions IS 'Active user sessions for both admin and customer users';
```

**5. Create `auth.invite_tokens` table**

```sql
CREATE TABLE auth.invite_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES auth.admin_users(id),

    -- Token Data
    token TEXT NOT NULL UNIQUE,      -- Secure random token
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invite_tokens_token ON auth.invite_tokens(token);
CREATE INDEX idx_invite_tokens_user ON auth.invite_tokens(user_id);

COMMENT ON TABLE auth.invite_tokens IS 'Admin user invitation tokens (7-day expiry)';
```

**6. Create `auth.login_attempts` table**

```sql
CREATE TABLE auth.login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Attempt Data
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,              -- "invalid_password", "account_locked", etc.

    -- Timestamp
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email ON auth.login_attempts(email, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip ON auth.login_attempts(ip_address, attempted_at DESC);

-- Auto-cleanup old attempts (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.login_attempts
  WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE auth.login_attempts IS 'Login attempt history for security monitoring';
```

---

## Multi-Exchange Context

### **NOT APPLICABLE - Platform-Level Configuration**

Security configuration is **platform-level**, not exchange-specific:
- Admin users have platform-wide access (not scoped to individual exchanges)
- Authentication policies apply uniformly to all admin logins
- IP allowlist protects the entire admin panel
- Session timeouts apply to all admin sessions regardless of which exchange they're managing

**No exchange field needed** in security configuration.

---

## Summary: Security Settings Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|----------------------|
| **Admin Users** | NestJS API | HTTP REST | On page load | Platform-wide admin accounts |
| **Security Config** | NestJS API | HTTP REST | On page load | Single-row configuration |
| **Save Config** | NestJS API | HTTP PUT | On action | Updates policy + IP allowlist |
| **Invite Admin** | NestJS API | HTTP POST | On action | Sends invite email with token |
| **Update Role** | NestJS API | HTTP PUT | On action | Changes user role |
| **Revoke Access** | NestJS API | HTTP POST | On action | Terminates sessions + soft delete |

**Schema Changes Required:**
1.  Create `auth.admin_users` table for admin accounts
2.  Create `platform.security_config` table (single-row policy)
3.  Create `platform.ip_allowlist` table for firewall rules
4.  Create `auth.sessions` table for session management
5.  Create `auth.invite_tokens` table for admin invitations
6.  Create `auth.login_attempts` table for brute-force protection

**No Real-Time WebSocket Required** - Static configuration, updated manually by admins

---

## Frontend Implementation Notes

### API Integration

```typescript
// Fetch security data on page load
const { data: users } = await fetch('/api/platform/security/users');
const { data: config } = await fetch('/api/platform/security/config');

// Save security config
const handleSave = async (updatedConfig) => {
  const response = await fetch('/api/platform/security/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedConfig)
  });

  if (response.ok) {
    toast.success('Security configuration updated');
    setDirty(false);
  }
};

// Invite admin user
const handleInvite = async (email, name, role) => {
  const response = await fetch('/api/platform/security/users/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, role })
  });

  if (response.ok) {
    const { inviteUrl } = await response.json();
    toast.success(`Invite sent to ${email}`);
    // Optionally copy invite URL to clipboard
  }
};

// Revoke admin access
const handleRevoke = async (userId) => {
  if (!confirm('Revoke access for this admin? All active sessions will be terminated.')) {
    return;
  }

  const response = await fetch(`/api/platform/security/users/${userId}/revoke`, {
    method: 'POST'
  });

  if (response.ok) {
    toast.success('Admin access revoked');
    refreshUsers();
  }
};
```

### IP Validation

```typescript
// Validate CIDR notation
const validateCIDR = (ip: string): boolean => {
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (!cidrRegex.test(ip)) return false;

  const [ipPart, maskPart] = ip.split('/');
  const octets = ipPart.split('.').map(Number);

  // Validate octets (0-255)
  if (octets.some(octet => octet < 0 || octet > 255)) return false;

  // Validate CIDR mask (0-32)
  if (maskPart) {
    const mask = Number(maskPart);
    if (mask < 0 || mask > 32) return false;
  }

  return true;
};
```

---

## Security Considerations

### 1. **IP Allowlist Enforcement**

Backend middleware checks incoming requests:

```typescript
// NestJS Middleware
@Injectable()
export class IPAllowlistMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const config = await this.getSecurityConfig();

    if (!config.ipAllowlistEnabled) {
      return next();
    }

    const clientIP = req.ip;
    const allowedIPs = await this.getIPAllowlist();

    const isAllowed = allowedIPs.some(cidr => {
      return ipInRange(clientIP, cidr);
    });

    if (!isAllowed) {
      throw new ForbiddenException('IP address not in allowlist');
    }

    next();
  }
}
```

### 2. **2FA Enforcement**

Login flow checks 2FA requirement:

```typescript
// Login endpoint
if (config.forceTwoFA && !user.twoFAEnabled) {
  return {
    error: 'two_fa_required',
    message: '2FA setup required before login'
  };
}
```

### 3. **Brute-Force Protection**

Track failed login attempts:

```typescript
// Check login attempts
const recentAttempts = await db.query(`
  SELECT COUNT(*) as attempts
  FROM auth.login_attempts
  WHERE email = $1
    AND success = false
    AND attempted_at > NOW() - INTERVAL '15 minutes'
`, [email]);

if (recentAttempts.attempts >= config.maxLoginAttempts) {
  throw new ForbiddenException('Account temporarily locked due to multiple failed login attempts');
}
```

### 4. **Session Timeout Enforcement**

Background job expires inactive sessions:

```typescript
// Cron job (runs every 5 minutes)
@Cron('*/5 * * * *')
async expireInactiveSessions() {
  const config = await this.getSecurityConfig();

  await db.query(`
    UPDATE auth.sessions
    SET expires_at = NOW()
    WHERE last_activity < NOW() - INTERVAL '${config.sessionTimeoutMinutes} minutes'
      AND expires_at > NOW()
  `);
}
```

---

## Performance Considerations

1. **Admin User Count**: Typically <100 admins, no pagination needed
2. **IP Allowlist**: Cached in Redis for fast middleware checks
3. **Security Config**: Single-row, cached in memory
4. **Session Queries**: Indexed on `(user_id, user_type, expires_at)`
5. **Login Attempts**: Auto-cleanup old records (30+ days)

---

## Testing Checklist

- [ ] Admin users list loads correctly
- [ ] 2FA status badge displays correctly
- [ ] Active sessions count is accurate
- [ ] Role dropdown updates user role
- [ ] Invite admin sends email with valid token
- [ ] Revoke access terminates all sessions
- [ ] Security config saves successfully
- [ ] IP allowlist validates CIDR notation
- [ ] Invalid IP format shows error
- [ ] Dirty state tracking works
- [ ] Force 2FA locks out users without 2FA
- [ ] IP allowlist blocks non-whitelisted IPs
- [ ] Max login attempts locks account
- [ ] Session timeout expires inactive sessions
- [ ] Password length validation works
- [ ] Special character requirement enforced
- [ ] All actions logged in audit trail
- [ ] Non-admin users cannot access page

---

## Compliance Notes

### Audit Log Retention

The `auditRetentionYears` setting ensures compliance with financial regulations:
- **MiFID II (EU)**: Requires 7 years minimum
- **SEC Rule 17a-4 (US)**: Requires 6 years minimum
- **FCA (UK)**: Requires 5 years minimum

Platform default: **7 years** (meets strictest requirement)

### Password Policy Recommendations

Industry best practices:
- Minimum length: 12-16 characters
- Require: uppercase, lowercase, numbers, special characters
- No common passwords (check against leaked password databases)
- Enforce password expiry: 90-180 days
- Prevent password reuse: last 5-10 passwords

---

**[ Previous: Settings Billing](./22-settings-billing.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Analysis Complete ’](./00-INDEX.md)**
