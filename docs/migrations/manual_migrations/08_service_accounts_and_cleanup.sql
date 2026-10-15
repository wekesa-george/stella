-- ============================================================================
-- Migration 08: Service Accounts, Legacy FK Cleanup & Username Constraints
-- ============================================================================
-- Purpose:
--   1a. Create platform.service_accounts for admin-managed bots
--   1b. Alter trading.bots — add service_account_id, make user_id nullable
--   1c. Repoint legacy FKs from auth.admin_users → admin.admin_users
--   1d. Add username to admin.admin_users
--   1e. Make auth.users.username NOT NULL
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1a. Create platform.service_accounts
-- ============================================================================

CREATE TABLE platform.service_accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(200) NOT NULL,
  account_type  VARCHAR(50) NOT NULL DEFAULT 'system',
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES admin.admin_users(id),
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_service_account_name UNIQUE (name)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform.service_accounts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Seed default service account
INSERT INTO platform.service_accounts (name, account_type, description)
VALUES ('System Trading', 'system', 'Default service account for system-managed bots');

-- ============================================================================
-- 1b. Alter trading.bots — add service_account_id, make user_id nullable
-- ============================================================================

ALTER TABLE trading.bots
  ADD COLUMN service_account_id UUID REFERENCES platform.service_accounts(id);

ALTER TABLE trading.bots
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE trading.bots
  ADD CONSTRAINT bots_must_have_owner
  CHECK (user_id IS NOT NULL OR service_account_id IS NOT NULL);

-- ============================================================================
-- 1c. Repoint legacy FKs from auth.admin_users → admin.admin_users
-- ============================================================================

-- platform.ip_allowlist: created_by_user_id integer → UUID
ALTER TABLE platform.ip_allowlist
  ADD COLUMN created_by_admin_id UUID REFERENCES admin.admin_users(id);

ALTER TABLE platform.ip_allowlist
  DROP CONSTRAINT ip_allowlist_created_by_user_id_fkey;

ALTER TABLE platform.ip_allowlist
  DROP COLUMN created_by_user_id;

ALTER TABLE platform.ip_allowlist
  RENAME COLUMN created_by_admin_id TO created_by_user_id;

-- platform.security_config: updated_by_user_id integer → UUID
ALTER TABLE platform.security_config
  ADD COLUMN updated_by_admin_id UUID REFERENCES admin.admin_users(id);

ALTER TABLE platform.security_config
  DROP CONSTRAINT security_config_updated_by_user_id_fkey;

ALTER TABLE platform.security_config
  DROP COLUMN updated_by_user_id;

ALTER TABLE platform.security_config
  RENAME COLUMN updated_by_admin_id TO updated_by_user_id;

-- ============================================================================
-- 1d. Backfill username on admin.admin_users and set NOT NULL
-- ============================================================================
-- Column and unique index already exist; just backfill NULLs and tighten constraint.

UPDATE admin.admin_users
  SET username = lower(first_name) || '_' || lower(last_name)
  WHERE username IS NULL OR username = '';

ALTER TABLE admin.admin_users
  ALTER COLUMN username SET NOT NULL;

-- ============================================================================
-- 1e. Make auth.users.username NOT NULL
-- ============================================================================

-- Backfill any NULL usernames from the email prefix
UPDATE auth.users
  SET username = split_part(email, '@', 1)
  WHERE username IS NULL;

ALTER TABLE auth.users
  ALTER COLUMN username SET NOT NULL;

COMMIT;
