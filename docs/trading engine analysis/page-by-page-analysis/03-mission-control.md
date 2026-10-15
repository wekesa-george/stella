## Page 3: `/dashboard/mission-control` - Mission Control Dashboard

### UI Mock Data Structure
```typescript
// Platform-wide aggregated stats
interface PlatformStats {
  totalEquity: number;          // Sum of all bot equity
  totalPnl: number;             // Sum of all bot P&L
  runningBots: number;          // Count of running bots
  errorBots: number;            // Count of error status bots
  totalPositions: number;       // Sum of all open positions
  unrealizedPnl: number;        // Platform unrealized P&L
}

// Infrastructure metrics (same as bot-fleet page)
interface InfraMetrics {
  phoenix: { cpu: number; ram: number; disk: number };
  postgres: { cpu: number; ram: number; disk: number };
  rabbitmq: { cpu: number; ram: number; disk: number };
  redis: { cpu: number; ram: number; disk: number };
  botWorker: { cpu: number; ram: number; disk: number };
}

// Historical resource data for graphs
interface InfraHistory {
  t: number;                    // Time index
  cpu: number;                  // CPU percentage
  ram: number;                  // RAM percentage
}

// Alerts (same as alert sidebar)
interface Alert {
  id: number;
  msg: string;
  sev: "critical" | "warning" | "info";
  service: string;
  time: string;
  acked: boolean;
}
```

### UI Features & Requirements
1. **Platform Stats Overview** - 4 stat cards (equity, bots, positions, P&L)
2. **Infrastructure Health Grid** - 5 service cards with CPU/RAM/Disk gauges
3. **Resource Usage Graph** - Bot Worker CPU/RAM over time (1 hour)
4. **Alert Sidebar** - Real-time critical/warning/info alerts
5. **Emergency Controls** - Kill all platform bots
6. **Exchange Health Indicators** - Per-exchange connection status **(ADDED for multi-exchange)**

---

### Data Source Mapping

#### **Platform Statistics**

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **totalEquity** | PostgreSQL Aggregate | `SUM(equity_snapshots.total_equity_usd)` | Every 60s | Aggregated from latest snapshots |
| **totalPnl** | PostgreSQL Aggregate | `SUM(bots.total_pnl_usd)` | Every 60s | Sum of all bot P&L |
| **runningBots** | PostgreSQL Count | `COUNT(bots WHERE status='running')` | Real-time via PubSub | Updated on bot status change |
| **errorBots** | PostgreSQL Count | `COUNT(bots WHERE status='error')` | Real-time via PubSub | Updated on bot status change |
| **totalPositions** | PostgreSQL Count | `COUNT(positions WHERE status='open')` | Real-time via PubSub | Updated on position open/close |
| **unrealizedPnl** | Calculated | Sum of position unrealized P&L | Every 1s | From PositionPnLManager |

#### **Infrastructure Metrics**

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **phoenix (cpu/ram/disk)** | Phoenix Telemetry | ETS `infra_metrics_cache` | Every 4s | From BEAM VM metrics |
| **postgres (cpu/ram/disk)** | PostgreSQL Query | `pg_stat_database`, `pg_stat_activity` | Every 4s | Native Postgres stats |
| **rabbitmq (cpu/ram/disk)** | RabbitMQ API | HTTP call to management API | Every 4s | ❌ EXTERNAL - needs setup |
| **redis (cpu/ram/disk)** | Redis INFO | `INFO server`, `INFO memory` | Every 4s | ❌ EXTERNAL - needs setup |
| **botWorker (cpu/ram/disk)** | Aggregated Bot Metrics | ETS `bot_metrics_cache` | Every 4s | Sum/avg of all bot workers |

#### **Alerts**

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **id** | PostgreSQL | `trading.monitoring_alerts.id` | On creation | ✅ EXISTS |
| **msg** | PostgreSQL | `trading.monitoring_alerts.alert_message` | On creation | ✅ EXISTS |
| **sev** | Derived | Map `alert_type` to severity | On creation | ⚠️ NEEDS mapping logic |
| **service** | PostgreSQL | `trading.monitoring_alerts.monitored_entity` or `bot_id` | On creation | ✅ EXISTS |
| **time** | PostgreSQL | `trading.monitoring_alerts.triggered_at` | On creation | ✅ EXISTS |
| **acked** | PostgreSQL | `trading.monitoring_alerts.status='triggered'` or `'acknowledged'` | On update | ⚠️ NEEDS status enum update |

---

### Data Delivery Strategy

#### **Initial Page Load (Mixed: Phoenix + NestJS)**

**Endpoint 1 (Phoenix):** `GET /api/phoenix/platform/stats`

**Why Phoenix:** Real-time aggregates from ETS cache + live bot counts

**Response:**
```json
{
  "totalEquity": 542300.50,
  "totalPnl": 12450.75,
  "runningBots": 14,
  "errorBots": 1,
  "totalPositions": 47,
  "unrealizedPnl": 3200.25,
  "timestamp": "2026-02-21T10:00:00Z"
}
```

**Phoenix Implementation:**
```elixir
defmodule TradeEngineWeb.PlatformController do
  use TradeEngineWeb, :controller

  def stats(conn, _params) do
    # Get from ETS cache (refreshed every 60s)
    stats = case :ets.lookup(:platform_stats_cache, :current) do
      [{:current, cached_stats, timestamp}] ->
        age = System.system_time(:second) - timestamp
        if age < 60, do: cached_stats, else: calculate_fresh_stats()
      [] ->
        calculate_fresh_stats()
    end

    json(conn, stats)
  end

  defp calculate_fresh_stats do
    # Aggregate from database
    %{
      totalEquity: calculate_total_equity(),
      totalPnl: calculate_total_pnl(),
      runningBots: count_bots_by_status("running"),
      errorBots: count_bots_by_status("error"),
      totalPositions: count_open_positions(),
      unrealizedPnl: calculate_total_unrealized_pnl(),
      timestamp: DateTime.utc_now()
    }
  end

  defp calculate_total_equity do
    # Get latest equity snapshot per bot
    query = """
    SELECT SUM(total_equity_usd)
    FROM (
      SELECT DISTINCT ON (bot_id) total_equity_usd
      FROM trading.equity_snapshots
      WHERE bot_id IS NOT NULL
      ORDER BY bot_id, snapshot_at DESC
    ) latest_snapshots
    """

    case Repo.query(query) do
      {:ok, %{rows: [[total]]}} -> Decimal.to_float(total || 0)
      _ -> 0.0
    end
  end

  defp calculate_total_pnl do
    Repo.one(from b in Bot, select: sum(b.total_pnl_usd)) || Decimal.new(0)
    |> Decimal.to_float()
  end

  defp count_bots_by_status(status) do
    Repo.one(from b in Bot, where: b.status == ^status, select: count(b.id))
  end

  defp count_open_positions do
    Repo.one(from p in Position, where: p.status == :open, select: count(p.id))
  end

  defp calculate_total_unrealized_pnl do
    # Sum from ETS position_pnl_cache
    :ets.tab2list(:position_pnl_cache)
    |> Enum.reduce(0.0, fn {_id, pnl, _pct, _price, _ts}, acc ->
      acc + Decimal.to_float(pnl)
    end)
  end
end
```

---

**Endpoint 2 (Phoenix):** `GET /api/phoenix/infra/metrics`

**Why Phoenix:** Real-time system metrics from BEAM VM

**Response:**
```json
{
  "phoenix": { "cpu": 24.5, "ram": 45.2, "disk": 24.1 },
  "postgres": { "cpu": 18.3, "ram": 62.4, "disk": 38.7 },
  "rabbitmq": { "cpu": 12.1, "ram": 32.5, "disk": 12.2 },
  "redis": { "cpu": 8.7, "ram": 28.9, "disk": 8.4 },
  "botWorker": { "cpu": 52.3, "ram": 71.2, "disk": 18.6 },
  "timestamp": "2026-02-21T10:00:00Z"
}
```

**Phoenix Implementation:**
```elixir
defmodule TradeEngine.Infra.Monitor do
  use GenServer

  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(_) do
    # Create ETS table for caching
    :ets.new(:infra_metrics_cache, [:named_table, :set, :public, read_concurrency: true])

    # Schedule first collection
    schedule_collection()

    {:ok, %{}}
  end

  def handle_info(:collect_metrics, state) do
    metrics = %{
      phoenix: collect_phoenix_metrics(),
      postgres: collect_postgres_metrics(),
      rabbitmq: collect_rabbitmq_metrics(),
      redis: collect_redis_metrics(),
      botWorker: collect_bot_worker_metrics(),
      timestamp: DateTime.utc_now()
    }

    # Cache in ETS
    :ets.insert(:infra_metrics_cache, {:current, metrics})

    # Broadcast to WebSocket subscribers
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "infra:metrics",
      {:infra_update, metrics}
    )

    # Schedule next collection (every 4s)
    schedule_collection()

    {:noreply, state}
  end

  defp schedule_collection do
    Process.send_after(self(), :collect_metrics, 4_000)
  end

  defp collect_phoenix_metrics do
    # BEAM VM metrics
    memory = :erlang.memory()
    stats = :erlang.statistics(:scheduler_wall_time)

    cpu = calculate_cpu_from_scheduler(stats)
    ram = memory[:total] / (1024 * 1024 * 1024) * 100 # % of 1GB
    disk = 24.1 # Static for now, would query disk usage

    %{cpu: Float.round(cpu, 1), ram: Float.round(ram, 1), disk: disk}
  end

  defp collect_postgres_metrics do
    # Query pg_stat_database
    query = """
    SELECT
      sum(numbackends) as connections,
      sum(xact_commit + xact_rollback) as transactions
    FROM pg_stat_database
    WHERE datname = current_database()
    """

    case Repo.query(query) do
      {:ok, %{rows: [[conn, txn]]}} ->
        %{
          cpu: estimate_postgres_cpu(txn),
          ram: estimate_postgres_ram(conn),
          disk: 38.7 # Static, would query actual disk
        }
      _ ->
        %{cpu: 0, ram: 0, disk: 0}
    end
  end

  defp collect_rabbitmq_metrics do
    # HTTP call to RabbitMQ management API
    # http://localhost:15672/api/nodes
    case HTTPoison.get("http://localhost:15672/api/nodes", [
      {"Authorization", "Basic " <> Base.encode64("guest:guest")}
    ]) do
      {:ok, %{body: body}} ->
        node = Jason.decode!(body) |> List.first()
        %{
          cpu: node["processors_used"] / node["processors"] * 100,
          ram: node["mem_used"] / node["mem_limit"] * 100,
          disk: node["disk_free_alarm"] |> then(&if &1, do: 80.0, else: 12.2)
        }
      _ ->
        %{cpu: 0, ram: 0, disk: 0}
    end
  end

  defp collect_redis_metrics do
    # Redis INFO command
    case Redix.command(:redix, ["INFO", "server"]) do
      {:ok, info} ->
        parse_redis_info(info)
      _ ->
        %{cpu: 0, ram: 0, disk: 0}
    end
  end

  defp collect_bot_worker_metrics do
    # Aggregate from all bot metrics in ETS
    bot_metrics = :ets.tab2list(:bot_metrics_cache)

    if Enum.empty?(bot_metrics) do
      %{cpu: 0, ram: 0, disk: 0}
    else
      count = length(bot_metrics)
      total_cpu = Enum.reduce(bot_metrics, 0.0, fn {_id, cpu, _ram, _ts}, acc -> acc + cpu end)
      total_ram = Enum.reduce(bot_metrics, 0.0, fn {_id, _cpu, ram, _ts}, acc -> acc + ram end)

      %{
        cpu: Float.round(total_cpu / count, 1),
        ram: Float.round(total_ram / count, 1),
        disk: 18.6 # Static
      }
    end
  end
end
```

---

**Endpoint 3 (NestJS):** `GET /api/alerts?status=active&limit=50`

**Why NestJS:** CRUD operations on alerts

**Response:**
```json
{
  "alerts": [
    {
      "id": "uuid-1",
      "msg": "Bot BOT-0012 CPU > 85%",
      "sev": "critical",
      "service": "BOT-0012",
      "time": "15m ago",
      "acked": false,
      "triggeredAt": "2026-02-21T09:45:00Z"
    }
  ],
  "total": 7
}
```

**PostgreSQL Query:**
```sql
SELECT
  id,
  alert_message as msg,
  CASE
    WHEN alert_type LIKE '%error%' OR alert_type LIKE '%critical%' THEN 'critical'
    WHEN alert_type LIKE '%warning%' THEN 'warning'
    ELSE 'info'
  END as sev,
  COALESCE(
    'BOT-' || SUBSTRING(bot_id::text FROM 1 FOR 4),
    monitored_entity
  ) as service,
  triggered_at,
  CASE
    WHEN status = 'triggered' THEN false
    ELSE true
  END as acked
FROM trading.monitoring_alerts
WHERE status IN ('triggered', 'snoozed')
ORDER BY triggered_at DESC
LIMIT 50;
```

---

#### **Real-time Updates (Phoenix WebSocket)**

**Channel:** `platform:stats` (admin) or `infra:metrics` (all users)

---

##### **WebSocket Event Schemas**

**1. Platform Stats Update** (Every 60s)

```javascript
// Frontend: Subscribe to platform stats
const platformChannel = socket.channel("platform:stats", {});
platformChannel.join();

platformChannel.on("stats_update", (payload) => {
  updatePlatformStats(payload);
});
```

**Payload Schema:**
```typescript
interface PlatformStatsUpdate {
  totalEquity: number;
  totalPnl: number;
  runningBots: number;
  errorBots: number;
  totalPositions: number;
  unrealizedPnl: number;
  timestamp: string;       // ISO 8601
}
```

**Example:**
```json
{
  "totalEquity": 542500.75,
  "totalPnl": 12650.50,
  "runningBots": 14,
  "errorBots": 1,
  "totalPositions": 48,
  "unrealizedPnl": 3350.25,
  "timestamp": "2026-02-21T10:01:00Z"
}
```

---

**2. Infrastructure Metrics Update** (Every 4s)

```javascript
// Frontend: Subscribe to infra metrics
const infraChannel = socket.channel("infra:metrics", {});
infraChannel.join();

infraChannel.on("metrics_update", (payload) => {
  updateInfraMetrics(payload.current);
  appendToHistory(payload.history);
});
```

**Payload Schema:**
```typescript
interface InfraMetricsUpdate {
  current: {
    phoenix: { cpu: number; ram: number; disk: number };
    postgres: { cpu: number; ram: number; disk: number };
    rabbitmq: { cpu: number; ram: number; disk: number };
    redis: { cpu: number; ram: number; disk: number };
    botWorker: { cpu: number; ram: number; disk: number };
  };
  history?: {              // Optional: last 60 data points
    t: number[];
    cpu: number[];
    ram: number[];
  };
  timestamp: string;
}
```

**Example:**
```json
{
  "current": {
    "phoenix": { "cpu": 25.3, "ram": 46.1, "disk": 24.1 },
    "postgres": { "cpu": 19.2, "ram": 63.5, "disk": 38.7 },
    "rabbitmq": { "cpu": 13.4, "ram": 33.8, "disk": 12.2 },
    "redis": { "cpu": 9.1, "ram": 29.7, "disk": 8.4 },
    "botWorker": { "cpu": 54.8, "ram": 72.9, "disk": 18.6 }
  },
  "timestamp": "2026-02-21T10:01:04Z"
}
```

---

**3. New Alert Event** (Event-driven)

```javascript
// Frontend: Listen for new alerts
const alertChannel = socket.channel("alerts:platform", {});
alertChannel.join();

alertChannel.on("new_alert", (payload) => {
  prependAlert(payload.alert);
  if (payload.alert.sev === "critical") {
    showNotification(payload.alert.msg);
  }
});
```

**Payload Schema:**
```json
{
  "alert": {
    "id": "uuid-new",
    "msg": "Postgres RAM at 85%",
    "sev": "critical",
    "service": "postgres",
    "time": "Just now",
    "acked": false,
    "triggeredAt": "2026-02-21T10:05:00Z"
  }
}
```

---

**4. Alert Acknowledged Event**

```javascript
alertChannel.on("alert_acked", (payload) => {
  markAlertAsAcknowledged(payload.alert_id);
});
```

**Payload Schema:**
```json
{
  "alert_id": "uuid-1",
  "acked_by": "admin@stella.com",
  "acked_at": "2026-02-21T10:06:00Z"
}
```

---

### Database Schema Gaps & Recommendations

#### ⚠️ **MISSING: Alert Status Update for Acknowledgment**

**Problem:** `trading.monitoring_alerts.status` doesn't have `'acknowledged'` enum value

**Recommendation:**
```sql
-- Update enum to include acknowledged status
ALTER TYPE trading.alert_status ADD VALUE IF NOT EXISTS 'acknowledged';

-- Or if using varchar:
ALTER TABLE trading.monitoring_alerts
ADD CONSTRAINT valid_status CHECK (
  status IN ('active', 'triggered', 'snoozed', 'expired', 'cancelled', 'acknowledged')
);
```

---

#### ❌ **MISSING: Platform Stats Aggregation Table**

**Problem:** Calculating platform stats on-demand is expensive

**Recommendation:**
Create a periodically refreshed materialized view or cache table:

```sql
-- Option 1: Materialized View (refreshed every 60s)
CREATE MATERIALIZED VIEW platform.stats_snapshot AS
SELECT
  (SELECT SUM(total_equity_usd)
   FROM (
     SELECT DISTINCT ON (bot_id) total_equity_usd
     FROM trading.equity_snapshots
     WHERE bot_id IS NOT NULL
     ORDER BY bot_id, snapshot_at DESC
   ) latest) as total_equity,

  (SELECT SUM(total_pnl_usd) FROM trading.bots) as total_pnl,

  (SELECT COUNT(*) FROM trading.bots WHERE status = 'running') as running_bots,

  (SELECT COUNT(*) FROM trading.bots WHERE status = 'error') as error_bots,

  (SELECT COUNT(*) FROM trading.positions WHERE status = 'open') as total_positions,

  NOW() as snapshot_at;

CREATE UNIQUE INDEX idx_platform_stats_snapshot ON platform.stats_snapshot(snapshot_at);

-- Refresh via Phoenix scheduler every 60s
```

**Phoenix Scheduler:**
```elixir
defmodule TradeEngine.Schedulers.PlatformStats do
  use GenServer

  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(_) do
    schedule_refresh()
    {:ok, %{}}
  end

  def handle_info(:refresh_stats, state) do
    # Refresh materialized view
    Repo.query("REFRESH MATERIALIZED VIEW CONCURRENTLY platform.stats_snapshot")

    # Read fresh stats
    stats = Repo.one(from s in "platform.stats_snapshot", select: s)

    # Cache in ETS
    :ets.insert(:platform_stats_cache, {:current, stats, System.system_time(:second)})

    # Broadcast to WebSocket
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "platform:stats",
      {:stats_update, stats}
    )

    schedule_refresh()
    {:noreply, state}
  end

  defp schedule_refresh do
    Process.send_after(self(), :refresh_stats, 60_000) # Every 60s
  end
end
```

---

### Multi-Exchange Health Monitoring

**Additional UI Component:** Exchange Health Status Panel

```typescript
interface ExchangeHealth {
  exchange: string;              // "binance", "bybit", "okx"
  status: "connected" | "disconnected" | "degraded" | "maintenance";
  activeBots: number;            // Bots running on this exchange
  activePositions: number;       // Open positions on this exchange
  lastHeartbeat: string;         // Time since last successful API call
  latency: number;               // Average API latency in ms
  errorRate: number;             // Error rate (0-100%)
  websocketStatus: "connected" | "disconnected" | "reconnecting";
}
```

**Phoenix Endpoint:** `GET /api/phoenix/exchanges/health`

**Response:**
```json
{
  "exchanges": [
    {
      "exchange": "binance",
      "status": "connected",
      "activeBots": 47,
      "activePositions": 142,
      "lastHeartbeat": "2s ago",
      "latency": 45,
      "errorRate": 0.2,
      "websocketStatus": "connected"
    },
    {
      "exchange": "bybit",
      "status": "connected",
      "activeBots": 23,
      "activePositions": 68,
      "lastHeartbeat": "3s ago",
      "latency": 52,
      "errorRate": 0.1,
      "websocketStatus": "connected"
    },
    {
      "exchange": "okx",
      "status": "degraded",
      "activeBots": 12,
      "activePositions": 34,
      "lastHeartbeat": "15s ago",
      "latency": 850,
      "errorRate": 5.3,
      "websocketStatus": "reconnecting"
    }
  ],
  "timestamp": "2026-02-21T10:00:00Z"
}
```

**PostgreSQL Query:**
```sql
SELECT
  a.code as exchange,
  COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'running') as active_bots,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'open') as active_positions,
  MAX(cl.created_at) as last_heartbeat
FROM exchange.adapters a
LEFT JOIN exchange.user_credentials uc ON uc.adapter_id = a.id
LEFT JOIN trading.bots b ON b.credential_id = uc.id
LEFT JOIN trading.positions p ON p.credential_id = uc.id
LEFT JOIN exchange.connection_logs cl ON cl.adapter_id = a.id
  AND cl.created_at > NOW() - INTERVAL '5 minutes'
  AND cl.status IN ('connected', 'disconnected')
WHERE a.status = 'active'
GROUP BY a.code, a.name
ORDER BY a.name;
```

**GenServer for Exchange Health Tracking:**
```elixir
defmodule TradeEngine.Exchange.HealthMonitor do
  use GenServer

  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(_) do
    :ets.new(:exchange_health_cache, [:named_table, :set, :public, read_concurrency: true])
    schedule_health_check()
    {:ok, %{}}
  end

  def handle_info(:check_health, state) do
    exchanges = Repo.all(from a in Adapter, where: a.status == :active)

    Enum.each(exchanges, fn adapter ->
      health = %{
        exchange: adapter.code,
        status: calculate_status(adapter.code),
        activeBots: count_active_bots(adapter.id),
        activePositions: count_active_positions(adapter.id),
        lastHeartbeat: get_last_heartbeat(adapter.id),
        latency: get_average_latency(adapter.id),
        errorRate: calculate_error_rate(adapter.id),
        websocketStatus: get_websocket_status(adapter.code)
      }

      :ets.insert(:exchange_health_cache, {adapter.code, health})

      # Broadcast to Mission Control
      Phoenix.PubSub.broadcast(
        TradeEngine.PubSub,
        "platform:stats",
        {:exchange_health_update, adapter.code, health}
      )
    end)

    schedule_health_check()
    {:noreply, state}
  end

  defp schedule_health_check do
    Process.send_after(self(), :check_health, 10_000)  # Every 10s
  end

  defp calculate_status(exchange_code) do
    case get_last_heartbeat_timestamp(exchange_code) do
      nil -> :disconnected
      timestamp when timestamp < 30 -> :connected  # seconds ago
      timestamp when timestamp < 120 -> :degraded
      _ -> :disconnected
    end
  end

  defp get_websocket_status(exchange_code) do
    # Check if market data adapter is connected
    case Process.whereis(:"MarketData.#{exchange_code}Adapter") do
      nil -> :disconnected
      pid when is_pid(pid) ->
        if Process.alive?(pid), do: :connected, else: :disconnected
    end
  end
end
```

**WebSocket Event for Real-Time Updates:**
```javascript
// Frontend: Subscribe to exchange health updates
platformChannel.on("exchange_health_update", ({ exchange, health }) => {
  updateExchangeHealthCard(exchange, health);

  // Show warning if exchange is degraded
  if (health.status === "degraded" || health.status === "disconnected") {
    showExchangeWarning(exchange, health.status);
  }
});
```

**UI Placement:** Add a "Exchange Health" section to Mission Control above or next to Infrastructure Health Grid

**Benefits:**
- ✅ Quick visibility into which exchanges are having issues
- ✅ Helps operators identify exchange-specific problems
- ✅ Shows distribution of bots and positions across exchanges
- ✅ Latency and error rate tracking per exchange

---

### Summary: Mission Control Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|-----------------------|
| **Platform Stats (initial)** | Phoenix API | HTTP REST | On page load | Aggregates across all exchanges |
| **Platform Stats (updates)** | Phoenix Channel | WebSocket | Every 60s | Sum of all exchange data |
| **Infrastructure Metrics (initial)** | Phoenix API | HTTP REST | On page load | System-wide (not per-exchange) |
| **Infrastructure Metrics (updates)** | Phoenix Channel | WebSocket | Every 4s | System-wide (not per-exchange) |
| **Exchange Health (initial)** | Phoenix API | HTTP REST | On page load | **NEW: Per-exchange health status** |
| **Exchange Health (updates)** | Phoenix Channel | WebSocket | Every 10s | **NEW: Real-time exchange monitoring** |
| **Alert List (initial)** | NestJS API | HTTP REST | On page load | Includes exchange-specific alerts |
| **New Alerts** | Phoenix Channel | WebSocket | On event | May include exchange context |
| **Alert Acknowledgment** | Phoenix Channel | WebSocket | On event | Exchange-agnostic |

**Schema Changes Required (Updated for Multi-Exchange):**
1. ✅ Add `'acknowledged'` to alert status enum
2. ✅ Create `platform.stats_snapshot` materialized view
3. ✅ Create ETS table `:platform_stats_cache`
4. ✅ Create ETS table `:infra_metrics_cache`
5. ✅ Create ETS table `:exchange_health_cache` **(NEW for multi-exchange)**
6. ✅ Set up Phoenix schedulers for periodic refreshes
7. ✅ Create `Exchange.HealthMonitor` GenServer **(NEW for multi-exchange)**

**External Services Setup Required:**
1. ❌ RabbitMQ Management API access
2. ❌ Redis INFO command access
3. ⚠️ PostgreSQL `pg_stat_database` read permissions

---

---


---

**[← Previous: Trading/Positions](./02-trading-positions.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Infrastructure →](./04-infrastructure.md)**
