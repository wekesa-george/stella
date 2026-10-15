defmodule StellaAdminWeb.FinanceLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Finance")
     |> assign(:current_page, :finance)
     |> assign(:recent_transactions, get_recent_transactions())
     |> assign(:revenue_breakdown, get_revenue_breakdown())
     |> assign(:pending_withdrawals, get_pending_withdrawals())
     |> assign(:filter, "all")}
  end

  @impl true
  def handle_event("filter", %{"type" => type}, socket) do
    {:noreply, assign(socket, :filter, type)}
  end

  defp get_recent_transactions do
    [
      %{
        id: "TXN-2024-001",
        user: "Sarah Chen",
        username: "@crypto_queen",
        type: "Trading Fee",
        amount: "$45.20",
        status: "completed",
        method: "Platform Wallet",
        timestamp: "2 mins ago",
        avatar_color: "bg-purple-500"
      },
      %{
        id: "TXN-2024-002",
        user: "Michael Torres",
        username: "@btc_master",
        type: "Copy Trade Fee",
        amount: "$28.50",
        status: "completed",
        method: "Platform Wallet",
        timestamp: "5 mins ago",
        avatar_color: "bg-blue-500"
      },
      %{
        id: "TXN-2024-003",
        user: "Emma Wilson",
        username: "@eth_trader",
        type: "Withdrawal",
        amount: "$1,250.00",
        status: "pending",
        method: "Bank Transfer",
        timestamp: "12 mins ago",
        avatar_color: "bg-green-500"
      },
      %{
        id: "TXN-2024-004",
        user: "David Lee",
        username: "@day_trader",
        type: "Deposit",
        amount: "$5,000.00",
        status: "completed",
        method: "Crypto (BTC)",
        timestamp: "23 mins ago",
        avatar_color: "bg-teal-500"
      },
      %{
        id: "TXN-2024-005",
        user: "Alex Kumar",
        username: "@alt_hunter",
        type: "Subscription",
        amount: "$29.99",
        status: "completed",
        method: "Credit Card",
        timestamp: "1 hour ago",
        avatar_color: "bg-indigo-500"
      },
      %{
        id: "TXN-2024-006",
        user: "Sophie Martin",
        username: "@margin_queen",
        type: "Trading Fee",
        amount: "$15.75",
        status: "failed",
        method: "Platform Wallet",
        timestamp: "2 hours ago",
        avatar_color: "bg-pink-500"
      }
    ]
  end

  defp get_revenue_breakdown do
    [
      %{source: "Trading Fees", amount: "$45,230", percentage: "48%", trend: "+12.3%"},
      %{source: "Copy Trade Fees", amount: "$28,450", percentage: "30%", trend: "+8.7%"},
      %{source: "Subscriptions", amount: "$12,890", percentage: "14%", trend: "+15.2%"},
      %{source: "Withdrawal Fees", amount: "$5,670", percentage: "6%", trend: "+3.1%"},
      %{source: "Other", amount: "$1,995", percentage: "2%", trend: "-2.4%"}
    ]
  end

  defp get_pending_withdrawals do
    [
      %{
        id: "WD-001",
        user: "Emma Wilson",
        username: "@eth_trader",
        amount: "$1,250.00",
        method: "Bank Transfer",
        requested: "12 mins ago",
        avatar_color: "bg-green-500"
      },
      %{
        id: "WD-002",
        user: "James Park",
        username: "@sol_whale",
        amount: "$3,450.00",
        method: "Crypto (ETH)",
        requested: "45 mins ago",
        avatar_color: "bg-orange-500"
      },
      %{
        id: "WD-003",
        user: "Maria Garcia",
        username: "@defi_maven",
        amount: "$890.00",
        method: "Bank Transfer",
        requested: "2 hours ago",
        avatar_color: "bg-red-500"
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
          <h1 class="text-xl sm:text-2xl font-bold text-base-content">Finance Overview</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Track revenue, transactions, and financial metrics
          </p>
        </div>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
          <button class="px-4 py-2 bg-base-200 hover:bg-base-300 border border-base-300 rounded text-sm font-medium text-base-content transition-colors">
            <.icon name="hero-calendar" class="inline size-4 mr-1" />
            Last 30 Days
          </button>
          <button class="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-content rounded text-sm font-medium transition-colors">
            <.icon name="hero-arrow-down-tray" class="inline size-4 mr-1" />
            Export Report
          </button>
        </div>
      </div>

      <%!-- Financial Stats --%>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Total Revenue</p>
          <p class="text-2xl font-bold text-base-content mb-1">$187.2K</p>
          <p class="text-xs text-success">+15.3% vs last month</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Trading Fees</p>
          <p class="text-2xl font-bold text-base-content mb-1">$45.2K</p>
          <p class="text-xs text-success">+12.3% vs last month</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Subscriptions</p>
          <p class="text-2xl font-bold text-base-content mb-1">$12.9K</p>
          <p class="text-xs text-success">+15.2% vs last month</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Pending Withdrawals</p>
          <p class="text-2xl font-bold text-warning mb-1">$5.6K</p>
          <p class="text-xs text-base-content/50">3 requests</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Failed Transactions</p>
          <p class="text-2xl font-bold text-error mb-1">12</p>
          <p class="text-xs text-base-content/50">Last 24h</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Avg Transaction</p>
          <p class="text-2xl font-bold text-base-content mb-1">$342</p>
          <p class="text-xs text-success">+8.7% vs last week</p>
        </div>
      </div>

      <%!-- Revenue Breakdown & Pending Withdrawals --%>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <%!-- Revenue Breakdown --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Revenue Breakdown</h2>
          </div>
          <div class="p-4">
            <div class="space-y-4">
              <%= for item <- @revenue_breakdown do %>
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="flex items-center justify-between mb-1">
                      <p class="text-sm font-medium text-base-content"><%= item.source %></p>
                      <p class="text-sm font-bold text-base-content"><%= item.amount %></p>
                    </div>
                    <div class="flex items-center justify-between">
                      <div class="flex-1 bg-base-300 rounded-full h-2 mr-3">
                        <div
                          class="bg-primary rounded-full h-2"
                          style={"width: #{item.percentage}"}
                        >
                        </div>
                      </div>
                      <p class={[
                        "text-xs font-medium",
                        String.starts_with?(item.trend, "+") && "text-success",
                        String.starts_with?(item.trend, "-") && "text-error"
                      ]}>
                        <%= item.trend %>
                      </p>
                    </div>
                  </div>
                </div>
              <% end %>
            </div>
          </div>
        </div>

        <%!-- Pending Withdrawals --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300 flex items-center justify-between">
            <h2 class="text-base font-semibold text-base-content">Pending Withdrawals</h2>
            <span class="px-2 py-1 bg-warning/20 text-warning rounded text-xs font-medium">
              <%= length(@pending_withdrawals) %> Pending
            </span>
          </div>
          <div class="p-4">
            <div class="space-y-3">
              <%= for withdrawal <- @pending_withdrawals do %>
                <div class="bg-base-300/30 rounded p-3 border border-base-300/50">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-2">
                      <div class={"w-8 h-8 #{withdrawal.avatar_color} rounded-full flex items-center justify-center"}>
                        <span class="text-white text-xs font-medium">
                          <%= String.first(withdrawal.user) %>
                        </span>
                      </div>
                      <div>
                        <p class="text-sm font-medium text-base-content"><%= withdrawal.user %></p>
                        <p class="text-xs text-base-content/60"><%= withdrawal.username %></p>
                      </div>
                    </div>
                    <p class="text-sm font-bold text-base-content"><%= withdrawal.amount %></p>
                  </div>
                  <div class="flex items-center justify-between text-xs text-base-content/60">
                    <span><%= withdrawal.method %></span>
                    <span><%= withdrawal.requested %></span>
                  </div>
                  <div class="flex items-center space-x-2 mt-3">
                    <button class="flex-1 px-3 py-1.5 bg-success hover:bg-success/90 text-white rounded text-xs font-medium transition-colors">
                      Approve
                    </button>
                    <button class="flex-1 px-3 py-1.5 bg-error hover:bg-error/90 text-white rounded text-xs font-medium transition-colors">
                      Reject
                    </button>
                  </div>
                </div>
              <% end %>
            </div>
          </div>
        </div>
      </div>

      <%!-- Recent Transactions --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-base-content">Recent Transactions</h2>
          <div class="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto">
            <button
              phx-click="filter"
              phx-value-type="all"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "all" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              All
            </button>
            <button
              phx-click="filter"
              phx-value-type="completed"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "completed" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Completed
            </button>
            <button
              phx-click="filter"
              phx-value-type="pending"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "pending" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Pending
            </button>
            <button
              phx-click="filter"
              phx-value-type="failed"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "failed" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Failed
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[900px]">
            <thead class="bg-base-300/50 border-b border-base-300">
              <tr>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Transaction ID
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">User</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Type</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Amount
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Method
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Status
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Time</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              <%= for txn <- @recent_transactions do %>
                <tr class="border-b border-base-300 hover:bg-base-300/30 transition-colors">
                  <td class="py-2.5 px-4">
                    <p class="text-xs font-mono text-base-content/80"><%= txn.id %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <div class="flex items-center space-x-2">
                      <div class={"w-8 h-8 #{txn.avatar_color} rounded-full flex items-center justify-center"}>
                        <span class="text-white text-xs font-medium">
                          <%= String.first(txn.user) %>
                        </span>
                      </div>
                      <div>
                        <p class="text-xs font-medium text-base-content"><%= txn.user %></p>
                        <p class="text-xs text-base-content/60"><%= txn.username %></p>
                      </div>
                    </div>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class={[
                      "px-2 py-0.5 rounded text-xs font-medium",
                      txn.type == "Deposit" && "bg-success/20 text-success",
                      txn.type == "Withdrawal" && "bg-warning/20 text-warning",
                      txn.type in ["Trading Fee", "Copy Trade Fee", "Subscription"] &&
                        "bg-primary/20 text-primary"
                    ]}>
                      <%= txn.type %>
                    </span>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-sm font-bold text-base-content"><%= txn.amount %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs text-base-content/70"><%= txn.method %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class={[
                      "px-2 py-0.5 rounded text-xs font-medium",
                      txn.status == "completed" && "bg-success/20 text-success",
                      txn.status == "pending" && "bg-warning/20 text-warning",
                      txn.status == "failed" && "bg-error/20 text-error"
                    ]}>
                      <%= String.capitalize(txn.status) %>
                    </span>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs text-base-content/60"><%= txn.timestamp %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <button class="p-1 hover:bg-base-300 rounded transition-colors">
                      <.icon name="hero-eye" class="size-4 text-base-content/60" />
                    </button>
                  </td>
                </tr>
              <% end %>
            </tbody>
          </table>
        </div>
      </div>

      <%!-- Pagination --%>
      <div class="flex items-center justify-between">
        <p class="text-xs text-base-content/60">
          Showing 1 to 6 of 1,234 transactions
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
            21
          </button>
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            Next
          </button>
        </div>
      </div>
    </div>
    """
  end
end
