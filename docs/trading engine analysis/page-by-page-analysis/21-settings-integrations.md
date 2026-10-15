# Page 21: `/settings/integrations` - Integrations & Webhooks

**Route:** `/settings/integrations`
**Page Type:** Configuration Management
**User Persona:** Platform Admin
**Real-time Requirements:** No (form-based updates)

---

## UI Features & Requirements

### Mock Data Structure (page.tsx:3-18)

```typescript
const integrations = [
  { name: "Xero", icon: "📊", category: "Accounting", status: "connected" },
  { name: "Slack", icon: "💬", category: "Alerting", status: "connected" },
  { name: "PagerDuty", icon: "🚨", category: "Incident", status: "connected" },
  { name: "Mixpanel", icon: "📈", category: "Analytics", status: "connected" },
  { name: "Intercom", icon: "💭", category: "Support", status: "disconnected" },
  { name: "HubSpot", icon: "🏷", category: "CRM", status: "disconnected" },
];

const webhooks = [
  {
    url: "https://hooks.slack.com/services/T0••••/B0••••/x••••",
    events: ["platform.alert", "bot.kill"],
    active: true
  },
  {
    url: "https://api.pagerduty.com/v2/enqueue/••••••••",
    events: ["platform.alert.critical"],
    active: true
  },
  {
    url: "https://client-api.example.com/stella/events",
    events: ["kyc.approved", "kyc.declined", "bot.started", "bot.stopped"],
    active: true
  },
  {
    url: "https://app.eu.xero.com/api.xro/2.0/webhook/••••",
    events: ["billing.invoice", "billing.payment"],
    active: false
  },
];
```

### UI Components

**1. Third-Party Integrations Grid (page.tsx:31-75)**

Integration cards showing:
- Name, icon, category
- Status: `connected` | `disconnected`
- Description
- Configure/Connect button

**2. Outbound Webhooks List (page.tsx:78-132)**

Webhook rows showing:
- URL (masked credentials)
- Event subscriptions (tags): e.g., "platform.alert", "bot.kill", "kyc.approved"
- Status: `active` | `inactive`
- Actions: Test, Edit, Remove
- Add Webhook button
- Rotate Signing Key button

**3. HMAC Signature Notice (page.tsx:127-131)**
- Info about HMAC-SHA256 signing
- X-Stella-Signature header verification

---

## Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| Integration Cards | name, category, status, credentials | `platform.integrations` | REST API | On page load |
| Webhook List | url, events, active, created_at | `platform.outbound_webhooks` | REST API | On page load |
| Add Webhook | url, events, signing_secret | `platform.outbound_webhooks` INSERT | REST API | On demand |
| Update Webhook | events, active | `platform.outbound_webhooks` UPDATE | REST API | On demand |
| Delete Webhook | Soft delete | `platform.outbound_webhooks` | REST API | On demand |
| Test Webhook | Send test payload | Phoenix webhook dispatcher | REST API | On demand |
| Rotate Signing Key | Generate new secret | `platform.webhook_signing_keys` | REST API | On demand |

---

## Database Schema Requirements

### New Tables

**1. `platform.integrations`**

```sql
CREATE TABLE platform.integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  integration_key VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  icon VARCHAR(10),
  description TEXT,

  status VARCHAR(50) NOT NULL DEFAULT 'disconnected',
    CHECK (status IN ('connected', 'disconnected', 'error')),

  credentials_encrypted BYTEA,

  config JSONB NOT NULL DEFAULT '{}',

  last_synced_at TIMESTAMPTZ,
  last_error TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT integration_key_lowercase CHECK (integration_key = LOWER(integration_key))
);

CREATE INDEX idx_integrations_status ON platform.integrations (status);
CREATE INDEX idx_integrations_active ON platform.integrations (is_active) WHERE is_active = true;
```

**2. `platform.outbound_webhooks`**

```sql
CREATE TABLE platform.outbound_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  url VARCHAR(500) NOT NULL,
  events TEXT[] NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT true,

  signing_secret VARCHAR(64) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES auth.users(id),

  total_deliveries INTEGER NOT NULL DEFAULT 0,
  successful_deliveries INTEGER NOT NULL DEFAULT 0,
  failed_deliveries INTEGER NOT NULL DEFAULT 0,
  last_delivery_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_failure_reason TEXT,

  CONSTRAINT webhook_url_valid CHECK (url ~ '^https?://')
);

CREATE INDEX idx_outbound_webhooks_active ON platform.outbound_webhooks (is_active) WHERE is_active = true;
CREATE INDEX idx_outbound_webhooks_events ON platform.outbound_webhooks USING GIN (events);
```

**3. `platform.webhook_deliveries`**

```sql
CREATE TABLE platform.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES platform.outbound_webhooks(id) ON DELETE CASCADE,

  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,

  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,

  success BOOLEAN NOT NULL,
  error_message TEXT,

  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_webhook_deliveries_webhook ON platform.webhook_deliveries (webhook_id, delivered_at DESC);
CREATE INDEX idx_webhook_deliveries_event ON platform.webhook_deliveries (event_type, delivered_at DESC);
CREATE INDEX idx_webhook_deliveries_recent ON platform.webhook_deliveries (delivered_at DESC)
  WHERE delivered_at > NOW() - INTERVAL '7 days';
```

**4. `platform.webhook_signing_keys`**

```sql
CREATE TABLE platform.webhook_signing_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  signing_secret VARCHAR(64) UNIQUE NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ,

  is_active BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT only_one_active_key CHECK (is_active = false OR retired_at IS NULL)
);

CREATE UNIQUE INDEX idx_webhook_signing_keys_active ON platform.webhook_signing_keys (is_active)
  WHERE is_active = true;
```

---

## NestJS REST API Endpoints

### 1. `GET /api/settings/integrations` - Load All Integrations and Webhooks

**Authentication:** Admin role required

**Response:**
```typescript
interface IntegrationsResponse {
  integrations: Integration[];
  webhooks: OutboundWebhook[];
  current_signing_key: string;
}

interface Integration {
  id: string;
  integration_key: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  status: 'connected' | 'disconnected' | 'error';
  last_synced_at: string | null;
  last_error: string | null;
}

interface OutboundWebhook {
  id: string;
  url: string; // Masked
  events: string[];
  is_active: boolean;
  created_at: string;
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  last_delivery_at: string | null;
}
```

**Implementation:**
```typescript
async getIntegrationsAndWebhooks(): Promise<IntegrationsResponse> {
  const integrations = await this.integrationsRepo.find({ where: { is_active: true } });
  const webhooks = await this.webhooksRepo.find({ order: { created_at: 'DESC' } });
  const activeKey = await this.signingKeysRepo.findOne({ where: { is_active: true } });

  return {
    integrations: integrations.map(i => ({ ...i })),
    webhooks: webhooks.map(w => ({ ...w, url: this.maskUrl(w.url) })),
    current_signing_key: activeKey?.signing_secret || '',
  };
}

private maskUrl(url: string): string {
  return url.replace(/([a-zA-Z0-9]{8})[a-zA-Z0-9]{8,}/g, '$1••••');
}
```

### 2. `POST /api/settings/integrations/webhooks` - Add Webhook

**Authentication:** Admin role

**Request:**
```typescript
{
  "url": "https://api.example.com/webhooks/stella",
  "events": ["bot.started", "bot.stopped", "platform.alert"]
}
```

**Response:**
```typescript
{
  "webhook": OutboundWebhook,
  "signing_secret": "whsec_abc123...",
  "message": "Webhook added successfully. Save the signing secret - it won't be shown again."
}
```

**Implementation:**
```typescript
async addWebhook(data: CreateWebhookDto, adminUserId: string) {
  const activeKey = await this.signingKeysRepo.findOne({ where: { is_active: true } });

  const webhook = await this.webhooksRepo.save({
    url: data.url,
    events: data.events,
    is_active: true,
    signing_secret: activeKey.signing_secret,
    created_by_user_id: adminUserId,
  });

  await this.auditService.log({
    action: 'webhook_added',
    resource_id: webhook.id,
    admin_user_id: adminUserId,
  });

  return { webhook, signing_secret: webhook.signing_secret, message: '...' };
}
```

### 3. `PUT /api/settings/integrations/webhooks/:id` - Update Webhook

**Request:**
```typescript
{
  "events": ["bot.started", "bot.stopped", "platform.alert", "kyc.approved"],
  "is_active": true
}
```

**Response:**
```typescript
{
  "webhook": OutboundWebhook,
  "message": "Webhook updated successfully"
}
```

### 4. `DELETE /api/settings/integrations/webhooks/:id` - Remove Webhook

**Response:**
```typescript
{
  "message": "Webhook removed successfully"
}
```

### 5. `POST /api/settings/integrations/webhooks/:id/test` - Test Webhook

**Response:**
```typescript
{
  "success": true,
  "response_status": 200,
  "response_time_ms": 342,
  "message": "Test webhook delivered successfully"
}
```

**Implementation:**
```typescript
async testWebhook(webhookId: string, adminUserId: string) {
  const webhook = await this.webhooksRepo.findOneOrFail({ where: { id: webhookId } });

  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test webhook from Stella Platform' },
  };

  const result = await this.phoenixClient.post('/api/phoenix/webhooks/dispatch', {
    webhook_id: webhookId,
    payload: testPayload,
  });

  return {
    success: result.data.success,
    response_status: result.data.response_status,
    response_time_ms: result.data.response_time_ms,
    message: result.data.success ? 'Test delivered' : `Failed: ${result.data.error_message}`,
  };
}
```

### 6. `POST /api/settings/integrations/rotate-signing-key` - Rotate Signing Key

**Response:**
```typescript
{
  "new_signing_key": "REDACTED",
  "old_signing_key_retired_at": "2026-02-21T10:35:00Z",
  "message": "Signing key rotated. Update all webhook endpoints to use the new secret."
}
```

**Implementation:**
```typescript
async rotateSigningKey(adminUserId: string) {
  const oldKey = await this.signingKeysRepo.findOne({ where: { is_active: true } });

  if (oldKey) {
    await this.signingKeysRepo.update(oldKey.id, {
      is_active: false,
      retired_at: new Date(),
    });
  }

  const newSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;
  const newKey = await this.signingKeysRepo.save({
    signing_secret: newSecret,
    is_active: true,
  });

  await this.webhooksRepo.update({}, { signing_secret: newSecret });

  await this.auditService.log({
    action: 'webhook_signing_key_rotated',
    admin_user_id: adminUserId,
  });

  return { new_signing_key: newSecret, message: '...' };
}
```

---

## Phoenix GenServer: `WebhookDispatcher`

**Purpose:** Dispatch outbound webhooks for platform events.

**Implementation:**

```elixir
defmodule TradeEngine.Webhooks.Dispatcher do
  use GenServer

  def init(_opts) do
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, "platform:events")
    {:ok, %{}}
  end

  def handle_info({:platform_event, event_type, payload}, state) do
    webhooks = Repo.all(
      from w in OutboundWebhook,
      where: ^event_type = ANY(w.events) and w.is_active == true
    )

    Enum.each(webhooks, fn webhook ->
      Task.start(fn -> dispatch_webhook(webhook, event_type, payload) end)
    end)

    {:noreply, state}
  end

  defp dispatch_webhook(webhook, event_type, payload) do
    start_time = System.monotonic_time(:millisecond)

    case HTTPoison.post(webhook.url, Jason.encode!(payload), [
      {"Content-Type", "application/json"},
      {"X-Stella-Signature", generate_signature(payload, webhook.signing_secret)},
      {"X-Stella-Event", event_type}
    ], timeout: 5000) do
      {:ok, %{status_code: status}} when status in 200..299 ->
        response_time = System.monotonic_time(:millisecond) - start_time

        Repo.update!(OutboundWebhook.changeset(webhook, %{
          total_deliveries: webhook.total_deliveries + 1,
          successful_deliveries: webhook.successful_deliveries + 1,
          last_delivery_at: DateTime.utc_now(),
          last_success_at: DateTime.utc_now()
        }))

        Repo.insert!(%WebhookDelivery{
          webhook_id: webhook.id,
          event_type: event_type,
          payload: payload,
          response_status: status,
          response_time_ms: response_time,
          success: true
        })

      {:ok, %{status_code: status}} ->
        handle_webhook_failure(webhook, event_type, payload, status, "HTTP #{status}")

      {:error, %{reason: reason}} ->
        handle_webhook_failure(webhook, event_type, payload, nil, inspect(reason))
    end
  end

  defp handle_webhook_failure(webhook, event_type, payload, status, error_message) do
    Repo.update!(OutboundWebhook.changeset(webhook, %{
      total_deliveries: webhook.total_deliveries + 1,
      failed_deliveries: webhook.failed_deliveries + 1,
      last_delivery_at: DateTime.utc_now(),
      last_failure_at: DateTime.utc_now(),
      last_failure_reason: error_message
    }))

    Repo.insert!(%WebhookDelivery{
      webhook_id: webhook.id,
      event_type: event_type,
      payload: payload,
      response_status: status,
      success: false,
      error_message: error_message
    })
  end

  defp generate_signature(payload, secret) do
    :crypto.mac(:hmac, :sha256, secret, Jason.encode!(payload))
    |> Base.encode16(case: :lower)
  end
end
```

---

## Event Broadcasting (Phoenix)

**Trigger webhook dispatches from platform events:**

```elixir
# When a bot starts
Phoenix.PubSub.broadcast(TradeEngine.PubSub, "platform:events", {
  :platform_event,
  "bot.started",
  %{
    bot_id: bot.id,
    user_id: bot.user_id,
    strategy: bot.strategy_name,
    timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
  }
})

# When KYC approved
Phoenix.PubSub.broadcast(TradeEngine.PubSub, "platform:events", {
  :platform_event,
  "kyc.approved",
  %{
    user_id: user.id,
    kyc_record_id: kyc_record.id,
    provider: kyc_record.provider,
    timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
  }
})

# When critical alert fires
Phoenix.PubSub.broadcast(TradeEngine.PubSub, "platform:events", {
  :platform_event,
  "platform.alert.critical",
  %{
    alert_id: alert.id,
    severity: alert.severity,
    message: alert.message,
    timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
  }
})
```

---

## Data Flow Summary

```
[Page Load]
   │
   └─> GET /api/settings/integrations (NestJS)
         ├─> Query platform.integrations
         ├─> Query platform.outbound_webhooks
         ├─> Query platform.webhook_signing_keys
         └─> Return integrations[], webhooks[], current_signing_key

[Admin Adds Webhook]
   │
   └─> POST /api/settings/integrations/webhooks (NestJS)
         ├─> Insert into platform.outbound_webhooks
         ├─> Log audit trail
         └─> Return webhook with signing_secret (show once)

[Admin Tests Webhook]
   │
   └─> POST /api/settings/integrations/webhooks/:id/test (NestJS)
         └─> POST /api/phoenix/webhooks/dispatch (Phoenix)
               ├─> Generate HMAC signature
               ├─> POST to webhook URL
               ├─> Log delivery to webhook_deliveries
               └─> Return success/failure

[Admin Rotates Signing Key]
   │
   └─> POST /api/settings/integrations/rotate-signing-key (NestJS)
         ├─> Retire old key in webhook_signing_keys
         ├─> Generate new HMAC secret
         ├─> Update all webhooks with new secret
         └─> Return new key

[Platform Event Occurs]
   │
   └─> Phoenix: Bot started, KYC approved, Alert fired
         ├─> Broadcast to PubSub "platform:events"
         │     └─> WebhookDispatcher receives event
         │           ├─> Query webhooks subscribed to event type
         │           ├─> For each webhook:
         │           │     ├─> Generate HMAC signature
         │           │     ├─> POST to webhook URL
         │           │     ├─> Update webhook stats
         │           │     └─> Log delivery to webhook_deliveries
         │           └─> If fails: Retry with backoff
```

---

## Summary Table

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Integrations list | `platform.integrations` | NestJS REST | HTTP | No cache |
| Webhooks list | `platform.outbound_webhooks` | NestJS REST | HTTP | No cache |
| Add webhook | `platform.outbound_webhooks` INSERT | NestJS REST | HTTP | No cache |
| Update webhook | `platform.outbound_webhooks` UPDATE | NestJS REST | HTTP | No cache |
| Delete webhook | `platform.outbound_webhooks` DELETE | NestJS REST | HTTP | No cache |
| Test webhook | Phoenix dispatcher | Phoenix REST | HTTP | No cache |
| Rotate signing key | `platform.webhook_signing_keys` | NestJS REST | HTTP | No cache |
| Webhook dispatching | Phoenix PubSub → Dispatcher | Phoenix GenServer | N/A | No cache |

---

## Frontend Implementation Notes

```typescript
// hooks/useIntegrations.ts
export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhooks, setWebhooks] = useState<OutboundWebhook[]>([]);

  useEffect(() => {
    fetch('/api/settings/integrations')
      .then(res => res.json())
      .then(data => {
        setIntegrations(data.integrations);
        setWebhooks(data.webhooks);
      });
  }, []);

  const testWebhook = async (webhookId: string) => {
    const response = await fetch(`/api/settings/integrations/webhooks/${webhookId}/test`, {
      method: 'POST',
    });
    const result = await response.json();
    toast.success(result.message);
  };

  return { integrations, webhooks, testWebhook };
}
```

---

## Performance Considerations

1. **Webhook Delivery:** Dispatch asynchronously using `Task.start/1` to avoid blocking
2. **Retry Logic:** Implement exponential backoff (1s, 2s, 4s, 8s, 16s, max 5 retries)
3. **Delivery Logs:** Partition `webhook_deliveries` by month, auto-delete logs >90 days
4. **URL Masking:** Always mask credentials in webhook URLs before displaying

---

## Testing Checklist

- [ ] Integrations list loads with correct status
- [ ] Webhooks list loads with masked URLs
- [ ] Admin can add new webhook with events
- [ ] Admin can test webhook and see result
- [ ] Admin can edit webhook events
- [ ] Admin can delete webhook
- [ ] Admin can rotate signing key
- [ ] HMAC signature generated correctly
- [ ] Webhooks dispatch for subscribed events
- [ ] Failed deliveries retry with backoff
- [ ] Delivery stats update correctly
- [ ] Delivery logs created for all dispatches
- [ ] Audit logs capture all actions

---

**[← Previous: Risk Controls](./20-settings-risk.md)** | **[Back to Index](./00-INDEX.md)** | **[Next →](./22-settings-bot-engine.md)**
