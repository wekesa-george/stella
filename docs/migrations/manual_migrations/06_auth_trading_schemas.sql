-- =============================================================================
-- AUTH & TRADING SCHEMA ADDITIONS (5 tables)
-- =============================================================================

-- ============== AUTH SCHEMA ADDITIONS ==============

-- Table 1: auth.user_follows
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

-- Table 2: auth.user_suspensions
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

-- Table 3: auth.activity_logs
-- Note: Create ENUM first
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
        CREATE TYPE auth.activity_type AS ENUM (
            'login', 'logout', 'login_failed',
            'trade', 'withdraw', 'deposit',
            'settings_change', 'password_change', 'email_change',
            'bot_created', 'bot_started', 'bot_stopped',
            'kyc_submitted', 'kyc_approved', 'kyc_rejected',
            'account_suspended', 'account_reactivated'
        );
    END IF;
END $$;

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

-- ============== TRADING SCHEMA ADDITIONS ==============

-- Table 4: trading.bot_equity_snapshots
CREATE TABLE IF NOT EXISTS trading.bot_equity_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID NOT NULL REFERENCES trading.bots(id) ON DELETE CASCADE,
    session_id UUID,

    equity_usd DECIMAL(15,4) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    trades_count INTEGER NOT NULL DEFAULT 0,
    win_rate DECIMAL(5,2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equity_snapshots_bot_session ON trading.bot_equity_snapshots(bot_id, session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_equity_snapshots_timestamp ON trading.bot_equity_snapshots(timestamp DESC);

COMMENT ON TABLE trading.bot_equity_snapshots IS 'Time-series equity curve data for bots';
COMMENT ON COLUMN trading.bot_equity_snapshots.session_id IS 'Groups snapshots by session (reset on bot restart)';

-- Table 5: ALTER trading.alerts (add deleted_at column and indexes)
ALTER TABLE trading.alerts 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_alerts_status ON trading.alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON trading.alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON trading.alerts(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged ON trading.alerts(status, severity, triggered_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_active_by_severity ON trading.alerts(severity, triggered_at DESC)
  WHERE status = 'active' AND deleted_at IS NULL;
