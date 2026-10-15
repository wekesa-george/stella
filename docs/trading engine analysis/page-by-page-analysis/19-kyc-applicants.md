## Page 19: `/kyc-review/applicants` - KYC Applicant Review & Compliance Workflow

### UI Mock Data Structure

```typescript
interface KYCApplicant {
  id: string;                    // "KYC-1001"
  name: string;                  // "Amara Nwosu"
  email: string;                 // "amara@example.com"
  country: string;               // "UG" (ISO country code)
  region: string;                // "East Africa"
  provider: string;              // "sumsub", "onfido", "persona"
  status: string;                // "approved", "pending", "review", "declined", "expiring", "re-verify"
  riskScore: number;             // 0-100
  docType: string;               // "Passport", "National ID", "Driver's Licence", "Residence Permit"
  submittedAt: string;           // "15 Jan 2026"
  updatedAt: string;             // "20 Feb 2026"
  expiresAt: string;             // "15 Jan 2028"
  watchlistHit: boolean;         // Sanctions/PEP screening
  faceMatch: number;             // 0-100% confidence
  docAuth: number;               // 0-100% authenticity score
  rejectionReasons: string[];    // ["Document expired", "Face match below threshold"]
  tier: string;                  // "Standard", "Enhanced", "Accredited"
  notes: string[];               // Compliance notes
  applicantId: string;           // "SUMSUB-A7K3D9F2H" (provider-specific ID)
}

interface KYCProvider {
  name: string;                  // "SumSub", "Onfido", "Persona"
  color: string;                 // Brand color
  bg: string;                    // Background color
  docs: string;                  // API docs URL
}

interface StatusMeta {
  label: string;                 // "Approved", "Pending", etc.
  color: string;                 // Display color
  dot: string;                   // Status indicator color
  icon: string;                  // Status icon
}

interface RegionConfig {
  name: string;                  // "East Africa", "European Union", etc.
  countries: string[];           // ["UG", "KE", "TZ", "RW", "ET"]
}

interface KYCStats {
  approved: number;              // Total approved applicants
  pending: number;               // Awaiting auto-verification
  review: number;                // Requires manual review
  declined: number;              // Rejected applications
  expiring: number;              // Documents expiring soon
  reVerify: number;              // Require re-verification
}
```

### UI Features & Requirements

1. **KYC Status KPIs** - 6 cards showing count by status (Approved, Pending, Manual Review, Declined, Expiring, Re-Verify)
2. **Work Queue Alert** - Highlighted banner showing count of applicants requiring manual review
3. **Multi-Filter System** - Search (name/email/ID), status, provider, region filters
4. **Applicant Table** - Comprehensive table with risk scores, verification metrics, and status
5. **Applicant Detail Modal** - Full KYC data review with compliance decision workflow
6. **Provider Integration** - Embedded iframe for provider-specific document review
7. **Compliance Workflow** - Approve/Decline/Re-Verify with mandatory compliance notes
8. **Role-Based Access** - Compliance Officer vs Platform Admin permissions
9. **Audit Trail** - All decisions logged with timestamps and notes
10. **Multi-Exchange Context** - **NOT APPLICABLE** - KYC is user-level, not exchange-specific

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Applicant List** | PostgreSQL | `kyc.applicants` table | On page load | All KYC submissions |
| **Applicant ID** | PostgreSQL | `kyc.applicants.id` | Static | Auto-generated |
| **User Info** | PostgreSQL | JOIN `auth.users` | Static | Name, email |
| **Country/Region** | PostgreSQL | `kyc.applicants.country_code` | Static | User's jurisdiction |
| **Provider** | PostgreSQL | `kyc.applicants.provider` | Static | SumSub, Onfido, Persona |
| **Status** | PostgreSQL | `kyc.applicants.status` | Real-time | Webhook updates from provider |
| **Risk Score** | PostgreSQL | `kyc.applicants.risk_score` | On verification | Composite risk score |
| **Document Type** | PostgreSQL | `kyc.applicants.document_type` | Static | ID type submitted |
| **Submitted Date** | PostgreSQL | `kyc.applicants.submitted_at` | Static | Initial submission |
| **Updated Date** | PostgreSQL | `kyc.applicants.updated_at` | Real-time | Last status change |
| **Expiry Date** | PostgreSQL | `kyc.applicants.document_expires_at` | Static | From OCR/manual entry |
| **Watchlist Hit** | PostgreSQL | `kyc.applicants.watchlist_hit` | On verification | AML/sanctions screening |
| **Face Match Score** | PostgreSQL | `kyc.applicants.face_match_score` | On verification | Liveness + selfie match |
| **Document Auth Score** | PostgreSQL | `kyc.applicants.document_authenticity_score` | On verification | Fraud detection |
| **Rejection Reasons** | PostgreSQL | `kyc.rejection_reasons` table | On decline | Multi-valued |
| **Account Tier** | PostgreSQL | `kyc.applicants.account_tier` | On approval | Standard/Enhanced/Accredited |
| **Compliance Notes** | PostgreSQL | `kyc.compliance_notes` table | On manual action | Audit trail |
| **Provider Applicant ID** | PostgreSQL | `kyc.applicants.provider_applicant_id` | On submission | External reference |
| **Status Counts** | PostgreSQL Aggregate | COUNT GROUP BY status | On page load | Dashboard KPIs |

---

### Data Delivery Strategy

#### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/kyc/applicants/stats`

**Response:**
```json
{
  "stats": {
    "approved": 9,
    "pending": 2,
    "review": 1,
    "declined": 1,
    "expiring": 1,
    "re-verify": 1
  },
  "workQueue": {
    "manualReviewCount": 1,
    "expiringWithin30Days": 2,
    "reVerifyCount": 1
  }
}
```

**PostgreSQL Query:**
```sql
WITH status_counts AS (
  SELECT
    status,
    COUNT(*) as count
  FROM kyc.applicants
  WHERE deleted_at IS NULL
  GROUP BY status
),
expiring_soon AS (
  SELECT COUNT(*) as count
  FROM kyc.applicants
  WHERE document_expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
    AND status = 'approved'
)
SELECT
  COALESCE(SUM(count) FILTER (WHERE status = 'approved'), 0) as approved,
  COALESCE(SUM(count) FILTER (WHERE status = 'pending'), 0) as pending,
  COALESCE(SUM(count) FILTER (WHERE status = 'review'), 0) as review,
  COALESCE(SUM(count) FILTER (WHERE status = 'declined'), 0) as declined,
  COALESCE(SUM(count) FILTER (WHERE status = 'expiring'), 0) as expiring,
  COALESCE(SUM(count) FILTER (WHERE status = 're-verify'), 0) as re_verify,
  (SELECT count FROM expiring_soon) as expiring_within_30d
FROM status_counts;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 2:** `GET /api/kyc/applicants?status=all&provider=all&region=all&search=`

**Response:**
```json
{
  "applicants": [
    {
      "id": "KYC-1001",
      "userId": "uuid",
      "name": "Amara Nwosu",
      "email": "amara@example.com",
      "country": "UG",
      "region": "East Africa",
      "provider": "sumsub",
      "status": "approved",
      "riskScore": 87,
      "docType": "Passport",
      "submittedAt": "2026-01-15T10:30:00Z",
      "updatedAt": "2026-01-16T14:20:00Z",
      "expiresAt": "2028-01-15T00:00:00Z",
      "watchlistHit": false,
      "faceMatch": 92,
      "docAuth": 95,
      "rejectionReasons": [],
      "tier": "Standard",
      "applicantId": "SUMSUB-A7K3D9F2H"
    },
    ...
  ],
  "total": 15,
  "filtered": 15
}
```

**PostgreSQL Query:**
```sql
SELECT
  a.id,
  a.user_id,
  u.full_name as name,
  u.email,
  a.country_code as country,
  r.name as region,
  a.provider,
  a.status,
  a.risk_score,
  a.document_type as doc_type,
  a.submitted_at,
  a.updated_at,
  a.document_expires_at as expires_at,
  a.watchlist_hit,
  a.face_match_score as face_match,
  a.document_authenticity_score as doc_auth,
  COALESCE(
    (SELECT ARRAY_AGG(reason) FROM kyc.rejection_reasons WHERE applicant_id = a.id),
    '{}'
  ) as rejection_reasons,
  a.account_tier as tier,
  a.provider_applicant_id as applicant_id
FROM kyc.applicants a
JOIN auth.users u ON a.user_id = u.id
LEFT JOIN kyc.region_config r ON r.countries @> ARRAY[a.country_code]
WHERE a.deleted_at IS NULL
  AND ($1 = 'all' OR a.status = $1)  -- status filter
  AND ($2 = 'all' OR a.provider = $2)  -- provider filter
  AND ($3 = 'all' OR r.name = $3)  -- region filter
  AND (
    $4 = '' OR
    u.full_name ILIKE '%' || $4 || '%' OR
    u.email ILIKE '%' || $4 || '%' OR
    a.id ILIKE '%' || $4 || '%'
  )  -- search filter
ORDER BY
  CASE
    WHEN a.status = 'review' THEN 1
    WHEN a.status = 're-verify' THEN 2
    WHEN a.status = 'pending' THEN 3
    WHEN a.status = 'expiring' THEN 4
    ELSE 5
  END,
  a.submitted_at DESC;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 3:** `GET /api/kyc/applicants/:id`

**Response:**
```json
{
  "applicant": {
    "id": "KYC-1001",
    "userId": "uuid",
    "name": "Amara Nwosu",
    "email": "amara@example.com",
    "country": "UG",
    "region": "East Africa",
    "provider": "sumsub",
    "status": "approved",
    "riskScore": 87,
    "docType": "Passport",
    "submittedAt": "2026-01-15T10:30:00Z",
    "updatedAt": "2026-01-16T14:20:00Z",
    "expiresAt": "2028-01-15T00:00:00Z",
    "watchlistHit": false,
    "faceMatch": 92,
    "docAuth": 95,
    "rejectionReasons": [],
    "tier": "Standard",
    "applicantId": "SUMSUB-A7K3D9F2H",
    "complianceNotes": [
      {
        "id": "uuid",
        "action": "approved",
        "note": "All verification checks passed. Document valid until 2028.",
        "createdBy": "compliance@stella.com",
        "createdAt": "2026-01-16T14:20:00Z"
      }
    ],
    "verificationHistory": [
      {
        "event": "submitted",
        "timestamp": "2026-01-15T10:30:00Z",
        "provider": "sumsub"
      },
      {
        "event": "face_match_completed",
        "timestamp": "2026-01-15T10:31:42Z",
        "score": 92
      },
      {
        "event": "document_verified",
        "timestamp": "2026-01-15T10:32:15Z",
        "score": 95
      },
      {
        "event": "approved",
        "timestamp": "2026-01-16T14:20:00Z",
        "by": "compliance@stella.com"
      }
    ]
  }
}
```

**PostgreSQL Query:**
```sql
WITH applicant_data AS (
  SELECT
    a.id,
    a.user_id,
    u.full_name as name,
    u.email,
    a.country_code as country,
    r.name as region,
    a.provider,
    a.status,
    a.risk_score,
    a.document_type as doc_type,
    a.submitted_at,
    a.updated_at,
    a.document_expires_at as expires_at,
    a.watchlist_hit,
    a.face_match_score as face_match,
    a.document_authenticity_score as doc_auth,
    a.account_tier as tier,
    a.provider_applicant_id as applicant_id
  FROM kyc.applicants a
  JOIN auth.users u ON a.user_id = u.id
  LEFT JOIN kyc.region_config r ON r.countries @> ARRAY[a.country_code]
  WHERE a.id = $1
),
rejection_reasons AS (
  SELECT ARRAY_AGG(reason) as reasons
  FROM kyc.rejection_reasons
  WHERE applicant_id = $1
),
compliance_notes AS (
  SELECT
    cn.id,
    cn.action,
    cn.note,
    au.email as created_by,
    cn.created_at
  FROM kyc.compliance_notes cn
  JOIN auth.users au ON cn.created_by_user_id = au.id
  WHERE cn.applicant_id = $1
  ORDER BY cn.created_at DESC
),
verification_history AS (
  SELECT
    vh.event,
    vh.timestamp,
    vh.provider,
    vh.score,
    au.email as by
  FROM kyc.verification_history vh
  LEFT JOIN auth.users au ON vh.actioned_by_user_id = au.id
  WHERE vh.applicant_id = $1
  ORDER BY vh.timestamp ASC
)
SELECT
  ad.*,
  COALESCE(rr.reasons, '{}') as rejection_reasons,
  (SELECT JSON_AGG(cn.*) FROM compliance_notes cn) as compliance_notes,
  (SELECT JSON_AGG(vh.*) FROM verification_history vh) as verification_history
FROM applicant_data ad
CROSS JOIN rejection_reasons rr;
```

**Data Source:** **NestJS API** → PostgreSQL

---

**Endpoint 4:** `POST /api/kyc/applicants/:id/action`

**Request Body:**
```json
{
  "action": "approve",  // "approve", "decline", "re-verify"
  "note": "All verification checks passed. Document valid until 2028.",
  "tier": "Standard"  // Only for approve action
}
```

**Response:**
```json
{
  "success": true,
  "applicantId": "KYC-1001",
  "status": "approved",
  "updatedAt": "2026-02-21T15:30:00Z",
  "auditId": "uuid"
}
```

**PostgreSQL Transaction:**
```sql
-- 1. Update applicant status
UPDATE kyc.applicants
SET
  status = $2,  -- 'approved', 'declined', 're-verify'
  account_tier = CASE WHEN $2 = 'approved' THEN $3 ELSE account_tier END,
  updated_at = NOW(),
  reviewed_by_user_id = $4,
  reviewed_at = NOW()
WHERE id = $1
RETURNING *;

-- 2. Insert compliance note (mandatory for manual actions)
INSERT INTO kyc.compliance_notes (
  applicant_id,
  action,
  note,
  created_by_user_id,
  created_at
) VALUES (
  $1,
  $2,
  $5,  -- compliance note
  $4,  -- acting user ID
  NOW()
);

-- 3. Record verification history event
INSERT INTO kyc.verification_history (
  applicant_id,
  event,
  timestamp,
  actioned_by_user_id,
  metadata
) VALUES (
  $1,
  $2,  -- 'approved', 'declined', 're-verify'
  NOW(),
  $4,
  jsonb_build_object('tier', $3, 'note_id', (SELECT id FROM kyc.compliance_notes WHERE applicant_id = $1 ORDER BY created_at DESC LIMIT 1))
);

-- 4. If declined, insert rejection reasons (if applicable)
-- INSERT INTO kyc.rejection_reasons (applicant_id, reason) ...

-- 5. If approved, update user account tier
UPDATE auth.users
SET account_tier = $3
WHERE id = (SELECT user_id FROM kyc.applicants WHERE id = $1)
  AND $2 = 'approved';
```

**Data Source:** **NestJS API** → PostgreSQL (Transaction)

---

**Endpoint 5:** `GET /api/kyc/providers/:provider/iframe-token?applicantId=:applicantId`

**Purpose:** Generate short-lived session token for embedded provider iframe

**Response:**
```json
{
  "iframeUrl": "https://api.sumsub.com/resources/applicants/SUMSUB-A7K3D9F2H/review?token=eyJhbGc...",
  "expiresAt": "2026-02-21T15:45:00Z",
  "expiresIn": 900  // 15 minutes
}
```

**Implementation:**
```typescript
// NestJS Service
async generateProviderIframeToken(provider: string, applicantId: string, userId: string) {
  // Generate provider-specific token
  switch (provider) {
    case 'sumsub':
      return await this.sumsubService.generateApplicantReviewToken(applicantId, {
        expiresIn: 900,
        scope: 'review',
        userId: userId
      });
    case 'onfido':
      return await this.onfidoService.generateSDKToken(applicantId);
    case 'persona':
      return await this.personaService.generateInquirySessionToken(applicantId);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

**Data Source:** **NestJS API** → External Provider API (SumSub, Onfido, Persona)

---

### Provider Webhook Integration

#### **Webhook Endpoint:** `POST /api/kyc/webhooks/:provider`

Receives real-time updates from KYC providers when applicant status changes.

**SumSub Webhook Payload Example:**
```json
{
  "applicantId": "SUMSUB-A7K3D9F2H",
  "inspectionId": "...",
  "reviewStatus": "completed",
  "reviewResult": {
    "reviewAnswer": "GREEN",  // GREEN, RED, YELLOW
    "moderationComment": "All checks passed",
    "clientComment": "",
    "rejectLabels": [],
    "reviewRejectType": null
  },
  "externalUserId": "uuid"  // Our internal user ID
}
```

**Webhook Handler Logic:**
```typescript
@Post('/kyc/webhooks/sumsub')
async handleSumsubWebhook(@Body() payload: SumsubWebhookDto) {
  // Verify webhook signature
  const isValid = await this.sumsubService.verifySignature(payload);
  if (!isValid) throw new UnauthorizedException();

  // Map provider status to our status
  const status = this.mapSumsubStatus(payload.reviewResult.reviewAnswer);

  // Update applicant
  await this.db.query(`
    UPDATE kyc.applicants
    SET
      status = $1,
      risk_score = $2,
      face_match_score = $3,
      document_authenticity_score = $4,
      watchlist_hit = $5,
      updated_at = NOW()
    WHERE provider_applicant_id = $6
  `, [
    status,
    payload.reviewResult.riskScore,
    payload.reviewResult.faceMatchScore,
    payload.reviewResult.documentScore,
    payload.reviewResult.watchlistHit,
    payload.applicantId
  ]);

  // Record event
  await this.db.query(`
    INSERT INTO kyc.verification_history (applicant_id, event, timestamp, metadata)
    VALUES (
      (SELECT id FROM kyc.applicants WHERE provider_applicant_id = $1),
      'provider_update',
      NOW(),
      $2::jsonb
    )
  `, [payload.applicantId, JSON.stringify(payload)]);

  return { success: true };
}
```

---

### Database Schema Requirements

#### **New Schema: `kyc`**

**1. `kyc.applicants` table**

```sql
CREATE TABLE kyc.applicants (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'KYC-' || LPAD(nextval('kyc.applicant_id_seq')::TEXT, 4, '0'),
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- Provider Integration
    provider VARCHAR(50) NOT NULL,  -- 'sumsub', 'onfido', 'persona'
    provider_applicant_id VARCHAR(255) NOT NULL,  -- External reference

    -- Status & Tier
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'review', 'declined', 'expiring', 're-verify'
    account_tier VARCHAR(50),  -- 'Standard', 'Enhanced', 'Accredited'

    -- Geographic Data
    country_code VARCHAR(2) NOT NULL,  -- ISO 3166-1 alpha-2

    -- Document Data
    document_type VARCHAR(100),  -- 'Passport', 'National ID', etc.
    document_number VARCHAR(255),  -- Encrypted
    document_expires_at TIMESTAMPTZ,

    -- Verification Scores
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    face_match_score INTEGER CHECK (face_match_score BETWEEN 0 AND 100),
    document_authenticity_score INTEGER CHECK (document_authenticity_score BETWEEN 0 AND 100),
    watchlist_hit BOOLEAN DEFAULT false,

    -- Review Tracking
    reviewed_by_user_id UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,

    -- Timestamps
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Constraints
    UNIQUE(user_id),  -- One active KYC per user
    UNIQUE(provider, provider_applicant_id)
);

CREATE SEQUENCE kyc.applicant_id_seq START 1001;

CREATE INDEX idx_applicants_status ON kyc.applicants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_applicants_provider ON kyc.applicants(provider);
CREATE INDEX idx_applicants_country ON kyc.applicants(country_code);
CREATE INDEX idx_applicants_user ON kyc.applicants(user_id);
CREATE INDEX idx_applicants_expiring ON kyc.applicants(document_expires_at)
  WHERE status = 'approved' AND document_expires_at IS NOT NULL;

COMMENT ON TABLE kyc.applicants IS 'KYC verification submissions and status';
```

**2. `kyc.compliance_notes` table**

```sql
CREATE TABLE kyc.compliance_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id VARCHAR(20) NOT NULL REFERENCES kyc.applicants(id),
    action VARCHAR(50) NOT NULL,  -- 'approved', 'declined', 're-verify'
    note TEXT NOT NULL,  -- Mandatory compliance rationale
    created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Notes cannot be deleted (audit trail)
    CONSTRAINT note_not_empty CHECK (LENGTH(TRIM(note)) > 0)
);

CREATE INDEX idx_compliance_notes_applicant ON kyc.compliance_notes(applicant_id);
CREATE INDEX idx_compliance_notes_created_at ON kyc.compliance_notes(created_at DESC);

COMMENT ON TABLE kyc.compliance_notes IS 'Immutable audit trail of manual KYC decisions';
```

**3. `kyc.verification_history` table**

```sql
CREATE TABLE kyc.verification_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id VARCHAR(20) NOT NULL REFERENCES kyc.applicants(id),
    event VARCHAR(100) NOT NULL,  -- 'submitted', 'face_match_completed', 'approved', etc.
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider VARCHAR(50),
    score INTEGER,  -- Optional score if event is score-related
    actioned_by_user_id UUID REFERENCES auth.users(id),
    metadata JSONB,  -- Additional event data

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verification_history_applicant ON kyc.verification_history(applicant_id, timestamp DESC);
CREATE INDEX idx_verification_history_event ON kyc.verification_history(event);

COMMENT ON TABLE kyc.verification_history IS 'Timeline of all verification events per applicant';
```

**4. `kyc.rejection_reasons` table**

```sql
CREATE TABLE kyc.rejection_reasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id VARCHAR(20) NOT NULL REFERENCES kyc.applicants(id),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rejection_reasons_applicant ON kyc.rejection_reasons(applicant_id);

COMMENT ON TABLE kyc.rejection_reasons IS 'Multi-valued rejection reasons for declined applicants';
```

**5. `kyc.region_config` table**

```sql
CREATE TABLE kyc.region_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,  -- "East Africa", "European Union", etc.
    countries VARCHAR(2)[] NOT NULL,  -- Array of ISO country codes

    -- Configuration
    requires_enhanced_dd BOOLEAN DEFAULT false,  -- Enhanced due diligence
    risk_tier VARCHAR(50) DEFAULT 'standard',  -- 'low', 'standard', 'high'

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_region_config_countries ON kyc.region_config USING GIN(countries);

-- Seed data
INSERT INTO kyc.region_config (name, countries) VALUES
  ('East Africa', ARRAY['UG', 'KE', 'TZ', 'RW', 'ET']),
  ('Southern Africa', ARRAY['ZA', 'ZM', 'ZW', 'BW', 'MZ']),
  ('West Africa', ARRAY['NG', 'GH', 'SN', 'CI']),
  ('European Union', ARRAY['DE', 'FR', 'NL', 'ES', 'IT', 'SE', 'PL']),
  ('United States', ARRAY['US']),
  ('Rest of World', ARRAY['*']);

COMMENT ON TABLE kyc.region_config IS 'Regional KYC configuration and risk tiers';
```

**6. `kyc.provider_config` table**

```sql
CREATE TABLE kyc.provider_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL UNIQUE,  -- 'sumsub', 'onfido', 'persona'

    -- API Configuration (encrypted)
    api_key_encrypted TEXT NOT NULL,
    api_secret_encrypted TEXT,
    webhook_secret_encrypted TEXT NOT NULL,

    -- Settings
    base_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_sandbox BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_config_active ON kyc.provider_config(is_active);

-- Seed data
INSERT INTO kyc.provider_config (provider, api_key_encrypted, webhook_secret_encrypted, base_url, is_sandbox) VALUES
  ('sumsub', 'encrypted_key', 'encrypted_secret', 'https://api.sumsub.com', false),
  ('onfido', 'encrypted_key', 'encrypted_secret', 'https://api.onfido.com', false),
  ('persona', 'encrypted_key', 'encrypted_secret', 'https://withpersona.com/api', false);

COMMENT ON TABLE kyc.provider_config IS 'KYC provider API credentials and configuration';
```

**7. Update `auth.users` table**

```sql
ALTER TABLE auth.users
ADD COLUMN account_tier VARCHAR(50) DEFAULT 'Standard',
ADD COLUMN kyc_status VARCHAR(50) DEFAULT 'not_submitted';  -- 'not_submitted', 'pending', 'approved', 'declined'

CREATE INDEX idx_users_kyc_status ON auth.users(kyc_status);
```

---

### Multi-Exchange Context

#### **NOT APPLICABLE - User-Level Data**

KYC verification is **user-centric**, not exchange-specific:
- A user completes KYC once for the Stella platform
- Once verified, they can trade on **all connected exchanges**
- Exchange-specific restrictions (e.g., US users cannot trade on Binance) are enforced separately

**No exchange field needed** in KYC tables.

---

### Summary: KYC Applicants Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|----------------------|
| **Status KPIs** | NestJS API | HTTP REST | On page load | User-level data (not exchange-specific) |
| **Applicant List** | NestJS API | HTTP REST | On page load | User-level data |
| **Applicant Detail** | NestJS API | HTTP REST | On click | Includes full verification history |
| **Provider Iframe** | External API | HTTP REST | On demand | Short-lived token (15 min expiry) |
| **Status Updates** | Provider Webhook | HTTP POST | Real-time | Webhook from SumSub/Onfido/Persona |
| **Compliance Actions** | NestJS API | HTTP POST | On action | Mandatory note + audit trail |

**Schema Changes Required:**
1. ✅ Create `kyc` schema with 6 tables
2. ✅ Add indexes for filtering and sorting
3. ✅ Implement webhook handlers for provider updates
4. ✅ Enforce compliance note requirement for manual decisions
5. ✅ Add `account_tier` and `kyc_status` to `auth.users`

**No Real-Time WebSocket Required** - Status updates via provider webhooks, UI polls on page load

---

**[← Previous: KYC Review](./18-kyc-review.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: KYC Regions →](./20-kyc-regions.md)**
