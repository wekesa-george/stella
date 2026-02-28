"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import type { Bot } from "@/lib/types/dashboard";

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

interface OverviewTabProps {
  bot: Bot;
  equityCurve: { t: number; value: number }[];
  positions: Position[];
  onClosePosition: (pos: Position) => void;
}

export default function OverviewTab({ bot, equityCurve, positions, onClosePosition }: OverviewTabProps) {
  const isProfitable = equityCurve.length > 1
    ? equityCurve[equityCurve.length - 1].value >= equityCurve[0].value
    : true;
  const curveColor = isProfitable ? "#00e5a0" : "#ff4757";
  const isCollecting = equityCurve.length <= 1;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {([
          ["Session P&L", `${bot.pnl >= 0 ? "+" : ""}$${bot.pnl.toFixed(2)}`, bot.pnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"],
          ["Win Rate", `${bot.winRate}%`, ""],
          ["Total Trades", bot.trades, ""],
          ["Open Pos", bot.openPositions, ""],
          ["Uptime", bot.uptime, ""],
        ] as [string, string | number, string][]).map(([label, val, cls]) => (
          <div key={label} className="bg-dark-elevated border border-dark rounded-md p-3.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">{label}</div>
            <div className={`font-mono text-lg font-semibold ${cls || "text-foreground"}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Equity Curve */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Equity Curve (Session)</span>
          {isCollecting && (
            <span className="text-[10px] text-[#5a7090] animate-pulse">Collecting data...</span>
          )}
        </div>
        <div className="p-3 sm:p-3.5 pb-2">
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={equityCurve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={curveColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={curveColor} stopOpacity={0} />
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
                formatter={(v: any) => [`$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]}
                labelFormatter={(t: any) => new Date(t).toLocaleTimeString()}
              />
              <Area type="monotone" dataKey="value" stroke={curveColor} strokeWidth={2} fill="url(#eqGrad)" dot={isCollecting} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Compact Open Positions */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
          <span className="text-xs font-semibold text-foreground">Open Positions</span>
          <span className="text-[10px] text-[#5a7090]">{positions.length} open</span>
        </div>

        {positions.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-[11px] text-[#5a7090]">
            No open positions
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="lg:hidden divide-y divide-dark/50">
              {positions.map(pos => (
                <div key={pos.id} className="p-3 space-y-2 hover:bg-[#0d1117] transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                        pos.side === "LONG" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" : "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
                      }`}>{pos.side}</span>
                      <span className="font-mono text-xs text-foreground">{pos.pair}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#5a7090]">{pos.age}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div><span className="text-[#5a7090] text-[10px]">Entry: </span><span className="font-mono text-foreground">${pos.entry.toLocaleString()}</span></div>
                    <div><span className="text-[#5a7090] text-[10px]">Current: </span><span className="font-mono text-foreground">${pos.current.toLocaleString()}</span></div>
                    <div><span className="text-[#5a7090] text-[10px]">Size: </span><span className="font-mono text-foreground">{pos.size}</span></div>
                    <div>
                      <span className="text-[#5a7090] text-[10px]">PnL: </span>
                      <span className="font-mono" style={{ color: pos.pnl >= 0 ? "#00e5a0" : "#ff4757" }}>
                        {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)} ({pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct}%)
                      </span>
                    </div>
                  </div>
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
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">PnL</th>
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
                        }`}>{pos.side}</span>
                      </td>
                      <td className="px-3.5 py-2 font-mono text-xs text-foreground">{pos.pair}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-foreground">${pos.entry.toLocaleString()}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-foreground">${pos.current.toLocaleString()}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-foreground">{pos.size}</td>
                      <td className="px-3.5 py-2 font-mono text-xs" style={{ color: pos.pnl >= 0 ? "#00e5a0" : "#ff4757" }}>
                        {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)} ({pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct}%)
                      </td>
                      <td className="px-3.5 py-2 text-[10px] font-mono text-[#5a7090]">{pos.age}</td>
                      <td className="px-3.5 py-2">
                        <button
                          onClick={() => onClosePosition(pos)}
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
          </>
        )}
      </div>

      {/* Bot Config Card */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
          <span className="text-xs font-semibold text-foreground">Bot Configuration</span>
        </div>
        <div className="p-3 sm:p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            ["Strategy", bot.strategy || "—"],
            ["Trading Pairs", bot.tradingPairs?.join(", ") || bot.pair || "—"],
            ["Credential", bot.credentialId ? bot.credentialId.slice(0, 8) + "..." : "—"],
            ["Allocated Capital", bot.allocatedCapital ? `$${bot.allocatedCapital.toLocaleString()}` : "—"],
            ["Exchange", bot.exchange || "—"],
            ["User", bot.user || "—"],
            ["Created", bot.createdAt ? new Date(bot.createdAt).toLocaleDateString() : "—"],
            ["Started", bot.startedAt ? new Date(bot.startedAt).toLocaleString() : "—"],
          ] as [string, string][]).map(([label, val]) => (
            <div key={label}>
              <div className="text-[9px] text-[#5a7090] uppercase tracking-widest mb-0.5">{label}</div>
              <div className="font-mono text-xs text-foreground truncate" title={val}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
