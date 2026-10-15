"use client";

import { useState } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from "recharts";

// Design tokens mapped to CSS variables (theme-aware)
const C = {
  bg:         'var(--color-background)',
  surface:    'var(--color-card)',
  surfaceAlt: 'var(--color-muted)',
  surfaceHov: 'var(--color-surface-alt)',
  border:     'var(--color-border)',
  borderSub:  'var(--color-border-subtle)',
  green:      'var(--color-primary)',
  greenDim:   'var(--color-green-dim)',
  greenMid:   'var(--color-green-mid)',
  red:        'var(--color-destructive)',
  redDim:     '#F04F5915',
  amber:      'var(--color-warning)',
  amberDim:   '#F59E0B15',
  textPri:    'var(--color-foreground)',
  textMid:    'var(--color-text-secondary)',
  textMuted:  'var(--color-muted-foreground)',
  textDim:    'var(--color-text-quaternary)',
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

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

const fmt = {
  usd:  (v: number) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  abs:  (v: number) => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 }),
  pct:  (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%",
  num:  (v?: number) => v?.toLocaleString() ?? "—",
};

// Helper components using Tailwind
function M({ size='text-xs', color='text-foreground', weight='font-medium', caps=false, className='', children }: any) {
  return <span className={`${size} ${color} ${weight} ${caps ? 'uppercase tracking-wider' : 'tracking-wide'} ${className}`}>{children}</span>;
}

function Lbl({ children, className='' }: any) {
  return <span className={`text-[9px] text-muted-foreground font-semibold uppercase tracking-widest ${className}`}>{children}</span>;
}

function Divider({ my=0 }) {
  return <div className="h-px bg-[var(--color-border-subtle)]" style={{ margin: `${my}px 0` }} />;
}

function Badge({ children, variant='primary', dot=false, className='' }: any) {
  const variantClasses = {
    primary: 'bg-status-running-dim border-status-running text-status-running',
    warning: 'bg-status-paused-dim border-status-paused text-status-paused',
    error: 'bg-status-error-dim border-status-error text-status-error',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${variantClasses[variant as keyof typeof variantClasses] || variantClasses.primary} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full inline-block ${variant === 'primary' ? 'bg-status-running' : variant === 'warning' ? 'bg-[#F59E0B]' : 'bg-destructive'}`} />}
      {children}
    </span>
  );
}

const statusMeta = {
  running: { label:"RUNNING", pulse:true, colorClass: 'bg-status-running', pulseClass: 'bg-status-running-mid'  },
  paused:  { label:"PAUSED",  pulse:false, colorClass: 'bg-[#F59E0B]', pulseClass: '' },
  error:   { label:"ERROR",   pulse:false, colorClass: 'bg-destructive', pulseClass: '' },
  stopped: { label:"STOPPED", pulse:false, colorClass: 'bg-muted-foreground', pulseClass: '' },
};

function StatusDot({ status }: any) {
  const m = statusMeta[status as keyof typeof statusMeta]||statusMeta.stopped;
  return (
    <span className="relative inline-flex w-2 h-2 items-center justify-center">
      {m.pulse && <span className={`absolute w-3.5 h-3.5 rounded-full animate-ping ${m.pulseClass}`} />}
      <span className={`w-1.5 h-1.5 rounded-full block ${m.colorClass}`} />
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

// ═══════════════════════════════════════════════════════════════════════════════
// BOT DETAIL PANEL
// ═══════════════════════════════════════════════════════════════════════════════

function BotDetailPanel({ bot, onClose }: any) {
  const [tab, setTab] = useState("overview");
  const eq = BOT_EQUITY[bot.id as keyof typeof BOT_EQUITY] || [];
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
            <Badge color={statusMeta[bot.status as keyof typeof statusMeta].color}>{statusMeta[bot.status as keyof typeof statusMeta].label}</Badge>
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
                      <Tooltip content={<ChartTooltip />} formatter={(v: any)=>[fmt.abs(v),"Equity"]} />
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
// BOTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function BotsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedBot, setSelectedBot] = useState<any>(null);
  const [botStates, setBotStates] = useState(
    Object.fromEntries(BOTS.map(b=>[b.id, b.status]))
  );

  const toggleBot = (id: string, e: any) => {
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.6;} 50%{transform:scale(1.7);opacity:0;} }
        @keyframes slideIn { from{transform:translateX(30px);opacity:0;} to{transform:none;opacity:1;} }
      `}</style>

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
          const meta = statusMeta[st as keyof typeof statusMeta];
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
                    <span style={{ padding:"4px 8px", background:C.redDim,
                      border:`1px solid ${C.red}35`, borderRadius:3, fontFamily:mono,
                      fontSize:8, color:C.red, letterSpacing:"0.1em", fontWeight:700 }}>ERR</span>
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
