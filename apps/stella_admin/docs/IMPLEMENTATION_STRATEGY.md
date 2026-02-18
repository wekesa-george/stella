# Stella Admin Implementation Strategy

**Database:** stella_platform_new (170.168.103.207:3212)
**Framework:** Phoenix/Elixir with LiveView
**Authentication:** Logto OAuth2/OIDC
**Timeline:** 12 weeks (12 phases)

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 0: Foundation](#phase-0-foundation-do-this-first)
3. [Phase 1: Core Admin Experience](#phase-1-core-admin-experience-week-1-2)
4. [Phase 2: User Management](#phase-2-user-management-week-2-3)
5. [Phase 3: Trading Operations](#phase-3-trading-operations-week-3-4)
6. [Phase 4: Risk Management](#phase-4-risk-management-week-4-5)
7. [Phase 5: Exchange Management](#phase-5-exchange-management-week-5-6)
8. [Phase 6: Strategy Management](#phase-6-strategy-management-week-6-7)
9. [Phase 7: Billing & Finance](#phase-7-billing--finance-week-7-8)
10. [Phase 8: Stella One Pool](#phase-8-stella-one-pool-week-8-9)
11. [Phase 9: Predictions & AI](#phase-9-predictions--ai-week-9-10)
12. [Phase 10: Monitoring & Alerts](#phase-10-monitoring--alerts-week-10)
13. [Phase 11: Reports & Audit](#phase-11-reports--audit-week-11)
14. [Phase 12: System Administration](#phase-12-system-administration-week-12)
15. [Common Patterns](#common-patterns-across-all-features)

---

## Overview

This document outlines the implementation strategy for the Stella Admin backoffice, covering 34 permissions, 7 roles, and 49 database tables. Each feature follows a consistent pattern:

**Database → Context → LiveView**

All features are built incrementally, with Phase 0 (Foundation) as a prerequisite for everything else.

---

## Phase 0: Foundation (Do This First)

**Priority:** CRITICAL - Everything depends on this
**Estimated Time:** 3-4 days

### 0.1 Admin Authentication & Authorization System

**Why First:** All features require admin user management and permission checking.

#### Database Layer

Tables already exist in `stella_platform_new`:
- `auth.admin_users` - Platform administrators
- `auth.admin_roles` - Role definitions (Super Admin, Ops Manager, etc.)
- `auth.admin_permissions` - Permission definitions
- `auth.admin_user_roles` - Many-to-many admin-role assignments
- `auth.admin_role_permissions` - Many-to-many role-permission assignments
- `auth.admin_sessions` - Active admin sessions
- `admin.admin_audit_log` - Immutable audit trail

No migrations needed - schema already created.

#### Ecto Schemas

**File:** `lib/stella_admin/auth/admin_user.ex`
```elixir
defmodule StellaAdmin.Auth.AdminUser do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: false}
  @foreign_key_type :binary_id

  schema "admin_users" do
    field :email, :string
    field :name, :string
    field :status, :string  # active, inactive, suspended
    field :mfa_enabled, :boolean, default: false
    field :mfa_secret, :string
    field :last_login_at, :utc_datetime
    field :invited_by_id, :binary_id

    has_many :user_roles, StellaAdmin.Auth.AdminUserRole
    has_many :roles, through: [:user_roles, :role]
    has_many :sessions, StellaAdmin.Auth.AdminSession

    timestamps(type: :utc_datetime)
  end

  def changeset(admin_user, attrs) do
    admin_user
    |> cast(attrs, [:id, :email, :name, :status, :mfa_enabled, :invited_by_id])
    |> validate_required([:id, :email, :status])
    |> validate_format(:email, ~r/@/)
    |> validate_inclusion(:status, ["active", "inactive", "suspended"])
    |> unique_constraint(:email)
  end
end
```

**File:** `lib/stella_admin/auth/admin_role.ex`
```elixir
defmodule StellaAdmin.Auth.AdminRole do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "admin_roles" do
    field :code, :string
    field :name, :string
    field :description, :string
    field :is_super_admin, :boolean, default: false

    has_many :role_permissions, StellaAdmin.Auth.AdminRolePermission
    has_many :permissions, through: [:role_permissions, :permission]

    timestamps(type: :utc_datetime)
  end
end
```

**File:** `lib/stella_admin/auth/admin_permission.ex`
```elixir
defmodule StellaAdmin.Auth.AdminPermission do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "admin_permissions" do
    field :code, :string
    field :name, :string
    field :description, :string
    field :category, :string
    field :is_sensitive, :boolean, default: false

    timestamps(type: :utc_datetime)
  end
end
```

**File:** `lib/stella_admin/auth/admin_user_role.ex`
```elixir
defmodule StellaAdmin.Auth.AdminUserRole do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "admin_user_roles" do
    belongs_to :admin_user, StellaAdmin.Auth.AdminUser
    belongs_to :role, StellaAdmin.Auth.AdminRole

    field :assigned_by_id, :binary_id
    field :expires_at, :utc_datetime

    timestamps(type: :utc_datetime, updated_at: false)
  end
end
```

**File:** `lib/stella_admin/auth/admin_session.ex`
```elixir
defmodule StellaAdmin.Auth.AdminSession do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "admin_sessions" do
    belongs_to :admin_user, StellaAdmin.Auth.AdminUser

    field :session_token, :string
    field :ip_address, :string
    field :user_agent, :string
    field :expires_at, :utc_datetime
    field :last_activity_at, :utc_datetime

    timestamps(type: :utc_datetime, updated_at: false)
  end
end
```

**File:** `lib/stella_admin/admin/audit_log.ex`
```elixir
defmodule StellaAdmin.Admin.AuditLog do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "admin_audit_log" do
    belongs_to :admin_user, StellaAdmin.Auth.AdminUser

    field :admin_email, :string
    field :admin_name, :string
    field :action, :string
    field :resource_type, :string
    field :resource_id, :binary_id
    field :old_value, :map
    field :new_value, :map
    field :reason, :string
    field :permission_used, :string
    field :ip_address, :string
    field :user_agent, :string
    field :request_path, :string
    field :correlation_id, :string

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(audit_log, attrs) do
    audit_log
    |> cast(attrs, [
      :admin_user_id, :admin_email, :admin_name, :action, :resource_type,
      :resource_id, :old_value, :new_value, :reason, :permission_used,
      :ip_address, :user_agent, :request_path, :correlation_id
    ])
    |> validate_required([
      :admin_user_id, :admin_email, :action, :resource_type, :permission_used
    ])
  end
end
```

#### Context Layer

**File:** `lib/stella_admin/auth.ex`
```elixir
defmodule StellaAdmin.Auth do
  @moduledoc """
  The Auth context handles admin user authentication and authorization.
  """

  import Ecto.Query
  alias StellaAdmin.Repo
  alias StellaAdmin.Auth.{AdminUser, AdminRole, AdminPermission, AdminUserRole, AdminSession}

  ## Admin User Functions

  @doc """
  Gets a single admin user by ID.
  """
  def get_admin_user(id) do
    Repo.get(AdminUser, id)
    |> Repo.preload([:roles, :sessions])
  end

  @doc """
  Gets a single admin user by email.
  """
  def get_admin_user_by_email(email) do
    Repo.get_by(AdminUser, email: email)
    |> Repo.preload([:roles])
  end

  @doc """
  Creates or updates an admin user from Logto webhook.
  This is called when an admin signs in via Logto.
  """
  def authenticate_admin(attrs) do
    case get_admin_user_by_email(attrs.email) do
      nil ->
        # Create new admin user
        %AdminUser{}
        |> AdminUser.changeset(attrs)
        |> Repo.insert()

      admin_user ->
        # Update last login
        admin_user
        |> Ecto.Changeset.change(last_login_at: DateTime.utc_now())
        |> Repo.update()
    end
  end

  ## Session Management

  @doc """
  Creates a new admin session.
  """
  def create_admin_session(admin_user_id, session_attrs) do
    %AdminSession{}
    |> Ecto.Changeset.change(%{
      admin_user_id: admin_user_id,
      session_token: generate_session_token(),
      ip_address: session_attrs[:ip_address],
      user_agent: session_attrs[:user_agent],
      expires_at: DateTime.add(DateTime.utc_now(), 8 * 3600, :second),
      last_activity_at: DateTime.utc_now()
    })
    |> Repo.insert()
  end

  @doc """
  Gets an admin session by token.
  """
  def get_session_by_token(token) do
    Repo.get_by(AdminSession, session_token: token)
    |> Repo.preload(admin_user: [:roles])
  end

  @doc """
  Updates session last activity timestamp.
  """
  def update_session_activity(session) do
    session
    |> Ecto.Changeset.change(last_activity_at: DateTime.utc_now())
    |> Repo.update()
  end

  @doc """
  Expires an admin session.
  """
  def expire_admin_session(session_token) do
    case get_session_by_token(session_token) do
      nil -> {:error, :not_found}
      session ->
        session
        |> Ecto.Changeset.change(expires_at: DateTime.utc_now())
        |> Repo.update()
    end
  end

  @doc """
  Expires all sessions for an admin user.
  """
  def expire_all_sessions(admin_user_id) do
    from(s in AdminSession,
      where: s.admin_user_id == ^admin_user_id,
      where: s.expires_at > ^DateTime.utc_now()
    )
    |> Repo.update_all(set: [expires_at: DateTime.utc_now()])
  end

  ## Permission Checking

  @doc """
  Checks if an admin user has a specific permission.
  Super admins bypass all permission checks.
  """
  def has_permission?(admin_user, permission_code) do
    admin_user = Repo.preload(admin_user, [:roles])

    # Super admins have all permissions
    if Enum.any?(admin_user.roles, & &1.is_super_admin) do
      true
    else
      # Check if any of the user's roles have this permission
      permission_codes = get_effective_permissions(admin_user)
      permission_code in permission_codes
    end
  end

  @doc """
  Gets all effective permissions for an admin user.
  Returns a list of permission codes.
  """
  def get_effective_permissions(admin_user) do
    admin_user = Repo.preload(admin_user, roles: :permissions)

    admin_user.roles
    |> Enum.flat_map(& &1.permissions)
    |> Enum.map(& &1.code)
    |> Enum.uniq()
  end

  ## Role Management

  @doc """
  Lists all available roles.
  """
  def list_roles do
    Repo.all(AdminRole)
    |> Repo.preload(:permissions)
  end

  @doc """
  Assigns a role to an admin user.
  """
  def assign_role(admin_user_id, role_id, assigned_by_admin_id, expires_at \\ nil) do
    %AdminUserRole{}
    |> Ecto.Changeset.change(%{
      admin_user_id: admin_user_id,
      role_id: role_id,
      assigned_by_id: assigned_by_admin_id,
      expires_at: expires_at
    })
    |> Repo.insert()
  end

  @doc """
  Removes a role from an admin user.
  """
  def remove_role(admin_user_id, role_id) do
    from(aur in AdminUserRole,
      where: aur.admin_user_id == ^admin_user_id,
      where: aur.role_id == ^role_id
    )
    |> Repo.delete_all()
  end

  ## Private Functions

  defp generate_session_token do
    :crypto.strong_rand_bytes(32) |> Base.encode64()
  end
end
```

#### Plugs

**File:** `lib/stella_admin_web/plugs/load_admin_user.ex`
```elixir
defmodule StellaAdminWeb.Plugs.LoadAdminUser do
  @moduledoc """
  Loads the current admin user from the session.
  """
  import Plug.Conn
  alias StellaAdmin.Auth

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_session(conn, :admin_session_token) do
      nil ->
        assign(conn, :current_admin, nil)

      session_token ->
        case Auth.get_session_by_token(session_token) do
          nil ->
            conn
            |> delete_session(:admin_session_token)
            |> assign(:current_admin, nil)

          session ->
            # Check if session is expired
            if DateTime.compare(session.expires_at, DateTime.utc_now()) == :gt do
              # Session valid, update activity
              Auth.update_session_activity(session)
              assign(conn, :current_admin, session.admin_user)
            else
              # Session expired
              conn
              |> delete_session(:admin_session_token)
              |> assign(:current_admin, nil)
            end
        end
    end
  end
end
```

**File:** `lib/stella_admin_web/plugs/require_admin_auth.ex`
```elixir
defmodule StellaAdminWeb.Plugs.RequireAdminAuth do
  @moduledoc """
  Ensures that an admin user is authenticated.
  Redirects to sign-in page if not authenticated.
  """
  import Plug.Conn
  import Phoenix.Controller

  def init(opts), do: opts

  def call(conn, _opts) do
    if conn.assigns[:current_admin] do
      conn
    else
      conn
      |> put_flash(:error, "You must be signed in to access this page.")
      |> redirect(to: "/auth/sign-in")
      |> halt()
    end
  end
end
```

**File:** `lib/stella_admin_web/plugs/require_permission.ex`
```elixir
defmodule StellaAdminWeb.Plugs.RequirePermission do
  @moduledoc """
  Ensures that the current admin user has a specific permission.
  """
  import Plug.Conn
  import Phoenix.Controller
  alias StellaAdmin.Auth

  def init(opts), do: opts

  def call(conn, permission_code) do
    if conn.assigns[:current_admin] && Auth.has_permission?(conn.assigns.current_admin, permission_code) do
      conn
    else
      conn
      |> put_status(:forbidden)
      |> put_view(StellaAdminWeb.ErrorHTML)
      |> render(:"403")
      |> halt()
    end
  end
end
```

#### LiveView Hooks

**File:** `lib/stella_admin_web/live/live_auth.ex`
```elixir
defmodule StellaAdminWeb.LiveAuth do
  @moduledoc """
  LiveView authentication and authorization hooks.
  """
  import Phoenix.Component
  import Phoenix.LiveView
  alias StellaAdmin.Auth

  @doc """
  Ensures admin user is authenticated for LiveView.
  """
  def on_mount(:require_admin, _params, session, socket) do
    case session["admin_session_token"] do
      nil ->
        socket =
          socket
          |> put_flash(:error, "You must be signed in to access this page.")
          |> redirect(to: "/auth/sign-in")

        {:halt, socket}

      session_token ->
        case Auth.get_session_by_token(session_token) do
          nil ->
            socket =
              socket
              |> put_flash(:error, "Your session has expired.")
              |> redirect(to: "/auth/sign-in")

            {:halt, socket}

          session ->
            if DateTime.compare(session.expires_at, DateTime.utc_now()) == :gt do
              {:cont, assign(socket, current_admin: session.admin_user)}
            else
              socket =
                socket
                |> put_flash(:error, "Your session has expired.")
                |> redirect(to: "/auth/sign-in")

              {:halt, socket}
            end
        end
    end
  end

  @doc """
  Ensures admin user has a specific permission.
  """
  def on_mount({:require_permission, permission_code}, _params, _session, socket) do
    if socket.assigns[:current_admin] && Auth.has_permission?(socket.assigns.current_admin, permission_code) do
      {:cont, socket}
    else
      socket =
        socket
        |> put_flash(:error, "You don't have permission to access this page.")
        |> redirect(to: "/")

      {:halt, socket}
    end
  end
end
```

#### Webhook Updates

**File:** `lib/stella_admin_web/controllers/api/webhook_controller.ex` (additions)

Add a new endpoint for admin user webhooks:

```elixir
def admin_webhooks(conn, params) do
  # Verify webhook signature
  signature = get_req_header(conn, "logto-signature-sha-256") |> List.first()

  case verify_signature(conn, signature, params) do
    :ok ->
      handle_admin_webhook_event(conn, params)

    {:error, reason} ->
      Logger.warning("Admin webhook signature verification failed: #{inspect(reason)}")
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Unauthorized", message: "Invalid webhook signature"})
  end
end

defp handle_admin_webhook_event(conn, %{"event" => "PostSignIn", "user" => user_data} = params) do
  Logger.info("Processing admin PostSignIn webhook for: #{user_data["primaryEmail"]}")

  attrs = %{
    id: user_data["id"],
    email: user_data["primaryEmail"],
    name: user_data["name"],
    status: "active"
  }

  case StellaAdmin.Auth.authenticate_admin(attrs) do
    {:ok, admin} ->
      Logger.info("Admin user synced successfully: #{admin.id}")
      conn
      |> put_status(:ok)
      |> json(%{
        status: "success",
        message: "Admin login processed successfully",
        admin_id: admin.id,
        timestamp: DateTime.utc_now()
      })

    {:error, changeset} ->
      Logger.error("Failed to sync admin user: #{inspect(changeset.errors)}")
      conn
      |> put_status(:unprocessable_entity)
      |> json(%{
        status: "error",
        message: "Failed to process admin user",
        details: format_errors(changeset)
      })
  end
end
```

#### Router Updates

**File:** `lib/stella_admin_web/router.ex`

```elixir
defmodule StellaAdminWeb.Router do
  use StellaAdminWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {StellaAdminWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug StellaAdminWeb.Plugs.LoadAdminUser  # Changed from LoadCurrentUser
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :require_admin_auth do
    plug StellaAdminWeb.Plugs.RequireAdminAuth
  end

  # Auth routes (same as before)
  scope "/auth", StellaAdminWeb do
    pipe_through :browser

    get "/sign-in", AuthController, :sign_in
    get "/callback", AuthController, :callback
    get "/sign-out", AuthController, :sign_out
  end

  # Protected admin routes
  scope "/", StellaAdminWeb do
    pipe_through :browser
    pipe_through :require_admin_auth

    live_session :admin,
      layout: {StellaAdminWeb.Layouts, :admin},
      on_mount: {StellaAdminWeb.LiveAuth, :require_admin} do

      live "/", DashboardLive
      live "/users", Users.UsersLive
      live "/users/:id", Users.UserDetailLive
      # ... other routes
    end
  end

  # API routes
  scope "/api", StellaAdminWeb.Api do
    pipe_through :api

    post "/user-webhooks", WebhookController, :user_webhooks
    post "/admin-webhooks", WebhookController, :admin_webhooks  # NEW
  end
end
```

#### Implementation Checklist for Phase 0

- [ ] Create all Ecto schemas (admin_user, admin_role, admin_permission, etc.)
- [ ] Create Auth context with all functions
- [ ] Create Admin context with audit logging
- [ ] Create LoadAdminUser plug
- [ ] Create RequireAdminAuth plug
- [ ] Create RequirePermission plug
- [ ] Create LiveAuth hooks
- [ ] Update webhook_controller with admin webhook handler
- [ ] Update router with admin pipeline and routes
- [ ] Test admin authentication flow via Logto
- [ ] Test permission checking
- [ ] Test session management

---

## Phase 1: Core Admin Experience (Week 1-2)

### 1.1 Dashboard (Home)

**Priority:** HIGH - Landing page shows system health
**Estimated Time:** 2 days
**Permissions:** `system.view_health`, `reports.view`

#### Database Queries

Uses existing tables, aggregates from:
- `auth.users` - user counts
- `trading.bots` - bot status breakdown
- `trading.positions` - open positions, P&L calculations
- `risk.circuit_breaker_events` - recent breakers
- `system_ops.service_health` - service status
- `auth.kyc_records` - pending KYC reviews
- `pool.withdrawal_requests` - pending withdrawals
- `exchange.adapters` - exchange status

#### Context

**File:** `lib/stella_admin/dashboard.ex`

```elixir
defmodule StellaAdmin.Dashboard do
  @moduledoc """
  The Dashboard context provides platform-wide metrics and health information.
  """

  import Ecto.Query
  alias StellaAdmin.Repo

  @doc """
  Gets all platform metrics for the dashboard.
  Returns a map with current platform state.
  """
  def get_platform_metrics do
    %{
      active_users: count_active_users(),
      total_users: count_total_users(),
      active_bots: count_active_bots(),
      bot_status_breakdown: get_bot_status_counts(),
      total_equity: calculate_total_platform_equity(),
      todays_pnl: calculate_todays_aggregate_pnl(),
      open_positions: count_open_positions(),
      circuit_breaker_events_24h: count_recent_breakers(),
      service_health: get_service_health_summary(),
      pending_kyc_reviews: count_pending_kyc(),
      pending_withdrawals: count_pending_withdrawals(),
      exchange_adapter_status: get_exchange_status_summary()
    }
  end

  defp count_active_users do
    from(u in "users",
      where: u.status == "active",
      select: count(u.id)
    )
    |> Repo.one()
  end

  defp count_total_users do
    from(u in "users", select: count(u.id))
    |> Repo.one()
  end

  defp count_active_bots do
    from(b in "bots",
      where: b.status in ["running", "paused"],
      select: count(b.id)
    )
    |> Repo.one()
  end

  defp get_bot_status_counts do
    from(b in "bots",
      group_by: b.status,
      select: {b.status, count(b.id)}
    )
    |> Repo.all()
    |> Map.new()
  end

  defp calculate_total_platform_equity do
    # Sum all user equity across exchange credentials
    from(ec in "user_exchange_credentials",
      where: ec.status == "active",
      select: sum(ec.total_balance_usd)
    )
    |> Repo.one()
    |> Decimal.new()
  end

  defp calculate_todays_aggregate_pnl do
    today_start = DateTime.utc_now() |> DateTime.to_date() |> DateTime.new!(~T[00:00:00])

    from(p in "positions",
      where: p.updated_at >= ^today_start,
      select: %{
        realized: sum(p.realized_pnl_usd),
        unrealized: sum(p.unrealized_pnl_usd)
      }
    )
    |> Repo.one()
  end

  defp count_open_positions do
    from(p in "positions",
      where: p.status == "open",
      select: count(p.id)
    )
    |> Repo.one()
  end

  defp count_recent_breakers do
    yesterday = DateTime.add(DateTime.utc_now(), -24, :hour)

    from(cb in "circuit_breaker_events",
      where: cb.triggered_at >= ^yesterday,
      select: count(cb.id)
    )
    |> Repo.one()
  end

  defp get_service_health_summary do
    from(sh in "service_health",
      select: %{
        name: sh.service_name,
        status: sh.status,
        last_check: sh.last_check_at
      }
    )
    |> Repo.all()
  end

  defp count_pending_kyc do
    from(k in "kyc_records",
      where: k.status == "pending",
      select: count(k.id)
    )
    |> Repo.one()
  end

  defp count_pending_withdrawals do
    from(w in "withdrawal_requests",
      where: w.status == "pending",
      select: count(w.id)
    )
    |> Repo.one()
  end

  defp get_exchange_status_summary do
    from(a in "adapters",
      select: %{
        name: a.exchange_name,
        status: a.status
      }
    )
    |> Repo.all()
  end
end
```

#### LiveView

**File:** `lib/stella_admin_web/live/dashboard_live.ex`

```elixir
defmodule StellaAdminWeb.DashboardLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Dashboard

  @impl true
  def mount(_params, _session, socket) do
    # Set up periodic refresh if connected
    if connected?(socket) do
      :timer.send_interval(10_000, self(), :refresh_metrics)
    end

    {:ok,
      socket
      |> assign(metrics: Dashboard.get_platform_metrics())
      |> assign(page_title: "Dashboard")}
  end

  @impl true
  def handle_info(:refresh_metrics, socket) do
    {:noreply, assign(socket, metrics: Dashboard.get_platform_metrics())}
  end
end
```

**File:** `lib/stella_admin_web/live/dashboard_live.html.heex`

```heex
<div class="dashboard-container">
  <div class="dashboard-header">
    <h1>Platform Dashboard</h1>
    <p class="text-muted">Real-time platform health and metrics</p>
  </div>

  <!-- User Metrics -->
  <div class="metrics-grid">
    <.metric_card
      title="Active Users"
      value={@metrics.active_users}
      total={@metrics.total_users}
      icon="users"
    />

    <.metric_card
      title="Active Bots"
      value={@metrics.active_bots}
      breakdown={@metrics.bot_status_breakdown}
      icon="cpu"
    />

    <.metric_card
      title="Platform Equity"
      value={format_currency(@metrics.total_equity)}
      icon="dollar-sign"
    />

    <.metric_card
      title="Today's P&L"
      value={format_pnl(@metrics.todays_pnl)}
      icon="trending-up"
      variant={pnl_variant(@metrics.todays_pnl)}
    />

    <.metric_card
      title="Open Positions"
      value={@metrics.open_positions}
      icon="layers"
    />

    <.metric_card
      title="Circuit Breakers (24h)"
      value={@metrics.circuit_breaker_events_24h}
      icon="alert-circle"
      variant={if @metrics.circuit_breaker_events_24h > 0, do: "warning", else: "success"}
    />
  </div>

  <!-- Service Health Panel -->
  <div class="service-health-panel">
    <h2>Service Health</h2>
    <div class="service-list">
      <%= for service <- @metrics.service_health do %>
        <.service_status_badge service={service} />
      <% end %>
    </div>
  </div>

  <!-- Pending Items -->
  <div class="pending-items-panel">
    <h2>Pending Items</h2>
    <.pending_items_list
      kyc_pending={@metrics.pending_kyc_reviews}
      withdrawals_pending={@metrics.pending_withdrawals}
      breakers_needing_resolution={@metrics.circuit_breaker_events_24h}
    />
  </div>

  <!-- Exchange Status -->
  <div class="exchange-status-panel">
    <h2>Exchange Adapters</h2>
    <div class="exchange-list">
      <%= for exchange <- @metrics.exchange_adapter_status do %>
        <.exchange_status_badge exchange={exchange} />
      <% end %>
    </div>
  </div>
</div>
```

#### Components

**File:** `lib/stella_admin_web/components/dashboard_components.ex`

```elixir
defmodule StellaAdminWeb.DashboardComponents do
  use Phoenix.Component

  attr :title, :string, required: true
  attr :value, :any, required: true
  attr :total, :integer, default: nil
  attr :breakdown, :map, default: nil
  attr :icon, :string, default: nil
  attr :variant, :string, default: "default"

  def metric_card(assigns) do
    ~H"""
    <div class={"metric-card metric-card-#{@variant}"}>
      <div class="metric-header">
        <span class="metric-title"><%= @title %></span>
        <%= if @icon do %>
          <i class={"icon icon-#{@icon}"}></i>
        <% end %>
      </div>
      <div class="metric-value"><%= @value %></div>
      <%= if @total do %>
        <div class="metric-subtitle">
          of <%= @total %> total (<%= percentage(@value, @total) %>%)
        </div>
      <% end %>
      <%= if @breakdown do %>
        <div class="metric-breakdown">
          <%= for {status, count} <- @breakdown do %>
            <span class="breakdown-item">
              <%= status %>: <%= count %>
            </span>
          <% end %>
        </div>
      <% end %>
    </div>
    """
  end

  attr :service, :map, required: true

  def service_status_badge(assigns) do
    ~H"""
    <div class={"service-badge service-badge-#{@service.status}"}>
      <span class="service-name"><%= @service.name %></span>
      <span class="service-status"><%= @service.status %></span>
      <span class="service-last-check">
        Last check: <%= relative_time(@service.last_check) %>
      </span>
    </div>
    """
  end

  attr :kyc_pending, :integer, required: true
  attr :withdrawals_pending, :integer, required: true
  attr :breakers_needing_resolution, :integer, required: true

  def pending_items_list(assigns) do
    ~H"""
    <div class="pending-items-list">
      <.pending_item
        label="KYC Reviews Awaiting Approval"
        count={@kyc_pending}
        link="/users/kyc-review"
      />
      <.pending_item
        label="Withdrawal Requests Pending"
        count={@withdrawals_pending}
        link="/pool/withdrawals"
      />
      <.pending_item
        label="Circuit Breakers Needing Resolution"
        count={@breakers_needing_resolution}
        link="/risk/circuit-breakers"
      />
    </div>
    """
  end

  attr :label, :string, required: true
  attr :count, :integer, required: true
  attr :link, :string, required: true

  def pending_item(assigns) do
    ~H"""
    <div class="pending-item">
      <span class="pending-label"><%= @label %></span>
      <span class="pending-count"><%= @count %></span>
      <%= if @count > 0 do %>
        <.link navigate={@link} class="pending-link">View</.link>
      <% end %>
    </div>
    """
  end

  attr :exchange, :map, required: true

  def exchange_status_badge(assigns) do
    ~H"""
    <div class={"exchange-badge exchange-badge-#{@exchange.status}"}>
      <span class="exchange-name"><%= @exchange.name %></span>
      <span class="exchange-status"><%= @exchange.status %></span>
    </div>
    """
  end

  # Helper functions
  defp percentage(value, total) when total > 0 do
    Float.round(value / total * 100, 1)
  end
  defp percentage(_, _), do: 0

  defp format_currency(nil), do: "$0.00"
  defp format_currency(amount) do
    Number.Currency.number_to_currency(amount)
  end

  defp format_pnl(%{realized: realized, unrealized: unrealized}) do
    total = Decimal.add(realized || 0, unrealized || 0)
    format_currency(total)
  end

  defp pnl_variant(%{realized: realized, unrealized: unrealized}) do
    total = Decimal.add(realized || 0, unrealized || 0)
    if Decimal.compare(total, 0) == :gt, do: "success", else: "danger"
  end

  defp relative_time(datetime) do
    # Implement relative time formatting
    "#{DateTime.diff(DateTime.utc_now(), datetime, :minute)} minutes ago"
  end
end
```

#### Checklist for Phase 1.1

- [ ] Create Dashboard context with metric functions
- [ ] Create DashboardLive LiveView
- [ ] Create dashboard_live.html.heex template
- [ ] Create dashboard components
- [ ] Add CSS styling for dashboard
- [ ] Test real-time metric updates
- [ ] Test permission checking (system.view_health)

---

### 1.2 Admin User Management

**Priority:** HIGH - Needed to manage the admin team
**Estimated Time:** 3 days
**Permissions:** `admins.view`, `admins.create`, `admins.update`, `admins.delete`

#### Context

**File:** `lib/stella_admin/admin.ex`

```elixir
defmodule StellaAdmin.Admin do
  @moduledoc """
  The Admin context handles admin user management and audit logging.
  """

  import Ecto.Query
  alias StellaAdmin.Repo
  alias StellaAdmin.Auth
  alias StellaAdmin.Auth.{AdminUser, AdminRole}
  alias StellaAdmin.Admin.AuditLog

  ## Admin User Management

  @doc """
  Lists all admin users with optional filters.
  """
  def list_admin_users(filters \\ %{}) do
    AdminUser
    |> filter_by_status(filters[:status])
    |> filter_by_role(filters[:role])
    |> filter_by_search(filters[:search])
    |> Repo.all()
    |> Repo.preload([:roles, :sessions])
  end

  @doc """
  Gets a single admin user with full details.
  """
  def get_admin_user!(id) do
    AdminUser
    |> Repo.get!(id)
    |> Repo.preload([
      :roles,
      :sessions,
      user_roles: :assigned_by
    ])
  end

  @doc """
  Invites a new admin user.
  Creates the user record and sends invitation via Logto.
  """
  def invite_admin_user(attrs, invited_by_admin_id) do
    result =
      %AdminUser{}
      |> AdminUser.changeset(Map.put(attrs, :invited_by_id, invited_by_admin_id))
      |> Repo.insert()

    case result do
      {:ok, admin} ->
        # Log the action
        log_action(
          invited_by_admin_id,
          "invite_admin",
          "admin_user",
          admin.id,
          nil,
          %{email: admin.email},
          attrs[:reason],
          "admins.create"
        )

        # TODO: Send invitation email via Logto API
        {:ok, admin}

      error ->
        error
    end
  end

  @doc """
  Deactivates an admin user.
  Sets status to inactive and expires all sessions.
  """
  def deactivate_admin(admin_user_id, deactivated_by_admin_id, reason) do
    admin = Repo.get!(AdminUser, admin_user_id)

    result =
      Ecto.Multi.new()
      |> Ecto.Multi.update(:admin, AdminUser.changeset(admin, %{status: "inactive"}))
      |> Ecto.Multi.run(:expire_sessions, fn _repo, _changes ->
        Auth.expire_all_sessions(admin_user_id)
        {:ok, :expired}
      end)
      |> Ecto.Multi.run(:audit, fn _repo, %{admin: updated_admin} ->
        log_action(
          deactivated_by_admin_id,
          "deactivate_admin",
          "admin_user",
          admin_user_id,
          %{status: admin.status},
          %{status: "inactive"},
          reason,
          "admins.update"
        )
        {:ok, :logged}
      end)
      |> Repo.transaction()

    case result do
      {:ok, %{admin: admin}} -> {:ok, admin}
      {:error, _, changeset, _} -> {:error, changeset}
    end
  end

  @doc """
  Assigns a role to an admin user.
  """
  def assign_role(admin_user_id, role_id, assigned_by_admin_id, expires_at \\ nil) do
    result = Auth.assign_role(admin_user_id, role_id, assigned_by_admin_id, expires_at)

    case result do
      {:ok, user_role} ->
        role = Repo.get!(AdminRole, role_id)

        log_action(
          assigned_by_admin_id,
          "assign_role",
          "admin_user",
          admin_user_id,
          nil,
          %{role: role.code, expires_at: expires_at},
          nil,
          "admins.update"
        )

        {:ok, user_role}

      error ->
        error
    end
  end

  @doc """
  Removes a role from an admin user.
  """
  def remove_role(admin_user_id, role_id, removed_by_admin_id, reason) do
    role = Repo.get!(AdminRole, role_id)

    result = Auth.remove_role(admin_user_id, role_id)

    case result do
      {count, _} when count > 0 ->
        log_action(
          removed_by_admin_id,
          "remove_role",
          "admin_user",
          admin_user_id,
          %{role: role.code},
          nil,
          reason,
          "admins.update"
        )

        {:ok, :removed}

      _ ->
        {:error, :not_found}
    end
  end

  ## Audit Logging

  @doc """
  Logs an admin action to the audit log.
  """
  def log_action(admin_id, action, resource_type, resource_id, old_value, new_value, reason, permission_used) do
    admin = Repo.get!(AdminUser, admin_id)

    %AuditLog{}
    |> AuditLog.changeset(%{
      admin_user_id: admin_id,
      admin_email: admin.email,
      admin_name: admin.name,
      action: action,
      resource_type: resource_type,
      resource_id: resource_id,
      old_value: old_value,
      new_value: new_value,
      reason: reason,
      permission_used: permission_used,
      correlation_id: UUID.uuid4()
    })
    |> Repo.insert!()
  end

  ## Private Functions

  defp filter_by_status(query, nil), do: query
  defp filter_by_status(query, status) do
    where(query, [a], a.status == ^status)
  end

  defp filter_by_role(query, nil), do: query
  defp filter_by_role(query, role_code) do
    join(query, :inner, [a], r in assoc(a, :roles))
    |> where([a, r], r.code == ^role_code)
  end

  defp filter_by_search(query, nil), do: query
  defp filter_by_search(query, search) do
    search_pattern = "%#{search}%"
    where(query, [a], ilike(a.email, ^search_pattern) or ilike(a.name, ^search_pattern))
  end
end
```

#### LiveView

**File:** `lib/stella_admin_web/live/admin/admin_users_live.ex`

```elixir
defmodule StellaAdminWeb.Admin.AdminUsersLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.{Admin, Auth}

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
      socket
      |> assign(admins: Admin.list_admin_users())
      |> assign(roles: Auth.list_roles())
      |> assign(page_title: "Admin Users")}
  end

  @impl true
  def handle_event("invite_admin", %{"email" => email, "name" => name}, socket) do
    attrs = %{
      id: UUID.uuid4(),
      email: email,
      name: name,
      status: "active"
    }

    case Admin.invite_admin_user(attrs, socket.assigns.current_admin.id) do
      {:ok, admin} ->
        {:noreply,
          socket
          |> put_flash(:info, "Admin invited successfully")
          |> assign(admins: Admin.list_admin_users())}

      {:error, changeset} ->
        {:noreply, put_flash(socket, :error, "Failed to invite admin: #{inspect(changeset.errors)}")}
    end
  end

  @impl true
  def handle_event("deactivate_admin", %{"admin_id" => admin_id, "reason" => reason}, socket) do
    case Admin.deactivate_admin(admin_id, socket.assigns.current_admin.id, reason) do
      {:ok, _admin} ->
        {:noreply,
          socket
          |> put_flash(:info, "Admin deactivated successfully")
          |> assign(admins: Admin.list_admin_users())}

      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to deactivate admin")}
    end
  end

  @impl true
  def handle_event("assign_role", %{"admin_id" => admin_id, "role_id" => role_id}, socket) do
    case Admin.assign_role(admin_id, role_id, socket.assigns.current_admin.id) do
      {:ok, _} ->
        {:noreply,
          socket
          |> put_flash(:info, "Role assigned successfully")
          |> assign(admins: Admin.list_admin_users())}

      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to assign role")}
    end
  end

  @impl true
  def handle_event("remove_role", %{"admin_id" => admin_id, "role_id" => role_id, "reason" => reason}, socket) do
    case Admin.remove_role(admin_id, role_id, socket.assigns.current_admin.id, reason) do
      {:ok, _} ->
        {:noreply,
          socket
          |> put_flash(:info, "Role removed successfully")
          |> assign(admins: Admin.list_admin_users())}

      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to remove role")}
    end
  end
end
```

**File:** `lib/stella_admin_web/live/admin/admin_users_live.html.heex`

```heex
<div class="admin-users-container">
  <div class="page-header">
    <h1>Admin Users</h1>
    <%= if has_permission?(@current_admin, "admins.create") do %>
      <button phx-click={show_modal("invite-admin-modal")} class="btn btn-primary">
        Invite Admin
      </button>
    <% end %>
  </div>

  <div class="admin-users-table">
    <table>
      <thead>
        <tr>
          <th>Email</th>
          <th>Name</th>
          <th>Status</th>
          <th>Roles</th>
          <th>MFA</th>
          <th>Last Login</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <%= for admin <- @admins do %>
          <tr>
            <td><%= admin.email %></td>
            <td><%= admin.name %></td>
            <td>
              <span class={"status-badge status-#{admin.status}"}>
                <%= admin.status %>
              </span>
            </td>
            <td>
              <%= for role <- admin.roles do %>
                <span class="role-badge"><%= role.name %></span>
              <% end %>
            </td>
            <td>
              <%= if admin.mfa_enabled, do: "✓", else: "✗" %>
            </td>
            <td><%= format_datetime(admin.last_login_at) %></td>
            <td>
              <%= if has_permission?(@current_admin, "admins.update") do %>
                <button phx-click="deactivate_admin" phx-value-admin_id={admin.id} class="btn btn-sm btn-danger">
                  Deactivate
                </button>
              <% end %>
            </td>
          </tr>
        <% end %>
      </tbody>
    </table>
  </div>
</div>

<!-- Invite Admin Modal -->
<.modal id="invite-admin-modal">
  <h2>Invite Admin User</h2>
  <form phx-submit="invite_admin">
    <div class="form-group">
      <label for="email">Email</label>
      <input type="email" name="email" required />
    </div>
    <div class="form-group">
      <label for="name">Name</label>
      <input type="text" name="name" required />
    </div>
    <button type="submit" class="btn btn-primary">Send Invitation</button>
  </form>
</.modal>
```

#### Checklist for Phase 1.2

- [ ] Create Admin context with user management functions
- [ ] Create AdminUsersLive LiveView
- [ ] Create admin_users_live.html.heex template
- [ ] Create invite admin modal
- [ ] Create deactivate admin confirmation
- [ ] Create role assignment UI
- [ ] Test permission checking
- [ ] Test audit logging for all actions

---

## Phase 2: User Management (Week 2-3)

### 2.1 User List & Profiles

**Priority:** HIGH - Core admin functionality
**Estimated Time:** 3 days
**Permissions:** `users.view`, `users.update`, `users.update_tier`, `users.suspend`, `users.export`

#### Context

**File:** `lib/stella_admin/users.ex`

```elixir
defmodule StellaAdmin.Users do
  @moduledoc """
  The Users context handles user management operations.
  """

  import Ecto.Query
  alias StellaAdmin.Repo
  alias StellaAdmin.Accounts.User
  alias StellaAdmin.Admin

  @doc """
  Lists users with filters and pagination.
  """
  def list_users(filters \\ %{}, page \\ 1, per_page \\ 50) do
    User
    |> filter_by_email(filters[:email])
    |> filter_by_status(filters[:status])
    |> filter_by_tier(filters[:tier])
    |> filter_by_kyc_level(filters[:kyc_level])
    |> filter_by_country(filters[:country])
    |> filter_by_registration_date(filters[:from_date], filters[:to_date])
    |> order_by([u], desc: u.inserted_at)
    |> paginate(page, per_page)
    |> Repo.all()
    |> Repo.preload([:profile, :kyc_records, :tier_history])
  end

  @doc """
  Gets detailed user information.
  """
  def get_user_detail(user_id) do
    User
    |> Repo.get!(user_id)
    |> Repo.preload([
      :profile,
      :kyc_records,
      :tier_history,
      :exchange_credentials,
      :bots,
      :subscriptions
    ])
    |> enrich_with_metrics()
  end

  @doc """
  Updates user status.
  """
  def update_user_status(user_id, status, admin_id, reason) do
    user = Repo.get!(User, user_id)
    old_status = user.status

    result =
      user
      |> User.changeset(%{status: status})
      |> Repo.update()

    case result do
      {:ok, updated_user} ->
        Admin.log_action(
          admin_id,
          "update_user_status",
          "user",
          user_id,
          %{status: old_status},
          %{status: status},
          reason,
          "users.update"
        )

        {:ok, updated_user}

      error ->
        error
    end
  end

  @doc """
  Changes user tier.
  """
  def change_user_tier(user_id, new_tier, admin_id, reason) do
    user = Repo.get!(User, user_id)
    old_tier = user.current_tier

    result =
      Ecto.Multi.new()
      |> Ecto.Multi.update(:user, User.changeset(user, %{current_tier: new_tier}))
      |> Ecto.Multi.insert(:tier_history, tier_history_changeset(user_id, old_tier, new_tier, admin_id, reason))
      |> Ecto.Multi.run(:audit, fn _repo, _changes ->
        Admin.log_action(
          admin_id,
          "change_tier",
          "user",
          user_id,
          %{tier: old_tier},
          %{tier: new_tier},
          reason,
          "users.update_tier"
        )
        {:ok, :logged}
      end)
      |> Repo.transaction()

    case result do
      {:ok, %{user: updated_user}} -> {:ok, updated_user}
      {:error, _, changeset, _} -> {:error, changeset}
    end
  end

  @doc """
  Suspends a user account.
  """
  def suspend_user(user_id, admin_id, reason) do
    result =
      Ecto.Multi.new()
      |> Ecto.Multi.run(:update_status, fn _repo, _changes ->
        update_user_status(user_id, "suspended", admin_id, reason)
      end)
      |> Ecto.Multi.run(:stop_bots, fn _repo, _changes ->
        # Stop all active bots for this user
        stop_all_user_bots(user_id, admin_id, "User suspended: #{reason}")
        {:ok, :stopped}
      end)
      |> Repo.transaction()

    case result do
      {:ok, %{update_status: user}} -> {:ok, user}
      {:error, _, error, _} -> {:error, error}
    end
  end

  @doc """
  Exports user data for compliance (GDPR).
  """
  def export_user_data(user_id) do
    user = get_user_detail(user_id)

    %{
      user: user,
      profile: user.profile,
      kyc_records: user.kyc_records,
      tier_history: user.tier_history,
      bots: user.bots,
      # ... more data
    }
    |> Jason.encode!()
  end

  ## Private Functions

  defp filter_by_email(query, nil), do: query
  defp filter_by_email(query, email) do
    where(query, [u], ilike(u.email, ^"%#{email}%"))
  end

  defp filter_by_status(query, nil), do: query
  defp filter_by_status(query, status) do
    where(query, [u], u.status == ^status)
  end

  defp filter_by_tier(query, nil), do: query
  defp filter_by_tier(query, tier) do
    where(query, [u], u.current_tier == ^tier)
  end

  defp filter_by_kyc_level(query, nil), do: query
  defp filter_by_kyc_level(query, kyc_level) do
    join(query, :inner, [u], k in assoc(u, :kyc_records))
    |> where([u, k], k.kyc_level == ^kyc_level and k.status == "approved")
  end

  defp filter_by_country(query, nil), do: query
  defp filter_by_country(query, country) do
    join(query, :inner, [u], p in assoc(u, :profile))
    |> where([u, p], p.country == ^country)
  end

  defp filter_by_registration_date(query, nil, nil), do: query
  defp filter_by_registration_date(query, from_date, to_date) do
    query
    |> maybe_filter_from_date(from_date)
    |> maybe_filter_to_date(to_date)
  end

  defp maybe_filter_from_date(query, nil), do: query
  defp maybe_filter_from_date(query, from_date) do
    where(query, [u], u.inserted_at >= ^from_date)
  end

  defp maybe_filter_to_date(query, nil), do: query
  defp maybe_filter_to_date(query, to_date) do
    where(query, [u], u.inserted_at <= ^to_date)
  end

  defp paginate(query, page, per_page) do
    offset = (page - 1) * per_page
    query
    |> limit(^per_page)
    |> offset(^offset)
  end

  defp enrich_with_metrics(user) do
    # Calculate current equity, P&L, etc.
    Map.merge(user, %{
      current_equity: calculate_user_equity(user.id),
      total_pnl: calculate_user_pnl(user.id)
    })
  end

  defp calculate_user_equity(user_id) do
    # Query sum of equity across all exchange credentials
    Decimal.new(0)
  end

  defp calculate_user_pnl(user_id) do
    # Query sum of realized + unrealized P&L
    %{realized: Decimal.new(0), unrealized: Decimal.new(0)}
  end

  defp stop_all_user_bots(user_id, admin_id, reason) do
    # Implement bot stopping logic
    :ok
  end

  defp tier_history_changeset(user_id, old_tier, new_tier, changed_by_admin_id, reason) do
    %{
      user_id: user_id,
      old_tier: old_tier,
      new_tier: new_tier,
      changed_by_admin_id: changed_by_admin_id,
      reason: reason,
      changed_at: DateTime.utc_now()
    }
  end
end
```

#### LiveView

**File:** `lib/stella_admin_web/live/users/users_live.ex`

```elixir
defmodule StellaAdminWeb.Users.UsersLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Users

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
      socket
      |> assign(users: [], page: 1, filters: %{})
      |> assign(page_title: "Users")
      |> load_users()}
  end

  @impl true
  def handle_event("filter", filters, socket) do
    {:noreply,
      socket
      |> assign(filters: filters, page: 1)
      |> load_users()}
  end

  @impl true
  def handle_event("change_tier", %{"user_id" => user_id, "tier" => tier, "reason" => reason}, socket) do
    case Users.change_user_tier(user_id, tier, socket.assigns.current_admin.id, reason) do
      {:ok, _user} ->
        {:noreply,
          socket
          |> put_flash(:info, "User tier changed successfully")
          |> load_users()}

      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to change tier")}
    end
  end

  @impl true
  def handle_event("suspend_user", %{"user_id" => user_id, "reason" => reason}, socket) do
    case Users.suspend_user(user_id, socket.assigns.current_admin.id, reason) do
      {:ok, _user} ->
        {:noreply,
          socket
          |> put_flash(:info, "User suspended successfully")
          |> load_users()}

      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to suspend user")}
    end
  end

  @impl true
  def handle_event("update_status", %{"user_id" => user_id, "status" => status, "reason" => reason}, socket) do
    case Users.update_user_status(user_id, status, socket.assigns.current_admin.id, reason) do
      {:ok, _user} ->
        {:noreply,
          socket
          |> put_flash(:info, "User status updated successfully")
          |> load_users()}

      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to update status")}
    end
  end

  @impl true
  def handle_event("export_user", %{"user_id" => user_id}, socket) do
    data = Users.export_user_data(user_id)
    # Trigger download
    {:noreply, socket}
  end

  defp load_users(socket) do
    assign(socket, users: Users.list_users(socket.assigns.filters, socket.assigns.page))
  end
end
```

**File:** `lib/stella_admin_web/live/users/users_live.html.heex`

```heex
<div class="users-container">
  <div class="page-header">
    <h1>Users</h1>
  </div>

  <!-- Filters -->
  <div class="filters-panel">
    <form phx-change="filter">
      <input type="text" name="email" placeholder="Search email..." value={@filters[:email]} />
      <select name="status">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
        <option value="banned">Banned</option>
        <option value="pending_verification">Pending Verification</option>
      </select>
      <select name="tier">
        <option value="">All Tiers</option>
        <option value="stella_one">Stella One</option>
        <option value="stella_unum">Stella Unum</option>
        <option value="stella_eon">Stella Eon</option>
        <option value="stella_plenum">Stella Plenum</option>
      </select>
    </form>
  </div>

  <!-- Users Table -->
  <div class="users-table">
    <table>
      <thead>
        <tr>
          <th>Email</th>
          <th>Name</th>
          <th>Tier</th>
          <th>Status</th>
          <th>KYC Level</th>
          <th>Country</th>
          <th>Registered</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <%= for user <- @users do %>
          <tr>
            <td><%= user.email %></td>
            <td><%= user.profile.full_name %></td>
            <td><span class="tier-badge"><%= user.current_tier %></span></td>
            <td><span class={"status-badge status-#{user.status}"}><%= user.status %></span></td>
            <td><%= user.kyc_level %></td>
            <td><%= user.profile.country %></td>
            <td><%= format_date(user.inserted_at) %></td>
            <td>
              <.link navigate={"/users/#{user.id}"} class="btn btn-sm">View</.link>
              <%= if has_permission?(@current_admin, "users.suspend") do %>
                <button phx-click={show_modal("suspend-user-#{user.id}")} class="btn btn-sm btn-danger">
                  Suspend
                </button>
              <% end %>
            </td>
          </tr>
        <% end %>
      </tbody>
    </table>
  </div>
</div>
```

#### Checklist for Phase 2.1

- [ ] Create Users context with all functions
- [ ] Create UsersLive LiveView
- [ ] Create users_live.html.heex template
- [ ] Create user filters UI
- [ ] Create UserDetailLive for individual user view
- [ ] Create tier change modal with reason field
- [ ] Create suspend user confirmation
- [ ] Implement user data export
- [ ] Test all permission checks
- [ ] Test audit logging

---

### 2.2 KYC Review

**Priority:** HIGH - Compliance requirement
**Estimated Time:** 2 days
**Permissions:** `users.view`, `users.update`
**Role:** Compliance Officer

#### Context Updates

Add to `lib/stella_admin/users.ex`:

```elixir
## KYC Management

@doc """
Lists pending KYC submissions.
"""
def list_pending_kyc_submissions(filters \\ %{}) do
  from(k in "kyc_records",
    join: u in "users", on: k.user_id == u.id,
    where: k.status == "pending",
    order_by: [asc: k.submitted_at],
    select: %{
      id: k.id,
      user_id: u.id,
      user_email: u.email,
      kyc_level: k.kyc_level,
      provider: k.provider,
      provider_reference: k.provider_reference,
      submitted_at: k.submitted_at,
      document_expiry: k.document_expiry
    }
  )
  |> filter_by_kyc_level_pending(filters[:kyc_level])
  |> Repo.all()
end

@doc """
Gets KYC record detail.
"""
def get_kyc_detail(kyc_record_id) do
  from(k in "kyc_records",
    where: k.id == ^kyc_record_id,
    preload: [:user]
  )
  |> Repo.one!()
end

@doc """
Approves a KYC submission.
"""
def approve_kyc(kyc_record_id, admin_id, notes \\ nil) do
  kyc_record = Repo.get!("kyc_records", kyc_record_id)

  result =
    kyc_record
    |> Ecto.Changeset.change(%{
      status: "approved",
      reviewed_by: admin_id,
      reviewed_at: DateTime.utc_now(),
      reviewer_notes: notes
    })
    |> Repo.update()

  case result do
    {:ok, updated_kyc} ->
      Admin.log_action(
        admin_id,
        "approve_kyc",
        "kyc_record",
        kyc_record_id,
        %{status: "pending"},
        %{status: "approved"},
        notes,
        "users.update"
      )

      # Trigger tier upgrade if applicable
      maybe_upgrade_tier(updated_kyc.user_id, updated_kyc.kyc_level)

      {:ok, updated_kyc}

    error ->
      error
  end
end

@doc """
Rejects a KYC submission.
"""
def reject_kyc(kyc_record_id, admin_id, rejection_reason) do
  kyc_record = Repo.get!("kyc_records", kyc_record_id)

  result =
    kyc_record
    |> Ecto.Changeset.change(%{
      status: "rejected",
      reviewed_by: admin_id,
      reviewed_at: DateTime.utc_now(),
      rejection_reason: rejection_reason
    })
    |> Repo.update()

  case result do
    {:ok, updated_kyc} ->
      Admin.log_action(
        admin_id,
        "reject_kyc",
        "kyc_record",
        kyc_record_id,
        %{status: "pending"},
        %{status: "rejected"},
        rejection_reason,
        "users.update"
      )

      {:ok, updated_kyc}

    error ->
      error
  end
end

defp filter_by_kyc_level_pending(query, nil), do: query
defp filter_by_kyc_level_pending(query, kyc_level) do
  where(query, [k], k.kyc_level == ^kyc_level)
end

defp maybe_upgrade_tier(user_id, kyc_level) do
  # Business logic: auto-upgrade tier based on KYC approval
  # e.g., basic KYC -> stella_unum, enhanced KYC -> stella_eon
  :ok
end
```

#### LiveView

**File:** `lib/stella_admin_web/live/users/kyc_review_live.ex`

```elixir
defmodule StellaAdminWeb.Users.KycReviewLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Users

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
      socket
      |> assign(kyc_submissions: Users.list_pending_kyc_submissions())
      |> assign(page_title: "KYC Review Queue")}
  end

  @impl true
  def handle_event("approve", %{"kyc_id" => kyc_id, "notes" => notes}, socket) do
    case Users.approve_kyc(kyc_id, socket.assigns.current_admin.id, notes) do
      {:ok, _} ->
        {:noreply,
          socket
          |> put_flash(:info, "KYC approved successfully")
          |> assign(kyc_submissions: Users.list_pending_kyc_submissions())}

      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to approve KYC")}
    end
  end

  @impl true
  def handle_event("reject", %{"kyc_id" => kyc_id, "reason" => reason}, socket) do
    case Users.reject_kyc(kyc_id, socket.assigns.current_admin.id, reason) do
      {:ok, _} ->
        {:noreply,
          socket
          |> put_flash(:info, "KYC rejected")
          |> assign(kyc_submissions: Users.list_pending_kyc_submissions())}

      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to reject KYC")}
    end
  end
end
```

**File:** `lib/stella_admin_web/live/users/kyc_review_live.html.heex`

```heex
<div class="kyc-review-container">
  <div class="page-header">
    <h1>KYC Review Queue</h1>
    <p class="text-muted"><%= length(@kyc_submissions) %> pending submissions</p>
  </div>

  <div class="kyc-queue">
    <%= for kyc <- @kyc_submissions do %>
      <div class="kyc-card">
        <div class="kyc-header">
          <h3><%= kyc.user_email %></h3>
          <span class="kyc-level-badge"><%= kyc.kyc_level %></span>
        </div>
        <div class="kyc-details">
          <p><strong>Provider:</strong> <%= kyc.provider %></p>
          <p><strong>Reference:</strong> <%= kyc.provider_reference %></p>
          <p><strong>Submitted:</strong> <%= format_datetime(kyc.submitted_at) %></p>
          <%= if kyc.document_expiry do %>
            <p><strong>Document Expiry:</strong> <%= format_date(kyc.document_expiry) %></p>
          <% end %>
        </div>
        <div class="kyc-actions">
          <button phx-click={show_modal("approve-kyc-#{kyc.id}")} class="btn btn-success">
            Approve
          </button>
          <button phx-click={show_modal("reject-kyc-#{kyc.id}")} class="btn btn-danger">
            Reject
          </button>
          <.link navigate={"/users/kyc-review/#{kyc.id}"} class="btn btn-secondary">
            View Details
          </.link>
        </div>
      </div>

      <!-- Approve Modal -->
      <.modal id={"approve-kyc-#{kyc.id}"}>
        <h2>Approve KYC Submission</h2>
        <form phx-submit="approve" phx-value-kyc_id={kyc.id}>
          <div class="form-group">
            <label>Review Notes (optional)</label>
            <textarea name="notes" rows="3"></textarea>
          </div>
          <button type="submit" class="btn btn-success">Approve</button>
        </form>
      </.modal>

      <!-- Reject Modal -->
      <.modal id={"reject-kyc-#{kyc.id}"}>
        <h2>Reject KYC Submission</h2>
        <form phx-submit="reject" phx-value-kyc_id={kyc.id}>
          <div class="form-group">
            <label>Rejection Reason (required)</label>
            <textarea name="reason" rows="3" required></textarea>
          </div>
          <button type="submit" class="btn btn-danger">Reject</button>
        </form>
      </.modal>
    <% end %>
  </div>
</div>
```

#### Checklist for Phase 2.2

- [ ] Add KYC functions to Users context
- [ ] Create KycReviewLive LiveView
- [ ] Create kyc_review_live.html.heex template
- [ ] Create KycDetailLive for document viewing
- [ ] Implement approve/reject modals
- [ ] Add automatic tier upgrade logic
- [ ] Test permission checks (Compliance Officer role)
- [ ] Test audit logging

---

## Phase 3: Trading Operations (Week 3-4)

### 3.1 Live Trading Monitor

**Priority:** HIGH - Critical for operations
**Estimated Time:** 3 days
**Permissions:** `trading.view`, `trading.force_stop`

#### Context

**File:** `lib/stella_admin/trading.ex`

```elixir
defmodule StellaAdmin.Trading do
  @moduledoc """
  The Trading context handles trading operations monitoring and control.
  """

  import Ecto.Query
  alias StellaAdmin.Repo
  alias StellaAdmin.Admin

  @doc """
  Lists all active bots with real-time status.
  """
  def list_active_bots(filters \\ %{}) do
    from(b in "bots",
      join: u in "users", on: b.user_id == u.id,
      join: s in "strategies", on: b.strategy_id == s.id,
      join: a in "adapters", on: b.adapter_id == a.id,
      left_join: bs in "bot_sessions", on: bs.bot_id == b.id,
      where: b.status in ["running", "paused"],
      select: %{
        id: b.id,
        user_email: u.email,
        user_tier: u.current_tier,
        strategy_name: s.name,
        exchange_name: a.exchange_name,
        trading_pairs: b.trading_pairs,
        status: b.status,
        last_heartbeat: bs.last_heartbeat_at,
        last_trade_at: b.last_trade_at,
        open_position_count: b.open_position_count,
        session_pnl: bs.session_pnl_usd
      }
    )
    |> filter_by_bot_status(filters[:status])
    |> filter_by_exchange(filters[:exchange])
    |> filter_by_strategy(filters[:strategy])
    |> filter_by_user_tier(filters[:user_tier])
    |> Repo.all()
  end

  @doc """
  Force stops a specific bot.
  """
  def force_stop_bot(bot_id, admin_id, reason) do
    bot = Repo.get!("bots", bot_id)

    result =
      Ecto.Multi.new()
      |> Ecto.Multi.update(:bot, Ecto.Changeset.change(bot, %{
        status: "stopped_by_admin",
        stopped_by_admin_id: admin_id,
        stop_reason: reason,
        stopped_at: DateTime.utc_now()
      }))
      |> Ecto.Multi.run(:publish_stop, fn _repo, _changes ->
        # Publish stop command to RabbitMQ
        publish_bot_stop_command(bot_id, reason)
        {:ok, :published}
      end)
      |> Ecto.Multi.run(:audit, fn _repo, _changes ->
        Admin.log_action(
          admin_id,
          "force_stop_bot",
          "bot",
          bot_id,
          %{status: bot.status},
          %{status: "stopped_by_admin"},
          reason,
          "trading.force_stop"
        )
        {:ok, :logged}
      end)
      |> Repo.transaction()

    case result do
      {:ok, _} -> :ok
      {:error, _, error, _} -> {:error, error}
    end
  end

  @doc """
  Force stops all bots for a specific user.
  """
  def force_stop_user_bots(user_id, admin_id, reason) do
    from(b in "bots",
      where: b.user_id == ^user_id,
      where: b.status in ["running", "paused"]
    )
    |> Repo.all()
    |> Enum.each(fn bot ->
      force_stop_bot(bot.id, admin_id, reason)
    end)

    :ok
  end

  @doc """
  Emergency stop all bots platform-wide.
  DANGEROUS - requires super admin confirmation.
  """
  def emergency_stop_all_bots(admin_id, reason) do
    # Log HIGH severity event
    Admin.log_action(
      admin_id,
      "emergency_stop_all",
      "platform",
      nil,
      nil,
      nil,
      reason,
      "trading.force_stop"
    )

    from(b in "bots",
      where: b.status in ["running", "paused"]
    )
    |> Repo.all()
    |> Enum.each(fn bot ->
      force_stop_bot(bot.id, admin_id, "EMERGENCY: #{reason}")
    end)

    :ok
  end

  ## Private Functions

  defp filter_by_bot_status(query, nil), do: query
  defp filter_by_bot_status(query, status) do
    where(query, [b], b.status == ^status)
  end

  defp filter_by_exchange(query, nil), do: query
  defp filter_by_exchange(query, exchange) do
    where(query, [b, u, s, a], a.exchange_name == ^exchange)
  end

  defp filter_by_strategy(query, nil), do: query
  defp filter_by_strategy(query, strategy) do
    where(query, [b, u, s, a], s.name == ^strategy)
  end

  defp filter_by_user_tier(query, nil), do: query
  defp filter_by_user_tier(query, tier) do
    where(query, [b, u, s, a], u.current_tier == ^tier)
  end

  defp publish_bot_stop_command(bot_id, reason) do
    # Publish to RabbitMQ exchange: trading.commands
    # Routing key: bot.stop.{bot_id}
    # Payload: %{bot_id: bot_id, command: "stop", reason: reason}
    :ok
  end
end
```

#### LiveView

**File:** `lib/stella_admin_web/live/trading/live_monitor_live.ex`

```elixir
defmodule StellaAdminWeb.Trading.LiveMonitorLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Trading

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      # Refresh every 5 seconds
      :timer.send_interval(5_000, self(), :refresh)
    end

    {:ok,
      socket
      |> assign(bots: Trading.list_active_bots())
      |> assign(filters: %{})
      |> assign(page_title: "Live Trading Monitor")}
  end

  @impl true
  def handle_info(:refresh, socket) do
    {:noreply, assign(socket, bots: Trading.list_active_bots(socket.assigns.filters))}
  end

  @impl true
  def handle_event("filter", filters, socket) do
    {:noreply,
      socket
      |> assign(filters: filters)
      |> assign(bots: Trading.list_active_bots(filters))}
  end

  @impl true
  def handle_event("force_stop", %{"bot_id" => bot_id, "reason" => reason}, socket) do
    case Trading.force_stop_bot(bot_id, socket.assigns.current_admin.id, reason) do
      :ok ->
        {:noreply,
          socket
          |> put_flash(:info, "Bot stopped successfully")
          |> assign(bots: Trading.list_active_bots(socket.assigns.filters))}

      {:error, msg} ->
        {:noreply, put_flash(socket, :error, "Failed to stop bot: #{msg}")}
    end
  end

  @impl true
  def handle_event("force_stop_user", %{"user_id" => user_id, "reason" => reason}, socket) do
    Trading.force_stop_user_bots(user_id, socket.assigns.current_admin.id, reason)

    {:noreply,
      socket
      |> put_flash(:info, "All user bots stopped")
      |> assign(bots: Trading.list_active_bots(socket.assigns.filters))}
  end

  @impl true
  def handle_event("emergency_stop_all", %{"reason" => reason}, socket) do
    # Requires super admin
    if socket.assigns.current_admin.is_super_admin do
      Trading.emergency_stop_all_bots(socket.assigns.current_admin.id, reason)

      {:noreply,
        socket
        |> put_flash(:info, "EMERGENCY: All bots stopped")
        |> assign(bots: [])}
    else
      {:noreply, put_flash(socket, :error, "Unauthorized")}
    end
  end
end
```

**File:** `lib/stella_admin_web/live/trading/live_monitor_live.html.heex`

```heex
<div class="trading-monitor-container">
  <div class="page-header">
    <h1>Live Trading Monitor</h1>
    <%= if @current_admin.is_super_admin do %>
      <button phx-click={show_modal("emergency-stop-modal")} class="btn btn-danger">
        🚨 Emergency Stop All
      </button>
    <% end %>
  </div>

  <!-- Filters -->
  <div class="filters-panel">
    <form phx-change="filter">
      <select name="status">
        <option value="">All Statuses</option>
        <option value="running">Running</option>
        <option value="paused">Paused</option>
      </select>
      <select name="exchange">
        <option value="">All Exchanges</option>
        <option value="binance">Binance</option>
        <option value="kraken">Kraken</option>
      </select>
      <select name="user_tier">
        <option value="">All Tiers</option>
        <option value="stella_one">Stella One</option>
        <option value="stella_unum">Stella Unum</option>
        <option value="stella_eon">Stella Eon</option>
        <option value="stella_plenum">Stella Plenum</option>
      </select>
    </form>
  </div>

  <!-- Bots Table -->
  <div class="bots-table">
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Strategy</th>
          <th>Exchange</th>
          <th>Pairs</th>
          <th>Status</th>
          <th>Last Heartbeat</th>
          <th>Last Trade</th>
          <th>Positions</th>
          <th>Session P&L</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <%= for bot <- @bots do %>
          <tr>
            <td><%= bot.user_email %></td>
            <td><%= bot.strategy_name %></td>
            <td><%= bot.exchange_name %></td>
            <td><%= Enum.join(bot.trading_pairs, ", ") %></td>
            <td>
              <span class={"status-badge status-#{bot.status}"}>
                <%= bot.status %>
              </span>
            </td>
            <td><%= relative_time(bot.last_heartbeat) %></td>
            <td><%= format_datetime(bot.last_trade_at) %></td>
            <td><%= bot.open_position_count %></td>
            <td class={pnl_class(bot.session_pnl)}>
              <%= format_currency(bot.session_pnl) %>
            </td>
            <td>
              <%= if has_permission?(@current_admin, "trading.force_stop") do %>
                <button phx-click={show_modal("force-stop-#{bot.id}")} class="btn btn-sm btn-danger">
                  Force Stop
                </button>
              <% end %>
            </td>
          </tr>

          <!-- Force Stop Modal -->
          <.modal id={"force-stop-#{bot.id}"}>
            <h2>Force Stop Bot</h2>
            <p class="warning">This will immediately stop the bot and close all positions.</p>
            <form phx-submit="force_stop" phx-value-bot_id={bot.id}>
              <div class="form-group">
                <label>Reason (required)</label>
                <textarea name="reason" rows="3" required></textarea>
              </div>
              <button type="submit" class="btn btn-danger">Force Stop</button>
            </form>
          </.modal>
        <% end %>
      </tbody>
    </table>
  </div>
</div>

<!-- Emergency Stop Modal -->
<.modal id="emergency-stop-modal">
  <h2>🚨 EMERGENCY STOP ALL BOTS</h2>
  <p class="danger-warning">
    This will immediately stop ALL bots on the platform and close all positions.
    This action cannot be undone.
  </p>
  <form phx-submit="emergency_stop_all">
    <div class="form-group">
      <label>Emergency Reason (required)</label>
      <textarea name="reason" rows="3" required placeholder="e.g., Exchange API failure, Security incident"></textarea>
    </div>
    <button type="submit" class="btn btn-danger btn-large">CONFIRM EMERGENCY STOP</button>
  </form>
</.modal>
```

#### Checklist for Phase 3.1

- [ ] Create Trading context with bot management
- [ ] Create LiveMonitorLive LiveView
- [ ] Create live_monitor_live.html.heex template
- [ ] Implement RabbitMQ bot stop command publishing
- [ ] Create force stop modals with reason field
- [ ] Implement emergency stop (super admin only)
- [ ] Add real-time updates (5 second refresh)
- [ ] Test permission checks
- [ ] Test audit logging

---

## Remaining Phases (Summary)

Due to length constraints, I'm summarizing the remaining phases. Each follows the same pattern:

### Phase 3.2: Position Viewer
- Context: position queries, force close logic
- LiveView: positions table, filters, detail modal
- Features: force-close single, bulk close

### Phase 4: Risk Management (Week 4-5)
- Risk Dashboard
- Limit Configuration (hierarchical: global → tier → user)
- Circuit Breaker Management
- Risk Audit Log

### Phase 5: Exchange Management (Week 5-6)
- Adapter Configuration
- User Credentials Overview (read-only, no key exposure)

### Phase 6: Strategy Management (Week 6-7)
- Core Strategies CRUD
- User Strategies & Marketplace approval
- Backtest Results viewer

### Phase 7: Billing & Finance (Week 7-8)
- Subscription Overview
- Invoice Management
- Payment Tracking
- Performance Fee Management
- Financial Reports

### Phase 8: Stella One Pool (Week 8-9)
- Pool Wallet Overview
- Allocation Management
- Withdrawal Request approval queue
- Reimbursement Tracking

### Phase 9: Predictions & AI (Week 9-10)
- Prediction Accuracy Dashboard
- Prediction Explorer

### Phase 10: Monitoring & Alerts (Week 10)
- User Alert Overview

### Phase 11: Reports & Audit (Week 11)
- Platform Reports
- Audit Log Viewer (searchable, read-only)

### Phase 12: System Administration (Week 12)
- Service Health Monitor
- System Configuration
- Maintenance Mode Toggle

---

## Common Patterns Across All Features

### 1. Audit Logging Pattern

Every write action must log to `admin.admin_audit_log`:

```elixir
# In every context function that modifies data
Admin.log_action(
  admin_id,
  "action_name",          # e.g., "change_tier"
  "resource_type",        # e.g., "user"
  resource_id,            # e.g., user.id
  old_value,              # Map of old values
  new_value,              # Map of new values
  reason,                 # Admin-provided reason
  "permission_used"       # e.g., "users.update_tier"
)
```

### 2. Permission Checking Pattern

In LiveView:
```elixir
# In mount callback
on_mount {StellaAdminWeb.LiveAuth, {:require_permission, "users.view"}}

# In template - conditional rendering
<%= if has_permission?(@current_admin, "users.update") do %>
  <button>Edit</button>
<% end %>
```

In controller:
```elixir
plug StellaAdminWeb.Plugs.RequirePermission, "users.view"
```

### 3. Sensitive Action Confirmation Pattern

For actions marked `is_sensitive: true`:

```heex
<button phx-click={show_modal("confirm-dangerous-action")}>Dangerous Action</button>

<.modal id="confirm-dangerous-action">
  <h2>Confirm Action</h2>
  <p class="warning">This action cannot be undone.</p>
  <form phx-submit="execute_action">
    <div class="form-group">
      <label>Reason (required)</label>
      <textarea name="reason" required></textarea>
    </div>
    <button type="submit" class="btn btn-danger">Confirm</button>
  </form>
</.modal>
```

### 4. Real-time Updates Pattern

For dashboards and monitoring views:

```elixir
def mount(_params, _session, socket) do
  if connected?(socket) do
    :timer.send_interval(10_000, self(), :refresh_data)
  end

  {:ok, assign(socket, data: load_data())}
end

def handle_info(:refresh_data, socket) do
  {:noreply, assign(socket, data: load_data())}
end
```

### 5. Pagination Pattern

```elixir
def list_resources(filters, page \\ 1, per_page \\ 50) do
  Resource
  |> apply_filters(filters)
  |> limit(^per_page)
  |> offset(^((page - 1) * per_page))
  |> Repo.all()
end
```

### 6. Multi-step Transaction Pattern

Use `Ecto.Multi` for atomic operations:

```elixir
Ecto.Multi.new()
|> Ecto.Multi.update(:resource, changeset)
|> Ecto.Multi.run(:side_effect, fn _repo, %{resource: resource} ->
  # Perform side effect
  {:ok, result}
end)
|> Ecto.Multi.run(:audit, fn _repo, _changes ->
  Admin.log_action(...)
  {:ok, :logged}
end)
|> Repo.transaction()
```

---

## Database Configuration

**Current Database:** `stella_platform_new`
**Host:** 170.168.103.207
**Port:** 3212
**User:** postgres

All tables already exist in the database. No migrations needed for Phase 0-12.

**Schemas used:**
- `auth` - Admin users, users, roles, permissions, sessions, KYC
- `trading` - Bots, positions, orders, fills
- `strategy` - Strategies, backtests, signals
- `exchange` - Adapters, user credentials
- `billing` - Subscriptions, invoices, payments
- `risk` - Limits, circuit breakers
- `pool` - Pool wallets, allocations, withdrawals
- `market_data` - Predictions, indicators
- `admin` - Audit log
- `system_ops` - Service health

---

## Testing Strategy

For each phase:

1. **Unit Tests** - Context functions
2. **Integration Tests** - Full flow with DB
3. **LiveView Tests** - User interactions
4. **Permission Tests** - Authorization checks
5. **Audit Tests** - Verify logging

Example test:
```elixir
defmodule StellaAdmin.UsersTest do
  use StellaAdmin.DataCase

  describe "change_user_tier/4" do
    test "changes user tier and logs to audit" do
      user = user_fixture()
      admin = admin_fixture()

      assert {:ok, updated_user} = Users.change_user_tier(
        user.id,
        "stella_unum",
        admin.id,
        "Upgrade after KYC approval"
      )

      assert updated_user.current_tier == "stella_unum"

      # Verify audit log entry
      audit = Repo.get_by(AuditLog,
        action: "change_tier",
        resource_id: user.id
      )

      assert audit.admin_user_id == admin.id
      assert audit.old_value["tier"] == "stella_one"
      assert audit.new_value["tier"] == "stella_unum"
    end
  end
end
```

---

## Deployment Checklist

Before deploying each phase:

- [ ] All tests passing
- [ ] Permission checks verified
- [ ] Audit logging tested
- [ ] Database queries optimized (use `EXPLAIN ANALYZE`)
- [ ] LiveView subscriptions cleaned up (avoid memory leaks)
- [ ] Error handling covers edge cases
- [ ] UI responsive on mobile
- [ ] Accessibility (ARIA labels, keyboard navigation)
- [ ] Documentation updated

---

## Dependencies Required

Add to `mix.exs`:

```elixir
defp deps do
  [
    # Existing dependencies
    {:phoenix, "~> 1.7"},
    {:phoenix_live_view, "~> 0.20"},
    {:ecto_sql, "~> 3.10"},
    {:postgrex, ">= 0.0.0"},
    {:oauth2, "~> 2.1"},

    # New dependencies for admin features
    {:uuid, "~> 1.1"},              # For correlation IDs
    {:number, "~> 1.0"},            # For currency formatting
    {:csv, "~> 3.0"},               # For data export
    {:amqp, "~> 3.3"},              # For RabbitMQ (bot commands)
    {:timex, "~> 3.7"}              # For date/time formatting
  ]
end
```

---

## Next Steps

1. Review this strategy document
2. Adjust priorities if needed
3. Start with **Phase 0 (Foundation)** - this is CRITICAL
4. After Phase 0 is complete, move to Phase 1
5. Implement features incrementally, testing each one thoroughly
6. Deploy to staging after each phase
7. Gather feedback from admin team

**Estimated Total Timeline:** 12 weeks (3 months) for all features

**Recommended Team:**
- 2 backend engineers (Elixir/Phoenix)
- 1 frontend engineer (LiveView, CSS)
- 1 QA engineer (testing each phase)

---

## Questions or Adjustments?

This strategy can be adjusted based on:
- Business priorities (which features are most urgent?)
- Team size (can we parallelize some phases?)
- Technical constraints (any missing dependencies?)
- User feedback (should we prioritize certain features?)

Let me know if you want to:
- Reorder phases
- Add/remove features
- Drill deeper into any specific phase
- Start implementing Phase 0 now
