# Page 22: `/settings/billing` - Billing & Fee Configuration

**Document Version:** 1.0
**Last Updated:** February 21, 2026
**Route:** `/settings/billing`
**Page Type:** Configuration & Settings
**User Persona:** Platform Admin (exclusive access)
**Multi-Exchange Impact:** L None (platform-level fee configuration)

---

## UI Mock Data Structure

```typescript
interface BillingConfig {
  // Platform Fee Structure
  performanceFee: number;              // 0-50% (percentage of user profits)
  feeCalculationPeriod: string;        // "daily", "weekly", "monthly", "quarterly"
  highWatermarkReset: string;          // "never", "annual", "monthly"

  // Payment Gateway
  paymentGateway: string;              // "stripe", "flutterwave", "paystack", "mtn_momo"
  gatewayApiKey?: string;              // Encrypted, not shown in UI
  gatewaySecretKey?: string;           // Encrypted, not shown in UI

  // Tax Configuration
  vatRate: number;                     // 0-100% (VAT/sales tax rate)
  vatEnabled: boolean;                 // Apply VAT to subscriptions
  taxJurisdiction?: string;            // "Uganda", "Kenya", "Global", etc.

  // Invoice Configuration
  invoicePrefix: string;               // "STLA", "INV", etc.
  invoiceLegalEntity: string;          // "Stella Financial Technologies Ltd."
  invoiceDueDays: number;              // Days until invoice is overdue
  paymentFailureGracePeriod: number;   // Days before suspension after failed payment

  // Metadata
  updatedAt: string;
  updatedBy: string;                   // Admin user who last modified
}

interface PlatformRevenue {
  // Revenue metrics (for dashboard visibility)
  totalRevenueUSD: number;             // Total platform revenue
  monthlyRecurringRevenue: number;     // MRR from subscriptions
  averageRevenuePerUser: number;       // ARPU
  performanceFeeRevenue: number;       // Revenue from performance fees
}
```

---

## UI Features & Requirements

1. **Platform Fee Structure Section**:
   - Performance Fee (slider, 0-50%, 0.5% increments)
   - Fee Calculation Period (dropdown: daily/weekly/monthly/quarterly)
   - High-Watermark Reset (dropdown: never/annual/monthly)

2. **Payment Gateway Section**:
   - Gateway selection (Stripe, Flutterwave, Paystack, MTN Mobile Money)
   - VAT Rate input (0-100%)
   - VAT toggle (enable/disable VAT on subscriptions)

3. **Invoice Configuration Section**:
   - Invoice number prefix (text input)
   - Legal entity name (text input, appears on invoice footer)
   - Invoice due days (number input)
   - Payment failure grace period (number input)

4. **Dirty State Management**:
   - Track unsaved changes
   - Show "Discard Changes" and "Save Changes" buttons when dirty
   - Confirm before discarding

5. **Role-Based Access**:
   - Platform Admin: Full access (edit and save)
   - All other roles: No access (redirect or show permission error)

6. **Multi-Exchange Context**: **NOT APPLICABLE** - Fee configuration is platform-level, applies to all exchanges uniformly

---

## Data Source Mapping

| Data Field | Source | Storage | Update Frequency | Notes |
|------------|--------|---------|------------------|-------|
| **Performance Fee** | PostgreSQL | `platform.billing_config` | Static (admin edits) | Applied to all user profit calculations |
| **Fee Calculation Period** | PostgreSQL | `platform.billing_config` | Static | Determines when fees are charged |
| **High-Watermark Reset** | PostgreSQL | `platform.billing_config` | Static | Affects performance fee calculation |
| **Payment Gateway** | PostgreSQL | `platform.billing_config` | Static | Active payment processor |
| **Gateway Credentials** | PostgreSQL | `platform.billing_config` | Static (encrypted) | Never sent to frontend |
| **VAT Rate** | PostgreSQL | `platform.billing_config` | Static | Applied to invoices |
| **VAT Enabled** | PostgreSQL | `platform.billing_config` | Static | Toggle VAT application |
| **Invoice Prefix** | PostgreSQL | `platform.billing_config` | Static | Invoice numbering format |
| **Legal Entity** | PostgreSQL | `platform.billing_config` | Static | Appears on invoices |
| **Invoice Due Days** | PostgreSQL | `platform.billing_config` | Static | Payment terms |
| **Grace Period** | PostgreSQL | `platform.billing_config` | Static | Before account suspension |

---

## Data Delivery Strategy

### **Initial Page Load (REST API via NestJS)**

**Endpoint 1:** `GET /api/platform/billing/config`

**Authorization:** Platform Admin only

**Response:**
```json
{
  "config": {
    "performanceFee": 20,
    "feeCalculationPeriod": "monthly",
    "highWatermarkReset": "annual",
    "paymentGateway": "stripe",
    "vatRate": 18,
    "vatEnabled": true,
    "invoicePrefix": "STLA",
    "invoiceLegalEntity": "Stella Financial Technologies Ltd.",
    "invoiceDueDays": 7,
    "paymentFailureGracePeriod": 3,
    "updatedAt": "2026-02-15T10:30:00Z",
    "updatedBy": "admin@stella.com"
  }
}
```

**PostgreSQL Query:**
```sql
SELECT
  performance_fee_pct as performance_fee,
  fee_calculation_period,
  high_watermark_reset,
  payment_gateway,
  vat_rate_pct as vat_rate,
  vat_enabled,
  invoice_prefix,
  invoice_legal_entity,
  invoice_due_days,
  payment_failure_grace_days as payment_failure_grace_period,
  updated_at,
  au.email as updated_by
FROM platform.billing_config bc
LEFT JOIN auth.users au ON bc.updated_by_user_id = au.id
WHERE bc.id = 1  -- Single row configuration
  AND bc.deleted_at IS NULL;
```

**Data Source:** **NestJS API** ’ PostgreSQL

---

**Endpoint 2:** `PUT /api/platform/billing/config`

**Authorization:** Platform Admin only

**Request Body:**
```json
{
  "performanceFee": 22,
  "feeCalculationPeriod": "monthly",
  "highWatermarkReset": "annual",
  "paymentGateway": "stripe",
  "vatRate": 18,
  "vatEnabled": true,
  "invoicePrefix": "STLA",
  "invoiceLegalEntity": "Stella Financial Technologies Ltd.",
  "invoiceDueDays": 7,
  "paymentFailureGracePeriod": 3
}
```

**Response:**
```json
{
  "success": true,
  "config": {
    "performanceFee": 22,
    "feeCalculationPeriod": "monthly",
    "highWatermarkReset": "annual",
    "paymentGateway": "stripe",
    "vatRate": 18,
    "vatEnabled": true,
    "invoicePrefix": "STLA",
    "invoiceLegalEntity": "Stella Financial Technologies Ltd.",
    "invoiceDueDays": 7,
    "paymentFailureGracePeriod": 3,
    "updatedAt": "2026-02-21T16:00:00Z",
    "updatedBy": "admin@stella.com"
  },
  "auditId": "uuid"
}
```

**PostgreSQL Transaction:**
```sql
-- Update billing configuration
UPDATE platform.billing_config
SET
  performance_fee_pct = $1,
  fee_calculation_period = $2,
  high_watermark_reset = $3,
  payment_gateway = $4,
  vat_rate_pct = $5,
  vat_enabled = $6,
  invoice_prefix = $7,
  invoice_legal_entity = $8,
  invoice_due_days = $9,
  payment_failure_grace_days = $10,
  updated_at = NOW(),
  updated_by_user_id = $11  -- Admin user ID
WHERE id = 1
RETURNING *;

-- Log configuration change in audit trail
INSERT INTO platform.audit_log (
  event_type,
  actor_user_id,
  target_type,
  target_id,
  metadata,
  created_at
) VALUES (
  'billing_config_updated',
  $11,  -- Admin user ID
  'billing_config',
  '1',
  jsonb_build_object(
    'changes', jsonb_build_object(
      'performance_fee', $1,
      'vat_rate', $5,
      'payment_gateway', $4
    )
  ),
  NOW()
);
```

**Side Effects:**
- All future performance fee calculations use new percentage
- All new invoices generated with updated VAT rate (if changed)
- Invoice numbering continues with new prefix (if changed)

**Data Source:** **NestJS API** ’ PostgreSQL

---

**Endpoint 3:** `GET /api/platform/billing/revenue-stats`

**Authorization:** Platform Admin only

**Purpose:** Optional dashboard showing platform revenue metrics

**Response:**
```json
{
  "stats": {
    "totalRevenueUSD": 1245678.90,
    "monthlyRecurringRevenue": 45000,
    "averageRevenuePerUser": 125.50,
    "performanceFeeRevenue": 89450.30,
    "period": "2026-02"
  }
}
```

**PostgreSQL Query:**
```sql
WITH revenue_data AS (
  SELECT
    SUM(amount_usd) as total_revenue,
    SUM(CASE WHEN fee_type = 'performance' THEN amount_usd ELSE 0 END) as perf_fee_revenue,
    COUNT(DISTINCT user_id) as active_users
  FROM finance.fees_collected
  WHERE collected_at >= DATE_TRUNC('month', NOW())
    AND collected_at < DATE_TRUNC('month', NOW() + INTERVAL '1 month')
),
subscription_data AS (
  SELECT SUM(amount_usd) as mrr
  FROM finance.subscriptions
  WHERE status = 'active'
    AND billing_period = 'monthly'
)
SELECT
  rd.total_revenue as total_revenue_usd,
  sd.mrr as monthly_recurring_revenue,
  CASE
    WHEN rd.active_users > 0
    THEN rd.total_revenue / rd.active_users
    ELSE 0
  END as average_revenue_per_user,
  rd.perf_fee_revenue as performance_fee_revenue
FROM revenue_data rd
CROSS JOIN subscription_data sd;
```

**Data Source:** **NestJS API** ’ PostgreSQL

---

## Database Schema Requirements

### Schema Changes

**1. Create `platform.billing_config` table**

```sql
CREATE TABLE platform.billing_config (
    id INTEGER PRIMARY KEY DEFAULT 1,  -- Single-row config

    -- Fee Structure
    performance_fee_pct DECIMAL(5,2) NOT NULL DEFAULT 20.00,  -- 0.00 to 50.00
    fee_calculation_period VARCHAR(20) NOT NULL DEFAULT 'monthly',  -- daily, weekly, monthly, quarterly
    high_watermark_reset VARCHAR(20) NOT NULL DEFAULT 'annual',    -- never, annual, monthly

    -- Payment Gateway
    payment_gateway VARCHAR(50) NOT NULL DEFAULT 'stripe',  -- stripe, flutterwave, paystack, mtn_momo
    gateway_api_key_encrypted TEXT,                         -- Encrypted API key
    gateway_secret_key_encrypted TEXT,                      -- Encrypted secret key
    gateway_webhook_secret_encrypted TEXT,                  -- Encrypted webhook secret

    -- Tax Configuration
    vat_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 18.00,      -- 0.00 to 100.00
    vat_enabled BOOLEAN DEFAULT true,
    tax_jurisdiction VARCHAR(100),                          -- "Uganda", "Kenya", etc.

    -- Invoice Configuration
    invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'STLA',
    invoice_legal_entity TEXT NOT NULL DEFAULT 'Stella Financial Technologies Ltd.',
    invoice_due_days INTEGER NOT NULL DEFAULT 7,
    payment_failure_grace_days INTEGER NOT NULL DEFAULT 3,

    -- Metadata
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT single_row_config CHECK (id = 1),
    CONSTRAINT performance_fee_range CHECK (performance_fee_pct BETWEEN 0 AND 50),
    CONSTRAINT vat_rate_range CHECK (vat_rate_pct BETWEEN 0 AND 100),
    CONSTRAINT invoice_due_positive CHECK (invoice_due_days > 0),
    CONSTRAINT grace_period_positive CHECK (payment_failure_grace_days >= 0)
);

-- Insert default configuration
INSERT INTO platform.billing_config (
    id,
    performance_fee_pct,
    fee_calculation_period,
    high_watermark_reset,
    payment_gateway,
    vat_rate_pct,
    vat_enabled,
    invoice_prefix,
    invoice_legal_entity,
    invoice_due_days,
    payment_failure_grace_days
) VALUES (
    1,
    20.00,
    'monthly',
    'annual',
    'stripe',
    18.00,
    true,
    'STLA',
    'Stella Financial Technologies Ltd.',
    7,
    3
);

COMMENT ON TABLE platform.billing_config IS 'Platform-wide billing and fee configuration (single row)';
```

**2. Create `finance.fees_collected` table** (if not exists)

```sql
CREATE TABLE finance.fees_collected (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- Fee Details
    fee_type VARCHAR(50) NOT NULL,  -- 'performance', 'subscription', 'transaction'
    amount_usd DECIMAL(18,8) NOT NULL,
    amount_local_currency DECIMAL(18,8),
    currency_code VARCHAR(10),

    -- Performance Fee Specifics
    profit_period_start DATE,
    profit_period_end DATE,
    user_profit_usd DECIMAL(18,8),
    fee_percentage DECIMAL(5,2),    -- Snapshot of fee % at time of collection

    -- Payment Processing
    payment_gateway VARCHAR(50),
    payment_transaction_id VARCHAR(255),
    payment_status VARCHAR(50),     -- 'pending', 'completed', 'failed', 'refunded'

    -- Invoice Reference
    invoice_id VARCHAR(50),

    -- Timestamps
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fees_collected_user ON finance.fees_collected(user_id);
CREATE INDEX idx_fees_collected_type ON finance.fees_collected(fee_type);
CREATE INDEX idx_fees_collected_date ON finance.fees_collected(collected_at DESC);
CREATE INDEX idx_fees_collected_payment_status ON finance.fees_collected(payment_status);

COMMENT ON TABLE finance.fees_collected IS 'History of all platform fees collected from users';
```

**3. Create `finance.subscriptions` table** (if not exists)

```sql
CREATE TABLE finance.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- Subscription Details
    plan_name VARCHAR(100) NOT NULL,        -- "Starter", "Pro", "Enterprise"
    plan_tier VARCHAR(50) NOT NULL,         -- "basic", "premium", "enterprise"
    billing_period VARCHAR(20) NOT NULL,    -- "monthly", "quarterly", "annual"

    -- Pricing
    amount_usd DECIMAL(18,8) NOT NULL,
    currency_code VARCHAR(10) DEFAULT 'USD',

    -- Status
    status VARCHAR(50) NOT NULL,            -- 'active', 'canceled', 'past_due', 'suspended'

    -- Billing Cycle
    current_period_start DATE NOT NULL,
    current_period_end DATE NOT NULL,
    next_billing_date DATE,

    -- Payment Gateway
    payment_gateway VARCHAR(50),
    subscription_id_external VARCHAR(255),  -- Stripe subscription ID, etc.

    -- Cancellation
    canceled_at TIMESTAMPTZ,
    cancellation_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON finance.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON finance.subscriptions(status);
CREATE INDEX idx_subscriptions_next_billing ON finance.subscriptions(next_billing_date);

COMMENT ON TABLE finance.subscriptions IS 'User subscription plans and billing status';
```

**4. Update `platform.audit_log` table** (add if not exists)

```sql
-- Ensure audit log captures billing config changes
-- (Already created in previous pages, no changes needed)
```

---

## Multi-Exchange Context

### **NOT APPLICABLE - Platform-Level Configuration**

Billing configuration is **platform-level**, not exchange-specific:
- Performance fee applies uniformly to all user profits (regardless of which exchange generated the profit)
- VAT/tax settings apply to all invoices platform-wide
- Payment gateway is single, shared across all users and exchanges
- Invoice configuration is standardized

**No exchange field needed** in billing configuration.

---

## Summary: Billing Configuration Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|----------------------|
| **Billing Config** | NestJS API | HTTP REST | On page load | Platform-level settings |
| **Save Changes** | NestJS API | HTTP PUT | On action | Updates single-row config |
| **Revenue Stats** | NestJS API | HTTP REST | Optional | Aggregated platform revenue |

**Schema Changes Required:**
1.  Create `platform.billing_config` table (single-row configuration)
2.  Create `finance.fees_collected` table for fee tracking
3.  Create `finance.subscriptions` table for subscription management
4.  Add audit logging for configuration changes

**No Real-Time WebSocket Required** - Static configuration, updated manually by admins

---

## Frontend Implementation Notes

### API Integration

```typescript
// Fetch billing config on page load
const { data: config } = await fetch('/api/platform/billing/config');

// Save changes
const handleSave = async (updatedConfig) => {
  const response = await fetch('/api/platform/billing/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedConfig)
  });

  if (response.ok) {
    toast.success('Billing configuration updated');
    setDirty(false);
  }
};
```

### Validation

```typescript
// Frontend validation
const validateConfig = (config: BillingConfig) => {
  if (config.performanceFee < 0 || config.performanceFee > 50) {
    return 'Performance fee must be between 0% and 50%';
  }

  if (config.vatRate < 0 || config.vatRate > 100) {
    return 'VAT rate must be between 0% and 100%';
  }

  if (config.invoiceDueDays <= 0) {
    return 'Invoice due days must be positive';
  }

  return null;
};
```

---

## Performance Considerations

1. **Single-Row Configuration**: Using `id = 1` constraint ensures only one config row exists
2. **Cached Configuration**: Backend should cache billing config in memory/Redis to avoid repeated DB queries
3. **Audit Trail**: All changes logged for compliance and troubleshooting
4. **Gateway Credentials**: Encrypted at rest, never exposed to frontend

---

## Testing Checklist

- [ ] Billing config loads correctly on page load
- [ ] Performance fee slider works (0-50%, 0.5% steps)
- [ ] All dropdowns populate with correct options
- [ ] VAT toggle enables/disables VAT application
- [ ] Save action updates database and shows success message
- [ ] Discard action resets form to original values
- [ ] Dirty state tracking works (buttons appear on edit)
- [ ] Non-admin users cannot access page (redirect or 403)
- [ ] Changes are logged in audit trail
- [ ] Validation prevents invalid fee percentages
- [ ] Gateway credentials remain encrypted
- [ ] Revenue stats display correctly (if implemented)

---

## Business Logic Notes

### Performance Fee Calculation Example

With config:
- `performanceFee`: 20%
- `feeCalculationPeriod`: "monthly"
- `highWatermarkReset`: "annual"

**User Scenario:**
- Month 1: User profit = $1,000 ’ Fee = $200 (20%), High-watermark = $1,000
- Month 2: User profit = -$200 ’ Fee = $0 (loss), High-watermark = $1,000
- Month 3: User profit = $1,500 ’ Fee = $100 (20% of ($1,500 - $1,000) = $500), High-watermark = $1,500
- Annual reset: High-watermark resets to $0

### VAT Calculation Example

With config:
- `vatRate`: 18%
- `vatEnabled`: true

**Invoice Scenario:**
- Subscription fee: $50/month
- VAT: $50 × 0.18 = $9
- Total invoice: $59

---

**[ Previous: Settings](./21-settings.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Settings Infrastructure ’](./23-settings-infrastructure.md)**
