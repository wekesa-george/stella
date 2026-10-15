"use client";

import { useState, useEffect } from "react";
import { getShiftActivities, getShiftWatchList } from "@/lib/stellaAdminApi";

interface ShiftActivity {
  activityId: string;
  action: string;
  notes: string;
  priority: string;
  createdAt: string;
}

interface ShiftWatchItem {
  watchItemId: string;
  title: string;
  description: string;
  priority: string;
  status: string;
}

interface ShiftHistoryDetailProps {
  shiftId: string;
  handoffNotes: string | null;
}

export function ShiftHistoryDetail({ shiftId, handoffNotes }: ShiftHistoryDetailProps) {
  const [activities, setActivities] = useState<ShiftActivity[]>([]);
  const [watchItems, setWatchItems] = useState<ShiftWatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      getShiftActivities(shiftId),
      getShiftWatchList(),
    ])
      .then(([actRes, watchRes]) => {
        if (!mounted) return;

        if (actRes.data && Array.isArray(actRes.data)) {
          setActivities(
            actRes.data.map((a: any) => ({
              activityId: a.activityId ?? a.activity_id ?? a.id,
              action: a.action ?? "",
              notes: a.notes ?? "",
              priority: a.priority ?? "normal",
              createdAt: a.createdAt ?? a.created_at ?? "",
            }))
          );
        }

        if (watchRes.data && Array.isArray(watchRes.data)) {
          setWatchItems(
            watchRes.data.map((w: any) => ({
              watchItemId: w.watchItemId ?? w.watch_item_id ?? w.id,
              title: w.title ?? "",
              description: w.description ?? "",
              priority: w.priority ?? "warning",
              status: w.status ?? "active",
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [shiftId]);

  if (loading) {
    return (
      <div className="px-3.5 py-3 text-xs text-[#5a7090] animate-pulse">
        Loading shift details...
      </div>
    );
  }

  return (
    <div className="border-t border-dark">
      {/* Activity Log */}
      <div className="px-3.5 py-3">
        <div className="text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider mb-2">
          Activity Log
        </div>
        {activities.length === 0 ? (
          <p className="text-xs text-[#5a7090]">No activities logged</p>
        ) : (
          <div className="space-y-1.5">
            {activities.map((a) => (
              <div key={a.activityId} className="flex items-start gap-3 text-xs">
                <span className="font-mono text-[#5a7090] whitespace-nowrap min-w-[60px]">
                  {formatTime(a.createdAt)}
                </span>
                <PriorityBadge priority={a.priority} />
                <span className="text-foreground">{a.action}</span>
                {a.notes && <span className="text-[#5a7090]">— {a.notes}</span>}
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
        {watchItems.length === 0 ? (
          <p className="text-xs text-[#5a7090]">No watch items</p>
        ) : (
          <div className="space-y-1.5">
            {watchItems.map((w) => {
              const severityColors: Record<string, string> = {
                critical: "text-[#ff4757]",
                warning: "text-[#f5a623]",
              };
              const color = severityColors[w.priority] || "text-[#3d9df3]";
              return (
                <div key={w.watchItemId} className="flex items-start gap-3 text-xs">
                  <span className={`font-bold uppercase text-[9px] ${color}`}>{w.priority}</span>
                  <span className="text-foreground">{w.title}</span>
                  {w.description && <span className="text-[#5a7090]">— {w.description}</span>}
                  <span
                    className={`ml-auto text-[9px] font-bold uppercase ${
                      w.status === "resolved" ? "text-[#00e5a0]" : "text-[#f5a623]"
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
      {handoffNotes && (
        <div className="px-3.5 py-3 border-t border-dark/50">
          <div className="text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider mb-2">
            Handoff Notes
          </div>
          <div className="text-xs text-foreground font-mono whitespace-pre-wrap bg-[#0d1117] border border-dark rounded-sm p-2.5">
            {handoffNotes}
          </div>
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === "critical"
      ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
      : priority === "warning"
      ? "bg-[rgba(245,166,35,0.12)] text-[#f5a623]"
      : "bg-[rgba(255,215,0,0.12)] text-[#FFD700]";

  return (
    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm whitespace-nowrap ${cls}`}>
      {priority}
    </span>
  );
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
