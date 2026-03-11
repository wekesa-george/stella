/**
 * Bot Fleet Configuration
 *
 * Defines the two main bots:
 * - BOT-0001: Paper trading bot using Alpaca
 * - BOT-0002: Live trading bot using Binance
 */

import { BotConfig } from '../types/bot.types';

export const BOT_FLEET: Record<string, BotConfig> = {
  'BOT-0001': {
    id: 'BOT-0001',
    name: 'Paper Trading Grid Bot',
    type: 'paper',
    exchange: 'alpaca',
    status: 'active',
    symbol: 'BTC/USD',
    strategy: 'grid',

    gridConfig: {
      upper_price: 105000,
      lower_price: 85000,
      grid_levels: 20,
      grid_type: 'geometric',
      quantity_per_grid: 0,
      total_investment: 10000,
      stop_loss_price: null,
      take_profit_price: null,
      max_open_orders: 20,
      fee_rate: 0.001,
    },

    apiConfig: {
      baseUrl: 'https://paper-api.alpaca.markets',
      useWebSocket: true,
    },

    performance: {
      totalPnL: 1250.50,
      totalPnLPercentage: 12.51,
      totalTrades: 48,
      winRate: 72.5,
      avgProfitPerTrade: 26.05,
    },

    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: new Date().toISOString(),
  },

  'BOT-0002': {
    id: 'BOT-0002',
    name: 'BINA BTC/USDT Grid Bot',
    type: 'live',
    exchange: 'binance',
    status: 'active',
    symbol: 'BTCUSDT',
    strategy: 'grid',

    gridConfig: {
      upper_price: 68500,
      lower_price: 65000,
      grid_levels: 40,
      grid_type: 'geometric',
      quantity_per_grid: 0,
      total_investment: 10000,
      stop_loss_price: null,
      take_profit_price: null,
      max_open_orders: 40,
      fee_rate: 0.001,
    },

    apiConfig: {
      baseUrl: 'http://170.168.103.207:4000',
      useWebSocket: true,
    },

    performance: {
      totalPnL: 2847.30,
      totalPnLPercentage: 28.47,
      totalTrades: 156,
      winRate: 85.3,
      avgProfitPerTrade: 18.25,
    },

    createdAt: '2023-09-10T08:00:00Z',
    updatedAt: new Date().toISOString(),
  },
};

export function getBotConfig(botId: string): BotConfig | undefined {
  return BOT_FLEET[botId];
}

export function getAllBots(): BotConfig[] {
  return Object.values(BOT_FLEET);
}

export function getBotsByType(type: 'paper' | 'live'): BotConfig[] {
  return Object.values(BOT_FLEET).filter(bot => bot.type === type);
}
