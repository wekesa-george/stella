import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  Cell, ReferenceLine, LineChart, Line, PieChart, Pie, Legend,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════════
const C = {
  bg:"#0B0D11", surface:"#12151C", surfaceAlt:"#0E111A", surfaceHov:"#161B26",
  border:"#1C2338", borderSub:"#161B28",
  green:"#00E5A0", greenDim:"#00E5A012", greenMid:"#00E5A035",
  red:"#F04F59",   redDim:"#F04F5912",   redMid:"#F04F5935",
  amber:"#F59E0B", amberDim:"#F59E0B12", amberMid:"#F59E0B35",
  blue:"#3B82F6",  blueDim:"#3B82F612",  blueMid:"#3B82F635",
  purple:"#A78BFA",purpleDim:"#A78BFA12",
  cyan:"#06B6D4",  cyanDim:"#06B6D412",
  textPri:"#C8CDE0", textMid:"#6B7590", textMuted:"#4A5578", textDim:"#2A3050",
  sidebar:"#0E111A",
};
const mono = "'JetBrains Mono','Fira Code',monospace";

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

const OPEN_POSITIONS = [
  { id:1, bot:"Momentum Alpha", pair:"BTC/USDT", side:"LONG",  exchange:"Binance",
    entry:97420.50, current:98840.00, qty:0.028, value:2767.52,
    unrealPnl:+39.74, pnlPct:+1.46, held:"2h 14m", slPrice:96500, tpPrice:99800,
    strategy:"Core Momentum", confidence:0.84, momentum:0.62, energy:"releasing",
    openedAt:"2026-02-19 08:28", botId:"bot-1" },
  { id:2, bot:"Momentum Alpha", pair:"ETH/USDT", side:"LONG",  exchange:"Binance",
    entry:3180.20, current:3156.40, qty:0.42, value:1325.69,
    unrealPnl:-9.99, pnlPct:-0.75, held:"41m",    slPrice:3100, tpPrice:3280,
    strategy:"Core Momentum", confidence:0.71, momentum:0.38, energy:"accumulating",
    openedAt:"2026-02-19 10:03", botId:"bot-1" },
  { id:3, bot:"Mean Rev Grid",  pair:"ETH/USDT", side:"SHORT", exchange:"Binance",
    entry:3210.00, current:3156.40, qty:0.20, value:631.28,
    unrealPnl:+10.72, pnlPct:+1.67, held:"1h 03m", slPrice:3260, tpPrice:3120,
    strategy:"Core Mean Reversion", confidence:0.77, momentum:-0.41, energy:"releasing",
    openedAt:"2026-02-19 09:41", botId:"bot-2" },
  { id:4, bot:"DCA Accumulator", pair:"BTC/USDT", side:"LONG", exchange:"Binance",
    entry:96200.00, current:98840.00, qty:0.012, value:1186.08,
    unrealPnl:+31.68, pnlPct:+2.74, held:"18h 32m", slPrice:93000, tpPrice:102000,
    strategy:"Core DCA", confidence:null, momentum:null, energy:null,
    openedAt:"2026-02-18 16:12", botId:"bot-5" },
];

const CLOSED_POSITIONS = [
  { id:10, bot:"Momentum Alpha", pair:"BTC/USDT", side:"LONG",  exchange:"Binance",
    entry:96900, exit:97810, qty:0.030, realPnl:+112.20, pnlPct:+2.91,
    held:"55m", exitReason:"strategy_signal", closedAt:"2026-02-19 09:17" },
  { id:11, bot:"Mean Rev Grid",  pair:"ETH/USDT", side:"SHORT", exchange:"Binance",
    entry:3204.80, exit:3176.20, qty:0.40, realPnl:+28.60, pnlPct:+1.77,
    held:"34m", exitReason:"take_profit",   closedAt:"2026-02-19 08:52" },
  { id:12, bot:"Impulse Scalper",pair:"SOL/USDT", side:"LONG",  exchange:"Alpaca",
    entry:192.40, exit:195.80, qty:2.0, realPnl:+6.80, pnlPct:+3.52,
    held:"22m", exitReason:"take_profit",   closedAt:"2026-02-18 11:05" },
  { id:13, bot:"Momentum Alpha", pair:"BTC/USDT", side:"LONG",  exchange:"Binance",
    entry:97100, exit:96880, qty:0.025, realPnl:-22.60, pnlPct:-0.88,
    held:"1h 32m", exitReason:"stop_loss", closedAt:"2026-02-18 14:42" },
  { id:14, bot:"Mean Rev Grid",  pair:"ETH/USDT", side:"LONG",  exchange:"Binance",
    entry:3190.10, exit:3215.00, qty:0.40, realPnl:+16.80, pnlPct:+1.56,
    held:"3h 20m", exitReason:"take_profit", closedAt:"2026-02-18 12:25" },
  { id:15, bot:"Momentum Alpha", pair:"BTC/USDT", side:"SHORT", exchange:"Binance",
    entry:97320, exit:97010, qty:0.020, realPnl:+31.00, pnlPct:+1.31,
    held:"45m", exitReason:"strategy_signal", closedAt:"2026-02-17 17:29" },
  { id:16, bot:"Impulse Scalper",pair:"SOL/USDT", side:"LONG",  exchange:"Alpaca",
    entry:198.20, exit:196.10, qty:1.5, realPnl:-12.40, pnlPct:-1.58,
    held:"58m", exitReason:"stop_loss", closedAt:"2026-02-17 09:14" },
  { id:17, bot:"DCA Accumulator",pair:"BTC/USDT", side:"LONG",  exchange:"Binance",
    entry:95400, exit:97100, qty:0.010, realPnl:+17.00, pnlPct:+1.78,
    held:"2d 4h", exitReason:"take_profit", closedAt:"2026-02-16 11:00" },
];

// Analytics data
const EQUITY_DATA = [
  {d:"Feb 10",v:9800,dd:0},  {d:"Feb 11",v:9950,dd:0},  {d:"Feb 12",v:9720,dd:2.31},
  {d:"Feb 13",v:10100,dd:0}, {d:"Feb 14",v:10340,dd:0}, {d:"Feb 15",v:10210,dd:1.26},
  {d:"Feb 16",v:10580,dd:0}, {d:"Feb 17",v:10420,dd:1.51},{d:"Feb 18",v:10890,dd:0},
  {d:"Feb 19",v:11240,dd:0},
];

const MONTHLY_RETURNS = [
  {m:"Jan",v:+8.4},{m:"Feb",v:+5.1},{m:"Mar",v:-2.8},{m:"Apr",v:+6.2},{m:"May",v:+3.9},
  {m:"Jun",v:-1.4},{m:"Jul",v:+7.8},{m:"Aug",v:+4.1},{m:"Sep",v:+2.2},{m:"Oct",v:-0.6},
  {m:"Nov",v:+5.4},{m:"Dec",v:+3.8},
];

const PAIR_BREAKDOWN = [
  {pair:"BTC/USDT",trades:88, winRate:66.2, pnl:820.40, fees:42.10, volume:184200},
  {pair:"ETH/USDT",trades:52, winRate:60.5, pnl:312.80, fees:18.60, volume:82400},
  {pair:"SOL/USDT",trades:31, winRate:61.8, pnl:180.20, fees:8.20,  volume:24100},
  {pair:"BNB/USDT",trades:4,  winRate:50.0, pnl:-12.40, fees:1.80,  volume:3800},
];

const HOURLY_PNL = [
  {h:"00",v:+1.2},{h:"01",v:-0.4},{h:"02",v:+0.8},{h:"03",v:+0.3},{h:"04",v:+1.8},
  {h:"05",v:+2.1},{h:"06",v:-0.9},{h:"07",v:+3.2},{h:"08",v:+4.8},{h:"09",v:+5.4},
  {h:"10",v:+4.1},{h:"11",v:+2.8},{h:"12",v:-1.2},{h:"13",v:+1.9},{h:"14",v:+3.6},
  {h:"15",v:+4.4},{h:"16",v:+2.1},{h:"17",v:-0.6},{h:"18",v:+1.3},{h:"19",v:+0.8},
  {h:"20",v:+0.4},{h:"21",v:-0.2},{h:"22",v:+0.6},{h:"23",v:+0.3},
];

const TRADE_SIZE_DIST = [
  {range:"$0–50",count:28},{range:"$50–150",count:44},{range:"$150–300",count:31},
  {range:"$300–500",count:22},{range:"$500+",count:8},
];

// Capital data
const EXCHANGES = [
  { id:"binance", name:"Binance", logo:"B", logoColor:"#F0B90B",
    status:"connected", balance:12400, allocated:9500, available:2900,
    pairs:12, bots:4, lastSync:"12s ago",
    credentials:[{ label:"Main API", status:"active", permissions:["read","trade"], expires:null, lastValidated:"2h ago" }],
  },
  { id:"alpaca", name:"Alpaca", logo:"A", logoColor:"#FF5733",
    status:"connected", balance:4200, allocated:1500, available:2700,
    pairs:6, bots:1, lastSync:"8s ago",
    credentials:[{ label:"Paper Key", status:"active", permissions:["read","trade"], expires:null, lastValidated:"5h ago" }],
  },
  { id:"hyperliquid", name:"Hyperliquid", logo:"H", logoColor:"#6C63FF",
    status:"disconnected", balance:0, allocated:0, available:0,
    pairs:0, bots:0, lastSync:"never",
    credentials:[],
  },
];

const BOT_ALLOCATIONS = [
  { botId:"bot-1", botName:"Momentum Alpha",  exchange:"Binance", strategy:"Core Momentum",
    allocated:5000, maxAlloc:8000, pnl:+1240, status:"running" },
  { botId:"bot-2", botName:"Mean Rev Grid",   exchange:"Binance", strategy:"Core Mean Reversion",
    allocated:2500, maxAlloc:4000, pnl:+340,  status:"running" },
  { botId:"bot-3", botName:"Impulse Scalper", exchange:"Alpaca",  strategy:"Core Momentum",
    allocated:1500, maxAlloc:3000, pnl:+180,  status:"paused" },
  { botId:"bot-5", botName:"DCA Accumulator", exchange:"Binance", strategy:"Core DCA",
    allocated:3000, maxAlloc:5000, pnl:+450,  status:"running" },
];

// Risk data
const CIRCUIT_BREAKER_LOG = [
  { id:1, bot:"Momentum Alpha", trigger:"drawdown_breach", severity:"high",
    triggerVal:10.2, threshold:10.0, positionsClosed:2, ordersKilled:3,
    impact:-214.50, status:"resolved", resolvedAt:"Feb 14 09:12", cooldown:"4h",
    resolvedBy:"auto" },
  { id:2, bot:"Mean Rev Grid",  trigger:"rapid_loss",      severity:"medium",
    triggerVal:5.8,  threshold:5.0,  positionsClosed:1, ordersKilled:4,
    impact:-88.20, status:"resolved", resolvedAt:"Feb 11 14:33", cooldown:"2h",
    resolvedBy:"manual" },
  { id:3, bot:"Trend Follower", trigger:"exchange_error_rate", severity:"low",
    triggerVal:12,   threshold:5,    positionsClosed:0, ordersKilled:1,
    impact:0, status:"resolved", resolvedAt:"Feb 08 07:45", cooldown:"30m",
    resolvedBy:"auto" },
];

const LIMIT_TYPES = [
  { key:"max_drawdown_pct",    label:"Max Drawdown",      unit:"%",   global:50, tier:15, user:null, current:3.2,  desc:"Auto-stop if portfolio drops this much from peak." },
  { key:"max_trade_size_usd",  label:"Max Trade Size",    unit:"$",   global:100000, tier:500, user:null, current:null, desc:"Maximum notional value of a single order." },
  { key:"daily_volume_cap_usd",label:"Daily Volume Cap",  unit:"$",   global:500000, tier:5000, user:null, current:1240, desc:"Rolling 24h total traded volume limit." },
  { key:"max_leverage",        label:"Max Leverage",      unit:"×",   global:10, tier:2, user:null, current:1, desc:"Maximum leverage multiplier across all positions." },
  { key:"max_open_positions",  label:"Max Open Positions",unit:"",    global:100, tier:10, user:null, current:4, desc:"Maximum concurrent open positions platform-wide." },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════
const fmt = {
  usd:  v => (v>=0?"+":"")+"$"+Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),
  abs:  v => "$"+Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),
  pct:  v => (v>=0?"+":"")+v.toFixed(2)+"%",
  k:    v => v>=1000?(v/1000).toFixed(1)+"k":String(v),
};

function M({size=11,color=C.textPri,weight=500,caps=false,style={},children,dim=false}) {
  return <span style={{ fontFamily:mono,fontSize:size,color:dim?C.textMuted:color,fontWeight:weight,
    letterSpacing:caps?"0.11em":"0.03em",textTransform:caps?"uppercase":"none",...style }}>{children}</span>;
}
function Lbl({children,color=C.textMuted,style={}}) {
  return <M size={9} color={color} weight={600} caps style={{letterSpacing:"0.13em",...style}}>{children}</M>;
}
function Div({my=0,mx=0}) { return <div style={{height:1,background:C.borderSub,margin:`${my}px ${mx}px`}}/>; }
function VDiv() { return <div style={{width:1,background:C.border,alignSelf:"stretch"}}/>; }

function Pill({children,color=C.green,active=false,onClick}) {
  return (
    <button onClick={onClick} style={{ background:active?color+"18":"transparent",
      border:`1px solid ${active?color+"40":C.border}`, borderRadius:3, padding:"5px 12px",
      fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
      color:active?color:C.textMuted, cursor:"pointer", fontWeight:active?700:500 }}>
      {children}
    </button>
  );
}

function Tag({children,color=C.green}) {
  return <span style={{ background:color+"18",border:`1px solid ${color}35`,borderRadius:2,
    padding:"2px 7px",fontFamily:mono,fontSize:9,color,fontWeight:700,letterSpacing:"0.1em" }}>{children}</span>;
}

function SideDot({side,size=7}) {
  const c=side==="LONG"?C.green:C.red;
  return <span style={{width:size,height:size,borderRadius:"50%",background:c,display:"inline-block",flexShrink:0}}/>;
}

function PrimaryBtn({children,onClick,small=false,disabled=false,full=false}) {
  return <button onClick={onClick} disabled={disabled} style={{ background:disabled?"#1A2030":C.green,
    color:disabled?"#3D4560":"#0A0D14",border:"none",borderRadius:3,
    padding:small?"6px 14px":"9px 20px",fontFamily:mono,fontSize:small?9:10,
    letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,
    cursor:disabled?"not-allowed":"pointer",width:full?"100%":"auto" }}>{children}</button>;
}
function GhostBtn({children,onClick,small=false,danger=false}) {
  return <button onClick={onClick} style={{ background:"transparent",
    border:`1px solid ${danger?C.red+"40":C.border}`,borderRadius:3,
    padding:small?"5px 12px":"9px 16px",fontFamily:mono,fontSize:small?9:10,
    letterSpacing:"0.1em",textTransform:"uppercase",color:danger?C.red:C.textMuted,
    cursor:"pointer",fontWeight:600 }}>{children}</button>;
}

function Card({children,style={}}) {
  return <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,...style}}>{children}</div>;
}

function CardHeader({title,sub,right}) {
  return (
    <>
      <div style={{padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <M size={11} weight={700} style={{letterSpacing:"0.06em",display:"block"}}>{title}</M>
          {sub&&<Lbl style={{marginTop:3}}>{sub}</Lbl>}
        </div>
        {right}
      </div>
      <Div />
    </>
  );
}

function StatBox({label,value,color=C.textPri,sub=""}) {
  return (
    <div style={{padding:"14px 18px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:4}}>
      <Lbl>{label}</Lbl>
      <M size={20} color={color} weight={700} style={{display:"block",marginTop:6,lineHeight:1}}>{value}</M>
      {sub&&<M size={9} color={C.textMuted} style={{display:"block",marginTop:4}}>{sub}</M>}
    </div>
  );
}

function CustomTooltip({active,payload,label}) {
  if(!active||!payload?.length) return null;
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:"8px 12px"}}>
      <Lbl style={{display:"block",marginBottom:4}}>{label}</Lbl>
      {payload.map((p,i)=>(
        <M key={i} size={12} color={p.color||C.green} weight={700} style={{display:"block"}}>
          {typeof p.value==="number"&&Math.abs(p.value)>50?"$"+Math.abs(p.value).toLocaleString():
           typeof p.value==="number"?fmt.pct(p.value):p.value}
        </M>
      ))}
    </div>
  );
}

function Sparkline({data,color=C.green,height=28}) {
  if(!data?.length) return null;
  const w=100,h=height,mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/r)*h}`);
  const fillD=`M 0,${h} L ${pts.join(" L ")} L ${w},${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{display:"block"}}>
      <defs><linearGradient id={`sp${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.28"/><stop offset="100%" stopColor={color} stopOpacity="0.02"/>
      </linearGradient></defs>
      <path d={fillD} fill={`url(#sp${color.replace("#","")})`}/>
      <path d={`M ${pts.join(" L ")}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DrawdownGauge({value,max}) {
  const pct=Math.min(value/max,1);
  const color=pct<0.5?C.green:pct<0.75?C.amber:C.red;
  const angle=pct*180;
  const r=70,cx=90,cy=90;
  const toRad=d=>(d-180)*Math.PI/180;
  const sx=cx+r*Math.cos(toRad(0));
  const sy=cy+r*Math.sin(toRad(0));
  const ex=cx+r*Math.cos(toRad(angle));
  const ey=cy+r*Math.sin(toRad(angle));
  const large=angle>180?1:0;
  const bgEx=cx+r*Math.cos(toRad(180));
  const bgEy=cy+r*Math.sin(toRad(180));
  return (
    <svg width="180" height="100" viewBox="0 0 180 100">
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 1 1 ${bgEx} ${bgEy}`}
        fill="none" stroke={C.border} strokeWidth="10" strokeLinecap="round"/>
      {pct>0&&<path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`}
        fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        style={{transition:"stroke-dasharray 0.5s"}}/>}
      <text x="90" y="86" textAnchor="middle" fontFamily={mono} fontSize="20" fontWeight="700" fill={color}>
        {value.toFixed(1)}%
      </text>
      <text x="90" y="100" textAnchor="middle" fontFamily={mono} fontSize="8" fill={C.textMuted} letterSpacing="2">
        DRAWDOWN
      </text>
      <text x="20" y="100" textAnchor="middle" fontFamily={mono} fontSize="8" fill={C.textDim}>0%</text>
      <text x="160" y="100" textAnchor="middle" fontFamily={mono} fontSize="8" fill={C.textDim}>{max}%</text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITIONS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function PositionDetailPanel({pos,onClose,onClose2}) {
  const isUp=pos.unrealPnl!==undefined?pos.unrealPnl>=0:pos.realPnl>=0;
  const isOpen=pos.unrealPnl!==undefined;
  const isLong=pos.side==="LONG";
  const pnl=isOpen?pos.unrealPnl:pos.realPnl;
  const pct=pos.pnlPct;

  return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,width:440,
      background:C.surface,borderLeft:`1px solid ${C.border}`,
      zIndex:200,display:"flex",flexDirection:"column",animation:"slideIn 0.2s ease"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,
        display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
            <SideDot side={pos.side} size={8}/>
            <M size={14} weight={700}>{pos.pair}</M>
            <Tag color={isLong?C.green:C.red}>{pos.side}</Tag>
            {isOpen?<Tag color={C.green}>LIVE</Tag>:<Tag color={C.textMuted}>CLOSED</Tag>}
          </div>
          <Lbl>{pos.bot} · {pos.exchange}</Lbl>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",
          color:C.textMuted,cursor:"pointer",fontFamily:mono,fontSize:20,padding:4}}>×</button>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"18px 20px"}}>
        {/* P&L headline */}
        <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:4,
          padding:"16px 18px",marginBottom:16}}>
          <Lbl>{isOpen?"Unrealised P&L":"Realised P&L"}</Lbl>
          <M size={28} color={isUp?C.green:C.red} weight={700} style={{display:"block",marginTop:6,lineHeight:1}}>
            {fmt.usd(pnl)}
          </M>
          <M size={12} color={isUp?C.green:C.red} style={{display:"block",marginTop:4}}>{fmt.pct(pct)}</M>
        </div>

        {/* Fields */}
        <Card style={{marginBottom:16}}>
          <div style={{padding:"4px 16px"}}>
            {(isOpen?[
              {l:"Entry Price",   v:"$"+pos.entry.toLocaleString("en-US",{minimumFractionDigits:2})},
              {l:"Current Price", v:"$"+pos.current.toLocaleString("en-US",{minimumFractionDigits:2}), c:isUp?C.green:C.red},
              {l:"Quantity",      v:pos.qty},
              {l:"Position Value",v:fmt.abs(pos.value)},
              {l:"Stop Loss",     v:pos.slPrice?"$"+pos.slPrice.toLocaleString():"—", c:C.red},
              {l:"Take Profit",   v:pos.tpPrice?"$"+pos.tpPrice.toLocaleString():"—", c:C.green},
              {l:"Time Held",     v:pos.held},
              {l:"Opened At",     v:pos.openedAt},
              {l:"Strategy",      v:pos.strategy},
            ]:[
              {l:"Entry Price",   v:"$"+pos.entry.toLocaleString()},
              {l:"Exit Price",    v:"$"+pos.exit.toLocaleString(), c:isUp?C.green:C.red},
              {l:"Quantity",      v:pos.qty},
              {l:"Time Held",     v:pos.held},
              {l:"Exit Reason",   v:pos.exitReason?.replace(/_/g," ").toUpperCase(), c:
                pos.exitReason==="stop_loss"?C.red:pos.exitReason==="take_profit"?C.green:C.textPri},
              {l:"Closed At",     v:pos.closedAt},
            ]).map(({l,v,c},i,a)=>(
              <div key={l}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0"}}>
                  <Lbl>{l}</Lbl>
                  <M size={11} color={c||C.textPri} weight={600}>{String(v)}</M>
                </div>
                {i<a.length-1&&<Div/>}
              </div>
            ))}
          </div>
        </Card>

        {/* Physics params */}
        {isOpen&&pos.momentum!==null&&(
          <Card>
            <CardHeader title="Physics Model" sub="Stella momentum engine state"/>
            <div style={{padding:"12px 18px",display:"flex",flexDirection:"column",gap:10}}>
              {[
                {l:"Signal Confidence",v:(pos.confidence*100).toFixed(0)+"%",c:C.green},
                {l:"Momentum Vector", v:pos.momentum.toFixed(2),c:pos.momentum>0?C.green:C.red},
                {l:"Energy State",    v:pos.energy?.toUpperCase(),c:
                  pos.energy==="releasing"?C.green:pos.energy==="accumulating"?C.amber:C.textMid},
              ].map(({l,v,c})=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between"}}>
                  <Lbl>{l}</Lbl><M size={11} color={c} weight={700}>{v}</M>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Action */}
        {isOpen&&(
          <div style={{marginTop:16}}>
            <GhostBtn onClick={onClose2} danger>Force Close Position</GhostBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function PositionsPage() {
  const [tab,setTab]=useState("open");
  const [sideF,setSideF]=useState("all");
  const [excF,setExcF]=useState("all");
  const [selected,setSelected]=useState(null);

  const openPnl=OPEN_POSITIONS.reduce((s,p)=>s+p.unrealPnl,0);
  const realPnl=CLOSED_POSITIONS.filter(p=>p.realPnl>0).reduce((s,p)=>s+p.realPnl,0)
    -CLOSED_POSITIONS.filter(p=>p.realPnl<0).reduce((s,p)=>s+Math.abs(p.realPnl),0);

  const filterOpen=OPEN_POSITIONS.filter(p=>{
    if(sideF!=="all"&&p.side!==sideF) return false;
    if(excF!=="all"&&p.exchange!==excF) return false;
    return true;
  });
  const filterClosed=CLOSED_POSITIONS.filter(p=>{
    if(sideF!=="all"&&p.side!==sideF) return false;
    if(excF!=="all"&&p.exchange!==excF) return false;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <M size={16} weight={700} style={{letterSpacing:"0.04em",display:"block"}}>Positions</M>
          <M size={10} color={C.textMuted} style={{display:"block",marginTop:3}}>
            {OPEN_POSITIONS.length} open · {CLOSED_POSITIONS.length} closed today
          </M>
        </div>
        <GhostBtn danger small>Force Close All</GhostBtn>
      </div>

      {/* Summary strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:18}}>
        {[
          {l:"Open",         v:String(OPEN_POSITIONS.length),         c:C.textPri},
          {l:"Unrealised P&L",v:fmt.usd(openPnl),                    c:openPnl>=0?C.green:C.red},
          {l:"Closed Today", v:String(CLOSED_POSITIONS.length),       c:C.textMid},
          {l:"Realised P&L", v:fmt.usd(realPnl),                     c:realPnl>=0?C.green:C.red},
          {l:"Total Value",  v:fmt.abs(OPEN_POSITIONS.reduce((s,p)=>s+p.value,0)), c:C.textPri},
        ].map(s=>(
          <StatBox key={s.l} label={s.l} value={s.v} color={s.c}/>
        ))}
      </div>

      {/* Tabs + Filters */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:0,border:`1px solid ${C.border}`,borderRadius:3,overflow:"hidden"}}>
          {[{k:"open",label:"Open",n:OPEN_POSITIONS.length},{k:"closed",label:"Closed",n:CLOSED_POSITIONS.length}].map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)} style={{
              padding:"7px 18px",background:tab===t.k?C.green+"18":"transparent",
              border:"none",borderRight:t.k==="open"?`1px solid ${C.border}`:"none",
              fontFamily:mono,fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",
              color:tab===t.k?C.green:C.textMuted,cursor:"pointer",fontWeight:tab===t.k?700:500,
              display:"flex",alignItems:"center",gap:6,
            }}>
              {t.label}
              <span style={{background:tab===t.k?C.green+"30":C.border,color:tab===t.k?C.green:C.textMuted,
                borderRadius:8,padding:"0 5px",fontSize:8,fontWeight:700}}>{t.n}</span>
            </button>
          ))}
        </div>
        <VDiv/>
        {["all","LONG","SHORT"].map(s=>(
          <Pill key={s} active={sideF===s} onClick={()=>setSideF(s)}
            color={s==="LONG"?C.green:s==="SHORT"?C.red:C.textMuted}>
            {s==="all"?"Both Sides":s}
          </Pill>
        ))}
        <VDiv/>
        {["all","Binance","Alpaca"].map(ex=>(
          <Pill key={ex} active={excF===ex} onClick={()=>setExcF(ex)}>
            {ex==="all"?"All Exchanges":ex}
          </Pill>
        ))}
      </div>

      {/* Table */}
      {tab==="open"?(
        <Card>
          <div style={{display:"grid",
            gridTemplateColumns:"170px 70px 110px 110px 70px 90px 100px 110px 110px 80px",
            padding:"9px 18px",gap:0}}>
            {["Position","Side","Entry","Current","Qty","Value","Unreal. P&L","SL","TP","Held"].map(h=>(
              <Lbl key={h}>{h}</Lbl>
            ))}
          </div>
          <Div/>
          {filterOpen.map((pos,i)=>{
            const isUp=pos.unrealPnl>=0;
            const isLong=pos.side==="LONG";
            return (
              <div key={pos.id}>
                <div onClick={()=>setSelected(pos)} style={{display:"grid",
                  gridTemplateColumns:"170px 70px 110px 110px 70px 90px 100px 110px 110px 80px",
                  padding:"11px 18px",gap:0,alignItems:"center",cursor:"pointer",
                  background:i%2===0?"transparent":C.surfaceAlt+"60",transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHov}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":C.surfaceAlt+"60"}>
                  <div>
                    <M size={11} weight={700}>{pos.pair}</M>
                    <M size={9} color={C.textDim} style={{display:"block",marginTop:1}}>{pos.bot}</M>
                  </div>
                  <Tag color={isLong?C.green:C.red}>{pos.side}</Tag>
                  <M size={11} color={C.textMid}>${pos.entry.toLocaleString("en-US",{minimumFractionDigits:2})}</M>
                  <M size={11} color={isUp?C.green:C.red} weight={600}>${pos.current.toLocaleString("en-US",{minimumFractionDigits:2})}</M>
                  <M size={11} color={C.textMid}>{pos.qty}</M>
                  <M size={11} color={C.textPri}>{fmt.abs(pos.value)}</M>
                  <M size={11} color={isUp?C.green:C.red} weight={700}>{fmt.usd(pos.unrealPnl)}</M>
                  <M size={10} color={C.red}>{pos.slPrice?"$"+pos.slPrice.toLocaleString():"—"}</M>
                  <M size={10} color={C.green}>{pos.tpPrice?"$"+pos.tpPrice.toLocaleString():"—"}</M>
                  <M size={10} color={C.textMuted}>{pos.held}</M>
                </div>
                {i<filterOpen.length-1&&<Div/>}
              </div>
            );
          })}
        </Card>
      ):(
        <Card>
          <div style={{display:"grid",
            gridTemplateColumns:"170px 70px 100px 100px 70px 100px 100px 120px 120px",
            padding:"9px 18px",gap:0}}>
            {["Position","Side","Entry","Exit","Qty","Realised P&L","Return","Exit Reason","Closed"].map(h=>(
              <Lbl key={h}>{h}</Lbl>
            ))}
          </div>
          <Div/>
          {filterClosed.map((pos,i)=>{
            const isUp=pos.realPnl>=0;
            const isLong=pos.side==="LONG";
            const exitColor=pos.exitReason==="stop_loss"?C.red:pos.exitReason==="take_profit"?C.green:C.textMid;
            return (
              <div key={pos.id}>
                <div onClick={()=>setSelected(pos)} style={{display:"grid",
                  gridTemplateColumns:"170px 70px 100px 100px 70px 100px 100px 120px 120px",
                  padding:"11px 18px",gap:0,alignItems:"center",cursor:"pointer",
                  background:i%2===0?"transparent":C.surfaceAlt+"60",transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHov}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":C.surfaceAlt+"60"}>
                  <div>
                    <M size={11} weight={700}>{pos.pair}</M>
                    <M size={9} color={C.textDim} style={{display:"block",marginTop:1}}>{pos.bot} · {pos.held}</M>
                  </div>
                  <Tag color={isLong?C.green:C.red}>{pos.side}</Tag>
                  <M size={11} color={C.textMid}>${pos.entry.toLocaleString()}</M>
                  <M size={11} color={C.textPri} weight={600}>${pos.exit.toLocaleString()}</M>
                  <M size={11} color={C.textMid}>{pos.qty}</M>
                  <M size={11} color={isUp?C.green:C.red} weight={700}>{fmt.usd(pos.realPnl)}</M>
                  <M size={11} color={isUp?C.green:C.red}>{fmt.pct(pos.pnlPct)}</M>
                  <Tag color={exitColor}>{pos.exitReason?.replace(/_/g," ").toUpperCase()}</Tag>
                  <M size={9} color={C.textMuted}>{pos.closedAt}</M>
                </div>
                {i<filterClosed.length-1&&<Div/>}
              </div>
            );
          })}
        </Card>
      )}

      {selected&&(
        <>
          <div onClick={()=>setSelected(null)} style={{position:"fixed",inset:0,
            background:"rgba(0,0,0,0.45)",zIndex:199}}/>
          <PositionDetailPanel pos={selected} onClose={()=>setSelected(null)} onClose2={()=>setSelected(null)}/>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function AnalyticsPage() {
  const [range,setRange]=useState("1M");
  const [tab,setTab]=useState("returns");

  const winCount=CLOSED_POSITIONS.filter(p=>p.realPnl>0).length;
  const lossCount=CLOSED_POSITIONS.filter(p=>p.realPnl<0).length;
  const winRate=((winCount/(winCount+lossCount))*100).toFixed(1);
  const totalFees=PAIR_BREAKDOWN.reduce((s,p)=>s+p.fees,0);
  const bestMonth=Math.max(...MONTHLY_RETURNS.map(m=>m.v));
  const worstMonth=Math.min(...MONTHLY_RETURNS.map(m=>m.v));
  const avgMonthly=(MONTHLY_RETURNS.reduce((s,m)=>s+m.v,0)/12).toFixed(1);

  const pieData=[
    {name:"Wins",  value:winCount,  fill:C.green},
    {name:"Losses",value:lossCount, fill:C.red},
  ];

  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <M size={16} weight={700} style={{letterSpacing:"0.04em",display:"block"}}>Analytics</M>
          <M size={10} color={C.textMuted} style={{display:"block",marginTop:3}}>
            Feb 2026 · 175 trades analysed
          </M>
        </div>
        <div style={{display:"flex",gap:4}}>
          {["1W","1M","3M","YTD","All"].map(r=>(
            <Pill key={r} active={range===r} onClick={()=>setRange(r)}>{r}</Pill>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12,marginBottom:18}}>
        {[
          {l:"Total Return",   v:"+12.4%",  c:C.green},
          {l:"Win Rate",       v:winRate+"%",c:C.green},
          {l:"Avg Monthly",    v:"+"+avgMonthly+"%",c:C.green},
          {l:"Best Month",     v:"+"+bestMonth+"%", c:C.green},
          {l:"Worst Month",    v:worstMonth+"%",    c:C.red},
          {l:"Fees Paid",      v:fmt.abs(totalFees),c:C.textMid},
        ].map(s=>(
          <StatBox key={s.l} label={s.l} value={s.v} color={s.c}/>
        ))}
      </div>

      {/* Page tabs */}
      <div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:18}}>
        {[{k:"returns",l:"Returns"},{k:"trades",l:"Trade Analysis"},{k:"pairs",l:"Pairs"},{k:"timing",l:"Timing"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            padding:"9px 20px",background:"transparent",border:"none",
            borderBottom:`2px solid ${tab===t.k?C.green:"transparent"}`,
            fontFamily:mono,fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",
            color:tab===t.k?C.green:C.textMuted,cursor:"pointer",fontWeight:tab===t.k?700:500,
          }}>{t.l}</button>
        ))}
      </div>

      {/* RETURNS TAB */}
      {tab==="returns"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Equity curve */}
          <Card>
            <CardHeader title="Portfolio Equity" sub="Starting capital $10,000"/>
            <div style={{padding:"12px 0 8px"}}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={EQUITY_DATA} margin={{top:4,right:20,bottom:0,left:20}}>
                  <defs>
                    <linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={0.25}/>
                      <stop offset="100%" stopColor={C.green} stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.borderSub} strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="d" tick={{fontFamily:mono,fontSize:9,fill:C.textMuted}} tickLine={false} axisLine={false}/>
                  <YAxis domain={["auto","auto"]} tick={{fontFamily:mono,fontSize:9,fill:C.textMuted}} tickLine={false} axisLine={false}
                    tickFormatter={v=>"$"+v.toLocaleString()}/>
                  <Tooltip content={<CustomTooltip/>} formatter={v=>["$"+v.toLocaleString(),"Equity"]}/>
                  <Area type="monotone" dataKey="v" stroke={C.green} strokeWidth={1.5} fill="url(#eqG)"
                    dot={false} activeDot={{r:3,fill:C.green,stroke:C.surface,strokeWidth:2}}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Monthly returns heatmap */}
          <Card>
            <CardHeader title="Monthly Returns — 2025" sub="Each cell = realised P&L for that month"/>
            <div style={{padding:"14px 18px"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:6}}>
                {MONTHLY_RETURNS.slice(0,6).map(m=>(
                  <div key={m.m} style={{background:m.v>0?C.green+"20":C.red+"20",
                    border:`1px solid ${m.v>0?C.green+"30":C.red+"30"}`,
                    borderRadius:3,padding:"10px 4px",textAlign:"center"}}>
                    <Lbl style={{display:"block",marginBottom:4}}>{m.m}</Lbl>
                    <M size={12} color={m.v>=0?C.green:C.red} weight={700}>{fmt.pct(m.v)}</M>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
                {MONTHLY_RETURNS.slice(6).map(m=>(
                  <div key={m.m} style={{background:m.v>0?C.green+"20":C.red+"20",
                    border:`1px solid ${m.v>0?C.green+"30":C.red+"30"}`,
                    borderRadius:3,padding:"10px 4px",textAlign:"center"}}>
                    <Lbl style={{display:"block",marginBottom:4}}>{m.m}</Lbl>
                    <M size={12} color={m.v>=0?C.green:C.red} weight={700}>{fmt.pct(m.v)}</M>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TRADES TAB */}
      {tab==="trades"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {/* Win/loss donut */}
          <Card>
            <CardHeader title="Win / Loss Distribution" sub={`${winCount+lossCount} closed trades`}/>
            <div style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:24}}>
              <PieChart width={130} height={130}>
                <Pie data={pieData} cx={60} cy={60} innerRadius={38} outerRadius={58}
                  dataKey="value" strokeWidth={0} paddingAngle={2}>
                  {pieData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                </Pie>
              </PieChart>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <Lbl>Winners</Lbl>
                  <M size={22} color={C.green} weight={700} style={{display:"block",marginTop:3}}>{winCount}</M>
                  <M size={10} color={C.textMuted} style={{display:"block"}}>{winRate}% win rate</M>
                </div>
                <div>
                  <Lbl>Losers</Lbl>
                  <M size={22} color={C.red} weight={700} style={{display:"block",marginTop:3}}>{lossCount}</M>
                  <M size={10} color={C.textMuted} style={{display:"block"}}>{(100-parseFloat(winRate)).toFixed(1)}%</M>
                </div>
              </div>
            </div>
          </Card>

          {/* Trade size distribution */}
          <Card>
            <CardHeader title="Trade Size Distribution" sub="P&L by trade size bucket"/>
            <div style={{padding:"8px 12px 12px"}}>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={TRADE_SIZE_DIST} margin={{top:4,right:4,bottom:0,left:0}}>
                  <XAxis dataKey="range" tick={{fontFamily:mono,fontSize:8,fill:C.textMuted}} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fontFamily:mono,fontSize:8,fill:C.textMuted}} tickLine={false} axisLine={false}/>
                  <Tooltip content={<CustomTooltip/>} formatter={v=>[v,"Trades"]}/>
                  <Bar dataKey="count" fill={C.green} radius={[2,2,0,0]} opacity={0.8}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Advanced stats */}
          <Card style={{gridColumn:"span 2"}}>
            <CardHeader title="Performance Metrics"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",padding:"14px 18px",gap:0}}>
              {[
                {l:"Sharpe Ratio",  v:"1.84",     c:C.green},
                {l:"Sortino Ratio", v:"2.41",     c:C.green},
                {l:"Profit Factor", v:"2.18",     c:C.green},
                {l:"Avg Winner",    v:"+$54.20",  c:C.green},
                {l:"Avg Loser",     v:"-$17.50",  c:C.red},
                {l:"Avg Hold Time", v:"1h 22m",   c:C.textPri},
              ].map(({l,v,c},i)=>(
                <div key={l} style={{paddingRight:i<5?16:0,paddingLeft:i>0?16:0,
                  borderRight:i<5?`1px solid ${C.borderSub}`:"none"}}>
                  <Lbl>{l}</Lbl>
                  <M size={16} color={c} weight={700} style={{display:"block",marginTop:6}}>{v}</M>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* PAIRS TAB */}
      {tab==="pairs"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* P&L by pair bar */}
          <Card>
            <CardHeader title="P&L by Trading Pair"/>
            <div style={{padding:"8px 20px 16px"}}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={PAIR_BREAKDOWN} margin={{top:4,right:4,bottom:0,left:20}}>
                  <CartesianGrid stroke={C.borderSub} strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="pair" tick={{fontFamily:mono,fontSize:9,fill:C.textMuted}} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fontFamily:mono,fontSize:9,fill:C.textMuted}} tickLine={false} axisLine={false}
                    tickFormatter={v=>"$"+v}/>
                  <Tooltip content={<CustomTooltip/>} formatter={v=>["$"+v.toFixed(2),"P&L"]}/>
                  <ReferenceLine y={0} stroke={C.border}/>
                  <Bar dataKey="pnl" radius={[2,2,0,0]}>
                    {PAIR_BREAKDOWN.map((p,i)=><Cell key={i} fill={p.pnl>=0?C.green:C.red} opacity={0.85}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Pair table */}
          <Card>
            <div style={{display:"grid",gridTemplateColumns:"120px 70px 80px 100px 90px 100px",
              padding:"9px 18px",gap:0}}>
              {["Pair","Trades","Win Rate","Realised P&L","Fees","Volume"].map(h=><Lbl key={h}>{h}</Lbl>)}
            </div>
            <Div/>
            {PAIR_BREAKDOWN.map((p,i)=>(
              <div key={p.pair}>
                <div style={{display:"grid",gridTemplateColumns:"120px 70px 80px 100px 90px 100px",
                  padding:"11px 18px",gap:0,alignItems:"center",
                  background:i%2===0?"transparent":C.surfaceAlt+"60"}}>
                  <M size={12} weight={700}>{p.pair}</M>
                  <M size={11} color={C.textMid}>{p.trades}</M>
                  <M size={11} color={p.winRate>=60?C.green:C.amber}>{p.winRate.toFixed(1)}%</M>
                  <M size={11} color={p.pnl>=0?C.green:C.red} weight={700}>{fmt.usd(p.pnl)}</M>
                  <M size={11} color={C.textMuted}>{fmt.abs(p.fees)}</M>
                  <M size={11} color={C.textMid}>{fmt.abs(p.volume)}</M>
                </div>
                {i<PAIR_BREAKDOWN.length-1&&<Div/>}
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* TIMING TAB */}
      {tab==="timing"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <CardHeader title="Average P&L by Hour of Day" sub="EAT · Based on 175 closed trades"/>
            <div style={{padding:"8px 20px 16px"}}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={HOURLY_PNL} margin={{top:4,right:4,bottom:0,left:0}}>
                  <CartesianGrid stroke={C.borderSub} strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="h" tick={{fontFamily:mono,fontSize:8,fill:C.textMuted}} tickLine={false} axisLine={false}
                    tickFormatter={v=>v+"h"}/>
                  <YAxis tick={{fontFamily:mono,fontSize:8,fill:C.textMuted}} tickLine={false} axisLine={false}
                    tickFormatter={v=>(v>=0?"+":"")+v+"%"}/>
                  <Tooltip content={<CustomTooltip/>} formatter={v=>[(v>=0?"+":"")+v+"%","Avg P&L"]}/>
                  <ReferenceLine y={0} stroke={C.border}/>
                  <Bar dataKey="v" radius={[2,2,0,0]}>
                    {HOURLY_PNL.map((h,i)=><Cell key={i} fill={h.v>=0?C.green:C.red} opacity={Math.min(0.4+Math.abs(h.v)*0.12,0.95)}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Insight callouts */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {[
              {l:"Peak Hours",    v:"08:00–10:00 EAT", sub:"Highest average P&L", c:C.green},
              {l:"Avoid Hours",   v:"12:00–13:00 EAT", sub:"Consistent losses",   c:C.red},
              {l:"Total Trades",  v:"175 recorded",    sub:"Across 5 bots",       c:C.textPri},
            ].map(s=>(
              <div key={s.l} style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,
                borderLeft:`3px solid ${s.c}50`,borderRadius:4,padding:"14px 16px"}}>
                <Lbl>{s.l}</Lbl>
                <M size={14} color={s.c} weight={700} style={{display:"block",marginTop:6}}>{s.v}</M>
                <M size={9} color={C.textMuted} style={{display:"block",marginTop:3}}>{s.sub}</M>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPITAL PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function AllocationBar({allocated,max,color=C.green}) {
  const pct=Math.min((allocated/max)*100,100);
  return (
    <div style={{position:"relative",height:6,background:C.border,borderRadius:3,overflow:"hidden"}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:pct+"%",
        background:`linear-gradient(90deg,${color}90,${color})`,borderRadius:3,
        transition:"width 0.4s ease"}}/>
    </div>
  );
}

function ExchangeCard({ex, onConnect}) {
  const isConn=ex.status==="connected";
  const usedPct=ex.balance>0?(ex.allocated/ex.balance*100).toFixed(0):0;
  const logoColors={"B":"#F0B90B","A":"#FF5733","H":"#6C63FF","R":"#00C805"};
  const lc=logoColors[ex.logo];
  return (
    <Card>
      {/* Header */}
      <div style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:40,height:40,borderRadius:6,background:lc+"20",
          border:`1px solid ${lc}30`,display:"flex",alignItems:"center",justifyContent:"center",
          fontFamily:mono,fontSize:16,fontWeight:700,color:lc,flexShrink:0}}>{ex.logo}</div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <M size={13} weight={700}>{ex.name}</M>
            <Tag color={isConn?C.green:C.textMuted}>{isConn?"CONNECTED":"DISCONNECTED"}</Tag>
          </div>
          <Lbl>Last sync: {ex.lastSync}</Lbl>
        </div>
        {isConn?(
          <GhostBtn small>Manage</GhostBtn>
        ):(
          <PrimaryBtn small onClick={onConnect}>Connect</PrimaryBtn>
        )}
      </div>
      <Div/>

      {isConn?(
        <div style={{padding:"14px 18px"}}>
          {/* Balance summary */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px 0",marginBottom:14}}>
            <div>
              <Lbl>Total Balance</Lbl>
              <M size={18} color={C.textPri} weight={700} style={{display:"block",marginTop:4}}>{fmt.abs(ex.balance)}</M>
            </div>
            <div>
              <Lbl>Allocated</Lbl>
              <M size={18} color={C.green} weight={700} style={{display:"block",marginTop:4}}>{fmt.abs(ex.allocated)}</M>
            </div>
            <div>
              <Lbl>Available</Lbl>
              <M size={18} color={C.textMid} weight={700} style={{display:"block",marginTop:4}}>{fmt.abs(ex.available)}</M>
            </div>
          </div>

          {/* Allocation bar */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <Lbl>Allocation</Lbl>
              <M size={9} color={C.textMuted}>{usedPct}% of balance deployed</M>
            </div>
            <AllocationBar allocated={ex.allocated} max={ex.balance}/>
          </div>

          {/* Quick stats */}
          <div style={{display:"flex",gap:16,marginTop:12}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <Lbl>Bots</Lbl><M size={11} color={C.textPri}>{ex.bots}</M>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <Lbl>Pairs</Lbl><M size={11} color={C.textPri}>{ex.pairs}</M>
            </div>
            {ex.credentials.map(cr=>(
              <div key={cr.label} style={{display:"flex",alignItems:"center",gap:5}}>
                <Lbl>Key</Lbl>
                <Tag color={C.green}>{cr.status.toUpperCase()}</Tag>
              </div>
            ))}
          </div>
        </div>
      ):(
        <div style={{padding:"20px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <M size={11} color={C.textMuted}>No credentials configured</M>
          <M size={10} color={C.textDim}>Connect this exchange to trade with it</M>
        </div>
      )}
    </Card>
  );
}

function CapitalPage() {
  const [showAdd,setShowAdd]=useState(false);
  const [allocations,setAllocations]=useState(
    Object.fromEntries(BOT_ALLOCATIONS.map(b=>[b.botId,b.allocated]))
  );
  const totalBalance=EXCHANGES.filter(e=>e.status==="connected").reduce((s,e)=>s+e.balance,0);
  const totalAllocated=EXCHANGES.filter(e=>e.status==="connected").reduce((s,e)=>s+e.allocated,0);

  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <M size={16} weight={700} style={{letterSpacing:"0.04em",display:"block"}}>Capital</M>
          <M size={10} color={C.textMuted} style={{display:"block",marginTop:3}}>
            Manage exchange connections and bot allocations
          </M>
        </div>
        <PrimaryBtn small onClick={()=>setShowAdd(true)}>+ Add Exchange</PrimaryBtn>
      </div>

      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          {l:"Total Balance",    v:fmt.abs(totalBalance),                          c:C.textPri},
          {l:"Total Deployed",   v:fmt.abs(totalAllocated),                        c:C.green},
          {l:"Undeployed",       v:fmt.abs(totalBalance-totalAllocated),            c:C.textMid},
          {l:"Deployment Rate",  v:((totalAllocated/totalBalance)*100).toFixed(0)+"%", c:C.green},
        ].map(s=><StatBox key={s.l} label={s.l} value={s.v} color={s.c}/>)}
      </div>

      {/* Total allocation bar */}
      <Card style={{marginBottom:20,padding:"14px 18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <M size={11} weight={700}>Overall Capital Deployment</M>
          <M size={10} color={C.textMuted}>{fmt.abs(totalAllocated)} of {fmt.abs(totalBalance)}</M>
        </div>
        <AllocationBar allocated={totalAllocated} max={totalBalance}/>
        <div style={{display:"flex",gap:20,marginTop:10}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:8,height:8,borderRadius:2,background:C.green}}/>
            <M size={9} color={C.textMuted}>Allocated to bots</M>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:8,height:8,borderRadius:2,background:C.border}}/>
            <M size={9} color={C.textMuted}>Unallocated (available)</M>
          </div>
        </div>
      </Card>

      {/* Exchange cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
        {EXCHANGES.map(ex=>(
          <ExchangeCard key={ex.id} ex={ex} onConnect={()=>{}}/>
        ))}
      </div>

      {/* Bot Allocation Manager */}
      <Card>
        <CardHeader title="Bot Capital Allocations"
          sub="Adjust how much each bot can trade with"
          right={<M size={9} color={C.textMuted}>Changes apply on next bot cycle</M>}/>
        <div style={{padding:"0 0 4px"}}>
          {BOT_ALLOCATIONS.map((bot,i)=>{
            const alloc=allocations[bot.botId]||bot.allocated;
            const pct=((alloc/bot.maxAlloc)*100).toFixed(0);
            const statusColor={running:C.green,paused:C.amber,error:C.red}[bot.status]||C.textDim;
            return (
              <div key={bot.botId}>
                <div style={{padding:"16px 18px"}}>
                  {/* Bot header row */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:statusColor}}/>
                      <div>
                        <M size={12} weight={700}>{bot.botName}</M>
                        <M size={9} color={C.textMuted} style={{display:"block",marginTop:1}}>
                          {bot.strategy} · {bot.exchange}
                        </M>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:16}}>
                      <div style={{textAlign:"right"}}>
                        <Lbl>P&L</Lbl>
                        <M size={12} color={bot.pnl>=0?C.green:C.red} weight={700} style={{display:"block",marginTop:2}}>
                          {fmt.usd(bot.pnl)}
                        </M>
                      </div>
                      <div style={{textAlign:"right",minWidth:80}}>
                        <Lbl>Allocated</Lbl>
                        <M size={13} color={C.textPri} weight={700} style={{display:"block",marginTop:2}}>
                          {fmt.abs(alloc)}
                        </M>
                      </div>
                    </div>
                  </div>

                  {/* Slider */}
                  <div style={{position:"relative",marginBottom:8}}>
                    <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden",position:"relative"}}>
                      <div style={{position:"absolute",left:0,top:0,bottom:0,
                        width:pct+"%",background:`linear-gradient(90deg,${statusColor}80,${statusColor})`,
                        borderRadius:3,transition:"width 0.15s"}}/>
                    </div>
                    <input type="range" min={100} max={bot.maxAlloc} step={100}
                      value={alloc}
                      onChange={e=>setAllocations(a=>({...a,[bot.botId]:Number(e.target.value)}))}
                      style={{position:"absolute",top:"50%",transform:"translateY(-50%)",
                        left:0,right:0,width:"100%",appearance:"none",background:"transparent",
                        margin:0,padding:0,height:20,cursor:"pointer"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <Lbl>$100</Lbl>
                    <M size={9} color={C.textMuted}>{pct}% of max ({fmt.abs(bot.maxAlloc)})</M>
                    <Lbl>{fmt.abs(bot.maxAlloc)}</Lbl>
                  </div>
                </div>
                {i<BOT_ALLOCATIONS.length-1&&<Div/>}
              </div>
            );
          })}
          <div style={{padding:"14px 18px",display:"flex",justifyContent:"flex-end",
            borderTop:`1px solid ${C.borderSub}`}}>
            <PrimaryBtn>Save Allocations</PrimaryBtn>
          </div>
        </div>
      </Card>

      {/* Add exchange modal */}
      {showAdd&&(
        <>
          <div onClick={()=>setShowAdd(false)} style={{position:"fixed",inset:0,
            background:"rgba(0,0,0,0.6)",zIndex:199}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
            width:440,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,
            zIndex:200,animation:"slideIn 0.2s ease"}}>
            <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <M size={13} weight={700}>Add Exchange</M>
              <button onClick={()=>setShowAdd(false)} style={{background:"transparent",border:"none",
                color:C.textMuted,cursor:"pointer",fontFamily:mono,fontSize:18}}>×</button>
            </div>
            <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:12}}>
              {[
                {name:"Binance",    logo:"B",type:"API Key + Secret",   lc:"#F0B90B"},
                {name:"Alpaca",     logo:"A",type:"API Key + Secret",   lc:"#FF5733"},
                {name:"Hyperliquid",logo:"H",type:"WalletConnect",      lc:"#6C63FF"},
                {name:"Robinhood",  logo:"R",type:"OAuth 2.0",          lc:"#00C805"},
              ].map(ex=>(
                <button key={ex.name} onClick={()=>setShowAdd(false)} style={{
                  display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
                  background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:4,
                  cursor:"pointer",textAlign:"left",width:"100%",transition:"border-color 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=ex.lc+"60"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{width:36,height:36,borderRadius:4,background:ex.lc+"20",
                    border:`1px solid ${ex.lc}30`,display:"flex",alignItems:"center",
                    justifyContent:"center",fontFamily:mono,fontSize:14,fontWeight:700,color:ex.lc}}>
                    {ex.logo}
                  </div>
                  <div>
                    <M size={12} weight={700} style={{display:"block"}}>{ex.name}</M>
                    <Lbl>{ex.type}</Lbl>
                  </div>
                  <M size={12} color={C.textDim} style={{marginLeft:"auto"}}>→</M>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RISK PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function LimitControl({limit,onOverride}) {
  const [editing,setEditing]=useState(false);
  const effective=limit.user??limit.tier;
  const binding=limit.user?"user":limit.tier?"tier":"global";
  const bindingColor={user:C.green,tier:C.blue,global:C.textMuted}[binding];

  const usagePct=limit.current!==null&&effective
    ?Math.min((limit.current/effective)*100,100):null;
  const usageColor=usagePct===null?null:usagePct<60?C.green:usagePct<85?C.amber:C.red;

  return (
    <div style={{padding:"16px 18px"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
        <div style={{flex:1,marginRight:20}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <M size={12} weight={700}>{limit.label}</M>
            <Tag color={bindingColor}>{binding.toUpperCase()} LIMIT</Tag>
          </div>
          <M size={10} color={C.textMuted} style={{display:"block",lineHeight:1.5}}>{limit.desc}</M>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <Lbl>Effective Limit</Lbl>
          <M size={18} color={C.textPri} weight={700} style={{display:"block",marginTop:4}}>
            {effective!==null?(limit.unit==="$"?"$":"")+effective+(limit.unit!=="$"?limit.unit:""):"—"}
          </M>
        </div>
      </div>

      {/* Limit hierarchy */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        {[
          {l:"Global",v:limit.global,c:C.textDim},
          {l:"Tier",  v:limit.tier, c:C.blue},
          {l:"You",   v:limit.user, c:C.green},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,
            borderRadius:3,padding:"8px 10px"}}>
            <Lbl>{l}</Lbl>
            <M size={12} color={v!==null?c:C.textDim} weight={700} style={{display:"block",marginTop:3}}>
              {v!==null?(limit.unit==="$"?"$":"")+v+(limit.unit!=="$"?limit.unit:""):"Inherited"}
            </M>
          </div>
        ))}
      </div>

      {/* Usage bar */}
      {usagePct!==null&&(
        <div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <Lbl>Current Usage</Lbl>
            <M size={9} color={usageColor}>
              {limit.unit==="$"?"$":""}{limit.current}{limit.unit!=="$"?limit.unit:""} / {limit.unit==="$"?"$":""}{effective}{limit.unit!=="$"?limit.unit:""}
              {"  "}({usagePct.toFixed(0)}%)
            </M>
          </div>
          <div style={{height:5,background:C.border,borderRadius:3,overflow:"hidden"}}>
            <div style={{width:usagePct+"%",height:"100%",
              background:`linear-gradient(90deg,${usageColor}80,${usageColor})`,
              borderRadius:3,transition:"width 0.4s"}}/>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:8}}>
        <GhostBtn small onClick={()=>setEditing(!editing)}>
          {editing?"Cancel":"Override for Me"}
        </GhostBtn>
        {limit.user!==null&&<GhostBtn small>Reset to Tier Default</GhostBtn>}
      </div>

      {editing&&(
        <div style={{marginTop:12,background:C.surfaceAlt,border:`1px solid ${C.border}`,
          borderRadius:4,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-end"}}>
          <div style={{flex:1}}>
            <Lbl style={{display:"block",marginBottom:6}}>Set Personal Override</Lbl>
            <input type="number" placeholder={String(effective)}
              style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:3,
                padding:"8px 12px",fontFamily:mono,fontSize:12,color:C.textPri,outline:"none"}}
              onFocus={e=>e.target.style.borderColor=C.green}
              onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
          <PrimaryBtn small onClick={()=>setEditing(false)}>Save</PrimaryBtn>
        </div>
      )}
    </div>
  );
}

function RiskPage() {
  const currentDrawdown=3.2;
  const tierLimit=15;
  const userDrawdown=null;
  const effectiveDD=userDrawdown??tierLimit;

  const sev={high:C.red,medium:C.amber,low:C.green};

  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <M size={16} weight={700} style={{letterSpacing:"0.04em",display:"block"}}>Risk</M>
          <M size={10} color={C.textMuted} style={{display:"block",marginTop:3}}>
            Limits, drawdown monitoring, circuit breakers
          </M>
        </div>
        <Tag color={C.green}>ALL SYSTEMS NORMAL</Tag>
      </div>

      {/* Top row: drawdown gauge + summary */}
      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16,marginBottom:18}}>
        {/* Gauge */}
        <Card style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 18px",gap:8}}>
          <M size={11} weight={700} style={{letterSpacing:"0.06em",alignSelf:"flex-start"}}>Portfolio Drawdown</M>
          <Lbl style={{alignSelf:"flex-start",marginBottom:8}}>From peak equity · Limit: {effectiveDD}%</Lbl>
          <DrawdownGauge value={currentDrawdown} max={effectiveDD}/>
          <div style={{width:"100%",marginTop:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <Lbl>Drawdown Safety</Lbl>
              <M size={9} color={C.green}>{(effectiveDD-currentDrawdown).toFixed(1)}% buffer remaining</M>
            </div>
            <div style={{height:5,background:C.border,borderRadius:3,overflow:"hidden"}}>
              <div style={{width:((currentDrawdown/effectiveDD)*100)+"%",height:"100%",
                background:`linear-gradient(90deg,${C.green}80,${C.green})`,borderRadius:3}}/>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
          {[
            {l:"Current Drawdown",    v:currentDrawdown.toFixed(1)+"%",  c:C.green,  sub:"Healthy · 11.8% buffer"},
            {l:"Tier Limit",          v:tierLimit+"%",                   c:C.blue,   sub:"Stella Unum default"},
            {l:"Circuit Breaks",      v:"3 total",                       c:C.textPri,sub:"All resolved"},
            {l:"Last Breaker",        v:"Feb 14",                        c:C.amber,  sub:"Drawdown breach · auto-resolved"},
            {l:"Open Positions",      v:"4 live",                        c:C.textPri,sub:"3 profitable"},
            {l:"Risk Score",          v:"LOW",                           c:C.green,  sub:"Based on exposure + drawdown"},
          ].map(s=><StatBox key={s.l} label={s.l} value={s.v} color={s.c} sub={s.sub}/>)}
        </div>
      </div>

      {/* Limit controls */}
      <Card style={{marginBottom:18}}>
        <CardHeader title="Risk Limit Configuration" sub="Personal overrides override tier defaults, which override global defaults"/>
        {LIMIT_TYPES.map((limit,i)=>(
          <div key={limit.key}>
            <LimitControl limit={limit} onOverride={()=>{}}/>
            {i<LIMIT_TYPES.length-1&&<Div/>}
          </div>
        ))}
      </Card>

      {/* Circuit breaker log */}
      <Card>
        <CardHeader title="Circuit Breaker History" sub="Events auto-resolve after cooldown or by admin/user action"/>
        <div style={{display:"grid",
          gridTemplateColumns:"130px 140px 90px 80px 80px 100px 110px 100px",
          padding:"9px 18px",gap:0}}>
          {["Bot","Trigger","Severity","DD%","Threshold","P&L Impact","Resolved By","Date"].map(h=><Lbl key={h}>{h}</Lbl>)}
        </div>
        <Div/>
        {CIRCUIT_BREAKER_LOG.map((ev,i)=>(
          <div key={ev.id}>
            <div style={{display:"grid",
              gridTemplateColumns:"130px 140px 90px 80px 80px 100px 110px 100px",
              padding:"11px 18px",gap:0,alignItems:"center",
              background:i%2===0?"transparent":C.surfaceAlt+"60"}}>
              <M size={11} weight={600}>{ev.bot}</M>
              <Tag color={sev[ev.severity]}>{ev.trigger.replace(/_/g," ").toUpperCase()}</Tag>
              <Tag color={sev[ev.severity]}>{ev.severity.toUpperCase()}</Tag>
              <M size={11} color={C.red}>{ev.triggerVal}%</M>
              <M size={11} color={C.textMid}>{ev.threshold}%</M>
              <M size={11} color={ev.impact<0?C.red:C.textMid} weight={700}>
                {ev.impact!==0?fmt.usd(ev.impact):"—"}
              </M>
              <Tag color={ev.resolvedBy==="manual"?C.green:C.textMid}>
                {ev.resolvedBy==="manual"?"MANUAL":"AUTO · "+ev.cooldown}
              </Tag>
              <M size={9} color={C.textMuted}>{ev.resolvedAt}</M>
            </div>
            {i<CIRCUIT_BREAKER_LOG.length-1&&<Div/>}
          </div>
        ))}
        <div style={{padding:"12px 18px",borderTop:`1px solid ${C.borderSub}`,
          background:C.greenDim,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:C.green}}/>
          <M size={10} color={C.green}>No active circuit breakers · All bots trading normally</M>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED SHELL
// ═══════════════════════════════════════════════════════════════════════════════

const NAV=[
  {key:"dashboard", label:"Dashboard", icon:"▦"},
  {key:"bots",      label:"My Bots",   icon:"⟳",badge:5},
  {key:"strategies",label:"Strategies",icon:"◈"},
  {key:"positions", label:"Positions", icon:"⊞",badge:4},
  {key:"analytics", label:"Analytics", icon:"∿"},
  {key:"capital",   label:"Capital",   icon:"◎"},
  {key:"risk",      label:"Risk",      icon:"⚡"},
];
const NAV_B=[
  {key:"billing",label:"Billing",icon:"⊛"},
  {key:"account",label:"Account",icon:"⊙"},
  {key:"help",   label:"Help",   icon:"?"},
];

function Sidebar({active,setActive}) {
  return (
    <div style={{width:200,minHeight:"100vh",background:C.sidebar,
      borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",
      flexShrink:0,position:"sticky",top:0}}>
      <div style={{height:52,display:"flex",alignItems:"center",padding:"0 16px",
        borderBottom:`1px solid ${C.border}`,gap:10}}>
        <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
          background:`linear-gradient(135deg,${C.green},#00B87A)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:12,fontWeight:800,color:"#0A0D14",fontFamily:mono}}>S</div>
        <M size={13} weight={700} style={{letterSpacing:"0.14em"}}>STELLA</M>
      </div>
      <nav style={{flex:1,padding:"10px 0"}}>
        {NAV.map(item=>{
          const a=active===item.key;
          return (
            <button key={item.key} onClick={()=>setActive(item.key)} style={{
              width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 16px",
              background:a?`${C.green}10`:"transparent",border:"none",
              borderLeft:`2px solid ${a?C.green:"transparent"}`,cursor:"pointer"}}>
              <span style={{fontSize:13,color:a?C.green:C.textMuted,fontFamily:mono}}>{item.icon}</span>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flex:1}}>
                <M size={11} color={a?C.green:C.textMid} weight={a?700:500}>{item.label}</M>
                {item.badge&&(
                  <span style={{background:a?C.green:C.border,color:a?"#0A0D14":C.textMuted,
                    borderRadius:10,padding:"1px 6px",fontFamily:mono,fontSize:9,fontWeight:700}}>
                    {item.badge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        <Div my={10}/>
        {NAV_B.map(item=>(
          <button key={item.key} onClick={()=>setActive(item.key)} style={{
            width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 16px",
            background:"transparent",border:"none",borderLeft:"2px solid transparent",cursor:"pointer"}}>
            <span style={{fontSize:12,color:C.textDim,fontFamily:mono}}>{item.icon}</span>
            <M size={11} color={C.textMuted}>{item.label}</M>
          </button>
        ))}
      </nav>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`}}>
        <div style={{background:C.greenDim,border:`1px solid ${C.greenMid}`,borderRadius:3,padding:"8px 10px"}}>
          <Lbl style={{display:"block",marginBottom:3}}>Stella Unum</Lbl>
          <M size={9} color={C.textMuted}>3 bots · $16,600 deployed</M>
        </div>
      </div>
    </div>
  );
}

function Topbar({page}) {
  const labels={positions:"Positions",analytics:"Analytics",capital:"Capital",risk:"Risk"};
  return (
    <div style={{height:52,display:"flex",alignItems:"center",padding:"0 24px",gap:16,
      background:C.sidebar,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
        <Lbl>Portal</Lbl>
        <M color={C.textDim}>/</M>
        <M size={11} color={C.textPri} weight={600}>{labels[page]||page}</M>
      </div>
      <div style={{width:8,height:8,borderRadius:"50%",background:C.amber}}/>
      <M size={9} color={C.amber} weight={700} caps style={{letterSpacing:"0.1em"}}>KYC Under Review</M>
      <div style={{width:30,height:30,borderRadius:"50%",background:`${C.green}25`,
        border:`1px solid ${C.green}40`,display:"flex",alignItems:"center",
        justifyContent:"center",cursor:"pointer"}}>
        <M size={11} color={C.green} weight={700}>JD</M>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════

export default function StellaPortalPages() {
  const [page,setPage]=useState("positions");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:${C.surface}}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        ::-webkit-scrollbar-thumb:hover{background:${C.textDim}}
        @keyframes slideIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.7);opacity:0}}
        input[type=range]{-webkit-appearance:none;appearance:none}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;
          border-radius:50%;background:${C.green};border:2px solid ${C.bg};cursor:pointer;
          box-shadow:0 0 6px ${C.green}50}
        input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
          background:${C.green};border:2px solid ${C.bg};cursor:pointer}
        button:focus,input:focus{outline:none}
        select option{background:${C.surface}}
      `}</style>

      <div style={{display:"flex",minHeight:"100vh",background:C.bg}}>
        <Sidebar active={page} setActive={setPage}/>
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          <Topbar page={page}/>

          {/* Sub-nav tabs */}
          <div style={{background:C.sidebar,borderBottom:`1px solid ${C.border}`,
            padding:"0 24px",display:"flex",gap:0}}>
            {[
              {k:"positions", l:"Positions",  n:OPEN_POSITIONS.length+" open"},
              {k:"analytics", l:"Analytics",  n:"175 trades"},
              {k:"capital",   l:"Capital",    n:fmt.abs(16600)+" deployed"},
              {k:"risk",      l:"Risk",       n:"3 limits active"},
            ].map(p=>(
              <button key={p.k} onClick={()=>setPage(p.k)} style={{
                padding:"10px 20px",background:"transparent",border:"none",
                borderBottom:`2px solid ${page===p.k?C.green:"transparent"}`,
                fontFamily:mono,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",
                color:page===p.k?C.green:C.textMuted,cursor:"pointer",
                fontWeight:page===p.k?700:500,display:"flex",alignItems:"center",gap:8,
              }}>
                {p.l}
                <span style={{background:page===p.k?C.greenDim:C.border,
                  border:`1px solid ${page===p.k?C.greenMid:C.border}`,
                  color:page===p.k?C.green:C.textMuted,
                  borderRadius:2,padding:"1px 7px",fontSize:8,fontWeight:700}}>{p.n}</span>
              </button>
            ))}
          </div>

          <div style={{flex:1,padding:"20px 24px",overflowY:"auto"}}>
            {page==="positions"&&<PositionsPage/>}
            {page==="analytics"&&<AnalyticsPage/>}
            {page==="capital"&&<CapitalPage/>}
            {page==="risk"&&<RiskPage/>}
          </div>
        </div>
      </div>
    </>
  );
}
