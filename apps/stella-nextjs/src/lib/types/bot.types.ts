/**
 * Bot Types and Interfaces
 */

export type BotType = 'paper' | 'live';
export type ExchangeType = 'binance' | 'alpaca';
export type BotStatus = 'active' | 'paused' | 'stopped' | 'error';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'filled' | 'pending' | 'cancelled' | 'failed';

export interface BotConfig {
  id: string;
  name: string;
  type: BotType;
  exchange: ExchangeType;
  status: BotStatus;
  symbol: string; // e.g., 'BTCUSDT', 'BTC/USD'
  strategy: 'grid' | 'dca' | 'arbitrage';

  // Grid strategy specific
  gridConfig?: GridBotConfig;

  // API configuration
  apiConfig: {
    baseUrl: string;
    useWebSocket?: boolean;
  };

  // Performance metrics
  performance?: {
    totalPnL: number;
    totalPnLPercentage: number;
    totalTrades: number;
    winRate: number;
    avgProfitPerTrade: number;
  };

  createdAt: string;
  updatedAt: string;
}

/**
 * Full grid bot configuration — maps to Elixir GridBot.default_config()
 * and the strategy.config JSON field in the DB.
 */
export interface GridBotConfig {
  // Required: grid boundaries
  upper_price: number;
  lower_price: number;

  // Grid structure
  grid_levels: number;          // number of grid lines (default 10)
  grid_type: 'arithmetic' | 'geometric';  // spacing type (default arithmetic)

  // Capital allocation
  total_investment: number;     // total capital in USD
  quantity_per_grid: number;    // base asset qty per grid (0 = auto-calc from total_investment)

  // Risk management
  stop_loss_price: number | null;       // emergency exit below grid
  take_profit_price: number | null;     // close all above this

  // Execution
  max_open_orders: number;      // exchange order limit (default 20)
  fee_rate: number;             // per-side fee rate (default 0.001 = 0.1%)

  // Leverage (futures only)
  leverage: number;             // 1 = no leverage, 2-125 = leveraged (default 1)

  // Computed (read-only, shown in UI)
  grid_spacing_pct?: number;    // % between levels
  profit_per_grid_pct?: number; // spacing - 2*fee = net profit per round trip
  estimated_daily_trades?: number;
}

export interface BotOrder {
  id: string;
  botId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  status: OrderStatus;
  timestamp: string;
  filledAt?: string;
  pnl?: number;
}

export interface BotPosition {
  id: string;
  botId: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  pnl: number;
  pnlPercentage: number;
  openedAt: string;
  closedAt?: string;
}

export interface CandlestickData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartMarker {
  time: number;
  position: 'belowBar' | 'aboveBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
  size: number;
}

export interface BotGridLevel {
  price: number;
  isBuyLevel: boolean;
  isFilled: boolean;
  orderId?: string;
}
