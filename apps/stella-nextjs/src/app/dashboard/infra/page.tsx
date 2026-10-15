"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useInfraChannel } from "@/hooks/usePhoenixChannel";
import type { ServiceHealthData } from "@/hooks/usePhoenixChannel";
import { mapWsInfraToTradeEngineMetrics, tradeEngineMetricsToCpuRam } from "@/lib/api/mappers";
import type { TradeEngineMetrics, InfraHistoryPoint } from "@/lib/types/dashboard";
import { getServiceHealth, getInfraMetrics } from "@/lib/tradingEngineApi";
import { getInfrastructureStatus } from "@/lib/stellaAdminApi";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { DashboardSkeleton } from "@/components/ui/skeleton";

const MAX_HISTORY = 60;
const REST_POLL_INTERVAL = 30_000; // 30s fallback poll
const COOLIFY_POLL_INTERVAL = 30_000;

interface CoolifyService {
  id: string;
  name: string;
  type: 'application' | 'database' | 'service';
  coolifyType?: string;
  status: 'running' | 'stopped' | 'exited' | 'restarting' | 'degraded' | 'unknown';
  healthy: boolean;
  fqdn?: string;
  updatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  healthy: { color: "#00e5a0", bg: "rgba(0,229,160,0.08)", border: "rgba(0,229,160,0.2)", dot: "#00e5a0" },
  degraded: { color: "#f5a623", bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.2)", dot: "#f5a623" },
  down: { color: "#ff4757", bg: "rgba(255,71,87,0.08)", border: "rgba(255,71,87,0.2)", dot: "#ff4757" },
  unknown: { color: "#8fa3b8", bg: "rgba(143,163,184,0.06)", border: "rgba(143,163,184,0.15)", dot: "#8fa3b8" },
};

const CATEGORY_LABELS: Record<string, string> = {
  exchange: "Exchanges",
  notification: "Notifications",
  kyc: "KYC Providers",
  webhook: "Webhooks",
};

function formatServiceName(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0 || isNaN(diff)) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

// ── Sub-components ───────────────────────────────────────────────────────

function GaugeBar({ label, value, warn = 60, crit = 85, suffix = "%" }: { label: string; value: number; warn?: number; crit?: number; suffix?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center text-[9px] uppercase tracking-widest">
        <span className="text-[#5a7090]">{label}</span>
        <span className="font-mono" style={{ color: gaugeColor(value, warn, crit) }}>{value}{suffix}</span>
      </div>
      <div className="h-1 bg-[#1a2230] rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%`, background: gaugeColor(value, warn, crit) }}
        />
      </div>
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[9px] text-[#5a7090] uppercase tracking-widest">{label}</span>
      <span className="text-[10px] font-mono" style={{ color: color ?? "#c9d1d9" }}>{value}</span>
    </div>
  );
}

const BEAM_MEMORY_REFERENCE_MB = 2048;

function BeamVmCard({ beam }: { beam: TradeEngineMetrics['beam'] }) {
  const ramPercent = Math.min(100, Math.round((beam.totalMemoryMb / BEAM_MEMORY_REFERENCE_MB) * 100));
  const procPercent = beam.processLimit > 0 ? Math.round((beam.processCount / beam.processLimit) * 100) : 0;
  const cpuStatus = beam.cpuPercent >= 85 ? "critical" : beam.cpuPercent >= 60 ? "warning" : "normal";
  const ramStatus = ramPercent >= 85 ? "critical" : ramPercent >= 60 ? "warning" : "normal";
  const worstStatus = cpuStatus === "critical" || ramStatus === "critical" ? "critical" : cpuStatus === "warning" || ramStatus === "warning" ? "warning" : "normal";

  return (
    <div
      className={`bg-dark-elevated border rounded-md p-3 flex flex-col gap-2 ${
        worstStatus === "warning" ? "border-[#f5a623]" : worstStatus === "critical" ? "border-[#ff4757] shadow-[0_0_12px_rgba(255,71,87,0.15)]" : "border-dark"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider">BEAM VM</div>
        <span className="text-[9px] font-mono text-[#5a7090]">{beam.schedulerCount} schedulers</span>
      </div>
      <GaugeBar label="CPU (Run Queue)" value={beam.cpuPercent} />
      <GaugeBar label={`RAM (${beam.totalMemoryMb.toFixed(0)} MB)`} value={ramPercent} />
      <GaugeBar label={`Processes (${beam.processCount.toLocaleString()}/${beam.processLimit.toLocaleString()})`} value={procPercent} warn={70} crit={90} />
      <div className="border-t border-[#1a2230] pt-1.5 space-y-1">
        <MetricRow label="Uptime" value={formatUptime(beam.uptimeSeconds)} />
        <MetricRow label="I/O In / Out" value={`${beam.ioInputMb.toFixed(1)} / ${beam.ioOutputMb.toFixed(1)} MB`} />
      </div>
    </div>
  );
}

function EtsCacheCard({ ets }: { ets: TradeEngineMetrics['ets'] }) {
  return (
    <div className="bg-dark-elevated border border-dark rounded-md p-3 flex flex-col gap-2">
      <div className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider">ETS Cache</div>
      <div className="space-y-1.5">
        <MetricRow label="Tables" value={String(ets.tableCount)} />
        <MetricRow label="Total Entries" value={ets.totalEntries.toLocaleString()} />
        <MetricRow label="Memory" value={formatBytes(ets.totalMemoryBytes)} />
      </div>
    </div>
  );
}

function DbPoolCard({ dbPool }: { dbPool: TradeEngineMetrics['dbPool'] }) {
  const isConnected = dbPool.status === 'connected' || dbPool.status === 'ok';
  const statusColor = isConnected ? "#00e5a0" : "#ff4757";

  return (
    <div
      className={`bg-dark-elevated border rounded-md p-3 flex flex-col gap-2 ${
        isConnected ? "border-dark" : "border-[#ff4757]"
      }`}
    >
      <div className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider">DB Pool</div>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[9px] text-[#5a7090] uppercase tracking-widest">Status</span>
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
            />
            <span className="text-[10px] font-mono" style={{ color: statusColor }}>
              {dbPool.status}
            </span>
          </div>
        </div>
        <MetricRow label="Pool Size" value={String(dbPool.poolSize)} />
      </div>
    </div>
  );
}

function ServiceHealthCard({ service }: { service: ServiceHealthData }) {
  const cfg = STATUS_CONFIG[service.status] ?? STATUS_CONFIG.unknown;
  const envBadge = service.environment === "prod" ? "PROD" : service.environment === "sandbox" ? "SANDBOX" : "DEV";

  return (
    <div
      className="bg-dark-elevated border rounded-md p-3 flex flex-col gap-2.5"
      style={{ borderColor: cfg.border }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: cfg.dot, boxShadow: `0 0 6px ${cfg.dot}` }}
          />
          <span className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider truncate">
            {formatServiceName(service.service_name)}
          </span>
        </div>
        <span
          className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm shrink-0"
          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
        >
          {service.status}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Environment</span>
          <span className="text-[10px] font-mono text-foreground">{envBadge}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Response</span>
          <span className="text-[10px] font-mono text-foreground">
            {service.response_time_ms != null ? `${service.response_time_ms}ms` : "--"}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Checked</span>
          <span className="text-[10px] font-mono text-[#5a7090]">
            {service.checked_at ? formatRelativeTime(service.checked_at) : "--"}
          </span>
        </div>
      </div>

      {service.message && (
        <div className="text-[10px] text-[#5a7090] truncate" title={service.message}>
          {service.message}
        </div>
      )}
    </div>
  );
}

const COOLIFY_STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string; label: string }> = {
  running: { color: "#00e5a0", bg: "rgba(0,229,160,0.08)", border: "rgba(0,229,160,0.2)", dot: "#00e5a0", label: "Running" },
  stopped: { color: "#ff4757", bg: "rgba(255,71,87,0.08)", border: "rgba(255,71,87,0.2)", dot: "#ff4757", label: "Stopped" },
  exited: { color: "#ff4757", bg: "rgba(255,71,87,0.08)", border: "rgba(255,71,87,0.2)", dot: "#ff4757", label: "Exited" },
  restarting: { color: "#f5a623", bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.2)", dot: "#f5a623", label: "Restarting" },
  degraded: { color: "#f5a623", bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.2)", dot: "#f5a623", label: "Degraded" },
  unknown: { color: "#8fa3b8", bg: "rgba(143,163,184,0.06)", border: "rgba(143,163,184,0.15)", dot: "#8fa3b8", label: "Unknown" },
};

const COOLIFY_TYPE_LABELS: Record<string, string> = {
  application: "App",
  database: "Database",
  service: "Service",
};

function CoolifyServiceCard({ service }: { service: CoolifyService }) {
  const cfg = COOLIFY_STATUS_CONFIG[service.status] ?? COOLIFY_STATUS_CONFIG.unknown;

  return (
    <div
      className="bg-dark-elevated border rounded-md p-3 flex flex-col gap-2.5"
      style={{ borderColor: cfg.border }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: cfg.dot, boxShadow: `0 0 6px ${cfg.dot}` }}
          />
          <span className="text-[11px] font-semibold text-[#8fa3b8] uppercase tracking-wider truncate">
            {service.name}
          </span>
        </div>
        <span
          className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm shrink-0"
          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
        >
          {cfg.label}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Type</span>
          <span className="text-[10px] font-mono text-foreground">
            {COOLIFY_TYPE_LABELS[service.type] ?? service.type}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Health</span>
          <span className="text-[10px] font-mono" style={{ color: service.healthy ? "#00e5a0" : "#f5a623" }}>
            {service.healthy ? "Healthy" : "Unhealthy"}
          </span>
        </div>
        {service.fqdn && (
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">FQDN</span>
            <span className="text-[10px] font-mono text-[#5a7090] truncate max-w-[140px]" title={service.fqdn}>
              {service.fqdn.replace(/^https?:\/\//, '')}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[#5a7090] uppercase tracking-widest">Updated</span>
          <span className="text-[10px] font-mono text-[#5a7090]">
            {formatRelativeTime(service.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DataSourceBadge({ wsConnected }: { wsConnected: boolean }) {
  return (
    <span
      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm"
      style={{
        background: wsConnected ? "rgba(0,229,160,0.08)" : "rgba(245,166,35,0.08)",
        color: wsConnected ? "#00e5a0" : "#f5a623",
        border: `1px solid ${wsConnected ? "rgba(0,229,160,0.2)" : "rgba(245,166,35,0.2)"}`,
      }}
    >
      {wsConnected ? "LIVE" : "REST"}
    </span>
  );
}

function SystemStatusSummary({ services }: { services: ServiceHealthData[] }) {
  const counts = useMemo(() => {
    const c = { healthy: 0, degraded: 0, down: 0, unknown: 0, total: services.length };
    for (const s of services) {
      if (s.status in c) c[s.status as keyof typeof c]++;
      else c.unknown++;
    }
    return c;
  }, [services]);

  const overallStatus = counts.down > 0 ? "down" : counts.degraded > 0 ? "degraded" : counts.total === 0 ? "unknown" : "healthy";
  const overallCfg = STATUS_CONFIG[overallStatus];
  const overallLabel = counts.down > 0
    ? `${counts.down} service${counts.down > 1 ? "s" : ""} down`
    : counts.degraded > 0
    ? `${counts.degraded} service${counts.degraded > 1 ? "s" : ""} degraded`
    : counts.total === 0
    ? "Waiting for service health data..."
    : "All external services operational";

  return (
    <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
      <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark">
        <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">System Status</span>
      </div>
      <div className="p-2 sm:p-3.5 space-y-2">
        {/* Overall status */}
        <div
          className="flex items-center gap-3 p-2.5 rounded-sm"
          style={{ background: overallCfg.bg, border: `1px solid ${overallCfg.border}` }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: overallCfg.dot, boxShadow: `0 0 6px ${overallCfg.dot}` }}
          />
          <div className="flex-1">
            <div className="text-xs text-foreground">{overallLabel}</div>
            <div className="text-[10px] text-[#5a7090] font-mono mt-0.5">
              {counts.total} services monitored
            </div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="grid grid-cols-4 gap-2">
          {(["healthy", "degraded", "down", "unknown"] as const).map((status) => {
            const cfg = STATUS_CONFIG[status];
            return (
              <div key={status} className="flex flex-col items-center p-2 bg-[#0d1117] border border-dark rounded-sm">
                <span className="text-sm font-bold font-mono" style={{ color: cfg.color }}>
                  {counts[status]}
                </span>
                <span className="text-[9px] uppercase tracking-widest text-[#5a7090]">{status}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function InfraPage() {
  const [infraMetrics, setInfraMetrics] = useState<TradeEngineMetrics | null>(null);
  const [infraHistory, setInfraHistory] = useState<InfraHistoryPoint[]>([]);
  const [serviceHealthState, setServiceHealthState] = useState<ServiceHealthData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("--");
  const [wsConnected, setWsConnected] = useState(false);
  const [restLoading, setRestLoading] = useState(true);
  const [coolifyServices, setCoolifyServices] = useState<CoolifyService[]>([]);
  const [coolifyFetchedAt, setCoolifyFetchedAt] = useState<string | null>(null);
  const historyIndexRef = useRef(0);

  // Real-time WS channel (best-effort — may not connect)
  const { metrics: wsMetrics, serviceHealth: wsServiceHealth } = useInfraChannel();

  // ── REST fallback: fetch on mount + poll ──

  const fetchServiceHealthRest = useCallback(async () => {
    try {
      const res = await getServiceHealth();
      const body = res.data as any;
      const servicesList = body?.data?.services ?? body?.services;
      if (Array.isArray(servicesList)) {
        const services: ServiceHealthData[] = servicesList.map((s: any) => ({
          service_name: s.service_name ?? "",
          category: s.category ?? "",
          environment: s.environment ?? "",
          status: s.status ?? "unknown",
          message: s.message ?? "",
          response_time_ms: s.response_time_ms ?? null,
          checked_at: s.checked_at ?? "",
        }));
        setServiceHealthState((prev) => {
          if (wsConnected) return prev;
          return services.length > 0 ? services : prev;
        });
      }
    } catch {
      // REST unavailable — that's fine, we'll retry
    }
  }, [wsConnected]);

  const fetchInfraMetricsRest = useCallback(async () => {
    try {
      const res = await getInfraMetrics();
      const body = res.data as any;
      const metricsData = body?.data ?? body;
      if (metricsData && typeof metricsData === "object") {
        const mapped = mapWsInfraToTradeEngineMetrics(metricsData);
        setInfraMetrics((prev) => {
          if (wsConnected) return prev;
          return mapped;
        });
        setLastUpdated("just now");
      }
    } catch {
      // REST unavailable
    }
  }, [wsConnected]);

  // Fetch Coolify infrastructure status
  const fetchCoolifyStatus = useCallback(async () => {
    try {
      const res = await getInfrastructureStatus();
      const body = res.data as any;
      if (body?.services && Array.isArray(body.services)) {
        setCoolifyServices(body.services);
        setCoolifyFetchedAt(body.fetchedAt || new Date().toISOString());
      }
    } catch {
      // Coolify API unavailable — keep existing data
    }
  }, []);

  // Initial REST fetch
  useEffect(() => {
    async function loadInitial() {
      await Promise.all([fetchServiceHealthRest(), fetchInfraMetricsRest(), fetchCoolifyStatus()]);
      setRestLoading(false);
    }
    loadInitial();
  }, [fetchServiceHealthRest, fetchInfraMetricsRest, fetchCoolifyStatus]);

  // REST polling fallback — only when WS is not connected
  useEffect(() => {
    if (wsConnected) return;

    const interval = setInterval(() => {
      fetchServiceHealthRest();
      fetchInfraMetricsRest();
    }, REST_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [wsConnected, fetchServiceHealthRest, fetchInfraMetricsRest]);

  // Coolify polling — always active (independent of WS)
  useEffect(() => {
    const interval = setInterval(fetchCoolifyStatus, COOLIFY_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchCoolifyStatus]);

  // ── WS overlay: when WS pushes data, upgrade to live mode ──

  useEffect(() => {
    if (!wsMetrics) return;

    setWsConnected(true);
    const mapped = mapWsInfraToTradeEngineMetrics(wsMetrics);
    setInfraMetrics(mapped);
    setLastUpdated("just now");

    const { cpu, ram } = tradeEngineMetricsToCpuRam(mapped);
    setInfraHistory((prev) => {
      const idx = historyIndexRef.current++;
      const point: InfraHistoryPoint = { t: idx, cpu, ram };
      const next = [...prev, point];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
  }, [wsMetrics]);

  useEffect(() => {
    if (wsServiceHealth.length > 0) {
      setWsConnected(true);
      setServiceHealthState(wsServiceHealth);
    }
  }, [wsServiceHealth]);

  // Tick "last updated" timer
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated((prev) => {
        if (prev === "just now") return "4s ago";
        if (prev === "--") return "--";
        const match = prev.match(/^(\d+)s/);
        if (match) return `${parseInt(match[1]) + 4}s ago`;
        return prev;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Group services by category
  const servicesByCategory = useMemo(() => {
    const grouped: Record<string, ServiceHealthData[]> = {};
    for (const svc of serviceHealthState) {
      const cat = svc.category || "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(svc);
    }
    return grouped;
  }, [serviceHealthState]);

  // Skeleton only while REST is loading and we have no data at all
  if (restLoading && !infraMetrics && serviceHealthState.length === 0) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#FFD700]">Infrastructure</span>
          </div>

          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Infrastructure</h1>
              <p className="text-xs sm:text-sm text-[#8fa3b8]">
                Monitor system health, resource usage, and service status
              </p>
            </div>
            <DataSourceBadge wsConnected={wsConnected} />
          </div>

          {/* Trade Engine Metrics */}
          {!infraMetrics ? (
            <div className="bg-dark-elevated border border-[#1e2d40] rounded-md p-8 flex flex-col items-center gap-3">
              <svg className="w-10 h-10 text-[#5a7090]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728m12.728 0L5.636 18.364" />
              </svg>
              <p className="font-mono text-xs text-[#5a7090] text-center">
                Waiting for trade engine metrics...
              </p>
              <p className="font-mono text-[10px] text-[#3a4f68] text-center">
                {wsConnected
                  ? "WebSocket connected, waiting for first metrics push."
                  : "WebSocket not connected. Polling REST API every 30s as fallback."
                }
              </p>
            </div>
          ) : (
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center gap-2">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Trade Engine Health</span>
              <span className="text-[10px] text-[#5a7090] font-mono whitespace-nowrap">Updated {lastUpdated}</span>
            </div>
            <div className="p-2 sm:p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <BeamVmCard beam={infraMetrics.beam} />
                <EtsCacheCard ets={infraMetrics.ets} />
                <DbPoolCard dbPool={infraMetrics.dbPool} />
              </div>
            </div>
          </div>
          )}

          {/* Coolify Deployment Status */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center gap-2">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Deployment Status</span>
              <span className="text-[10px] text-[#5a7090] font-mono whitespace-nowrap">
                {coolifyServices.length > 0
                  ? `${coolifyServices.length} services · via Coolify`
                  : "Loading..."
                }
              </span>
            </div>
            <div className="p-2 sm:p-3.5">
              {coolifyServices.length === 0 ? (
                <div className="text-center py-6">
                  <p className="font-mono text-xs text-[#5a7090]">
                    Fetching deployment status from Coolify...
                  </p>
                </div>
              ) : (
                <>
                  {/* Status summary bar */}
                  <div className="flex gap-2 mb-3">
                    {(() => {
                      const counts = { running: 0, stopped: 0, other: 0 };
                      for (const s of coolifyServices) {
                        if (s.status === 'running') counts.running++;
                        else if (s.status === 'stopped' || s.status === 'exited') counts.stopped++;
                        else counts.other++;
                      }
                      return (
                        <>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#00e5a0]" />
                            <span className="text-[#00e5a0] font-mono">{counts.running} running</span>
                          </div>
                          {counts.stopped > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#ff4757]" />
                              <span className="text-[#ff4757] font-mono">{counts.stopped} stopped</span>
                            </div>
                          )}
                          {counts.other > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
                              <span className="text-[#f5a623] font-mono">{counts.other} other</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {coolifyServices.map((svc) => (
                      <CoolifyServiceCard key={svc.id} service={svc} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* External Service Health Monitor */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center gap-2">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">External Service Health</span>
              <span className="text-[10px] text-[#5a7090] font-mono whitespace-nowrap">
                {serviceHealthState.length} services
              </span>
            </div>
            <div className="p-2 sm:p-3.5">
              {serviceHealthState.length === 0 ? (
                <div className="text-center py-6">
                  <p className="font-mono text-xs text-[#5a7090]">
                    No service health data available yet.
                  </p>
                  <p className="font-mono text-[10px] text-[#3a4f68] mt-1">
                    {wsConnected
                      ? "WebSocket connected. Waiting for health checks to complete."
                      : "Polling REST API for service health. Data appears once health checks run."
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(servicesByCategory).map(([category, services]) => (
                    <div key={category}>
                      <div className="text-[10px] font-semibold text-[#5a7090] uppercase tracking-widest mb-2">
                        {CATEGORY_LABELS[category] ?? category}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {services.map((svc) => (
                          <ServiceHealthCard key={svc.service_name} service={svc} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bot Worker Resources Chart */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-2 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">BEAM VM Resources (1h)</span>
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

          {/* System Status Summary */}
          <SystemStatusSummary services={serviceHealthState} />
        </div>
      </div>
    </div>
  );
}
