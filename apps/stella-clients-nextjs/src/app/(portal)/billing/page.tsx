"use client";

import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// DESIGN TOKENS
const C = {
  bg:         "#0B0D11",
  surface:    "#12151C",
  surfaceAlt: "#0E111A",
  border:     "#1C2338",
  borderSub:  "#161B28",
  green:      "#00E5A0",
  greenDim:   "#00E5A012",
  greenMid:   "#00E5A035",
  red:        "#F04F59",
  amber:      "#F59E0B",
  blue:       "#3B82F6",
  purple:     "#A78BFA",
  textPri:    "#C8CDE0",
  textMid:    "#6B7590",
  textMuted:  "#4A5578",
  textDim:    "#2A3050",
};
const mono = "'JetBrains Mono', 'Fira Code', monospace";

// MOCK DATA
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

function Divider({ my=0 }: any) {
  return <div style={{ height:1, background:C.borderSub, margin:`${my}px 0` }} />;
}

function Tag({ children, color=C.green }: any) {
  return <span style={{ background:color+"18", border:`1px solid ${color}35`, borderRadius:2,
    padding:"2px 7px", fontFamily:mono, fontSize:9, color, fontWeight:700, letterSpacing:"0.1em",
    display:"inline-flex", alignItems:"center", gap:4 }}>{children}</span>;
}

function Card({ children, style={} }: any) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, ...style }}>{children}</div>;
}

function CardHead({ title, sub, right, style={} }: any) {
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

function StatBox({ label, value, color=C.textPri, sub="" }: any) {
  return (
    <div style={{ padding:"14px 18px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:4 }}>
      <Lbl>{label}</Lbl>
      <M size={20} color={color} weight={700} style={{ display:"block", marginTop:6, lineHeight:1 }}>{value}</M>
      {sub && <M size={9} color={C.textMuted} style={{ display:"block", marginTop:4 }}>{sub}</M>}
    </div>
  );
}

function PrimaryBtn({ children, onClick, small=false, disabled=false, full=false }: any) {
  return <button onClick={onClick} disabled={disabled} style={{
    background: disabled ? "#1A2030" : C.green,
    color: disabled ? "#3D4560" : "#0A0D14",
    border: "none", borderRadius:3, padding:small?"6px 14px":"9px 20px",
    fontFamily:mono, fontSize:small?9:10, letterSpacing:"0.1em", textTransform:"uppercase",
    fontWeight:700, cursor:disabled?"not-allowed":"pointer", width:full?"100%":"auto",
    display:"inline-flex", alignItems:"center", gap:6 }}>{children}</button>;
}

function GhostBtn({ children, onClick, small=false, danger=false, full=false }: any) {
  return <button onClick={onClick} style={{
    background:"transparent", border:`1px solid ${danger?C.red+"50":C.border}`, borderRadius:3,
    padding:small?"5px 12px":"9px 16px", fontFamily:mono, fontSize:small?9:10,
    letterSpacing:"0.1em", textTransform:"uppercase", color:danger?C.red:C.textMuted,
    cursor:"pointer", fontWeight:600, width:full?"100%":"auto" }}>{children}</button>;
}

function TextBtn({ children, onClick, color=C.green }: any) {
  return <button onClick={onClick} style={{ background:"transparent", border:"none",
    fontFamily:mono, fontSize:9, color, letterSpacing:"0.08em", textTransform:"uppercase",
    cursor:"pointer", fontWeight:700, padding:"2px 0" }}>{children}</button>;
}

function ProgressBar({ value, max, color=C.green }: any) {
  const pct = Math.min((value/max)*100, 100);
  return <div style={{ height:5, background:C.border, borderRadius:3, overflow:"hidden" }}>
    <div style={{ width:pct+"%", height:"100%", background:`linear-gradient(90deg,${color}80,${color})`,
      borderRadius:3, transition:"width 0.4s" }}/>
  </div>;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, padding:"8px 12px" }}>
    <Lbl style={{ display:"block", marginBottom:4 }}>{label}</Lbl>
    {payload.map((p: any) => (
      <M key={p.name} size={12} color={p.color || C.green} weight={700} style={{ display:"block" }}>
        ${p.value.toLocaleString()}
      </M>
    ))}
  </div>;
}

export default function BillingPage() {
  const [tab, setTab] = useState("overview");
  const [cancelOpen, setCancelOpen] = useState(false);

  const currentPlan = PLANS.find(p => p.current);
  const nextBillDate = "Mar 01 2026";
  const hwm = 11240;
  const currentEquity = 11240;
  const profitAboveHwm = 0;

  const invoiceColor: any = { paid:C.green, overdue:C.red, refunded:C.amber, draft:C.textMuted, void:C.textDim };
  const methodLabel: any = { stripe:"Stripe", pegpay_momo:"Mobile Money (PegPay)", manual:"Manual" };

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      `}</style>

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
        {[{k:"overview",l:"Overview"},{k:"plan",l:"Plan"},{k:"invoices",l:"Invoices"},{k:"performance",l:"Performance Fees"}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding:"9px 20px", background:"transparent", border:"none",
            borderBottom:`2px solid ${tab===t.k?C.green:"transparent"}`,
            fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
            color:tab===t.k?C.green:C.textMuted, cursor:"pointer", fontWeight:tab===t.k?700:500 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && <>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
          {[
            { l:"Current Plan",    v:currentPlan?.name || "",       c:C.green  },
            { l:"Next Bill",       v:fmt.abs(49),             c:C.textPri, sub:nextBillDate },
            { l:"Perf Fee (MTD)",  v:fmt.abs(93.60),          c:C.amber,  sub:"15% of $624 above HWM" },
            { l:"Total Paid YTD",  v:fmt.abs(361.20),         c:C.textPri },
          ].map(s => <StatBox key={s.l} label={s.l} value={s.v} color={s.c} sub={s.sub} />)}
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
                <GhostBtn small onClick={() => setTab("plan")}>Change Plan</GhostBtn>
                <GhostBtn small danger onClick={() => setCancelOpen(true)}>Cancel</GhostBtn>
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
              ].map(({l,v}, i) => (
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
          <CardHead title="High-Water Mark Tracker" sub="Performance fee only applies to profit above this level" />
          <div style={{ padding:"16px 18px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px 0", marginBottom:16 }}>
              {[
                { l:"High-Water Mark",  v:"$"+hwm.toLocaleString(),         c:C.textPri },
                { l:"Current Equity",   v:"$"+currentEquity.toLocaleString(), c:C.green },
                { l:"Profit Above HWM", v:fmt.abs(profitAboveHwm),           c:profitAboveHwm>0?C.green:C.textMuted },
              ].map(({l,v,c}) => (
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
              <ProgressBar value={currentEquity} max={hwm * 1.2} color={C.green} />
            </div>
          </div>
        </Card>
      </>}

      {/* PLAN */}
      {tab === "plan" && <>
        <M size={11} color={C.textMuted} style={{ display:"block", marginBottom:18, lineHeight:1.6 }}>
          Upgrades take effect immediately with prorated billing. Downgrades apply at end of current cycle.
        </M>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
          {PLANS.map(plan => (
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
                  {plan.price === null ? (
                    <M size={20} color={plan.color} weight={700}>Custom</M>
                  ) : plan.price === 0 ? (
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
                {plan.features.map(f => (
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
                ) : plan.price === null ? (
                  <GhostBtn full>Contact Sales</GhostBtn>
                ) : (
                  <PrimaryBtn full onClick={() => {}} disabled={false}>
                    {PLANS.indexOf(plan) < PLANS.indexOf(currentPlan!) ? "Downgrade" : "Upgrade"}
                  </PrimaryBtn>
                )}
              </div>
            </div>
          ))}
        </div>
      </>}

      {/* INVOICES */}
      {tab === "invoices" && <>
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <GhostBtn small>Export All CSV</GhostBtn>
        </div>
        <Card>
          <div style={{ display:"grid",
            gridTemplateColumns:"110px 160px 120px 100px 160px 120px 80px",
            padding:"9px 18px", gap:0 }}>
            {["Invoice","Type","Period","Amount","Method","Status",""].map(h => <Lbl key={h}>{h}</Lbl>)}
          </div>
          <Divider />
          {INVOICES.map((inv, i) => {
            const tc = invoiceColor[inv.status] || C.textMuted;
            const typeColor = inv.type === "performance_fee" ? C.amber : C.blue;
            return (
              <div key={inv.id}>
                <div style={{ display:"grid",
                  gridTemplateColumns:"110px 160px 120px 100px 160px 120px 80px",
                  padding:"11px 18px", gap:0, alignItems:"center",
                  background:i%2===0?"transparent":C.surfaceAlt+"60" }}>
                  <M size={11} color={C.green} weight={700}>{inv.id}</M>
                  <Tag color={typeColor}>
                    {inv.type === "performance_fee" ? "PERF FEE" : "SUBSCRIPTION"}
                  </Tag>
                  <M size={10} color={C.textMuted}>{inv.period}</M>
                  <M size={11} color={C.textPri} weight={700}>{fmt.abs(inv.amount)}</M>
                  <M size={10} color={C.textMuted}>{methodLabel[inv.method]}</M>
                  <Tag color={tc}>{inv.status.toUpperCase()}</Tag>
                  <TextBtn onClick={() => {}}>PDF ↓</TextBtn>
                </div>
                {i < INVOICES.length - 1 && <Divider />}
              </div>
            );
          })}
        </Card>
      </>}

      {/* PERFORMANCE FEES */}
      {tab === "performance" && <>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Card>
            <CardHead title="Equity History" sub="Portfolio growth vs high-water mark" />
            <div style={{ padding:"8px 0" }}>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={EQUITY_HISTORY} margin={{ top:4, right:20, bottom:0, left:20 }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={C.green} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="d" tick={{ fontFamily:mono, fontSize:8, fill:C.textMuted }} tickLine={false} axisLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontFamily:mono, fontSize:8, fill:C.textMuted }} tickLine={false} axisLine={false} tickFormatter={v => "$" + v.toLocaleString()} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="v" stroke={C.green} strokeWidth={1.5} fill="url(#eqGrad)" dot={false} activeDot={{ r:3, fill:C.green, stroke:C.surface, strokeWidth:2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHead title="Fee Summary" sub="Fees accrued and invoiced" />
            <div style={{ padding:"14px 18px" }}>
              {[
                { l:"Performance Fee Rate", v:"15%", c:C.textPri },
                { l:"HWM at Period Start",  v:"$9,800", c:C.textMid },
                { l:"HWM at Period End",    v:"$11,240", c:C.green },
                { l:"Realized P&L (MTD)",   v:"+$832.00", c:C.green },
                { l:"Profit Above HWM",     v:"$624.00", c:C.amber },
                { l:"Fee Accrued (MTD)",    v:"$93.60", c:C.amber },
                { l:"Next Fee Invoice",     v:"Mar 01 2026", c:C.textMuted },
              ].map(({l,v,c}, i) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0",
                  borderTop: i > 0 ? `1px solid ${C.borderSub}` : "none" }}>
                  <Lbl>{l}</Lbl>
                  <M size={11} color={c} weight={600}>{v}</M>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Performance snapshot table */}
        <Card>
          <CardHead title="Performance Fee History" sub="Monthly performance fee calculations" />
          <div style={{ display:"grid",
            gridTemplateColumns:"120px 110px 110px 110px 110px 90px 100px 90px",
            padding:"9px 18px", gap:0 }}>
            {["Period","Real P&L","HWM Start","HWM End","Profit > HWM","Fee %","Fee USD","Status"].map(h => <Lbl key={h}>{h}</Lbl>)}
          </div>
          <Divider />
          {PERF_SNAPSHOTS.map((snap, i) => (
            <div key={snap.period}>
              <div style={{ display:"grid",
                gridTemplateColumns:"120px 110px 110px 110px 110px 90px 100px 90px",
                padding:"11px 18px", gap:0, alignItems:"center",
                background:i%2===0?"transparent":C.surfaceAlt+"60" }}>
                <M size={11} weight={700}>{snap.period}</M>
                <M size={11} color={snap.realPnl >= 0 ? C.green : C.red} weight={600}>{fmt.usd(snap.realPnl)}</M>
                <M size={11} color={C.textMid}>${snap.hwmStart.toLocaleString()}</M>
                <M size={11} color={C.green} weight={600}>${snap.hwmEnd.toLocaleString()}</M>
                <M size={11} color={C.amber}>${snap.profitAboveHwm.toLocaleString()}</M>
                <M size={11} color={C.textPri}>{snap.feePct}%</M>
                <M size={11} color={C.amber} weight={700}>${snap.feeUsd.toFixed(2)}</M>
                <Tag color={snap.finalized ? C.green : C.amber}>
                  {snap.finalized ? "PAID" : "ACCRUING"}
                </Tag>
              </div>
              {i < PERF_SNAPSHOTS.length - 1 && <Divider />}
            </div>
          ))}
        </Card>
      </>}
    </div>
  );
}
