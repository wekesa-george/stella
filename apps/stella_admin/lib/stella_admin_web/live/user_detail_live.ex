defmodule StellaAdminWeb.UserDetailLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Users

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    user = Users.get_user_detail(id)

    if user do
      {:ok, equity} = Users.calculate_user_equity(id)
      {:ok, pnl} = Users.calculate_user_pnl(id)

      {:ok,
       socket
       |> assign(:page_title, "User Details")
       |> assign(:current_page, :users)
       |> assign(:user, user)
       |> assign(:equity, equity)
       |> assign(:pnl, pnl)
       |> assign(:show_suspend_modal, false)
       |> assign(:show_export_modal, false)
       |> assign(:suspend_reason, "")}
    else
      {:ok,
       socket
       |> put_flash(:error, "User not found")
       |> redirect(to: ~p"/users")}
    end
  end

  @impl true
  def handle_event("show_suspend_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:show_suspend_modal, true)
     |> assign(:suspend_reason, "")}
  end

  @impl true
  def handle_event("close_suspend_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:show_suspend_modal, false)
     |> assign(:suspend_reason, "")}
  end

  @impl true
  def handle_event("update_suspend_reason", %{"reason" => reason}, socket) do
    {:noreply, assign(socket, :suspend_reason, reason)}
  end

  @impl true
  def handle_event("suspend_user", _params, socket) do
    user = socket.assigns.user
    current_admin = socket.assigns.current_admin
    reason = socket.assigns.suspend_reason

    case Users.suspend_user(user, current_admin.id, reason) do
      {:ok, _updated_user} ->
        {:noreply,
         socket
         |> put_flash(:info, "User suspended successfully.")
         |> redirect(to: ~p"/users")}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to suspend user.")}
    end
  end

  @impl true
  def handle_event("export_user_data", _params, socket) do
    user = socket.assigns.user

    case Users.export_user_data(user.id) do
      {:ok, _data} ->
        # TODO: Trigger download of JSON file
        # For now, just show success message
        {:noreply,
         socket
         |> put_flash(:info, "User data exported successfully.")}

      {:error, :not_found} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to export user data.")}
    end
  end

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
    Calendar.strftime(datetime, "%Y-%m-%d %H:%M")
  end

  defp format_money(amount) when is_float(amount) do
    "$#{:erlang.float_to_binary(amount, decimals: 2)}"
  end

  defp format_money(amount) when is_integer(amount) do
    "$#{amount}.00"
  end

  defp format_money(_), do: "$0.00"

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
              <%= if @user.username do %>
                Viewing profile for @<%= @user.username %>
              <% else %>
                Viewing profile for <%= @user.email %>
              <% end %>
            </p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button
            phx-click="export_user_data"
            class="px-4 py-2 bg-base-200 hover:bg-base-300 border border-base-300 rounded text-sm font-medium text-base-content transition-colors"
          >
            <.icon name="hero-arrow-down-tray" class="inline size-4 mr-1" />
            Export Data
          </button>
          <%= if @user.status != :suspended do %>
            <button
              phx-click="show_suspend_modal"
              class="px-4 py-2 bg-error hover:bg-error/90 text-white rounded text-sm font-medium transition-colors"
            >
              <.icon name="hero-no-symbol" class="inline size-4 mr-1" />
              Suspend
            </button>
          <% end %>
        </div>
      </div>

      <%!-- User Profile Card --%>
      <div class="bg-base-200 rounded border border-base-300 p-6">
        <div class="flex items-start space-x-6">
          <div class="w-24 h-24 bg-purple-500 rounded-full flex items-center justify-center">
            <span class="text-white text-3xl font-bold"><%= get_user_initials(@user) %></span>
          </div>

          <div class="flex-1">
            <div class="flex items-center space-x-3 mb-2">
              <h2 class="text-2xl font-bold text-base-content"><%= @user.email %></h2>
              <%= if @user.email_verified do %>
                <.icon name="hero-check-badge" class="size-6 text-success" />
              <% end %>
              <span class={[
                "px-3 py-1 rounded-full text-xs font-medium",
                @user.status == :active && "bg-success/20 text-success",
                @user.status == :suspended && "bg-error/20 text-error",
                @user.status == :banned && "bg-error/20 text-error",
                @user.status == :pending_verification && "bg-warning/20 text-warning",
                @user.status == :deactivated && "bg-base-content/20 text-base-content/60"
              ]}>
                <%= @user.status |> to_string() |> String.replace("_", " ") |> String.capitalize() %>
              </span>
              <span class="px-3 py-1 rounded text-xs font-medium bg-primary/20 text-primary">
                <%= format_tier(@user.tier) %>
              </span>
            </div>
            <%= if @user.username do %>
              <p class="text-base text-base-content/70 mb-1">@<%= @user.username %></p>
            <% end %>
            <%= if @user.phone do %>
              <p class="text-sm text-base-content/60 mb-2">
                <%= @user.phone %>
                <%= if @user.phone_verified do %>
                  <.icon name="hero-check-badge" class="inline size-4 text-success ml-1" />
                <% end %>
              </p>
            <% end %>
            <%= if @user.referral_code do %>
              <p class="text-sm text-base-content/60">Referral Code: <%= @user.referral_code %></p>
            <% end %>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-base-300">
          <div>
            <p class="text-xs text-base-content/60 mb-1">Joined</p>
            <p class="text-sm font-medium text-base-content"><%= format_date(@user.created_at) %></p>
          </div>
          <div>
            <p class="text-xs text-base-content/60 mb-1">Last Login</p>
            <p class="text-sm font-medium text-base-content">
              <%= format_date(@user.last_login_at) %>
            </p>
          </div>
          <div>
            <p class="text-xs text-base-content/60 mb-1">Last Login IP</p>
            <p class="text-sm font-medium text-base-content">
              <%= if @user.last_login_ip do %>
                <%= @user.last_login_ip %>
              <% else %>
                -
              <% end %>
            </p>
          </div>
          <div>
            <p class="text-xs text-base-content/60 mb-1">Failed Logins</p>
            <p class="text-sm font-medium text-base-content"><%= @user.failed_login_count %></p>
          </div>
        </div>
      </div>

      <%!-- Stats Grid --%>
      <div class="grid grid-cols-6 gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Total Equity</p>
          <p class="text-xl font-bold text-base-content">
            <%= format_money(@equity.total_equity) %>
          </p>
          <p class="text-xs text-base-content/50 mt-1">
            Cash: <%= format_money(@equity.cash) %>
          </p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Total P&L</p>
          <p class={[
            "text-xl font-bold",
            @pnl.total_pnl >= 0 && "text-success" || "text-error"
          ]}>
            <%= format_money(@pnl.total_pnl) %>
          </p>
          <p class="text-xs text-base-content/50 mt-1">
            Realized: <%= format_money(@pnl.realized_pnl) %>
          </p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Unrealized P&L</p>
          <p class={[
            "text-xl font-bold",
            @pnl.unrealized_pnl >= 0 && "text-success" || "text-error"
          ]}>
            <%= format_money(@pnl.unrealized_pnl) %>
          </p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Positions Value</p>
          <p class="text-xl font-bold text-base-content">
            <%= format_money(@equity.positions_value) %>
          </p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Account Locked</p>
          <p class="text-xl font-bold text-base-content">
            <%= if @user.locked_until do %>
              <span class="text-error">Yes</span>
            <% else %>
              <span class="text-success">No</span>
            <% end %>
          </p>
          <%= if @user.locked_until do %>
            <p class="text-xs text-base-content/50 mt-1">
              Until: <%= format_date(@user.locked_until) %>
            </p>
          <% end %>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-xs text-base-content/60 mb-1">Tier</p>
          <p class="text-xl font-bold text-primary"><%= format_tier(@user.tier) %></p>
        </div>
      </div>

      <%!-- Additional Information Sections --%>
      <div class="grid grid-cols-3 gap-4">
        <%!-- KYC Status --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h3 class="text-base font-semibold text-base-content">KYC Status</h3>
          </div>
          <div class="p-4">
            <div class="text-center py-8">
              <.icon name="hero-document-check" class="size-12 text-base-content/40 mx-auto mb-2" />
              <p class="text-sm text-base-content/60">
                KYC records will be displayed here
              </p>
              <p class="text-xs text-base-content/40 mt-1">
                Integration with KYC context coming soon
              </p>
            </div>
          </div>
        </div>
        <%!-- Connected Exchanges --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h3 class="text-base font-semibold text-base-content">Connected Exchanges</h3>
          </div>
          <div class="p-4">
            <div class="text-center py-8">
              <.icon name="hero-building-library" class="size-12 text-base-content/40 mx-auto mb-2" />
              <p class="text-sm text-base-content/60">
                Exchange connections will be displayed here
              </p>
              <p class="text-xs text-base-content/40 mt-1">
                Integration with exchange context coming soon
              </p>
            </div>
          </div>
        </div>
        <%!-- Active Bots --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h3 class="text-base font-semibold text-base-content">Active Bots</h3>
          </div>
          <div class="p-4">
            <div class="text-center py-8">
              <.icon name="hero-cpu-chip" class="size-12 text-base-content/40 mx-auto mb-2" />
              <p class="text-sm text-base-content/60">
                Active trading bots will be displayed here
              </p>
              <p class="text-xs text-base-content/40 mt-1">
                Integration with bots context coming soon
              </p>
            </div>
          </div>
        </div>
      </div>
      <%!-- Tier History --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300">
          <h3 class="text-base font-semibold text-base-content">Tier History</h3>
        </div>
        <div class="p-4">
          <div class="text-center py-8">
            <.icon name="hero-chart-bar" class="size-12 text-base-content/40 mx-auto mb-2" />
            <p class="text-sm text-base-content/60">
              Tier change history will be displayed here
            </p>
            <p class="text-xs text-base-content/40 mt-1">
              Requires tier_history table implementation
            </p>
          </div>
        </div>
      </div>
      <%!-- User Metadata --%>
      <%= if @user.metadata && map_size(@user.metadata) > 0 do %>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h3 class="text-base font-semibold text-base-content">Additional Information</h3>
          </div>
          <div class="p-4">
            <pre class="text-xs text-base-content/80 bg-base-300 p-3 rounded overflow-x-auto"><%= Jason.encode!(@user.metadata, pretty: true) %></pre>
          </div>
        </div>
      <% end %>
    </div>
    <%!-- Suspend User Modal --%>
    <%= if @show_suspend_modal do %>
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
                    <%= get_user_initials(@user) %>
                  </span>
                </div>
                <div>
                  <p class="text-base font-medium text-base-content"><%= @user.email %></p>
                  <%= if @user.username do %>
                    <p class="text-sm text-base-content/60">@<%= @user.username %></p>
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
    """
  end
end
