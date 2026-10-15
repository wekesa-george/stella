## Page 5: `/dashboard/alerts` - Alert Management System

### UI Features & Requirements

1. **Alert Summary Cards** - Total alerts, critical count, warning count, info count
2. **Alert Feed** - Real-time scrollable list of alerts with filtering
3. **Filter System** - By severity (critical/warning/info) and acknowledgment status
4. **Search Functionality** - Search alerts by message or service name
5. **Quick Actions** - Acknowledge all, acknowledge by severity
6. **Individual Alert Actions** - Acknowledge, delete
7. **Real-time Updates** - New alerts appear automatically
8. **Exchange Filter** - Filter alerts by exchange (Binance, Bybit, OKX, etc.) **(ADDED for multi-exchange)**

---

### Data Source Mapping

| Component | Data Source | Endpoint/Channel | Update Frequency | Notes |
|-----------|-------------|------------------|------------------|-------|
| **Alert Feed** | NestJS API + Phoenix Channel | `GET /api/alerts` + Channel `alerts:platform` | Initial + Real-time | Historical from API, new alerts via WS |
| **Alert Summary Stats** | Client-side Derived | Calculated from alert list | Real-time | Count by severity & status |
| **Acknowledge Alert** | NestJS API | `POST /api/alerts/:id/acknowledge` | On user action | Updates database & broadcasts |
| **Delete Alert** | NestJS API | `DELETE /api/alerts/:id` | On user action | Soft delete recommended |
| **Acknowledge All** | NestJS API | `POST /api/alerts/acknowledge-bulk` | On user action | Bulk update operation |
| **Search/Filter** | Client-side | N/A | Instant | Filters already-loaded alerts |

---

### Phoenix Channel: `AlertChannel`

**Topic:** `alerts:platform` (Global alerts) or `alerts:user:{user_id}` (User-scoped alerts)

**Purpose:** Broadcast new alerts and acknowledgment updates in real-time

#### WebSocket Event Schemas

**1. Client → Server: Join Channel**

```typescript
// Join the alerts channel
channel.join()
  .receive("ok", (response) => {
    console.log("Joined alerts channel", response);
  });
```

**2. Server → Client: New Alert**

```typescript
interface NewAlertPayload {
  id: number;                           // Alert ID
  msg: string;                          // Alert message
  sev: "critical" | "warning" | "info"; // Severity level
  service: string;                      // Service that generated alert
  time: string;                         // ISO 8601 timestamp
  acked: boolean;                       // Acknowledgment status (always false for new)
  metadata?: {
    bot_id?: string;                    // If bot-related
    user_id?: string;                   // Affected user
    metric_value?: number;              // Threshold value
    threshold?: number;                 // Configured threshold
  };
}
```

**Event Name:** `new_alert`

**Example:**
```typescript
channel.on("new_alert", (payload: NewAlertPayload) => {
  // Add new alert to the top of the list
  setAlerts(prev => [payload, ...prev]);

  // Show browser notification for critical alerts
  if (payload.sev === "critical") {
    new Notification("Critical Alert", {
      body: payload.msg
    });
  }
});
```

**3. Server → Client: Alert Acknowledged**

```typescript
interface AlertAcknowledgedPayload {
  id: number;                 // Alert ID
  acked: boolean;             // true
  acked_by: string;           // User ID who acknowledged
  acked_at: string;           // ISO 8601 timestamp
}
```

**Event Name:** `alert_acknowledged`

**Example:**
```typescript
channel.on("alert_acknowledged", (payload: AlertAcknowledgedPayload) => {
  setAlerts(prev =>
    prev.map(alert =>
      alert.id === payload.id
        ? { ...alert, acked: true }
        : alert
    )
  );
});
```

**4. Server → Client: Alert Deleted**

```typescript
interface AlertDeletedPayload {
  id: number;  // Alert ID that was deleted
}
```

**Event Name:** `alert_deleted`

**Example:**
```typescript
channel.on("alert_deleted", (payload: AlertDeletedPayload) => {
  setAlerts(prev => prev.filter(alert => alert.id !== payload.id));
});
```

**5. Client → Server: Acknowledge Alert**

```typescript
// Send acknowledgment request via channel (alternative to REST API)
channel.push("acknowledge_alert", { alert_id: 123 })
  .receive("ok", () => console.log("Alert acknowledged"))
  .receive("error", (err) => console.error("Failed to ack", err));
```

---

### NestJS REST API Endpoints

#### 1. Get Alerts List

**Endpoint:** `GET /api/alerts`

**Query Parameters:**
- `severity` - Filter by severity (critical, warning, info)
- `acked` - Filter by acknowledgment status (true, false)
- `service` - Filter by service name
- `from` - Start date (ISO 8601)
- `to` - End date (ISO 8601)
- `limit` - Number of results (default: 100, max: 1000)
- `offset` - Pagination offset

**Response:**
```json
{
  "alerts": [
    {
      "id": 1247,
      "msg": "Bot BOT-0012 CPU > 85%",
      "sev": "critical",
      "service": "botWorker",
      "time": "2026-02-21T14:23:12Z",
      "acked": false,
      "metadata": {
        "bot_id": "BOT-0012",
        "metric_value": 87.3,
        "threshold": 85.0
      }
    },
    {
      "id": 1246,
      "msg": "Postgres RAM at 79%",
      "sev": "warning",
      "service": "postgres",
      "time": "2026-02-21T14:18:45Z",
      "acked": true,
      "acked_by": "user_123",
      "acked_at": "2026-02-21T14:20:00Z"
    }
  ],
  "total": 247,
  "unacked_count": 12
}
```

#### 2. Acknowledge Single Alert

**Endpoint:** `POST /api/alerts/:id/acknowledge`

**Request Body:** (Optional)
```json
{
  "note": "Resolved by restarting bot"
}
```

**Response:**
```json
{
  "success": true,
  "alert": {
    "id": 1247,
    "acked": true,
    "acked_by": "user_123",
    "acked_at": "2026-02-21T14:30:00Z"
  }
}
```

**Side Effects:**
- Updates `trading.alerts` table `acked` column
- Broadcasts `alert_acknowledged` event via Phoenix Channel
- Creates audit log entry

#### 3. Bulk Acknowledge Alerts

**Endpoint:** `POST /api/alerts/acknowledge-bulk`

**Request Body:**
```json
{
  "severity": "critical",  // Optional: acknowledge all of this severity
  "alert_ids": [1, 2, 3]   // Optional: specific alert IDs
}
```

**Response:**
```json
{
  "success": true,
  "acknowledged_count": 3
}
```

#### 4. Delete Alert

**Endpoint:** `DELETE /api/alerts/:id`

**Response:**
```json
{
  "success": true
}
```

**Note:** Recommend soft delete (set `deleted_at` timestamp) for audit purposes

---

### Database Schema Requirements

#### Current Schema: `trading.alerts`

From `stella-database.sql`:
```sql
CREATE TYPE trading.alert_status AS ENUM ('active', 'acknowledged', 'dismissed');
CREATE TYPE trading.alert_severity AS ENUM ('info', 'warning', 'critical');

CREATE TABLE trading.alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(100) NOT NULL,
    severity trading.alert_severity NOT NULL DEFAULT 'info',
    message TEXT,
    source VARCHAR(100),
    bot_id UUID REFERENCES trading.bots(bot_id),
    user_id UUID REFERENCES auth.users(user_id),
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status trading.alert_status NOT NULL DEFAULT 'active',
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES auth.users(user_id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Schema Analysis

✅ **Already Supported:**
- Alert severity levels (info, warning, critical)
- Acknowledgment tracking (`acknowledged_at`, `acknowledged_by`)
- Alert status enum includes 'acknowledged'
- Metadata JSONB for flexible data
- Bot and user foreign keys
- Timestamps

❌ **Missing Fields:**
- `deleted_at` - For soft deletes (audit trail)
- Index on `status` for filtering unacknowledged alerts
- Index on `severity` for severity-based queries
- Index on `triggered_at` for time-range queries

#### Recommended Schema Updates

```sql
-- Add soft delete support
ALTER TABLE trading.alerts
ADD COLUMN deleted_at TIMESTAMPTZ;

-- Add indexes for performance
CREATE INDEX idx_alerts_status ON trading.alerts(status) WHERE status = 'active';
CREATE INDEX idx_alerts_severity ON trading.alerts(severity);
CREATE INDEX idx_alerts_triggered_at ON trading.alerts(triggered_at DESC);
CREATE INDEX idx_alerts_unacknowledged ON trading.alerts(status, severity, triggered_at)
  WHERE status = 'active';

-- Composite index for common queries
CREATE INDEX idx_alerts_active_by_severity ON trading.alerts(severity, triggered_at DESC)
  WHERE status = 'active' AND deleted_at IS NULL;
```

---

### Phoenix GenServer: `AlertManager`

**Purpose:** Monitor system metrics and generate alerts based on thresholds

**Responsibilities:**
1. Subscribe to relevant PubSub topics (bot metrics, infrastructure metrics)
2. Evaluate alert rules against incoming data
3. Create alerts when thresholds are breached
4. Insert alerts into PostgreSQL `trading.alerts` table
5. Broadcast new alerts via `AlertChannel`
6. Handle alert acknowledgment requests

**Example Implementation:**

```elixir
defmodule TradeEngine.Alerts.Manager do
  use GenServer
  require Logger
  alias TradeEngine.Repo
  alias TradeEngine.Schema.Alert
  alias Phoenix.PubSub

  @alert_rules %{
    bot_cpu: %{threshold: 85.0, severity: :critical},
    bot_ram: %{threshold: 90.0, severity: :warning},
    postgres_ram: %{threshold: 80.0, severity: :warning},
    heartbeat_miss: %{threshold: 60, severity: :critical}  # seconds
  }

  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(state) do
    # Subscribe to metrics channels
    :ok = PubSub.subscribe(TradeEngine.PubSub, "bot_metrics")
    :ok = PubSub.subscribe(TradeEngine.PubSub, "infra_metrics")

    {:ok, state}
  end

  def handle_info({:bot_metrics, bot_id, metrics}, state) do
    # Check CPU threshold
    if metrics.cpu > @alert_rules.bot_cpu.threshold do
      create_alert(%{
        alert_type: "bot_cpu_high",
        severity: @alert_rules.bot_cpu.severity,
        message: "Bot #{bot_id} CPU > #{@alert_rules.bot_cpu.threshold}%",
        source: "botWorker",
        bot_id: bot_id,
        metadata: %{
          metric_value: metrics.cpu,
          threshold: @alert_rules.bot_cpu.threshold
        }
      })
    end

    {:noreply, state}
  end

  def handle_info({:heartbeat_missed, bot_id, seconds_since_last}, state) do
    if seconds_since_last > @alert_rules.heartbeat_miss.threshold do
      create_alert(%{
        alert_type: "heartbeat_missed",
        severity: @alert_rules.heartbeat_miss.severity,
        message: "BOT-#{bot_id} heartbeat missed",
        source: bot_id,
        bot_id: bot_id,
        metadata: %{seconds_since_last: seconds_since_last}
      })
    end

    {:noreply, state}
  end

  defp create_alert(attrs) do
    # Insert into database
    changeset = Alert.changeset(%Alert{}, attrs)

    case Repo.insert(changeset) do
      {:ok, alert} ->
        # Broadcast to WebSocket channel
        TradeEngineWeb.Endpoint.broadcast("alerts:platform", "new_alert", %{
          id: alert.alert_id,
          msg: alert.message,
          sev: alert.severity,
          service: alert.source,
          time: DateTime.to_iso8601(alert.triggered_at),
          acked: false,
          metadata: alert.metadata
        })

        Logger.info("Alert created: #{alert.message}")

      {:error, changeset} ->
        Logger.error("Failed to create alert: #{inspect(changeset.errors)}")
    end
  end

  # Public API for acknowledgment
  def acknowledge_alert(alert_id, user_id) do
    GenServer.call(__MODULE__, {:acknowledge, alert_id, user_id})
  end

  def handle_call({:acknowledge, alert_id, user_id}, _from, state) do
    alert = Repo.get(Alert, alert_id)

    changeset = Alert.changeset(alert, %{
      status: :acknowledged,
      acknowledged_at: DateTime.utc_now(),
      acknowledged_by: user_id
    })

    case Repo.update(changeset) do
      {:ok, updated_alert} ->
        # Broadcast acknowledgment
        TradeEngineWeb.Endpoint.broadcast("alerts:platform", "alert_acknowledged", %{
          id: alert_id,
          acked: true,
          acked_by: user_id,
          acked_at: DateTime.to_iso8601(updated_alert.acknowledged_at)
        })

        {:reply, {:ok, updated_alert}, state}

      {:error, changeset} ->
        {:reply, {:error, changeset}, state}
    end
  end
end
```

---

### Alert Rule Configuration

**Recommended Alert Thresholds:**

| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| Bot CPU Usage | > 85% | Critical | Auto-kill if > 95% for 2 minutes |
| Bot RAM Usage | > 90% | Warning | Monitor |
| Bot Heartbeat Miss | > 60s | Critical | Mark bot as failed |
| Postgres RAM | > 80% | Warning | Scale or restart |
| Postgres CPU | > 90% | Critical | Investigate queries |
| RabbitMQ Queue Depth | > 10,000 | Warning | Check consumers |
| Redis Memory | > 85% | Warning | Clear cache |
| Position Drawdown | > 8% | Warning | Risk management alert |
| Win Rate Drop | < 40% | Info | Strategy review needed |

---

### Data Flow Summary

```
1. ALERT GENERATION
   AlertManager monitors metrics → Threshold breached → Insert to PostgreSQL → Broadcast via Phoenix Channel

2. ALERT LIST LOAD (Initial)
   Frontend → NestJS API GET /api/alerts → Query PostgreSQL → Return JSON

3. NEW ALERTS (Real-time)
   Phoenix AlertChannel → Broadcast "new_alert" → Frontend appends to list

4. ACKNOWLEDGE ALERT
   Frontend → NestJS POST /api/alerts/:id/acknowledge → Update PostgreSQL → NestJS broadcasts via Phoenix → All clients update

5. DELETE ALERT
   Frontend → NestJS DELETE /api/alerts/:id → Soft delete in PostgreSQL → Broadcast removal → All clients remove
```

---

### Summary Table

| Component | Data Source | Protocol | Frequency | Storage |
|-----------|-------------|----------|-----------|---------|
| **Initial Alert List** | NestJS API | HTTP REST | On page load | PostgreSQL `trading.alerts` |
| **New Alerts** | Phoenix Channel | WebSocket | Real-time (event-driven) | ETS → PostgreSQL |
| **Alert Stats** | Client-side | JavaScript | Real-time | Derived from loaded data |
| **Acknowledge Alert** | NestJS API | HTTP REST | On user action | PostgreSQL |
| **Delete Alert** | NestJS API | HTTP REST | On user action | PostgreSQL (soft delete) |
| **Bulk Actions** | NestJS API | HTTP REST | On user action | PostgreSQL |

---

### Frontend Implementation Notes

**WebSocket Connection:**
```typescript
import { Socket } from "phoenix";

const socket = new Socket("/socket", {
  params: { token: userToken }
});

socket.connect();

const alertChannel = socket.channel("alerts:platform", {});

alertChannel.join()
  .receive("ok", () => console.log("Joined alerts channel"))
  .receive("error", (err) => console.error("Failed to join", err));

// Listen for new alerts
alertChannel.on("new_alert", (payload) => {
  setAlerts(prev => [payload, ...prev]);

  // Play sound for critical alerts
  if (payload.sev === "critical") {
    new Audio("/sounds/alert.mp3").play();
  }
});

// Listen for acknowledgments
alertChannel.on("alert_acknowledged", (payload) => {
  setAlerts(prev =>
    prev.map(a => a.id === payload.id ? { ...a, acked: true } : a)
  );
});
```

**API Integration:**
```typescript
// Load initial alerts
async function fetchAlerts() {
  const res = await fetch("/api/alerts?limit=100");
  const data = await res.json();
  setAlerts(data.alerts);
}

// Acknowledge alert
async function acknowledgeAlert(alertId: number) {
  await fetch(`/api/alerts/${alertId}/acknowledge`, {
    method: "POST"
  });
}

// Acknowledge all of a severity
async function acknowledgeAllBySeverity(severity: string) {
  await fetch("/api/alerts/acknowledge-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ severity })
  });
}
```

---

### Multi-Exchange Alert Support

**Exchange-Specific Alerts** may include:
- Exchange API errors or rate limiting
- Exchange connection failures
- Exchange-specific bot failures
- Position liquidations on specific exchanges
- Abnormal latency on specific exchanges

#### Schema Enhancement for Exchange Context

**Add exchange field to alerts table:**
```sql
ALTER TABLE trading.alerts
ADD COLUMN exchange_code VARCHAR(50) REFERENCES exchange.adapters(code);

-- Add index for exchange filtering
CREATE INDEX idx_alerts_exchange ON trading.alerts(exchange_code) WHERE exchange_code IS NOT NULL;
```

#### Updated Alert Interface with Exchange

```typescript
interface Alert {
  id: number;
  msg: string;
  sev: "critical" | "warning" | "info";
  service: string;
  exchange?: string;          // ADDED: Exchange code ("binance", "bybit", etc.)
  time: string;
  acked: boolean;
  metadata?: {
    bot_id?: string;
    user_id?: string;
    metric_value?: number;
    threshold?: number;
    exchange_error_code?: string;    // Exchange-specific error code
    exchange_error_message?: string; // Exchange error message
  };
}
```

#### Updated API Endpoint with Exchange Filter

**GET /api/alerts?exchange=binance**

Query parameter additions:
- `exchange` - Filter by exchange code

**PostgreSQL Query:**
```sql
SELECT
  a.alert_id as id,
  a.message as msg,
  a.severity as sev,
  a.source as service,
  a.exchange_code as exchange,
  a.triggered_at as time,
  CASE WHEN a.status = 'acknowledged' THEN true ELSE false END as acked,
  a.metadata
FROM trading.alerts a
WHERE ($1::text IS NULL OR a.exchange_code = $1)  -- Exchange filter
  AND ($2::text IS NULL OR a.severity::text = $2) -- Severity filter
  AND ($3::boolean IS NULL OR (a.status = 'acknowledged') = $3) -- Acked filter
  AND (a.deleted_at IS NULL)  -- Not deleted
ORDER BY a.triggered_at DESC
LIMIT 100;
```

#### Alert Generation Examples

**Exchange Connection Lost:**
```elixir
defmodule TradeEngine.Alerts.ExchangeMonitor do
  def handle_info({:exchange_disconnected, exchange_code}, state) do
    TradeEngine.Alerts.Manager.create_alert(%{
      alert_type: "exchange_connection_lost",
      severity: :critical,
      message: "Lost connection to #{exchange_code}",
      source: "exchange_adapter",
      exchange_code: exchange_code,
      metadata: %{
        last_heartbeat: DateTime.utc_now(),
        active_bots: count_bots_on_exchange(exchange_code),
        active_positions: count_positions_on_exchange(exchange_code)
      }
    })

    {:noreply, state}
  end
end
```

**Exchange API Rate Limit:**
```elixir
def handle_rate_limit_exceeded(exchange_code, endpoint) do
  TradeEngine.Alerts.Manager.create_alert(%{
    alert_type: "exchange_rate_limit",
    severity: :warning,
    message: "#{exchange_code} rate limit exceeded for #{endpoint}",
    source: "exchange_adapter",
    exchange_code: exchange_code,
    metadata: %{
      endpoint: endpoint,
      retry_after: 60  # seconds
    }
  })
end
```

#### UI Display with Exchange Badge

```typescript
// Alert card component
function AlertCard({ alert }: { alert: Alert }) {
  return (
    <div className="alert-card">
      <span className={`severity-badge ${alert.sev}`}>{alert.sev}</span>

      {alert.exchange && (
        <span className="exchange-badge">{alert.exchange.toUpperCase()}</span>
      )}

      <p>{alert.msg}</p>
      <span className="service">{alert.service}</span>
      <span className="time">{alert.time}</span>
    </div>
  );
}

// Filter component with exchange dropdown
function ExchangeFilter({ value, onChange }) {
  const exchanges = ["all", "binance", "bybit", "okx", "kraken"];

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {exchanges.map(ex => (
        <option key={ex} value={ex}>
          {ex === "all" ? "All Exchanges" : ex.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
```

#### Alert Summary by Exchange

Show alert counts per exchange:

```typescript
interface AlertSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  byExchange: {
    [exchange: string]: {
      total: number;
      critical: number;
      warning: number;
    };
  };
}
```

**API Endpoint:** `GET /api/alerts/summary`

**Response:**
```json
{
  "total": 47,
  "critical": 5,
  "warning": 18,
  "info": 24,
  "byExchange": {
    "binance": { "total": 12, "critical": 2, "warning": 6 },
    "bybit": { "total": 8, "critical": 1, "warning": 5 },
    "okx": { "total": 15, "critical": 2, "warning": 7 }
  }
}
```

---

### Performance Considerations

1. **Alert Retention Policy** - Delete/archive alerts older than 90 days
2. **Query Optimization** - Use indexes for common filters
3. **WebSocket Scalability** - Phoenix can handle 10,000+ concurrent connections
4. **Alert Deduplication** - Don't create duplicate alerts within 5-minute window
5. **Rate Limiting** - Limit alert generation to prevent spam (max 10/minute per rule)

---

### Testing Checklist

- [ ] New alerts appear in real-time for all connected clients
- [ ] Acknowledging an alert updates all clients simultaneously
- [ ] Filtering and search work correctly
- [ ] Bulk acknowledge operations complete successfully
- [ ] Alert stats update correctly when alerts are added/removed
- [ ] Critical alerts trigger browser notifications
- [ ] Deleted alerts are removed from all clients
- [ ] Phoenix Channel reconnects automatically on disconnect
- [ ] API pagination works correctly for large alert lists
- [ ] Database indexes improve query performance

---

**[← Previous: Infrastructure](./04-infrastructure.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Shift Handoff →](./06-shift-handoff.md)**
