"use client";

import { useState } from "react";

// DESIGN TOKENS
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
  blue:       "#3B82F6",
  textPri:    "#C8CDE0",
  textMid:    "#A0AAC0",
  textMuted:  "#8B95B0",
  textDim:    "#6A7590",
};
const mono = "'JetBrains Mono', 'Fira Code', monospace";

// MOCK DATA
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
  { key:"max_leverage",        label:"Max Leverage",      unit:"x",   global:10, tier:2, user:null, current:1, desc:"Maximum leverage multiplier across all positions." },
  { key:"max_open_positions",  label:"Max Open Positions",unit:"",    global:100, tier:10, user:null, current:4, desc:"Maximum concurrent open positions platform-wide." },
];

// FORMAT HELPERS
const fmt = {
  usd:  (v: number) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  abs:  (v: number) => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 }),
  pct:  (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%",
};

// COMPONENTS
function M({ size=11, color=C.textPri, weight=500, caps=false, style={}, children }: any) {
  return <span style={{ fontFamily:mono, fontSize:size, color, fontWeight:weight,
    letterSpacing:caps?"0.11em":"0.03em", textTransform:caps?"uppercase":"none" as any, ...style }}>{children}</span>;
}

function Lbl({ children, color=C.textMuted, style={} }: any) {
  return <M size={9} color={color} weight={600} caps style={{ letterSpacing:"0.13em", ...style }}>{children}</M>;
}

function Div() {
  return <div style={{ height:1, background:C.borderSub }} />;
}

function Tag({ children, color=C.green }: any) {
  return <span style={{ background:color+"18", border:`1px solid ${color}35`, borderRadius:2,
    padding:"2px 7px", fontFamily:mono, fontSize:9, color, fontWeight:700, letterSpacing:"0.1em" }}>{children}</span>;
}

function Card({ children, style={} }: any) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, ...style }}>{children}</div>;
}

function CardHeader({ title, sub }: any) {
  return (
    <>
      <div style={{ padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <M size={11} weight={700} style={{ letterSpacing:"0.06em", display:"block" }}>{title}</M>
          {sub && <Lbl style={{ marginTop:3 }}>{sub}</Lbl>}
        </div>
      </div>
      <Div />
    </>
  );
}

function StatBox({ label, value, color=C.textPri, sub="" }: any) {
  return (
    <div style={{ padding:"14px 18px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:4 }}>
      <Lbl>{label}</Lbl>
      <M size={20} color={color} weight={700} style={{ display:"block", marginTop:6, lineHeight:1 }}>{value}</M>
      {sub && <M size={9} color={C.textMuted} style={{ display:"block", marginTop:4 }}>{sub}</M>}
    </div>
  );
}

function DrawdownGauge({ value, max }: any) {
  const pct = Math.min(value / max, 1);
  const color = pct < 0.5 ? C.green : pct < 0.75 ? C.amber : C.red;
  const angle = pct * 180;
  const r = 70, cx = 90, cy = 90;
  const toRad = (d: number) => (d - 180) * Math.PI / 180;
  const sx = cx + r * Math.cos(toRad(0));
  const sy = cy + r * Math.sin(toRad(0));
  const ex = cx + r * Math.cos(toRad(angle));
  const ey = cy + r * Math.sin(toRad(angle));
  const large = angle > 180 ? 1 : 0;
  const bgEx = cx + r * Math.cos(toRad(180));
  const bgEy = cy + r * Math.sin(toRad(180));

  return (
    <svg width="180" height="100" viewBox="0 0 180 100">
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 1 1 ${bgEx} ${bgEy}`}
        fill="none" stroke={C.border} strokeWidth="10" strokeLinecap="round" />
      {pct > 0 && <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`}
        fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        style={{ transition:"stroke-dasharray 0.5s" }} />}
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

function LimitControl({ limit }: any) {
  const [editing, setEditing] = useState(false);
  const effective = limit.user ?? limit.tier;
  const binding = limit.user ? "user" : limit.tier ? "tier" : "global";
  const bindingColor = { user: C.green, tier: C.blue, global: C.textMuted }[binding];

  const usagePct = limit.current !== null && effective
    ? Math.min((limit.current / effective) * 100, 100) : null;
  const usageColor = usagePct === null ? null : usagePct < 60 ? C.green : usagePct < 85 ? C.amber : C.red;

  return (
    <div style={{ padding:"16px 18px" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ flex:1, marginRight:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <M size={12} weight={700}>{limit.label}</M>
            <Tag color={bindingColor}>{binding.toUpperCase()} LIMIT</Tag>
          </div>
          <M size={10} color={C.textMuted} style={{ display:"block", lineHeight:1.5 }}>{limit.desc}</M>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <Lbl>Effective Limit</Lbl>
          <M size={18} color={C.textPri} weight={700} style={{ display:"block", marginTop:4 }}>
            {effective !== null ? (limit.unit === "$" ? "$" : "") + effective + (limit.unit !== "$" ? limit.unit : "") : "—"}
          </M>
        </div>
      </div>

      {/* Limit hierarchy */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
        {[
          { l:"Global", v:limit.global, c:C.textDim },
          { l:"Tier",   v:limit.tier,   c:C.blue },
          { l:"You",    v:limit.user,   c:C.green },
        ].map(({ l, v, c }) => (
          <div key={l} style={{
            background:C.surfaceAlt, border:`1px solid ${C.border}`,
            borderRadius:3, padding:"8px 10px"
          }}>
            <Lbl>{l}</Lbl>
            <M size={12} color={v !== null ? c : C.textDim} weight={700} style={{ display:"block", marginTop:3 }}>
              {v !== null ? (limit.unit === "$" ? "$" : "") + v + (limit.unit !== "$" ? limit.unit : "") : "Inherited"}
            </M>
          </div>
        ))}
      </div>

      {/* Usage bar */}
      {usagePct !== null && (
        <div style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <Lbl>Current Usage</Lbl>
            <M size={9} color={usageColor}>
              {limit.current !== null ? (limit.unit === "$" ? "$" : "") + limit.current + (limit.unit !== "$" ? limit.unit : "") : "—"}
              {" · "}
              {usagePct.toFixed(0)}% of limit
            </M>
          </div>
          <div style={{ height:6, background:C.border, borderRadius:3, overflow:"hidden" }}>
            <div style={{
              width: usagePct + "%", height:"100%",
              background: `linear-gradient(90deg, ${usageColor}80, ${usageColor})`,
              borderRadius:3, transition:"width 0.3s"
            }} />
          </div>
        </div>
      )}

      {/* Override button */}
      <button onClick={() => setEditing(!editing)} style={{
        background:"transparent", border:`1px solid ${C.border}`,
        borderRadius:3, padding:"6px 14px", fontFamily:mono,
        fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
        color:C.textMuted, cursor:"pointer", fontWeight:600
      }}>
        {limit.user !== null ? "Edit Override" : "Set Personal Override"}
      </button>
    </div>
  );
}

export default function RiskPage() {
  const currentDrawdown = 3.2;
  const tierLimit = 15;
  const userDrawdown = null;
  const effectiveDD = userDrawdown ?? tierLimit;

  const sev = { high: C.red, medium: C.amber, low: C.green };

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      `}</style>

      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>Risk</M>
          <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>
            Limits, drawdown monitoring, circuit breakers
          </M>
        </div>
        <Tag color={C.green}>ALL SYSTEMS NORMAL</Tag>
      </div>

      {/* Top row: drawdown gauge + summary */}
      <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap:16, marginBottom:18 }}>
        {/* Gauge */}
        <Card style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"20px 18px", gap:8 }}>
          <M size={11} weight={700} style={{ letterSpacing:"0.06em", alignSelf:"flex-start" }}>Portfolio Drawdown</M>
          <Lbl style={{ alignSelf:"flex-start", marginBottom:8 }}>From peak equity · Limit: {effectiveDD}%</Lbl>
          <DrawdownGauge value={currentDrawdown} max={effectiveDD} />
          <div style={{ width:"100%", marginTop:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <Lbl>Drawdown Safety</Lbl>
              <M size={9} color={C.green}>{(effectiveDD - currentDrawdown).toFixed(1)}% buffer remaining</M>
            </div>
            <div style={{ height:5, background:C.border, borderRadius:3, overflow:"hidden" }}>
              <div style={{
                width: ((currentDrawdown / effectiveDD) * 100) + "%", height:"100%",
                background: `linear-gradient(90deg, ${C.green}80, ${C.green})`, borderRadius:3
              }} />
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
          {[
            { l:"Current Drawdown",    v:currentDrawdown.toFixed(1)+"%",  c:C.green,  sub:"Healthy · 11.8% buffer" },
            { l:"Tier Limit",          v:tierLimit+"%",                   c:C.blue,   sub:"Stella Unum default" },
            { l:"Circuit Breaks",      v:"3 total",                       c:C.textPri, sub:"All resolved" },
            { l:"Last Breaker",        v:"Feb 14",                        c:C.amber,  sub:"Drawdown breach · auto-resolved" },
            { l:"Open Positions",      v:"4 live",                        c:C.textPri, sub:"3 profitable" },
            { l:"Risk Score",          v:"LOW",                           c:C.green,  sub:"Based on exposure + drawdown" },
          ].map(s => <StatBox key={s.l} label={s.l} value={s.v} color={s.c} sub={s.sub} />)}
        </div>
      </div>

      {/* Limit controls */}
      <Card style={{ marginBottom:18 }}>
        <CardHeader title="Risk Limit Configuration" sub="Personal overrides override tier defaults, which override global defaults" />
        {LIMIT_TYPES.map((limit, i) => (
          <div key={limit.key}>
            <LimitControl limit={limit} />
            {i < LIMIT_TYPES.length - 1 && <Div />}
          </div>
        ))}
      </Card>

      {/* Circuit breaker log */}
      <Card>
        <CardHeader title="Circuit Breaker History" sub="Events auto-resolve after cooldown or by admin/user action" />
        <div style={{
          display:"grid",
          gridTemplateColumns:"130px 140px 90px 80px 80px 100px 110px 100px",
          padding:"9px 18px", gap:0
        }}>
          {["Bot", "Trigger", "Severity", "DD%", "Threshold", "P&L Impact", "Resolved By", "Date"].map(h => <Lbl key={h}>{h}</Lbl>)}
        </div>
        <Div />
        {CIRCUIT_BREAKER_LOG.map((ev, i) => (
          <div key={ev.id}>
            <div style={{
              display:"grid",
              gridTemplateColumns:"130px 140px 90px 80px 80px 100px 110px 100px",
              padding:"11px 18px", gap:0, alignItems:"center",
              background: i % 2 === 0 ? "transparent" : C.surfaceAlt + "60"
            }}>
              <M size={11} weight={600}>{ev.bot}</M>
              <Tag color={sev[ev.severity as keyof typeof sev]}>{ev.trigger.replace(/_/g, " ").toUpperCase()}</Tag>
              <Tag color={sev[ev.severity as keyof typeof sev]}>{ev.severity.toUpperCase()}</Tag>
              <M size={11} color={C.red}>{ev.triggerVal}%</M>
              <M size={11} color={C.textMid}>{ev.threshold}%</M>
              <M size={11} color={ev.impact < 0 ? C.red : C.textMid} weight={700}>
                {ev.impact !== 0 ? fmt.usd(ev.impact) : "—"}
              </M>
              <Tag color={ev.resolvedBy === "manual" ? C.green : C.textMid}>
                {ev.resolvedBy === "manual" ? "MANUAL" : "AUTO · " + ev.cooldown}
              </Tag>
              <M size={9} color={C.textMuted}>{ev.resolvedAt}</M>
            </div>
            {i < CIRCUIT_BREAKER_LOG.length - 1 && <Div />}
          </div>
        ))}
        <div style={{
          padding:"12px 18px", borderTop:`1px solid ${C.borderSub}`,
          background:C.greenDim, display:"flex", alignItems:"center", gap:10
        }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:C.green }} />
          <M size={10} color={C.green}>No active circuit breakers · All bots trading normally</M>
        </div>
      </Card>
    </div>
  );
}
