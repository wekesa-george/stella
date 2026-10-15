# Page 25: `/settings/exchanges` - Exchange Management

**Route:** `/settings/exchanges`
**Page Type:** Configuration Management (Platform-wide exchange credentials)
**User Persona:** Platform Admin
**Real-time Requirements:** Yes (connection health monitoring)

---

## UI Features & Requirements

**Mock Data Structure from page.tsx:6-13:**

```typescript
const EXCHANGES_DATA = [
  { id: "binance", name: "Binance", color: "#C99400", bg: "#C9940018", abbr: "BN", status: "connected", apiKey: "BNCE-••••-••••-••••-3f2a", rateLimit: 1200, pairs: 47, env: "live", lastPing: "1s ago", fees: "0.02/0.04" },
  { id: "bybit", name: "Bybit", color: "#00e5a0", bg: "#00e5a018", abbr: "BY", status: "connected", apiKey: "BYBT-••••-••••-••••-9c1d", rateLimit: 600, pairs: 31, env: "live", lastPing: "2s ago", fees: "0.01/0.06" },
  { id: "okx", name: "OKX", color: "#3d9df3", bg: "#3d9df318", abbr: "OK", status: "connected", apiKey: "OKEX-••••-••••-••••-7b3e", rateLimit: 1000, pairs: 28, env: "live", lastPing: "3s ago", fees: "0.02/0.05" },
  { id: "kraken", name: "Kraken", color: "#8B5CF6", bg: "#8B5CF618", abbr: "KR", status: "degraded", apiKey: "KRKN-••••-••••-••••-2d1f", rateLimit: 60, pairs: 19, env: "live", lastPing: "18s ago", fees: "0.16/0.26" },
  { id: "kucoin", name: "Kucoin", color: "#21A179", bg: "#21A17918", abbr: "KC", status: "connected", apiKey: "KUCN-••••-••••-••••-5a8c", rateLimit: 600, pairs: 22, env: "live", lastPing: "2s ago", fees: "0.10/0.10" },
  { id: "binance_t", name: "Binance Testnet", color: "#7a6200", bg: "#7a620018", abbr: "BT", status: "connected", apiKey: "BNTST-••••-••••-8812", rateLimit: 1200, pairs: 47, env: "sandbox", lastPing: "5s ago", fees: "0/0" },
];
```

**UI Components:**

1. **KPI Cards** (page.tsx:41-62)
   - Connected: `5` (1 sandbox)
   - Degraded: `1` (Kraken · high latency)
   - Total Pairs: `147` (across all exchanges)
   - Avg Latency: `84ms` (last 5 min avg)

2. **Exchange Cards** (page.tsx:65-216) - Expandable/collapsible
   - **Collapsed View:**
     - Exchange name, logo/abbr, connection status badge
     - Environment badge (`"Sandbox"` for testnet)
     - Stats: `47 pairs · Last ping 1s ago · Fees 0.02/0.04% maker/taker`
     - Test button (`"Test"` → `"Testing…"` → `"✓ Healthy"`)
     - Expand/collapse toggle

   - **Expanded View:**
     - API Key: Masked with reveal button
     - API Secret: Always masked with `"Rotate"` button
     - Passphrase: Masked (if required) with `"Update"` button
     - Rate Limit: Editable input (`1200 requests/min`)
     - Environment: Dropdown (`"Live / Production"` or `"Sandbox / Testnet"`)
     - Max Open Orders: Editable input (`200`)
     - Actions: `"Disconnect"` (red), `"Save Changes"` (green)

3. **Add Exchange CTA** (page.tsx:218-224)
   - Dashed border card with `"+ Add Exchange"` button
   - Suggests: `"Bitget, MEXC, Deribit, Hyperliquid…"`

---

## Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| **KPI: Connected** | Count of exchanges WHERE status = 'connected' | `exchange.platform_exchanges` aggregate | REST API | On page load |
| **KPI: Degraded** | Count WHERE status = 'degraded' | `exchange.platform_exchanges` aggregate | REST API | On page load |
| **KPI: Total Pairs** | SUM(pairs_count) | `exchange.platform_exchanges` aggregate | REST API | On page load |
| **KPI: Avg Latency** | AVG(last_ping_ms) from last 5 min | Phoenix ETS cache (`ExchangeHealthMonitor`) | REST API | On page load |
| **Exchange Cards: Metadata** | name, logo_url, color, abbr, fees, pairs | `exchange.platform_exchanges` | REST API | On page load |
| **Exchange Cards: Status** | connection_status (enum) | Phoenix ETS cache | WebSocket | Every 10 seconds |
| **Exchange Cards: Last Ping** | last_health_check_at | Phoenix ETS cache | WebSocket | Every 10 seconds |
| **Exchange Cards: Credentials** | api_key (encrypted), api_secret (encrypted), passphrase (encrypted) | `exchange.platform_exchanges.credentials_encrypted` | REST API | On reveal (admin auth) |
| **Exchange Cards: Config** | rate_limit, environment, max_open_orders | `exchange.platform_exchanges` | REST API | On expand |
| **Test Connection** | Health check result | Phoenix `ExchangeHealthMonitor.test_connection/1` | REST API | On demand |
| **Save Changes** | Update exchange config | `exchange.platform_exchanges` UPDATE | REST API | On save |
| **Add Exchange** | New exchange creation | `exchange.platform_exchanges` INSERT | REST API | On demand |

---

## Database Schema Requirements

### New Tables

**1. `exchange.platform_exchanges`**

```sql
CREATE SCHEMA IF NOT EXISTS exchange;

CREATE TABLE exchange.platform_exchanges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exchange_code VARCHAR(50) UNIQUE NOT NULL, -- 'binance', 'bybit', 'okx', etc.

  -- Display metadata
  name VARCHAR(255) NOT NULL,
  logo_url VARCHAR(500),
  color VARCHAR(7), -- Hex color
  bg_color VARCHAR(9), -- Hex color with opacity
  abbr VARCHAR(3),

  -- Encrypted credentials (using pgcrypto)
  credentials_encrypted BYTEA NOT NULL, -- Stores JSON: { api_key, api_secret, passphrase }

  -- Configuration
  rate_limit_per_min INTEGER NOT NULL DEFAULT 1200,
  environment VARCHAR(50) NOT NULL DEFAULT 'live', -- 'live' or 'sandbox'
    CHECK (environment IN ('live', 'sandbox')),
  max_open_orders INTEGER NOT NULL DEFAULT 200,

  -- Health monitoring
  connection_status VARCHAR(50) NOT NULL DEFAULT 'disconnected',
    CHECK (connection_status IN ('connected', 'degraded', 'disconnected')),
  last_health_check_at TIMESTAMPTZ,
  last_ping_ms INTEGER, -- Latency in milliseconds

  -- Trading pairs and fees
  pairs_count INTEGER NOT NULL DEFAULT 0,
  maker_fee_pct DECIMAL(5,4), -- 0.02% = 0.0002
  taker_fee_pct DECIMAL(5,4),

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT exchange_code_lowercase CHECK (exchange_code = LOWER(exchange_code))
);

CREATE INDEX idx_platform_exchanges_active ON exchange.platform_exchanges (is_active) WHERE is_active = true;
CREATE INDEX idx_platform_exchanges_status ON exchange.platform_exchanges (connection_status);
CREATE UNIQUE INDEX idx_platform_exchanges_code ON exchange.platform_exchanges (exchange_code);
```

**2. `exchange.exchange_health_checks`**

```sql
CREATE TABLE exchange.exchange_health_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exchange_id UUID NOT NULL REFERENCES exchange.platform_exchanges(id) ON DELETE CASCADE,

  check_type VARCHAR(50) NOT NULL, -- 'scheduled', 'manual', 'on_connect'
  ping_ms INTEGER, -- Response time in milliseconds
  status_code INTEGER, -- HTTP status or custom code
  is_healthy BOOLEAN NOT NULL,
  error_message TEXT,

  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by_user_id UUID REFERENCES auth.users(id), -- NULL for scheduled checks

  CONSTRAINT health_check_ping_positive CHECK (ping_ms >= 0)
);

CREATE INDEX idx_exchange_health_exchange ON exchange.exchange_health_checks (exchange_id, checked_at DESC);
CREATE INDEX idx_exchange_health_recent ON exchange.exchange_health_checks (checked_at DESC) WHERE checked_at > NOW() - INTERVAL '5 minutes';
```

**3. `exchange.exchange_trading_pairs`**

```sql
CREATE TABLE exchange.exchange_trading_pairs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exchange_id UUID NOT NULL REFERENCES exchange.platform_exchanges(id) ON DELETE CASCADE,

  symbol VARCHAR(50) NOT NULL, -- 'BTC/USDT', 'ETH/USDT', etc.
  base_currency VARCHAR(10) NOT NULL, -- 'BTC', 'ETH'
  quote_currency VARCHAR(10) NOT NULL, -- 'USDT', 'USD'

  is_active BOOLEAN NOT NULL DEFAULT true,
  min_order_size DECIMAL(20,8),
  max_order_size DECIMAL(20,8),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_exchange_symbol UNIQUE (exchange_id, symbol)
);

CREATE INDEX idx_exchange_pairs_active ON exchange.exchange_trading_pairs (exchange_id, is_active) WHERE is_active = true;
CREATE INDEX idx_exchange_pairs_symbol ON exchange.exchange_trading_pairs (symbol);
```

### Seed Data for Platform Exchanges

```sql
INSERT INTO exchange.platform_exchanges (
  exchange_code, name, color, bg_color, abbr, rate_limit_per_min, environment, pairs_count, maker_fee_pct, taker_fee_pct, credentials_encrypted
) VALUES
('binance', 'Binance', '#C99400', '#C9940018', 'BN', 1200, 'live', 47, 0.0002, 0.0004,
  pgp_sym_encrypt('{"api_key":"DEMO_KEY","api_secret":"DEMO_SECRET"}', current_setting('app.encryption_key'))),

('bybit', 'Bybit', '#00e5a0', '#00e5a018', 'BY', 600, 'live', 31, 0.0001, 0.0006,
  pgp_sym_encrypt('{"api_key":"DEMO_KEY","api_secret":"DEMO_SECRET"}', current_setting('app.encryption_key'))),

('okx', 'OKX', '#3d9df3', '#3d9df318', 'OK', 1000, 'live', 28, 0.0002, 0.0005,
  pgp_sym_encrypt('{"api_key":"DEMO_KEY","api_secret":"DEMO_SECRET","passphrase":"DEMO_PASS"}', current_setting('app.encryption_key'))),

('kraken', 'Kraken', '#8B5CF6', '#8B5CF618', 'KR', 60, 'live', 19, 0.0016, 0.0026,
  pgp_sym_encrypt('{"api_key":"DEMO_KEY","api_secret":"DEMO_SECRET"}', current_setting('app.encryption_key'))),

('kucoin', 'Kucoin', '#21A179', '#21A17918', 'KC', 600, 'live', 22, 0.0010, 0.0010,
  pgp_sym_encrypt('{"api_key":"DEMO_KEY","api_secret":"DEMO_SECRET","passphrase":"DEMO_PASS"}', current_setting('app.encryption_key'))),

('binance_testnet', 'Binance Testnet', '#7a6200', '#7a620018', 'BT', 1200, 'sandbox', 47, 0.0000, 0.0000,
  pgp_sym_encrypt('{"api_key":"TESTNET_KEY","api_secret":"TESTNET_SECRET"}', current_setting('app.encryption_key')))
ON CONFLICT (exchange_code) DO NOTHING;
```

---

## NestJS REST API Endpoints

### 1. `GET /api/settings/exchanges` - List All Platform Exchanges

**Purpose:** Load all exchanges with metadata and health stats
**Authentication:** Admin role required

**Response:**

```typescript
interface ExchangesResponse {
  exchanges: PlatformExchange[];
  kpis: {
    connected_count: number;
    degraded_count: number;
    total_pairs: number;
    avg_latency_ms: number;
  };
}

interface PlatformExchange {
  id: string;
  exchange_code: string;
  name: string;
  logo_url: string | null;
  color: string;
  bg_color: string;
  abbr: string;

  connection_status: 'connected' | 'degraded' | 'disconnected';
  last_health_check_at: string; // ISO timestamp
  last_ping_ms: number;

  rate_limit_per_min: number;
  environment: 'live' | 'sandbox';
  max_open_orders: number;

  pairs_count: number;
  maker_fee_pct: number;
  taker_fee_pct: number;

  is_active: boolean;
  updated_at: string;
}

// GET /api/settings/exchanges
{
  "exchanges": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "exchange_code": "binance",
      "name": "Binance",
      "logo_url": null,
      "color": "#C99400",
      "bg_color": "#C9940018",
      "abbr": "BN",
      "connection_status": "connected",
      "last_health_check_at": "2026-02-21T10:30:00Z",
      "last_ping_ms": 120,
      "rate_limit_per_min": 1200,
      "environment": "live",
      "max_open_orders": 200,
      "pairs_count": 47,
      "maker_fee_pct": 0.0002,
      "taker_fee_pct": 0.0004,
      "is_active": true,
      "updated_at": "2026-02-21T10:00:00Z"
    },
    // ... 5 more exchanges
  ],
  "kpis": {
    "connected_count": 5,
    "degraded_count": 1,
    "total_pairs": 147,
    "avg_latency_ms": 84
  }
}
```

**Implementation:**

```typescript
async getExchanges(): Promise<ExchangesResponse> {
  const exchanges = await this.exchangesRepo.find({
    where: { is_active: true },
    order: { exchange_code: 'ASC' },
  });

  const kpis = {
    connected_count: exchanges.filter(e => e.connection_status === 'connected').length,
    degraded_count: exchanges.filter(e => e.connection_status === 'degraded').length,
    total_pairs: exchanges.reduce((sum, e) => sum + e.pairs_count, 0),
    avg_latency_ms: Math.round(
      exchanges.reduce((sum, e) => sum + (e.last_ping_ms || 0), 0) / exchanges.length
    ),
  };

  return {
    exchanges: exchanges.map(e => ({
      ...e,
      // Exclude credentials_encrypted
      last_health_check_at: e.last_health_check_at?.toISOString(),
      updated_at: e.updated_at.toISOString(),
    })),
    kpis,
  };
}
```

### 2. `POST /api/settings/exchanges/:id/reveal-credentials` - Reveal Encrypted Credentials

**Purpose:** Decrypt and return exchange API credentials (admin only)
**Authentication:** Admin role + audit logging

**Request:**

```typescript
// POST /api/settings/exchanges/550e8400-e29b-41d4-a716-446655440000/reveal-credentials
// No body required
```

**Response:**

```typescript
{
  "api_key": "REDACTED",
  "api_secret": "REDACTED",
  "passphrase": "mypassphrase" // Optional, only for OKX/Kucoin
}
```

**Implementation:**

```typescript
async revealCredentials(exchangeId: string, adminUserId: string) {
  const exchange = await this.exchangesRepo.findOneOrFail({ where: { id: exchangeId } });

  // Decrypt using pgcrypto
  const decrypted = await this.db.query(
    `SELECT pgp_sym_decrypt($1, $2) AS credentials`,
    [exchange.credentials_encrypted, process.env.EXCHANGE_ENCRYPTION_KEY]
  );

  // Log audit trail
  await this.auditService.log({
    action: 'exchange_credentials_revealed',
    resource_type: 'platform_exchange',
    resource_id: exchangeId,
    admin_user_id: adminUserId,
    metadata: { exchange_code: exchange.exchange_code },
  });

  return JSON.parse(decrypted[0].credentials);
}
```

### 3. `POST /api/settings/exchanges/:id/test-connection` - Test Exchange Health

**Purpose:** Manually trigger health check for an exchange
**Authentication:** Admin role

**Request:**

```typescript
// POST /api/settings/exchanges/550e8400-e29b-41d4-a716-446655440000/test-connection
// No body required
```

**Response:**

```typescript
{
  "exchange_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_healthy": true,
  "ping_ms": 120,
  "status_code": 200,
  "checked_at": "2026-02-21T10:35:00Z",
  "message": "Exchange is responding normally"
}
```

**Implementation:**

```typescript
async testConnection(exchangeId: string, adminUserId: string) {
  const exchange = await this.exchangesRepo.findOneOrFail({ where: { id: exchangeId } });

  // Call Phoenix GenServer to perform health check
  const result = await this.phoenixClient.post(
    `/api/phoenix/exchanges/${exchangeId}/health-check`,
    { checked_by: adminUserId }
  );

  // Phoenix will update ETS cache and broadcast via WebSocket
  return result.data;
}
```

### 4. `PUT /api/settings/exchanges/:id` - Update Exchange Configuration

**Purpose:** Update exchange settings (rate limit, environment, max orders)
**Authentication:** Admin role + audit logging

**Request:**

```typescript
{
  "rate_limit_per_min": 1000,
  "environment": "live",
  "max_open_orders": 250
}
```

**Response:**

```typescript
{
  "exchange": PlatformExchange, // Updated exchange object
  "message": "Exchange 'Binance' updated successfully"
}
```

**Implementation:**

```typescript
async updateExchange(exchangeId: string, data: UpdateExchangeDto, adminUserId: string) {
  const exchange = await this.exchangesRepo.findOneOrFail({ where: { id: exchangeId } });

  const updated = await this.exchangesRepo.save({
    ...exchange,
    rate_limit_per_min: data.rate_limit_per_min ?? exchange.rate_limit_per_min,
    environment: data.environment ?? exchange.environment,
    max_open_orders: data.max_open_orders ?? exchange.max_open_orders,
    updated_at: new Date(),
  });

  // Audit log
  await this.auditService.log({
    action: 'exchange_config_updated',
    resource_type: 'platform_exchange',
    resource_id: exchangeId,
    admin_user_id: adminUserId,
    metadata: { exchange_code: exchange.exchange_code, changes: data },
  });

  return { exchange: updated, message: `Exchange '${updated.name}' updated successfully` };
}
```

### 5. `POST /api/settings/exchanges/:id/rotate-credentials` - Rotate Exchange Credentials

**Purpose:** Update exchange API credentials
**Authentication:** Admin role + MFA required

**Request:**

```typescript
{
  "api_key": "new_binance_key_abc123",
  "api_secret": "new_binance_secret_xyz789",
  "passphrase": "new_passphrase" // Optional
}
```

**Response:**

```typescript
{
  "exchange_id": "550e8400-e29b-41d4-a716-446655440000",
  "rotated_at": "2026-02-21T10:40:00Z",
  "message": "Credentials rotated successfully. Test connection to verify."
}
```

**Implementation:**

```typescript
async rotateCredentials(
  exchangeId: string,
  credentials: { api_key: string; api_secret: string; passphrase?: string },
  adminUserId: string
) {
  // Encrypt new credentials using pgcrypto
  const encrypted = await this.db.query(
    `SELECT pgp_sym_encrypt($1, $2) AS credentials_encrypted`,
    [JSON.stringify(credentials), process.env.EXCHANGE_ENCRYPTION_KEY]
  );

  // Update exchange
  await this.exchangesRepo.update(exchangeId, {
    credentials_encrypted: encrypted[0].credentials_encrypted,
    updated_at: new Date(),
  });

  // Audit log
  await this.auditService.log({
    action: 'exchange_credentials_rotated',
    resource_type: 'platform_exchange',
    resource_id: exchangeId,
    admin_user_id: adminUserId,
  });

  // Trigger health check with new credentials
  await this.testConnection(exchangeId, adminUserId);

  return { exchange_id: exchangeId, rotated_at: new Date().toISOString() };
}
```

### 6. `POST /api/settings/exchanges` - Add New Exchange

**Purpose:** Connect a new exchange to the platform
**Authentication:** Admin role

**Request:**

```typescript
{
  "exchange_code": "bitget",
  "name": "Bitget",
  "color": "#54E1A5",
  "bg_color": "#54E1A518",
  "abbr": "BG",
  "rate_limit_per_min": 800,
  "environment": "live",
  "credentials": {
    "api_key": "bitget_key_abc123",
    "api_secret": "bitget_secret_xyz789"
  }
}
```

**Response:**

```typescript
{
  "exchange": PlatformExchange, // New exchange object
  "message": "Exchange 'Bitget' added successfully. Fetching trading pairs..."
}
```

**Implementation:**

```typescript
async addExchange(data: CreateExchangeDto, adminUserId: string) {
  // Encrypt credentials
  const encrypted = await this.db.query(
    `SELECT pgp_sym_encrypt($1, $2) AS credentials_encrypted`,
    [JSON.stringify(data.credentials), process.env.EXCHANGE_ENCRYPTION_KEY]
  );

  // Create exchange
  const exchange = await this.exchangesRepo.save({
    exchange_code: data.exchange_code.toLowerCase(),
    name: data.name,
    color: data.color,
    bg_color: data.bg_color,
    abbr: data.abbr,
    rate_limit_per_min: data.rate_limit_per_min,
    environment: data.environment,
    max_open_orders: 200,
    credentials_encrypted: encrypted[0].credentials_encrypted,
    is_active: true,
  });

  // Audit log
  await this.auditService.log({
    action: 'exchange_added',
    resource_type: 'platform_exchange',
    resource_id: exchange.id,
    admin_user_id: adminUserId,
    metadata: { exchange_code: exchange.exchange_code },
  });

  // Trigger initial health check
  await this.testConnection(exchange.id, adminUserId);

  // Fetch trading pairs in background
  this.fetchTradingPairs(exchange.id);

  return { exchange, message: `Exchange '${exchange.name}' added successfully` };
}
```

---

## Phoenix Channel: `exchange:health`

**Topic Pattern:** `exchange:health:all`

**Purpose:** Broadcast real-time exchange health updates to all admins viewing the exchanges page.

**WebSocket Events:**

```typescript
// Server → Client: Exchange health status changed
interface ExchangeHealthUpdateEvent {
  event: 'exchange_health_update';
  payload: {
    exchange_id: string;
    exchange_code: string;
    connection_status: 'connected' | 'degraded' | 'disconnected';
    last_ping_ms: number;
    last_health_check_at: string; // ISO timestamp
    checked_by: 'system' | 'manual';
  };
}

// Server → Client: Trading pairs synced
interface TradingPairsSyncedEvent {
  event: 'trading_pairs_synced';
  payload: {
    exchange_id: string;
    exchange_code: string;
    pairs_count: number;
    synced_at: string;
  };
}
```

**Frontend Implementation:**

```typescript
// Connect to Phoenix Channel
const socket = new Socket('/socket', { params: { token: userToken } });
socket.connect();

const channel = socket.channel('exchange:health:all', { admin_user_id: currentUser.id });

channel.on('exchange_health_update', (payload) => {
  // Update exchange card connection status in React state
  setExchanges(prev => prev.map(ex =>
    ex.id === payload.exchange_id
      ? {
          ...ex,
          connection_status: payload.connection_status,
          last_ping_ms: payload.last_ping_ms,
          last_health_check_at: payload.last_health_check_at,
        }
      : ex
  ));
});

channel.on('trading_pairs_synced', (payload) => {
  // Update pairs count
  setExchanges(prev => prev.map(ex =>
    ex.id === payload.exchange_id
      ? { ...ex, pairs_count: payload.pairs_count }
      : ex
  ));

  toast.info(`${payload.exchange_code} pairs synced: ${payload.pairs_count}`);
});

channel.join()
  .receive('ok', () => console.log('Joined exchange:health:all'))
  .receive('error', (err) => console.error('Failed to join', err));
```

---

## Phoenix GenServer: `ExchangeHealthMonitor`

**Purpose:** Periodically check health of all active exchanges and broadcast status updates.

**Implementation:**

```elixir
defmodule TradeEngine.Exchange.HealthMonitor do
  use GenServer

  @health_check_interval :timer.seconds(10) # 10 seconds

  def init(_opts) do
    schedule_health_checks()
    {:ok, %{}}
  end

  def handle_info(:check_all_exchanges, state) do
    exchanges = Repo.all(from e in PlatformExchange, where: e.is_active == true)

    Enum.each(exchanges, fn exchange ->
      result = perform_health_check(exchange)

      # Update database
      Repo.update!(PlatformExchange.changeset(exchange, %{
        connection_status: result.status,
        last_health_check_at: DateTime.utc_now(),
        last_ping_ms: result.ping_ms
      }))

      # Broadcast to all admins
      Phoenix.PubSub.broadcast(
        TradeEngine.PubSub,
        "exchange:health:all",
        {:exchange_health_update, %{
          exchange_id: exchange.id,
          exchange_code: exchange.exchange_code,
          connection_status: result.status,
          last_ping_ms: result.ping_ms,
          last_health_check_at: DateTime.utc_now() |> DateTime.to_iso8601(),
          checked_by: "system"
        }}
      )
    end)

    schedule_health_checks()
    {:noreply, state}
  end

  defp perform_health_check(exchange) do
    credentials = decrypt_credentials(exchange.credentials_encrypted)
    start_time = System.monotonic_time(:millisecond)

    # Exchange-specific health check
    case exchange.exchange_code do
      "binance" -> check_binance(credentials)
      "bybit" -> check_bybit(credentials)
      "okx" -> check_okx(credentials)
      "kraken" -> check_kraken(credentials)
      "kucoin" -> check_kucoin(credentials)
      _ -> {:error, "Unknown exchange"}
    end
  end

  defp check_binance(credentials) do
    ping_ms = call_exchange_api("https://api.binance.com/api/v3/ping", credentials)

    cond do
      ping_ms < 500 -> %{status: "connected", ping_ms: ping_ms}
      ping_ms < 2000 -> %{status: "degraded", ping_ms: ping_ms}
      true -> %{status: "disconnected", ping_ms: nil}
    end
  end

  # Similar for other exchanges...

  defp schedule_health_checks do
    Process.send_after(self(), :check_all_exchanges, @health_check_interval)
  end
end
```

---

## Data Flow Summary

```
[Page Load]
   │
   ├─> GET /api/settings/exchanges (NestJS)
   │     │
   │     ├─> Query exchange.platform_exchanges (PostgreSQL)
   │     ├─> Calculate KPIs (connected, degraded, pairs, latency)
   │     └─> Return { exchanges[], kpis{} }
   │
   └─> Join Phoenix Channel "exchange:health:all"
         │
         └─> Subscribe to real-time health updates

[Every 10 seconds - Background]
   │
   └─> ExchangeHealthMonitor GenServer (Phoenix)
         │
         ├─> Query all active exchanges from DB
         ├─> For each exchange:
         │     ├─> Decrypt credentials (pgcrypto)
         │     ├─> Call exchange health endpoint (HTTP)
         │     ├─> Update exchange.platform_exchanges (connection_status, last_ping_ms)
         │     └─> Broadcast via PubSub → "exchange:health:all"
         │
         └─> All connected admin clients receive exchange_health_update event

[Admin Action: Test Connection]
   │
   ├─> POST /api/settings/exchanges/:id/test-connection (NestJS)
   │     │
   │     └─> Proxy to POST /api/phoenix/exchanges/:id/health-check (Phoenix)
   │           │
   │           ├─> ExchangeHealthMonitor.test_connection(exchange_id)
   │           ├─> Perform immediate health check
   │           ├─> Update DB + Insert exchange_health_checks record
   │           ├─> Broadcast exchange_health_update event
   │           └─> Return result to admin
   │
   └─> All connected admins see updated status in real-time

[Admin Action: Reveal Credentials]
   │
   └─> POST /api/settings/exchanges/:id/reveal-credentials (NestJS)
         │
         ├─> Decrypt credentials_encrypted using pgcrypto
         ├─> Log audit trail (admin_user_id, action, timestamp)
         └─> Return plaintext credentials to admin (HTTPS only)

[Admin Action: Rotate Credentials]
   │
   └─> POST /api/settings/exchanges/:id/rotate-credentials (NestJS)
         │
         ├─> Encrypt new credentials using pgcrypto
         ├─> Update exchange.platform_exchanges.credentials_encrypted
         ├─> Log audit trail
         ├─> Trigger immediate health check
         └─> Broadcast exchange_health_update to all admins

[Admin Action: Update Config (rate limit, env, max orders)]
   │
   └─> PUT /api/settings/exchanges/:id (NestJS)
         │
         ├─> Update exchange.platform_exchanges
         ├─> Log audit trail
         └─> Return updated exchange object
```

---

## Summary Table

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Exchange list with metadata | `exchange.platform_exchanges` | NestJS REST | HTTP | No cache |
| KPIs (connected, degraded, pairs, latency) | Aggregated queries | NestJS REST | HTTP | No cache |
| Connection status (live) | Phoenix ETS → PubSub | Phoenix GenServer | WebSocket | ETS (10s TTL) |
| Encrypted credentials | `exchange.platform_exchanges.credentials_encrypted` | NestJS REST + pgcrypto | HTTP | No cache (decrypt on-demand) |
| Health check history | `exchange.exchange_health_checks` | NestJS REST | HTTP | No cache |
| Test connection (manual) | Phoenix GenServer → Exchange API | Phoenix REST | HTTP | No cache |
| Update config | `exchange.platform_exchanges` UPDATE | NestJS REST | HTTP | No cache |
| Rotate credentials | NestJS service → PostgreSQL update | NestJS REST | HTTP | No cache |
| Add new exchange | `exchange.platform_exchanges` INSERT | NestJS REST | HTTP | No cache |

---

## Performance Considerations

1. **Credential Decryption:** Use pgcrypto for encryption/decryption. Only decrypt on-demand when admin clicks "Reveal" or during credential rotation. Never store plaintext credentials.

2. **Health Checks:** Run every 10 seconds to provide near real-time status. Rate limit manual health checks to 1 per exchange per minute.

3. **WebSocket Scalability:** Channel `exchange:health:all` is a broadcast channel. All admins viewing the page receive the same updates. Use Phoenix Presence to track active viewers if needed.

4. **Trading Pairs Sync:** Fetch trading pairs in background job (not blocking). Store in `exchange.exchange_trading_pairs` table and update `pairs_count` after sync.

5. **Latency Calculation:** Calculate average latency from last 5 minutes of health checks using rolling window query on `exchange.exchange_health_checks`.

---

## Testing Checklist

- [ ] Exchange list loads with correct metadata (name, logo, color, abbr, fees)
- [ ] KPI cards display accurate aggregated data
- [ ] Connection status updates in real-time for all admins viewing the page
- [ ] Admin can expand/collapse exchange cards
- [ ] Admin can reveal credentials with proper authentication and audit logging
- [ ] Admin can test connection and receive real-time result
- [ ] Admin can rotate credentials and new credentials are encrypted correctly
- [ ] Admin can update rate limit, environment, max open orders
- [ ] Save changes persists configuration to database
- [ ] Add new exchange flow creates encrypted credentials and triggers initial health check
- [ ] WebSocket reconnects automatically on disconnect
- [ ] Audit logs capture all credential access and rotation events
- [ ] Exchange logos load correctly or fallback to abbreviation
- [ ] Health checks run every 10 seconds in background via GenServer
- [ ] Degraded status shows when latency > 500ms
- [ ] Disconnected status shows when health check fails

---

**[← Previous: Compliance](./24-settings-compliance.md)** | **[Back to Index](./00-INDEX.md)**
