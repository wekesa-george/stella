-- ============================================================================
-- STELLA PLATFORM - COMPREHENSIVE DATABASE SCHEMA
-- Version: 1.0.0
-- Date: February 2026
-- Database: PostgreSQL 16+ with TimescaleDB extension
-- 
-- Schema Organization:
--   auth        - User identity, profiles, KYC
--   admin       - Platform administrators, RBAC, backoffice access control
--   exchange    - Adapter configuration, user credentials
--   trading     - Orders, fills, positions (append-only audit trail)
--   strategy    - Strategy definitions, backtests
--   billing     - Subscriptions, invoices, payments, P&L
--   risk        - Limit configurations, circuit breaker history
--   market_data - TimescaleDB hypertables for OHLCV candles
--   pool        - Stella One pool wallet accounting (event-sourced)
--   system_ops  - System monitoring, service health, migration tracking
--   event_log   - Platform-wide event store for audit/replay
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";        -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";          -- Encryption functions
CREATE EXTENSION IF NOT EXISTS "timescaledb";       -- Time-series hypertables
CREATE EXTENSION IF NOT EXISTS "pg_trgm";           -- Trigram text search
CREATE EXTENSION IF NOT EXISTS "btree_gist";        -- GiST index support for exclusion constraints

-- ============================================================================
-- SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS exchange;
CREATE SCHEMA IF NOT EXISTS trading;
CREATE SCHEMA IF NOT EXISTS strategy;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS risk;
CREATE SCHEMA IF NOT EXISTS market_data;
CREATE SCHEMA IF NOT EXISTS pool;
CREATE SCHEMA IF NOT EXISTS system_ops;
CREATE SCHEMA IF NOT EXISTS event_log;

-- ============================================================================
-- CUSTOM TYPES (ENUMS)
-- ============================================================================

-- Auth & User
CREATE TYPE auth.user_status AS ENUM (
    'pending_verification', 'active', 'suspended', 'deactivated', 'banned'
);

CREATE TYPE auth.kyc_status AS ENUM (
    'not_started', 'pending', 'in_review', 'approved', 'rejected', 'expired'
);

CREATE TYPE auth.kyc_level AS ENUM (
    'none', 'basic', 'standard', 'enhanced'
);

CREATE TYPE auth.tier AS ENUM (
    'stella_one', 'stella_unum', 'stella_eon', 'stella_plenum'
);

-- Admin & Backoffice
CREATE TYPE admin.admin_status AS ENUM (
    'invited', 'active', 'suspended', 'deactivated'
);

CREATE TYPE admin.admin_role_code AS ENUM (
    'super_admin',          -- Full platform access, can manage other admins
    'operations_manager',   -- Exchange adapters, limits, user management
    'risk_officer',         -- Risk limits, circuit breakers, monitoring
    'compliance_officer',   -- KYC review, audit logs, reporting
    'support_agent',        -- Read-only user data, basic user actions
    'finance_manager',      -- Billing, invoices, pool wallet oversight
    'strategy_curator'      -- Core strategy management, marketplace review
);

CREATE TYPE admin.permission_category AS ENUM (
    'users', 'admins', 'exchanges', 'trading', 'strategies',
    'billing', 'risk', 'pool', 'reports', 'system'
);

CREATE TYPE admin.permission_action AS ENUM (
    'view', 'create', 'update', 'delete', 'approve', 'execute', 'export'
);

-- Exchange
CREATE TYPE exchange.auth_model AS ENUM (
    'api_key_secret', 'oauth2', 'wallet_connect', 'hybrid'
);

CREATE TYPE exchange.adapter_status AS ENUM (
    'active', 'inactive', 'maintenance', 'deprecated'
);

CREATE TYPE exchange.credential_status AS ENUM (
    'active', 'expired', 'revoked', 'failed_validation', 'pending_validation'
);

CREATE TYPE exchange.connection_status AS ENUM (
    'connected', 'disconnected', 'reconnecting', 'error', 'rate_limited'
);

-- Trading
CREATE TYPE trading.order_side AS ENUM ('buy', 'sell');

CREATE TYPE trading.order_type AS ENUM (
    'market', 'limit', 'stop_loss', 'stop_limit', 'trailing_stop', 'take_profit'
);

CREATE TYPE trading.order_status AS ENUM (
    'pending', 'submitted', 'open', 'partially_filled', 'filled', 
    'cancelled', 'rejected', 'expired', 'failed'
);

CREATE TYPE trading.position_status AS ENUM (
    'open', 'closing', 'closed', 'liquidated'
);

CREATE TYPE trading.position_side AS ENUM ('long', 'short');

-- Strategy
CREATE TYPE strategy.strategy_type AS ENUM (
    'core_trend_following', 'core_mean_reversion', 'core_momentum',
    'core_arbitrage', 'core_grid', 'core_dca',
    'custom_rule_based', 'custom_config'
);

CREATE TYPE strategy.strategy_status AS ENUM (
    'draft', 'backtesting', 'validated', 'active', 'paused', 'archived'
);

CREATE TYPE strategy.backtest_status AS ENUM (
    'queued', 'running', 'completed', 'failed', 'cancelled'
);

CREATE TYPE strategy.signal_type AS ENUM (
    'entry_long', 'entry_short', 'exit_long', 'exit_short',
    'scale_in', 'scale_out', 'stop_adjust', 'take_profit_adjust'
);

-- Billing
CREATE TYPE billing.subscription_status AS ENUM (
    'trial', 'active', 'past_due', 'suspended', 'cancelled', 'terminated'
);

CREATE TYPE billing.payment_method AS ENUM (
    'credit_card', 'bank_transfer', 'crypto', 'mobile_money', 'stripe'
);

CREATE TYPE billing.payment_status AS ENUM (
    'pending', 'processing', 'succeeded', 'failed', 'refunded', 'disputed'
);

CREATE TYPE billing.invoice_status AS ENUM (
    'draft', 'issued', 'paid', 'overdue', 'void', 'refunded'
);

CREATE TYPE billing.fee_type AS ENUM (
    'subscription_monthly', 'performance_fee', 'withdrawal_fee', 'premium_feature'
);

-- Risk
CREATE TYPE risk.limit_scope AS ENUM (
    'global', 'tier', 'user', 'strategy', 'exchange'
);

CREATE TYPE risk.limit_type AS ENUM (
    'max_drawdown_pct', 'max_trade_size_usd', 'daily_volume_cap_usd',
    'max_leverage', 'max_open_positions', 'max_orders_per_minute',
    'cooldown_period_minutes', 'max_loss_per_trade_usd',
    'allowed_assets', 'blocked_assets', 'allowed_exchanges'
);

CREATE TYPE risk.breaker_trigger AS ENUM (
    'drawdown_breach', 'daily_volume_exceeded', 'rapid_loss',
    'exchange_error_rate', 'admin_manual', 'system_anomaly'
);

CREATE TYPE risk.breaker_status AS ENUM (
    'triggered', 'cooling_down', 'reset_pending', 'resolved'
);

-- Bot
CREATE TYPE trading.bot_status AS ENUM (
    'initializing', 'running', 'paused', 'stopping', 'stopped',
    'error', 'circuit_broken', 'maintenance'
);

-- Pool
CREATE TYPE pool.allocation_status AS ENUM (
    'active', 'profitable', 'unprofitable', 'reclaimed', 'expired'
);

CREATE TYPE pool.transaction_type AS ENUM (
    'seed_allocation', 'trade_profit', 'trade_loss', 'fee_deduction',
    'gas_fee_coverage', 'reimbursement', 'reclamation', 'adjustment'
);


-- ============================================================================
-- SCHEMA: auth
-- User identity, profiles, and KYC records
-- ============================================================================

CREATE TABLE auth.users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    logto_user_id       VARCHAR(255) UNIQUE NOT NULL,       -- Logto external ID
    email               VARCHAR(255) UNIQUE NOT NULL,
    phone               VARCHAR(50),
    username            VARCHAR(100) UNIQUE,
    status              auth.user_status NOT NULL DEFAULT 'pending_verification',
    tier                auth.tier NOT NULL DEFAULT 'stella_one',
    email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at       TIMESTAMPTZ,
    last_login_ip       INET,
    failed_login_count  INTEGER NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    referral_code       VARCHAR(20) UNIQUE,
    referred_by         UUID REFERENCES auth.users(id),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.user_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    display_name        VARCHAR(200),
    date_of_birth       DATE,
    country_code        CHAR(2),                            -- ISO 3166-1 alpha-2
    timezone            VARCHAR(50) DEFAULT 'UTC',
    preferred_currency  CHAR(3) DEFAULT 'USD',              -- ISO 4217
    language            VARCHAR(10) DEFAULT 'en',
    avatar_url          TEXT,
    bio                 TEXT,
    -- Investor profile
    risk_tolerance      VARCHAR(20),                        -- conservative, moderate, aggressive
    investment_experience VARCHAR(20),                      -- none, beginner, intermediate, advanced, professional
    annual_income_range VARCHAR(30),
    net_worth_range     VARCHAR(30),
    investment_goals    JSONB DEFAULT '[]',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.kyc_records (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status                  auth.kyc_status NOT NULL DEFAULT 'not_started',
    level                   auth.kyc_level NOT NULL DEFAULT 'none',
    provider                VARCHAR(100),                   -- e.g., Sumsub, Onfido
    provider_reference_id   VARCHAR(255),
    -- Document info
    document_type           VARCHAR(50),                    -- passport, national_id, drivers_license
    document_country        CHAR(2),
    document_number         VARCHAR(255),
    document_expiry         DATE,
    document_path           TEXT,                           -- Storage path for document scan
    passport_photo_path     TEXT,                           -- Storage path for passport/selfie photo
    -- Submitted identity (may differ from profile - for verification matching)
    submitted_first_name    VARCHAR(255),
    submitted_last_name     VARCHAR(255),
    submitted_phone         VARCHAR(50),
    submitted_country       VARCHAR(100),
    submitted_city          VARCHAR(100),
    -- Verification results
    verified_name           VARCHAR(255),
    verified_dob            DATE,
    verified_address        JSONB,
    verification_score      DECIMAL(5,2),
    risk_rating             VARCHAR(20),
    extracted_metadata      JSONB DEFAULT '{}',             -- OCR/AI-extracted data from documents
    validation_details      JSONB DEFAULT '{}',             -- Provider validation response details
    -- Audit
    submitted_at            TIMESTAMPTZ,
    reviewed_at             TIMESTAMPTZ,
    reviewed_by             UUID REFERENCES admin.admin_users(id),  -- Admin who reviewed
    rejection_reason        TEXT,
    expires_at              TIMESTAMPTZ,
    notes                   TEXT,
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.user_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token_hash  VARCHAR(255) NOT NULL,              -- Hashed session token
    ip_address          INET,
    user_agent          TEXT,
    device_fingerprint  VARCHAR(255),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.user_notification_preferences (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email_trade_alerts  BOOLEAN NOT NULL DEFAULT TRUE,
    email_risk_alerts   BOOLEAN NOT NULL DEFAULT TRUE,
    email_billing       BOOLEAN NOT NULL DEFAULT TRUE,
    email_newsletter    BOOLEAN NOT NULL DEFAULT FALSE,
    push_trade_alerts   BOOLEAN NOT NULL DEFAULT TRUE,
    push_risk_alerts    BOOLEAN NOT NULL DEFAULT TRUE,
    push_price_alerts   BOOLEAN NOT NULL DEFAULT FALSE,
    sms_risk_alerts     BOOLEAN NOT NULL DEFAULT FALSE,
    sms_billing         BOOLEAN NOT NULL DEFAULT FALSE,
    quiet_hours_start   TIME,
    quiet_hours_end     TIME,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for auth schema
CREATE INDEX idx_users_logto_id ON auth.users(logto_user_id);
CREATE INDEX idx_users_email ON auth.users(email);
CREATE INDEX idx_users_status ON auth.users(status);
CREATE INDEX idx_users_tier ON auth.users(tier);
CREATE INDEX idx_users_referral_code ON auth.users(referral_code);
CREATE INDEX idx_users_referred_by ON auth.users(referred_by);
CREATE INDEX idx_user_profiles_user_id ON auth.user_profiles(user_id);
CREATE INDEX idx_user_profiles_country ON auth.user_profiles(country_code);
CREATE INDEX idx_kyc_records_user_id ON auth.kyc_records(user_id);
CREATE INDEX idx_kyc_records_status ON auth.kyc_records(status);
CREATE INDEX idx_user_sessions_user_id ON auth.user_sessions(user_id);
CREATE INDEX idx_user_sessions_active ON auth.user_sessions(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_user_sessions_expires ON auth.user_sessions(expires_at);


-- ============================================================================
-- SCHEMA: admin
-- Platform administrators, roles, permissions, and backoffice access control
-- Completely separate from auth.users (platform customers)
-- ============================================================================

CREATE TABLE admin.admin_users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    logto_user_id       VARCHAR(255) UNIQUE,                 -- Logto ID (separate Logto app/tenant for admin)
    email               VARCHAR(255) UNIQUE NOT NULL,
    phone               VARCHAR(50),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    display_name        VARCHAR(200) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    status              admin.admin_status NOT NULL DEFAULT 'invited',
    -- Security
    password_hash       VARCHAR(255),                        -- Fallback if not using Logto SSO
    mfa_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret_encrypted BYTEA,
    mfa_backup_codes    BYTEA,                               -- Encrypted backup codes
    force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
    -- Access control
    is_super_admin      BOOLEAN NOT NULL DEFAULT FALSE,      -- Bypass role checks
    -- Login tracking
    last_login_at       TIMESTAMPTZ,
    last_login_ip       INET,
    failed_login_count  INTEGER NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    -- Invitation
    invited_by          UUID REFERENCES admin.admin_users(id),
    invited_at          TIMESTAMPTZ,
    activated_at        TIMESTAMPTZ,
    deactivated_at      TIMESTAMPTZ,
    deactivated_by      UUID REFERENCES admin.admin_users(id),
    deactivation_reason TEXT,
    -- Metadata
    avatar_url          TEXT,
    timezone            VARCHAR(50) DEFAULT 'UTC',
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin.roles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                admin.admin_role_code UNIQUE NOT NULL,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    is_system           BOOLEAN NOT NULL DEFAULT TRUE,       -- System roles can't be deleted
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    -- Hierarchy (lower = more powerful, for display ordering)
    hierarchy_level     INTEGER NOT NULL DEFAULT 100,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin.permissions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                VARCHAR(100) UNIQUE NOT NULL,        -- e.g., 'users.view', 'risk.update'
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    category            admin.permission_category NOT NULL,
    action              admin.permission_action NOT NULL,
    -- Some permissions need extra context
    resource_scope      VARCHAR(50),                         -- Optional: tier, exchange, etc.
    is_sensitive        BOOLEAN NOT NULL DEFAULT FALSE,      -- Requires extra audit logging
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin.role_permissions (
    role_id             UUID NOT NULL REFERENCES admin.roles(id) ON DELETE CASCADE,
    permission_id       UUID NOT NULL REFERENCES admin.permissions(id) ON DELETE CASCADE,
    granted_by          UUID REFERENCES admin.admin_users(id),
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE admin.admin_user_roles (
    admin_user_id       UUID NOT NULL REFERENCES admin.admin_users(id) ON DELETE CASCADE,
    role_id             UUID NOT NULL REFERENCES admin.roles(id) ON DELETE CASCADE,
    assigned_by         UUID REFERENCES admin.admin_users(id),
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,                         -- Temporary role grants
    PRIMARY KEY (admin_user_id, role_id)
);

CREATE TABLE admin.admin_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id       UUID NOT NULL REFERENCES admin.admin_users(id) ON DELETE CASCADE,
    session_token_hash  VARCHAR(255) NOT NULL,
    ip_address          INET NOT NULL,
    user_agent          TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin.admin_audit_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id       UUID NOT NULL REFERENCES admin.admin_users(id),
    admin_email         VARCHAR(255) NOT NULL,               -- Denormalized for audit permanence
    admin_name          VARCHAR(200) NOT NULL,               -- Denormalized for audit permanence
    ip_address          INET,
    -- Action details
    action              VARCHAR(100) NOT NULL,               -- e.g., 'user.tier_changed', 'adapter.activated'
    resource_type       VARCHAR(50) NOT NULL,                -- e.g., 'user', 'adapter', 'limit_config'
    resource_id         UUID,
    -- Change tracking
    old_value           JSONB,
    new_value           JSONB,
    -- Context
    reason              TEXT,                                -- Admin-provided reason for the action
    permission_used     VARCHAR(100),                        -- Which permission authorized this
    correlation_id      UUID,
    -- Request context
    request_method      VARCHAR(10),
    request_path        TEXT,
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for admin schema
CREATE INDEX idx_admin_users_email ON admin.admin_users(email);
CREATE INDEX idx_admin_users_logto_id ON admin.admin_users(logto_user_id);
CREATE INDEX idx_admin_users_status ON admin.admin_users(status);
CREATE INDEX idx_admin_users_super ON admin.admin_users(is_super_admin) WHERE is_super_admin = TRUE;

CREATE INDEX idx_roles_code ON admin.roles(code);
CREATE INDEX idx_roles_active ON admin.roles(is_active) WHERE is_active = TRUE;

CREATE INDEX idx_permissions_code ON admin.permissions(code);
CREATE INDEX idx_permissions_category ON admin.permissions(category);

CREATE INDEX idx_admin_user_roles_user ON admin.admin_user_roles(admin_user_id);
CREATE INDEX idx_admin_user_roles_role ON admin.admin_user_roles(role_id);
CREATE INDEX idx_admin_user_roles_expires ON admin.admin_user_roles(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_admin_sessions_user ON admin.admin_sessions(admin_user_id);
CREATE INDEX idx_admin_sessions_active ON admin.admin_sessions(admin_user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_admin_sessions_expires ON admin.admin_sessions(expires_at);

CREATE INDEX idx_admin_audit_admin ON admin.admin_audit_log(admin_user_id);
CREATE INDEX idx_admin_audit_action ON admin.admin_audit_log(action);
CREATE INDEX idx_admin_audit_resource ON admin.admin_audit_log(resource_type, resource_id);
CREATE INDEX idx_admin_audit_created ON admin.admin_audit_log(created_at DESC);
CREATE INDEX idx_admin_audit_correlation ON admin.admin_audit_log(correlation_id);


-- ============================================================================
-- SCHEMA: exchange
-- Adapter configuration and user credentials (encrypted)
-- ============================================================================

CREATE TABLE exchange.adapters (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                VARCHAR(50) UNIQUE NOT NULL,        -- e.g., 'binance', 'alpaca', 'robinhood'
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    status              exchange.adapter_status NOT NULL DEFAULT 'inactive',
    auth_model          exchange.auth_model NOT NULL,
    -- Configuration
    base_url            VARCHAR(500),
    ws_url              VARCHAR(500),
    sandbox_base_url    VARCHAR(500),
    sandbox_ws_url      VARCHAR(500),
    -- Capabilities
    supports_spot       BOOLEAN NOT NULL DEFAULT TRUE,
    supports_margin     BOOLEAN NOT NULL DEFAULT FALSE,
    supports_futures    BOOLEAN NOT NULL DEFAULT FALSE,
    supports_options    BOOLEAN NOT NULL DEFAULT FALSE,
    supports_staking    BOOLEAN NOT NULL DEFAULT FALSE,
    -- Execution capabilities (what the exchange engine supports)
    execution_capabilities JSONB NOT NULL DEFAULT '{
        "order_types": ["market", "limit"],
        "time_in_force": ["GTC", "IOC", "FOK"],
        "supports_trailing_stop": false,
        "native_stop_loss": true,
        "native_take_profit": true,
        "supports_oco": false,
        "supports_bracket_orders": false,
        "margin_modes": [],
        "position_modes": ["one_way"],
        "max_leverage_global": 1,
        "supports_paper_trading": false
    }',
    -- Rate limits (requests per minute)
    rate_limit_orders   INTEGER NOT NULL DEFAULT 60,
    rate_limit_queries  INTEGER NOT NULL DEFAULT 120,
    rate_limit_ws       INTEGER NOT NULL DEFAULT 10,
    -- Constraints
    min_order_size_usd  DECIMAL(12,2) DEFAULT 1.00,
    max_order_size_usd  DECIMAL(15,2),
    supported_pairs     JSONB DEFAULT '[]',                 -- ['BTC/USDT', 'ETH/USDT', ...]
    fee_schedule        JSONB DEFAULT '{}',                 -- maker/taker fee tiers
    -- Tier availability
    available_tiers     auth.tier[] NOT NULL DEFAULT ARRAY['stella_one', 'stella_unum', 'stella_eon', 'stella_plenum']::auth.tier[],
    -- OAuth config (for oauth2 adapters)
    oauth_client_id     VARCHAR(255),
    oauth_authorize_url VARCHAR(500),
    oauth_token_url     VARCHAR(500),
    oauth_scopes        TEXT[],
    -- Admin
    activated_by        UUID REFERENCES admin.admin_users(id),
    activated_at        TIMESTAMPTZ,
    deactivated_by      UUID REFERENCES admin.admin_users(id),
    deactivated_at      TIMESTAMPTZ,
    maintenance_message TEXT,
    config              JSONB DEFAULT '{}',                 -- Exchange-specific config
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exchange.user_credentials (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    adapter_id          UUID NOT NULL REFERENCES exchange.adapters(id),
    label               VARCHAR(100),                       -- User-friendly name
    status              exchange.credential_status NOT NULL DEFAULT 'pending_validation',
    auth_model          exchange.auth_model NOT NULL,
    -- Encrypted credentials (AES-256-GCM via pgcrypto or application-level)
    -- API Key auth
    encrypted_api_key   BYTEA,
    encrypted_api_secret BYTEA,
    encrypted_passphrase BYTEA,                             -- Some exchanges require this
    -- OAuth tokens
    encrypted_access_token  BYTEA,
    encrypted_refresh_token BYTEA,
    token_expires_at    TIMESTAMPTZ,
    -- WalletConnect
    wallet_address      VARCHAR(255),
    encrypted_session_data BYTEA,
    chain_id            INTEGER,
    -- Connection config
    is_sandbox          BOOLEAN NOT NULL DEFAULT FALSE,
    ip_whitelist        INET[],
    permissions         TEXT[] DEFAULT ARRAY['read', 'trade'],  -- read, trade, withdraw
    -- Validation
    last_validated_at   TIMESTAMPTZ,
    validation_error    TEXT,
    -- Metadata
    connected_at        TIMESTAMPTZ,
    last_used_at        TIMESTAMPTZ,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_user_adapter_label UNIQUE (user_id, adapter_id, label)
);

CREATE TABLE exchange.connection_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    adapter_id          UUID NOT NULL REFERENCES exchange.adapters(id),
    status              exchange.connection_status NOT NULL,
    connection_type     VARCHAR(20) NOT NULL DEFAULT 'websocket', -- websocket, rest
    latency_ms          INTEGER,
    error_code          VARCHAR(100),
    error_message       TEXT,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-credential enabled trading pairs with exchange-specific constraints
CREATE TABLE exchange.enabled_asset_pairs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id) ON DELETE CASCADE,
    adapter_id          UUID NOT NULL REFERENCES exchange.adapters(id),
    symbol              VARCHAR(30) NOT NULL,                  -- e.g., 'BTC/USDT'
    base_asset          VARCHAR(20) NOT NULL,
    quote_asset         VARCHAR(20) NOT NULL,
    -- Trading status
    is_trading_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    -- Exchange-specific constraints (per-pair)
    min_quantity        DECIMAL(24,8),
    max_quantity        DECIMAL(24,8),
    step_size           DECIMAL(24,8),
    tick_size           DECIMAL(24,8),                      -- Minimum price increment
    min_notional_usd    DECIMAL(12,2),
    -- Per-pair execution constraints from exchange
    max_leverage        DECIMAL(6,2) DEFAULT 1.00,          -- Exchange max leverage for this pair
    supported_order_types TEXT[] DEFAULT ARRAY['market', 'limit'],
    supports_margin     BOOLEAN NOT NULL DEFAULT FALSE,
    margin_tier         VARCHAR(20),                         -- Exchange margin tier for this pair
    funding_interval_hrs INTEGER,                            -- For perpetual futures
    -- Whether Stella must simulate features the exchange lacks
    requires_simulated_trailing_stop BOOLEAN NOT NULL DEFAULT FALSE,
    requires_simulated_oco BOOLEAN NOT NULL DEFAULT FALSE,
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_credential_symbol UNIQUE (credential_id, symbol)
);

-- Indexes for exchange schema
CREATE INDEX idx_adapters_code ON exchange.adapters(code);
CREATE INDEX idx_adapters_status ON exchange.adapters(status);
CREATE INDEX idx_user_credentials_user_id ON exchange.user_credentials(user_id);
CREATE INDEX idx_user_credentials_adapter_id ON exchange.user_credentials(adapter_id);
CREATE INDEX idx_user_credentials_status ON exchange.user_credentials(status);
CREATE INDEX idx_user_credentials_user_adapter ON exchange.user_credentials(user_id, adapter_id);
CREATE INDEX idx_connection_logs_credential_id ON exchange.connection_logs(credential_id);
CREATE INDEX idx_connection_logs_user_id ON exchange.connection_logs(user_id);
CREATE INDEX idx_connection_logs_created ON exchange.connection_logs(created_at DESC);
CREATE INDEX idx_connection_logs_status ON exchange.connection_logs(status);

CREATE INDEX idx_enabled_pairs_credential ON exchange.enabled_asset_pairs(credential_id);
CREATE INDEX idx_enabled_pairs_adapter ON exchange.enabled_asset_pairs(adapter_id);
CREATE INDEX idx_enabled_pairs_symbol ON exchange.enabled_asset_pairs(symbol);
CREATE INDEX idx_enabled_pairs_trading ON exchange.enabled_asset_pairs(is_trading_enabled) WHERE is_trading_enabled = TRUE;


-- ============================================================================
-- SCHEMA: trading
-- Orders, fills, positions - append-only audit trail
-- ============================================================================

CREATE TABLE trading.bots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    strategy_id         UUID,                               -- FK added after strategy table
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id),
    name                VARCHAR(200),
    status              trading.bot_status NOT NULL DEFAULT 'initializing',
    -- Configuration
    trading_pairs       TEXT[] NOT NULL,                     -- ['BTC/USDT', 'ETH/USDT']
    config              JSONB NOT NULL DEFAULT '{}',         -- Strategy-specific params
    risk_overrides      JSONB DEFAULT '{}',                  -- Per-bot risk param overrides
    -- State
    started_at          TIMESTAMPTZ,
    stopped_at          TIMESTAMPTZ,
    last_heartbeat_at   TIMESTAMPTZ,
    last_trade_at       TIMESTAMPTZ,
    error_message       TEXT,
    error_count         INTEGER NOT NULL DEFAULT 0,
    -- Performance tracking (updated by events)
    total_trades        INTEGER NOT NULL DEFAULT 0,
    total_pnl_usd      DECIMAL(15,4) NOT NULL DEFAULT 0,
    win_rate            DECIMAL(5,4),                        -- 0.0000 to 1.0000
    -- Elixir process tracking
    elixir_node         VARCHAR(255),                        -- Node running this bot
    elixir_pid          VARCHAR(100),                        -- Serialized PID
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trading.orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    bot_id              UUID REFERENCES trading.bots(id),
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id),
    -- Order identification
    exchange_order_id   VARCHAR(255),                        -- Exchange-assigned order ID
    client_order_id     VARCHAR(255) UNIQUE,                 -- Stella-generated order ID
    -- Order details
    exchange_code       VARCHAR(50) NOT NULL,                -- Exchange adapter code
    trading_pair        VARCHAR(30) NOT NULL,                -- e.g., 'BTC/USDT'
    base_asset          VARCHAR(20) NOT NULL,                -- e.g., 'BTC'
    quote_asset         VARCHAR(20) NOT NULL,                -- e.g., 'USDT'
    side                trading.order_side NOT NULL,
    type                trading.order_type NOT NULL,
    status              trading.order_status NOT NULL DEFAULT 'pending',
    -- Pricing
    quantity            DECIMAL(24,8) NOT NULL,
    price               DECIMAL(24,8),                       -- NULL for market orders
    stop_price          DECIMAL(24,8),                       -- For stop orders
    limit_price         DECIMAL(24,8),                       -- For stop-limit orders
    avg_fill_price      DECIMAL(24,8),
    filled_quantity     DECIMAL(24,8) NOT NULL DEFAULT 0,
    remaining_quantity  DECIMAL(24,8),
    -- Value in USD
    estimated_value_usd DECIMAL(15,4),
    actual_value_usd    DECIMAL(15,4),
    -- Fees
    total_fees          DECIMAL(15,8) NOT NULL DEFAULT 0,
    fee_asset           VARCHAR(20),
    fee_usd             DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Time in force
    time_in_force       VARCHAR(10) DEFAULT 'GTC',           -- GTC, IOC, FOK
    expire_at           TIMESTAMPTZ,
    -- Leverage
    leverage            DECIMAL(6,2) DEFAULT 1.00,
    is_margin           BOOLEAN NOT NULL DEFAULT FALSE,
    -- Strategy context
    strategy_id         UUID,
    signal_id           UUID,                                -- Signal that triggered this order
    -- Execution tracking
    submitted_at        TIMESTAMPTZ,
    first_fill_at       TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancel_reason       TEXT,
    -- Error tracking
    rejection_reason    TEXT,
    exchange_response   JSONB,
    retry_count         INTEGER NOT NULL DEFAULT 0,
    -- Audit
    correlation_id      UUID,                                -- Links related orders
    parent_order_id     UUID REFERENCES trading.orders(id),  -- For split/child orders
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trading.fills (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID NOT NULL REFERENCES trading.orders(id),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    -- Fill details
    exchange_fill_id    VARCHAR(255),                        -- Exchange-assigned fill/trade ID
    fill_price          DECIMAL(24,8) NOT NULL,
    fill_quantity       DECIMAL(24,8) NOT NULL,
    fill_value_usd      DECIMAL(15,4) NOT NULL,
    -- Fees
    fee_amount          DECIMAL(15,8) NOT NULL DEFAULT 0,
    fee_asset           VARCHAR(20),
    fee_usd             DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Classification
    is_maker            BOOLEAN,
    liquidity_type      VARCHAR(10),                         -- maker, taker
    -- Timing
    filled_at           TIMESTAMPTZ NOT NULL,
    settled_at          TIMESTAMPTZ,
    -- Raw data
    exchange_response   JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trading.positions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    bot_id              UUID REFERENCES trading.bots(id),
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id),
    -- Position details
    exchange_code       VARCHAR(50) NOT NULL,
    trading_pair        VARCHAR(30) NOT NULL,
    base_asset          VARCHAR(20) NOT NULL,
    quote_asset         VARCHAR(20) NOT NULL,
    side                trading.position_side NOT NULL,
    status              trading.position_status NOT NULL DEFAULT 'open',
    -- Size & pricing
    entry_price         DECIMAL(24,8) NOT NULL,
    exit_price          DECIMAL(24,8),
    current_price       DECIMAL(24,8),
    quantity            DECIMAL(24,8) NOT NULL,
    remaining_quantity  DECIMAL(24,8) NOT NULL,
    leverage            DECIMAL(6,2) NOT NULL DEFAULT 1.00,
    -- P&L tracking
    unrealized_pnl_usd DECIMAL(15,4) NOT NULL DEFAULT 0,
    realized_pnl_usd   DECIMAL(15,4) NOT NULL DEFAULT 0,
    roi_percentage      DECIMAL(8,4) NOT NULL DEFAULT 0,
    total_fees_usd      DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Risk
    stop_loss_price     DECIMAL(24,8),
    take_profit_price   DECIMAL(24,8),
    liquidation_price   DECIMAL(24,8),
    -- Margin
    margin_used_usd     DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Strategy context
    strategy_id         UUID,
    signal_id           UUID,
    -- Linked orders
    entry_order_id      UUID REFERENCES trading.orders(id),
    exit_order_id       UUID REFERENCES trading.orders(id),
    -- Timing
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at           TIMESTAMPTZ,
    hold_duration_sec   INTEGER,                             -- Calculated on close
    exit_reason         VARCHAR(255),                        -- strategy_signal, stop_loss, take_profit, trailing_stop, liquidation, manual, circuit_breaker
    -- Physics model parameters (Stella proprietary trading intelligence)
    momentum            DOUBLE PRECISION,
    gravity             DOUBLE PRECISION,
    peak_price          DECIMAL(24,8),
    peak_time           INTEGER,                             -- Seconds to predicted peak
    trajectory_angle    DOUBLE PRECISION,
    kinetic_energy      DOUBLE PRECISION,
    energy_state        VARCHAR(50),                         -- accumulating, releasing, dissipating, equilibrium
    max_hold_time       INTEGER,                             -- Maximum hold in seconds from physics model
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Equity snapshots for drawdown calculation
CREATE TABLE trading.equity_snapshots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    credential_id       UUID REFERENCES exchange.user_credentials(id),
    -- Strategy/bot attribution (NULL = user-level aggregate snapshot)
    bot_id              UUID REFERENCES trading.bots(id),
    user_strategy_id    UUID REFERENCES trading.user_strategies(id),
    -- Capital baseline (what we're measuring performance against)
    starting_capital_usd DECIMAL(15,4),                       -- Capital allocated when bot/strategy started
    -- Equity data (queried from exchange or computed from pool)
    total_equity_usd    DECIMAL(15,4) NOT NULL,               -- Current total value
    available_balance_usd DECIMAL(15,4) NOT NULL,
    unrealized_pnl_usd  DECIMAL(15,4) NOT NULL DEFAULT 0,
    realized_pnl_usd    DECIMAL(15,4) NOT NULL DEFAULT 0,     -- Cumulative closed P&L
    total_fees_usd      DECIMAL(15,4) NOT NULL DEFAULT 0,     -- Cumulative exchange fees
    margin_used_usd      DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Performance metrics (computed from capital baseline)
    return_pct          DECIMAL(10,4),                         -- (equity - starting_capital) / starting_capital
    -- High water mark & drawdown
    high_water_mark_usd DECIMAL(15,4) NOT NULL,
    drawdown_pct        DECIMAL(8,4) NOT NULL DEFAULT 0,
    -- Open position count at snapshot time
    open_positions      INTEGER NOT NULL DEFAULT 0,
    -- Source
    snapshot_source     VARCHAR(20) NOT NULL DEFAULT 'trade', -- trade, scheduled, manual, rebalance
    triggered_by_order  UUID REFERENCES trading.orders(id),
    -- Timing
    snapshot_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for trading schema

-- Stop loss / take profit: user-defined risk guardrails per position
-- Users customize these from strategy defaults; algorithm executes them
CREATE TABLE trading.stop_loss_take_profit (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_id         UUID NOT NULL UNIQUE REFERENCES trading.positions(id) ON DELETE CASCADE,
    user_strategy_id    UUID REFERENCES trading.user_strategies(id),
    -- Stop loss
    stop_loss_price     DECIMAL(24,8),
    stop_loss_type      VARCHAR(20) NOT NULL DEFAULT 'fixed',  -- fixed, percentage, trailing
    stop_loss_percentage DECIMAL(5,2),
    trailing_stop_distance DECIMAL(24,8),
    trailing_stop_highest DECIMAL(24,8),                       -- Tracked high water for trailing calc
    -- Take profit
    take_profit_price   DECIMAL(24,8),
    take_profit_type    VARCHAR(20) NOT NULL DEFAULT 'fixed',  -- fixed, percentage
    take_profit_percentage DECIMAL(5,2),
    -- Source: did user set this or did the strategy?
    source              VARCHAR(20) NOT NULL DEFAULT 'strategy', -- strategy, user_override, risk_limit
    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'active', -- active, triggered, cancelled
    triggered_type      VARCHAR(20),                           -- stop_loss, take_profit, trailing_stop
    triggered_at        TIMESTAMPTZ,
    -- Whether the exchange handles this natively or Stella simulates it
    is_exchange_native  BOOLEAN NOT NULL DEFAULT FALSE,
    exchange_order_id   VARCHAR(255),                          -- Exchange SL/TP order ID if native
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bot & strategy monitoring alerts: user-defined notifications for algorithmic execution events
-- NOT manual price alerts — these monitor what Stella's bots are doing on the user's behalf
CREATE TABLE trading.monitoring_alerts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    bot_id              UUID REFERENCES trading.bots(id),
    user_strategy_id    UUID REFERENCES trading.user_strategies(id),
    -- Alert definition
    alert_type          VARCHAR(50) NOT NULL,                  -- bot_error, bot_idle, drawdown_warning,
                                                               -- signal_generated, position_opened, position_closed,
                                                               -- daily_pnl_threshold, win_streak, loss_streak,
                                                               -- strategy_drift, exchange_disconnect
    alert_name          VARCHAR(255),
    alert_message       TEXT NOT NULL,
    -- Conditions
    condition_type      VARCHAR(50) NOT NULL,                   -- threshold_above, threshold_below, count_exceeds,
                                                               -- duration_exceeds, state_change
    condition_value     DECIMAL(18,4),                          -- Threshold value (e.g., -5.0 for 5% drawdown)
    condition_window_minutes INTEGER,                           -- Lookback window for the condition
    -- Scope (what is being monitored)
    monitored_entity    VARCHAR(30) NOT NULL DEFAULT 'bot',     -- bot, strategy, account, exchange
    symbol              VARCHAR(30),                            -- Optional: specific pair
    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, triggered, snoozed, expired, cancelled
    triggered_at        TIMESTAMPTZ,
    triggered_count     INTEGER NOT NULL DEFAULT 0,
    -- Notification channels (per-alert override of global preferences)
    notify_email        BOOLEAN NOT NULL DEFAULT TRUE,
    notify_sms          BOOLEAN NOT NULL DEFAULT FALSE,
    notify_push         BOOLEAN NOT NULL DEFAULT TRUE,
    -- Repeat / snooze behavior
    repeat_alert        BOOLEAN NOT NULL DEFAULT FALSE,
    repeat_interval_minutes INTEGER,
    snooze_until        TIMESTAMPTZ,
    -- Metadata
    last_evaluated_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trading performance: aggregated performance metrics by period
CREATE TABLE trading.trading_performance (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    strategy_id         UUID REFERENCES strategy.strategies(id),
    -- Period
    performance_date    DATE NOT NULL,
    period_type         VARCHAR(10) NOT NULL,                  -- daily, weekly, monthly
    -- P&L
    total_profit_loss_usd DECIMAL(18,8) NOT NULL DEFAULT 0,
    realized_pnl_usd    DECIMAL(18,8) NOT NULL DEFAULT 0,
    unrealized_pnl_usd  DECIMAL(18,8) NOT NULL DEFAULT 0,
    -- Trade stats
    trades_count        INTEGER NOT NULL DEFAULT 0,
    winning_trades      INTEGER NOT NULL DEFAULT 0,
    losing_trades       INTEGER NOT NULL DEFAULT 0,
    win_rate            DECIMAL(5,2) NOT NULL DEFAULT 0,
    -- Returns
    daily_roi           DECIMAL(8,4) NOT NULL DEFAULT 0,
    cumulative_roi      DECIMAL(8,4) NOT NULL DEFAULT 0,
    -- Risk metrics
    max_drawdown        DECIMAL(8,4) NOT NULL DEFAULT 0,
    sharpe_ratio        DECIMAL(8,4),
    sortino_ratio       DECIMAL(8,4),
    profit_factor       DECIMAL(8,4),
    -- Trade details
    best_trade_usd      DECIMAL(18,8),
    worst_trade_usd     DECIMAL(18,8),
    avg_trade_usd       DECIMAL(18,8),
    avg_winner_usd      DECIMAL(18,8),
    avg_loser_usd       DECIMAL(18,8),
    consecutive_wins    INTEGER NOT NULL DEFAULT 0,
    consecutive_losses  INTEGER NOT NULL DEFAULT 0,
    -- Fees & balances
    total_fees_usd      DECIMAL(18,8) NOT NULL DEFAULT 0,
    starting_balance_usd DECIMAL(18,8),
    ending_balance_usd  DECIMAL(18,8),
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Predictions: ML/physics-based market intelligence
CREATE TABLE trading.predictions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id              UUID,                                  -- Batch run identifier
    exchange_code       VARCHAR(50),
    symbol              VARCHAR(30),
    model_type          VARCHAR(50),                           -- physics, ml_regression, ensemble, momentum
    -- Timing
    prediction_timestamp TIMESTAMPTZ NOT NULL,
    target_timestamp    TIMESTAMPTZ,
    -- Physics model parameters
    p0                  DECIMAL(24,8),                         -- Initial price
    v0                  DOUBLE PRECISION,                      -- Initial velocity
    acceleration        DOUBLE PRECISION,
    r_squared           DOUBLE PRECISION,                      -- Model fit quality
    -- Signal
    predicted_signal    VARCHAR(20),                           -- buy, sell, hold
    confidence          DOUBLE PRECISION,                      -- 0.0 to 1.0
    predicted_peak_price DECIMAL(24,8),
    predicted_dip_price DECIMAL(24,8),
    -- Order flow
    order_flow_delta    DOUBLE PRECISION,
    pressure_ratio      DOUBLE PRECISION,
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User strategies: the execution intent binding user → strategy → exchange
-- Central to Stella: "run this strategy on this exchange with this config"
CREATE TABLE trading.user_strategies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    strategy_id         UUID NOT NULL REFERENCES strategy.strategies(id),
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id),
    -- User's desired configuration
    parameters          JSONB DEFAULT '{}',                    -- User-specific strategy param overrides
    is_active           BOOLEAN NOT NULL DEFAULT FALSE,
    allocated_capital_usd DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- User risk overrides (validated against tier + exchange constraints)
    user_stop_loss_pct  DECIMAL(6,4),                          -- User override for stop loss
    user_take_profit_pct DECIMAL(6,4),                         -- User override for take profit
    user_trailing_stop  BOOLEAN DEFAULT FALSE,
    user_trailing_distance_pct DECIMAL(6,4),
    user_max_position_size_pct DECIMAL(6,4),                   -- Max % of capital per position
    user_max_leverage   DECIMAL(6,2) DEFAULT 1.00,
    selected_pairs      TEXT[] NOT NULL DEFAULT '{}',           -- Pairs user wants to trade
    -- Resolved/effective config (what the bot actually runs after validation)
    resolved_config     JSONB DEFAULT '{}',                    -- Merged: strategy defaults + user overrides + exchange constraints
    resolved_pairs      TEXT[] DEFAULT '{}',                    -- Pairs that passed validation
    resolved_at         TIMESTAMPTZ,                           -- When config was last resolved
    -- Validation chain results
    validation_status   VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, valid, invalid, stale
    validation_errors   JSONB DEFAULT '[]',                    -- [{field, error, constraint_source}]
    validation_warnings JSONB DEFAULT '[]',                    -- Non-blocking issues
    last_validated_at   TIMESTAMPTZ,
    -- What constrained the resolved config (audit trail)
    constraint_sources  JSONB DEFAULT '{}',                    -- {field: "tier_limit" | "exchange_constraint" | "risk_limit"}
    -- Lifecycle
    activated_at        TIMESTAMPTZ,
    deactivated_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_strategy_credential UNIQUE (user_id, strategy_id, credential_id)
);

-- Indexes for trading tables
CREATE INDEX idx_sltp_position_id ON trading.stop_loss_take_profit(position_id);
CREATE INDEX idx_sltp_status ON trading.stop_loss_take_profit(status);

CREATE INDEX idx_monitoring_alerts_user_id ON trading.monitoring_alerts(user_id);
CREATE INDEX idx_monitoring_alerts_status ON trading.monitoring_alerts(status);
CREATE INDEX idx_monitoring_alerts_type ON trading.monitoring_alerts(alert_type);
CREATE INDEX idx_monitoring_alerts_bot ON trading.monitoring_alerts(bot_id);
CREATE INDEX idx_monitoring_alerts_strategy ON trading.monitoring_alerts(user_strategy_id);

CREATE INDEX idx_trading_perf_user_id ON trading.trading_performance(user_id);
CREATE INDEX idx_trading_perf_date ON trading.trading_performance(performance_date DESC);
CREATE INDEX idx_trading_perf_user_date ON trading.trading_performance(user_id, performance_date DESC);
CREATE INDEX idx_trading_perf_period ON trading.trading_performance(period_type);
CREATE INDEX idx_trading_perf_strategy ON trading.trading_performance(strategy_id);

CREATE INDEX idx_predictions_run_id ON trading.predictions(run_id);
CREATE INDEX idx_predictions_symbol ON trading.predictions(symbol);
CREATE INDEX idx_predictions_model ON trading.predictions(model_type);
CREATE INDEX idx_predictions_signal ON trading.predictions(predicted_signal);
CREATE INDEX idx_predictions_timestamp ON trading.predictions(prediction_timestamp DESC);

CREATE INDEX idx_user_strategies_user_id ON trading.user_strategies(user_id);
CREATE INDEX idx_user_strategies_strategy ON trading.user_strategies(strategy_id);
CREATE INDEX idx_user_strategies_credential ON trading.user_strategies(credential_id);
CREATE INDEX idx_user_strategies_active ON trading.user_strategies(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_user_strategies_validation ON trading.user_strategies(validation_status);

-- Indexes for core trading tables
CREATE INDEX idx_bots_user_id ON trading.bots(user_id);
CREATE INDEX idx_bots_status ON trading.bots(status);
CREATE INDEX idx_bots_strategy ON trading.bots(strategy_id);
CREATE INDEX idx_bots_credential ON trading.bots(credential_id);
CREATE INDEX idx_bots_user_status ON trading.bots(user_id, status);

CREATE INDEX idx_orders_user_id ON trading.orders(user_id);
CREATE INDEX idx_orders_bot_id ON trading.orders(bot_id);
CREATE INDEX idx_orders_exchange_order_id ON trading.orders(exchange_order_id);
CREATE INDEX idx_orders_client_order_id ON trading.orders(client_order_id);
CREATE INDEX idx_orders_status ON trading.orders(status);
CREATE INDEX idx_orders_trading_pair ON trading.orders(trading_pair);
CREATE INDEX idx_orders_user_status ON trading.orders(user_id, status);
CREATE INDEX idx_orders_created ON trading.orders(created_at DESC);
CREATE INDEX idx_orders_correlation ON trading.orders(correlation_id);
CREATE INDEX idx_orders_strategy ON trading.orders(strategy_id);

CREATE INDEX idx_fills_order_id ON trading.fills(order_id);
CREATE INDEX idx_fills_user_id ON trading.fills(user_id);
CREATE INDEX idx_fills_filled_at ON trading.fills(filled_at DESC);

CREATE INDEX idx_positions_user_id ON trading.positions(user_id);
CREATE INDEX idx_positions_bot_id ON trading.positions(bot_id);
CREATE INDEX idx_positions_status ON trading.positions(status);
CREATE INDEX idx_positions_user_status ON trading.positions(user_id, status);
CREATE INDEX idx_positions_trading_pair ON trading.positions(trading_pair);
CREATE INDEX idx_positions_opened ON trading.positions(opened_at DESC);
CREATE INDEX idx_positions_strategy ON trading.positions(strategy_id);

CREATE INDEX idx_equity_snapshots_user_id ON trading.equity_snapshots(user_id);
CREATE INDEX idx_equity_snapshots_user_time ON trading.equity_snapshots(user_id, snapshot_at DESC);
CREATE INDEX idx_equity_snapshots_drawdown ON trading.equity_snapshots(user_id, drawdown_pct DESC);
CREATE INDEX idx_equity_snapshots_bot ON trading.equity_snapshots(bot_id, snapshot_at DESC) WHERE bot_id IS NOT NULL;
CREATE INDEX idx_equity_snapshots_strategy ON trading.equity_snapshots(user_strategy_id, snapshot_at DESC) WHERE user_strategy_id IS NOT NULL;
CREATE INDEX idx_equity_snapshots_user_aggregate ON trading.equity_snapshots(user_id, snapshot_at DESC) WHERE bot_id IS NULL;


-- ============================================================================
-- SCHEMA: strategy
-- Strategy definitions, backtests, and signals
-- ============================================================================

CREATE TABLE strategy.strategies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID REFERENCES auth.users(id),      -- NULL for core strategies
    parent_strategy_id  UUID REFERENCES strategy.strategies(id), -- NULL for base/core, set for user customizations
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    type                strategy.strategy_type NOT NULL,
    status              strategy.strategy_status NOT NULL DEFAULT 'draft',
    version             INTEGER NOT NULL DEFAULT 1,
    is_core             BOOLEAN NOT NULL DEFAULT FALSE,      -- Stella-maintained
    is_public           BOOLEAN NOT NULL DEFAULT FALSE,      -- Marketplace visibility
    class_module        VARCHAR(255),                        -- Elixir module implementing this strategy
    is_backtest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_live_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    -- Configuration (user customizations override parent values)
    config              JSONB NOT NULL DEFAULT '{}',         -- Full strategy parameters
    user_overrides      JSONB DEFAULT '{}',                  -- Only user-changed params (diff from parent)
    entry_conditions    JSONB DEFAULT '[]',                  -- Entry rule definitions
    exit_conditions     JSONB DEFAULT '[]',                  -- Exit rule definitions
    position_sizing     JSONB DEFAULT '{}',                  -- Sizing rules
    indicators          JSONB DEFAULT '[]',                  -- Technical indicators used
    -- User-customizable risk guardrails (override strategy defaults)
    custom_stop_loss_pct    DECIMAL(6,4),                    -- User override, NULL = use strategy default
    custom_take_profit_pct  DECIMAL(6,4),
    custom_trailing_stop    BOOLEAN DEFAULT FALSE,
    trailing_stop_distance_pct DECIMAL(6,4),
    -- Supported markets
    supported_pairs     TEXT[],                              -- Trading pairs this works with
    supported_exchanges TEXT[],                              -- Exchanges this works with
    timeframe           VARCHAR(10),                         -- Primary timeframe (1m, 5m, 1h, etc.)
    -- Risk parameters built into strategy
    default_stop_loss_pct   DECIMAL(6,4),
    default_take_profit_pct DECIMAL(6,4),
    max_position_size_pct   DECIMAL(6,4),                   -- % of portfolio per position
    -- Tier restrictions
    min_tier            auth.tier NOT NULL DEFAULT 'stella_one',
    -- Performance metadata (updated from backtests/live)
    avg_return_pct      DECIMAL(8,4),
    avg_drawdown_pct    DECIMAL(8,4),
    sharpe_ratio        DECIMAL(8,4),
    win_rate            DECIMAL(5,4),
    total_backtests     INTEGER NOT NULL DEFAULT 0,
    total_live_trades   INTEGER NOT NULL DEFAULT 0,
    -- Audit
    published_at        TIMESTAMPTZ,
    archived_at         TIMESTAMPTZ,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE strategy.backtest_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id         UUID NOT NULL REFERENCES strategy.strategies(id),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    status              strategy.backtest_status NOT NULL DEFAULT 'queued',
    -- Configuration
    trading_pair        VARCHAR(30) NOT NULL,
    exchange_code       VARCHAR(50) NOT NULL,
    timeframe           VARCHAR(10) NOT NULL,
    start_date          TIMESTAMPTZ NOT NULL,
    end_date            TIMESTAMPTZ NOT NULL,
    initial_capital_usd DECIMAL(15,4) NOT NULL,
    config_snapshot     JSONB NOT NULL,                      -- Frozen strategy config at run time
    -- Results (populated on completion)
    final_capital_usd   DECIMAL(15,4),
    total_return_pct    DECIMAL(10,4),
    max_drawdown_pct    DECIMAL(8,4),
    sharpe_ratio        DECIMAL(8,4),
    sortino_ratio       DECIMAL(8,4),
    calmar_ratio        DECIMAL(8,4),
    win_rate            DECIMAL(5,4),
    profit_factor       DECIMAL(8,4),
    total_trades        INTEGER,
    winning_trades      INTEGER,
    losing_trades       INTEGER,
    avg_trade_return_pct DECIMAL(8,4),
    avg_win_pct         DECIMAL(8,4),
    avg_loss_pct        DECIMAL(8,4),
    largest_win_usd     DECIMAL(15,4),
    largest_loss_usd    DECIMAL(15,4),
    avg_hold_duration_sec INTEGER,
    -- Equity curve stored as compressed JSON array
    equity_curve        JSONB,                               -- [{timestamp, equity, drawdown}, ...]
    trade_log           JSONB,                               -- [{entry, exit, pnl, duration}, ...]
    -- Execution
    progress_pct        DECIMAL(5,2) NOT NULL DEFAULT 0,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    error_message       TEXT,
    -- Processing
    elixir_node         VARCHAR(255),
    candles_processed   INTEGER NOT NULL DEFAULT 0,
    execution_time_ms   INTEGER,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE strategy.signals (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id         UUID NOT NULL REFERENCES strategy.strategies(id),
    bot_id              UUID REFERENCES trading.bots(id),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    -- Signal details
    signal_type         strategy.signal_type NOT NULL,
    trading_pair        VARCHAR(30) NOT NULL,
    exchange_code       VARCHAR(50) NOT NULL,
    -- Signal parameters
    direction           trading.order_side NOT NULL,
    suggested_price     DECIMAL(24,8),
    suggested_quantity  DECIMAL(24,8),
    confidence          DECIMAL(5,4),                        -- 0.0 to 1.0
    strength            VARCHAR(20),                         -- weak, moderate, strong
    -- Indicators that triggered this signal
    indicators_snapshot JSONB DEFAULT '{}',
    -- Outcome tracking
    was_executed        BOOLEAN NOT NULL DEFAULT FALSE,
    execution_order_id  UUID REFERENCES trading.orders(id),
    rejection_reason    TEXT,
    -- Timing
    signal_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expired_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from bots to strategies now that strategies table exists
ALTER TABLE trading.bots
    ADD CONSTRAINT fk_bots_strategy
    FOREIGN KEY (strategy_id) REFERENCES strategy.strategies(id);

ALTER TABLE trading.orders
    ADD CONSTRAINT fk_orders_strategy
    FOREIGN KEY (strategy_id) REFERENCES strategy.strategies(id);

ALTER TABLE trading.orders
    ADD CONSTRAINT fk_orders_signal
    FOREIGN KEY (signal_id) REFERENCES strategy.signals(id);

ALTER TABLE trading.positions
    ADD CONSTRAINT fk_positions_strategy
    FOREIGN KEY (strategy_id) REFERENCES strategy.strategies(id);

-- Indexes for strategy schema
CREATE INDEX idx_strategies_user_id ON strategy.strategies(user_id);
CREATE INDEX idx_strategies_parent ON strategy.strategies(parent_strategy_id);
CREATE INDEX idx_strategies_type ON strategy.strategies(type);
CREATE INDEX idx_strategies_status ON strategy.strategies(status);
CREATE INDEX idx_strategies_is_core ON strategy.strategies(is_core) WHERE is_core = TRUE;
CREATE INDEX idx_strategies_is_public ON strategy.strategies(is_public) WHERE is_public = TRUE;

CREATE INDEX idx_backtest_runs_strategy_id ON strategy.backtest_runs(strategy_id);
CREATE INDEX idx_backtest_runs_user_id ON strategy.backtest_runs(user_id);
CREATE INDEX idx_backtest_runs_status ON strategy.backtest_runs(status);
CREATE INDEX idx_backtest_runs_created ON strategy.backtest_runs(created_at DESC);

CREATE INDEX idx_signals_strategy_id ON strategy.signals(strategy_id);
CREATE INDEX idx_signals_bot_id ON strategy.signals(bot_id);
CREATE INDEX idx_signals_user_id ON strategy.signals(user_id);
CREATE INDEX idx_signals_signal_at ON strategy.signals(signal_at DESC);
CREATE INDEX idx_signals_executed ON strategy.signals(was_executed);


-- ============================================================================
-- SCHEMA: billing
-- Subscriptions, invoices, payments, P&L tracking
-- ============================================================================

CREATE TABLE billing.plans (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tier                auth.tier NOT NULL,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    -- Pricing
    monthly_fee_usd     DECIMAL(10,2) NOT NULL DEFAULT 0,
    annual_fee_usd      DECIMAL(10,2),                       -- Discounted annual option
    performance_fee_pct DECIMAL(5,2) NOT NULL DEFAULT 0,     -- % of realized profit
    -- Limits (reference only, enforced by risk schema)
    max_bots            INTEGER,
    max_custom_strategies INTEGER,
    max_exchanges       INTEGER,
    max_backtests_monthly INTEGER,
    -- Features
    features            JSONB DEFAULT '[]',
    -- Status
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    -- Trial
    trial_days          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing.subscriptions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    plan_id             UUID NOT NULL REFERENCES billing.plans(id),
    status              billing.subscription_status NOT NULL DEFAULT 'trial',
    -- Billing details
    billing_cycle       VARCHAR(10) NOT NULL DEFAULT 'monthly', -- monthly, annual
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end  TIMESTAMPTZ NOT NULL,
    trial_end           TIMESTAMPTZ,
    -- Payment
    payment_method      billing.payment_method,
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id  VARCHAR(255),
    -- Cancellation
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason TEXT,
    -- Grace period
    grace_period_end    TIMESTAMPTZ,
    past_due_since      TIMESTAMPTZ,
    -- High water mark for performance fee calculation
    performance_hwm_usd DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing.invoices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    subscription_id     UUID REFERENCES billing.subscriptions(id),
    -- Invoice details
    invoice_number      VARCHAR(50) UNIQUE NOT NULL,
    status              billing.invoice_status NOT NULL DEFAULT 'draft',
    -- Amounts
    subtotal_usd        DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_usd             DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_usd           DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_paid_usd     DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_due_usd      DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    -- Line items
    line_items          JSONB NOT NULL DEFAULT '[]',
    -- Billing period
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    -- Dates
    issued_at           TIMESTAMPTZ,
    due_at              TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    voided_at           TIMESTAMPTZ,
    -- External
    stripe_invoice_id   VARCHAR(255),
    pdf_url             TEXT,
    -- Metadata
    notes               TEXT,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing.payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    invoice_id          UUID REFERENCES billing.invoices(id),
    subscription_id     UUID REFERENCES billing.subscriptions(id),
    -- Payment details
    amount_usd          DECIMAL(12,2) NOT NULL,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    method              billing.payment_method NOT NULL,
    status              billing.payment_status NOT NULL DEFAULT 'pending',
    fee_type            billing.fee_type NOT NULL,
    -- External references
    stripe_payment_id   VARCHAR(255),
    stripe_charge_id    VARCHAR(255),
    transaction_hash    VARCHAR(255),                         -- For crypto payments
    mobile_money_ref    VARCHAR(255),                         -- For mobile money (PegPay)
    -- Error handling
    failure_code        VARCHAR(100),
    failure_message     TEXT,
    retry_count         INTEGER NOT NULL DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing.pnl_snapshots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    subscription_id     UUID REFERENCES billing.subscriptions(id),
    -- Period
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    -- P&L summary
    starting_equity_usd DECIMAL(15,4) NOT NULL,
    ending_equity_usd   DECIMAL(15,4) NOT NULL,
    realized_pnl_usd    DECIMAL(15,4) NOT NULL DEFAULT 0,
    unrealized_pnl_usd  DECIMAL(15,4) NOT NULL DEFAULT 0,
    total_fees_paid_usd  DECIMAL(15,4) NOT NULL DEFAULT 0,
    net_pnl_usd         DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Performance fee calculation
    hwm_at_start        DECIMAL(15,4) NOT NULL,
    hwm_at_end          DECIMAL(15,4) NOT NULL,
    profit_above_hwm    DECIMAL(15,4) NOT NULL DEFAULT 0,
    performance_fee_pct DECIMAL(5,2) NOT NULL,
    performance_fee_usd DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Trade stats
    total_trades        INTEGER NOT NULL DEFAULT 0,
    winning_trades      INTEGER NOT NULL DEFAULT 0,
    losing_trades       INTEGER NOT NULL DEFAULT 0,
    -- Metadata
    is_finalized        BOOLEAN NOT NULL DEFAULT FALSE,
    finalized_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for billing schema
CREATE INDEX idx_plans_tier ON billing.plans(tier);
CREATE INDEX idx_plans_active ON billing.plans(is_active) WHERE is_active = TRUE;

CREATE INDEX idx_subscriptions_user_id ON billing.subscriptions(user_id);
CREATE INDEX idx_subscriptions_plan_id ON billing.subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON billing.subscriptions(status);
CREATE INDEX idx_subscriptions_stripe ON billing.subscriptions(stripe_subscription_id);

CREATE INDEX idx_invoices_user_id ON billing.invoices(user_id);
CREATE INDEX idx_invoices_subscription ON billing.invoices(subscription_id);
CREATE INDEX idx_invoices_status ON billing.invoices(status);
CREATE INDEX idx_invoices_number ON billing.invoices(invoice_number);
CREATE INDEX idx_invoices_due ON billing.invoices(due_at) WHERE status = 'issued';

CREATE INDEX idx_payments_user_id ON billing.payments(user_id);
CREATE INDEX idx_payments_invoice ON billing.payments(invoice_id);
CREATE INDEX idx_payments_status ON billing.payments(status);
CREATE INDEX idx_payments_stripe ON billing.payments(stripe_payment_id);

CREATE INDEX idx_pnl_snapshots_user_id ON billing.pnl_snapshots(user_id);
CREATE INDEX idx_pnl_snapshots_period ON billing.pnl_snapshots(user_id, period_start, period_end);
CREATE INDEX idx_pnl_snapshots_finalized ON billing.pnl_snapshots(is_finalized);


-- ============================================================================
-- SCHEMA: risk
-- Limit configurations, circuit breaker history, audit trail
-- ============================================================================

CREATE TABLE risk.limit_configs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope               risk.limit_scope NOT NULL,
    limit_type          risk.limit_type NOT NULL,
    -- Scope target (depends on scope type)
    tier_target         auth.tier,                           -- When scope = 'tier'
    user_target         UUID REFERENCES auth.users(id),      -- When scope = 'user'
    strategy_target     UUID REFERENCES strategy.strategies(id), -- When scope = 'strategy'
    exchange_target     UUID REFERENCES exchange.adapters(id),   -- When scope = 'exchange'
    -- Limit values
    numeric_value       DECIMAL(18,4),                       -- For numeric limits
    json_value          JSONB,                               -- For list-based limits (allowed_assets, etc.)
    -- Status
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    -- Audit
    set_by              UUID REFERENCES admin.admin_users(id),      -- Admin who set this
    reason              TEXT,
    effective_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until     TIMESTAMPTZ,                          -- NULL = indefinite
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique active limit per scope+type+target
    CONSTRAINT uq_active_limit UNIQUE NULLS NOT DISTINCT (
        scope, limit_type, tier_target, user_target, strategy_target, exchange_target, is_active
    )
);

CREATE TABLE risk.circuit_breaker_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    bot_id              UUID REFERENCES trading.bots(id),
    -- Trigger details
    trigger_type        risk.breaker_trigger NOT NULL,
    status              risk.breaker_status NOT NULL DEFAULT 'triggered',
    severity            VARCHAR(20) NOT NULL DEFAULT 'high',  -- low, medium, high, critical
    -- Context
    trigger_value       DECIMAL(15,4),                        -- The value that crossed the threshold
    threshold_value     DECIMAL(15,4),                        -- The configured threshold
    limit_config_id     UUID REFERENCES risk.limit_configs(id),
    -- Actions taken
    positions_closed    INTEGER NOT NULL DEFAULT 0,
    orders_cancelled    INTEGER NOT NULL DEFAULT 0,
    total_pnl_impact_usd DECIMAL(15,4),
    -- Cool-down
    cooldown_until      TIMESTAMPTZ,
    -- Resolution
    resolved_at         TIMESTAMPTZ,
    resolved_by         UUID REFERENCES admin.admin_users(id),      -- NULL for auto-resolve
    resolution_type     VARCHAR(20),                          -- auto, manual_admin, manual_user
    resolution_notes    TEXT,
    -- Metadata
    snapshot            JSONB DEFAULT '{}',                   -- State snapshot at trigger time
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE risk.audit_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Actor
    actor_type          VARCHAR(20) NOT NULL,                 -- user, admin, system, bot
    actor_id            UUID,
    actor_ip            INET,
    -- Action
    action              VARCHAR(100) NOT NULL,                -- e.g., limit.updated, bot.force_stopped
    resource_type       VARCHAR(50) NOT NULL,                 -- e.g., limit_config, bot, user
    resource_id         UUID,
    -- Changes
    old_value           JSONB,
    new_value           JSONB,
    -- Context
    reason              TEXT,
    correlation_id      UUID,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for risk schema
CREATE INDEX idx_limit_configs_scope ON risk.limit_configs(scope);
CREATE INDEX idx_limit_configs_type ON risk.limit_configs(limit_type);
CREATE INDEX idx_limit_configs_tier ON risk.limit_configs(tier_target);
CREATE INDEX idx_limit_configs_user ON risk.limit_configs(user_target);
CREATE INDEX idx_limit_configs_active ON risk.limit_configs(is_active) WHERE is_active = TRUE;

CREATE INDEX idx_breaker_events_user_id ON risk.circuit_breaker_events(user_id);
CREATE INDEX idx_breaker_events_bot_id ON risk.circuit_breaker_events(bot_id);
CREATE INDEX idx_breaker_events_status ON risk.circuit_breaker_events(status);
CREATE INDEX idx_breaker_events_trigger ON risk.circuit_breaker_events(trigger_type);
CREATE INDEX idx_breaker_events_created ON risk.circuit_breaker_events(created_at DESC);

CREATE INDEX idx_audit_log_actor ON risk.audit_log(actor_type, actor_id);
CREATE INDEX idx_audit_log_action ON risk.audit_log(action);
CREATE INDEX idx_audit_log_resource ON risk.audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON risk.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_correlation ON risk.audit_log(correlation_id);


-- ============================================================================
-- SCHEMA: market_data
-- TimescaleDB hypertables for OHLCV candle data
-- ============================================================================

CREATE TABLE market_data.ticker_metadata (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_code       VARCHAR(50) NOT NULL,
    trading_pair        VARCHAR(30) NOT NULL,
    base_asset          VARCHAR(20) NOT NULL,
    quote_asset         VARCHAR(20) NOT NULL,
    -- Properties
    price_precision     INTEGER NOT NULL DEFAULT 8,
    quantity_precision  INTEGER NOT NULL DEFAULT 8,
    min_quantity        DECIMAL(24,8),
    max_quantity        DECIMAL(24,8),
    min_notional_usd    DECIMAL(12,2),
    tick_size           DECIMAL(24,8),
    -- Status
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_cached           BOOLEAN NOT NULL DEFAULT FALSE,      -- Whether we pre-cache OHLCV
    cache_since         TIMESTAMPTZ,
    last_candle_at      TIMESTAMPTZ,
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ticker_exchange_pair UNIQUE (exchange_code, trading_pair)
);

-- 1-minute candles (source of truth)
CREATE TABLE market_data.ohlcv_1m (
    time                TIMESTAMPTZ NOT NULL,
    exchange_code       VARCHAR(50) NOT NULL,
    trading_pair        VARCHAR(30) NOT NULL,
    open                DECIMAL(24,8) NOT NULL,
    high                DECIMAL(24,8) NOT NULL,
    low                 DECIMAL(24,8) NOT NULL,
    close               DECIMAL(24,8) NOT NULL,
    volume              DECIMAL(24,8) NOT NULL DEFAULT 0,
    quote_volume        DECIMAL(24,8) NOT NULL DEFAULT 0,
    trade_count         INTEGER NOT NULL DEFAULT 0,
    is_complete         BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT pk_ohlcv_1m PRIMARY KEY (time, exchange_code, trading_pair)
);

-- Convert to hypertable
SELECT create_hypertable('market_data.ohlcv_1m', 'time',
    chunk_time_interval => INTERVAL '1 week',
    if_not_exists => TRUE
);

-- 1-hour candles (continuous aggregate from 1m)
CREATE TABLE market_data.ohlcv_1h (
    time                TIMESTAMPTZ NOT NULL,
    exchange_code       VARCHAR(50) NOT NULL,
    trading_pair        VARCHAR(30) NOT NULL,
    open                DECIMAL(24,8) NOT NULL,
    high                DECIMAL(24,8) NOT NULL,
    low                 DECIMAL(24,8) NOT NULL,
    close               DECIMAL(24,8) NOT NULL,
    volume              DECIMAL(24,8) NOT NULL DEFAULT 0,
    quote_volume        DECIMAL(24,8) NOT NULL DEFAULT 0,
    trade_count         INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT pk_ohlcv_1h PRIMARY KEY (time, exchange_code, trading_pair)
);

SELECT create_hypertable('market_data.ohlcv_1h', 'time',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE
);

-- 1-day candles
CREATE TABLE market_data.ohlcv_1d (
    time                TIMESTAMPTZ NOT NULL,
    exchange_code       VARCHAR(50) NOT NULL,
    trading_pair        VARCHAR(30) NOT NULL,
    open                DECIMAL(24,8) NOT NULL,
    high                DECIMAL(24,8) NOT NULL,
    low                 DECIMAL(24,8) NOT NULL,
    close               DECIMAL(24,8) NOT NULL,
    volume              DECIMAL(24,8) NOT NULL DEFAULT 0,
    quote_volume        DECIMAL(24,8) NOT NULL DEFAULT 0,
    trade_count         INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT pk_ohlcv_1d PRIMARY KEY (time, exchange_code, trading_pair)
);

SELECT create_hypertable('market_data.ohlcv_1d', 'time',
    chunk_time_interval => INTERVAL '1 year',
    if_not_exists => TRUE
);

-- Indexes for market_data (TimescaleDB auto-creates time index)
CREATE INDEX idx_ohlcv_1m_pair ON market_data.ohlcv_1m(exchange_code, trading_pair, time DESC);
CREATE INDEX idx_ohlcv_1h_pair ON market_data.ohlcv_1h(exchange_code, trading_pair, time DESC);
CREATE INDEX idx_ohlcv_1d_pair ON market_data.ohlcv_1d(exchange_code, trading_pair, time DESC);
CREATE INDEX idx_ticker_metadata_exchange ON market_data.ticker_metadata(exchange_code);
CREATE INDEX idx_ticker_metadata_cached ON market_data.ticker_metadata(is_cached) WHERE is_cached = TRUE;


-- ============================================================================
-- SCHEMA: pool
-- Stella One pool wallet accounting (event-sourced)
-- ============================================================================

CREATE TABLE pool.pool_wallets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) NOT NULL,
    exchange_code       VARCHAR(50) NOT NULL,
    credential_id       UUID NOT NULL REFERENCES exchange.user_credentials(id),
    -- Balance tracking
    total_capital_usd   DECIMAL(15,4) NOT NULL DEFAULT 0,
    allocated_usd       DECIMAL(15,4) NOT NULL DEFAULT 0,
    available_usd       DECIMAL(15,4) NOT NULL DEFAULT 0,
    reserved_for_fees_usd DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Status
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    max_allocation_per_user_usd DECIMAL(15,4) NOT NULL DEFAULT 100,
    max_total_users     INTEGER NOT NULL DEFAULT 1000,
    current_user_count  INTEGER NOT NULL DEFAULT 0,
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pool.allocations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_wallet_id      UUID NOT NULL REFERENCES pool.pool_wallets(id),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    bot_id              UUID REFERENCES trading.bots(id),
    -- Allocation details
    allocated_amount_usd DECIMAL(15,4) NOT NULL,
    current_value_usd   DECIMAL(15,4) NOT NULL,
    status              pool.allocation_status NOT NULL DEFAULT 'active',
    -- P&L tracking
    total_pnl_usd       DECIMAL(15,4) NOT NULL DEFAULT 0,
    total_fees_usd       DECIMAL(15,4) NOT NULL DEFAULT 0,
    stella_share_usd     DECIMAL(15,4) NOT NULL DEFAULT 0,   -- Stella's reimbursement amount
    user_share_usd       DECIMAL(15,4) NOT NULL DEFAULT 0,   -- User's profit share
    -- Reimbursement tracking
    reimbursed_amount_usd DECIMAL(15,4) NOT NULL DEFAULT 0,  -- Amount reimbursed to Stella so far
    reimbursement_pct    DECIMAL(5,2) NOT NULL DEFAULT 20,    -- Performance fee for Stella One
    -- Lifecycle
    activated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_trade_at       TIMESTAMPTZ,
    reclaimed_at        TIMESTAMPTZ,
    reclaim_reason      TEXT,
    -- Metadata
    strategy_id         UUID REFERENCES strategy.strategies(id),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One active allocation per user per pool
    CONSTRAINT uq_active_allocation UNIQUE (pool_wallet_id, user_id) 
);

CREATE TABLE pool.transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_wallet_id      UUID NOT NULL REFERENCES pool.pool_wallets(id),
    allocation_id       UUID REFERENCES pool.allocations(id),
    user_id             UUID REFERENCES auth.users(id),
    -- Transaction details
    transaction_type    pool.transaction_type NOT NULL,
    amount_usd          DECIMAL(15,4) NOT NULL,
    -- Balance after transaction
    pool_balance_after  DECIMAL(15,4) NOT NULL,
    allocation_balance_after DECIMAL(15,4),
    -- Reference
    reference_type      VARCHAR(50),                          -- order, fill, bot, admin
    reference_id        UUID,
    -- Audit
    description         TEXT,
    correlation_id      UUID,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pool.reimbursements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    allocation_id       UUID NOT NULL REFERENCES pool.allocations(id),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    -- Reimbursement calculation
    gross_profit_usd    DECIMAL(15,4) NOT NULL,
    stella_share_pct    DECIMAL(5,2) NOT NULL,
    stella_share_usd    DECIMAL(15,4) NOT NULL,
    user_share_usd      DECIMAL(15,4) NOT NULL,
    gas_fees_covered_usd DECIMAL(15,4) NOT NULL DEFAULT 0,
    -- Net amounts
    net_reimbursement_usd DECIMAL(15,4) NOT NULL,            -- Total owed to Stella
    -- Status
    is_processed        BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at        TIMESTAMPTZ,
    -- Period
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stella One profit withdrawal requests with admin approval
CREATE TABLE pool.withdrawal_requests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    allocation_id       UUID NOT NULL REFERENCES pool.allocations(id),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    pool_wallet_id      UUID NOT NULL REFERENCES pool.pool_wallets(id),
    -- Request details
    amount_usd          DECIMAL(15,4) NOT NULL,                -- Amount user wants to withdraw
    available_profit_usd DECIMAL(15,4) NOT NULL,               -- User's withdrawable profit at request time
    currency            VARCHAR(20) NOT NULL DEFAULT 'USDT',
    -- Destination
    wallet_address      VARCHAR(255) NOT NULL,
    network             VARCHAR(50),                            -- e.g., 'ERC20', 'TRC20', 'BEP20'
    withdrawal_method   VARCHAR(30) NOT NULL DEFAULT 'blockchain', -- blockchain, mobile_money
    -- Status workflow
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, processing, completed, failed, cancelled
    -- Timestamps
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at         TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    processed_at        TIMESTAMPTZ,
    -- Admin review
    approved_by_admin_id UUID REFERENCES admin.admin_users(id),
    admin_notes         TEXT,
    rejection_reason    TEXT,
    -- Blockchain execution
    transaction_hash    VARCHAR(255),
    gas_fee_usd         DECIMAL(15,4),
    network_fee_usd     DECIMAL(15,4),
    net_amount_usd      DECIMAL(15,4),                          -- amount - fees = what user receives
    processing_time_minutes INTEGER,
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for pool schema
CREATE INDEX idx_pool_wallets_active ON pool.pool_wallets(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_pool_wallets_exchange ON pool.pool_wallets(exchange_code);

CREATE INDEX idx_allocations_pool ON pool.allocations(pool_wallet_id);
CREATE INDEX idx_allocations_user ON pool.allocations(user_id);
CREATE INDEX idx_allocations_status ON pool.allocations(status);
CREATE INDEX idx_allocations_bot ON pool.allocations(bot_id);

CREATE INDEX idx_pool_transactions_pool ON pool.transactions(pool_wallet_id);
CREATE INDEX idx_pool_transactions_allocation ON pool.transactions(allocation_id);
CREATE INDEX idx_pool_transactions_user ON pool.transactions(user_id);
CREATE INDEX idx_pool_transactions_type ON pool.transactions(transaction_type);
CREATE INDEX idx_pool_transactions_created ON pool.transactions(created_at DESC);
CREATE INDEX idx_pool_transactions_correlation ON pool.transactions(correlation_id);

CREATE INDEX idx_reimbursements_allocation ON pool.reimbursements(allocation_id);
CREATE INDEX idx_reimbursements_user ON pool.reimbursements(user_id);
CREATE INDEX idx_reimbursements_processed ON pool.reimbursements(is_processed);

CREATE INDEX idx_pool_withdrawal_user ON pool.withdrawal_requests(user_id);
CREATE INDEX idx_pool_withdrawal_allocation ON pool.withdrawal_requests(allocation_id);
CREATE INDEX idx_pool_withdrawal_status ON pool.withdrawal_requests(status);
CREATE INDEX idx_pool_withdrawal_pending ON pool.withdrawal_requests(status) WHERE status = 'pending';
CREATE INDEX idx_pool_withdrawal_admin ON pool.withdrawal_requests(approved_by_admin_id);
CREATE INDEX idx_pool_withdrawal_requested ON pool.withdrawal_requests(requested_at DESC);


-- ============================================================================
-- SCHEMA: system_ops
-- System monitoring, service health, and operational state
-- ============================================================================

CREATE TABLE system_ops.service_health (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name        VARCHAR(100) NOT NULL,                 -- e.g., 'stella-elixir', 'stella-nestjs', 'rabbitmq'
    status              VARCHAR(20) NOT NULL,                  -- healthy, degraded, unhealthy, offline
    last_check_at       TIMESTAMPTZ NOT NULL,
    latency_ms          INTEGER,
    -- Details
    version             VARCHAR(50),
    node_name           VARCHAR(255),
    uptime_seconds      BIGINT,
    details             JSONB DEFAULT '{}',                    -- Service-specific health details
    error_message       TEXT,
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE system_ops.schema_migrations (
    version             BIGINT PRIMARY KEY,
    inserted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for system_ops
CREATE INDEX idx_service_health_name ON system_ops.service_health(service_name);
CREATE INDEX idx_service_health_status ON system_ops.service_health(status);
CREATE INDEX idx_service_health_check ON system_ops.service_health(last_check_at DESC);


-- ============================================================================
-- SCHEMA: event_log
-- Platform-wide event store for audit, replay, and debugging
-- ============================================================================

CREATE TABLE event_log.events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id            UUID NOT NULL UNIQUE,                 -- Application-generated UUID v7
    event_type          VARCHAR(100) NOT NULL,                -- e.g., trading.order.filled
    version             INTEGER NOT NULL DEFAULT 1,
    -- Source
    source_service      VARCHAR(50) NOT NULL,                 -- elixir_trading, nestjs_platform
    source_node         VARCHAR(255),
    -- Correlation
    correlation_id      UUID,
    causation_id        UUID,                                 -- Event that caused this event
    -- Targeting
    user_id             UUID,
    aggregate_type      VARCHAR(50),                          -- bot, order, subscription, etc.
    aggregate_id        UUID,
    -- Payload
    payload             JSONB NOT NULL DEFAULT '{}',
    -- Processing
    published_at        TIMESTAMPTZ NOT NULL,
    -- RabbitMQ details
    exchange_name       VARCHAR(100),
    routing_key         VARCHAR(200),
    -- Retention
    expires_at          TIMESTAMPTZ,                          -- For TTL-based cleanup
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Convert to hypertable for efficient time-range queries and auto-cleanup
SELECT create_hypertable('event_log.events', 'created_at',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes for event_log
CREATE INDEX idx_events_event_type ON event_log.events(event_type, created_at DESC);
CREATE INDEX idx_events_user_id ON event_log.events(user_id, created_at DESC);
CREATE INDEX idx_events_correlation ON event_log.events(correlation_id);
CREATE INDEX idx_events_aggregate ON event_log.events(aggregate_type, aggregate_id, created_at DESC);
CREATE INDEX idx_events_source ON event_log.events(source_service, created_at DESC);
CREATE INDEX idx_events_published ON event_log.events(published_at DESC);


-- ============================================================================
-- FUNCTIONS: Updated timestamps trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT table_schema, table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
          AND table_schema IN ('auth', 'admin', 'exchange', 'trading', 'strategy', 'billing', 'risk', 'pool', 'system_ops')
    LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
            t.table_schema, t.table_name
        );
    END LOOP;
END;
$$;


-- ============================================================================
-- FUNCTIONS: Utility functions
-- ============================================================================

-- Get the effective limit value for a user, cascading through the hierarchy
-- Returns the most restrictive limit from: global -> tier -> user
CREATE OR REPLACE FUNCTION risk.get_effective_limit(
    p_user_id UUID,
    p_limit_type risk.limit_type
)
RETURNS DECIMAL(18,4) AS $$
DECLARE
    v_tier auth.tier;
    v_user_limit DECIMAL(18,4);
    v_tier_limit DECIMAL(18,4);
    v_global_limit DECIMAL(18,4);
    v_result DECIMAL(18,4);
BEGIN
    -- Get user's tier
    SELECT tier INTO v_tier FROM auth.users WHERE id = p_user_id;

    -- Get user-specific override
    SELECT numeric_value INTO v_user_limit
    FROM risk.limit_configs
    WHERE scope = 'user' AND user_target = p_user_id
      AND limit_type = p_limit_type AND is_active = TRUE
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC LIMIT 1;

    -- Get tier default
    SELECT numeric_value INTO v_tier_limit
    FROM risk.limit_configs
    WHERE scope = 'tier' AND tier_target = v_tier
      AND limit_type = p_limit_type AND is_active = TRUE
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC LIMIT 1;

    -- Get global default
    SELECT numeric_value INTO v_global_limit
    FROM risk.limit_configs
    WHERE scope = 'global'
      AND limit_type = p_limit_type AND is_active = TRUE
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC LIMIT 1;

    -- Return the most restrictive (smallest) non-null value
    -- For drawdown/leverage, smaller = more restrictive
    v_result := LEAST(
        COALESCE(v_user_limit, 999999999),
        COALESCE(v_tier_limit, 999999999),
        COALESCE(v_global_limit, 999999999)
    );

    IF v_result = 999999999 THEN
        RETURN NULL;  -- No limit configured
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;


-- Calculate current drawdown (user-level aggregate or per-bot)
CREATE OR REPLACE FUNCTION trading.get_current_drawdown(
    p_user_id UUID,
    p_bot_id UUID DEFAULT NULL
)
RETURNS TABLE(
    current_equity_usd DECIMAL(15,4),
    starting_capital_usd DECIMAL(15,4),
    high_water_mark_usd DECIMAL(15,4),
    drawdown_pct DECIMAL(8,4),
    return_pct DECIMAL(10,4),
    realized_pnl_usd DECIMAL(15,4)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        es.total_equity_usd,
        es.starting_capital_usd,
        es.high_water_mark_usd,
        es.drawdown_pct,
        es.return_pct,
        es.realized_pnl_usd
    FROM trading.equity_snapshots es
    WHERE es.user_id = p_user_id
      AND (p_bot_id IS NULL AND es.bot_id IS NULL    -- user aggregate
           OR es.bot_id = p_bot_id)                   -- specific bot
    ORDER BY es.snapshot_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;


-- Calculate P&L for a billing period (used for performance fee invoicing)
CREATE OR REPLACE FUNCTION billing.calculate_period_pnl(
    p_user_id UUID,
    p_period_start TIMESTAMPTZ,
    p_period_end TIMESTAMPTZ
)
RETURNS TABLE(
    realized_pnl DECIMAL(15,4),
    total_fees DECIMAL(15,4),
    trade_count BIGINT,
    winning_count BIGINT,
    losing_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(p.realized_pnl_usd), 0) AS realized_pnl,
        COALESCE(SUM(p.total_fees_usd), 0) AS total_fees,
        COUNT(*) AS trade_count,
        COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0) AS winning_count,
        COUNT(*) FILTER (WHERE p.realized_pnl_usd < 0) AS losing_count
    FROM trading.positions p
    WHERE p.user_id = p_user_id
      AND p.status = 'closed'
      AND p.closed_at >= p_period_start
      AND p.closed_at < p_period_end;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================================
-- SEED DATA: Admin roles, permissions, default plans, and global limits
-- ============================================================================

-- Admin roles
INSERT INTO admin.roles (code, name, description, hierarchy_level) VALUES
    ('super_admin', 'Super Administrator', 'Full platform access with ability to manage other administrators', 1),
    ('operations_manager', 'Operations Manager', 'Exchange adapter management, system configuration, user oversight', 10),
    ('risk_officer', 'Risk Officer', 'Risk limit configuration, circuit breaker management, real-time monitoring', 20),
    ('compliance_officer', 'Compliance Officer', 'KYC review and approval, audit log access, regulatory reporting', 30),
    ('finance_manager', 'Finance Manager', 'Billing oversight, invoice management, pool wallet operations', 40),
    ('strategy_curator', 'Strategy Curator', 'Core strategy management, marketplace curation, backtest review', 50),
    ('support_agent', 'Support Agent', 'Read-only user data access, basic user support actions', 90);

-- Admin permissions
INSERT INTO admin.permissions (code, name, category, action, is_sensitive) VALUES
    -- Users
    ('users.view', 'View users', 'users', 'view', FALSE),
    ('users.update', 'Update user profiles and status', 'users', 'update', FALSE),
    ('users.update_tier', 'Change user tier', 'users', 'update', TRUE),
    ('users.suspend', 'Suspend user accounts', 'users', 'execute', TRUE),
    ('users.export', 'Export user data', 'users', 'export', TRUE),
    -- Admins
    ('admins.view', 'View admin users', 'admins', 'view', FALSE),
    ('admins.create', 'Invite new admins', 'admins', 'create', TRUE),
    ('admins.update', 'Update admin roles and status', 'admins', 'update', TRUE),
    ('admins.delete', 'Deactivate admin accounts', 'admins', 'delete', TRUE),
    -- Exchanges
    ('exchanges.view', 'View exchange adapters', 'exchanges', 'view', FALSE),
    ('exchanges.activate', 'Activate/deactivate exchange adapters', 'exchanges', 'execute', TRUE),
    ('exchanges.configure', 'Configure exchange parameters', 'exchanges', 'update', TRUE),
    -- Trading
    ('trading.view', 'View trading activity', 'trading', 'view', FALSE),
    ('trading.force_stop', 'Force-stop user bots', 'trading', 'execute', TRUE),
    ('trading.close_positions', 'Force-close user positions', 'trading', 'execute', TRUE),
    -- Strategies
    ('strategies.view', 'View all strategies', 'strategies', 'view', FALSE),
    ('strategies.manage_core', 'Manage core strategies', 'strategies', 'update', TRUE),
    ('strategies.approve', 'Approve marketplace strategies', 'strategies', 'approve', FALSE),
    -- Billing
    ('billing.view', 'View billing and invoices', 'billing', 'view', FALSE),
    ('billing.manage', 'Manage subscriptions and issue refunds', 'billing', 'update', TRUE),
    ('billing.export', 'Export financial reports', 'billing', 'export', TRUE),
    -- Risk
    ('risk.view', 'View risk dashboard and limits', 'risk', 'view', FALSE),
    ('risk.update_limits', 'Update risk limits', 'risk', 'update', TRUE),
    ('risk.reset_breakers', 'Reset circuit breakers', 'risk', 'execute', TRUE),
    ('risk.override_user', 'Set per-user limit overrides', 'risk', 'update', TRUE),
    -- Pool
    ('pool.view', 'View pool wallet status', 'pool', 'view', FALSE),
    ('pool.manage', 'Manage pool allocations and reimbursements', 'pool', 'update', TRUE),
    ('pool.reclaim', 'Reclaim pool capital from users', 'pool', 'execute', TRUE),
    -- Reports
    ('reports.view', 'View platform reports', 'reports', 'view', FALSE),
    ('reports.export', 'Export platform reports', 'reports', 'export', FALSE),
    ('reports.audit_log', 'View full audit log', 'reports', 'view', TRUE),
    -- System
    ('system.view_health', 'View system health and metrics', 'system', 'view', FALSE),
    ('system.manage_config', 'Update system configuration', 'system', 'update', TRUE),
    ('system.maintenance_mode', 'Toggle maintenance mode', 'system', 'execute', TRUE);

-- Assign permissions to roles
-- Super Admin: gets everything (enforced in code via is_super_admin flag, but also explicit grants)
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin.roles r CROSS JOIN admin.permissions p WHERE r.code = 'super_admin';

-- Operations Manager
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin.roles r, admin.permissions p
WHERE r.code = 'operations_manager'
  AND p.code IN (
    'users.view', 'users.update', 'users.update_tier', 'users.suspend',
    'exchanges.view', 'exchanges.activate', 'exchanges.configure',
    'trading.view', 'trading.force_stop', 'trading.close_positions',
    'risk.view', 'reports.view', 'system.view_health'
);

-- Risk Officer
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin.roles r, admin.permissions p
WHERE r.code = 'risk_officer'
  AND p.code IN (
    'users.view', 'trading.view', 'trading.force_stop', 'trading.close_positions',
    'risk.view', 'risk.update_limits', 'risk.reset_breakers', 'risk.override_user',
    'pool.view', 'reports.view', 'reports.audit_log', 'system.view_health'
);

-- Compliance Officer
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin.roles r, admin.permissions p
WHERE r.code = 'compliance_officer'
  AND p.code IN (
    'users.view', 'users.export',
    'trading.view', 'billing.view', 'billing.export',
    'risk.view', 'pool.view',
    'reports.view', 'reports.export', 'reports.audit_log'
);

-- Finance Manager
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin.roles r, admin.permissions p
WHERE r.code = 'finance_manager'
  AND p.code IN (
    'users.view', 'billing.view', 'billing.manage', 'billing.export',
    'pool.view', 'pool.manage', 'pool.reclaim',
    'reports.view', 'reports.export'
);

-- Strategy Curator
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin.roles r, admin.permissions p
WHERE r.code = 'strategy_curator'
  AND p.code IN (
    'strategies.view', 'strategies.manage_core', 'strategies.approve',
    'trading.view', 'reports.view'
);

-- Support Agent (most restricted)
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin.roles r, admin.permissions p
WHERE r.code = 'support_agent'
  AND p.code IN (
    'users.view', 'users.update',
    'trading.view', 'billing.view',
    'exchanges.view', 'reports.view'
);

-- Default subscription plans
INSERT INTO billing.plans (tier, name, description, monthly_fee_usd, performance_fee_pct, max_bots, max_custom_strategies, max_exchanges, max_backtests_monthly, trial_days, sort_order) VALUES
    ('stella_one', 'Stella One - Liberation', 'Zero-cost access with same core intelligence. Stella recoups from profits only.', 0, 20.00, 1, 0, 2, 5, 0, 1),
    ('stella_unum', 'Stella Unum - Guided', 'Structured access with guided custody and tier-based controls.', 49.00, 15.00, 3, 2, 3, 20, 14, 2),
    ('stella_eon', 'Stella Eon - Professional', 'Advanced execution with bespoke risk profiles for sophisticated allocators.', 199.00, 10.00, 10, -1, 5, -1, 14, 3),
    ('stella_plenum', 'Stella Plenum - Sovereign', 'White-glove service with multi-signature governance for family offices.', 0, 0, -1, -1, -1, -1, 0, 4);
-- Note: -1 means unlimited, Plenum pricing is custom/negotiated

-- Global platform limits (safety net)
INSERT INTO risk.limit_configs (scope, limit_type, numeric_value, reason) VALUES
    ('global', 'max_drawdown_pct', 50.0000, 'Platform-wide maximum drawdown safety net'),
    ('global', 'max_trade_size_usd', 100000.0000, 'Platform-wide maximum single trade size'),
    ('global', 'daily_volume_cap_usd', 500000.0000, 'Platform-wide maximum daily volume per user'),
    ('global', 'max_leverage', 10.0000, 'Platform-wide maximum leverage'),
    ('global', 'max_open_positions', 100, 'Platform-wide maximum concurrent positions'),
    ('global', 'max_orders_per_minute', 30, 'Platform-wide rate limit for exchange API protection');

-- Tier-specific default limits
-- Stella One
INSERT INTO risk.limit_configs (scope, limit_type, tier_target, numeric_value, reason) VALUES
    ('tier', 'max_drawdown_pct', 'stella_one', 10.0000, 'Conservative drawdown for seeded capital'),
    ('tier', 'max_trade_size_usd', 'stella_one', 50.0000, 'Small trade sizes for pool-managed capital'),
    ('tier', 'daily_volume_cap_usd', 'stella_one', 200.0000, 'Limited daily volume for risk management'),
    ('tier', 'max_leverage', 'stella_one', 1.0000, 'No leverage for Stella One'),
    ('tier', 'max_open_positions', 'stella_one', 3, 'Limited concurrent positions');

-- Stella Unum
INSERT INTO risk.limit_configs (scope, limit_type, tier_target, numeric_value, reason) VALUES
    ('tier', 'max_drawdown_pct', 'stella_unum', 15.0000, 'Moderate drawdown for guided access'),
    ('tier', 'max_trade_size_usd', 'stella_unum', 500.0000, 'Moderate trade sizes'),
    ('tier', 'daily_volume_cap_usd', 'stella_unum', 5000.0000, 'Moderate daily volume'),
    ('tier', 'max_leverage', 'stella_unum', 2.0000, 'Limited leverage'),
    ('tier', 'max_open_positions', 'stella_unum', 10, 'Standard position count');

-- Stella Eon
INSERT INTO risk.limit_configs (scope, limit_type, tier_target, numeric_value, reason) VALUES
    ('tier', 'max_drawdown_pct', 'stella_eon', 25.0000, 'Higher tolerance for professional capital'),
    ('tier', 'max_trade_size_usd', 'stella_eon', 5000.0000, 'Professional trade sizes'),
    ('tier', 'daily_volume_cap_usd', 'stella_eon', 50000.0000, 'Professional daily volume'),
    ('tier', 'max_leverage', 'stella_eon', 5.0000, 'Moderate leverage for professionals'),
    ('tier', 'max_open_positions', 'stella_eon', 50, 'High position count');

-- Stella Plenum (generous defaults, typically overridden per-user)
INSERT INTO risk.limit_configs (scope, limit_type, tier_target, numeric_value, reason) VALUES
    ('tier', 'max_drawdown_pct', 'stella_plenum', 40.0000, 'Custom per client, high default'),
    ('tier', 'max_trade_size_usd', 'stella_plenum', 50000.0000, 'Custom per client'),
    ('tier', 'daily_volume_cap_usd', 'stella_plenum', 500000.0000, 'Effectively unlimited'),
    ('tier', 'max_leverage', 'stella_plenum', 10.0000, 'Full leverage access'),
    ('tier', 'max_open_positions', 'stella_plenum', 100, 'Effectively unlimited');

-- Default exchange adapters (inactive until admin activates)
INSERT INTO exchange.adapters (code, name, auth_model, base_url, ws_url, sandbox_base_url, sandbox_ws_url, supports_spot, supports_margin, supports_futures, rate_limit_orders, rate_limit_queries, description) VALUES
    ('binance', 'Binance', 'api_key_secret', 'https://api.binance.com', 'wss://stream.binance.com:9443', 'https://testnet.binance.vision', 'wss://testnet.binance.vision', TRUE, TRUE, TRUE, 50, 120, 'World''s largest cryptocurrency exchange by trading volume'),
    ('alpaca', 'Alpaca Markets', 'api_key_secret', 'https://api.alpaca.markets', 'wss://stream.data.alpaca.markets', 'https://paper-api.alpaca.markets', 'wss://stream.data.sandbox.alpaca.markets', TRUE, TRUE, FALSE, 60, 200, 'Commission-free stock and crypto trading API'),
    ('robinhood', 'Robinhood', 'oauth2', 'https://api.robinhood.com', NULL, NULL, NULL, TRUE, FALSE, FALSE, 30, 60, 'Commission-free investing platform with OAuth integration'),
    ('hyperliquid', 'Hyperliquid', 'wallet_connect', 'https://api.hyperliquid.xyz', 'wss://api.hyperliquid.xyz/ws', NULL, NULL, TRUE, FALSE, TRUE, 40, 100, 'On-chain perpetual futures DEX with WalletConnect');


-- ============================================================================
-- DATA RETENTION POLICIES (TimescaleDB)
-- ============================================================================

-- Drop 1-minute candle chunks older than 2 years
SELECT add_retention_policy('market_data.ohlcv_1m', INTERVAL '2 years', if_not_exists => TRUE);

-- Drop 1-hour candle chunks older than 5 years
SELECT add_retention_policy('market_data.ohlcv_1h', INTERVAL '5 years', if_not_exists => TRUE);

-- Drop event log chunks older than 1 year
SELECT add_retention_policy('event_log.events', INTERVAL '1 year', if_not_exists => TRUE);


-- ============================================================================
-- COMMENTS: Table documentation
-- ============================================================================

COMMENT ON SCHEMA auth IS 'User identity, profiles, KYC records, and session management';
COMMENT ON SCHEMA admin IS 'Platform administrators, roles, RBAC permissions, and backoffice access control - fully separate from customer users';
COMMENT ON SCHEMA exchange IS 'Exchange adapter configuration and encrypted user credentials';
COMMENT ON SCHEMA trading IS 'Orders, fills, positions - append-only audit trail for all trading activity';
COMMENT ON SCHEMA strategy IS 'Strategy definitions (core + custom), backtesting runs and results';
COMMENT ON SCHEMA billing IS 'Subscription plans, invoices, payments, and P&L snapshots for fee calculation';
COMMENT ON SCHEMA risk IS 'Hierarchical limit configurations, circuit breaker events, and audit trail';
COMMENT ON SCHEMA market_data IS 'TimescaleDB hypertables for OHLCV candle data across exchanges';
COMMENT ON SCHEMA pool IS 'Stella One pool wallet accounting with event-sourced transaction journal';
COMMENT ON SCHEMA system_ops IS 'System monitoring, service health checks, and operational state tracking';
COMMENT ON SCHEMA event_log IS 'Platform-wide event store for audit, replay, and cross-service debugging';

COMMENT ON TABLE auth.users IS 'Core user accounts linked to Logto identity provider';
COMMENT ON TABLE exchange.adapters IS 'Exchange adapter definitions with execution capabilities, rate limits, and supported features';
COMMENT ON TABLE exchange.user_credentials IS 'Encrypted storage for exchange API keys, OAuth tokens, and WalletConnect sessions';
COMMENT ON TABLE trading.orders IS 'Immutable order records - never updated or deleted, corrections via compensating entries';
COMMENT ON TABLE trading.fills IS 'Immutable fill/execution records from exchanges';
COMMENT ON TABLE trading.equity_snapshots IS 'Point-in-time equity captures at user-level and per-bot/strategy for performance tracking and drawdown monitoring';
COMMENT ON TABLE risk.limit_configs IS 'Hierarchical limit configuration: global -> tier -> user -> strategy';
COMMENT ON TABLE risk.circuit_breaker_events IS 'Record of all circuit breaker triggers including positions closed and cooldown periods';
COMMENT ON TABLE pool.transactions IS 'Event-sourced transaction journal for Stella One pool wallet - complete audit trail';

COMMENT ON TABLE admin.admin_users IS 'Backoffice administrators - completely separate from platform customers in auth.users';
COMMENT ON TABLE admin.roles IS 'Named role definitions with hierarchy levels for admin access control';
COMMENT ON TABLE admin.permissions IS 'Granular permission definitions organized by category and action type';
COMMENT ON TABLE admin.role_permissions IS 'Many-to-many mapping of which permissions are granted to each role';
COMMENT ON TABLE admin.admin_user_roles IS 'Many-to-many mapping of which roles are assigned to each admin user';
COMMENT ON TABLE admin.admin_audit_log IS 'Immutable audit trail of all admin actions with denormalized actor info for permanence';

COMMENT ON TABLE exchange.enabled_asset_pairs IS 'Per-credential enabled trading pairs with exchange-specific constraints, leverage limits, and order type support';
COMMENT ON TABLE trading.monitoring_alerts IS 'User-defined bot and strategy monitoring alerts for algorithmic execution oversight';
COMMENT ON TABLE trading.stop_loss_take_profit IS 'User-customizable SL/TP risk guardrails per position with trailing stop and exchange-native tracking';
COMMENT ON TABLE trading.user_strategies IS 'Execution intent: user → strategy → exchange binding with resolved config after exchange constraint validation';
COMMENT ON TABLE trading.trading_performance IS 'Aggregated performance metrics by period (daily/weekly/monthly) for dashboard and reporting';
COMMENT ON TABLE trading.predictions IS 'ML/physics-based market predictions with confidence scores and order flow analysis';
COMMENT ON TABLE strategy.strategies IS 'Strategy definitions supporting inheritance - users create custom strategies from core bases via parent_strategy_id';
COMMENT ON TABLE pool.withdrawal_requests IS 'Stella One profit withdrawal requests with admin approval and blockchain execution tracking';
COMMENT ON TABLE system_ops.service_health IS 'Service health monitoring for all platform components with latency and uptime tracking';
COMMENT ON TABLE system_ops.schema_migrations IS 'Ecto migration tracking for database schema version management';
COMMENT ON TABLE market_data.ohlcv_1m IS 'TimescaleDB hypertable: 1-minute OHLCV candles, chunked weekly, 2-year retention';
COMMENT ON TABLE event_log.events IS 'TimescaleDB hypertable: all platform events for audit and replay, 1-year retention';

COMMENT ON FUNCTION risk.get_effective_limit IS 'Returns the most restrictive active limit for a user by cascading: global -> tier -> user override';
COMMENT ON FUNCTION trading.get_current_drawdown IS 'Returns the latest equity snapshot with current drawdown percentage for a user';
COMMENT ON FUNCTION billing.calculate_period_pnl IS 'Calculates realized P&L for a billing period, used for performance fee invoicing';


-- Check if an admin user has a specific permission
CREATE OR REPLACE FUNCTION admin.has_permission(
    p_admin_user_id UUID,
    p_permission_code VARCHAR(100)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_super BOOLEAN;
    v_has_perm BOOLEAN;
BEGIN
    -- Super admins bypass all permission checks
    SELECT is_super_admin INTO v_is_super
    FROM admin.admin_users
    WHERE id = p_admin_user_id AND status = 'active';

    IF v_is_super IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Check role-based permissions
    SELECT EXISTS(
        SELECT 1
        FROM admin.admin_user_roles aur
        JOIN admin.role_permissions rp ON rp.role_id = aur.role_id
        JOIN admin.permissions p ON p.id = rp.permission_id
        WHERE aur.admin_user_id = p_admin_user_id
          AND p.code = p_permission_code
          AND (aur.expires_at IS NULL OR aur.expires_at > NOW())
    ) INTO v_has_perm;

    RETURN COALESCE(v_has_perm, FALSE);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION admin.has_permission IS 'Checks if an admin user has a specific permission via their assigned roles, with super_admin bypass';
