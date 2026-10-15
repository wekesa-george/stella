# Page 21: `/settings` - Settings (Redirect)

**Document Version:** 1.0
**Last Updated:** February 21, 2026
**Route:** `/settings`
**Page Type:** Redirect
**User Persona:** All authenticated users
**Multi-Exchange Impact:** L None (redirect page)

---

## Page Overview

This page is a simple redirect to `/settings/risk`. No UI components or data requirements exist.

---

## Implementation

```typescript
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/risk");
}
```

---

## Analysis Outcome

**No backend requirements.** This is a pure frontend redirect handled by Next.js routing. All settings functionality is implemented on the individual settings sub-pages.

---

**[ê Previous: KYC Providers](./20-kyc-providers.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: Settings Billing í](./22-settings-billing.md)**
