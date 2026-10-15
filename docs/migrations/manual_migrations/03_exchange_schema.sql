-- =============================================================================
-- EXCHANGE SCHEMA - 3 Tables + Seed Data  
-- =============================================================================
-- Tables: platform_exchanges, exchange_health_checks, exchange_trading_pairs
-- Note: exchange schema already exists, adding new tables
-- =============================================================================

-- Table 1: exchange.platform_exchanges
CREATE TABLE IF NOT EXISTS exchange.platform_exchanges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_key VARCHAR(50) UNIQUE NOT NULL,
    
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10),
    
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    supports_testnet BOOLEAN NOT NULL DEFAULT false,
    
    api_base_url VARCHAR(255) NOT NULL,
    api_base_url_testnet VARCHAR(255),
    
    rate_limit_per_second INTEGER NOT NULL DEFAULT 10,
        CHECK (rate_limit_per_second >= 1 AND rate_limit_per_second <= 100),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT exchange_key_lowercase CHECK (exchange_key = LOWER(exchange_key))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_exchanges_key ON exchange.platform_exchanges(exchange_key);
CREATE INDEX IF NOT EXISTS idx_platform_exchanges_enabled ON exchange.platform_exchanges(is_enabled) WHERE is_enabled = true;

-- Seed data for exchanges
INSERT INTO exchange.platform_exchanges (exchange_key, name, icon, is_enabled, supports_testnet, api_base_url, api_base_url_testnet, rate_limit_per_second) VALUES
('binance', 'Binance', '🟡', true, true, 'https://api.binance.com', 'https://testnet.binance.vision', 20),
('bybit', 'Bybit', '🟠', true, true, 'https://api.bybit.com', 'https://api-testnet.bybit.com', 10),
('okx', 'OKX', '⚫', true, false, 'https://www.okx.com', NULL, 10),
('kraken', 'Kraken', '🔵', true, false, 'https://api.kraken.com', NULL, 15),
('kucoin', 'KuCoin', '🟢', true, true, 'https://api.kucoin.com', 'https://openapi-sandbox.kucoin.com', 10)
ON CONFLICT (exchange_key) DO NOTHING;

-- Table 2: exchange.exchange_health_checks
CREATE TABLE IF NOT EXISTS exchange.exchange_health_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_id UUID NOT NULL REFERENCES exchange.platform_exchanges(id) ON DELETE CASCADE,
    
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL,
        CHECK (status IN ('healthy', 'degraded', 'down')),
    
    response_time_ms INTEGER,
    error_message TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_health_checks_exchange ON exchange.exchange_health_checks(exchange_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_health_checks_status ON exchange.exchange_health_checks(status, checked_at DESC);

-- Table 3: exchange.exchange_trading_pairs
CREATE TABLE IF NOT EXISTS exchange.exchange_trading_pairs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_id UUID NOT NULL REFERENCES exchange.platform_exchanges(id) ON DELETE CASCADE,
    
    symbol VARCHAR(50) NOT NULL,
    base_currency VARCHAR(20) NOT NULL,
    quote_currency VARCHAR(20) NOT NULL,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    min_trade_size DECIMAL(20,8),
    max_trade_size DECIMAL(20,8),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_exchange_symbol UNIQUE (exchange_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_exchange_trading_pairs_exchange ON exchange.exchange_trading_pairs(exchange_id);
CREATE INDEX IF NOT EXISTS idx_exchange_trading_pairs_active ON exchange.exchange_trading_pairs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_exchange_trading_pairs_symbol ON exchange.exchange_trading_pairs(symbol);
