import { useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, PieChart, Pie,
  ScatterChart, Scatter, CartesianGrid,
} from "recharts";

// ─── FONTS & THEME ────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Geist+Mono:wght@300;400;500;600&family=Instrument+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #F7F6F3;
    --bg1:       #FFFFFF;
    --bg2:       #F0EEE9;
    --bg3:       #E8E5DE;
    --border:    #D9D5CC;
    --border2:   #C5BFB4;
    --ink0:      #1A1714;
    --ink1:      #3D3830;
    --ink2:      #7A7266;
    --ink3:      #A89F93;
    --teal:      #0B7B6B;
    --teal-dim:  rgba(11,123,107,0.10);
    --teal-mid:  rgba(11,123,107,0.25);
    --coral:     #C24B3A;
    --coral-dim: rgba(194,75,58,0.10);
    --gold:      #B07D2E;
    --gold-dim:  rgba(176,125,46,0.12);
    --navy:      #1B2B4B;
    --navy-dim:  rgba(27,43,75,0.08);
    --display:   'Playfair Display', serif;
    --mono:      'Geist Mono', monospace;
    --sans:      'Instrument Sans', sans-serif;
  }

  body { background: var(--bg); color: var(--ink0); font-family: var(--sans); }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: var(--bg2); }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

  /* ── LAYOUT ── */
  .analytics { display: flex; flex-direction: column; min-height: 100vh; background: var(--bg); }

  /* ── HEADER ── */
  .analytics-header {
    background: var(--navy); padding: 20px 28px;
    display: flex; align-items: flex-end; justify-content: space-between;
    border-bottom: 3px solid var(--teal);
  }
  .analytics-wordmark { font-family: var(--display); font-size: 22px; font-weight: 700; color: #fff; letter-spacing: 0.01em; }
  .analytics-sub { font-family: var(--mono); font-size: 11px; color: rgba(255,255,255,0.45); margin-top: 2px; letter-spacing: 0.08em; text-transform: uppercase; }
  .header-meta { text-align: right; }
  .header-date { font-family: var(--mono); font-size: 11px; color: rgba(255,255,255,0.5); }
  .header-period {
    display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end;
  }
  .period-btn {
    padding: 4px 10px; border-radius: 2px; font-family: var(--mono); font-size: 10px;
    border: 1px solid rgba(255,255,255,0.15); background: transparent; color: rgba(255,255,255,0.5);
    cursor: pointer; transition: all 0.15s; letter-spacing: 0.06em;
  }
  .period-btn:hover { border-color: rgba(255,255,255,0.4); color: #fff; }
  .period-btn.active { background: var(--teal); border-color: var(--teal); color: #fff; }

  /* ── TABS ── */
  .tab-bar {
    background: var(--bg1); border-bottom: 1px solid var(--border);
    display: flex; padding: 0 28px; overflow-x: auto;
  }
  .tab-item {
    padding: 14px 20px; font-size: 12px; font-weight: 500; cursor: pointer;
    color: var(--ink2); border-bottom: 2px solid transparent;
    white-space: nowrap; transition: all 0.15s; background: none; border-top: none;
    border-left: none; border-right: none; font-family: var(--sans);
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  .tab-item:hover { color: var(--ink0); }
  .tab-item.active { color: var(--navy); border-bottom-color: var(--teal); font-weight: 600; }
  .tab-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 7px; vertical-align: middle; }

  /* ── CONTENT ── */
  .tab-content { padding: 24px 28px; flex: 1; }

  /* ── GRID SYSTEMS ── */
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .grid-2-1 { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; }
  .grid-1-2 { display: grid; grid-template-columns: 1fr 2fr; gap: 14px; }
  .col-span-2 { grid-column: span 2; }
  .col-span-3 { grid-column: span 3; }

  /* ── KPI CARDS ── */
  .kpi {
    background: var(--bg1); border: 1px solid var(--border); border-radius: 4px;
    padding: 16px 18px; position: relative; overflow: hidden;
    transition: border-color 0.2s;
  }
  .kpi:hover { border-color: var(--border2); }
  .kpi::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--teal); }
  .kpi.coral::before { background: var(--coral); }
  .kpi.gold::before { background: var(--gold); }
  .kpi.navy::before { background: var(--navy); }
  .kpi-label { font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink2); margin-bottom: 8px; }
  .kpi-value { font-family: var(--display); font-size: 28px; font-weight: 700; color: var(--ink0); line-height: 1; }
  .kpi-value.teal { color: var(--teal); }
  .kpi-value.coral { color: var(--coral); }
  .kpi-value.gold { color: var(--gold); }
  .kpi-delta { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-family: var(--mono); font-size: 11px; font-weight: 500; padding: 2px 7px; border-radius: 2px; }
  .kpi-delta.up { background: var(--teal-dim); color: var(--teal); }
  .kpi-delta.dn { background: var(--coral-dim); color: var(--coral); }
  .kpi-delta.neutral { background: var(--gold-dim); color: var(--gold); }
  .kpi-sub { font-family: var(--mono); font-size: 10px; color: var(--ink3); margin-top: 4px; }

  /* ── CHART CARDS ── */
  .chart-card {
    background: var(--bg1); border: 1px solid var(--border); border-radius: 4px;
    overflow: hidden;
  }
  .chart-header {
    padding: 14px 18px 10px; display: flex; align-items: baseline; justify-content: space-between;
    border-bottom: 1px solid var(--border);
  }
  .chart-title { font-family: var(--display); font-size: 15px; font-weight: 600; color: var(--ink0); }
  .chart-meta { font-family: var(--mono); font-size: 10px; color: var(--ink3); }
  .chart-body { padding: 14px 18px; }
  .chart-body.no-pad { padding: 0; }

  /* ── SECTION LABEL ── */
  .section-label {
    font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--ink3); margin-bottom: 12px; padding-bottom: 6px;
    border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;
  }

  /* ── TABLES ── */
  .data-table { width: 100%; border-collapse: collapse; }
  .data-table th {
    font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--ink3); padding: 8px 12px; text-align: left; border-bottom: 2px solid var(--border);
    font-weight: 500; background: var(--bg2);
  }
  .data-table th.right { text-align: right; }
  .data-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--ink1); }
  .data-table td.right { text-align: right; }
  .data-table td.mono { font-family: var(--mono); font-size: 11px; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: var(--bg); }

  /* ── TAGS / BADGES ── */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 2px; font-family: var(--mono); font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
  .badge.teal  { background: var(--teal-dim); color: var(--teal); }
  .badge.coral { background: var(--coral-dim); color: var(--coral); }
  .badge.gold  { background: var(--gold-dim); color: var(--gold); }
  .badge.navy  { background: var(--navy-dim); color: var(--navy); }

  /* ── RANK NUMBER ── */
  .rank { font-family: var(--display); font-size: 18px; font-weight: 700; color: var(--border2); width: 28px; }
  .rank.gold { color: var(--gold); }
  .rank.silver { color: #9BA8B7; }
  .rank.bronze { color: #B07E5E; }

  /* ── MINI BAR ── */
  .mini-bar-track { height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden; margin-top: 4px; }
  .mini-bar-fill  { height: 100%; border-radius: 2px; }

  /* ── HEATMAP ── */
  .heatmap { display: grid; grid-template-columns: 40px repeat(24, 1fr); gap: 2px; }
  .heat-label { font-family: var(--mono); font-size: 9px; color: var(--ink3); display: flex; align-items: center; }
  .heat-cell {
    height: 22px; border-radius: 2px; display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 8px; font-weight: 500; cursor: default;
    transition: opacity 0.15s;
  }
  .heat-cell:hover { opacity: 0.7; }
  .heatmap-x-labels { display: grid; grid-template-columns: 40px repeat(24, 1fr); gap: 2px; margin-top: 4px; }
  .heat-x-lbl { font-family: var(--mono); font-size: 8px; color: var(--ink3); text-align: center; }

  /* ── RISK GAUGE ── */
  .gauge-ring { position: relative; display: flex; align-items: center; justify-content: center; }
  .gauge-label { position: absolute; text-align: center; }

  /* ── CONCENTRATION BAR ── */
  .concentration-bar { height: 20px; display: flex; border-radius: 3px; overflow: hidden; gap: 1px; }
  .conc-seg { height: 100%; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 8px; font-weight: 600; transition: opacity 0.2s; cursor: default; }
  .conc-seg:hover { opacity: 0.75; }

  /* ── SCROLL AREA ── */
  .scroll-x { overflow-x: auto; }

  /* ── LEGEND ── */
  .legend { display: flex; gap: 16px; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 10px; color: var(--ink2); }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; }

  /* ── RESPONSIVE ── */
  @media (max-width: 900px) {
    .grid-4 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: repeat(2, 1fr); }
    .grid-2-1, .grid-1-2 { grid-template-columns: 1fr; }
    .tab-content { padding: 16px; }
  }
  @media (max-width: 600px) {
    .grid-4, .grid-3, .grid-2 { grid-template-columns: 1fr; }
    .col-span-2, .col-span-3 { grid-column: span 1; }
  }
`;

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const P = { teal: "#0B7B6B", coral: "#C24B3A", gold: "#B07D2E", navy: "#1B2B4B", ink2: "#7A7266", ink3: "#A89F93", border: "#D9D5CC" };

// ─── DATA GENERATORS ─────────────────────────────────────────────────────────
function rnd(a, b) { return a + Math.random() * (b - a); }
function ri(a, b) { return Math.floor(rnd(a, b)); }
function pick(arr) { return arr[ri(0, arr.length)]; }
function fmt(n, decimals = 0) { return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function fmtUSD(n) { return n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`; }
function pct(n) { return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }

// Monthly returns
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthlyReturns = MONTHS.map((m, i) => ({
  month: m,
  return: parseFloat((rnd(-6, 18)).toFixed(2)),
  trades: ri(800, 3200),
  volume: parseFloat((rnd(1.2, 8.5)).toFixed(2)),
}));

// Equity curve (platform)
let equity = 500000;
const equityCurve = Array.from({ length: 90 }, (_, i) => {
  equity *= 1 + (Math.random() - 0.44) * 0.022;
  return { day: i + 1, value: Math.round(equity), label: `Day ${i + 1}` };
});

// Drawdown curve
let peak = 0, dd = 0;
const drawdownCurve = equityCurve.map(p => {
  if (p.value > peak) peak = p.value;
  dd = ((p.value - peak) / peak) * 100;
  return { day: p.day, value: parseFloat(dd.toFixed(2)) };
});

// Strategies
const STRATS = [
  { name: "Momentum Grid", pair: "BTC/USDT", exchange: "Binance", pnl: 48200, pnlPct: 9.64, sharpe: 2.31, sortino: 3.12, winRate: 67.4, maxDD: -4.2, trades: 1842, avgHold: "4h 12m", pf: 2.1, correlation: 1.0 },
  { name: "Arbitrage V2", pair: "ETH/USDT", exchange: "Bybit", pnl: 31700, pnlPct: 6.34, sharpe: 3.04, sortino: 4.21, winRate: 74.1, maxDD: -2.1, trades: 5621, avgHold: "8m", pf: 3.4, correlation: 0.12 },
  { name: "Mean Reversion", pair: "SOL/USDT", exchange: "OKX", pnl: 19400, pnlPct: 3.88, sharpe: 1.78, sortino: 2.44, winRate: 61.2, maxDD: -7.8, trades: 923, avgHold: "11h 30m", pf: 1.8, correlation: 0.34 },
  { name: "Trend Follow", pair: "BNB/USDT", exchange: "Binance", pnl: 8900, pnlPct: 1.78, sharpe: 1.21, sortino: 1.67, winRate: 54.3, maxDD: -11.4, trades: 412, avgHold: "2d 6h", pf: 1.5, correlation: 0.61 },
  { name: "Scalp Pro", pair: "XRP/USDT", exchange: "Kraken", pnl: -4200, pnlPct: -0.84, sharpe: 0.44, sortino: 0.61, winRate: 48.7, maxDD: -14.2, trades: 3812, avgHold: "22m", pf: 0.9, correlation: 0.08 },
];

// Strategy equity curves
const stratEquity = STRATS.map(s => {
  let v = 50000;
  return Array.from({ length: 90 }, (_, i) => {
    const drift = s.pnlPct > 0 ? 0.44 : 0.56;
    v *= 1 + (Math.random() - drift) * 0.025;
    return { day: i + 1, [s.name.split(" ")[0]]: Math.round(v) };
  });
});
const mergedStratEquity = Array.from({ length: 90 }, (_, i) => {
  const obj = { day: i + 1 };
  STRATS.forEach((s, si) => {
    obj[s.name.split(" ")[0]] = stratEquity[si][i][s.name.split(" ")[0]];
  });
  return obj;
});

// Users
const USERS = [
  { name: "alice.k", aum: 85000, pnl: 12400, pnlPct: 14.6, bots: 3, tier: "Pro", joined: "Jan 2025", winRate: 71.2, active: true },
  { name: "bob.m", aum: 62000, pnl: 8900, pnlPct: 14.4, bots: 2, tier: "Pro", joined: "Mar 2025", winRate: 68.4, active: true },
  { name: "carol.x", aum: 110000, pnl: 6200, pnlPct: 5.6, bots: 4, tier: "Enterprise", joined: "Nov 2024", winRate: 59.1, active: true },
  { name: "dan.r", aum: 38000, pnl: 4100, pnlPct: 10.8, bots: 1, tier: "Basic", joined: "May 2025", winRate: 62.8, active: true },
  { name: "eve.s", aum: 95000, pnl: -2100, pnlPct: -2.2, bots: 3, tier: "Pro", joined: "Feb 2025", winRate: 47.3, active: true },
  { name: "frank.o", aum: 22000, pnl: -800, pnlPct: -3.6, bots: 1, tier: "Basic", joined: "Jul 2025", winRate: 44.1, active: false },
];

// User growth
const userGrowth = MONTHS.slice(0, 8).map((m, i) => ({
  month: m, total: 12 + i * 7 + ri(0, 5), new: 8 + ri(0, 6), churned: ri(0, 3),
}));

// Subscription tiers
const subTiers = [
  { name: "Basic", count: 42, color: P.ink3 },
  { name: "Pro", count: 31, color: P.teal },
  { name: "Enterprise", count: 9, color: P.gold },
];

// Pairs performance
const PAIRS = [
  { pair: "BTC/USDT", trades: 4821, pnl: 38400, winRate: 64.2, volume: "$12.4M", exchange: "Binance", pnlPct: 7.68 },
  { pair: "ETH/USDT", trades: 3102, pnl: 22100, winRate: 71.3, volume: "$8.1M", exchange: "Bybit", pnlPct: 4.42 },
  { pair: "SOL/USDT", trades: 1840, pnl: 9800, winRate: 58.9, volume: "$3.2M", exchange: "OKX", pnlPct: 1.96 },
  { pair: "BNB/USDT", trades: 924, pnl: 6200, winRate: 55.4, volume: "$2.1M", exchange: "Binance", pnlPct: 1.24 },
  { pair: "XRP/USDT", trades: 2241, pnl: -1800, winRate: 46.2, volume: "$1.8M", exchange: "Kraken", pnlPct: -0.36 },
];

// Hourly heatmap data (7 days × 24 hours)
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const heatmapData = DAYS.map(day =>
  Array.from({ length: 24 }, (_, h) => {
    const val = rnd(-2.5, 5.5);
    return { hour: h, day, val: parseFloat(val.toFixed(2)) };
  })
);

// Exchange distribution
const exchanges = [
  { name: "Binance", pct: 41, pnl: "+$34,200", color: "#F0B90B" },
  { name: "Bybit", pct: 28, pnl: "+$18,700", color: P.teal },
  { name: "OKX", pct: 18, pnl: "+$8,400", color: P.navy },
  { name: "Kraken", pct: 13, pnl: "-$1,800", color: P.coral },
];

// Day of week perf
const dayPerf = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => ({
  day: d, return: parseFloat(rnd(-0.8, 2.4).toFixed(2)),
  trades: ri(300, 1200),
}));

// ─── TOOLTIP STYLE ────────────────────────────────────────────────────────────
const TT_STYLE = { background: "#fff", border: "1px solid #D9D5CC", borderRadius: 3, fontSize: 11, fontFamily: "'Geist Mono', monospace", color: "#1A1714", padding: "6px 10px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" };

// ─── HEATMAP COLOUR ────────────────────────────────────────────────────────────
function heatColor(val) {
  if (val >= 3.5) return { bg: "#0B7B6B", text: "#fff" };
  if (val >= 2.0) return { bg: "#2A9D8F", text: "#fff" };
  if (val >= 0.5) return { bg: "#A8DFDA", text: "#1A1714" };
  if (val >= -0.5) return { bg: "#F0EEE9", text: "#A89F93" };
  if (val >= -1.5) return { bg: "#F4C5BE", text: "#1A1714" };
  return { bg: "#C24B3A", text: "#fff" };
}

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────
function KPI({ label, value, delta, deltaLabel, sub, accent = "teal", variant }) {
  return (
    <div className={`kpi ${variant || ""}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${accent}`}>{value}</div>
      {delta !== undefined && (
        <div>
          <span className={`kpi-delta ${delta >= 0 ? "up" : "dn"}`}>
            {delta >= 0 ? "▲" : "▼"} {deltaLabel || pct(Math.abs(delta))}
          </span>
        </div>
      )}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function SectionLabel({ children, right }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

function MiniBar({ value, max, color = P.teal }) {
  return (
    <div className="mini-bar-track">
      <div className="mini-bar-fill" style={{ width: `${Math.abs(value) / max * 100}%`, background: color }} />
    </div>
  );
}

// ─── TAB 1: PLATFORM OVERVIEW ────────────────────────────────────────────────
function OverviewTab() {
  const totalPnL = equityCurve[equityCurve.length - 1].value - equityCurve[0].value;
  const totalTrades = monthlyReturns.reduce((s, m) => s + m.trades, 0);
  const avgSharpe = (STRATS.reduce((s, st) => s + st.sharpe, 0) / STRATS.length).toFixed(2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div className="grid-4">
        <KPI label="Platform Equity" value={fmtUSD(equityCurve[equityCurve.length - 1].value)} delta={9.6} sub={`Started at ${fmtUSD(equityCurve[0].value)}`} />
        <KPI label="Realized P&L (90d)" value={fmtUSD(totalPnL)} delta={totalPnL > 0 ? 9.6 : -9.6} sub="All strategies combined" />
        <KPI label="Total Trades" value={fmt(totalTrades)} accent="gold" variant="gold" delta={12.3} deltaLabel="vs last quarter" sub={`Avg ${fmt(Math.round(totalTrades / 90))}/day`} />
        <KPI label="Avg Sharpe Ratio" value={avgSharpe} accent="navy" variant="navy" sub="Risk-adjusted return quality" delta={0.18} deltaLabel="+0.18 vs benchmark" />
      </div>
      <div className="grid-4">
        <KPI label="Active Users" value="82" delta={8.4} sub="68 with active bots" />
        <KPI label="AUM Total" value="$863K" delta={6.2} sub="Across all portfolios" />
        <KPI label="Win Rate (Platform)" value="63.1%" accent="teal" delta={1.4} sub="Weighted by trade count" />
        <KPI label="Max Drawdown (90d)" value="-8.4%" accent="coral" variant="coral" delta={-8.4} deltaLabel="8.4% from peak" sub="Within acceptable range" />
      </div>

      {/* Equity curve */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <div className="chart-title">Platform Equity Curve</div>
            <div className="chart-meta">Combined portfolio value across all users · 90-day window</div>
          </div>
          <span className="badge teal">LIVE</span>
        </div>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={equityCurve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={P.teal} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={P.teal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontFamily: P.mono, fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} interval={14} />
              <YAxis tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} tickFormatter={v => fmtUSD(v)} width={60} />
              <Tooltip contentStyle={TT_STYLE} formatter={v => [fmtUSD(v), "Equity"]} />
              <Area type="monotone" dataKey="value" stroke={P.teal} strokeWidth={2} fill="url(#eqGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly returns + drawdown */}
      <div className="grid-2">
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Monthly Returns</div>
            <div className="chart-meta">% return by calendar month</div>
          </div>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={monthlyReturns} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="month" tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={35} />
                <Tooltip contentStyle={TT_STYLE} formatter={v => [`${v}%`, "Return"]} />
                <ReferenceLine y={0} stroke={P.border} />
                <Bar dataKey="return" radius={[2, 2, 0, 0]}>
                  {monthlyReturns.map((m, i) => (
                    <Cell key={i} fill={m.return >= 0 ? P.teal : P.coral} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Drawdown Profile</div>
            <div className="chart-meta">% decline from peak equity</div>
          </div>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={drawdownCurve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={P.coral} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={P.coral} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} interval={14} />
                <YAxis tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={35} domain={["auto", 0]} />
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

// ─── TAB 2: STRATEGY PERFORMANCE ─────────────────────────────────────────────
function StrategyTab() {
  const [sort, setSort] = useState("pnl");
  const [selected, setSelected] = useState(null);
  const sorted = [...STRATS].sort((a, b) => {
    if (sort === "pnl") return b.pnl - a.pnl;
    if (sort === "sharpe") return b.sharpe - a.sharpe;
    if (sort === "winRate") return b.winRate - a.winRate;
    if (sort === "maxDD") return b.maxDD - a.maxDD;
    return 0;
  });
  const radarStrat = selected ? STRATS.find(s => s.name === selected) : STRATS[0];
  const radarData = [
    { metric: "Win Rate", value: radarStrat.winRate },
    { metric: "Sharpe", value: Math.min(radarStrat.sharpe * 25, 100) },
    { metric: "Trades", value: Math.min(radarStrat.trades / 60, 100) },
    { metric: "PnL%", value: Math.max(0, radarStrat.pnlPct * 5) },
    { metric: "Safety", value: Math.max(0, 100 + radarStrat.maxDD * 4) },
    { metric: "Profit Factor", value: Math.min(radarStrat.pf * 20, 100) },
  ];
  const stratColors = [P.teal, P.gold, P.navy, P.ink2, P.coral];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="grid-2-1">
        {/* Equity curve overlay */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Strategy Equity Curves</div>
            <div className="chart-meta">Normalized to $50K starting equity</div>
          </div>
          <div className="chart-body">
            <div className="legend" style={{ marginBottom: 10 }}>
              {STRATS.map((s, i) => (
                <div className="legend-item" key={s.name}
                  style={{ cursor: "pointer", opacity: selected && selected !== s.name ? 0.35 : 1 }}
                  onClick={() => setSelected(selected === s.name ? null : s.name)}>
                  <div className="legend-dot" style={{ background: stratColors[i] }} />
                  {s.name.split(" ")[0]}
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={mergedStratEquity} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="day" tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} interval={14} />
                <YAxis tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} tickFormatter={v => fmtUSD(v)} width={60} />
                <Tooltip contentStyle={TT_STYLE} formatter={v => [fmtUSD(v)]} />
                {STRATS.map((s, i) => (
                  <Line key={s.name} type="monotone" dataKey={s.name.split(" ")[0]}
                    stroke={stratColors[i]} strokeWidth={selected === s.name ? 2.5 : 1.5}
                    dot={false} opacity={selected && selected !== s.name ? 0.2 : 1} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar chart for selected strategy */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Risk Profile</div>
            <div className="chart-meta">{radarStrat.name}</div>
          </div>
          <div className="chart-body" style={{ display: "flex", justifyContent: "center" }}>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={75}>
                <PolarGrid stroke={P.border} />
                <PolarAngleAxis dataKey="metric" tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink2 }} />
                <Radar dataKey="value" stroke={P.teal} fill={P.teal} fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Strategy table */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">Strategy Scorecard</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["pnl", "P&L"], ["sharpe", "Sharpe"], ["winRate", "Win Rate"], ["maxDD", "Drawdown"]].map(([key, label]) => (
              <button key={key} onClick={() => setSort(key)}
                style={{ padding: "3px 9px", borderRadius: 2, fontFamily: "'Geist Mono'", fontSize: 9, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
                  background: sort === key ? P.navy : "transparent", color: sort === key ? "#fff" : P.ink3, border: `1px solid ${sort === key ? P.navy : P.border}` }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="scroll-x">
          <table className="data-table">
            <thead>
              <tr>
                <th>Strategy</th><th>Pair</th><th>P&L</th><th>Return %</th>
                <th>Sharpe</th><th>Sortino</th><th>Win Rate</th><th>Max DD</th>
                <th>Trades</th><th>Avg Hold</th><th>Profit Factor</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={s.name} onClick={() => setSelected(selected === s.name ? null : s.name)}
                  style={{ cursor: "pointer", background: selected === s.name ? "#F0F9F7" : undefined }}>
                  <td style={{ fontWeight: 600, color: P.navy }}>{s.name}</td>
                  <td className="mono" style={{ color: P.ink2 }}>{s.pair}</td>
                  <td className="mono right" style={{ color: s.pnl >= 0 ? P.teal : P.coral, textAlign: "right" }}>{fmtUSD(s.pnl)}</td>
                  <td className="mono right" style={{ color: s.pnlPct >= 0 ? P.teal : P.coral, textAlign: "right" }}>{pct(s.pnlPct)}</td>
                  <td className="mono right" style={{ textAlign: "right" }}>
                    <span style={{ color: s.sharpe >= 2 ? P.teal : s.sharpe >= 1 ? P.gold : P.coral }}>{s.sharpe.toFixed(2)}</span>
                  </td>
                  <td className="mono right" style={{ textAlign: "right" }}>{s.sortino.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className="mono" style={{ color: s.winRate >= 60 ? P.teal : s.winRate >= 50 ? P.gold : P.coral }}>{s.winRate}%</span>
                    <MiniBar value={s.winRate} max={100} color={s.winRate >= 60 ? P.teal : s.winRate >= 50 ? P.gold : P.coral} />
                  </td>
                  <td className="mono right" style={{ color: P.coral, textAlign: "right" }}>{s.maxDD}%</td>
                  <td className="mono right" style={{ textAlign: "right" }}>{fmt(s.trades)}</td>
                  <td className="mono" style={{ color: P.ink2 }}>{s.avgHold}</td>
                  <td className="mono right" style={{ color: s.pf >= 2 ? P.teal : s.pf >= 1 ? P.gold : P.coral, textAlign: "right" }}>{s.pf.toFixed(1)}x</td>
                  <td>
                    <span className={`badge ${s.pnl >= 0 ? "teal" : "coral"}`}>
                      {s.pnl >= 0 ? "Profitable" : "Losing"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sharpe legend */}
      <div style={{ display: "flex", gap: 16, padding: "0 4px" }}>
        <div className="legend-item"><div className="legend-dot" style={{ background: P.teal }} />Sharpe ≥ 2.0 (Excellent)</div>
        <div className="legend-item"><div className="legend-dot" style={{ background: P.gold }} />Sharpe 1–2 (Good)</div>
        <div className="legend-item"><div className="legend-dot" style={{ background: P.coral }} />Sharpe &lt; 1 (Poor)</div>
      </div>
    </div>
  );
}

// ─── TAB 3: USER ANALYTICS ───────────────────────────────────────────────────
function UserTab() {
  const totalAUM = USERS.reduce((s, u) => s + u.aum, 0);
  const totalUsers = 82;
  const churned = 7;

  const tierData = subTiers.map(t => ({ name: t.name, value: t.count, color: t.color }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div className="grid-4">
        <KPI label="Total Users" value={fmt(totalUsers)} delta={8.4} sub={`${churned} churned this quarter`} />
        <KPI label="Total AUM" value={fmtUSD(totalAUM)} delta={6.2} sub="Across all active accounts" />
        <KPI label="Avg AUM / User" value={fmtUSD(totalAUM / USERS.length)} accent="gold" variant="gold" delta={2.1} />
        <KPI label="Churn Rate" value={`${((churned / totalUsers) * 100).toFixed(1)}%`} accent="coral" variant="coral" delta={-1.2} deltaLabel="−1.2pp vs last quarter" sub="Improving" />
      </div>

      <div className="grid-1-2">
        {/* Subscription mix donut */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Subscription Tiers</div>
            <div className="chart-meta">Distribution by user count</div>
          </div>
          <div className="chart-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={tierData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                  dataKey="value" paddingAngle={3}>
                  {tierData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 16 }}>
              {subTiers.map(t => (
                <div key={t.name} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'Geist Mono'", fontSize: 16, fontWeight: 600, color: t.color }}>{t.count}</div>
                  <div style={{ fontFamily: "'Geist Mono'", fontSize: 9, color: P.ink3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* User growth chart */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">User Growth</div>
            <div className="chart-meta">Monthly new users and cumulative total</div>
          </div>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={userGrowth} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="month" tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TT_STYLE} />
                <Bar dataKey="total" name="Total Users" fill={P.navy} fillOpacity={0.2} radius={[2, 2, 0, 0]} />
                <Bar dataKey="new" name="New Users" fill={P.teal} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
                <Bar dataKey="churned" name="Churned" fill={P.coral} fillOpacity={0.7} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="legend" style={{ marginTop: 8 }}>
              {[["Total", P.navy], ["New", P.teal], ["Churned", P.coral]].map(([l, c]) => (
                <div className="legend-item" key={l}><div className="legend-dot" style={{ background: c }} />{l}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* User leaderboard */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">User Performance Leaderboard</div>
          <div className="chart-meta">Ranked by return % · Current quarter</div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>User</th><th>Tier</th><th>AUM</th>
              <th className="right">P&L</th><th className="right">Return %</th>
              <th className="right">Win Rate</th><th>Bots</th><th>Joined</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {USERS.sort((a, b) => b.pnlPct - a.pnlPct).map((u, i) => (
              <tr key={u.name}>
                <td><span className={`rank ${i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : ""}`}>{i + 1}</span></td>
                <td style={{ fontWeight: 600, fontFamily: "'Geist Mono'", fontSize: 12 }}>{u.name}</td>
                <td><span className={`badge ${u.tier === "Enterprise" ? "gold" : u.tier === "Pro" ? "teal" : "navy"}`}>{u.tier}</span></td>
                <td className="mono">{fmtUSD(u.aum)}</td>
                <td className="mono right" style={{ color: u.pnl >= 0 ? P.teal : P.coral }}>{u.pnl >= 0 ? "+" : ""}{fmtUSD(u.pnl)}</td>
                <td className="mono right" style={{ color: u.pnlPct >= 0 ? P.teal : P.coral }}>{pct(u.pnlPct)}</td>
                <td style={{ textAlign: "right" }}>
                  <span className="mono" style={{ color: u.winRate >= 60 ? P.teal : u.winRate >= 50 ? P.gold : P.coral }}>{u.winRate}%</span>
                  <MiniBar value={u.winRate} max={100} color={u.winRate >= 60 ? P.teal : u.winRate >= 50 ? P.gold : P.coral} />
                </td>
                <td className="mono" style={{ textAlign: "center" }}>{u.bots}</td>
                <td style={{ color: P.ink3, fontSize: 11 }}>{u.joined}</td>
                <td><span className={`badge ${u.active ? "teal" : "coral"}`}>{u.active ? "Active" : "Inactive"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TAB 4: RISK DASHBOARD ───────────────────────────────────────────────────
function RiskTab() {
  const varData = [
    { level: "95% VaR", value: -3.8, desc: "5% chance of losing more than this in a single day" },
    { level: "99% VaR", value: -6.2, desc: "1% chance of losing more than this in a single day" },
    { level: "99.9% CVaR", value: -10.1, desc: "Expected loss in worst 0.1% of scenarios" },
  ];

  // Correlation matrix (simplified — 5x5)
  const corrNames = STRATS.map(s => s.name.split(" ")[0]);
  const corrMatrix = [
    [1.00, 0.12, 0.34, 0.61, 0.08],
    [0.12, 1.00, 0.09, 0.15, 0.22],
    [0.34, 0.09, 1.00, 0.42, 0.17],
    [0.61, 0.15, 0.42, 1.00, 0.11],
    [0.08, 0.22, 0.17, 0.11, 1.00],
  ];

  function corrColor(v) {
    if (v >= 0.7) return { bg: "#C24B3A", text: "#fff" };
    if (v >= 0.4) return { bg: "#F4C5BE", text: "#1A1714" };
    if (v >= 0.2) return { bg: "#F0EEE9", text: "#7A7266" };
    if (v < 0) return { bg: "#A8DFDA", text: "#1A1714" };
    return { bg: "#E8F5F3", text: "#1A1714" };
  }

  // Position sizing distribution
  const sizeDist = [
    { size: "0–1%", count: 48 },
    { size: "1–2%", count: 71 },
    { size: "2–5%", count: 33 },
    { size: "5–10%", count: 14 },
    { size: ">10%", count: 4 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div className="grid-4">
        <KPI label="Platform VaR (95%)" value="-3.8%" accent="coral" variant="coral" sub="Max expected daily loss" />
        <KPI label="Largest Single Exposure" value="41%" accent="gold" variant="gold" sub="Binance exchange concentration" />
        <KPI label="Strategy Correlation (avg)" value="0.24" sub="Low = well diversified" delta={-0.06} deltaLabel="Improving vs last month" />
        <KPI label="Open Risk (Unrealized)" value="$34K" accent="navy" variant="navy" sub="Across all open positions" />
      </div>

      {/* VaR + concentration */}
      <div className="grid-2">
        {/* VaR table */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Value at Risk (VaR)</div>
            <div className="chart-meta">Daily loss thresholds at confidence levels</div>
          </div>
          <div className="chart-body">
            {varData.map((v, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: "'Geist Mono'", fontSize: 11, fontWeight: 600, color: P.navy }}>{v.level}</span>
                  <span style={{ fontFamily: "'Geist Mono'", fontSize: 14, fontWeight: 700, color: P.coral }}>{v.value}%</span>
                </div>
                <div style={{ fontFamily: "'Geist Mono'", fontSize: 9, color: P.ink3, marginBottom: 6 }}>{v.desc}</div>
                <div className="mini-bar-track" style={{ height: 6 }}>
                  <div className="mini-bar-fill" style={{ width: `${Math.abs(v.value) * 6}%`, background: P.coral, opacity: 0.7 + i * 0.1 }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 16, padding: "10px 12px", background: "#FFF8F0", border: "1px solid #F4C5BE", borderRadius: 3, fontFamily: "'Geist Mono'", fontSize: 10, color: P.coral }}>
              ⚠ Max drawdown threshold set at −10%. Platform kill switch auto-triggers at −15%.
            </div>
          </div>
        </div>

        {/* Capital concentration */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Capital Concentration</div>
            <div className="chart-meta">AUM distribution by dimension</div>
          </div>
          <div className="chart-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { label: "By Exchange", segs: exchanges.map(e => ({ label: e.name, pct: e.pct, color: e.color })) },
              { label: "By Strategy", segs: STRATS.map((s, i) => ({ label: s.name.split(" ")[0], pct: [35, 25, 18, 13, 9][i], color: [P.teal, P.gold, P.navy, P.ink2, P.coral][i] })) },
              { label: "By Pair", segs: PAIRS.map((p, i) => ({ label: p.pair.split("/")[0], pct: [38, 26, 15, 11, 10][i], color: [P.navy, P.teal, P.gold, P.ink2, P.coral][i] })) },
            ].map(({ label, segs }) => (
              <div key={label}>
                <div style={{ fontFamily: "'Geist Mono'", fontSize: 9, color: P.ink3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
                <div className="concentration-bar">
                  {segs.map((seg, i) => (
                    <div key={i} title={`${seg.label}: ${seg.pct}%`} className="conc-seg"
                      style={{ width: `${seg.pct}%`, background: seg.color, color: "#fff", fontSize: 8, fontFamily: "'Geist Mono'", fontWeight: 600 }}>
                      {seg.pct >= 10 ? seg.label : ""}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  {segs.map((seg, i) => (
                    <span key={i} style={{ fontFamily: "'Geist Mono'", fontSize: 9, color: P.ink3 }}>
                      <span style={{ color: seg.color, fontWeight: 600 }}>{seg.label}</span> {seg.pct}%
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Correlation matrix */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">Strategy Correlation Matrix</div>
          <div className="chart-meta">High correlation = less diversification · Target: all cells below 0.4</div>
        </div>
        <div className="chart-body">
          <div style={{ display: "grid", gridTemplateColumns: `90px repeat(${corrNames.length}, 1fr)`, gap: 3 }}>
            <div />
            {corrNames.map(n => (
              <div key={n} style={{ fontFamily: "'Geist Mono'", fontSize: 9, color: P.ink3, textAlign: "center", padding: "4px 0" }}>{n}</div>
            ))}
            {corrMatrix.map((row, ri) => (
              <>
                <div key={`label-${ri}`} style={{ fontFamily: "'Geist Mono'", fontSize: 9, color: P.ink2, display: "flex", alignItems: "center", paddingRight: 8 }}>
                  {corrNames[ri]}
                </div>
                {row.map((val, ci) => {
                  const { bg, text } = corrColor(val);
                  return (
                    <div key={`${ri}-${ci}`} style={{ background: bg, color: text, fontFamily: "'Geist Mono'", fontSize: 11, fontWeight: 600, textAlign: "center", padding: "10px 4px", borderRadius: 3 }}>
                      {val.toFixed(2)}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
          <div className="legend" style={{ marginTop: 12 }}>
            {[["≥ 0.7 High (Red)", P.coral], ["0.4–0.7 Medium", "#F4C5BE"], ["< 0.2 Low (Good)", "#A8DFDA"]].map(([l, c]) => (
              <div className="legend-item" key={l}><div className="legend-dot" style={{ background: c, border: `1px solid ${P.border}` }} />{l}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Position sizing */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">Position Sizing Distribution</div>
          <div className="chart-meta">% of account equity per trade · Oversized positions are a concentration risk</div>
        </div>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={sizeDist} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="size" tick={{ fontFamily: "'Geist Mono'", fontSize: 10, fill: P.ink3 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} />
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

// ─── TAB 5: MARKET INTELLIGENCE ──────────────────────────────────────────────
function MarketTab() {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const bestHour = { hour: 14, avgReturn: 1.84 };
  const worstHour = { hour: 3, avgReturn: -0.92 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div className="grid-4">
        <KPI label="Best Performing Pair" value="BTC/USDT" accent="teal" sub={`+$38,400 · Win rate 64.2%`} />
        <KPI label="Best Hour (UTC)" value="14:00–15:00" accent="gold" variant="gold" sub={`Avg +${bestHour.avgReturn}% per bot`} />
        <KPI label="Best Day of Week" value="Wednesday" sub="Highest avg return across all strategies" />
        <KPI label="Top Exchange" value="Binance" accent="navy" variant="navy" sub="41% of volume · +$34,200 P&L" />
      </div>

      {/* Heatmap */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">Hourly Return Heatmap</div>
          <div className="chart-meta">Average % return by hour (UTC) and day of week · All strategies combined</div>
        </div>
        <div className="chart-body" style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 640 }}>
            <div className="heatmap">
              <div />
              {hours.map(h => (
                <div key={h} style={{ fontFamily: "'Geist Mono'", fontSize: 8, color: P.ink3, textAlign: "center", paddingBottom: 2 }}>
                  {h.toString().padStart(2, "0")}
                </div>
              ))}
              {heatmapData.map((dayRow, di) => (
                <>
                  <div key={`lbl-${di}`} className="heat-label">{DAYS[di]}</div>
                  {dayRow.map((cell, hi) => {
                    const { bg, text } = heatColor(cell.val);
                    return (
                      <div key={`${di}-${hi}`} className="heat-cell" title={`${DAYS[di]} ${hi}:00 → ${cell.val}%`}
                        style={{ background: bg, color: text }}>
                        {Math.abs(cell.val) >= 2 ? cell.val.toFixed(1) : ""}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
            <div className="legend" style={{ marginTop: 12 }}>
              {[["≥ 3.5% (Strong+)", "#0B7B6B"], ["1.5–3.5%", "#2A9D8F"], ["0–1.5%", "#A8DFDA"], ["Flat", "#F0EEE9"], ["–0.5 to –1.5%", "#F4C5BE"], ["≤ –1.5% (Strong−)", "#C24B3A"]].map(([l, c]) => (
                <div className="legend-item" key={l}><div className="legend-dot" style={{ background: c, border: `1px solid ${P.border}` }} />{l}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Pair performance */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Pair Performance</div>
            <div className="chart-meta">P&L, win rate, and volume by trading pair</div>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Pair</th><th className="right">P&L</th><th className="right">Win Rate</th><th>Volume</th></tr>
            </thead>
            <tbody>
              {PAIRS.sort((a, b) => b.pnl - a.pnl).map((p, i) => (
                <tr key={p.pair}>
                  <td><span className={`rank ${i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : ""}`} style={{ fontSize: 14 }}>{i + 1}</span></td>
                  <td style={{ fontFamily: "'Geist Mono'", fontWeight: 600, fontSize: 12 }}>{p.pair}</td>
                  <td className="mono right" style={{ color: p.pnl >= 0 ? P.teal : P.coral }}>{p.pnl >= 0 ? "+" : ""}{fmtUSD(p.pnl)}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className="mono" style={{ color: p.winRate >= 60 ? P.teal : p.winRate >= 50 ? P.gold : P.coral }}>{p.winRate}%</span>
                    <MiniBar value={p.winRate} max={100} color={p.winRate >= 60 ? P.teal : p.winRate >= 50 ? P.gold : P.coral} />
                  </td>
                  <td className="mono" style={{ color: P.ink2 }}>{p.volume}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Day of week */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Day-of-Week Performance</div>
            <div className="chart-meta">Average return % across all bots</div>
          </div>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dayPerf} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="day" tick={{ fontFamily: "'Geist Mono'", fontSize: 10, fill: P.ink3 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontFamily: "'Geist Mono'", fontSize: 9, fill: P.ink3 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={35} />
                <Tooltip contentStyle={TT_STYLE} formatter={v => [`${v}%`, "Avg Return"]} />
                <ReferenceLine y={0} stroke={P.border} />
                <Bar dataKey="return" radius={[3, 3, 0, 0]}>
                  {dayPerf.map((d, i) => <Cell key={i} fill={d.return >= 0 ? P.teal : P.coral} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Exchange breakdown */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: "'Geist Mono'", fontSize: 9, color: P.ink3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>P&L by Exchange</div>
              {exchanges.map(e => (
                <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontFamily: "'Geist Mono'", fontSize: 11, fontWeight: 600, color: P.ink0, width: 56 }}>{e.name}</div>
                  <div style={{ flex: 1, height: 8, background: "#F0EEE9", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${e.pct}%`, background: e.color, borderRadius: 2 }} />
                  </div>
                  <div style={{ fontFamily: "'Geist Mono'", fontSize: 11, color: e.pnl.startsWith("+") ? P.teal : P.coral, width: 60, textAlign: "right" }}>{e.pnl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: "overview", label: "Platform Overview", color: P.teal },
  { key: "strategy", label: "Strategy Performance", color: P.navy },
  { key: "users", label: "User Analytics", color: P.gold },
  { key: "risk", label: "Risk Dashboard", color: P.coral },
  { key: "market", label: "Market Intelligence", color: P.ink2 },
];

export default function StellaAnalytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const [period, setPeriod] = useState("90D");

  return (
    <>
      <style>{STYLES}</style>
      <div className="analytics">
        {/* Header */}
        <div className="analytics-header">
          <div>
            <div className="analytics-wordmark">Stella Analytics</div>
            <div className="analytics-sub">Platform Intelligence · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
          </div>
          <div className="header-meta">
            <div className="header-date">Last updated: {new Date().toLocaleTimeString()}</div>
            <div className="header-period">
              {["7D", "30D", "90D", "1Y", "ALL"].map(p => (
                <button key={p} className={`period-btn ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>{p}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tab-bar">
          {TABS.map(t => (
            <button key={t.key} className={`tab-item ${activeTab === t.key ? "active" : ""}`} onClick={() => setActiveTab(t.key)}>
              <span className="tab-dot" style={{ background: activeTab === t.key ? t.color : "transparent", border: `1.5px solid ${t.color}` }} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="tab-content">
          {activeTab === "overview"  && <OverviewTab />}
          {activeTab === "strategy" && <StrategyTab />}
          {activeTab === "users"    && <UserTab />}
          {activeTab === "risk"     && <RiskTab />}
          {activeTab === "market"   && <MarketTab />}
        </div>
      </div>
    </>
  );
}
