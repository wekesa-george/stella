"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────
function rnd(a: number, b: number) { return a + Math.random() * (b - a); }
function ri(a: number, b: number) { return Math.floor(rnd(a, b)); }

function fmtP(p: number) {
  if (p >= 10000) return p.toFixed(1);
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(3);
  return p.toFixed(4);
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const EX: Record<string, string> = {
  Binance: "#C99400",
  Bybit: "#00e5a0",
  OKX: "#3d9df3",
  Kraken: "#8B5CF6",
  Kucoin: "#21A179",
};

const STRAT_COL: Record<string, string> = {
  "Momentum Grid": "#00e5a0",
  "Arbitrage V2": "#3d9df3",
  "Mean Reversion": "#f5a623",
  "Trend Follow": "#a78bfa",
  "Scalp Pro": "#ff4757",
};

const PAIRS_CFG = [
  { pair: "BTC/USDT", base: 65420.0, vol: 0.009 },
  { pair: "ETH/USDT", base: 3284.50, vol: 0.011 },
  { pair: "SOL/USDT", base: 178.40, vol: 0.015 },
  { pair: "BNB/USDT", base: 612.30, vol: 0.010 },
  { pair: "XRP/USDT", base: 0.6280, vol: 0.014 },
  { pair: "ADA/USDT", base: 0.4850, vol: 0.013 },
  { pair: "DOGE/USDT", base: 0.1421, vol: 0.018 },
  { pair: "AVAX/USDT", base: 38.42, vol: 0.016 },
];

const ALL_EXCHANGES = ["Binance", "Bybit", "OKX", "Kraken", "Kucoin"];
const BOT_IDS = ["BOT-0003", "BOT-0007", "BOT-0012", "BOT-0015", "BOT-0021", "BOT-0024"];
const BOT_STRAT: Record<string, string> = {
  "BOT-0003": "Momentum Grid",
  "BOT-0007": "Arbitrage V2",
  "BOT-0012": "Mean Reversion",
  "BOT-0015": "Trend Follow",
  "BOT-0021": "Scalp Pro",
  "BOT-0024": "Momentum Grid",
};

// ─── DATA GENERATION ─────────────────────────────────────────────────────────
function genCandles(n = 120, base = 65000, vol = 0.009) {
  let close = base;
  return Array.from({ length: n }, (_, i) => {
    const d = (Math.random() - 0.47) * vol;
    const open = close;
    close = open * (1 + d);
    const high = Math.max(open, close) * (1 + Math.random() * vol * 0.45);
    const low = Math.min(open, close) * (1 - Math.random() * vol * 0.45);
    return { i, open, high, low, close, volume: (Math.random() * 700 + 80) * 1000 };
  });
}

function genPositions(candles: ReturnType<typeof genCandles>) {
  const last = candles[candles.length - 1].close;
  const count = Math.floor(Math.random() * 3) + 1;
  return BOT_IDS.slice(0, count).map((id) => {
    const off = (Math.random() - 0.5) * 0.05;
    const entry = last * (1 + off);
    const side = Math.random() > 0.42 ? "LONG" : "SHORT";
    const pnl = side === "LONG" ? ((last - entry) / entry) * 100 : ((entry - last) / entry) * 100;
    return {
      id,
      strategy: BOT_STRAT[id],
      color: STRAT_COL[BOT_STRAT[id]],
      side,
      entry: parseFloat(entry.toFixed(4)),
      current: last,
      pnlPct: parseFloat(pnl.toFixed(2)),
      size: parseFloat((Math.random() * 0.8 + 0.05).toFixed(4)),
      age: `${Math.floor(Math.random() * 240) + 5}m`,
    };
  });
}

function genChartOrders(candles: ReturnType<typeof genCandles>) {
  return candles
    .filter((_, i) => i > 0 && Math.random() < 0.07)
    .map((c) => ({
      i: c.i,
      price: c.close * (1 + (Math.random() - 0.5) * 0.0015),
      side: Math.random() > 0.45 ? "BUY" : "SELL",
      bot: BOT_IDS[Math.floor(Math.random() * BOT_IDS.length)],
      filled: Math.random() > 0.14,
    }));
}

function genOrder(pairCfg: typeof PAIRS_CFG[0]) {
  const p = pairCfg || PAIRS_CFG[0];
  const side = Math.random() > 0.5 ? "BUY" : "SELL";
  const sts = ["FILLED", "FILLED", "FILLED", "PARTIAL", "REJECTED"];
  const bot = BOT_IDS[Math.floor(Math.random() * BOT_IDS.length)];
  return {
    id: Math.random().toString(36).substr(2, 8),
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

// ─── SPARKLINE COMPONENT ─────────────────────────────────────────────────────
function Spark({ data, color, w = 64, h = 24 }: { data: any[]; color: string; w?: number; h?: number }) {
  if (!data || data.length < 2) return null;
  const vals = data.map((c) => c.close);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const rng = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - mn) / rng) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

// ─── CANDLESTICK CHART ───────────────────────────────────────────────────────
function CandlestickChart({
  candles,
  positions,
  chartOrders,
}: {
  candles: ReturnType<typeof genCandles>;
  positions: ReturnType<typeof genPositions>;
  chartOrders: ReturnType<typeof genChartOrders>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 700, h: 380 });
  const [hov, setHov] = useState<number | null>(null);
  const [mxy, setMxy] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setDims({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const PAD = { t: 14, r: 72, b: 28, l: 8 };
  const VOL_H = Math.floor(dims.h * 0.18);
  const CH = dims.h - PAD.t - PAD.b - VOL_H - 4;
  const CW = dims.w - PAD.l - PAD.r;

  const prices = useMemo(() => candles.flatMap((c) => [c.high, c.low]), [candles]);
  const minP = useMemo(() => Math.min(...prices) * 0.9994, [prices]);
  const maxP = useMemo(() => Math.max(...prices) * 1.0006, [prices]);
  const maxVol = useMemo(() => Math.max(...candles.map((c) => c.volume)), [candles]);

  const toX = (i: number) => PAD.l + ((i + 0.5) / candles.length) * CW;
  const toY = (p: number) => PAD.t + (1 - (p - minP) / (maxP - minP)) * CH;
  const toYV = (v: number) => dims.h - PAD.b - (v / maxVol) * VOL_H;
  const cW = Math.max(2, (CW / candles.length) * 0.65);

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setMxy({ x: mx, y: my });
      setHov(Math.max(0, Math.min(candles.length - 1, Math.round((mx - PAD.l) / CW * candles.length - 0.5))));
    },
    [candles.length, CW]
  );

  const yTicks = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const p = minP + (i / 5) * (maxP - minP);
        return { p, y: toY(p) };
      }),
    [minP, maxP, dims]
  );

  const hovC = hov !== null ? candles[hov] : candles[candles.length - 1];
  const lastC = candles[candles.length - 1];
  const lastY = toY(lastC.close);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* OHLCV readout */}
      <div className="absolute top-3 left-4 flex gap-4 pointer-events-none z-10">
        {[
          ["O", hovC.open],
          ["H", hovC.high],
          ["L", hovC.low],
          ["C", hovC.close],
        ].map(([l, v]) => (
          <div key={l} className="flex flex-col gap-0.5">
            <div className="font-mono text-[8px] text-[#5a7090] uppercase">{l}</div>
            <div
              className="font-mono text-[11px] font-medium"
              style={{
                color: l === "C" ? (hovC.close >= hovC.open ? "#00e5a0" : "#ff4757") : "#8fa3b8",
              }}
            >
              {fmtP(v as number)}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-0.5">
          <div className="font-mono text-[8px] text-[#5a7090] uppercase">Vol</div>
          <div className="font-mono text-[11px] text-[#5a7090]">{(hovC.volume / 1e6).toFixed(2)}M</div>
        </div>
      </div>

      <svg
        className="w-full h-full cursor-crosshair"
        width={dims.w}
        height={dims.h}
        onMouseMove={onMove}
        onMouseLeave={() => {
          setHov(null);
          setMxy(null);
        }}
      >
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD.l} y1={t.y} x2={dims.w - PAD.r} y2={t.y} stroke="#1a2230" strokeWidth="1" strokeDasharray="3 5" />
        ))}

        {/* Volume bars */}
        {candles.map((c, i) => {
          const vx = toX(i);
          const vy = toYV(c.volume);
          const vH = dims.h - PAD.b - vy;
          return (
            <rect
              key={`v${i}`}
              x={vx - cW / 2}
              y={vy}
              width={cW}
              height={Math.max(1, vH)}
              fill={c.close >= c.open ? "rgba(0,229,160,0.16)" : "rgba(255,71,87,0.16)"}
            />
          );
        })}

        {/* Vol divider */}
        <line x1={PAD.l} y1={dims.h - PAD.b - VOL_H} x2={dims.w - PAD.r} y2={dims.h - PAD.b - VOL_H} stroke="#1e2d40" strokeWidth="1" />

        {/* Candle bodies + wicks */}
        {candles.map((c, i) => {
          const x = toX(i);
          const yO = toY(c.open);
          const yC = toY(c.close);
          const yH = toY(c.high);
          const yL = toY(c.low);
          const bull = c.close >= c.open;
          const col = bull ? "#00e5a0" : "#ff4757";
          const bY = Math.min(yO, yC);
          const bH = Math.max(1.5, Math.abs(yC - yO));
          return (
            <g key={`c${i}`}>
              <line x1={x} y1={yH} x2={x} y2={yL} stroke={col} strokeWidth="1" opacity="0.65" />
              <rect
                x={x - cW / 2}
                y={bY}
                width={cW}
                height={bH}
                fill={bull ? "rgba(0,229,160,0.88)" : "rgba(255,71,87,0.84)"}
                stroke={col}
                strokeWidth="0.4"
              />
            </g>
          );
        })}

        {/* Order markers (triangles) */}
        {chartOrders.map((o, idx) => {
          const x = toX(o.i);
          const yp = toY(o.price);
          if (yp < PAD.t || yp > PAD.t + CH) return null;
          const isBuy = o.side === "BUY";
          const col = !o.filled ? "#ff4757" : isBuy ? "#00e5a0" : "#f5a623";
          const oy = isBuy ? yp + 10 : yp - 10;
          const tri = isBuy ? `${x},${oy - 9} ${x - 5},${oy} ${x + 5},${oy}` : `${x},${oy + 9} ${x - 5},${oy} ${x + 5},${oy}`;
          return (
            <polygon key={idx} points={tri} fill={col} opacity="0.82">
              <title>
                {o.bot} {o.side} {fmtP(o.price)} {o.filled ? "FILLED" : "REJECTED"}
              </title>
            </polygon>
          );
        })}

        {/* Bot position lines */}
        {positions.map((pos, idx) => {
          const y = toY(pos.entry);
          if (y < PAD.t - 4 || y > PAD.t + CH + 4) return null;
          return (
            <g key={idx}>
              <line x1={PAD.l} y1={y} x2={dims.w - PAD.r} y2={y} stroke={pos.color} strokeWidth="1" strokeDasharray="6 3" opacity="0.65" />
              <rect x={dims.w - PAD.r + 2} y={y - 8} width={PAD.r - 4} height={15} fill={pos.color} fillOpacity="0.15" rx="1" />
              <text x={dims.w - PAD.r + 5} y={y + 3} fontSize="8" fill={pos.color} fontFamily="monospace" fontWeight="600">
                {pos.id.replace("BOT-", "")} {pos.side[0]}
              </text>
            </g>
          );
        })}

        {/* Current price line */}
        <line x1={PAD.l} y1={lastY} x2={dims.w - PAD.r} y2={lastY} stroke="#00e5a0" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />
        <rect x={dims.w - PAD.r + 1} y={lastY - 8} width={PAD.r - 2} height={15} fill="#00e5a0" rx="2" />
        <text x={dims.w - PAD.r + 5} y={lastY + 4} fontSize="9" fill="#000" fontFamily="monospace" fontWeight="700">
          {fmtP(lastC.close)}
        </text>

        {/* Y-axis price labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={dims.w - PAD.r + 5} y={t.y + 3} fontSize="9" fill="#5a7090" fontFamily="monospace">
            {fmtP(t.p)}
          </text>
        ))}

        {/* Crosshair */}
        {mxy && hov !== null && (
          <>
            <line x1={toX(hov)} y1={PAD.t} x2={toX(hov)} y2={dims.h - PAD.b} stroke="#253550" strokeWidth="1" />
            <line x1={PAD.l} y1={mxy.y} x2={dims.w - PAD.r} y2={mxy.y} stroke="#253550" strokeWidth="1" />
            <rect x={dims.w - PAD.r + 1} y={mxy.y - 8} width={PAD.r - 2} height={15} fill="#1a2230" stroke="#253550" rx="2" />
            <text x={dims.w - PAD.r + 5} y={mxy.y + 4} fontSize="9" fill="#8fa3b8" fontFamily="monospace">
              {fmtP(minP + (1 - (mxy.y - PAD.t) / CH) * (maxP - minP))}
            </text>
            <rect x={toX(hov) - cW / 2 - 2} y={PAD.t} width={cW + 4} height={CH} fill="rgba(255,255,255,0.025)" />
          </>
        )}
      </svg>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function TradingView() {
  const [activePair, setActivePair] = useState("BTC/USDT");
  const [activeEx, setActiveEx] = useState("Binance");
  const [tf, setTf] = useState("1h");
  const [mode, setMode] = useState("ALL");
  const [oFilter, setOFilter] = useState("ALL");
  const [closeTarget, setCloseTarget] = useState<any>(null);
  const [time, setTime] = useState("");
  const [showPairs, setShowPairs] = useState(false);
  const [showOrders, setShowOrders] = useState(false);

  const [orders, setOrders] = useState<ReturnType<typeof genOrder>[]>(() => {
    const seed = [];
    for (let i = 0; i < 32; i++) seed.push(genOrder(PAIRS_CFG[Math.floor(Math.random() * PAIRS_CFG.length)]));
    return seed.reverse();
  });

  const [pairsData] = useState(() =>
    PAIRS_CFG.map((p) => {
      const candles = genCandles(120, p.base, p.vol);
      return {
        ...p,
        candles,
        positions: genPositions(candles),
        chartOrders: genChartOrders(candles),
        botCount: Math.floor(Math.random() * 4) + 1,
      };
    })
  );

  // Update time
  useEffect(() => {
    const updateTime = () => setTime(new Date().toLocaleTimeString());
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Simulated live orders
  useEffect(() => {
    const iv = setInterval(() => {
      const pc = PAIRS_CFG[Math.floor(Math.random() * PAIRS_CFG.length)];
      setOrders((prev) => [genOrder(pc), ...prev].slice(0, 100));
    }, 1900);
    return () => clearInterval(iv);
  }, []);

  const apd = pairsData.find((p) => p.pair === activePair);
  const lastC = apd?.candles[apd.candles.length - 1];
  const firstC = apd?.candles[0];
  const chg = lastC && firstC ? ((lastC.close - firstC.close) / firstC.close) * 100 : 0;

  const totalBots = pairsData.reduce((s, p) => s + p.botCount, 0);
  const totalPositions = pairsData.reduce((s, p) => s + p.positions.length, 0);
  const unrealizedPnl = pairsData.reduce((s, p) => s + p.positions.reduce((ps, pos) => ps + pos.pnlPct, 0), 0);

  const visiblePositions = mode === "ALL" ? apd?.positions || [] : apd?.positions.slice(0, 1) || [];
  const feedRef = useRef<HTMLDivElement>(null);
  const shownOrders =
    oFilter === "ALL" ? orders : oFilter === "REJECTED" ? orders.filter((o) => o.status === "REJECTED") : orders.filter((o) => o.side === oFilter);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [orders.length]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#080c10]">
      {/* TOPBAR */}
      <div className="flex items-center min-h-[50px] px-3 md:px-5 bg-[#0d1117] border-b border-[#1e2d40] flex-shrink-0 gap-2 md:gap-5 z-100 flex-wrap py-2">
        <div className="flex flex-col">
          <div className="text-[9px] uppercase tracking-wider text-[#5a7090]">Active Bots</div>
          <div className="font-mono text-xs font-semibold text-[#00e5a0]">{totalBots}</div>
        </div>
        <div className="flex flex-col">
          <div className="text-[9px] uppercase tracking-wider text-[#5a7090]">Open Positions</div>
          <div className="font-mono text-xs font-semibold text-[#e8edf3]">{totalPositions}</div>
        </div>
        <div className="flex flex-col">
          <div className="text-[9px] uppercase tracking-wider text-[#5a7090]">Unrealized P&L</div>
          <div className={`font-mono text-xs font-semibold ${unrealizedPnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"}`}>
            {unrealizedPnl >= 0 ? "+" : ""}
            {unrealizedPnl.toFixed(2)}%
          </div>
        </div>
        <div className="hidden md:block w-px h-6 bg-[#1e2d40]" />
        <div className="flex flex-col">
          <div className="text-[9px] uppercase tracking-wider text-[#5a7090]">Viewing</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-[13px] font-semibold text-[#e8edf3]">{activePair}</span>
            <span className={`font-mono text-[11px] ${chg >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"}`}>
              {chg >= 0 ? "+" : ""}
              {chg.toFixed(2)}%
            </span>
          </div>
        </div>
        <select
          className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2 py-1 rounded cursor-pointer outline-none"
          value={activeEx}
          onChange={(e) => setActiveEx(e.target.value)}
        >
          {ALL_EXCHANGES.map((ex) => (
            <option key={ex}>{ex}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {time && <span className="hidden md:inline font-mono text-[9px] text-[#5a7090]">{time}</span>}
          <div className="flex items-center gap-2 px-2 md:px-3 py-1 bg-[rgba(0,229,160,0.10)] border border-[rgba(0,229,160,0.2)] rounded">
            <div className="w-[7px] h-[7px] bg-[#00e5a0] rounded-full animate-pulse" />
            <span className="font-mono text-[9px] text-[#00e5a0] uppercase tracking-wider">Live</span>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile toggle buttons */}
        <button
          className="md:hidden absolute top-2 left-2 z-50 px-2 py-1 bg-[#0d1117] border border-[#1e2d40] rounded text-[#e8edf3] text-[9px] font-mono uppercase"
          onClick={() => setShowPairs(!showPairs)}
        >
          Pairs
        </button>
        <button
          className="md:hidden absolute top-2 right-2 z-50 px-2 py-1 bg-[#0d1117] border border-[#1e2d40] rounded text-[#e8edf3] text-[9px] font-mono uppercase"
          onClick={() => setShowOrders(!showOrders)}
        >
          Orders
        </button>

        {/* LEFT: Pair Sidebar */}
        <div className={`${showPairs ? 'block' : 'hidden'} md:block w-48 flex-shrink-0 bg-[#0d1117] border-r border-[#1e2d40] overflow-y-auto flex flex-col absolute md:relative inset-y-0 left-0 z-40`}>
          <div className="px-3 py-2 border-b border-[#1e2d40] font-mono text-[9px] uppercase tracking-wider text-[#5a7090] flex items-center justify-between">
            <span>Markets · {pairsData.length} pairs</span>
            <button className="md:hidden text-[#8fa3b8] hover:text-[#e8edf3]" onClick={() => setShowPairs(false)}>✕</button>
          </div>
          {pairsData.map((p) => {
            const last = p.candles[p.candles.length - 1].close;
            const first = p.candles[0].close;
            const pairChg = ((last - first) / first) * 100;
            const up = pairChg >= 0;
            return (
              <div
                key={p.pair}
                className={`px-3 py-2.5 border-b border-[#1e2d40] cursor-pointer transition-colors hover:bg-[#131920] flex flex-col gap-1 border-l-2 ${
                  activePair === p.pair ? "bg-[#131920] border-l-[#00e5a0]" : "border-l-transparent"
                }`}
                onClick={() => {
                  setActivePair(p.pair);
                  setShowPairs(false);
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[11px] font-semibold text-[#e8edf3]">{p.pair}</span>
                  <span className={`font-mono text-[10px] ${up ? "text-[#00e5a0]" : "text-[#ff4757]"}`}>
                    {up ? "+" : ""}
                    {pairChg.toFixed(2)}%
                  </span>
                </div>
                <div className={`font-mono text-[13px] font-semibold ${up ? "text-[#00e5a0]" : "text-[#e8edf3]"}`}>{fmtP(last)}</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[9px] text-[#5a7090]">
                    <div className="w-[5px] h-[5px] rounded-full bg-[#00e5a0]" />
                    {p.botCount} bot{p.botCount !== 1 ? "s" : ""}
                  </div>
                  <Spark data={p.candles.slice(-30)} color={up ? "#00e5a0" : "#ff4757"} />
                </div>
              </div>
            );
          })}
        </div>

        {/* CENTER */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Chart Header */}
          <div className="px-2 md:px-4 py-2 border-b border-[#1e2d40] flex items-center gap-2 md:gap-3 flex-shrink-0 bg-[#0d1117] flex-wrap">
            <span className="font-mono text-[13px] md:text-[15px] font-semibold text-[#e8edf3]">{activePair}</span>

            {/* Exchange pill */}
            <div
              className="inline-flex items-center gap-1 px-2 py-1 rounded-sm"
              style={{
                background: (EX[activeEx] || "#999") + "18",
                border: `1px solid ${(EX[activeEx] || "#999")}44`,
              }}
            >
              <div className="w-[5px] h-[5px] rounded-full" style={{ background: EX[activeEx] || "#999" }} />
              <span className="font-mono text-[9px] font-semibold tracking-wide" style={{ color: EX[activeEx] || "#5a7090" }}>
                {activeEx}
              </span>
            </div>

            {lastC && (
              <span className={`font-mono text-[12px] md:text-[14px] font-semibold ${chg >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"}`}>{fmtP(lastC.close)}</span>
            )}
            <span className={`font-mono text-[10px] md:text-[11px] ${chg >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"}`}>
              {chg >= 0 ? "+" : ""}
              {chg.toFixed(2)}%
            </span>

            {/* Timeframe buttons */}
            <div className="flex gap-0.5 flex-wrap">
              {["1m", "5m", "15m", "1h", "4h", "1D"].map((t) => (
                <button
                  key={t}
                  className={`px-1.5 md:px-2 py-1 border border-[#1e2d40] font-mono text-[9px] md:text-[10px] cursor-pointer rounded-sm transition-all ${
                    tf === t
                      ? "bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border-[rgba(61,157,243,0.35)]"
                      : "bg-transparent text-[#5a7090] hover:text-[#e8edf3] hover:border-[#253550]"
                  }`}
                  onClick={() => setTf(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Position legend - hidden on mobile */}
            {apd && apd.positions.length > 0 && (
              <div className="hidden lg:flex gap-3">
                {apd.positions.map((p, i) => (
                  <div key={i} className="flex items-center gap-1 font-mono text-[9px] text-[#5a7090]">
                    <div className="w-[14px] h-[2px] rounded" style={{ background: p.color }} />
                    {p.id.replace("BOT-", "")} · {p.side}
                  </div>
                ))}
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-0.5 ml-auto">
              <button
                className={`px-2 md:px-3 py-1 border border-[#1e2d40] rounded-sm font-mono text-[9px] md:text-[10px] cursor-pointer transition-all uppercase tracking-wide ${
                  mode === "ALL"
                    ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)]"
                    : "bg-transparent text-[#5a7090] hover:text-[#e8edf3]"
                }`}
                onClick={() => setMode("ALL")}
              >
                <span className="hidden md:inline">All Bots</span>
                <span className="md:hidden">All</span>
              </button>
              <button
                className={`px-2 md:px-3 py-1 border border-[#1e2d40] rounded-sm font-mono text-[9px] md:text-[10px] cursor-pointer transition-all uppercase tracking-wide ${
                  mode === "FOCUS"
                    ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)]"
                    : "bg-transparent text-[#5a7090] hover:text-[#e8edf3]"
                }`}
                onClick={() => setMode("FOCUS")}
              >
                Focus
              </button>
            </div>
          </div>

          {/* Chart */}
          <div className="flex-1 relative overflow-hidden bg-[#080c10] min-h-0">
            {apd && <CandlestickChart candles={apd.candles} positions={visiblePositions} chartOrders={apd.chartOrders} />}
          </div>

          {/* Position Panel */}
          <div className="h-[180px] flex-shrink-0 border-t border-[#1e2d40] bg-[#0d1117] flex flex-col overflow-hidden">
            <div className="px-2 md:px-4 py-2 border-b border-[#1e2d40] font-mono text-[9px] uppercase tracking-wider text-[#5a7090] flex items-center justify-between">
              <span>
                Open Positions — {activePair}
              </span>
              <span className="text-[#5a7090]">
                {visiblePositions.length} position{visiblePositions.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1">
              {visiblePositions.length === 0 ? (
                <div className="px-3 py-4 font-mono text-[11px] text-[#5a7090]">No open positions on this pair.</div>
              ) : (
                <table className="w-full border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b border-[#1e2d40]">
                      <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920] whitespace-nowrap">
                        Bot
                      </th>
                      <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920] whitespace-nowrap">
                        Strategy
                      </th>
                      <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920] whitespace-nowrap">
                        Side
                      </th>
                      <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920] whitespace-nowrap">
                        Entry
                      </th>
                      <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920] whitespace-nowrap">
                        Mark
                      </th>
                      <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920] whitespace-nowrap">
                        Size
                      </th>
                      <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920] whitespace-nowrap">
                        PnL %
                      </th>
                      <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920] whitespace-nowrap">
                        Age
                      </th>
                      <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1 text-left bg-[#131920] whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePositions.map((p, i) => (
                      <tr key={i} className="border-b border-[#1e2d40] hover:bg-[#131920] transition-colors">
                        <td className="px-3 py-2 font-mono text-[10px] text-[#3d9df3] font-semibold">{p.id}</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1 text-[10px] text-[#5a7090]">
                            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: p.color }} />
                            {p.strategy}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wide font-mono ${
                              p.side === "LONG"
                                ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                                : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                            }`}
                          >
                            {p.side}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{fmtP(p.entry)}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{fmtP(p.current)}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{p.size}</td>
                        <td className="px-3 py-2 font-mono text-[11px] font-semibold" style={{ color: p.pnlPct >= 0 ? "#00e5a0" : "#ff4757" }}>
                          {p.pnlPct >= 0 ? "+" : ""}
                          {p.pnlPct}%
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-[#5a7090]">{p.age}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              className="px-2 py-1 rounded-sm text-[9px] font-semibold uppercase tracking-wide cursor-pointer border transition-all bg-[rgba(245,166,35,0.10)] text-[#f5a623] border-[rgba(245,166,35,0.3)] hover:bg-[#f5a623] hover:text-black"
                              onClick={() => setCloseTarget(p)}
                            >
                              Close
                            </button>
                            <button className="px-2 py-1 rounded-sm text-[9px] font-semibold uppercase tracking-wide cursor-pointer border transition-all bg-[rgba(255,71,87,0.10)] text-[#ff4757] border-[rgba(255,71,87,0.3)] hover:bg-[#ff4757] hover:text-white">
                              Kill
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Order Stream */}
        <div className={`${showOrders ? 'block' : 'hidden'} md:block w-[268px] flex-shrink-0 bg-[#0d1117] border-l border-[#1e2d40] flex flex-col overflow-hidden absolute md:relative inset-y-0 right-0 z-40`}>
          <div className="px-3 py-2 border-b border-[#1e2d40] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">
              <div className="w-[7px] h-[7px] bg-[#00e5a0] rounded-full animate-pulse" />
              <span>Order Stream</span>
              <button className="md:hidden text-[#8fa3b8] hover:text-[#e8edf3] ml-2" onClick={() => setShowOrders(false)}>✕</button>
            </div>
            <div className="flex gap-1">
              {["ALL", "BUY", "SELL", "REJECTED"].map((f) => (
                <button
                  key={f}
                  className={`px-2 py-0.5 border border-[#1e2d40] rounded-sm font-mono text-[9px] cursor-pointer transition-all uppercase ${
                    oFilter === f ? "bg-[#1a2230] text-[#e8edf3] border-[#253550]" : "bg-transparent text-[#5a7090] hover:text-[#e8edf3]"
                  }`}
                  onClick={() => setOFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto" ref={feedRef}>
            {shownOrders.map((o) => {
              const scol = o.status === "FILLED" ? "#00e5a0" : o.status === "PARTIAL" ? "#f5a623" : "#ff4757";
              return (
                <div key={o.id} className="px-3 py-2 border-b border-[#1e2d40] transition-colors hover:bg-[#131920]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[9px] text-[#5a7090]">{o.time}</span>
                    <span className="font-mono text-[10px] font-semibold text-[#3d9df3]">{o.bot}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap mb-1">
                    <span
                      className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wide font-mono ${
                        o.side === "BUY" ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]" : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                      }`}
                    >
                      {o.side}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-[#e8edf3]">{o.pair}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wide font-mono ${
                        o.type === "LIMIT" ? "bg-[rgba(61,157,243,0.10)] text-[#3d9df3]" : "bg-[#1a2230] text-[#8fa3b8]"
                      }`}
                    >
                      {o.type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#8fa3b8]">
                      {o.size} @ <strong className="text-[#e8edf3]">{fmtP(o.price)}</strong>
                    </span>
                    <div className="flex items-center gap-1 font-mono text-[9px]" style={{ color: scol }}>
                      <div className="w-[5px] h-[5px] rounded-full" style={{ background: scol }} />
                      {o.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-[5px] h-[5px] rounded-full" style={{ background: EX[o.exchange] || "#999" }} />
                    <span className="font-mono text-[9px]" style={{ color: EX[o.exchange] || "#5a7090" }}>
                      {o.exchange}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Close confirm modal */}
      {closeTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center z-[1000]">
          <div className="bg-[#0d1117] border border-[#1e2d40] rounded-md p-6 w-[360px] flex flex-col gap-4">
            <div className="font-mono text-[13px] font-semibold text-[#f5a623]">Close Position</div>
            <div className="text-xs text-[#8fa3b8] leading-relaxed">
              Close <strong className="text-[#e8edf3]">{closeTarget.side}</strong> position on{" "}
              <strong className="text-[#e8edf3]">{activePair}</strong> for <strong className="text-[#3d9df3]">{closeTarget.id}</strong>?
              <br />
              Entry: {fmtP(closeTarget.entry)} · PnL:{" "}
              <span style={{ color: closeTarget.pnlPct >= 0 ? "#00e5a0" : "#ff4757" }}>
                {closeTarget.pnlPct >= 0 ? "+" : ""}
                {closeTarget.pnlPct}%
              </span>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 rounded-sm text-[9px] font-semibold uppercase tracking-wide cursor-pointer bg-transparent text-[#8fa3b8] border border-[#1e2d40] hover:text-[#e8edf3] transition-colors"
                onClick={() => setCloseTarget(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-sm text-[10px] font-semibold uppercase tracking-wide cursor-pointer bg-[rgba(245,166,35,0.10)] text-[#f5a623] border border-[rgba(245,166,35,0.3)] hover:bg-[#f5a623] hover:text-black transition-all"
                onClick={() => setCloseTarget(null)}
              >
                Close at Market
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
