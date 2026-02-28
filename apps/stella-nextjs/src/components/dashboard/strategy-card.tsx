import { cn } from "@/lib/utils";
import { FlaskConical } from "lucide-react";
import type { Strategy, StrategyType, StrategyStatus } from "@/lib/types/strategy";

interface StrategyCardProps {
  strategy: Strategy;
  selected?: boolean;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: StrategyStatus) => void;
  onBacktest?: (id: string) => void;
}

const TYPE_COLORS: Record<StrategyType, { text: string; bg: string }> = {
  core_momentum:       { text: "text-[#00e5a0]", bg: "bg-[rgba(0,229,160,0.12)]" },
  core_grid:           { text: "text-[#3d9df3]", bg: "bg-[rgba(61,157,243,0.12)]" },
  core_dca:            { text: "text-[#f5a623]", bg: "bg-[rgba(245,166,35,0.12)]" },
  core_mean_reversion: { text: "text-[#a855f7]", bg: "bg-[rgba(168,85,247,0.12)]" },
  core_trend_following:{ text: "text-[#ec4899]", bg: "bg-[rgba(236,72,153,0.12)]" },
  core_arbitrage:      { text: "text-[#06b6d4]", bg: "bg-[rgba(6,182,212,0.12)]" },
  custom_rule_based:   { text: "text-[#8b5cf6]", bg: "bg-[rgba(139,92,246,0.12)]" },
  custom_config:       { text: "text-[#5a7090]", bg: "bg-[rgba(90,112,144,0.12)]" },
};

const STATUS_COLORS: Record<StrategyStatus, { text: string; bg: string }> = {
  active:      { text: "text-[#00e5a0]", bg: "bg-[rgba(0,229,160,0.12)]" },
  draft:       { text: "text-[#3d9df3]", bg: "bg-[rgba(61,157,243,0.12)]" },
  backtesting: { text: "text-[#f5a623]", bg: "bg-[rgba(245,166,35,0.12)]" },
  validated:   { text: "text-[#00e5a0]", bg: "bg-[rgba(0,229,160,0.12)]" },
  paused:      { text: "text-[#f5a623]", bg: "bg-[rgba(245,166,35,0.12)]" },
  archived:    { text: "text-[#5a7090]", bg: "bg-[rgba(90,112,144,0.12)]" },
};

const STATUS_BORDER: Record<StrategyStatus, string> = {
  active:      "border-[#00e5a0]",
  draft:       "border-dark",
  backtesting: "border-[#f5a623]",
  validated:   "border-[#00e5a0]",
  paused:      "border-[#f5a623]",
  archived:    "border-dark",
};

export function StrategyCard({ strategy, selected, onSelect, onStatusChange, onBacktest }: StrategyCardProps) {
  const typeColor = TYPE_COLORS[strategy.type] || TYPE_COLORS.custom_config;
  const statusColor = STATUS_COLORS[strategy.status] || STATUS_COLORS.draft;
  const borderColor = STATUS_BORDER[strategy.status] || "border-dark";

  const pairs = Array.isArray(strategy.supported_pairs) ? strategy.supported_pairs : [];
  const visiblePairs = pairs.slice(0, 3);
  const extraPairs = pairs.length - 3;

  return (
    <div
      onClick={() => onSelect(strategy.id)}
      className={cn(
        "bg-dark-elevated border rounded-md p-3.5 flex flex-col gap-2.5 cursor-pointer transition-all relative overflow-hidden",
        "hover:border-dark-2",
        selected ? "border-[#00e5a0]" : borderColor
      )}
    >
      {/* Type + Status badges */}
      <div className="flex items-center justify-between">
        <span className={cn("text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm", typeColor.bg, typeColor.text)}>
          {strategy.type.replace("core_", "").replace("custom_", "")}
        </span>
        <span className={cn("text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm", statusColor.bg, statusColor.text)}>
          {strategy.status}
        </span>
      </div>

      {/* Name + Description */}
      <div className="text-xs font-semibold text-foreground">{strategy.name}</div>
      {strategy.description && (
        <p className="text-[10px] text-[#5a7090] leading-relaxed line-clamp-2">{strategy.description}</p>
      )}

      {/* Info row */}
      <div className="text-[10px] text-[#5a7090] font-mono flex items-center gap-1.5">
        {strategy.timeframe && <span>{strategy.timeframe}</span>}
        {strategy.timeframe && (strategy.stop_loss_pct != null || strategy.take_profit_pct != null) && <span>|</span>}
        {strategy.stop_loss_pct != null && <span>SL {strategy.stop_loss_pct}%</span>}
        {strategy.stop_loss_pct != null && strategy.take_profit_pct != null && <span>|</span>}
        {strategy.take_profit_pct != null && <span>TP {strategy.take_profit_pct}%</span>}
      </div>

      {/* Pair badges */}
      {pairs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visiblePairs.map((pair) => (
            <span key={pair} className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-[#1a2230] text-[#8fa3b8] border border-[#1e2d40]">
              {pair}
            </span>
          ))}
          {extraPairs > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-[#1a2230] text-[#5a7090]">
              +{extraPairs} more
            </span>
          )}
        </div>
      )}

      {/* Flag pills */}
      <div className="flex flex-wrap gap-1">
        {strategy.is_core && (
          <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[rgba(61,157,243,0.1)] text-[#3d9df3]">
            CORE
          </span>
        )}
        {strategy.is_live_enabled && (
          <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[rgba(0,229,160,0.1)] text-[#00e5a0]">
            LIVE
          </span>
        )}
        {strategy.is_public && (
          <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[rgba(245,166,35,0.1)] text-[#f5a623]">
            PUBLIC
          </span>
        )}
      </div>

      {/* Bottom: View Details + Backtest + Status quick-toggle */}
      <div className="flex items-center justify-between mt-1 pt-1 border-t border-[#1e2d40]">
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(strategy.id); }}
            className="text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] hover:text-foreground transition-colors"
          >
            View Details
          </button>
          {onBacktest && strategy.is_backtest_enabled && (
            <button
              onClick={(e) => { e.stopPropagation(); onBacktest(strategy.id); }}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#f5a623] hover:text-[#ffc107] transition-colors"
              title="Run Backtest"
            >
              <FlaskConical className="h-3 w-3" />
              Backtest
            </button>
          )}
        </div>
        <select
          value={strategy.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(strategy.id, e.target.value as StrategyStatus);
          }}
          className="bg-dark-elevated border border-dark rounded-sm px-2 py-1 text-[10px] text-foreground focus:outline-none focus:border-dark-2 cursor-pointer"
        >
          <option value="draft">Draft</option>
          <option value="backtesting">Backtesting</option>
          <option value="validated">Validated</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>
    </div>
  );
}
