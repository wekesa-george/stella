# Plan: Plug Real API Endpoints into All Frontend Pages

## Context

All 27+ admin frontend pages currently use mock/generated data from `src/lib/data/generators.ts` or inline hardcoded constants. Two API client modules (`stellaAdminApi.ts` for NestJS and `tradingEngineApi.ts` for Phoenix) and 7 typed Phoenix channel hooks (`usePhoenixChannel.ts`) are already built but unused. This plan replaces mock data with real API calls page-by-page.

---

## Phase 0: Shared Infrastructure

- [ ] **0A. SocketProvider in Root Layout** — `src/app/layout.tsx`
  - [ ] Import `getWebSocketToken()` from `tradingEngineApi.ts`
  - [ ] Import `SocketProvider` from `components/SocketProvider.tsx`
  - [ ] Fetch token after auth check, wrap `<main>` children with `<SocketProvider token={wsToken}>`

- [ ] **0B. Type Mappers** — NEW `src/lib/api/mappers.ts`
  - [ ] `mapApiBotToUiBot(apiBot) → Bot`
  - [ ] `mapWsBotSnapshotToUiBot(snapshot: BotSnapshot) → Bot`
  - [ ] `mapApiAlertToUiAlert(apiAlert) → Alert`
  - [ ] `mapApiUserToUiUser(apiUser) → User`

- [ ] **0C. Fetch-with-Fallback Utility** — NEW `src/lib/api/fetchWithFallback.ts`
  - [ ] Tries real API, falls back to mock generator if `NEXT_PUBLIC_USE_MOCK=true` or API fails

---

## Phase 1: Dashboard Pages (Real-time WS + REST)

**Pattern**: Split each page into `page.tsx` (server component fetching initial data) + `PageClient.tsx` (client component with WS overlay).

- [ ] **1A. `/dashboard/alerts`**
  - [ ] Remove `generateAlerts()` from useEffect
  - [ ] Server: `getAlerts()` → pass as `initialAlerts` prop
  - [ ] Client: `useAlertChannel()` prepends new real-time alerts
  - [ ] Mutations: `acknowledgeAlert()`, `acknowledgeAlertsBulk()`, `deleteAlert()` server actions
  - [ ] Map: API alert → UI alert type

- [ ] **1B. `/dashboard/infra`**
  - [ ] Remove `generateInfraMetrics()`, `generateInfraHistory()`, 4s `setInterval`
  - [ ] Client: `useInfraChannel()` provides `metrics` + `exchangeHealth` in real-time
  - [ ] History: Accumulate WS events into rolling buffer
  - [ ] Map: WS metrics → `InfraMetrics` type

- [ ] **1C. `/dashboard/bot-fleet`**
  - [ ] Remove `generateBots(18)`, `generateAlerts()`
  - [ ] Server: `listBots()` → pass as `initialBots`
  - [ ] Client: `useBotChannel()` (lobby) overlays real-time bot updates
  - [ ] Actions: Kill bot → `stopBot(id)` server action
  - [ ] Map: `BotSnapshot` → `Bot` type

- [ ] **1D. `/dashboard/bot/[id]`**
  - [ ] Remove `generateBots()` lookup, `generatePositions()`, `generateEquityCurve()`, BOT-0001/0002 special cases
  - [ ] Server: `getBot(id)`, `getBotPositions(id)`, `getBotOrders(id)` in parallel
  - [ ] Client: `useBotChannel(id)` + `usePositionChannel(id)` + `useOrderChannel(id)` for live updates
  - [ ] Actions: pause/start/stop via server actions, close position via WS push
  - [ ] Keep: Binance candlestick chart (generalize to all bots)

- [ ] **1E. `/dashboard/mission-control`**
  - [ ] Remove all mock generators and `setInterval` calls
  - [ ] Server: `getAlerts()`, `listBots()` for initial load
  - [ ] Client: `usePlatformChannel()` → KPI cards
  - [ ] Client: `useInfraChannel()` → infra health cards
  - [ ] Client: `useAlertChannel()` → real-time alert sidebar
  - [ ] Client: `useBotChannel()` → active bot count
  - [ ] Infra history: Accumulate WS snapshots into rolling array via useRef

- [ ] **1F. Dashboard Layout** — `src/app/dashboard/layout.tsx`
  - [ ] Remove `generateAlerts()` import and useEffect
  - [ ] Replace with `useAlertChannel()` for real-time unacked alert badge count
  - [ ] Wire top stats bar to `usePlatformChannel()` instead of hardcoded values

---

## Phase 2: User/Admin Management (REST only)

- [ ] **2A. `/users`**
  - [ ] Remove `generateUsers(50)`
  - [ ] Replace with `getUsers()` server action in useEffect
  - [ ] Add loading state while fetching

- [ ] **2B. `/users/[id]`**
  - [ ] Server: `getUser(id)` + `getUserTransactions(id)` in parallel
  - [ ] Client: Mutations via `updateUser()`, `suspendUser()`, `reactivateUser()`

- [ ] **2C. `/admin-users`**
  - [ ] Remove hardcoded 6-admin array
  - [ ] Replace with `getAdminUsers()` server action

- [ ] **2D. `/admin-users/[id]`**
  - [ ] Server: `getAdminUser(id)` + `getAdminUserRoles(id)` + `getAvailableRoles()` in parallel
  - [ ] Client: Role assignment/removal, deactivate, reset password via server actions

---

## Phase 3: Finance Pages (REST only)

All 5 finance pages: server component fetches data, passes to client child for Recharts.

- [ ] **3A. `/finance/overview`**
  - [ ] Remove inline `rnd()`/`ri()` generators
  - [ ] Server: `getFinancePlatformKpis()`, `getFinanceEquityCurve()`, `getFinanceMonthlyReturns()`, `getFinanceDrawdownCurve()`

- [ ] **3B. `/finance/strategies`**
  - [ ] Server: `getFinanceStrategiesPerformance()`, `getFinanceStrategiesEquityCurves()`

- [ ] **3C. `/finance/risk`**
  - [ ] Server: `getFinanceRiskOverview()`, `getFinanceRiskConcentration()`, `getFinanceRiskCorrelationMatrix()`, `getFinanceRiskPositionSizing()`

- [ ] **3D. `/finance/market`**
  - [ ] Server: `getFinanceMarketKpis()`, `getFinanceMarketPairs()`, `getFinanceMarketHourlyHeatmap()`, `getFinanceMarketExchanges()`

- [ ] **3E. `/finance/users`**
  - [ ] Server: `getFinanceUsersKpis()`, `getFinanceUsersPerformance()`, `getFinanceUsersTiers()`, `getFinanceUsersGrowth()`

---

## Phase 4: KYC Pages (REST only)

- [ ] **4A. `/kyc-review/applicants`**
  - [ ] Remove inline `NAMES` array, seeded mock data
  - [ ] Server: `getKycApplicantsStats()`, `getKycApplicants()` in parallel
  - [ ] Client: Detail view → `getKycApplicant(id)`, actions → `kycApplicantAction(id, body)`

- [ ] **4B. `/kyc-review/providers`**
  - [ ] Server: `getKycProvidersStats()`, `getKycProviders()`
  - [ ] Client: `updateKycProvider(id, body)`

- [ ] **4C. `/kyc-review/regions`**
  - [ ] Server: `getKycRegions()`, `getKycReverificationRules()`
  - [ ] Client: CRUD via `createKycRegion()`, `updateKycRegion()`, `createKycReverificationRule()`, `updateKycReverificationRule()`

- [ ] **4D. `/kyc-review/audit`**
  - [ ] Server: `getKycAudit()` with pagination params
  - [ ] Client: `exportKycAudit()` for CSV download

---

## Phase 5: Settings Pages (REST only, 10 pages)

All follow identical pattern: useEffect calls GET on mount, save button calls PUT.

- [ ] **`/settings/risk`** — Load: `getSettingsRisk()` · Save: `updateSettingsRisk()`
- [ ] **`/settings/billing`** — Load: `getSettingsBilling()` + `getSettingsBillingRevenueStats()` · Save: `updateSettingsBilling()`
- [ ] **`/settings/integrations`** — Load: `getSettingsIntegrations()` · Save: webhook CRUD + `rotateSigningKey()`
- [ ] **`/settings/bot-engine`** — Load: `getSettingsBotEngine()` · Save: `updateSettingsBotEngine()`
- [ ] **`/settings/security`** — Load: `getSettingsSecurity()` · Save: `updateSettingsSecurity()`
- [ ] **`/settings/communications`** — Load: `getSettingsCommunications()` · Save: `updateSettingsEmail()`, `updateSettingsTemplate()`
- [ ] **`/settings/compliance`** — Load: `getSettingsCompliance()` · Save: `updateSettingsCompliance()`, restriction CRUD
- [ ] **`/settings/exchanges`** — Load: `getSettingsExchanges()` · Save: exchange CRUD + `testExchangeConnection()`, `rotateExchangeCredentials()`, `revealExchangeCredentials()`
- [ ] **`/settings/infrastructure`** — Load: `getSettingsInfrastructure()` · Save: `updateSettingsInfrastructure()`, `updateFeatureFlag()`, `triggerJob()`
- [ ] **`/settings/notifications`** — Load: `getSettingsNotifications()` · Save: channel/routing/settings/alert-type updates

---

## Phase 6: Remaining Pages

- [ ] **6A. `/dashboard/shift-handoff`**
  - [ ] Remove `generateBots()`, inline `generateShiftLogs()`, hardcoded `currentShift`
  - [ ] Server: `getCurrentShift()`, `getShiftActivities()`, `getShiftWatchList()`
  - [ ] Client: `startShift()`, `logShiftActivity()`, `addToShiftWatchList()`, `submitHandoff()`, `updateShiftNotes()`

- [ ] **6B. `/trading`**
  - [ ] Remove inline mock candle/position/order generators
  - [ ] Client: `useMarketDataChannel(pair)` for live tickers, `usePositionChannel()` for positions, `useOrderChannel()` for live order stream

---

## Key Files

| File | Role |
|------|------|
| `src/lib/stellaAdminApi.ts` | NestJS server actions (already built) |
| `src/lib/tradingEngineApi.ts` | Phoenix server actions (already built) |
| `src/hooks/usePhoenixChannel.ts` | 7 typed WS hooks (already built) |
| `src/components/SocketProvider.tsx` | WS auth wrapper (already built) |
| `src/lib/data/generators.ts` | Mock data (to be replaced page by page) |
| `src/lib/types/dashboard.ts` | UI types: Bot, Alert, User, InfraMetrics |
| `src/app/layout.tsx` | Root layout (add SocketProvider) |
| `src/app/dashboard/layout.tsx` | Dashboard layout (replace mock alert badge) |
| `src/lib/api/mappers.ts` | NEW — API→UI type mappers |
| `src/lib/api/fetchWithFallback.ts` | NEW — graceful degradation utility |

---

## Verification (after each phase)

- [ ] `npx tsc --noEmit` — must pass clean
- [ ] `npm run dev` — verify each modified page loads with real data
- [ ] Check browser console for WS connection (`bot:lobby joined`, etc.)
- [ ] Test mutations (acknowledge alert, assign role, save settings) and verify they persist
- [ ] Toggle `NEXT_PUBLIC_USE_MOCK=true` to verify fallback still works
