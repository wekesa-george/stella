import { useEffect, useRef, useCallback, useState } from 'react';
import { Channel } from 'phoenix';
import { joinChannel, leaveChannel, getSocketVersion, onSocketVersionChange } from '@/lib/phoenixSocket';

const LOG_PREFIX = '[usePhoenixChannel]';

/**
 * Generic hook to subscribe to a Phoenix channel and listen for events.
 *
 * @param topic - Channel topic (e.g. "bot:lobby", "positions:abc-123")
 * @param events - Map of event names to handler callbacks
 * @param enabled - Whether to connect (default true)
 */
export function usePhoenixChannel(
  topic: string,
  events: Record<string, (payload: any) => void>,
  enabled: boolean = true,
) {
  const channelRef = useRef<Channel | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Re-join channels when socket reconnects (e.g. after token arrives)
  const [sockVer, setSockVer] = useState(() => getSocketVersion());
  useEffect(() => onSocketVersionChange(setSockVer), []);

  useEffect(() => {
    if (!enabled || !topic) return;

    console.log(LOG_PREFIX, `Effect RUN → joining "${topic}" (sockVer=${sockVer})`);
    const channel = joinChannel(topic);
    channelRef.current = channel;

    const refs: number[] = [];
    for (const [event] of Object.entries(eventsRef.current)) {
      const ref = channel.on(event, (payload) => {
        console.log(LOG_PREFIX, `[${topic}] EVENT "${event}"`, typeof payload === 'object' ? `keys=${Object.keys(payload).join(',')}` : payload);
        eventsRef.current[event]?.(payload);
      });
      refs.push(ref);
    }

    return () => {
      console.log(LOG_PREFIX, `Effect CLEANUP → leaving "${topic}"`);
      refs.forEach((ref, i) => {
        const event = Object.keys(eventsRef.current)[i];
        channel.off(event, ref);
      });
      leaveChannel(topic);
      channelRef.current = null;
    };
  }, [topic, enabled, sockVer]);

  const push = useCallback(
    (event: string, payload?: Record<string, any>) => {
      return channelRef.current?.push(event, payload || {});
    },
    [],
  );

  return { push, channel: channelRef.current };
}

// ==================== TYPED CHANNEL HOOKS ====================

// --- Bots ---

export interface BotSnapshot {
  id: string;
  name: string;
  status: string;
  user_id?: string;
  service_account_id?: string | null;
  credential_id?: string | null;
  strategy_id?: string | null;
  strategy?: string;
  exchange?: string;
  pair?: string;
  trading_pairs?: string[];
  config?: Record<string, any>;
  uptime_seconds?: number;
  total_pnl?: number;
  total_trades?: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate?: number;
  open_positions?: number;
  allocated_capital?: number;
  active_capital?: number;
  error_count?: number;
  last_error?: string | null;
  started_at?: string | null;
  stopped_at?: string | null;
  last_heartbeat?: string | null;
  last_trade_at?: string | null;
  created_at?: string | null;
  init_step?: string | null;
  // Legacy field aliases (kept for backward compat)
  pnl_usd?: number;
  trade_count?: number;
}

export interface BotLogEvent {
  id: string;
  bot_id: string;
  level: string;
  category: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useBotChannel(botId?: string) {
  const topic = botId ? `bot:${botId}` : 'bot:lobby';
  const [bots, setBots] = useState<BotSnapshot[]>([]);
  const [snapshot, setSnapshot] = useState<BotSnapshot | null>(null);
  const [logEvents, setLogEvents] = useState<BotLogEvent[]>([]);

  const upsertBot = useCallback((bot: BotSnapshot) => {
    setBots((prev) => {
      const idx = prev.findIndex((b) => b.id === bot.id);
      if (idx === -1) return [...prev, bot];
      const next = [...prev];
      next[idx] = bot;
      return next;
    });
  }, []);

  const removeBot = useCallback((botId: string) => {
    setBots((prev) => prev.filter((b) => b.id !== botId));
  }, []);

  const { push } = usePhoenixChannel(topic, {
    bot_list: (payload: { bots: BotSnapshot[] }) => setBots(payload.bots),
    bot_snapshot: (payload: BotSnapshot) => setSnapshot(payload),
    bot_started: (payload: BotSnapshot) => {
      setSnapshot(payload);
      upsertBot(payload);
    },
    bot_stopped: (payload: BotSnapshot) => {
      setSnapshot(payload);
      upsertBot(payload);
    },
    bot_updated: (payload: BotSnapshot) => {
      setSnapshot(payload);
      upsertBot(payload);
    },
    bot_heartbeat: (payload: any) => {
      setSnapshot((prev) => (prev ? { ...prev, ...payload } : payload));
      setBots((prev) =>
        prev.map((b) => (b.id === payload.bot_id ? { ...b, ...payload } : b)),
      );
    },
    bot_error: (payload: { bot_id: string; error: string }) => {
      console.error(`Bot ${payload.bot_id} error:`, payload.error);
      setBots((prev) =>
        prev.map((b) =>
          b.id === payload.bot_id
            ? { ...b, status: 'error', last_error: payload.error, error_count: (b.error_count ?? 0) + 1 }
            : b,
        ),
      );
    },
    bot_transition: (payload: { bot_id: string; from_status: string; to_status: string }) => {
      setBots((prev) =>
        prev.map((b) =>
          b.id === payload.bot_id ? { ...b, status: payload.to_status } : b,
        ),
      );
      setSnapshot((prev) =>
        prev && prev.id === payload.bot_id ? { ...prev, status: payload.to_status } : prev,
      );
    },
    bot_init_step: (payload: { bot_id: string; init_step: string }) => {
      setBots((prev) =>
        prev.map((b) =>
          b.id === payload.bot_id ? { ...b, init_step: payload.init_step } : b,
        ),
      );
      setSnapshot((prev) =>
        prev && prev.id === payload.bot_id ? { ...prev, init_step: payload.init_step } : prev,
      );
    },
    bot_log: (payload: BotLogEvent) => {
      setLogEvents((prev) => [...prev, payload]);
    },
  });

  const startBot = useCallback(
    (id: string) => push('start_bot', { bot_id: id }),
    [push],
  );
  const stopBot = useCallback(
    (id: string) => push('stop_bot', { bot_id: id }),
    [push],
  );
  const pauseBot = useCallback(
    (id: string) => push('pause_bot', { bot_id: id }),
    [push],
  );

  return { bots, snapshot, startBot, stopBot, pauseBot, removeBot, logEvents };
}

// --- Positions ---

export interface PositionData {
  id: string;
  bot_id: string;
  symbol: string;
  side: string;
  entry_price: string;
  current_price: string;
  quantity: string;
  unrealized_pnl: string;
  status: string;
  opened_at: string;
}

export function usePositionChannel(botId?: string) {
  const topic = botId ? `positions:${botId}` : 'positions:lobby';
  const [stats, setStats] = useState<any>(null);
  const [positions, setPositions] = useState<PositionData[]>([]);

  const { push } = usePhoenixChannel(topic, {
    positions_stats: (payload: any) => setStats(payload),
    position_opened: (payload: PositionData) => {
      setPositions((prev) => [payload, ...prev]);
    },
    position_closed: (payload: PositionData) => {
      setPositions((prev) => prev.filter((p) => p.id !== payload.id));
    },
    position_pnl_update: (payload: any) => {
      setPositions((prev) =>
        prev.map((p) =>
          p.id === payload.position_id ? { ...p, ...payload } : p,
        ),
      );
    },
    pnl_batch_update: (payload: { positions: any[] }) => {
      const updates = new Map(payload.positions.map((u) => [u.id || u.position_id, u]));
      setPositions((prev) =>
        prev.map((p) => {
          const upd = updates.get(p.id);
          return upd ? { ...p, ...upd } : p;
        }),
      );
    },
  });

  const closePosition = useCallback(
    (positionId: string) => push('close_position', { position_id: positionId }),
    [push],
  );

  return { stats, positions, closePosition };
}

// --- Orders ---

export interface OrderData {
  id: string;
  bot_id: string;
  symbol: string;
  side: string;
  order_type: string;
  price: string;
  quantity: string;
  filled_quantity: string;
  status: string;
  created_at: string;
}

export function useOrderChannel(botId?: string) {
  const topic = botId ? `orders:${botId}` : 'orders:lobby';
  const [orders, setOrders] = useState<OrderData[]>([]);

  const { push } = usePhoenixChannel(topic, {
    order_created: (payload: OrderData) => {
      setOrders((prev) => [payload, ...prev]);
    },
    order_filled: (payload: OrderData) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === payload.id ? { ...o, ...payload } : o)),
      );
    },
    order_cancelled: (payload: OrderData) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === payload.id ? { ...o, ...payload } : o)),
      );
    },
    order_failed: (payload: { order_id: string; reason: string }) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === payload.order_id ? { ...o, status: 'failed' } : o,
        ),
      );
    },
  });

  const cancelOrder = useCallback(
    (orderId: string) => push('cancel_order', { order_id: orderId }),
    [push],
  );

  return { orders, cancelOrder };
}

// --- Market Data ---

export interface TickerUpdate {
  exchange: string;
  symbol: string;
  price: string;
}

export function useMarketDataChannel(pair: string, exchange?: string) {
  const topic = exchange ? `market_data:${exchange}:${pair}` : `market_data:${pair}`;
  const [ticker, setTicker] = useState<TickerUpdate | null>(null);
  const [orderFlow, setOrderFlow] = useState<any>(null);

  usePhoenixChannel(topic, {
    ticker_update: (payload: TickerUpdate) => setTicker(payload),
    ticker_data: (payload: any) => setTicker(payload),
    order_flow_update: (payload: any) => setOrderFlow(payload),
    candle_closed: () => {},
    kline_update: () => {},
  }, !!pair);

  return { ticker, orderFlow };
}

// --- Infrastructure ---

export interface ServiceHealthData {
  service_name: string;
  category: string;
  environment: string;
  status: string;
  message: string;
  response_time_ms: number;
  checked_at: string;
}

export function useInfraChannel() {
  const [metrics, setMetrics] = useState<any>(null);
  const [exchangeHealth, setExchangeHealth] = useState<any[]>([]);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealthData[]>([]);

  usePhoenixChannel('infra:metrics', {
    infra_snapshot: (payload: any) => setMetrics(payload),
    infra_update: (payload: any) => setMetrics(payload),
    exchange_health_snapshot: (payload: { exchanges: any[] }) =>
      setExchangeHealth(payload.exchanges),
    exchange_health: (payload: any) => {
      setExchangeHealth((prev) =>
        prev.map((e) => (e.id === payload.id ? { ...e, ...payload } : e)),
      );
    },
    service_health_snapshot: (payload: { services: ServiceHealthData[] }) =>
      setServiceHealth(payload.services),
    service_health_update: (payload: ServiceHealthData) => {
      setServiceHealth((prev) => {
        const idx = prev.findIndex((s) => s.service_name === payload.service_name);
        if (idx === -1) return [...prev, payload];
        const next = [...prev];
        next[idx] = payload;
        return next;
      });
    },
  });

  return { metrics, exchangeHealth, serviceHealth };
}

// --- Platform Stats ---

export function usePlatformChannel() {
  const [stats, setStats] = useState<any>(null);
  const [tradingStats, setTradingStats] = useState<any>(null);

  usePhoenixChannel('platform:stats', {
    platform_snapshot: (payload: any) => setStats(payload),
    platform_stats_update: (payload: any) => setStats(payload),
    trading_stats_update: (payload: any) => setTradingStats(payload),
    physics_stats_update: () => {},
  });

  return { stats, tradingStats };
}

// --- Alerts ---

export interface AlertData {
  id: string;
  category: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export function useAlertChannel() {
  const [alerts, setAlerts] = useState<AlertData[]>([]);

  const { push } = usePhoenixChannel('alerts:platform', {
    new_alert: (payload: AlertData) => {
      setAlerts((prev) => [payload, ...prev]);
    },
  });

  const acknowledgeAlert = useCallback(
    (alertId: string) => push('acknowledge_alert', { alert_id: alertId }),
    [push],
  );

  return { alerts, acknowledgeAlert };
}
