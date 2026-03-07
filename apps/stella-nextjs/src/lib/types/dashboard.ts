// TypeScript types for dashboard

export type BotStatus =
  | "running"
  | "paused"
  | "stopped"
  | "initializing"
  | "error"
  | "circuit_broken"
  | "maintenance"
  | "stopping";

export interface Bot {
  id: string;
  name: string;
  user: string;
  serviceAccountId: string | null;
  credentialId: string | null;
  strategyId: string | null;
  strategy: string;
  exchange: string;
  pair: string;
  tradingPairs: string[];
  status: BotStatus;
  pnl: number;
  pnlPct: number;
  equity: number;
  allocatedCapital: number;
  activeCapital: number;
  openPositions: number;
  trades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  errorCount: number;
  lastError: string | null;
  lastHeartbeat: number;
  startedAt: string | null;
  createdAt: string | null;
  cpu: number;
  ram: number;
  uptime: string;
  initStep: string | null;
  marketType: string;
}

export interface BeamMetrics {
  cpuPercent: number;       // run_queue / scheduler_count * 100
  totalMemoryMb: number;
  processMemoryMb: number;
  etsMemoryMb: number;
  atomMemoryMb: number;
  processCount: number;
  processLimit: number;
  schedulerCount: number;
  runQueue: number;
  ioInputMb: number;
  ioOutputMb: number;
  uptimeSeconds: number;
}

export interface EtsMetrics {
  totalEntries: number;
  totalMemoryBytes: number;
  tableCount: number;
}

export interface DbPoolMetrics {
  poolSize: number;
  status: string;
  latencyMs: number;
}

export interface TradeEngineMetrics {
  beam: BeamMetrics;
  ets: EtsMetrics;
  dbPool: DbPoolMetrics;
  collectedAt: string | null;
}

export interface Alert {
  id: number;
  msg: string;
  sev: "critical" | "warning" | "info";
  service: string;
  time: string;
  acked: boolean;
}

export interface ChartDataPoint {
  t: number;
  value: number;
}

export interface InfraHistoryPoint {
  t: number;
  cpu: number;
  ram: number;
}

export type ServiceHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ServiceHealth {
  service_name: string;
  category: string;
  environment: string;
  status: ServiceHealthStatus;
  message: string;
  response_time_ms: number;
  checked_at: string;
  description?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  type: "trader" | "follower" | "both";
  status: "active" | "inactive" | "suspended";
  verified: boolean;
  joinDate: string;
  lastActive: string;
  totalTrades: number;
  followers: number;
  following: number;
  totalPnl: number;
  winRate: number;
  copyTrading: boolean;
  verificationLevel: "unverified" | "basic" | "advanced" | "full";
  avatar?: string;
}

export interface UserTransaction {
  id: string;
  type: "deposit" | "withdrawal" | "trade" | "fee";
  amount: number;
  currency: string;
  status: "completed" | "pending" | "failed";
  timestamp: string;
  description: string;
}

export interface UserActivity {
  id: string;
  type: "login" | "trade" | "withdraw" | "deposit" | "settings_change";
  description: string;
  timestamp: string;
  ip?: string;
}
