"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { listBots, getInfraMetrics } from "@/lib/tradingEngineApi";
import { getAlerts, acknowledgeAlert as ackAlertApi, getInfrastructureStatus } from "@/lib/stellaAdminApi";
import { useBotChannel, useInfraChannel, useAlertChannel, usePlatformChannel } from "@/hooks/usePhoenixChannel";
import { mapApiBotToUiBot, mapApiAlertToUiAlert, mapWsAlertToUiAlert, mapWsInfraToTradeEngineMetrics, tradeEngineMetricsToCpuRam } from "@/lib/api/mappers";
import type { Bot, TradeEngineMetrics, Alert, InfraHistoryPoint } from "@/lib/types/dashboard";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

const MAX_HISTORY = 40;
const COOLIFY_POLL_INTERVAL = 30_000;
const REST_POLL_INTERVAL = 30_000;

interface CoolifyServiceData {
  id: string;
  name: string;
  type: 'application' | 'database' | 'service';
  status: 'running' | 'stopped' | 'exited' | 'restarting' | 'degraded' | 'unknown';
  healthy: boolean;
  fqdn?: string;
  updatedAt: string;
}

// Helpers
function gaugeColor(val: number, warn = 60, crit = 85) {
  if (val >= crit) return "#ff4757";
  if (val >= warn) return "#f5a623";
  return "#00e5a0";
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BEAM_MEMORY_REFERENCE_MB = 2048;

export default function MissionControlPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [infraMetrics, setInfraMetrics] = useState<TradeEngineMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [infraHistory, setInfraHistory] = useState<InfraHistoryPoint[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coolifyServices, setCoolifyServices] = useState<CoolifyServiceData[]>([]);
  const historyIndexRef = useRef(0);

  // Real-time WS hooks
  const { bots: wsBots } = useBotChannel();
  const { metrics: wsInfraMetrics } = useInfraChannel();
  const { alerts: wsAlerts } = useAlertChannel();
  const { stats: platformStats } = usePlatformChannel();

  // Fetch Coolify status
  const fetchCoolifyStatus = useCallback(async () => {
    try {
      const res = await getInfrastructureStatus();
      const body = res.data as any;
      if (body?.services && Array.isArray(body.services)) {
        setCoolifyServices(body.services);
      }
    } catch {
      // Coolify API unavailable
    }
  }, []);

  // REST fallback for infra metrics (loads immediately, doesn't wait for WS)
  const fetchInfraMetricsRest = useCallback(async () => {
    console.log('[MissionControl] REST fallback: fetching /api/phoenix/infra/metrics...');
    try {
      const res = await getInfraMetrics();
      const body = res.data as any;
      console.log('[MissionControl] REST response:', res.error ? `ERROR: ${res.error}` : `OK, keys=${body ? Object.keys(body).join(',') : 'null'}`);
      const payload = body?.data ?? body;
      if (payload && (payload.beam || payload.database)) {
        const mapped = mapWsInfraToTradeEngineMetrics(payload);
        console.log('[MissionControl] REST mapped metrics:', { cpu: mapped.beam.cpuPercent, mem: mapped.beam.totalMemoryMb, procs: mapped.beam.processCount });
        setInfraMetrics((prev) => {
          // Don't override if WS is already delivering data
          if (prev && wsInfraMetrics) {
            console.log('[MissionControl] REST: skipping — WS already active');
            return prev;
          }
          console.log('[MissionControl] REST: setting infraMetrics (WS not active yet)');
          return mapped;
        });
      } else {
        console.log('[MissionControl] REST: no beam/database in payload');
      }
    } catch (e) {
      console.warn('[MissionControl] REST fallback failed:', e);
    }
  }, [wsInfraMetrics]);

  // Load initial data from APIs (with timeout so page doesn't hang)
  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);
    (async () => {
      try {
        const [botsResult, alertsResult] = await Promise.all([
          listBots().catch(() => ({ data: [] })),
          getAlerts({ limit: 20 }).catch(() => ({ data: [] })),
          fetchCoolifyStatus(),
          fetchInfraMetricsRest(),
        ]);

        if (botsResult.data && Array.isArray(botsResult.data)) {
          setBots(botsResult.data.map(mapApiBotToUiBot));
        }

        if (alertsResult.data && Array.isArray(alertsResult.data)) {
          setAlerts(alertsResult.data.map(mapApiAlertToUiAlert));
        }
      } catch {
        // API failed — lists stay empty
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    })();
    return () => clearTimeout(timeout);
  }, []);

  // REST polling fallback — only when WS is not delivering infra data
  useEffect(() => {
    if (wsInfraMetrics) return; // WS is active, no need to poll

    const interval = setInterval(fetchInfraMetricsRest, REST_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [wsInfraMetrics, fetchInfraMetricsRest]);

  // Overlay WS bot list
  useEffect(() => {
    if (wsBots.length > 0) {
      setBots((prev) => {
        const updated = [...prev];
        for (const wsBot of wsBots) {
          const idx = updated.findIndex((b) => b.id === wsBot.id);
          const mapped = mapApiBotToUiBot(wsBot as any);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], ...mapped, user: updated[idx].user || mapped.user };
          } else {
            updated.push(mapped);
          }
        }
        return updated;
      });
    }
  }, [wsBots]);

  // WS infra updates → replace metrics + append history
  useEffect(() => {
    if (!wsInfraMetrics) return;
    console.log('[MissionControl] WS infra_update received:', { keys: Object.keys(wsInfraMetrics), collected_at: wsInfraMetrics.collected_at });
    const mapped = mapWsInfraToTradeEngineMetrics(wsInfraMetrics);
    console.log('[MissionControl] WS mapped:', { cpu: mapped.beam.cpuPercent, mem: mapped.beam.totalMemoryMb, procs: mapped.beam.processCount, dbStatus: mapped.dbPool.status });
    setInfraMetrics(mapped);

    const { cpu, ram } = tradeEngineMetricsToCpuRam(mapped);
    setInfraHistory((prev) => {
      const idx = historyIndexRef.current++;
      const point: InfraHistoryPoint = { t: idx, cpu, ram };
      const next = [...prev, point];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
  }, [wsInfraMetrics]);

  // WS alert prepend
  useEffect(() => {
    if (wsAlerts.length > 0) {
      const latest = wsAlerts[0];
      const mapped = mapWsAlertToUiAlert(latest);
      setAlerts((prev) => {
        if (prev.some((a) => a.id === mapped.id)) return prev;
        return [mapped, ...prev];
      });
    }
  }, [wsAlerts]);

  // Coolify polling
  useEffect(() => {
    const interval = setInterval(fetchCoolifyStatus, COOLIFY_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchCoolifyStatus]);

  const handleAckAlert = async (id: number | string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acked: true } : a)));
    await ackAlertApi(String(id)).catch(console.error);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  // Compute stats — prefer platform WS stats, fallback to bot-derived
  const totalEquity = platformStats?.total_equity ?? bots.reduce((s, b) => s + b.equity, 0);
  const totalPnl = platformStats?.total_pnl ?? bots.reduce((s, b) => s + b.pnl, 0);
  const running = bots.filter(b => b.status === "running").length;
  const errors = bots.filter(b => b.status === "error").length;
  const totalPositions = platformStats?.open_positions ?? bots.reduce((s, b) => s + b.openPositions, 0);

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
          {/* Stat overview grid */}
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

          {/* Trade Engine Health */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8fa3b8]">
                Trade Engine Health
              </span>
              <span className="text-[10px] text-[#5a7090] font-mono hidden sm:inline">
                {wsInfraMetrics ? 'Live via WebSocket' : infraMetrics ? 'Via REST (WS connecting...)' : 'Waiting for data...'}
              </span>
            </div>
            {infraMetrics ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {/* BEAM VM compact card */}
                {(() => {
                  const { beam } = infraMetrics;
                  const ramPct = Math.min(100, Math.round((beam.totalMemoryMb / BEAM_MEMORY_REFERENCE_MB) * 100));
                  const cpuStatus = beam.cpuPercent >= 85 ? "critical" : beam.cpuPercent >= 60 ? "warning" : "normal";
                  const ramStatus = ramPct >= 85 ? "critical" : ramPct >= 60 ? "warning" : "normal";
                  const worst = cpuStatus === "critical" || ramStatus === "critical" ? "critical" : cpuStatus === "warning" || ramStatus === "warning" ? "warning" : "normal";
                  return (
                    <div className={`bg-dark-elevated border rounded-md p-3 flex flex-col gap-2 ${worst === "warning" ? "border-[#f5a623]" : worst === "critical" ? "border-[#ff4757] shadow-[0_0_12px_rgba(255,71,87,0.15)]" : "border-dark"}`}>
                      <div className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider">BEAM VM</div>
                      {[["CPU", beam.cpuPercent], ["RAM", ramPct]].map(([label, val]: any) => (
                        <div className="flex flex-col gap-1" key={label}>
                          <div className="flex justify-between items-center text-[9px] uppercase tracking-widest">
                            <span className="text-dim">{label}</span>
                            <span className="font-mono" style={{ color: gaugeColor(val) }}>{val}%</span>
                          </div>
                          <div className="h-1 bg-dark-section rounded-sm overflow-hidden">
                            <div className="h-full rounded-sm transition-all duration-700" style={{ width: `${Math.min(val, 100)}%`, background: gaugeColor(val) }} />
                          </div>
                        </div>
                      ))}
                      <div className="text-[9px] text-[#5a7090] font-mono">
                        {beam.processCount.toLocaleString()} procs · up {formatUptime(beam.uptimeSeconds)}
                      </div>
                    </div>
                  );
                })()}

                {/* ETS Cache compact card */}
                <div className="bg-dark-elevated border border-dark rounded-md p-3 flex flex-col gap-2">
                  <div className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider">ETS Cache</div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-dim uppercase tracking-widest">Tables</span>
                      <span className="font-mono text-foreground">{infraMetrics.ets.tableCount}</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-dim uppercase tracking-widest">Entries</span>
                      <span className="font-mono text-foreground">{infraMetrics.ets.totalEntries.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-dim uppercase tracking-widest">Memory</span>
                      <span className="font-mono text-foreground">{formatBytes(infraMetrics.ets.totalMemoryBytes)}</span>
                    </div>
                  </div>
                </div>

                {/* DB Pool compact card */}
                {(() => {
                  const { dbPool } = infraMetrics;
                  const isConnected = dbPool.status === 'connected' || dbPool.status === 'ok';
                  const dotColor = isConnected ? "#00e5a0" : "#ff4757";
                  return (
                    <div className={`bg-dark-elevated border rounded-md p-3 flex flex-col gap-2 ${isConnected ? "border-dark" : "border-[#ff4757]"}`}>
                      <div className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider">DB Pool</div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9px]">
                          <span className="text-dim uppercase tracking-widest">Status</span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
                            <span className="font-mono" style={{ color: dotColor }}>{dbPool.status}</span>
                          </div>
                        </div>
                        <div className="flex justify-between text-[9px]">
                          <span className="text-dim uppercase tracking-widest">Pool Size</span>
                          <span className="font-mono text-foreground">{dbPool.poolSize}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-dark-elevated border border-dark rounded-md p-3 space-y-2 animate-pulse">
                    <div className="h-3 w-20 bg-[#1a2230] rounded" />
                    <div className="h-1 w-full bg-[#1a2230] rounded" />
                    <div className="h-1 w-full bg-[#1a2230] rounded" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coolify Deployment Status */}
          {coolifyServices.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8fa3b8]">
                  Deployment Status
                </span>
                <span className="text-[10px] text-[#5a7090] font-mono hidden sm:inline">
                  {coolifyServices.length} services via Coolify
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {coolifyServices.map((svc) => {
                  const isHealthy = svc.status === 'running' && svc.healthy;
                  const isStopped = svc.status === 'stopped' || svc.status === 'exited';
                  const statusColor = isHealthy ? "#00e5a0" : isStopped ? "#ff4757" : "#f5a623";
                  const statusLabel = isStopped ? "Down" : svc.status === 'running' ? (svc.healthy ? "Healthy" : "Unhealthy") : svc.status;

                  return (
                    <div
                      key={svc.id}
                      className="bg-dark-elevated border rounded-md p-3 flex flex-col gap-2"
                      style={{ borderColor: isStopped ? "rgba(255,71,87,0.3)" : "var(--border-dark, #1e2d40)" }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
                          />
                          <span className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider truncate">
                            {svc.name}
                          </span>
                        </div>
                        <span
                          className="text-[8px] font-bold uppercase px-1 py-0.5 rounded-sm shrink-0"
                          style={{ color: statusColor }}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-[9px] text-[#5a7090] uppercase tracking-widest">
                        {svc.type}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bot Worker Resources Graph */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-foreground">BEAM VM Resources (1h)</span>
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
                  Stops ALL {bots.length} bots across {new Set(bots.map(b => b.user)).size} users · {totalPositions} open positions will be left open
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
                <button
                  onClick={() => handleAckAlert(alert.id)}
                  className="text-[9px] text-[#5a7090] px-1.5 py-0.5 border border-dark rounded hover:text-[#FFD700] hover:border-[#FFD700] transition-colors flex-shrink-0"
                >
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
