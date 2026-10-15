"use client";

import { useState, useEffect, useMemo } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// Utility functions
function rnd(a: number, b: number) { return a + Math.random() * (b - a); }
function ri(a: number, b: number) { return Math.floor(rnd(a, b)); }
function fmt(n: number, decimals = 0) { return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function fmtUSD(n: number) { return n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`; }
function pct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }

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

// KPI Card Component
function KPI({ label, value, delta, deltaLabel, sub, accent = "teal", variant }: {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
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
      {delta !== undefined && (
        <div>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold font-mono px-2 py-1 rounded-sm ${
            delta >= 0
              ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]"
              : "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
          }`}>
            {delta >= 0 ? "▲" : "▼"} {deltaLabel || pct(Math.abs(delta))}
          </span>
        </div>
      )}
      {sub && <div className="text-[10px] text-[#5a7090] mt-2 font-mono">{sub}</div>}
    </div>
  );
}

export default function PlatformOverviewPage() {
  const [equityCurve, setEquityCurve] = useState<{ day: number; value: number; label: string }[]>([]);
  const [monthlyReturns, setMonthlyReturns] = useState<{ month: string; return: number; trades: number; volume: number }[]>([]);
  const [drawdownCurve, setDrawdownCurve] = useState<{ day: number; value: number }[]>([]);

  useEffect(() => {
    // Generate equity curve
    let equity = 500000;
    const curve = Array.from({ length: 90 }, (_, i) => {
      equity *= 1 + (Math.random() - 0.44) * 0.022;
      return { day: i + 1, value: Math.round(equity), label: `Day ${i + 1}` };
    });
    setEquityCurve(curve);

    // Generate monthly returns
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const returns = MONTHS.map((m, i) => ({
      month: m,
      return: parseFloat((rnd(-6, 18)).toFixed(2)),
      trades: ri(800, 3200),
      volume: parseFloat((rnd(1.2, 8.5)).toFixed(2)),
    }));
    setMonthlyReturns(returns);

    // Generate drawdown curve
    let peak = 0;
    const dd = curve.map(p => {
      if (p.value > peak) peak = p.value;
      const ddValue = ((p.value - peak) / peak) * 100;
      return { day: p.day, value: parseFloat(ddValue.toFixed(2)) };
    });
    setDrawdownCurve(dd);
  }, []);

  const totalPnL = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].value - equityCurve[0].value : 0;
  const totalTrades = monthlyReturns.reduce((s, m) => s + m.trades, 0);
  const avgSharpe = 2.31;

  return (
    <div className="flex flex-col gap-5">
      {/* KPIs Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          label="Platform Equity"
          value={equityCurve.length > 0 ? fmtUSD(equityCurve[equityCurve.length - 1].value) : "$0"}
          delta={9.6}
          sub={equityCurve.length > 0 ? `Started at ${fmtUSD(equityCurve[0].value)}` : ""}
        />
        <KPI
          label="Realized P&L (90d)"
          value={fmtUSD(totalPnL)}
          delta={totalPnL > 0 ? 9.6 : -9.6}
          sub="All strategies combined"
        />
        <KPI
          label="Total Trades"
          value={fmt(totalTrades)}
          accent="gold"
          delta={12.3}
          deltaLabel="vs last quarter"
          sub={`Avg ${fmt(Math.round(totalTrades / 90))}/day`}
        />
        <KPI
          label="Avg Sharpe Ratio"
          value={avgSharpe.toFixed(2)}
          accent="navy"
          sub="Risk-adjusted return quality"
          delta={0.18}
          deltaLabel="+0.18 vs benchmark"
        />
      </div>

      {/* KPIs Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Active Users" value="82" delta={8.4} sub="68 with active bots" />
        <KPI label="AUM Total" value="$863K" delta={6.2} sub="Across all portfolios" />
        <KPI label="Win Rate (Platform)" value="63.1%" accent="teal" delta={1.4} sub="Weighted by trade count" />
        <KPI label="Max Drawdown (90d)" value="-8.4%" accent="coral" delta={-8.4} deltaLabel="8.4% from peak" sub="Within acceptable range" />
      </div>

      {/* Equity Curve */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-dark flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold text-foreground">Platform Equity Curve</div>
            <div className="text-[10px] text-[#5a7090] mt-1">Combined portfolio value across all users · 90-day window</div>
          </div>
          <span className="px-2 py-1 rounded-sm bg-[rgba(0,229,160,0.12)] text-[#00e5a0] text-[9px] font-bold uppercase">LIVE</span>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={equityCurve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={P.teal} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={P.teal} stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Tooltip contentStyle={TT_STYLE} formatter={v => [fmtUSD(Number(v)), "Equity"]} />
              <Area type="monotone" dataKey="value" stroke={P.teal} strokeWidth={2} fill="url(#eqGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Returns + Drawdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">Monthly Returns</div>
            <div className="text-[10px] text-[#5a7090] mt-1">% return by calendar month</div>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={monthlyReturns} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="month"
                  tick={{ fontFamily: "monospace", fontSize: 9, fill: "#8fa3b8" }}
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
                <Tooltip contentStyle={TT_STYLE} formatter={v => [`${v}%`, "Return"]} />
                <ReferenceLine y={0} stroke={P.border} />
                <Bar dataKey="return" radius={[2, 2, 0, 0]} fill={P.teal}>
                  {monthlyReturns.map((m, i) => (
                    <rect key={i} fill={m.return >= 0 ? P.teal : P.coral} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">Drawdown Profile</div>
            <div className="text-[10px] text-[#5a7090] mt-1">% decline from peak equity</div>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={drawdownCurve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={P.coral} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={P.coral} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
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
                  tickFormatter={v => `${v}%`}
                  width={35}
                  domain={["auto", 0]}
                />
                <Tooltip contentStyle={TT_STYLE} formatter={v => [`${v}%`, "Drawdown"]} />
                <ReferenceLine y={-10} stroke={P.coral} strokeDasharray="4 2" strokeOpacity={0.5} />
                <Area type="monotone" dataKey="value" stroke={P.coral} strokeWidth={1.5} fill="url(#ddGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
