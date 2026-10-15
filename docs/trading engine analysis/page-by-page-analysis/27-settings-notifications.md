# Page 27: `/settings/notifications` - Notifications & Alerts

**Route:** `/settings/notifications`
**Page Type:** Configuration Management
**User Persona:** Platform Admin / Operations
**Real-time Requirements:** No

---

## UI Features & Requirements

**Mock Data Structure from page.tsx:8-38:**

```typescript
const channels = [
  { key: "slack", icon: "💬", name: "Slack", active: true, hasWebhook: true },
  { key: "pagerduty", icon: "🚨", name: "PagerDuty", active: true, hasWebhook: true },
  { key: "email", icon: "📧", name: "Email", active: true, hasWebhook: false },
  { key: "sms", icon: "📱", name: "SMS", active: false, hasWebhook: false },
];

const severities = [
  { key: "critical", col: "#ff4757", label: "Critical" },
  { key: "warning", col: "#f5a623", label: "Warning" },
  { key: "info", col: "#3d9df3", label: "Info" },
];

const routing = {
  slack: { critical: true, warning: true, info: false },
  pagerduty: { critical: true, warning: false, info: false },
  email: { critical: true, warning: true, info: true },
  sms: { critical: true, warning: false, info: false },
};

const alerts = [
  { key: "circuit_breaker", label: "Circuit breaker triggered", default_sev: "critical" },
  { key: "bot_killed", label: "Bot killed (manual or auto)", default_sev: "warning" },
  { key: "drawdown_approach", label: "Drawdown approaching threshold", default_sev: "warning" },
  { key: "kyc_manual_review", label: "KYC applicant needs manual review", default_sev: "info" },
  { key: "exchange_degraded", label: "Exchange connection degraded", default_sev: "warning" },
  { key: "infra_cpu_high", label: "Infrastructure CPU > 70%", default_sev: "warning" },
  { key: "shift_handoff", label: "Shift handoff due", default_sev: "info" },
  { key: "failed_payment", label: "User payment failed", default_sev: "info" },
];

const dedupWindow = 5; // minutes
```

**UI Components:**

1. **Channel Configuration** (page.tsx:63-151)
   - 4 channels: Slack, PagerDuty, Email, SMS
   - Each channel has:
     - Toggle to enable/disable
     - Webhook URL (for Slack, PagerDuty)
     - Recipients field (for Email)
     - Phone numbers field (for SMS)
     - Severity routing (Critical, Warning, Info toggles)

2. **Alert Deduplication Window** (page.tsx:136-149)
   - Slider: `1-60 minutes` (default: 5)
   - Hint: "Suppress repeated identical alerts within this window. Prevents alert storms."

3. **Alert Types Table** (page.tsx:154-207)
   - Table with columns: Alert Event, Default Severity, Enabled
   - 8 alert types with enable/disable toggles

---

## Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| **Channel Config** | channel_key, is_active, webhook_url, recipients, phone_numbers | `platform.notification_channels` | REST API | On page load |
| **Severity Routing** | channel_key, severity, enabled | `platform.notification_routing` | REST API | On page load |
| **Alert Dedup Window** | dedup_window_minutes | `platform.notification_settings` | REST API | On page load |
| **Alert Types** | alert_key, label, default_severity, is_enabled | `platform.alert_types` | REST API | On page load |
| **Update Channel** | Update channel config | `platform.notification_channels` UPDATE | REST API | On save |
| **Update Routing** | Update severity routing | `platform.notification_routing` UPDATE | REST API | On save |
| **Update Settings** | Update dedup window | `platform.notification_settings` UPDATE | REST API | On save |
| **Update Alert Types** | Toggle alert enabled | `platform.alert_types` UPDATE | REST API | On save |

---

## Database Schema Requirements

### New Tables

**1. `platform.notification_channels`**

```sql
CREATE TABLE platform.notification_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_key VARCHAR(50) UNIQUE NOT NULL, -- 'slack', 'pagerduty', 'email', 'sms'

  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10), -- Emoji or icon identifier
  is_active BOOLEAN NOT NULL DEFAULT false,

  -- Channel-specific configuration (stored as JSONB for flexibility)
  config JSONB NOT NULL DEFAULT '{}', -- { webhook_url, recipients, phone_numbers, etc. }

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT channel_key_lowercase CHECK (channel_key = LOWER(channel_key))
);

CREATE UNIQUE INDEX idx_notification_channels_key ON platform.notification_channels (channel_key);
CREATE INDEX idx_notification_channels_active ON platform.notification_channels (is_active) WHERE is_active = true;
```

**2. `platform.notification_routing`**

```sql
CREATE TABLE platform.notification_routing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES platform.notification_channels(id) ON DELETE CASCADE,

  severity VARCHAR(50) NOT NULL, -- 'critical', 'warning', 'info'
    CHECK (severity IN ('critical', 'warning', 'info')),

  enabled BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_channel_severity UNIQUE (channel_id, severity)
);

CREATE INDEX idx_notification_routing_enabled ON platform.notification_routing (channel_id, severity) WHERE enabled = true;
```

**3. `platform.notification_settings`** (Singleton table)

```sql
CREATE TABLE platform.notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  dedup_window_minutes INTEGER NOT NULL DEFAULT 5,
    CHECK (dedup_window_minutes >= 1 AND dedup_window_minutes <= 60),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_notification_settings CHECK (id = id) -- Enforce singleton
);

CREATE UNIQUE INDEX idx_notification_settings_singleton ON platform.notification_settings ((1));

-- Insert default settings
INSERT INTO platform.notification_settings (id, dedup_window_minutes)
VALUES (uuid_generate_v4(), 5)
ON CONFLICT DO NOTHING;
```

**4. `platform.alert_types`**

```sql
CREATE TABLE platform.alert_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_key VARCHAR(100) UNIQUE NOT NULL, -- 'circuit_breaker', 'bot_killed', etc.

  label VARCHAR(255) NOT NULL,
  description TEXT,
  default_severity VARCHAR(50) NOT NULL, -- 'critical', 'warning', 'info'
    CHECK (default_severity IN ('critical', 'warning', 'info')),

  is_enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT alert_key_lowercase CHECK (alert_key = LOWER(alert_key))
);

CREATE UNIQUE INDEX idx_alert_types_key ON platform.alert_types (alert_key);
CREATE INDEX idx_alert_types_enabled ON platform.alert_types (is_enabled) WHERE is_enabled = true;
```

**5. `platform.notification_log`** (Audit trail for sent notifications)

```sql
CREATE TABLE platform.notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES platform.notification_channels(id),
  alert_type_id UUID REFERENCES platform.alert_types(id),

  severity VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB, -- Additional context about the alert

  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'deduplicated'
    CHECK (status IN ('pending', 'sent', 'failed', 'deduplicated')),
  error_message TEXT,

  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_log_channel ON platform.notification_log (channel_id, created_at DESC);
CREATE INDEX idx_notification_log_status ON platform.notification_log (status, created_at DESC);
CREATE INDEX idx_notification_log_severity ON platform.notification_log (severity, created_at DESC);
```

### Seed Data for Notification Channels and Alert Types

```sql
-- Channels
INSERT INTO platform.notification_channels (channel_key, name, icon, is_active, config) VALUES
('slack', 'Slack', '💬', true, '{"webhook_url": "https://hooks.slack.com/services/T0••••/B0••••/x••••"}'),
('pagerduty', 'PagerDuty', '🚨', true, '{"webhook_url": "https://events.pagerduty.com/v2/enqueue/••••"}'),
('email', 'Email', '📧', true, '{"recipients": "ops@stella.io, alerts@stella.io"}'),
('sms', 'SMS', '📱', false, '{"phone_numbers": ""}')
ON CONFLICT (channel_key) DO NOTHING;

-- Routing (populate for all channels x severities)
WITH channels AS (
  SELECT id, channel_key FROM platform.notification_channels
),
severities AS (
  SELECT unnest(ARRAY['critical', 'warning', 'info']) AS severity
)
INSERT INTO platform.notification_routing (channel_id, severity, enabled)
SELECT
  c.id,
  s.severity,
  CASE
    WHEN c.channel_key = 'slack' AND s.severity IN ('critical', 'warning') THEN true
    WHEN c.channel_key = 'pagerduty' AND s.severity = 'critical' THEN true
    WHEN c.channel_key = 'email' THEN true
    WHEN c.channel_key = 'sms' AND s.severity = 'critical' THEN true
    ELSE false
  END
FROM channels c
CROSS JOIN severities s
ON CONFLICT DO NOTHING;

-- Alert Types
INSERT INTO platform.alert_types (alert_key, label, description, default_severity, is_enabled) VALUES
('circuit_breaker', 'Circuit breaker triggered', 'Platform-wide circuit breaker has halted all bots due to excessive losses', 'critical', true),
('bot_killed', 'Bot killed (manual or auto)', 'A bot was forcibly stopped by admin or automated risk management', 'warning', true),
('drawdown_approach', 'Drawdown approaching threshold', 'Platform drawdown is within 80% of configured limit', 'warning', true),
('kyc_manual_review', 'KYC applicant needs manual review', 'A KYC submission requires manual compliance officer review', 'info', true),
('exchange_degraded', 'Exchange connection degraded', 'An exchange connection has degraded latency or intermittent failures', 'warning', true),
('infra_cpu_high', 'Infrastructure CPU > 70%', 'Infrastructure service CPU usage exceeds 70% threshold', 'warning', true),
('shift_handoff', 'Shift handoff due', 'Operator shift change is due and handoff notes are required', 'info', true),
('failed_payment', 'User payment failed', 'A user subscription payment attempt has failed', 'info', true)
ON CONFLICT (alert_key) DO NOTHING;
```

---

## NestJS REST API Endpoints

### 1. `GET /api/settings/notifications` - Load Notification Settings

**Purpose:** Load all notification channels, routing, and alert types
**Authentication:** Admin/Ops role required

**Response:**

```typescript
interface NotificationSettingsResponse {
  channels: NotificationChannel[];
  routing: NotificationRouting[];
  settings: {
    dedup_window_minutes: number;
    updated_at: string;
  };
  alert_types: AlertType[];
}

interface NotificationChannel {
  id: string;
  channel_key: string;
  name: string;
  icon: string;
  is_active: boolean;
  config: {
    webhook_url?: string;
    recipients?: string;
    phone_numbers?: string;
  };
  updated_at: string;
}

interface NotificationRouting {
  id: string;
  channel_id: string;
  channel_key: string;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
}

interface AlertType {
  id: string;
  alert_key: string;
  label: string;
  description: string;
  default_severity: 'critical' | 'warning' | 'info';
  is_enabled: boolean;
}

// GET /api/settings/notifications
{
  "channels": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "channel_key": "slack",
      "name": "Slack",
      "icon": "💬",
      "is_active": true,
      "config": {
        "webhook_url": "https://hooks.slack.com/services/T0••••/B0••••/x••••"
      },
      "updated_at": "2026-02-21T10:00:00Z"
    },
    // ... 3 more channels
  ],
  "routing": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "channel_id": "550e8400-e29b-41d4-a716-446655440000",
      "channel_key": "slack",
      "severity": "critical",
      "enabled": true
    },
    // ... 11 more routing rules (4 channels × 3 severities)
  ],
  "settings": {
    "dedup_window_minutes": 5,
    "updated_at": "2026-02-21T10:00:00Z"
  },
  "alert_types": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "alert_key": "circuit_breaker",
      "label": "Circuit breaker triggered",
      "description": "Platform-wide circuit breaker has halted all bots due to excessive losses",
      "default_severity": "critical",
      "is_enabled": true
    },
    // ... 7 more alert types
  ]
}
```

**Implementation:**

```typescript
async getNotificationSettings(): Promise<NotificationSettingsResponse> {
  const channels = await this.channelsRepo.find({ order: { channel_key: 'ASC' } });
  const routing = await this.routingRepo.find({
    relations: ['channel'],
    order: { channel_id: 'ASC', severity: 'ASC' },
  });
  const settings = await this.settingsRepo.findOne({});
  const alertTypes = await this.alertTypesRepo.find({ order: { alert_key: 'ASC' } });

  return {
    channels: channels.map(c => ({
      id: c.id,
      channel_key: c.channel_key,
      name: c.name,
      icon: c.icon,
      is_active: c.is_active,
      config: c.config,
      updated_at: c.updated_at.toISOString(),
    })),
    routing: routing.map(r => ({
      id: r.id,
      channel_id: r.channel_id,
      channel_key: r.channel.channel_key,
      severity: r.severity,
      enabled: r.enabled,
    })),
    settings: {
      dedup_window_minutes: settings.dedup_window_minutes,
      updated_at: settings.updated_at.toISOString(),
    },
    alert_types: alertTypes.map(a => ({
      id: a.id,
      alert_key: a.alert_key,
      label: a.label,
      description: a.description,
      default_severity: a.default_severity,
      is_enabled: a.is_enabled,
    })),
  };
}
```

### 2. `PUT /api/settings/notifications/channels/:id` - Update Channel

**Purpose:** Update channel configuration (webhook URL, recipients, active status)
**Authentication:** Admin/Ops + audit logging

**Request:**

```typescript
{
  "is_active": true,
  "config": {
    "webhook_url": "https://hooks.slack.com/services/NEW_WEBHOOK_URL"
  }
}
```

**Response:**

```typescript
{
  "channel": NotificationChannel, // Updated channel
  "message": "Channel 'Slack' updated successfully"
}
```

**Implementation:**

```typescript
async updateChannel(channelId: string, data: UpdateChannelDto, adminUserId: string) {
  const channel = await this.channelsRepo.findOneOrFail({ where: { id: channelId } });

  const updated = await this.channelsRepo.save({
    ...channel,
    is_active: data.is_active ?? channel.is_active,
    config: { ...channel.config, ...data.config },
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  // Audit log
  await this.auditService.log({
    action: 'notification_channel_updated',
    resource_type: 'notification_channel',
    resource_id: channelId,
    admin_user_id: adminUserId,
    metadata: { channel_key: channel.channel_key, changes: data },
  });

  return { channel: updated, message: `Channel '${updated.name}' updated successfully` };
}
```

### 3. `PUT /api/settings/notifications/routing/:id` - Update Routing Rule

**Purpose:** Toggle severity routing for a channel
**Authentication:** Admin/Ops + audit logging

**Request:**

```typescript
{
  "enabled": false
}
```

**Response:**

```typescript
{
  "routing": NotificationRouting, // Updated routing rule
  "message": "Routing updated: Slack will no longer receive info alerts"
}
```

**Implementation:**

```typescript
async updateRouting(routingId: string, enabled: boolean, adminUserId: string) {
  const routing = await this.routingRepo.findOneOrFail({
    where: { id: routingId },
    relations: ['channel'],
  });

  const updated = await this.routingRepo.save({
    ...routing,
    enabled,
    updated_at: new Date(),
  });

  // Audit log
  await this.auditService.log({
    action: 'notification_routing_updated',
    resource_type: 'notification_routing',
    resource_id: routingId,
    admin_user_id: adminUserId,
    metadata: {
      channel_key: routing.channel.channel_key,
      severity: routing.severity,
      enabled,
    },
  });

  const action = enabled ? 'will now receive' : 'will no longer receive';
  return {
    routing: updated,
    message: `Routing updated: ${routing.channel.name} ${action} ${routing.severity} alerts`,
  };
}
```

### 4. `PUT /api/settings/notifications/settings` - Update Dedup Window

**Purpose:** Update alert deduplication window
**Authentication:** Admin/Ops + audit logging

**Request:**

```typescript
{
  "dedup_window_minutes": 10
}
```

**Response:**

```typescript
{
  "settings": { /* Updated settings */ },
  "message": "Deduplication window updated to 10 minutes"
}
```

**Implementation:**

```typescript
async updateSettings(dedupWindowMinutes: number, adminUserId: string) {
  const settings = await this.settingsRepo.findOne({});

  const updated = await this.settingsRepo.save({
    ...settings,
    dedup_window_minutes: dedupWindowMinutes,
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  // Audit log
  await this.auditService.log({
    action: 'notification_settings_updated',
    resource_type: 'notification_settings',
    resource_id: settings.id,
    admin_user_id: adminUserId,
    metadata: { dedup_window_minutes: dedupWindowMinutes },
  });

  return {
    settings: updated,
    message: `Deduplication window updated to ${dedupWindowMinutes} minutes`,
  };
}
```

### 5. `PUT /api/settings/notifications/alert-types/:id` - Toggle Alert Type

**Purpose:** Enable/disable an alert type
**Authentication:** Admin/Ops + audit logging

**Request:**

```typescript
{
  "is_enabled": false
}
```

**Response:**

```typescript
{
  "alert_type": AlertType, // Updated alert type
  "message": "Alert 'Circuit breaker triggered' disabled"
}
```

**Implementation:**

```typescript
async updateAlertType(alertTypeId: string, isEnabled: boolean, adminUserId: string) {
  const alertType = await this.alertTypesRepo.findOneOrFail({ where: { id: alertTypeId } });

  const updated = await this.alertTypesRepo.save({
    ...alertType,
    is_enabled: isEnabled,
    updated_at: new Date(),
  });

  // Audit log
  await this.auditService.log({
    action: 'alert_type_updated',
    resource_type: 'alert_type',
    resource_id: alertTypeId,
    admin_user_id: adminUserId,
    metadata: { alert_key: alertType.alert_key, is_enabled: isEnabled },
  });

  const action = isEnabled ? 'enabled' : 'disabled';
  return {
    alert_type: updated,
    message: `Alert '${alertType.label}' ${action}`,
  };
}
```

---

## Phoenix Alert Dispatcher Service

**Purpose:** Send alerts to configured notification channels based on routing rules

**Implementation:**

```elixir
defmodule TradeEngine.Alerts.Dispatcher do
  def send_alert(alert_type_key, severity, message, metadata \\ %{}) do
    # Check if alert type is enabled
    alert_type = Repo.get_by(AlertType, alert_key: alert_type_key)

    unless alert_type && alert_type.is_enabled do
      Logger.info("Alert #{alert_type_key} is disabled, skipping notification")
      return {:ok, :skipped}
    end

    # Check deduplication
    settings = Repo.one(NotificationSettings)
    dedup_window = :timer.minutes(settings.dedup_window_minutes)

    recent_alert = Repo.one(
      from l in NotificationLog,
      where: l.alert_type_id == ^alert_type.id
        and l.severity == ^severity
        and l.created_at > ago(^dedup_window, "millisecond"),
      limit: 1
    )

    if recent_alert do
      # Deduplicated
      Repo.insert(%NotificationLog{
        alert_type_id: alert_type.id,
        severity: severity,
        message: message,
        metadata: metadata,
        status: "deduplicated"
      })

      Logger.info("Alert #{alert_type_key} deduplicated within #{settings.dedup_window_minutes}m window")
      return {:ok, :deduplicated}
    end

    # Get active channels with routing enabled for this severity
    channels = Repo.all(
      from c in NotificationChannel,
      join: r in NotificationRouting, on: r.channel_id == c.id,
      where: c.is_active == true and r.severity == ^severity and r.enabled == true
    )

    # Send to each channel
    Enum.each(channels, fn channel ->
      result = send_to_channel(channel, severity, message, metadata)

      Repo.insert(%NotificationLog{
        channel_id: channel.id,
        alert_type_id: alert_type.id,
        severity: severity,
        message: message,
        metadata: metadata,
        status: if(result == :ok, do: "sent", else: "failed"),
        error_message: if(result != :ok, do: inspect(result), else: nil),
        sent_at: DateTime.utc_now()
      })
    end)

    {:ok, :sent}
  end

  defp send_to_channel(channel, severity, message, metadata) do
    case channel.channel_key do
      "slack" -> send_slack(channel.config["webhook_url"], severity, message, metadata)
      "pagerduty" -> send_pagerduty(channel.config["webhook_url"], severity, message, metadata)
      "email" -> send_email(channel.config["recipients"], severity, message, metadata)
      "sms" -> send_sms(channel.config["phone_numbers"], severity, message, metadata)
      _ -> {:error, "Unknown channel type"}
    end
  end

  defp send_slack(webhook_url, severity, message, _metadata) do
    color = case severity do
      "critical" -> "danger"
      "warning" -> "warning"
      "info" -> "good"
    end

    payload = %{
      text: message,
      attachments: [
        %{
          color: color,
          fields: [
            %{title: "Severity", value: String.upcase(severity), short: true},
            %{title: "Time", value: DateTime.utc_now() |> DateTime.to_iso8601(), short: true}
          ]
        }
      ]
    }

    case HTTPoison.post(webhook_url, Jason.encode!(payload), [{"Content-Type", "application/json"}]) do
      {:ok, %{status_code: 200}} -> :ok
      error -> error
    end
  end

  defp send_pagerduty(integration_key, severity, message, metadata) do
    # PagerDuty Events API v2 implementation
    payload = %{
      routing_key: integration_key,
      event_action: "trigger",
      payload: %{
        summary: message,
        severity: severity,
        source: "stella-trading-platform",
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
        custom_details: metadata
      }
    }

    case HTTPoison.post("https://events.pagerduty.com/v2/enqueue", Jason.encode!(payload), [{"Content-Type", "application/json"}]) do
      {:ok, %{status_code: 202}} -> :ok
      error -> error
    end
  end

  defp send_email(recipients, severity, message, _metadata) do
    # Use email service from communications settings
    TradeEngine.Email.send_alert_email(
      String.split(recipients, ","),
      severity,
      message
    )
  end

  defp send_sms(phone_numbers, severity, message, _metadata) do
    # Use Twilio or similar SMS service
    phones = String.split(phone_numbers, ",") |> Enum.map(&String.trim/1)

    Enum.each(phones, fn phone ->
      TradeEngine.SMS.send(phone, "[#{String.upcase(severity)}] #{message}")
    end)

    :ok
  end
end
```

**Usage Example:**

```elixir
# When circuit breaker is triggered
Alerts.Dispatcher.send_alert(
  "circuit_breaker",
  "critical",
  "Circuit breaker triggered: Platform drawdown exceeded 15% in 4 hours. All bots halted.",
  %{drawdown_pct: 15.2, threshold_pct: 15.0, bots_affected: 47}
)

# When exchange connection degrades
Alerts.Dispatcher.send_alert(
  "exchange_degraded",
  "warning",
  "Kraken connection degraded: Latency >2s for last 5 minutes.",
  %{exchange: "kraken", avg_latency_ms: 2340}
)
```

---

## Data Flow Summary

```
[Page Load]
   │
   └─> GET /api/settings/notifications (NestJS)
         │
         ├─> Query platform.notification_channels (PostgreSQL)
         ├─> Query platform.notification_routing (PostgreSQL)
         ├─> Query platform.notification_settings (PostgreSQL)
         ├─> Query platform.alert_types (PostgreSQL)
         └─> Return { channels[], routing[], settings, alert_types[] }

[Admin Action: Update Channel Config]
   │
   └─> PUT /api/settings/notifications/channels/:id (NestJS)
         │
         ├─> Update platform.notification_channels (PostgreSQL)
         ├─> Log audit trail
         └─> Return updated channel

[Admin Action: Toggle Severity Routing]
   │
   └─> PUT /api/settings/notifications/routing/:id (NestJS)
         │
         ├─> Update platform.notification_routing (PostgreSQL)
         ├─> Log audit trail
         └─> Return updated routing rule

[Admin Action: Update Dedup Window]
   │
   └─> PUT /api/settings/notifications/settings (NestJS)
         │
         ├─> Update platform.notification_settings (PostgreSQL)
         ├─> Log audit trail
         └─> Return updated settings

[Runtime: Alert Triggered (e.g., Circuit Breaker)]
   │
   └─> Phoenix Alerts.Dispatcher.send_alert("circuit_breaker", "critical", "...")
         │
         ├─> Check if alert type is enabled (platform.alert_types)
         ├─> Check deduplication window (platform.notification_log)
         ├─> If not deduplicated:
         │     ├─> Query active channels with routing enabled for "critical"
         │     ├─> For each channel:
         │     │     ├─> Send to Slack webhook (if enabled for critical)
         │     │     ├─> Send to PagerDuty webhook (if enabled for critical)
         │     │     ├─> Send to Email recipients (if enabled for critical)
         │     │     └─> Send to SMS numbers (if enabled for critical)
         │     └─> Log each notification attempt to platform.notification_log
         └─> Return {:ok, :sent}
```

---

## Summary Table

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Notification channels | `platform.notification_channels` | NestJS REST | HTTP | No cache |
| Severity routing rules | `platform.notification_routing` | NestJS REST | HTTP | No cache |
| Deduplication settings | `platform.notification_settings` | NestJS REST | HTTP | No cache |
| Alert types | `platform.alert_types` | NestJS REST | HTTP | No cache |
| Update channel config | `platform.notification_channels` UPDATE | NestJS REST | HTTP | No cache |
| Update routing | `platform.notification_routing` UPDATE | NestJS REST | HTTP | No cache |
| Update dedup window | `platform.notification_settings` UPDATE | NestJS REST | HTTP | No cache |
| Toggle alert type | `platform.alert_types` UPDATE | NestJS REST | HTTP | No cache |
| Send alert (runtime) | Phoenix Alerts.Dispatcher | Phoenix GenServer | N/A | No cache |
| Notification log | `platform.notification_log` | NestJS REST | HTTP | No cache |

---

## Frontend Implementation Notes

**Load Notification Settings:**

```typescript
// hooks/useNotificationSettings.ts
export function useNotificationSettings() {
  const [channels, setChannels] = useState([]);
  const [routing, setRouting] = useState([]);
  const [settings, setSettings] = useState(null);
  const [alertTypes, setAlertTypes] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch('/api/settings/notifications')
      .then(res => res.json())
      .then(data => {
        setChannels(data.channels);
        setRouting(data.routing);
        setSettings(data.settings);
        setAlertTypes(data.alert_types);
      });
  }, []);

  return { channels, routing, settings, alertTypes, dirty, setDirty };
}
```

**Update Channel:**

```typescript
async function updateChannel(channelId: string, updates: { is_active?: boolean; config?: any }) {
  const response = await fetch(`/api/settings/notifications/channels/${channelId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  const result = await response.json();
  setChannels(prev => prev.map(c => c.id === channelId ? result.channel : c));
  toast.success(result.message);
}
```

**Toggle Routing:**

```typescript
async function toggleRouting(routingId: string, enabled: boolean) {
  const response = await fetch(`/api/settings/notifications/routing/${routingId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled }),
  });

  const result = await response.json();
  setRouting(prev => prev.map(r => r.id === routingId ? result.routing : r));
  toast.success(result.message);
  setDirty(true);
}
```

---

## Performance Considerations

1. **Deduplication Check:** Use database index on `(alert_type_id, severity, created_at DESC)` for fast deduplication lookups.

2. **Alert Dispatch:** Send notifications asynchronously via background job queue (Oban) to avoid blocking the main process.

3. **Webhook Retries:** Implement exponential backoff retry logic for failed webhook deliveries (3 retries with 1s, 2s, 4s delays).

4. **Notification Log Partitioning:** Partition `platform.notification_log` by month for performance as table grows.

5. **Rate Limiting:** Implement per-channel rate limits to avoid overwhelming external services (e.g., max 60 Slack messages/min).

---

## Testing Checklist

- [ ] Notification channels load correctly on page load
- [ ] Channel configuration (webhook URL, recipients) can be updated
- [ ] Channel active/inactive toggle works
- [ ] Severity routing toggles update database correctly
- [ ] Deduplication window slider updates setting
- [ ] Alert types table displays all alert events
- [ ] Toggle alert type enable/disable works
- [ ] Save changes persists all updates
- [ ] Discard changes resets form to original values
- [ ] Alert dispatch sends to enabled channels only
- [ ] Alert dispatch respects severity routing rules
- [ ] Deduplication prevents repeat alerts within configured window
- [ ] Disabled alert types do not trigger notifications
- [ ] Slack webhook sends correctly formatted messages
- [ ] PagerDuty integration creates incidents for critical alerts
- [ ] Email notifications send to all configured recipients
- [ ] SMS notifications send to all configured phone numbers
- [ ] Notification log records all sent/failed notifications
- [ ] Audit logs capture all configuration changes

---

**[← Previous: Infrastructure](./26-settings-infrastructure.md)** | **[Back to Index](./00-INDEX.md)**
