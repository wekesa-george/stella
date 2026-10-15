# Escalation Matrix — Implementation Plan

## Status: BACKEND COMPLETE — Frontend pending

## Overview

Priority x Category -> target roles/users + notification channels + SLA timers.
Auto-escalation if not acknowledged within SLA.

---

## 1. Database Changes (operations schema)

### Table: `operations.escalation_matrix`
```sql
CREATE TABLE operations.escalation_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority VARCHAR(4) NOT NULL,           -- P1, P2, P3, P4
  category VARCHAR(100),                  -- NULL = applies to all categories
  tier INT NOT NULL DEFAULT 1,            -- 1 = first responder, 2 = manager, 3 = executive
  target_role_id UUID REFERENCES admin.roles(id),
  target_user_id UUID REFERENCES admin.admin_users(id),  -- optional: specific person override
  notification_channels TEXT[] NOT NULL DEFAULT '{}',     -- {'slack','email','ntfy','pagerduty'}
  response_time_mins INT NOT NULL DEFAULT 15,             -- SLA: must acknowledge within
  auto_escalate_to_tier INT,              -- NULL = no auto-escalation, else tier number
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one rule per priority+category+tier
CREATE UNIQUE INDEX idx_escalation_matrix_unique
  ON operations.escalation_matrix(priority, COALESCE(category, '__all__'), tier);
```

### Table: `operations.escalation_log`
```sql
CREATE TABLE operations.escalation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES operations.incidents(id),
  matrix_rule_id UUID REFERENCES operations.escalation_matrix(id),
  tier INT NOT NULL,
  escalated_by UUID REFERENCES admin.admin_users(id),    -- NULL if auto-escalated
  target_role_id UUID REFERENCES admin.roles(id),
  target_user_id UUID REFERENCES admin.admin_users(id),
  notification_channels_used TEXT[] DEFAULT '{}',
  notification_status JSONB DEFAULT '{}',  -- per-channel delivery status
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES admin.admin_users(id),
  auto_escalated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_escalation_log_incident ON operations.escalation_log(incident_id);
```

### Alter existing: `operations.incidents`
```sql
ALTER TABLE operations.incidents ADD COLUMN current_escalation_tier INT DEFAULT 0;
ALTER TABLE operations.incidents ADD COLUMN escalation_deadline TIMESTAMPTZ;
```

---

## 2. Default Escalation Matrix (seed data)

| Priority | Category     | Tier | Target Role         | Channels              | Response SLA | Auto-escalate to |
|----------|-------------|------|--------------------|-----------------------|-------------|-----------------|
| P1       | (all)       | 1    | operations_manager | ntfy, slack, email    | 5 min       | tier 2          |
| P1       | (all)       | 2    | risk_officer       | ntfy, slack, pagerduty| 10 min      | tier 3          |
| P1       | (all)       | 3    | super_admin        | ntfy, sms, pagerduty  | --          | --              |
| P2       | (all)       | 1    | operations_manager | ntfy, slack           | 15 min      | tier 2          |
| P2       | (all)       | 2    | risk_officer       | ntfy, email           | 30 min      | --              |
| P3       | (all)       | 1    | operations_manager | ntfy, email           | 60 min      | --              |
| P4       | (all)       | 1    | support_agent      | ntfy                  | 120 min     | --              |

Category-specific overrides can be added (e.g., P2+exchange_error -> risk_officer tier 1).

---

## 3. NestJS Backend

### New module: `EscalationModule`

**Endpoints:**
- `GET    /escalation-matrix`             — list all rules
- `POST   /escalation-matrix`             — create rule
- `PUT    /escalation-matrix/:id`         — update rule
- `DELETE /escalation-matrix/:id`         — delete rule
- `GET    /escalation-matrix/resolve?priority=P1&category=exchange_error` — preview which rule matches
- `GET    /incidents/:id/escalation-log`  — escalation timeline for an incident
- `POST   /incidents/:id/acknowledge-escalation` — acknowledge (stops auto-escalation timer)

**Enhanced `escalate()` flow:**
1. Look up matrix: find rules for incident's priority + category, ordered by tier
2. Determine current tier (incident.current_escalation_tier + 1)
3. Resolve target users: find admin_users with target_role
4. Send notifications via NotificationService (ntfy + slack + email per rule)
5. Log to escalation_log
6. Set incident.escalation_deadline = now() + response_time_mins
7. Update incident status to "escalated", escalated_to = role name

**Auto-escalation (BullMQ job):**
- On escalation, schedule a delayed job: check in `response_time_mins`
- If not acknowledged by deadline, auto-escalate to `auto_escalate_to_tier`
- Repeat until no more tiers or acknowledged

---

## 4. Notification System (dependency — build first)

See PLAN-notification-system.md

### Integration with escalation:
```typescript
// Inside EscalationService.escalate()
const rule = await this.resolveMatrix(incident.priority, incident.category, nextTier);
const targets = await this.resolveTargetUsers(rule);

for (const channel of rule.notificationChannels) {
  await this.notificationService.send({
    channel,
    recipients: targets,
    template: 'incident_escalation',
    data: {
      incidentNumber: incident.incidentNumber,
      priority: incident.priority,
      title: incident.title,
      tier: nextTier,
      slaMinutes: rule.responseTimeMins,
    },
  });
}
```

---

## 5. Frontend

### Settings page: `/settings/escalation-matrix`
- Table of rules: priority, category, tier, target role, channels, SLA
- Add/edit/delete rules
- Preview: "If a P1 exchange_error occurs, who gets notified?"

### Incident detail sheet (enhanced):
- Escalation timeline (from escalation_log)
- Escalate button -> shows next tier from matrix with preview of who gets notified
- Acknowledge button (for the target user)
- Countdown timer to auto-escalation deadline

---

## 6. Implementation Order

1. Notification system (ntfy + slack + email adapters)
2. DB tables (escalation_matrix, escalation_log, incident columns)
3. NestJS EscalationModule (CRUD + resolve + escalate flow)
4. Wire escalate() to notification service
5. Auto-escalation timer (BullMQ delayed jobs)
6. Frontend: settings page for matrix management
7. Frontend: enhanced incident detail with escalation timeline
8. Seed default matrix data
