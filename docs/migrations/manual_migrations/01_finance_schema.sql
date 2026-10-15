-- =============================================================================
-- FINANCE SCHEMA - 5 Tables
-- =============================================================================
-- Tables: billing_config, fees_collected, subscriptions, strategy_stats, risk_metrics
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS finance;

-- Table 1: platform.billing_config (singleton)
CREATE TABLE IF NOT EXISTS platform.billing_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  platform_fee_pct DECIMAL(5,4) NOT NULL DEFAULT 0.0200,
    CHECK (platform_fee_pct >= 0 AND platform_fee_pct <= 0.50),
  
  min_aum_free_tier DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  max_aum_free_tier DECIMAL(15,2) NOT NULL DEFAULT 10000.00,
  
  tier_standard_fee_pct DECIMAL(5,4) NOT NULL DEFAULT 0.0200,
  tier_pro_fee_pct DECIMAL(5,4) NOT NULL DEFAULT 0.0150,
  tier_enterprise_fee_pct DECIMAL(5,4) NOT NULL DEFAULT 0.0100,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),
  
  CONSTRAINT only_one_billing_config CHECK (id = id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_config_singleton ON platform.billing_config ((1));

INSERT INTO platform.billing_config (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING;

-- Table 2: finance.fees_collected
CREATE TABLE IF NOT EXISTS finance.fees_collected (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  bot_id UUID REFERENCES trading.bots(id),
  
  fee_type VARCHAR(50) NOT NULL,
    CHECK (fee_type IN ('platform_fee', 'withdrawal_fee', 'subscription_fee')),
  
  amount_usd DECIMAL(15,4) NOT NULL,
  fee_pct DECIMAL(5,4),
  
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fees_collected_user ON finance.fees_collected(user_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_fees_collected_bot ON finance.fees_collected(bot_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_fees_collected_type ON finance.fees_collected(fee_type, collected_at DESC);

-- Table 3: finance.subscriptions
CREATE TABLE IF NOT EXISTS finance.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  tier VARCHAR(50) NOT NULL,
    CHECK (tier IN ('Standard', 'Pro', 'Enterprise')),
  
  status VARCHAR(50) NOT NULL DEFAULT 'active',
    CHECK (status IN ('active', 'cancelled', 'expired', 'suspended')),
  
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON finance.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON finance.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON finance.subscriptions(expires_at) WHERE status = 'active';

-- Table 4: finance.strategy_stats
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

-- Table 5: finance.risk_metrics
CREATE TABLE IF NOT EXISTS finance.risk_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Value at Risk Metrics
    var_95_pct DECIMAL(8,4),
    var_99_pct DECIMAL(8,4),
    cvar_99_9_pct DECIMAL(8,4),

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
