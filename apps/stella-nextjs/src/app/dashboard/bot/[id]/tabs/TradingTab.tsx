"use client";

import { useState, useEffect } from "react";
import { getBotBars, placeManualOrder } from "@/lib/tradingEngineApi";
import { BotCandlestickChart } from "@/components/trading/BotCandlestickChart";
import BotLogPanel from "@/components/dashboard/BotLogPanel";
import type { CandlestickData, BotConfig, BotOrder, BotPosition } from "@/lib/types/bot.types";
import type { Bot } from "@/lib/types/dashboard";
import { fetchBotOrders, fetchBotPositions } from "@/lib/api/trading-engine";

interface Position {
  id: string;
  pair: string;
  side: string;
  entry: number;
  current: number;
  size: number;
  pnl: number;
  pnlPct: number;
  age: string;
}

// Timeframe map: display label → API param
const TIMEFRAMES: { label: string; api: string }[] = [
  { label: "1m", api: "1Min" },
  { label: "5m", api: "5Min" },
  { label: "15m", api: "15Min" },
  { label: "1h", api: "1Hour" },
  { label: "4h", api: "4Hour" },
  { label: "1D", api: "1Day" },
];

interface TradingTabProps {
  botId: string;
  bot: Bot;
  logEvents?: any[];
  positions: Position[];
  onClosePosition: (pos: Position) => void;
}

export default function TradingTab({ botId, bot, logEvents, positions, onClosePosition }: TradingTabProps) {
  const [activeTimeframe, setActiveTimeframe] = useState("1h");
  const [candleData, setCandleData] = useState<CandlestickData[]>([]);
  const [botOrders, setBotOrders] = useState<BotOrder[]>([]);
  const [botPositions, setBotPositions] = useState<BotPosition[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);

  // Manual order state
  const [newOrder, setNewOrder] = useState({ side: "LONG", size: "" });
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Build BotConfig for the chart component, including grid config if available
  const symbol = bot.tradingPairs?.[0]?.replace("/", "") || bot.pair?.replace("/", "") || "";
  const cfg = (bot as any).config || {};
  const isGridBot = cfg.upper_price != null && cfg.lower_price != null && cfg.grid_levels != null;
  const botConfig: BotConfig | null = symbol
    ? ({
        symbol,
        exchange: bot.exchange?.toLowerCase() || "binance",
        ...(isGridBot && {
          gridConfig: {
            upper_price: Number(cfg.upper_price),
            lower_price: Number(cfg.lower_price),
            grid_levels: Number(cfg.grid_levels) || 10,
            grid_type: cfg.grid_type || "arithmetic",
            quantity_per_grid: Number(cfg.quantity_per_grid) || 0,
            total_investment: Number(cfg.total_investment) || 0,
            stop_loss_price: cfg.stop_loss_price ? Number(cfg.stop_loss_price) : null,
            take_profit_price: cfg.take_profit_price ? Number(cfg.take_profit_price) : null,
            max_open_orders: Number(cfg.max_open_orders) || 20,
            fee_rate: Number(cfg.fee_rate) || 0.001,
            leverage: Number(cfg.leverage) || 1,
          },
        }),
      } as BotConfig)
    : null;

  async function loadChartData(timeframeLabel: string) {
    setIsLoadingChart(true);
    try {
      const tf = TIMEFRAMES.find(t => t.label === timeframeLabel);
      const apiTf = tf?.api || "5Min";

      // Try backend bars endpoint first (exchange-agnostic)
      const res = await getBotBars(botId, apiTf, 120);
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setCandleData(
          res.data.map((bar: any) => ({
            time: typeof bar.time === "number" ? bar.time : Math.floor(new Date(bar.time || bar.t).getTime() / 1000),
            open: Number(bar.open ?? bar.o),
            high: Number(bar.high ?? bar.h),
            low: Number(bar.low ?? bar.l),
            close: Number(bar.close ?? bar.c),
            volume: Number(bar.volume ?? bar.v ?? 0),
          }))
        );
      } else {
        setCandleData([]);
      }

      // Load orders + positions for markers
      const [orders, fetchedPositions] = await Promise.all([
        fetchBotOrders(botId),
        fetchBotPositions(botId),
      ]);
      setBotOrders(orders);
      setBotPositions(fetchedPositions);
    } catch (err) {
      console.error("Error loading chart data:", err);
      setCandleData([]);
    } finally {
      setIsLoadingChart(false);
    }
  }

  useEffect(() => {
    loadChartData(activeTimeframe);
  }, [botId, activeTimeframe]);

  const handleSubmitOrder = async () => {
    if (!newOrder.size) return;
    setOrderSubmitting(true);
    setOrderResult(null);
    try {
      const res = await placeManualOrder(botId, {
        side: newOrder.side,
        size: parseFloat(newOrder.size),
      });
      if (res.data) {
        const data = res.data as { price?: number; order_id?: string };
        setOrderResult({ type: "success", message: `Order filled @ $${data.price?.toFixed(2) || "market"}` });
        setNewOrder(o => ({ ...o, size: "" }));
      } else {
        setOrderResult({ type: "error", message: res.error || "Order failed" });
      }
    } catch (e: any) {
      setOrderResult({ type: "error", message: e.message || "Network error" });
    } finally {
      setOrderSubmitting(false);
      setTimeout(() => setOrderResult(null), 5000);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Candlestick Chart */}
      <div className="bg-[#080c10] border border-[#1e2d40] rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1e2d40] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] font-semibold text-[#e8edf3]">{symbol || bot.pair}</span>
            <div className="flex gap-0.5">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setActiveTimeframe(t.label)}
                  className={`px-2 py-1 border border-[#1e2d40] font-mono text-[10px] rounded-sm transition-all ${
                    activeTimeframe === t.label
                      ? "bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border-[rgba(61,157,243,0.35)]"
                      : "bg-transparent text-[#5a7090] hover:text-[#e8edf3] hover:border-[#253550]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="h-[480px]">
          {isLoadingChart ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFD700] mx-auto" />
                <p className="mt-4 text-[#8fa3b8] text-xs">Loading chart data...</p>
              </div>
            </div>
          ) : candleData.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-[#5a7090] text-2xl mb-3">📊</div>
                <p className="text-[#8fa3b8] text-sm">No chart data available</p>
                <button
                  onClick={() => loadChartData(activeTimeframe)}
                  className="mt-4 px-4 py-2 rounded-sm bg-[#FFD700] text-black text-xs font-bold uppercase hover:bg-[#FFE44D] transition-all"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : botConfig ? (
            <BotCandlestickChart
              candles={candleData}
              botConfig={botConfig}
              orders={botOrders}
              positions={botPositions}
            />
          ) : null}
        </div>
      </div>

      {/* Open Positions Table */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded-md overflow-hidden">
        <div className="px-4 py-2 border-b border-[#1e2d40] font-mono text-[9px] uppercase tracking-wider text-[#5a7090] flex items-center justify-between">
          <span>Open Positions — {symbol || bot.pair}</span>
          <span className="text-[#5a7090]">
            {positions.length} position{positions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          {positions.length === 0 ? (
            <div className="px-4 py-8 text-center font-mono text-[11px] text-[#5a7090]">
              No open positions
            </div>
          ) : (
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-[#1e2d40]">
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">Side</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">Entry</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">Mark</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">Size</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">PnL %</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">Age</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]"></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-b border-[#1e2d40] hover:bg-[#131920] transition-colors">
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wide font-mono ${
                        p.side === "LONG"
                          ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                          : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                      }`}>{p.side}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{p.entry.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{p.current.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{p.size}</td>
                    <td className="px-3 py-2 font-mono text-[11px] font-semibold" style={{ color: p.pnlPct >= 0 ? "#00e5a0" : "#ff4757" }}>
                      {p.pnlPct >= 0 ? "+" : ""}{p.pnlPct}%
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#5a7090]">{p.age}</td>
                    <td className="px-3 py-2">
                      <button
                        className="px-2 py-1 rounded-sm text-[9px] font-semibold uppercase tracking-wide cursor-pointer border transition-all bg-[rgba(245,166,35,0.10)] text-[#f5a623] border-[rgba(245,166,35,0.3)] hover:bg-[#f5a623] hover:text-black"
                        onClick={() => onClosePosition(p)}
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Manual Order Panel */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
          <span className="text-xs font-semibold text-foreground">Manual Order</span>
        </div>
        <div className="p-3 sm:p-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2 sm:gap-2.5 lg:items-end">
            <div>
              <div className="text-[9px] text-[#5a7090] uppercase tracking-widest mb-1">Pair</div>
              <div className="bg-dark border border-dark rounded text-foreground text-xs px-2.5 py-1.5 font-mono opacity-80">
                {bot?.pair || "—"}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#5a7090] uppercase tracking-widest mb-1">Side</div>
              <div className="flex gap-0">
                {["LONG", "SHORT"].map(s => (
                  <button
                    key={s}
                    onClick={() => setNewOrder(o => ({...o, side: s}))}
                    className={`px-3.5 py-1.5 text-[11px] font-bold uppercase border border-dark transition-all ${
                      s === "LONG" ? "rounded-l-sm" : "rounded-r-sm"
                    } ${
                      newOrder.side === s
                        ? s === "LONG"
                          ? "bg-[#00e5a0] text-black"
                          : "bg-[#ff4757] text-white"
                        : "bg-dark-elevated text-[#8fa3b8]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-full sm:w-auto">
              <div className="text-[9px] text-[#5a7090] uppercase tracking-widest mb-1">Size</div>
              <input
                placeholder="0.00"
                value={newOrder.size}
                onChange={e => setNewOrder(o => ({...o, size: e.target.value}))}
                className="w-full sm:w-24 bg-dark-elevated border border-dark rounded-sm px-2.5 py-1.5 text-foreground text-xs font-mono outline-none focus:border-dark-2"
              />
            </div>
            <button
              disabled={orderSubmitting || !newOrder.size || bot?.status !== "running"}
              onClick={handleSubmitOrder}
              className={`w-full sm:w-auto sm:col-span-2 lg:col-span-1 px-5 py-1.5 rounded-sm text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                orderSubmitting || !newOrder.size || bot?.status !== "running"
                  ? "bg-dark-2 text-[#5a7090] cursor-not-allowed"
                  : "bg-[#FFD700] text-black hover:bg-[#FFE44D]"
              }`}
            >
              {orderSubmitting ? "Submitting..." : "Submit Order"}
            </button>
          </div>
          {orderResult && (
            <div className={`mt-2 text-[11px] px-2 py-1 rounded ${
              orderResult.type === "success" ? "text-[#00e5a0] bg-[#00e5a0]/10" : "text-[#ff4757] bg-[#ff4757]/10"
            }`}>
              {orderResult.message}
            </div>
          )}
          {bot?.status !== "running" && (
            <div className="mt-2 text-[10px] text-[#5a7090]">Bot must be running to place manual orders</div>
          )}
        </div>
      </div>

      {/* Bot Logs */}
      <BotLogPanel botId={botId} channelEvents={logEvents} />
    </div>
  );
}
