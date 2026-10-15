// TypeScript types for dashboard

export interface Bot {
  id: string;
  name: string;
  user: string;
  strategy: string;
  exchange: string;
  pair: string;
  status: "running" | "paused" | "error";
  pnl: number;
  pnlPct: number;
  equity: number;
  openPositions: number;
  trades: number;
  winRate: number;
  lastHeartbeat: number;
  cpu: number;
  ram: number;
  uptime: string;
}

export interface InfraMetric {
  cpu: number;
  ram: number;
  disk: number;
}

export interface InfraMetrics {
  phoenix: InfraMetric;
  postgres: InfraMetric;
  rabbitmq: InfraMetric;
  redis: InfraMetric;
  botWorker: InfraMetric;
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
