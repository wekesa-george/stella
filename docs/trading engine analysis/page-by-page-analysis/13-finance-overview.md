## Page 13: `/finance/overview` - Platform Finance Overview

### UI Mock Data Structure

```typescript
interface EquityCurvePoint {
  day: number;              // 1-90
  value: number;            // Total equity in USD
  label: string;            // "Day 1", "Day 2", etc.
}

interface MonthlyReturn {
  month: string;            // "Jan", "Feb", etc.
  return: number;           // % return (-6 to 18)
  trades: number;           // 800-3200 trades
  volume: number;           // 1.2M-8.5M USD
}

interface DrawdownPoint {
  day: number;              // 1-90
  value: number;            // Drawdown % (negative)
}

interface PlatformKPIs {
  currentEquity: number;          // $500K+
  realizedPnL90d: number;         // Total P&L last 90 days
  totalTrades: number;            // Sum of all trades
  avgSharpeRatio: number;         // 2.31 (risk-adjusted return)
  activeUsers: number;            // 82
  usersWithActiveBots: number;    // 68
  totalAUM: number;               // $863K (Assets Under Management)
  platformWinRate: number;        // 63.1%
  maxDrawdown90d: number;         // -8.4%
}
```

### UI Features & Requirements

1. **Platform KPIs** - 8 stat cards showing platform-wide financial metrics
2. **Equity Curve Chart** - 90-day combined portfolio value (area chart)
3. **Monthly Returns Bar Chart** - % return by calendar month
4. **Drawdown Profile Chart** - % decline from peak equity
5. **Multi-Exchange Support** - Aggregate data across all exchanges **(ADDED for multi-exchange)**

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Current Equity** | PostgreSQL Aggregate | SUM of latest `trading.equity_snapshots.total_equity_usd` | Every 60s | Platform-wide total |
| **Realized P&L (90d)** | PostgreSQL Aggregate | SUM `trading.positions.realized_pnl_usd` WHERE `closed_at` last 90 days | On page load | Historical sum |
| **Total Trades** | PostgreSQL Count | COUNT `trading.orders` WHERE `status='filled'` last 90 days | On page load | All exchanges |
| **Sharpe Ratio** | Calculated | `(avg_return - risk_free_rate) / std_dev_returns` | Daily batch | Computed metric |
| **Active Users** | PostgreSQL Count | COUNT `auth.users` WHERE last activity < 30 days | On page load | User activity |
| **Users with Active Bots** | PostgreSQL Count | COUNT DISTINCT `user_id` FROM `trading.bots` WHERE `status='running'` | On page load | Bot usage |
| **Total AUM** | PostgreSQL Aggregate | SUM of user balances + positions | On page load | Assets under management |
| **Platform Win Rate** | Calculated | `(winning_trades / total_trades) * 100` | On page load | Weighted by trade count |
| **Max Drawdown** | Calculated | `MAX((equity - peak_equity) / peak_equity)` | Daily batch | 90-day window |
| **Equity Curve** | PostgreSQL Time-Series | Daily snapshots from `trading.equity_snapshots` | Daily | 90-day window |
| **Monthly Returns** | PostgreSQL Aggregate | Monthly aggregation of P&L | Monthly | Calendar months |

---

### Data Delivery Strategy

#### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/finance/platform-kpis`

**Response:**
```json
{
  "currentEquity": 542300.50,
  "realizedPnL90d": 52430.75,
  "totalTrades": 15420,
  "avgSharpeRatio": 2.31,
  "activeUsers": 82,
  "usersWithActiveBots": 68,
  "totalAUM": 863000.00,
  "platformWinRate": 63.1,
  "maxDrawdown90d": -8.4,
  "timestamp": "2026-02-21T10:00:00Z"
}
```

**PostgreSQL Query:**
```sql
WITH equity_current AS (
  SELECT SUM(total_equity_usd) as current_equity
  FROM (
    SELECT DISTINCT ON (bot_id) total_equity_usd
    FROM trading.equity_snapshots
    WHERE bot_id IS NOT NULL
    ORDER BY bot_id, snapshot_at DESC
  ) latest
),
pnl_90d AS (
  SELECT SUM(realized_pnl_usd) as pnl
  FROM trading.positions
  WHERE closed_at > NOW() - INTERVAL '90 days'
    AND status = 'closed'
),
trades_90d AS (
  SELECT COUNT(*) as total_trades
  FROM trading.orders
  WHERE status = 'filled'
    AND completed_at > NOW() - INTERVAL '90 days'
),
active_users AS (
  SELECT COUNT(DISTINCT user_id) as count
  FROM auth.user_sessions
  WHERE last_activity_at > NOW() - INTERVAL '30 days'
),
users_with_bots AS (
  SELECT COUNT(DISTINCT user_id) as count
  FROM trading.bots
  WHERE status = 'running'
),
win_rate AS (
  SELECT
    (COUNT(*) FILTER (WHERE realized_pnl_usd > 0)::FLOAT / COUNT(*)) * 100 as rate
  FROM trading.positions
  WHERE closed_at > NOW() - INTERVAL '90 days'
)
SELECT
  ec.current_equity,
  pnl.pnl as realized_pnl_90d,
  tr.total_trades,
  2.31 as avg_sharpe_ratio,  -- Computed separately
  au.count as active_users,
  uwb.count as users_with_bots,
  ec.current_equity as total_aum,  -- Simplified (should include user balances)
  wr.rate as platform_win_rate,
  -8.4 as max_drawdown_90d  -- Computed separately
FROM equity_current ec
CROSS JOIN pnl_90d pnl
CROSS JOIN trades_90d tr
CROSS JOIN active_users au
CROSS JOIN users_with_bots uwb
CROSS JOIN win_rate wr;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 2:** `GET /api/finance/equity-curve?days=90`

**Response:**
```json
{
  "curve": [
    { "day": 1, "value": 500000, "label": "Day 1", "date": "2025-11-23" },
    { "day": 2, "value": 505230, "label": "Day 2", "date": "2025-11-24" },
    ...
    { "day": 90, "value": 542300, "label": "Day 90", "date": "2026-02-21" }
  ]
}
```

**PostgreSQL Query:**
```sql
WITH daily_snapshots AS (
  SELECT
    DATE(snapshot_at) as snapshot_date,
    SUM(total_equity_usd) as daily_equity
  FROM trading.equity_snapshots
  WHERE snapshot_at > NOW() - INTERVAL '90 days'
  GROUP BY DATE(snapshot_at)
  ORDER BY snapshot_date ASC
)
SELECT
  ROW_NUMBER() OVER (ORDER BY snapshot_date) as day,
  daily_equity as value,
  'Day ' || ROW_NUMBER() OVER (ORDER BY snapshot_date) as label,
  snapshot_date as date
FROM daily_snapshots;
```

**Data Source:** **NestJS API** → PostgreSQL (`trading.equity_snapshots`)

---

**Endpoint 3:** `GET /api/finance/monthly-returns?year=2026`

**Response:**
```json
{
  "returns": [
    { "month": "Jan", "return": 12.5, "trades": 2340, "volume": 4.2 },
    { "month": "Feb", "return": 8.3, "trades": 1820, "volume": 3.1 },
    ...
  ]
}
```

**PostgreSQL Query:**
```sql
SELECT
  TO_CHAR(closed_at, 'Mon') as month,
  (SUM(realized_pnl_usd) / LAG_SUM_EQUITY) * 100 as return,
  COUNT(*) as trades,
  SUM(quantity * exit_price) / 1000000 as volume
FROM trading.positions
WHERE EXTRACT(YEAR FROM closed_at) = 2026
  AND status = 'closed'
GROUP BY TO_CHAR(closed_at, 'Mon'), EXTRACT(MONTH FROM closed_at)
ORDER BY EXTRACT(MONTH FROM closed_at);
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 4:** `GET /api/finance/drawdown-curve?days=90`

**Response:**
```json
{
  "drawdown": [
    { "day": 1, "value": 0 },
    { "day": 2, "value": -1.2 },
    ...
    { "day": 45, "value": -8.4 },  // Max drawdown
    ...
  ]
}
```

**Calculation Logic (Backend):**
```typescript
function calculateDrawdown(equityCurve: number[]): { day: number; value: number }[] {
  let peak = 0;
  return equityCurve.map((equity, i) => {
    if (equity > peak) peak = equity;
    const drawdown = ((equity - peak) / peak) * 100;
    return { day: i + 1, value: parseFloat(drawdown.toFixed(2)) };
  });
}
```

**Data Source:** **NestJS API** → Calculated from equity curve

---

### Multi-Exchange Enhancements

#### **KPI Breakdown by Exchange**

Add exchange-specific metrics to the platform overview:

**Additional Endpoint:** `GET /api/finance/kpis-by-exchange`

**Response:**
```json
{
  "total": {
    "equity": 542300.50,
    "pnl90d": 52430.75,
    "trades": 15420,
    "winRate": 63.1
  },
  "byExchange": {
    "binance": {
      "equity": 320000.00,
      "pnl90d": 32500.00,
      "trades": 8945,
      "winRate": 65.2,
      "contributionPct": 59.0
    },
    "bybit": {
      "equity": 145000.00,
      "pnl90d": 14200.00,
      "trades": 4320,
      "winRate": 61.8,
      "contributionPct": 26.7
    },
    "okx": {
      "equity": 77300.50,
      "pnl90d": 5730.75,
      "trades": 2155,
      "winRate": 59.3,
      "contributionPct": 14.3
    }
  }
}
```

**PostgreSQL Query:**
```sql
WITH exchange_metrics AS (
  SELECT
    a.code as exchange,
    SUM(latest_eq.total_equity_usd) as equity,
    SUM(pnl.realized_pnl) as pnl_90d,
    COUNT(ord.id) as trades,
    (COUNT(pnl.id) FILTER (WHERE pnl.realized_pnl_usd > 0)::FLOAT / COUNT(pnl.id)) * 100 as win_rate
  FROM exchange.adapters a
  LEFT JOIN exchange.user_credentials uc ON uc.adapter_id = a.id
  LEFT JOIN trading.bots b ON b.credential_id = uc.id
  LEFT JOIN LATERAL (
    SELECT total_equity_usd
    FROM trading.equity_snapshots
    WHERE bot_id = b.id
    ORDER BY snapshot_at DESC
    LIMIT 1
  ) latest_eq ON true
  LEFT JOIN trading.positions pnl ON pnl.bot_id = b.id
    AND pnl.closed_at > NOW() - INTERVAL '90 days'
    AND pnl.status = 'closed'
  LEFT JOIN trading.orders ord ON ord.credential_id = uc.id
    AND ord.completed_at > NOW() - INTERVAL '90 days'
    AND ord.status = 'filled'
  WHERE a.status = 'active'
  GROUP BY a.code
)
SELECT
  exchange,
  equity,
  pnl_90d,
  trades,
  win_rate,
  (equity / SUM(equity) OVER ()) * 100 as contribution_pct
FROM exchange_metrics
ORDER BY equity DESC;
```

#### **UI Enhancement: Exchange Breakdown Cards**

Add a section below the KPIs showing exchange-specific performance:

```typescript
<div className="bg-dark-elevated border border-dark rounded-md p-4">
  <h3 className="text-sm font-semibold mb-4">Performance by Exchange</h3>
  <div className="grid grid-cols-3 gap-3">
    {exchangeMetrics.map(ex => (
      <div key={ex.exchange} className="border border-dark rounded p-3">
        <div className="flex items-center gap-2 mb-2">
          <ExchangeIcon exchange={ex.exchange} />
          <span className="text-xs font-bold uppercase">{ex.exchange}</span>
        </div>
        <div className="text-lg font-bold text-teal">{fmtUSD(ex.equity)}</div>
        <div className="text-xs text-ink3">{ex.contributionPct.toFixed(1)}% of total</div>
        <div className="text-xs mt-2">
          P&L: <span className={ex.pnl90d >= 0 ? "text-teal" : "text-coral"}>
            {fmtUSD(ex.pnl90d)}
          </span>
        </div>
        <div className="text-xs">Win Rate: {ex.winRate.toFixed(1)}%</div>
      </div>
    ))}
  </div>
</div>
```

---

### Database Schema Requirements

#### **Existing Schema Support**

✅ **Already Supported:**
- `trading.equity_snapshots` - Daily equity tracking
- `trading.positions` - P&L and trade data
- `trading.orders` - Trade execution
- `auth.users` - User data
- `trading.bots` - Bot status

#### **Recommended Additions**

**1. Create Materialized View for Platform KPIs**

```sql
CREATE MATERIALIZED VIEW finance.platform_kpis_snapshot AS
SELECT
  (SELECT SUM(total_equity_usd) FROM (
    SELECT DISTINCT ON (bot_id) total_equity_usd
    FROM trading.equity_snapshots
    ORDER BY bot_id, snapshot_at DESC
  ) latest) as current_equity,

  (SELECT SUM(realized_pnl_usd)
   FROM trading.positions
   WHERE closed_at > NOW() - INTERVAL '90 days') as realized_pnl_90d,

  (SELECT COUNT(*)
   FROM trading.orders
   WHERE status = 'filled'
   AND completed_at > NOW() - INTERVAL '90 days') as total_trades,

  (SELECT COUNT(DISTINCT user_id)
   FROM auth.user_sessions
   WHERE last_activity_at > NOW() - INTERVAL '30 days') as active_users,

  (SELECT COUNT(DISTINCT user_id)
   FROM trading.bots
   WHERE status = 'running') as users_with_bots,

  NOW() as snapshot_at;

CREATE UNIQUE INDEX idx_platform_kpis_snapshot ON finance.platform_kpis_snapshot(snapshot_at);

-- Refresh every 60 seconds via Phoenix scheduler or pg_cron
```

**2. Add Index for Exchange-Grouped Queries**

```sql
CREATE INDEX idx_equity_snapshots_bot_snapshot
ON trading.equity_snapshots(bot_id, snapshot_at DESC);

CREATE INDEX idx_positions_closed_exchange
ON trading.positions(credential_id, closed_at)
WHERE status = 'closed';

CREATE INDEX idx_orders_completed_exchange
ON trading.orders(credential_id, completed_at)
WHERE status = 'filled';
```

---

### Summary: Finance Overview Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|----------------------|
| **Platform KPIs** | NestJS API | HTTP REST | On page load | Aggregated across all exchanges |
| **Equity Curve** | NestJS API | HTTP REST | On page load | Combined daily snapshots |
| **Monthly Returns** | NestJS API | HTTP REST | On page load | Sum across all exchanges |
| **Drawdown Curve** | NestJS API (Calculated) | HTTP REST | On page load | Calculated from equity curve |
| **Exchange Breakdown** | NestJS API | HTTP REST | On page load | **NEW: Per-exchange metrics** |

**Schema Changes Required:**
1. ✅ Create `finance.platform_kpis_snapshot` materialized view
2. ✅ Add indexes for performance: `idx_equity_snapshots_bot_snapshot`, `idx_positions_closed_exchange`
3. ✅ Refresh materialized view every 60s via Phoenix scheduler

**No Real-Time WebSocket Required** - This is a historical/aggregated dashboard, updated on page load only

---

**[← Previous: Finance Dashboard](./12-finance-dashboard.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Finance Strategies →](./14-finance-strategies.md)**
