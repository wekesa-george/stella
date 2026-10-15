# KYC Review Section - Complete Data Source Analysis

**Document Version:** 1.0
**Last Updated:** February 21, 2026
**Analysis Scope:** KYC Review Section (5 pages)
**Methodology:** Following ANALYSIS_STRATEGY.md and MULTI_EXCHANGE_ASSESSMENT_REPORT.md

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Page 18: /kyc-review (Dashboard - Redirect)](#page-18-kyc-review)
3. [Page 19: /kyc-review/applicants](#page-19-kyc-reviewapplicants)
4. [Page 20: /kyc-review/regions](#page-20-kyc-reviewregions)
5. [Page 21: /kyc-review/audit](#page-21-kyc-reviewaudit)
6. [Page 22: /kyc-review/providers](#page-22-kyc-reviewproviders)
7. [Comprehensive Database Schema Requirements](#comprehensive-database-schema-requirements)
8. [API Endpoints Summary](#api-endpoints-summary)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Cross-Page Data Flow](#cross-page-data-flow)

---

## Executive Summary

The KYC Review Section consists of 5 pages designed for compliance officers and platform admins to manage Know-Your-Customer verification workflows. This section integrates with third-party KYC providers (SumSub, Onfido, Persona) and requires a sophisticated backend architecture to handle:

- **Multi-provider KYC management** with region-based routing
- **Compliance workflow automation** with manual override capabilities
- **Immutable audit logging** for regulatory compliance
- **Credential management** for API keys with encryption at rest
- **Real-time status updates** via webhooks from KYC providers

**Backend Responsibility Split:**
- **NestJS:** CRUD operations, historical queries, compliance decision logging
- **Phoenix:** Real-time webhook handling, provider health monitoring, live status updates

**Database Tables Required:**
- `auth.kyc_applicants` - KYC submission records
- `compliance.kyc_decisions` - Manual approval/rejection decisions with compliance notes
- `compliance.audit_log` - Immutable audit trail
- `admin.kyc_providers` - Provider credentials and configuration
- `admin.kyc_regions` - Region-to-provider routing rules
- `admin.kyc_provider_webhooks` - Webhook event logs
- `admin.kyc_workflows` - Provider-specific workflow configurations

**Critical Compliance Requirements:**
- 7-year audit log retention
- Encrypted credential storage
- Compliance officer notes mandatory for manual decisions
- Provider iframe session tokens (15-minute expiry)
- Regional data residency considerations

---

## Page 18: /kyc-review

### UI Features

This page is a **redirect only** - it automatically redirects to `/kyc-review/applicants`.

```typescript
// page.tsx (kyc-review/page.tsx:1-5)
export default function KYCReviewPage() {
  redirect("/kyc-review/applicants");
}
```

**No data requirements** - pure navigation logic.

---

## Page 19: /kyc-review/applicants

### UI Mock Data Structure

```typescript
interface Applicant {
  // Identity
  id: string;                  // "KYC-1001"
  name: string;                // "Amara Nwosu"
  email: string;               // "amara@example.com"

  // Location
  country: string;             // "UG" (2-letter country code)
  region: string;              // "East Africa"

  // Provider data
  provider: string;            // "sumsub" | "onfido" | "persona"
  applicantId: string;         // Provider's internal ID "SUMSUB-A7X9F2G4K"

  // Verification status
  status: string;              // "approved" | "pending" | "review" | "declined" | "expiring" | "re-verify"
  riskScore: number;           // 0-100 (composite score)
  faceMatch: number;           // 0-100% (liveness check)
  docAuth: number;             // 0-100% (document authenticity)
  watchlistHit: boolean;       // AML/sanctions watchlist match

  // Document details
  docType: string;             // "Passport" | "National ID" | "Driver's Licence" | "Residence Permit"
  tier: string;                // "Standard" | "Enhanced" | "Accredited"

  // Timestamps
  submittedAt: string;         // "21 Feb 2026"
  updatedAt: string;           // "20 Feb 2026"
  expiresAt: string;           // Document expiry date

  // Decision data (if declined)
  rejectionReasons: string[];  // ["Document expired", "Face match below threshold"]
  notes: string[];             // Compliance officer notes (from modal)
}
```

### UI Features & Requirements

1. **KPI Cards (6 status badges)** - Count of applicants per status
2. **Work Queue Highlight** - Banner for applicants in "review" status
3. **Search & Filters** - By name, email, KYC ID, status, provider, region
4. **Applicant Table** - Paginated list with 12 columns
5. **Applicant Detail Modal** - Two tabs: "KYC Data" and "Documents (Provider)"
6. **Compliance Actions** - Approve, Decline, Trigger Re-Verify (with mandatory notes)
7. **Provider Document Iframe** - Embedded provider UI for document review

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **id** | PostgreSQL | `auth.kyc_applicants.id` | Static | Auto-generated UUID |
| **name** | PostgreSQL | `auth.kyc_applicants.full_name` | Static | From user submission |
| **email** | PostgreSQL | `auth.users.email` (FK via user_id) | Static | ✅ EXISTS |
| **country** | PostgreSQL | `auth.kyc_applicants.country_code` | Static | ISO 3166-1 alpha-2 |
| **region** | Calculated | Derived from `admin.kyc_regions.countries` match | Static | Lookup function |
| **provider** | PostgreSQL | `auth.kyc_applicants.provider_code` | Static | ✅ EXISTS |
| **applicantId** | PostgreSQL | `auth.kyc_applicants.provider_applicant_id` | Static | Provider's ID |
| **status** | PostgreSQL | `auth.kyc_applicants.status` | Real-time (webhook) | Enum field |
| **riskScore** | PostgreSQL | `auth.kyc_applicants.risk_score` | Real-time (webhook) | 0-100 int |
| **faceMatch** | PostgreSQL | `auth.kyc_applicants.face_match_score` | Real-time (webhook) | 0-100 int |
| **docAuth** | PostgreSQL | `auth.kyc_applicants.document_authenticity_score` | Real-time (webhook) | 0-100 int |
| **watchlistHit** | PostgreSQL | `auth.kyc_applicants.watchlist_match` | Real-time (webhook) | Boolean |
| **docType** | PostgreSQL | `auth.kyc_applicants.document_type` | Static | User-submitted |
| **tier** | PostgreSQL | `auth.users.account_tier` | Static | ❌ MISSING in auth schema |
| **submittedAt** | PostgreSQL | `auth.kyc_applicants.submitted_at` | Static | Timestamp |
| **updatedAt** | PostgreSQL | `auth.kyc_applicants.updated_at` | On webhook | Timestamp |
| **expiresAt** | PostgreSQL | `auth.kyc_applicants.document_expiry_date` | Static | Date field |
| **rejectionReasons** | PostgreSQL | `compliance.kyc_decisions.rejection_reasons` (JSONB array) | On decision | ❌ NEW TABLE |
| **notes** | PostgreSQL | `compliance.kyc_decisions.compliance_note` | On decision | ❌ NEW TABLE |

---

### Phoenix Channel: `KycApplicantChannel`

**Topic Pattern:** `kyc:applicants:user:{compliance_officer_id}`

#### WebSocket Event Schemas

**1. Initial Join Response**

```typescript
// Client joins channel
socket.channel("kyc:applicants:user:123", {}).join();

// Server response payload
interface JoinResponse {
  applicants: Applicant[];  // Initial applicant list
  total: number;
  filters: {
    statuses: string[];
    providers: string[];
    regions: string[];
  };
}
```

**2. Applicant Status Update (from Provider Webhook)**

```typescript
// Server → Client (event-driven, on provider webhook)
interface ApplicantStatusUpdate {
  applicant_id: string;       // "KYC-1001"
  provider_applicant_id: string;
  status: "approved" | "pending" | "review" | "declined";
  risk_score: number;
  face_match: number;
  doc_auth: number;
  watchlist_hit: boolean;
  updated_at: string;         // ISO 8601
  provider_data: object;      // Raw provider payload (for debugging)
}
```

**Example:**
```json
{
  "applicant_id": "KYC-1003",
  "provider_applicant_id": "SUMSUB-A7X9F2G4K",
  "status": "review",
  "risk_score": 65,
  "face_match": 72,
  "doc_auth": 88,
  "watchlist_hit": true,
  "updated_at": "2026-02-21T10:30:00Z",
  "provider_data": { /* Raw SumSub webhook payload */ }
}
```

**3. Compliance Decision Made**

```typescript
// Server → Client (when another officer makes a decision)
interface ComplianceDecisionEvent {
  applicant_id: string;
  new_status: "approved" | "declined" | "re-verify";
  decided_by: string;         // Email of deciding officer
  compliance_note: string;    // Redacted for privacy
  decided_at: string;
}
```

---

### NestJS REST API Endpoints

#### **1. List Applicants (with filters)**

**Endpoint:** `GET /api/kyc/applicants`

**Query Parameters:**
```typescript
interface QueryParams {
  status?: "all" | "approved" | "pending" | "review" | "declined" | "expiring" | "re-verify";
  provider?: "all" | "sumsub" | "onfido" | "persona";
  region?: "all" | string;  // Region name
  search?: string;          // Search name/email/ID
  page?: number;            // Pagination (default: 1)
  limit?: number;           // Results per page (default: 50)
}
```

**Response:**
```json
{
  "applicants": [
    {
      "id": "uuid",
      "kyc_id": "KYC-1001",
      "name": "Amara Nwosu",
      "email": "amara@example.com",
      "country": "UG",
      "region": "East Africa",
      "provider": "sumsub",
      "applicant_id": "SUMSUB-A7X9F2G4K",
      "status": "review",
      "risk_score": 65,
      "face_match": 72,
      "doc_auth": 88,
      "watchlist_hit": true,
      "doc_type": "Passport",
      "tier": "Standard",
      "submitted_at": "2026-01-15T10:00:00Z",
      "updated_at": "2026-02-20T14:30:00Z",
      "expires_at": "2028-06-30",
      "rejection_reasons": null
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "total_pages": 3
  },
  "status_counts": {
    "approved": 85,
    "pending": 20,
    "review": 12,
    "declined": 8,
    "expiring": 3,
    "re-verify": 2
  }
}
```

**PostgreSQL Query:**
```sql
-- Status counts subquery
WITH status_counts AS (
  SELECT
    status,
    COUNT(*) as count
  FROM auth.kyc_applicants
  GROUP BY status
)

-- Main query
SELECT
  ka.id,
  'KYC-' || LPAD(ROW_NUMBER() OVER (ORDER BY ka.created_at)::TEXT, 4, '0') as kyc_id,
  ka.full_name as name,
  u.email,
  ka.country_code as country,
  get_region_for_country(ka.country_code) as region,  -- Helper function
  ka.provider_code as provider,
  ka.provider_applicant_id as applicant_id,
  ka.status,
  ka.risk_score,
  ka.face_match_score as face_match,
  ka.document_authenticity_score as doc_auth,
  ka.watchlist_match as watchlist_hit,
  ka.document_type as doc_type,
  u.account_tier as tier,
  ka.submitted_at,
  ka.updated_at,
  ka.document_expiry_date as expires_at,
  kd.rejection_reasons
FROM auth.kyc_applicants ka
JOIN auth.users u ON ka.user_id = u.id
LEFT JOIN compliance.kyc_decisions kd ON ka.id = kd.applicant_id
WHERE
  ($1::text IS NULL OR ka.status = $1)                   -- Status filter
  AND ($2::text IS NULL OR ka.provider_code = $2)        -- Provider filter
  AND ($3::text IS NULL OR get_region_for_country(ka.country_code) = $3)  -- Region filter
  AND (
    $4::text IS NULL OR
    ka.full_name ILIKE '%' || $4 || '%' OR
    u.email ILIKE '%' || $4 || '%' OR
    ('KYC-' || LPAD(ROW_NUMBER() OVER (ORDER BY ka.created_at)::TEXT, 4, '0')) ILIKE '%' || $4 || '%'
  )
ORDER BY ka.updated_at DESC NULLS LAST
LIMIT $5 OFFSET $6;
```

**Data Source:** **NestJS API** → PostgreSQL

---

#### **2. Get Applicant Detail**

**Endpoint:** `GET /api/kyc/applicants/:id`

**Response:**
```json
{
  "applicant": {
    "id": "uuid",
    "kyc_id": "KYC-1003",
    "name": "Amara Nwosu",
    "email": "amara@example.com",
    "country": "UG",
    "region": "East Africa",
    "provider": {
      "code": "sumsub",
      "name": "SumSub",
      "applicant_id": "SUMSUB-A7X9F2G4K"
    },
    "status": "review",
    "risk_score": 65,
    "face_match": 72,
    "doc_auth": 88,
    "watchlist_hit": true,
    "doc_type": "Passport",
    "tier": "Standard",
    "submitted_at": "2026-01-15T10:00:00Z",
    "updated_at": "2026-02-20T14:30:00Z",
    "expires_at": "2028-06-30",
    "risk_flags": [
      {
        "type": "watchlist",
        "severity": "critical",
        "message": "Watchlist match detected — requires manual review"
      },
      {
        "type": "face_match",
        "severity": "warning",
        "message": "Face match confidence: 72%"
      }
    ],
    "decision_history": [
      {
        "decided_at": "2026-02-20T14:30:00Z",
        "decided_by": "admin@stella.io",
        "action": "flagged_for_review",
        "note": "Watchlist match requires investigation"
      }
    ]
  }
}
```

**Data Source:** **NestJS API** → PostgreSQL

---

#### **3. Submit Compliance Decision**

**Endpoint:** `POST /api/kyc/applicants/:id/decision`

**Request Body:**
```json
{
  "action": "approve" | "decline" | "re-verify",
  "compliance_note": "Verified document authenticity via manual check. Applicant cleared for trading.",
  "rejection_reasons": ["Document expired", "Face match below threshold"]  // Only if action=decline
}
```

**Response:**
```json
{
  "applicant": {
    "id": "uuid",
    "status": "approved",
    "updated_at": "2026-02-21T10:45:00Z"
  },
  "decision": {
    "id": "uuid",
    "action": "approve",
    "decided_by": "admin@stella.io",
    "decided_at": "2026-02-21T10:45:00Z"
  }
}
```

**Side Effects:**
1. Insert record into `compliance.kyc_decisions`
2. Update `auth.kyc_applicants.status`
3. Create audit log entry in `compliance.audit_log`
4. Broadcast update via Phoenix PubSub → `kyc:applicants:*` channel
5. Send email notification to applicant (via background job)
6. If `re-verify`, trigger new workflow with provider API

**PostgreSQL Transaction:**
```sql
BEGIN;

-- Insert compliance decision
INSERT INTO compliance.kyc_decisions (
  applicant_id,
  decided_by_user_id,
  action,
  compliance_note,
  rejection_reasons,
  decided_at
) VALUES (
  $1,  -- applicant_id
  $2,  -- current_user_id
  $3,  -- action
  $4,  -- compliance_note
  $5,  -- rejection_reasons (JSONB)
  NOW()
) RETURNING id, decided_at;

-- Update applicant status
UPDATE auth.kyc_applicants
SET
  status = CASE
    WHEN $3 = 'approve' THEN 'approved'
    WHEN $3 = 'decline' THEN 'declined'
    WHEN $3 = 're-verify' THEN 're-verify'
  END,
  updated_at = NOW()
WHERE id = $1
RETURNING *;

-- Create immutable audit log
INSERT INTO compliance.audit_log (
  event_type,
  actor_user_id,
  target_entity_type,
  target_entity_id,
  event_data,
  ip_address,
  user_agent,
  created_at
) VALUES (
  'kyc_decision',
  $2,  -- current_user_id
  'kyc_applicant',
  $1,  -- applicant_id
  jsonb_build_object(
    'action', $3,
    'note', $4,
    'rejection_reasons', $5
  ),
  $6,  -- ip_address from request
  $7,  -- user_agent from request
  NOW()
);

COMMIT;
```

**Data Source:** **NestJS API** → PostgreSQL + Phoenix PubSub broadcast

---

#### **4. Get Provider Session Token (for iframe)**

**Endpoint:** `POST /api/kyc/applicants/:id/provider-session`

**Purpose:** Generate short-lived session token for embedding provider's document review UI in iframe

**Request Body:**
```json
{
  "provider": "sumsub",
  "applicant_id": "SUMSUB-A7X9F2G4K"
}
```

**Response:**
```json
{
  "session_token": "REDACTED",
  "iframe_url": "https://api.sumsub.com/resources/applicants/SUMSUB-A7X9F2G4K?token=...",
  "expires_at": "2026-02-21T11:00:00Z"  // 15 minutes from now
}
```

**Implementation:**
```typescript
// NestJS Service
async generateProviderSessionToken(applicant_id: string, provider: string) {
  // Load provider credentials
  const providerConfig = await this.providerService.getConfig(provider);

  // Call provider API to generate session token
  const response = await axios.post(
    `${providerConfig.api_url}/auth/session`,
    {
      applicant_id: applicant_id,
      scope: ['documents:read', 'verification:read'],
      expires_in: 900  // 15 minutes
    },
    {
      headers: {
        'Authorization': `Bearer ${decrypt(providerConfig.api_secret)}`,
        'X-App-Token': decrypt(providerConfig.app_token)
      }
    }
  );

  // Log token generation in audit log
  await this.auditService.log({
    event_type: 'provider_session_created',
    actor_user_id: currentUser.id,
    target_entity_type: 'kyc_applicant',
    target_entity_id: applicant_id,
    event_data: {
      provider: provider,
      token_expires_at: new Date(Date.now() + 900000)
    }
  });

  return {
    session_token: response.data.token,
    iframe_url: `${providerConfig.iframe_url}?token=${response.data.token}`,
    expires_at: new Date(Date.now() + 900000).toISOString()
  };
}
```

**Data Source:** **NestJS API** → External Provider API + Audit Log

---

### Database Schema Requirements

#### **New Table: `compliance.kyc_decisions`**

```sql
CREATE SCHEMA IF NOT EXISTS compliance;

CREATE TABLE compliance.kyc_decisions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  applicant_id        UUID NOT NULL REFERENCES auth.kyc_applicants(id) ON DELETE CASCADE,
  decided_by_user_id  UUID NOT NULL REFERENCES auth.users(id),
  action              VARCHAR(50) NOT NULL CHECK (action IN ('approve', 'decline', 're-verify', 'flag_for_review')),
  compliance_note     TEXT NOT NULL,  -- Mandatory for manual decisions
  rejection_reasons   JSONB,          -- Array of strings, only for action=decline
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit trail (immutable)
  CONSTRAINT kyc_decision_note_required CHECK (LENGTH(compliance_note) >= 10)
);

CREATE INDEX idx_kyc_decisions_applicant ON compliance.kyc_decisions(applicant_id);
CREATE INDEX idx_kyc_decisions_decided_at ON compliance.kyc_decisions(decided_at DESC);
CREATE INDEX idx_kyc_decisions_decided_by ON compliance.kyc_decisions(decided_by_user_id);
```

---

#### **Update Table: `auth.kyc_applicants`**

```sql
-- Add missing fields to existing kyc_records table or create new table
ALTER TABLE auth.kyc_records
ADD COLUMN IF NOT EXISTS provider_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS provider_applicant_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'review', 'declined', 'expiring', 're-verify')),
ADD COLUMN IF NOT EXISTS risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS face_match_score INTEGER CHECK (face_match_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS document_authenticity_score INTEGER CHECK (document_authenticity_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS watchlist_match BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS document_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS document_expiry_date DATE,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS country_code CHAR(2);  -- ISO 3166-1 alpha-2

-- OR rename table (if creating from scratch)
-- CREATE TABLE auth.kyc_applicants AS SELECT * FROM auth.kyc_records;
```

---

#### **Update Table: `auth.users`**

```sql
ALTER TABLE auth.users
ADD COLUMN IF NOT EXISTS account_tier VARCHAR(50) DEFAULT 'Standard' CHECK (account_tier IN ('Standard', 'Enhanced', 'Accredited'));
```

---

### Phoenix GenServer: `KycWebhookHandler`

**Purpose:** Handle incoming webhooks from KYC providers in real-time

```elixir
defmodule TradeEngine.Kyc.WebhookHandler do
  @moduledoc """
  Handles incoming webhooks from KYC providers (SumSub, Onfido, Persona).

  Responsibilities:
  - Validate webhook signatures
  - Parse provider-specific payloads
  - Update applicant status in database
  - Broadcast updates via PubSub to UI
  - Trigger re-verification workflows if needed
  """

  use GenServer
  require Logger

  alias TradeEngine.Repo
  alias TradeEngine.Auth.KycApplicant
  alias TradeEngine.Admin.KycProvider

  # Public API

  def handle_webhook(provider_code, payload, signature) do
    GenServer.call(__MODULE__, {:webhook, provider_code, payload, signature})
  end

  # Server Callbacks

  @impl true
  def init(_) do
    {:ok, %{}}
  end

  @impl true
  def handle_call({:webhook, provider_code, payload, signature}, _from, state) do
    # Load provider config
    provider = Repo.get_by!(KycProvider, code: provider_code)

    # Validate webhook signature
    case validate_signature(provider, payload, signature) do
      :ok ->
        # Parse provider-specific payload
        parsed = parse_provider_payload(provider_code, payload)

        # Update applicant in database
        applicant = Repo.get_by!(KycApplicant, provider_applicant_id: parsed.applicant_id)

        changeset = KycApplicant.changeset(applicant, %{
          status: map_provider_status(provider_code, parsed.status),
          risk_score: parsed.risk_score,
          face_match_score: parsed.face_match,
          document_authenticity_score: parsed.doc_auth,
          watchlist_match: parsed.watchlist_hit,
          updated_at: DateTime.utc_now()
        })

        {:ok, updated_applicant} = Repo.update(changeset)

        # Log webhook event
        log_webhook_event(provider_code, parsed.applicant_id, payload)

        # Broadcast to WebSocket clients
        Phoenix.PubSub.broadcast(
          TradeEngine.PubSub,
          "kyc:applicants:all",
          {:applicant_status_update, serialize_applicant_update(updated_applicant, parsed)}
        )

        Logger.info("KYC webhook processed: #{provider_code} - #{parsed.applicant_id} - #{parsed.status}")

        {:reply, {:ok, %{status: "processed"}}, state}

      {:error, reason} ->
        Logger.error("Invalid webhook signature from #{provider_code}: #{inspect(reason)}")
        {:reply, {:error, "Invalid signature"}, state}
    end
  end

  # Private Helpers

  defp validate_signature(provider, payload, signature) do
    # Provider-specific signature validation
    case provider.code do
      "sumsub" ->
        validate_sumsub_signature(provider.webhook_secret, payload, signature)
      "onfido" ->
        validate_onfido_signature(provider.webhook_secret, payload, signature)
      "persona" ->
        validate_persona_signature(provider.webhook_secret, payload, signature)
    end
  end

  defp validate_sumsub_signature(secret, payload, signature) do
    expected = :crypto.mac(:hmac, :sha256, secret, payload) |> Base.encode16(case: :lower)
    if expected == signature, do: :ok, else: {:error, :invalid_signature}
  end

  defp parse_provider_payload("sumsub", payload) do
    data = Jason.decode!(payload)
    %{
      applicant_id: data["applicantId"],
      status: data["reviewResult"]["reviewAnswer"],
      risk_score: calculate_risk_score(data["reviewResult"]),
      face_match: data["reviewResult"]["moderationComment"]["faceMatch"],
      doc_auth: data["reviewResult"]["moderationComment"]["docAuth"],
      watchlist_hit: Enum.any?(data["checks"] || [], &(&1["answer"] == "WATCHLIST_MATCH"))
    }
  end

  defp map_provider_status("sumsub", "GREEN"), do: "approved"
  defp map_provider_status("sumsub", "RED"), do: "declined"
  defp map_provider_status("sumsub", "YELLOW"), do: "review"
  defp map_provider_status(_, _), do: "pending"

  defp serialize_applicant_update(applicant, parsed) do
    %{
      applicant_id: "KYC-" <> String.pad_leading(to_string(applicant.id), 4, "0"),
      provider_applicant_id: applicant.provider_applicant_id,
      status: applicant.status,
      risk_score: applicant.risk_score,
      face_match: applicant.face_match_score,
      doc_auth: applicant.document_authenticity_score,
      watchlist_hit: applicant.watchlist_match,
      updated_at: DateTime.to_iso8601(applicant.updated_at),
      provider_data: parsed  # For debugging
    }
  end
end
```

---

### Summary: /kyc-review/applicants

| Component | Data Source | Protocol | Frequency |
|-----------|-------------|----------|-----------|
| **Applicant List (initial)** | NestJS API | HTTP REST | On page load |
| **Status Counts** | NestJS API | HTTP REST | On page load |
| **Applicant Status Updates** | Phoenix Channel | WebSocket | Event-driven (webhooks) |
| **Compliance Decision** | NestJS API | HTTP POST | On button click |
| **Provider Iframe Session** | NestJS API | HTTP POST | On tab switch |
| **Search/Filters** | Client-side | N/A | Instant (no server call) |

**Schema Changes Required:**
1. ✅ Create `compliance.kyc_decisions` table
2. ✅ Add columns to `auth.kyc_records` (or create `auth.kyc_applicants`)
3. ✅ Add `account_tier` to `auth.users`
4. ✅ Create `admin.kyc_provider_webhooks` event log table

---

## Page 20: /kyc-review/regions

### UI Mock Data Structure

```typescript
interface RegionConfig {
  name: string;                // "East Africa"
  countries: string[];         // ["UG", "KE", "TZ", "RW", "ET"]
  provider: string;            // "sumsub"
  workflow: string;            // "standard-kyc"
  active: boolean;             // true
}

interface ReVerificationRule {
  trigger: string;             // "Document expiry"
  threshold: string;           // "30 days before"
  action: string;              // "Flag as expiring-soon, notify user"
  provider: string;            // "Same provider as original KYC"
}
```

### UI Features & Requirements

1. **KPI Cards (4 stats)** - Regions defined, countries covered, fallback provider, unmapped countries
2. **Region Routing Table** - Editable mapping of regions → providers + workflows
3. **Coverage Map Placeholder** - Visual world map showing provider coverage
4. **Re-Verification Rules** - Automated triggers for re-KYC workflows

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **name** | PostgreSQL | `admin.kyc_regions.name` | Static | User-defined |
| **countries** | PostgreSQL | `admin.kyc_regions.countries` (JSONB array) | Static | ISO codes |
| **provider** | PostgreSQL | `admin.kyc_regions.provider_code` FK | Static | References providers |
| **workflow** | PostgreSQL | `admin.kyc_regions.workflow_name` | Static | Provider-specific |
| **active** | PostgreSQL | `admin.kyc_regions.is_active` | Static | Boolean flag |
| **Re-verification rules** | PostgreSQL | `admin.kyc_reverification_rules` | Static | ❌ NEW TABLE |

---

### NestJS REST API Endpoints

#### **1. List Regions**

**Endpoint:** `GET /api/kyc/regions`

**Response:**
```json
{
  "regions": [
    {
      "id": "uuid",
      "name": "East Africa",
      "countries": ["UG", "KE", "TZ", "RW", "ET"],
      "provider": {
        "code": "sumsub",
        "name": "SumSub"
      },
      "workflow": "standard-kyc",
      "is_active": true,
      "created_at": "2025-11-01T10:00:00Z",
      "updated_at": "2025-11-01T10:00:00Z"
    },
    {
      "id": "uuid",
      "name": "Rest of World",
      "countries": ["*"],  // Fallback
      "provider": {
        "code": "persona",
        "name": "Persona"
      },
      "workflow": "aml-enhanced",
      "is_active": true,
      "created_at": "2025-11-01T10:00:00Z",
      "updated_at": "2025-11-01T10:00:00Z"
    }
  ],
  "stats": {
    "total_regions": 6,
    "total_countries": 46,
    "unmapped_countries": 0
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  r.id,
  r.name,
  r.countries,
  r.provider_code,
  p.name as provider_name,
  r.workflow_name as workflow,
  r.is_active,
  r.created_at,
  r.updated_at
FROM admin.kyc_regions r
LEFT JOIN admin.kyc_providers p ON r.provider_code = p.code
ORDER BY
  CASE WHEN r.countries @> '["*"]' THEN 1 ELSE 0 END,  -- Fallback last
  r.created_at ASC;
```

**Data Source:** **NestJS API** → PostgreSQL

---

#### **2. Create Region**

**Endpoint:** `POST /api/kyc/regions`

**Request Body:**
```json
{
  "name": "West Africa",
  "countries": ["NG", "GH", "SN", "CI"],
  "provider_code": "sumsub",
  "workflow_name": "standard-kyc",
  "is_active": true
}
```

**Side Effects:**
1. Insert into `admin.kyc_regions`
2. Create audit log entry
3. Broadcast update via PubSub (if needed)

**Data Source:** **NestJS API** → PostgreSQL

---

#### **3. Update Region**

**Endpoint:** `PUT /api/kyc/regions/:id`

**Request Body:** Same as create

**Data Source:** **NestJS API** → PostgreSQL

---

#### **4. Get Re-Verification Rules**

**Endpoint:** `GET /api/kyc/reverification-rules`

**Response:**
```json
{
  "rules": [
    {
      "id": "uuid",
      "trigger": "document_expiry",
      "threshold_days": 30,
      "action": "flag_as_expiring",
      "notify_user": true,
      "provider_strategy": "same_as_original",
      "workflow_override": null,
      "is_active": true
    },
    {
      "id": "uuid",
      "trigger": "tier_upgrade",
      "threshold_config": {
        "from_tier": "Standard",
        "to_tier": "Enhanced"
      },
      "action": "trigger_enhanced_due_diligence",
      "provider_strategy": "original_region_provider",
      "workflow_override": "enhanced-due-diligence",
      "is_active": true
    }
  ]
}
```

**Data Source:** **NestJS API** → PostgreSQL

---

### Database Schema Requirements

#### **New Table: `admin.kyc_regions`**

```sql
CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE admin.kyc_regions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(255) NOT NULL UNIQUE,
  countries         JSONB NOT NULL,  -- Array of ISO 3166-1 alpha-2 codes, e.g. ["UG", "KE"] or ["*"]
  provider_code     VARCHAR(50) NOT NULL REFERENCES admin.kyc_providers(code),
  workflow_name     VARCHAR(255) NOT NULL,  -- Provider-specific workflow identifier
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validation
  CONSTRAINT valid_countries CHECK (jsonb_typeof(countries) = 'array')
);

CREATE INDEX idx_kyc_regions_provider ON admin.kyc_regions(provider_code);
CREATE INDEX idx_kyc_regions_countries ON admin.kyc_regions USING GIN (countries);

-- Helper function to get region for a country code
CREATE OR REPLACE FUNCTION get_region_for_country(country_code CHAR(2))
RETURNS TEXT AS $$
DECLARE
  region_name TEXT;
BEGIN
  -- Find explicit match
  SELECT name INTO region_name
  FROM admin.kyc_regions
  WHERE countries @> jsonb_build_array(country_code)
    AND is_active = TRUE
  LIMIT 1;

  -- Fallback to wildcard region
  IF region_name IS NULL THEN
    SELECT name INTO region_name
    FROM admin.kyc_regions
    WHERE countries @> '["*"]'
      AND is_active = TRUE
    LIMIT 1;
  END IF;

  RETURN COALESCE(region_name, 'Unknown');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

---

#### **New Table: `admin.kyc_reverification_rules`**

```sql
CREATE TABLE admin.kyc_reverification_rules (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger             VARCHAR(100) NOT NULL CHECK (trigger IN ('document_expiry', 'tier_upgrade', 'watchlist_match', 'periodic_refresh')),
  threshold_config    JSONB NOT NULL,  -- Flexible config for different triggers
  action              VARCHAR(100) NOT NULL,
  notify_user         BOOLEAN DEFAULT TRUE,
  provider_strategy   VARCHAR(100) NOT NULL DEFAULT 'same_as_original',  -- 'same_as_original', 'original_region_provider', 'specific_provider'
  workflow_override   VARCHAR(255),    -- Optional workflow override
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reverification_rules_trigger ON admin.kyc_reverification_rules(trigger);
```

**Example threshold_config values:**
```json
// Document expiry
{"days_before_expiry": 30}

// Tier upgrade
{"from_tier": "Standard", "to_tier": "Enhanced"}

// Watchlist match
{"severity": "high"}

// Periodic refresh
{"months_since_last_verification": 12}
```

---

### Phoenix GenServer: `KycReVerificationScheduler`

**Purpose:** Automated scheduled task to evaluate re-verification rules

```elixir
defmodule TradeEngine.Kyc.ReVerificationScheduler do
  @moduledoc """
  Background scheduler that evaluates re-verification rules.
  Runs daily to check for:
  - Expiring documents
  - Tier upgrade requests
  - Periodic refresh requirements
  """

  use GenServer
  require Logger

  alias TradeEngine.Repo
  alias TradeEngine.Auth.KycApplicant
  alias TradeEngine.Admin.ReVerificationRule

  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  @impl true
  def init(_) do
    # Schedule first run for midnight
    schedule_daily_check()
    {:ok, %{}}
  end

  @impl true
  def handle_info(:daily_check, state) do
    Logger.info("Running daily re-verification rule evaluation...")

    # Load active rules
    rules = Repo.all(from r in ReVerificationRule, where: r.is_active == true)

    Enum.each(rules, fn rule ->
      case rule.trigger do
        "document_expiry" ->
          check_document_expiry(rule)
        "tier_upgrade" ->
          check_tier_upgrades(rule)
        "periodic_refresh" ->
          check_periodic_refresh(rule)
        _ ->
          :ok
      end
    end)

    # Schedule next run
    schedule_daily_check()

    {:noreply, state}
  end

  defp check_document_expiry(rule) do
    threshold_days = rule.threshold_config["days_before_expiry"]
    expiry_date = Date.add(Date.utc_today(), threshold_days)

    # Find applicants with expiring documents
    expiring_applicants = Repo.all(
      from a in KycApplicant,
      where: a.status == "approved" and
             a.document_expiry_date <= ^expiry_date and
             a.document_expiry_date > ^Date.utc_today()
    )

    Enum.each(expiring_applicants, fn applicant ->
      # Update status to 'expiring'
      applicant
      |> KycApplicant.changeset(%{status: "expiring"})
      |> Repo.update()

      # Send notification (via background job)
      send_expiry_notification(applicant)

      # Broadcast update
      Phoenix.PubSub.broadcast(
        TradeEngine.PubSub,
        "kyc:applicants:all",
        {:applicant_status_update, %{applicant_id: applicant.id, status: "expiring"}}
      )
    end)

    Logger.info("Flagged #{length(expiring_applicants)} applicants with expiring documents")
  end

  defp schedule_daily_check do
    # Calculate time until next midnight UTC
    now = DateTime.utc_now()
    tomorrow_midnight = DateTime.new!(Date.add(now, 1), ~T[00:00:00])
    time_until_midnight = DateTime.diff(tomorrow_midnight, now, :millisecond)

    Process.send_after(self(), :daily_check, time_until_midnight)
  end
end
```

---

### Summary: /kyc-review/regions

| Component | Data Source | Protocol | Frequency |
|-----------|-------------|----------|-----------|
| **Region List** | NestJS API | HTTP REST | On page load |
| **Region Stats** | NestJS API | HTTP REST | On page load |
| **Create/Edit Region** | NestJS API | HTTP POST/PUT | On button click |
| **Re-Verification Rules** | NestJS API | HTTP REST | On page load |
| **Coverage Map** | Client-side | N/A | Static visualization |

**Schema Changes Required:**
1. ✅ Create `admin.kyc_regions` table
2. ✅ Create `admin.kyc_reverification_rules` table
3. ✅ Add helper function `get_region_for_country()`

---

## Page 21: /kyc-review/audit

### UI Mock Data Structure

```typescript
interface AuditEvent {
  type: string;                // "override" | "credential" | "region" | "provider"
  icon: string;                // Emoji icon
  iconBg: string;              // Background color for icon
  color: string;               // Text color
  actor: string;               // "admin@stella.io" | "system"
  msg: string;                 // Human-readable message
  target: string;              // Target entity (KYC-1003, SumSub, etc.)
  time: string;                // "2 min ago"
}
```

### UI Features & Requirements

1. **Audit Log Table** - Immutable event stream
2. **Filter Buttons** - Filter by event type
3. **Export CSV** - Download audit log for compliance reporting

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **type** | PostgreSQL | `compliance.audit_log.event_type` | Append-only | Immutable |
| **actor** | PostgreSQL | `auth.users.email` (FK via actor_user_id) | Static | ✅ EXISTS |
| **msg** | Calculated | Generated from `event_type` + `event_data` | Static | Template-based |
| **target** | PostgreSQL | `compliance.audit_log.target_entity_id` + type | Static | Polymorphic reference |
| **time** | PostgreSQL | `compliance.audit_log.created_at` | Static | Immutable timestamp |

---

### NestJS REST API Endpoints

#### **1. List Audit Events**

**Endpoint:** `GET /api/kyc/audit`

**Query Parameters:**
```typescript
interface QueryParams {
  type?: "all" | "override" | "credential" | "region" | "provider";
  start_date?: string;  // ISO 8601
  end_date?: string;    // ISO 8601
  page?: number;
  limit?: number;       // Default 50
}
```

**Response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "event_type": "kyc_decision",
      "actor": "admin@stella.io",
      "message": "Manually approved applicant KYC-1003",
      "target_entity_type": "kyc_applicant",
      "target_entity_id": "uuid",
      "target_display": "KYC-1003",
      "event_data": {
        "action": "approve",
        "note": "Verified via manual check"
      },
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2026-02-21T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 250,
    "page": 1,
    "limit": 50
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  al.id,
  al.event_type,
  COALESCE(u.email, 'system') as actor,
  generate_audit_message(al.event_type, al.event_data, al.target_entity_type, al.target_entity_id) as message,
  al.target_entity_type,
  al.target_entity_id,
  get_entity_display_name(al.target_entity_type, al.target_entity_id) as target_display,
  al.event_data,
  al.ip_address,
  al.user_agent,
  al.created_at
FROM compliance.audit_log al
LEFT JOIN auth.users u ON al.actor_user_id = u.id
WHERE
  ($1::text IS NULL OR map_event_type_to_category(al.event_type) = $1)  -- Type filter
  AND ($2::timestamptz IS NULL OR al.created_at >= $2)  -- Start date
  AND ($3::timestamptz IS NULL OR al.created_at <= $3)  -- End date
ORDER BY al.created_at DESC
LIMIT $4 OFFSET $5;
```

**Helper Functions:**
```sql
-- Map event types to UI categories
CREATE OR REPLACE FUNCTION map_event_type_to_category(event_type TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN event_type IN ('kyc_decision', 'manual_approval', 'manual_decline', 're_verify_triggered') THEN 'override'
    WHEN event_type IN ('credential_created', 'credential_rotated', 'api_key_updated') THEN 'credential'
    WHEN event_type IN ('region_created', 'region_updated', 'region_routing_changed') THEN 'region'
    WHEN event_type IN ('provider_connected', 'provider_health_check', 'provider_degraded') THEN 'provider'
    ELSE 'other'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Generate human-readable message
CREATE OR REPLACE FUNCTION generate_audit_message(
  event_type TEXT,
  event_data JSONB,
  target_type TEXT,
  target_id UUID
)
RETURNS TEXT AS $$
DECLARE
  target_name TEXT;
BEGIN
  target_name := get_entity_display_name(target_type, target_id);

  RETURN CASE event_type
    WHEN 'kyc_decision' THEN
      CASE event_data->>'action'
        WHEN 'approve' THEN 'Manually approved applicant ' || target_name
        WHEN 'decline' THEN 'Manually declined applicant ' || target_name
        WHEN 're-verify' THEN 'Triggered re-verification for ' || target_name
        ELSE 'Made decision on ' || target_name
      END
    WHEN 'credential_rotated' THEN 'Rotated API key for provider ' || target_name
    WHEN 'region_created' THEN 'Added ' || target_name || ' region mapped to ' || (event_data->>'provider')
    WHEN 'provider_health_check' THEN 'Degraded health detected for provider ' || target_name
    ELSE event_type || ' on ' || target_name
  END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get display name for target entity
CREATE OR REPLACE FUNCTION get_entity_display_name(entity_type TEXT, entity_id UUID)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  CASE entity_type
    WHEN 'kyc_applicant' THEN
      SELECT 'KYC-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 4, '0')
      INTO result
      FROM auth.kyc_applicants
      WHERE id = entity_id;
    WHEN 'kyc_provider' THEN
      SELECT name INTO result FROM admin.kyc_providers WHERE id = entity_id;
    WHEN 'kyc_region' THEN
      SELECT name INTO result FROM admin.kyc_regions WHERE id = entity_id;
    ELSE
      result := entity_id::TEXT;
  END CASE;

  RETURN COALESCE(result, entity_id::TEXT);
END;
$$ LANGUAGE plpgsql STABLE;
```

**Data Source:** **NestJS API** → PostgreSQL

---

#### **2. Export Audit Log (CSV)**

**Endpoint:** `GET /api/kyc/audit/export`

**Query Parameters:** Same as list endpoint

**Response:** CSV file download

```csv
Timestamp,Event Type,Actor,Message,Target,IP Address
"2026-02-21T10:30:00Z","kyc_decision","admin@stella.io","Manually approved applicant KYC-1003","KYC-1003","192.168.1.1"
"2026-02-21T09:45:00Z","credential_rotated","ops@stella.io","Rotated API key for provider SumSub","SumSub","192.168.1.2"
```

**Implementation:**
```typescript
// NestJS Controller
@Get('audit/export')
async exportAuditLog(@Query() query: QueryParams, @Res() res: Response) {
  const events = await this.auditService.findAll(query);

  // Generate CSV
  const csv = this.generateCsv(events);

  // Set headers for download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="kyc-audit-${Date.now()}.csv"`);
  res.send(csv);
}
```

**Data Source:** **NestJS API** → PostgreSQL

---

### Database Schema Requirements

#### **Update Table: `compliance.audit_log`**

```sql
-- Create if doesn't exist
CREATE TABLE IF NOT EXISTS compliance.audit_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type          VARCHAR(100) NOT NULL,
  actor_user_id       UUID REFERENCES auth.users(id),  -- NULL for system events
  target_entity_type  VARCHAR(100) NOT NULL,
  target_entity_id    UUID NOT NULL,
  event_data          JSONB,
  ip_address          INET,
  user_agent          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Immutability constraint (7-year retention for compliance)
  CONSTRAINT audit_log_immutable CHECK (created_at >= NOW() - INTERVAL '7 years')
);

CREATE INDEX idx_audit_log_created_at ON compliance.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_actor ON compliance.audit_log(actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_log_event_type ON compliance.audit_log(event_type);
CREATE INDEX idx_audit_log_target ON compliance.audit_log(target_entity_type, target_entity_id);

-- Prevent updates and deletes (immutability)
CREATE RULE audit_log_no_update AS ON UPDATE TO compliance.audit_log
  DO INSTEAD NOTHING;

CREATE RULE audit_log_no_delete AS ON DELETE TO compliance.audit_log
  DO INSTEAD NOTHING;
```

---

### Summary: /kyc-review/audit

| Component | Data Source | Protocol | Frequency |
|-----------|-------------|----------|-----------|
| **Audit Event List** | NestJS API | HTTP REST | On page load |
| **Export CSV** | NestJS API | HTTP GET (file download) | On button click |
| **Filters** | Client-side | N/A | Instant |

**Schema Changes Required:**
1. ✅ Create or update `compliance.audit_log` table
2. ✅ Add helper functions for message generation
3. ✅ Add immutability rules (prevent UPDATE/DELETE)

---

## Page 22: /kyc-review/providers

### UI Mock Data Structure

```typescript
interface Provider {
  code: string;                // "sumsub" | "onfido" | "persona"
  name: string;                // "SumSub"
  color: string;               // "#0BA8E0"
  abbr: string;                // "SS"
  logo: string;                // "sumsub.png"
  docs: string;                // "https://developers.sumsub.com"
  workflows: string[];         // ["standard-kyc", "enhanced-due-diligence", ...]
  regions: string[];           // ["East Africa", "Southern Africa"]

  // Credentials (masked)
  appToken: string;            // "••••••••••••••••••••••••3f2a"
  secretKey: string;           // "sk_••••••••••••••••••••••••••••••9c1d"
  webhookUrl: string;          // "https://api.stella.io/webhooks/sumsub"

  // Status
  connectionStatus: "connected" | "degraded" | "disconnected";
  lastChecked: string;         // "2 min ago"
}
```

### UI Features & Requirements

1. **KPI Cards (4 stats)** - Connected providers, regions covered, avg response time, webhook success rate
2. **Provider Cards (3 columns)** - Display credentials (masked), connection status, workflows
3. **Credential Reveal** - Show/Hide buttons for API keys (Platform Admin only)
4. **Test Connection** - Button to validate provider API credentials
5. **Rotate Keys** - Button to trigger key rotation workflow
6. **Add Provider CTA** - Button to connect new KYC provider

---

### Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **code** | PostgreSQL | `admin.kyc_providers.code` | Static | Unique identifier |
| **name** | PostgreSQL | `admin.kyc_providers.name` | Static | Display name |
| **appToken** | PostgreSQL | `admin.kyc_providers.app_token_encrypted` (BYTEA) | Static | ✅ Encrypted |
| **secretKey** | PostgreSQL | `admin.kyc_providers.api_secret_encrypted` (BYTEA) | Static | ✅ Encrypted |
| **webhookUrl** | Calculated | `https://api.stella.io/webhooks/{code}` | Static | Derived |
| **workflows** | PostgreSQL | `admin.kyc_providers.workflows` (JSONB array) | Static | Provider config |
| **regions** | PostgreSQL | JOIN from `admin.kyc_regions` WHERE `provider_code` | Static | Reverse lookup |
| **connectionStatus** | Phoenix Cache | ETS `provider_health_cache` | Every 60s | Health check |
| **lastChecked** | Phoenix Cache | ETS `provider_health_cache` | Every 60s | Timestamp |

---

### NestJS REST API Endpoints

#### **1. List Providers**

**Endpoint:** `GET /api/kyc/providers`

**Response:**
```json
{
  "providers": [
    {
      "id": "uuid",
      "code": "sumsub",
      "name": "SumSub",
      "app_token_masked": "••••••••••••••••••••••••3f2a",
      "api_secret_masked": "sk_••••••••••••••••••••••••••••••9c1d",
      "webhook_url": "https://api.stella.io/webhooks/sumsub",
      "workflows": ["standard-kyc", "enhanced-due-diligence", "poa-check", "liveness-only"],
      "regions": ["East Africa", "Southern Africa"],
      "connection_status": "connected",
      "last_health_check_at": "2026-02-21T10:28:00Z",
      "avg_response_time_ms": 1420,
      "webhook_success_rate": 99.7,
      "is_active": true
    }
  ],
  "stats": {
    "total_providers": 3,
    "total_regions": 6,
    "avg_response_time_ms": 1400,
    "webhook_success_rate_24h": 99.7
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  p.id,
  p.code,
  p.name,
  mask_credential(p.app_token_encrypted) as app_token_masked,
  mask_credential(p.api_secret_encrypted) as api_secret_masked,
  'https://api.stella.io/webhooks/' || p.code as webhook_url,
  p.workflows,
  ARRAY(
    SELECT r.name
    FROM admin.kyc_regions r
    WHERE r.provider_code = p.code
  ) as regions,
  p.is_active,
  p.last_health_check_at,
  p.avg_response_time_ms,
  calculate_webhook_success_rate(p.code, NOW() - INTERVAL '24 hours', NOW()) as webhook_success_rate
FROM admin.kyc_providers p
ORDER BY p.name ASC;

-- Helper function to mask credentials (show last 4 chars)
CREATE OR REPLACE FUNCTION mask_credential(encrypted_value BYTEA)
RETURNS TEXT AS $$
DECLARE
  decrypted TEXT;
BEGIN
  IF encrypted_value IS NULL THEN
    RETURN NULL;
  END IF;

  -- Show pattern: ••••••••••••••••••••••••XXXX (last 4 chars)
  RETURN REPEAT('•', 24) || RIGHT(encode(encrypted_value, 'hex'), 4);
END;
$$ LANGUAGE plpgsql STABLE;
```

**Data Source:** **NestJS API** → PostgreSQL

---

#### **2. Get Provider Credentials (Decrypted)**

**Endpoint:** `POST /api/kyc/providers/:code/reveal`

**Authorization:** Platform Admin only

**Response:**
```json
{
  "app_token": "live_actual_app_token_value_REDACTED",
  "api_secret": "REDACTED",
  "expires_in": 60  // Session expires in 60 seconds
}
```

**Side Effects:**
1. Create audit log entry for credential access
2. Return decrypted values (never store decrypted in session)

**Implementation:**
```typescript
// NestJS Service
async revealCredentials(provider_code: string, current_user: User) {
  // Authorization check
  if (!current_user.roles.includes('platform_admin')) {
    throw new ForbiddenException('Platform Admin role required');
  }

  // Load provider
  const provider = await this.providerRepository.findOne({ where: { code: provider_code } });

  // Decrypt credentials
  const app_token = decrypt(provider.app_token_encrypted, this.configService.get('ENCRYPTION_KEY'));
  const api_secret = decrypt(provider.api_secret_encrypted, this.configService.get('ENCRYPTION_KEY'));

  // Audit log
  await this.auditService.log({
    event_type: 'credential_accessed',
    actor_user_id: current_user.id,
    target_entity_type: 'kyc_provider',
    target_entity_id: provider.id,
    event_data: { provider_code },
    ip_address: this.request.ip,
    user_agent: this.request.headers['user-agent']
  });

  return {
    app_token,
    api_secret,
    expires_in: 60
  };
}
```

**Data Source:** **NestJS API** → PostgreSQL + Encryption

---

#### **3. Test Provider Connection**

**Endpoint:** `POST /api/kyc/providers/:code/test`

**Authorization:** Platform Admin only

**Response:**
```json
{
  "status": "healthy",
  "response_time_ms": 1342,
  "provider_response": {
    "version": "2.0",
    "account_active": true,
    "remaining_credits": 5420
  },
  "tested_at": "2026-02-21T10:45:00Z"
}
```

**Implementation:**
```typescript
// NestJS Service
async testConnection(provider_code: string) {
  const provider = await this.providerRepository.findOne({ where: { code: provider_code } });

  // Decrypt credentials
  const credentials = this.decryptCredentials(provider);

  // Call provider health check endpoint
  const start = Date.now();
  try {
    const response = await axios.get(
      `${provider.api_base_url}/health`,
      {
        headers: {
          'Authorization': `Bearer ${credentials.api_secret}`,
          'X-App-Token': credentials.app_token
        },
        timeout: 5000
      }
    );

    const response_time_ms = Date.now() - start;

    // Update provider health
    await this.providerRepository.update(provider.id, {
      last_health_check_at: new Date(),
      avg_response_time_ms: response_time_ms,
      connection_status: 'connected'
    });

    return {
      status: 'healthy',
      response_time_ms,
      provider_response: response.data,
      tested_at: new Date().toISOString()
    };
  } catch (error) {
    // Mark as degraded/disconnected
    await this.providerRepository.update(provider.id, {
      last_health_check_at: new Date(),
      connection_status: error.code === 'ECONNREFUSED' ? 'disconnected' : 'degraded'
    });

    throw new BadGatewayException(`Provider connection failed: ${error.message}`);
  }
}
```

**Data Source:** **NestJS API** → External Provider API

---

#### **4. Rotate Provider Keys**

**Endpoint:** `POST /api/kyc/providers/:code/rotate`

**Authorization:** Platform Admin only

**Request Body:**
```json
{
  "new_app_token": "new_live_token_value",
  "new_api_secret": "sk_new_secret_key_value"
}
```

**Side Effects:**
1. Store old credentials in `admin.kyc_provider_credential_history` (for 24-hour grace period)
2. Encrypt and update new credentials
3. Create audit log entry
4. Test connection with new credentials

**PostgreSQL Transaction:**
```sql
BEGIN;

-- Archive old credentials
INSERT INTO admin.kyc_provider_credential_history (
  provider_id,
  app_token_encrypted,
  api_secret_encrypted,
  rotated_at,
  expires_at  -- 24-hour grace period
) VALUES (
  $1,  -- provider_id
  (SELECT app_token_encrypted FROM admin.kyc_providers WHERE id = $1),
  (SELECT api_secret_encrypted FROM admin.kyc_providers WHERE id = $1),
  NOW(),
  NOW() + INTERVAL '24 hours'
);

-- Update with new credentials
UPDATE admin.kyc_providers
SET
  app_token_encrypted = pgp_sym_encrypt($2, $4),  -- new_app_token, encryption_key
  api_secret_encrypted = pgp_sym_encrypt($3, $4),  -- new_api_secret, encryption_key
  updated_at = NOW()
WHERE id = $1;

-- Audit log
INSERT INTO compliance.audit_log (
  event_type,
  actor_user_id,
  target_entity_type,
  target_entity_id,
  event_data,
  created_at
) VALUES (
  'credential_rotated',
  $5,  -- current_user_id
  'kyc_provider',
  $1,
  jsonb_build_object('provider_code', $6),
  NOW()
);

COMMIT;
```

**Data Source:** **NestJS API** → PostgreSQL

---

### Database Schema Requirements

#### **New Table: `admin.kyc_providers`**

```sql
CREATE TABLE admin.kyc_providers (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                    VARCHAR(50) UNIQUE NOT NULL,  -- 'sumsub', 'onfido', 'persona'
  name                    VARCHAR(255) NOT NULL,
  api_base_url            TEXT NOT NULL,
  iframe_url              TEXT,

  -- Encrypted credentials (using pgcrypto extension)
  app_token_encrypted     BYTEA NOT NULL,
  api_secret_encrypted    BYTEA NOT NULL,
  webhook_secret_encrypted BYTEA,

  -- Configuration
  workflows               JSONB NOT NULL DEFAULT '[]',  -- Array of workflow names
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,

  -- Health monitoring
  connection_status       VARCHAR(50) DEFAULT 'unknown' CHECK (connection_status IN ('connected', 'degraded', 'disconnected', 'unknown')),
  last_health_check_at    TIMESTAMPTZ,
  avg_response_time_ms    INTEGER,

  -- Metadata
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kyc_providers_code ON admin.kyc_providers(code);
CREATE INDEX idx_kyc_providers_status ON admin.kyc_providers(connection_status);
```

---

#### **New Table: `admin.kyc_provider_credential_history`**

```sql
CREATE TABLE admin.kyc_provider_credential_history (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id             UUID NOT NULL REFERENCES admin.kyc_providers(id) ON DELETE CASCADE,
  app_token_encrypted     BYTEA NOT NULL,
  api_secret_encrypted    BYTEA NOT NULL,
  rotated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at              TIMESTAMPTZ NOT NULL,  -- Grace period expiry (24 hours)

  -- Immutable
  CONSTRAINT credential_history_immutable CHECK (rotated_at <= NOW())
);

CREATE INDEX idx_provider_cred_history_provider ON admin.kyc_provider_credential_history(provider_id);
CREATE INDEX idx_provider_cred_history_expires ON admin.kyc_provider_credential_history(expires_at);

-- Auto-cleanup expired credentials (run daily)
-- Can be done via pg_cron or Phoenix scheduler
```

---

#### **New Table: `admin.kyc_provider_webhooks`**

```sql
CREATE TABLE admin.kyc_provider_webhooks (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id             UUID NOT NULL REFERENCES admin.kyc_providers(id),
  webhook_event_id        VARCHAR(255),  -- Provider's event ID (for deduplication)
  payload                 JSONB NOT NULL,
  signature               TEXT,
  signature_valid         BOOLEAN,
  processed               BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error        TEXT,
  received_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at            TIMESTAMPTZ,

  -- Deduplication constraint
  CONSTRAINT unique_provider_webhook_event UNIQUE (provider_id, webhook_event_id)
);

CREATE INDEX idx_provider_webhooks_provider ON admin.kyc_provider_webhooks(provider_id);
CREATE INDEX idx_provider_webhooks_received ON admin.kyc_provider_webhooks(received_at DESC);
CREATE INDEX idx_provider_webhooks_processed ON admin.kyc_provider_webhooks(processed) WHERE processed = FALSE;
```

---

### Phoenix GenServer: `ProviderHealthMonitor`

**Purpose:** Periodic health checks for all KYC providers

```elixir
defmodule TradeEngine.Kyc.ProviderHealthMonitor do
  @moduledoc """
  Background task that periodically checks health of all KYC providers.
  Runs every 60 seconds.
  """

  use GenServer
  require Logger

  alias TradeEngine.Repo
  alias TradeEngine.Admin.KycProvider

  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  @impl true
  def init(_) do
    # Create ETS table for caching
    :ets.new(:provider_health_cache, [:named_table, :set, :public, read_concurrency: true])

    # Schedule first check
    schedule_health_check()

    {:ok, %{}}
  end

  @impl true
  def handle_info(:health_check, state) do
    Logger.info("Running KYC provider health checks...")

    # Load all active providers
    providers = Repo.all(from p in KycProvider, where: p.is_active == true)

    Enum.each(providers, fn provider ->
      check_provider_health(provider)
    end)

    # Schedule next check
    schedule_health_check()

    {:noreply, state}
  end

  defp check_provider_health(provider) do
    # Decrypt credentials
    credentials = decrypt_credentials(provider)

    # Make health check request
    start_time = System.monotonic_time(:millisecond)

    case HTTPoison.get(
      "#{provider.api_base_url}/health",
      [
        {"Authorization", "Bearer #{credentials.api_secret}"},
        {"X-App-Token", credentials.app_token}
      ],
      timeout: 5000
    ) do
      {:ok, %{status_code: 200}} ->
        response_time = System.monotonic_time(:millisecond) - start_time

        # Update database
        provider
        |> KycProvider.changeset(%{
          connection_status: "connected",
          last_health_check_at: DateTime.utc_now(),
          avg_response_time_ms: response_time
        })
        |> Repo.update()

        # Update ETS cache
        :ets.insert(:provider_health_cache, {
          provider.code,
          "connected",
          response_time,
          DateTime.utc_now()
        })

        Logger.info("Provider #{provider.code} health check: OK (#{response_time}ms)")

      {:ok, %{status_code: status}} ->
        update_degraded_status(provider, "HTTP #{status}")

      {:error, %{reason: reason}} ->
        update_disconnected_status(provider, inspect(reason))
    end
  end

  defp update_degraded_status(provider, reason) do
    provider
    |> KycProvider.changeset(%{
      connection_status: "degraded",
      last_health_check_at: DateTime.utc_now()
    })
    |> Repo.update()

    :ets.insert(:provider_health_cache, {
      provider.code,
      "degraded",
      nil,
      DateTime.utc_now()
    })

    Logger.warn("Provider #{provider.code} degraded: #{reason}")
  end

  defp schedule_health_check do
    Process.send_after(self(), :health_check, 60_000)  # Every 60s
  end
end
```

---

### Summary: /kyc-review/providers

| Component | Data Source | Protocol | Frequency |
|-----------|-------------|----------|-----------|
| **Provider List** | NestJS API | HTTP REST | On page load |
| **Provider Stats** | NestJS API | HTTP REST | On page load |
| **Connection Status** | Phoenix Cache (ETS) | HTTP REST | Cached (60s refresh) |
| **Reveal Credentials** | NestJS API | HTTP POST | On button click |
| **Test Connection** | NestJS API | HTTP POST | On button click |
| **Rotate Keys** | NestJS API | HTTP POST | On button click |

**Schema Changes Required:**
1. ✅ Create `admin.kyc_providers` table
2. ✅ Create `admin.kyc_provider_credential_history` table
3. ✅ Create `admin.kyc_provider_webhooks` table
4. ✅ Install `pgcrypto` extension for encryption

---

## Comprehensive Database Schema Requirements

### Schema Creation Script

```sql
-- Install extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS admin;

-- ============================================================================
-- AUTH SCHEMA
-- ============================================================================

-- Update auth.users (if missing)
ALTER TABLE auth.users
ADD COLUMN IF NOT EXISTS account_tier VARCHAR(50) DEFAULT 'Standard' CHECK (account_tier IN ('Standard', 'Enhanced', 'Accredited'));

-- Update auth.kyc_records → auth.kyc_applicants
ALTER TABLE auth.kyc_records
ADD COLUMN IF NOT EXISTS provider_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS provider_applicant_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'review', 'declined', 'expiring', 're-verify')),
ADD COLUMN IF NOT EXISTS risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS face_match_score INTEGER CHECK (face_match_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS document_authenticity_score INTEGER CHECK (document_authenticity_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS watchlist_match BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS document_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS document_expiry_date DATE,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS country_code CHAR(2);

-- ============================================================================
-- ADMIN SCHEMA
-- ============================================================================

-- KYC Providers
CREATE TABLE admin.kyc_providers (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                    VARCHAR(50) UNIQUE NOT NULL,
  name                    VARCHAR(255) NOT NULL,
  api_base_url            TEXT NOT NULL,
  iframe_url              TEXT,
  app_token_encrypted     BYTEA NOT NULL,
  api_secret_encrypted    BYTEA NOT NULL,
  webhook_secret_encrypted BYTEA,
  workflows               JSONB NOT NULL DEFAULT '[]',
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  connection_status       VARCHAR(50) DEFAULT 'unknown' CHECK (connection_status IN ('connected', 'degraded', 'disconnected', 'unknown')),
  last_health_check_at    TIMESTAMPTZ,
  avg_response_time_ms    INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kyc_providers_code ON admin.kyc_providers(code);
CREATE INDEX idx_kyc_providers_status ON admin.kyc_providers(connection_status);

-- KYC Regions
CREATE TABLE admin.kyc_regions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(255) NOT NULL UNIQUE,
  countries         JSONB NOT NULL,
  provider_code     VARCHAR(50) NOT NULL REFERENCES admin.kyc_providers(code),
  workflow_name     VARCHAR(255) NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_countries CHECK (jsonb_typeof(countries) = 'array')
);

CREATE INDEX idx_kyc_regions_provider ON admin.kyc_regions(provider_code);
CREATE INDEX idx_kyc_regions_countries ON admin.kyc_regions USING GIN (countries);

-- Re-Verification Rules
CREATE TABLE admin.kyc_reverification_rules (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger             VARCHAR(100) NOT NULL CHECK (trigger IN ('document_expiry', 'tier_upgrade', 'watchlist_match', 'periodic_refresh')),
  threshold_config    JSONB NOT NULL,
  action              VARCHAR(100) NOT NULL,
  notify_user         BOOLEAN DEFAULT TRUE,
  provider_strategy   VARCHAR(100) NOT NULL DEFAULT 'same_as_original',
  workflow_override   VARCHAR(255),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reverification_rules_trigger ON admin.kyc_reverification_rules(trigger);

-- Provider Credential History
CREATE TABLE admin.kyc_provider_credential_history (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id             UUID NOT NULL REFERENCES admin.kyc_providers(id) ON DELETE CASCADE,
  app_token_encrypted     BYTEA NOT NULL,
  api_secret_encrypted    BYTEA NOT NULL,
  rotated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at              TIMESTAMPTZ NOT NULL,
  CONSTRAINT credential_history_immutable CHECK (rotated_at <= NOW())
);

CREATE INDEX idx_provider_cred_history_provider ON admin.kyc_provider_credential_history(provider_id);
CREATE INDEX idx_provider_cred_history_expires ON admin.kyc_provider_credential_history(expires_at);

-- Provider Webhooks
CREATE TABLE admin.kyc_provider_webhooks (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id             UUID NOT NULL REFERENCES admin.kyc_providers(id),
  webhook_event_id        VARCHAR(255),
  payload                 JSONB NOT NULL,
  signature               TEXT,
  signature_valid         BOOLEAN,
  processed               BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error        TEXT,
  received_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at            TIMESTAMPTZ,
  CONSTRAINT unique_provider_webhook_event UNIQUE (provider_id, webhook_event_id)
);

CREATE INDEX idx_provider_webhooks_provider ON admin.kyc_provider_webhooks(provider_id);
CREATE INDEX idx_provider_webhooks_received ON admin.kyc_provider_webhooks(received_at DESC);
CREATE INDEX idx_provider_webhooks_processed ON admin.kyc_provider_webhooks(processed) WHERE processed = FALSE;

-- ============================================================================
-- COMPLIANCE SCHEMA
-- ============================================================================

-- KYC Decisions
CREATE TABLE compliance.kyc_decisions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  applicant_id        UUID NOT NULL REFERENCES auth.kyc_records(id) ON DELETE CASCADE,
  decided_by_user_id  UUID NOT NULL REFERENCES auth.users(id),
  action              VARCHAR(50) NOT NULL CHECK (action IN ('approve', 'decline', 're-verify', 'flag_for_review')),
  compliance_note     TEXT NOT NULL,
  rejection_reasons   JSONB,
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kyc_decision_note_required CHECK (LENGTH(compliance_note) >= 10)
);

CREATE INDEX idx_kyc_decisions_applicant ON compliance.kyc_decisions(applicant_id);
CREATE INDEX idx_kyc_decisions_decided_at ON compliance.kyc_decisions(decided_at DESC);
CREATE INDEX idx_kyc_decisions_decided_by ON compliance.kyc_decisions(decided_by_user_id);

-- Audit Log
CREATE TABLE compliance.audit_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type          VARCHAR(100) NOT NULL,
  actor_user_id       UUID REFERENCES auth.users(id),
  target_entity_type  VARCHAR(100) NOT NULL,
  target_entity_id    UUID NOT NULL,
  event_data          JSONB,
  ip_address          INET,
  user_agent          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_log_immutable CHECK (created_at >= NOW() - INTERVAL '7 years')
);

CREATE INDEX idx_audit_log_created_at ON compliance.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_actor ON compliance.audit_log(actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_log_event_type ON compliance.audit_log(event_type);
CREATE INDEX idx_audit_log_target ON compliance.audit_log(target_entity_type, target_entity_id);

-- Prevent updates/deletes on audit log (immutability)
CREATE RULE audit_log_no_update AS ON UPDATE TO compliance.audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO compliance.audit_log DO INSTEAD NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get region for country code
CREATE OR REPLACE FUNCTION get_region_for_country(country_code CHAR(2))
RETURNS TEXT AS $$
DECLARE
  region_name TEXT;
BEGIN
  SELECT name INTO region_name
  FROM admin.kyc_regions
  WHERE countries @> jsonb_build_array(country_code) AND is_active = TRUE
  LIMIT 1;

  IF region_name IS NULL THEN
    SELECT name INTO region_name
    FROM admin.kyc_regions
    WHERE countries @> '["*"]' AND is_active = TRUE
    LIMIT 1;
  END IF;

  RETURN COALESCE(region_name, 'Unknown');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Mask credentials
CREATE OR REPLACE FUNCTION mask_credential(encrypted_value BYTEA)
RETURNS TEXT AS $$
BEGIN
  IF encrypted_value IS NULL THEN RETURN NULL; END IF;
  RETURN REPEAT('•', 24) || RIGHT(encode(encrypted_value, 'hex'), 4);
END;
$$ LANGUAGE plpgsql STABLE;

-- Map event type to category
CREATE OR REPLACE FUNCTION map_event_type_to_category(event_type TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN event_type IN ('kyc_decision', 'manual_approval', 'manual_decline', 're_verify_triggered') THEN 'override'
    WHEN event_type IN ('credential_created', 'credential_rotated', 'api_key_updated') THEN 'credential'
    WHEN event_type IN ('region_created', 'region_updated', 'region_routing_changed') THEN 'region'
    WHEN event_type IN ('provider_connected', 'provider_health_check', 'provider_degraded') THEN 'provider'
    ELSE 'other'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Generate audit message
CREATE OR REPLACE FUNCTION generate_audit_message(
  event_type TEXT,
  event_data JSONB,
  target_type TEXT,
  target_id UUID
)
RETURNS TEXT AS $$
DECLARE
  target_name TEXT;
BEGIN
  target_name := get_entity_display_name(target_type, target_id);

  RETURN CASE event_type
    WHEN 'kyc_decision' THEN
      CASE event_data->>'action'
        WHEN 'approve' THEN 'Manually approved applicant ' || target_name
        WHEN 'decline' THEN 'Manually declined applicant ' || target_name
        WHEN 're-verify' THEN 'Triggered re-verification for ' || target_name
        ELSE 'Made decision on ' || target_name
      END
    WHEN 'credential_rotated' THEN 'Rotated API key for provider ' || target_name
    WHEN 'region_created' THEN 'Added ' || target_name || ' region mapped to ' || (event_data->>'provider')
    WHEN 'provider_health_check' THEN 'Degraded health detected for provider ' || target_name
    ELSE event_type || ' on ' || target_name
  END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get entity display name
CREATE OR REPLACE FUNCTION get_entity_display_name(entity_type TEXT, entity_id UUID)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  CASE entity_type
    WHEN 'kyc_applicant' THEN
      SELECT 'KYC-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 4, '0')
      INTO result
      FROM auth.kyc_records
      WHERE id = entity_id;
    WHEN 'kyc_provider' THEN
      SELECT name INTO result FROM admin.kyc_providers WHERE id = entity_id;
    WHEN 'kyc_region' THEN
      SELECT name INTO result FROM admin.kyc_regions WHERE id = entity_id;
    ELSE
      result := entity_id::TEXT;
  END CASE;

  RETURN COALESCE(result, entity_id::TEXT);
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## API Endpoints Summary

### NestJS REST Endpoints

| Endpoint | Method | Purpose | Page |
|----------|--------|---------|------|
| `/api/kyc/applicants` | GET | List applicants with filters | 19 |
| `/api/kyc/applicants/:id` | GET | Get applicant detail | 19 |
| `/api/kyc/applicants/:id/decision` | POST | Submit compliance decision | 19 |
| `/api/kyc/applicants/:id/provider-session` | POST | Generate provider iframe token | 19 |
| `/api/kyc/regions` | GET | List region configurations | 20 |
| `/api/kyc/regions` | POST | Create new region | 20 |
| `/api/kyc/regions/:id` | PUT | Update region | 20 |
| `/api/kyc/reverification-rules` | GET | List re-verification rules | 20 |
| `/api/kyc/audit` | GET | List audit events | 21 |
| `/api/kyc/audit/export` | GET | Export audit log CSV | 21 |
| `/api/kyc/providers` | GET | List KYC providers | 22 |
| `/api/kyc/providers/:code/reveal` | POST | Reveal encrypted credentials | 22 |
| `/api/kyc/providers/:code/test` | POST | Test provider connection | 22 |
| `/api/kyc/providers/:code/rotate` | POST | Rotate provider keys | 22 |

### Phoenix Webhook Endpoints

| Endpoint | Method | Purpose | Handler |
|----------|--------|---------|---------|
| `/webhooks/sumsub` | POST | SumSub webhook receiver | `KycWebhookHandler` |
| `/webhooks/onfido` | POST | Onfido webhook receiver | `KycWebhookHandler` |
| `/webhooks/persona` | POST | Persona webhook receiver | `KycWebhookHandler` |

### Phoenix WebSocket Channels

| Channel | Topic Pattern | Purpose | Events |
|---------|---------------|---------|--------|
| `KycApplicantChannel` | `kyc:applicants:user:{user_id}` | Real-time applicant updates | `applicant_status_update`, `compliance_decision_made` |

---

## Implementation Roadmap

### Phase 1: Database Schema (Week 1)

**Priority:** P0 (Blocking)

- [ ] Install `pgcrypto` extension
- [ ] Create `admin` and `compliance` schemas
- [ ] Create `admin.kyc_providers` table
- [ ] Create `admin.kyc_regions` table
- [ ] Create `admin.kyc_reverification_rules` table
- [ ] Create `admin.kyc_provider_credential_history` table
- [ ] Create `admin.kyc_provider_webhooks` table
- [ ] Update `auth.kyc_records` table (add missing columns)
- [ ] Add `account_tier` to `auth.users`
- [ ] Create `compliance.kyc_decisions` table
- [ ] Update `compliance.audit_log` table (add immutability rules)
- [ ] Create helper functions (`get_region_for_country`, etc.)
- [ ] Seed initial provider data (SumSub, Onfido, Persona)
- [ ] Seed initial region configurations

**Estimated Time:** 5-7 days

---

### Phase 2: Phoenix Backend (Weeks 2-3)

**Priority:** P0 (Blocking)

- [ ] Implement `KycWebhookHandler` GenServer
  - [ ] Signature validation for all 3 providers
  - [ ] Payload parsing logic
  - [ ] Database updates
  - [ ] PubSub broadcasting
  - [ ] Webhook deduplication
- [ ] Implement `KycApplicantChannel` WebSocket
  - [ ] Join/authentication logic
  - [ ] Real-time status update broadcasting
  - [ ] Compliance decision event broadcasting
- [ ] Implement `ProviderHealthMonitor` GenServer
  - [ ] Periodic health checks (60s interval)
  - [ ] ETS caching
  - [ ] Status update logic
- [ ] Implement `ReVerificationScheduler` GenServer
  - [ ] Daily scheduled checks
  - [ ] Document expiry evaluation
  - [ ] Notification triggers
- [ ] Add Phoenix router endpoints for webhooks
  - [ ] `/webhooks/sumsub`
  - [ ] `/webhooks/onfido`
  - [ ] `/webhooks/persona`

**Estimated Time:** 10-14 days

---

### Phase 3: NestJS API (Weeks 4-5)

**Priority:** P0 (Blocking)

**Applicants Module:**
- [ ] Implement `GET /api/kyc/applicants` endpoint
  - [ ] Query builder with filters
  - [ ] Pagination logic
  - [ ] Status count aggregation
- [ ] Implement `GET /api/kyc/applicants/:id` endpoint
- [ ] Implement `POST /api/kyc/applicants/:id/decision` endpoint
  - [ ] Transaction handling
  - [ ] Audit log creation
  - [ ] PubSub broadcasting
  - [ ] Email notification trigger
- [ ] Implement `POST /api/kyc/applicants/:id/provider-session` endpoint
  - [ ] External provider API integration
  - [ ] Session token generation
  - [ ] Audit logging

**Regions Module:**
- [ ] Implement `GET /api/kyc/regions` endpoint
- [ ] Implement `POST /api/kyc/regions` endpoint
- [ ] Implement `PUT /api/kyc/regions/:id` endpoint
- [ ] Implement `GET /api/kyc/reverification-rules` endpoint

**Audit Module:**
- [ ] Implement `GET /api/kyc/audit` endpoint
  - [ ] Helper function integration
  - [ ] Message generation
- [ ] Implement `GET /api/kyc/audit/export` endpoint
  - [ ] CSV generation
  - [ ] File streaming

**Providers Module:**
- [ ] Implement `GET /api/kyc/providers` endpoint
- [ ] Implement `POST /api/kyc/providers/:code/reveal` endpoint
  - [ ] Decryption logic
  - [ ] Authorization checks
  - [ ] Audit logging
- [ ] Implement `POST /api/kyc/providers/:code/test` endpoint
  - [ ] External provider API calls
  - [ ] Health status updates
- [ ] Implement `POST /api/kyc/providers/:code/rotate` endpoint
  - [ ] Credential rotation transaction
  - [ ] Grace period management

**Estimated Time:** 10-14 days

---

### Phase 4: Frontend Integration (Week 6)

**Priority:** P1 (High)

- [ ] Replace mock data with API calls
  - [ ] Applicants page
  - [ ] Regions page
  - [ ] Audit page
  - [ ] Providers page
- [ ] Implement WebSocket connections
  - [ ] `kyc:applicants:user:{id}` channel
  - [ ] Real-time status updates
  - [ ] Reconnection logic
- [ ] Add error handling
  - [ ] API error states
  - [ ] WebSocket disconnection
  - [ ] Form validation
- [ ] Add loading states
  - [ ] Skeleton loaders
  - [ ] Button loading indicators
- [ ] Implement provider iframe integration
  - [ ] Session token fetching
  - [ ] Iframe embedding
  - [ ] Token expiry handling

**Estimated Time:** 5-7 days

---

### Phase 5: Testing & Security Hardening (Week 7)

**Priority:** P1 (High)

**Testing:**
- [ ] Unit tests for all endpoints
- [ ] Integration tests for webhook flows
- [ ] End-to-end tests for compliance workflows
- [ ] Load testing for webhook handling
- [ ] WebSocket connection testing

**Security:**
- [ ] Audit credential encryption
- [ ] Review RBAC implementation
- [ ] Penetration testing for credential reveal
- [ ] Webhook signature validation audit
- [ ] Audit log immutability verification

**Estimated Time:** 5-7 days

---

### Total Implementation Timeline: **7 weeks**

---

## Cross-Page Data Flow

### Flow 1: New KYC Application Submission

```
1. User submits KYC form (not in this section)
   ↓
2. Frontend creates applicant record via API
   POST /api/kyc/applicants
   ↓
3. NestJS creates record in auth.kyc_applicants
   ↓
4. NestJS calls external provider API (SumSub/Onfido/Persona)
   to initiate KYC workflow
   ↓
5. Provider processes documents (async)
   ↓
6. Provider sends webhook to Phoenix
   POST /webhooks/{provider}
   ↓
7. Phoenix KycWebhookHandler validates and processes
   ↓
8. Phoenix updates auth.kyc_applicants status
   ↓
9. Phoenix broadcasts via PubSub
   kyc:applicants:all → applicant_status_update
   ↓
10. Frontend WebSocket receives update
    ↓
11. Frontend updates UI in real-time (Applicants page)
```

---

### Flow 2: Compliance Officer Manual Decision

```
1. Officer clicks applicant row in table
   ↓
2. Frontend opens ApplicantModal
   ↓
3. Frontend loads applicant detail (already cached from list)
   ↓
4. Officer switches to "Documents" tab
   ↓
5. Frontend requests provider session token
   POST /api/kyc/applicants/:id/provider-session
   ↓
6. NestJS calls external provider API for session token
   ↓
7. NestJS returns iframe URL with embedded token
   ↓
8. Frontend renders provider iframe (15-min session)
   ↓
9. Officer reviews documents in provider UI
   ↓
10. Officer returns to "KYC Data" tab
    ↓
11. Officer enters compliance note
    ↓
12. Officer clicks "Approve" or "Decline"
    ↓
13. Frontend sends decision
    POST /api/kyc/applicants/:id/decision
    {action: "approve", compliance_note: "..."}
    ↓
14. NestJS starts transaction
    ↓
15. NestJS inserts into compliance.kyc_decisions
    ↓
16. NestJS updates auth.kyc_applicants.status
    ↓
17. NestJS inserts audit log entry
    ↓
18. NestJS commits transaction
    ↓
19. NestJS broadcasts via Phoenix PubSub
    kyc:applicants:all → compliance_decision_made
    ↓
20. Frontend WebSocket receives event
    ↓
21. Frontend updates applicant status in table
    ↓
22. Frontend closes modal
    ↓
23. Background job sends email to applicant
```

---

### Flow 3: Provider Credential Rotation

```
1. Admin clicks "Rotate Keys" on provider card
   ↓
2. Frontend shows modal with input fields
   ↓
3. Admin enters new app_token and api_secret
   ↓
4. Frontend submits
   POST /api/kyc/providers/{code}/rotate
   {new_app_token: "...", new_api_secret: "..."}
   ↓
5. NestJS starts transaction
   ↓
6. NestJS archives old credentials to kyc_provider_credential_history
   (24-hour grace period)
   ↓
7. NestJS encrypts new credentials with pgcrypto
   ↓
8. NestJS updates admin.kyc_providers with new encrypted values
   ↓
9. NestJS inserts audit log entry
   ↓
10. NestJS commits transaction
    ↓
11. NestJS calls provider health check API with new credentials
    ↓
12. NestJS returns success or error
    ↓
13. Frontend shows success message
    ↓
14. Phoenix ProviderHealthMonitor picks up changes on next cycle
    ↓
15. ETS cache updated with new health status
```

---

### Flow 4: Automated Re-Verification Trigger

```
1. Phoenix ReVerificationScheduler runs daily at midnight UTC
   ↓
2. Scheduler loads active rules from admin.kyc_reverification_rules
   ↓
3. Scheduler evaluates "document_expiry" rule
   ↓
4. Scheduler queries auth.kyc_applicants
   WHERE document_expiry_date <= (NOW() + 30 days)
   ↓
5. For each expiring applicant:
   a. Update status to "expiring"
   b. Broadcast update via PubSub
   c. Trigger email notification (background job)
   ↓
6. Frontend WebSocket receives updates
   ↓
7. Applicants page shows "Expiring Soon" badge
   ↓
8. User sees notification (via email or UI alert)
```

---

## Performance Considerations

### Database Optimization

1. **Indexes:**
   - All foreign keys indexed
   - Timestamp columns indexed (DESC for recent-first queries)
   - JSONB columns use GIN indexes for array containment searches
   - Partial indexes on filtered queries (e.g., `WHERE processed = FALSE`)

2. **Query Optimization:**
   - Pagination limits (max 100 per page)
   - Avoid N+1 queries with JOINs
   - Use `EXPLAIN ANALYZE` for slow queries
   - Consider materialized views for complex aggregations

3. **Data Retention:**
   - Audit log: 7-year retention (regulatory requirement)
   - Webhook logs: 90-day retention (configurable)
   - Credential history: Auto-cleanup after grace period

---

### Caching Strategy

| Data Type | Cache Layer | TTL | Invalidation |
|-----------|-------------|-----|--------------|
| Provider health status | ETS | 60s | On health check |
| Applicant list | React Query | 30s | On WebSocket update |
| Region config | React Query | 5min | On mutation |
| Audit log | No cache | - | Append-only |
| Provider credentials (decrypted) | No cache | - | Never cached |

---

### WebSocket Scalability

- Phoenix Channels support 100,000+ concurrent connections per node
- Use topic-based subscriptions for efficient broadcasting
- Implement backpressure for high-volume webhook events
- Consider Redis PubSub adapter for multi-node deployments

---

### Security Best Practices

1. **Credential Encryption:**
   - Use `pgcrypto` with AES-256
   - Store encryption key in environment variable (never in code)
   - Rotate encryption keys annually
   - Never log decrypted credentials

2. **Webhook Security:**
   - Validate signatures for all incoming webhooks
   - Implement idempotency (deduplication by `webhook_event_id`)
   - Rate limiting (max 100 requests/min per provider)
   - Log all webhook attempts (valid and invalid)

3. **Audit Logging:**
   - Log all credential access (reveal, rotate)
   - Log all compliance decisions
   - Log all provider configuration changes
   - Implement database-level immutability (prevent UPDATE/DELETE)

4. **RBAC:**
   - Compliance Officer: Can view, approve, decline, re-verify applicants
   - Platform Admin: Can manage providers, regions, credentials
   - Auditor (read-only): Can view audit logs, export CSV

---

## Testing Checklist

### Unit Tests

- [ ] Applicant list filtering logic
- [ ] Compliance decision validation
- [ ] Webhook signature validation (all 3 providers)
- [ ] Region-to-country matching logic
- [ ] Audit message generation
- [ ] Credential encryption/decryption

### Integration Tests

- [ ] Webhook → Database update → PubSub broadcast flow
- [ ] Compliance decision → Audit log → Email notification flow
- [ ] Provider credential rotation → Health check flow
- [ ] Re-verification scheduler → Status update flow

### End-to-End Tests

- [ ] Applicant status changes reflect in UI in real-time
- [ ] Manual decision workflow (modal → API → update → close)
- [ ] Provider iframe loading with session token
- [ ] Audit log export generates correct CSV
- [ ] Region create/edit updates applicant routing

---

## Compliance & Regulatory Notes

### Data Retention Requirements

- **Audit Logs:** 7 years (financial regulatory requirement)
- **KYC Records:** Until account closure + 5 years
- **Webhook Logs:** 90 days minimum (configurable)
- **Compliance Decisions:** Permanent (linked to audit log)

### Data Privacy (GDPR/CCPA)

- KYC data contains PII - implement data subject access requests (DSAR)
- Right to erasure: KYC records can be deleted after retention period
- Audit logs are exempt from deletion (regulatory requirement)
- Provider iframe sessions must be short-lived (15 minutes)

### Regional Compliance

- Some jurisdictions require data residency (e.g., EU data must stay in EU)
- Consider provider availability per region
- Document cross-border data transfers

---

**Analysis Complete** ✅

**Next Steps:**
1. Review and approve this analysis
2. Prioritize implementation phases
3. Begin Phase 1: Database schema migration
4. Set up development environment for Phoenix webhook testing
5. Integrate with actual KYC provider sandbox environments

**Estimated Total Implementation:** 7-8 weeks with 2 full-time developers.
