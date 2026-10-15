# Stella Admin: Critical Features Priority List

**Date:** 2026-02-18
**Purpose:** Urgent features for production-ready admin dashboard with shift-based monitoring
**Context:** Based on Hummingbot comparison and operational requirements

---

## Executive Summary

**Current Status:** Phase 0 (Foundation) complete - Admin auth & user management working

**Critical Gap:** Missing real-time operational monitoring features required for 24/7 shift-based bot oversight

**Recommendation:** Implement 4 new critical phases BEFORE continuing with original roadmap

---

## 🔥 CRITICAL ADDITIONS (Must Have for Launch)

### **NEW Phase 3.4: Shift Handoff System**
**Priority:** CRITICAL | **Estimated Time:** 3 days | **Dependencies:** Phase 3.1, 3.2

**Problem:** Engineers working in shifts need context when taking over monitoring. Without snapshots, incoming shift has no visibility into:
- What happened during previous shift
- Current platform health state
- Outstanding issues/alerts
- P&L changes since last shift

**Solution:** Automated shift handoff snapshots with comparison tools

#### Implementation Tasks

**Context Layer:**
```
- [ ] Create `lib/stella_admin/shifts.ex` context
- [ ] Create `lib/stella_admin/shifts/shift.ex` schema
  - shift_id (UUID)
  - started_at, ended_at
  - admin_user_id (who was monitoring)
  - snapshot_data (JSONB)
  - handoff_notes (text)
  - acknowledged_at, acknowledged_by

- [ ] Create `lib/stella_admin/shifts/shift_snapshot.ex` schema
  - snapshot_id (UUID)
  - shift_id (FK)
  - captured_at
  - total_platform_equity_usd
  - active_bots_count
  - open_positions_count
  - total_positions_value_usd
  - unrealized_pnl_usd
  - alert_count (by severity)
  - top_issues (JSONB array)
  - system_health (JSONB - CPU, RAM, services)
```

**Functions:**
```
- [ ] Implement `create_shift/2` - Start new shift
- [ ] Implement `end_shift/3` - End shift with handoff notes
- [ ] Implement `capture_shift_snapshot/1` - Takes platform snapshot
  - Query total equity across all users
  - Count active bots (by status)
  - Count open positions + aggregate value
  - Calculate unrealized P&L
  - Get active alerts (grouped by severity)
  - Get infrastructure metrics (CPU, RAM, services)
  - Store as JSONB for fast retrieval

- [ ] Implement `list_shifts/1` - Filter by date range, admin
- [ ] Implement `get_shift_comparison/2` - Compare two shifts
- [ ] Implement `acknowledge_shift/2` - Incoming shift confirms review
- [ ] Implement `get_current_shift/0` - Active shift
- [ ] Implement `schedule_shift_change/2` - Auto-trigger at configured times
```

**LiveView:**
```
- [ ] Create `lib/stella_admin_web/live/shifts/shift_handoff_live.ex`
- [ ] Display current shift info (who's monitoring, started at)
- [ ] Display real-time platform metrics
- [ ] "End Shift" button → opens handoff notes modal
- [ ] Handoff notes form (text area for issues, warnings, todos)
- [ ] Submit → creates snapshot, ends shift, notifies next shift
- [ ] Show previous shift snapshot side-by-side with current
- [ ] Highlight deltas (equity change, bot count change, new alerts)
- [ ] Acknowledgment workflow (incoming shift must acknowledge)
```

**Scheduled Jobs:**
```
- [ ] Create `lib/stella_admin/shifts/scheduler.ex`
- [ ] Use Oban or Quantum for scheduled jobs
- [ ] Configure shift change times (e.g., 8am, 4pm, 12am)
- [ ] Auto-capture snapshot at shift boundaries
- [ ] Send notification to incoming shift (Slack, email)
```

**Routes:**
```
- [ ] Add `live "/shifts", Shifts.ShiftHandoffLive`
- [ ] Add `live "/shifts/history", Shifts.HistoryLive`
- [ ] Add `live "/shifts/:id", Shifts.DetailLive`
```

**Testing:**
```
- [ ] Test shift creation and snapshot capture
- [ ] Test shift comparison (delta calculations)
- [ ] Test scheduled shift changes
- [ ] Test acknowledgment workflow
- [ ] Test with missing data (graceful degradation)
```

**Permissions:**
```
- shifts.view (all admins)
- shifts.manage (ops managers, super admin)
- shifts.acknowledge (all admins)
```

---

### **NEW Phase 12.3: Infrastructure Monitoring**
**Priority:** CRITICAL | **Estimated Time:** 4 days | **Dependencies:** None

**Problem:** No visibility into infrastructure health. Bots could crash due to resource exhaustion without warning. Need alerts at 60% CPU/RAM usage.

**Solution:** Real-time infrastructure metrics with configurable alerts

#### Implementation Tasks

**Context Layer:**
```
- [ ] Create `lib/stella_admin/infrastructure.ex` context
- [ ] Create `lib/stella_admin/infrastructure/metric.ex` schema
  - metric_id (UUID)
  - service_name (phoenix, postgres, rabbitmq, redis, trading_bot)
  - metric_type (cpu_percent, ram_percent, disk_percent, network_io)
  - value (float)
  - threshold_status (normal, warning, critical)
  - captured_at
  - metadata (JSONB - additional context)

- [ ] Create `lib/stella_admin/infrastructure/alert_threshold.ex` schema
  - threshold_id (UUID)
  - service_name
  - metric_type
  - warning_threshold (float - e.g., 60.0)
  - critical_threshold (float - e.g., 85.0)
  - enabled (boolean)
  - notification_channels (array - slack, email, pagerduty)
```

**Metric Collection Strategies:**
```
Option 1: Docker Stats (if Coolify exposes containers)
- [ ] Implement `collect_docker_stats/0`
- [ ] Parse `docker stats --no-stream --format json`
- [ ] Extract CPU%, MemUsage%, NetIO, BlockIO per container

Option 2: System Commands
- [ ] Implement `collect_system_metrics/0`
- [ ] Use System.cmd("ps", ["-o", "pcpu,pmem"]) for processes
- [ ] Use System.cmd("free", ["-m"]) for RAM
- [ ] Use System.cmd("df", ["-h"]) for disk

Option 3: BEAM Metrics (for Phoenix app itself)
- [ ] Use :recon.node_stats_list/2
- [ ] Use :erlang.memory()
- [ ] Use :erlang.statistics(:scheduler_wall_time)

Option 4: Prometheus Integration (RECOMMENDED)
- [ ] Add {:prom_ex, "~> 1.9"} to mix.exs
- [ ] Configure PromEx with Phoenix, Ecto, Oban instrumentation
- [ ] Query Prometheus for metrics
- [ ] Embed Grafana dashboards in iframes

Option 5: Coolify API
- [ ] Check if Coolify exposes REST API for metrics
- [ ] Use HTTPoison to fetch metrics
- [ ] Parse and store in TimescaleDB
```

**Functions:**
```
- [ ] Implement `collect_metrics/0` - Runs every 30 seconds
- [ ] Implement `store_metric/4` - Write to TimescaleDB
- [ ] Implement `check_thresholds/1` - Compare against alert thresholds
- [ ] Implement `trigger_alert/2` - Create alert if threshold breached
- [ ] Implement `get_current_metrics/0` - Latest values per service
- [ ] Implement `get_metric_history/3` - Time-series data for charts
- [ ] Implement `list_alert_thresholds/0`
- [ ] Implement `update_alert_threshold/3`
- [ ] Implement `get_infrastructure_health_summary/0` - For dashboard
```

**GenServer for Continuous Monitoring:**
```
- [ ] Create `lib/stella_admin/infrastructure/monitor.ex` GenServer
- [ ] Start on application boot (add to supervision tree)
- [ ] handle_info(:collect, state) - runs every 30s
- [ ] Collect metrics from all sources
- [ ] Check thresholds
- [ ] Broadcast updates via PubSub
- [ ] Create alerts if needed
- [ ] Schedule next collection
```

**LiveView:**
```
- [ ] Create `lib/stella_admin_web/live/infrastructure/monitor_live.ex`
- [ ] Subscribe to "infrastructure_updates" PubSub topic
- [ ] Display service status cards (Phoenix, Postgres, RabbitMQ, Redis, Bots)
- [ ] Show current CPU%, RAM%, Disk% with color coding:
  - Green: < warning threshold
  - Yellow: >= warning, < critical
  - Red: >= critical threshold
- [ ] Real-time charts (ApexCharts line charts):
  - CPU usage over last hour
  - RAM usage over last hour
  - Network I/O
- [ ] Alert history table (last 24 hours)
- [ ] Threshold configuration panel
- [ ] "Test Alert" button for each notification channel
```

**Alert Integration:**
```
- [ ] Create `lib/stella_admin/infrastructure/notifier.ex`
- [ ] Implement `notify_slack/2` - Post to Slack webhook
- [ ] Implement `notify_email/2` - Send via Swoosh
- [ ] Implement `notify_pagerduty/2` - For critical production alerts
- [ ] Include: service name, metric, current value, threshold, timestamp
- [ ] Auto-resolve alerts when metric drops below threshold
```

**Routes:**
```
- [ ] Add `live "/infrastructure/monitor", Infrastructure.MonitorLive`
- [ ] Add `live "/infrastructure/alerts", Infrastructure.AlertsLive`
- [ ] Add `live "/infrastructure/thresholds", Infrastructure.ThresholdsLive`
```

**Database Migration:**
```
- [ ] Create TimescaleDB hypertable for infrastructure.metrics
- [ ] Partition by captured_at (time-series optimization)
- [ ] Create retention policy (keep 30 days, aggregate older data)
- [ ] Create indexes on service_name, metric_type, captured_at
```

**Testing:**
```
- [ ] Test metric collection from all sources
- [ ] Test threshold breach detection
- [ ] Test alert notifications (Slack, email)
- [ ] Test real-time updates in LiveView
- [ ] Test with simulated high load
- [ ] Test alert resolution when metric normalizes
```

**Permissions:**
```
- system.view_health (all admins)
- system.configure_alerts (ops managers, super admin)
```

---

### **EXPAND Phase 3.1: Live Trading Monitor (Add Kill Switch)**
**Priority:** CRITICAL | **Estimated Time:** +2 days to original estimate

**Current Plan (from checklist):**
- ✅ List active bots with filters
- ✅ Force stop single bot
- ✅ Force stop user's bots
- ✅ Emergency stop all (super admin)

**EXPAND WITH:**

#### Bot Heartbeat Monitoring
```
- [ ] Add `last_heartbeat_at` to trading.bots table
- [ ] Bot sends heartbeat every 10 seconds via RabbitMQ
- [ ] Monitor consumes heartbeats, updates DB
- [ ] Dashboard shows "Last Seen" with color:
  - Green: < 30s ago
  - Yellow: 30-60s ago
  - Red: > 60s ago (presumed dead)
- [ ] Auto-alert if bot heartbeat missing > 2 minutes
```

#### Performance Metrics (Real-Time)
```
- [ ] Display per-bot on live monitor:
  - Trades today
  - Win rate % (wins / total trades)
  - Current drawdown % (from peak equity)
  - P&L today (USD)
  - Avg trade duration
  - Current positions count
- [ ] Color-code bots by health:
  - Green: Profitable, low drawdown, healthy heartbeat
  - Yellow: Break-even or minor drawdown
  - Red: Losing, high drawdown, or stale heartbeat
```

#### Kill Switch Enhancements
```
- [ ] Add "Kill Switch Reason" dropdown:
  - Market conditions (high volatility)
  - Exchange issues (API down)
  - Risk limit breach
  - Suspected bug
  - Manual testing
  - Other (free text)
- [ ] Require reason for force stop (audit trail)
- [ ] Add "Pause" option (stop trading, keep positions open)
- [ ] Add "Resume" option (restart paused bot)
- [ ] Emergency kill all → requires confirmation modal:
  - Shows count of bots affected
  - Shows total open positions value
  - Requires "I understand" checkbox
  - Requires reason
  - Logs to audit with high severity
```

#### Bot Error States
```
- [ ] Display bot errors prominently:
  - Last error message
  - Error count (last 24h)
  - Error timestamp
- [ ] Filter by error state:
  - Healthy
  - Warning (1-5 errors/day)
  - Critical (>5 errors/day or repeated errors)
```

---

### **EXPAND Phase 10.1: Real-Time Alert System**
**Priority:** CRITICAL | **Estimated Time:** +3 days to original estimate

**Current Plan (from checklist):**
- ✅ List user alerts
- ✅ Get alert statistics

**EXPAND WITH:**

#### Alert Categories & Severity
```
- [ ] Update monitoring.monitoring_alerts schema:
  - Add severity (info, warning, critical)
  - Add category (bot_health, performance, infrastructure, security, exchange)
  - Add acknowledged_at, acknowledged_by, resolution_notes
  - Add escalated_at (if unacknowledged after threshold)

- [ ] Define alert types:
  BOT_HEALTH:
    - bot_error (critical)
    - bot_offline (critical - no heartbeat > 2min)
    - bot_idle (warning - no trades in expected timeframe)
    - exchange_disconnect (critical)

  PERFORMANCE:
    - drawdown_warning (warning - > 5% from peak)
    - drawdown_critical (critical - > 10% from peak)
    - losing_streak (warning - 5+ consecutive losses)
    - strategy_drift (warning - performance deviating from backtest)

  INFRASTRUCTURE:
    - high_cpu (warning - > 60%)
    - critical_cpu (critical - > 85%)
    - high_ram (warning - > 60%)
    - critical_ram (critical - > 85%)
    - db_slow_query (warning - query > 5s)
    - service_down (critical - health check failed)

  SECURITY:
    - failed_login_spike (warning - 5+ failed logins in 1 min)
    - suspicious_api_activity (warning - unusual patterns)
    - unauthorized_access_attempt (critical)

  EXCHANGE:
    - rate_limit_hit (warning)
    - exchange_api_down (critical)
    - invalid_credentials (critical)
```

#### Real-Time Alert Streaming
```
- [ ] Create GenServer for alert broadcasting
- [ ] Publish alerts to PubSub "platform_alerts" topic
- [ ] LiveView subscribes to alerts
- [ ] Display toast notifications (top-right corner):
  - Info: Blue background, auto-dismiss 5s
  - Warning: Yellow background, auto-dismiss 10s
  - Critical: Red background, stays until acknowledged
- [ ] Play sound for critical alerts (optional, user pref)
- [ ] Browser notification API for critical alerts (if tab inactive)
```

#### Alert Acknowledgment Workflow
```
- [ ] Alerts table shows:
  - Status badge (new, acknowledged, resolved, escalated)
  - Severity badge
  - Timestamp
  - Alert type
  - Description
  - Affected resource (bot_id, user_id, service_name)
  - "Acknowledge" button

- [ ] Acknowledge modal:
  - Shows full alert context
  - Requires resolution notes (what did you do?)
  - "Mark Resolved" vs "Acknowledge (monitoring)"
  - Logs to audit (who acknowledged, when, notes)
```

#### Alert Escalation
```
- [ ] Background job checks unacknowledged alerts every 1 min
- [ ] If critical alert unacknowledged > 5 minutes:
  - Mark as escalated
  - Send notification to supervisor role
  - Optionally trigger PagerDuty (production only)
- [ ] Escalation chain:
  - 0 min: In-app notification to current shift admin
  - 5 min: Slack notification to ops-team channel
  - 10 min: Email to ops manager
  - 15 min: PagerDuty incident (production only)
```

#### Multi-Channel Notifications
```
- [ ] Create `lib/stella_admin/monitoring/alert_notifier.ex`
- [ ] Implement channel integrations:

  In-App (always enabled):
  - [ ] PubSub broadcast to LiveView
  - [ ] Toast notification
  - [ ] Alerts table updates

  Slack (configurable per severity):
  - [ ] Post to #stella-alerts channel
  - [ ] Format: severity emoji, alert type, description, link to dashboard
  - [ ] Thread replies for acknowledgments

  Email (critical only):
  - [ ] Send to ops team distribution list
  - [ ] Subject: [CRITICAL] Alert description
  - [ ] Body: Full context, direct link to alert detail

  SMS/PagerDuty (production critical only):
  - [ ] Trigger incident with full context
  - [ ] Include runbook link if available
```

#### Alert Dashboard
```
- [ ] Create `lib/stella_admin_web/live/monitoring/alerts_live.ex`
- [ ] Tabs:
  - Active Alerts (new, acknowledged)
  - Resolved Alerts
  - Alert History (all)
- [ ] Filters:
  - Severity (info, warning, critical)
  - Category (bot_health, performance, etc.)
  - Status (new, acknowledged, resolved, escalated)
  - Date range
- [ ] Real-time updates (new alerts appear instantly)
- [ ] Bulk acknowledgment (select multiple, acknowledge all)
- [ ] Alert analytics:
  - Alerts by severity (donut chart)
  - Alerts by category (bar chart)
  - Alerts over time (line chart)
  - Top alert types
  - Average time to acknowledge
```

#### Alert Configuration
```
- [ ] Admin settings page for alert thresholds
- [ ] Configure per alert type:
  - Enabled/disabled
  - Severity level
  - Notification channels
  - Escalation timeout
- [ ] Test alert button (sends test notification to all channels)
```

---

### **NEW Phase 3.5: Paper Trading Mode**
**Priority:** CRITICAL | **Estimated Time:** 3 days | **Dependencies:** Phase 3.1

**Problem:** Users need safe environment to test strategies without risking real capital. Critical for onboarding and strategy validation.

**Solution:** Simulated trading mode with separate P&L tracking

#### Implementation Tasks

**Schema Updates:**
```
- [ ] Add to trading.user_strategies:
  - is_paper_trading (boolean, default false)
  - paper_trading_started_at (timestamp)
  - paper_trading_expires_at (timestamp, auto-set to +30 days)

- [ ] Add to trading.orders:
  - is_paper_trade (boolean, default false)

- [ ] Add to trading.fills:
  - is_paper_trade (boolean, default false)

- [ ] Add to trading.positions:
  - is_paper_trade (boolean, default false)
```

**Execution Logic:**
```
- [ ] Create `lib/stella_trading/executors/paper_executor.ex`
- [ ] Implement paper trading execution:
  - Simulate order placement (no exchange API call)
  - Use real market prices from market_data.candles_1m
  - Simulate realistic fills:
    - Market orders: instant fill at current price
    - Limit orders: fill when price touches limit
  - Add simulated slippage (0.1-0.3%)
  - Add simulated fees (exchange fee schedule)
  - Store as regular orders/fills/positions with is_paper_trade=true

- [ ] Refactor SignalTrader to check is_paper_trading:
  ```elixir
  def execute_signal(strategy, signal) do
    executor = if strategy.is_paper_trading do
      PaperExecutor
    else
      LiveExecutor
    end

    executor.place_order(strategy, signal)
  end
  ```
```

**P&L Separation:**
```
- [ ] Separate equity snapshots for paper vs live
- [ ] Dashboard shows two equity charts:
  - Live Trading Performance
  - Paper Trading Performance (with ⚠️ SIMULATED badge)
- [ ] User profile shows both:
  - Live P&L
  - Paper P&L (grayed out, labeled "Simulated")
```

**UI Indicators:**
```
- [ ] Strategy card shows "⚠️ PAPER MODE" badge if paper trading
- [ ] Bot status shows "PAPER" label
- [ ] Order history shows "Simulated" tag
- [ ] Position table shows "Paper" indicator column
```

**Auto-Expiration:**
```
- [ ] Background job runs daily
- [ ] Check for paper strategies with expired paper_trading_expires_at
- [ ] Auto-disable paper trading OR auto-pause strategy
- [ ] Notify user: "Your paper trading period expired. Switch to live or extend."
```

**Graduation to Live:**
```
- [ ] "Switch to Live Trading" button on strategy page
- [ ] Requires confirmation modal:
  - Shows paper trading results
  - Warns about real capital risk
  - Requires "I understand" checkbox
- [ ] On confirm:
  - Set is_paper_trading = false
  - Close all paper positions (simulated exit)
  - Reset starting_capital to real allocation
  - Log to audit
```

**Testing:**
```
- [ ] Test paper order execution (market, limit)
- [ ] Test paper position lifecycle (open → close)
- [ ] Test P&L calculations match live logic
- [ ] Test paper/live separation in queries
- [ ] Test auto-expiration job
- [ ] Test graduation to live trading
```

**Permissions:**
```
- users.enable_paper_trading (self-service for all users)
- users.extend_paper_trading (admin only)
```

---

### **NEW Phase 3.6: Performance Analytics Dashboard**
**Priority:** HIGH | **Estimated Time:** 4 days | **Dependencies:** Phase 3.1, 3.2

**Problem:** Need comprehensive performance metrics beyond basic P&L to evaluate strategy effectiveness. Users and admins need to see Sharpe ratio, max drawdown, win rate, etc.

**Solution:** Advanced analytics dashboard with industry-standard metrics

#### Implementation Tasks

**Context Layer:**
```
- [ ] Create `lib/stella_admin/analytics.ex` context
- [ ] Implement performance calculation functions:

  Risk-Adjusted Returns:
  - [ ] `calculate_sharpe_ratio/2` - (avg return - risk-free rate) / std dev
  - [ ] `calculate_sortino_ratio/2` - only penalizes downside volatility
  - [ ] `calculate_calmar_ratio/2` - annual return / max drawdown

  Drawdown Metrics:
  - [ ] `calculate_max_drawdown/1` - largest peak-to-trough decline
  - [ ] `calculate_max_drawdown_duration/1` - longest underwater period
  - [ ] `calculate_current_drawdown/1` - current decline from peak

  Win/Loss Metrics:
  - [ ] `calculate_win_rate/1` - winning trades / total trades
  - [ ] `calculate_profit_factor/1` - gross profit / gross loss
  - [ ] `calculate_avg_win_loss/1` - avg win size vs avg loss size
  - [ ] `calculate_expectancy/1` - expected value per trade

  Streak Analysis:
  - [ ] `calculate_win_streak/1` - current/max consecutive wins
  - [ ] `calculate_loss_streak/1` - current/max consecutive losses

  Trade Distribution:
  - [ ] `calculate_avg_hold_time/1`
  - [ ] `calculate_best_worst_trades/1`
  - [ ] `get_hourly_performance/1` - which hours are most profitable
  - [ ] `get_pair_performance/1` - performance by trading pair
  - [ ] `get_monthly_returns/1` - returns by month
```

**Analytics Schema:**
```
- [ ] Create `lib/stella_admin/analytics/performance_snapshot.ex`
  - snapshot_id (UUID)
  - user_id OR strategy_id OR bot_id (polymorphic)
  - snapshot_type (user, strategy, bot, platform)
  - period_start, period_end
  - metrics (JSONB):
    - total_return_pct
    - annualized_return_pct
    - sharpe_ratio
    - sortino_ratio
    - max_drawdown_pct
    - win_rate_pct
    - profit_factor
    - total_trades
    - avg_hold_time_minutes
    - best_trade_pct
    - worst_trade_pct
  - captured_at

- [ ] Create TimescaleDB hypertable for time-series snapshots
- [ ] Retention policy: keep daily snapshots for 1 year
```

**Scheduled Calculation:**
```
- [ ] Create Oban job: `Analytics.CalculatePerformanceJob`
- [ ] Run daily at midnight
- [ ] Calculate snapshots for:
  - Each active user
  - Each active strategy
  - Each active bot
  - Platform aggregate
- [ ] Store in performance_snapshots table
```

**LiveView:**
```
- [ ] Create `lib/stella_admin_web/live/analytics/performance_live.ex`
- [ ] Filters:
  - User (dropdown or search)
  - Strategy (dropdown)
  - Bot (dropdown)
  - Time period (7d, 30d, 90d, 1y, all-time)

- [ ] Metrics Overview (stat cards):
  - Total Return %
  - Annualized Return %
  - Sharpe Ratio (with rating: >2 excellent, >1 good, <1 poor)
  - Max Drawdown %
  - Win Rate %
  - Profit Factor

- [ ] Charts:
  - Equity Curve (line chart with drawdown shading)
  - Monthly Returns (bar chart)
  - Win/Loss Distribution (histogram)
  - Hourly Performance Heatmap (which hours are profitable)
  - Trade Duration Distribution

- [ ] Trade Analysis Table:
  - Best 10 trades (largest winners)
  - Worst 10 trades (largest losers)
  - Longest winning streak
  - Longest losing streak

- [ ] Pair Performance Table:
  - Each trading pair
  - Trades, Win Rate, P&L, Avg Hold Time
  - Sortable
```

**Comparison View:**
```
- [ ] "Compare Strategies" feature
- [ ] Select 2-4 strategies/bots
- [ ] Show metrics side-by-side
- [ ] Overlay equity curves on one chart
- [ ] Highlight best performer per metric
```

**Export:**
```
- [ ] Export performance report as PDF
- [ ] Include all charts as images
- [ ] Include detailed metrics table
- [ ] Add disclaimer footer
```

**Testing:**
```
- [ ] Test calculations with real trading data
- [ ] Test edge cases (no trades, all losses, all wins)
- [ ] Test daily snapshot job
- [ ] Verify calculation accuracy vs known formulas
- [ ] Test comparison view with multiple strategies
```

**Permissions:**
```
- analytics.view_own (users can see their own)
- analytics.view_all (admins can see all users)
- analytics.export (admins only)
```

---

## 🔄 REVISED IMPLEMENTATION PRIORITY

### **Phase 0: Foundation** ✅ COMPLETE
- Admin authentication
- User management
- KYC review

### **CRITICAL PATH (Weeks 1-3):**

**Week 1:**
1. ✅ Phase 3.1: Live Trading Monitor (expand with heartbeat, kill switch)
2. 🆕 Phase 3.5: Paper Trading Mode
3. 🆕 Phase 12.3: Infrastructure Monitoring (start setup)

**Week 2:**
4. 🆕 Phase 12.3: Infrastructure Monitoring (complete)
5. 🆕 Phase 3.4: Shift Handoff System
6. Phase 3.2: Position Viewer

**Week 3:**
7. 🔄 Phase 10.1: Real-Time Alert System (expanded)
8. 🆕 Phase 3.6: Performance Analytics Dashboard
9. Phase 4.1: Risk Dashboard

### **HIGH PRIORITY (Weeks 4-5):**
10. Phase 1.1: Dashboard Overview
11. Phase 4.2: Risk Limits Configuration
12. Phase 4.3: Circuit Breaker Management
13. Phase 3.3: Order & Fill History
14. Phase 7.1: Subscription Management
15. Phase 8.3: Pool Withdrawal Approvals
16. Phase 11.2: Audit Log Viewer

### **MEDIUM PRIORITY (Weeks 6-8):**
17. Phase 5.1: Exchange Adapters
18. Phase 6.1: Core Strategy Management
19. Phase 6.3: Backtest Results (upgraded from LOW)
20. Phase 7.2: Invoice Management
21. Phase 8.1: Pool Wallet Overview
22. Phase 12.1: Service Health Monitor

### **LOW PRIORITY (Post-Launch):**
23. Phase 6.2: Marketplace Approval
24. Phase 7.3: Payment Tracking
25. Phase 9.1: Prediction Accuracy
26. Phase 11.1: Platform Reports

### **REMOVED:**
- ❌ Content Moderation (not in schema)
- ❌ Prediction Explorer (dev tool)
- ❌ Phase 12.2: System Config UI (use env vars)

---

## 📊 Estimated Timeline

**Total Time (Critical + High Priority):** 9 weeks

- Critical Path: 3 weeks
- High Priority: 2 weeks
- Medium Priority: 3 weeks
- Low Priority: 3+ weeks (post-launch)

**Target Launch Date:** Week 5 (Critical + High features complete)

**Full Feature Set:** Week 9

---

## 🎯 Success Criteria (Launch Readiness)

### **Must Have (Week 5):**
- [x] Phase 0: Admin auth working
- [ ] Real-time bot monitoring with kill switch
- [ ] Infrastructure alerts (CPU/RAM thresholds)
- [ ] Shift handoff snapshots
- [ ] Real-time alert system with notifications
- [ ] Paper trading mode
- [ ] Position management
- [ ] Risk limits enforced
- [ ] KYC approval workflow
- [ ] Subscription management
- [ ] Pool withdrawal approvals

### **Nice to Have (Week 9):**
- [ ] Performance analytics dashboard
- [ ] Exchange adapter management
- [ ] Core strategy management
- [ ] Backtest results viewer
- [ ] Comprehensive audit logs

---

## 📝 Notes

**Key Architectural Decisions:**

1. **Infrastructure Monitoring:** Use PromEx + Prometheus for production-grade metrics (not System.cmd hacks)

2. **Alerting:** Multi-channel (in-app, Slack, email, PagerDuty) with escalation logic

3. **Shift Handoff:** Automated snapshots with manual handoff notes (best of both worlds)

4. **Paper Trading:** Fully integrated (same tables, flagged rows) to avoid code duplication

5. **Performance Analytics:** Calculated daily via Oban jobs, cached for fast retrieval

**Next Steps:**

1. Review this priority list with team
2. Update `IMPLEMENTATION_CHECKLIST.md` with new phases
3. Create detailed implementation guides for each new phase
4. Set up project board with week-by-week milestones
5. Begin Week 1 implementation

---

**Last Updated:** 2026-02-18
**Owner:** Development Team
**Approver:** Product/Ops
