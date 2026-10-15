defmodule StellaAdminWeb.AdminUserDetailLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Admin

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    admin_user = Admin.get_admin_user!(id)
    roles = Admin.get_admin_user_roles(id)
    all_roles = Admin.list_roles()

    # Get available roles (roles not already assigned)
    assigned_role_ids = Enum.map(roles, & &1.id)
    available_roles = Enum.reject(all_roles, fn role -> role.id in assigned_role_ids end)

    {:ok,
     socket
     |> assign(:page_title, "Admin User Details")
     |> assign(:current_page, :admin_users)
     |> assign(:admin_user, admin_user)
     |> assign(:roles, roles)
     |> assign(:all_roles, all_roles)
     |> assign(:available_roles, available_roles)
     |> assign(:show_deactivate_modal, false)
     |> assign(:show_assign_role_modal, false)
     |> assign(:show_remove_role_modal, false)
     |> assign(:role_to_remove, nil)}
  end

  @impl true
  def handle_event("show_deactivate_modal", _params, socket) do
    {:noreply, assign(socket, :show_deactivate_modal, true)}
  end

  @impl true
  def handle_event("hide_deactivate_modal", _params, socket) do
    {:noreply, assign(socket, :show_deactivate_modal, false)}
  end

  @impl true
  def handle_event("deactivate", %{"reason" => reason}, socket) do
    admin_user = socket.assigns.admin_user
    current_admin = socket.assigns.current_admin

    case Admin.deactivate_admin_user(admin_user, current_admin.id, reason) do
      {:ok, updated_admin} ->
        {:noreply,
         socket
         |> assign(:admin_user, updated_admin)
         |> assign(:show_deactivate_modal, false)
         |> put_flash(:info, "Admin user deactivated successfully")}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to deactivate admin user")}
    end
  end

  @impl true
  def handle_event("show_assign_role_modal", _params, socket) do
    {:noreply, assign(socket, :show_assign_role_modal, true)}
  end

  @impl true
  def handle_event("hide_assign_role_modal", _params, socket) do
    {:noreply, assign(socket, :show_assign_role_modal, false)}
  end

  @impl true
  def handle_event("assign_role", %{"role_id" => role_id}, socket) do
    admin_user = socket.assigns.admin_user
    current_admin = socket.assigns.current_admin

    case Admin.assign_role(admin_user.id, role_id, current_admin.id) do
      {:ok, _user_role} ->
        # Refresh roles
        roles = Admin.get_admin_user_roles(admin_user.id)
        assigned_role_ids = Enum.map(roles, & &1.id)
        available_roles = Enum.reject(socket.assigns.all_roles, fn role -> role.id in assigned_role_ids end)

        {:noreply,
         socket
         |> assign(:roles, roles)
         |> assign(:available_roles, available_roles)
         |> assign(:show_assign_role_modal, false)
         |> put_flash(:info, "Role assigned successfully")}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to assign role")}
    end
  end

  @impl true
  def handle_event("show_remove_role_modal", %{"role_id" => role_id}, socket) do
    role = Enum.find(socket.assigns.roles, &(&1.id == role_id))
    {:noreply, socket |> assign(:show_remove_role_modal, true) |> assign(:role_to_remove, role)}
  end

  @impl true
  def handle_event("hide_remove_role_modal", _params, socket) do
    {:noreply, socket |> assign(:show_remove_role_modal, false) |> assign(:role_to_remove, nil)}
  end

  @impl true
  def handle_event("remove_role", %{"role_id" => role_id}, socket) do
    admin_user = socket.assigns.admin_user

    case Admin.remove_role(admin_user.id, role_id) do
      {1, _} ->
        # Refresh roles
        roles = Admin.get_admin_user_roles(admin_user.id)
        assigned_role_ids = Enum.map(roles, & &1.id)
        available_roles = Enum.reject(socket.assigns.all_roles, fn role -> role.id in assigned_role_ids end)

        {:noreply,
         socket
         |> assign(:roles, roles)
         |> assign(:available_roles, available_roles)
         |> assign(:show_remove_role_modal, false)
         |> assign(:role_to_remove, nil)
         |> put_flash(:info, "Role removed successfully")}

      _ ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to remove role")}
    end
  end

  defp format_status(:invited), do: "Invited"
  defp format_status(:active), do: "Active"
  defp format_status(:suspended), do: "Suspended"
  defp format_status(:deactivated), do: "Deactivated"

  defp status_badge_class(:active),
    do: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"

  defp status_badge_class(:invited),
    do: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"

  defp status_badge_class(:suspended),
    do: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300"

  defp status_badge_class(:deactivated),
    do: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"

  @impl true
  def render(assigns) do
    ~H"""
    <div class="px-4 sm:px-6 lg:px-8">
      <!-- Breadcrumb -->
      <nav class="flex mb-4" aria-label="Breadcrumb">
        <ol class="inline-flex items-center space-x-1 md:space-x-3">
          <li class="inline-flex items-center">
            <.link
              navigate={~p"/system/admins"}
              class="inline-flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <.icon name="hero-arrow-left" class="size-4 mr-2" />
              Admin Users
            </.link>
          </li>
          <li aria-current="page">
            <div class="flex items-center">
              <.icon name="hero-chevron-right" class="size-4 text-gray-400" />
              <span class="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400 md:ml-2">
                Details
              </span>
            </div>
          </li>
        </ol>
      </nav>
      <!-- Header -->
      <div class="sm:flex sm:items-center sm:justify-between mb-8">
        <div class="sm:flex sm:items-center sm:space-x-4">
          <!-- Avatar -->
          <%= if @admin_user.avatar_url do %>
            <img
              src={@admin_user.avatar_url}
              alt={"#{@admin_user.first_name} #{@admin_user.last_name}"}
              class="w-16 h-16 rounded-full object-cover"
            />
          <% else %>
            <div class="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
              <span class="text-indigo-600 dark:text-indigo-400 text-xl font-bold">
                <%= "#{@admin_user.first_name} #{@admin_user.last_name}"
                |> String.split()
                |> Enum.take(2)
                |> Enum.map(&String.first/1)
                |> Enum.join()
                |> String.upcase() %>
              </span>
            </div>
          <% end %>

          <div class="mt-4 sm:mt-0">
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                <%= @admin_user.first_name %> <%= @admin_user.last_name %>
              </h1>
              <span class={"inline-flex items-center rounded-md px-2 py-1 text-xs font-medium #{status_badge_class(@admin_user.status)}"}>
                <%= format_status(@admin_user.status) %>
              </span>
              <%= if @admin_user.is_super_admin do %>
                <span class="inline-flex items-center rounded-md bg-purple-100 dark:bg-purple-900/30 px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-300">
                  Super Admin
                </span>
              <% end %>
            </div>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              <%= @admin_user.email %>
            </p>
          </div>
        </div>

        <div class="mt-4 sm:mt-0 flex items-center gap-3">
          <%= if @admin_user.status != :deactivated do %>
            <button
              type="button"
              phx-click="show_deactivate_modal"
              class="inline-flex items-center gap-2 rounded-md bg-red-600 dark:bg-red-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 dark:hover:bg-red-400"
            >
              <.icon name="hero-no-symbol" class="size-4" />
              <span>Deactivate</span>
            </button>
          <% end %>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-md bg-indigo-600 dark:bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <.icon name="hero-pencil" class="size-4" />
            <span>Edit</span>
          </button>
        </div>
      </div>
      <!-- Content Grid -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <!-- Left Column - Main Info -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Basic Information -->
          <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg border dark:border-gray-700">
            <div class="px-4 py-5 sm:p-6">
              <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100 mb-4">
                Basic Information
              </h3>
              <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">First Name</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= @admin_user.first_name %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Last Name</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= @admin_user.last_name %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= @admin_user.email %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= @admin_user.phone || "—" %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Display Name</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= @admin_user.display_name || "—" %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Timezone</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= @admin_user.timezone || "—" %>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <!-- Security Information -->
          <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg border dark:border-gray-700">
            <div class="px-4 py-5 sm:p-6">
              <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100 mb-4">
                Security & Access
              </h3>
              <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Multi-Factor Authentication
                  </dt>
                  <dd class="mt-1">
                    <%= if @admin_user.mfa_enabled do %>
                      <span class="inline-flex items-center rounded-md bg-green-100 dark:bg-green-900/30 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300">
                        <.icon name="hero-check-circle" class="size-3 mr-1" />
                        Enabled
                      </span>
                    <% else %>
                      <span class="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                        <.icon name="hero-x-circle" class="size-3 mr-1" />
                        Disabled
                      </span>
                    <% end %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Force Password Change
                  </dt>
                  <dd class="mt-1">
                    <%= if @admin_user.force_password_change do %>
                      <span class="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                        Required
                      </span>
                    <% else %>
                      <span class="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                        Not Required
                      </span>
                    <% end %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Last Login</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= if @admin_user.last_login_at do %>
                      <%= Calendar.strftime(@admin_user.last_login_at, "%Y-%m-%d %H:%M:%S") %>
                    <% else %>
                      Never
                    <% end %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Last Login IP</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= if @admin_user.last_login_ip do %>
                      <%= @admin_user.last_login_ip %>
                    <% else %>
                      —
                    <% end %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Failed Login Count
                  </dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= @admin_user.failed_login_count %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Locked Until</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= if @admin_user.locked_until do %>
                      <%= Calendar.strftime(@admin_user.locked_until, "%Y-%m-%d %H:%M:%S") %>
                    <% else %>
                      Not Locked
                    <% end %>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <!-- Account History -->
          <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg border dark:border-gray-700">
            <div class="px-4 py-5 sm:p-6">
              <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100 mb-4">
                Account History
              </h3>
              <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Created At</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= if @admin_user.created_at do %>
                      <%= Calendar.strftime(@admin_user.created_at, "%Y-%m-%d %H:%M:%S") %>
                    <% else %>
                      —
                    <% end %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Invited At</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= if @admin_user.invited_at do %>
                      <%= Calendar.strftime(@admin_user.invited_at, "%Y-%m-%d %H:%M:%S") %>
                    <% else %>
                      —
                    <% end %>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Activated At</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    <%= if @admin_user.activated_at do %>
                      <%= Calendar.strftime(@admin_user.activated_at, "%Y-%m-%d %H:%M:%S") %>
                    <% else %>
                      —
                    <% end %>
                  </dd>
                </div>
                <%= if @admin_user.status == :deactivated do %>
                  <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Deactivated At
                    </dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      <%= if @admin_user.deactivated_at do %>
                        <%= Calendar.strftime(@admin_user.deactivated_at, "%Y-%m-%d %H:%M:%S") %>
                      <% else %>
                        —
                      <% end %>
                    </dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Deactivation Reason
                    </dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      <%= @admin_user.deactivation_reason || "—" %>
                    </dd>
                  </div>
                <% end %>
              </dl>
            </div>
          </div>
        </div>
        <!-- Right Column - Roles & Permissions -->
        <div class="space-y-6">
          <!-- Roles -->
          <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg border dark:border-gray-700">
            <div class="px-4 py-5 sm:p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100">
                  Roles
                </h3>
                <%= if @available_roles != [] do %>
                  <button
                    type="button"
                    phx-click="show_assign_role_modal"
                    class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 font-medium"
                  >
                    <.icon name="hero-plus" class="size-4 inline mr-1" />
                    Add Role
                  </button>
                <% end %>
              </div>
              <%= if @roles == [] do %>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">No roles assigned</p>
                <%= if @available_roles != [] do %>
                  <button
                    type="button"
                    phx-click="show_assign_role_modal"
                    class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
                  >
                    Click here to assign a role
                  </button>
                <% end %>
              <% else %>
                <ul class="space-y-2">
                  <%= for role <- @roles do %>
                    <li class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group">
                      <div class="flex-1">
                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                          <%= role.name %>
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                          Level <%= role.hierarchy_level %>
                        </p>
                      </div>
                      <div class="flex items-center gap-2">
                        <%= if role.is_system do %>
                          <span class="inline-flex items-center rounded-md bg-blue-100 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                            System
                          </span>
                        <% end %>
                        <button
                          type="button"
                          phx-click="show_remove_role_modal"
                          phx-value-role_id={role.id}
                          class="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                          title="Remove role"
                        >
                          <.icon name="hero-x-mark" class="size-4" />
                        </button>
                      </div>
                    </li>
                  <% end %>
                </ul>
              <% end %>
            </div>
          </div>
          <!-- Quick Actions -->
          <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg border dark:border-gray-700">
            <div class="px-4 py-5 sm:p-6">
              <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100 mb-4">
                Quick Actions
              </h3>
              <div class="space-y-2">
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div class="flex items-center">
                    <.icon name="hero-key" class="size-4 mr-2" />
                    Reset Password
                  </div>
                </button>
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div class="flex items-center">
                    <.icon name="hero-envelope" class="size-4 mr-2" />
                    Send Email
                  </div>
                </button>
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div class="flex items-center">
                    <.icon name="hero-clock" class="size-4 mr-2" />
                    View Activity Log
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Deactivate Modal -->
      <%= if @show_deactivate_modal do %>
        <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div class="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity" phx-click="hide_deactivate_modal"></div>
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div>
                <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
                  <.icon name="hero-exclamation-triangle" class="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div class="mt-3 text-center sm:mt-5">
                  <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100" id="modal-title">
                    Deactivate Admin User
                  </h3>
                  <div class="mt-2">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      Are you sure you want to deactivate <%= @admin_user.first_name %> <%= @admin_user.last_name %>? They will no longer be able to access the admin panel.
                    </p>
                  </div>
                  <form phx-submit="deactivate" class="mt-4">
                    <div class="text-left">
                      <label for="reason" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Reason for deactivation
                      </label>
                      <textarea
                        id="reason"
                        name="reason"
                        rows="3"
                        required
                        class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
                        placeholder="Enter the reason for deactivation..."
                      ></textarea>
                    </div>
                    <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                      <button
                        type="submit"
                        class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 dark:bg-red-500 text-base font-medium text-white hover:bg-red-700 dark:hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:col-start-2 sm:text-sm"
                      >
                        Deactivate
                      </button>
                      <button
                        type="button"
                        phx-click="hide_deactivate_modal"
                        class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      <% end %>

      <!-- Assign Role Modal -->
      <%= if @show_assign_role_modal do %>
        <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="assign-role-modal-title" role="dialog" aria-modal="true">
          <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div class="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 transition-opacity" phx-click="hide_assign_role_modal"></div>
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div>
                <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                  <.icon name="hero-user-plus" class="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div class="mt-3 text-center sm:mt-5">
                  <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100" id="assign-role-modal-title">
                    Assign Role
                  </h3>
                  <div class="mt-2">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      Select a role to assign to <%= @admin_user.first_name %> <%= @admin_user.last_name %>.
                    </p>
                  </div>
                  <div class="mt-4">
                    <%= if @available_roles == [] do %>
                      <p class="text-sm text-gray-500 dark:text-gray-400">No more roles available to assign.</p>
                    <% else %>
                      <ul class="max-h-60 overflow-y-auto space-y-2">
                        <%= for role <- @available_roles do %>
                          <li>
                            <button
                              type="button"
                              phx-click="assign_role"
                              phx-value-role_id={role.id}
                              class="w-full text-left p-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                            >
                              <div class="flex items-center justify-between">
                                <div>
                                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    <%= role.name %>
                                  </p>
                                  <p class="text-xs text-gray-500 dark:text-gray-400">
                                    Level <%= role.hierarchy_level %> · <%= role.code %>
                                  </p>
                                </div>
                                <%= if role.is_system do %>
                                  <span class="inline-flex items-center rounded-md bg-blue-100 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                                    System
                                  </span>
                                <% end %>
                              </div>
                            </button>
                          </li>
                        <% end %>
                      </ul>
                    <% end %>
                  </div>
                  <div class="mt-5 sm:mt-6">
                    <button
                      type="button"
                      phx-click="hide_assign_role_modal"
                      class="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      <% end %>

      <!-- Remove Role Modal -->
      <%= if @show_remove_role_modal and @role_to_remove do %>
        <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="remove-role-modal-title" role="dialog" aria-modal="true">
          <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div class="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 transition-opacity" phx-click="hide_remove_role_modal"></div>
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div>
                <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
                  <.icon name="hero-exclamation-triangle" class="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div class="mt-3 text-center sm:mt-5">
                  <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100" id="remove-role-modal-title">
                    Remove Role
                  </h3>
                  <div class="mt-2">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      Are you sure you want to remove the role "<%= @role_to_remove.name %>" from <%= @admin_user.first_name %> <%= @admin_user.last_name %>?
                    </p>
                  </div>
                  <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                    <button
                      type="button"
                      phx-click="remove_role"
                      phx-value-role_id={@role_to_remove.id}
                      class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 dark:bg-red-500 text-base font-medium text-white hover:bg-red-700 dark:hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:col-start-2 sm:text-sm"
                    >
                      Remove Role
                    </button>
                    <button
                      type="button"
                      phx-click="hide_remove_role_modal"
                      class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      <% end %>
    </div>
    """
  end
end
