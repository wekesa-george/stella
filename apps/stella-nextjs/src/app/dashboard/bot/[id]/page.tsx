"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateBots, generatePositions, generateEquityCurve, PAIRS } from "@/lib/data/generators";
import type { Bot } from "@/lib/types/dashboard";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { getBotConfig } from "@/lib/config/bot-fleet";
import { fetchBinanceKlines } from "@/lib/api/binance";
import { fetchBotOrders, fetchBotPositions } from "@/lib/api/trading-engine";
import { BotCandlestickChart } from "@/components/trading/BotCandlestickChart";
import type { CandlestickData, BotOrder, BotPosition, BotConfig } from '@/lib/types/bot.types';

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

export default function BotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [bot, setBot] = useState<Bot | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [equityCurve, setEquityCurve] = useState<any[]>([]);
  const [closePos, setClosePos] = useState<Position | null>(null);
  const [newOrder, setNewOrder] = useState({ pair: "", side: "LONG", size: "", price: "" });

  // Chart state
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null);
  const [candleData, setCandleData] = useState<CandlestickData[]>([]);
  const [botOrders, setBotOrders] = useState<BotOrder[]>([]);
  const [botPositions, setBotPositions] = useState<BotPosition[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);

  useEffect(() => {
    // Find the bot from generated data
    const bots = generateBots(18);
    const foundBot = bots.find(b => b.id === params.id);

    if (foundBot) {
      setBot(foundBot);
      setPositions(generatePositions(foundBot.id, foundBot.pair));
      setEquityCurve(generateEquityCurve(60, foundBot.equity, 0.015));
      setNewOrder(prev => ({ ...prev, pair: foundBot.pair }));

      // Load real trading data for BOT-0001 and BOT-0002
      if (params.id === 'BOT-0001' || params.id === 'BOT-0002') {
        loadRealBotData(params.id as string);
      }
    }
  }, [params.id]);

  async function loadRealBotData(botId: string) {
    try {
      setIsLoadingChart(true);

      const config = getBotConfig(botId);
      if (!config) return;

      setBotConfig(config);

      const symbol = config.exchange === 'binance' ? config.symbol : 'BTCUSDT';

      // Fetch all data in parallel (120 candles for better zoom, matching /trading page)
      const [klines, orders, positions] = await Promise.all([
        fetchBinanceKlines(symbol, '1h', 120).catch((err) => {
          console.error('Binance API error:', err);
          return [];
        }),
        fetchBotOrders(botId),
        fetchBotPositions(botId),
      ]);

      console.log('Loaded chart data:', {
        candlesCount: klines.length,
        ordersCount: orders.length,
        positionsCount: positions.length,
      });

      setCandleData(klines);
      setBotOrders(orders);
      setBotPositions(positions);
    } catch (err) {
      console.error('Error loading real bot data:', err);
    } finally {
      setIsLoadingChart(false);
    }
  }

  const handleClosePos = (pos: Position) => {
    setPositions(prev => prev.filter(p => p.id !== pos.id));
    setClosePos(null);
  };

  if (!bot) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[#8fa3b8]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header Section */}
      <div className="bg-background border-b border-dark">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <button
              onClick={() => router.push('/dashboard/bot-fleet')}
              className="text-[#5a7090] hover:text-[#00e5a0] transition-colors"
            >
              Bot Fleet
            </button>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#00e5a0]">{bot.id}</span>
          </div>

          {/* Bot header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <button
              onClick={() => router.push('/dashboard/bot-fleet')}
              className="px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-[#1e2d40] hover:border-[#253550] hover:text-foreground transition-all self-start sm:self-auto whitespace-nowrap"
            >
              ← Back
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-sm font-bold text-foreground">{bot.id}</span>
                <span
                  className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm ${
                    bot.status === "running" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                    bot.status === "paused" ? "bg-[rgba(245,166,35,0.12)] text-[#f5a623]" :
                    "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
                  }`}
                >
                  {bot.status}
                </span>
              </div>
              <div className="text-[11px] text-[#5a7090] mt-0.5">
                {bot.name} · {bot.exchange} · {bot.pair} · {bot.user}
              </div>
            </div>
            <div className="flex gap-2 sm:ml-auto">
              <button className="flex-1 sm:flex-none px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(245,166,35,0.12)] text-[#f5a623] border border-[rgba(245,166,35,0.3)] hover:bg-[#f5a623] hover:text-black transition-all whitespace-nowrap">
                {bot.status === "paused" ? "Resume" : "Pause"}
              </button>
              <button className="flex-1 sm:flex-none px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,71,87,0.12)] text-[#ff4757] border border-[rgba(255,71,87,0.3)] hover:bg-[#ff4757] hover:text-white transition-all whitespace-nowrap">
                Kill Bot
              </button>
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {[
              ["Session P&L", `${bot.pnl >= 0 ? "+" : ""}$${bot.pnl.toFixed(2)}`, bot.pnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"],
              ["Win Rate", `${bot.winRate}%`, ""],
              ["Total Trades", bot.trades, ""],
              ["Open Pos", bot.openPositions, ""],
              ["Uptime", bot.uptime, ""],
            ].map(([label, val, cls]) => (
              <div key={label} className="bg-dark-elevated border border-dark rounded-md p-3.5">
                <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">{label}</div>
                <div className={`font-mono text-lg font-semibold ${cls || "text-foreground"}`}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable Content Section */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">

          {/* Chart & Positions - Only show for BOT-0001 and BOT-0002 */}
          {(params.id === 'BOT-0001' || params.id === 'BOT-0002') && botConfig && (
            <>
              {/* Candlestick Chart */}
              <div className="bg-[#080c10] border border-[#1e2d40] rounded-md overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#1e2d40] flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[13px] font-semibold text-[#e8edf3]">{botConfig.symbol}</span>
                    <div className="flex gap-0.5">
                      {["1m", "5m", "15m", "1h", "4h", "1D"].map((t) => (
                        <button
                          key={t}
                          className={`px-2 py-1 border border-[#1e2d40] font-mono text-[10px] rounded-sm transition-all ${
                            t === "1h"
                              ? "bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border-[rgba(61,157,243,0.35)]"
                              : "bg-transparent text-[#5a7090] hover:text-[#e8edf3] hover:border-[#253550]"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="h-[480px]">
                  {isLoadingChart ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00e5a0] mx-auto" />
                        <p className="mt-4 text-[#8fa3b8] text-xs">Loading chart data...</p>
                      </div>
                    </div>
                  ) : candleData.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="text-[#ff4757] text-2xl mb-3">⚠️</div>
                        <p className="text-[#8fa3b8] text-sm">Unable to load chart data</p>
                        <button
                          onClick={() => loadRealBotData(params.id as string)}
                          className="mt-4 px-4 py-2 rounded-sm bg-[#00e5a0] text-black text-xs font-bold uppercase hover:bg-[#00ffb2] transition-all"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : (
                    <BotCandlestickChart
                      candles={candleData}
                      botConfig={botConfig}
                      orders={botOrders}
                      positions={botPositions}
                    />
                  )}
                </div>
              </div>

              {/* Open Positions Table */}
              <div className="bg-[#0d1117] border border-[#1e2d40] rounded-md overflow-hidden">
                <div className="px-4 py-2 border-b border-[#1e2d40] font-mono text-[9px] uppercase tracking-wider text-[#5a7090] flex items-center justify-between">
                  <span>Open Positions — {botConfig.symbol}</span>
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
                          <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">
                            Side
                          </th>
                          <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">
                            Entry
                          </th>
                          <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">
                            Mark
                          </th>
                          <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">
                            Size
                          </th>
                          <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">
                            PnL %
                          </th>
                          <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]">
                            Age
                          </th>
                          <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((p) => (
                          <tr
                            key={p.id}
                            className="border-b border-[#1e2d40] hover:bg-[#131920] transition-colors"
                          >
                            <td className="px-3 py-2">
                              <span
                                className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wide font-mono ${
                                  p.side === "LONG"
                                    ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                                    : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                                }`}
                              >
                                {p.side}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">
                              {p.entry.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">
                              {p.current.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">
                              {p.size}
                            </td>
                            <td
                              className="px-3 py-2 font-mono text-[11px] font-semibold"
                              style={{ color: p.pnlPct >= 0 ? "#00e5a0" : "#ff4757" }}
                            >
                              {p.pnlPct >= 0 ? "+" : ""}
                              {p.pnlPct}%
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px] text-[#5a7090]">
                              {p.age}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <button
                                  className="px-2 py-1 rounded-sm text-[9px] font-semibold uppercase tracking-wide cursor-pointer border transition-all bg-[rgba(245,166,35,0.10)] text-[#f5a623] border-[rgba(245,166,35,0.3)] hover:bg-[#f5a623] hover:text-black"
                                  onClick={() => setClosePos(p)}
                                >
                                  Close
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Equity curve - Show for all other bots */}
          {params.id !== 'BOT-0001' && params.id !== 'BOT-0002' && (
            <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
              <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
                <span className="text-xs font-semibold text-foreground">Equity Curve (Session)</span>
              </div>
              <div className="p-3 sm:p-3.5 pb-2">
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={equityCurve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00e5a0" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#00e5a0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={["auto", "auto"]} hide />
                    <XAxis dataKey="t" hide />
                    <Tooltip
                      contentStyle={{
                        background: "#131920",
                        border: "1px solid #1e2d40",
                        borderRadius: 4,
                        fontSize: 10
                      }}
                      formatter={(v: any) => [`$${v.toLocaleString()}`]}
                    />
                    <Area type="monotone" dataKey="value" stroke="#00e5a0" strokeWidth={2} fill="url(#eqGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        {/* Open positions - Hide for BOT-0001 and BOT-0002 since they have their own table */}
        {params.id !== 'BOT-0001' && params.id !== 'BOT-0002' && (
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
            <span className="text-xs font-semibold text-foreground">Open Positions</span>
            <span className="text-[10px] text-[#5a7090]">{positions.length} open</span>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden divide-y divide-dark/50">
            {positions.map(pos => (
              <div key={pos.id} className="p-3 space-y-2 hover:bg-[#0d1117] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                      pos.side === "LONG" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" : "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
                    }`}>
                      {pos.side}
                    </span>
                    <span className="font-mono text-xs text-foreground">{pos.pair}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#5a7090]">{pos.age}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <span className="text-[#5a7090] text-[10px]">Entry: </span>
                    <span className="font-mono text-foreground">${pos.entry.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[#5a7090] text-[10px]">Current: </span>
                    <span className="font-mono text-foreground">${pos.current.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[#5a7090] text-[10px]">Size: </span>
                    <span className="font-mono text-foreground">{pos.size}</span>
                  </div>
                  <div>
                    <span className="text-[#5a7090] text-[10px]">PnL: </span>
                    <span className="font-mono" style={{ color: pos.pnl >= 0 ? "#00e5a0" : "#ff4757" }}>
                      {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)} ({pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct}%)
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setClosePos(pos)}
                  className="w-full px-2 py-1.5 rounded-sm text-[9px] font-bold uppercase bg-[rgba(255,71,87,0.12)] text-[#ff4757] border border-[rgba(255,71,87,0.3)] hover:bg-[#ff4757] hover:text-white transition-all"
                >
                  Close Position
                </button>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark">
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Side</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Pair</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Entry</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Current</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Size</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">PnL $</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">PnL %</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Age</th>
                  <th className="px-3.5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {positions.map(pos => (
                  <tr key={pos.id} className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors">
                    <td className="px-3.5 py-2">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                        pos.side === "LONG" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" : "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
                      }`}>
                        {pos.side}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 font-mono text-xs text-foreground">{pos.pair}</td>
                    <td className="px-3.5 py-2 font-mono text-xs text-foreground">${pos.entry.toLocaleString()}</td>
                    <td className="px-3.5 py-2 font-mono text-xs text-foreground">${pos.current.toLocaleString()}</td>
                    <td className="px-3.5 py-2 font-mono text-xs text-foreground">{pos.size}</td>
                    <td className="px-3.5 py-2 font-mono text-xs" style={{ color: pos.pnl >= 0 ? "#00e5a0" : "#ff4757" }}>
                      {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-2 font-mono text-[10px]" style={{ color: pos.pnl >= 0 ? "#00e5a0" : "#ff4757" }}>
                      {pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct}%
                    </td>
                    <td className="px-3.5 py-2 text-[10px] font-mono text-[#5a7090]">{pos.age}</td>
                    <td className="px-3.5 py-2">
                      <button
                        onClick={() => setClosePos(pos)}
                        className="px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase bg-[rgba(255,71,87,0.12)] text-[#ff4757] border border-[rgba(255,71,87,0.3)] hover:bg-[#ff4757] hover:text-white transition-all"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Manual order panel */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
            <span className="text-xs font-semibold text-foreground">Manual Order</span>
          </div>
          <div className="p-3 sm:p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2 sm:gap-2.5 lg:items-end">
              <div>
                <div className="text-[9px] text-[#5a7090] uppercase tracking-widest mb-1">Pair</div>
                <select
                  value={newOrder.pair}
                  onChange={e => setNewOrder(o => ({...o, pair: e.target.value}))}
                  className="bg-dark-elevated border border-dark rounded text-foreground text-xs px-2.5 py-1.5 outline-none focus:border-dark-2"
                >
                  {PAIRS.map(p => <option key={p}>{p}</option>)}
                </select>
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
              <div className="w-full sm:w-auto">
                <div className="text-[9px] text-[#5a7090] uppercase tracking-widest mb-1">Price (blank = market)</div>
                <input
                  placeholder="Market"
                  value={newOrder.price}
                  onChange={e => setNewOrder(o => ({...o, price: e.target.value}))}
                  className="w-full sm:w-28 bg-dark-elevated border border-dark rounded-sm px-2.5 py-1.5 text-foreground text-xs font-mono outline-none focus:border-dark-2"
                />
              </div>
              <button className="w-full sm:w-auto sm:col-span-2 lg:col-span-1 px-5 py-1.5 rounded-sm bg-[#00e5a0] text-black text-[11px] font-bold uppercase tracking-wider hover:bg-[#00ffb2] transition-all whitespace-nowrap">
                Submit Order
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Close position modal */}
      {closePos && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-dark rounded-lg p-4 sm:p-6 w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-[#ff4757]">Close Position</h3>
            <p className="text-xs text-[#8fa3b8] leading-relaxed">
              Close {closePos.side} {closePos.pair} position?<br/>
              Size: {closePos.size} · PnL: <span style={{ color: closePos.pnl >= 0 ? "#00e5a0" : "#ff4757" }}>
                {closePos.pnl >= 0 ? "+" : ""}${closePos.pnl.toFixed(2)}
              </span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5 sm:justify-end">
              <button
                onClick={() => setClosePos(null)}
                className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={() => handleClosePos(closePos)}
                className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#ff4757] text-white hover:bg-[#ff2233] transition-all whitespace-nowrap"
              >
                Close at Market
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
