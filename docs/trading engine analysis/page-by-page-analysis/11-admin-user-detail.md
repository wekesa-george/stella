## Page 11: `/admin-users/[id]` - Admin User Detail Page

### UI Features & Requirements

1. **Header Section**
   - Breadcrumb navigation (Back to Admin Users)
   - Admin avatar or initials placeholder
   - Full name display
   - Status badge (Active, Invited, Suspended, Deactivated)
   - Super Admin badge (if applicable)
   - Primary email display
   - Action buttons (Deactivate, Edit)

2. **Basic Information Panel**
   - First Name
   - Last Name
   - Email
   - Phone
   - Display Name
   - Timezone

3. **Security & Access Panel**
   - Multi-Factor Authentication status (Enabled/Disabled badge)
   - Force Password Change status
   - Last Login timestamp
   - Last Login IP address
   - Failed Login Count
   - Locked Until timestamp (or "Not Locked")

4. **Account History Panel**
   - Created At timestamp
   - Invited At timestamp
   - Activated At timestamp
   - Deactivated At timestamp (if applicable)
   - Deactivation Reason (if applicable)

5. **Roles Panel (Right Sidebar)**
   - List of assigned roles with level and system badge
   - "Add Role" button
   - Remove role button (hover to reveal)
   - Empty state if no roles assigned

6. **Quick Actions Panel (Right Sidebar)**
   - Reset Password
   - Send Email
   - View Activity Log

7. **Modals**
   - Deactivate Admin User modal (requires reason)
   - Assign Role modal (select from available roles)
   - Remove Role confirmation modal

---

### Data Source Mapping

| Component | Data Source | Endpoint/Channel | Update Frequency | Notes |
|-----------|-------------|------------------|------------------|-------|
| **Admin User Profile** | NestJS API | `GET /api/admin/admin-users/:id` | On page load | Includes basic info, security, history |
| **Assigned Roles** | NestJS API | `GET /api/admin/admin-users/:id/roles` | On page load | Returns assigned roles with metadata |
| **Available Roles** | NestJS API | `GET /api/admin/roles/available` | On modal open | Roles not yet assigned to user |
| **Deactivate Action** | NestJS API | `POST /api/admin/admin-users/:id/deactivate` | On submit | Requires reason, logs audit trail |
| **Assign Role** | NestJS API | `POST /api/admin/admin-users/:id/roles` | On submit | Assigns role, logs audit trail |
| **Remove Role** | NestJS API | `DELETE /api/admin/admin-users/:id/roles/:roleId` | On submit | Removes role, logs audit trail |
| **Reset Password** | Logto Management API | `POST /api/admin/admin-users/:id/reset-password` | On submit | Triggers password reset email |

---

### NestJS REST API Endpoints

#### 1. Get Admin User Detail

**Endpoint:** `GET /api/admin/admin-users/:id`

**Response:**
```json
{
  "id": "usr_01h8g3j9k2m4n5p6",
  "logtoUserId": "usr_abc123",
  "firstName": "Sarah",
  "lastName": "Chen",
  "email": "sarah.chen@stella.io",
  "phone": "+1 (555) 123-4567",
  "displayName": "Sarah C.",
  "timezone": "America/New_York",
  "avatarUrl": null,
  "status": "active",
  "isSuperAdmin": true,
  "mfaEnabled": true,
  "forcePasswordChange": false,
  "lastLoginAt": "2026-02-18T14:23:00Z",
  "lastLoginIp": "192.168.1.100",
  "failedLoginCount": 0,
  "lockedUntil": null,
  "createdAt": "2025-11-15T08:00:00Z",
  "invitedAt": "2025-11-14T16:00:00Z",
  "invitedBy": {
    "id": "usr_superadmin",
    "email": "admin@stella.io",
    "name": "System Admin"
  },
  "activatedAt": "2025-11-15T10:30:00Z",
  "deactivatedAt": null,
  "deactivatedBy": null,
  "deactivationReason": null
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
  au.timezone,
  au.avatar_url,
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
  au.deactivation_reason,
  au.created_at,
  -- Invited by admin
  invited_by_admin.id as invited_by_id,
  invited_by_admin.email as invited_by_email,
  invited_by_admin.first_name || ' ' || invited_by_admin.last_name as invited_by_name,
  -- Deactivated by admin
  deactivated_by_admin.id as deactivated_by_id,
  deactivated_by_admin.email as deactivated_by_email,
  deactivated_by_admin.first_name || ' ' || deactivated_by_admin.last_name as deactivated_by_name
FROM admin.admin_users au
LEFT JOIN admin.admin_users invited_by_admin ON au.invited_by = invited_by_admin.id
LEFT JOIN admin.admin_users deactivated_by_admin ON au.deactivated_by = deactivated_by_admin.id
WHERE au.id = $1;
```

---

#### 2. Get Admin User Roles

**Endpoint:** `GET /api/admin/admin-users/:id/roles`

**Response:**
```json
{
  "roles": [
    {
      "id": "role_1",
      "name": "Super Administrator",
      "code": "super_admin",
      "hierarchyLevel": 1,
      "isSystem": true,
      "assignedBy": {
        "id": "usr_superadmin",
        "email": "admin@stella.io",
        "name": "System Admin"
      },
      "assignedAt": "2025-11-15T10:30:00Z",
      "expiresAt": null
    },
    {
      "id": "role_2",
      "name": "Financial Controller",
      "code": "finance_ctrl",
      "hierarchyLevel": 3,
      "isSystem": false,
      "assignedBy": {
        "id": "usr_superadmin",
        "email": "admin@stella.io",
        "name": "System Admin"
      },
      "assignedAt": "2025-12-01T14:00:00Z",
      "expiresAt": null
    }
  ]
}
```

**PostgreSQL Query:**
```sql
SELECT
  r.id,
  r.name,
  r.code,
  r.hierarchy_level,
  r.is_system,
  aur.assigned_at,
  aur.expires_at,
  -- Assigned by admin
  assigned_by_admin.id as assigned_by_id,
  assigned_by_admin.email as assigned_by_email,
  assigned_by_admin.first_name || ' ' || assigned_by_admin.last_name as assigned_by_name
FROM admin.admin_user_roles aur
JOIN admin.roles r ON aur.role_id = r.id
LEFT JOIN admin.admin_users assigned_by_admin ON aur.assigned_by = assigned_by_admin.id
WHERE aur.admin_user_id = $1
ORDER BY r.hierarchy_level ASC;
```

---

#### 3. Get Available Roles

**Endpoint:** `GET /api/admin/roles/available?userId=:id`

**Response:**
```json
{
  "roles": [
    {
      "id": "role_3",
      "name": "Support Manager",
      "code": "support_mgr",
      "hierarchyLevel": 4,
      "isSystem": false,
      "description": "Manages customer support operations",
      "permissionCount": 12
    },
    {
      "id": "role_4",
      "name": "Content Manager",
      "code": "content_mgr",
      "hierarchyLevel": 5,
      "isSystem": false,
      "description": "Manages platform content and documentation",
      "permissionCount": 8
    }
  ]
}
```

**PostgreSQL Query:**
```sql
-- Get all active roles not assigned to this user
SELECT
  r.id,
  r.name,
  r.code,
  r.hierarchy_level,
  r.is_system,
  r.description,
  (SELECT COUNT(*) FROM admin.role_permissions WHERE role_id = r.id) as permission_count
FROM admin.roles r
WHERE r.is_active = TRUE
  AND r.id NOT IN (
    SELECT role_id FROM admin.admin_user_roles WHERE admin_user_id = $1
  )
ORDER BY r.hierarchy_level ASC;
```

---

#### 4. Deactivate Admin User

**Endpoint:** `POST /api/admin/admin-users/:id/deactivate`

**Request Body:**
```json
{
  "reason": "User resigned from company"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Admin user deactivated successfully",
  "adminUser": {
    "id": "usr_01h8g3j9k2m4n5p6",
    "status": "deactivated",
    "deactivatedAt": "2026-02-21T15:30:00Z",
    "deactivatedBy": {
      "id": "usr_current_admin",
      "email": "current.admin@stella.io",
      "name": "Current Admin"
    },
    "deactivationReason": "User resigned from company"
  }
}
```

**PostgreSQL Transaction:**
```sql
BEGIN;

-- Update admin user status
UPDATE admin.admin_users
SET
  status = 'deactivated',
  deactivated_at = NOW(),
  deactivated_by = $2,  -- Current admin user ID
  deactivation_reason = $3,
  updated_at = NOW()
WHERE id = $1;

-- Invalidate all active sessions
UPDATE admin.admin_sessions
SET is_active = FALSE
WHERE admin_user_id = $1 AND is_active = TRUE;

-- Log audit trail
INSERT INTO admin.admin_audit_log (
  admin_user_id,
  admin_email,
  admin_name,
  ip_address,
  action,
  action_category,
  target_type,
  target_id,
  target_identifier,
  description,
  severity,
  metadata
) VALUES (
  $2,  -- Current admin ID
  $4,  -- Current admin email
  $5,  -- Current admin name
  $6,  -- IP address
  'admin_user.deactivated',
  'admin_management',
  'admin_user',
  $1,  -- Target admin ID
  $7,  -- Target admin email
  'Admin user deactivated: ' || $3,
  'high',
  jsonb_build_object(
    'deactivated_user_id', $1,
    'deactivated_user_email', $7,
    'reason', $3
  )
);

COMMIT;
```

---

#### 5. Assign Role to Admin User

**Endpoint:** `POST /api/admin/admin-users/:id/roles`

**Request Body:**
```json
{
  "roleId": "role_3",
  "expiresAt": null
}
```

**Response:**
```json
{
  "success": true,
  "message": "Role assigned successfully",
  "role": {
    "id": "role_3",
    "name": "Support Manager",
    "assignedAt": "2026-02-21T15:30:00Z"
  }
}
```

**PostgreSQL Transaction:**
```sql
BEGIN;

-- Assign role
INSERT INTO admin.admin_user_roles (
  admin_user_id,
  role_id,
  assigned_by,
  assigned_at,
  expires_at
) VALUES (
  $1,  -- Target admin user ID
  $2,  -- Role ID
  $3,  -- Current admin ID
  NOW(),
  $4   -- Expiration (nullable)
);

-- Log audit trail
INSERT INTO admin.admin_audit_log (
  admin_user_id,
  admin_email,
  admin_name,
  ip_address,
  action,
  action_category,
  target_type,
  target_id,
  target_identifier,
  description,
  severity,
  metadata
) VALUES (
  $3,  -- Current admin ID
  $5,  -- Current admin email
  $6,  -- Current admin name
  $7,  -- IP address
  'admin_user.role_assigned',
  'admin_management',
  'admin_user',
  $1,  -- Target admin ID
  $8,  -- Target admin email
  'Role assigned to admin user',
  'medium',
  jsonb_build_object(
    'target_user_id', $1,
    'target_user_email', $8,
    'role_id', $2,
    'role_name', $9
  )
);

COMMIT;
```

---

#### 6. Remove Role from Admin User

**Endpoint:** `DELETE /api/admin/admin-users/:id/roles/:roleId`

**Response:**
```json
{
  "success": true,
  "message": "Role removed successfully"
}
```

**PostgreSQL Transaction:**
```sql
BEGIN;

-- Remove role
DELETE FROM admin.admin_user_roles
WHERE admin_user_id = $1 AND role_id = $2;

-- Log audit trail
INSERT INTO admin.admin_audit_log (
  admin_user_id,
  admin_email,
  admin_name,
  ip_address,
  action,
  action_category,
  target_type,
  target_id,
  target_identifier,
  description,
  severity,
  metadata
) VALUES (
  $3,  -- Current admin ID
  $4,  -- Current admin email
  $5,  -- Current admin name
  $6,  -- IP address
  'admin_user.role_removed',
  'admin_management',
  'admin_user',
  $1,  -- Target admin ID
  $7,  -- Target admin email
  'Role removed from admin user',
  'medium',
  jsonb_build_object(
    'target_user_id', $1,
    'target_user_email', $7,
    'role_id', $2,
    'role_name', $8
  )
);

COMMIT;
```

---

#### 7. Reset Admin Password

**Endpoint:** `POST /api/admin/admin-users/:id/reset-password`

**Response:**
```json
{
  "success": true,
  "message": "Password reset email sent successfully"
}
```

**Implementation:**
```typescript
async resetAdminPassword(adminUserId: string, currentAdminId: string) {
  // Get admin user
  const adminUser = await db.adminUsers.findById(adminUserId);

  if (!adminUser) {
    throw new NotFoundException('Admin user not found');
  }

  // Call Logto Management API to trigger password reset
  await logtoManagementClient.users.resetPassword({
    userId: adminUser.logtoUserId,
  });

  // Set force password change flag
  await db.adminUsers.update(adminUserId, {
    forcePasswordChange: true,
  });

  // Log audit trail
  await db.adminAuditLog.create({
    adminUserId: currentAdminId,
    action: 'admin_user.password_reset',
    targetType: 'admin_user',
    targetId: adminUserId,
    description: 'Password reset triggered',
    severity: 'high',
  });

  return { success: true, message: 'Password reset email sent successfully' };
}
```

---

### Database Schema Requirements

#### Current Schema: `admin.admin_users`

✅ **Already Supported:**
- All fields required for admin user detail page
- Self-referencing foreign keys for invited_by and deactivated_by
- Comprehensive audit fields

#### Related Tables: `admin.roles` and `admin.admin_user_roles`

✅ **Already Supported:**
```sql
CREATE TABLE admin.roles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) UNIQUE NOT NULL,
    code                VARCHAR(50) UNIQUE NOT NULL,
    description         TEXT,
    hierarchy_level     INTEGER NOT NULL,
    is_system           BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin.admin_user_roles (
    admin_user_id       UUID NOT NULL REFERENCES admin.admin_users(id) ON DELETE CASCADE,
    role_id             UUID NOT NULL REFERENCES admin.roles(id) ON DELETE CASCADE,
    assigned_by         UUID REFERENCES admin.admin_users(id),
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    PRIMARY KEY (admin_user_id, role_id)
);
```

#### Audit Logging: `admin.admin_audit_log`

✅ **Already Supported:**
```sql
CREATE TABLE admin.admin_audit_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id       UUID NOT NULL REFERENCES admin.admin_users(id),
    admin_email         VARCHAR(255) NOT NULL,
    admin_name          VARCHAR(200) NOT NULL,
    ip_address          INET,
    action              VARCHAR(100) NOT NULL,
    action_category     VARCHAR(50) NOT NULL,
    target_type         VARCHAR(50),
    target_id           UUID,
    target_identifier   VARCHAR(255),
    description         TEXT NOT NULL,
    severity            VARCHAR(20) NOT NULL,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**No Schema Changes Required** - All tables and fields exist in the current schema.

---

### Data Flow Summary

```
1. PAGE LOAD
   Frontend → NestJS GET /api/admin/admin-users/:id → Query admin.admin_users → Return admin profile
   Frontend → NestJS GET /api/admin/admin-users/:id/roles → Query admin.admin_user_roles → Return assigned roles

2. DEACTIVATE ADMIN
   User clicks "Deactivate" → Modal opens → User enters reason → Submit
   Frontend → NestJS POST /api/admin/admin-users/:id/deactivate → Update status, log audit → Return updated admin

3. ASSIGN ROLE
   User clicks "Add Role" → Modal opens → User selects role → Submit
   Frontend → NestJS POST /api/admin/admin-users/:id/roles → Insert role assignment, log audit → Return success

4. REMOVE ROLE
   User hovers over role → Clicks remove → Confirmation modal → Submit
   Frontend → NestJS DELETE /api/admin/admin-users/:id/roles/:roleId → Delete assignment, log audit → Return success

5. RESET PASSWORD
   User clicks "Reset Password" → Confirmation
   Frontend → NestJS POST /api/admin/admin-users/:id/reset-password → Logto API call, set flag, log audit → Return success

6. EDIT ADMIN
   User clicks "Edit" → Navigate to edit form (not shown in current UI)
   Frontend → Next.js router.push(`/admin-users/${adminId}/edit`)
```

---

### Summary Table

| Component | Data Source | Protocol | Frequency | Storage |
|-----------|-------------|----------|-----------|---------|
| **Admin Profile** | NestJS API | HTTP REST | On page load | PostgreSQL `admin.admin_users` |
| **Assigned Roles** | NestJS API | HTTP REST | On page load | PostgreSQL `admin.admin_user_roles` JOIN `admin.roles` |
| **Available Roles** | NestJS API | HTTP REST | On modal open | PostgreSQL `admin.roles` |
| **Deactivate Action** | NestJS API | HTTP REST | On submit | PostgreSQL `admin.admin_users`, `admin.admin_audit_log` |
| **Role Assignment** | NestJS API | HTTP REST | On submit | PostgreSQL `admin.admin_user_roles`, `admin.admin_audit_log` |
| **Password Reset** | Logto Management API | HTTP REST | On submit | Logto external service |

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
  timezone?: string;
  avatarUrl?: string;
  status: "active" | "invited" | "suspended" | "deactivated";
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  forcePasswordChange: boolean;
  lastLoginAt?: string;
  lastLoginIp?: string;
  failedLoginCount: number;
  lockedUntil?: string;
  createdAt: string;
  invitedAt?: string;
  invitedBy?: {
    id: string;
    email: string;
    name: string;
  };
  activatedAt?: string;
  deactivatedAt?: string;
  deactivatedBy?: {
    id: string;
    email: string;
    name: string;
  };
  deactivationReason?: string;
}

interface AdminRole {
  id: string;
  name: string;
  code: string;
  hierarchyLevel: number;
  isSystem: boolean;
  assignedBy?: {
    id: string;
    email: string;
    name: string;
  };
  assignedAt: string;
  expiresAt?: string;
}

// Load admin user profile
async function loadAdminUser(adminUserId: string) {
  const [profileRes, rolesRes] = await Promise.all([
    fetch(`/api/admin/admin-users/${adminUserId}`),
    fetch(`/api/admin/admin-users/${adminUserId}/roles`),
  ]);

  const profile = await profileRes.json();
  const { roles } = await rolesRes.json();

  setAdminUser(profile);
  setAssignedRoles(roles);
}

// Deactivate admin user
async function deactivateAdminUser(adminUserId: string, reason: string) {
  const res = await fetch(`/api/admin/admin-users/${adminUserId}/deactivate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    throw new Error('Failed to deactivate admin user');
  }

  const data = await res.json();
  setAdminUser(data.adminUser);
  toast.success('Admin user deactivated successfully');
}

// Assign role
async function assignRole(adminUserId: string, roleId: string) {
  const res = await fetch(`/api/admin/admin-users/${adminUserId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleId }),
  });

  if (!res.ok) {
    throw new Error('Failed to assign role');
  }

  // Reload roles
  await loadAdminUserRoles(adminUserId);
  toast.success('Role assigned successfully');
}

// Remove role
async function removeRole(adminUserId: string, roleId: string) {
  const res = await fetch(`/api/admin/admin-users/${adminUserId}/roles/${roleId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error('Failed to remove role');
  }

  // Reload roles
  await loadAdminUserRoles(adminUserId);
  toast.success('Role removed successfully');
}
```

---

### Security & Permissions

**Permission Requirements:**
- **View Admin User Detail**: Requires `admin_users.read` permission
- **Deactivate Admin User**: Requires `admin_users.deactivate` permission (restricted to super admins or specific role)
- **Assign/Remove Roles**: Requires `admin_roles.manage` permission (restricted to super admins)
- **Reset Password**: Requires `admin_users.reset_password` permission

**Super Admin Restrictions:**
- Super admins cannot deactivate themselves
- Super admins cannot remove their own super admin role
- Only super admins can grant/revoke super admin role to others

**Audit Trail Requirements:**
- All actions must be logged in `admin.admin_audit_log`
- Include actor (current admin), target (affected admin), action, reason, timestamp
- Severity levels: low, medium, high, critical

---

### Performance Considerations

1. **Page Load Optimization**
   - Fetch profile and roles in parallel using `Promise.all`
   - Cache admin profile for 5 minutes
   - Invalidate cache on status/role changes

2. **Role Assignment Optimization**
   - Load available roles only when modal opens
   - Cache available roles list
   - Use optimistic UI updates for better UX

3. **Audit Logging Performance**
   - Audit log writes happen asynchronously (non-blocking)
   - Use background job for audit log insertion
   - Index on admin_user_id, action, created_at for fast queries

---

### Multi-Exchange Context

**Not Applicable** - This page displays platform administrators (backoffice staff) who manage the platform itself. Admin users do not:
- Have exchange credentials (those belong to customer users in `auth.users`)
- Execute trades
- Manage trading bots

Admin users manage:
- Customer user accounts (`auth.users`)
- Platform configuration
- Compliance and KYC reviews
- Financial oversight
- System health and alerts

No exchange-specific data or functionality needed on this page.

---

### Testing Checklist

- [ ] Admin user profile loads correctly with all fields
- [ ] Status badge displays correctly
- [ ] Super Admin badge displays for super admins
- [ ] MFA enabled/disabled badge displays correctly
- [ ] Assigned roles load and display correctly
- [ ] "Add Role" modal loads available roles
- [ ] Assigning a role works and updates the UI
- [ ] Removing a role works and updates the UI
- [ ] Deactivate modal validates reason input
- [ ] Deactivating an admin user works and updates status
- [ ] Breadcrumb navigation works
- [ ] Quick action buttons are functional
- [ ] Responsive layout works on mobile
- [ ] Permission checks prevent unauthorized actions
- [ ] Audit logs are created for all actions
- [ ] Error handling displays user-friendly messages

---

### Recommended Enhancements

1. **Activity Log Tab**
   - Show recent actions performed by this admin
   - Query `admin.admin_audit_log` filtered by admin_user_id
   - Paginated list with date range filter

2. **Session Management**
   - Show active sessions with IP addresses and user agents
   - "Terminate Session" button to invalidate specific sessions
   - Query `admin.admin_sessions` table

3. **Permission Details**
   - Expand roles to show individual permissions
   - Permission tooltip on hover
   - Visual hierarchy of role permissions

4. **Temporary Role Grants**
   - Support for time-limited role assignments
   - Expiration date picker
   - Auto-revoke on expiration

5. **Two-Factor Reset**
   - Allow super admins to reset MFA for locked-out admins
   - Requires additional confirmation
   - Logs high-severity audit event

6. **Email Notifications**
   - Send email when deactivated
   - Send email when roles changed
   - Send email on password reset

---

**[← Previous: Admin Users List](./10-admin-users-list.md)** | **[Back to Index](./00-INDEX.md)**
