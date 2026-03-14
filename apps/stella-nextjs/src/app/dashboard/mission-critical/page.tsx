"use client";

import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { listBots, getInfraMetrics, getServiceHealth, getExchangeHealth, listServiceAccounts, listServiceAccountCredentials, listAdapters, getCredentialBalance, getCredentialPositions, closeAllCredentialPositions, closeCredentialPosition, getRecentOrders, getPlatformEquityCurve, getAllCapitalAllocations, getSystemAlerts, getOpenIncidents, acknowledgeSystemAlert, pauseBot, startBot, stopBot, stopTrading, resolveIncident } from "@/lib/tradingEngineApi";
import { useRouter } from "next/navigation";
import { TrainingProvider, useTraining } from "@/lib/training/TrainingContext";
import { getInfrastructureStatus } from "@/lib/stellaAdminApi";
import { useBotChannel, useInfraChannel, useAlertChannel, usePlatformChannel, useOrderChannel } from "@/hooks/usePhoenixChannel";
import { mapApiBotToUiBot, mapWsAlertToUiAlert, mapWsInfraToTradeEngineMetrics } from "@/lib/api/mappers";
import type { Bot, TradeEngineMetrics, Alert } from "@/lib/types/dashboard";
import ReconciliationModal from "@/components/dashboard/ReconciliationModal";
import { TokenIcon } from "@web3icons/react/dynamic";

/* ─────────────────────────── FONTS & BASE ────────────────────────────────── */
const FONT = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');`;

/* ─────────────────────────── HELPERS ────────────────────────────────────── */
const fmtK = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : n.toFixed(0);

function sparkline(n = 24, base = 100, vol = 0.04, seed = 42) {
  // Deterministic pseudo-random to avoid hydration mismatch (no Math.random)
  let s = seed;
  const nextRand = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  let v = base;
  return Array.from({ length: n }, (_, i) => {
    v += (nextRand() - 0.47) * vol * v;
    return { i, v: +v.toFixed(2) };
  });
}

/* ─────────────────────────── DATA ──────────────────────────────────────── */


/* ═══════════════════════════ CSS ════════════════════════════════════════════ */
const CSS = `
${FONT}
.mc *, .mc *::before, .mc *::after { box-sizing: border-box; margin: 0; padding: 0; }
.mc {
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
  color: var(--t0);
  font-family: var(--sans);
}

/* ── SCROLLBARS ── */
.mc ::-webkit-scrollbar { width: 3px; height: 3px; }
.mc ::-webkit-scrollbar-track { background: transparent; }
.mc ::-webkit-scrollbar-thumb { background: var(--b2); border-radius: 2px; }

/* ── SHELL ── */
.mc-shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: var(--bg0); }

/* ── TOP BAR ── */
.mc-topbar {
  display: flex; align-items: center; padding: 0 16px;
  height: 44px; flex-shrink: 0;
  background: var(--bg1); border-bottom: 1px solid var(--b1);
  gap: 12px; position: relative; z-index: 30;
}
.mc-logo { font-family: var(--mono); font-size: 14px; font-weight: 700; color: var(--t0); letter-spacing: .06em; }
.mc-logo span { color: var(--g); }
.mc-topbar-tag { font-family: var(--mono); font-size: 8px; text-transform: uppercase; letter-spacing: .14em;
  color: var(--t2); padding: 2px 7px; border: 1px solid var(--b2); border-radius: 2px; }
.mc-topbar-live { display: flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 9px;
  color: var(--g); margin-left: auto; }
.mc-pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--g);
  animation: mcPulseAnim 1.6s ease-in-out infinite; }
@keyframes mcPulseAnim { 0%,100%{ opacity:1; box-shadow: 0 0 0 0 rgba(0,229,160,.5); }
  50%{ opacity:.7; box-shadow: 0 0 0 5px rgba(0,229,160,0); } }
.mc-tb-sep { width: 1px; height: 22px; background: var(--b1); }
.mc-tb-time { font-family: var(--mono); font-size: 11px; color: var(--t1); }
.mc-tb-alert { display: flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 9px;
  color: var(--r); padding: 3px 8px; background: var(--rd); border: 1px solid rgba(255,71,87,.25);
  border-radius: 2px; animation: mcAlertBlink 2s step-end infinite; }
@keyframes mcAlertBlink { 0%,100%{ opacity:1; } 50%{ opacity:.55; } }

/* ── GRID CANVAS ── */
.mc-canvas { flex: 1; overflow: hidden; padding: 10px; display: flex; gap: 0; }
.mc-main-layout {
  display: flex;
  gap: 6px;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.mc-left {
  flex: 1;
  min-width: 0;
}
.mc-grid-left {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  grid-auto-rows: 56px;
  gap: 6px;
  min-width: 0;
}
.mc-right {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mc-right > .mc-card:first-child {
  flex: none;
  height: 260px;
  min-height: 260px;
}
.mc-right > .mc-card:last-child {
  flex: 1;
  min-height: 200px;
}

/* ── CARD ── */
.mc-card {
  background: var(--bg2); border: 1px solid var(--b1); border-radius: 5px;
  overflow: hidden; position: relative; display: flex; flex-direction: column;
  transition: border-color .15s;
}
.mc-card:hover { border-color: var(--b2); }
.mc-card-accent { position: absolute; top: 0; left: 0; right: 0; height: 2px; }

/* card grid spans */
.mc-c2r1  { grid-column: span 2;  grid-row: span 1; }
.mc-c3r1  { grid-column: span 3;  grid-row: span 1; }
.mc-c3r2  { grid-column: span 3;  grid-row: span 2; }
.mc-c3r3  { grid-column: span 3;  grid-row: span 3; }
.mc-c4r2  { grid-column: span 4;  grid-row: span 2; }
.mc-c4r3  { grid-column: span 4;  grid-row: span 3; }
.mc-c4r4  { grid-column: span 4;  grid-row: span 4; }
.mc-c5r2  { grid-column: span 5;  grid-row: span 2; }
.mc-c5r3  { grid-column: span 5;  grid-row: span 3; }
.mc-c5r4  { grid-column: span 5;  grid-row: span 4; }
.mc-c5r5  { grid-column: span 5;  grid-row: span 5; }
.mc-c6r2  { grid-column: span 6;  grid-row: span 2; }
.mc-c6r3  { grid-column: span 6;  grid-row: span 3; }
.mc-c6r4  { grid-column: span 6;  grid-row: span 4; }
.mc-c6r5  { grid-column: span 6;  grid-row: span 5; }
.mc-c7r3  { grid-column: span 7;  grid-row: span 3; }
.mc-c7r4  { grid-column: span 7;  grid-row: span 4; }
.mc-c7r5  { grid-column: span 7;  grid-row: span 5; }
.mc-c8r3  { grid-column: span 8;  grid-row: span 3; }
.mc-c8r4  { grid-column: span 8;  grid-row: span 4; }
.mc-c8r5  { grid-column: span 8;  grid-row: span 5; }
.mc-c9r4  { grid-column: span 9;  grid-row: span 4; }
.mc-c10r3 { grid-column: span 10; grid-row: span 3; }
.mc-c10r4 { grid-column: span 10; grid-row: span 4; }
.mc-c10r5 { grid-column: span 10; grid-row: span 5; }
.mc-c12r3 { grid-column: span 12; grid-row: span 3; }
.mc-c12r4 { grid-column: span 12; grid-row: span 4; }
.mc-c12r5 { grid-column: span 12; grid-row: span 5; }
.mc-c14r4 { grid-column: span 14; grid-row: span 4; }
.mc-c16r4 { grid-column: span 16; grid-row: span 4; }
.mc-c24r4 { grid-column: span 24; grid-row: span 4; }

/* ── CARD INNER ── */
.mc-ch { padding: 7px 10px 5px; border-bottom: 1px solid var(--b1); display: flex;
  align-items: center; justify-content: space-between; flex-shrink: 0; }
.mc-ct { font-family: var(--mono); font-size: 8px; text-transform: uppercase;
  letter-spacing: .12em; color: var(--t2); display: flex; align-items: center; gap: 6px; }
.mc-cb { flex: 1; padding: 8px 10px; overflow: hidden; display: flex; flex-direction: column; gap: 4px; }
.mc-cb.mc-np { padding: 0; }

/* ── BIG VALUE ── */
.mc-bigval { font-family: var(--mono); font-weight: 700; line-height: 1; }
.mc-bv-xs  { font-size: 13px; }
.mc-bv-sm  { font-size: 17px; }
.mc-bv-md  { font-size: 22px; }
.mc-bv-lg  { font-size: 28px; }
.mc-bv-xl  { font-size: 36px; }
.mc-sub    { font-family: var(--mono); font-size: 8px; color: var(--t2); margin-top: 2px; }
.mc-subb   { font-family: var(--mono); font-size: 8px; margin-top: 1px; }

/* ── TAGS ── */
.mc-tag { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 2px;
  font-family: var(--mono); font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.mc-tg { background: var(--gd); color: var(--g); }
.mc-ta { background: var(--ad); color: var(--a); }
.mc-tr { background: var(--rd); color: var(--r); }
.mc-tb { background: var(--bld); color: var(--bl); }
.mc-tp { background: var(--pd);  color: var(--p);  }
.mc-tcy{ background: var(--cyd); color: var(--cy); }
.mc-td { background: var(--bg3); color: var(--t1); border: 1px solid var(--b2); }

/* ── STATUS DOT ── */
.mc-sdot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.mc-sdot.mc-running { background: var(--g); box-shadow: 0 0 0 2px rgba(0,229,160,.25); animation: mcPulseAnim 2s infinite; }
.mc-sdot.mc-paused  { background: var(--a); }
.mc-sdot.mc-error   { background: var(--r); animation: mcErrBlink 1s step-end infinite; }
.mc-sdot.mc-stopped { background: var(--t2); }
.mc-sdot.mc-healthy  { background: var(--g); }
.mc-sdot.mc-degraded { background: var(--a); }
.mc-sdot.mc-down     { background: var(--r); }
@keyframes mcErrBlink { 0%,100%{ opacity:1; } 50%{ opacity:.3; } }

/* ── GAUGE (SVG arc) ── */
.mc-gauge-wrap { display: flex; align-items: center; justify-content: center; flex: 1; }

/* ── BOT ROW ── */
.mc-bot-row { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  border-bottom: 1px solid var(--b1); font-family: var(--mono); }
.mc-bot-row:last-child { border-bottom: none; }
.mc-bot-row:hover { background: rgba(255,255,255,.02); }
.mc-bot-name { font-size: 9px; color: var(--t0); font-weight: 600; width: 72px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-bot-pair { font-size: 8px; color: var(--t2); width: 56px; flex-shrink: 0; }
.mc-bot-pnl  { font-size: 10px; font-weight: 600; width: 58px; flex-shrink: 0; text-align: right; }
.mc-bot-spark{ flex: 1; height: 22px; min-width: 0; }

/* ── SERVICE ROW ── */
.mc-svc-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px;
  border-bottom: 1px solid var(--b1); font-family: var(--mono); }
.mc-svc-row:last-child { border-bottom: none; }
.mc-svc-name { font-size: 9px; color: var(--t0); font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-svc-lat  { font-size: 9px; color: var(--t2); width: 40px; text-align: right; }
.mc-svc-bar  { width: 48px; height: 3px; background: var(--bg4); border-radius: 2px; overflow: hidden; }
.mc-svc-fill { height: 100%; border-radius: 2px; }

/* ── ORDER ROW ── */
.mc-ord-row { display: grid; grid-template-columns: 60px 52px 56px 1fr 48px;
  gap: 4px; padding: 4px 8px; border-bottom: 1px solid var(--b1);
  font-family: var(--mono); font-size: 9px; align-items: center; }
.mc-ord-row:last-child { border-bottom: none; }
.mc-ord-row:hover { background: rgba(255,255,255,.02); }

/* ── QUEUE ROW ── */
.mc-q-row { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  border-bottom: 1px solid var(--b1); font-family: var(--mono); font-size: 9px; }
.mc-q-row:last-child { border-bottom: none; }
.mc-q-name { color: var(--t2); flex: 1; font-size: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-q-depth { width: 40px; text-align: right; font-weight: 600; }
.mc-q-bar { width: 60px; height: 4px; background: var(--bg4); border-radius: 2px; overflow: hidden; }
.mc-q-fill { height: 100%; border-radius: 2px; transition: width .3s; }

/* ── INCIDENT ROW ── */
.mc-inc-row { display: flex; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--b1);
  cursor: pointer; }
.mc-inc-row:last-child { border-bottom: none; }
.mc-inc-row:hover { background: rgba(255,255,255,.02); }
.mc-inc-sev { width: 3px; border-radius: 2px; flex-shrink: 0; align-self: stretch; }
.mc-inc-body { flex: 1; min-width: 0; }
.mc-inc-title { font-family: var(--mono); font-size: 9px; color: var(--t0); font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
.mc-inc-desc  { font-family: var(--mono); font-size: 8px; color: var(--t2); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.mc-inc-meta  { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.mc-inc-ago   { font-family: var(--mono); font-size: 8px; color: var(--t3); }

/* ── PROGRESS BAR ── */
.mc-pbar { height: 4px; background: var(--bg4); border-radius: 2px; overflow: hidden; }
.mc-pfill { height: 100%; border-radius: 2px; }

/* ── DONUT RING ── */
.mc-donut-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
.mc-donut-label { position: absolute; text-align: center; }

/* ── GRID LINES ── */
.mc-gl-x text, .mc-gl-y text { display: none; }

/* ── SECTION LABEL ── */
.mc-sect-lbl { font-family: var(--mono); font-size: 7px; text-transform: uppercase;
  letter-spacing: .2em; color: var(--t3); padding: 0 2px 3px; grid-column: span 24;
  border-bottom: 1px solid var(--b1); margin-bottom: 0; }

/* ── TINY ROW ── */
.mc-tinyrow { display: flex; justify-content: space-between; align-items: center; }
.mc-tinyrow + .mc-tinyrow { margin-top: 3px; }

/* ── TWO COL ── */
.mc-two-col { display: flex; gap: 8px; }
.mc-two-col > * { flex: 1; }

/* ── STAT PILL ── */
.mc-stat-pill { background: var(--bg3); border: 1px solid var(--b1); border-radius: 3px;
  padding: 4px 7px; display: flex; flex-direction: column; gap: 2px; }
.mc-sp-lbl { font-family: var(--mono); font-size: 7px; text-transform: uppercase;
  letter-spacing: .1em; color: var(--t2); }
.mc-sp-val { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--t0); }

/* ── ANIMATED COUNT ── */
@keyframes mcCountUp { from{ opacity:0; transform:translateY(4px); } to{ opacity:1; transform:none; } }
.mc-count-anim { animation: mcCountUp .4s ease-out both; }

/* ── HEATMAP ── */
/* ── CAPITAL ALLOCATION ── */
.mc-cap-bar { display: flex; height: 16px; border-radius: 3px; overflow: hidden; margin: 0 8px; }
.mc-cap-bar > div { transition: width .3s; }
.mc-cap-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-bottom: 1px solid var(--b1); font-family: var(--mono); }
.mc-cap-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }

/* ── EXCHANGE TILES ── */
.mc-ex-grid { display: grid; grid-template-columns: 1fr; gap: 6px; padding: 8px; flex: 1; align-content: start; }
.mc-ex-tile { background: var(--bg3); border: 1px solid var(--b1); border-radius: 4px; padding: 8px 10px; border-left: 3px solid; transition: border-color .2s; }

/* ── CIRCUIT BREAKER CARD ── */
.mc-cb-active { background: linear-gradient(135deg, rgba(255,71,87,.08), rgba(255,71,87,.03));
  border-color: rgba(255,71,87,.35) !important; }

/* ─── SCROLLABLE INNER ── */
.mc-scrl { overflow-y: auto; flex: 1; }

/* ── EXPLICIT GRID PLACEMENT ── */
.mc-grid-left .mc-exchange-card   { grid-column: 1 / 11;  grid-row: 1 / 7; }
.mc-grid-left .mc-pnl-card        { grid-column: 11 / 14; grid-row: 1 / 3; }
.mc-grid-left .mc-winrate-card    { grid-column: 14 / 17; grid-row: 1 / 3; }
.mc-grid-left .mc-activebots-card { grid-column: 11 / 14; grid-row: 3 / 5; }
.mc-grid-left .mc-openpos-card    { grid-column: 14 / 17; grid-row: 3 / 5; }
.mc-grid-left .mc-circuit-card    { grid-column: 11 / 14; grid-row: 5 / 7; }
.mc-grid-left .mc-volume-card     { grid-column: 14 / 17; grid-row: 5 / 7; }
.mc-grid-left .mc-trades-card     { grid-column: 1 / 4;   grid-row: 7 / 9; }
.mc-grid-left .mc-failed-card     { grid-column: 4 / 7;   grid-row: 7 / 9; }
.mc-grid-left .mc-fillrate-card    { grid-column: 7 / 9;   grid-row: 7 / 9; }
.mc-grid-left .mc-sharpe-card     { grid-column: 9 / 11;  grid-row: 7 / 9; }
.mc-grid-left .mc-drawdown-card   { grid-column: 11 / 13; grid-row: 7 / 9; }
.mc-grid-left .mc-avgexec-card    { grid-column: 13 / 15; grid-row: 7 / 9; }
.mc-grid-left .mc-profitfactor-card { grid-column: 15 / 17; grid-row: 7 / 9; }
.mc-grid-left .mc-orders-card     { grid-column: 1 / 11;  grid-row: 9 / 14; }
.mc-grid-left .mc-equity-card     { grid-column: 11 / 17; grid-row: 9 / 14; }
.mc-grid-left .mc-latency-card    { grid-column: 1 / 10;  grid-row: 14 / 18; }
.mc-grid-left .mc-capital-card    { grid-column: 10 / 17; grid-row: 14 / 18; }
.mc-grid-left .mc-services-card   { grid-column: 1 / 10;  grid-row: 18 / 22; }
.mc-grid-left .mc-uptime-card     { grid-column: 10 / 17; grid-row: 18 / 22; }
.mc-grid-left .mc-recon-card      { grid-column: 1 / 4;   grid-row: 22 / 24; }
.mc-grid-left .mc-corr-card       { grid-column: 4 / 7;   grid-row: 22 / 24; }
.mc-grid-left .mc-cred-card       { grid-column: 7 / 10;  grid-row: 22 / 24; }
.mc-grid-left .mc-exhealth-card   { grid-column: 10 / 13; grid-row: 22 / 24; }
.mc-grid-left .mc-fills-card      { grid-column: 13 / 17; grid-row: 22 / 24; }

/* ── EXCHANGE CAROUSEL ── */
.mc-ex-carousel { position: relative; flex: 1; overflow: hidden; }
.mc-ex-track { display: flex; transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); height: 100%; }
.mc-ex-slide { min-width: 100%; height: 100%; display: flex; flex-direction: column; padding: 10px; box-sizing: border-box; }
.mc-ex-dots { display: flex; gap: 6px; justify-content: center; padding: 6px 0; }
.mc-ex-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--b2); border: none; cursor: pointer; padding: 0; transition: background 0.2s, transform 0.2s; }
.mc-ex-dot.active { background: var(--g); transform: scale(1.3); }
.mc-ex-nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); border: 1px solid var(--b2); border-radius: 3px; color: var(--t1); cursor: pointer; font-size: 14px; padding: 8px 4px; z-index: 2; backdrop-filter: blur(4px); transition: background 0.2s; }
.mc-ex-nav:hover { background: rgba(0,0,0,0.8); }
.mc-ex-nav.prev { left: 4px; }
.mc-ex-nav.next { right: 4px; }
.mc-ex-wallet-big { font-family: var(--mono); font-size: 28px; font-weight: 700; letter-spacing: -0.5px; line-height: 1; }
.mc-ex-wallet-avail { font-family: var(--mono); font-size: 18px; font-weight: 600; margin-top: 4px; }
.mc-ex-wallet-pnl { font-family: var(--mono); font-size: 16px; font-weight: 600; margin-top: 3px; }
.mc-ex-info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; margin-top: 8px; }
.mc-ex-actions { display: flex; gap: 6px; padding-top: 8px; border-top: 1px solid var(--b2); justify-content: flex-start; flex-wrap: wrap; }
.mc-ex-actions button { flex: 0 0 auto !important; min-width: 90px; max-width: 140px; }
.mc-ex-asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; margin-top: 10px; flex: 1; align-content: start; }
.mc-ex-asset-card { background: var(--bg2); border: 1px solid var(--b2); border-radius: 4px; padding: 8px 10px; display: flex; align-items: center; gap: 8px; }
.mc-ex-asset-icon { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 9px; font-weight: 700; color: #fff; flex-shrink: 0; }
.mc-ex-asset-info { flex: 1; min-width: 0; }
.mc-ex-asset-name { font-family: var(--mono); font-size: 10px; font-weight: 700; color: var(--t0); }
.mc-ex-asset-bal { font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--t1); margin-top: 1px; }

/* ── TOPBAR RESPONSIVE HELPERS ── */
.mc-tb-stats { font-family: var(--mono); font-size: 8px; color: var(--t2); display: flex; gap: 12px; }
.mc-tb-version { display: inline-flex; }

/* ═══════════════════════════ RESPONSIVE ════════════════════════════════════ */

/* ── TABLET: <= 1200px ── */
@media (max-width: 1200px) {
  .mc-main-layout { flex-direction: column; }
  .mc-right { width: 100%; flex-direction: row; }
  .mc-right > .mc-card:first-child { height: auto; min-height: 200px; flex: none; }
  .mc-right > .mc-card:last-child { min-height: 240px; flex: 1; }

  .mc-grid-left {
    grid-template-columns: repeat(8, 1fr);
    grid-auto-rows: 52px;
  }

  /* Reset all explicit placements to auto-flow in 8-col grid */
  .mc-grid-left .mc-exchange-card   { grid-column: 1 / 9;  grid-row: span 5; }
  .mc-grid-left .mc-pnl-card        { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-winrate-card    { grid-column: 3 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-activebots-card { grid-column: 5 / 7;  grid-row: span 2; }
  .mc-grid-left .mc-openpos-card    { grid-column: 7 / 9;  grid-row: span 2; }
  .mc-grid-left .mc-circuit-card    { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-volume-card     { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-trades-card     { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-failed-card     { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-fillrate-card   { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-sharpe-card     { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-drawdown-card   { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-avgexec-card    { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-profitfactor-card { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-orders-card     { grid-column: 1 / 5;  grid-row: span 5; }
  .mc-grid-left .mc-equity-card     { grid-column: 5 / 9;  grid-row: span 5; }
  .mc-grid-left .mc-latency-card    { grid-column: 1 / 5;  grid-row: span 4; }
  .mc-grid-left .mc-capital-card    { grid-column: 5 / 9;  grid-row: span 4; }
  .mc-grid-left .mc-services-card   { grid-column: 1 / 5;  grid-row: span 4; }
  .mc-grid-left .mc-uptime-card     { grid-column: 5 / 9;  grid-row: span 4; }
  .mc-grid-left .mc-recon-card      { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-corr-card       { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-cred-card       { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-exhealth-card   { grid-column: span 2; grid-row: span 2; }
  .mc-grid-left .mc-fills-card      { grid-column: span 2; grid-row: span 2; }

  /* Topbar: hide less important items */
  .mc-tb-version { display: none; }
  .mc-tb-stats { gap: 8px; font-size: 7px; }
}

/* ── MOBILE: <= 768px ── */
@media (max-width: 768px) {
  .mc-shell { height: 100vh; height: 100dvh; }
  .mc-canvas { padding: 6px; }

  .mc-topbar { padding: 0 10px; gap: 8px; height: 40px; overflow-x: auto; }
  .mc-topbar-tag { font-size: 7px; }
  .mc-logo { font-size: 12px; }
  .mc-tb-stats { display: none; }
  .mc-tb-alert { font-size: 8px; padding: 2px 6px; }

  .mc-main-layout { flex-direction: column; gap: 6px; }
  .mc-right { width: 100%; flex-direction: column; }
  .mc-right > .mc-card:first-child { height: auto; min-height: 180px; flex: none; }
  .mc-right > .mc-card:last-child { min-height: 220px; flex: none; }

  .mc-grid-left {
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: 50px;
  }

  /* All cards flow in 4-col grid */
  .mc-grid-left .mc-exchange-card   { grid-column: 1 / 5;  grid-row: span 5; }
  .mc-grid-left .mc-pnl-card        { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-winrate-card    { grid-column: 3 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-activebots-card { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-openpos-card    { grid-column: 3 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-circuit-card    { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-volume-card     { grid-column: 3 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-trades-card     { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-failed-card     { grid-column: 3 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-fillrate-card   { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-sharpe-card     { grid-column: 3 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-drawdown-card   { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-avgexec-card    { grid-column: 3 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-profitfactor-card { grid-column: 1 / 5; grid-row: span 2; }
  .mc-grid-left .mc-orders-card     { grid-column: 1 / 5;  grid-row: span 5; }
  .mc-grid-left .mc-equity-card     { grid-column: 1 / 5;  grid-row: span 4; }
  .mc-grid-left .mc-latency-card    { grid-column: 1 / 5;  grid-row: span 4; }
  .mc-grid-left .mc-capital-card    { grid-column: 1 / 5;  grid-row: span 3; }
  .mc-grid-left .mc-services-card   { grid-column: 1 / 5;  grid-row: span 4; }
  .mc-grid-left .mc-uptime-card     { grid-column: 1 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-recon-card      { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-corr-card       { grid-column: 3 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-cred-card       { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-exhealth-card   { grid-column: 3 / 5;  grid-row: span 2; }
  .mc-grid-left .mc-fills-card      { grid-column: 1 / 5;  grid-row: span 2; }

  /* Scale down typography */
  .mc-bv-xl { font-size: 28px; }
  .mc-bv-lg { font-size: 22px; }
  .mc-bv-md { font-size: 18px; }

  .mc-ord-row { grid-template-columns: 50px 48px 44px 1fr 42px; font-size: 8px; }
}

/* ── SMALL MOBILE: <= 480px ── */
@media (max-width: 480px) {
  .mc-grid-left {
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: 48px;
  }

  .mc-grid-left .mc-exchange-card   { grid-column: 1 / 3;  grid-row: span 5; }
  .mc-grid-left .mc-pnl-card        { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-winrate-card    { grid-column: 1 / 2;  grid-row: span 2; }
  .mc-grid-left .mc-activebots-card { grid-column: 2 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-openpos-card    { grid-column: 1 / 2;  grid-row: span 2; }
  .mc-grid-left .mc-circuit-card    { grid-column: 2 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-volume-card     { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-trades-card     { grid-column: 1 / 2;  grid-row: span 2; }
  .mc-grid-left .mc-failed-card     { grid-column: 2 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-fillrate-card   { grid-column: 1 / 2;  grid-row: span 2; }
  .mc-grid-left .mc-sharpe-card     { grid-column: 2 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-drawdown-card   { grid-column: 1 / 2;  grid-row: span 2; }
  .mc-grid-left .mc-avgexec-card    { grid-column: 2 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-profitfactor-card { grid-column: 1 / 3; grid-row: span 2; }
  .mc-grid-left .mc-orders-card     { grid-column: 1 / 3;  grid-row: span 6; }
  .mc-grid-left .mc-equity-card     { grid-column: 1 / 3;  grid-row: span 4; }
  .mc-grid-left .mc-latency-card    { grid-column: 1 / 3;  grid-row: span 4; }
  .mc-grid-left .mc-capital-card    { grid-column: 1 / 3;  grid-row: span 3; }
  .mc-grid-left .mc-services-card   { grid-column: 1 / 3;  grid-row: span 5; }
  .mc-grid-left .mc-uptime-card     { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-recon-card      { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-corr-card       { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-cred-card       { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-exhealth-card   { grid-column: 1 / 3;  grid-row: span 2; }
  .mc-grid-left .mc-fills-card      { grid-column: 1 / 3;  grid-row: span 2; }

  .mc-right > .mc-card:first-child { min-height: 160px; }
  .mc-right > .mc-card:last-child { min-height: 200px; }
  .mc-bv-xl { font-size: 24px; }
  .mc-bv-lg { font-size: 18px; }

  .mc-topbar { gap: 6px; height: 38px; }
  .mc-logo { font-size: 11px; }
  .mc-tb-alert { display: none; }
  .mc-tb-time { font-size: 9px; }
}

/* ── TRAINING MODE ── */
.mc-training-banner {
  display: flex; align-items: center; gap: 8px; padding: 6px 16px;
  background: linear-gradient(90deg, rgba(245,166,35,.15) 0%, rgba(245,166,35,.05) 100%);
  border-bottom: 2px solid var(--a); font-family: var(--mono); font-size: 10px;
  color: var(--a); flex-shrink: 0;
}
.mc-training-banner .mc-trn-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  background: var(--a); color: var(--bg0); font-weight: 700; border-radius: 2px;
  font-size: 9px; letter-spacing: .12em; text-transform: uppercase;
  animation: mcTrainPulse 2s ease-in-out infinite;
}
@keyframes mcTrainPulse { 0%,100%{ opacity:1; } 50%{ opacity:.7; } }
.mc-training-toggle {
  display: flex; align-items: center; gap: 6px; padding: 2px 8px;
  font-family: var(--mono); font-size: 8px; color: var(--t2);
  cursor: pointer; border: 1px solid var(--b2); border-radius: 2px;
  background: var(--bg2); transition: all .15s;
}
.mc-training-toggle:hover { border-color: var(--a); color: var(--a); }
.mc-training-toggle.mc-trn-active { border-color: var(--a); color: var(--a); background: var(--ad); }
.mc-training-toggle .mc-trn-sw {
  width: 24px; height: 12px; border-radius: 6px; position: relative;
  background: var(--bg4); transition: background .15s;
}
.mc-training-toggle.mc-trn-active .mc-trn-sw { background: var(--a); }
.mc-training-toggle .mc-trn-sw::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 8px; height: 8px; border-radius: 50%; background: var(--t0);
  transition: transform .15s;
}
.mc-training-toggle.mc-trn-active .mc-trn-sw::after { transform: translateX(12px); }

/* Training panel (inline, flex column) */
.mc-trn-panel {
  width: 320px; flex-shrink: 0; height: 100%;
  background: var(--bg1); border-left: 2px solid var(--a);
  display: flex; flex-direction: column; overflow: hidden;
}
.mc-trn-panel-hdr {
  display: flex; align-items: center; gap: 8px; padding: 12px 16px;
  border-bottom: 1px solid var(--b1); background: var(--bg2);
}
.mc-trn-panel-title { font-family: var(--mono); font-size: 11px; font-weight: 700; color: var(--t0); flex: 1; }
.mc-trn-panel-close {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: var(--t2); cursor: pointer; border: none; background: none;
}
.mc-trn-panel-close:hover { color: var(--r); }
.mc-trn-panel-body { flex: 1; overflow-y: auto; padding: 12px 16px; }

/* Scenario selector */
.mc-trn-scenario {
  padding: 10px 12px; margin-bottom: 8px; border: 1px solid var(--b2);
  border-radius: 4px; cursor: pointer; transition: all .15s; background: var(--bg2);
}
.mc-trn-scenario:hover { border-color: var(--bl); background: var(--bg3); }
.mc-trn-scenario-name { font-family: var(--mono); font-size: 10px; font-weight: 600; color: var(--t0); margin-bottom: 2px; }
.mc-trn-scenario-desc { font-family: var(--mono); font-size: 8px; color: var(--t2); line-height: 1.4; }
.mc-trn-scenario-meta { display: flex; gap: 4px; margin-top: 4px; }

/* Narration box */
.mc-trn-narration {
  padding: 10px 12px; margin-bottom: 12px; border-radius: 4px;
  background: rgba(61,157,243,.08); border: 1px solid rgba(61,157,243,.2);
  font-family: var(--mono); font-size: 9px; color: var(--bl); line-height: 1.5;
  animation: mcNarFade .3s ease-out;
}
@keyframes mcNarFade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

/* Action checklist */
.mc-trn-action {
  display: flex; align-items: flex-start; gap: 8px; padding: 8px 0;
  border-bottom: 1px solid var(--b1);
}
.mc-trn-action:last-child { border-bottom: none; }
.mc-trn-action-check {
  width: 16px; height: 16px; border: 1px solid var(--b2); border-radius: 3px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  cursor: pointer; transition: all .15s; margin-top: 1px; background: var(--bg2);
  font-size: 10px; color: transparent;
}
.mc-trn-action-check:hover { border-color: var(--g); }
.mc-trn-action-check.mc-trn-done { background: var(--g); border-color: var(--g); color: var(--bg0); }
.mc-trn-action-label { font-family: var(--mono); font-size: 9px; color: var(--t0); font-weight: 500; margin-bottom: 2px; }
.mc-trn-action-detail { font-family: var(--mono); font-size: 8px; color: var(--t2); line-height: 1.4; }
.mc-trn-action-time { font-family: var(--mono); font-size: 7px; color: var(--t3); margin-top: 2px; }

/* Score display */
.mc-trn-score {
  text-align: center; padding: 16px; margin: 12px 0; border-radius: 4px;
  background: var(--bg2); border: 1px solid var(--b2);
}
.mc-trn-score-val { font-family: var(--mono); font-size: 28px; font-weight: 700; }
.mc-trn-score-label { font-family: var(--mono); font-size: 9px; color: var(--t2); margin-top: 4px; }

/* Debriefing */
.mc-trn-debrief {
  padding: 12px; margin-top: 12px; border-radius: 4px;
  background: rgba(0,229,160,.06); border: 1px solid rgba(0,229,160,.15);
  font-family: var(--mono); font-size: 9px; color: var(--g); line-height: 1.5;
}

/* Narration log */
.mc-trn-log-entry {
  padding: 6px 0; border-bottom: 1px solid var(--b1);
  font-family: var(--mono); font-size: 8px; color: var(--t2); line-height: 1.4;
}
.mc-trn-log-entry:last-child { border-bottom: none; }

/* Training badge on injected items */
.mc-trn-badge-inline {
  display: inline-block; padding: 0 4px; margin-left: 4px;
  font-family: var(--mono); font-size: 6px; font-weight: 700;
  color: var(--bg0); background: var(--a); border-radius: 2px;
  letter-spacing: .1em; vertical-align: middle;
}

/* ── Skeleton pulse animation ── */
@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
`;

/* ═══════════════════════════ COMPONENTS ════════════════════════════════════ */

function SvgArc({ pct, color, size = 60, stroke = 6 }: { pct: number; color: string; size?: number; stroke?: number }) {
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

function MiniSparkline({ data, color }: { data: { i: number; v: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function useTime() {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => {
    setT(new Date());
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : '--:--:--';
}

function useTicker(fn: () => void, ms: number) {
  useEffect(() => { const id = setInterval(fn, ms); return () => clearInterval(id); }, []);
}

/* ─── PLATFORM EQUITY CARD ─── */
function EquityCard({ equity, activeBots, curveData }: { equity: number; activeBots: number; curveData: { t: string; eq: number }[] }) {
  const eq = equity;
  const startEq = curveData.length > 0 ? curveData[0].eq : eq;
  const diff = eq - startEq;
  const up = diff >= 0;
  const hasCurve = curveData.length > 1;
  return (
    <div className="mc-card mc-equity-card" style={{ background: "linear-gradient(160deg, #101a28, #0e1620)" }}>
      <div className="mc-card-accent" style={{ background: up ? "var(--g)" : "var(--r)" }}/>
      <div className="mc-ch">
        <div className="mc-ct"><span style={{ color:"var(--t3)" }}>●</span> Platform Equity</div>
        <div className="mc-tag mc-tg">{hasCurve ? 'LIVE' : 'NOW'}</div>
      </div>
      <div className="mc-cb" style={{ justifyContent:"center" }}>
        <div className="mc-bigval mc-bv-xl mc-count-anim" style={{ color: "var(--t0)" }}>
          {eq >= 1_000_000
            ? <>${(eq/1_000_000).toFixed(3)}<span style={{ fontSize:14, color:"var(--t1)" }}>M</span></>
            : eq > 0
              ? <>${(eq/1000).toFixed(1)}<span style={{ fontSize:14, color:"var(--t1)" }}>k</span></>
              : '$--'}
        </div>
        {eq > 0 && startEq > 0 && (
          <div className="mc-subb" style={{ color: up ? "var(--g)" : "var(--r)", fontSize:10 }}>
            {up ? "\u25b2" : "\u25bc"} ${(Math.abs(diff)/1000).toFixed(1)}k
          </div>
        )}
        <div className="mc-sub">Total equity across {activeBots} active bot{activeBots !== 1 ? 's' : ''}</div>
      </div>
      <div style={{ height:44, background:"var(--bg1)", borderTop:"1px solid var(--b1)" }}>
        {hasCurve ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curveData} margin={{ top:4, right:0, bottom:0, left:0 }}>
              <defs>
                <linearGradient id="mc-eqg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={up ? "#00e5a0" : "#ff4757"} stopOpacity={.3}/>
                  <stop offset="95%" stopColor={up ? "#00e5a0" : "#ff4757"} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="eq" stroke={up ? "var(--g)" : "var(--r)"}
                strokeWidth={1.2} fill="url(#mc-eqg)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", fontFamily:"var(--mono)", fontSize:8, color:"var(--t3)" }}>
            No equity history yet
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 24H P&L CARD ─── */
function PnlCard({ pnl, equity }: { pnl: number; equity: number }) {
  const up = pnl >= 0;
  const pctOnCapital = equity > 0 ? ((pnl / equity) * 100).toFixed(2) : '0.00';
  return (
    <div className={`mc-card mc-pnl-card ${!up ? "mc-cb-active" : ""}`}>
      <div className="mc-card-accent" style={{ background: up ? "var(--g)" : "var(--r)" }}/>
      <div className="mc-ch">
        <div className="mc-ct">24h Realized P&L</div>
      </div>
      <div className="mc-cb" style={{ justifyContent:"center" }}>
        <div className="mc-bigval mc-bv-lg" style={{ color: up ? "var(--g)" : "var(--r)" }}>
          {pnl === 0 ? '$0' : `${up ? "+" : ""}$${(Math.abs(pnl)/1000).toFixed(1)}k`}
        </div>
        <div className="mc-sub">{pctOnCapital}% on deployed capital</div>
      </div>
    </div>
  );
}

/* ─── WIN RATE ─── */
function WinRateCard({ bots: botList }: { bots: Bot[] }) {
  const totalWins = botList.reduce((s, b) => s + b.winningTrades, 0);
  const totalLosses = botList.reduce((s, b) => s + b.losingTrades, 0);
  const totalTrades = totalWins + totalLosses;
  const wr = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  return (
    <div className="mc-card mc-winrate-card">
      <div className="mc-card-accent" style={{ background:"var(--bl)" }}/>
      <div className="mc-ch"><div className="mc-ct">Win Rate</div></div>
      <div className="mc-cb" style={{ alignItems:"center", justifyContent:"center", position:"relative" }}>
        <div className="mc-donut-wrap" style={{ width:64, height:64 }}>
          <SvgArc pct={wr} color="var(--bl)" size={64} stroke={7}/>
          <div className="mc-donut-label">
            <div style={{ fontFamily:"var(--mono)", fontSize:13, fontWeight:700, color:"var(--bl)" }}>{wr.toFixed(1)}%</div>
          </div>
        </div>
        <div className="mc-sub" style={{ textAlign:"center" }}>{totalWins} wins / {totalLosses} losses</div>
      </div>
    </div>
  );
}

/* ─── ACTIVE BOTS GAUGE ─── */
function ActiveBotsCard({ running, total }: { running: number; total: number }) {
  const pct = total > 0 ? (running / total) * 100 : 0;
  return (
    <div className="mc-card mc-activebots-card">
      <div className="mc-card-accent" style={{ background:"var(--g)" }}/>
      <div className="mc-ch"><div className="mc-ct">Bot Fleet</div></div>
      <div className="mc-cb" style={{ alignItems:"center", justifyContent:"center" }}>
        <div className="mc-donut-wrap" style={{ width:64, height:64 }}>
          <SvgArc pct={pct} color="var(--g)" size={64} stroke={7}/>
          <div className="mc-donut-label">
            <div style={{ fontFamily:"var(--mono)", fontSize:15, fontWeight:700, color:"var(--t0)", lineHeight:1 }}>{running}</div>
            <div style={{ fontFamily:"var(--mono)", fontSize:7, color:"var(--t2)" }}>/ {total}</div>
          </div>
        </div>
        <div className="mc-sub" style={{ textAlign:"center" }}>Active bots</div>
      </div>
    </div>
  );
}

/* ─── STAT MICRO CARDS ─── */
function MicroStat({ label, value, color, sub, accent }: { label: string; value: string; color: string; sub?: string; accent?: string }) {
  return (
    <div className="mc-card mc-c3r1" style={{ borderLeft: `2px solid ${accent || color}` }}>
      <div className="mc-cb" style={{ padding:"6px 10px", justifyContent:"center", gap:1 }}>
        <div className="mc-sub">{label}</div>
        <div className="mc-bigval mc-bv-sm" style={{ color }}>{value}</div>
        {sub && <div className="mc-sub" style={{ fontSize:7 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── OPEN POSITIONS ─── */
function OpenPosCard({ count, runningBots }: { count: number; runningBots: number }) {
  return (
    <div className="mc-card mc-openpos-card">
      <div className="mc-card-accent" style={{ background:"var(--a)" }}/>
      <div className="mc-ch"><div className="mc-ct">Open Positions</div></div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-xl" style={{ color:"var(--a)", textAlign:"center" }}>{count}</div>
        <div className="mc-sub">across {runningBots} bot{runningBots !== 1 ? 's' : ''}</div>
        <div style={{ marginTop:4, width:"100%" }}>
          <div className="mc-pbar" style={{ height:3 }}>
            <div className="mc-pfill" style={{ width:`${Math.min(100, (count/50)*100)}%`, background:"var(--a)" }}/>
          </div>
        </div>
        <div className="mc-sub" style={{ fontSize:7, marginTop:2 }}>{count}/50 position limit</div>
      </div>
    </div>
  );
}

/* ─── CIRCUIT BREAKER CARD (Platform-Level) ─── */
function CircuitBreakerCard({ bots: botList, platformStats }: { bots: Bot[], platformStats?: any }) {
  const cbBots = botList.filter(b => b.status === 'circuit_broken');
  const botLevel = cbBots.length;
  const platform = platformStats?.risk?.circuit_breaker;
  const platformTripped = platform?.tripped === true;
  const active = botLevel > 0 || platformTripped;
  const tripCount = platform?.trip_count ?? 0;

  return (
    <div className={`mc-card mc-circuit-card ${active ? 'mc-cb-active' : ''}`}>
      <div className="mc-card-accent" style={{ background: active ? "var(--r)" : "var(--g)" }}/>
      <div className="mc-ch">
        <div className="mc-ct" style={{ color: active ? "var(--r)" : undefined }}>Circuit Breakers</div>
        {active ? <div className="mc-tag mc-tr">ACTIVE</div> : <div className="mc-tag mc-tg">CLEAR</div>}
      </div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-xl" style={{ color: active ? "var(--r)" : "var(--g)", textAlign:"center", animation: active ? "mcErrBlink 1.5s step-end infinite" : undefined }}>
          {platformTripped ? 'TRIPPED' : botLevel > 0 ? botLevel : '0'}
        </div>
        <div className="mc-sub">
          {platformTripped
            ? `platform-level trip #${tripCount}`
            : botLevel > 0
              ? cbBots.map(b => b.id.slice(0,8)).join(', ')
              : 'no breakers triggered'}
        </div>
        {platform?.current?.aggregate_pnl != null && (
          <div className="mc-sub" style={{ fontSize: 7, marginTop: 2, color: 'var(--t2)' }}>
            agg P&L: ${platform.current.aggregate_pnl?.toFixed?.(2) ?? '0'} | {platform.current.losing_bots ?? 0}/{platform.current.total_bots ?? 0} losing
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── VOLUME 24H ─── */
function VolumeCard({ platformStats }: { platformStats: any }) {
  const vol = platformStats?.volume_24h ?? 0;
  const hasData = vol > 0;
  return (
    <div className="mc-card mc-volume-card">
      <div className="mc-card-accent" style={{ background:"var(--p)" }}/>
      <div className="mc-ch"><div className="mc-ct">24h Volume</div></div>
      <div className="mc-cb" style={{ justifyContent:"center" }}>
        <div className="mc-bigval mc-bv-md" style={{ color:"var(--p)" }}>
          {hasData ? (vol >= 1_000_000 ? `$${(vol/1e6).toFixed(2)}M` : `$${(vol/1000).toFixed(1)}k`) : '$0'}
        </div>
        <div className="mc-sub">{hasData ? 'across all exchanges' : 'no trading activity yet'}</div>
      </div>
    </div>
  );
}

/* ─── BOT FLEET TABLE ─── */
function BotFleetCard({ bots: botList, onPauseBot, onStartBot, onStopBot, onNavigate }: {
  bots: { id: string; fullId: string; name: string; status: string; exchange: string; pair: string; pnl: number; pct: number; trades: number; equity: number; spark: { i: number; v: number }[] }[];
  onPauseBot?: (botId: string) => void;
  onStartBot?: (botId: string) => void;
  onStopBot?: (botId: string) => void;
  onNavigate?: (path: string) => void;
}) {
  const scol: Record<string, string> = { running:"var(--g)", paused:"var(--a)", error:"var(--r)", stopped:"var(--t2)", circuit_broken:"var(--r)", initializing:"var(--bl)", stopping:"var(--a)", maintenance:"var(--a)" };
  const runningCount = botList.filter(b => b.status === "running").length;
  const btnStyle = (bg: string, fg: string, border: string): React.CSSProperties => ({
    fontFamily:"var(--mono)", fontSize:7, padding:"2px 3px", background:bg, color:fg,
    border:`1px solid ${border}`, borderRadius:2, cursor:"pointer", lineHeight:1, display:"flex",
    alignItems:"center", justifyContent:"center", width:18, height:16,
  });

  return (
    <div className="mc-card">
      <div className="mc-card-accent" style={{ background:"var(--g)" }}/>
      <div className="mc-ch">
        <div className="mc-ct" style={{ cursor: onNavigate ? "pointer" : undefined }} onClick={() => onNavigate?.("/dashboard/bot-fleet")}>
          <span className="mc-sdot mc-running"/>Bot Fleet &mdash; {runningCount} Running
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {(["running","paused","error","stopped"] as const).map(s => {
            const n = botList.filter(b => b.status === s).length;
            return n > 0 ? <span key={s} className="mc-tag" style={{ background:`${scol[s]}18`, color:scol[s] }}>{n} {s}</span> : null;
          })}
        </div>
      </div>
      <div className="mc-scrl">
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px",
          borderBottom:"1px solid var(--b1)", background:"var(--bg3)" }}>
          {["Bot","Pair","P&L","Eq.","","Actions"].map((h,i) => (
            <div key={i} className="mc-sub" style={{ fontSize:7,
              width:i===0?72:i===1?56:i===2?50:i===3?36:i===5?60:undefined, flex:i===4?1:undefined, flexShrink:0,
              textAlign:i===5?"center":undefined }}>{h}</div>
          ))}
        </div>
        {botList.length === 0 ? (
          <div style={{ padding: '16px 8px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t2)' }}>
            No bots configured
          </div>
        ) : botList.map(b => {
          const isRunning = b.status === "running";
          const isPaused = b.status === "paused";
          const isStopped = b.status === "stopped";
          const isError = b.status === "error" || b.status === "circuit_broken";
          const isTransitioning = b.status === "initializing" || b.status === "stopping";

          return (
            <div className="mc-bot-row" key={b.id}>
              <div style={{ display:"flex", alignItems:"center", gap:4, width:72, flexShrink:0, cursor:"pointer" }}
                onClick={() => onNavigate?.(`/dashboard/bot/${b.fullId}`)}>
                <span className={`mc-sdot mc-${b.status}`}/>
                <span className="mc-bot-name" style={{ borderBottom:"1px dashed var(--b2)" }}>{b.name}</span>
              </div>
              <span className="mc-bot-pair">{b.pair}</span>
              <span className="mc-bot-pnl" style={{ color: b.pnl >= 0 ? "var(--g)" : "var(--r)", width:50 }}>
                {b.pnl >= 0 ? "+" : ""}${b.pnl.toFixed(2)}
              </span>
              <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--t1)", width:36, flexShrink:0, textAlign:"right" }}>
                ${(b.equity/1000).toFixed(1)}k
              </span>
              <div className="mc-bot-spark">
                <MiniSparkline data={b.spark} color={b.pnl >= 0 ? "var(--g)" : "var(--r)"}/>
              </div>
              {/* Actions */}
              <div style={{ width: 60, flexShrink: 0, display: "flex", gap: 2, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                {/* Inspect */}
                <button onClick={() => onNavigate?.(`/dashboard/bot/${b.fullId}`)} title="Inspect"
                  style={btnStyle("var(--bld)","var(--bl)","var(--bl)")}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                {/* Start/Resume */}
                {(isStopped || isPaused || isError) && !isTransitioning && onStartBot && (
                  <button onClick={() => onStartBot(b.id)} title={isPaused ? "Resume" : "Start"}
                    style={btnStyle("var(--gd)","var(--g)","var(--g)")}>
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M5 3l14 9-14 9V3z"/></svg>
                  </button>
                )}
                {/* Pause */}
                {isRunning && onPauseBot && (
                  <button onClick={() => onPauseBot(b.id)} title="Pause"
                    style={btnStyle("var(--ad)","var(--a)","var(--a)")}>
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
                  </button>
                )}
                {/* Stop */}
                {(isRunning || isPaused) && onStopBot && (
                  <button onClick={() => onStopBot(b.id)} title="Stop"
                    style={btnStyle("var(--rd)","var(--r)","var(--r)")}>
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  </button>
                )}
                {/* Transitioning indicator */}
                {isTransitioning && (
                  <span style={{ fontFamily:"var(--mono)", fontSize:6, color:"var(--bl)" }}>
                    {b.status === "initializing" ? "starting" : "stopping"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── LIVE ORDERS FEED ─── */
function LiveOrdersFeed({ orders }: { orders: { id: string; bot: string; pair: string; side: string; price: string; qty: string; status: string; age: string; ts: string }[] }) {
  const sc: Record<string, string> = { filled:"mc-tg", cancelled:"mc-td", failed:"mc-tr", pending:"mc-tb", submitted:"mc-tb", open:"mc-tb", partially_filled:"mc-ta" };
  return (
    <div className="mc-card mc-orders-card">
      <div className="mc-card-accent" style={{ background:"var(--cy)" }}/>
      <div className="mc-ch">
        <div className="mc-ct"><span style={{ color:"var(--cy)" }}>●</span> Live Order Stream</div>
        <div className="mc-tag mc-tcy">{orders.length > 0 ? 'LIVE' : 'WAITING'}</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"60px 52px 56px 1fr 46px",
        gap:4, padding:"4px 8px", borderBottom:"1px solid var(--b1)", background:"var(--bg3)" }}>
        {["Bot","Pair","Side","Price","Status"].map(h => (
          <div key={h} className="mc-sub" style={{ fontSize:7 }}>{h}</div>
        ))}
      </div>
      <div className="mc-scrl">
        {orders.length === 0 ? (
          <div style={{ padding: '16px 8px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t2)' }}>
            No orders yet &mdash; will populate when bots trade
          </div>
        ) : orders.map((o, i) => (
          <div className="mc-ord-row" key={o.id + i} style={{ opacity: i < 3 ? 1 : .5 + i * .025 }}>
            <span style={{ color:"var(--t2)", fontSize:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.bot}</span>
            <span style={{ color:"var(--t0)", fontWeight:600 }}>{o.pair}</span>
            <span className={`mc-tag ${o.side === "buy" ? "mc-tg" : "mc-tr"}`} style={{ fontSize:7 }}>{o.side.toUpperCase()}</span>
            <span style={{ color:"var(--t1)" }}>{o.price}</span>
            <span className={`mc-tag ${sc[o.status] || "mc-td"}`} style={{ fontSize:7 }}>{o.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── LATENCY CHART ─── */
function LatencyCard({ infraMetrics, latencyData }: { infraMetrics: TradeEngineMetrics | null; latencyData: { t: number; v: number }[] }) {
  const uptimeSec = infraMetrics?.beam.uptimeSeconds ?? 0;
  const uptimeStr = uptimeSec > 0 ? `${Math.floor(uptimeSec / 86400)}d ${Math.floor((uptimeSec % 86400) / 3600)}h` : '--';
  const currentLatency = infraMetrics?.dbPool.latencyMs ?? 0;
  const hasData = latencyData.length > 0;
  return (
    <div className="mc-card mc-latency-card">
      <div className="mc-card-accent" style={{ background:"var(--a)" }}/>
      <div className="mc-ch">
        <div className="mc-ct">API Latency &mdash; Elixir Engine (ms)</div>
        <span className="mc-tag mc-ta">{infraMetrics ? `UP ${uptimeStr} | ${currentLatency.toFixed(0)}ms` : '--'}</span>
      </div>
      <div style={{ flex:1, background:"var(--bg1)" }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={latencyData} margin={{ top:8, right:10, bottom:8, left:0 }}>
              <defs>
                <linearGradient id="mc-latg" x1="0" y1="0" x2="0" y2="1">
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
                formatter={(v: any) => [`${v.toFixed(0)}ms`, "Latency"]}
                labelStyle={{ display:"none" }}/>
              <Area type="monotone" dataKey="v" stroke="var(--a)" strokeWidth={1.2}
                fill="url(#mc-latg)" dot={false} activeDot={{ r:3, fill:"var(--a)", strokeWidth:0 }}/>
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", color:"var(--t3)", fontSize:10, fontFamily:"var(--mono)", gap:4 }}>
            <span>Collecting latency data...</span>
            {infraMetrics && infraMetrics.dbPool.latencyMs === 0 && (
              <span style={{ fontSize:8 }}>Engine restart required for latency metrics</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── SERVICES HEALTH ─── */
function ServicesCard({ services: svcs }: { services: { name: string; status: string; lat: number; uptime: number; node: string }[] }) {
  const latColor = (ms: number) => ms < 50 ? "var(--g)" : ms < 150 ? "var(--a)" : "var(--r)";
  const latW     = (ms: number) => Math.min(100, (ms / 200) * 100);
  const degradedCount = svcs.filter(s => s.status === "degraded" || s.status === "down").length;

  return (
    <div className="mc-card mc-services-card">
      <div className="mc-card-accent" style={{ background:"var(--bl)" }}/>
      <div className="mc-ch">
        <div className="mc-ct">Service Health</div>
        <div style={{ display:"flex", gap:4 }}>
          <span className="mc-tag mc-tg">{svcs.filter(s=>s.status==="healthy").length} OK</span>
          {degradedCount > 0 && <span className="mc-tag mc-ta">{degradedCount} DEGRADED</span>}
        </div>
      </div>
      <div className="mc-scrl">
        {svcs.map(s => (
          <div className="mc-svc-row" key={s.name}>
            <span className={`mc-sdot mc-${s.status}`}/>
            <span className="mc-svc-name">{s.name}</span>
            <div className="mc-svc-bar">
              <div className="mc-svc-fill" style={{ width:`${latW(s.lat)}%`, background:latColor(s.lat) }}/>
            </div>
            <span className="mc-svc-lat" style={{ color:latColor(s.lat) }}>{s.lat}ms</span>
            <span style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--t3)", width:36, textAlign:"right", flexShrink:0 }}>
              {s.uptime}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── INCIDENTS (tabbed: Alerts + Incidents) ─── */
type IncidentItem = { id: string; sev: string; title: string; desc: string; ago: string; status: string };
type FormalIncident = { id: string; incident_number: string; priority: string; category: string; title: string; description: string; status: string; created_at: string; bot_ref?: string };

function IncidentsCard({ alerts, formalIncidents, onAckAlert, onResolveIncident }: {
  alerts: IncidentItem[];
  formalIncidents: FormalIncident[];
  onAckAlert?: (alertId: string) => void;
  onResolveIncident?: (incidentId: string) => void;
}) {
  const [tab, setTab] = useState<"alerts"|"incidents">("alerts");
  const sevCol: Record<string, string> = { critical:"var(--r)", warning:"var(--a)", info:"var(--bl)" };
  const sevBg: Record<string, string>  = { critical:"var(--rd)", warning:"var(--ad)", info:"var(--bld)" };
  const priCol: Record<string, string> = { P1:"var(--r)", P2:"var(--a)", P3:"var(--bl)", P4:"var(--t2)" };
  const priBg: Record<string, string>  = { P1:"var(--rd)", P2:"var(--ad)", P3:"var(--bld)", P4:"rgba(255,255,255,0.05)" };

  const hasCritical = alerts.some(i => i.sev === "critical" && i.status === "open");
  const hasP1 = formalIncidents.some(i => i.priority === "P1" && i.status === "open");
  const blinking = hasCritical || hasP1;

  const openIncidentCount = formalIncidents.filter(i => i.status === "open" || i.status === "escalated").length;
  const critAlertCount = alerts.filter(i => i.sev === "critical" && i.status === "open").length;

  function timeAgo(ts: string) {
    if (!ts) return "";
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="mc-card">
      <div className="mc-card-accent" style={{ background:"var(--r)", animation: blinking ? "mcAlertBlink 2s step-end infinite" : undefined }}/>
      <div className="mc-ch">
        <div className="mc-ct" style={{ color: blinking ? "var(--r)" : undefined }}>
          <span style={{ animation: blinking ? "mcErrBlink 1s step-end infinite" : undefined }}>●</span> Alerts &amp; Incidents
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {critAlertCount > 0 && <span className="mc-tag mc-tr">{critAlertCount} CRITICAL</span>}
          {openIncidentCount > 0 && <span className="mc-tag mc-ta">{openIncidentCount} OPEN</span>}
        </div>
      </div>
      {/* Tab bar */}
      <div style={{ display:"flex", gap:0, borderBottom:"1px solid rgba(255,255,255,0.06)", margin:"0 8px" }}>
        <button onClick={() => setTab("alerts")}
          style={{ flex:1, padding:"5px 0", fontFamily:"var(--mono)", fontSize:8, fontWeight:tab==="alerts"?600:400,
            color:tab==="alerts"?"var(--fg)":"var(--t2)", background:"none", border:"none", cursor:"pointer",
            borderBottom:tab==="alerts"?"2px solid var(--bl)":"2px solid transparent", textTransform:"uppercase", letterSpacing:1 }}>
          Alerts {alerts.length > 0 && `(${alerts.length})`}
        </button>
        <button onClick={() => setTab("incidents")}
          style={{ flex:1, padding:"5px 0", fontFamily:"var(--mono)", fontSize:8, fontWeight:tab==="incidents"?600:400,
            color:tab==="incidents"?"var(--fg)":"var(--t2)", background:"none", border:"none", cursor:"pointer",
            borderBottom:tab==="incidents"?"2px solid var(--a)":"2px solid transparent", textTransform:"uppercase", letterSpacing:1 }}>
          Incidents {openIncidentCount > 0 && `(${openIncidentCount})`}
        </button>
      </div>
      <div className="mc-scrl">
        {tab === "alerts" ? (
          alerts.length === 0 ? (
            <div style={{ padding: '16px 8px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t2)' }}>
              No alerts &mdash; all clear
            </div>
          ) : alerts.map(inc => (
            <div className="mc-inc-row" key={inc.id}
              style={{ opacity: inc.status === "resolved" ? .45 : 1 }}>
              <div className="mc-inc-sev" style={{ background:sevCol[inc.sev] }}/>
              <div className="mc-inc-body">
                <div className="mc-inc-title">{inc.title}</div>
                <div className="mc-inc-desc">{inc.desc}</div>
              </div>
              <div className="mc-inc-meta">
                <span className="mc-inc-ago">{inc.ago}</span>
                <span className="mc-tag" style={{ background:sevBg[inc.sev], color:sevCol[inc.sev], fontSize:7 }}>
                  {inc.sev}
                </span>
                {inc.status === "open" && onAckAlert ? (
                  <button onClick={(e) => { e.stopPropagation(); onAckAlert(inc.id); }}
                    style={{ fontFamily:"var(--mono)", fontSize:7, padding:"1px 5px", background:"var(--bld)", color:"var(--bl)",
                      border:"1px solid var(--bl)", borderRadius:2, cursor:"pointer" }}>
                    ACK
                  </button>
                ) : inc.status === "resolved" ? (
                  <span className="mc-tag mc-td" style={{ fontSize:7 }}>ack&apos;d</span>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          formalIncidents.length === 0 ? (
            <div style={{ padding: '16px 8px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t2)' }}>
              No incidents &mdash; all clear
            </div>
          ) : formalIncidents.map(inc => (
            <div className="mc-inc-row" key={inc.id}
              style={{ opacity: inc.status === "resolved" ? .45 : 1 }}>
              <div className="mc-inc-sev" style={{ background:priCol[inc.priority] || "var(--t2)" }}/>
              <div className="mc-inc-body">
                <div className="mc-inc-title">
                  <span style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--t2)", marginRight:4 }}>{inc.incident_number}</span>
                  {inc.title}
                </div>
                <div className="mc-inc-desc">
                  {inc.category}{inc.bot_ref ? ` — bot:${inc.bot_ref}` : ""}{inc.description ? ` — ${inc.description.slice(0, 80)}` : ""}
                </div>
              </div>
              <div className="mc-inc-meta">
                <span className="mc-inc-ago">{timeAgo(inc.created_at)}</span>
                <span className="mc-tag" style={{ background:priBg[inc.priority], color:priCol[inc.priority], fontSize:7 }}>
                  {inc.priority}
                </span>
                {inc.status !== "resolved" && onResolveIncident ? (
                  <button onClick={(e) => { e.stopPropagation(); onResolveIncident(inc.id); }}
                    style={{ fontFamily:"var(--mono)", fontSize:7, padding:"1px 5px", background:"var(--gd)", color:"var(--g)",
                      border:"1px solid var(--g)", borderRadius:2, cursor:"pointer" }}>
                    RESOLVE
                  </button>
                ) : (
                  <span className="mc-tag" style={{ background:"var(--gd)", color:"var(--g)", fontSize:7 }}>
                    {inc.status}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── TRAINING PANEL ─── */
function TrainingPanel() {
  const {
    isTrainingMode, activeScenario, session, scenarios,
    startScenario, abortScenario, completeAction, isActionCompleted,
    currentNarration, getScoreDetails,
  } = useTraining();

  // Tick every second for elapsed timer
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!session || session.status !== "running") return;
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [session?.status]);

  if (!isTrainingMode) return null;

  // Scenario completed — show debriefing
  if (session?.status === "completed" && activeScenario) {
    const details = getScoreDetails();
    const totalScore = details.length > 0
      ? Math.round(details.reduce((s, d) => s + d.score, 0) / details.length)
      : 0;
    const scoreColor = totalScore >= 80 ? "var(--g)" : totalScore >= 50 ? "var(--a)" : "var(--r)";

    return (
      <div className="mc-trn-panel">
        <div className="mc-trn-panel-hdr">
          <div className="mc-trn-panel-title">Scenario Complete</div>
          <button className="mc-trn-panel-close" onClick={abortScenario}>&times;</button>
        </div>
        <div className="mc-trn-panel-body">
          <div className="mc-trn-score">
            <div className="mc-trn-score-val" style={{ color: scoreColor }}>{totalScore}%</div>
            <div className="mc-trn-score-label">
              {totalScore >= 80 ? "Excellent response" : totalScore >= 60 ? "Good — room for improvement" : totalScore >= 40 ? "Needs practice" : "Review procedures"}
            </div>
          </div>

          <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "var(--t0)", marginBottom: 8 }}>
            Action Breakdown
          </div>
          {details.map(d => (
            <div key={d.action.id} className="mc-trn-action">
              <div className={`mc-trn-action-check ${d.completed ? "mc-trn-done" : ""}`}>
                {d.completed ? "\u2713" : ""}
              </div>
              <div style={{ flex: 1 }}>
                <div className="mc-trn-action-label" style={{ color: d.completed ? "var(--t0)" : "var(--r)" }}>
                  {d.action.label}
                </div>
                {d.completed ? (
                  <div className="mc-trn-action-time">
                    Completed in {Math.round(d.completed.completedAt / 1000)}s (target: {d.action.targetSeconds}s)
                    — <span style={{ color: d.score >= 75 ? "var(--g)" : d.score >= 50 ? "var(--a)" : "var(--r)" }}>{d.score}%</span>
                  </div>
                ) : (
                  <div className="mc-trn-action-time" style={{ color: "var(--r)" }}>Not completed</div>
                )}
              </div>
            </div>
          ))}

          <div className="mc-trn-debrief">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Debriefing</div>
            {activeScenario.debriefing}
          </div>

          <button onClick={abortScenario}
            style={{
              width: "100%", marginTop: 16, padding: "8px 16px",
              fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
              background: "var(--bg3)", color: "var(--t0)", border: "1px solid var(--b2)",
              borderRadius: 4, cursor: "pointer",
            }}>
            End &amp; Return to Scenarios
          </button>
        </div>
      </div>
    );
  }

  // Scenario running — show guided panel
  if (session?.status === "running" && activeScenario) {
    const elapsed = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));

    return (
      <div className="mc-trn-panel">
        <div className="mc-trn-panel-hdr">
          <span className="mc-tag" style={{
            background: activeScenario.severity === "P1" ? "var(--rd)" : "var(--ad)",
            color: activeScenario.severity === "P1" ? "var(--r)" : "var(--a)",
            fontSize: 8
          }}>{activeScenario.severity}</span>
          <div className="mc-trn-panel-title">{activeScenario.name}</div>
          <button className="mc-trn-panel-close" onClick={abortScenario}>&times;</button>
        </div>
        <div className="mc-trn-panel-body">
          {/* Timer */}
          <div style={{
            textAlign: "center", padding: "8px 0", fontFamily: "var(--mono)", fontSize: 20,
            fontWeight: 700, color: "var(--a)", marginBottom: 8,
          }}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </div>

          {/* Narration */}
          {currentNarration && (
            <div className="mc-trn-narration" key={currentNarration.slice(0, 20)}>
              {currentNarration}
            </div>
          )}

          {/* Action checklist */}
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "var(--t0)", marginBottom: 8 }}>
            Required Actions
          </div>
          {activeScenario.expectedActions.map(action => {
            const done = isActionCompleted(action.id);
            return (
              <div key={action.id} className="mc-trn-action">
                <div
                  className={`mc-trn-action-check ${done ? "mc-trn-done" : ""}`}
                  onClick={() => !done && completeAction(action.id)}
                >
                  {done ? "\u2713" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="mc-trn-action-label" style={{ opacity: done ? 0.5 : 1, textDecoration: done ? "line-through" : "none" }}>
                    {action.label}
                  </div>
                  <div className="mc-trn-action-detail">{action.detail}</div>
                  <div className="mc-trn-action-time">
                    Target: within {action.targetSeconds}s
                    {done && (
                      <span style={{ color: "var(--g)", marginLeft: 6 }}>
                        Done in {Math.round((session.completedActions.find(a => a.actionId === action.id)?.completedAt || 0) / 1000)}s
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Event log */}
          {session.narrationLog.length > 1 && (
            <>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "var(--t0)", marginTop: 16, marginBottom: 8 }}>
                Event Log
              </div>
              {session.narrationLog.map((msg, i) => (
                <div key={i} className="mc-trn-log-entry">
                  <span style={{ color: "var(--t3)", marginRight: 4 }}>#{i + 1}</span> {msg}
                </div>
              ))}
            </>
          )}

          <button onClick={abortScenario}
            style={{
              width: "100%", marginTop: 16, padding: "8px 16px",
              fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
              background: "var(--rd)", color: "var(--r)", border: "1px solid var(--r)",
              borderRadius: 4, cursor: "pointer",
            }}>
            Abort Scenario
          </button>
        </div>
      </div>
    );
  }

  // No active scenario — show scenario selector
  return (
    <div className="mc-trn-panel">
      <div className="mc-trn-panel-hdr">
        <div className="mc-trn-panel-title">Training Scenarios</div>
      </div>
      <div className="mc-trn-panel-body">
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t2)", marginBottom: 12, lineHeight: 1.5 }}>
          Select a scenario to begin. Events will be injected into the dashboard in real-time.
          No data will be written to the database. Complete the required actions as fast as possible.
        </div>
        {scenarios.map(sc => (
          <div key={sc.id} className="mc-trn-scenario" onClick={() => startScenario(sc.id)}>
            <div className="mc-trn-scenario-name">{sc.name}</div>
            <div className="mc-trn-scenario-desc">{sc.description}</div>
            <div className="mc-trn-scenario-meta">
              <span className="mc-tag" style={{
                background: sc.severity === "P1" ? "var(--rd)" : sc.severity === "P2" ? "var(--ad)" : "var(--bld)",
                color: sc.severity === "P1" ? "var(--r)" : sc.severity === "P2" ? "var(--a)" : "var(--bl)",
                fontSize: 7
              }}>{sc.severity}</span>
              <span className="mc-tag mc-td" style={{ fontSize: 7 }}>{sc.category}</span>
              <span className="mc-tag mc-td" style={{ fontSize: 7 }}>{sc.durationMinutes}min</span>
              <span className="mc-tag mc-td" style={{ fontSize: 7 }}>{sc.expectedActions.length} actions</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── CAPITAL ALLOCATION ─── */
function CapitalAllocationCard({ bots: botList, capitalData }: { bots: Bot[]; capitalData: Record<string, any> }) {
  const ALLOC_COLORS = ["#3d9df3", "#00e5a0", "#f5a623", "#a855f7", "#00d4e8", "#ff4757", "#b97aff", "#f5a623"];

  // Try capital allocations API data first, then fall back to bot data
  const capAllocations = capitalData?.allocations;
  const allocations = (() => {
    if (capAllocations && typeof capAllocations === 'object') {
      // Capital API returns { allocations: { user_id: { total_capital, active_capital, ... } } }
      const entries = Object.entries(capAllocations);
      if (entries.length > 0) {
        return entries.map(([userId, alloc]: [string, any], i) => ({
          name: alloc.label || alloc.name || userId.slice(0, 8),
          value: parseFloat(alloc.active_capital ?? alloc.total_capital ?? 0),
          color: ALLOC_COLORS[i % ALLOC_COLORS.length],
        }));
      }
    }
    if (botList.length > 0) {
      return botList.map((b, i) => ({
        name: b.name || b.id.slice(0, 8),
        value: b.allocatedCapital || b.equity || 0,
        color: ALLOC_COLORS[i % ALLOC_COLORS.length],
      }));
    }
    return [];
  })();
  const total = allocations.reduce((s, a) => s + a.value, 0);
  const withPct = allocations.map(a => ({ ...a, pct: total > 0 ? (a.value / total) * 100 : 0 }));
  return (
    <div className="mc-card mc-capital-card">
      <div className="mc-card-accent" style={{ background: "var(--a)" }} />
      <div className="mc-ch">
        <div className="mc-ct">Capital Allocation</div>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t2)" }}>
          {total > 0 ? `$${(total / 1000).toFixed(0)}k total` : '$0 allocated'}
        </span>
      </div>
      <div style={{ padding: "8px 0 6px" }}>
        <div className="mc-cap-bar">
          {withPct.map(a => (
            <div key={a.name} style={{ width: `${Math.max(a.pct, 1)}%`, background: a.color }} title={`${a.name}: ${a.pct.toFixed(1)}%`} />
          ))}
        </div>
      </div>
      <div className="mc-scrl" style={{ flex: 1 }}>
        {withPct.length > 0 ? withPct.map(a => (
          <div key={a.name} className="mc-cap-row">
            <div className="mc-cap-dot" style={{ background: a.color }} />
            <span style={{ fontSize: 10, color: "var(--t0)", fontWeight: 600, flex: 1 }}>{a.name}</span>
            <span style={{ fontSize: 9, color: "var(--t2)" }}>${(a.value / 1000).toFixed(0)}k</span>
            <span style={{ fontSize: 9, color: "var(--t1)", width: 32, textAlign: "right", fontWeight: 600 }}>{a.pct.toFixed(0)}%</span>
          </div>
        )) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"var(--t3)", fontSize:10, fontFamily:"var(--mono)" }}>
            No capital allocated
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── EXCHANGE ADAPTERS (SA → Credentials → Health) ─── */
function ExchangeCard({ exchangeHealth }: { exchangeHealth: any[] }) {
  const [serviceAccounts, setServiceAccounts] = useState<any[]>([]);
  const [selectedSA, setSelectedSA] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [adapters, setAdapters] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<string, any>>({});
  const [loadingSA, setLoadingSA] = useState(true);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [refreshingBalances, setRefreshingBalances] = useState(false);
  // Position modal state
  const [posModal, setPosModal] = useState<{ credId: string; name: string } | null>(null);
  const [showReconciliation, setShowReconciliation] = useState<{ credId: string; name: string; sandbox: boolean } | null>(null);
  const [posModalData, setPosModalData] = useState<any[]>([]);
  const [posModalLoading, setPosModalLoading] = useState(false);
  const [posModalClosing, setPosModalClosing] = useState(false);
  const [posModalResult, setPosModalResult] = useState<any>(null);

  // Load service accounts + adapters on mount
  useEffect(() => {
    (async () => {
      try {
        const [saRes, adapterRes] = await Promise.all([
          listServiceAccounts().catch(() => ({ data: [] })),
          listAdapters().catch(() => ({ data: [] })),
        ]);
        const saBody = saRes.data as any;
        const sas = Array.isArray(saBody) ? saBody : saBody?.service_accounts ?? saBody?.data ?? [];
        setServiceAccounts(sas);
        if (sas.length > 0) setSelectedSA(sas[0].id);

        const adBody = adapterRes.data as any;
        const ads = Array.isArray(adBody) ? adBody : adBody?.adapters ?? adBody?.data ?? [];
        setAdapters(ads);
      } catch { /* silent */ }
      finally { setLoadingSA(false); }
    })();
  }, []);

  // Load credentials when SA changes
  useEffect(() => {
    if (!selectedSA) { setCredentials([]); return; }
    setLoadingCreds(true);
    (async () => {
      try {
        const res = await listServiceAccountCredentials(selectedSA);
        const body = res.data as any;
        const creds = Array.isArray(body) ? body : body?.credentials ?? body?.data ?? [];
        setCredentials(creds);
      } catch { setCredentials([]); }
      finally { setLoadingCreds(false); }
    })();
  }, [selectedSA]);

  // Fetch balances per credential
  const fetchBalances = useCallback(() => {
    if (credentials.length === 0) return;
    const enabled = credentials.filter((c: any) => c.is_enabled !== false);
    if (enabled.length === 0) return;

    setRefreshingBalances(true);
    let pending = enabled.length;
    const done = () => { pending--; if (pending <= 0) setRefreshingBalances(false); };

    for (const cred of enabled) {
      const adapter = adapters.find((a: any) => a.id === cred.adapter_id);
      const hasFutures = adapter?.supports_futures || adapter?.supportsFutures;
      const marketType = cred.config_overrides?.market_type || (hasFutures ? 'usds_futures' : 'spot');

      getCredentialBalance(cred.id, marketType)
        .then(res => {
          const body = (res.data as any)?.data ?? res.data;
          if (body) {
            setBalances(prev => ({ ...prev, [cred.id]: body }));
          }
        })
        .catch(() => {
          setBalances(prev => ({ ...prev, [cred.id]: { error: true } }));
        })
        .finally(done);
    }
  }, [credentials, adapters]);

  // Auto-fetch on credentials/adapters load
  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // Open positions modal for a credential
  const openPosModal = useCallback(async (credId: string, name: string) => {
    setPosModal({ credId, name });
    setPosModalLoading(true);
    setPosModalData([]);
    setPosModalResult(null);
    try {
      const res = await getCredentialPositions(credId);
      const body = (res.data as any)?.data ?? res.data;
      setPosModalData(body?.positions ?? []);
    } catch {
      setPosModalData([]);
    } finally {
      setPosModalLoading(false);
    }
  }, []);

  // Close all positions from modal
  const handleCloseAll = useCallback(async () => {
    if (!posModal) return;
    if (!confirm('Close ALL open positions on this exchange? This will place market orders to flatten every position.')) return;
    setPosModalClosing(true);
    setPosModalResult(null);
    try {
      const res = await closeAllCredentialPositions(posModal.credId);
      const body = (res.data as any)?.data ?? res.data;
      console.log('[CloseAll] raw response:', JSON.stringify(res.data));
      console.log('[CloseAll] parsed body:', JSON.stringify(body));
      console.log('[CloseAll] body.results:', JSON.stringify(body?.results));
      // Sanitize results: ensure every item is an object with a status field
      const sanitized = body?.results
        ? { ...body, results: (Array.isArray(body.results) ? body.results : []).filter((r: any) => r && typeof r === 'object') }
        : body;
      setPosModalResult(sanitized);
      // Refresh positions
      const res2 = await getCredentialPositions(posModal.credId);
      const body2 = (res2.data as any)?.data ?? res2.data;
      setPosModalData(body2?.positions ?? []);
      fetchBalances();
    } catch (err: any) {
      setPosModalResult({ error: err?.message || 'Failed to close positions' });
    } finally {
      setPosModalClosing(false);
    }
  }, [posModal, fetchBalances]);

  // Close a single position from modal
  const [closingSingle, setClosingSingle] = useState<string | null>(null);
  const handleCloseSingle = useCallback(async (pos: any) => {
    if (!posModal) return;
    const sym = pos.symbol;
    const rawAmt = parseFloat(pos.position_amount || '0');
    const amt = Math.abs(rawAmt);
    const entry = parseFloat(pos.entry_price || '0');
    // Determine side from positionAmt sign (negative = SHORT) since Binance one-way mode returns "BOTH"
    const posSide = (pos.position_side || '').toUpperCase();
    const side = posSide === 'SHORT' ? 'SHORT' : posSide === 'LONG' ? 'LONG' : rawAmt < 0 ? 'SHORT' : 'LONG';
    if (!confirm(`Close ${side} ${amt} ${sym} at market?`)) return;
    setClosingSingle(sym);
    setPosModalResult(null);
    try {
      const res = await closeCredentialPosition(posModal.credId, sym, side, amt, entry);
      const body = (res.data as any)?.data ?? res.data;
      console.log('[CloseSingle] raw response:', JSON.stringify(res.data));
      console.log('[CloseSingle] parsed body:', JSON.stringify(body));
      const result = (body && typeof body === 'object' && !Array.isArray(body)) ? body : { status: 'completed', raw: body };
      setPosModalResult({ closed: 1, failed: 0, results: [result] });
      // Refresh
      const res2 = await getCredentialPositions(posModal.credId);
      const body2 = (res2.data as any)?.data ?? res2.data;
      setPosModalData(body2?.positions ?? []);
      fetchBalances();
    } catch (err: any) {
      setPosModalResult({ error: `Failed to close ${sym}: ${err?.message || 'unknown'}` });
    } finally {
      setClosingSingle(null);
    }
  }, [posModal, fetchBalances]);

  // Resolve adapter name from adapter_id
  const adapterMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of adapters) m.set(a.id, a);
    return m;
  }, [adapters]);

  // Format balance value
  const fmtBal = (v: number | null | undefined) => {
    if (v == null) return '--';
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(2)}k`;
    return `$${v.toFixed(2)}`;
  };

  // Merge credential data with adapter info + exchange health
  const tiles = credentials.map((cred: any) => {
    const adapter = adapterMap.get(cred.adapter_id);
    const adapterName = cred.adapter_name || adapter?.name || cred.label || 'Unknown';
    const adapterCode = cred.adapter_code || adapter?.code || '';
    const health = exchangeHealth.find((e: any) => {
      const eName = (e.name || e.adapter_name || '').toLowerCase();
      return eName.includes(adapterName.toLowerCase()) || eName.includes(adapterCode.toLowerCase());
    });
    const bal = balances[cred.id];
    const hasBal = bal && !bal.error;
    const isFutures = (cred.config_overrides?.market_type || '').includes('futures') ||
                      adapter?.supports_futures || adapter?.supportsFutures;

    // Extract per-asset breakdown
    const assets: { asset: string; wallet_balance: number; available_balance: number; unrealized_pnl: number }[] =
      hasBal && Array.isArray(bal.assets) ? bal.assets : [];

    return {
      id: cred.id,
      name: adapterName,
      label: cred.label || adapterName,
      status: cred.status === 'active' || cred.is_enabled
        ? (health ? (health.status === 'connected' || health.status === 'healthy' ? 'healthy' : 'degraded') : 'healthy')
        : 'down',
      lat: health?.latency_ms ?? health?.response_time_ms ?? 0,
      sandbox: cred.is_sandbox ?? false,
      enabled: cred.is_enabled ?? true,
      market: cred.config_overrides?.market_type || (isFutures ? 'futures' : 'spot'),
      isFutures,
      // Balance fields
      walletBalance: hasBal ? bal.total_balance : null,
      availableBalance: hasBal ? bal.available_balance : null,
      unrealizedPnl: hasBal ? assets.reduce((s: number, a: any) => s + (a.unrealized_pnl || 0), 0) : null,
      balanceCurrency: bal?.currency || 'USDT',
      balanceError: bal?.error ?? false,
      assets,
    };
  });

  // Build credential ID → display info map for the reconciliation modal
  const credentialMap = useMemo(() => {
    const map: Record<string, { name: string; sandbox: boolean }> = {};
    for (const t of tiles) {
      map[t.id] = { name: t.name, sandbox: t.sandbox };
    }
    return map;
  }, [tiles]);

  const statusColor = (s: string) => s === "healthy" ? "var(--g)" : s === "degraded" ? "var(--a)" : s === "unknown" ? "var(--t2)" : "var(--r)";
  const latColor = (ms: number) => ms < 50 ? "var(--g)" : ms < 150 ? "var(--a)" : "var(--r)";

  // Carousel state
  const [carouselIdx, setCarouselIdx] = useState(0);
  const autoSlideRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideCount = tiles.length;

  // Auto-slide every 6 seconds
  useEffect(() => {
    if (slideCount <= 1) return;
    autoSlideRef.current = setInterval(() => {
      setCarouselIdx(prev => (prev + 1) % slideCount);
    }, 12000);
    return () => { if (autoSlideRef.current) clearInterval(autoSlideRef.current); };
  }, [slideCount]);

  const goToSlide = (idx: number) => {
    setCarouselIdx(idx);
    if (autoSlideRef.current) clearInterval(autoSlideRef.current);
    autoSlideRef.current = setInterval(() => {
      setCarouselIdx(prev => (prev + 1) % slideCount);
    }, 12000);
  };

  // Big balance formatter
  const fmtBigBal = (v: number | null | undefined) => {
    if (v == null) return { whole: '--', suffix: '' };
    if (Math.abs(v) >= 1_000_000) return { whole: (v / 1_000_000).toFixed(2), suffix: 'M' };
    if (Math.abs(v) >= 1_000) return { whole: (v / 1_000).toFixed(2), suffix: 'k' };
    return { whole: v.toFixed(2), suffix: '' };
  };

  return (
    <div className="mc-card mc-exchange-card">
      <div className="mc-card-accent" style={{ background: tiles.some(t => t.status !== 'healthy') ? "var(--a)" : "var(--g)" }}/>
      <div className="mc-ch">
        <div className="mc-ct">Exchange Adapters</div>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <button
            onClick={fetchBalances}
            disabled={refreshingBalances || loadingSA || loadingCreds}
            title="Refresh balances"
            style={{
              background: "none", border: "1px solid var(--b2)", borderRadius: 2,
              color: refreshingBalances ? "var(--t3)" : "var(--t1)", cursor: refreshingBalances ? "default" : "pointer",
              fontFamily: "var(--mono)", fontSize: 8, padding: "1px 5px",
              opacity: refreshingBalances ? 0.5 : 1, transition: "opacity .2s",
            }}
          >
            {refreshingBalances ? '...' : 'REFRESH'}
          </button>
          {serviceAccounts.length > 1 ? (
            <select
              value={selectedSA || ''}
              onChange={e => setSelectedSA(e.target.value)}
              style={{
                background: "var(--bg3)", border: "1px solid var(--b2)", borderRadius: 2,
                color: "var(--t0)", fontFamily: "var(--mono)", fontSize: 8, padding: "2px 4px",
                outline: "none", cursor: "pointer",
              }}
            >
              {serviceAccounts.map((sa: any) => (
                <option key={sa.id} value={sa.id}>{sa.name || sa.id.slice(0, 8)}</option>
              ))}
            </select>
          ) : serviceAccounts.length === 1 ? (
            <span className="mc-tag mc-td">{serviceAccounts[0].name || 'SA'}</span>
          ) : null}
          {slideCount > 1 && (
            <span style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--t2)" }}>
              {carouselIdx + 1}/{slideCount}
            </span>
          )}
        </div>
      </div>
      <div className="mc-cb" style={{ flex:1, padding:0, overflow:"hidden" }}>
        {loadingSA || loadingCreds ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, fontFamily:"var(--mono)", fontSize:9, color:"var(--t2)" }}>
            Loading...
          </div>
        ) : tiles.length === 0 ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, fontFamily:"var(--mono)", fontSize:9, color:"var(--t2)", textAlign:"center", padding:16 }}>
            {serviceAccounts.length === 0 ? 'No service accounts configured' : 'No credentials for this service account'}
          </div>
        ) : (
          <div className="mc-ex-carousel">
            {slideCount > 1 && (
              <>
                <button className="mc-ex-nav prev" onClick={() => goToSlide((carouselIdx - 1 + slideCount) % slideCount)}>&lsaquo;</button>
                <button className="mc-ex-nav next" onClick={() => goToSlide((carouselIdx + 1) % slideCount)}>&rsaquo;</button>
              </>
            )}
            <div className="mc-ex-track" style={{ transform: `translateX(-${carouselIdx * 100}%)` }}>
              {tiles.map(ex => {
                const bigBal = fmtBigBal(ex.walletBalance);
                return (
                  <div key={ex.id} className="mc-ex-slide">
                    {/* Header: name + status badges */}
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                      <span className={`mc-sdot mc-${ex.status}`}/>
                      <span style={{ fontFamily:"var(--mono)", fontSize:14, fontWeight:700, color:"var(--t0)" }}>{ex.name}</span>
                      {ex.sandbox && <span className="mc-tag mc-ta" style={{ fontSize:7 }}>SANDBOX</span>}
                      {!ex.enabled && <span className="mc-tag mc-td" style={{ fontSize:7 }}>DISABLED</span>}
                      <span style={{ fontFamily:"var(--mono)", fontSize:10, fontWeight:600, color:statusColor(ex.status), textTransform:"uppercase", marginLeft:"auto" }}>{ex.status}</span>
                    </div>
                    {ex.label !== ex.name && (
                      <div style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--t2)", marginBottom:6, paddingLeft:14 }}>{ex.label}</div>
                    )}

                    {/* Balance row — horizontal, evenly spaced */}
                    <div style={{ display:"flex", alignItems:"baseline", gap:0, padding:"10px 0", borderTop:"1px solid var(--b2)", borderBottom:"1px solid var(--b2)" }}>
                      <div style={{ flex:1 }}>
                        <div className="mc-sub" style={{ fontSize:8, marginBottom:4 }}>Wallet Balance</div>
                        <div className="mc-ex-wallet-big" style={{ color: ex.balanceError ? "var(--r)" : ex.walletBalance != null ? "var(--t0)" : "var(--t3)" }}>
                          {ex.balanceError ? 'ERROR' : (
                            <>
                              <span style={{ color:"var(--t2)", fontSize:18 }}>$</span>
                              {bigBal.whole}
                              {bigBal.suffix && <span style={{ fontSize:16, color:"var(--t2)" }}>{bigBal.suffix}</span>}
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ flex:1, borderLeft:"1px solid var(--b2)", paddingLeft:16 }}>
                        <div className="mc-sub" style={{ fontSize:8, marginBottom:4 }}>Available</div>
                        <div className="mc-ex-wallet-big" style={{ color: ex.availableBalance != null ? "var(--g)" : "var(--t3)" }}>
                          {ex.balanceError ? 'ERROR' : fmtBal(ex.availableBalance)}
                        </div>
                      </div>
                      {ex.isFutures && (
                        <div style={{ flex:1, borderLeft:"1px solid var(--b2)", paddingLeft:16 }}>
                          <div className="mc-sub" style={{ fontSize:8, marginBottom:4 }}>Unrealized PnL</div>
                          <div className="mc-ex-wallet-big" style={{ color: ex.unrealizedPnl != null ? (ex.unrealizedPnl >= 0 ? "var(--g)" : "var(--r)") : "var(--t3)" }}>
                            {ex.unrealizedPnl != null ? `${ex.unrealizedPnl >= 0 ? '+' : ''}${fmtBal(ex.unrealizedPnl)}` : '--'}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Mid section: Info + Assets side by side */}
                    <div style={{ display:"flex", gap:12, flex:1, marginTop:8, minHeight:0 }}>
                      {/* Left: Info grid */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px", alignContent:"start", minWidth:160 }}>
                        <div>
                          <div className="mc-sub" style={{ fontSize:7, marginBottom:2 }}>Latency</div>
                          <div style={{ fontFamily:"var(--mono)", fontSize:13, fontWeight:600, color: ex.lat > 0 ? latColor(ex.lat) : "var(--t2)" }}>
                            {ex.lat > 0 ? `${ex.lat}ms` : '--'}
                          </div>
                        </div>
                        <div>
                          <div className="mc-sub" style={{ fontSize:7, marginBottom:2 }}>Market</div>
                          <div style={{ fontFamily:"var(--mono)", fontSize:11, fontWeight:600, color:"var(--t1)", textTransform:"uppercase" }}>{ex.market}</div>
                        </div>
                        <div>
                          <div className="mc-sub" style={{ fontSize:7, marginBottom:2 }}>Currency</div>
                          <div style={{ fontFamily:"var(--mono)", fontSize:11, fontWeight:600, color:"var(--t1)" }}>{ex.balanceCurrency}</div>
                        </div>
                        <div>
                          <div className="mc-sub" style={{ fontSize:7, marginBottom:2 }}>Assets</div>
                          <div style={{ fontFamily:"var(--mono)", fontSize:11, fontWeight:600, color:"var(--t1)" }}>{ex.assets.length}</div>
                        </div>
                        {/* Action buttons inline */}
                        <div style={{ gridColumn:"span 2", display:"flex", gap:6, marginTop:4 }}>
                          {ex.isFutures && (
                            <>
                              <button
                                onClick={() => openPosModal(ex.id, ex.name)}
                                style={{
                                  background:"none", border:"1px solid var(--b2)", borderRadius:3,
                                  color:"var(--t1)", cursor:"pointer", fontFamily:"var(--mono)", fontSize:9,
                                  padding:"5px 10px", fontWeight:600,
                                }}
                              >
                                POSITIONS
                              </button>
                              <button
                                onClick={() => setShowReconciliation({ credId: ex.id, name: ex.name, sandbox: ex.sandbox })}
                                style={{
                                  background:"rgba(255,180,0,0.08)", border:"1px solid rgba(255,180,0,0.3)", borderRadius:3,
                                  color:"var(--y, #ffb400)", cursor:"pointer", fontFamily:"var(--mono)", fontSize:9,
                                  padding:"5px 10px", fontWeight:700,
                                }}
                              >
                                RECONCILE
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Asset cards with icons */}
                      <div style={{ flex:1, borderLeft:"1px solid var(--b2)", paddingLeft:12 }}>
                        <div className="mc-sub" style={{ fontSize:8, marginBottom:6 }}>Asset Holdings</div>
                        {ex.assets.length > 0 ? (
                          <div className="mc-ex-asset-grid">
                            {ex.assets.slice(0, 12).map((a: any, i: number) => {
                              const fallbackIcon = (
                                <span className="mc-ex-asset-icon" style={{ background:"#1e2d40" }}>
                                  {a.asset.slice(0, 2)}
                                </span>
                              );
                              return (
                                <div key={i} className="mc-ex-asset-card">
                                  <TokenIcon
                                    symbol={a.asset.toUpperCase()}
                                    size={24}
                                    variant="branded"
                                    fallback={fallbackIcon}
                                  />
                                  <div className="mc-ex-asset-info">
                                    <div className="mc-ex-asset-name">{a.asset}</div>
                                    <div className="mc-ex-asset-bal">
                                      {a.wallet_balance >= 1000 ? `${(a.wallet_balance/1000).toFixed(1)}k` : a.wallet_balance.toFixed(2)}
                                    </div>
                                    {ex.isFutures && a.unrealized_pnl !== 0 && (
                                      <div style={{ fontFamily:"var(--mono)", fontSize:9, fontWeight:600, color: a.unrealized_pnl >= 0 ? "var(--g)" : "var(--r)", marginTop:1 }}>
                                        {a.unrealized_pnl >= 0 ? '+' : ''}{a.unrealized_pnl.toFixed(2)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {ex.assets.length > 12 && (
                              <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--t2)", padding:"8px 0", gridColumn:"span 2" }}>
                                +{ex.assets.length - 12} more assets
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--t3)", padding:"12px 0" }}>
                            No assets
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Dots */}
            {slideCount > 1 && (
              <div className="mc-ex-dots">
                {tiles.map((_, i) => (
                  <button key={i} className={`mc-ex-dot ${i === carouselIdx ? 'active' : ''}`} onClick={() => goToSlide(i)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Reconciliation Modal ── */}
      {showReconciliation && (
        <ReconciliationModal
          onClose={() => setShowReconciliation(null)}
          credentialId={showReconciliation.credId}
          credentialName={showReconciliation.name}
          credentialSandbox={showReconciliation.sandbox}
          credentialMap={credentialMap}
        />
      )}

      {/* ── Positions Modal ── */}
      {posModal && (
        <div
          onClick={() => setPosModal(null)}
          style={{
            position:"fixed", inset:0, zIndex:9999,
            background:"rgba(0,0,0,0.7)", backdropFilter:"blur(4px)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:"var(--bg1)", border:"1px solid var(--b2)", borderRadius:6,
              width:"min(900px, 92vw)", maxHeight:"85vh", display:"flex", flexDirection:"column",
              boxShadow:"0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            {/* Header */}
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"12px 16px", borderBottom:"1px solid var(--b2)",
            }}>
              <div>
                <div style={{ fontFamily:"var(--mono)", fontSize:13, fontWeight:700, color:"var(--t0)" }}>
                  Exchange Positions
                </div>
                <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--t2)", marginTop:2 }}>
                  {posModal.name} — Live from exchange
                </div>
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                {posModalData.length > 0 && (
                  <button
                    onClick={handleCloseAll}
                    disabled={posModalClosing}
                    style={{
                      background: posModalClosing ? "var(--bg3)" : "rgba(255,71,87,0.15)",
                      border:"1px solid rgba(255,71,87,0.4)", borderRadius:3,
                      color: posModalClosing ? "var(--t3)" : "var(--r)",
                      cursor: posModalClosing ? "default" : "pointer",
                      fontFamily:"var(--mono)", fontSize:10, fontWeight:700,
                      padding:"4px 10px",
                    }}
                  >
                    {posModalClosing ? 'CLOSING...' : 'CLOSE ALL POSITIONS'}
                  </button>
                )}
                <button
                  onClick={() => openPosModal(posModal.credId, posModal.name)}
                  style={{
                    background:"none", border:"1px solid var(--b2)", borderRadius:3,
                    color:"var(--t1)", cursor:"pointer", fontFamily:"var(--mono)", fontSize:9,
                    padding:"4px 8px",
                  }}
                >
                  REFRESH
                </button>
                <button
                  onClick={() => setPosModal(null)}
                  style={{
                    background:"none", border:"none", color:"var(--t2)", cursor:"pointer",
                    fontSize:18, lineHeight:1, padding:"0 4px",
                  }}
                >
                  x
                </button>
              </div>
            </div>

            {/* Close result banner */}
            {posModalResult && (
              <div style={{
                margin:"8px 16px 0", padding:"6px 10px", borderRadius:3, fontFamily:"var(--mono)", fontSize:10,
                background: posModalResult.error ? "rgba(255,71,87,0.1)" : "rgba(0,212,170,0.1)",
                border: `1px solid ${posModalResult.error ? "rgba(255,71,87,0.3)" : "rgba(0,212,170,0.3)"}`,
                color: posModalResult.error ? "var(--r)" : "var(--g)",
              }}>
                {posModalResult.error
                  ? `Error: ${posModalResult.error}`
                  : `Closed: ${posModalResult.closed ?? 0} | Failed: ${posModalResult.failed ?? 0}`}
                {Array.isArray(posModalResult.results) && posModalResult.results.length > 0 && (
                  <div style={{ marginTop:4, fontSize:9 }}>
                    {posModalResult.results.map((r: any, i: number) => {
                      if (!r || typeof r !== 'object') return null;
                      const st = r.status ?? 'unknown';
                      return (
                        <div key={i} style={{ color: st === 'closed' ? "var(--g)" : st === 'failed' ? "var(--r)" : "var(--t2)" }}>
                          {r.symbol ?? '?'} {r.side ?? '?'} — {st}{r.error ? `: ${r.error}` : ''}{r.pnl != null ? ` (PnL: $${parseFloat(r.pnl).toFixed(2)})` : ''}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Body */}
            <div style={{ flex:1, overflow:"auto", padding:16 }}>
              {posModalLoading ? (
                <div style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--t2)", textAlign:"center", padding:24 }}>
                  Fetching positions from exchange...
                </div>
              ) : posModalData.length === 0 ? (
                <div style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--t2)", textAlign:"center", padding:24 }}>
                  No open positions on exchange
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {/* Summary row */}
                  <div style={{
                    display:"flex", gap:16, padding:"8px 12px", background:"var(--bg2)",
                    border:"1px solid var(--b2)", borderRadius:4, fontFamily:"var(--mono)",
                  }}>
                    <div>
                      <div style={{ fontSize:8, color:"var(--t2)", marginBottom:2 }}>POSITIONS</div>
                      <div style={{ fontSize:14, fontWeight:700, color:"var(--t0)" }}>{posModalData.length}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:8, color:"var(--t2)", marginBottom:2 }}>TOTAL UNREALIZED</div>
                      <div style={{
                        fontSize:14, fontWeight:700,
                        color: posModalData.reduce((s: number, p: any) => s + parseFloat(p.unrealized_pnl || '0'), 0) >= 0 ? "var(--g)" : "var(--r)"
                      }}>
                        {(() => {
                          const total = posModalData.reduce((s: number, p: any) => s + parseFloat(p.unrealized_pnl || '0'), 0);
                          return `${total >= 0 ? '+' : ''}$${total.toFixed(2)}`;
                        })()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize:8, color:"var(--t2)", marginBottom:2 }}>TOTAL NOTIONAL</div>
                      <div style={{ fontSize:14, fontWeight:700, color:"var(--t0)" }}>
                        ${posModalData.reduce((s: number, p: any) => s + Math.abs(parseFloat(p.notional || '0')), 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Position table */}
                  <table style={{ width:"100%", fontFamily:"var(--mono)", fontSize:10, borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ borderBottom:"1px solid var(--b2)" }}>
                        {['Symbol', 'Side', 'Qty', 'Entry', 'Mark', 'Liq', 'Lev', 'Margin', 'PnL', 'Updated', ''].map(h => (
                          <th key={h} style={{ padding:"4px 6px", textAlign:"left", fontSize:8, color:"var(--t2)", fontWeight:600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {posModalData.map((pos: any, i: number) => {
                        const amt = parseFloat(pos.position_amount || '0');
                        const entry = parseFloat(pos.entry_price || '0');
                        const mark = parseFloat(pos.mark_price || '0');
                        const pnl = parseFloat(pos.unrealized_pnl || '0');
                        const liq = parseFloat(pos.liquidation_price || '0');
                        const side = (pos.position_side || (amt >= 0 ? 'LONG' : 'SHORT')).toUpperCase();
                        const updatedAt = pos.update_time ? new Date(pos.update_time).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '--';
                        return (
                          <tr key={i} style={{ borderBottom:"1px solid var(--b2)" }}>
                            <td style={{ padding:"6px", fontWeight:700, color:"var(--t0)" }}>{pos.symbol}</td>
                            <td style={{ padding:"6px" }}>
                              <span style={{
                                padding:"1px 4px", borderRadius:2, fontSize:9, fontWeight:700,
                                background: side === 'LONG' ? "rgba(0,212,170,0.15)" : "rgba(255,71,87,0.15)",
                                color: side === 'LONG' ? "var(--g)" : "var(--r)",
                              }}>{side}</span>
                            </td>
                            <td style={{ padding:"6px", color:"var(--t0)" }}>{Math.abs(amt)}</td>
                            <td style={{ padding:"6px", color:"var(--t0)" }}>${entry.toFixed(2)}</td>
                            <td style={{ padding:"6px", color:"var(--t0)" }}>${mark.toFixed(2)}</td>
                            <td style={{ padding:"6px", color: liq > 0 ? "var(--a)" : "var(--t3)" }}>{liq > 0 ? `$${liq.toFixed(2)}` : '--'}</td>
                            <td style={{ padding:"6px", color:"var(--t0)" }}>{pos.leverage}x</td>
                            <td style={{ padding:"6px", color:"var(--t1)", fontSize:9 }}>{pos.margin_type}</td>
                            <td style={{ padding:"6px", fontWeight:700, color: pnl >= 0 ? "var(--g)" : "var(--r)" }}>
                              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                            </td>
                            <td style={{ padding:"6px", color:"var(--t2)", fontSize:8 }}>{updatedAt}</td>
                            <td style={{ padding:"6px" }}>
                              <button
                                onClick={() => handleCloseSingle(pos)}
                                disabled={closingSingle === pos.symbol}
                                style={{
                                  background:"rgba(255,71,87,0.1)", border:"1px solid rgba(255,71,87,0.3)",
                                  borderRadius:2, color: closingSingle === pos.symbol ? "var(--t3)" : "var(--r)",
                                  cursor: closingSingle === pos.symbol ? "default" : "pointer",
                                  fontFamily:"var(--mono)", fontSize:7, fontWeight:700, padding:"2px 6px",
                                }}
                              >
                                {closingSingle === pos.symbol ? '...' : 'CLOSE'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── UPTIME STRIP ─── */
function UptimeCard({ services: svcs, infraMetrics }: { services: { name: string; status: string; lat: number; uptime: number; node: string }[]; infraMetrics: TradeEngineMetrics | null }) {
  const healthyCount = svcs.filter(s => s.status === 'healthy').length;
  const uptimePct = svcs.length > 0 ? ((healthyCount / svcs.length) * 100).toFixed(2) : '--';
  // BEAM uptime for engine uptime display
  const beamUptimeSec = infraMetrics?.beam.uptimeSeconds ?? 0;
  const beamUptimeStr = beamUptimeSec > 0 ? `${Math.floor(beamUptimeSec / 86400)}d ${Math.floor((beamUptimeSec % 86400) / 3600)}h ${Math.floor((beamUptimeSec % 3600) / 60)}m` : '';
  // Build bars from real service data — one bar per service, height based on latency (lower = taller)
  const bars = svcs.length > 0
    ? svcs.map(s => ({
        ok: s.status === 'healthy',
        height: s.status === 'healthy' ? Math.max(50, 100 - Math.min(s.lat, 200) / 4) : 30,
        name: s.name,
      }))
    : [];
  return (
    <div className="mc-card mc-uptime-card">
      <div className="mc-card-accent" style={{ background:"var(--g)" }}/>
      <div className="mc-ch">
        <div className="mc-ct">Platform Uptime</div>
        <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--g)", fontWeight:600 }}>{uptimePct}%</span>
      </div>
      <div className="mc-cb" style={{ justifyContent:"flex-end", gap:4, flex:1 }}>
        {bars.length > 0 ? (
          <div style={{ display:"flex", gap:2, alignItems:"flex-end", flex:1 }}>
            {bars.map((b, i) => (
              <div key={i} style={{
                width: Math.max(3, Math.min(8, Math.floor(240 / bars.length))), borderRadius:1,
                height: `${b.height}%`,
                background: b.ok ? "var(--g)" : "var(--r)",
                opacity: b.ok ? 0.7 : 1,
                flexShrink:0,
              }} title={b.name}/>
            ))}
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, color:"var(--t3)", fontSize:10, fontFamily:"var(--mono)" }}>
            No services detected
          </div>
        )}
        <div className="mc-sub" style={{ fontSize:7 }}>
          {svcs.length} services monitored &mdash; {healthyCount} healthy
          {beamUptimeStr ? ` | Engine: ${beamUptimeStr}` : ''}
        </div>
      </div>
    </div>
  );
}

/* ─── FAILED ORDERS ─── */
function FailedOrdersCard({ orders: orderList }: { orders: any[] }) {
  const cnt = orderList.filter((o: any) => (o.order_status || o.status) === 'failed').length;
  const total = orderList.length;
  return (
    <div className="mc-card mc-failed-card" style={{ borderColor: cnt > 5 ? "rgba(255,71,87,.4)" : undefined }}>
      <div className="mc-card-accent" style={{ background: cnt > 0 ? "var(--r)" : "var(--g)" }}/>
      <div className="mc-ch"><div className="mc-ct">Failed Orders</div></div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-lg" style={{ color: cnt > 0 ? "var(--r)" : "var(--g)", textAlign:"center" }}>{cnt}</div>
        <div className="mc-sub" style={{ fontSize:7 }}>last 1h &middot; {total} total</div>
      </div>
    </div>
  );
}

/* ─── TRADES COUNTER ─── */
function TradesCard({ platformStats }: { platformStats: any }) {
  const trades = platformStats?.orders?.filled_today ?? platformStats?.total_trades ?? 0;
  return (
    <div className="mc-card mc-trades-card">
      <div className="mc-card-accent" style={{ background:"var(--p)" }}/>
      <div className="mc-ch"><div className="mc-ct">Trades Today</div></div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-lg" style={{ color:"var(--p)", textAlign:"center" }}>{trades}</div>
        <div className="mc-sub" style={{ fontSize:7 }}>across all bots</div>
      </div>
    </div>
  );
}

/* ─── FILL RATE ─── */
function FillRateCard({ orders: orderList }: { orders: any[] }) {
  // Derive fill rate from order stream
  // Phoenix enrichment returns `order_status`; WS may use `status` — check both
  const getStatus = (o: any) => o.order_status || o.status;
  const filled = orderList.filter((o: any) => getStatus(o) === 'filled').length;
  const total = orderList.filter((o: any) => ['filled', 'cancelled', 'failed', 'rejected'].includes(getStatus(o))).length;
  const rate = total > 0 ? (filled / total) * 100 : 0;
  return (
    <div className="mc-card mc-fillrate-card">
      <div className="mc-card-accent" style={{ background:"var(--g)" }}/>
      <div className="mc-ch"><div className="mc-ct">Fill Rate</div></div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-sm" style={{ color:"var(--g)", textAlign:"center" }}>{total > 0 ? rate.toFixed(1) : '--'}%</div>
        <div className="mc-sub" style={{ fontSize:7 }}>{filled}/{total || '--'} orders filled</div>
      </div>
    </div>
  );
}

/* ─── SLIPPAGE AVG ─── */
function SlippageCard({ platformStats }: { platformStats?: any }) {
  const slippage = platformStats?.risk?.slippage;
  const stats1h = slippage?.last_1h;
  const avg = stats1h?.avg_slippage_bps;
  const max = stats1h?.max_slippage_bps;
  const cost = stats1h?.total_slippage_usd ?? 0;
  const unfavorable = stats1h?.unfavorable_pct;
  const hasData = avg != null && stats1h?.status === 'active';
  const isCritical = avg != null && avg >= 15;
  const isWarning = avg != null && avg >= 5;
  const color = isCritical ? "var(--r)" : isWarning ? "var(--a)" : hasData ? "var(--g)" : "var(--t2)";

  return (
    <div className="mc-card mc-sharpe-card">
      <div className="mc-card-accent" style={{ background: color }}/>
      <div className="mc-ch">
        <div className="mc-ct">Avg Slippage</div>
        {isCritical && <div className="mc-tag mc-tr">HIGH</div>}
        {isWarning && !isCritical && <div className="mc-tag mc-ta">ELEVATED</div>}
      </div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-sm" style={{ color, textAlign:"center" }}>
          {hasData ? `${avg.toFixed(1)} bps` : slippage?.status === 'not_started' ? '--' : '0.0 bps'}
        </div>
        <div className="mc-sub" style={{ fontSize:7 }}>
          {hasData
            ? `max ${max?.toFixed(1)} bps | cost $${cost.toFixed(2)} | ${unfavorable?.toFixed(0)}% unfavorable`
            : stats1h?.total_orders
              ? `${stats1h.total_orders} orders (no slippage data yet)`
              : 'awaiting execution data'}
        </div>
      </div>
    </div>
  );
}

/* ─── MAX DRAWDOWN ─── */
function DrawdownCard({ platformStats }: { platformStats: any }) {
  // Tier 2: will show real value when equity snapshots exist
  const dd = platformStats?.max_drawdown_24h ?? platformStats?.max_drawdown ?? 0;
  return (
    <div className="mc-card mc-drawdown-card">
      <div className="mc-card-accent" style={{ background: dd > 10 ? "var(--r)" : dd > 0 ? "var(--a)" : "var(--g)" }}/>
      <div className="mc-ch"><div className="mc-ct">Max Drawdown</div></div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-sm" style={{ color: dd > 10 ? "var(--r)" : dd > 7 ? "var(--a)" : "var(--g)", textAlign:"center" }}>{dd > 0 ? `${dd.toFixed(1)}%` : '0.0%'}</div>
        <div className="mc-sub" style={{ fontSize:7 }}>24h peak-to-trough</div>
      </div>
    </div>
  );
}

/* ─── AVG EXECUTION ─── */
function AvgExecCard({ orders }: { orders: any[] }) {
  // Compute avg execution time: submitted_at → first_fill_at
  const filledWithTimes = orders.filter((o: any) => {
    const status = o.order_status || o.status;
    if (status !== 'filled') return false;
    const submitted = o.submitted_at;
    const filled = o.first_fill_at || o.completed_at;
    return submitted && filled;
  });

  let avgMs = 0;
  if (filledWithTimes.length > 0) {
    const totalMs = filledWithTimes.reduce((sum: number, o: any) => {
      const submitted = new Date(o.submitted_at).getTime();
      const filled = new Date(o.first_fill_at || o.completed_at).getTime();
      return sum + Math.max(0, filled - submitted);
    }, 0);
    avgMs = totalMs / filledWithTimes.length;
  }

  const hasData = filledWithTimes.length > 0 && avgMs > 0;
  const formatted = hasData
    ? avgMs < 1000 ? `${Math.round(avgMs)}ms`
    : avgMs < 60000 ? `${(avgMs / 1000).toFixed(1)}s`
    : `${(avgMs / 60000).toFixed(1)}m`
    : '--';

  return (
    <div className="mc-card mc-avgexec-card">
      <div className="mc-card-accent" style={{ background: hasData ? "var(--b)" : "var(--t3)" }}/>
      <div className="mc-ch"><div className="mc-ct">Avg Exec</div></div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-sm" style={{ color: hasData ? "var(--b)" : "var(--t2)", textAlign:"center" }}>{formatted}</div>
        <div className="mc-sub" style={{ fontSize:7 }}>{hasData ? `from ${filledWithTimes.length} filled orders` : 'no filled orders with timestamps'}</div>
      </div>
    </div>
  );
}

/* ─── POSITION RECONCILIATION ─── */
function ReconciliationCard({ platformStats }: { platformStats?: any }) {
  const recon = platformStats?.risk?.reconciler;
  const status = recon?.status ?? 'not_started';
  const orphans = recon?.current_orphans ?? 0;
  const totalClosed = recon?.orphans_closed_total ?? 0;
  const lastCheck = recon?.last_orphan_check;
  const isClean = status === 'clean';
  const color = orphans > 0 ? "var(--a)" : isClean ? "var(--g)" : "var(--t2)";

  return (
    <div className="mc-card mc-recon-card">
      <div className="mc-card-accent" style={{ background: color }}/>
      <div className="mc-ch">
        <div className="mc-ct">Reconciliation</div>
        {orphans > 0 ? <div className="mc-tag mc-ta">{orphans} ORPHAN{orphans > 1 ? 'S' : ''}</div>
          : isClean ? <div className="mc-tag mc-tg">CLEAN</div>
          : null}
      </div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-sm" style={{ color, textAlign:"center" }}>
          {orphans > 0 ? orphans : isClean ? '0' : '--'}
        </div>
        <div className="mc-sub" style={{ fontSize: 7 }}>
          {totalClosed > 0 ? `${totalClosed} reconciled total` : 'no orphaned positions'}
          {lastCheck ? ` | last: ${new Date(lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </div>
      </div>
    </div>
  );
}

/* ─── CORRELATION RISK ─── */
function CorrelationCard({ platformStats }: { platformStats?: any }) {
  const corr = platformStats?.risk?.correlation;
  const status = corr?.status ?? 'not_started';
  const breaches = corr?.breaches ?? [];
  const hasBreach = breaches.length > 0;
  const isCritical = breaches.some((b: any) => b.severity === 'critical');
  const dir = corr?.directional_exposure;
  const color = isCritical ? "var(--r)" : hasBreach ? "var(--a)" : status === 'clear' ? "var(--g)" : "var(--t2)";

  return (
    <div className="mc-card mc-corr-card">
      <div className="mc-card-accent" style={{ background: color }}/>
      <div className="mc-ch">
        <div className="mc-ct">Correlation Risk</div>
        {isCritical ? <div className="mc-tag mc-tr">BREACH</div>
          : hasBreach ? <div className="mc-tag mc-ta">WARNING</div>
          : status === 'clear' ? <div className="mc-tag mc-tg">CLEAR</div>
          : null}
      </div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        {dir ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--g)' }}>
                L ${dir.long_usd?.toLocaleString?.() ?? '0'}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--r)' }}>
                S ${dir.short_usd?.toLocaleString?.() ?? '0'}
              </div>
            </div>
            <div className="mc-sub" style={{ fontSize: 7, marginTop: 2 }}>
              net {dir.net_direction}: {dir.net_pct_of_capital?.toFixed?.(1) ?? 0}% of capital
              {hasBreach ? ` | ${breaches.length} breach${breaches.length > 1 ? 'es' : ''}` : ''}
            </div>
          </>
        ) : (
          <>
            <div className="mc-bigval mc-bv-sm" style={{ color: "var(--t2)", textAlign: "center" }}>
              {status === 'no_positions' ? '0' : '--'}
            </div>
            <div className="mc-sub" style={{ fontSize: 7 }}>
              {status === 'no_positions' ? 'no open positions' : 'awaiting data'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── CREDENTIAL HEALTH ─── */
function CredentialHealthCard({ platformStats }: { platformStats?: any }) {
  const creds = platformStats?.risk?.credential_health ?? {};
  const entries = Object.values(creds) as any[];
  const total = entries.length;
  const healthy = entries.filter((c: any) => c.status === 'healthy').length;
  const failing = entries.filter((c: any) => c.status === 'failing').length;
  const degraded = entries.filter((c: any) => c.status === 'degraded').length;

  const color = failing > 0 ? "var(--r)" : degraded > 0 ? "var(--a)" : total > 0 ? "var(--g)" : "var(--t2)";
  const statusLabel = failing > 0 ? 'FAILING' : degraded > 0 ? 'DEGRADED' : total > 0 ? 'HEALTHY' : 'NO DATA';
  const tagClass = failing > 0 ? 'mc-tr' : degraded > 0 ? 'mc-ta' : 'mc-tg';

  // Aggregate stats
  const totalSuccess = entries.reduce((s: number, c: any) => s + (c.success_count ?? 0), 0);
  const totalFail = entries.reduce((s: number, c: any) => s + (c.failure_count ?? 0), 0);
  const successRate = totalSuccess + totalFail > 0
    ? ((totalSuccess / (totalSuccess + totalFail)) * 100).toFixed(1)
    : '--';

  return (
    <div className="mc-card mc-cred-card">
      <div className="mc-card-accent" style={{ background: color }}/>
      <div className="mc-ch">
        <div className="mc-ct">Credentials</div>
        {total > 0 && <div className={`mc-tag ${tagClass}`}>{statusLabel}</div>}
      </div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-sm" style={{ color, textAlign:"center" }}>
          {total > 0 ? `${healthy}/${total}` : '--'}
        </div>
        <div className="mc-sub" style={{ fontSize: 7 }}>
          {total > 0
            ? `${successRate}% success rate | ${totalSuccess} ok / ${totalFail} fail${failing > 0 ? ` | ${failing} credential${failing > 1 ? 's' : ''} failing` : ''}`
            : 'no credential activity yet'}
        </div>
      </div>
    </div>
  );
}

/* ─── EXCHANGE HEALTH ENFORCED ─── */
function ExchangeHealthEnforcedCard({ platformStats }: { platformStats?: any }) {
  const health = platformStats?.risk?.exchange_health ?? {};
  const status = health?.status ?? 'unknown';
  const wsConnected = health?.websocket_connected;
  const cacheFresh = health?.cache_fresh;
  const tickerSize = health?.ticker_cache_size ?? 0;
  const checkedAt = health?.checked_at;

  const color = status === 'healthy' ? "var(--g)"
    : status === 'degraded' ? "var(--a)"
    : status === 'disconnected' ? "var(--r)"
    : "var(--t2)";

  const tagClass = status === 'healthy' ? 'mc-tg'
    : status === 'degraded' ? 'mc-ta'
    : status === 'disconnected' ? 'mc-tr'
    : '';

  return (
    <div className="mc-card mc-exhealth-card">
      <div className="mc-card-accent" style={{ background: color }}/>
      <div className="mc-ch">
        <div className="mc-ct">Exchange Gate</div>
        {status !== 'unknown' && <div className={`mc-tag ${tagClass}`}>{status.toUpperCase()}</div>}
      </div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: wsConnected ? 'var(--g)' : 'var(--r)' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t1)' }}>WS</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: cacheFresh ? 'var(--g)' : 'var(--a)', marginLeft: 4 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t1)' }}>Cache</span>
        </div>
        <div className="mc-sub" style={{ fontSize: 7, marginTop: 2 }}>
          {status === 'disconnected'
            ? 'TRADES BLOCKED — exchange offline'
            : status === 'degraded'
              ? `${tickerSize} tickers | WS up, cache stale`
              : tickerSize > 0
                ? `${tickerSize} tickers streaming`
                : 'awaiting connection'}
          {checkedAt ? ` | ${new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </div>
      </div>
    </div>
  );
}

/* ─── FILL ACTIVITY ─── */
function FillActivityCard({ platformStats }: { platformStats?: any }) {
  const slippage = platformStats?.risk?.slippage;
  const totalOrders = slippage?.last_1h?.total_orders ?? 0;
  const withSlippage = slippage?.last_1h?.orders_with_slippage ?? 0;
  const status = slippage?.status;
  const hasData = status === 'active' && totalOrders > 0;
  const color = hasData ? "var(--g)" : "var(--t2)";

  return (
    <div className="mc-card mc-fills-card">
      <div className="mc-card-accent" style={{ background: color }}/>
      <div className="mc-ch">
        <div className="mc-ct">Fill Tracking</div>
        {hasData && <div className="mc-tag mc-tg">ACTIVE</div>}
      </div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-sm" style={{ color, textAlign:"center" }}>
          {hasData ? totalOrders : status === 'not_started' ? '--' : '0'}
        </div>
        <div className="mc-sub" style={{ fontSize: 7 }}>
          {hasData
            ? `${totalOrders} fills recorded | ${withSlippage} with slippage data`
            : 'fills now written to trading.fills on every order'}
        </div>
      </div>
    </div>
  );
}

/* ─── HEARTBEAT HEALTH ─── */
function HeartbeatCard({ bots: botList, wsBots }: { bots: Bot[]; wsBots: any[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const running = botList.filter(b => b.status === "running").length;
  // Detect stale heartbeats: >60s since last heartbeat — only on client to avoid hydration mismatch
  const stale = mounted ? botList.filter(b => {
    if (b.status !== 'running') return false;
    if (!b.lastHeartbeat) return true;
    return (Date.now() - b.lastHeartbeat) > 60_000;
  }).length : 0;
  const fresh = running - stale;
  return (
    <div className="mc-card mc-profitfactor-card">
      <div className="mc-card-accent" style={{ background: stale > 0 ? "var(--r)" : "var(--g)" }}/>
      <div className="mc-ch"><div className="mc-ct">Heartbeats</div></div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div className="mc-bigval mc-bv-sm" style={{ color: stale > 0 ? "var(--a)" : "var(--g)", textAlign:"center" }}>{fresh}/{running}</div>
        <div className="mc-sub" style={{ fontSize:7, color: stale > 0 ? "var(--r)" : undefined }}>{stale > 0 ? `${stale} stale (>60s)` : running > 0 ? "all fresh" : "no bots running"}</div>
      </div>
    </div>
  );
}

/* ── Inline skeleton for cards that haven't loaded yet ── */
function CardSkeleton({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={`mc-card ${className ?? ""}`}>
      <div className="mc-card-accent" style={{ background: "var(--b2)" }}/>
      <div className="mc-ch"><div className="mc-ct" style={{ color: "var(--t3)" }}>{label ?? ""}</div></div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center", gap: 6 }}>
        <div style={{ width: "50%", height: 18, background: "var(--bg3)", borderRadius: 3, animation: "pulse 1.5s ease-in-out infinite" }}/>
        <div style={{ width: "30%", height: 8, background: "var(--bg3)", borderRadius: 2, animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.3s" }}/>
      </div>
    </div>
  );
}

/* ── Error state for cards that failed to load ── */
function CardError({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={`mc-card ${className ?? ""}`}>
      <div className="mc-card-accent" style={{ background: "var(--r)" }}/>
      <div className="mc-ch"><div className="mc-ct" style={{ color: "var(--t3)" }}>{label ?? ""}</div></div>
      <div className="mc-cb" style={{ justifyContent:"center", alignItems:"center" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--r)", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Failed to load data
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ QUERY HOOKS (independent per section) ════════ */
import { useQuery } from "@tanstack/react-query";

function useMCBots() {
  return useQuery({
    queryKey: ["mc-bots"],
    queryFn: async () => {
      const result = await listBots();
      if (result.data && Array.isArray(result.data)) return result.data.map(mapApiBotToUiBot) as Bot[];
      return [] as Bot[];
    },
    staleTime: 15_000,
  });
}

function useMCAlerts() {
  return useQuery({
    queryKey: ["mc-alerts"],
    queryFn: async () => {
      const result = await getSystemAlerts(100);
      const body = (result as any)?.data;
      const list = body?.alerts ?? (Array.isArray(body) ? body : []);
      return list.map((a: any) => mapWsAlertToUiAlert({
        id: a.id,
        category: a.category ?? a.alert_type ?? '',
        severity: a.severity ?? 'info',
        title: a.title ?? '',
        message: a.message ?? a.title ?? '',
        metadata: a.metadata ?? {},
        timestamp: a.created_at ?? a.snapshot_at ?? '',
      })) as Alert[];
    },
    staleTime: 10_000,
  });
}

function useMCOrders() {
  return useQuery({
    queryKey: ["mc-orders"],
    queryFn: async () => {
      const result = await getRecentOrders(50);
      const body = (result as any)?.data;
      return (body && Array.isArray(body)) ? body : [];
    },
    staleTime: 10_000,
  });
}

function useMCEquityCurve() {
  return useQuery({
    queryKey: ["mc-equity-curve"],
    queryFn: async () => {
      const result = await getPlatformEquityCurve(200);
      const body = (result as any)?.data;
      if (body && Array.isArray(body)) {
        return body.map((s: any) => ({
          t: s.snapshot_at ? new Date(s.snapshot_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : '',
          eq: parseFloat(s.total_equity_usd) || 0,
        }));
      }
      return [] as { t: string; eq: number }[];
    },
    staleTime: 30_000,
  });
}

function useMCCapital() {
  return useQuery({
    queryKey: ["mc-capital"],
    queryFn: async () => {
      const result = await getAllCapitalAllocations();
      const body = (result as any)?.data;
      return (body && typeof body === 'object') ? body : {};
    },
    staleTime: 30_000,
  });
}

function useMCIncidents() {
  return useQuery({
    queryKey: ["mc-incidents"],
    queryFn: async () => {
      const result = await getOpenIncidents(30);
      const body = (result as any)?.data;
      const list = body?.incidents ?? (Array.isArray(body) ? body : []);
      return list as FormalIncident[];
    },
    staleTime: 15_000,
  });
}

function useMCInfraMetrics() {
  return useQuery({
    queryKey: ["mc-infra-metrics"],
    queryFn: async () => {
      const result = await getInfraMetrics();
      const body = result.data as any;
      const payload = body?.data ?? body;
      if (payload && (payload.beam || payload.database)) {
        return mapWsInfraToTradeEngineMetrics(payload);
      }
      return null;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

function useMCExchangeHealth() {
  return useQuery({
    queryKey: ["mc-exchange-health"],
    queryFn: async () => {
      const result = await getExchangeHealth();
      const body = result.data as any;
      return body?.exchanges ?? [];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function useMCServiceHealth() {
  return useQuery({
    queryKey: ["mc-service-health"],
    queryFn: async () => {
      const result = await getServiceHealth();
      return result.data ?? [];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function useMCCoolify() {
  return useQuery({
    queryKey: ["mc-coolify"],
    queryFn: async () => {
      const result = await getInfrastructureStatus();
      const body = result.data as any;
      return (body?.services && Array.isArray(body.services)) ? body.services : [];
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
  });
}

/* ═══════════════════════════ MAIN ═══════════════════════════════════════════ */
export default function MissionCriticalPage() {
  return (
    <TrainingProvider>
      <MissionCriticalDashboard />
    </TrainingProvider>
  );
}

function MissionCriticalDashboard() {
  const time = useTime();

  // ── Real-time WS hooks ──
  const { bots: wsBots } = useBotChannel();
  const { metrics: wsInfraMetrics, exchangeHealth: wsExchangeHealth, serviceHealth: wsServiceHealth } = useInfraChannel();
  const { alerts: wsAlerts } = useAlertChannel();
  const { stats: platformStats } = usePlatformChannel();
  const { orders: wsOrders } = useOrderChannel();

  // ── Independent data queries — each section loads on its own ──
  const { data: apiBots = [], isLoading: botsLoading, isError: botsError } = useMCBots();
  const { data: apiAlerts = [], isLoading: alertsLoading, isError: alertsError } = useMCAlerts();
  const { data: restOrders = [], isLoading: ordersLoading, isError: ordersError } = useMCOrders();
  const { data: equityCurve = [], isLoading: equityLoading, isError: equityError } = useMCEquityCurve();
  const { data: capitalData = {}, isLoading: capitalLoading, isError: capitalError } = useMCCapital();
  const { data: apiFormalIncidents = [], isLoading: incidentsLoading, isError: incidentsError } = useMCIncidents();
  const { data: restInfraMetrics, isLoading: infraLoading, isError: infraError } = useMCInfraMetrics();
  const { data: apiExchangeHealth = [], isLoading: exchangeLoading, isError: exchangeError } = useMCExchangeHealth();
  const { data: apiServiceHealth = [], isLoading: serviceHealthLoading, isError: serviceHealthError } = useMCServiceHealth();
  const { data: coolifyServices = [] } = useMCCoolify();

  // ── Mutable state for WS overlay (merges on top of cached API data) ──
  const [bots, setBots] = useState<Bot[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [infraMetrics, setInfraMetrics] = useState<TradeEngineMetrics | null>(null);
  const [serviceHealthData, setServiceHealthData] = useState<any[]>([]);
  const [exchangeHealthData, setExchangeHealthData] = useState<any[]>([]);
  const [latencyHistory, setLatencyHistory] = useState<{ t: number; v: number }[]>([]);
  const [formalIncidents, setFormalIncidents] = useState<FormalIncident[]>([]);

  // ── Sync API data into state (as each query resolves independently) ──
  useEffect(() => { if (apiBots.length > 0 && bots.length === 0) setBots(apiBots); }, [apiBots]);
  useEffect(() => { if (apiAlerts.length > 0 && alerts.length === 0) setAlerts(apiAlerts); }, [apiAlerts]);
  useEffect(() => { if (apiFormalIncidents.length > 0 && formalIncidents.length === 0) setFormalIncidents(apiFormalIncidents); }, [apiFormalIncidents]);
  useEffect(() => { if (restInfraMetrics && !infraMetrics) setInfraMetrics(restInfraMetrics); }, [restInfraMetrics]);
  useEffect(() => { if (apiExchangeHealth.length > 0 && exchangeHealthData.length === 0) setExchangeHealthData(apiExchangeHealth); }, [apiExchangeHealth]);
  useEffect(() => { if (apiServiceHealth && (apiServiceHealth as any[]).length > 0 && serviceHealthData.length === 0) setServiceHealthData(apiServiceHealth as any[]); }, [apiServiceHealth]);

  // ── Derived loading states per section ──
  const botsReady = bots.length > 0 || (!botsLoading && apiBots.length === 0);
  const alertsReady = alerts.length > 0 || (!alertsLoading && apiAlerts.length === 0);
  const ordersReady = !ordersLoading;
  const infraReady = infraMetrics !== null || !infraLoading;
  const exchangeReady = exchangeHealthData.length > 0 || !exchangeLoading;
  const servicesReady = serviceHealthData.length > 0 || !serviceHealthLoading;
  const equityReady = !equityLoading;
  const capitalReady = !capitalLoading;
  const incidentsReady = !incidentsLoading;

  // ── WS overlay: bots ──
  useEffect(() => {
    if (wsBots.length > 0) {
      setBots(prev => {
        const updated = [...prev];
        for (const wsBot of wsBots) {
          const idx = updated.findIndex(b => b.id === wsBot.id);
          const mapped = mapApiBotToUiBot(wsBot as any);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], ...mapped, user: updated[idx].user || mapped.user };
          } else {
            updated.push(mapped);
          }
        }
        return updated;
      });
    }
  }, [wsBots]);

  // ── WS overlay: infra metrics ──
  useEffect(() => {
    if (!wsInfraMetrics) return;
    setInfraMetrics(mapWsInfraToTradeEngineMetrics(wsInfraMetrics));
  }, [wsInfraMetrics]);

  // ── Accumulate latency history from infra ticks ──
  useEffect(() => {
    if (!infraMetrics) return;
    const latMs = infraMetrics.dbPool.latencyMs;
    if (latMs <= 0) return;
    setLatencyHistory(prev => {
      const next = [...prev, { t: prev.length, v: latMs }];
      return next.length > 60 ? next.slice(-60) : next;
    });
  }, [infraMetrics]);

  // ── WS overlay: service health ──
  useEffect(() => {
    if (wsServiceHealth.length > 0) {
      setServiceHealthData(wsServiceHealth);
    }
  }, [wsServiceHealth]);

  // ── WS overlay: exchange health ──
  useEffect(() => {
    if (wsExchangeHealth.length > 0) {
      setExchangeHealthData(wsExchangeHealth);
    }
  }, [wsExchangeHealth]);

  // ── WS overlay: alerts ──
  useEffect(() => {
    if (wsAlerts.length > 0) {
      const latest = wsAlerts[0];
      const mapped = mapWsAlertToUiAlert(latest);
      setAlerts(prev => {
        if (prev.some(a => a.id === mapped.id)) return prev;
        return [mapped, ...prev];
      });
    }
  }, [wsAlerts]);

  // ── REST polling fallback (30s) — only when WS not active ──
  useEffect(() => {
    if (wsInfraMetrics) return;
    const interval = setInterval(async () => {
      try {
        const res = await getInfraMetrics();
        const body = res.data as any;
        const payload = body?.data ?? body;
        if (payload && (payload.beam || payload.database)) {
          setInfraMetrics(mapWsInfraToTradeEngineMetrics(payload));
        }
      } catch { /* silent */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [wsInfraMetrics]);

  // Coolify polling handled by React Query (useMCCoolify refetchInterval)

  // ── Training mode: merge injected data ──
  const training = useTraining();
  const { injected: trnData, isTrainingMode } = training;

  // Merge training alerts into alert items
  const trainingAlertItems: IncidentItem[] = trnData.alerts.map((a: any) => ({
    id: a.id,
    sev: a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info",
    title: (a.title || "") + (a.isTraining ? "" : ""),
    desc: `${a.service || a.category || "training"} — just now`,
    ago: "just now",
    status: "open" as const,
  }));

  // Merge training incidents into formal incidents
  const trainingIncidentItems: FormalIncident[] = trnData.incidents.map((inc: any) => ({
    id: inc.id,
    incident_number: inc.incident_number,
    priority: inc.priority,
    category: inc.category,
    title: inc.title,
    description: inc.description,
    status: inc.status,
    created_at: inc.created_at,
    bot_ref: inc.bot_ref,
  }));

  const router = useRouter();

  // ── Derived stats — prefer WS platform stats, fallback to bot-derived ──
  const botDerivedEquity = bots.reduce((s, b) => s + b.equity, 0);
  const totalEquity = (platformStats?.total_equity && platformStats.total_equity > 0) ? platformStats.total_equity : botDerivedEquity;
  const botDerivedPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const totalPnl = (platformStats?.total_pnl && platformStats.total_pnl !== 0) ? platformStats.total_pnl : (platformStats?.pnl_24h ?? botDerivedPnl);
  const runningBots = bots.filter(b => b.status === "running").length;
  const totalBotCount = bots.length;
  const openPositions = platformStats?.open_positions ?? bots.reduce((s, b) => s + b.openPositions, 0);

  // Map alerts to alert items for IncidentsCard alerts tab (+ training injected)
  const realAlertItems: IncidentItem[] = alerts.length > 0
    ? alerts.slice(0, 15).map((a) => ({
        id: `ALR-${String(a.id).padStart(4, '0')}`,
        sev: a.sev,
        title: a.msg,
        desc: `${a.service} — ${a.time}`,
        ago: a.time,
        status: a.acked ? "resolved" as const : "open" as const,
      }))
    : [];
  const alertItems: IncidentItem[] = [...trainingAlertItems, ...realAlertItems];

  // Merge formal incidents with training incidents
  const mergedIncidents: FormalIncident[] = [...trainingIncidentItems, ...formalIncidents];

  // Map bots to fleet format
  const fleetBots = bots.length > 0
    ? bots.map(b => ({
        id: b.id.slice(0, 8),
        fullId: b.id,
        name: b.name,
        status: b.status as string,
        exchange: b.exchange,
        pair: b.pair,
        pnl: b.pnl,
        pct: b.pnlPct,
        trades: b.trades,
        equity: b.equity,
        spark: sparkline(20, b.equity || 1000, 0.02, b.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)),
      }))
    : [];

  // Map service health to UI format — merge WS health + Coolify
  const wsServices = serviceHealthData.map((s: any) => ({
    name: s.service_name || s.name || 'Unknown',
    status: (s.status === 'healthy' ? 'healthy' : s.status === 'degraded' ? 'degraded' : s.status === 'down' ? 'down' : 'healthy') as string,
    lat: s.response_time_ms ?? 0,
    uptime: 99.9,
    node: s.environment || s.category || '',
  }));
  const coolifyMapped = coolifyServices.map((svc: any) => {
    const isHealthy = svc.status === 'running' && svc.healthy;
    const isStopped = svc.status === 'stopped' || svc.status === 'exited';
    return {
      name: svc.name || svc.id,
      status: isHealthy ? 'healthy' : isStopped ? 'down' : 'degraded',
      lat: 0,
      uptime: isHealthy ? 99.9 : isStopped ? 0 : 50,
      node: `coolify:${svc.type || 'service'}`,
    };
  });
  // Merge: WS services first, then Coolify services (deduplicated by name)
  const wsNames = new Set(wsServices.map(s => s.name.toLowerCase()));
  const mergedServices = [
    ...wsServices,
    ...coolifyMapped.filter((c: any) => !wsNames.has(c.name.toLowerCase())),
  ];
  const services = mergedServices;

  // Merge REST orders + WS orders (WS orders overlay on top, deduped by id)
  const mergedOrders = useMemo(() => {
    const mapOrder = (o: any) => {
      const oid = o.order_id || o.id || '';
      return {
        id: oid.slice(0, 8),
        fullId: oid,
        bot: (o.bot_name || (o.bot_id || '').slice(0, 8)) || '--',
        pair: o.trading_pair || o.symbol || '--',
        side: (o.side || 'buy').toLowerCase(),
        price: o.execution_price || o.order_price || o.price || '0',
        qty: o.filled_quantity || o.order_size || o.quantity || '0',
        status: (o.order_status || o.status || 'pending').toLowerCase(),
        age: '0s',
        ts: (o.timestamp || o.created_at)
          ? new Date(o.timestamp || o.created_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" })
          : '--',
      };
    };

    // Start with WS orders (most recent, real-time)
    const seen = new Set<string>();
    const result: ReturnType<typeof mapOrder>[] = [];

    for (const o of wsOrders) {
      const mapped = mapOrder(o);
      if (!seen.has(mapped.fullId)) {
        seen.add(mapped.fullId);
        result.push(mapped);
      }
    }

    // Append REST orders that aren't already in WS
    for (const o of restOrders) {
      const mapped = mapOrder(o);
      if (!seen.has(mapped.fullId)) {
        seen.add(mapped.fullId);
        result.push(mapped);
      }
    }

    return result;
  }, [wsOrders, restOrders]);

  const liveOrders = mergedOrders;

  // Combined raw orders for analytics cards (FailedOrders, FillRate)
  const allRawOrders = useMemo(() => {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const o of wsOrders) { const k = (o as any).order_id || o.id; if (k && !seen.has(k)) { seen.add(k); result.push(o); } }
    for (const o of restOrders) { const k = (o as any).order_id || o.id; if (k && !seen.has(k)) { seen.add(k); result.push(o); } }
    return result;
  }, [wsOrders, restOrders]);

  const hasAlerts = alertItems.some(i => i.sev === "critical" && i.status === "open") || formalIncidents.some(i => i.priority === "P1" && i.status === "open");
  const criticalCount = alertItems.filter(i => i.sev === "critical" && i.status === "open").length + formalIncidents.filter(i => i.priority === "P1" && i.status === "open").length;
  const hasData = bots.length > 0 || alerts.length > 0;

  // ── Action handlers (intercepted in training mode) ──
  const handleAckAlert = useCallback(async (alertId: string) => {
    if (isTrainingMode) {
      training.completeAction("ack-warning");
      training.completeAction("ack-ws-warning");
      training.completeAction("ack-first-error");
      training.completeAction("ack-approaching");
      training.completeAction("ack-cb");
      training.completeAction("ack-heartbeat");
      training.completeAction("ack-db-down");
      // Remove from local state
      setAlerts(prev => prev.map(a => String(a.id) === alertId.replace("ALR-", "").replace(/^0+/, "") ? { ...a, acked: true } : a));
      return;
    }
    // Real: extract numeric ID from ALR-0001 format
    const rawId = alertId.replace("ALR-", "").replace(/^0+/, "");
    await acknowledgeSystemAlert(rawId);
    setAlerts(prev => prev.map(a => String(a.id) === rawId ? { ...a, acked: true } : a));
  }, [isTrainingMode, training]);

  const handleResolveIncident = useCallback(async (incidentId: string) => {
    if (isTrainingMode) {
      training.completeAction("resolve-incident");
      training.completeAction("resolve-after-recovery");
      training.completeAction("resolve-with-assessment");
      training.completeAction("resolve-or-escalate");
      training.completeAction("resolve-with-plan");
      training.completeAction("document-root-cause");
      return;
    }
    await resolveIncident(incidentId, "Resolved from mission-critical dashboard");
    setFormalIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, status: "resolved" } : i));
  }, [isTrainingMode, training]);

  const handlePauseBot = useCallback(async (botId: string) => {
    if (isTrainingMode) {
      training.completeAction("pause-bot");
      training.completeAction("pause-affected-bots");
      training.completeAction("verify-auto-pause");
      training.completeAction("assess-pause-decision");
      return;
    }
    // botId is short (8 chars), need full ID from bots state
    const fullBot = bots.find(b => b.id.startsWith(botId) || b.id === botId);
    if (fullBot) {
      await pauseBot(fullBot.id);
      setBots(prev => prev.map(b => b.id === fullBot.id ? { ...b, status: "paused" as any } : b));
    }
  }, [isTrainingMode, training, bots]);

  const handleStartBot = useCallback(async (botId: string) => {
    if (isTrainingMode) {
      training.completeAction("attempt-restart");
      return;
    }
    const fullBot = bots.find(b => b.id.startsWith(botId) || b.id === botId);
    if (fullBot) {
      await startBot(fullBot.id);
      setBots(prev => prev.map(b => b.id === fullBot.id ? { ...b, status: "running" as any } : b));
    }
  }, [isTrainingMode, training, bots]);

  const handleStopBot = useCallback(async (botId: string) => {
    if (isTrainingMode) {
      training.completeAction("kill-switch");
      return;
    }
    const fullBot = bots.find(b => b.id.startsWith(botId) || b.id === botId);
    if (fullBot) {
      await stopBot(fullBot.id);
      setBots(prev => prev.map(b => b.id === fullBot.id ? { ...b, status: "stopped" as any } : b));
    }
  }, [isTrainingMode, training, bots]);

  const handleNavigate = useCallback((path: string) => {
    router.push(path);
  }, [router]);

  const handleKillSwitch = useCallback(async () => {
    if (isTrainingMode) {
      training.completeAction("kill-switch");
      training.completeAction("pause-bot");
      training.completeAction("pause-affected-bots");
      return;
    }
    if (!confirm("KILL SWITCH: This will stop ALL trading immediately. Continue?")) return;
    await stopTrading();
    setBots(prev => prev.map(b => ({ ...b, status: "stopped" as any })));
  }, [isTrainingMode, training]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mc">
        <div className="mc-shell">

          {/* ── TOP BAR ── */}
          <div className="mc-topbar">
            <div className="mc-logo">STELLA <span>&#x2B21;</span></div>
            <div className="mc-topbar-tag">Mission Critical</div>
            <div className="mc-tb-sep mc-tb-version"/>
            <div className="mc-topbar-tag mc-tb-version">v1.0.0</div>
            {hasAlerts && (
              <>
                <div className="mc-tb-sep"/>
                <div className="mc-tb-alert"><span>&#x26A0;</span> {criticalCount} Critical Incident{criticalCount !== 1 ? 's' : ''} Active</div>
              </>
            )}
            <div className="mc-tb-sep"/>
            <div className="mc-tb-stats">
              {[
                { l:"Equity", v: totalEquity > 0 ? (totalEquity >= 1e6 ? `$${(totalEquity/1e6).toFixed(2)}M` : `$${(totalEquity/1e3).toFixed(1)}k`) : '$--', c:"var(--g)" },
                { l:"Active Bots", v: totalBotCount > 0 ? `${runningBots}/${totalBotCount}` : '--', c:"var(--t0)" },
                { l:"Open Pos", v: String(openPositions), c:"var(--a)" },
              ].map(s => (
                <span key={s.l}>{s.l}: <span style={{ color:s.c, fontWeight:600 }}>{s.v}</span></span>
              ))}
            </div>
            <div className="mc-topbar-live">
              <span className="mc-pulse"/>
              {hasData ? 'LIVE' : 'CONNECTING'}
            </div>
            <div className="mc-tb-sep"/>
            <button onClick={handleKillSwitch}
              style={{
                fontFamily:"var(--mono)", fontSize:8, fontWeight:700, letterSpacing:".08em",
                padding:"3px 10px", background:"var(--rd)", color:"var(--r)",
                border:"1px solid var(--r)", borderRadius:2, cursor:"pointer",
                textTransform:"uppercase",
              }}>
              Kill Switch
            </button>
            <div className="mc-tb-sep"/>
            <div
              className={`mc-training-toggle ${isTrainingMode ? "mc-trn-active" : ""}`}
              onClick={training.toggleTrainingMode}
            >
              <div className="mc-trn-sw"/>
              TRAINING
            </div>
            <div className="mc-tb-sep"/>
            <div className="mc-tb-time">{time}</div>
          </div>

          {/* ── TRAINING MODE BANNER ── */}
          {isTrainingMode && (
            <div className="mc-training-banner">
              <span className="mc-trn-badge">TRAINING MODE</span>
              <span>All data on screen is supplemented with simulated events. No actions will affect production systems.</span>
              {training.activeScenario && (
                <span style={{ marginLeft: "auto", fontWeight: 600 }}>
                  Active: {training.activeScenario.name}
                </span>
              )}
            </div>
          )}

          {/* ── GRID ── */}
          <div className="mc-canvas">
            <div className="mc-main-layout">

              {/* ── LEFT CONTENT ── */}
              <div className="mc-left">
                <div className="mc-grid-left">
                  {/* ── ROW 1: KEY METRICS ── */}
                  {exchangeError ? <CardError label="Exchanges" /> :
                   !exchangeReady ? <CardSkeleton label="Exchanges" /> :
                   <ExchangeCard exchangeHealth={exchangeHealthData} />}

                  {botsError ? <CardError label="24h Realized P&L" /> :
                   !botsReady ? <CardSkeleton label="24h Realized P&L" /> :
                   <PnlCard pnl={totalPnl} equity={totalEquity} />}

                  {botsError ? <CardError label="Win Rate" /> :
                   !botsReady ? <CardSkeleton label="Win Rate" /> :
                   <WinRateCard bots={bots} />}

                  {botsError ? <CardError label="Bot Fleet" /> :
                   !botsReady ? <CardSkeleton label="Bot Fleet" /> :
                   <ActiveBotsCard running={runningBots} total={totalBotCount || fleetBots.length} />}

                  {/* ── Below Equity: Trades + Failed Orders + Micro Stats ── */}
                  <TradesCard platformStats={platformStats} />

                  {ordersError ? <CardError label="Failed Orders" /> :
                   !ordersReady ? <CardSkeleton label="Failed Orders" /> :
                   <FailedOrdersCard orders={allRawOrders} />}

                  {botsError ? <CardError label="Open Positions" /> :
                   !botsReady ? <CardSkeleton label="Open Positions" /> :
                   <OpenPosCard count={openPositions} runningBots={runningBots} />}

                  {botsError ? <CardError label="Circuit Breakers" /> :
                   !botsReady ? <CardSkeleton label="Circuit Breakers" /> :
                   <CircuitBreakerCard bots={bots} platformStats={platformStats} />}

                  <VolumeCard platformStats={platformStats} />

                  {ordersError ? <CardError label="Fill Rate" /> :
                   !ordersReady ? <CardSkeleton label="Fill Rate" /> :
                   <FillRateCard orders={allRawOrders} />}

                  <SlippageCard platformStats={platformStats} />
                  <DrawdownCard platformStats={platformStats} />
                  {ordersError ? <CardError label="Avg Exec" /> :
                   !ordersReady ? <CardSkeleton label="Avg Exec" /> :
                   <AvgExecCard orders={allRawOrders} />}
                  <ReconciliationCard platformStats={platformStats} />
                  <CorrelationCard platformStats={platformStats} />
                  <CredentialHealthCard platformStats={platformStats} />
                  <ExchangeHealthEnforcedCard platformStats={platformStats} />
                  <FillActivityCard platformStats={platformStats} />

                  {botsError ? <CardError label="Heartbeats" /> :
                   !botsReady ? <CardSkeleton label="Heartbeats" /> :
                   <HeartbeatCard bots={bots} wsBots={wsBots} />}

                  {/* ── LIVE ORDERS + EXCHANGE ── */}
                  {ordersError ? <CardError label="Live Orders" /> :
                   !ordersReady ? <CardSkeleton label="Live Orders" /> :
                   <LiveOrdersFeed orders={liveOrders} />}

                  {botsError && equityError ? <CardError label="Platform Equity" /> :
                   !botsReady || !equityReady ? <CardSkeleton label="Platform Equity" /> :
                   <EquityCard equity={totalEquity} activeBots={runningBots} curveData={equityCurve} />}

                  {/* ── LATENCY + CAPITAL ── */}
                  {infraError ? <CardError label="API Latency" /> :
                   !infraReady ? <CardSkeleton label="API Latency" /> :
                   <LatencyCard infraMetrics={infraMetrics} latencyData={latencyHistory} />}

                  {capitalError ? <CardError label="Capital Allocation" /> :
                   !capitalReady || !botsReady ? <CardSkeleton label="Capital Allocation" /> :
                   <CapitalAllocationCard bots={bots} capitalData={capitalData} />}

                  {/* ── SERVICES + UPTIME ── */}
                  {serviceHealthError ? <CardError label="Services" /> :
                   !servicesReady ? <CardSkeleton label="Services" /> :
                   <ServicesCard services={services} />}

                  {serviceHealthError && infraError ? <CardError label="Uptime" /> :
                   !servicesReady || !infraReady ? <CardSkeleton label="Uptime" /> :
                   <UptimeCard services={services} infraMetrics={infraMetrics} />}
                </div>
              </div>

              {/* ── RIGHT SIDEBAR ── */}
              <div className="mc-right">
                {alertsError && incidentsError ? <CardError label="Incidents & Alerts" /> :
                 !alertsReady && !incidentsReady ? <CardSkeleton label="Incidents & Alerts" /> :
                 <IncidentsCard alerts={alertItems} formalIncidents={mergedIncidents} onAckAlert={handleAckAlert} onResolveIncident={handleResolveIncident} />}

                {botsError ? <CardError label="Bot Fleet" /> :
                 !botsReady ? <CardSkeleton label="Bot Fleet" /> :
                 <BotFleetCard bots={fleetBots} onPauseBot={handlePauseBot} onStartBot={handleStartBot} onStopBot={handleStopBot} onNavigate={handleNavigate} />}
              </div>

            </div>
            {/* Training panel (inline, beside main layout) */}
            <TrainingPanel />
          </div>
        </div>
      </div>
    </>
  );
}
