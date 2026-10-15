# Page 26: `/settings/infrastructure` - Infrastructure & Performance

**Route:** `/settings/infrastructure`
**Page Type:** Configuration Management
**User Persona:** Platform Admin / DevOps
**Real-time Requirements:** No

---

## UI Features & Requirements

**Mock Data Structure from page.tsx:5-22:**

```typescript
const JOBS_DATA = [
  { name: "Fee Calculation", desc: "Calculates and records platform fees per user", cron: "0 1 * * *", lastRun: "2h ago", nextRun: "22h", status: "ok" },
  { name: "Document Expiry Scan", desc: "Flags KYC documents expiring within 30 days", cron: "0 8 * * *", lastRun: "16h ago", nextRun: "8h", status: "ok" },
  { name: "AML Watchlist Refresh", desc: "Re-screens all users against updated lists", cron: "0 3 * * 0", lastRun: "3d ago", nextRun: "4d", status: "ok" },
  { name: "Metrics Aggregation", desc: "Aggregates hourly metrics into daily summaries", cron: "5 0 * * *", lastRun: "2h ago", nextRun: "22h", status: "ok" },
  { name: "Position Reconciliation", desc: "Reconciles bot positions against exchange state", cron: "*/15 * * * *", lastRun: "3m ago", nextRun: "12m", status: "ok" },
  { name: "Inactive Bot Cleanup", desc: "Archives bots with no activity for 30+ days", cron: "0 4 1 * *", lastRun: "18d ago", nextRun: "13d", status: "warn" },
];

const FEATURE_FLAGS = [
  { key: "multi_exchange_arbitrage", name: "Multi-Exchange Arbitrage", desc: "Allow bots to execute cross-exchange arbitrage simultaneously", prod: true, staging: true, dev: true },
  { key: "enhanced_due_diligence", name: "Enhanced Due Diligence KYC", desc: "Require enhanced KYC for accounts above 10M UGX AUM", prod: true, staging: true, dev: true },
  { key: "auto_circuit_breaker", name: "Auto Circuit Breaker", desc: "Automatically pause all bots when platform drawdown exceeds threshold", prod: true, staging: true, dev: true },
  { key: "user_api_access", name: "User API Access", desc: "Allow Pro/Enterprise users to connect external tools via API", prod: false, staging: true, dev: true },
  { key: "websocket_v2", name: "WebSocket v2 Protocol", desc: "New optimised WebSocket protocol with binary framing", prod: false, staging: false, dev: true },
  { key: "referral_programme", name: "Referral Programme", desc: "Enable referral code generation and commission tracking", prod: false, staging: true, dev: true },
  { key: "strategy_marketplace", name: "Strategy Marketplace", desc: "Allow users to publish and subscribe to community strategies", prod: false, staging: false, dev: false },
];
```

**Connection Pool Defaults:**
- PostgreSQL Pool Size: `20`
- TimescaleDB Pool Size: `10`
- Redis Max Connections: `50`
- RabbitMQ Channel Pool: `25`

**Cache TTL Defaults (seconds):**
- Bot state: `5s`
- User profile: `300s` (5 min)
- KYC status: `900s` (15 min)
- Exchange prices: `1s`
- Analytics aggregates: `3600s` (1 hour)
- Subscription tier: `600s` (10 min)

**UI Components:**

1. **Connection Pool Sizes** (page.tsx:49-73)
   - 4 editable fields with hints
   - Warning: "Requires service restart to take effect"

2. **Cache TTL Policy** (page.tsx:76-101)
   - 6 editable TTL fields in seconds

3. **Background Jobs** (page.tsx:104-144)
   - Table with columns: Job, Schedule (cron), Last Run, Next Run, Status
   - Status badges: `"ok"` (green) or `"warn"` (amber)
   - Play button (▶) to trigger manual run

4. **Feature Flags** (page.tsx:147-211)
   - Environment filter: `prod`, `staging`, `dev`
   - Each flag shows status for all 3 environments
   - Toggle to enable/disable per environment
   - Save Changes / Discard Changes buttons when dirty

---

## Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| **Connection Pool Sizes** | postgres_pool, timescale_pool, redis_max, rabbitmq_pool | `platform.infrastructure_settings` | REST API | On page load |
| **Cache TTL Policy** | bot_state_ttl, user_profile_ttl, kyc_status_ttl, prices_ttl, analytics_ttl, tier_ttl | `platform.infrastructure_settings` | REST API | On page load |
| **Background Jobs** | name, description, cron_schedule, last_run_at, next_run_at, status | Phoenix `Oban.Job` + custom monitoring | REST API | On page load |
| **Feature Flags** | flag_key, name, description, enabled_prod, enabled_staging, enabled_dev | `platform.feature_flags` | REST API | On page load |
| **Update Settings** | All config updates | `platform.infrastructure_settings` UPDATE | REST API | On save |
| **Update Feature Flags** | Toggle flag per environment | `platform.feature_flags` UPDATE | REST API | On save |
| **Trigger Job Manually** | Run background job | Phoenix Oban API | REST API | On demand |

---

## Database Schema Requirements

### New Tables

**1. `platform.infrastructure_settings`** (Singleton table)

```sql
CREATE TABLE platform.infrastructure_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Connection pool sizes
  postgres_pool_size INTEGER NOT NULL DEFAULT 20,
    CHECK (postgres_pool_size >= 5 AND postgres_pool_size <= 100),
  timescale_pool_size INTEGER NOT NULL DEFAULT 10,
    CHECK (timescale_pool_size >= 5 AND timescale_pool_size <= 50),
  redis_max_connections INTEGER NOT NULL DEFAULT 50,
    CHECK (redis_max_connections >= 10 AND redis_max_connections <= 200),
  rabbitmq_channel_pool INTEGER NOT NULL DEFAULT 25,
    CHECK (rabbitmq_channel_pool >= 5 AND rabbitmq_channel_pool <= 100),

  -- Cache TTL (in seconds)
  bot_state_ttl INTEGER NOT NULL DEFAULT 5,
  user_profile_ttl INTEGER NOT NULL DEFAULT 300,
  kyc_status_ttl INTEGER NOT NULL DEFAULT 900,
  exchange_prices_ttl INTEGER NOT NULL DEFAULT 1,
  analytics_ttl INTEGER NOT NULL DEFAULT 3600,
  subscription_tier_ttl INTEGER NOT NULL DEFAULT 600,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_infra_settings CHECK (id = id) -- Enforce singleton
);

CREATE UNIQUE INDEX idx_infra_settings_singleton ON platform.infrastructure_settings ((1));

-- Insert default settings
INSERT INTO platform.infrastructure_settings (id)
VALUES (uuid_generate_v4())
ON CONFLICT DO NOTHING;
```

**2. `platform.feature_flags`**

```sql
CREATE TABLE platform.feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key VARCHAR(100) UNIQUE NOT NULL, -- 'multi_exchange_arbitrage', 'user_api_access', etc.

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Environment-specific toggles
  enabled_prod BOOLEAN NOT NULL DEFAULT false,
  enabled_staging BOOLEAN NOT NULL DEFAULT false,
  enabled_dev BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT flag_key_lowercase CHECK (flag_key = LOWER(flag_key))
);

CREATE UNIQUE INDEX idx_feature_flags_key ON platform.feature_flags (flag_key);
CREATE INDEX idx_feature_flags_prod ON platform.feature_flags (enabled_prod) WHERE enabled_prod = true;
```

**3. `platform.background_job_runs`** (Log of manual job triggers)

```sql
CREATE TABLE platform.background_job_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name VARCHAR(255) NOT NULL,

  trigger_type VARCHAR(50) NOT NULL, -- 'scheduled', 'manual'
    CHECK (trigger_type IN ('scheduled', 'manual')),

  triggered_by_user_id UUID REFERENCES auth.users(id), -- NULL for scheduled
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status VARCHAR(50) NOT NULL, -- 'running', 'completed', 'failed'
    CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX idx_job_runs_job ON platform.background_job_runs (job_name, triggered_at DESC);
CREATE INDEX idx_job_runs_status ON platform.background_job_runs (status, triggered_at DESC);
```

### Seed Data for Feature Flags

```sql
INSERT INTO platform.feature_flags (flag_key, name, description, enabled_prod, enabled_staging, enabled_dev) VALUES
('multi_exchange_arbitrage', 'Multi-Exchange Arbitrage', 'Allow bots to execute cross-exchange arbitrage simultaneously', true, true, true),
('enhanced_due_diligence', 'Enhanced Due Diligence KYC', 'Require enhanced KYC for accounts above 10M UGX AUM', true, true, true),
('auto_circuit_breaker', 'Auto Circuit Breaker', 'Automatically pause all bots when platform drawdown exceeds threshold', true, true, true),
('user_api_access', 'User API Access', 'Allow Pro/Enterprise users to connect external tools via API', false, true, true),
('websocket_v2', 'WebSocket v2 Protocol', 'New optimised WebSocket protocol with binary framing', false, false, true),
('referral_programme', 'Referral Programme', 'Enable referral code generation and commission tracking', false, true, true),
('strategy_marketplace', 'Strategy Marketplace', 'Allow users to publish and subscribe to community strategies', false, false, false)
ON CONFLICT (flag_key) DO NOTHING;
```

---

## NestJS REST API Endpoints

### 1. `GET /api/settings/infrastructure` - Load Infrastructure Settings

**Purpose:** Load all infrastructure configuration settings
**Authentication:** Admin/DevOps role required

**Response:**

```typescript
interface InfrastructureSettingsResponse {
  infrastructure_settings: {
    postgres_pool_size: number;
    timescale_pool_size: number;
    redis_max_connections: number;
    rabbitmq_channel_pool: number;
    bot_state_ttl: number;
    user_profile_ttl: number;
    kyc_status_ttl: number;
    exchange_prices_ttl: number;
    analytics_ttl: number;
    subscription_tier_ttl: number;
    updated_at: string;
  };
  background_jobs: BackgroundJob[];
  feature_flags: FeatureFlag[];
}

interface BackgroundJob {
  name: string;
  description: string;
  cron_schedule: string;
  last_run_at: string | null;
  next_run_at: string | null;
  status: 'ok' | 'warn' | 'error';
}

interface FeatureFlag {
  id: string;
  flag_key: string;
  name: string;
  description: string;
  enabled_prod: boolean;
  enabled_staging: boolean;
  enabled_dev: boolean;
  updated_at: string;
}

// GET /api/settings/infrastructure
{
  "infrastructure_settings": {
    "postgres_pool_size": 20,
    "timescale_pool_size": 10,
    "redis_max_connections": 50,
    "rabbitmq_channel_pool": 25,
    "bot_state_ttl": 5,
    "user_profile_ttl": 300,
    "kyc_status_ttl": 900,
    "exchange_prices_ttl": 1,
    "analytics_ttl": 3600,
    "subscription_tier_ttl": 600,
    "updated_at": "2026-02-21T10:00:00Z"
  },
  "background_jobs": [
    {
      "name": "Fee Calculation",
      "description": "Calculates and records platform fees per user",
      "cron_schedule": "0 1 * * *",
      "last_run_at": "2026-02-21T01:00:00Z",
      "next_run_at": "2026-02-22T01:00:00Z",
      "status": "ok"
    },
    // ... 5 more jobs
  ],
  "feature_flags": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "flag_key": "multi_exchange_arbitrage",
      "name": "Multi-Exchange Arbitrage",
      "description": "Allow bots to execute cross-exchange arbitrage simultaneously",
      "enabled_prod": true,
      "enabled_staging": true,
      "enabled_dev": true,
      "updated_at": "2026-02-20T15:00:00Z"
    },
    // ... 6 more flags
  ]
}
```

**Implementation:**

```typescript
async getInfrastructureSettings(): Promise<InfrastructureSettingsResponse> {
  const settings = await this.settingsRepo.findOne({});
  const flags = await this.flagsRepo.find({ order: { flag_key: 'ASC' } });
  const jobs = await this.getBackgroundJobsStatus();

  return {
    infrastructure_settings: {
      postgres_pool_size: settings.postgres_pool_size,
      timescale_pool_size: settings.timescale_pool_size,
      redis_max_connections: settings.redis_max_connections,
      rabbitmq_channel_pool: settings.rabbitmq_channel_pool,
      bot_state_ttl: settings.bot_state_ttl,
      user_profile_ttl: settings.user_profile_ttl,
      kyc_status_ttl: settings.kyc_status_ttl,
      exchange_prices_ttl: settings.exchange_prices_ttl,
      analytics_ttl: settings.analytics_ttl,
      subscription_tier_ttl: settings.subscription_tier_ttl,
      updated_at: settings.updated_at.toISOString(),
    },
    background_jobs: jobs,
    feature_flags: flags.map(f => ({
      id: f.id,
      flag_key: f.flag_key,
      name: f.name,
      description: f.description,
      enabled_prod: f.enabled_prod,
      enabled_staging: f.enabled_staging,
      enabled_dev: f.enabled_dev,
      updated_at: f.updated_at.toISOString(),
    })),
  };
}

private async getBackgroundJobsStatus(): Promise<BackgroundJob[]> {
  // Query Oban or custom job monitoring system
  const jobs = await this.phoenixClient.get('/api/phoenix/jobs/status');
  return jobs.data.jobs;
}
```

### 2. `PUT /api/settings/infrastructure` - Update Infrastructure Settings

**Purpose:** Save changes to connection pools and cache TTLs
**Authentication:** Admin/DevOps + audit logging

**Request:**

```typescript
{
  "postgres_pool_size": 25,
  "timescale_pool_size": 15,
  "redis_max_connections": 60,
  "rabbitmq_channel_pool": 30,
  "bot_state_ttl": 10,
  "user_profile_ttl": 600,
  "kyc_status_ttl": 1800,
  "exchange_prices_ttl": 2,
  "analytics_ttl": 7200,
  "subscription_tier_ttl": 900
}
```

**Response:**

```typescript
{
  "infrastructure_settings": { /* Updated settings */ },
  "message": "Infrastructure settings updated. Note: Connection pool changes require service restart."
}
```

**Implementation:**

```typescript
async updateInfrastructureSettings(data: UpdateInfraSettingsDto, adminUserId: string) {
  const settings = await this.settingsRepo.findOne({});

  const updated = await this.settingsRepo.save({
    ...settings,
    ...data,
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  // Audit log
  await this.auditService.log({
    action: 'infrastructure_settings_updated',
    resource_type: 'infrastructure_settings',
    resource_id: settings.id,
    admin_user_id: adminUserId,
    metadata: { changes: data },
  });

  // Notify if pool sizes changed
  const poolChanged =
    data.postgres_pool_size !== settings.postgres_pool_size ||
    data.timescale_pool_size !== settings.timescale_pool_size ||
    data.redis_max_connections !== settings.redis_max_connections ||
    data.rabbitmq_channel_pool !== settings.rabbitmq_channel_pool;

  const message = poolChanged
    ? 'Infrastructure settings updated. Note: Connection pool changes require service restart.'
    : 'Infrastructure settings updated successfully.';

  return { infrastructure_settings: updated, message };
}
```

### 3. `PUT /api/settings/infrastructure/feature-flags/:id` - Update Feature Flag

**Purpose:** Toggle feature flag for a specific environment
**Authentication:** Admin role

**Request:**

```typescript
{
  "environment": "prod", // 'prod', 'staging', or 'dev'
  "enabled": true
}
```

**Response:**

```typescript
{
  "feature_flag": FeatureFlag, // Updated flag object
  "message": "Feature 'User API Access' enabled in prod"
}
```

**Implementation:**

```typescript
async updateFeatureFlag(
  flagId: string,
  environment: 'prod' | 'staging' | 'dev',
  enabled: boolean,
  adminUserId: string
) {
  const flag = await this.flagsRepo.findOneOrFail({ where: { id: flagId } });

  const envField = `enabled_${environment}`;
  const updated = await this.flagsRepo.save({
    ...flag,
    [envField]: enabled,
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  // Audit log
  await this.auditService.log({
    action: 'feature_flag_updated',
    resource_type: 'feature_flag',
    resource_id: flagId,
    admin_user_id: adminUserId,
    metadata: {
      flag_key: flag.flag_key,
      environment,
      enabled,
    },
  });

  // Broadcast to Phoenix to invalidate cache
  await this.phoenixClient.post('/api/phoenix/feature-flags/invalidate', {
    flag_key: flag.flag_key,
    environment,
  });

  const action = enabled ? 'enabled' : 'disabled';
  return {
    feature_flag: updated,
    message: `Feature '${flag.name}' ${action} in ${environment}`,
  };
}
```

### 4. `POST /api/settings/infrastructure/jobs/:jobName/trigger` - Trigger Background Job

**Purpose:** Manually trigger a background job to run immediately
**Authentication:** Admin/DevOps role

**Request:**

```typescript
// POST /api/settings/infrastructure/jobs/fee-calculation/trigger
// No body required
```

**Response:**

```typescript
{
  "job_run_id": "660e8400-e29b-41d4-a716-446655440000",
  "job_name": "Fee Calculation",
  "status": "running",
  "triggered_at": "2026-02-21T10:40:00Z",
  "message": "Job 'Fee Calculation' triggered successfully"
}
```

**Implementation:**

```typescript
async triggerJob(jobName: string, adminUserId: string) {
  // Create job run record
  const jobRun = await this.jobRunsRepo.save({
    job_name: jobName,
    trigger_type: 'manual',
    triggered_by_user_id: adminUserId,
    triggered_at: new Date(),
    status: 'running',
  });

  // Call Phoenix Oban API to trigger job
  const result = await this.phoenixClient.post('/api/phoenix/jobs/trigger', {
    job_name: jobName,
    job_run_id: jobRun.id,
  });

  // Audit log
  await this.auditService.log({
    action: 'background_job_triggered',
    resource_type: 'background_job',
    resource_id: jobRun.id,
    admin_user_id: adminUserId,
    metadata: { job_name: jobName },
  });

  return {
    job_run_id: jobRun.id,
    job_name: jobName,
    status: 'running',
    triggered_at: jobRun.triggered_at.toISOString(),
    message: `Job '${jobName}' triggered successfully`,
  };
}
```

---

## Phoenix Feature Flag Service

**Purpose:** Provide fast feature flag checks for real-time operations

**ETS Cache Implementation:**

```elixir
defmodule TradeEngine.FeatureFlags do
  use GenServer

  @cache_table :feature_flags_cache
  @cache_ttl :timer.minutes(5) # Refresh every 5 minutes

  def init(_opts) do
    :ets.new(@cache_table, [:named_table, :set, :public, read_concurrency: true])
    refresh_flags()
    schedule_refresh()
    {:ok, %{}}
  end

  def enabled?(flag_key, environment \\ :prod) do
    case :ets.lookup(@cache_table, {flag_key, environment}) do
      [{_key, enabled}] -> enabled
      [] -> false # Default to disabled if not found
    end
  end

  defp refresh_flags do
    flags = Repo.all(FeatureFlag)

    Enum.each(flags, fn flag ->
      :ets.insert(@cache_table, {{flag.flag_key, :prod}, flag.enabled_prod})
      :ets.insert(@cache_table, {{flag.flag_key, :staging}, flag.enabled_staging})
      :ets.insert(@cache_table, {{flag.flag_key, :dev}, flag.enabled_dev})
    end)
  end

  def invalidate(flag_key, environment) do
    # Called when flag is updated via API
    flag = Repo.get_by!(FeatureFlag, flag_key: flag_key)
    enabled = case environment do
      "prod" -> flag.enabled_prod
      "staging" -> flag.enabled_staging
      "dev" -> flag.enabled_dev
    end

    :ets.insert(@cache_table, {{flag_key, String.to_atom(environment)}, enabled})
  end

  defp schedule_refresh do
    Process.send_after(self(), :refresh, @cache_ttl)
  end

  def handle_info(:refresh, state) do
    refresh_flags()
    schedule_refresh()
    {:noreply, state}
  end
end
```

**Usage in Bot Code:**

```elixir
defmodule TradeEngine.Bots.Worker do
  def execute_strategy(bot) do
    if FeatureFlags.enabled?("multi_exchange_arbitrage") do
      # Allow cross-exchange arbitrage
      execute_multi_exchange_arbitrage(bot)
    else
      # Standard single-exchange execution
      execute_single_exchange(bot)
    end
  end
end
```

---

## Data Flow Summary

```
[Page Load]
   │
   └─> GET /api/settings/infrastructure (NestJS)
         │
         ├─> Query platform.infrastructure_settings (PostgreSQL)
         ├─> Query platform.feature_flags (PostgreSQL)
         ├─> Query Phoenix Oban for background job status
         └─> Return { infrastructure_settings, background_jobs[], feature_flags[] }

[Admin Action: Update Infrastructure Settings]
   │
   └─> PUT /api/settings/infrastructure (NestJS)
         │
         ├─> Update platform.infrastructure_settings (PostgreSQL)
         ├─> Log audit trail
         └─> Return updated settings + restart warning if pool changed

[Admin Action: Toggle Feature Flag]
   │
   └─> PUT /api/settings/infrastructure/feature-flags/:id (NestJS)
         │
         ├─> Update platform.feature_flags (PostgreSQL)
         ├─> Log audit trail
         ├─> Call Phoenix POST /api/phoenix/feature-flags/invalidate
         │     └─> Phoenix FeatureFlags GenServer invalidates ETS cache
         └─> Return updated flag

[Admin Action: Trigger Background Job]
   │
   └─> POST /api/settings/infrastructure/jobs/:jobName/trigger (NestJS)
         │
         ├─> Create record in platform.background_job_runs
         ├─> Call Phoenix POST /api/phoenix/jobs/trigger
         │     └─> Phoenix Oban enqueues job immediately
         ├─> Log audit trail
         └─> Return { job_run_id, status: 'running' }

[Background: Feature Flags Cache Refresh - Every 5 minutes]
   │
   └─> Phoenix FeatureFlags GenServer
         │
         ├─> Query platform.feature_flags (PostgreSQL)
         └─> Update ETS cache (:feature_flags_cache)

[Runtime: Feature Flag Check]
   │
   └─> Bot Worker needs to check if "multi_exchange_arbitrage" is enabled
         │
         └─> FeatureFlags.enabled?("multi_exchange_arbitrage")
               │
               └─> Lookup in ETS cache (sub-millisecond)
```

---

## Summary Table

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Infrastructure settings | `platform.infrastructure_settings` | NestJS REST | HTTP | No cache (singleton) |
| Background jobs status | Phoenix Oban + `platform.background_job_runs` | NestJS REST | HTTP | No cache |
| Feature flags list | `platform.feature_flags` | NestJS REST | HTTP | No cache |
| Update infra settings | `platform.infrastructure_settings` UPDATE | NestJS REST | HTTP | No cache |
| Update feature flag | `platform.feature_flags` UPDATE + Phoenix ETS invalidate | NestJS REST | HTTP | Phoenix ETS (5min TTL) |
| Trigger background job | Phoenix Oban API | NestJS REST → Phoenix | HTTP | No cache |
| Feature flag runtime check | Phoenix ETS cache | Phoenix GenServer | In-memory | ETS (5min TTL, refresh) |

---

## Frontend Implementation Notes

**Load Infrastructure Settings:**

```typescript
// hooks/useInfrastructureSettings.ts
export function useInfrastructureSettings() {
  const [settings, setSettings] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [flags, setFlags] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch('/api/settings/infrastructure')
      .then(res => res.json())
      .then(data => {
        setSettings(data.infrastructure_settings);
        setJobs(data.background_jobs);
        setFlags(data.feature_flags);
      });
  }, []);

  return { settings, jobs, flags, dirty, setDirty };
}
```

**Save Settings:**

```typescript
async function saveInfraSettings(updates: Partial<InfrastructureSettings>) {
  const response = await fetch('/api/settings/infrastructure', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  const result = await response.json();
  toast.success(result.message);
  setDirty(false);
}
```

**Toggle Feature Flag:**

```typescript
async function toggleFlag(flagId: string, environment: string, enabled: boolean) {
  const response = await fetch(`/api/settings/infrastructure/feature-flags/${flagId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ environment, enabled }),
  });

  const result = await response.json();
  setFlags(prev => prev.map(f => f.id === flagId ? result.feature_flag : f));
  toast.success(result.message);
}
```

**Trigger Background Job:**

```typescript
async function triggerJob(jobName: string) {
  const response = await fetch(`/api/settings/infrastructure/jobs/${jobName}/trigger`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const result = await response.json();
  toast.success(result.message);

  // Poll for job status
  setTimeout(() => {
    // Refresh jobs list
    fetch('/api/settings/infrastructure').then(/* ... */);
  }, 2000);
}
```

---

## Performance Considerations

1. **Feature Flag ETS Cache:** Use ETS for sub-millisecond feature flag checks. Refresh every 5 minutes from database.

2. **Connection Pool Restart Warning:** Show prominent warning that pool size changes require service restart. Provide link to deployment docs.

3. **Background Job Status:** Cache job status in Redis for 60 seconds to avoid hammering Phoenix Oban on every page load.

4. **Feature Flag Propagation:** When flag is toggled, invalidate ETS cache immediately via Phoenix API call to ensure changes take effect within seconds.

5. **Audit Logging:** Log all infrastructure changes with before/after values for compliance and debugging.

---

## Testing Checklist

- [ ] Infrastructure settings load correctly on page load
- [ ] Connection pool sizes can be updated
- [ ] Cache TTL values can be updated
- [ ] Save shows warning message if pool sizes changed
- [ ] Background jobs table displays correct cron schedule, last run, next run
- [ ] Job status badges show correct colors (ok = green, warn = amber)
- [ ] Play button triggers job and shows success message
- [ ] Feature flags list displays all flags with 3 environment toggles
- [ ] Environment filter (prod/staging/dev) highlights selected environment
- [ ] Toggle feature flag updates database and invalidates Phoenix ETS cache
- [ ] Feature flag changes take effect within 5 seconds
- [ ] Dirty state triggers Save/Discard buttons
- [ ] Discard button resets form to original values
- [ ] Audit logs capture all infrastructure setting changes
- [ ] Audit logs capture all feature flag toggles with environment info

---

**[← Previous: Exchanges](./25-settings-exchanges.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Notifications →](./27-settings-notifications.md)**
