## Page 7: `/dashboard/bot/[id]` - Single Bot Detail Page

### UI Features & Requirements

1. **Bot Header Section**
   - Bot ID, name, status badge
   - Exchange, trading pair, owner email
   - **Credential label** (e.g., "Main Binance Account") **← MULTI-EXCHANGE**
   - **Credential status indicator** (active/expired/invalid) **← MULTI-EXCHANGE**
   - Action buttons (Pause/Resume, Kill Bot)
   - Back button to Bot Fleet

2. **Performance Metrics Row**
   - Session P&L (USD and %)
   - Win Rate (%)
   - Total Trades
   - Open Positions count
   - Uptime

3. **Equity Curve Chart**
   - Real-time line chart showing equity progression
   - Session-scoped (resets on bot restart)
   - Updates as P&L changes

4. **Open Positions Table**
   - Position details (side, pair, entry, current, size, P&L)
   - Age of position
   - Close Position action button
   - Real-time P&L updates

5. **Manual Order Panel**
   - Pair selector
   - Side toggle (LONG/SHORT)
   - Size input
   - Price input (blank = market order)
   - Submit Order button

6. **Close Position Modal**
   - Confirmation dialog for closing position
   - Shows position details before closing

---

### Data Source Mapping

| Component | Data Source | Endpoint/Channel | Update Frequency | Notes |
|-----------|-------------|------------------|------------------|-------|
| **Bot Header Info** | Phoenix API | `GET /api/phoenix/bots/:id` | On page load | Bot configuration and current state |
| **Bot Status Badge** | Phoenix Channel | `bot:bot:{bot_id}` | Real-time | Status changes (running/paused/error) |
| **Performance Metrics** | Phoenix API + Channel | `GET /api/phoenix/bots/:id/metrics` + Channel | Initial + Every 1s | Session P&L, win rate, trades |
| **Equity Curve Data** | Phoenix API | `GET /api/phoenix/bots/:id/equity-curve` | On page load | Historical equity points for session |
| **Equity Curve Updates** | Phoenix Channel | `bot:bot:{bot_id}` | Every 1s | New equity point when P&L changes |
| **Open Positions** | Phoenix API + Channel | `GET /api/phoenix/positions?bot_id={id}` + Channel | Initial + Real-time | Active positions for this bot |
| **Position P&L Updates** | Phoenix Channel | `positions:bot:{bot_id}` | Every 1s | Live P&L recalculation |
| **Bot Actions** | Phoenix API | `POST /api/phoenix/bots/:id/{action}` | On user action | Pause/Resume/Kill bot |
| **Close Position** | Phoenix API | `POST /api/phoenix/positions/:id/close` | On user action | Market close position |
| **Manual Order** | Phoenix API | `POST /api/phoenix/orders` | On user action | Submit new order |

---

### Phoenix Channel: `BotChannel` (Bot-Specific)

**Topic:** `bot:bot:{bot_id}` (Scoped to specific bot)

**Purpose:** Broadcast all real-time updates for a specific bot (status, metrics, equity)

#### WebSocket Event Schemas

**1. Client → Server: Join Bot Channel**

```typescript
// Subscribe to a specific bot's updates
const botChannel = socket.channel(`bot:bot:${botId}`, {});

botChannel.join()
  .receive("ok", (response) => {
    console.log("Joined bot channel", response);
    // Response includes current bot state
  })
  .receive("error", (err) => {
    console.error("Failed to join bot channel", err);
  });
```

**2. Server → Client: Bot Status Changed**

```typescript
interface BotStatusChangedPayload {
  bot_id: string;                                // Bot UUID
  status: "running" | "paused" | "error";        // New status
  previous_status: "running" | "paused" | "error"; // Previous status
  changed_at: string;                            // ISO 8601 timestamp
  reason?: string;                               // Optional reason (e.g., "Manual pause", "Error: connection lost")
}
```

**Event Name:** `bot_status_changed`

**Example:**
```typescript
botChannel.on("bot_status_changed", (payload: BotStatusChangedPayload) => {
  setBot(prev => ({
    ...prev,
    status: payload.status
  }));

  // Show notification
  if (payload.status === "error") {
    showToast(`Bot encountered an error: ${payload.reason}`, "error");
  }
});
```

**3. Server → Client: Bot Metrics Update**

```typescript
interface BotMetricsUpdatePayload {
  bot_id: string;           // Bot UUID
  timestamp: string;        // ISO 8601

  // Session metrics
  session_pnl_usd: number;  // Current session P&L in USD
  session_pnl_pct: number;  // Session P&L percentage
  session_trades: number;   // Total trades this session
  win_rate: number;         // Win rate percentage (0-100)

  // Current state
  open_positions: number;   // Number of open positions
  current_equity_usd: number; // Current equity value

  // Resource usage
  cpu_percent: number;      // CPU usage (0-100)
  ram_mb: number;           // RAM usage in MB

  // Uptime
  uptime_seconds: number;   // Seconds since bot start
}
```

**Event Name:** `bot_metrics_update`

**Update Frequency:** Every 1 second (for active bots)

**Example:**
```typescript
botChannel.on("bot_metrics_update", (payload: BotMetricsUpdatePayload) => {
  setBot(prev => ({
    ...prev,
    pnl: payload.session_pnl_usd,
    pnlPct: payload.session_pnl_pct,
    trades: payload.session_trades,
    winRate: payload.win_rate,
    openPositions: payload.open_positions,
    equity: payload.current_equity_usd,
    cpu: payload.cpu_percent,
    ram: payload.ram_mb,
    uptime: formatUptime(payload.uptime_seconds)
  }));

  // Add new point to equity curve
  setEquityCurve(prev => [
    ...prev,
    {
      t: Date.now(),
      value: payload.current_equity_usd
    }
  ]);
});
```

**4. Server → Client: Position Opened**

```typescript
interface PositionOpenedPayload {
  bot_id: string;
  position: {
    id: string;                        // Position UUID
    pair: string;                      // e.g., "BTC/USDT"
    side: "LONG" | "SHORT";
    entry_price: number;
    size: number;
    opened_at: string;                 // ISO 8601
  };
}
```

**Event Name:** `position_opened`

**Example:**
```typescript
botChannel.on("position_opened", (payload: PositionOpenedPayload) => {
  // Add new position to the list
  setPositions(prev => [
    {
      id: payload.position.id,
      pair: payload.position.pair,
      side: payload.position.side,
      entry: payload.position.entry_price,
      current: payload.position.entry_price, // Initially same as entry
      size: payload.position.size,
      pnl: 0,
      pnlPct: 0,
      age: "0m"
    },
    ...prev
  ]);

  showToast(`Position opened: ${payload.position.side} ${payload.position.pair}`, "success");
});
```

**5. Server → Client: Position Closed**

```typescript
interface PositionClosedPayload {
  bot_id: string;
  position_id: string;
  closed_at: string;        // ISO 8601
  close_price: number;
  realized_pnl_usd: number;
  realized_pnl_pct: number;
  reason: "manual" | "take_profit" | "stop_loss" | "strategy";
}
```

**Event Name:** `position_closed`

**Example:**
```typescript
botChannel.on("position_closed", (payload: PositionClosedPayload) => {
  // Remove position from list
  setPositions(prev => prev.filter(p => p.id !== payload.position_id));

  showToast(
    `Position closed. P&L: ${payload.realized_pnl_usd >= 0 ? '+' : ''}$${payload.realized_pnl_usd.toFixed(2)}`,
    payload.realized_pnl_usd >= 0 ? "success" : "error"
  );
});
```

---

### Phoenix Channel: `PositionChannel` (Bot-Scoped)

**Topic:** `positions:bot:{bot_id}` (All positions for a bot)

**Purpose:** Broadcast real-time P&L updates for all positions of a specific bot

#### WebSocket Event Schema

**Server → Client: Position P&L Update**

```typescript
interface PositionPnLUpdatePayload {
  position_id: string;
  current_price: number;    // Current market price
  unrealized_pnl_usd: number;
  unrealized_pnl_pct: number;
  timestamp: string;        // ISO 8601
}
```

**Event Name:** `position_pnl_update`

**Update Frequency:** Every 1 second (batch update for all positions)

**Example:**
```typescript
const positionChannel = socket.channel(`positions:bot:${botId}`, {});

positionChannel.join();

positionChannel.on("position_pnl_update", (payload: PositionPnLUpdatePayload) => {
  setPositions(prev =>
    prev.map(pos =>
      pos.id === payload.position_id
        ? {
            ...pos,
            current: payload.current_price,
            pnl: payload.unrealized_pnl_usd,
            pnlPct: payload.unrealized_pnl_pct
          }
        : pos
    )
  );
});
```

---

### Phoenix REST API Endpoints

#### 1. Get Bot Details

**Endpoint:** `GET /api/phoenix/bots/:id`

**Response:**
```json
{
  "bot": {
    "id": "BOT-0001",
    "name": "Momentum Grid-742",
    "user_id": "user_123",
    "user_email": "alice.k@trader.io",
    "strategy": "Momentum Grid",
    "exchange": "Binance",
    "credential": {
      "id": "cred_abc123",
      "label": "Main Trading Account",
      "status": "active",
      "last_validated_at": "2026-02-21T14:00:00Z",
      "validation_error": null
    },
    "pair": "BTC/USDT",
    "status": "running",
    "created_at": "2026-02-20T10:00:00Z",
    "started_at": "2026-02-21T08:30:00Z",
    "uptime_seconds": 7200
  }
}
```

**Multi-Exchange Note:** The `credential` object provides visibility into which exchange account the bot is using. This is critical when users have multiple accounts on the same exchange.

#### 2. Get Bot Metrics

**Endpoint:** `GET /api/phoenix/bots/:id/metrics`

**Response:**
```json
{
  "metrics": {
    "session_pnl_usd": 247.82,
    "session_pnl_pct": 2.48,
    "session_trades": 47,
    "win_rate": 68.5,
    "open_positions": 3,
    "current_equity_usd": 10247.82,
    "cpu_percent": 34.2,
    "ram_mb": 128.5,
    "uptime_seconds": 7200
  }
}
```

**Data Source:** Read from bot's GenServer state + ETS cache

#### 3. Get Bot Equity Curve

**Endpoint:** `GET /api/phoenix/bots/:id/equity-curve`

**Query Parameters:**
- `session` - Boolean, if true returns current session only (default: true)
- `limit` - Number of data points (default: 100, max: 1000)

**Response:**
```json
{
  "equity_curve": [
    { "t": 1708502400000, "value": 10000.00 },
    { "t": 1708502460000, "value": 10012.50 },
    { "t": 1708502520000, "value": 10025.30 },
    { "t": 1708509600000, "value": 10247.82 }
  ],
  "initial_equity": 10000.00,
  "current_equity": 10247.82,
  "data_points": 120
}
```

**Data Source:** ETS cache maintained by BotWorker GenServer

#### 4. Get Bot Positions

**Endpoint:** `GET /api/phoenix/positions?bot_id={bot_id}`

**Query Parameters:**
- `bot_id` - Required: Bot UUID
- `status` - Filter by status (open, closed, all) - default: open

**Response:**
```json
{
  "positions": [
    {
      "id": "POS-001",
      "bot_id": "BOT-0001",
      "pair": "BTC/USDT",
      "side": "LONG",
      "entry_price": 42500.00,
      "current_price": 42680.00,
      "size": 0.05,
      "unrealized_pnl_usd": 9.00,
      "unrealized_pnl_pct": 0.42,
      "opened_at": "2026-02-21T09:15:00Z",
      "age_seconds": 4500
    },
    {
      "id": "POS-002",
      "bot_id": "BOT-0001",
      "pair": "ETH/USDT",
      "side": "SHORT",
      "entry_price": 2850.00,
      "current_price": 2835.00,
      "size": 1.2,
      "unrealized_pnl_usd": 18.00,
      "unrealized_pnl_pct": 0.53,
      "opened_at": "2026-02-21T10:00:00Z",
      "age_seconds": 1800
    }
  ],
  "total": 2
}
```

**Data Source:** ETS cache `:position_pnl_cache` maintained by PositionPnLManager

#### 5. Pause Bot

**Endpoint:** `POST /api/phoenix/bots/:id/pause`

**Request Body:** (Optional)
```json
{
  "reason": "Manual pause for inspection"
}
```

**Response:**
```json
{
  "success": true,
  "bot": {
    "id": "BOT-0001",
    "status": "paused",
    "paused_at": "2026-02-21T14:30:00Z"
  }
}
```

**Side Effects:**
- Calls `BotWorker.pause(bot_id)` GenServer
- Updates bot status in PostgreSQL
- Broadcasts `bot_status_changed` event to WebSocket
- Logs activity to `operations.shift_activities`
- Cancels all pending orders

#### 6. Resume Bot

**Endpoint:** `POST /api/phoenix/bots/:id/resume`

**Response:**
```json
{
  "success": true,
  "bot": {
    "id": "BOT-0001",
    "status": "running",
    "resumed_at": "2026-02-21T14:35:00Z"
  }
}
```

**Side Effects:**
- Calls `BotWorker.resume(bot_id)` GenServer
- Updates bot status in PostgreSQL
- Broadcasts `bot_status_changed` event
- Logs activity to shift activities

#### 7. Kill Bot

**Endpoint:** `POST /api/phoenix/bots/:id/kill`

**Request Body:**
```json
{
  "reason": "High CPU usage",
  "close_positions": true  // If true, close all open positions at market
}
```

**Response:**
```json
{
  "success": true,
  "bot": {
    "id": "BOT-0001",
    "status": "stopped",
    "stopped_at": "2026-02-21T14:40:00Z"
  },
  "positions_closed": 2,
  "final_equity_usd": 10247.82
}
```

**Side Effects:**
- Calls `BotSupervisor.kill_bot(bot_id)` to stop GenServer
- Closes all positions if `close_positions: true`
- Updates bot status to "stopped" in PostgreSQL
- Broadcasts `bot_status_changed` event
- Logs critical activity to shift activities
- Persists final equity curve to PostgreSQL

#### 8. Close Position

**Endpoint:** `POST /api/phoenix/positions/:id/close`

**Request Body:**
```json
{
  "close_type": "market",  // "market" or "limit"
  "limit_price": null,     // Only if close_type = "limit"
  "reason": "Manual close via UI"
}
```

**Response:**
```json
{
  "success": true,
  "position": {
    "id": "POS-001",
    "status": "closed",
    "close_price": 42680.00,
    "realized_pnl_usd": 9.00,
    "realized_pnl_pct": 0.42,
    "closed_at": "2026-02-21T14:45:00Z"
  }
}
```

**Side Effects:**
- Submits market sell/buy order to exchange
- Updates position status to "closed" in PostgreSQL
- Updates `trading.positions.closed_at`, `close_price`, `realized_pnl_usd`
- Broadcasts `position_closed` event to WebSocket
- Logs activity to shift activities
- Updates bot session metrics

#### 9. Submit Manual Order

**Endpoint:** `POST /api/phoenix/orders`

**Request Body:**
```json
{
  "bot_id": "BOT-0001",
  "pair": "BTC/USDT",
  "side": "LONG",         // "LONG" or "SHORT"
  "size": 0.05,
  "order_type": "market", // "market" or "limit"
  "limit_price": null,    // Required if order_type = "limit"
  "reduce_only": false
}
```

**Response:**
```json
{
  "success": true,
  "order": {
    "id": "ORD-12345",
    "bot_id": "BOT-0001",
    "pair": "BTC/USDT",
    "side": "LONG",
    "size": 0.05,
    "order_type": "market",
    "status": "pending",
    "submitted_at": "2026-02-21T14:50:00Z"
  }
}
```

**Side Effects:**
- Submits order to exchange via bot's trading adapter
- Creates record in `trading.orders` table
- Bot GenServer processes order execution
- Broadcasts order status updates via `OrderChannel`
- May create new position when order fills

**Validation:**
- Bot must be in "running" status
- User must own the bot
- **Credential must be active** (not expired/invalid) **← MULTI-EXCHANGE**
- **Pair must be enabled for the bot's credential** **← MULTI-EXCHANGE**
- Pair must match bot's configured trading pair
- **Size must be within credential's allowed limits** (from `exchange.enabled_asset_pairs`) **← MULTI-EXCHANGE**
- Size must be within bot's risk limits

**Multi-Exchange Validation Logic:**
```elixir
def submit_manual_order(bot_id, order_params) do
  bot = Repo.get!(Bot, bot_id) |> Repo.preload([:credential])

  # ✅ Validate credential is active
  unless bot.credential.status == :active do
    {:error, "Credential '#{bot.credential.label}' is not active. Status: #{bot.credential.status}"}
  end

  # ✅ Validate pair is enabled for credential
  unless pair_enabled_for_credential?(bot.credential_id, order_params.pair) do
    {:error, "Trading pair #{order_params.pair} is not enabled for credential '#{bot.credential.label}'"}
  end

  # ✅ Validate order size within credential limits
  pair_config = get_pair_config(bot.credential_id, order_params.pair)

  cond do
    order_params.size < pair_config.min_order_size ->
      {:error, "Order size below minimum (#{pair_config.min_order_size})"}

    order_params.size > pair_config.max_order_size ->
      {:error, "Order size exceeds maximum (#{pair_config.max_order_size})"}

    true ->
      # Submit order using credential
      TradingAdapter.submit_order(bot.credential, order_params)
  end
end

defp pair_enabled_for_credential?(credential_id, pair) do
  Repo.exists?(
    from eap in EnabledAssetPair,
    where: eap.credential_id == ^credential_id and
           eap.symbol == ^pair and
           eap.is_trading_enabled == true
  )
end
```

---

### Database Schema Requirements

#### Current Schema: `trading.bots`

✅ **Already Supported:**
- Bot identification (id, name, user_id)
- **Credential reference** (`credential_id` → `exchange.user_credentials`) **← MULTI-EXCHANGE**
- Configuration (strategy, exchange, pair)
- Status tracking
- Timestamps (created_at, updated_at)

**Multi-Exchange Note:** The bot's exchange is derived from `credential_id → user_credentials → adapter_id → adapters.code`. This allows users to have multiple bots on the same exchange using different credentials.

❌ **Missing Fields:**
- `session_start_time` - When current session started
- `session_initial_equity_usd` - Starting equity for current session
- `session_trades_count` - Number of trades in current session
- `session_wins_count` - Number of winning trades in session
- `uptime_seconds` - Total uptime counter

#### Recommended Schema Updates

```sql
-- Add session tracking fields
ALTER TABLE trading.bots
ADD COLUMN session_start_time TIMESTAMPTZ,
ADD COLUMN session_initial_equity_usd DECIMAL(15,4),
ADD COLUMN session_trades_count INTEGER DEFAULT 0,
ADD COLUMN session_wins_count INTEGER DEFAULT 0,
ADD COLUMN uptime_seconds INTEGER DEFAULT 0;

-- Add indexes for bot detail queries
CREATE INDEX idx_bots_user_status ON trading.bots(user_id, status);
CREATE INDEX idx_bots_session_start ON trading.bots(session_start_time) WHERE status = 'running';

-- Add comments
COMMENT ON COLUMN trading.bots.session_start_time IS 'Start time of current trading session (reset on bot restart)';
COMMENT ON COLUMN trading.bots.session_initial_equity_usd IS 'Initial equity at session start for P&L calculation';
```

#### New Table: `trading.bot_equity_snapshots`

**Purpose:** Store equity curve data points for historical charting

```sql
CREATE TABLE trading.bot_equity_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID NOT NULL REFERENCES trading.bots(bot_id) ON DELETE CASCADE,
    session_id UUID,  -- Groups snapshots by session

    -- Equity data
    equity_usd DECIMAL(15,4) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Session context
    trades_count INTEGER NOT NULL DEFAULT 0,
    win_rate DECIMAL(5,2),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_equity_snapshots_bot_session ON trading.bot_equity_snapshots(bot_id, session_id, timestamp DESC);
CREATE INDEX idx_equity_snapshots_timestamp ON trading.bot_equity_snapshots(timestamp DESC);

-- Convert to TimescaleDB hypertable for efficient time-series storage
SELECT create_hypertable('trading.bot_equity_snapshots', 'timestamp');

-- Retention policy: Keep equity snapshots for 90 days
SELECT add_retention_policy('trading.bot_equity_snapshots', INTERVAL '90 days');

-- Comments
COMMENT ON TABLE trading.bot_equity_snapshots IS 'Time-series equity curve data for bots';
COMMENT ON COLUMN trading.bot_equity_snapshots.session_id IS 'Groups snapshots by session (reset on bot restart)';
```

**Data Population Strategy:**
- GenServer stores snapshots in ETS during session (fast)
- Periodically flush ETS to PostgreSQL every 5 minutes (persistence)
- On bot stop/kill, flush all remaining snapshots
- On page load, read from PostgreSQL for historical data
- Use ETS for real-time additions to chart

---

### Phoenix GenServer: `BotWorker`

**Purpose:** Manage individual bot lifecycle, execute strategy, track session metrics

**Implementation Example:**

```elixir
defmodule TradeEngine.Bots.Worker do
  use GenServer
  require Logger

  alias TradeEngine.Repo
  alias TradeEngine.Schema.{Bot, Position}
  alias Phoenix.PubSub

  @metrics_broadcast_interval 1_000  # 1 second
  @equity_snapshot_interval 60_000   # 1 minute

  # State structure
  defstruct [
    :bot_id,
    :bot,
    :strategy_pid,
    :session_id,
    :equity_curve,        # In-memory equity curve points
    :metrics_timer,
    :snapshot_timer
  ]

  ## Client API

  def start_link(bot_id) do
    GenServer.start_link(__MODULE__, bot_id, name: via_tuple(bot_id))
  end

  def pause(bot_id) do
    GenServer.call(via_tuple(bot_id), :pause)
  end

  def resume(bot_id) do
    GenServer.call(via_tuple(bot_id), :resume)
  end

  def get_metrics(bot_id) do
    GenServer.call(via_tuple(bot_id), :get_metrics)
  end

  def get_equity_curve(bot_id) do
    GenServer.call(via_tuple(bot_id), :get_equity_curve)
  end

  ## Server Callbacks

  def init(bot_id) do
    bot = Repo.get!(Bot, bot_id)

    # Initialize session
    session_id = UUID.uuid4()
    now = DateTime.utc_now()

    # Update bot with session start
    changeset = Bot.changeset(bot, %{
      status: :running,
      session_start_time: now,
      session_initial_equity_usd: bot.current_equity_usd,
      session_trades_count: 0,
      session_wins_count: 0
    })

    {:ok, bot} = Repo.update(changeset)

    # Start strategy
    {:ok, strategy_pid} = start_strategy(bot)

    # Initialize state
    state = %__MODULE__{
      bot_id: bot_id,
      bot: bot,
      strategy_pid: strategy_pid,
      session_id: session_id,
      equity_curve: [{DateTime.to_unix(now, :millisecond), bot.current_equity_usd}]
    }

    # Start timers
    state = schedule_metrics_broadcast(state)
    state = schedule_equity_snapshot(state)

    # Subscribe to position updates
    :ok = PubSub.subscribe(TradeEngine.PubSub, "positions:bot:#{bot_id}")

    Logger.info("BotWorker started for bot #{bot_id}")

    {:ok, state}
  end

  def handle_call(:pause, _from, state) do
    # Stop strategy execution
    :ok = Strategy.pause(state.strategy_pid)

    # Update status
    changeset = Bot.changeset(state.bot, %{status: :paused})
    {:ok, bot} = Repo.update(changeset)

    # Broadcast status change
    broadcast_status_change(bot, :running, :paused, "Manual pause")

    {:reply, :ok, %{state | bot: bot}}
  end

  def handle_call(:resume, _from, state) do
    :ok = Strategy.resume(state.strategy_pid)

    changeset = Bot.changeset(state.bot, %{status: :running})
    {:ok, bot} = Repo.update(changeset)

    broadcast_status_change(bot, :paused, :running, "Manual resume")

    {:reply, :ok, %{state | bot: bot}}
  end

  def handle_call(:get_metrics, _from, state) do
    metrics = calculate_metrics(state)
    {:reply, {:ok, metrics}, state}
  end

  def handle_call(:get_equity_curve, _from, state) do
    {:reply, {:ok, state.equity_curve}, state}
  end

  def handle_info(:broadcast_metrics, state) do
    # Calculate current metrics
    metrics = calculate_metrics(state)

    # Broadcast via WebSocket
    TradeEngineWeb.Endpoint.broadcast("bot:bot:#{state.bot_id}", "bot_metrics_update", metrics)

    # Update equity curve
    timestamp = System.system_time(:millisecond)
    equity_curve = state.equity_curve ++ [{timestamp, metrics.current_equity_usd}]

    # Keep only last 1000 points in memory
    equity_curve = Enum.take(equity_curve, -1000)

    # Schedule next broadcast
    state = schedule_metrics_broadcast(%{state | equity_curve: equity_curve})

    {:noreply, state}
  end

  def handle_info(:snapshot_equity, state) do
    # Persist equity snapshots to PostgreSQL
    persist_equity_snapshots(state)

    state = schedule_equity_snapshot(state)
    {:noreply, state}
  end

  def handle_info({:position_pnl_update, position_id, pnl}, state) do
    # Position P&L changed, will be reflected in next metrics broadcast
    {:noreply, state}
  end

  ## Private Functions

  defp calculate_metrics(state) do
    bot = Repo.preload(state.bot, :positions)

    # Calculate session P&L
    session_pnl_usd = bot.current_equity_usd - bot.session_initial_equity_usd
    session_pnl_pct = (session_pnl_usd / bot.session_initial_equity_usd) * 100

    # Calculate win rate
    win_rate = if bot.session_trades_count > 0 do
      (bot.session_wins_count / bot.session_trades_count) * 100
    else
      0.0
    end

    # Get open positions count
    open_positions = Enum.count(bot.positions, & &1.status == :open)

    # Get resource usage from system
    {cpu, ram} = get_process_resources(state.strategy_pid)

    # Calculate uptime
    uptime_seconds = DateTime.diff(DateTime.utc_now(), bot.session_start_time, :second)

    %{
      bot_id: state.bot_id,
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
      session_pnl_usd: Decimal.to_float(session_pnl_usd),
      session_pnl_pct: Float.round(session_pnl_pct, 2),
      session_trades: bot.session_trades_count,
      win_rate: Float.round(win_rate, 1),
      open_positions: open_positions,
      current_equity_usd: Decimal.to_float(bot.current_equity_usd),
      cpu_percent: cpu,
      ram_mb: ram,
      uptime_seconds: uptime_seconds
    }
  end

  defp broadcast_status_change(bot, previous_status, new_status, reason) do
    TradeEngineWeb.Endpoint.broadcast("bot:bot:#{bot.bot_id}", "bot_status_changed", %{
      bot_id: bot.bot_id,
      status: new_status,
      previous_status: previous_status,
      changed_at: DateTime.utc_now() |> DateTime.to_iso8601(),
      reason: reason
    })
  end

  defp schedule_metrics_broadcast(state) do
    timer = Process.send_after(self(), :broadcast_metrics, @metrics_broadcast_interval)
    %{state | metrics_timer: timer}
  end

  defp schedule_equity_snapshot(state) do
    timer = Process.send_after(self(), :snapshot_equity, @equity_snapshot_interval)
    %{state | snapshot_timer: timer}
  end

  defp persist_equity_snapshots(state) do
    # Batch insert equity snapshots
    snapshots = Enum.map(state.equity_curve, fn {timestamp, equity} ->
      %{
        bot_id: state.bot_id,
        session_id: state.session_id,
        equity_usd: equity,
        timestamp: DateTime.from_unix!(timestamp, :millisecond),
        trades_count: state.bot.session_trades_count,
        created_at: DateTime.utc_now()
      }
    end)

    Repo.insert_all("bot_equity_snapshots", snapshots, on_conflict: :nothing)
  end

  defp via_tuple(bot_id) do
    {:via, Registry, {TradeEngine.BotRegistry, bot_id}}
  end
end
```

---

### Data Flow Summary

```
1. PAGE LOAD
   Frontend → Phoenix GET /api/phoenix/bots/:id → Read from PostgreSQL → Return bot details
   Frontend → Phoenix GET /api/phoenix/bots/:id/metrics → Read from GenServer state → Return metrics
   Frontend → Phoenix GET /api/phoenix/bots/:id/equity-curve → Read from ETS/PostgreSQL → Return chart data
   Frontend → Phoenix GET /api/phoenix/positions?bot_id=:id → Read from ETS → Return positions

2. REAL-TIME UPDATES
   BotWorker GenServer → Every 1s → Calculate metrics → Broadcast to `bot:bot:{id}` channel
   Frontend subscribes → Receives bot_metrics_update → Updates UI state

   PositionPnLManager → Every 1s → Calculate P&L → Broadcast to `positions:bot:{id}` channel
   Frontend subscribes → Receives position_pnl_update → Updates positions table

3. USER ACTIONS
   Frontend → POST /api/phoenix/bots/:id/pause → BotWorker.pause() → Update PostgreSQL → Broadcast status change
   All clients → Receive bot_status_changed event → Update UI

   Frontend → POST /api/phoenix/positions/:id/close → Submit market order → Close position → Broadcast event
   All clients → Receive position_closed event → Remove from table

4. EQUITY PERSISTENCE
   BotWorker → Every 1 minute → Flush equity_curve from ETS → Batch insert to PostgreSQL
   On bot stop → Flush remaining snapshots → Persist final state
```

---

### Summary Table

| Component | Data Source | Protocol | Frequency | Storage |
|-----------|-------------|----------|-----------|---------|
| **Bot Details** | Phoenix API | HTTP REST | On page load | PostgreSQL `trading.bots` |
| **Bot Metrics** | Phoenix API + Channel | HTTP REST + WebSocket | Initial + Every 1s | GenServer state |
| **Bot Status** | Phoenix Channel | WebSocket | Real-time (event-driven) | PostgreSQL + broadcast |
| **Equity Curve** | Phoenix API + Channel | HTTP REST + WebSocket | Initial + Every 1s | ETS → PostgreSQL (every 1m) |
| **Open Positions** | Phoenix API + Channel | HTTP REST + WebSocket | Initial + Every 1s | ETS `:position_pnl_cache` |
| **Bot Actions** | Phoenix API | HTTP REST | On user action | GenServer call → PostgreSQL |
| **Close Position** | Phoenix API | HTTP REST | On user action | Trading adapter → PostgreSQL |
| **Manual Order** | Phoenix API | HTTP REST | On user action | Trading adapter → PostgreSQL |

---

### Frontend Implementation Notes

**WebSocket Connection:**
```typescript
import { Socket } from "phoenix";

const socket = new Socket("/socket", {
  params: { token: userToken }
});

socket.connect();

// Subscribe to bot-specific channel
const botChannel = socket.channel(`bot:bot:${botId}`, {});

botChannel.join()
  .receive("ok", (resp) => {
    console.log("Joined bot channel", resp);
  })
  .receive("error", (err) => {
    console.error("Failed to join", err);
  });

// Listen for metrics updates
botChannel.on("bot_metrics_update", (metrics) => {
  setBot(prev => ({
    ...prev,
    pnl: metrics.session_pnl_usd,
    pnlPct: metrics.session_pnl_pct,
    trades: metrics.session_trades,
    winRate: metrics.win_rate,
    openPositions: metrics.open_positions,
    equity: metrics.current_equity_usd,
    cpu: metrics.cpu_percent,
    ram: metrics.ram_mb,
    uptime: formatUptime(metrics.uptime_seconds)
  }));

  // Update equity curve
  setEquityCurve(prev => [
    ...prev,
    { t: Date.now(), value: metrics.current_equity_usd }
  ].slice(-100)); // Keep last 100 points
});

// Listen for status changes
botChannel.on("bot_status_changed", (payload) => {
  setBot(prev => ({ ...prev, status: payload.status }));

  if (payload.status === "error") {
    showToast(`Bot error: ${payload.reason}`, "error");
  }
});

// Subscribe to position updates
const positionChannel = socket.channel(`positions:bot:${botId}`, {});
positionChannel.join();

positionChannel.on("position_pnl_update", (payload) => {
  setPositions(prev =>
    prev.map(pos =>
      pos.id === payload.position_id
        ? {
            ...pos,
            current: payload.current_price,
            pnl: payload.unrealized_pnl_usd,
            pnlPct: payload.unrealized_pnl_pct
          }
        : pos
    )
  );
});

positionChannel.on("position_closed", (payload) => {
  setPositions(prev => prev.filter(p => p.id !== payload.position_id));
  showToast(`Position closed. P&L: ${payload.realized_pnl_usd >= 0 ? '+' : ''}$${payload.realized_pnl_usd.toFixed(2)}`, "success");
});
```

**API Integration:**
```typescript
// Load initial bot data
async function loadBotData() {
  const [botRes, metricsRes, equityRes, positionsRes] = await Promise.all([
    fetch(`/api/phoenix/bots/${botId}`),
    fetch(`/api/phoenix/bots/${botId}/metrics`),
    fetch(`/api/phoenix/bots/${botId}/equity-curve`),
    fetch(`/api/phoenix/positions?bot_id=${botId}`)
  ]);

  const bot = await botRes.json();
  const metrics = await metricsRes.json();
  const equity = await equityRes.json();
  const positions = await positionsRes.json();

  setBot({ ...bot.bot, ...metrics.metrics });
  setEquityCurve(equity.equity_curve);
  setPositions(positions.positions);
}

// Pause bot
async function pauseBot() {
  const res = await fetch(`/api/phoenix/bots/${botId}/pause`, {
    method: "POST"
  });

  if (res.ok) {
    // Status will update via WebSocket
    showToast("Bot paused successfully", "success");
  }
}

// Close position
async function closePosition(positionId: string) {
  const res = await fetch(`/api/phoenix/positions/${positionId}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      close_type: "market",
      reason: "Manual close via UI"
    })
  });

  if (res.ok) {
    // Position removal will happen via WebSocket
    showToast("Position closed", "success");
  }
}

// Submit manual order
async function submitManualOrder() {
  const res = await fetch("/api/phoenix/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bot_id: botId,
      pair: newOrder.pair,
      side: newOrder.side,
      size: parseFloat(newOrder.size),
      order_type: newOrder.price ? "limit" : "market",
      limit_price: newOrder.price ? parseFloat(newOrder.price) : null
    })
  });

  if (res.ok) {
    const data = await res.json();
    showToast(`Order submitted: ${data.order.id}`, "success");
    setNewOrder({ pair: bot.pair, side: "LONG", size: "", price: "" });
  }
}
```

---

### Performance Considerations

1. **Equity Curve Optimization**
   - Keep only last 100-1000 points in memory (client-side)
   - Use TimescaleDB for efficient time-series storage
   - Implement retention policy (90 days)
   - Batch insert snapshots every minute, not every second

2. **WebSocket Scalability**
   - Bot-specific channels reduce broadcast scope
   - Use Phoenix PubSub for efficient fan-out
   - Batch position updates (all positions in one event)
   - Throttle metrics broadcast to 1Hz (sufficient for UI)

3. **GenServer State Management**
   - Store only active session data in GenServer
   - Persist to PostgreSQL periodically
   - Use ETS for frequently accessed data (positions, equity)
   - Implement supervision tree for fault tolerance

4. **Query Optimization**
   - Index on `bot_id` for position queries
   - Use `bot_id + session_id + timestamp` composite index for equity
   - Preload associations to avoid N+1 queries
   - Cache bot configuration (rarely changes)

5. **Rate Limiting**
   - Limit manual orders to 10/minute per bot
   - Throttle bot action requests (pause/resume) to prevent spam
   - WebSocket connection limit: 1 per user per bot

---

### Testing Checklist

- [ ] Bot details load correctly on page load
- [ ] Real-time metrics update every second
- [ ] Equity curve renders and updates smoothly
- [ ] Position table shows current P&L in real-time
- [ ] Pause/Resume buttons work and update status immediately
- [ ] Kill bot stops GenServer and closes positions
- [ ] Close position modal works and submits correctly
- [ ] Manual order form validates inputs
- [ ] Manual order submission creates order successfully
- [ ] WebSocket reconnects automatically on disconnect
- [ ] Multiple clients see the same real-time updates
- [ ] Bot status changes broadcast to all subscribed clients
- [ ] Equity snapshots persist to database correctly
- [ ] Page works with bot in error state
- [ ] Performance is acceptable with 100+ data points in equity curve

---

**[← Previous: Shift Handoff](./06-shift-handoff.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Users List →](./08-users-list.md)**
