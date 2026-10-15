import { useState, useRef } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════════
const C = {
  bg:"#0B0D11",         surface:"#12151C",    surfaceAlt:"#0E111A",
  surfaceHov:"#161B26", border:"#1C2338",      borderSub:"#161B28",
  green:"#00E5A0",      greenDim:"#00E5A012",  greenMid:"#00E5A035",
  red:"#F04F59",        redDim:"#F04F5912",    redMid:"#F04F5935",
  amber:"#F59E0B",      amberDim:"#F59E0B12",  amberMid:"#F59E0B35",
  blue:"#3B82F6",       blueDim:"#3B82F612",   blueMid:"#3B82F635",
  purple:"#A78BFA",     purpleDim:"#A78BFA12",
  cyan:"#06B6D4",       cyanDim:"#06B6D412",
  textPri:"#C8CDE0",    textMid:"#6B7590",     textMuted:"#4A5578",  textDim:"#2A3050",
  sidebar:"#0E111A",
};
const mono = "'JetBrains Mono','Fira Code',monospace";

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

const INVOICES = [
  { id:"INV-0024", type:"subscription",    status:"paid",    amount:49.00, date:"Feb 01 2026", period:"Feb 1–28",  method:"stripe",       stripe:"pi_3Abc" },
  { id:"INV-0023", type:"performance_fee", status:"paid",    amount:124.80,date:"Feb 01 2026", period:"Jan billing",method:"stripe",       stripe:"pi_2Xyz" },
  { id:"INV-0022", type:"subscription",    status:"paid",    amount:49.00, date:"Jan 01 2026", period:"Jan 1–31",  method:"stripe",       stripe:"pi_1Def" },
  { id:"INV-0021", type:"performance_fee", status:"paid",    amount:88.40, date:"Jan 01 2026", period:"Dec billing",method:"pegpay_momo", ref:"PEG-88123" },
  { id:"INV-0020", type:"subscription",    status:"paid",    amount:49.00, date:"Dec 01 2025", period:"Dec 1–31",  method:"stripe",       stripe:"pi_0Ghi" },
  { id:"INV-0019", type:"subscription",    status:"refunded",amount:49.00, date:"Nov 01 2025", period:"Nov 1–30",  method:"stripe",       stripe:"pi_9Jkl" },
];

const PERF_SNAPSHOTS = [
  { period:"Feb 2026", realPnl:832.00, hwmStart:9800, hwmEnd:11240, profitAboveHwm:624.00, feePct:15, feeUsd:93.60,  finalized:false },
  { period:"Jan 2026", realPnl:558.60, hwmStart:9400, hwmEnd:9800,  profitAboveHwm:400.00, feePct:15, feeUsd:60.00,  finalized:true  },
  { period:"Dec 2025", realPnl:392.00, hwmStart:9100, hwmEnd:9400,  profitAboveHwm:300.00, feePct:15, feeUsd:45.00,  finalized:true  },
];

const EQUITY_HISTORY = [
  {d:"Jan 1",v:9400},{d:"Jan 8",v:9620},{d:"Jan 15",v:9580},{d:"Jan 22",v:9760},{d:"Feb 1",v:9800},
  {d:"Feb 5",v:10100},{d:"Feb 10",v:10340},{d:"Feb 15",v:10580},{d:"Feb 19",v:11240},
];

const SESSIONS = [
  { id:1, device:"Chrome 122 · Windows 11",    location:"Kampala, UG",       ip:"197.162.xx.xx", lastActive:"Now · current session",    current:true  },
  { id:2, device:"Stella iOS App 2.1 · iPhone", location:"Kampala, UG",       ip:"197.162.xx.xx", lastActive:"2 hours ago",               current:false },
  { id:3, device:"Firefox 124 · macOS",         location:"Nairobi, KE",        ip:"105.163.xx.xx", lastActive:"3 days ago",                current:false },
];

const ACTIVITY_LOG = [
  { action:"Login",              detail:"Chrome · Kampala",     time:"Just now",     icon:"→", color:C.textMid },
  { action:"Bot paused",         detail:"Impulse Scalper",      time:"2h ago",       icon:"⏸", color:C.amber   },
  { action:"API Key validated",  detail:"Binance · Main API",   time:"5h ago",       icon:"✓", color:C.green   },
  { action:"Position force-closed",detail:"ETH/USDT short",    time:"Yesterday",    icon:"⏹", color:C.red     },
  { action:"Tier upgraded",      detail:"Stella One → Unum",   time:"Feb 1",        icon:"↑", color:C.green   },
  { action:"KYC submitted",      detail:"Enhanced level",       time:"Jan 28",       icon:"⊙", color:C.blue    },
];

const EXCHANGE_CREDENTIALS = [
  {
    id:"cred-1", exchange:"Binance", logo:"B", lc:"#F0B90B",
    label:"Main API", status:"active", authType:"api_key_secret",
    permissions:["read","trade"], isSandbox:false,
    lastValidated:"2h ago", lastUsed:"4m ago", connectedAt:"Feb 01 2026",
    validationError:null, latencyMs:42,
    ipWhitelist:["197.162.45.120"],
    keyPreview:"BNBX…K9Q2",
  },
  {
    id:"cred-2", exchange:"Alpaca", logo:"A", lc:"#FF5733",
    label:"Paper Key", status:"active", authType:"api_key_secret",
    permissions:["read","trade"], isSandbox:true,
    lastValidated:"5h ago", lastUsed:"2h ago", connectedAt:"Feb 10 2026",
    validationError:null, latencyMs:88,
    ipWhitelist:[],
    keyPreview:"ALPC…F7R1",
  },
  {
    id:"cred-3", exchange:"Binance", logo:"B", lc:"#F0B90B",
    label:"Futures Key", status:"failed_validation", authType:"api_key_secret",
    permissions:["read","trade","futures"], isSandbox:false,
    lastValidated:"3d ago", lastUsed:"3d ago", connectedAt:"Jan 15 2026",
    validationError:"API key permissions changed — futures trading not enabled on exchange side",
    latencyMs:null,
    ipWhitelist:[],
    keyPreview:"BNBY…M3P8",
  },
];

const EXCHANGE_ADAPTER_CONFIG = {
  "cred-1": {
    minOrderUsd:10, maxOrderUsd:5000,
    rateLimitOrders:50, rateLimitQueries:120,
    enabledPairs:["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT"],
    allPairs:["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","ADA/USDT","XRP/USDT","DOGE/USDT","AVAX/USDT"],
    maxLeverage:1,
    stopLossDefault:3.0, takeProfitDefault:5.0,
    trailingStopEnabled:false,
  },
  "cred-2": {
    minOrderUsd:1, maxOrderUsd:2000,
    rateLimitOrders:60, rateLimitQueries:200,
    enabledPairs:["BTC/USDT","ETH/USDT"],
    allPairs:["BTC/USDT","ETH/USDT","SOL/USDT","AAPL","TSLA","MSFT","AMZN"],
    maxLeverage:1,
    stopLossDefault:2.5, takeProfitDefault:4.0,
    trailingStopEnabled:false,
  },
};

const PLANS = [
  {
    tier:"stella_one", name:"Stella One", sub:"Liberation",
    price:0, perfFee:20, color:C.textMid,
    features:["1 bot","Core strategies only","2 exchanges","5 backtests/mo","Community support"],
    current:false,
  },
  {
    tier:"stella_unum", name:"Stella Unum", sub:"Guided",
    price:49, perfFee:15, color:C.green,
    features:["3 bots","Core + 2 custom strategies","3 exchanges","20 backtests/mo","Email support","Advanced analytics"],
    current:true,
  },
  {
    tier:"stella_eon", name:"Stella Eon", sub:"Professional",
    price:199, perfFee:10, color:C.blue,
    features:["10 bots","Unlimited custom strategies","5 exchanges","Unlimited backtests","Priority support","API access","Risk dashboard"],
    current:false,
  },
  {
    tier:"stella_plenum", name:"Stella Plenum", sub:"Sovereign",
    price:null, perfFee:0, color:C.purple,
    features:["Unlimited bots","White-glove onboarding","All exchanges","Dedicated support","Multi-sig governance","Custom reporting"],
    current:false,
  },
];

const FAQ = [
  { q:"How does the performance fee work?",
    a:"Performance fees are calculated at the end of each billing cycle on realized P&L above your high-water mark. If your portfolio was at $10,000 last month and is now at $10,500, the $500 gain is subject to the fee. If you had a loss period, no fee is charged and the HWM resets to the new lower value — you must recover past the previous peak before fees apply again." },
  { q:"Where does my capital live?",
    a:"For paid tiers (Unum, Eon, Plenum), your capital stays entirely in your own exchange account. Stella never holds, moves, or touches your funds — we only execute orders using the API keys you provide. For Stella One, Stella seeds a small capital allocation from a managed pool on your behalf." },
  { q:"How do I revoke exchange access?",
    a:"Go to Settings → Exchange Credentials and click Revoke on any credential. This immediately stops Stella from executing new trades on that exchange. Any open positions will remain open on the exchange until you manually close them or they hit your stop/take-profit levels." },
  { q:"What triggers a circuit breaker?",
    a:"Circuit breakers fire when your configured drawdown threshold is breached (e.g. 15% for Unum), when daily trading volume exceeds your cap, or during rapid consecutive losses. When triggered, all open orders are cancelled, all positions are closed at market, and the bot pauses for a cooldown period. You receive an immediate notification." },
  { q:"Can I run multiple bots on the same exchange?",
    a:"Yes. Each bot is a separate process with its own strategy, capital allocation, and credentials. Two bots can trade on the same exchange simultaneously. Their capital allocations are independent, but combined exposure is monitored against your account-level risk limits." },
  { q:"How secure are my API keys?",
    a:"All credentials are encrypted with AES-256-GCM at the application level before storage. The database never contains plaintext keys. We strongly recommend creating API keys with only Read and Trade permissions — never Withdrawal — and enabling IP whitelisting to Stella's server IPs for maximum security." },
  { q:"What is the high-water mark?",
    a:"The high-water mark (HWM) is the peak portfolio equity you've reached in all your trading history with Stella. Performance fees only apply to profit above the HWM, preventing you from being double-charged if you recover from a loss. Example: HWM is $12,000, portfolio drops to $10,000, then recovers to $12,500 — fee only applies to the $500 above the old HWM." },
  { q:"How do I upgrade or downgrade my plan?",
    a:"Go to Billing → Plan and click Upgrade or Downgrade. Upgrades take effect immediately with prorated billing. Downgrades take effect at the end of your current billing cycle. If downgrading would exceed the new tier's bot or strategy limits, you'll be prompted to deactivate the excess before the change is confirmed." },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════
const fmt = {
  usd:  v => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  abs:  v => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct:  v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%",
};

function M({ size=11, color=C.textPri, weight=500, caps=false, style={}, children }) {
  return <span style={{ fontFamily:mono, fontSize:size, color, fontWeight:weight,
    letterSpacing:caps?"0.11em":"0.03em", textTransform:caps?"uppercase":"none", ...style }}>{children}</span>;
}
function Lbl({ children, color=C.textMuted, style={} }) {
  return <M size={9} color={color} weight={600} caps style={{ letterSpacing:"0.13em", ...style }}>{children}</M>;
}
function Divider({ my=0 }) { return <div style={{ height:1, background:C.borderSub, margin:`${my}px 0` }}/>; }
function VDiv() { return <div style={{ width:1, height:20, background:C.border }}/>; }

function Tag({ children, color=C.green, dot=false }) {
  return <span style={{ background:color+"18", border:`1px solid ${color}35`, borderRadius:2,
    padding:"2px 7px", fontFamily:mono, fontSize:9, color, fontWeight:700, letterSpacing:"0.1em",
    display:"inline-flex", alignItems:"center", gap:4 }}>
    {dot && <span style={{ width:5, height:5, borderRadius:"50%", background:color }}/>}
    {children}
  </span>;
}

function Card({ children, style={} }) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, ...style }}>{children}</div>;
}
function CardHead({ title, sub, right, style={} }) {
  return <>
    <div style={{ padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", ...style }}>
      <div>
        <M size={11} weight={700} style={{ letterSpacing:"0.06em", display:"block" }}>{title}</M>
        {sub && <Lbl style={{ marginTop:3, display:"block" }}>{sub}</Lbl>}
      </div>
      {right}
    </div>
    <Divider />
  </>;
}
function Row({ label, value, color=C.textPri, action, last=false }) {
  return <>
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 18px" }}>
      <Lbl>{label}</Lbl>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <M size={11} color={color} weight={600}>{value}</M>
        {action}
      </div>
    </div>
    {!last && <Divider />}
  </>;
}

function StatBox({ label, value, color=C.textPri, sub="" }) {
  return <div style={{ padding:"14px 18px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:4 }}>
    <Lbl>{label}</Lbl>
    <M size={20} color={color} weight={700} style={{ display:"block", marginTop:6, lineHeight:1 }}>{value}</M>
    {sub && <M size={9} color={C.textMuted} style={{ display:"block", marginTop:4 }}>{sub}</M>}
  </div>;
}

function PrimaryBtn({ children, onClick, small=false, disabled=false, full=false, danger=false }) {
  return <button onClick={onClick} disabled={disabled} style={{
    background: disabled ? "#1A2030" : danger ? C.red : C.green,
    color: disabled ? "#3D4560" : danger ? "#fff" : "#0A0D14",
    border: "none", borderRadius:3, padding:small?"6px 14px":"9px 20px",
    fontFamily:mono, fontSize:small?9:10, letterSpacing:"0.1em", textTransform:"uppercase",
    fontWeight:700, cursor:disabled?"not-allowed":"pointer", width:full?"100%":"auto",
    display:"inline-flex", alignItems:"center", gap:6 }}>{children}</button>;
}
function GhostBtn({ children, onClick, small=false, danger=false, full=false }) {
  return <button onClick={onClick} style={{
    background:"transparent", border:`1px solid ${danger?C.red+"50":C.border}`, borderRadius:3,
    padding:small?"5px 12px":"9px 16px", fontFamily:mono, fontSize:small?9:10,
    letterSpacing:"0.1em", textTransform:"uppercase", color:danger?C.red:C.textMuted,
    cursor:"pointer", fontWeight:600, width:full?"100%":"auto" }}>{children}</button>;
}
function TextBtn({ children, onClick, color=C.green }) {
  return <button onClick={onClick} style={{ background:"transparent", border:"none",
    fontFamily:mono, fontSize:9, color, letterSpacing:"0.08em", textTransform:"uppercase",
    cursor:"pointer", fontWeight:700, padding:"2px 0" }}>{children}</button>;
}

function Input({ label, value, onChange, type="text", placeholder="", hint="", disabled=false, prefix="" }) {
  const [focused, setFocused] = useState(false);
  return <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
    {label && <Lbl>{label}</Lbl>}
    <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
      {prefix && <span style={{ position:"absolute", left:10, fontFamily:mono, fontSize:11,
        color:C.textMuted, pointerEvents:"none" }}>{prefix}</span>}
      <input type={type} value={value} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder}
        disabled={disabled}
        onFocus={e=>{setFocused(true); e.target.style.borderColor=C.green;}}
        onBlur={e=>{setFocused(false); e.target.style.borderColor=C.border;}}
        style={{ width:"100%", background:disabled?C.surfaceAlt:C.bg, border:`1px solid ${C.border}`,
          borderRadius:3, padding:`8px ${prefix?"30px":"12px"} 8px 12px`, fontFamily:mono,
          fontSize:11, color:disabled?C.textMuted:C.textPri, outline:"none",
          transition:"border-color 0.15s" }}/>
    </div>
    {hint && <M size={9} color={C.textMuted}>{hint}</M>}
  </div>;
}

function Toggle({ value, onChange, label="" }) {
  return <button onClick={()=>onChange?.(!value)} style={{
    width:38, height:21, borderRadius:11, background:value?C.green:C.border,
    border:"none", cursor:"pointer", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
    <div style={{ position:"absolute", top:3, left:value?18:3, width:15, height:15,
      borderRadius:"50%", background:value?"#0A0D14":"#6B7590", transition:"left 0.2s" }}/>
  </button>;
}

function ProgressBar({ value, max, color=C.green }) {
  const pct = Math.min((value/max)*100, 100);
  return <div style={{ height:5, background:C.border, borderRadius:3, overflow:"hidden" }}>
    <div style={{ width:pct+"%", height:"100%", background:`linear-gradient(90deg,${color}80,${color})`,
      borderRadius:3, transition:"width 0.4s" }}/>
  </div>;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, padding:"8px 12px" }}>
    <Lbl style={{ display:"block", marginBottom:4 }}>{label}</Lbl>
    <M size={12} color={C.green} weight={700}>${payload[0]?.value?.toLocaleString()}</M>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BILLING PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function BillingPage() {
  const [tab, setTab] = useState("overview");
  const [cancelOpen, setCancelOpen] = useState(false);

  const currentPlan = PLANS.find(p => p.current);
  const nextBillDate = "Mar 01 2026";
  const hwm = 11240;
  const currentEquity = 11240;
  const profitAboveHwm = 0;

  const invoiceColor = { paid:C.green, overdue:C.red, refunded:C.amber, draft:C.textMuted, void:C.textDim };
  const methodLabel = { stripe:"Stripe", pegpay_momo:"Mobile Money (PegPay)", manual:"Manual" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>Billing</M>
          <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>
            Subscriptions, invoices, and performance fees
          </M>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:18 }}>
        {[{k:"overview",l:"Overview"},{k:"plan",l:"Plan"},{k:"invoices",l:"Invoices"},{k:"performance",l:"Performance Fees"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            padding:"9px 20px", background:"transparent", border:"none",
            borderBottom:`2px solid ${tab===t.k?C.green:"transparent"}`,
            fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
            color:tab===t.k?C.green:C.textMuted, cursor:"pointer", fontWeight:tab===t.k?700:500 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab==="overview" && <>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
          {[
            { l:"Current Plan",    v:currentPlan.name,       c:C.green  },
            { l:"Next Bill",       v:fmt.abs(49),             c:C.textPri, sub:nextBillDate },
            { l:"Perf Fee (MTD)",  v:fmt.abs(93.60),          c:C.amber,  sub:"15% of $624 above HWM" },
            { l:"Total Paid YTD",  v:fmt.abs(361.20),         c:C.textPri },
          ].map(s=><StatBox key={s.l} label={s.l} value={s.v} color={s.c} sub={s.sub}/>)}
        </div>

        {/* Plan card */}
        <Card style={{ marginBottom:16 }}>
          <div style={{ padding:"18px 18px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:42, height:42, borderRadius:4, background:C.greenDim,
                  border:`1px solid ${C.greenMid}`, display:"flex", alignItems:"center",
                  justifyContent:"center", fontFamily:mono, fontSize:16, fontWeight:800, color:C.green }}>U</div>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <M size={14} weight={700}>Stella Unum</M>
                    <Tag color={C.green}>ACTIVE</Tag>
                  </div>
                  <M size={10} color={C.textMuted}>$49/mo · 15% performance fee · Monthly billing</M>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <GhostBtn small onClick={()=>setTab("plan")}>Change Plan</GhostBtn>
                <GhostBtn small danger onClick={()=>setCancelOpen(true)}>Cancel</GhostBtn>
              </div>
            </div>

            <Divider my={16} />

            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px 0" }}>
              {[
                { l:"Billing Cycle",     v:"Monthly" },
                { l:"Current Period",    v:"Feb 1 – Feb 28 2026" },
                { l:"Next Billing Date", v:nextBillDate },
                { l:"Payment Method",   v:"Stripe · Visa ••4242" },
                { l:"Subscription ID",  v:"sub_1Qa9Zc..." },
                { l:"Member Since",     v:"Nov 2025" },
              ].map(({l,v},i)=>(
                <div key={l} style={{ paddingRight:i%3<2?20:0 }}>
                  <Lbl style={{ display:"block", marginBottom:4 }}>{l}</Lbl>
                  <M size={11} color={C.textPri} weight={600}>{v}</M>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* HWM tracker */}
        <Card>
          <CardHead title="High-Water Mark Tracker" sub="Performance fee only applies to profit above this level"/>
          <div style={{ padding:"16px 18px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px 0", marginBottom:16 }}>
              {[
                { l:"High-Water Mark",  v:"$"+hwm.toLocaleString(),         c:C.textPri },
                { l:"Current Equity",   v:"$"+currentEquity.toLocaleString(), c:C.green },
                { l:"Profit Above HWM", v:fmt.abs(profitAboveHwm),           c:profitAboveHwm>0?C.green:C.textMuted },
              ].map(({l,v,c})=>(
                <div key={l}>
                  <Lbl style={{ display:"block", marginBottom:4 }}>{l}</Lbl>
                  <M size={16} color={c} weight={700}>{v}</M>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <Lbl>Equity vs HWM</Lbl>
                <M size={9} color={C.textMuted}>At HWM — no performance fee accruing</M>
              </div>
              <ProgressBar value={currentEquity} max={hwm * 1.2} color={C.green}/>
            </div>
          </div>
        </Card>
      </>}

      {/* PLAN */}
      {tab==="plan" && <>
        <M size={11} color={C.textMuted} style={{ display:"block", marginBottom:18, lineHeight:1.6 }}>
          Upgrades take effect immediately with prorated billing. Downgrades apply at end of current cycle.
        </M>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
          {PLANS.map(plan=>(
            <div key={plan.tier} style={{
              background:C.surface, border:`2px solid ${plan.current?plan.color:C.border}`,
              borderTop:`3px solid ${plan.color}`,
              borderRadius:4, overflow:"hidden", display:"flex", flexDirection:"column",
              position:"relative" }}>
              {plan.current && (
                <div style={{ position:"absolute", top:10, right:10 }}>
                  <Tag color={plan.color}>CURRENT</Tag>
                </div>
              )}
              <div style={{ padding:"16px 16px 12px" }}>
                <M size={13} weight={700} style={{ display:"block", marginBottom:4 }}>{plan.name}</M>
                <Lbl style={{ display:"block", marginBottom:14 }}>{plan.sub}</Lbl>
                <div style={{ marginBottom:4 }}>
                  {plan.price===null ? (
                    <M size={20} color={plan.color} weight={700}>Custom</M>
                  ) : plan.price===0 ? (
                    <M size={20} color={plan.color} weight={700}>Free</M>
                  ) : (
                    <>
                      <M size={22} color={plan.color} weight={700}>${plan.price}</M>
                      <M size={10} color={C.textMuted}>/mo</M>
                    </>
                  )}
                </div>
                <M size={9} color={C.textMuted} style={{ display:"block", marginBottom:14 }}>
                  {plan.perfFee}% performance fee
                </M>
                <Divider />
              </div>
              <div style={{ padding:"0 16px 12px", flex:1 }}>
                {plan.features.map(f=>(
                  <div key={f} style={{ display:"flex", alignItems:"flex-start", gap:7, padding:"5px 0" }}>
                    <span style={{ color:plan.color, fontSize:10, flexShrink:0, marginTop:1 }}>✓</span>
                    <M size={10} color={C.textMuted}>{f}</M>
                  </div>
                ))}
              </div>
              <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.borderSub}` }}>
                {plan.current ? (
                  <div style={{ background:plan.color+"18", border:`1px solid ${plan.color}35`,
                    borderRadius:3, padding:"8px", textAlign:"center" }}>
                    <M size={9} color={plan.color} weight={700}>Current Plan</M>
                  </div>
                ) : plan.price===null ? (
                  <GhostBtn full>Contact Sales</GhostBtn>
                ) : (
                  <PrimaryBtn full onClick={()=>{}} disabled={false}>
                    {PLANS.indexOf(plan) < PLANS.indexOf(currentPlan) ? "Downgrade" : "Upgrade"}
                  </PrimaryBtn>
                )}
              </div>
            </div>
          ))}
        </div>
      </>}

      {/* INVOICES */}
      {tab==="invoices" && <>
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <GhostBtn small>Export All CSV</GhostBtn>
        </div>
        <Card>
          <div style={{ display:"grid",
            gridTemplateColumns:"110px 160px 120px 100px 160px 120px 80px",
            padding:"9px 18px", gap:0 }}>
            {["Invoice","Type","Period","Amount","Method","Status",""].map(h=><Lbl key={h}>{h}</Lbl>)}
          </div>
          <Divider />
          {INVOICES.map((inv,i)=>{
            const tc = invoiceColor[inv.status]||C.textMuted;
            const typeColor = inv.type==="performance_fee" ? C.amber : C.blue;
            return (
              <div key={inv.id}>
                <div style={{ display:"grid",
                  gridTemplateColumns:"110px 160px 120px 100px 160px 120px 80px",
                  padding:"11px 18px", gap:0, alignItems:"center",
                  background:i%2===0?"transparent":C.surfaceAlt+"60" }}>
                  <M size={11} color={C.green} weight={700}>{inv.id}</M>
                  <Tag color={typeColor}>
                    {inv.type==="performance_fee"?"PERF FEE":"SUBSCRIPTION"}
                  </Tag>
                  <M size={10} color={C.textMuted}>{inv.period}</M>
                  <M size={11} color={C.textPri} weight={700}>{fmt.abs(inv.amount)}</M>
                  <M size={10} color={C.textMuted}>{methodLabel[inv.method]}</M>
                  <Tag color={tc}>{inv.status.toUpperCase()}</Tag>
                  <TextBtn onClick={()=>{}}>PDF ↓</TextBtn>
                </div>
                {i<INVOICES.length-1&&<Divider/>}
              </div>
            );
          })}
        </Card>
      </>}

      {/* PERFORMANCE FEES */}
      {tab==="performance" && <>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Card>
            <CardHead title="Equity History" sub="Portfolio growth vs high-water mark"/>
            <div style={{ padding:"8px 0" }}>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={EQUITY_HISTORY} margin={{ top:4,right:20,bottom:0,left:20 }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={0.25}/>
                      <stop offset="100%" stopColor={C.green} stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="d" tick={{ fontFamily:mono,fontSize:8,fill:C.textMuted }} tickLine={false} axisLine={false}/>
                  <YAxis domain={["auto","auto"]} tick={{ fontFamily:mono,fontSize:8,fill:C.textMuted }} tickLine={false} axisLine={false} tickFormatter={v=>"$"+v.toLocaleString()}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Area type="monotone" dataKey="v" stroke={C.green} strokeWidth={1.5} fill="url(#eqGrad)" dot={false} activeDot={{r:3,fill:C.green,stroke:C.surface,strokeWidth:2}}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHead title="Fee Summary" sub="Fees accrued and invoiced"/>
            <div style={{ padding:"14px 18px" }}>
              {[
                { l:"Performance Fee Rate", v:"15%", c:C.textPri },
                { l:"HWM at Period Start",  v:"$9,800", c:C.textMid },
                { l:"HWM at Period End",    v:"$11,240", c:C.green },
                { l:"Realized P&L (MTD)",   v:"+$832.00", c:C.green },
                { l:"Profit Above HWM",     v:"$624.00", c:C.amber },
                { l:"Fee Accrued (MTD)",    v:"$93.60", c:C.amber },
                { l:"Next Fee Invoice",     v:"Mar 01 2026", c:C.textMuted },
              ].map(({l,v,c},i,a)=>(
                <div key={l}>
                  <div style={{ display:"flex",justifyContent:"space-between",padding:"9px 0" }}>
                    <Lbl>{l}</Lbl>
                    <M size={11} color={c} weight={600}>{v}</M>
                  </div>
                  {i<a.length-1&&<Divider/>}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Per-period table */}
        <Card>
          <CardHead title="Period Breakdown" sub="Historical performance fee calculation"/>
          <div style={{ display:"grid", gridTemplateColumns:"120px 100px 100px 110px 90px 100px 80px 90px",
            padding:"9px 18px", gap:0 }}>
            {["Period","Realized P&L","HWM Start","HWM End","Above HWM","Fee %","Fee USD","Status"].map(h=><Lbl key={h}>{h}</Lbl>)}
          </div>
          <Divider/>
          {PERF_SNAPSHOTS.map((s,i)=>(
            <div key={s.period}>
              <div style={{ display:"grid", gridTemplateColumns:"120px 100px 100px 110px 90px 100px 80px 90px",
                padding:"11px 18px", gap:0, alignItems:"center",
                background:i%2===0?"transparent":C.surfaceAlt+"60" }}>
                <M size={11} weight={600}>{s.period}</M>
                <M size={11} color={C.green} weight={700}>{fmt.usd(s.realPnl)}</M>
                <M size={11} color={C.textMid}>${s.hwmStart.toLocaleString()}</M>
                <M size={11} color={C.green}>${s.hwmEnd.toLocaleString()}</M>
                <M size={11} color={C.amber}>{fmt.abs(s.profitAboveHwm)}</M>
                <M size={11} color={C.textMid}>{s.feePct}%</M>
                <M size={11} color={C.amber} weight={700}>{fmt.abs(s.feeUsd)}</M>
                <Tag color={s.finalized?C.green:C.amber}>{s.finalized?"FINAL":"PENDING"}</Tag>
              </div>
              {i<PERF_SNAPSHOTS.length-1&&<Divider/>}
            </div>
          ))}
        </Card>
      </>}

      {/* Cancel modal */}
      {cancelOpen && <>
        <div onClick={()=>setCancelOpen(false)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:199 }}/>
        <div style={{ position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          width:420,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,
          zIndex:200,padding:"24px 24px",animation:"fadeIn 0.18s ease" }}>
          <M size={14} weight={700} style={{ display:"block",marginBottom:8 }}>Cancel Subscription?</M>
          <M size={11} color={C.textMuted} style={{ display:"block",lineHeight:1.7,marginBottom:20 }}>
            Your Stella Unum subscription will remain active until <strong style={{ color:C.textPri }}>Feb 28 2026</strong>.
            After that, you'll be downgraded to Stella One. Your bots and data are preserved.
          </M>
          <div style={{ background:C.amberDim,border:`1px solid ${C.amberMid}`,borderRadius:4,
            padding:"10px 14px",marginBottom:20 }}>
            <M size={10} color={C.amber}>
              ⚠ You have 3 bots active. Stella One allows only 1. You'll need to deactivate 2 bots before the downgrade completes.
            </M>
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <GhostBtn onClick={()=>setCancelOpen(false)}>Keep Plan</GhostBtn>
            <PrimaryBtn danger onClick={()=>setCancelOpen(false)}>Confirm Cancel</PrimaryBtn>
          </div>
        </div>
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function AccountPage() {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState({
    firstName:"James",lastName:"Doe",username:"jdoe",email:"james.doe@example.com",
    phone:"+256 701 234 567",country:"Uganda",timezone:"Africa/Kampala",
    currency:"USD",language:"en",riskTolerance:"moderate",experience:"intermediate",
  });
  const [notifPrefs, setNotifPrefs] = useState({
    emailTradeAlerts:true, emailRiskAlerts:true, emailBilling:true, emailNewsletter:false,
    pushTradeAlerts:true, pushRiskAlerts:true, pushPriceAlerts:false,
    smsRiskAlerts:false, smsBilling:false,
  });
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() { setSaved(true); setTimeout(()=>setSaved(false), 2000); }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>Account</M>
          <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>Profile, security, and preferences</M>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:18 }}>
        {[{k:"profile",l:"Profile"},{k:"security",l:"Security"},{k:"notifications",l:"Notifications"},{k:"activity",l:"Activity"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            padding:"9px 20px", background:"transparent", border:"none",
            borderBottom:`2px solid ${tab===t.k?C.green:"transparent"}`,
            fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
            color:tab===t.k?C.green:C.textMuted, cursor:"pointer", fontWeight:tab===t.k?700:500 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* PROFILE */}
      {tab==="profile" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Card>
              <CardHead title="Personal Information"/>
              <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <Input label="First Name" value={profile.firstName} onChange={v=>setProfile(p=>({...p,firstName:v}))}/>
                <Input label="Last Name"  value={profile.lastName}  onChange={v=>setProfile(p=>({...p,lastName:v}))}/>
                <Input label="Username"   value={profile.username}  onChange={v=>setProfile(p=>({...p,username:v}))} prefix="@"/>
                <Input label="Email"      value={profile.email}     onChange={v=>setProfile(p=>({...p,email:v}))} type="email"/>
                <Input label="Phone"      value={profile.phone}     onChange={v=>setProfile(p=>({...p,phone:v}))}/>
                <div>
                  <Lbl style={{ display:"block", marginBottom:5 }}>Country</Lbl>
                  <select value={profile.country} onChange={e=>setProfile(p=>({...p,country:e.target.value}))}
                    style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
                      padding:"8px 12px", fontFamily:mono, fontSize:11, color:C.textPri, outline:"none" }}>
                    {["Uganda","Kenya","Nigeria","Ghana","South Africa","Tanzania","Ethiopia"].map(c=>(
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>

            <Card>
              <CardHead title="Preferences"/>
              <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
                {[
                  { l:"Timezone", k:"timezone", opts:["Africa/Kampala","Africa/Nairobi","Europe/London","America/New_York"] },
                  { l:"Currency", k:"currency", opts:["USD","EUR","GBP","KES","UGX"] },
                  { l:"Language", k:"language", opts:["en","fr","sw"] },
                ].map(({l,k,opts})=>(
                  <div key={k}>
                    <Lbl style={{ display:"block", marginBottom:5 }}>{l}</Lbl>
                    <select value={profile[k]} onChange={e=>setProfile(p=>({...p,[k]:e.target.value}))}
                      style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
                        padding:"8px 12px", fontFamily:mono, fontSize:11, color:C.textPri, outline:"none" }}>
                      {opts.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ display:"flex", gap:10 }}>
              <PrimaryBtn onClick={handleSave}>{saved?"✓ Saved":"Save Changes"}</PrimaryBtn>
              <GhostBtn onClick={()=>{}}>Discard</GhostBtn>
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Avatar */}
            <Card>
              <CardHead title="Profile Picture"/>
              <div style={{ padding:"20px 18px", display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>
                <div style={{ width:80, height:80, borderRadius:"50%",
                  background:`linear-gradient(135deg,${C.green},#00B87A)`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:mono, fontSize:28, fontWeight:800, color:"#0A0D14",
                  border:`3px solid ${C.greenMid}` }}>JD</div>
                <GhostBtn small>Upload Photo</GhostBtn>
              </div>
            </Card>

            {/* KYC status */}
            <Card>
              <CardHead title="KYC Status"/>
              <div style={{ padding:"14px 18px" }}>
                {[
                  { l:"Level",   v:"Enhanced", c:C.amber },
                  { l:"Status",  v:"Under Review", c:C.amber },
                  { l:"Provider",v:"Sumsub", c:C.textMid },
                  { l:"Submitted",v:"Jan 28 2026", c:C.textMid },
                ].map(({l,v,c},i,a)=>(
                  <div key={l}>
                    <div style={{ display:"flex",justifyContent:"space-between",padding:"8px 0" }}>
                      <Lbl>{l}</Lbl>
                      <M size={11} color={c} weight={600}>{v}</M>
                    </div>
                    {i<a.length-1&&<Divider/>}
                  </div>
                ))}
                <div style={{ marginTop:10 }}>
                  <div style={{ background:C.amberDim,border:`1px solid ${C.amberMid}`,borderRadius:3,padding:"8px 12px" }}>
                    <M size={9} color={C.amber}>Verification typically takes 1–3 business days.</M>
                  </div>
                </div>
              </div>
            </Card>

            {/* Referral */}
            <Card>
              <CardHead title="Referral Code"/>
              <div style={{ padding:"14px 18px" }}>
                <div style={{ background:C.surfaceAlt, border:`1px solid ${C.greenMid}`,
                  borderRadius:3, padding:"10px 12px", display:"flex",
                  justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <M size={14} color={C.green} weight={700} style={{ letterSpacing:"0.18em" }}>JDOE-7X2K</M>
                  <TextBtn onClick={()=>{}}>Copy</TextBtn>
                </div>
                <M size={9} color={C.textMuted} style={{ lineHeight:1.6 }}>
                  Earn 1 month free Unum for each referral who upgrades to a paid plan.
                </M>
                <M size={11} color={C.green} weight={700} style={{ display:"block", marginTop:8 }}>2 referrals</M>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* SECURITY */}
      {tab==="security" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* MFA */}
          <Card>
            <CardHead title="Two-Factor Authentication" sub="Adds a second layer of protection to your account"/>
            <div style={{ padding:"16px 18px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div>
                  <M size={12} weight={600} style={{ display:"block", marginBottom:4 }}>Authenticator App (TOTP)</M>
                  <M size={10} color={C.textMuted}>{mfaEnabled?"Enabled · Google Authenticator":"Disabled"}</M>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <Tag color={mfaEnabled?C.green:C.red}>{mfaEnabled?"ENABLED":"DISABLED"}</Tag>
                  <Toggle value={mfaEnabled} onChange={setMfaEnabled}/>
                </div>
              </div>
              {!mfaEnabled && (
                <div style={{ background:C.redDim,border:`1px solid ${C.redMid}`,borderRadius:4,padding:"10px 14px" }}>
                  <M size={10} color={C.red}>⚠ 2FA is disabled. Your account is less secure. Enable it to protect against unauthorized access.</M>
                </div>
              )}
              {mfaEnabled && (
                <div style={{ display:"flex", gap:8 }}>
                  <GhostBtn small>View Backup Codes</GhostBtn>
                  <GhostBtn small>Reset 2FA Device</GhostBtn>
                </div>
              )}
            </div>
          </Card>

          {/* Password */}
          <Card>
            <CardHead title="Password"/>
            <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, maxWidth:500 }}>
              <Input label="Current Password" type="password" value="" onChange={()=>{}} placeholder="••••••••"/>
              <div/>
              <Input label="New Password"     type="password" value="" onChange={()=>{}} placeholder="••••••••"/>
              <Input label="Confirm Password" type="password" value="" onChange={()=>{}} placeholder="••••••••"/>
              <PrimaryBtn onClick={()=>{}}>Update Password</PrimaryBtn>
            </div>
          </Card>

          {/* Active sessions */}
          <Card>
            <CardHead title="Active Sessions" sub={`${SESSIONS.length} sessions`}
              right={<GhostBtn small danger onClick={()=>{}}>Revoke All Others</GhostBtn>}/>
            {SESSIONS.map((sess,i)=>(
              <div key={sess.id}>
                <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:4, background:C.surfaceAlt,
                      border:`1px solid ${C.border}`, display:"flex", alignItems:"center",
                      justifyContent:"center", fontSize:16, flexShrink:0 }}>
                      {sess.device.includes("iOS")?"📱":"💻"}
                    </div>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        <M size={11} weight={600}>{sess.device}</M>
                        {sess.current && <Tag color={C.green}>THIS SESSION</Tag>}
                      </div>
                      <M size={9} color={C.textMuted} style={{ display:"block" }}>
                        {sess.location} · {sess.ip}
                      </M>
                      <M size={9} color={C.textDim} style={{ display:"block", marginTop:2 }}>{sess.lastActive}</M>
                    </div>
                  </div>
                  {!sess.current && <GhostBtn small danger onClick={()=>{}}>Revoke</GhostBtn>}
                </div>
                {i<SESSIONS.length-1&&<Divider/>}
              </div>
            ))}
          </Card>

          {/* Danger zone */}
          <Card style={{ borderColor:C.red+"30" }}>
            <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <M size={12} weight={700} color={C.red} style={{ display:"block", marginBottom:4 }}>Delete Account</M>
                <M size={10} color={C.textMuted}>Permanently delete your account and all associated data. This cannot be undone.</M>
              </div>
              <PrimaryBtn danger onClick={()=>{}}>Delete Account</PrimaryBtn>
            </div>
          </Card>
        </div>
      )}

      {/* NOTIFICATIONS */}
      {tab==="notifications" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {[
            { title:"Email Notifications", sub:"Delivered to james.doe@example.com",
              items:[
                { k:"emailTradeAlerts", l:"Trade alerts",      desc:"Order fills, position opens/closes" },
                { k:"emailRiskAlerts",  l:"Risk alerts",       desc:"Circuit breakers, drawdown warnings" },
                { k:"emailBilling",     l:"Billing",           desc:"Invoices, payment confirmations" },
                { k:"emailNewsletter",  l:"Product updates",   desc:"Feature announcements, market insights" },
              ]},
            { title:"Push Notifications", sub:"Mobile app and browser push",
              items:[
                { k:"pushTradeAlerts",  l:"Trade alerts",      desc:"Real-time fills and bot status" },
                { k:"pushRiskAlerts",   l:"Risk alerts",       desc:"Urgent circuit breaker events" },
                { k:"pushPriceAlerts",  l:"Price alerts",      desc:"Custom price threshold notifications" },
              ]},
            { title:"SMS Notifications", sub:"Sent to +256 701 234 567",
              items:[
                { k:"smsRiskAlerts",    l:"Risk alerts",       desc:"Circuit breaker triggers only" },
                { k:"smsBilling",       l:"Billing",           desc:"Failed payment alerts" },
              ]},
          ].map(section=>(
            <Card key={section.title}>
              <CardHead title={section.title} sub={section.sub}/>
              {section.items.map((item,i)=>(
                <div key={item.k}>
                  <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <M size={12} weight={600} style={{ display:"block", marginBottom:3 }}>{item.l}</M>
                      <M size={10} color={C.textMuted}>{item.desc}</M>
                    </div>
                    <Toggle value={notifPrefs[item.k]} onChange={v=>setNotifPrefs(p=>({...p,[item.k]:v}))}/>
                  </div>
                  {i<section.items.length-1&&<Divider/>}
                </div>
              ))}
            </Card>
          ))}
          <PrimaryBtn onClick={handleSave}>{saved?"✓ Saved":"Save Preferences"}</PrimaryBtn>
        </div>
      )}

      {/* ACTIVITY LOG */}
      {tab==="activity" && (
        <Card>
          <CardHead title="Account Activity" sub="Last 30 days"/>
          {ACTIVITY_LOG.map((ev,i)=>(
            <div key={i}>
              <div style={{ padding:"12px 18px", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:32, height:32, borderRadius:4, background:ev.color+"18",
                  border:`1px solid ${ev.color}30`, display:"flex", alignItems:"center",
                  justifyContent:"center", fontFamily:mono, fontSize:13, color:ev.color, flexShrink:0 }}>
                  {ev.icon}
                </div>
                <div style={{ flex:1 }}>
                  <M size={11} weight={600} style={{ display:"block", marginBottom:2 }}>{ev.action}</M>
                  <M size={10} color={C.textMuted}>{ev.detail}</M>
                </div>
                <M size={9} color={C.textDim}>{ev.time}</M>
              </div>
              {i<ACTIVITY_LOG.length-1&&<Divider/>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE — Exchange credential config is the centrepiece
// ═══════════════════════════════════════════════════════════════════════════════

function CredentialConfigPanel({ cred, onClose }) {
  const cfg = EXCHANGE_ADAPTER_CONFIG[cred.id] || {};
  const [pairs, setPairs] = useState(cfg.enabledPairs || []);
  const [minOrder, setMinOrder] = useState(String(cfg.minOrderUsd||10));
  const [maxOrder, setMaxOrder] = useState(String(cfg.maxOrderUsd||5000));
  const [slDefault, setSlDefault] = useState(String(cfg.stopLossDefault||3.0));
  const [tpDefault, setTpDefault] = useState(String(cfg.takeProfitDefault||5.0));
  const [trailing, setTrailing] = useState(cfg.trailingStopEnabled||false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [tab, setTab] = useState("pairs");
  const [validating, setValidating] = useState(false);
  const [validResult, setValidResult] = useState(null);

  function togglePair(p) {
    setPairs(ps => ps.includes(p) ? ps.filter(x=>x!==p) : [...ps,p]);
  }

  function validate() {
    setValidating(true);
    setValidResult(null);
    setTimeout(()=>{
      setValidating(false);
      setValidResult(cred.status==="failed_validation"?"error":"success");
    }, 1800);
  }

  const tabs = [
    {k:"pairs",    l:"Trading Pairs"},
    {k:"limits",   l:"Order Limits"},
    {k:"risk",     l:"Risk Defaults"},
    {k:"keys",     l:"Credentials"},
  ];

  return (
    <div style={{ position:"fixed",top:0,right:0,bottom:0,width:520,
      background:C.surface,borderLeft:`1px solid ${C.border}`,
      zIndex:200,display:"flex",flexDirection:"column",animation:"slideIn 0.2s ease" }}>
      {/* Header */}
      <div style={{ padding:"16px 20px",borderBottom:`1px solid ${C.border}`,
        display:"flex",alignItems:"flex-start",justifyContent:"space-between" }}>
        <div>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:5 }}>
            <div style={{ width:28,height:28,borderRadius:4,background:cred.lc+"20",
              border:`1px solid ${cred.lc}30`,display:"flex",alignItems:"center",
              justifyContent:"center",fontFamily:mono,fontSize:12,fontWeight:700,color:cred.lc }}>
              {cred.logo}
            </div>
            <M size={13} weight={700}>{cred.exchange} · {cred.label}</M>
            <Tag color={cred.status==="active"?C.green:C.red}>
              {cred.status==="active"?"ACTIVE":"FAILED"}
            </Tag>
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <Lbl>Key: {cred.keyPreview}</Lbl>
            <Lbl color={C.textDim}>·</Lbl>
            <Lbl>Last used: {cred.lastUsed}</Lbl>
            {cred.latencyMs && <>
              <Lbl color={C.textDim}>·</Lbl>
              <Lbl color={cred.latencyMs<60?C.green:C.amber}>{cred.latencyMs}ms</Lbl>
            </>}
          </div>
        </div>
        <button onClick={onClose} style={{ background:"transparent",border:"none",
          color:C.textMuted,cursor:"pointer",fontFamily:mono,fontSize:20,padding:4 }}>×</button>
      </div>

      {/* Error banner */}
      {cred.validationError && (
        <div style={{ background:C.redDim,borderBottom:`1px solid ${C.redMid}`,padding:"10px 20px" }}>
          <M size={10} color={C.red}>⚠ {cred.validationError}</M>
        </div>
      )}

      {/* Panel tabs */}
      <div style={{ display:"flex",borderBottom:`1px solid ${C.border}` }}>
        {tabs.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            flex:1,padding:"10px 0",background:"transparent",border:"none",
            borderBottom:`2px solid ${tab===t.k?C.green:"transparent"}`,
            fontFamily:mono,fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",
            color:tab===t.k?C.green:C.textMuted,cursor:"pointer",fontWeight:tab===t.k?700:500 }}>
            {t.l}
          </button>
        ))}
      </div>

      <div style={{ flex:1,overflowY:"auto",padding:"18px 20px" }}>

        {/* PAIRS TAB */}
        {tab==="pairs" && (
          <div>
            <M size={11} color={C.textMuted} style={{ display:"block",lineHeight:1.6,marginBottom:14 }}>
              Select which trading pairs this credential is allowed to trade. Bots using this credential
              will only see enabled pairs.
            </M>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
              {(cfg.allPairs||[]).map(p=>{
                const on=pairs.includes(p);
                return (
                  <button key={p} onClick={()=>togglePair(p)} style={{
                    background:on?C.greenDim:C.surfaceAlt,
                    border:`1px solid ${on?C.greenMid:C.border}`,borderRadius:3,
                    padding:"10px 14px",display:"flex",alignItems:"center",
                    justifyContent:"space-between",cursor:"pointer",transition:"all 0.15s" }}>
                    <M size={12} color={on?C.green:C.textMid} weight={on?700:500}>{p}</M>
                    <div style={{ width:16,height:16,borderRadius:3,background:on?C.green:C.border,
                      border:`1px solid ${on?C.green:C.border}`,display:"flex",alignItems:"center",
                      justifyContent:"center",flexShrink:0 }}>
                      {on && <span style={{ color:"#0A0D14",fontSize:10,fontWeight:800,lineHeight:1 }}>✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop:14,padding:"10px 14px",background:C.surfaceAlt,
              border:`1px solid ${C.border}`,borderRadius:3 }}>
              <Lbl style={{ display:"block",marginBottom:3 }}>Enabled Pairs</Lbl>
              <M size={11} color={C.green} weight={700}>{pairs.length} / {(cfg.allPairs||[]).length} selected</M>
            </div>
          </div>
        )}

        {/* LIMITS TAB */}
        {tab==="limits" && (
          <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
            <M size={11} color={C.textMuted} style={{ lineHeight:1.6 }}>
              These limits are applied per-credential, on top of your tier limits. The most restrictive value always wins.
            </M>
            <Input label="Minimum Order Size (USD)" value={minOrder} onChange={setMinOrder} type="number"
              hint="Orders below this value will be rejected before reaching the exchange."/>
            <Input label="Maximum Order Size (USD)" value={maxOrder} onChange={setMaxOrder} type="number"
              hint="Orders above this value will be split or rejected based on strategy config."/>
            <Card style={{ padding:"4px 16px" }}>
              {[
                { l:"Rate Limit (Orders/min)", v:String(cfg.rateLimitOrders||60) },
                { l:"Rate Limit (Queries/min)",v:String(cfg.rateLimitQueries||120) },
                { l:"Max Leverage",            v:(cfg.maxLeverage||1)+"×" },
              ].map(({l,v},i,a)=>(
                <div key={l}>
                  <div style={{ display:"flex",justifyContent:"space-between",padding:"10px 0" }}>
                    <Lbl>{l}</Lbl>
                    <M size={11} color={C.textMid} weight={600}>{v}</M>
                  </div>
                  {i<a.length-1&&<Divider/>}
                </div>
              ))}
            </Card>
            <M size={9} color={C.textDim}>Exchange-enforced limits above are set by admin and cannot be overridden here.</M>
          </div>
        )}

        {/* RISK DEFAULTS TAB */}
        {tab==="risk" && (
          <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
            <M size={11} color={C.textMuted} style={{ lineHeight:1.6 }}>
              Default risk parameters for new bots created with this credential. You can override these per-bot.
            </M>
            <Input label="Default Stop Loss (%)" value={slDefault} onChange={setSlDefault} type="number"
              hint="Bots will default to this SL unless overridden in bot config."/>
            <Input label="Default Take Profit (%)" value={tpDefault} onChange={setTpDefault} type="number"
              hint="Bots will default to this TP unless overridden."/>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",
              background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:3,padding:"12px 16px" }}>
              <div>
                <M size={11} weight={600} style={{ display:"block",marginBottom:3 }}>Trailing Stop Loss</M>
                <M size={10} color={C.textMuted}>Automatically trail the stop as price moves in your favour</M>
              </div>
              <Toggle value={trailing} onChange={setTrailing}/>
            </div>
            {trailing && (
              <Input label="Trailing Distance (%)" value="1.5" onChange={()=>{}} type="number"
                hint="Trail stop activates after price moves this % in your direction."/>
            )}
          </div>
        )}

        {/* CREDENTIALS TAB */}
        {tab==="keys" && (
          <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
            <div style={{ background:C.amberDim,border:`1px solid ${C.amberMid}`,
              borderRadius:4,padding:"12px 14px" }}>
              <M size={10} color={C.amber} style={{ lineHeight:1.6 }}>
                🔒 Keys are encrypted with AES-256-GCM and never stored in plaintext. Only enter new keys to rotate credentials. Leaving these fields blank preserves the current keys.
              </M>
            </div>

            <Input label="API Key" value={apiKey} onChange={setApiKey} placeholder="Paste new API key…"
              hint="Read + Trade permissions only. Never enable Withdrawal."/>
            <div>
              <Lbl style={{ display:"block",marginBottom:5 }}>API Secret</Lbl>
              <div style={{ position:"relative" }}>
                <input type={showSecret?"text":"password"} value={apiSecret}
                  onChange={e=>setApiSecret(e.target.value)} placeholder="Paste new API secret…"
                  style={{ width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:3,
                    padding:"8px 40px 8px 12px",fontFamily:mono,fontSize:11,color:C.textPri,outline:"none" }}
                  onFocus={e=>e.target.style.borderColor=C.green}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
                <button onClick={()=>setShowSecret(s=>!s)} style={{ position:"absolute",right:10,
                  top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",
                  color:C.textMuted,cursor:"pointer",fontFamily:mono,fontSize:10 }}>
                  {showSecret?"HIDE":"SHOW"}
                </button>
              </div>
            </div>

            {/* IP whitelist */}
            <Card style={{ padding:"4px 16px" }}>
              <div style={{ padding:"10px 0" }}>
                <Lbl style={{ display:"block",marginBottom:6 }}>IP Whitelist</Lbl>
                {cred.ipWhitelist.length>0 ? cred.ipWhitelist.map(ip=>(
                  <div key={ip} style={{ display:"flex",alignItems:"center",
                    justifyContent:"space-between",padding:"5px 0" }}>
                    <M size={11} color={C.textPri} style={{ fontFamily:mono }}>{ip}</M>
                    <TextBtn color={C.red} onClick={()=>{}}>Remove</TextBtn>
                  </div>
                )) : <M size={10} color={C.textMuted}>No IPs whitelisted — all IPs allowed (less secure)</M>}
                <div style={{ marginTop:10 }}>
                  <TextBtn onClick={()=>{}}>+ Add Stella Server IPs</TextBtn>
                </div>
              </div>
            </Card>

            {/* Validate */}
            <div>
              <PrimaryBtn onClick={validate} disabled={validating} full>
                {validating ? "⟳ Validating…" : "Validate & Save Credentials"}
              </PrimaryBtn>
              {validResult==="success" && (
                <div style={{ marginTop:10,background:C.greenDim,border:`1px solid ${C.greenMid}`,
                  borderRadius:3,padding:"9px 14px" }}>
                  <M size={10} color={C.green}>✓ Credentials validated successfully. Latency: 42ms</M>
                </div>
              )}
              {validResult==="error" && (
                <div style={{ marginTop:10,background:C.redDim,border:`1px solid ${C.redMid}`,
                  borderRadius:3,padding:"9px 14px" }}>
                  <M size={10} color={C.red}>✗ Validation failed — check key permissions on your exchange dashboard.</M>
                </div>
              )}
            </div>

            <Divider my={4}/>
            <div>
              <GhostBtn danger full onClick={()=>{}}>Revoke & Remove Credential</GhostBtn>
              <M size={9} color={C.textDim} style={{ display:"block",marginTop:6,lineHeight:1.5 }}>
                Revoking immediately stops all bots using this credential. Open positions will remain until manually closed.
              </M>
            </div>
          </div>
        )}
      </div>

      {/* Footer save */}
      {tab!=="keys" && (
        <div style={{ padding:"14px 20px",borderTop:`1px solid ${C.border}`,
          display:"flex",gap:8,background:C.surfaceAlt }}>
          <PrimaryBtn onClick={onClose}>Save & Close</PrimaryBtn>
          <GhostBtn onClick={onClose}>Discard</GhostBtn>
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  const [tab, setTab] = useState("exchanges");
  const [selectedCred, setSelectedCred] = useState(null);
  const [platformSettings, setPlatformSettings] = useState({
    autoRestartBots: true, emergencyStopAll: false,
    defaultOrderType: "market", defaultTif: "GTC",
    paperTradingMode: false, confirmBeforeTrade: false,
    dataRetentionDays: 365,
  });

  const statusColor = { active:C.green, failed_validation:C.red, pending_validation:C.amber };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>Settings</M>
          <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>
            Exchange configurations, order defaults, and platform behaviour
          </M>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:18 }}>
        {[{k:"exchanges",l:"Exchange Credentials"},{k:"trading",l:"Trading Defaults"},{k:"platform",l:"Platform"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            padding:"9px 20px", background:"transparent", border:"none",
            borderBottom:`2px solid ${tab===t.k?C.green:"transparent"}`,
            fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
            color:tab===t.k?C.green:C.textMuted, cursor:"pointer", fontWeight:tab===t.k?700:500 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* EXCHANGE CREDENTIALS */}
      {tab==="exchanges" && (
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <M size={11} color={C.textMuted} style={{ lineHeight:1.6, maxWidth:560 }}>
              Each credential represents an API key pair or OAuth session for a specific exchange.
              Click a credential to configure its trading pairs, order limits, and risk defaults.
            </M>
            <PrimaryBtn small>+ Add Credential</PrimaryBtn>
          </div>

          {/* Status bar */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {[
              { l:"All", n:EXCHANGE_CREDENTIALS.length, c:C.textMid },
              { l:"Active", n:EXCHANGE_CREDENTIALS.filter(c=>c.status==="active").length, c:C.green },
              { l:"Failed", n:EXCHANGE_CREDENTIALS.filter(c=>c.status==="failed_validation").length, c:C.red },
            ].map(s=>(
              <div key={s.l} style={{ background:s.c+"18",border:`1px solid ${s.c}35`,
                borderRadius:3,padding:"4px 12px",display:"flex",gap:7,alignItems:"center" }}>
                <Lbl color={s.c}>{s.l}</Lbl>
                <M size={12} color={s.c} weight={700}>{s.n}</M>
              </div>
            ))}
          </div>

          {/* Credential cards */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {EXCHANGE_CREDENTIALS.map(cred=>{
              const sc = statusColor[cred.status]||C.textMuted;
              const hasCfg = !!EXCHANGE_ADAPTER_CONFIG[cred.id];
              return (
                <div key={cred.id} style={{ background:C.surface, border:`1px solid ${C.border}`,
                  borderRadius:4, overflow:"hidden" }}>
                  {/* Main row */}
                  <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:14 }}>
                    {/* Logo */}
                    <div style={{ width:40,height:40,borderRadius:6,background:cred.lc+"20",
                      border:`1px solid ${cred.lc}30`,display:"flex",alignItems:"center",
                      justifyContent:"center",fontFamily:mono,fontSize:15,fontWeight:700,
                      color:cred.lc,flexShrink:0 }}>{cred.logo}</div>

                    {/* Info */}
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <M size={12} weight={700}>{cred.exchange}</M>
                        <M size={11} color={C.textMuted}>·</M>
                        <M size={12} color={C.textMid}>{cred.label}</M>
                        <Tag color={sc}>{cred.status==="active"?"ACTIVE":"FAILED"}</Tag>
                        {cred.isSandbox && <Tag color={C.amber}>SANDBOX</Tag>}
                      </div>
                      <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                        <Lbl>Key: {cred.keyPreview}</Lbl>
                        <Lbl color={C.textDim}>·</Lbl>
                        <Lbl>Validated: {cred.lastValidated}</Lbl>
                        <Lbl color={C.textDim}>·</Lbl>
                        <Lbl>Last used: {cred.lastUsed}</Lbl>
                        {cred.latencyMs && <>
                          <Lbl color={C.textDim}>·</Lbl>
                          <Lbl color={cred.latencyMs<60?C.green:C.amber}>{cred.latencyMs}ms latency</Lbl>
                        </>}
                      </div>
                    </div>

                    {/* Permissions */}
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      {cred.permissions.map(p=>(
                        <Tag key={p} color={p==="read"?C.textMid:p==="trade"?C.blue:C.amber}>{p}</Tag>
                      ))}
                    </div>

                    {/* Actions */}
                    <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                      <GhostBtn small onClick={()=>setSelectedCred(cred)}>
                        Configure
                      </GhostBtn>
                      {cred.status==="failed_validation" && (
                        <PrimaryBtn small onClick={()=>setSelectedCred(cred)}>Fix →</PrimaryBtn>
                      )}
                    </div>
                  </div>

                  {/* Error bar */}
                  {cred.validationError && (
                    <div style={{ background:C.redDim, borderTop:`1px solid ${C.redMid}`,
                      padding:"8px 18px", display:"flex", alignItems:"center", gap:10 }}>
                      <M size={9} color={C.red}>⚠ {cred.validationError}</M>
                      <TextBtn color={C.red} onClick={()=>setSelectedCred(cred)}>Fix Credential →</TextBtn>
                    </div>
                  )}

                  {/* Config preview */}
                  {hasCfg && cred.status==="active" && (
                    <div style={{ background:C.surfaceAlt, borderTop:`1px solid ${C.borderSub}`,
                      padding:"9px 18px", display:"flex", gap:20, flexWrap:"wrap" }}>
                      {[
                        { l:"Enabled Pairs", v:EXCHANGE_ADAPTER_CONFIG[cred.id].enabledPairs?.join(", ") },
                        { l:"Order Range",   v:"$"+EXCHANGE_ADAPTER_CONFIG[cred.id].minOrderUsd+" – $"+EXCHANGE_ADAPTER_CONFIG[cred.id].maxOrderUsd },
                        { l:"Default SL/TP", v:EXCHANGE_ADAPTER_CONFIG[cred.id].stopLossDefault+"% / "+EXCHANGE_ADAPTER_CONFIG[cred.id].takeProfitDefault+"%" },
                      ].map(({l,v})=>(
                        <div key={l} style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <Lbl>{l}</Lbl>
                          <M size={10} color={C.textPri} weight={600}>{v}</M>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Validation run */}
          <div style={{ marginTop:14, padding:"12px 18px", background:C.surface,
            border:`1px solid ${C.border}`, borderRadius:4,
            display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <M size={11} weight={600} style={{ display:"block", marginBottom:3 }}>Re-validate All Credentials</M>
              <M size={10} color={C.textMuted}>Test connectivity and permissions for all active credentials</M>
            </div>
            <GhostBtn onClick={()=>{}}>Run Validation</GhostBtn>
          </div>
        </div>
      )}

      {/* TRADING DEFAULTS */}
      {tab==="trading" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <CardHead title="Order Defaults" sub="Applied when a bot doesn't specify its own values"/>
            <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div>
                <Lbl style={{ display:"block", marginBottom:5 }}>Default Order Type</Lbl>
                <select value={platformSettings.defaultOrderType}
                  onChange={e=>setPlatformSettings(p=>({...p,defaultOrderType:e.target.value}))}
                  style={{ width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:3,
                    padding:"8px 12px",fontFamily:mono,fontSize:11,color:C.textPri,outline:"none" }}>
                  {["market","limit","stop_limit"].map(o=><option key={o} value={o}>{o.replace(/_/g," ").toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <Lbl style={{ display:"block", marginBottom:5 }}>Time in Force</Lbl>
                <select value={platformSettings.defaultTif}
                  onChange={e=>setPlatformSettings(p=>({...p,defaultTif:e.target.value}))}
                  style={{ width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:3,
                    padding:"8px 12px",fontFamily:mono,fontSize:11,color:C.textPri,outline:"none" }}>
                  {["GTC","IOC","FOK"].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Safety Switches"/>
            {[
              { k:"autoRestartBots",    l:"Auto-restart bots after error",          desc:"Bots that stop due to transient errors will restart automatically after 5 minutes." },
              { k:"confirmBeforeTrade", l:"Require confirmation before live orders", desc:"Adds a confirmation step before any order is submitted. Useful for testing new configs." },
              { k:"paperTradingMode",   l:"Paper trading mode (all credentials)",   desc:"Override all credentials to simulate-only. No real orders will be sent. P&L is simulated." },
            ].map(({k,l,desc},i,a)=>(
              <div key={k}>
                <div style={{ padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                  <div style={{ flex:1,marginRight:20 }}>
                    <M size={12} weight={600} style={{ display:"block",marginBottom:3 }}>{l}</M>
                    <M size={10} color={C.textMuted}>{desc}</M>
                  </div>
                  <Toggle value={platformSettings[k]} onChange={v=>setPlatformSettings(p=>({...p,[k]:v}))}/>
                </div>
                {i<a.length-1&&<Divider/>}
              </div>
            ))}
          </Card>

          {platformSettings.paperTradingMode && (
            <div style={{ background:C.amberDim,border:`1px solid ${C.amberMid}`,borderRadius:4,padding:"12px 16px" }}>
              <M size={11} color={C.amber} weight={700} style={{ display:"block",marginBottom:3 }}>
                ⚠ Paper Trading Mode Active
              </M>
              <M size={10} color={C.amber}>All bots are running in simulation. No real orders will execute on any exchange. Disable this to go live.</M>
            </div>
          )}
          <PrimaryBtn onClick={()=>{}}>Save Trading Defaults</PrimaryBtn>
        </div>
      )}

      {/* PLATFORM */}
      {tab==="platform" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <CardHead title="Data & Privacy"/>
            {[
              { l:"Data Retention", v:"365 days", desc:"Trade history and analytics are kept for this period.", action:<GhostBtn small>Change</GhostBtn> },
              { l:"Export My Data", v:"",         desc:"Download a full export of your account data (GDPR).",  action:<GhostBtn small>Request Export</GhostBtn> },
            ].map(({l,v,desc,action},i,a)=>(
              <div key={l}>
                <div style={{ padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                  <div>
                    <M size={12} weight={600} style={{ display:"block",marginBottom:3 }}>{l}</M>
                    <M size={10} color={C.textMuted}>{desc}</M>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                    {v&&<M size={11} color={C.textPri} weight={600}>{v}</M>}
                    {action}
                  </div>
                </div>
                {i<a.length-1&&<Divider/>}
              </div>
            ))}
          </Card>

          <Card>
            <CardHead title="Appearance & Locale"/>
            <div style={{ padding:"16px 18px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
              {[
                { l:"Theme",     opts:["Dark (Default)","System"] },
                { l:"Date Format",opts:["DD MMM YYYY","MM/DD/YYYY","YYYY-MM-DD"] },
                { l:"Number Format",opts:["1,234.56","1.234,56"] },
              ].map(({l,opts})=>(
                <div key={l}>
                  <Lbl style={{ display:"block",marginBottom:5 }}>{l}</Lbl>
                  <select style={{ width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:3,
                    padding:"8px 12px",fontFamily:mono,fontSize:11,color:C.textPri,outline:"none" }}>
                    {opts.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="API Access" sub="Programmatic access to your Stella account"/>
            <div style={{ padding:"16px 18px" }}>
              <div style={{ background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:3,
                padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",
                justifyContent:"space-between" }}>
                <div>
                  <Lbl style={{ display:"block",marginBottom:3 }}>Personal Access Token</Lbl>
                  <M size={11} color={C.textPri} style={{ fontFamily:mono,letterSpacing:"0.06em" }}>stl_live_••••••••••••••••••••K9Q2</M>
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  <TextBtn>Reveal</TextBtn>
                  <GhostBtn small>Rotate</GhostBtn>
                </div>
              </div>
              <M size={9} color={C.textMuted} style={{ lineHeight:1.6 }}>
                Use this token to authenticate with the Stella REST API. Treat it like a password — never expose it in client-side code.
              </M>
            </div>
          </Card>
          <PrimaryBtn onClick={()=>{}}>Save Platform Settings</PrimaryBtn>
        </div>
      )}

      {/* Credential config panel */}
      {selectedCred && <>
        <div onClick={()=>setSelectedCred(null)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:199 }}/>
        <CredentialConfigPanel cred={selectedCred} onClose={()=>setSelectedCred(null)}/>
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELP PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function HelpPage() {
  const [openFaq, setOpenFaq] = useState(null);
  const [search, setSearch] = useState("");
  const [ticketForm, setTicketForm] = useState({ subject:"", category:"trading", message:"" });
  const [ticketSent, setTicketSent] = useState(false);

  const filtered = FAQ.filter(f =>
    !search || f.q.toLowerCase().includes(search.toLowerCase()) ||
    f.a.toLowerCase().includes(search.toLowerCase())
  );

  function submitTicket() {
    if (!ticketForm.subject || !ticketForm.message) return;
    setTicketSent(true);
  }

  const sysStatus = [
    { name:"Trading Engine (Elixir)",  status:"operational",  latency:"42ms"  },
    { name:"API & Platform (NestJS)",  status:"operational",  latency:"120ms" },
    { name:"Market Data Feed",         status:"operational",  latency:"18ms"  },
    { name:"Binance Adapter",          status:"operational",  latency:"65ms"  },
    { name:"Alpaca Adapter",           status:"operational",  latency:"98ms"  },
    { name:"Notification Service",     status:"degraded",     latency:"—"     },
    { name:"RabbitMQ Message Broker",  status:"operational",  latency:"8ms"   },
  ];

  const statusColor = { operational:C.green, degraded:C.amber, outage:C.red };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>Help & Support</M>
        <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>
          Documentation, FAQs, system status, and support tickets
        </M>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:18, alignItems:"start" }}>
        {/* Main column */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Search */}
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
              color:C.textMuted,fontFamily:mono,fontSize:16,pointerEvents:"none" }}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search help articles and FAQs…"
              style={{ width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,
                padding:"12px 16px 12px 42px",fontFamily:mono,fontSize:11,color:C.textPri,
                outline:"none",transition:"border-color 0.15s" }}
              onFocus={e=>e.target.style.borderColor=C.green}
              onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>

          {/* Quicklinks */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {[
              { icon:"📖", label:"Platform Docs",    sub:"Architecture & API reference",   color:C.blue    },
              { icon:"▶",  label:"Getting Started",  sub:"5-minute setup guide",           color:C.green   },
              { icon:"⚡",  label:"Risk Controls",    sub:"Limits, breakers, drawdown",     color:C.amber   },
              { icon:"🔑",  label:"Exchange Setup",   sub:"API keys & permissions guide",   color:C.purple  },
              { icon:"💳",  label:"Billing Guide",    sub:"Fees, invoices, HWM explained",  color:C.cyan    },
              { icon:"⟳",   label:"Bot Configuration",sub:"Strategies, pairs, params",      color:C.green   },
            ].map(link=>(
              <button key={link.label} style={{ background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:4,padding:"14px 16px",cursor:"pointer",textAlign:"left",
                transition:"border-color 0.15s,background 0.15s",display:"block" }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=link.color+"60";
                  e.currentTarget.style.background=C.surfaceHov; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border;
                  e.currentTarget.style.background=C.surface; }}>
                <div style={{ fontSize:18,marginBottom:8 }}>{link.icon}</div>
                <M size={11} weight={700} style={{ display:"block",marginBottom:3 }}>{link.label}</M>
                <M size={9} color={C.textMuted}>{link.sub}</M>
              </button>
            ))}
          </div>

          {/* FAQ */}
          <Card>
            <CardHead title="Frequently Asked Questions"
              sub={search?`${filtered.length} result${filtered.length!==1?"s":""} for "${search}"`:`${FAQ.length} articles`}/>
            {filtered.length===0 ? (
              <div style={{ padding:"30px 18px",textAlign:"center" }}>
                <M size={11} color={C.textMuted}>No results found for "{search}"</M>
              </div>
            ) : filtered.map((faq,i)=>(
              <div key={i}>
                <button onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{
                  width:"100%",background:"transparent",border:"none",cursor:"pointer",
                  padding:"14px 18px",display:"flex",alignItems:"flex-start",
                  justifyContent:"space-between",gap:14,textAlign:"left",
                  transition:"background 0.1s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHov}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <M size={11} color={openFaq===i?C.green:C.textPri} weight={openFaq===i?700:500}
                    style={{ lineHeight:1.5 }}>{faq.q}</M>
                  <span style={{ fontFamily:mono,fontSize:14,color:openFaq===i?C.green:C.textDim,
                    flexShrink:0,marginTop:1,transition:"transform 0.2s",
                    display:"block",transform:openFaq===i?"rotate(45deg)":"none" }}>+</span>
                </button>
                {openFaq===i && (
                  <div style={{ padding:"0 18px 14px",
                    animation:"fadeIn 0.15s ease" }}>
                    <div style={{ background:C.surfaceAlt,borderLeft:`3px solid ${C.green}40`,
                      borderRadius:3,padding:"12px 16px" }}>
                      <M size={10} color={C.textMuted} style={{ lineHeight:1.75,display:"block" }}>{faq.a}</M>
                    </div>
                  </div>
                )}
                {i<filtered.length-1&&<Divider/>}
              </div>
            ))}
          </Card>

          {/* Support ticket */}
          <Card>
            <CardHead title="Contact Support" sub="Typical response time: 2–4 hours"/>
            {ticketSent ? (
              <div style={{ padding:"30px 18px",display:"flex",flexDirection:"column",
                alignItems:"center",gap:12 }}>
                <div style={{ width:48,height:48,borderRadius:"50%",background:C.greenDim,
                  border:`1px solid ${C.greenMid}`,display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:20 }}>✓</div>
                <M size={12} weight={700} color={C.green}>Ticket Submitted</M>
                <M size={10} color={C.textMuted}>We'll respond to james.doe@example.com within 2–4 hours.</M>
                <GhostBtn small onClick={()=>{setTicketSent(false);setTicketForm({subject:"",category:"trading",message:""});}}>
                  Submit Another
                </GhostBtn>
              </div>
            ) : (
              <div style={{ padding:"16px 18px",display:"flex",flexDirection:"column",gap:14 }}>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                  <Input label="Subject" value={ticketForm.subject}
                    onChange={v=>setTicketForm(f=>({...f,subject:v}))} placeholder="Briefly describe your issue"/>
                  <div>
                    <Lbl style={{ display:"block",marginBottom:5 }}>Category</Lbl>
                    <select value={ticketForm.category}
                      onChange={e=>setTicketForm(f=>({...f,category:e.target.value}))}
                      style={{ width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:3,
                        padding:"8px 12px",fontFamily:mono,fontSize:11,color:C.textPri,outline:"none" }}>
                      {["trading","billing","account","technical","exchange","other"].map(c=>(
                        <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <Lbl style={{ display:"block",marginBottom:5 }}>Message</Lbl>
                  <textarea value={ticketForm.message}
                    onChange={e=>setTicketForm(f=>({...f,message:e.target.value}))}
                    placeholder="Describe the issue in detail — include bot names, error messages, and steps to reproduce…"
                    rows={5}
                    onFocus={e=>e.target.style.borderColor=C.green}
                    onBlur={e=>e.target.style.borderColor=C.border}
                    style={{ width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:3,
                      padding:"10px 12px",fontFamily:mono,fontSize:11,color:C.textPri,
                      outline:"none",resize:"vertical",lineHeight:1.6 }}/>
                </div>
                <PrimaryBtn onClick={submitTicket}
                  disabled={!ticketForm.subject||!ticketForm.message}>
                  Submit Ticket
                </PrimaryBtn>
              </div>
            )}
          </Card>
        </div>

        {/* Right sidebar */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* System status */}
          <Card>
            <CardHead title="System Status"/>
            <div style={{ padding:"0 0 4px" }}>
              {sysStatus.map((svc,i)=>{
                const sc=statusColor[svc.status];
                return (
                  <div key={svc.name}>
                    <div style={{ padding:"10px 18px",display:"flex",
                      alignItems:"center",justifyContent:"space-between" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                        <div style={{ width:7,height:7,borderRadius:"50%",background:sc,
                          flexShrink:0,
                          boxShadow:svc.status==="operational"?`0 0 6px ${sc}50`:"none" }}/>
                        <M size={10} color={C.textMid} weight={500}>{svc.name}</M>
                      </div>
                      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                        {svc.latency!=="—" && <M size={9} color={C.textDim}>{svc.latency}</M>}
                        {svc.status!=="operational" &&
                          <Tag color={sc}>{svc.status.toUpperCase()}</Tag>}
                      </div>
                    </div>
                    {i<sysStatus.length-1&&<Divider/>}
                  </div>
                );
              })}
              <div style={{ padding:"10px 18px",borderTop:`1px solid ${C.borderSub}`,
                display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                  <div style={{ width:7,height:7,borderRadius:"50%",background:C.amber }}/>
                  <M size={9} color={C.amber}>1 service degraded</M>
                </div>
                <TextBtn>Status Page →</TextBtn>
              </div>
            </div>
          </Card>

          {/* Support channels */}
          <Card>
            <CardHead title="Support Channels"/>
            <div style={{ padding:"0 0 4px" }}>
              {[
                { icon:"✉",  label:"Email Support",    sub:"Email · Unum plan",    action:"Open Ticket", color:C.green },
                { icon:"💬",  label:"Community Forum",  sub:"Discuss & share tips", action:"Visit",       color:C.blue  },
                { icon:"📚",  label:"Documentation",    sub:"Full API reference",   action:"Open Docs",   color:C.purple },
                { icon:"🐛",  label:"Report a Bug",     sub:"GitHub Issues",        action:"Open Issue",  color:C.amber },
              ].map(({icon,label,sub,action,color},i,a)=>(
                <div key={label}>
                  <div style={{ padding:"12px 18px",display:"flex",
                    alignItems:"center",justifyContent:"space-between" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <div style={{ width:30,height:30,borderRadius:4,background:color+"18",
                        border:`1px solid ${color}30`,display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:13,flexShrink:0 }}>{icon}</div>
                      <div>
                        <M size={11} weight={600} style={{ display:"block",marginBottom:2 }}>{label}</M>
                        <M size={9} color={C.textMuted}>{sub}</M>
                      </div>
                    </div>
                    <TextBtn color={color}>{action} →</TextBtn>
                  </div>
                  {i<a.length-1&&<Divider/>}
                </div>
              ))}
            </div>
          </Card>

          {/* Account info */}
          <Card>
            <CardHead title="Your Account Info"/>
            <div style={{ padding:"0 0 4px" }}>
              {[
                { l:"Plan",       v:"Stella Unum" },
                { l:"Member ID",  v:"STL-00042" },
                { l:"User Since", v:"Nov 2025" },
                { l:"KYC Level",  v:"Enhanced (pending)" },
              ].map(({l,v},i,a)=>(
                <div key={l}>
                  <div style={{ display:"flex",justifyContent:"space-between",padding:"9px 18px" }}>
                    <Lbl>{l}</Lbl>
                    <M size={10} color={C.textPri} weight={600}>{v}</M>
                  </div>
                  {i<a.length-1&&<Divider/>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED SHELL
// ═══════════════════════════════════════════════════════════════════════════════

const NAV_MAIN = [
  {key:"dashboard",  label:"Dashboard",  icon:"▦"},
  {key:"bots",       label:"My Bots",    icon:"⟳", badge:5},
  {key:"strategies", label:"Strategies", icon:"◈"},
  {key:"positions",  label:"Positions",  icon:"⊞", badge:4},
  {key:"analytics",  label:"Analytics",  icon:"∿"},
  {key:"capital",    label:"Capital",    icon:"◎"},
  {key:"risk",       label:"Risk",       icon:"⚡"},
];
const NAV_BOT = [
  {key:"billing",  label:"Billing",  icon:"⊛"},
  {key:"settings", label:"Settings", icon:"⊕"},
  {key:"account",  label:"Account",  icon:"⊙"},
  {key:"help",     label:"Help",     icon:"?"},
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
        {NAV_MAIN.map(item => {
          const a = active === item.key;
          return (
            <button key={item.key} onClick={()=>setActive(item.key)} style={{
              width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 16px",
              background:a?`${C.green}10`:"transparent", border:"none",
              borderLeft:`2px solid ${a?C.green:"transparent"}`, cursor:"pointer" }}>
              <span style={{ fontSize:13, color:a?C.green:C.textMuted, fontFamily:mono }}>{item.icon}</span>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flex:1 }}>
                <M size={11} color={a?C.green:C.textMid} weight={a?700:500}>{item.label}</M>
                {item.badge && <span style={{ background:a?C.green:C.border, color:a?"#0A0D14":C.textMuted,
                  borderRadius:10, padding:"1px 6px", fontFamily:mono, fontSize:9, fontWeight:700 }}>{item.badge}</span>}
              </div>
            </button>
          );
        })}
        <Divider my={10} />
        {NAV_BOT.map(item => {
          const a = active === item.key;
          return (
            <button key={item.key} onClick={()=>setActive(item.key)} style={{
              width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 16px",
              background:a?`${C.green}10`:"transparent", border:"none",
              borderLeft:`2px solid ${a?C.green:"transparent"}`, cursor:"pointer" }}>
              <span style={{ fontSize:12, color:a?C.green:C.textDim, fontFamily:mono }}>{item.icon}</span>
              <M size={11} color={a?C.green:C.textMuted} weight={a?700:500}>{item.label}</M>
            </button>
          );
        })}
      </nav>
      <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}` }}>
        <div style={{ background:C.greenDim, border:`1px solid ${C.greenMid}`, borderRadius:3, padding:"8px 10px" }}>
          <Lbl style={{ display:"block", marginBottom:3 }}>Stella Unum</Lbl>
          <M size={9} color={C.textMuted}>3 bots · $16,600 deployed</M>
        </div>
      </div>
    </div>
  );
}

function Topbar({ page }) {
  const labels = { billing:"Billing", account:"Account", settings:"Settings", help:"Help & Support" };
  return (
    <div style={{ height:52, display:"flex", alignItems:"center", padding:"0 24px", gap:16,
      background:C.sidebar, borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
        <Lbl>Portal</Lbl>
        <M color={C.textDim}>/</M>
        <M size={11} color={C.textPri} weight={600}>{labels[page]||page}</M>
      </div>
      <div style={{ width:8, height:8, borderRadius:"50%", background:C.amber }}/>
      <M size={9} color={C.amber} weight={700} caps style={{ letterSpacing:"0.1em" }}>KYC Under Review</M>
      <div style={{ width:30, height:30, borderRadius:"50%", background:`${C.green}25`,
        border:`1px solid ${C.green}40`, display:"flex", alignItems:"center",
        justifyContent:"center", cursor:"pointer" }}>
        <M size={11} color={C.green} weight={700}>JD</M>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════

export default function StellaSettingsPages() {
  const [page, setPage] = useState("billing");

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
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
        button:focus,input:focus,select:focus,textarea:focus{outline:none}
        select option{background:${C.surface};color:${C.textPri}}
        textarea{resize:vertical}
      `}</style>

      <div style={{ display:"flex", minHeight:"100vh", background:C.bg }}>
        <Sidebar active={page} setActive={setPage}/>
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
          <Topbar page={page}/>

          {/* Sub-nav for this section */}
          <div style={{ background:C.sidebar, borderBottom:`1px solid ${C.border}`,
            padding:"0 24px", display:"flex", gap:0 }}>
            {[
              { k:"billing",  l:"Billing"  },
              { k:"account",  l:"Account"  },
              { k:"settings", l:"Settings" },
              { k:"help",     l:"Help"     },
            ].map(p=>(
              <button key={p.k} onClick={()=>setPage(p.k)} style={{
                padding:"10px 20px", background:"transparent", border:"none",
                borderBottom:`2px solid ${page===p.k?C.green:"transparent"}`,
                fontFamily:mono, fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase",
                color:page===p.k?C.green:C.textMuted, cursor:"pointer",
                fontWeight:page===p.k?700:500 }}>
                {p.l}
              </button>
            ))}
          </div>

          <div style={{ flex:1, padding:"20px 24px", overflowY:"auto" }}>
            {page==="billing"  && <BillingPage/>}
            {page==="account"  && <AccountPage/>}
            {page==="settings" && <SettingsPage/>}
            {page==="help"     && <HelpPage/>}
          </div>
        </div>
      </div>
    </>
  );
}
