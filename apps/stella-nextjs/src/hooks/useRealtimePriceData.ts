/**
 * Real-time Price Data Hook
 *
 * Manages WebSocket connection for live price updates
 */

import { useEffect, useState, useCallback } from 'react';
import { subscribeBinanceWebSocket, BinanceInterval } from '@/lib/api/binance';
import { CandlestickData } from '@/lib/types/bot.types';

interface UseRealtimePriceDataOptions {
  symbol: string;
  interval: BinanceInterval;
  enabled?: boolean;
}

export function useRealtimePriceData({
  symbol,
  interval,
  enabled = true,
}: UseRealtimePriceDataOptions) {
  const [latestCandle, setLatestCandle] = useState<CandlestickData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    setIsConnected(true);
    setError(null);

    // Subscribe to WebSocket updates
    const unsubscribe = subscribeBinanceWebSocket(symbol, interval, (candle) => {
      setLatestCandle(candle);
    });

    // Cleanup on unmount
    return () => {
      setIsConnected(false);
      unsubscribe();
    };
  }, [symbol, interval, enabled]);

  return {
    latestCandle,
    isConnected,
    error,
  };
}
