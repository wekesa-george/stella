"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  getIncidents,
  getOpenIncidents,
  getKillSwitchActivations,
  getRogueBotIncidents,
  getIncidentSummary,
  createIncident,
  updateIncident,
  escalateIncident,
  resolveIncident,
  countersignIncident,
  logNilShift,
  createKillSwitch,
  createRogueBotIncident,
  getShiftRegister,
  archiveIncidentMonth,
  getArchivedMonths,
  createIncidentCorrection,
} from "@/lib/stellaAdminApi";
import { useShiftState } from "@/components/shift/useShiftState";
import { ActiveShiftBar } from "@/components/shift/ActiveShiftBar";
import { ShiftPanelSheet } from "@/components/shift/ShiftPanelSheet";
import { ShiftHistoryDetail } from "@/components/shift/ShiftHistoryDetail";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ============================================================================
// Types & Constants
// ============================================================================

type IncidentPriority = "P1" | "P2" | "P3" | "P4";
type IncidentCategory = "bot_error" | "rogue_bot" | "kill_switch" | "api_issue" | "pnl_loss_limit" | "balance" | "security" | "nil_shift" | "other";
type IncidentStatus = "open" | "escalated" | "resolved";
type KillSwitchScope = "single_bot" | "all_bots" | "platform";
type ShiftType = "AM" | "PM" | "Night" | "Weekend";
type TabId = "monthly" | "open" | "kill-switch" | "rogue-bot" | "shift-register" | "summary";

interface Incident {
  id: string;
  incidentNumber: string;
  shiftId: string | null;
  operatorId: string;
  date: string;
  timeDetected: string | null;
  shiftType: ShiftType;
  priority: IncidentPriority;
  category: IncidentCategory;
  botRef: string | null;
  accountRef: string | null;
  title: string;
  description: string | null;
  actionTaken: string | null;
  supervisorNotified: boolean;
  supervisorId: string | null;
  supervisorNotifiedAt: string | null;
  supervisorCountersignedBy: string | null;
  supervisorCountersignedAt: string | null;
  timeToContainMins: number | null;
  timeToResolveMins: number | null;
  status: IncidentStatus;
  escalatedTo: string | null;
  pnlImpactUsd: number;
  killSwitchActivated: boolean;
  rootCause: string | null;
  preventable: string | null;
  notes: string | null;
  correctsIncidentId: string | null;
  isCorrection: boolean;
  createdAt: string;
  updatedAt: string;
  killSwitchActivations?: KillSwitchActivation[];
  rogueBotIncidents?: RogueBotIncident[];
  daysOpen?: number;
}

interface KillSwitchActivation {
  id: string;
  incidentId: string;
  incidentNumber?: string;
  date: string;
  timeActivated: string;
  operatorId: string;
  scope: KillSwitchScope;
  botsAffected: string[];
  accountRefs: string[];
  reason: string;
  openOrdersAtActivation: string | null;
  pnlAtActivationUsd: number | null;
  timeToResolveInterval: string | null;
  authorizedRestartBy: string | null;
  authorizedRestartAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface RogueBotIncident {
  id: string;
  incidentId: string;
  incidentNumber?: string;
  date: string;
  timeDetected: string;
  operatorId: string;
  botRef: string;
  accountRef: string | null;
  rogueBehaviourObserved: string;
  normalFreqPerHour: number | null;
  rogueFreqPerHour: number | null;
  wrongPair: boolean;
  wrongDirection: boolean;
  immediateAction: string | null;
  killSwitchActivated: boolean;
  pnlImpactUsd: number;
  rootCause: string | null;
  createdAt: string;
}

interface IncidentSummary {
  byPriority: { priority: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byShift: { shift_type: string; count: number }[];
  metrics: {
    kill_switch_count: number;
    rogue_bot_count: number;
    open_count: number;
    nil_shift_count: number;
    avg_contain_p1_mins: number | null;
    total_pnl_impact: number;
  };
}

interface ShiftRegisterRow {
  shift_id: string;
  operator_id: string;
  start_time: string;
  end_time: string | null;
  shift_status: string;
  shift_type: ShiftType | null;
  handoff_notes: string | null;
  total_incidents: number;
  p1_count: number;
  p2_count: number;
  p3_count: number;
  p4_count: number;
  kill_switch_activated: boolean;
}

interface ArchivedMonth {
  month: string;
  count: number;
}

const PRIORITY_CONFIG: Record<IncidentPriority, { label: string; color: string; bg: string; border: string; rowBg: string }> = {
  P1: { label: "P1 — Critical", color: "#ff4757", bg: "rgba(255,71,87,0.15)", border: "#ff4757", rowBg: "rgba(255,71,87,0.06)" },
  P2: { label: "P2 — High", color: "#f5a623", bg: "rgba(245,166,35,0.15)", border: "#f5a623", rowBg: "rgba(245,166,35,0.06)" },
  P3: { label: "P3 — Medium", color: "#FFD700", bg: "rgba(255,214,0,0.12)", border: "#FFD700", rowBg: "rgba(255,214,0,0.04)" },
  P4: { label: "P4 — Low", color: "#00e5a0", bg: "rgba(0,229,160,0.12)", border: "#00e5a0", rowBg: "rgba(0,229,160,0.04)" },
};

const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  bot_error: "Bot Error", rogue_bot: "Rogue Bot", kill_switch: "Kill Switch",
  api_issue: "API Issue", pnl_loss_limit: "P&L / Loss Limit", balance: "Balance",
  security: "Security", nil_shift: "NIL Shift", other: "Other",
};

const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#3d9df3", bg: "rgba(61,157,243,0.12)" },
  escalated: { label: "Escalated", color: "#f5a623", bg: "rgba(245,166,35,0.12)" },
  resolved: { label: "Resolved", color: "#00e5a0", bg: "rgba(0,229,160,0.12)" },
};

const SCOPE_LABELS: Record<KillSwitchScope, string> = {
  single_bot: "Single Bot", all_bots: "All Bots", platform: "Platform",
};

const ALL_CATEGORIES: IncidentCategory[] = ["bot_error", "rogue_bot", "kill_switch", "api_issue", "pnl_loss_limit", "balance", "security", "nil_shift", "other"];

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(d: string): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrency(val: number): string {
  if (val === 0) return "$0";
  const prefix = val < 0 ? "-" : "";
  return `${prefix}$${Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ============================================================================
// Mock Data (fallback until API is connected)
// ============================================================================

function generateMockIncidents(): Incident[] {
  return [
    {
      id: "1", incidentNumber: "INC-2026-0001", shiftId: null, operatorId: "op1",
      date: "2026-03-01", timeDetected: "06:42", shiftType: "AM", priority: "P2",
      category: "bot_error", botRef: "BOT-02", accountRef: "ACC-001",
      title: "Bot-02 error state at shift start",
      description: "Bot entered ERROR state at 06:42. Error code: E_CONN_TIMEOUT. Dashboard showed last heartbeat 4 minutes prior. API/WS active at 06:31.",
      actionTaken: "Attempted restart per Sec 8.1 Step 3. Bot returned to ACTIVE after 2nd attempt at 06:51.",
      supervisorNotified: true, supervisorId: null, supervisorNotifiedAt: "2026-03-01T06:45:00Z",
      supervisorCountersignedBy: null, supervisorCountersignedAt: null,
      timeToContainMins: 9, timeToResolveMins: null,
      status: "resolved", escalatedTo: null, pnlImpactUsd: 0,
      killSwitchActivated: false, rootCause: "API connection timeout — resolved on reconnect.",
      preventable: "Partially", notes: "Monitor Bot-02 for recurrence. Check API latency logs 06:30-06:45.",
      correctsIncidentId: null, isCorrection: false,
      createdAt: "2026-03-01T06:42:00Z", updatedAt: "2026-03-01T07:00:00Z",
    },
    {
      id: "2", incidentNumber: "INC-2026-0002", shiftId: null, operatorId: "op1",
      date: "2026-03-01", timeDetected: "08:15", shiftType: "AM", priority: "P1",
      category: "rogue_bot", botRef: "BOT-05", accountRef: "ACC-002",
      title: "Bot-05 runaway loop — kill switch activated",
      description: "Bot-05 placed 63 orders on BTCUSDT in 18 seconds. Trade frequency 350x normal baseline. All orders same size, 8 & 6. Screenshot taken. P1 raised. Supervisor called.",
      actionTaken: "Kill switch activated (Bot-05 only) at 08:16 per Sec 8.5 & 8.6. Screenshot taken. P1 raised. Supervisor called.",
      supervisorNotified: true, supervisorId: null, supervisorNotifiedAt: "2026-03-01T08:16:00Z",
      supervisorCountersignedBy: null, supervisorCountersignedAt: null,
      timeToContainMins: 1, timeToResolveMins: null,
      status: "escalated", escalatedTo: "Head of Ops notified",
      pnlImpactUsd: -1240,
      killSwitchActivated: true,
      rootCause: "Under investigation — suspected config corruption after overnight update.",
      preventable: "Yes", notes: "PIR scheduled 03/03. Bot-05 offline pending technical review. Full P1 report filed REF: P1-2026-001.",
      correctsIncidentId: null, isCorrection: false,
      createdAt: "2026-03-01T08:15:00Z", updatedAt: "2026-03-01T12:30:00Z",
      daysOpen: 3,
    },
    {
      id: "3", incidentNumber: "INC-2026-0003", shiftId: null, operatorId: "op2",
      date: "2026-03-01", timeDetected: "14:00", shiftType: "PM", priority: "P4",
      category: "nil_shift", botRef: null, accountRef: null,
      title: "No incidents during PM shift",
      description: "All bots remained in ACTIVE or STANDBY state throughout shift. API stable. P&L within expected range.",
      actionTaken: "No action required.", supervisorNotified: false, supervisorId: null,
      supervisorNotifiedAt: null, supervisorCountersignedBy: null, supervisorCountersignedAt: null,
      timeToContainMins: null, timeToResolveMins: null,
      status: "resolved", escalatedTo: null, pnlImpactUsd: 0,
      killSwitchActivated: false, rootCause: null, preventable: null,
      notes: "Shift handover completed. Incoming operator M. Khan briefed.",
      correctsIncidentId: null, isCorrection: false,
      createdAt: "2026-03-01T14:00:00Z", updatedAt: "2026-03-01T22:00:00Z",
    },
  ];
}

function generateMockKillSwitch(): KillSwitchActivation[] {
  return [{
    id: "ks1", incidentId: "2", incidentNumber: "INC-2026-0002",
    date: "2026-03-01", timeActivated: "08:16", operatorId: "op1",
    scope: "single_bot", botsAffected: ["BOT-05"], accountRefs: ["ACC-002"],
    reason: "Rogue bot — runaway order loop placing 63 orders in 18 seconds",
    openOrdersAtActivation: "Yes — 12 open limit orders",
    pnlAtActivationUsd: -1240, timeToResolveInterval: "4 hours",
    authorizedRestartBy: "Head of Ops — M. Davies 12:30",
    authorizedRestartAt: null, notes: "Bot-05 offline pending technical review. PIR filed.",
    createdAt: "2026-03-01T08:16:00Z",
  }];
}

function generateMockRogueBot(): RogueBotIncident[] {
  return [{
    id: "rb1", incidentId: "2", incidentNumber: "INC-2026-0002",
    date: "2026-03-01", timeDetected: "08:15", operatorId: "op1",
    botRef: "BOT-05", accountRef: "ACC-002",
    rogueBehaviourObserved: "Runaway order loop — 63 orders in 18 seconds on BTC/USDT",
    normalFreqPerHour: 12, rogueFreqPerHour: 210,
    wrongPair: false, wrongDirection: false,
    immediateAction: "Kill switch activated (BOT-05 only) at 08:16. Supervisor called immediately.",
    killSwitchActivated: true, pnlImpactUsd: -1240,
    rootCause: "Under investigation — suspected config corruption",
    createdAt: "2026-03-01T08:15:00Z",
  }];
}

function generateMockSummary(): IncidentSummary {
  return {
    byPriority: [
      { priority: "P1", count: 1 }, { priority: "P2", count: 1 },
      { priority: "P3", count: 0 }, { priority: "P4", count: 3 },
    ],
    byCategory: [
      { category: "bot_error", count: 1 }, { category: "rogue_bot", count: 1 },
      { category: "kill_switch", count: 1 }, { category: "api_issue", count: 0 },
      { category: "pnl_loss_limit", count: 0 }, { category: "balance", count: 0 },
      { category: "security", count: 0 }, { category: "other", count: 2 },
    ],
    byShift: [
      { shift_type: "AM", count: 3 }, { shift_type: "PM", count: 1 },
      { shift_type: "Night", count: 1 }, { shift_type: "Weekend", count: 0 },
    ],
    metrics: {
      kill_switch_count: 1, rogue_bot_count: 1, open_count: 1,
      nil_shift_count: 2, avg_contain_p1_mins: 4, total_pnl_impact: -1240,
    },
  };
}

// ============================================================================
// Sub-components
// ============================================================================

function PriorityBadge({ priority }: { priority: IncidentPriority }) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider"
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider"
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}

function ShiftBadge({ shiftType }: { shiftType: ShiftType }) {
  const colors: Record<ShiftType, string> = {
    AM: "#3d9df3", PM: "#f5a623", Night: "#8b5cf6", Weekend: "#6b7280",
  };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider"
      style={{ color: colors[shiftType], backgroundColor: `${colors[shiftType]}20` }}
    >
      {shiftType}
    </span>
  );
}

function CategoryBadge({ category }: { category: IncidentCategory }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-medium bg-[rgba(138,163,184,0.12)] text-[#8fa3b8]">
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

function YesNoBadge({ value }: { value: boolean }) {
  return value ? (
    <span className="text-[10px] font-bold text-[#ff4757] bg-[rgba(255,71,87,0.12)] px-2 py-0.5 rounded-sm">YES</span>
  ) : (
    <span className="text-[10px] font-medium text-[#5a7090]">No</span>
  );
}

function ScopeBadge({ scope }: { scope: KillSwitchScope }) {
  const colors: Record<KillSwitchScope, string> = {
    single_bot: "#f5a623", all_bots: "#ff4757", platform: "#ff4757",
  };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider"
      style={{ color: colors[scope], backgroundColor: `${colors[scope]}20` }}
    >
      {SCOPE_LABELS[scope]}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-[rgba(138,163,184,0.08)] flex items-center justify-center mb-3">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 6h2v5H9V6zm0 6h2v2H9v-2z" fill="#5a7090"/></svg>
      </div>
      <p className="text-sm text-[#5a7090]">{message}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full bg-[#1a2230]" />
      ))}
    </div>
  );
}

// ============================================================================
// Tab: Monthly Incident Log
// ============================================================================

function MonthlyLogTab({
  incidents,
  loading,
  month,
  setMonth,
  filterPriority,
  setFilterPriority,
  filterCategory,
  setFilterCategory,
  filterStatus,
  setFilterStatus,
  onNewIncident,
  onNilShift,
  onSelectIncident,
}: {
  incidents: Incident[];
  loading: boolean;
  month: string;
  setMonth: (m: string) => void;
  filterPriority: string;
  setFilterPriority: (p: string) => void;
  filterCategory: string;
  setFilterCategory: (c: string) => void;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  onNewIncident: () => void;
  onNilShift: () => void;
  onSelectIncident: (inc: Incident) => void;
}) {
  const filtered = incidents.filter((inc) => {
    if (filterPriority !== "all" && inc.priority !== filterPriority) return false;
    if (filterCategory !== "all" && inc.category !== filterCategory) return false;
    if (filterStatus !== "all" && inc.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-[160px] h-8 bg-[#131920] border-dark text-sm"
        />
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[110px] h-8 bg-[#131920] border-dark text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="P1">P1 — Critical</SelectItem>
            <SelectItem value="P2">P2 — High</SelectItem>
            <SelectItem value="P3">P3 — Medium</SelectItem>
            <SelectItem value="P4">P4 — Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[130px] h-8 bg-[#131920] border-dark text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {ALL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[110px] h-8 bg-[#131920] border-dark text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-8 text-xs border-dark text-[#8fa3b8] hover:text-foreground" onClick={onNilShift}>
          Log NIL Shift
        </Button>
        <Button size="sm" className="h-8 text-xs bg-[#FFD700] text-[#080c10] hover:bg-[#e6c300] font-semibold" onClick={onNewIncident}>
          + New Incident
        </Button>
      </div>

      {loading ? <LoadingSkeleton /> : filtered.length === 0 ? (
        <EmptyState message="No incidents found for the selected filters." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-dark">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#131920] hover:bg-[#131920]">
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[130px]">Incident ID</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[90px]">Date</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[60px]">Time</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[60px]">Shift</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[55px]">Priority</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[100px]">Category</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[70px]">Bot</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Title</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[85px]">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[85px] text-right">P&L Impact</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] w-[65px]">Kill Switch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inc) => {
                const pConfig = PRIORITY_CONFIG[inc.priority];
                return (
                  <TableRow
                    key={inc.id}
                    className="cursor-pointer transition-colors"
                    style={{ backgroundColor: pConfig.rowBg, borderLeft: `3px solid ${pConfig.border}` }}
                    onClick={() => onSelectIncident(inc)}
                  >
                    <TableCell className="font-mono text-xs text-[#FFD700]">{inc.incidentNumber}</TableCell>
                    <TableCell className="text-xs text-[#8fa3b8]">{formatDate(inc.date)}</TableCell>
                    <TableCell className="font-mono text-xs text-[#8fa3b8]">{inc.timeDetected ?? "—"}</TableCell>
                    <TableCell><ShiftBadge shiftType={inc.shiftType} /></TableCell>
                    <TableCell><PriorityBadge priority={inc.priority} /></TableCell>
                    <TableCell><CategoryBadge category={inc.category} /></TableCell>
                    <TableCell className="font-mono text-xs text-[#8fa3b8]">{inc.botRef ?? "—"}</TableCell>
                    <TableCell className="text-xs text-foreground max-w-[250px] truncate" title={inc.title}>{inc.title}</TableCell>
                    <TableCell><StatusBadge status={inc.status} /></TableCell>
                    <TableCell className={cn("text-xs font-mono text-right", inc.pnlImpactUsd < 0 ? "text-[#ff4757]" : "text-[#8fa3b8]")}>
                      {formatCurrency(inc.pnlImpactUsd)}
                    </TableCell>
                    <TableCell><YesNoBadge value={inc.killSwitchActivated} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Open Incidents
// ============================================================================

function OpenIncidentsTab({ incidents, loading, onSelectIncident }: {
  incidents: Incident[];
  loading: boolean;
  onSelectIncident: (inc: Incident) => void;
}) {
  const openIncidents = incidents.filter((i) => i.status !== "resolved");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(61,157,243,0.08)] border border-[rgba(61,157,243,0.2)]">
          <div className="w-2 h-2 rounded-full bg-[#3d9df3] animate-pulse" />
          <span className="text-xs text-[#3d9df3] font-medium">{openIncidents.length} open incident{openIncidents.length !== 1 ? "s" : ""}</span>
        </div>
        <p className="text-[10px] text-[#5a7090]">Update this sheet whenever a Monthly Log incident changes status to Open, Escalated, or when an open incident is resolved. Supervisor review tool — checked at every shift handover.</p>
      </div>

      {loading ? <LoadingSkeleton /> : openIncidents.length === 0 ? (
        <EmptyState message="No open or escalated incidents. All clear." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-dark">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#131920] hover:bg-[#131920]">
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Incident ID</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Date Raised</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Priority</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Category</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Title</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Account</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Days Open</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Last Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openIncidents.map((inc) => {
                const daysOpen = inc.daysOpen ?? Math.ceil((Date.now() - new Date(inc.date).getTime()) / 86400000);
                const pConfig = PRIORITY_CONFIG[inc.priority];
                return (
                  <TableRow
                    key={inc.id}
                    className="cursor-pointer transition-colors"
                    style={{ backgroundColor: pConfig.rowBg, borderLeft: `3px solid ${pConfig.border}` }}
                    onClick={() => onSelectIncident(inc)}
                  >
                    <TableCell className="font-mono text-xs text-[#FFD700]">{inc.incidentNumber}</TableCell>
                    <TableCell className="text-xs text-[#8fa3b8]">{formatDate(inc.date)}</TableCell>
                    <TableCell><PriorityBadge priority={inc.priority} /></TableCell>
                    <TableCell><CategoryBadge category={inc.category} /></TableCell>
                    <TableCell className="text-xs text-foreground max-w-[200px] truncate">{inc.title}</TableCell>
                    <TableCell className="font-mono text-xs text-[#8fa3b8]">{inc.accountRef ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={inc.status} /></TableCell>
                    <TableCell className={cn("text-xs font-mono font-bold", daysOpen > 3 ? "text-[#ff4757]" : "text-[#8fa3b8]")}>{daysOpen}d</TableCell>
                    <TableCell className="text-xs text-[#5a7090]">{new Date(inc.updatedAt).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Kill Switch Register
// ============================================================================

function KillSwitchTab({ activations, loading }: {
  activations: KillSwitchActivation[];
  loading: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md bg-[rgba(255,71,87,0.06)] border border-[rgba(255,71,87,0.2)] px-4 py-2">
        <p className="text-[11px] text-[#ff4757] font-medium">Every kill switch activation — whether individual bot or full platform — requires a separate entry in this register AND a P1 incident record in the Monthly Log.</p>
      </div>

      {loading ? <LoadingSkeleton /> : activations.length === 0 ? (
        <EmptyState message="No kill switch activations recorded this month." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[rgba(255,71,87,0.3)]">
          <Table className="table-fixed w-full min-w-[1100px]">
            <TableHeader>
              <TableRow className="bg-[rgba(255,71,87,0.08)] hover:bg-[rgba(255,71,87,0.08)]">
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[90px]">Incident ID</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[80px]">Date</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[65px]">Time</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[80px]">Scope</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[80px]">Bots</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8]">Reason</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[100px]">Open Orders</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[85px] text-right">P&L</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[80px]">Resolve</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[120px]">Auth. Restart</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[130px]">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activations.map((ks) => (
                <TableRow key={ks.id} className="hover:bg-[rgba(255,71,87,0.04)]">
                  <TableCell className="font-mono text-xs text-[#FFD700] truncate">{ks.incidentNumber ?? "—"}</TableCell>
                  <TableCell className="text-xs text-[#8fa3b8] truncate">{formatDate(ks.date)}</TableCell>
                  <TableCell className="font-mono text-xs text-[#8fa3b8] truncate">{ks.timeActivated}</TableCell>
                  <TableCell><ScopeBadge scope={ks.scope} /></TableCell>
                  <TableCell className="font-mono text-xs text-foreground truncate">{ks.botsAffected?.join(", ") ?? "—"}</TableCell>
                  <TableCell className="text-xs text-foreground truncate" title={ks.reason}>{ks.reason}</TableCell>
                  <TableCell className="text-xs text-[#8fa3b8] truncate" title={ks.openOrdersAtActivation ?? undefined}>{ks.openOrdersAtActivation ?? "—"}</TableCell>
                  <TableCell className={cn("text-xs font-mono text-right truncate", (ks.pnlAtActivationUsd ?? 0) < 0 ? "text-[#ff4757]" : "text-[#8fa3b8]")}>
                    {ks.pnlAtActivationUsd != null ? formatCurrency(ks.pnlAtActivationUsd) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-[#8fa3b8] truncate">{typeof ks.timeToResolveInterval === 'object' && ks.timeToResolveInterval ? Object.entries(ks.timeToResolveInterval).map(([k, v]) => `${v} ${k}`).join(' ') : (ks.timeToResolveInterval ?? "—")}</TableCell>
                  <TableCell className="text-xs text-[#8fa3b8] truncate" title={ks.authorizedRestartBy ?? undefined}>{ks.authorizedRestartBy ?? "—"}</TableCell>
                  <TableCell className="text-xs text-[#5a7090] truncate" title={ks.notes ?? undefined}>{ks.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Rogue Bot Log
// ============================================================================

function RogueBotTab({ rogueBots, loading }: {
  rogueBots: RogueBotIncident[];
  loading: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md bg-[rgba(139,44,44,0.15)] border border-[rgba(139,44,44,0.4)] px-4 py-2">
        <p className="text-[11px] text-[#ff9fa8] font-medium">All confirmed or suspected rogue bot incidents. Every entry must have a corresponding P1 incident in the Monthly Log.</p>
      </div>

      {loading ? <LoadingSkeleton /> : rogueBots.length === 0 ? (
        <EmptyState message="No rogue bot incidents recorded this month." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[rgba(139,44,44,0.4)]">
          <Table className="table-fixed w-full min-w-[1100px]">
            <TableHeader>
              <TableRow className="bg-[rgba(139,44,44,0.12)] hover:bg-[rgba(139,44,44,0.12)]">
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[90px]">Incident ID</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[80px]">Date</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[65px]">Time</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[65px]">Bot</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[70px]">Account</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8]">Rogue Behaviour</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[60px] text-right">Norm.</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[60px] text-right">Rogue</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[50px]">Pair?</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[45px]">Dir?</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[140px]">Immediate Action</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[45px]">KS?</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[75px] text-right">P&L</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#ff9fa8] w-[140px]">Root Cause</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rogueBots.map((rb) => {
                const isExtreme = rb.rogueFreqPerHour != null && rb.normalFreqPerHour != null && rb.rogueFreqPerHour > rb.normalFreqPerHour * 5;
                return (
                  <TableRow key={rb.id} className="hover:bg-[rgba(139,44,44,0.06)]">
                    <TableCell className="font-mono text-xs text-[#FFD700] truncate">{rb.incidentNumber ?? "—"}</TableCell>
                    <TableCell className="text-xs text-[#8fa3b8] truncate">{formatDate(rb.date)}</TableCell>
                    <TableCell className="font-mono text-xs text-[#8fa3b8] truncate">{rb.timeDetected}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground font-bold truncate">{rb.botRef}</TableCell>
                    <TableCell className="font-mono text-xs text-[#8fa3b8] truncate">{rb.accountRef ?? "—"}</TableCell>
                    <TableCell className="text-xs text-foreground truncate" title={rb.rogueBehaviourObserved}>{rb.rogueBehaviourObserved}</TableCell>
                    <TableCell className="text-xs font-mono text-right text-[#8fa3b8]">{rb.normalFreqPerHour != null ? `~${rb.normalFreqPerHour}` : "—"}</TableCell>
                    <TableCell className={cn("text-xs font-mono text-right font-bold", isExtreme ? "text-[#ff4757]" : "text-[#8fa3b8]")}>
                      {rb.rogueFreqPerHour != null ? `~${rb.rogueFreqPerHour}` : "—"}
                    </TableCell>
                    <TableCell><YesNoBadge value={rb.wrongPair} /></TableCell>
                    <TableCell><YesNoBadge value={rb.wrongDirection} /></TableCell>
                    <TableCell className="text-xs text-foreground truncate" title={rb.immediateAction ?? undefined}>{rb.immediateAction ?? "—"}</TableCell>
                    <TableCell><YesNoBadge value={rb.killSwitchActivated} /></TableCell>
                    <TableCell className={cn("text-xs font-mono text-right truncate", rb.pnlImpactUsd < 0 ? "text-[#ff4757]" : "text-[#8fa3b8]")}>
                      {formatCurrency(rb.pnlImpactUsd)}
                    </TableCell>
                    <TableCell className="text-xs text-[#5a7090] truncate" title={rb.rootCause ?? undefined}>{rb.rootCause ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Shift Register
// ============================================================================

function ShiftRegisterTab({ initialMonth }: {
  initialMonth: string;
}) {
  const [srMonth, setSrMonth] = useState(initialMonth);
  const [shifts, setShifts] = useState<ShiftRegisterRow[]>([]);
  const [srLoading, setSrLoading] = useState(true);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "timeline">("table");

  const fetchShifts = useCallback(async (m: string) => {
    setSrLoading(true);
    try {
      const res = await getShiftRegister(m);
      const d = res.data as any;
      setShifts(d?.shifts ?? d ?? []);
    } catch {
      setShifts([]);
    } finally {
      setSrLoading(false);
    }
  }, []);

  useEffect(() => { fetchShifts(srMonth); }, [srMonth, fetchShifts]);

  const monthLabel = new Date(srMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="month"
          value={srMonth}
          onChange={(e) => setSrMonth(e.target.value)}
          className="w-[160px] h-8 bg-[#131920] border-dark text-sm"
        />
        <h2 className="text-sm font-bold text-foreground">Shift Register — {monthLabel}</h2>
        <span className="text-[10px] text-[#5a7090]">{shifts.length} shifts</span>
        <div className="flex-1" />
        {/* View toggle */}
        <div className="flex items-center rounded-md border border-dark overflow-hidden">
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
              viewMode === "table"
                ? "bg-[rgba(255,215,0,0.12)] text-[#FFD700]"
                : "text-[#5a7090] hover:text-[#8fa3b8]"
            )}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={cn(
              "px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-l border-dark",
              viewMode === "timeline"
                ? "bg-[rgba(255,215,0,0.12)] text-[#FFD700]"
                : "text-[#5a7090] hover:text-[#8fa3b8]"
            )}
          >
            Timeline
          </button>
        </div>
      </div>

      {srLoading ? <LoadingSkeleton /> : shifts.length === 0 ? (
        <EmptyState message="No shifts recorded for this month." />
      ) : viewMode === "table" ? (
        /* ===== TABLE VIEW ===== */
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-dark hover:bg-transparent">
                <TableHead className="text-[10px] text-[#5a7090] font-bold uppercase h-8">Date</TableHead>
                <TableHead className="text-[10px] text-[#5a7090] font-bold uppercase h-8">Shift</TableHead>
                <TableHead className="text-[10px] text-[#5a7090] font-bold uppercase h-8">Status</TableHead>
                <TableHead className="text-[10px] text-[#5a7090] font-bold uppercase h-8 text-center">Total</TableHead>
                <TableHead className="text-[10px] font-bold uppercase h-8 text-center" style={{ color: PRIORITY_CONFIG.P1.color }}>P1</TableHead>
                <TableHead className="text-[10px] font-bold uppercase h-8 text-center" style={{ color: PRIORITY_CONFIG.P2.color }}>P2</TableHead>
                <TableHead className="text-[10px] font-bold uppercase h-8 text-center" style={{ color: PRIORITY_CONFIG.P3.color }}>P3</TableHead>
                <TableHead className="text-[10px] font-bold uppercase h-8 text-center" style={{ color: PRIORITY_CONFIG.P4.color }}>P4</TableHead>
                <TableHead className="text-[10px] text-[#5a7090] font-bold uppercase h-8 text-center">Kill Switch</TableHead>
                <TableHead className="text-[10px] text-[#5a7090] font-bold uppercase h-8">Handoff Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((row) => {
                const hasP1 = row.p1_count > 0;
                const isNil = row.total_incidents === 0;
                const isExpanded = expandedShiftId === row.shift_id;
                return (
                  <React.Fragment key={row.shift_id}>
                    <TableRow
                      className="border-dark cursor-pointer hover:bg-[#0d1117] transition-colors"
                      style={{
                        backgroundColor: hasP1
                          ? PRIORITY_CONFIG.P1.rowBg
                          : isNil
                          ? "rgba(138,150,170,0.03)"
                          : undefined,
                        borderLeft: hasP1
                          ? `3px solid ${PRIORITY_CONFIG.P1.border}`
                          : isNil
                          ? "3px solid #5a7090"
                          : undefined,
                      }}
                      onClick={() => setExpandedShiftId(isExpanded ? null : row.shift_id)}
                    >
                      <TableCell className="text-xs text-[#8fa3b8] font-mono py-2">
                        <span className="flex items-center gap-1.5">
                          <span className={`transition-transform text-[10px] text-[#5a7090] ${isExpanded ? "rotate-90" : ""}`}>&#9656;</span>
                          {row.start_time ? formatDate(row.start_time) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        {row.shift_type ? <ShiftBadge shiftType={row.shift_type} /> : <span className="text-xs text-[#5a7090]">—</span>}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider",
                          row.shift_status === "completed" ? "text-[#00e5a0] bg-[rgba(0,229,160,0.12)]" :
                          row.shift_status === "active" ? "text-[#3d9df3] bg-[rgba(61,157,243,0.12)]" :
                          "text-[#5a7090] bg-[rgba(138,150,170,0.08)]"
                        )}>
                          {row.shift_status ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <span className={cn("text-xs font-mono font-bold", row.total_incidents > 0 ? "text-foreground" : "text-[#5a7090]")}>
                          {row.total_incidents}
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <span className={cn("text-xs font-mono font-bold", row.p1_count > 0 ? "text-[#ff4757]" : "text-[#5a7090]")}>
                          {row.p1_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <span className={cn("text-xs font-mono font-bold", row.p2_count > 0 ? "text-[#f5a623]" : "text-[#5a7090]")}>
                          {row.p2_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <span className={cn("text-xs font-mono font-bold", row.p3_count > 0 ? "text-[#FFD700]" : "text-[#5a7090]")}>
                          {row.p3_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <span className={cn("text-xs font-mono font-bold", row.p4_count > 0 ? "text-[#00e5a0]" : "text-[#5a7090]")}>
                          {row.p4_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <YesNoBadge value={row.kill_switch_activated} />
                      </TableCell>
                      <TableCell className="text-xs text-[#8fa3b8] py-2 max-w-[200px] truncate">
                        {row.handoff_notes ?? "—"}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="border-dark">
                        <TableCell colSpan={10} className="p-0">
                          <ShiftHistoryDetail shiftId={row.shift_id} handoffNotes={row.handoff_notes} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
          {/* Totals row */}
          <div className="border-t border-dark bg-[rgba(255,214,0,0.04)] px-4 py-2 flex items-center gap-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFD700]">Totals</span>
            <div className="flex items-center gap-4 ml-auto">
              <span className="text-xs text-[#5a7090]">Total: <span className="font-bold text-foreground font-mono">{shifts.reduce((s, r) => s + r.total_incidents, 0)}</span></span>
              <span className="text-xs" style={{ color: PRIORITY_CONFIG.P1.color }}>P1: <span className="font-bold font-mono">{shifts.reduce((s, r) => s + r.p1_count, 0)}</span></span>
              <span className="text-xs" style={{ color: PRIORITY_CONFIG.P2.color }}>P2: <span className="font-bold font-mono">{shifts.reduce((s, r) => s + r.p2_count, 0)}</span></span>
              <span className="text-xs" style={{ color: PRIORITY_CONFIG.P3.color }}>P3: <span className="font-bold font-mono">{shifts.reduce((s, r) => s + r.p3_count, 0)}</span></span>
              <span className="text-xs" style={{ color: PRIORITY_CONFIG.P4.color }}>P4: <span className="font-bold font-mono">{shifts.reduce((s, r) => s + r.p4_count, 0)}</span></span>
            </div>
          </div>
        </div>
      ) : (
        /* ===== TIMELINE VIEW ===== */
        <div className="relative pl-6">
          {/* Timeline line */}
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-[#1e2d3d]" />

          <div className="space-y-3">
            {shifts.map((row) => {
              const isExpanded = expandedShiftId === row.shift_id;
              const hasP1 = row.p1_count > 0;
              const dotColor = hasP1
                ? "bg-[#ff4757] border-[#ff4757]"
                : row.shift_status === "completed"
                ? "bg-[#00e5a0] border-[#00e5a0]"
                : row.shift_status === "active"
                ? "bg-[#3d9df3] border-[#3d9df3]"
                : "bg-[#5a7090] border-[#5a7090]";

              const statusCls = row.shift_status === "completed"
                ? "text-[#00e5a0] bg-[rgba(0,229,160,0.12)]"
                : row.shift_status === "active"
                ? "text-[#3d9df3] bg-[rgba(61,157,243,0.12)]"
                : "text-[#5a7090] bg-[rgba(138,150,170,0.08)]";

              const durationMins = row.end_time && row.start_time
                ? Math.round((new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) / 60000)
                : null;
              const durationStr = durationMins != null
                ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
                : "—";

              return (
                <div key={row.shift_id} className="relative">
                  {/* Timeline dot */}
                  <div className={`absolute -left-6 top-3.5 w-2.5 h-2.5 rounded-full border-2 ${dotColor}`} />

                  <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
                    {/* Collapsed header */}
                    <button
                      onClick={() => setExpandedShiftId(isExpanded ? null : row.shift_id)}
                      className="w-full text-left px-3.5 py-3 hover:bg-[#0d1117] transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-[#5a7090]">
                            {row.start_time ? formatDate(row.start_time) : "—"}
                          </span>
                          {row.shift_type && <ShiftBadge shiftType={row.shift_type} />}
                          <span className="text-xs text-foreground font-mono">
                            {row.operator_id.slice(0, 8)}
                          </span>
                        </div>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm w-fit ${statusCls}`}>
                          {row.shift_status ?? "—"}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-[#5a7090]">
                        <span>Duration: <span className="text-[#8fa3b8]">{durationStr}</span></span>
                        <span>Incidents: <span className={row.total_incidents > 0 ? "text-[#ff4757]" : "text-[#8fa3b8]"}>{row.total_incidents}</span></span>
                        {row.p1_count > 0 && (
                          <span style={{ color: PRIORITY_CONFIG.P1.color }}>P1: <span className="font-bold">{row.p1_count}</span></span>
                        )}
                        {row.kill_switch_activated && (
                          <span className="text-[#ff4757] font-bold">KILL SWITCH</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 mt-2 text-[10px] text-[#5a7090]">
                        <span className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}>&#9656;</span>
                        <span>{isExpanded ? "Collapse" : "Expand"}</span>
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <ShiftHistoryDetail shiftId={row.shift_id} handoffNotes={row.handoff_notes} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Summary Dashboard
// ============================================================================

function SummaryDashboardTab({ initialMonth, onArchive, archiving }: {
  initialMonth: string;
  onArchive: (month: string) => Promise<void>;
  archiving: boolean;
}) {
  const [sumMonth, setSumMonth] = useState(initialMonth);
  const [summary, setSummary] = useState<IncidentSummary | null>(null);
  const [archivedMonths, setArchivedMonths] = useState<ArchivedMonth[]>([]);
  const [sumLoading, setSumLoading] = useState(true);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const fetchSummary = useCallback(async (m: string) => {
    setSumLoading(true);
    try {
      const [sumRes, archRes] = await Promise.all([
        getIncidentSummary(m),
        getArchivedMonths(),
      ]);
      const sumData = sumRes.data as any;
      const archData = archRes.data as any;
      setSummary(sumData ?? generateMockSummary());
      setArchivedMonths(Array.isArray(archData) ? archData : []);
    } catch {
      setSummary(generateMockSummary());
      setArchivedMonths([]);
    } finally {
      setSumLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(sumMonth); }, [sumMonth, fetchSummary]);

  if (sumLoading || !summary) return <LoadingSkeleton />;

  const m = summary.metrics;
  const month = sumMonth;
  const monthLabel = new Date(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const priorityChartOptions: ApexOptions = {
    chart: { type: "bar", height: 200, toolbar: { show: false }, background: "transparent" },
    theme: { mode: "dark" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 4 } },
    colors: ["#ff4757", "#f5a623", "#FFD700", "#00e5a0"],
    dataLabels: { enabled: true, style: { fontSize: "11px", fontWeight: 600 } },
    xaxis: { categories: ["P1", "P2", "P3", "P4"], labels: { style: { colors: "#5a7090" } } },
    yaxis: { labels: { style: { colors: "#8fa3b8", fontSize: "11px" } } },
    grid: { borderColor: "#1e2d40", xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    tooltip: { theme: "dark" },
  };

  const priorityData = summary.byPriority;
  const prioritySeries = [{ name: "Incidents", data: priorityData.map((p) => p.count) }];

  return (
    <div className="space-y-4">
      {/* Month Title + Picker */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="month"
          value={sumMonth}
          onChange={(e) => setSumMonth(e.target.value)}
          className="w-[160px] h-8 bg-[#131920] border-dark text-sm"
        />
        <h2 className="text-lg font-bold text-foreground">Incident Summary — {monthLabel}</h2>
        <span className="text-[10px] text-[#5a7090]">Auto-calculated from Monthly Log</span>
      </div>

      {/* Top 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* By Priority */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="bg-[rgba(255,71,87,0.08)] px-4 py-2 border-b border-dark">
            <span className="text-xs font-bold uppercase tracking-wider text-[#ff9fa8]">By Priority</span>
          </div>
          <div className="p-3 space-y-2">
            {(["P1", "P2", "P3", "P4"] as IncidentPriority[]).map((p) => {
              const count = summary.byPriority.find((x) => x.priority === p)?.count ?? 0;
              const config = PRIORITY_CONFIG[p];
              const total = summary.byPriority.reduce((s, x) => s + x.count, 0) || 1;
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-[100px]" style={{ color: config.color }}>{config.label}</span>
                  <div className="flex-1 h-5 bg-[#1a2230] rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm transition-all" style={{ width: `${(count / total) * 100}%`, backgroundColor: config.color, opacity: 0.7 }} />
                  </div>
                  <span className="text-sm font-bold font-mono w-8 text-right text-foreground">{count}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-3 pt-2 border-t border-dark">
              <span className="text-xs font-bold w-[100px] text-foreground">TOTAL</span>
              <div className="flex-1" />
              <span className="text-sm font-bold font-mono w-8 text-right text-[#FFD700]">
                {summary.byPriority.reduce((s, x) => s + x.count, 0)}
              </span>
            </div>
          </div>
        </div>

        {/* By Category */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="bg-[rgba(61,157,243,0.08)] px-4 py-2 border-b border-dark">
            <span className="text-xs font-bold uppercase tracking-wider text-[#3d9df3]">By Category</span>
          </div>
          <div className="p-3 space-y-1.5">
            {ALL_CATEGORIES.filter((c) => c !== "nil_shift").map((cat) => {
              const count = summary.byCategory.find((x) => x.category === cat)?.count ?? 0;
              return (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-xs text-[#8fa3b8]">{CATEGORY_LABELS[cat]}</span>
                  <span className={cn("text-xs font-mono font-bold", count > 0 ? "text-foreground" : "text-[#5a7090]")}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Shift */}
        <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="bg-[rgba(0,229,160,0.08)] px-4 py-2 border-b border-dark">
            <span className="text-xs font-bold uppercase tracking-wider text-[#00e5a0]">By Shift</span>
          </div>
          <div className="p-3 space-y-2">
            {(["AM", "PM", "Night", "Weekend"] as ShiftType[]).map((st) => {
              const count = summary.byShift.find((x) => x.shift_type === st)?.count ?? 0;
              return (
                <div key={st} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShiftBadge shiftType={st} />
                    <span className="text-xs text-[#8fa3b8]">Shift</span>
                  </div>
                  <span className={cn("text-sm font-mono font-bold", count > 0 ? "text-foreground" : "text-[#5a7090]")}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="bg-[rgba(255,214,0,0.06)] px-4 py-2 border-b border-dark">
          <span className="text-xs font-bold uppercase tracking-wider text-[#FFD700]">Key Metrics</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-dark">
          {[
            { label: "Kill Switch Activations", value: m.kill_switch_count, warn: m.kill_switch_count > 0 },
            { label: "Rogue Bot Incidents", value: m.rogue_bot_count, warn: m.rogue_bot_count > 0 },
            { label: "Open / Unresolved", value: m.open_count, warn: m.open_count > 0 },
            { label: "NIL Shifts", value: m.nil_shift_count, warn: false },
            { label: "Avg Contain (P1) — mins", value: m.avg_contain_p1_mins ?? "—", warn: false },
            { label: "Total P&L Impact", value: formatCurrency(m.total_pnl_impact), warn: m.total_pnl_impact < 0 },
          ].map((kpi, i) => (
            <div key={i} className="px-4 py-3 flex flex-col items-center text-center">
              <span className="text-[10px] text-[#5a7090] uppercase tracking-wider mb-1">{kpi.label}</span>
              <span className={cn("text-xl font-bold font-mono", kpi.warn ? "text-[#ff4757]" : "text-foreground")}>
                {kpi.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Priority Chart */}
      <div className="bg-dark-elevated border border-dark rounded-md p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#5a7090] mb-3">Incidents by Priority</h3>
        <Chart options={priorityChartOptions} series={prioritySeries} type="bar" height={180} />
      </div>

      {/* Month-End: Archive & Sign-Off */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="bg-[rgba(138,150,170,0.06)] px-4 py-2 border-b border-dark flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#8fa3b8]">Month-End — Archive & Sign-Off</span>
        </div>
        <div className="p-4 space-y-4">
          {/* Archive current month */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-foreground font-medium">Archive {monthLabel}</p>
              <p className="text-[10px] text-[#5a7090] mt-0.5">Locks all incidents for this month. Archived incidents remain viewable but cannot be edited.</p>
            </div>
            {!showArchiveConfirm ? (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-[#f5a623] text-[#f5a623] hover:bg-[rgba(245,166,35,0.1)]"
                onClick={() => setShowArchiveConfirm(true)}
              >
                Archive Month
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#f5a623]">Are you sure?</span>
                <Button
                  size="sm"
                  className="text-xs bg-[#f5a623] text-[#080c10] hover:bg-[#e09500] font-semibold"
                  disabled={archiving}
                  onClick={async () => {
                    await onArchive(month);
                    setShowArchiveConfirm(false);
                    fetchSummary(sumMonth);
                  }}
                >
                  {archiving ? "Archiving..." : "Confirm Archive"}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-[#5a7090]" onClick={() => setShowArchiveConfirm(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Archived months list */}
          {archivedMonths.length > 0 && (
            <div className="border-t border-dark pt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Previously Archived Months</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {archivedMonths.map((am) => (
                  <div key={am.month} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(0,229,160,0.06)] border border-[rgba(0,229,160,0.15)]">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M13.5 5.5V13a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 13V5.5m11 0L8 1.5 2.5 5.5m11 0H2.5" stroke="#00e5a0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span className="text-xs font-mono text-[#00e5a0]">
                      {new Date(am.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                    <span className="text-[10px] text-[#5a7090]">({am.count} incidents)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Create Incident Dialog
// ============================================================================

function CreateIncidentDialog({
  open,
  onClose,
  onCreated,
  correctionFor,
  activeShiftId,
  adminUserId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  correctionFor?: Incident | null;
  activeShiftId?: string | null;
  adminUserId?: string | null;
}) {
  const defaultForm = {
    shiftType: "AM" as ShiftType,
    priority: "P3" as IncidentPriority,
    category: "bot_error" as IncidentCategory,
    title: "",
    description: "",
    botRef: "",
    accountRef: "",
    timeDetected: "",
    actionTaken: "",
    pnlImpactUsd: "",
    killSwitchActivated: false,
    rootCause: "",
    notes: "",
  };

  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  // Pre-populate form when creating a correction
  useEffect(() => {
    if (correctionFor && open) {
      setForm({
        shiftType: correctionFor.shiftType,
        priority: correctionFor.priority,
        category: correctionFor.category,
        title: `CORRECTION: ${correctionFor.title}`,
        description: correctionFor.description ?? "",
        botRef: correctionFor.botRef ?? "",
        accountRef: correctionFor.accountRef ?? "",
        timeDetected: correctionFor.timeDetected ?? "",
        actionTaken: correctionFor.actionTaken ?? "",
        pnlImpactUsd: correctionFor.pnlImpactUsd ? String(correctionFor.pnlImpactUsd) : "",
        killSwitchActivated: correctionFor.killSwitchActivated,
        rootCause: correctionFor.rootCause ?? "",
        notes: `Corrects ${correctionFor.incidentNumber}. `,
      });
    } else if (!correctionFor && open) {
      setForm(defaultForm);
    }
  }, [correctionFor, open]);

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const body = {
        operatorId: adminUserId || "00000000-0000-0000-0000-000000000000",
        shiftId: activeShiftId || undefined,
        shiftType: form.shiftType,
        priority: form.priority,
        category: form.category,
        title: form.title,
        description: form.description || undefined,
        botRef: form.botRef || undefined,
        accountRef: form.accountRef || undefined,
        timeDetected: form.timeDetected || undefined,
        actionTaken: form.actionTaken || undefined,
        pnlImpactUsd: form.pnlImpactUsd ? parseFloat(form.pnlImpactUsd) : undefined,
        killSwitchActivated: form.killSwitchActivated,
        rootCause: form.rootCause || undefined,
        notes: form.notes || undefined,
      };

      if (correctionFor) {
        await createIncidentCorrection(correctionFor.id, body);
      } else {
        await createIncident(body);
      }
      onCreated();
      onClose();
      setForm(defaultForm);
    } catch (err) {
      console.error("Failed to create incident:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-dark max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {correctionFor ? (
              <span className="flex items-center gap-2">
                <span>Create Correction</span>
                <span className="text-xs font-mono text-[#f5a623]">for {correctionFor.incidentNumber}</span>
              </span>
            ) : "Log New Incident"}
          </DialogTitle>
        </DialogHeader>
        {correctionFor && (
          <div className="bg-[rgba(245,166,35,0.08)] border border-[rgba(245,166,35,0.2)] rounded-md px-3 py-2 mb-2">
            <p className="text-[10px] text-[#f5a623]">This creates a new correction row linked to the original. The original incident will not be modified.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-[#8fa3b8]">Shift Type</Label>
            <Select value={form.shiftType} onValueChange={(v) => setForm({ ...form, shiftType: v as ShiftType })}>
              <SelectTrigger className="h-8 bg-[#131920] border-dark text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["AM", "PM", "Night", "Weekend"] as ShiftType[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-[#8fa3b8]">Time Detected</Label>
            <Input type="time" value={form.timeDetected} onChange={(e) => setForm({ ...form, timeDetected: e.target.value })} className="h-8 bg-[#131920] border-dark text-xs" />
          </div>
          <div>
            <Label className="text-xs text-[#8fa3b8]">Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as IncidentPriority })}>
              <SelectTrigger className="h-8 bg-[#131920] border-dark text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["P1", "P2", "P3", "P4"] as IncidentPriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    <span style={{ color: PRIORITY_CONFIG[p].color }}>{PRIORITY_CONFIG[p].label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-[#8fa3b8]">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as IncidentCategory })}>
              <SelectTrigger className="h-8 bg-[#131920] border-dark text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-[#8fa3b8]">Bot Ref</Label>
            <Input placeholder="e.g. BOT-05" value={form.botRef} onChange={(e) => setForm({ ...form, botRef: e.target.value })} className="h-8 bg-[#131920] border-dark text-xs" />
          </div>
          <div>
            <Label className="text-xs text-[#8fa3b8]">Account Ref</Label>
            <Input placeholder="e.g. ACC-001" value={form.accountRef} onChange={(e) => setForm({ ...form, accountRef: e.target.value })} className="h-8 bg-[#131920] border-dark text-xs" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-[#8fa3b8]">Title (max 150 chars)</Label>
            <Input maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-8 bg-[#131920] border-dark text-xs" placeholder="Brief incident title..." />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-[#8fa3b8]">Description</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full h-20 px-3 py-2 bg-[#131920] border border-dark rounded-md text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-[#FFD700]"
              placeholder="Detailed description of the incident..."
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-[#8fa3b8]">Action Taken</Label>
            <textarea
              value={form.actionTaken}
              onChange={(e) => setForm({ ...form, actionTaken: e.target.value })}
              className="w-full h-16 px-3 py-2 bg-[#131920] border border-dark rounded-md text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-[#FFD700]"
              placeholder="What action was taken to address this incident..."
            />
          </div>
          <div>
            <Label className="text-xs text-[#8fa3b8]">P&L Impact (USD)</Label>
            <Input type="number" step="0.01" value={form.pnlImpactUsd} onChange={(e) => setForm({ ...form, pnlImpactUsd: e.target.value })} className="h-8 bg-[#131920] border-dark text-xs" placeholder="e.g. -1240" />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.killSwitchActivated}
                onChange={(e) => setForm({ ...form, killSwitchActivated: e.target.checked })}
                className="w-4 h-4 rounded border-dark bg-[#131920] accent-[#ff4757]"
              />
              <span className="text-xs text-[#ff4757] font-medium">Kill Switch Activated</span>
            </label>
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-[#8fa3b8]">Root Cause</Label>
            <Input value={form.rootCause} onChange={(e) => setForm({ ...form, rootCause: e.target.value })} className="h-8 bg-[#131920] border-dark text-xs" placeholder="Root cause if known..." />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-[#8fa3b8]">Notes / Follow-Up</Label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full h-16 px-3 py-2 bg-[#131920] border border-dark rounded-md text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-[#FFD700]"
              placeholder="Additional notes, follow-up items..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-[#8fa3b8]">Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!form.title.trim() || submitting} className="text-xs bg-[#FFD700] text-[#080c10] hover:bg-[#e6c300] font-semibold">
            {submitting ? "Saving..." : correctionFor ? "Create Correction" : "Log Incident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Incident Detail Sheet
// ============================================================================

function IncidentDetailSheet({
  incident,
  open,
  onClose,
  onCorrection,
}: {
  incident: Incident | null;
  open: boolean;
  onClose: () => void;
  onCorrection: (incident: Incident) => void;
}) {
  if (!incident) return null;
  const pConfig = PRIORITY_CONFIG[incident.priority];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[500px] sm:w-[600px] bg-card border-dark overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-foreground">
            <span className="font-mono text-[#FFD700]">{incident.incidentNumber}</span>
            <PriorityBadge priority={incident.priority} />
            <StatusBadge status={incident.status} />
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {/* Priority bar */}
          <div className="h-1 rounded-full" style={{ backgroundColor: pConfig.color }} />

          {/* Title */}
          <h3 className="text-sm font-semibold text-foreground">{incident.title}</h3>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-[#5a7090]">Date:</span> <span className="text-[#8fa3b8] ml-1">{formatDate(incident.date)}</span></div>
            <div><span className="text-[#5a7090]">Time:</span> <span className="text-[#8fa3b8] ml-1 font-mono">{incident.timeDetected ?? "—"}</span></div>
            <div><span className="text-[#5a7090]">Shift:</span> <span className="ml-1"><ShiftBadge shiftType={incident.shiftType} /></span></div>
            <div><span className="text-[#5a7090]">Category:</span> <span className="ml-1"><CategoryBadge category={incident.category} /></span></div>
            <div><span className="text-[#5a7090]">Bot:</span> <span className="text-[#8fa3b8] ml-1 font-mono">{incident.botRef ?? "N/A"}</span></div>
            <div><span className="text-[#5a7090]">Account:</span> <span className="text-[#8fa3b8] ml-1 font-mono">{incident.accountRef ?? "N/A"}</span></div>
            <div><span className="text-[#5a7090]">P&L Impact:</span> <span className={cn("ml-1 font-mono font-bold", incident.pnlImpactUsd < 0 ? "text-[#ff4757]" : "text-[#8fa3b8]")}>{formatCurrency(incident.pnlImpactUsd)}</span></div>
            <div><span className="text-[#5a7090]">Kill Switch:</span> <span className="ml-1"><YesNoBadge value={incident.killSwitchActivated} /></span></div>
            {incident.timeToContainMins != null && <div><span className="text-[#5a7090]">Time to Contain:</span> <span className="text-[#8fa3b8] ml-1">{incident.timeToContainMins} min</span></div>}
            {incident.timeToResolveMins != null && <div><span className="text-[#5a7090]">Time to Resolve:</span> <span className="text-[#8fa3b8] ml-1">{incident.timeToResolveMins} min</span></div>}
            {incident.preventable && <div><span className="text-[#5a7090]">Preventable:</span> <span className="text-[#8fa3b8] ml-1">{incident.preventable}</span></div>}
          </div>

          {/* Description */}
          {incident.description && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Description</span>
              <p className="text-xs text-[#8fa3b8] mt-1 leading-relaxed">{incident.description}</p>
            </div>
          )}

          {/* Action Taken */}
          {incident.actionTaken && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Action Taken</span>
              <p className="text-xs text-[#8fa3b8] mt-1 leading-relaxed">{incident.actionTaken}</p>
            </div>
          )}

          {/* Root Cause */}
          {incident.rootCause && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Root Cause</span>
              <p className="text-xs text-[#8fa3b8] mt-1 leading-relaxed">{incident.rootCause}</p>
            </div>
          )}

          {/* Notes */}
          {incident.notes && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090]">Notes / Follow-Up</span>
              <p className="text-xs text-[#8fa3b8] mt-1 leading-relaxed">{incident.notes}</p>
            </div>
          )}

          {/* Escalated info */}
          {incident.escalatedTo && (
            <div className="bg-[rgba(245,166,35,0.06)] border border-[rgba(245,166,35,0.2)] rounded-md px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#f5a623]">Escalated To</span>
              <p className="text-xs text-[#f5a623] mt-0.5">{incident.escalatedTo}</p>
            </div>
          )}

          {/* Supervisor info */}
          {incident.supervisorNotified && (
            <div className="bg-[rgba(61,157,243,0.06)] border border-[rgba(61,157,243,0.2)] rounded-md px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#3d9df3]">Supervisor Notified</span>
              <p className="text-xs text-[#8fa3b8] mt-0.5">
                {incident.supervisorNotifiedAt ? new Date(incident.supervisorNotifiedAt).toLocaleString("en-GB") : "Yes"}
              </p>
              {incident.supervisorCountersignedAt && (
                <p className="text-xs text-[#00e5a0] mt-1">Countersigned: {new Date(incident.supervisorCountersignedAt).toLocaleString("en-GB")}</p>
              )}
            </div>
          )}

          {/* Correction indicator */}
          {incident.isCorrection && incident.correctsIncidentId && (
            <div className="bg-[rgba(245,166,35,0.06)] border border-[rgba(245,166,35,0.2)] rounded-md px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#f5a623]">Correction Row</span>
              <p className="text-xs text-[#8fa3b8] mt-0.5">This is a correction for a previous incident entry.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-dark">
            {incident.status === "open" && (
              <Button size="sm" variant="outline" className="text-xs border-[#f5a623] text-[#f5a623] hover:bg-[rgba(245,166,35,0.1)]"
                onClick={async () => { await escalateIncident(incident.id); onClose(); }}>
                Escalate
              </Button>
            )}
            {incident.status !== "resolved" && (
              <Button size="sm" variant="outline" className="text-xs border-[#00e5a0] text-[#00e5a0] hover:bg-[rgba(0,229,160,0.1)]"
                onClick={async () => { await resolveIncident(incident.id); onClose(); }}>
                Resolve
              </Button>
            )}
            {incident.priority === "P1" && !incident.supervisorCountersignedAt && (
              <Button size="sm" variant="outline" className="text-xs border-[#3d9df3] text-[#3d9df3] hover:bg-[rgba(61,157,243,0.1)]"
                onClick={async () => { await countersignIncident(incident.id); onClose(); }}>
                Countersign
              </Button>
            )}
            {!incident.isCorrection && (
              <Button size="sm" variant="outline" className="text-xs border-[#8fa3b8] text-[#8fa3b8] hover:bg-[rgba(138,150,170,0.1)]"
                onClick={() => { onCorrection(incident); onClose(); }}>
                Create Correction
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Main Page
// ============================================================================

const TABS: { id: TabId; label: string; accent?: string }[] = [
  { id: "monthly", label: "Monthly Log" },
  { id: "open", label: "Open Incidents", accent: "#3d9df3" },
  { id: "kill-switch", label: "Kill Switch Register", accent: "#ff4757" },
  { id: "rogue-bot", label: "Rogue Bot Log", accent: "#8b2c2c" },
  { id: "shift-register", label: "Shift Register", accent: "#8fa3b8" },
  { id: "summary", label: "Summary Dashboard", accent: "#FFD700" },
];

export default function IncidentsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("monthly");
  const [month, setMonth] = useState(getCurrentMonth);
  const [loading, setLoading] = useState(true);

  // Shift state
  const shift = useShiftState();
  const [shiftPanel, setShiftPanel] = useState<"activity" | "watchlist" | "handoff" | null>(null);

  // Data state
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [killSwitchData, setKillSwitchData] = useState<KillSwitchActivation[]>([]);
  const [rogueBotData, setRogueBotData] = useState<RogueBotIncident[]>([]);
  const [archiving, setArchiving] = useState(false);

  // UI state
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [correctionFor, setCorrectionFor] = useState<Incident | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [incRes, ksRes, rbRes] = await Promise.all([
        getIncidents({ month, limit: 100 }),
        getKillSwitchActivations({ limit: 100 }),
        getRogueBotIncidents({ limit: 100 }),
      ]);

      const incData = incRes.data as any;
      const ksData = ksRes.data as any;
      const rbData = rbRes.data as any;

      setIncidents(incData?.data ?? incData ?? generateMockIncidents());
      setKillSwitchData(ksData?.data ?? ksData ?? generateMockKillSwitch());
      setRogueBotData(rbData?.data ?? rbData ?? generateMockRogueBot());
    } catch {
      setIncidents(generateMockIncidents());
      setKillSwitchData(generateMockKillSwitch());
      setRogueBotData(generateMockRogueBot());
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleNilShift = async () => {
    try {
      await logNilShift({
        operatorId: shift.adminUserId || "00000000-0000-0000-0000-000000000000",
        shiftType: "AM",
      });
      loadData();
    } catch {
      // Fallback: add mock NIL entry
    }
  };

  const handleArchive = async (archiveMonth: string) => {
    setArchiving(true);
    try {
      await archiveIncidentMonth(archiveMonth);
      loadData();
    } catch (err) {
      console.error("Failed to archive month:", err);
    } finally {
      setArchiving(false);
    }
  };

  const handleCorrection = (incident: Incident) => {
    setCorrectionFor(incident);
    setShowCreateDialog(true);
  };

  const openCount = incidents.filter((i) => i.status !== "resolved").length;
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-[1600px] mx-auto space-y-3 sm:space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#FFD700]">Operations Log</span>
          </div>

          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Operations Log</h1>
              <p className="text-sm text-[#8fa3b8]">Track incidents, manage shifts, and audit all operational activity</p>
            </div>
            <div className="flex items-center gap-2">
              {openCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)]">
                  <div className="w-2 h-2 rounded-full bg-[#ff4757] animate-pulse" />
                  <span className="text-xs text-[#ff4757] font-bold">{openCount} unresolved</span>
                </div>
              )}
              <button
                onClick={() => setShowInstructions(!showInstructions)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                  showInstructions
                    ? "bg-[rgba(61,157,243,0.1)] border-[rgba(61,157,243,0.3)] text-[#3d9df3]"
                    : "bg-transparent border-dark text-[#5a7090] hover:text-[#8fa3b8] hover:border-[#5a7090]"
                )}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h2v4.5h1V12h-3v-.5h.5V7.5H6.5V7z" fill="currentColor"/></svg>
                Operator Guide
              </button>
            </div>
          </div>

          {/* Operator Instructions — Collapsible */}
          {showInstructions && (
            <div className="rounded-lg border border-dark bg-dark-elevated overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Header */}
              <div className="bg-[#131920] px-5 py-3 border-b border-dark flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FFD700]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Incident Audit Log — Operator Instructions</span>
                </div>
                <button onClick={() => setShowInstructions(false)} className="text-[#5a7090] hover:text-foreground transition-colors">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* When to Log */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(61,117,187,0.15)]">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6da1d6]">When to Log</span>
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {[
                      "End of EVERY shift — even if no incidents occurred (enter NIL row).",
                      "Immediately during a P1 or P2 — do not wait until shift end.",
                      "Kill switch activations must be entered in KILL SWITCH REGISTER at time of activation.",
                      "Rogue bot incidents must also be entered in ROGUE BOT LOG.",
                    ].map((item, i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-[#8fa3b8] leading-relaxed">
                        <span className="text-[#5a7090] mt-0.5 shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* How to Log a NIL Shift */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(76,120,60,0.2)]">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#8aba70]">How to Log a NIL Shift</span>
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {[
                      "Click \"Log NIL Shift\" button in the Monthly Log toolbar.",
                      "Incident ID is auto-generated (INC-YYYY-NNNN).",
                      "Category is set to 'NIL Shift' automatically.",
                      "Description: 'No incidents during [AM/PM/Night] shift on [DD/MM/YYYY]'.",
                      "Status: Resolved. P&L Impact: $0. Kill Switch: No.",
                    ].map((item, i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-[#8fa3b8] leading-relaxed">
                        <span className="text-[#5a7090] mt-0.5 shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Colour Coding */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(139,68,56,0.2)]">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#d4887a]">Colour Coding — Priority Rows</span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { priority: "P1" as IncidentPriority, rule: "Critical. Supervisor must countersign." },
                      { priority: "P2" as IncidentPriority, rule: "High. Supervisor must be notified." },
                      { priority: "P3" as IncidentPriority, rule: "Medium. Log and inform supervisor at check-in." },
                      { priority: "P4" as IncidentPriority, rule: "Low. Log before end of shift." },
                    ].map((item) => (
                      <div key={item.priority} className="flex items-center gap-2 py-1 px-2 rounded-sm" style={{ backgroundColor: PRIORITY_CONFIG[item.priority].rowBg, borderLeft: `3px solid ${PRIORITY_CONFIG[item.priority].border}` }}>
                        <PriorityBadge priority={item.priority} />
                        <span className="text-[10px] text-[#8fa3b8]">{item.rule}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 py-1 px-2 rounded-sm bg-[rgba(138,150,170,0.04)]" style={{ borderLeft: '3px solid #5a7090' }}>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider text-[#5a7090] bg-[rgba(138,150,170,0.12)]">NIL</span>
                      <span className="text-[10px] text-[#8fa3b8]">No incident.</span>
                    </div>
                  </div>
                </div>

                {/* Rules */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(178,60,50,0.2)]">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#e07068]">Rules — Do Not Break These</span>
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {[
                      "NEVER delete or overwrite another operator's rows.",
                      "NEVER leave the log un-updated at the end of your shift.",
                      "NEVER leave any cell blank — use 'N/A' or '$0' if not applicable.",
                      "NEVER change another operator's Incident ID.",
                      "If you spot an error: add a new correction row — never edit the original.",
                    ].map((item, i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-[#ff9fa8] leading-relaxed">
                        <span className="text-[#ff4757] mt-0.5 shrink-0">!</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Incident ID Format */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(61,117,187,0.15)]">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6da1d6]">Incident ID Format</span>
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {[
                      ["Format:", "INC-YYYY-NNNN (e.g. INC-2026-0042)"],
                      ["YYYY =", "current year. NNNN = sequential number starting at 0001."],
                      ["Numbers", "run continuously across all months — do not restart at the new month."],
                      ["Auto-generated", "— the system assigns the next number automatically."],
                    ].map(([bold, rest], i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-[#8fa3b8] leading-relaxed">
                        <span className="text-[#5a7090] mt-0.5 shrink-0">•</span>
                        <span><span className="text-foreground font-medium">{bold}</span> {rest}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Month-End Process */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(40,50,70,0.5)]">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#8fa3b8]">Month-End Process</span>
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {[
                      "Supervisor archives the completed month using the Archive button.",
                      "Archived incidents remain viewable but cannot be edited.",
                      "The Shift Register and other sub-registers continue — do not reset them.",
                      "Supervisor signs off the Summary Dashboard for the completed month.",
                    ].map((item, i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-[#8fa3b8] leading-relaxed">
                        <span className="text-[#5a7090] mt-0.5 shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Active Shift Bar */}
          <ActiveShiftBar
            currentShift={shift.currentShift}
            shiftEnded={shift.shiftEnded}
            starting={shift.starting}
            shiftLogs={shift.shiftLogs}
            totalEquity={shift.totalEquity}
            totalPnl={shift.totalPnl}
            running={shift.running}
            errors={shift.errors}
            paused={shift.paused}
            criticalLogs={shift.criticalLogs}
            warningLogs={shift.warningLogs}
            bots={shift.bots}
            onStartShift={shift.handleStartShift}
            onOpenPanel={(panel) => setShiftPanel(panel)}
            onResetAfterHandoff={shift.resetAfterHandoff}
          />

          {/* Shift Error */}
          {shift.error && (
            <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2 flex items-center justify-between">
              <span>{shift.error}</span>
              <button onClick={() => shift.setError(null)} className="text-[#ff4757] hover:text-white ml-2">&times;</button>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex gap-0.5 border-b border-dark overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
                  activeTab === tab.id
                    ? "text-[#FFD700] border-[#FFD700]"
                    : "text-[#8fa3b8] border-transparent hover:text-foreground hover:border-[#5a7090]"
                )}
              >
                {tab.label}
                {tab.id === "open" && openCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-4 text-[9px] font-bold rounded-full bg-[rgba(255,71,87,0.2)] text-[#ff4757]">
                    {openCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "monthly" && (
            <MonthlyLogTab
              incidents={incidents}
              loading={loading}
              month={month}
              setMonth={setMonth}
              filterPriority={filterPriority}
              setFilterPriority={setFilterPriority}
              filterCategory={filterCategory}
              setFilterCategory={setFilterCategory}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              onNewIncident={() => setShowCreateDialog(true)}
              onNilShift={handleNilShift}
              onSelectIncident={setSelectedIncident}
            />
          )}
          {activeTab === "open" && (
            <OpenIncidentsTab incidents={incidents} loading={loading} onSelectIncident={setSelectedIncident} />
          )}
          {activeTab === "kill-switch" && (
            <KillSwitchTab activations={killSwitchData} loading={loading} />
          )}
          {activeTab === "rogue-bot" && (
            <RogueBotTab rogueBots={rogueBotData} loading={loading} />
          )}
          {activeTab === "shift-register" && (
            <ShiftRegisterTab initialMonth={month} />
          )}
          {activeTab === "summary" && (
            <SummaryDashboardTab
              initialMonth={month}
              onArchive={handleArchive}
              archiving={archiving}
            />
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateIncidentDialog
        open={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setCorrectionFor(null);
        }}
        onCreated={loadData}
        correctionFor={correctionFor}
        activeShiftId={shift.currentShift?.id}
        adminUserId={shift.adminUserId}
      />
      <IncidentDetailSheet
        incident={selectedIncident}
        open={!!selectedIncident}
        onClose={() => { setSelectedIncident(null); loadData(); }}
        onCorrection={handleCorrection}
      />
      <ShiftPanelSheet
        open={shiftPanel !== null}
        initialTab={shiftPanel ?? "activity"}
        onClose={() => setShiftPanel(null)}
        shiftLogs={shift.shiftLogs}
        logAction={shift.logAction}
        setLogAction={shift.setLogAction}
        logNotes={shift.logNotes}
        setLogNotes={shift.setLogNotes}
        logPriority={shift.logPriority}
        setLogPriority={shift.setLogPriority}
        loggingActivity={shift.loggingActivity}
        onLogActivity={shift.handleLogActivity}
        hasActiveShift={!!shift.currentShift}
        watchList={shift.watchList}
        watchTitle={shift.watchTitle}
        setWatchTitle={shift.setWatchTitle}
        watchDescription={shift.watchDescription}
        setWatchDescription={shift.setWatchDescription}
        watchPriority={shift.watchPriority}
        setWatchPriority={shift.setWatchPriority}
        addingWatch={shift.addingWatch}
        onAddWatchItem={shift.handleAddWatchItem}
        handoffNotes={shift.handoffNotes}
        setHandoffNotes={shift.setHandoffNotes}
        receivedBy={shift.receivedBy}
        setReceivedBy={shift.setReceivedBy}
        adminUsers={shift.adminUsers}
        adminUserId={shift.adminUserId}
        submitting={shift.submitting}
        savingDraft={shift.savingDraft}
        shiftEnded={shift.shiftEnded}
        onSubmitHandoff={shift.handleSubmitHandoff}
        onSaveDraft={shift.handleSaveDraft}
        error={shift.error}
        setError={shift.setError}
      />
    </div>
  );
}
