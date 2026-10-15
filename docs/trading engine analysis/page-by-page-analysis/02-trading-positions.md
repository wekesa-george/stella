## Page 2: `/trading` - Live Trading View (Positions)

### UI Mock Data Structure
```typescript
interface Position {
  id: string;              // "POS-0", "POS-1" (generated)
  pair: string;            // "BTC/USDT"
  exchange: string;        // "Binance", "Bybit", "OKX" (ADDED for multi-exchange)
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
7. **Exchange Selector** - Filter by exchange (Binance, Bybit, OKX, etc.) **(ADDED for multi-exchange)**
8. **Position Actions** - Close position, Kill position

---

### Data Source Mapping

#### **Candlestick/OHLCV Data**

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Candles (historical)** | NestJS API | `market_data.ohlcv_{exchange}_{pair}` (TimescaleDB hypertable) | On page load | ✅ EXISTS (per-exchange hypertables) |
| **Candles (real-time)** | Phoenix Channel | Market data adapter → PubSub (`candle:{exchange}:{pair}`) | Every 1s (for 1m) | ✅ EXISTS (MarketDataChannel) |
| **Current Price** | Phoenix Channel | ETS `price_cache` with composite key `{exchange, pair}` | Every tick (~100ms) | ⚠️ NEEDS composite key update |

---

#### **Position Data**

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **id** | PostgreSQL | `trading.positions.id` | Static | ✅ EXISTS |
| **pair** | PostgreSQL | `trading.positions.trading_pair` | Static | ✅ EXISTS |
| **exchange** | PostgreSQL | JOIN `exchange.user_credentials.adapter_id` → `exchange.adapters.code` via `credential_id` | Static | ✅ EXISTS (via FK) |
| **side** | PostgreSQL | `trading.positions.side` (enum: long/short) | Static | ✅ EXISTS |
| **entry** | PostgreSQL | `trading.positions.entry_price` | Static | ✅ EXISTS |
| **current** | Phoenix PubSub | ETS `price_cache` → current price for `{exchange, pair}` | Real-time | ⚠️ NEEDS composite key `{exchange, pair}` |
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

**Endpoint 1:** `GET /api/market-data/candles?exchange=binance&pair=BTC/USDT&timeframe=1h&limit=120` **(UPDATED with exchange parameter)**

**Response:**
```json
{
  "exchange": "binance",
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
-- Dynamic table name based on exchange parameter
-- Table format: market_data.ohlcv_{exchange}_{base}{quote}
-- Example: market_data.ohlcv_binance_btcusdt

SELECT
  time_bucket('1 hour', timestamp) as timestamp,
  first(open, timestamp) as open,
  max(high) as high,
  min(low) as low,
  last(close, timestamp) as close,
  sum(volume) as volume
FROM market_data.ohlcv_binance_btcusdt  -- Dynamically constructed: ohlcv_{exchange}_{pair}
WHERE timestamp >= NOW() - INTERVAL '5 days'
GROUP BY time_bucket('1 hour', timestamp)
ORDER BY timestamp DESC
LIMIT 120;

-- For multi-exchange support, backend must:
-- 1. Validate exchange parameter against exchange.adapters.code
-- 2. Sanitize pair name (BTC/USDT → btcusdt)
-- 3. Construct table name: ohlcv_{exchange}_{sanitized_pair}
-- 4. Verify table exists before querying
```

**Data Source:** **NestJS API** → TimescaleDB hypertable (per-exchange)

---

**Endpoint 2:** `GET /api/positions?exchange=binance&pair=BTC/USDT&status=open` **(UPDATED with exchange parameter)**

**Response:**
```json
{
  "positions": [
    {
      "id": "uuid",
      "pair": "BTC/USDT",
      "exchange": "binance",
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
  s.name as strategy_name,
  a.code as exchange_code,
  a.name as exchange_name
FROM trading.positions p
LEFT JOIN trading.bots b ON p.bot_id = b.id
LEFT JOIN strategy.strategies s ON p.strategy_id = s.id
LEFT JOIN exchange.user_credentials uc ON p.credential_id = uc.id
LEFT JOIN exchange.adapters a ON uc.adapter_id = a.id
WHERE p.status = 'open'
  AND ($1::text IS NULL OR p.trading_pair = $1)
  AND ($2::text IS NULL OR a.code = $2)  -- Filter by exchange
ORDER BY p.opened_at DESC;
```

**Data Source:** **NestJS API** → PostgreSQL (with exchange join)

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

**Channel 1:** `market_data:{exchange}:{pair}` - Price & Candle Updates **(UPDATED for multi-exchange)**

```javascript
// Frontend - Subscribe to specific exchange and pair
const exchange = "binance";  // or "bybit", "okx", etc.
const pair = "BTC/USDT";
const marketChannel = socket.channel(`market_data:${exchange}:${pair}`, {});
marketChannel.join();

marketChannel.on("ticker", ({ price, timestamp, exchange, pair }) => {
  // Update price for specific exchange+pair combination
  updateCurrentPrice(exchange, pair, price);
  updatePositionPnL(exchange, pair, price); // Recalculate positions for this exchange+pair
});

marketChannel.on("candle_closed", ({ timeframe, candle, exchange, pair }) => {
  if (timeframe === selectedTimeframe) {
    appendCandle(exchange, pair, candle);
  }
});

// For multi-exchange view, subscribe to multiple channels:
// marketChannel_binance_btc = socket.channel("market_data:binance:BTC/USDT", {})
// marketChannel_bybit_btc = socket.channel("market_data:bybit:BTC/USDT", {})
```

**Backend (Phoenix):**
```elixir
defmodule TradeEngineWeb.MarketDataChannel do
  use Phoenix.Channel

  # UPDATED: Parse exchange and pair from topic
  def join("market_data:" <> topic, _params, socket) do
    case String.split(topic, ":", parts: 2) do
      [exchange, pair] ->
        # Validate exchange exists
        unless TradeEngine.Exchange.adapter_exists?(exchange) do
          {:error, %{reason: "Invalid exchange: #{exchange}"}}
        else
          # Subscribe to exchange-specific PubSub topics
          :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "ticker:#{exchange}:#{pair}")
          :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "candle_closed:1m:#{exchange}:#{pair}")
          :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "candle_closed:5m:#{exchange}:#{pair}")
          :ok = Phoenix.PubSub.subscribe(TradeEngine.PubSub, "candle_closed:1h:#{exchange}:#{pair}")

          # Send current price from ETS with composite key {exchange, pair}
          current_price = TradeEngine.Cache.PriceCache.get_price({exchange, pair})

          {:ok, %{current_price: current_price, exchange: exchange, pair: pair},
           assign(socket, :exchange, exchange) |> assign(:pair, pair)}
        end

      _ ->
        {:error, %{reason: "Invalid topic format. Expected: market_data:{exchange}:{pair}"}}
    end
  end

  # UPDATED: Include exchange and pair in ticker broadcasts
  def handle_info({:ticker_update, exchange, pair, price}, socket) do
    push(socket, "ticker", %{
      exchange: exchange,
      pair: pair,
      price: price,
      timestamp: DateTime.utc_now()
    })
    {:noreply, socket}
  end

  # UPDATED: Include exchange and pair in candle broadcasts
  def handle_info({:candle_closed, timeframe, exchange, pair, candle}, socket) do
    push(socket, "candle_closed", %{
      timeframe: timeframe,
      exchange: exchange,
      pair: pair,
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

**ETS Cache Update (Composite Key Support):**
```elixir
defmodule TradeEngine.Cache.PriceCache do
  # UPDATED: Use composite key {exchange, pair} instead of just pair

  def put_price(exchange, pair, price) do
    :ets.insert(:price_cache, {{exchange, pair}, price, System.system_time(:second)})
  end

  def get_price({exchange, pair}) do
    case :ets.lookup(:price_cache, {exchange, pair}) do
      [{{^exchange, ^pair}, price, _timestamp}] -> price
      [] -> nil
    end
  end

  # Helper for broadcasting
  def broadcast_price_update(exchange, pair, price) do
    put_price(exchange, pair, price)

    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "ticker:#{exchange}:#{pair}",
      {:ticker_update, exchange, pair, price}
    )
  end
end
```

**Data Source:** **Phoenix WebSocket** → Market Data Adapter → ETS cache (with composite keys)

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
    # Get all open positions with exchange info (UPDATED for multi-exchange)
    open_positions = Repo.all(
      from p in Position,
      join: uc in assoc(p, :credential),
      join: a in assoc(uc, :adapter),
      where: p.status == :open,
      preload: [:user, credential: :adapter],
      select: %{
        position: p,
        exchange_code: a.code
      }
    )

    Enum.each(open_positions, fn %{position: position, exchange_code: exchange} ->
      # Get current price from ETS with composite key {exchange, pair}
      case TradeEngine.Cache.PriceCache.get_price({exchange, position.trading_pair}) do
        nil ->
          :ok  # Price not available

        current_price ->
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
            exchange,  # Store exchange for debugging
            System.monotonic_time(:second)
          })
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

### Multi-Exchange Architecture Recommendations

#### **1. ETS Price Cache - Composite Key Structure**

**Problem:** Current price cache uses `pair` as key, but same pair exists on multiple exchanges with different prices.

**Solution:**
```elixir
# Initialize ETS table with composite key support
:ets.new(:price_cache, [
  :named_table,
  :set,
  :public,
  read_concurrency: true,
  write_concurrency: true
])

# Key structure: {{exchange, pair}, price, timestamp}
# Example entries:
# {{"binance", "BTC/USDT"}, 65450.50, 1708531200}
# {{"bybit", "BTC/USDT"}, 65448.75, 1708531201}
# {{"okx", "BTC/USDT"}, 65452.00, 1708531199}
```

**Migration Impact:**
- ✅ All `PriceCache.get_price(pair)` calls must change to `PriceCache.get_price({exchange, pair})`
- ✅ Market data adapters must include exchange in broadcasts
- ✅ PositionPnLManager must fetch exchange from position's credential

---

#### **2. PubSub Topic Naming Convention**

**Problem:** Current topics are `ticker:BTC/USDT` - no exchange differentiation

**Solution:**
```elixir
# Market Data Topics (per exchange + pair)
"ticker:{exchange}:{pair}"                    # ticker:binance:BTC/USDT
"candle_closed:1m:{exchange}:{pair}"          # candle_closed:1m:bybit:BTC/USDT
"candle_closed:5m:{exchange}:{pair}"
"candle_closed:1h:{exchange}:{pair}"

# Position Topics (per user, all exchanges)
"positions:user:{user_id}"                    # All positions for user across all exchanges

# Order Topics (per user, all exchanges)
"orders:user:{user_id}"                       # All orders for user across all exchanges
```

**Benefits:**
- ✅ Clear separation of exchange data streams
- ✅ Easy to subscribe to specific exchange+pair combinations
- ✅ Supports cross-exchange arbitrage strategies
- ✅ Prevents price data mixing from different exchanges

---

#### **3. Market Data Adapter Architecture**

Each exchange needs its own market data adapter GenServer:

```elixir
# Supervisor structure
children = [
  {TradeEngine.MarketData.BinanceAdapter, []},
  {TradeEngine.MarketData.BybitAdapter, []},
  {TradeEngine.MarketData.OkxAdapter, []},
  # ... more exchanges
]

# Each adapter implements common behavior
defmodule TradeEngine.MarketData.BinanceAdapter do
  use GenServer
  @exchange "binance"

  def handle_info({:ticker_update, pair, price}, state) do
    # Store in ETS with exchange prefix
    TradeEngine.Cache.PriceCache.put_price(@exchange, pair, price)

    # Broadcast to exchange-specific topic
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "ticker:#{@exchange}:#{pair}",
      {:ticker_update, @exchange, pair, price}
    )

    {:noreply, state}
  end

  def handle_info({:candle_closed, timeframe, pair, candle}, state) do
    Phoenix.PubSub.broadcast(
      TradeEngine.PubSub,
      "candle_closed:#{timeframe}:#{@exchange}:#{pair}",
      {:candle_closed, timeframe, @exchange, pair, candle}
    )

    {:noreply, state}
  end
end
```

---

#### **4. TimescaleDB Hypertable Naming Convention**

**Current:** `market_data.ohlcv_binance_btcusdt`

**Keep this format:**
```sql
-- Format: market_data.ohlcv_{exchange}_{base}{quote}
market_data.ohlcv_binance_btcusdt
market_data.ohlcv_bybit_btcusdt
market_data.ohlcv_okx_btcusdt
market_data.ohlcv_binance_ethusdt
market_data.ohlcv_bybit_ethusdt
```

**Dynamic Table Creation:**
```sql
-- Function to create hypertable for new exchange+pair
CREATE OR REPLACE FUNCTION market_data.create_ohlcv_table(
  p_exchange TEXT,
  p_base TEXT,
  p_quote TEXT
) RETURNS TEXT AS $$
DECLARE
  v_table_name TEXT;
BEGIN
  v_table_name := format('ohlcv_%s_%s%s', lower(p_exchange), lower(p_base), lower(p_quote));

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS market_data.%I (
      timestamp TIMESTAMPTZ NOT NULL,
      open DECIMAL(24,8) NOT NULL,
      high DECIMAL(24,8) NOT NULL,
      low DECIMAL(24,8) NOT NULL,
      close DECIMAL(24,8) NOT NULL,
      volume DECIMAL(24,8) NOT NULL,
      trades INTEGER,
      CONSTRAINT %I_timestamp_check CHECK (timestamp IS NOT NULL)
    )', v_table_name, v_table_name || '_timestamp');

  -- Convert to hypertable
  PERFORM create_hypertable(
    format('market_data.%I', v_table_name),
    'timestamp',
    if_not_exists => TRUE
  );

  -- Create index
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON market_data.%I(timestamp DESC)',
    v_table_name || '_time_idx', v_table_name);

  RETURN v_table_name;
END;
$$ LANGUAGE plpgsql;

-- Usage
SELECT market_data.create_ohlcv_table('binance', 'BTC', 'USDT');
SELECT market_data.create_ohlcv_table('bybit', 'BTC', 'USDT');
```

---

#### **5. Position Query Optimization for Multi-Exchange**

**Recommended Index:**
```sql
-- Add composite index for exchange-filtered position queries
CREATE INDEX idx_positions_exchange_pair_status
ON trading.positions(credential_id, trading_pair, status)
INCLUDE (id, side, entry_price, quantity, opened_at, bot_id, strategy_id);

-- This supports queries like:
-- SELECT * FROM trading.positions p
-- JOIN exchange.user_credentials uc ON p.credential_id = uc.id
-- WHERE uc.adapter_id = (SELECT id FROM exchange.adapters WHERE code = 'binance')
--   AND p.trading_pair = 'BTC/USDT'
--   AND p.status = 'open';
```

---

#### **6. Frontend State Management for Multi-Exchange**

**React State Structure:**
```typescript
interface TradingPageState {
  // Prices keyed by exchange+pair
  prices: Map<string, number>; // key: "binance:BTC/USDT"

  // Candles keyed by exchange+pair
  candles: Map<string, Candle[]>; // key: "binance:BTC/USDT"

  // Positions (already have exchange info)
  positions: Position[];  // each has exchange field

  // Orders (already have exchange_code field)
  orders: Order[];

  // Active filters
  selectedExchange: string | null;  // null = all exchanges
  selectedPair: string;
}

// Helper functions
function getPriceKey(exchange: string, pair: string): string {
  return `${exchange}:${pair}`;
}

function updatePrice(exchange: string, pair: string, price: number) {
  const key = getPriceKey(exchange, pair);
  setPrices(prev => new Map(prev).set(key, price));
}
```

---

#### **7. WebSocket Connection Management**

**Challenge:** User may have bots on multiple exchanges viewing same pair

**Solution:**
```typescript
// Subscribe to all unique exchange+pair combinations from user's positions
const uniqueMarkets = new Set<string>();

positions.forEach(pos => {
  uniqueMarkets.add(`${pos.exchange}:${pos.pair}`);
});

const channels: PhoenixChannel[] = [];

uniqueMarkets.forEach(market => {
  const [exchange, pair] = market.split(':');
  const channel = socket.channel(`market_data:${exchange}:${pair}`, {});
  channel.join();
  channels.push(channel);
});

// Cleanup on unmount
return () => {
  channels.forEach(ch => ch.leave());
};
```

---

### Summary: Trading/Positions Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|-----------------------|
| **Candlestick Chart (historical)** | NestJS API | HTTP REST | On page load | Query `ohlcv_{exchange}_{pair}` table |
| **Candlestick Chart (live)** | Phoenix Channel | WebSocket | Every 1s | Subscribe to `market_data:{exchange}:{pair}` |
| **Current Price** | Phoenix Channel | WebSocket | Every tick (~100ms) | ETS cache key: `{exchange, pair}` |
| **Open Positions (initial)** | NestJS API | HTTP REST | On page load | JOIN with `exchange.adapters` for exchange name |
| **Position P&L Updates** | Phoenix Channel | WebSocket | Every 1s | Price lookup: `{exchange, pair}` composite key |
| **Position Open/Close Events** | Phoenix Channel | WebSocket | On event | Broadcast to `positions:user:{id}` |
| **Order Stream (initial)** | NestJS API | HTTP REST | On page load | Includes `exchange_code` field |
| **New Orders** | Phoenix Channel | WebSocket | On event | Broadcast to `orders:user:{id}` |
| **Order Status Updates** | Phoenix Channel | WebSocket | On event | Exchange-agnostic updates |

**Schema Changes Required (Updated for Multi-Exchange):**
1. ✅ Verify TimescaleDB hypertables exist per exchange: `ohlcv_{exchange}_{pair}`
2. ✅ Create SQL function `create_ohlcv_table(exchange, base, quote)` for dynamic table creation
3. ✅ Update ETS `:price_cache` to use composite key `{exchange, pair}`
4. ✅ Update `PositionPnLManager` GenServer to fetch exchange from `credential_id`
5. ✅ Create ETS table `:position_pnl_cache` with exchange column
6. ✅ Update PubSub topics: `ticker:{exchange}:{pair}`, `candle_closed:{tf}:{exchange}:{pair}`
7. ✅ Add index: `idx_positions_exchange_pair_status` for exchange-filtered queries
8. ✅ Update `MarketDataChannel` to parse `{exchange}:{pair}` from topic

---

### Testing Checklist (Multi-Exchange Support)

#### **Data Loading Tests**
- [ ] Page loads historical candles for selected exchange+pair
- [ ] Page loads positions filtered by exchange
- [ ] Page loads orders filtered by exchange
- [ ] Exchange selector dropdown populates from `exchange.adapters` WHERE `status='active'`
- [ ] Pair selector shows pairs available on selected exchange
- [ ] Switching exchange updates chart data correctly
- [ ] Multiple positions with same pair but different exchanges display correctly

#### **Real-Time Update Tests**
- [ ] Price updates arrive for correct exchange+pair combination
- [ ] Position P&L updates correctly for positions on Binance when Binance price changes
- [ ] Position P&L for Bybit position NOT updated when Binance price changes
- [ ] Candle updates append to chart for correct exchange
- [ ] New order appears in stream with correct exchange label
- [ ] Order fill event updates correct order (exchange-agnostic by order ID)

#### **Multi-Exchange Scenario Tests**
- [ ] User has BTC/USDT position on both Binance and Bybit
  - [ ] Both positions display with different exchanges
  - [ ] Each position shows different current price
  - [ ] Each position P&L calculated from correct exchange price
- [ ] User switches from Binance BTC/USDT chart to Bybit BTC/USDT chart
  - [ ] Historical candles reload from correct exchange table
  - [ ] WebSocket unsubscribes from `market_data:binance:BTC/USDT`
  - [ ] WebSocket subscribes to `market_data:bybit:BTC/USDT`
  - [ ] Position lines on chart update to show Bybit positions only

#### **WebSocket Reconnection Tests**
- [ ] Connection to Binance market data lost → auto-reconnect
- [ ] Connection to Bybit market data lost → auto-reconnect
- [ ] Multiple exchange channels reconnect independently
- [ ] Reconnection restores all subscribed channels
- [ ] Stale data flagged if price updates stop for >10 seconds

#### **Performance Tests**
- [ ] Page handles 50+ open positions across 5 exchanges
- [ ] Chart renders smoothly with 120 candles
- [ ] Price updates (100ms) don't block UI
- [ ] Position P&L calculation (1s) handles 100+ positions
- [ ] WebSocket message rate stays under 100 msg/sec per client

#### **Edge Cases**
- [ ] Exchange has no open positions → chart still loads
- [ ] Pair exists on Exchange A but not Exchange B → disabled in selector
- [ ] Price data missing for exchange+pair → show "No Data" indicator
- [ ] User closes last position on exchange → chart persists
- [ ] Hypertable missing for exchange+pair → API returns 404 with clear error

#### **Error Handling Tests**
- [ ] Invalid exchange parameter → API returns 400 Bad Request
- [ ] Non-existent hypertable → API returns 404 Not Found
- [ ] WebSocket join fails → show connection error banner
- [ ] Price cache miss → position shows last known price + stale indicator
- [ ] Exchange adapter offline → show "Exchange Offline" status

---

### Multi-Exchange Migration Checklist

For transitioning from single-exchange to multi-exchange architecture:

#### **Phase 1: Database Layer**
- [ ] Create `create_ohlcv_table()` SQL function
- [ ] Generate hypertables for all active exchange+pair combinations
- [ ] Add `idx_positions_exchange_pair_status` index
- [ ] Test queries with exchange filtering

#### **Phase 2: Phoenix Backend**
- [ ] Update ETS `:price_cache` initialization
- [ ] Refactor `PriceCache` module for composite keys
- [ ] Update `PositionPnLManager` to fetch exchange from credentials
- [ ] Update `MarketDataChannel` join logic
- [ ] Update PubSub broadcast topics
- [ ] Create exchange-specific market data adapters

#### **Phase 3: NestJS Backend**
- [ ] Add `exchange` query parameter to candle endpoint
- [ ] Add `exchange` query parameter to positions endpoint
- [ ] Update SQL queries with exchange JOINs
- [ ] Add exchange validation middleware

#### **Phase 4: Frontend**
- [ ] Update TypeScript interfaces (add `exchange` field)
- [ ] Add Exchange selector UI component
- [ ] Update WebSocket subscription logic
- [ ] Update state management for multi-exchange prices
- [ ] Add exchange badge to position/order cards
- [ ] Update chart to show exchange in title

#### **Phase 5: Testing & Validation**
- [ ] Run all tests in checklist above
- [ ] Load test with multi-exchange data
- [ ] Monitor WebSocket message volume
- [ ] Verify no price data mixing between exchanges

---

---


---

**[← Previous: Bot Fleet](./01-bot-fleet.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Mission Control →](./03-mission-control.md)**
