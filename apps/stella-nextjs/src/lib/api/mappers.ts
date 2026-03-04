import type { Bot, BotStatus, Alert, User, TradeEngineMetrics } from '@/lib/types/dashboard';
import type { BotSnapshot, AlertData } from '@/hooks/usePhoenixChannel';

// ==================== BOT MAPPERS ====================

/** Treat Elixir "nil" strings as actual null */
function denilify(val: any): any {
  return val === 'nil' || val === '' ? null : val;
}

/**
 * Map a REST API bot response to the UI Bot type.
 * API shape comes from tradingEngineApi.listBots() / getBot().
 */
export function mapApiBotToUiBot(api: Record<string, any>): Bot {
  const uptimeSec = api.uptime_seconds ?? api.uptime ?? 0;
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const tradingPairs: string[] = api.trading_pairs ?? api.tradingPairs ?? [];
  const allocatedCapital = toNum(api.allocated_capital ?? api.allocatedCapital ?? 0);
  const activeCapital = toNum(api.active_capital ?? api.activeCapital ?? 0);
  const totalPnl = toNum(api.total_pnl ?? api.pnl_usd ?? api.pnl ?? 0);
  const totalTrades = toNum(api.total_trades ?? api.trade_count ?? api.trades ?? 0);
  const winningTrades = toNum(api.winning_trades ?? api.winningTrades ?? 0);
  const losingTrades = toNum(api.losing_trades ?? api.losingTrades ?? 0);
  const winRate = totalTrades > 0
    ? toNum(api.win_rate ?? (winningTrades / totalTrades * 100))
    : 0;
  const pnlPct = activeCapital > 0 ? (totalPnl / activeCapital) * 100 : toNum(api.pnl_pct ?? 0);

  return {
    id: api.id ?? api.bot_id ?? '',
    name: denilify(api.name) ?? denilify(api.bot_name) ?? '',
    user: denilify(api.owner_name) ?? denilify(api.owner_email) ?? denilify(api.user_id) ?? denilify(api.owner_user_id) ?? denilify(api.user) ?? '',
    serviceAccountId: denilify(api.service_account_id) ?? denilify(api.serviceAccountId) ?? null,
    credentialId: denilify(api.credential_id) ?? denilify(api.credentialId) ?? null,
    strategyId: denilify(api.strategy_id) ?? denilify(api.strategyId) ?? null,
    strategy: denilify(api.strategy) ?? denilify(api.strategy_type) ?? '',
    exchange: denilify(api.exchange) ?? '',
    pair: tradingPairs[0] ?? api.pair ?? api.symbol ?? '',
    tradingPairs,
    status: normalizeStatus(api.status),
    pnl: totalPnl,
    pnlPct: Math.round(pnlPct * 100) / 100,
    equity: activeCapital || allocatedCapital,
    allocatedCapital,
    activeCapital,
    openPositions: toNum(api.open_positions ?? api.open_positions_count ?? api.open_position_count ?? 0),
    trades: totalTrades,
    winningTrades,
    losingTrades,
    winRate: Math.round(winRate * 10) / 10,
    errorCount: toNum(api.error_count ?? api.errorCount ?? 0),
    lastError: api.last_error ?? api.lastError ?? null,
    lastHeartbeat: toNum(api.last_heartbeat_seconds_ago ?? api.heartbeat_seconds_ago ?? 0),
    startedAt: api.started_at ?? api.startedAt ?? null,
    createdAt: api.created_at ?? api.createdAt ?? null,
    cpu: toNum(api.cpu ?? api.cpu_utilization ?? 0),
    ram: toNum(api.ram ?? api.ram_utilization_mb ?? api.memory ?? 0),
    uptime: `${hours}h ${minutes}m`,
    initStep: api.init_step ?? api.initStep ?? null,
    marketType: api.market_type ?? api.marketType ?? 'spot',
  };
}

/**
 * Map a WS BotSnapshot to the UI Bot type.
 */
export function mapWsBotSnapshotToUiBot(snap: BotSnapshot): Bot {
  const uptimeSec = snap.uptime_seconds ?? 0;
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const tradingPairs: string[] = snap.trading_pairs ?? [];
  const totalPnl = toNum(snap.total_pnl ?? snap.pnl_usd ?? 0);
  const totalTrades = toNum(snap.total_trades ?? snap.trade_count ?? 0);
  const winningTrades = toNum(snap.winning_trades ?? 0);
  const losingTrades = toNum(snap.losing_trades ?? 0);
  const activeCapital = toNum(snap.active_capital ?? 0);
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  return {
    id: snap.id,
    name: snap.name,
    user: snap.user_id ?? '',
    serviceAccountId: snap.service_account_id ?? null,
    credentialId: snap.credential_id ?? null,
    strategyId: snap.strategy_id ?? null,
    strategy: snap.strategy ?? '',
    exchange: snap.exchange ?? '',
    pair: tradingPairs[0] ?? snap.pair ?? '',
    tradingPairs,
    status: normalizeStatus(snap.status),
    pnl: totalPnl,
    pnlPct: activeCapital > 0 ? Math.round((totalPnl / activeCapital) * 10000) / 100 : 0,
    equity: activeCapital,
    allocatedCapital: toNum(snap.allocated_capital ?? 0),
    activeCapital,
    openPositions: toNum(snap.open_positions ?? 0),
    trades: totalTrades,
    winningTrades,
    losingTrades,
    winRate: Math.round(winRate * 10) / 10,
    errorCount: toNum(snap.error_count ?? 0),
    lastError: snap.last_error ?? null,
    lastHeartbeat: 0,
    startedAt: snap.started_at ?? null,
    createdAt: snap.created_at ?? null,
    cpu: 0,
    ram: 0,
    uptime: `${hours}h ${minutes}m`,
    initStep: snap.init_step ?? null,
    marketType: snap.market_type ?? 'spot',
  };
}

// ==================== ALERT MAPPERS ====================

/**
 * Map a REST API alert to the UI Alert type.
 * API shape comes from stellaAdminApi.getAlerts().
 */
export function mapApiAlertToUiAlert(api: Record<string, any>): Alert {
  return {
    id: api.id ?? 0,
    msg: api.message ?? api.title ?? '',
    sev: normalizeSeverity(api.severity),
    service: api.category ?? api.service ?? '',
    time: formatRelativeTime(api.timestamp ?? api.created_at),
    acked: api.acknowledged ?? api.acked ?? false,
  };
}

/**
 * Map a WS AlertData to the UI Alert type.
 */
export function mapWsAlertToUiAlert(ws: AlertData): Alert {
  return {
    id: ws.id as any,
    msg: ws.message ?? ws.title,
    sev: normalizeSeverity(ws.severity),
    service: ws.category,
    time: formatRelativeTime(ws.timestamp),
    acked: false,
  };
}

// ==================== USER MAPPER ====================

export function mapApiUserToUiUser(api: Record<string, any>): User {
  return {
    id: api.id ?? '',
    email: api.email ?? '',
    name: api.name ?? `${api.first_name ?? ''} ${api.last_name ?? ''}`.trim(),
    type: api.type ?? 'trader',
    status: api.status ?? 'active',
    verified: api.verified ?? api.email_verified ?? false,
    joinDate: api.join_date ?? api.created_at?.split('T')[0] ?? '',
    lastActive: formatRelativeTime(api.last_active ?? api.last_login),
    totalTrades: toNum(api.total_trades ?? 0),
    followers: toNum(api.followers ?? api.follower_count ?? 0),
    following: toNum(api.following ?? api.following_count ?? 0),
    totalPnl: toNum(api.total_pnl ?? 0),
    winRate: toNum(api.win_rate ?? 0),
    copyTrading: api.copy_trading ?? false,
    verificationLevel: api.verification_level ?? 'unverified',
    avatar: api.avatar ?? api.picture,
  };
}

// ==================== INFRA MAPPER ====================

const BEAM_MEMORY_REFERENCE_MB = 2048; // reference max for RAM gauge percentage

export function mapWsInfraToTradeEngineMetrics(ws: Record<string, any>): TradeEngineMetrics {
  const beam = ws.beam ?? {};
  const db = ws.database ?? {};
  const etsTables = ws.ets_tables ?? {};

  const schedulerCount = toNum(beam.scheduler_count ?? 1);
  const runQueue = toNum(beam.run_queue ?? 0);
  const totalMemoryMb = toNum(beam.total_memory_mb ?? 0);

  // Aggregate ETS tables
  let totalEtsEntries = 0;
  let totalEtsMemoryBytes = 0;
  let tableCount = 0;
  if (typeof etsTables === 'object' && etsTables !== null) {
    for (const table of Object.values(etsTables) as any[]) {
      totalEtsEntries += toNum(table?.size ?? 0);
      totalEtsMemoryBytes += toNum(table?.memory_bytes ?? 0);
      tableCount++;
    }
  }

  return {
    beam: {
      cpuPercent: Math.min(100, Math.round((runQueue / schedulerCount) * 100)),
      totalMemoryMb,
      processMemoryMb: toNum(beam.process_memory_mb ?? 0),
      etsMemoryMb: toNum(beam.ets_memory_mb ?? 0),
      atomMemoryMb: toNum(beam.atom_memory_mb ?? 0),
      processCount: toNum(beam.process_count ?? 0),
      processLimit: toNum(beam.process_limit ?? 0),
      schedulerCount,
      runQueue,
      ioInputMb: toNum(beam.io_input_mb ?? 0),
      ioOutputMb: toNum(beam.io_output_mb ?? 0),
      uptimeSeconds: toNum(beam.uptime_seconds ?? 0),
    },
    ets: {
      totalEntries: totalEtsEntries,
      totalMemoryBytes: totalEtsMemoryBytes,
      tableCount,
    },
    dbPool: {
      poolSize: toNum(db.pool_size ?? 0),
      status: String(db.status ?? 'unknown'),
    },
    collectedAt: ws.collected_at ?? null,
  };
}

/** Derive CPU/RAM percentages for history chart from TradeEngineMetrics */
export function tradeEngineMetricsToCpuRam(m: TradeEngineMetrics): { cpu: number; ram: number } {
  return {
    cpu: m.beam.cpuPercent,
    ram: Math.min(100, Math.round((m.beam.totalMemoryMb / BEAM_MEMORY_REFERENCE_MB) * 100)),
  };
}

// ==================== HELPERS ====================

function toNum(val: any): number {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function normalizeStatus(s: string): BotStatus {
  const lower = (s ?? '').toLowerCase();
  const validStatuses: BotStatus[] = [
    'running', 'paused', 'stopped', 'initializing',
    'error', 'circuit_broken', 'maintenance', 'stopping',
  ];
  if (validStatuses.includes(lower as BotStatus)) return lower as BotStatus;
  if (lower === 'active') return 'running';
  if (lower === 'idle') return 'paused';
  return 'error';
}

function normalizeSeverity(s: string): 'critical' | 'warning' | 'info' {
  const lower = (s ?? '').toLowerCase();
  if (lower === 'critical' || lower === 'error') return 'critical';
  if (lower === 'warning' || lower === 'warn') return 'warning';
  return 'info';
}

function formatRelativeTime(ts: string | undefined | null): string {
  if (!ts) return 'just now';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0 || isNaN(diff)) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
