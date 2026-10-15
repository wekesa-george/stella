import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

// ─── SVG ICON COMPONENTS ─────────────────────────────────────────────────────
const Icon = ({ d, size = 16, stroke = "currentColor", fill = "none", strokeWidth = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const IcoOverview  = ({ size }) => <Icon size={size} d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />;
const IcoTrading   = ({ size }) => <Icon size={size} d={["M3 18l4-8 4 4 4-6 4 4","M3 6h18"]} />;
const IcoHistory   = ({ size }) => <Icon size={size} d={["M12 2a10 10 0 1 0 10 10","M12 6v6l4 2","M22 2L12 12"]} />;
const IcoBack      = ({ size }) => <Icon size={size} d="M19 12H5M12 19l-7-7 7-7" />;
const IcoPlay      = ({ size }) => <Icon size={size} d="M5 3l14 9-14 9V3z" fill="currentColor" stroke="none" />;
const IcoPause     = ({ size }) => <Icon size={size} d={["M6 4h4v16H6z","M14 4h4v16h-4z"]} fill="currentColor" stroke="none" />;
const IcoStop      = ({ size }) => <Icon size={size} d="M4 4h16v16H4z" fill="currentColor" stroke="none" />;
const IcoTrash     = ({ size }) => <Icon size={size} d={["M3 6h18","M8 6V4h8v2","M19 6l-1 14H6L5 6"]} />;
const IcoClose     = ({ size }) => <Icon size={size} d="M18 6L6 18M6 6l12 12" />;
const IcoChevronD  = ({ size }) => <Icon size={size} d="M6 9l6 6 6-6" />;
const IcoAlert     = ({ size }) => <Icon size={size} d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />;
const IcoTerminal  = ({ size }) => <Icon size={size} d={["M4 17l6-6-6-6","M12 19h8"]} />;
const IcoFilter    = ({ size }) => <Icon size={size} d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />;
const IcoRefresh   = ({ size }) => <Icon size={size} d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />;

// ─── DATA GENERATORS ─────────────────────────────────────────────────────────
const rnd = (min, max) => Math.random() * (max - min) + min;
const rndInt = (min, max) => Math.floor(rnd(min, max));

function genCandles(n = 80, base = 67200, vol = 0.006) {
  const candles = [];
  let price = base;
  const now = Date.now();
  for (let i = n; i >= 0; i--) {
    const open = price;
    const change = open * rnd(-vol, vol);
    const close = open + change;
    const high = Math.max(open, close) + Math.abs(change) * rnd(0.1, 0.8);
    const low  = Math.min(open, close) - Math.abs(change) * rnd(0.1, 0.8);
    const volume = rnd(120, 900);
    candles.push({ open, high, low, close, volume, time: now - i * 5 * 60 * 1000 });
    price = close;
  }
  return candles;
}

function genEquityCurve(n = 60, start = 5000) {
  const pts = [];
  let equity = start;
  const now = Date.now();
  for (let i = n; i >= 0; i--) {
    equity += equity * rnd(-0.008, 0.012);
    pts.push({
      t: new Date(now - i * 4 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      equity: +equity.toFixed(2),
    });
  }
  return pts;
}

function genPositions() {
  const pairs   = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","ARB/USDT"];
  const entries = [67120, 3480, 148.2, 520.3, 1.82];
  const currents= [67580, 3521, 151.7, 528.1, 1.79];
  return Array.from({ length: rndInt(2, 5) }, (_, i) => {
    const idx   = i % pairs.length;
    const side  = i % 2 === 0 ? "LONG" : "SHORT";
    const entry = entries[idx] * rnd(0.99, 1.01);
    const curr  = currents[idx] * rnd(0.995, 1.005);
    const qty   = rnd(0.01, 0.3);
    const pnl   = side === "LONG" ? (curr - entry) * qty : (entry - curr) * qty;
    return {
      id: `POS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      side, pair: pairs[idx], entry: +entry.toFixed(2),
      current: +curr.toFixed(2), qty: +qty.toFixed(4),
      pnl: +pnl.toFixed(2), age: `${rndInt(2, 180)}m`,
    };
  });
}

function genClosedPositions(n = 12) {
  const pairs = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","ARB/USDT","MATIC/USDT"];
  return Array.from({ length: n }, (_, i) => {
    const pair   = pairs[i % pairs.length];
    const side   = i % 3 === 0 ? "SHORT" : "LONG";
    const entry  = rnd(60000, 70000);
    const exit   = entry * rnd(0.98, 1.025);
    const qty    = rnd(0.005, 0.2);
    const pnl    = (side === "LONG" ? exit - entry : entry - exit) * qty;
    const ts     = new Date(Date.now() - rnd(1, 48) * 3600000);
    return {
      id: `CP-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
      side, pair, entry: +entry.toFixed(2), exit: +exit.toFixed(2),
      qty: +qty.toFixed(4), pnl: +pnl.toFixed(2),
      closedAt: ts.toLocaleString(),
      reason: ["take_profit","stop_loss","signal","manual"][rndInt(0,4)],
    };
  }).sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
}

function genOrders(n = 20) {
  const pairs   = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT"];
  const types   = ["MARKET","LIMIT","STOP_LIMIT","LIMIT"];
  const statuses= ["FILLED","FILLED","FILLED","CANCELLED","FAILED","PENDING"];
  return Array.from({ length: n }, (_, i) => ({
    id: `ORD-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
    side: i % 2 === 0 ? "BUY" : "SELL",
    pair: pairs[i % pairs.length],
    type: types[i % types.length],
    price: +rnd(60000, 70000).toFixed(2),
    qty: +rnd(0.001, 0.15).toFixed(4),
    status: statuses[rndInt(0, statuses.length)],
    createdAt: new Date(Date.now() - rnd(0, 24) * 3600000).toLocaleString(),
  }));
}

const LOG_TEMPLATES = [
  { level: "INFO",    msg: "Signal generated: BUY BTC/USDT confidence=0.87 strategy=impulse_scalp" },
  { level: "INFO",    msg: "Order placed: ORD-A3F2B1 LIMIT BUY 0.0421 BTC @ 67,380.00" },
  { level: "INFO",    msg: "Order filled: ORD-A3F2B1 avg_fill=67,378.50 fees=0.84 USDT" },
  { level: "INFO",    msg: "Position opened: POS-8C2D1A LONG BTC/USDT entry=67,378.50" },
  { level: "WARNING", msg: "Drawdown approaching threshold: current=-2.1% limit=-3.0%" },
  { level: "INFO",    msg: "Heartbeat OK — latency=18ms positions=3 orders_open=1" },
  { level: "INFO",    msg: "Take-profit triggered: POS-8C2D1A exit=67,820.00 pnl=+18.63 USDT" },
  { level: "ERROR",   msg: "Order rejected by exchange: insufficient_balance — skipping signal" },
  { level: "INFO",    msg: "Equity snapshot: total=5,234.12 USDT drawdown=-0.4% hwm=5,256.88" },
  { level: "WARNING", msg: "Rate limit approaching: 48/60 req/min — throttling order submission" },
  { level: "INFO",    msg: "Market data reconnected after 2s gap — catching up 4 candles" },
  { level: "INFO",    msg: "Signal filtered: SELL ETH/USDT confidence=0.61 below threshold 0.75" },
];

function genInitialLogs(n = 18) {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    level: LOG_TEMPLATES[i % LOG_TEMPLATES.length].level,
    msg:   LOG_TEMPLATES[i % LOG_TEMPLATES.length].msg,
    ts:    new Date(Date.now() - (n - i) * 12000).toLocaleTimeString(),
  }));
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BOT = {
  id: "BOT-7F3A2C",
  name: "Impulse Scalper α",
  status: "running",
  strategy: "Impulse Scalping v2.1",
  exchange: "Binance",
  pair: "BTC/USDT",
  user: "george.wekesa@stella.io",
  credential: "cred_8f2a1b9c4d3e5f6a",
  capital: 5000,
  startTime: "2026-02-28 06:14:22 UTC",
  created: "2026-02-20",
  totalTrades: 147,
  winRate: 68.7,
  sessionPnl: +234.18,
  openPositions: 3,
  uptime: "13h 42m",
};

const STATUS_CFG = {
  running:      { color: "var(--green)",  bg: "var(--green-dim)",  border: "rgba(0,229,160,.3)",  label: "Running"      },
  paused:       { color: "var(--amber)",  bg: "var(--amber-dim)",  border: "rgba(245,166,35,.3)", label: "Paused"       },
  initializing: { color: "var(--blue)",   bg: "var(--blue-dim)",   border: "rgba(61,157,243,.3)", label: "Initializing" },
  error:        { color: "var(--red)",    bg: "var(--red-dim)",    border: "rgba(255,71,87,.3)",  label: "Error"        },
  stopped:      { color: "var(--text2)",  bg: "var(--bg3)",        border: "var(--border2)",      label: "Stopped"      },
};

const TIMEFRAMES = ["1m","5m","15m","1h","4h","1D"];

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=DM+Sans:wght@300;400;500;600;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg0:#080c10; --bg1:#0d1117; --bg2:#131920; --bg3:#1a2230; --bg4:#1e2d40;
  --border:#1e2d40; --border2:#253550;
  --text0:#e8edf3; --text1:#8fa3b8; --text2:#5a7090; --text3:#3a5068;
  --green:#00e5a0; --green-dim:rgba(0,229,160,0.10); --green-mid:rgba(0,229,160,0.20);
  --amber:#f5a623; --amber-dim:rgba(245,166,35,0.10);
  --red:#ff4757;   --red-dim:rgba(255,71,87,0.10);
  --blue:#3d9df3;  --blue-dim:rgba(61,157,243,0.10);
  --mono:'IBM Plex Mono',monospace; --sans:'DM Sans',sans-serif;
  --nav-w:144px; --nav-w-sm:48px; --hdr-h:56px;
}
html,body,#root { height:100%; background:var(--bg0); }
body { font-family:var(--sans); color:var(--text0); overflow:hidden; }
::-webkit-scrollbar { width:4px; height:4px; }
::-webkit-scrollbar-track { background:var(--bg1); }
::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }

/* ── LAYOUT ── */
.page { display:flex; flex-direction:column; height:100vh; overflow:hidden; }

/* ── HEADER ── */
.hdr {
  height:var(--hdr-h); min-height:var(--hdr-h);
  background:var(--bg1); border-bottom:1px solid var(--border);
  display:flex; align-items:center; gap:0; padding:0 18px;
  z-index:50; flex-shrink:0;
}
.hdr-left { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
.breadcrumb { display:flex; align-items:center; gap:5px; font-family:var(--mono); font-size:9px; color:var(--text2); }
.breadcrumb-sep { color:var(--text3); }
.breadcrumb-link { color:var(--text2); cursor:pointer; transition:color .1s; }
.breadcrumb-link:hover { color:var(--text1); }
.breadcrumb-cur { color:var(--text1); }
.hdr-title { display:flex; align-items:center; gap:10px; min-width:0; }
.bot-id { font-family:var(--mono); font-size:14px; font-weight:600; color:var(--text0); letter-spacing:.04em; white-space:nowrap; }
.status-badge { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:2px; font-family:var(--mono); font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; border:1px solid; flex-shrink:0; }
.status-dot { width:5px; height:5px; border-radius:50%; }
.running .status-dot { animation:blink 2s infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }
.hdr-meta { font-family:var(--mono); font-size:9px; color:var(--text2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hdr-meta span { color:var(--text1); }
.hdr-actions { display:flex; gap:7px; align-items:center; flex-shrink:0; margin-left:16px; }
.back-btn { display:flex; align-items:center; gap:5px; padding:0 10px 0 0; color:var(--text2); cursor:pointer; border-right:1px solid var(--border); margin-right:12px; height:28px; transition:color .12s; flex-shrink:0; }
.back-btn:hover { color:var(--text0); }

/* ── BODY ── */
.body { display:flex; flex:1; overflow:hidden; }

/* ── SIDE NAV ── */
.sidenav {
  width:var(--nav-w); flex-shrink:0;
  background:var(--bg1); border-right:1px solid var(--border);
  display:flex; flex-direction:column; padding:10px 0;
  overflow:hidden; transition:width .2s;
}
.nav-item {
  display:flex; align-items:center; gap:10px;
  padding:11px 14px; cursor:pointer;
  border-left:2px solid transparent;
  transition:all .12s; position:relative; flex-shrink:0;
  text-decoration:none;
}
.nav-item:hover { background:var(--bg2); }
.nav-item:hover .nav-lbl { color:var(--text1); }
.nav-item.active { background:var(--green-dim); border-left-color:var(--green); }
.nav-item.active .nav-lbl { color:var(--green); }
.nav-item.active .nav-icon { color:var(--green); }
.nav-icon { color:var(--text2); flex-shrink:0; display:flex; align-items:center; }
.nav-item:hover .nav-icon { color:var(--text1); }
.nav-lbl { font-family:var(--mono); font-size:10px; font-weight:500; color:var(--text2); white-space:nowrap; letter-spacing:.04em; }
.nav-divider { height:1px; background:var(--border); margin:8px 0; }
.nav-status-pip { width:6px; height:6px; border-radius:50%; margin-left:auto; flex-shrink:0; }

/* ── CONTENT ── */
.content { flex:1; overflow-y:auto; background:var(--bg0); }
.tab-body { padding:20px; display:flex; flex-direction:column; gap:18px; }

/* ── CARDS / SECTIONS ── */
.card { background:var(--bg1); border:1px solid var(--border); border-radius:4px; overflow:hidden; }
.card-hdr { padding:10px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:10px; }
.card-title { font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:var(--text1); }
.card-body { padding:16px; }
.card-body.np { padding:0; }

/* ── METRIC CARDS ── */
.metrics-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
.metric { background:var(--bg1); border:1px solid var(--border); border-radius:4px; padding:14px 16px; position:relative; overflow:hidden; }
.metric-lbl { font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.12em; color:var(--text2); margin-bottom:6px; }
.metric-val { font-family:var(--mono); font-size:22px; font-weight:600; line-height:1; }
.metric-sub { font-family:var(--mono); font-size:8px; color:var(--text2); margin-top:5px; }
.metric-accent { position:absolute; bottom:0; left:0; right:0; height:2px; }

/* ── EQUITY CHART ── */
.equity-chart { height:180px; }
.recharts-tooltip-wrapper { z-index:10 !important; }

/* ── TABLE ── */
.tbl-wrap { overflow-x:auto; }
.tbl { width:100%; border-collapse:collapse; min-width:560px; }
.tbl th { font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.1em; color:var(--text2); padding:8px 14px; text-align:left; border-bottom:1px solid var(--border); background:var(--bg2); white-space:nowrap; font-weight:500; }
.tbl th.r { text-align:right; }
.tbl td { padding:9px 14px; border-bottom:1px solid var(--border); font-size:12px; vertical-align:middle; }
.tbl tr:last-child td { border-bottom:none; }
.tbl tr:hover td { background:rgba(255,255,255,.015); }
.tbl td.mono { font-family:var(--mono); font-size:10px; }
.tbl td.r { text-align:right; }
.cell-pair { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--text0); }
.cell-id { font-family:var(--mono); font-size:9px; color:var(--text2); }

/* ── TAGS ── */
.tag { display:inline-flex; align-items:center; padding:2px 7px; border-radius:2px; font-family:var(--mono); font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; white-space:nowrap; }
.tag-green  { background:var(--green-dim); color:var(--green); }
.tag-amber  { background:var(--amber-dim); color:var(--amber); }
.tag-red    { background:var(--red-dim);   color:var(--red);   }
.tag-blue   { background:var(--blue-dim);  color:var(--blue);  }
.tag-ghost  { background:var(--bg3); color:var(--text1); border:1px solid var(--border2); }
.tag-long   { background:rgba(0,229,160,.12); color:var(--green); border:1px solid rgba(0,229,160,.2); }
.tag-short  { background:rgba(255,71,87,.12);  color:var(--red);   border:1px solid rgba(255,71,87,.2); }

/* ── BUTTONS ── */
.btn { padding:6px 12px; border-radius:3px; font-family:var(--mono); font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; cursor:pointer; border:1px solid; transition:all .12s; display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
.btn-ghost  { background:transparent; color:var(--text1); border-color:var(--border); }
.btn-ghost:hover { background:var(--bg3); color:var(--text0); border-color:var(--border2); }
.btn-green  { background:var(--green-dim); color:var(--green); border-color:rgba(0,229,160,.3); }
.btn-green:hover { background:var(--green); color:#000; }
.btn-amber  { background:var(--amber-dim); color:var(--amber); border-color:rgba(245,166,35,.3); }
.btn-amber:hover { background:var(--amber); color:#000; }
.btn-red    { background:var(--red-dim);   color:var(--red);   border-color:rgba(255,71,87,.3); }
.btn-red:hover { background:var(--red); color:#fff; }
.btn-blue   { background:var(--blue-dim);  color:var(--blue);  border-color:rgba(61,157,243,.3); }
.btn-blue:hover { background:var(--blue); color:#fff; }
.btn:disabled { opacity:.35; cursor:not-allowed; pointer-events:none; }
.btn-sm { padding:3px 8px; font-size:8px; }

/* ── CANDLESTICK CHART ── */
.chart-wrap { position:relative; height:480px; background:var(--bg2); overflow:hidden; border-radius:0 0 0 0; }
.chart-svg { position:absolute; inset:0; }
.tf-bar { display:flex; gap:3px; align-items:center; }
.tf-btn { padding:3px 9px; font-family:var(--mono); font-size:9px; border-radius:2px; cursor:pointer; border:1px solid var(--border); background:transparent; color:var(--text2); transition:all .1s; }
.tf-btn:hover { color:var(--text1); border-color:var(--border2); }
.tf-btn.on { background:var(--green-dim); color:var(--green); border-color:rgba(0,229,160,.3); }
.crosshair-tooltip { position:absolute; pointer-events:none; background:var(--bg1); border:1px solid var(--border2); border-radius:3px; padding:6px 10px; font-family:var(--mono); font-size:9px; z-index:20; }

/* ── LOG PANEL ── */
.log-panel { background:var(--bg0); border:1px solid var(--border); border-radius:4px; overflow:hidden; }
.log-hdr { padding:8px 14px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; background:var(--bg2); }
.log-title { font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--text1); flex:1; display:flex; align-items:center; gap:7px; }
.log-live { display:inline-flex; align-items:center; gap:4px; font-size:8px; color:var(--green); }
.log-live-dot { width:5px; height:5px; border-radius:50%; background:var(--green); animation:blink 1.5s infinite; }
.log-filters { display:flex; gap:3px; }
.log-filter { padding:2px 7px; font-family:var(--mono); font-size:8px; cursor:pointer; border-radius:2px; border:1px solid transparent; transition:all .1s; }
.log-filter.all   { color:var(--text1); } .log-filter.all.on   { background:var(--bg3); border-color:var(--border2); color:var(--text0); }
.log-filter.info  { color:var(--blue); }  .log-filter.info.on  { background:var(--blue-dim); border-color:rgba(61,157,243,.3); }
.log-filter.warn  { color:var(--amber); } .log-filter.warn.on  { background:var(--amber-dim); border-color:rgba(245,166,35,.3); }
.log-filter.error { color:var(--red); }   .log-filter.error.on { background:var(--red-dim); border-color:rgba(255,71,87,.3); }
.log-body { height:200px; overflow-y:auto; padding:6px 0; }
.log-row { display:flex; align-items:flex-start; gap:10px; padding:2px 14px; font-family:var(--mono); font-size:9px; line-height:1.7; }
.log-row:hover { background:var(--bg2); }
.log-ts { color:var(--text3); flex-shrink:0; min-width:60px; }
.log-level { flex-shrink:0; min-width:50px; font-weight:600; }
.level-INFO    { color:var(--blue); }
.level-WARNING { color:var(--amber); }
.level-ERROR   { color:var(--red); }
.log-msg { color:var(--text1); word-break:break-all; }

/* ── MANUAL ORDER ── */
.order-panel { background:var(--bg2); border:1px solid var(--border); border-radius:4px; padding:14px 16px; display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap; }
.order-field { display:flex; flex-direction:column; gap:5px; }
.order-lbl { font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.1em; color:var(--text2); }
.order-inp { background:var(--bg1); border:1px solid var(--border); color:var(--text0); font-family:var(--mono); font-size:11px; padding:6px 10px; border-radius:3px; outline:none; width:140px; }
.order-inp:focus { border-color:var(--border2); }
.side-toggle { display:flex; border:1px solid var(--border); border-radius:3px; overflow:hidden; }
.side-opt { padding:6px 14px; font-family:var(--mono); font-size:9px; font-weight:600; text-transform:uppercase; cursor:pointer; transition:all .1s; }
.side-opt.long.on  { background:var(--green-dim); color:var(--green); }
.side-opt.short.on { background:var(--red-dim);   color:var(--red);   }
.side-opt:not(.on) { color:var(--text2); }
.pair-locked { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--text0); background:var(--bg3); border:1px solid var(--border); padding:6px 10px; border-radius:3px; display:flex; align-items:center; gap:6px; }
.pair-locked-ico { font-size:9px; color:var(--text3); }

/* ── CONFIG GRID ── */
.cfg-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; }
.cfg-row { display:flex; justify-content:space-between; padding:9px 16px; border-bottom:1px solid var(--border); gap:10px; }
.cfg-row:last-child { border-bottom:none; }
.cfg-key { font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:var(--text2); }
.cfg-val { font-family:var(--mono); font-size:10px; color:var(--text0); font-weight:500; text-align:right; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ── MODAL ── */
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.75); backdrop-filter:blur(4px); z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; }
.modal { background:var(--bg1); border:1px solid var(--border2); border-radius:5px; width:100%; max-width:460px; overflow:hidden; }
.modal-hdr { padding:14px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
.modal-title { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--text0); letter-spacing:.04em; }
.modal-body { padding:18px; }
.modal-footer { padding:12px 18px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; }
.modal-detail-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border); }
.modal-detail-row:last-child { border-bottom:none; }
.modal-detail-key { font-family:var(--mono); font-size:9px; color:var(--text2); text-transform:uppercase; }
.modal-detail-val { font-family:var(--mono); font-size:10px; color:var(--text0); }
.modal-warn { display:flex; gap:8px; padding:10px 12px; background:var(--red-dim); border:1px solid rgba(255,71,87,.2); border-radius:3px; font-family:var(--mono); font-size:9px; color:var(--red); line-height:1.6; margin-bottom:14px; }

/* ── EMPTY STATE ── */
.empty { padding:32px; text-align:center; }
.empty-ico { color:var(--text3); margin:0 auto 10px; display:flex; justify-content:center; }
.empty-lbl { font-family:var(--mono); font-size:10px; color:var(--text2); }

/* ── RESPONSIVE ── */
@media (max-width:860px) {
  .sidenav { width:var(--nav-w-sm) !important; }
  .nav-lbl { display:none !important; }
  .nav-status-pip { display:none !important; }
  .metrics-grid { grid-template-columns:repeat(3,1fr) !important; }
  .cfg-grid { grid-template-columns:1fr !important; }
  .hdr-meta { display:none; }
  .order-inp { width:110px; }
}
@media (max-width:560px) {
  .metrics-grid { grid-template-columns:1fr 1fr !important; }
  .hdr-actions { gap:4px; }
  .btn { padding:5px 8px; font-size:8px; }
}
`;

// ─── CANDLESTICK CHART ────────────────────────────────────────────────────────
function CandlestickChart({ candles, positions }) {
  const svgRef  = useRef(null);
  const wrapRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 480 });
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) =>
      setDims({ w: e.contentRect.width, h: e.contentRect.height }));
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  const PAD = { t: 16, r: 68, b: 60, l: 10 };
  const VPAD = 50;
  const chartH = dims.h - PAD.t - PAD.b - VPAD;
  const chartW = dims.w - PAD.l - PAD.r;

  const prices = candles.flatMap(c => [c.high, c.low]);
  const vols   = candles.map(c => c.volume);
  const pMin   = Math.min(...prices);
  const pMax   = Math.max(...prices);
  const vMax   = Math.max(...vols);
  const pRange = pMax - pMin || 1;

  const toX  = i  => PAD.l + (i / (candles.length - 1)) * chartW;
  const toY  = p  => PAD.t + (1 - (p - pMin) / pRange) * chartH;
  const toYV = v  => dims.h - PAD.b - (v / vMax) * (VPAD - 8);
  const candleW = Math.max(2, (chartW / candles.length) * 0.65);

  const currentPrice = candles[candles.length - 1]?.close;
  const priceY       = toY(currentPrice);

  const priceTicks = useMemo(() => {
    const ticks = [];
    const step = (pMax - pMin) / 5;
    for (let i = 0; i <= 5; i++) ticks.push(pMin + step * i);
    return ticks;
  }, [pMin, pMax]);

  function onMouseMove(e) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - PAD.l;
    const idx = Math.round((x / chartW) * (candles.length - 1));
    if (idx >= 0 && idx < candles.length) setHover({ idx, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const hc = hover ? candles[hover.idx] : null;

  return (
    <div ref={wrapRef} className="chart-wrap" onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
      <svg ref={svgRef} className="chart-svg" width={dims.w} height={dims.h}>
        <defs>
          <line id="grid" />
        </defs>

        {/* Grid lines */}
        {priceTicks.map((p, i) => {
          const y = toY(p);
          return (
            <g key={i}>
              <line x1={PAD.l} y1={y} x2={dims.w - PAD.r} y2={y} stroke="#1e2d40" strokeWidth="1" strokeDasharray="3 4" />
              <text x={dims.w - PAD.r + 6} y={y + 4} fill="#5a7090" fontSize="9" fontFamily="IBM Plex Mono">{p.toFixed(0)}</text>
            </g>
          );
        })}

        {/* Volume bars */}
        {candles.map((c, i) => {
          const x = toX(i);
          const yTop = toYV(c.volume);
          const barH = dims.h - PAD.b - yTop;
          const bull = c.close >= c.open;
          return (
            <rect key={`v${i}`} x={x - candleW / 2} y={yTop} width={candleW} height={barH}
              fill={bull ? "rgba(0,229,160,0.18)" : "rgba(255,71,87,0.18)"} />
          );
        })}

        {/* Volume divider */}
        <line x1={PAD.l} y1={dims.h - PAD.b - VPAD + 4} x2={dims.w - PAD.r} y2={dims.h - PAD.b - VPAD + 4} stroke="#1e2d40" strokeWidth="1" />

        {/* Candles */}
        {candles.map((c, i) => {
          const x    = toX(i);
          const bull = c.close >= c.open;
          const col  = bull ? "#00e5a0" : "#ff4757";
          const bodyY = toY(Math.max(c.open, c.close));
          const bodyH = Math.max(1, Math.abs(toY(c.open) - toY(c.close)));
          return (
            <g key={`c${i}`}>
              <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={col} strokeWidth="1" opacity=".8" />
              <rect x={x - candleW / 2} y={bodyY} width={candleW} height={bodyH}
                fill={bull ? "rgba(0,229,160,0.15)" : "rgba(255,71,87,0.15)"}
                stroke={col} strokeWidth="1" />
            </g>
          );
        })}

        {/* Entry markers from positions */}
        {positions.map((pos, i) => {
          const y = toY(pos.entry);
          if (y < PAD.t || y > PAD.t + chartH) return null;
          const col = pos.side === "LONG" ? "#00e5a0" : "#ff4757";
          return (
            <g key={`pos${i}`}>
              <line x1={PAD.l} y1={y} x2={dims.w - PAD.r} y2={y} stroke={col} strokeWidth="1" strokeDasharray="5 4" opacity=".5" />
              <rect x={PAD.l + 4} y={y - 9} width={pos.side === "LONG" ? 34 : 38} height={16} rx="2"
                fill={col + "22"} stroke={col} strokeWidth="1" opacity=".8" />
              <text x={PAD.l + 8} y={y + 2} fill={col} fontSize="7" fontFamily="IBM Plex Mono" fontWeight="600">{pos.side[0]} {pos.entry.toFixed(0)}</text>
            </g>
          );
        })}

        {/* Current price line */}
        {currentPrice && (
          <>
            <line x1={PAD.l} y1={priceY} x2={dims.w - PAD.r} y2={priceY} stroke="#00e5a0" strokeWidth="1" strokeDasharray="4 3" opacity=".7" />
            <rect x={dims.w - PAD.r + 1} y={priceY - 9} width={62} height={17} rx="2" fill="#00e5a0" />
            <text x={dims.w - PAD.r + 4} y={priceY + 3} fill="#000" fontSize="9" fontFamily="IBM Plex Mono" fontWeight="700">{currentPrice.toFixed(1)}</text>
          </>
        )}

        {/* Crosshair */}
        {hover && (
          <>
            <line x1={hover.x} y1={PAD.t} x2={hover.x} y2={dims.h - PAD.b} stroke="#253550" strokeWidth="1" />
            <line x1={PAD.l} y1={hover.y} x2={dims.w - PAD.r} y2={hover.y} stroke="#253550" strokeWidth="1" />
          </>
        )}
      </svg>

      {/* Crosshair tooltip */}
      {hover && hc && (
        <div className="crosshair-tooltip" style={{
          left: hover.x + 12, top: PAD.t + 8,
          ...(hover.x > dims.w * 0.65 ? { left: "auto", right: 80 } : {}),
        }}>
          <div style={{ color: "var(--text2)", marginBottom: 4, fontSize: 8 }}>
            {new Date(hc.time).toLocaleTimeString()}
          </div>
          {[["O", hc.open],["H", hc.high],["L", hc.low],["C", hc.close]].map(([k, v]) => (
            <div key={k} style={{ display:"flex", gap:14, justifyContent:"space-between" }}>
              <span style={{ color:"var(--text2)" }}>{k}</span>
              <span style={{ color: hc.close >= hc.open ? "var(--green)" : "var(--red)" }}>{v.toFixed(2)}</span>
            </div>
          ))}
          <div style={{ marginTop:3, paddingTop:3, borderTop:"1px solid var(--border)", color:"var(--text2)" }}>
            Vol <span style={{ color:"var(--text1)", marginLeft:8 }}>{hc.volume.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EQUITY TOOLTIP ───────────────────────────────────────────────────────────
function EquityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const diff = val - 5000;
  return (
    <div style={{ background:"var(--bg1)", border:"1px solid var(--border2)", borderRadius:3, padding:"6px 10px", fontFamily:"var(--mono)", fontSize:9 }}>
      <div style={{ color:"var(--text2)", marginBottom:2 }}>{payload[0]?.payload?.t}</div>
      <div style={{ color: diff >= 0 ? "var(--green)" : "var(--red)", fontWeight:600 }}>${val.toFixed(2)}</div>
      <div style={{ color: diff >= 0 ? "var(--green)" : "var(--red)", fontSize:8, opacity:.8 }}>
        {diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({((diff / 5000) * 100).toFixed(2)}%)
      </div>
    </div>
  );
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function ClosePositionModal({ position, onClose, onConfirm }) {
  if (!position) return null;
  const pnlPos = position.pnl >= 0;
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hdr">
          <span className="modal-title">Close Position at Market</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text2)", cursor:"pointer" }}>
            <IcoClose size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-warn">
            <span style={{ flexShrink:0 }}><IcoAlert size={14} /></span>
            This will submit a market order to close the position immediately.
            Market orders execute at the current best bid/ask — you may receive
            a slightly different price than shown.
          </div>
          {[
            ["Position ID",    position.id],
            ["Pair",           position.pair],
            ["Side",           position.side],
            ["Entry Price",    `$${position.entry.toLocaleString()}`],
            ["Current Price",  `$${position.current.toLocaleString()}`],
            ["Size",           position.qty],
            ["Unrealised P&L", `${pnlPos ? "+" : ""}$${position.pnl.toFixed(2)}`],
          ].map(([k, v]) => (
            <div className="modal-detail-row" key={k}>
              <span className="modal-detail-key">{k}</span>
              <span className="modal-detail-val"
                style={{ color: k.includes("P&L") ? (pnlPos ? "var(--green)" : "var(--red)") : "var(--text0)" }}>
                {v}
              </span>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-red" onClick={() => { onConfirm(position.id); onClose(); }}>
            <IcoStop size={12} /> Close at Market
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteBotModal({ bot, onClose }) {
  const [typed, setTyped] = useState("");
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hdr">
          <span className="modal-title" style={{ color:"var(--red)" }}>Delete Bot</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text2)", cursor:"pointer" }}>
            <IcoClose size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-warn">
            <span style={{ flexShrink:0 }}><IcoAlert size={14} /></span>
            <div>
              This permanently deletes <strong>{bot.id}</strong> and all associated
              trade history, configuration, and logs. This action cannot be undone.
              The bot must be stopped before deletion.
            </div>
          </div>
          <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--text1)", marginBottom:8 }}>
            Type <strong style={{ color:"var(--text0)" }}>{bot.id}</strong> to confirm:
          </div>
          <input
            style={{ width:"100%", background:"var(--bg2)", border:"1px solid var(--border)", color:"var(--text0)", fontFamily:"var(--mono)", fontSize:11, padding:"7px 10px", borderRadius:3, outline:"none" }}
            placeholder={bot.id}
            value={typed}
            onChange={e => setTyped(e.target.value)}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-red" disabled={typed !== bot.id} onClick={onClose}>
            <IcoTrash size={12} /> Delete Bot
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── POSITIONS TABLE ──────────────────────────────────────────────────────────
function PositionsTable({ positions, onClose, compact }) {
  if (positions.length === 0)
    return (
      <div className="empty">
        <div className="empty-ico"><IcoOverview size={28} /></div>
        <div className="empty-lbl">No open positions</div>
      </div>
    );

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Side</th>
            <th>Pair</th>
            <th className="r">Entry</th>
            <th className="r">Current</th>
            <th className="r">Size</th>
            <th className="r">P&amp;L</th>
            {!compact && <th>Age</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.id}>
              <td><span className={`tag ${p.side === "LONG" ? "tag-long" : "tag-short"}`}>{p.side}</span></td>
              <td><div className="cell-pair">{p.pair}</div>{!compact && <div className="cell-id">{p.id}</div>}</td>
              <td className="mono r">{p.entry.toLocaleString()}</td>
              <td className="mono r">{p.current.toLocaleString()}</td>
              <td className="mono r">{p.qty}</td>
              <td className="r">
                <span style={{ fontFamily:"var(--mono)", fontSize:10, fontWeight:600, color: p.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                  {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                </span>
              </td>
              {!compact && <td className="mono" style={{ color:"var(--text2)", fontSize:10 }}>{p.age}</td>}
              <td>
                <button className="btn btn-red btn-sm" onClick={() => onClose(p)}>Close</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── TAB 1: OVERVIEW ─────────────────────────────────────────────────────────
function TabOverview({ bot, equity, positions, onClosePosition }) {
  const lastEquity  = equity[equity.length - 1]?.equity || 5000;
  const firstEquity = equity[0]?.equity || 5000;
  const profitable  = lastEquity >= firstEquity;
  const pnlPos      = bot.sessionPnl >= 0;

  const gradId = "equityGrad";

  const metrics = [
    { label:"Session P&L", value:`${pnlPos ? "+" : ""}$${Math.abs(bot.sessionPnl).toFixed(2)}`,
      color: pnlPos ? "var(--green)" : "var(--red)", accent: pnlPos ? "var(--green)" : "var(--red)",
      sub: `${pnlPos ? "+" : ""}${((bot.sessionPnl / bot.capital) * 100).toFixed(2)}% on capital` },
    { label:"Win Rate", value:`${bot.winRate}%`, color:"var(--blue)", accent:"var(--blue)", sub:"Last 147 trades" },
    { label:"Total Trades", value:bot.totalTrades, color:"var(--text0)", accent:"var(--text2)", sub:"Session only" },
    { label:"Open Positions", value:positions.length, color:"var(--amber)", accent:"var(--amber)", sub:`of 20 max` },
    { label:"Uptime", value:bot.uptime, color:"var(--text0)", accent:"var(--green)", sub:"Since last start" },
  ];

  return (
    <div className="tab-body">
      {/* Metrics */}
      <div className="metrics-grid">
        {metrics.map(m => (
          <div className="metric" key={m.label}>
            <div className="metric-lbl">{m.label}</div>
            <div className="metric-val" style={{ color: m.color }}>{m.value}</div>
            <div className="metric-sub">{m.sub}</div>
            <div className="metric-accent" style={{ background: m.accent }} />
          </div>
        ))}
      </div>

      {/* Equity Curve */}
      <div className="card">
        <div className="card-hdr">
          <span className="card-title">Session Equity Curve</span>
          <span style={{ fontFamily:"var(--mono)", fontSize:9, color: profitable ? "var(--green)" : "var(--red)" }}>
            {profitable ? "▲" : "▼"} {profitable ? "+" : ""}${(lastEquity - firstEquity).toFixed(2)}
          </span>
        </div>
        <div className="card-body" style={{ padding:"16px 16px 8px" }}>
          <div className="equity-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equity} margin={{ top: 4, right: 10, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={profitable ? "#00e5a0" : "#ff4757"} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={profitable ? "#00e5a0" : "#ff4757"} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="#1e2d40" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize:8, fontFamily:"IBM Plex Mono", fill:"#5a7090" }} tickLine={false} axisLine={false} interval={9} />
                <YAxis tick={{ fontSize:8, fontFamily:"IBM Plex Mono", fill:"#5a7090" }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(1)}k`} />
                <ReferenceLine y={5000} stroke="#253550" strokeDasharray="4 3" />
                <Tooltip content={<EquityTooltip />} />
                <Area type="monotone" dataKey="equity" stroke={profitable ? "#00e5a0" : "#ff4757"} strokeWidth={1.5}
                  fill={`url(#${gradId})`} dot={false} activeDot={{ r:3, fill: profitable ? "#00e5a0" : "#ff4757" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="card">
        <div className="card-hdr">
          <span className="card-title">Open Positions <span style={{ color:"var(--text2)", fontWeight:400 }}>({positions.length})</span></span>
        </div>
        <div className="card-body np">
          <PositionsTable positions={positions} onClose={onClosePosition} compact />
        </div>
      </div>

      {/* Config */}
      <div className="card">
        <div className="card-hdr">
          <span className="card-title">Bot Configuration</span>
          <button className="btn btn-ghost btn-sm">Edit</button>
        </div>
        <div className="card-body np">
          <div className="cfg-grid">
            {[
              ["Strategy",        bot.strategy],
              ["Trading Pair",    bot.pair],
              ["Exchange",        bot.exchange],
              ["User",            bot.user],
              ["Credential",      `…${bot.credential.slice(-8)}`],
              ["Allocated Capital", `$${bot.capital.toLocaleString()}`],
              ["Created",         bot.created],
              ["Start Time",      bot.startTime],
            ].map(([k, v]) => (
              <div className="cfg-row" key={k}>
                <span className="cfg-key">{k}</span>
                <span className="cfg-val">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LOG STREAM ───────────────────────────────────────────────────────────────
function LogStream() {
  const [logs, setLogs] = useState(genInitialLogs);
  const [filter, setFilter] = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef(null);
  const idRef   = useRef(logs.length);

  useEffect(() => {
    const tid = setInterval(() => {
      const tmpl = LOG_TEMPLATES[rndInt(0, LOG_TEMPLATES.length)];
      setLogs(prev => {
        const next = [...prev, { id: idRef.current++, level: tmpl.level, msg: tmpl.msg, ts: new Date().toLocaleTimeString() }];
        return next.slice(-150);
      });
    }, 2200);
    return () => clearInterval(tid);
  }, []);

  useEffect(() => {
    if (autoScroll && bodyRef.current)
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logs, autoScroll]);

  const visible = filter === "ALL" ? logs : logs.filter(l =>
    filter === "WARN" ? l.level === "WARNING" : l.level === filter
  );

  const counts = { INFO:0, WARN:0, ERROR:0 };
  logs.forEach(l => {
    if (l.level === "INFO") counts.INFO++;
    if (l.level === "WARNING") counts.WARN++;
    if (l.level === "ERROR") counts.ERROR++;
  });

  return (
    <div className="log-panel">
      <div className="log-hdr">
        <div className="log-title">
          <IcoTerminal size={13} />
          Bot Log
          <span className="log-live"><span className="log-live-dot" />Live</span>
        </div>
        <div className="log-filters">
          {[["ALL","all",null],["INFO","info",counts.INFO],["WARN","warn",counts.WARN],["ERROR","error",counts.ERROR]].map(([key,cls,count]) => (
            <span key={key} className={`log-filter ${cls} ${filter === key ? "on" : ""}`}
              onClick={() => setFilter(key)}>
              {key}{count !== null ? ` (${count})` : ""}
            </span>
          ))}
        </div>
        <label style={{ display:"flex", alignItems:"center", gap:5, fontFamily:"var(--mono)", fontSize:8, color:"var(--text2)", cursor:"pointer", marginLeft:8 }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} style={{ accentColor:"var(--green)" }} />
          Auto-scroll
        </label>
      </div>
      <div className="log-body" ref={bodyRef}>
        {visible.length === 0
          ? <div style={{ padding:"20px", textAlign:"center", fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>No {filter} logs</div>
          : visible.map(l => (
          <div className="log-row" key={l.id}>
            <span className="log-ts">{l.ts}</span>
            <span className={`log-level level-${l.level}`}>{l.level === "WARNING" ? "WARN" : l.level}</span>
            <span className="log-msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TAB 2: TRADING ───────────────────────────────────────────────────────────
function TabTrading({ bot, positions, onClosePosition }) {
  const [tf, setTf] = useState("5m");
  const [side, setSide] = useState("LONG");
  const [size, setSize] = useState("");
  const [candles, setCandles] = useState(() => genCandles(80, 67200, 0.006));
  const running = bot.status === "running";

  useEffect(() => {
    const vols = { "1m":0.002, "5m":0.006, "15m":0.009, "1h":0.015, "4h":0.022, "1D":0.04 };
    setCandles(genCandles(80, 67200, vols[tf] || 0.006));
  }, [tf]);

  return (
    <div className="tab-body">
      {/* Chart */}
      <div className="card">
        <div className="card-hdr">
          <span className="card-title">{bot.pair} · {bot.exchange}</span>
          <div className="tf-bar">
            {TIMEFRAMES.map(t => (
              <button key={t} className={`tf-btn ${tf === t ? "on" : ""}`} onClick={() => setTf(t)}>{t}</button>
            ))}
          </div>
        </div>
        <CandlestickChart candles={candles} positions={positions} />
      </div>

      {/* Open positions */}
      <div className="card">
        <div className="card-hdr">
          <span className="card-title">Open Positions ({positions.length})</span>
        </div>
        <div className="card-body np">
          <PositionsTable positions={positions} onClose={onClosePosition} compact={false} />
        </div>
      </div>

      {/* Manual order */}
      <div className="card">
        <div className="card-hdr">
          <span className="card-title">Manual Order</span>
          {!running && <span className="tag tag-amber">Bot must be running to submit</span>}
        </div>
        <div className="card-body" style={{ padding:14 }}>
          <div className="order-panel" style={{ background:"transparent", border:"none", padding:0 }}>
            <div className="order-field">
              <div className="order-lbl">Pair</div>
              <div className="pair-locked">
                <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                  <rect x="1" y="5" width="8" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M3 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                {bot.pair}
              </div>
            </div>
            <div className="order-field">
              <div className="order-lbl">Side</div>
              <div className="side-toggle">
                <div className={`side-opt long ${side === "LONG" ? "on" : ""}`} onClick={() => setSize("") || setSide("LONG")}>Long</div>
                <div className={`side-opt short ${side === "SHORT" ? "on" : ""}`} onClick={() => setSize("") || setSide("SHORT")}>Short</div>
              </div>
            </div>
            <div className="order-field">
              <div className="order-lbl">Size (USDT)</div>
              <input className="order-inp" type="number" placeholder="0.00" value={size} onChange={e => setSize(e.target.value)} disabled={!running} />
            </div>
            <div className="order-field">
              <div className="order-lbl">Type</div>
              <select className="order-inp" style={{ cursor:"pointer" }} disabled={!running}>
                <option>MARKET</option>
                <option>LIMIT</option>
              </select>
            </div>
            <button className={`btn ${side === "LONG" ? "btn-green" : "btn-red"}`}
              disabled={!running || !size}
              style={{ alignSelf:"flex-end" }}>
              {side === "LONG" ? <IcoPlay size={11} /> : <IcoStop size={11} />}
              Submit {side}
            </button>
          </div>
          {!running && (
            <div style={{ marginTop:10, fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", display:"flex", alignItems:"center", gap:6 }}>
              <IcoAlert size={11} style={{ color:"var(--amber)" }} />
              Manual orders are disabled while the bot is not running.
            </div>
          )}
        </div>
      </div>

      {/* Log stream */}
      <LogStream />
    </div>
  );
}

// ─── TAB 3: HISTORY ───────────────────────────────────────────────────────────
function TabHistory() {
  const [closed] = useState(genClosedPositions);
  const [orders] = useState(genOrders);

  const statusCls = s => {
    if (s === "FILLED") return "tag-green";
    if (s === "FAILED" || s === "CANCELLED") return "tag-red";
    return "tag-blue";
  };

  return (
    <div className="tab-body">
      {/* Closed positions */}
      <div className="card">
        <div className="card-hdr">
          <span className="card-title">Closed Positions <span style={{ color:"var(--text2)", fontWeight:400 }}>({closed.length})</span></span>
          <button className="btn btn-ghost btn-sm"><IcoRefresh size={11} /> Refresh</button>
        </div>
        <div className="card-body np">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Pair</th>
                  <th className="r">Entry</th>
                  <th className="r">Exit</th>
                  <th className="r">Size</th>
                  <th className="r">Realised P&L</th>
                  <th>Reason</th>
                  <th>Closed At</th>
                </tr>
              </thead>
              <tbody>
                {closed.map(p => (
                  <tr key={p.id}>
                    <td><span className={`tag ${p.side === "LONG" ? "tag-long" : "tag-short"}`}>{p.side}</span></td>
                    <td><div className="cell-pair">{p.pair}</div><div className="cell-id">{p.id}</div></td>
                    <td className="mono r">{p.entry.toFixed(2)}</td>
                    <td className="mono r">{p.exit.toFixed(2)}</td>
                    <td className="mono r">{p.qty}</td>
                    <td className="r">
                      <span style={{ fontFamily:"var(--mono)", fontSize:10, fontWeight:600, color: p.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                        {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                      </span>
                    </td>
                    <td><span className="tag tag-ghost" style={{ fontSize:7 }}>{p.reason}</span></td>
                    <td className="mono" style={{ color:"var(--text2)", fontSize:9 }}>{p.closedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Order history */}
      <div className="card">
        <div className="card-hdr">
          <span className="card-title">Order History <span style={{ color:"var(--text2)", fontWeight:400 }}>({orders.length})</span></span>
          <button className="btn btn-ghost btn-sm"><IcoRefresh size={11} /> Refresh</button>
        </div>
        <div className="card-body np">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Pair</th>
                  <th>Type</th>
                  <th className="r">Price</th>
                  <th className="r">Qty</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td>
                      <span className={`tag ${o.side === "BUY" ? "tag-long" : "tag-short"}`}>{o.side}</span>
                    </td>
                    <td><div className="cell-pair">{o.pair}</div><div className="cell-id">{o.id}</div></td>
                    <td className="mono" style={{ fontSize:9, color:"var(--text2)" }}>{o.type}</td>
                    <td className="mono r">{o.price.toLocaleString()}</td>
                    <td className="mono r">{o.qty}</td>
                    <td><span className={`tag ${statusCls(o.status)}`}>{o.status}</span></td>
                    <td className="mono" style={{ color:"var(--text2)", fontSize:9 }}>{o.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ACTION BUTTONS ───────────────────────────────────────────────────────────
function ActionButtons({ status, onDelete }) {
  const [localStatus, setLocalStatus] = useState(status);

  if (localStatus === "running") return (
    <>
      <button className="btn btn-amber" onClick={() => setLocalStatus("paused")}>
        <IcoPause size={11} /> Pause
      </button>
      <button className="btn btn-red" onClick={() => setLocalStatus("stopped")}>
        <IcoStop size={11} /> Stop
      </button>
    </>
  );
  if (localStatus === "paused") return (
    <>
      <button className="btn btn-green" onClick={() => setLocalStatus("running")}>
        <IcoPlay size={11} /> Resume
      </button>
      <button className="btn btn-red" onClick={() => setLocalStatus("stopped")}>
        <IcoStop size={11} /> Stop
      </button>
    </>
  );
  if (localStatus === "stopped") return (
    <>
      <button className="btn btn-green" onClick={() => setLocalStatus("running")}>
        <IcoPlay size={11} /> Start
      </button>
      <button className="btn btn-red" onClick={onDelete}>
        <IcoTrash size={11} /> Delete
      </button>
    </>
  );
  if (localStatus === "initializing") return (
    <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--blue)" }}>Initializing…</span>
  );
  if (localStatus === "error") return (
    <>
      <button className="btn btn-amber">
        <IcoRefresh size={11} /> Retry
      </button>
      <button className="btn btn-red" onClick={onDelete}>
        <IcoTrash size={11} /> Delete
      </button>
    </>
  );
  return null;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function BotDetailPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [positions, setPositions] = useState(genPositions);
  const [equity]    = useState(genEquityCurve);
  const [closeModal, setCloseModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);

  function handleClosePosition(pos) { setCloseModal(pos); }
  function confirmClose(posId) {
    setPositions(prev => prev.filter(p => p.id !== posId));
  }

  const sc = STATUS_CFG[BOT.status];

  const NAV_ITEMS = [
    { key:"overview", label:"Overview", Icon: IcoOverview },
    { key:"trading",  label:"Trading",  Icon: IcoTrading  },
    { key:"history",  label:"History",  Icon: IcoHistory  },
  ];

  return (
    <>
      <style>{STYLES}</style>
      <div className="page">

        {/* HEADER */}
        <header className="hdr">
          <div className="back-btn" onClick={() => {}}>
            <IcoBack size={15} />
          </div>

          <div className="hdr-left">
            <div className="breadcrumb">
              <span className="breadcrumb-link">Dashboard</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-link">Bot Fleet</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-cur">{BOT.id}</span>
            </div>
            <div className="hdr-title">
              <span className="bot-id">{BOT.id}</span>
              <div className="status-badge running" style={{ color: sc.color, background: sc.bg, borderColor: sc.border }}>
                <span className="status-dot" style={{ background: sc.color }} />
                {sc.label}
              </div>
            </div>
            <div className="hdr-meta">
              <span>{BOT.name}</span>
              &nbsp;·&nbsp;
              <span>{BOT.exchange}</span>
              &nbsp;·&nbsp;
              <span>{BOT.pair}</span>
              &nbsp;·&nbsp;
              {BOT.user}
            </div>
          </div>

          <div className="hdr-actions">
            <ActionButtons status={BOT.status} onDelete={() => setDeleteModal(true)} />
          </div>
        </header>

        {/* BODY */}
        <div className="body">

          {/* SIDE NAV */}
          <nav className="sidenav">
            {NAV_ITEMS.map(item => (
              <div
                key={item.key}
                className={`nav-item ${activeTab === item.key ? "active" : ""}`}
                onClick={() => setActiveTab(item.key)}
              >
                <span className="nav-icon"><item.Icon size={16} /></span>
                <span className="nav-lbl">{item.label}</span>
                {item.key === "trading" && (
                  <span className="nav-status-pip" style={{ background: "var(--green)" }} />
                )}
              </div>
            ))}

            <div className="nav-divider" />

            {/* Bot vitals in nav */}
            <div style={{ padding:"8px 14px", display:"flex", flexDirection:"column", gap:10 }}>
              {[
                ["P&L", `+$${Math.abs(BOT.sessionPnl).toFixed(0)}`, "var(--green)"],
                ["WR",  `${BOT.winRate}%`,                           "var(--blue)"],
                ["POS", positions.length,                             "var(--amber)"],
              ].map(([k, v, c]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".1em" }}
                    className="nav-lbl">{k}</span>
                  <span style={{ fontFamily:"var(--mono)", fontSize:10, fontWeight:600, color:c }}
                    className="nav-lbl">{v}</span>
                </div>
              ))}
            </div>
          </nav>

          {/* CONTENT */}
          <main className="content">
            {activeTab === "overview" && (
              <TabOverview bot={BOT} equity={equity} positions={positions} onClosePosition={handleClosePosition} />
            )}
            {activeTab === "trading" && (
              <TabTrading bot={BOT} positions={positions} onClosePosition={handleClosePosition} />
            )}
            {activeTab === "history" && <TabHistory />}
          </main>
        </div>
      </div>

      {/* MODALS */}
      {closeModal && (
        <ClosePositionModal position={closeModal} onClose={() => setCloseModal(null)} onConfirm={confirmClose} />
      )}
      {deleteModal && (
        <DeleteBotModal bot={BOT} onClose={() => setDeleteModal(false)} />
      )}
    </>
  );
}
