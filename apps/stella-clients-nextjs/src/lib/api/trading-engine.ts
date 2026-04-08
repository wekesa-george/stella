/**
 * Trading Engine API Integration
 *
 * Integrates with our custom trading engine API to fetch bot data,
 * positions, orders, and performance metrics
 */

import { tradingEngineApi } from '../tradingEngineApi';
import { BotOrder, BotPosition } from '../types/bot.types';

/**
 * Fetch bot orders with enriched data
 */
export async function fetchBotOrders(botId: string): Promise<BotOrder[]> {
  try {
    const { data, error } = await tradingEngineApi.getBotOrders(botId);

    if (error) {
      console.warn('Trading engine API error:', error);
      // Return empty array instead of throwing to allow graceful degradation
      return [];
    }

    // Transform API response to our BotOrder type
    return (data?.orders || []).map((order: any) => ({
      id: order.id || order.order_id,
      botId: order.bot_id,
      symbol: order.symbol,
      side: order.side?.toLowerCase() as 'buy' | 'sell',
      price: parseFloat(order.price),
      quantity: parseFloat(order.quantity || order.amount),
      status: order.status,
      timestamp: order.created_at || order.timestamp,
      filledAt: order.filled_at,
      pnl: order.pnl ? parseFloat(order.pnl) : undefined,
    }));
  } catch (error) {
    console.error('Error fetching bot orders:', error);
    return [];
  }
}

/**
 * Fetch bot positions
 */
export async function fetchBotPositions(botId: string): Promise<BotPosition[]> {
  try {
    const { data, error } = await tradingEngineApi.getBotPositions(botId);

    if (error) {
      console.warn('Trading engine API error:', error);
      // Return empty array instead of throwing to allow graceful degradation
      return [];
    }

    return (data?.positions || []).map((position: any) => ({
      id: position.id || position.position_id,
      botId: position.bot_id,
      symbol: position.symbol,
      side: position.side,
      entryPrice: parseFloat(position.entry_price),
      currentPrice: parseFloat(position.current_price || position.mark_price),
      quantity: parseFloat(position.quantity || position.amount),
      pnl: parseFloat(position.pnl || position.unrealized_pnl),
      pnlPercentage: parseFloat(position.pnl_percentage || 0),
      openedAt: position.opened_at || position.created_at,
      closedAt: position.closed_at,
    }));
  } catch (error) {
    console.error('Error fetching bot positions:', error);
    return [];
  }
}

/**
 * Fetch bot details with full runtime data
 */
export async function fetchBotDetails(botId: string) {
  try {
    const { data, error } = await tradingEngineApi.getBot(botId);

    if (error) {
      throw new Error(error);
    }

    return data;
  } catch (error) {
    console.error('Error fetching bot details:', error);
    throw error;
  }
}

/**
 * Start a bot
 */
export async function startBot(botId: string) {
  return tradingEngineApi.startBot(botId);
}

/**
 * Pause a bot
 */
export async function pauseBot(botId: string) {
  return tradingEngineApi.pauseBot(botId);
}

/**
 * Stop a bot
 */
export async function stopBot(botId: string) {
  return tradingEngineApi.stopBot(botId);
}
