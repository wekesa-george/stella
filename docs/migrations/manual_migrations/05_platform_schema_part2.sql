-- =============================================================================
-- PLATFORM SCHEMA - Part 2: Communications, Infrastructure, Notifications (14 tables)
-- =============================================================================

-- ============== COMMUNICATIONS (EMAIL) ==============

-- Table 9: platform.email_settings (singleton)
CREATE TABLE IF NOT EXISTS platform.email_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  sender_name VARCHAR(255) NOT NULL DEFAULT 'Stella',
  sender_email VARCHAR(255) NOT NULL DEFAULT 'noreply@stella.io',
  support_email VARCHAR(255) NOT NULL DEFAULT 'support@stella.io',

  smtp_host VARCHAR(255),
  smtp_port INTEGER,
  smtp_username VARCHAR(255),
  smtp_password_encrypted BYTEA,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_email_settings CHECK (id = id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_settings_singleton ON platform.email_settings ((1));

INSERT INTO platform.email_settings (id, sender_name, sender_email, support_email)
VALUES (uuid_generate_v4(), 'Stella', 'noreply@stella.io', 'support@stella.io')
ON CONFLICT DO NOTHING;

-- Table 10: platform.email_templates
CREATE TABLE IF NOT EXISTS platform.email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_key VARCHAR(100) UNIQUE NOT NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_event VARCHAR(100),

  subject_line TEXT NOT NULL,
  body_markdown TEXT NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT template_key_lowercase CHECK (template_key = LOWER(template_key))
);

CREATE INDEX IF NOT EXISTS idx_email_templates_active ON platform.email_templates (is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_key ON platform.email_templates (template_key);

-- Seed email templates
INSERT INTO platform.email_templates (template_key, name, description, trigger_event, subject_line, body_markdown) VALUES
('kyc_approved', 'KYC Approved', 'Sent when user verification succeeds', 'kyc.approved',
  'Your Stella verification is complete',
  'Hi {{user.first_name}},

Your account verification has been approved.

You can now activate your trading bots and start growing your portfolio.

If you have questions, contact us at {{support_email}}.

— The Stella Team'),

('kyc_declined', 'KYC Declined', 'Sent when verification is rejected', 'kyc.declined',
  'Your Stella verification requires attention',
  'Hi {{user.first_name}},

Unfortunately, we were unable to verify your account at this time.

Reason: {{decline_reason}}

You can resubmit your documents from your dashboard.

If you have questions, contact us at {{support_email}}.

— The Stella Team'),

('kyc_resubmit', 'KYC Re-Submit', 'Sent when re-verification is required', 'kyc.resubmit',
  'Action required: Update your Stella verification',
  'Hi {{user.first_name}},

Your account requires re-verification due to {{reverification_reason}}.

Please submit updated documents within 7 days to avoid account suspension.

If you have questions, contact us at {{support_email}}.

— The Stella Team'),

('bot_stopped', 'Bot Stopped', 'Sent when a user''s bot is halted', 'bot.stopped',
  'Your Stella bot "{{bot.name}}" has stopped',
  'Hi {{user.first_name}},

Your bot **{{bot.name}}** has been stopped.

Reason: {{stop_reason}}

You can restart it from your dashboard or contact support if this was unexpected.

— The Stella Team'),

('payment_failed', 'Payment Failed', 'Billing failure notification', 'billing.payment_failed',
  'Payment failed for your Stella subscription',
  'Hi {{user.first_name}},

We were unable to process your payment for the {{tier_name}} subscription.

Please update your payment method within {{grace_period_days}} days to avoid service interruption.

If you have questions, contact us at {{support_email}}.

— The Stella Team'),

('tier_upgraded', 'Tier Upgraded', 'Subscription upgrade confirmation', 'billing.tier_upgraded',
  'Welcome to Stella {{tier_name}}!',
  'Hi {{user.first_name}},

Your subscription has been upgraded to **{{tier_name}}**.

New limits:
- Max Bots: {{tier.max_bots}}
- Max AUM: {{tier.max_aum}}
- API Access: {{tier.api_access}}

Enjoy your upgraded features!

— The Stella Team'),

('welcome', 'Welcome', 'Sent on account creation', 'user.created',
  'Welcome to Stella',
  'Hi {{user.first_name}},

Welcome to Stella! We''re excited to have you.

Next steps:
1. Complete your KYC verification
2. Connect your exchange credentials
3. Create your first trading bot

If you need help getting started, reach out to {{support_email}}.

— The Stella Team'),

('withdrawal', 'Withdrawal Processed', 'Funds withdrawal confirmation', 'finance.withdrawal',
  'Your withdrawal has been processed',
  'Hi {{user.first_name}},

Your withdrawal of {{amount}} {{currency}} has been processed.

Transaction ID: {{transaction_id}}
Destination: {{destination}}

Funds should arrive within {{eta_hours}} hours.

— The Stella Team')
ON CONFLICT (template_key) DO NOTHING;

-- Table 11: platform.email_logs
CREATE TABLE IF NOT EXISTS platform.email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES platform.email_templates(id),

  recipient_user_id UUID REFERENCES auth.users(id),
  recipient_email VARCHAR(255) NOT NULL,

  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,

  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  status_message TEXT,

  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (status IN ('pending', 'sent', 'failed', 'bounced'))
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON platform.email_logs (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON platform.email_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON platform.email_logs (template_id, created_at DESC);

-- ============== INFRASTRUCTURE ==============

-- Table 12: platform.infrastructure_settings (singleton)
CREATE TABLE IF NOT EXISTS platform.infrastructure_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  postgres_pool_size INTEGER NOT NULL DEFAULT 20,
    CHECK (postgres_pool_size >= 5 AND postgres_pool_size <= 100),
  timescale_pool_size INTEGER NOT NULL DEFAULT 10,
    CHECK (timescale_pool_size >= 5 AND timescale_pool_size <= 50),
  redis_max_connections INTEGER NOT NULL DEFAULT 50,
    CHECK (redis_max_connections >= 10 AND redis_max_connections <= 200),
  rabbitmq_channel_pool INTEGER NOT NULL DEFAULT 25,
    CHECK (rabbitmq_channel_pool >= 5 AND rabbitmq_channel_pool <= 100),

  bot_state_ttl INTEGER NOT NULL DEFAULT 5,
  user_profile_ttl INTEGER NOT NULL DEFAULT 300,
  kyc_status_ttl INTEGER NOT NULL DEFAULT 900,
  exchange_prices_ttl INTEGER NOT NULL DEFAULT 1,
  analytics_ttl INTEGER NOT NULL DEFAULT 3600,
  subscription_tier_ttl INTEGER NOT NULL DEFAULT 600,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_infra_settings CHECK (id = id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_infra_settings_singleton ON platform.infrastructure_settings ((1));

INSERT INTO platform.infrastructure_settings (id)
VALUES (uuid_generate_v4())
ON CONFLICT DO NOTHING;

-- Table 13: platform.feature_flags
CREATE TABLE IF NOT EXISTS platform.feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key VARCHAR(100) UNIQUE NOT NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  enabled_prod BOOLEAN NOT NULL DEFAULT false,
  enabled_staging BOOLEAN NOT NULL DEFAULT false,
  enabled_dev BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT flag_key_lowercase CHECK (flag_key = LOWER(flag_key))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_key ON platform.feature_flags (flag_key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_prod ON platform.feature_flags (enabled_prod) WHERE enabled_prod = true;

-- Seed feature flags
INSERT INTO platform.feature_flags (flag_key, name, description, enabled_prod, enabled_staging, enabled_dev) VALUES
('multi_exchange_arbitrage', 'Multi-Exchange Arbitrage', 'Allow bots to execute cross-exchange arbitrage simultaneously', true, true, true),
('enhanced_due_diligence', 'Enhanced Due Diligence KYC', 'Require enhanced KYC for accounts above 10M UGX AUM', true, true, true),
('auto_circuit_breaker', 'Auto Circuit Breaker', 'Automatically pause all bots when platform drawdown exceeds threshold', true, true, true),
('user_api_access', 'User API Access', 'Allow Pro/Enterprise users to connect external tools via API', false, true, true),
('websocket_v2', 'WebSocket v2 Protocol', 'New optimised WebSocket protocol with binary framing', false, false, true),
('referral_programme', 'Referral Programme', 'Enable referral code generation and commission tracking', false, true, true),
('strategy_marketplace', 'Strategy Marketplace', 'Allow users to publish and subscribe to community strategies', false, false, false)
ON CONFLICT (flag_key) DO NOTHING;

-- Table 14: platform.background_job_runs
CREATE TABLE IF NOT EXISTS platform.background_job_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name VARCHAR(255) NOT NULL,

  trigger_type VARCHAR(50) NOT NULL,
    CHECK (trigger_type IN ('scheduled', 'manual')),

  triggered_by_user_id UUID REFERENCES auth.users(id),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status VARCHAR(50) NOT NULL,
    CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job ON platform.background_job_runs (job_name, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON platform.background_job_runs (status, triggered_at DESC);

-- ============== NOTIFICATIONS ==============

-- Table 15: platform.notification_channels
CREATE TABLE IF NOT EXISTS platform.notification_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_key VARCHAR(50) UNIQUE NOT NULL,

  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT false,

  config JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT channel_key_lowercase CHECK (channel_key = LOWER(channel_key))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_channels_key ON platform.notification_channels (channel_key);
CREATE INDEX IF NOT EXISTS idx_notification_channels_active ON platform.notification_channels (is_active) WHERE is_active = true;

-- Seed notification channels
INSERT INTO platform.notification_channels (channel_key, name, icon, is_active, config) VALUES
('slack', 'Slack', '💬', true, '{"webhook_url": "https://hooks.slack.com/services/T0••••/B0••••/x••••"}'),
('pagerduty', 'PagerDuty', '🚨', true, '{"webhook_url": "https://events.pagerduty.com/v2/enqueue/••••"}'),
('email', 'Email', '📧', true, '{"recipients": "ops@stella.io, alerts@stella.io"}'),
('sms', 'SMS', '📱', false, '{"phone_numbers": ""}')
ON CONFLICT (channel_key) DO NOTHING;

-- Table 16: platform.notification_routing
CREATE TABLE IF NOT EXISTS platform.notification_routing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES platform.notification_channels(id) ON DELETE CASCADE,

  severity VARCHAR(50) NOT NULL,
    CHECK (severity IN ('critical', 'warning', 'info')),

  enabled BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_channel_severity UNIQUE (channel_id, severity)
);

CREATE INDEX IF NOT EXISTS idx_notification_routing_enabled ON platform.notification_routing (channel_id, severity) WHERE enabled = true;

-- Seed routing
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

-- Table 17: platform.notification_settings (singleton)
CREATE TABLE IF NOT EXISTS platform.notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  dedup_window_minutes INTEGER NOT NULL DEFAULT 5,
    CHECK (dedup_window_minutes >= 1 AND dedup_window_minutes <= 60),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_notification_settings CHECK (id = id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_settings_singleton ON platform.notification_settings ((1));

INSERT INTO platform.notification_settings (id, dedup_window_minutes)
VALUES (uuid_generate_v4(), 5)
ON CONFLICT DO NOTHING;

-- Table 18: platform.alert_types
CREATE TABLE IF NOT EXISTS platform.alert_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_key VARCHAR(100) UNIQUE NOT NULL,

  label VARCHAR(255) NOT NULL,
  description TEXT,
  default_severity VARCHAR(50) NOT NULL,
    CHECK (default_severity IN ('critical', 'warning', 'info')),

  is_enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT alert_key_lowercase CHECK (alert_key = LOWER(alert_key))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_types_key ON platform.alert_types (alert_key);
CREATE INDEX IF NOT EXISTS idx_alert_types_enabled ON platform.alert_types (is_enabled) WHERE is_enabled = true;

-- Seed alert types
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

-- Table 19: platform.notification_log
CREATE TABLE IF NOT EXISTS platform.notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES platform.notification_channels(id),
  alert_type_id UUID REFERENCES platform.alert_types(id),

  severity VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,

  status VARCHAR(50) NOT NULL DEFAULT 'pending',
    CHECK (status IN ('pending', 'sent', 'failed', 'deduplicated')),
  error_message TEXT,

  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON platform.notification_log (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON platform.notification_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_severity ON platform.notification_log (severity, created_at DESC);
