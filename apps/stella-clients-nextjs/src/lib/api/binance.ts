/**
 * Binance API Integration
 *
 * Provides functions to fetch candlestick data and market information from Binance
 */

import { CandlestickData } from '../types/bot.types';

const BINANCE_API_BASE = 'https://api.binance.com/api/v3';

export type BinanceInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// Binance returns arrays, not objects
// [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore]
type BinanceKline = [
  number,  // openTime
  string,  // open
  string,  // high
  string,  // low
  string,  // close
  string,  // volume
  number,  // closeTime
  string,  // quoteAssetVolume
  number,  // numberOfTrades
  string,  // takerBuyBaseAssetVolume
  string,  // takerBuyQuoteAssetVolume
  string   // ignore
];

/**
 * Fetch candlestick/kline data from Binance
 */
export async function fetchBinanceKlines(
  symbol: string,
  interval: BinanceInterval = '1h',
  limit: number = 500
): Promise<CandlestickData[]> {
  try {
    const url = `${BINANCE_API_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }

    const data: BinanceKline[] = await response.json();

    return data.map((kline) => ({
      time: Math.floor(kline[0] / 1000), // Convert milliseconds to seconds
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
    }));
  } catch (error) {
    console.error('Error fetching Binance klines:', error);
    throw error;
  }
}

/**
 * Fetch current price for a symbol
 */
export async function fetchBinancePrice(symbol: string): Promise<number> {
  try {
    const url = `${BINANCE_API_BASE}/ticker/price?symbol=${symbol}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }

    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error('Error fetching Binance price:', error);
    throw error;
  }
}

/**
 * Fetch 24h ticker statistics
 */
export async function fetchBinance24hStats(symbol: string) {
  try {
    const url = `${BINANCE_API_BASE}/ticker/24hr?symbol=${symbol}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      priceChange: parseFloat(data.priceChange),
      priceChangePercent: parseFloat(data.priceChangePercent),
      lastPrice: parseFloat(data.lastPrice),
      volume: parseFloat(data.volume),
      quoteVolume: parseFloat(data.quoteVolume),
      highPrice: parseFloat(data.highPrice),
      lowPrice: parseFloat(data.lowPrice),
    };
  } catch (error) {
    console.error('Error fetching Binance 24h stats:', error);
    throw error;
  }
}

/**
 * Subscribe to real-time price updates via WebSocket
 */
export function subscribeBinanceWebSocket(
  symbol: string,
  interval: BinanceInterval,
  onUpdate: (candle: CandlestickData) => void
): () => void {
  const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const kline = data.k;

    if (kline) {
      onUpdate({
        time: Math.floor(kline.t / 1000),
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
      });
    }
  };

  ws.onerror = (error) => {
    console.error('Binance WebSocket error:', error);
  };

  // Return cleanup function
  return () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  };
}
