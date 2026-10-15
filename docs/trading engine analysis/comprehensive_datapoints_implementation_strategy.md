# Comprehensive Trading Engine Data Points & Implementation Strategy

## Executive Summary

This document provides a complete analysis of data points required by the Next.js UI, current Phoenix backend capabilities, identified gaps, and recommended implementation strategies including bot creation, user assignment, data tracking, real-time delivery, and caching strategies.

**Last Updated:** February 21, 2026
**Analysis Based On:**
- stella-nextjs UI requirements (7 pages analyzed)
- umbrella-app Phoenix backend (trade_engine, trade_engine_web, sys_admin)
- Existing trading engine analysis documents
- Current database schema and transaction patterns

---

## Table of Contents

1. [Data Points Inventory](#1-data-points-inventory)
2. [Backend Capability Assessment](#2-backend-capability-assessment)
3. [Gap Analysis](#3-gap-analysis)
4. [Bot Lifecycle Management](#4-bot-lifecycle-management)
5. [User Assignment & Multi-Tenancy](#5-user-assignment--multi-tenancy)
6. [Real-Time Data Delivery Strategy](#6-real-time-data-delivery-strategy)
7. [Caching Strategy](#7-caching-strategy)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [Recommended Remedies](#9-recommended-remedies)

---

## 1. Data Points Inventory

### 1.1 Bot-Level Data (Core Trading Entities)

| Data Point | UI Requirement | Current Backend | Status |
|------------|---------------|-----------------|---------|
| Bot ID | ✅ Required | ❌ No concept | **MISSING** |
| Bot Name | ✅ Required | ❌ No concept | **MISSING** |
| Owner/User Email | ✅ Required | ⚠️ Virtual only | **PARTIAL** |
| Strategy Type | ✅ Required | ⚠️ Hardcoded | **PARTIAL** |
| Exchange | ✅ Required | ✅ From position | **EXISTS** |
| Trading Pair | ✅ Required | ✅ From position | **EXISTS** |
| Bot Status (running/paused/error) | ✅ Required | ❌ No tracking | **MISSING** |
| Profit & Loss (PnL) | ✅ Required | ✅ In positions | **EXISTS** |
| PnL Percentage | ✅ Required | ✅ Calculated | **EXISTS** |
| Total Equity | ✅ Required | ⚠️ Virtual balance | **PARTIAL** |
| Open Positions Count | ✅ Required | ✅ Queryable | **EXISTS** |
| Total Trades Executed | ✅ Required | ✅ In transactions | **EXISTS** |
| Win Rate (%) | ✅ Required | ❌ Not calculated | **MISSING** |
| Uptime Duration | ✅ Required | ❌ No tracking | **MISSING** |
| CPU Utilization | ✅ Required | ❌ No tracking | **MISSING** |
| RAM Utilization | ✅ Required | ❌ No tracking | **MISSING** |
| Last Heartbeat | ✅ Required | ❌ No tracking | **MISSING** |

**Key Insight:** The current backend operates **without the concept of a "Bot"** entity. Trading happens via hardcoded strategies in GenServer processes, not configurable bot instances.

### 1.2 Position Data

| Data Point | UI Requirement | Current Backend | Status |
|------------|---------------|-----------------|---------|
| Position ID | ✅ Required | ✅ UUID in DB | **EXISTS** |
| Trading Pair | ✅ Required | ✅ Symbol field | **EXISTS** |
| Side (LONG/SHORT) | ✅ Required | ✅ position_type | **EXISTS** |
| Entry Price | ✅ Required | ✅ entry_price | **EXISTS** |
| Current/Mark Price | ✅ Required | ⚠️ Cached separately | **PARTIAL** |
| Position Size | ✅ Required | ✅ quantity | **EXISTS** |
| Unrealized PnL ($) | ✅ Required | ⚠️ Not updated | **PARTIAL** |
| Unrealized PnL (%) | ✅ Required | ⚠️ Not updated | **PARTIAL** |
| Position Age | ✅ Required | ✅ inserted_at | **EXISTS** |
| Associated Bot ID | ✅ Required | ❌ No concept | **MISSING** |
| Strategy Name | ✅ Required | ⚠️ Hardcoded | **PARTIAL** |
| Physics Data | ⚠️ Optional | ✅ Full model | **EXISTS** |

**Critical Issue:** All 31,468 positions have `status='open'` - position close logic is broken.

### 1.3 Order Data

| Data Point | UI Requirement | Current Backend | Status |
|------------|---------------|-----------------|---------|
| Order ID | ✅ Required | ❌ Table empty | **MISSING** |
| Timestamp | ✅ Required | ✅ In transactions | **PARTIAL** |
| Bot ID | ✅ Required | ❌ No concept | **MISSING** |
| Exchange | ✅ Required | ✅ In transactions | **EXISTS** |
| Trading Pair | ✅ Required | ✅ In transactions | **EXISTS** |
| Side (BUY/SELL) | ✅ Required | ✅ transaction_type | **EXISTS** |
| Order Size | ✅ Required | ✅ quantity | **EXISTS** |
| Order Price | ✅ Required | ✅ price | **EXISTS** |
| Order Status | ✅ Required | ✅ status | **EXISTS** |
| Order Type (LIMIT/MARKET) | ✅ Required | ❌ Not tracked | **MISSING** |
| Fill Status | ✅ Required | ⚠️ In status | **PARTIAL** |

**Critical Issue:** `trading_orders` table has **0 rows** - engine bypasses order lifecycle entirely.

### 1.4 Infrastructure Metrics

| Data Point | UI Requirement | Current Backend | Status |
|------------|---------------|-----------------|---------|
| Phoenix Server Metrics | ✅ Required | ❌ Not tracked | **MISSING** |
| Postgres Metrics | ✅ Required | ❌ Not tracked | **MISSING** |
| RabbitMQ Metrics | ✅ Required | ❌ Not available | **MISSING** |
| Redis Metrics | ✅ Required | ❌ Not available | **MISSING** |
| Bot Worker Metrics | ✅ Required | ❌ Not tracked | **MISSING** |
| CPU/RAM/Disk per service | ✅ Required | ❌ Not tracked | **MISSING** |
| Service Status | ✅ Required | ❌ Not tracked | **MISSING** |
| Uptime | ✅ Required | ❌ Not tracked | **MISSING** |
| Request/Query Rates | ✅ Required | ⚠️ Telemetry exists | **PARTIAL** |

**Note:** Phoenix has Telemetry infrastructure but needs instrumentation for these specific metrics.

### 1.5 Alert Data

| Data Point | UI Requirement | Current Backend | Status |
|------------|---------------|-----------------|---------|
| Alert ID | ✅ Required | ❌ Not implemented | **MISSING** |
| Alert Message | ✅ Required | ❌ Not implemented | **MISSING** |
| Severity (critical/warning/info) | ✅ Required | ❌ Not implemented | **MISSING** |
| Service/Bot ID | ✅ Required | ❌ Not implemented | **MISSING** |
| Timestamp | ✅ Required | ❌ Not implemented | **MISSING** |
| Acknowledgment Status | ✅ Required | ❌ Not implemented | **MISSING** |

**Note:** Alert system exists in schema (`alerts.trading_alert`) but not integrated with trading engine.

### 1.6 Shift Handoff & Operations

| Data Point | UI Requirement | Current Backend | Status |
|------------|---------------|-----------------|---------|
| Current Operator | ✅ Required | ❌ Not implemented | **MISSING** |
| Shift Start Time | ✅ Required | ❌ Not implemented | **MISSING** |
| Actions Taken | ✅ Required | ❌ Not implemented | **MISSING** |
| Incident Count | ✅ Required | ❌ Not implemented | **MISSING** |
| Activity Logs | ✅ Required | ⚠️ Audit log exists | **PARTIAL** |
| Watch List Items | ✅ Required | ❌ Not implemented | **MISSING** |

**Note:** `compliance.audit_log` schema exists but needs integration.

### 1.7 Bot Engine Configuration

| Data Point | UI Requirement | Current Backend | Status |
|------------|---------------|-----------------|---------|
| Heartbeat Interval | ✅ Required | ⚠️ Hardcoded | **PARTIAL** |
| Order Timeout | ✅ Required | ⚠️ Hardcoded | **PARTIAL** |
| Retry Attempts | ✅ Required | ⚠️ Hardcoded | **PARTIAL** |
| Retry Backoff | ✅ Required | ⚠️ Hardcoded | **PARTIAL** |
| Reconciliation Frequency | ✅ Required | ⚠️ Hardcoded | **PARTIAL** |
| Default Slippage | ✅ Required | ⚠️ Hardcoded | **PARTIAL** |
| Feature Flags | ✅ Required | ⚠️ Config only | **PARTIAL** |

**Note:** All configuration is hardcoded in `signal_trader.ex` module attributes.

---

## 2. Backend Capability Assessment

### 2.1 What EXISTS and Works ✅

#### Real-Time Market Data Infrastructure
```elixir
# Located: trade_engine_web/channels/market_data_channel.ex
- WebSocket channel for real-time data streaming
- Phoenix PubSub integration (pub/sub topics)
- Supports multiple topic subscriptions:
  * ticker:SYMBOL - Price updates
  * kline:SYMBOL - Candlestick data
  * depth:SYMBOL - Order book
  * signals:SYMBOL - Trading signals
  * physics:SYMBOL - Physics model outputs
```

**Strengths:**
- ✅ Real-time bidirectional communication (WebSocket)
- ✅ Topic-based pub/sub architecture
- ✅ Market data serialization for JSON
- ✅ Client subscription management
- ✅ Cached data delivery on connection

#### Physics-Based Trading Engine
```elixir
# Located: orchestrator/signal_trader.ex
- Physics-based signal generation (momentum, gravity, kinetic energy)
- Automated trade execution via Binance Testnet
- Position lifecycle management (entry only - no exit tracking)
- Virtual balance management (in-memory)
- Multi-timeframe analysis (5m, 15m candles)
```

**Strengths:**
- ✅ Sophisticated AI/physics model
- ✅ Real Binance API integration
- ✅ Transaction logging (2,197 records)
- ✅ Position creation (31,468 records)

#### Database Schema
```sql
-- Core trading tables exist:
trading_positions (31,468 rows) - Position data with physics fields
trading_transactions (2,197 rows) - Execution logs
predictions (6,903 rows) - AI model outputs
trading_accounts (1,000 rows) - Account balances (unused)
users (1,001 rows) - User records
```

**Strengths:**
- ✅ Comprehensive schema with physics model fields
- ✅ Multi-schema organization (public, trading, auth, risk, pool)
- ✅ UUID primary keys
- ✅ Timestamped records

### 2.2 What's PARTIAL ⚠️

| Feature | Current State | Missing Pieces |
|---------|--------------|----------------|
| **Position Management** | Creates positions in DB | No status updates, all remain 'open' |
| **User Assignment** | Has user_id FK | No actual user integration, virtual only |
| **Strategy Config** | Hardcoded in module | No dynamic configuration, no DB storage |
| **Balance Tracking** | VirtualBalanceManager | No persistence, in-memory only |
| **Telemetry** | Phoenix.Telemetry exists | No instrumentation for infra metrics |
| **Audit Logging** | Schema exists | Not integrated with trading actions |

### 2.3 What's MISSING ❌

#### 1. Bot Entity System
**Problem:** No concept of a "Bot" as a manageable entity
```elixir
# Current: Hardcoded trader process
defmodule SignalTrader do
  @target_profit_usd 0.50
  @min_confidence_long 55
  # Strategy is the process itself
end

# Needed: Bot entity with configuration
defmodule TradeEngine.Bots.Bot do
  schema "trading.bots" do
    field :name, :string
    field :user_id, :binary_id
    field :strategy_id, :binary_id
    field :status, Ecto.Enum, values: [:running, :paused, :error, :stopped]
    field :config, :map  # JSONB strategy config
    field :equity, :decimal
    field :heartbeat_at, :utc_datetime
    # Resource usage
    field :cpu_percent, :float
    field :ram_mb, :integer
  end
end
```

#### 2. Order Lifecycle Tracking
**Problem:** `trading_orders` table is empty (0 rows)
```elixir
# Current: Direct execution, no order tracking
TestnetExecutor.execute_long() -> {:ok, exchange_result}
# Stores position in GenServer, logs transaction

# Needed: Full order lifecycle
create_order() -> track in trading.orders (status: "NEW")
-> on fill: update status to "FILLED"
-> link to trading.fills (execution records)
-> update position unrealized_pnl
```

#### 3. Infrastructure Monitoring
**Problem:** No metrics collection for services
```elixir
# Needed: Service health monitoring
defmodule TradeEngine.Infra.Monitor do
  use GenServer

  def collect_metrics() do
    %{
      phoenix: get_phoenix_stats(),
      postgres: get_db_stats(),
      beam_vm: :erlang.memory() |> parse_vm_stats(),
      telemetry: get_telemetry_metrics()
    }
  end

  def broadcast_metrics(metrics) do
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "infra:metrics",
      {:infra_update, metrics}
    )
  end
end
```

#### 4. Alert Management System
**Problem:** No alert generation or tracking
```elixir
# Needed: Alert system
defmodule TradeEngine.Alerts.Manager do
  def create_alert(params) do
    # Evaluate conditions
    # Create alert record
    # Broadcast to UI via PubSub
  end

  def check_bot_alerts(bot) do
    if bot.heartbeat_at < 30 seconds ago do
      create_alert(type: :heartbeat_miss, bot_id: bot.id)
    end

    if bot.cpu_percent > 85 do
      create_alert(type: :high_cpu, bot_id: bot.id)
    end
  end
end
```

#### 5. Multi-User Bot Management
**Problem:** Single global bot, no per-user bot instances
```elixir
# Current: One SignalTrader for entire system

# Needed: DynamicSupervisor for per-user bots
defmodule TradeEngine.Bots.Supervisor do
  use DynamicSupervisor

  def start_bot(user_id, strategy_config) do
    bot_spec = {
      TradeEngine.Bots.Worker,
      user_id: user_id,
      strategy: strategy_config.strategy_type,
      config: strategy_config.params
    }

    DynamicSupervisor.start_child(__MODULE__, bot_spec)
  end

  def stop_bot(bot_id), do: # terminate child
  def pause_bot(bot_id), do: # suspend trading
  def resume_bot(bot_id), do: # resume trading
end
```

---

## 3. Gap Analysis

### 3.1 Critical Gaps (Blocks Core Features)

#### Gap 1: No Bot Entity Management
**Impact:** Cannot create, assign, or manage multiple bots per user
**UI Features Blocked:**
- `/dashboard/bot-fleet` - Cannot list/filter/search bots
- Bot cards showing status, metrics, heartbeat
- Deploy/Kill/Pause bot actions
- Per-user bot assignment

**Remedy Required:**
1. Create `trading.bots` table
2. Implement bot lifecycle GenServer worker
3. Add DynamicSupervisor for multi-bot orchestration
4. Create REST API endpoints for bot CRUD
5. Integrate with user authentication

#### Gap 2: No Real-Time Position Updates
**Impact:** UI shows stale position data
**Problem:** All 31,468 positions stuck as `status='open'`
**UI Features Blocked:**
- Live P&L updates in `/trading` page
- Position management (close/modify)
- Accurate equity calculations

**Remedy Required:**
1. Fix position close logic in SignalTrader
2. Implement PositionManager batch updates (every 60s)
3. Broadcast position updates via PubSub
4. Create WebSocket channel for positions:
   ```elixir
   channel "positions:user:#{user_id}", TradeEngineWeb.PositionChannel
   ```

#### Gap 3: No Infrastructure Metrics
**Impact:** Cannot show service health dashboards
**UI Features Blocked:**
- `/dashboard/mission-control` - Infrastructure Health section
- `/dashboard/infra` - Entire page
- Resource usage graphs
- Service status indicators

**Remedy Required:**
1. Implement InfraMonitor GenServer
2. Collect BEAM VM metrics (`:erlang.memory()`, `:erlang.statistics()`)
3. Query Postgres for connection/query stats
4. Broadcast metrics every 4 seconds via PubSub
5. Cache current metrics in ETS table

#### Gap 4: No Alert System
**Impact:** Cannot notify operators of issues
**UI Features Blocked:**
- `/dashboard/mission-control` - Alert sidebar
- `/dashboard/alerts` - Entire page
- Critical/warning badges
- Alert acknowledgment

**Remedy Required:**
1. Implement Alert.Manager GenServer
2. Create alert evaluation rules
3. Store alerts in `alerts.trading_alerts` table
4. Broadcast new alerts via PubSub
5. Add alert acknowledgment API

### 3.2 High-Priority Gaps

#### Gap 5: Order Lifecycle Missing
**Impact:** No audit trail, no partial fill tracking
**Current:** `trading_orders` table has 0 rows
**Needed:** Full order state machine (NEW → PARTIAL → FILLED → CANCELLED)

#### Gap 6: No Bot Heartbeat/Health Monitoring
**Impact:** Cannot detect dead/hung bots
**Needed:** Heartbeat mechanism + health check system

#### Gap 7: No Dynamic Strategy Configuration
**Impact:** Must redeploy code to change strategy params
**Current:** Hardcoded `@target_profit_usd`, `@min_confidence_long`
**Needed:** Database-backed strategy configs with JSONB

### 3.3 Medium-Priority Gaps

#### Gap 8: No Shift Handoff System
**Impact:** `/dashboard/shift-handoff` page non-functional
**Needed:** Activity logging, shift tracking, watch list management

#### Gap 9: No User-Specific Credentials
**Impact:** All bots share global API keys
**Current:** `System.get_env("BINANCE_API_KEY")`
**Needed:** Per-user encrypted credentials in `exchange.user_credentials`

#### Gap 10: Incomplete Balance Tracking
**Impact:** Virtual balances lost on restart
**Current:** VirtualBalanceManager (in-memory)
**Needed:** `trading.equity_snapshots` table for persistence

---

## 4. Bot Lifecycle Management

### 4.1 Bot Entity Schema

```sql
-- New table: trading.bots
CREATE TABLE trading.bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    name VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategy.strategies(id),

    -- Configuration
    config JSONB NOT NULL DEFAULT '{}', -- Strategy-specific params
    exchange VARCHAR(50) NOT NULL,
    trading_pairs TEXT[] NOT NULL, -- ["BTCUSDT", "ETHUSDT"]

    -- Status & Control
    status VARCHAR(50) NOT NULL DEFAULT 'stopped',
    -- stopped, starting, running, paused, error, terminated

    -- Financial
    initial_equity DECIMAL(18,8) NOT NULL DEFAULT 0.0,
    current_equity DECIMAL(18,8) NOT NULL DEFAULT 0.0,

    -- Health Monitoring
    heartbeat_at TIMESTAMPTZ,
    heartbeat_interval_sec INTEGER NOT NULL DEFAULT 5,
    last_error TEXT,
    error_count INTEGER NOT NULL DEFAULT 0,

    -- Resource Usage
    cpu_percent DECIMAL(5,2),
    ram_mb INTEGER,

    -- Statistics
    total_trades INTEGER NOT NULL DEFAULT 0,
    open_positions INTEGER NOT NULL DEFAULT 0,
    total_pnl DECIMAL(18,8) NOT NULL DEFAULT 0.0,
    win_rate DECIMAL(5,2),

    -- Timestamps
    started_at TIMESTAMPTZ,
    stopped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_bot_name_per_user UNIQUE (user_id, name),
    CONSTRAINT valid_status CHECK (status IN ('stopped', 'starting', 'running', 'paused', 'error', 'terminated'))
);

CREATE INDEX idx_bots_user_id ON trading.bots(user_id);
CREATE INDEX idx_bots_status ON trading.bots(status);
CREATE INDEX idx_bots_heartbeat ON trading.bots(heartbeat_at) WHERE status = 'running';
```

### 4.2 Bot Worker Implementation

```elixir
defmodule TradeEngine.Bots.Worker do
  @moduledoc """
  GenServer that runs a single trading bot instance.
  Each bot is a supervised process that:
  - Subscribes to market data PubSub topics
  - Generates signals based on strategy
  - Executes trades
  - Reports health via heartbeat
  - Tracks resource usage
  """

  use GenServer
  require Logger

  alias TradeEngine.Repo
  alias TradeEngine.Bots.Bot
  alias TradeEngine.Strategy.StrategyRunner

  # Client API

  def start_link(opts) do
    bot_id = Keyword.fetch!(opts, :bot_id)
    GenServer.start_link(__MODULE__, opts, name: via_tuple(bot_id))
  end

  def pause(bot_id), do: GenServer.call(via_tuple(bot_id), :pause)
  def resume(bot_id), do: GenServer.call(via_tuple(bot_id), :resume)
  def get_stats(bot_id), do: GenServer.call(via_tuple(bot_id), :get_stats)

  # Server Callbacks

  @impl true
  def init(opts) do
    bot_id = Keyword.fetch!(opts, :bot_id)

    # Load bot from database
    bot = Repo.get!(Bot, bot_id)

    # Subscribe to market data for configured pairs
    Enum.each(bot.trading_pairs, fn pair ->
      Phoenix.PubSub.subscribe(TradeEngine.PubSub, "ticker:#{pair}")
      Phoenix.PubSub.subscribe(TradeEngine.PubSub, "candle_closed:5m:#{pair}")
    end)

    # Load strategy module
    strategy_module = StrategyRunner.get_module(bot.strategy_id)

    # Initialize strategy state
    strategy_state = strategy_module.init(bot.config)

    # Update bot status to running
    update_bot_status(bot, :running)

    # Schedule heartbeat
    Process.send_after(self(), :heartbeat, bot.heartbeat_interval_sec * 1000)

    # Schedule resource check
    Process.send_after(self(), :check_resources, 10_000)

    state = %{
      bot: bot,
      strategy_module: strategy_module,
      strategy_state: strategy_state,
      positions: %{}, # Map of position_id => position data
      paused: false
    }

    Logger.info("🤖 Bot started: #{bot.name} (#{bot_id})")

    {:ok, state}
  end

  # Handle market data
  @impl true
  def handle_info({:candle_closed, candle}, state) do
    if state.paused do
      {:noreply, state}
    else
      # Run strategy logic
      {action, new_strategy_state} =
        state.strategy_module.on_candle_closed(
          candle,
          state.strategy_state,
          state.positions
        )

      # Execute action (buy/sell/hold)
      new_state = execute_action(action, state)

      {:noreply, %{new_state | strategy_state: new_strategy_state}}
    end
  end

  # Heartbeat
  @impl true
  def handle_info(:heartbeat, state) do
    # Update heartbeat timestamp in database
    now = DateTime.utc_now()

    Repo.transaction(fn ->
      bot = Repo.get!(Bot, state.bot.id)
      changeset = Bot.changeset(bot, %{heartbeat_at: now})
      Repo.update!(changeset)

      # Broadcast heartbeat to UI
      broadcast_bot_update(bot.id, %{heartbeat_at: now})
    end)

    # Schedule next heartbeat
    Process.send_after(
      self(),
      :heartbeat,
      state.bot.heartbeat_interval_sec * 1000
    )

    {:noreply, state}
  end

  # Resource usage check
  @impl true
  def handle_info(:check_resources, state) do
    # Get process memory usage
    process_info = Process.info(self(), [:memory, :reductions])
    memory_mb = process_info[:memory] / (1024 * 1024)

    # Estimate CPU (simplified)
    cpu_percent = estimate_cpu_usage()

    # Update in database
    Repo.transaction(fn ->
      bot = Repo.get!(Bot, state.bot.id)
      changeset = Bot.changeset(bot, %{
        ram_mb: trunc(memory_mb),
        cpu_percent: cpu_percent
      })
      Repo.update!(changeset)
    end)

    # Schedule next check
    Process.send_after(self(), :check_resources, 60_000)

    {:noreply, state}
  end

  @impl true
  def handle_call(:pause, _from, state) do
    update_bot_status(state.bot, :paused)
    {:reply, :ok, %{state | paused: true}}
  end

  @impl true
  def handle_call(:resume, _from, state) do
    update_bot_status(state.bot, :running)
    {:reply, :ok, %{state | paused: false}}
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    stats = %{
      bot_id: state.bot.id,
      name: state.bot.name,
      status: if(state.paused, do: :paused, else: :running),
      open_positions: map_size(state.positions),
      equity: calculate_equity(state),
      pnl: calculate_total_pnl(state)
    }
    {:reply, stats, state}
  end

  # Private helpers

  defp via_tuple(bot_id) do
    {:via, Registry, {TradeEngine.Bots.Registry, bot_id}}
  end

  defp update_bot_status(bot, status) do
    Repo.transaction(fn ->
      bot = Repo.get!(Bot, bot.id)
      timestamp_field = case status do
        :running -> %{status: to_string(status), started_at: DateTime.utc_now()}
        :stopped -> %{status: to_string(status), stopped_at: DateTime.utc_now()}
        _ -> %{status: to_string(status)}
      end
      changeset = Bot.changeset(bot, timestamp_field)
      Repo.update!(changeset)
    end)
  end

  defp broadcast_bot_update(bot_id, updates) do
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "bot:#{bot_id}",
      {:bot_update, bot_id, updates}
    )
  end

  defp execute_action(:hold, state), do: state
  defp execute_action({:buy, params}, state) do
    # Create position, execute order
    # Update state.positions
    state
  end
  defp execute_action({:sell, position_id}, state) do
    # Close position, execute order
    # Remove from state.positions
    state
  end
end
```

### 4.3 Bot Management API

```elixir
defmodule TradeEngine.Bots do
  @moduledoc """
  Context for managing trading bots.
  """

  alias TradeEngine.Repo
  alias TradeEngine.Bots.{Bot, Supervisor}

  # Create new bot
  def create_bot(user_id, attrs) do
    %Bot{}
    |> Bot.changeset(Map.put(attrs, :user_id, user_id))
    |> Repo.insert()
    |> case do
      {:ok, bot} -> {:ok, bot}
      {:error, changeset} -> {:error, changeset}
    end
  end

  # Start bot (launch GenServer process)
  def start_bot(bot_id) do
    with {:ok, bot} <- get_bot(bot_id),
         {:ok, _pid} <- Supervisor.start_bot(bot_id) do
      update_bot_status(bot, :starting)
      {:ok, bot}
    end
  end

  # Stop bot (terminate GenServer)
  def stop_bot(bot_id) do
    with {:ok, bot} <- get_bot(bot_id),
         :ok <- Supervisor.stop_bot(bot_id) do
      update_bot_status(bot, :stopped)
      {:ok, bot}
    end
  end

  # Pause bot (keep process alive but stop trading)
  def pause_bot(bot_id) do
    with {:ok, bot} <- get_bot(bot_id) do
      TradeEngine.Bots.Worker.pause(bot_id)
      update_bot_status(bot, :paused)
      {:ok, bot}
    end
  end

  # Resume bot
  def resume_bot(bot_id) do
    with {:ok, bot} <- get_bot(bot_id) do
      TradeEngine.Bots.Worker.resume(bot_id)
      update_bot_status(bot, :running)
      {:ok, bot}
    end
  end

  # List all bots for a user
  def list_user_bots(user_id) do
    Bot
    |> where([b], b.user_id == ^user_id)
    |> order_by([b], desc: b.updated_at)
    |> Repo.all()
  end

  # Get bot with positions
  def get_bot_with_positions(bot_id) do
    bot = Repo.get!(Bot, bot_id)
    positions = list_bot_positions(bot_id)
    %{bot | positions: positions}
  end

  # Update bot configuration (requires restart)
  def update_bot_config(bot_id, new_config) do
    with {:ok, bot} <- get_bot(bot_id) do
      bot
      |> Bot.changeset(%{config: new_config})
      |> Repo.update()
    end
  end

  # Get bot statistics
  def get_bot_stats(bot_id) do
    if bot_running?(bot_id) do
      # Get live stats from GenServer
      TradeEngine.Bots.Worker.get_stats(bot_id)
    else
      # Get stats from database
      calculate_bot_stats_from_db(bot_id)
    end
  end

  defp bot_running?(bot_id) do
    case Registry.lookup(TradeEngine.Bots.Registry, bot_id) do
      [{_pid, _}] -> true
      [] -> false
    end
  end
end
```

---

## 5. User Assignment & Multi-Tenancy

### 5.1 User-Bot Relationship

```sql
-- Users own multiple bots
CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    -- ...
);

-- Each bot belongs to one user
CREATE TABLE trading.bots (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- ...
);

-- Positions are linked to both user and bot
CREATE TABLE trading.positions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    bot_id UUID REFERENCES trading.bots(id), -- Can be NULL for manual trades
    -- ...
);

-- Orders track which bot placed them
CREATE TABLE trading.orders (
    id UUID PRIMARY KEY,
    bot_id UUID REFERENCES trading.bots(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    -- ...
);
```

### 5.2 Bot Assignment Flow

```elixir
# 1. User creates bot via UI
POST /api/bots
{
  "name": "BTC Scalper #1",
  "strategy_id": "uuid-of-momentum-grid-strategy",
  "config": {
    "target_profit_usd": 0.75,
    "min_confidence_long": 60,
    "max_hold_minutes": 5,
    "trading_pairs": ["BTCUSDT", "ETHUSDT"]
  },
  "exchange": "binance",
  "initial_equity": 100.00
}

# 2. Backend creates bot record
defmodule TradeEngineWeb.BotController do
  def create(conn, params) do
    user_id = conn.assigns.current_user.id

    with {:ok, bot} <- TradeEngine.Bots.create_bot(user_id, params) do
      conn
      |> put_status(:created)
      |> json(%{data: serialize_bot(bot)})
    end
  end
end

# 3. User starts bot
POST /api/bots/:id/start

# 4. Backend launches GenServer under user's supervision tree
defmodule TradeEngine.Bots.Supervisor do
  use DynamicSupervisor

  def start_bot(bot_id) do
    child_spec = {TradeEngine.Bots.Worker, bot_id: bot_id}
    DynamicSupervisor.start_child(__MODULE__, child_spec)
  end
end

# 5. Bot GenServer subscribes to PubSub with user context
defmodule TradeEngine.Bots.Worker do
  def init(bot_id: bot_id) do
    bot = Repo.get!(Bot, bot_id)

    # Subscribe to user-specific topics
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, "user:#{bot.user_id}:commands")

    # Subscribe to market data
    Enum.each(bot.trading_pairs, fn pair ->
      Phoenix.PubSub.subscribe(TradeEngine.PubSub, "ticker:#{pair}")
    end)

    # ...
  end
end
```

### 5.3 Per-User Exchange Credentials

```sql
CREATE TABLE exchange.user_credentials (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange_name VARCHAR(50) NOT NULL, -- binance, bybit, okx

    -- Encrypted credentials
    encrypted_api_key TEXT NOT NULL,
    encrypted_api_secret TEXT NOT NULL,
    encryption_key_id UUID NOT NULL, -- Key rotation support

    -- Metadata
    label VARCHAR(100), -- "Main Trading Account"
    is_testnet BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,

    CONSTRAINT unique_user_exchange_label UNIQUE (user_id, exchange_name, label)
);
```

```elixir
defmodule TradeEngine.Exchanges.CredentialManager do
  @moduledoc """
  Manages encrypted API credentials per user.
  """

  alias TradeEngine.Exchanges.UserCredential

  def get_credentials(user_id, exchange) do
    UserCredential
    |> where([c], c.user_id == ^user_id and c.exchange_name == ^exchange)
    |> where([c], c.is_active == true)
    |> Repo.one()
    |> case do
      nil -> {:error, :no_credentials}
      cred -> {:ok, decrypt_credentials(cred)}
    end
  end

  defp decrypt_credentials(cred) do
    %{
      api_key: Cloak.decrypt(cred.encrypted_api_key),
      api_secret: Cloak.decrypt(cred.encrypted_api_secret)
    }
  end

  def create_credentials(user_id, exchange, api_key, api_secret, opts \\ []) do
    %UserCredential{}
    |> UserCredential.changeset(%{
      user_id: user_id,
      exchange_name: exchange,
      encrypted_api_key: Cloak.encrypt(api_key),
      encrypted_api_secret: Cloak.encrypt(api_secret),
      label: opts[:label] || "Default",
      is_testnet: opts[:is_testnet] || false
    })
    |> Repo.insert()
  end
end
```

### 5.4 Bot Execution with User Credentials

```elixir
defmodule TradeEngine.Bots.Worker do
  def execute_trade(action, state) do
    # Get user's exchange credentials
    {:ok, credentials} =
      TradeEngine.Exchanges.CredentialManager.get_credentials(
        state.bot.user_id,
        state.bot.exchange
      )

    # Execute trade with user's API keys
    case TradeEngine.Exchanges.Binance.TestnetExecutor.execute_long(
      symbol: action.symbol,
      quantity: action.quantity,
      credentials: credentials,  # User-specific!
      user_id: state.bot.user_id,
      bot_id: state.bot.id
    ) do
      {:ok, result} ->
        # Create position linked to bot
        create_position(result, state.bot.id)

      {:error, reason} ->
        # Log error, increment bot error_count
        handle_trade_error(reason, state)
    end
  end
end
```

---

## 6. Real-Time Data Delivery Strategy

### 6.1 WebSocket Channel Architecture

```
Next.js Frontend
      │
      ↓ WebSocket connection
TradeEngineWeb.UserSocket
      │
      ├─── market_data:BTCUSDT  (price updates)
      ├─── bot:user:#{user_id}  (bot status)
      ├─── positions:user:#{user_id}  (position updates)
      ├─── alerts:user:#{user_id}  (alert notifications)
      └─── infra:metrics  (infrastructure health)
```

### 6.2 Channel Implementations

#### Bot Status Channel
```elixir
defmodule TradeEngineWeb.BotChannel do
  use TradeEngineWeb, :channel

  # Join user's bot channel
  def join("bot:user:" <> user_id, _payload, socket) do
    if authorized?(socket, user_id) do
      # Subscribe to all user's bots
      Phoenix.PubSub.subscribe(TradeEngine.PubSub, "bots:user:#{user_id}")

      # Send initial bot list
      bots = TradeEngine.Bots.list_user_bots(user_id)
      push(socket, "bot_list", %{bots: serialize_bots(bots)})

      {:ok, assign(socket, :user_id, user_id)}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end

  # Bot update from Worker GenServer
  def handle_info({:bot_update, bot_id, updates}, socket) do
    push(socket, "bot_update", %{
      bot_id: bot_id,
      updates: updates,
      timestamp: DateTime.utc_now()
    })
    {:noreply, socket}
  end

  # Client requests bot action
  def handle_in("start_bot", %{"bot_id" => bot_id}, socket) do
    case TradeEngine.Bots.start_bot(bot_id) do
      {:ok, bot} ->
        {:reply, {:ok, %{bot: serialize_bot(bot)}}, socket}
      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("stop_bot", %{"bot_id" => bot_id}, socket) do
    case TradeEngine.Bots.stop_bot(bot_id) do
      {:ok, bot} ->
        {:reply, {:ok, %{bot: serialize_bot(bot)}}, socket}
      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end
end
```

#### Position Updates Channel
```elixir
defmodule TradeEngineWeb.PositionChannel do
  use TradeEngineWeb, :channel

  def join("positions:user:" <> user_id, _payload, socket) do
    if authorized?(socket, user_id) do
      Phoenix.PubSub.subscribe(TradeEngine.PubSub, "positions:user:#{user_id}")

      # Send initial positions
      positions = TradeEngine.Trading.list_user_open_positions(user_id)
      push(socket, "position_list", %{positions: serialize_positions(positions)})

      {:ok, assign(socket, :user_id, user_id)}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end

  # Real-time P&L update (broadcast from PositionManager)
  def handle_info({:position_update, position_id, pnl_data}, socket) do
    push(socket, "position_pnl", %{
      position_id: position_id,
      unrealized_pnl: pnl_data.unrealized_pnl,
      unrealized_pnl_pct: pnl_data.unrealized_pnl_pct,
      current_price: pnl_data.current_price,
      timestamp: DateTime.utc_now()
    })
    {:noreply, socket}
  end

  # Position closed
  def handle_info({:position_closed, position}, socket) do
    push(socket, "position_closed", %{
      position_id: position.id,
      realized_pnl: position.realized_pnl,
      exit_price: position.exit_price,
      timestamp: DateTime.utc_now()
    })
    {:noreply, socket}
  end
end
```

#### Infrastructure Metrics Channel
```elixir
defmodule TradeEngineWeb.InfraChannel do
  use TradeEngineWeb, :channel

  def join("infra:metrics", _payload, socket) do
    # Subscribe to infrastructure updates
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, "infra:metrics")

    # Send current metrics
    metrics = TradeEngine.Infra.Monitor.get_current_metrics()
    push(socket, "metrics", serialize_metrics(metrics))

    {:ok, socket}
  end

  # Broadcast every 4 seconds from InfraMonitor
  def handle_info({:infra_update, metrics}, socket) do
    push(socket, "metrics", serialize_metrics(metrics))
    {:noreply, socket}
  end

  defp serialize_metrics(metrics) do
    %{
      phoenix: %{
        cpu: metrics.phoenix.cpu,
        ram: metrics.phoenix.ram,
        disk: metrics.phoenix.disk
      },
      postgres: %{
        cpu: metrics.postgres.cpu,
        ram: metrics.postgres.ram,
        connections: metrics.postgres.connections,
        queries_per_sec: metrics.postgres.queries_per_sec
      },
      rabbitmq: %{
        cpu: metrics.rabbitmq.cpu,
        ram: metrics.rabbitmq.ram,
        queue_depth: metrics.rabbitmq.queue_depth
      },
      redis: %{
        cpu: metrics.redis.cpu,
        ram: metrics.redis.ram,
        ops_per_sec: metrics.redis.ops_per_sec
      },
      bot_workers: %{
        cpu: metrics.bot_workers.cpu,
        ram: metrics.bot_workers.ram,
        count: metrics.bot_workers.count
      },
      timestamp: DateTime.utc_now()
    }
  end
end
```

### 6.3 PubSub Topic Structure

```elixir
# Market Data (global)
"ticker:#{symbol}"           # Price updates for symbol
"candle_closed:5m:#{symbol}" # 5-min candle completion
"depth:#{symbol}"            # Order book updates

# User-Specific (multi-tenant)
"bots:user:#{user_id}"            # All bot updates for user
"bot:#{bot_id}"                   # Specific bot updates
"positions:user:#{user_id}"       # All positions for user
"position:#{position_id}"         # Specific position updates
"alerts:user:#{user_id}"          # Alerts for user
"orders:user:#{user_id}"          # Order flow for user

# System-Wide
"infra:metrics"                   # Infrastructure health
"signals:all"                     # All trading signals
"physics:all"                     # Physics model updates
```

### 6.4 Frontend WebSocket Client (Next.js)

```typescript
// lib/websocket.ts
import { io, Socket } from 'socket.io-client';

class TradingWebSocket {
  private socket: Socket | null = null;
  private channels: Map<string, Function[]> = new Map();

  connect(userId: string) {
    this.socket = io('ws://localhost:4000/socket', {
      transports: ['websocket'],
      auth: {
        token: getAuthToken()
      }
    });

    // Join user channels
    this.socket.emit('phx_join', {
      topic: `bot:user:${userId}`,
      payload: {}
    });

    this.socket.emit('phx_join', {
      topic: `positions:user:${userId}`,
      payload: {}
    });

    this.socket.emit('phx_join', {
      topic: 'infra:metrics',
      payload: {}
    });

    // Handle messages
    this.socket.on('bot_update', (data) => {
      this.broadcast('bot_update', data);
    });

    this.socket.on('position_pnl', (data) => {
      this.broadcast('position_pnl', data);
    });

    this.socket.on('metrics', (data) => {
      this.broadcast('infra_metrics', data);
    });
  }

  subscribe(event: string, callback: Function) {
    if (!this.channels.has(event)) {
      this.channels.set(event, []);
    }
    this.channels.get(event)!.push(callback);
  }

  private broadcast(event: string, data: any) {
    const callbacks = this.channels.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }

  startBot(botId: string) {
    this.socket?.emit('start_bot', { bot_id: botId });
  }

  stopBot(botId: string) {
    this.socket?.emit('stop_bot', { bot_id: botId });
  }
}

export const tradingWS = new TradingWebSocket();
```

```typescript
// components/BotCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { tradingWS } from '@/lib/websocket';

export function BotCard({ bot }: { bot: Bot }) {
  const [liveBot, setLiveBot] = useState(bot);

  useEffect(() => {
    // Subscribe to this bot's updates
    const unsubscribe = tradingWS.subscribe('bot_update', (data) => {
      if (data.bot_id === bot.id) {
        setLiveBot(prev => ({ ...prev, ...data.updates }));
      }
    });

    return () => unsubscribe();
  }, [bot.id]);

  return (
    <div className="bot-card">
      <div className="flex items-center gap-2">
        <div className={`status-indicator ${liveBot.status}`} />
        <span>{liveBot.name}</span>
      </div>

      <div className="metrics">
        <div>PnL: {liveBot.total_pnl}</div>
        <div>Positions: {liveBot.open_positions}</div>
        <div>CPU: {liveBot.cpu_percent}%</div>
        <div>Heartbeat: {formatHeartbeat(liveBot.heartbeat_at)}</div>
      </div>

      <button onClick={() => tradingWS.startBot(bot.id)}>Start</button>
      <button onClick={() => tradingWS.stopBot(bot.id)}>Stop</button>
    </div>
  );
}
```

---

## 7. Caching Strategy

### 7.1 Multi-Layer Caching Architecture

```
┌─────────────────────────────────────────────────────┐
│          Frontend (Next.js)                         │
│  ┌───────────────────────────────────────────────┐  │
│  │ React Query Cache (5s stale time)             │  │
│  │ - Bot list, position list, static configs     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                       ↓ HTTP/WS
┌─────────────────────────────────────────────────────┐
│          Backend (Phoenix)                          │
│  ┌───────────────────────────────────────────────┐  │
│  │ ETS Tables (in-memory, fast reads)            │  │
│  │ - Current prices (1s TTL)                     │  │
│  │ - Latest signals (5min TTL)                   │  │
│  │ - Infra metrics (4s TTL)                      │  │
│  │ - Bot heartbeats (1s TTL)                     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ Redis (shared state, 60s+ TTL)                │  │
│  │ - Order book snapshots                        │  │
│  │ - Candlestick buffers                         │  │
│  │ - Bot statistics aggregates                   │  │
│  │ - User session data                           │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ PostgreSQL (persistent storage)               │  │
│  │ - Bots, positions, orders, transactions       │  │
│  │ - Users, strategies, configurations           │  │
│  │ - Historical data, audit logs                 │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 7.2 ETS Cache Implementation

```elixir
defmodule TradeEngine.Cache.PriceCache do
  @moduledoc """
  Fast in-memory cache for current prices using ETS.
  """

  use GenServer

  @table_name :price_cache
  @ttl_ms 1_000  # 1 second TTL

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  def init(_) do
    :ets.new(@table_name, [:named_table, :set, :public, read_concurrency: true])
    {:ok, %{}}
  end

  # Public API

  def get_price(symbol) do
    case :ets.lookup(@table_name, symbol) do
      [{^symbol, price, timestamp}] ->
        if fresh?(timestamp) do
          {:ok, price}
        else
          {:error, :stale}
        end
      [] ->
        {:error, :not_found}
    end
  end

  def put_price(symbol, price) do
    :ets.insert(@table_name, {symbol, price, System.monotonic_time(:millisecond)})
  end

  def get_all_prices() do
    now = System.monotonic_time(:millisecond)

    :ets.tab2list(@table_name)
    |> Enum.filter(fn {_symbol, _price, timestamp} ->
      now - timestamp < @ttl_ms
    end)
    |> Enum.map(fn {symbol, price, _timestamp} ->
      {symbol, price}
    end)
  end

  defp fresh?(timestamp) do
    now = System.monotonic_time(:millisecond)
    now - timestamp < @ttl_ms
  end
end
```

```elixir
defmodule TradeEngine.Cache.InfraCache do
  @moduledoc """
  Cache for infrastructure metrics (4 second TTL).
  """

  use GenServer

  @table_name :infra_cache

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  def init(_) do
    :ets.new(@table_name, [:named_table, :set, :public])

    # Schedule periodic metric collection
    Process.send_after(self(), :collect_metrics, 1_000)

    {:ok, %{}}
  end

  def get_current_metrics() do
    case :ets.lookup(@table_name, :current) do
      [{:current, metrics}] -> metrics
      [] -> default_metrics()
    end
  end

  def handle_info(:collect_metrics, state) do
    metrics = TradeEngine.Infra.Monitor.collect_metrics()
    :ets.insert(@table_name, {:current, metrics})

    # Broadcast to WebSocket clients
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "infra:metrics",
      {:infra_update, metrics}
    )

    # Schedule next collection
    Process.send_after(self(), :collect_metrics, 4_000)

    {:noreply, state}
  end
end
```

### 7.3 Redis Cache Strategy

```elixir
defmodule TradeEngine.Cache.Redis do
  @moduledoc """
  Redis caching layer for slower-changing data.
  """

  @redis_url Application.compile_env(:trade_engine, :redis_url)

  # Bot statistics (updated every 60s)
  def cache_bot_stats(bot_id, stats) do
    key = "bot:#{bot_id}:stats"
    value = Jason.encode!(stats)

    Redix.command(:redix, ["SETEX", key, 60, value])
  end

  def get_bot_stats(bot_id) do
    key = "bot:#{bot_id}:stats"

    case Redix.command(:redix, ["GET", key]) do
      {:ok, nil} -> {:error, :not_found}
      {:ok, value} -> {:ok, Jason.decode!(value)}
    end
  end

  # Order book snapshots (updated every 5s)
  def cache_orderbook(symbol, orderbook) do
    key = "orderbook:#{symbol}"
    value = Jason.encode!(orderbook)

    Redix.command(:redix, ["SETEX", key, 5, value])
  end

  def get_orderbook(symbol) do
    key = "orderbook:#{symbol}"

    case Redix.command(:redix, ["GET", key]) do
      {:ok, nil} -> {:error, :not_found}
      {:ok, value} -> {:ok, Jason.decode!(value)}
    end
  end

  # Candlestick buffers (5 minute candles)
  def append_candle(symbol, timeframe, candle) do
    key = "candles:#{symbol}:#{timeframe}"
    value = Jason.encode!(candle)

    # Add to list
    Redix.pipeline(:redix, [
      ["RPUSH", key, value],
      ["LTRIM", key, -120, -1],  # Keep last 120 candles
      ["EXPIRE", key, 3600]       # Expire after 1 hour
    ])
  end

  def get_candles(symbol, timeframe, limit \\ 120) do
    key = "candles:#{symbol}:#{timeframe}"

    case Redix.command(:redix, ["LRANGE", key, -limit, -1]) do
      {:ok, candles} ->
        {:ok, Enum.map(candles, &Jason.decode!/1)}
      error ->
        error
    end
  end
end
```

### 7.4 Data Freshness Requirements

| Data Type | Update Frequency | Cache Layer | TTL |
|-----------|------------------|-------------|-----|
| **Real-Time (< 1s)** |
| Price updates | Every tick | ETS | 1s |
| Bot heartbeats | Every 5s | ETS | 5s |
| Order execution | Event-driven | WS push | - |
| **Near Real-Time (1-5s)** |
| Position P&L | Every 1s | ETS + WS push | 1s |
| Infra metrics | Every 4s | ETS + WS push | 4s |
| Order book | Every 1s | Redis | 5s |
| **Delayed (5-60s)** |
| Bot statistics | Every 60s | Redis | 60s |
| Candlesticks | Every 5min | Redis | 1h |
| Alerts (unacked) | Every 10s | DB query | - |
| **Static/Slow (> 60s)** |
| Bot list | On change | React Query | 5min |
| Strategy configs | On change | DB query | - |
| User settings | On change | DB query | - |

### 7.5 Cache Invalidation Strategy

```elixir
defmodule TradeEngine.Cache.Invalidator do
  @moduledoc """
  Handles cache invalidation on data changes.
  """

  # When bot status changes, invalidate cache and broadcast
  def on_bot_status_change(bot_id) do
    # Clear Redis cache
    TradeEngine.Cache.Redis.delete("bot:#{bot_id}:stats")

    # Reload from DB
    bot = Repo.get!(Bot, bot_id)

    # Broadcast to WebSocket
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "bot:#{bot_id}",
      {:bot_update, bot_id, %{status: bot.status}}
    )

    # Update user's bot list channel
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "bots:user:#{bot.user_id}",
      {:bot_update, bot_id, %{status: bot.status}}
    )
  end

  # When position closes, invalidate related caches
  def on_position_closed(position) do
    # Update bot statistics
    bot = Repo.get!(Bot, position.bot_id)
    updated_bot = recalculate_bot_stats(bot)

    # Invalidate cache
    TradeEngine.Cache.Redis.delete("bot:#{bot.id}:stats")

    # Broadcast position closure
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "positions:user:#{position.user_id}",
      {:position_closed, position}
    )

    # Broadcast bot stat update
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "bot:#{bot.id}",
      {:bot_update, bot.id, %{
        total_pnl: updated_bot.total_pnl,
        open_positions: updated_bot.open_positions
      }}
    )
  end
end
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

#### Week 1: Bot Entity System
- [ ] Create `trading.bots` table migration
- [ ] Implement `TradeEngine.Bots.Bot` schema
- [ ] Create `TradeEngine.Bots` context
- [ ] Implement bot CRUD operations
- [ ] Add bot status state machine
- [ ] Create bot seed data
- [ ] Write unit tests

#### Week 2: Bot Worker & Supervisor
- [ ] Implement `TradeEngine.Bots.Worker` GenServer
- [ ] Create `TradeEngine.Bots.Supervisor` DynamicSupervisor
- [ ] Add Registry for bot processes
- [ ] Implement heartbeat mechanism
- [ ] Add resource usage tracking
- [ ] Create bot lifecycle integration tests

### Phase 2: Real-Time Infrastructure (Weeks 3-4)

#### Week 3: WebSocket Channels
- [ ] Implement `TradeEngineWeb.BotChannel`
- [ ] Implement `TradeEngineWeb.PositionChannel`
- [ ] Implement `TradeEngineWeb.InfraChannel`
- [ ] Implement `TradeEngineWeb.AlertChannel`
- [ ] Add authentication to channels
- [ ] Create channel integration tests

#### Week 4: Caching Layer
- [ ] Implement ETS price cache
- [ ] Implement ETS infra metrics cache
- [ ] Set up Redis connection pool
- [ ] Implement Redis caching functions
- [ ] Add cache invalidation logic
- [ ] Performance testing

### Phase 3: Missing Features (Weeks 5-6)

#### Week 5: Order Lifecycle & Position Management
- [ ] Fix position close logic
- [ ] Implement order tracking in `trading.orders`
- [ ] Create order status updates
- [ ] Link orders to positions (foreign keys)
- [ ] Implement PositionManager batch updates
- [ ] Add position P&L broadcasting

#### Week 6: Infrastructure Monitoring
- [ ] Implement `TradeEngine.Infra.Monitor`
- [ ] Collect BEAM VM metrics
- [ ] Query Postgres stats
- [ ] Mock RabbitMQ/Redis metrics (or integrate)
- [ ] Create infra metrics broadcaster
- [ ] Add to supervision tree

### Phase 4: Alert System (Week 7)

- [ ] Implement `TradeEngine.Alerts.Manager`
- [ ] Create alert evaluation rules
- [ ] Integrate with `alerts.trading_alerts` table
- [ ] Add alert broadcasting
- [ ] Implement alert acknowledgment API
- [ ] Create alert severity escalation

### Phase 5: Multi-User Support (Week 8)

- [ ] Create `exchange.user_credentials` table
- [ ] Implement credential encryption (Cloak)
- [ ] Add per-user bot instantiation
- [ ] Update trade execution to use user credentials
- [ ] Add user isolation to channels
- [ ] Multi-tenancy testing

### Phase 6: Strategy System (Week 9)

- [ ] Create `strategy.strategies` table
- [ ] Implement strategy module registry
- [ ] Add JSONB config validation
- [ ] Create strategy template system
- [ ] Add strategy versioning
- [ ] Strategy backtesting hooks

### Phase 7: UI Integration (Week 10)

- [ ] Create REST API endpoints for bot CRUD
- [ ] Document WebSocket events
- [ ] Create TypeScript types for frontend
- [ ] Implement frontend WebSocket client
- [ ] Connect UI pages to backend
- [ ] End-to-end testing

### Phase 8: Performance & Polish (Weeks 11-12)

#### Week 11: Optimization
- [ ] Database query optimization
- [ ] Add database indexes
- [ ] ETS cache tuning
- [ ] Redis connection pooling
- [ ] Load testing (100 concurrent bots)
- [ ] Memory profiling

#### Week 12: Documentation & Deployment
- [ ] API documentation (OpenAPI/Swagger)
- [ ] WebSocket event documentation
- [ ] Deployment guide (Docker/Kubernetes)
- [ ] Monitoring setup (Prometheus/Grafana)
- [ ] Alert runbook
- [ ] User guide

---

## 9. Recommended Remedies

### 9.1 Critical Remedies (Must Fix)

#### Remedy 1: Implement Bot Entity System
**Gap:** No bot management infrastructure
**Impact:** Cannot meet UI requirements for bot fleet management

**Implementation:**
1. Create database table:
```sql
CREATE TABLE trading.bots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  strategy_id UUID NOT NULL REFERENCES strategy.strategies(id),
  status VARCHAR(50) NOT NULL DEFAULT 'stopped',
  config JSONB NOT NULL DEFAULT '{}',
  -- ... (see section 4.1 for full schema)
);
```

2. Implement Worker GenServer (see section 4.2)
3. Add DynamicSupervisor for multi-bot orchestration
4. Create bot CRUD context functions
5. Expose REST API endpoints

**Estimated Effort:** 2 weeks
**Priority:** P0 (Blocking)

#### Remedy 2: Fix Position Lifecycle
**Gap:** All 31,468 positions remain 'open' forever
**Impact:** No accurate P&L tracking, broken position management

**Implementation:**
1. Add position close logic to SignalTrader:
```elixir
defp check_exit_conditions(position, current_price) do
  cond do
    current_price >= position.take_profit ->
      {:close, :take_profit_hit}

    current_price <= position.stop_loss ->
      {:close, :stop_loss_hit}

    position_age(position) > @max_hold_minutes * 60 ->
      {:close, :max_hold_exceeded}

    true ->
      {:hold, nil}
  end
end
```

2. Implement close execution:
```elixir
defp close_position(position, reason) do
  # Execute sell order
  {:ok, sell_result} = execute_sell_order(position)

  # Update position in database
  position
  |> Position.changeset(%{
    status: "closed",
    exit_price: sell_result.price,
    closed_at: DateTime.utc_now(),
    realized_pnl: calculate_pnl(position, sell_result.price),
    close_reason: reason
  })
  |> Repo.update!()

  # Broadcast closure
  broadcast_position_closed(position)
end
```

3. Enable PositionManager batch updates
4. Add position-transaction linking

**Estimated Effort:** 1 week
**Priority:** P0 (Blocking)

#### Remedy 3: Implement Real-Time Data Channels
**Gap:** No WebSocket infrastructure for bot/position updates
**Impact:** UI cannot receive live updates, must poll

**Implementation:**
1. Create channels (see section 6.2)
2. Set up PubSub topics (see section 6.3)
3. Add broadcasters to Worker GenServers
4. Document WebSocket API
5. Create frontend client library

**Estimated Effort:** 1.5 weeks
**Priority:** P0 (Blocking)

### 9.2 High-Priority Remedies

#### Remedy 4: Implement Infrastructure Monitoring
**Gap:** No infra metrics collection
**Impact:** `/dashboard/infra` and `/dashboard/mission-control` non-functional

**Implementation:**
```elixir
defmodule TradeEngine.Infra.Monitor do
  use GenServer

  def collect_metrics() do
    %{
      phoenix: collect_phoenix_stats(),
      postgres: collect_postgres_stats(),
      beam_vm: collect_beam_stats(),
      bot_workers: collect_bot_worker_stats()
    }
  end

  defp collect_beam_stats() do
    memory = :erlang.memory()
    stats = :erlang.statistics(:scheduler_wall_time)

    %{
      cpu: calculate_cpu_usage(stats),
      ram: memory[:total] / (1024 * 1024),  # MB
      processes: length(Process.list())
    }
  end

  defp collect_postgres_stats() do
    {:ok, result} = Repo.query("""
      SELECT
        count(*) as connections,
        sum(numbackends) as active_backends
      FROM pg_stat_database
      WHERE datname = current_database()
    """)

    %{
      connections: result.rows |> hd() |> hd(),
      cpu: 0.0,  # Requires pg_stat_statements extension
      ram: 0.0   # Approximate from connections
    }
  end
end
```

**Estimated Effort:** 1 week
**Priority:** P1 (High)

#### Remedy 5: Add Alert Management System
**Gap:** No alert generation or tracking
**Impact:** Cannot notify operators of critical issues

**Implementation:**
```elixir
defmodule TradeEngine.Alerts.Manager do
  use GenServer

  # Check bot health every 30 seconds
  def handle_info(:check_bot_health, state) do
    Repo.all(Bot)
    |> Enum.filter(&(&1.status == "running"))
    |> Enum.each(&evaluate_bot_alerts/1)

    Process.send_after(self(), :check_bot_health, 30_000)
    {:noreply, state}
  end

  defp evaluate_bot_alerts(bot) do
    now = DateTime.utc_now()

    # Heartbeat check
    if DateTime.diff(now, bot.heartbeat_at, :second) > 30 do
      create_alert(%{
        severity: "critical",
        message: "Bot #{bot.name} heartbeat missed (last: #{bot.heartbeat_at})",
        service: "bot:#{bot.id}",
        user_id: bot.user_id
      })
    end

    # CPU check
    if bot.cpu_percent && bot.cpu_percent > 85 do
      create_alert(%{
        severity: "warning",
        message: "Bot #{bot.name} CPU usage high: #{bot.cpu_percent}%",
        service: "bot:#{bot.id}",
        user_id: bot.user_id
      })
    end
  end

  defp create_alert(params) do
    # Insert to database
    %Alert{}
    |> Alert.changeset(params)
    |> Repo.insert()
    |> case do
      {:ok, alert} ->
        # Broadcast to user
        Phoenix.PubSub.broadcast(
          TradeEngine.PubSub,
          "alerts:user:#{alert.user_id}",
          {:new_alert, alert}
        )
      _ ->
        :ok
    end
  end
end
```

**Estimated Effort:** 1 week
**Priority:** P1 (High)

### 9.3 Medium-Priority Remedies

#### Remedy 6: Add Order Lifecycle Tracking
**Gap:** `trading_orders` table is empty
**Impact:** No audit trail, no partial fill support

**Implementation:**
1. Create order on execution attempt:
```elixir
def execute_trade(params) do
  # Create order record BEFORE API call
  {:ok, order} = create_order(%{
    user_id: params.user_id,
    bot_id: params.bot_id,
    symbol: params.symbol,
    side: params.side,
    quantity: params.quantity,
    type: "MARKET",
    status: "NEW"
  })

  # Call exchange API
  case Binance.TestnetExecutor.place_order(...) do
    {:ok, exchange_result} ->
      # Update order status
      update_order(order, %{
        status: exchange_result.status,  # "FILLED"
        filled_quantity: exchange_result.executedQty,
        avg_price: exchange_result.price,
        exchange_order_id: exchange_result.orderId
      })

      # Create fill record
      create_fill(order, exchange_result)

    {:error, reason} ->
      # Mark order as failed
      update_order(order, %{status: "FAILED", error: reason})
  end
end
```

2. Link orders to positions via foreign key
3. Support partial fills with status transitions

**Estimated Effort:** 1 week
**Priority:** P2 (Medium)

#### Remedy 7: Implement Dynamic Strategy Configuration
**Gap:** Strategies are hardcoded in modules
**Impact:** Cannot change strategy without redeployment

**Implementation:**
1. Create strategy registry table:
```sql
CREATE TABLE strategy.strategies (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  module VARCHAR(255) NOT NULL,  -- "TradeEngine.Strategies.MomentumGrid"
  default_config JSONB NOT NULL,
  schema JSONB NOT NULL,  -- JSON Schema for config validation
  is_active BOOLEAN DEFAULT true
);
```

2. Implement strategy behavior:
```elixir
defmodule TradeEngine.Strategy do
  @callback init(config :: map()) :: state :: any()
  @callback on_candle_closed(candle, state, positions) :: {action, new_state}
  @callback on_tick(price, state, positions) :: {action, new_state}

  # Config validation
  def validate_config(strategy_id, config) do
    strategy = Repo.get!(Strategy, strategy_id)
    schema = strategy.schema

    ExJsonSchema.Validator.validate(schema, config)
  end
end
```

3. Allow runtime config changes (restart bot with new config)

**Estimated Effort:** 1.5 weeks
**Priority:** P2 (Medium)

#### Remedy 8: Add Per-User Credentials
**Gap:** Global API keys from environment
**Impact:** All users share same exchange account

**Implementation:**
1. Create credentials table (see section 5.3)
2. Implement encryption with Cloak
3. Update trade execution to use user credentials
4. Add credential management UI
5. Implement key rotation

**Estimated Effort:** 1 week
**Priority:** P2 (Medium)

### 9.4 Low-Priority Enhancements

#### Enhancement 1: Shift Handoff System
- Activity logging integration
- Shift tracking
- Watch list management
- Handoff notes persistence

**Estimated Effort:** 1 week
**Priority:** P3 (Low)

#### Enhancement 2: Advanced Analytics
- Win rate calculation across timeframes
- Sharpe ratio, drawdown metrics
- Strategy performance comparison
- Backtesting framework

**Estimated Effort:** 2 weeks
**Priority:** P3 (Low)

#### Enhancement 3: Bot Templates
- Pre-configured bot templates
- Strategy marketplace
- Community-shared configs
- Bot cloning

**Estimated Effort:** 1 week
**Priority:** P3 (Low)

---

## 10. Success Metrics

### 10.1 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| WebSocket Latency | < 50ms | Ping-pong time |
| Position Update Frequency | 1/sec | PubSub broadcast rate |
| Infra Metrics Update | 4 sec | Channel push rate |
| API Response Time (p95) | < 200ms | HTTP endpoint metrics |
| Cache Hit Rate | > 90% | ETS/Redis stats |
| Database Query Time (p95) | < 100ms | Ecto telemetry |
| Concurrent Bots Supported | 100+ | Load testing |
| System Uptime | 99.9% | Production monitoring |

### 10.2 Feature Completeness

| Feature | UI Pages Enabled | Status |
|---------|------------------|--------|
| Bot Fleet Management | `/dashboard/bot-fleet` | To Implement |
| Live Position Tracking | `/trading` | To Implement |
| Infrastructure Monitoring | `/dashboard/infra`, `/dashboard/mission-control` | To Implement |
| Alert System | `/dashboard/alerts` | To Implement |
| Bot Configuration | `/settings/bot-engine` | Partial (hardcoded) |
| Shift Handoff | `/dashboard/shift-handoff` | To Implement |
| Multi-User Support | All pages | To Implement |

---

## 11. Conclusion

### 11.1 Current State Summary

**Strengths:**
- ✅ Sophisticated physics-based trading engine
- ✅ Real-time market data infrastructure (WebSocket + PubSub)
- ✅ Comprehensive database schema with physics model fields
- ✅ Active transaction and position creation (2,197 + 31,468 records)

**Critical Gaps:**
- ❌ No bot entity system (cannot manage multiple bots)
- ❌ Broken position lifecycle (all 31,468 positions stuck as 'open')
- ❌ No infrastructure monitoring (UI pages non-functional)
- ❌ No alert system (critical for operations)
- ❌ Global credentials (no multi-user support)

### 11.2 Recommended Path Forward

**Immediate (Weeks 1-4):**
1. Implement bot entity system with Worker GenServers
2. Fix position close logic and enable P&L updates
3. Create WebSocket channels for real-time updates
4. Set up caching infrastructure (ETS + Redis)

**Short-Term (Weeks 5-8):**
1. Add infrastructure monitoring
2. Implement alert management system
3. Enable order lifecycle tracking
4. Add per-user credential support

**Medium-Term (Weeks 9-12):**
1. Dynamic strategy configuration system
2. Performance optimization and load testing
3. Full UI integration and testing
4. Documentation and deployment guides

### 11.3 Estimated Timeline

- **Minimum Viable Product (MVP):** 8 weeks
  - Covers critical gaps, enables core UI functionality
- **Full Feature Completeness:** 12 weeks
  - Includes all enhancements and production readiness
- **Ongoing:** Monitoring, optimization, new strategies

### 11.4 Risk Mitigation

**Technical Risks:**
- Database migration complexity → Use hybrid approach (keep old schema)
- WebSocket scalability → Use Phoenix Channels (battle-tested)
- Cache consistency → Implement TTL-based invalidation
- Multi-bot resource usage → Add resource limits per bot

**Business Risks:**
- Breaking existing trading logic → Comprehensive testing + gradual rollout
- User adoption → Phased feature release with feedback loops
- Exchange API rate limits → Implement rate limiting and queuing

---

**Document Version:** 1.0
**Next Review Date:** March 1, 2026
**Owner:** Trading Engine Team
