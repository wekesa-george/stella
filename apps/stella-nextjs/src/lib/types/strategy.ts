export type StrategyType =
  | 'core_momentum'
  | 'core_grid'
  | 'core_dca'
  | 'core_mean_reversion'
  | 'core_trend_following'
  | 'core_arbitrage'
  | 'custom_rule_based'
  | 'custom_config';

export type StrategyStatus =
  | 'draft'
  | 'backtesting'
  | 'validated'
  | 'active'
  | 'paused'
  | 'archived';

export interface Strategy {
  id: string;
  name: string;
  description: string | null;
  type: StrategyType;
  status: StrategyStatus;
  version: number;
  timeframe: string | null;
  is_core: boolean;
  is_public: boolean;
  is_backtest_enabled: boolean;
  is_live_enabled: boolean;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  max_position_size_pct: number | null;
  supported_pairs: string[];
  supported_exchanges: string[];
  config: Record<string, any>;
  entry_conditions: Record<string, any> | null;
  exit_conditions: Record<string, any> | null;
  position_sizing: Record<string, any> | null;
  indicators: Record<string, any> | null;
  inserted_at: string;
  updated_at: string;
}

export interface StrategyFormData {
  name: string;
  description?: string;
  type: StrategyType;
  status?: StrategyStatus;
  timeframe?: string;
  is_core?: boolean;
  is_public?: boolean;
  is_backtest_enabled?: boolean;
  is_live_enabled?: boolean;
  stop_loss_pct?: number;
  take_profit_pct?: number;
  max_position_size_pct?: number;
  supported_pairs?: string[];
  supported_exchanges?: string[];
  config?: Record<string, any>;
}
