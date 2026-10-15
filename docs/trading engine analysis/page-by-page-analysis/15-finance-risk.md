## Page 15: `/finance/risk` - Risk Management Dashboard

### UI Mock Data Structure

```typescript
interface RiskKPIs {
  platformVaR95: number;           // -3.8% (Value at Risk)
  largestExposure: number;         // 41% (concentration)
  avgCorrelation: number;          // 0.24 (diversification)
  openRisk: number;                // $34,000 (unrealized)
}

interface VaRLevel {
  level: string;                   // "95% VaR", "99% VaR", "99.9% CVaR"
  value: number;                   // -3.8, -6.2, -10.1
  desc: string;                    // Description
}

interface ExchangeConcentration {
  name: string;                    // "Binance", "Bybit", etc.
  pct: number;                     // 41, 28, 18, 13
  pnl: string;                     // "+$34,200"
  color: string;                   // Visual color
}

interface CorrelationMatrix {
  strategies: string[];            // ["Momentum", "Arbitrage", ...]
  matrix: number[][];              // 5x5 correlation matrix
}

interface PositionSizing {
  size: string;                    // "0–1%", "1–2%", etc.
  count: number;                   // Number of positions in this range
}
```

### UI Features & Requirements

1. **Risk KPIs** - 4 cards (VaR, Largest Exposure, Avg Correlation, Open Risk)
2. **Value at Risk Table** - 95%, 99%, 99.9% confidence levels
3. **Capital Concentration Charts** - By Exchange, Strategy, and Pair
4. **Strategy Correlation Matrix** - 5x5 heatmap showing inter-strategy correlations
5. **Position Sizing Distribution** - Bar chart showing position size distribution
6. **Multi-Exchange Support** - Exchange concentration already present **(Already in mock data)**

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Platform VaR 95%** | Calculated | Historical returns analysis | Daily batch | Value at Risk |
| **Largest Exposure** | PostgreSQL Aggregate | MAX(exchange_concentration_pct) | On page load | Exchange concentration |
| **Avg Correlation** | Calculated | AVG of strategy correlation matrix | Daily batch | Diversification measure |
| **Open Risk** | PostgreSQL Aggregate | SUM `unrealized_pnl_usd` WHERE `status='open'` | On page load | Current exposure |
| **VaR Levels** | Calculated | Monte Carlo or historical simulation | Daily batch | Risk thresholds |
| **Exchange Concentration** | PostgreSQL Aggregate | AUM grouped by exchange | On page load | Capital distribution |
| **Strategy Concentration** | PostgreSQL Aggregate | AUM grouped by strategy | On page load | Strategy allocation |
| **Pair Concentration** | PostgreSQL Aggregate | AUM grouped by trading pair | On page load | Asset concentration |
| **Correlation Matrix** | Calculated | Pearson correlation of strategy returns | Daily batch | Inter-strategy correlation |
| **Position Sizing** | PostgreSQL Histogram | Distribution of `(position_value / total_equity) * 100` | On page load | Risk per trade |

---

### Data Delivery Strategy

#### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/finance/risk/overview`

**Response:**
```json
{
  "kpis": {
    "platformVaR95": -3.8,
    "largestExposure": 41,
    "avgCorrelation": 0.24,
    "openRisk": 34000.00
  },
  "varLevels": [
    { "level": "95% VaR", "value": -3.8, "desc": "5% chance of losing more than this in a single day" },
    { "level": "99% VaR", "value": -6.2, "desc": "1% chance of losing more than this in a single day" },
    { "level": "99.9% CVaR", "value": -10.1, "desc": "Expected loss in worst 0.1% of scenarios" }
  ]
}
```

**PostgreSQL Query:**
```sql
WITH open_risk AS (
  SELECT SUM(unrealized_pnl_usd) as total_unrealized
  FROM trading.positions
  WHERE status = 'open'
),
var_stats AS (
  SELECT
    var_95_pct,
    var_99_pct,
    cvar_99_9_pct,
    avg_strategy_correlation
  FROM finance.risk_metrics
  WHERE calculation_date = CURRENT_DATE
),
exchange_concentration AS (
  SELECT
    a.code,
    (SUM(latest_eq.total_equity_usd) / (SELECT SUM(total_equity_usd) FROM trading.equity_snapshots WHERE snapshot_at > NOW() - INTERVAL '1 day')) * 100 as pct
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
  GROUP BY a.code
  ORDER BY pct DESC
  LIMIT 1
)
SELECT
  vs.var_95_pct as platform_var_95,
  ec.pct as largest_exposure,
  vs.avg_strategy_correlation as avg_correlation,
  orisk.total_unrealized as open_risk,
  vs.var_95_pct,
  vs.var_99_pct,
  vs.cvar_99_9_pct
FROM var_stats vs
CROSS JOIN open_risk orisk
CROSS JOIN exchange_concentration ec;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 2:** `GET /api/finance/risk/concentration`

**Response:**
```json
{
  "byExchange": [
    { "name": "Binance", "pct": 41, "pnl": "+$34,200", "color": "#F0B90B" },
    { "name": "Bybit", "pct": 28, "pnl": "+$18,700", "color": "#00e5a0" },
    { "name": "OKX", "pct": 18, "pnl": "+$8,400", "color": "#3d9df3" },
    { "name": "Kraken", "pct": 13, "pnl": "-$1,800", "color": "#ff4757" }
  ],
  "byStrategy": [
    { "name": "Momentum Grid", "pct": 35 },
    { "name": "Arbitrage V2", "pct": 25 },
    { "name": "Mean Reversion", "pct": 18 },
    { "name": "Trend Follow", "pct": 13 },
    { "name": "Scalp Pro", "pct": 9 }
  ],
  "byPair": [
    { "pair": "BTC/USDT", "pct": 38 },
    { "pair": "ETH/USDT", "pct": 26 },
    { "pair": "SOL/USDT", "pct": 15 },
    { "pair": "BNB/USDT", "pct": 11 },
    { "pair": "XRP/USDT", "pct": 10 }
  ]
}
```

**PostgreSQL Query (By Exchange):**
```sql
WITH total_equity AS (
  SELECT SUM(total_equity_usd) as total
  FROM (
    SELECT DISTINCT ON (bot_id) total_equity_usd
    FROM trading.equity_snapshots
    ORDER BY bot_id, snapshot_at DESC
  ) latest
),
exchange_equity AS (
  SELECT
    a.code as exchange,
    a.name,
    SUM(latest_eq.total_equity_usd) as equity,
    SUM(pnl.realized_pnl) as pnl_90d
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
  WHERE a.status = 'active'
  GROUP BY a.code, a.name
)
SELECT
  name,
  (equity / te.total * 100)::INTEGER as pct,
  CASE WHEN pnl_90d >= 0 THEN '+' ELSE '' END || '$' || ABS(pnl_90d)::TEXT as pnl
FROM exchange_equity ee
CROSS JOIN total_equity te
ORDER BY pct DESC;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 3:** `GET /api/finance/risk/correlation-matrix`

**Response:**
```json
{
  "strategies": ["Momentum", "Arbitrage", "Mean Reversion", "Trend Follow", "Scalp Pro"],
  "matrix": [
    [1.00, 0.12, 0.34, 0.61, 0.08],
    [0.12, 1.00, 0.09, 0.15, 0.22],
    [0.34, 0.09, 1.00, 0.42, 0.17],
    [0.61, 0.15, 0.42, 1.00, 0.11],
    [0.08, 0.22, 0.17, 0.11, 1.00]
  ]
}
```

**Calculation Logic (Backend - Daily Batch Job):**
```typescript
// Calculate Pearson correlation between strategy returns
function calculateCorrelation(strategyAReturns: number[], strategyBReturns: number[]): number {
  const n = strategyAReturns.length;
  const meanA = strategyAReturns.reduce((a, b) => a + b) / n;
  const meanB = strategyBReturns.reduce((a, b) => a + b) / n;

  const numerator = strategyAReturns.reduce((sum, a, i) =>
    sum + (a - meanA) * (strategyBReturns[i] - meanB), 0
  );

  const stdDevA = Math.sqrt(strategyAReturns.reduce((sum, a) =>
    sum + Math.pow(a - meanA, 2), 0) / n
  );
  const stdDevB = Math.sqrt(strategyBReturns.reduce((sum, b) =>
    sum + Math.pow(b - meanB, 2), 0) / n
  );

  return numerator / (stdDevA * stdDevB * n);
}
```

**Data Source:** **NestJS API** → Calculated from `finance.strategy_stats`

---

**Endpoint 4:** `GET /api/finance/risk/position-sizing`

**Response:**
```json
{
  "distribution": [
    { "size": "0–1%", "count": 48 },
    { "size": "1–2%", "count": 71 },
    { "size": "2–5%", "count": 33 },
    { "size": "5–10%", "count": 14 },
    { "size": ">10%", "count": 4 }
  ]
}
```

**PostgreSQL Query:**
```sql
WITH position_sizes AS (
  SELECT
    p.id,
    (p.quantity * p.entry_price) / NULLIF(es.total_equity_usd, 0) * 100 as size_pct
  FROM trading.positions p
  JOIN trading.equity_snapshots es ON es.bot_id = p.bot_id
    AND es.snapshot_at <= p.opened_at
  WHERE p.opened_at > NOW() - INTERVAL '90 days'
    AND p.status IN ('open', 'closed')
)
SELECT
  CASE
    WHEN size_pct < 1 THEN '0–1%'
    WHEN size_pct < 2 THEN '1–2%'
    WHEN size_pct < 5 THEN '2–5%'
    WHEN size_pct < 10 THEN '5–10%'
    ELSE '>10%'
  END as size,
  COUNT(*) as count
FROM position_sizes
GROUP BY size
ORDER BY MIN(size_pct);
```

**Data Source:** **NestJS API** → PostgreSQL

---

### Database Schema Requirements

#### **New Table: `finance.risk_metrics`**

Store daily risk calculations:

```sql
CREATE TABLE finance.risk_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Value at Risk Metrics
    var_95_pct DECIMAL(8,4),       -- 95% VaR
    var_99_pct DECIMAL(8,4),       -- 99% VaR
    cvar_99_9_pct DECIMAL(8,4),    -- 99.9% Conditional VaR (expected shortfall)

    -- Diversification Metrics
    avg_strategy_correlation DECIMAL(8,4),
    portfolio_beta DECIMAL(8,4),

    -- Concentration Metrics
    max_exchange_concentration_pct DECIMAL(8,4),
    max_strategy_concentration_pct DECIMAL(8,4),
    max_pair_concentration_pct DECIMAL(8,4),

    -- Position Sizing Metrics
    avg_position_size_pct DECIMAL(8,4),
    max_position_size_pct DECIMAL(8,4),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(calculation_date)
);

CREATE INDEX idx_risk_metrics_date ON finance.risk_metrics(calculation_date DESC);

COMMENT ON TABLE finance.risk_metrics IS 'Daily risk metrics calculation for platform monitoring';
```

#### **Daily Batch Job for Risk Calculations**

Create a Phoenix/Elixir scheduled task or pg_cron job:

```elixir
defmodule TradeEngine.Finance.RiskCalculator do
  @doc "Calculate daily risk metrics"
  def calculate_daily_metrics do
    # 1. Calculate VaR using historical returns
    var_metrics = calculate_var()

    # 2. Calculate strategy correlations
    correlation_matrix = calculate_strategy_correlations()
    avg_correlation = calculate_avg_correlation(correlation_matrix)

    # 3. Calculate concentration metrics
    concentration = calculate_concentration_metrics()

    # 4. Insert into finance.risk_metrics
    Repo.insert!(%RiskMetrics{
      calculation_date: Date.utc_today(),
      var_95_pct: var_metrics.var_95,
      var_99_pct: var_metrics.var_99,
      cvar_99_9_pct: var_metrics.cvar_999,
      avg_strategy_correlation: avg_correlation,
      max_exchange_concentration_pct: concentration.max_exchange,
      max_strategy_concentration_pct: concentration.max_strategy,
      max_pair_concentration_pct: concentration.max_pair
    })
  end
end
```

---

### Multi-Exchange Enhancements

#### **Exchange Risk Concentration**

**Already supported** in the UI - shows capital distribution by exchange.

#### **Cross-Exchange Correlation Analysis**

Track correlation between same strategy on different exchanges:

**Additional Metric:**
```typescript
interface CrossExchangeCorrelation {
  strategy: string;              // "Momentum Grid"
  binanceVsBybit: number;        // 0.23
  binanceVsOkx: number;          // 0.18
  bybitVsOkx: number;            // 0.12
}
```

This helps identify if exchange-specific risks are properly diversified.

---

### Summary: Finance Risk Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|----------------------|
| **Risk KPIs** | NestJS API | HTTP REST | On page load | Includes exchange concentration |
| **VaR Table** | NestJS API (Calculated) | HTTP REST | On page load | Platform-wide risk |
| **Concentration Charts** | NestJS API | HTTP REST | On page load | **Exchange, Strategy, Pair breakdowns** |
| **Correlation Matrix** | NestJS API (Calculated) | HTTP REST | On page load | Strategy correlations |
| **Position Sizing** | NestJS API | HTTP REST | On page load | Histogram of position sizes |

**Schema Changes Required:**
1. ✅ Create `finance.risk_metrics` table for daily risk calculations
2. ✅ Daily batch job to calculate VaR, correlations, and concentrations
3. ✅ Index: `idx_risk_metrics_date`

**No Real-Time WebSocket Required** - Risk metrics updated daily via batch job

---

**[← Previous: Finance Strategies](./14-finance-strategies.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Finance Market →](./16-finance-market.md)**
