## Page 1: `/dashboard/bot-fleet` - Bot Fleet Management

### UI Mock Data Structure
```typescript
interface Bot {
  id: string;              // "BOT-0001"
  name: string;            // "Momentum Grid-742"
  user: string;            // "alice.k@trader.io"
  strategy: string;        // "Momentum Grid"
  exchange: string;        // "Binance"
  credential_label: string; // "Main Trading Account" ← MULTI-EXCHANGE
  credential_status: "active" | "expired" | "invalid"; // ← MULTI-EXCHANGE
  pair: string;            // "BTC/USDT"
  status: "running" | "paused" | "error";
  pnl: number;             // -800 to 3200 USD
  pnlPct: number;          // -4.5% to 12.8%
  equity: number;          // 5000 to 85000 USD
  openPositions: number;   // 0 to 8
  trades: number;          // 12 to 340
  winRate: number;         // 42% to 78%
  lastHeartbeat: number;   // 1 to 45 seconds ago
  cpu: number;             // 5% to 88%
  ram: number;             // 20% to 85%
  uptime: string;          // "72h 45m"
}
```

**Multi-Exchange Note:** `credential_label` and `credential_status` are added to support scenarios where users have multiple accounts on the same exchange. This allows them to distinguish between "Binance - Main Account" vs "Binance - Backup Account".

### UI Features & Requirements
1. **Bot List Display** - Grid of bot cards
2. **Search** - By bot ID, name, or user email
3. **Filters** - By status (running/paused/error), by user
4. **Real-time Updates** - Bot status, heartbeat, CPU/RAM
5. **Actions** - Deploy new bot, Kill bot (with reason)

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **id** | PostgreSQL | `trading.bots.id` | Static | ✅ EXISTS |
| **name** | PostgreSQL | `trading.bots.name` | Static | ✅ EXISTS |
| **user (email)** | PostgreSQL | JOIN `auth.users.email` via `user_id` | Static | ✅ EXISTS |
| **strategy** | PostgreSQL | JOIN `strategy.strategies.name` via `strategy_id` | Static | ✅ EXISTS - FK exists |
| **exchange** | PostgreSQL | Derive from `trading.bots.credential_id` → `exchange.user_credentials.exchange_name` | Static | ✅ EXISTS |
| **credential_label** | PostgreSQL | `exchange.user_credentials.label` via `credential_id` | Static | ✅ EXISTS |
| **credential_status** | PostgreSQL | `exchange.user_credentials.status` via `credential_id` | Static | ✅ EXISTS |
| **pair** | PostgreSQL | `trading.bots.trading_pairs[0]` (first pair) | Static | ✅ EXISTS (array field) |
| **status** | Phoenix PubSub | ETS table `bot_status_cache` → broadcast | Every 5s (heartbeat) | ⚠️ PARTIAL - enum exists, needs real-time sync |
| **pnl** | PostgreSQL + Calc | `trading.bots.total_pnl_usd` | Every 60s (batch update) | ✅ EXISTS |
| **pnlPct** | Calculated | `(pnl / initial_equity) * 100` | Derived | ❌ MISSING `initial_equity` in bots table |
| **equity** | PostgreSQL | Latest `trading.equity_snapshots.total_equity_usd` WHERE `bot_id` | Every 60s | ✅ EXISTS |
| **openPositions** | PostgreSQL | COUNT `trading.positions` WHERE `bot_id` AND `status='open'` | Real-time on position change | ✅ EXISTS |
| **trades** | PostgreSQL | `trading.bots.total_trades` | On each trade | ✅ EXISTS |
| **winRate** | PostgreSQL | `trading.bots.win_rate` | Batch calculation | ✅ EXISTS |
| **lastHeartbeat** | Phoenix PubSub | ETS `bot_heartbeat_cache` → seconds since `last_heartbeat_at` | Every 5s | ⚠️ PARTIAL - field exists, needs ETS cache |
| **cpu** | Phoenix PubSub | ETS `bot_metrics_cache` → process metrics | Every 10s | ❌ MISSING - needs instrumentation |
| **ram** | Phoenix PubSub | ETS `bot_metrics_cache` → process memory | Every 10s | ❌ MISSING - needs instrumentation |
| **uptime** | Calculated | `NOW() - started_at` | Real-time | ✅ EXISTS (started_at field) |

---

### Data Delivery Strategy

#### **Initial Page Load (REST API via NestJS)**
**Endpoint:** `GET /api/bots?user_id={optional}&status={optional}`

**Response:**
```json
{
  "bots": [
    {
      "id": "uuid",
      "name": "Momentum Grid-742",
      "user": {
        "id": "uuid",
        "email": "alice.k@trader.io"
      },
      "strategy": {
        "id": "uuid",
        "name": "Momentum Grid"
      },
      "exchange": "Binance",
      "credential_label": "Main Trading Account",
      "credential_status": "active",
      "pair": "BTC/USDT",
      "status": "running",
      "pnl": 1250.50,
      "pnlPct": 12.5,
      "equity": 11250.50,
      "openPositions": 3,
      "trades": 47,
      "winRate": 62.3,
      "lastHeartbeat": 5,
      "cpu": 24.5,
      "ram": 45.2,
      "uptime": "12h 34m",
      "startedAt": "2026-02-20T10:00:00Z"
    }
  ],
  "total": 18
}
```

**PostgreSQL Query:**
```sql
SELECT
  b.id,
  b.name,
  b.status,
  b.trading_pairs,
  b.total_trades,
  b.total_pnl_usd,
  b.win_rate,
  b.started_at,
  b.last_heartbeat_at,
  u.email as user_email,
  u.id as user_id,
  s.name as strategy_name,
  s.id as strategy_id,
  uc.exchange_name,
  uc.label as credential_label,
  uc.status as credential_status,
  (SELECT total_equity_usd
   FROM trading.equity_snapshots
   WHERE bot_id = b.id
   ORDER BY snapshot_at DESC
   LIMIT 1) as current_equity,
  (SELECT COUNT(*)
   FROM trading.positions
   WHERE bot_id = b.id AND status = 'open') as open_positions_count
FROM trading.bots b
JOIN auth.users u ON b.user_id = u.id
LEFT JOIN strategy.strategies s ON b.strategy_id = s.id
JOIN exchange.user_credentials uc ON b.credential_id = uc.id
WHERE ($1::uuid IS NULL OR b.user_id = $1)
  AND ($2::text IS NULL OR b.status = $2::trading.bot_status)
ORDER BY b.last_heartbeat_at DESC NULLS LAST;
```

**Data Source:** **NestJS API** → PostgreSQL

---

#### **Real-time Updates (Phoenix WebSocket)**

**Channel:** `bot:user:{user_id}` or `bot:fleet` (for admin view)

---

##### **WebSocket Event Schemas**

**1. Initial Join & Subscribe**

```javascript
// Frontend: Connect and join channel
const socket = new Socket("/socket", {
  params: { token: userAuthToken }
});
socket.connect();

const botChannel = socket.channel("bot:user:123", {});
botChannel.join()
  .receive("ok", (response) => {
    console.log("Joined bot channel", response);
    // response = { bots: [...] }
  })
  .receive("error", (resp) => {
    console.error("Failed to join", resp);
  });
```

**Join Response Payload:**
```json
{
  "bots": [
    {
      "id": "uuid-1",
      "name": "Momentum Grid-742",
      "userId": "uuid-user",
      "userEmail": "alice.k@trader.io",
      "strategyId": "uuid-strat",
      "strategyName": "Momentum Grid",
      "exchange": "Binance",
      "credential_label": "Main Trading Account",
      "credential_status": "active",
      "pair": "BTC/USDT",
      "status": "running",
      "pnl": 1250.50,
      "pnlPct": 12.5,
      "equity": 11250.50,
      "openPositions": 3,
      "trades": 47,
      "winRate": 62.3,
      "lastHeartbeat": 5,
      "cpu": 24.5,
      "ram": 45.2,
      "uptime": "12h 34m",
      "startedAt": "2026-02-20T10:00:00Z"
    }
  ]
}
```

---

**2. Bot Heartbeat Event** (Every 5s per bot)

```javascript
// Frontend: Listen for heartbeat updates
botChannel.on("bot_heartbeat", (payload) => {
  updateBotHeartbeat(payload.bot_id, payload);
});
```

**Payload Schema:**
```typescript
interface BotHeartbeatPayload {
  bot_id: string;           // UUID
  timestamp: string;        // ISO 8601
  cpu: number;              // 0-100 percentage
  ram: number;              // MB
  secondsSinceLastBeat: number; // Always 0 for current heartbeat
}
```

**Example:**
```json
{
  "bot_id": "uuid-1",
  "timestamp": "2026-02-21T10:23:45.123Z",
  "cpu": 24.5,
  "ram": 45.2,
  "secondsSinceLastBeat": 0
}
```

---

**3. Bot Update Event** (On status change, trade completion, position change)

```javascript
// Frontend: Listen for bot updates
botChannel.on("bot_update", (payload) => {
  updateBotInState(payload.bot_id, payload.changes);
});
```

**Payload Schema:**
```typescript
interface BotUpdatePayload {
  bot_id: string;
  changes: {
    status?: "running" | "paused" | "error" | "stopped";
    pnl?: number;              // Total P&L in USD
    pnlPct?: number;           // P&L percentage
    equity?: number;           // Current equity
    openPositions?: number;    // Count of open positions
    trades?: number;           // Total trades executed
    winRate?: number;          // Win rate percentage
    errorMessage?: string;     // If status=error
  };
  timestamp: string;           // ISO 8601
  reason?: string;             // Optional context (e.g., "position_closed")
}
```

**Example (Status Change):**
```json
{
  "bot_id": "uuid-1",
  "changes": {
    "status": "paused"
  },
  "timestamp": "2026-02-21T10:25:00Z",
  "reason": "user_paused"
}
```

**Example (Trade Completed):**
```json
{
  "bot_id": "uuid-1",
  "changes": {
    "pnl": 1450.75,
    "pnlPct": 14.5,
    "equity": 11450.75,
    "openPositions": 4,
    "trades": 48,
    "winRate": 63.0
  },
  "timestamp": "2026-02-21T10:26:15Z",
  "reason": "trade_completed"
}
```

---

**4. Bot Created Event** (When new bot deployed)

```javascript
botChannel.on("bot_created", (payload) => {
  addBotToList(payload.bot);
});
```

**Payload Schema:**
```json
{
  "bot": {
    "id": "uuid-new",
    "name": "Scalp Pro-891",
    "userId": "uuid-user",
    "userEmail": "alice.k@trader.io",
    "strategyId": "uuid-strat",
    "strategyName": "Scalp Pro",
    "exchange": "Bybit",
    "pair": "ETH/USDT",
    "status": "initializing",
    "pnl": 0,
    "pnlPct": 0,
    "equity": 10000.00,
    "openPositions": 0,
    "trades": 0,
    "winRate": 0,
    "lastHeartbeat": null,
    "cpu": 0,
    "ram": 0,
    "uptime": "0m",
    "startedAt": "2026-02-21T10:30:00Z"
  }
}
```

---

**5. Bot Terminated Event**

```javascript
botChannel.on("bot_terminated", (payload) => {
  removeBotFromList(payload.bot_id);
  showNotification(`Bot ${payload.bot_id} terminated: ${payload.reason}`);
});
```

**Payload Schema:**
```json
{
  "bot_id": "uuid-1",
  "reason": "user_killed",
  "finalStats": {
    "totalTrades": 150,
    "totalPnl": 3200.50,
    "winRate": 65.3,
    "uptime": "5d 12h 30m"
  },
  "timestamp": "2026-02-21T10:35:00Z"
}
```

---

##### **Backend Implementation (Phoenix)**

```elixir
defmodule TradeEngineWeb.BotChannel do
  use Phoenix.Channel
  require Logger

  @doc """
  Join channel: bot:user:{user_id}
  Subscribes to all bot events for this user
  """
  def join("bot:user:" <> user_id, _params, socket) do
    if authorized?(socket, user_id) do
      # Subscribe to user's bot PubSub topic
      :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "bots:user:#{user_id}")

      # Fetch initial bot list with live metrics
      bots = TradeEngine.Bots.list_user_bots_with_metrics(user_id)

      {:ok, %{bots: serialize_bots(bots)}, assign(socket, :user_id, user_id)}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end

  @doc """
  Handle bot heartbeat broadcasts from BotWorker GenServer
  Frequency: Every 5 seconds per bot
  """
  def handle_info({:bot_heartbeat, bot_id, metrics}, socket) do
    push(socket, "bot_heartbeat", %{
      bot_id: bot_id,
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
      cpu: metrics.cpu_percent,
      ram: metrics.ram_mb,
      secondsSinceLastBeat: 0
    })
    {:noreply, socket}
  end

  @doc """
  Handle bot status/metric updates
  Triggered by: Trade completion, status change, position open/close
  """
  def handle_info({:bot_update, bot_id, changes, reason}, socket) do
    push(socket, "bot_update", %{
      bot_id: bot_id,
      changes: changes,
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
      reason: reason
    })
    {:noreply, socket}
  end

  @doc """
  Handle bot creation event
  Triggered when user deploys new bot
  """
  def handle_info({:bot_created, bot}, socket) do
    push(socket, "bot_created", %{
      bot: serialize_bot(bot)
    })
    {:noreply, socket}
  end

  @doc """
  Handle bot termination event
  Triggered when bot is killed/stopped
  """
  def handle_info({:bot_terminated, bot_id, reason, final_stats}, socket) do
    push(socket, "bot_terminated", %{
      bot_id: bot_id,
      reason: reason,
      finalStats: final_stats,
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    })
    {:noreply, socket}
  end

  # Client-initiated actions

  @doc """
  Client requests to start a bot
  """
  def handle_in("start_bot", %{"bot_id" => bot_id}, socket) do
    case TradeEngine.Bots.start_bot(bot_id) do
      {:ok, bot} ->
        {:reply, {:ok, %{bot: serialize_bot(bot)}}, socket}
      {:error, reason} ->
        {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  @doc """
  Client requests to stop a bot
  """
  def handle_in("stop_bot", %{"bot_id" => bot_id}, socket) do
    case TradeEngine.Bots.stop_bot(bot_id) do
      {:ok, bot} ->
        {:reply, {:ok, %{bot: serialize_bot(bot)}}, socket}
      {:error, reason} ->
        {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  @doc """
  Client requests to pause a bot
  """
  def handle_in("pause_bot", %{"bot_id" => bot_id}, socket) do
    case TradeEngine.Bots.pause_bot(bot_id) do
      {:ok, bot} ->
        {:reply, {:ok, %{bot: serialize_bot(bot)}}, socket}
      {:error, reason} ->
        {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  @doc """
  Client requests to kill a bot with reason
  """
  def handle_in("kill_bot", %{"bot_id" => bot_id, "reason" => reason}, socket) do
    case TradeEngine.Bots.terminate_bot(bot_id, reason) do
      {:ok, final_stats} ->
        {:reply, {:ok, %{finalStats: final_stats}}, socket}
      {:error, reason} ->
        {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  # Helper functions

  defp authorized?(socket, user_id) do
    socket.assigns[:current_user_id] == user_id
  end

  defp serialize_bot(bot) do
    %{
      id: bot.id,
      name: bot.name,
      userId: bot.user_id,
      userEmail: bot.user.email,
      strategyId: bot.strategy_id,
      strategyName: bot.strategy.name,
      exchange: bot.credential.exchange_name,
      pair: List.first(bot.trading_pairs),
      status: bot.status,
      pnl: bot.total_pnl_usd,
      pnlPct: calculate_pnl_pct(bot),
      equity: get_current_equity(bot.id),
      openPositions: count_open_positions(bot.id),
      trades: bot.total_trades,
      winRate: bot.win_rate,
      lastHeartbeat: seconds_since_heartbeat(bot.last_heartbeat_at),
      cpu: get_cpu_from_cache(bot.id),
      ram: get_ram_from_cache(bot.id),
      uptime: calculate_uptime(bot.started_at),
      startedAt: bot.started_at
    }
  end

  defp serialize_bots(bots), do: Enum.map(bots, &serialize_bot/1)
end
```

**Data Source:** **Phoenix WebSocket** → ETS cache + PubSub

---

### Database Schema Gaps & Recommendations

#### ❌ **MISSING: `initial_equity` in `trading.bots`**
**Problem:** Cannot calculate `pnlPct = (current_equity - initial_equity) / initial_equity * 100`

**Recommendation:**
```sql
ALTER TABLE trading.bots
ADD COLUMN initial_equity_usd DECIMAL(15,4) NOT NULL DEFAULT 0;

-- Populate from first equity snapshot or config
UPDATE trading.bots b
SET initial_equity_usd = (
  SELECT starting_capital_usd
  FROM trading.equity_snapshots
  WHERE bot_id = b.id
  ORDER BY snapshot_at ASC
  LIMIT 1
);
```

---

#### ❌ **MISSING: ETS Cache for Bot Metrics**
**Problem:** CPU/RAM metrics not tracked

**Recommendation:**
Create ETS table in Phoenix:
```elixir
defmodule TradeEngine.Cache.BotMetrics do
  use GenServer

  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(_) do
    :ets.new(:bot_metrics_cache, [
      :named_table,
      :set,
      :public,
      read_concurrency: true
    ])
    {:ok, %{}}
  end

  def put_metrics(bot_id, metrics) do
    :ets.insert(:bot_metrics_cache, {
      bot_id,
      metrics.cpu_percent,
      metrics.ram_mb,
      System.monotonic_time(:second)
    })
  end

  def get_metrics(bot_id) do
    case :ets.lookup(:bot_metrics_cache, bot_id) do
      [{^bot_id, cpu, ram, timestamp}] ->
        %{cpu: cpu, ram: ram, age: System.monotonic_time(:second) - timestamp}
      [] ->
        %{cpu: 0, ram: 0, age: nil}
    end
  end
end
```

Instrument in BotWorker:
```elixir
defmodule TradeEngine.Bots.Worker do
  # In handle_info(:check_resources, state)
  def handle_info(:check_resources, state) do
    process_info = Process.info(self(), [:memory, :reductions])
    ram_mb = process_info[:memory] / (1024 * 1024)
    cpu_percent = estimate_cpu_from_reductions(process_info[:reductions])

    TradeEngine.Cache.BotMetrics.put_metrics(state.bot.id, %{
      cpu_percent: cpu_percent,
      ram_mb: trunc(ram_mb)
    })

    # Broadcast to WebSocket
    broadcast_bot_heartbeat(state.bot.id, %{cpu: cpu_percent, ram: ram_mb})

    Process.send_after(self(), :check_resources, 10_000) # Every 10s
    {:noreply, state}
  end
end
```

---

#### ⚠️ **VIEW RECOMMENDATION: Materialized View for Bot List**
For performance, create a materialized view refreshed every 60s:

```sql
CREATE MATERIALIZED VIEW trading.bot_dashboard_view AS
SELECT
  b.id,
  b.name,
  b.status,
  b.user_id,
  b.strategy_id,
  b.credential_id,
  b.trading_pairs[1] as primary_pair,
  b.total_trades,
  b.total_pnl_usd,
  b.win_rate,
  b.started_at,
  b.last_heartbeat_at,
  b.initial_equity_usd,
  EXTRACT(EPOCH FROM (NOW() - b.started_at))::INTEGER as uptime_seconds,
  u.email as user_email,
  s.name as strategy_name,
  uc.exchange_name,
  uc.label as credential_label,
  uc.status as credential_status,
  latest_eq.total_equity_usd as current_equity,
  COALESCE(
    ((latest_eq.total_equity_usd - b.initial_equity_usd) / NULLIF(b.initial_equity_usd, 0)) * 100,
    0
  ) as pnl_pct,
  open_pos.count as open_positions_count
FROM trading.bots b
JOIN auth.users u ON b.user_id = u.id
LEFT JOIN strategy.strategies s ON b.strategy_id = s.id
JOIN exchange.user_credentials uc ON b.credential_id = uc.id
LEFT JOIN LATERAL (
  SELECT total_equity_usd
  FROM trading.equity_snapshots
  WHERE bot_id = b.id
  ORDER BY snapshot_at DESC
  LIMIT 1
) latest_eq ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) as count
  FROM trading.positions
  WHERE bot_id = b.id AND status = 'open'
) open_pos ON true;

CREATE UNIQUE INDEX idx_bot_dashboard_view_id ON trading.bot_dashboard_view(id);
CREATE INDEX idx_bot_dashboard_view_user ON trading.bot_dashboard_view(user_id);
CREATE INDEX idx_bot_dashboard_view_status ON trading.bot_dashboard_view(status);

-- Refresh every 60 seconds via Phoenix scheduler
-- Or use pg_cron extension:
-- SELECT cron.schedule('refresh-bot-dashboard', '60 seconds', 'REFRESH MATERIALIZED VIEW CONCURRENTLY trading.bot_dashboard_view');
```

**NestJS Query becomes:**
```sql
SELECT * FROM trading.bot_dashboard_view
WHERE ($1::uuid IS NULL OR user_id = $1)
  AND ($2::text IS NULL OR status = $2::trading.bot_status)
ORDER BY last_heartbeat_at DESC NULLS LAST;
```

---

### Summary: Bot Fleet Page

| Component | Data Source | Protocol | Frequency |
|-----------|-------------|----------|-----------|
| **Initial Load** | NestJS API | HTTP REST | On page load |
| **Bot Status** | Phoenix Channel | WebSocket | Every 5s (heartbeat) |
| **CPU/RAM Metrics** | Phoenix Channel | WebSocket | Every 10s |
| **PnL Updates** | Phoenix Channel | WebSocket | On trade completion |
| **Position Count** | Phoenix Channel | WebSocket | On position open/close |

**Schema Changes Required:**
1. ✅ Add `initial_equity_usd` to `trading.bots`
2. ✅ Create ETS cache for bot metrics (CPU/RAM)
3. ✅ Create materialized view `bot_dashboard_view`
4. ✅ Instrument BotWorker to track process metrics

---

---


---

**[← Back to Index](./00-INDEX.md)** | **[Next: Trading/Positions →](./02-trading-positions.md)**
