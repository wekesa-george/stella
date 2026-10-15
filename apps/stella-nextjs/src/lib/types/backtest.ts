export type BacktestStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface BacktestRun {
  id: string;
  strategy_id: string;
  user_id: string;
  status: BacktestStatus;
  trading_pair: string;
  exchange_code: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  initial_capital_usd: number;
  config_snapshot: Record<string, any>;

  // Result metrics
  final_capital_usd: number | null;
  total_return_pct: number | null;
  max_drawdown_pct: number | null;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  calmar_ratio: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  total_trades: number | null;
  winning_trades: number | null;
  losing_trades: number | null;
  avg_trade_return_pct: number | null;
  avg_win_pct: number | null;
  avg_loss_pct: number | null;
  largest_win_usd: number | null;
  largest_loss_usd: number | null;
  avg_hold_duration_sec: number | null;

  // Detailed data
  equity_curve: EquityPoint[] | null;
  trade_log: TradeLogEntry[] | null;

  // Progress
  progress_pct: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  elixir_node: string | null;
  candles_processed: number;
  execution_time_ms: number | null;
  metadata: Record<string, any>;

  created_at: string;
  updated_at: string;
}

export interface EquityPoint {
  time: string;
  equity: number;
}

export interface TradeLogEntry {
  [key: string]: any;
}

export interface BacktestFormData {
  strategy_id: string;
  user_id: string;
  trading_pair: string;
  exchange_code: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  initial_capital_usd: number;
  config_overrides?: Record<string, any>;
  metadata?: Record<string, any>;
}
