import { useState, useRef } from "react";

// ─── STYLES ──────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=DM+Sans:wght@300;400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg0:#080c10; --bg1:#0d1117; --bg2:#131920; --bg3:#1a2230; --bg4:#1e2d40;
    --border:#1e2d40; --border2:#253550;
    --text0:#e8edf3; --text1:#8fa3b8; --text2:#5a7090; --text3:#3a5068;
    --green:#00e5a0; --green-dim:rgba(0,229,160,0.10); --green-mid:rgba(0,229,160,0.22);
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

  .app{display:flex;flex-direction:column;min-height:100vh}

  /* TOPBAR */
  .topbar{display:flex;align-items:center;height:50px;padding:0 20px;background:var(--bg1);border-bottom:1px solid var(--border);flex-shrink:0;gap:16px;z-index:100}
  .logo{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--green);letter-spacing:.08em;display:flex;align-items:center;gap:8px;white-space:nowrap}
  .pulse{width:7px;height:7px;background:var(--green);border-radius:50%;animation:pulse 2s infinite;flex-shrink:0}
  @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,229,160,.5)}60%{opacity:.8;box-shadow:0 0 0 6px rgba(0,229,160,0)}}
  .tb-sep{width:1px;height:24px;background:var(--border);flex-shrink:0}
  .unsaved-banner{display:flex;align-items:center;gap:8px;padding:4px 12px;background:var(--amber-dim);border:1px solid rgba(245,166,35,.25);border-radius:3px;font-family:var(--mono);font-size:10px;color:var(--amber)}

  /* LAYOUT */
  .layout{display:flex;flex:1;overflow:hidden}

  /* SIDEBAR NAV */
  .sidenav{width:220px;flex-shrink:0;background:var(--bg1);border-right:1px solid var(--border);overflow-y:auto;padding:14px 0}
  .nav-group-lbl{padding:6px 16px 4px;font-family:var(--mono);font-size:8px;text-transform:uppercase;letter-spacing:.14em;color:var(--text3)}
  .nav-item{display:flex;align-items:center;gap:9px;padding:8px 16px;cursor:pointer;transition:all .12s;border-left:2px solid transparent;position:relative}
  .nav-item:hover{background:var(--bg2);color:var(--text0)}
  .nav-item.on{background:var(--bg2);border-left-color:var(--green);color:var(--green)}
  .nav-item-icon{font-size:13px;width:16px;text-align:center;flex-shrink:0}
  .nav-item-lbl{font-family:var(--sans);font-size:12px;font-weight:500;color:inherit}
  .nav-item.on .nav-item-lbl{color:var(--green)}
  .nav-item:not(.on) .nav-item-lbl{color:var(--text1)}
  .nav-badge{margin-left:auto;padding:1px 5px;border-radius:2px;font-family:var(--mono);font-size:8px;font-weight:700;background:var(--amber-dim);color:var(--amber)}
  .nav-divider{height:1px;background:var(--border);margin:8px 0}

  /* CONTENT */
  .content{flex:1;overflow-y:auto;background:var(--bg0)}
  .tab-page{padding:22px 24px;display:flex;flex-direction:column;gap:20px;max-width:1100px}

  /* SECTION */
  .sec{background:var(--bg1);border:1px solid var(--border);border-radius:4px;overflow:hidden}
  .sec-hdr{padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
  .sec-title{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text1);display:flex;align-items:center;gap:8px}
  .sec-desc{font-size:11px;color:var(--text2);margin-top:2px}
  .sec-body{padding:18px}
  .sec-body.no-pad{padding:0}
  .sec-footer{padding:10px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;background:var(--bg2)}

  /* PAGE HEADER */
  .page-hdr{margin-bottom:4px}
  .page-title{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text0);letter-spacing:.04em}
  .page-sub{font-family:var(--mono);font-size:10px;color:var(--text2);margin-top:3px}

  /* FORM ELEMENTS */
  .field{display:flex;flex-direction:column;gap:5px}
  .field-lbl{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);display:flex;align-items:center;gap:6px}
  .field-hint{font-family:var(--mono);font-size:9px;color:var(--text3);margin-top:2px}
  .inp{background:var(--bg2);border:1px solid var(--border);color:var(--text0);font-family:var(--mono);font-size:11px;padding:7px 10px;border-radius:3px;outline:none;width:100%;transition:border-color .12s}
  .inp:focus{border-color:var(--border2)}
  .inp::placeholder{color:var(--text3)}
  .inp[type=number]{-moz-appearance:textfield}
  .inp::-webkit-inner-spin-button{display:none}
  .sel{background:var(--bg2);border:1px solid var(--border);color:var(--text0);font-family:var(--mono);font-size:11px;padding:7px 10px;border-radius:3px;outline:none;width:100%;cursor:pointer}

  /* TOGGLE */
  .toggle-wrap{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)}
  .toggle-wrap:last-child{border-bottom:none;padding-bottom:0}
  .toggle-info{}
  .toggle-lbl{font-size:12px;color:var(--text0);font-weight:500}
  .toggle-sub{font-family:var(--mono);font-size:9px;color:var(--text2);margin-top:2px}
  .toggle{position:relative;width:36px;height:20px;flex-shrink:0}
  .toggle input{opacity:0;width:0;height:0}
  .toggle-slider{position:absolute;inset:0;background:var(--bg3);border:1px solid var(--border2);border-radius:20px;cursor:pointer;transition:.2s}
  .toggle-slider::before{content:'';position:absolute;height:14px;width:14px;left:2px;top:2px;background:var(--text2);border-radius:50%;transition:.2s}
  .toggle input:checked + .toggle-slider{background:var(--green-dim);border-color:rgba(0,229,160,.4)}
  .toggle input:checked + .toggle-slider::before{transform:translateX(16px);background:var(--green)}

  /* RANGE SLIDER */
  .range-field{display:flex;flex-direction:column;gap:6px}
  .range-top{display:flex;justify-content:space-between;align-items:baseline}
  .range-lbl{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2)}
  .range-val{font-family:var(--mono);font-size:14px;font-weight:600;color:var(--text0)}
  .range-unit{font-family:var(--mono);font-size:9px;color:var(--text2);margin-left:2px}
  .range-sub{font-family:var(--mono);font-size:9px;color:var(--text3)}
  input[type=range]{-webkit-appearance:none;width:100%;height:4px;background:var(--bg3);border-radius:2px;outline:none;cursor:pointer}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--green);border:2px solid var(--bg1);cursor:pointer;transition:transform .1s}
  input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.2)}
  input[type=range].amber::-webkit-slider-thumb{background:var(--amber)}
  input[type=range].red::-webkit-slider-thumb{background:var(--red)}

  /* TABLES */
  .tbl{width:100%;border-collapse:collapse}
  .tbl th{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);padding:8px 14px;text-align:left;border-bottom:1px solid var(--border);background:var(--bg2);font-weight:500;white-space:nowrap}
  .tbl th.r{text-align:right}
  .tbl td{padding:10px 14px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text1);vertical-align:middle}
  .tbl tr:last-child td{border-bottom:none}
  .tbl tr:hover td{background:var(--bg2)}
  .tbl td.mono{font-family:var(--mono);font-size:10px}
  .tbl td.r{text-align:right}

  /* TAGS / BADGES */
  .tag{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:2px;font-family:var(--mono);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
  .tag-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
  .tag.green  {background:var(--green-dim);color:var(--green)}
  .tag.amber  {background:var(--amber-dim);color:var(--amber)}
  .tag.red    {background:var(--red-dim);color:var(--red)}
  .tag.blue   {background:var(--blue-dim);color:var(--blue)}
  .tag.purple {background:var(--purple-dim);color:var(--purple)}
  .tag.cyan   {background:var(--cyan-dim);color:var(--cyan)}
  .tag.ghost  {background:var(--bg3);color:var(--text1);border:1px solid var(--border2)}

  /* BUTTONS */
  .btn{padding:6px 13px;border-radius:3px;font-family:var(--mono);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;cursor:pointer;border:1px solid;transition:all .12s;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
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
  .btn[disabled]{opacity:.35;cursor:not-allowed;pointer-events:none}

  /* ALERT BOX */
  .alert{padding:9px 12px;border-radius:3px;font-family:var(--mono);font-size:10px;display:flex;align-items:flex-start;gap:8px;line-height:1.6;border:1px solid}
  .alert.warn{background:var(--amber-dim);border-color:rgba(245,166,35,.25);color:var(--amber)}
  .alert.danger{background:var(--red-dim);border-color:rgba(255,71,87,.25);color:var(--red)}
  .alert.info{background:var(--blue-dim);border-color:rgba(61,157,243,.25);color:var(--blue)}
  .alert.success{background:var(--green-dim);border-color:rgba(0,229,160,.2);color:var(--green)}

  /* GRID */
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
  .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .span2{grid-column:span 2}

  /* STAT MINI */
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
  .kpi{background:var(--bg1);border:1px solid var(--border);border-top:2px solid var(--green);border-radius:4px;padding:12px 14px}
  .kpi.amber{border-top-color:var(--amber)} .kpi.red{border-top-color:var(--red)} .kpi.blue{border-top-color:var(--blue)} .kpi.purple{border-top-color:var(--purple)}
  .kpi-lbl{font-family:var(--mono);font-size:8px;text-transform:uppercase;letter-spacing:.12em;color:var(--text2);margin-bottom:4px}
  .kpi-val{font-family:var(--mono);font-size:20px;font-weight:600;color:var(--text0)}
  .kpi-val.g{color:var(--green)} .kpi-val.a{color:var(--amber)} .kpi-val.r{color:var(--red)} .kpi-val.b{color:var(--blue)}
  .kpi-sub{font-family:var(--mono);font-size:8px;color:var(--text2);margin-top:3px}

  /* EXCHANGE LOGO */
  .ex-logo{width:28px;height:28px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;font-weight:700;flex-shrink:0}

  /* MASKED INPUT */
  .masked-row{display:flex;gap:6px;align-items:center}
  .masked-val{flex:1;background:var(--bg2);border:1px solid var(--border);color:var(--text2);font-family:var(--mono);font-size:10px;padding:6px 10px;border-radius:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

  /* NOTIFICATION CHANNEL */
  .notif-channel{background:var(--bg2);border:1px solid var(--border);border-radius:4px;overflow:hidden;margin-bottom:10px}
  .nc-hdr{padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)}
  .nc-icon{font-size:16px;width:24px;text-align:center}
  .nc-name{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--text0);flex:1}
  .nc-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}
  .severity-row{display:flex;align-items:center;gap:8px}
  .severity-lbl{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.08em;width:70px;flex-shrink:0}

  /* USER ROW */
  .user-avatar{width:30px;height:30px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:11px;font-weight:600;flex-shrink:0}

  /* TIER CARD */
  .tier-card{background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:14px;position:relative;overflow:hidden}
  .tier-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
  .tier-card.basic::before{background:var(--text2)}
  .tier-card.pro::before{background:var(--green)}
  .tier-card.enterprise::before{background:var(--amber)}
  .tier-name{font-family:var(--mono);font-size:12px;font-weight:600;color:var(--text0);margin-bottom:10px}
  .tier-limit{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:10px}
  .tier-limit:last-child{border-bottom:none;padding-bottom:0}
  .tier-limit-lbl{color:var(--text2)}
  .tier-limit-val{color:var(--text0);font-weight:600}

  /* FEAT FLAG */
  .ff-row{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border)}
  .ff-row:last-child{border-bottom:none}
  .ff-info{}
  .ff-name{font-family:var(--mono);font-size:11px;color:var(--text0);font-weight:500}
  .ff-desc{font-family:var(--mono);font-size:9px;color:var(--text2);margin-top:2px}
  .ff-env{display:flex;gap:5px}
  .ff-env-tag{padding:2px 7px;border-radius:2px;font-family:var(--mono);font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}

  /* JOB ROW */
  .job-row{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 100px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border)}
  .job-row:last-child{border-bottom:none}
  .job-name{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text0)}
  .job-sub{font-family:var(--mono);font-size:8px;color:var(--text2);margin-top:2px}

  /* WEBHOOK ROW */
  .wh-row{padding:12px 14px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start}
  .wh-row:last-child{border-bottom:none}
  .wh-url{font-family:var(--mono);font-size:10px;color:var(--blue);word-break:break-all}
  .wh-events{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}

  /* IP LIST */
  .ip-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:2px;font-family:var(--mono);font-size:10px;color:var(--text1)}
  .ip-chip-x{color:var(--text2);cursor:pointer;font-size:10px;line-height:1}
  .ip-chip-x:hover{color:var(--red)}

  /* CRON */
  .cron{font-family:var(--mono);font-size:9px;color:var(--cyan);background:var(--cyan-dim);padding:1px 6px;border-radius:2px}

  /* TEMPLATE CARD */
  .tmpl-card{background:var(--bg2);border:1px solid var(--border);border-radius:3px;padding:10px 12px;cursor:pointer;transition:border-color .12s}
  .tmpl-card:hover{border-color:var(--border2)}
  .tmpl-card.on{border-color:rgba(0,229,160,.35)}
  .tmpl-name{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text0);margin-bottom:3px}
  .tmpl-sub{font-family:var(--mono);font-size:9px;color:var(--text2)}

  /* DIVIDER */
  .divider{height:1px;background:var(--border);margin:14px 0}

  @media(max-width:860px){.sidenav{display:none}.g2,.g3,.g4{grid-template-columns:1fr}.tab-page{padding:14px}}
`;

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const EXCHANGES_DATA = [
  { id:"binance",  name:"Binance",  color:"#C99400", bg:"#C9940018", abbr:"BN", status:"connected",   apiKey:"BNCE-••••-••••-••••-3f2a", rateLimit:1200, pairs:47, env:"live",    lastPing:"1s ago",  fees:"0.02/0.04" },
  { id:"bybit",    name:"Bybit",    color:"#00e5a0", bg:"#00e5a018", abbr:"BY", status:"connected",   apiKey:"BYBT-••••-••••-••••-9c1d", rateLimit:600,  pairs:31, env:"live",    lastPing:"2s ago",  fees:"0.01/0.06" },
  { id:"okx",      name:"OKX",      color:"#3d9df3", bg:"#3d9df318", abbr:"OK", status:"connected",   apiKey:"OKEX-••••-••••-••••-7b3e", rateLimit:1000, pairs:28, env:"live",    lastPing:"3s ago",  fees:"0.02/0.05" },
  { id:"kraken",   name:"Kraken",   color:"#8B5CF6", bg:"#8B5CF618", abbr:"KR", status:"degraded",    apiKey:"KRKN-••••-••••-••••-2d1f", rateLimit:60,   pairs:19, env:"live",    lastPing:"18s ago", fees:"0.16/0.26" },
  { id:"kucoin",   name:"Kucoin",   color:"#21A179", bg:"#21A17918", abbr:"KC", status:"connected",   apiKey:"KUCN-••••-••••-••••-5a8c", rateLimit:600,  pairs:22, env:"live",    lastPing:"2s ago",  fees:"0.10/0.10" },
  { id:"binance_t",name:"Binance Testnet",color:"#7a6200",bg:"#7a620018",abbr:"BT",status:"connected",apiKey:"BNTST-••••-••••-8812",rateLimit:1200,pairs:47,env:"sandbox",lastPing:"5s ago",fees:"0/0" },
];

const ADMIN_USERS = [
  { id:1, name:"George Wekesa",   email:"george@stella.io",  role:"Platform Admin",      twoFA:true,  lastLogin:"Just now",   color:"#3d9df3", initials:"GW", sessions:1 },
  { id:2, name:"Amara Nwosu",    email:"amara@stella.io",   role:"Compliance Officer",  twoFA:true,  lastLogin:"2h ago",     color:"#00e5a0", initials:"AN", sessions:1 },
  { id:3, name:"David Kiptoo",   email:"david@stella.io",   role:"Read Only",           twoFA:false, lastLogin:"1d ago",     color:"#f5a623", initials:"DK", sessions:0 },
  { id:4, name:"Fatima Al-Rashid",email:"fatima@stella.io", role:"Compliance Officer",  twoFA:true,  lastLogin:"3h ago",     color:"#a78bfa", initials:"FA", sessions:1 },
];

const ROLES_LIST = ["Platform Admin","Compliance Officer","Ops Engineer","Read Only"];

const FEATURE_FLAGS = [
  { key:"multi_exchange_arbitrage",   name:"Multi-Exchange Arbitrage",   desc:"Allow bots to execute cross-exchange arbitrage simultaneously",       prod:true,  staging:true,  dev:true  },
  { key:"enhanced_due_diligence",     name:"Enhanced Due Diligence KYC", desc:"Require enhanced KYC for accounts above 10M UGX AUM",               prod:true,  staging:true,  dev:true  },
  { key:"auto_circuit_breaker",       name:"Auto Circuit Breaker",       desc:"Automatically pause all bots when platform drawdown exceeds threshold", prod:true, staging:true,  dev:true  },
  { key:"user_api_access",            name:"User API Access",            desc:"Allow Pro/Enterprise users to connect external tools via API",       prod:false, staging:true,  dev:true  },
  { key:"websocket_v2",               name:"WebSocket v2 Protocol",      desc:"New optimised WebSocket protocol with binary framing",              prod:false, staging:false, dev:true  },
  { key:"referral_programme",         name:"Referral Programme",         desc:"Enable referral code generation and commission tracking",            prod:false, staging:true,  dev:true  },
  { key:"strategy_marketplace",       name:"Strategy Marketplace",       desc:"Allow users to publish and subscribe to community strategies",       prod:false, staging:false, dev:false },
];

const JOBS_DATA = [
  { name:"Fee Calculation",        desc:"Calculates and records platform fees per user",   cron:"0 1 * * *",  lastRun:"2h ago",   nextRun:"22h",  status:"ok"   },
  { name:"Document Expiry Scan",   desc:"Flags KYC documents expiring within 30 days",     cron:"0 8 * * *",  lastRun:"16h ago",  nextRun:"8h",   status:"ok"   },
  { name:"AML Watchlist Refresh",  desc:"Re-screens all users against updated lists",       cron:"0 3 * * 0",  lastRun:"3d ago",   nextRun:"4d",   status:"ok"   },
  { name:"Metrics Aggregation",    desc:"Aggregates hourly metrics into daily summaries",   cron:"5 0 * * *",  lastRun:"2h ago",   nextRun:"22h",  status:"ok"   },
  { name:"Position Reconciliation",desc:"Reconciles bot positions against exchange state",  cron:"*/15 * * * *",lastRun:"3m ago",  nextRun:"12m",  status:"ok"   },
  { name:"Inactive Bot Cleanup",   desc:"Archives bots with no activity for 30+ days",     cron:"0 4 1 * *",  lastRun:"18d ago",  nextRun:"13d",  status:"warn" },
];

const WEBHOOK_DATA = [
  { url:"https://hooks.slack.com/services/T0••••/B0••••/x••••", events:["platform.alert","bot.kill"], active:true  },
  { url:"https://api.pagerduty.com/v2/enqueue/••••••••",        events:["platform.alert.critical"],   active:true  },
  { url:"https://client-api.example.com/stella/events",         events:["kyc.approved","kyc.declined","bot.started","bot.stopped"], active:true  },
  { url:"https://app.eu.xero.com/api.xro/2.0/webhook/••••",    events:["billing.invoice","billing.payment"], active:false },
];

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  );
}

function RangeField({ label, value, min, max, step, unit, hint, color, onChange }) {
  return (
    <div className="range-field">
      <div className="range-top">
        <span className="range-lbl">{label}</span>
        <span><span className="range-val">{value}</span><span className="range-unit">{unit}</span></span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} className={color} onChange={e => onChange(Number(e.target.value))} />
      {hint && <div className="range-sub">{hint}</div>}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="field">
      <div className="field-lbl">{label}</div>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

function ToggleRow({ label, sub, checked, onChange, disabled }) {
  return (
    <div className="toggle-wrap" style={{ opacity: disabled ? .45 : 1 }}>
      <div className="toggle-info">
        <div className="toggle-lbl">{label}</div>
        {sub && <div className="toggle-sub">{sub}</div>}
      </div>
      <Toggle checked={checked} onChange={disabled ? () => {} : onChange} />
    </div>
  );
}

function SaveBar({ dirty, onSave, onDiscard }) {
  if (!dirty) return null;
  return (
    <div className="sec-footer">
      <button className="btn btn-ghost" onClick={onDiscard}>Discard Changes</button>
      <button className="btn btn-green" onClick={onSave}>Save Changes</button>
    </div>
  );
}

function StatusDot({ status }) {
  const col = status === "connected" ? "var(--green)" : status === "degraded" ? "var(--amber)" : "var(--red)";
  return <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:col, flexShrink:0 }} />;
}

// ─── TAB: RISK CONTROLS ───────────────────────────────────────────────────────
function RiskTab({ onDirty }) {
  const [r, setR] = useState({
    maxDrawdown: 10, dailyLossLimit: 5, maxPositionSize: 8, maxConcurrentPositions: 20,
    circuitBreakerPct: 15, circuitBreakerWindow: 4, maxLeverage: 5, maxBotsPerUser: 10,
    forceLimit: true, autoHaltOnCircuit: true, notifyOnDrawdown: true,
    allowMarketOrders: true, requireStopLoss: false, maxSlippage: 0.5,
  });
  const set = (k, v) => { setR(p => ({ ...p, [k]: v })); onDirty(); };

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Risk Controls</div>
        <div className="page-sub">Platform-wide guardrails. These override all strategy-level configurations and cannot be bypassed per-bot.</div>
      </div>

      <div className="alert warn">⚠ Changes to risk controls take effect immediately and apply to all running bots. Lowering thresholds may trigger automatic halts on currently open positions.</div>

      {/* Drawdown & Loss */}
      <div className="sec">
        <div className="sec-hdr">
          <div><div className="sec-title">Drawdown &amp; Loss Limits</div><div className="sec-desc">Maximum acceptable losses before automatic intervention</div></div>
        </div>
        <div className="sec-body">
          <div className="g2" style={{ gap:24 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <RangeField label="Max Platform Drawdown" value={r.maxDrawdown} min={1} max={30} step={0.5} unit="%" color="amber"
                hint="When platform equity drops this % from peak, all bots pause and an alert fires." onChange={v => set("maxDrawdown", v)} />
              <RangeField label="Daily Loss Limit (per user)" value={r.dailyLossLimit} min={1} max={20} step={0.5} unit="%" color="amber"
                hint="If a user's portfolio loses more than this in a calendar day, their bots auto-pause." onChange={v => set("dailyLossLimit", v)} />
              <RangeField label="Circuit Breaker Threshold" value={r.circuitBreakerPct} min={5} max={50} step={1} unit="%" color="red"
                hint="Emergency halt: kills ALL bots platform-wide if this % loss occurs." onChange={v => set("circuitBreakerPct", v)} />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <RangeField label="Circuit Breaker Window" value={r.circuitBreakerWindow} min={1} max={24} step={1} unit="h"
                hint="How many hours the circuit breaker looks back when calculating loss." onChange={v => set("circuitBreakerWindow", v)} />
              <RangeField label="Max Slippage Tolerance" value={r.maxSlippage} min={0.05} max={3} step={0.05} unit="%" color="amber"
                hint="Orders with expected slippage above this are cancelled, not executed." onChange={v => set("maxSlippage", v)} />
            </div>
          </div>
          <div className="divider" />
          <ToggleRow label="Auto-halt on circuit breaker" sub="When the circuit breaker threshold is hit, automatically kill all bots without requiring manual confirmation." checked={r.autoHaltOnCircuit} onChange={v => set("autoHaltOnCircuit", v)} />
          <ToggleRow label="Alert on drawdown approach" sub="Send a warning alert when platform drawdown reaches 80% of the configured limit." checked={r.notifyOnDrawdown} onChange={v => set("notifyOnDrawdown", v)} />
        </div>
      </div>

      {/* Position & Exposure */}
      <div className="sec">
        <div className="sec-hdr">
          <div><div className="sec-title">Position &amp; Exposure Limits</div><div className="sec-desc">Controls on individual position sizing and leverage</div></div>
        </div>
        <div className="sec-body">
          <div className="g2" style={{ gap:24 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <RangeField label="Max Position Size" value={r.maxPositionSize} min={1} max={50} step={0.5} unit="% of user equity" color="amber"
                hint="No single position can exceed this percentage of the user's total equity." onChange={v => set("maxPositionSize", v)} />
              <RangeField label="Max Concurrent Positions" value={r.maxConcurrentPositions} min={1} max={100} step={1} unit="positions"
                hint="Maximum open positions per bot at any one time." onChange={v => set("maxConcurrentPositions", v)} />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <RangeField label="Maximum Leverage" value={r.maxLeverage} min={1} max={125} step={1} unit="x" color="red"
                hint="Hard ceiling on leverage regardless of what the exchange allows." onChange={v => set("maxLeverage", v)} />
              <RangeField label="Max Bots Per User" value={r.maxBotsPerUser} min={1} max={50} step={1} unit="bots"
                hint="Platform-wide ceiling. Subscription tier limits apply within this." onChange={v => set("maxBotsPerUser", v)} />
            </div>
          </div>
          <div className="divider" />
          <ToggleRow label="Force limit orders only" sub="Disallow market orders platform-wide. All orders must be placed as limit orders." checked={r.forceLimit} onChange={v => set("forceLimit", v)} />
          <ToggleRow label="Allow market orders" sub="Permit market orders. Overridden by 'Force limit orders only' above." checked={r.allowMarketOrders} onChange={v => set("allowMarketOrders", v)} disabled={r.forceLimit} />
          <ToggleRow label="Require stop-loss on all positions" sub="Bots cannot open a position without a configured stop-loss level." checked={r.requireStopLoss} onChange={v => set("requireStopLoss", v)} />
        </div>
        <SaveBar dirty onSave={() => {}} onDiscard={() => {}} />
      </div>
    </div>
  );
}

// ─── TAB: EXCHANGE MANAGEMENT ────────────────────────────────────────────────
function ExchangesTab({ onDirty }) {
  const [exs, setExs] = useState(EXCHANGES_DATA);
  const [revealed, setRevealed] = useState({});
  const [testing, setTesting] = useState({});
  const [testedOk, setTestedOk] = useState({});
  const [expanded, setExpanded] = useState(null);

  function test(id) {
    setTesting(p => ({ ...p, [id]: true }));
    setTimeout(() => { setTesting(p => ({ ...p, [id]: false })); setTestedOk(p => ({ ...p, [id]: true })); }, 1500);
  }

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Exchange Management</div>
        <div className="page-sub">API credentials, rate limits, and connection health per connected exchange.</div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="kpi-lbl">Connected</div><div className="kpi-val g">5</div><div className="kpi-sub">1 sandbox</div></div>
        <div className="kpi amber"><div className="kpi-lbl">Degraded</div><div className="kpi-val a">1</div><div className="kpi-sub">Kraken · high latency</div></div>
        <div className="kpi blue"><div className="kpi-lbl">Total Pairs</div><div className="kpi-val b">147</div><div className="kpi-sub">Across all exchanges</div></div>
        <div className="kpi"><div className="kpi-lbl">Avg Latency</div><div className="kpi-val">84ms</div><div className="kpi-sub">Last 5 min avg</div></div>
      </div>

      {exs.map(ex => (
        <div className="sec" key={ex.id} style={{ borderTop: `2px solid ${ex.color}` }}>
          <div className="sec-hdr" style={{ cursor:"pointer" }} onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div className="ex-logo" style={{ background: ex.bg, color: ex.color }}>{ex.abbr}</div>
              <div>
                <div style={{ fontFamily:"var(--mono)", fontSize:12, fontWeight:600, color:"var(--text0)", display:"flex", alignItems:"center", gap:8 }}>
                  {ex.name}
                  <StatusDot status={ex.status} />
                  <span className={`tag ${ex.status === "connected" ? "green" : ex.status === "degraded" ? "amber" : "red"}`}>{ex.status}</span>
                  {ex.env === "sandbox" && <span className="tag cyan">Sandbox</span>}
                </div>
                <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", marginTop:2 }}>{ex.pairs} pairs · Last ping {ex.lastPing} · Fees {ex.fees}% maker/taker</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button className="btn btn-ghost" style={{ fontSize:9 }} onClick={e => { e.stopPropagation(); test(ex.id); }}>
                {testing[ex.id] ? "Testing…" : testedOk[ex.id] ? "✓ Healthy" : "Test"}
              </button>
              <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--text2)" }}>{expanded === ex.id ? "▲" : "▼"}</span>
            </div>
          </div>

          {expanded === ex.id && (
            <div className="sec-body">
              <div className="g2">
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <Field label="API Key">
                    <div className="masked-row">
                      <div className="masked-val">{revealed[ex.id + "-key"] ? `LIVE-KEY-${ex.id.toUpperCase()}-EXAMPLE` : ex.apiKey}</div>
                      <button className="btn btn-ghost" style={{ fontSize:9, padding:"4px 8px" }} onClick={() => { setRevealed(p => ({ ...p, [ex.id+"-key"]: !p[ex.id+"-key"] })); }}>
                        {revealed[ex.id+"-key"] ? "Hide" : "Reveal"}
                      </button>
                    </div>
                  </Field>
                  <Field label="API Secret">
                    <div className="masked-row">
                      <div className="masked-val">••••••••••••••••••••••••••••••••••••</div>
                      <button className="btn btn-ghost" style={{ fontSize:9, padding:"4px 8px" }}>Rotate</button>
                    </div>
                  </Field>
                  <Field label="Passphrase (if required)">
                    <div className="masked-row">
                      <div className="masked-val">••••••••</div>
                      <button className="btn btn-ghost" style={{ fontSize:9, padding:"4px 8px" }}>Update</button>
                    </div>
                  </Field>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <Field label="Rate Limit (requests/min)" hint="Maximum API calls per minute to this exchange.">
                    <input className="inp" type="number" defaultValue={ex.rateLimit} onChange={onDirty} />
                  </Field>
                  <Field label="Environment">
                    <select className="sel" defaultValue={ex.env}>
                      <option value="live">Live / Production</option>
                      <option value="sandbox">Sandbox / Testnet</option>
                    </select>
                  </Field>
                  <Field label="Max Open Orders" hint="Hard limit on simultaneous open orders on this exchange.">
                    <input className="inp" type="number" defaultValue={200} onChange={onDirty} />
                  </Field>
                </div>
              </div>
              <div className="divider" />
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button className="btn btn-red" style={{ fontSize:9 }}>Disconnect</button>
                <button className="btn btn-green" style={{ fontSize:9 }}>Save Changes</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div style={{ border:"1px dashed var(--border2)", borderRadius:4, padding:18, display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
        <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--text2)" }}>Connect a new exchange — Bitget, MEXC, Deribit, Hyperliquid…</span>
        <button className="btn btn-green">+ Add Exchange</button>
      </div>
    </div>
  );
}

// ─── TAB: USERS & SUBSCRIPTIONS ──────────────────────────────────────────────
function SubscriptionsTab({ onDirty }) {
  const tiers = [
    { key:"basic", name:"Basic", price:"$29/mo", color:"var(--text2)", bots:2, aum:"$10,000", exchanges:2, strategies:2, api:false, support:"Email" },
    { key:"pro",   name:"Pro",   price:"$99/mo", color:"var(--green)", bots:10, aum:"$100,000", exchanges:5, strategies:"All", api:true, support:"Priority Email" },
    { key:"enterprise", name:"Enterprise", price:"Custom", color:"var(--amber)", bots:"Unlimited", aum:"Unlimited", exchanges:"All", strategies:"All", api:true, support:"Dedicated" },
  ];
  const LIMIT_ROWS = [["Max Bots","bots"],["Max AUM","aum"],["Exchanges","exchanges"],["Strategies","strategies"],["API Access","api"],["Support","support"]];

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Users &amp; Subscriptions</div>
        <div className="page-sub">Tier definitions, limits, and upgrade policy.</div>
      </div>

      {/* Tier cards */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Subscription Tiers</div><button className="btn btn-ghost" style={{ fontSize:9 }}>+ Add Tier</button></div>
        <div className="sec-body">
          <div className="g3">
            {tiers.map(t => (
              <div className="tier-card" key={t.key} style={{ borderTopColor: t.color }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                  <div className="tier-name" style={{ color: t.color }}>{t.name}</div>
                  <div style={{ fontFamily:"var(--mono)", fontSize:12, fontWeight:600, color:"var(--text0)" }}>{t.price}</div>
                </div>
                {LIMIT_ROWS.map(([label, key]) => (
                  <div className="tier-limit" key={key}>
                    <span className="tier-limit-lbl">{label}</span>
                    <span className="tier-limit-val" style={{ color: t.color }}>
                      {typeof t[key] === "boolean" ? (t[key] ? "✓ Yes" : "✕ No") : t[key]}
                    </span>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ marginTop:10, width:"100%", fontSize:9, justifyContent:"center" }}>Edit Tier</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upgrade flow */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Upgrade Policy</div></div>
        <div className="sec-body">
          <div className="g2">
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <Field label="Tier Upgrade Method" hint="How users move to a higher tier.">
                <select className="sel"><option>Automatic on payment</option><option>Manual approval required</option><option>Automatic with KYC gate</option></select>
              </Field>
              <Field label="Trial Period (days)" hint="Days of Pro access before requiring payment.">
                <input className="inp" type="number" defaultValue={14} />
              </Field>
              <Field label="Grace Period on Failed Payment" hint="Days before bots are suspended after a failed billing attempt.">
                <input className="inp" type="number" defaultValue={3} />
              </Field>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <Field label="Enhanced KYC AUM Threshold (UGX)" hint="Trigger re-verification when user AUM crosses this.">
                <input className="inp" type="number" defaultValue={10000000} />
              </Field>
              <Field label="Referral Commission (%)" hint="Percentage of referred user's monthly fee paid to referrer.">
                <input className="inp" type="number" defaultValue={10} />
              </Field>
            </div>
          </div>
          <div className="divider" />
          <ToggleRow label="Enable trial period" sub="New users automatically get trial Pro access." checked={true} onChange={() => onDirty()} />
          <ToggleRow label="Enable referral programme" sub="Users can generate referral codes and earn commission." checked={false} onChange={() => onDirty()} />
          <ToggleRow label="Require KYC before trading" sub="Users cannot activate bots until KYC is approved." checked={true} onChange={() => onDirty()} />
        </div>
        <SaveBar dirty onSave={() => {}} onDiscard={() => {}} />
      </div>
    </div>
  );
}

// ─── TAB: NOTIFICATIONS ──────────────────────────────────────────────────────
function NotificationsTab({ onDirty }) {
  const channels = [
    { key:"slack",     icon:"💬", name:"Slack",     active:true,  hasWebhook:true  },
    { key:"pagerduty", icon:"🚨", name:"PagerDuty", active:true,  hasWebhook:true  },
    { key:"email",     icon:"📧", name:"Email",     active:true,  hasWebhook:false },
    { key:"sms",       icon:"📱", name:"SMS",       active:false, hasWebhook:false },
  ];
  const severities = [
    { key:"critical", col:"var(--red)",    label:"Critical" },
    { key:"warning",  col:"var(--amber)",  label:"Warning"  },
    { key:"info",     col:"var(--blue)",   label:"Info"     },
  ];
  const [routing, setRouting] = useState({
    slack:     { critical:true,  warning:true,  info:false },
    pagerduty: { critical:true,  warning:false, info:false },
    email:     { critical:true,  warning:true,  info:true  },
    sms:       { critical:true,  warning:false, info:false },
  });

  const alerts = [
    { key:"circuit_breaker",     label:"Circuit breaker triggered",          default_sev:"critical" },
    { key:"bot_killed",          label:"Bot killed (manual or auto)",         default_sev:"warning"  },
    { key:"drawdown_approach",   label:"Drawdown approaching threshold",      default_sev:"warning"  },
    { key:"kyc_manual_review",   label:"KYC applicant needs manual review",   default_sev:"info"     },
    { key:"exchange_degraded",   label:"Exchange connection degraded",        default_sev:"warning"  },
    { key:"infra_cpu_high",      label:"Infrastructure CPU > 70%",            default_sev:"warning"  },
    { key:"shift_handoff",       label:"Shift handoff due",                   default_sev:"info"     },
    { key:"failed_payment",      label:"User payment failed",                 default_sev:"info"     },
  ];
  const [alertEnabled, setAlertEnabled] = useState(Object.fromEntries(alerts.map(a => [a.key, true])));
  const [dedupWindow, setDedupWindow] = useState(5);

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Notifications &amp; Alerts</div>
        <div className="page-sub">Configure where alerts go and under what conditions. Changes apply to future alerts immediately.</div>
      </div>

      {/* Channels */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Channel Configuration</div></div>
        <div className="sec-body" style={{ display:"flex", flexDirection:"column", gap:0, padding:0 }}>
          {channels.map(ch => (
            <div className="notif-channel" key={ch.key} style={{ margin:"0 18px 10px", marginTop: ch.key === channels[0].key ? 18 : 0 }}>
              <div className="nc-hdr">
                <span className="nc-icon">{ch.icon}</span>
                <span className="nc-name">{ch.name}</span>
                <Toggle checked={ch.active} onChange={() => onDirty()} />
              </div>
              {ch.active && (
                <div className="nc-body">
                  {ch.hasWebhook && (
                    <Field label="Webhook URL">
                      <input className="inp" defaultValue={ch.key === "slack" ? "https://hooks.slack.com/services/T0••••/B0••••/x••••" : "https://events.pagerduty.com/v2/enqueue/••••"} />
                    </Field>
                  )}
                  {ch.key === "email" && (
                    <Field label="Recipients (comma-separated)">
                      <input className="inp" defaultValue="ops@stella.io, alerts@stella.io" />
                    </Field>
                  )}
                  {ch.key === "sms" && (
                    <Field label="Phone Numbers (E.164 format, comma-separated)">
                      <input className="inp" placeholder="+256700000000, +254700000000" />
                    </Field>
                  )}
                  <div>
                    <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", textTransform:"uppercase", letterSpacing:".1em", marginBottom:8 }}>Route Severities</div>
                    {severities.map(s => (
                      <div className="severity-row" key={s.key}>
                        <span className="severity-lbl" style={{ color: s.col }}>{s.label}</span>
                        <Toggle checked={routing[ch.key][s.key]} onChange={v => { setRouting(p => ({ ...p, [ch.key]: { ...p[ch.key], [s.key]: v } })); onDirty(); }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div style={{ padding:"0 18px 18px" }}>
            <RangeField label="Alert Deduplication Window" value={dedupWindow} min={1} max={60} step={1} unit="min"
              hint="Suppress repeated identical alerts within this window. Prevents alert storms." onChange={v => { setDedupWindow(v); onDirty(); }} />
          </div>
        </div>
      </div>

      {/* Per-alert toggles */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Alert Types</div><div className="sec-desc">Enable or disable individual alert events</div></div>
        <div className="sec-body no-pad">
          <table className="tbl">
            <thead><tr><th>Alert Event</th><th>Default Severity</th><th>Enabled</th></tr></thead>
            <tbody>
              {alerts.map(a => (
                <tr key={a.key}>
                  <td style={{ fontFamily:"var(--mono)", fontSize:10 }}>{a.label}</td>
                  <td>
                    <span className={`tag ${a.default_sev === "critical" ? "red" : a.default_sev === "warning" ? "amber" : "blue"}`}>
                      {a.default_sev}
                    </span>
                  </td>
                  <td><Toggle checked={alertEnabled[a.key]} onChange={v => { setAlertEnabled(p => ({ ...p, [a.key]: v })); onDirty(); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SaveBar dirty onSave={() => {}} onDiscard={() => {}} />
      </div>
    </div>
  );
}

// ─── TAB: SECURITY & ACCESS ───────────────────────────────────────────────────
function SecurityTab({ onDirty }) {
  const [users, setUsers] = useState(ADMIN_USERS);
  const [ipList, setIpList] = useState(["41.210.0.0/16","196.0.0.0/8"]);
  const [ipInput, setIpInput] = useState("");
  const [s, setS] = useState({
    sessionTimeout: 480, forceTwoFA: true, ipAllowlist: true, auditRetentionYears: 7,
    minPasswordLength: 12, requireSpecialChars: true, maxLoginAttempts: 5,
  });
  const set = (k, v) => { setS(p => ({ ...p, [k]: v })); onDirty(); };

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Security &amp; Access Control</div>
        <div className="page-sub">Admin users, authentication policy, and session management.</div>
      </div>

      {/* Admin users */}
      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Admin Users <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", fontWeight:400, marginLeft:6 }}>{users.length} users</span></div>
          <button className="btn btn-green" style={{ fontSize:9 }}>+ Invite Admin</button>
        </div>
        <div className="sec-body no-pad">
          <table className="tbl">
            <thead><tr><th>User</th><th>Role</th><th>2FA</th><th>Active Sessions</th><th>Last Login</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                      <div className="user-avatar" style={{ background: u.color + "22", color: u.color }}>{u.initials}</div>
                      <div>
                        <div style={{ fontWeight:600, color:"var(--text0)", fontSize:12 }}>{u.name}</div>
                        <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select className="sel" style={{ width:"auto", padding:"3px 8px", fontSize:10 }} defaultValue={u.role}>
                      {ROLES_LIST.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    {u.twoFA
                      ? <span className="tag green"><span className="tag-dot" style={{ background:"var(--green)" }} />Enabled</span>
                      : <span className="tag amber"><span className="tag-dot" style={{ background:"var(--amber)" }} />Disabled</span>
                    }
                  </td>
                  <td className="mono" style={{ color: u.sessions > 0 ? "var(--green)" : "var(--text2)" }}>{u.sessions}</td>
                  <td className="mono" style={{ fontSize:10, color:"var(--text2)" }}>{u.lastLogin}</td>
                  <td>
                    <div style={{ display:"flex", gap:5 }}>
                      <button className="btn btn-ghost" style={{ padding:"2px 7px", fontSize:8 }}>Edit</button>
                      <button className="btn btn-red" style={{ padding:"2px 7px", fontSize:8 }}>Revoke</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auth policy */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Authentication Policy</div></div>
        <div className="sec-body">
          <div className="g2">
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <Field label="Session Timeout (minutes)" hint="Admin sessions expire after this many minutes of inactivity.">
                <input className="inp" type="number" value={s.sessionTimeout} onChange={e => set("sessionTimeout", +e.target.value)} />
              </Field>
              <Field label="Min Password Length">
                <input className="inp" type="number" value={s.minPasswordLength} onChange={e => set("minPasswordLength", +e.target.value)} />
              </Field>
              <Field label="Max Login Attempts" hint="Account locked after this many consecutive failures.">
                <input className="inp" type="number" value={s.maxLoginAttempts} onChange={e => set("maxLoginAttempts", +e.target.value)} />
              </Field>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <Field label="Audit Log Retention (years)" hint="Minimum 7 years required by most financial regulations.">
                <input className="inp" type="number" value={s.auditRetentionYears} onChange={e => set("auditRetentionYears", +e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="divider" />
          <ToggleRow label="Enforce 2FA for all admins" sub="Any admin without 2FA configured will be locked out until they set it up." checked={s.forceTwoFA} onChange={v => set("forceTwoFA", v)} />
          <ToggleRow label="Require special characters in passwords" sub="Passwords must contain at least one symbol." checked={s.requireSpecialChars} onChange={v => set("requireSpecialChars", v)} />
          <ToggleRow label="Enable IP allowlist" sub="Only IP addresses in the list below can access the admin panel." checked={s.ipAllowlist} onChange={v => set("ipAllowlist", v)} />
        </div>
      </div>

      {/* IP allowlist */}
      {s.ipAllowlist && (
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">IP Allowlist</div><div className="sec-desc">CIDR notation supported (e.g. 196.0.0.0/8)</div></div>
          <div className="sec-body">
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
              {ipList.map(ip => (
                <div className="ip-chip" key={ip}>
                  {ip}
                  <span className="ip-chip-x" onClick={() => setIpList(l => l.filter(i => i !== ip))}>✕</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input className="inp" style={{ maxWidth:220 }} placeholder="41.210.0.0/16" value={ipInput} onChange={e => setIpInput(e.target.value)} />
              <button className="btn btn-green" style={{ fontSize:9 }} onClick={() => { if (ipInput.trim()) { setIpList(l => [...l, ipInput.trim()]); setIpInput(""); onDirty(); } }}>Add IP</button>
            </div>
          </div>
          <SaveBar dirty onSave={() => {}} onDiscard={() => {}} />
        </div>
      )}
    </div>
  );
}

// ─── TAB: BOT ENGINE DEFAULTS ─────────────────────────────────────────────────
function BotEngineTab({ onDirty }) {
  const [b, setB] = useState({
    heartbeatInterval: 5, orderTimeout: 30, retryAttempts: 3, retryBackoff: 2,
    reconcileFreq: 15, defaultSlippage: 0.1, maxOrderAge: 300, positionPrecision: 4,
    enableHeartbeatAlert: true, enableStaleOrderCancel: true, enableAutoReconcile: true,
    enablePartialFillContinue: true,
  });
  const set = (k, v) => { setB(p => ({ ...p, [k]: v })); onDirty(); };

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Bot Engine Defaults</div>
        <div className="page-sub">Global defaults inherited by every new bot. Individual strategy configs override these where specified.</div>
      </div>

      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Timing &amp; Retry</div></div>
        <div className="sec-body">
          <div className="g2" style={{ gap:24 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <RangeField label="Heartbeat Interval" value={b.heartbeatInterval} min={1} max={60} step={1} unit="s"
                hint="How often each bot broadcasts a status update to the platform." onChange={v => set("heartbeatInterval", v)} />
              <RangeField label="Order Timeout" value={b.orderTimeout} min={5} max={300} step={5} unit="s"
                hint="Time to wait for an order acknowledgement before marking it as failed." onChange={v => set("orderTimeout", v)} />
              <RangeField label="Max Order Age" value={b.maxOrderAge} min={60} max={3600} step={60} unit="s"
                hint="Unfilled orders older than this are automatically cancelled." onChange={v => set("maxOrderAge", v)} />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <RangeField label="Retry Attempts" value={b.retryAttempts} min={0} max={10} step={1} unit="retries"
                hint="How many times to retry a failed order before giving up." onChange={v => set("retryAttempts", v)} />
              <RangeField label="Retry Backoff Multiplier" value={b.retryBackoff} min={1} max={5} step={0.5} unit="x"
                hint="Each retry waits (attempt × backoff) seconds longer than the last." onChange={v => set("retryBackoff", v)} />
              <RangeField label="Reconciliation Frequency" value={b.reconcileFreq} min={1} max={60} step={1} unit="min"
                hint="How often each bot reconciles its state against the exchange's actual positions." onChange={v => set("reconcileFreq", v)} />
            </div>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Order Defaults</div></div>
        <div className="sec-body">
          <div className="g2">
            <Field label="Default Slippage Tolerance (%)" hint="Bots will not execute if slippage exceeds this. Overridable per strategy.">
              <input className="inp" type="number" step="0.01" value={b.defaultSlippage} onChange={e => set("defaultSlippage", +e.target.value)} />
            </Field>
            <Field label="Position Size Precision (decimal places)" hint="Number of decimal places for position size calculations.">
              <input className="inp" type="number" value={b.positionPrecision} onChange={e => set("positionPrecision", +e.target.value)} />
            </Field>
          </div>
          <div className="divider" />
          <ToggleRow label="Alert on missed heartbeat" sub="Fire a warning alert if a running bot misses 3 consecutive heartbeats." checked={b.enableHeartbeatAlert} onChange={v => set("enableHeartbeatAlert", v)} />
          <ToggleRow label="Auto-cancel stale orders" sub="Automatically cancel orders older than 'Max Order Age'." checked={b.enableStaleOrderCancel} onChange={v => set("enableStaleOrderCancel", v)} />
          <ToggleRow label="Auto-reconcile on discrepancy" sub="If reconciliation finds a position mismatch, auto-correct without manual intervention." checked={b.enableAutoReconcile} onChange={v => set("enableAutoReconcile", v)} />
          <ToggleRow label="Continue on partial fill" sub="Bot continues to next logic cycle after a partial fill rather than waiting for full fill." checked={b.enablePartialFillContinue} onChange={v => set("enablePartialFillContinue", v)} />
        </div>
        <SaveBar dirty onSave={() => {}} onDiscard={() => {}} />
      </div>
    </div>
  );
}

// ─── TAB: COMPLIANCE ─────────────────────────────────────────────────────────
function ComplianceTab({ onDirty }) {
  const [c, setC] = useState({
    amlThreshold: 5000000, amlCurrency:"UGX", sanctionsLists:"OFAC,UN,EU",
    tradeReportThreshold: 10000000, dataRetentionYears: 7, gdprEnabled: true,
    autoSuspendOnAmlHit: true, requireReasonForOverride: true, sanctionsRefreshDays: 1,
  });
  const set = (k, v) => { setC(p => ({ ...p, [k]: v })); onDirty(); };

  const restrictions = [
    { country:"Iran (IR)", reason:"OFAC sanctions", status:"blocked" },
    { country:"North Korea (KP)", reason:"OFAC sanctions", status:"blocked" },
    { country:"Russia (RU)", reason:"EU/US sanctions — restricted products only", status:"restricted" },
    { country:"Belarus (BY)", reason:"EU sanctions", status:"restricted" },
  ];

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Compliance &amp; Regulatory</div>
        <div className="page-sub">AML thresholds, sanctions screening, data retention, and jurisdiction restrictions.</div>
      </div>

      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">AML Transaction Monitoring</div></div>
        <div className="sec-body">
          <div className="g2">
            <Field label="AML Flag Threshold" hint="Transactions above this value are flagged for compliance review.">
              <div style={{ display:"flex", gap:6 }}>
                <input className="inp" type="number" value={c.amlThreshold} onChange={e => set("amlThreshold", +e.target.value)} />
                <select className="sel" style={{ width:100 }} value={c.amlCurrency} onChange={e => set("amlCurrency", e.target.value)}>
                  <option>UGX</option><option>USD</option><option>KES</option><option>ZAR</option>
                </select>
              </div>
            </Field>
            <Field label="Regulatory Report Threshold" hint="Transactions above this value are automatically included in regulatory reports.">
              <input className="inp" type="number" value={c.tradeReportThreshold} onChange={e => set("tradeReportThreshold", +e.target.value)} />
            </Field>
            <Field label="Sanctions Lists" hint="Comma-separated. OFAC, UN, EU, HMT supported.">
              <input className="inp" value={c.sanctionsLists} onChange={e => set("sanctionsLists", e.target.value)} />
            </Field>
            <Field label="Sanctions Refresh Interval (days)" hint="How often to re-screen all users against updated lists.">
              <input className="inp" type="number" value={c.sanctionsRefreshDays} onChange={e => set("sanctionsRefreshDays", +e.target.value)} />
            </Field>
          </div>
          <div className="divider" />
          <ToggleRow label="Auto-suspend on AML watchlist hit" sub="Immediately suspend account and flag for manual review on any sanctions match." checked={c.autoSuspendOnAmlHit} onChange={v => set("autoSuspendOnAmlHit", v)} />
          <ToggleRow label="Require written reason for compliance overrides" sub="Compliance officers must provide a documented reason for all manual approvals/declines." checked={c.requireReasonForOverride} onChange={v => set("requireReasonForOverride", v)} />
          <ToggleRow label="Enable GDPR data subject request handling" sub="Allow users to submit data export and deletion requests from the user portal." checked={c.gdprEnabled} onChange={v => set("gdprEnabled", v)} />
        </div>
      </div>

      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Data Retention Policy</div></div>
        <div className="sec-body">
          <div className="g2">
            {[
              ["Trade History Retention (years)", "tradeRetention", 7],
              ["User Data Retention (years)", "userRetention", 7],
              ["Audit Log Retention (years)", "auditRetention", 7],
              ["KYC Document Retention (years)", "kycRetention", 10],
            ].map(([label, key, def]) => (
              <Field key={key} label={label} hint="Minimum 7 years required by most financial regulations.">
                <input className="inp" type="number" defaultValue={def} onChange={onDirty} />
              </Field>
            ))}
          </div>
          <div className="alert info" style={{ marginTop:14 }}>ℹ All retention periods are enforced by automated cleanup jobs. Records flagged for active investigation are exempt from automated deletion.</div>
        </div>
      </div>

      {/* Jurisdiction restrictions */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Jurisdiction Restrictions</div><button className="btn btn-ghost" style={{ fontSize:9 }}>+ Add Restriction</button></div>
        <div className="sec-body no-pad">
          <table className="tbl">
            <thead><tr><th>Country</th><th>Reason</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {restrictions.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight:600, color:"var(--text0)" }}>{r.country}</td>
                  <td style={{ color:"var(--text2)", fontSize:11 }}>{r.reason}</td>
                  <td><span className={`tag ${r.status === "blocked" ? "red" : "amber"}`}>{r.status}</span></td>
                  <td><button className="btn btn-ghost" style={{ padding:"2px 7px", fontSize:8 }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SaveBar dirty onSave={() => {}} onDiscard={() => {}} />
      </div>
    </div>
  );
}

// ─── TAB: BILLING & FEES ──────────────────────────────────────────────────────
function BillingTab({ onDirty }) {
  const [f, setF] = useState({
    perfFee: 20, calcMethod:"monthly", paymentGateway:"stripe",
    invoicePrefix:"STLA", invoiceFooter:"Stella Financial Technologies Ltd.",
    vatRate: 18, vatEnabled: true,
  });
  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); onDirty(); };

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Billing &amp; Fees</div>
        <div className="page-sub">Platform fee structure, payment gateway, and invoice configuration.</div>
      </div>

      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Platform Fee Structure</div></div>
        <div className="sec-body">
          <div className="g2" style={{ gap:24 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <RangeField label="Performance Fee" value={f.perfFee} min={0} max={50} step={0.5} unit="%"
                hint="Percentage of user profits charged by the platform. Applied to profitable months only." onChange={v => set("perfFee", v)} />
              <Field label="Fee Calculation Period">
                <select className="sel" value={f.calcMethod} onChange={e => set("calcMethod", e.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </Field>
              <Field label="High-Watermark Reset" hint="Performance fee is only charged on new highs above the high-watermark.">
                <select className="sel" defaultValue="annual">
                  <option value="never">Never (rolling)</option>
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <Field label="Payment Gateway">
                <select className="sel" value={f.paymentGateway} onChange={e => set("paymentGateway", e.target.value)}>
                  <option value="stripe">Stripe</option>
                  <option value="flutterwave">Flutterwave</option>
                  <option value="paystack">Paystack</option>
                  <option value="mtn_momo">MTN Mobile Money</option>
                </select>
              </Field>
              <Field label="VAT Rate (%)">
                <input className="inp" type="number" value={f.vatRate} onChange={e => set("vatRate", +e.target.value)} />
              </Field>
              <ToggleRow label="Apply VAT to subscriptions" sub="Adds the configured VAT rate to all subscription invoices." checked={f.vatEnabled} onChange={v => set("vatEnabled", v)} />
            </div>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Invoice Configuration</div></div>
        <div className="sec-body">
          <div className="g2">
            <Field label="Invoice Number Prefix">
              <input className="inp" value={f.invoicePrefix} onChange={e => set("invoicePrefix", e.target.value)} />
            </Field>
            <Field label="Legal Entity Name (for invoice footer)">
              <input className="inp" value={f.invoiceFooter} onChange={e => set("invoiceFooter", e.target.value)} />
            </Field>
            <Field label="Invoice Due Days" hint="Number of days until invoice is considered overdue.">
              <input className="inp" type="number" defaultValue={7} onChange={onDirty} />
            </Field>
            <Field label="Payment Failure Grace Period (days)">
              <input className="inp" type="number" defaultValue={3} onChange={onDirty} />
            </Field>
          </div>
        </div>
        <SaveBar dirty onSave={() => {}} onDiscard={() => {}} />
      </div>
    </div>
  );
}

// ─── TAB: COMMUNICATIONS ─────────────────────────────────────────────────────
function CommunicationsTab({ onDirty }) {
  const [selectedTemplate, setSelectedTemplate] = useState("kyc_approved");
  const templates = [
    { key:"kyc_approved",  name:"KYC Approved",     sub:"Sent when user verification succeeds" },
    { key:"kyc_declined",  name:"KYC Declined",     sub:"Sent when verification is rejected" },
    { key:"kyc_resubmit",  name:"KYC Re-Submit",    sub:"Sent when re-verification is required" },
    { key:"bot_stopped",   name:"Bot Stopped",      sub:"Sent when a user's bot is halted" },
    { key:"payment_failed",name:"Payment Failed",   sub:"Billing failure notification" },
    { key:"tier_upgraded", name:"Tier Upgraded",    sub:"Subscription upgrade confirmation" },
    { key:"welcome",       name:"Welcome",          sub:"Sent on account creation" },
    { key:"withdrawal",    name:"Withdrawal Processed", sub:"Funds withdrawal confirmation" },
  ];
  const [b, setB] = useState({ senderName:"Stella", senderEmail:"noreply@stella.io", supportEmail:"support@stella.io" });

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Communications &amp; Branding</div>
        <div className="page-sub">Email templates, sender configuration, and platform branding settings.</div>
      </div>

      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Email Sender</div></div>
        <div className="sec-body">
          <div className="g3">
            <Field label="Sender Name">
              <input className="inp" value={b.senderName} onChange={e => { setB(p => ({ ...p, senderName: e.target.value })); onDirty(); }} />
            </Field>
            <Field label="Sender Email">
              <input className="inp" value={b.senderEmail} onChange={e => { setB(p => ({ ...p, senderEmail: e.target.value })); onDirty(); }} />
            </Field>
            <Field label="Support Email">
              <input className="inp" value={b.supportEmail} onChange={e => { setB(p => ({ ...p, supportEmail: e.target.value })); onDirty(); }} />
            </Field>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Email Templates</div></div>
        <div className="sec-body" style={{ padding:0 }}>
          <div style={{ display:"grid", gridTemplateColumns:"220px 1fr" }}>
            {/* Template list */}
            <div style={{ borderRight:"1px solid var(--border)", padding:12, display:"flex", flexDirection:"column", gap:6 }}>
              {templates.map(t => (
                <div key={t.key} className={`tmpl-card ${selectedTemplate === t.key ? "on" : ""}`} onClick={() => setSelectedTemplate(t.key)}>
                  <div className="tmpl-name">{t.name}</div>
                  <div className="tmpl-sub">{t.sub}</div>
                </div>
              ))}
            </div>
            {/* Template editor */}
            <div style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}>
              <Field label="Subject Line">
                <input className="inp" defaultValue="Your Stella {action} confirmation" />
              </Field>
              <Field label="Template Body (Markdown + variables supported)">
                <textarea className="inp" rows={10} defaultValue={`Hi {{user.first_name}},\n\nYour account verification has been {{status}}.\n\n{{#if approved}}\nYou can now activate your trading bots and start growing your portfolio.\n{{/if}}\n\nIf you have questions, contact us at ${b.supportEmail}.\n\n— The Stella Team`} style={{ resize:"vertical", lineHeight:1.7 }} />
              </Field>
              <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>
                Available variables: {`{{user.first_name}} {{user.email}} {{status}} {{support_email}} {{date}}`}
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button className="btn btn-ghost" style={{ fontSize:9 }}>Send Test Email</button>
                <button className="btn btn-green" style={{ fontSize:9 }}>Save Template</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: INFRASTRUCTURE ─────────────────────────────────────────────────────
function InfraTab({ onDirty }) {
  const [envFilter, setEnvFilter] = useState("prod");

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Infrastructure &amp; Performance</div>
        <div className="page-sub">Connection pools, cache policy, background jobs, and feature flags.</div>
      </div>

      {/* Connection pools */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Connection Pool Sizes</div><div className="sec-desc">Requires service restart to take effect</div></div>
        <div className="sec-body">
          <div className="g2">
            {[
              ["PostgreSQL Pool Size", 20, "Connections kept open to the primary DB."],
              ["TimescaleDB Pool Size", 10, "Connections for time-series metrics DB."],
              ["Redis Max Connections", 50, "Maximum concurrent Redis connections."],
              ["RabbitMQ Channel Pool", 25, "Pre-opened AMQP channels per node."],
            ].map(([label, def, hint]) => (
              <Field key={label} label={label} hint={hint}>
                <input className="inp" type="number" defaultValue={def} onChange={onDirty} />
              </Field>
            ))}
          </div>
        </div>
      </div>

      {/* Cache TTLs */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Cache TTL Policy (seconds)</div></div>
        <div className="sec-body">
          <div className="g3">
            {[
              ["Bot state", 5], ["User profile", 300], ["KYC status", 900],
              ["Exchange prices", 1], ["Analytics aggregates", 3600], ["Subscription tier", 600],
            ].map(([label, def]) => (
              <Field key={label} label={label}>
                <input className="inp" type="number" defaultValue={def} onChange={onDirty} />
              </Field>
            ))}
          </div>
        </div>
      </div>

      {/* Background jobs */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Background Jobs</div></div>
        <div className="sec-body no-pad">
          <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr 1fr 1fr 80px", padding:"7px 14px", borderBottom:"1px solid var(--border)", background:"var(--bg2)" }}>
            {["Job","Schedule","Last Run","Next Run","Status"].map(h => (
              <div key={h} style={{ fontFamily:"var(--mono)", fontSize:9, textTransform:"uppercase", letterSpacing:".1em", color:"var(--text2)" }}>{h}</div>
            ))}
          </div>
          {JOBS_DATA.map(j => (
            <div className="job-row" key={j.name}>
              <div>
                <div className="job-name">{j.name}</div>
                <div className="job-sub">{j.desc}</div>
              </div>
              <div><span className="cron">{j.cron}</span></div>
              <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--text2)" }}>{j.lastRun}</div>
              <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--text2)" }}>{j.nextRun}</div>
              <div style={{ display:"flex", gap:5 }}>
                <span className={`tag ${j.status === "ok" ? "green" : "amber"}`}>{j.status}</span>
                <button className="btn btn-ghost" style={{ padding:"1px 6px", fontSize:8 }}>▶</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature flags */}
      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Feature Flags</div>
          <div style={{ display:"flex", gap:5 }}>
            {["prod","staging","dev"].map(e => (
              <button key={e} className={`btn ${envFilter === e ? "btn-blue" : "btn-ghost"}`} style={{ fontSize:8, padding:"3px 8px" }} onClick={() => setEnvFilter(e)}>{e}</button>
            ))}
          </div>
        </div>
        <div>
          {FEATURE_FLAGS.map(f => (
            <div className="ff-row" key={f.key}>
              <div className="ff-info">
                <div className="ff-name">{f.name}</div>
                <div className="ff-desc">{f.desc}</div>
              </div>
              <div className="ff-env" style={{ marginRight:14 }}>
                {["prod","staging","dev"].map(e => (
                  <span key={e} className="ff-env-tag" style={{
                    background: f[e] ? "var(--green-dim)" : "var(--bg3)",
                    color: f[e] ? "var(--green)" : "var(--text2)",
                    border: `1px solid ${f[e] ? "rgba(0,229,160,.2)" : "var(--border)"}`,
                    opacity: envFilter === e ? 1 : 0.4,
                  }}>{e}</span>
                ))}
              </div>
              <Toggle checked={f[envFilter]} onChange={() => onDirty()} />
            </div>
          ))}
        </div>
        <SaveBar dirty onSave={() => {}} onDiscard={() => {}} />
      </div>
    </div>
  );
}

// ─── TAB: INTEGRATIONS ────────────────────────────────────────────────────────
function IntegrationsTab({ onDirty }) {
  const integrations = [
    { name:"Xero", icon:"📊", category:"Accounting", status:"connected",   desc:"Sync platform fee invoices to Xero automatically." },
    { name:"Slack", icon:"💬", category:"Alerting",  status:"connected",   desc:"Ops alerts routed to configured Slack channels." },
    { name:"PagerDuty", icon:"🚨", category:"Incident", status:"connected", desc:"Critical incidents create PagerDuty pages automatically." },
    { name:"Mixpanel", icon:"📈", category:"Analytics", status:"connected", desc:"User events forwarded to Mixpanel for product analytics." },
    { name:"Intercom", icon:"💭", category:"Support", status:"disconnected", desc:"In-app support chat and user communication." },
    { name:"HubSpot", icon:"🏷", category:"CRM",     status:"disconnected", desc:"Sync user signups and subscription events to CRM." },
  ];

  return (
    <div className="tab-page">
      <div className="page-hdr">
        <div className="page-title">Integrations</div>
        <div className="page-sub">Third-party integrations and outbound webhook management.</div>
      </div>

      {/* Integrations grid */}
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Third-Party Integrations</div></div>
        <div className="sec-body">
          <div className="g3">
            {integrations.map(i => {
              const connected = i.status === "connected";
              return (
                <div key={i.name} style={{ background:"var(--bg2)", border:`1px solid ${connected ? "var(--border)" : "var(--border)"}`, borderRadius:4, padding:14, display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:20 }}>{i.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"var(--mono)", fontSize:11, fontWeight:600, color:"var(--text0)" }}>{i.name}</div>
                      <div style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--text2)", textTransform:"uppercase", letterSpacing:".08em" }}>{i.category}</div>
                    </div>
                    <span className={`tag ${connected ? "green" : "ghost"}`}>{i.status}</span>
                  </div>
                  <div style={{ fontFamily:"var(--sans)", fontSize:11, color:"var(--text2)", lineHeight:1.5 }}>{i.desc}</div>
                  <button className={`btn ${connected ? "btn-ghost" : "btn-green"}`} style={{ fontSize:9, justifyContent:"center" }}>
                    {connected ? "Configure" : "Connect"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Outbound webhooks */}
      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Outbound Webhooks</div>
          <button className="btn btn-green" style={{ fontSize:9 }}>+ Add Webhook</button>
        </div>
        <div>
          {WEBHOOK_DATA.map((w, i) => (
            <div className="wh-row" key={i}>
              <div>
                <div className="wh-url">{w.url}</div>
                <div className="wh-events">
                  {w.events.map(e => <span className="tag ghost" key={e} style={{ fontSize:8 }}>{e}</span>)}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
                <span className={`tag ${w.active ? "green" : "ghost"}`}>{w.active ? "active" : "inactive"}</span>
                <div style={{ display:"flex", gap:5 }}>
                  <button className="btn btn-ghost" style={{ padding:"2px 7px", fontSize:8 }}>Test</button>
                  <button className="btn btn-ghost" style={{ padding:"2px 7px", fontSize:8 }}>Edit</button>
                  <button className="btn btn-red" style={{ padding:"2px 7px", fontSize:8 }}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:"10px 14px", borderTop:"1px solid var(--border)", fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>All webhooks are signed with HMAC-SHA256. Verify the X-Stella-Signature header on your endpoint.</span>
          <button className="btn btn-ghost" style={{ fontSize:8 }}>Rotate Signing Key</button>
        </div>
      </div>
    </div>
  );
}

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const NAV = [
  { group:"Operations",   items:[
    { key:"risk",          icon:"⚡", label:"Risk Controls",       critical:true },
    { key:"exchanges",     icon:"⇄",  label:"Exchange Management" },
    { key:"bot_engine",    icon:"🤖", label:"Bot Engine Defaults" },
  ]},
  { group:"Platform",     items:[
    { key:"subscriptions", icon:"🎚", label:"Users & Subscriptions" },
    { key:"notifications", icon:"🔔", label:"Notifications & Alerts" },
    { key:"billing",       icon:"💳", label:"Billing & Fees" },
  ]},
  { group:"Compliance",   items:[
    { key:"compliance",    icon:"⚖", label:"Compliance" },
  ]},
  { group:"Admin",        items:[
    { key:"security",      icon:"🔐", label:"Security & Access" },
    { key:"communications",icon:"📧", label:"Communications" },
    { key:"infra",         icon:"🖥", label:"Infrastructure" },
    { key:"integrations",  icon:"🔗", label:"Integrations" },
  ]},
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("risk");
  const [dirty, setDirty] = useState(false);
  const onDirty = () => setDirty(true);

  const TAB_COMPONENTS = {
    risk:          <RiskTab onDirty={onDirty} />,
    exchanges:     <ExchangesTab onDirty={onDirty} />,
    subscriptions: <SubscriptionsTab onDirty={onDirty} />,
    notifications: <NotificationsTab onDirty={onDirty} />,
    security:      <SecurityTab onDirty={onDirty} />,
    bot_engine:    <BotEngineTab onDirty={onDirty} />,
    compliance:    <ComplianceTab onDirty={onDirty} />,
    billing:       <BillingTab onDirty={onDirty} />,
    communications:<CommunicationsTab onDirty={onDirty} />,
    infra:         <InfraTab onDirty={onDirty} />,
    integrations:  <IntegrationsTab onDirty={onDirty} />,
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">

        {/* TOPBAR */}
        <div className="topbar">
          <div className="logo"><div className="pulse" />STELLA SETTINGS</div>
          <div className="tb-sep" />
          <div style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--text1)" }}>Platform Configuration</div>
          {dirty && (
            <div className="unsaved-banner">
              ⚑ Unsaved changes
              <button className="btn btn-amber" style={{ padding:"2px 9px", fontSize:8 }} onClick={() => setDirty(false)}>Save All</button>
              <button className="btn btn-ghost" style={{ padding:"2px 9px", fontSize:8, marginLeft:2 }} onClick={() => setDirty(false)}>Discard</button>
            </div>
          )}
          <div style={{ marginLeft:"auto", fontFamily:"var(--mono)", fontSize:9, color:"var(--text2)" }}>{new Date().toLocaleTimeString()}</div>
        </div>

        <div className="layout">
          {/* SIDEBAR */}
          <nav className="sidenav">
            {NAV.map(group => (
              <div key={group.group}>
                <div className="nav-group-lbl">{group.group}</div>
                {group.items.map(item => (
                  <div key={item.key} className={`nav-item ${activeTab === item.key ? "on" : ""}`}
                    onClick={() => { setActiveTab(item.key); setDirty(false); }}>
                    <span className="nav-item-icon">{item.icon}</span>
                    <span className="nav-item-lbl">{item.label}</span>
                    {item.critical && activeTab !== item.key && (
                      <span className="nav-badge">!</span>
                    )}
                  </div>
                ))}
                <div className="nav-divider" />
              </div>
            ))}
          </nav>

          {/* CONTENT */}
          <main className="content">
            {TAB_COMPONENTS[activeTab]}
          </main>
        </div>
      </div>
    </>
  );
}
