"use client";

import { useState, useMemo } from "react";
import { updateStrategy } from "@/lib/tradingEngineApi";
import type { Strategy, StrategyType, StrategyStatus } from "@/lib/types/strategy";
import { StrategyCard } from "@/components/dashboard/strategy-card";
import { StrategyDetailPanel } from "@/components/dashboard/strategy-detail-panel";
import { CreateStrategyModal } from "@/components/dashboard/create-strategy-modal";
import { RunBacktestModal } from "@/components/backtesting/run-backtest-modal";
import { StrategyGridSkeleton } from "@/components/ui/skeleton";
import type { BacktestRun } from "@/lib/types/backtest";
import { Search } from "lucide-react";
import { useStrategies } from "@/hooks/useQueries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";

export default function StrategiesPage() {
  const queryClient = useQueryClient();
  const { data: strategies = [], isLoading: loading } = useStrategies();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [backtestModalOpen, setBacktestModalOpen] = useState(false);
  const [backtestStrategyId, setBacktestStrategyId] = useState<string | undefined>();

  // Optimistic status change
  const handleStatusChange = async (id: string, newStatus: StrategyStatus) => {
    const prev = strategies;
    // Optimistic update in cache
    queryClient.setQueryData(queryKeys.strategies(), (old: Strategy[] | undefined) =>
      (old ?? []).map((st) => st.id === id ? { ...st, status: newStatus } : st)
    );

    try {
      const result = await updateStrategy(id, { status: newStatus });
      if (result.error) {
        queryClient.setQueryData(queryKeys.strategies(), prev); // revert
      } else if (result.data) {
        queryClient.setQueryData(queryKeys.strategies(), (old: Strategy[] | undefined) =>
          (old ?? []).map((st) => st.id === id ? (result.data as Strategy) : st)
        );
      }
    } catch {
      queryClient.setQueryData(queryKeys.strategies(), prev); // revert
    }
  };

  const handleCreated = (newStrategy: Strategy) => {
    queryClient.setQueryData(queryKeys.strategies(), (old: Strategy[] | undefined) =>
      [newStrategy, ...(old ?? [])]
    );
  };

  const handleUpdate = (updated: Strategy) => {
    queryClient.setQueryData(queryKeys.strategies(), (old: Strategy[] | undefined) =>
      (old ?? []).map((s) => s.id === updated.id ? updated : s)
    );
  };

  // Client-side filtering (memoized)
  const filteredStrategies = useMemo(() => strategies.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.description || "").toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q);
    const matchesType = filterType === "all" || s.type === filterType;
    const matchesStatus = filterStatus === "all" || s.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  }), [strategies, searchQuery, filterType, filterStatus]);

  const selectedStrategy = selectedStrategyId
    ? strategies.find((s) => s.id === selectedStrategyId) || null
    : null;

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            <StrategyGridSkeleton count={6} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#FFD700]">Strategies</span>
          </div>

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Strategies</h1>
              <p className="text-xs sm:text-sm text-[#8fa3b8]">
                Manage trading strategies ({filteredStrategies.length} of {strategies.length} shown)
              </p>
            </div>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2 rounded bg-[#FFD700] text-black text-xs font-bold uppercase tracking-wider hover:bg-[#FFE44D] transition-all whitespace-nowrap"
            >
              + Create Strategy
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8fa3b8]" />
              <input
                type="text"
                placeholder="Search by name, description, or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-elevated border border-dark rounded text-sm text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
              />
            </div>

            <div className="flex gap-2 sm:gap-3">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="flex-1 sm:flex-none px-3 py-2 bg-dark-elevated border border-dark rounded text-sm text-foreground focus:outline-none focus:border-dark-2"
              >
                <option value="all">All Types</option>
                <option value="core_momentum">Momentum</option>
                <option value="core_grid">Grid</option>
                <option value="core_dca">DCA</option>
                <option value="core_mean_reversion">Mean Reversion</option>
                <option value="core_trend_following">Trend Following</option>
                <option value="core_arbitrage">Arbitrage</option>
                <option value="custom_rule_based">Custom Rule Based</option>
                <option value="custom_config">Custom Config</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 sm:flex-none px-3 py-2 bg-dark-elevated border border-dark rounded text-sm text-foreground focus:outline-none focus:border-dark-2"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="backtesting">Backtesting</option>
                <option value="validated">Validated</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Strategy Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredStrategies.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                selected={selectedStrategyId === strategy.id}
                onSelect={(id) => setSelectedStrategyId(id === selectedStrategyId ? null : id)}
                onStatusChange={handleStatusChange}
                onBacktest={(id) => { setBacktestStrategyId(id); setBacktestModalOpen(true); }}
              />
            ))}
          </div>

          {filteredStrategies.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[#8fa3b8]">
                {strategies.length === 0
                  ? "No strategies found. Create one to get started."
                  : "No strategies match your filters"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedStrategy && (
        <StrategyDetailPanel
          key={selectedStrategy.id}
          strategy={selectedStrategy}
          onClose={() => setSelectedStrategyId(null)}
          onUpdate={handleUpdate}
        />
      )}

      {/* Create Modal */}
      <CreateStrategyModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleCreated}
      />

      {/* Backtest Modal */}
      <RunBacktestModal
        open={backtestModalOpen}
        onClose={() => { setBacktestModalOpen(false); setBacktestStrategyId(undefined); }}
        onCreated={() => { setBacktestModalOpen(false); setBacktestStrategyId(undefined); }}
        preselectedStrategyId={backtestStrategyId}
      />
    </div>
  );
}
