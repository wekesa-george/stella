## Page 16: `/finance/market` - Market Intelligence & Analysis

### UI Mock Data Structure

```typescript
interface PairPerformance {
  pair: string;              // "BTC/USDT"
  trades: number;            // 4821
  pnl: number;               // 38400 USD
  winRate: number;           // 64.2%
  volume: string;            // "$12.4M"
  exchange: string;          // "Binance" (MULTI-EXCHANGE SUPPORT)
  pnlPct: number;            // 7.68%
}

interface ExchangeBreakdown {
  name: string;              // "Binance", "Bybit", etc.
  pct: number;               // 41% (volume concentration)
  pnl: string;               // "+$34,200"
  color: string;             // Visual color
}

interface HourlyHeatmap {
  hour: number;              // 0-23
  day: string;               // "Mon", "Tue", etc.
  val: number;               // % return (-2.5 to 5.5)
}

interface DayOfWeekPerformance {
  day: string;               // "Mon", "Tue", etc.
  return: number;            // % return
  trades: number;            // Trade count (300-1200)
}

interface MarketKPIs {
  bestPerformingPair: string;      // "BTC/USDT"
  bestHour: string;                // "14:00–15:00 UTC"
  bestDayOfWeek: string;           // "Wednesday"
  topExchange: string;             // "Binance"
}
```

### UI Features & Requirements

1. **Market KPIs** - 4 cards (Best Pair, Best Hour, Best Day, Top Exchange)
2. **Hourly Return Heatmap** - 7 days × 24 hours showing average % return
3. **Pair Performance Table** - Ranked by P&L with win rates and volume
4. **Day-of-Week Performance Chart** - Bar chart showing which days perform best
5. **Exchange P&L Breakdown** - Bar chart showing P&L by exchange
6. **Multi-Exchange Support** - Each pair shows exchange context **(Already in mock data)**

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Best Performing Pair** | PostgreSQL Aggregate | MAX(SUM(realized_pnl_usd)) GROUP BY pair | On page load | Top pair by P&L |
| **Best Hour (UTC)** | PostgreSQL Aggregate | Hour with highest avg return | Daily batch | Historical analysis |
| **Best Day of Week** | PostgreSQL Aggregate | Day with highest avg return | Daily batch | Historical analysis |
| **Top Exchange** | PostgreSQL Aggregate | Exchange with highest volume/P&L | On page load | Multi-exchange metric |
| **Pair Performance** | PostgreSQL Aggregate | P&L, trades, win rate by pair | On page load | Includes exchange |
| **Hourly Heatmap** | PostgreSQL Aggregate | Avg return by hour and day | Daily batch | 7×24 matrix |
| **Day of Week Performance** | PostgreSQL Aggregate | Avg return by day of week | Daily batch | Monday-Sunday |
| **Exchange Breakdown** | PostgreSQL Aggregate | P&L and volume % by exchange | On page load | Multi-exchange |

---

### Data Delivery Strategy

#### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/finance/market/kpis`

**Response:**
```json
{
  "bestPerformingPair": {
    "pair": "BTC/USDT",
    "exchange": "binance",
    "pnl": 38400.00,
    "winRate": 64.2
  },
  "bestHour": {
    "hour": "14:00–15:00",
    "avgReturn": 1.84
  },
  "bestDayOfWeek": "Wednesday",
  "topExchange": {
    "name": "binance",
    "volumePct": 41,
    "pnl": 34200.00
  }
}
```

**PostgreSQL Query:**
```sql
WITH pair_performance AS (
  SELECT
    p.trading_pair,
    a.code as exchange,
    SUM(p.realized_pnl_usd) as total_pnl,
    (COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0)::FLOAT / COUNT(*)) * 100 as win_rate
  FROM trading.positions p
  JOIN trading.bots b ON p.bot_id = b.id
  JOIN exchange.user_credentials uc ON b.credential_id = uc.id
  JOIN exchange.adapters a ON uc.adapter_id = a.id
  WHERE p.status = 'closed'
    AND p.closed_at > NOW() - INTERVAL '90 days'
  GROUP BY p.trading_pair, a.code
  ORDER BY total_pnl DESC
  LIMIT 1
),
best_hour AS (
  SELECT
    EXTRACT(HOUR FROM closed_at) as hour,
    AVG((realized_pnl_usd / NULLIF(quantity * entry_price, 0)) * 100) as avg_return
  FROM trading.positions
  WHERE status = 'closed'
    AND closed_at > NOW() - INTERVAL '90 days'
  GROUP BY EXTRACT(HOUR FROM closed_at)
  ORDER BY avg_return DESC
  LIMIT 1
),
best_day AS (
  SELECT TO_CHAR(closed_at, 'Day') as day
  FROM trading.positions
  WHERE status = 'closed'
    AND closed_at > NOW() - INTERVAL '90 days'
  GROUP BY TO_CHAR(closed_at, 'Day')
  ORDER BY AVG(realized_pnl_usd) DESC
  LIMIT 1
)
SELECT * FROM pair_performance, best_hour, best_day;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 2:** `GET /api/finance/market/pairs`

**Response:**
```json
{
  "pairs": [
    {
      "pair": "BTC/USDT",
      "exchange": "binance",
      "trades": 4821,
      "pnl": 38400.00,
      "pnlPct": 7.68,
      "winRate": 64.2,
      "volume": 12400000
    },
    {
      "pair": "ETH/USDT",
      "exchange": "bybit",
      "trades": 3102,
      "pnl": 22100.00,
      "pnlPct": 4.42,
      "winRate": 71.3,
      "volume": 8100000
    },
    ...
  ]
}
```

**PostgreSQL Query:**
```sql
SELECT
  p.trading_pair as pair,
  a.code as exchange,
  COUNT(*) as trades,
  SUM(p.realized_pnl_usd) as pnl,
  (SUM(p.realized_pnl_usd) / NULLIF(SUM(p.quantity * p.entry_price), 0)) * 100 as pnl_pct,
  (COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0)::FLOAT / COUNT(*)) * 100 as win_rate,
  SUM(p.quantity * p.exit_price) as volume
FROM trading.positions p
JOIN trading.bots b ON p.bot_id = b.id
JOIN exchange.user_credentials uc ON b.credential_id = uc.id
JOIN exchange.adapters a ON uc.adapter_id = a.id
WHERE p.status = 'closed'
  AND p.closed_at > NOW() - INTERVAL '90 days'
GROUP BY p.trading_pair, a.code
ORDER BY pnl DESC;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 3:** `GET /api/finance/market/hourly-heatmap`

**Response:**
```json
{
  "heatmap": [
    { "day": "Mon", "hour": 0, "val": 1.2 },
    { "day": "Mon", "hour": 1, "val": -0.3 },
    ...
    { "day": "Sun", "hour": 23, "val": 0.8 }
  ]
}
```

**PostgreSQL Query:**
```sql
SELECT
  TO_CHAR(closed_at, 'Dy') as day,
  EXTRACT(HOUR FROM closed_at)::INTEGER as hour,
  AVG((realized_pnl_usd / NULLIF(quantity * entry_price, 0)) * 100)::NUMERIC(8,2) as val
FROM trading.positions
WHERE status = 'closed'
  AND closed_at > NOW() - INTERVAL '90 days'
GROUP BY TO_CHAR(closed_at, 'Dy'), EXTRACT(DOW FROM closed_at), EXTRACT(HOUR FROM closed_at)
ORDER BY EXTRACT(DOW FROM closed_at), hour;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 4:** `GET /api/finance/market/exchanges`

**Response:**
```json
{
  "exchanges": [
    { "name": "binance", "pct": 41, "pnl": 34200.00, "color": "#F0B90B" },
    { "name": "bybit", "pct": 28, "pnl": 18700.00, "color": "#00e5a0" },
    { "name": "okx", "pct": 18, "pnl": 8400.00, "color": "#3d9df3" },
    { "name": "kraken", "pct": 13, "pnl": -1800.00, "color": "#ff4757" }
  ]
}
```

**PostgreSQL Query:**
```sql
WITH total_volume AS (
  SELECT SUM(quantity * exit_price) as total
  FROM trading.positions
  WHERE status = 'closed'
    AND closed_at > NOW() - INTERVAL '90 days'
)
SELECT
  a.code as name,
  (SUM(p.quantity * p.exit_price) / tv.total * 100)::INTEGER as pct,
  SUM(p.realized_pnl_usd) as pnl
FROM trading.positions p
JOIN trading.bots b ON p.bot_id = b.id
JOIN exchange.user_credentials uc ON b.credential_id = uc.id
JOIN exchange.adapters a ON uc.adapter_id = a.id
CROSS JOIN total_volume tv
WHERE p.status = 'closed'
  AND p.closed_at > NOW() - INTERVAL '90 days'
GROUP BY a.code, tv.total
ORDER BY pct DESC;
```

**Data Source:** **NestJS API** → PostgreSQL

---

### Multi-Exchange Enhancements

#### **Already Fully Supported**

✅ The UI mock data already includes `exchange` field for each trading pair
✅ Exchange breakdown is a core feature of this page
✅ All queries include exchange context

#### **Cross-Exchange Pair Comparison**

**Additional Feature:** Compare same pair across multiple exchanges

**Example Query:**
```sql
SELECT
  p.trading_pair,
  a.code as exchange,
  AVG((realized_pnl_usd / NULLIF(quantity * entry_price, 0)) * 100) as avg_return_pct,
  COUNT(*) as trades
FROM trading.positions p
JOIN trading.bots b ON p.bot_id = b.id
JOIN exchange.user_credentials uc ON b.credential_id = uc.id
JOIN exchange.adapters a ON uc.adapter_id = a.id
WHERE p.status = 'closed'
  AND p.closed_at > NOW() - INTERVAL '90 days'
  AND p.trading_pair = 'BTC/USDT'  -- Same pair, different exchanges
GROUP BY p.trading_pair, a.code
ORDER BY avg_return_pct DESC;
```

**Insight:** Shows which exchange provides better execution/spreads for same pair

---

### Database Schema Requirements

#### **Existing Schema Support**

✅ **Already Supported:**
- `trading.positions` - P&L, trades, timestamps
- `exchange.adapters` - Exchange information
- JOIN via `credential_id` provides exchange context

#### **Recommended Indexes**

```sql
-- Optimize hourly/daily aggregations
CREATE INDEX idx_positions_closed_hour_dow
ON trading.positions(EXTRACT(HOUR FROM closed_at), EXTRACT(DOW FROM closed_at))
WHERE status = 'closed';

-- Optimize pair+exchange queries
CREATE INDEX idx_positions_pair_exchange_closed
ON trading.positions(trading_pair, credential_id, closed_at)
WHERE status = 'closed';
```

#### **Optional Materialized View for Heatmap**

```sql
CREATE MATERIALIZED VIEW finance.hourly_performance_heatmap AS
SELECT
  TO_CHAR(closed_at, 'Dy') as day,
  EXTRACT(HOUR FROM closed_at)::INTEGER as hour,
  AVG((realized_pnl_usd / NULLIF(quantity * entry_price, 0)) * 100) as avg_return_pct,
  COUNT(*) as trades
FROM trading.positions
WHERE status = 'closed'
  AND closed_at > NOW() - INTERVAL '90 days'
GROUP BY TO_CHAR(closed_at, 'Dy'), EXTRACT(DOW FROM closed_at), EXTRACT(HOUR FROM closed_at)
ORDER BY EXTRACT(DOW FROM closed_at), hour;

CREATE UNIQUE INDEX idx_heatmap_day_hour ON finance.hourly_performance_heatmap(day, hour);

-- Refresh daily
REFRESH MATERIALIZED VIEW finance.hourly_performance_heatmap;
```

---

### Summary: Finance Market Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|----------------------|
| **Market KPIs** | NestJS API | HTTP REST | On page load | Includes top exchange metric |
| **Hourly Heatmap** | NestJS API | HTTP REST | On page load | Platform-wide (all exchanges) |
| **Pair Performance** | NestJS API | HTTP REST | On page load | **Each pair shows exchange** |
| **Day of Week Chart** | NestJS API | HTTP REST | On page load | Aggregated across exchanges |
| **Exchange Breakdown** | NestJS API | HTTP REST | On page load | **Multi-exchange P&L comparison** |

**Schema Changes Required:**
1. ✅ Add indexes: `idx_positions_closed_hour_dow`, `idx_positions_pair_exchange_closed`
2. ✅ Optional: Create `finance.hourly_performance_heatmap` materialized view
3. ✅ Daily refresh for materialized view

**No Real-Time WebSocket Required** - Historical/aggregated data only

---

**[← Previous: Finance Risk](./15-finance-risk.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Finance Users →](./17-finance-users.md)**
