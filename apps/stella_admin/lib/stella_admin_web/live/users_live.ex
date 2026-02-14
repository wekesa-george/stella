defmodule StellaAdminWeb.UsersLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Users")
     |> assign(:current_page, :users)
     |> assign(:users, sample_users())
     |> assign(:filter, "all")
     |> assign(:show_suspend_modal, false)
     |> assign(:selected_user, nil)}
  end

  @impl true
  def handle_event("filter", %{"type" => type}, socket) do
    {:noreply, assign(socket, :filter, type)}
  end

  @impl true
  def handle_event("show_suspend_modal", %{"user-id" => user_id}, socket) do
    user = Enum.find(socket.assigns.users, &(&1.id == String.to_integer(user_id)))

    {:noreply,
     socket
     |> assign(:show_suspend_modal, true)
     |> assign(:selected_user, user)}
  end

  @impl true
  def handle_event("close_suspend_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:show_suspend_modal, false)
     |> assign(:selected_user, nil)}
  end

  @impl true
  def handle_event("suspend_user", _params, socket) do
    user = socket.assigns.selected_user

    updated_users =
      Enum.map(socket.assigns.users, fn u ->
        if u.id == user.id do
          %{u | status: "suspended"}
        else
          u
        end
      end)

    {:noreply,
     socket
     |> assign(:users, updated_users)
     |> assign(:show_suspend_modal, false)
     |> assign(:selected_user, nil)
     |> put_flash(:info, "User #{user.name} has been suspended successfully.")}
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

  defp sample_users do
    [
      %{
        id: 1,
        name: "Sarah Chen",
        email: "sarah.chen@example.com",
        username: "@crypto_queen",
        status: "active",
        verified: true,
        joined: "2025-12-15",
        total_trades: 1247,
        portfolio_value: "$45,230",
        followers: 2341,
        following: 89,
        win_rate: "68.3%",
        avatar_color: "bg-purple-500"
      },
      %{
        id: 2,
        name: "Michael Torres",
        email: "michael.torres@example.com",
        username: "@btc_master",
        status: "active",
        verified: true,
        joined: "2025-11-22",
        total_trades: 892,
        portfolio_value: "$32,450",
        followers: 1892,
        following: 124,
        win_rate: "72.1%",
        avatar_color: "bg-blue-500"
      },
      %{
        id: 3,
        name: "Emma Wilson",
        email: "emma.wilson@example.com",
        username: "@eth_trader",
        status: "active",
        verified: true,
        joined: "2026-01-08",
        total_trades: 654,
        portfolio_value: "$28,900",
        followers: 1654,
        following: 67,
        win_rate: "65.8%",
        avatar_color: "bg-green-500"
      },
      %{
        id: 4,
        name: "James Park",
        email: "james.park@example.com",
        username: "@sol_whale",
        status: "active",
        verified: false,
        joined: "2026-01-20",
        total_trades: 423,
        portfolio_value: "$18,750",
        followers: 892,
        following: 45,
        win_rate: "61.4%",
        avatar_color: "bg-orange-500"
      },
      %{
        id: 5,
        name: "Maria Garcia",
        email: "maria.garcia@example.com",
        username: "@defi_maven",
        status: "suspended",
        verified: true,
        joined: "2025-10-14",
        total_trades: 1089,
        portfolio_value: "$0",
        followers: 1234,
        following: 156,
        win_rate: "58.2%",
        avatar_color: "bg-red-500"
      },
      %{
        id: 6,
        name: "Alex Kumar",
        email: "alex.kumar@example.com",
        username: "@alt_hunter",
        status: "active",
        verified: true,
        joined: "2025-12-01",
        total_trades: 734,
        portfolio_value: "$22,100",
        followers: 1456,
        following: 92,
        win_rate: "69.7%",
        avatar_color: "bg-indigo-500"
      },
      %{
        id: 7,
        name: "Sophie Martin",
        email: "sophie.martin@example.com",
        username: "@margin_queen",
        status: "inactive",
        verified: false,
        joined: "2025-09-05",
        total_trades: 234,
        portfolio_value: "$5,230",
        followers: 456,
        following: 34,
        win_rate: "54.1%",
        avatar_color: "bg-pink-500"
      },
      %{
        id: 8,
        name: "David Lee",
        email: "david.lee@example.com",
        username: "@day_trader",
        status: "active",
        verified: true,
        joined: "2026-01-15",
        total_trades: 2145,
        portfolio_value: "$67,890",
        followers: 3234,
        following: 178,
        win_rate: "71.5%",
        avatar_color: "bg-teal-500"
      }
    ]
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
          <p class="text-2xl font-bold text-base-content mb-1">12,543</p>
          <p class="text-xs text-success">+12.5% vs last month</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Active Users</p>
          <p class="text-2xl font-bold text-base-content mb-1">8,234</p>
          <p class="text-xs text-success">+8.3% vs last month</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Verified Users</p>
          <p class="text-2xl font-bold text-base-content mb-1">9,876</p>
          <p class="text-xs text-base-content/50">78.7% of total</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Suspended</p>
          <p class="text-2xl font-bold text-base-content mb-1">45</p>
          <p class="text-xs text-error">Needs attention</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">New This Week</p>
          <p class="text-2xl font-bold text-base-content mb-1">234</p>
          <p class="text-xs text-success">+15.2% vs last week</p>
        </div>
      </div>

      <%!-- Filters and Search --%>
      <div class="bg-base-200 rounded p-4 border border-base-300">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div class="flex items-center space-x-2 overflow-x-auto w-full md:w-auto">
            <button
              phx-click="filter"
              phx-value-type="all"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "all" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              All Users
            </button>
            <button
              phx-click="filter"
              phx-value-type="active"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "active" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Active
            </button>
            <button
              phx-click="filter"
              phx-value-type="verified"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "verified" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Verified
            </button>
            <button
              phx-click="filter"
              phx-value-type="suspended"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "suspended" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Suspended
            </button>
          </div>

          <div class="relative w-full md:w-auto">
            <.icon name="hero-magnifying-glass" class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/40 pointer-events-none" />
            <input
              type="text"
              placeholder="Search users..."
              class="bg-base-300 border-0 rounded pl-9 pr-3 py-2 text-sm text-base-content placeholder:text-base-content/40 focus:outline-none focus:ring-2 focus:ring-primary w-full md:w-64"
            />
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
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                Portfolio Value
              </th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                Total Trades
              </th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Win Rate</th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                Followers
              </th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Joined</th>
              <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Actions</th>
            </tr>
          </thead>
          <tbody>
            <%= for user <- @users do %>
              <tr class="border-b border-base-300 hover:bg-base-300/30 transition-colors">
                <td class="py-3 px-4">
                  <div class="flex items-center space-x-3">
                    <div class={"w-10 h-10 #{user.avatar_color} rounded-full flex items-center justify-center"}>
                      <span class="text-white text-sm font-medium">
                        <%= String.first(user.name) %>
                      </span>
                    </div>
                    <div>
                      <div class="flex items-center space-x-1">
                        <p class="text-sm font-medium text-base-content"><%= user.name %></p>
                        <%= if user.verified do %>
                          <.icon name="hero-check-badge" class="size-4 text-primary" />
                        <% end %>
                      </div>
                      <p class="text-xs text-base-content/60"><%= user.username %></p>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <span class={[
                    "px-2 py-1 rounded-full text-xs font-medium",
                    user.status == "active" && "bg-success/20 text-success",
                    user.status == "suspended" && "bg-error/20 text-error",
                    user.status == "inactive" && "bg-base-content/20 text-base-content/60"
                  ]}>
                    <%= String.capitalize(user.status) %>
                  </span>
                </td>
                <td class="py-3 px-4">
                  <p class="text-sm font-medium text-base-content"><%= user.portfolio_value %></p>
                </td>
                <td class="py-3 px-4">
                  <p class="text-sm text-base-content">
                    <%= format_number(user.total_trades) %>
                  </p>
                </td>
                <td class="py-3 px-4">
                  <p class="text-sm font-medium text-success"><%= user.win_rate %></p>
                </td>
                <td class="py-3 px-4">
                  <p class="text-sm text-base-content">
                    <%= format_number(user.followers) %>
                  </p>
                </td>
                <td class="py-3 px-4">
                  <p class="text-xs text-base-content/60"><%= user.joined %></p>
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
                      phx-click="show_suspend_modal"
                      phx-value-user-id={user.id}
                      class="p-1 hover:bg-base-300 rounded transition-colors"
                      title="Suspend User"
                    >
                      <.icon name="hero-no-symbol" class="size-4 text-error/60 hover:text-error" />
                    </button>
                  </div>
                </td>
              </tr>
            <% end %>
          </tbody>
        </table>
      </div>

      <%!-- Pagination --%>
      <div class="flex items-center justify-between">
        <p class="text-xs text-base-content/60">
          Showing 1 to 8 of 12,543 users
        </p>
        <div class="flex items-center space-x-2">
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            Previous
          </button>
          <button class="px-3 py-1.5 bg-primary text-primary-content rounded text-xs font-medium transition-colors">
            1
          </button>
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            2
          </button>
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            3
          </button>
          <span class="text-xs text-base-content/60">...</span>
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            157
          </button>
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            Next
          </button>
        </div>
      </div>
    </div>

    <%!-- Suspend User Modal --%>
    <%= if @show_suspend_modal && @selected_user do %>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-base-200 rounded border border-base-300 p-6 max-w-md w-full mx-4">
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
              <div class={"w-12 h-12 #{@selected_user.avatar_color} rounded-full flex items-center justify-center"}>
                <span class="text-white text-lg font-medium">
                  <%= String.first(@selected_user.name) %>
                </span>
              </div>
              <div>
                <p class="text-base font-medium text-base-content"><%= @selected_user.name %></p>
                <p class="text-sm text-base-content/60"><%= @selected_user.username %></p>
              </div>
            </div>

            <div class="bg-error/10 border border-error/20 rounded p-4">
              <p class="text-sm text-base-content/80">
                Are you sure you want to suspend this user? This action will:
              </p>
              <ul class="mt-2 space-y-1 text-xs text-base-content/70">
                <li>• Disable their trading capabilities</li>
                <li>• Close all open positions</li>
                <li>• Prevent login access</li>
                <li>• Notify the user via email</li>
              </ul>
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
              class="px-4 py-2 bg-error hover:bg-error/90 text-white rounded text-sm font-medium transition-colors"
            >
              Suspend User
            </button>
          </div>
        </div>
      </div>
    <% end %>
    """
  end
end
