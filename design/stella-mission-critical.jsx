import { useState, useEffect, useRef, useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

/* ─────────────────────────── FONTS & BASE ────────────────────────────────── */
const FONT = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');`;

/* ─────────────────────────── HELPERS ────────────────────────────────────── */
const rnd  = (a, b) => a + Math.random() * (b - a);
const rndI = (a, b) => Math.floor(rnd(a, b));
const fmt  = (n, d = 2) => n.toFixed(d);
const fmtK = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : n.toFixed(0);

function sparkline(n = 24, base = 100, vol = 0.04) {
  let v = base;
  return Array.from({ length: n }, (_, i) => {
    v += (Math.random() - 0.47) * vol * v;
    return { i, v: +v.toFixed(2) };
  });
}

function genEquityCurve(n = 120) {
  let eq = 2_480_000;
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    eq += (Math.random() - 0.46) * 3200;
    return {
      t: new Date(now - (n - i) * 5 * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      eq: +eq.toFixed(0),
    };
  });
}

function genOrders(n = 18) {
  const pairs  = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","ARB/USDT"];
  const sides  = ["buy","sell"];
  const status = ["filled","filled","filled","filled","cancelled","failed","pending"];
  const bots   = ["BOT-7f3a","BOT-2c1b","BOT-9e4d","BOT-5a8f","BOT-3b7c"];
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    id:     `ORD-${rndI(1000, 9999)}`,
    bot:    bots[rndI(0, bots.length)],
    pair:   pairs[rndI(0, pairs.length)],
    side:   sides[rndI(0, 2)],
    price:  pairs[0] === "BTC/USDT" ? rnd(44800, 45600).toFixed(2) : rnd(2800, 3200).toFixed(2),
    qty:    rnd(0.001, 0.12).toFixed(4),
    status: status[rndI(0, status.length)],
    age:    `${rndI(0, 59)}s`,
    ts:     new Date(now - rndI(0, 3600000)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  }));
}

/* ─────────────────────────── BOTS ───────────────────────────────────────── */
const BOTS = [
  { id:"BOT-7f3a", name:"Momentum α",  status:"running", exchange:"Binance",  pair:"BTC/USDT", pnl:+142.30, pct:+5.69, trades:47, equity:2643, spark:sparkline(20,2500,.02) },
  { id:"BOT-2c1b", name:"Grid β",      status:"running", exchange:"Binance",  pair:"ETH/USDT", pnl:+38.14,  pct:+2.11, trades:23, equity:1838, spark:sparkline(20,1800,.015) },
  { id:"BOT-9e4d", name:"Scalp γ",     status:"paused",  exchange:"Bybit",    pair:"SOL/USDT", pnl:-12.80,  pct:-1.28, trades:31, equity:988,  spark:sparkline(20,1000,.03) },
  { id:"BOT-5a8f", name:"Arb δ",       status:"running", exchange:"Binance",  pair:"BNB/USDT", pnl:+67.50,  pct:+3.37, trades:15, equity:2067, spark:sparkline(20,2000,.018) },
  { id:"BOT-3b7c", name:"DCA ε",       status:"error",   exchange:"Alpaca",   pair:"ETH/USDT", pnl:-4.20,   pct:-0.42, trades:8,  equity:995,  spark:sparkline(20,1000,.025) },
  { id:"BOT-1d9e", name:"Trend ζ",     status:"running", exchange:"Binance",  pair:"ARB/USDT", pnl:+21.90,  pct:+2.19, trades:19, equity:1121, spark:sparkline(20,1100,.02) },
  { id:"BOT-4f2c", name:"Impulse η",   status:"running", exchange:"Bybit",    pair:"BTC/USDT", pnl:+88.40,  pct:+4.42, trades:34, equity:2088, spark:sparkline(20,2000,.022) },
  { id:"BOT-6e3d", name:"Mean Rev θ",  status:"stopped", exchange:"Binance",  pair:"SOL/USDT", pnl:+0.00,   pct:+0.00, trades:0,  equity:1500, spark:sparkline(20,1500,.01) },
];

/* ─────────────────────────── SERVICES ───────────────────────────────────── */
const SERVICES = [
  { name:"Elixir Engine",   status:"healthy",  lat:12,  uptime:99.98, node:"erl@node-01" },
  { name:"NestJS API",      status:"healthy",  lat:24,  uptime:99.95, node:"nestjs-02"   },
  { name:"PostgreSQL",      status:"healthy",  lat:4,   uptime:100,   node:"pg-primary"  },
  { name:"TimescaleDB",     status:"healthy",  lat:6,   uptime:99.99, node:"tsdb-01"     },
  { name:"RabbitMQ",        status:"degraded", lat:142, uptime:99.80, node:"rmq-cluster" },
  { name:"Redis",           status:"healthy",  lat:1,   uptime:100,   node:"redis-01"    },
  { name:"Logto Auth",      status:"healthy",  lat:38,  uptime:99.92, node:"logto-01"    },
  { name:"SvelteKit",       status:"healthy",  lat:18,  uptime:99.97, node:"svelte-02"   },
];

const QUEUES = [
  { name:"trading.orders",    depth:4,    rate:120, status:"ok"   },
  { name:"trading.fills",     depth:2,    rate:95,  status:"ok"   },
  { name:"risk.events",       depth:0,    rate:12,  status:"ok"   },
  { name:"platform.notify",   depth:847,  rate:8,   status:"warn" },
  { name:"billing.jobs",      depth:1,    rate:3,   status:"ok"   },
  { name:"backtest.dispatch", depth:1203, rate:1,   status:"crit" },
];

/* ─────────────────────────── INCIDENTS ──────────────────────────────────── */
const INCIDENTS = [
  { id:"INC-0041", sev:"critical", title:"Circuit breaker triggered — BOT-3b7c",      desc:"Drawdown exceeded 15% threshold. 3 positions closed.", ago:"2m",  status:"open"     },
  { id:"INC-0040", sev:"warning",  title:"RabbitMQ queue depth elevated",              desc:"platform.notify queue at 847 messages. Consumer lag detected.", ago:"8m",  status:"open"     },
  { id:"INC-0039", sev:"warning",  title:"Order failure spike — Alpaca adapter",       desc:"12 consecutive rejections. Likely API key rotation needed.", ago:"14m", status:"open"     },
  { id:"INC-0038", sev:"info",     title:"KYC submission — manual review required",    desc:"User id:usr-88f3 requires enhanced document review.", ago:"22m", status:"open"     },
  { id:"INC-0037", sev:"critical", title:"Backtest queue saturated",                   desc:"1,203 jobs queued. Worker pool exhausted. ETA: 14 min.", ago:"31m", status:"open"     },
  { id:"INC-0036", sev:"info",     title:"BOT-9e4d paused — strategy drift detected",  desc:"Momentum signature deviated from baseline by 2.3σ.", ago:"47m", status:"resolved"  },
  { id:"INC-0035", sev:"warning",  title:"High slippage detected — SOL/USDT",          desc:"Avg slippage 0.82% vs expected 0.1%. Market impact elevated.", ago:"1h",  status:"resolved"  },
];

/* ─────────────────────────── LIVE ORDERS ────────────────────────────────── */
const INIT_ORDERS = genOrders(18);

/* ─────────────────────────── EQUITY CURVE ───────────────────────────────── */
const EQ_DATA = genEquityCurve(120);
const EQ_START = EQ_DATA[0].eq;
const EQ_NOW   = EQ_DATA[EQ_DATA.length - 1].eq;

/* ─────────────────────────── LATENCY HISTORY ────────────────────────────── */
const LAT_DATA = Array.from({ length: 48 }, (_, i) => ({
  t: i, v: rnd(8, i === 30 ? 320 : 35)
}));

/* ─────────────────────────── PLATFORM METRICS ───────────────────────────── */
const PLATFORM = {
  equity:     2_481_240,
  pnl24h:     +341_880,
  pnl24hPct:  +15.96,
  winRate:    68.4,
  openPos:    23,
  activeBots: 5,
  totalBots:  8,
  totalTrades:137,
  volume24h:  4_820_000,
  circBreakers: 1,
  failedOrders: 3,
  uptime:     "99.94%",
};

/* ═══════════════════════════ CSS ════════════════════════════════════════════ */
const CSS = `
${FONT}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg0: #070b0f;
  --bg1: #0b1018;
  --bg2: #101620;
  --bg3: #161e2c;
  --bg4: #1c2840;
  --b1:  #1e2d40;
  --b2:  #253550;
  --b3:  #2e4268;
  --t0:  #e8edf3;
  --t1:  #8fa3b8;
  --t2:  #5a7090;
  --t3:  #3a5068;
  --g:   #00e5a0;
  --gd:  rgba(0,229,160,.10);
  --gm:  rgba(0,229,160,.20);
  --a:   #f5a623;
  --ad:  rgba(245,166,35,.10);
  --r:   #ff4757;
  --rd:  rgba(255,71,87,.10);
  --bl:  #3d9df3;
  --bld: rgba(61,157,243,.10);
  --p:   #b97aff;
  --pd:  rgba(185,122,255,.10);
  --cy:  #00d4e8;
  --cyd: rgba(0,212,232,.10);
  --mono: 'IBM Plex Mono', monospace;
  --sans: 'DM Sans', sans-serif;
}
html, body { height: 100%; background: var(--bg0); color: var(--t0); font-family: var(--sans); overflow: hidden; }

/* ── SCROLLBARS ── */
::-webkit-scrollbar { width: 3px; height: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--b2); border-radius: 2px; }

/* ── SHELL ── */
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: var(--bg0); }

/* ── TOP BAR ── */
.topbar {
  display: flex; align-items: center; padding: 0 16px;
  height: 44px; flex-shrink: 0;
  background: var(--bg1); border-bottom: 1px solid var(--b1);
  gap: 12px; position: relative; z-index: 30;
}
.logo { font-family: var(--mono); font-size: 14px; font-weight: 700; color: var(--t0); letter-spacing: .06em; }
.logo span { color: var(--g); }
.topbar-tag { font-family: var(--mono); font-size: 8px; text-transform: uppercase; letter-spacing: .14em;
  color: var(--t2); padding: 2px 7px; border: 1px solid var(--b2); border-radius: 2px; }
.topbar-live { display: flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 9px;
  color: var(--g); margin-left: auto; }
.pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--g);
  animation: pulseAnim 1.6s ease-in-out infinite; }
@keyframes pulseAnim { 0%,100%{ opacity:1; box-shadow: 0 0 0 0 rgba(0,229,160,.5); }
  50%{ opacity:.7; box-shadow: 0 0 0 5px rgba(0,229,160,0); } }
.tb-sep { width: 1px; height: 22px; background: var(--b1); }
.tb-time { font-family: var(--mono); font-size: 11px; color: var(--t1); }
.tb-alert { display: flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 9px;
  color: var(--r); padding: 3px 8px; background: var(--rd); border: 1px solid rgba(255,71,87,.25);
  border-radius: 2px; animation: alertBlink 2s step-end infinite; }
@keyframes alertBlink { 0%,100%{ opacity:1; } 50%{ opacity:.55; } }

/* ── GRID CANVAS ── */
.canvas { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 10px; }
.grid {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  grid-auto-rows: 56px;
  gap: 6px;
  min-width: 0;
}

/* ── CARD ── */
.card {
  background: var(--bg2); border: 1px solid var(--b1); border-radius: 5px;
  overflow: hidden; position: relative; display: flex; flex-direction: column;
  transition: border-color .15s;
}
.card:hover { border-color: var(--b2); }
.card-accent { position: absolute; top: 0; left: 0; right: 0; height: 2px; }

/* card grid spans — columns × rows */
.c2r1  { grid-column: span 2;  grid-row: span 1; }
.c3r1  { grid-column: span 3;  grid-row: span 1; }
.c3r2  { grid-column: span 3;  grid-row: span 2; }
.c3r3  { grid-column: span 3;  grid-row: span 3; }
.c4r2  { grid-column: span 4;  grid-row: span 2; }
.c4r3  { grid-column: span 4;  grid-row: span 3; }
.c4r4  { grid-column: span 4;  grid-row: span 4; }
.c5r2  { grid-column: span 5;  grid-row: span 2; }
.c5r3  { grid-column: span 5;  grid-row: span 3; }
.c5r4  { grid-column: span 5;  grid-row: span 4; }
.c5r5  { grid-column: span 5;  grid-row: span 5; }
.c6r2  { grid-column: span 6;  grid-row: span 2; }
.c6r3  { grid-column: span 6;  grid-row: span 3; }
.c6r4  { grid-column: span 6;  grid-row: span 4; }
.c6r5  { grid-column: span 6;  grid-row: span 5; }
.c7r3  { grid-column: span 7;  grid-row: span 3; }
.c7r5  { grid-column: span 7;  grid-row: span 5; }
.c8r3  { grid-column: span 8;  grid-row: span 3; }
.c8r4  { grid-column: span 8;  grid-row: span 4; }
.c8r5  { grid-column: span 8;  grid-row: span 5; }
.c9r4  { grid-column: span 9;  grid-row: span 4; }
.c10r3 { grid-column: span 10; grid-row: span 3; }
.c10r4 { grid-column: span 10; grid-row: span 4; }
.c12r3 { grid-column: span 12; grid-row: span 3; }
.c12r4 { grid-column: span 12; grid-row: span 4; }
.c14r4 { grid-column: span 14; grid-row: span 4; }
.c16r4 { grid-column: span 16; grid-row: span 4; }
.c24r4 { grid-column: span 24; grid-row: span 4; }

/* ── CARD INNER ── */
.ch { padding: 7px 10px 5px; border-bottom: 1px solid var(--b1); display: flex;
  align-items: center; justify-content: space-between; flex-shrink: 0; }
.ct { font-family: var(--mono); font-size: 8px; text-transform: uppercase;
  letter-spacing: .12em; color: var(--t2); display: flex; align-items: center; gap: 6px; }
.cb { flex: 1; padding: 8px 10px; overflow: hidden; display: flex; flex-direction: column; gap: 4px; }
.cb.np { padding: 0; }

/* ── BIG VALUE ── */
.bigval { font-family: var(--mono); font-weight: 700; line-height: 1; }
.bv-xs  { font-size: 13px; }
.bv-sm  { font-size: 17px; }
.bv-md  { font-size: 22px; }
.bv-lg  { font-size: 28px; }
.bv-xl  { font-size: 36px; }
.sub    { font-family: var(--mono); font-size: 8px; color: var(--t2); margin-top: 2px; }
.subb   { font-family: var(--mono); font-size: 8px; margin-top: 1px; }

/* ── TAGS ── */
.tag { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 2px;
  font-family: var(--mono); font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.tg { background: var(--gd); color: var(--g); }
.ta { background: var(--ad); color: var(--a); }
.tr { background: var(--rd); color: var(--r); }
.tb { background: var(--bld); color: var(--bl); }
.tp { background: var(--pd);  color: var(--p);  }
.tcy{ background: var(--cyd); color: var(--cy); }
.td { background: var(--bg3); color: var(--t1); border: 1px solid var(--b2); }

/* ── STATUS DOT ── */
.sdot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.sdot.running { background: var(--g); box-shadow: 0 0 0 2px rgba(0,229,160,.25); animation: pulseAnim 2s infinite; }
.sdot.paused  { background: var(--a); }
.sdot.error   { background: var(--r); animation: errBlink 1s step-end infinite; }
.sdot.stopped { background: var(--t2); }
.sdot.healthy  { background: var(--g); }
.sdot.degraded { background: var(--a); }
.sdot.down     { background: var(--r); }
@keyframes errBlink { 0%,100%{ opacity:1; } 50%{ opacity:.3; } }

/* ── GAUGE (SVG arc) ── */
.gauge-wrap { display: flex; align-items: center; justify-content: center; flex: 1; }

/* ── BOT ROW ── */
.bot-row { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  border-bottom: 1px solid var(--b1); font-family: var(--mono); }
.bot-row:last-child { border-bottom: none; }
.bot-row:hover { background: rgba(255,255,255,.02); }
.bot-name { font-size: 9px; color: var(--t0); font-weight: 600; width: 72px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bot-pair { font-size: 8px; color: var(--t2); width: 56px; flex-shrink: 0; }
.bot-pnl  { font-size: 10px; font-weight: 600; width: 58px; flex-shrink: 0; text-align: right; }
.bot-spark{ flex: 1; height: 22px; min-width: 0; }

/* ── SERVICE ROW ── */
.svc-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px;
  border-bottom: 1px solid var(--b1); font-family: var(--mono); }
.svc-row:last-child { border-bottom: none; }
.svc-name { font-size: 9px; color: var(--t0); font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.svc-lat  { font-size: 9px; color: var(--t2); width: 40px; text-align: right; }
.svc-bar  { width: 48px; height: 3px; background: var(--bg4); border-radius: 2px; overflow: hidden; }
.svc-fill { height: 100%; border-radius: 2px; }

/* ── ORDER ROW ── */
.ord-row { display: grid; grid-template-columns: 60px 52px 56px 1fr 48px;
  gap: 4px; padding: 4px 8px; border-bottom: 1px solid var(--b1);
  font-family: var(--mono); font-size: 9px; align-items: center; }
.ord-row:last-child { border-bottom: none; }
.ord-row:hover { background: rgba(255,255,255,.02); }

/* ── QUEUE ROW ── */
.q-row { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  border-bottom: 1px solid var(--b1); font-family: var(--mono); font-size: 9px; }
.q-row:last-child { border-bottom: none; }
.q-name { color: var(--t2); flex: 1; font-size: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-depth { width: 40px; text-align: right; font-weight: 600; }
.q-bar { width: 60px; height: 4px; background: var(--bg4); border-radius: 2px; overflow: hidden; }
.q-fill { height: 100%; border-radius: 2px; transition: width .3s; }

/* ── INCIDENT ROW ── */
.inc-row { display: flex; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--b1);
  cursor: pointer; }
.inc-row:last-child { border-bottom: none; }
.inc-row:hover { background: rgba(255,255,255,.02); }
.inc-sev { width: 3px; border-radius: 2px; flex-shrink: 0; align-self: stretch; }
.inc-body { flex: 1; min-width: 0; }
.inc-title { font-family: var(--mono); font-size: 9px; color: var(--t0); font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
.inc-desc  { font-family: var(--mono); font-size: 8px; color: var(--t2); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.inc-meta  { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.inc-ago   { font-family: var(--mono); font-size: 8px; color: var(--t3); }

/* ── PROGRESS BAR ── */
.pbar { height: 4px; background: var(--bg4); border-radius: 2px; overflow: hidden; }
.pfill { height: 100%; border-radius: 2px; }

/* ── DONUT RING ── */
.donut-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
.donut-label { position: absolute; text-align: center; }

/* ── GRID LINES ── */
.gl-x text, .gl-y text { display: none; }

/* ── SECTION LABEL ── */
.sect-lbl { font-family: var(--mono); font-size: 7px; text-transform: uppercase;
  letter-spacing: .2em; color: var(--t3); padding: 0 2px 3px; grid-column: span 24;
  border-bottom: 1px solid var(--b1); margin-bottom: 0; }

/* ── TINY ROW ── */
.tinyrow { display: flex; justify-content: space-between; align-items: center; }
.tinyrow + .tinyrow { margin-top: 3px; }

/* ── TWO COL ── */
.two-col { display: flex; gap: 8px; }
.two-col > * { flex: 1; }

/* ── STAT PILL ── */
.stat-pill { background: var(--bg3); border: 1px solid var(--b1); border-radius: 3px;
  padding: 4px 7px; display: flex; flex-direction: column; gap: 2px; }
.sp-lbl { font-family: var(--mono); font-size: 7px; text-transform: uppercase;
  letter-spacing: .1em; color: var(--t2); }
.sp-val { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--t0); }

/* ── ANIMATED COUNT ── */
@keyframes countUp { from{ opacity:0; transform:translateY(4px); } to{ opacity:1; transform:none; } }
.count-anim { animation: countUp .4s ease-out both; }

/* ── HEATMAP ── */
.heatmap { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; padding: 8px; }
.hm-cell { border-radius: 2px; aspect-ratio: 1; position: relative; cursor: default; }
.hm-cell:hover { opacity: .8; }

/* ── CIRCUIT BREAKER CARD ── */
.cb-active { background: linear-gradient(135deg, rgba(255,71,87,.08), rgba(255,71,87,.03));
  border-color: rgba(255,71,87,.35) !important; }

/* ─── SCROLLABLE INNER ── */
.scrl { overflow-y: auto; flex: 1; }
`;

/* ═══════════════════════════ COMPONENTS ════════════════════════════════════ */

function SvgArc({ pct, color, size = 60, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg4)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: "stroke-dashoffset .6s ease" }}/>
    </svg>
  );
}

function MiniSparkline({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function useTime() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function useTicker(fn, ms) {
  useEffect(() => { const id = setInterval(fn, ms); return () => clearInterval(id); }, []);
}

/* ─── PLATFORM EQUITY CARD ─── */
function EquityCard() {
  const [eq, setEq] = useState(EQ_NOW);
  useTicker(() => setEq(e => +(e + rnd(-800, 1200)).toFixed(0)), 2000);
  const diff = eq - EQ_START;
  const up = diff >= 0;
  return (
    <div className="card c6r3" style={{ background: "linear-gradient(160deg, #101a28, #0e1620)" }}>
      <div className="card-accent" style={{ background: up ? "var(--g)" : "var(--r)" }}/>
      <div className="ch">
        <div className="ct"><span style={{ color:"var(--t3)" }}>●</span> Platform Equity</div>
        <div className="tag tg">24h</div>
      </div>
      <div className="cb" style={{ justifyContent:"center" }}>
        <div className="bigval bv-xl count-anim" style={{ color: "var(--t0)" }}>
          ${(eq/1_000_000).toFixed(3)}<span style={{ fontSize:14, color:"var(--t1)" }}>M</span>
        </div>
        <div className="subb" style={{ color: up ? "var(--g)" : "var(--r)", fontSize:10 }}>
          {up ? "▲" : "▼"} ${(Math.abs(diff)/1000).toFixed(1)}k ({((diff/EQ_START)*100).toFixed(2)}%)
        </div>
        <div className="sub">Total equity across {PLATFORM.activeBots} active bots</div>
      </div>
      <div style={{ height:44, background:"var(--bg1)", borderTop:"1px solid var(--b1)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={EQ_DATA} margin={{ top:4, right:0, bottom:0, left:0 }}>
            <defs>
              <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={up ? "#00e5a0" : "#ff4757"} stopOpacity={.3}/>
                <stop offset="95%" stopColor={up ? "#00e5a0" : "#ff4757"} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="eq" stroke={up ? "var(--g)" : "var(--r)"}
              strokeWidth={1.2} fill="url(#eqg)" dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── 24H P&L CARD ─── */
function PnlCard() {
  const [pnl, setPnl] = useState(PLATFORM.pnl24h);
  useTicker(() => setPnl(p => +(p + rnd(-120, 180)).toFixed(0)), 1800);
  const up = pnl >= 0;
  return (
    <div className={`card c4r2 ${!up ? "cb-active" : ""}`}>
      <div className="card-accent" style={{ background: up ? "var(--g)" : "var(--r)" }}/>
      <div className="ch">
        <div className="ct">24h Realized P&L</div>
      </div>
      <div className="cb" style={{ justifyContent:"center" }}>
        <div className="bigval bv-lg" style={{ color: up ? "var(--g)" : "var(--r)" }}>
          {up ? "+" : ""}${(Math.abs(pnl)/1000).toFixed(1)}k
        </div>
        <div className="sub">{((pnl/PLATFORM.equity)*100).toFixed(2)}% on deployed capital</div>
      </div>
    </div>
  );
}

/* ─── WIN RATE ─── */
function WinRateCard() {
  const [wr, setWr] = useState(PLATFORM.winRate);
  useTicker(() => setWr(w => Math.max(50, Math.min(90, w + rnd(-.3, .3)))), 3000);
  return (
    <div className="card c3r2">
      <div className="card-accent" style={{ background:"var(--bl)" }}/>
      <div className="ch"><div className="ct">Win Rate</div></div>
      <div className="cb" style={{ alignItems:"center", justifyContent:"center", position:"relative" }}>
        <div className="donut-wrap" style={{ width:64, height:64 }}>
          <SvgArc pct={wr} color="var(--bl)" size={64} stroke={7}/>
          <div className="donut-label">
            <div style={{ fontFamily:"var(--mono)", fontSize:13, fontWeight:700, color:"var(--bl)" }}>{wr.toFixed(1)}%</div>
          </div>
        </div>
        <div className="sub" style={{ textAlign:"center" }}>{rndI(80,100)} wins / {rndI(30,50)} losses</div>
      </div>
    </div>
  );
}

/* ─── ACTIVE BOTS GAUGE ─── */
function ActiveBotsCard() {
  const running = BOTS.filter(b => b.status === "running").length;
  const pct = (running / BOTS.length) * 100;
  return (
    <div className="card c3r2">
      <div className="card-accent" style={{ background:"var(--g)" }}/>
      <div className="ch"><div className="ct">Bot Fleet</div></div>
      <div className="cb" style={{ alignItems:"center", justifyContent:"center" }}>
        <div className="donut-wrap" style={{ width:64, height:64 }}>
          <SvgArc pct={pct} color="var(--g)" size={64} stroke={7}/>
          <div className="donut-label">
            <div style={{ fontFamily:"var(--mono)", fontSize:15, fontWeight:700, color:"var(--t0)", lineHeight:1 }}>{running}</div>
            <div style={{ fontFamily:"var(--mono)", fontSize:7, color:"var(--t2)" }}>/ {BOTS.length}</div>
          </div>
        </div>
        <div className="sub" style={{ textAlign:"center" }}>Active bots</div>
      </div>
    </div>
  );
}

/* ─── STAT MICRO CARDS ─── */
function MicroStat({ label, value, color, sub, accent }) {
  return (
    <div className="card c3r1" style={{ borderLeft: `2px solid ${accent || color}` }}>
      <div className="cb" style={{ padding:"6px 10px", justifyContent:"center", gap:1 }}>
        <div className="sub">{label}</div>
        <div className="bigval bv-sm" style={{ color }}>{value}</div>
        {sub && <div className="sub" style={{ fontSize:7 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── OPEN POSITIONS ─── */
function OpenPosCard() {
  const [cnt, setCnt] = useState(PLATFORM.openPos);
  useTicker(() => setCnt(c => Math.max(18, Math.min(32, c + rndI(-1, 2)))), 4000);
  return (
    <div className="card c3r2">
      <div className="card-accent" style={{ background:"var(--a)" }}/>
      <div className="ch"><div className="ct">Open Positions</div></div>
      <div className="cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="bigval bv-xl" style={{ color:"var(--a)", textAlign:"center" }}>{cnt}</div>
        <div className="sub">across {BOTS.filter(b=>b.status==="running").length} bots</div>
        <div style={{ marginTop:4, width:"100%" }}>
          <div className="pbar" style={{ height:3 }}>
            <div className="pfill" style={{ width:`${(cnt/50)*100}%`, background:"var(--a)" }}/>
          </div>
        </div>
        <div className="sub" style={{ fontSize:7, marginTop:2 }}>{cnt}/50 position limit</div>
      </div>
    </div>
  );
}

/* ─── CIRCUIT BREAKER CARD ─── */
function CircuitBreakerCard() {
  const active = 1;
  return (
    <div className="card c3r2 cb-active">
      <div className="card-accent" style={{ background:"var(--r)" }}/>
      <div className="ch">
        <div className="ct" style={{ color:"var(--r)" }}>Circuit Breakers</div>
        <div className="tag tr">ACTIVE</div>
      </div>
      <div className="cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="bigval bv-xl" style={{ color:"var(--r)", textAlign:"center", animation:"errBlink 1.5s step-end infinite" }}>{active}</div>
        <div className="sub">BOT-3b7c triggered</div>
        <div className="sub" style={{ fontSize:7, marginTop:2 }}>Cooldown: 34m remaining</div>
      </div>
    </div>
  );
}

/* ─── VOLUME 24H ─── */
function VolumeCard() {
  return (
    <div className="card c3r2">
      <div className="card-accent" style={{ background:"var(--p)" }}/>
      <div className="ch"><div className="ct">24h Volume</div></div>
      <div className="cb" style={{ justifyContent:"center" }}>
        <div className="bigval bv-md" style={{ color:"var(--p)" }}>$4.82M</div>
        <div className="sub">across all exchanges</div>
        <div className="two-col" style={{ marginTop:4 }}>
          <div className="stat-pill">
            <span className="sp-lbl">Binance</span>
            <span className="sp-val" style={{ fontSize:10 }}>$3.1M</span>
          </div>
          <div className="stat-pill">
            <span className="sp-lbl">Bybit</span>
            <span className="sp-val" style={{ fontSize:10 }}>$1.7M</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── BOT FLEET TABLE ─── */
function BotFleetCard() {
  const [bots, setBots] = useState(BOTS);
  useTicker(() => {
    setBots(prev => prev.map(b => b.status !== "running" ? b : {
      ...b,
      pnl: +(b.pnl + rnd(-.5, .8)).toFixed(2),
      equity: +(b.equity + rnd(-3, 5)).toFixed(0),
    }));
  }, 2200);

  const scol = { running:"var(--g)", paused:"var(--a)", error:"var(--r)", stopped:"var(--t2)" };

  return (
    <div className="card c8r5">
      <div className="card-accent" style={{ background:"var(--g)" }}/>
      <div className="ch">
        <div className="ct"><span className="sdot running"/>Bot Fleet — {BOTS.filter(b=>b.status==="running").length} Running</div>
        <div style={{ display:"flex", gap:4 }}>
          {["running","paused","error","stopped"].map(s => {
            const n = BOTS.filter(b => b.status === s).length;
            return n > 0 ? <span key={s} className="tag" style={{ background:`${scol[s]}18`, color:scol[s] }}>{n} {s}</span> : null;
          })}
        </div>
      </div>
      <div className="scrl">
        {/* header */}
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px",
          borderBottom:"1px solid var(--b1)", background:"var(--bg3)" }}>
          {["Bot","Pair","P&L","Eq.","Sparkline"].map((h,i) => (
            <div key={i} className="sub" style={{ fontSize:7,
              width:i===0?72:i===1?56:i===2?58:i===3?42:undefined, flex:i===4?1:undefined, flexShrink:0 }}>{h}</div>
          ))}
        </div>
        {bots.map(b => (
          <div className="bot-row" key={b.id}>
            <div style={{ display:"flex", alignItems:"center", gap:4, width:72, flexShrink:0 }}>
              <span className={`sdot ${b.status}`}/>
              <span className="bot-name">{b.name}</span>
            </div>
            <span className="bot-pair">{b.pair}</span>
            <span className="bot-pnl" style={{ color: b.pnl >= 0 ? "var(--g)" : "var(--r)" }}>
              {b.pnl >= 0 ? "+" : ""}${b.pnl.toFixed(2)}
            </span>
            <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--t1)", width:42, flexShrink:0, textAlign:"right" }}>
              ${(b.equity/1000).toFixed(1)}k
            </span>
            <div className="bot-spark">
              <MiniSparkline data={b.spark} color={b.pnl >= 0 ? "var(--g)" : "var(--r)"}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── LIVE ORDERS FEED ─── */
function LiveOrdersFeed() {
  const [orders, setOrders] = useState(INIT_ORDERS);
  useTicker(() => {
    const o = genOrders(1)[0];
    setOrders(prev => [o, ...prev].slice(0, 20));
  }, 1600);

  const sc = { filled:"tg", cancelled:"td", failed:"tr", pending:"tb" };
  return (
    <div className="card c8r5">
      <div className="card-accent" style={{ background:"var(--cy)" }}/>
      <div className="ch">
        <div className="ct"><span style={{ color:"var(--cy)" }}>●</span> Live Order Stream</div>
        <div className="tag tcy">LIVE</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"60px 52px 56px 1fr 46px",
        gap:4, padding:"4px 8px", borderBottom:"1px solid var(--b1)", background:"var(--bg3)" }}>
        {["Bot","Pair","Side","Price","Status"].map(h => (
          <div key={h} className="sub" style={{ fontSize:7 }}>{h}</div>
        ))}
      </div>
      <div className="scrl">
        {orders.map((o, i) => (
          <div className="ord-row" key={o.id} style={{ opacity: i < 3 ? 1 : .5 + i * .025 }}>
            <span style={{ color:"var(--t2)", fontSize:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.bot}</span>
            <span style={{ color:"var(--t0)", fontWeight:600 }}>{o.pair}</span>
            <span className={`tag ${o.side === "buy" ? "tg" : "tr"}`} style={{ fontSize:7 }}>{o.side.toUpperCase()}</span>
            <span style={{ color:"var(--t1)" }}>{o.price}</span>
            <span className={`tag ${sc[o.status] || "td"}`} style={{ fontSize:7 }}>{o.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── EQUITY CHART WIDE ─── */
function EquityChartCard() {
  const up = EQ_NOW >= EQ_START;
  const gc = up ? "#00e5a0" : "#ff4757";
  return (
    <div className="card c14r4">
      <div className="card-accent" style={{ background: gc }}/>
      <div className="ch">
        <div className="ct">Platform Equity — Rolling 10h</div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span style={{ fontFamily:"var(--mono)", fontSize:9, color: up ? "var(--g)" : "var(--r)" }}>
            {up ? "▲" : "▼"} ${Math.abs((EQ_NOW-EQ_START)/1000).toFixed(1)}k from open
          </span>
          <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--t2)" }}>{((Math.abs(EQ_NOW-EQ_START)/EQ_START)*100).toFixed(2)}%</span>
        </div>
      </div>
      <div style={{ flex:1, background:"var(--bg1)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={EQ_DATA} margin={{ top:8, right:10, bottom:8, left:0 }}>
            <defs>
              <linearGradient id="eqw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={gc} stopOpacity={.22}/>
                <stop offset="95%" stopColor={gc} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tick={{ fill:"var(--t3)", fontSize:7, fontFamily:"var(--mono)" }}
              tickLine={false} axisLine={false} interval={23}/>
            <YAxis tick={{ fill:"var(--t3)", fontSize:7, fontFamily:"var(--mono)" }}
              tickLine={false} axisLine={false} width={50}
              tickFormatter={v => `$${(v/1000).toFixed(0)}k`}/>
            <Tooltip
              contentStyle={{ background:"var(--bg1)", border:"1px solid var(--b2)", borderRadius:3,
                fontFamily:"var(--mono)", fontSize:9 }}
              labelStyle={{ color:"var(--t2)" }}
              itemStyle={{ color: gc }}
              formatter={v => [`$${(v/1000).toFixed(2)}k`, "Equity"]}/>
            <ReferenceLine y={EQ_START} stroke="var(--b2)" strokeDasharray="4 3" strokeWidth={.8}/>
            <Area type="monotone" dataKey="eq" stroke={gc} strokeWidth={1.5}
              fill="url(#eqw)" dot={false} activeDot={{ r:3, fill:gc, strokeWidth:0 }}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── LATENCY CHART ─── */
function LatencyCard() {
  return (
    <div className="card c10r4">
      <div className="card-accent" style={{ background:"var(--a)" }}/>
      <div className="ch">
        <div className="ct">API Latency — Elixir Engine (ms)</div>
        <span className="tag ta">P95</span>
      </div>
      <div style={{ flex:1, background:"var(--bg1)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={LAT_DATA} margin={{ top:8, right:10, bottom:8, left:0 }}>
            <defs>
              <linearGradient id="latg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f5a623" stopOpacity={.25}/>
                <stop offset="95%" stopColor="#f5a623" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fill:"var(--t3)", fontSize:7, fontFamily:"var(--mono)" }}
              tickLine={false} axisLine={false} width={28}/>
            <ReferenceLine y={100} stroke="rgba(255,71,87,.4)" strokeDasharray="4 3"/>
            <Tooltip
              contentStyle={{ background:"var(--bg1)", border:"1px solid var(--b2)", borderRadius:3,
                fontFamily:"var(--mono)", fontSize:9 }}
              formatter={v => [`${v.toFixed(0)}ms`, "Latency"]}
              labelStyle={{ display:"none" }}/>
            <Area type="monotone" dataKey="v" stroke="var(--a)" strokeWidth={1.2}
              fill="url(#latg)" dot={false} activeDot={{ r:3, fill:"var(--a)", strokeWidth:0 }}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── SERVICES HEALTH ─── */
function ServicesCard() {
  const [svcs, setSvcs] = useState(SERVICES);
  useTicker(() => {
    setSvcs(prev => prev.map(s => ({
      ...s, lat: s.status === "degraded"
        ? +(s.lat + rnd(-20, 30)).toFixed(0)
        : +(s.lat + rnd(-1, 2)).toFixed(0)
    })));
  }, 3000);

  const latColor = (ms) => ms < 50 ? "var(--g)" : ms < 150 ? "var(--a)" : "var(--r)";
  const latW     = (ms) => Math.min(100, (ms / 200) * 100);

  return (
    <div className="card c7r5">
      <div className="card-accent" style={{ background:"var(--bl)" }}/>
      <div className="ch">
        <div className="ct">Service Health</div>
        <div style={{ display:"flex", gap:4 }}>
          <span className="tag tg">{svcs.filter(s=>s.status==="healthy").length} OK</span>
          <span className="tag ta">{svcs.filter(s=>s.status==="degraded").length} DEGRADED</span>
        </div>
      </div>
      <div className="scrl">
        {svcs.map(s => (
          <div className="svc-row" key={s.name}>
            <span className={`sdot ${s.status}`}/>
            <span className="svc-name">{s.name}</span>
            <div className="svc-bar">
              <div className="svc-fill" style={{ width:`${latW(s.lat)}%`, background:latColor(s.lat) }}/>
            </div>
            <span className="svc-lat" style={{ color:latColor(s.lat) }}>{s.lat}ms</span>
            <span style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--t3)", width:36, textAlign:"right", flexShrink:0 }}>
              {s.uptime}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── QUEUE DEPTHS ─── */
function QueuesCard() {
  const [qs, setQs] = useState(QUEUES);
  useTicker(() => {
    setQs(prev => prev.map(q => ({
      ...q,
      depth: Math.max(0, q.depth + rndI(-3, q.status==="crit" ? 15 : 5))
    })));
  }, 1500);

  const depthColor = (d, s) => s === "crit" ? "var(--r)" : s === "warn" ? "var(--a)" : "var(--g)";
  const depthW     = (d) => Math.min(100, (d / 1500) * 100);

  return (
    <div className="card c5r5">
      <div className="card-accent" style={{ background:"var(--p)" }}/>
      <div className="ch">
        <div className="ct">RabbitMQ Queues</div>
        <span className="tag tp">{qs.filter(q=>q.status!=="ok").length} WARN</span>
      </div>
      <div className="scrl">
        {qs.map(q => (
          <div className="q-row" key={q.name}>
            <div style={{ display:"flex", flexDirection:"column", gap:3, flex:1, minWidth:0 }}>
              <span className="q-name">{q.name}</span>
              <div className="q-bar">
                <div className="q-fill" style={{ width:`${depthW(q.depth)}%`, background:depthColor(q.depth, q.status) }}/>
              </div>
            </div>
            <span className="q-depth" style={{ color:depthColor(q.depth, q.status) }}>{q.depth}</span>
            <span style={{ fontFamily:"var(--mono)", fontSize:7, color:"var(--t3)", width:36, textAlign:"right" }}>
              {q.rate}/s
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── INCIDENTS ─── */
function IncidentsCard() {
  const sevCol = { critical:"var(--r)", warning:"var(--a)", info:"var(--bl)" };
  const sevBg  = { critical:"var(--rd)", warning:"var(--ad)", info:"var(--bld)" };

  return (
    <div className="card c12r5">
      <div className="card-accent" style={{ background:"var(--r)", animation:"alertBlink 2s step-end infinite" }}/>
      <div className="ch">
        <div className="ct" style={{ color:"var(--r)" }}>
          <span style={{ animation:"errBlink 1s step-end infinite" }}>●</span> Incidents
        </div>
        <div style={{ display:"flex", gap:4 }}>
          <span className="tag tr">{INCIDENTS.filter(i=>i.sev==="critical"&&i.status==="open").length} CRITICAL</span>
          <span className="tag ta">{INCIDENTS.filter(i=>i.sev==="warning"&&i.status==="open").length} WARNING</span>
          <span className="tag td">{INCIDENTS.filter(i=>i.status==="resolved").length} RESOLVED</span>
        </div>
      </div>
      <div className="scrl">
        {INCIDENTS.map(inc => (
          <div className="inc-row" key={inc.id}
            style={{ opacity: inc.status === "resolved" ? .45 : 1 }}>
            <div className="inc-sev" style={{ background:sevCol[inc.sev] }}/>
            <div className="inc-body">
              <div className="inc-title">{inc.title}</div>
              <div className="inc-desc">{inc.desc}</div>
            </div>
            <div className="inc-meta">
              <span className="inc-ago">{inc.ago} ago</span>
              <span className="tag" style={{ background:sevBg[inc.sev], color:sevCol[inc.sev], fontSize:7 }}>
                {inc.sev}
              </span>
              {inc.status === "resolved" && <span className="tag td" style={{ fontSize:7 }}>resolved</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── DB STATS ─── */
function DbStatsCard() {
  const [conns, setConns] = useState(14);
  const [rows, setRows]   = useState(31_468);
  useTicker(() => {
    setConns(c => Math.max(8, Math.min(20, c + rndI(-1, 2))));
    setRows(r  => r + rndI(0, 3));
  }, 2000);
  return (
    <div className="card c4r3">
      <div className="card-accent" style={{ background:"var(--cy)" }}/>
      <div className="ch"><div className="ct">PostgreSQL</div><span className="tag tg">healthy</span></div>
      <div className="cb" style={{ gap:6 }}>
        {[
          { l:"Connections", v:`${conns}/20`,   c:"var(--t0)" },
          { l:"Positions",   v:rows.toLocaleString(), c:"var(--bl)" },
          { l:"Replication", v:"0ms lag",        c:"var(--g)" },
          { l:"Cache hit",   v:"99.4%",           c:"var(--g)" },
        ].map(r => (
          <div key={r.l} className="tinyrow">
            <span className="sub">{r.l}</span>
            <span style={{ fontFamily:"var(--mono)", fontSize:9, color:r.c }}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── REDIS STATS ─── */
function RedisCard() {
  const [mem, setMem] = useState(68);
  useTicker(() => setMem(m => Math.max(40, Math.min(95, m + rnd(-.5,.5)))), 4000);
  return (
    <div className="card c4r2">
      <div className="card-accent" style={{ background:"var(--r)" }}/>
      <div className="ch"><div className="ct">Redis</div><span className="tag tg">healthy</span></div>
      <div className="cb" style={{ gap:4 }}>
        <div className="tinyrow">
          <span className="sub">Memory</span>
          <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--a)" }}>{mem.toFixed(0)}%</span>
        </div>
        <div className="pbar" style={{ height:3 }}>
          <div className="pfill" style={{ width:`${mem}%`, background: mem > 80 ? "var(--r)" : mem > 60 ? "var(--a)" : "var(--g)" }}/>
        </div>
        <div className="tinyrow">
          <span className="sub">Commands/s</span>
          <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--g)" }}>1,248</span>
        </div>
      </div>
    </div>
  );
}

/* ─── TRADES HEATMAP ─── */
function HeatmapCard() {
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, v: rnd(0, 100) }));
  const colForV = v => {
    if (v > 80) return "rgba(0,229,160,.8)";
    if (v > 60) return "rgba(0,229,160,.5)";
    if (v > 40) return "rgba(61,157,243,.5)";
    if (v > 20) return "rgba(245,166,35,.4)";
    return "rgba(255,71,87,.3)";
  };
  return (
    <div className="card c6r3">
      <div className="card-accent" style={{ background:"var(--g)" }}/>
      <div className="ch"><div className="ct">Trade Density — 24h Heatmap</div></div>
      <div className="heatmap">
        {hours.map(h => (
          <div key={h.h} className="hm-cell" style={{ background:colForV(h.v) }}
            title={`${h.h}:00 — ${h.v.toFixed(0)} trades`}/>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", padding:"0 8px 6px", fontFamily:"var(--mono)", fontSize:7, color:"var(--t3)" }}>
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
      </div>
    </div>
  );
}

/* ─── EXCHANGE STATUS ─── */
function ExchangeCard() {
  const exchanges = [
    { name:"Binance",  status:"healthy",  lat:18, vol:"$3.1M", pairs:23 },
    { name:"Bybit",    status:"healthy",  lat:31, vol:"$1.4M", pairs:12 },
    { name:"Alpaca",   status:"degraded", lat:184, vol:"$280K", pairs:4  },
    { name:"Testnet",  status:"healthy",  lat:9,  vol:"N/A",   pairs:8  },
  ];
  return (
    <div className="card c6r3">
      <div className="card-accent" style={{ background:"var(--a)" }}/>
      <div className="ch">
        <div className="ct">Exchange Adapters</div>
        <span className="tag ta">1 DEGRADED</span>
      </div>
      <div className="scrl">
        {exchanges.map(ex => (
          <div key={ex.name} style={{ display:"flex", alignItems:"center", gap:7,
            padding:"6px 8px", borderBottom:"1px solid var(--b1)", fontFamily:"var(--mono)" }}>
            <span className={`sdot ${ex.status}`}/>
            <span style={{ fontSize:10, color:"var(--t0)", fontWeight:600, width:64, flexShrink:0 }}>{ex.name}</span>
            <span style={{ fontSize:8, color: ex.lat > 100 ? "var(--r)" : "var(--t2)" }}>{ex.lat}ms</span>
            <span style={{ fontSize:8, color:"var(--t2)", flex:1, textAlign:"right" }}>{ex.vol}</span>
            <span style={{ fontSize:8, color:"var(--t3)", width:36, textAlign:"right" }}>{ex.pairs}p</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── UPTIME STRIP ─── */
function UptimeCard() {
  const bars = Array.from({ length: 60 }, (_, i) => ({
    ok: i < 55 || (i === 57)
  }));
  return (
    <div className="card c5r2">
      <div className="card-accent" style={{ background:"var(--g)" }}/>
      <div className="ch">
        <div className="ct">Platform Uptime</div>
        <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--g)", fontWeight:600 }}>99.94%</span>
      </div>
      <div className="cb" style={{ justifyContent:"center", gap:6 }}>
        <div style={{ display:"flex", gap:2, alignItems:"flex-end", height:18 }}>
          {bars.map((b, i) => (
            <div key={i} style={{
              width:4, borderRadius:1,
              height: b.ok ? `${rndI(60,100)}%` : "40%",
              background: b.ok ? "var(--g)" : "var(--r)",
              opacity: b.ok ? (.5 + (i/bars.length)*.5) : 1,
              flexShrink:0,
            }}/>
          ))}
        </div>
        <div className="sub" style={{ fontSize:7 }}>Last 30 days — 2 incidents</div>
      </div>
    </div>
  );
}

/* ─── KYC QUEUE ─── */
function KycCard() {
  return (
    <div className="card c4r2">
      <div className="card-accent" style={{ background:"var(--bl)" }}/>
      <div className="ch"><div className="ct">KYC Queue</div><span className="tag tb">3 PENDING</span></div>
      <div className="cb" style={{ gap:4 }}>
        {[
          { l:"Pending review", v:3,  c:"var(--a)" },
          { l:"Approved today", v:12, c:"var(--g)" },
          { l:"Rejected today", v:2,  c:"var(--r)" },
        ].map(r => (
          <div key={r.l} className="tinyrow">
            <span className="sub">{r.l}</span>
            <span style={{ fontFamily:"var(--mono)", fontSize:11, fontWeight:600, color:r.c }}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── FAILED ORDERS ─── */
function FailedOrdersCard() {
  const [cnt, setCnt] = useState(3);
  useTicker(() => setCnt(c => Math.max(0, c + (Math.random() > .85 ? 1 : 0))), 5000);
  return (
    <div className="card c3r2" style={{ borderColor: cnt > 5 ? "rgba(255,71,87,.4)" : undefined }}>
      <div className="card-accent" style={{ background: cnt > 0 ? "var(--r)" : "var(--g)" }}/>
      <div className="ch"><div className="ct">Failed Orders</div></div>
      <div className="cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="bigval bv-lg" style={{ color: cnt > 0 ? "var(--r)" : "var(--g)", textAlign:"center" }}>{cnt}</div>
        <div className="sub" style={{ fontSize:7 }}>last 1h · {PLATFORM.totalTrades} total</div>
      </div>
    </div>
  );
}

/* ─── TRADES COUNTER ─── */
function TradesCard() {
  const [t, setT] = useState(PLATFORM.totalTrades);
  useTicker(() => setT(n => n + (Math.random() > .6 ? 1 : 0)), 1800);
  return (
    <div className="card c3r2">
      <div className="card-accent" style={{ background:"var(--p)" }}/>
      <div className="ch"><div className="ct">Trades Today</div></div>
      <div className="cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="bigval bv-lg" style={{ color:"var(--p)", textAlign:"center" }}>{t}</div>
        <div className="sub" style={{ fontSize:7 }}>across all bots</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ MAIN ═══════════════════════════════════════════ */
export default function MissionCritical() {
  const time = useTime();

  const hasAlerts = INCIDENTS.some(i => i.sev === "critical" && i.status === "open");

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">

        {/* ── TOP BAR ── */}
        <div className="topbar">
          <div className="logo">STELLA <span>⬡</span></div>
          <div className="topbar-tag">Mission Critical</div>
          <div className="tb-sep"/>
          <div className="topbar-tag">v1.0.0</div>
          {hasAlerts && (
            <>
              <div className="tb-sep"/>
              <div className="tb-alert"><span>⚠</span> 2 Critical Incidents Active</div>
            </>
          )}
          <div className="tb-sep"/>
          <div style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--t2)", display:"flex", gap:12 }}>
            {[
              { l:"Equity", v:`$${(EQ_NOW/1e6).toFixed(3)}M`, c:"var(--g)" },
              { l:"Active Bots", v:`${BOTS.filter(b=>b.status==="running").length}/${BOTS.length}`, c:"var(--t0)" },
              { l:"Open Pos", v:PLATFORM.openPos, c:"var(--a)" },
            ].map(s => (
              <span key={s.l}>{s.l}: <span style={{ color:s.c, fontWeight:600 }}>{s.v}</span></span>
            ))}
          </div>
          <div className="topbar-live">
            <span className="pulse"/>
            LIVE
          </div>
          <div className="tb-sep"/>
          <div className="tb-time">{time}</div>
        </div>

        {/* ── GRID ── */}
        <div className="canvas">
          <div className="grid">

            {/* ── ROW 1: KEY METRICS ── */}
            <EquityCard />
            <PnlCard />
            <WinRateCard />
            <ActiveBotsCard />
            <OpenPosCard />
            <CircuitBreakerCard />
            <VolumeCard />

            {/* ── ROW 2: BOT FLEET + LIVE ORDERS ── */}
            <BotFleetCard />
            <LiveOrdersFeed />
            <TradesCard />
            <FailedOrdersCard />
            <KycCard />

            {/* ── ROW 3: EQUITY CHART + LATENCY ── */}
            <EquityChartCard />
            <LatencyCard />

            {/* ── ROW 4: SERVICES + QUEUES + INCIDENTS ── */}
            <ServicesCard />
            <QueuesCard />
            <IncidentsCard />

            {/* ── ROW 5: DB + REDIS + HEATMAP + EXCHANGE + UPTIME ── */}
            <DbStatsCard />
            <RedisCard />
            <HeatmapCard />
            <ExchangeCard />
            <UptimeCard />

          </div>
        </div>
      </div>
    </>
  );
}
