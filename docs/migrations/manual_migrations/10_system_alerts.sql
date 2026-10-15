-- =============================================================================
-- 10_system_alerts.sql
-- System/runtime alerts (service transitions, risk breaches, bot errors, etc.)
-- Separate from user-configured trading.monitoring_alerts
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.system_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type      VARCHAR(100)    NOT NULL,
    category        VARCHAR(100)    NOT NULL,
    severity        VARCHAR(20)     NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title           VARCHAR(500)    NOT NULL,
    message         TEXT            NOT NULL,
    metadata        JSONB           NOT NULL DEFAULT '{}',
    source          VARCHAR(200),
    acknowledged    BOOLEAN         NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(200),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Lookup by type
CREATE INDEX IF NOT EXISTS idx_system_alerts_type
    ON platform.system_alerts (alert_type);

-- Filter by severity
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity
    ON platform.system_alerts (severity);

-- Unacknowledged alerts (most common query)
CREATE INDEX IF NOT EXISTS idx_system_alerts_acknowledged
    ON platform.system_alerts (acknowledged)
    WHERE acknowledged = FALSE;

-- Timeline browsing
CREATE INDEX IF NOT EXISTS idx_system_alerts_created_desc
    ON platform.system_alerts (created_at DESC);

-- Dashboard filter: category + severity + unacknowledged
CREATE INDEX IF NOT EXISTS idx_system_alerts_cat_sev_ack
    ON platform.system_alerts (category, severity, acknowledged);

COMMENT ON TABLE platform.system_alerts IS 'Runtime system alerts: service transitions, risk breaches, bot errors. Not user-configured price alerts.';
