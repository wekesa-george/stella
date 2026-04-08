"use client";

import { useState } from "react";
import { useFont } from "@/contexts/FontContext";

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

const EXCHANGE_ADAPTER_CONFIG: any = {
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

// COMPONENTS
function M({ size=11, color=C.textPri, weight=500, caps=false, style={}, children }: any) {
  return <span style={{ fontFamily:mono, fontSize:size, color, fontWeight:weight,
    letterSpacing:caps?"0.11em":"0.03em", textTransform:caps?"uppercase":"none" as any, ...style }}>{children}</span>;
}

function Lbl({ children, color=C.textMuted, style={} }: any) {
  return <M size={9} color={color} weight={600} caps style={{ letterSpacing:"0.13em", ...style }}>{children}</M>;
}

function Divider() {
  return <div style={{ height:1, background:C.borderSub }} />;
}

function FontSizeSelector() {
  const { config, setScale } = useFont();

  const scaleDescriptions = {
    compact: "Compact (Smaller text)",
    normal: "Normal (Recommended)",
    comfortable: "Comfortable (Larger)",
    large: "Large (Accessibility)",
  };

  return (
    <div>
      <Lbl style={{ display:"block", marginBottom:5 }}>Font Size</Lbl>
      <select
        value={config.scale}
        onChange={(e) => setScale(e.target.value as any)}
        style={{
          width:"100%",
          background:C.bg,
          border:`1px solid ${C.border}`,
          borderRadius:3,
          padding:"8px 12px",
          fontFamily:mono,
          fontSize:11,
          color:C.textPri,
          outline:"none"
        }}
      >
        {Object.entries(scaleDescriptions).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <M size={9} color={C.textMuted} style={{ display:"block", marginTop:5, lineHeight:1.5 }}>
        Changes apply immediately across the entire application
      </M>
    </div>
  );
}

function Tag({ children, color=C.green }: any) {
  return <span style={{ background:color+"18", border:`1px solid ${color}35`, borderRadius:2,
    padding:"2px 7px", fontFamily:mono, fontSize:9, color, fontWeight:700, letterSpacing:"0.1em",
    display:"inline-flex", alignItems:"center", gap:4 }}>{children}</span>;
}

function Card({ children, style={} }: any) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, ...style }}>{children}</div>;
}

function CardHead({ title, sub }: any) {
  return <>
    <div style={{ padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div>
        <M size={11} weight={700} style={{ letterSpacing:"0.06em", display:"block" }}>{title}</M>
        {sub && <Lbl style={{ marginTop:3, display:"block" }}>{sub}</Lbl>}
      </div>
    </div>
    <Divider />
  </>;
}

function PrimaryBtn({ children, onClick, small=false }: any) {
  return <button onClick={onClick} style={{
    background: C.green,
    color: "#0A0D14",
    border: "none", borderRadius:3, padding:small?"6px 14px":"9px 20px",
    fontFamily:mono, fontSize:small?9:10, letterSpacing:"0.1em", textTransform:"uppercase",
    fontWeight:700, cursor:"pointer",
    display:"inline-flex", alignItems:"center", gap:6 }}>{children}</button>;
}

function GhostBtn({ children, onClick, small=false }: any) {
  return <button onClick={onClick} style={{
    background:"transparent", border:`1px solid ${C.border}`, borderRadius:3,
    padding:small?"5px 12px":"9px 16px", fontFamily:mono, fontSize:small?9:10,
    letterSpacing:"0.1em", textTransform:"uppercase", color:C.textMuted,
    cursor:"pointer", fontWeight:600 }}>{children}</button>;
}

function TextBtn({ children, onClick, color=C.green }: any) {
  return <button onClick={onClick} style={{ background:"transparent", border:"none",
    fontFamily:mono, fontSize:9, color, letterSpacing:"0.08em", textTransform:"uppercase",
    cursor:"pointer", fontWeight:700, padding:"2px 0" }}>{children}</button>;
}

function Toggle({ value, onChange }: any) {
  return <button onClick={() => onChange?.(!value)} style={{
    width:38, height:21, borderRadius:11, background:value?C.green:C.border,
    border:"none", cursor:"pointer", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
    <div style={{ position:"absolute", top:3, left:value?18:3, width:15, height:15,
      borderRadius:"50%", background:value?"#0A0D14":"#6B7590", transition:"left 0.2s" }} />
  </button>;
}

export default function SettingsPage() {
  const [tab, setTab] = useState("exchanges");
  const [selectedCred, setSelectedCred] = useState<any>(null);
  const [platformSettings, setPlatformSettings] = useState({
    autoRestartBots: true,
    defaultOrderType: "market",
    defaultTif: "GTC",
    paperTradingMode: false,
    confirmBeforeTrade: false,
  });

  const statusColor: any = { active:C.green, failed_validation:C.red, pending_validation:C.amber };

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        select option { background: ${C.surface}; }
        @keyframes slideIn { from{transform:translateX(30px);opacity:0;} to{transform:none;opacity:1;} }
      `}</style>

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
        {[{k:"exchanges",l:"Exchange Credentials"},{k:"trading",l:"Trading Defaults"},{k:"platform",l:"Platform"}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding:"9px 20px", background:"transparent", border:"none",
            borderBottom:`2px solid ${tab===t.k?C.green:"transparent"}`,
            fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
            color:tab===t.k?C.green:C.textMuted, cursor:"pointer", fontWeight:tab===t.k?700:500 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* EXCHANGE CREDENTIALS */}
      {tab === "exchanges" && (
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
              { l:"Active", n:EXCHANGE_CREDENTIALS.filter(c => c.status === "active").length, c:C.green },
              { l:"Failed", n:EXCHANGE_CREDENTIALS.filter(c => c.status === "failed_validation").length, c:C.red },
            ].map(s => (
              <div key={s.l} style={{ background:s.c+"18", border:`1px solid ${s.c}35`,
                borderRadius:3, padding:"4px 12px", display:"flex", gap:7, alignItems:"center" }}>
                <Lbl color={s.c}>{s.l}</Lbl>
                <M size={12} color={s.c} weight={700}>{s.n}</M>
              </div>
            ))}
          </div>

          {/* Credential cards */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {EXCHANGE_CREDENTIALS.map(cred => {
              const sc = statusColor[cred.status] || C.textMuted;
              const hasCfg = !!EXCHANGE_ADAPTER_CONFIG[cred.id];
              return (
                <div key={cred.id} style={{ background:C.surface, border:`1px solid ${C.border}`,
                  borderRadius:4, overflow:"hidden" }}>
                  {/* Main row */}
                  <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:14 }}>
                    {/* Logo */}
                    <div style={{ width:40, height:40, borderRadius:6, background:cred.lc+"20",
                      border:`1px solid ${cred.lc}30`, display:"flex", alignItems:"center",
                      justifyContent:"center", fontFamily:mono, fontSize:15, fontWeight:700,
                      color:cred.lc, flexShrink:0 }}>{cred.logo}</div>

                    {/* Info */}
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <M size={12} weight={700}>{cred.exchange}</M>
                        <M size={11} color={C.textMuted}>·</M>
                        <M size={12} color={C.textMid}>{cred.label}</M>
                        <Tag color={sc}>{cred.status === "active" ? "ACTIVE" : "FAILED"}</Tag>
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
                          <Lbl color={cred.latencyMs < 60 ? C.green : C.amber}>{cred.latencyMs}ms latency</Lbl>
                        </>}
                      </div>
                    </div>

                    {/* Permissions */}
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      {cred.permissions.map(p => (
                        <Tag key={p} color={p === "read" ? C.textMid : p === "trade" ? C.blue : C.amber}>{p}</Tag>
                      ))}
                    </div>

                    {/* Actions */}
                    <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                      <GhostBtn small onClick={() => setSelectedCred(cred)}>
                        Configure
                      </GhostBtn>
                      {cred.status === "failed_validation" && (
                        <PrimaryBtn small onClick={() => setSelectedCred(cred)}>Fix →</PrimaryBtn>
                      )}
                    </div>
                  </div>

                  {/* Error bar */}
                  {cred.validationError && (
                    <div style={{ background:C.redDim, borderTop:`1px solid ${C.redMid}`,
                      padding:"8px 18px", display:"flex", alignItems:"center", gap:10 }}>
                      <M size={9} color={C.red}>⚠ {cred.validationError}</M>
                      <TextBtn color={C.red} onClick={() => setSelectedCred(cred)}>Fix Credential →</TextBtn>
                    </div>
                  )}

                  {/* Config preview */}
                  {hasCfg && cred.status === "active" && (
                    <div style={{ background:C.surfaceAlt, borderTop:`1px solid ${C.borderSub}`,
                      padding:"9px 18px", display:"flex", gap:20, flexWrap:"wrap" }}>
                      {[
                        { l:"Enabled Pairs", v:EXCHANGE_ADAPTER_CONFIG[cred.id].enabledPairs?.join(", ") },
                        { l:"Order Range",   v:"$"+EXCHANGE_ADAPTER_CONFIG[cred.id].minOrderUsd+" – $"+EXCHANGE_ADAPTER_CONFIG[cred.id].maxOrderUsd },
                        { l:"Default SL/TP", v:EXCHANGE_ADAPTER_CONFIG[cred.id].stopLossDefault+"% / "+EXCHANGE_ADAPTER_CONFIG[cred.id].takeProfitDefault+"%" },
                      ].map(({l, v}) => (
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
            <GhostBtn onClick={() => {}}>Run Validation</GhostBtn>
          </div>
        </div>
      )}

      {/* TRADING DEFAULTS */}
      {tab === "trading" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <CardHead title="Order Defaults" sub="Applied when a bot doesn't specify its own values" />
            <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div>
                <Lbl style={{ display:"block", marginBottom:5 }}>Default Order Type</Lbl>
                <select value={platformSettings.defaultOrderType}
                  onChange={e => setPlatformSettings(p => ({...p, defaultOrderType:e.target.value}))}
                  style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
                    padding:"8px 12px", fontFamily:mono, fontSize:11, color:C.textPri, outline:"none" }}>
                  {["market","limit","stop_limit"].map(o => <option key={o} value={o}>{o.replace(/_/g," ").toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <Lbl style={{ display:"block", marginBottom:5 }}>Time in Force</Lbl>
                <select value={platformSettings.defaultTif}
                  onChange={e => setPlatformSettings(p => ({...p, defaultTif:e.target.value}))}
                  style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
                    padding:"8px 12px", fontFamily:mono, fontSize:11, color:C.textPri, outline:"none" }}>
                  {["GTC","IOC","FOK"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Safety Switches" />
            {[
              { k:"autoRestartBots",    l:"Auto-restart bots after error",          desc:"Bots that stop due to transient errors will restart automatically after 5 minutes." },
              { k:"confirmBeforeTrade", l:"Require confirmation before live orders", desc:"Adds a confirmation step before any order is submitted. Useful for testing new configs." },
              { k:"paperTradingMode",   l:"Paper trading mode (all credentials)",   desc:"Override all credentials to simulate-only. No real orders will be sent. P&L is simulated." },
            ].map(({k, l, desc}, i, a) => (
              <div key={k}>
                <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ flex:1, marginRight:20 }}>
                    <M size={12} weight={600} style={{ display:"block", marginBottom:3 }}>{l}</M>
                    <M size={10} color={C.textMuted}>{desc}</M>
                  </div>
                  <Toggle value={platformSettings[k as keyof typeof platformSettings]} onChange={v => setPlatformSettings(p => ({...p, [k]:v}))} />
                </div>
                {i < a.length - 1 && <Divider />}
              </div>
            ))}
          </Card>

          {platformSettings.paperTradingMode && (
            <div style={{ background:C.amberDim, border:`1px solid ${C.amberMid}`, borderRadius:4, padding:"12px 16px" }}>
              <M size={11} color={C.amber} weight={700} style={{ display:"block", marginBottom:3 }}>
                ⚠ Paper Trading Mode Active
              </M>
              <M size={10} color={C.amber}>All bots are running in simulation. No real orders will execute on any exchange. Disable this to go live.</M>
            </div>
          )}
          <PrimaryBtn onClick={() => {}}>Save Trading Defaults</PrimaryBtn>
        </div>
      )}

      {/* PLATFORM */}
      {tab === "platform" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <CardHead title="Data & Privacy" />
            {[
              { l:"Data Retention", v:"365 days", desc:"Trade history and analytics are kept for this period.", action:<GhostBtn small>Change</GhostBtn> },
              { l:"Export My Data", v:"",         desc:"Download a full export of your account data (GDPR).",  action:<GhostBtn small>Request Export</GhostBtn> },
            ].map(({l, v, desc, action}, i, a) => (
              <div key={l}>
                <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <M size={12} weight={600} style={{ display:"block", marginBottom:3 }}>{l}</M>
                    <M size={10} color={C.textMuted}>{desc}</M>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    {v && <M size={11} color={C.textPri} weight={600}>{v}</M>}
                    {action}
                  </div>
                </div>
                {i < a.length - 1 && <Divider />}
              </div>
            ))}
          </Card>

          <Card>
            <CardHead title="Appearance & Locale" />
            <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <FontSizeSelector />
              {[
                { l:"Theme",     opts:["Dark (Default)","System"] },
                { l:"Date Format",opts:["DD MMM YYYY","MM/DD/YYYY","YYYY-MM-DD"] },
                { l:"Number Format",opts:["1,234.56","1.234,56"] },
              ].map(({l, opts}) => (
                <div key={l}>
                  <Lbl style={{ display:"block", marginBottom:5 }}>{l}</Lbl>
                  <select style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
                    padding:"8px 12px", fontFamily:mono, fontSize:11, color:C.textPri, outline:"none" }}>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="API Access" sub="Programmatic access to your Stella account" />
            <div style={{ padding:"16px 18px" }}>
              <div style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:3,
                padding:"12px 14px", marginBottom:14, display:"flex", alignItems:"center",
                justifyContent:"space-between" }}>
                <div>
                  <Lbl style={{ display:"block", marginBottom:3 }}>Personal Access Token</Lbl>
                  <M size={11} color={C.textPri} style={{ fontFamily:mono, letterSpacing:"0.06em" }}>stl_live_••••••••••••••••••••K9Q2</M>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <TextBtn>Reveal</TextBtn>
                  <GhostBtn small>Rotate</GhostBtn>
                </div>
              </div>
              <M size={9} color={C.textMuted} style={{ lineHeight:1.6 }}>
                Use this token to authenticate with the Stella REST API. Treat it like a password — never expose it in client-side code.
              </M>
            </div>
          </Card>
          <PrimaryBtn onClick={() => {}}>Save Platform Settings</PrimaryBtn>
        </div>
      )}
    </div>
  );
}
