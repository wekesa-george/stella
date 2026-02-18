"use client";

import { useState, useEffect } from "react";
import { generateBots, generateInfraMetrics, generateAlerts, generateInfraHistory } from "@/lib/data/generators";
import type { Bot, InfraMetrics, Alert } from "@/lib/types/dashboard";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

// Gauge helpers
function gaugeColor(val: number, warn = 60, crit = 85) {
  if (val >= crit) return "#ff4757";
  if (val >= warn) return "#f5a623";
  return "#00e5a0";
}

function infraStatus(metrics: any, warn = 60, crit = 85) {
  const max = Math.max(metrics.cpu, metrics.ram);
  if (max >= crit) return "critical";
  if (max >= warn) return "warning";
  return "normal";
}

// InfraCard component matching reference exactly
function InfraCard({ name, metrics, warn = 60, crit = 85 }: any) {
  const status = infraStatus(metrics, warn, crit);

  return (
    <div
      className={`bg-dark-elevated border rounded-md p-3 flex flex-col gap-2 ${
        status === "warning" ? "border-[#f5a623]" : status === "critical" ? "border-[#ff4757] shadow-[0_0_12px_rgba(255,71,87,0.15)]" : "border-dark"
      }`}
    >
      <div className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider">{name}</div>

      {[["CPU", metrics.cpu], ["RAM", metrics.ram], ["Disk", metrics.disk]].map(([label, val]: any) => (
        <div className="flex flex-col gap-1" key={label}>
          <div className="flex justify-between items-center text-[9px] uppercase tracking-widest">
            <span className="text-dim">{label}</span>
            <span className="font-mono" style={{ color: gaugeColor(val, warn, crit) }}>{val}%</span>
          </div>
          <div className="h-1 bg-dark-section rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm transition-all duration-700"
              style={{ width: `${val}%`, background: gaugeColor(val, warn, crit) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MissionControlPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [infraMetrics, setInfraMetrics] = useState<InfraMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [infraHistory, setInfraHistory] = useState<any[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);

  // Initialize data on client side
  useEffect(() => {
    setBots(generateBots(18));
    setInfraMetrics(generateInfraMetrics());
    setAlerts(generateAlerts());
    setInfraHistory(generateInfraHistory(40));
  }, []);

  // Update infrastructure metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setInfraMetrics(generateInfraMetrics());
      setInfraHistory(generateInfraHistory(40));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  if (!infraMetrics) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  const totalEquity = bots.reduce((s, b) => s + b.equity, 0);
  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const running = bots.filter(b => b.status === "running").length;
  const errors = bots.filter(b => b.status === "error").length;
  const totalPositions = bots.reduce((s, b) => s + b.openPositions, 0);

  return (
    <div className="flex h-full relative">
      {/* Mobile Alert Toggle Button */}
      <button
        onClick={() => setShowAlerts(!showAlerts)}
        className="fixed bottom-4 right-4 z-50 lg:hidden bg-red text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-semibold"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
        </span>
        {alerts.filter(a => !a.acked && a.sev === "critical").length} Alerts
      </button>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
          {/* Stat overview grid - matching reference exactly */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
              <div className="text-[10px] text-dim uppercase tracking-widest mb-2">Platform Equity</div>
              <div className="text-[28px] font-bold text-foreground leading-none mb-1.5">
                ${(totalEquity / 1000).toFixed(1)}k
              </div>
              <div className={`text-xs ${totalPnl >= 0 ? "text-green" : "text-red"}`}>
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)} today
              </div>
            </div>

            <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
              <div className="text-[10px] text-dim uppercase tracking-widest mb-2">Active Bots</div>
              <div className="text-[28px] font-bold text-green leading-none mb-1.5">{running}</div>
              <div className="text-xs text-muted">
                {errors > 0 ? <span className="text-red">{errors} errors</span> : "all healthy"}
              </div>
            </div>

            <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
              <div className="text-[10px] text-dim uppercase tracking-widest mb-2">Open Positions</div>
              <div className="text-[28px] font-bold text-foreground leading-none mb-1.5">{totalPositions}</div>
              <div className="text-xs text-muted">{bots.length} bots total</div>
            </div>

            <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
              <div className="text-[10px] text-dim uppercase tracking-widest mb-2">Unrealized P&L</div>
              <div className={`text-[28px] font-bold leading-none mb-1.5 ${totalPnl >= 0 ? "text-green" : "text-red"}`}>
                {totalPnl >= 0 ? "+" : ""}${(totalPnl * 0.6).toFixed(0)}
              </div>
              <div className="text-xs text-amber">
                {alerts.filter(a => !a.acked && a.sev === "critical").length} critical alerts
              </div>
            </div>
          </div>

          {/* Infrastructure Health */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8fa3b8]">
                Infrastructure Health
              </span>
              <span className="text-[10px] text-[#5a7090] font-mono hidden sm:inline">Updated 12s ago</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
              <InfraCard name="Phoenix" metrics={infraMetrics.phoenix} />
              <InfraCard name="Postgres" metrics={infraMetrics.postgres} />
              <InfraCard name="RabbitMQ" metrics={infraMetrics.rabbitmq} />
              <InfraCard name="Redis" metrics={infraMetrics.redis} />
              <InfraCard name="Bot Workers" metrics={infraMetrics.botWorker} />
            </div>
          </div>

          {/* Bot Worker Resources Graph */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-foreground">Bot Worker Resources (1h)</span>
            </div>
            <div className="p-3 sm:p-3.5">
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={infraHistory} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff4757" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ff4757" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f5a623" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f5a623" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <XAxis dataKey="t" hide />
                  <ReferenceLine y={70} stroke="rgba(255,71,87,0.4)" strokeDasharray="3 3" />
                  <ReferenceLine y={60} stroke="rgba(245,166,35,0.4)" strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={{
                      background: "#131920",
                      border: "1px solid #1e2d40",
                      borderRadius: 4,
                      fontSize: 10
                    }}
                    formatter={(v: any) => [`${v}%`]}
                  />
                  <Area type="monotone" dataKey="cpu" stroke="#ff4757" strokeWidth={1.5} fill="url(#cpuGrad)" />
                  <Area type="monotone" dataKey="ram" stroke="#f5a623" strokeWidth={1.5} fill="url(#ramGrad)" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 sm:gap-4 mt-1">
                <div className="flex items-center gap-1 text-[10px] text-red">
                  <div className="w-2.5 h-0.5 bg-red" />
                  CPU
                </div>
                <div className="flex items-center gap-1 text-[10px] text-amber">
                  <div className="w-2.5 h-0.5 bg-amber" />
                  RAM
                </div>
                <div className="ml-auto text-[9px] text-dim hidden sm:block">
                  Dashed lines: 60% warn / 70% critical
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Controls */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-foreground">Emergency Controls</span>
            </div>
            <div className="p-3 sm:p-3.5">
              <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
                <button className="px-5 py-2 rounded bg-[#ff4757] text-white text-[11px] font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(255,71,87,0.4)] hover:bg-[#ff2233] hover:shadow-[0_0_30px_rgba(255,71,87,0.6)] hover:scale-105 transition-all whitespace-nowrap">
                  ⬛ Kill Platform
                </button>
                <span className="text-xs text-[#5a7090]">
                  Stops ALL {bots.length} bots across 5 users · {totalPositions} open positions will be left open
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Sidebar Overlay (Mobile) */}
      {showAlerts && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setShowAlerts(false)}
        />
      )}

      {/* Alert Sidebar */}
      <div className={`w-80 bg-card border-l border-dark flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 fixed right-0 top-0 bottom-0 z-40 ${
        showAlerts ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      } lg:block`}>
        <div className="px-3.5 py-3 border-b border-dark flex justify-between items-center">
          <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Alerts</span>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-[9px] font-mono">
              <span className="text-[#ff4757]">
                {alerts.filter(a => !a.acked && a.sev === "critical").length} CRIT
              </span>
              <span className="text-[#f5a623]">
                {alerts.filter(a => !a.acked && a.sev === "warning").length} WARN
              </span>
            </div>
            <button
              onClick={() => setShowAlerts(false)}
              className="lg:hidden text-muted hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`px-3.5 py-2.5 border-b border-dark flex gap-2.5 items-start transition-all hover:bg-dark-elevated ${
                alert.acked ? "opacity-40" : ""
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${
                  alert.sev === "critical"
                    ? "bg-[#ff4757] shadow-[0_0_6px_#ff4757]"
                    : alert.sev === "warning"
                    ? "bg-[#f5a623]"
                    : "bg-blue-500"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-foreground leading-tight">{alert.msg}</div>
                <div className="text-[9px] text-[#5a7090] font-mono mt-0.5">{alert.time}</div>
              </div>
              {!alert.acked && (
                <button className="text-[9px] text-[#5a7090] px-1.5 py-0.5 border border-dark rounded hover:text-[#00e5a0] hover:border-[#00e5a0] transition-colors flex-shrink-0">
                  ACK
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
