"use client";

import { useState, useEffect } from "react";
import { generateInfraMetrics, generateInfraHistory } from "@/lib/data/generators";
import type { InfraMetrics } from "@/lib/types/dashboard";
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
            <span className="text-[#5a7090]">{label}</span>
            <span className="font-mono" style={{ color: gaugeColor(val, warn, crit) }}>{val}%</span>
          </div>
          <div className="h-1 bg-[#1a2230] rounded-sm overflow-hidden">
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

export default function InfraPage() {
  const [infraMetrics, setInfraMetrics] = useState<InfraMetrics | null>(null);
  const [infraHistory, setInfraHistory] = useState<any[]>([]);

  // Initialize data on client side
  useEffect(() => {
    setInfraMetrics(generateInfraMetrics());
    setInfraHistory(generateInfraHistory(60));
  }, []);

  // Update infrastructure metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setInfraMetrics(generateInfraMetrics());
      setInfraHistory(generateInfraHistory(60));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  if (!infraMetrics) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[#8fa3b8]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#00e5a0]">Infrastructure</span>
          </div>

          {/* Page Header */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Infrastructure</h1>
            <p className="text-xs sm:text-sm text-[#8fa3b8]">
              Monitor system health, resource usage, and service status
            </p>
          </div>

          {/* Infrastructure Health */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center gap-2">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Infrastructure Health</span>
              <span className="text-[10px] text-[#5a7090] font-mono whitespace-nowrap">Updated 12s ago</span>
            </div>
            <div className="p-2 sm:p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {Object.entries(infraMetrics).map(([key, m]: any) => (
                  <InfraCard
                    key={key}
                    name={key === "botWorker" ? "Bot Workers" : key.charAt(0).toUpperCase() + key.slice(1)}
                    metrics={m}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Bot Worker Resources Chart */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Bot Worker Resources (1h)</span>
            </div>
            <div className="p-2 sm:p-3.5 pb-2">
              <div className="h-28 sm:h-32">
              <ResponsiveContainer width="100%" height="100%">
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
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-4 mt-2">
                <div className="text-[10px] text-[#ff4757] flex items-center gap-1.5">
                  <div className="w-2.5 h-0.5 bg-[#ff4757]" /> CPU
                </div>
                <div className="text-[10px] text-[#f5a623] flex items-center gap-1.5">
                  <div className="w-2.5 h-0.5 bg-[#f5a623]" /> RAM
                </div>
                <div className="text-[9px] text-[#5a7090] sm:ml-auto">
                  Dashed lines: 60% warn / 70% critical
                </div>
              </div>
            </div>
          </div>

          {/* Service Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Phoenix Service */}
            <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
              <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark">
                <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Phoenix Server</span>
              </div>
              <div className="p-2 sm:p-3.5 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Status</span>
                  <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-sm bg-[rgba(0,229,160,0.12)] text-[#00e5a0]">RUNNING</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Uptime</span>
                  <span className="text-xs font-mono text-foreground">14d 8h 23m</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Requests/min</span>
                  <span className="text-xs font-mono text-foreground">1,247</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Avg Response</span>
                  <span className="text-xs font-mono text-foreground">12ms</span>
                </div>
              </div>
            </div>

            {/* Postgres Service */}
            <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
              <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark">
                <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">PostgreSQL</span>
              </div>
              <div className="p-2 sm:p-3.5 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Status</span>
                  <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-sm bg-[rgba(0,229,160,0.12)] text-[#00e5a0]">RUNNING</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Connections</span>
                  <span className="text-xs font-mono text-foreground">124 / 200</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Queries/sec</span>
                  <span className="text-xs font-mono text-foreground">342</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Cache Hit Rate</span>
                  <span className="text-xs font-mono text-[#00e5a0]">98.2%</span>
                </div>
              </div>
            </div>

            {/* RabbitMQ Service */}
            <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
              <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark">
                <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">RabbitMQ</span>
              </div>
              <div className="p-2 sm:p-3.5 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Status</span>
                  <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-sm bg-[rgba(0,229,160,0.12)] text-[#00e5a0]">RUNNING</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Queue Depth</span>
                  <span className="text-xs font-mono text-foreground">4,234</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Messages/sec</span>
                  <span className="text-xs font-mono text-foreground">167</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Consumers</span>
                  <span className="text-xs font-mono text-foreground">18</span>
                </div>
              </div>
            </div>

            {/* Redis Service */}
            <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
              <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark">
                <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Redis Cache</span>
              </div>
              <div className="p-2 sm:p-3.5 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Status</span>
                  <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-sm bg-[rgba(0,229,160,0.12)] text-[#00e5a0]">RUNNING</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Keys</span>
                  <span className="text-xs font-mono text-foreground">12,847</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Ops/sec</span>
                  <span className="text-xs font-mono text-foreground">8,234</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Hit Rate</span>
                  <span className="text-xs font-mono text-[#00e5a0]">99.7%</span>
                </div>
              </div>
            </div>
          </div>

          {/* System Alerts */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">System Status</span>
            </div>
            <div className="p-2 sm:p-3.5 space-y-2">
              <div className="flex items-center gap-3 p-2.5 bg-[rgba(0,229,160,0.08)] border border-[rgba(0,229,160,0.2)] rounded-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00e5a0] shadow-[0_0_6px_#00e5a0]"></div>
                <div className="flex-1">
                  <div className="text-xs text-foreground">All services operational</div>
                  <div className="text-[10px] text-[#5a7090] font-mono mt-0.5">Last checked 12s ago</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2.5 bg-[#0d1117] border border-dark rounded-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8fa3b8]"></div>
                <div className="flex-1">
                  <div className="text-xs text-[#8fa3b8]">No degraded services</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2.5 bg-[#0d1117] border border-dark rounded-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8fa3b8]"></div>
                <div className="flex-1">
                  <div className="text-xs text-[#8fa3b8]">No service outages</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
