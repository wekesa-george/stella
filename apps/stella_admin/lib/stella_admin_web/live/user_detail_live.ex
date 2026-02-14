defmodule StellaAdminWeb.UserDetailLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    user = get_user_by_id(String.to_integer(id))

    {:ok,
     socket
     |> assign(:page_title, user.name)
     |> assign(:current_page, :users)
     |> assign(:user, user)
     |> assign(:recent_trades, get_recent_trades(user.id))
     |> assign(:activity_log, get_activity_log(user.id))}
  end

  defp get_user_by_id(id) do
    # This would normally fetch from database
    users = [
      %{
        id: 1,
        name: "Sarah Chen",
        email: "sarah.chen@example.com",
        username: "@crypto_queen",
        status: "active",
        verified: true,
        joined: "2025-12-15",
        last_login: "2026-02-14 10:23 AM",
        total_trades: 1247,
        portfolio_value: "$45,230",
        followers: 2341,
        following: 89,
        win_rate: "68.3%",
        avatar_color: "bg-purple-500",
        total_profit: "$12,450",
        avg_trade_duration: "4.2h",
        risk_score: "6.5/10",
        kyc_status: "verified",
        phone: "+1 (555) 123-4567",
        country: "United States",
        bio: "Experienced crypto trader specializing in BTC and ETH. 5+ years in the market."
      },
      %{
        id: 2,
        name: "Michael Torres",
        email: "michael.torres@example.com",
        username: "@btc_master",
        status: "active",
        verified: true,
        joined: "2025-11-22",
        last_login: "2026-02-14 09:15 AM",
        total_trades: 892,
        portfolio_value: "$32,450",
        followers: 1892,
        following: 124,
        win_rate: "72.1%",
        avatar_color: "bg-blue-500",
        total_profit: "$8,920",
        avg_trade_duration: "3.8h",
        risk_score: "5.2/10",
        kyc_status: "verified",
        phone: "+1 (555) 234-5678",
        country: "Canada",
        bio: "Bitcoin maximalist and day trader. Conservative risk management."
      }
    ]

    Enum.find(users, fn u -> u.id == id end) || List.first(users)
  end

  defp get_recent_trades(user_id) do
    [
      %{
        id: 1,
        pair: "BTC/USDT",
        type: "Long",
        entry_price: "$42,350",
        exit_price: "$43,120",
        profit: "+$770",
        profit_percent: "+1.82%",
        status: "closed",
        time: "2 hours ago"
      },
      %{
        id: 2,
        pair: "ETH/USDT",
        type: "Long",
        entry_price: "$2,245",
        exit_price: "$2,198",
        profit: "-$47",
        profit_percent: "-2.09%",
        status: "closed",
        time: "5 hours ago"
      },
      %{
        id: 3,
        pair: "SOL/USDT",
        type: "Short",
        entry_price: "$98.50",
        exit_price: "$95.20",
        profit: "+$330",
        profit_percent: "+3.35%",
        status: "closed",
        time: "1 day ago"
      },
      %{
        id: 4,
        pair: "BTC/USDT",
        type: "Long",
        entry_price: "$43,200",
        exit_price: "-",
        profit: "+$1,200",
        profit_percent: "+2.78%",
        status: "open",
        time: "Started 3h ago"
      }
    ]
  end

  defp get_activity_log(_user_id) do
    [
      %{event: "Trade Closed", details: "BTC/USDT Long +$770", time: "2 hours ago"},
      %{event: "Trade Opened", details: "BTC/USDT Long @ $43,200", time: "3 hours ago"},
      %{event: "Trade Closed", details: "ETH/USDT Long -$47", time: "5 hours ago"},
      %{event: "Followed User", details: "@eth_trader", time: "6 hours ago"},
      %{event: "Login", details: "IP: 192.168.1.1", time: "8 hours ago"}
    ]
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-4">
      <%!-- Header with Back Button --%>
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <a
            href={~p"/users"}
            class="p-2 hover:bg-base-300 rounded transition-colors"
            title="Back to Users"
          >
            <.icon name="hero-arrow-left" class="size-5 text-base-content" />
          </a>
          <div>
            <h1 class="text-2xl font-bold text-base-content">User Details</h1>
            <p class="text-sm text-base-content/60 mt-1">
              Viewing profile for <%= @user.username %>
            </p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button class="px-4 py-2 bg-base-200 hover:bg-base-300 border border-base-300 rounded text-sm font-medium text-base-content transition-colors">
            <.icon name="hero-envelope" class="inline size-4 mr-1" />
            Send Email
          </button>
          <button class="px-4 py-2 bg-error hover:bg-error/90 text-white rounded text-sm font-medium transition-colors">
            <.icon name="hero-no-symbol" class="inline size-4 mr-1" />
            Suspend
          </button>
        </div>
      </div>

      <%!-- User Profile Card --%>
      <div class="bg-base-200 rounded border border-base-300 p-6">
        <div class="flex items-start space-x-6">
          <div class={"w-24 h-24 #{@user.avatar_color} rounded-full flex items-center justify-center"}>
            <span class="text-white text-3xl font-bold"><%= String.first(@user.name) %></span>
          </div>

          <div class="flex-1">
            <div class="flex items-center space-x-3 mb-2">
              <h2 class="text-2xl font-bold text-base-content"><%= @user.name %></h2>
              <%= if @user.verified do %>
                <.icon name="hero-check-badge" class="size-6 text-primary" />
              <% end %>
              <span class={[
                "px-3 py-1 rounded-full text-xs font-medium",
                @user.status == "active" && "bg-success/20 text-success",
                @user.status == "suspended" && "bg-error/20 text-error"
              ]}>
                <%= String.capitalize(@user.status) %>
              </span>
            </div>
            <p class="text-base text-base-content/70 mb-1"><%= @user.username %></p>
            <p class="text-sm text-base-content/60 mb-4"><%= @user.email %></p>
            <p class="text-sm text-base-content/80 max-w-2xl"><%= @user.bio %></p>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-base-300">
          <div>
            <p class="text-xs text-base-content/60 mb-1">Joined</p>
            <p class="text-sm font-medium text-base-content"><%= @user.joined %></p>
          </div>
          <div>
            <p class="text-xs text-base-content/60 mb-1">Last Login</p>
            <p class="text-sm font-medium text-base-content"><%= @user.last_login %></p>
          </div>
          <div>
            <p class="text-xs text-base-content/60 mb-1">Country</p>
            <p class="text-sm font-medium text-base-content"><%= @user.country %></p>
          </div>
          <div>
            <p class="text-xs text-base-content/60 mb-1">Phone</p>
            <p class="text-sm font-medium text-base-content"><%= @user.phone %></p>
          </div>
        </div>
      </div>

      <%!-- Stats Grid --%>
      <div class="grid grid-cols-6 gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Portfolio Value</p>
          <p class="text-xl font-bold text-base-content"><%= @user.portfolio_value %></p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Total Profit</p>
          <p class="text-xl font-bold text-success"><%= @user.total_profit %></p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Total Trades</p>
          <p class="text-xl font-bold text-base-content"><%= @user.total_trades %></p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Win Rate</p>
          <p class="text-xl font-bold text-success"><%= @user.win_rate %></p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Followers</p>
          <p class="text-xl font-bold text-base-content"><%= @user.followers %></p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Risk Score</p>
          <p class="text-xl font-bold text-warning"><%= @user.risk_score %></p>
        </div>
      </div>

      <%!-- Two Column Layout --%>
      <div class="grid grid-cols-3 gap-4">
        <%!-- Recent Trades --%>
        <div class="col-span-2 bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h3 class="text-base font-semibold text-base-content">Recent Trades</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-base-300/50 border-b border-base-300">
                <tr>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">Pair</th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">Type</th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Entry Price
                  </th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Exit Price
                  </th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Profit/Loss
                  </th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Status
                  </th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">Time</th>
                </tr>
              </thead>
              <tbody>
                <%= for trade <- @recent_trades do %>
                  <tr class="border-b border-base-300">
                    <td class="py-2.5 px-4">
                      <p class="text-sm font-medium text-base-content"><%= trade.pair %></p>
                    </td>
                    <td class="py-2.5 px-4">
                      <span class={[
                        "px-2 py-0.5 rounded text-xs font-medium",
                        trade.type == "Long" && "bg-success/20 text-success",
                        trade.type == "Short" && "bg-error/20 text-error"
                      ]}>
                        <%= trade.type %>
                      </span>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class="text-xs text-base-content"><%= trade.entry_price %></p>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class="text-xs text-base-content"><%= trade.exit_price %></p>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class={[
                        "text-xs font-medium",
                        String.starts_with?(trade.profit, "+") && "text-success",
                        String.starts_with?(trade.profit, "-") && "text-error"
                      ]}>
                        <%= trade.profit %> (<%= trade.profit_percent %>)
                      </p>
                    </td>
                    <td class="py-2.5 px-4">
                      <span class={[
                        "px-2 py-0.5 rounded text-xs font-medium",
                        trade.status == "open" && "bg-primary/20 text-primary",
                        trade.status == "closed" && "bg-base-content/20 text-base-content/60"
                      ]}>
                        <%= String.capitalize(trade.status) %>
                      </span>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class="text-xs text-base-content/60"><%= trade.time %></p>
                    </td>
                  </tr>
                <% end %>
              </tbody>
            </table>
          </div>
        </div>

        <%!-- Activity Log --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h3 class="text-base font-semibold text-base-content">Activity Log</h3>
          </div>
          <div class="p-4">
            <div class="space-y-4">
              <%= for activity <- @activity_log do %>
                <div class="flex items-start space-x-3">
                  <div class="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <.icon name="hero-clock" class="size-4 text-primary" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-base-content"><%= activity.event %></p>
                    <p class="text-xs text-base-content/60 truncate"><%= activity.details %></p>
                    <p class="text-xs text-base-content/40 mt-1"><%= activity.time %></p>
                  </div>
                </div>
              <% end %>
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end
end
