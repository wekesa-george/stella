"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  getBot, getBotConfig, getBotPositions, getBotOrders, getBotEquityCurve, getBotBars,
  startBot, pauseBot, stopBot, deleteBot, placeManualOrder, updateBot
} from "@/lib/tradingEngineApi";
import { useBotChannel, usePositionChannel, useOrderChannel } from "@/hooks/usePhoenixChannel";
import { mapApiBotToUiBot } from "@/lib/api/mappers";
import type { Bot } from "@/lib/types/dashboard";
import { TokenIcon } from "@web3icons/react/dynamic";

// ─── SVG ICON COMPONENTS ─────────────────────────────────────────────────────
const Icon = ({ d, size = 16, stroke = "currentColor", fill = "none", strokeWidth = 1.5 }: {
  d: string | string[]; size?: number; stroke?: string; fill?: string; strokeWidth?: number;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const IcoOverview  = ({ size = 16 }: { size?: number }) => <Icon size={size} d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />;
const IcoTrading   = ({ size = 16 }: { size?: number }) => <Icon size={size} d={["M3 18l4-8 4 4 4-6 4 4","M3 6h18"]} />;
const IcoHistory   = ({ size = 16 }: { size?: number }) => <Icon size={size} d={["M12 2a10 10 0 1 0 10 10","M12 6v6l4 2","M22 2L12 12"]} />;
const IcoBack      = ({ size = 16 }: { size?: number }) => <Icon size={size} d="M19 12H5M12 19l-7-7 7-7" />;
const IcoPlay      = ({ size = 16 }: { size?: number }) => <Icon size={size} d="M5 3l14 9-14 9V3z" fill="currentColor" stroke="none" />;
const IcoPause     = ({ size = 16 }: { size?: number }) => <Icon size={size} d={["M6 4h4v16H6z","M14 4h4v16h-4z"]} fill="currentColor" stroke="none" />;
const IcoStop      = ({ size = 16 }: { size?: number }) => <Icon size={size} d="M4 4h16v16H4z" fill="currentColor" stroke="none" />;
const IcoTrash     = ({ size = 16 }: { size?: number }) => <Icon size={size} d={["M3 6h18","M8 6V4h8v2","M19 6l-1 14H6L5 6"]} />;
const IcoClose     = ({ size = 16 }: { size?: number }) => <Icon size={size} d="M18 6L6 18M6 6l12 12" />;
const IcoAlert     = ({ size = 16 }: { size?: number }) => <Icon size={size} d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />;
const IcoTerminal  = ({ size = 16 }: { size?: number }) => <Icon size={size} d={["M4 17l6-6-6-6","M12 19h8"]} />;
const IcoRefresh   = ({ size = 16 }: { size?: number }) => <Icon size={size} d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />;

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Position {
  id: string;
  pair: string;
  side: string;
  entry: number;
  current: number;
  qty: number;
  size: number;
  pnl: number;
  pnlPct: number;
  age: string;
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface ClosedPosition {
  id: string;
  side: string;
  pair: string;
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  closedAt: string;
  reason: string;
}

interface Order {
  id: string;
  side: string;
  pair: string;
  type: string;
  price: number;
  execPrice: number;
  qty: number;
  status: string;
  createdAt: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  running:        { color: "var(--green)",  bg: "var(--green-dim)",  border: "rgba(0,229,160,.3)",  label: "Running"        },
  paused:         { color: "var(--amber)",  bg: "var(--amber-dim)",  border: "rgba(245,166,35,.3)", label: "Paused"         },
  initializing:   { color: "var(--blue)",   bg: "var(--blue-dim)",   border: "rgba(61,157,243,.3)", label: "Initializing"   },
  stopping:       { color: "var(--blue)",   bg: "var(--blue-dim)",   border: "rgba(61,157,243,.3)", label: "Stopping"       },
  error:          { color: "var(--red)",    bg: "var(--red-dim)",    border: "rgba(255,71,87,.3)",  label: "Error"          },
  circuit_broken: { color: "var(--red)",    bg: "var(--red-dim)",    border: "rgba(255,71,87,.3)",  label: "Circuit Broken" },
  stopped:        { color: "var(--text2)",  bg: "var(--bg3)",        border: "var(--border2)",      label: "Stopped"        },
  maintenance:    { color: "var(--amber)",  bg: "var(--amber-dim)",  border: "rgba(245,166,35,.3)", label: "Maintenance"    },
};

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D"];
const TF_API_MAP: Record<string, string> = { "1m": "1Min", "5m": "5Min", "15m": "15Min", "1h": "1Hour", "4h": "4Hour", "1D": "1Day" };

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=DM+Sans:wght@300;400;500;600;700&display=swap');
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
.bot-detail-page { font-family:var(--sans); color:var(--text0); }
.bot-detail-page ::-webkit-scrollbar { width:4px; height:4px; }
.bot-detail-page ::-webkit-scrollbar-track { background:var(--bg1); }
.bot-detail-page ::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }

/* ── LAYOUT ── */
.bdp-page { display:flex; flex-direction:column; height:100vh; overflow:hidden; }

/* ── HEADER ── */
.bdp-hdr {
  height:var(--hdr-h); min-height:var(--hdr-h);
  background:var(--bg1); border-bottom:1px solid var(--border);
  display:flex; align-items:center; gap:0; padding:0 18px;
  z-index:50; flex-shrink:0;
}
.bdp-hdr-left { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
.bdp-breadcrumb { display:flex; align-items:center; gap:5px; font-family:var(--mono); font-size:9px; color:var(--text2); }
.bdp-breadcrumb-sep { color:var(--text3); }
.bdp-breadcrumb-link { color:var(--text2); cursor:pointer; transition:color .1s; background:none; border:none; font-family:var(--mono); font-size:9px; padding:0; }
.bdp-breadcrumb-link:hover { color:var(--text1); }
.bdp-breadcrumb-cur { color:var(--text1); }
.bdp-hdr-title { display:flex; align-items:center; gap:10px; min-width:0; }
.bdp-bot-id { font-family:var(--mono); font-size:14px; font-weight:600; color:var(--text0); letter-spacing:.04em; white-space:nowrap; }
.bdp-status-badge { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:2px; font-family:var(--mono); font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; border:1px solid; flex-shrink:0; }
.bdp-status-dot { width:5px; height:5px; border-radius:50%; }
.bdp-running .bdp-status-dot { animation:bdp-blink 2s infinite; }
@keyframes bdp-blink { 0%,100%{opacity:1} 50%{opacity:.4} }
.bdp-hdr-meta { font-family:var(--mono); font-size:9px; color:var(--text2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bdp-hdr-meta span { color:var(--text1); }
.bdp-hdr-actions { display:flex; gap:7px; align-items:center; flex-shrink:0; margin-left:16px; }
.bdp-back-btn { display:flex; align-items:center; gap:5px; padding:0 10px 0 0; color:var(--text2); cursor:pointer; border-right:1px solid var(--border); margin-right:12px; height:28px; transition:color .12s; flex-shrink:0; background:none; border-left:none; border-top:none; border-bottom:none; }
.bdp-back-btn:hover { color:var(--text0); }

/* ── BODY ── */
.bdp-body { display:flex; flex:1; overflow:hidden; }

/* ── SIDE NAV ── */
.bdp-sidenav {
  width:var(--nav-w); flex-shrink:0;
  background:var(--bg1); border-right:1px solid var(--border);
  display:flex; flex-direction:column; padding:10px 0;
  overflow:hidden; transition:width .2s;
}
.bdp-nav-item {
  display:flex; align-items:center; gap:10px;
  padding:11px 14px; cursor:pointer;
  border-left:2px solid transparent;
  transition:all .12s; position:relative; flex-shrink:0;
}
.bdp-nav-item:hover { background:var(--bg2); }
.bdp-nav-item:hover .bdp-nav-lbl { color:var(--text1); }
.bdp-nav-item.bdp-active { background:var(--green-dim); border-left-color:var(--green); }
.bdp-nav-item.bdp-active .bdp-nav-lbl { color:var(--green); }
.bdp-nav-item.bdp-active .bdp-nav-icon { color:var(--green); }
.bdp-nav-icon { color:var(--text2); flex-shrink:0; display:flex; align-items:center; }
.bdp-nav-item:hover .bdp-nav-icon { color:var(--text1); }
.bdp-nav-lbl { font-family:var(--mono); font-size:10px; font-weight:500; color:var(--text2); white-space:nowrap; letter-spacing:.04em; }
.bdp-nav-divider { height:1px; background:var(--border); margin:8px 0; }
.bdp-nav-status-pip { width:6px; height:6px; border-radius:50%; margin-left:auto; flex-shrink:0; }

/* ── CONTENT ── */
.bdp-content { flex:1; overflow-y:auto; background:var(--bg0); }
.bdp-tab-body { padding:20px; display:flex; flex-direction:column; gap:18px; }

/* ── CARDS ── */
.bdp-card { background:var(--bg1); border:1px solid var(--border); border-radius:4px; overflow:hidden; }
.bdp-card-hdr { padding:10px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:10px; }
.bdp-card-title { font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:var(--text1); }
.bdp-card-body { padding:16px; }
.bdp-card-body.bdp-np { padding:0; }

/* ── METRIC CARDS ── */
.bdp-metrics-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; }
.bdp-pair-card { background:var(--bg1); border:1px solid var(--border); border-radius:4px; padding:14px 16px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; position:relative; overflow:hidden; }
.bdp-pair-icons { display:flex; align-items:center; }
.bdp-pair-label { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--text0); letter-spacing:.04em; white-space:nowrap; }
.bdp-pair-exchange { font-family:var(--mono); font-size:8px; color:var(--text2); text-transform:uppercase; letter-spacing:.08em; }
.bdp-metric { background:var(--bg1); border:1px solid var(--border); border-radius:4px; padding:14px 16px; position:relative; overflow:hidden; }
.bdp-metric-lbl { font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.12em; color:var(--text2); margin-bottom:6px; }
.bdp-metric-val { font-family:var(--mono); font-size:22px; font-weight:600; line-height:1; }
.bdp-metric-sub { font-family:var(--mono); font-size:8px; color:var(--text2); margin-top:5px; }
.bdp-metric-accent { position:absolute; bottom:0; left:0; right:0; height:2px; }

/* ── EQUITY CHART ── */
.bdp-equity-chart { height:180px; }

/* ── TABLE ── */
.bdp-tbl-wrap { overflow-x:auto; }
.bdp-tbl { width:100%; border-collapse:collapse; min-width:560px; }
.bdp-tbl th { font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.1em; color:var(--text2); padding:8px 14px; text-align:left; border-bottom:1px solid var(--border); background:var(--bg2); white-space:nowrap; font-weight:500; }
.bdp-tbl th.bdp-r { text-align:right; }
.bdp-tbl td { padding:9px 14px; border-bottom:1px solid var(--border); font-size:12px; vertical-align:middle; }
.bdp-tbl tr:last-child td { border-bottom:none; }
.bdp-tbl tr:hover td { background:rgba(255,255,255,.015); }
.bdp-tbl td.bdp-mono { font-family:var(--mono); font-size:10px; }
.bdp-tbl td.bdp-r { text-align:right; }
.bdp-cell-pair { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--text0); }
.bdp-cell-id { font-family:var(--mono); font-size:9px; color:var(--text2); }

/* ── TAGS ── */
.bdp-tag { display:inline-flex; align-items:center; padding:2px 7px; border-radius:2px; font-family:var(--mono); font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; white-space:nowrap; }
.bdp-tag-green  { background:var(--green-dim); color:var(--green); }
.bdp-tag-amber  { background:var(--amber-dim); color:var(--amber); }
.bdp-tag-red    { background:var(--red-dim);   color:var(--red);   }
.bdp-tag-blue   { background:var(--blue-dim);  color:var(--blue);  }
.bdp-tag-ghost  { background:var(--bg3); color:var(--text1); border:1px solid var(--border2); }
.bdp-tag-long   { background:rgba(0,229,160,.12); color:var(--green); border:1px solid rgba(0,229,160,.2); }
.bdp-tag-short  { background:rgba(255,71,87,.12);  color:var(--red);   border:1px solid rgba(255,71,87,.2); }

/* ── BUTTONS ── */
.bdp-btn { padding:6px 12px; border-radius:3px; font-family:var(--mono); font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; cursor:pointer; border:1px solid; transition:all .12s; display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
.bdp-btn-ghost  { background:transparent; color:var(--text1); border-color:var(--border); }
.bdp-btn-ghost:hover { background:var(--bg3); color:var(--text0); border-color:var(--border2); }
.bdp-btn-green  { background:var(--green-dim); color:var(--green); border-color:rgba(0,229,160,.3); }
.bdp-btn-green:hover { background:var(--green); color:#000; }
.bdp-btn-amber  { background:var(--amber-dim); color:var(--amber); border-color:rgba(245,166,35,.3); }
.bdp-btn-amber:hover { background:var(--amber); color:#000; }
.bdp-btn-red    { background:var(--red-dim);   color:var(--red);   border-color:rgba(255,71,87,.3); }
.bdp-btn-red:hover { background:var(--red); color:#fff; }
.bdp-btn-blue   { background:var(--blue-dim);  color:var(--blue);  border-color:rgba(61,157,243,.3); }
.bdp-btn-blue:hover { background:var(--blue); color:#fff; }
.bdp-btn:disabled { opacity:.35; cursor:not-allowed; pointer-events:none; }
.bdp-btn-sm { padding:3px 8px; font-size:8px; }

/* ── CANDLESTICK CHART ── */
.bdp-chart-wrap { position:relative; height:480px; background:var(--bg2); overflow:hidden; }
.bdp-chart-svg { position:absolute; inset:0; }
.bdp-tf-bar { display:flex; gap:3px; align-items:center; }
.bdp-tf-btn { padding:3px 9px; font-family:var(--mono); font-size:9px; border-radius:2px; cursor:pointer; border:1px solid var(--border); background:transparent; color:var(--text2); transition:all .1s; }
.bdp-tf-btn:hover { color:var(--text1); border-color:var(--border2); }
.bdp-tf-btn.bdp-on { background:var(--green-dim); color:var(--green); border-color:rgba(0,229,160,.3); }
.bdp-crosshair-tooltip { position:absolute; pointer-events:none; background:var(--bg1); border:1px solid var(--border2); border-radius:3px; padding:6px 10px; font-family:var(--mono); font-size:9px; z-index:20; }

/* ── LOG PANEL ── */
.bdp-log-panel { background:var(--bg0); border:1px solid var(--border); border-radius:4px; overflow:hidden; }
.bdp-log-hdr { padding:8px 14px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; background:var(--bg2); }
.bdp-log-title { font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--text1); flex:1; display:flex; align-items:center; gap:7px; }
.bdp-log-live { display:inline-flex; align-items:center; gap:4px; font-size:8px; color:var(--green); }
.bdp-log-live-dot { width:5px; height:5px; border-radius:50%; background:var(--green); animation:bdp-blink 1.5s infinite; }
.bdp-log-filters { display:flex; gap:3px; }
.bdp-log-filter { padding:2px 7px; font-family:var(--mono); font-size:8px; cursor:pointer; border-radius:2px; border:1px solid transparent; transition:all .1s; background:none; }
.bdp-log-filter.bdp-all   { color:var(--text1); } .bdp-log-filter.bdp-all.bdp-on   { background:var(--bg3); border-color:var(--border2); color:var(--text0); }
.bdp-log-filter.bdp-info  { color:var(--blue); }  .bdp-log-filter.bdp-info.bdp-on  { background:var(--blue-dim); border-color:rgba(61,157,243,.3); }
.bdp-log-filter.bdp-warn  { color:var(--amber); } .bdp-log-filter.bdp-warn.bdp-on  { background:var(--amber-dim); border-color:rgba(245,166,35,.3); }
.bdp-log-filter.bdp-error { color:var(--red); }   .bdp-log-filter.bdp-error.bdp-on { background:var(--red-dim); border-color:rgba(255,71,87,.3); }
.bdp-log-body { height:200px; overflow-y:auto; padding:6px 0; }
.bdp-log-row { display:flex; align-items:flex-start; gap:10px; padding:2px 14px; font-family:var(--mono); font-size:9px; line-height:1.7; }
.bdp-log-row:hover { background:var(--bg2); }
.bdp-log-ts { color:var(--text3); flex-shrink:0; min-width:60px; }
.bdp-log-level { flex-shrink:0; min-width:50px; font-weight:600; }
.bdp-level-INFO    { color:var(--blue); }
.bdp-level-WARNING { color:var(--amber); }
.bdp-level-ERROR   { color:var(--red); }
.bdp-log-msg { color:var(--text1); word-break:break-all; }

/* ── MANUAL ORDER ── */
.bdp-order-panel { background:var(--bg2); border:1px solid var(--border); border-radius:4px; padding:14px 16px; display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap; }
.bdp-order-field { display:flex; flex-direction:column; gap:5px; }
.bdp-order-lbl { font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.1em; color:var(--text2); }
.bdp-order-inp { background:var(--bg1); border:1px solid var(--border); color:var(--text0); font-family:var(--mono); font-size:11px; padding:6px 10px; border-radius:3px; outline:none; width:140px; }
.bdp-order-inp:focus { border-color:var(--border2); }
.bdp-side-toggle { display:flex; border:1px solid var(--border); border-radius:3px; overflow:hidden; }
.bdp-side-opt { padding:6px 14px; font-family:var(--mono); font-size:9px; font-weight:600; text-transform:uppercase; cursor:pointer; transition:all .1s; background:none; border:none; }
.bdp-side-opt.bdp-long.bdp-on  { background:var(--green-dim); color:var(--green); }
.bdp-side-opt.bdp-short.bdp-on { background:var(--red-dim);   color:var(--red);   }
.bdp-side-opt:not(.bdp-on) { color:var(--text2); }
.bdp-pair-locked { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--text0); background:var(--bg3); border:1px solid var(--border); padding:6px 10px; border-radius:3px; display:flex; align-items:center; gap:6px; }

/* (config grid removed — bot details now in inline bar) */

/* ── MODAL ── */
.bdp-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.75); backdrop-filter:blur(4px); z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; }
.bdp-modal { background:var(--bg1); border:1px solid var(--border2); border-radius:5px; width:100%; max-width:460px; overflow:hidden; }
.bdp-modal-hdr { padding:14px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
.bdp-modal-title { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--text0); letter-spacing:.04em; }
.bdp-modal-body { padding:18px; }
.bdp-modal-footer { padding:12px 18px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; }
.bdp-modal-detail-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border); }
.bdp-modal-detail-row:last-child { border-bottom:none; }
.bdp-modal-detail-key { font-family:var(--mono); font-size:9px; color:var(--text2); text-transform:uppercase; }
.bdp-modal-detail-val { font-family:var(--mono); font-size:10px; color:var(--text0); }
.bdp-modal-warn { display:flex; gap:8px; padding:10px 12px; background:var(--red-dim); border:1px solid rgba(255,71,87,.2); border-radius:3px; font-family:var(--mono); font-size:9px; color:var(--red); line-height:1.6; margin-bottom:14px; }

/* ── EMPTY STATE ── */
.bdp-empty { padding:32px; text-align:center; }
.bdp-empty-ico { color:var(--text3); margin:0 auto 10px; display:flex; justify-content:center; }
.bdp-empty-lbl { font-family:var(--mono); font-size:10px; color:var(--text2); }

/* ── LOADING ── */
.bdp-loading { display:flex; align-items:center; justify-content:center; height:100vh; background:var(--bg0); }
.bdp-spinner { width:32px; height:32px; border:2px solid var(--border); border-top-color:var(--green); border-radius:50%; animation:bdp-spin 1s linear infinite; }
@keyframes bdp-spin { to { transform:rotate(360deg); } }
@keyframes bdp-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

/* ── RESPONSIVE ── */
@media (max-width:860px) {
  .bdp-sidenav { width:var(--nav-w-sm) !important; }
  .bdp-nav-lbl { display:none !important; }
  .bdp-nav-status-pip { display:none !important; }
  .bdp-metrics-grid { grid-template-columns:repeat(3,1fr) !important; }
  .bdp-order-logs-row { grid-template-columns:1fr !important; }
  .bdp-pos-order-logs-row { grid-template-columns:1fr !important; }
  .bdp-history-row { grid-template-columns:1fr !important; }
  .bdp-hdr-meta { display:none; }
  .bdp-order-inp { width:110px; }
}
@media (max-width:560px) {
  .bdp-metrics-grid { grid-template-columns:1fr 1fr !important; }
  .bdp-hdr-actions { gap:4px; }
  .bdp-btn { padding:5px 8px; font-size:8px; }
}
`;

// ─── CANDLESTICK CHART ────────────────────────────────────────────────────────
function CandlestickChart({ candles, positions }: { candles: Candle[]; positions: Position[] }) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 480 });
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) =>
      setDims({ w: e.contentRect.width, h: e.contentRect.height }));
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  if (candles.length === 0) return (
    <div className="bdp-chart-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)" }}>No candle data available</span>
    </div>
  );

  const PAD = { t: 16, r: 68, b: 60, l: 10 };
  const VPAD = 50;
  const chartH = dims.h - PAD.t - PAD.b - VPAD;
  const chartW = dims.w - PAD.l - PAD.r;

  const prices = candles.flatMap(c => [c.high, c.low]);
  const vols   = candles.map(c => c.volume);
  const pMin   = Math.min(...prices);
  const pMax   = Math.max(...prices);
  const vMax   = Math.max(...vols) || 1;
  const pRange = pMax - pMin || 1;

  const toX  = (i: number)  => PAD.l + (i / (candles.length - 1)) * chartW;
  const toY  = (p: number)  => PAD.t + (1 - (p - pMin) / pRange) * chartH;
  const toYV = (v: number)  => dims.h - PAD.b - (v / vMax) * (VPAD - 8);
  const candleW = Math.max(2, (chartW / candles.length) * 0.65);

  const currentPrice = candles[candles.length - 1]?.close;
  const priceY       = toY(currentPrice);

  const priceTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = (pMax - pMin) / 5;
    for (let i = 0; i <= 5; i++) ticks.push(pMin + step * i);
    return ticks;
  }, [pMin, pMax]);

  function onMouseMove(e: React.MouseEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - PAD.l;
    const idx = Math.round((x / chartW) * (candles.length - 1));
    if (idx >= 0 && idx < candles.length) setHover({ idx, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const hc = hover ? candles[hover.idx] : null;

  return (
    <div ref={wrapRef} className="bdp-chart-wrap" onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
      <svg ref={svgRef} className="bdp-chart-svg" width={dims.w} height={dims.h}>
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
        <div className="bdp-crosshair-tooltip" style={{
          left: hover.x + 12, top: PAD.t + 8,
          ...(hover.x > dims.w * 0.65 ? { left: "auto", right: 80 } : {}),
        }}>
          <div style={{ color: "var(--text2)", marginBottom: 4, fontSize: 8 }}>
            {new Date(hc.time).toLocaleTimeString()}
          </div>
          {([["O", hc.open],["H", hc.high],["L", hc.low],["C", hc.close]] as [string, number][]).map(([k, v]) => (
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
function EquityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const startVal = payload[0]?.payload?.startVal ?? val;
  const diff = val - startVal;
  const ts = payload[0]?.payload?.t;
  const timeLabel = ts ? new Date(ts).toLocaleString([], { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }) : "";
  return (
    <div style={{ background:"var(--bg1)", border:"1px solid var(--border2)", borderRadius:3, padding:"6px 10px", fontFamily:"var(--mono)", fontSize:9 }}>
      <div style={{ color:"var(--text2)", marginBottom:2 }}>{timeLabel}</div>
      <div style={{ color: diff >= 0 ? "var(--green)" : "var(--red)", fontWeight:600 }}>${val.toFixed(2)}</div>
      <div style={{ color: diff >= 0 ? "var(--green)" : "var(--red)", fontSize:8, opacity:.8 }}>
        {diff >= 0 ? "+" : ""}{diff.toFixed(2)} ({startVal > 0 ? ((diff / startVal) * 100).toFixed(2) : "0.00"}%)
      </div>
    </div>
  );
}

// ─── CLOSE POSITION MODAL ────────────────────────────────────────────────────
function ClosePositionModal({ position, onClose, onConfirm }: {
  position: Position; onClose: () => void; onConfirm: (id: string) => void;
}) {
  const pnlPos = position.pnl >= 0;
  return (
    <div className="bdp-modal-backdrop" onClick={(e: any) => e.target === e.currentTarget && onClose()}>
      <div className="bdp-modal">
        <div className="bdp-modal-hdr">
          <span className="bdp-modal-title">Close Position at Market</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text2)", cursor:"pointer" }}>
            <IcoClose size={16} />
          </button>
        </div>
        <div className="bdp-modal-body">
          <div className="bdp-modal-warn">
            <span style={{ flexShrink:0 }}><IcoAlert size={14} /></span>
            This will submit a market order to close the position immediately.
            Market orders execute at the current best bid/ask — you may receive
            a slightly different price than shown.
          </div>
          {([
            ["Position ID",    position.id],
            ["Pair",           position.pair],
            ["Side",           position.side],
            ["Entry Price",    `$${position.entry.toLocaleString()}`],
            ["Current Price",  `$${position.current.toLocaleString()}`],
            ["Size",           String(position.qty || position.size)],
            ["Unrealised P&L", `${pnlPos ? "+" : ""}$${position.pnl.toFixed(2)}`],
          ] as [string, string][]).map(([k, v]) => (
            <div className="bdp-modal-detail-row" key={k}>
              <span className="bdp-modal-detail-key">{k}</span>
              <span className="bdp-modal-detail-val"
                style={{ color: k.includes("P&L") ? (pnlPos ? "var(--green)" : "var(--red)") : "var(--text0)" }}>
                {v}
              </span>
            </div>
          ))}
        </div>
        <div className="bdp-modal-footer">
          <button className="bdp-btn bdp-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="bdp-btn bdp-btn-red" onClick={() => { onConfirm(position.id); onClose(); }}>
            <IcoStop size={12} /> Close at Market
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DELETE BOT MODAL ────────────────────────────────────────────────────────
function DeleteBotModal({ bot, onClose, onConfirm }: {
  bot: Bot; onClose: () => void; onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const handleConfirm = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };
  return (
    <div className="bdp-modal-backdrop" onClick={(e: any) => !deleting && e.target === e.currentTarget && onClose()}>
      <div className="bdp-modal">
        <div className="bdp-modal-hdr">
          <span className="bdp-modal-title" style={{ color:"var(--red)" }}>Delete Bot</span>
          <button onClick={onClose} disabled={deleting} style={{ background:"none", border:"none", color:"var(--text2)", cursor:"pointer", opacity: deleting ? 0.5 : 1 }}>
            <IcoClose size={16} />
          </button>
        </div>
        <div className="bdp-modal-body">
          <div className="bdp-modal-warn">
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
            disabled={deleting}
          />
        </div>
        <div className="bdp-modal-footer">
          <button className="bdp-btn bdp-btn-ghost" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="bdp-btn bdp-btn-red" disabled={typed !== bot.id || deleting} onClick={handleConfirm}
            style={{ display:"flex", alignItems:"center", gap:6 }}>
            {deleting ? <span style={{ display:"inline-block", width:12, height:12, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.6s linear infinite" }} /> : <IcoTrash size={12} />}
            {deleting ? "Deleting..." : "Delete Bot"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── POSITIONS TABLE ──────────────────────────────────────────────────────────
function PositionsTable({ positions, onClose, compact }: {
  positions: Position[]; onClose: (p: Position) => void; compact?: boolean;
}) {
  if (positions.length === 0)
    return (
      <div className="bdp-empty">
        <div className="bdp-empty-ico"><IcoOverview size={28} /></div>
        <div className="bdp-empty-lbl">No open positions</div>
      </div>
    );

  return (
    <div className="bdp-tbl-wrap">
      <table className="bdp-tbl">
        <thead>
          <tr>
            <th>Side</th>
            <th>Pair</th>
            <th className="bdp-r">Entry</th>
            <th className="bdp-r">Current</th>
            <th className="bdp-r">Size</th>
            <th className="bdp-r">P&amp;L</th>
            {!compact && <th>Age</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.id}>
              <td><span className={`bdp-tag ${p.side === "LONG" ? "bdp-tag-long" : "bdp-tag-short"}`}>{p.side}</span></td>
              <td><div className="bdp-cell-pair">{p.pair}</div>{!compact && <div className="bdp-cell-id">{p.id}</div>}</td>
              <td className="bdp-mono bdp-r">{p.entry.toLocaleString()}</td>
              <td className="bdp-mono bdp-r">{p.current.toLocaleString()}</td>
              <td className="bdp-mono bdp-r">{p.qty || p.size}</td>
              <td className="bdp-r">
                <span style={{ fontFamily:"var(--mono)", fontSize:10, fontWeight:600, color: p.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                  {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                </span>
              </td>
              {!compact && <td className="bdp-mono" style={{ color:"var(--text2)", fontSize:10 }}>{p.age}</td>}
              <td>
                <button className="bdp-btn bdp-btn-red bdp-btn-sm" onClick={() => onClose(p)}>Close</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MANUAL ORDER PANEL ──────────────────────────────────────────────────────
function ManualOrderPanel({ bot, botId }: { bot: Bot; botId: string }) {
  const [side, setSide] = useState("LONG");
  const [size, setSize] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const running = bot.status === "running";

  const handleSubmitOrder = async () => {
    if (!size) return;
    setOrderSubmitting(true);
    setOrderResult(null);
    try {
      const res = await placeManualOrder(botId, { side, size: parseFloat(size) });
      if (res.data) {
        const data = res.data as { price?: number; order_id?: string };
        setOrderResult({ type: "success", message: `Order filled @ $${data.price?.toFixed(2) || "market"}` });
        setSize("");
      } else {
        setOrderResult({ type: "error", message: res.error || "Order failed" });
      }
    } catch (e: any) {
      setOrderResult({ type: "error", message: e.message || "Network error" });
    } finally {
      setOrderSubmitting(false);
      setTimeout(() => setOrderResult(null), 5000);
    }
  };

  return (
    <div className="bdp-card" style={{ display:"flex", flexDirection:"column" }}>
      <div className="bdp-card-hdr">
        <span className="bdp-card-title">Manual Order</span>
        {!running && <span className="bdp-tag bdp-tag-amber" style={{ fontSize:7 }}>Stopped</span>}
      </div>
      <div className="bdp-card-body" style={{ padding:12, flex:1, display:"flex", flexDirection:"column", gap:10 }}>
        <div className="bdp-order-field">
          <div className="bdp-order-lbl">Pair</div>
          <div className="bdp-pair-locked">
            <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
              <rect x="1" y="5" width="8" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M3 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            {bot.pair || "--"}
          </div>
        </div>
        <div className="bdp-order-field">
          <div className="bdp-order-lbl">Side</div>
          <div className="bdp-side-toggle">
            <button className={`bdp-side-opt bdp-long ${side === "LONG" ? "bdp-on" : ""}`} onClick={() => { setSide("LONG"); setSize(""); }}>Long</button>
            <button className={`bdp-side-opt bdp-short ${side === "SHORT" ? "bdp-on" : ""}`} onClick={() => { setSide("SHORT"); setSize(""); }}>Short</button>
          </div>
        </div>
        <div className="bdp-order-field">
          <div className="bdp-order-lbl">Size (USDT)</div>
          <input className="bdp-order-inp" style={{ width:"100%" }} type="number" placeholder="0.00" value={size} onChange={e => setSize(e.target.value)} disabled={!running} />
        </div>
        <button className={`bdp-btn ${side === "LONG" ? "bdp-btn-green" : "bdp-btn-red"}`}
          disabled={!running || !size || orderSubmitting}
          style={{ width:"100%", justifyContent:"center" }}
          onClick={handleSubmitOrder}>
          {orderSubmitting ? "Submitting..." : (
            <>{side === "LONG" ? <IcoPlay size={11} /> : <IcoStop size={11} />} Submit {side}</>
          )}
        </button>
        {orderResult && (
          <div style={{ fontFamily:"var(--mono)", fontSize:9, padding:"6px 10px", borderRadius:3,
            background: orderResult.type === "success" ? "var(--green-dim)" : "var(--red-dim)",
            color: orderResult.type === "success" ? "var(--green)" : "var(--red)",
            border: `1px solid ${orderResult.type === "success" ? "rgba(0,229,160,.3)" : "rgba(255,71,87,.3)"}`,
          }}>
            {orderResult.message}
          </div>
        )}
        {!running && (
          <div style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--text2)", display:"flex", alignItems:"center", gap:5 }}>
            <IcoAlert size={10} />
            Bot must be running
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB 1: OVERVIEW ─────────────────────────────────────────────────────────
function TabOverview({ bot, botId, equity, positions, onClosePosition, logEvents, onEditCapital }: {
  bot: Bot; botId: string; equity: any[]; positions: Position[]; onClosePosition: (p: Position) => void; logEvents: any[]; onEditCapital?: () => void;
}) {
  const lastEquity  = equity[equity.length - 1]?.value ?? 0;
  const firstEquity = equity[0]?.value ?? 0;
  const profitable  = lastEquity >= firstEquity;
  const pnlPos      = bot.pnl >= 0;
  const startVal    = firstEquity;

  const equityWithStart = equity.map((e: any) => ({ ...e, startVal }));

  const gradId = "equityGrad";

  const metrics = [
    { label:"Session P&L", value:`${pnlPos ? "+" : ""}$${Math.abs(bot.pnl).toFixed(2)}`,
      color: pnlPos ? "var(--green)" : "var(--red)", accent: pnlPos ? "var(--green)" : "var(--red)",
      sub: `${pnlPos ? "+" : ""}${bot.allocatedCapital > 0 ? ((bot.pnl / bot.allocatedCapital) * 100).toFixed(2) : "0.00"}% on capital` },
    { label:"Win Rate", value:`${bot.winRate ?? 0}%`, color:"var(--blue)", accent:"var(--blue)", sub:`Last ${bot.trades ?? 0} trades` },
    { label:"Total Trades", value:bot.trades ?? 0, color:"var(--text0)", accent:"var(--text2)", sub:"Session only" },
    { label:"Open Positions", value:positions.length, color:"var(--amber)", accent:"var(--amber)", sub:"of 20 max" },
    { label:"Uptime", value:bot.uptime ?? "--", color:"var(--text0)", accent:"var(--green)", sub:"Since last start" },
  ];

  return (
    <div className="bdp-tab-body">
      {/* Bot Details Bar */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 16px", padding:"8px 12px", background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:4, fontFamily:"var(--mono)", fontSize:8, color:"var(--text2)" }}>
        {([
          ["Strategy", bot.strategy || "--"],
          ["Pair", bot.pair || "--"],
          ["Exchange", bot.exchange || "--"],
          ["Capital", `$${(bot.allocatedCapital ?? 0).toLocaleString()}`, true],
          ["User", bot.user || "--"],
          ["Created", bot.createdAt ? new Date(bot.createdAt).toLocaleDateString() : "--"],
        ] as [string, string, boolean?][]).map(([k, v, editable]) => (
          <span key={k} style={{ display:"inline-flex", gap:4, alignItems:"center", letterSpacing:".06em", textTransform:"uppercase" }}>
            {k}: <span style={{ color: editable ? "var(--blue)" : "var(--text1)", fontWeight:500, cursor: editable ? "pointer" : "default" }}
              onClick={editable ? onEditCapital : undefined}
              title={editable ? "Click to edit" : undefined}>{v}{editable && <span style={{ fontSize:7, marginLeft:3, opacity:.6 }}>&#9998;</span>}</span>
          </span>
        ))}
      </div>

      {/* Metrics */}
      <div className="bdp-metrics-grid">
        {metrics.map(m => (
          <div className="bdp-metric" key={m.label}>
            <div className="bdp-metric-lbl">{m.label}</div>
            <div className="bdp-metric-val" style={{ color: m.color }}>{m.value}</div>
            <div className="bdp-metric-sub">{m.sub}</div>
            <div className="bdp-metric-accent" style={{ background: m.accent }} />
          </div>
        ))}
      </div>

      {/* Equity Curve */}
      <div className="bdp-card">
        <div className="bdp-card-hdr">
          <span className="bdp-card-title">Session Equity Curve</span>
          <span style={{ fontFamily:"var(--mono)", fontSize:9, color: profitable ? "var(--green)" : "var(--red)" }}>
            {profitable ? "▲" : "▼"} {profitable ? "+" : ""}${(lastEquity - firstEquity).toFixed(2)}
          </span>
        </div>
        <div className="bdp-card-body" style={{ padding:"16px 16px 8px" }}>
          <div className="bdp-equity-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityWithStart} margin={{ top: 4, right: 10, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={profitable ? "#00e5a0" : "#ff4757"} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={profitable ? "#00e5a0" : "#ff4757"} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="#1e2d40" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize:8, fontFamily:"IBM Plex Mono", fill:"#5a7090" }} tickLine={false} axisLine={false} interval={Math.max(1, Math.floor(equity.length / 8))}
                  tickFormatter={(t: number) => {
                    const d = new Date(t);
                    const spanMs = equity.length > 1 ? equity[equity.length-1].t - equity[0].t : 0;
                    if (spanMs > 86400000) {
                      return d.toLocaleDateString([], { month:"short", day:"numeric" }) + " " + d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
                    }
                    return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
                  }} />
                <YAxis tick={{ fontSize:8, fontFamily:"IBM Plex Mono", fill:"#5a7090" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${(v/1000).toFixed(1)}k`} domain={["auto","auto"]} />
                {startVal > 0 && <ReferenceLine y={startVal} stroke="#253550" strokeDasharray="4 3" />}
                <Tooltip content={<EquityTooltip />} />
                <Area type="monotone" dataKey="value" stroke={profitable ? "#00e5a0" : "#ff4757"} strokeWidth={1.5}
                  fill={`url(#${gradId})`} dot={false} activeDot={{ r:3, fill: profitable ? "#00e5a0" : "#ff4757" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Open Positions | Manual Order | Bot Logs — all on same row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 240px minmax(0,.85fr)", gap:14 }} className="bdp-pos-order-logs-row">
        <div className="bdp-card" style={{ minWidth:0 }}>
          <div className="bdp-card-hdr">
            <span className="bdp-card-title">Open Positions <span style={{ color:"var(--text2)", fontWeight:400 }}>({positions.length})</span></span>
          </div>
          <div className="bdp-card-body bdp-np">
            <PositionsTable positions={positions} onClose={onClosePosition} compact />
          </div>
        </div>
        <ManualOrderPanel bot={bot} botId={botId} />
        <LogStream botId={botId} logEvents={logEvents} />
      </div>
    </div>
  );
}

// ─── LOG STREAM ───────────────────────────────────────────────────────────────
function LogStream({ botId, logEvents }: { botId: string; logEvents: any[] }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const CATEGORY_COLORS: Record<string, string> = {
    lifecycle: "#3d9df3", signal: "#a78bfa", trade: "#00e5a0",
    exit: "#f5a623", risk: "#ff4757", error: "#ff4757", system: "#5a7090",
  };

  // Load initial logs from API
  useEffect(() => {
    (async () => {
      try {
        const { getBotLogs } = await import("@/lib/tradingEngineApi");
        const result = await getBotLogs(botId);
        if (result.data && Array.isArray(result.data)) {
          setLogs([...result.data].reverse().map((l: any, i: number) => ({
            id: l.id || i,
            level: (l.level || "INFO").toUpperCase(),
            category: l.category || "",
            msg: l.message || l.msg || JSON.stringify(l),
            metadata: l.metadata || null,
            ts: l.timestamp || l.created_at ? new Date(l.timestamp || l.created_at).toLocaleTimeString() : new Date().toLocaleTimeString(),
          })));
        }
      } catch {
        // No logs available yet
      }
    })();
  }, [botId]);

  // Append WS log events
  useEffect(() => {
    if (logEvents.length > 0) {
      const latest = logEvents[logEvents.length - 1];
      setLogs(prev => {
        const next = [...prev, {
          id: Date.now(),
          level: (latest.level || "INFO").toUpperCase(),
          category: latest.category || "",
          msg: latest.message || latest.msg || JSON.stringify(latest),
          metadata: latest.metadata || null,
          ts: new Date().toLocaleTimeString(),
        }];
        return next.slice(-150);
      });
    }
  }, [logEvents]);

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

  const hasMetadata = (m: any) => m && typeof m === "object" && Object.keys(m).length > 0;

  return (
    <div className="bdp-log-panel">
      <div className="bdp-log-hdr">
        <div className="bdp-log-title">
          <IcoTerminal size={13} />
          Bot Log
          <span className="bdp-log-live"><span className="bdp-log-live-dot" />Live</span>
        </div>
        <div className="bdp-log-filters">
          {([["ALL","bdp-all",null],["INFO","bdp-info",counts.INFO],["WARN","bdp-warn",counts.WARN],["ERROR","bdp-error",counts.ERROR]] as [string,string,number|null][]).map(([key,cls,count]) => (
            <button key={key} className={`bdp-log-filter ${cls} ${filter === key ? "bdp-on" : ""}`}
              onClick={() => setFilter(key)}>
              {key}{count !== null ? ` (${count})` : ""}
            </button>
          ))}
        </div>
        <label style={{ display:"flex", alignItems:"center", gap:5, fontFamily:"var(--mono)", fontSize:8, color:"var(--text2)", cursor:"pointer", marginLeft:8 }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} style={{ accentColor:"var(--green)" }} />
          Auto-scroll
        </label>
      </div>
      <div className="bdp-log-body" ref={bodyRef}>
        {visible.length === 0
          ? <div style={{ padding:"20px", textAlign:"center", fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>No {filter} logs</div>
          : visible.map((l: any) => (
          <div key={l.id} style={{ borderBottom:"1px solid var(--border)" }}>
            <div className="bdp-log-row" style={{ cursor: hasMetadata(l.metadata) ? "pointer" : "default" }}
              onClick={() => hasMetadata(l.metadata) && setExpandedId(expandedId === l.id ? null : l.id)}>
              <span className="bdp-log-ts">{l.ts}</span>
              <span className={`bdp-log-level bdp-level-${l.level}`}>{l.level === "WARNING" ? "WARN" : l.level}</span>
              {l.category && (
                <span style={{
                  flexShrink:0, padding:"1px 5px", borderRadius:2, fontSize:8, fontWeight:700,
                  textTransform:"uppercase", letterSpacing:".08em", fontFamily:"var(--mono)",
                  color: CATEGORY_COLORS[l.category] || "var(--text2)",
                  background: `${CATEGORY_COLORS[l.category] || "var(--text2)"}18`,
                }}>{l.category}</span>
              )}
              <span className="bdp-log-msg">{l.msg}</span>
              {hasMetadata(l.metadata) && (
                <span style={{ flexShrink:0, fontSize:9, color:"var(--text3)", marginLeft:"auto" }}>
                  {expandedId === l.id ? "▼" : "▶"}
                </span>
              )}
            </div>
            {expandedId === l.id && hasMetadata(l.metadata) && (
              <div style={{ padding:"0 14px 8px 85px" }}>
                <pre style={{
                  fontFamily:"var(--mono)", fontSize:9, color:"var(--text1)",
                  background:"var(--bg0)", border:"1px solid var(--border)",
                  borderRadius:3, padding:"6px 10px", overflowX:"auto", margin:0,
                }}>{JSON.stringify(l.metadata, null, 2)}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TAB 2: TRADING ───────────────────────────────────────────────────────────
function TabTrading({ bot, botId, positions, onClosePosition, logEvents }: {
  bot: Bot; botId: string; positions: Position[]; onClosePosition: (p: Position) => void; logEvents: any[];
}) {
  const [tf, setTf] = useState("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadingCandles, setLoadingCandles] = useState(false);

  const loadCandles = useCallback(async (timeframe: string) => {
    setLoadingCandles(true);
    try {
      const apiTf = TF_API_MAP[timeframe] || "5Min";
      const result = await getBotBars(botId, apiTf, 120);
      if (result.data && Array.isArray(result.data)) {
        setCandles(result.data.map((b: any) => ({
          open: Number(b.open ?? b.o),
          high: Number(b.high ?? b.h),
          low: Number(b.low ?? b.l),
          close: Number(b.close ?? b.c),
          volume: Number(b.volume ?? b.v ?? 0),
          time: new Date(b.time ?? b.t ?? b.timestamp).getTime(),
        })));
      }
    } catch {
      // Bars endpoint may not be available
    } finally {
      setLoadingCandles(false);
    }
  }, [botId]);

  useEffect(() => {
    loadCandles(tf);
  }, [tf, loadCandles]);

  return (
    <div className="bdp-tab-body">
      {/* Chart */}
      <div className="bdp-card">
        <div className="bdp-card-hdr">
          <span className="bdp-card-title">{bot.pair || "--"} · {bot.exchange || "--"}</span>
          <div className="bdp-tf-bar">
            {TIMEFRAMES.map(t => (
              <button key={t} className={`bdp-tf-btn ${tf === t ? "bdp-on" : ""}`} onClick={() => setTf(t)}>{t}</button>
            ))}
          </div>
        </div>
        {loadingCandles ? (
          <div className="bdp-chart-wrap" style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div className="bdp-spinner" />
          </div>
        ) : (
          <CandlestickChart candles={candles} positions={positions} />
        )}
      </div>

      {/* Open Positions | Manual Order | Bot Logs — all on same row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 240px minmax(0,.85fr)", gap:14 }} className="bdp-pos-order-logs-row">
        <div className="bdp-card" style={{ minWidth:0 }}>
          <div className="bdp-card-hdr">
            <span className="bdp-card-title">Open Positions ({positions.length})</span>
          </div>
          <div className="bdp-card-body bdp-np">
            <PositionsTable positions={positions} onClose={onClosePosition} compact={false} />
          </div>
        </div>
        <ManualOrderPanel bot={bot} botId={botId} />
        <LogStream botId={botId} logEvents={logEvents} />
      </div>
    </div>
  );
}

// ─── TAB 3: HISTORY ───────────────────────────────────────────────────────────
function TabHistory({ botId }: { botId: string }) {
  const [closed, setClosed] = useState<ClosedPosition[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [posResult, ordResult] = await Promise.all([
          getBotPositions(botId),
          getBotOrders(botId),
        ]);

        // Map closed positions (status = closed/liquidated)
        if (posResult.data && Array.isArray(posResult.data)) {
          const closedPos = posResult.data
            .filter((p: any) => p.status === "closed" || p.status === "liquidated")
            .map((p: any) => ({
              id: p.id ?? p.position_id ?? "",
              side: (p.side ?? "LONG").toUpperCase(),
              pair: p.symbol ?? p.pair ?? "",
              entry: Number(p.entry_price ?? p.entry ?? 0),
              exit: Number(p.exit_price ?? p.close_price ?? 0),
              qty: Number(p.quantity ?? p.size ?? 0),
              pnl: Number(p.realized_pnl ?? p.pnl ?? 0),
              closedAt: p.closed_at ? new Date(p.closed_at).toLocaleString() : "--",
              reason: p.close_reason ?? p.reason ?? "--",
            }));
          setClosed(closedPos);
        }

        // Map orders
        if (ordResult.data && Array.isArray(ordResult.data)) {
          setOrders(ordResult.data.map((o: any) => ({
            id: o.order_id ?? o.id ?? "",
            side: (o.side ?? "BUY").toUpperCase(),
            pair: o.trading_pair ?? o.symbol ?? o.pair ?? "",
            type: (o.order_type ?? o.type ?? "MARKET").toUpperCase(),
            price: Number(o.order_price || o.price || o.limit_price || 0),
            execPrice: Number(o.execution_price || o.avg_fill_price || 0),
            qty: Number(o.order_size ?? o.filled_quantity ?? o.quantity ?? o.qty ?? 0),
            status: (o.order_status ?? o.status ?? "UNKNOWN").toUpperCase(),
            createdAt: o.timestamp ? new Date(o.timestamp).toLocaleString() : o.created_at ? new Date(o.created_at).toLocaleString() : "--",
          })));
        }
      } catch {
        // History data not available
      } finally {
        setLoading(false);
      }
    })();
  }, [botId]);

  const statusCls = (s: string) => {
    if (s === "FILLED") return "bdp-tag-green";
    if (s === "FAILED" || s === "CANCELLED") return "bdp-tag-red";
    return "bdp-tag-blue";
  };

  if (loading) {
    return (
      <div className="bdp-tab-body" style={{ alignItems:"center", justifyContent:"center", minHeight:200 }}>
        <div className="bdp-spinner" />
      </div>
    );
  }

  return (
    <div className="bdp-tab-body">
      {/* Closed positions */}
      <div className="bdp-card">
        <div className="bdp-card-hdr">
          <span className="bdp-card-title">Closed Positions <span style={{ color:"var(--text2)", fontWeight:400 }}>({closed.length})</span></span>
        </div>
        <div className="bdp-card-body bdp-np">
          {closed.length === 0 ? (
            <div className="bdp-empty">
              <div className="bdp-empty-lbl">No closed positions yet</div>
            </div>
          ) : (
            <div className="bdp-tbl-wrap">
              <table className="bdp-tbl">
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Pair</th>
                    <th className="bdp-r">Entry</th>
                    <th className="bdp-r">Exit</th>
                    <th className="bdp-r">Size</th>
                    <th className="bdp-r">Realised P&L</th>
                    <th>Reason</th>
                    <th>Closed At</th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map(p => (
                    <tr key={p.id}>
                      <td><span className={`bdp-tag ${p.side === "LONG" ? "bdp-tag-long" : "bdp-tag-short"}`}>{p.side}</span></td>
                      <td><div className="bdp-cell-pair">{p.pair}</div><div className="bdp-cell-id">{p.id}</div></td>
                      <td className="bdp-mono bdp-r">{p.entry.toFixed(2)}</td>
                      <td className="bdp-mono bdp-r">{p.exit.toFixed(2)}</td>
                      <td className="bdp-mono bdp-r">{p.qty}</td>
                      <td className="bdp-r">
                        <span style={{ fontFamily:"var(--mono)", fontSize:10, fontWeight:600, color: p.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                          {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                        </span>
                      </td>
                      <td><span className="bdp-tag bdp-tag-ghost" style={{ fontSize:7 }}>{p.reason}</span></td>
                      <td className="bdp-mono" style={{ color:"var(--text2)", fontSize:9 }}>{p.closedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Order history */}
      <div className="bdp-card">
        <div className="bdp-card-hdr">
          <span className="bdp-card-title">Order History <span style={{ color:"var(--text2)", fontWeight:400 }}>({orders.length})</span></span>
        </div>
        <div className="bdp-card-body bdp-np">
          {orders.length === 0 ? (
            <div className="bdp-empty">
              <div className="bdp-empty-lbl">No orders yet</div>
            </div>
          ) : (
            <div className="bdp-tbl-wrap">
              <table className="bdp-tbl">
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Pair</th>
                    <th>Type</th>
                    <th className="bdp-r">Order Price</th>
                    <th className="bdp-r">Fill Price</th>
                    <th className="bdp-r">Qty</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td>
                        <span className={`bdp-tag ${o.side === "BUY" ? "bdp-tag-long" : "bdp-tag-short"}`}>{o.side}</span>
                      </td>
                      <td><div className="bdp-cell-pair">{o.pair}</div><div className="bdp-cell-id">{o.id}</div></td>
                      <td className="bdp-mono" style={{ fontSize:9, color:"var(--text2)" }}>{o.type}</td>
                      <td className="bdp-mono bdp-r">{o.price > 0 ? `$${o.price.toLocaleString()}` : '--'}</td>
                      <td className="bdp-mono bdp-r" style={{ color: o.execPrice > 0 ? "var(--green, #00e5a0)" : "var(--text3)" }}>{o.execPrice > 0 ? `$${o.execPrice.toLocaleString()}` : '--'}</td>
                      <td className="bdp-mono bdp-r">{o.qty}</td>
                      <td><span className={`bdp-tag ${statusCls(o.status)}`}>{o.status}</span></td>
                      <td className="bdp-mono" style={{ color:"var(--text2)", fontSize:9 }}>{o.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ACTION BUTTONS ───────────────────────────────────────────────────────────
function ActionButtons({ bot, onPauseResume, onStop, onStart, onDelete }: {
  bot: Bot; onPauseResume: () => void; onStop: () => void; onStart: () => void; onDelete: () => void;
}) {
  const status = bot.status;

  if (status === "running") return (
    <>
      <button className="bdp-btn bdp-btn-amber" onClick={onPauseResume}>
        <IcoPause size={11} /> Pause
      </button>
      <button className="bdp-btn bdp-btn-red" onClick={onStop}>
        <IcoStop size={11} /> Stop
      </button>
    </>
  );
  if (status === "paused") return (
    <>
      <button className="bdp-btn bdp-btn-green" onClick={onPauseResume}>
        <IcoPlay size={11} /> Resume
      </button>
      <button className="bdp-btn bdp-btn-red" onClick={onStop}>
        <IcoStop size={11} /> Stop
      </button>
    </>
  );
  if (status === "stopped") return (
    <>
      <button className="bdp-btn bdp-btn-green" onClick={onStart}>
        <IcoPlay size={11} /> Start
      </button>
      <button className="bdp-btn bdp-btn-red" onClick={onDelete}>
        <IcoTrash size={11} /> Delete
      </button>
    </>
  );
  if (status === "initializing" || status === "stopping") return (
    <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--blue)" }}>
      {status === "initializing" ? "Initializing…" : "Stopping…"}
    </span>
  );
  if (status === "error" || status === "circuit_broken") return (
    <>
      <button className="bdp-btn bdp-btn-green" onClick={onStart}>
        <IcoRefresh size={11} /> Retry
      </button>
      <button className="bdp-btn bdp-btn-red" onClick={onDelete}>
        <IcoTrash size={11} /> Delete
      </button>
    </>
  );
  return null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatAge(timestamp: string | undefined): string {
  if (!timestamp) return "--";
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 0 || isNaN(diff)) return "--";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

// ─── SKELETON / ERROR COMPONENTS ──────────────────────────────────────────────
function BdpSectionSkeleton({ label }: { label?: string }) {
  return (
    <div className="bdp-card">
      <div className="bdp-card-hdr">
        <span className="bdp-card-title">{label ?? ""}</span>
      </div>
      <div className="bdp-card-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ width: "60%", height: 16, background: "var(--bg3)", borderRadius: 3, animation: "bdp-pulse 1.5s ease-in-out infinite" }} />
          <div style={{ width: "40%", height: 8, background: "var(--bg3)", borderRadius: 2, animation: "bdp-pulse 1.5s ease-in-out infinite", animationDelay: "0.3s" }} />
        </div>
      </div>
    </div>
  );
}

function BdpSectionError({ label }: { label?: string }) {
  return (
    <div className="bdp-card">
      <div className="bdp-card-hdr">
        <span className="bdp-card-title">{label ?? ""}</span>
      </div>
      <div className="bdp-card-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--red)", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Failed to load data
        </span>
      </div>
    </div>
  );
}

function BdpMetricSkeleton({ label }: { label?: string }) {
  return (
    <div className="bdp-metric">
      <div className="bdp-metric-lbl">{label ?? ""}</div>
      <div style={{ width: "60%", height: 22, background: "var(--bg3)", borderRadius: 3, animation: "bdp-pulse 1.5s ease-in-out infinite", marginBottom: 6 }} />
      <div style={{ width: "40%", height: 8, background: "var(--bg3)", borderRadius: 2, animation: "bdp-pulse 1.5s ease-in-out infinite", animationDelay: "0.3s" }} />
      <div className="bdp-metric-accent" style={{ background: "var(--bg3)" }} />
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function BotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const botId = params.id as string;

  const [bot, setBot] = useState<Bot | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [equityCurve, setEquityCurve] = useState<any[]>([]);
  const [equityRange, setEquityRange] = useState<"1h"|"6h"|"24h"|"7d"|"all">("24h");
  const [chartMode, setChartMode] = useState<"equity" | "candles">("equity");
  const [closeModal, setCloseModal] = useState<Position | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [capitalModal, setCapitalModal] = useState(false);
  const [capitalInput, setCapitalInput] = useState("");
  const [capitalSaving, setCapitalSaving] = useState(false);
  const [gridConfigModal, setGridConfigModal] = useState(false);
  const [gridConfigSaving, setGridConfigSaving] = useState(false);
  const [gridConfigDraft, setGridConfigDraft] = useState<Record<string, any>>({});
  const [botLoading, setBotLoading] = useState(true);
  const [botError, setBotError] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [positionsError, setPositionsError] = useState(false);
  const [equityLoading, setEquityLoading] = useState(true);
  const [equityError, setEquityError] = useState(false);

  // Candlestick state
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tf, setTf] = useState("5m");
  const [loadingCandles, setLoadingCandles] = useState(false);

  // History state
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState(false);

  // Real-time WS hooks
  const { snapshot: wsSnapshot, logEvents } = useBotChannel(botId);
  const { positions: wsPositions, closePosition: wsClosePosition } = usePositionChannel(botId);
  const { orders: wsOrders } = useOrderChannel(botId);

  // Load bot data from real API — independent fetches
  useEffect(() => {
    (async () => {
      try {
        const [botResult, configResult] = await Promise.all([
          getBot(botId),
          getBotConfig(botId).catch(() => ({ data: null })),
        ]);
        if (botResult.data) {
          const mappedBot = mapApiBotToUiBot(botResult.data);
          // Merge config from dedicated endpoint if the main response lacks it
          if (configResult.data) {
            const raw = configResult.data as any;
            const cfg = raw.config ?? raw;
            if (cfg && typeof cfg === "object" && Object.keys(cfg).length > 0) {
              mappedBot.config = { ...mappedBot.config, ...cfg };
            }
          }
          setBot(mappedBot);
        } else {
          setBotError(true);
        }
      } catch {
        setBotError(true);
      } finally {
        setBotLoading(false);
      }
    })();
  }, [botId]);

  useEffect(() => {
    (async () => {
      try {
        const posResult = await getBotPositions(botId);
        if (posResult.data && Array.isArray(posResult.data)) {
          setPositions(posResult.data
            .filter((p: any) => !p.status || p.status === "open")
            .map((p: any) => ({
              id: p.id ?? p.position_id ?? "",
              pair: p.symbol ?? p.pair ?? "",
              side: (p.side ?? "LONG").toUpperCase(),
              entry: Number(p.entry_price ?? p.entry ?? 0),
              current: Number(p.current_price ?? p.mark_price ?? p.entry_price ?? 0),
              qty: Number(p.quantity ?? p.size ?? 0),
              size: Number(p.quantity ?? p.size ?? 0),
              pnl: Number(p.unrealized_pnl ?? p.pnl ?? 0),
              pnlPct: Number(p.pnl_pct ?? 0),
              age: formatAge(p.opened_at),
            })));
        }
      } catch {
        setPositionsError(true);
      } finally {
        setPositionsLoading(false);
      }
    })();
  }, [botId]);

  useEffect(() => {
    (async () => {
      setEquityLoading(true);
      try {
        const rangeMs: Record<string, number> = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000 };
        const since = equityRange !== "all" ? new Date(Date.now() - rangeMs[equityRange]).toISOString() : undefined;
        const curveResult = await getBotEquityCurve(botId, since);
        if (curveResult.data && Array.isArray(curveResult.data) && curveResult.data.length > 0) {
          const meaningful = curveResult.data
            .map((s: any) => ({
              t: new Date(s.snapshot_at).getTime(),
              value: Number(s.total_equity_usd),
            }))
            .filter((p: any) => p.value > 0);
          setEquityCurve(meaningful.length > 0 ? meaningful : [{ t: Date.now(), value: 0 }]);
        }
      } catch {
        setEquityError(true);
      } finally {
        setEquityLoading(false);
      }
    })();
  }, [botId, equityRange]);

  // Set equity fallback once bot loads (if equity curve is empty/default)
  useEffect(() => {
    if (bot && !equityLoading && equityCurve.length <= 1 && equityCurve[0]?.value === 0) {
      const currentEquity = (bot.allocatedCapital || 0) + (bot.pnl || 0);
      setEquityCurve([{ t: Date.now(), value: currentEquity || 0 }]);
    }
  }, [bot, equityLoading, equityCurve]);

  // Update bot from WS snapshots + append equity point
  useEffect(() => {
    if (wsSnapshot && bot) {
      setBot(prev => {
        if (!prev) return prev;
        const totalPnl = wsSnapshot.total_pnl ?? wsSnapshot.pnl_usd ?? prev.pnl;
        const totalTrades = wsSnapshot.total_trades ?? wsSnapshot.trade_count ?? prev.trades;
        const activeCapital = wsSnapshot.active_capital ?? prev.activeCapital;
        return {
          ...prev,
          status: (wsSnapshot.status as any) ?? prev.status,
          pnl: totalPnl,
          pnlPct: activeCapital > 0 ? Math.round((totalPnl / activeCapital) * 10000) / 100 : prev.pnlPct,
          openPositions: wsSnapshot.open_positions ?? prev.openPositions,
          trades: totalTrades,
          winningTrades: wsSnapshot.winning_trades ?? prev.winningTrades,
          losingTrades: wsSnapshot.losing_trades ?? prev.losingTrades,
          winRate: totalTrades > 0
            ? Math.round(((wsSnapshot.winning_trades ?? prev.winningTrades) / totalTrades) * 1000) / 10
            : prev.winRate,
          activeCapital,
          allocatedCapital: wsSnapshot.allocated_capital || prev.allocatedCapital,
          errorCount: wsSnapshot.error_count ?? prev.errorCount,
          lastError: wsSnapshot.last_error ?? prev.lastError,
        };
      });

      // Use || instead of ?? so that 0 falls through to the real value
      const allocCap = wsSnapshot.allocated_capital || bot.allocatedCapital || 0;
      const totalPnl = (wsSnapshot.total_pnl ?? wsSnapshot.pnl_usd ?? bot.pnl) || 0;
      const liveEquity = allocCap + totalPnl;
      // Only append equity point when we have meaningful capital data
      if (allocCap > 0) {
        setEquityCurve(prev => {
          const next = [...prev, { t: Date.now(), value: liveEquity }];
          return next.length > 500 ? next.slice(next.length - 500) : next;
        });
      }
    }
  }, [wsSnapshot]);

  // Overlay WS position updates
  useEffect(() => {
    if (wsPositions.length > 0) {
      setPositions(wsPositions.map((p: any) => ({
        id: p.id,
        pair: p.symbol,
        side: p.side.toUpperCase(),
        entry: Number(p.entry_price),
        current: Number(p.current_price),
        qty: Number(p.quantity),
        size: Number(p.quantity),
        pnl: Number(p.unrealized_pnl),
        pnlPct: 0,
        age: formatAge(p.opened_at),
      })));
    }
  }, [wsPositions]);

  // Overlay WS order updates into order history
  useEffect(() => {
    if (wsOrders.length > 0) {
      setOrderHistory(prev => {
        const existingIds = new Set(prev.map(o => o.id));
        const mapped = wsOrders
          .filter((o: any) => !existingIds.has(o.id))
          .map((o: any) => ({
            id: o.id ?? o.order_id ?? "",
            side: (o.side ?? "BUY").toUpperCase(),
            pair: o.trading_pair ?? o.symbol ?? o.pair ?? "",
            type: (o.order_type ?? o.type ?? "MARKET").toUpperCase(),
            price: Number(o.execution_price ?? o.price ?? o.avg_fill_price ?? 0),
            qty: Number(o.quantity ?? o.filled_quantity ?? o.qty ?? 0),
            status: (o.status ?? "UNKNOWN").toUpperCase(),
            createdAt: o.created_at ? new Date(o.created_at).toLocaleString() : "--",
          }));
        if (mapped.length === 0) {
          // Update statuses of existing orders
          const wsMap = new Map(wsOrders.map((o: any) => [o.id ?? o.order_id, o]));
          return prev.map(o => {
            const ws = wsMap.get(o.id);
            return ws ? { ...o, status: (ws.status ?? o.status).toUpperCase(), price: Number(ws.execution_price ?? ws.price ?? o.price) } : o;
          });
        }
        return [...mapped, ...prev];
      });
    }
  }, [wsOrders]);

  // Move closed positions from open to closed list via WS
  useEffect(() => {
    if (wsPositions.length > 0) {
      const closed = wsPositions.filter((p: any) => p.status === "closed" || p.status === "liquidated");
      if (closed.length > 0) {
        setClosedPositions(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newClosed = closed
            .filter((p: any) => !existingIds.has(p.id))
            .map((p: any) => ({
              id: p.id ?? "",
              side: (p.side ?? "LONG").toUpperCase(),
              pair: p.symbol ?? p.pair ?? "",
              entry: Number(p.entry_price ?? 0),
              exit: Number(p.exit_price ?? p.close_price ?? 0),
              qty: Number(p.quantity ?? p.size ?? 0),
              pnl: Number(p.realized_pnl ?? p.pnl ?? 0),
              closedAt: p.closed_at ? new Date(p.closed_at).toLocaleString() : "--",
              reason: p.close_reason ?? p.reason ?? "--",
            }));
          return newClosed.length > 0 ? [...newClosed, ...prev] : prev;
        });
      }
    }
  }, [wsPositions]);

  // Load candles when timeframe changes
  const loadCandles = useCallback(async (timeframe: string) => {
    setLoadingCandles(true);
    try {
      const apiTf = TF_API_MAP[timeframe] || "5Min";
      const result = await getBotBars(botId, apiTf, 120);
      if (result.data && Array.isArray(result.data)) {
        setCandles(result.data.map((b: any) => ({
          open: Number(b.open ?? b.o),
          high: Number(b.high ?? b.h),
          low: Number(b.low ?? b.l),
          close: Number(b.close ?? b.c),
          volume: Number(b.volume ?? b.v ?? 0),
          time: new Date(b.time ?? b.t ?? b.timestamp).getTime(),
        })));
      }
    } catch {
      // Bars endpoint may not be available
    } finally {
      setLoadingCandles(false);
    }
  }, [botId]);

  useEffect(() => {
    if (chartMode === "candles") loadCandles(tf);
  }, [tf, chartMode, loadCandles]);

  // Load history (closed positions + orders)
  useEffect(() => {
    (async () => {
      try {
        const [posResult, ordResult] = await Promise.all([
          getBotPositions(botId),
          getBotOrders(botId),
        ]);
        if (posResult.data && Array.isArray(posResult.data)) {
          setClosedPositions(posResult.data
            .filter((p: any) => p.status === "closed" || p.status === "liquidated")
            .map((p: any) => ({
              id: p.id ?? p.position_id ?? "",
              side: (p.side ?? "LONG").toUpperCase(),
              pair: p.symbol ?? p.pair ?? "",
              entry: Number(p.entry_price ?? p.entry ?? 0),
              exit: Number(p.exit_price ?? p.close_price ?? 0),
              qty: Number(p.quantity ?? p.size ?? 0),
              pnl: Number(p.realized_pnl ?? p.pnl ?? 0),
              closedAt: p.closed_at ? new Date(p.closed_at).toLocaleString() : "--",
              reason: p.close_reason ?? p.reason ?? "--",
            })));
        }
        if (ordResult.data && Array.isArray(ordResult.data)) {
          setOrderHistory(ordResult.data.map((o: any) => ({
            id: o.order_id ?? o.id ?? "",
            side: (o.side ?? "BUY").toUpperCase(),
            pair: o.trading_pair ?? o.symbol ?? o.pair ?? "",
            type: (o.order_type ?? o.type ?? "MARKET").toUpperCase(),
            price: Number(o.order_price || o.price || o.limit_price || 0),
            execPrice: Number(o.execution_price || o.avg_fill_price || 0),
            qty: Number(o.order_size ?? o.filled_quantity ?? o.quantity ?? o.qty ?? 0),
            status: (o.order_status ?? o.status ?? "UNKNOWN").toUpperCase(),
            createdAt: o.timestamp ? new Date(o.timestamp).toLocaleString() : o.created_at ? new Date(o.created_at).toLocaleString() : "--",
          })));
        }
      } catch {
        setHistoryError(true);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [botId]);

  // Action handlers
  const handlePauseResume = async () => {
    if (!bot) return;
    if (bot.status === "paused") {
      await startBot(botId).catch(console.error);
      setBot(prev => prev ? { ...prev, status: "running" } : prev);
    } else {
      await pauseBot(botId).catch(console.error);
      setBot(prev => prev ? { ...prev, status: "paused" } : prev);
    }
  };

  const handleStop = async () => {
    await stopBot(botId).catch(console.error);
    setBot(prev => prev ? { ...prev, status: "stopped" } : prev);
  };

  const handleStart = async () => {
    setBot(prev => prev ? { ...prev, status: "initializing" } : prev);
    await startBot(botId).catch(console.error);
  };

  const handleDeleteBot = async () => {
    const result = await deleteBot(botId).catch(console.error);
    if (result && !result.error) {
      router.push("/dashboard/bot-fleet");
    }
    setDeleteModal(false);
  };

  const handleCapitalSave = async () => {
    const amount = parseFloat(capitalInput);
    if (isNaN(amount) || amount < 0) return;
    setCapitalSaving(true);
    try {
      const result = await updateBot(botId, { allocated_capital: amount });
      if (result && !result.error) {
        setBot(prev => prev ? { ...prev, allocatedCapital: amount } : prev);
      }
    } catch (e) { console.error("Failed to update capital:", e); }
    setCapitalSaving(false);
    setCapitalModal(false);
  };

  const isGridBot = bot?.strategy?.toLowerCase().includes("grid") || bot?.config?.grid_levels != null;

  const openGridConfigModal = () => {
    if (!bot) return;
    setGridConfigDraft({
      upper_price: bot.config.upper_price ?? "",
      lower_price: bot.config.lower_price ?? "",
      grid_levels: bot.config.grid_levels ?? 20,
      grid_type: bot.config.grid_type ?? "geometric",
      total_investment: bot.config.total_investment ?? bot.allocatedCapital ?? "",
      max_open_orders: bot.config.max_open_orders ?? 15,
      stop_loss_price: bot.config.stop_loss_price ?? "",
      take_profit_price: bot.config.take_profit_price ?? "",
      fee_rate: bot.config.fee_rate ?? 0.0004,
      quantity_per_grid: bot.config.quantity_per_grid ?? 0,
      restart_on_stop_loss: bot.config.restart_on_stop_loss ?? true,
      leverage: bot.config.leverage ?? 1,
    });
    setGridConfigModal(true);
  };

  const handleGridConfigSave = async () => {
    if (!bot) return;
    setGridConfigSaving(true);
    try {
      const newConfig = { ...bot.config };
      for (const [k, v] of Object.entries(gridConfigDraft)) {
        if (typeof v === "string" && v.trim() === "") {
          newConfig[k] = null;
        } else if (typeof v === "string") {
          newConfig[k] = parseFloat(v);
        } else {
          newConfig[k] = v;
        }
      }
      // Also sync allocated_capital with total_investment
      const totalInv = newConfig.total_investment;
      const payload: Record<string, any> = { config: newConfig };
      if (totalInv && totalInv > 0) {
        payload.allocated_capital = totalInv;
      }
      const result = await updateBot(botId, payload);
      if (result && !result.error) {
        setBot(prev => prev ? {
          ...prev,
          config: newConfig,
          allocatedCapital: totalInv || prev.allocatedCapital,
        } : prev);
        setGridConfigModal(false);
      }
    } catch (e) {
      console.error("Failed to update grid config:", e);
    }
    setGridConfigSaving(false);
  };

  const handleClosePosition = (pos: Position) => { setCloseModal(pos); };
  const confirmClose = (posId: string) => {
    wsClosePosition(posId);
    setPositions(prev => prev.filter(p => p.id !== posId));
  };

  // Bot not found (after loading completes)
  if (!botLoading && !bot) {
    return (
      <div className="bot-detail-page">
        <style>{STYLES}</style>
        <div className="bdp-loading">
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"var(--mono)", fontSize:12, color:"var(--text1)", marginBottom:12 }}>Bot not found</div>
            <button className="bdp-btn bdp-btn-green" onClick={() => router.push("/dashboard/bot-fleet")}>
              <IcoBack size={12} /> Back to Bot Fleet
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sc = bot ? (STATUS_CFG[bot.status] || STATUS_CFG.stopped) : STATUS_CFG.stopped;
  const pnlPos = bot ? bot.pnl >= 0 : true;
  const lastEquity  = equityCurve[equityCurve.length - 1]?.value ?? 0;
  const firstEquity = equityCurve[0]?.value ?? 0;
  const profitable  = lastEquity >= firstEquity;
  const startVal    = firstEquity;
  const equityWithStart = equityCurve.map((e: any) => ({ ...e, startVal }));
  const gradId = "equityGrad";

  const statusCls = (s: string) => {
    if (s === "FILLED") return "bdp-tag-green";
    if (s === "FAILED" || s === "CANCELLED") return "bdp-tag-red";
    return "bdp-tag-blue";
  };

  const metrics = bot ? [
    { label:"Session P&L", value:`${pnlPos ? "+" : ""}$${Math.abs(bot.pnl).toFixed(2)}`,
      color: pnlPos ? "var(--green)" : "var(--red)", accent: pnlPos ? "var(--green)" : "var(--red)",
      sub: `${pnlPos ? "+" : ""}${bot.allocatedCapital > 0 ? ((bot.pnl / bot.allocatedCapital) * 100).toFixed(2) : "0.00"}% on capital` },
    { label:"Win Rate", value:`${bot.winRate ?? 0}%`, color:"var(--blue)", accent:"var(--blue)", sub:`Last ${bot.trades ?? 0} trades` },
    { label:"Total Trades", value:bot.trades ?? 0, color:"var(--text0)", accent:"var(--text2)", sub:"Session only" },
    { label:"Open Positions", value:positions.length, color:"var(--amber)", accent:"var(--amber)", sub:"of 20 max" },
    { label:"Uptime", value:bot.uptime ?? "--", color:"var(--text0)", accent:"var(--green)", sub:"Since last start" },
  ] : [];

  const METRIC_LABELS = ["Session P&L", "Win Rate", "Total Trades", "Open Positions", "Uptime"];

  return (
    <div className="bot-detail-page">
      <style>{STYLES}</style>
      <div className="bdp-page">

        {/* HEADER */}
        <header className="bdp-hdr">
          <button className="bdp-back-btn" onClick={() => router.push("/dashboard/bot-fleet")}>
            <IcoBack size={15} />
          </button>

          <div className="bdp-hdr-left">
            <div className="bdp-breadcrumb">
              <button className="bdp-breadcrumb-link" onClick={() => router.push("/dashboard/mission-critical")}>Dashboard</button>
              <span className="bdp-breadcrumb-sep">/</span>
              <button className="bdp-breadcrumb-link" onClick={() => router.push("/dashboard/bot-fleet")}>Bot Fleet</button>
              <span className="bdp-breadcrumb-sep">/</span>
              <span className="bdp-breadcrumb-cur">{botLoading ? "Loading..." : (bot?.name || bot?.id || "--")}</span>
            </div>
            <div className="bdp-hdr-title">
              {botLoading ? (
                <div style={{ width: 140, height: 18, background: "var(--bg3)", borderRadius: 3, animation: "bdp-pulse 1.5s ease-in-out infinite" }} />
              ) : (
                <span className="bdp-bot-id">{bot?.name || bot?.id || "--"}</span>
              )}
              {botLoading ? (
                <div style={{ width: 64, height: 18, background: "var(--bg3)", borderRadius: 2, animation: "bdp-pulse 1.5s ease-in-out infinite", animationDelay: "0.2s" }} />
              ) : bot ? (
                <div className={`bdp-status-badge ${bot.status === "running" ? "bdp-running" : ""}`} style={{ color: sc.color, background: sc.bg, borderColor: sc.border }}>
                  <span className="bdp-status-dot" style={{ background: sc.color }} />
                  {sc.label}
                </div>
              ) : null}
            </div>
            {bot ? (
              <div className="bdp-hdr-meta">
                <span>{bot.id}</span>
                &nbsp;·&nbsp;
                <span>{bot.exchange}</span>
                &nbsp;·&nbsp;
                <span>{bot.pair}</span>
                &nbsp;·&nbsp;
                {bot.user}
              </div>
            ) : !botLoading ? null : (
              <div className="bdp-hdr-meta" style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 80, height: 8, background: "var(--bg3)", borderRadius: 2, animation: "bdp-pulse 1.5s ease-in-out infinite" }} />
              </div>
            )}
          </div>

          <div className="bdp-hdr-actions">
            {bot && <ActionButtons bot={bot} onPauseResume={handlePauseResume} onStop={handleStop} onStart={handleStart} onDelete={() => setDeleteModal(true)} />}
          </div>
        </header>

        {/* SINGLE SCROLLABLE CONTENT */}
        <main className="bdp-content">
          <div className="bdp-tab-body">

            {/* Bot Details Bar */}
            {botLoading ? (
              <div style={{ display:"flex", gap:16, padding:"8px 12px", background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:4 }}>
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} style={{ width: 80, height: 10, background: "var(--bg3)", borderRadius: 2, animation: "bdp-pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            ) : bot ? (
              <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 16px", padding:"8px 12px", background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:4, fontFamily:"var(--mono)", fontSize:8, color:"var(--text2)" }}>
                {([
                  ["Strategy", bot.strategy || "--"],
                  ["Pair", bot.pair || "--"],
                  ["Exchange", bot.exchange || "--"],
                  ["Capital", `$${(bot.allocatedCapital ?? 0).toLocaleString()}`, true],
                  ["User", bot.user || "--"],
                  ["Created", bot.createdAt ? new Date(bot.createdAt).toLocaleDateString() : "--"],
                ] as [string, string, boolean?][]).map(([k, v, editable]) => (
                  <span key={k} style={{ display:"inline-flex", gap:4, alignItems:"center", letterSpacing:".06em", textTransform:"uppercase" }}>
                    {k}: <span style={{ color: editable ? "var(--blue)" : "var(--text1)", fontWeight:500, cursor: editable ? "pointer" : "default" }}
                      onClick={editable ? () => { setCapitalInput(String(bot.allocatedCapital ?? 0)); setCapitalModal(true); } : undefined}
                      title={editable ? "Click to edit" : undefined}>{v}{editable && <span style={{ fontSize:7, marginLeft:3, opacity:.6 }}>&#9998;</span>}</span>
                  </span>
                ))}
                {isGridBot && (
                  <span
                    onClick={openGridConfigModal}
                    style={{ display:"inline-flex", gap:4, alignItems:"center", letterSpacing:".06em", textTransform:"uppercase", cursor:"pointer", color:"var(--blue)", fontWeight:500, marginLeft:4 }}
                    title="Edit grid bot configuration"
                  >
                    Grid Config <span style={{ fontSize:7, opacity:.6 }}>&#9998;</span>
                  </span>
                )}
              </div>
            ) : null}

            {/* Grid Config Summary — only for grid bots */}
            {!botLoading && bot && isGridBot && bot.config.upper_price && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 14px", padding:"6px 12px", background:"var(--bg0)", border:"1px solid var(--border)", borderRadius:4, fontFamily:"var(--mono)", fontSize:8, color:"var(--text2)", cursor:"pointer" }}
                onClick={openGridConfigModal} title="Click to edit grid config">
                {([
                  ["Range", `$${Number(bot.config.lower_price).toLocaleString()} — $${Number(bot.config.upper_price).toLocaleString()}`],
                  ["Levels", bot.config.grid_levels],
                  ["Type", bot.config.grid_type],
                  ["Investment", `$${Number(bot.config.total_investment).toLocaleString()}`],
                  ["Max Orders", bot.config.max_open_orders],
                  ["Stop Loss", bot.config.stop_loss_price ? `$${Number(bot.config.stop_loss_price).toLocaleString()}` : "--"],
                  ["Take Profit", bot.config.take_profit_price ? `$${Number(bot.config.take_profit_price).toLocaleString()}` : "--"],
                  ["Fee", bot.config.fee_rate ? `${(bot.config.fee_rate * 100).toFixed(2)}%` : "--"],
                  ["Restart on SL", bot.config.restart_on_stop_loss ? "Yes" : "No"],
                  ...(bot.config.leverage && bot.config.leverage > 1 ? [["Leverage", `${bot.config.leverage}x`]] : []),
                ] as [string, any][]).map(([k, v]) => (
                  <span key={k} style={{ display:"inline-flex", gap:4, alignItems:"center", letterSpacing:".06em", textTransform:"uppercase" }}>
                    {k}: <span style={{ color:"var(--text1)", fontWeight:500 }}>{v}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Metrics */}
            <div className="bdp-metrics-grid">
              {botLoading ? (
                <>
                  <BdpMetricSkeleton label="Pair" />
                  {METRIC_LABELS.map(l => <BdpMetricSkeleton key={l} label={l} />)}
                </>
              ) : botError ? (
                <>
                  {[...Array(6)].map((_, i) => (
                    <div className="bdp-metric" key={i}>
                      <div className="bdp-metric-lbl">&nbsp;</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--red)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 8 }}>Error</div>
                      <div className="bdp-metric-accent" style={{ background: "var(--red)" }} />
                    </div>
                  ))}
                </>
              ) : bot ? (
                <>
                  {/* Pair Card */}
                  {(() => {
                    const parts = (bot.pair || "").split(/[/\-_]/);
                    const base = (parts[0] || "").toUpperCase();
                    const quote = (parts[1] || "").toUpperCase();
                    const iconFallback = (symbol: string, size: number) => (
                      <span className="inline-flex items-center justify-center rounded-full bg-[#1e2d40] font-mono font-bold text-[#8fa3b8]"
                        style={{ width: size, height: size, fontSize: size * 0.45 }}>
                        {symbol.slice(0, 2)}
                      </span>
                    );
                    return (
                      <div className="bdp-pair-card">
                        <span className="flex items-center -space-x-1.5">
                          <TokenIcon symbol={base} size={32} variant="branded" fallback={iconFallback(base, 32)} />
                          {quote && <TokenIcon symbol={quote} size={26} variant="branded" fallback={iconFallback(quote, 26)} />}
                        </span>
                        <div className="bdp-pair-label">{bot.pair || "--"}</div>
                        <div className="bdp-pair-exchange">{bot.exchange || "--"}</div>
                      </div>
                    );
                  })()}
                  {metrics.map(m => (
                    <div className="bdp-metric" key={m.label}>
                      <div className="bdp-metric-lbl">{m.label}</div>
                      <div className="bdp-metric-val" style={{ color: m.color }}>{m.value}</div>
                      <div className="bdp-metric-sub">{m.sub}</div>
                      <div className="bdp-metric-accent" style={{ background: m.accent }} />
                    </div>
                  ))}
                </>
              ) : null}
            </div>

            {/* Chart — toggle between Equity Curve and Candlestick */}
            {equityError && chartMode === "equity" ? (
              <BdpSectionError label="Session Equity Curve" />
            ) : (
              <div className="bdp-card">
                <div className="bdp-card-hdr">
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div className="bdp-tf-bar">
                      <button className={`bdp-tf-btn ${chartMode === "equity" ? "bdp-on" : ""}`} onClick={() => setChartMode("equity")}>Equity</button>
                      <button className={`bdp-tf-btn ${chartMode === "candles" ? "bdp-on" : ""}`} onClick={() => setChartMode("candles")}>Candlestick</button>
                    </div>
                    {chartMode === "equity" && (
                      <>
                        <span style={{ fontFamily:"var(--mono)", fontSize:9, color: profitable ? "var(--green)" : "var(--red)", marginLeft:8 }}>
                          {profitable ? "▲" : "▼"} {profitable ? "+" : ""}${(lastEquity - firstEquity).toFixed(2)}
                        </span>
                        {equityLoading && <div className="bdp-spinner" style={{ width:12, height:12 }} />}
                      </>
                    )}
                    {chartMode === "candles" && (
                      <span className="bdp-card-title" style={{ marginLeft:4 }}>{bot?.pair || "--"} · {bot?.exchange || "--"}</span>
                    )}
                  </div>
                  {chartMode === "equity" && (
                    <div className="bdp-tf-bar">
                      {(["1h","6h","24h","7d","all"] as const).map(r => (
                        <button key={r} className={`bdp-tf-btn ${equityRange === r ? "bdp-on" : ""}`} onClick={() => setEquityRange(r)}>{r}</button>
                      ))}
                    </div>
                  )}
                  {chartMode === "candles" && (
                    <div className="bdp-tf-bar">
                      {TIMEFRAMES.map(t => (
                        <button key={t} className={`bdp-tf-btn ${tf === t ? "bdp-on" : ""}`} onClick={() => setTf(t)}>{t}</button>
                      ))}
                    </div>
                  )}
                </div>

                {chartMode === "equity" ? (
                  <div className="bdp-card-body" style={{ padding:"16px 16px 8px" }}>
                    <div className="bdp-equity-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={equityWithStart} margin={{ top: 4, right: 10, bottom: 0, left: -20 }}>
                          <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={profitable ? "#00e5a0" : "#ff4757"} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={profitable ? "#00e5a0" : "#ff4757"} stopOpacity={0.01} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 4" stroke="#1e2d40" vertical={false} />
                          <XAxis dataKey="t" tick={{ fontSize:8, fontFamily:"IBM Plex Mono", fill:"#5a7090" }} tickLine={false} axisLine={false} interval={Math.max(1, Math.floor(equityCurve.length / 8))}
                            tickFormatter={(t: number) => {
                              const d = new Date(t);
                              const spanMs = equityCurve.length > 1 ? equityCurve[equityCurve.length-1].t - equityCurve[0].t : 0;
                              if (spanMs > 86400000) {
                                return d.toLocaleDateString([], { month:"short", day:"numeric" }) + " " + d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
                              }
                              return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
                            }} />
                          <YAxis tick={{ fontSize:8, fontFamily:"IBM Plex Mono", fill:"#5a7090" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${(v/1000).toFixed(1)}k`} domain={["auto","auto"]} />
                          {startVal > 0 && <ReferenceLine y={startVal} stroke="#253550" strokeDasharray="4 3" />}
                          <Tooltip content={<EquityTooltip />} />
                          <Area type="monotone" dataKey="value" stroke={profitable ? "#00e5a0" : "#ff4757"} strokeWidth={1.5}
                            fill={`url(#${gradId})`} dot={false} activeDot={{ r:3, fill: profitable ? "#00e5a0" : "#ff4757" }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ textAlign:"right", fontFamily:"var(--mono)", fontSize:7, color:"var(--text2)", opacity:.6, padding:"2px 4px 0" }}>
                      {Intl.DateTimeFormat().resolvedOptions().timeZone} ({new Date().toLocaleTimeString([], { timeZoneName:"short" }).split(" ").pop()})
                    </div>
                  </div>
                ) : (
                  loadingCandles ? (
                    <div className="bdp-chart-wrap" style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <div className="bdp-spinner" />
                    </div>
                  ) : (
                    <CandlestickChart candles={candles} positions={positions} />
                  )
                )}
              </div>
            )}

            {/* Open Positions | Manual Order | Bot Logs */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 240px minmax(0,.85fr)", gap:14 }} className="bdp-pos-order-logs-row">
              {positionsLoading ? (
                <BdpSectionSkeleton label="Open Positions" />
              ) : positionsError ? (
                <BdpSectionError label="Open Positions" />
              ) : (
                <div className="bdp-card" style={{ minWidth:0 }}>
                  <div className="bdp-card-hdr">
                    <span className="bdp-card-title">Open Positions <span style={{ color:"var(--text2)", fontWeight:400 }}>({positions.length})</span></span>
                  </div>
                  <div className="bdp-card-body bdp-np">
                    <PositionsTable positions={positions} onClose={handleClosePosition} compact />
                  </div>
                </div>
              )}
              {bot ? (
                <ManualOrderPanel bot={bot} botId={botId} />
              ) : (
                <BdpSectionSkeleton label="Manual Order" />
              )}
              <LogStream botId={botId} logEvents={logEvents} />
            </div>

            {/* Closed Positions | Order History — side by side */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }} className="bdp-history-row">
              {/* Closed Positions */}
              {historyError ? (
                <BdpSectionError label="Closed Positions" />
              ) : (
              <div className="bdp-card" style={{ minWidth:0 }}>
                <div className="bdp-card-hdr">
                  <span className="bdp-card-title">Closed Positions <span style={{ color:"var(--text2)", fontWeight:400 }}>({closedPositions.length})</span></span>
                </div>
                <div className="bdp-card-body bdp-np">
                  {loadingHistory ? (
                    <div className="bdp-empty"><div className="bdp-spinner" /></div>
                  ) : closedPositions.length === 0 ? (
                    <div className="bdp-empty"><div className="bdp-empty-lbl">No closed positions yet</div></div>
                  ) : (
                    <div className="bdp-tbl-wrap" style={{ maxHeight:300, overflowY:"auto" }}>
                      <table className="bdp-tbl">
                        <thead>
                          <tr>
                            <th>Side</th>
                            <th>Pair</th>
                            <th className="bdp-r">Entry</th>
                            <th className="bdp-r">Exit</th>
                            <th className="bdp-r">P&amp;L</th>
                            <th>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {closedPositions.map(p => (
                            <tr key={p.id}>
                              <td><span className={`bdp-tag ${p.side === "LONG" ? "bdp-tag-long" : "bdp-tag-short"}`}>{p.side}</span></td>
                              <td><div className="bdp-cell-pair">{p.pair}</div></td>
                              <td className="bdp-mono bdp-r">{p.entry.toFixed(2)}</td>
                              <td className="bdp-mono bdp-r">{p.exit.toFixed(2)}</td>
                              <td className="bdp-r">
                                <span style={{ fontFamily:"var(--mono)", fontSize:10, fontWeight:600, color: p.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                                  {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                                </span>
                              </td>
                              <td><span className="bdp-tag bdp-tag-ghost" style={{ fontSize:7 }}>{p.reason}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Order History */}
              {historyError ? (
                <BdpSectionError label="Order History" />
              ) : (
              <div className="bdp-card" style={{ minWidth:0 }}>
                <div className="bdp-card-hdr">
                  <span className="bdp-card-title">Order History <span style={{ color:"var(--text2)", fontWeight:400 }}>({orderHistory.length})</span></span>
                </div>
                <div className="bdp-card-body bdp-np">
                  {loadingHistory ? (
                    <div className="bdp-empty"><div className="bdp-spinner" /></div>
                  ) : orderHistory.length === 0 ? (
                    <div className="bdp-empty"><div className="bdp-empty-lbl">No orders yet</div></div>
                  ) : (
                    <div className="bdp-tbl-wrap" style={{ maxHeight:300, overflowY:"auto" }}>
                      <table className="bdp-tbl">
                        <thead>
                          <tr>
                            <th>Side</th>
                            <th>Pair</th>
                            <th>Type</th>
                            <th className="bdp-r">Order Price</th>
                            <th className="bdp-r">Fill Price</th>
                            <th>Status</th>
                            <th>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderHistory.map(o => (
                            <tr key={o.id}>
                              <td><span className={`bdp-tag ${o.side === "BUY" ? "bdp-tag-long" : "bdp-tag-short"}`}>{o.side}</span></td>
                              <td><div className="bdp-cell-pair">{o.pair}</div></td>
                              <td className="bdp-mono" style={{ fontSize:9, color:"var(--text2)" }}>{o.type}</td>
                              <td className="bdp-mono bdp-r">{o.price > 0 ? `$${o.price.toLocaleString()}` : '--'}</td>
                              <td className="bdp-mono bdp-r" style={{ color: o.execPrice > 0 ? "var(--green, #00e5a0)" : "var(--text3)" }}>{o.execPrice > 0 ? `$${o.execPrice.toLocaleString()}` : '--'}</td>
                              <td><span className={`bdp-tag ${statusCls(o.status)}`}>{o.status}</span></td>
                              <td className="bdp-mono" style={{ color:"var(--text2)", fontSize:9 }}>{o.createdAt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>

          </div>
        </main>
      </div>

      {/* MODALS */}
      {closeModal && (
        <ClosePositionModal position={closeModal} onClose={() => setCloseModal(null)} onConfirm={confirmClose} />
      )}
      {deleteModal && bot && (
        <DeleteBotModal bot={bot} onClose={() => setDeleteModal(false)} onConfirm={handleDeleteBot} />
      )}
      {capitalModal && (
        <div className="bdp-modal-backdrop" onClick={() => setCapitalModal(false)}>
          <div className="bdp-modal" onClick={e => e.stopPropagation()} style={{ maxWidth:360 }}>
            <div className="bdp-modal-hdr">
              <span className="bdp-modal-title">Adjust Allocated Capital</span>
              <button className="bdp-modal-close" onClick={() => setCapitalModal(false)}><IcoClose size={14} /></button>
            </div>
            <div className="bdp-modal-body" style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <label style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", textTransform:"uppercase", letterSpacing:".06em" }}>
                New Capital (USD)
              </label>
              <input
                type="number"
                value={capitalInput}
                onChange={e => setCapitalInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCapitalSave()}
                autoFocus
                min={0}
                step={100}
                style={{
                  background:"var(--bg0)", border:"1px solid var(--border2)", borderRadius:4,
                  padding:"8px 12px", fontFamily:"var(--mono)", fontSize:13, color:"var(--text0)",
                  outline:"none", width:"100%"
                }}
              />
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
                <button onClick={() => setCapitalModal(false)}
                  style={{ padding:"6px 14px", borderRadius:3, border:"1px solid var(--border2)", background:"var(--bg2)", color:"var(--text1)", fontFamily:"var(--mono)", fontSize:10, cursor:"pointer" }}>
                  Cancel
                </button>
                <button onClick={handleCapitalSave} disabled={capitalSaving}
                  style={{ padding:"6px 14px", borderRadius:3, border:"none", background:"var(--blue)", color:"#fff", fontFamily:"var(--mono)", fontSize:10, fontWeight:600, cursor:"pointer", opacity: capitalSaving ? 0.6 : 1 }}>
                  {capitalSaving ? "Saving..." : "Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {gridConfigModal && (
        <div className="bdp-modal-backdrop" onClick={() => setGridConfigModal(false)}>
          <div className="bdp-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="bdp-modal-hdr">
              <span className="bdp-modal-title">Grid Bot Configuration</span>
              <button className="bdp-modal-close" onClick={() => setGridConfigModal(false)}><IcoClose size={14} /></button>
            </div>
            <div className="bdp-modal-body" style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "70vh", overflowY: "auto" }}>
              {/* Price Range */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <GridConfigField label="Lower Price" field="lower_price" type="number" draft={gridConfigDraft} setDraft={setGridConfigDraft} />
                <GridConfigField label="Upper Price" field="upper_price" type="number" draft={gridConfigDraft} setDraft={setGridConfigDraft} />
              </div>
              {/* Grid Settings */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <GridConfigField label="Grid Levels" field="grid_levels" type="number" step={1} draft={gridConfigDraft} setDraft={setGridConfigDraft} />
                <div>
                  <label style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 4 }}>
                    Grid Type
                  </label>
                  <select
                    value={gridConfigDraft.grid_type ?? "geometric"}
                    onChange={e => setGridConfigDraft(p => ({ ...p, grid_type: e.target.value }))}
                    style={{
                      background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 4,
                      padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text0)",
                      outline: "none", width: "100%"
                    }}
                  >
                    <option value="geometric">Geometric</option>
                    <option value="arithmetic">Arithmetic</option>
                  </select>
                </div>
              </div>
              {/* Investment */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <GridConfigField label="Total Investment ($)" field="total_investment" type="number" step={100} draft={gridConfigDraft} setDraft={setGridConfigDraft} />
                <GridConfigField label="Max Open Orders" field="max_open_orders" type="number" step={1} draft={gridConfigDraft} setDraft={setGridConfigDraft} />
              </div>
              {/* Risk */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <GridConfigField label="Stop Loss Price" field="stop_loss_price" type="number" placeholder="Optional" draft={gridConfigDraft} setDraft={setGridConfigDraft} />
                <GridConfigField label="Take Profit Price" field="take_profit_price" type="number" placeholder="Optional" draft={gridConfigDraft} setDraft={setGridConfigDraft} />
              </div>
              {/* Advanced */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <GridConfigField label="Fee Rate" field="fee_rate" type="number" step={0.0001} draft={gridConfigDraft} setDraft={setGridConfigDraft} />
                <GridConfigField label="Qty Per Grid (0=auto)" field="quantity_per_grid" type="number" step={0.001} draft={gridConfigDraft} setDraft={setGridConfigDraft} />
              </div>
              {/* Leverage (futures bots) */}
              {bot && (bot.marketType === "usds_futures" || bot.marketType === "coinm_futures" || bot.config?.market_type === "usds_futures" || bot.config?.market_type === "coinm_futures") && (
                <div>
                  <label style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 4 }}>
                    Leverage
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range"
                      value={gridConfigDraft.leverage ?? 1}
                      onChange={e => setGridConfigDraft(p => ({ ...p, leverage: parseInt(e.target.value) || 1 }))}
                      min={1} max={125} step={1}
                      style={{ flex: 1, accentColor: "var(--blue)" }}
                    />
                    <input
                      type="number"
                      value={gridConfigDraft.leverage ?? 1}
                      onChange={e => setGridConfigDraft(p => ({ ...p, leverage: Math.max(1, Math.min(125, parseInt(e.target.value) || 1)) }))}
                      min={1} max={125}
                      style={{
                        background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 4,
                        padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text0)",
                        outline: "none", width: 60, textAlign: "center"
                      }}
                    />
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text1)" }}>x</span>
                  </div>
                  {(gridConfigDraft.leverage ?? 1) > 10 && (
                    <p style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--yellow, #eab308)", marginTop: 4 }}>
                      High leverage increases liquidation risk.
                    </p>
                  )}
                  {(gridConfigDraft.leverage ?? 1) > 1 && gridConfigDraft.total_investment && (
                    <p style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text2)", marginTop: 2 }}>
                      Effective capital: ${(parseFloat(gridConfigDraft.total_investment) * (gridConfigDraft.leverage ?? 1)).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              {/* Toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={gridConfigDraft.restart_on_stop_loss ?? true}
                  onChange={e => setGridConfigDraft(p => ({ ...p, restart_on_stop_loss: e.target.checked }))}
                  style={{ accentColor: "var(--blue)" }}
                />
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text1)" }}>Restart on Stop Loss (recenter grid)</span>
              </label>
              {/* Computed Info */}
              {gridConfigDraft.upper_price && gridConfigDraft.lower_price && gridConfigDraft.grid_levels > 0 && (
                <div style={{ background: "var(--bg0)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 9, color: "var(--text2)" }}>
                  {(() => {
                    const upper = parseFloat(gridConfigDraft.upper_price) || 0;
                    const lower = parseFloat(gridConfigDraft.lower_price) || 0;
                    const levels = parseInt(gridConfigDraft.grid_levels) || 1;
                    const total = parseFloat(gridConfigDraft.total_investment) || 0;
                    const fee = parseFloat(gridConfigDraft.fee_rate) || 0;
                    const perGrid = total / levels;
                    const spacing = gridConfigDraft.grid_type === "geometric"
                      ? ((Math.pow(upper / lower, 1 / levels) - 1) * 100)
                      : ((upper - lower) / levels / lower * 100);
                    const roundTripFee = fee * 2 * 100;
                    const netProfit = spacing - roundTripFee;
                    return (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                        <span>Spacing: <b style={{ color: "var(--text1)" }}>{spacing.toFixed(2)}%</b></span>
                        <span>Per Grid: <b style={{ color: "var(--text1)" }}>${perGrid.toFixed(0)}</b></span>
                        <span>Round-trip Fee: <b style={{ color: "var(--text1)" }}>{roundTripFee.toFixed(2)}%</b></span>
                        <span>Net/Grid: <b style={{ color: netProfit > 0 ? "var(--green, #22c55e)" : "var(--red, #ef4444)" }}>{netProfit.toFixed(2)}%</b></span>
                        {netProfit <= 0 && <span style={{ color: "var(--red, #ef4444)", fontWeight: 600 }}>Grid spacing too tight — will lose money on fees!</span>}
                        {perGrid < 70 && upper > 50000 && <span style={{ color: "var(--yellow, #eab308)", fontWeight: 600 }}>Per-grid ${perGrid.toFixed(0)} may be too small for BTC (min ~$70)</span>}
                      </div>
                    );
                  })()}
                </div>
              )}
              {/* Actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button onClick={() => setGridConfigModal(false)}
                  style={{ padding: "6px 14px", borderRadius: 3, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--text1)", fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleGridConfigSave} disabled={gridConfigSaving}
                  style={{ padding: "6px 14px", borderRadius: 3, border: "none", background: "var(--blue)", color: "#fff", fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, cursor: "pointer", opacity: gridConfigSaving ? 0.6 : 1 }}>
                  {gridConfigSaving ? "Saving..." : "Save Config"}
                </button>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--text2)", opacity: 0.7 }}>
                Note: Bot must be stopped &amp; restarted for config changes to take effect.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GridConfigField({ label, field, type = "text", step, placeholder, draft, setDraft }: {
  label: string; field: string; type?: string; step?: number; placeholder?: string;
  draft: Record<string, any>; setDraft: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  return (
    <div>
      <label style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type}
        value={draft[field] ?? ""}
        onChange={e => setDraft(p => ({ ...p, [field]: e.target.value }))}
        placeholder={placeholder}
        step={step}
        style={{
          background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 4,
          padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text0)",
          outline: "none", width: "100%"
        }}
      />
    </div>
  );
}
