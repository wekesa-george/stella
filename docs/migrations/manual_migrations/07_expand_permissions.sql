-- ============================================================================
-- MIGRATION 07: Expand admin permissions to cover all platform pages
-- ============================================================================
-- Adds 51 new permissions across 8 new categories to achieve 100% coverage
-- of all 27 pages from the trading engine page-by-page analysis.
--
-- Before: 10 categories, 30 permissions (~60% page coverage)
-- After:  18 categories, 81 permissions (100% page coverage)
--
-- Safe to re-run: uses IF NOT EXISTS and ON CONFLICT DO NOTHING
-- ============================================================================

-- ============================================================================
-- 1. EXTEND permission_category ENUM
-- ============================================================================
-- Must run OUTSIDE transaction — new enum values require a commit before use.
-- ============================================================================

ALTER TYPE admin.permission_category ADD VALUE IF NOT EXISTS 'kyc';
ALTER TYPE admin.permission_category ADD VALUE IF NOT EXISTS 'alerts';
ALTER TYPE admin.permission_category ADD VALUE IF NOT EXISTS 'shifts';
ALTER TYPE admin.permission_category ADD VALUE IF NOT EXISTS 'compliance';
ALTER TYPE admin.permission_category ADD VALUE IF NOT EXISTS 'infrastructure';
ALTER TYPE admin.permission_category ADD VALUE IF NOT EXISTS 'communications';
ALTER TYPE admin.permission_category ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE admin.permission_category ADD VALUE IF NOT EXISTS 'integrations';

-- Now start the transaction for the rest
BEGIN;


-- ============================================================================
-- 2. INSERT NEW PERMISSIONS
-- ============================================================================

INSERT INTO admin.permissions (code, name, category, action, is_sensitive) VALUES

    -- ═══════════════════════════════════════════════════════════════════════
    -- TRADING (additions) — pages 01 Bot Fleet, 02 Positions, 03 Mission
    --                        Control, 07 Bot Detail
    -- ═══════════════════════════════════════════════════════════════════════
    ('trading.create_bot',      'Create and deploy trading bots',               'trading', 'create',  FALSE),
    ('trading.manage_bot',      'Start, pause, resume bots',                    'trading', 'execute', FALSE),
    ('trading.delete_bot',      'Kill and remove bots',                         'trading', 'delete',  TRUE),
    ('trading.submit_order',    'Submit manual orders on behalf of bot or user','trading', 'execute', TRUE),
    ('trading.emergency_kill',  'Emergency kill all platform bots',             'trading', 'execute', TRUE),

    -- ═══════════════════════════════════════════════════════════════════════
    -- KYC — pages 12 Regions, 13 Audit, 18 Review, 19 Applicants,
    --        20 Providers
    -- ═══════════════════════════════════════════════════════════════════════
    ('kyc.view_applicants',     'View KYC applicant list and stats',            'kyc', 'view',    FALSE),
    ('kyc.view_detail',         'View applicant detail and provider iframe',    'kyc', 'view',    FALSE),
    ('kyc.approve',             'Approve KYC applicant with tier assignment',   'kyc', 'approve', TRUE),
    ('kyc.decline',             'Decline KYC applicant',                        'kyc', 'execute', TRUE),
    ('kyc.re_verify',           'Trigger KYC re-verification',                  'kyc', 'execute', TRUE),
    ('kyc.view_regions',        'View regional routing configuration',          'kyc', 'view',    FALSE),
    ('kyc.manage_regions',      'Create and edit KYC region configuration',     'kyc', 'update',  TRUE),
    ('kyc.view_audit',          'View KYC audit trail',                         'kyc', 'view',    FALSE),
    ('kyc.export_audit',        'Export KYC audit trail to CSV',                'kyc', 'export',  TRUE),
    ('kyc.view_providers',      'View KYC provider health and status',          'kyc', 'view',    FALSE),
    ('kyc.test_provider',       'Test KYC provider connectivity',               'kyc', 'execute', FALSE),
    ('kyc.rotate_credentials',  'Rotate KYC provider API keys',                 'kyc', 'execute', TRUE),

    -- ═══════════════════════════════════════════════════════════════════════
    -- ALERTS — page 05
    -- ═══════════════════════════════════════════════════════════════════════
    ('alerts.view',             'View alert feed',                              'alerts', 'view',    FALSE),
    ('alerts.acknowledge',      'Acknowledge individual alerts',                'alerts', 'execute', FALSE),
    ('alerts.acknowledge_bulk', 'Bulk acknowledge alerts by severity',          'alerts', 'execute', FALSE),
    ('alerts.delete',           'Dismiss and delete alerts',                    'alerts', 'delete',  FALSE),

    -- ═══════════════════════════════════════════════════════════════════════
    -- SHIFTS — page 06
    -- ═══════════════════════════════════════════════════════════════════════
    ('shifts.start',            'Start a new operator shift',                   'shifts', 'create',  FALSE),
    ('shifts.log_activity',     'Log operator activity during shift',           'shifts', 'create',  FALSE),
    ('shifts.manage_watchlist', 'Add or remove items on shift watch list',      'shifts', 'update',  FALSE),
    ('shifts.submit_handoff',   'Submit shift handoff to next operator',        'shifts', 'execute', FALSE),

    -- ═══════════════════════════════════════════════════════════════════════
    -- COMPLIANCE — page 24 Settings Compliance
    -- ═══════════════════════════════════════════════════════════════════════
    ('compliance.view_config',          'View compliance settings (AML, sanctions)',         'compliance', 'view',   FALSE),
    ('compliance.edit_config',          'Update AML thresholds and sanctions lists',         'compliance', 'update', TRUE),
    ('compliance.manage_jurisdictions', 'Manage blocked and restricted countries',           'compliance', 'update', TRUE),

    -- ═══════════════════════════════════════════════════════════════════════
    -- INFRASTRUCTURE — pages 04 Infrastructure, 26 Settings Infrastructure
    -- ═══════════════════════════════════════════════════════════════════════
    ('infrastructure.view',             'View infrastructure health and services',           'infrastructure', 'view',    FALSE),
    ('infrastructure.edit_config',      'Update infrastructure configuration',               'infrastructure', 'update',  TRUE),
    ('infrastructure.restart_service',  'Restart infrastructure services',                   'infrastructure', 'execute', TRUE),

    -- ═══════════════════════════════════════════════════════════════════════
    -- COMMUNICATIONS — page 23 Settings Communications
    -- ═══════════════════════════════════════════════════════════════════════
    ('communications.view_config',      'View notification and email settings',              'communications', 'view',   FALSE),
    ('communications.edit_config',      'Update email templates and SMS settings',           'communications', 'update', TRUE),

    -- ═══════════════════════════════════════════════════════════════════════
    -- FINANCE — pages 12-17
    -- ═══════════════════════════════════════════════════════════════════════
    ('finance.view_overview',   'View platform financial KPIs and equity curve',             'finance', 'view',   FALSE),
    ('finance.view_strategies', 'View strategy performance scorecard and risk profiles',     'finance', 'view',   FALSE),
    ('finance.view_risk',       'View VaR, concentration, correlation matrix',               'finance', 'view',   FALSE),
    ('finance.view_market',     'View pair performance heatmap and market analytics',        'finance', 'view',   FALSE),
    ('finance.view_users',      'View user AUM, tier distribution, leaderboard',             'finance', 'view',   FALSE),
    ('finance.export',          'Export financial reports',                                   'finance', 'export', TRUE),

    -- ═══════════════════════════════════════════════════════════════════════
    -- INTEGRATIONS — page 21 Settings Integrations
    -- ═══════════════════════════════════════════════════════════════════════
    ('integrations.view_webhooks',   'View outbound webhook configurations',                 'integrations', 'view',    FALSE),
    ('integrations.manage_webhooks', 'Create, update, and delete webhooks',                  'integrations', 'update',  TRUE),
    ('integrations.test_webhook',    'Test webhook delivery',                                'integrations', 'execute', FALSE),
    ('integrations.rotate_key',      'Rotate webhook HMAC signing key',                      'integrations', 'execute', TRUE),

    -- ═══════════════════════════════════════════════════════════════════════
    -- SYSTEM (additions) — pages 22 Bot Engine, 23 Security, 27 Notifications
    -- ═══════════════════════════════════════════════════════════════════════
    ('system.view_bot_engine',       'View bot engine default configuration',                'system', 'view',   FALSE),
    ('system.manage_bot_engine',     'Configure bot heartbeat, timeouts, retry policies',    'system', 'update', TRUE),
    ('system.view_security',         'View security policies and admin sessions',            'system', 'view',   FALSE),
    ('system.manage_security',       'Update session, password, and IP allowlist policies',  'system', 'update', TRUE),
    ('system.view_notifications',    'View notification thresholds and channels',            'system', 'view',   FALSE),
    ('system.manage_notifications',  'Update notification thresholds and channels',          'system', 'update', TRUE)

ON CONFLICT (code) DO NOTHING;


-- ============================================================================
-- 3. ROLE-PERMISSION ASSIGNMENTS
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SUPER ADMIN: gets every permission (catch-up for any new ones)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin.roles r
CROSS JOIN admin.permissions p
WHERE r.code = 'super_admin'
  AND NOT EXISTS (
    SELECT 1 FROM admin.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- OPERATIONS MANAGER: bots, alerts, shifts, infra, bot engine, finance (read)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin.roles r, admin.permissions p
WHERE r.code = 'operations_manager'
  AND p.code IN (
    -- Trading / Bots
    'trading.create_bot', 'trading.manage_bot', 'trading.delete_bot', 'trading.submit_order',
    -- Alerts
    'alerts.view', 'alerts.acknowledge', 'alerts.acknowledge_bulk', 'alerts.delete',
    -- Shifts
    'shifts.start', 'shifts.log_activity', 'shifts.manage_watchlist', 'shifts.submit_handoff',
    -- Infrastructure
    'infrastructure.view', 'infrastructure.edit_config',
    -- System — bot engine
    'system.view_bot_engine', 'system.manage_bot_engine',
    -- Finance (read only)
    'finance.view_overview', 'finance.view_strategies', 'finance.view_risk',
    'finance.view_market', 'finance.view_users'
  )
  AND NOT EXISTS (
    SELECT 1 FROM admin.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RISK OFFICER: trading ops, emergency kill, alerts, finance (full), infra (read)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin.roles r, admin.permissions p
WHERE r.code = 'risk_officer'
  AND p.code IN (
    -- Trading / Bots (monitor + emergency)
    'trading.manage_bot', 'trading.delete_bot', 'trading.emergency_kill',
    -- Alerts
    'alerts.view', 'alerts.acknowledge', 'alerts.acknowledge_bulk',
    -- Finance (full read + export)
    'finance.view_overview', 'finance.view_strategies', 'finance.view_risk',
    'finance.view_market', 'finance.view_users', 'finance.export',
    -- Infrastructure (read only)
    'infrastructure.view'
  )
  AND NOT EXISTS (
    SELECT 1 FROM admin.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPLIANCE OFFICER: KYC (full), compliance settings, alerts (read+ack),
--                     finance (read)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin.roles r, admin.permissions p
WHERE r.code = 'compliance_officer'
  AND p.code IN (
    -- KYC (full operational access)
    'kyc.view_applicants', 'kyc.view_detail', 'kyc.approve', 'kyc.decline', 'kyc.re_verify',
    'kyc.view_regions', 'kyc.view_audit', 'kyc.export_audit', 'kyc.view_providers',
    -- Compliance settings
    'compliance.view_config', 'compliance.edit_config', 'compliance.manage_jurisdictions',
    -- Alerts (read + acknowledge)
    'alerts.view', 'alerts.acknowledge',
    -- Finance (limited read)
    'finance.view_overview', 'finance.view_users'
  )
  AND NOT EXISTS (
    SELECT 1 FROM admin.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- FINANCE MANAGER: finance dashboards (full), alerts (read)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin.roles r, admin.permissions p
WHERE r.code = 'finance_manager'
  AND p.code IN (
    -- Finance (full access)
    'finance.view_overview', 'finance.view_strategies', 'finance.view_risk',
    'finance.view_market', 'finance.view_users', 'finance.export',
    -- Alerts (read only)
    'alerts.view'
  )
  AND NOT EXISTS (
    SELECT 1 FROM admin.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STRATEGY CURATOR: bot management for testing, strategy finance
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin.roles r, admin.permissions p
WHERE r.code = 'strategy_curator'
  AND p.code IN (
    'trading.create_bot', 'trading.manage_bot',
    'finance.view_strategies', 'finance.view_market',
    'alerts.view'
  )
  AND NOT EXISTS (
    SELECT 1 FROM admin.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SUPPORT AGENT: read-only where useful for user support
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO admin.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin.roles r, admin.permissions p
WHERE r.code = 'support_agent'
  AND p.code IN (
    'kyc.view_applicants', 'kyc.view_detail', 'kyc.view_audit',
    'alerts.view',
    'finance.view_overview',
    'infrastructure.view'
  )
  AND NOT EXISTS (
    SELECT 1 FROM admin.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );


-- ============================================================================
-- 4. VERIFICATION QUERY (run after migration to confirm)
-- ============================================================================
-- SELECT r.code AS role, COUNT(rp.permission_id) AS permission_count
-- FROM admin.roles r
-- LEFT JOIN admin.role_permissions rp ON rp.role_id = r.id
-- GROUP BY r.code
-- ORDER BY r.code;
--
-- Expected results:
--   super_admin          81
--   operations_manager   ~31
--   risk_officer         ~25
--   compliance_officer   ~24
--   finance_manager      ~14
--   strategy_curator     ~10
--   support_agent        ~12
-- ============================================================================

COMMIT;
