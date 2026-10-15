## Page 18: `/kyc-review` - KYC Review Redirect

### Page Type
**Redirect Page** - This page automatically redirects to `/kyc-review/applicants`

### Implementation
```typescript
import { redirect } from "next/navigation";

export default function KYCReviewPage() {
  redirect("/kyc-review/applicants");
}
```

### Purpose
Default landing point for KYC review section, immediately redirects to the applicant review page.

### Navigation Flow
- User visits `/kyc-review`
- Automatically redirected to `/kyc-review/applicants`
- No data fetching required

---

**[← Previous: Finance Users](./17-finance-users.md)** | **[Back to Index](./00-INDEX.md)** | **[Next: KYC Applicants →](./19-kyc-applicants.md)**
