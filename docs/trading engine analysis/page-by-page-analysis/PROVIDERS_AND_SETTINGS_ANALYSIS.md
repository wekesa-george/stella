# KYC Providers & Settings Pages Analysis

**Document Version:** 1.0
**Last Updated:** February 21, 2026
**Purpose:** Comprehensive data source analysis for KYC Providers and Settings section pages
**Pages Analyzed:** 3 pages (/kyc-review/providers, /settings, /settings/subscriptions)

---

## Table of Contents

1. [Page 1: `/kyc-review/providers` - KYC Providers](#page-1-kyc-reviewproviders---kyc-providers)
2. [Page 2: `/settings` - Settings Overview](#page-2-settings---settings-overview)
3. [Page 3: `/settings/subscriptions` - Subscription Management](#page-3-settingssubscriptions---subscription-management)
4. [Cross-Page Data Dependencies](#cross-page-data-dependencies)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Summary Tables](#summary-tables)

---

## Page 1: `/kyc-review/providers` - KYC Providers

**Route:** `/kyc-review/providers`
**Page Type:** Configuration Management
**User Persona:** Platform Admin
**Real-time Requirements:** Yes (connection health monitoring)

### UI Features & Requirements

**Mock Data Structure from page.tsx:7-38:**
```typescript
const PROVIDERS = {
  sumsub: {
    name: "SumSub",
    color: "#0BA8E0",
    bg: "#0BA8E020",
    abbr: "SS",
    logo: "sumsub.png",
    docs: "https://developers.sumsub.com",
    workflows: ["standard-kyc", "enhanced-due-diligence", "poa-check", "liveness-only"],
    regions: ["East Africa", "Southern Africa"],
  },
  onfido: {
    name: "Onfido",
    color: "#3B46FF",
    bg: "#3B46FF20",
    abbr: "ON",
    logo: "Onfido.png",
    docs: "https://documentation.onfido.com",
    workflows: ["us-standard", "us-enhanced", "us-accredited-investor"],
    regions: ["United States"],
  },
  persona: {
    name: "Persona",
    color: "#7C5CFC",
    bg: "#7C5CFC20",
    abbr: "PS",
    logo: "persona.jpg",
    docs: "https://docs.withpersona.com",
    workflows: ["global-standard", "aml-enhanced"],
    regions: ["European Union", "Rest of World"],
  },
};
```

**UI Components:**

1. **KPI Cards** (page.tsx:72-77)
   - Connected Providers: `"3"` with list `"SumSub · Onfido · Persona"`
   - Regions Covered: `"6"` with `"46 countries + Rest of World fallback"`
   - Avg Response Time: `"1.4s"` with stability delta
   - Webhook Success Rate: `"99.7%"` last 24 hours

2. **Provider Cards** (page.tsx:80-211)
   - Provider name, logo/abbr, regions served
   - Connection status: `connected` | `degraded` | `disconnected`
   - Credential fields (masked): App Token/Client ID, Secret Key
   - Webhook URL: `https://api.stella.io/webhooks/{key}`
   - Workflows: Array of workflow IDs
   - Last checked: Relative time (e.g., "2 min ago")

3. **Actions** (page.tsx:188-208)
   - Show/Hide credentials (admin only)
   - Test Connection (admin only)
   - View Docs (external link)
   - Rotate Keys (admin only)

4. **Add Provider CTA** (page.tsx:214-222)
   - Admin-only button to connect new providers

### Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| **KPI: Connected Providers** | Count, provider names | `compliance.kyc_providers WHERE is_active = true` | REST API | On page load |
| **KPI: Regions Covered** | Count of regions, country count | `compliance.kyc_regions` aggregate | REST API | On page load |
| **KPI: Avg Response Time** | Response time in ms, delta | `compliance.provider_health_checks` aggregate | REST API | On page load, WebSocket updates |
| **KPI: Webhook Success Rate** | Success percentage (24h) | `compliance.provider_webhook_logs WHERE created_at > NOW() - INTERVAL '24 hours'` | REST API | On page load |
| **Provider Cards: Metadata** | name, logo, docs URL, workflows, regions | `compliance.kyc_providers` | REST API | On page load |
| **Provider Cards: Status** | connection_status (enum) | Phoenix ETS cache (`ProviderHealthMonitor` GenServer) | WebSocket | Every 30 seconds |
| **Provider Cards: Credentials** | app_token (encrypted), secret_key (encrypted) | `compliance.kyc_providers.credentials_encrypted` | REST API | On reveal (admin auth) |
| **Provider Cards: Last Checked** | last_health_check_at | `compliance.kyc_providers` | REST API + WebSocket | On page load + live updates |
| **Test Connection** | Health check result | Phoenix `ProviderHealthMonitor.test_connection/1` | REST API | On demand |
| **Rotate Keys** | New credentials | NestJS `/api/kyc/providers/:id/rotate-keys` | REST API | On demand |

### Database Schema Requirements

#### New Tables

**1. `compliance.kyc_providers`**

```sql
CREATE TABLE compliance.kyc_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL, -- 'sumsub', 'onfido', 'persona'
  name VARCHAR(255) NOT NULL,
  logo_url VARCHAR(500),
  color VARCHAR(7), -- Hex color for UI
  bg_color VARCHAR(9), -- Hex color with opacity
  abbr VARCHAR(3),
  docs_url VARCHAR(500),
  workflows JSONB NOT NULL DEFAULT '[]', -- Array of workflow IDs

  -- Encrypted credentials (using pgcrypto)
  credentials_encrypted BYTEA NOT NULL, -- Stores JSON: { app_token, secret_key, webhook_secret }

  -- Health monitoring
  connection_status VARCHAR(50) NOT NULL DEFAULT 'disconnected',
    CHECK (connection_status IN ('connected', 'degraded', 'disconnected')),
  last_health_check_at TIMESTAMPTZ,
  avg_response_time_ms INTEGER, -- Rolling 24h average
  webhook_success_rate DECIMAL(5,2), -- Percentage, recalculated daily

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT kyc_provider_code_lowercase CHECK (code = LOWER(code))
);

CREATE INDEX idx_kyc_providers_active ON compliance.kyc_providers (is_active) WHERE is_active = true;
CREATE INDEX idx_kyc_providers_status ON compliance.kyc_providers (connection_status);
```

**2. `compliance.provider_health_checks`**

```sql
CREATE TABLE compliance.provider_health_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES compliance.kyc_providers(id) ON DELETE CASCADE,

  check_type VARCHAR(50) NOT NULL, -- 'scheduled', 'manual', 'post-webhook'
  response_time_ms INTEGER,
  status_code INTEGER, -- HTTP status or custom code
  is_healthy BOOLEAN NOT NULL,
  error_message TEXT,

  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by_user_id UUID REFERENCES auth.users(id), -- NULL for scheduled checks

  CONSTRAINT health_check_response_time_positive CHECK (response_time_ms >= 0)
);

CREATE INDEX idx_provider_health_provider ON compliance.provider_health_checks (provider_id, checked_at DESC);
CREATE INDEX idx_provider_health_recent ON compliance.provider_health_checks (checked_at DESC) WHERE checked_at > NOW() - INTERVAL '24 hours';
```

**3. `compliance.provider_webhook_logs`** (Already defined in KYC_REVIEW_SECTION_ANALYSIS.md, reference here)

Used to calculate webhook success rate.

```sql
-- Query for webhook success rate (last 24h)
SELECT
  provider_id,
  COUNT(*) FILTER (WHERE response_status = 'success') * 100.0 / COUNT(*) AS success_rate_pct
FROM compliance.provider_webhook_logs
WHERE received_at > NOW() - INTERVAL '24 hours'
GROUP BY provider_id;
```

#### Schema Extensions

**Update `compliance.kyc_regions` to reference providers:**

```sql
ALTER TABLE compliance.kyc_regions
  ADD COLUMN provider_id UUID REFERENCES compliance.kyc_providers(id) ON DELETE SET NULL;

CREATE INDEX idx_kyc_regions_provider ON compliance.kyc_regions (provider_id);
```

This links regions to providers for the "Regions Covered" KPI.

### NestJS REST API Endpoints

#### 1. `GET /api/kyc/providers` - List All Providers

**Purpose:** Load all KYC providers with metadata and health stats
**Authentication:** Admin role required
**Response:**

```typescript
interface KycProviderResponse {
  id: string;
  code: string; // 'sumsub', 'onfido', 'persona'
  name: string;
  logo_url: string | null;
  color: string;
  bg_color: string;
  abbr: string;
  docs_url: string;
  workflows: string[]; // Array of workflow IDs
  regions: string[]; // Array of region names assigned to this provider

  connection_status: 'connected' | 'degraded' | 'disconnected';
  last_health_check_at: string; // ISO timestamp
  avg_response_time_ms: number;
  webhook_success_rate: number; // Percentage 0-100

  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// GET /api/kyc/providers
{
  "providers": KycProviderResponse[],
  "kpis": {
    "connected_providers_count": 3,
    "connected_providers_names": "SumSub · Onfido · Persona",
    "regions_covered_count": 6,
    "countries_covered_count": 46,
    "avg_response_time_ms": 1400,
    "avg_response_time_delta": 0, // Percentage change from yesterday
    "webhook_success_rate_24h": 99.7
  }
}
```

**Implementation:**

```typescript
// NestJS Service
async getProviders(): Promise<{ providers: KycProviderResponse[]; kpis: any }> {
  const providers = await this.providerRepo.find({
    where: { is_active: true },
    relations: ['regions'],
  });

  const kpis = await this.calculateProviderKpis();

  return {
    providers: providers.map(p => ({
      ...p,
      regions: p.regions.map(r => r.name),
      // credentials_encrypted is excluded for security
    })),
    kpis,
  };
}

private async calculateProviderKpis() {
  // Query aggregates from provider_health_checks and webhook_logs
  const connectedCount = await this.providerRepo.count({
    where: { connection_status: 'connected' }
  });

  const regionsCount = await this.regionRepo
    .createQueryBuilder('region')
    .select('COUNT(DISTINCT region.id)', 'count')
    .innerJoin('region.provider', 'provider')
    .where('provider.is_active = :active', { active: true })
    .getRawOne();

  // ... calculate other KPIs

  return { connected_providers_count: connectedCount, /* ... */ };
}
```

#### 2. `POST /api/kyc/providers/:id/reveal-credentials` - Reveal Encrypted Credentials

**Purpose:** Decrypt and return provider credentials (admin only)
**Authentication:** Admin role + audit logging
**Request:**

```typescript
// POST /api/kyc/providers/550e8400-e29b-41d4-a716-446655440000/reveal-credentials
// No body required
```

**Response:**

```typescript
{
  "app_token": "live_REDACTED...",
  "secret_key": "REDACTED",
  "webhook_secret": "whsec_abc123..."
}
```

**Implementation:**

```typescript
async revealCredentials(providerId: string, adminUserId: string) {
  const provider = await this.providerRepo.findOneOrFail({ where: { id: providerId } });

  // Decrypt using pgcrypto
  const decrypted = await this.db.query(
    `SELECT pgp_sym_decrypt($1, $2) AS credentials`,
    [provider.credentials_encrypted, process.env.KYC_ENCRYPTION_KEY]
  );

  // Log audit trail
  await this.auditService.log({
    action: 'kyc_credentials_revealed',
    resource_type: 'kyc_provider',
    resource_id: providerId,
    admin_user_id: adminUserId,
    metadata: { provider_code: provider.code },
  });

  return JSON.parse(decrypted[0].credentials);
}
```

#### 3. `POST /api/kyc/providers/:id/test-connection` - Test Provider Health

**Purpose:** Manually trigger health check for a provider
**Authentication:** Admin role
**Request:**

```typescript
// POST /api/kyc/providers/550e8400-e29b-41d4-a716-446655440000/test-connection
// No body required
```

**Response:**

```typescript
{
  "provider_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_healthy": true,
  "response_time_ms": 342,
  "status_code": 200,
  "checked_at": "2026-02-21T10:30:00Z",
  "message": "Provider is responding normally"
}
```

**Implementation:**

```typescript
async testConnection(providerId: string, adminUserId: string) {
  const provider = await this.providerRepo.findOneOrFail({ where: { id: providerId } });

  // Call Phoenix GenServer to perform health check
  const result = await this.phoenixClient.post(
    `/api/phoenix/kyc/providers/${providerId}/health-check`,
    { checked_by: adminUserId }
  );

  // Phoenix will update ETS cache and broadcast via WebSocket
  return result.data;
}
```

#### 4. `POST /api/kyc/providers/:id/rotate-keys` - Rotate Provider Credentials

**Purpose:** Update provider API credentials
**Authentication:** Admin role + MFA required
**Request:**

```typescript
{
  "app_token": "new_live_token_abc123",
  "secret_key": "new_sk_live_xyz789",
  "webhook_secret": "new_whsec_abc123"
}
```

**Response:**

```typescript
{
  "provider_id": "550e8400-e29b-41d4-a716-446655440000",
  "rotated_at": "2026-02-21T10:35:00Z",
  "message": "Credentials rotated successfully. Test connection to verify."
}
```

**Implementation:**

```typescript
async rotateKeys(
  providerId: string,
  credentials: { app_token: string; secret_key: string; webhook_secret: string },
  adminUserId: string
) {
  // Encrypt new credentials using pgcrypto
  const encrypted = await this.db.query(
    `SELECT pgp_sym_encrypt($1, $2) AS credentials_encrypted`,
    [JSON.stringify(credentials), process.env.KYC_ENCRYPTION_KEY]
  );

  // Update provider
  await this.providerRepo.update(providerId, {
    credentials_encrypted: encrypted[0].credentials_encrypted,
    updated_at: new Date(),
  });

  // Log audit trail
  await this.auditService.log({
    action: 'kyc_credentials_rotated',
    resource_type: 'kyc_provider',
    resource_id: providerId,
    admin_user_id: adminUserId,
  });

  // Trigger health check with new credentials
  await this.testConnection(providerId, adminUserId);

  return { provider_id: providerId, rotated_at: new Date().toISOString() };
}
```

#### 5. `POST /api/kyc/providers` - Add New Provider

**Purpose:** Connect a new KYC provider
**Authentication:** Admin role
**Request:**

```typescript
{
  "code": "veriff",
  "name": "Veriff",
  "logo_url": "https://cdn.stella.io/providers/veriff.png",
  "color": "#FF5733",
  "bg_color": "#FF573320",
  "abbr": "VF",
  "docs_url": "https://developers.veriff.com",
  "workflows": ["kyc-standard", "kyc-plus"],
  "credentials": {
    "app_token": "veriff_token_abc123",
    "secret_key": "REDACTED",
    "webhook_secret": "veriff_whsec_abc"
  }
}
```

**Response:**

```typescript
{
  "provider": KycProviderResponse, // Full provider object
  "message": "Provider added successfully. Configure regions in /kyc-review/regions."
}
```

**Implementation:**

```typescript
async addProvider(data: CreateProviderDto, adminUserId: string) {
  // Encrypt credentials
  const encrypted = await this.db.query(
    `SELECT pgp_sym_encrypt($1, $2) AS credentials_encrypted`,
    [JSON.stringify(data.credentials), process.env.KYC_ENCRYPTION_KEY]
  );

  // Create provider
  const provider = await this.providerRepo.save({
    code: data.code.toLowerCase(),
    name: data.name,
    logo_url: data.logo_url,
    color: data.color,
    bg_color: data.bg_color,
    abbr: data.abbr,
    docs_url: data.docs_url,
    workflows: data.workflows,
    credentials_encrypted: encrypted[0].credentials_encrypted,
    is_active: true,
  });

  // Log audit
  await this.auditService.log({
    action: 'kyc_provider_added',
    resource_type: 'kyc_provider',
    resource_id: provider.id,
    admin_user_id: adminUserId,
    metadata: { provider_code: provider.code },
  });

  // Trigger initial health check
  await this.testConnection(provider.id, adminUserId);

  return { provider, message: 'Provider added successfully' };
}
```

### Phoenix Channel: `kyc:providers`

**Topic Pattern:** `kyc:providers:all`

**Purpose:** Broadcast real-time provider health updates to all admins viewing the providers page.

**WebSocket Events:**

```typescript
// Server → Client: Provider health status changed
interface ProviderHealthUpdateEvent {
  event: 'provider_health_update';
  payload: {
    provider_id: string;
    provider_code: string;
    connection_status: 'connected' | 'degraded' | 'disconnected';
    avg_response_time_ms: number;
    last_health_check_at: string; // ISO timestamp
    checked_by: 'system' | 'manual'; // 'manual' if admin triggered
  };
}

// Server → Client: Webhook success rate recalculated
interface WebhookStatsUpdateEvent {
  event: 'webhook_stats_update';
  payload: {
    provider_id: string;
    webhook_success_rate_24h: number; // Percentage
    total_webhooks_24h: number;
    failed_webhooks_24h: number;
  };
}

// Client → Server: Subscribe to provider updates
interface SubscribeRequest {
  event: 'subscribe';
  payload: {
    admin_user_id: string;
  };
}
```

**Frontend Implementation:**

```typescript
// Connect to Phoenix Channel
const socket = new Socket('/socket', { params: { token: userToken } });
socket.connect();

const channel = socket.channel('kyc:providers:all', { admin_user_id: currentUser.id });

channel.on('provider_health_update', (payload) => {
  // Update provider card connection status in React state
  setProviders(prev => prev.map(p =>
    p.id === payload.provider_id
      ? { ...p, connection_status: payload.connection_status, last_health_check_at: payload.last_health_check_at }
      : p
  ));
});

channel.on('webhook_stats_update', (payload) => {
  // Update KPI card for webhook success rate
  setKpis(prev => ({
    ...prev,
    webhook_success_rate_24h: payload.webhook_success_rate_24h,
  }));
});

channel.join()
  .receive('ok', () => console.log('Joined kyc:providers:all'))
  .receive('error', (err) => console.error('Failed to join', err));
```

### Phoenix GenServer: `ProviderHealthMonitor`

**Purpose:** Periodically check health of all active KYC providers and broadcast status updates.

**State:**

```elixir
defmodule TradeEngine.Kyc.ProviderHealthMonitor do
  use GenServer

  @health_check_interval :timer.minutes(30) # 30 minutes

  def init(_opts) do
    schedule_health_checks()
    {:ok, %{}}
  end

  def handle_info(:check_all_providers, state) do
    providers = Repo.all(from p in KycProvider, where: p.is_active == true)

    Enum.each(providers, fn provider ->
      result = perform_health_check(provider)

      # Update database
      Repo.update!(KycProvider.changeset(provider, %{
        connection_status: result.status,
        last_health_check_at: DateTime.utc_now(),
        avg_response_time_ms: result.response_time_ms
      }))

      # Broadcast to all admins
      Phoenix.PubSub.broadcast(
        TradeEngine.PubSub,
        "kyc:providers:all",
        {:provider_health_update, %{
          provider_id: provider.id,
          provider_code: provider.code,
          connection_status: result.status,
          avg_response_time_ms: result.response_time_ms,
          last_health_check_at: DateTime.utc_now() |> DateTime.to_iso8601(),
          checked_by: "system"
        }}
      )
    end)

    schedule_health_checks()
    {:noreply, state}
  end

  defp perform_health_check(provider) do
    credentials = decrypt_credentials(provider.credentials_encrypted)

    # Provider-specific health check endpoints
    case provider.code do
      "sumsub" -> check_sumsub(credentials)
      "onfido" -> check_onfido(credentials)
      "persona" -> check_persona(credentials)
      _ -> {:error, "Unknown provider"}
    end
  end

  defp check_sumsub(credentials) do
    start_time = System.monotonic_time(:millisecond)

    # Call SumSub health endpoint
    case HTTPoison.get("https://api.sumsub.com/resources/health", [
      {"X-App-Token", credentials["app_token"]}
    ]) do
      {:ok, %{status_code: 200}} ->
        response_time = System.monotonic_time(:millisecond) - start_time
        %{status: "connected", response_time_ms: response_time}

      {:ok, %{status_code: status}} when status >= 500 ->
        %{status: "degraded", response_time_ms: nil}

      _ ->
        %{status: "disconnected", response_time_ms: nil}
    end
  end

  # Similar for Onfido and Persona...

  defp schedule_health_checks do
    Process.send_after(self(), :check_all_providers, @health_check_interval)
  end
end
```

### Data Flow Summary

```
[Page Load]
   │
   ├─> GET /api/kyc/providers (NestJS)
   │     │
   │     ├─> Query compliance.kyc_providers (PostgreSQL)
   │     ├─> Query compliance.kyc_regions (PostgreSQL)
   │     ├─> Calculate KPIs from provider_health_checks + webhook_logs
   │     └─> Return providers[] + kpis{}
   │
   └─> Join Phoenix Channel "kyc:providers:all"
         │
         └─> Subscribe to real-time health updates

[Every 30 minutes - Background]
   │
   └─> ProviderHealthMonitor GenServer (Phoenix)
         │
         ├─> Query all active providers from DB
         ├─> For each provider:
         │     ├─> Decrypt credentials (pgcrypto)
         │     ├─> Call provider health endpoint (HTTP)
         │     ├─> Update compliance.kyc_providers (connection_status, avg_response_time_ms)
         │     └─> Broadcast via PubSub → "kyc:providers:all"
         │
         └─> All connected admin clients receive provider_health_update event

[Admin Action: Test Connection]
   │
   ├─> POST /api/kyc/providers/:id/test-connection (NestJS)
   │     │
   │     └─> Proxy to POST /api/phoenix/kyc/providers/:id/health-check (Phoenix)
   │           │
   │           ├─> ProviderHealthMonitor.test_connection(provider_id)
   │           ├─> Perform immediate health check
   │           ├─> Update DB + Insert provider_health_checks record
   │           ├─> Broadcast provider_health_update event
   │           └─> Return result to admin
   │
   └─> All connected admins see updated status in real-time

[Admin Action: Reveal Credentials]
   │
   └─> POST /api/kyc/providers/:id/reveal-credentials (NestJS)
         │
         ├─> Decrypt credentials_encrypted using pgcrypto
         ├─> Log audit trail (admin_user_id, action, timestamp)
         └─> Return plaintext credentials to admin (HTTPS only)

[Admin Action: Rotate Keys]
   │
   └─> POST /api/kyc/providers/:id/rotate-keys (NestJS)
         │
         ├─> Encrypt new credentials using pgcrypto
         ├─> Update compliance.kyc_providers.credentials_encrypted
         ├─> Log audit trail
         ├─> Trigger immediate health check
         └─> Broadcast provider_health_update to all admins
```

### Summary Table: `/kyc-review/providers`

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Provider list with metadata | `compliance.kyc_providers` | NestJS REST | HTTP | No cache (on-demand load) |
| KPIs (connected count, regions, etc.) | Aggregated queries on providers, regions, health_checks | NestJS REST | HTTP | No cache |
| Connection status (live) | Phoenix ETS → PubSub | Phoenix GenServer | WebSocket | ETS (30s TTL) |
| Encrypted credentials | `compliance.kyc_providers.credentials_encrypted` | NestJS REST + pgcrypto | HTTP | No cache (decrypt on-demand) |
| Health check history | `compliance.provider_health_checks` | NestJS REST | HTTP | No cache |
| Webhook success rate | `compliance.provider_webhook_logs` (24h aggregate) | NestJS REST | HTTP | PostgreSQL materialized view (refresh every 1h) |
| Test connection (manual) | Phoenix GenServer → Provider API | Phoenix REST | HTTP | No cache |
| Rotate keys | NestJS service → PostgreSQL update | NestJS REST | HTTP | No cache |

### Frontend Implementation Notes

**WebSocket Connection:**

```typescript
// hooks/useKycProviders.ts
export function useKycProviders() {
  const [providers, setProviders] = useState<KycProvider[]>([]);
  const [kpis, setKpis] = useState<KycKpis | null>(null);
  const { socket } = usePhoenixSocket();

  useEffect(() => {
    // Initial load via REST API
    fetch('/api/kyc/providers')
      .then(res => res.json())
      .then(data => {
        setProviders(data.providers);
        setKpis(data.kpis);
      });

    // Subscribe to real-time updates
    if (!socket) return;

    const channel = socket.channel('kyc:providers:all', {
      admin_user_id: currentUser.id
    });

    channel.on('provider_health_update', (payload) => {
      setProviders(prev => prev.map(p =>
        p.id === payload.provider_id
          ? {
              ...p,
              connection_status: payload.connection_status,
              avg_response_time_ms: payload.avg_response_time_ms,
              last_health_check_at: payload.last_health_check_at,
            }
          : p
      ));
    });

    channel.on('webhook_stats_update', (payload) => {
      setKpis(prev => prev ? {
        ...prev,
        webhook_success_rate_24h: payload.webhook_success_rate_24h,
      } : null);
    });

    channel.join();

    return () => { channel.leave(); };
  }, [socket]);

  return { providers, kpis };
}
```

**Test Connection Action:**

```typescript
async function testConnection(providerId: string) {
  setTesting(prev => ({ ...prev, [providerId]: true }));

  try {
    const response = await fetch(`/api/kyc/providers/${providerId}/test-connection`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const result = await response.json();

    // Result will also broadcast via WebSocket to all admins
    toast.success(`Health check: ${result.message}`);
  } catch (error) {
    toast.error('Health check failed');
  } finally {
    setTesting(prev => ({ ...prev, [providerId]: false }));
    setTested(prev => ({ ...prev, [providerId]: true }));
  }
}
```

### Performance Considerations

1. **Credential Decryption:** Use pgcrypto for encryption/decryption. Only decrypt on-demand when admin clicks "Show" or during credential rotation. Never store plaintext credentials in logs or cache.

2. **Health Checks:** Run every 30 minutes to avoid excessive API calls to third-party providers. Allow manual health checks but rate-limit to 1 per provider per 5 minutes.

3. **Webhook Success Rate:** Pre-calculate using a PostgreSQL materialized view refreshed every 1 hour to avoid expensive aggregation queries on every page load.

```sql
CREATE MATERIALIZED VIEW compliance.provider_webhook_stats_24h AS
SELECT
  provider_id,
  COUNT(*) FILTER (WHERE response_status = 'success') * 100.0 / NULLIF(COUNT(*), 0) AS success_rate_pct,
  COUNT(*) AS total_webhooks,
  COUNT(*) FILTER (WHERE response_status = 'failure') AS failed_webhooks
FROM compliance.provider_webhook_logs
WHERE received_at > NOW() - INTERVAL '24 hours'
GROUP BY provider_id;

-- Refresh every hour via cron job or Phoenix GenServer
REFRESH MATERIALIZED VIEW compliance.provider_webhook_stats_24h;
```

4. **WebSocket Scalability:** Channel `kyc:providers:all` is a broadcast channel. All admins viewing the page receive the same updates. Use Phoenix Presence to track active viewers if needed for analytics.

### Testing Checklist

- [ ] Provider list loads with correct metadata (name, logo, regions, workflows)
- [ ] KPI cards display accurate aggregated data
- [ ] Connection status updates in real-time for all admins viewing the page
- [ ] Admin can reveal credentials with proper authentication and audit logging
- [ ] Admin can test connection and receive real-time result
- [ ] Admin can rotate keys and new credentials are encrypted correctly
- [ ] Non-admin users see read-only view (no reveal/test/rotate buttons)
- [ ] Health checks run every 30 minutes in background via GenServer
- [ ] Webhook success rate is calculated accurately from last 24h of logs
- [ ] Add new provider flow creates encrypted credentials and triggers initial health check
- [ ] WebSocket reconnects automatically on disconnect
- [ ] Audit logs capture all credential access and rotation events
- [ ] Provider logos load correctly or fallback to abbreviation

---

## Page 2: `/settings` - Settings Overview

**Route:** `/settings`
**Page Type:** Redirect Page
**User Persona:** Admin
**Real-time Requirements:** No

### UI Features & Requirements

**Mock Data Structure from page.tsx:1-5:**

```typescript
export default function SettingsPage() {
  redirect("/settings/risk");
}
```

**Analysis:**

This page is a simple redirect to `/settings/risk`. No data requirements.

### Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| Redirect only | None | Client-side redirect | N/A | N/A |

### Implementation Notes

No backend implementation required. This is a Next.js client-side redirect.

**Frontend Implementation:**

```typescript
// app/settings/page.tsx
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/risk");
}
```

### Summary Table: `/settings`

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Redirect to /settings/risk | N/A | Next.js router | Client-side | N/A |

---

## Page 3: `/settings/subscriptions` - Subscription Management

**Route:** `/settings/subscriptions`
**Page Type:** Admin Configuration (CRUD)
**User Persona:** Platform Admin
**Real-time Requirements:** No (form-based updates)

### UI Features & Requirements

**Mock Data Structure from page.tsx:8-12:**

```typescript
const tiers = [
  {
    key: "basic",
    name: "Basic",
    price: "$29/mo",
    color: "#5a7090",
    bots: 2,
    aum: "$10,000",
    exchanges: 2,
    strategies: 2,
    api: false,
    support: "Email"
  },
  {
    key: "pro",
    name: "Pro",
    price: "$99/mo",
    color: "#00e5a0",
    bots: 10,
    aum: "$100,000",
    exchanges: 5,
    strategies: "All",
    api: true,
    support: "Priority Email"
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    color: "#f5a623",
    bots: "Unlimited",
    aum: "Unlimited",
    exchanges: "All",
    strategies: "All",
    api: true,
    support: "Dedicated"
  },
];
```

**UI Components:**

1. **Tier Cards** (page.tsx:42-85)
   - Tier name, price, color
   - Limits: Max Bots, Max AUM, Exchanges, Strategies, API Access, Support
   - Edit Tier button (admin only)
   - Add Tier button (admin only)

2. **Upgrade Policy Form** (page.tsx:88-170)
   - Tier Upgrade Method (dropdown): `Automatic on payment` | `Manual approval required` | `Automatic with KYC gate`
   - Trial Period (days): Integer (default: 14)
   - Grace Period on Failed Payment (days): Integer (default: 3)
   - Enhanced KYC AUM Threshold (UGX): Integer (default: 10,000,000)
   - Referral Commission (%): Integer (default: 10)
   - Toggles:
     - Enable trial period (boolean)
     - Enable referral programme (boolean)
     - Require KYC before trading (boolean)

3. **Dirty State Management** (page.tsx:6, 154-169)
   - Save Changes button (appears when form is dirty)
   - Discard Changes button (appears when form is dirty)

### Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| **Tier Cards** | key, name, price, color, bots, aum, exchanges, strategies, api, support | `platform.subscription_tiers` | REST API | On page load |
| **Tier Limits** | max_bots, max_aum, max_exchanges, max_strategies, api_access, support_level | `platform.subscription_tiers` | REST API | On page load |
| **Upgrade Policy: Tier Upgrade Method** | tier_upgrade_method (enum) | `platform.platform_settings` | REST API | On page load, updated on save |
| **Upgrade Policy: Trial Period** | trial_period_days (integer) | `platform.platform_settings` | REST API | On page load, updated on save |
| **Upgrade Policy: Grace Period** | grace_period_days (integer) | `platform.platform_settings` | REST API | On page load, updated on save |
| **Upgrade Policy: KYC AUM Threshold** | kyc_aum_threshold_ugx (bigint) | `platform.platform_settings` | REST API | On page load, updated on save |
| **Upgrade Policy: Referral Commission** | referral_commission_pct (decimal) | `platform.platform_settings` | REST API | On page load, updated on save |
| **Toggles** | enable_trial, enable_referral, require_kyc_before_trading (booleans) | `platform.platform_settings` | REST API | On page load, updated on save |
| **Add Tier** | New tier creation | `platform.subscription_tiers` | REST API | On demand |
| **Edit Tier** | Tier update | `platform.subscription_tiers` | REST API | On demand |

### Database Schema Requirements

#### New Tables

**1. `platform.subscription_tiers`**

```sql
CREATE TABLE platform.subscription_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier_key VARCHAR(50) UNIQUE NOT NULL, -- 'basic', 'pro', 'enterprise'
  name VARCHAR(100) NOT NULL,
  price_usd_cents INTEGER, -- NULL for "Custom" pricing
  price_display VARCHAR(50) NOT NULL, -- "$29/mo" or "Custom"
  color VARCHAR(7) NOT NULL, -- Hex color for UI

  -- Limits
  max_bots INTEGER, -- NULL for "Unlimited"
  max_aum_usd_cents BIGINT, -- NULL for "Unlimited"
  max_exchanges INTEGER, -- NULL for "All"
  max_strategies INTEGER, -- NULL for "All"
  api_access BOOLEAN NOT NULL DEFAULT false,
  support_level VARCHAR(100) NOT NULL, -- "Email", "Priority Email", "Dedicated"

  display_order INTEGER NOT NULL DEFAULT 0, -- For sorting tiers in UI
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tier_key_lowercase CHECK (tier_key = LOWER(tier_key)),
  CONSTRAINT tier_price_or_display CHECK (
    (price_usd_cents IS NOT NULL) OR (price_display = 'Custom')
  )
);

CREATE INDEX idx_subscription_tiers_active ON platform.subscription_tiers (is_active, display_order);
CREATE UNIQUE INDEX idx_subscription_tiers_key ON platform.subscription_tiers (tier_key);
```

**2. `platform.platform_settings`** (Singleton table with 1 row)

```sql
CREATE TABLE platform.platform_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Upgrade policy
  tier_upgrade_method VARCHAR(50) NOT NULL DEFAULT 'automatic_on_payment',
    CHECK (tier_upgrade_method IN ('automatic_on_payment', 'manual_approval', 'automatic_with_kyc_gate')),

  trial_period_days INTEGER NOT NULL DEFAULT 14,
    CHECK (trial_period_days >= 0),

  grace_period_days INTEGER NOT NULL DEFAULT 3,
    CHECK (grace_period_days >= 0),

  kyc_aum_threshold_ugx BIGINT NOT NULL DEFAULT 10000000,
    CHECK (kyc_aum_threshold_ugx >= 0),

  referral_commission_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    CHECK (referral_commission_pct >= 0 AND referral_commission_pct <= 100),

  -- Feature toggles
  enable_trial BOOLEAN NOT NULL DEFAULT true,
  enable_referral BOOLEAN NOT NULL DEFAULT false,
  require_kyc_before_trading BOOLEAN NOT NULL DEFAULT true,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_settings_row CHECK (id = id) -- Enforce singleton
);

-- Ensure only one row exists
CREATE UNIQUE INDEX idx_platform_settings_singleton ON platform.platform_settings ((1));

-- Insert default settings row
INSERT INTO platform.platform_settings (id)
VALUES (uuid_generate_v4())
ON CONFLICT DO NOTHING;
```

**3. Update `auth.users` to reference subscription tier:**

```sql
ALTER TABLE auth.users
  ADD COLUMN subscription_tier_id UUID REFERENCES platform.subscription_tiers(id),
  ADD COLUMN subscription_started_at TIMESTAMPTZ,
  ADD COLUMN subscription_expires_at TIMESTAMPTZ, -- NULL for active subscriptions
  ADD COLUMN trial_started_at TIMESTAMPTZ,
  ADD COLUMN trial_expires_at TIMESTAMPTZ;

CREATE INDEX idx_users_subscription_tier ON auth.users (subscription_tier_id);
CREATE INDEX idx_users_trial_expiring ON auth.users (trial_expires_at) WHERE trial_expires_at IS NOT NULL;
```

### NestJS REST API Endpoints

#### 1. `GET /api/settings/subscriptions` - Load Subscription Settings

**Purpose:** Load all subscription tiers and platform upgrade policy settings
**Authentication:** Admin role required
**Response:**

```typescript
interface SubscriptionSettingsResponse {
  tiers: SubscriptionTier[];
  upgrade_policy: {
    tier_upgrade_method: 'automatic_on_payment' | 'manual_approval' | 'automatic_with_kyc_gate';
    trial_period_days: number;
    grace_period_days: number;
    kyc_aum_threshold_ugx: number;
    referral_commission_pct: number;
    enable_trial: boolean;
    enable_referral: boolean;
    require_kyc_before_trading: boolean;
    updated_at: string; // ISO timestamp
    updated_by_user_id: string | null;
  };
}

interface SubscriptionTier {
  id: string;
  tier_key: string; // 'basic', 'pro', 'enterprise'
  name: string;
  price_usd_cents: number | null; // NULL for "Custom"
  price_display: string; // "$29/mo" or "Custom"
  color: string;
  max_bots: number | null; // NULL = Unlimited
  max_aum_usd_cents: number | null; // NULL = Unlimited
  max_exchanges: number | null; // NULL = All
  max_strategies: number | null; // NULL = All
  api_access: boolean;
  support_level: string;
  display_order: number;
  is_active: boolean;
}

// GET /api/settings/subscriptions
{
  "tiers": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "tier_key": "basic",
      "name": "Basic",
      "price_usd_cents": 2900,
      "price_display": "$29/mo",
      "color": "#5a7090",
      "max_bots": 2,
      "max_aum_usd_cents": 1000000, // $10,000
      "max_exchanges": 2,
      "max_strategies": 2,
      "api_access": false,
      "support_level": "Email",
      "display_order": 1,
      "is_active": true
    },
    // ... pro, enterprise
  ],
  "upgrade_policy": {
    "tier_upgrade_method": "automatic_on_payment",
    "trial_period_days": 14,
    "grace_period_days": 3,
    "kyc_aum_threshold_ugx": 10000000,
    "referral_commission_pct": 10.0,
    "enable_trial": true,
    "enable_referral": false,
    "require_kyc_before_trading": true,
    "updated_at": "2026-02-20T15:30:00Z",
    "updated_by_user_id": "660e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Implementation:**

```typescript
async getSubscriptionSettings(): Promise<SubscriptionSettingsResponse> {
  const tiers = await this.tierRepo.find({
    where: { is_active: true },
    order: { display_order: 'ASC' },
  });

  const settings = await this.settingsRepo.findOne({});

  if (!settings) {
    throw new Error('Platform settings not initialized');
  }

  return {
    tiers: tiers.map(t => ({
      ...t,
      // Convert "Unlimited"/"All" null values to UI strings
    })),
    upgrade_policy: {
      tier_upgrade_method: settings.tier_upgrade_method,
      trial_period_days: settings.trial_period_days,
      grace_period_days: settings.grace_period_days,
      kyc_aum_threshold_ugx: settings.kyc_aum_threshold_ugx,
      referral_commission_pct: settings.referral_commission_pct,
      enable_trial: settings.enable_trial,
      enable_referral: settings.enable_referral,
      require_kyc_before_trading: settings.require_kyc_before_trading,
      updated_at: settings.updated_at.toISOString(),
      updated_by_user_id: settings.updated_by_user_id,
    },
  };
}
```

#### 2. `PUT /api/settings/subscriptions/upgrade-policy` - Update Upgrade Policy

**Purpose:** Save changes to platform upgrade policy settings
**Authentication:** Admin role + audit logging
**Request:**

```typescript
{
  "tier_upgrade_method": "automatic_with_kyc_gate",
  "trial_period_days": 14,
  "grace_period_days": 3,
  "kyc_aum_threshold_ugx": 10000000,
  "referral_commission_pct": 10.0,
  "enable_trial": true,
  "enable_referral": false,
  "require_kyc_before_trading": true
}
```

**Response:**

```typescript
{
  "upgrade_policy": { /* Updated settings */ },
  "message": "Upgrade policy updated successfully"
}
```

**Implementation:**

```typescript
async updateUpgradePolicy(data: UpdateUpgradePolicyDto, adminUserId: string) {
  const settings = await this.settingsRepo.findOne({});

  if (!settings) {
    throw new Error('Platform settings not initialized');
  }

  // Update settings
  const updated = await this.settingsRepo.save({
    ...settings,
    tier_upgrade_method: data.tier_upgrade_method,
    trial_period_days: data.trial_period_days,
    grace_period_days: data.grace_period_days,
    kyc_aum_threshold_ugx: data.kyc_aum_threshold_ugx,
    referral_commission_pct: data.referral_commission_pct,
    enable_trial: data.enable_trial,
    enable_referral: data.enable_referral,
    require_kyc_before_trading: data.require_kyc_before_trading,
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  // Log audit trail
  await this.auditService.log({
    action: 'platform_settings_updated',
    resource_type: 'platform_settings',
    resource_id: settings.id,
    admin_user_id: adminUserId,
    metadata: {
      changes: data,
    },
  });

  return {
    upgrade_policy: updated,
    message: 'Upgrade policy updated successfully',
  };
}
```

#### 3. `POST /api/settings/subscriptions/tiers` - Add New Tier

**Purpose:** Create a new subscription tier
**Authentication:** Admin role
**Request:**

```typescript
{
  "tier_key": "team",
  "name": "Team",
  "price_usd_cents": 49900, // $499/mo
  "price_display": "$499/mo",
  "color": "#3d9df3",
  "max_bots": 50,
  "max_aum_usd_cents": 50000000, // $500,000
  "max_exchanges": null, // "All"
  "max_strategies": null, // "All"
  "api_access": true,
  "support_level": "Priority Email + Slack",
  "display_order": 3
}
```

**Response:**

```typescript
{
  "tier": SubscriptionTier, // Full tier object
  "message": "Tier 'Team' added successfully"
}
```

**Implementation:**

```typescript
async addTier(data: CreateTierDto, adminUserId: string) {
  const tier = await this.tierRepo.save({
    tier_key: data.tier_key.toLowerCase(),
    name: data.name,
    price_usd_cents: data.price_usd_cents,
    price_display: data.price_display,
    color: data.color,
    max_bots: data.max_bots,
    max_aum_usd_cents: data.max_aum_usd_cents,
    max_exchanges: data.max_exchanges,
    max_strategies: data.max_strategies,
    api_access: data.api_access,
    support_level: data.support_level,
    display_order: data.display_order,
    is_active: true,
  });

  // Log audit
  await this.auditService.log({
    action: 'subscription_tier_added',
    resource_type: 'subscription_tier',
    resource_id: tier.id,
    admin_user_id: adminUserId,
    metadata: { tier_key: tier.tier_key },
  });

  return { tier, message: `Tier '${tier.name}' added successfully` };
}
```

#### 4. `PUT /api/settings/subscriptions/tiers/:id` - Update Existing Tier

**Purpose:** Update tier limits and pricing
**Authentication:** Admin role
**Request:**

```typescript
{
  "price_usd_cents": 9900, // Update price to $99/mo
  "price_display": "$99/mo",
  "max_bots": 15, // Increase bot limit
  "max_aum_usd_cents": 15000000 // Increase AUM to $150,000
}
```

**Response:**

```typescript
{
  "tier": SubscriptionTier, // Updated tier object
  "message": "Tier 'Pro' updated successfully"
}
```

**Implementation:**

```typescript
async updateTier(tierId: string, data: UpdateTierDto, adminUserId: string) {
  const tier = await this.tierRepo.findOneOrFail({ where: { id: tierId } });

  const updated = await this.tierRepo.save({
    ...tier,
    ...data,
    updated_at: new Date(),
  });

  // Log audit
  await this.auditService.log({
    action: 'subscription_tier_updated',
    resource_type: 'subscription_tier',
    resource_id: tierId,
    admin_user_id: adminUserId,
    metadata: { changes: data },
  });

  return { tier: updated, message: `Tier '${updated.name}' updated successfully` };
}
```

### Data Flow Summary

```
[Page Load]
   │
   └─> GET /api/settings/subscriptions (NestJS)
         │
         ├─> Query platform.subscription_tiers (PostgreSQL)
         ├─> Query platform.platform_settings (PostgreSQL)
         └─> Return { tiers: [], upgrade_policy: {} }

[Admin Action: Update Upgrade Policy]
   │
   └─> PUT /api/settings/subscriptions/upgrade-policy (NestJS)
         │
         ├─> Update platform.platform_settings (PostgreSQL)
         ├─> Set updated_by_user_id = admin_user_id
         ├─> Log audit trail
         └─> Return updated settings

[Admin Action: Add New Tier]
   │
   └─> POST /api/settings/subscriptions/tiers (NestJS)
         │
         ├─> Insert into platform.subscription_tiers (PostgreSQL)
         ├─> Log audit trail
         └─> Return new tier object

[Admin Action: Edit Existing Tier]
   │
   └─> PUT /api/settings/subscriptions/tiers/:id (NestJS)
         │
         ├─> Update platform.subscription_tiers (PostgreSQL)
         ├─> Log audit trail
         └─> Return updated tier object

[Background: Trial Expiration Check - Daily at 00:00 UTC]
   │
   └─> NestJS Cron Job
         │
         ├─> Query auth.users WHERE trial_expires_at < NOW() AND subscription_tier_id IS NULL
         ├─> For each expired trial user:
         │     ├─> Downgrade to "basic" tier (or suspend if no fallback)
         │     ├─> Send email notification
         │     └─> Log event
         │
         └─> Query auth.users WHERE subscription_expires_at < NOW() - grace_period_days
               ├─> For each user past grace period:
               │     ├─> Suspend all bots (call Phoenix API to stop bots)
               │     ├─> Update user status to 'suspended'
               │     └─> Send email notification
```

### Summary Table: `/settings/subscriptions`

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Subscription tiers list | `platform.subscription_tiers` | NestJS REST | HTTP | No cache (on-demand load) |
| Upgrade policy settings | `platform.platform_settings` | NestJS REST | HTTP | No cache (singleton table) |
| Add new tier | `platform.subscription_tiers` INSERT | NestJS REST | HTTP | No cache |
| Update tier | `platform.subscription_tiers` UPDATE | NestJS REST | HTTP | No cache |
| Update upgrade policy | `platform.platform_settings` UPDATE | NestJS REST | HTTP | No cache |
| Trial expiration check | Cron job on `auth.users` | NestJS Cron | N/A | No cache |
| Subscription enforcement | Phoenix GenServer (bot start gate) | Phoenix | N/A | ETS cache (tier limits) |

### Frontend Implementation Notes

**Form State Management:**

```typescript
// hooks/useSubscriptionSettings.ts
export function useSubscriptionSettings() {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [upgradePolicy, setUpgradePolicy] = useState<UpgradePolicy | null>(null);
  const [dirty, setDirty] = useState(false);
  const [originalPolicy, setOriginalPolicy] = useState<UpgradePolicy | null>(null);

  useEffect(() => {
    fetch('/api/settings/subscriptions')
      .then(res => res.json())
      .then(data => {
        setTiers(data.tiers);
        setUpgradePolicy(data.upgrade_policy);
        setOriginalPolicy(data.upgrade_policy); // Store original for discard
      });
  }, []);

  const updatePolicyField = (field: string, value: any) => {
    setUpgradePolicy(prev => prev ? { ...prev, [field]: value } : null);
    setDirty(true);
  };

  const saveChanges = async () => {
    if (!upgradePolicy) return;

    const response = await fetch('/api/settings/subscriptions/upgrade-policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(upgradePolicy),
    });

    const result = await response.json();

    setOriginalPolicy(result.upgrade_policy);
    setDirty(false);
    toast.success('Upgrade policy saved');
  };

  const discardChanges = () => {
    setUpgradePolicy(originalPolicy);
    setDirty(false);
  };

  return { tiers, upgradePolicy, dirty, updatePolicyField, saveChanges, discardChanges };
}
```

**Add Tier Modal:**

```typescript
async function handleAddTier(tierData: CreateTierDto) {
  const response = await fetch('/api/settings/subscriptions/tiers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(tierData),
  });

  const result = await response.json();

  // Add new tier to local state
  setTiers(prev => [...prev, result.tier].sort((a, b) => a.display_order - b.display_order));

  toast.success(`Tier '${result.tier.name}' added successfully`);
  closeModal();
}
```

### Performance Considerations

1. **Singleton Settings Table:** Use PostgreSQL unique constraint to enforce only 1 row in `platform.platform_settings`. This ensures consistent settings across the platform and eliminates the need for caching.

2. **Tier Limits Enforcement:** Cache tier limits in Phoenix ETS for fast bot start validation. Refresh ETS cache every time tiers are updated via admin UI.

```elixir
# Phoenix GenServer: TierLimitsCache
defmodule TradeEngine.Billing.TierLimitsCache do
  use GenServer

  def get_tier_limits(tier_id) do
    case :ets.lookup(:tier_limits, tier_id) do
      [{^tier_id, limits}] -> limits
      [] -> fetch_from_db_and_cache(tier_id)
    end
  end

  # Called when admin updates a tier via NestJS API
  def invalidate_tier(tier_id) do
    :ets.delete(:tier_limits, tier_id)
  end
end
```

3. **Trial Expiration Cron Job:** Run daily at 00:00 UTC to check for expired trials and failed payments. Use database indexes on `trial_expires_at` and `subscription_expires_at` for fast queries.

4. **Audit Logging:** Log all tier changes and policy updates for compliance. Store in `auth.activity_logs` or dedicated `platform.settings_audit_logs` table with 7-year retention.

### Testing Checklist

- [ ] Subscription tiers load correctly on page load
- [ ] Upgrade policy settings populate form fields accurately
- [ ] Admin can update upgrade policy fields and save changes
- [ ] Dirty state triggers "Save Changes" and "Discard Changes" buttons
- [ ] Discard button resets form to original values
- [ ] Save button persists changes to database and clears dirty state
- [ ] Admin can add new tier with custom limits
- [ ] Admin can edit existing tier limits
- [ ] Tier display order is respected in UI
- [ ] Null values for "Unlimited" and "All" render correctly as strings in UI
- [ ] Trial expiration cron job suspends bots for expired users
- [ ] Grace period enforcement stops bots after failed payment grace period
- [ ] KYC AUM threshold triggers re-verification when user AUM crosses threshold
- [ ] Audit logs capture all tier and policy changes
- [ ] Form validation prevents invalid values (negative days, invalid percentages)

---

## Cross-Page Data Dependencies

### KYC Providers → KYC Regions

**Dependency:** KYC Regions page references `kyc_providers` to assign providers to geographic regions.

**Database Relationship:**

```sql
-- compliance.kyc_regions references compliance.kyc_providers
ALTER TABLE compliance.kyc_regions
  ADD COLUMN provider_id UUID REFERENCES compliance.kyc_providers(id) ON DELETE SET NULL;
```

**Impact:** When a provider is added/removed on `/kyc-review/providers`, the provider dropdown on `/kyc-review/regions` must update accordingly.

### Subscription Tiers → Users

**Dependency:** User accounts reference `subscription_tiers` to determine feature access limits.

**Database Relationship:**

```sql
-- auth.users references platform.subscription_tiers
ALTER TABLE auth.users
  ADD COLUMN subscription_tier_id UUID REFERENCES platform.subscription_tiers(id);
```

**Impact:** When tier limits are updated on `/settings/subscriptions`, Phoenix GenServer `TierLimitsCache` must invalidate ETS cache to enforce new limits on bot creation.

**Workflow:**

1. Admin updates tier limits via NestJS API: `PUT /api/settings/subscriptions/tiers/:id`
2. NestJS controller calls Phoenix API after successful DB update: `POST /api/phoenix/billing/tiers/:id/invalidate-cache`
3. Phoenix GenServer clears ETS cache for that tier
4. Next bot start request fetches fresh tier limits from DB and caches in ETS

### Subscription Tiers → Bot Creation

**Dependency:** Bot creation validates against user's subscription tier limits.

**Enforcement Logic (Phoenix):**

```elixir
defmodule TradeEngine.Bots.Supervisor do
  def start_bot(bot_id, user_id) do
    user = Repo.get!(User, user_id)
    tier_limits = TierLimitsCache.get_tier_limits(user.subscription_tier_id)

    # Check bot count limit
    current_bot_count = Repo.aggregate(
      from(b in Bot, where: b.user_id == ^user_id and b.status != "deleted"),
      :count
    )

    if tier_limits.max_bots && current_bot_count >= tier_limits.max_bots do
      {:error, "Bot limit reached for your subscription tier. Upgrade to create more bots."}
    else
      # Proceed with bot start
      DynamicSupervisor.start_child(...)
    end
  end
end
```

### KYC Providers → KYC Applicants

**Dependency:** KYC applicants are processed by providers configured on `/kyc-review/providers`.

**Database Relationship:**

```sql
-- auth.kyc_records references compliance.kyc_providers
ALTER TABLE auth.kyc_records
  ADD COLUMN provider_id UUID REFERENCES compliance.kyc_providers(id);
```

**Impact:** When a provider's credentials are rotated on `/kyc-review/providers`, webhook signature validation logic must use new `webhook_secret` from encrypted credentials.

---

## Implementation Roadmap

### Phase 1: Database Schema (Week 1)

**Tasks:**

1. Create `compliance.kyc_providers` table with pgcrypto encryption
2. Create `compliance.provider_health_checks` table
3. Create `platform.subscription_tiers` table
4. Create `platform.platform_settings` singleton table
5. Alter `auth.users` to add subscription tier references
6. Alter `compliance.kyc_regions` to add provider_id reference
7. Create indexes on all foreign keys and filter columns
8. Insert seed data for default tiers (basic, pro, enterprise)
9. Insert default platform settings row
10. Write migration files for all schema changes

**Deliverables:**

- Migration files: `20260221_create_kyc_providers.sql`, `20260221_create_subscription_tiers.sql`, etc.
- Seed data scripts: `seeds/default_subscription_tiers.sql`
- Schema documentation update

### Phase 2: NestJS REST API Endpoints (Week 2)

**Tasks:**

1. Implement `GET /api/kyc/providers` with KPI aggregation
2. Implement `POST /api/kyc/providers/:id/reveal-credentials` with pgcrypto decryption
3. Implement `POST /api/kyc/providers/:id/test-connection` (proxy to Phoenix)
4. Implement `POST /api/kyc/providers/:id/rotate-keys` with encryption + audit
5. Implement `POST /api/kyc/providers` (add new provider)
6. Implement `GET /api/settings/subscriptions` (load tiers + policy)
7. Implement `PUT /api/settings/subscriptions/upgrade-policy`
8. Implement `POST /api/settings/subscriptions/tiers` (add tier)
9. Implement `PUT /api/settings/subscriptions/tiers/:id` (update tier)
10. Add audit logging to all admin actions

**Deliverables:**

- NestJS controllers, services, DTOs for all endpoints
- Swagger/OpenAPI documentation
- Unit tests for service methods
- Integration tests for API endpoints

### Phase 3: Phoenix GenServers (Week 3)

**Tasks:**

1. Implement `ProviderHealthMonitor` GenServer with 30-minute health checks
2. Implement provider-specific health check functions (SumSub, Onfido, Persona)
3. Implement `TierLimitsCache` GenServer with ETS caching
4. Add Phoenix API endpoint: `POST /api/phoenix/kyc/providers/:id/health-check`
5. Add Phoenix API endpoint: `POST /api/phoenix/billing/tiers/:id/invalidate-cache`
6. Implement bot start validation against tier limits
7. Add supervisor trees for all GenServers

**Deliverables:**

- Phoenix GenServer modules: `provider_health_monitor.ex`, `tier_limits_cache.ex`
- Phoenix controller: `kyc_provider_controller.ex`, `billing_controller.ex`
- ExUnit tests for GenServer logic
- Supervisor configuration

### Phase 4: Phoenix Channels (Week 4)

**Tasks:**

1. Implement Phoenix Channel `KycProviderChannel` for topic `kyc:providers:all`
2. Add WebSocket event handlers for `provider_health_update`, `webhook_stats_update`
3. Integrate PubSub broadcasts into `ProviderHealthMonitor` GenServer
4. Add client authorization logic (admin role check)
5. Test WebSocket broadcasts with multiple connected clients

**Deliverables:**

- Phoenix Channel module: `kyc_provider_channel.ex`
- PubSub broadcast logic in GenServers
- WebSocket integration tests

### Phase 5: Frontend Integration (Week 5)

**Tasks:**

1. Build React hooks: `useKycProviders()`, `useSubscriptionSettings()`
2. Implement WebSocket connection logic for `kyc:providers:all` channel
3. Build UI components for provider cards, credential reveal, test connection
4. Build UI components for tier cards, upgrade policy form
5. Add form validation and dirty state management
6. Add error handling and toast notifications
7. Build modals for "Add Provider" and "Add Tier"

**Deliverables:**

- React hooks: `hooks/useKycProviders.ts`, `hooks/useSubscriptionSettings.ts`
- UI components: `components/KycProviderCard.tsx`, `components/SubscriptionTierCard.tsx`
- Form components with validation
- WebSocket client integration

### Phase 6: Background Jobs (Week 6)

**Tasks:**

1. Implement NestJS cron job for trial expiration check (daily at 00:00 UTC)
2. Implement NestJS cron job for subscription grace period enforcement
3. Implement NestJS cron job for KYC AUM threshold monitoring
4. Implement PostgreSQL materialized view refresh for webhook stats
5. Add email notification service for trial expiration, subscription suspension
6. Add bot suspension logic via Phoenix API calls

**Deliverables:**

- NestJS cron jobs: `trial_expiration_job.ts`, `subscription_enforcement_job.ts`
- Email templates for trial expiration, suspension notifications
- Materialized view refresh logic
- Integration with Phoenix API for bot suspension

### Phase 7: Testing & Optimization (Week 7)

**Tasks:**

1. Load test Phoenix health check GenServer with 100+ providers
2. Load test NestJS API endpoints with 10k requests/min
3. Optimize database queries with EXPLAIN ANALYZE
4. Add database indexes for slow queries
5. Test WebSocket scalability with 100+ concurrent admin connections
6. Run security audit on credential encryption/decryption
7. Test audit logging for all admin actions
8. Perform end-to-end testing of all workflows

**Deliverables:**

- Load test reports
- Database optimization recommendations
- Security audit report
- End-to-end test suite (Cypress/Playwright)

### Phase 8: Deployment & Monitoring (Week 8)

**Tasks:**

1. Deploy database migrations to production
2. Deploy NestJS API changes
3. Deploy Phoenix GenServer changes
4. Deploy frontend changes
5. Configure monitoring alerts for provider health checks
6. Configure monitoring alerts for subscription enforcement
7. Set up Sentry error tracking for Phoenix + NestJS
8. Create admin dashboard for monitoring provider health + subscription metrics

**Deliverables:**

- Production deployment checklist
- Monitoring dashboards (Grafana/DataDog)
- Alert configurations
- Admin documentation for managing providers and tiers

---

## Summary Tables

### All Pages Data Source Summary

| Page | Feature | Data Source | Backend System | Protocol | Caching |
|------|---------|-------------|----------------|----------|---------|
| **Providers** | Provider list + metadata | `compliance.kyc_providers` | NestJS REST | HTTP | No cache |
| **Providers** | KPIs (connected count, regions) | Aggregated queries | NestJS REST | HTTP | No cache |
| **Providers** | Connection status (live) | Phoenix ETS → PubSub | Phoenix GenServer | WebSocket | ETS (30s TTL) |
| **Providers** | Encrypted credentials | `compliance.kyc_providers.credentials_encrypted` | NestJS REST + pgcrypto | HTTP | No cache |
| **Providers** | Health check history | `compliance.provider_health_checks` | NestJS REST | HTTP | No cache |
| **Providers** | Webhook success rate | Materialized view (24h aggregate) | NestJS REST | HTTP | PostgreSQL MV (1h refresh) |
| **Settings** | Redirect to /settings/risk | N/A | Next.js router | Client-side | N/A |
| **Subscriptions** | Subscription tiers list | `platform.subscription_tiers` | NestJS REST | HTTP | No cache |
| **Subscriptions** | Upgrade policy settings | `platform.platform_settings` | NestJS REST | HTTP | No cache |
| **Subscriptions** | Add/Edit tier | `platform.subscription_tiers` | NestJS REST | HTTP | No cache |
| **Subscriptions** | Trial expiration enforcement | Cron job on `auth.users` | NestJS Cron | N/A | No cache |
| **Subscriptions** | Tier limits enforcement | Phoenix ETS cache | Phoenix GenServer | N/A | ETS (invalidate on tier update) |

### Database Tables Created

| Table | Schema | Purpose | Key Columns |
|-------|--------|---------|-------------|
| `kyc_providers` | `compliance` | Store KYC provider credentials and metadata | `code`, `credentials_encrypted`, `connection_status` |
| `provider_health_checks` | `compliance` | Log health check results for providers | `provider_id`, `response_time_ms`, `is_healthy` |
| `subscription_tiers` | `platform` | Define subscription tiers with limits | `tier_key`, `max_bots`, `max_aum_usd_cents` |
| `platform_settings` | `platform` | Singleton table for platform-wide settings | `tier_upgrade_method`, `trial_period_days` |

### NestJS REST API Endpoints Summary

| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/api/kyc/providers` | GET | List all providers with KPIs | Admin |
| `/api/kyc/providers/:id/reveal-credentials` | POST | Decrypt provider credentials | Admin + Audit |
| `/api/kyc/providers/:id/test-connection` | POST | Manual health check | Admin |
| `/api/kyc/providers/:id/rotate-keys` | POST | Update provider credentials | Admin + MFA + Audit |
| `/api/kyc/providers` | POST | Add new provider | Admin + Audit |
| `/api/settings/subscriptions` | GET | Load tiers + upgrade policy | Admin |
| `/api/settings/subscriptions/upgrade-policy` | PUT | Update upgrade policy | Admin + Audit |
| `/api/settings/subscriptions/tiers` | POST | Add new tier | Admin + Audit |
| `/api/settings/subscriptions/tiers/:id` | PUT | Update tier limits | Admin + Audit |

### Phoenix GenServers Summary

| GenServer | Purpose | ETS Tables | PubSub Topics | Interval |
|-----------|---------|------------|---------------|----------|
| `ProviderHealthMonitor` | Check provider health and broadcast updates | None | `kyc:providers:all` | 30 minutes |
| `TierLimitsCache` | Cache subscription tier limits for fast validation | `:tier_limits` | None | On-demand + invalidate |

### Phoenix Channels Summary

| Channel Topic | Purpose | Events (Server → Client) | Events (Client → Server) |
|---------------|---------|--------------------------|--------------------------|
| `kyc:providers:all` | Broadcast provider health updates | `provider_health_update`, `webhook_stats_update` | `subscribe` |

---

## Appendix: Helper Functions

### A. Region-to-Provider Mapping (for KPIs)

```sql
-- Query: Get count of regions and countries covered by all active providers
WITH active_providers AS (
  SELECT id FROM compliance.kyc_providers WHERE is_active = true
),
region_coverage AS (
  SELECT
    COUNT(DISTINCT r.id) AS regions_count,
    SUM(ARRAY_LENGTH(r.countries, 1)) AS countries_count
  FROM compliance.kyc_regions r
  WHERE r.provider_id IN (SELECT id FROM active_providers)
)
SELECT * FROM region_coverage;
```

### B. Webhook Success Rate Calculation (Materialized View)

```sql
CREATE MATERIALIZED VIEW compliance.provider_webhook_stats_24h AS
SELECT
  provider_id,
  COUNT(*) FILTER (WHERE response_status = 'success') * 100.0 / NULLIF(COUNT(*), 0) AS success_rate_pct,
  COUNT(*) AS total_webhooks,
  COUNT(*) FILTER (WHERE response_status = 'failure') AS failed_webhooks
FROM compliance.provider_webhook_logs
WHERE received_at > NOW() - INTERVAL '24 hours'
GROUP BY provider_id;

CREATE UNIQUE INDEX idx_provider_webhook_stats_provider ON compliance.provider_webhook_stats_24h (provider_id);

-- Refresh every hour via cron or Phoenix GenServer
REFRESH MATERIALIZED VIEW CONCURRENTLY compliance.provider_webhook_stats_24h;
```

### C. Trial Expiration Enforcement (NestJS Cron Job)

```typescript
// trial_expiration_job.ts
@Cron('0 0 * * *') // Daily at 00:00 UTC
async handleTrialExpiration() {
  const expiredTrials = await this.userRepo.find({
    where: {
      trial_expires_at: LessThan(new Date()),
      subscription_tier_id: IsNull(),
    },
  });

  for (const user of expiredTrials) {
    // Downgrade to basic tier or suspend
    const basicTier = await this.tierRepo.findOne({ where: { tier_key: 'basic' } });

    await this.userRepo.update(user.id, {
      subscription_tier_id: basicTier?.id,
      trial_expires_at: null,
    });

    // Send email notification
    await this.emailService.send({
      to: user.email,
      template: 'trial_expired',
      data: { user_name: user.name },
    });

    // Log event
    await this.auditService.log({
      action: 'trial_expired',
      resource_type: 'user',
      resource_id: user.id,
      metadata: { downgraded_to: basicTier?.tier_key },
    });
  }
}
```

### D. Bot Start Tier Limit Validation (Phoenix)

```elixir
# bot_supervisor.ex
defmodule TradeEngine.Bots.Supervisor do
  def start_bot(bot_id, user_id) do
    user = Repo.get!(User, user_id)

    # Get tier limits from ETS cache
    tier_limits = TradeEngine.Billing.TierLimitsCache.get_tier_limits(user.subscription_tier_id)

    # Check bot count limit
    current_bot_count = Repo.aggregate(
      from(b in Bot, where: b.user_id == ^user_id and b.status in ["running", "paused"]),
      :count
    )

    if tier_limits.max_bots && current_bot_count >= tier_limits.max_bots do
      {:error, "Bot limit reached. You have #{current_bot_count}/#{tier_limits.max_bots} bots active. Upgrade your subscription to create more bots."}
    else
      # Check AUM limit
      user_aum = calculate_user_aum(user_id)

      if tier_limits.max_aum_usd_cents && user_aum > tier_limits.max_aum_usd_cents do
        {:error, "AUM limit reached. Your current AUM ($#{user_aum / 100}) exceeds your tier limit. Upgrade to manage more capital."}
      else
        # All checks passed, start bot
        case DynamicSupervisor.start_child(__MODULE__, {TradeEngine.Bots.Worker, bot_id: bot_id}) do
          {:ok, pid} -> {:ok, pid}
          {:error, reason} -> {:error, "Failed to start bot: #{inspect(reason)}"}
        end
      end
    end
  end

  defp calculate_user_aum(user_id) do
    Repo.aggregate(
      from(p in Position, where: p.user_id == ^user_id and p.status == "open"),
      :sum,
      :entry_value_usd_cents
    ) || 0
  end
end
```

---

**End of Document**

**Next Steps:**
1. Review this analysis with backend and frontend teams
2. Prioritize Phase 1 (Database Schema) for immediate implementation
3. Assign ownership of each phase to specific developers
4. Begin Week 1 tasks: Database migration files and seed data
5. Schedule weekly syncs to track progress against roadmap

**Related Documents:**
- [KYC Review Section Analysis](./KYC_REVIEW_SECTION_ANALYSIS.md) - Complete analysis of KYC applicant management pages
- [Analysis Strategy](./ANALYSIS_STRATEGY.md) - Methodology for page-by-page analysis
- [Multi-Exchange Assessment](../MULTI_EXCHANGE_ASSESSMENT_REPORT.md) - Multi-exchange architecture patterns
