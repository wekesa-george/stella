/**
 * Training Mode — Incident Scenarios
 *
 * Each scenario defines a sequence of timed events that simulate real incidents.
 * Events inject into local UI state only — no API calls, no DB writes.
 *
 * Operator actions are validated against expectedActions to produce a score.
 */

export type TrainingEventType = "alert" | "incident" | "bot_status" | "exchange_health" | "service_health" | "metric_change";

export interface TrainingEvent {
  /** Seconds after scenario start */
  delaySeconds: number;
  type: TrainingEventType;
  payload: Record<string, any>;
  /** Narration shown in the guided panel when this event fires */
  narration: string;
}

export interface ExpectedAction {
  /** Unique key for this action */
  id: string;
  /** Human-readable instruction */
  label: string;
  /** Detailed explanation of why this matters */
  detail: string;
  /** Max seconds from scenario start to complete this action for full score */
  targetSeconds: number;
  /** Category for scoring */
  category: "acknowledge" | "escalate" | "contain" | "resolve" | "notify";
}

export interface TrainingScenario {
  id: string;
  name: string;
  description: string;
  severity: "P1" | "P2" | "P3";
  /** Estimated duration in minutes */
  durationMinutes: number;
  /** Category tag */
  category: string;
  events: TrainingEvent[];
  expectedActions: ExpectedAction[];
  /** Summary shown after scenario completes */
  debriefing: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1: Rogue Bot — exceeds position limits
// ─────────────────────────────────────────────────────────────────────────────
const rogueBotScenario: TrainingScenario = {
  id: "rogue-bot",
  name: "Rogue Bot Detection",
  description: "A bot exceeds its maximum position size limit and begins accumulating outsized exposure. The system detects anomalous behavior and fires a P1 alert.",
  severity: "P1",
  durationMinutes: 5,
  category: "Bot Safety",
  events: [
    {
      delaySeconds: 0,
      type: "alert",
      payload: {
        id: "TRN-ALR-001",
        severity: "warning",
        title: "Bot position size exceeding threshold",
        message: "Bot PHYS-BTCUSDT has opened 3 positions totaling $2,400 — 30% of allocated capital in single direction",
        category: "risk",
        service: "RiskMonitor",
      },
      narration: "A warning alert has appeared. The risk monitor detected that bot PHYS-BTCUSDT is concentrating positions. Watch the Alerts tab.",
    },
    {
      delaySeconds: 8,
      type: "bot_status",
      payload: {
        botId: "TRN-BOT-001",
        name: "PHYS-BTCUSDT",
        status: "running",
        exchange: "binance",
        pair: "BTCUSDT",
        pnl: -120.50,
        equity: 7880,
        openPositions: 4,
      },
      narration: "The bot has opened a 4th position. Total exposure is now $3,200 — 40% of capital. The position count exceeds the configured maximum of 3.",
    },
    {
      delaySeconds: 15,
      type: "alert",
      payload: {
        id: "TRN-ALR-002",
        severity: "critical",
        title: "ROGUE BOT: Position limits exceeded",
        message: "Bot PHYS-BTCUSDT has 4 open positions exceeding limit of 3. Total exposure: $3,200 (40% of capital). Auto-pause recommended.",
        category: "rogue_bot",
        service: "RiskMonitor",
      },
      narration: "A CRITICAL alert has fired. This is now classified as a rogue bot. The operator must act immediately.",
    },
    {
      delaySeconds: 18,
      type: "incident",
      payload: {
        id: "TRN-INC-001",
        incident_number: "INC-2026-DEMO-001",
        priority: "P1",
        category: "rogue_bot",
        title: "Rogue bot detected: PHYS-BTCUSDT exceeding position limits",
        description: "Bot has 4 positions (limit: 3), total exposure $3,200 (40% of $8,000 capital). Uncontrolled accumulation detected.",
        status: "open",
        bot_ref: "PHYS-BTC",
        created_at: new Date().toISOString(),
      },
      narration: "A formal P1 incident has been auto-created. Check the Incidents tab. As a P1, this requires immediate containment and supervisor notification.",
    },
    {
      delaySeconds: 30,
      type: "bot_status",
      payload: {
        botId: "TRN-BOT-001",
        name: "PHYS-BTCUSDT",
        status: "running",
        pnl: -185.30,
        equity: 7815,
        openPositions: 5,
      },
      narration: "The bot has opened a 5th position while you assess the situation. Losses are growing. Time to act — pause the bot or activate kill switch.",
    },
  ],
  expectedActions: [
    {
      id: "ack-warning",
      label: "Acknowledge the initial warning alert",
      detail: "Click the warning alert to acknowledge it. This records that you've seen the early signal.",
      targetSeconds: 15,
      category: "acknowledge",
    },
    {
      id: "pause-bot",
      label: "Pause the rogue bot",
      detail: "Click 'Pause Bot' on PHYS-BTCUSDT to stop it from opening new positions. This is the primary containment action.",
      targetSeconds: 25,
      category: "contain",
    },
    {
      id: "notify-supervisor",
      label: "Notify supervisor (mark checkbox)",
      detail: "P1 incidents require supervisor notification within 5 minutes. Check the 'Supervisor Notified' box on the incident.",
      targetSeconds: 60,
      category: "notify",
    },
    {
      id: "review-positions",
      label: "Review open positions",
      detail: "Check the bot's open positions to assess exposure and decide whether to close any.",
      targetSeconds: 90,
      category: "contain",
    },
    {
      id: "resolve-incident",
      label: "Resolve the incident with notes",
      detail: "After containing the situation, resolve the incident with a description of what happened and what was done.",
      targetSeconds: 180,
      category: "resolve",
    },
  ],
  debriefing: "Rogue bot scenarios require immediate containment (pause/kill switch), then assessment of open positions. Key metrics: time from first alert to bot pause, and whether supervisor was notified within 5 minutes for P1.",
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: Exchange Down
// ─────────────────────────────────────────────────────────────────────────────
const exchangeDownScenario: TrainingScenario = {
  id: "exchange-down",
  name: "Exchange Connection Lost",
  description: "Binance WebSocket disconnects and REST API returns timeouts. Bots with open positions on the exchange cannot receive price updates or execute orders.",
  severity: "P2",
  durationMinutes: 5,
  category: "Exchange",
  events: [
    {
      delaySeconds: 0,
      type: "exchange_health",
      payload: {
        exchange: "binance",
        status: "degraded",
        ws_connected: false,
        rest_latency_ms: 8500,
        last_ticker_age_seconds: 45,
      },
      narration: "Exchange health card has turned amber. Binance WebSocket has disconnected and REST latency has spiked to 8.5 seconds.",
    },
    {
      delaySeconds: 5,
      type: "alert",
      payload: {
        id: "TRN-ALR-010",
        severity: "warning",
        title: "Binance WebSocket disconnected",
        message: "WebSocket stream lost connection. Ticker data is 45s stale. Auto-reconnect attempting...",
        category: "exchange",
        service: "ExchangeHealthMonitor",
      },
      narration: "Warning alert fired. The system is attempting auto-reconnect. Monitor the exchange health card.",
    },
    {
      delaySeconds: 20,
      type: "alert",
      payload: {
        id: "TRN-ALR-011",
        severity: "critical",
        title: "Exchange unreachable: Binance",
        message: "Binance REST API returning 503. WebSocket reconnect failed 3 times. 2 bots have open positions on this exchange.",
        category: "exchange_down",
        service: "ExchangeHealthMonitor",
      },
      narration: "Critical alert. The exchange is confirmed unreachable. Bots with open positions cannot manage their exposure.",
    },
    {
      delaySeconds: 25,
      type: "incident",
      payload: {
        id: "TRN-INC-010",
        incident_number: "INC-2026-DEMO-010",
        priority: "P2",
        category: "exchange_failure",
        title: "Binance exchange unreachable — 2 bots with open positions",
        description: "REST 503, WS disconnected, 3 reconnect attempts failed. Bots PHYS-BTCUSDT and GRID-ETHUSDT have open positions.",
        status: "open",
        created_at: new Date().toISOString(),
      },
      narration: "P2 incident auto-created. You need to pause affected bots and monitor for exchange recovery.",
    },
    {
      delaySeconds: 60,
      type: "exchange_health",
      payload: {
        exchange: "binance",
        status: "healthy",
        ws_connected: true,
        rest_latency_ms: 120,
        last_ticker_age_seconds: 1,
      },
      narration: "Exchange has recovered. WebSocket reconnected, latency back to normal. Verify bot state before resuming.",
    },
  ],
  expectedActions: [
    {
      id: "ack-ws-warning",
      label: "Acknowledge WebSocket disconnect warning",
      detail: "Note the warning and begin monitoring exchange health card.",
      targetSeconds: 15,
      category: "acknowledge",
    },
    {
      id: "pause-affected-bots",
      label: "Pause bots on the affected exchange",
      detail: "Pause all bots trading on Binance to prevent blind trading without price data.",
      targetSeconds: 35,
      category: "contain",
    },
    {
      id: "check-exchange-status",
      label: "Check exchange status page",
      detail: "Verify whether Binance has reported an outage on their status page.",
      targetSeconds: 60,
      category: "acknowledge",
    },
    {
      id: "resolve-after-recovery",
      label: "Verify recovery and resolve incident",
      detail: "After exchange reconnects, verify bots and positions are healthy before resolving.",
      targetSeconds: 120,
      category: "resolve",
    },
  ],
  debriefing: "Exchange outages require immediate bot pauses to prevent blind trading. Never resume bots automatically — always verify exchange health, position state, and price accuracy before manual restart.",
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Multi-Bot Error Cascade
// ─────────────────────────────────────────────────────────────────────────────
const multiBotErrorScenario: TrainingScenario = {
  id: "multi-bot-error",
  name: "Multi-Bot Error Cascade",
  description: "Multiple bots enter error state within minutes, suggesting a shared infrastructure problem (credential expiry, rate limiting, or API change).",
  severity: "P1",
  durationMinutes: 5,
  category: "Bot Safety",
  events: [
    {
      delaySeconds: 0,
      type: "bot_status",
      payload: { botId: "TRN-BOT-A", name: "GRID-ETHUSDT", status: "error", pnl: 45.0, equity: 5045, openPositions: 2 },
      narration: "GRID-ETHUSDT has entered error state. Check the fleet panel on the right.",
    },
    {
      delaySeconds: 5,
      type: "alert",
      payload: {
        id: "TRN-ALR-020",
        severity: "warning",
        title: "Bot entered error state: GRID-ETHUSDT",
        message: "Bot stopped responding. Last error: credential_auth_failure — API key rejected by exchange.",
        category: "bot_error",
        service: "HeartbeatTracker",
      },
      narration: "Warning: The bot's API key was rejected. This might affect other bots using the same credential.",
    },
    {
      delaySeconds: 15,
      type: "bot_status",
      payload: { botId: "TRN-BOT-B", name: "DCA-SOLUSDT", status: "error", pnl: -30.0, equity: 2970, openPositions: 1 },
      narration: "A second bot has entered error state. Pattern suggests a shared problem.",
    },
    {
      delaySeconds: 25,
      type: "bot_status",
      payload: { botId: "TRN-BOT-C", name: "TREND-BNBUSDT", status: "error", pnl: 12.0, equity: 4012, openPositions: 0 },
      narration: "Third bot down. The system will now trigger a P1 multi-bot error incident.",
    },
    {
      delaySeconds: 28,
      type: "incident",
      payload: {
        id: "TRN-INC-020",
        incident_number: "INC-2026-DEMO-020",
        priority: "P1",
        category: "bot_error",
        title: "Multiple bots entered error state (3 bots in 30 seconds)",
        description: "GRID-ETHUSDT, DCA-SOLUSDT, TREND-BNBUSDT all entered error state. Common cause: credential_auth_failure. 3 open positions at risk.",
        status: "open",
        created_at: new Date().toISOString(),
      },
      narration: "P1 incident auto-created for multi-bot error. This is likely a credential issue. Check if all bots share the same API credential.",
    },
    {
      delaySeconds: 35,
      type: "alert",
      payload: {
        id: "TRN-ALR-021",
        severity: "critical",
        title: "Credential auth failure: All Binance bots affected",
        message: "API key ending in ...SETGL has been invalidated by exchange. 3 bots affected, 3 open positions unmanaged.",
        category: "credential_auth_failure",
        service: "Executor",
      },
      narration: "Root cause identified: The API key was invalidated. All bots using this credential are down. Open positions need manual attention.",
    },
  ],
  expectedActions: [
    {
      id: "ack-first-error",
      label: "Acknowledge first bot error",
      detail: "Note which bot errored and check its error details.",
      targetSeconds: 10,
      category: "acknowledge",
    },
    {
      id: "identify-pattern",
      label: "Identify shared credential pattern",
      detail: "When multiple bots error, check if they share a credential, exchange, or configuration.",
      targetSeconds: 30,
      category: "acknowledge",
    },
    {
      id: "kill-switch",
      label: "Activate kill switch for affected credential",
      detail: "With 3+ bots down from same cause, activate kill switch to prevent further damage.",
      targetSeconds: 40,
      category: "contain",
    },
    {
      id: "notify-supervisor",
      label: "Notify supervisor (P1 requirement)",
      detail: "P1 incidents require supervisor notification within 5 minutes.",
      targetSeconds: 60,
      category: "notify",
    },
    {
      id: "rotate-credential",
      label: "Initiate credential rotation",
      detail: "Request new API key generation and update the credential in the system.",
      targetSeconds: 120,
      category: "resolve",
    },
  ],
  debriefing: "Multi-bot errors usually share a root cause. The first priority is identifying the common factor (credential, exchange, network). Kill switch is appropriate when 3+ bots fail simultaneously. Always check open positions — they may need manual closure via exchange UI if credentials are invalidated.",
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Daily Loss Breach
// ─────────────────────────────────────────────────────────────────────────────
const dailyLossScenario: TrainingScenario = {
  id: "daily-loss-breach",
  name: "Daily Loss Limit Breach",
  description: "Platform-wide daily P&L breaches the configured loss threshold. Risk monitor auto-pauses bots, but operator must verify and report.",
  severity: "P2",
  durationMinutes: 4,
  category: "Risk",
  events: [
    {
      delaySeconds: 0,
      type: "metric_change",
      payload: { totalPnl: -380, drawdown: 4.7 },
      narration: "Platform P&L has dropped to -$380. Drawdown is 4.7%. The daily loss limit is set at $500.",
    },
    {
      delaySeconds: 10,
      type: "alert",
      payload: {
        id: "TRN-ALR-030",
        severity: "warning",
        title: "Daily P&L approaching loss limit",
        message: "Platform P&L: -$380 / -$500 limit (76% consumed). 2 bots contributing to losses.",
        category: "risk",
        service: "RiskMonitor",
      },
      narration: "Warning: 76% of daily loss limit consumed. Watch for further deterioration.",
    },
    {
      delaySeconds: 25,
      type: "metric_change",
      payload: { totalPnl: -520, drawdown: 6.5 },
      narration: "Daily loss limit breached: -$520 vs -$500 limit. Risk monitor will auto-pause bots.",
    },
    {
      delaySeconds: 28,
      type: "alert",
      payload: {
        id: "TRN-ALR-031",
        severity: "critical",
        title: "DAILY LOSS LIMIT BREACHED",
        message: "Platform daily P&L: -$520 exceeds -$500 limit. RiskMonitor auto-pausing all running bots.",
        category: "daily_loss_breach",
        service: "RiskMonitor",
      },
      narration: "Critical: Loss limit breached. Bots are being auto-paused by the risk monitor.",
    },
    {
      delaySeconds: 32,
      type: "incident",
      payload: {
        id: "TRN-INC-030",
        incident_number: "INC-2026-DEMO-030",
        priority: "P2",
        category: "risk_breach",
        title: "Daily loss limit breached: -$520 / -$500",
        description: "Auto-pause triggered. Contributing bots: PHYS-BTCUSDT (-$340), GRID-ETHUSDT (-$180). Review positions for manual closure.",
        status: "open",
        created_at: new Date().toISOString(),
      },
      narration: "P2 incident created. Bots are paused. Your job: verify the pause, review remaining open positions, and decide whether to close them or hold.",
    },
    {
      delaySeconds: 35,
      type: "bot_status",
      payload: { botId: "TRN-BOT-001", name: "PHYS-BTCUSDT", status: "paused", pnl: -340, equity: 7660, openPositions: 2 },
      narration: "PHYS-BTCUSDT auto-paused. 2 open positions remain — they won't be managed until the bot resumes.",
    },
  ],
  expectedActions: [
    {
      id: "ack-approaching",
      label: "Acknowledge loss limit approaching warning",
      detail: "Monitor the P&L and prepare for potential breach.",
      targetSeconds: 20,
      category: "acknowledge",
    },
    {
      id: "verify-auto-pause",
      label: "Verify bots were auto-paused",
      detail: "Confirm in the fleet panel that all running bots have been paused by the risk monitor.",
      targetSeconds: 40,
      category: "contain",
    },
    {
      id: "review-open-positions",
      label: "Review open positions on paused bots",
      detail: "Check if any open positions need manual closure to prevent further losses.",
      targetSeconds: 60,
      category: "contain",
    },
    {
      id: "notify-risk-officer",
      label: "Notify risk officer",
      detail: "Daily loss breaches require risk officer notification per operations framework.",
      targetSeconds: 90,
      category: "notify",
    },
    {
      id: "resolve-with-assessment",
      label: "Resolve with loss assessment",
      detail: "Document total losses, root cause (market conditions / strategy failure), and whether positions were closed.",
      targetSeconds: 180,
      category: "resolve",
    },
  ],
  debriefing: "Daily loss breaches are usually caused by adverse market conditions hitting correlated positions. The auto-pause prevents further damage, but open positions still carry risk. Always assess whether open positions should be manually closed or if they have stop-losses in place.",
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: Circuit Breaker Activation
// ─────────────────────────────────────────────────────────────────────────────
const circuitBreakerScenario: TrainingScenario = {
  id: "circuit-breaker",
  name: "Circuit Breaker Triggered",
  description: "A bot's internal circuit breaker activates after detecting rapid consecutive losses. Trading is automatically halted for this bot.",
  severity: "P1",
  durationMinutes: 4,
  category: "Risk",
  events: [
    {
      delaySeconds: 0,
      type: "alert",
      payload: {
        id: "TRN-ALR-040",
        severity: "critical",
        title: "Circuit breaker activated: PHYS-BTCUSDT",
        message: "Bot detected 5 consecutive losing trades totaling -$280. Circuit breaker engaged — all trading halted.",
        category: "circuit_breaker",
        service: "BotTradingProcess",
      },
      narration: "Circuit breaker fired. The bot has automatically stopped trading after 5 consecutive losses.",
    },
    {
      delaySeconds: 3,
      type: "bot_status",
      payload: { botId: "TRN-BOT-001", name: "PHYS-BTCUSDT", status: "circuit_broken", pnl: -280, equity: 7720, openPositions: 1 },
      narration: "Bot status changed to 'circuit_broken'. It has 1 remaining open position.",
    },
    {
      delaySeconds: 5,
      type: "incident",
      payload: {
        id: "TRN-INC-040",
        incident_number: "INC-2026-DEMO-040",
        priority: "P1",
        category: "risk_breach",
        title: "Circuit breaker: PHYS-BTCUSDT — 5 consecutive losses",
        description: "Total loss: -$280. 1 open position remaining. Bot requires manual review before restart.",
        status: "open",
        bot_ref: "PHYS-BTC",
        created_at: new Date().toISOString(),
      },
      narration: "P1 incident created. Circuit breakers are serious — they indicate the strategy may be unsuitable for current market conditions.",
    },
  ],
  expectedActions: [
    {
      id: "ack-cb",
      label: "Acknowledge circuit breaker alert",
      detail: "Confirm you've seen the circuit breaker activation.",
      targetSeconds: 10,
      category: "acknowledge",
    },
    {
      id: "review-remaining-position",
      label: "Review remaining open position",
      detail: "The bot has 1 open position that is no longer being managed. Decide whether to close it manually.",
      targetSeconds: 30,
      category: "contain",
    },
    {
      id: "notify-supervisor",
      label: "Notify supervisor",
      detail: "P1 — supervisor notification required within 5 minutes.",
      targetSeconds: 60,
      category: "notify",
    },
    {
      id: "document-root-cause",
      label: "Document root cause assessment",
      detail: "Was this market-driven (flash crash, low liquidity) or strategy-driven (bad parameters)?",
      targetSeconds: 120,
      category: "resolve",
    },
  ],
  debriefing: "Circuit breakers are a safety net. When triggered, the priority is managing any remaining open positions and understanding why 5 consecutive trades lost. Never restart a circuit-broken bot without reviewing market conditions and strategy parameters.",
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Stale Heartbeat
// ─────────────────────────────────────────────────────────────────────────────
const staleHeartbeatScenario: TrainingScenario = {
  id: "stale-heartbeat",
  name: "Bot Heartbeat Lost",
  description: "A running bot stops sending heartbeats. After 60 seconds the system marks it as error. The bot's process may have crashed while positions are still open on the exchange.",
  severity: "P2",
  durationMinutes: 4,
  category: "Infrastructure",
  events: [
    {
      delaySeconds: 0,
      type: "alert",
      payload: {
        id: "TRN-ALR-050",
        severity: "warning",
        title: "Bot heartbeat stale: DCA-SOLUSDT",
        message: "No heartbeat received for 45 seconds. Bot may be unresponsive. Open positions: 2.",
        category: "bot_error",
        service: "HeartbeatTracker",
      },
      narration: "Heartbeat warning. The bot hasn't checked in for 45 seconds. This could be a temporary pause or a crash.",
    },
    {
      delaySeconds: 15,
      type: "bot_status",
      payload: { botId: "TRN-BOT-D", name: "DCA-SOLUSDT", status: "error", pnl: 85.0, equity: 3085, openPositions: 2 },
      narration: "Bot auto-transitioned to error state after 60s without heartbeat. 2 positions are now unmanaged.",
    },
    {
      delaySeconds: 18,
      type: "alert",
      payload: {
        id: "TRN-ALR-051",
        severity: "critical",
        title: "Bot process dead: DCA-SOLUSDT",
        message: "Heartbeat timeout exceeded. Bot marked as error. 2 open positions with $3,085 exposure are unmanaged.",
        category: "bot_error",
        service: "HeartbeatTracker",
      },
      narration: "Critical: The bot process is confirmed dead. Its open positions are drifting without stop-loss management.",
    },
    {
      delaySeconds: 22,
      type: "incident",
      payload: {
        id: "TRN-INC-050",
        incident_number: "INC-2026-DEMO-050",
        priority: "P2",
        category: "bot_error",
        title: "Bot heartbeat lost: DCA-SOLUSDT — 2 unmanaged positions",
        description: "Bot process unresponsive for >60s. Positions on Binance still open. Manual intervention may be required.",
        status: "open",
        bot_ref: "DCA-SOLU",
        created_at: new Date().toISOString(),
      },
      narration: "P2 incident created. You need to check the positions and attempt a bot restart.",
    },
  ],
  expectedActions: [
    {
      id: "ack-heartbeat",
      label: "Acknowledge heartbeat warning",
      detail: "Note the warning and wait to see if the bot recovers within 60 seconds.",
      targetSeconds: 10,
      category: "acknowledge",
    },
    {
      id: "check-positions",
      label: "Check unmanaged positions",
      detail: "Review the 2 open positions — do they have exchange-side stop-losses?",
      targetSeconds: 30,
      category: "contain",
    },
    {
      id: "attempt-restart",
      label: "Attempt bot restart",
      detail: "Try restarting the bot process. If it fails, positions may need manual closure.",
      targetSeconds: 60,
      category: "contain",
    },
    {
      id: "resolve-or-escalate",
      label: "Resolve or escalate based on restart result",
      detail: "If bot restarts successfully, verify it picks up existing positions. If not, escalate.",
      targetSeconds: 120,
      category: "resolve",
    },
  ],
  debriefing: "Stale heartbeats indicate process-level failures. The critical risk is unmanaged positions — if exchange-side stop-losses aren't set, positions can accumulate unlimited losses. Always verify position state before and after restart.",
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 7: Database Connection Lost
// ─────────────────────────────────────────────────────────────────────────────
const dbDownScenario: TrainingScenario = {
  id: "db-connection-lost",
  name: "Database Connection Lost",
  description: "The trade engine loses connection to PostgreSQL. Bots continue running from ETS cache but cannot persist trades, update positions, or write logs.",
  severity: "P1",
  durationMinutes: 5,
  category: "Infrastructure",
  events: [
    {
      delaySeconds: 0,
      type: "service_health",
      payload: { service: "PostgreSQL", status: "down", latency: 0, detail: "Connection refused — ECONNREFUSED" },
      narration: "Database service has gone red in the services card. No new connections possible.",
    },
    {
      delaySeconds: 3,
      type: "alert",
      payload: {
        id: "TRN-ALR-060",
        severity: "critical",
        title: "Database connection lost",
        message: "PostgreSQL at 170.168.103.207:3212 unreachable. Ecto pool exhausted. Bots running from ETS cache only.",
        category: "db_connection_lost",
        service: "Infra.Monitor",
      },
      narration: "Critical: DB is down. Bots are still running (ETS has cached data), but NO trades, orders, or positions are being persisted.",
    },
    {
      delaySeconds: 5,
      type: "incident",
      payload: {
        id: "TRN-INC-060",
        incident_number: "INC-2026-DEMO-060",
        priority: "P1",
        category: "infrastructure",
        title: "Database unreachable — trade persistence offline",
        description: "PostgreSQL connection lost. Bots operating from ETS cache. Orders may execute on exchange but not persist locally. Data loss risk.",
        status: "open",
        created_at: new Date().toISOString(),
      },
      narration: "P1 incident. This is critical infrastructure. Trades happening now won't be recorded. Decision needed: pause all bots or accept data loss risk.",
    },
    {
      delaySeconds: 45,
      type: "service_health",
      payload: { service: "PostgreSQL", status: "healthy", latency: 12, detail: "Connection restored" },
      narration: "Database connection restored. Verify data consistency — check for any unrecorded trades during the outage.",
    },
  ],
  expectedActions: [
    {
      id: "ack-db-down",
      label: "Acknowledge database failure",
      detail: "This is P1 infrastructure. Immediate action required.",
      targetSeconds: 8,
      category: "acknowledge",
    },
    {
      id: "assess-pause-decision",
      label: "Decide: pause all bots or accept risk",
      detail: "Bots can still trade via exchange, but nothing persists. Pausing is safer but may miss opportunities.",
      targetSeconds: 20,
      category: "contain",
    },
    {
      id: "notify-supervisor",
      label: "Notify supervisor and ops manager",
      detail: "P1 infrastructure — requires immediate supervisor and ops manager notification.",
      targetSeconds: 30,
      category: "notify",
    },
    {
      id: "verify-recovery",
      label: "Verify data consistency after recovery",
      detail: "Cross-check exchange trade history against local records. Reconcile any missing trades.",
      targetSeconds: 120,
      category: "resolve",
    },
  ],
  debriefing: "Database outages are among the most dangerous failures — the system continues trading but can't record what it does. The decision to pause or continue depends on the expected outage duration and open position count. Always reconcile after recovery.",
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 8: Drawdown Breach
// ─────────────────────────────────────────────────────────────────────────────
const drawdownBreachScenario: TrainingScenario = {
  id: "drawdown-breach",
  name: "Maximum Drawdown Breach",
  description: "Platform equity has fallen from its peak by more than the configured maximum drawdown percentage. This triggers automatic risk controls.",
  severity: "P2",
  durationMinutes: 4,
  category: "Risk",
  events: [
    {
      delaySeconds: 0,
      type: "metric_change",
      payload: { totalPnl: -620, drawdown: 7.8 },
      narration: "Drawdown has reached 7.8% from peak equity. The maximum threshold is 10%.",
    },
    {
      delaySeconds: 10,
      type: "alert",
      payload: {
        id: "TRN-ALR-070",
        severity: "warning",
        title: "Drawdown approaching limit: 7.8% / 10%",
        message: "Platform equity $7,380 vs peak $8,000. Drawdown at 78% of maximum threshold.",
        category: "risk",
        service: "RiskMonitor",
      },
      narration: "Warning: drawdown at 78% of limit. If losses continue, auto-pause will trigger.",
    },
    {
      delaySeconds: 30,
      type: "alert",
      payload: {
        id: "TRN-ALR-071",
        severity: "critical",
        title: "DRAWDOWN LIMIT BREACHED: 10.2%",
        message: "Platform equity $7,184 vs peak $8,000. Maximum drawdown 10% exceeded. Auto-pausing all bots.",
        category: "drawdown_breach",
        service: "RiskMonitor",
      },
      narration: "Critical: Drawdown limit breached. All bots being auto-paused.",
    },
    {
      delaySeconds: 33,
      type: "incident",
      payload: {
        id: "TRN-INC-070",
        incident_number: "INC-2026-DEMO-070",
        priority: "P2",
        category: "risk_breach",
        title: "Maximum drawdown breached: 10.2% (limit 10%)",
        description: "Equity: $7,184 / Peak: $8,000. All bots auto-paused. Review market conditions and strategy performance.",
        status: "open",
        created_at: new Date().toISOString(),
      },
      narration: "P2 incident. Bots are paused. Assess whether this is a market-wide event or strategy-specific failure.",
    },
  ],
  expectedActions: [
    {
      id: "ack-approaching",
      label: "Acknowledge drawdown warning",
      detail: "Monitor the drawdown card and prepare for potential breach.",
      targetSeconds: 20,
      category: "acknowledge",
    },
    {
      id: "verify-auto-pause",
      label: "Verify all bots paused after breach",
      detail: "Confirm the auto-pause was successful for all running bots.",
      targetSeconds: 45,
      category: "contain",
    },
    {
      id: "assess-market",
      label: "Assess market conditions",
      detail: "Is this a flash crash, trending market, or strategy-specific failure?",
      targetSeconds: 90,
      category: "acknowledge",
    },
    {
      id: "resolve-with-plan",
      label: "Resolve with recovery plan",
      detail: "Document the cause, decide on parameter adjustments, and set conditions for bot restart.",
      targetSeconds: 150,
      category: "resolve",
    },
  ],
  debriefing: "Drawdown breaches protect capital from catastrophic loss. After a breach, never restart bots at the same parameters. Always review what caused the drawdown — market regime change, black swan, or misconfigured strategy — and adjust before resuming.",
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT ALL SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────
export const TRAINING_SCENARIOS: TrainingScenario[] = [
  rogueBotScenario,
  exchangeDownScenario,
  multiBotErrorScenario,
  dailyLossScenario,
  circuitBreakerScenario,
  staleHeartbeatScenario,
  dbDownScenario,
  drawdownBreachScenario,
];

export function getScenarioById(id: string): TrainingScenario | undefined {
  return TRAINING_SCENARIOS.find(s => s.id === id);
}
