# Incident Audit Log — Implementation Plan

## Overview
Replaces the Excel-based "Arbtrade Incident Audit Log" with a full-stack feature across NestJS + Next.js admin. The system tracks every shift incident (including NIL entries), kill switch activations, rogue bot events, and provides a summary dashboard.

---

## Phase 1: Database Migration

### New Enums
```sql
CREATE TYPE operations.incident_priority AS ENUM ('P1', 'P2', 'P3', 'P4');
CREATE TYPE operations.incident_category AS ENUM (
  'bot_error', 'rogue_bot', 'kill_switch', 'api_issue',
  'pnl_loss_limit', 'balance', 'security', 'nil_shift', 'other'
);
CREATE TYPE operations.incident_status AS ENUM ('open', 'escalated', 'resolved');
CREATE TYPE operations.kill_switch_scope AS ENUM ('single_bot', 'all_bots', 'platform');
CREATE TYPE operations.shift_type AS ENUM ('AM', 'PM', 'Night', 'Weekend');
```

### New Tables

#### 1. `operations.incident_counters`
Tracks yearly incident numbering (INC-YYYY-NNNN format).
```sql
CREATE TABLE operations.incident_counters (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);
```

#### 2. `operations.incidents` (central table)
```sql
CREATE TABLE operations.incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_number VARCHAR(20) NOT NULL UNIQUE, -- INC-2026-0001
  shift_id UUID REFERENCES operations.shifts(shift_id),
  operator_id UUID NOT NULL, -- admin user who logged it
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_detected TIME,
  shift_type operations.shift_type NOT NULL,
  priority operations.incident_priority NOT NULL,
  category operations.incident_category NOT NULL,
  bot_ref VARCHAR(50), -- e.g. BOT-05
  account_ref VARCHAR(50), -- e.g. ACC-001
  title VARCHAR(150) NOT NULL,
  description TEXT,
  action_taken TEXT,
  supervisor_notified BOOLEAN NOT NULL DEFAULT false,
  supervisor_id UUID, -- FK to admin user
  supervisor_notified_at TIMESTAMPTZ,
  supervisor_countersigned_by UUID,
  supervisor_countersigned_at TIMESTAMPTZ,
  time_to_contain_mins INTEGER,
  time_to_resolve_mins INTEGER,
  status operations.incident_status NOT NULL DEFAULT 'open',
  escalated_to VARCHAR(200),
  pnl_impact_usd NUMERIC(14,2) DEFAULT 0,
  kill_switch_activated BOOLEAN NOT NULL DEFAULT false,
  root_cause TEXT,
  preventable VARCHAR(20), -- 'Yes', 'No', 'Partially'
  notes TEXT,
  -- Correction support (never edit original, add correction row)
  corrects_incident_id UUID REFERENCES operations.incidents(id),
  is_correction BOOLEAN NOT NULL DEFAULT false,
  -- Month-end archival
  archived_at TIMESTAMPTZ,
  archived_by UUID,
  archive_month VARCHAR(7), -- '2026-03'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_shift ON operations.incidents(shift_id);
CREATE INDEX idx_incidents_status ON operations.incidents(status);
CREATE INDEX idx_incidents_date ON operations.incidents(date);
CREATE INDEX idx_incidents_priority ON operations.incidents(priority);
CREATE INDEX idx_incidents_archive_month ON operations.incidents(archive_month);
```

#### 3. `operations.kill_switch_activations`
```sql
CREATE TABLE operations.kill_switch_activations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES operations.incidents(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_activated TIME NOT NULL,
  operator_id UUID NOT NULL,
  supervisor_notified_at TIMESTAMPTZ,
  scope operations.kill_switch_scope NOT NULL,
  bots_affected TEXT[], -- e.g. {'BOT-05', 'BOT-12'}
  account_refs TEXT[],
  reason TEXT NOT NULL,
  open_orders_at_activation TEXT,
  pnl_at_activation_usd NUMERIC(14,2),
  time_to_resolve_interval INTERVAL,
  authorized_restart_by VARCHAR(200),
  authorized_restart_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kill_switch_incident ON operations.kill_switch_activations(incident_id);
```

#### 4. `operations.rogue_bot_incidents`
```sql
CREATE TABLE operations.rogue_bot_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES operations.incidents(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_detected TIME NOT NULL,
  operator_id UUID NOT NULL,
  bot_ref VARCHAR(50) NOT NULL,
  account_ref VARCHAR(50),
  rogue_behaviour_observed TEXT NOT NULL,
  normal_freq_per_hour INTEGER,
  rogue_freq_per_hour INTEGER,
  wrong_pair BOOLEAN DEFAULT false,
  wrong_direction BOOLEAN DEFAULT false,
  immediate_action TEXT,
  kill_switch_activated BOOLEAN DEFAULT false,
  pnl_impact_usd NUMERIC(14,2) DEFAULT 0,
  root_cause TEXT,
  supervisor_signoff_id UUID,
  supervisor_signoff_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rogue_bot_incident ON operations.rogue_bot_incidents(incident_id);
```

### Alter Existing Tables
```sql
ALTER TABLE operations.shifts
  ADD COLUMN IF NOT EXISTS shift_type operations.shift_type,
  ADD COLUMN IF NOT EXISTS supervisor_id UUID;
```

### New Permissions (add to admin.permissions)
```sql
INSERT INTO admin.permissions (id, code, name, description, category, action) VALUES
  (uuid_generate_v4(), 'incidents.view', 'View Incidents', 'View incident audit log', 'shifts', 'view'),
  (uuid_generate_v4(), 'incidents.create', 'Create Incidents', 'Log new incidents', 'shifts', 'create'),
  (uuid_generate_v4(), 'incidents.update', 'Update Incidents', 'Update incident status and details', 'shifts', 'update'),
  (uuid_generate_v4(), 'incidents.escalate', 'Escalate Incidents', 'Escalate incidents and countersign P1s', 'shifts', 'approve'),
  (uuid_generate_v4(), 'incidents.archive', 'Archive Incidents', 'Month-end incident archival', 'shifts', 'execute'),
  (uuid_generate_v4(), 'incidents.export', 'Export Incidents', 'Export incident data', 'shifts', 'export');
```

---

## Phase 2: NestJS API Module — `src/modules/incidents/`

### Entities
- `Incident` — maps to `operations.incidents`
- `KillSwitchActivation` — maps to `operations.kill_switch_activations`
- `RogueBotIncident` — maps to `operations.rogue_bot_incidents`
- `IncidentCounter` — maps to `operations.incident_counters`

### Endpoints (~22)

#### Incidents (core)
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/incidents` | `incidents.view` | List with filters (date range, priority, category, status, shift, operator, archived) |
| GET | `/incidents/:id` | `incidents.view` | Get single incident with kill_switch + rogue_bot details |
| POST | `/incidents` | `incidents.create` | Create incident (auto-generates INC-YYYY-NNNN, auto-creates shift_activity) |
| PUT | `/incidents/:id` | `incidents.update` | Update incident (status, notes, action taken, root cause) |
| POST | `/incidents/:id/escalate` | `incidents.escalate` | Escalate incident (sets status=escalated, notifies supervisor) |
| POST | `/incidents/:id/resolve` | `incidents.update` | Resolve incident (sets status=resolved, time_to_resolve) |
| POST | `/incidents/:id/countersign` | `incidents.escalate` | Supervisor countersign (P1 requirement) |
| POST | `/incidents/:id/correction` | `incidents.create` | Create correction row (links via corrects_incident_id) |
| POST | `/incidents/nil-shift` | `incidents.create` | Quick NIL shift entry (P4, nil_shift category, auto-fills defaults) |

#### Kill Switch Register
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/incidents/kill-switch` | `incidents.view` | List all kill switch activations |
| GET | `/incidents/kill-switch/:id` | `incidents.view` | Get single kill switch record |
| POST | `/incidents/:id/kill-switch` | `incidents.create` | Add kill switch detail to incident (transactional) |
| PUT | `/incidents/kill-switch/:id` | `incidents.update` | Update kill switch record (authorized restart) |

#### Rogue Bot Log
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/incidents/rogue-bot` | `incidents.view` | List all rogue bot incidents |
| GET | `/incidents/rogue-bot/:id` | `incidents.view` | Get single rogue bot record |
| POST | `/incidents/:id/rogue-bot` | `incidents.create` | Add rogue bot detail to incident (transactional) |

#### Open Incidents
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/incidents/open` | `incidents.view` | List incidents where status != resolved (auto-calculates days_open) |

#### Summary Dashboard
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/incidents/summary` | `incidents.view` | Monthly summary (by priority, category, shift + key metrics). Query params: month (YYYY-MM) |

#### Shift Register (enhanced)
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/incidents/shift-register` | `incidents.view` | Shift register view: shifts joined with incident counts by priority, kill switch flag |

#### Archive
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/incidents/archive` | `incidents.archive` | Archive month (sets archived_at/by/month on all incidents for given month) |
| GET | `/incidents/archived` | `incidents.view` | List archived months with totals |

### DTOs
- `CreateIncidentDto` — priority, category, shift_type, title, description, bot_ref, account_ref, etc.
- `UpdateIncidentDto` — partial update fields
- `CreateKillSwitchDto` — scope, bots_affected, reason, pnl_at_activation, etc.
- `CreateRogueBotDto` — bot_ref, behaviour, frequencies, wrong_pair/direction, etc.
- `NilShiftDto` — shift_type, operator_id (everything else auto-filled)
- `IncidentFilterDto` — date_from, date_to, priority, category, status, shift_id, operator_id, archived
- `SummaryQueryDto` — month (YYYY-MM)

### Service Logic
- **Auto-numbering**: `generateIncidentNumber()` — atomically increments `incident_counters` for current year, returns `INC-YYYY-NNNN`
- **Auto shift_activity**: On incident create, auto-insert a `shift_activity` with action=`incident_logged`, priority mapped from incident priority
- **Transactional creates**: Creating an incident with kill_switch or rogue_bot detail uses a DB transaction
- **Days open calculation**: `CURRENT_DATE - date` for open incidents
- **Summary aggregation**: SQL GROUP BY queries over incidents for the given month

---

## Phase 3: Next.js Admin UI

### New Dashboard Tab
Add "Incident Log" tab to dashboard layout navigation (between "Alerts" and "Infrastructure").

### Page Structure: `src/app/dashboard/incidents/`

#### Tab-based Layout (5 tabs within the page)
```
/dashboard/incidents              → Monthly Log (default tab)
/dashboard/incidents?tab=open     → Open Incidents
/dashboard/incidents?tab=kill-switch → Kill Switch Register
/dashboard/incidents?tab=rogue-bot   → Rogue Bot Log
/dashboard/incidents?tab=summary     → Summary Dashboard
```

---

### Tab 1: Monthly Incident Log

**Layout**: Full-width table with toolbar above

**Toolbar**:
- Month selector (dropdown, defaults to current month)
- Priority filter (P1/P2/P3/P4/All)
- Category filter (dropdown)
- Status filter (Open/Escalated/Resolved/All)
- "Log NIL Shift" button (quick action)
- "New Incident" button (opens create dialog)
- Export button (CSV download)

**Table Columns** (matching Excel but enhanced):
| Column | Width | Notes |
|--------|-------|-------|
| Incident ID | 130px | `INC-YYYY-NNNN`, monospace, clickable → opens detail sheet |
| Date | 100px | `DD/MM/YYYY` format |
| Time | 70px | `HH:MM` |
| Shift | 60px | AM/PM/Night badge |
| Operator | 100px | Admin user name |
| Priority | 60px | Color-coded badge: P1=red, P2=orange, P3=yellow, P4=green |
| Category | 110px | Badge with icon |
| Bot Ref | 80px | Monospace |
| Account | 80px | Monospace |
| Title | 200px | Truncated, tooltip for full |
| Description | 250px | Truncated, expandable |
| Action Taken | 200px | Truncated |
| Status | 90px | Badge: Open=blue, Escalated=amber, Resolved=green |
| P&L Impact | 90px | Red for negative, right-aligned |
| Kill Switch | 70px | Yes/No badge |
| Notes | 150px | Truncated |

**Row Styling** (priority color-coding like Excel):
- P1 rows: `bg-[rgba(255,71,87,0.08)]` left border red
- P2 rows: `bg-[rgba(245,166,35,0.08)]` left border orange
- P3 rows: `bg-[rgba(255,214,0,0.06)]` left border yellow
- P4 rows: `bg-[rgba(0,229,160,0.05)]` left border green
- NIL rows: `bg-[rgba(138,150,170,0.05)]` left border gray

**Create Incident Dialog** (Sheet/side panel):
- Multi-step form: Basic info → Details → Review
- Priority selector with color preview
- Category dropdown
- Auto-fills: date, time, shift_type (from active shift), operator
- If category = `rogue_bot`: shows rogue bot detail fields inline
- If `kill_switch_activated` = true: shows kill switch detail fields inline
- Submit creates incident + sub-records in one request

**Row Click → Incident Detail Sheet**:
- Full incident details in a slide-over panel
- Timeline of status changes
- Linked kill switch / rogue bot records
- Escalate / Resolve / Countersign action buttons
- Correction button (creates linked correction row)
- Notes editor

---

### Tab 2: Open Incidents

**Layout**: Simpler table, auto-filtered to status = Open or Escalated

**Table Columns** (matching Excel "OPEN INCIDENTS" sheet):
| Column | Notes |
|--------|-------|
| Incident ID | Linked to detail |
| Date Raised | |
| Priority | Color badge |
| Category | |
| Title | |
| Operator | |
| Account | |
| Status | Open/Escalated |
| Days Open | Auto-calculated, red if >3 days |
| Last Update | Timestamp |
| Supervisor Assigned | |
| Next Action Required | Editable inline |

**Key Feature**: Auto-updates when Monthly Log changes. Supervisor review tool — checked at every shift handover.

---

### Tab 3: Kill Switch Register

**Layout**: Table with red accent header bar

**Table Columns** (matching Excel):
| Column | Notes |
|--------|-------|
| Incident ID | Linked to main incident |
| Date | |
| Time Activated | |
| Operator | |
| Supervisor Notified | Timestamp |
| Scope | Single Bot / All Bots / Platform — badge |
| Bots Affected | Comma-separated list |
| Account(s) | |
| Reason for Activation | Full text |
| Open Orders at Activation | |
| P&L at Activation | Red for losses |
| Time to Resolve | Duration format |
| Authorized to Restart By | Name + time |
| Notes | |

**Empty State**: "No kill switch activations recorded this month."

---

### Tab 4: Rogue Bot Log

**Layout**: Table with dark red accent header bar

**Table Columns** (matching Excel):
| Column | Notes |
|--------|-------|
| Incident ID | Linked |
| Date | |
| Time Detected | |
| Operator | |
| Bot Ref | Monospace |
| Account | |
| Rogue Behaviour Observed | Full text, expandable |
| Normal Freq (trades/hr) | Right-aligned number |
| Rogue Freq (trades/hr) | Right-aligned, red if >5x normal |
| Wrong Pair? | Yes/No |
| Wrong Direction? | Yes/No |
| Immediate Action | |
| Kill Switch Activated? | Yes/No badge |
| P&L Impact | Red for losses |
| Root Cause | |
| Supervisor Sign-off | Name |

---

### Tab 5: Summary Dashboard

**Layout**: Cards + summary tables (matching Excel dashboard but with charts)

**Top Section — 3 Summary Cards side by side**:

**Card 1: By Priority**
| Priority | Count | Bar |
|----------|-------|-----|
| P1 — Critical | 1 | Red bar |
| P2 — High | 1 | Orange bar |
| P3 — Medium | 0 | Yellow bar |
| P4 / NIL | 3 | Green bar |
| **TOTAL** | **5** | |

**Card 2: By Category**
| Category | Count |
|----------|-------|
| Bot Error | 1 |
| Rogue Bot | 1 |
| Kill Switch | 1 |
| API Issue | 0 |
| P&L / Loss Limit | 0 |
| Balance | 0 |
| Security | 0 |
| Other | 2 |

**Card 3: By Shift**
| Shift | Count |
|-------|-------|
| AM Shift | 3 |
| PM Shift | 1 |
| Night Shift | 1 |
| Weekend | 0 |

**Bottom Section — Key Metrics (horizontal cards)**:
- Kill Switch Activations This Month → large number
- Rogue Bot Incidents This Month → large number
- Open / Unresolved Incidents → large number (red if >0)
- Shifts with NIL Incidents → count
- Avg Time to Contain (P1s) — mins → number
- Total P&L Impact This Month → red for negative

**Charts (enhanced over Excel)**:
- Incidents over time (area chart, last 30 days, stacked by priority)
- Category breakdown (donut chart)
- P&L impact trend (bar chart, daily)

**Month selector** at top to switch between months.

---

### Shift Register Enhancement

Update existing **Shift Handoff** page (`/dashboard/shift-handoff/`) to add a "Shift Register" sub-tab showing the aggregated view:

| Date | Shift | Operator | Supervisor | Start | End | P1 Count | P2 Count | P3 Count | P4 Count | Total | Kill Switch? | Notes |
|------|-------|----------|------------|-------|-----|----------|----------|----------|----------|-------|--------------|-------|

This is a read-only aggregation from `operations.shifts` joined with incident counts.

---

## Phase 4: API Client + Types

### New Types (`src/lib/types/incidents.ts`)
```typescript
type IncidentPriority = 'P1' | 'P2' | 'P3' | 'P4';
type IncidentCategory = 'bot_error' | 'rogue_bot' | 'kill_switch' | 'api_issue' | 'pnl_loss_limit' | 'balance' | 'security' | 'nil_shift' | 'other';
type IncidentStatus = 'open' | 'escalated' | 'resolved';
type KillSwitchScope = 'single_bot' | 'all_bots' | 'platform';
type ShiftType = 'AM' | 'PM' | 'Night' | 'Weekend';

interface Incident { ... }
interface KillSwitchActivation { ... }
interface RogueBotIncident { ... }
interface IncidentSummary { ... }
interface ShiftRegisterEntry { ... }
```

### API Client Functions (`src/lib/stellaAdminApi.ts`)
Add ~15 functions:
- `getIncidents(filters)`, `getIncident(id)`, `createIncident(dto)`, `updateIncident(id, dto)`
- `escalateIncident(id)`, `resolveIncident(id, dto)`, `countersignIncident(id)`
- `createCorrection(id, dto)`, `logNilShift(dto)`
- `getKillSwitchActivations()`, `createKillSwitch(incidentId, dto)`
- `getRogueBotIncidents()`, `createRogueBotIncident(incidentId, dto)`
- `getOpenIncidents()`, `getIncidentSummary(month)`
- `getShiftRegister(month)`, `archiveMonth(month)`

---

## Phase 5: Integration Hooks

1. **Auto-incident on circuit breaker**: When `risk.circuit_breaker_events` fires (via Phoenix PubSub), auto-create an incident with category=`kill_switch`, priority=`P1`, and linked kill switch activation record
2. **Shift handoff integration**: On shift handoff submit, warn if there are unresolved incidents
3. **Bot error auto-incident**: When bot transitions to `error` or `circuit_broken`, optionally auto-create incident draft

---

## Build Order

| # | Task | Scope | Depends On |
|---|------|-------|------------|
| 1 | DB migration SQL | Database | — |
| 2 | NestJS entities + module scaffold | Backend | 1 |
| 3 | NestJS incident CRUD service | Backend | 2 |
| 4 | NestJS controller + DTOs | Backend | 3 |
| 5 | Next.js types + API client | Frontend | 4 |
| 6 | Next.js incidents page layout + tabs | Frontend | 5 |
| 7 | Monthly Log tab (table + create dialog) | Frontend | 6 |
| 8 | Open Incidents tab | Frontend | 7 |
| 9 | Kill Switch Register tab | Frontend | 7 |
| 10 | Rogue Bot Log tab | Frontend | 7 |
| 11 | Summary Dashboard tab | Frontend | 7 |
| 12 | Shift Register enhancement | Frontend | 7 |
| 13 | Dashboard nav tab addition | Frontend | 6 |
| 14 | Integration hooks (circuit breaker → incident) | Backend | 3 |
