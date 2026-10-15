"use client";

import { useState } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis, BarChart, Bar, CartesianGrid, ReferenceLine } from "recharts";

// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
// DESIGN TOKENS
// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
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
  textMid:    "#A0AAC0",
  textMuted:  "#8B95B0",
  textDim:    "#6A7590",
};
const mono = "'JetBrains Mono', 'Fira Code', monospace";

// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
// MOCK DATA
// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP

const STRATEGIES = [
  {
    id:"strat-1",
    name:"Core Impulse Momentum",
    type:"core_momentum",
    typeLabel:"Momentum",
    accentColor: C.green,
    description:"Uses physics-based trajectory analysis to detect high-impulse price movements. Enters on strong directional signals with high confidence, exits at predicted peak using kinetic energy dissipation model.",
    howItWorks:"The engine models each candle as a projectile: initial velocity (v0), acceleration, and trajectory angle determine signal strength. Trades fire only when r2 > 0.82 and confidence > 72%.",
    risk:"moderate",
    timeframe:"5m",
    minCapital:500,
    minTier:"stella_one",
    exchanges:["Binance","Alpaca","Hyperliquid"],
    pairs:["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT"],
    perf:{ winRate:64.2, avgReturn:1.8, maxDrawdown:8.4, sharpe:1.84, totalTrades:6248, calmar:2.1 },
    backtestReturn:+38.4,
    backtestPeriod:"Jan-Dec 2025",
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
    howItWorks:"Grid levels are set at fixed % intervals from the 20-period EMA. Position sizing scales with distance from mean - wider grids get smaller positions to manage drawdown during trending moves.",
    risk:"conservative",
    timeframe:"15m",
    minCapital:1000,
    minTier:"stella_one",
    exchanges:["Binance","Hyperliquid"],
    pairs:["ETH/USDT","BNB/USDT","XRP/USDT"],
    perf:{ winRate:58.4, avgReturn:1.1, maxDrawdown:11.2, sharpe:1.21, totalTrades:4120, calmar:1.4 },
    backtestReturn:+22.8,
    backtestPeriod:"Jan-Dec 2025",
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
    howItWorks:"Entry triggers when 9-EMA crosses 21-EMA on 1H with volume > 1.4x 20-period average. Exit via trailing stop set at 1.5x ATR, or RSI(14) > 75 for longs.",
    risk:"moderate",
    timeframe:"1h",
    minCapital:2000,
    minTier:"stella_unum",
    exchanges:["Binance","Alpaca"],
    pairs:["BTC/USDT","ETH/USDT","SOL/USDT"],
    perf:{ winRate:52.1, avgReturn:2.8, maxDrawdown:14.6, sharpe:1.42, totalTrades:1890, calmar:1.8 },
    backtestReturn:+31.2,
    backtestPeriod:"Jan-Dec 2025",
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
    backtestPeriod:"Jan-Dec 2025",
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
    backtestPeriod:"Jan-Dec 2025",
    monthlyReturns:[+1.2,+1.4,+1.3,+1.5,+1.6,+1.4,+1.8,+1.5,+1.6,+1.7,+1.4,+1.6],
    equityCurve:[100,101,103,104,106,107,109,111,112,114,115,117,118],
    botsRunning:0,
    isCore:true,
    tags:["arbitrage","low-risk","high-freq"],
    tierLocked:true,
  },
];

// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
// SHARED PRIMITIVES
// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP

const fmt = {
  usd:  (v: number) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  abs:  (v: number) => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 }),
  pct:  (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%",
  num:  (v?: number) => v?.toLocaleString() ?? "",
};

function M({ size=11, color=C.textPri, weight=500, caps=false, dim=false, style={}, children }: any) {
  return <span style={{ fontFamily:mono, fontSize:size, color:dim?C.textMuted:color, fontWeight:weight,
    letterSpacing:caps?"0.11em":"0.03em", textTransform:caps?"uppercase":"none" as any, ...style }}>{children}</span>;
}
function Lbl({ children, color=C.textMuted, style={} }: any) {
  return <M size={9} color={color} weight={600} caps style={{ letterSpacing:"0.13em", ...style }}>{children}</M>;
}
function Divider({ my=0 }) {
  return <div style={{ height:1, background:C.borderSub, margin:`${my}px 0` }} />;
}
function Badge({ children, color=C.green, dot=false }: any) {
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

function StatusDot({ status }: any) {
  const m = statusMeta[status as keyof typeof statusMeta]||statusMeta.stopped;
  return (
    <span style={{ position:"relative", display:"inline-flex", width:8, height:8, alignItems:"center", justifyContent:"center" }}>
      {m.pulse && <span style={{ position:"absolute", width:14, height:14, borderRadius:"50%",
        background:m.color+"28", animation:"pulse 2s ease-in-out infinite" }} />}
      <span style={{ width:7, height:7, borderRadius:"50%", background:m.color, display:"block" }} />
    </span>
  );
}

function PrimaryBtn({ children, onClick, small=false, disabled=false, icon="" }: any) {
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
function GhostBtn({ children, onClick, small=false, danger=false }: any) {
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

function SectionCard({ title, action, children, style={} }: any) {
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

function StatCell({ label, value, color=C.textPri, sub="" }: any) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      <M size={14} color={color} weight={700} style={{ display:"block", marginTop:4, lineHeight:1 }}>{value}</M>
      {sub && <M size={9} color={C.textMuted} style={{ display:"block", marginTop:3 }}>{sub}</M>}
    </div>
  );
}

function RiskBar({ level }: any) {
  const levels = { conservative:1, moderate:2, aggressive:3 };
  const n = levels[level as keyof typeof levels]||1;
  const colors = { 1:C.green, 2:C.amber, 3:C.red };
  const labels = { conservative:"CONSERVATIVE", moderate:"MODERATE", aggressive:"AGGRESSIVE" };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ display:"flex", gap:3 }}>
        {[1,2,3].map(i=>(
          <div key={i} style={{ width:14, height:4, borderRadius:1,
            background:i<=n?colors[n as keyof typeof colors]:C.border }} />
        ))}
      </div>
      <Lbl color={colors[n as keyof typeof colors]}>{labels[level as keyof typeof labels]}</Lbl>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, padding:"8px 12px" }}>
      <Lbl style={{ display:"block", marginBottom:4 }}>{label}</Lbl>
      {payload.map((p: any)=>(
        <M key={p.name} size={12} color={p.color||C.green} weight={700} style={{ display:"block" }}>
          {typeof p.value==="number"&&p.value>100?"$"+p.value.toLocaleString():fmt.pct(p.value)}
        </M>
      ))}
    </div>
  );
}

function Sparkline({ data, color=C.green, height=30, style={} }: any) {
  if (!data?.length) return null;
  const w=100, h=height;
  const min=Math.min(...data), max=Math.max(...data), range=max-min||1;
  const pts=data.map((v: number,i: number)=>`${(i/(data.length-1))*w},${h-((v-min)/range)*h}`);
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

// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
// STRATEGY DETAIL PANEL
// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP

function StrategyDetailPanel({ strat, onClose, onDeploy }: any) {
  const eqData = strat.equityCurve.map((v: number,i: number)=>({ i, v }));
  const monthLabels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthData = strat.monthlyReturns.map((v: number,i: number)=>({ m:monthLabels[i], v }));

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
                <M size={10} color={C.textMuted}>return - {strat.backtestPeriod}</M>
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
                  <Tooltip content={<ChartTooltip />} formatter={(v: any)=>["$"+v.toLocaleString(),"Portfolio"]} />
                  <Area type="monotone" dataKey="v" stroke={strat.accentColor} strokeWidth={1.5}
                    fill={`url(#sg${strat.id})`} dot={false}
                    activeDot={{ r:3, fill:strat.accentColor, stroke:C.surface, strokeWidth:2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Monthly returns heatmap */}
          <SectionCard title="Monthly Returns - 2025">
            <div style={{ padding:"14px 18px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:4 }}>
                {monthData.map((m: any)=>(
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
            <PrimaryBtn onClick={onDeploy} disabled={strat.tierLocked} icon=">">
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

// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
// STRATEGY CARD
// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP

function StrategyCard({ strat, onClick }: any) {
  const eq = strat.equityCurve;
  const isUp = strat.backtestReturn >= 0;
  const sparkColor = strat.accentColor;
  const riskColor  = { conservative:C.green, moderate:C.amber, aggressive:C.red }[strat.risk as "conservative"|"moderate"|"aggressive"];

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
          {strat.description.slice(0,120)}...
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
            <Lbl>{strat.timeframe} • {strat.minCapital>=1000?strat.minCapital/1000+"k":"$"+strat.minCapital} min</Lbl>
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
            }}>{strat.tierLocked?"EON+ >":"DEPLOY >"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
// STRATEGIES PAGE
// PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP

export default function StrategiesPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedStrat, setSelectedStrat] = useState<any>(null);

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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.6;} 50%{transform:scale(1.7);opacity:0;} }
        @keyframes slideIn { from{transform:translateX(30px);opacity:0;} to{transform:none;opacity:1;} }
      `}</style>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>Strategies</M>
          <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>
            {STRATEGIES.length} core strategies • {totalRunning} active bots running
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
          const col={ all:C.textMuted, conservative:C.green, moderate:C.amber, aggressive:C.red }[r as "all"|"conservative"|"moderate"|"aggressive"];
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
