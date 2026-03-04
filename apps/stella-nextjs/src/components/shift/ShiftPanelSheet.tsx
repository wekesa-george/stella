"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ShiftLog, WatchItem, AdminUser } from "./types";

type PanelTab = "activity" | "watchlist" | "handoff";

interface ShiftPanelSheetProps {
  open: boolean;
  initialTab: PanelTab;
  onClose: () => void;

  // Activity log
  shiftLogs: ShiftLog[];
  logAction: string;
  setLogAction: (v: string) => void;
  logNotes: string;
  setLogNotes: (v: string) => void;
  logPriority: string;
  setLogPriority: (v: string) => void;
  loggingActivity: boolean;
  onLogActivity: () => void;
  hasActiveShift: boolean;

  // Watch list
  watchList: WatchItem[];
  watchTitle: string;
  setWatchTitle: (v: string) => void;
  watchDescription: string;
  setWatchDescription: (v: string) => void;
  watchPriority: string;
  setWatchPriority: (v: string) => void;
  addingWatch: boolean;
  onAddWatchItem: () => void;

  // Handoff
  handoffNotes: string;
  setHandoffNotes: (v: string) => void;
  receivedBy: string;
  setReceivedBy: (v: string) => void;
  adminUsers: AdminUser[];
  adminUserId: string | null;
  submitting: boolean;
  savingDraft: boolean;
  shiftEnded: boolean;
  onSubmitHandoff: () => void;
  onSaveDraft: () => void;

  // Error
  error: string | null;
  setError: (v: string | null) => void;
}

export function ShiftPanelSheet({
  open,
  initialTab,
  onClose,
  shiftLogs,
  logAction,
  setLogAction,
  logNotes,
  setLogNotes,
  logPriority,
  setLogPriority,
  loggingActivity,
  onLogActivity,
  hasActiveShift,
  watchList,
  watchTitle,
  setWatchTitle,
  watchDescription,
  setWatchDescription,
  watchPriority,
  setWatchPriority,
  addingWatch,
  onAddWatchItem,
  handoffNotes,
  setHandoffNotes,
  receivedBy,
  setReceivedBy,
  adminUsers,
  adminUserId,
  submitting,
  savingDraft,
  shiftEnded,
  onSubmitHandoff,
  onSaveDraft,
  error,
  setError,
}: ShiftPanelSheetProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>(initialTab);

  // Sync initial tab when sheet opens with a different tab
  const [lastInitialTab, setLastInitialTab] = useState(initialTab);
  if (initialTab !== lastInitialTab) {
    setActiveTab(initialTab);
    setLastInitialTab(initialTab);
  }

  const tabs: { id: PanelTab; label: string }[] = [
    { id: "activity", label: "Activity Log" },
    { id: "watchlist", label: "Watch List" },
    { id: "handoff", label: "Handoff" },
  ];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[500px] sm:w-[560px] bg-card border-dark overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">Shift Operations</SheetTitle>
        </SheetHeader>

        {/* Tab buttons */}
        <div className="flex gap-0.5 border-b border-dark mt-3 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "text-[#FFD700] border-[#FFD700]"
                  : "text-[#8fa3b8] border-transparent hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2 flex items-center justify-between mb-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-[#ff4757] hover:text-white ml-2">&times;</button>
          </div>
        )}

        {/* Activity Log Tab */}
        {activeTab === "activity" && (
          <div className="space-y-3">
            {hasActiveShift && (
              <div className="space-y-2.5 bg-[#0d1117] border border-dark rounded-sm p-3">
                <input
                  value={logAction}
                  onChange={(e) => setLogAction(e.target.value)}
                  placeholder="What action did you take?"
                  className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                  autoFocus
                />
                <div className="flex gap-2">
                  <select
                    value={logPriority}
                    onChange={(e) => setLogPriority(e.target.value)}
                    className="bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground focus:outline-none focus:border-dark-2"
                  >
                    <option value="normal">Normal</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                  <button
                    onClick={onLogActivity}
                    disabled={loggingActivity || !logAction.trim()}
                    className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all disabled:opacity-50"
                  >
                    {loggingActivity ? "Logging..." : "Log"}
                  </button>
                </div>
                <textarea
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="Additional notes (optional)"
                  rows={2}
                  className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2 resize-none"
                />
              </div>
            )}

            {shiftLogs.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-[#8fa3b8]">No activities logged this shift</p>
              </div>
            ) : (
              <div className="space-y-1">
                {shiftLogs.map((log) => (
                  <div key={log.id} className="p-2.5 rounded-sm hover:bg-[#0d1117] transition-colors border-b border-dark/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShiftPriorityBadge priority={log.priority} />
                        <span className="font-mono text-xs text-foreground">{log.user}</span>
                      </div>
                      <span className="font-mono text-[10px] text-[#5a7090] whitespace-nowrap">{log.timestamp}</span>
                    </div>
                    <div className="text-xs text-foreground font-semibold mt-1">{log.action}</div>
                    {log.notes && <div className="text-[10px] text-[#8fa3b8] mt-0.5">{log.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Watch List Tab */}
        {activeTab === "watchlist" && (
          <div className="space-y-3">
            {hasActiveShift && (
              <div className="space-y-2.5 bg-[#0d1117] border border-dark rounded-sm p-3">
                <input
                  value={watchTitle}
                  onChange={(e) => setWatchTitle(e.target.value)}
                  placeholder="What should the next operator watch?"
                  className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                  autoFocus
                />
                <div className="flex gap-2">
                  <select
                    value={watchPriority}
                    onChange={(e) => setWatchPriority(e.target.value)}
                    className="bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground focus:outline-none focus:border-dark-2"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                  <button
                    onClick={onAddWatchItem}
                    disabled={addingWatch || !watchTitle.trim()}
                    className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#f5a623] text-black hover:bg-[#ffc107] transition-all disabled:opacity-50"
                  >
                    {addingWatch ? "Adding..." : "Add"}
                  </button>
                </div>
                <textarea
                  value={watchDescription}
                  onChange={(e) => setWatchDescription(e.target.value)}
                  placeholder="Description / context (optional)"
                  rows={2}
                  className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2 resize-none"
                />
              </div>
            )}

            {watchList.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-[#8fa3b8]">No items on watch list</p>
              </div>
            ) : (
              <div className="space-y-2">
                {watchList.map((item) => {
                  const colors =
                    item.severity === "critical"
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
                })}
              </div>
            )}
          </div>
        )}

        {/* Handoff Tab */}
        {activeTab === "handoff" && (
          <div className="space-y-3">
            {shiftEnded ? (
              <div className="text-center py-6">
                <p className="text-xs font-bold uppercase tracking-wider text-[#FFD700] mb-1">Shift Handed Off Successfully</p>
                <p className="text-[10px] text-[#8fa3b8]">Your shift has been submitted.</p>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-2">
                    Important Information for Next Shift
                  </div>
                  <textarea
                    value={handoffNotes}
                    onChange={(e) => setHandoffNotes(e.target.value)}
                    placeholder="Document any ongoing issues, monitoring points, or important context for the next operator..."
                    className="w-full bg-[#0d1117] border border-dark rounded-sm px-3 py-2.5 text-foreground text-xs font-mono resize-none focus:outline-none focus:border-[#253550]"
                    rows={8}
                    disabled={!hasActiveShift}
                  />
                </div>

                {hasActiveShift && (
                  <div>
                    <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-2">Hand Off To</div>
                    <select
                      value={receivedBy}
                      onChange={(e) => setReceivedBy(e.target.value)}
                      className="w-full bg-[#0d1117] border border-dark rounded-sm px-3 py-2 text-xs text-foreground focus:outline-none focus:border-[#253550]"
                    >
                      <option value="">Select next operator...</option>
                      {adminUsers
                        .filter((u) => u.id !== adminUserId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.username} {u.email ? `(${u.email})` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={onSubmitHandoff}
                    disabled={submitting || !hasActiveShift || !receivedBy}
                    className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Submitting..." : "Submit Handoff"}
                  </button>
                  <button
                    onClick={onSaveDraft}
                    disabled={!hasActiveShift || savingDraft}
                    className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-[#253550] hover:text-foreground transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingDraft ? "Saving..." : "Save Draft"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ShiftPriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === "critical"
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
