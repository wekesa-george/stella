-- ============================================================================
-- STELLA PLATFORM - SCHEMA MIGRATION
-- Migration: 001_page_analysis_schema_additions.sql
-- Version: 1.0.0
-- Date: February 21, 2026
--
-- Purpose: Add all schema changes required by page-by-page analysis documents
-- Source: docs/trading engine analysis/page-by-page-analysis/*.md
--
-- This migration adds:
-- - New schemas: kyc, operations, compliance, platform
-- - 18+ new tables for KYC, security, operations
-- - ALTER TABLE modifications to existing tables
-- - Indexes, constraints, and seed data
--
-- IMPORTANT: Review this migration carefully before applying to production
-- ============================================================================

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- NEW SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS kyc;
CREATE SCHEMA IF NOT EXISTS operations;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS platform;

COMMENT ON SCHEMA kyc IS 'KYC verification and provider management';
COMMENT ON SCHEMA operations IS 'Operator shift management and handoff';
COMMENT ON SCHEMA compliance IS 'Compliance, AML, and regulatory functions';
COMMENT ON SCHEMA platform IS 'Platform-wide settings and configuration';

-- ============================================================================
-- NEW ENUM TYPES
-- ============================================================================

-- Operations enums
CREATE TYPE operations.shift_status AS ENUM ('active', 'ended', 'abandoned');
CREATE TYPE operations.activity_priority AS ENUM ('normal', 'warning', 'critical');
CREATE TYPE operations.watch_item_status AS ENUM ('active', 'resolved', 'escalated');

-- ============================================================================
-- KYC SCHEMA TABLES (from 19-kyc-applicants.md, 20-kyc-providers.md)
-- ============================================================================

-- Sequence for KYC applicant IDs
CREATE SEQUENCE IF NOT EXISTS kyc.applicant_id_seq START 1001;

-- Table: kyc.applicants
CREATE TABLE IF NOT EXISTS kyc.applicants (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'KYC-' || LPAD(nextval('kyc.applicant_id_seq')::TEXT, 4, '0'),
    user_id UUID NOT NULL REFERENCES auth.users(user_id),
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
    reviewed_by_user_id UUID REFERENCES auth.users(user_id),
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(user_id),
    UNIQUE(provider, provider_applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_applicants_status ON kyc.applicants(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_applicants_provider ON kyc.applicants(provider);
CREATE INDEX IF NOT EXISTS idx_applicants_country ON kyc.applicants(country_code);
CREATE INDEX IF NOT EXISTS idx_applicants_user ON kyc.applicants(user_id);
CREATE INDEX IF NOT EXISTS idx_applicants_expiring ON kyc.applicants(document_expires_at)
    WHERE status = 'approved' AND document_expires_at IS NOT NULL;

COMMENT ON TABLE kyc.applicants IS 'KYC verification submissions and status';

-- Table: kyc.compliance_notes
CREATE TABLE IF NOT EXISTS kyc.compliance_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id VARCHAR(20) NOT NULL REFERENCES kyc.applicants(id),
    action VARCHAR(50) NOT NULL,
    note TEXT NOT NULL,
    created_by_user_id UUID NOT NULL REFERENCES auth.users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT note_not_empty CHECK (LENGTH(TRIM(note)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_compliance_notes_applicant ON kyc.compliance_notes(applicant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_notes_created_at ON kyc.compliance_notes(created_at DESC);

COMMENT ON TABLE kyc.compliance_notes IS 'Immutable audit trail of manual KYC decisions';

-- Table: kyc.verification_history
CREATE TABLE IF NOT EXISTS kyc.verification_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id VARCHAR(20) NOT NULL REFERENCES kyc.applicants(id),
    event VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider VARCHAR(50),
    score INTEGER,
    actioned_by_user_id UUID REFERENCES auth.users(user_id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_history_applicant ON kyc.verification_history(applicant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_verification_history_event ON kyc.verification_history(event);

COMMENT ON TABLE kyc.verification_history IS 'Timeline of all verification events per applicant';

-- Table: kyc.rejection_reasons
CREATE TABLE IF NOT EXISTS kyc.rejection_reasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id VARCHAR(20) NOT NULL REFERENCES kyc.applicants(id),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rejection_reasons_applicant ON kyc.rejection_reasons(applicant_id);

COMMENT ON TABLE kyc.rejection_reasons IS 'Multi-valued rejection reasons for declined applicants';

-- Table: kyc.region_config
CREATE TABLE IF NOT EXISTS kyc.region_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    countries VARCHAR(2)[] NOT NULL,
    requires_enhanced_dd BOOLEAN DEFAULT false,
    risk_tier VARCHAR(50) DEFAULT 'standard',
    provider_ids VARCHAR(50)[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_region_config_countries ON kyc.region_config USING GIN(countries);
CREATE INDEX IF NOT EXISTS idx_region_config_provider_ids ON kyc.region_config USING GIN(provider_ids);

COMMENT ON TABLE kyc.region_config IS 'Regional KYC configuration and risk tiers';

-- Table: kyc.provider_config
CREATE TABLE IF NOT EXISTS kyc.provider_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL UNIQUE,
    api_key_encrypted TEXT NOT NULL,
    api_secret_encrypted TEXT,
    webhook_secret_encrypted TEXT NOT NULL,
    base_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_sandbox BOOLEAN DEFAULT false,
    color VARCHAR(7),
    bg_color VARCHAR(9),
    abbreviation VARCHAR(10),
    logo_filename VARCHAR(255),
    docs_url TEXT,
    updated_by_user_id UUID REFERENCES auth.users(user_id),
    created_by_user_id UUID REFERENCES auth.users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_config_active ON kyc.provider_config(is_active);

COMMENT ON TABLE kyc.provider_config IS 'KYC provider API credentials and configuration';

-- Table: kyc.health_checks
CREATE TABLE IF NOT EXISTS kyc.health_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    details JSONB,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_provider FOREIGN KEY (provider_id) REFERENCES kyc.provider_config(provider) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_checks_provider ON kyc.health_checks(provider_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON kyc.health_checks(status);
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON kyc.health_checks(checked_at DESC);

COMMENT ON TABLE kyc.health_checks IS 'Provider API health check history';

-- Table: kyc.provider_workflows
CREATE TABLE IF NOT EXISTS kyc.provider_workflows (
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

CREATE INDEX IF NOT EXISTS idx_provider_workflows_provider ON kyc.provider_workflows(provider_id);

COMMENT ON TABLE kyc.provider_workflows IS 'Available verification workflows per provider';

-- Table: kyc.webhook_logs
CREATE TABLE IF NOT EXISTS kyc.webhook_logs (
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

CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON kyc.webhook_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON kyc.webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON kyc.webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON kyc.webhook_logs(event_type);

COMMENT ON TABLE kyc.webhook_logs IS 'Webhook delivery history from KYC providers';

-- ============================================================================
-- OPERATIONS SCHEMA TABLES (from 06-shift-handoff.md)
-- ============================================================================

-- Table: operations.shifts
CREATE TABLE IF NOT EXISTS operations.shifts (
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

CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON operations.shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON operations.shifts(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON operations.shifts(status) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_active_user ON operations.shifts(user_id) WHERE status = 'active';

COMMENT ON TABLE operations.shifts IS 'Tracks operator shift sessions for handoff and audit';

-- Table: operations.shift_activities
CREATE TABLE IF NOT EXISTS operations.shift_activities (
    activity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id UUID NOT NULL REFERENCES operations.shifts(shift_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(user_id),
    action TEXT NOT NULL,
    notes TEXT,
    priority operations.activity_priority NOT NULL DEFAULT 'normal',
    bot_id UUID REFERENCES trading.bots(bot_id),
    alert_id UUID REFERENCES trading.monitoring_alerts(id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_activities_shift_id ON operations.shift_activities(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_activities_created_at ON operations.shift_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_activities_priority ON operations.shift_activities(priority);

COMMENT ON TABLE operations.shift_activities IS 'Logs all operator actions during shift for handoff';

-- Table: operations.watch_list_items
CREATE TABLE IF NOT EXISTS operations.watch_list_items (
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

CREATE INDEX IF NOT EXISTS idx_watch_list_shift_id ON operations.watch_list_items(shift_id);
CREATE INDEX IF NOT EXISTS idx_watch_list_status ON operations.watch_list_items(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_watch_list_priority ON operations.watch_list_items(priority);

COMMENT ON TABLE operations.watch_list_items IS 'Critical items flagged for next shift attention';

-- ============================================================================
-- PLATFORM & AUTH TABLES (from 23-settings-security.md)
-- ============================================================================

-- Table: auth.admin_users
CREATE TABLE IF NOT EXISTS auth.admin_users (
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

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON auth.admin_users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON auth.admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_status ON auth.admin_users(status);

COMMENT ON TABLE auth.admin_users IS 'Admin panel user accounts with RBAC roles';

-- Table: platform.security_config
CREATE TABLE IF NOT EXISTS platform.security_config (
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

COMMENT ON TABLE platform.security_config IS 'Platform-wide security and authentication policy (single row)';

-- Insert default security configuration if not exists
INSERT INTO platform.security_config (id, session_timeout_minutes, force_two_fa, min_password_length, require_special_chars, max_login_attempts, ip_allowlist_enabled, audit_retention_years)
VALUES (1, 480, true, 12, true, 5, false, 7)
ON CONFLICT (id) DO NOTHING;

-- Table: platform.ip_allowlist
CREATE TABLE IF NOT EXISTS platform.ip_allowlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_cidr VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id INTEGER REFERENCES auth.admin_users(id),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT unique_active_ip UNIQUE (ip_cidr) WHERE (deleted_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_ip_allowlist_cidr ON platform.ip_allowlist(ip_cidr) WHERE deleted_at IS NULL;

COMMENT ON TABLE platform.ip_allowlist IS 'Allowed IP addresses for admin panel access (CIDR notation)';

-- Table: auth.sessions
CREATE TABLE IF NOT EXISTS auth.sessions (
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

CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth.sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth.sessions(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON auth.sessions(expires_at);

COMMENT ON TABLE auth.sessions IS 'Active user sessions for both admin and customer users';

-- Table: auth.invite_tokens
CREATE TABLE IF NOT EXISTS auth.invite_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES auth.admin_users(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON auth.invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_user ON auth.invite_tokens(user_id);

COMMENT ON TABLE auth.invite_tokens IS 'Admin user invitation tokens (7-day expiry)';

-- Table: auth.login_attempts
CREATE TABLE IF NOT EXISTS auth.login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON auth.login_attempts(email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON auth.login_attempts(ip_address, attempted_at DESC);

COMMENT ON TABLE auth.login_attempts IS 'Login attempt history for security monitoring';

-- ============================================================================
-- ALTER TABLE STATEMENTS
-- ============================================================================

-- Add KYC fields to auth.users
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'account_tier') THEN
        ALTER TABLE auth.users ADD COLUMN account_tier VARCHAR(50) DEFAULT 'Standard';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'kyc_status') THEN
        ALTER TABLE auth.users ADD COLUMN kyc_status VARCHAR(50) DEFAULT 'not_submitted';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON auth.users(kyc_status);

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Auto-cleanup function for old login attempts
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.login_attempts
  WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_login_attempts() IS 'Removes login attempts older than 30 days';

-- Auto-cleanup function for old webhook logs
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM kyc.webhook_logs
  WHERE received_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_webhook_logs() IS 'Removes webhook logs older than 90 days';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 001_page_analysis_schema_additions.sql completed successfully';
    RAISE NOTICE 'Schemas created: kyc, operations, compliance, platform';
    RAISE NOTICE 'Tables created: 18 tables across multiple schemas';
    RAISE NOTICE 'Next steps: Review remaining analysis files and create migration 002';
END $$;
