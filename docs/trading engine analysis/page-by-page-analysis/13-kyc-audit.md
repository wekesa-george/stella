## Page 13: `/kyc-review/audit` - KYC Audit Trail Page

### UI Features & Requirements

1. **Audit Log Table**
   - Event icon with color-coded background
   - Actor (email of admin who performed action or "system")
   - Action message (human-readable description)
   - Target (what was affected - applicant ID, provider name, region name)
   - Timestamp (relative time like "2 min ago" or absolute)
   - Hover effect on rows

2. **Filter Buttons**
   - All (show all events)
   - Decisions (manual approvals/declines)
   - Credentials (API key rotations, provider connections)
   - Routing (region configuration changes)
   - Providers (provider health, status changes)
   - Active filter highlighted

3. **Footer Information**
   - Event count ("Showing X events")
   - Retention policy notice ("Audit records are immutable and retained for 7 years per regulatory requirement")
   - Export CSV button

4. **Event Types**
   - **Override/Decisions**: Manual approvals, declines, re-verification triggers
   - **Credentials**: API key rotations, provider connections, credential updates
   - **Routing**: Region additions, routing changes, country mappings
   - **Providers**: Provider health changes, status updates, degradation alerts

---

### Data Source Mapping

| Component | Data Source | Endpoint/Channel | Update Frequency | Notes |
|-----------|-------------|------------------|------------------|-------|
| **Audit Events List** | NestJS API | `GET /api/kyc/audit` | On page load | Paginated list of audit events |
| **Filtered Events** | Client-side Filter | JavaScript filter on loaded data | Instant | No API call for filters |
| **Export CSV** | NestJS API | `GET /api/kyc/audit/export` | On button click | Downloads CSV file |

---

### NestJS REST API Endpoints

#### 1. Get KYC Audit Log

**Endpoint:** `GET /api/kyc/audit`

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50, max: 100)
- `eventType` - Filter by event type (override, credential, region, provider)
- `actor` - Filter by actor email
- `startDate` - Filter events after this date (ISO 8601)
- `endDate` - Filter events before this date (ISO 8601)
- `targetType` - Filter by target type (kyc_record, provider, region)
- `targetId` - Filter by specific target ID

**Response:**
```json
{
  "events": [
    {
      "id": "uuid-1",
      "eventType": "override",
      "eventCategory": "kyc_decision",
      "icon": "⚑",
      "iconBg": "rgba(245,166,35,0.15)",
      "color": "#f5a623",
      "actorType": "admin",
      "actorId": "usr_admin_1",
      "actorEmail": "admin@stella.io",
      "actorName": "Admin User",
      "action": "kyc.manually_approved",
      "message": "Manually approved applicant",
      "targetType": "kyc_record",
      "targetId": "uuid-kyc-1003",
      "targetIdentifier": "KYC-1003",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "metadata": {
        "userId": "uuid-user-123",
        "previousStatus": "pending_review",
        "newStatus": "approved",
        "reason": "Document verification completed manually",
        "reviewNotes": "All documents verified by compliance team"
      },
      "createdAt": "2026-02-21T15:28:00Z"
    },
    {
      "id": "uuid-2",
      "eventType": "credential",
      "eventCategory": "provider_management",
      "icon": "🔑",
      "iconBg": "rgba(61,157,243,0.15)",
      "color": "#3d9df3",
      "actorType": "admin",
      "actorId": "usr_ops_1",
      "actorEmail": "ops@stella.io",
      "actorName": "Operations User",
      "action": "kyc.api_key_rotated",
      "message": "Rotated API key for provider",
      "targetType": "provider",
      "targetId": "sumsub",
      "targetIdentifier": "SumSub",
      "ipAddress": "192.168.1.101",
      "userAgent": "Mozilla/5.0...",
      "metadata": {
        "previousKeyLastFour": "****1234",
        "newKeyLastFour": "****5678",
        "rotationReason": "Scheduled quarterly rotation"
      },
      "createdAt": "2026-02-21T15:10:00Z"
    },
    {
      "id": "uuid-3",
      "eventType": "region",
      "eventCategory": "routing_configuration",
      "icon": "🗺",
      "iconBg": "rgba(0,229,160,0.12)",
      "color": "#00e5a0",
      "actorType": "admin",
      "actorId": "usr_ops_1",
      "actorEmail": "ops@stella.io",
      "actorName": "Operations User",
      "action": "kyc.region_created",
      "message": "Added West Africa region mapped to",
      "targetType": "region",
      "targetId": "uuid-region-west-africa",
      "targetIdentifier": "SumSub → standard-kyc",
      "ipAddress": "192.168.1.101",
      "userAgent": "Mozilla/5.0...",
      "metadata": {
        "regionName": "West Africa",
        "countryCodes": ["NG", "GH", "SN", "CI"],
        "provider": "sumsub",
        "workflow": "standard-kyc"
      },
      "createdAt": "2026-02-21T14:00:00Z"
    },
    {
      "id": "uuid-4",
      "eventType": "override",
      "eventCategory": "kyc_decision",
      "icon": "✕",
      "iconBg": "rgba(255,71,87,0.15)",
      "color": "#ff4757",
      "actorType": "admin",
      "actorId": "usr_admin_1",
      "actorEmail": "admin@stella.io",
      "actorName": "Admin User",
      "action": "kyc.manually_declined",
      "message": "Manually declined applicant",
      "targetType": "kyc_record",
      "targetId": "uuid-kyc-1009",
      "targetIdentifier": "KYC-1009",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "metadata": {
        "userId": "uuid-user-456",
        "previousStatus": "pending_review",
        "newStatus": "declined",
        "declineReason": "Document mismatch",
        "reviewNotes": "Submitted documents do not match profile information"
      },
      "createdAt": "2026-02-21T12:00:00Z"
    },
    {
      "id": "uuid-5",
      "eventType": "provider",
      "eventCategory": "provider_health",
      "icon": "⚡",
      "iconBg": "rgba(167,139,250,0.15)",
      "color": "#a78bfa",
      "actorType": "system",
      "actorId": null,
      "actorEmail": "system",
      "actorName": "System Monitor",
      "action": "kyc.provider_health_degraded",
      "message": "Degraded health detected for provider",
      "targetType": "provider",
      "targetId": "onfido",
      "targetIdentifier": "Onfido",
      "ipAddress": null,
      "userAgent": null,
      "metadata": {
        "healthStatus": "degraded",
        "previousStatus": "healthy",
        "responseTime": 5000,
        "errorRate": 0.15,
        "lastHealthCheck": "2026-02-21T10:00:00Z"
      },
      "createdAt": "2026-02-21T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 847,
    "totalPages": 17
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  a.id,
  a.event_type,
  a.event_category,
  a.actor_type,
  a.actor_id,
  a.actor_email,
  a.actor_name,
  a.action,
  a.message,
  a.target_type,
  a.target_id,
  a.target_identifier,
  a.ip_address,
  a.user_agent,
  a.metadata,
  a.created_at
FROM kyc.audit_log a
WHERE ($1::text IS NULL OR a.event_type = $1)  -- Event type filter
  AND ($2::text IS NULL OR a.actor_email = $2)  -- Actor filter
  AND ($3::timestamptz IS NULL OR a.created_at >= $3)  -- Start date filter
  AND ($4::timestamptz IS NULL OR a.created_at <= $4)  -- End date filter
  AND ($5::text IS NULL OR a.target_type = $5)  -- Target type filter
  AND ($6::text IS NULL OR a.target_id::text = $6)  -- Target ID filter
ORDER BY a.created_at DESC
LIMIT $7 OFFSET $8;
```

---

#### 2. Export KYC Audit Log to CSV

**Endpoint:** `GET /api/kyc/audit/export`

**Query Parameters:** (same as GET /api/kyc/audit for filtering)

**Response:**
- Content-Type: `text/csv`
- Content-Disposition: `attachment; filename="kyc-audit-log-2026-02-21.csv"`

**CSV Format:**
```csv
Timestamp,Event Type,Actor,Action,Target,IP Address,Metadata
2026-02-21T15:28:00Z,override,admin@stella.io,Manually approved applicant,KYC-1003,192.168.1.100,"{""userId"":""uuid-user-123"",""reason"":""Document verification completed manually""}"
2026-02-21T15:10:00Z,credential,ops@stella.io,Rotated API key for provider,SumSub,192.168.1.101,"{""rotationReason"":""Scheduled quarterly rotation""}"
```

**Implementation:**
```typescript
async exportAuditLog(filters: AuditLogFilters): Promise<string> {
  const events = await this.getAuditLog(filters);

  const csv = [
    // Header row
    ['Timestamp', 'Event Type', 'Actor', 'Action', 'Target', 'IP Address', 'Metadata'].join(','),
    // Data rows
    ...events.map(e => [
      e.createdAt,
      e.eventType,
      e.actorEmail,
      e.message,
      e.targetIdentifier,
      e.ipAddress || '',
      JSON.stringify(e.metadata),
    ].join(',')),
  ].join('\n');

  return csv;
}
```

---

### Database Schema Requirements

#### New Table Required

**KYC Audit Log Table**

```sql
CREATE TABLE kyc.audit_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Event classification
    event_type          VARCHAR(50) NOT NULL,                   -- 'override', 'credential', 'region', 'provider'
    event_category      VARCHAR(50) NOT NULL,                   -- 'kyc_decision', 'provider_management', 'routing_configuration'
    -- Actor (who performed the action)
    actor_type          VARCHAR(20) NOT NULL,                   -- 'admin', 'system', 'user'
    actor_id            UUID,                                   -- References admin.admin_users(id) or auth.users(id)
    actor_email         VARCHAR(255) NOT NULL,                  -- Denormalized for permanence
    actor_name          VARCHAR(200) NOT NULL,                  -- Denormalized for permanence
    -- Action details
    action              VARCHAR(100) NOT NULL,                  -- 'kyc.manually_approved', 'kyc.api_key_rotated', etc.
    message             TEXT NOT NULL,                          -- Human-readable description
    -- Target (what was affected)
    target_type         VARCHAR(50),                            -- 'kyc_record', 'provider', 'region'
    target_id           TEXT,                                   -- UUID or identifier of affected entity
    target_identifier   VARCHAR(255),                           -- Human-readable identifier (KYC-1003, SumSub, etc.)
    -- Request context
    ip_address          INET,
    user_agent          TEXT,
    -- Detailed metadata
    metadata            JSONB DEFAULT '{}',                     -- Event-specific details
    -- Audit immutability
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_kyc_audit_log_event_type ON kyc.audit_log(event_type);
CREATE INDEX idx_kyc_audit_log_event_category ON kyc.audit_log(event_category);
CREATE INDEX idx_kyc_audit_log_actor_email ON kyc.audit_log(actor_email);
CREATE INDEX idx_kyc_audit_log_actor_id ON kyc.audit_log(actor_id);
CREATE INDEX idx_kyc_audit_log_target_type ON kyc.audit_log(target_type);
CREATE INDEX idx_kyc_audit_log_target_id ON kyc.audit_log(target_id);
CREATE INDEX idx_kyc_audit_log_created_at ON kyc.audit_log(created_at DESC);
CREATE INDEX idx_kyc_audit_log_action ON kyc.audit_log(action);

-- GIN index for metadata searches
CREATE INDEX idx_kyc_audit_log_metadata ON kyc.audit_log USING GIN(metadata);

COMMENT ON TABLE kyc.audit_log IS 'Immutable audit trail for all KYC-related actions - retained for 7 years per regulatory requirements';
COMMENT ON COLUMN kyc.audit_log.actor_email IS 'Denormalized actor email for permanence (survives admin user deletion)';
COMMENT ON COLUMN kyc.audit_log.actor_name IS 'Denormalized actor name for permanence';
COMMENT ON COLUMN kyc.audit_log.metadata IS 'Event-specific details in JSON format for extensibility';

-- Prevent updates and deletes (immutable audit log)
CREATE OR REPLACE FUNCTION kyc.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Audit log records cannot be updated';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Audit log records cannot be deleted';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_audit_log_update
BEFORE UPDATE ON kyc.audit_log
FOR EACH ROW EXECUTE FUNCTION kyc.prevent_audit_log_modification();

CREATE TRIGGER trg_prevent_audit_log_delete
BEFORE DELETE ON kyc.audit_log
FOR EACH ROW EXECUTE FUNCTION kyc.prevent_audit_log_modification();
```

#### Data Retention Policy

**7-Year Retention with Partitioning:**

```sql
-- Create partitioned table for efficient archival
CREATE TABLE kyc.audit_log (
    -- ... (same columns as above)
) PARTITION BY RANGE (created_at);

-- Create yearly partitions
CREATE TABLE kyc.audit_log_2026 PARTITION OF kyc.audit_log
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE kyc.audit_log_2027 PARTITION OF kyc.audit_log
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- ... create partitions up to 2033 (7 years)

-- Automated partition management function
CREATE OR REPLACE FUNCTION kyc.create_audit_log_partition(p_year INTEGER)
RETURNS void AS $$
DECLARE
    v_partition_name TEXT;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_partition_name := 'kyc.audit_log_' || p_year;
    v_start_date := (p_year || '-01-01')::DATE;
    v_end_date := ((p_year + 1) || '-01-01')::DATE;

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF kyc.audit_log
         FOR VALUES FROM (%L) TO (%L)',
        v_partition_name,
        v_start_date,
        v_end_date
    );

    RAISE NOTICE 'Created partition: %', v_partition_name;
END;
$$ LANGUAGE plpgsql;

-- Schedule creation of next year's partition
-- (Called by cron job or scheduled task at end of each year)
```

---

### Data Flow Summary

```
1. PAGE LOAD
   Frontend → NestJS GET /api/kyc/audit → Query kyc.audit_log → Return events list

2. FILTER EVENTS
   User clicks filter button (e.g., "Decisions")
   → Client-side filter applied to loaded events → Update displayed list (no API call)

3. EXPORT CSV
   User clicks "Export CSV" → Confirm modal → Submit
   Frontend → NestJS GET /api/kyc/audit/export → Query kyc.audit_log → Generate CSV → Download file

4. BACKGROUND: LOG AUDIT EVENT (Example)
   Admin manually approves KYC application
   → NestJS inserts record into kyc.audit_log with:
     - event_type: 'override'
     - actor_email: current admin email
     - action: 'kyc.manually_approved'
     - target_type: 'kyc_record'
     - target_id: KYC record UUID
     - metadata: { userId, previousStatus, newStatus, reason, reviewNotes }
```

---

### Summary Table

| Component | Data Source | Protocol | Frequency | Storage |
|-----------|-------------|----------|-----------|---------|
| **Audit Events List** | NestJS API | HTTP REST | On page load | PostgreSQL `kyc.audit_log` (partitioned) |
| **Filtered Events** | Client-side | JavaScript | Instant | In-memory array filter |
| **Export CSV** | NestJS API | HTTP REST | On button click | PostgreSQL query → CSV generation |

---

### Frontend Implementation Notes

**API Integration:**
```typescript
interface KYCAuditEvent {
  id: string;
  eventType: "override" | "credential" | "region" | "provider";
  eventCategory: string;
  icon: string;
  iconBg: string;
  color: string;
  actorType: "admin" | "system" | "user";
  actorId?: string;
  actorEmail: string;
  actorName: string;
  action: string;
  message: string;
  targetType: string;
  targetId: string;
  targetIdentifier: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, any>;
  createdAt: string;
}

// Load audit events
async function loadAuditEvents(filters?: {
  eventType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.eventType) params.append("eventType", filters.eventType);
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);

  const res = await fetch(`/api/kyc/audit?${params.toString()}`);
  const data = await res.json();
  setEvents(data.events);
  setPagination(data.pagination);
}

// Client-side filtering
const filteredEvents = events.filter((event) => {
  if (typeFilter === "all") return true;
  return event.eventType === typeFilter;
});

// Export to CSV
async function exportAuditLog() {
  const params = new URLSearchParams();
  if (typeFilter !== "all") params.append("eventType", typeFilter);

  const res = await fetch(`/api/kyc/audit/export?${params.toString()}`);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kyc-audit-log-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Format relative time
function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}
```

---

### Event Type Mapping

**Frontend Configuration:**
```typescript
const EVENT_TYPE_CONFIG = {
  override: {
    label: "Decisions",
    actions: {
      "kyc.manually_approved": {
        icon: "⚑",
        iconBg: "rgba(245,166,35,0.15)",
        color: "#f5a623",
      },
      "kyc.manually_declined": {
        icon: "✕",
        iconBg: "rgba(255,71,87,0.15)",
        color: "#ff4757",
      },
      "kyc.reverification_triggered": {
        icon: "↺",
        iconBg: "rgba(34,211,238,0.12)",
        color: "#22d3ee",
      },
    },
  },
  credential: {
    label: "Credentials",
    actions: {
      "kyc.api_key_rotated": {
        icon: "🔑",
        iconBg: "rgba(61,157,243,0.15)",
        color: "#3d9df3",
      },
      "kyc.provider_connected": {
        icon: "🔑",
        iconBg: "rgba(61,157,243,0.15)",
        color: "#3d9df3",
      },
    },
  },
  region: {
    label: "Routing",
    actions: {
      "kyc.region_created": {
        icon: "🗺",
        iconBg: "rgba(0,229,160,0.12)",
        color: "#00e5a0",
      },
      "kyc.region_updated": {
        icon: "🗺",
        iconBg: "rgba(0,229,160,0.12)",
        color: "#00e5a0",
      },
      "kyc.routing_changed": {
        icon: "🗺",
        iconBg: "rgba(0,229,160,0.12)",
        color: "#00e5a0",
      },
    },
  },
  provider: {
    label: "Providers",
    actions: {
      "kyc.provider_health_degraded": {
        icon: "⚡",
        iconBg: "rgba(167,139,250,0.15)",
        color: "#a78bfa",
      },
      "kyc.provider_status_changed": {
        icon: "⚡",
        iconBg: "rgba(167,139,250,0.15)",
        color: "#a78bfa",
      },
    },
  },
};
```

---

### Compliance & Regulatory Notes

**7-Year Retention Requirement:**
- Financial services regulations (MiFID II, FINRA, etc.) require KYC audit trails to be retained for 7 years
- Records must be **immutable** (no updates or deletes allowed)
- Triggers prevent modification of audit log records
- Partitioning by year enables efficient archival and compliance

**Audit Trail Requirements:**
- **Who**: Actor identification (admin email and name denormalized)
- **What**: Action performed and target affected
- **When**: Precise timestamp (UTC)
- **Where**: IP address and user agent
- **Why**: Metadata with reason and context
- **How**: Request context and method

---

### Multi-Exchange Context

**Not Applicable** - This page displays KYC/AML compliance audit trail. It does not interact with:
- Trading operations
- Exchange credentials
- Bot management
- Order execution

However, KYC audit events may indirectly affect trading:
- Manual KYC decline → User cannot access platform → Cannot trade
- Tier upgrade approval → User gains access to higher limits → Can trade larger positions
- AML watchlist match → Account suspended → All bots stopped, positions closed

---

### Testing Checklist

- [ ] Audit events list loads correctly with all fields
- [ ] Event icons and colors display correctly
- [ ] Actor names display correctly (admin email or "system")
- [ ] Timestamps display in relative format ("2 min ago")
- [ ] Filter buttons work correctly
- [ ] Active filter is highlighted
- [ ] Filtered events update instantly (client-side)
- [ ] Export CSV button works and downloads file
- [ ] CSV contains all filtered events
- [ ] Pagination works correctly (if implemented)
- [ ] Event metadata displays correctly on expand (if implemented)
- [ ] Immutability enforced (no edit/delete buttons)
- [ ] Retention notice displays in footer
- [ ] Performance acceptable with 1000+ events

---

### Recommended Enhancements

1. **Event Detail Modal**
   - Click event to view full details
   - Show complete metadata JSON
   - View request/response payloads
   - Link to related entities (user profile, KYC record)

2. **Advanced Filtering**
   - Date range picker (start/end dates)
   - Actor filter (select from admin list)
   - Target filter (by user, provider, region)
   - Combine multiple filters

3. **Real-Time Updates**
   - WebSocket channel for live audit events
   - Toast notification for new events
   - Auto-refresh every 30 seconds

4. **Search Functionality**
   - Full-text search across message, actor, target
   - Search metadata JSON fields
   - Highlight search terms in results

5. **Analytics Dashboard**
   - Event volume over time (chart)
   - Top actors by event count
   - Most common actions
   - Average events per day/week

6. **Compliance Reports**
   - Generate regulatory compliance reports
   - Filter by date range and event category
   - Include summary statistics
   - PDF export with official header

---

**[← Previous: KYC Regions](./12-kyc-regions.md)** | **[Back to Index](./00-INDEX.md)**
