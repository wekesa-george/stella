-- =============================================================================
-- MIGRATION 002: Remaining Schema Additions
-- =============================================================================
-- Created: February 21, 2026
-- Purpose: Add remaining tables extracted from page-by-page analysis
--
-- Summary:
--   - New schemas: finance, exchange (platform/auth/kyc/operations/compliance already exist)
--   - New tables: 42 tables
--   - ALTER TABLE modifications: trading.alerts, trading.bots
--   - Seed data: compliance, exchange, email templates, notifications, feature flags
--
-- Source files:
--   - 22-settings-billing.md (3 tables)
--   - 24-settings-compliance.md (4 tables + seed data)
--   - 25-settings-exchanges.md (3 tables + seed data)
--   - 20-settings-risk.md (3 tables)
--   - 21-settings-integrations.md (4 tables)
--   - 22-settings-bot-engine.md (1 table + ALTER TABLE)
--   - 23-settings-communications.md (3 tables + seed data)
--   - 26-settings-infrastructure.md (3 tables + seed data)
--   - 27-settings-notifications.md (5 tables + seed data)
--   - 05-alerts.md (ALTER TABLE + indexes)
--   - 07-bot-detail.md (1 table)
--   - 08-users-list.md (1 table)
--   - 09-user-detail.md (2 tables + ENUM)
--   - 14-finance-strategies.md (1 table)
--   - 15-finance-risk.md (1 table)
--
-- Prerequisites:
--   - PostgreSQL 13+
--   - uuid-ossp extension
--   - pgcrypto extension (for encrypted credentials)
--   - Migration 001 must be applied first
--   - auth.users table must exist
--   - trading.bots table must exist (for bot-engine ALTER TABLE)
--
-- Rollback:
--   See end of file for rollback instructions
-- =============================================================================

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Schema extraction from analysis documents

-- ============================================================================
-- FROM FILE: 19-kyc-applicants.md
-- ============================================================================

-- New Schema
CREATE SCHEMA IF NOT EXISTS kyc;

-- Table 1: kyc.applicants
CREATE TABLE kyc.applicants (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'KYC-' || LPAD(nextval('kyc.applicant_id_seq')::TEXT, 4, '0'),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    provider VARCHAR(50) NOT NULL,
    provider_applicant_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    account_tier VARCHAR(50),
    country_code VARCHAR(2) NOT NULL,
    document_type VARCHAR(100),
    document_number VARCHAR(255),
    document_expires_at TIMESTAMPTZ,
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    face_match_score INTEGER CHECK (face_match_score BETWEEN 0 AND 100),
    document_authenticity_score INTEGER CHECK (document_authenticity_score BETWEEN 0 AND 100),
    watchlist_hit BOOLEAN DEFAULT false,
    reviewed_by_user_id UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(user_id),
    UNIQUE(provider, provider_applicant_id)
);

CREATE SEQUENCE kyc.applicant_id_seq START 1001;
CREATE INDEX idx_applicants_status ON kyc.applicants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_applicants_provider ON kyc.applicants(provider);
CREATE INDEX idx_applicants_country ON kyc.applicants(country_code);
CREATE INDEX idx_applicants_user ON kyc.applicants(user_id);
CREATE INDEX idx_applicants_expiring ON kyc.applicants(document_expires_at) WHERE status = 'approved' AND document_expires_at IS NOT NULL;

-- Table 2: kyc.compliance_notes
CREATE TABLE kyc.compliance_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id VARCHAR(20) NOT NULL REFERENCES kyc.applicants(id),
    action VARCHAR(50) NOT NULL,
    note TEXT NOT NULL,
    created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT note_not_empty CHECK (LENGTH(TRIM(note)) > 0)
);

CREATE INDEX idx_compliance_notes_applicant ON kyc.compliance_notes(applicant_id);
CREATE INDEX idx_compliance_notes_created_at ON kyc.compliance_notes(created_at DESC);

-- Table 3: kyc.verification_history
CREATE TABLE kyc.verification_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id VARCHAR(20) NOT NULL REFERENCES kyc.applicants(id),
    event VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider VARCHAR(50),
    score INTEGER,
    actioned_by_user_id UUID REFERENCES auth.users(id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verification_history_applicant ON kyc.verification_history(applicant_id, timestamp DESC);
CREATE INDEX idx_verification_history_event ON kyc.verification_history(event);

-- Table 4: kyc.rejection_reasons
CREATE TABLE kyc.rejection_reasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id VARCHAR(20) NOT NULL REFERENCES kyc.applicants(id),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rejection_reasons_applicant ON kyc.rejection_reasons(applicant_id);

-- Table 5: kyc.region_config
CREATE TABLE kyc.region_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    countries VARCHAR(2)[] NOT NULL,
    requires_enhanced_dd BOOLEAN DEFAULT false,
    risk_tier VARCHAR(50) DEFAULT 'standard',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_region_config_countries ON kyc.region_config USING GIN(countries);

-- Table 6: kyc.provider_config
CREATE TABLE kyc.provider_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL UNIQUE,
    api_key_encrypted TEXT NOT NULL,
    api_secret_encrypted TEXT,
    webhook_secret_encrypted TEXT NOT NULL,
    base_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_sandbox BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_config_active ON kyc.provider_config(is_active);

-- ALTER TABLE for auth.users
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS account_tier VARCHAR(50) DEFAULT 'Standard';
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'not_submitted';
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON auth.users(kyc_status);


-- ============================================================================
-- FROM FILE: 20-kyc-providers.md
-- ============================================================================

-- ALTER TABLE kyc.provider_config (add branding fields)
ALTER TABLE kyc.provider_config ADD COLUMN IF NOT EXISTS color VARCHAR(7);
ALTER TABLE kyc.provider_config ADD COLUMN IF NOT EXISTS bg_color VARCHAR(9);
ALTER TABLE kyc.provider_config ADD COLUMN IF NOT EXISTS abbreviation VARCHAR(10);
ALTER TABLE kyc.provider_config ADD COLUMN IF NOT EXISTS logo_filename VARCHAR(255);
ALTER TABLE kyc.provider_config ADD COLUMN IF NOT EXISTS docs_url TEXT;
ALTER TABLE kyc.provider_config ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES auth.users(id);
ALTER TABLE kyc.provider_config ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- Table 7: kyc.health_checks
CREATE TABLE kyc.health_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    details JSONB,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_provider FOREIGN KEY (provider_id) REFERENCES kyc.provider_config(provider) ON DELETE CASCADE
);

CREATE INDEX idx_health_checks_provider ON kyc.health_checks(provider_id, checked_at DESC);
CREATE INDEX idx_health_checks_status ON kyc.health_checks(status);
CREATE INDEX idx_health_checks_checked_at ON kyc.health_checks(checked_at DESC);

-- Table 8: kyc.provider_workflows
CREATE TABLE kyc.provider_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id VARCHAR(50) NOT NULL REFERENCES kyc.provider_config(provider),
    workflow_name VARCHAR(100) NOT NULL,
    workflow_id VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    verification_level VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, workflow_name)
);

CREATE INDEX idx_provider_workflows_provider ON kyc.provider_workflows(provider_id);

-- Table 9: kyc.webhook_logs
CREATE TABLE kyc.webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id VARCHAR(50) NOT NULL REFERENCES kyc.provider_config(provider),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature VARCHAR(500),
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_provider ON kyc.webhook_logs(provider_id);
CREATE INDEX idx_webhook_logs_status ON kyc.webhook_logs(status);
CREATE INDEX idx_webhook_logs_received_at ON kyc.webhook_logs(received_at DESC);
CREATE INDEX idx_webhook_logs_event_type ON kyc.webhook_logs(event_type);

-- ALTER TABLE kyc.region_config (add provider assignments)
ALTER TABLE kyc.region_config ADD COLUMN IF NOT EXISTS provider_ids VARCHAR(50)[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_region_config_provider_ids ON kyc.region_config USING GIN(provider_ids);


-- ============================================================================
-- FROM FILE: 06-shift-handoff.md
-- ============================================================================

-- New Schema
CREATE SCHEMA IF NOT EXISTS operations;

-- New ENUMs
CREATE TYPE operations.shift_status AS ENUM ('active', 'ended', 'abandoned');
CREATE TYPE operations.activity_priority AS ENUM ('normal', 'warning', 'critical');
CREATE TYPE operations.watch_item_status AS ENUM ('active', 'resolved', 'escalated');

-- Table 10: operations.shifts
CREATE TABLE operations.shifts (
    shift_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(user_id),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration_minutes INTEGER,
    status operations.shift_status NOT NULL DEFAULT 'active',
    actions_count INTEGER DEFAULT 0,
    incidents_count INTEGER DEFAULT 0,
    handoff_notes TEXT,
    handoff_submitted_at TIMESTAMPTZ,
    handoff_received_by UUID REFERENCES auth.users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shifts_user_id ON operations.shifts(user_id);
CREATE INDEX idx_shifts_start_time ON operations.shifts(start_time DESC);
CREATE INDEX idx_shifts_status ON operations.shifts(status) WHERE status = 'active';
CREATE UNIQUE INDEX idx_shifts_active_user ON operations.shifts(user_id) WHERE status = 'active';

-- Table 11: operations.shift_activities
CREATE TABLE operations.shift_activities (
    activity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id UUID NOT NULL REFERENCES operations.shifts(shift_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(user_id),
    action TEXT NOT NULL,
    notes TEXT,
    priority operations.activity_priority NOT NULL DEFAULT 'normal',
    bot_id UUID REFERENCES trading.bots(bot_id),
    alert_id UUID REFERENCES trading.alerts(alert_id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shift_activities_shift_id ON operations.shift_activities(shift_id);
CREATE INDEX idx_shift_activities_created_at ON operations.shift_activities(created_at DESC);
CREATE INDEX idx_shift_activities_priority ON operations.shift_activities(priority);

-- Table 12: operations.watch_list_items
CREATE TABLE operations.watch_list_items (
    watch_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id UUID NOT NULL REFERENCES operations.shifts(shift_id),
    created_by UUID NOT NULL REFERENCES auth.users(user_id),
    title TEXT NOT NULL,
    description TEXT,
    priority operations.activity_priority NOT NULL DEFAULT 'warning',
    status operations.watch_item_status NOT NULL DEFAULT 'active',
    bot_id UUID REFERENCES trading.bots(bot_id),
    service_name VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(user_id),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_watch_list_shift_id ON operations.watch_list_items(shift_id);
CREATE INDEX idx_watch_list_status ON operations.watch_list_items(status) WHERE status = 'active';
CREATE INDEX idx_watch_list_priority ON operations.watch_list_items(priority);


-- ============================================================================
-- FROM FILE: 23-settings-security.md
-- ============================================================================

-- New Schema
CREATE SCHEMA IF NOT EXISTS platform;

-- Table 13: auth.admin_users
CREATE TABLE auth.admin_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash TEXT,
    role VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'invited',
    two_fa_enabled BOOLEAN DEFAULT false,
    two_fa_secret TEXT,
    invited_by_user_id INTEGER REFERENCES auth.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT valid_role CHECK (role IN ('Platform Admin', 'Compliance Officer', 'Ops Engineer', 'Read Only'))
);

CREATE INDEX idx_admin_users_email ON auth.admin_users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_admin_users_role ON auth.admin_users(role);
CREATE INDEX idx_admin_users_status ON auth.admin_users(status);

-- Table 14: platform.security_config
CREATE TABLE platform.security_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    session_timeout_minutes INTEGER NOT NULL DEFAULT 480,
    force_two_fa BOOLEAN DEFAULT true,
    min_password_length INTEGER NOT NULL DEFAULT 12,
    require_special_chars BOOLEAN DEFAULT true,
    max_login_attempts INTEGER NOT NULL DEFAULT 5,
    ip_allowlist_enabled BOOLEAN DEFAULT false,
    audit_retention_years INTEGER NOT NULL DEFAULT 7,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id INTEGER REFERENCES auth.admin_users(id),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT single_row_config CHECK (id = 1),
    CONSTRAINT session_timeout_positive CHECK (session_timeout_minutes > 0),
    CONSTRAINT min_password_valid CHECK (min_password_length BETWEEN 8 AND 128),
    CONSTRAINT max_login_attempts_positive CHECK (max_login_attempts > 0),
    CONSTRAINT audit_retention_positive CHECK (audit_retention_years > 0)
);

INSERT INTO platform.security_config VALUES (1, 480, true, 12, true, 5, false, 7, NOW(), NULL, NULL);

-- Table 15: platform.ip_allowlist
CREATE TABLE platform.ip_allowlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_cidr VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id INTEGER REFERENCES auth.admin_users(id),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT unique_active_ip UNIQUE (ip_cidr) WHERE (deleted_at IS NULL)
);

CREATE INDEX idx_ip_allowlist_cidr ON platform.ip_allowlist(ip_cidr) WHERE deleted_at IS NULL;

-- Table 16: auth.sessions
CREATE TABLE auth.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL,
    user_type VARCHAR(20) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    ip_address INET NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT valid_user_type CHECK (user_type IN ('admin', 'customer'))
);

CREATE INDEX idx_sessions_token ON auth.sessions(token);
CREATE INDEX idx_sessions_user ON auth.sessions(user_id, user_type);
CREATE INDEX idx_sessions_expiry ON auth.sessions(expires_at);

-- Table 17: auth.invite_tokens
CREATE TABLE auth.invite_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES auth.admin_users(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invite_tokens_token ON auth.invite_tokens(token);
CREATE INDEX idx_invite_tokens_user ON auth.invite_tokens(user_id);

-- Table 18: auth.login_attempts
CREATE TABLE auth.login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email ON auth.login_attempts(email, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip ON auth.login_attempts(ip_address, attempted_at DESC);


-- ============================================================================
-- FROM FILE: 22-settings-billing.md
-- ============================================================================

-- New Schema (if not exists)
CREATE SCHEMA IF NOT EXISTS finance;

-- Table 19: platform.billing_config
CREATE TABLE platform.billing_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    performance_fee_pct DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    fee_calculation_period VARCHAR(20) NOT NULL DEFAULT 'monthly',
    high_watermark_reset VARCHAR(20) NOT NULL DEFAULT 'annual',
    payment_gateway VARCHAR(50) NOT NULL DEFAULT 'stripe',
    gateway_api_key_encrypted TEXT,
    gateway_secret_key_encrypted TEXT,
    gateway_webhook_secret_encrypted TEXT,
    vat_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    vat_enabled BOOLEAN DEFAULT true,
    tax_jurisdiction VARCHAR(100),
    invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'STLA',
    invoice_legal_entity TEXT NOT NULL DEFAULT 'Stella Financial Technologies Ltd.',
    invoice_due_days INTEGER NOT NULL DEFAULT 7,
    payment_failure_grace_days INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID REFERENCES auth.users(user_id),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT single_row_config CHECK (id = 1),
    CONSTRAINT performance_fee_range CHECK (performance_fee_pct BETWEEN 0 AND 50),
    CONSTRAINT vat_rate_range CHECK (vat_rate_pct BETWEEN 0 AND 100),
    CONSTRAINT invoice_due_positive CHECK (invoice_due_days > 0),
    CONSTRAINT grace_period_positive CHECK (payment_failure_grace_days >= 0)
);

INSERT INTO platform.billing_config VALUES (1, 20.00, 'monthly', 'annual', 'stripe', NULL, NULL, NULL, 18.00, true, NULL, 'STLA', 'Stella Financial Technologies Ltd.', 7, 3, NOW(), NULL, NULL) ON CONFLICT (id) DO NOTHING;

-- Table 20: finance.fees_collected
CREATE TABLE finance.fees_collected (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(user_id),
    fee_type VARCHAR(50) NOT NULL,
    amount_usd DECIMAL(18,8) NOT NULL,
    amount_local_currency DECIMAL(18,8),
    currency_code VARCHAR(10),
    profit_period_start DATE,
    profit_period_end DATE,
    user_profit_usd DECIMAL(18,8),
    fee_percentage DECIMAL(5,2),
    payment_gateway VARCHAR(50),
    payment_transaction_id VARCHAR(255),
    payment_status VARCHAR(50),
    invoice_id VARCHAR(50),
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fees_collected_user ON finance.fees_collected(user_id);
CREATE INDEX idx_fees_collected_type ON finance.fees_collected(fee_type);
CREATE INDEX idx_fees_collected_date ON finance.fees_collected(collected_at DESC);
CREATE INDEX idx_fees_collected_payment_status ON finance.fees_collected(payment_status);

-- Table 21: finance.subscriptions
CREATE TABLE finance.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(user_id),
    plan_name VARCHAR(100) NOT NULL,
    plan_tier VARCHAR(50) NOT NULL,
    billing_period VARCHAR(20) NOT NULL,
    amount_usd DECIMAL(18,8) NOT NULL,
    currency_code VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,
    current_period_start DATE NOT NULL,
    current_period_end DATE NOT NULL,
    next_billing_date DATE,
    payment_gateway VARCHAR(50),
    subscription_id_external VARCHAR(255),
    canceled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON finance.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON finance.subscriptions(status);
CREATE INDEX idx_subscriptions_next_billing ON finance.subscriptions(next_billing_date);


-- ============================================================================
-- FROM FILE: 24-settings-compliance.md
-- ============================================================================

-- Table 22: compliance.compliance_settings
CREATE TABLE compliance.compliance_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aml_threshold BIGINT NOT NULL DEFAULT 5000000,
    aml_currency VARCHAR(3) NOT NULL DEFAULT 'UGX',
    sanctions_lists TEXT NOT NULL DEFAULT 'OFAC,UN,EU',
    sanctions_refresh_days INTEGER NOT NULL DEFAULT 1,
    trade_report_threshold BIGINT NOT NULL DEFAULT 10000000,
    auto_suspend_on_aml_hit BOOLEAN NOT NULL DEFAULT true,
    require_reason_for_override BOOLEAN NOT NULL DEFAULT true,
    gdpr_enabled BOOLEAN NOT NULL DEFAULT true,
    trade_retention_years INTEGER NOT NULL DEFAULT 7 CHECK (trade_retention_years >= 7),
    user_retention_years INTEGER NOT NULL DEFAULT 7 CHECK (user_retention_years >= 7),
    audit_retention_years INTEGER NOT NULL DEFAULT 7 CHECK (audit_retention_years >= 7),
    kyc_retention_years INTEGER NOT NULL DEFAULT 10 CHECK (kyc_retention_years >= 7),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID REFERENCES auth.users(user_id),
    CONSTRAINT only_one_compliance_settings CHECK (id = id)
);

CREATE UNIQUE INDEX idx_compliance_settings_singleton ON compliance.compliance_settings ((1));

INSERT INTO compliance.compliance_settings (id, aml_threshold, aml_currency, sanctions_lists, trade_report_threshold)
VALUES (uuid_generate_v4(), 5000000, 'UGX', 'OFAC,UN,EU', 10000000) ON CONFLICT DO NOTHING;

-- Table 23: compliance.jurisdiction_restrictions
CREATE TABLE compliance.jurisdiction_restrictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_code VARCHAR(2) NOT NULL UNIQUE,
    country_name VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('blocked', 'restricted')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES auth.users(user_id),
    CONSTRAINT country_code_uppercase CHECK (country_code = UPPER(country_code))
);

CREATE INDEX idx_jurisdiction_restrictions_active ON compliance.jurisdiction_restrictions (is_active) WHERE is_active = true;
CREATE INDEX idx_jurisdiction_restrictions_status ON compliance.jurisdiction_restrictions (status);
CREATE UNIQUE INDEX idx_jurisdiction_restrictions_country ON compliance.jurisdiction_restrictions (country_code);

INSERT INTO compliance.jurisdiction_restrictions (country_code, country_name, reason, status) VALUES
('IR', 'Iran', 'OFAC sanctions', 'blocked'),
('KP', 'North Korea', 'OFAC sanctions', 'blocked'),
('RU', 'Russia', 'EU/US sanctions — restricted products only', 'restricted'),
('BY', 'Belarus', 'EU sanctions', 'restricted'),
('SY', 'Syria', 'OFAC sanctions', 'blocked'),
('CU', 'Cuba', 'OFAC sanctions', 'blocked')
ON CONFLICT (country_code) DO NOTHING;

-- Table 24: compliance.aml_flags
CREATE TABLE compliance.aml_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
    transaction_id UUID,
    transaction_type VARCHAR(50) NOT NULL,
    amount_ugx BIGINT NOT NULL,
    amount_original BIGINT NOT NULL,
    currency_original VARCHAR(3) NOT NULL,
    flag_reason VARCHAR(255) NOT NULL,
    flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN ('threshold_exceeded', 'sanctions_match', 'manual')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'declined', 'escalated')),
    reviewed_by_user_id UUID REFERENCES auth.users(user_id),
    review_decision TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aml_flags_user ON compliance.aml_flags (user_id, created_at DESC);
CREATE INDEX idx_aml_flags_status ON compliance.aml_flags (status, created_at DESC);
CREATE INDEX idx_aml_flags_type ON compliance.aml_flags (flag_type);

-- Table 25: compliance.sanctions_screening_log
CREATE TABLE compliance.sanctions_screening_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
    screening_type VARCHAR(50) NOT NULL CHECK (screening_type IN ('onboarding', 'periodic', 'manual')),
    lists_checked TEXT NOT NULL,
    match_found BOOLEAN NOT NULL DEFAULT false,
    match_details JSONB,
    screened_by_user_id UUID REFERENCES auth.users(user_id),
    screened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sanctions_screening_user ON compliance.sanctions_screening_log (user_id, screened_at DESC);
CREATE INDEX idx_sanctions_screening_matches ON compliance.sanctions_screening_log (match_found, screened_at DESC);


-- ============================================================================
-- FROM FILE: 25-settings-exchanges.md
-- ============================================================================

-- Table 26: exchange.platform_exchanges
CREATE TABLE exchange.platform_exchanges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    logo_url VARCHAR(500),
    color VARCHAR(7),
    bg_color VARCHAR(9),
    abbr VARCHAR(3),
    credentials_encrypted BYTEA NOT NULL,
    rate_limit_per_min INTEGER NOT NULL DEFAULT 1200,
    environment VARCHAR(50) NOT NULL DEFAULT 'live' CHECK (environment IN ('live', 'sandbox')),
    max_open_orders INTEGER NOT NULL DEFAULT 200,
    connection_status VARCHAR(50) NOT NULL DEFAULT 'disconnected' CHECK (connection_status IN ('connected', 'degraded', 'disconnected')),
    last_health_check_at TIMESTAMPTZ,
    last_ping_ms INTEGER,
    pairs_count INTEGER NOT NULL DEFAULT 0,
    maker_fee_pct DECIMAL(5,4),
    taker_fee_pct DECIMAL(5,4),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT exchange_code_lowercase CHECK (exchange_code = LOWER(exchange_code))
);

CREATE INDEX idx_platform_exchanges_active ON exchange.platform_exchanges (is_active) WHERE is_active = true;
CREATE INDEX idx_platform_exchanges_status ON exchange.platform_exchanges (connection_status);
CREATE UNIQUE INDEX idx_platform_exchanges_code ON exchange.platform_exchanges (exchange_code);

-- Table 27: exchange.exchange_health_checks
CREATE TABLE exchange.exchange_health_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_id UUID NOT NULL REFERENCES exchange.platform_exchanges(id) ON DELETE CASCADE,
    check_type VARCHAR(50) NOT NULL,
    ping_ms INTEGER,
    status_code INTEGER,
    is_healthy BOOLEAN NOT NULL,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_by_user_id UUID REFERENCES auth.users(user_id),
    CONSTRAINT health_check_ping_positive CHECK (ping_ms >= 0)
);

CREATE INDEX idx_exchange_health_exchange ON exchange.exchange_health_checks (exchange_id, checked_at DESC);
CREATE INDEX idx_exchange_health_recent ON exchange.exchange_health_checks (checked_at DESC) WHERE checked_at > NOW() - INTERVAL '5 minutes';

-- Table 28: exchange.exchange_trading_pairs
CREATE TABLE exchange.exchange_trading_pairs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_id UUID NOT NULL REFERENCES exchange.platform_exchanges(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    base_currency VARCHAR(10) NOT NULL,
    quote_currency VARCHAR(10) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    min_order_size DECIMAL(20,8),
    max_order_size DECIMAL(20,8),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_exchange_symbol UNIQUE (exchange_id, symbol)
);

CREATE INDEX idx_exchange_pairs_active ON exchange.exchange_trading_pairs (exchange_id, is_active) WHERE is_active = true;
CREATE INDEX idx_exchange_pairs_symbol ON exchange.exchange_trading_pairs (symbol);


-- =============================================================================
-- Source: 20-settings-risk.md
-- Tables: 3 (platform.risk_controls, platform.circuit_breaker_events, platform.user_drawdown_tracking)
-- =============================================================================

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

-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------

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


-- =============================================================================
-- Source: 21-settings-integrations.md
-- Tables: 4 (platform.integrations, platform.outbound_webhooks, platform.webhook_deliveries, platform.webhook_signing_keys)
-- =============================================================================

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

-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------

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
  WHERE delivered_at > NOW() - INTERVAL '7 days';

-- -----------------------------------------------------------------------------

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


-- =============================================================================
-- Source: 22-settings-bot-engine.md
-- Tables: 1 (platform.bot_engine_defaults)
-- ALTER TABLE: trading.bots (add custom override columns)
-- =============================================================================

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

-- ALTER TABLE trading.bots to track custom overrides
-- NOTE: Only execute if trading.bots table exists
-- ALTER TABLE trading.bots
--   ADD COLUMN IF NOT EXISTS uses_default_heartbeat BOOLEAN NOT NULL DEFAULT true,
--   ADD COLUMN IF NOT EXISTS uses_default_timeout BOOLEAN NOT NULL DEFAULT true,
--   ADD COLUMN IF NOT EXISTS uses_default_slippage BOOLEAN NOT NULL DEFAULT true,
--   ADD COLUMN IF NOT EXISTS uses_default_reconcile BOOLEAN NOT NULL DEFAULT true,
--   ADD COLUMN IF NOT EXISTS custom_heartbeat_interval_sec INTEGER,
--   ADD COLUMN IF NOT EXISTS custom_order_timeout_sec INTEGER,
--   ADD COLUMN IF NOT EXISTS custom_slippage_pct DECIMAL(5,2),
--   ADD COLUMN IF NOT EXISTS custom_reconcile_freq_min INTEGER;


-- =============================================================================
-- Source: 23-settings-communications.md
-- Tables: 3 (platform.email_settings, platform.email_templates, platform.email_logs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.email_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  sender_name VARCHAR(255) NOT NULL DEFAULT 'Stella',
  sender_email VARCHAR(255) NOT NULL DEFAULT 'noreply@stella.io',
  support_email VARCHAR(255) NOT NULL DEFAULT 'support@stella.io',

  -- SMTP configuration (optional, can use third-party like SendGrid)
  smtp_host VARCHAR(255),
  smtp_port INTEGER,
  smtp_username VARCHAR(255),
  smtp_password_encrypted BYTEA, -- Encrypted with pgcrypto

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_email_settings CHECK (id = id) -- Enforce singleton
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_settings_singleton ON platform.email_settings ((1));

-- Insert default row
INSERT INTO platform.email_settings (id, sender_name, sender_email, support_email)
VALUES (uuid_generate_v4(), 'Stella', 'noreply@stella.io', 'support@stella.io')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform.email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_key VARCHAR(100) UNIQUE NOT NULL, -- 'kyc_approved', 'bot_stopped', etc.

  name VARCHAR(255) NOT NULL,
  description TEXT, -- "Sent when user verification succeeds"
  trigger_event VARCHAR(100), -- Event that triggers this template

  subject_line TEXT NOT NULL,
  body_markdown TEXT NOT NULL, -- Supports Handlebars syntax

  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT template_key_lowercase CHECK (template_key = LOWER(template_key))
);

CREATE INDEX IF NOT EXISTS idx_email_templates_active ON platform.email_templates (is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_key ON platform.email_templates (template_key);

-- Seed data for email templates
INSERT INTO platform.email_templates (template_key, name, description, trigger_event, subject_line, body_markdown) VALUES
('kyc_approved', 'KYC Approved', 'Sent when user verification succeeds', 'kyc.approved',
  'Your Stella verification is complete',
  'Hi {{user.first_name}},\n\nYour account verification has been approved.\n\nYou can now activate your trading bots and start growing your portfolio.\n\nIf you have questions, contact us at {{support_email}}.\n\n— The Stella Team'),

('kyc_declined', 'KYC Declined', 'Sent when verification is rejected', 'kyc.declined',
  'Your Stella verification requires attention',
  'Hi {{user.first_name}},\n\nUnfortunately, we were unable to verify your account at this time.\n\nReason: {{decline_reason}}\n\nYou can resubmit your documents from your dashboard.\n\nIf you have questions, contact us at {{support_email}}.\n\n— The Stella Team'),

('kyc_resubmit', 'KYC Re-Submit', 'Sent when re-verification is required', 'kyc.resubmit',
  'Action required: Update your Stella verification',
  'Hi {{user.first_name}},\n\nYour account requires re-verification due to {{reverification_reason}}.\n\nPlease submit updated documents within 7 days to avoid account suspension.\n\nIf you have questions, contact us at {{support_email}}.\n\n— The Stella Team'),

('bot_stopped', 'Bot Stopped', 'Sent when a user''s bot is halted', 'bot.stopped',
  'Your Stella bot "{{bot.name}}" has stopped',
  'Hi {{user.first_name}},\n\nYour bot **{{bot.name}}** has been stopped.\n\nReason: {{stop_reason}}\n\nYou can restart it from your dashboard or contact support if this was unexpected.\n\n— The Stella Team'),

('payment_failed', 'Payment Failed', 'Billing failure notification', 'billing.payment_failed',
  'Payment failed for your Stella subscription',
  'Hi {{user.first_name}},\n\nWe were unable to process your payment for the {{tier_name}} subscription.\n\nPlease update your payment method within {{grace_period_days}} days to avoid service interruption.\n\nIf you have questions, contact us at {{support_email}}.\n\n— The Stella Team'),

('tier_upgraded', 'Tier Upgraded', 'Subscription upgrade confirmation', 'billing.tier_upgraded',
  'Welcome to Stella {{tier_name}}!',
  'Hi {{user.first_name}},\n\nYour subscription has been upgraded to **{{tier_name}}**.\n\nNew limits:\n- Max Bots: {{tier.max_bots}}\n- Max AUM: {{tier.max_aum}}\n- API Access: {{tier.api_access}}\n\nEnjoy your upgraded features!\n\n— The Stella Team'),

('welcome', 'Welcome', 'Sent on account creation', 'user.created',
  'Welcome to Stella',
  'Hi {{user.first_name}},\n\nWelcome to Stella! We''re excited to have you.\n\nNext steps:\n1. Complete your KYC verification\n2. Connect your exchange credentials\n3. Create your first trading bot\n\nIf you need help getting started, reach out to {{support_email}}.\n\n— The Stella Team'),

('withdrawal', 'Withdrawal Processed', 'Funds withdrawal confirmation', 'finance.withdrawal',
  'Your withdrawal has been processed',
  'Hi {{user.first_name}},\n\nYour withdrawal of {{amount}} {{currency}} has been processed.\n\nTransaction ID: {{transaction_id}}\nDestination: {{destination}}\n\nFunds should arrive within {{eta_hours}} hours.\n\n— The Stella Team')
ON CONFLICT (template_key) DO NOTHING;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform.email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES platform.email_templates(id),

  recipient_user_id UUID REFERENCES auth.users(id),
  recipient_email VARCHAR(255) NOT NULL,

  subject TEXT NOT NULL,
  body_html TEXT NOT NULL, -- Rendered from Markdown

  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
  status_message TEXT, -- Error message if failed

  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (status IN ('pending', 'sent', 'failed', 'bounced'))
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON platform.email_logs (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON platform.email_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON platform.email_logs (template_id, created_at DESC);


-- =============================================================================
-- Source: 26-settings-infrastructure.md
-- Tables: 3 (platform.infrastructure_settings, platform.feature_flags, platform.background_job_runs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.infrastructure_settings (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_infra_settings_singleton ON platform.infrastructure_settings ((1));

-- Insert default settings
INSERT INTO platform.infrastructure_settings (id)
VALUES (uuid_generate_v4())
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform.feature_flags (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_key ON platform.feature_flags (flag_key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_prod ON platform.feature_flags (enabled_prod) WHERE enabled_prod = true;

-- Seed data for feature flags
INSERT INTO platform.feature_flags (flag_key, name, description, enabled_prod, enabled_staging, enabled_dev) VALUES
('multi_exchange_arbitrage', 'Multi-Exchange Arbitrage', 'Allow bots to execute cross-exchange arbitrage simultaneously', true, true, true),
('enhanced_due_diligence', 'Enhanced Due Diligence KYC', 'Require enhanced KYC for accounts above 10M UGX AUM', true, true, true),
('auto_circuit_breaker', 'Auto Circuit Breaker', 'Automatically pause all bots when platform drawdown exceeds threshold', true, true, true),
('user_api_access', 'User API Access', 'Allow Pro/Enterprise users to connect external tools via API', false, true, true),
('websocket_v2', 'WebSocket v2 Protocol', 'New optimised WebSocket protocol with binary framing', false, false, true),
('referral_programme', 'Referral Programme', 'Enable referral code generation and commission tracking', false, true, true),
('strategy_marketplace', 'Strategy Marketplace', 'Allow users to publish and subscribe to community strategies', false, false, false)
ON CONFLICT (flag_key) DO NOTHING;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform.background_job_runs (
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

CREATE INDEX IF NOT EXISTS idx_job_runs_job ON platform.background_job_runs (job_name, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON platform.background_job_runs (status, triggered_at DESC);


-- =============================================================================
-- Source: 27-settings-notifications.md
-- Tables: 5 (platform.notification_channels, platform.notification_routing, platform.notification_settings, platform.alert_types, platform.notification_log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.notification_channels (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_channels_key ON platform.notification_channels (channel_key);
CREATE INDEX IF NOT EXISTS idx_notification_channels_active ON platform.notification_channels (is_active) WHERE is_active = true;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform.notification_routing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES platform.notification_channels(id) ON DELETE CASCADE,

  severity VARCHAR(50) NOT NULL, -- 'critical', 'warning', 'info'
    CHECK (severity IN ('critical', 'warning', 'info')),

  enabled BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_channel_severity UNIQUE (channel_id, severity)
);

CREATE INDEX IF NOT EXISTS idx_notification_routing_enabled ON platform.notification_routing (channel_id, severity) WHERE enabled = true;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform.notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  dedup_window_minutes INTEGER NOT NULL DEFAULT 5,
    CHECK (dedup_window_minutes >= 1 AND dedup_window_minutes <= 60),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_notification_settings CHECK (id = id) -- Enforce singleton
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_settings_singleton ON platform.notification_settings ((1));

-- Insert default settings
INSERT INTO platform.notification_settings (id, dedup_window_minutes)
VALUES (uuid_generate_v4(), 5)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform.alert_types (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_types_key ON platform.alert_types (alert_key);
CREATE INDEX IF NOT EXISTS idx_alert_types_enabled ON platform.alert_types (is_enabled) WHERE is_enabled = true;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform.notification_log (
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

CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON platform.notification_log (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON platform.notification_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_severity ON platform.notification_log (severity, created_at DESC);

-- Seed data for notification channels
INSERT INTO platform.notification_channels (channel_key, name, icon, is_active, config) VALUES
('slack', 'Slack', '💬', true, '{"webhook_url": "https://hooks.slack.com/services/T0••••/B0••••/x••••"}'),
('pagerduty', 'PagerDuty', '🚨', true, '{"webhook_url": "https://events.pagerduty.com/v2/enqueue/••••"}'),
('email', 'Email', '📧', true, '{"recipients": "ops@stella.io, alerts@stella.io"}'),
('sms', 'SMS', '📱', false, '{"phone_numbers": ""}')
ON CONFLICT (channel_key) DO NOTHING;

-- Seed data for notification routing (populate for all channels x severities)
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

-- Seed data for alert types
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


-- =============================================================================
-- Source: 05-alerts.md
-- Tables: trading.alerts (already exists in stella-database.sql)
-- ALTER TABLE: Add deleted_at column and indexes
-- =============================================================================

-- Note: trading.alerts table already exists in stella-database.sql
-- Only adding recommended schema enhancements

-- Add soft delete support
ALTER TABLE trading.alerts
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_alerts_status ON trading.alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON trading.alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON trading.alerts(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged ON trading.alerts(status, severity, triggered_at)
  WHERE status = 'active';

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_alerts_active_by_severity ON trading.alerts(severity, triggered_at DESC)
  WHERE status = 'active' AND deleted_at IS NULL;


-- =============================================================================
-- Source: 07-bot-detail.md
-- Tables: 1 (trading.bot_equity_snapshots)
-- =============================================================================

CREATE TABLE IF NOT EXISTS trading.bot_equity_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID NOT NULL REFERENCES trading.bots(bot_id) ON DELETE CASCADE,
    session_id UUID,  -- Groups snapshots by session

    -- Equity data
    equity_usd DECIMAL(15,4) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Session context
    trades_count INTEGER NOT NULL DEFAULT 0,
    win_rate DECIMAL(5,2),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equity_snapshots_bot_session ON trading.bot_equity_snapshots(bot_id, session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_equity_snapshots_timestamp ON trading.bot_equity_snapshots(timestamp DESC);

-- Convert to TimescaleDB hypertable for efficient time-series storage
-- NOTE: Only execute if TimescaleDB extension is enabled
-- SELECT create_hypertable('trading.bot_equity_snapshots', 'timestamp');

-- Retention policy: Keep equity snapshots for 90 days
-- NOTE: Only execute after hypertable creation
-- SELECT add_retention_policy('trading.bot_equity_snapshots', INTERVAL '90 days');

-- Comments
COMMENT ON TABLE trading.bot_equity_snapshots IS 'Time-series equity curve data for bots';
COMMENT ON COLUMN trading.bot_equity_snapshots.session_id IS 'Groups snapshots by session (reset on bot restart)';


-- =============================================================================
-- Source: 08-users-list.md
-- Tables: 1 (auth.user_follows)
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth.user_follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    followed_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_follow UNIQUE (follower_user_id, followed_user_id),
    CONSTRAINT chk_no_self_follow CHECK (follower_user_id != followed_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON auth.user_follows(follower_user_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_followed ON auth.user_follows(followed_user_id);

COMMENT ON TABLE auth.user_follows IS 'Tracks user follow relationships for copy trading';


-- =============================================================================
-- Source: 09-user-detail.md
-- Tables: 2 (auth.user_suspensions, auth.activity_logs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth.user_suspensions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    suspended_by UUID REFERENCES auth.admin_users(id),
    reason TEXT NOT NULL,
    suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    suspended_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    reactivated_at TIMESTAMPTZ,
    reactivated_by UUID REFERENCES auth.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_suspensions_user_id ON auth.user_suspensions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_suspensions_active ON auth.user_suspensions(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE auth.user_suspensions IS 'Tracks user suspension history and durations';

-- -----------------------------------------------------------------------------

CREATE TYPE IF NOT EXISTS auth.activity_type AS ENUM (
    'login', 'logout', 'login_failed',
    'trade', 'withdraw', 'deposit',
    'settings_change', 'password_change', 'email_change',
    'bot_created', 'bot_started', 'bot_stopped',
    'kyc_submitted', 'kyc_approved', 'kyc_rejected',
    'account_suspended', 'account_reactivated'
);

CREATE TABLE IF NOT EXISTS auth.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type auth.activity_type NOT NULL,
    description TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON auth.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON auth.activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON auth.activity_logs(created_at DESC);

COMMENT ON TABLE auth.activity_logs IS 'Comprehensive user activity audit trail';


-- =============================================================================
-- Source: 14-finance-strategies.md
-- Tables: 1 (finance.strategy_stats)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS finance;

CREATE TABLE IF NOT EXISTS finance.strategy_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES strategy.strategies(id),
    calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Risk Metrics
    sharpe_ratio DECIMAL(8,4),
    sortino_ratio DECIMAL(8,4),
    max_drawdown_pct DECIMAL(8,4),
    correlation_to_benchmark DECIMAL(8,4),

    -- Additional Stats
    volatility DECIMAL(8,4),
    calmar_ratio DECIMAL(8,4),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(strategy_id, calculation_date)
);

CREATE INDEX IF NOT EXISTS idx_strategy_stats_strategy ON finance.strategy_stats(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_stats_date ON finance.strategy_stats(calculation_date DESC);

COMMENT ON TABLE finance.strategy_stats IS 'Pre-calculated strategy performance metrics (updated daily)';

-- Recommended indexes for performance
-- NOTE: Only execute if trading.positions and trading.equity_snapshots exist
-- CREATE INDEX IF NOT EXISTS idx_positions_strategy_closed
-- ON trading.positions(strategy_id, closed_at)
-- WHERE status = 'closed';

-- CREATE INDEX IF NOT EXISTS idx_equity_snapshots_strategy
-- ON trading.equity_snapshots(bot_id, snapshot_at DESC);


-- =============================================================================
-- Source: 15-finance-risk.md
-- Tables: 1 (finance.risk_metrics)
-- =============================================================================

CREATE TABLE IF NOT EXISTS finance.risk_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Value at Risk Metrics
    var_95_pct DECIMAL(8,4),       -- 95% VaR
    var_99_pct DECIMAL(8,4),       -- 99% VaR
    cvar_99_9_pct DECIMAL(8,4),    -- 99.9% Conditional VaR (expected shortfall)

    -- Diversification Metrics
    avg_strategy_correlation DECIMAL(8,4),
    portfolio_beta DECIMAL(8,4),

    -- Concentration Metrics
    max_exchange_concentration_pct DECIMAL(8,4),
    max_strategy_concentration_pct DECIMAL(8,4),
    max_pair_concentration_pct DECIMAL(8,4),

    -- Position Sizing Metrics
    avg_position_size_pct DECIMAL(8,4),
    max_position_size_pct DECIMAL(8,4),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(calculation_date)
);

CREATE INDEX IF NOT EXISTS idx_risk_metrics_date ON finance.risk_metrics(calculation_date DESC);

COMMENT ON TABLE finance.risk_metrics IS 'Daily risk metrics calculation for platform monitoring';


-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

COMMIT;

-- =============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- =============================================================================
-- WARNING: This will delete all data in these tables!
--
-- BEGIN;
--
-- -- Drop tables in reverse dependency order
-- DROP TABLE IF EXISTS finance.risk_metrics CASCADE;
-- DROP TABLE IF EXISTS finance.strategy_stats CASCADE;
-- DROP TABLE IF EXISTS auth.activity_logs CASCADE;
-- DROP TABLE IF EXISTS auth.user_suspensions CASCADE;
-- DROP TABLE IF EXISTS auth.user_follows CASCADE;
-- DROP TABLE IF EXISTS trading.bot_equity_snapshots CASCADE;
-- DROP TABLE IF EXISTS platform.notification_log CASCADE;
-- DROP TABLE IF EXISTS platform.alert_types CASCADE;
-- DROP TABLE IF EXISTS platform.notification_settings CASCADE;
-- DROP TABLE IF EXISTS platform.notification_routing CASCADE;
-- DROP TABLE IF EXISTS platform.notification_channels CASCADE;
-- DROP TABLE IF EXISTS platform.background_job_runs CASCADE;
-- DROP TABLE IF EXISTS platform.feature_flags CASCADE;
-- DROP TABLE IF EXISTS platform.infrastructure_settings CASCADE;
-- DROP TABLE IF EXISTS platform.email_logs CASCADE;
-- DROP TABLE IF EXISTS platform.email_templates CASCADE;
-- DROP TABLE IF EXISTS platform.email_settings CASCADE;
-- DROP TABLE IF EXISTS platform.bot_engine_defaults CASCADE;
-- DROP TABLE IF EXISTS platform.webhook_signing_keys CASCADE;
-- DROP TABLE IF EXISTS platform.webhook_deliveries CASCADE;
-- DROP TABLE IF EXISTS platform.outbound_webhooks CASCADE;
-- DROP TABLE IF EXISTS platform.integrations CASCADE;
-- DROP TABLE IF EXISTS platform.user_drawdown_tracking CASCADE;
-- DROP TABLE IF EXISTS platform.circuit_breaker_events CASCADE;
-- DROP TABLE IF EXISTS platform.risk_controls CASCADE;
-- DROP TABLE IF EXISTS exchange.exchange_trading_pairs CASCADE;
-- DROP TABLE IF EXISTS exchange.exchange_health_checks CASCADE;
-- DROP TABLE IF EXISTS exchange.platform_exchanges CASCADE;
-- DROP TABLE IF EXISTS compliance.sanctions_screening_log CASCADE;
-- DROP TABLE IF EXISTS compliance.aml_flags CASCADE;
-- DROP TABLE IF EXISTS compliance.jurisdiction_restrictions CASCADE;
-- DROP TABLE IF EXISTS compliance.compliance_settings CASCADE;
-- DROP TABLE IF EXISTS finance.subscriptions CASCADE;
-- DROP TABLE IF EXISTS finance.fees_collected CASCADE;
-- DROP TABLE IF EXISTS platform.billing_config CASCADE;
--
-- -- Drop ENUMs
-- DROP TYPE IF EXISTS auth.activity_type CASCADE;
--
-- -- Drop schemas (only if empty)
-- DROP SCHEMA IF EXISTS finance CASCADE;
-- DROP SCHEMA IF EXISTS exchange CASCADE;
--
-- -- Revert ALTER TABLE modifications
-- ALTER TABLE trading.alerts DROP COLUMN IF EXISTS deleted_at;
-- -- NOTE: trading.bots ALTER TABLE statements were commented out, so no rollback needed
--
-- COMMIT;
-- =============================================================================

