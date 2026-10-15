## Page 6: `/dashboard/shift-handoff` - Shift Handoff System

### UI Features & Requirements

1. **Current Shift Info** - Operator name, start time, duration, actions taken, incidents
2. **Platform Status Summary** - Total equity, bot status counts, critical events, total bots
3. **Shift Activity Log** - Chronological list of actions taken during shift
4. **Handoff Notes** - Free-text field for operator to document important information
5. **Watch List** - Critical items requiring attention from next operator
6. **Submit/Save Actions** - Submit handoff or save draft

---

### Data Source Mapping

| Component | Data Source | Endpoint/Channel | Update Frequency | Notes |
|-----------|-------------|------------------|------------------|-------|
| **Current Shift Info** | NestJS API | `GET /api/shift/current` | On page load | Active shift session |
| **Platform Status Summary** | Phoenix API | `GET /api/phoenix/platform/stats` | On page load | Reuses Mission Control data |
| **Shift Activity Log** | NestJS API | `GET /api/shift/activities` | On page load + Real-time | Activities from current shift |
| **New Activity Events** | Phoenix Channel | Channel `shift:activities` | Real-time | Auto-log operator actions |
| **Handoff Notes** | NestJS API | `POST /api/shift/handoff` | On submit | Stored for audit |
| **Watch List** | NestJS API | `GET /api/shift/watch-list` | On page load | Critical items flagged |
| **Save Draft** | NestJS API | `PUT /api/shift/:id/notes` | On save | Autosave every 30s |

---

### Database Schema Requirements

#### New Table: `operations.shifts`

**Purpose:** Track operator shift sessions for audit and handoff continuity

```sql
CREATE SCHEMA IF NOT EXISTS operations;

CREATE TYPE operations.shift_status AS ENUM ('active', 'completed', 'emergency_ended');

CREATE TABLE operations.shifts (
    shift_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(user_id),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration_minutes INTEGER,
    status operations.shift_status NOT NULL DEFAULT 'active',

    -- Metrics
    actions_count INTEGER DEFAULT 0,
    incidents_count INTEGER DEFAULT 0,

    -- Handoff
    handoff_notes TEXT,
    handoff_submitted_at TIMESTAMPTZ,
    handoff_received_by UUID REFERENCES auth.users(user_id),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_shifts_user_id ON operations.shifts(user_id);
CREATE INDEX idx_shifts_start_time ON operations.shifts(start_time DESC);
CREATE INDEX idx_shifts_status ON operations.shifts(status) WHERE status = 'active';
CREATE UNIQUE INDEX idx_shifts_active_user ON operations.shifts(user_id)
    WHERE status = 'active';

-- Comments
COMMENT ON TABLE operations.shifts IS 'Tracks operator shift sessions for handoff and audit';
COMMENT ON COLUMN operations.shifts.duration_minutes IS 'Calculated on shift end';
```

#### New Table: `operations.shift_activities`

**Purpose:** Log all actions taken during a shift for handoff documentation

```sql
CREATE TYPE operations.activity_priority AS ENUM ('normal', 'warning', 'critical');

CREATE TABLE operations.shift_activities (
    activity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id UUID NOT NULL REFERENCES operations.shifts(shift_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(user_id),

    -- Activity Details
    action TEXT NOT NULL,
    notes TEXT,
    priority operations.activity_priority NOT NULL DEFAULT 'normal',

    -- Related Entities
    bot_id UUID REFERENCES trading.bots(bot_id),
    alert_id UUID REFERENCES trading.alerts(alert_id),

    -- Metadata
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_shift_activities_shift_id ON operations.shift_activities(shift_id);
CREATE INDEX idx_shift_activities_created_at ON operations.shift_activities(created_at DESC);
CREATE INDEX idx_shift_activities_priority ON operations.shift_activities(priority);

-- Comments
COMMENT ON TABLE operations.shift_activities IS 'Logs all operator actions during shift for handoff';
COMMENT ON COLUMN operations.shift_activities.action IS 'Short description of action taken';
```

#### New Table: `operations.watch_list_items`

**Purpose:** Track critical items requiring attention from next shift

```sql
CREATE TYPE operations.watch_item_status AS ENUM ('active', 'resolved', 'escalated');

CREATE TABLE operations.watch_list_items (
    watch_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id UUID NOT NULL REFERENCES operations.shifts(shift_id),
    created_by UUID NOT NULL REFERENCES auth.users(user_id),

    -- Item Details
    title TEXT NOT NULL,
    description TEXT,
    priority operations.activity_priority NOT NULL DEFAULT 'warning',
    status operations.watch_item_status NOT NULL DEFAULT 'active',

    -- Related Entities
    bot_id UUID REFERENCES trading.bots(bot_id),
    service_name VARCHAR(100),  -- For infrastructure items

    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(user_id),
    resolution_notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_watch_list_shift_id ON operations.watch_list_items(shift_id);
CREATE INDEX idx_watch_list_status ON operations.watch_list_items(status) WHERE status = 'active';
CREATE INDEX idx_watch_list_priority ON operations.watch_list_items(priority);

-- Comments
COMMENT ON TABLE operations.watch_list_items IS 'Critical items flagged for next shift attention';
```

---

### NestJS REST API Endpoints

#### 1. Get Current Shift

**Endpoint:** `GET /api/shift/current`

**Response:**
```json
{
  "shift": {
    "shift_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_123",
    "user": "bob.m",
    "start_time": "2026-02-21T09:00:00Z",
    "duration_minutes": 222,
    "duration_formatted": "3h 42m",
    "status": "active",
    "actions_count": 12,
    "incidents_count": 3
  }
}
```

**Note:** If no active shift exists, returns `{ "shift": null }`

#### 2. Start New Shift

**Endpoint:** `POST /api/shift/start`

**Request Body:**
```json
{
  "user_id": "user_123"
}
```

**Response:**
```json
{
  "success": true,
  "shift": {
    "shift_id": "550e8400-e29b-41d4-a716-446655440000",
    "start_time": "2026-02-21T09:00:00Z",
    "status": "active"
  }
}
```

**Validation:**
- User cannot have multiple active shifts
- Automatically ends previous shift if not properly closed

#### 3. Get Shift Activities

**Endpoint:** `GET /api/shift/activities?shift_id={shift_id}`

**Query Parameters:**
- `shift_id` - Required: Shift ID (defaults to current shift if omitted)
- `priority` - Optional: Filter by priority (normal, warning, critical)
- `limit` - Optional: Number of results (default: 50)

**Response:**
```json
{
  "activities": [
    {
      "activity_id": "abc123",
      "timestamp": "2026-02-21T14:23:12Z",
      "user": "bob.m",
      "action": "Killed bot BOT-0012",
      "notes": "CPU exceeded 95% threshold",
      "priority": "critical",
      "bot_id": "BOT-0012"
    },
    {
      "activity_id": "def456",
      "timestamp": "2026-02-21T13:45:00Z",
      "user": "bob.m",
      "action": "Paused bot BOT-0007",
      "notes": "Unusual trading pattern detected",
      "priority": "warning",
      "bot_id": "BOT-0007"
    }
  ],
  "total": 12
}
```

#### 4. Log Shift Activity

**Endpoint:** `POST /api/shift/activities`

**Request Body:**
```json
{
  "action": "Deployed new bot BOT-0019",
  "notes": "Momentum Grid strategy on BTC/USDT",
  "priority": "normal",
  "bot_id": "BOT-0019",
  "metadata": {
    "strategy": "Momentum Grid",
    "pair": "BTC/USDT"
  }
}
```

**Response:**
```json
{
  "success": true,
  "activity": {
    "activity_id": "ghi789",
    "created_at": "2026-02-21T14:30:00Z"
  }
}
```

**Side Effects:**
- Increments `actions_count` in `operations.shifts` table
- If priority is "critical", increments `incidents_count`
- Broadcasts activity via Phoenix Channel `shift:activities`

#### 5. Get Watch List

**Endpoint:** `GET /api/shift/watch-list`

**Response:**
```json
{
  "items": [
    {
      "watch_item_id": "watch_001",
      "title": "BOT-0012 - High CPU Usage",
      "description": "Consistently running above 85% CPU. Consider restarting if it hits 95%.",
      "priority": "critical",
      "status": "active",
      "bot_id": "BOT-0012",
      "created_at": "2026-02-21T14:00:00Z"
    },
    {
      "watch_item_id": "watch_002",
      "title": "Postgres RAM Trending Up",
      "description": "RAM usage at 79%. Monitor for next 30 minutes.",
      "priority": "warning",
      "status": "active",
      "service_name": "postgres",
      "created_at": "2026-02-21T14:15:00Z"
    }
  ]
}
```

#### 6. Add Watch List Item

**Endpoint:** `POST /api/shift/watch-list`

**Request Body:**
```json
{
  "title": "BOT-0007 - Intermittent Heartbeat",
  "description": "Missed 2 heartbeats in past hour. Network latency suspected.",
  "priority": "warning",
  "bot_id": "BOT-0007"
}
```

**Response:**
```json
{
  "success": true,
  "item": {
    "watch_item_id": "watch_003",
    "created_at": "2026-02-21T14:30:00Z"
  }
}
```

#### 7. Submit Handoff

**Endpoint:** `POST /api/shift/handoff`

**Request Body:**
```json
{
  "handoff_notes": "Important information for next operator:\n\n- BOT-0012 needs monitoring\n- Postgres RAM usage high\n- New bot BOT-0019 deployed successfully"
}
```

**Response:**
```json
{
  "success": true,
  "shift": {
    "shift_id": "550e8400-e29b-41d4-a716-446655440000",
    "end_time": "2026-02-21T15:00:00Z",
    "duration_minutes": 360,
    "status": "completed",
    "handoff_submitted_at": "2026-02-21T15:00:00Z"
  }
}
```

**Side Effects:**
- Updates shift status to "completed"
- Sets `end_time` to current timestamp
- Calculates and stores `duration_minutes`
- Sends notification to next shift operator (if scheduled)

#### 8. Save Handoff Draft

**Endpoint:** `PUT /api/shift/:shift_id/notes`

**Request Body:**
```json
{
  "handoff_notes": "Draft notes..."
}
```

**Response:**
```json
{
  "success": true,
  "saved_at": "2026-02-21T14:45:00Z"
}
```

**Note:** This endpoint supports autosave functionality (every 30 seconds)

---

### Phoenix Channel: `ShiftChannel`

**Topic:** `shift:activities`

**Purpose:** Broadcast shift activities in real-time to all operators

#### WebSocket Event Schemas

**1. Server → Client: New Activity Logged**

```typescript
interface ShiftActivityPayload {
  activity_id: string;
  timestamp: string;              // ISO 8601
  user: string;                   // Username
  action: string;                 // Short description
  notes: string;                  // Detailed notes
  priority: "normal" | "warning" | "critical";
  bot_id?: string;
  alert_id?: string;
}
```

**Event Name:** `new_activity`

**Example:**
```typescript
channel.on("new_activity", (payload: ShiftActivityPayload) => {
  // Add to activity log in real-time
  setShiftLogs(prev => [payload, ...prev]);

  // Increment counters
  setCurrentShift(prev => ({
    ...prev,
    actions: prev.actions + 1,
    incidents: payload.priority === "critical"
      ? prev.incidents + 1
      : prev.incidents
  }));
});
```

**2. Server → Client: Shift Ended**

```typescript
interface ShiftEndedPayload {
  shift_id: string;
  user: string;
  end_time: string;               // ISO 8601
  duration_minutes: number;
  handoff_notes?: string;
}
```

**Event Name:** `shift_ended`

**Example:**
```typescript
channel.on("shift_ended", (payload: ShiftEndedPayload) => {
  console.log(`Shift ended by ${payload.user}`);
  // Optionally refresh page or show modal
});
```

---

### Auto-Logging System

**Purpose:** Automatically create shift activity logs for important operator actions

#### Actions to Auto-Log

| Action | Trigger | Priority | Auto-Generated Message |
|--------|---------|----------|------------------------|
| **Bot Started** | `POST /api/phoenix/bots/:id/start` | Normal | "Started bot {bot_id}" |
| **Bot Stopped** | `POST /api/phoenix/bots/:id/stop` | Normal | "Stopped bot {bot_id}" |
| **Bot Paused** | `POST /api/phoenix/bots/:id/pause` | Warning | "Paused bot {bot_id}" |
| **Bot Killed** | `POST /api/phoenix/bots/:id/kill` | Critical | "Killed bot {bot_id}" |
| **Position Manually Closed** | `POST /api/trading/positions/:id/close` | Critical | "Manually closed position {position_id}" |
| **Alert Acknowledged** | `POST /api/alerts/:id/acknowledge` | Warning | "Acknowledged {severity} alert: {alert_msg}" |
| **Configuration Changed** | `PUT /api/settings/*` | Normal | "Updated {setting_name}" |
| **Bot Deployed** | `POST /api/bots` | Normal | "Deployed new bot {bot_id}" |

#### Implementation in NestJS

**Shift Activity Interceptor:**
```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ShiftService } from './shift.service';

@Injectable()
export class ShiftActivityInterceptor implements NestInterceptor {
  constructor(private shiftService: ShiftService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const route = request.route.path;
    const method = request.method;

    return next.handle().pipe(
      tap(() => {
        // Auto-log based on route
        if (method === 'POST' && route.includes('/bots/:id/start')) {
          this.shiftService.logActivity({
            action: `Started bot ${request.params.id}`,
            priority: 'normal',
            bot_id: request.params.id,
          });
        }

        if (method === 'POST' && route.includes('/bots/:id/kill')) {
          this.shiftService.logActivity({
            action: `Killed bot ${request.params.id}`,
            notes: request.body.reason || 'No reason provided',
            priority: 'critical',
            bot_id: request.params.id,
          });
        }

        // ... other route patterns
      }),
    );
  }
}
```

---

### Platform Status Summary Integration

**Reuses Data from Mission Control (Page 3):**

```typescript
// Same endpoint as Mission Control
GET /api/phoenix/platform/stats

Response:
{
  "total_equity_usd": 1247823.45,
  "total_pnl_usd": 12473.89,
  "total_bots": 18,
  "running_bots": 14,
  "paused_bots": 2,
  "error_bots": 2,
  "total_positions": 47,
  "total_users": 5
}
```

**Critical Events Count:**
```typescript
// Query recent critical/warning shift activities
GET /api/shift/activities?priority=critical,warning&since=shift_start

Response:
{
  "critical_count": 3,
  "warning_count": 5,
  "activities": [...]
}
```

---

### Data Flow Summary

```
1. SHIFT START
   Operator logs in → NestJS creates shift record → Frontend loads current shift

2. OPERATOR ACTIONS
   Operator kills bot → NestJS auto-logs activity → Broadcasts via Phoenix Channel → All operators see update

3. PLATFORM STATUS
   Frontend loads Mission Control stats → Display summary metrics

4. ACTIVITY LOG
   Frontend loads shift activities from NestJS → Subscribe to Phoenix Channel → Real-time updates appear

5. HANDOFF NOTES
   Operator types notes → Auto-save every 30s → Submit handoff → End shift → Notify next operator
```

---

### Summary Table

| Component | Data Source | Protocol | Frequency | Storage |
|-----------|-------------|----------|-----------|---------|
| **Current Shift** | NestJS API | HTTP REST | On page load | PostgreSQL `operations.shifts` |
| **Platform Status** | Phoenix API | HTTP REST | On page load | ETS cache (from Mission Control) |
| **Activity Log** | NestJS API + Phoenix Channel | HTTP REST + WebSocket | Initial + Real-time | PostgreSQL `operations.shift_activities` |
| **Watch List** | NestJS API | HTTP REST | On page load | PostgreSQL `operations.watch_list_items` |
| **Handoff Notes** | NestJS API | HTTP REST | Autosave every 30s | PostgreSQL `operations.shifts.handoff_notes` |
| **Submit Handoff** | NestJS API | HTTP REST | On submit | PostgreSQL |

---

### Frontend Implementation

**WebSocket Connection:**
```typescript
const shiftChannel = socket.channel("shift:activities", {});

shiftChannel.join()
  .receive("ok", () => console.log("Joined shift activities channel"));

shiftChannel.on("new_activity", (activity) => {
  setShiftLogs(prev => [activity, ...prev]);

  // Update counters
  setCurrentShift(prev => ({
    ...prev,
    actions: prev.actions + 1,
    incidents: activity.priority === "critical"
      ? prev.incidents + 1
      : prev.incidents
  }));
});
```

**Autosave Handoff Notes:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    if (handoffNotes) {
      saveHandoffDraft(currentShift.shift_id, handoffNotes);
    }
  }, 30000); // 30 seconds

  return () => clearInterval(interval);
}, [handoffNotes, currentShift]);

async function saveHandoffDraft(shiftId: string, notes: string) {
  await fetch(`/api/shift/${shiftId}/notes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoff_notes: notes })
  });
}
```

**Submit Handoff:**
```typescript
async function submitHandoff() {
  const res = await fetch("/api/shift/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoff_notes: handoffNotes })
  });

  if (res.ok) {
    // Show success message
    alert("Shift handoff submitted successfully");

    // Optionally redirect to dashboard
    router.push("/dashboard/mission-control");
  }
}
```

---

### Performance Considerations

1. **Activity Log Pagination** - Limit to last 50 activities per shift
2. **Shift History Retention** - Archive shifts older than 1 year
3. **Autosave Throttling** - Debounce autosave to prevent excessive DB writes
4. **Watch List Limit** - Max 20 active watch list items per shift
5. **Real-time Broadcasting** - Use Phoenix PubSub for scalability

---

### Multi-Exchange Context in Shift Handoff

While shift handoff is primarily exchange-agnostic (focused on operator actions), exchange context should be included in:

#### 1. Activity Log with Exchange Context

```sql
ALTER TABLE operations.shift_activities
ADD COLUMN exchange_code VARCHAR(50) REFERENCES exchange.adapters(code);

CREATE INDEX idx_shift_activities_exchange ON operations.shift_activities(exchange_code);
```

#### 2. Updated Activity Interface

```typescript
interface ShiftActivity {
  id: string;
  time: string;
  action: string;
  notes?: string;
  priority: "normal" | "warning" | "critical";
  botId?: string;
  alertId?: string;
  exchange?: string;  // ADDED: Exchange context
  metadata?: {
    exchange_error?: string;
    exchange_status?: string;
  };
}
```

#### 3. Watch List with Exchange Filter

```typescript
interface WatchListItem {
  id: string;
  type: "bot" | "alert" | "position" | "exchange";
  title: string;
  description: string;
  exchange?: string;  // ADDED: For exchange-specific items
  priority: "high" | "medium" | "low";
  status: "open" | "resolved";
  createdAt: string;
}
```

#### 4. Activity Log Examples with Exchange

**Example: Exchange connection restored**
```json
{
  "action": "Restored Binance connection",
  "exchange": "binance",
  "priority": "warning",
  "notes": "Connection lost at 14:23, restored after restart at 14:25",
  "metadata": {
    "downtime_minutes": 2,
    "affected_bots": 12
  }
}
```

**Example: Bot killed on specific exchange**
```json
{
  "action": "Killed BOT-0045 due to repeated errors",
  "exchange": "bybit",
  "botId": "uuid-bot-0045",
  "priority": "critical",
  "notes": "Bot was stuck in error loop with Bybit API rate limiting"
}
```

#### 5. Platform Status Summary by Exchange

Include exchange breakdown in platform status:

```json
{
  "totalEquity": 542300.50,
  "totalBots": 82,
  "criticalEvents": 3,
  "byExchange": {
    "binance": {
      "bots": 47,
      "positions": 142,
      "status": "healthy"
    },
    "bybit": {
      "bots": 23,
      "positions": 68,
      "status": "healthy"
    },
    "okx": {
      "bots": 12,
      "positions": 34,
      "status": "degraded"
    }
  }
}
```

**Benefits:**
- Operators can see exchange-specific issues at a glance
- Next operator knows which exchanges had problems
- Audit trail includes exchange context
- Watch list can flag exchange-specific concerns

---

### Testing Checklist

- [ ] Current shift info loads correctly
- [ ] Platform status summary displays accurate metrics
- [ ] Activity log updates in real-time when actions are taken
- [ ] Handoff notes autosave every 30 seconds
- [ ] Submit handoff ends shift and stores notes
- [ ] Watch list items can be added and resolved
- [ ] Auto-logging works for bot lifecycle actions
- [ ] Multiple operators can view the same shift activities
- [ ] Shift duration calculates correctly
- [ ] Previous shift handoff notes are accessible

---

**[← Previous: Alerts](./05-alerts.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Bot Detail →](./07-bot-detail.md)**
