"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBacktest, cancelBacktest, listStrategies } from "@/lib/tradingEngineApi";
import type { BacktestRun } from "@/lib/types/backtest";
import type { Strategy } from "@/lib/types/strategy";
import { cn } from "@/lib/utils";
import { ArrowLeft, XCircle, RefreshCw } from "lucide-react";

export default function BacktestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<BacktestRun | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tradeLogPage, setTradeLogPage] = useState(0);
  const tradesPerPage = 25;

  const loadData = useCallback(async () => {
    try {
      const result = await getBacktest(id);
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        const r = result.data as BacktestRun;
        setRun(r);

        // Load strategy name
        const strats = await listStrategies();
        if (strats.data && Array.isArray(strats.data)) {
          const s = (strats.data as Strategy[]).find((s) => s.id === r.strategy_id);
          if (s) setStrategy(s);
        }
      }
    } catch {
      setError("Failed to load backtest");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh while running
  useEffect(() => {
    if (!run || (run.status !== "running" && run.status !== "queued")) return;
    const interval = setInterval(loadData, 5_000);
    return () => clearInterval(interval);
  }, [run?.status, loadData]);

  const handleCancel = async () => {
    if (!run) return;
    await cancelBacktest(run.id);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="h-6 bg-dark-elevated rounded animate-pulse w-64" />
          <div className="h-80 bg-dark-elevated rounded animate-pulse" />
          <div className="h-48 bg-dark-elevated rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto text-center py-16">
          <p className="text-sm text-[#ff4757] mb-4">{error || "Backtest not found"}</p>
          <Link href="/backtesting" className="text-xs text-[#00e5a0] hover:underline">
            Back to Backtesting
          </Link>
        </div>
      </div>
    );
  }

  const isActive = run.status === "running" || run.status === "queued";
  const isCompleted = run.status === "completed";
  const trades = run.trade_log || [];
  const pagedTrades = trades.slice(tradeLogPage * tradesPerPage, (tradeLogPage + 1) * tradesPerPage);
  const totalTradePages = Math.ceil(trades.length / tradesPerPage);

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs">
          <Link href="/backtesting" className="text-[#5a7090] hover:text-foreground transition-colors">Backtesting</Link>
          <span className="text-[#5a7090]">/</span>
          <span className="text-[#00e5a0]">{run.trading_pair} {run.timeframe}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/backtesting")} className="text-[#5a7090] hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground">
                {strategy?.name || "Backtest"} — {run.trading_pair}
              </h1>
              <p className="text-xs text-[#8fa3b8] font-mono">
                {run.timeframe} &middot; {run.exchange_code} &middot; {new Date(run.start_date).toLocaleDateString()} — {new Date(run.end_date).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <button onClick={handleCancel} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#ff4757] text-[#ff4757] text-xs font-bold uppercase tracking-wider hover:bg-[rgba(255,71,87,0.1)] transition-all">
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
            <StatusBadge status={run.status} />
          </div>
        </div>

        {/* Progress bar for active runs */}
        {isActive && (
          <div className="bg-dark-elevated border border-dark rounded-md p-4 space-y-2">
            <div className="h-2 bg-[#1a2230] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#f5a623] transition-all duration-500"
                style={{ width: `${Math.min(run.progress_pct || 0, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[#8fa3b8] font-mono">
              <span>{(run.progress_pct || 0).toFixed(0)}% &middot; {run.candles_processed} candles processed</span>
              <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Auto-refreshing</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {run.status === "failed" && run.error_message && (
          <div className="bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-md p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#ff4757] mb-1">Error</p>
            <p className="text-xs text-[#ff4757]">{run.error_message}</p>
          </div>
        )}

        {/* Metrics Grid */}
        {isCompleted && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <MetricCard
              label="Return"
              value={run.total_return_pct != null ? `${run.total_return_pct >= 0 ? "+" : ""}${run.total_return_pct.toFixed(2)}%` : "—"}
              color={run.total_return_pct != null && run.total_return_pct >= 0 ? "#00e5a0" : "#ff4757"}
            />
            <MetricCard label="Sharpe" value={run.sharpe_ratio?.toFixed(2) ?? "—"} />
            <MetricCard label="Sortino" value={run.sortino_ratio?.toFixed(2) ?? "—"} />
            <MetricCard label="Calmar" value={run.calmar_ratio?.toFixed(2) ?? "—"} />
            <MetricCard label="Max DD" value={run.max_drawdown_pct != null ? `-${run.max_drawdown_pct.toFixed(2)}%` : "—"} color="#ff4757" />
            <MetricCard label="Win Rate" value={run.win_rate != null ? `${(run.win_rate * 100).toFixed(1)}%` : "—"} />
            <MetricCard label="Profit Factor" value={run.profit_factor?.toFixed(2) ?? "—"} />
            <MetricCard label="Trades" value={run.total_trades?.toString() ?? "—"} />
          </div>
        )}

        {/* Equity Curve + Extended Metrics side by side */}
        {isCompleted && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Equity Curve */}
            <div className="lg:col-span-2 bg-dark-elevated border border-dark rounded-md p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8fa3b8] mb-3">Equity Curve</h3>
              {run.equity_curve && run.equity_curve.length > 0 ? (
                <EquityCurveChart data={run.equity_curve} initialCapital={Number(run.initial_capital_usd)} />
              ) : (
                <div className="h-48 flex items-center justify-center text-xs text-[#5a7090]">No equity curve data</div>
              )}
            </div>

            {/* Extended Metrics */}
            <div className="bg-dark-elevated border border-dark rounded-md p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8fa3b8] mb-3">Details</h3>
              <DetailRow label="Initial Capital" value={`$${Number(run.initial_capital_usd).toLocaleString()}`} />
              <DetailRow label="Final Capital" value={run.final_capital_usd != null ? `$${Number(run.final_capital_usd).toLocaleString()}` : "—"} />
              <DetailRow label="Winning Trades" value={run.winning_trades?.toString() ?? "—"} color="#00e5a0" />
              <DetailRow label="Losing Trades" value={run.losing_trades?.toString() ?? "—"} color="#ff4757" />
              <DetailRow label="Avg Win" value={run.avg_win_pct != null ? `+${run.avg_win_pct.toFixed(2)}%` : "—"} color="#00e5a0" />
              <DetailRow label="Avg Loss" value={run.avg_loss_pct != null ? `${run.avg_loss_pct.toFixed(2)}%` : "—"} color="#ff4757" />
              <DetailRow label="Largest Win" value={run.largest_win_usd != null ? `$${Number(run.largest_win_usd).toFixed(2)}` : "—"} color="#00e5a0" />
              <DetailRow label="Largest Loss" value={run.largest_loss_usd != null ? `$${Number(run.largest_loss_usd).toFixed(2)}` : "—"} color="#ff4757" />
              <DetailRow label="Avg Hold" value={run.avg_hold_duration_sec != null ? formatDuration(run.avg_hold_duration_sec * 1000) : "—"} />
              <DetailRow label="Execution Time" value={run.execution_time_ms != null ? `${(run.execution_time_ms / 1000).toFixed(1)}s` : "—"} />
              <DetailRow label="Candles" value={run.candles_processed.toString()} />
            </div>
          </div>
        )}

        {/* Trade Log */}
        {isCompleted && trades.length > 0 && (
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-dark flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8fa3b8]">
                Trade Log ({trades.length} trades)
              </h3>
              {totalTradePages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTradeLogPage(Math.max(0, tradeLogPage - 1))}
                    disabled={tradeLogPage === 0}
                    className="px-2 py-1 rounded text-[10px] bg-dark border border-dark text-[#8fa3b8] hover:text-foreground disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <span className="text-[10px] text-[#5a7090] font-mono">
                    {tradeLogPage + 1} / {totalTradePages}
                  </span>
                  <button
                    onClick={() => setTradeLogPage(Math.min(totalTradePages - 1, tradeLogPage + 1))}
                    disabled={tradeLogPage >= totalTradePages - 1}
                    className="px-2 py-1 rounded text-[10px] bg-dark border border-dark text-[#8fa3b8] hover:text-foreground disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark">
                    <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">#</th>
                    {Object.keys(pagedTrades[0] || {}).slice(0, 8).map((col) => (
                      <th key={col} className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">
                        {col.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedTrades.map((trade, i) => {
                    const cols = Object.entries(trade).slice(0, 8);
                    return (
                      <tr key={i} className="border-b border-dark/30">
                        <td className="px-3 py-2 text-[10px] text-[#5a7090] font-mono">{tradeLogPage * tradesPerPage + i + 1}</td>
                        {cols.map(([key, val]) => (
                          <td key={key} className="px-3 py-2 text-xs text-[#8fa3b8] font-mono whitespace-nowrap">
                            {formatTradeValue(key, val)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Config Snapshot */}
        {run.config_snapshot && Object.keys(run.config_snapshot).length > 0 && (
          <div className="bg-dark-elevated border border-dark rounded-md p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8fa3b8] mb-3">Config Snapshot</h3>
            <pre className="text-[10px] text-[#5a7090] font-mono overflow-x-auto">
              {JSON.stringify(run.config_snapshot, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]",
    running: "bg-[rgba(245,166,35,0.12)] text-[#f5a623]",
    completed: "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]",
    failed: "bg-[rgba(255,71,87,0.12)] text-[#ff4757]",
    cancelled: "bg-[rgba(90,112,144,0.12)] text-[#5a7090]",
  };
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm", styles[status] || styles.cancelled)}>
      {status}
    </span>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-dark-elevated border border-dark rounded-md p-3 text-center">
      <p className="text-[9px] font-bold uppercase tracking-wider text-[#5a7090] mb-1">{label}</p>
      <p className="text-sm font-bold font-mono" style={{ color: color || "#e0e8f0" }}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[#5a7090]">{label}</span>
      <span className="text-xs font-mono font-semibold" style={{ color: color || "#8fa3b8" }}>{value}</span>
    </div>
  );
}

function EquityCurveChart({ data, initialCapital }: { data: { time: string; equity: number }[]; initialCapital: number }) {
  // Simple SVG sparkline
  if (data.length < 2) return <div className="h-48 flex items-center justify-center text-xs text-[#5a7090]">Not enough data</div>;

  const values = data.map((d) => d.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 800;
  const h = 200;
  const padding = 8;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (w - padding * 2);
    const y = h - padding - ((v - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  // Gradient fill
  const firstPoint = `${padding},${h - padding}`;
  const lastPoint = `${padding + ((values.length - 1) / (values.length - 1)) * (w - padding * 2)},${h - padding}`;
  const fillPoints = `${firstPoint} ${points} ${lastPoint}`;

  const finalEquity = values[values.length - 1];
  const isPositive = finalEquity >= initialCapital;
  const strokeColor = isPositive ? "#00e5a0" : "#ff4757";
  const fillColor = isPositive ? "rgba(0,229,160,0.08)" : "rgba(255,71,87,0.08)";

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48" preserveAspectRatio="none">
        <polygon points={fillPoints} fill={fillColor} />
        <polyline points={points} fill="none" stroke={strokeColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute top-2 left-2 text-[10px] font-mono text-[#5a7090]">
        ${max.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <div className="absolute bottom-2 left-2 text-[10px] font-mono text-[#5a7090]">
        ${min.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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

function formatTradeValue(key: string, val: any): string {
  if (val == null) return "—";
  if (typeof val === "number") {
    if (key.toLowerCase().includes("pct") || key.toLowerCase().includes("return")) {
      return `${val >= 0 ? "+" : ""}${val.toFixed(4)}%`;
    }
    if (key.toLowerCase().includes("price") || key.toLowerCase().includes("pnl") || key.toLowerCase().includes("usd")) {
      return `$${val.toFixed(2)}`;
    }
    return val.toFixed(4);
  }
  return String(val);
}
