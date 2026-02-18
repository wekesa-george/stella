"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── SIMULATED DATA ─────────────────────────────────────────────────────────

const STRATEGIES = ["Momentum Grid", "Arbitrage V2", "Mean Reversion", "Trend Follow", "Scalp Pro"];
const PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT"];
const EXCHANGES = ["Binance", "Bybit", "OKX", "Kraken"];
const USERS = ["alice.k@trader.io", "bob.m@trader.io", "carol.x@hedge.co", "dan.r@fund.io", "eve.s@quant.ai"];

function randBetween(a: number, b: number) { return a + Math.random() * (b - a); }
function randInt(a: number, b: number) { return Math.floor(randBetween(a, b)); }
function pick<T>(arr: T[]): T { return arr[randInt(0, arr.length)]; }

function generateBots(count = 18) {
  return Array.from({ length: count }, (_, i) => ({
    id: `BOT-${String(i + 1).padStart(4, "0")}`,
    name: `${pick(STRATEGIES)}-${randInt(100, 999)}`,
    user: pick(USERS),
    strategy: pick(STRATEGIES),
    exchange: pick(EXCHANGES),
    pair: pick(PAIRS),
    status: pick(["running", "running", "running", "running", "paused", "error"]),
    pnl: parseFloat((randBetween(-800, 3200)).toFixed(2)),
    pnlPct: parseFloat((randBetween(-4.5, 12.8)).toFixed(2)),
    equity: parseFloat((randBetween(5000, 85000)).toFixed(2)),
    openPositions: randInt(0, 8),
    trades: randInt(12, 340),
    winRate: parseFloat((randBetween(42, 78)).toFixed(1)),
    lastHeartbeat: randInt(1, 45),
    cpu: parseFloat((randBetween(5, 88)).toFixed(1)),
    ram: parseFloat((randBetween(20, 85)).toFixed(1)),
    uptime: `${randInt(1, 72)}h ${randInt(0, 59)}m`,
  }));
}

function generateEquityCurve(points = 60, base = 10000, volatility = 0.012) {
  let v = base;
  return Array.from({ length: points }, (_, i) => {
    v = v * (1 + (Math.random() - 0.46) * volatility);
    return { t: i, value: parseFloat(v.toFixed(2)) };
  });
}

function generateInfraMetrics() {
  return {
    phoenix:   { cpu: parseFloat((randBetween(18, 65)).toFixed(1)), ram: parseFloat((randBetween(30, 72)).toFixed(1)), disk: 24.1 },
    postgres:  { cpu: parseFloat((randBetween(10, 55)).toFixed(1)), ram: parseFloat((randBetween(45, 82)).toFixed(1)), disk: 38.7 },
    rabbitmq:  { cpu: parseFloat((randBetween(5, 40)).toFixed(1)),  ram: parseFloat((randBetween(20, 55)).toFixed(1)), disk: 12.2 },
    redis:     { cpu: parseFloat((randBetween(3, 35)).toFixed(1)),  ram: parseFloat((randBetween(25, 60)).toFixed(1)), disk: 8.4 },
    botWorker: { cpu: parseFloat((randBetween(30, 91)).toFixed(1)), ram: parseFloat((randBetween(50, 89)).toFixed(1)), disk: 18.6 },
  };
}

function generateInfraHistory(points = 40) {
  let cpu = 45, ram = 55;
  return Array.from({ length: points }, (_, i) => {
    cpu = Math.min(100, Math.max(5, cpu + (Math.random() - 0.5) * 8));
    ram = Math.min(100, Math.max(20, ram + (Math.random() - 0.5) * 4));
    return { t: i, cpu: parseFloat(cpu.toFixed(1)), ram: parseFloat(ram.toFixed(1)) };
  });
}

function generateAlerts() {
  const types = [
    { msg: "Bot BOT-0012 CPU > 85%", sev: "critical", service: "botWorker" },
    { msg: "BOT-0007 heartbeat missed", sev: "critical", service: "BOT-0007" },
    { msg: "Postgres RAM at 79%", sev: "warning", service: "postgres" },
    { msg: "BotWorker RAM at 72%", sev: "warning", service: "botWorker" },
    { msg: "BOT-0003 drawdown > 8%", sev: "warning", service: "BOT-0003" },
    { msg: "RabbitMQ queue depth 4.2k", sev: "info", service: "rabbitmq" },
    { msg: "BOT-0015 win rate drop to 41%", sev: "info", service: "BOT-0015" },
  ];
  return types.map((a, i) => ({ ...a, id: i, time: `${randInt(1, 58)}m ago`, acked: false }));
}

// ─── THEME ───────────────────────────────────────────────────────────────────

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=DM+Sans:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg0: #080c10;
    --bg1: #0d1117;
    --bg2: #131920;
    --bg3: #1a2230;
    --border: #1e2d40;
    --border2: #253550;
    --text0: #e8edf3;
    --text1: #8fa3b8;
    --text2: #5a7090;
    --green: #00e5a0;
    --green-dim: rgba(0,229,160,0.12);
    --amber: #f5a623;
    --amber-dim: rgba(245,166,35,0.12);
    --red: #ff4757;
    --red-dim: rgba(255,71,87,0.12);
    --blue: #3d9df3;
    --blue-dim: rgba(61,157,243,0.12);
    --purple: #a78bfa;
    --mono: 'IBM Plex Mono', monospace;
    --sans: 'DM Sans', sans-serif;
  }

  body { background: var(--bg0); color: var(--text0); font-family: var(--sans); overflow: hidden; }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg1); }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

  .app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

  /* TOP BAR */
  .topbar {
    display: flex; align-items: center; padding: 0 20px; height: 52px;
    background: var(--bg1); border-bottom: 1px solid var(--border);
    flex-shrink: 0; gap: 0; position: relative; z-index: 100;
  }
  .topbar-logo {
    font-family: var(--mono); font-size: 15px; font-weight: 600;
    color: var(--green); letter-spacing: 0.08em; margin-right: 32px;
    display: flex; align-items: center; gap: 8px;
  }
  .logo-dot { width: 8px; height: 8px; background: var(--green); border-radius: 50%; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }

  .pulse-ring {
    width: 8px; height: 8px; border-radius: 50%; animation: ringpulse 2s infinite;
  }
  @keyframes ringpulse { 0%{box-shadow:0 0 0 0 rgba(0,229,160,0.6)} 70%{box-shadow:0 0 0 6px rgba(0,229,160,0)} 100%{box-shadow:0 0 0 0 rgba(0,229,160,0)} }

  .topbar-metrics { display: flex; gap: 24px; flex: 1; }
  .tb-metric { display: flex; flex-direction: column; }
  .tb-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text2); margin-bottom: 1px; }
  .tb-value { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--text0); }
  .tb-value.green { color: var(--green); }
  .tb-value.amber { color: var(--amber); }
  .tb-value.red { color: var(--red); }

  .topbar-right { display: flex; align-items: center; gap: 16px; }
  .alert-bell {
    position: relative; cursor: pointer; padding: 6px;
    color: var(--text1); transition: color 0.2s;
  }
  .alert-bell:hover { color: var(--amber); }
  .alert-count {
    position: absolute; top: 2px; right: 2px; width: 16px; height: 16px;
    background: var(--red); border-radius: 50%; font-size: 9px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; color: white;
  }

  /* NAV */
  .nav {
    display: flex; gap: 0; background: var(--bg1); border-bottom: 1px solid var(--border);
    flex-shrink: 0; padding: 0 20px;
  }
  .nav-tab {
    padding: 10px 18px; font-size: 12px; font-weight: 500; cursor: pointer;
    color: var(--text2); border-bottom: 2px solid transparent; transition: all 0.15s;
    letter-spacing: 0.03em; text-transform: uppercase;
    background: none; border-top: none; border-left: none; border-right: none;
  }
  .nav-tab:hover { color: var(--text0); }
  .nav-tab.active { color: var(--green); border-bottom-color: var(--green); }

  /* MAIN LAYOUT */
  .main { display: flex; flex: 1; overflow: hidden; }
  .content { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }
  .sidebar { width: 280px; border-left: 1px solid var(--border); overflow-y: auto; flex-shrink: 0; background: var(--bg1); }

  /* CARDS */
  .card {
    background: var(--bg1); border: 1px solid var(--border); border-radius: 6px;
    overflow: hidden;
  }
  .card-header {
    padding: 10px 14px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .card-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text1); }
  .card-body { padding: 14px; }

  /* STAT GRID */
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .stat-card {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;
    padding: 12px 14px; display: flex; flex-direction: column; gap: 4px;
  }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text2); }
  .stat-value { font-family: var(--mono); font-size: 22px; font-weight: 600; color: var(--text0); line-height: 1.2; }
  .stat-value.big { font-size: 26px; }
  .stat-sub { font-size: 11px; color: var(--text2); font-family: var(--mono); }
  .stat-sub.green { color: var(--green); }
  .stat-sub.red { color: var(--red); }
  .stat-sub.amber { color: var(--amber); }

  /* INFRA GAUGES */
  .infra-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
  .infra-card {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;
    padding: 12px; display: flex; flex-direction: column; gap: 8px;
  }
  .infra-name { font-size: 11px; font-weight: 600; color: var(--text1); text-transform: uppercase; letter-spacing: 0.06em; }
  .infra-metric { display: flex; flex-direction: column; gap: 4px; }
  .infra-metric-label { font-size: 9px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.1em; display: flex; justify-content: space-between; }
  .gauge-bar { height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden; }
  .gauge-fill {
    height: 100%; border-radius: 2px; transition: width 0.8s ease, background 0.3s;
  }
  .infra-card.warning { border-color: var(--amber); }
  .infra-card.critical { border-color: var(--red); box-shadow: 0 0 12px rgba(255,71,87,0.15); }

  /* BOT GRID */
  .bot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .bot-card {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;
    padding: 12px; display: flex; flex-direction: column; gap: 8px;
    cursor: pointer; transition: border-color 0.2s, transform 0.1s;
    position: relative; overflow: hidden;
  }
  .bot-card:hover { border-color: var(--border2); }
  .bot-card.selected { border-color: var(--green); }
  .bot-card.error { border-color: var(--red); }
  .bot-card.paused { border-color: var(--amber); }
  .bot-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  }
  .bot-card.running::before { background: var(--green); }
  .bot-card.error::before { background: var(--red); }
  .bot-card.paused::before { background: var(--amber); }

  .bot-header { display: flex; align-items: center; justify-content: space-between; }
  .bot-id { font-family: var(--mono); font-size: 11px; color: var(--text2); }
  .status-badge {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
    padding: 2px 7px; border-radius: 3px;
  }
  .status-badge.running { background: var(--green-dim); color: var(--green); }
  .status-badge.paused { background: var(--amber-dim); color: var(--amber); }
  .status-badge.error { background: var(--red-dim); color: var(--red); }
  .bot-name { font-size: 12px; font-weight: 600; color: var(--text0); }
  .bot-meta { font-size: 10px; color: var(--text2); }
  .bot-pnl { font-family: var(--mono); font-size: 18px; font-weight: 600; }
  .bot-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; }
  .bot-stat { font-size: 9px; text-align: center; }
  .bot-stat-val { font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--text0); }
  .bot-stat-lbl { color: var(--text2); }

  .bot-actions { display: flex; gap: 6px; }
  .btn {
    padding: 5px 10px; border-radius: 3px; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer;
    border: none; transition: all 0.15s; font-family: var(--sans);
  }
  .btn-kill { background: var(--red-dim); color: var(--red); border: 1px solid rgba(255,71,87,0.3); }
  .btn-kill:hover { background: var(--red); color: white; }
  .btn-pause { background: var(--amber-dim); color: var(--amber); border: 1px solid rgba(245,166,35,0.3); }
  .btn-pause:hover { background: var(--amber); color: #000; }
  .btn-detail { background: var(--bg3); color: var(--text1); border: 1px solid var(--border); flex: 1; }
  .btn-detail:hover { border-color: var(--border2); color: var(--text0); }
  .btn-primary { background: var(--green); color: #000; font-weight: 700; }
  .btn-primary:hover { background: #00ffb2; }
  .btn-ghost { background: transparent; color: var(--text1); border: 1px solid var(--border); }
  .btn-ghost:hover { border-color: var(--border2); color: var(--text0); }

  /* PLATFORM KILL SWITCH */
  .kill-row { display: flex; gap: 10px; align-items: center; }
  .kill-platform {
    padding: 8px 20px; border-radius: 4px; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer;
    background: var(--red); color: white; border: none;
    box-shadow: 0 0 20px rgba(255,71,87,0.4); transition: all 0.15s;
    font-family: var(--sans);
  }
  .kill-platform:hover { background: #ff2233; box-shadow: 0 0 30px rgba(255,71,87,0.6); transform: scale(1.02); }

  /* ALERT SIDEBAR */
  .alert-header { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  .alert-item {
    padding: 10px 14px; border-bottom: 1px solid var(--border);
    display: flex; gap: 10px; align-items: flex-start; transition: background 0.15s;
  }
  .alert-item:hover { background: var(--bg2); }
  .alert-item.acked { opacity: 0.4; }
  .alert-sev { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .alert-sev.critical { background: var(--red); box-shadow: 0 0 6px var(--red); }
  .alert-sev.warning { background: var(--amber); }
  .alert-sev.info { background: var(--blue); }
  .alert-msg { font-size: 11px; color: var(--text0); line-height: 1.4; }
  .alert-time { font-size: 9px; color: var(--text2); margin-top: 2px; font-family: var(--mono); }
  .ack-btn { font-size: 9px; color: var(--text2); cursor: pointer; padding: 2px 6px; border: 1px solid var(--border); border-radius: 2px; background: none; margin-left: auto; flex-shrink: 0; font-family: var(--sans); }
  .ack-btn:hover { color: var(--green); border-color: var(--green); }

  /* SECTION HEADER */
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text1); }

  /* MODAL */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .modal {
    background: var(--bg1); border: 1px solid var(--border); border-radius: 8px;
    padding: 24px; width: 400px; display: flex; flex-direction: column; gap: 16px;
  }
  .modal-title { font-size: 14px; font-weight: 700; color: var(--text0); }
  .modal-desc { font-size: 12px; color: var(--text1); line-height: 1.6; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
  .modal textarea {
    width: 100%; background: var(--bg2); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text0); font-family: var(--sans); font-size: 12px; padding: 10px; resize: none;
    outline: none;
  }
  .modal textarea:focus { border-color: var(--border2); }

  /* RESPONSIVE */
  @media (max-width: 768px) {
    .infra-grid { grid-template-columns: repeat(2, 1fr); }
    .bot-grid { grid-template-columns: 1fr; }
    .sidebar { display: none; }
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
    .topbar-metrics { gap: 12px; }
  }
`;

// ─── GAUGE HELPERS ────────────────────────────────────────────────────────────

function gaugeColor(val: number, warn = 60, crit = 85) {
  if (val >= crit) return "var(--red)";
  if (val >= warn) return "var(--amber)";
  return "var(--green)";
}
function infraStatus(metrics: any, warn = 60, crit = 85) {
  const max = Math.max(metrics.cpu, metrics.ram);
  if (max >= crit) return "critical";
  if (max >= warn) return "warning";
  return "normal";
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#00e5a0", height = 32 }: any) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function InfraCard({ name, metrics, warn = 60, crit = 85 }: any) {
  const status = infraStatus(metrics, warn, crit);
  return (
    <div className={`infra-card ${status}`}>
      <div className="infra-name">{name}</div>
      {[["CPU", metrics.cpu], ["RAM", metrics.ram], ["Disk", metrics.disk]].map(([label, val]: any) => (
        <div className="infra-metric" key={label}>
          <div className="infra-metric-label">
            <span>{label}</span>
            <span style={{ fontFamily: "var(--mono)", color: gaugeColor(val, warn, crit) }}>{val}%</span>
          </div>
          <div className="gauge-bar">
            <div className="gauge-fill" style={{ width: `${val}%`, background: gaugeColor(val, warn, crit) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BotCard({ bot, onSelect, onKill, selected }: any) {
  const pnlColor = bot.pnl >= 0 ? "var(--green)" : "var(--red)";
  const spark = generateEquityCurve(20, bot.equity, 0.008);
  return (
    <div className={`bot-card ${bot.status} ${selected ? "selected" : ""}`} onClick={() => onSelect(bot)}>
      <div className="bot-header">
        <span className="bot-id">{bot.id}</span>
        <span className={`status-badge ${bot.status}`}>{bot.status}</span>
      </div>
      <div>
        <div className="bot-name">{bot.name}</div>
        <div className="bot-meta">{bot.exchange} · {bot.pair} · {bot.user.split("@")[0]}</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div className="bot-pnl" style={{ color: pnlColor }}>{bot.pnl >= 0 ? "+" : ""}${bot.pnl.toLocaleString()}</div>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: pnlColor }}>{bot.pnlPct >= 0 ? "+" : ""}{bot.pnlPct}%</div>
        </div>
        <div style={{ width: 80 }}>
          <Sparkline data={spark} color={pnlColor} height={28} />
        </div>
      </div>
      <div className="bot-stats">
        <div className="bot-stat"><div className="bot-stat-val">{bot.openPositions}</div><div className="bot-stat-lbl">Positions</div></div>
        <div className="bot-stat"><div className="bot-stat-val">{bot.winRate}%</div><div className="bot-stat-lbl">Win Rate</div></div>
        <div className="bot-stat"><div className="bot-stat-val">{bot.trades}</div><div className="bot-stat-lbl">Trades</div></div>
      </div>
      <div className="bot-actions" onClick={e => e.stopPropagation()}>
        <button className="btn btn-kill" onClick={() => onKill(bot, "single")}>Kill</button>
        <button className="btn btn-pause">{bot.status === "paused" ? "Resume" : "Pause"}</button>
        <button className="btn btn-detail" onClick={() => onSelect(bot)}>Inspect →</button>
      </div>
    </div>
  );
}

function AlertSidebar({ alerts, onAck }: any) {
  const unacked = alerts.filter((a: any) => !a.acked);
  return (
    <div className="sidebar">
      <div className="alert-header">
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text1)" }}>
          Alerts
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--red)" }}>{unacked.length} active</span>
      </div>
      {alerts.map((alert: any) => (
        <div className={`alert-item ${alert.acked ? "acked" : ""}`} key={alert.id}>
          <div className={`alert-sev ${alert.sev}`} />
          <div style={{ flex: 1 }}>
            <div className="alert-msg">{alert.msg}</div>
            <div className="alert-time">{alert.time}</div>
          </div>
          {!alert.acked && (
            <button className="ack-btn" onClick={() => onAck(alert.id)}>ACK</button>
          )}
        </div>
      ))}
    </div>
  );
}

function KillModal({ target, onConfirm, onCancel }: any) {
  const [reason, setReason] = useState("");
  const labels: any = {
    single: `Kill Bot ${target?.id}`,
    user: `Kill all bots for ${target?.user}`,
    platform: "KILL ENTIRE PLATFORM",
  };
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title" style={{ color: "var(--red)" }}>⚠ {labels[target?.scope]}</div>
        <div className="modal-desc">
          {target?.scope === "platform"
            ? "This will immediately stop ALL trading bots across the entire platform. All open positions will be left open. This action is logged and requires a reason."
            : target?.scope === "user"
            ? `This will stop all ${target.botCount} bots for ${target.user}. Open positions will remain. Requires reason.`
            : `This will stop Bot ${target?.id} (${target?.name}). Open positions will remain.`}
        </div>
        {target?.openPositions > 0 && (
          <div style={{ background: "var(--amber-dim)", border: "1px solid var(--amber)", borderRadius: 4, padding: "8px 12px", fontSize: 11, color: "var(--amber)" }}>
            ⚠ {target.openPositions} open position{target.openPositions !== 1 ? "s" : ""} will be left unmanaged.
          </div>
        )}
        <textarea rows={3} placeholder="Reason for kill (required)..." value={reason} onChange={e => setReason(e.target.value)} />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-kill" style={{ padding: "7px 16px", fontSize: 11 }} disabled={!reason.trim()} onClick={() => reason.trim() && onConfirm(reason)}>
            Confirm Kill
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VIEWS ───────────────────────────────────────────────────────────────────

function MissionControlView({ bots, infraMetrics, alerts, onAck, onKill, onSelectBot }: any) {
  const totalEquity = bots.reduce((s: number, b: any) => s + b.equity, 0);
  const totalPnl = bots.reduce((s: number, b: any) => s + b.pnl, 0);
  const running = bots.filter((b: any) => b.status === "running").length;
  const errors = bots.filter((b: any) => b.status === "error").length;
  const totalPositions = bots.reduce((s: number, b: any) => s + b.openPositions, 0);
  const infraHistory = generateInfraHistory(40);

  return (
    <div className="main">
      <div className="content">
        {/* Stat overview */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Platform Equity</div>
            <div className="stat-value big">${(totalEquity / 1000).toFixed(1)}k</div>
            <div className={`stat-sub ${totalPnl >= 0 ? "green" : "red"}`}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)} today</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Bots</div>
            <div className="stat-value" style={{ color: "var(--green)" }}>{running}</div>
            <div className="stat-sub">{errors > 0 ? <span style={{ color: "var(--red)" }}>{errors} errors</span> : "all healthy"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open Positions</div>
            <div className="stat-value">{totalPositions}</div>
            <div className="stat-sub">{bots.length} bots total</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Unrealized P&L</div>
            <div className="stat-value" style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>
              {totalPnl >= 0 ? "+" : ""}${(totalPnl * 0.6).toFixed(0)}
            </div>
            <div className="stat-sub amber">{alerts.filter((a: any) => !a.acked && a.sev === "critical").length} critical alerts</div>
          </div>
        </div>

        {/* Infrastructure strip */}
        <div>
          <div className="section-header">
            <span className="section-title">Infrastructure Health</span>
            <span style={{ fontSize: 10, color: "var(--text2)", fontFamily: "var(--mono)" }}>Updated 12s ago</span>
          </div>
          <div className="infra-grid">
            {Object.entries(infraMetrics).map(([key, m]: any) => (
              <InfraCard key={key} name={key === "botWorker" ? "Bot Workers" : key.charAt(0).toUpperCase() + key.slice(1)} metrics={m} />
            ))}
          </div>
        </div>

        {/* Infra chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Bot Worker Resources (1h)</span>
          </div>
          <div className="card-body" style={{ padding: "10px 14px" }}>
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={infraHistory} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff4757" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ff4757" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f5a623" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f5a623" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <YAxis domain={[0, 100]} hide />
                <XAxis dataKey="t" hide />
                <ReferenceLine y={70} stroke="rgba(255,71,87,0.4)" strokeDasharray="3 3" />
                <ReferenceLine y={60} stroke="rgba(245,166,35,0.4)" strokeDasharray="3 3" />
                <Tooltip contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 10 }} formatter={(v: any) => [`${v}%`]} />
                <Area type="monotone" dataKey="cpu" stroke="var(--red)" strokeWidth={1.5} fill="url(#cpuGrad)" />
                <Area type="monotone" dataKey="ram" stroke="var(--amber)" strokeWidth={1.5} fill="url(#ramGrad)" />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <div style={{ fontSize: 10, color: "var(--red)", display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 10, height: 2, background: "var(--red)" }} /> CPU
              </div>
              <div style={{ fontSize: 10, color: "var(--amber)", display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 10, height: 2, background: "var(--amber)" }} /> RAM
              </div>
              <div style={{ fontSize: 9, color: "var(--text2)", marginLeft: "auto" }}>
                Dashed lines: 60% warn / 70% critical
              </div>
            </div>
          </div>
        </div>

        {/* Kill switches row */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Emergency Controls</span>
          </div>
          <div className="card-body">
            <div className="kill-row">
              <button className="kill-platform" onClick={() => onKill({ scope: "platform", openPositions: totalPositions })}>
                ⬛ Kill Platform
              </button>
              <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.5 }}>
                Stops ALL {bots.length} bots across {new Set(bots.map((b: any) => b.user)).size} users · {totalPositions} open positions will be unmanaged
              </div>
            </div>
          </div>
        </div>
      </div>
      <AlertSidebar alerts={alerts} onAck={onAck} />
    </div>
  );
}

function BotFleetView({ bots, onKill, onSelect, selectedBot }: any) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = bots.filter((b: any) => {
    if (filter !== "all" && b.status !== filter) return false;
    if (search && !b.id.toLowerCase().includes(search.toLowerCase()) &&
        !b.name.toLowerCase().includes(search.toLowerCase()) &&
        !b.user.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const users = [...new Set(bots.map((b: any) => b.user))];

  return (
    <div className="main">
      <div className="content">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Search bot ID, name, user..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px", color: "var(--text0)", fontSize: 12, outline: "none", fontFamily: "var(--sans)" }}
          />
          {["all", "running", "paused", "error"].map(f => (
            <button key={f} className="btn btn-ghost" onClick={() => setFilter(f)}
              style={{ borderColor: filter === f ? "var(--green)" : undefined, color: filter === f ? "var(--green)" : undefined }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <span style={{ fontSize: 11, color: "var(--text2)", marginLeft: "auto" }}>{filtered.length} / {bots.length} bots</span>
        </div>

        {/* Kill by user */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Kill by User</span>
            <span style={{ fontSize: 10, color: "var(--text2)" }}>Stops all bots for a specific user</span>
          </div>
          <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {users.map(user => {
              const userBots = bots.filter((b: any) => b.user === user);
              const activeBots = userBots.filter((b: any) => b.status === "running").length;
              return (
                <div key={user} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text0)" }}>{user.split("@")[0]}</div>
                    <div style={{ fontSize: 9, color: "var(--text2)", fontFamily: "var(--mono)" }}>{activeBots} active</div>
                  </div>
                  <button className="btn btn-kill" style={{ fontSize: 9, padding: "3px 8px" }}
                    onClick={() => onKill({ scope: "user", user, botCount: activeBots, openPositions: userBots.reduce((s: number, b: any) => s + b.openPositions, 0) })}>
                    Kill User
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bot-grid">
          {filtered.map((bot: any) => (
            <BotCard key={bot.id} bot={bot} selected={selectedBot?.id === bot.id}
              onSelect={onSelect} onKill={(b: any) => onKill({ ...b, scope: "single" })} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("overview");
  const [bots, setBots] = useState<any[]>([]);
  const [infraMetrics, setInfraMetrics] = useState<any>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [killTarget, setKillTarget] = useState<any>(null);
  const [selectedBot, setSelectedBot] = useState<any>(null);
  const [tick, setTick] = useState(0);
  const [showAlerts, setShowAlerts] = useState(false);

  // Initialize data only on client side
  useEffect(() => {
    setBots(generateBots(18));
    setInfraMetrics(generateInfraMetrics());
    setAlerts(generateAlerts());
  }, []);

  // Simulate real-time infra metric updates
  useEffect(() => {
    const interval = setInterval(() => {
      setInfraMetrics(generateInfraMetrics());
      setTick(t => t + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const totalEquity = bots.reduce((s, b) => s + b.equity, 0);
  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const running = bots.filter(b => b.status === "running").length;
  const unackedAlerts = alerts.filter(a => !a.acked).length;

  function handleAck(id: number) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acked: true } : a));
  }

  function handleKill(target: any) { setKillTarget(target); }

  function handleKillConfirm(reason: string) {
    console.log("KILL", killTarget, reason);
    setKillTarget(null);
  }

  function handleSelectBot(bot: any) {
    setSelectedBot(bot);
    setTab("fleet");
  }

  const tabs = [
    { key: "overview", label: "Mission Control" },
    { key: "fleet", label: "Bot Fleet" },
    { key: "infra", label: "Infrastructure" },
    { key: "shifts", label: "Shift Handoff" },
  ];

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        {/* Top bar */}
        <div className="topbar">
          <div className="topbar-logo">
            <div className="logo-dot pulse-ring" style={{ background: "var(--green)" }} />
            STELLA ADMIN
          </div>
          <div className="topbar-metrics">
            <div className="tb-metric">
              <div className="tb-label">Platform Equity</div>
              <div className="tb-value">${(totalEquity / 1000).toFixed(1)}k</div>
            </div>
            <div className="tb-metric">
              <div className="tb-label">P&L Today</div>
              <div className={`tb-value ${totalPnl >= 0 ? "green" : "red"}`}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)}</div>
            </div>
            <div className="tb-metric">
              <div className="tb-label">Active Bots</div>
              <div className="tb-value green">{running}</div>
            </div>
            <div className="tb-metric">
              <div className="tb-label">Infra</div>
              <div className={`tb-value ${Object.values(infraMetrics).some(m => m.cpu > 85 || m.ram > 85) ? "red" : Object.values(infraMetrics).some(m => m.cpu > 60 || m.ram > 60) ? "amber" : "green"}`}>
                {Object.values(infraMetrics).some(m => m.cpu > 85 || m.ram > 85) ? "CRITICAL" : Object.values(infraMetrics).some(m => m.cpu > 60 || m.ram > 60) ? "WARNING" : "HEALTHY"}
              </div>
            </div>
            <div className="tb-metric">
              <div className="tb-label">Shift</div>
              <div className="tb-value">bob.m · 3h 42m</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="alert-bell" onClick={() => setShowAlerts(!showAlerts)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {unackedAlerts > 0 && <div className="alert-count">{unackedAlerts}</div>}
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="nav">
          {tabs.map(t => (
            <button key={t.key} className={`nav-tab ${tab === t.key ? "active" : ""}`} onClick={() => { setTab(t.key); setSelectedBot(null); }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Views */}
        {tab === "overview" && <MissionControlView bots={bots} infraMetrics={infraMetrics} alerts={alerts} onAck={handleAck} onKill={handleKill} onSelectBot={handleSelectBot} />}
        {tab === "fleet" && !selectedBot && <BotFleetView bots={bots} onKill={handleKill} onSelect={handleSelectBot} selectedBot={selectedBot} />}

        {/* Kill Modal */}
        {killTarget && <KillModal target={killTarget} onConfirm={handleKillConfirm} onCancel={() => setKillTarget(null)} />}
      </div>
    </>
  );
}
