# Stella Platform — Operations Framework

## Purpose

This document defines every incident type that can occur on the Stella trading platform, what triggers it, the expected operator response, and how the system should support that response. It is the source of truth for the `/dashboard/incidents` page, alert routing, and shift handoff procedures.

---

## 1. Concept Model

```
EVENT  -->  ALERT  -->  INCIDENT (if action required)
                   -->  Auto-resolved (if transient)
```

| Layer | What | Who Creates | Lifespan | Example |
|-------|------|-------------|----------|---------|
| **Event** | Raw system signal | Machine (GenServers, monitors) | Seconds — logged and forgotten | "Heartbeat tick received from bot X" |
| **Alert** | Filtered event that needs eyes | Machine (rule-based thresholds) | Minutes to hours — until acknowledged | "Bot X heartbeat lost for 60s" |
| **Incident** | Formal record requiring action/audit | System auto-opens OR operator manually opens | Days — until resolved + countersigned | "INC-2026-0042: Bot X unresponsive, kill switch activated, supervisor notified" |

**Key principle:** Not every alert becomes an incident. But every P1/P2 alert should auto-open an incident. P3/P4 alerts are acknowledged and archived unless the operator escalates.

---

## 2. Incident Classification

### Priority Levels

| Priority | Name | Response Time | Escalation | Example |
|----------|------|--------------|------------|---------|
| **P1** | Critical | Immediate (<2 min) | Auto-escalate to supervisor | Kill switch activated, rogue bot, exchange account locked |
| **P2** | High | <10 min | Supervisor notified | Risk limit breached, bot error with open positions, credential failure |
| **P3** | Medium | <30 min | Log only | API rate limit hit, service degraded, order rejection spike |
| **P4** | Low / Info | Next shift review | None | NIL shift, config change logged, strategy signal anomaly |

### Categories

| Category | Code | Description |
|----------|------|-------------|
| Rogue Bot | `rogue_bot` | Bot trading outside parameters — wrong pair, wrong direction, excessive frequency |
| Kill Switch | `kill_switch` | Emergency halt of one or all bots |
| Bot Error | `bot_error` | Bot entered error state — heartbeat lost, process crash, startup failure |
| Risk Breach | `risk_breach` | Daily loss limit, drawdown limit, or circuit breaker triggered |
| Exchange Failure | `exchange_failure` | API down, rate limited, order rejection, connection drop, credential expired |
| Position Anomaly | `position_anomaly` | Stuck position, failed close, orphaned position, P&L discrepancy |
| Order Anomaly | `order_anomaly` | Stale order, double fill, failed cancellation |
| Capital Discrepancy | `capital_discrepancy` | Virtual balance vs exchange balance mismatch, over-allocation |
| Infrastructure | `infrastructure` | DB connection loss, ETS memory, BEAM process limits, service health |
| Security | `security` | Unauthorized API access, credential exposure, suspicious activity |
| NIL Shift | `nil_shift` | Nothing happened — formal record that shift was monitored |

---

## 3. Incident Catalog — What Can Go Wrong

### 3.1 ROGUE BOT

| # | Trigger | How Detected | Auto Alert? | Priority | Operator Action |
|---|---------|-------------|-------------|----------|-----------------|
| RB-1 | Bot placing orders at >10x normal frequency | AlertPersister detects order rate spike | Yes — P1 | P1 | 1. Activate kill switch (single bot). 2. Screenshot dashboard. 3. Call supervisor. 4. Log incident with order count, time window, pairs affected. |
| RB-2 | Bot trading wrong pair (not in config) | Order symbol doesn't match bot.trading_pairs | Yes — P1 | P1 | 1. Kill switch immediately. 2. Check if orders filled — if yes, close positions manually. 3. Escalate for code review. |
| RB-3 | Bot trading wrong direction (systematic longs in downtrend or vice versa) | Manual observation or strategy signal audit | No — operator judgment | P2 | 1. Pause bot. 2. Review last 20 signals in bot_logs. 3. Compare with market data. 4. If confirmed, stop bot + open incident. |
| RB-4 | Bot ignoring stop loss / take profit | Position open beyond max_hold_minutes with no exit attempt | Partial — PositionCloseManager logs warning | P2 | 1. Manually close position via exchange. 2. Pause bot. 3. Check PositionCloseManager logs for errors. |

### 3.2 BOT LIFECYCLE

| # | Trigger | How Detected | Auto Alert? | Priority | Operator Action |
|---|---------|-------------|-------------|----------|-----------------|
| BL-1 | Heartbeat timeout (>60s) | HeartbeatTracker / BotRegistry auto-transitions to "error" | Yes — warning | P2 | 1. Check bot logs for last activity. 2. Attempt restart via API. 3. If restart fails twice, escalate. 4. Check if open positions exist — monitor for manual close. |
| BL-2 | Bot process crash | BotTradingProcess terminate callback fires | Yes — warning | P2 | 1. Check crash reason in logs. 2. Verify open positions still tracked in ETS. 3. Restart bot. 4. If crash repeats, stop bot + escalate. |
| BL-3 | Bot stuck in "initializing" | Bot never transitions to "running" after start | No — must check manually | P3 | 1. Check credential resolution. 2. Verify exchange connectivity. 3. Check strategy module loaded correctly. 4. Stop + restart. |
| BL-4 | Bot auto-start failure after deploy | BotRegistry.auto_start_bots fails for one or more bots | Yes — warning | P2 | 1. Check BotSupervisor readiness. 2. Manual start via API. 3. If persistent, check config/credentials. |
| BL-5 | Multiple bots enter error simultaneously | Cluster-wide issue — exchange down or DB failure | Yes — critical (if >2 bots) | P1 | 1. Check exchange status. 2. Check DB connectivity. 3. Do NOT restart all bots simultaneously. 4. Restart one, verify, then proceed. |

### 3.3 RISK & CIRCUIT BREAKERS

| # | Trigger | How Detected | Auto Alert? | Priority | Operator Action |
|---|---------|-------------|-------------|----------|-----------------|
| RK-1 | Daily loss limit breached | RiskMonitor detects total_pnl exceeds limit → auto-pauses bot | Yes — critical | P2 | 1. Verify P&L calculation is correct (check open positions too). 2. Review trades that caused the loss. 3. Do NOT resume bot until supervisor reviews. 4. Log incident with P&L breakdown. |
| RK-2 | Drawdown limit breached | RiskMonitor detects drawdown > threshold → auto-pauses | Yes — critical | P2 | 1. Same as RK-1. 2. Note: bot will NOT auto-resume — manual intervention required. |
| RK-3 | Circuit breaker tripped | Multiple risk events in short window | Yes — critical | P1 | 1. All affected bots paused. 2. Full position audit. 3. Supervisor must authorize restart. 4. Root cause analysis required. |
| RK-4 | Risk limits not loading from DB | RiskMonitor falls back to hardcoded defaults | No — silent | P3 | 1. Check platform.risk_controls table. 2. Verify DB connectivity. 3. Restart RiskMonitor if needed. |

### 3.4 EXCHANGE FAILURES

| # | Trigger | How Detected | Auto Alert? | Priority | Operator Action |
|---|---------|-------------|-------------|----------|-----------------|
| EX-1 | Exchange API down (HTTP 5xx) | ExchangeHealthMonitor detects consecutive failures | Yes — warning/critical | P2 | 1. Check exchange status page. 2. Pause bots on affected exchange. 3. Do NOT close positions (exchange may recover). 4. Monitor every 5 min. Resume when stable for 10+ min. |
| EX-2 | Rate limit hit (HTTP 429) | Order dispatch fails with rate_limited | Yes — warning | P3 | 1. Check which bot(s) caused it. 2. Reduce trading frequency in config. 3. Wait for rate limit window to reset (usually 1 min). |
| EX-3 | Order rejected — insufficient balance | Binance returns margin/balance error | No — logged in order | P3 | 1. Check exchange balance vs allocated capital. 2. If real discrepancy, pause bot + investigate. 3. May need to adjust allocated_capital. |
| EX-4 | Order rejected — notional too small | Binance minimum notional not met | No — logged in order | P4 | 1. Adjust bot config: increase position_pct or min_notional. 2. No immediate risk. |
| EX-5 | Credential expired or revoked | Executor returns auth error | Yes — critical | P1 | 1. Immediately pause all bots using this credential. 2. Do NOT attempt to re-authenticate automatically. 3. Operator must manually verify credential on exchange. 4. Rotate API key if compromised. |
| EX-6 | Testnet/production mismatch | Orders fail silently — no fills ever | No — must check manually | P2 | 1. Check credential.is_sandbox vs bot config. 2. Verify orders appear on exchange dashboard. 3. If mismatch found, stop bot immediately. |

### 3.5 POSITION ANOMALIES

| # | Trigger | How Detected | Auto Alert? | Priority | Operator Action |
|---|---------|-------------|-------------|----------|-----------------|
| PA-1 | Position stuck open beyond max hold time | PositionCloseManager detects overdue position but close fails | Partial — logged | P2 | 1. Check exchange for position status. 2. Manually close via exchange UI if needed. 3. Update position status in DB. 4. Investigate why close failed. |
| PA-2 | Orphaned position — in ETS but not DB | BotRegistry has position but Position table doesn't | No | P3 | 1. Query ETS position_pnl_cache. 2. Compare with DB. 3. If real on exchange, create DB record. 4. If phantom, clear from ETS. |
| PA-3 | P&L discrepancy — dashboard shows wrong value | PositionPnLManager using stale price or wrong entry | No — visual check | P3 | 1. Compare dashboard P&L with exchange account P&L. 2. Check price cache freshness. 3. If >5% discrepancy, flag for investigation. |
| PA-4 | Position beyond 500/1000 cap not being monitored | Position count exceeds PositionCloseManager/PnLManager limits | No — silent | P1 | 1. This is critical — stop losses not firing for excess positions. 2. Manually audit all positions on exchange. 3. Close any unmonitored positions. 4. Escalate for cap increase. |

### 3.6 ORDER ANOMALIES

| # | Trigger | How Detected | Auto Alert? | Priority | Operator Action |
|---|---------|-------------|-------------|----------|-----------------|
| OA-1 | Stale order auto-cancelled after 5 min | StaleOrderCanceller runs scheduled cleanup | No — silent | P4 | 1. Check if order was actually filled on exchange. 2. If filled but cancelled in DB, reconcile. 3. Note: potential duplicate position risk. |
| OA-2 | Double fill — position created twice | Same signal triggers two orders before dedup kicks in | No — must audit | P2 | 1. Check exchange order history for duplicates. 2. Close excess position. 3. Adjust P&L accounting. |
| OA-3 | Order filled on exchange but failed in DB | OrderManager DB update fails after exchange confirms | Yes — warning (logged) | P2 | 1. Check exchange order history. 2. Manually create/update order record in DB. 3. Ensure position tracking is correct. |

### 3.7 CAPITAL & BALANCE

| # | Trigger | How Detected | Auto Alert? | Priority | Operator Action |
|---|---------|-------------|-------------|----------|-----------------|
| CB-1 | Virtual balance diverged from exchange | Reconciliation check shows mismatch | No — manual check | P2 | 1. Compare CapitalAllocator ETS with exchange API balance. 2. Identify which trades caused divergence. 3. Adjust virtual balance to match reality. |
| CB-2 | Over-allocation across bots | Multiple bots allocated more than account total | No — manual check | P2 | 1. List all allocations per user/service account. 2. Reduce allocations to fit within actual balance. 3. Pause excess bots if needed. |
| CB-3 | Exchange withdrawal or deposit not reflected | External balance change not tracked by platform | No | P3 | 1. Refresh balance from exchange API. 2. Update CapitalAllocator. |

### 3.8 INFRASTRUCTURE

| # | Trigger | How Detected | Auto Alert? | Priority | Operator Action |
|---|---------|-------------|-------------|----------|-----------------|
| IF-1 | Database connection lost | Infra.Monitor probe fails, queries timeout | Yes — critical | P1 | 1. Do NOT restart bots (will make it worse). 2. Check DB host status. 3. Check connection pool exhaustion. 4. Bots continue on ETS cache until DB recovers. 5. Once DB back, verify data consistency. |
| IF-2 | BEAM memory exceeding threshold | Infra.Monitor reports >80% memory | Yes — warning | P3 | 1. Check which processes consuming memory (observer). 2. Check ETS table sizes. 3. If growing unbounded, identify the leak. 4. May need rolling restart. |
| IF-3 | Service health degraded (Coolify, NestJS, etc.) | ServiceHealthMonitor detects transition | Yes — warning | P3 | 1. Check service logs. 2. If non-critical service, monitor. 3. If NestJS admin API down, admin operations blocked but trading continues. |
| IF-4 | WebSocket connections dropped | Clients lose real-time feed | No — client-side detection | P4 | 1. Check admin_gateway health. 2. Check BEAM process count. 3. Usually transient — clients auto-reconnect. |
| IF-5 | ETS table memory growing unbounded | Infra.Monitor shows ETS >500MB | Yes — warning | P2 | 1. Identify which table is growing. 2. If ticker/candle cache, check if streams are cleaning up. 3. May need manual flush + restart. |

### 3.9 SECURITY

| # | Trigger | How Detected | Auto Alert? | Priority | Operator Action |
|---|---------|-------------|-------------|----------|-----------------|
| SC-1 | Unauthorized API access attempt | NestJS auth guard rejects request from unknown IP | No — logged in NestJS | P3 | 1. Check access logs. 2. If repeated, block IP. 3. If credential-based, rotate affected keys. |
| SC-2 | API key potentially exposed | Credential found in logs, error message, or response | No — manual discovery | P1 | 1. Immediately revoke key on exchange. 2. Rotate all credentials for affected account. 3. Audit recent trades for unauthorized activity. 4. Full incident report required. |
| SC-3 | Suspicious trading pattern | Abnormal P&L, trades at unusual times, unknown pairs | No — manual | P2 | 1. Pause affected bot. 2. Audit trade history. 3. Check credential access logs on exchange. |

---

## 4. Auto-Incident Rules

These alerts should **automatically create an incident** in `operations.incidents`:

| Alert Condition | Auto-Priority | Auto-Category | Requires |
|----------------|---------------|---------------|----------|
| Kill switch activated | P1 | `kill_switch` | Supervisor countersign within 1h |
| >2 bots enter error state within 5 min | P1 | `bot_error` | Immediate investigation |
| Rogue bot detected (frequency >10x baseline) | P1 | `rogue_bot` | Kill switch + supervisor |
| Exchange credential auth failure | P1 | `exchange_failure` | Key rotation |
| Circuit breaker tripped | P1 | `risk_breach` | Full position audit |
| Daily loss limit breached | P2 | `risk_breach` | Supervisor review before resume |
| Drawdown limit breached | P2 | `risk_breach` | Supervisor review before resume |
| Bot heartbeat lost with open positions | P2 | `bot_error` | Position audit |
| DB connection lost >30s | P1 | `infrastructure` | Do not restart bots |

All other alerts are P3/P4 and logged but do NOT auto-create incidents unless the operator escalates manually.

---

## 5. Shift Responsibilities

### Shift Start Checklist
1. Review outgoing shift handoff notes
2. Verify all bots in expected state (running/stopped)
3. Check open positions count and total P&L
4. Verify exchange connectivity (all adapters healthy)
5. Review unacknowledged alerts from previous shift
6. Confirm risk limits are loaded (not using defaults)
7. Check capital allocations match expectations

### During Shift
1. Monitor mission-critical dashboard continuously
2. Acknowledge alerts within response time (per priority)
3. Open incidents for any P1/P2 events
4. Log NIL shift entry if nothing happens (P4 record)
5. Do not make config changes without logging

### Shift End / Handoff
1. Resolve or escalate all open incidents
2. Write handoff notes covering:
   - Open incidents and their status
   - Any bots in non-running state and why
   - Any pending investigations
   - Any config changes made during shift
3. Countersign any P1 incidents with supervisor
4. Submit shift log

---

## 6. Kill Switch Procedures

### Single Bot Kill Switch
1. Pause bot via API or dashboard
2. Verify bot status = "stopped" or "paused"
3. Check open positions — do NOT auto-close (may cause slippage)
4. Log kill switch activation with reason
5. Notify supervisor

### All-Bot Kill Switch
1. Trigger platform-wide pause
2. Verify ALL bots stopped (check BotRegistry ETS)
3. Audit all open positions across all bots
4. This is always P1 — supervisor must authorize restart
5. Restart bots ONE AT A TIME, verify each before next

### Platform Kill Switch (nuclear option)
1. Stop all bots
2. Disable all exchange credentials
3. This prevents any order from being placed even if a bot somehow restarts
4. Requires Head of Ops authorization to re-enable
5. Full post-incident review mandatory

---

## 7. Implementation Notes

### What needs to be built:
1. **Auto-incident creation** — AlertPersister should create `operations.incidents` rows for P1/P2 conditions listed in Section 4
2. **Incident-alert linking** — Each incident should reference the alert(s) that triggered it (new `incident_alerts` join table)
3. **Shift checklist enforcement** — Start/end checklist items tracked in `operations.shift_activities`
4. **Kill switch API** — Dedicated endpoint that pauses bots AND creates incident in one atomic operation
5. **Alert deduplication** — Same alert type + same bot within 5 min = increment count, don't create new row
6. **Operator runbook in UI** — Each incident category shows the response steps from Section 3 inline

### What already exists:
- `platform.system_alerts` — 207 rows of machine-generated alerts (working)
- `operations.incidents` — full schema with kill_switch, rogue_bot sub-tables (empty, ready)
- `operations.shifts` — shift tracking (working)
- AlertPersister GenServer — persists + broadcasts alerts (working)
- RiskMonitor — auto-pauses bots on limit breach (working)
- HeartbeatTracker — detects stale bots (working)
- ExchangeHealthMonitor — tracks exchange status (working)
- ServiceHealthMonitor — tracks service health (working)

### Table relationship:
```
platform.system_alerts  ------>  operations.incident_alerts  <------  operations.incidents
    (machine events)              (many-to-many link)                   (formal records)
                                                                           |
                                                                    operations.kill_switch_activations
                                                                    operations.rogue_bot_incidents
```
