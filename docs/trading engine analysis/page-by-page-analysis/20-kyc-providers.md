# Page 20: `/kyc-review/providers` - KYC Provider Management

**Document Version:** 1.0
**Last Updated:** February 21, 2026
**Route:** `/kyc-review/providers`
**Page Type:** Configuration & Management
**User Persona:** Platform Admin (primary), Compliance Officer (view-only)
**Multi-Exchange Impact:** L None (provider management is platform-level)

---

## UI Mock Data Structure

```typescript
interface KYCProvider {
  id: string;                      // "sumsub", "onfido", "persona"
  name: string;                    // "SumSub", "Onfido", "Persona"
  color: string;                   // Brand color for UI
  bg: string;                      // Background color for badges
  abbr: string;                    // "SS", "ON", "PS" (for logo fallback)
  logo: string;                    // Logo filename
  docs: string;                    // API documentation URL
  workflows: string[];             // Available verification workflows
  regions: string[];               // Regions this provider serves

  // Runtime status
  status: "connected" | "degraded" | "disconnected";
  lastChecked: string;             // Timestamp of last health check
  responseTime: number;            // Average API response time (ms)

  // Credentials (encrypted, masked in UI)
  appToken: string;                // Client ID / App Token (masked)
  secretKey: string;               // API secret key (masked)
  webhookUrl: string;              // Webhook endpoint
  webhookSecret: string;           // Webhook validation secret

  // Metadata
  isActive: boolean;
  isSandbox: boolean;              // Using sandbox/test environment
  createdAt: string;
  updatedAt: string;
}

interface ProviderStats {
  connectedProviders: number;      // Count of active providers
  regionsCovered: number;          // Total regions with provider coverage
  avgResponseTime: number;         // Platform-wide avg response time (ms)
  webhookSuccessRate: number;      // % successful webhook deliveries (24h)
}

interface ProviderHealthCheck {
  providerId: string;
  timestamp: string;
  status: "healthy" | "degraded" | "unhealthy";
  responseTime: number;
  error?: string;
}
```

---

## UI Features & Requirements

1. **Provider Statistics KPIs** - 4 metric cards:
   - Connected Providers (count + names)
   - Regions Covered (count + country total)
   - Avg Response Time (with trend indicator)
   - Webhook Success Rate (last 24h)

2. **Provider Configuration Cards** - One card per provider showing:
   - Provider logo/branding
   - Connection status (connected/degraded/disconnected)
   - Masked API credentials (App Token, Secret Key)
   - Webhook URL
   - Available workflows (with overflow indicator)
   - Last health check timestamp
   - Regional assignment

3. **Credential Management**:
   - Show/Hide masked credentials (admin-only)
   - Rotate Keys action (admin-only)
   - Test Connection button (admin-only)

4. **Provider Actions**:
   - View API documentation (external link)
   - Test connection health
   - Rotate credentials (with confirmation)

5. **Add Provider CTA** - Dashed border CTA for adding new providers (admin-only)

6. **Role-Based Access Control**:
   - Platform Admin: Full access (view, edit, test, rotate)
   - Compliance Officer: Read-only (view status only)
   - Info banner for non-admin users

7. **Multi-Exchange Context**: **NOT APPLICABLE** - Provider configuration is platform-level, not exchange-specific

---

## Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Provider List** | PostgreSQL | `kyc.provider_config` | On page load | All configured providers |
| **Provider Metadata** | PostgreSQL | `kyc.provider_config` | Static | Name, logo, docs URL |
| **API Credentials** | PostgreSQL | `kyc.provider_config` | Static (encrypted) | Never sent to frontend unencrypted |
| **Connection Status** | Phoenix ETS Cache | `:kyc_provider_health` | Real-time (5s polling) | Health check results |
| **Response Time** | Phoenix ETS Cache | `:kyc_provider_metrics` | Real-time (1min aggregate) | Rolling average |
| **Workflows** | PostgreSQL | `kyc.provider_workflows` | Static | Available verification flows |
| **Regional Assignment** | PostgreSQL | `kyc.region_config` | Static | Which regions use which provider |
| **Webhook Success Rate** | PostgreSQL | `kyc.webhook_logs` | On page load (24h query) | Success/failure ratio |
| **Last Health Check** | PostgreSQL | `kyc.health_checks` | On page load | Most recent check timestamp |

---

## Data Delivery Strategy

### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/kyc/providers/stats`

**Response:**
```json
{
  "stats": {
    "connectedProviders": 3,
    "providerNames": ["SumSub", "Onfido", "Persona"],
    "regionsCovered": 6,
    "countryCoverage": 46,
    "avgResponseTime": 1400,
    "avgResponseTrend": 0,
    "webhookSuccessRate": 99.7
  }
}
```

**PostgreSQL Query:**
```sql
WITH provider_counts AS (
  SELECT COUNT(*) as total_providers
  FROM kyc.provider_config
  WHERE is_active = true
    AND deleted_at IS NULL
),
region_counts AS (
  SELECT COUNT(DISTINCT name) as regions,
         ARRAY_LENGTH(ARRAY_AGG(DISTINCT unnest(countries)), 1) as countries
  FROM kyc.region_config
),
webhook_stats AS (
  SELECT
    ROUND(
      (COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / COUNT(*)) * 100,
      1
    ) as success_rate
  FROM kyc.webhook_logs
  WHERE created_at >= NOW() - INTERVAL '24 hours'
)
SELECT
  pc.total_providers,
  rc.regions,
  rc.countries,
  ws.success_rate
FROM provider_counts pc
CROSS JOIN region_counts rc
CROSS JOIN webhook_stats ws;
```

**Data Source:** **NestJS API** í PostgreSQL

---

**Endpoint 2:** `GET /api/kyc/providers`

**Response:**
```json
{
  "providers": [
    {
      "id": "sumsub",
      "name": "SumSub",
      "color": "#0BA8E0",
      "bg": "#0BA8E020",
      "abbr": "SS",
      "logo": "sumsub.png",
      "docs": "https://developers.sumsub.com",
      "workflows": ["standard-kyc", "enhanced-due-diligence", "poa-check", "liveness-only"],
      "regions": ["East Africa", "Southern Africa"],
      "status": "connected",
      "lastChecked": "2026-02-21T15:28:00Z",
      "responseTime": 1200,
      "appToken": """""""""""""""""""""""""3f2a",
      "secretKey": "sk_""""""""""""""""""""""""""""""9c1d",
      "webhookUrl": "https://api.stella.io/webhooks/sumsub",
      "isActive": true,
      "isSandbox": false,
      "createdAt": "2025-12-01T00:00:00Z",
      "updatedAt": "2026-02-15T10:30:00Z"
    },
    {
      "id": "onfido",
      "name": "Onfido",
      "color": "#3B46FF",
      "bg": "#3B46FF20",
      "abbr": "ON",
      "logo": "Onfido.png",
      "docs": "https://documentation.onfido.com",
      "workflows": ["us-standard", "us-enhanced", "us-accredited-investor"],
      "regions": ["United States"],
      "status": "connected",
      "lastChecked": "2026-02-21T15:28:00Z",
      "responseTime": 1350,
      "appToken": """""""""""""""""""""""""7a2b",
      "secretKey": "sk_""""""""""""""""""""""""""""""4f8c",
      "webhookUrl": "https://api.stella.io/webhooks/onfido",
      "isActive": true,
      "isSandbox": false,
      "createdAt": "2025-12-01T00:00:00Z",
      "updatedAt": "2026-01-20T14:15:00Z"
    },
    {
      "id": "persona",
      "name": "Persona",
      "color": "#7C5CFC",
      "bg": "#7C5CFC20",
      "abbr": "PS",
      "logo": "persona.jpg",
      "docs": "https://docs.withpersona.com",
      "workflows": ["global-standard", "aml-enhanced"],
      "regions": ["European Union", "Rest of World"],
      "status": "degraded",
      "lastChecked": "2026-02-21T15:28:00Z",
      "responseTime": 2100,
      "appToken": """""""""""""""""""""""""9k4m",
      "secretKey": "sk_""""""""""""""""""""""""""""""2n7p",
      "webhookUrl": "https://api.stella.io/webhooks/persona",
      "isActive": true,
      "isSandbox": false,
      "createdAt": "2025-12-01T00:00:00Z",
      "updatedAt": "2026-02-10T09:45:00Z"
    }
  ]
}
```

**PostgreSQL Query:**
```sql
WITH latest_health_checks AS (
  SELECT DISTINCT ON (provider_id)
    provider_id,
    status,
    response_time_ms,
    checked_at
  FROM kyc.health_checks
  ORDER BY provider_id, checked_at DESC
),
region_assignments AS (
  SELECT
    pc.provider as provider_id,
    ARRAY_AGG(rc.name) as regions
  FROM kyc.region_config rc
  JOIN kyc.provider_config pc ON pc.id = ANY(rc.provider_ids)
  WHERE pc.is_active = true
  GROUP BY pc.provider
)
SELECT
  pc.provider as id,
  pc.name,
  pc.color,
  pc.bg_color as bg,
  pc.abbreviation as abbr,
  pc.logo_filename as logo,
  pc.docs_url as docs,
  (
    SELECT ARRAY_AGG(workflow_name)
    FROM kyc.provider_workflows
    WHERE provider_id = pc.id
  ) as workflows,
  COALESCE(ra.regions, '{}') as regions,
  COALESCE(lhc.status, 'disconnected') as status,
  lhc.checked_at as last_checked,
  lhc.response_time_ms as response_time,
  -- Mask credentials (last 4 chars visible)
  CONCAT('""""""""""""""""""""""""', RIGHT(pc.app_token_encrypted, 4)) as app_token,
  CONCAT('sk_""""""""""""""""""""""""""""""', RIGHT(pc.secret_key_encrypted, 4)) as secret_key,
  pc.webhook_url,
  pc.is_active,
  pc.is_sandbox,
  pc.created_at,
  pc.updated_at
FROM kyc.provider_config pc
LEFT JOIN latest_health_checks lhc ON lhc.provider_id = pc.id
LEFT JOIN region_assignments ra ON ra.provider_id = pc.provider
WHERE pc.deleted_at IS NULL
ORDER BY pc.name;
```

**Data Source:** **NestJS API** í PostgreSQL + ETS cache for health status

---

**Endpoint 3:** `POST /api/kyc/providers/:providerId/test-connection`

**Purpose:** Test provider API connectivity and response time

**Request:** Empty body

**Response:**
```json
{
  "success": true,
  "providerId": "sumsub",
  "status": "healthy",
  "responseTime": 1150,
  "timestamp": "2026-02-21T15:30:00Z",
  "details": {
    "apiReachable": true,
    "webhookConfigured": true,
    "credentialsValid": true
  }
}
```

**Implementation:**
```typescript
// NestJS Service
async testProviderConnection(providerId: string): Promise<ProviderHealthCheck> {
  const provider = await this.getProviderConfig(providerId);

  const startTime = Date.now();

  try {
    // Test API connectivity
    const response = await this.providerClients[providerId].healthCheck();
    const responseTime = Date.now() - startTime;

    // Record health check
    await this.db.query(`
      INSERT INTO kyc.health_checks (
        provider_id,
        status,
        response_time_ms,
        checked_at,
        details
      ) VALUES ($1, $2, $3, NOW(), $4)
    `, [
      providerId,
      responseTime < 2000 ? 'healthy' : 'degraded',
      responseTime,
      JSON.stringify({
        apiReachable: true,
        webhookConfigured: !!provider.webhookSecret,
        credentialsValid: response.authenticated
      })
    ]);

    return {
      providerId,
      status: responseTime < 2000 ? 'healthy' : 'degraded',
      responseTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Record failure
    await this.db.query(`
      INSERT INTO kyc.health_checks (
        provider_id,
        status,
        response_time_ms,
        checked_at,
        error_message
      ) VALUES ($1, 'unhealthy', NULL, NOW(), $2)
    `, [providerId, error.message]);

    throw new Error(`Provider ${providerId} health check failed: ${error.message}`);
  }
}
```

**Data Source:** **NestJS API** í External Provider API í PostgreSQL

---

**Endpoint 4:** `POST /api/kyc/providers/:providerId/credentials`

**Purpose:** Update provider API credentials (admin-only)

**Request Body:**
```json
{
  "appToken": "new-app-token-here",
  "secretKey": "new-secret-key-here",
  "webhookSecret": "new-webhook-secret-here"
}
```

**Response:**
```json
{
  "success": true,
  "providerId": "sumsub",
  "credentialsRotated": true,
  "rotatedAt": "2026-02-21T15:35:00Z",
  "auditId": "uuid"
}
```

**PostgreSQL Transaction:**
```sql
-- 1. Update credentials (encrypted)
UPDATE kyc.provider_config
SET
  app_token_encrypted = pgp_sym_encrypt($2, current_setting('app.encryption_key')),
  secret_key_encrypted = pgp_sym_encrypt($3, current_setting('app.encryption_key')),
  webhook_secret_encrypted = pgp_sym_encrypt($4, current_setting('app.encryption_key')),
  updated_at = NOW(),
  updated_by_user_id = $5
WHERE provider = $1
RETURNING id;

-- 2. Log credential rotation in audit trail
INSERT INTO kyc.audit_log (
  event_type,
  actor_user_id,
  target_type,
  target_id,
  metadata,
  created_at
) VALUES (
  'provider_credentials_rotated',
  $5,  -- admin user ID
  'provider',
  $1,  -- provider ID
  jsonb_build_object(
    'provider', $1,
    'rotated_fields', ARRAY['app_token', 'secret_key', 'webhook_secret']
  ),
  NOW()
);

-- 3. Invalidate all existing provider sessions/tokens (if applicable)
-- Provider-specific logic here
```

**Data Source:** **NestJS API** í PostgreSQL (encrypted storage)

---

**Endpoint 5:** `GET /api/kyc/providers/:providerId/credentials/reveal`

**Purpose:** Reveal unmasked credentials (admin-only, short TTL)

**Response:**
```json
{
  "providerId": "sumsub",
  "appToken": "actual-app-token-here",
  "secretKey": "sk_actual_secret_key_here",
  "webhookSecret": "whsec_actual_webhook_secret",
  "expiresIn": 30  // seconds before frontend must re-mask
}
```

**PostgreSQL Query:**
```sql
-- Decrypt credentials for authorized admin user
SELECT
  provider as provider_id,
  pgp_sym_decrypt(app_token_encrypted::bytea, current_setting('app.encryption_key')) as app_token,
  pgp_sym_decrypt(secret_key_encrypted::bytea, current_setting('app.encryption_key')) as secret_key,
  pgp_sym_decrypt(webhook_secret_encrypted::bytea, current_setting('app.encryption_key')) as webhook_secret
FROM kyc.provider_config
WHERE provider = $1
  AND deleted_at IS NULL;

-- Log credential access
INSERT INTO kyc.audit_log (
  event_type,
  actor_user_id,
  target_type,
  target_id,
  metadata,
  created_at
) VALUES (
  'provider_credentials_viewed',
  $2,  -- admin user ID
  'provider',
  $1,
  jsonb_build_object('provider', $1, 'action', 'reveal'),
  NOW()
);
```

**Data Source:** **NestJS API** í PostgreSQL (decrypted)

**Security Note:** Frontend must auto-hide after 30 seconds, log all reveal actions.

---

**Endpoint 6:** `POST /api/kyc/providers`

**Purpose:** Add a new KYC provider (admin-only)

**Request Body:**
```json
{
  "provider": "veriff",
  "name": "Veriff",
  "color": "#00C853",
  "abbreviation": "VF",
  "logoFilename": "veriff.png",
  "docsUrl": "https://developers.veriff.com",
  "appToken": "veriff-app-token",
  "secretKey": "veriff-secret-key",
  "webhookSecret": "veriff-webhook-secret",
  "baseUrl": "https://api.veriff.com",
  "isSandbox": false
}
```

**Response:**
```json
{
  "success": true,
  "providerId": "veriff",
  "createdAt": "2026-02-21T15:40:00Z",
  "auditId": "uuid"
}
```

**PostgreSQL Transaction:**
```sql
-- Insert new provider
INSERT INTO kyc.provider_config (
  provider,
  name,
  color,
  bg_color,
  abbreviation,
  logo_filename,
  docs_url,
  app_token_encrypted,
  secret_key_encrypted,
  webhook_secret_encrypted,
  base_url,
  is_sandbox,
  is_active,
  created_at,
  created_by_user_id
) VALUES (
  $1, $2, $3, $3 || '20', $4, $5, $6,
  pgp_sym_encrypt($7, current_setting('app.encryption_key')),
  pgp_sym_encrypt($8, current_setting('app.encryption_key')),
  pgp_sym_encrypt($9, current_setting('app.encryption_key')),
  $10, $11, true, NOW(), $12
)
RETURNING id;

-- Log provider addition
INSERT INTO kyc.audit_log (
  event_type,
  actor_user_id,
  target_type,
  target_id,
  metadata,
  created_at
) VALUES (
  'provider_added',
  $12,
  'provider',
  $1,
  jsonb_build_object('provider', $1, 'name', $2),
  NOW()
);
```

**Data Source:** **NestJS API** í PostgreSQL

---

### Phoenix GenServer: Provider Health Monitor

**Purpose:** Continuously monitor provider API health and cache status in ETS

```elixir
defmodule TradeEngine.KYC.ProviderHealthMonitor do
  use GenServer
  require Logger

  @health_check_interval 5_000  # 5 seconds
  @degraded_threshold_ms 2_000   # 2 seconds

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(_) do
    # Create ETS cache for provider health
    :ets.new(:kyc_provider_health, [
      :named_table,
      :set,
      :public,
      read_concurrency: true
    ])

    # Create ETS cache for provider metrics
    :ets.new(:kyc_provider_metrics, [
      :named_table,
      :set,
      :public,
      read_concurrency: true
    ])

    # Load all active providers
    providers = load_active_providers()

    # Schedule first health check
    schedule_health_check()

    {:ok, %{providers: providers}}
  end

  def handle_info(:health_check, state) do
    Enum.each(state.providers, fn provider ->
      Task.start(fn -> check_provider_health(provider) end)
    end)

    schedule_health_check()
    {:noreply, state}
  end

  defp check_provider_health(provider) do
    start_time = System.monotonic_time(:millisecond)

    status =
      case call_provider_api(provider) do
        {:ok, _response} ->
          response_time = System.monotonic_time(:millisecond) - start_time

          status =
            if response_time < @degraded_threshold_ms,
              do: :healthy,
              else: :degraded

          # Update ETS cache
          :ets.insert(:kyc_provider_health, {
            provider.id,
            status,
            response_time,
            DateTime.utc_now()
          })

          # Update rolling average response time
          update_response_time_avg(provider.id, response_time)

          # Persist to PostgreSQL
          persist_health_check(provider.id, status, response_time, nil)

          status

        {:error, reason} ->
          :ets.insert(:kyc_provider_health, {
            provider.id,
            :unhealthy,
            nil,
            DateTime.utc_now()
          })

          persist_health_check(provider.id, :unhealthy, nil, reason)

          :unhealthy
      end

    # Broadcast status change if degraded/unhealthy
    if status != :healthy do
      Phoenix.PubSub.broadcast(
        TradeEngine.PubSub,
        "kyc:provider_health",
        {:provider_status_change, provider.id, status}
      )
    end
  end

  defp call_provider_api(provider) do
    case provider.id do
      "sumsub" -> TradeEngine.KYC.Providers.Sumsub.health_check()
      "onfido" -> TradeEngine.KYC.Providers.Onfido.health_check()
      "persona" -> TradeEngine.KYC.Providers.Persona.health_check()
      _ -> {:error, :unknown_provider}
    end
  end

  defp update_response_time_avg(provider_id, response_time) do
    case :ets.lookup(:kyc_provider_metrics, {provider_id, :response_times}) do
      [{_, times}] ->
        # Keep last 12 readings (1 minute worth at 5s intervals)
        updated_times = Enum.take([response_time | times], 12)
        avg = Enum.sum(updated_times) / length(updated_times)

        :ets.insert(:kyc_provider_metrics, {
          {provider_id, :response_times},
          updated_times
        })

        :ets.insert(:kyc_provider_metrics, {
          {provider_id, :avg_response_time},
          avg
        })

      [] ->
        :ets.insert(:kyc_provider_metrics, {
          {provider_id, :response_times},
          [response_time]
        })

        :ets.insert(:kyc_provider_metrics, {
          {provider_id, :avg_response_time},
          response_time
        })
    end
  end

  defp persist_health_check(provider_id, status, response_time, error) do
    TradeEngine.Repo.query!(
      """
      INSERT INTO kyc.health_checks (
        provider_id,
        status,
        response_time_ms,
        error_message,
        checked_at
      ) VALUES ($1, $2, $3, $4, NOW())
      """,
      [provider_id, to_string(status), response_time, error]
    )
  end

  defp load_active_providers do
    TradeEngine.Repo.query!(
      """
      SELECT id, provider, name, base_url
      FROM kyc.provider_config
      WHERE is_active = true
        AND deleted_at IS NULL
      """
    )
    |> Enum.map(fn row ->
      %{
        id: Enum.at(row, 1),
        name: Enum.at(row, 2),
        base_url: Enum.at(row, 3)
      }
    end)
  end

  defp schedule_health_check do
    Process.send_after(self(), :health_check, @health_check_interval)
  end
end
```

---

## Database Schema Requirements

### Schema Changes

**1. Update `kyc.provider_config` table** (already exists from Page 19, add missing fields)

```sql
-- Add UI/branding fields
ALTER TABLE kyc.provider_config
ADD COLUMN color VARCHAR(7),                    -- Hex color for UI branding
ADD COLUMN bg_color VARCHAR(9),                 -- Background color with alpha
ADD COLUMN abbreviation VARCHAR(10),            -- "SS", "ON", "PS"
ADD COLUMN logo_filename VARCHAR(255),          -- Logo file path
ADD COLUMN docs_url TEXT,                       -- API documentation URL
ADD COLUMN base_url TEXT NOT NULL DEFAULT 'https://api.provider.com';

-- Add health monitoring fields
ALTER TABLE kyc.provider_config
ADD COLUMN updated_by_user_id UUID REFERENCES auth.users(id),
ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id);

-- Update existing providers with branding
UPDATE kyc.provider_config SET
  color = '#0BA8E0',
  bg_color = '#0BA8E020',
  abbreviation = 'SS',
  logo_filename = 'sumsub.png',
  docs_url = 'https://developers.sumsub.com',
  base_url = 'https://api.sumsub.com'
WHERE provider = 'sumsub';

UPDATE kyc.provider_config SET
  color = '#3B46FF',
  bg_color = '#3B46FF20',
  abbreviation = 'ON',
  logo_filename = 'Onfido.png',
  docs_url = 'https://documentation.onfido.com',
  base_url = 'https://api.onfido.com'
WHERE provider = 'onfido';

UPDATE kyc.provider_config SET
  color = '#7C5CFC',
  bg_color = '#7C5CFC20',
  abbreviation = 'PS',
  logo_filename = 'persona.jpg',
  docs_url = 'https://docs.withpersona.com',
  base_url = 'https://withpersona.com/api'
WHERE provider = 'persona';
```

**2. Create `kyc.health_checks` table**

```sql
CREATE TABLE kyc.health_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id VARCHAR(50) NOT NULL,  -- References provider_config.provider

    -- Health status
    status VARCHAR(50) NOT NULL,  -- 'healthy', 'degraded', 'unhealthy'
    response_time_ms INTEGER,     -- API response time
    error_message TEXT,           -- Error details if unhealthy

    -- Additional details
    details JSONB,                -- apiReachable, webhookConfigured, etc.

    -- Timestamp
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_provider FOREIGN KEY (provider_id)
      REFERENCES kyc.provider_config(provider)
      ON DELETE CASCADE
);

CREATE INDEX idx_health_checks_provider ON kyc.health_checks(provider_id, checked_at DESC);
CREATE INDEX idx_health_checks_status ON kyc.health_checks(status);
CREATE INDEX idx_health_checks_checked_at ON kyc.health_checks(checked_at DESC);

-- Partition by month for performance (optional)
-- CREATE TABLE kyc.health_checks_y2026m02 PARTITION OF kyc.health_checks
--   FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

COMMENT ON TABLE kyc.health_checks IS 'Provider API health check history';
```

**3. Create `kyc.provider_workflows` table**

```sql
CREATE TABLE kyc.provider_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id VARCHAR(50) NOT NULL REFERENCES kyc.provider_config(provider),

    -- Workflow details
    workflow_name VARCHAR(100) NOT NULL,  -- "standard-kyc", "enhanced-due-diligence"
    workflow_id VARCHAR(255),             -- External workflow ID from provider
    description TEXT,

    -- Configuration
    is_active BOOLEAN DEFAULT true,
    verification_level VARCHAR(50),       -- "standard", "enhanced", "accredited"

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(provider_id, workflow_name)
);

CREATE INDEX idx_provider_workflows_provider ON kyc.provider_workflows(provider_id);

-- Seed data
INSERT INTO kyc.provider_workflows (provider_id, workflow_name, verification_level) VALUES
  ('sumsub', 'standard-kyc', 'standard'),
  ('sumsub', 'enhanced-due-diligence', 'enhanced'),
  ('sumsub', 'poa-check', 'standard'),
  ('sumsub', 'liveness-only', 'standard'),
  ('onfido', 'us-standard', 'standard'),
  ('onfido', 'us-enhanced', 'enhanced'),
  ('onfido', 'us-accredited-investor', 'accredited'),
  ('persona', 'global-standard', 'standard'),
  ('persona', 'aml-enhanced', 'enhanced');

COMMENT ON TABLE kyc.provider_workflows IS 'Available verification workflows per provider';
```

**4. Create `kyc.webhook_logs` table**

```sql
CREATE TABLE kyc.webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id VARCHAR(50) NOT NULL REFERENCES kyc.provider_config(provider),

    -- Webhook data
    event_type VARCHAR(100) NOT NULL,  -- "applicant.verified", "applicant.declined"
    payload JSONB NOT NULL,            -- Full webhook payload
    signature VARCHAR(500),            -- Webhook signature for validation

    -- Processing
    status VARCHAR(50) NOT NULL,       -- "success", "failed", "retrying"
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,

    -- Metadata
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,                   -- Source IP for security

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_provider ON kyc.webhook_logs(provider_id);
CREATE INDEX idx_webhook_logs_status ON kyc.webhook_logs(status);
CREATE INDEX idx_webhook_logs_received_at ON kyc.webhook_logs(received_at DESC);
CREATE INDEX idx_webhook_logs_event_type ON kyc.webhook_logs(event_type);

-- Partition by month for performance
-- Auto-cleanup after 90 days
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM kyc.webhook_logs
  WHERE received_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE kyc.webhook_logs IS 'Webhook delivery history from KYC providers';
```

**5. Update `kyc.region_config` table**

```sql
-- Add provider assignment
ALTER TABLE kyc.region_config
ADD COLUMN provider_ids VARCHAR(50)[] DEFAULT '{}';  -- Array of provider IDs

-- Assign providers to regions
UPDATE kyc.region_config SET provider_ids = ARRAY['sumsub']
  WHERE name IN ('East Africa', 'Southern Africa');

UPDATE kyc.region_config SET provider_ids = ARRAY['onfido']
  WHERE name = 'United States';

UPDATE kyc.region_config SET provider_ids = ARRAY['persona']
  WHERE name IN ('European Union', 'Rest of World');

CREATE INDEX idx_region_config_provider_ids ON kyc.region_config USING GIN(provider_ids);
```

---

## Multi-Exchange Context

### **NOT APPLICABLE - Platform-Level Configuration**

KYC provider management is **platform-level**, not exchange-specific:
- Providers are configured once for the entire Stella platform
- All users (regardless of which exchanges they trade on) use the same KYC providers
- Regional routing determines which provider handles which user based on country, not exchange

**No exchange field needed** in provider configuration.

---

## Summary: KYC Providers Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|----------------------|
| **Provider Stats** | NestJS API | HTTP REST | On page load | Platform-level metrics |
| **Provider List** | NestJS API | HTTP REST | On page load | Includes masked credentials |
| **Health Status** | Phoenix ETS | HTTP REST | Real-time (5s) | Cached from GenServer health checks |
| **Test Connection** | NestJS API | HTTP REST | On demand | Calls external provider API |
| **Rotate Credentials** | NestJS API | HTTP POST | On action | Encrypted storage, audit logged |
| **Reveal Credentials** | NestJS API | HTTP REST | On demand (admin) | Decrypted, auto-hides after 30s |
| **Add Provider** | NestJS API | HTTP POST | On action | Creates new provider config |

**Schema Changes Required:**
1.  Update `kyc.provider_config` with branding/UI fields
2.  Create `kyc.health_checks` table for monitoring history
3.  Create `kyc.provider_workflows` table for workflow management
4.  Create `kyc.webhook_logs` table for delivery tracking
5.  Update `kyc.region_config` with provider assignment

**Phoenix GenServer Required:**
- `TradeEngine.KYC.ProviderHealthMonitor` - Continuous health monitoring (5s interval)
- Caches status in `:kyc_provider_health` ETS table
- Broadcasts status changes via PubSub

**Security Notes:**
- All credentials stored encrypted with `pgp_sym_encrypt`
- Reveal action logged in audit trail
- Frontend auto-hides revealed credentials after 30s
- Webhook signature validation required for all incoming webhooks
- IP address logging for webhook deliveries

---

## Frontend Implementation Notes

### WebSocket Connection (Optional - for real-time status updates)

If real-time provider status updates are desired:

```typescript
// Connect to Phoenix Channel
const channel = socket.channel("kyc:provider_health", {});

channel.on("provider_status_change", (payload) => {
  // payload: { providerId: "sumsub", status: "degraded" }
  updateProviderStatus(payload.providerId, payload.status);
});

channel.join()
  .receive("ok", () => console.log("Joined provider health channel"))
  .receive("error", (err) => console.error("Failed to join", err));
```

Alternatively, poll `GET /api/kyc/providers` every 10-30 seconds for status updates.

---

## Performance Considerations

1. **Health Check Frequency**: 5-second interval balances real-time monitoring with API rate limits
2. **ETS Caching**: Provider status cached in ETS for fast reads without database queries
3. **Credential Encryption**: All secrets encrypted at rest using PostgreSQL `pgp_crypto`
4. **Webhook Log Retention**: Auto-cleanup after 90 days to prevent table bloat
5. **Index Strategy**: Composite indexes on `(provider_id, checked_at DESC)` for efficient health history queries

---

## Testing Checklist

- [ ] Provider list loads with correct branding and status
- [ ] Health status updates every 5 seconds (if WebSocket connected)
- [ ] Test Connection action succeeds and updates status
- [ ] Show/Hide credentials works (admin-only)
- [ ] Rotate Keys action encrypts new credentials and logs audit event
- [ ] Reveal credentials decrypts and auto-hides after 30s
- [ ] Non-admin users see read-only view with info banner
- [ ] Add Provider creates new config and assigns workflows
- [ ] Webhook success rate calculates correctly (24h window)
- [ ] Provider health monitor GenServer runs continuously
- [ ] Degraded/unhealthy status triggers PubSub broadcast
- [ ] All credential access logged in audit trail

---

**[ê Previous: KYC Applicants](./19-kyc-applicants.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Settings í](./21-settings.md)**
