"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Utility functions
function rnd(a: number, b: number) { return a + Math.random() * (b - a); }
function ri(a: number, b: number) { return Math.floor(rnd(a, b)); }
function fmt(n: number, decimals = 0) { return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function fmtUSD(n: number) { return n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`; }
function pct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }

// Colors
const P = { teal: "#00e5a0", coral: "#ff4757", gold: "#f5a623", navy: "#3d9df3", ink2: "#7A7266", ink3: "#A89F93", border: "#1e2d40" };
const stratColors = [P.teal, P.gold, P.navy, "#8fa3b8", P.coral];

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

// Strategy data
const STRATS = [
  { name: "Momentum Grid", pair: "BTC/USDT", exchange: "Binance", pnl: 48200, pnlPct: 9.64, sharpe: 2.31, sortino: 3.12, winRate: 67.4, maxDD: -4.2, trades: 1842, avgHold: "4h 12m", pf: 2.1, correlation: 1.0 },
  { name: "Arbitrage V2", pair: "ETH/USDT", exchange: "Bybit", pnl: 31700, pnlPct: 6.34, sharpe: 3.04, sortino: 4.21, winRate: 74.1, maxDD: -2.1, trades: 5621, avgHold: "8m", pf: 3.4, correlation: 0.12 },
  { name: "Mean Reversion", pair: "SOL/USDT", exchange: "OKX", pnl: 19400, pnlPct: 3.88, sharpe: 1.78, sortino: 2.44, winRate: 61.2, maxDD: -7.8, trades: 923, avgHold: "11h 30m", pf: 1.8, correlation: 0.34 },
  { name: "Trend Follow", pair: "BNB/USDT", exchange: "Binance", pnl: 8900, pnlPct: 1.78, sharpe: 1.21, sortino: 1.67, winRate: 54.3, maxDD: -11.4, trades: 412, avgHold: "2d 6h", pf: 1.5, correlation: 0.61 },
  { name: "Scalp Pro", pair: "XRP/USDT", exchange: "Kraken", pnl: -4200, pnlPct: -0.84, sharpe: 0.44, sortino: 0.61, winRate: 48.7, maxDD: -14.2, trades: 3812, avgHold: "22m", pf: 0.9, correlation: 0.08 },
];

// Mini bar component
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1 bg-[#1a2230] rounded-sm overflow-hidden mt-1">
      <div className="h-full rounded-sm" style={{ width: `${Math.abs(value) / max * 100}%`, background: color }} />
    </div>
  );
}

export default function StrategyPerformancePage() {
  const [sort, setSort] = useState("pnl");
  const [selected, setSelected] = useState<string | null>(null);
  const [mergedStratEquity, setMergedStratEquity] = useState<any[]>([]);

  useEffect(() => {
    // Generate strategy equity curves
    const stratEquity = STRATS.map(s => {
      let v = 50000;
      return Array.from({ length: 90 }, (_, i) => {
        const drift = s.pnlPct > 0 ? 0.44 : 0.56;
        v *= 1 + (Math.random() - drift) * 0.025;
        return { day: i + 1, [s.name.split(" ")[0]]: Math.round(v) };
      });
    });

    // Merge all strategy curves
    const merged = Array.from({ length: 90 }, (_, i) => {
      const obj: any = { day: i + 1 };
      STRATS.forEach((s, si) => {
        obj[s.name.split(" ")[0]] = stratEquity[si][i][s.name.split(" ")[0]];
      });
      return obj;
    });
    setMergedStratEquity(merged);
  }, []);

  const sorted = [...STRATS].sort((a, b) => {
    if (sort === "pnl") return b.pnl - a.pnl;
    if (sort === "sharpe") return b.sharpe - a.sharpe;
    if (sort === "winRate") return b.winRate - a.winRate;
    if (sort === "maxDD") return b.maxDD - a.maxDD;
    return 0;
  });

  const radarStrat = selected ? STRATS.find(s => s.name === selected) : STRATS[0];
  const radarData = radarStrat ? [
    { metric: "Win Rate", value: radarStrat.winRate },
    { metric: "Sharpe", value: Math.min(radarStrat.sharpe * 25, 100) },
    { metric: "Trades", value: Math.min(radarStrat.trades / 60, 100) },
    { metric: "PnL%", value: Math.max(0, radarStrat.pnlPct * 5) },
    { metric: "Safety", value: Math.max(0, 100 + radarStrat.maxDD * 4) },
    { metric: "Profit Factor", value: Math.min(radarStrat.pf * 20, 100) },
  ] : [];

  return (
    <div className="flex flex-col gap-5">
      {/* Equity Curves + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        {/* Strategy Equity Curves */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">Strategy Equity Curves</div>
            <div className="text-[10px] text-[#5a7090] mt-1">Normalized to $50K starting equity</div>
          </div>
          <div className="p-4">
            <div className="flex gap-4 flex-wrap mb-3">
              {STRATS.map((s, i) => (
                <div
                  key={s.name}
                  className="flex items-center gap-2 cursor-pointer transition-opacity"
                  style={{ opacity: selected && selected !== s.name ? 0.35 : 1 }}
                  onClick={() => setSelected(selected === s.name ? null : s.name)}
                >
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: stratColors[i] }} />
                  <span className="text-xs text-[#8fa3b8] font-mono">{s.name.split(" ")[0]}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={mergedStratEquity} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontFamily: "monospace", fontSize: 9, fill: "#8fa3b8" }}
                  tickLine={false}
                  axisLine={false}
                  interval={14}
                />
                <YAxis
                  tick={{ fontFamily: "monospace", fontSize: 9, fill: "#8fa3b8" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => fmtUSD(v)}
                  width={60}
                />
                <Tooltip contentStyle={TT_STYLE} formatter={v => [fmtUSD(Number(v))]} />
                {STRATS.map((s, i) => (
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name.split(" ")[0]}
                    stroke={stratColors[i]}
                    strokeWidth={selected === s.name ? 2.5 : 1.5}
                    dot={false}
                    opacity={selected && selected !== s.name ? 0.2 : 1}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar Chart */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">Risk Profile</div>
            <div className="text-[10px] text-[#5a7090] mt-1">{radarStrat?.name || ""}</div>
          </div>
          <div className="p-4 flex justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={75}>
                <PolarGrid stroke={P.border} />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontFamily: "monospace", fontSize: 9, fill: "#8fa3b8" }}
                />
                <Radar
                  dataKey="value"
                  stroke={P.teal}
                  fill={P.teal}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Strategy Scorecard Table */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-dark flex justify-between items-center">
          <div className="text-sm font-semibold text-foreground">Strategy Scorecard</div>
          <div className="flex gap-2">
            {[["pnl", "P&L"], ["sharpe", "Sharpe"], ["winRate", "Win Rate"], ["maxDD", "Drawdown"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`px-3 py-1 rounded-sm text-[9px] font-bold uppercase tracking-wider transition-all ${
                  sort === key
                    ? "bg-[#3d9df3] text-white border border-[#3d9df3]"
                    : "bg-transparent text-[#8fa3b8] border border-dark hover:border-[#253550]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark">
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Strategy</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Pair</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">P&L</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Return %</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Sharpe</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Sortino</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Win Rate</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Max DD</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Trades</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Avg Hold</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Profit Factor</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr
                  key={s.name}
                  onClick={() => setSelected(selected === s.name ? null : s.name)}
                  className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors cursor-pointer"
                  style={{ background: selected === s.name ? "rgba(0,229,160,0.05)" : undefined }}
                >
                  <td className="px-4 py-2 font-semibold text-sm text-[#3d9df3]">{s.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-[#8fa3b8]">{s.pair}</td>
                  <td className="px-4 py-2 font-mono text-xs text-right" style={{ color: s.pnl >= 0 ? P.teal : P.coral }}>
                    {fmtUSD(s.pnl)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-right" style={{ color: s.pnlPct >= 0 ? P.teal : P.coral }}>
                    {pct(s.pnlPct)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="font-mono text-xs" style={{ color: s.sharpe >= 2 ? P.teal : s.sharpe >= 1 ? P.gold : P.coral }}>
                      {s.sharpe.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-right text-foreground">{s.sortino.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="font-mono text-xs" style={{ color: s.winRate >= 60 ? P.teal : s.winRate >= 50 ? P.gold : P.coral }}>
                      {s.winRate}%
                    </span>
                    <MiniBar value={s.winRate} max={100} color={s.winRate >= 60 ? P.teal : s.winRate >= 50 ? P.gold : P.coral} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-right text-[#ff4757]">{s.maxDD}%</td>
                  <td className="px-4 py-2 font-mono text-xs text-right text-foreground">{fmt(s.trades)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-[#8fa3b8]">{s.avgHold}</td>
                  <td className="px-4 py-2 font-mono text-xs text-right" style={{ color: s.pf >= 2 ? P.teal : s.pf >= 1 ? P.gold : P.coral }}>
                    {s.pf.toFixed(1)}x
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-sm ${
                      s.pnl >= 0
                        ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]"
                        : "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
                    }`}>
                      {s.pnl >= 0 ? "Profitable" : "Losing"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sharpe Legend */}
      <div className="flex gap-4 px-1">
        <div className="flex items-center gap-2 text-xs text-[#8fa3b8] font-mono">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: P.teal }} />
          Sharpe ≥ 2.0 (Excellent)
        </div>
        <div className="flex items-center gap-2 text-xs text-[#8fa3b8] font-mono">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: P.gold }} />
          Sharpe 1–2 (Good)
        </div>
        <div className="flex items-center gap-2 text-xs text-[#8fa3b8] font-mono">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: P.coral }} />
          Sharpe &lt; 1 (Poor)
        </div>
      </div>
    </div>
  );
}
