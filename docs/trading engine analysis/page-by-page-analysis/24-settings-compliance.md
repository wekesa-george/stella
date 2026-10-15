# Page 24: `/settings/compliance` - Compliance & Regulatory

**Route:** `/settings/compliance`
**Page Type:** Configuration Management
**User Persona:** Platform Admin / Compliance Officer
**Real-time Requirements:** No

---

## UI Features & Requirements

**Mock Data Structure from page.tsx:6-16:**

```typescript
const complianceSettings = {
  amlThreshold: 5000000, // UGX
  amlCurrency: "UGX",
  sanctionsLists: "OFAC,UN,EU",
  tradeReportThreshold: 10000000,
  dataRetentionYears: 7,
  gdprEnabled: true,
  autoSuspendOnAmlHit: true,
  requireReasonForOverride: true,
  sanctionsRefreshDays: 1,
};

const jurisdictionRestrictions = [
  { country: "Iran (IR)", reason: "OFAC sanctions", status: "blocked" },
  { country: "North Korea (KP)", reason: "OFAC sanctions", status: "blocked" },
  { country: "Russia (RU)", reason: "EU/US sanctions — restricted products only", status: "restricted" },
  { country: "Belarus (BY)", reason: "EU sanctions", status: "restricted" },
];
```

**UI Components:**

1. **AML Transaction Monitoring** (page.tsx:53-126)
   - AML Flag Threshold: `5,000,000 UGX` (currency dropdown)
   - Regulatory Report Threshold: `10,000,000 UGX`
   - Sanctions Lists: `"OFAC,UN,EU"` (comma-separated)
   - Sanctions Refresh Interval: `1 day`
   - Toggles:
     - Auto-suspend on AML watchlist hit
     - Require written reason for compliance overrides
     - Enable GDPR data subject request handling

2. **Data Retention Policy** (page.tsx:129-159)
   - Trade History Retention: `7 years`
   - User Data Retention: `7 years`
   - Audit Log Retention: `7 years`
   - KYC Document Retention: `10 years`
   - Info banner: "Minimum 7 years required by most financial regulations"

3. **Jurisdiction Restrictions** (page.tsx:162-229)
   - Table with columns: Country, Reason, Status, Actions
   - Statuses: `"blocked"` (red) or `"restricted"` (amber)
   - Actions: Edit button per row
   - Add Restriction button (admin only)

---

## Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| **AML Settings** | aml_threshold, aml_currency, sanctions_lists, sanctions_refresh_days | `compliance.compliance_settings` | REST API | On page load |
| **Regulatory Thresholds** | trade_report_threshold | `compliance.compliance_settings` | REST API | On page load |
| **Toggles** | auto_suspend_on_aml_hit, require_reason_for_override, gdpr_enabled | `compliance.compliance_settings` | REST API | On page load |
| **Data Retention** | trade_retention_years, user_retention_years, audit_retention_years, kyc_retention_years | `compliance.compliance_settings` | REST API | On page load |
| **Jurisdiction Restrictions** | country_code, reason, status | `compliance.jurisdiction_restrictions` | REST API | On page load |
| **Add/Edit Restriction** | New restriction creation | `compliance.jurisdiction_restrictions` | REST API | On demand |
| **Save Settings** | Update all compliance settings | `compliance.compliance_settings` UPDATE | REST API | On save |

---

## Database Schema Requirements

### New Tables

**1. `compliance.compliance_settings`** (Singleton table)

```sql
CREATE SCHEMA IF NOT EXISTS compliance;

CREATE TABLE compliance.compliance_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- AML Transaction Monitoring
  aml_threshold BIGINT NOT NULL DEFAULT 5000000, -- In smallest currency unit (UGX cents, USD cents, etc.)
  aml_currency VARCHAR(3) NOT NULL DEFAULT 'UGX',
  sanctions_lists TEXT NOT NULL DEFAULT 'OFAC,UN,EU', -- Comma-separated
  sanctions_refresh_days INTEGER NOT NULL DEFAULT 1,
  trade_report_threshold BIGINT NOT NULL DEFAULT 10000000,

  -- Feature Toggles
  auto_suspend_on_aml_hit BOOLEAN NOT NULL DEFAULT true,
  require_reason_for_override BOOLEAN NOT NULL DEFAULT true,
  gdpr_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Data Retention (in years)
  trade_retention_years INTEGER NOT NULL DEFAULT 7,
    CHECK (trade_retention_years >= 7),
  user_retention_years INTEGER NOT NULL DEFAULT 7,
    CHECK (user_retention_years >= 7),
  audit_retention_years INTEGER NOT NULL DEFAULT 7,
    CHECK (audit_retention_years >= 7),
  kyc_retention_years INTEGER NOT NULL DEFAULT 10,
    CHECK (kyc_retention_years >= 7),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_compliance_settings CHECK (id = id) -- Enforce singleton
);

CREATE UNIQUE INDEX idx_compliance_settings_singleton ON compliance.compliance_settings ((1));

-- Insert default settings
INSERT INTO compliance.compliance_settings (
  id, aml_threshold, aml_currency, sanctions_lists, trade_report_threshold
) VALUES (
  uuid_generate_v4(), 5000000, 'UGX', 'OFAC,UN,EU', 10000000
) ON CONFLICT DO NOTHING;
```

**2. `compliance.jurisdiction_restrictions`**

```sql
CREATE TABLE compliance.jurisdiction_restrictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  country_code VARCHAR(2) NOT NULL UNIQUE, -- ISO 3166-1 alpha-2 (e.g., 'IR', 'KP', 'RU')
  country_name VARCHAR(255) NOT NULL, -- "Iran", "North Korea", etc.

  reason TEXT NOT NULL, -- "OFAC sanctions", "EU sanctions", etc.
  status VARCHAR(50) NOT NULL, -- 'blocked', 'restricted'
    CHECK (status IN ('blocked', 'restricted')),

  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT country_code_uppercase CHECK (country_code = UPPER(country_code))
);

CREATE INDEX idx_jurisdiction_restrictions_active ON compliance.jurisdiction_restrictions (is_active) WHERE is_active = true;
CREATE INDEX idx_jurisdiction_restrictions_status ON compliance.jurisdiction_restrictions (status);
CREATE UNIQUE INDEX idx_jurisdiction_restrictions_country ON compliance.jurisdiction_restrictions (country_code);
```

**3. `compliance.aml_flags`** (AML transaction flags)

```sql
CREATE TABLE compliance.aml_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID, -- Reference to withdrawal/deposit/trade
  transaction_type VARCHAR(50) NOT NULL, -- 'withdrawal', 'deposit', 'trade'

  amount_ugx BIGINT NOT NULL, -- Converted to UGX for threshold comparison
  amount_original BIGINT NOT NULL,
  currency_original VARCHAR(3) NOT NULL,

  flag_reason VARCHAR(255) NOT NULL, -- "Exceeds AML threshold", "Sanctions list match", etc.
  flag_type VARCHAR(50) NOT NULL, -- 'threshold_exceeded', 'sanctions_match', 'manual'
    CHECK (flag_type IN ('threshold_exceeded', 'sanctions_match', 'manual')),

  status VARCHAR(50) NOT NULL DEFAULT 'pending_review', -- 'pending_review', 'approved', 'declined'
    CHECK (status IN ('pending_review', 'approved', 'declined', 'escalated')),

  reviewed_by_user_id UUID REFERENCES auth.users(id),
  review_decision TEXT, -- Compliance officer notes
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aml_flags_user ON compliance.aml_flags (user_id, created_at DESC);
CREATE INDEX idx_aml_flags_status ON compliance.aml_flags (status, created_at DESC);
CREATE INDEX idx_aml_flags_type ON compliance.aml_flags (flag_type);
```

**4. `compliance.sanctions_screening_log`**

```sql
CREATE TABLE compliance.sanctions_screening_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  screening_type VARCHAR(50) NOT NULL, -- 'onboarding', 'periodic', 'manual'
    CHECK (screening_type IN ('onboarding', 'periodic', 'manual')),

  lists_checked TEXT NOT NULL, -- "OFAC,UN,EU"
  match_found BOOLEAN NOT NULL DEFAULT false,
  match_details JSONB, -- Details of any matches found

  screened_by_user_id UUID REFERENCES auth.users(id), -- NULL for automated
  screened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sanctions_screening_user ON compliance.sanctions_screening_log (user_id, screened_at DESC);
CREATE INDEX idx_sanctions_screening_matches ON compliance.sanctions_screening_log (match_found, screened_at DESC);
```

### Seed Data for Jurisdiction Restrictions

```sql
INSERT INTO compliance.jurisdiction_restrictions (country_code, country_name, reason, status) VALUES
('IR', 'Iran', 'OFAC sanctions', 'blocked'),
('KP', 'North Korea', 'OFAC sanctions', 'blocked'),
('RU', 'Russia', 'EU/US sanctions — restricted products only', 'restricted'),
('BY', 'Belarus', 'EU sanctions', 'restricted'),
('SY', 'Syria', 'OFAC sanctions', 'blocked'),
('CU', 'Cuba', 'OFAC sanctions', 'blocked')
ON CONFLICT (country_code) DO NOTHING;
```

---

## NestJS REST API Endpoints

### 1. `GET /api/settings/compliance` - Load Compliance Settings

**Purpose:** Load all compliance configuration settings
**Authentication:** Admin/Compliance Officer role required

**Response:**

```typescript
interface ComplianceSettingsResponse {
  compliance_settings: {
    aml_threshold: number; // In UGX cents
    aml_currency: string;
    sanctions_lists: string; // "OFAC,UN,EU"
    sanctions_refresh_days: number;
    trade_report_threshold: number;
    auto_suspend_on_aml_hit: boolean;
    require_reason_for_override: boolean;
    gdpr_enabled: boolean;
    trade_retention_years: number;
    user_retention_years: number;
    audit_retention_years: number;
    kyc_retention_years: number;
    updated_at: string;
  };
  jurisdiction_restrictions: JurisdictionRestriction[];
}

interface JurisdictionRestriction {
  id: string;
  country_code: string; // 'IR', 'KP', etc.
  country_name: string;
  reason: string;
  status: 'blocked' | 'restricted';
  is_active: boolean;
  created_at: string;
}

// GET /api/settings/compliance
{
  "compliance_settings": {
    "aml_threshold": 5000000,
    "aml_currency": "UGX",
    "sanctions_lists": "OFAC,UN,EU",
    "sanctions_refresh_days": 1,
    "trade_report_threshold": 10000000,
    "auto_suspend_on_aml_hit": true,
    "require_reason_for_override": true,
    "gdpr_enabled": true,
    "trade_retention_years": 7,
    "user_retention_years": 7,
    "audit_retention_years": 7,
    "kyc_retention_years": 10,
    "updated_at": "2026-02-21T10:00:00Z"
  },
  "jurisdiction_restrictions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "country_code": "IR",
      "country_name": "Iran",
      "reason": "OFAC sanctions",
      "status": "blocked",
      "is_active": true,
      "created_at": "2026-01-01T00:00:00Z"
    },
    // ... more restrictions
  ]
}
```

**Implementation:**

```typescript
async getComplianceSettings(): Promise<ComplianceSettingsResponse> {
  const settings = await this.settingsRepo.findOne({});
  const restrictions = await this.restrictionsRepo.find({
    where: { is_active: true },
    order: { country_name: 'ASC' },
  });

  return {
    compliance_settings: {
      aml_threshold: settings.aml_threshold,
      aml_currency: settings.aml_currency,
      sanctions_lists: settings.sanctions_lists,
      sanctions_refresh_days: settings.sanctions_refresh_days,
      trade_report_threshold: settings.trade_report_threshold,
      auto_suspend_on_aml_hit: settings.auto_suspend_on_aml_hit,
      require_reason_for_override: settings.require_reason_for_override,
      gdpr_enabled: settings.gdpr_enabled,
      trade_retention_years: settings.trade_retention_years,
      user_retention_years: settings.user_retention_years,
      audit_retention_years: settings.audit_retention_years,
      kyc_retention_years: settings.kyc_retention_years,
      updated_at: settings.updated_at.toISOString(),
    },
    jurisdiction_restrictions: restrictions.map(r => ({
      id: r.id,
      country_code: r.country_code,
      country_name: r.country_name,
      reason: r.reason,
      status: r.status,
      is_active: r.is_active,
      created_at: r.created_at.toISOString(),
    })),
  };
}
```

### 2. `PUT /api/settings/compliance` - Update Compliance Settings

**Purpose:** Save changes to compliance configuration
**Authentication:** Admin/Compliance Officer + audit logging

**Request:**

```typescript
{
  "aml_threshold": 5000000,
  "aml_currency": "UGX",
  "sanctions_lists": "OFAC,UN,EU,HMT",
  "sanctions_refresh_days": 1,
  "trade_report_threshold": 10000000,
  "auto_suspend_on_aml_hit": true,
  "require_reason_for_override": true,
  "gdpr_enabled": true,
  "trade_retention_years": 7,
  "user_retention_years": 7,
  "audit_retention_years": 7,
  "kyc_retention_years": 10
}
```

**Response:**

```typescript
{
  "compliance_settings": { /* Updated settings */ },
  "message": "Compliance settings updated successfully"
}
```

**Implementation:**

```typescript
async updateComplianceSettings(data: UpdateComplianceSettingsDto, adminUserId: string) {
  const settings = await this.settingsRepo.findOne({});

  // Validate retention periods (minimum 7 years)
  if (data.trade_retention_years < 7 || data.user_retention_years < 7 ||
      data.audit_retention_years < 7 || data.kyc_retention_years < 7) {
    throw new BadRequestException('Retention periods must be at least 7 years');
  }

  const updated = await this.settingsRepo.save({
    ...settings,
    ...data,
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  // Audit log
  await this.auditService.log({
    action: 'compliance_settings_updated',
    resource_type: 'compliance_settings',
    resource_id: settings.id,
    admin_user_id: adminUserId,
    metadata: { changes: data },
  });

  return {
    compliance_settings: updated,
    message: 'Compliance settings updated successfully',
  };
}
```

### 3. `POST /api/settings/compliance/restrictions` - Add Jurisdiction Restriction

**Purpose:** Add a new country restriction
**Authentication:** Admin/Compliance Officer

**Request:**

```typescript
{
  "country_code": "VE",
  "country_name": "Venezuela",
  "reason": "OFAC sanctions",
  "status": "restricted"
}
```

**Response:**

```typescript
{
  "restriction": JurisdictionRestriction, // Created restriction
  "message": "Restriction for Venezuela added successfully"
}
```

**Implementation:**

```typescript
async addJurisdictionRestriction(data: CreateRestrictionDto, adminUserId: string) {
  // Check for duplicate
  const existing = await this.restrictionsRepo.findOne({
    where: { country_code: data.country_code.toUpperCase() },
  });

  if (existing) {
    throw new ConflictException(`Restriction for ${data.country_code} already exists`);
  }

  const restriction = await this.restrictionsRepo.save({
    country_code: data.country_code.toUpperCase(),
    country_name: data.country_name,
    reason: data.reason,
    status: data.status,
    is_active: true,
    created_by_user_id: adminUserId,
  });

  // Audit log
  await this.auditService.log({
    action: 'jurisdiction_restriction_added',
    resource_type: 'jurisdiction_restriction',
    resource_id: restriction.id,
    admin_user_id: adminUserId,
    metadata: { country_code: restriction.country_code, status: restriction.status },
  });

  return {
    restriction,
    message: `Restriction for ${restriction.country_name} added successfully`,
  };
}
```

### 4. `PUT /api/settings/compliance/restrictions/:id` - Update Jurisdiction Restriction

**Purpose:** Update an existing country restriction
**Authentication:** Admin/Compliance Officer

**Request:**

```typescript
{
  "reason": "Updated sanctions reason",
  "status": "blocked"
}
```

**Response:**

```typescript
{
  "restriction": JurisdictionRestriction, // Updated restriction
  "message": "Restriction for Iran updated successfully"
}
```

**Implementation:**

```typescript
async updateJurisdictionRestriction(
  restrictionId: string,
  data: UpdateRestrictionDto,
  adminUserId: string
) {
  const restriction = await this.restrictionsRepo.findOneOrFail({
    where: { id: restrictionId },
  });

  const updated = await this.restrictionsRepo.save({
    ...restriction,
    reason: data.reason ?? restriction.reason,
    status: data.status ?? restriction.status,
    updated_at: new Date(),
  });

  // Audit log
  await this.auditService.log({
    action: 'jurisdiction_restriction_updated',
    resource_type: 'jurisdiction_restriction',
    resource_id: restrictionId,
    admin_user_id: adminUserId,
    metadata: { country_code: restriction.country_code, changes: data },
  });

  return {
    restriction: updated,
    message: `Restriction for ${updated.country_name} updated successfully`,
  };
}
```

---

## Background Jobs

### 1. Sanctions List Refresh (Daily Cron Job)

**Purpose:** Re-screen all users against updated sanctions lists

```typescript
@Cron('0 2 * * *') // Daily at 2 AM UTC
async refreshSanctionsScreening() {
  const settings = await this.settingsRepo.findOne({});
  const users = await this.usersRepo.find({ where: { status: 'active' } });

  for (const user of users) {
    const match = await this.sanctionsService.checkSanctionsList(
      user,
      settings.sanctions_lists.split(',')
    );

    // Log screening
    await this.screeningLogRepo.save({
      user_id: user.id,
      screening_type: 'periodic',
      lists_checked: settings.sanctions_lists,
      match_found: match.found,
      match_details: match.details,
      screened_at: new Date(),
    });

    // Auto-suspend if match found and auto-suspend enabled
    if (match.found && settings.auto_suspend_on_aml_hit) {
      await this.usersRepo.update(user.id, {
        status: 'suspended',
        suspension_reason: `Sanctions list match: ${match.details.list_name}`,
      });

      // Create AML flag
      await this.amlFlagsRepo.save({
        user_id: user.id,
        transaction_type: 'manual',
        amount_ugx: 0,
        amount_original: 0,
        currency_original: 'UGX',
        flag_reason: `Sanctions list match: ${match.details.list_name}`,
        flag_type: 'sanctions_match',
        status: 'pending_review',
      });

      // Notify compliance team
      await this.notificationService.sendToRole('compliance_officer', {
        title: 'Sanctions Match Detected',
        message: `User ${user.email} matched sanctions list ${match.details.list_name}`,
        severity: 'critical',
      });
    }
  }
}
```

### 2. Data Retention Cleanup (Monthly Cron Job)

**Purpose:** Delete old records based on retention policy

```typescript
@Cron('0 3 1 * *') // Monthly on 1st at 3 AM UTC
async cleanupOldRecords() {
  const settings = await this.settingsRepo.findOne({});

  // Delete old trade history
  const tradeRetentionDate = subYears(new Date(), settings.trade_retention_years);
  await this.tradesRepo.delete({
    created_at: LessThan(tradeRetentionDate),
    flagged_for_investigation: false, // Keep flagged records
  });

  // Delete old user data (for deleted accounts only)
  const userRetentionDate = subYears(new Date(), settings.user_retention_years);
  await this.usersRepo.delete({
    deleted_at: LessThan(userRetentionDate),
  });

  // Delete old audit logs
  const auditRetentionDate = subYears(new Date(), settings.audit_retention_years);
  await this.auditLogsRepo.delete({
    created_at: LessThan(auditRetentionDate),
    flagged_for_investigation: false,
  });

  // KYC documents retention handled separately (10 years minimum)
  const kycRetentionDate = subYears(new Date(), settings.kyc_retention_years);
  await this.kycDocumentsRepo.delete({
    created_at: LessThan(kycRetentionDate),
    flagged_for_investigation: false,
  });
}
```

### 3. AML Transaction Monitoring (Real-time)

**Purpose:** Flag transactions exceeding AML threshold

```typescript
async monitorTransaction(transaction: {
  user_id: string;
  amount_ugx: number;
  type: 'withdrawal' | 'deposit' | 'trade';
  transaction_id: string;
}) {
  const settings = await this.settingsRepo.findOne({});

  if (transaction.amount_ugx >= settings.aml_threshold) {
    // Create AML flag
    const amlFlag = await this.amlFlagsRepo.save({
      user_id: transaction.user_id,
      transaction_id: transaction.transaction_id,
      transaction_type: transaction.type,
      amount_ugx: transaction.amount_ugx,
      amount_original: transaction.amount_ugx,
      currency_original: settings.aml_currency,
      flag_reason: `Transaction exceeds AML threshold (${settings.aml_threshold} ${settings.aml_currency})`,
      flag_type: 'threshold_exceeded',
      status: 'pending_review',
    });

    // Notify compliance team
    await this.notificationService.sendToRole('compliance_officer', {
      title: 'AML Threshold Exceeded',
      message: `Transaction ${transaction.transaction_id} flagged for review`,
      severity: 'warning',
    });

    return { flagged: true, flag_id: amlFlag.id };
  }

  return { flagged: false };
}
```

---

## Data Flow Summary

```
[Page Load]
   │
   └─> GET /api/settings/compliance (NestJS)
         │
         ├─> Query compliance.compliance_settings (PostgreSQL)
         ├─> Query compliance.jurisdiction_restrictions WHERE is_active = true
         └─> Return { compliance_settings, jurisdiction_restrictions[] }

[Admin Action: Update Compliance Settings]
   │
   └─> PUT /api/settings/compliance (NestJS)
         │
         ├─> Validate retention periods >= 7 years
         ├─> Update compliance.compliance_settings (PostgreSQL)
         ├─> Log audit trail
         └─> Return updated settings

[Admin Action: Add Jurisdiction Restriction]
   │
   └─> POST /api/settings/compliance/restrictions (NestJS)
         │
         ├─> Check for duplicate country_code
         ├─> Insert into compliance.jurisdiction_restrictions (PostgreSQL)
         ├─> Log audit trail
         └─> Return new restriction

[Background: Daily Sanctions Screening - 2 AM UTC]
   │
   └─> NestJS Cron Job
         │
         ├─> Fetch all active users
         ├─> For each user:
         │     ├─> Check against sanctions lists (OFAC, UN, EU)
         │     ├─> Log result to compliance.sanctions_screening_log
         │     ├─> If match found AND auto_suspend_on_aml_hit = true:
         │     │     ├─> Suspend user account
         │     │     ├─> Create AML flag
         │     │     └─> Notify compliance team
         │     └─> Continue
         └─> Complete

[Real-time: Transaction Monitoring]
   │
   └─> User initiates withdrawal/deposit/trade
         │
         └─> NestJS Service monitors transaction
               │
               ├─> Check if amount >= aml_threshold
               ├─> If yes:
               │     ├─> Create AML flag in compliance.aml_flags
               │     ├─> Notify compliance team
               │     └─> Return {flagged: true}
               └─> Return {flagged: false}

[Monthly: Data Retention Cleanup - 1st of month at 3 AM UTC]
   │
   └─> NestJS Cron Job
         │
         ├─> Calculate retention dates for each data type
         ├─> Delete trades older than trade_retention_years (exclude flagged)
         ├─> Delete users older than user_retention_years (deleted accounts only)
         ├─> Delete audit logs older than audit_retention_years (exclude flagged)
         ├─> Delete KYC documents older than kyc_retention_years (exclude flagged)
         └─> Log cleanup summary
```

---

## Summary Table

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Compliance settings | `compliance.compliance_settings` | NestJS REST | HTTP | No cache (singleton) |
| Jurisdiction restrictions | `compliance.jurisdiction_restrictions` | NestJS REST | HTTP | No cache |
| Update compliance settings | `compliance.compliance_settings` UPDATE | NestJS REST | HTTP | No cache |
| Add/Edit restriction | `compliance.jurisdiction_restrictions` | NestJS REST | HTTP | No cache |
| AML flags | `compliance.aml_flags` | NestJS REST | HTTP | No cache |
| Sanctions screening | Daily cron job | NestJS Cron | N/A | No cache |
| Data retention cleanup | Monthly cron job | NestJS Cron | N/A | No cache |

---

## Frontend Implementation Notes

**Load Compliance Settings:**

```typescript
// hooks/useComplianceSettings.ts
export function useComplianceSettings() {
  const [settings, setSettings] = useState(null);
  const [restrictions, setRestrictions] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch('/api/settings/compliance')
      .then(res => res.json())
      .then(data => {
        setSettings(data.compliance_settings);
        setRestrictions(data.jurisdiction_restrictions);
      });
  }, []);

  return { settings, restrictions, dirty, setDirty };
}
```

**Save Settings:**

```typescript
async function saveComplianceSettings(updates: Partial<ComplianceSettings>) {
  const response = await fetch('/api/settings/compliance', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  const result = await response.json();
  toast.success(result.message);
  setDirty(false);
}
```

**Add Restriction:**

```typescript
async function addRestriction(data: {
  country_code: string;
  country_name: string;
  reason: string;
  status: 'blocked' | 'restricted';
}) {
  const response = await fetch('/api/settings/compliance/restrictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  setRestrictions(prev => [...prev, result.restriction]);
  toast.success(result.message);
}
```

---

## Performance Considerations

1. **Sanctions List Caching:** Cache external sanctions list responses in Redis for 24 hours to avoid hitting third-party APIs on every screening.

2. **Batch Sanctions Screening:** Process users in batches of 100 during daily cron job to avoid overwhelming the database.

3. **AML Flag Indexing:** Add composite index on `(user_id, status, created_at DESC)` for compliance officer dashboard queries.

4. **Data Retention Partitioning:** Partition large tables (trades, audit logs) by year for faster retention cleanup.

5. **Jurisdiction Check Cache:** Cache active jurisdiction restrictions in Redis (TTL: 1 hour) for fast signup/KYC validation.

---

## Testing Checklist

- [ ] Compliance settings load correctly on page load
- [ ] AML threshold and currency can be updated
- [ ] Sanctions lists string validates comma-separated format
- [ ] Data retention periods enforce minimum 7 years validation
- [ ] Toggles (auto-suspend, GDPR, etc.) save correctly
- [ ] Jurisdiction restrictions display in table
- [ ] Add restriction creates new row and shows in table
- [ ] Edit restriction updates reason and status
- [ ] Blocked countries prevent user signup
- [ ] Restricted countries allow signup with limitations
- [ ] Daily sanctions screening cron job runs successfully
- [ ] Auto-suspend triggers when sanctions match found
- [ ] AML flags are created for transactions exceeding threshold
- [ ] Compliance team receives notifications for AML flags
- [ ] Data retention cleanup job deletes old records
- [ ] Flagged/investigation records are exempt from cleanup
- [ ] Audit logs capture all compliance setting changes

---

**[← Previous: Communications](./23-settings-communications.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Exchanges →](./25-settings-exchanges.md)**
