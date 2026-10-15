# Page-by-Page Analysis Strategy

**Document Version:** 1.0
**Last Updated:** February 21, 2026
**Purpose:** Define the systematic approach for analyzing UI pages and mapping data requirements

---

## Analysis Objective

Map each UI page's data requirements to specific backend sources (Phoenix/Elixir WebSocket, NestJS REST API, PostgreSQL tables, ETS cache) to enable complete implementation of the Stella trading platform.

---

## Analysis Methodology

### 1. **Page Identification & Classification**

For each page, we identify:
- **Route Path** - URL pattern (e.g., `/dashboard/bot-fleet`, `/users/[id]`)
- **Page Type** - List view, detail view, dashboard, settings
- **User Persona** - Who uses this page (trader, admin, operator)
- **Real-time Requirements** - Does the page need live updates?

### 2. **UI Component Breakdown**

We analyze the page by breaking down all UI components:
- **Data Display Components** - Tables, cards, charts, metrics
- **Interactive Components** - Buttons, forms, filters, modals
- **Navigation Components** - Breadcrumbs, tabs, links

For each component, we document:
- What data it displays
- Where that data comes from
- How frequently it updates

### 3. **Data Source Mapping**

For every piece of data on the page, we determine:

#### **A. Backend System Responsibility**

**Phoenix/Elixir handles:**
- ✅ Real-time trading operations (order execution, position management)
- ✅ Market data streaming (prices, candles, orderbook)
- ✅ Bot lifecycle management (start/stop/pause/kill)
- ✅ Performance-critical reads (current bot status, live P&L)
- ✅ Infrastructure monitoring (system health, resource usage)

**NestJS handles:**
- ✅ CRUD operations (user management, bot configuration)
- ✅ Historical data queries (past trades, historical P&L)
- ✅ Compliance & KYC (document uploads, verification)
- ✅ Billing & subscriptions (invoicing, payments)
- ✅ Admin operations (user administration, role management)
- ✅ Reporting (performance reports, analytics)

#### **B. Protocol Selection**

- **HTTP REST API** - For one-time data loads, CRUD operations, historical queries
- **WebSocket (Phoenix Channels)** - For real-time updates, live metrics, event streams

#### **C. Storage Location**

- **PostgreSQL Tables** - Persistent storage, historical records, configuration
- **PostgreSQL Views** - Aggregated data, complex queries, reporting
- **PostgreSQL Materialized Views** - Pre-computed aggregates for performance
- **ETS Cache** - In-memory temporary storage for real-time metrics
- **ETS → PostgreSQL Flow** - Temporary real-time data that gets persisted

### 4. **API Endpoint Specification**

For each data requirement, we define:

#### **REST Endpoints (NestJS or Phoenix)**
```
Method: GET/POST/PUT/DELETE
Endpoint: /api/resource/action
Query Parameters: pagination, filtering, sorting
Request Body: payload structure
Response: JSON schema with TypeScript interface
Side Effects: database writes, broadcasts, notifications
```

#### **WebSocket Events (Phoenix Channels)**
```typescript
// Channel topic pattern
Topic: "resource:scope:{id}"

// Event schemas
interface EventPayload {
  // TypeScript interface with all fields
}

// Event flow: Server → Client or Client → Server
```

### 5. **Database Schema Analysis**

For each page, we:
1. **Identify Required Tables** - What tables store the data?
2. **Check Schema Coverage** - Does the existing schema support all fields?
3. **Identify Gaps** - Missing tables, columns, indexes, constraints
4. **Recommend Changes** - SQL ALTER statements to add missing pieces

**Schema Gap Categories:**
- 🔴 **Critical (Blocking)** - Missing core tables/columns preventing functionality
- 🟡 **High Priority** - Performance indexes, materialized views
- 🟢 **Medium Priority** - Nice-to-have optimizations

### 6. **Real-Time Update Frequency**

We validate all proposed update frequencies against industry standards:

| Data Type | Proposed Frequency | Industry Standard | Validation |
|-----------|-------------------|-------------------|------------|
| Market Prices | 100-500ms | 100ms - 1s | ✅ Optimal |
| Position P&L | 1s | 500ms - 2s | ✅ Optimal |
| Bot Heartbeat | 5s | 5s - 10s | ✅ Optimal |
| Infrastructure | 4s | 5s - 15s | ✅ Optimal |

### 7. **GenServer & Process Architecture**

For real-time features, we define:

**GenServers Required:**
- **Purpose** - What problem does this GenServer solve?
- **State** - What data does it hold in memory?
- **Responsibilities** - What actions does it perform?
- **PubSub Topics** - What topics does it subscribe to/broadcast on?
- **ETS Tables** - What ETS tables does it manage?

### 8. **Frontend Implementation Notes**

We provide:
- **WebSocket Connection Code** - How to connect to Phoenix Channels
- **API Integration Examples** - Sample fetch() calls
- **State Management** - How to handle real-time updates in React
- **Error Handling** - Reconnection logic, fallback behavior

### 9. **Performance Considerations**

For each page, we document:
- **Query Optimization** - Indexes needed, query patterns
- **Caching Strategy** - What to cache, TTL, invalidation
- **Pagination** - Limits, offsets, cursor-based pagination
- **WebSocket Scalability** - Connection limits, load balancing
- **Rate Limiting** - API throttling, abuse prevention

### 10. **Testing Checklist**

Each analysis includes a testing checklist:
- [ ] Data loads correctly on page load
- [ ] Real-time updates appear for all clients
- [ ] Filters and search work correctly
- [ ] Actions (create/update/delete) succeed
- [ ] WebSocket reconnects automatically
- [ ] Error states display properly
- [ ] Performance is acceptable under load

---

## Document Structure Template

Each page analysis follows this structure:

```markdown
## Page N: `{route}` - {Page Title}

### UI Features & Requirements
- List all major UI sections/components

### Data Source Mapping
- Table mapping each component to its data source

### Phoenix Channel: {ChannelName}
- Topic pattern
- WebSocket event schemas (TypeScript)
- Event flow examples

### NestJS REST API Endpoints
- Endpoint 1: GET /api/resource
- Endpoint 2: POST /api/resource
(Full request/response schemas)

### Database Schema Requirements
- Current schema analysis
- Missing fields/tables
- Recommended SQL changes

### Phoenix GenServers (if needed)
- GenServer purpose and implementation example

### Data Flow Summary
- Visual flow diagram showing data path

### Summary Table
- Quick reference of all data sources

### Frontend Implementation Notes
- Code examples for WebSocket/API integration

### Performance Considerations
- Optimization recommendations

### Testing Checklist
- Comprehensive test cases
```

---

## Quality Standards

### Documentation Must Include:

✅ **Complete TypeScript Interfaces** - All WebSocket events and API responses
✅ **SQL Schema Changes** - Exact ALTER TABLE statements
✅ **Code Examples** - Working Phoenix/TypeScript snippets
✅ **Industry Validation** - Compare against best practices
✅ **Navigation Links** - Cross-references to related pages

### Documentation Must NOT:

❌ Guess at schemas - Always base on actual UI mock data
❌ Ignore performance - Always consider scalability
❌ Skip error cases - Document failure scenarios
❌ Assume knowledge - Explain all architectural decisions

---

## Backend Architecture Principles

### Phoenix/Elixir Layer

**Responsibilities:**
- Real-time event processing
- WebSocket connection management
- Trading logic execution
- Bot orchestration
- Market data streaming

**Technology Stack:**
- Phoenix Framework 1.7+
- Phoenix PubSub for broadcasting
- Phoenix Channels for WebSocket
- GenServer for stateful processes
- ETS for in-memory caching
- Ecto for database access

**Best Practices:**
- Use supervised processes for fault tolerance
- Implement backpressure for high-volume streams
- Cache frequently accessed data in ETS
- Broadcast via PubSub, not direct Channel pushes
- Use database transactions for consistency

### NestJS Layer

**Responsibilities:**
- RESTful CRUD operations
- Historical data queries
- User authentication (via Logto integration)
- Admin operations
- Reporting and analytics

**Technology Stack:**
- NestJS Framework
- TypeORM or Prisma for database
- JWT authentication
- Logto SDK for admin auth
- Bull for background jobs (if needed)

**Best Practices:**
- Use DTOs for request/response validation
- Implement pagination on all list endpoints
- Add comprehensive error handling
- Use interceptors for logging
- Implement rate limiting

### Database Layer

**Technology:**
- PostgreSQL 15+
- TimescaleDB extension for time-series data (OHLCV candles)

**Schema Organization:**
- `auth.*` - Authentication and users
- `trading.*` - Bots, orders, positions, strategies
- `market_data.*` - OHLCV candles, tickers, orderbook
- `operations.*` - Shift management, activity logs
- `platform.*` - System-wide aggregates, settings

**Best Practices:**
- Use UUID for primary keys
- Add created_at/updated_at to all tables
- Create indexes on foreign keys
- Use partial indexes for filtered queries
- Implement soft deletes (deleted_at) for audit trails

---

## Integration Patterns

### Pattern 1: Initial Load + Real-Time Updates

**Use Case:** Page displays data that changes over time (bot status, positions)

**Implementation:**
1. **Page Load:** `GET /api/resource` → Load initial data from PostgreSQL
2. **Subscribe:** Join Phoenix Channel `resource:scope:{id}`
3. **Updates:** Receive WebSocket events → Update React state
4. **Reconnect:** Auto-rejoin channel on disconnect

**Example Pages:** Bot Fleet, Trading/Positions, Mission Control

### Pattern 2: Pure REST API (No Real-Time)

**Use Case:** Page displays static or infrequently changing data (user profiles, settings)

**Implementation:**
1. **Page Load:** `GET /api/resource` → Load data from PostgreSQL
2. **Actions:** POST/PUT/DELETE → Update database
3. **Refresh:** Refetch data after mutations

**Example Pages:** Users List, User Detail, Settings

### Pattern 3: Hybrid (API + Cached)

**Use Case:** Page needs current state but not real-time updates

**Implementation:**
1. **Page Load:** `GET /api/phoenix/resource` → Read from ETS cache
2. **Data Source:** Phoenix GenServer maintains ETS cache
3. **Refresh:** Cache updates every N seconds (background)

**Example Pages:** Platform Stats (60s cache), Infrastructure Metrics (4s cache)

### Pattern 4: Event-Driven Actions

**Use Case:** User action triggers workflow requiring real-time confirmation

**Implementation:**
1. **User Action:** Click "Start Bot"
2. **API Call:** `POST /api/phoenix/bots/:id/start`
3. **Phoenix:** Start bot GenServer → Broadcast event
4. **All Clients:** Receive `bot_started` event via WebSocket
5. **UI Update:** Update button state, show success

**Example Pages:** Bot Detail (manual orders), Alerts (acknowledgment)

---

## Cross-Cutting Concerns

### Authentication & Authorization

**Platform Users (Traders/Followers):**
- Authentication via Logto
- JWT tokens in HTTP headers
- User ID in WebSocket connection params
- Row-level security in PostgreSQL

**Admin Users:**
- Separate Logto app for admins
- Role-based access control (RBAC)
- Hierarchy levels for permissions
- Admin-specific routes (`/admin-users`)

### Multi-Tenancy

**User Isolation:**
- All data scoped by `user_id`
- WebSocket channels: `resource:user:{user_id}`
- Database queries filtered by user
- No cross-user data leakage

**Platform-Wide Data:**
- Admin dashboards see aggregated data
- Mission Control shows platform stats
- Infrastructure monitoring is global

### Audit Logging

**Logged Events:**
- All bot lifecycle actions (start/stop/pause/kill)
- Manual position closures
- Alert acknowledgments
- Configuration changes
- Admin actions (user suspend/deactivate)

**Storage:**
- `operations.shift_activities` for operator actions
- `auth.activity_logs` for user actions
- Phoenix Logger for system events

### Error Handling

**Frontend:**
- Toast notifications for user errors
- Modal dialogs for critical errors
- Fallback UI for loading/error states
- Automatic retry for failed WebSocket connections

**Backend:**
- Structured error responses (HTTP status codes)
- Detailed error messages in development
- Generic messages in production
- Error tracking (Sentry, Rollbar)

---

## Development Workflow

### Phase 1: Analysis (Current Phase)
1. Read UI page code
2. Identify all data requirements
3. Map to backend sources
4. Document in markdown

### Phase 2: Schema Implementation
1. Write migration files for database changes
2. Create/update Ecto schemas
3. Add indexes and constraints
4. Test migrations on development database

### Phase 3: Backend Implementation
1. Implement Phoenix Channels and GenServers
2. Implement NestJS REST endpoints
3. Write API documentation (OpenAPI/Swagger)
4. Add unit tests for critical paths

### Phase 4: Frontend Integration
1. Replace mock data with API calls
2. Implement WebSocket connections
3. Add error handling and loading states
4. Test real-time updates

### Phase 5: Testing & Optimization
1. Load testing for high-volume scenarios
2. WebSocket scalability testing
3. Database query optimization
4. Add monitoring and alerting

---

## Success Criteria

An analysis is considered complete when:

✅ Every UI component is mapped to a data source
✅ All API endpoints are fully specified
✅ All WebSocket events have TypeScript schemas
✅ Database schema gaps are identified with SQL fixes
✅ GenServers and processes are architected
✅ Performance considerations are documented
✅ Testing checklist is comprehensive
✅ Cross-references to related pages exist
✅ Code examples are provided for integration

---

## Maintenance & Updates

This analysis strategy document should be updated when:
- New architectural patterns are introduced
- Technology stack changes (framework upgrades)
- Best practices evolve
- New page types require different analysis approaches

**Version History:**
- v1.0 (2026-02-21) - Initial strategy document

---

**Next Steps:**
Apply this methodology to analyze remaining pages:
- Detail pages (Bot Detail, User Detail, Admin User Detail)
- Finance section (4 pages)
- KYC Review section (5 pages)
- Settings section (9 pages)
