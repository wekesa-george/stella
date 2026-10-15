import { useState, useEffect, useRef, useMemo } from "react";

// ─── STYLES ──────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=DM+Sans:wght@300;400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg0:#080c10; --bg1:#0d1117; --bg2:#131920; --bg3:#1a2230; --bg4:#1e2d40;
    --border:#1e2d40; --border2:#253550;
    --text0:#e8edf3; --text1:#8fa3b8; --text2:#5a7090; --text3:#3a5068;
    --green:#00e5a0; --green-dim:rgba(0,229,160,0.10); --green-mid:rgba(0,229,160,0.20);
    --amber:#f5a623; --amber-dim:rgba(245,166,35,0.10);
    --red:#ff4757;   --red-dim:rgba(255,71,87,0.10);
    --blue:#3d9df3;  --blue-dim:rgba(61,157,243,0.10);
    --purple:#a78bfa; --purple-dim:rgba(167,139,250,0.10);
    --cyan:#22d3ee;   --cyan-dim:rgba(34,211,238,0.10);
    --mono:'IBM Plex Mono',monospace; --sans:'DM Sans',sans-serif;
  }
  body { background:var(--bg0); color:var(--text0); font-family:var(--sans); }
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:var(--bg1)}
  ::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}

  /* APP SHELL */
  .app{display:flex;flex-direction:column;min-height:100vh;background:var(--bg0)}

  /* TOPBAR */
  .topbar{
    display:flex;align-items:center;height:50px;padding:0 20px;
    background:var(--bg1);border-bottom:1px solid var(--border);
    flex-shrink:0;gap:18px;z-index:100;
  }
  .logo{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--green);letter-spacing:.08em;display:flex;align-items:center;gap:8px;white-space:nowrap}
  .pulse{width:7px;height:7px;background:var(--green);border-radius:50%;animation:pulse 2s infinite;flex-shrink:0}
  @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,229,160,0.5)}60%{opacity:.8;box-shadow:0 0 0 6px rgba(0,229,160,0)}}
  .tb-sep{width:1px;height:24px;background:var(--border);flex-shrink:0}
  .tb-stat{display:flex;flex-direction:column}
  .tb-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--text2)}
  .tb-val{font-family:var(--mono);font-size:12px;font-weight:600;color:var(--text0);white-space:nowrap}
  .tb-val.g{color:var(--green)} .tb-val.r{color:var(--red)} .tb-val.a{color:var(--amber)} .tb-val.b{color:var(--blue)}
  .role-badge{padding:3px 10px;border-radius:2px;font-family:var(--mono);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;border:1px solid}

  /* TAB BAR */
  .tab-bar{display:flex;background:var(--bg1);border-bottom:1px solid var(--border);padding:0 20px;overflow-x:auto;flex-shrink:0}
  .tab-btn{padding:13px 18px;font-size:11px;font-weight:500;cursor:pointer;color:var(--text2);border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s;background:none;border-top:none;border-left:none;border-right:none;font-family:var(--sans);letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;gap:7px}
  .tab-btn:hover{color:var(--text0)}
  .tab-btn.on{color:var(--green);border-bottom-color:var(--green)}
  .tab-num{font-family:var(--mono);font-size:9px;font-weight:700;padding:2px 5px;border-radius:2px;background:var(--bg3)}

  /* PAGE */
  .page{padding:22px 22px;flex:1;display:flex;flex-direction:column;gap:18px}

  /* SECTION HEADER */
  .sec-hdr{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:var(--text2);padding-bottom:8px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}

  /* GRID */
  .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
  .grid-1-2{display:grid;grid-template-columns:1fr 2fr;gap:13px}
  .grid-2-1{display:grid;grid-template-columns:2fr 1fr;gap:13px}

  /* STAT CARDS */
  .stat{background:var(--bg1);border:1px solid var(--border);border-radius:4px;padding:14px 16px;position:relative;overflow:hidden}
  .stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--green)}
  .stat.amber::before{background:var(--amber)} .stat.red::before{background:var(--red)} .stat.blue::before{background:var(--blue)} .stat.purple::before{background:var(--purple)}
  .stat-lbl{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--text2);margin-bottom:6px}
  .stat-val{font-family:var(--mono);font-size:24px;font-weight:600;color:var(--text0);line-height:1}
  .stat-val.g{color:var(--green)} .stat-val.a{color:var(--amber)} .stat-val.r{color:var(--red)} .stat-val.b{color:var(--blue)}
  .stat-sub{font-family:var(--mono);font-size:9px;color:var(--text2);margin-top:5px}
  .stat-delta{display:inline-flex;align-items:center;gap:3px;font-family:var(--mono);font-size:9px;font-weight:600;padding:1px 5px;border-radius:2px;margin-top:4px}
  .stat-delta.up{background:var(--green-dim);color:var(--green)} .stat-delta.dn{background:var(--red-dim);color:var(--red)} .stat-delta.warn{background:var(--amber-dim);color:var(--amber)}

  /* CARD */
  .card{background:var(--bg1);border:1px solid var(--border);border-radius:4px;overflow:hidden}
  .card-hdr{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
  .card-title{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text1);display:flex;align-items:center;gap:8px}
  .card-body{padding:14px 16px}
  .card-body.no-pad{padding:0}

  /* PROVIDER CARDS */
  .prov-card{background:var(--bg2);border:1px solid var(--border);border-radius:4px;overflow:hidden}
  .prov-hdr{padding:12px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)}
  .prov-logo{width:32px;height:32px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:11px;font-weight:700;flex-shrink:0}
  .prov-name{font-family:var(--mono);font-size:12px;font-weight:600;color:var(--text0)}
  .prov-status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
  .prov-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}
  .prov-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .prov-lbl{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2)}
  .prov-val{font-family:var(--mono);font-size:10px;color:var(--text1);word-break:break-all;text-align:right}
  .prov-actions{padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:6px}

  /* CREDENTIAL FIELD */
  .cred-field{display:flex;align-items:center;gap:6px;background:var(--bg0);border:1px solid var(--border);border-radius:3px;padding:5px 8px;flex:1}
  .cred-value{font-family:var(--mono);font-size:10px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

  /* TABLES */
  .tbl{width:100%;border-collapse:collapse}
  .tbl th{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);padding:8px 12px;text-align:left;border-bottom:1px solid var(--border);background:var(--bg2);white-space:nowrap;font-weight:500}
  .tbl th.r{text-align:right}
  .tbl td{padding:9px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text1);vertical-align:middle}
  .tbl tr:last-child td{border-bottom:none}
  .tbl tr:hover td{background:var(--bg2);cursor:pointer}
  .tbl td.mono{font-family:var(--mono);font-size:10px}
  .tbl td.r{text-align:right}

  /* REGION MAP */
  .region-row{display:flex;align-items:center;gap:0;border-bottom:1px solid var(--border)}
  .region-row:last-child{border-bottom:none}
  .region-row:hover{background:var(--bg2)}
  .rr-cell{padding:10px 12px;font-family:var(--mono);font-size:10px}
  .rr-countries{display:flex;gap:4px;flex-wrap:wrap}
  .country-chip{padding:2px 6px;background:var(--bg3);border:1px solid var(--border2);border-radius:2px;font-family:var(--mono);font-size:9px;color:var(--text1)}
  .coverage-warning{padding:8px 12px;background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:3px;font-family:var(--mono);font-size:9px;color:var(--amber);display:flex;align-items:center;gap:7px}

  /* STATUS BADGES */
  .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:2px;font-family:var(--mono);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
  .badge-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
  .badge.approved      {background:var(--green-dim);color:var(--green)}
  .badge.pending       {background:var(--blue-dim);color:var(--blue)}
  .badge.review        {background:var(--amber-dim);color:var(--amber)}
  .badge.declined      {background:var(--red-dim);color:var(--red)}
  .badge.expiring      {background:var(--purple-dim);color:var(--purple)}
  .badge.re-verify     {background:rgba(34,211,238,0.10);color:var(--cyan)}
  .badge.connected     {background:var(--green-dim);color:var(--green)}
  .badge.degraded      {background:var(--amber-dim);color:var(--amber)}
  .badge.disconnected  {background:var(--red-dim);color:var(--red)}

  /* BUTTONS */
  .btn{padding:5px 11px;border-radius:3px;font-family:var(--mono);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;border:1px solid;transition:all .12s;white-space:nowrap}
  .btn-ghost{background:transparent;color:var(--text1);border-color:var(--border)}
  .btn-ghost:hover{background:var(--bg3);color:var(--text0);border-color:var(--border2)}
  .btn-green{background:var(--green-dim);color:var(--green);border-color:rgba(0,229,160,.3)}
  .btn-green:hover{background:var(--green);color:#000}
  .btn-amber{background:var(--amber-dim);color:var(--amber);border-color:rgba(245,166,35,.3)}
  .btn-amber:hover{background:var(--amber);color:#000}
  .btn-red{background:var(--red-dim);color:var(--red);border-color:rgba(255,71,87,.3)}
  .btn-red:hover{background:var(--red);color:#fff}
  .btn-blue{background:var(--blue-dim);color:var(--blue);border-color:rgba(61,157,243,.3)}
  .btn-blue:hover{background:var(--blue);color:#fff}
  .btn[disabled]{opacity:.35;cursor:not-allowed}
  .btn[disabled]:hover{background:transparent;color:inherit}

  /* FILTER BAR */
  .filter-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .filter-btn{padding:4px 10px;border-radius:2px;font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;background:transparent;border:1px solid var(--border);color:var(--text2);transition:all .12s}
  .filter-btn:hover{border-color:var(--border2);color:var(--text1)}
  .filter-btn.on{background:var(--bg3);color:var(--text0);border-color:var(--border2)}
  .search-input{background:var(--bg2);border:1px solid var(--border);color:var(--text0);font-family:var(--mono);font-size:10px;padding:5px 10px;border-radius:3px;outline:none;min-width:200px}
  .search-input::placeholder{color:var(--text3)}
  .search-input:focus{border-color:var(--border2)}

  /* MINI BAR */
  .mbar-track{height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-top:3px}
  .mbar-fill{height:100%;border-radius:2px}

  /* RISK SCORES */
  .score-pill{display:inline-block;padding:1px 7px;border-radius:2px;font-family:var(--mono);font-size:10px;font-weight:600}

  /* AUDIT LOG */
  .audit-item{padding:10px 14px;border-bottom:1px solid var(--border);display:flex;gap:14px;align-items:flex-start}
  .audit-item:hover{background:var(--bg2)}
  .audit-icon{width:28px;height:28px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
  .audit-time{font-family:var(--mono);font-size:9px;color:var(--text2);white-space:nowrap;padding-top:2px}
  .audit-msg{font-size:12px;color:var(--text1);line-height:1.5}
  .audit-actor{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--blue)}
  .audit-target{font-family:var(--mono);font-size:10px;color:var(--text0)}

  /* MODAL OVERLAY */
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}
  .modal{background:var(--bg1);border:1px solid var(--border2);border-radius:6px;width:100%;max-width:820px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden}
  .modal-hdr{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
  .modal-title{font-family:var(--mono);font-size:12px;font-weight:600;color:var(--text0);letter-spacing:.05em}
  .modal-close{background:transparent;border:none;color:var(--text2);font-size:18px;cursor:pointer;padding:0 4px;line-height:1}
  .modal-close:hover{color:var(--text0)}
  .modal-body{flex:1;overflow-y:auto;padding:20px}
  .modal-footer{padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0}

  /* PROVIDER IFRAME ZONE */
  .iframe-zone{background:var(--bg2);border:1px solid var(--border);border-radius:4px;min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;text-align:center}
  .iframe-icon{font-size:32px;opacity:.5}
  .iframe-label{font-family:var(--mono);font-size:11px;color:var(--text2)}
  .iframe-note{font-size:11px;color:var(--text3);max-width:320px;line-height:1.6}

  /* DETAIL GRID */
  .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .detail-item{background:var(--bg2);border:1px solid var(--border);border-radius:3px;padding:10px 12px}
  .detail-lbl{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);margin-bottom:4px}
  .detail-val{font-family:var(--mono);font-size:11px;color:var(--text0)}

  /* RISK FLAG */
  .risk-flag{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:3px;border:1px solid;margin-bottom:6px}
  .risk-flag.warn{background:var(--amber-dim);border-color:rgba(245,166,35,.25)}
  .risk-flag.danger{background:var(--red-dim);border-color:rgba(255,71,87,.25)}
  .risk-flag.ok{background:var(--green-dim);border-color:rgba(0,229,160,.2)}
  .risk-flag-icon{font-size:12px;flex-shrink:0}
  .risk-flag-text{font-family:var(--mono);font-size:10px;flex:1}

  /* WORKFLOW TAG */
  .wf-tag{display:inline-block;padding:2px 7px;background:var(--bg3);border:1px solid var(--border2);border-radius:2px;font-family:var(--mono);font-size:9px;color:var(--text1)}

  /* NOTE TEXTAREA */
  .note-area{width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:3px;color:var(--text0);font-family:var(--sans);font-size:12px;padding:10px 12px;resize:vertical;min-height:80px;outline:none;line-height:1.6}
  .note-area:focus{border-color:var(--border2)}
  .note-area::placeholder{color:var(--text3)}

  @media(max-width:900px){.grid-4{grid-template-columns:1fr 1fr}.grid-3{grid-template-columns:1fr 1fr}.grid-1-2,.grid-2-1{grid-template-columns:1fr}.page{padding:14px}}
`;

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const ROLES = { COMPLIANCE: "Compliance Officer", PLATFORM: "Platform Admin" };

const PROVIDERS = {
  sumsub:  { name:"SumSub",  color:"#0BA8E0", bg:"#0BA8E020", abbr:"SS", docs:"https://developers.sumsub.com", workflows:["standard-kyc","enhanced-due-diligence","poa-check","liveness-only"], regions:["East Africa","Southern Africa"] },
  onfido:  { name:"Onfido",  color:"#3B46FF", bg:"#3B46FF20", abbr:"ON", docs:"https://documentation.onfido.com", workflows:["us-standard","us-enhanced","us-accredited-investor"], regions:["United States"] },
  persona: { name:"Persona", color:"#7C5CFC", bg:"#7C5CFC20", abbr:"PS", docs:"https://docs.withpersona.com", workflows:["global-standard","aml-enhanced"], regions:["European Union","Rest of World"] },
};

const STATUS_META = {
  approved:    { label:"Approved",      color:"var(--green)",  dot:"var(--green)",  icon:"✓" },
  pending:     { label:"Pending",       color:"var(--blue)",   dot:"var(--blue)",   icon:"◷" },
  review:      { label:"Manual Review", color:"var(--amber)",  dot:"var(--amber)",  icon:"⚑" },
  declined:    { label:"Declined",      color:"var(--red)",    dot:"var(--red)",    icon:"✕" },
  expiring:    { label:"Expiring Soon", color:"var(--purple)", dot:"var(--purple)", icon:"⏰" },
  "re-verify": { label:"Re-Verify",     color:"var(--cyan)",   dot:"var(--cyan)",   icon:"↺" },
};

const REGIONS_CONFIG = [
  { name:"East Africa",     countries:["UG","KE","TZ","RW","ET"], provider:"sumsub",  workflow:"standard-kyc",              active:true },
  { name:"Southern Africa", countries:["ZA","ZM","ZW","BW","MZ"], provider:"sumsub",  workflow:"enhanced-due-diligence",    active:true },
  { name:"West Africa",     countries:["NG","GH","SN","CI"],      provider:"sumsub",  workflow:"standard-kyc",              active:true },
  { name:"European Union",  countries:["DE","FR","NL","ES","IT","SE","PL"], provider:"persona", workflow:"global-standard", active:true },
  { name:"United States",   countries:["US"],                     provider:"onfido",  workflow:"us-standard",               active:true },
  { name:"Rest of World",   countries:["*"],                      provider:"persona", workflow:"aml-enhanced",              active:true },
];

const RISK_SCORE_COLOR = (s) => s >= 80 ? "var(--green)" : s >= 50 ? "var(--amber)" : "var(--red)";
const RISK_SCORE_BG    = (s) => s >= 80 ? "var(--green-dim)" : s >= 50 ? "var(--amber-dim)" : "var(--red-dim)";

// ─── SEED DATA ───────────────────────────────────────────────────────────────
const NAMES = ["Amara Nwosu","David Kiptoo","Fatima Al-Rashid","Jorge Mendes","Sarah Chen","Ivan Popov","Aiko Tanaka","Elena Vasquez","Omar Farouk","Lena Schmidt","Kwame Asante","Priya Sharma","Max Thornton","Zara Ahmed","Carlos Reyes"];
const COUNTRIES = ["UG","KE","ZA","NG","GH","DE","US","TZ","FR","ZM"];
const DOC_TYPES = ["Passport","National ID","Driver's Licence","Residence Permit"];
const PROVIDERS_LIST = ["sumsub","sumsub","sumsub","onfido","persona"];

function getRegionForCountry(cc) {
  const r = REGIONS_CONFIG.find(r => r.countries.includes(cc) || r.countries.includes("*"));
  return r?.name || "Unknown";
}

function randDate(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
  return d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}

const STATUSES = ["approved","approved","approved","approved","pending","review","declined","expiring","re-verify"];

const APPLICANTS = NAMES.map((name, i) => {
  const country  = COUNTRIES[i % COUNTRIES.length];
  const status   = STATUSES[i % STATUSES.length];
  const provider = PROVIDERS_LIST[i % PROVIDERS_LIST.length];
  const riskScore = status === "approved" || status === "expiring" ? Math.floor(Math.random() * 20) + 78
    : status === "review" ? Math.floor(Math.random() * 30) + 40
    : status === "declined" ? Math.floor(Math.random() * 30) + 10
    : Math.floor(Math.random() * 50) + 50;
  return {
    id: `KYC-${String(i + 1001).padStart(4,"0")}`,
    name,
    email: `${name.split(" ")[0].toLowerCase()}@example.com`,
    country,
    region: getRegionForCountry(country),
    provider,
    status,
    riskScore,
    docType: DOC_TYPES[i % DOC_TYPES.length],
    submittedAt: randDate(60),
    updatedAt: randDate(14),
    expiresAt: status === "expiring" ? randDate(-20) : randDate(-180),
    watchlistHit: status === "declined" || (status === "review" && Math.random() > 0.6),
    faceMatch: riskScore > 60 ? Math.floor(Math.random() * 15) + 85 : Math.floor(Math.random() * 30) + 50,
    docAuth: riskScore > 60 ? Math.floor(Math.random() * 10) + 88 : Math.floor(Math.random() * 35) + 45,
    rejectionReasons: status === "declined" ? ["Document expired","Face match below threshold"] : [],
    tier: ["Standard","Enhanced","Accredited"][i % 3],
    notes: [],
    applicantId: `${provider.toUpperCase()}-${Math.random().toString(36).substr(2,9).toUpperCase()}`,
  };
});

const AUDIT_EVENTS = [
  { type:"override",   icon:"⚑", iconBg:"rgba(245,166,35,0.15)", color:"var(--amber)", actor:"admin@stella.io",   msg:"Manually approved applicant", target:"KYC-1003", time:"2 min ago" },
  { type:"credential", icon:"🔑", iconBg:"rgba(61,157,243,0.15)",  color:"var(--blue)",  actor:"ops@stella.io",    msg:"Rotated API key for provider",  target:"SumSub",   time:"18 min ago" },
  { type:"region",     icon:"🗺", iconBg:"rgba(0,229,160,0.12)",   color:"var(--green)", actor:"ops@stella.io",    msg:"Added West Africa region mapped to", target:"SumSub → standard-kyc", time:"1h ago" },
  { type:"override",   icon:"✕", iconBg:"rgba(255,71,87,0.15)",   color:"var(--red)",   actor:"admin@stella.io",   msg:"Manually declined applicant",   target:"KYC-1009", time:"3h ago" },
  { type:"provider",   icon:"⚡", iconBg:"rgba(167,139,250,0.15)", color:"var(--purple)",actor:"system",            msg:"Degraded health detected for provider", target:"Onfido", time:"5h ago" },
  { type:"region",     icon:"🗺", iconBg:"rgba(0,229,160,0.12)",   color:"var(--green)", actor:"ops@stella.io",    msg:"Switched EU routing from Onfido to", target:"Persona → global-standard", time:"1d ago" },
  { type:"credential", icon:"🔑", iconBg:"rgba(61,157,243,0.15)",  color:"var(--blue)",  actor:"ops@stella.io",    msg:"Connected new provider",        target:"Persona",  time:"2d ago" },
  { type:"override",   icon:"↺", iconBg:"rgba(34,211,238,0.12)",   color:"var(--cyan)",  actor:"admin@stella.io",  msg:"Triggered re-verification for", target:"KYC-1005", time:"3d ago" },
];

// ─── SHARED UI ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`badge ${status}`}>
      <span className="badge-dot" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

function ProviderPill({ prov }) {
  const p = PROVIDERS[prov];
  if (!p) return null;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 7px", borderRadius:2, background: p.bg, border:`1px solid ${p.color}33`, fontFamily:"var(--mono)", fontSize:9, fontWeight:600, color: p.color }}>
      {p.name}
    </span>
  );
}

function ScorePill({ score }) {
  return (
    <span className="score-pill" style={{ background: RISK_SCORE_BG(score), color: RISK_SCORE_COLOR(score) }}>
      {score}
    </span>
  );
}

function MiniBar({ val, max = 100, color }) {
  return (
    <div className="mbar-track">
      <div className="mbar-fill" style={{ width: `${Math.min(100, val / max * 100)}%`, background: color || RISK_SCORE_COLOR(val) }} />
    </div>
  );
}

function Stat({ label, value, sub, accent, delta, deltaLabel }) {
  return (
    <div className={`stat ${accent || ""}`}>
      <div className="stat-lbl">{label}</div>
      <div className={`stat-val ${accent ? accent[0] : ""}`}>{value}</div>
      {delta !== undefined && (
        <span className={`stat-delta ${delta > 0 ? "up" : delta < 0 ? "dn" : "warn"}`}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {deltaLabel || `${Math.abs(delta)}%`}
        </span>
      )}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ─── APPLICANT DETAIL MODAL ───────────────────────────────────────────────────
function ApplicantModal({ applicant, role, onClose, onAction }) {
  const [note, setNote]     = useState("");
  const [view, setView]     = useState("data"); // "data" | "documents"
  const p = PROVIDERS[applicant.provider];
  const isCompliance = role === ROLES.COMPLIANCE;

  const riskFlags = [
    { ok: !applicant.watchlistHit, warn: applicant.watchlistHit, label: applicant.watchlistHit ? "Watchlist match detected — requires manual review" : "No watchlist hits", danger: applicant.watchlistHit },
    { ok: applicant.faceMatch >= 80, label: `Face match confidence: ${applicant.faceMatch}%`, warn: applicant.faceMatch < 80 && applicant.faceMatch >= 60, danger: applicant.faceMatch < 60 },
    { ok: applicant.docAuth >= 85, label: `Document authenticity score: ${applicant.docAuth}%`, warn: applicant.docAuth < 85 && applicant.docAuth >= 65, danger: applicant.docAuth < 65 },
  ];

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hdr">
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--text2)" }}>{applicant.id}</div>
            <div className="modal-title">{applicant.name}</div>
            <StatusBadge status={applicant.status} />
            <ProviderPill prov={applicant.provider} />
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* View toggle */}
        <div style={{ padding:"0 20px", borderBottom:"1px solid var(--border)", display:"flex", gap:2 }}>
          {["data","documents"].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding:"10px 14px", background:"none", border:"none", borderBottom:`2px solid ${view===v?"var(--green)":"transparent"}`,
                color: view===v?"var(--green)":"var(--text2)", fontFamily:"var(--mono)", fontSize:10, textTransform:"uppercase", letterSpacing:".08em", cursor:"pointer" }}>
              {v === "data" ? "KYC Data" : "Documents (Provider)"}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {view === "data" ? (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

              {/* Core details */}
              <div className="detail-grid">
                {[
                  ["Full Name",        applicant.name],
                  ["Email",            applicant.email],
                  ["Country",          applicant.country],
                  ["Region",           applicant.region],
                  ["Document Type",    applicant.docType],
                  ["Provider ID",      applicant.applicantId],
                  ["Submitted",        applicant.submittedAt],
                  ["Last Updated",     applicant.updatedAt],
                  ["Doc Expiry",       applicant.expiresAt],
                  ["Account Tier",     applicant.tier],
                ].map(([l, v]) => (
                  <div className="detail-item" key={l}>
                    <div className="detail-lbl">{l}</div>
                    <div className="detail-val">{v}</div>
                  </div>
                ))}
              </div>

              {/* Risk signals */}
              <div>
                <div className="sec-hdr" style={{ margin:0, marginBottom:10 }}>Risk Signals</div>
                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", marginBottom:4 }}>RISK SCORE</div>
                    <div style={{ fontFamily:"var(--mono)", fontSize:22, fontWeight:600, color: RISK_SCORE_COLOR(applicant.riskScore) }}>{applicant.riskScore}</div>
                  </div>
                  <div style={{ flex:2 }}>
                    {[["Face Match", applicant.faceMatch], ["Doc Auth", applicant.docAuth]].map(([l,v]) => (
                      <div key={l} style={{ marginBottom:6 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", marginBottom:3 }}>
                          <span>{l}</span><span style={{ color: RISK_SCORE_COLOR(v) }}>{v}%</span>
                        </div>
                        <MiniBar val={v} />
                      </div>
                    ))}
                  </div>
                </div>
                {riskFlags.map((f, i) => (
                  <div key={i} className={`risk-flag ${f.danger?"danger":f.warn?"warn":"ok"}`}>
                    <span className="risk-flag-icon">{f.danger ? "⚠" : f.warn ? "⚑" : "✓"}</span>
                    <span className="risk-flag-text" style={{ color: f.danger?"var(--red)":f.warn?"var(--amber)":"var(--green)" }}>{f.label}</span>
                  </div>
                ))}
                {applicant.rejectionReasons.length > 0 && (
                  <div style={{ marginTop:8 }}>
                    <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", marginBottom:6 }}>REJECTION REASONS</div>
                    {applicant.rejectionReasons.map((r, i) => (
                      <div key={i} style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--red)", padding:"4px 0", borderBottom:"1px solid var(--border)" }}>✕ {r}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Compliance note */}
              {isCompliance && (
                <div>
                  <div className="sec-hdr" style={{ margin:0, marginBottom:8 }}>Compliance Note <span style={{ color:"var(--text3)", fontWeight:400 }}>(required for manual decisions)</span></div>
                  <textarea className="note-area" placeholder="Document your decision rationale here. This is stored in the audit log and cannot be deleted." value={note} onChange={e => setNote(e.target.value)} />
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="iframe-zone">
                <div className="iframe-icon">🪪</div>
                <div style={{ fontFamily:"var(--mono)", fontSize:13, fontWeight:600, color:"var(--text0)" }}>{p?.name} Document Review</div>
                <div className="iframe-label">Applicant ID: {applicant.applicantId}</div>
                <div className="iframe-note">
                  The provider's document review UI renders here in an authenticated iframe. This gives access to the scanned document, liveness video, face match overlay, and provider-side signals — without leaving the admin context.
                </div>
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button className="btn btn-blue">Open in {p?.name} Portal ↗</button>
                </div>
              </div>
              <div style={{ marginTop:10, padding:"8px 10px", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:3, fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>
                ℹ The iframe is loaded with a short-lived session token scoped to this applicant. The token expires after 15 minutes and cannot be shared. All access is logged.
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {isCompliance && (
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-blue" onClick={() => { onAction("re-verify", applicant); onClose(); }}>Trigger Re-Verify</button>
            <button className="btn btn-red" disabled={!note.trim()} onClick={() => { onAction("decline", applicant); onClose(); }} title={!note.trim()?"Add a compliance note first":""}>Decline</button>
            <button className="btn btn-green" disabled={!note.trim()} onClick={() => { onAction("approve", applicant); onClose(); }} title={!note.trim()?"Add a compliance note first":""}>Approve</button>
          </div>
        )}
        {!isCompliance && (
          <div className="modal-footer">
            <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", flex:1 }}>Manual decisions require Compliance Officer role.</span>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB 1: PROVIDER CONNECTIONS ─────────────────────────────────────────────
function ProvidersTab({ role }) {
  const [revealed, setRevealed] = useState({});
  const [testing,  setTesting]  = useState({});
  const [tested,   setTested]   = useState({});
  const isAdmin = role === ROLES.PLATFORM;

  function testConnection(key) {
    setTesting(p => ({ ...p, [key]: true }));
    setTimeout(() => { setTesting(p => ({ ...p, [key]: false })); setTested(p => ({ ...p, [key]: true })); }, 1400);
  }

  const connectionStatus = { sumsub: "connected", onfido: "connected", persona: "degraded" };

  return (
    <div className="page">
      {!isAdmin && (
        <div style={{ padding:"8px 12px", background:"var(--blue-dim)", border:"1px solid rgba(61,157,243,.2)", borderRadius:3, fontFamily:"var(--mono)", fontSize:10, color:"var(--blue)" }}>
          ℹ Provider credentials are managed by Platform Admins. You can view connection status but cannot modify credentials.
        </div>
      )}

      {/* KPIs */}
      <div className="grid-4">
        <Stat label="Connected Providers" value="3" sub="SumSub · Onfido · Persona" />
        <Stat label="Regions Covered" value="6" sub="46 countries + Rest of World fallback" />
        <Stat label="Avg Response Time" value="1.4s" accent="amber" delta={0} deltaLabel="stable" sub="Across all providers" />
        <Stat label="Webhook Success Rate" value="99.7%" accent="blue" sub="Last 24 hours" />
      </div>

      {/* Provider cards */}
      <div className="grid-3">
        {Object.entries(PROVIDERS).map(([key, p]) => {
          const status   = connectionStatus[key];
          const statusCol = status === "connected" ? "var(--green)" : status === "degraded" ? "var(--amber)" : "var(--red)";
          return (
            <div className="prov-card" key={key} style={{ borderTop: `2px solid ${p.color}` }}>
              <div className="prov-hdr">
                <div className="prov-logo" style={{ background: p.bg, color: p.color }}>{p.abbr}</div>
                <div style={{ flex:1 }}>
                  <div className="prov-name">{p.name}</div>
                  <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", marginTop:2 }}>
                    {p.regions.join(" · ")}
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div className="prov-status-dot" style={{ background: statusCol }} />
                  <span className={`badge ${status}`}>{status}</span>
                </div>
              </div>

              <div className="prov-body">
                {/* Credential fields */}
                {[["App Token / Client ID", "••••••••••••••••••••••••3f2a"], ["Secret Key", "sk_••••••••••••••••••••••••••••••9c1d"]].map(([label, masked]) => (
                  <div key={label}>
                    <div className="prov-lbl" style={{ marginBottom:4 }}>{label}</div>
                    <div style={{ display:"flex", gap:5 }}>
                      <div className="cred-field">
                        <span className="cred-value">{revealed[`${key}-${label}`] ? `live-actual-key-would-show-here` : masked}</span>
                      </div>
                      {isAdmin && (
                        <button className="btn btn-ghost" style={{ padding:"3px 8px", fontSize:9 }}
                          onClick={() => setRevealed(r => ({ ...r, [`${key}-${label}`]: !r[`${key}-${label}`] }))}>
                          {revealed[`${key}-${label}`] ? "Hide" : "Show"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="prov-row">
                  <span className="prov-lbl">Webhook URL</span>
                  <span className="prov-val" style={{ fontSize:9 }}>https://api.stella.io/webhooks/{key}</span>
                </div>
                <div className="prov-row">
                  <span className="prov-lbl">Workflows</span>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
                    {p.workflows.slice(0,2).map(w => <span className="wf-tag" key={w}>{w}</span>)}
                    {p.workflows.length > 2 && <span className="wf-tag">+{p.workflows.length - 2}</span>}
                  </div>
                </div>
                <div className="prov-row">
                  <span className="prov-lbl">Last checked</span>
                  <span className="prov-val">2 min ago</span>
                </div>
              </div>

              <div className="prov-actions">
                {isAdmin && (
                  <button className="btn btn-ghost" style={{ fontSize:9 }}
                    onClick={() => testConnection(key)}>
                    {testing[key] ? "Testing…" : tested[key] ? "✓ Healthy" : "Test Connection"}
                  </button>
                )}
                <button className="btn btn-ghost" style={{ fontSize:9 }} onClick={() => window.open(p.docs)}>Docs ↗</button>
                {isAdmin && <button className="btn btn-ghost" style={{ fontSize:9, marginLeft:"auto" }}>Rotate Keys</button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add provider CTA */}
      {isAdmin && (
        <div style={{ border:"1px dashed var(--border2)", borderRadius:4, padding:"18px", display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
          <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--text2)" }}>Add another KYC provider — Veriff, Jumio, Smile Identity…</span>
          <button className="btn btn-green">+ Connect Provider</button>
        </div>
      )}
    </div>
  );
}

// ─── TAB 2: REGION ROUTING ───────────────────────────────────────────────────
function RegionsTab({ role }) {
  const [regions, setRegions] = useState(REGIONS_CONFIG);
  const isAdmin = role === ROLES.PLATFORM;

  return (
    <div className="page">
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* KPIs */}
        <div className="grid-4">
          <Stat label="Regions Defined" value={regions.length} sub="Named routing groups" />
          <Stat label="Countries Covered" value="30+" sub="Explicit + fallback" />
          <Stat label="Fallback Provider" value="Persona" accent="blue" sub="Catches unmapped countries" />
          <Stat label="Unmapped Countries" value="0" accent="green" sub="Full coverage confirmed" />
        </div>

        {/* Routing table */}
        <div className="card">
          <div className="card-hdr">
            <div className="card-title">
              <span>Region → Provider Routing</span>
            </div>
            {isAdmin && <button className="btn btn-green" style={{ fontSize:9 }}>+ Add Region</button>}
          </div>
          <div className="card-body no-pad">
            {/* Column headers */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1.8fr 1fr 1.2fr 80px", borderBottom:"1px solid var(--border)", background:"var(--bg2)" }}>
              {["Region", "Countries", "Provider", "Workflow", ""].map(h => (
                <div key={h} style={{ padding:"7px 12px", fontFamily:"var(--mono)", fontSize:9, textTransform:"uppercase", letterSpacing:".1em", color:"var(--text2)" }}>{h}</div>
              ))}
            </div>
            {regions.map((r, i) => {
              const prov = PROVIDERS[r.provider];
              return (
                <div key={i} className="region-row" style={{ display:"grid", gridTemplateColumns:"1fr 1.8fr 1fr 1.2fr 80px", alignItems:"center" }}>
                  <div className="rr-cell" style={{ fontFamily:"var(--mono)", fontWeight:600, color:"var(--text0)", fontSize:11 }}>
                    <div>{r.name}</div>
                    <div style={{ fontFamily:"var(--mono)", fontSize:9, color: r.active?"var(--green)":"var(--red)", marginTop:3 }}>
                      {r.active ? "● Active" : "○ Inactive"}
                    </div>
                  </div>
                  <div className="rr-cell">
                    {r.countries[0] === "*"
                      ? <span style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--text2)", fontStyle:"italic" }}>All unmapped countries</span>
                      : <div className="rr-countries">{r.countries.map(c => <span className="country-chip" key={c}>{c}</span>)}</div>
                    }
                  </div>
                  <div className="rr-cell">
                    <ProviderPill prov={r.provider} />
                  </div>
                  <div className="rr-cell">
                    <span className="wf-tag">{r.workflow}</span>
                  </div>
                  <div className="rr-cell">
                    {isAdmin && (
                      <div style={{ display:"flex", gap:5 }}>
                        <button className="btn btn-ghost" style={{ padding:"2px 6px", fontSize:8 }}>Edit</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coverage map placeholder */}
        <div className="card">
          <div className="card-hdr">
            <div className="card-title">Coverage Visualisation</div>
            <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>Countries coloured by assigned provider</div>
          </div>
          <div className="card-body" style={{ minHeight:180, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10 }}>
            <div style={{ fontSize:28, opacity:.35 }}>🗺</div>
            <div style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--text2)" }}>World coverage map renders here</div>
            <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text3)", textAlign:"center", maxWidth:320 }}>
              Each country shaded by its assigned provider. Unmapped countries shown in red. Hover for region details and routing info.
            </div>
            {/* Provider legend */}
            <div style={{ display:"flex", gap:16, marginTop:8 }}>
              {Object.entries(PROVIDERS).map(([key, p]) => (
                <div key={key} style={{ display:"flex", alignItems:"center", gap:6, fontFamily:"var(--mono)", fontSize:9, color:"var(--text1)" }}>
                  <div style={{ width:10, height:10, borderRadius:2, background: p.color }} />{p.name}
                </div>
              ))}
              <div style={{ display:"flex", alignItems:"center", gap:6, fontFamily:"var(--mono)", fontSize:9, color:"var(--text1)" }}>
                <div style={{ width:10, height:10, borderRadius:2, background:"var(--red)" }} />Unmapped
              </div>
            </div>
          </div>
        </div>

        {/* Re-verification rules */}
        <div className="card">
          <div className="card-hdr">
            <div className="card-title">Re-Verification Rules</div>
            {isAdmin && <button className="btn btn-ghost" style={{ fontSize:9 }}>+ Add Rule</button>}
          </div>
          <div className="card-body">
            {[
              { trigger:"Document expiry", threshold:"30 days before", action:"Flag as expiring-soon, notify user", provider:"Same provider as original KYC" },
              { trigger:"Tier upgrade request", threshold:"Standard → Enhanced or Accredited", action:"Trigger enhanced-due-diligence workflow", provider:"Original region's provider" },
              { trigger:"AML watchlist match", threshold:"Any hit on refresh scan", action:"Suspend account, flag for manual review", provider:"Same provider, new check" },
            ].map((rule, i) => (
              <div key={i} style={{ padding:"10px 0", borderBottom: i < 2 ? "1px solid var(--border)" : "none", display:"grid", gridTemplateColumns:"1fr 1fr 1.5fr 1fr", gap:10, alignItems:"center" }}>
                <div>
                  <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", marginBottom:3 }}>TRIGGER</div>
                  <div style={{ fontFamily:"var(--mono)", fontSize:10, fontWeight:600, color:"var(--text0)" }}>{rule.trigger}</div>
                </div>
                <div>
                  <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", marginBottom:3 }}>THRESHOLD</div>
                  <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--amber)" }}>{rule.threshold}</div>
                </div>
                <div>
                  <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", marginBottom:3 }}>ACTION</div>
                  <div style={{ fontFamily:"var(--sans)", fontSize:11, color:"var(--text1)" }}>{rule.action}</div>
                </div>
                <div>
                  <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", marginBottom:3 }}>PROVIDER</div>
                  <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--text1)" }}>{rule.provider}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB 3: APPLICANT QUEUE ───────────────────────────────────────────────────
function ApplicantsTab({ role }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [provFilter,   setProvFilter]   = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [search,       setSearch]       = useState("");
  const [selected,     setSelected]     = useState(null);
  const [applicants,   setApplicants]   = useState(APPLICANTS);

  const statusCounts = useMemo(() => {
    const c = {};
    applicants.forEach(a => { c[a.status] = (c[a.status] || 0) + 1; });
    return c;
  }, [applicants]);

  const filtered = useMemo(() => applicants.filter(a => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (provFilter   !== "all" && a.provider !== provFilter) return false;
    if (regionFilter !== "all" && a.region !== regionFilter) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.email.toLowerCase().includes(search.toLowerCase()) && !a.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [applicants, statusFilter, provFilter, regionFilter, search]);

  function handleAction(action, appl) {
    setApplicants(prev => prev.map(a => {
      if (a.id !== appl.id) return a;
      const newStatus = action === "approve" ? "approved" : action === "decline" ? "declined" : "re-verify";
      return { ...a, status: newStatus };
    }));
  }

  const uniqueRegions = [...new Set(APPLICANTS.map(a => a.region))];

  return (
    <div className="page">
      {/* KPIs */}
      <div className="grid-4" style={{ gridTemplateColumns:"repeat(6,1fr)" }}>
        {Object.entries(STATUS_META).map(([key, m]) => (
          <div key={key} style={{ background:"var(--bg1)", border:`1px solid var(--border)`, borderTop:`2px solid ${m.dot}`, borderRadius:4, padding:"10px 12px", cursor:"pointer", transition:"border-color .15s" }}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}>
            <div style={{ fontFamily:"var(--mono)", fontSize:8, textTransform:"uppercase", letterSpacing:".1em", color:"var(--text2)", marginBottom:4 }}>{m.label}</div>
            <div style={{ fontFamily:"var(--mono)", fontSize:20, fontWeight:600, color: m.color }}>{statusCounts[key] || 0}</div>
          </div>
        ))}
      </div>

      {/* Work queue highlight */}
      {(statusCounts["review"] || 0) > 0 && (
        <div style={{ padding:"10px 14px", background:"rgba(245,166,35,0.08)", border:"1px solid rgba(245,166,35,0.25)", borderRadius:3, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16 }}>⚑</span>
            <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--amber)", fontWeight:600 }}>
              {statusCounts["review"]} applicant{statusCounts["review"] > 1 ? "s" : ""} awaiting manual review
            </span>
            <span style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--text2)" }}>These cannot be auto-resolved and require a compliance officer decision.</span>
          </div>
          <button className="btn btn-amber" onClick={() => setStatusFilter("review")}>View Queue</button>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="card-body" style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <input className="search-input" placeholder="Search name, email, KYC ID…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="filter-bar">
            <button className={`filter-btn ${statusFilter==="all"?"on":""}`} onClick={() => setStatusFilter("all")}>All Status</button>
            {Object.entries(STATUS_META).map(([k, m]) => (
              <button key={k} className={`filter-btn ${statusFilter===k?"on":""}`}
                style={{ borderColor: statusFilter===k ? m.dot+"66" : undefined, color: statusFilter===k ? m.color : undefined }}
                onClick={() => setStatusFilter(statusFilter===k?"all":k)}>
                {m.label} {statusCounts[k] ? `(${statusCounts[k]})` : "(0)"}
              </button>
            ))}
          </div>
          <div className="filter-bar" style={{ marginLeft:"auto" }}>
            <select style={{ background:"var(--bg2)", border:"1px solid var(--border)", color:"var(--text1)", fontFamily:"var(--mono)", fontSize:9, padding:"4px 8px", borderRadius:3 }}
              value={provFilter} onChange={e => setProvFilter(e.target.value)}>
              <option value="all">All Providers</option>
              {Object.keys(PROVIDERS).map(k => <option key={k} value={k}>{PROVIDERS[k].name}</option>)}
            </select>
            <select style={{ background:"var(--bg2)", border:"1px solid var(--border)", color:"var(--text1)", fontFamily:"var(--mono)", fontSize:9, padding:"4px 8px", borderRadius:3 }}
              value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
              <option value="all">All Regions</option>
              {uniqueRegions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-hdr">
          <div className="card-title">Applicants <span className="tab-num">{filtered.length}</span></div>
          <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>Click row to open detail review</div>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>KYC ID</th><th>Name</th><th>Region</th><th>Provider</th>
                <th>Status</th><th>Risk Score</th><th>Face Match</th><th>Doc Auth</th>
                <th>Watchlist</th><th>Submitted</th><th>Updated</th><th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} onClick={() => setSelected(a)}>
                  <td className="mono" style={{ color:"var(--blue)", fontWeight:600 }}>{a.id}</td>
                  <td>
                    <div style={{ fontWeight:600, fontSize:12, color:"var(--text0)" }}>{a.name}</div>
                    <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>{a.email}</div>
                  </td>
                  <td>
                    <div style={{ fontFamily:"var(--mono)", fontSize:10 }}>{a.region}</div>
                    <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>{a.country}</div>
                  </td>
                  <td><ProviderPill prov={a.provider} /></td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>
                    <ScorePill score={a.riskScore} />
                    <MiniBar val={a.riskScore} />
                  </td>
                  <td className="mono" style={{ color: RISK_SCORE_COLOR(a.faceMatch) }}>{a.faceMatch}%</td>
                  <td className="mono" style={{ color: RISK_SCORE_COLOR(a.docAuth) }}>{a.docAuth}%</td>
                  <td>
                    {a.watchlistHit
                      ? <span className="badge declined"><span className="badge-dot" style={{ background:"var(--red)" }} />Hit</span>
                      : <span className="badge approved"><span className="badge-dot" style={{ background:"var(--green)" }} />Clear</span>
                    }
                  </td>
                  <td className="mono" style={{ fontSize:10, color:"var(--text2)" }}>{a.submittedAt}</td>
                  <td className="mono" style={{ fontSize:10, color:"var(--text2)" }}>{a.updatedAt}</td>
                  <td><span className="wf-tag">{a.tier}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={12} style={{ padding:"24px", textAlign:"center", color:"var(--text2)", fontFamily:"var(--mono)", fontSize:11 }}>No applicants match current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <ApplicantModal applicant={selected} role={role} onClose={() => setSelected(null)} onAction={handleAction} />
      )}
    </div>
  );
}

// ─── TAB 4: AUDIT LOG ────────────────────────────────────────────────────────
function AuditTab() {
  const [typeFilter, setTypeFilter] = useState("all");
  const filtered = typeFilter === "all" ? AUDIT_EVENTS : AUDIT_EVENTS.filter(e => e.type === typeFilter);

  return (
    <div className="page">
      <div className="card">
        <div className="card-hdr">
          <div className="card-title">Audit Log</div>
          <div className="filter-bar">
            {[["all","All"],["override","Decisions"],["credential","Credentials"],["region","Routing"],["provider","Providers"]].map(([k,l]) => (
              <button key={k} className={`filter-btn ${typeFilter===k?"on":""}`} onClick={() => setTypeFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          {filtered.map((e, i) => (
            <div className="audit-item" key={i}>
              <div className="audit-icon" style={{ background: e.iconBg, color: e.color }}>{e.icon}</div>
              <div style={{ flex:1 }}>
                <div className="audit-msg">
                  <span className="audit-actor">{e.actor}</span>
                  {" "}{e.msg}{" "}
                  <span className="audit-target">{e.target}</span>
                </div>
              </div>
              <div className="audit-time">{e.time}</div>
            </div>
          ))}
        </div>
        <div style={{ padding:"12px 14px", borderTop:"1px solid var(--border)", fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", display:"flex", justifyContent:"space-between" }}>
          <span>Showing {filtered.length} events · Audit records are immutable and retained for 7 years per regulatory requirement.</span>
          <button className="btn btn-ghost" style={{ fontSize:8 }}>Export CSV</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key:"providers",  label:"Provider Connections" },
  { key:"regions",    label:"Region Routing" },
  { key:"applicants", label:"Applicant Queue", count: APPLICANTS.filter(a => a.status === "review").length },
  { key:"audit",      label:"Audit Log" },
];

export default function KYCAdmin() {
  const [tab,  setTab]  = useState("applicants");
  const [role, setRole] = useState(ROLES.COMPLIANCE);

  const pendingCount  = APPLICANTS.filter(a => a.status === "pending").length;
  const reviewCount   = APPLICANTS.filter(a => a.status === "review").length;
  const approvedCount = APPLICANTS.filter(a => a.status === "approved").length;

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">

        {/* TOPBAR */}
        <div className="topbar">
          <div className="logo"><div className="pulse" />STELLA KYC</div>
          <div className="tb-sep" />
          <div className="tb-stat"><div className="tb-lbl">Approved</div><div className="tb-val g">{approvedCount}</div></div>
          <div className="tb-stat"><div className="tb-lbl">Pending</div><div className="tb-val b">{pendingCount}</div></div>
          <div className="tb-stat"><div className="tb-lbl">Manual Review</div><div className="tb-val a">{reviewCount}</div></div>
          <div className="tb-sep" />
          <div className="tb-stat"><div className="tb-lbl">Providers</div><div className="tb-val">SumSub · Onfido · Persona</div></div>
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
            {/* Role switcher — demo only, would be auth in prod */}
            <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>Viewing as:</div>
            <button className="role-badge"
              onClick={() => setRole(r => r === ROLES.COMPLIANCE ? ROLES.PLATFORM : ROLES.COMPLIANCE)}
              style={{
                background: role === ROLES.COMPLIANCE ? "rgba(0,229,160,0.08)" : "rgba(61,157,243,0.08)",
                color: role === ROLES.COMPLIANCE ? "var(--green)" : "var(--blue)",
                borderColor: role === ROLES.COMPLIANCE ? "rgba(0,229,160,0.25)" : "rgba(61,157,243,0.25)",
                cursor:"pointer",
              }}>
              {role} ↔
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="tab-bar">
          {TABS.map(t => (
            <button key={t.key} className={`tab-btn ${tab===t.key?"on":""}`} onClick={() => setTab(t.key)}>
              {t.label}
              {t.count > 0 && <span className="tab-num" style={{ background:"rgba(245,166,35,.15)", color:"var(--amber)" }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {tab === "providers"  && <ProvidersTab role={role} />}
          {tab === "regions"    && <RegionsTab role={role} />}
          {tab === "applicants" && <ApplicantsTab role={role} />}
          {tab === "audit"      && <AuditTab />}
        </div>
      </div>
    </>
  );
}
