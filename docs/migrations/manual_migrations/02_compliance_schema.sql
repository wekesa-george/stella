-- =============================================================================
-- COMPLIANCE SCHEMA - 4 Tables + Seed Data
-- =============================================================================
-- Tables: compliance_settings, jurisdiction_restrictions, aml_flags, sanctions_screening_log
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS compliance;

-- Table 1: compliance.compliance_settings (singleton)
CREATE TABLE IF NOT EXISTS compliance.compliance_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  kyc_required BOOLEAN NOT NULL DEFAULT true,
  enhanced_dd_threshold_usd DECIMAL(15,2) NOT NULL DEFAULT 10000.00,
  sanctions_screening_enabled BOOLEAN NOT NULL DEFAULT true,
  aml_monitoring_enabled BOOLEAN NOT NULL DEFAULT true,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),
  
  CONSTRAINT only_one_compliance_settings CHECK (id = id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_settings_singleton ON compliance.compliance_settings ((1));

INSERT INTO compliance.compliance_settings (id) 
VALUES (uuid_generate_v4()) 
ON CONFLICT DO NOTHING;

-- Table 2: compliance.jurisdiction_restrictions
CREATE TABLE IF NOT EXISTS compliance.jurisdiction_restrictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_code VARCHAR(2) NOT NULL UNIQUE,
    country_name VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('blocked', 'restricted')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES auth.users(id),
    CONSTRAINT country_code_uppercase CHECK (country_code = UPPER(country_code))
);

CREATE INDEX IF NOT EXISTS idx_jurisdiction_restrictions_status ON compliance.jurisdiction_restrictions(status);
CREATE INDEX IF NOT EXISTS idx_jurisdiction_restrictions_active ON compliance.jurisdiction_restrictions(is_active) WHERE is_active = true;

-- Seed data for blocked countries
INSERT INTO compliance.jurisdiction_restrictions (country_code, country_name, reason, status) VALUES
('IR', 'Iran', 'OFAC sanctions', 'blocked'),
('KP', 'North Korea', 'OFAC sanctions', 'blocked'),
('SY', 'Syria', 'OFAC sanctions', 'blocked'),
('CU', 'Cuba', 'OFAC sanctions', 'blocked'),
('RU', 'Russia', 'EU/US sanctions — restricted products only', 'restricted'),
('BY', 'Belarus', 'EU/US sanctions', 'blocked'),
('VE', 'Venezuela', 'OFAC sanctions on government entities', 'restricted'),
('MM', 'Myanmar', 'US sanctions on military regime', 'blocked'),
('ZW', 'Zimbabwe', 'Targeted sanctions', 'restricted'),
('SD', 'Sudan', 'OFAC sanctions', 'blocked'),
('SS', 'South Sudan', 'Targeted sanctions', 'restricted'),
('CF', 'Central African Republic', 'UN sanctions', 'blocked')
ON CONFLICT (country_code) DO NOTHING;

-- Table 3: compliance.aml_flags
CREATE TABLE IF NOT EXISTS compliance.aml_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    flag_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    description TEXT NOT NULL,
    metadata JSONB,
    
    flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id UUID REFERENCES auth.users(id),
    
    status VARCHAR(50) NOT NULL DEFAULT 'open',
        CHECK (status IN ('open', 'under_review', 'resolved', 'escalated')),
    
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aml_flags_user ON compliance.aml_flags(user_id, flagged_at DESC);
CREATE INDEX IF NOT EXISTS idx_aml_flags_status ON compliance.aml_flags(status, severity);
CREATE INDEX IF NOT EXISTS idx_aml_flags_unresolved ON compliance.aml_flags(flagged_at DESC) 
    WHERE status IN ('open', 'under_review');

-- Table 4: compliance.sanctions_screening_log
CREATE TABLE IF NOT EXISTS compliance.sanctions_screening_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    screened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider VARCHAR(100),
    
    match_found BOOLEAN NOT NULL DEFAULT false,
    match_details JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sanctions_log_user ON compliance.sanctions_screening_log(user_id, screened_at DESC);
CREATE INDEX IF NOT EXISTS idx_sanctions_log_matches ON compliance.sanctions_screening_log(screened_at DESC) 
    WHERE match_found = true;
