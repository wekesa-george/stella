## Page 14: `/finance/strategies` - Trading Strategy Performance

### UI Mock Data Structure

```typescript
interface Strategy {
  name: string;              // "Momentum Grid", "Arbitrage V2", etc.
  pair: string;              // "BTC/USDT"
  exchange: string;          // "Binance", "Bybit", "OKX", "Kraken"
  pnl: number;               // Total P&L in USD (48200)
  pnlPct: number;            // Return % (9.64)
  sharpe: number;            // Sharpe ratio (2.31)
  sortino: number;           // Sortino ratio (3.12)
  winRate: number;           // Win rate % (67.4)
  maxDD: number;             // Max drawdown % (-4.2)
  trades: number;            // Total trades (1842)
  avgHold: string;           // "4h 12m"
  pf: number;                // Profit factor (2.1)
  correlation: number;       // Correlation to benchmark (1.0)
}

interface StrategyEquityCurve {
  day: number;               // 1-90
  [strategyName: string]: number;  // Equity value for each strategy
}

interface RadarDataPoint {
  metric: string;            // "Win Rate", "Sharpe", "Trades", etc.
  value: number;             // Normalized 0-100
}
```

### UI Features & Requirements

1. **Strategy Equity Curves** - Multi-line chart showing performance over 90 days
2. **Strategy Selector** - Click legend to highlight/filter strategies
3. **Risk Profile Radar Chart** - 6 metrics (Win Rate, Sharpe, Trades, PnL%, Safety, Profit Factor)
4. **Strategy Scorecard Table** - Sortable by P&L, Sharpe, Win Rate, Max DD
5. **Multi-Exchange Data** - Each strategy shows exchange context **(Already present in mock data)**

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Strategy List** | PostgreSQL | `strategy.strategies` table | On page load | All active strategies |
| **Strategy Name** | PostgreSQL | `strategy.strategies.name` | Static | User-defined |
| **Pair** | PostgreSQL | `strategy.strategies.trading_pair` | Static | Per-strategy config |
| **Exchange** | PostgreSQL | JOIN `exchange.adapters` via bot's `credential_id` | Static | Exchange where strategy runs |
| **P&L (Total)** | PostgreSQL Aggregate | SUM `trading.positions.realized_pnl_usd` WHERE `strategy_id` | On page load | Historical sum |
| **P&L %** | Calculated | `(total_pnl / initial_capital) * 100` | On page load | Return on investment |
| **Sharpe Ratio** | Calculated | `(avg_return - risk_free) / std_dev` | Daily batch | Risk-adjusted return |
| **Sortino Ratio** | Calculated | `(avg_return - risk_free) / downside_std_dev` | Daily batch | Downside risk measure |
| **Win Rate** | PostgreSQL Aggregate | `(winning_trades / total_trades) * 100` | On page load | Success rate |
| **Max Drawdown** | PostgreSQL Aggregate | `MAX((equity - peak) / peak)` WHERE `strategy_id` | Daily batch | Worst decline |
| **Total Trades** | PostgreSQL Count | COUNT `trading.orders` WHERE `strategy_id` AND `status='filled'` | On page load | Execution count |
| **Avg Hold Time** | PostgreSQL Aggregate | AVG(`closed_at - opened_at`) from `trading.positions` | On page load | Position duration |
| **Profit Factor** | Calculated | `gross_profit / gross_loss` | On page load | Profit/loss ratio |
| **Correlation** | Calculated | Pearson correlation with benchmark | Daily batch | Diversification measure |
| **Equity Curve** | PostgreSQL Time-Series | Daily equity snapshots per strategy | Daily | 90-day window |

---

### Data Delivery Strategy

#### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/finance/strategies/performance`

**Response:**
```json
{
  "strategies": [
    {
      "id": "uuid",
      "name": "Momentum Grid",
      "pair": "BTC/USDT",
      "exchange": "binance",
      "pnl": 48200.00,
      "pnlPct": 9.64,
      "sharpe": 2.31,
      "sortino": 3.12,
      "winRate": 67.4,
      "maxDD": -4.2,
      "trades": 1842,
      "avgHoldTime": "4h 12m",
      "profitFactor": 2.1,
      "correlation": 1.0,
      "status": "active"
    },
    ...
  ]
}
```

**PostgreSQL Query:**
```sql
WITH strategy_metrics AS (
  SELECT
    s.id,
    s.name,
    s.trading_pair as pair,
    a.code as exchange,

    -- P&L
    SUM(p.realized_pnl_usd) as total_pnl,
    (SUM(p.realized_pnl_usd) / NULLIF(s.initial_capital_usd, 0)) * 100 as pnl_pct,

    -- Win Rate
    (COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0)::FLOAT / NULLIF(COUNT(*), 0)) * 100 as win_rate,

    -- Trades
    COUNT(*) as total_trades,

    -- Avg Hold Time
    AVG(EXTRACT(EPOCH FROM (p.closed_at - p.opened_at))) as avg_hold_seconds,

    -- Profit Factor
    SUM(p.realized_pnl_usd) FILTER (WHERE p.realized_pnl_usd > 0) /
    NULLIF(ABS(SUM(p.realized_pnl_usd) FILTER (WHERE p.realized_pnl_usd < 0)), 0) as profit_factor

  FROM strategy.strategies s
  LEFT JOIN trading.bots b ON b.strategy_id = s.id
  LEFT JOIN exchange.user_credentials uc ON b.credential_id = uc.id
  LEFT JOIN exchange.adapters a ON uc.adapter_id = a.id
  LEFT JOIN trading.positions p ON p.strategy_id = s.id
    AND p.status = 'closed'
    AND p.closed_at > NOW() - INTERVAL '90 days'
  WHERE s.status = 'active'
  GROUP BY s.id, s.name, s.trading_pair, a.code, s.initial_capital_usd
),
strategy_stats AS (
  SELECT
    sm.*,
    ss.sharpe_ratio,
    ss.sortino_ratio,
    ss.max_drawdown_pct,
    ss.correlation_to_benchmark
  FROM strategy_metrics sm
  LEFT JOIN finance.strategy_stats ss ON ss.strategy_id = sm.id
    AND ss.calculation_date = CURRENT_DATE
)
SELECT
  id,
  name,
  pair,
  exchange,
  total_pnl as pnl,
  pnl_pct,
  COALESCE(sharpe_ratio, 0) as sharpe,
  COALESCE(sortino_ratio, 0) as sortino,
  win_rate,
  COALESCE(max_drawdown_pct, 0) as max_dd,
  total_trades as trades,
  to_char(avg_hold_seconds * interval '1 second', 'HH24"h" MI"m"') as avg_hold_time,
  profit_factor as pf,
  COALESCE(correlation_to_benchmark, 0) as correlation
FROM strategy_stats
ORDER BY total_pnl DESC;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 2:** `GET /api/finance/strategies/equity-curves?days=90`

**Response:**
```json
{
  "curves": {
    "Momentum": [
      { "day": 1, "value": 50000 },
      { "day": 2, "value": 50230 },
      ...
    ],
    "Arbitrage": [
      { "day": 1, "value": 50000 },
      ...
    ]
  }
}
```

**PostgreSQL Query:**
```sql
WITH daily_equity AS (
  SELECT
    DATE(es.snapshot_at) as snapshot_date,
    s.name,
    SUM(es.total_equity_usd) as daily_equity
  FROM trading.equity_snapshots es
  JOIN trading.bots b ON es.bot_id = b.id
  JOIN strategy.strategies s ON b.strategy_id = s.id
  WHERE es.snapshot_at > NOW() - INTERVAL '90 days'
    AND s.status = 'active'
  GROUP BY DATE(es.snapshot_at), s.name
  ORDER BY snapshot_date ASC
)
SELECT
  ROW_NUMBER() OVER (PARTITION BY name ORDER BY snapshot_date) as day,
  name,
  daily_equity as value
FROM daily_equity;
```

**Data Source:** **NestJS API** → PostgreSQL

---

### Multi-Exchange Enhancements

#### **Already Supported in UI**

✅ The UI mock data already includes `exchange` field for each strategy
✅ Strategies can run on different exchanges

#### **Exchange-Specific Strategy Performance**

**Additional Endpoint:** `GET /api/finance/strategies/by-exchange`

**Response:**
```json
{
  "byExchange": {
    "binance": {
      "strategies": 2,
      "totalPnL": 57100.00,
      "avgSharpe": 1.76,
      "avgWinRate": 60.9
    },
    "bybit": {
      "strategies": 1,
      "totalPnL": 31700.00,
      "avgSharpe": 3.04,
      "avgWinRate": 74.1
    },
    "okx": {
      "strategies": 1,
      "totalPnL": 19400.00,
      "avgSharpe": 1.78,
      "avgWinRate": 61.2
    },
    "kraken": {
      "strategies": 1,
      "totalPnL": -4200.00,
      "avgSharpe": 0.44,
      "avgWinRate": 48.7
    }
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  a.code as exchange,
  COUNT(DISTINCT s.id) as strategies,
  SUM(p.realized_pnl_usd) as total_pnl,
  AVG(ss.sharpe_ratio) as avg_sharpe,
  AVG((COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0)::FLOAT / NULLIF(COUNT(*), 0)) * 100) as avg_win_rate
FROM strategy.strategies s
JOIN trading.bots b ON b.strategy_id = s.id
JOIN exchange.user_credentials uc ON b.credential_id = uc.id
JOIN exchange.adapters a ON uc.adapter_id = a.id
LEFT JOIN trading.positions p ON p.strategy_id = s.id
  AND p.status = 'closed'
  AND p.closed_at > NOW() - INTERVAL '90 days'
LEFT JOIN finance.strategy_stats ss ON ss.strategy_id = s.id
  AND ss.calculation_date = CURRENT_DATE
WHERE s.status = 'active'
GROUP BY a.code
ORDER BY total_pnl DESC;
```

---

### Database Schema Requirements

#### **New Table: `finance.strategy_stats`**

Store pre-calculated metrics for performance:

```sql
CREATE TABLE finance.strategy_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES strategy.strategies(id),
    calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Risk Metrics
    sharpe_ratio DECIMAL(8,4),
    sortino_ratio DECIMAL(8,4),
    max_drawdown_pct DECIMAL(8,4),
    correlation_to_benchmark DECIMAL(8,4),

    -- Additional Stats
    volatility DECIMAL(8,4),
    calmar_ratio DECIMAL(8,4),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(strategy_id, calculation_date)
);

CREATE INDEX idx_strategy_stats_strategy ON finance.strategy_stats(strategy_id);
CREATE INDEX idx_strategy_stats_date ON finance.strategy_stats(calculation_date DESC);

COMMENT ON TABLE finance.strategy_stats IS 'Pre-calculated strategy performance metrics (updated daily)';
```

#### **Recommended Indexes**

```sql
CREATE INDEX idx_positions_strategy_closed
ON trading.positions(strategy_id, closed_at)
WHERE status = 'closed';

CREATE INDEX idx_equity_snapshots_strategy
ON trading.equity_snapshots(bot_id, snapshot_at DESC);
```

---

### Summary: Finance Strategies Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|----------------------|
| **Strategy Performance Table** | NestJS API | HTTP REST | On page load | Includes exchange field per strategy |
| **Equity Curves** | NestJS API | HTTP REST | On page load | Separate curve per strategy |
| **Radar Chart** | Client-side Calculated | N/A | Real-time | Derived from strategy metrics |
| **Exchange Breakdown** | NestJS API | HTTP REST | On page load | **NEW: Performance grouped by exchange** |

**Schema Changes Required:**
1. ✅ Create `finance.strategy_stats` table for pre-calculated metrics
2. ✅ Add indexes: `idx_positions_strategy_closed`, `idx_equity_snapshots_strategy`
3. ✅ Daily batch job to calculate Sharpe, Sortino, Max DD, Correlation

**No Real-Time WebSocket Required** - This is a historical performance dashboard

---

**[← Previous: Finance Overview](./13-finance-overview.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Finance Risk →](./15-finance-risk.md)**
