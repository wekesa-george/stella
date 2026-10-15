"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Mock data
const equityHistory = [
  { t: "Feb 10", v: 9800 },
  { t: "Feb 11", v: 9950 },
  { t: "Feb 12", v: 9720 },
  { t: "Feb 13", v: 10100 },
  { t: "Feb 14", v: 10340 },
  { t: "Feb 15", v: 10210 },
  { t: "Feb 16", v: 10580 },
  { t: "Feb 17", v: 10420 },
  { t: "Feb 18", v: 10890 },
  { t: "Feb 19", v: 11240 },
];

const BOTS = [
  {
    id: "bot-1",
    name: "Momentum Alpha",
    strategy: "Core Momentum",
    exchange: "Binance",
    pair: "BTC/USDT",
    status: "running" as const,
    pnl: +312.4,
    pnlPct: +3.12,
    capital: 5000,
    openPositions: 2,
    lastTrade: "4m ago",
  },
  {
    id: "bot-2",
    name: "Mean Rev Grid",
    strategy: "Core Mean Reversion",
    exchange: "Binance",
    pair: "ETH/USDT",
    status: "running" as const,
    pnl: -88.2,
    pnlPct: -1.76,
    capital: 2500,
    openPositions: 1,
    lastTrade: "22m ago",
  },
  {
    id: "bot-3",
    name: "Impulse Scalper",
    strategy: "Core Momentum",
    exchange: "Alpaca",
    pair: "SOL/USDT",
    status: "paused" as const,
    pnl: +54.8,
    pnlPct: +1.1,
    capital: 1500,
    openPositions: 0,
    lastTrade: "2h ago",
  },
  {
    id: "bot-4",
    name: "Trend Follower",
    strategy: "Core Trend",
    exchange: "Binance",
    pair: "BNB/USDT",
    status: "error" as const,
    pnl: +0,
    pnlPct: 0,
    capital: 500,
    openPositions: 0,
    lastTrade: "—",
  },
];

const POSITIONS = [
  {
    id: 1,
    bot: "Momentum Alpha",
    pair: "BTC/USDT",
    side: "LONG" as const,
    entry: 97420.5,
    current: 98840.0,
    qty: 0.028,
    pnl: +39.74,
    pnlPct: +1.46,
    held: "2h 14m",
    exchange: "Binance",
  },
  {
    id: 2,
    bot: "Momentum Alpha",
    pair: "ETH/USDT",
    side: "LONG" as const,
    entry: 3180.2,
    current: 3156.4,
    qty: 0.42,
    pnl: -9.99,
    pnlPct: -0.75,
    held: "41m",
    exchange: "Binance",
  },
  {
    id: 3,
    bot: "Mean Rev Grid",
    pair: "ETH/USDT",
    side: "SHORT" as const,
    entry: 3210.0,
    current: 3156.4,
    qty: 0.2,
    pnl: +10.72,
    pnlPct: +1.67,
    held: "1h 03m",
    exchange: "Binance",
  },
];

const ACTIVITY = [
  {
    id: 1,
    time: "10:42",
    bot: "Momentum Alpha",
    pair: "BTC/USDT",
    side: "BUY" as const,
    price: 97420.5,
    qty: 0.028,
    result: null,
    exchange: "Binance",
  },
  {
    id: 2,
    time: "10:18",
    bot: "Mean Rev Grid",
    pair: "ETH/USDT",
    side: "SELL" as const,
    price: 3204.8,
    qty: 0.4,
    result: +28.6,
    exchange: "Binance",
  },
  {
    id: 3,
    time: "09:55",
    bot: "Momentum Alpha",
    pair: "BTC/USDT",
    side: "SELL" as const,
    price: 97810.0,
    qty: 0.03,
    result: +112.2,
    exchange: "Binance",
  },
];

// Utility functions
const fmt = {
  usd: (v: number) =>
    (v >= 0 ? "+" : "") +
    "$" +
    Math.abs(v).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  pct: (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%",
  abs: (v: number) =>
    "$" +
    Math.abs(v).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
};

const statusMeta = {
  running: { color: "#00E5A0", label: "RUNNING", pulse: true },
  paused: { color: "#F59E0B", label: "PAUSED", pulse: false },
  error: { color: "#F04F59", label: "ERROR", pulse: false },
  stopped: { color: "#2A3050", label: "STOPPED", pulse: false },
};

// Components
function StatusDot({ status }: { status: keyof typeof statusMeta }) {
  const meta = statusMeta[status];
  const colorClass = status === 'running' ? 'bg-status-running' : status === 'paused' ? 'bg-[#F59E0B]' : 'bg-destructive';
  const pulseClass = status === 'running' ? 'bg-status-running-mid' : '';

  return (
    <span className="relative inline-flex items-center justify-center">
      {meta.pulse && (
        <span className={`absolute w-[13px] h-[13px] rounded-full animate-ping ${pulseClass}`} />
      )}
      <span className={`w-2 h-2 rounded-full inline-block ${colorClass}`} />
    </span>
  );
}

function BotCard({ bot, router }: { bot: typeof BOTS[0], router: ReturnType<typeof useRouter> }) {
  const [status, setStatus] = useState(bot.status);
  const meta = statusMeta[status];
  const isUp = bot.pnl >= 0;

  const toggle = () =>
    setStatus((s) => (s === "running" ? "paused" : s === "paused" ? "running" : s));

  const borderClass = status === 'running' ? 'border-t-primary' : status === 'paused' ? 'border-t-warning' : 'border-t-destructive';

  return (
    <div className={`rounded-md border border-border/40 bg-card p-4 flex flex-col gap-3 border-t-2 ${borderClass}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusDot status={status} />
            <h3 className="text-sm font-bold text-foreground truncate">{bot.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {bot.strategy} · {bot.exchange}
          </p>
        </div>
        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${
            status === 'running' ? 'bg-status-running-dim border-status-running text-status-running' :
            status === 'paused' ? 'bg-status-paused-dim border-status-paused text-status-paused' :
            'bg-status-error-dim border-status-error text-status-error'
          }`}>
          {meta.label}
        </span>
      </div>

      {/* Pair + P&L */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pair</p>
          <p className="text-sm font-semibold text-foreground">{bot.pair}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Session P&L
          </p>
          <p className={`text-base font-bold ${isUp ? 'text-profit' : 'text-loss'}`}>
            {fmt.usd(bot.pnl)}
          </p>
          <p className={`text-xs ${isUp ? 'text-profit' : 'text-loss'}`}>
            {fmt.pct(bot.pnlPct)}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 border-t border-border/40 pt-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Capital
          </p>
          <p className="text-xs text-muted-foreground">{fmt.abs(bot.capital)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Positions
          </p>
          <p className="text-xs text-muted-foreground">{bot.openPositions}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Last Trade
          </p>
          <p className="text-xs text-muted-foreground">{bot.lastTrade}</p>
        </div>
      </div>

      {/* Controls */}
      {status !== "error" ? (
        <div className="flex gap-2">
          <button
            onClick={toggle}
            className={`flex-1 py-2 rounded text-[9px] font-bold uppercase tracking-wider border transition-opacity hover:opacity-85 ${
              status === "running"
                ? "bg-status-paused-dim border-status-paused text-status-paused"
                : "bg-status-running-dim border-status-running text-status-running"
            }`}
          >
            {status === "running" ? "⏸ PAUSE" : "▶ RESUME"}
          </button>
          <button
            onClick={() => router.push(`/bots/${bot.id}`)}
            className="px-3 py-2 rounded text-[9px] font-semibold uppercase tracking-wider border border-border/40 text-muted-foreground hover:bg-muted transition-colors"
          >
            DETAIL
          </button>
        </div>
      ) : (
        <div className="rounded px-3 py-2 flex items-center gap-2 bg-status-error-dim border border-status-error">
          <span className="text-status-error">⚠</span>
          <p className="text-xs text-status-error">
            Exchange credential invalid · Review in Settings
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [liveEquity, setLiveEquity] = useState(11240);
  const [showAlert, setShowAlert] = useState(true);

  // Simulate ticking equity
  useEffect(() => {
    const iv = setInterval(() => {
      setLiveEquity((v) => +(v + (Math.random() - 0.48) * 4).toFixed(2));
    }, 2800);
    return () => clearInterval(iv);
  }, []);

  const todayPnl = +278.5;
  const totalReturn = ((liveEquity - 10000) / 10000) * 100;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Thursday, 19 Feb 2026 · 10:44 EAT
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-md bg-primary/10 border border-primary/40 text-primary text-xs font-bold uppercase tracking-wider hover:opacity-85 transition-opacity">
            + NEW BOT
          </button>
          <button className="px-3 py-2 rounded-md border border-border/40 text-muted-foreground text-xs font-bold uppercase tracking-wider hover:bg-muted transition-colors">
            ⊞ EMERGENCY STOP
          </button>
        </div>
      </div>

      {/* KYC Alert */}
      {showAlert && (
        <div className="rounded-md p-3 flex items-center gap-3 mb-4 bg-status-paused-dim border border-status-paused border-l-[3px] border-l-warning">
          <span className="text-status-paused text-[13px]">⚡</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-status-paused">
              Identity verification in progress
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your KYC submission is being reviewed. Bots can run while we verify —
              typically 2–5 minutes.
            </p>
          </div>
          <button
            onClick={() => setShowAlert(false)}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Portfolio Summary */}
      <div className="rounded-md border border-border/40 bg-card overflow-hidden mb-4">
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold tracking-tight">Portfolio Overview</h2>
            <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wider">
              Updated live · Binance + Alpaca
            </p>
          </div>
          <div className="flex gap-1.5">
            {["1D", "1W", "1M", "All"].map((r, i) => (
              <button
                key={r}
                className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider border transition-colors ${
                  i === 0
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "border-border/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_280px]">
          {/* Stats */}
          <div className="p-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Total Equity
                </p>
                <p className="text-2xl font-bold text-foreground">
                  $
                  {liveEquity.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Today's P&L
                </p>
                <p className="text-lg font-bold text-green-500">{fmt.usd(todayPnl)}</p>
                <p className="text-xs text-muted-foreground">+2.54%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Total Return
                </p>
                <p className={`text-lg font-bold ${totalReturn >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {fmt.pct(totalReturn)}
                </p>
                <p className="text-xs text-muted-foreground">all time</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Unrealised P&L
                </p>
                <p className="text-lg font-bold text-green-500">{fmt.usd(40.47)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Open Positions
                </p>
                <p className="text-lg font-bold text-foreground">3</p>
                <p className="text-xs text-muted-foreground">across 2 bots</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Allocated
                </p>
                <p className="text-lg font-bold text-foreground">$9,500</p>
                <p className="text-xs text-muted-foreground">of $12,400</p>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="border-l border-border/40 pt-3">
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={equityHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00E5A0" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#00E5A0" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis domain={["auto", "auto"]} hide />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded border border-border/40 bg-card p-2">
                        <p className="text-xs text-muted-foreground">
                          {payload[0]?.payload?.t}
                        </p>
                        <p className="text-sm font-bold text-primary">
                          ${payload[0]?.value?.toLocaleString()}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#00E5A0"
                  strokeWidth={1.5}
                  fill="url(#eqGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: "#00E5A0" }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="px-3 py-1 flex justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Feb 10</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bot Grid */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold tracking-tight">Active Bots</h2>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              3 running · 1 error
            </p>
          </div>
          <button className="px-3 py-1.5 rounded border border-border/40 text-muted-foreground text-[9px] font-bold uppercase tracking-wider hover:bg-muted transition-colors">
            VIEW ALL BOTS →
          </button>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {BOTS.map((bot) => (
            <BotCard key={bot.id} bot={bot} router={router} />
          ))}
        </div>
      </div>

      {/* Positions Table */}
      <div className="rounded-md border border-border/40 bg-card overflow-hidden mb-4">
        <div className="p-3 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold tracking-tight">Open Positions</h2>
            <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/40 text-primary text-[9px] font-bold">
              3 LIVE
            </span>
          </div>
          <button className="px-3 py-1.5 rounded border border-border/40 text-muted-foreground text-[9px] font-bold uppercase tracking-wider hover:bg-muted transition-colors">
            VIEW ALL →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                {["Pair", "Bot", "Side", "Entry", "Current", "Unreal. P&L", "Return", "Held"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {POSITIONS.map((pos) => {
                const isUp = pos.pnl >= 0;
                const isLong = pos.side === "LONG";
                return (
                  <tr
                    key={pos.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">{pos.pair}</p>
                      <p className="text-xs text-muted-foreground">{pos.bot}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        isLong
                          ? 'bg-status-running-dim border-status-running text-status-running'
                          : 'bg-status-error-dim border-status-error text-status-error'
                      }`}>
                        {pos.side}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      ${pos.entry.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">
                      ${pos.current.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <p className="text-xs text-muted-foreground">{pos.qty}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`text-sm font-bold ${isUp ? 'text-profit' : 'text-loss'}`}>
                        {fmt.usd(pos.pnl)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`text-sm ${isUp ? 'text-profit' : 'text-loss'}`}>
                        {fmt.pct(pos.pnlPct)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{pos.held}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="rounded-md border border-border/40 bg-card overflow-hidden">
        <div className="p-3 border-b border-border/40 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-tight">Recent Activity</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Today · {ACTIVITY.length} events
          </p>
        </div>

        <div className="divide-y divide-border/40 max-h-[340px] overflow-y-auto">
          {ACTIVITY.map((ev, i) => {
            const isBuy = ev.side === "BUY";
            const hasResult = ev.result !== null;
            const isWin = hasResult && ev.result > 0;
            return (
              <div
                key={ev.id}
                className={`p-3 flex items-center gap-3 ${
                  i % 2 === 0 ? "bg-transparent" : "bg-muted/20"
                }`}
              >
                <div className={`w-0.5 h-7 rounded-full flex-shrink-0 ${isBuy ? 'bg-status-running' : 'bg-destructive'}`} />
                <p className="text-xs text-muted-foreground/60 w-9 flex-shrink-0">
                  {ev.time}
                </p>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                      isBuy
                        ? 'bg-status-running-dim border-status-running text-status-running'
                        : 'bg-status-error-dim border-status-error text-status-error'
                    }`}>
                      {ev.side}
                    </span>
                    <p className="text-xs font-semibold text-foreground">{ev.pair}</p>
                    <p className="text-xs text-muted-foreground">
                      ${ev.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground/60">qty {ev.qty}</p>
                  </div>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {ev.bot} · {ev.exchange}
                  </p>
                </div>
                {hasResult && (
                  <p className={`text-xs font-bold flex-shrink-0 ${isWin ? 'text-profit' : 'text-loss'}`}>
                    {fmt.usd(ev.result)}
                  </p>
                )}
                {!hasResult && (
                  <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider flex-shrink-0 bg-status-running-dim border border-status-running text-status-running">
                    OPEN
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
