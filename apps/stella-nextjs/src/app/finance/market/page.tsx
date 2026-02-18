"use client";

import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

// Utility functions
function rnd(a: number, b: number) { return a + Math.random() * (b - a); }
function ri(a: number, b: number) { return Math.floor(rnd(a, b)); }
function fmtUSD(n: number) { return n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`; }

// Colors
const P = { teal: "#00e5a0", coral: "#ff4757", gold: "#f5a623", navy: "#3d9df3", ink2: "#7A7266", ink3: "#A89F93", border: "#1e2d40" };

const TT_STYLE = {
  background: "#0d1117",
  border: "1px solid #1e2d40",
  borderRadius: 3,
  fontSize: 11,
  fontFamily: "monospace",
  color: "#e8edf3",
  padding: "6px 10px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
};

// Pairs performance data
const PAIRS = [
  { pair: "BTC/USDT", trades: 4821, pnl: 38400, winRate: 64.2, volume: "$12.4M", exchange: "Binance", pnlPct: 7.68 },
  { pair: "ETH/USDT", trades: 3102, pnl: 22100, winRate: 71.3, volume: "$8.1M", exchange: "Bybit", pnlPct: 4.42 },
  { pair: "SOL/USDT", trades: 1840, pnl: 9800, winRate: 58.9, volume: "$3.2M", exchange: "OKX", pnlPct: 1.96 },
  { pair: "BNB/USDT", trades: 924, pnl: 6200, winRate: 55.4, volume: "$2.1M", exchange: "Binance", pnlPct: 1.24 },
  { pair: "XRP/USDT", trades: 2241, pnl: -1800, winRate: 46.2, volume: "$1.8M", exchange: "Kraken", pnlPct: -0.36 },
];

// Exchange data
const exchanges = [
  { name: "Binance", pct: 41, pnl: "+$34,200", color: "#F0B90B" },
  { name: "Bybit", pct: 28, pnl: "+$18,700", color: P.teal },
  { name: "OKX", pct: 18, pnl: "+$8,400", color: P.navy },
  { name: "Kraken", pct: 13, pnl: "-$1,800", color: P.coral },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// KPI Component
function KPI({ label, value, accent = "teal", sub }: {
  label: string;
  value: string | number;
  accent?: string;
  sub?: string;
}) {
  const accentColor = accent === "teal" ? P.teal : accent === "coral" ? P.coral : accent === "gold" ? P.gold : P.navy;

  return (
    <div className="bg-dark-elevated border border-dark rounded-md p-3 sm:p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: accentColor }} />
      <div className="text-[10px] text-[#8fa3b8] uppercase tracking-widest mb-2 font-mono">{label}</div>
      <div className="text-2xl sm:text-[28px] font-bold leading-none mb-2" style={{ color: accentColor }}>{value}</div>
      {sub && <div className="text-[9px] sm:text-[10px] text-[#5a7090] mt-2 font-mono">{sub}</div>}
    </div>
  );
}

// Mini bar component
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1 bg-[#1a2230] rounded-sm overflow-hidden mt-1">
      <div className="h-full rounded-sm" style={{ width: `${Math.abs(value) / max * 100}%`, background: color }} />
    </div>
  );
}

// Heatmap color function
function heatColor(val: number) {
  if (val >= 3.5) return { bg: "#0B7B6B", text: "#fff" };
  if (val >= 2.0) return { bg: "#2A9D8F", text: "#fff" };
  if (val >= 0.5) return { bg: "#A8DFDA", text: "#1A1714" };
  if (val >= -0.5) return { bg: "#F0EEE9", text: "#A89F93" };
  if (val >= -1.5) return { bg: "#F4C5BE", text: "#1A1714" };
  return { bg: "#C24B3A", text: "#fff" };
}

export default function MarketIntelligencePage() {
  const [heatmapData, setHeatmapData] = useState<any[][]>([]);
  const [dayPerf, setDayPerf] = useState<any[]>([]);

  useEffect(() => {
    // Generate hourly heatmap (7 days × 24 hours)
    const heatmap = DAYS.map(day =>
      Array.from({ length: 24 }, (_, h) => {
        const val = rnd(-2.5, 5.5);
        return { hour: h, day, val: parseFloat(val.toFixed(2)) };
      })
    );
    setHeatmapData(heatmap);

    // Generate day of week performance
    const perf = DAYS.map(d => ({
      day: d,
      return: parseFloat(rnd(-0.8, 2.4).toFixed(2)),
      trades: ri(300, 1200),
    }));
    setDayPerf(perf);
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 md:gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Best Performing Pair" value="BTC/USDT" accent="teal" sub="+$38,400 · Win rate 64.2%" />
        <KPI label="Best Hour (UTC)" value="14:00–15:00" accent="gold" sub="Avg +1.84% per bot" />
        <KPI label="Best Day of Week" value="Wednesday" sub="Highest avg return across all strategies" />
        <KPI label="Top Exchange" value="Binance" accent="navy" sub="41% of volume · +$34,200 P&L" />
      </div>

      {/* Hourly Heatmap */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-dark">
          <div className="text-sm font-semibold text-foreground">Hourly Return Heatmap</div>
          <div className="text-[10px] text-[#5a7090] mt-1">Average % return by hour (UTC) and day of week · All strategies combined</div>
        </div>
        <div className="p-2 sm:p-3 md:p-4 overflow-x-auto">
          <div style={{ minWidth: 640 }}>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: `40px repeat(24, 1fr)` }}>
              <div />
              {hours.map(h => (
                <div key={h} className="font-mono text-[8px] text-[#8fa3b8] text-center pb-1">
                  {h.toString().padStart(2, "0")}
                </div>
              ))}
              {heatmapData.map((dayRow, di) => (
                <React.Fragment key={`day-${di}`}>
                  <div className="font-mono text-[9px] text-[#8fa3b8] flex items-center">
                    {DAYS[di]}
                  </div>
                  {dayRow.map((cell: any, hi: number) => {
                    const { bg, text } = heatColor(cell.val);
                    return (
                      <div
                        key={`${di}-${hi}`}
                        title={`${DAYS[di]} ${hi}:00 → ${cell.val}%`}
                        className="h-6 rounded-sm flex items-center justify-center font-mono text-[8px] font-semibold transition-opacity hover:opacity-75 cursor-default"
                        style={{ background: bg, color: text }}
                      >
                        {Math.abs(cell.val) >= 2 ? cell.val.toFixed(1) : ""}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div className="flex gap-4 mt-3 flex-wrap">
              {[
                ["≥ 3.5% (Strong+)", "#0B7B6B"],
                ["1.5–3.5%", "#2A9D8F"],
                ["0–1.5%", "#A8DFDA"],
                ["Flat", "#F0EEE9"],
                ["–0.5 to –1.5%", "#F4C5BE"],
                ["≤ –1.5% (Strong−)", "#C24B3A"]
              ].map(([label, color]) => (
                <div key={label} className="flex items-center gap-2 text-xs text-[#8fa3b8] font-mono">
                  <div className="w-2.5 h-2.5 rounded-sm border border-[#1e2d40]" style={{ background: color as string }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pair Performance + Day of Week */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Pair Performance Table */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">Pair Performance</div>
            <div className="text-[10px] text-[#5a7090] mt-1">P&L, win rate, and volume by trading pair</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark">
                  <th className="text-left px-2 sm:px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230] w-8">#</th>
                  <th className="text-left px-2 sm:px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Pair</th>
                  <th className="text-right px-2 sm:px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">P&L</th>
                  <th className="text-right px-2 sm:px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Win Rate</th>
                  <th className="text-left px-2 sm:px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Volume</th>
                </tr>
              </thead>
              <tbody>
                {PAIRS.sort((a, b) => b.pnl - a.pnl).map((p, i) => (
                  <tr key={p.pair} className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors">
                    <td className="px-2 sm:px-4 py-2">
                      <span
                        className="font-bold text-sm"
                        style={{
                          color: i === 0 ? P.gold : i === 1 ? "#9BA8B7" : i === 2 ? "#B07E5E" : "#5a7090"
                        }}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 font-mono font-semibold text-xs text-foreground whitespace-nowrap">{p.pair}</td>
                    <td className="px-2 sm:px-4 py-2 font-mono text-xs text-right whitespace-nowrap" style={{ color: p.pnl >= 0 ? P.teal : P.coral }}>
                      {p.pnl >= 0 ? "+" : ""}{fmtUSD(p.pnl)}
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-right">
                      <span className="font-mono text-xs whitespace-nowrap" style={{ color: p.winRate >= 60 ? P.teal : p.winRate >= 50 ? P.gold : P.coral }}>
                        {p.winRate}%
                      </span>
                      <MiniBar value={p.winRate} max={100} color={p.winRate >= 60 ? P.teal : p.winRate >= 50 ? P.gold : P.coral} />
                    </td>
                    <td className="px-2 sm:px-4 py-2 font-mono text-xs text-[#8fa3b8] whitespace-nowrap">{p.volume}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Day of Week Performance */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">Day-of-Week Performance</div>
            <div className="text-[10px] text-[#5a7090] mt-1">Average return % across all bots</div>
          </div>
          <div className="p-3 sm:p-4">
            <div className="h-44 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayPerf} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontFamily: "monospace", fontSize: 10, fill: "#8fa3b8" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontFamily: "monospace", fontSize: 9, fill: "#8fa3b8" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v}%`}
                  width={35}
                />
                <Tooltip contentStyle={TT_STYLE} formatter={v => [`${v}%`, "Avg Return"]} />
                <ReferenceLine y={0} stroke={P.border} />
                <Bar dataKey="return" radius={[3, 3, 0, 0]}>
                  {dayPerf.map((d, i) => (
                    <Cell key={i} fill={d.return >= 0 ? P.teal : P.coral} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>

            {/* Exchange P&L Breakdown */}
            <div className="mt-3 sm:mt-4">
              <div className="font-mono text-[9px] text-[#8fa3b8] uppercase tracking-wider mb-3">P&L by Exchange</div>
              {exchanges.map(e => (
                <div key={e.name} className="flex items-center gap-2 sm:gap-3 mb-2">
                  <div className="font-mono text-xs font-semibold text-foreground w-14 sm:w-16">{e.name}</div>
                  <div className="flex-1 h-2 bg-[#1a2230] rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm" style={{ width: `${e.pct}%`, background: e.color }} />
                  </div>
                  <div
                    className="font-mono text-xs w-16 sm:w-20 text-right whitespace-nowrap"
                    style={{ color: e.pnl.startsWith("+") ? P.teal : P.coral }}
                  >
                    {e.pnl}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
