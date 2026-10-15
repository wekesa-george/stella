"use client";

import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// Utility functions
function rnd(a: number, b: number) { return a + Math.random() * (b - a); }
function ri(a: number, b: number) { return Math.floor(rnd(a, b)); }

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

// Strategy data for correlation
const STRATS = [
  { name: "Momentum Grid", correlation: 1.0 },
  { name: "Arbitrage V2", correlation: 0.12 },
  { name: "Mean Reversion", correlation: 0.34 },
  { name: "Trend Follow", correlation: 0.61 },
  { name: "Scalp Pro", correlation: 0.08 },
];

// Exchange data
const exchanges = [
  { name: "Binance", pct: 41, pnl: "+$34,200", color: "#F0B90B" },
  { name: "Bybit", pct: 28, pnl: "+$18,700", color: P.teal },
  { name: "OKX", pct: 18, pnl: "+$8,400", color: P.navy },
  { name: "Kraken", pct: 13, pnl: "-$1,800", color: P.coral },
];

// Pairs data
const PAIRS = [
  { pair: "BTC/USDT", pct: 38 },
  { pair: "ETH/USDT", pct: 26 },
  { pair: "SOL/USDT", pct: 15 },
  { pair: "BNB/USDT", pct: 11 },
  { pair: "XRP/USDT", pct: 10 },
];

// KPI Component
function KPI({ label, value, sub, accent = "teal", variant }: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  variant?: string;
}) {
  const accentColor = accent === "teal" ? P.teal : accent === "coral" ? P.coral : accent === "gold" ? P.gold : P.navy;

  return (
    <div className="bg-dark-elevated border border-dark rounded-md p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: accentColor }} />
      <div className="text-[10px] text-[#8fa3b8] uppercase tracking-widest mb-2 font-mono">{label}</div>
      <div className="text-[28px] font-bold leading-none mb-2" style={{ color: accentColor }}>{value}</div>
      {sub && <div className="text-[10px] text-[#5a7090] mt-2 font-mono">{sub}</div>}
    </div>
  );
}

// Correlation color function
function corrColor(v: number) {
  if (v >= 0.7) return { bg: "#C24B3A", text: "#fff" };
  if (v >= 0.4) return { bg: "#F4C5BE", text: "#1A1714" };
  if (v >= 0.2) return { bg: "#F0EEE9", text: "#7A7266" };
  if (v < 0) return { bg: "#A8DFDA", text: "#1A1714" };
  return { bg: "#E8F5F3", text: "#1A1714" };
}

export default function RiskDashboardPage() {
  const [corrMatrix, setCorrMatrix] = useState<number[][]>([]);
  const [sizeDist, setSizeDist] = useState<any[]>([]);

  useEffect(() => {
    // Correlation matrix (5x5)
    setCorrMatrix([
      [1.00, 0.12, 0.34, 0.61, 0.08],
      [0.12, 1.00, 0.09, 0.15, 0.22],
      [0.34, 0.09, 1.00, 0.42, 0.17],
      [0.61, 0.15, 0.42, 1.00, 0.11],
      [0.08, 0.22, 0.17, 0.11, 1.00],
    ]);

    // Position sizing distribution
    setSizeDist([
      { size: "0–1%", count: 48 },
      { size: "1–2%", count: 71 },
      { size: "2–5%", count: 33 },
      { size: "5–10%", count: 14 },
      { size: ">10%", count: 4 },
    ]);
  }, []);

  const corrNames = STRATS.map(s => s.name.split(" ")[0]);

  const varData = [
    { level: "95% VaR", value: -3.8, desc: "5% chance of losing more than this in a single day" },
    { level: "99% VaR", value: -6.2, desc: "1% chance of losing more than this in a single day" },
    { level: "99.9% CVaR", value: -10.1, desc: "Expected loss in worst 0.1% of scenarios" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Platform VaR (95%)" value="-3.8%" accent="coral" sub="Max expected daily loss" />
        <KPI label="Largest Single Exposure" value="41%" accent="gold" sub="Binance exchange concentration" />
        <KPI label="Strategy Correlation (avg)" value="0.24" sub="Low = well diversified" />
        <KPI label="Open Risk (Unrealized)" value="$34K" accent="navy" sub="Across all open positions" />
      </div>

      {/* VaR + Concentration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* VaR Table */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">Value at Risk (VaR)</div>
            <div className="text-[10px] text-[#5a7090] mt-1">Daily loss thresholds at confidence levels</div>
          </div>
          <div className="p-4">
            {varData.map((v, i) => (
              <div key={i} className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-[#3d9df3]">{v.level}</span>
                  <span className="font-mono text-sm font-bold text-[#ff4757]">{v.value}%</span>
                </div>
                <div className="font-mono text-[9px] text-[#8fa3b8] mb-2">{v.desc}</div>
                <div className="h-1.5 bg-[#1a2230] rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${Math.abs(v.value) * 6}%`,
                      background: P.coral,
                      opacity: 0.7 + i * 0.1
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="mt-4 p-3 bg-[#FFF8F0] border border-[#F4C5BE] rounded-sm">
              <div className="font-mono text-[10px] text-[#ff4757]">
                ⚠ Max drawdown threshold set at −10%. Platform kill switch auto-triggers at −15%.
              </div>
            </div>
          </div>
        </div>

        {/* Capital Concentration */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">Capital Concentration</div>
            <div className="text-[10px] text-[#5a7090] mt-1">AUM distribution by dimension</div>
          </div>
          <div className="p-4 space-y-4">
            {/* By Exchange */}
            <div>
              <div className="font-mono text-[9px] text-[#8fa3b8] uppercase tracking-wider mb-2">By Exchange</div>
              <div className="h-5 flex rounded-sm overflow-hidden gap-0.5">
                {exchanges.map((e, i) => (
                  <div
                    key={i}
                    title={`${e.name}: ${e.pct}%`}
                    className="flex items-center justify-center transition-opacity hover:opacity-75 cursor-default"
                    style={{ width: `${e.pct}%`, background: e.color }}
                  >
                    <span className="font-mono text-[8px] font-semibold text-white">
                      {e.pct >= 10 ? e.name : ""}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {exchanges.map((e, i) => (
                  <span key={i} className="font-mono text-[9px] text-[#8fa3b8]">
                    <span style={{ color: e.color }} className="font-semibold">{e.name}</span> {e.pct}%
                  </span>
                ))}
              </div>
            </div>

            {/* By Strategy */}
            <div>
              <div className="font-mono text-[9px] text-[#8fa3b8] uppercase tracking-wider mb-2">By Strategy</div>
              <div className="h-5 flex rounded-sm overflow-hidden gap-0.5">
                {STRATS.map((s, i) => {
                  const pct = [35, 25, 18, 13, 9][i];
                  const color = [P.teal, P.gold, P.navy, "#8fa3b8", P.coral][i];
                  return (
                    <div
                      key={i}
                      title={`${s.name.split(" ")[0]}: ${pct}%`}
                      className="flex items-center justify-center transition-opacity hover:opacity-75 cursor-default"
                      style={{ width: `${pct}%`, background: color }}
                    >
                      <span className="font-mono text-[8px] font-semibold text-white">
                        {pct >= 10 ? s.name.split(" ")[0] : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {STRATS.map((s, i) => {
                  const pct = [35, 25, 18, 13, 9][i];
                  const color = [P.teal, P.gold, P.navy, "#8fa3b8", P.coral][i];
                  return (
                    <span key={i} className="font-mono text-[9px] text-[#8fa3b8]">
                      <span style={{ color }} className="font-semibold">{s.name.split(" ")[0]}</span> {pct}%
                    </span>
                  );
                })}
              </div>
            </div>

            {/* By Pair */}
            <div>
              <div className="font-mono text-[9px] text-[#8fa3b8] uppercase tracking-wider mb-2">By Pair</div>
              <div className="h-5 flex rounded-sm overflow-hidden gap-0.5">
                {PAIRS.map((p, i) => {
                  const color = [P.navy, P.teal, P.gold, "#8fa3b8", P.coral][i];
                  return (
                    <div
                      key={i}
                      title={`${p.pair.split("/")[0]}: ${p.pct}%`}
                      className="flex items-center justify-center transition-opacity hover:opacity-75 cursor-default"
                      style={{ width: `${p.pct}%`, background: color }}
                    >
                      <span className="font-mono text-[8px] font-semibold text-white">
                        {p.pct >= 10 ? p.pair.split("/")[0] : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {PAIRS.map((p, i) => {
                  const color = [P.navy, P.teal, P.gold, "#8fa3b8", P.coral][i];
                  return (
                    <span key={i} className="font-mono text-[9px] text-[#8fa3b8]">
                      <span style={{ color }} className="font-semibold">{p.pair.split("/")[0]}</span> {p.pct}%
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Correlation Matrix */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-dark">
          <div className="text-sm font-semibold text-foreground">Strategy Correlation Matrix</div>
          <div className="text-[10px] text-[#5a7090] mt-1">High correlation = less diversification · Target: all cells below 0.4</div>
        </div>
        <div className="p-4 overflow-x-auto">
          <div className="grid gap-0.5 min-w-[500px]" style={{ gridTemplateColumns: `90px repeat(${corrNames.length}, 1fr)` }}>
            <div />
            {corrNames.map(n => (
              <div key={n} className="font-mono text-[9px] text-[#8fa3b8] text-center py-1">
                {n}
              </div>
            ))}
            {corrMatrix.map((row, ri) => (
              <React.Fragment key={`row-${ri}`}>
                <div className="font-mono text-[9px] text-[#8fa3b8] flex items-center pr-2">
                  {corrNames[ri]}
                </div>
                {row.map((val, ci) => {
                  const { bg, text } = corrColor(val);
                  return (
                    <div
                      key={`${ri}-${ci}`}
                      className="font-mono text-xs font-semibold text-center py-2 rounded-sm"
                      style={{ background: bg, color: text }}
                    >
                      {val.toFixed(2)}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="flex gap-4 mt-3">
            {[["≥ 0.7 High (Red)", P.coral], ["0.4–0.7 Medium", "#F4C5BE"], ["< 0.2 Low (Good)", "#A8DFDA"]].map(([label, color]) => (
              <div key={label} className="flex items-center gap-2 text-xs text-[#8fa3b8] font-mono">
                <div className="w-2.5 h-2.5 rounded-sm border border-[#1e2d40]" style={{ background: color as string }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Position Sizing Distribution */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-dark">
          <div className="text-sm font-semibold text-foreground">Position Sizing Distribution</div>
          <div className="text-[10px] text-[#5a7090] mt-1">% of account equity per trade · Oversized positions are a concentration risk</div>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={sizeDist} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="size"
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "#8fa3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontFamily: "monospace", fontSize: 9, fill: "#8fa3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip contentStyle={TT_STYLE} />
              <Bar dataKey="count" name="Positions" radius={[3, 3, 0, 0]}>
                {sizeDist.map((d, i) => (
                  <Cell key={i} fill={i >= 3 ? P.coral : P.teal} fillOpacity={0.75 + i * 0.04} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
