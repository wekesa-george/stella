---
name: modern-frontend-ux
description: >
  Design and build modern, production-grade frontend interfaces with elite UX.
  Use this skill when the user asks to build UI components, pages, design
  systems, dashboards, forms, onboarding flows, data visualizations, or any
  user-facing interface. Goes beyond aesthetics — covers interaction design,
  accessibility, motion, responsive layout, component architecture, and
  performance. Produces interfaces that feel premium, fast, and human.
---

# Modern Frontend Design & UX Skill

This skill produces **production-grade frontend interfaces** that combine
strong visual design with thoughtful user experience engineering. It applies
to React, SvelteKit, Vue, plain HTML/CSS/JS, and any other frontend context.

---

## Phase 1 — Understand Before You Build

Before writing a single line of code, answer these questions:

### 1.1 User & Context
- **Who is the user?** (developer, patient, student, finance pro, casual consumer)
- **What is their goal?** (complete a task, explore data, learn something, make a decision)
- **What device and environment?** (desktop-first, mobile-first, touch, keyboard-heavy)
- **What emotional state arrives with them?** (stressed, exploratory, time-pressured, confused)

### 1.2 Interaction Model
Pick the dominant interaction paradigm early and commit:

| Model | When to use |
|---|---|
| **Form-driven** | Sequential data input with validation (signup, checkout, loan application) |
| **Dashboard/Data** | Read-heavy with filters, charts, and drill-down |
| **CRUD/Table** | Records management — list, create, edit, delete |
| **Wizard/Stepper** | Complex multi-step flows with branching logic |
| **Canvas/Spatial** | Free-form placement, drag-and-drop, visual editors |
| **Conversational** | Chat, prompts, command palette |
| **Content/Editorial** | Reading-optimized, long-form, media-rich |

### 1.3 Design Constraints
- Framework, design system, or component library in use
- Brand tokens (colors, fonts, radius, spacing scale) if provided
- Accessibility requirements (WCAG AA minimum unless specified)
- Performance budget (Lighthouse score target, bundle size)

---

## Phase 2 — Visual Design Decisions

### 2.1 Establish a Visual Language

Choose and commit to a **design personality**. Never be neutral or timid:

- **Minimal/Swiss** — stark whitespace, geometric sans, strict grid, hairline rules
- **Warm/Organic** — soft radii, earthy palettes, humanist typefaces, gentle gradients
- **Editorial/Magazine** — large display type, asymmetric layout, photographic tension
- **Technical/Data-Dense** — monospace accents, tabular precision, compact sizing, muted tones
- **Playful/Consumer** — bold color pops, rounded shapes, expressive iconography, lively motion
- **Premium/Refined** — generous spacing, subtle textures, precise kerning, restrained color
- **Brutalist/Raw** — intentional crudeness, high contrast, broken grids, visible structure

> **Rule**: Pick one direction and execute it with discipline. A mediocre version of every style beats a confused combination.

### 2.2 Color System

Always define a token-based color system:

```css
:root {
  /* Brand */
  --color-primary:        hsl(224 71% 48%);
  --color-primary-hover:  hsl(224 71% 42%);
  --color-primary-subtle: hsl(224 71% 96%);

  /* Neutrals — build a full scale */
  --color-neutral-50:  hsl(220 14% 96%);
  --color-neutral-100: hsl(220 13% 91%);
  --color-neutral-200: hsl(220 11% 83%);
  --color-neutral-400: hsl(220 9%  58%);
  --color-neutral-700: hsl(220 9%  35%);
  --color-neutral-900: hsl(220 9%  12%);

  /* Semantic */
  --color-success: hsl(142 72% 29%);
  --color-warning: hsl(38  92% 40%);
  --color-error:   hsl(0   72% 45%);
  --color-info:    hsl(210 92% 40%);

  /* Surfaces */
  --surface-base:    hsl(0 0% 100%);
  --surface-raised:  hsl(220 14% 98%);
  --surface-overlay: hsl(220 14% 96%);
}
```

**Rules for color**:
- Use 1 dominant brand hue, 1 accent, and a full neutral scale
- Never use more than 3 hues in a composition unless data-visualization demands it
- All text must pass WCAG AA contrast (4.5:1 for body, 3:1 for large text)
- Dark mode: invert surface layers, preserve brand hue, shift neutrals

### 2.3 Typography System

Pick a type scale and never deviate from it:

```css
/* Scale — use a 1.250 Major Third ratio */
--text-xs:   0.640rem;  /* 10px — labels, captions */
--text-sm:   0.800rem;  /* 13px — secondary info */
--text-base: 1.000rem;  /* 16px — body copy */
--text-lg:   1.250rem;  /* 20px — lead paragraphs */
--text-xl:   1.563rem;  /* 25px — section headers */
--text-2xl:  1.953rem;  /* 31px — page titles */
--text-3xl:  2.441rem;  /* 39px — hero headlines */
--text-4xl:  3.052rem;  /* 49px — display */

/* Weights */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;

/* Line heights */
--leading-tight:  1.25;
--leading-snug:   1.375;
--leading-normal: 1.5;
--leading-relaxed:1.625;
```

**Font pairing rules**:
- Match font personality to design direction
- Display font for headings + body font for copy = almost always right
- Monospace for code, data, timestamps, IDs
- Avoid: Inter, Roboto, Arial for any heading role — they're invisible
- Use: variable fonts where performance matters, subset aggressively

### 2.4 Spacing & Layout

Use an **8pt grid system**:

```
4px  — micro (icon padding, tight gaps)
8px  — xs (inline gaps, tight compound components)
12px — sm (component internal padding)
16px — md (card padding, section gaps)
24px — lg (section separation)
32px — xl (major section breaks)
48px — 2xl (page-level breathing room)
64px — 3xl (hero sections)
```

Layout philosophy:
- **Content-first layout**: sizing driven by content, not arbitrary dimensions
- **Consistent margins**: one layout max-width, one set of page gutters
- Use CSS Grid for page layout, Flexbox for component layout
- Avoid fixed heights on containers — let content breathe

---

## Phase 3 — UX Interaction Patterns

### 3.1 Forms

Forms are the most critical UX surface. Apply these rules without exception:

**Validation behavior**:
- Validate **on blur** (not on keystroke, not only on submit)
- Show inline errors immediately below the field
- Show success states sparingly — only when it reassures (e.g., password strength, username availability)
- On submit error: scroll to first error, focus it, announce to screen readers

**Field design**:
- Label above the field, always — never placeholder-only labels
- Placeholder text = example value only (e.g., `e.g., john@example.com`)
- Required fields: asterisk + legend, not just asterisk
- Autofocus first field on page load when form is primary content
- Use `autocomplete` attributes correctly on all fields

**Error messages**:
```
❌ "Invalid input"           → tells nothing
❌ "Error in field"          → patronizing
✅ "Phone number must include country code, e.g. +256 700 000000"
✅ "Password must be at least 8 characters and include one number"
```

**Multi-step forms**:
- Show progress (step X of Y or a visual stepper)
- Allow backward navigation without data loss
- Auto-save draft state to localStorage or session
- Summarize all inputs before final submission

### 3.2 Loading States

Every async action needs a loading state. No exceptions.

| Scenario | Pattern |
|---|---|
| Initial page load | Skeleton screens (not spinners) |
| Data refetch (already has data) | Subtle spinner in corner, keep existing content |
| Form submit | Disable submit button + button loading state |
| Background sync | Unobtrusive toast or status indicator |
| Long operation (>3s) | Progress bar with estimated time if possible |
| Optimistic updates | Apply change immediately, rollback on error |

**Skeleton screen rules**:
- Match the exact layout of the real content
- Animate with a shimmer (left-to-right gradient sweep)
- Never use generic spinner for primary content areas

### 3.3 Empty States

An empty state is a design opportunity, not an afterthought:

```
┌─────────────────────────────────┐
│                                 │
│        [Contextual Icon]        │
│                                 │
│    You haven't added any        │
│    loans yet                    │
│                                 │
│    Loans you create will        │
│    appear here for tracking.    │
│                                 │
│    [+ Create First Loan]        │
│                                 │
└─────────────────────────────────┘
```

Rules:
- Icon or illustration relevant to the content type
- Headline: state what's missing (not "No data found")
- Body: explain why it's empty + what to do
- CTA: direct action to fill the empty state
- No empty state for filtered results — show "No results for X" + "Clear filters"

### 3.4 Error States

Design for failure at every level:

**API / network errors**:
- Show a human-readable error message (not status codes)
- Offer a retry action
- Preserve form data — never wipe what the user typed

**404 / Not Found**:
- Explain what happened
- Offer navigation back (home, previous page)
- Suggest related content if possible

**Permission errors**:
- Tell the user what they can't do and why
- Offer an escalation path (contact admin, upgrade plan)

**Critical system error**:
- Error boundary catches JS crashes
- Show a non-technical message + option to reload

### 3.5 Notifications & Feedback

Use the right feedback mechanism for each situation:

| Trigger | Mechanism | Duration |
|---|---|---|
| Form field validation | Inline error below field | Until corrected |
| Successful action | Toast (bottom-right) | 3–4 seconds |
| Destructive action completed | Toast + Undo | 5 seconds |
| Background operation status | Status bar / progress | Until complete |
| System-wide alert | Banner (top of page) | Until dismissed |
| Confirmation required | Modal dialog | Until user chooses |
| Non-blocking info | Tooltip / popover | On hover/focus |

**Toast rules**:
- Max 1 toast visible at a time
- Stack newer toasts above older
- Pause auto-dismiss on hover
- Always provide dismiss (×) button
- Never use toasts for errors that require action

---

## Phase 4 — Component Architecture

### 4.1 Component Principles

- **Single responsibility**: one component = one job
- **Composable over configurable**: prefer small composable pieces over a mega-component with 30 props
- **Controlled > Uncontrolled** for complex state
- **Polymorphic roots**: use `as` prop or similar for semantic flexibility
- **Data down, events up**: clear unidirectional data flow

### 4.2 Component Anatomy

Every reusable component should have:

```
ComponentName/
├── ComponentName.tsx        # Main component
├── ComponentName.types.ts   # Props interface, enums
├── ComponentName.test.tsx   # Unit tests (at minimum smoke test)
└── index.ts                 # Public exports
```

Props interface conventions:
```ts
interface ButtonProps {
  // Functionality
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;

  // Content
  children: React.ReactNode;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';

  // Accessibility
  'aria-label'?: string;

  // Escape hatch
  className?: string;
}
```

### 4.3 Common Component Patterns

**Compound Components** (for complex UI):
```tsx
<Select>
  <Select.Trigger />
  <Select.Content>
    <Select.Item value="ug">Uganda</Select.Item>
    <Select.Item value="ke">Kenya</Select.Item>
  </Select.Content>
</Select>
```

**Render Props / Headless** (for logic reuse without style opinion):
```tsx
<Combobox
  items={loanOfficers}
  renderItem={(officer) => (
    <div className="flex gap-2">
      <Avatar src={officer.avatar} />
      <span>{officer.name}</span>
    </div>
  )}
/>
```

**Data + Presentation separation**:
```tsx
// Data layer
function LoanListContainer() {
  const { data, loading, error } = useLoanList();
  return <LoanList loans={data} loading={loading} error={error} />;
}

// Presentation layer — pure, testable, storybook-friendly
function LoanList({ loans, loading, error }: LoanListProps) { ... }
```

---

## Phase 5 — Motion & Micro-interactions

### 5.1 Motion Philosophy

Motion communicates state. Every animation must have a **reason**:

| Purpose | Example |
|---|---|
| Communicate hierarchy | Parent expands to reveal children |
| Confirm action | Button press → subtle scale + opacity |
| Guide attention | New item slides in from edge |
| Indicate process | Progress bar fills, spinner rotates |
| Prevent jarring cuts | Cross-fade between views |
| Delight | Confetti on milestone, subtle bounce |

### 5.2 Motion Tokens

```css
:root {
  /* Duration */
  --duration-instant:  50ms;   /* hover states, cursor feedback */
  --duration-fast:     150ms;  /* small component transitions */
  --duration-normal:   250ms;  /* standard transitions */
  --duration-slow:     400ms;  /* page transitions, reveals */
  --duration-deliberate: 600ms; /* onboarding, celebration */

  /* Easing */
  --ease-out:   cubic-bezier(0.0, 0.0, 0.2, 1);  /* elements entering */
  --ease-in:    cubic-bezier(0.4, 0.0, 1.0, 1);  /* elements leaving */
  --ease-inout: cubic-bezier(0.4, 0.0, 0.2, 1);  /* position changes */
  --ease-spring:cubic-bezier(0.34, 1.56, 0.64, 1); /* playful bounce */
}
```

### 5.3 Interaction Micro-animations

**Button hover/active** (CSS):
```css
.btn {
  transition: background-color var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}
.btn:hover  { transform: translateY(-1px); box-shadow: 0 4px 12px ...;  }
.btn:active { transform: translateY(0);    box-shadow: 0 1px 4px  ...; }
```

**Page/route transitions**:
```tsx
// With Framer Motion or GSAP
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -16 }}
  transition={{ duration: 0.25, ease: [0.0, 0.0, 0.2, 1] }}
>
  {children}
</motion.div>
```

**List item stagger**:
```tsx
{items.map((item, i) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.05, duration: 0.2 }}
  >
    <LoanCard loan={item} />
  </motion.div>
))}
```

**Always respect `prefers-reduced-motion`**:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Phase 6 — Accessibility (a11y)

Accessibility is not optional. These are engineering requirements, not nice-to-haves.

### 6.1 Core Requirements (WCAG AA)

- **Color contrast**: 4.5:1 for body text, 3:1 for large text and UI components
- **Keyboard navigation**: every interactive element reachable and operable via keyboard
- **Focus visible**: never remove focus ring — style it to match design if needed
- **Screen reader support**: meaningful alt text, ARIA labels for icon-only buttons
- **Motion**: respect `prefers-reduced-motion`
- **Touch targets**: minimum 44×44px on mobile

### 6.2 Semantic HTML First

Use native elements before ARIA:

```html
<!-- ✅ Native button — keyboard, focus, click, all handled -->
<button type="button" onclick="handleClick()">Submit Loan</button>

<!-- ❌ Div button — needs tabindex, keydown, role, aria-pressed manually -->
<div onclick="handleClick()">Submit Loan</div>
```

Landmark regions:
```html
<header role="banner">     <!-- site header -->
<nav role="navigation">    <!-- primary nav -->
<main role="main">         <!-- page content -->
<aside role="complementary"> <!-- sidebar -->
<footer role="contentinfo"> <!-- site footer -->
```

### 6.3 ARIA Patterns for Custom Components

**Modal dialog**:
```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>
  <h2 id="modal-title">Confirm Loan Disbursement</h2>
  <p id="modal-description">This will release UGX 5,000,000 to the borrower.</p>
</div>
```

**Live regions** (for dynamic content):
```html
<!-- Status messages — polite (waits for current speech) -->
<div role="status" aria-live="polite" aria-atomic="true">
  {{ statusMessage }}
</div>

<!-- Urgent alerts — assertive (interrupts) -->
<div role="alert" aria-live="assertive">
  {{ errorMessage }}
</div>
```

**Custom combobox/select** — use `aria-expanded`, `aria-haspopup`, `aria-autocomplete`, `aria-activedescendant`.

### 6.4 Focus Management

- Trap focus inside modals and drawers
- Return focus to trigger element when dialog closes
- After route change: move focus to main content area or new page heading
- After dynamic content insertion: move focus to new content if user-triggered

---

## Phase 7 — Responsive Design

### 7.1 Breakpoint System

```css
/* Mobile-first breakpoints */
--bp-sm:  640px;   /* large phone landscape */
--bp-md:  768px;   /* tablet portrait */
--bp-lg:  1024px;  /* tablet landscape / small desktop */
--bp-xl:  1280px;  /* desktop */
--bp-2xl: 1536px;  /* large desktop */
```

Design at these viewports: 375px (iPhone SE), 768px (iPad), 1280px (desktop).

### 7.2 Responsive Patterns

**Fluid typography** (scales without breakpoints):
```css
h1 {
  font-size: clamp(1.75rem, 4vw + 0.5rem, 3.5rem);
}
```

**Container query** (component-based, not viewport-based):
```css
@container (min-width: 400px) {
  .card { display: grid; grid-template-columns: auto 1fr; }
}
```

**Responsive table** — for data-dense tables on mobile:
- Option A: horizontal scroll container
- Option B: card stack view at mobile (each row → card)
- Option C: hide secondary columns, expose on row expand

### 7.3 Touch Considerations

- Tap targets: minimum 44×44px
- No hover-only interactions — all hover states also have a tap equivalent
- Swipe gestures: add visual affordance (swipeable cards show peeking edge)
- Bottom navigation for mobile (thumb-reach zone)
- Avoid multi-finger gestures for primary actions

---

## Phase 8 — Performance

### 8.1 Perceived Performance

| Technique | Effect |
|---|---|
| Skeleton screens | Feels faster than blank → spinner |
| Optimistic updates | Instant feedback, rollback on error |
| Route prefetching | Near-instant navigation |
| Progressive loading | Show meaningful content before full load |
| `content-visibility: auto` | Defer off-screen rendering |

### 8.2 Asset Optimization

- Images: use `<picture>` with WebP/AVIF, proper `width`/`height`, `loading="lazy"` below fold
- Fonts: `font-display: swap`, subset to used characters, preload critical fonts
- Icons: SVG sprite or component-based (no icon fonts)
- JS: code-split by route, dynamic import for heavy libraries
- CSS: critical CSS inline, remaining deferred

### 8.3 Core Web Vitals Targets

| Metric | Target | What it measures |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5s | Perceived load speed |
| CLS (Cumulative Layout Shift) | < 0.1 | Visual stability |
| INP (Interaction to Next Paint) | < 200ms | Responsiveness |
| FID (First Input Delay) | < 100ms | Input responsiveness |

CLS prevention:
- Always set `width`/`height` on images and videos
- Reserve space for async content (min-height or skeleton)
- Never inject content above existing content

---

## Phase 9 — Design System Integration

### 9.1 Token Architecture

Tokens flow from global → semantic → component:

```
Global:   --blue-600: hsl(224 71% 48%)
             ↓
Semantic: --color-primary: var(--blue-600)
             ↓
Component:--btn-bg: var(--color-primary)
```

Never reference global tokens in components directly. Always go through semantic layer.

### 9.2 Component Variants

Use a class variance authority pattern (CVA or similar):

```ts
const buttonVariants = cva(
  // Base classes
  'inline-flex items-center justify-center rounded font-medium transition-colors',
  {
    variants: {
      variant: {
        primary:   'bg-primary text-white hover:bg-primary-hover',
        secondary: 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200',
        ghost:     'text-primary hover:bg-primary-subtle',
        danger:    'bg-error text-white hover:bg-error-hover',
      },
      size: {
        sm: 'h-8  px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-12 px-6 text-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);
```

### 9.3 Dark Mode

Implement via CSS custom properties on `[data-theme="dark"]` or `@media (prefers-color-scheme: dark)`:

```css
[data-theme="dark"] {
  --surface-base:      hsl(224 10% 10%);
  --surface-raised:    hsl(224 10% 14%);
  --surface-overlay:   hsl(224 10% 18%);
  --color-neutral-900: hsl(220 9% 94%);   /* flip text */
  --color-neutral-50:  hsl(220 9% 14%);   /* flip backgrounds */
  /* brand hues stay, adjust lightness */
  --color-primary:     hsl(224 71% 60%);
}
```

---

## Phase 10 — Code Quality & Handoff

### 10.1 Code Standards

- TypeScript: strict mode, no `any`, explicit return types on exported functions
- Component names: PascalCase; files: PascalCase or kebab-case (consistent)
- CSS: custom properties for all design tokens; no magic numbers
- No inline styles except dynamic computed values
- Co-locate CSS modules / styled components with component file

### 10.2 Documentation Inline

```tsx
/**
 * LoanStatusBadge — displays the current status of a loan application.
 *
 * @example
 * <LoanStatusBadge status="approved" />
 * <LoanStatusBadge status="pending" showIcon />
 */
export function LoanStatusBadge({ status, showIcon = false }: LoanStatusBadgeProps) {
```

### 10.3 Final Checklist

Before delivering, verify:

**Visual**
- [ ] Design tokens applied consistently (no hardcoded hex values)
- [ ] Responsive at 375px, 768px, 1280px
- [ ] Dark mode works (if applicable)
- [ ] Loading, empty, and error states designed

**Interaction**
- [ ] All interactive elements have hover, focus, active states
- [ ] Form validation with clear error messages
- [ ] Loading states on all async actions
- [ ] Keyboard navigable end-to-end

**Accessibility**
- [ ] Color contrast passes WCAG AA
- [ ] Focus visible at all times
- [ ] Screen reader labels on all interactive elements
- [ ] `prefers-reduced-motion` respected

**Performance**
- [ ] Images have `width`, `height`, `loading="lazy"` (except above fold)
- [ ] No layout shift on load
- [ ] Heavy libraries are code-split

---

## Quick Reference — Anti-Patterns to Avoid

| Anti-pattern | Fix |
|---|---|
| Placeholder as label | Label above field, placeholder = example |
| `div` as button | Use `<button>` |
| Error only on submit | Validate on blur + show inline |
| Spinner for primary content | Skeleton screen |
| `color: gray` for disabled | `opacity: 0.5` + `cursor: not-allowed` |
| Fixed `px` font sizes | `rem` based on root (respects user font settings) |
| Missing focus style | Style the focus ring, don't remove it |
| Animation no reduced-motion | `@media (prefers-reduced-motion: reduce)` |
| Toast for errors needing action | Inline error or persistent banner |
| Z-index wars | Defined z-index scale in tokens |
| Hardcoded breakpoints in JS | CSS container queries + ResizeObserver |
| `!important` in component CSS | Fix specificity at the source |
