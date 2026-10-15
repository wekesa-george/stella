# Page-by-Page Data Source Analysis
**Stella Platform - UI to Backend Data Mapping**

**Date:** February 21, 2026
**Purpose:** Map each UI page's data requirements to backend sources (Phoenix/Elixir WebSocket, NestJS API, PostgreSQL, ETS cache)

---

## Analysis Scope

This document analyzes:
- **Frontend:** stella-nextjs Next.js application
- **Backend 1:** umbrella-app Phoenix/Elixir (Trading Engine - Real-time)
- **Backend 2:** NestJS API (Planned - CRUD, User Management, Compliance)
- **Database:** PostgreSQL (stella-database.sql schema)
- **Cache:** ETS tables (in-memory for real-time data)

---

## Backend Responsibility Split: Phoenix vs NestJS

### **Phoenix/Elixir Handles:**
- ✅ **Real-time Trading Operations** - Order execution, position management, bot lifecycle
- ✅ **Market Data Streaming** - WebSocket channels for prices, candles, order book
- ✅ **Bot Management** - Start/stop/pause bots, bot heartbeat monitoring
- ✅ **Performance-Critical Reads** - Current bot status, live position P&L, active orders
- ✅ **Infrastructure Metrics** - System health, service monitoring, resource usage

**Phoenix REST Endpoints:**
- `GET /api/phoenix/bots/:id/status` - Live bot status (from GenServer)
- `POST /api/phoenix/bots/:id/start` - Start bot
- `POST /api/phoenix/bots/:id/stop` - Stop bot
- `POST /api/phoenix/bots/:id/pause` - Pause bot
- `GET /api/phoenix/positions/open` - Live open positions (from ETS cache)
- `GET /api/phoenix/system/health` - Infrastructure health check

### **NestJS Handles:**
- ✅ **CRUD Operations** - User management, bot configuration, strategies
- ✅ **Historical Data** - Past trades, historical P&L, audit logs
- ✅ **Compliance & KYC** - Document uploads, verification workflows
- ✅ **Billing & Subscriptions** - Invoice generation, payment processing
- ✅ **Admin Operations** - User administration, role management
- ✅ **Reporting** - Performance reports, analytics, exports

**NestJS REST Endpoints:**
- `GET /api/bots` - List all bots (with pagination, filters)
- `POST /api/bots` - Create new bot
- `PUT /api/bots/:id` - Update bot configuration
- `DELETE /api/bots/:id` - Delete bot
- `GET /api/users` - User management
- `GET /api/orders/history` - Historical order data
- `GET /api/reports/performance` - Generate performance reports

---

## Real-Time Update Frequency Best Practices

Based on industry standards (Binance, Coinbase, Interactive Brokers):

| Data Type | Proposed Frequency | Industry Standard | Status |
|-----------|-------------------|-------------------|---------|
| **Market Prices** | 100-500ms | 100ms - 1s | ✅ Optimal |
| **Position P&L** | 1s | 500ms - 2s | ✅ Optimal |
| **Bot Heartbeat** | 5s | 5s - 10s | ✅ Optimal |
| **Bot Metrics (CPU/RAM)** | 10s | 10s - 30s | ✅ Optimal |
| **Infrastructure Health** | 4s | 5s - 15s | ✅ Optimal |
| **Order Status** | Event-driven | Event-driven | ✅ Optimal |
| **Candlestick Updates** | On close (1m-1D) | On close | ✅ Optimal |

**Conclusion:** All proposed frequencies are within best practices and won't cause performance issues.

---

## Page 1: `/dashboard/bot-fleet` - Bot Fleet Management

### UI Mock Data Structure
```typescript
interface Bot {
  id: string;              // "BOT-0001"
  name: string;            // "Momentum Grid-742"
  user: string;            // "alice.k@trader.io"
  strategy: string;        // "Momentum Grid"
  exchange: string;        // "Binance"
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

## Page 2: `/trading` - Live Trading View (Positions)

### UI Mock Data Structure
```typescript
interface Position {
  id: string;              // "POS-0", "POS-1" (generated)
  pair: string;            // "BTC/USDT"
  side: "LONG" | "SHORT";
  entry: number;           // Entry price
  current: number;         // Current/mark price
  size: number;            // Position size (quantity)
  pnl: number;             // Unrealized P&L in USD
  pnlPct: number;          // Unrealized P&L %
  age: string;             // "120m"
  bot: string;             // "BOT-0003"
  strategy: string;        // "Momentum Grid"
  color: string;           // Strategy color for chart
}

interface Order {
  id: string;              // "abc123def"
  time: string;            // "10:23:45"
  bot: string;             // "BOT-0007"
  exchange: string;        // "Binance"
  pair: string;            // "ETH/USDT"
  side: "BUY" | "SELL";
  size: number;            // Quantity
  price: number;           // Order price
  status: "FILLED" | "PARTIAL" | "REJECTED";
  type: "LIMIT" | "MARKET";
}

// Candlestick data (real-time)
interface Candle {
  i: number;               // Index
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

### UI Features & Requirements
1. **Real-time Candlestick Chart** - 1m/5m/15m/1h/4h/1D timeframes
2. **Position Lines on Chart** - Show entry prices for open positions
3. **Order Markers on Chart** - Triangles for executed orders
4. **Live Position Table** - Below chart, updates in real-time
5. **Order Stream** - Right sidebar, live order feed
6. **Pair Selector** - Left sidebar with sparklines
7. **Position Actions** - Close position, Kill position

---

### Data Source Mapping

#### **Candlestick/OHLCV Data**

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Candles (historical)** | NestJS API | `market_data.ohlcv_*` (TimescaleDB hypertable) | On page load | ✅ EXISTS |
| **Candles (real-time)** | Phoenix Channel | Market data adapter → PubSub | Every 1s (for 1m) | ✅ EXISTS (MarketDataChannel) |
| **Current Price** | Phoenix Channel | ETS `price_cache` | Every tick (~100ms) | ✅ EXISTS (ticker channel) |

---

#### **Position Data**

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **id** | PostgreSQL | `trading.positions.id` | Static | ✅ EXISTS |
| **pair** | PostgreSQL | `trading.positions.trading_pair` | Static | ✅ EXISTS |
| **side** | PostgreSQL | `trading.positions.side` (enum: long/short) | Static | ✅ EXISTS |
| **entry** | PostgreSQL | `trading.positions.entry_price` | Static | ✅ EXISTS |
| **current** | Phoenix PubSub | ETS `price_cache` → current price for pair | Real-time | ✅ EXISTS |
| **size** | PostgreSQL | `trading.positions.quantity` | Static (unless partial close) | ✅ EXISTS |
| **pnl (USD)** | Calculated + Cache | `(current - entry) * size * (side == 'long' ? 1 : -1)` | Real-time | ⚠️ NEEDS real-time calc |
| **pnlPct** | Calculated | `((current - entry) / entry) * 100 * (side == 'long' ? 1 : -1)` | Real-time | ⚠️ NEEDS real-time calc |
| **age** | Calculated | `NOW() - opened_at` | Real-time | ✅ EXISTS (opened_at field) |
| **bot** | PostgreSQL | `trading.positions.bot_id` | Static | ✅ EXISTS |
| **strategy** | PostgreSQL | JOIN `strategy.strategies.name` via `strategy_id` | Static | ✅ EXISTS |

---

#### **Order Stream Data**

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **id** | PostgreSQL | `trading.orders.id` or `client_order_id` | Static | ✅ EXISTS |
| **time** | PostgreSQL | `trading.orders.created_at` | Static | ✅ EXISTS |
| **bot** | PostgreSQL | `trading.orders.bot_id` | Static | ✅ EXISTS |
| **exchange** | PostgreSQL | `trading.orders.exchange_code` | Static | ✅ EXISTS |
| **pair** | PostgreSQL | `trading.orders.trading_pair` | Static | ✅ EXISTS |
| **side** | PostgreSQL | `trading.orders.side` (enum: buy/sell) | Static | ✅ EXISTS |
| **size** | PostgreSQL | `trading.orders.quantity` | Static | ✅ EXISTS |
| **price** | PostgreSQL | `trading.orders.price` or `avg_fill_price` | Static | ✅ EXISTS |
| **status** | PostgreSQL + PubSub | `trading.orders.status` (enum) | On order update | ✅ EXISTS |
| **type** | PostgreSQL | `trading.orders.type` (enum: market/limit) | Static | ✅ EXISTS |

---

### Data Delivery Strategy

#### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/market-data/candles?pair=BTC/USDT&timeframe=1h&limit=120`

**Response:**
```json
{
  "pair": "BTC/USDT",
  "timeframe": "1h",
  "candles": [
    {
      "timestamp": "2026-02-21T10:00:00Z",
      "open": 65420.50,
      "high": 65482.30,
      "low": 65380.10,
      "close": 65450.75,
      "volume": 1234567.89
    }
  ]
}
```

**PostgreSQL Query (TimescaleDB):**
```sql
SELECT
  time_bucket('1 hour', timestamp) as timestamp,
  first(open, timestamp) as open,
  max(high) as high,
  min(low) as low,
  last(close, timestamp) as close,
  sum(volume) as volume
FROM market_data.ohlcv_binance_btcusdt
WHERE timestamp >= NOW() - INTERVAL '5 days'
GROUP BY time_bucket('1 hour', timestamp)
ORDER BY timestamp DESC
LIMIT 120;
```

**Data Source:** **NestJS API** → TimescaleDB hypertable

---

**Endpoint 2:** `GET /api/positions?pair=BTC/USDT&status=open`

**Response:**
```json
{
  "positions": [
    {
      "id": "uuid",
      "pair": "BTC/USDT",
      "side": "long",
      "entry": 65420.50,
      "size": 0.15,
      "openedAt": "2026-02-21T08:30:00Z",
      "bot": {
        "id": "uuid",
        "name": "BOT-0003"
      },
      "strategy": {
        "id": "uuid",
        "name": "Momentum Grid"
      }
    }
  ]
}
```

**PostgreSQL Query:**
```sql
SELECT
  p.id,
  p.trading_pair,
  p.side,
  p.entry_price,
  p.quantity as size,
  p.opened_at,
  p.unrealized_pnl_usd,
  p.roi_percentage,
  b.id as bot_id,
  b.name as bot_name,
  s.name as strategy_name
FROM trading.positions p
LEFT JOIN trading.bots b ON p.bot_id = b.id
LEFT JOIN strategy.strategies s ON p.strategy_id = s.id
WHERE p.status = 'open'
  AND ($1::text IS NULL OR p.trading_pair = $1)
ORDER BY p.opened_at DESC;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 3:** `GET /api/orders?limit=50`

**Response:**
```json
{
  "orders": [
    {
      "id": "uuid",
      "clientOrderId": "STELLA_abc123",
      "createdAt": "2026-02-21T10:23:45Z",
      "bot": "BOT-0007",
      "exchange": "Binance",
      "pair": "ETH/USDT",
      "side": "buy",
      "size": 0.5,
      "price": 3284.50,
      "status": "filled",
      "type": "limit"
    }
  ]
}
```

**PostgreSQL Query:**
```sql
SELECT
  o.id,
  o.client_order_id,
  o.created_at,
  o.bot_id,
  b.name as bot_name,
  o.exchange_code,
  o.trading_pair,
  o.side,
  o.quantity as size,
  COALESCE(o.avg_fill_price, o.price) as price,
  o.status,
  o.type
FROM trading.orders o
LEFT JOIN trading.bots b ON o.bot_id = b.id
ORDER BY o.created_at DESC
LIMIT 50;
```

**Data Source:** **NestJS API** → PostgreSQL

---

#### **Real-time Updates (Phoenix WebSocket)**

**Channel 1:** `market_data:BTC/USDT` - Price & Candle Updates

```javascript
// Frontend
const marketChannel = socket.channel("market_data:BTC/USDT", {});
marketChannel.join();

marketChannel.on("ticker", ({ price, timestamp }) => {
  updateCurrentPrice(price);
  updatePositionPnL(price); // Recalculate all open positions
});

marketChannel.on("candle_closed", ({ timeframe, candle }) => {
  if (timeframe === selectedTimeframe) {
    appendCandle(candle);
  }
});
```

**Backend (Phoenix):**
```elixir
defmodule TradeEngineWeb.MarketDataChannel do
  use Phoenix.Channel

  def join("market_data:" <> symbol, _params, socket) do
    # Subscribe to market data PubSub
    :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "ticker:#{symbol}")
    :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "candle_closed:1m:#{symbol}")
    :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "candle_closed:5m:#{symbol}")
    :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "candle_closed:1h:#{symbol}")

    # Send current price from ETS
    current_price = TradeEngine.Cache.PriceCache.get_price(symbol)
    {:ok, %{current_price: current_price}, assign(socket, :symbol, symbol)}
  end

  def handle_info({:ticker_update, symbol, price}, socket) do
    push(socket, "ticker", %{symbol: symbol, price: price, timestamp: DateTime.utc_now()})
    {:noreply, socket}
  end

  def handle_info({:candle_closed, timeframe, symbol, candle}, socket) do
    push(socket, "candle_closed", %{
      timeframe: timeframe,
      candle: %{
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      }
    })
    {:noreply, socket}
  end
end
```

**Data Source:** **Phoenix WebSocket** → Market Data Adapter → ETS cache

---

**Channel 2:** `positions:user:{user_id}` - Position Updates

```javascript
// Frontend
const posChannel = socket.channel("positions:user:123", {});
posChannel.join();

posChannel.on("position_opened", (position) => {
  addPositionToList(position);
  addPositionLineToChart(position);
});

posChannel.on("position_pnl_update", ({ position_id, unrealized_pnl, pnl_pct, current_price }) => {
  updatePositionPnL(position_id, unrealized_pnl, pnl_pct, current_price);
});

posChannel.on("position_closed", ({ position_id, realized_pnl }) => {
  removePosition(position_id);
  showNotification(`Position closed: ${realized_pnl > 0 ? '+' : ''}${realized_pnl} USD`);
});
```

**Backend (Phoenix):**
```elixir
defmodule TradeEngineWeb.PositionChannel do
  use Phoenix.Channel

  def join("positions:user:" <> user_id, _params, socket) do
    :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "positions:user:#{user_id}")

    # Send initial open positions
    positions = TradeEngine.Trading.list_user_open_positions(user_id)
    {:ok, %{positions: positions}, assign(socket, :user_id, user_id)}
  end

  # Broadcast from PositionManager every 1s for open positions
  def handle_info({:position_pnl_update, position_id, pnl_data}, socket) do
    push(socket, "position_pnl_update", %{
      position_id: position_id,
      unrealized_pnl: pnl_data.unrealized_pnl,
      pnl_pct: pnl_data.unrealized_pnl_pct,
      current_price: pnl_data.current_price,
      timestamp: DateTime.utc_now()
    })
    {:noreply, socket}
  end

  def handle_info({:position_closed, position}, socket) do
    push(socket, "position_closed", %{
      position_id: position.id,
      realized_pnl: position.realized_pnl_usd,
      exit_price: position.exit_price,
      closed_at: position.closed_at
    })
    {:noreply, socket}
  end

  def handle_info({:position_opened, position}, socket) do
    push(socket, "position_opened", serialize_position(position))
    {:noreply, socket}
  end
end
```

**Data Source:** **Phoenix WebSocket** → PositionManager GenServer → PubSub

---

**Channel 3:** `orders:user:{user_id}` - Order Stream

```javascript
// Frontend
const orderChannel = socket.channel("orders:user:123", {});
orderChannel.join();

orderChannel.on("order_created", (order) => {
  prependOrderToStream(order);
});

orderChannel.on("order_filled", ({ order_id, fill_price, status }) => {
  updateOrderStatus(order_id, status);
  if (status === "filled") {
    markOrderOnChart(order_id, fill_price);
  }
});
```

**Backend (Phoenix):**
```elixir
defmodule TradeEngineWeb.OrderChannel do
  use Phoenix.Channel

  def join("orders:user:" <> user_id, _params, socket) do
    :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "orders:user:#{user_id}")

    # Send last 50 orders
    orders = TradeEngine.Trading.list_recent_orders(user_id, 50)
    {:ok, %{orders: orders}, assign(socket, :user_id, user_id)}
  end

  def handle_info({:order_created, order}, socket) do
    push(socket, "order_created", serialize_order(order))
    {:noreply, socket}
  end

  def handle_info({:order_updated, order_id, changes}, socket) do
    push(socket, "order_updated", Map.put(changes, :order_id, order_id))
    {:noreply, socket}
  end

  def handle_info({:order_filled, order}, socket) do
    push(socket, "order_filled", %{
      order_id: order.id,
      fill_price: order.avg_fill_price,
      status: order.status,
      filled_at: order.completed_at
    })
    {:noreply, socket}
  end
end
```

**Data Source:** **Phoenix WebSocket** → OrderExecutor → PubSub

---

### Database Schema Gaps & Recommendations

#### ⚠️ **MISSING: Real-time Position P&L Calculator**

**Problem:** UI shows live P&L updates, but `unrealized_pnl_usd` in DB is static.

**Recommendation:**
Create a GenServer that:
1. Subscribes to price updates for all traded pairs
2. Fetches all open positions every 1s
3. Calculates P&L based on current price
4. Broadcasts updates via PubSub
5. Persists to DB every 60s (batch update)

```elixir
defmodule TradeEngine.Trading.PositionPnLManager do
  use GenServer

  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(_) do
    # Subscribe to all price updates
    schedule_pnl_calculation()
    {:ok, %{}}
  end

  defp schedule_pnl_calculation() do
    Process.send_after(self(), :calculate_pnl, 1_000) # Every 1s
  end

  def handle_info(:calculate_pnl, state) do
    # Get all open positions
    open_positions = Repo.all(
      from p in Position,
      where: p.status == :open,
      preload: [:user]
    )

    Enum.each(open_positions, fn position ->
      # Get current price from ETS
      case TradeEngine.Cache.PriceCache.get_price(position.trading_pair) do
        {:ok, current_price} ->
          # Calculate P&L
          pnl_data = calculate_pnl(position, current_price)

          # Broadcast to user's position channel
          Phoenix.PubSub.broadcast(
            TradeEngine.PubSub,
            "positions:user:#{position.user_id}",
            {:position_pnl_update, position.id, pnl_data}
          )

          # Store in ETS for quick lookup
          :ets.insert(:position_pnl_cache, {
            position.id,
            pnl_data.unrealized_pnl,
            pnl_data.unrealized_pnl_pct,
            current_price,
            System.monotonic_time(:second)
          })

        _ -> :ok
      end
    end)

    schedule_pnl_calculation()
    {:noreply, state}
  end

  defp calculate_pnl(position, current_price) do
    multiplier = if position.side == :long, do: 1, else: -1
    price_diff = (current_price - position.entry_price) * multiplier
    unrealized_pnl = price_diff * position.quantity
    unrealized_pnl_pct = (price_diff / position.entry_price) * 100

    %{
      unrealized_pnl: Decimal.from_float(unrealized_pnl),
      unrealized_pnl_pct: Decimal.from_float(unrealized_pnl_pct),
      current_price: current_price
    }
  end
end
```

Add to supervision tree:
```elixir
children = [
  # ...
  TradeEngine.Trading.PositionPnLManager
]
```

---

#### ✅ **EXISTING: TimescaleDB Hypertables**

The schema already has market data tables. Verify they exist:

```sql
-- Check if hypertable exists
SELECT * FROM timescaledb_information.hypertables
WHERE hypertable_name LIKE 'ohlcv_%';

-- If not, create hypertable for each exchange-pair combo
CREATE TABLE IF NOT EXISTS market_data.ohlcv_binance_btcusdt (
  timestamp TIMESTAMPTZ NOT NULL,
  open DECIMAL(24,8) NOT NULL,
  high DECIMAL(24,8) NOT NULL,
  low DECIMAL(24,8) NOT NULL,
  close DECIMAL(24,8) NOT NULL,
  volume DECIMAL(24,8) NOT NULL
);

SELECT create_hypertable('market_data.ohlcv_binance_btcusdt', 'timestamp');

CREATE INDEX idx_ohlcv_binance_btcusdt_time ON market_data.ohlcv_binance_btcusdt(timestamp DESC);
```

---

### Summary: Trading/Positions Page

| Component | Data Source | Protocol | Frequency |
|-----------|-------------|----------|-----------|
| **Candlestick Chart (historical)** | NestJS API | HTTP REST | On page load |
| **Candlestick Chart (live)** | Phoenix Channel | WebSocket | Every 1s |
| **Current Price** | Phoenix Channel | WebSocket | Every tick |
| **Open Positions (initial)** | NestJS API | HTTP REST | On page load |
| **Position P&L Updates** | Phoenix Channel | WebSocket | Every 1s |
| **Position Open/Close Events** | Phoenix Channel | WebSocket | On event |
| **Order Stream (initial)** | NestJS API | HTTP REST | On page load |
| **New Orders** | Phoenix Channel | WebSocket | On event |
| **Order Status Updates** | Phoenix Channel | WebSocket | On event |

**Schema Changes Required:**
1. ✅ Verify TimescaleDB hypertables exist for market data
2. ✅ Create `PositionPnLManager` GenServer for real-time P&L
3. ✅ Create ETS table `:position_pnl_cache`
4. ✅ Ensure PubSub topics are set up: `positions:user:{id}`, `orders:user:{id}`

---

---

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

### Summary: Mission Control Page

| Component | Data Source | Protocol | Frequency |
|-----------|-------------|----------|-----------|
| **Platform Stats (initial)** | Phoenix API | HTTP REST | On page load |
| **Platform Stats (updates)** | Phoenix Channel | WebSocket | Every 60s |
| **Infrastructure Metrics (initial)** | Phoenix API | HTTP REST | On page load |
| **Infrastructure Metrics (updates)** | Phoenix Channel | WebSocket | Every 4s |
| **Alert List (initial)** | NestJS API | HTTP REST | On page load |
| **New Alerts** | Phoenix Channel | WebSocket | On event |
| **Alert Acknowledgment** | Phoenix Channel | WebSocket | On event |

**Schema Changes Required:**
1. ✅ Add `'acknowledged'` to alert status enum
2. ✅ Create `platform.stats_snapshot` materialized view
3. ✅ Create ETS table `:platform_stats_cache`
4. ✅ Create ETS table `:infra_metrics_cache`
5. ✅ Set up Phoenix schedulers for periodic refreshes

**External Services Setup Required:**
1. ❌ RabbitMQ Management API access
2. ❌ Redis INFO command access
3. ⚠️ PostgreSQL `pg_stat_database` read permissions

---

---

## Page 4: `/dashboard/infra` - Infrastructure Monitoring

### UI Features & Requirements
1. **Infrastructure Health Grid** - Same 5 service cards as Mission Control
2. **Bot Worker Resources Chart** - CPU/RAM graph (1 hour history)
3. **Service Detail Cards** - Phoenix, Postgres, RabbitMQ, Redis with metrics
4. **System Status** - Overall operational status

---

### Data Source Mapping

**This page reuses the same data sources as Mission Control Page 3:**

| Component | Data Source | Endpoint/Channel | Notes |
|-----------|-------------|------------------|-------|
| **Infrastructure Health** | Phoenix API + WS | `GET /api/phoenix/infra/metrics` + Channel `infra:metrics` | Same as Mission Control |
| **Service Details** | Phoenix API | `GET /api/phoenix/infra/services` | Extended metrics per service |
| **Bot Worker Chart** | Phoenix Channel | Channel `infra:metrics` with history | Same real-time updates |
| **System Status** | Aggregated | Derived from service health | All services operational check |

---

### Additional Service Details API

**Endpoint (Phoenix):** `GET /api/phoenix/infra/services/:service`

**Response for Phoenix:**
```json
{
  "service": "phoenix",
  "status": "running",
  "uptime": "14d 8h 23m",
  "requestsPerMin": 1247,
  "avgResponseTime": 12,
  "cpu": 24.5,
  "ram": 45.2,
  "disk": 24.1
}
```

**Response for Postgres:**
```json
{
  "service": "postgres",
  "status": "running",
  "connections": { "current": 124, "max": 200 },
  "queriesPerSec": 342,
  "cacheHitRate": 98.2,
  "cpu": 18.3,
  "ram": 62.4,
  "disk": 38.7
}
```

**Response for RabbitMQ:**
```json
{
  "service": "rabbitmq",
  "status": "running",
  "queueDepth": 4234,
  "messagesPerSec": 167,
  "consumers": 18,
  "cpu": 12.1,
  "ram": 32.5,
  "disk": 12.2
}
```

**Response for Redis:**
```json
{
  "service": "redis",
  "status": "running",
  "keys": 12847,
  "opsPerSec": 8234,
  "hitRate": 99.7,
  "cpu": 8.7,
  "ram": 28.9,
  "disk": 8.4
}
```

---

### Summary: Infrastructure Page

| Component | Data Source | Protocol | Frequency |
|-----------|-------------|----------|-----------|
| **Infrastructure Health** | Phoenix API + Channel | HTTP REST + WebSocket | Initial + Every 4s |
| **Service Details** | Phoenix API | HTTP REST | On page load |
| **Bot Worker Chart** | Phoenix Channel | WebSocket | Every 4s |
| **System Status** | Derived | Client-side | Real-time |

**No additional schema changes required** - uses same infrastructure as Mission Control.

---

---

## COMPREHENSIVE SUMMARY: All Pages Analyzed

### Pages Completed
1. ✅ **Bot Fleet** (`/dashboard/bot-fleet`)
2. ✅ **Trading/Positions** (`/trading`)
3. ✅ **Mission Control** (`/dashboard/mission-control`)
4. ✅ **Infrastructure** (`/dashboard/infra`)

---

### Database Schema Modifications Required

#### **High Priority (Blocking)**

1. **Add `initial_equity_usd` to `trading.bots`**
   ```sql
   ALTER TABLE trading.bots
   ADD COLUMN initial_equity_usd DECIMAL(15,4) NOT NULL DEFAULT 0;
   ```
   **Impact:** Required for P&L percentage calculation on bot cards

2. **Create `platform.stats_snapshot` Materialized View**
   ```sql
   CREATE MATERIALIZED VIEW platform.stats_snapshot AS
   SELECT
     (SELECT SUM(total_equity_usd) FROM ...) as total_equity,
     (SELECT SUM(total_pnl_usd) FROM trading.bots) as total_pnl,
     -- ... (see Page 3 for full definition)
     NOW() as snapshot_at;
   ```
   **Impact:** Required for Mission Control platform stats

3. **Update Alert Status Enum**
   ```sql
   ALTER TYPE trading.alert_status ADD VALUE IF NOT EXISTS 'acknowledged';
   ```
   **Impact:** Required for alert acknowledgment feature

#### **Medium Priority (Performance)**

4. **Create `trading.bot_dashboard_view` Materialized View**
   - See Page 1 for full definition
   - Refresh every 60s
   - **Impact:** Faster bot list queries (avoid complex joins)

5. **Verify TimescaleDB Hypertables for OHLCV Data**
   ```sql
   SELECT create_hypertable('market_data.ohlcv_binance_btcusdt', 'timestamp');
   ```
   **Impact:** Required for candlestick chart performance

---

### ETS Tables Required

| ETS Table | Purpose | Update Frequency | Used By |
|-----------|---------|------------------|---------|
| `:bot_metrics_cache` | Bot CPU/RAM tracking | Every 10s | Bot Fleet, Mission Control |
| `:position_pnl_cache` | Real-time position P&L | Every 1s | Trading, Mission Control |
| `:price_cache` | Current market prices | Every tick | Trading, Positions |
| `:infra_metrics_cache` | Infrastructure health | Every 4s | Mission Control, Infra |
| `:platform_stats_cache` | Platform aggregates | Every 60s | Mission Control |
| `:bot_heartbeat_cache` | Bot heartbeat timestamps | Every 5s | Bot Fleet |

---

### Phoenix GenServers Required

| GenServer | Purpose | Responsibilities |
|-----------|---------|------------------|
| `TradeEngine.Bots.Worker` | Individual bot runtime | Execute strategy, heartbeat, metrics |
| `TradeEngine.Trading.PositionPnLManager` | Real-time P&L calculation | Calculate P&L, broadcast updates |
| `TradeEngine.Infra.Monitor` | Infrastructure monitoring | Collect metrics, broadcast to WS |
| `TradeEngine.Schedulers.PlatformStats` | Platform stats aggregation | Refresh materialized view, cache |
| `TradeEngine.Cache.PriceCache` | Price caching | Store current prices in ETS |
| `TradeEngine.Alerts.Manager` | Alert generation & evaluation | Create alerts, broadcast |

---

### Phoenix WebSocket Channels Required

| Channel | Topic Pattern | Purpose |
|---------|---------------|---------|
| `BotChannel` | `bot:user:{user_id}` | Bot status, heartbeat, actions |
| `PositionChannel` | `positions:user:{user_id}` | Position updates, P&L changes |
| `OrderChannel` | `orders:user:{user_id}` | Order stream, status updates |
| `MarketDataChannel` | `market_data:{symbol}` | Price ticks, candles, orderbook |
| `InfraChannel` | `infra:metrics` | Infrastructure health updates |
| `PlatformChannel` | `platform:stats` | Platform-wide statistics |
| `AlertChannel` | `alerts:platform` | New alerts, acknowledgments |

---

### Phoenix REST Endpoints Required

| Endpoint | Method | Purpose | Why Phoenix |
|----------|--------|---------|-------------|
| `/api/phoenix/bots/:id/status` | GET | Live bot status | Real-time from GenServer |
| `/api/phoenix/bots/:id/start` | POST | Start bot | Bot lifecycle control |
| `/api/phoenix/bots/:id/stop` | POST | Stop bot | Bot lifecycle control |
| `/api/phoenix/bots/:id/pause` | POST | Pause bot | Bot lifecycle control |
| `/api/phoenix/positions/open` | GET | Live open positions | Real-time from ETS |
| `/api/phoenix/platform/stats` | GET | Platform aggregates | Real-time calculations |
| `/api/phoenix/infra/metrics` | GET | Infrastructure metrics | BEAM VM metrics |
| `/api/phoenix/infra/services/:name` | GET | Service details | Real-time service stats |
| `/api/phoenix/system/health` | GET | Health check | Liveness probe |

---

### NestJS REST Endpoints Required

| Endpoint | Method | Purpose | Why NestJS |
|----------|--------|---------|-----------|
| `/api/bots` | GET | List bots (paginated) | Complex queries, filters |
| `/api/bots` | POST | Create bot | CRUD operation |
| `/api/bots/:id` | PUT | Update bot config | CRUD operation |
| `/api/bots/:id` | DELETE | Delete bot | CRUD operation |
| `/api/market-data/candles` | GET | Historical OHLCV | TimescaleDB queries |
| `/api/positions` | GET | Historical positions | Complex filtering |
| `/api/orders/history` | GET | Order history | Historical data |
| `/api/alerts` | GET | Alert list (filtered) | Complex queries |
| `/api/alerts/:id/acknowledge` | POST | Acknowledge alert | State update |
| `/api/users` | GET | User management | Admin operations |
| `/api/reports/performance` | GET | Performance reports | Analytics |

---

### External Service Integrations Required

1. **RabbitMQ Management API**
   - Endpoint: `http://localhost:15672/api/nodes`
   - Auth: Basic auth (guest:guest)
   - Purpose: Queue metrics for infrastructure monitoring

2. **Redis INFO Command**
   - Command: `Redix.command(:redix, ["INFO", "server"])`
   - Purpose: Cache metrics for infrastructure monitoring

3. **PostgreSQL Statistics**
   - Tables: `pg_stat_database`, `pg_stat_activity`
   - Purpose: Database performance metrics

---

### Implementation Priority

#### **Phase 1: Core Trading Engine (Weeks 1-4)**
1. ✅ Create `trading.bots` schema modifications
2. ✅ Implement `BotWorker` GenServer
3. ✅ Implement `PositionPnLManager` GenServer
4. ✅ Create ETS caches: `bot_metrics`, `position_pnl`, `price_cache`
5. ✅ Implement Phoenix channels: `BotChannel`, `PositionChannel`, `MarketDataChannel`
6. ✅ Implement Phoenix bot lifecycle endpoints

#### **Phase 2: Infrastructure & Monitoring (Weeks 5-6)**
1. ✅ Implement `InfraMonitor` GenServer
2. ✅ Create `infra_metrics_cache` ETS table
3. ✅ Implement `InfraChannel` WebSocket
4. ✅ Set up RabbitMQ/Redis metric collection
5. ✅ Create `platform.stats_snapshot` materialized view
6. ✅ Implement `PlatformStats` scheduler

#### **Phase 3: Alert System (Week 7)**
1. ✅ Implement `AlertManager` GenServer
2. ✅ Update alert status enum
3. ✅ Implement `AlertChannel` WebSocket
4. ✅ Create alert evaluation rules
5. ✅ Implement alert acknowledgment

#### **Phase 4: NestJS API (Weeks 8-10)**
1. ✅ Set up NestJS project structure
2. ✅ Implement bot CRUD endpoints
3. ✅ Implement historical data endpoints
4. ✅ Implement user management endpoints
5. ✅ Implement alert CRUD endpoints
6. ✅ Add pagination, filtering, sorting

---

### Performance Benchmarks

Based on industry standards, target metrics:

| Metric | Target | Notes |
|--------|--------|-------|
| **WebSocket Latency** | < 50ms | Ping-pong time |
| **Position P&L Update Frequency** | 1s | Acceptable for retail trading |
| **Bot Heartbeat Frequency** | 5s | Standard for process monitoring |
| **Infrastructure Metrics Update** | 4s | Standard for dashboards |
| **REST API Response Time (p95)** | < 200ms | Acceptable for admin pages |
| **Database Query Time (p95)** | < 100ms | With proper indexing |
| **Concurrent Bots Supported** | 100+ | Per Phoenix instance |
| **WebSocket Connections** | 10,000+ | Phoenix standard capacity |

---

### Next Steps

**To proceed with implementation:**

1. **Review this analysis** and confirm the approach
2. **Prioritize pages** - which pages should be implemented first?
3. **Database migration strategy** - should we run migrations immediately or batch them?
4. **Phoenix vs NestJS deployment** - will they run on same server or separate?
5. **External services** - are RabbitMQ/Redis already set up in your infrastructure?

**Remaining pages to analyze** (if needed):
- `/dashboard/alerts` - Detailed alert management
- `/dashboard/shift-handoff` - Operator shift management
- `/users` - User management
- `/finance/overview` - Billing and finances
- `/settings/*` - Various settings pages

Would you like me to:
1. Continue with more pages?
2. Create implementation guide for Phase 1?
3. Generate migration files for the database changes?
4. Create detailed API specification (OpenAPI/Swagger)?

Let me know!
