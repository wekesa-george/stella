import { useState, useEffect } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar, CartesianGrid, ReferenceLine } from "recharts";

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════════
const C = {
  bg:         "#0B0D11",
  surface:    "#12151C",
  surfaceAlt: "#0E111A",
  surfaceHov: "#161B26",
  border:     "#1C2338",
  borderSub:  "#161B28",
  green:      "#00E5A0",
  greenDim:   "#00E5A012",
  greenMid:   "#00E5A035",
  red:        "#F04F59",
  redDim:     "#F04F5912",
  amber:      "#F59E0B",
  amberDim:   "#F59E0B12",
  blue:       "#3B82F6",
  blueDim:    "#3B82F612",
  purple:     "#A78BFA",
  purpleDim:  "#A78BFA12",
  textPri:    "#C8CDE0",
  textMid:    "#6B7590",
  textMuted:  "#4A5578",
  textDim:    "#2A3050",
  sidebar:    "#0E111A",
};
const mono = "'JetBrains Mono', 'Fira Code', monospace";

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

const BOT_EQUITY = {
  "bot-1": [9800,9940,9880,10120,10340,10210,10580,10420,10890,11240],
  "bot-2": [2500,2480,2510,2440,2390,2420,2370,2410,2355,2412],
  "bot-3": [1500,1522,1541,1560,1548,1580,1610,1598,1625,1655],
  "bot-4": [500,500,500,500,500,500,500,500,500,500],
  "bot-5": [3000,3090,3150,3220,3180,3250,3310,3290,3380,3450],
};

const BOT_TRADES = [
  { pair:"BTC/USDT", side:"BUY",  entry:97420, exit:98840, pnl:+39.74, date:"19 Feb 10:42", duration:"2h 14m", status:"open"   },
  { pair:"BTC/USDT", side:"SELL", entry:96900, exit:97810, pnl:+112.2, date:"19 Feb 08:22", duration:"55m",   status:"closed" },
  { pair:"BTC/USDT", side:"BUY",  entry:97100, exit:96880, pnl:-22.6,  date:"18 Feb 14:10", duration:"1h 32m",status:"closed" },
  { pair:"ETH/USDT", side:"BUY",  entry:3180,  exit:3220,  pnl:+16.80, date:"18 Feb 09:05", duration:"3h 20m",status:"closed" },
  { pair:"BTC/USDT", side:"SELL", entry:97320, exit:97010, pnl:+31.00, date:"17 Feb 16:44", duration:"45m",   status:"closed" },
];

const BOTS = [
  {
    id:"bot-1", name:"Momentum Alpha",   strategy:"Core Momentum",      strategyId:"strat-1",
    exchange:"Binance",  pair:"BTC/USDT",  status:"running",
    capital:5000,  pnlToday:+312.40, pnlTotal:+1240.00, pnlPct:+24.8,
    openPositions:2, totalTrades:148, winRate:64.2,
    heartbeat:"8s ago",  lastTrade:"4m ago",  startedAt:"Feb 01",
    drawdown:3.2,  maxDrawdown:8.4, sharpe:1.84,
    pairs:["BTC/USDT","ETH/USDT"],
    config:{ targetProfit:50, minImpulse:0.4, maxHold:45, minConfidence:0.72, leverage:1 },
  },
  {
    id:"bot-2", name:"Mean Rev Grid",    strategy:"Core Mean Reversion", strategyId:"strat-2",
    exchange:"Binance",  pair:"ETH/USDT", status:"running",
    capital:2500, pnlToday:-88.20,  pnlTotal:+340.00,  pnlPct:+13.6,
    openPositions:1, totalTrades:89, winRate:58.4,
    heartbeat:"12s ago", lastTrade:"22m ago", startedAt:"Feb 05",
    drawdown:5.8,  maxDrawdown:11.2, sharpe:1.21,
    pairs:["ETH/USDT"],
    config:{ gridLevels:8, gridSpacing:0.8, positionSize:5, rebalance:"auto" },
  },
  {
    id:"bot-3", name:"Impulse Scalper",  strategy:"Core Momentum",      strategyId:"strat-1",
    exchange:"Alpaca",   pair:"SOL/USDT", status:"paused",
    capital:1500, pnlToday:+54.80,  pnlTotal:+180.00,  pnlPct:+12.0,
    openPositions:0, totalTrades:312, winRate:61.8,
    heartbeat:"—",       lastTrade:"2h ago",  startedAt:"Feb 10",
    drawdown:0,    maxDrawdown:6.1,  sharpe:1.55,
    pairs:["SOL/USDT"],
    config:{ targetProfit:15, minImpulse:0.6, maxHold:20, minConfidence:0.80, leverage:1 },
  },
  {
    id:"bot-4", name:"Trend Follower",   strategy:"Core Trend Following",strategyId:"strat-3",
    exchange:"Binance",  pair:"BNB/USDT", status:"error",
    capital:500,  pnlToday:0,        pnlTotal:0,          pnlPct:0,
    openPositions:0, totalTrades:0,  winRate:0,
    heartbeat:"—",       lastTrade:"—",       startedAt:"Feb 19",
    drawdown:0,    maxDrawdown:0,    sharpe:null,
    errorMsg:"API credential invalid · Key permissions may have changed",
    pairs:["BNB/USDT"],
    config:{},
  },
  {
    id:"bot-5", name:"DCA Accumulator",  strategy:"Core DCA",           strategyId:"strat-4",
    exchange:"Binance",  pair:"BTC/USDT", status:"running",
    capital:3000, pnlToday:+88.40,  pnlTotal:+450.00,  pnlPct:+15.0,
    openPositions:1, totalTrades:44, winRate:72.7,
    heartbeat:"5s ago",  lastTrade:"1h ago",  startedAt:"Jan 28",
    drawdown:1.4,  maxDrawdown:5.2,  sharpe:2.10,
    pairs:["BTC/USDT"],
    config:{ interval:"4h", amount:100, maxBudget:3000, devDrop:3 },
  },
];

const STRATEGIES = [
  {
    id:"strat-1",
    name:"Core Impulse Momentum",
    type:"core_momentum",
    typeLabel:"Momentum",
    accentColor: C.green,
    description:"Uses physics-based trajectory analysis to detect high-impulse price movements. Enters on strong directional signals with high confidence, exits at predicted peak using kinetic energy dissipation model.",
    howItWorks:"The engine models each candle as a projectile: initial velocity (v₀), acceleration, and trajectory angle determine signal strength. Trades fire only when r² > 0.82 and confidence > 72%.",
    risk:"moderate",
    timeframe:"5m",
    minCapital:500,
    minTier:"stella_one",
    exchanges:["Binance","Alpaca","Hyperliquid"],
    pairs:["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT"],
    perf:{ winRate:64.2, avgReturn:1.8, maxDrawdown:8.4, sharpe:1.84, totalTrades:6248, calmar:2.1 },
    backtestReturn:+38.4,
    backtestPeriod:"Jan–Dec 2025",
    monthlyReturns:[+2.1,+3.4,-0.8,+4.2,+1.9,-1.2,+5.1,+3.8,+2.2,-0.4,+4.9,+3.1],
    equityCurve:[100,102,106,105,109,111,110,115,119,117,122,125,124,130,138],
    botsRunning:3,
    isCore:true,
    tags:["momentum","physics","short-term"],
  },
  {
    id:"strat-2",
    name:"Core Mean Reversion Grid",
    type:"core_mean_reversion",
    typeLabel:"Mean Reversion",
    accentColor: C.blue,
    description:"Places a symmetric grid of buy and sell orders around a moving average. Profits from oscillating price action by harvesting the spread between grid levels.",
    howItWorks:"Grid levels are set at fixed % intervals from the 20-period EMA. Position sizing scales with distance from mean — wider grids get smaller positions to manage drawdown during trending moves.",
    risk:"conservative",
    timeframe:"15m",
    minCapital:1000,
    minTier:"stella_one",
    exchanges:["Binance","Hyperliquid"],
    pairs:["ETH/USDT","BNB/USDT","XRP/USDT"],
    perf:{ winRate:58.4, avgReturn:1.1, maxDrawdown:11.2, sharpe:1.21, totalTrades:4120, calmar:1.4 },
    backtestReturn:+22.8,
    backtestPeriod:"Jan–Dec 2025",
    monthlyReturns:[+1.2,+2.1,+0.8,+1.9,+1.4,+2.2,-1.8,+1.6,+1.1,+2.4,+1.8,+2.0],
    equityCurve:[100,101,103,104,106,107,109,107,109,111,113,116,114,116,123],
    botsRunning:1,
    isCore:true,
    tags:["grid","mean-reversion","consistent"],
  },
  {
    id:"strat-3",
    name:"Core Trend Follower",
    type:"core_trend_following",
    typeLabel:"Trend Following",
    accentColor: C.amber,
    description:"Identifies sustained directional trends using multi-timeframe EMAs and volume confirmation. Rides moves until momentum exhaustion, using trailing stops to protect profits.",
    howItWorks:"Entry triggers when 9-EMA crosses 21-EMA on 1H with volume > 1.4× 20-period average. Exit via trailing stop set at 1.5× ATR, or RSI(14) > 75 for longs.",
    risk:"moderate",
    timeframe:"1h",
    minCapital:2000,
    minTier:"stella_unum",
    exchanges:["Binance","Alpaca"],
    pairs:["BTC/USDT","ETH/USDT","SOL/USDT"],
    perf:{ winRate:52.1, avgReturn:2.8, maxDrawdown:14.6, sharpe:1.42, totalTrades:1890, calmar:1.8 },
    backtestReturn:+31.2,
    backtestPeriod:"Jan–Dec 2025",
    monthlyReturns:[+4.2,-2.1,+6.8,-1.4,+3.9,+5.2,-2.8,+4.1,+3.2,-1.8,+6.4,+2.1],
    equityCurve:[100,104,102,109,108,112,117,115,119,123,121,127,131],
    botsRunning:0,
    isCore:true,
    tags:["trend","ema","swing"],
  },
  {
    id:"strat-4",
    name:"Core DCA Accumulator",
    type:"core_dca",
    typeLabel:"DCA",
    accentColor: C.purple,
    description:"Systematic dollar-cost averaging with drawdown-based enhancement. Buys fixed amounts on schedule and increases position size at predefined dip thresholds.",
    howItWorks:"Base buy fires every N hours. Enhanced buys trigger at -3%, -6%, -10% from last average. Max budget enforced strictly. All positions close together at configurable profit target.",
    risk:"conservative",
    timeframe:"4h",
    minCapital:500,
    minTier:"stella_one",
    exchanges:["Binance","Alpaca"],
    pairs:["BTC/USDT","ETH/USDT"],
    perf:{ winRate:72.7, avgReturn:1.4, maxDrawdown:5.2, sharpe:2.10, totalTrades:892, calmar:3.1 },
    backtestReturn:+27.6,
    backtestPeriod:"Jan–Dec 2025",
    monthlyReturns:[+1.8,+2.4,+1.1,+2.8,+2.2,+1.6,+2.1,+3.0,+1.9,+2.5,+2.8,+2.4],
    equityCurve:[100,102,104,105,108,110,112,114,117,119,122,125,128],
    botsRunning:1,
    isCore:true,
    tags:["dca","accumulation","low-risk"],
  },
  {
    id:"strat-5",
    name:"Core Arbitrage Scanner",
    type:"core_arbitrage",
    typeLabel:"Arbitrage",
    accentColor: "#06B6D4",
    description:"Cross-exchange spread detection with automated execution. Identifies pricing inefficiencies between Binance and Alpaca and executes simultaneous buy/sell pairs.",
    howItWorks:"Continuously monitors the same asset pair across exchanges. When spread > fee threshold + 0.15% buffer, fires a coordinated buy on the cheaper leg and sell on the expensive leg.",
    risk:"conservative",
    timeframe:"1m",
    minCapital:5000,
    minTier:"stella_eon",
    exchanges:["Binance","Alpaca"],
    pairs:["BTC/USDT","ETH/USDT"],
    perf:{ winRate:81.4, avgReturn:0.4, maxDrawdown:2.1, sharpe:3.40, totalTrades:12480, calmar:5.2 },
    backtestReturn:+18.4,
    backtestPeriod:"Jan–Dec 2025",
    monthlyReturns:[+1.2,+1.4,+1.3,+1.5,+1.6,+1.4,+1.8,+1.5,+1.6,+1.7,+1.4,+1.6],
    equityCurve:[100,101,103,104,106,107,109,111,112,114,115,117,118],
    botsRunning:0,
    isCore:true,
    tags:["arbitrage","low-risk","high-freq"],
    tierLocked:true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

const fmt = {
  usd:  v => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  abs:  v => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 }),
  pct:  v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%",
  num:  v => v?.toLocaleString() ?? "—",
};

function M({ size=11, color=C.textPri, weight=500, caps=false, dim=false, style={}, children }) {
  return <span style={{ fontFamily:mono, fontSize:size, color:dim?C.textMuted:color, fontWeight:weight,
    letterSpacing:caps?"0.11em":"0.03em", textTransform:caps?"uppercase":"none", ...style }}>{children}</span>;
}
function Lbl({ children, color=C.textMuted, style={} }) {
  return <M size={9} color={color} weight={600} caps style={{ letterSpacing:"0.13em", ...style }}>{children}</M>;
}
function Divider({ my=0 }) {
  return <div style={{ height:1, background:C.borderSub, margin:`${my}px 0` }} />;
}
function Badge({ children, color=C.green, dot=false }) {
  return (
    <span style={{ background:color+"18", border:`1px solid ${color}35`, borderRadius:2,
      padding:"2px 7px", fontFamily:mono, fontSize:9, color, fontWeight:700, letterSpacing:"0.1em",
      display:"inline-flex", alignItems:"center", gap:4 }}>
      {dot && <span style={{ width:5, height:5, borderRadius:"50%", background:color, display:"inline-block" }} />}
      {children}
    </span>
  );
}

const statusMeta = {
  running: { color:C.green,  label:"RUNNING", pulse:true  },
  paused:  { color:C.amber,  label:"PAUSED",  pulse:false },
  error:   { color:C.red,    label:"ERROR",   pulse:false },
  stopped: { color:C.textDim,label:"STOPPED", pulse:false },
};

function StatusDot({ status }) {
  const m = statusMeta[status]||statusMeta.stopped;
  return (
    <span style={{ position:"relative", display:"inline-flex", width:8, height:8, alignItems:"center", justifyContent:"center" }}>
      {m.pulse && <span style={{ position:"absolute", width:14, height:14, borderRadius:"50%",
        background:m.color+"28", animation:"pulse 2s ease-in-out infinite" }} />}
      <span style={{ width:7, height:7, borderRadius:"50%", background:m.color, display:"block" }} />
    </span>
  );
}

function Sparkline({ data, color=C.green, height=30, style={} }) {
  if (!data?.length) return null;
  const w=100, h=height;
  const min=Math.min(...data), max=Math.max(...data), range=max-min||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-min)/range)*h}`);
  const fillD=`M 0,${h} L ${pts.join(" L ")} L ${w},${h} Z`;
  const lineD=`M ${pts.join(" L ")}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display:"block", ...style }}>
      <defs>
        <linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#sg${color.replace("#","")})`}/>
      <path d={lineD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PrimaryBtn({ children, onClick, small=false, disabled=false, icon="" }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background:disabled?"#1A2030":C.green,
      color:disabled?"#3D4560":"#0A0D14", border:"none", borderRadius:3,
      padding:small?"6px 14px":"9px 18px", fontFamily:mono,
      fontSize:small?9:10, letterSpacing:"0.1em", textTransform:"uppercase",
      fontWeight:700, cursor:disabled?"not-allowed":"pointer", display:"inline-flex",
      alignItems:"center", gap:6 }}>
      {icon && <span>{icon}</span>}{children}
    </button>
  );
}
function GhostBtn({ children, onClick, small=false, danger=false }) {
  return (
    <button onClick={onClick} style={{ background:"transparent",
      border:`1px solid ${danger?C.red+"40":C.border}`,
      borderRadius:3, padding:small?"6px 12px":"9px 16px",
      fontFamily:mono, fontSize:small?9:10, letterSpacing:"0.1em",
      color:danger?C.red:C.textMuted, cursor:"pointer",
      textTransform:"uppercase", fontWeight:600 }}>
      {children}
    </button>
  );
}

function SectionCard({ title, action, children, style={} }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, overflow:"hidden", ...style }}>
      {title && (
        <>
          <div style={{ padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <M size={11} weight={700} style={{ letterSpacing:"0.06em" }}>{title}</M>
            {action}
          </div>
          <Divider />
        </>
      )}
      {children}
    </div>
  );
}

function StatCell({ label, value, color=C.textPri, sub="" }) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      <M size={14} color={color} weight={700} style={{ display:"block", marginTop:4, lineHeight:1 }}>{value}</M>
      {sub && <M size={9} color={C.textMuted} style={{ display:"block", marginTop:3 }}>{sub}</M>}
    </div>
  );
}

function RiskBar({ level }) {
  const levels = { conservative:1, moderate:2, aggressive:3 };
  const n = levels[level]||1;
  const colors = { 1:C.green, 2:C.amber, 3:C.red };
  const labels = { conservative:"CONSERVATIVE", moderate:"MODERATE", aggressive:"AGGRESSIVE" };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ display:"flex", gap:3 }}>
        {[1,2,3].map(i=>(
          <div key={i} style={{ width:14, height:4, borderRadius:1,
            background:i<=n?colors[n]:C.border }} />
        ))}
      </div>
      <Lbl color={colors[n]}>{labels[level]}</Lbl>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, padding:"8px 12px" }}>
      <Lbl style={{ display:"block", marginBottom:4 }}>{label}</Lbl>
      {payload.map(p=>(
        <M key={p.name} size={12} color={p.color||C.green} weight={700} style={{ display:"block" }}>
          {typeof p.value==="number"&&p.value>100?"$"+p.value.toLocaleString():fmt.pct(p.value)}
        </M>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOT DETAIL PANEL
// ═══════════════════════════════════════════════════════════════════════════════

function BotDetailPanel({ bot, onClose }) {
  const [tab, setTab] = useState("overview");
  const eq = BOT_EQUITY[bot.id] || [];
  const eqData = eq.map((v,i)=>({ i:i+1, v }));
  const isUp = bot.pnlTotal >= 0;
  const tabs = ["overview","trades","settings"];

  return (
    <div style={{
      position:"fixed", top:0, right:0, bottom:0, width:520,
      background:C.surface, borderLeft:`1px solid ${C.border}`,
      zIndex:200, display:"flex", flexDirection:"column",
      animation:"slideIn 0.22s ease",
    }}>
      {/* Header */}
      <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
            <StatusDot status={bot.status} />
            <M size={14} weight={700} style={{ letterSpacing:"0.04em" }}>{bot.name}</M>
            <Badge color={statusMeta[bot.status].color}>{statusMeta[bot.status].label}</Badge>
          </div>
          <div style={{ display:"flex", gap:12 }}>
            <Lbl>{bot.strategy}</Lbl>
            <Lbl color={C.textDim}>·</Lbl>
            <Lbl>{bot.exchange}</Lbl>
            <Lbl color={C.textDim}>·</Lbl>
            <Lbl>{bot.pairs.join(", ")}</Lbl>
          </div>
        </div>
        <button onClick={onClose} style={{ background:"transparent", border:"none",
          color:C.textMuted, cursor:"pointer", fontFamily:mono, fontSize:20, lineHeight:1, padding:4 }}>×</button>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}` }}>
        {tabs.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            flex:1, padding:"10px 0", background:"transparent",
            border:"none", borderBottom:`2px solid ${tab===t?C.green:"transparent"}`,
            fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
            color:tab===t?C.green:C.textMuted, cursor:"pointer", fontWeight:tab===t?700:500,
          }}>{t}</button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"18px 20px" }}>

        {/* OVERVIEW TAB */}
        {tab==="overview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* P&L headline */}
            <div style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:4, padding:"16px 18px" }}>
              <Lbl>Total P&L</Lbl>
              <M size={28} color={isUp?C.green:C.red} weight={700} style={{ display:"block", marginTop:6, lineHeight:1 }}>
                {fmt.usd(bot.pnlTotal)}
              </M>
              <M size={12} color={isUp?C.green:C.red} style={{ display:"block", marginTop:4 }}>
                {fmt.pct(bot.pnlPct)} since {bot.startedAt}
              </M>
            </div>

            {/* Stats grid */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"14px 0",
              background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:4, padding:"16px 18px" }}>
              <StatCell label="Today's P&L"   value={fmt.usd(bot.pnlToday)} color={bot.pnlToday>=0?C.green:C.red} />
              <StatCell label="Capital"        value={fmt.abs(bot.capital)} />
              <StatCell label="Open Positions" value={String(bot.openPositions)} />
              <StatCell label="Win Rate"       value={bot.winRate?bot.winRate.toFixed(1)+"%":"—"} color={C.green} />
              <StatCell label="Total Trades"   value={fmt.num(bot.totalTrades)} />
              <StatCell label="Sharpe"         value={bot.sharpe?.toFixed(2)??"—"} color={C.green} />
              <StatCell label="Drawdown Now"   value={bot.drawdown?bot.drawdown.toFixed(1)+"%":"0%"} color={bot.drawdown>5?C.amber:C.textPri} />
              <StatCell label="Max Drawdown"   value={bot.maxDrawdown?bot.maxDrawdown.toFixed(1)+"%":"—"} color={C.textMuted} />
              <StatCell label="Heartbeat"      value={bot.heartbeat} color={C.textMid} />
            </div>

            {/* Equity curve */}
            {eq.length > 1 && (
              <SectionCard title="Equity Curve">
                <div style={{ padding:"12px 0 8px" }}>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={eqData} margin={{ top:4, right:8, bottom:0, left:8 }}>
                      <defs>
                        <linearGradient id="detailGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={isUp?C.green:C.red} stopOpacity={0.25}/>
                          <stop offset="100%" stopColor={isUp?C.green:C.red} stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <YAxis domain={["auto","auto"]} hide />
                      <Tooltip content={<ChartTooltip />} formatter={(v)=>[fmt.abs(v),"Equity"]} />
                      <Area type="monotone" dataKey="v" stroke={isUp?C.green:C.red} strokeWidth={1.5}
                        fill="url(#detailGrad)" dot={false}
                        activeDot={{ r:3, fill:isUp?C.green:C.red, stroke:C.surface, strokeWidth:2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}

            {/* Error box */}
            {bot.status==="error" && (
              <div style={{ background:C.redDim, border:`1px solid ${C.red}35`,
                borderLeft:`3px solid ${C.red}`, borderRadius:4, padding:"12px 16px" }}>
                <M size={11} color={C.red} weight={700} style={{ display:"block", marginBottom:4 }}>Bot Error</M>
                <M size={10} color={C.textMuted}>{bot.errorMsg}</M>
              </div>
            )}

            {/* Controls */}
            <div>
              <Lbl style={{ display:"block", marginBottom:10 }}>Controls</Lbl>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {bot.status==="running" && <GhostBtn>⏸ Pause</GhostBtn>}
                {bot.status==="paused"  && <PrimaryBtn>▶ Resume</PrimaryBtn>}
                {bot.status==="error"   && <PrimaryBtn>⟳ Reconnect</PrimaryBtn>}
                <GhostBtn danger>⏹ Close All &amp; Stop</GhostBtn>
                <GhostBtn small>↗ Full View</GhostBtn>
              </div>
            </div>
          </div>
        )}

        {/* TRADES TAB */}
        {tab==="trades" && (
          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
            <div style={{ display:"grid", gridTemplateColumns:"80px 50px 90px 90px 80px 70px",
              padding:"8px 0", gap:0, borderBottom:`1px solid ${C.border}` }}>
              {["Pair","Side","Entry","Exit","P&L","Duration"].map(h=><Lbl key={h}>{h}</Lbl>)}
            </div>
            {BOT_TRADES.map((t,i)=>{
              const isUp=t.pnl>=0;
              return (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"80px 50px 90px 90px 80px 70px",
                  padding:"10px 0", gap:0, borderBottom:`1px solid ${C.borderSub}`,
                  background:i%2===0?"transparent":C.surfaceAlt+"50" }}>
                  <div>
                    <M size={11} weight={600}>{t.pair}</M>
                    <M size={9} color={C.textDim} style={{ display:"block", marginTop:1 }}>{t.date}</M>
                  </div>
                  <Badge color={t.side==="BUY"?C.green:C.red}>{t.side}</Badge>
                  <M size={11} color={C.textMid}>${t.entry.toLocaleString()}</M>
                  <M size={11} color={t.status==="open"?C.textMuted:C.textPri}>
                    {t.status==="open"?"open":("$"+t.exit.toLocaleString())}
                  </M>
                  <M size={11} color={isUp?C.green:C.red} weight={700}>{fmt.usd(t.pnl)}</M>
                  <M size={10} color={C.textMuted}>{t.duration}</M>
                </div>
              );
            })}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab==="settings" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Lbl style={{ display:"block", marginBottom:4 }}>Strategy Configuration</Lbl>
            <div style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:4, padding:"4px 16px" }}>
              {Object.entries(bot.config).map(([k,v],i,arr)=>(
                <div key={k}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0" }}>
                    <Lbl>{k.replace(/([A-Z])/g," $1").trim()}</Lbl>
                    <M size={12} color={C.textPri} weight={600}>{String(v)}</M>
                  </div>
                  {i<arr.length-1&&<Divider />}
                </div>
              ))}
            </div>
            <div style={{ marginTop:8 }}>
              <PrimaryBtn>Edit Configuration</PrimaryBtn>
            </div>
            <Divider my={8} />
            <Lbl style={{ display:"block", marginBottom:8 }}>Danger Zone</Lbl>
            <GhostBtn danger>Delete Bot</GhostBtn>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGY DETAIL PANEL
// ═══════════════════════════════════════════════════════════════════════════════

function StrategyDetailPanel({ strat, onClose, onDeploy }) {
  const eqData = strat.equityCurve.map((v,i)=>({ i, v }));
  const monthLabels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthData = strat.monthlyReturns.map((v,i)=>({ m:monthLabels[i], v }));

  return (
    <div style={{
      position:"fixed", top:0, right:0, bottom:0, width:560,
      background:C.surface, borderLeft:`1px solid ${C.border}`,
      zIndex:200, display:"flex", flexDirection:"column",
      animation:"slideIn 0.22s ease",
    }}>
      {/* Header */}
      <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <div style={{ width:3, height:18, borderRadius:1, background:strat.accentColor }} />
            <M size={14} weight={700} style={{ letterSpacing:"0.04em" }}>{strat.name}</M>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <Badge color={strat.accentColor}>{strat.typeLabel}</Badge>
            {strat.isCore && <Badge color={C.textMid}>CORE</Badge>}
            {strat.tierLocked && <Badge color={C.amber}>EON+</Badge>}
            <RiskBar level={strat.risk} />
          </div>
        </div>
        <button onClick={onClose} style={{ background:"transparent", border:"none",
          color:C.textMuted, cursor:"pointer", fontFamily:mono, fontSize:20, lineHeight:1, padding:4 }}>×</button>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"18px 20px" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

          {/* Description */}
          <div>
            <Lbl style={{ display:"block", marginBottom:8 }}>Overview</Lbl>
            <M size={11} color={C.textMid} style={{ lineHeight:1.7, display:"block" }}>{strat.description}</M>
          </div>

          {/* How it works */}
          <div style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`,
            borderLeft:`3px solid ${strat.accentColor}50`, borderRadius:4, padding:"12px 16px" }}>
            <Lbl style={{ display:"block", marginBottom:6 }}>How It Works</Lbl>
            <M size={10} color={C.textMuted} style={{ lineHeight:1.7, display:"block" }}>{strat.howItWorks}</M>
          </div>

          {/* Performance stats */}
          <SectionCard title="Backtest Performance">
            <div style={{ padding:"14px 18px" }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:12 }}>
                <M size={26} color={C.green} weight={700}>{fmt.pct(strat.backtestReturn)}</M>
                <M size={10} color={C.textMuted}>return · {strat.backtestPeriod}</M>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px 0" }}>
                <StatCell label="Win Rate"   value={strat.perf.winRate.toFixed(1)+"%"} color={C.green} />
                <StatCell label="Avg Return" value={fmt.pct(strat.perf.avgReturn)}     color={C.green} />
                <StatCell label="Max DD"     value={fmt.pct(-strat.perf.maxDrawdown)}  color={C.red}   />
                <StatCell label="Sharpe"     value={strat.perf.sharpe.toFixed(2)}      color={C.textPri} />
                <StatCell label="Calmar"     value={strat.perf.calmar.toFixed(1)}      color={C.textPri} />
                <StatCell label="Trades"     value={fmt.num(strat.perf.totalTrades)}   />
              </div>
            </div>
          </SectionCard>

          {/* Equity curve */}
          <SectionCard title="Equity Growth (Backtest)">
            <div style={{ padding:"12px 0 8px" }}>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={eqData} margin={{ top:4, right:8, bottom:0, left:8 }}>
                  <defs>
                    <linearGradient id={`sg${strat.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={strat.accentColor} stopOpacity={0.25}/>
                      <stop offset="100%" stopColor={strat.accentColor} stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <YAxis domain={[95,"auto"]} hide />
                  <Tooltip content={<ChartTooltip />} formatter={v=>["$"+v.toLocaleString(),"Portfolio"]} />
                  <Area type="monotone" dataKey="v" stroke={strat.accentColor} strokeWidth={1.5}
                    fill={`url(#sg${strat.id})`} dot={false}
                    activeDot={{ r:3, fill:strat.accentColor, stroke:C.surface, strokeWidth:2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Monthly returns heatmap */}
          <SectionCard title="Monthly Returns — 2025">
            <div style={{ padding:"14px 18px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:4 }}>
                {monthData.map(m=>(
                  <div key={m.m} style={{ background:m.v>0?C.green+"20":C.red+"20",
                    border:`1px solid ${m.v>0?C.green+"30":C.red+"30"}`, borderRadius:3, padding:"6px 4px",
                    textAlign:"center" }}>
                    <Lbl style={{ display:"block", marginBottom:3 }}>{m.m}</Lbl>
                    <M size={10} color={m.v>=0?C.green:C.red} weight={700}>{fmt.pct(m.v)}</M>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* Meta */}
          <div style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:4, padding:"4px 16px" }}>
            {[
              { label:"Timeframe",    value:strat.timeframe },
              { label:"Min Capital",  value:fmt.abs(strat.minCapital) },
              { label:"Min Tier",     value:strat.minTier.replace("stella_","").toUpperCase() },
              { label:"Exchanges",    value:strat.exchanges.join(", ") },
              { label:"Pairs",        value:strat.pairs.join(", ") },
              { label:"Bots Running", value:String(strat.botsRunning) },
            ].map(({label,value},i,arr)=>(
              <div key={label}>
                <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0" }}>
                  <Lbl>{label}</Lbl>
                  <M size={11} color={C.textPri} weight={600}>{value}</M>
                </div>
                {i<arr.length-1&&<Divider />}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ display:"flex", gap:8 }}>
            <PrimaryBtn onClick={onDeploy} disabled={strat.tierLocked} icon="▶">
              {strat.tierLocked?"Requires Eon+":"Deploy Bot with This Strategy"}
            </PrimaryBtn>
            <GhostBtn small>Run Backtest</GhostBtn>
          </div>
          {strat.tierLocked && (
            <div style={{ background:C.amberDim, border:`1px solid ${C.amber}35`,
              borderRadius:3, padding:"9px 14px" }}>
              <M size={10} color={C.amber}>This strategy requires Stella Eon or higher. Upgrade to unlock multi-exchange arbitrage execution.</M>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function BotsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedBot, setSelectedBot] = useState(null);
  const [botStates, setBotStates] = useState(
    Object.fromEntries(BOTS.map(b=>[b.id, b.status]))
  );

  const toggleBot = (id, e) => {
    e.stopPropagation();
    setBotStates(s=>({ ...s, [id]:s[id]==="running"?"paused":s[id]==="paused"?"running":s[id] }));
  };

  const filtered = BOTS.filter(b=>{
    const st = botStates[b.id];
    if (statusFilter!=="all" && st!==statusFilter) return false;
    if (exchangeFilter!=="all" && b.exchange!==exchangeFilter) return false;
    if (search && !b.name.toLowerCase().includes(search.toLowerCase()) &&
        !b.pair.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const running = BOTS.filter(b=>botStates[b.id]==="running").length;
  const paused  = BOTS.filter(b=>botStates[b.id]==="paused").length;
  const errors  = BOTS.filter(b=>botStates[b.id]==="error").length;
  const totalPnl= BOTS.reduce((s,b)=>s+b.pnlToday,0);

  return (
    <div>
      {/* Page header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>My Bots</M>
          <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>
            {BOTS.length} bots configured · {running} running
          </M>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <GhostBtn danger small>⏹ Stop All</GhostBtn>
          <PrimaryBtn icon="+" small>New Bot</PrimaryBtn>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:18 }}>
        {[
          { label:"Total Bots",   value:String(BOTS.length),        color:C.textPri },
          { label:"Running",      value:String(running),             color:C.green   },
          { label:"Paused",       value:String(paused),              color:C.amber   },
          { label:"Errors",       value:String(errors),              color:errors?C.red:C.textMuted },
          { label:"Today's P&L",  value:fmt.usd(totalPnl),          color:totalPnl>=0?C.green:C.red },
        ].map(s=>(
          <div key={s.label} style={{ background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:4, padding:"12px 16px" }}>
            <Lbl>{s.label}</Lbl>
            <M size={18} color={s.color} weight={700} style={{ display:"block", marginTop:6, lineHeight:1 }}>{s.value}</M>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        {/* Status pills */}
        <div style={{ display:"flex", gap:4 }}>
          {[
            { key:"all",     label:"All",     count:BOTS.length },
            { key:"running", label:"Running", count:running, color:C.green },
            { key:"paused",  label:"Paused",  count:paused,  color:C.amber },
            { key:"error",   label:"Error",   count:errors,  color:C.red   },
          ].map(f=>(
            <button key={f.key} onClick={()=>setStatusFilter(f.key)} style={{
              background:statusFilter===f.key?(f.color||C.green)+"18":"transparent",
              border:`1px solid ${statusFilter===f.key?(f.color||C.green)+"40":C.border}`,
              borderRadius:3, padding:"5px 12px",
              fontFamily:mono, fontSize:9, letterSpacing:"0.1em",
              color:statusFilter===f.key?(f.color||C.green):C.textMuted,
              cursor:"pointer", fontWeight:statusFilter===f.key?700:500,
              display:"flex", alignItems:"center", gap:5,
            }}>
              {f.label}
              <span style={{ background:statusFilter===f.key?(f.color||C.green)+"30":C.border,
                color:statusFilter===f.key?(f.color||C.green):C.textMuted,
                borderRadius:8, padding:"0 5px", fontFamily:mono, fontSize:8 }}>{f.count}</span>
            </button>
          ))}
        </div>

        <div style={{ width:1, height:20, background:C.border }} />

        {/* Exchange filter */}
        {["all","Binance","Alpaca"].map(ex=>(
          <button key={ex} onClick={()=>setExchangeFilter(ex)} style={{
            background:exchangeFilter===ex?C.greenDim:"transparent",
            border:`1px solid ${exchangeFilter===ex?C.greenMid:C.border}`,
            borderRadius:3, padding:"5px 12px", fontFamily:mono, fontSize:9,
            letterSpacing:"0.1em", color:exchangeFilter===ex?C.green:C.textMuted,
            cursor:"pointer", fontWeight:exchangeFilter===ex?700:500,
          }}>{ex==="all"?"All Exchanges":ex}</button>
        ))}

        {/* Search */}
        <div style={{ marginLeft:"auto", position:"relative" }}>
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)",
            color:C.textDim, fontFamily:mono, fontSize:11, pointerEvents:"none" }}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search bots..."
            style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:3,
              padding:"6px 12px 6px 28px", fontFamily:mono, fontSize:10, color:C.textPri,
              outline:"none", width:180 }} />
        </div>
      </div>

      {/* Bots table */}
      <SectionCard>
        {/* Table header */}
        <div style={{ display:"grid",
          gridTemplateColumns:"220px 160px 100px 80px 90px 100px 110px 80px 110px",
          padding:"9px 18px", gap:0 }}>
          {["Bot","Strategy","Exchange","Capital","Positions","Today P&L","Total P&L","Win Rate",""].map(h=>(
            <Lbl key={h}>{h}</Lbl>
          ))}
        </div>
        <Divider />

        {filtered.length===0 ? (
          <div style={{ padding:"40px 18px", textAlign:"center" }}>
            <M size={11} color={C.textMuted}>No bots match your filters</M>
          </div>
        ) : filtered.map((bot,i)=>{
          const st = botStates[bot.id];
          const meta = statusMeta[st];
          const canToggle = st==="running"||st==="paused";
          return (
            <div key={bot.id}>
              <div
                onClick={()=>setSelectedBot(bot)}
                style={{ display:"grid",
                  gridTemplateColumns:"220px 160px 100px 80px 90px 100px 110px 80px 110px",
                  padding:"12px 18px", gap:0, alignItems:"center",
                  background:i%2===0?"transparent":C.surfaceAlt+"60",
                  cursor:"pointer", transition:"background 0.1s",
                }}
                onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHov}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":C.surfaceAlt+"60"}
              >
                {/* Name + status */}
                <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
                  <StatusDot status={st} />
                  <div style={{ minWidth:0 }}>
                    <M size={11} weight={700} style={{ display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {bot.name}
                    </M>
                    <M size={9} color={C.textDim} style={{ display:"block", marginTop:1 }}>
                      {bot.pairs.join(" · ")} · Since {bot.startedAt}
                    </M>
                  </div>
                </div>

                <M size={10} color={C.textMuted}>{bot.strategy}</M>
                <M size={10} color={C.textMid}>{bot.exchange}</M>
                <M size={11} color={C.textPri} weight={600}>{fmt.abs(bot.capital)}</M>
                <M size={11} color={C.textMid}>{String(bot.openPositions)}</M>

                <M size={11} color={bot.pnlToday>=0?C.green:C.red} weight={700}>
                  {bot.pnlToday!==0?fmt.usd(bot.pnlToday):"—"}
                </M>
                <div>
                  <M size={11} color={bot.pnlTotal>=0?C.green:C.red} weight={700} style={{ display:"block" }}>
                    {bot.pnlTotal!==0?fmt.usd(bot.pnlTotal):"—"}
                  </M>
                  <M size={9} color={bot.pnlTotal>=0?C.green:C.red} style={{ display:"block", marginTop:1 }}>
                    {bot.pnlTotal!==0?fmt.pct(bot.pnlPct):""}
                  </M>
                </div>

                <M size={11} color={bot.winRate?(bot.winRate>60?C.green:C.textPri):C.textDim}>
                  {bot.winRate?bot.winRate.toFixed(1)+"%":"—"}
                </M>

                {/* Actions */}
                <div style={{ display:"flex", gap:5 }} onClick={e=>e.stopPropagation()}>
                  {canToggle && (
                    <button onClick={e=>toggleBot(bot.id,e)} style={{
                      background:st==="running"?C.amberDim:C.greenDim,
                      border:`1px solid ${st==="running"?C.amber+"35":C.greenMid}`,
                      borderRadius:3, padding:"4px 8px", fontFamily:mono, fontSize:8,
                      letterSpacing:"0.1em", color:st==="running"?C.amber:C.green,
                      cursor:"pointer", fontWeight:700,
                    }}>{st==="running"?"⏸":"▶"}</button>
                  )}
                  {st==="error" && (
                    <badge color={C.red} style={{ padding:"4px 8px", background:C.redDim,
                      border:`1px solid ${C.red}35`, borderRadius:3, fontFamily:mono,
                      fontSize:8, color:C.red, letterSpacing:"0.1em", fontWeight:700 }}>ERR</badge>
                  )}
                  <button onClick={()=>setSelectedBot(bot)} style={{
                    background:"transparent", border:`1px solid ${C.border}`,
                    borderRadius:3, padding:"4px 8px", fontFamily:mono, fontSize:8,
                    letterSpacing:"0.08em", color:C.textMuted, cursor:"pointer",
                  }}>DETAIL</button>
                </div>
              </div>
              {i<filtered.length-1&&<Divider />}
            </div>
          );
        })}
      </SectionCard>

      {/* Bot detail panel */}
      {selectedBot && (
        <>
          <div onClick={()=>setSelectedBot(null)} style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:199 }} />
          <BotDetailPanel bot={selectedBot} onClose={()=>setSelectedBot(null)} />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGIES PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function StrategiesPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedStrat, setSelectedStrat] = useState(null);

  const types = [
    { key:"all",               label:"All" },
    { key:"core_momentum",     label:"Momentum"      },
    { key:"core_mean_reversion",label:"Mean Reversion"},
    { key:"core_trend_following",label:"Trend"        },
    { key:"core_dca",          label:"DCA"           },
    { key:"core_arbitrage",    label:"Arbitrage"     },
  ];
  const risks = ["all","conservative","moderate","aggressive"];

  const filtered = STRATEGIES.filter(s=>{
    if (typeFilter!=="all" && s.type!==typeFilter) return false;
    if (riskFilter!=="all" && s.risk!==riskFilter) return false;
    return true;
  });

  const totalRunning = STRATEGIES.reduce((n,s)=>n+s.botsRunning,0);

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>Strategies</M>
          <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>
            {STRATEGIES.length} core strategies · {totalRunning} active bots running
          </M>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        {[
          { label:"Core Strategies",  value:String(STRATEGIES.filter(s=>s.isCore).length) },
          { label:"Active Bots",      value:String(totalRunning), color:C.green },
          { label:"Best Win Rate",    value:Math.max(...STRATEGIES.map(s=>s.perf.winRate)).toFixed(1)+"%", color:C.green },
          { label:"Best Sharpe",      value:Math.max(...STRATEGIES.map(s=>s.perf.sharpe)).toFixed(2),     color:C.green },
        ].map(s=>(
          <div key={s.label} style={{ background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:4, padding:"12px 16px" }}>
            <Lbl>{s.label}</Lbl>
            <M size={18} color={s.color||C.textPri} weight={700} style={{ display:"block", marginTop:6, lineHeight:1 }}>{s.value}</M>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {/* Type */}
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {types.map(t=>(
            <button key={t.key} onClick={()=>setTypeFilter(t.key)} style={{
              background:typeFilter===t.key?C.greenDim:"transparent",
              border:`1px solid ${typeFilter===t.key?C.greenMid:C.border}`,
              borderRadius:3, padding:"5px 12px", fontFamily:mono, fontSize:9,
              letterSpacing:"0.1em", color:typeFilter===t.key?C.green:C.textMuted,
              cursor:"pointer", fontWeight:typeFilter===t.key?700:500,
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ width:1, height:20, background:C.border }} />

        {/* Risk */}
        {risks.map(r=>{
          const col={ all:C.textMuted, conservative:C.green, moderate:C.amber, aggressive:C.red }[r];
          return (
            <button key={r} onClick={()=>setRiskFilter(r)} style={{
              background:riskFilter===r?col+"18":"transparent",
              border:`1px solid ${riskFilter===r?col+"40":C.border}`,
              borderRadius:3, padding:"5px 12px", fontFamily:mono, fontSize:9,
              letterSpacing:"0.1em", color:riskFilter===r?col:C.textMuted,
              cursor:"pointer", fontWeight:riskFilter===r?700:500, textTransform:"capitalize",
            }}>{r==="all"?"All Risk":r}</button>
          );
        })}
      </div>

      {/* Strategy cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px,1fr))", gap:14 }}>
        {filtered.map(strat=>(
          <StrategyCard
            key={strat.id} strat={strat}
            onClick={()=>setSelectedStrat(strat)}
          />
        ))}
      </div>

      {/* Strategy detail panel */}
      {selectedStrat && (
        <>
          <div onClick={()=>setSelectedStrat(null)} style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:199 }} />
          <StrategyDetailPanel
            strat={selectedStrat}
            onClose={()=>setSelectedStrat(null)}
            onDeploy={()=>setSelectedStrat(null)}
          />
        </>
      )}
    </div>
  );
}

function StrategyCard({ strat, onClick }) {
  const eq = strat.equityCurve;
  const isUp = strat.backtestReturn >= 0;
  const sparkColor = strat.accentColor;
  const riskColor  = { conservative:C.green, moderate:C.amber, aggressive:C.red }[strat.risk];

  return (
    <div
      onClick={onClick}
      style={{ background:C.surface, border:`1px solid ${C.border}`,
        borderTop:`2px solid ${strat.accentColor}`,
        borderRadius:4, overflow:"hidden", cursor:"pointer",
        transition:"border-color 0.15s, transform 0.15s",
        display:"flex", flexDirection:"column",
      }}
      onMouseEnter={e=>{ e.currentTarget.style.borderColor=strat.accentColor; e.currentTarget.style.transform="translateY(-1px)"; }}
      onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform="none";
        e.currentTarget.style.borderTopColor=strat.accentColor; }}
    >
      {/* Card header */}
      <div style={{ padding:"14px 16px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
              <Badge color={strat.accentColor}>{strat.typeLabel}</Badge>
              {strat.isCore && <Badge color={C.textMid}>CORE</Badge>}
              {strat.tierLocked && <Badge color={C.amber}>EON+</Badge>}
            </div>
            <M size={12} weight={700} style={{ display:"block", letterSpacing:"0.03em" }}>{strat.name}</M>
          </div>
          <div style={{ textAlign:"right" }}>
            <M size={18} color={C.green} weight={700} style={{ display:"block", lineHeight:1 }}>
              {fmt.pct(strat.backtestReturn)}
            </M>
            <M size={9} color={C.textMuted} style={{ display:"block", marginTop:2 }}>backtest return</M>
          </div>
        </div>
        <M size={10} color={C.textMuted} style={{ lineHeight:1.6, display:"block" }}>
          {strat.description.slice(0,120)}…
        </M>
      </div>

      {/* Sparkline strip */}
      <div style={{ height:44, background:C.surfaceAlt, borderTop:`1px solid ${C.borderSub}`,
        borderBottom:`1px solid ${C.borderSub}` }}>
        <Sparkline data={eq} color={sparkColor} height={44} />
      </div>

      {/* Stats */}
      <div style={{ padding:"12px 16px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0", marginBottom:12 }}>
          {[
            { label:"Win Rate", value:strat.perf.winRate.toFixed(1)+"%", color:strat.perf.winRate>60?C.green:C.amber },
            { label:"Max DD",   value:strat.perf.maxDrawdown.toFixed(1)+"%", color:C.red },
            { label:"Sharpe",   value:strat.perf.sharpe.toFixed(2) },
            { label:"Trades",   value:fmt.num(strat.perf.totalTrades) },
          ].map((s,i)=>(
            <div key={s.label} style={{ paddingRight:i<3?12:0, borderRight:i<3?`1px solid ${C.borderSub}`:"none",
              paddingLeft:i>0?12:0 }}>
              <Lbl>{s.label}</Lbl>
              <M size={12} color={s.color||C.textPri} weight={700} style={{ display:"block", marginTop:3 }}>{s.value}</M>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop:`1px solid ${C.borderSub}`, paddingTop:10,
          display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <RiskBar level={strat.risk} />
            <Lbl>{strat.timeframe} · {strat.minCapital>=1000?strat.minCapital/1000+"k":"$"+strat.minCapital} min</Lbl>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {strat.botsRunning > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <StatusDot status="running" />
                <M size={9} color={C.textMuted}>{strat.botsRunning} bot{strat.botsRunning!==1?"s":""}</M>
              </div>
            )}
            <button onClick={e=>{ e.stopPropagation(); onClick(); }} style={{
              background:strat.tierLocked?C.amberDim:C.greenDim,
              border:`1px solid ${strat.tierLocked?C.amber+"35":C.greenMid}`,
              borderRadius:3, padding:"5px 12px", fontFamily:mono, fontSize:9,
              letterSpacing:"0.1em", color:strat.tierLocked?C.amber:C.green,
              fontWeight:700, cursor:"pointer",
            }}>{strat.tierLocked?"EON+ →":"DEPLOY →"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR (minimal, same tokens as dashboard)
// ═══════════════════════════════════════════════════════════════════════════════

const NAV = [
  { key:"dashboard",  label:"Dashboard",  icon:"▦" },
  { key:"bots",       label:"My Bots",    icon:"⟳", badge:5 },
  { key:"strategies", label:"Strategies", icon:"◈" },
  { key:"positions",  label:"Positions",  icon:"⊞", badge:3 },
  { key:"analytics",  label:"Analytics",  icon:"∿" },
  { key:"capital",    label:"Capital",    icon:"◎" },
  { key:"risk",       label:"Risk",       icon:"⚡" },
];

function Sidebar({ active, setActive }) {
  return (
    <div style={{ width:200, minHeight:"100vh", background:C.sidebar,
      borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column",
      flexShrink:0, position:"sticky", top:0 }}>
      <div style={{ height:52, display:"flex", alignItems:"center", padding:"0 16px",
        borderBottom:`1px solid ${C.border}`, gap:10 }}>
        <div style={{ width:24, height:24, borderRadius:"50%", flexShrink:0,
          background:`linear-gradient(135deg,${C.green},#00B87A)`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:12, fontWeight:800, color:"#0A0D14", fontFamily:mono }}>S</div>
        <M size={13} weight={700} style={{ letterSpacing:"0.14em" }}>STELLA</M>
      </div>
      <nav style={{ flex:1, padding:"10px 0" }}>
        {NAV.map(item=>{
          const isActive=active===item.key;
          return (
            <button key={item.key} onClick={()=>setActive(item.key)} style={{
              width:"100%", display:"flex", alignItems:"center", gap:10,
              padding:"10px 16px", background:isActive?`${C.green}10`:"transparent",
              border:"none", borderLeft:`2px solid ${isActive?C.green:"transparent"}`,
              cursor:"pointer", transition:"all 0.15s",
            }}>
              <span style={{ fontSize:13, color:isActive?C.green:C.textMuted, fontFamily:mono }}>{item.icon}</span>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flex:1 }}>
                <M size={11} color={isActive?C.green:C.textMid} weight={isActive?700:500}>{item.label}</M>
                {item.badge && (
                  <span style={{ background:isActive?C.green:C.border, color:isActive?"#0A0D14":C.textMuted,
                    borderRadius:10, padding:"1px 6px", fontFamily:mono, fontSize:9, fontWeight:700 }}>
                    {item.badge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        <Divider my={10} />
        {[{key:"billing",label:"Billing",icon:"⊛"},{key:"account",label:"Account",icon:"⊙"},{key:"help",label:"Help",icon:"?"}].map(item=>(
          <button key={item.key} onClick={()=>setActive(item.key)} style={{
            width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 16px",
            background:"transparent", border:"none", borderLeft:"2px solid transparent",
            cursor:"pointer" }}>
            <span style={{ fontSize:12, color:C.textDim, fontFamily:mono }}>{item.icon}</span>
            <M size={11} color={C.textMuted}>{item.label}</M>
          </button>
        ))}
      </nav>
      <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}` }}>
        <div style={{ background:C.greenDim, border:`1px solid ${C.greenMid}`, borderRadius:3, padding:"8px 10px" }}>
          <Lbl style={{ display:"block", marginBottom:3 }}>Stella Unum</Lbl>
          <M size={9} color={C.textMuted}>3 of 3 bots active</M>
        </div>
      </div>
    </div>
  );
}

function Topbar({ page }) {
  return (
    <div style={{ height:52, display:"flex", alignItems:"center", padding:"0 24px", gap:16,
      background:C.sidebar, borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
        <Lbl>Portal</Lbl>
        <M color={C.textDim}>/</M>
        <M size={11} color={C.textPri} weight={600}>{page==="bots"?"My Bots":"Strategies"}</M>
      </div>
      <div style={{ width:8, height:8, borderRadius:"50%", background:C.amber }} />
      <M size={9} color={C.amber} weight={700} caps style={{ letterSpacing:"0.1em" }}>KYC Under Review</M>
      <div style={{ width:30, height:30, borderRadius:"50%", background:`${C.green}25`,
        border:`1px solid ${C.green}40`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
        <M size={11} color={C.green} weight={700}>JD</M>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════

export default function StellaBotsStrategies() {
  const [page, setPage] = useState("bots");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:${C.bg}; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:${C.surface}; }
        ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:2px; }
        ::-webkit-scrollbar-thumb:hover { background:${C.textDim}; }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.6;} 50%{transform:scale(1.7);opacity:0;} }
        @keyframes slideIn { from{transform:translateX(30px);opacity:0;} to{transform:none;opacity:1;} }
        button:focus { outline:none; }
        input:focus { outline:none; }
      `}</style>

      <div style={{ display:"flex", minHeight:"100vh", background:C.bg }}>
        <Sidebar active={page} setActive={setPage} />
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
          <Topbar page={page} />

          {/* Page toggle strip */}
          <div style={{ background:C.sidebar, borderBottom:`1px solid ${C.border}`,
            padding:"0 24px", display:"flex", gap:0 }}>
            {[
              { key:"bots",       label:"My Bots",    count:BOTS.length       },
              { key:"strategies", label:"Strategies", count:STRATEGIES.length },
            ].map(p=>(
              <button key={p.key} onClick={()=>setPage(p.key)} style={{
                padding:"10px 20px", background:"transparent", border:"none",
                borderBottom:`2px solid ${page===p.key?C.green:"transparent"}`,
                fontFamily:mono, fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase",
                color:page===p.key?C.green:C.textMuted, cursor:"pointer",
                fontWeight:page===p.key?700:500, display:"flex", alignItems:"center", gap:7,
              }}>
                {p.label}
                <span style={{ background:page===p.key?C.greenDim:C.border,
                  border:`1px solid ${page===p.key?C.greenMid:C.border}`,
                  color:page===p.key?C.green:C.textMuted,
                  borderRadius:8, padding:"0 6px", fontSize:9, fontWeight:700 }}>{p.count}</span>
              </button>
            ))}
          </div>

          <div style={{ flex:1, padding:"20px 24px", overflowY:"auto" }}>
            {page==="bots"       && <BotsPage />}
            {page==="strategies" && <StrategiesPage />}
          </div>
        </div>
      </div>
    </>
  );
}
