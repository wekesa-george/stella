"use client";

import { useState } from "react";

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
  redDim:     "#F04F5912",
  redMid:     "#F04F5935",
  amber:      "#F59E0B",
  amberDim:   "#F59E0B12",
  amberMid:   "#F59E0B35",
  blue:       "#3B82F6",
  textPri:    "#C8CDE0",
  textMid:    "#A0AAC0",
  textMuted:  "#8B95B0",
  textDim:    "#6A7590",
};
const mono = "'JetBrains Mono', 'Fira Code', monospace";

// MOCK DATA
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

function PrimaryBtn({ children, onClick, small=false, disabled=false, danger=false }: any) {
  return <button onClick={onClick} disabled={disabled} style={{
    background: disabled ? "#1A2030" : danger ? C.red : C.green,
    color: disabled ? "#3D4560" : danger ? "#fff" : "#0A0D14",
    border: "none", borderRadius:3, padding:small?"6px 14px":"9px 20px",
    fontFamily:mono, fontSize:small?9:10, letterSpacing:"0.1em", textTransform:"uppercase",
    fontWeight:700, cursor:disabled?"not-allowed":"pointer",
    display:"inline-flex", alignItems:"center", gap:6 }}>{children}</button>;
}

function GhostBtn({ children, onClick, small=false, danger=false }: any) {
  return <button onClick={onClick} style={{
    background:"transparent", border:`1px solid ${danger?C.red+"50":C.border}`, borderRadius:3,
    padding:small?"5px 12px":"9px 16px", fontFamily:mono, fontSize:small?9:10,
    letterSpacing:"0.1em", textTransform:"uppercase", color:danger?C.red:C.textMuted,
    cursor:"pointer", fontWeight:600 }}>{children}</button>;
}

function TextBtn({ children, onClick, color=C.green }: any) {
  return <button onClick={onClick} style={{ background:"transparent", border:"none",
    fontFamily:mono, fontSize:9, color, letterSpacing:"0.08em", textTransform:"uppercase",
    cursor:"pointer", fontWeight:700, padding:"2px 0" }}>{children}</button>;
}

function Input({ label, value, onChange, type="text", placeholder="", disabled=false, prefix="" }: any) {
  const [focused, setFocused] = useState(false);
  return <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
    {label && <Lbl>{label}</Lbl>}
    <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
      {prefix && <span style={{ position:"absolute", left:10, fontFamily:mono, fontSize:11,
        color:C.textMuted, pointerEvents:"none" }}>{prefix}</span>}
      <input type={type} value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder}
        disabled={disabled}
        onFocus={e => { setFocused(true); e.currentTarget.style.borderColor = C.green; }}
        onBlur={e => { setFocused(false); e.currentTarget.style.borderColor = C.border; }}
        style={{ width:"100%", background:disabled?C.surfaceAlt:C.bg, border:`1px solid ${C.border}`,
          borderRadius:3, padding:`8px ${prefix?"30px":"12px"} 8px 12px`, fontFamily:mono,
          fontSize:11, color:disabled?C.textMuted:C.textPri, outline:"none",
          transition:"border-color 0.15s" }} />
    </div>
  </div>;
}

function Toggle({ value, onChange }: any) {
  return <button onClick={() => onChange?.(!value)} style={{
    width:38, height:21, borderRadius:11, background:value?C.green:C.border,
    border:"none", cursor:"pointer", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
    <div style={{ position:"absolute", top:3, left:value?18:3, width:15, height:15,
      borderRadius:"50%", background:value?"#0A0D14":"#6B7590", transition:"left 0.2s" }} />
  </button>;
}

export default function AccountPage() {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState({
    firstName:"James", lastName:"Doe", username:"jdoe", email:"james.doe@example.com",
    phone:"+256 701 234 567", country:"Uganda", timezone:"Africa/Kampala",
    currency:"USD", language:"en",
  });
  const [notifPrefs, setNotifPrefs] = useState({
    emailTradeAlerts:true, emailRiskAlerts:true, emailBilling:true, emailNewsletter:false,
    pushTradeAlerts:true, pushRiskAlerts:true, pushPriceAlerts:false,
    smsRiskAlerts:false, smsBilling:false,
  });
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        select option { background: ${C.surface}; }
      `}</style>

      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>Account</M>
          <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>Profile, security, and preferences</M>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:18 }}>
        {[{k:"profile",l:"Profile"},{k:"security",l:"Security"},{k:"notifications",l:"Notifications"},{k:"activity",l:"Activity"}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding:"9px 20px", background:"transparent", border:"none",
            borderBottom:`2px solid ${tab===t.k?C.green:"transparent"}`,
            fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
            color:tab===t.k?C.green:C.textMuted, cursor:"pointer", fontWeight:tab===t.k?700:500 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* PROFILE */}
      {tab === "profile" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Card>
              <CardHead title="Personal Information" />
              <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <Input label="First Name" value={profile.firstName} onChange={v => setProfile(p => ({...p, firstName:v}))} />
                <Input label="Last Name"  value={profile.lastName}  onChange={v => setProfile(p => ({...p, lastName:v}))} />
                <Input label="Username"   value={profile.username}  onChange={v => setProfile(p => ({...p, username:v}))} prefix="@" />
                <Input label="Email"      value={profile.email}     onChange={v => setProfile(p => ({...p, email:v}))} type="email" />
                <Input label="Phone"      value={profile.phone}     onChange={v => setProfile(p => ({...p, phone:v}))} />
                <div>
                  <Lbl style={{ display:"block", marginBottom:5 }}>Country</Lbl>
                  <select value={profile.country} onChange={e => setProfile(p => ({...p, country:e.target.value}))}
                    style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
                      padding:"8px 12px", fontFamily:mono, fontSize:11, color:C.textPri, outline:"none" }}>
                    {["Uganda","Kenya","Nigeria","Ghana","South Africa","Tanzania","Ethiopia"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>

            <Card>
              <CardHead title="Preferences" />
              <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
                {[
                  { l:"Timezone", k:"timezone", opts:["Africa/Kampala","Africa/Nairobi","Europe/London","America/New_York"] },
                  { l:"Currency", k:"currency", opts:["USD","EUR","GBP","KES","UGX"] },
                  { l:"Language", k:"language", opts:["en","fr","sw"] },
                ].map(({l, k, opts}) => (
                  <div key={k}>
                    <Lbl style={{ display:"block", marginBottom:5 }}>{l}</Lbl>
                    <select value={profile[k as keyof typeof profile]} onChange={e => setProfile(p => ({...p, [k]:e.target.value}))}
                      style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
                        padding:"8px 12px", fontFamily:mono, fontSize:11, color:C.textPri, outline:"none" }}>
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ display:"flex", gap:10 }}>
              <PrimaryBtn onClick={handleSave}>{saved ? "✓ Saved" : "Save Changes"}</PrimaryBtn>
              <GhostBtn onClick={() => {}}>Discard</GhostBtn>
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Avatar */}
            <Card>
              <CardHead title="Profile Picture" />
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
              <CardHead title="KYC Status" />
              <div style={{ padding:"14px 18px" }}>
                {[
                  { l:"Level",   v:"Enhanced", c:C.amber },
                  { l:"Status",  v:"Under Review", c:C.amber },
                  { l:"Provider",v:"Sumsub", c:C.textMid },
                  { l:"Submitted",v:"Jan 28 2026", c:C.textMid },
                ].map(({l, v, c}, i, a) => (
                  <div key={l}>
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0" }}>
                      <Lbl>{l}</Lbl>
                      <M size={11} color={c} weight={600}>{v}</M>
                    </div>
                    {i < a.length - 1 && <Divider />}
                  </div>
                ))}
                <div style={{ marginTop:10 }}>
                  <div style={{ background:C.amberDim, border:`1px solid ${C.amberMid}`, borderRadius:3, padding:"8px 12px" }}>
                    <M size={9} color={C.amber}>Verification typically takes 1–3 business days.</M>
                  </div>
                </div>
              </div>
            </Card>

            {/* Referral */}
            <Card>
              <CardHead title="Referral Code" />
              <div style={{ padding:"14px 18px" }}>
                <div style={{ background:C.surfaceAlt, border:`1px solid ${C.greenMid}`,
                  borderRadius:3, padding:"10px 12px", display:"flex",
                  justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <M size={14} color={C.green} weight={700} style={{ letterSpacing:"0.18em" }}>JDOE-7X2K</M>
                  <TextBtn onClick={() => {}}>Copy</TextBtn>
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
      {tab === "security" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* MFA */}
          <Card>
            <CardHead title="Two-Factor Authentication" sub="Adds a second layer of protection to your account" />
            <div style={{ padding:"16px 18px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div>
                  <M size={12} weight={600} style={{ display:"block", marginBottom:4 }}>Authenticator App (TOTP)</M>
                  <M size={10} color={C.textMuted}>{mfaEnabled ? "Enabled · Google Authenticator" : "Disabled"}</M>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <Tag color={mfaEnabled ? C.green : C.red}>{mfaEnabled ? "ENABLED" : "DISABLED"}</Tag>
                  <Toggle value={mfaEnabled} onChange={setMfaEnabled} />
                </div>
              </div>
              {!mfaEnabled && (
                <div style={{ background:C.redDim, border:`1px solid ${C.redMid}`, borderRadius:4, padding:"10px 14px" }}>
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
            <CardHead title="Password" />
            <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, maxWidth:500 }}>
              <Input label="Current Password" type="password" value="" onChange={() => {}} placeholder="••••••••" />
              <div />
              <Input label="New Password"     type="password" value="" onChange={() => {}} placeholder="••••••••" />
              <Input label="Confirm Password" type="password" value="" onChange={() => {}} placeholder="••••••••" />
              <PrimaryBtn onClick={() => {}}>Update Password</PrimaryBtn>
            </div>
          </Card>

          {/* Active sessions */}
          <Card>
            <CardHead title="Active Sessions" sub={`${SESSIONS.length} sessions`}
              right={<GhostBtn small danger onClick={() => {}}>Revoke All Others</GhostBtn>} />
            {SESSIONS.map((sess, i) => (
              <div key={sess.id}>
                <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:4, background:C.surfaceAlt,
                      border:`1px solid ${C.border}`, display:"flex", alignItems:"center",
                      justifyContent:"center", fontSize:16, flexShrink:0 }}>
                      {sess.device.includes("iOS") ? "📱" : "💻"}
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
                  {!sess.current && <GhostBtn small danger onClick={() => {}}>Revoke</GhostBtn>}
                </div>
                {i < SESSIONS.length - 1 && <Divider />}
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
              <PrimaryBtn danger onClick={() => {}}>Delete Account</PrimaryBtn>
            </div>
          </Card>
        </div>
      )}

      {/* NOTIFICATIONS */}
      {tab === "notifications" && (
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
          ].map(section => (
            <Card key={section.title}>
              <CardHead title={section.title} sub={section.sub} />
              {section.items.map((item, i) => (
                <div key={item.k}>
                  <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <M size={12} weight={600} style={{ display:"block", marginBottom:3 }}>{item.l}</M>
                      <M size={10} color={C.textMuted}>{item.desc}</M>
                    </div>
                    <Toggle value={notifPrefs[item.k as keyof typeof notifPrefs]} onChange={v => setNotifPrefs(p => ({...p, [item.k]:v}))} />
                  </div>
                  {i < section.items.length - 1 && <Divider />}
                </div>
              ))}
            </Card>
          ))}
          <PrimaryBtn onClick={handleSave}>{saved ? "✓ Saved" : "Save Preferences"}</PrimaryBtn>
        </div>
      )}

      {/* ACTIVITY LOG */}
      {tab === "activity" && (
        <Card>
          <CardHead title="Account Activity" sub="Last 30 days" />
          {ACTIVITY_LOG.map((ev, i) => (
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
              {i < ACTIVITY_LOG.length - 1 && <Divider />}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
