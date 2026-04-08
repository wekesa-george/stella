"use client";

import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine
} from "recharts";
import { fs } from "@/lib/font-utils";

const C = {
  bg: "#0B0D11", surface: "#12151C", surfaceAlt: "#0E111A", border: "#1C2338", borderSub: "#161B28",
  green: "#00E5A0", greenDim: "#00E5A012", greenMid: "#00E5A035",
  red: "#F04F59", amber: "#F59E0B", blue: "#3B82F6",
  textPri: "#C8CDE0", textMid: "#A0AAC0", textMuted: "#8B95B0", textDim: "#6A7590",
};
const mono = "'JetBrains Mono','Fira Code',monospace";

const EQUITY_DATA = [
  { d: "Feb 10", v: 9800 }, { d: "Feb 11", v: 9950 }, { d: "Feb 12", v: 9720 },
  { d: "Feb 13", v: 10100 }, { d: "Feb 14", v: 10340 }, { d: "Feb 15", v: 10210 },
  { d: "Feb 16", v: 10580 }, { d: "Feb 17", v: 10420 }, { d: "Feb 18", v: 10890 },
  { d: "Feb 19", v: 11240 },
];

const MONTHLY_RETURNS = [
  { m: "Jan", v: 8.4 }, { m: "Feb", v: 5.1 }, { m: "Mar", v: -2.8 }, { m: "Apr", v: 6.2 },
  { m: "May", v: 3.9 }, { m: "Jun", v: -1.4 }, { m: "Jul", v: 7.8 }, { m: "Aug", v: 4.1 },
  { m: "Sep", v: 2.2 }, { m: "Oct", v: -0.6 }, { m: "Nov", v: 5.4 }, { m: "Dec", v: 3.8 },
];

const PAIR_BREAKDOWN = [
  { pair: "BTC/USDT", trades: 88, winRate: 66.2, pnl: 820.40, fees: 42.10, volume: 184200 },
  { pair: "ETH/USDT", trades: 52, winRate: 60.5, pnl: 312.80, fees: 18.60, volume: 82400 },
  { pair: "SOL/USDT", trades: 31, winRate: 61.8, pnl: 180.20, fees: 8.20, volume: 24100 },
  { pair: "BNB/USDT", trades: 4, winRate: 50.0, pnl: -12.40, fees: 1.80, volume: 3800 },
];

const HOURLY_PNL = [
  { h: "00", v: 1.2 }, { h: "01", v: -0.4 }, { h: "02", v: 0.8 }, { h: "03", v: 0.3 },
  { h: "04", v: 1.8 }, { h: "05", v: 2.1 }, { h: "06", v: -0.9 }, { h: "07", v: 3.2 },
  { h: "08", v: 4.8 }, { h: "09", v: 5.4 }, { h: "10", v: 4.1 }, { h: "11", v: 2.8 },
  { h: "12", v: -1.2 }, { h: "13", v: 1.9 }, { h: "14", v: 3.6 }, { h: "15", v: 4.4 },
  { h: "16", v: 2.1 }, { h: "17", v: -0.6 }, { h: "18", v: 1.3 }, { h: "19", v: 0.8 },
  { h: "20", v: 0.4 }, { h: "21", v: -0.2 }, { h: "22", v: 0.6 }, { h: "23", v: 0.3 },
];

const TRADE_SIZE_DIST = [
  { range: "$0-50", count: 28 }, { range: "$50-150", count: 44 }, { range: "$150-300", count: 31 },
  { range: "$300-500", count: 22 }, { range: "$500+", count: 8 },
];

const CLOSED_POSITIONS = [
  { realPnl: 112.20 }, { realPnl: 28.60 }, { realPnl: 6.80 }, { realPnl: -22.60 },
  { realPnl: 16.80 }, { realPnl: 31.00 }, { realPnl: -12.40 }, { realPnl: 17.00 },
];

const fmt = {
  usd: (v: number) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  abs: (v: number) => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct: (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%",
};

function M({ size = 11, color = C.textPri, weight = 500, caps = false, style = {}, children }: any) {
  return <span style={{ fontFamily: mono, fontSize: fs(size), color, fontWeight: weight, letterSpacing: caps ? "0.11em" : "0.03em", textTransform: caps ? "uppercase" : "none", ...style }}>{children}</span>;
}
function Lbl({ children, color = C.textMuted, style = {} }: any) {
  return <M size={9} color={color} weight={600} caps style={{ letterSpacing: "0.13em", ...style }}>{children}</M>;
}
function Div() { return <div style={{ height: 1, background: C.borderSub }} />; }

function Pill({ children, color = C.green, active = false, onClick }: any) {
  return (
    <button onClick={onClick} style={{ background: active ? color + "18" : "transparent", border: `1px solid ${active ? color + "40" : C.border}`, borderRadius: 3, padding: "5px 12px", fontFamily: mono, fontSize: fs(9), letterSpacing: "0.1em", textTransform: "uppercase", color: active ? color : C.textMuted, cursor: "pointer", fontWeight: active ? 700 : 500 }}>
      {children}
    </button>
  );
}

function Card({ children, style = {} }: any) {
  return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, ...style }}>{children}</div>;
}

function CardHeader({ title, sub }: any) {
  return (
    <>
      <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <M size={11} weight={700} style={{ letterSpacing: "0.06em", display: "block" }}>{title}</M>
          {sub && <Lbl style={{ marginTop: 3 }}>{sub}</Lbl>}
        </div>
      </div>
      <Div />
    </>
  );
}

function StatBox({ label, value, color = C.textPri }: any) {
  return (
    <div style={{ padding: "14px 18px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4 }}>
      <Lbl>{label}</Lbl>
      <M size={20} color={color} weight={700} style={{ display: "block", marginTop: 6, lineHeight: 1 }}>{value}</M>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 12px" }}>
      <Lbl style={{ display: "block", marginBottom: 4 }}>{label}</Lbl>
      {payload.map((p: any, i: number) => (
        <M key={i} size={12} color={p.color || C.green} weight={700} style={{ display: "block" }}>
          {typeof p.value === "number" && Math.abs(p.value) > 50 ? "$" + Math.abs(p.value).toLocaleString() : typeof p.value === "number" ? fmt.pct(p.value) : p.value}
        </M>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState("1M");
  const [tab, setTab] = useState("returns");

  const winCount = CLOSED_POSITIONS.filter(p => p.realPnl > 0).length;
  const lossCount = CLOSED_POSITIONS.filter(p => p.realPnl < 0).length;
  const winRate = ((winCount / (winCount + lossCount)) * 100).toFixed(1);
  const totalFees = PAIR_BREAKDOWN.reduce((s, p) => s + p.fees, 0);
  const bestMonth = Math.max(...MONTHLY_RETURNS.map(m => m.v));
  const worstMonth = Math.min(...MONTHLY_RETURNS.map(m => m.v));
  const avgMonthly = (MONTHLY_RETURNS.reduce((s, m) => s + m.v, 0) / 12).toFixed(1);

  const pieData = [
    { name: "Wins", value: winCount, fill: C.green },
    { name: "Losses", value: lossCount, fill: C.red },
  ];

  return (
    <div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');`}</style>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing: "0.04em", display: "block" }}>Analytics</M>
          <M size={10} color={C.textMuted} style={{ display: "block", marginTop: 3 }}>
            Feb 2026 - 175 trades analysed
          </M>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["1W", "1M", "3M", "YTD", "All"].map(r => (
            <Pill key={r} active={range === r} onClick={() => setRange(r)}>{r}</Pill>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12, marginBottom: 18 }}>
        {[
          { l: "Total Return", v: "+12.4%", c: C.green },
          { l: "Win Rate", v: winRate + "%", c: C.green },
          { l: "Avg Monthly", v: "+" + avgMonthly + "%", c: C.green },
          { l: "Best Month", v: "+" + bestMonth + "%", c: C.green },
          { l: "Worst Month", v: worstMonth + "%", c: C.red },
          { l: "Fees Paid", v: fmt.abs(totalFees), c: C.textMid },
        ].map(s => (
          <StatBox key={s.l} label={s.l} value={s.v} color={s.c} />
        ))}
      </div>

      {/* Page tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 18 }}>
        {[{ k: "returns", l: "Returns" }, { k: "trades", l: "Trade Analysis" }, { k: "pairs", l: "Pairs" }, { k: "timing", l: "Timing" }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ padding: "9px 20px", background: "transparent", border: "none", borderBottom: `2px solid ${tab === t.k ? C.green : "transparent"}`, fontFamily: mono, fontSize: fs(9), letterSpacing: "0.1em", textTransform: "uppercase", color: tab === t.k ? C.green : C.textMuted, cursor: "pointer", fontWeight: tab === t.k ? 700 : 500 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* RETURNS TAB */}
      {tab === "returns" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <CardHeader title="Portfolio Equity" sub="Starting capital $10,000" />
            <div style={{ padding: "12px 0 8px" }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={EQUITY_DATA} margin={{ top: 4, right: 20, bottom: 0, left: 20 }}>
                  <defs>
                    <linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={C.green} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.borderSub} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="d" tick={{ fontFamily: mono, fontSize: fs(9), fill: C.textMuted }} tickLine={false} axisLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontFamily: mono, fontSize: fs(9), fill: C.textMuted }} tickLine={false} axisLine={false} tickFormatter={(v: any) => "$" + v.toLocaleString()} />
                  <Tooltip content={<CustomTooltip />} formatter={(v: any) => ["$" + v.toLocaleString(), "Equity"]} />
                  <Area type="monotone" dataKey="v" stroke={C.green} strokeWidth={1.5} fill="url(#eqG)" dot={false} activeDot={{ r: 3, fill: C.green, stroke: C.surface, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader title="Monthly Returns - 2025" sub="Each cell = realised P&L for that month" />
            <div style={{ padding: "14px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, marginBottom: 6 }}>
                {MONTHLY_RETURNS.slice(0, 6).map(m => (
                  <div key={m.m} style={{ background: m.v > 0 ? C.green + "20" : C.red + "20", border: `1px solid ${m.v > 0 ? C.green + "30" : C.red + "30"}`, borderRadius: 3, padding: "10px 4px", textAlign: "center" }}>
                    <Lbl style={{ display: "block", marginBottom: 4 }}>{m.m}</Lbl>
                    <M size={12} color={m.v >= 0 ? C.green : C.red} weight={700}>{fmt.pct(m.v)}</M>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
                {MONTHLY_RETURNS.slice(6).map(m => (
                  <div key={m.m} style={{ background: m.v > 0 ? C.green + "20" : C.red + "20", border: `1px solid ${m.v > 0 ? C.green + "30" : C.red + "30"}`, borderRadius: 3, padding: "10px 4px", textAlign: "center" }}>
                    <Lbl style={{ display: "block", marginBottom: 4 }}>{m.m}</Lbl>
                    <M size={12} color={m.v >= 0 ? C.green : C.red} weight={700}>{fmt.pct(m.v)}</M>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TRADES TAB */}
      {tab === "trades" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <CardHeader title="Win / Loss Distribution" sub={`${winCount + lossCount} closed trades`} />
            <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 24 }}>
              <PieChart width={130} height={130}>
                <Pie data={pieData} cx={60} cy={60} innerRadius={38} outerRadius={58} dataKey="value" strokeWidth={0} paddingAngle={2}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
              </PieChart>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <Lbl>Winners</Lbl>
                  <M size={22} color={C.green} weight={700} style={{ display: "block", marginTop: 3 }}>{winCount}</M>
                  <M size={10} color={C.textMuted} style={{ display: "block" }}>{winRate}% win rate</M>
                </div>
                <div>
                  <Lbl>Losers</Lbl>
                  <M size={22} color={C.red} weight={700} style={{ display: "block", marginTop: 3 }}>{lossCount}</M>
                  <M size={10} color={C.textMuted} style={{ display: "block" }}>{(100 - parseFloat(winRate)).toFixed(1)}%</M>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Trade Size Distribution" sub="P&L by trade size bucket" />
            <div style={{ padding: "8px 12px 12px" }}>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={TRADE_SIZE_DIST} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="range" tick={{ fontFamily: mono, fontSize: fs(8), fill: C.textMuted }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontFamily: mono, fontSize: fs(8), fill: C.textMuted }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} formatter={(v: any) => [v, "Trades"]} />
                  <Bar dataKey="count" fill={C.green} radius={[2, 2, 0, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card style={{ gridColumn: "span 2" }}>
            <CardHeader title="Performance Metrics" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", padding: "14px 18px", gap: 0 }}>
              {[
                { l: "Sharpe Ratio", v: "1.84", c: C.green },
                { l: "Sortino Ratio", v: "2.41", c: C.green },
                { l: "Profit Factor", v: "2.18", c: C.green },
                { l: "Avg Winner", v: "+$54.20", c: C.green },
                { l: "Avg Loser", v: "-$17.50", c: C.red },
                { l: "Avg Hold Time", v: "1h 22m", c: C.textPri },
              ].map(({ l, v, c }, i) => (
                <div key={l} style={{ paddingRight: i < 5 ? 16 : 0, paddingLeft: i > 0 ? 16 : 0, borderRight: i < 5 ? `1px solid ${C.borderSub}` : "none" }}>
                  <Lbl>{l}</Lbl>
                  <M size={16} color={c} weight={700} style={{ display: "block", marginTop: 6 }}>{v}</M>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* PAIRS TAB */}
      {tab === "pairs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <CardHeader title="P&L by Trading Pair" />
            <div style={{ padding: "8px 20px 16px" }}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={PAIR_BREAKDOWN} margin={{ top: 4, right: 4, bottom: 0, left: 20 }}>
                  <CartesianGrid stroke={C.borderSub} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="pair" tick={{ fontFamily: mono, fontSize: fs(9), fill: C.textMuted }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontFamily: mono, fontSize: fs(9), fill: C.textMuted }} tickLine={false} axisLine={false} tickFormatter={(v: any) => "$" + v} />
                  <Tooltip content={<CustomTooltip />} formatter={(v: any) => ["$" + v.toFixed(2), "P&L"]} />
                  <ReferenceLine y={0} stroke={C.border} />
                  <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                    {PAIR_BREAKDOWN.map((p, i) => <Cell key={i} fill={p.pnl >= 0 ? C.green : C.red} opacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "120px 70px 80px 100px 90px 100px", padding: "9px 18px", gap: 0 }}>
              {["Pair", "Trades", "Win Rate", "Realised P&L", "Fees", "Volume"].map(h => <Lbl key={h}>{h}</Lbl>)}
            </div>
            <Div />
            {PAIR_BREAKDOWN.map((p, i) => (
              <div key={p.pair}>
                <div style={{ display: "grid", gridTemplateColumns: "120px 70px 80px 100px 90px 100px", padding: "11px 18px", gap: 0, alignItems: "center", background: i % 2 === 0 ? "transparent" : C.surfaceAlt + "60" }}>
                  <M size={12} weight={700}>{p.pair}</M>
                  <M size={11} color={C.textMid}>{p.trades}</M>
                  <M size={11} color={p.winRate >= 60 ? C.green : C.amber}>{p.winRate.toFixed(1)}%</M>
                  <M size={11} color={p.pnl >= 0 ? C.green : C.red} weight={700}>{fmt.usd(p.pnl)}</M>
                  <M size={11} color={C.textMuted}>{fmt.abs(p.fees)}</M>
                  <M size={11} color={C.textMid}>{fmt.abs(p.volume)}</M>
                </div>
                {i < PAIR_BREAKDOWN.length - 1 && <Div />}
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* TIMING TAB */}
      {tab === "timing" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <CardHeader title="Average P&L by Hour of Day" sub="EAT - Based on 175 closed trades" />
            <div style={{ padding: "8px 20px 16px" }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={HOURLY_PNL} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={C.borderSub} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="h" tick={{ fontFamily: mono, fontSize: fs(8), fill: C.textMuted }} tickLine={false} axisLine={false} tickFormatter={(v: any) => v + "h"} />
                  <YAxis tick={{ fontFamily: mono, fontSize: fs(8), fill: C.textMuted }} tickLine={false} axisLine={false} tickFormatter={(v: any) => (v >= 0 ? "+" : "") + v + "%"} />
                  <Tooltip content={<CustomTooltip />} formatter={(v: any) => [(v >= 0 ? "+" : "") + v + "%", "Avg P&L"]} />
                  <ReferenceLine y={0} stroke={C.border} />
                  <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                    {HOURLY_PNL.map((h, i) => <Cell key={i} fill={h.v >= 0 ? C.green : C.red} opacity={Math.min(0.4 + Math.abs(h.v) * 0.12, 0.95)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {[
              { l: "Peak Hours", v: "08:00-10:00 EAT", sub: "Highest average P&L", c: C.green },
              { l: "Avoid Hours", v: "12:00-13:00 EAT", sub: "Consistent losses", c: C.red },
              { l: "Total Trades", v: "175 recorded", sub: "Across 5 bots", c: C.textPri },
            ].map(s => (
              <div key={s.l} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderLeft: `3px solid ${s.c}50`, borderRadius: 4, padding: "14px 16px" }}>
                <Lbl>{s.l}</Lbl>
                <M size={14} color={s.c} weight={700} style={{ display: "block", marginTop: 6 }}>{s.v}</M>
                <M size={9} color={C.textMuted} style={{ display: "block", marginTop: 3 }}>{s.sub}</M>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
