"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getCurrentShift,
  startShift as apiStartShift,
  getShiftActivities,
  getShiftWatchList,
  logShiftActivity,
  addToShiftWatchList,
  submitHandoff,
  updateShiftNotes,
  getAdminUsers,
} from "@/lib/stellaAdminApi";
import { useBotChannel } from "@/hooks/usePhoenixChannel";
import { useAdminUser } from "@/components/AdminUserProvider";
import { listBots } from "@/lib/tradingEngineApi";
import { mapApiBotToUiBot } from "@/lib/api/mappers";
import type { Bot } from "@/lib/types/dashboard";
import type { CurrentShift, ShiftLog, WatchItem, AdminUser } from "./types";

// ==================== HELPERS ====================

function formatTime(ts: string | undefined): string {
  if (!ts) return "--";
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return ts;
  }
}

function formatDuration(startTs: string | undefined): string {
  if (!startTs) return "--";
  try {
    const diff = Date.now() - new Date(startTs).getTime();
    if (diff < 0 || isNaN(diff)) return "--";
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  } catch {
    return "--";
  }
}

function normalizePriority(p: string): "normal" | "warning" | "critical" {
  const lower = (p ?? "").toLowerCase();
  if (lower === "critical" || lower === "error") return "critical";
  if (lower === "warning" || lower === "warn") return "warning";
  return "normal";
}

function normalizeSeverity(s: string): "critical" | "warning" | "info" {
  const lower = (s ?? "").toLowerCase();
  if (lower === "critical" || lower === "error") return "critical";
  if (lower === "warning" || lower === "warn") return "warning";
  return "info";
}

function mapActivity(a: any): ShiftLog {
  return {
    id: a.activityId ?? a.activity_id ?? a.id ?? 0,
    timestamp: formatTime(a.createdAt ?? a.created_at ?? a.timestamp),
    user: a.operator ?? a.user ?? a.user_name ?? "--",
    action: a.action ?? a.title ?? "",
    notes: a.notes ?? a.description ?? "",
    priority: normalizePriority(a.priority ?? a.severity),
  };
}

function mapWatchItem(w: any): WatchItem {
  return {
    id: w.watchItemId ?? w.watch_item_id ?? w.id ?? 0,
    title: w.title ?? w.name ?? "",
    description: w.description ?? w.notes ?? "",
    severity: normalizeSeverity(w.priority ?? w.severity),
  };
}

// ==================== HOOK ====================

export function useShiftState() {
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
  const [logAction, setLogAction] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [logPriority, setLogPriority] = useState<string>("normal");
  const [loggingActivity, setLoggingActivity] = useState(false);

  // Watch list form
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
          userId: s.userId ?? s.user_id ?? "",
          user: s.operator ?? s.user ?? s.user_name ?? "--",
          startTime: formatTime(s.startTime ?? s.start_time),
          startTimeRaw: s.startTime ?? s.start_time ?? "",
          duration: formatDuration(s.startTime ?? s.start_time),
          actions: s.actionsCount ?? s.actions_count ?? s.action_count ?? 0,
          incidents: s.incidentsCount ?? s.incidents_count ?? s.incident_count ?? 0,
        };
        setCurrentShift(shift);
        if (s.handoffNotes ?? s.handoff_notes) {
          setHandoffNotes(s.handoffNotes ?? s.handoff_notes);
        }

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

  useEffect(() => {
    loadShiftData();
  }, [loadShiftData]);

  // Load admin users for handoff receiver picker
  useEffect(() => {
    getAdminUsers({ limit: 50, status: "active" })
      .then((res) => {
        if (res.data) {
          const d = res.data as any;
          const list = Array.isArray(d) ? d : d.data || d.users || d.items || [];
          setAdminUsers(
            list.map((u: any) => ({
              id: u.id,
              username: u.displayName || u.display_name || u.username || u.email || u.id.slice(0, 8),
              email: u.email || "",
            }))
          );
        }
      })
      .catch(() => {});
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
      setCurrentShift((prev) =>
        prev ? { ...prev, duration: formatDuration(prev.startTimeRaw) } : prev
      );
    }, 60000);
    return () => clearInterval(interval);
  }, [currentShift?.startTimeRaw]);

  // Derived stats
  const totalEquity = bots.reduce((s, b) => s + b.equity, 0);
  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const running = bots.filter((b) => b.status === "running").length;
  const errors = bots.filter((b) => b.status === "error").length;
  const paused = bots.filter((b) => b.status === "paused").length;
  const criticalLogs = shiftLogs.filter((l) => l.priority === "critical");
  const warningLogs = shiftLogs.filter((l) => l.priority === "warning");

  // ==================== ACTIONS ====================

  const handleStartShift = async () => {
    if (!adminUserId) {
      setError("Could not determine your user ID. Try refreshing the page.");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const result = await apiStartShift({ userId: adminUserId });
      if (result.error) {
        setError(result.error);
        return;
      }
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
        setCurrentShift((prev) =>
          prev
            ? {
                ...prev,
                actions: prev.actions + 1,
                incidents: logPriority === "critical" ? prev.incidents + 1 : prev.incidents,
              }
            : prev
        );
      }
      setLogAction("");
      setLogNotes("");
      setLogPriority("normal");
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

  const resetAfterHandoff = () => {
    setShiftEnded(false);
    setHandoffNotes("");
    setShiftLogs([]);
    setWatchList([]);
  };

  return {
    // State
    currentShift,
    shiftLogs,
    watchList,
    handoffNotes,
    setHandoffNotes,
    adminUsers,
    loading,
    error,
    setError,
    starting,
    submitting,
    savingDraft,
    shiftEnded,
    adminUserId,

    // Log activity form
    logAction,
    setLogAction,
    logNotes,
    setLogNotes,
    logPriority,
    setLogPriority,
    loggingActivity,

    // Watch list form
    watchTitle,
    setWatchTitle,
    watchDescription,
    setWatchDescription,
    watchPriority,
    setWatchPriority,
    addingWatch,

    // Handoff
    receivedBy,
    setReceivedBy,

    // Derived stats
    bots,
    totalEquity,
    totalPnl,
    running,
    errors,
    paused,
    criticalLogs,
    warningLogs,

    // Actions
    handleStartShift,
    handleLogActivity,
    handleAddWatchItem,
    handleSaveDraft,
    handleSubmitHandoff,
    resetAfterHandoff,
    loadShiftData,
  };
}
