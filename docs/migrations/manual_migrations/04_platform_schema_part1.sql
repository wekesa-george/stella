-- =============================================================================
-- PLATFORM SCHEMA - Part 1: Risk & Integrations (11 tables)
-- =============================================================================
-- Tables: risk_controls, circuit_breaker_events, user_drawdown_tracking,
--         integrations, outbound_webhooks, webhook_deliveries, webhook_signing_keys,
--         bot_engine_defaults, billing_config (already done in finance)
-- =============================================================================

-- ============== RISK MANAGEMENT TABLES ==============

-- Table 1: platform.risk_controls (singleton)
CREATE TABLE IF NOT EXISTS platform.risk_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Drawdown & Loss Limits
  max_drawdown_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    CHECK (max_drawdown_pct >= 1 AND max_drawdown_pct <= 30),

  daily_loss_limit_pct DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    CHECK (daily_loss_limit_pct >= 1 AND daily_loss_limit_pct <= 20),

  circuit_breaker_pct DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    CHECK (circuit_breaker_pct >= 5 AND circuit_breaker_pct <= 50),

  circuit_breaker_window_hours INTEGER NOT NULL DEFAULT 4,
    CHECK (circuit_breaker_window_hours >= 1 AND circuit_breaker_window_hours <= 24),

  max_slippage_pct DECIMAL(5,2) NOT NULL DEFAULT 0.50,
    CHECK (max_slippage_pct >= 0.05 AND max_slippage_pct <= 3),

  -- Position & Exposure Limits
  max_position_size_pct DECIMAL(5,2) NOT NULL DEFAULT 8.00,
    CHECK (max_position_size_pct >= 1 AND max_position_size_pct <= 50),

  max_concurrent_positions INTEGER NOT NULL DEFAULT 20,
    CHECK (max_concurrent_positions >= 1 AND max_concurrent_positions <= 100),

  max_leverage DECIMAL(6,2) NOT NULL DEFAULT 5.00,
    CHECK (max_leverage >= 1 AND max_leverage <= 125),

  max_bots_per_user INTEGER NOT NULL DEFAULT 10,
    CHECK (max_bots_per_user >= 1 AND max_bots_per_user <= 50),

  -- Feature Toggles
  force_limit_orders BOOLEAN NOT NULL DEFAULT true,
  auto_halt_on_circuit BOOLEAN NOT NULL DEFAULT true,
  notify_on_drawdown BOOLEAN NOT NULL DEFAULT true,
  allow_market_orders BOOLEAN NOT NULL DEFAULT true,
  require_stop_loss BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_risk_controls_row CHECK (id = id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_controls_singleton ON platform.risk_controls ((1));

INSERT INTO platform.risk_controls (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING;

-- Table 2: platform.circuit_breaker_events
CREATE TABLE IF NOT EXISTS platform.circuit_breaker_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_reason VARCHAR(100) NOT NULL,
  loss_pct DECIMAL(5,2) NOT NULL,
  threshold_pct DECIMAL(5,2) NOT NULL,
  platform_equity_before DECIMAL(15,2),
  platform_equity_after DECIMAL(15,2),
  bots_halted_count INTEGER NOT NULL DEFAULT 0,
  positions_closed_count INTEGER NOT NULL DEFAULT 0,
  auto_halted BOOLEAN NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES auth.users(id),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_triggered ON platform.circuit_breaker_events (triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_unresolved ON platform.circuit_breaker_events (resolved_at) WHERE resolved_at IS NULL;

-- Table 3: platform.user_drawdown_tracking
CREATE TABLE IF NOT EXISTS platform.user_drawdown_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  starting_equity DECIMAL(15,2) NOT NULL,
  current_equity DECIMAL(15,2) NOT NULL,
  peak_equity DECIMAL(15,2) NOT NULL,
  drawdown_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  daily_loss_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  bots_paused_at TIMESTAMPTZ,
  bots_resumed_at TIMESTAMPTZ,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_drawdown_user ON platform.user_drawdown_tracking (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_user_drawdown_date ON platform.user_drawdown_tracking (date DESC);

-- ============== INTEGRATIONS & WEBHOOKS ==============

-- Table 4: platform.integrations
CREATE TABLE IF NOT EXISTS platform.integrations (
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

CREATE INDEX IF NOT EXISTS idx_integrations_status ON platform.integrations (status);
CREATE INDEX IF NOT EXISTS idx_integrations_active ON platform.integrations (is_active) WHERE is_active = true;

-- Table 5: platform.outbound_webhooks
CREATE TABLE IF NOT EXISTS platform.outbound_webhooks (
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

CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_active ON platform.outbound_webhooks (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_events ON platform.outbound_webhooks USING GIN (events);

-- Table 6: platform.webhook_deliveries
CREATE TABLE IF NOT EXISTS platform.webhook_deliveries (
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

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON platform.webhook_deliveries (webhook_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON platform.webhook_deliveries (event_type, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_recent ON platform.webhook_deliveries (delivered_at DESC)
  WHERE delivered_at > CURRENT_TIMESTAMP - INTERVAL '7 days';

-- Table 7: platform.webhook_signing_keys
CREATE TABLE IF NOT EXISTS platform.webhook_signing_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  signing_secret VARCHAR(64) UNIQUE NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ,

  is_active BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT only_one_active_key CHECK (is_active = false OR retired_at IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_signing_keys_active ON platform.webhook_signing_keys (is_active)
  WHERE is_active = true;

-- Table 8: platform.bot_engine_defaults (singleton)
CREATE TABLE IF NOT EXISTS platform.bot_engine_defaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Timing & Retry
  heartbeat_interval_sec INTEGER NOT NULL DEFAULT 5,
    CHECK (heartbeat_interval_sec >= 1 AND heartbeat_interval_sec <= 60),

  order_timeout_sec INTEGER NOT NULL DEFAULT 30,
    CHECK (order_timeout_sec >= 5 AND order_timeout_sec <= 300),

  max_order_age_sec INTEGER NOT NULL DEFAULT 300,
    CHECK (max_order_age_sec >= 60 AND max_order_age_sec <= 3600),

  retry_attempts INTEGER NOT NULL DEFAULT 3,
    CHECK (retry_attempts >= 0 AND retry_attempts <= 10),

  retry_backoff_multiplier DECIMAL(3,1) NOT NULL DEFAULT 2.0,
    CHECK (retry_backoff_multiplier >= 1.0 AND retry_backoff_multiplier <= 5.0),

  reconcile_frequency_min INTEGER NOT NULL DEFAULT 15,
    CHECK (reconcile_frequency_min >= 1 AND reconcile_frequency_min <= 60),

  -- Order Defaults
  default_slippage_pct DECIMAL(5,2) NOT NULL DEFAULT 0.10,
    CHECK (default_slippage_pct >= 0.01 AND default_slippage_pct <= 5.0),

  position_precision INTEGER NOT NULL DEFAULT 4,
    CHECK (position_precision >= 0 AND position_precision <= 8),

  -- Feature Toggles
  enable_heartbeat_alert BOOLEAN NOT NULL DEFAULT true,
  enable_stale_order_cancel BOOLEAN NOT NULL DEFAULT true,
  enable_auto_reconcile BOOLEAN NOT NULL DEFAULT true,
  enable_partial_fill_continue BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_bot_engine_defaults_row CHECK (id = id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_engine_defaults_singleton ON platform.bot_engine_defaults ((1));

INSERT INTO platform.bot_engine_defaults (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING;
