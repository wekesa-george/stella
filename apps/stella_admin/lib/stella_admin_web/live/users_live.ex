defmodule StellaAdminWeb.UsersLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Users

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Users")
     |> assign(:current_page, :users)
     |> assign(:users, [])
     |> assign(:pagination, %{})
     |> assign(:stats, %{})
     |> assign(:filters, %{page: 1, page_size: 20})
     |> assign(:show_filters, false)
     |> assign(:show_suspend_modal, false)
     |> assign(:show_change_tier_modal, false)
     |> assign(:selected_user, nil)
     |> assign(:suspend_reason, "")
     |> assign(:tier_change_reason, "")
     |> assign(:new_tier, nil)}
  end

  @impl true
  def handle_params(params, _url, socket) do
    page = String.to_integer(params["page"] || "1")

    filters =
      socket.assigns.filters
      |> Map.put(:page, page)
      |> maybe_add_filter(:email, params["email"])
      |> maybe_add_filter(:status, parse_atom(params["status"]))
      |> maybe_add_filter(:tier, parse_atom(params["tier"]))

    {users, pagination} = Users.list_users(filters)
    stats = Users.get_user_stats()

    {:noreply,
     socket
     |> assign(:users, users)
     |> assign(:pagination, pagination)
     |> assign(:stats, stats)
     |> assign(:filters, filters)}
  end

  @impl true
  def handle_event("filter", %{"status" => status}, socket) do
    filters = Map.put(socket.assigns.filters, :status, parse_atom(status))

    params = build_params(filters)
    {:noreply, push_patch(socket, to: ~p"/users?#{params}")}
  end

  @impl true
  def handle_event("filter_tier", %{"tier" => tier}, socket) do
    filters = Map.put(socket.assigns.filters, :tier, parse_atom(tier))

    params = build_params(filters)
    {:noreply, push_patch(socket, to: ~p"/users?#{params}")}
  end

  @impl true
  def handle_event("search", %{"email" => email}, socket) do
    filters = Map.put(socket.assigns.filters, :email, email)

    params = build_params(filters)
    {:noreply, push_patch(socket, to: ~p"/users?#{params}")}
  end

  @impl true
  def handle_event("clear_filters", _params, socket) do
    {:noreply, push_patch(socket, to: ~p"/users")}
  end

  @impl true
  def handle_event("toggle_filters", _params, socket) do
    {:noreply, assign(socket, :show_filters, !socket.assigns.show_filters)}
  end

  @impl true
  def handle_event("show_suspend_modal", %{"user-id" => user_id}, socket) do
    user = Users.get_user_detail(user_id)

    {:noreply,
     socket
     |> assign(:show_suspend_modal, true)
     |> assign(:selected_user, user)
     |> assign(:suspend_reason, "")}
  end

  @impl true
  def handle_event("close_suspend_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:show_suspend_modal, false)
     |> assign(:selected_user, nil)
     |> assign(:suspend_reason, "")}
  end

  @impl true
  def handle_event("update_suspend_reason", %{"reason" => reason}, socket) do
    {:noreply, assign(socket, :suspend_reason, reason)}
  end

  @impl true
  def handle_event("suspend_user", _params, socket) do
    user = socket.assigns.selected_user
    current_admin = socket.assigns.current_admin
    reason = socket.assigns.suspend_reason

    case Users.suspend_user(user, current_admin.id, reason) do
      {:ok, _updated_user} ->
        # Reload users list
        {users, pagination} = Users.list_users(socket.assigns.filters)

        {:noreply,
         socket
         |> assign(:users, users)
         |> assign(:pagination, pagination)
         |> assign(:show_suspend_modal, false)
         |> assign(:selected_user, nil)
         |> assign(:suspend_reason, "")
         |> put_flash(:info, "User suspended successfully.")}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to suspend user.")}
    end
  end

  @impl true
  def handle_event("show_change_tier_modal", %{"user-id" => user_id}, socket) do
    user = Users.get_user_detail(user_id)

    {:noreply,
     socket
     |> assign(:show_change_tier_modal, true)
     |> assign(:selected_user, user)
     |> assign(:new_tier, user.tier)
     |> assign(:tier_change_reason, "")}
  end

  @impl true
  def handle_event("close_change_tier_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:show_change_tier_modal, false)
     |> assign(:selected_user, nil)
     |> assign(:new_tier, nil)
     |> assign(:tier_change_reason, "")}
  end

  @impl true
  def handle_event("update_tier_selection", %{"tier" => tier}, socket) do
    {:noreply, assign(socket, :new_tier, String.to_atom(tier))}
  end

  @impl true
  def handle_event("update_tier_reason", %{"reason" => reason}, socket) do
    {:noreply, assign(socket, :tier_change_reason, reason)}
  end

  @impl true
  def handle_event("change_tier", _params, socket) do
    user = socket.assigns.selected_user
    current_admin = socket.assigns.current_admin
    new_tier = socket.assigns.new_tier
    reason = socket.assigns.tier_change_reason

    case Users.change_user_tier(user, new_tier, current_admin.id, reason) do
      {:ok, _updated_user} ->
        # Reload users list
        {users, pagination} = Users.list_users(socket.assigns.filters)

        {:noreply,
         socket
         |> assign(:users, users)
         |> assign(:pagination, pagination)
         |> assign(:show_change_tier_modal, false)
         |> assign(:selected_user, nil)
         |> assign(:new_tier, nil)
         |> assign(:tier_change_reason, "")
         |> put_flash(:info, "User tier changed successfully.")}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to change user tier.")}
    end
  end

  defp maybe_add_filter(filters, _key, nil), do: filters
  defp maybe_add_filter(filters, _key, ""), do: filters
  defp maybe_add_filter(filters, key, value), do: Map.put(filters, key, value)

  defp parse_atom(nil), do: nil
  defp parse_atom(""), do: nil
  defp parse_atom(value) when is_binary(value), do: String.to_atom(value)
  defp parse_atom(value), do: value

  defp build_params(filters) do
    filters
    |> Enum.reject(fn {k, v} -> k in [:page_size] or is_nil(v) or v == "" end)
    |> Enum.into(%{})
  end

  defp format_number(number) when is_integer(number) do
    number
    |> Integer.to_string()
    |> String.graphemes()
    |> Enum.reverse()
    |> Enum.chunk_every(3)
    |> Enum.join(",")
    |> String.reverse()
  end

  defp format_number(nil), do: "0"

  defp get_user_initials(user) do
    cond do
      user.username && user.username != "" ->
        user.username |> String.first() |> String.upcase()

      user.email ->
        user.email |> String.first() |> String.upcase()

      true ->
        "U"
    end
  end

  defp get_avatar_color(index) do
    colors = [
      "bg-purple-500",
      "bg-blue-500",
      "bg-green-500",
      "bg-orange-500",
      "bg-red-500",
      "bg-indigo-500",
      "bg-pink-500",
      "bg-teal-500"
    ]

    Enum.at(colors, rem(index, length(colors)))
  end

  defp format_tier(tier) do
    case tier do
      :stella_one -> "Stella One"
      :stella_unum -> "Stella Unum"
      :stella_eon -> "Stella Eon"
      :stella_plenum -> "Stella Plenum"
      _ -> "Unknown"
    end
  end

  defp format_date(nil), do: "-"

  defp format_date(datetime) do
    Calendar.strftime(datetime, "%Y-%m-%d")
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-4">
      <%!-- Page Header --%>
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold text-base-content">Users Management</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Manage and monitor all platform users
          </p>
        </div>
        <button class="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-primary-content rounded text-sm font-medium transition-colors">
          <.icon name="hero-plus" class="inline size-4 mr-1" />
          Add User
        </button>
      </div>

      <%!-- Stats Cards --%>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Total Users</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= format_number(@stats[:total_users] || 0) %>
          </p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Active Users</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= format_number(@stats[:active_users] || 0) %>
          </p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Verified Users</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= format_number(@stats[:verified_users] || 0) %>
          </p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Suspended</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= format_number(@stats[:suspended_users] || 0) %>
          </p>
          <%= if @stats[:suspended_users] && @stats[:suspended_users] > 0 do %>
            <p class="text-xs text-error">Needs attention</p>
          <% end %>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">New This Week</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= format_number(@stats[:new_this_week] || 0) %>
          </p>
        </div>
      </div>

      <%!-- Filters and Search --%>
      <div class="bg-base-200 rounded p-4 border border-base-300">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div class="flex items-center space-x-2 overflow-x-auto w-full md:w-auto">
            <button
              phx-click="filter"
              phx-value-status=""
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap",
                is_nil(@filters[:status]) && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              All Users
            </button>
            <button
              phx-click="filter"
              phx-value-status="active"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap",
                @filters[:status] == :active && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Active
            </button>
            <button
              phx-click="filter"
              phx-value-status="suspended"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap",
                @filters[:status] == :suspended && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Suspended
            </button>
            <button
              phx-click="filter"
              phx-value-status="pending_verification"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap",
                @filters[:status] == :pending_verification && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Pending
            </button>
            <button
              phx-click="filter"
              phx-value-status="banned"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap",
                @filters[:status] == :banned && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Banned
            </button>
          </div>

          <div class="relative w-full md:w-auto">
            <.icon name="hero-magnifying-glass" class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/40 pointer-events-none" />
            <form phx-submit="search">
              <input
                type="text"
                name="email"
                value={@filters[:email] || ""}
                placeholder="Search by email..."
                class="bg-base-300 border-0 rounded pl-9 pr-3 py-2 text-sm text-base-content placeholder:text-base-content/40 focus:outline-none focus:ring-2 focus:ring-primary w-full md:w-64"
              />
            </form>
          </div>
        </div>
      </div>

      <%!-- Users Table --%>
      <div class="bg-base-200 rounded border border-base-300 overflow-x-auto">
        <table class="w-full min-w-[800px]">
          <thead class="bg-base-300/50 border-b border-base-300">
            <tr>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">User</th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Status</th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Tier</th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                Verified
              </th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Joined</th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                Last Login
              </th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Actions</th>
            </tr>
          </thead>
          <tbody>
            <%= if Enum.empty?(@users) do %>
              <tr>
                <td colspan="7" class="py-8 text-center text-base-content/60">
                  No users found
                </td>
              </tr>
            <% else %>
              <%= for {user, index} <- Enum.with_index(@users) do %>
                <tr class="border-b border-base-300 hover:bg-base-300/30 transition-colors">
                  <td class="py-3 px-4">
                    <div class="flex items-center space-x-3">
                      <div class={"w-10 h-10 #{get_avatar_color(index)} rounded-full flex items-center justify-center"}>
                        <span class="text-white text-sm font-medium">
                          <%= get_user_initials(user) %>
                        </span>
                      </div>
                      <div>
                        <div class="flex items-center space-x-1">
                          <p class="text-sm font-medium text-base-content"><%= user.email %></p>
                        </div>
                        <%= if user.username do %>
                          <p class="text-xs text-base-content/60">@<%= user.username %></p>
                        <% end %>
                      </div>
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <span class={[
                      "px-2 py-1 rounded-full text-xs font-medium",
                      user.status == :active && "bg-success/20 text-success",
                      user.status == :suspended && "bg-error/20 text-error",
                      user.status == :banned && "bg-error/20 text-error",
                      user.status == :pending_verification && "bg-warning/20 text-warning",
                      user.status == :deactivated && "bg-base-content/20 text-base-content/60"
                    ]}>
                      <%= user.status |> to_string() |> String.replace("_", " ") |> String.capitalize() %>
                    </span>
                  </td>
                  <td class="py-3 px-4">
                    <span class="px-2 py-1 rounded text-xs font-medium bg-primary/20 text-primary">
                      <%= format_tier(user.tier) %>
                    </span>
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex items-center space-x-2">
                      <%= if user.email_verified do %>
                        <.icon name="hero-check-badge" class="size-4 text-success" />
                      <% else %>
                        <.icon name="hero-x-circle" class="size-4 text-base-content/40" />
                      <% end %>
                      <%= if user.phone_verified do %>
                        <.icon name="hero-device-phone-mobile" class="size-4 text-success" />
                      <% else %>
                        <.icon name="hero-device-phone-mobile" class="size-4 text-base-content/40" />
                      <% end %>
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <p class="text-xs text-base-content/60"><%= format_date(user.created_at) %></p>
                  </td>
                  <td class="py-3 px-4">
                    <p class="text-xs text-base-content/60"><%= format_date(user.last_login_at) %></p>
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex items-center space-x-2">
                      <a
                        href={~p"/users/#{user.id}"}
                        class="p-1 hover:bg-base-300 rounded transition-colors"
                        title="View Details"
                      >
                        <.icon name="hero-eye" class="size-4 text-base-content/60" />
                      </a>
                      <button
                        phx-click="show_change_tier_modal"
                        phx-value-user-id={user.id}
                        class="p-1 hover:bg-base-300 rounded transition-colors"
                        title="Change Tier"
                      >
                        <.icon name="hero-arrow-path" class="size-4 text-primary/60 hover:text-primary" />
                      </button>
                      <%= if user.status != :suspended do %>
                        <button
                          phx-click="show_suspend_modal"
                          phx-value-user-id={user.id}
                          class="p-1 hover:bg-base-300 rounded transition-colors"
                          title="Suspend User"
                        >
                          <.icon name="hero-no-symbol" class="size-4 text-error/60 hover:text-error" />
                        </button>
                      <% end %>
                    </div>
                  </td>
                </tr>
              <% end %>
            <% end %>
          </tbody>
        </table>
      </div>

      <%!-- Pagination --%>
      <%= if @pagination[:total_pages] && @pagination[:total_pages] > 1 do %>
        <div class="flex items-center justify-between">
          <p class="text-xs text-base-content/60">
            Showing <%= ((@pagination[:page] - 1) * @pagination[:page_size]) + 1 %> to <%= min(
              @pagination[:page] * @pagination[:page_size],
              @pagination[:total_count]
            ) %> of <%= format_number(@pagination[:total_count]) %> users
          </p>
          <div class="flex items-center space-x-2">
            <%= if @pagination[:page] > 1 do %>
              <a
                href={~p"/users?#{build_params(Map.put(@filters, :page, @pagination[:page] - 1))}"}
                class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors"
              >
                Previous
              </a>
            <% end %>

            <%= for page_num <- max(1, @pagination[:page] - 2)..min(
                  @pagination[:total_pages],
                  @pagination[:page] + 2
                ) do %>
              <a
                href={~p"/users?#{build_params(Map.put(@filters, :page, page_num))}"}
                class={[
                  "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                  page_num == @pagination[:page] &&
                    "bg-primary text-primary-content" ||
                    "bg-base-200 hover:bg-base-300 text-base-content border border-base-300"
                ]}
              >
                <%= page_num %>
              </a>
            <% end %>

            <%= if @pagination[:page] < @pagination[:total_pages] do %>
              <a
                href={~p"/users?#{build_params(Map.put(@filters, :page, @pagination[:page] + 1))}"}
                class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors"
              >
                Next
              </a>
            <% end %>
          </div>
        </div>
      <% end %>
    </div>

    <%!-- Suspend User Modal --%>
    <%= if @show_suspend_modal && @selected_user do %>
      <div
        class="fixed inset-0 z-50 overflow-y-auto"
        aria-labelledby="suspend-modal-title"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div
            class="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 transition-opacity"
            phx-click="close_suspend_modal"
          >
          </div>
          <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
            &#8203;
          </span>
          <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-base-content">Suspend User</h3>
              <button
                phx-click="close_suspend_modal"
                class="p-1 hover:bg-base-300 rounded transition-colors"
              >
                <.icon name="hero-x-mark" class="size-5 text-base-content/60" />
              </button>
            </div>

            <div class="mb-6">
              <div class="flex items-center space-x-3 mb-4">
                <div class="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                  <span class="text-white text-lg font-medium">
                    <%= get_user_initials(@selected_user) %>
                  </span>
                </div>
                <div>
                  <p class="text-base font-medium text-base-content"><%= @selected_user.email %></p>
                  <%= if @selected_user.username do %>
                    <p class="text-sm text-base-content/60">@<%= @selected_user.username %></p>
                  <% end %>
                </div>
              </div>

              <div class="bg-error/10 border border-error/20 rounded p-4 mb-4">
                <p class="text-sm text-base-content/80">
                  Are you sure you want to suspend this user? This action will:
                </p>
                <ul class="mt-2 space-y-1 text-xs text-base-content/70">
                  <li>• Disable their trading capabilities</li>
                  <li>• Stop all active bots</li>
                  <li>• Prevent login access</li>
                  <li>• Notify the user via email</li>
                </ul>
              </div>

              <div>
                <label class="block text-sm font-medium text-base-content mb-2">
                  Reason for suspension (required)
                </label>
                <textarea
                  phx-change="update_suspend_reason"
                  name="reason"
                  rows="3"
                  placeholder="Enter the reason for suspending this user..."
                  class="w-full px-3 py-2 bg-base-300 border border-base-content/20 rounded text-sm text-base-content placeholder:text-base-content/40 focus:outline-none focus:ring-2 focus:ring-primary"
                ><%= @suspend_reason %></textarea>
              </div>
            </div>

            <div class="flex items-center justify-end space-x-3">
              <button
                phx-click="close_suspend_modal"
                class="px-4 py-2 bg-base-300 hover:bg-base-content/20 rounded text-sm font-medium text-base-content transition-colors"
              >
                Cancel
              </button>
              <button
                phx-click="suspend_user"
                disabled={@suspend_reason == ""}
                class="px-4 py-2 bg-error hover:bg-error/90 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suspend User
              </button>
            </div>
          </div>
        </div>
      </div>
    <% end %>
    <%!-- Change Tier Modal --%>
    <%= if @show_change_tier_modal && @selected_user do %>
      <div
        class="fixed inset-0 z-50 overflow-y-auto"
        aria-labelledby="tier-modal-title"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div
            class="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 transition-opacity"
            phx-click="close_change_tier_modal"
          >
          </div>
          <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
            &#8203;
          </span>
          <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-base-content">Change User Tier</h3>
              <button
                phx-click="close_change_tier_modal"
                class="p-1 hover:bg-base-300 rounded transition-colors"
              >
                <.icon name="hero-x-mark" class="size-5 text-base-content/60" />
              </button>
            </div>

            <div class="mb-6">
              <div class="flex items-center space-x-3 mb-4">
                <div class="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <span class="text-white text-lg font-medium">
                    <%= get_user_initials(@selected_user) %>
                  </span>
                </div>
                <div>
                  <p class="text-base font-medium text-base-content"><%= @selected_user.email %></p>
                  <%= if @selected_user.username do %>
                    <p class="text-sm text-base-content/60">@<%= @selected_user.username %></p>
                  <% end %>
                  <p class="text-xs text-base-content/50">
                    Current tier: <%= format_tier(@selected_user.tier) %>
                  </p>
                </div>
              </div>

              <div class="mb-4">
                <label class="block text-sm font-medium text-base-content mb-2">
                  New Tier
                </label>
                <select
                  phx-change="update_tier_selection"
                  name="tier"
                  class="w-full px-3 py-2 bg-base-300 border border-base-content/20 rounded text-sm text-base-content focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="stella_one" selected={@new_tier == :stella_one}>Stella One</option>
                  <option value="stella_unum" selected={@new_tier == :stella_unum}>
                    Stella Unum
                  </option>
                  <option value="stella_eon" selected={@new_tier == :stella_eon}>Stella Eon</option>
                  <option value="stella_plenum" selected={@new_tier == :stella_plenum}>
                    Stella Plenum
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-base-content mb-2">
                  Reason for tier change (required)
                </label>
                <textarea
                  phx-change="update_tier_reason"
                  name="reason"
                  rows="3"
                  placeholder="Enter the reason for changing this user's tier..."
                  class="w-full px-3 py-2 bg-base-300 border border-base-content/20 rounded text-sm text-base-content placeholder:text-base-content/40 focus:outline-none focus:ring-2 focus:ring-primary"
                ><%= @tier_change_reason %></textarea>
              </div>
            </div>

            <div class="flex items-center justify-end space-x-3">
              <button
                phx-click="close_change_tier_modal"
                class="px-4 py-2 bg-base-300 hover:bg-base-content/20 rounded text-sm font-medium text-base-content transition-colors"
              >
                Cancel
              </button>
              <button
                phx-click="change_tier"
                disabled={@tier_change_reason == "" || @new_tier == @selected_user.tier}
                class="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-content rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Change Tier
              </button>
            </div>
          </div>
        </div>
      </div>
    <% end %>
    """
  end
end
