-- ============================================================================
-- Migration 09: Service Health Checks — Centralized health monitoring history
-- ============================================================================

BEGIN;

-- Ensure platform schema exists
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.service_health_checks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name VARCHAR(100) NOT NULL,
  category    VARCHAR(50)  NOT NULL,
  environment VARCHAR(20)  NOT NULL,
  status      VARCHAR(20)  NOT NULL,
  message     TEXT,
  details     JSONB        NOT NULL DEFAULT '{}',
  response_time_ms INTEGER,
  checked_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Composite index for querying recent checks per service
CREATE INDEX IF NOT EXISTS idx_service_health_checks_name_checked
  ON platform.service_health_checks (service_name, checked_at DESC);

-- Filter by status (e.g. find all "down" entries)
CREATE INDEX IF NOT EXISTS idx_service_health_checks_status
  ON platform.service_health_checks (status);

-- Filter by category
CREATE INDEX IF NOT EXISTS idx_service_health_checks_category
  ON platform.service_health_checks (category);

-- Time-range queries / cleanup
CREATE INDEX IF NOT EXISTS idx_service_health_checks_checked_at
  ON platform.service_health_checks (checked_at DESC);

COMMIT;
