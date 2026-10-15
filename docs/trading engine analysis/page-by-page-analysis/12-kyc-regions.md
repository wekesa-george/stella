## Page 12: `/kyc-review/regions` - Regional Compliance Page

### UI Features & Requirements

1. **Summary Cards (4 metrics)**
   - Regions Defined (count of named routing groups)
   - Countries Covered (explicit + fallback coverage)
   - Fallback Provider (default provider for unmapped countries)
   - Unmapped Countries count

2. **Region → Provider Routing Table**
   - Columns: Region, Countries, Provider, Workflow, Actions
   - Each region shows:
     - Region name with active/inactive status
     - Country codes (ISO 3166-1 alpha-2) or "All unmapped countries" for fallback
     - Provider badge (SumSub, Onfido, Persona)
     - Workflow name
     - Edit button (admin only)
   - "Add Region" button (admin only)

3. **Coverage Visualization**
   - World map placeholder showing provider coverage by country
   - Color-coded by assigned provider
   - Hover for region details
   - Provider legend

4. **Re-Verification Rules Table**
   - Columns: Trigger, Threshold, Action, Provider
   - Examples:
     - Document expiry (30 days before)
     - Tier upgrade request
     - AML watchlist match
   - "Add Rule" button (admin only)

5. **Role-Based Access**
   - Platform Admin: Full edit access (add/edit regions, manage rules)
   - Compliance Officer: Read-only access

---

### Data Source Mapping

| Component | Data Source | Endpoint/Channel | Update Frequency | Notes |
|-----------|-------------|------------------|------------------|-------|
| **Regions List** | NestJS API | `GET /api/kyc/regions` | On page load | Returns all region configs |
| **Provider Configs** | NestJS API | `GET /api/kyc/providers` | On page load | Returns available providers and workflows |
| **Re-Verification Rules** | NestJS API | `GET /api/kyc/reverification-rules` | On page load | Returns configured rules |
| **Add/Edit Region** | NestJS API | `POST/PUT /api/kyc/regions` | On submit | Creates or updates region config |
| **Add/Edit Rule** | NestJS API | `POST/PUT /api/kyc/reverification-rules` | On submit | Creates or updates rule |
| **Summary Stats** | Client-side Derived | Calculated from loaded regions | Real-time | Counts and coverage info |

---

### NestJS REST API Endpoints

#### 1. Get KYC Regions Configuration

**Endpoint:** `GET /api/kyc/regions`

**Response:**
```json
{
  "regions": [
    {
      "id": "uuid-1",
      "name": "East Africa",
      "countryCodes": ["UG", "KE", "TZ", "RW", "ET"],
      "provider": "sumsub",
      "workflow": "standard-kyc",
      "isActive": true,
      "priority": 1,
      "createdAt": "2025-11-01T00:00:00Z",
      "updatedAt": "2025-11-01T00:00:00Z"
    },
    {
      "id": "uuid-2",
      "name": "Southern Africa",
      "countryCodes": ["ZA", "ZM", "ZW", "BW", "MZ"],
      "provider": "sumsub",
      "workflow": "enhanced-due-diligence",
      "isActive": true,
      "priority": 2,
      "createdAt": "2025-11-01T00:00:00Z",
      "updatedAt": "2025-11-01T00:00:00Z"
    },
    {
      "id": "uuid-fallback",
      "name": "Rest of World",
      "countryCodes": ["*"],
      "provider": "persona",
      "workflow": "aml-enhanced",
      "isActive": true,
      "priority": 999,
      "createdAt": "2025-11-01T00:00:00Z",
      "updatedAt": "2025-11-01T00:00:00Z"
    }
  ],
  "summary": {
    "totalRegions": 6,
    "countriesCovered": 30,
    "fallbackProvider": "persona",
    "unmappedCount": 0
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  r.id,
  r.name,
  r.country_codes,
  r.provider_code,
  r.workflow_name,
  r.is_active,
  r.priority,
  r.created_at,
  r.updated_at
FROM kyc.region_routing r
ORDER BY r.priority ASC, r.name ASC;

-- Get summary stats
SELECT
  COUNT(*) as total_regions,
  COUNT(DISTINCT UNNEST(country_codes)) as countries_covered,
  (SELECT provider_code FROM kyc.region_routing WHERE country_codes @> ARRAY['*']) as fallback_provider
FROM kyc.region_routing
WHERE is_active = TRUE;
```

---

#### 2. Get KYC Providers Configuration

**Endpoint:** `GET /api/kyc/providers`

**Response:**
```json
{
  "providers": [
    {
      "code": "sumsub",
      "name": "SumSub",
      "status": "active",
      "apiEndpoint": "https://api.sumsub.com",
      "healthStatus": "healthy",
      "lastHealthCheck": "2026-02-21T15:00:00Z",
      "workflows": [
        {
          "code": "standard-kyc",
          "name": "Standard KYC",
          "description": "Basic identity verification"
        },
        {
          "code": "enhanced-due-diligence",
          "name": "Enhanced Due Diligence",
          "description": "High-risk customer verification"
        }
      ],
      "documentationUrl": "https://developers.sumsub.com",
      "createdAt": "2025-10-01T00:00:00Z"
    },
    {
      "code": "onfido",
      "name": "Onfido",
      "status": "active",
      "apiEndpoint": "https://api.onfido.com",
      "healthStatus": "healthy",
      "lastHealthCheck": "2026-02-21T15:00:00Z",
      "workflows": [
        {
          "code": "us-standard",
          "name": "US Standard",
          "description": "US identity verification"
        }
      ],
      "documentationUrl": "https://documentation.onfido.com",
      "createdAt": "2025-10-01T00:00:00Z"
    },
    {
      "code": "persona",
      "name": "Persona",
      "status": "active",
      "apiEndpoint": "https://api.withpersona.com",
      "healthStatus": "healthy",
      "lastHealthCheck": "2026-02-21T15:00:00Z",
      "workflows": [
        {
          "code": "global-standard",
          "name": "Global Standard",
          "description": "Global identity verification"
        }
      ],
      "documentationUrl": "https://docs.withpersona.com",
      "createdAt": "2025-12-01T00:00:00Z"
    }
  ]
}
```

**PostgreSQL Query:**
```sql
SELECT
  p.code,
  p.name,
  p.status,
  p.api_endpoint,
  p.health_status,
  p.last_health_check_at,
  p.documentation_url,
  p.created_at,
  -- Get workflows as JSON array
  (
    SELECT json_agg(json_build_object(
      'code', w.code,
      'name', w.name,
      'description', w.description
    ))
    FROM kyc.provider_workflows w
    WHERE w.provider_code = p.code AND w.is_active = TRUE
  ) as workflows
FROM kyc.providers p
WHERE p.is_active = TRUE
ORDER BY p.name ASC;
```

---

#### 3. Get Re-Verification Rules

**Endpoint:** `GET /api/kyc/reverification-rules`

**Response:**
```json
{
  "rules": [
    {
      "id": "uuid-1",
      "trigger": "document_expiry",
      "triggerLabel": "Document expiry",
      "threshold": "30 days before",
      "thresholdDays": 30,
      "action": "flag_expiring_soon",
      "actionDescription": "Flag as expiring-soon, notify user",
      "providerStrategy": "same_as_original",
      "providerStrategyLabel": "Same provider as original KYC",
      "isActive": true,
      "createdAt": "2025-11-01T00:00:00Z"
    },
    {
      "id": "uuid-2",
      "trigger": "tier_upgrade",
      "triggerLabel": "Tier upgrade request",
      "threshold": "Standard → Enhanced or Accredited",
      "thresholdTiers": ["enhanced", "accredited"],
      "action": "trigger_enhanced_dd",
      "actionDescription": "Trigger enhanced-due-diligence workflow",
      "providerStrategy": "region_default",
      "providerStrategyLabel": "Original region's provider",
      "isActive": true,
      "createdAt": "2025-11-01T00:00:00Z"
    },
    {
      "id": "uuid-3",
      "trigger": "aml_watchlist_match",
      "triggerLabel": "AML watchlist match",
      "threshold": "Any hit on refresh scan",
      "action": "suspend_and_review",
      "actionDescription": "Suspend account, flag for manual review",
      "providerStrategy": "same_with_new_check",
      "providerStrategyLabel": "Same provider, new check",
      "isActive": true,
      "createdAt": "2025-11-01T00:00:00Z"
    }
  ]
}
```

**PostgreSQL Query:**
```sql
SELECT
  r.id,
  r.trigger_type,
  r.trigger_label,
  r.threshold_value,
  r.threshold_description,
  r.action_type,
  r.action_description,
  r.provider_selection_strategy,
  r.provider_strategy_label,
  r.is_active,
  r.created_at
FROM kyc.reverification_rules r
WHERE r.is_active = TRUE
ORDER BY r.priority ASC;
```

---

#### 4. Create or Update Region

**Endpoint:** `POST /api/kyc/regions` (create) or `PUT /api/kyc/regions/:id` (update)

**Request Body:**
```json
{
  "name": "West Africa",
  "countryCodes": ["NG", "GH", "SN", "CI"],
  "provider": "sumsub",
  "workflow": "standard-kyc",
  "isActive": true,
  "priority": 3
}
```

**Response:**
```json
{
  "success": true,
  "message": "Region created successfully",
  "region": {
    "id": "uuid-new",
    "name": "West Africa",
    "countryCodes": ["NG", "GH", "SN", "CI"],
    "provider": "sumsub",
    "workflow": "standard-kyc",
    "isActive": true,
    "priority": 3,
    "createdAt": "2026-02-21T15:30:00Z"
  }
}
```

**PostgreSQL Transaction:**
```sql
BEGIN;

-- Check for country code conflicts
DO $$
DECLARE
  v_overlapping_countries TEXT[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT unnested_code)
  INTO v_overlapping_countries
  FROM (
    SELECT UNNEST(country_codes) as unnested_code
    FROM kyc.region_routing
    WHERE id != $1  -- Exclude current region if updating
      AND is_active = TRUE
  ) existing
  WHERE unnested_code = ANY($2::TEXT[]);  -- New country codes

  IF array_length(v_overlapping_countries, 1) > 0 THEN
    RAISE EXCEPTION 'Country codes already assigned to another region: %',
      array_to_string(v_overlapping_countries, ', ');
  END IF;
END $$;

-- Insert or update region
INSERT INTO kyc.region_routing (
  name,
  country_codes,
  provider_code,
  workflow_name,
  is_active,
  priority
) VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  country_codes = EXCLUDED.country_codes,
  provider_code = EXCLUDED.provider_code,
  workflow_name = EXCLUDED.workflow_name,
  is_active = EXCLUDED.is_active,
  priority = EXCLUDED.priority,
  updated_at = NOW();

-- Log audit trail
INSERT INTO admin.admin_audit_log (
  admin_user_id,
  admin_email,
  admin_name,
  ip_address,
  action,
  action_category,
  target_type,
  target_id,
  target_identifier,
  description,
  severity,
  metadata
) VALUES (
  $7,  -- Current admin ID
  $8,  -- Current admin email
  $9,  -- Current admin name
  $10, -- IP address
  'kyc.region_configured',
  'kyc_management',
  'kyc_region',
  $11, -- Region ID
  $1,  -- Region name
  'KYC region routing configured',
  'medium',
  jsonb_build_object(
    'region_name', $1,
    'country_codes', $2,
    'provider', $3,
    'workflow', $4
  )
);

COMMIT;
```

---

#### 5. Create or Update Re-Verification Rule

**Endpoint:** `POST /api/kyc/reverification-rules` (create) or `PUT /api/kyc/reverification-rules/:id` (update)

**Request Body:**
```json
{
  "trigger": "document_expiry",
  "triggerLabel": "Document expiry",
  "thresholdValue": "30",
  "thresholdDescription": "30 days before",
  "action": "flag_expiring_soon",
  "actionDescription": "Flag as expiring-soon, notify user",
  "providerStrategy": "same_as_original",
  "providerStrategyLabel": "Same provider as original KYC",
  "priority": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Re-verification rule created successfully"
}
```

---

### Database Schema Requirements

#### New Tables Required

**1. KYC Region Routing Table**

```sql
CREATE SCHEMA IF NOT EXISTS kyc;

CREATE TABLE kyc.region_routing (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) NOT NULL,                  -- "East Africa", "EU", etc.
    country_codes       TEXT[] NOT NULL,                        -- ['UG', 'KE', 'TZ'] or ['*'] for fallback
    provider_code       VARCHAR(50) NOT NULL,                   -- 'sumsub', 'onfido', 'persona'
    workflow_name       VARCHAR(100) NOT NULL,                  -- 'standard-kyc', 'enhanced-dd', etc.
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    priority            INTEGER NOT NULL DEFAULT 100,           -- Lower = higher priority for overlaps
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_region_name UNIQUE (name)
);

-- Indexes
CREATE INDEX idx_region_routing_active ON kyc.region_routing(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_region_routing_priority ON kyc.region_routing(priority);
CREATE INDEX idx_region_routing_provider ON kyc.region_routing(provider_code);
CREATE INDEX idx_region_routing_countries ON kyc.region_routing USING GIN(country_codes);

COMMENT ON TABLE kyc.region_routing IS 'Regional routing configuration for KYC provider selection based on user country';
COMMENT ON COLUMN kyc.region_routing.country_codes IS 'ISO 3166-1 alpha-2 country codes or [''*''] for fallback/catch-all';
COMMENT ON COLUMN kyc.region_routing.priority IS 'Priority for conflict resolution - lower values take precedence';
```

**2. KYC Providers Table**

```sql
CREATE TABLE kyc.providers (
    code                VARCHAR(50) PRIMARY KEY,                -- 'sumsub', 'onfido', 'persona'
    name                VARCHAR(100) NOT NULL,                  -- 'SumSub', 'Onfido', 'Persona'
    status              VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, inactive, deprecated
    api_endpoint        VARCHAR(500) NOT NULL,
    api_key_encrypted   BYTEA,                                  -- Encrypted API credentials
    api_secret_encrypted BYTEA,
    webhook_secret_encrypted BYTEA,
    health_status       VARCHAR(20) DEFAULT 'unknown',          -- healthy, degraded, down, unknown
    last_health_check_at TIMESTAMPTZ,
    documentation_url   VARCHAR(500),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    config              JSONB DEFAULT '{}',
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_providers_status ON kyc.providers(status);
CREATE INDEX idx_providers_health ON kyc.providers(health_status);

COMMENT ON TABLE kyc.providers IS 'KYC/AML provider configurations and health status';
```

**3. KYC Provider Workflows Table**

```sql
CREATE TABLE kyc.provider_workflows (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_code       VARCHAR(50) NOT NULL REFERENCES kyc.providers(code),
    code                VARCHAR(100) NOT NULL,                  -- 'standard-kyc', 'enhanced-dd'
    name                VARCHAR(100) NOT NULL,                  -- 'Standard KYC', 'Enhanced Due Diligence'
    description         TEXT,
    provider_workflow_id VARCHAR(255),                          -- External workflow ID in provider system
    required_documents  JSONB DEFAULT '[]',                     -- ['passport', 'selfie', 'proof_of_address']
    verification_levels TEXT[] DEFAULT ARRAY[]::TEXT[],         -- ['basic', 'standard', 'enhanced']
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    config              JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_provider_workflow UNIQUE (provider_code, code)
);

CREATE INDEX idx_provider_workflows_provider ON kyc.provider_workflows(provider_code);
CREATE INDEX idx_provider_workflows_active ON kyc.provider_workflows(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE kyc.provider_workflows IS 'Workflow definitions for each KYC provider';
```

**4. Re-Verification Rules Table**

```sql
CREATE TABLE kyc.reverification_rules (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_type            VARCHAR(50) NOT NULL,               -- 'document_expiry', 'tier_upgrade', 'aml_watchlist_match'
    trigger_label           VARCHAR(100) NOT NULL,
    threshold_value         TEXT,                               -- '30' (days), 'enhanced,accredited' (tiers)
    threshold_description   TEXT,
    action_type             VARCHAR(50) NOT NULL,               -- 'flag_expiring_soon', 'trigger_enhanced_dd', 'suspend_and_review'
    action_description      TEXT,
    provider_selection_strategy VARCHAR(50) NOT NULL,           -- 'same_as_original', 'region_default', 'same_with_new_check'
    provider_strategy_label TEXT,
    priority                INTEGER NOT NULL DEFAULT 100,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reverification_rules_trigger ON kyc.reverification_rules(trigger_type);
CREATE INDEX idx_reverification_rules_active ON kyc.reverification_rules(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE kyc.reverification_rules IS 'Automated rules for triggering KYC re-verification based on various triggers';
```

**5. Update `auth.kyc_records` to Reference Region**

```sql
-- Add region tracking to existing KYC records table
ALTER TABLE auth.kyc_records
ADD COLUMN region_id UUID REFERENCES kyc.region_routing(id),
ADD COLUMN provider_workflow_id UUID REFERENCES kyc.provider_workflows(id),
ADD COLUMN reverification_trigger VARCHAR(50),
ADD COLUMN reverification_triggered_at TIMESTAMPTZ;

CREATE INDEX idx_kyc_records_region ON auth.kyc_records(region_id);
CREATE INDEX idx_kyc_records_workflow ON auth.kyc_records(provider_workflow_id);
CREATE INDEX idx_kyc_records_reverification ON auth.kyc_records(reverification_trigger) WHERE reverification_trigger IS NOT NULL;

COMMENT ON COLUMN auth.kyc_records.region_id IS 'KYC region used for this verification (based on user country at time of submission)';
COMMENT ON COLUMN auth.kyc_records.reverification_trigger IS 'Reason for re-verification if this is a re-verification record';
```

---

### Data Flow Summary

```
1. PAGE LOAD
   Frontend → NestJS GET /api/kyc/regions → Query kyc.region_routing → Return regions list
   Frontend → NestJS GET /api/kyc/providers → Query kyc.providers + kyc.provider_workflows → Return providers
   Frontend → NestJS GET /api/kyc/reverification-rules → Query kyc.reverification_rules → Return rules

2. ADD/EDIT REGION
   User clicks "Add Region" → Modal opens → User fills form → Submit
   Frontend → NestJS POST /api/kyc/regions → Validate country codes, insert region, log audit → Return success

3. ADD/EDIT RE-VERIFICATION RULE
   User clicks "Add Rule" → Modal opens → User fills form → Submit
   Frontend → NestJS POST /api/kyc/reverification-rules → Insert rule, log audit → Return success

4. COUNTRY ROUTING LOGIC (Application Layer)
   User registers with country "UG"
   → Application queries kyc.region_routing WHERE 'UG' = ANY(country_codes) ORDER BY priority ASC LIMIT 1
   → Returns East Africa → SumSub → standard-kyc workflow
   → Creates auth.kyc_records with region_id and provider_workflow_id
```

---

### Summary Table

| Component | Data Source | Protocol | Frequency | Storage |
|-----------|-------------|----------|-----------|---------|
| **Regions List** | NestJS API | HTTP REST | On page load | PostgreSQL `kyc.region_routing` |
| **Providers List** | NestJS API | HTTP REST | On page load | PostgreSQL `kyc.providers` + `kyc.provider_workflows` |
| **Re-Verification Rules** | NestJS API | HTTP REST | On page load | PostgreSQL `kyc.reverification_rules` |
| **Summary Stats** | Client-side | JavaScript | Real-time | Derived from loaded regions |
| **Add/Edit Region** | NestJS API | HTTP REST | On submit | PostgreSQL `kyc.region_routing` |
| **Add/Edit Rule** | NestJS API | HTTP REST | On submit | PostgreSQL `kyc.reverification_rules` |

---

### Frontend Implementation Notes

**API Integration:**
```typescript
interface KYCRegion {
  id: string;
  name: string;
  countryCodes: string[];
  provider: string;
  workflow: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface KYCProvider {
  code: string;
  name: string;
  status: string;
  healthStatus: string;
  workflows: {
    code: string;
    name: string;
    description: string;
  }[];
  documentationUrl: string;
}

// Load regions
async function loadRegions() {
  const res = await fetch("/api/kyc/regions");
  const data = await res.json();
  setRegions(data.regions);
  setSummary(data.summary);
}

// Load providers
async function loadProviders() {
  const res = await fetch("/api/kyc/providers");
  const data = await res.json();
  setProviders(data.providers);
}

// Create region
async function createRegion(region: Partial<KYCRegion>) {
  const res = await fetch("/api/kyc/regions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(region),
  });

  if (!res.ok) {
    throw new Error("Failed to create region");
  }

  await loadRegions();
  toast.success("Region created successfully");
}
```

---

### Multi-Exchange Context

**Not Applicable** - This page manages KYC/AML compliance and regional routing for identity verification providers. It does not interact with:
- Trading operations
- Exchange credentials
- Bot management
- Order execution

However, there is an **indirect relationship**:
- KYC verification level determines user tier
- User tier determines trading limits and exchange access
- Higher tiers (enhanced, accredited) may unlock access to certain exchanges or higher limits

---

### Testing Checklist

- [ ] Regions list loads correctly with all fields
- [ ] Summary cards display accurate counts
- [ ] Provider badges display correctly with color coding
- [ ] Country codes display properly
- [ ] Fallback region ("Rest of World") displays correctly
- [ ] Re-verification rules load and display correctly
- [ ] "Add Region" button only visible to Platform Admin
- [ ] "Edit" buttons only visible to Platform Admin
- [ ] Creating a new region validates country code conflicts
- [ ] Updating a region preserves existing country assignments
- [ ] Priority ordering works correctly for overlapping countries
- [ ] Provider health status displays correctly
- [ ] Coverage visualization placeholder renders
- [ ] Export CSV functionality works (if implemented)

---

### Recommended Enhancements

1. **Interactive Coverage Map**
   - Use D3.js or similar library to render world map
   - Color-code countries by assigned provider
   - Hover tooltips showing region, provider, workflow
   - Click to edit region

2. **Provider Health Monitoring**
   - Real-time health checks every 5 minutes
   - Alert when provider goes down or degraded
   - Automatic failover to backup provider

3. **Country Code Autocomplete**
   - Dropdown with country names + codes
   - Search/filter functionality
   - Multi-select for region assignment

4. **Workflow Testing**
   - "Test Workflow" button to validate provider integration
   - Sample submission to verify credentials
   - Health check response time display

5. **Audit Trail Integration**
   - Link to audit trail filtered by region changes
   - Show who last modified each region
   - Timestamp of last update

6. **Analytics Dashboard**
   - Submissions by region
   - Approval rates by provider
   - Average processing time by workflow
   - Cost per verification by provider

---

**[← Previous: Admin User Detail](./11-admin-user-detail.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: KYC Audit Trail →](./13-kyc-audit.md)**
