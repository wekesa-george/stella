import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid
} from "recharts";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const equityHistory = [
  { t: "Feb 10", v: 9800 }, { t: "Feb 11", v: 9950 }, { t: "Feb 12", v: 9720 },
  { t: "Feb 13", v: 10100 }, { t: "Feb 14", v: 10340 }, { t: "Feb 15", v: 10210 },
  { t: "Feb 16", v: 10580 }, { t: "Feb 17", v: 10420 }, { t: "Feb 18", v: 10890 },
  { t: "Feb 19", v: 11240 },
];

const miniSparkData = {
  bot1: [42, 45, 43, 48, 51, 49, 54, 58, 55, 61, 63],
  bot2: [80, 78, 82, 79, 75, 71, 68, 70, 66, 63, 60],
  bot3: [30, 32, 31, 35, 38, 40, 39, 43, 45, 48, 52],
};

const BOTS = [
  {
    id: "bot-1", name: "Momentum Alpha",
    strategy: "Core Momentum", exchange: "Binance",
    pair: "BTC/USDT", status: "running",
    pnl: +312.40, pnlPct: +3.12,
    capital: 5000, openPositions: 2,
    lastTrade: "4m ago", heartbeat: "12s ago",
    sparkKey: "bot1",
  },
  {
    id: "bot-2", name: "Mean Rev Grid",
    strategy: "Core Mean Reversion", exchange: "Binance",
    pair: "ETH/USDT", status: "running",
    pnl: -88.20, pnlPct: -1.76,
    capital: 2500, openPositions: 1,
    lastTrade: "22m ago", heartbeat: "8s ago",
    sparkKey: "bot2",
  },
  {
    id: "bot-3", name: "Impulse Scalper",
    strategy: "Core Momentum", exchange: "Alpaca",
    pair: "SOL/USDT", status: "paused",
    pnl: +54.80, pnlPct: +1.10,
    capital: 1500, openPositions: 0,
    lastTrade: "2h ago", heartbeat: "—",
    sparkKey: "bot3",
  },
  {
    id: "bot-4", name: "Trend Follower",
    strategy: "Core Trend", exchange: "Binance",
    pair: "BNB/USDT", status: "error",
    pnl: +0, pnlPct: 0,
    capital: 500, openPositions: 0,
    lastTrade: "—", heartbeat: "—",
    sparkKey: "bot1",
  },
];

const POSITIONS = [
  { id: 1, bot: "Momentum Alpha",  pair: "BTC/USDT", side: "LONG",  entry: 97420.50, current: 98840.00, qty: 0.028, pnl: +39.74, pnlPct: +1.46, held: "2h 14m", exchange: "Binance" },
  { id: 2, bot: "Momentum Alpha",  pair: "ETH/USDT", side: "LONG",  entry: 3180.20,  current: 3156.40,  qty: 0.42,  pnl: -9.99,  pnlPct: -0.75, held: "41m",    exchange: "Binance" },
  { id: 3, bot: "Mean Rev Grid",   pair: "ETH/USDT", side: "SHORT", entry: 3210.00,  current: 3156.40,  qty: 0.20,  pnl: +10.72, pnlPct: +1.67, held: "1h 03m", exchange: "Binance" },
];

const ACTIVITY = [
  { id: 1,  time: "10:42",  bot: "Momentum Alpha", pair: "BTC/USDT", side: "BUY",  price: 97420.50, qty: 0.028, result: null,    exchange: "Binance" },
  { id: 2,  time: "10:18",  bot: "Mean Rev Grid",  pair: "ETH/USDT", side: "SELL", price: 3204.80,  qty: 0.40,  result: +28.60,  exchange: "Binance" },
  { id: 3,  time: "09:55",  bot: "Momentum Alpha", pair: "BTC/USDT", side: "SELL", price: 97810.00, qty: 0.030, result: +112.20, exchange: "Binance" },
  { id: 4,  time: "09:31",  bot: "Impulse Scalper",pair: "SOL/USDT", side: "BUY",  price: 192.40,   qty: 2.0,   result: null,    exchange: "Alpaca"  },
  { id: 5,  time: "09:10",  bot: "Mean Rev Grid",  pair: "ETH/USDT", side: "BUY",  price: 3190.10,  qty: 0.40,  result: null,    exchange: "Binance" },
  { id: 6,  time: "08:47",  bot: "Impulse Scalper",pair: "SOL/USDT", side: "SELL", price: 195.80,   qty: 2.0,   result: +6.80,   exchange: "Alpaca"  },
  { id: 7,  time: "08:22",  bot: "Momentum Alpha", pair: "BTC/USDT", side: "BUY",  price: 96900.00, qty: 0.028, result: null,    exchange: "Binance" },
  { id: 8,  time: "07:55",  bot: "Mean Rev Grid",  pair: "ETH/USDT", side: "SELL", price: 3215.00,  qty: 0.35,  result: -12.40,  exchange: "Binance" },
];

const NAV_ITEMS = [
  { key: "dashboard",  label: "Dashboard",   icon: "▦" },
  { key: "bots",       label: "My Bots",     icon: "⟳", badge: 3 },
  { key: "strategies", label: "Strategies",  icon: "◈" },
  { key: "positions",  label: "Positions",   icon: "⊞", badge: 3 },
  { key: "analytics",  label: "Analytics",   icon: "∿" },
  { key: "capital",    label: "Capital",     icon: "◎" },
  { key: "risk",       label: "Risk",        icon: "⚡" },
];

const NAV_BOTTOM = [
  { key: "billing",    label: "Billing",     icon: "⊛" },
  { key: "account",    label: "Account",     icon: "⊙" },
  { key: "help",       label: "Help",        icon: "?" },
];

// ─── Tokens ───────────────────────────────────────────────────────────────────
const C = {
  bg:       "#0B0D11",
  surface:  "#12151C",
  surfaceAlt:"#0E111A",
  border:   "#1C2338",
  borderSub:"#161B28",
  green:    "#00E5A0",
  greenDim: "#00E5A015",
  greenMid: "#00E5A040",
  red:      "#F04F59",
  redDim:   "#F04F5915",
  amber:    "#F59E0B",
  amberDim: "#F59E0B15",
  textPrimary: "#C8CDE0",
  textMid:  "#6B7590",
  textMuted:"#4A5578",
  textDim:  "#2A3050",
  sidebar:  "#0E111A",
};

const mono = "'JetBrains Mono', 'Fira Code', monospace";

// ─── Utilities ────────────────────────────────────────────────────────────────
const fmt = {
  usd:  v => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct:  v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%",
  abs:  v => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

const statusMeta = {
  running: { color: C.green,  label: "RUNNING", pulse: true  },
  paused:  { color: C.amber,  label: "PAUSED",  pulse: false },
  error:   { color: C.red,    label: "ERROR",   pulse: false },
  stopped: { color: C.textDim,label: "STOPPED", pulse: false },
};

// ─── Micro Components ─────────────────────────────────────────────────────────

function Mono({ children, size = 11, color = C.textPrimary, weight = 500, caps = false, style = {} }) {
  return (
    <span style={{
      fontFamily: mono, fontSize: size, color, fontWeight: weight,
      letterSpacing: caps ? "0.1em" : "0.03em",
      textTransform: caps ? "uppercase" : "none",
      ...style,
    }}>
      {children}
    </span>
  );
}

function Label({ children, style = {} }) {
  return <Mono size={9} color={C.textMuted} caps weight={600} style={{ letterSpacing: "0.12em", ...style }}>{children}</Mono>;
}

function StatusDot({ status, size = 7 }) {
  const meta = statusMeta[status] || statusMeta.stopped;
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {meta.pulse && (
        <span style={{
          position: "absolute",
          width: size + 6, height: size + 6,
          borderRadius: "50%",
          background: meta.color + "30",
          animation: "pulse 2s ease-in-out infinite",
        }} />
      )}
      <span style={{
        width: size, height: size, borderRadius: "50%",
        background: meta.color,
        display: "inline-block", flexShrink: 0,
      }} />
    </span>
  );
}

function Badge({ children, color = C.green }) {
  return (
    <span style={{
      background: color + "18",
      border: `1px solid ${color}35`,
      borderRadius: 2,
      padding: "2px 6px",
      fontFamily: mono, fontSize: 9, color, fontWeight: 700,
      letterSpacing: "0.1em",
    }}>
      {children}
    </span>
  );
}

function Divider({ style = {} }) {
  return <div style={{ height: 1, background: C.borderSub, ...style }} />;
}

// Inline sparkline using SVG
function Sparkline({ data, positive = true, height = 28, width = 72 }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const color = positive ? C.green : C.red;
  const pathD = `M ${pts.join(" L ")}`;
  const fillD = `M 0,${height} L ${pts.join(" L ")} L ${width},${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${positive}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#sg-${positive})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ active, setActive, collapsed, setCollapsed }) {
  return (
    <div style={{
      width: collapsed ? 52 : 200,
      minHeight: "100vh",
      background: C.sidebar,
      borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column",
      transition: "width 0.2s ease",
      flexShrink: 0,
      position: "sticky", top: 0,
      overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{
        height: 52, display: "flex", alignItems: "center",
        padding: collapsed ? "0 14px" : "0 16px",
        borderBottom: `1px solid ${C.border}`,
        gap: 10, overflow: "hidden",
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
          background: `linear-gradient(135deg, ${C.green}, #00B87A)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800, color: "#0A0D14", fontFamily: mono,
        }}>S</div>
        {!collapsed && <Mono size={13} weight={700} style={{ letterSpacing: "0.14em", whiteSpace: "nowrap" }}>STELLA</Mono>}
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, padding: "10px 0", overflow: "hidden" }}>
        {NAV_ITEMS.map(item => {
          const isActive = active === item.key;
          return (
            <button key={item.key} onClick={() => setActive(item.key)} style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: 10, padding: collapsed ? "10px 14px" : "10px 16px",
              background: isActive ? `${C.green}10` : "transparent",
              borderLeft: `2px solid ${isActive ? C.green : "transparent"}`,
              border: "none", borderLeft: `2px solid ${isActive ? C.green : "transparent"}`,
              cursor: "pointer", transition: "all 0.15s", overflow: "hidden",
            }}>
              <span style={{
                fontSize: 13, color: isActive ? C.green : C.textMuted,
                flexShrink: 0, lineHeight: 1,
                fontFamily: mono,
              }}>{item.icon}</span>
              {!collapsed && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1, minWidth: 0 }}>
                  <Mono size={11} color={isActive ? C.green : C.textMid} weight={isActive ? 700 : 500} style={{ whiteSpace: "nowrap" }}>
                    {item.label}
                  </Mono>
                  {item.badge && (
                    <span style={{
                      background: isActive ? C.green : C.border,
                      color: isActive ? "#0A0D14" : C.textMuted,
                      borderRadius: 10, padding: "1px 6px",
                      fontFamily: mono, fontSize: 9, fontWeight: 700,
                    }}>{item.badge}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}

        <div style={{ height: 1, background: C.border, margin: "10px 0" }} />

        {NAV_BOTTOM.map(item => {
          const isActive = active === item.key;
          return (
            <button key={item.key} onClick={() => setActive(item.key)} style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: 10, padding: collapsed ? "9px 14px" : "9px 16px",
              background: "transparent",
              border: "none", borderLeft: `2px solid ${isActive ? C.green : "transparent"}`,
              cursor: "pointer", transition: "all 0.15s", overflow: "hidden",
            }}>
              <span style={{ fontSize: 12, color: C.textDim, flexShrink: 0, fontFamily: mono }}>{item.icon}</span>
              {!collapsed && <Mono size={11} color={C.textMuted} style={{ whiteSpace: "nowrap" }}>{item.label}</Mono>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button onClick={() => setCollapsed(c => !c)} style={{
        width: "100%", padding: "12px 0",
        background: "transparent", border: "none",
        borderTop: `1px solid ${C.border}`,
        cursor: "pointer", color: C.textDim,
        fontFamily: mono, fontSize: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {collapsed ? "›" : "‹"}
      </button>
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function Topbar({ onBell }) {
  const [query, setQuery] = useState("");
  const [alerts] = useState(2);

  return (
    <div style={{
      height: 52, display: "flex", alignItems: "center",
      padding: "0 24px", gap: 16,
      background: C.sidebar,
      borderBottom: `1px solid ${C.border}`,
      position: "sticky", top: 0, zIndex: 10,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        <Label>Portal</Label>
        <Mono color={C.textDim}>/</Mono>
        <Mono size={11} color={C.textPrimary} weight={600}>Dashboard</Mono>
      </div>

      {/* Search */}
      <div style={{ position: "relative", width: 220 }}>
        <span style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          color: C.textDim, fontFamily: mono, fontSize: 11, pointerEvents: "none",
        }}>⌕</span>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search bots, pairs..."
          style={{
            width: "100%", background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 4, padding: "7px 12px 7px 28px",
            fontFamily: mono, fontSize: 11, color: C.textPrimary,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Notification bell */}
      <button onClick={onBell} style={{
        position: "relative", background: "transparent", border: "none",
        cursor: "pointer", padding: "6px 8px", borderRadius: 4,
        color: alerts > 0 ? C.amber : C.textMuted,
        fontFamily: mono, fontSize: 15,
      }}>
        ⚬
        {alerts > 0 && (
          <span style={{
            position: "absolute", top: 4, right: 4,
            width: 8, height: 8, borderRadius: "50%",
            background: C.amber, border: `2px solid ${C.sidebar}`,
          }} />
        )}
      </button>

      {/* KYC warning pill */}
      <div style={{
        background: C.amberDim, border: `1px solid ${C.amber}40`,
        borderRadius: 3, padding: "4px 10px",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ color: C.amber, fontSize: 9 }}>●</span>
        <Mono size={9} color={C.amber} caps weight={700}>KYC Under Review</Mono>
      </div>

      {/* User avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.green}40, ${C.green}20)`,
        border: `1px solid ${C.green}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
      }}>
        <Mono size={11} color={C.green} weight={700}>JD</Mono>
      </div>
    </div>
  );
}

// ─── Portfolio Summary ────────────────────────────────────────────────────────

function PortfolioSummary() {
  const [liveEquity, setLiveEquity] = useState(11240);

  // Simulate ticking equity
  useEffect(() => {
    const iv = setInterval(() => {
      setLiveEquity(v => +(v + (Math.random() - 0.48) * 4).toFixed(2));
    }, 2800);
    return () => clearInterval(iv);
  }, []);

  const todayPnl = +278.50;
  const totalReturn = ((liveEquity - 10000) / 10000) * 100;

  const stats = [
    { label: "Total Equity",    value: "$" + liveEquity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), delta: null,       color: C.textPrimary, large: true },
    { label: "Today's P&L",     value: fmt.usd(todayPnl),    delta: "+2.54%",  color: C.green },
    { label: "Unrealised P&L",  value: fmt.usd(39.74 + -9.99 + 10.72), delta: null, color: 39.74 - 9.99 + 10.72 >= 0 ? C.green : C.red },
    { label: "Total Return",    value: fmt.pct(totalReturn),  delta: "all time",color: totalReturn >= 0 ? C.green : C.red },
    { label: "Open Positions",  value: "3",                   delta: "across 2 bots", color: C.textPrimary },
    { label: "Allocated",       value: "$9,500",              delta: "of $12,400",    color: C.textMid },
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 4, padding: "8px 12px",
      }}>
        <Mono size={10} color={C.textMuted}>{payload[0]?.payload?.t}</Mono>
        <br />
        <Mono size={12} color={C.green} weight={700}>${payload[0]?.value?.toLocaleString()}</Mono>
      </div>
    );
  };

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 4, overflow: "hidden", marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: `1px solid ${C.borderSub}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <Mono size={12} weight={700} style={{ letterSpacing: "0.06em" }}>Portfolio Overview</Mono>
          <div style={{ marginTop: 2 }}>
            <Label>Updated live · Binance + Alpaca</Label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["1D","1W","1M","All"].map((r, i) => (
            <button key={r} style={{
              background: i === 0 ? C.greenDim : "transparent",
              border: `1px solid ${i === 0 ? C.greenMid : C.border}`,
              borderRadius: 3, padding: "4px 10px",
              fontFamily: mono, fontSize: 9, letterSpacing: "0.1em",
              color: i === 0 ? C.green : C.textMuted, cursor: "pointer",
            }}>{r}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px" }}>
        {/* Stats grid */}
        <div style={{ padding: "18px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px 24px" }}>
            {stats.map(s => (
              <div key={s.label}>
                <Label>{s.label}</Label>
                <div style={{ marginTop: 5 }}>
                  <Mono size={s.large ? 22 : 16} color={s.color} weight={700} style={{ display: "block", lineHeight: 1.1 }}>
                    {s.value}
                  </Mono>
                  {s.delta && (
                    <Mono size={10} color={C.textMuted} style={{ marginTop: 3, display: "block" }}>{s.delta}</Mono>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Equity chart */}
        <div style={{ borderLeft: `1px solid ${C.borderSub}`, padding: "12px 0 0" }}>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={equityHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.green} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.green} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis domain={["auto","auto"]} hide />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone" dataKey="v"
                stroke={C.green} strokeWidth={1.5}
                fill="url(#eqGrad)"
                dot={false} activeDot={{ r: 3, fill: C.green, stroke: C.surface, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ padding: "4px 12px 10px", display: "flex", justifyContent: "space-between" }}>
            <Label>Feb 10</Label>
            <Label>Today</Label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────

function AlertBanner({ onDismiss }) {
  return (
    <div style={{
      background: C.amberDim, border: `1px solid ${C.amber}35`,
      borderLeft: `3px solid ${C.amber}`,
      borderRadius: 4, padding: "10px 16px",
      display: "flex", alignItems: "center", gap: 12,
      marginBottom: 16,
    }}>
      <span style={{ color: C.amber, fontFamily: mono, fontSize: 13, flexShrink: 0 }}>⚡</span>
      <div style={{ flex: 1 }}>
        <Mono size={11} color={C.amber} weight={700}>Identity verification in progress</Mono>
        <Mono size={10} color={C.textMuted} style={{ display: "block", marginTop: 2 }}>
          Your KYC submission is being reviewed. Bots can run while we verify — typically 2–5 minutes.
        </Mono>
      </div>
      <button onClick={onDismiss} style={{
        background: "transparent", border: "none",
        color: C.textMuted, cursor: "pointer", fontFamily: mono, fontSize: 14, padding: 4,
      }}>×</button>
    </div>
  );
}

// ─── Bot Card ─────────────────────────────────────────────────────────────────

function BotCard({ bot }) {
  const [status, setStatus] = useState(bot.status);
  const meta = statusMeta[status];
  const isUp = bot.pnl >= 0;
  const spark = miniSparkData[bot.sparkKey];

  const toggle = () => setStatus(s => s === "running" ? "paused" : s === "paused" ? "running" : s);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderTop: `2px solid ${meta.color}`,
      borderRadius: 4, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 12,
      transition: "border-color 0.2s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
            <StatusDot status={status} />
            <Mono size={12} weight={700} style={{
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{bot.name}</Mono>
          </div>
          <Label>{bot.strategy} · {bot.exchange}</Label>
        </div>
        <Badge color={meta.color}>{meta.label}</Badge>
      </div>

      {/* Pair + P&L */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <Label>Pair</Label>
          <Mono size={13} color={C.textPrimary} weight={600} style={{ display: "block", marginTop: 3 }}>{bot.pair}</Mono>
        </div>
        <div style={{ textAlign: "right" }}>
          <Label>Session P&L</Label>
          <Mono size={14} color={isUp ? C.green : C.red} weight={700} style={{ display: "block", marginTop: 3 }}>
            {fmt.usd(bot.pnl)}
          </Mono>
          <Mono size={10} color={isUp ? C.green : C.red} style={{ display: "block" }}>
            {fmt.pct(bot.pnlPct)}
          </Mono>
        </div>
      </div>

      {/* Sparkline */}
      <div style={{ borderTop: `1px solid ${C.borderSub}`, paddingTop: 10 }}>
        <Sparkline data={spark} positive={isUp} width="100%" height={32} />
      </div>

      {/* Stats row */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        borderTop: `1px solid ${C.borderSub}`, paddingTop: 10, gap: 0,
      }}>
        {[
          { label: "Capital",    value: fmt.abs(bot.capital) },
          { label: "Positions",  value: String(bot.openPositions) },
          { label: "Last Trade", value: bot.lastTrade },
        ].map((s, i) => (
          <div key={s.label} style={{
            paddingRight: i < 2 ? 10 : 0,
            borderRight: i < 2 ? `1px solid ${C.borderSub}` : "none",
            paddingLeft: i > 0 ? 10 : 0,
          }}>
            <Label>{s.label}</Label>
            <Mono size={11} color={C.textMid} style={{ display: "block", marginTop: 3 }}>{s.value}</Mono>
          </div>
        ))}
      </div>

      {/* Controls */}
      {status !== "error" ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={toggle} style={{
            flex: 1, padding: "7px 0",
            background: status === "running" ? C.amberDim : C.greenDim,
            border: `1px solid ${status === "running" ? C.amber + "40" : C.greenMid}`,
            borderRadius: 3, cursor: "pointer",
            fontFamily: mono, fontSize: 9, letterSpacing: "0.1em",
            color: status === "running" ? C.amber : C.green, fontWeight: 700,
          }}>
            {status === "running" ? "⏸ PAUSE" : "▶ RESUME"}
          </button>
          <button style={{
            padding: "7px 12px",
            background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 3, cursor: "pointer",
            fontFamily: mono, fontSize: 9, letterSpacing: "0.1em",
            color: C.textMuted, fontWeight: 600,
          }}>DETAIL</button>
        </div>
      ) : (
        <div style={{
          background: C.redDim, border: `1px solid ${C.red}30`,
          borderRadius: 3, padding: "7px 12px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ color: C.red, fontFamily: mono, fontSize: 10 }}>⚠</span>
          <Mono size={10} color={C.red}>Exchange credential invalid · Review in Settings</Mono>
        </div>
      )}
    </div>
  );
}

// ─── Positions Table ──────────────────────────────────────────────────────────

function PositionsTable() {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 4, overflow: "hidden", marginBottom: 16,
    }}>
      <div style={{
        padding: "12px 18px", borderBottom: `1px solid ${C.borderSub}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Mono size={11} weight={700} style={{ letterSpacing: "0.06em" }}>Open Positions</Mono>
          <span style={{
            background: C.greenDim, border: `1px solid ${C.greenMid}`,
            borderRadius: 10, padding: "1px 8px",
            fontFamily: mono, fontSize: 9, color: C.green, fontWeight: 700,
          }}>3 LIVE</span>
        </div>
        <button style={{
          background: "transparent", border: `1px solid ${C.border}`,
          borderRadius: 3, padding: "5px 12px",
          fontFamily: mono, fontSize: 9, letterSpacing: "0.1em",
          color: C.textMuted, cursor: "pointer",
        }}>VIEW ALL →</button>
      </div>

      {/* Table header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "140px 70px 110px 110px 80px 100px 100px 90px",
        padding: "8px 18px", gap: 0,
      }}>
        {["Bot","Side","Entry","Current","Qty","Unreal. P&L","Return","Held"].map(h => (
          <Label key={h}>{h}</Label>
        ))}
      </div>

      <Divider />

      {POSITIONS.map((pos, i) => {
        const isUp = pos.pnl >= 0;
        const isLong = pos.side === "LONG";
        return (
          <div key={pos.id}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "140px 70px 110px 110px 80px 100px 100px 90px",
              padding: "11px 18px", gap: 0, alignItems: "center",
              background: i % 2 === 0 ? "transparent" : C.surfaceAlt + "80",
              transition: "background 0.1s",
              cursor: "default",
            }}
              onMouseEnter={e => e.currentTarget.style.background = C.border + "40"}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : C.surfaceAlt + "80"}
            >
              <div>
                <Mono size={11} color={C.textPrimary} weight={600}>{pos.pair}</Mono>
                <Mono size={9} color={C.textMuted} style={{ display: "block", marginTop: 1 }}>{pos.bot}</Mono>
              </div>
              <div>
                <span style={{
                  background: isLong ? C.greenDim : C.redDim,
                  border: `1px solid ${isLong ? C.green + "40" : C.red + "40"}`,
                  borderRadius: 2, padding: "2px 6px",
                  fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  color: isLong ? C.green : C.red,
                }}>{pos.side}</span>
              </div>
              <Mono size={11} color={C.textMid}>${pos.entry.toLocaleString("en-US", { minimumFractionDigits: 2 })}</Mono>
              <Mono size={11} color={C.textPrimary} weight={600}>${pos.current.toLocaleString("en-US", { minimumFractionDigits: 2 })}</Mono>
              <Mono size={11} color={C.textMid}>{pos.qty}</Mono>
              <Mono size={11} color={isUp ? C.green : C.red} weight={700}>{fmt.usd(pos.pnl)}</Mono>
              <Mono size={11} color={isUp ? C.green : C.red}>{fmt.pct(pos.pnlPct)}</Mono>
              <Mono size={11} color={C.textMuted}>{pos.held}</Mono>
            </div>
            {i < POSITIONS.length - 1 && <Divider />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

function ActivityFeed() {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 4, overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 18px", borderBottom: `1px solid ${C.borderSub}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Mono size={11} weight={700} style={{ letterSpacing: "0.06em" }}>Recent Activity</Mono>
        <Label>Today · {ACTIVITY.length} events</Label>
      </div>

      <div style={{ maxHeight: 340, overflowY: "auto" }}>
        {ACTIVITY.map((ev, i) => {
          const isBuy = ev.side === "BUY";
          const hasResult = ev.result !== null;
          const isWin = hasResult && ev.result > 0;
          return (
            <div key={ev.id}>
              <div style={{
                padding: "10px 18px",
                display: "flex", alignItems: "center", gap: 12,
                background: i % 2 === 0 ? "transparent" : C.surfaceAlt + "60",
              }}>
                {/* Side indicator */}
                <div style={{
                  width: 3, height: 28, borderRadius: 2, flexShrink: 0,
                  background: isBuy ? C.green : C.red,
                }} />

                {/* Time */}
                <Mono size={10} color={C.textDim} style={{ flexShrink: 0, width: 36 }}>{ev.time}</Mono>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                      color: isBuy ? C.green : C.red, padding: "1px 5px",
                      background: isBuy ? C.greenDim : C.redDim,
                      border: `1px solid ${isBuy ? C.green + "30" : C.red + "30"}`,
                      borderRadius: 2,
                    }}>{ev.side}</span>
                    <Mono size={11} color={C.textPrimary} weight={600}>{ev.pair}</Mono>
                    <Mono size={10} color={C.textMuted}>${ev.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</Mono>
                    <Mono size={10} color={C.textDim}>qty {ev.qty}</Mono>
                  </div>
                  <Mono size={9} color={C.textDim} style={{ display: "block", marginTop: 2 }}>
                    {ev.bot} · {ev.exchange}
                  </Mono>
                </div>

                {/* Result */}
                {hasResult && (
                  <Mono size={11} color={isWin ? C.green : C.red} weight={700} style={{ flexShrink: 0 }}>
                    {fmt.usd(ev.result)}
                  </Mono>
                )}
                {!hasResult && (
                  <div style={{
                    background: C.greenDim, border: `1px solid ${C.green}25`,
                    borderRadius: 2, padding: "2px 6px",
                    fontFamily: mono, fontSize: 8, color: C.green, letterSpacing: "0.1em",
                  }}>OPEN</div>
                )}
              </div>
              {i < ACTIVITY.length - 1 && <Divider />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Notification Drawer ──────────────────────────────────────────────────────

function NotifDrawer({ open, onClose }) {
  const notifs = [
    { id: 1, type: "warning", title: "Circuit breaker threshold at 82%", body: "Momentum Alpha drawdown approaching 10% limit.", time: "8m ago" },
    { id: 2, type: "info",    title: "BTC/USDT position opened",         body: "Momentum Alpha entered LONG at $97,420.50.", time: "22m ago" },
    { id: 3, type: "success", title: "Trade closed · +$112.20",          body: "Momentum Alpha closed BTC/USDT with $112.20 profit.", time: "1h ago" },
  ];
  const typeColor = { warning: C.amber, info: C.textMid, success: C.green };

  return (
    <div style={{
      position: "fixed", top: 0, right: open ? 0 : -320, bottom: 0, width: 300,
      background: C.surface, borderLeft: `1px solid ${C.border}`,
      zIndex: 100, transition: "right 0.25s ease",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Mono size={12} weight={700} style={{ letterSpacing: "0.06em" }}>Alerts</Mono>
        <button onClick={onClose} style={{
          background: "transparent", border: "none",
          color: C.textMuted, cursor: "pointer", fontFamily: mono, fontSize: 16,
        }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {notifs.map((n, i) => (
          <div key={n.id}>
            <div style={{ padding: "12px 18px", display: "flex", gap: 10 }}>
              <div style={{
                width: 3, borderRadius: 2, flexShrink: 0,
                background: typeColor[n.type], alignSelf: "stretch",
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <Mono size={10} color={typeColor[n.type]} weight={700}>{n.title}</Mono>
                  <Mono size={9} color={C.textDim}>{n.time}</Mono>
                </div>
                <Mono size={10} color={C.textMuted} style={{ lineHeight: 1.5 }}>{n.body}</Mono>
              </div>
            </div>
            {i < notifs.length - 1 && <Divider />}
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>
        <button style={{
          width: "100%", padding: "8px", background: "transparent",
          border: `1px solid ${C.border}`, borderRadius: 3,
          fontFamily: mono, fontSize: 9, letterSpacing: "0.1em",
          color: C.textMuted, cursor: "pointer",
        }}>MARK ALL READ</button>
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function StellaDashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAlert, setShowAlert] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${C.surface}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.textDim}; }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50%       { transform: scale(1.6); opacity: 0; }
        }
        button:hover { opacity: 0.85; }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh", background: C.bg }}>
        {/* Sidebar */}
        <Sidebar
          active={activeNav}
          setActive={setActiveNav}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />

        {/* Main */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Topbar onBell={() => setDrawerOpen(o => !o)} />

          {/* Page content */}
          <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>

            {/* Page title */}
            <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <Mono size={16} weight={700} style={{ letterSpacing: "0.04em", display: "block" }}>Dashboard</Mono>
                <Mono size={10} color={C.textMuted} style={{ display: "block", marginTop: 3 }}>
                  Thursday, 19 Feb 2026 · 10:44 EAT
                </Mono>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{
                  background: C.greenDim, border: `1px solid ${C.greenMid}`,
                  borderRadius: 4, padding: "9px 18px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em",
                  color: C.green, fontWeight: 700, cursor: "pointer",
                }}>+ NEW BOT</button>
                <button style={{
                  background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, padding: "9px 14px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em",
                  color: C.textMuted, cursor: "pointer",
                }}>⊞ EMERGENCY STOP</button>
              </div>
            </div>

            {/* KYC Alert */}
            {showAlert && <AlertBanner onDismiss={() => setShowAlert(false)} />}

            {/* Portfolio Summary */}
            <PortfolioSummary />

            {/* Bot Grid */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Mono size={11} weight={700} style={{ letterSpacing: "0.06em" }}>Active Bots</Mono>
                  <Label>3 running · 1 error</Label>
                </div>
                <button style={{
                  background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 3, padding: "5px 12px",
                  fontFamily: mono, fontSize: 9, letterSpacing: "0.1em",
                  color: C.textMuted, cursor: "pointer",
                }}>VIEW ALL BOTS →</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {BOTS.map(bot => <BotCard key={bot.id} bot={bot} />)}
              </div>
            </div>

            {/* Positions */}
            <PositionsTable />

            {/* Activity Feed */}
            <ActivityFeed />
          </div>
        </div>

        {/* Notification Drawer */}
        <NotifDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        {/* Drawer overlay */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
              zIndex: 99,
            }}
          />
        )}
      </div>
    </>
  );
}
