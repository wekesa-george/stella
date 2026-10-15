"use client";

import { useState } from "react";
import type { CurrentShift, ShiftLog } from "./types";

interface ActiveShiftBarProps {
  currentShift: CurrentShift | null;
  shiftEnded: boolean;
  starting: boolean;
  shiftLogs: ShiftLog[];
  totalEquity: number;
  totalPnl: number;
  running: number;
  errors: number;
  paused: number;
  criticalLogs: ShiftLog[];
  warningLogs: ShiftLog[];
  bots: { length: number };
  onStartShift: () => void;
  onOpenPanel: (panel: "activity" | "watchlist" | "handoff") => void;
  onResetAfterHandoff: () => void;
}

export function ActiveShiftBar({
  currentShift,
  shiftEnded,
  starting,
  shiftLogs,
  totalEquity,
  totalPnl,
  running,
  errors,
  paused,
  criticalLogs,
  warningLogs,
  bots,
  onStartShift,
  onOpenPanel,
  onResetAfterHandoff,
}: ActiveShiftBarProps) {
  const [expanded, setExpanded] = useState(false);

  // Shift ended success state
  if (shiftEnded) {
    return (
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-4 py-3 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-[#FFD700] mb-1">Shift Handed Off Successfully</p>
          <p className="text-[10px] text-[#8fa3b8]">Your shift has been submitted. The next operator can start their shift.</p>
          <button
            onClick={onResetAfterHandoff}
            className="mt-2 px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all"
          >
            Start New Shift
          </button>
        </div>
      </div>
    );
  }

  // No active shift
  if (!currentShift) {
    return (
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#5a7090]" />
            <span className="text-xs text-[#8fa3b8]">No active shift</span>
          </div>
          <button
            onClick={onStartShift}
            disabled={starting}
            className="px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all disabled:opacity-50"
          >
            {starting ? "Starting..." : "Start Shift"}
          </button>
        </div>
      </div>
    );
  }

  // Active shift — collapsed
  if (!expanded) {
    return (
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00e5a0] shadow-[0_0_6px_#00e5a0]" />
          <span className="text-xs text-foreground font-semibold">{currentShift.user}</span>
          <span className="text-xs text-[#5a7090] font-mono">{currentShift.duration}</span>
          <span className="text-[10px] text-[#8fa3b8]">{currentShift.actions} actions</span>
          <span className="text-[10px] text-[#8fa3b8]">{currentShift.incidents} incidents</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onOpenPanel("activity")}
              className="px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,215,0,0.12)] text-[#FFD700] hover:bg-[rgba(255,215,0,0.2)] transition-all"
            >
              Log Activity
            </button>
            <button
              onClick={() => onOpenPanel("watchlist")}
              className="px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(245,166,35,0.12)] text-[#f5a623] hover:bg-[rgba(245,166,35,0.2)] transition-all"
            >
              Watch List
            </button>
            <button
              onClick={() => onOpenPanel("handoff")}
              className="px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(0,229,160,0.12)] text-[#00e5a0] hover:bg-[rgba(0,229,160,0.2)] transition-all"
            >
              Handoff
            </button>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="text-[#5a7090] hover:text-foreground transition-colors ml-1"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Active shift — expanded
  return (
    <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
      {/* Header with collapse */}
      <div className="px-4 py-2.5 flex items-center gap-3 border-b border-dark">
        <div className="w-2 h-2 rounded-full bg-[#00e5a0] shadow-[0_0_6px_#00e5a0]" />
        <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Active Shift</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onOpenPanel("activity")}
            className="px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,215,0,0.12)] text-[#FFD700] hover:bg-[rgba(255,215,0,0.2)] transition-all"
          >
            Log Activity
          </button>
          <button
            onClick={() => onOpenPanel("watchlist")}
            className="px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(245,166,35,0.12)] text-[#f5a623] hover:bg-[rgba(245,166,35,0.2)] transition-all"
          >
            Watch List
          </button>
          <button
            onClick={() => onOpenPanel("handoff")}
            className="px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(0,229,160,0.12)] text-[#00e5a0] hover:bg-[rgba(0,229,160,0.2)] transition-all"
          >
            Handoff
          </button>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-[#5a7090] hover:text-foreground transition-colors ml-1"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Stat cards */}
      <div className="p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <StatCard label="Operator" value={currentShift.user} />
          <StatCard label="Start Time" value={currentShift.startTime} />
          <StatCard label="Duration" value={currentShift.duration} />
          <StatCard label="Actions Taken" value={String(currentShift.actions)} />
          <StatCard label="Incidents" value={String(currentShift.incidents)} valueColor="#ff4757" />
        </div>

        {/* Platform status row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
          <div className="bg-[#0d1117] border border-dark rounded-md p-2.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1">Total Equity</div>
            <div className="font-mono text-lg font-semibold text-foreground leading-none">
              {bots.length > 0 ? `$${(totalEquity / 1000).toFixed(1)}k` : "$--"}
            </div>
            <div className={`text-[10px] font-mono ${totalPnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"}`}>
              {bots.length > 0 ? `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)} today` : "--"}
            </div>
          </div>
          <div className="bg-[#0d1117] border border-dark rounded-md p-2.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1">Bot Status</div>
            <div className="font-mono text-lg font-semibold text-[#00e5a0] leading-none">{running}</div>
            <div className="text-[10px] text-[#5a7090]">{paused} paused · {errors} errors</div>
          </div>
          <div className="bg-[#0d1117] border border-dark rounded-md p-2.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1">Critical Events</div>
            <div className="font-mono text-lg font-semibold text-[#ff4757] leading-none">{criticalLogs.length}</div>
            <div className="text-[10px] text-[#5a7090]">{warningLogs.length} warnings</div>
          </div>
          <div className="bg-[#0d1117] border border-dark rounded-md p-2.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1">Total Bots</div>
            <div className="font-mono text-lg font-semibold text-foreground leading-none">{bots.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="bg-[#0d1117] border border-dark rounded-md p-2.5">
      <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1">{label}</div>
      <div className="font-mono text-sm font-semibold leading-none" style={valueColor ? { color: valueColor } : undefined}>
        <span className={valueColor ? "" : "text-foreground"}>{value}</span>
      </div>
    </div>
  );
}
