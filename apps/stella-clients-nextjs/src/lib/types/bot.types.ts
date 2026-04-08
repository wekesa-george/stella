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
  gridConfig?: {
    upperPrice: number;
    lowerPrice: number;
    gridLevels: number;
    investmentPerGrid: number;
    totalInvestment: number;
  };

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
