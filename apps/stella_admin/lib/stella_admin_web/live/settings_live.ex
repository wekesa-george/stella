defmodule StellaAdminWeb.SettingsLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Settings")
     |> assign(:current_page, :settings)
     |> assign(:active_tab, "general")
     |> assign(:platform_settings, platform_settings())
     |> assign(:trading_settings, trading_settings())
     |> assign(:security_settings, security_settings())
     |> assign(:notification_settings, notification_settings())
     |> assign(:api_settings, api_settings())
     |> assign(:show_success, false)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-4">
      <!-- Page Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-base-content">Platform Settings</h1>
          <p class="text-sm text-base-content/60 mt-1">Manage system configuration and preferences</p>
        </div>
      </div>

      <!-- Success Message -->
      <%= if @show_success do %>
        <div class="alert alert-success">
          <.icon name="hero-check-circle" class="size-5" />
          <span>Settings saved successfully!</span>
        </div>
      <% end %>

      <!-- Tabs -->
      <div class="bg-base-200 rounded border border-base-300">
        <div class="border-b border-base-300">
          <div class="flex items-center space-x-1 p-2">
            <button
              phx-click="change_tab"
              phx-value-tab="general"
              class={[
                "px-4 py-2 text-sm font-medium rounded transition-colors",
                @active_tab == "general" && "bg-primary text-base-100",
                @active_tab != "general" && "text-base-content/70 hover:bg-base-300"
              ]}
            >
              <div class="flex items-center space-x-2">
                <.icon name="hero-cog-6-tooth" class="size-4" />
                <span>General</span>
              </div>
            </button>
            <button
              phx-click="change_tab"
              phx-value-tab="trading"
              class={[
                "px-4 py-2 text-sm font-medium rounded transition-colors",
                @active_tab == "trading" && "bg-primary text-base-100",
                @active_tab != "trading" && "text-base-content/70 hover:bg-base-300"
              ]}
            >
              <div class="flex items-center space-x-2">
                <.icon name="hero-chart-bar" class="size-4" />
                <span>Trading</span>
              </div>
            </button>
            <button
              phx-click="change_tab"
              phx-value-tab="security"
              class={[
                "px-4 py-2 text-sm font-medium rounded transition-colors",
                @active_tab == "security" && "bg-primary text-base-100",
                @active_tab != "security" && "text-base-content/70 hover:bg-base-300"
              ]}
            >
              <div class="flex items-center space-x-2">
                <.icon name="hero-shield-check" class="size-4" />
                <span>Security</span>
              </div>
            </button>
            <button
              phx-click="change_tab"
              phx-value-tab="notifications"
              class={[
                "px-4 py-2 text-sm font-medium rounded transition-colors",
                @active_tab == "notifications" && "bg-primary text-base-100",
                @active_tab != "notifications" && "text-base-content/70 hover:bg-base-300"
              ]}
            >
              <div class="flex items-center space-x-2">
                <.icon name="hero-bell" class="size-4" />
                <span>Notifications</span>
              </div>
            </button>
            <button
              phx-click="change_tab"
              phx-value-tab="api"
              class={[
                "px-4 py-2 text-sm font-medium rounded transition-colors",
                @active_tab == "api" && "bg-primary text-base-100",
                @active_tab != "api" && "text-base-content/70 hover:bg-base-300"
              ]}
            >
              <div class="flex items-center space-x-2">
                <.icon name="hero-code-bracket" class="size-4" />
                <span>API</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div class="p-6">
          <%= if @active_tab == "general" do %>
            <div class="space-y-6">
              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Platform Information</h3>
                <div class="grid grid-cols-2 gap-4">
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Platform Name</span>
                    </label>
                    <input
                      type="text"
                      value={@platform_settings.name}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Platform URL</span>
                    </label>
                    <input
                      type="text"
                      value={@platform_settings.url}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Support Email</span>
                    </label>
                    <input
                      type="email"
                      value={@platform_settings.support_email}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Timezone</span>
                    </label>
                    <select class="select select-bordered select-sm">
                      <option>UTC</option>
                      <option>America/New_York</option>
                      <option>Europe/London</option>
                      <option>Asia/Singapore</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="divider"></div>

              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Features</h3>
                <div class="space-y-3">
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@platform_settings.features.user_registration}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <div>
                        <span class="label-text text-sm">Allow User Registration</span>
                        <p class="text-xs text-base-content/60">
                          Enable new users to create accounts
                        </p>
                      </div>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@platform_settings.features.copy_trading}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <div>
                        <span class="label-text text-sm">Copy Trading</span>
                        <p class="text-xs text-base-content/60">
                          Allow users to copy trades from other traders
                        </p>
                      </div>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@platform_settings.features.social_features}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <div>
                        <span class="label-text text-sm">Social Features</span>
                        <p class="text-xs text-base-content/60">
                          Enable posts, comments, and social interactions
                        </p>
                      </div>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@platform_settings.features.api_access}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <div>
                        <span class="label-text text-sm">API Access</span>
                        <p class="text-xs text-base-content/60">Allow programmatic API access</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          <% end %>

          <%= if @active_tab == "trading" do %>
            <div class="space-y-6">
              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Trading Limits</h3>
                <div class="grid grid-cols-2 gap-4">
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Min Trade Amount (USDT)</span>
                    </label>
                    <input
                      type="number"
                      value={@trading_settings.min_trade_amount}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Max Trade Amount (USDT)</span>
                    </label>
                    <input
                      type="number"
                      value={@trading_settings.max_trade_amount}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Max Leverage</span>
                    </label>
                    <input
                      type="number"
                      value={@trading_settings.max_leverage}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Max Open Positions</span>
                    </label>
                    <input
                      type="number"
                      value={@trading_settings.max_open_positions}
                      class="input input-bordered input-sm"
                    />
                  </div>
                </div>
              </div>

              <div class="divider"></div>

              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Fees</h3>
                <div class="grid grid-cols-2 gap-4">
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Trading Fee (%)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={@trading_settings.trading_fee}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Copy Trading Fee (%)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={@trading_settings.copy_trading_fee}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Withdrawal Fee (%)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={@trading_settings.withdrawal_fee}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Min Withdrawal (USDT)</span>
                    </label>
                    <input
                      type="number"
                      value={@trading_settings.min_withdrawal}
                      class="input input-bordered input-sm"
                    />
                  </div>
                </div>
              </div>

              <div class="divider"></div>

              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Risk Management</h3>
                <div class="space-y-3">
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@trading_settings.risk_management.stop_loss_required}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <div>
                        <span class="label-text text-sm">Require Stop Loss</span>
                        <p class="text-xs text-base-content/60">Force users to set stop loss on trades</p>
                      </div>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@trading_settings.risk_management.auto_close_enabled}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <div>
                        <span class="label-text text-sm">Auto-Close on Margin Call</span>
                        <p class="text-xs text-base-content/60">
                          Automatically close positions when margin is low
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          <% end %>

          <%= if @active_tab == "security" do %>
            <div class="space-y-6">
              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Authentication</h3>
                <div class="space-y-3">
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@security_settings.require_2fa}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <div>
                        <span class="label-text text-sm">Require 2FA for All Users</span>
                        <p class="text-xs text-base-content/60">Mandatory two-factor authentication</p>
                      </div>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@security_settings.require_kyc}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <div>
                        <span class="label-text text-sm">Require KYC Verification</span>
                        <p class="text-xs text-base-content/60">
                          Users must verify identity before trading
                        </p>
                      </div>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@security_settings.email_verification}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <div>
                        <span class="label-text text-sm">Email Verification Required</span>
                        <p class="text-xs text-base-content/60">Verify email on registration</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div class="divider"></div>

              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Session Management</h3>
                <div class="grid grid-cols-2 gap-4">
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Session Timeout (minutes)</span>
                    </label>
                    <input
                      type="number"
                      value={@security_settings.session_timeout}
                      class="input input-bordered input-sm"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Max Login Attempts</span>
                    </label>
                    <input
                      type="number"
                      value={@security_settings.max_login_attempts}
                      class="input input-bordered input-sm"
                    />
                  </div>
                </div>
              </div>

              <div class="divider"></div>

              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">IP Whitelist</h3>
                <div class="form-control">
                  <label class="label">
                    <span class="label-text text-xs">Allowed IP Addresses (one per line)</span>
                  </label>
                  <textarea
                    class="textarea textarea-bordered text-xs font-mono"
                    rows="4"
                    placeholder="192.168.1.1&#10;10.0.0.1"
                  ></textarea>
                </div>
              </div>
            </div>
          <% end %>

          <%= if @active_tab == "notifications" do %>
            <div class="space-y-6">
              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Email Notifications</h3>
                <div class="space-y-3">
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@notification_settings.email.new_user}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <span class="label-text text-sm">New User Registration</span>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@notification_settings.email.large_trade}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <span class="label-text text-sm">Large Trade Alert (&gt; $10,000)</span>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@notification_settings.email.withdrawal_request}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <span class="label-text text-sm">Withdrawal Requests</span>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@notification_settings.email.security_alert}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <span class="label-text text-sm">Security Alerts</span>
                    </label>
                  </div>
                </div>
              </div>

              <div class="divider"></div>

              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Slack Integration</h3>
                <div class="form-control">
                  <label class="label">
                    <span class="label-text text-xs">Webhook URL</span>
                  </label>
                  <input
                    type="text"
                    value={@notification_settings.slack_webhook}
                    placeholder="https://hooks.slack.com/services/..."
                    class="input input-bordered input-sm font-mono"
                  />
                </div>
              </div>
            </div>
          <% end %>

          <%= if @active_tab == "api" do %>
            <div class="space-y-6">
              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">API Configuration</h3>
                <div class="space-y-3">
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start space-x-3">
                      <input
                        type="checkbox"
                        checked={@api_settings.enabled}
                        class="checkbox checkbox-primary checkbox-sm"
                      />
                      <span class="label-text text-sm">Enable Public API</span>
                    </label>
                  </div>
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Rate Limit (requests/minute)</span>
                    </label>
                    <input
                      type="number"
                      value={@api_settings.rate_limit}
                      class="input input-bordered input-sm"
                    />
                  </div>
                </div>
              </div>

              <div class="divider"></div>

              <div>
                <h3 class="text-base font-semibold text-base-content mb-4">Active API Keys</h3>
                <div class="overflow-x-auto">
                  <table class="table table-sm w-full">
                    <thead class="bg-base-300">
                      <tr>
                        <th class="text-xs font-semibold text-base-content/80">Name</th>
                        <th class="text-xs font-semibold text-base-content/80">Key</th>
                        <th class="text-xs font-semibold text-base-content/80">Created</th>
                        <th class="text-xs font-semibold text-base-content/80">Last Used</th>
                        <th class="text-xs font-semibold text-base-content/80">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <%= for api_key <- @api_settings.keys do %>
                        <tr class="hover:bg-base-300/50">
                          <td class="text-xs text-base-content"><%= api_key.name %></td>
                          <td class="text-xs font-mono text-base-content/60">
                            <%= api_key.key %>***
                          </td>
                          <td class="text-xs text-base-content/60"><%= api_key.created %></td>
                          <td class="text-xs text-base-content/60"><%= api_key.last_used %></td>
                          <td>
                            <button class="btn btn-ghost btn-xs text-error">Revoke</button>
                          </td>
                        </tr>
                      <% end %>
                    </tbody>
                  </table>
                </div>
                <button class="btn btn-primary btn-sm mt-3">
                  <.icon name="hero-plus" class="size-4" />
                  Generate New Key
                </button>
              </div>
            </div>
          <% end %>

          <!-- Save Button -->
          <div class="flex items-center justify-end space-x-2 mt-6 pt-6 border-t border-base-300">
            <button class="btn btn-ghost btn-sm">Cancel</button>
            <button phx-click="save_settings" class="btn btn-primary btn-sm">
              <.icon name="hero-check" class="size-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
    """
  end

  @impl true
  def handle_event("change_tab", %{"tab" => tab}, socket) do
    {:noreply, assign(socket, :active_tab, tab)}
  end

  @impl true
  def handle_event("save_settings", _params, socket) do
    {:noreply, socket |> assign(:show_success, true) |> put_flash(:info, "Settings saved successfully")}
  end

  defp platform_settings do
    %{
      name: "Stella",
      url: "https://stella.trade",
      support_email: "support@stella.trade",
      timezone: "UTC",
      features: %{
        user_registration: true,
        copy_trading: true,
        social_features: true,
        api_access: true
      }
    }
  end

  defp trading_settings do
    %{
      min_trade_amount: 10,
      max_trade_amount: 100_000,
      max_leverage: 20,
      max_open_positions: 50,
      trading_fee: 0.1,
      copy_trading_fee: 0.15,
      withdrawal_fee: 0.5,
      min_withdrawal: 20,
      risk_management: %{
        stop_loss_required: false,
        auto_close_enabled: true
      }
    }
  end

  defp security_settings do
    %{
      require_2fa: false,
      require_kyc: true,
      email_verification: true,
      session_timeout: 30,
      max_login_attempts: 5
    }
  end

  defp notification_settings do
    %{
      email: %{
        new_user: true,
        large_trade: true,
        withdrawal_request: true,
        security_alert: true
      },
      slack_webhook: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX"
    }
  end

  defp api_settings do
    %{
      enabled: true,
      rate_limit: 60,
      keys: [
        %{name: "Production API", key: "REDACTED", created: "2024-01-15", last_used: "2m ago"},
        %{
          name: "Development API",
          key: "sk_test_xyz789",
          created: "2024-02-01",
          last_used: "1h ago"
        }
      ]
    }
  end
end
