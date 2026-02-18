"use client";

import { useState, useEffect } from "react";
import { generateBots, USERS } from "@/lib/data/generators";
import type { Bot } from "@/lib/types/dashboard";

interface ShiftLog {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  notes: string;
  priority: "normal" | "warning" | "critical";
}

interface CurrentShift {
  user: string;
  startTime: string;
  duration: string;
  actions: number;
  incidents: number;
}

function generateShiftLogs(): ShiftLog[] {
  const actions = [
    { action: "Killed bot BOT-0012", notes: "CPU exceeded 95% threshold", priority: "critical" as const },
    { action: "Paused bot BOT-0007", notes: "Unusual trading pattern detected", priority: "warning" as const },
    { action: "Resumed bot BOT-0003", notes: "Fixed config issue and restarted", priority: "normal" as const },
    { action: "Deployed new bot BOT-0019", notes: "Momentum Grid strategy on BTC/USDT", priority: "normal" as const },
    { action: "Acknowledged infrastructure alert", notes: "Postgres RAM usage normalized", priority: "warning" as const },
    { action: "Manually closed position", notes: "Bot BOT-0015 - Risk limit reached", priority: "critical" as const },
    { action: "Updated bot parameters", notes: "BOT-0008 - Adjusted stop loss from 2% to 1.5%", priority: "normal" as const },
    { action: "Investigated heartbeat miss", notes: "BOT-0007 - Network latency spike resolved", priority: "warning" as const },
  ];

  return actions.map((a, i) => ({
    id: i,
    timestamp: `${Math.floor(Math.random() * 12) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')} ${Math.random() > 0.5 ? 'AM' : 'PM'}`,
    user: USERS[Math.floor(Math.random() * USERS.length)].split('@')[0],
    ...a,
  }));
}

export default function ShiftHandoffPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [shiftLogs, setShiftLogs] = useState<ShiftLog[]>([]);
  const [handoffNotes, setHandoffNotes] = useState("");
  const [currentShift, setCurrentShift] = useState<CurrentShift>({
    user: "bob.m",
    startTime: "9:00 AM",
    duration: "3h 42m",
    actions: 12,
    incidents: 3,
  });

  useEffect(() => {
    setBots(generateBots(18));
    setShiftLogs(generateShiftLogs());
  }, []);

  const totalEquity = bots.reduce((s, b) => s + b.equity, 0);
  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const running = bots.filter(b => b.status === "running").length;
  const errors = bots.filter(b => b.status === "error").length;
  const paused = bots.filter(b => b.status === "paused").length;

  const criticalLogs = shiftLogs.filter(l => l.priority === "critical");
  const warningLogs = shiftLogs.filter(l => l.priority === "warning");

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#00e5a0]">Shift Handoff</span>
          </div>

          {/* Page Header */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Shift Handoff</h1>
            <p className="text-xs sm:text-sm text-[#8fa3b8]">
              Document shift activities and handoff to next operator
            </p>
          </div>

          {/* Current Shift Info */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Current Shift</span>
            </div>
            <div className="p-3 sm:p-3.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Operator</div>
                  <div className="font-mono text-lg font-semibold text-foreground">{currentShift.user}</div>
                </div>
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Start Time</div>
                  <div className="font-mono text-lg font-semibold text-foreground">{currentShift.startTime}</div>
                </div>
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Duration</div>
                  <div className="font-mono text-lg font-semibold text-foreground">{currentShift.duration}</div>
                </div>
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Actions Taken</div>
                  <div className="font-mono text-lg font-semibold text-foreground">{currentShift.actions}</div>
                </div>
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Incidents</div>
                  <div className="font-mono text-lg font-semibold text-[#ff4757]">{currentShift.incidents}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Platform Status Summary */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Platform Status Summary</span>
            </div>
            <div className="p-3 sm:p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Total Equity</div>
                  <div className="font-mono text-[28px] font-semibold text-foreground leading-none mb-1.5">
                    ${(totalEquity / 1000).toFixed(1)}k
                  </div>
                  <div className={`text-xs font-mono ${totalPnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"}`}>
                    {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)} today
                  </div>
                </div>
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Bot Status</div>
                  <div className="font-mono text-[28px] font-semibold text-[#00e5a0] leading-none mb-1.5">
                    {running}
                  </div>
                  <div className="text-xs text-[#5a7090]">
                    {paused} paused · {errors} errors
                  </div>
                </div>
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Critical Events</div>
                  <div className="font-mono text-[28px] font-semibold text-[#ff4757] leading-none mb-1.5">
                    {criticalLogs.length}
                  </div>
                  <div className="text-xs text-[#5a7090]">
                    {warningLogs.length} warnings
                  </div>
                </div>
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Total Bots</div>
                  <div className="font-mono text-[28px] font-semibold text-foreground leading-none mb-1.5">
                    {bots.length}
                  </div>
                  <div className="text-xs text-[#5a7090]">
                    across {new Set(bots.map(b => b.user)).size} users
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Shift Activity Log */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Shift Activity Log</span>
              <span className="text-[10px] text-[#5a7090]">{shiftLogs.length} entries</span>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden divide-y divide-dark/50">
              {shiftLogs.map(log => (
                <div key={log.id} className="p-3 space-y-2 hover:bg-[#0d1117] transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                        log.priority === "critical" ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]" :
                        log.priority === "warning" ? "bg-[rgba(245,166,35,0.12)] text-[#f5a623]" :
                        "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]"
                      }`}>
                        {log.priority}
                      </span>
                      <span className="font-mono text-xs text-foreground">{log.user}</span>
                    </div>
                    <span className="font-mono text-[10px] text-[#5a7090] whitespace-nowrap">{log.timestamp}</span>
                  </div>
                  <div className="text-xs text-foreground font-semibold">{log.action}</div>
                  <div className="text-xs text-[#8fa3b8]">{log.notes}</div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark">
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Time</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Operator</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Priority</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Action</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftLogs.map(log => (
                    <tr key={log.id} className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors">
                      <td className="px-3.5 py-2 font-mono text-xs text-[#5a7090]">{log.timestamp}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-foreground">{log.user}</td>
                      <td className="px-3.5 py-2">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                          log.priority === "critical" ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]" :
                          log.priority === "warning" ? "bg-[rgba(245,166,35,0.12)] text-[#f5a623]" :
                          "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]"
                        }`}>
                          {log.priority}
                        </span>
                      </td>
                      <td className="px-3.5 py-2 text-xs text-foreground">{log.action}</td>
                      <td className="px-3.5 py-2 text-xs text-[#8fa3b8]">{log.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Handoff Notes */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Handoff Notes</span>
            </div>
            <div className="p-3 sm:p-3.5 space-y-3">
              <div>
                <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-2">Important Information for Next Shift</div>
                <textarea
                  value={handoffNotes}
                  onChange={e => setHandoffNotes(e.target.value)}
                  placeholder="Document any ongoing issues, monitoring points, or important context for the next operator..."
                  className="w-full bg-[#0d1117] border border-dark rounded-sm px-3 py-2.5 text-foreground text-xs font-mono resize-none focus:outline-none focus:border-[#253550]"
                  rows={8}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5">
                <button className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#00e5a0] text-black hover:bg-[#00ffb2] transition-all whitespace-nowrap">
                  Submit Handoff
                </button>
                <button className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-[#253550] hover:text-foreground transition-all whitespace-nowrap">
                  Save Draft
                </button>
              </div>
            </div>
          </div>

          {/* Watch List */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Watch List</span>
            </div>
            <div className="p-3 sm:p-3.5 space-y-2.5">
              <div className="flex items-start gap-3 p-2.5 bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#ff4757] shadow-[0_0_6px_#ff4757] mt-1"></div>
                <div className="flex-1">
                  <div className="text-xs text-foreground font-semibold">BOT-0012 - High CPU Usage</div>
                  <div className="text-[10px] text-[#8fa3b8] mt-0.5">Consistently running above 85% CPU. Consider restarting if it hits 95%.</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-2.5 bg-[rgba(245,166,35,0.08)] border border-[rgba(245,166,35,0.2)] rounded-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623] mt-1"></div>
                <div className="flex-1">
                  <div className="text-xs text-foreground font-semibold">Postgres RAM Trending Up</div>
                  <div className="text-[10px] text-[#8fa3b8] mt-0.5">RAM usage at 79%. Monitor for next 30 minutes.</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-2.5 bg-[rgba(245,166,35,0.08)] border border-[rgba(245,166,35,0.2)] rounded-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623] mt-1"></div>
                <div className="flex-1">
                  <div className="text-xs text-foreground font-semibold">BOT-0007 - Intermittent Heartbeat</div>
                  <div className="text-[10px] text-[#8fa3b8] mt-0.5">Missed 2 heartbeats in past hour. Network latency suspected.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
