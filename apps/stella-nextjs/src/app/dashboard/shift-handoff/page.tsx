"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getCurrentShift,
  startShift,
  getShiftActivities,
  getShiftWatchList,
  logShiftActivity,
  addToShiftWatchList,
  submitHandoff,
  updateShiftNotes,
  getAdminUsers,
} from "@/lib/stellaAdminApi";
import { listBots } from "@/lib/tradingEngineApi";
import { mapApiBotToUiBot } from "@/lib/api/mappers";
import { useBotChannel } from "@/hooks/usePhoenixChannel";
import { useAdminUser } from "@/components/AdminUserProvider";
import type { Bot } from "@/lib/types/dashboard";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import Link from "next/link";

// ==================== TYPES ====================

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
  id: string;
  userId: string;
  user: string;
  startTime: string;
  startTimeRaw: string;
  duration: string;
  actions: number;
  incidents: number;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
}

// ==================== COMPONENT ====================

export default function ShiftHandoffPage() {
  const { adminUserId } = useAdminUser();

  const [bots, setBots] = useState<Bot[]>([]);
  const [shiftLogs, setShiftLogs] = useState<ShiftLog[]>([]);
  const [watchList, setWatchList] = useState<WatchItem[]>([]);
  const [handoffNotes, setHandoffNotes] = useState("");
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [shiftEnded, setShiftEnded] = useState(false);

  // Log activity form
  const [showLogForm, setShowLogForm] = useState(false);
  const [logAction, setLogAction] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [logPriority, setLogPriority] = useState<string>("normal");
  const [loggingActivity, setLoggingActivity] = useState(false);

  // Watch list form
  const [showWatchForm, setShowWatchForm] = useState(false);
  const [watchTitle, setWatchTitle] = useState("");
  const [watchDescription, setWatchDescription] = useState("");
  const [watchPriority, setWatchPriority] = useState<string>("warning");
  const [addingWatch, setAddingWatch] = useState(false);

  // Handoff receiver
  const [receivedBy, setReceivedBy] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);

  // Error display
  const [error, setError] = useState<string | null>(null);

  // Real-time bot updates
  const { bots: wsBots } = useBotChannel();

  // Load shift data
  const loadShiftData = useCallback(async () => {
    try {
      const [shiftResult, botsResult] = await Promise.all([
        getCurrentShift(),
        listBots(),
      ]);

      if (shiftResult.data) {
        const s = shiftResult.data as any;
        const shiftId = s.shiftId ?? s.shift_id ?? s.id;
        const shift: CurrentShift = {
          id: shiftId,
          userId: s.userId ?? s.user_id ?? '',
          user: s.operator ?? s.user ?? s.user_name ?? '--',
          startTime: formatTime(s.startTime ?? s.start_time),
          startTimeRaw: s.startTime ?? s.start_time ?? '',
          duration: formatDuration(s.startTime ?? s.start_time),
          actions: s.actionsCount ?? s.actions_count ?? s.action_count ?? 0,
          incidents: s.incidentsCount ?? s.incidents_count ?? s.incident_count ?? 0,
        };
        setCurrentShift(shift);
        if (s.handoffNotes ?? s.handoff_notes) {
          setHandoffNotes(s.handoffNotes ?? s.handoff_notes);
        }

        // Load activities and watch list for this shift
        const [activitiesResult, watchResult] = await Promise.all([
          getShiftActivities(shiftId),
          getShiftWatchList(),
        ]);

        if (activitiesResult.data && Array.isArray(activitiesResult.data)) {
          setShiftLogs(activitiesResult.data.map(mapActivity));
        }

        if (watchResult.data && Array.isArray(watchResult.data)) {
          setWatchList(watchResult.data.map(mapWatchItem));
        }
      } else {
        setCurrentShift(null);
      }

      if (botsResult.data && Array.isArray(botsResult.data)) {
        setBots(botsResult.data.map(mapApiBotToUiBot));
      }
    } catch {
      // API failed — everything stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadShiftData(); }, [loadShiftData]);

  // Load admin users for handoff receiver picker
  useEffect(() => {
    getAdminUsers({ limit: 50, status: 'active' }).then((res) => {
      if (res.data) {
        const d = res.data as any;
        const list = Array.isArray(d) ? d : d.data || d.users || d.items || [];
        setAdminUsers(list.map((u: any) => ({
          id: u.id,
          username: u.displayName || u.display_name || u.username || u.email || u.id.slice(0, 8),
          email: u.email || '',
        })));
      }
    }).catch(() => {});
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

  // Update duration every minute
  useEffect(() => {
    if (!currentShift?.startTimeRaw) return;
    const interval = setInterval(() => {
      setCurrentShift((prev) => prev ? { ...prev, duration: formatDuration(prev.startTimeRaw) } : prev);
    }, 60000);
    return () => clearInterval(interval);
  }, [currentShift?.startTimeRaw]);

  // Derived stats
  const totalEquity = bots.reduce((s, b) => s + b.equity, 0);
  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const running = bots.filter(b => b.status === "running").length;
  const errors = bots.filter(b => b.status === "error").length;
  const paused = bots.filter(b => b.status === "paused").length;
  const criticalLogs = shiftLogs.filter(l => l.priority === "critical");
  const warningLogs = shiftLogs.filter(l => l.priority === "warning");

  // ==================== ACTIONS ====================

  const handleStartShift = async () => {
    if (!adminUserId) {
      setError("Could not determine your user ID. Try refreshing the page.");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const result = await startShift({ userId: adminUserId });
      if (result.error) {
        setError(result.error);
        return;
      }
      // Reload shift data
      await loadShiftData();
    } catch {
      setError("Failed to start shift");
    } finally {
      setStarting(false);
    }
  };

  const handleLogActivity = async () => {
    if (!currentShift?.id || !adminUserId || !logAction.trim()) return;
    setLoggingActivity(true);
    setError(null);
    try {
      const result = await logShiftActivity({
        shiftId: currentShift.id,
        userId: adminUserId,
        action: logAction.trim(),
        notes: logNotes.trim() || undefined,
        priority: logPriority,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) {
        setShiftLogs((prev) => [mapActivity(result.data), ...prev]);
        setCurrentShift((prev) => prev ? {
          ...prev,
          actions: prev.actions + 1,
          incidents: logPriority === 'critical' ? prev.incidents + 1 : prev.incidents,
        } : prev);
      }
      setLogAction("");
      setLogNotes("");
      setLogPriority("normal");
      setShowLogForm(false);
    } catch {
      setError("Failed to log activity");
    } finally {
      setLoggingActivity(false);
    }
  };

  const handleAddWatchItem = async () => {
    if (!currentShift?.id || !adminUserId || !watchTitle.trim()) return;
    setAddingWatch(true);
    setError(null);
    try {
      const result = await addToShiftWatchList({
        shiftId: currentShift.id,
        createdBy: adminUserId,
        title: watchTitle.trim(),
        description: watchDescription.trim() || undefined,
        priority: watchPriority,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) {
        setWatchList((prev) => [mapWatchItem(result.data), ...prev]);
      }
      setWatchTitle("");
      setWatchDescription("");
      setWatchPriority("warning");
      setShowWatchForm(false);
    } catch {
      setError("Failed to add watch item");
    } finally {
      setAddingWatch(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!currentShift?.id) return;
    setSavingDraft(true);
    try {
      await updateShiftNotes(currentShift.id, { handoffNotes });
    } catch {
      // silent
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmitHandoff = async () => {
    if (!currentShift?.id) return;
    if (!receivedBy) {
      setError("Select the operator receiving the handoff");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await submitHandoff({
        shiftId: currentShift.id,
        handoffNotes,
        receivedBy,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setShiftEnded(true);
      setCurrentShift(null);
    } catch {
      setError("Failed to submit handoff");
    } finally {
      setSubmitting(false);
    }
  };

  // ==================== RENDER ====================

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#FFD700]">Shift Handoff</span>
          </div>

          {/* Sub-navigation */}
          <div className="flex gap-4 border-b border-dark">
            <span className="px-1 pb-2 text-xs font-semibold text-[#FFD700] border-b-2 border-[#FFD700] cursor-default">
              Current Shift
            </span>
            <Link
              href="/dashboard/shift-handoff/history"
              className="px-1 pb-2 text-xs font-semibold text-[#5a7090] hover:text-[#8fa3b8] transition-colors"
            >
              History
            </Link>
          </div>

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Shift Handoff</h1>
              <p className="text-xs sm:text-sm text-[#8fa3b8]">
                Document shift activities and handoff to next operator
              </p>
            </div>
            {!currentShift && !shiftEnded && (
              <button
                onClick={handleStartShift}
                disabled={starting}
                className="px-4 py-2 rounded bg-[#FFD700] text-black text-xs font-bold uppercase tracking-wider hover:bg-[#FFE44D] transition-all whitespace-nowrap disabled:opacity-50"
              >
                {starting ? 'Starting...' : 'Start Shift'}
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-[#ff4757] hover:text-white ml-2">&times;</button>
            </div>
          )}

          {/* Shift ended success */}
          {shiftEnded && (
            <div className="text-xs text-[#FFD700] bg-[rgba(255,215,0,0.08)] border border-[rgba(255,215,0,0.2)] rounded-sm px-3 py-3 text-center">
              <p className="font-bold uppercase tracking-wider mb-1">Shift Handed Off Successfully</p>
              <p className="text-[#8fa3b8]">Your shift has been submitted. The next operator can start their shift.</p>
              <button
                onClick={() => { setShiftEnded(false); setHandoffNotes(""); setShiftLogs([]); setWatchList([]); }}
                className="mt-2 px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all"
              >
                Start New Shift
              </button>
            </div>
          )}

          {/* Current Shift Info */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Current Shift</span>
            </div>
            <div className="p-3 sm:p-3.5">
              {currentShift ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                  <StatCard label="Operator" value={currentShift.user} />
                  <StatCard label="Start Time" value={currentShift.startTime} />
                  <StatCard label="Duration" value={currentShift.duration} />
                  <StatCard label="Actions Taken" value={String(currentShift.actions)} />
                  <StatCard label="Incidents" value={String(currentShift.incidents)} valueColor="#ff4757" />
                </div>
              ) : !shiftEnded ? (
                <div className="text-center py-6">
                  <p className="text-sm text-[#8fa3b8]">No active shift</p>
                  <p className="text-xs text-[#5a7090] mt-1">Start a shift to begin logging activities</p>
                </div>
              ) : null}
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
                  <div className="font-mono text-[28px] font-semibold text-[#00e5a0] leading-none mb-1.5">{running}</div>
                  <div className="text-xs text-[#5a7090]">{paused} paused · {errors} errors</div>
                </div>
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Critical Events</div>
                  <div className="font-mono text-[28px] font-semibold text-[#ff4757] leading-none mb-1.5">{criticalLogs.length}</div>
                  <div className="text-xs text-[#5a7090]">{warningLogs.length} warnings</div>
                </div>
                <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Total Bots</div>
                  <div className="font-mono text-[28px] font-semibold text-foreground leading-none mb-1.5">{bots.length}</div>
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
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#5a7090]">{shiftLogs.length} entries</span>
                {currentShift && (
                  <button
                    onClick={() => setShowLogForm(!showLogForm)}
                    className="px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,215,0,0.12)] text-[#FFD700] hover:bg-[rgba(255,215,0,0.2)] transition-all"
                  >
                    + Log Activity
                  </button>
                )}
              </div>
            </div>

            {/* Log Activity Form */}
            {showLogForm && currentShift && (
              <div className="px-3 sm:px-3.5 py-3 border-b border-dark bg-[#0d1117] space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <input
                    value={logAction}
                    onChange={(e) => setLogAction(e.target.value)}
                    placeholder="What action did you take? (e.g. Paused bot, Acknowledged alert)"
                    className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                    autoFocus
                  />
                  <select
                    value={logPriority}
                    onChange={(e) => setLogPriority(e.target.value)}
                    className="bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground focus:outline-none focus:border-dark-2"
                  >
                    <option value="normal">Normal</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <textarea
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="Additional notes (optional)"
                  rows={2}
                  className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleLogActivity}
                    disabled={loggingActivity || !logAction.trim()}
                    className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all disabled:opacity-50"
                  >
                    {loggingActivity ? 'Logging...' : 'Log'}
                  </button>
                  <button
                    onClick={() => { setShowLogForm(false); setLogAction(""); setLogNotes(""); setLogPriority("normal"); }}
                    className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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
                          <PriorityBadge priority={log.priority} />
                          <span className="font-mono text-xs text-foreground">{log.user}</span>
                        </div>
                        <span className="font-mono text-[10px] text-[#5a7090] whitespace-nowrap">{log.timestamp}</span>
                      </div>
                      <div className="text-xs text-foreground font-semibold">{log.action}</div>
                      {log.notes && <div className="text-xs text-[#8fa3b8]">{log.notes}</div>}
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
                          <td className="px-3.5 py-2"><PriorityBadge priority={log.priority} /></td>
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

          {/* Handoff Notes + Receiver */}
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
                  disabled={!currentShift}
                />
              </div>

              {/* Handoff Receiver */}
              {currentShift && (
                <div>
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-2">Hand Off To</div>
                  <select
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    className="w-full sm:w-64 bg-[#0d1117] border border-dark rounded-sm px-3 py-2 text-xs text-foreground focus:outline-none focus:border-[#253550]"
                  >
                    <option value="">Select next operator...</option>
                    {adminUsers
                      .filter(u => u.id !== adminUserId)
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.username} {u.email ? `(${u.email})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5">
                <button
                  onClick={handleSubmitHandoff}
                  disabled={submitting || !currentShift || !receivedBy}
                  className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' : 'Submit Handoff'}
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={!currentShift || savingDraft}
                  className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-[#253550] hover:text-foreground transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDraft ? 'Saving...' : 'Save Draft'}
                </button>
              </div>
            </div>
          </div>

          {/* Watch List */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Watch List</span>
              {currentShift && (
                <button
                  onClick={() => setShowWatchForm(!showWatchForm)}
                  className="px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(245,166,35,0.12)] text-[#f5a623] hover:bg-[rgba(245,166,35,0.2)] transition-all"
                >
                  + Add Item
                </button>
              )}
            </div>

            {/* Add Watch Item Form */}
            {showWatchForm && currentShift && (
              <div className="px-3 sm:px-3.5 py-3 border-b border-dark bg-[#0d1117] space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <input
                    value={watchTitle}
                    onChange={(e) => setWatchTitle(e.target.value)}
                    placeholder="What should the next operator watch? (e.g. BTC volatility spike)"
                    className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                    autoFocus
                  />
                  <select
                    value={watchPriority}
                    onChange={(e) => setWatchPriority(e.target.value)}
                    className="bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground focus:outline-none focus:border-dark-2"
                  >
                    <option value="normal">Normal</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <textarea
                  value={watchDescription}
                  onChange={(e) => setWatchDescription(e.target.value)}
                  placeholder="Description / context (optional)"
                  rows={2}
                  className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddWatchItem}
                    disabled={addingWatch || !watchTitle.trim()}
                    className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#f5a623] text-black hover:bg-[#ffc107] transition-all disabled:opacity-50"
                  >
                    {addingWatch ? 'Adding...' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setShowWatchForm(false); setWatchTitle(""); setWatchDescription(""); setWatchPriority("warning"); }}
                    className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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
                        {item.description && (
                          <div className="text-[10px] text-[#8fa3b8] mt-0.5">{item.description}</div>
                        )}
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

// ==================== SUB-COMPONENTS ====================

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="bg-[#0d1117] border border-dark rounded-md p-3.5">
      <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">{label}</div>
      <div className="font-mono text-lg font-semibold leading-none" style={valueColor ? { color: valueColor } : undefined}>
        <span className={valueColor ? '' : 'text-foreground'}>{value}</span>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = priority === "critical"
    ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
    : priority === "warning"
    ? "bg-[rgba(245,166,35,0.12)] text-[#f5a623]"
    : "bg-[rgba(255,215,0,0.12)] text-[#FFD700]";

  return (
    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${cls}`}>
      {priority}
    </span>
  );
}

// ==================== HELPERS ====================

function mapActivity(a: any): {
  id: string | number;
  timestamp: string;
  user: string;
  action: string;
  notes: string;
  priority: "normal" | "warning" | "critical";
} {
  return {
    id: a.activityId ?? a.activity_id ?? a.id ?? 0,
    timestamp: formatTime(a.createdAt ?? a.created_at ?? a.timestamp),
    user: a.operator ?? a.user ?? a.user_name ?? '--',
    action: a.action ?? a.title ?? '',
    notes: a.notes ?? a.description ?? '',
    priority: normalizePriority(a.priority ?? a.severity),
  };
}

function mapWatchItem(w: any): {
  id: string | number;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
} {
  return {
    id: w.watchItemId ?? w.watch_item_id ?? w.id ?? 0,
    title: w.title ?? w.name ?? '',
    description: w.description ?? w.notes ?? '',
    severity: normalizeSeverity(w.priority ?? w.severity),
  };
}

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
