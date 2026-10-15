import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ─── STYLES (Mission Control aesthetic) ──────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=DM+Sans:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg0: #080c10; --bg1: #0d1117; --bg2: #131920; --bg3: #1a2230;
    --border: #1e2d40; --border2: #253550;
    --text0: #e8edf3; --text1: #8fa3b8; --text2: #5a7090;
    --green: #00e5a0; --green-dim: rgba(0,229,160,0.10);
    --amber: #f5a623; --amber-dim: rgba(245,166,35,0.10);
    --red:   #ff4757; --red-dim:   rgba(255,71,87,0.10);
    --blue:  #3d9df3; --blue-dim:  rgba(61,157,243,0.10);
    --purple: #a78bfa;
    --mono: 'IBM Plex Mono', monospace;
    --sans: 'DM Sans', sans-serif;
  }

  body { background: var(--bg0); color: var(--text0); font-family: var(--sans); overflow: hidden; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg1); }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

  .app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

  /* ── TOPBAR ── */
  .topbar {
    display: flex; align-items: center; height: 50px; padding: 0 18px;
    background: var(--bg1); border-bottom: 1px solid var(--border);
    flex-shrink: 0; gap: 18px; z-index: 100;
  }
  .logo { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--green); letter-spacing: 0.08em; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .pulse { width: 7px; height: 7px; background: var(--green); border-radius: 50%; animation: pulse 2s infinite; flex-shrink: 0; }
  @keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,229,160,0.5)} 60%{opacity:.8;box-shadow:0 0 0 6px rgba(0,229,160,0)} }
  .tb-sep { width: 1px; height: 24px; background: var(--border); flex-shrink: 0; }
  .tb-stat { display: flex; flex-direction: column; }
  .tb-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .12em; color: var(--text2); }
  .tb-val { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--text0); white-space: nowrap; }
  .tb-val.g { color: var(--green); }
  .tb-val.r { color: var(--red); }
  .tb-val.a { color: var(--amber); }
  .tv-select {
    background: var(--bg2); border: 1px solid var(--border); color: var(--text0);
    font-family: var(--mono); font-size: 11px; padding: 4px 8px; border-radius: 3px; outline: none; cursor: pointer;
  }
  .live-badge {
    display: flex; align-items: center; gap: 5px; padding: 3px 10px;
    background: var(--green-dim); border: 1px solid rgba(0,229,160,0.2); border-radius: 3px;
  }
  .live-badge span { font-family: var(--mono); font-size: 9px; color: var(--green); text-transform: uppercase; letter-spacing: .1em; }

  /* ── BODY ── */
  .body { display: flex; flex: 1; overflow: hidden; }

  /* ── PAIR SIDEBAR ── */
  .pair-sidebar {
    width: 192px; flex-shrink: 0; background: var(--bg1);
    border-right: 1px solid var(--border); overflow-y: auto;
    display: flex; flex-direction: column;
  }
  .pair-sidebar-hdr {
    padding: 9px 12px; border-bottom: 1px solid var(--border);
    font-family: var(--mono); font-size: 9px; text-transform: uppercase;
    letter-spacing: .12em; color: var(--text2); flex-shrink: 0;
  }
  .pair-card {
    padding: 10px 12px; border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background .12s; display: flex; flex-direction: column; gap: 5px;
    border-left: 2px solid transparent;
  }
  .pair-card:hover { background: var(--bg2); }
  .pair-card.active { background: var(--bg2); border-left-color: var(--green); }
  .pc-top { display: flex; justify-content: space-between; align-items: center; }
  .pc-pair { font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--text0); }
  .pc-chg { font-family: var(--mono); font-size: 10px; }
  .pc-price { font-family: var(--mono); font-size: 13px; font-weight: 600; }
  .pc-bottom { display: flex; align-items: center; justify-content: space-between; }
  .pc-bots { font-size: 9px; color: var(--text2); display: flex; align-items: center; gap: 4px; }
  .pc-bot-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); }

  /* ── CENTER COLUMN ── */
  .center { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

  /* ── CHART HEADER ── */
  .chart-hdr {
    padding: 9px 16px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 10px; flex-shrink: 0;
    background: var(--bg1); flex-wrap: wrap;
  }
  .ch-pair { font-family: var(--mono); font-size: 15px; font-weight: 600; color: var(--text0); }
  .ch-price { font-family: var(--mono); font-size: 14px; font-weight: 600; }
  .ch-chg { font-family: var(--mono); font-size: 11px; }
  .ex-pill {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 2px;
    font-family: var(--mono); font-size: 9px; font-weight: 600; letter-spacing: .04em;
  }
  .ex-dot { width: 5px; height: 5px; border-radius: 50%; }

  .tf-row { display: flex; gap: 2px; }
  .tf-btn {
    padding: 3px 8px; background: transparent; border: 1px solid var(--border);
    color: var(--text2); font-family: var(--mono); font-size: 10px; cursor: pointer;
    border-radius: 2px; transition: all .12s;
  }
  .tf-btn:hover { color: var(--text0); border-color: var(--border2); }
  .tf-btn.on { background: var(--blue-dim); color: var(--blue); border-color: rgba(61,157,243,.35); }

  .mode-row { display: flex; gap: 2px; margin-left: auto; }
  .mode-btn {
    padding: 4px 12px; border: 1px solid var(--border); border-radius: 2px;
    font-family: var(--mono); font-size: 10px; cursor: pointer; transition: all .12s;
    color: var(--text2); background: transparent; text-transform: uppercase; letter-spacing: .06em;
  }
  .mode-btn.on { background: var(--green-dim); color: var(--green); border-color: rgba(0,229,160,.3); }

  /* ── CHART AREA ── */
  .chart-area { flex: 1; position: relative; overflow: hidden; background: var(--bg0); min-height: 0; }
  .chart-svg { width: 100%; height: 100%; display: block; cursor: crosshair; }
  .ohlcv-bar {
    position: absolute; top: 10px; left: 14px; display: flex; gap: 14px; pointer-events: none; z-index: 10;
  }
  .ohlcv-item { display: flex; flex-direction: column; gap: 1px; }
  .ohlcv-lbl { font-family: var(--mono); font-size: 8px; color: var(--text2); text-transform: uppercase; }
  .ohlcv-val { font-family: var(--mono); font-size: 11px; font-weight: 500; }

  /* ── POSITION PANEL ── */
  .pos-panel { height: 180px; flex-shrink: 0; border-top: 1px solid var(--border); background: var(--bg1); display: flex; flex-direction: column; overflow: hidden; }
  .panel-hdr {
    padding: 7px 14px; border-bottom: 1px solid var(--border);
    font-family: var(--mono); font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: var(--text2);
    flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  }
  .pos-scroll { overflow-y: auto; flex: 1; }
  .pos-table { width: 100%; border-collapse: collapse; }
  .pos-table th { font-family: var(--mono); font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: var(--text2); padding: 5px 10px; text-align: left; border-bottom: 1px solid var(--border); background: var(--bg2); white-space: nowrap; }
  .pos-table td { padding: 7px 10px; border-bottom: 1px solid var(--border); color: var(--text1); vertical-align: middle; }
  .pos-table tr:last-child td { border-bottom: none; }
  .pos-table tr:hover td { background: var(--bg2); }

  /* ── ORDER STREAM ── */
  .order-sidebar { width: 268px; flex-shrink: 0; background: var(--bg1); border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
  .os-hdr { padding: 9px 13px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .os-title { display: flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--text1); }
  .os-filters { display: flex; gap: 3px; }
  .os-fbtn {
    padding: 2px 7px; border: 1px solid var(--border); border-radius: 2px;
    font-family: var(--mono); font-size: 9px; cursor: pointer; color: var(--text2);
    background: transparent; transition: all .12s; text-transform: uppercase;
  }
  .os-fbtn.on { background: var(--bg3); color: var(--text0); border-color: var(--border2); }
  .os-feed { flex: 1; overflow-y: auto; }
  .order-item { padding: 8px 13px; border-bottom: 1px solid var(--border); transition: background .12s; }
  .order-item:hover { background: var(--bg2); }
  .oi-row1 { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; }
  .oi-time { font-family: var(--mono); font-size: 9px; color: var(--text2); }
  .oi-bot  { font-family: var(--mono); font-size: 10px; font-weight: 600; color: var(--blue); }
  .oi-row2 { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 3px; }
  .oi-pair { font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--text0); }
  .oi-row3 { display: flex; align-items: center; justify-content: space-between; }
  .oi-price { font-family: var(--mono); font-size: 10px; color: var(--text1); }
  .oi-status { display: flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 9px; }

  /* ── TAGS / BADGES ── */
  .tag { padding: 2px 6px; border-radius: 2px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-family: var(--mono); }
  .tag.buy   { background: var(--green-dim); color: var(--green); }
  .tag.sell  { background: var(--red-dim);   color: var(--red);   }
  .tag.long  { background: var(--green-dim); color: var(--green); }
  .tag.short { background: var(--red-dim);   color: var(--red);   }
  .tag.limit  { background: var(--blue-dim);  color: var(--blue);  }
  .tag.market { background: var(--bg3);       color: var(--text1); }

  /* ── BUTTONS ── */
  .btn { padding: 4px 10px; border-radius: 2px; font-family: var(--mono); font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; cursor: pointer; border: none; transition: all .12s; }
  .btn-close { background: var(--amber-dim); color: var(--amber); border: 1px solid rgba(245,166,35,.3); }
  .btn-close:hover { background: var(--amber); color: #000; }
  .btn-kill  { background: var(--red-dim);   color: var(--red);   border: 1px solid rgba(255,71,87,.3);  }
  .btn-kill:hover  { background: var(--red);   color: #fff; }

  /* ── MISC ── */
  .mono { font-family: var(--mono); }
  @media (max-width: 860px) { .pair-sidebar { display: none; } .order-sidebar { display: none; } }
`;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const EX = {
  Binance: "#C99400", Bybit: "#00e5a0", OKX: "#3d9df3", Kraken: "#8B5CF6", Kucoin: "#21A179",
};
const STRAT_COL = {
  "Momentum Grid": "#00e5a0", "Arbitrage V2": "#3d9df3",
  "Mean Reversion": "#f5a623", "Trend Follow": "#a78bfa", "Scalp Pro": "#ff4757",
};
const PAIRS_CFG = [
  { pair: "BTC/USDT",  base: 65420.0, vol: 0.009 },
  { pair: "ETH/USDT",  base: 3284.50,  vol: 0.011 },
  { pair: "SOL/USDT",  base: 178.40,   vol: 0.015 },
  { pair: "BNB/USDT",  base: 612.30,   vol: 0.010 },
  { pair: "XRP/USDT",  base: 0.6280,   vol: 0.014 },
  { pair: "ADA/USDT",  base: 0.4850,   vol: 0.013 },
  { pair: "DOGE/USDT", base: 0.1421,   vol: 0.018 },
  { pair: "AVAX/USDT", base: 38.42,    vol: 0.016 },
];
const ALL_EXCHANGES = ["Binance", "Bybit", "OKX", "Kraken", "Kucoin"];
const BOT_IDS  = ["BOT-0003","BOT-0007","BOT-0012","BOT-0015","BOT-0021","BOT-0024"];
const BOT_STRAT = { "BOT-0003":"Momentum Grid","BOT-0007":"Arbitrage V2","BOT-0012":"Mean Reversion","BOT-0015":"Trend Follow","BOT-0021":"Scalp Pro","BOT-0024":"Momentum Grid" };

// ─── DATA ────────────────────────────────────────────────────────────────────
function genCandles(n = 120, base = 65000, vol = 0.009) {
  let close = base;
  return Array.from({ length: n }, (_, i) => {
    const d = (Math.random() - 0.47) * vol;
    const open = close;
    close = open * (1 + d);
    const high = Math.max(open, close) * (1 + Math.random() * vol * 0.45);
    const low  = Math.min(open, close) * (1 - Math.random() * vol * 0.45);
    return { i, open, high, low, close, volume: (Math.random() * 700 + 80) * 1000 };
  });
}

function genPositions(candles) {
  const last = candles[candles.length - 1].close;
  const count = Math.floor(Math.random() * 3) + 1;
  return BOT_IDS.slice(0, count).map(id => {
    const off   = (Math.random() - 0.5) * 0.05;
    const entry = last * (1 + off);
    const side  = Math.random() > 0.42 ? "LONG" : "SHORT";
    const pnl   = side === "LONG" ? (last - entry) / entry * 100 : (entry - last) / entry * 100;
    return { id, strategy: BOT_STRAT[id], color: STRAT_COL[BOT_STRAT[id]], side, entry: parseFloat(entry.toFixed(4)), current: last, pnlPct: parseFloat(pnl.toFixed(2)), size: parseFloat((Math.random() * 0.8 + 0.05).toFixed(4)), age: `${Math.floor(Math.random() * 240) + 5}m` };
  });
}

function genChartOrders(candles) {
  return candles.filter((_, i) => i > 0 && Math.random() < 0.07).map(c => ({
    i: c.i,
    price: c.close * (1 + (Math.random() - 0.5) * 0.0015),
    side: Math.random() > 0.45 ? "BUY" : "SELL",
    bot: BOT_IDS[Math.floor(Math.random() * BOT_IDS.length)],
    filled: Math.random() > 0.14,
  }));
}

function genOrder(pairCfg) {
  const p    = pairCfg || PAIRS_CFG[0];
  const side = Math.random() > 0.5 ? "BUY" : "SELL";
  const sts  = ["FILLED","FILLED","FILLED","PARTIAL","REJECTED"];
  const bot  = BOT_IDS[Math.floor(Math.random() * BOT_IDS.length)];
  return {
    id: Math.random().toString(36).substr(2,8),
    time: new Date().toLocaleTimeString(),
    bot,
    exchange: ALL_EXCHANGES[Math.floor(Math.random() * 3)],
    pair: p.pair,
    side,
    size: parseFloat((Math.random() * 0.5 + 0.01).toFixed(4)),
    price: parseFloat((p.base * (1 + (Math.random() - 0.5) * 0.006)).toFixed(4)),
    status: sts[Math.floor(Math.random() * sts.length)],
    type: Math.random() > 0.3 ? "LIMIT" : "MARKET",
  };
}

function fmtP(p) {
  if (p >= 10000) return p.toFixed(1);
  if (p >= 100)   return p.toFixed(2);
  if (p >= 1)     return p.toFixed(3);
  return p.toFixed(4);
}

// ─── MINI SPARKLINE ───────────────────────────────────────────────────────────
function Spark({ data, color, w = 64, h = 24 }) {
  if (!data || data.length < 2) return null;
  const vals = data.map(c => c.close);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - mn) / rng) * h}`).join(" ");
  return <svg width={w} height={h} style={{ display:"block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}

// ─── CANDLESTICK SVG CHART ────────────────────────────────────────────────────
function CandlestickChart({ candles, positions, chartOrders }) {
  const ref  = useRef(null);
  const [dims, setDims] = useState({ w: 700, h: 380 });
  const [hov,  setHov]  = useState(null);
  const [mxy,  setMxy]  = useState(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setDims({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const PAD   = { t: 14, r: 72, b: 28, l: 8 };
  const VOL_H = Math.floor(dims.h * 0.18);
  const CH    = dims.h - PAD.t - PAD.b - VOL_H - 4;
  const CW    = dims.w - PAD.l - PAD.r;

  const prices = useMemo(() => candles.flatMap(c => [c.high, c.low]), [candles]);
  const minP   = useMemo(() => Math.min(...prices) * 0.9994, [prices]);
  const maxP   = useMemo(() => Math.max(...prices) * 1.0006, [prices]);
  const maxVol = useMemo(() => Math.max(...candles.map(c => c.volume)), [candles]);

  const toX  = i  => PAD.l + (i + 0.5) / candles.length * CW;
  const toY  = p  => PAD.t + (1 - (p - minP) / (maxP - minP)) * CH;
  const toYV = v  => dims.h - PAD.b - (v / maxVol) * VOL_H;
  const cW   = Math.max(2, CW / candles.length * 0.65);

  const onMove = useCallback((e) => {
    const rect = ref.current?.getBoundingClientRect(); if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setMxy({ x: mx, y: my });
    setHov(Math.max(0, Math.min(candles.length - 1, Math.round((mx - PAD.l) / CW * candles.length - 0.5))));
  }, [candles.length, CW]);

  const yTicks = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const p = minP + (i / 5) * (maxP - minP);
    return { p, y: toY(p) };
  }), [minP, maxP, dims]);

  const hovC  = hov !== null ? candles[hov] : candles[candles.length - 1];
  const lastC = candles[candles.length - 1];
  const lastY = toY(lastC.close);

  const statusColor = (s) => s === "FILLED" ? "var(--green)" : s === "PARTIAL" ? "var(--amber)" : "var(--red)";

  return (
    <div ref={ref} style={{ width:"100%", height:"100%", position:"relative" }}>
      {/* OHLCV readout */}
      <div className="ohlcv-bar">
        {[["O", hovC.open], ["H", hovC.high], ["L", hovC.low], ["C", hovC.close]].map(([l, v]) => (
          <div className="ohlcv-item" key={l}>
            <div className="ohlcv-lbl">{l}</div>
            <div className="ohlcv-val" style={{ color: l==="C" ? (hovC.close>=hovC.open?"var(--green)":"var(--red)") : "var(--text1)" }}>{fmtP(v)}</div>
          </div>
        ))}
        <div className="ohlcv-item">
          <div className="ohlcv-lbl">Vol</div>
          <div className="ohlcv-val" style={{ color:"var(--text2)" }}>{(hovC.volume/1e6).toFixed(2)}M</div>
        </div>
      </div>

      <svg className="chart-svg" width={dims.w} height={dims.h} onMouseMove={onMove} onMouseLeave={() => { setHov(null); setMxy(null); }}>

        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD.l} y1={t.y} x2={dims.w - PAD.r} y2={t.y} stroke="#1a2230" strokeWidth="1" strokeDasharray="3 5" />
        ))}

        {/* Volume bars */}
        {candles.map((c, i) => {
          const vx = toX(i), vy = toYV(c.volume), vH = dims.h - PAD.b - vy;
          return <rect key={`v${i}`} x={vx - cW/2} y={vy} width={cW} height={Math.max(1, vH)} fill={c.close >= c.open ? "rgba(0,229,160,0.16)" : "rgba(255,71,87,0.16)"} />;
        })}

        {/* Vol divider */}
        <line x1={PAD.l} y1={dims.h - PAD.b - VOL_H} x2={dims.w - PAD.r} y2={dims.h - PAD.b - VOL_H} stroke="#1e2d40" strokeWidth="1" />

        {/* Candle bodies + wicks */}
        {candles.map((c, i) => {
          const x = toX(i), yO = toY(c.open), yC = toY(c.close), yH = toY(c.high), yL = toY(c.low);
          const bull = c.close >= c.open;
          const col  = bull ? "#00e5a0" : "#ff4757";
          const bY   = Math.min(yO, yC);
          const bH   = Math.max(1.5, Math.abs(yC - yO));
          return (
            <g key={`c${i}`}>
              <line x1={x} y1={yH} x2={x} y2={yL} stroke={col} strokeWidth="1" opacity="0.65" />
              <rect x={x - cW/2} y={bY} width={cW} height={bH}
                fill={bull ? "rgba(0,229,160,0.88)" : "rgba(255,71,87,0.84)"}
                stroke={col} strokeWidth="0.4" />
            </g>
          );
        })}

        {/* Order markers (triangles) */}
        {chartOrders.map((o, idx) => {
          const x  = toX(o.i);
          const yp = toY(o.price);
          if (yp < PAD.t || yp > PAD.t + CH) return null;
          const isBuy = o.side === "BUY";
          const col   = !o.filled ? "#ff4757" : isBuy ? "#00e5a0" : "#f5a623";
          const oy    = isBuy ? yp + 10 : yp - 10;
          const tri   = isBuy
            ? `${x},${oy-9} ${x-5},${oy} ${x+5},${oy}`
            : `${x},${oy+9} ${x-5},${oy} ${x+5},${oy}`;
          return (
            <polygon key={idx} points={tri} fill={col} opacity="0.82">
              <title>{o.bot} {o.side} {fmtP(o.price)} {o.filled ? "FILLED" : "REJECTED"}</title>
            </polygon>
          );
        })}

        {/* Bot position lines */}
        {positions.map((pos, idx) => {
          const y = toY(pos.entry);
          if (y < PAD.t - 4 || y > PAD.t + CH + 4) return null;
          return (
            <g key={idx}>
              <line x1={PAD.l} y1={y} x2={dims.w - PAD.r} y2={y}
                stroke={pos.color} strokeWidth="1" strokeDasharray="6 3" opacity="0.65" />
              <rect x={dims.w - PAD.r + 2} y={y - 8} width={PAD.r - 4} height={15} fill={pos.color} fillOpacity="0.15" rx="1" />
              <text x={dims.w - PAD.r + 5} y={y + 3} fontSize="8" fill={pos.color} fontFamily="'IBM Plex Mono', monospace" fontWeight="600">
                {pos.id.replace("BOT-","")} {pos.side[0]}
              </text>
            </g>
          );
        })}

        {/* Current price line */}
        <line x1={PAD.l} y1={lastY} x2={dims.w - PAD.r} y2={lastY} stroke="#00e5a0" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />
        <rect x={dims.w - PAD.r + 1} y={lastY - 8} width={PAD.r - 2} height={15} fill="#00e5a0" rx="2" />
        <text x={dims.w - PAD.r + 5} y={lastY + 4} fontSize="9" fill="#000" fontFamily="'IBM Plex Mono', monospace" fontWeight="700">{fmtP(lastC.close)}</text>

        {/* Y-axis price labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={dims.w - PAD.r + 5} y={t.y + 3} fontSize="9" fill="#5a7090" fontFamily="'IBM Plex Mono', monospace">{fmtP(t.p)}</text>
        ))}

        {/* Crosshair */}
        {mxy && hov !== null && (
          <>
            <line x1={toX(hov)} y1={PAD.t} x2={toX(hov)} y2={dims.h - PAD.b} stroke="#253550" strokeWidth="1" />
            <line x1={PAD.l} y1={mxy.y} x2={dims.w - PAD.r} y2={mxy.y} stroke="#253550" strokeWidth="1" />
            <rect x={dims.w - PAD.r + 1} y={mxy.y - 8} width={PAD.r - 2} height={15} fill="#1a2230" stroke="#253550" rx="2" />
            <text x={dims.w - PAD.r + 5} y={mxy.y + 4} fontSize="9" fill="#8fa3b8" fontFamily="'IBM Plex Mono', monospace">
              {fmtP(minP + (1 - (mxy.y - PAD.t) / CH) * (maxP - minP))}
            </text>
            <rect x={toX(hov) - cW/2 - 2} y={PAD.t} width={cW + 4} height={CH} fill="rgba(255,255,255,0.025)" />
          </>
        )}
      </svg>
    </div>
  );
}

// ─── PAIR SIDEBAR ─────────────────────────────────────────────────────────────
function PairSidebar({ pairs, active, onSelect }) {
  return (
    <div className="pair-sidebar">
      <div className="pair-sidebar-hdr">Markets · {pairs.length} pairs</div>
      {pairs.map(p => {
        const last   = p.candles[p.candles.length - 1].close;
        const first  = p.candles[0].close;
        const chg    = (last - first) / first * 100;
        const up     = chg >= 0;
        return (
          <div key={p.pair} className={`pair-card ${active === p.pair ? "active" : ""}`} onClick={() => onSelect(p.pair)}>
            <div className="pc-top">
              <span className="pc-pair">{p.pair}</span>
              <span className="pc-chg" style={{ color: up ? "var(--green)" : "var(--red)" }}>{up?"+":""}{chg.toFixed(2)}%</span>
            </div>
            <div className="pc-price" style={{ color: up ? "var(--green)" : "var(--text0)" }}>{fmtP(last)}</div>
            <div className="pc-bottom">
              <div className="pc-bots"><div className="pc-bot-dot" />{p.botCount} bot{p.botCount!==1?"s":""}</div>
              <Spark data={p.candles.slice(-30)} color={up ? "#00e5a0" : "#ff4757"} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ORDER STREAM ─────────────────────────────────────────────────────────────
function OrderStream({ orders, filter, onFilter }) {
  const feedRef = useRef(null);
  const shown   = filter === "ALL" ? orders : filter === "REJECTED" ? orders.filter(o => o.status === "REJECTED") : orders.filter(o => o.side === filter);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = 0; }, [orders.length]);

  return (
    <div className="order-sidebar">
      <div className="os-hdr">
        <div className="os-title"><div className="pulse" /><span>Order Stream</span></div>
        <div className="os-filters">
          {["ALL","BUY","SELL","REJECTED"].map(f => (
            <button key={f} className={`os-fbtn ${filter===f?"on":""}`} onClick={() => onFilter(f)}>{f}</button>
          ))}
        </div>
      </div>
      <div className="os-feed" ref={feedRef}>
        {shown.map(o => {
          const scol = o.status === "FILLED" ? "var(--green)" : o.status === "PARTIAL" ? "var(--amber)" : "var(--red)";
          return (
            <div className="order-item" key={o.id}>
              <div className="oi-row1">
                <span className="oi-time">{o.time}</span>
                <span className="oi-bot">{o.bot}</span>
              </div>
              <div className="oi-row2">
                <span className={`tag ${o.side.toLowerCase()}`}>{o.side}</span>
                <span className="oi-pair">{o.pair}</span>
                <span className={`tag ${o.type.toLowerCase()}`}>{o.type}</span>
              </div>
              <div className="oi-row3">
                <span className="oi-price">{o.size} @ <strong style={{color:"var(--text0)"}}>{fmtP(o.price)}</strong></span>
                <div className="oi-status" style={{ color: scol }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:scol }} />
                  {o.status}
                </div>
              </div>
              <div style={{ marginTop:3, display:"flex", alignItems:"center", gap:4 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background: EX[o.exchange]||"#999" }} />
                <span style={{ fontFamily:"var(--mono)", fontSize:9, color: EX[o.exchange]||"var(--text2)" }}>{o.exchange}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── POSITION TABLE ───────────────────────────────────────────────────────────
function PositionTable({ positions, pair }) {
  const [closeTarget, setCloseTarget] = useState(null);
  return (
    <div className="pos-panel">
      <div className="panel-hdr">
        <span>Open Positions — {pair}</span>
        <span style={{ color:"var(--text2)" }}>{positions.length} position{positions.length!==1?"s":""}</span>
      </div>
      <div className="pos-scroll">
        {positions.length === 0
          ? <div style={{ padding:"14px 12px", fontFamily:"var(--mono)", fontSize:11, color:"var(--text2)" }}>No open positions on this pair.</div>
          : (
            <table className="pos-table">
              <thead>
                <tr><th>Bot</th><th>Strategy</th><th>Side</th><th>Entry</th><th>Mark</th><th>Size</th><th>PnL %</th><th>Age</th><th></th></tr>
              </thead>
              <tbody>
                {positions.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--blue)", fontWeight:600 }}>{p.id}</td>
                    <td>
                      <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"var(--text2)" }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:p.color, display:"inline-block", flexShrink:0 }} />
                        {p.strategy}
                      </span>
                    </td>
                    <td><span className={`tag ${p.side.toLowerCase()}`}>{p.side}</span></td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:10 }}>{fmtP(p.entry)}</td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:10 }}>{fmtP(p.current)}</td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:10 }}>{p.size}</td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:11, color: p.pnlPct>=0?"var(--green)":"var(--red)", fontWeight:600 }}>
                      {p.pnlPct>=0?"+":""}{p.pnlPct}%
                    </td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--text2)" }}>{p.age}</td>
                    <td>
                      <div style={{ display:"flex", gap:5 }}>
                        <button className="btn btn-close" style={{ padding:"2px 7px" }} onClick={() => setCloseTarget(p)}>Close</button>
                        <button className="btn btn-kill" style={{ padding:"2px 7px" }}>Kill</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

      {/* Close confirm modal */}
      {closeTarget && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:6, padding:24, width:360, display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontFamily:"var(--mono)", fontSize:13, fontWeight:600, color:"var(--amber)" }}>Close Position</div>
            <div style={{ fontSize:12, color:"var(--text1)", lineHeight:1.6 }}>
              Close <strong style={{color:"var(--text0)"}}>{closeTarget.side}</strong> position on <strong style={{color:"var(--text0)"}}>{pair}</strong> for <strong style={{color:"var(--blue)"}}>{closeTarget.id}</strong>?
              <br/>Entry: {fmtP(closeTarget.entry)} · PnL: <span style={{color: closeTarget.pnlPct>=0?"var(--green)":"var(--red)"}}>{closeTarget.pnlPct>=0?"+":""}{closeTarget.pnlPct}%</span>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button className="btn" style={{ background:"transparent", color:"var(--text1)", border:"1px solid var(--border)" }} onClick={() => setCloseTarget(null)}>Cancel</button>
              <button className="btn btn-close" style={{ padding:"6px 16px", fontSize:10 }} onClick={() => setCloseTarget(null)}>Close at Market</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function TradingView() {
  const [activePair, setActivePair] = useState("BTC/USDT");
  const [activeEx,   setActiveEx]   = useState("Binance");
  const [tf,         setTf]         = useState("1h");
  const [mode,       setMode]       = useState("ALL");
  const [oFilter,    setOFilter]    = useState("ALL");
  const [orders,     setOrders]     = useState(() => {
    const seed = [];
    for (let i = 0; i < 32; i++) seed.push(genOrder(PAIRS_CFG[Math.floor(Math.random() * PAIRS_CFG.length)]));
    return seed.reverse();
  });

  const [pairsData] = useState(() =>
    PAIRS_CFG.map(p => {
      const candles = genCandles(120, p.base, p.vol);
      return { ...p, candles, positions: genPositions(candles), chartOrders: genChartOrders(candles), botCount: Math.floor(Math.random() * 4) + 1 };
    })
  );

  // Simulated live orders
  useEffect(() => {
    const iv = setInterval(() => {
      const pc = PAIRS_CFG[Math.floor(Math.random() * PAIRS_CFG.length)];
      setOrders(prev => [genOrder(pc), ...prev].slice(0, 100));
    }, 1900);
    return () => clearInterval(iv);
  }, []);

  const apd = pairsData.find(p => p.pair === activePair);
  const lastC  = apd?.candles[apd.candles.length - 1];
  const firstC = apd?.candles[0];
  const chg    = lastC && firstC ? (lastC.close - firstC.close) / firstC.close * 100 : 0;

  const totalBots      = pairsData.reduce((s, p) => s + p.botCount, 0);
  const totalPositions = pairsData.reduce((s, p) => s + p.positions.length, 0);
  const unrealizedPnl  = pairsData.reduce((s, p) => s + p.positions.reduce((ps, pos) => ps + pos.pnlPct, 0), 0);

  const visiblePositions = mode === "ALL" ? (apd?.positions || []) : (apd?.positions.slice(0,1) || []);

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">

        {/* TOPBAR */}
        <div className="topbar">
          <div className="logo">
            <div className="pulse" />
            STELLA TRADING
          </div>
          <div className="tb-sep" />
          <div className="tb-stat">
            <div className="tb-lbl">Active Bots</div>
            <div className="tb-val g">{totalBots}</div>
          </div>
          <div className="tb-stat">
            <div className="tb-lbl">Open Positions</div>
            <div className="tb-val">{totalPositions}</div>
          </div>
          <div className="tb-stat">
            <div className="tb-lbl">Unrealized P&L</div>
            <div className={`tb-val ${unrealizedPnl>=0?"g":"r"}`}>{unrealizedPnl>=0?"+":""}{unrealizedPnl.toFixed(2)}%</div>
          </div>
          <div className="tb-sep" />
          <div className="tb-stat">
            <div className="tb-lbl">Viewing</div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:1 }}>
              <span style={{ fontFamily:"var(--mono)", fontSize:13, fontWeight:600, color:"var(--text0)" }}>{activePair}</span>
              <span style={{ fontFamily:"var(--mono)", fontSize:11, color: chg>=0?"var(--green)":"var(--red)" }}>{chg>=0?"+":""}{chg.toFixed(2)}%</span>
            </div>
          </div>
          <select className="tv-select" value={activeEx} onChange={e => setActiveEx(e.target.value)}>
            {ALL_EXCHANGES.map(ex => <option key={ex}>{ex}</option>)}
          </select>
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>{new Date().toLocaleTimeString()}</span>
            <div className="live-badge">
              <div className="pulse" />
              <span>Live</span>
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="body">
          {/* LEFT: pair list */}
          <PairSidebar pairs={pairsData} active={activePair} onSelect={setActivePair} />

          {/* CENTER */}
          <div className="center">
            {/* Chart header */}
            <div className="chart-hdr">
              <span className="ch-pair">{activePair}</span>
              {/* Exchange pill */}
              <div className="ex-pill" style={{ background: (EX[activeEx]||"#999") + "18", border:`1px solid ${(EX[activeEx]||"#999")}44` }}>
                <div className="ex-dot" style={{ background: EX[activeEx]||"#999" }} />
                <span style={{ fontFamily:"var(--mono)", fontSize:9, fontWeight:600, color: EX[activeEx]||"var(--text2)" }}>{activeEx}</span>
              </div>
              {lastC && <span className="ch-price" style={{ color: chg>=0?"var(--green)":"var(--red)" }}>{fmtP(lastC.close)}</span>}
              <span className="ch-chg" style={{ color: chg>=0?"var(--green)":"var(--red)" }}>{chg>=0?"+":""}{chg.toFixed(2)}%</span>

              <div className="tf-row">
                {["1m","5m","15m","1h","4h","1D"].map(t => (
                  <button key={t} className={`tf-btn ${tf===t?"on":""}`} onClick={() => setTf(t)}>{t}</button>
                ))}
              </div>

              {/* Position legend */}
              {apd?.positions.length > 0 && (
                <div style={{ display:"flex", gap:10 }}>
                  {apd.positions.map((p, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>
                      <div style={{ width:14, height:2, background:p.color, borderRadius:1 }} />
                      {p.id.replace("BOT-","")} · {p.side}
                    </div>
                  ))}
                </div>
              )}

              <div className="mode-row">
                <button className={`mode-btn ${mode==="ALL"?"on":""}`} onClick={() => setMode("ALL")}>All Bots</button>
                <button className={`mode-btn ${mode==="FOCUS"?"on":""}`} onClick={() => setMode("FOCUS")}>Focus</button>
              </div>
            </div>

            {/* Chart */}
            <div className="chart-area">
              {apd && (
                <CandlestickChart
                  candles={apd.candles}
                  positions={visiblePositions}
                  chartOrders={apd.chartOrders}
                />
              )}
            </div>

            {/* Position table */}
            <PositionTable positions={visiblePositions} pair={activePair} />
          </div>

          {/* RIGHT: live order stream */}
          <OrderStream orders={orders} filter={oFilter} onFilter={setOFilter} />
        </div>
      </div>
    </>
  );
}
