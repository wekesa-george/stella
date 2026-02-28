"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { listBacktests, cancelBacktest, listStrategies } from "@/lib/tradingEngineApi";
import type { BacktestRun, BacktestStatus } from "@/lib/types/backtest";
import type { Strategy } from "@/lib/types/strategy";
import { RunBacktestModal } from "@/components/backtesting/run-backtest-modal";
import { Search, RefreshCw, FlaskConical, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<BacktestStatus, { text: string; bg: string }> = {
  queued:    { text: "text-[#3d9df3]", bg: "bg-[rgba(61,157,243,0.12)]" },
  running:   { text: "text-[#f5a623]", bg: "bg-[rgba(245,166,35,0.12)]" },
  completed: { text: "text-[#00e5a0]", bg: "bg-[rgba(0,229,160,0.12)]" },
  failed:    { text: "text-[#ff4757]", bg: "bg-[rgba(255,71,87,0.12)]" },
  cancelled: { text: "text-[#5a7090]", bg: "bg-[rgba(90,112,144,0.12)]" },
};

export default function BacktestingPage() {
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [runsResult, strategiesResult] = await Promise.all([
        listBacktests(),
        listStrategies(),
      ]);
      if (runsResult.data && Array.isArray(runsResult.data)) {
        setRuns(runsResult.data as BacktestRun[]);
      }
      if (strategiesResult.data && Array.isArray(strategiesResult.data)) {
        setStrategies(strategiesResult.data as Strategy[]);
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 10s if there are active runs
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === "running" || r.status === "queued");
    if (!hasActive) return;
    const interval = setInterval(() => loadData(), 10_000);
    return () => clearInterval(interval);
  }, [runs, loadData]);

  const handleCancel = async (id: string) => {
    const prev = runs;
    setRuns((r) => r.map((run) => run.id === id ? { ...run, status: "cancelled" as BacktestStatus } : run));
    try {
      const result = await cancelBacktest(id);
      if (result.error) setRuns(prev);
    } catch {
      setRuns(prev);
    }
  };

  const handleCreated = (run: BacktestRun) => {
    setRuns((prev) => [run, ...prev]);
  };

  const getStrategyName = (strategyId: string) => {
    return strategies.find((s) => s.id === strategyId)?.name || "Unknown";
  };

  const getStrategyType = (strategyId: string) => {
    return strategies.find((s) => s.id === strategyId)?.type || "";
  };

  // Filter & search
  const filtered = runs.filter((r) => {
    const matchesStatus = filterStatus === "all" || r.status === filterStatus;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      r.trading_pair.toLowerCase().includes(q) ||
      getStrategyName(r.strategy_id).toLowerCase().includes(q) ||
      r.timeframe.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  // Separate active (queued/running) from rest
  const activeRuns = filtered.filter((r) => r.status === "running" || r.status === "queued");
  const pastRuns = filtered.filter((r) => r.status !== "running" && r.status !== "queued");

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="h-8 bg-dark-elevated rounded animate-pulse w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2].map((i) => <div key={i} className="h-28 bg-dark-elevated rounded animate-pulse" />)}
          </div>
          <div className="h-64 bg-dark-elevated rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#00e5a0]">Backtesting</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Backtesting</h1>
            <p className="text-xs sm:text-sm text-[#8fa3b8]">
              {runs.length} total runs &middot; {activeRuns.length} active
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="p-2 rounded border border-dark bg-dark-elevated text-[#8fa3b8] hover:text-foreground hover:border-dark-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 rounded bg-[#00e5a0] text-black text-xs font-bold uppercase tracking-wider hover:bg-[#00ffb2] transition-all"
            >
              + New Backtest
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8fa3b8]" />
            <input
              type="text"
              placeholder="Search by pair, strategy, or timeframe..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-dark-elevated border border-dark rounded text-sm text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-dark-elevated border border-dark rounded text-sm text-foreground focus:outline-none focus:border-dark-2"
          >
            <option value="all">All Status</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Active Runs */}
        {activeRuns.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#8fa3b8]">Active Runs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeRuns.map((run) => (
                <ActiveRunCard
                  key={run.id}
                  run={run}
                  strategyName={getStrategyName(run.strategy_id)}
                  onCancel={handleCancel}
                />
              ))}
            </div>
          </div>
        )}

        {/* Past Runs Table */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#8fa3b8]">
            {activeRuns.length > 0 ? "History" : "Backtest Runs"}
          </h2>

          {pastRuns.length === 0 && activeRuns.length === 0 ? (
            <div className="text-center py-16 bg-dark-elevated border border-dark rounded-md">
              <FlaskConical className="h-10 w-10 text-[#5a7090] mx-auto mb-3" />
              <p className="text-sm text-[#8fa3b8] mb-1">No backtests yet</p>
              <p className="text-xs text-[#5a7090] mb-4">Run your first backtest to see results here</p>
              <button
                onClick={() => setModalOpen(true)}
                className="px-4 py-2 rounded bg-[#00e5a0] text-black text-xs font-bold uppercase tracking-wider hover:bg-[#00ffb2] transition-all"
              >
                + New Backtest
              </button>
            </div>
          ) : pastRuns.length === 0 ? null : (
            <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark">
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Strategy</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Pair</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">TF</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Return</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Sharpe</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Max DD</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Win Rate</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Trades</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Status</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastRuns.map((run) => {
                      const style = STATUS_STYLES[run.status] || STATUS_STYLES.cancelled;
                      return (
                        <Link
                          key={run.id}
                          href={`/backtesting/${run.id}`}
                          className="contents"
                        >
                          <tr className="border-b border-dark/50 hover:bg-[rgba(0,229,160,0.03)] cursor-pointer transition-colors">
                            <td className="px-3 py-2.5 text-xs text-foreground font-medium">
                              {getStrategyName(run.strategy_id)}
                              <span className="block text-[10px] text-[#5a7090] font-mono">
                                {getStrategyType(run.strategy_id).replace("core_", "").replace("custom_", "")}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-foreground font-mono">{run.trading_pair}</td>
                            <td className="px-3 py-2.5 text-xs text-[#8fa3b8] font-mono">{run.timeframe}</td>
                            <td className={cn(
                              "px-3 py-2.5 text-xs font-mono text-right font-semibold",
                              run.total_return_pct != null && run.total_return_pct >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"
                            )}>
                              {run.total_return_pct != null ? `${run.total_return_pct >= 0 ? "+" : ""}${run.total_return_pct.toFixed(2)}%` : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-[#8fa3b8] font-mono text-right">
                              {run.sharpe_ratio != null ? run.sharpe_ratio.toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-[#ff4757] font-mono text-right">
                              {run.max_drawdown_pct != null ? `-${run.max_drawdown_pct.toFixed(2)}%` : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-[#8fa3b8] font-mono text-right">
                              {run.win_rate != null ? `${(run.win_rate * 100).toFixed(1)}%` : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-[#8fa3b8] font-mono text-right">
                              {run.total_trades ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm", style.bg, style.text)}>
                                {run.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-[#5a7090] text-right whitespace-nowrap">
                              {new Date(run.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        </Link>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <RunBacktestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ============================================================================
// Active Run Card
// ============================================================================

function ActiveRunCard({
  run,
  strategyName,
  onCancel,
}: {
  run: BacktestRun;
  strategyName: string;
  onCancel: (id: string) => void;
}) {
  const isRunning = run.status === "running";
  const progress = run.progress_pct || 0;

  const elapsed = run.started_at
    ? formatDuration(Date.now() - new Date(run.started_at).getTime())
    : "—";

  return (
    <div className="bg-dark-elevated border border-dark rounded-md p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm bg-[rgba(245,166,35,0.12)] text-[#f5a623] uppercase">
            {run.trading_pair} {run.timeframe}
          </span>
          <span className="text-xs font-medium text-foreground">{strategyName}</span>
        </div>
        <button
          onClick={() => onCancel(run.id)}
          className="text-[#5a7090] hover:text-[#ff4757] transition-colors"
          title="Cancel"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-1.5 bg-[#1a2230] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isRunning ? "bg-[#f5a623]" : "bg-[#3d9df3]"
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#8fa3b8] font-mono">
            {isRunning ? `${progress.toFixed(0)}%` : "Queued"} &middot; {run.candles_processed} candles
          </span>
          <span className="text-[#5a7090] font-mono">{elapsed}</span>
        </div>
      </div>

      {/* Date range */}
      <div className="text-[10px] text-[#5a7090] font-mono">
        {new Date(run.start_date).toLocaleDateString()} — {new Date(run.end_date).toLocaleDateString()}
        <span className="ml-2">${Number(run.initial_capital_usd).toLocaleString()}</span>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (hr > 0) return `${hr}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}
