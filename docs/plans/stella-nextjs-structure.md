# Stella User Portal — Next.js App Router Structure

## Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + CSS Variables
- **State**: Zustand (client state) + TanStack Query (server state / real-time)
- **Real-time**: WebSocket via custom hook wrapping the Stella WS feed
- **Auth**: Logto OAuth2 — fully external. This app receives and validates the Logto JWT only. No login/signup UI lives here.
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod
- **Notifications**: Sonner (toast) + custom alert drawer

---

## Folder Structure

```
stella-portal/
├── app/                                    # Next.js App Router root
│   │
│   ├── (onboarding)/                       # Onboarding route group — step layout
│   │   ├── layout.tsx                      # Onboarding shell: progress bar, step nav, logo only
│   │   └── onboarding/
│   │       ├── page.tsx                    # Redirect to first incomplete step
│   │       ├── kyc/
│   │       │   └── page.tsx                # Step 1: KYC wizard (identity → doc → selfie → review)
│   │       ├── plan/
│   │       │   └── page.tsx                # Step 2: Tier selection (One / Unum / Eon / Plenum)
│   │       ├── connect-exchange/
│   │       │   └── page.tsx                # Step 3: Exchange connection wizard
│   │       └── allocate-capital/
│   │           └── page.tsx                # Step 4: Set trading budget per exchange
│   │
│   ├── (portal)/                           # Main portal route group — sidebar layout
│   │   ├── layout.tsx                      # Portal shell: sidebar, topbar, notification drawer
│   │   │
│   │   ├── dashboard/
│   │   │   └── page.tsx                    # Home: portfolio summary, bot grid, positions, feed
│   │   │
│   │   ├── bots/
│   │   │   ├── page.tsx                    # Bot list: all bots with status cards
│   │   │   ├── new/
│   │   │   │   └── page.tsx                # Bot creation wizard
│   │   │   └── [botId]/
│   │   │       ├── page.tsx                # Bot detail: status, controls, live positions
│   │   │       ├── performance/
│   │   │       │   └── page.tsx            # Equity curve, trade history, metrics
│   │   │       ├── settings/
│   │   │       │   └── page.tsx            # Strategy params, risk config, pair selection
│   │   │       └── activity/
│   │   │           └── page.tsx            # Full trade/event log for this bot
│   │   │
│   │   ├── strategies/
│   │   │   ├── page.tsx                    # Strategy marketplace / available strategies
│   │   │   └── [strategyId]/
│   │   │       └── page.tsx                # Strategy detail: description, perf, backtest charts
│   │   │
│   │   ├── positions/
│   │   │   └── page.tsx                    # All open positions across all bots
│   │   │
│   │   ├── analytics/
│   │   │   ├── page.tsx                    # Portfolio analytics overview
│   │   │   ├── returns/
│   │   │   │   └── page.tsx                # Equity curve, benchmark comparison
│   │   │   ├── trades/
│   │   │   │   └── page.tsx                # Trade breakdown: by pair, time, win rate
│   │   │   └── fees/
│   │   │       └── page.tsx                # Fee report: exchange fees vs platform fees
│   │   │
│   │   ├── capital/
│   │   │   ├── page.tsx                    # Capital management overview
│   │   │   ├── allocations/
│   │   │   │   └── page.tsx                # Per-bot allocation sliders
│   │   │   └── exchanges/
│   │   │       └── page.tsx                # Manage connected exchange credentials
│   │   │
│   │   ├── risk/
│   │   │   └── page.tsx                    # User risk controls: loss limits, drawdown, profit-take
│   │   │
│   │   ├── stella-one/                     # Only rendered for stella_one tier users
│   │   │   ├── page.tsx                    # Pool dashboard: allocation, P&L, Stella's share
│   │   │   └── withdraw/
│   │   │       └── page.tsx                # Withdrawal request form
│   │   │
│   │   ├── account/
│   │   │   ├── page.tsx                    # Account overview
│   │   │   ├── profile/
│   │   │   │   └── page.tsx                # Display name, timezone, currency, language
│   │   │   ├── notifications/
│   │   │   │   └── page.tsx                # Alert prefs: email, SMS, push, WhatsApp
│   │   │   └── referrals/
│   │   │       └── page.tsx                # Referral link, commissions earned
│   │   │
│   │   ├── billing/
│   │   │   ├── page.tsx                    # Subscription overview, current plan
│   │   │   ├── plans/
│   │   │   │   └── page.tsx                # Plan comparison + upgrade/downgrade
│   │   │   ├── invoices/
│   │   │   │   └── page.tsx                # Invoice history with PDF download
│   │   │   └── tax/
│   │   │       └── page.tsx                # Tax report export (CSV/formatted)
│   │   │
│   │   └── help/
│   │       ├── page.tsx                    # Help centre / getting started checklist
│   │       └── [slug]/
│   │           └── page.tsx                # Strategy explainers, in-depth guides
│   │
│   ├── api/                                # BFF layer — proxies to NestJS, injects auth token
│   │   ├── me/
│   │   │   └── route.ts                    # GET: returns verified JWT claims to client
│   │   ├── bots/
│   │   │   ├── route.ts                    # GET list, POST create
│   │   │   └── [botId]/
│   │   │       ├── route.ts                # GET, PATCH, DELETE
│   │   │       ├── stop/
│   │   │       │   └── route.ts            # POST: force stop bot
│   │   │       └── close-positions/
│   │   │           └── route.ts            # POST: close all positions for bot
│   │   ├── positions/
│   │   │   └── route.ts                    # GET all open positions
│   │   ├── portfolio/
│   │   │   ├── summary/
│   │   │   │   └── route.ts                # GET portfolio totals
│   │   │   └── snapshots/
│   │   │       └── route.ts                # GET equity snapshots for charts
│   │   ├── kyc/
│   │   │   └── route.ts                    # POST submit KYC, GET status
│   │   ├── exchanges/
│   │   │   ├── route.ts                    # GET adapters list, GET user credentials
│   │   │   └── [credentialId]/
│   │   │       └── route.ts                # PATCH, DELETE credential
│   │   ├── strategies/
│   │   │   └── route.ts                    # GET available strategies catalogue
│   │   ├── billing/
│   │   │   ├── subscription/
│   │   │   │   └── route.ts                # GET, PATCH subscription
│   │   │   └── invoices/
│   │   │       └── route.ts                # GET invoice list
│   │   └── ws/
│   │       └── route.ts                    # WebSocket upgrade (proxies Stella WS feed)
│   │
│   ├── globals.css                         # CSS variables, Tailwind base
│   ├── layout.tsx                          # Root layout: fonts, providers, TanStack QueryClient
│   └── not-found.tsx                       # 404 page
│
├── components/
│   │
│   ├── layout/
│   │   ├── Sidebar.tsx                     # Main nav: collapsible, tier-aware links
│   │   ├── Topbar.tsx                      # Notifications bell, user avatar, search
│   │   ├── NotificationDrawer.tsx          # Slide-out alert panel
│   │   ├── OnboardingShell.tsx             # Step progress bar + layout wrapper
│   │   └── MobileNav.tsx                   # Bottom tab bar for mobile
│   │
│   ├── dashboard/
│   │   ├── PortfolioSummaryCard.tsx        # Total equity, return %, today's P&L
│   │   ├── BotStatusGrid.tsx               # Grid of BotCard components
│   │   ├── BotCard.tsx                     # Bot: status dot, P&L, pair, pause/resume
│   │   ├── ActivePositionsTable.tsx        # Live positions with unrealised P&L
│   │   ├── RecentActivityFeed.tsx          # Trade feed: pair, side, result, bot name
│   │   └── AlertBanner.tsx                 # Dismissible platform-level alert
│   │
│   ├── bots/
│   │   ├── BotCreationWizard.tsx           # Multi-step wizard wrapper
│   │   ├── steps/
│   │   │   ├── StrategyStep.tsx            # Pick a strategy from catalogue
│   │   │   ├── ExchangeStep.tsx            # Pick connected exchange
│   │   │   ├── PairStep.tsx                # Select trading pairs
│   │   │   ├── CapitalStep.tsx             # Allocate budget
│   │   │   ├── RiskStep.tsx                # Set SL / TP / drawdown
│   │   │   └── ReviewStep.tsx              # Confirm + activate
│   │   ├── BotControls.tsx                 # Pause / Resume / Close All / Delete
│   │   ├── BotPerformanceChart.tsx         # Equity curve for a single bot
│   │   ├── BotTradeTable.tsx               # Paginated trade history per bot
│   │   └── BotConfigForm.tsx               # Strategy parameter sliders/selects
│   │
│   ├── strategies/
│   │   ├── StrategyCard.tsx                # Marketplace card: name, perf, risk rating
│   │   ├── StrategyDetailPanel.tsx         # Full description + historical chart
│   │   └── StrategyFilter.tsx              # Filter by type, risk, exchange
│   │
│   ├── analytics/
│   │   ├── EquityCurve.tsx                 # Area chart with benchmark overlay
│   │   ├── PairBreakdownChart.tsx          # Bar chart: P&L by trading pair
│   │   ├── WinRateDonut.tsx                # Donut: win / loss / breakeven
│   │   ├── TimeOfDayHeatmap.tsx            # Heatmap: bot perf by hour of day
│   │   └── FeeBreakdownTable.tsx           # Exchange fees vs platform fees
│   │
│   ├── positions/
│   │   ├── PositionRow.tsx                 # Table row: entry, current, PnL, hold time
│   │   ├── PositionBadge.tsx               # Long / Short coloured badge
│   │   └── PositionFilter.tsx              # Filter by bot, pair, exchange
│   │
│   ├── capital/
│   │   ├── AllocationSlider.tsx            # Adjust per-bot capital budget
│   │   ├── ExchangeCredentialCard.tsx      # Connected exchange: status + action menu
│   │   └── AddExchangeWizard.tsx           # Per-exchange step-by-step credential setup
│   │
│   ├── risk/
│   │   ├── DailyLossLimitControl.tsx       # Threshold input + on/off toggle
│   │   ├── DrawdownLimitControl.tsx        # Personal max drawdown slider
│   │   ├── ProfitTakeControl.tsx           # Auto-pause at profit % target
│   │   └── RiskSummaryCard.tsx             # Active limits at a glance
│   │
│   ├── onboarding/
│   │   ├── KycWizard.tsx                   # Identity → doc → selfie → review steps
│   │   ├── KycStatusBanner.tsx             # Inline status: pending / approved / rejected
│   │   ├── PlanComparisonTable.tsx         # Tier feature comparison with CTA
│   │   └── ExchangeSetupGuide.tsx          # Screenshots + instructions per exchange
│   │
│   ├── billing/
│   │   ├── PlanCard.tsx                    # Current plan summary with upgrade CTA
│   │   ├── InvoiceTable.tsx                # Invoice list with status badges + PDF link
│   │   └── TaxExportButton.tsx             # Download trade CSV trigger
│   │
│   ├── stella-one/
│   │   ├── PoolAllocationCard.tsx          # Seeded capital, current value, Stella's share
│   │   ├── WithdrawalRequestForm.tsx       # Amount, wallet address, network, submit
│   │   └── ReimbursementHistory.tsx        # Past profit splits table
│   │
│   ├── auth/
│   │   └── TierGate.tsx                    # Renders children or <UpgradeCTA /> based on user.tier
│   │
│   └── ui/                                 # Shared primitives
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Badge.tsx
│       ├── Skeleton.tsx                    # Loading placeholder
│       ├── Tooltip.tsx
│       ├── Modal.tsx
│       ├── Drawer.tsx
│       ├── DataTable.tsx                   # Reusable sortable/filterable table
│       ├── StatCard.tsx                    # Label + value + delta + sparkline
│       ├── StatusDot.tsx                   # Animated green / yellow / red indicator
│       └── EmptyState.tsx                  # Consistent zero-state placeholder
│
├── hooks/
│   ├── usePortfolioFeed.ts                 # WS: live equity + aggregate P&L
│   ├── usePositionsFeed.ts                 # WS: open positions with ticking PnL
│   ├── useBotStatus.ts                     # WS: single bot heartbeat + status
│   ├── useNotifications.ts                 # WS + poll: platform alerts queue
│   ├── useCurrentUser.ts                   # Reads /api/me: id, tier, KYC status, email
│   └── useConfirmAction.ts                 # Generic confirm-dialog for destructive ops
│
├── lib/
│   ├── api/
│   │   ├── client.ts                       # Fetch wrapper: attaches Logto JWT, handles errors
│   │   ├── bots.ts
│   │   ├── positions.ts
│   │   ├── portfolio.ts
│   │   ├── strategies.ts
│   │   ├── exchanges.ts
│   │   └── billing.ts
│   ├── auth/
│   │   ├── getToken.ts                     # Server: extract + verify Logto JWT from cookie
│   │   └── logtoConfig.ts                  # App ID, issuer URL, JWKS endpoint config
│   ├── ws/
│   │   └── stellaSocket.ts                 # WS client: connect, subscribe topics, auto-reconnect
│   ├── formatters.ts                       # Currency, %, date, duration formatters
│   ├── constants.ts                        # Tier names, status colours, route paths
│   └── types/
│       ├── bot.ts
│       ├── position.ts
│       ├── portfolio.ts
│       ├── strategy.ts
│       ├── user.ts
│       └── billing.ts
│
├── store/
│   ├── portfolioStore.ts                   # Zustand: live portfolio state from WS
│   ├── botStore.ts                         # Zustand: active bot states map
│   └── notificationStore.ts               # Zustand: unread alerts queue
│
├── middleware.ts                           # JWT validation + onboarding redirect guard
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Auth Model — No Pages, JWT Only

Logto handles all of signup, login, MFA, and password management on its own hosted UI.
This portal never renders an auth page. The flow is:

```
User visits portal (unauthenticated)
  └──► middleware.ts: no valid JWT found
        └──► 302 redirect → Logto hosted login URL
              └──► Logto authenticates user, issues JWT
                    └──► redirect back to portal with JWT in HttpOnly cookie
                          └──► middleware.ts: verifies JWT via JWKS endpoint
                                └──► user lands on /onboarding or /dashboard
```

`lib/auth/getToken.ts` — server-side only. Reads the HttpOnly JWT cookie, verifies the
signature against Logto's JWKS endpoint, returns decoded claims (user ID, email, tier,
KYC status, onboarding flags). Used in Server Components and API route handlers.

`hooks/useCurrentUser.ts` — client-side. Calls `/api/me` (a thin internal route that
returns the verified JWT payload). No raw JWT or sensitive data stored client-side.

`account/security` page is omitted entirely. Password, MFA, and active sessions are all
managed in Logto's hosted account UI. A "Manage account security →" link surfaces in
the user avatar dropdown in the Topbar.

---

## Middleware Guard Logic

```
All routes
  → Validate JWT cookie → invalid/missing: redirect to Logto login URL

/onboarding/*
  → Valid JWT required
  → Onboarding already complete → redirect to /dashboard

/(portal)/*
  → Valid JWT required
  → Onboarding incomplete → redirect to /onboarding

/stella-one/*
  → Valid JWT required
  → user.tier !== 'stella_one' → redirect to /dashboard
```

Onboarding completeness (embedded as custom claims in the Logto JWT, set by NestJS
via Logto Management API after each step):
- `kyc_status === 'approved'`
- `has_connected_exchange === true`
- `has_allocated_capital === true`

---

## Real-time Data Flow

```
Stella WS (authenticated per user via JWT)
  └──► stellaSocket.ts
        ├──► portfolioStore  (equity, P&L, drawdown)
        ├──► botStore        (bot status, heartbeat, last trade)
        └──► notificationStore (alerts, circuit breaker events)

Components subscribe via:
  usePortfolioFeed()   →  reads portfolioStore
  useBotStatus(botId)  →  reads botStore[botId]
  useNotifications()   →  reads notificationStore
```

---

## Tier-Aware UI

```tsx
// components/auth/TierGate.tsx
<TierGate requires="stella_unum" fallback={<UpgradeCTA feature="Custom Strategies" />}>
  <CustomStrategyBuilder />
</TierGate>
```

Sidebar link visibility by tier:
- **stella_one** — Stella One Pool section visible; custom strategies hidden
- **stella_unum+** — Custom strategy builder; up to 3 exchanges
- **stella_eon+** — Advanced analytics, tax export, API key management
- **stella_plenum** — Account manager contact card in sidebar footer

---

## Key Page Compositions

### `/dashboard`
`PortfolioSummaryCard` → `BotStatusGrid` → `ActivePositionsTable` → `RecentActivityFeed`
All live data from Zustand (WS-fed). Skeleton loaders on initial hydration.

### `/bots/new`
`BotCreationWizard` — URL-synced step param (`?step=1..6`).
Step state held in sessionStorage so browser back/forward doesn't lose progress.

### `/bots/[botId]`
Tab layout: **Overview** | **Performance** | **Settings** | **Activity**

### `/analytics`
Tab layout: **Returns** | **Trades** | **Fees**
Charts server-rendered with initial data, hydrated for interactive date range filters.

### `/risk`
Single page, no tabs. Four stacked control cards. Changes save with optimistic update +
toast. Every limit is displayed relative to the tier ceiling
(e.g. "5% of your 15% tier maximum").

### `/account/profile`
Display name, timezone, preferred currency, language.
No password/MFA — "Manage account security →" links to Logto account page.
```
