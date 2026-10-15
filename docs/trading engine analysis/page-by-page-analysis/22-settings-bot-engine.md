# Page 22: `/settings/bot-engine` - Bot Engine Defaults

**Route:** `/settings/bot-engine`
**Page Type:** Admin Configuration (Platform-Wide Bot Settings)
**User Persona:** Platform Admin
**Real-time Requirements:** No (form-based updates, inherited by new bots)

---

## UI Features & Requirements

### Mock Data Structure (page.tsx:6-19)

```typescript
const botEngineDefaults = {
  heartbeatInterval: 5,              // seconds
  orderTimeout: 30,                  // seconds
  retryAttempts: 3,                  // retries
  retryBackoff: 2,                   // multiplier (x)
  reconcileFreq: 15,                 // minutes
  defaultSlippage: 0.1,              // %
  maxOrderAge: 300,                  // seconds
  positionPrecision: 4,              // decimal places
  enableHeartbeatAlert: true,        // boolean
  enableStaleOrderCancel: true,      // boolean
  enableAutoReconcile: true,         // boolean
  enablePartialFillContinue: true,   // boolean
};
```

### UI Components

**1. Timing & Retry Section (page.tsx:49-124)**

Range Sliders:
- Heartbeat Interval (1-60s, step 1s) - "How often each bot broadcasts a status update to the platform"
- Order Timeout (5-300s, step 5s) - "Time to wait for an order acknowledgement before marking it as failed"
- Max Order Age (60-3600s, step 60s) - "Unfilled orders older than this are automatically cancelled"
- Retry Attempts (0-10, step 1) - "How many times to retry a failed order before giving up"
- Retry Backoff Multiplier (1-5x, step 0.5x) - "Each retry waits (attempt × backoff) seconds longer than the last"
- Reconciliation Frequency (1-60min, step 1min) - "How often each bot reconciles its state against the exchange's actual positions"

**2. Order Defaults Section (page.tsx:127-199)**

Input Fields:
- Default Slippage Tolerance (%) - "Bots will not execute if slippage exceeds this. Overridable per strategy"
- Position Size Precision (decimal places) - "Number of decimal places for position size calculations"

Toggles:
- Alert on missed heartbeat - "Fire a warning alert if a running bot misses 3 consecutive heartbeats"
- Auto-cancel stale orders - "Automatically cancel orders older than 'Max Order Age'"
- Auto-reconcile on discrepancy - "If reconciliation finds a position mismatch, auto-correct without manual intervention"
- Continue on partial fill - "Bot continues to next logic cycle after a partial fill rather than waiting for full fill"

**3. Dirty State Management (page.tsx:183-198)**
- Save Changes button (appears when form is dirty)
- Discard Changes button (appears when form is dirty)

---

## Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| All Bot Engine Settings | All 12 fields | `platform.bot_engine_defaults` (singleton) | REST API | On page load |
| Save Changes | All 12 fields | `platform.bot_engine_defaults` UPDATE | REST API | On user action |
| New Bot Initialization | Inherit defaults | Phoenix bot creation logic | N/A | On bot creation |

---

## Database Schema Requirements

### New Tables

**1. `platform.bot_engine_defaults` (Singleton table)**

```sql
CREATE TABLE platform.bot_engine_defaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Timing & Retry
  heartbeat_interval_sec INTEGER NOT NULL DEFAULT 5,
    CHECK (heartbeat_interval_sec >= 1 AND heartbeat_interval_sec <= 60),

  order_timeout_sec INTEGER NOT NULL DEFAULT 30,
    CHECK (order_timeout_sec >= 5 AND order_timeout_sec <= 300),

  max_order_age_sec INTEGER NOT NULL DEFAULT 300,
    CHECK (max_order_age_sec >= 60 AND max_order_age_sec <= 3600),

  retry_attempts INTEGER NOT NULL DEFAULT 3,
    CHECK (retry_attempts >= 0 AND retry_attempts <= 10),

  retry_backoff_multiplier DECIMAL(3,1) NOT NULL DEFAULT 2.0,
    CHECK (retry_backoff_multiplier >= 1.0 AND retry_backoff_multiplier <= 5.0),

  reconcile_frequency_min INTEGER NOT NULL DEFAULT 15,
    CHECK (reconcile_frequency_min >= 1 AND reconcile_frequency_min <= 60),

  -- Order Defaults
  default_slippage_pct DECIMAL(5,2) NOT NULL DEFAULT 0.10,
    CHECK (default_slippage_pct >= 0.01 AND default_slippage_pct <= 5.0),

  position_precision INTEGER NOT NULL DEFAULT 4,
    CHECK (position_precision >= 0 AND position_precision <= 8),

  -- Feature Toggles
  enable_heartbeat_alert BOOLEAN NOT NULL DEFAULT true,
  enable_stale_order_cancel BOOLEAN NOT NULL DEFAULT true,
  enable_auto_reconcile BOOLEAN NOT NULL DEFAULT true,
  enable_partial_fill_continue BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_bot_engine_defaults_row CHECK (id = id)
);

CREATE UNIQUE INDEX idx_bot_engine_defaults_singleton ON platform.bot_engine_defaults ((1));

INSERT INTO platform.bot_engine_defaults (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING;
```

### Schema Extensions

**Update `trading.bots` to track custom overrides:**

```sql
ALTER TABLE trading.bots
  ADD COLUMN uses_default_heartbeat BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN uses_default_timeout BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN uses_default_slippage BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN uses_default_reconcile BOOLEAN NOT NULL DEFAULT true,

  ADD COLUMN custom_heartbeat_interval_sec INTEGER,
  ADD COLUMN custom_order_timeout_sec INTEGER,
  ADD COLUMN custom_slippage_pct DECIMAL(5,2),
  ADD COLUMN custom_reconcile_freq_min INTEGER;
```

---

## NestJS REST API Endpoints

### 1. `GET /api/settings/bot-engine` - Load Bot Engine Defaults

**Authentication:** Admin role required

**Response:**
```typescript
interface BotEngineDefaultsResponse {
  heartbeat_interval_sec: number;
  order_timeout_sec: number;
  max_order_age_sec: number;
  retry_attempts: number;
  retry_backoff_multiplier: number;
  reconcile_frequency_min: number;
  default_slippage_pct: number;
  position_precision: number;
  enable_heartbeat_alert: boolean;
  enable_stale_order_cancel: boolean;
  enable_auto_reconcile: boolean;
  enable_partial_fill_continue: boolean;
  updated_at: string;
  updated_by_user_id: string | null;
}
```

**Implementation:**
```typescript
async getBotEngineDefaults(): Promise<BotEngineDefaultsResponse> {
  const defaults = await this.botEngineDefaultsRepo.findOne({});
  if (!defaults) throw new Error('Bot engine defaults not initialized');
  return defaults;
}
```

### 2. `PUT /api/settings/bot-engine` - Update Bot Engine Defaults

**Authentication:** Admin role + audit logging

**Request:** Same as BotEngineDefaultsResponse (without metadata)

**Response:**
```typescript
{
  "bot_engine_defaults": BotEngineDefaultsResponse,
  "message": "Bot engine defaults updated. New bots will inherit these settings.",
  "affected_bots_count": 47
}
```

**Implementation:**
```typescript
async updateBotEngineDefaults(data: UpdateBotEngineDefaultsDto, adminUserId: string) {
  const defaults = await this.botEngineDefaultsRepo.findOne({});

  const updated = await this.botEngineDefaultsRepo.save({
    ...defaults,
    ...data,
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  const affectedBotsCount = await this.botRepo.count({
    where: { uses_default_heartbeat: true },
  });

  await this.auditService.log({
    action: 'bot_engine_defaults_updated',
    admin_user_id: adminUserId,
    metadata: { changes: data, affected_bots_count: affectedBotsCount },
  });

  return {
    bot_engine_defaults: updated,
    message: 'Bot engine defaults updated. New bots will inherit these settings.',
    affected_bots_count: affectedBotsCount,
  };
}
```

---

## Phoenix Bot Creation Logic

**Inherit defaults when creating a new bot:**

```elixir
defmodule TradeEngine.Bots.Manager do
  def create_bot(params) do
    defaults = Repo.one!(BotEngineDefaults)

    bot = %Bot{
      name: params.name,
      user_id: params.user_id,
      strategy_id: params.strategy_id,

      # Inherit platform defaults
      heartbeat_interval_sec: defaults.heartbeat_interval_sec,
      order_timeout_sec: defaults.order_timeout_sec,
      retry_attempts: defaults.retry_attempts,
      retry_backoff_multiplier: defaults.retry_backoff_multiplier,
      reconcile_frequency_min: defaults.reconcile_frequency_min,
      default_slippage_pct: defaults.default_slippage_pct,

      # Track that bot uses defaults
      uses_default_heartbeat: true,
      uses_default_timeout: true,
      uses_default_slippage: true,
      uses_default_reconcile: true,

      status: "stopped",
      created_at: DateTime.utc_now()
    }

    Repo.insert!(bot)
  end
end
```

---

## Phoenix Bot Worker Logic

**Use bot engine defaults during runtime:**

```elixir
defmodule TradeEngine.Bots.Worker do
  use GenServer

  def init(opts) do
    bot_id = Keyword.fetch!(opts, :bot_id)
    bot = Repo.get!(Bot, bot_id)
    defaults = Repo.one!(BotEngineDefaults)

    # Schedule heartbeat
    heartbeat_interval = bot.custom_heartbeat_interval_sec || defaults.heartbeat_interval_sec
    Process.send_after(self(), :heartbeat, heartbeat_interval * 1000)

    # Schedule reconciliation
    reconcile_freq = bot.custom_reconcile_freq_min || defaults.reconcile_frequency_min
    Process.send_after(self(), :reconcile, reconcile_freq * 60 * 1000)

    state = %{
      bot: bot,
      defaults: defaults,
      missed_heartbeats: 0,
      last_heartbeat_at: DateTime.utc_now()
    }

    {:ok, state}
  end

  def handle_info(:heartbeat, state) do
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "bot:user:#{state.bot.user_id}", {
      :bot_heartbeat,
      %{
        bot_id: state.bot.id,
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
        status: "running"
      }
    })

    Repo.update!(Bot.changeset(state.bot, %{ last_heartbeat_at: DateTime.utc_now() }))

    heartbeat_interval = state.bot.custom_heartbeat_interval_sec || state.defaults.heartbeat_interval_sec
    Process.send_after(self(), :heartbeat, heartbeat_interval * 1000)

    {:noreply, %{state | last_heartbeat_at: DateTime.utc_now(), missed_heartbeats: 0}}
  end

  def handle_info(:reconcile, state) do
    if state.defaults.enable_auto_reconcile do
      case reconcile_positions(state.bot) do
        :ok -> Logger.info("Bot #{state.bot.id} reconciled successfully")
        {:error, reason} -> Logger.error("Reconciliation failed: #{reason}")
      end
    end

    reconcile_freq = state.bot.custom_reconcile_freq_min || state.defaults.reconcile_frequency_min
    Process.send_after(self(), :reconcile, reconcile_freq * 60 * 1000)

    {:noreply, state}
  end

  def handle_cast({:place_order, order_params}, state) do
    timeout = state.bot.custom_order_timeout_sec || state.defaults.order_timeout_sec
    retry_attempts = state.defaults.retry_attempts
    retry_backoff = state.defaults.retry_backoff_multiplier

    result = place_order_with_retry(order_params, timeout, retry_attempts, retry_backoff)

    case result do
      {:ok, %{status: "partially_filled"}} ->
        if state.defaults.enable_partial_fill_continue, do: :ok, else: :wait

      {:ok, _} -> :ok
      {:error, reason} -> Logger.error("Order failed: #{reason}")
    end

    {:noreply, state}
  end

  defp place_order_with_retry(order_params, timeout, retry_attempts, backoff, attempt \\ 0) do
    case ExchangeAPI.place_order(order_params, timeout: timeout * 1000) do
      {:ok, result} -> {:ok, result}
      {:error, reason} when attempt < retry_attempts ->
        wait_time = round(attempt * backoff * 1000)
        :timer.sleep(wait_time)
        place_order_with_retry(order_params, timeout, retry_attempts, backoff, attempt + 1)
      {:error, reason} -> {:error, reason}
    end
  end
end
```

---

## Stale Order Cancellation (Phoenix Scheduler)

```elixir
defmodule TradeEngine.Schedulers.StaleOrderCanceller do
  use GenServer

  @check_interval :timer.minutes(1)

  def init(_opts) do
    schedule_check()
    {:ok, %{}}
  end

  def handle_info(:check_stale_orders, state) do
    defaults = Repo.one!(BotEngineDefaults)

    if defaults.enable_stale_order_cancel do
      max_age_sec = defaults.max_order_age_sec
      cutoff_time = DateTime.add(DateTime.utc_now(), -max_age_sec, :second)

      stale_orders = Repo.all(
        from o in Order,
        where: o.status in ["open", "partially_filled"] and o.created_at < ^cutoff_time
      )

      Enum.each(stale_orders, fn order ->
        Logger.info("Cancelling stale order #{order.id}")
        ExchangeAPI.cancel_order(order.exchange_order_id)

        Repo.update!(Order.changeset(order, %{
          status: "cancelled",
          cancel_reason: "stale_order_auto_cancel",
          cancelled_at: DateTime.utc_now()
        }))
      end)
    end

    schedule_check()
    {:noreply, state}
  end

  defp schedule_check do
    Process.send_after(self(), :check_stale_orders, @check_interval)
  end
end
```

---

## Data Flow Summary

```
[Page Load]
   │
   └─> GET /api/settings/bot-engine (NestJS)
         └─> Query platform.bot_engine_defaults → Return settings

[Admin Updates Defaults]
   │
   └─> PUT /api/settings/bot-engine (NestJS)
         ├─> Update platform.bot_engine_defaults
         ├─> Count bots using default settings
         ├─> Log audit trail
         └─> Return updated settings + affected bots count

[User Creates New Bot]
   │
   └─> POST /api/bots (NestJS) → POST /api/phoenix/bots (Phoenix)
         ├─> Load platform.bot_engine_defaults
         ├─> Create bot with inherited defaults
         ├─> Set uses_default_* flags to true
         └─> Insert into trading.bots

[Bot Runtime: Heartbeat]
   │
   └─> Bot Worker GenServer (Phoenix)
         ├─> Use bot.custom_heartbeat_interval_sec OR defaults
         ├─> Broadcast heartbeat via PubSub
         ├─> Update bot.last_heartbeat_at
         └─> Schedule next heartbeat

[Bot Runtime: Order Placement]
   │
   └─> Bot Worker GenServer (Phoenix)
         ├─> Use timeout from bot or defaults
         ├─> Place order with retry logic
         ├─> If partial fill: Check enable_partial_fill_continue
         └─> Continue or wait

[Bot Runtime: Reconciliation]
   │
   └─> Bot Worker GenServer (Phoenix)
         ├─> Use bot.custom_reconcile_freq_min OR defaults
         ├─> If enable_auto_reconcile: Reconcile with exchange
         └─> Schedule next reconciliation

[Background: Stale Orders - Every 1 minute]
   │
   └─> StaleOrderCanceller GenServer (Phoenix)
         ├─> Check if enable_stale_order_cancel is true
         ├─> Query orders older than max_order_age_sec
         ├─> Cancel each stale order on exchange
         └─> Update order status to "cancelled"
```

---

## Summary Table

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Bot engine defaults | `platform.bot_engine_defaults` | NestJS REST | HTTP | No cache |
| Update defaults | `platform.bot_engine_defaults` UPDATE | NestJS REST | HTTP | No cache |
| New bot creation | Inherit from defaults | Phoenix | N/A | No cache |
| Bot heartbeat logic | Bot settings or defaults | Phoenix GenServer | N/A | No cache |
| Order retry logic | Defaults | Phoenix GenServer | N/A | No cache |
| Reconciliation logic | Bot settings or defaults | Phoenix GenServer | N/A | No cache |
| Stale order cancellation | Defaults | Phoenix GenServer | N/A | Every 1 minute |

---

## Frontend Implementation Notes

```typescript
// hooks/useBotEngineDefaults.ts
export function useBotEngineDefaults() {
  const [botDefaults, setBotDefaults] = useState<BotEngineDefaults | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch('/api/settings/bot-engine')
      .then(res => res.json())
      .then(data => setBotDefaults(data));
  }, []);

  const updateField = (field: string, value: any) => {
    setBotDefaults(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const saveChanges = async () => {
    const response = await fetch('/api/settings/bot-engine', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(botDefaults),
    });
    const result = await response.json();
    setDirty(false);
    toast.success(`${result.message} (${result.affected_bots_count} bots using defaults)`);
  };

  return { botDefaults, dirty, updateField, saveChanges };
}
```

---

## Performance Considerations

1. **Singleton Table:** Enforce only 1 row for consistent settings
2. **Bot Creation:** Load defaults once during creation and store in bot record
3. **Runtime Settings:** Bots load defaults on init and cache in GenServer state
4. **Stale Orders:** Run every 1 minute with index on `orders.created_at`

---

## Testing Checklist

- [ ] Bot engine defaults load on page load
- [ ] Admin can update all 12 fields
- [ ] Dirty state triggers Save/Discard buttons
- [ ] New bots inherit platform defaults
- [ ] Bots use correct heartbeat interval
- [ ] Bots use correct order timeout
- [ ] Order retry follows retry_attempts and backoff
- [ ] Reconciliation runs at configured frequency
- [ ] Partial fill handling respects toggle
- [ ] Stale orders auto-cancelled when enabled
- [ ] Heartbeat alerts fire when enabled
- [ ] Auto-reconcile runs when enabled
- [ ] Affected bots count displayed after save
- [ ] Audit logs capture all changes

---

**[← Previous: Integrations](./21-settings-integrations.md)** | **[Back to Index](./00-INDEX.md)**
