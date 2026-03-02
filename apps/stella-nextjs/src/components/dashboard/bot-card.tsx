import { cn } from "@/lib/utils";
import type { Bot } from "@/lib/types/dashboard";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { generateEquityCurve } from "@/lib/data/generators";

const INIT_STEPS = [
  { key: "validating_credentials", label: "Validating credentials" },
  { key: "loading_strategy", label: "Loading strategy" },
  { key: "subscribing_market_data", label: "Subscribing to market data" },
  { key: "allocating_capital", label: "Allocating capital" },
  { key: "ready", label: "Ready" },
] as const;

interface BotCardProps {
  bot: Bot;
  onKill: (botId: string) => void;
  onPause?: (botId: string) => void;
  onResume?: (botId: string) => void;
  onStart?: (botId: string) => void;
  onDelete?: (botId: string) => void;
  onSelect?: (botId: string) => void;
  selected?: boolean;
}

export function BotCard({ bot, onKill, onPause, onResume, onStart, onDelete, onSelect, selected }: BotCardProps) {
  const equityCurve = generateEquityCurve(40, bot.equity, 0.015);

  return (
    <div
      onClick={() => onSelect?.(bot.id)}
      className={cn(
        "bg-dark-elevated border rounded-md p-3 flex flex-col gap-2 cursor-pointer transition-all relative overflow-hidden",
        "hover:border-dark-2",
        selected && "border-[#FFD700]",
        (bot.status === "error" || bot.status === "circuit_broken") && "border-[#ff4757]",
        (bot.status === "paused" || bot.status === "maintenance") && "border-[#f5a623]",
        (bot.status === "initializing" || bot.status === "stopping") && "border-[#3d9df3]",
        !selected && bot.status === "running" && "border-dark",
        !selected && bot.status === "stopped" && "border-dark"
      )}
    >
      {/* Status Bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-0.5",
          bot.status === "running" && "bg-[#00e5a0]",
          (bot.status === "error" || bot.status === "circuit_broken") && "bg-[#ff4757]",
          (bot.status === "paused" || bot.status === "maintenance") && "bg-[#f5a623]",
          bot.status === "stopped" && "bg-[#5a7090]",
          (bot.status === "initializing" || bot.status === "stopping") && "bg-[#3d9df3]"
        )}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground truncate">{bot.name || bot.id.slice(0, 8)}</span>
        <span
          className={cn(
            "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm shrink-0",
            bot.status === "running" && "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]",
            (bot.status === "paused" || bot.status === "maintenance") && "bg-[rgba(245,166,35,0.12)] text-[#f5a623]",
            (bot.status === "error" || bot.status === "circuit_broken") && "bg-[rgba(255,71,87,0.12)] text-[#ff4757]",
            bot.status === "stopped" && "bg-[rgba(90,112,144,0.12)] text-[#5a7090]",
            (bot.status === "initializing" || bot.status === "stopping") && "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]"
          )}
        >
          {bot.status === "initializing" && bot.initStep
            ? `INIT: ${bot.initStep.replace(/_/g, ' ')}`
            : bot.status}
        </span>
      </div>

      {/* Bot Details */}
      <div className="font-mono text-[10px] text-[#5a7090]">{bot.id.slice(0, 8)}…</div>
      <div className="text-[10px] text-[#5a7090]">
        {bot.user} • {bot.exchange} • {bot.pair}
      </div>

      {/* Init Progress */}
      {bot.status === "initializing" && bot.initStep && (
        <div className="space-y-1">
          <div className="flex gap-0.5">
            {INIT_STEPS.map((step) => {
              const currentIdx = INIT_STEPS.findIndex((s) => s.key === bot.initStep);
              const stepIdx = INIT_STEPS.findIndex((s) => s.key === step.key);
              const isComplete = stepIdx < currentIdx;
              const isCurrent = stepIdx === currentIdx;
              return (
                <div
                  key={step.key}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-all",
                    isComplete && "bg-[#3d9df3]",
                    isCurrent && "bg-[#3d9df3] animate-pulse",
                    !isComplete && !isCurrent && "bg-[#1e2d40]"
                  )}
                />
              );
            })}
          </div>
          <div className="text-[9px] text-[#3d9df3]">
            {INIT_STEPS.find((s) => s.key === bot.initStep)?.label ?? bot.initStep}
          </div>
        </div>
      )}

      {/* Sparkline */}
      <div className="h-8 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={equityCurve}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={bot.pnl >= 0 ? "#00e5a0" : "#ff4757"}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* P&L */}
      <div
        className={cn("font-mono text-lg font-semibold", bot.pnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]")}
      >
        {bot.pnl >= 0 ? "+" : ""}${bot.pnl.toLocaleString()}
        <span className="text-xs ml-1">({bot.pnlPct >= 0 ? "+" : ""}{bot.pnlPct}%)</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1">
        <div className="text-center">
          <div className="font-mono text-[11px] font-semibold text-foreground">{bot.openPositions}</div>
          <div className="text-[9px] text-[#5a7090]">OPEN</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-[11px] font-semibold text-foreground">{bot.trades}</div>
          <div className="text-[9px] text-[#5a7090]">TRADES</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-[11px] font-semibold text-foreground">{bot.winRate}%</div>
          <div className="text-[9px] text-[#5a7090]">WIN</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 mt-1">
        {bot.status === "stopped" || bot.status === "error" ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStart?.(bot.id);
              }}
              className="px-2.5 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,215,0,0.12)] text-[#FFD700] border border-[rgba(255,215,0,0.3)] hover:bg-[#FFD700] hover:text-black transition-all"
            >
              START
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(bot.id);
              }}
              className="px-2.5 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,71,87,0.08)] text-[#ff4757] border border-[rgba(255,71,87,0.2)] hover:bg-[#ff4757] hover:text-white transition-all"
            >
              DELETE
            </button>
          </>
        ) : bot.status === "initializing" || bot.status === "stopping" ? (
          <span className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#3d9df3]">
            {bot.status === "initializing" ? "Starting..." : "Stopping..."}
          </span>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (bot.status === "paused") {
                  onResume?.(bot.id);
                } else {
                  onPause?.(bot.id);
                }
              }}
              className="px-2.5 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(245,166,35,0.12)] text-[#f5a623] border border-[rgba(245,166,35,0.3)] hover:bg-[#f5a623] hover:text-black transition-all"
            >
              {bot.status === "paused" ? "RESUME" : "PAUSE"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onKill(bot.id);
              }}
              className="px-2.5 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,71,87,0.12)] text-[#ff4757] border border-[rgba(255,71,87,0.3)] hover:bg-[#ff4757] hover:text-white transition-all"
            >
              STOP
            </button>
          </>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.location.href = `/dashboard/bot/${bot.id}`;
          }}
          className="flex-1 px-2.5 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#1a2230] text-[#8fa3b8] border border-[#1e2d40] hover:border-[#253550] hover:text-foreground transition-all"
        >
          Inspect →
        </button>
      </div>
    </div>
  );
}
