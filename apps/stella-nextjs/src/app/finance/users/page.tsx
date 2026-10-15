"use client";

import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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

// User data
const USERS = [
  { name: "alice.k", aum: 85000, pnl: 12400, pnlPct: 14.6, bots: 3, tier: "Pro", joined: "Jan 2025", winRate: 71.2, active: true },
  { name: "bob.m", aum: 62000, pnl: 8900, pnlPct: 14.4, bots: 2, tier: "Pro", joined: "Mar 2025", winRate: 68.4, active: true },
  { name: "carol.x", aum: 110000, pnl: 6200, pnlPct: 5.6, bots: 4, tier: "Enterprise", joined: "Nov 2024", winRate: 59.1, active: true },
  { name: "dan.r", aum: 38000, pnl: 4100, pnlPct: 10.8, bots: 1, tier: "Basic", joined: "May 2025", winRate: 62.8, active: true },
  { name: "eve.s", aum: 95000, pnl: -2100, pnlPct: -2.2, bots: 3, tier: "Pro", joined: "Feb 2025", winRate: 47.3, active: true },
  { name: "frank.o", aum: 22000, pnl: -800, pnlPct: -3.6, bots: 1, tier: "Basic", joined: "Jul 2025", winRate: 44.1, active: false },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

// KPI Component
function KPI({ label, value, delta, deltaLabel, sub, accent = "teal" }: {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  sub?: string;
  accent?: string;
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

// Mini bar component
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1 bg-[#1a2230] rounded-sm overflow-hidden mt-1">
      <div className="h-full rounded-sm" style={{ width: `${Math.abs(value) / max * 100}%`, background: color }} />
    </div>
  );
}

export default function UserAnalyticsPage() {
  const [userGrowth, setUserGrowth] = useState<any[]>([]);
  const [subTiers, setSubTiers] = useState<any[]>([]);

  useEffect(() => {
    // Generate user growth data
    const growth = MONTHS.map((m, i) => ({
      month: m,
      total: 12 + i * 7 + ri(0, 5),
      new: 8 + ri(0, 6),
      churned: ri(0, 3),
    }));
    setUserGrowth(growth);

    // Subscription tiers
    setSubTiers([
      { name: "Basic", count: 42, color: P.ink3 },
      { name: "Pro", count: 31, color: P.teal },
      { name: "Enterprise", count: 9, color: P.gold },
    ]);
  }, []);

  const totalAUM = USERS.reduce((s, u) => s + u.aum, 0);
  const totalUsers = 82;
  const churned = 7;

  const tierData = subTiers.map(t => ({ name: t.name, value: t.count, color: t.color }));

  return (
    <div className="flex flex-col gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Users" value={fmt(totalUsers)} delta={8.4} sub={`${churned} churned this quarter`} />
        <KPI label="Total AUM" value={fmtUSD(totalAUM)} delta={6.2} sub="Across all active accounts" />
        <KPI label="Avg AUM / User" value={fmtUSD(totalAUM / USERS.length)} accent="gold" delta={2.1} />
        <KPI
          label="Churn Rate"
          value={`${((churned / totalUsers) * 100).toFixed(1)}%`}
          accent="coral"
          delta={-1.2}
          deltaLabel="−1.2pp vs last quarter"
          sub="Improving"
        />
      </div>

      {/* Subscription Mix + User Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-3">
        {/* Subscription Tiers Donut */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">Subscription Tiers</div>
            <div className="text-[10px] text-[#5a7090] mt-1">Distribution by user count</div>
          </div>
          <div className="p-4 flex flex-col items-center gap-4">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={tierData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {tierData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex gap-6">
              {subTiers.map(t => (
                <div key={t.name} className="text-center">
                  <div className="font-mono text-base font-semibold" style={{ color: t.color }}>
                    {t.count}
                  </div>
                  <div className="font-mono text-[9px] text-[#8fa3b8] uppercase tracking-wider">
                    {t.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* User Growth Chart */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-dark">
            <div className="text-sm font-semibold text-foreground">User Growth</div>
            <div className="text-[10px] text-[#5a7090] mt-1">Monthly new users and cumulative total</div>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={userGrowth} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
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
                />
                <Tooltip contentStyle={TT_STYLE} />
                <Bar dataKey="total" name="Total Users" fill={P.navy} fillOpacity={0.2} radius={[2, 2, 0, 0]} />
                <Bar dataKey="new" name="New Users" fill={P.teal} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
                <Bar dataKey="churned" name="Churned" fill={P.coral} fillOpacity={0.7} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-3">
              {[["Total", P.navy], ["New", P.teal], ["Churned", P.coral]].map(([label, color]) => (
                <div key={label} className="flex items-center gap-2 text-xs text-[#8fa3b8] font-mono">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color as string }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* User Leaderboard */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-dark">
          <div className="text-sm font-semibold text-foreground">User Performance Leaderboard</div>
          <div className="text-[10px] text-[#5a7090] mt-1">Ranked by return % · Current quarter</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[768px]">
            <thead>
              <tr className="border-b border-dark">
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230] w-12">#</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">User</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Tier</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">AUM</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">P&L</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Return %</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Win Rate</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Bots</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Joined</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider bg-[#1a2230]">Status</th>
              </tr>
            </thead>
            <tbody>
              {USERS.sort((a, b) => b.pnlPct - a.pnlPct).map((u, i) => (
                <tr key={u.name} className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors">
                  <td className="px-4 py-2">
                    <span
                      className="font-bold text-lg"
                      style={{
                        color: i === 0 ? P.gold : i === 1 ? "#9BA8B7" : i === 2 ? "#B07E5E" : "#5a7090"
                      }}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono font-semibold text-xs text-foreground">{u.name}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-sm ${
                      u.tier === "Enterprise"
                        ? "bg-[rgba(245,166,35,0.12)] text-[#f5a623]"
                        : u.tier === "Pro"
                        ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]"
                        : "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]"
                    }`}>
                      {u.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{fmtUSD(u.aum)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-right" style={{ color: u.pnl >= 0 ? P.teal : P.coral }}>
                    {u.pnl >= 0 ? "+" : ""}{fmtUSD(u.pnl)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-right" style={{ color: u.pnlPct >= 0 ? P.teal : P.coral }}>
                    {pct(u.pnlPct)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="font-mono text-xs" style={{ color: u.winRate >= 60 ? P.teal : u.winRate >= 50 ? P.gold : P.coral }}>
                      {u.winRate}%
                    </span>
                    <MiniBar value={u.winRate} max={100} color={u.winRate >= 60 ? P.teal : u.winRate >= 50 ? P.gold : P.coral} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-center text-foreground">{u.bots}</td>
                  <td className="px-4 py-2 text-xs text-[#8fa3b8]">{u.joined}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-sm ${
                      u.active
                        ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]"
                        : "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
                    }`}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
