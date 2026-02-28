"use client";

import { useState, useEffect } from "react";
import {
  getCurrentShift,
  getShiftActivities,
  getShiftWatchList,
  logShiftActivity,
  addToShiftWatchList,
  submitHandoff,
  updateShiftNotes,
} from "@/lib/stellaAdminApi";
import { listBots } from "@/lib/tradingEngineApi";
import { mapApiBotToUiBot } from "@/lib/api/mappers";
import { useBotChannel } from "@/hooks/usePhoenixChannel";
import type { Bot } from "@/lib/types/dashboard";
import { DashboardSkeleton } from "@/components/ui/skeleton";

interface ShiftLog {
  id: string | number;
  timestamp: string;
  user: string;
  action: string;
  notes: string;
  priority: "normal" | "warning" | "critical";
}

interface WatchItem {
  id: string | number;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
}

interface CurrentShift {
  id?: string;
  user: string;
  startTime: string;
  duration: string;
  actions: number;
  incidents: number;
}

export default function ShiftHandoffPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [shiftLogs, setShiftLogs] = useState<ShiftLog[]>([]);
  const [watchList, setWatchList] = useState<WatchItem[]>([]);
  const [handoffNotes, setHandoffNotes] = useState("");
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Real-time bot updates
  const { bots: wsBots } = useBotChannel();

  // Load all data from APIs
  useEffect(() => {
    (async () => {
      try {
        const [shiftResult, activitiesResult, watchResult, botsResult] = await Promise.all([
          getCurrentShift(),
          getShiftActivities(),
          getShiftWatchList(),
          listBots(),
        ]);

        if (shiftResult.data) {
          const s = shiftResult.data as any;
          setCurrentShift({
            id: s.id,
            user: s.operator ?? s.user ?? s.user_name ?? '--',
            startTime: formatTime(s.started_at ?? s.start_time),
            duration: formatDuration(s.started_at ?? s.start_time),
            actions: s.action_count ?? s.actions ?? 0,
            incidents: s.incident_count ?? s.incidents ?? 0,
          });
          if (s.notes) setHandoffNotes(s.notes);
        }

        if (activitiesResult.data && Array.isArray(activitiesResult.data)) {
          setShiftLogs(activitiesResult.data.map((a: any) => ({
            id: a.id ?? a.activity_id ?? 0,
            timestamp: formatTime(a.timestamp ?? a.created_at),
            user: a.operator ?? a.user ?? a.user_name ?? '--',
            action: a.action ?? a.title ?? '',
            notes: a.notes ?? a.description ?? '',
            priority: normalizePriority(a.priority ?? a.severity),
          })));
        }

        if (watchResult.data && Array.isArray(watchResult.data)) {
          setWatchList(watchResult.data.map((w: any) => ({
            id: w.id,
            title: w.title ?? w.name ?? '',
            description: w.description ?? w.notes ?? '',
            severity: normalizeSeverity(w.severity ?? w.priority),
          })));
        }

        if (botsResult.data && Array.isArray(botsResult.data)) {
          setBots(botsResult.data.map(mapApiBotToUiBot));
        }
      } catch {
        // API failed — everything stays empty
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Overlay WS bot updates
  useEffect(() => {
    if (wsBots.length > 0) {
      setBots((prev) => {
        const updated = [...prev];
        for (const wsBot of wsBots) {
          const idx = updated.findIndex((b) => b.id === wsBot.id);
          const mapped = mapApiBotToUiBot(wsBot as any);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], ...mapped, user: updated[idx].user || mapped.user };
          } else {
            updated.push(mapped);
          }
        }
        return updated;
      });
    }
  }, [wsBots]);

  const totalEquity = bots.reduce((s, b) => s + b.equity, 0);
  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const running = bots.filter(b => b.status === "running").length;
  const errors = bots.filter(b => b.status === "error").length;
  const paused = bots.filter(b => b.status === "paused").length;

  const criticalLogs = shiftLogs.filter(l => l.priority === "critical");
  const warningLogs = shiftLogs.filter(l => l.priority === "warning");

  const handleSubmitHandoff = async () => {
    setSubmitting(true);
    try {
      await submitHandoff({ notes: handoffNotes });
    } catch {
      console.error('Failed to submit handoff');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (currentShift?.id) {
      await updateShiftNotes(currentShift.id, { notes: handoffNotes }).catch(console.error);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

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
              {currentShift ? (
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
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-[#8fa3b8]">No active shift</p>
                  <p className="text-xs text-[#5a7090] mt-1">Start a shift to begin logging activities</p>
                </div>
              )}
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
                    {bots.length > 0 ? `$${(totalEquity / 1000).toFixed(1)}k` : '$--'}
                  </div>
                  <div className={`text-xs font-mono ${totalPnl >= 0 ? "text-[#00e5a0]" : "text-[#ff4757]"}`}>
                    {bots.length > 0 ? `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)} today` : '--'}
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
                    {bots.length > 0 ? `across ${new Set(bots.map(b => b.user)).size} users` : '--'}
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

            {shiftLogs.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-[#8fa3b8]">No activities logged this shift</p>
              </div>
            ) : (
              <>
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
              </>
            )}
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
                <button
                  onClick={handleSubmitHandoff}
                  disabled={submitting}
                  className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#00e5a0] text-black hover:bg-[#00ffb2] transition-all whitespace-nowrap disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Handoff'}
                </button>
                <button
                  onClick={handleSaveDraft}
                  className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-[#253550] hover:text-foreground transition-all whitespace-nowrap"
                >
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
              {watchList.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-[#8fa3b8]">No items on watch list</p>
                </div>
              ) : (
                watchList.map((item) => {
                  const colors = item.severity === "critical"
                    ? { bg: "rgba(255,71,87,0.08)", border: "rgba(255,71,87,0.2)", dot: "#ff4757", shadow: "shadow-[0_0_6px_#ff4757]" }
                    : item.severity === "warning"
                    ? { bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.2)", dot: "#f5a623", shadow: "" }
                    : { bg: "rgba(61,157,243,0.08)", border: "rgba(61,157,243,0.2)", dot: "#3d9df3", shadow: "" };

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-2.5 rounded-sm"
                      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full mt-1 ${colors.shadow}`}
                        style={{ background: colors.dot }}
                      />
                      <div className="flex-1">
                        <div className="text-xs text-foreground font-semibold">{item.title}</div>
                        <div className="text-[10px] text-[#8fa3b8] mt-0.5">{item.description}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== HELPERS ====================

function formatTime(ts: string | undefined): string {
  if (!ts) return '--';
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return ts;
  }
}

function formatDuration(startTs: string | undefined): string {
  if (!startTs) return '--';
  try {
    const diff = Date.now() - new Date(startTs).getTime();
    if (diff < 0 || isNaN(diff)) return '--';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  } catch {
    return '--';
  }
}

function normalizePriority(p: string): "normal" | "warning" | "critical" {
  const lower = (p ?? '').toLowerCase();
  if (lower === 'critical' || lower === 'error') return 'critical';
  if (lower === 'warning' || lower === 'warn') return 'warning';
  return 'normal';
}

function normalizeSeverity(s: string): "critical" | "warning" | "info" {
  const lower = (s ?? '').toLowerCase();
  if (lower === 'critical' || lower === 'error') return 'critical';
  if (lower === 'warning' || lower === 'warn') return 'warning';
  return 'info';
}
