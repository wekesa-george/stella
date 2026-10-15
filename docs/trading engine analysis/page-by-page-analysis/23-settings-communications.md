# Page 23: `/settings/communications` - Communications & Branding

**Route:** `/settings/communications`
**Page Type:** Configuration Management
**User Persona:** Platform Admin
**Real-time Requirements:** No

---

## UI Features & Requirements

**Mock Data Structure from page.tsx:9-18:**

```typescript
const templates = [
  { key: "kyc_approved", name: "KYC Approved", sub: "Sent when user verification succeeds" },
  { key: "kyc_declined", name: "KYC Declined", sub: "Sent when verification is rejected" },
  { key: "kyc_resubmit", name: "KYC Re-Submit", sub: "Sent when re-verification is required" },
  { key: "bot_stopped", name: "Bot Stopped", sub: "Sent when a user's bot is halted" },
  { key: "payment_failed", name: "Payment Failed", sub: "Billing failure notification" },
  { key: "tier_upgraded", name: "Tier Upgraded", sub: "Subscription upgrade confirmation" },
  { key: "welcome", name: "Welcome", sub: "Sent on account creation" },
  { key: "withdrawal", name: "Withdrawal Processed", sub: "Funds withdrawal confirmation" },
];

const emailConfig = {
  senderName: "Stella",
  senderEmail: "noreply@stella.io",
  supportEmail: "support@stella.io",
};
```

**UI Components:**

1. **Email Sender Configuration** (page.tsx:42-71)
   - Sender Name: `"Stella"`
   - Sender Email: `"noreply@stella.io"`
   - Support Email: `"support@stella.io"`

2. **Email Templates List** (page.tsx:74-96)
   - Template selection sidebar with 8 templates
   - Each template shows: name, trigger description
   - Selected template highlighted

3. **Template Editor** (page.tsx:98-134)
   - Subject Line: Editable text with variable support
   - Template Body: Markdown editor with Handlebars variables
   - Available variables: `{{user.first_name}}`, `{{user.email}}`, `{{status}}`, `{{support_email}}`, `{{date}}`
   - Actions: "Send Test Email", "Save Template"

---

## Data Source Mapping

| UI Component | Data Fields | Backend Source | Protocol | Update Frequency |
|--------------|-------------|----------------|----------|------------------|
| **Email Sender Config** | sender_name, sender_email, support_email | `platform.email_settings` | REST API | On page load |
| **Template List** | template_key, name, description, trigger_event | `platform.email_templates` | REST API | On page load |
| **Template Editor: Subject** | subject_line | `platform.email_templates.subject` | REST API | On select |
| **Template Editor: Body** | body_markdown | `platform.email_templates.body_markdown` | REST API | On select |
| **Send Test Email** | Test email delivery | NestJS email service | REST API | On demand |
| **Save Template** | Update template | `platform.email_templates` UPDATE | REST API | On save |

---

## Database Schema Requirements

### New Tables

**1. `platform.email_settings`** (Singleton table)

```sql
CREATE TABLE platform.email_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  sender_name VARCHAR(255) NOT NULL DEFAULT 'Stella',
  sender_email VARCHAR(255) NOT NULL DEFAULT 'noreply@stella.io',
  support_email VARCHAR(255) NOT NULL DEFAULT 'support@stella.io',

  -- SMTP configuration (optional, can use third-party like SendGrid)
  smtp_host VARCHAR(255),
  smtp_port INTEGER,
  smtp_username VARCHAR(255),
  smtp_password_encrypted BYTEA, -- Encrypted with pgcrypto

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT only_one_email_settings CHECK (id = id) -- Enforce singleton
);

CREATE UNIQUE INDEX idx_email_settings_singleton ON platform.email_settings ((1));

-- Insert default row
INSERT INTO platform.email_settings (id, sender_name, sender_email, support_email)
VALUES (uuid_generate_v4(), 'Stella', 'noreply@stella.io', 'support@stella.io')
ON CONFLICT DO NOTHING;
```

**2. `platform.email_templates`**

```sql
CREATE TABLE platform.email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_key VARCHAR(100) UNIQUE NOT NULL, -- 'kyc_approved', 'bot_stopped', etc.

  name VARCHAR(255) NOT NULL,
  description TEXT, -- "Sent when user verification succeeds"
  trigger_event VARCHAR(100), -- Event that triggers this template

  subject_line TEXT NOT NULL,
  body_markdown TEXT NOT NULL, -- Supports Handlebars syntax

  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT template_key_lowercase CHECK (template_key = LOWER(template_key))
);

CREATE INDEX idx_email_templates_active ON platform.email_templates (is_active) WHERE is_active = true;
CREATE UNIQUE INDEX idx_email_templates_key ON platform.email_templates (template_key);
```

**3. `platform.email_logs`** (Audit trail for sent emails)

```sql
CREATE TABLE platform.email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES platform.email_templates(id),

  recipient_user_id UUID REFERENCES auth.users(id),
  recipient_email VARCHAR(255) NOT NULL,

  subject TEXT NOT NULL,
  body_html TEXT NOT NULL, -- Rendered from Markdown

  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
  status_message TEXT, -- Error message if failed

  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (status IN ('pending', 'sent', 'failed', 'bounced'))
);

CREATE INDEX idx_email_logs_recipient ON platform.email_logs (recipient_user_id, created_at DESC);
CREATE INDEX idx_email_logs_status ON platform.email_logs (status, created_at DESC);
CREATE INDEX idx_email_logs_template ON platform.email_logs (template_id, created_at DESC);
```

### Seed Data for Email Templates

```sql
INSERT INTO platform.email_templates (template_key, name, description, trigger_event, subject_line, body_markdown) VALUES
('kyc_approved', 'KYC Approved', 'Sent when user verification succeeds', 'kyc.approved',
  'Your Stella verification is complete',
  'Hi {{user.first_name}},\n\nYour account verification has been approved.\n\nYou can now activate your trading bots and start growing your portfolio.\n\nIf you have questions, contact us at {{support_email}}.\n\n— The Stella Team'),

('kyc_declined', 'KYC Declined', 'Sent when verification is rejected', 'kyc.declined',
  'Your Stella verification requires attention',
  'Hi {{user.first_name}},\n\nUnfortunately, we were unable to verify your account at this time.\n\nReason: {{decline_reason}}\n\nYou can resubmit your documents from your dashboard.\n\nIf you have questions, contact us at {{support_email}}.\n\n— The Stella Team'),

('kyc_resubmit', 'KYC Re-Submit', 'Sent when re-verification is required', 'kyc.resubmit',
  'Action required: Update your Stella verification',
  'Hi {{user.first_name}},\n\nYour account requires re-verification due to {{reverification_reason}}.\n\nPlease submit updated documents within 7 days to avoid account suspension.\n\nIf you have questions, contact us at {{support_email}}.\n\n— The Stella Team'),

('bot_stopped', 'Bot Stopped', 'Sent when a user''s bot is halted', 'bot.stopped',
  'Your Stella bot "{{bot.name}}" has stopped',
  'Hi {{user.first_name}},\n\nYour bot **{{bot.name}}** has been stopped.\n\nReason: {{stop_reason}}\n\nYou can restart it from your dashboard or contact support if this was unexpected.\n\n— The Stella Team'),

('payment_failed', 'Payment Failed', 'Billing failure notification', 'billing.payment_failed',
  'Payment failed for your Stella subscription',
  'Hi {{user.first_name}},\n\nWe were unable to process your payment for the {{tier_name}} subscription.\n\nPlease update your payment method within {{grace_period_days}} days to avoid service interruption.\n\nIf you have questions, contact us at {{support_email}}.\n\n— The Stella Team'),

('tier_upgraded', 'Tier Upgraded', 'Subscription upgrade confirmation', 'billing.tier_upgraded',
  'Welcome to Stella {{tier_name}}!',
  'Hi {{user.first_name}},\n\nYour subscription has been upgraded to **{{tier_name}}**.\n\nNew limits:\n- Max Bots: {{tier.max_bots}}\n- Max AUM: {{tier.max_aum}}\n- API Access: {{tier.api_access}}\n\nEnjoy your upgraded features!\n\n— The Stella Team'),

('welcome', 'Welcome', 'Sent on account creation', 'user.created',
  'Welcome to Stella',
  'Hi {{user.first_name}},\n\nWelcome to Stella! We''re excited to have you.\n\nNext steps:\n1. Complete your KYC verification\n2. Connect your exchange credentials\n3. Create your first trading bot\n\nIf you need help getting started, reach out to {{support_email}}.\n\n— The Stella Team'),

('withdrawal', 'Withdrawal Processed', 'Funds withdrawal confirmation', 'finance.withdrawal',
  'Your withdrawal has been processed',
  'Hi {{user.first_name}},\n\nYour withdrawal of {{amount}} {{currency}} has been processed.\n\nTransaction ID: {{transaction_id}}\nDestination: {{destination}}\n\nFunds should arrive within {{eta_hours}} hours.\n\n— The Stella Team')
ON CONFLICT (template_key) DO NOTHING;
```

---

## NestJS REST API Endpoints

### 1. `GET /api/settings/communications` - Load Email Configuration

**Purpose:** Load email sender settings and all templates
**Authentication:** Admin role required

**Response:**

```typescript
interface CommunicationsSettingsResponse {
  email_settings: {
    sender_name: string;
    sender_email: string;
    support_email: string;
    updated_at: string; // ISO timestamp
  };
  templates: EmailTemplate[];
}

interface EmailTemplate {
  id: string;
  template_key: string; // 'kyc_approved', 'bot_stopped', etc.
  name: string;
  description: string;
  trigger_event: string;
  subject_line: string;
  body_markdown: string;
  is_active: boolean;
  updated_at: string;
}

// GET /api/settings/communications
{
  "email_settings": {
    "sender_name": "Stella",
    "sender_email": "noreply@stella.io",
    "support_email": "support@stella.io",
    "updated_at": "2026-02-21T10:00:00Z"
  },
  "templates": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "template_key": "kyc_approved",
      "name": "KYC Approved",
      "description": "Sent when user verification succeeds",
      "trigger_event": "kyc.approved",
      "subject_line": "Your Stella verification is complete",
      "body_markdown": "Hi {{user.first_name}},\n\n...",
      "is_active": true,
      "updated_at": "2026-02-20T15:30:00Z"
    },
    // ... 7 more templates
  ]
}
```

**Implementation:**

```typescript
async getCommunicationsSettings(): Promise<CommunicationsSettingsResponse> {
  const emailSettings = await this.emailSettingsRepo.findOne({});
  const templates = await this.templatesRepo.find({
    where: { is_active: true },
    order: { template_key: 'ASC' },
  });

  return {
    email_settings: {
      sender_name: emailSettings.sender_name,
      sender_email: emailSettings.sender_email,
      support_email: emailSettings.support_email,
      updated_at: emailSettings.updated_at.toISOString(),
    },
    templates: templates.map(t => ({
      id: t.id,
      template_key: t.template_key,
      name: t.name,
      description: t.description,
      trigger_event: t.trigger_event,
      subject_line: t.subject_line,
      body_markdown: t.body_markdown,
      is_active: t.is_active,
      updated_at: t.updated_at.toISOString(),
    })),
  };
}
```

### 2. `PUT /api/settings/communications/email` - Update Email Sender Config

**Purpose:** Update global email sender settings
**Authentication:** Admin role + audit logging

**Request:**

```typescript
{
  "sender_name": "Stella Platform",
  "sender_email": "noreply@stella.io",
  "support_email": "support@stella.io"
}
```

**Response:**

```typescript
{
  "email_settings": { /* Updated settings */ },
  "message": "Email settings updated successfully"
}
```

**Implementation:**

```typescript
async updateEmailSettings(data: UpdateEmailSettingsDto, adminUserId: string) {
  const settings = await this.emailSettingsRepo.findOne({});

  const updated = await this.emailSettingsRepo.save({
    ...settings,
    sender_name: data.sender_name,
    sender_email: data.sender_email,
    support_email: data.support_email,
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  // Audit log
  await this.auditService.log({
    action: 'email_settings_updated',
    resource_type: 'email_settings',
    resource_id: settings.id,
    admin_user_id: adminUserId,
    metadata: data,
  });

  return { email_settings: updated, message: 'Email settings updated successfully' };
}
```

### 3. `PUT /api/settings/communications/templates/:id` - Update Email Template

**Purpose:** Save changes to an email template
**Authentication:** Admin role + audit logging

**Request:**

```typescript
{
  "subject_line": "Your Stella {{action}} confirmation",
  "body_markdown": "Hi {{user.first_name}},\n\nYour account verification has been {{status}}.\n\n..."
}
```

**Response:**

```typescript
{
  "template": EmailTemplate, // Updated template object
  "message": "Template 'KYC Approved' saved successfully"
}
```

**Implementation:**

```typescript
async updateTemplate(templateId: string, data: UpdateTemplateDto, adminUserId: string) {
  const template = await this.templatesRepo.findOneOrFail({ where: { id: templateId } });

  const updated = await this.templatesRepo.save({
    ...template,
    subject_line: data.subject_line,
    body_markdown: data.body_markdown,
    updated_at: new Date(),
    updated_by_user_id: adminUserId,
  });

  // Audit log
  await this.auditService.log({
    action: 'email_template_updated',
    resource_type: 'email_template',
    resource_id: templateId,
    admin_user_id: adminUserId,
    metadata: { template_key: template.template_key, changes: data },
  });

  return { template: updated, message: `Template '${updated.name}' saved successfully` };
}
```

### 4. `POST /api/settings/communications/templates/:id/test` - Send Test Email

**Purpose:** Send a test email using the template with sample data
**Authentication:** Admin role

**Request:**

```typescript
{
  "recipient_email": "admin@stella.io"
}
```

**Response:**

```typescript
{
  "status": "sent",
  "message": "Test email sent to admin@stella.io",
  "preview": {
    "subject": "Your Stella approval confirmation",
    "body_html": "<p>Hi John,</p><p>Your account verification has been approved.</p>..."
  }
}
```

**Implementation:**

```typescript
async sendTestEmail(templateId: string, recipientEmail: string, adminUserId: string) {
  const template = await this.templatesRepo.findOneOrFail({ where: { id: templateId } });
  const emailSettings = await this.emailSettingsRepo.findOne({});

  // Sample data for test
  const sampleData = {
    user: { first_name: 'John', email: 'john@example.com' },
    status: 'approved',
    support_email: emailSettings.support_email,
    date: new Date().toLocaleDateString(),
  };

  // Render template with Handlebars
  const Handlebars = require('handlebars');
  const subjectTemplate = Handlebars.compile(template.subject_line);
  const bodyTemplate = Handlebars.compile(template.body_markdown);

  const subject = subjectTemplate(sampleData);
  const bodyMarkdown = bodyTemplate(sampleData);
  const bodyHtml = this.markdownService.toHtml(bodyMarkdown);

  // Send via email service (SendGrid, SES, etc.)
  await this.emailService.send({
    from: `${emailSettings.sender_name} <${emailSettings.sender_email}>`,
    to: recipientEmail,
    subject: subject,
    html: bodyHtml,
  });

  // Log audit
  await this.auditService.log({
    action: 'test_email_sent',
    resource_type: 'email_template',
    resource_id: templateId,
    admin_user_id: adminUserId,
    metadata: { recipient_email: recipientEmail, template_key: template.template_key },
  });

  return {
    status: 'sent',
    message: `Test email sent to ${recipientEmail}`,
    preview: { subject, body_html: bodyHtml },
  };
}
```

---

## Email Sending Service Integration

### Handlebars Template Rendering

```typescript
// email.service.ts
import Handlebars from 'handlebars';
import { marked } from 'marked';

export class EmailService {
  async sendFromTemplate(
    templateKey: string,
    recipientUserId: string,
    data: Record<string, any>
  ) {
    const template = await this.templatesRepo.findOneOrFail({
      where: { template_key: templateKey, is_active: true },
    });

    const user = await this.usersRepo.findOneOrFail({ where: { id: recipientUserId } });
    const emailSettings = await this.emailSettingsRepo.findOne({});

    // Merge user data with provided data
    const templateData = {
      user: {
        first_name: user.first_name,
        email: user.email,
        ...data.user,
      },
      support_email: emailSettings.support_email,
      date: new Date().toLocaleDateString(),
      ...data,
    };

    // Render subject and body
    const subjectTemplate = Handlebars.compile(template.subject_line);
    const bodyTemplate = Handlebars.compile(template.body_markdown);

    const subject = subjectTemplate(templateData);
    const bodyMarkdown = bodyTemplate(templateData);
    const bodyHtml = marked(bodyMarkdown);

    // Send email
    await this.emailProvider.send({
      from: `${emailSettings.sender_name} <${emailSettings.sender_email}>`,
      to: user.email,
      subject: subject,
      html: bodyHtml,
    });

    // Log sent email
    await this.emailLogsRepo.save({
      template_id: template.id,
      recipient_user_id: user.id,
      recipient_email: user.email,
      subject: subject,
      body_html: bodyHtml,
      status: 'sent',
      sent_at: new Date(),
    });
  }
}
```

### Usage Examples

**Send KYC Approved Email:**

```typescript
await emailService.sendFromTemplate('kyc_approved', userId, {
  user: { first_name: 'Jane' },
});
```

**Send Bot Stopped Email:**

```typescript
await emailService.sendFromTemplate('bot_stopped', userId, {
  bot: { name: 'Grid Bot #1' },
  stop_reason: 'Max drawdown limit reached',
});
```

**Send Payment Failed Email:**

```typescript
await emailService.sendFromTemplate('payment_failed', userId, {
  tier_name: 'Pro',
  grace_period_days: 3,
});
```

---

## Data Flow Summary

```
[Page Load]
   │
   └─> GET /api/settings/communications (NestJS)
         │
         ├─> Query platform.email_settings (PostgreSQL)
         ├─> Query platform.email_templates WHERE is_active = true
         └─> Return { email_settings, templates[] }

[Admin Action: Update Email Sender Config]
   │
   └─> PUT /api/settings/communications/email (NestJS)
         │
         ├─> Update platform.email_settings (PostgreSQL)
         ├─> Log audit trail
         └─> Return updated settings

[Admin Action: Update Template]
   │
   └─> PUT /api/settings/communications/templates/:id (NestJS)
         │
         ├─> Update platform.email_templates (PostgreSQL)
         ├─> Log audit trail
         └─> Return updated template

[Admin Action: Send Test Email]
   │
   └─> POST /api/settings/communications/templates/:id/test (NestJS)
         │
         ├─> Render template with Handlebars + sample data
         ├─> Convert Markdown to HTML (marked)
         ├─> Send via email provider (SendGrid/SES)
         ├─> Log audit trail
         └─> Return {status: 'sent', preview: {...}}

[Background: Trigger Event (e.g., KYC Approved)]
   │
   └─> Phoenix/NestJS emits event "kyc.approved"
         │
         └─> Email Service listens to event
               │
               ├─> Fetch template WHERE trigger_event = 'kyc.approved'
               ├─> Render template with user data
               ├─> Send email
               └─> Log to platform.email_logs
```

---

## Summary Table

| Feature | Data Source | Backend System | Protocol | Caching |
|---------|-------------|----------------|----------|---------|
| Email sender config | `platform.email_settings` | NestJS REST | HTTP | No cache (singleton) |
| Email templates list | `platform.email_templates` | NestJS REST | HTTP | No cache |
| Update email config | `platform.email_settings` UPDATE | NestJS REST | HTTP | No cache |
| Update template | `platform.email_templates` UPDATE | NestJS REST | HTTP | No cache |
| Send test email | Email service (SendGrid/SES) | NestJS REST | HTTP | No cache |
| Email logs | `platform.email_logs` | NestJS REST | HTTP | No cache |

---

## Frontend Implementation Notes

**Load Communications Settings:**

```typescript
// hooks/useCommunicationsSettings.ts
export function useCommunicationsSettings() {
  const [emailSettings, setEmailSettings] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('kyc_approved');

  useEffect(() => {
    fetch('/api/settings/communications')
      .then(res => res.json())
      .then(data => {
        setEmailSettings(data.email_settings);
        setTemplates(data.templates);
      });
  }, []);

  return { emailSettings, templates, selectedTemplate, setSelectedTemplate };
}
```

**Update Template:**

```typescript
async function saveTemplate(templateId: string, updates: { subject_line: string; body_markdown: string }) {
  const response = await fetch(`/api/settings/communications/templates/${templateId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  const result = await response.json();
  toast.success(result.message);
}
```

**Send Test Email:**

```typescript
async function sendTestEmail(templateId: string, recipientEmail: string) {
  const response = await fetch(`/api/settings/communications/templates/${templateId}/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ recipient_email: recipientEmail }),
  });

  const result = await response.json();
  toast.success(result.message);
}
```

---

## Performance Considerations

1. **Template Caching:** Cache rendered templates in Redis with user-specific data for 5 minutes to avoid re-rendering on every email send.

2. **Email Queue:** Use Bull/BullMQ to queue email sends for background processing. Don't send emails synchronously during API requests.

3. **Rate Limiting:** Implement rate limits on test email endpoint (max 10 per admin per hour) to prevent abuse.

4. **Email Logs Partitioning:** Partition `platform.email_logs` by month for performance as table grows.

```sql
CREATE TABLE platform.email_logs_2026_02 PARTITION OF platform.email_logs
FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

5. **Bulk Sends:** For system-wide emails (announcements), use batch processing with throttling to avoid hitting email provider rate limits.

---

## Testing Checklist

- [ ] Email sender config loads correctly
- [ ] Template list displays all 8 templates
- [ ] Clicking a template loads its subject and body
- [ ] Template editor supports Handlebars syntax highlighting
- [ ] Save template updates database and shows success message
- [ ] Send test email delivers to specified address
- [ ] Test email uses sample data correctly
- [ ] Markdown is converted to HTML properly
- [ ] Update email sender config persists changes
- [ ] Audit logs capture all template and config changes
- [ ] Email variables ({{user.first_name}}) render correctly
- [ ] Conditional blocks ({{#if approved}}) work in templates
- [ ] Email logs table records sent emails with status
- [ ] Failed emails are logged with error message

---

**[← Previous: KYC Providers](./20-kyc-providers.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Compliance →](./24-settings-compliance.md)**
