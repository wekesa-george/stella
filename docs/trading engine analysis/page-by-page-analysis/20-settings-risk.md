# Page 20: `/settings/risk` - Risk Controls

**Route:** `/settings/risk`
**Page Type:** Admin Configuration (Platform-Wide Settings)
**User Persona:** Platform Admin
**Real-time Requirements:** No (form-based updates, but changes apply immediately to running bots)

---

## UI Features & Requirements

### Mock Data Structure (page.tsx:6-21)

```typescript
const riskSettings = {
  maxDrawdown: 10,                    // %
  dailyLossLimit: 5,                  // %
  maxPositionSize: 8,                 // % of user equity
  maxConcurrentPositions: 20,         // positions
  circuitBreakerPct: 15,              // %
  circuitBreakerWindow: 4,            // hours
  maxLeverage: 5,                     // x
  maxBotsPerUser: 10,                 // bots
  forceLimit: true,                   // boolean
  autoHaltOnCircuit: true,            // boolean
  notifyOnDrawdown: true,             // boolean
  allowMarketOrders: true,            // boolean
  requireStopLoss: false,             // boolean
  maxSlippage: 0.5,                   // %
};
```

### UI Components

**1. Warning Banner (page.tsx:51-57)**
- Warning that changes take effect immediately
- Changes may trigger automatic halts on running bots

**2. Drawdown & Loss Limits Section (page.tsx:60-146)**

Range Sliders:
- Max Platform Drawdown (1-30%, step 0.5%) - "When platform equity drops this % from peak, all bots pause and an alert fires"
- Daily Loss Limit per user (1-20%, step 0.5%) - "If a user's portfolio loses more than this in a calendar day, their bots auto-pause"
- Circuit Breaker Threshold (5-50%, step 1%) - "Emergency halt: kills ALL bots platform-wide if this % loss occurs"
- Circuit Breaker Window (1-24h, step 1h) - "How many hours the circuit breaker looks back when calculating loss"
- Max Slippage Tolerance (0.05-3%, step 0.05%) - "Orders with expected slippage above this are cancelled, not executed"

Toggles:
- Auto-halt on circuit breaker - "When the circuit breaker threshold is hit, automatically kill all bots without requiring manual confirmation"
- Alert on drawdown approach - "Send a warning alert when platform drawdown reaches 80% of the configured limit"

**3. Position & Exposure Limits Section (page.tsx:149-248)**

Range Sliders:
- Max Position Size (1-50% of user equity, step 0.5%) - "No single position can exceed this percentage of the user's total equity"
- Max Concurrent Positions (1-100 positions, step 1) - "Maximum open positions per bot at any one time"
- Maximum Leverage (1-125x, step 1) - "Hard ceiling on leverage regardless of what the exchange allows"
- Max Bots Per User (1-50 bots, step 1) - "Platform-wide ceiling. Subscription tier limits apply within this"

Toggles:
- Force limit orders only - "Disallow market orders platform-wide. All orders must be placed as limit orders"
- Allow market orders - "Permit market orders. Overridden by 'Force limit orders only' above" (disabled if force limit is on)
- Require stop-loss on all positions - "Bots cannot open a position without a configured stop-loss level"

**4. Dirty State Management (page.tsx:232-247)**
- Save Changes button (appears when form is dirty)
- Discard Changes button (appears when form is dirty)

---

## Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| All Risk Settings | All 14 fields | `platform.risk_controls` (singleton table) | REST API | On page load |
| Save Changes | All 14 fields | `platform.risk_controls` UPDATE | REST API | On user action |
| Circuit Breaker Monitoring | Platform equity, loss % | Phoenix GenServer `RiskMonitor` | Background | Every 1 minute |
| Drawdown Alert Generation | Current drawdown vs limit | Phoenix GenServer `RiskMonitor` | Background | Every 1 minute |
| Bot Start Validation | Risk limits enforcement | Phoenix ETS cache `:risk_controls_cache` | On-demand | ETS (invalidate on update) |

---

## Database Schema Requirements

### New Tables

**1. `platform.risk_controls` (Singleton table)**

```sql
CREATE TABLE platform.risk_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Drawdown & Loss Limits
  max_drawdown_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    CHECK (max_drawdown_pct >= 1 AND max_drawdown_pct <= 30),

  daily_loss_limit_pct DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    CHECK (daily_loss_limit_pct >= 1 AND daily_loss_limit_pct <= 20),

  circuit_breaker_pct DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    CHECK (circuit_breaker_pct >= 5 AND circuit_breaker_pct <= 50),

  circuit_breaker_window_hours INTEGER NOT NULL DEFAULT 4,
    CHECK (circuit_breaker_window_hours >= 1 AND circuit_breaker_window_hours <= 24),

  max_slippage_pct DECIMAL(5,2) NOT NULL DEFAULT 0.50,
    CHECK (max_slippage_pct >= 0.05 AND max_slippage_pct <= 3),

  -- Position & Exposure Limits
  max_position_size_pct DECIMAL(5,2) NOT NULL DEFAULT 8.00,
    CHECK (max_position_size_pct >= 1 AND max_position_size_pct <= 50),

  max_concurrent_positions INTEGER NOT NULL DEFAULT 20,
    CHECK (max_concurrent_positions >= 1 AND max_concurrent_positions <= 100),

  max_leverage DECIMAL(6,2) NOT NULL DEFAULT 5.00,
    CHECK (max_leverage >= 1 AND max_leverage <= 125),

  max_bots_per_user INTEGER NOT NULL DEFAULT 10,
    CHECK (max_bots_per_user >= 1 AND max_bots_per_user <= 50),

  -- Feature Toggles
  force_limit_orders BOOLEAN NOT NULL DEFAULT true,
  auto_halt_on_circuit BOOLEAN NOT NULL DEFAULT true,
  notify_on_drawdown BOOLEAN NOT NULL DEFAULT true,
  allow_market_orders BOOLEAN NOT NULL DEFAULT true,
  require_stop_loss BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_risk_controls_row CHECK (id = id)
);

CREATE UNIQUE INDEX idx_risk_controls_singleton ON platform.risk_controls ((1));

INSERT INTO platform.risk_controls (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING;
```

**2. `platform.circuit_breaker_events`**

```sql
CREATE TABLE platform.circuit_breaker_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_reason VARCHAR(100) NOT NULL,
  loss_pct DECIMAL(5,2) NOT NULL,
  threshold_pct DECIMAL(5,2) NOT NULL,
  platform_equity_before DECIMAL(15,2),
  platform_equity_after DECIMAL(15,2),
  bots_halted_count INTEGER NOT NULL DEFAULT 0,
  positions_closed_count INTEGER NOT NULL DEFAULT 0,
  auto_halted BOOLEAN NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES auth.users(id),
  metadata JSONB
);

CREATE INDEX idx_circuit_breaker_events_triggered ON platform.circuit_breaker_events (triggered_at DESC);
CREATE INDEX idx_circuit_breaker_events_unresolved ON platform.circuit_breaker_events (resolved_at) WHERE resolved_at IS NULL;
```

**3. `platform.user_drawdown_tracking`**

```sql
CREATE TABLE platform.user_drawdown_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  starting_equity DECIMAL(15,2) NOT NULL,
  current_equity DECIMAL(15,2) NOT NULL,
  peak_equity DECIMAL(15,2) NOT NULL,
  drawdown_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  daily_loss_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  bots_paused_at TIMESTAMPTZ,
  bots_resumed_at TIMESTAMPTZ,
  UNIQUE(user_id, date)
);

CREATE INDEX idx_user_drawdown_user ON platform.user_drawdown_tracking (user_id, date DESC);
CREATE INDEX idx_user_drawdown_date ON platform.user_drawdown_tracking (date DESC);
```

---

## NestJS REST API Endpoints

### 1. `GET /api/settings/risk` - Load Risk Controls

**Authentication:** Admin role required

**Response:**
```typescript
interface RiskControlsResponse {
  max_drawdown_pct: number;
  daily_loss_limit_pct: number;
  circuit_breaker_pct: number;
  circuit_breaker_window_hours: number;
  max_slippage_pct: number;
  max_position_size_pct: number;
  max_concurrent_positions: number;
  max_leverage: number;
  max_bots_per_user: number;
  force_limit_orders: boolean;
  auto_halt_on_circuit: boolean;
  notify_on_drawdown: boolean;
  allow_market_orders: boolean;
  require_stop_loss: boolean;
  updated_at: string;
  updated_by_user_id: string | null;
}
```

**Implementation:**
```typescript
async getRiskControls(): Promise<RiskControlsResponse> {
  const controls = await this.riskControlsRepo.findOne({});
  if (!controls) throw new Error('Risk controls not initialized');
  return controls;
}
```

### 2. `PUT /api/settings/risk` - Update Risk Controls

**Authentication:** Admin role + audit logging

**Request:** Same as RiskControlsResponse (without metadata)

**Response:**
```typescript
{
  "risk_controls": RiskControlsResponse,
  "message": "Risk controls updated successfully. Changes are now in effect for all running bots.",
  "warnings": [
    "Circuit breaker threshold was lowered. This may trigger automatic halts on currently open positions."
  ]
}
```

**Implementation:**
```typescript
async updateRiskControls(data: UpdateRiskControlsDto, adminUserId: string) {
  const controls = await this.riskControlsRepo.findOne({});

  const updated = await this.riskControlsRepo.save({
    ...controls,
    ...data,
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  await this.auditService.log({
    action: 'risk_controls_updated',
    admin_user_id: adminUserId,
    metadata: { changes: data },
  });

  // Invalidate Phoenix ETS cache
  await this.phoenixClient.post('/api/phoenix/risk/invalidate-cache');

  const warnings: string[] = [];
  if (data.circuit_breaker_pct < controls.circuit_breaker_pct) {
    warnings.push('Circuit breaker threshold was lowered...');
  }

  return { risk_controls: updated, message: '...', warnings };
}
```

---

## Phoenix GenServer: `RiskMonitor`

**Purpose:** Monitor platform-wide risk metrics and enforce risk controls in real-time.

**Implementation:**

```elixir
defmodule TradeEngine.Risk.Monitor do
  use GenServer

  @check_interval :timer.minutes(1)

  def init(_opts) do
    load_risk_controls_to_ets()
    schedule_risk_check()
    {:ok, %{}}
  end

  def handle_info(:check_risk, state) do
    check_platform_drawdown()
    check_circuit_breaker()
    check_user_daily_loss_limits()

    schedule_risk_check()
    {:noreply, state}
  end

  defp check_platform_drawdown do
    risk_controls = get_risk_controls_from_ets()
    platform_equity = calculate_platform_equity()
    peak_equity = get_peak_equity()
    drawdown_pct = ((peak_equity - platform_equity) / peak_equity) * 100

    threshold_pct = risk_controls.max_drawdown_pct
    alert_threshold_pct = threshold_pct * 0.8

    cond do
      drawdown_pct >= threshold_pct ->
        halt_all_bots("platform_drawdown_exceeded")
        create_circuit_breaker_event("platform_drawdown", drawdown_pct, threshold_pct)

      risk_controls.notify_on_drawdown && drawdown_pct >= alert_threshold_pct ->
        create_alert("platform_drawdown_warning", drawdown_pct, threshold_pct)

      true ->
        :ok
    end
  end

  defp check_circuit_breaker do
    risk_controls = get_risk_controls_from_ets()
    window_hours = risk_controls.circuit_breaker_window_hours
    threshold_pct = risk_controls.circuit_breaker_pct

    window_start = DateTime.add(DateTime.utc_now(), -window_hours, :hour)
    equity_at_window_start = get_equity_at_time(window_start)
    current_equity = calculate_platform_equity()
    loss_pct = ((equity_at_window_start - current_equity) / equity_at_window_start) * 100

    if loss_pct >= threshold_pct do
      if risk_controls.auto_halt_on_circuit do
        halt_all_bots("circuit_breaker_triggered")
      end
      create_circuit_breaker_event("circuit_breaker", loss_pct, threshold_pct)
    end
  end

  defp check_user_daily_loss_limits do
    risk_controls = get_risk_controls_from_ets()
    daily_loss_limit_pct = risk_controls.daily_loss_limit_pct

    users = Repo.all(from u in User, where: u.has_active_bots == true)

    Enum.each(users, fn user ->
      tracking = get_or_create_drawdown_tracking(user.id)
      current_equity = calculate_user_equity(user.id)
      daily_loss_pct = ((tracking.starting_equity - current_equity) / tracking.starting_equity) * 100

      if daily_loss_pct >= daily_loss_limit_pct && is_nil(tracking.bots_paused_at) do
        pause_user_bots(user.id, "daily_loss_limit_exceeded")
        Repo.update!(UserDrawdownTracking.changeset(tracking, %{
          bots_paused_at: DateTime.utc_now()
        }))
      end
    end)
  end
end
```

---

## Bot Start Validation (Phoenix)

```elixir
defmodule TradeEngine.Bots.Supervisor do
  def start_bot(bot_id, user_id) do
    risk_controls = get_risk_controls_from_ets()

    user_bot_count = Repo.aggregate(
      from(b in Bot, where: b.user_id == ^user_id and b.status in ["running", "paused"]),
      :count
    )

    if user_bot_count >= risk_controls.max_bots_per_user do
      {:error, "Bot limit reached: #{user_bot_count}/#{risk_controls.max_bots_per_user}"}
    else
      bot = Repo.get!(Bot, bot_id)

      if bot.leverage > risk_controls.max_leverage do
        {:error, "Bot leverage exceeds platform limit"}
      elsif risk_controls.require_stop_loss && is_nil(bot.stop_loss_pct) do
        {:error, "Stop-loss is required for all bots"}
      else
        DynamicSupervisor.start_child(__MODULE__, {TradeEngine.Bots.Worker, bot_id: bot_id})
      end
    end
  end
end
```

---

## Order Placement Validation (Phoenix)

```elixir
defmodule TradeEngine.Orders.Manager do
  def place_order(bot_id, order_params) do
    risk_controls = get_risk_controls_from_ets()

    if order_params.order_type == "market" do
      if risk_controls.force_limit_orders || !risk_controls.allow_market_orders do
        {:error, "Market orders are disabled"}
      else
        validate_and_place_order(bot_id, order_params, risk_controls)
      end
    else
      validate_and_place_order(bot_id, order_params, risk_controls)
    end
  end

  defp validate_and_place_order(bot_id, order_params, risk_controls) do
    bot = Repo.get!(Bot, bot_id)
    user_equity = calculate_user_equity(bot.user_id)
    position_value = order_params.quantity * order_params.price
    position_size_pct = (position_value / user_equity) * 100

    cond do
      position_size_pct > risk_controls.max_position_size_pct ->
        {:error, "Position size exceeds platform limit"}

      count_open_positions(bot_id) >= risk_controls.max_concurrent_positions ->
        {:error, "Concurrent position limit reached"}

      calculate_expected_slippage(order_params) > risk_controls.max_slippage_pct ->
        {:error, "Expected slippage exceeds platform limit"}

      true ->
        execute_order(bot, order_params)
    end
  end
end
```

---

## Data Flow Summary

```
[Page Load]
   │
   └─> GET /api/settings/risk (NestJS)
         └─> Query platform.risk_controls → Return settings

[Admin Updates Risk Controls]
   │
   └─> PUT /api/settings/risk (NestJS)
         ├─> Update platform.risk_controls
         ├─> Log audit trail
         ├─> POST /api/phoenix/risk/invalidate-cache
         │     └─> Phoenix: Clear :risk_controls_cache ETS
         └─> Return updated settings with warnings

[Background: Risk Monitoring - Every 1 minute]
   │
   └─> RiskMonitor GenServer (Phoenix)
         ├─> Check platform drawdown
         │     ├─> If >= max_drawdown_pct: Halt all bots
         │     └─> If >= 80% of limit: Send warning alert
         ├─> Check circuit breaker
         │     ├─> Calculate loss over window (e.g., 4 hours)
         │     └─> If >= circuit_breaker_pct: Trigger halt
         └─> Check user daily loss limits
               └─> If >= daily_loss_limit_pct: Pause user's bots

[Bot Start Validation]
   │
   └─> Phoenix: Check ETS cache
         ├─> Validate max_bots_per_user
         ├─> Validate leverage <= max_leverage
         └─> Validate stop-loss if required

[Order Placement Validation]
   │
   └─> Phoenix: Check ETS cache
         ├─> Validate market orders allowed
         ├─> Validate position size <= max_position_size_pct
         ├─> Validate concurrent positions <= limit
         └─> Validate slippage <= max_slippage_pct
```

---

## Summary Table

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Risk controls settings | `platform.risk_controls` | NestJS REST | HTTP | No cache |
| Update risk controls | `platform.risk_controls` UPDATE | NestJS REST | HTTP | No cache |
| ETS cache for validation | `:risk_controls_cache` | Phoenix ETS | N/A | Invalidate on update |
| Platform drawdown monitoring | Calculated from positions | Phoenix GenServer | N/A | Every 1 minute |
| Circuit breaker monitoring | Equity history | Phoenix GenServer | N/A | Every 1 minute |
| User daily loss tracking | `platform.user_drawdown_tracking` | Phoenix GenServer | N/A | Every 1 minute |

---

## Frontend Implementation Notes

```typescript
// hooks/useRiskControls.ts
export function useRiskControls() {
  const [riskControls, setRiskControls] = useState<RiskControls | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch('/api/settings/risk')
      .then(res => res.json())
      .then(data => setRiskControls(data));
  }, []);

  const updateField = (field: string, value: any) => {
    setRiskControls(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const saveChanges = async () => {
    const response = await fetch('/api/settings/risk', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(riskControls),
    });
    const result = await response.json();
    setDirty(false);
    toast.success(result.message);
  };

  return { riskControls, dirty, updateField, saveChanges };
}
```

---

## Performance Considerations

1. **Singleton Table:** Enforce only 1 row in `platform.risk_controls` for consistent settings
2. **ETS Cache:** Cache controls in Phoenix ETS for fast validation during bot starts and orders
3. **Risk Monitoring:** Run every 1 minute to balance responsiveness with CPU usage
4. **Circuit Breaker:** Pre-calculate equity snapshots every 1 minute to avoid expensive queries

---

## Testing Checklist

- [ ] Risk controls load correctly on page load
- [ ] Admin can update all 14 risk control fields
- [ ] Dirty state triggers Save/Discard buttons
- [ ] Phoenix ETS cache invalidates after update
- [ ] Bot start blocked if max_bots_per_user exceeded
- [ ] Bot start blocked if leverage exceeds max_leverage
- [ ] Bot start blocked if stop-loss required but missing
- [ ] Order blocked if market orders disabled
- [ ] Order blocked if position size exceeds limit
- [ ] Order blocked if concurrent positions limit reached
- [ ] Order blocked if slippage exceeds limit
- [ ] Platform drawdown halts all bots when limit exceeded
- [ ] Circuit breaker triggers when threshold hit
- [ ] User daily loss limit pauses bots
- [ ] Drawdown warning alert fires at 80% of limit
- [ ] Circuit breaker events logged to database
- [ ] Audit logs capture all changes

---

**[← Back to Index](./00-INDEX.md)** | **[Next Page →](./21-settings-integrations.md)**
