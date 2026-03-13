"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { stopBot, pauseBot, startBot, deleteBot, getBotEquityCurve, deployBot, deploySystemBot } from "@/lib/tradingEngineApi";
import type { BotListFilters } from "@/lib/tradingEngineApi";
import { acknowledgeAlert as ackAlertApi } from "@/lib/stellaAdminApi";
import { useBotChannel, useAlertChannel } from "@/hooks/usePhoenixChannel";
import { mapWsAlertToUiAlert } from "@/lib/api/mappers";
import type { Bot, Alert } from "@/lib/types/dashboard";
import { Search, Bell, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Eye, Play, Pause, Square, Trash2, LayoutGrid, TableProperties, Copy, Loader2, AlertCircle, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BotGridSkeleton } from "@/components/ui/skeleton";
import { useBots, useAlerts as useAlertsQuery } from "@/hooks/useQueries";

import { AreaChart, Area, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function FleetCardSkeleton({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("bg-dark-elevated border border-dark rounded-md p-3", className)}>
      <span className="text-[10px] font-bold text-[#5a7090] uppercase tracking-wider">{label ?? ""}</span>
      <div className="flex flex-col items-center justify-center gap-2 py-4">
        <div className="w-1/2 h-4 bg-[#1a2230] rounded animate-pulse" />
        <div className="w-1/3 h-2 bg-[#1a2230] rounded animate-pulse" style={{ animationDelay: "0.3s" }} />
      </div>
    </div>
  );
}

function FleetCardError({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("bg-dark-elevated border border-dark rounded-md p-3", className)}>
      <span className="text-[10px] font-bold text-[#5a7090] uppercase tracking-wider">{label ?? ""}</span>
      <div className="flex items-center justify-center py-4">
        <span className="font-mono text-[9px] text-[#ff4757] uppercase tracking-wider">Failed to load data</span>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  running: { dot: "bg-[#00e5a0]", bg: "bg-[rgba(0,229,160,0.12)]", text: "text-[#00e5a0]" },
  paused: { dot: "bg-[#f5a623]", bg: "bg-[rgba(245,166,35,0.12)]", text: "text-[#f5a623]" },
  maintenance: { dot: "bg-[#f5a623]", bg: "bg-[rgba(245,166,35,0.12)]", text: "text-[#f5a623]" },
  stopped: { dot: "bg-[#5a7090]", bg: "bg-[rgba(90,112,144,0.12)]", text: "text-[#5a7090]" },
  error: { dot: "bg-[#ff4757]", bg: "bg-[rgba(255,71,87,0.12)]", text: "text-[#ff4757]" },
  circuit_broken: { dot: "bg-[#ff4757]", bg: "bg-[rgba(255,71,87,0.12)]", text: "text-[#ff4757]" },
  initializing: { dot: "bg-[#3d9df3]", bg: "bg-[rgba(61,157,243,0.12)]", text: "text-[#3d9df3]" },
  stopping: { dot: "bg-[#3d9df3]", bg: "bg-[rgba(61,157,243,0.12)]", text: "text-[#3d9df3]" },
};

function getStatusStyle(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.stopped;
}

export default function BotFleetPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterExchange, setFilterExchange] = useState<string>("all");
  const [filterStrategy, setFilterStrategy] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterOwnerType, setFilterOwnerType] = useState<string>("all");
  const [filterPnl, setFilterPnl] = useState<string>("all");
  const [filterEquity, setFilterEquity] = useState<string>("all");
  const [filterUptime, setFilterUptime] = useState<string>("all");
  const [killModal, setKillModal] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [botEquityCurves, setBotEquityCurves] = useState<Record<string, { t: number; value: number }[]>>({});
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [cloneBot, setCloneBot] = useState<Bot | null>(null);
  const [cloneCount, setCloneCount] = useState(1);
  const [cloneSubmitting, setCloneSubmitting] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<{ total: number; done: number; errors: string[] } | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const router = useRouter();

  const { bots: wsBots } = useBotChannel();
  const { alerts: wsAlerts } = useAlertChannel();

  // Debounce search input
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  // Build filters for React Query
  const botFilters = useMemo((): BotListFilters => {
    const filters: BotListFilters = { page, per_page: perPage };
    if (filterStatus !== "all") filters.status = filterStatus;
    if (filterExchange !== "all") filters.exchange = filterExchange;
    if (filterStrategy !== "all") filters.strategy_type = filterStrategy;
    if (filterUser !== "all") filters.user_id = filterUser;
    if (filterOwnerType !== "all") filters.owner_type = filterOwnerType as 'user' | 'service_account';
    if (debouncedSearch) filters.search = debouncedSearch;
    if (filterPnl === "profitable") filters.pnl_preset = "profitable";
    else if (filterPnl === "losing") filters.pnl_preset = "losing";
    else if (filterPnl === "breakeven") filters.pnl_preset = "breakeven";
    if (filterEquity === "0-1k") { filters.equity_min = 0; filters.equity_max = 1000; }
    else if (filterEquity === "1k-10k") { filters.equity_min = 1000; filters.equity_max = 10000; }
    else if (filterEquity === "10k-50k") { filters.equity_min = 10000; filters.equity_max = 50000; }
    else if (filterEquity === "50k+") { filters.equity_min = 50000; }
    if (filterUptime === "1h") filters.uptime_min = 3600;
    else if (filterUptime === "24h") filters.uptime_min = 86400;
    else if (filterUptime === "7d") filters.uptime_min = 604800;
    else if (filterUptime === "30d") filters.uptime_min = 2592000;
    return filters;
  }, [page, perPage, filterStatus, filterExchange, filterStrategy, filterUser, filterOwnerType, filterPnl, filterEquity, filterUptime, debouncedSearch]);

  // React Query for bots (auto-refetches when filters change)
  const { data: botsData, isLoading: loading, isFetching: fetching, isError } = useBots(botFilters);
  const bots = botsData?.bots ?? [];
  const totalCount = botsData?.totalCount ?? 0;
  const totalPages = botsData?.totalPages ?? 1;
  const runningBots = botsData?.runningBots ?? 0;
  const totalPnl = botsData?.totalPnl ?? 0;

  // React Query for alerts (cached, shared across pages)
  const { data: alerts = [], isLoading: alertsLoading, isError: alertsIsError } = useAlertsQuery({ limit: 20 });

  // Per-section loading/error states
  const botsReady = !loading;
  const botsError = isError;
  const alertsReady = !alertsLoading;
  const alertsError = alertsIsError;

  // Extract unique filter values from bots
  const allExchanges = useMemo(() =>
    [...new Set(bots.map((b) => b.exchange).filter(Boolean))].sort() as string[],
    [bots]
  );
  const allStrategies = useMemo(() =>
    [...new Set(bots.map((b) => b.strategy).filter(Boolean))].sort() as string[],
    [bots]
  );

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filterStatus, filterExchange, filterStrategy, filterUser, filterOwnerType, filterPnl, filterEquity, filterUptime]);

  const botUsers = useMemo(() => [...new Set(bots.map((b) => b.user).filter(Boolean))], [bots]);
  const unackedCount = useMemo(() => alerts.filter((a) => !a.acked).length, [alerts]);

  const handleAck = async (id: number | string) => {
    await ackAlertApi(String(id)).catch(console.error);
  };

  const handleKill = (botId: string) => {
    setKillModal(botId);
  };

  const confirmKill = async () => {
    if (killModal) {
      await stopBot(killModal).catch(console.error);
      setKillModal(null);
    }
  };

  const handleStart = async (botId: string) => {
    await startBot(botId).catch(console.error);
  };

  const handlePause = async (botId: string) => {
    await pauseBot(botId).catch(console.error);
  };

  const handleResume = async (botId: string) => {
    await startBot(botId).catch(console.error);
  };

  const handleDelete = (botId: string) => {
    setDeleteModal(botId);
  };

  const confirmDelete = async () => {
    if (deleteModal) {
      const result = await deleteBot(deleteModal).catch((err: Error) => {
        console.error("Delete bot error:", err);
        alert(`Failed to delete bot: ${err.message}`);
        return null;
      });
      if (result && result.error) {
        alert(`Failed to delete bot: ${result.error}`);
      }
      setDeleteModal(null);
    }
  };

  const handleClone = (bot: Bot) => {
    setCloneBot(bot);
    setCloneCount(1);
    setCloneError(null);
    setCloneProgress(null);
  };

  const confirmClone = async () => {
    if (!cloneBot) return;
    const total = Math.max(1, Math.min(20, cloneCount));
    setCloneSubmitting(true);
    setCloneProgress({ total, done: 0, errors: [] });
    setCloneError(null);

    const errors: string[] = [];
    const suffix = () => Math.random().toString(36).slice(2, 6).toUpperCase();

    for (let i = 0; i < total; i++) {
      const name = `${cloneBot.name} clone-${suffix()}`;

      const payload: Record<string, any> = {
        name,
        trading_pairs: cloneBot.tradingPairs?.length ? cloneBot.tradingPairs : [cloneBot.pair],
        strategy_id: cloneBot.strategyId || undefined,
        credential_id: cloneBot.credentialId || undefined,
        allocated_capital: cloneBot.allocatedCapital || undefined,
        market_type: cloneBot.marketType || "spot",
        ...(cloneBot.config && Object.keys(cloneBot.config).length > 0 ? { config: cloneBot.config } : {}),
      };

      try {
        const result = cloneBot.serviceAccountId
          ? await deploySystemBot({ service_account_id: cloneBot.serviceAccountId, ...payload })
          : await deployBot({ user_id: cloneBot.user, ...payload });

        if (result.error) {
          errors.push(`${name}: ${result.error}`);
        }
      } catch {
        errors.push(`${name}: Failed to deploy`);
      }

      setCloneProgress({ total, done: i + 1, errors: [...errors] });
    }

    setCloneSubmitting(false);

    if (errors.length === 0) {
      setCloneBot(null);
    } else if (errors.length < total) {
      setCloneError(`${total - errors.length} cloned, ${errors.length} failed:\n${errors.join("\n")}`);
    } else {
      setCloneError(`All clones failed:\n${errors.join("\n")}`);
    }
  };

  // Fleet equity metrics (from current page bots — fleet-wide stats come from API)
  const fleetMetrics = useMemo(() => {
    const totalEquity = bots.reduce((sum, b) => sum + b.equity, 0);
    const fleetPnl = totalPnl;
    const totalPnlPct = totalEquity > 0 ? (fleetPnl / (totalEquity - fleetPnl || 1)) * 100 : 0;
    const runningEquity = bots.filter((b) => b.status === "running").reduce((sum, b) => sum + b.equity, 0);
    const topPerformers = [...bots].sort((a, b) => b.pnl - a.pnl).slice(0, 5);
    return { totalEquity, totalPnl: fleetPnl, totalPnlPct, runningEquity, runningBots, topPerformers };
  }, [bots, totalPnl, runningBots]);

  // Fetch real equity curves for visible bots
  useEffect(() => {
    if (bots.length === 0) return;
    let cancelled = false;
    (async () => {
      const curveMap: Record<string, { t: number; value: number }[]> = {};
      const fetches = bots.map(async (bot) => {
        try {
          const res = await getBotEquityCurve(bot.id);
          const raw = res.data as any;
          const snapshots = Array.isArray(raw) ? raw : [];
          if (snapshots.length > 0) {
            curveMap[bot.id] = snapshots.map((s: any) => ({
              t: new Date(s.snapshot_at ?? s.created_at ?? 0).getTime(),
              value: Number(s.total_equity_usd ?? s.equity ?? 0),
            }));
          }
        } catch {
          // skip — no equity data for this bot
        }
      });
      await Promise.all(fetches);
      if (!cancelled) setBotEquityCurves(curveMap);
    })();
    return () => { cancelled = true; };
  }, [bots]);

  // Per-bot sparkline data — real equity curves, fallback to single-point from current equity
  const botSparklines = useMemo(() => {
    const map: Record<string, { t: number; value: number }[]> = {};
    for (const bot of bots) {
      if (botEquityCurves[bot.id] && botEquityCurves[bot.id].length > 1) {
        map[bot.id] = botEquityCurves[bot.id];
      } else {
        // Fallback: show a flat line at current equity so the cell isn't empty
        const now = Date.now();
        map[bot.id] = [
          { t: now - 3600000, value: bot.equity },
          { t: now, value: bot.equity },
        ];
      }
    }
    return map;
  }, [bots, botEquityCurves]);

  // Fleet equity curve — aggregate all bot curves by timestamp
  const fleetEquityCurve = useMemo(() => {
    const allCurves = Object.values(botEquityCurves).filter((c) => c.length > 1);
    if (allCurves.length === 0) {
      // Fallback: single-point from current totals
      const totalEquity = bots.reduce((sum, b) => sum + b.equity, 0);
      if (totalEquity === 0) return [];
      const now = Date.now();
      return [
        { t: now - 3600000, value: totalEquity },
        { t: now, value: totalEquity },
      ];
    }

    // Collect all unique timestamps across all bots, sorted
    const tsSet = new Set<number>();
    for (const curve of allCurves) {
      for (const pt of curve) tsSet.add(pt.t);
    }
    const timestamps = [...tsSet].sort((a, b) => a - b);

    // For each timestamp, sum the equity across all bots (carry-forward last known value)
    return timestamps.map((ts) => {
      let total = 0;
      for (const curve of allCurves) {
        // Find latest point <= ts
        let val = 0;
        for (const pt of curve) {
          if (pt.t <= ts) val = pt.value;
          else break;
        }
        total += val;
      }
      return { t: ts, value: total };
    });
  }, [bots, botEquityCurves]);

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 min-w-0">
        <div className="space-y-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#FFD700]">Bot Fleet</span>
          </div>

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold text-foreground">Bot Fleet</h1>
              <p className="text-[11px] text-[#8fa3b8]">
                {bots.length} of {totalCount} bots shown
                {fetching && <span className="ml-2 text-[#3d9df3]">updating…</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex rounded border border-dark overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 transition-colors",
                    viewMode === "grid"
                      ? "bg-[rgba(255,215,0,0.1)] text-[#FFD700]"
                      : "bg-dark-elevated text-[#5a7090] hover:text-[#8fa3b8]"
                  )}
                  title="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "p-1.5 border-l border-dark transition-colors",
                    viewMode === "table"
                      ? "bg-[rgba(255,215,0,0.1)] text-[#FFD700]"
                      : "bg-dark-elevated text-[#5a7090] hover:text-[#8fa3b8]"
                  )}
                  title="Table view"
                >
                  <TableProperties className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Alerts Toggle */}
              <button
                onClick={() => setAlertsOpen(!alertsOpen)}
                className={cn(
                  "relative p-2 rounded border transition-all",
                  alertsOpen
                    ? "bg-[rgba(255,215,0,0.08)] border-[rgba(255,215,0,0.3)] text-[#FFD700]"
                    : "bg-dark-elevated border-dark text-[#8fa3b8] hover:text-foreground hover:border-dark-2"
                )}
              >
                <Bell className="h-4 w-4" />
                {unackedCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#ff4757] text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {unackedCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => router.push("/dashboard/bot-fleet/new-bot")}
                className="px-3 py-1.5 rounded bg-[#FFD700] text-black text-[10px] font-bold uppercase tracking-wider hover:bg-[#FFE44D] transition-all whitespace-nowrap"
              >
                + Deploy Bot
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-2">
            {/* Row 1: Search + primary filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8fa3b8]" />
                <input
                  type="text"
                  placeholder="Search bots by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-dark-elevated border border-dark rounded text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-2 py-1.5 bg-dark-elevated border border-dark rounded text-xs text-foreground focus:outline-none focus:border-dark-2"
                >
                  <option value="all">All Status</option>
                  <option value="running">Running</option>
                  <option value="paused">Paused</option>
                  <option value="stopped">Stopped</option>
                  <option value="initializing">Initializing</option>
                  <option value="error">Error</option>
                  <option value="circuit_broken">Circuit Broken</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="stopping">Stopping</option>
                </select>
                <select
                  value={filterExchange}
                  onChange={(e) => setFilterExchange(e.target.value)}
                  className="px-2 py-1.5 bg-dark-elevated border border-dark rounded text-xs text-foreground focus:outline-none focus:border-dark-2"
                >
                  <option value="all">All Exchanges</option>
                  {allExchanges.map((ex) => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                </select>
                <select
                  value={filterStrategy}
                  onChange={(e) => setFilterStrategy(e.target.value)}
                  className="px-2 py-1.5 bg-dark-elevated border border-dark rounded text-xs text-foreground focus:outline-none focus:border-dark-2"
                >
                  <option value="all">All Strategies</option>
                  {allStrategies.map((st) => (
                    <option key={st} value={st}>{st.replace(/^core_/, "").replace(/_/g, " ")}</option>
                  ))}
                </select>
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="px-2 py-1.5 bg-dark-elevated border border-dark rounded text-xs text-foreground focus:outline-none focus:border-dark-2"
                >
                  <option value="all">All Users</option>
                  {botUsers.map((user) => (
                    <option key={user} value={user}>{user}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Advanced filters */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-[#5a7090] uppercase tracking-wider font-medium">Filters:</span>
              <select
                value={filterOwnerType}
                onChange={(e) => setFilterOwnerType(e.target.value)}
                className="px-2 py-1 bg-dark-elevated border border-dark rounded text-[11px] text-foreground focus:outline-none focus:border-dark-2"
              >
                <option value="all">All Owner Types</option>
                <option value="user">User-owned</option>
                <option value="service_account">Service Account</option>
              </select>
              <select
                value={filterPnl}
                onChange={(e) => setFilterPnl(e.target.value)}
                className="px-2 py-1 bg-dark-elevated border border-dark rounded text-[11px] text-foreground focus:outline-none focus:border-dark-2"
              >
                <option value="all">All P&L</option>
                <option value="profitable">Profitable (P&L &gt; 0)</option>
                <option value="losing">Losing (P&L &lt; 0)</option>
                <option value="breakeven">Breakeven (P&L = 0)</option>
              </select>
              <select
                value={filterEquity}
                onChange={(e) => setFilterEquity(e.target.value)}
                className="px-2 py-1 bg-dark-elevated border border-dark rounded text-[11px] text-foreground focus:outline-none focus:border-dark-2"
              >
                <option value="all">All Equity</option>
                <option value="0-1k">$0 – $1K</option>
                <option value="1k-10k">$1K – $10K</option>
                <option value="10k-50k">$10K – $50K</option>
                <option value="50k+">$50K+</option>
              </select>
              <select
                value={filterUptime}
                onChange={(e) => setFilterUptime(e.target.value)}
                className="px-2 py-1 bg-dark-elevated border border-dark rounded text-[11px] text-foreground focus:outline-none focus:border-dark-2"
              >
                <option value="all">Any Uptime</option>
                <option value="1h">1h+</option>
                <option value="24h">24h+</option>
                <option value="7d">7d+</option>
                <option value="30d">30d+</option>
              </select>
              {/* Clear all filters */}
              {(filterStatus !== "all" || filterExchange !== "all" || filterStrategy !== "all" || filterUser !== "all" || filterOwnerType !== "all" || filterPnl !== "all" || filterEquity !== "all" || filterUptime !== "all" || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterStatus("all"); setFilterExchange("all"); setFilterStrategy("all");
                    setFilterUser("all"); setFilterOwnerType("all"); setFilterPnl("all");
                    setFilterEquity("all"); setFilterUptime("all"); setSearchQuery("");
                  }}
                  className="px-2 py-1 rounded border border-[rgba(255,71,87,0.3)] bg-[rgba(255,71,87,0.06)] text-[10px] text-[#ff4757] font-medium hover:bg-[rgba(255,71,87,0.12)] transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Equity Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-2.5">
            {/* Fleet Equity Chart */}
            {botsError ? <FleetCardError label="Fleet Equity" className="lg:col-span-2" /> :
             !botsReady ? <FleetCardSkeleton label="Fleet Equity" className="lg:col-span-2" /> :
            <div className="lg:col-span-2 bg-dark-elevated border border-dark rounded-md p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-[#5a7090] uppercase tracking-wider">Fleet Equity</span>
                <span className="text-xs font-bold text-foreground font-mono">
                  ${fleetMetrics.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="h-[100px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fleetEquityCurve}>
                    <defs>
                      <linearGradient id="fleetEquityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={fleetMetrics.totalPnl >= 0 ? "#00e5a0" : "#ff4757"} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={fleetMetrics.totalPnl >= 0 ? "#00e5a0" : "#ff4757"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={["dataMin", "dataMax"]} hide />
                    <Tooltip
                      contentStyle={{ background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 6, fontSize: 11 }}
                      labelStyle={{ display: "none" }}
                      formatter={(v?: number) => [`$${(v ?? 0).toLocaleString()}`, "Equity"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={fleetMetrics.totalPnl >= 0 ? "#00e5a0" : "#ff4757"}
                      strokeWidth={1.5}
                      fill="url(#fleetEquityGrad)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>}

            {/* Fleet P&L card */}
            {botsError ? <FleetCardError label="Fleet P&L" /> :
             !botsReady ? <FleetCardSkeleton label="Fleet P&L" /> :
            <div className="bg-dark-elevated border border-dark rounded-md p-3 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-[#5a7090] uppercase tracking-wider">Fleet P&L</span>
              <div>
                <div className={cn("text-xl font-bold font-mono", fleetMetrics.totalPnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]")}>
                  {fleetMetrics.totalPnl >= 0 ? "+" : ""}${fleetMetrics.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className={cn("text-[11px] font-mono flex items-center gap-1", fleetMetrics.totalPnlPct >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]")}>
                  {fleetMetrics.totalPnlPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {fleetMetrics.totalPnlPct >= 0 ? "+" : ""}{fleetMetrics.totalPnlPct.toFixed(2)}%
                </div>
              </div>
              <div className="flex justify-between text-[10px] mt-2">
                <div>
                  <div className="text-[#5a7090]">Running</div>
                  <div className="text-foreground font-bold font-mono">{fleetMetrics.runningBots}</div>
                </div>
                <div>
                  <div className="text-[#5a7090]">Active Equity</div>
                  <div className="text-foreground font-bold font-mono">${(fleetMetrics.runningEquity / 1000).toFixed(1)}k</div>
                </div>
              </div>
            </div>}

            {/* Top Performers mini chart */}
            {botsError ? <FleetCardError label="Top Performers" /> :
             !botsReady ? <FleetCardSkeleton label="Top Performers" /> :
            <div className="bg-dark-elevated border border-dark rounded-md p-3">
              <span className="text-[10px] font-bold text-[#5a7090] uppercase tracking-wider">Top Performers</span>
              <div className="mt-1.5 space-y-1.5">
                {fleetMetrics.topPerformers.map((bot) => (
                  <div key={bot.id} className="flex items-center gap-2">
                    <div className="w-16 h-5 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={botSparklines[bot.id] || []}>
                          <Line type="monotone" dataKey="value" stroke={bot.pnl >= 0 ? "#00e5a0" : "#ff4757"} strokeWidth={1} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <span className="text-[10px] text-[#8fa3b8] truncate flex-1">{bot.name || bot.id.slice(0, 8)}</span>
                    <span className={cn("text-[10px] font-bold font-mono", bot.pnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]")}>
                      {bot.pnl >= 0 ? "+" : ""}${bot.pnl.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>}
          </div>

          {/* Bot Grid / Table */}
          {botsError ? (
            <div className="bg-dark-elevated border border-dark rounded-md p-8 text-center">
              <span className="font-mono text-[9px] text-[#ff4757] uppercase tracking-wider">Failed to load bots</span>
            </div>
          ) : !botsReady ? (
            <BotGridSkeleton count={12} />
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {bots.map((bot) => {
                const s = getStatusStyle(bot.status);
                const sparkData = botSparklines[bot.id] || [];
                const isTransitioning = bot.status === "initializing" || bot.status === "stopping";
                const isStopped = bot.status === "stopped" || bot.status === "error";
                const isPaused = bot.status === "paused";
                const isRunning = bot.status === "running" || bot.status === "circuit_broken" || bot.status === "maintenance";

                return (
                  <div
                    key={bot.id}
                    className="bg-dark-elevated border border-dark rounded-md p-3 hover:border-dark-2 transition-all group cursor-pointer"
                    onClick={() => router.push(`/dashboard/bot/${bot.id}`)}
                  >
                    {/* Header: name + status */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">{bot.name || bot.id.slice(0, 8)}</div>
                        <div className="font-mono text-[9px] text-[#5a7090]">{bot.id.slice(0, 8)}…</div>
                      </div>
                      <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0", s.bg, s.text)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />
                        {bot.status === "initializing" && bot.initStep ? "INIT" : bot.status.replace("_", " ")}
                      </span>
                    </div>

                    {/* Sparkline */}
                    <div className="h-[40px] mb-2">
                      {sparkData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={sparkData}>
                            <defs>
                              <linearGradient id={`grid-spark-${bot.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={bot.pnl >= 0 ? "#00e5a0" : "#ff4757"} stopOpacity={0.25} />
                                <stop offset="100%" stopColor={bot.pnl >= 0 ? "#00e5a0" : "#ff4757"} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area
                              type="monotone"
                              dataKey="value"
                              stroke={bot.pnl >= 0 ? "#00e5a0" : "#ff4757"}
                              strokeWidth={1.2}
                              fill={`url(#grid-spark-${bot.id})`}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-[#5a7090]">—</div>
                      )}
                    </div>

                    {/* Strategy + Exchange + Market Type */}
                    <div className="flex items-center justify-between text-[10px] mb-2">
                      <span className="text-[#8fa3b8] truncate">{bot.strategy}</span>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        {bot.marketType && bot.marketType !== "spot" && (
                          <span className="px-1 py-0.5 rounded text-[8px] font-semibold uppercase bg-[rgba(61,157,243,0.15)] text-[#3d9df3]">
                            {bot.marketType.replace("_", " ")}
                          </span>
                        )}
                        <span className="text-[#5a7090]">{bot.exchange} / <span className="text-foreground">{bot.pair}</span></span>
                      </div>
                    </div>

                    {/* P&L + Equity row */}
                    <div className="flex items-end justify-between mb-2">
                      <div>
                        <div className="text-[9px] text-[#5a7090] uppercase tracking-wider">P&L</div>
                        <div className={cn("text-sm font-bold font-mono", bot.pnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]")}>
                          {bot.pnl >= 0 ? "+" : ""}${bot.pnl.toLocaleString()}
                        </div>
                        <div className={cn("text-[10px] font-mono", bot.pnlPct >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]")}>
                          {bot.pnlPct >= 0 ? "+" : ""}{bot.pnlPct}%
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-[#5a7090] uppercase tracking-wider">Equity</div>
                        <div className="text-sm font-bold font-mono text-foreground">${bot.equity.toLocaleString()}</div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-1 text-center text-[9px] mb-2 py-1.5 border-t border-dark">
                      <div>
                        <div className="text-[#5a7090]">Open</div>
                        <div className="font-mono text-foreground font-medium">{bot.openPositions}</div>
                      </div>
                      <div>
                        <div className="text-[#5a7090]">Trades</div>
                        <div className="font-mono text-foreground font-medium">{bot.trades}</div>
                      </div>
                      <div>
                        <div className="text-[#5a7090]">Win%</div>
                        <div className="font-mono text-foreground font-medium">{bot.winRate}%</div>
                      </div>
                      <div>
                        <div className="text-[#5a7090]">Uptime</div>
                        <div className="font-mono text-foreground font-medium text-[8px]">{bot.uptime}</div>
                      </div>
                    </div>

                    {/* User + Actions */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-dark">
                      <span className="text-[10px] text-[#5a7090] truncate max-w-[80px]">{bot.user}</span>
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => router.push(`/dashboard/bot/${bot.id}`)}
                          title="Inspect"
                          className="p-1 rounded text-[#5a7090] hover:text-[#FFD700] hover:bg-[rgba(255,215,0,0.08)] transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                        </button>
                        {(isStopped || isPaused) && (
                          <button
                            onClick={() => isPaused ? handleResume(bot.id) : handleStart(bot.id)}
                            title={isPaused ? "Resume" : "Start"}
                            className="p-1 rounded text-[#5a7090] hover:text-[#00e5a0] hover:bg-[rgba(0,229,160,0.08)] transition-colors"
                          >
                            <Play className="h-3 w-3" />
                          </button>
                        )}
                        {isRunning && (
                          <button
                            onClick={() => handlePause(bot.id)}
                            title="Pause"
                            className="p-1 rounded text-[#5a7090] hover:text-[#f5a623] hover:bg-[rgba(245,166,35,0.08)] transition-colors"
                          >
                            <Pause className="h-3 w-3" />
                          </button>
                        )}
                        {(isRunning || isPaused) && (
                          <button
                            onClick={() => handleKill(bot.id)}
                            title="Stop"
                            className="p-1 rounded text-[#5a7090] hover:text-[#ff4757] hover:bg-[rgba(255,71,87,0.08)] transition-colors"
                          >
                            <Square className="h-3 w-3" />
                          </button>
                        )}
                        {isTransitioning && (
                          <span className="px-1 text-[8px] text-[#3d9df3] font-mono">
                            {bot.status === "initializing" ? "starting…" : "stopping…"}
                          </span>
                        )}
                        {isStopped && (
                          <button
                            onClick={() => handleDelete(bot.id)}
                            title="Delete"
                            className="p-1 rounded text-[#5a7090] hover:text-[#ff4757] hover:bg-[rgba(255,71,87,0.08)] transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={() => handleClone(bot)}
                          title="Clone"
                          className="p-1 rounded text-[#5a7090] hover:text-[#3d9df3] hover:bg-[rgba(61,157,243,0.08)] transition-colors"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {bots.length === 0 && (
                <div className="col-span-full text-center py-8">
                  <p className="text-xs text-[#8fa3b8]">No bots match your filters</p>
                </div>
              )}
            </div>
          ) : viewMode === "table" ? (
          <div className="border border-dark rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-dark-elevated border-b border-dark text-[10px] text-[#5a7090] uppercase tracking-wider">
                    <th className="text-left py-2 px-3 font-medium">Bot</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-center py-2 px-3 font-medium">Chart</th>
                    <th className="text-left py-2 px-3 font-medium">Strategy</th>
                    <th className="text-left py-2 px-3 font-medium">Exchange / Pair</th>
                    <th className="text-left py-2 px-3 font-medium">User</th>
                    <th className="text-right py-2 px-3 font-medium">P&L</th>
                    <th className="text-right py-2 px-3 font-medium">Equity</th>
                    <th className="text-center py-2 px-3 font-medium">Open</th>
                    <th className="text-center py-2 px-3 font-medium">Trades</th>
                    <th className="text-center py-2 px-3 font-medium">Win%</th>
                    <th className="text-right py-2 px-3 font-medium">Uptime</th>
                    <th className="text-center py-2 px-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bots.map((bot) => {
                    const s = getStatusStyle(bot.status);
                    const sparkData = botSparklines[bot.id] || [];
                    const isTransitioning = bot.status === "initializing" || bot.status === "stopping";
                    const isStopped = bot.status === "stopped" || bot.status === "error";
                    const isPaused = bot.status === "paused";
                    const isRunning = bot.status === "running" || bot.status === "circuit_broken" || bot.status === "maintenance";

                    return (
                      <tr
                        key={bot.id}
                        className="border-b border-dark hover:bg-dark-elevated transition-colors group"
                      >
                        {/* Bot name + id */}
                        <td className="py-2 px-3">
                          <div className="font-semibold text-foreground truncate max-w-[140px]">{bot.name || bot.id.slice(0, 8)}</div>
                          <div className="font-mono text-[10px] text-[#5a7090]">{bot.id.slice(0, 8)}…</div>
                        </td>
                        {/* Status */}
                        <td className="py-2 px-3">
                          <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm", s.bg, s.text)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />
                            {bot.status === "initializing" && bot.initStep
                              ? `INIT`
                              : bot.status.replace("_", " ")}
                          </span>
                        </td>
                        {/* Mini sparkline chart */}
                        <td className="py-2 px-1">
                          <div className="w-[80px] h-[28px] mx-auto">
                            {sparkData.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sparkData}>
                                  <defs>
                                    <linearGradient id={`spark-${bot.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={bot.pnl >= 0 ? "#00e5a0" : "#ff4757"} stopOpacity={0.25} />
                                      <stop offset="100%" stopColor={bot.pnl >= 0 ? "#00e5a0" : "#ff4757"} stopOpacity={0} />
                                    </linearGradient>
                                  </defs>
                                  <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke={bot.pnl >= 0 ? "#00e5a0" : "#ff4757"}
                                    strokeWidth={1.2}
                                    fill={`url(#spark-${bot.id})`}
                                    dot={false}
                                    isAnimationActive={false}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[9px] text-[#5a7090]">—</div>
                            )}
                          </div>
                        </td>
                        {/* Strategy */}
                        <td className="py-2 px-3 text-[#8fa3b8] truncate max-w-[120px]">{bot.strategy}</td>
                        {/* Exchange / Pair / Market Type */}
                        <td className="py-2 px-3">
                          <span className="text-[#8fa3b8]">{bot.exchange}</span>
                          <span className="text-[#5a7090] mx-1">/</span>
                          <span className="text-foreground font-medium">{bot.pair}</span>
                          {bot.marketType && bot.marketType !== "spot" && (
                            <span className="ml-1.5 px-1 py-0.5 rounded text-[8px] font-semibold uppercase bg-[rgba(61,157,243,0.15)] text-[#3d9df3]">
                              {bot.marketType.replace("_", " ")}
                            </span>
                          )}
                        </td>
                        {/* User */}
                        <td className="py-2 px-3 text-[#8fa3b8] truncate max-w-[100px]">{bot.user}</td>
                        {/* P&L */}
                        <td className="py-2 px-3 text-right font-mono">
                          <span className={cn("font-semibold", bot.pnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]")}>
                            {bot.pnl >= 0 ? "+" : ""}${bot.pnl.toLocaleString()}
                          </span>
                          <div className={cn("text-[10px]", bot.pnlPct >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]")}>
                            {bot.pnlPct >= 0 ? "+" : ""}{bot.pnlPct}%
                          </div>
                        </td>
                        {/* Equity */}
                        <td className="py-2 px-3 text-right font-mono text-foreground">
                          ${bot.equity.toLocaleString()}
                        </td>
                        {/* Open positions */}
                        <td className="py-2 px-3 text-center font-mono text-foreground">{bot.openPositions}</td>
                        {/* Trades */}
                        <td className="py-2 px-3 text-center font-mono text-foreground">{bot.trades}</td>
                        {/* Win rate */}
                        <td className="py-2 px-3 text-center font-mono text-foreground">{bot.winRate}%</td>
                        {/* Uptime */}
                        <td className="py-2 px-3 text-right text-[#8fa3b8] font-mono">{bot.uptime}</td>
                        {/* Actions — separate buttons */}
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-center gap-1">
                            {/* Inspect */}
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/bot/${bot.id}`); }}
                              title="Inspect"
                              className="p-1 rounded text-[#8fa3b8] hover:text-[#FFD700] hover:bg-[rgba(255,215,0,0.08)] transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>

                            {/* Start / Resume */}
                            {(isStopped || isPaused) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); isPaused ? handleResume(bot.id) : handleStart(bot.id); }}
                                title={isPaused ? "Resume" : "Start"}
                                className="p-1 rounded text-[#8fa3b8] hover:text-[#00e5a0] hover:bg-[rgba(0,229,160,0.08)] transition-colors"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Pause */}
                            {isRunning && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePause(bot.id); }}
                                title="Pause"
                                className="p-1 rounded text-[#8fa3b8] hover:text-[#f5a623] hover:bg-[rgba(245,166,35,0.08)] transition-colors"
                              >
                                <Pause className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Stop */}
                            {(isRunning || isPaused) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleKill(bot.id); }}
                                title="Stop"
                                className="p-1 rounded text-[#8fa3b8] hover:text-[#ff4757] hover:bg-[rgba(255,71,87,0.08)] transition-colors"
                              >
                                <Square className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Transitioning indicator */}
                            {isTransitioning && (
                              <span className="px-1.5 py-0.5 text-[9px] text-[#3d9df3] font-mono">
                                {bot.status === "initializing" ? "starting…" : "stopping…"}
                              </span>
                            )}

                            {/* Delete (only when stopped/error) */}
                            {isStopped && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(bot.id); }}
                                title="Delete"
                                className="p-1 rounded text-[#8fa3b8] hover:text-[#ff4757] hover:bg-[rgba(255,71,87,0.08)] transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Clone */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleClone(bot); }}
                              title="Clone"
                              className="p-1 rounded text-[#8fa3b8] hover:text-[#3d9df3] hover:bg-[rgba(61,157,243,0.08)] transition-colors"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {bots.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-[#8fa3b8]">No bots match your filters</p>
              </div>
            )}
          </div>
          ) : null}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#5a7090]">Per page</span>
                <select
                  value={perPage}
                  onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                  className="px-1.5 py-1 bg-dark-elevated border border-dark rounded text-[10px] text-foreground focus:outline-none"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-[10px] text-[#5a7090]">{totalCount} total</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1 rounded border border-dark bg-dark-elevated text-[#8fa3b8] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] text-[#8fa3b8] font-mono px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1 rounded border border-dark bg-dark-elevated text-[#8fa3b8] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Alerts Sidebar */}
      {alertsOpen && (
        <div className="w-72 border-l border-dark flex flex-col bg-card shrink-0">
          <div className="px-3 py-2 border-b border-dark flex justify-between items-center">
            <span className="text-[10px] font-bold text-[#8fa3b8] uppercase tracking-wider">Alerts</span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 text-[9px] font-mono">
                <span className="text-[#ff4757]">{alerts.filter((a) => a.sev === "critical" && !a.acked).length} CRIT</span>
                <span className="text-[#f5a623]">{alerts.filter((a) => a.sev === "warning" && !a.acked).length} WARN</span>
              </div>
              <button
                onClick={() => setAlertsOpen(false)}
                className="text-[#5a7090] hover:text-foreground transition-colors text-xs"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {alertsError ? (
              <div className="flex items-center justify-center py-8">
                <span className="font-mono text-[9px] text-[#ff4757] uppercase tracking-wider">Failed to load alerts</span>
              </div>
            ) : !alertsReady ? (
              <div className="space-y-0">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-3 py-2 border-b border-dark flex gap-2 items-start">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1a2230] animate-pulse flex-shrink-0 mt-1" />
                    <div className="flex-1 space-y-1.5">
                      <div className="w-3/4 h-3 bg-[#1a2230] rounded animate-pulse" />
                      <div className="w-1/3 h-2 bg-[#1a2230] rounded animate-pulse" style={{ animationDelay: "0.3s" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "px-3 py-2 border-b border-dark flex gap-2 items-start transition-all hover:bg-dark-elevated",
                  alert.acked && "opacity-40"
                )}
              >
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1",
                    alert.sev === "critical" && "bg-[#ff4757] shadow-[0_0_6px_#ff4757]",
                    alert.sev === "warning" && "bg-[#f5a623]",
                    alert.sev === "info" && "bg-blue-500"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-foreground leading-tight">{alert.msg}</div>
                  <div className="text-[9px] text-[#5a7090] font-mono mt-0.5">{alert.time}</div>
                </div>
                {!alert.acked && (
                  <button
                    onClick={() => handleAck(alert.id)}
                    className="text-[9px] text-[#5a7090] px-1.5 py-0.5 border border-dark rounded hover:text-[#FFD700] hover:border-[#FFD700] transition-colors flex-shrink-0"
                  >
                    ACK
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kill Modal */}

      {killModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-dark rounded-lg p-6 w-96 space-y-4">
            <h3 className="text-sm font-bold text-foreground">Confirm Bot Termination</h3>
            <p className="text-xs text-[#8fa3b8] leading-relaxed">
              Are you sure you want to stop bot <span className="font-mono text-foreground">{killModal}</span>?
              This will close all open positions and stop the bot immediately.
            </p>
            <textarea
              placeholder="Reason for termination (optional)..."
              className="w-full bg-dark-elevated border border-dark rounded text-xs text-foreground p-2.5 resize-none focus:outline-none focus:border-dark-2 placeholder:text-[#5a7090]"
              rows={3}
            />
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setKillModal(null)}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmKill}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-[#ff4757] text-white hover:bg-[#ff2233] transition-all"
              >
                Stop Bot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-dark rounded-lg p-6 w-96 space-y-4">
            <h3 className="text-sm font-bold text-[#ff4757]">Delete Bot Permanently</h3>
            <p className="text-xs text-[#8fa3b8] leading-relaxed">
              This will permanently delete bot <span className="font-mono text-foreground">{deleteModal}</span> and all its associated data.
              This action cannot be undone.
            </p>
            <div className="px-3 py-2 bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded text-[10px] text-[#ff4757]">
              The bot must be stopped before it can be deleted.
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-[#ff4757] text-white hover:bg-[#ff2233] transition-all"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      {cloneBot && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-dark rounded-lg p-6 w-[420px] space-y-4">
            <h3 className="text-sm font-bold text-foreground">Clone Bot</h3>
            <p className="text-xs text-[#8fa3b8] leading-relaxed">
              Deploy copies of <span className="font-mono text-foreground">{cloneBot.name}</span> with the same parameters. Each clone gets a randomized name suffix.
            </p>

            {/* Source bot summary */}
            <div className="border border-dark rounded-md divide-y divide-[#1e2d40] text-[10px]">
              <div className="px-3 py-1.5 flex justify-between">
                <span className="text-[#5a7090]">Strategy</span>
                <span className="text-foreground font-mono">{cloneBot.strategy || "—"}</span>
              </div>
              <div className="px-3 py-1.5 flex justify-between">
                <span className="text-[#5a7090]">Pair</span>
                <span className="text-foreground font-mono">{cloneBot.pair || "—"}</span>
              </div>
              <div className="px-3 py-1.5 flex justify-between">
                <span className="text-[#5a7090]">Exchange</span>
                <span className="text-foreground font-mono">{cloneBot.exchange || "—"}</span>
              </div>
              <div className="px-3 py-1.5 flex justify-between">
                <span className="text-[#5a7090]">Capital</span>
                <span className="text-foreground font-mono">{cloneBot.allocatedCapital ? `$${cloneBot.allocatedCapital.toLocaleString()}` : "—"}</span>
              </div>
            </div>

            {/* Clone count */}
            <div>
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
                Number of Clones
              </label>
              <input
                value={cloneCount}
                onChange={(e) => setCloneCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                type="number"
                min={1}
                max={20}
                disabled={cloneSubmitting}
                className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2 disabled:opacity-50"
              />
              {cloneBot.allocatedCapital > 0 && cloneCount > 1 && (
                <p className="text-[9px] text-[#5a7090] mt-1">
                  Total capital: <span className="text-foreground font-mono">${(cloneBot.allocatedCapital * cloneCount).toLocaleString()}</span> ({cloneCount} x ${cloneBot.allocatedCapital.toLocaleString()})
                </p>
              )}
            </div>

            {/* Progress */}
            {cloneSubmitting && cloneProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#8fa3b8]">Deploying clones...</span>
                  <span className="text-foreground font-mono">{cloneProgress.done}/{cloneProgress.total}</span>
                </div>
                <div className="w-full h-1.5 bg-[#1e2d40] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3d9df3] rounded-full transition-all duration-300"
                    style={{ width: `${(cloneProgress.done / cloneProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Results */}
            {!cloneSubmitting && cloneProgress && cloneProgress.done === cloneProgress.total && cloneProgress.errors.length > 0 && cloneProgress.errors.length < cloneProgress.total && (
              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                <p className="text-[10px] text-[#8fa3b8]">{cloneProgress.total - cloneProgress.errors.length} succeeded, {cloneProgress.errors.length} failed:</p>
                {cloneProgress.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px]">
                    <AlertCircle className="h-3 w-3 text-[#ff4757] shrink-0 mt-0.5" />
                    <span className="text-[#ff4757]">{err}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {cloneError && (
              <div className="text-[10px] text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2 whitespace-pre-line">
                {cloneError}
              </div>
            )}

            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setCloneBot(null)}
                disabled={cloneSubmitting}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all disabled:opacity-50"
              >
                {cloneProgress && cloneProgress.done === cloneProgress.total && cloneProgress.errors.length === 0 ? "Done" : "Cancel"}
              </button>
              <button
                onClick={confirmClone}
                disabled={cloneSubmitting || cloneCount < 1 || cloneCount > 20}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-[#3d9df3] text-white hover:bg-[#2b8ae0] transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {cloneSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                {cloneSubmitting
                  ? `Cloning ${cloneProgress?.done ?? 0}/${cloneProgress?.total ?? cloneCount}...`
                  : `Clone ${cloneCount} Bot${cloneCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
