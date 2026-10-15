// ============================================================================
// Incident Audit Log — Types & Display Config
// ============================================================================

// Enums
export type IncidentPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type IncidentCategory = 'bot_error' | 'rogue_bot' | 'kill_switch' | 'api_issue' | 'pnl_loss_limit' | 'balance' | 'security' | 'nil_shift' | 'other';
export type IncidentStatus = 'open' | 'escalated' | 'resolved';
export type KillSwitchScope = 'single_bot' | 'all_bots' | 'platform';
export type ShiftType = 'AM' | 'PM' | 'Night' | 'Weekend';

// Core incident
export interface Incident {
  id: string;
  incidentNumber: string; // INC-YYYY-NNNN
  shiftId: string | null;
  operatorId: string;
  operatorName?: string; // resolved from join
  date: string; // YYYY-MM-DD
  timeDetected: string | null; // HH:MM
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
  supervisorName?: string;
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
  preventable: string | null; // 'Yes' | 'No' | 'Partially'
  notes: string | null;
  correctsIncidentId: string | null;
  isCorrection: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveMonth: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations (populated on detail view)
  killSwitchActivations?: KillSwitchActivation[];
  rogueBotIncidents?: RogueBotIncident[];
}

export interface KillSwitchActivation {
  id: string;
  incidentId: string;
  incidentNumber?: string;
  date: string;
  timeActivated: string;
  operatorId: string;
  operatorName?: string;
  supervisorNotifiedAt: string | null;
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

export interface RogueBotIncident {
  id: string;
  incidentId: string;
  incidentNumber?: string;
  date: string;
  timeDetected: string;
  operatorId: string;
  operatorName?: string;
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
  supervisorSignoffId: string | null;
  supervisorSignoffAt: string | null;
  createdAt: string;
}

// Summary dashboard types
export interface IncidentSummary {
  byPriority: { priority: IncidentPriority; count: number }[];
  byCategory: { category: IncidentCategory; count: number }[];
  byShift: { shiftType: ShiftType; count: number }[];
  metrics: {
    killSwitchCount: number;
    rogueBotCount: number;
    openCount: number;
    nilShiftCount: number;
    avgContainP1Mins: number | null;
    totalPnlImpact: number;
  };
}

// Open incident (with days_open)
export interface OpenIncident extends Incident {
  daysOpen: number;
  nextActionRequired?: string;
}

// Shift register entry
export interface ShiftRegisterEntry {
  shiftId: string;
  date: string;
  shiftType: ShiftType;
  operatorName: string;
  supervisorName: string | null;
  shiftStart: string;
  shiftEnd: string | null;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  p4Count: number;
  totalIncidents: number;
  killSwitchActivated: boolean;
  notes: string | null;
}

// DTOs for creating
export interface CreateIncidentDto {
  shiftId?: string;
  operatorId: string;
  date?: string;
  timeDetected?: string;
  shiftType: ShiftType;
  priority: IncidentPriority;
  category: IncidentCategory;
  botRef?: string;
  accountRef?: string;
  title: string;
  description?: string;
  actionTaken?: string;
  supervisorNotified?: boolean;
  supervisorId?: string;
  pnlImpactUsd?: number;
  killSwitchActivated?: boolean;
  rootCause?: string;
  preventable?: string;
  notes?: string;
  killSwitch?: CreateKillSwitchDto;
  rogueBot?: CreateRogueBotDto;
}

export interface UpdateIncidentDto {
  status?: IncidentStatus;
  actionTaken?: string;
  rootCause?: string;
  notes?: string;
  escalatedTo?: string;
  timeToContainMins?: number;
  timeToResolveMins?: number;
  pnlImpactUsd?: number;
  preventable?: string;
  supervisorNotified?: boolean;
  supervisorId?: string;
}

export interface CreateKillSwitchDto {
  date?: string;
  timeActivated: string;
  operatorId: string;
  scope: KillSwitchScope;
  botsAffected?: string[];
  accountRefs?: string[];
  reason: string;
  openOrdersAtActivation?: string;
  pnlAtActivationUsd?: number;
  timeToResolveInterval?: string;
  authorizedRestartBy?: string;
  notes?: string;
}

export interface CreateRogueBotDto {
  date?: string;
  timeDetected: string;
  operatorId: string;
  botRef: string;
  accountRef?: string;
  rogueBehaviourObserved: string;
  normalFreqPerHour?: number;
  rogueFreqPerHour?: number;
  wrongPair?: boolean;
  wrongDirection?: boolean;
  immediateAction?: string;
  killSwitchActivated?: boolean;
  pnlImpactUsd?: number;
  rootCause?: string;
}

export interface NilShiftDto {
  operatorId: string;
  shiftType: ShiftType;
  shiftId?: string;
}

// Filter params
export interface IncidentFilterParams {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  priority?: IncidentPriority;
  category?: IncidentCategory;
  status?: IncidentStatus;
  shiftId?: string;
  operatorId?: string;
  archived?: boolean;
  month?: string; // YYYY-MM
}

// Priority display config
export const PRIORITY_CONFIG: Record<IncidentPriority, { label: string; color: string; bgColor: string; borderColor: string }> = {
  P1: { label: 'P1 — Critical', color: '#ff4757', bgColor: 'rgba(255,71,87,0.12)', borderColor: '#ff4757' },
  P2: { label: 'P2 — High', color: '#f5a623', bgColor: 'rgba(245,166,35,0.12)', borderColor: '#f5a623' },
  P3: { label: 'P3 — Medium', color: '#FFD700', bgColor: 'rgba(255,214,0,0.10)', borderColor: '#FFD700' },
  P4: { label: 'P4 — Low', color: '#00e5a0', bgColor: 'rgba(0,229,160,0.10)', borderColor: '#00e5a0' },
};

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  bot_error: 'Bot Error',
  rogue_bot: 'Rogue Bot',
  kill_switch: 'Kill Switch',
  api_issue: 'API Issue',
  pnl_loss_limit: 'P&L / Loss Limit',
  balance: 'Balance',
  security: 'Security',
  nil_shift: 'NIL Shift',
  other: 'Other',
};

export const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string; bgColor: string }> = {
  open: { label: 'Open', color: '#3d9df3', bgColor: 'rgba(61,157,243,0.12)' },
  escalated: { label: 'Escalated', color: '#f5a623', bgColor: 'rgba(245,166,35,0.12)' },
  resolved: { label: 'Resolved', color: '#00e5a0', bgColor: 'rgba(0,229,160,0.12)' },
};
