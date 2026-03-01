"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getShiftHistory, getAdminUsers } from "@/lib/stellaAdminApi";
import { DashboardSkeleton } from "@/components/ui/skeleton";

// ==================== TYPES ====================

interface ShiftActivity {
  activityId: string;
  action: string;
  notes: string;
  priority: string;
  createdAt: string;
  userId: string;
}

interface WatchItem {
  watchItemId: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  resolvedAt: string | null;
}

interface HistoryShift {
  shiftId: string;
  userId: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  status: string;
  actionsCount: number;
  incidentsCount: number;
  handoffNotes: string | null;
  handoffReceivedBy: string | null;
  handoffSubmittedAt: string | null;
  activities: ShiftActivity[];
  watchItems: WatchItem[];
}

interface AdminUser {
  id: string;
  name: string;
}

// ==================== COMPONENT ====================

export default function ShiftHistoryPage() {
  const [shifts, setShifts] = useState<HistoryShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  const [adminMap, setAdminMap] = useState<Map<string, string>>(new Map());

  const limit = 20;

  // Load admin users for name resolution
  useEffect(() => {
    getAdminUsers({ limit: 100, status: "active" }).then((res) => {
      if (res.data) {
        const d = res.data as any;
        const list = Array.isArray(d) ? d : d.data || d.users || d.items || [];
        const map = new Map<string, string>();
        for (const u of list) {
          const name =
            u.displayName || u.display_name || u.username || u.email || u.id?.slice(0, 8) || "Unknown";
          map.set(u.id, name);
        }
        setAdminMap(map);
      }
    }).catch(() => {});
  }, []);

  const fetchHistory = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const result = await getShiftHistory({ page: p, limit });
      if (result.data) {
        const d = result.data as any;
        const data = d.data || d;
        const meta = d.meta;
        if (Array.isArray(data)) {
          setShifts(data.map(normalizeShift));
        }
        if (meta) {
          setTotalPages(meta.totalPages || meta.total_pages || 1);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  const resolveName = (id: string | null | undefined): string => {
    if (!id) return "--";
    return adminMap.get(id) || id.slice(0, 8);
  };

  // ==================== RENDER ====================

  if (loading && shifts.length === 0) {
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
            <span className="text-[#5a7090]">Shift Handoff</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#00e5a0]">History</span>
          </div>

          {/* Sub-navigation */}
          <div className="flex gap-4 border-b border-dark">
            <Link
              href="/dashboard/shift-handoff"
              className="px-1 pb-2 text-xs font-semibold text-[#5a7090] hover:text-[#8fa3b8] transition-colors"
            >
              Current Shift
            </Link>
            <span className="px-1 pb-2 text-xs font-semibold text-[#00e5a0] border-b-2 border-[#00e5a0] cursor-default">
              History
            </span>
          </div>

          {/* Page Header */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">
              Shift History
            </h1>
            <p className="text-xs sm:text-sm text-[#8fa3b8]">
              Browse past shifts, activity logs, and handoff notes
            </p>
          </div>

          {/* Timeline */}
          {shifts.length === 0 && !loading ? (
            <div className="bg-dark-elevated border border-dark rounded-md p-8 text-center">
              <p className="text-sm text-[#8fa3b8]">No shift history found</p>
              <p className="text-xs text-[#5a7090] mt-1">
                Completed shifts will appear here
              </p>
            </div>
          ) : (
            <div className="relative pl-6">
              {/* Timeline line */}
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-[#1e2d3d]" />

              <div className="space-y-4">
                {shifts.map((shift) => {
                  const isExpanded = expandedShiftId === shift.shiftId;
                  return (
                    <ShiftCard
                      key={shift.shiftId}
                      shift={shift}
                      isExpanded={isExpanded}
                      onToggle={() =>
                        setExpandedShiftId(
                          isExpanded ? null : shift.shiftId
                        )
                      }
                      resolveName={resolveName}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] border border-dark hover:border-[#253550] hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-[#5a7090] font-mono">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] border border-dark hover:border-[#253550] hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== SHIFT CARD ====================

function ShiftCard({
  shift,
  isExpanded,
  onToggle,
  resolveName,
}: {
  shift: HistoryShift;
  isExpanded: boolean;
  onToggle: () => void;
  resolveName: (id: string | null | undefined) => string;
}) {
  const statusColors: Record<string, string> = {
    ended: "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]",
    active: "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]",
  };
  const statusCls =
    statusColors[shift.status] || "bg-[rgba(143,163,184,0.12)] text-[#8fa3b8]";

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div
        className={`absolute -left-6 top-3.5 w-2.5 h-2.5 rounded-full border-2 ${
          shift.status === "ended"
            ? "bg-[#00e5a0] border-[#00e5a0]"
            : "bg-[#3d9df3] border-[#3d9df3]"
        }`}
      />

      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        {/* Collapsed header */}
        <button
          onClick={onToggle}
          className="w-full text-left px-3.5 py-3 hover:bg-[#0d1117] transition-colors"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[#5a7090]">
                {formatDate(shift.startTime)}
              </span>
              <span className="text-xs text-foreground font-semibold">
                {resolveName(shift.userId)}
              </span>
            </div>
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm w-fit ${statusCls}`}>
              {shift.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-[#5a7090]">
            <span>
              Duration:{" "}
              <span className="text-[#8fa3b8]">
                {formatDurationMin(shift.durationMinutes)}
              </span>
            </span>
            <span>
              Actions:{" "}
              <span className="text-[#8fa3b8]">{shift.actionsCount}</span>
            </span>
            <span>
              Incidents:{" "}
              <span className={shift.incidentsCount > 0 ? "text-[#ff4757]" : "text-[#8fa3b8]"}>
                {shift.incidentsCount}
              </span>
            </span>
            {shift.handoffReceivedBy && (
              <span>
                Handoff to:{" "}
                <span className="text-[#8fa3b8]">
                  {resolveName(shift.handoffReceivedBy)}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 mt-2 text-[10px] text-[#5a7090]">
            <span className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}>
              &#9656;
            </span>
            <span>{isExpanded ? "Collapse" : "Expand"}</span>
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-dark">
            {/* Activity Log */}
            <div className="px-3.5 py-3">
              <div className="text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider mb-2">
                Activity Log
              </div>
              {shift.activities.length === 0 ? (
                <p className="text-xs text-[#5a7090]">No activities logged</p>
              ) : (
                <div className="space-y-1.5">
                  {shift.activities.map((a) => (
                    <div
                      key={a.activityId}
                      className="flex items-start gap-3 text-xs"
                    >
                      <span className="font-mono text-[#5a7090] whitespace-nowrap min-w-[60px]">
                        {formatTime(a.createdAt)}
                      </span>
                      <PriorityBadge priority={a.priority} />
                      <span className="text-foreground">{a.action}</span>
                      {a.notes && (
                        <span className="text-[#5a7090]">— {a.notes}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Watch List */}
            <div className="px-3.5 py-3 border-t border-dark/50">
              <div className="text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider mb-2">
                Watch List
              </div>
              {shift.watchItems.length === 0 ? (
                <p className="text-xs text-[#5a7090]">No watch items</p>
              ) : (
                <div className="space-y-1.5">
                  {shift.watchItems.map((w) => {
                    const severityColors: Record<string, string> = {
                      critical: "text-[#ff4757]",
                      warning: "text-[#f5a623]",
                    };
                    const color = severityColors[w.priority] || "text-[#3d9df3]";
                    return (
                      <div
                        key={w.watchItemId}
                        className="flex items-start gap-3 text-xs"
                      >
                        <span className={`font-bold uppercase text-[9px] ${color}`}>
                          {w.priority}
                        </span>
                        <span className="text-foreground">{w.title}</span>
                        {w.description && (
                          <span className="text-[#5a7090]">
                            — {w.description}
                          </span>
                        )}
                        <span
                          className={`ml-auto text-[9px] font-bold uppercase ${
                            w.status === "resolved"
                              ? "text-[#00e5a0]"
                              : "text-[#f5a623]"
                          }`}
                        >
                          {w.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Handoff Notes */}
            {shift.handoffNotes && (
              <div className="px-3.5 py-3 border-t border-dark/50">
                <div className="text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider mb-2">
                  Handoff Notes
                </div>
                <div className="text-xs text-foreground font-mono whitespace-pre-wrap bg-[#0d1117] border border-dark rounded-sm p-2.5">
                  {shift.handoffNotes}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === "critical"
      ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
      : priority === "warning"
        ? "bg-[rgba(245,166,35,0.12)] text-[#f5a623]"
        : "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]";

  return (
    <span
      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm whitespace-nowrap ${cls}`}
    >
      {priority}
    </span>
  );
}

// ==================== HELPERS ====================

function normalizeShift(s: any): HistoryShift {
  return {
    shiftId: s.shiftId ?? s.shift_id ?? s.id,
    userId: s.userId ?? s.user_id ?? "",
    startTime: s.startTime ?? s.start_time ?? "",
    endTime: s.endTime ?? s.end_time ?? null,
    durationMinutes: s.durationMinutes ?? s.duration_minutes ?? null,
    status: s.status ?? "ended",
    actionsCount: s.actionsCount ?? s.actions_count ?? 0,
    incidentsCount: s.incidentsCount ?? s.incidents_count ?? 0,
    handoffNotes: s.handoffNotes ?? s.handoff_notes ?? null,
    handoffReceivedBy: s.handoffReceivedBy ?? s.handoff_received_by ?? null,
    handoffSubmittedAt:
      s.handoffSubmittedAt ?? s.handoff_submitted_at ?? null,
    activities: (s.activities || []).map((a: any) => ({
      activityId: a.activityId ?? a.activity_id ?? a.id,
      action: a.action ?? "",
      notes: a.notes ?? "",
      priority: a.priority ?? "normal",
      createdAt: a.createdAt ?? a.created_at ?? "",
      userId: a.userId ?? a.user_id ?? "",
    })),
    watchItems: (s.watchItems ?? s.watch_items ?? []).map((w: any) => ({
      watchItemId: w.watchItemId ?? w.watch_item_id ?? w.id,
      title: w.title ?? "",
      description: w.description ?? "",
      priority: w.priority ?? "warning",
      status: w.status ?? "active",
      resolvedAt: w.resolvedAt ?? w.resolved_at ?? null,
    })),
  };
}

function formatDate(ts: string | undefined): string {
  if (!ts) return "--";
  try {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return ts;
  }
}

function formatTime(ts: string | undefined): string {
  if (!ts) return "--";
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return ts;
  }
}

function formatDurationMin(minutes: number | null | undefined): string {
  if (minutes == null) return "--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
