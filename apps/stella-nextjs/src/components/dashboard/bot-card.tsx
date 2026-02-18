import { cn } from "@/lib/utils";
import type { Bot } from "@/lib/types/dashboard";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { generateEquityCurve } from "@/lib/data/generators";

interface BotCardProps {
  bot: Bot;
  onKill: (botId: string) => void;
  onSelect?: (botId: string) => void;
  selected?: boolean;
}

export function BotCard({ bot, onKill, onSelect, selected }: BotCardProps) {
  const equityCurve = generateEquityCurve(40, bot.equity, 0.015);

  return (
    <div
      onClick={() => onSelect?.(bot.id)}
      className={cn(
        "bg-dark-elevated border rounded-md p-3 flex flex-col gap-2 cursor-pointer transition-all relative overflow-hidden",
        "hover:border-dark-2",
        selected && "border-[#00e5a0]",
        bot.status === "error" && "border-[#ff4757]",
        bot.status === "paused" && "border-[#f5a623]",
        !selected && bot.status === "running" && "border-dark"
      )}
    >
      {/* Status Bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-0.5",
          bot.status === "running" && "bg-[#00e5a0]",
          bot.status === "error" && "bg-[#ff4757]",
          bot.status === "paused" && "bg-[#f5a623]"
        )}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-[#5a7090]">{bot.id}</span>
        <span
          className={cn(
            "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm",
            bot.status === "running" && "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]",
            bot.status === "paused" && "bg-[rgba(245,166,35,0.12)] text-[#f5a623]",
            bot.status === "error" && "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
          )}
        >
          {bot.status}
        </span>
      </div>

      {/* Bot Name */}
      <div className="text-xs font-semibold text-foreground">{bot.name}</div>
      <div className="text-[10px] text-[#5a7090]">
        {bot.user} • {bot.exchange} • {bot.pair}
      </div>

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
        <button
          onClick={(e) => {
            e.stopPropagation();
            onKill(bot.id);
          }}
          className="px-2.5 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,71,87,0.12)] text-[#ff4757] border border-[rgba(255,71,87,0.3)] hover:bg-[#ff4757] hover:text-white transition-all"
        >
          KILL
        </button>
        <button
          onClick={(e) => e.stopPropagation()}
          className="px-2.5 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(245,166,35,0.12)] text-[#f5a623] border border-[rgba(245,166,35,0.3)] hover:bg-[#f5a623] hover:text-black transition-all"
        >
          PAUSE
        </button>
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
