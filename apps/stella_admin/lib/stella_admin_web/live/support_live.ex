defmodule StellaAdminWeb.SupportLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Support")
     |> assign(:current_page, :support)
     |> assign(:stats, support_stats())
     |> assign(:active_tickets, active_tickets())
     |> assign(:live_chats, live_chats())
     |> assign(:team_performance, team_performance())
     |> assign(:filter, "all")
     |> assign(:selected_ticket, nil)
     |> assign(:show_ticket_modal, false)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-4">
      <!-- Page Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-base-content">Support Management</h1>
          <p class="text-sm text-base-content/60 mt-1">Manage customer inquiries and support tickets</p>
        </div>
        <button class="btn btn-primary btn-sm">
          <.icon name="hero-plus" class="size-4" />
          Create Ticket
        </button>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-6 gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-base-content/60">Open Tickets</span>
            <.icon name="hero-inbox" class="size-4 text-warning" />
          </div>
          <div class="text-xl font-bold text-base-content"><%= @stats.open %></div>
          <div class="text-xs text-warning mt-1">+12 today</div>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-base-content/60">In Progress</span>
            <.icon name="hero-clock" class="size-4 text-info" />
          </div>
          <div class="text-xl font-bold text-base-content"><%= @stats.in_progress %></div>
          <div class="text-xs text-info mt-1">24 agents active</div>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-base-content/60">Resolved Today</span>
            <.icon name="hero-check-circle" class="size-4 text-success" />
          </div>
          <div class="text-xl font-bold text-base-content"><%= @stats.resolved_today %></div>
          <div class="text-xs text-success mt-1">+8% vs yesterday</div>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-base-content/60">Avg Response Time</span>
            <.icon name="hero-arrow-trending-down" class="size-4 text-primary" />
          </div>
          <div class="text-xl font-bold text-base-content"><%= @stats.avg_response_time %></div>
          <div class="text-xs text-primary mt-1">12% faster</div>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-base-content/60">Satisfaction Rate</span>
            <.icon name="hero-face-smile" class="size-4 text-primary" />
          </div>
          <div class="text-xl font-bold text-base-content"><%= @stats.satisfaction_rate %></div>
          <div class="text-xs text-base-content/60 mt-1">from 1,234 ratings</div>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-base-content/60">Live Chats</span>
            <.icon name="hero-chat-bubble-left-right" class="size-4 text-teal-400" />
          </div>
          <div class="text-xl font-bold text-base-content"><%= @stats.live_chats %></div>
          <div class="text-xs text-teal-400 mt-1">18 waiting</div>
        </div>
      </div>

      <!-- Active Tickets -->
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold text-base-content">Active Tickets</h2>
            <div class="flex items-center space-x-2">
              <button
                phx-click="filter"
                phx-value-type="all"
                class={[
                  "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                  @filter == "all" && "bg-primary text-base-100",
                  @filter != "all" && "text-base-content/70 hover:bg-base-300"
                ]}
              >
                All
              </button>
              <button
                phx-click="filter"
                phx-value-type="high"
                class={[
                  "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                  @filter == "high" && "bg-error text-base-100",
                  @filter != "high" && "text-base-content/70 hover:bg-base-300"
                ]}
              >
                High Priority
              </button>
              <button
                phx-click="filter"
                phx-value-type="unassigned"
                class={[
                  "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                  @filter == "unassigned" && "bg-warning text-base-100",
                  @filter != "unassigned" && "text-base-content/70 hover:bg-base-300"
                ]}
              >
                Unassigned
              </button>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="table table-sm w-full">
            <thead class="bg-base-300">
              <tr>
                <th class="text-xs font-semibold text-base-content/80">Ticket ID</th>
                <th class="text-xs font-semibold text-base-content/80">Subject</th>
                <th class="text-xs font-semibold text-base-content/80">User</th>
                <th class="text-xs font-semibold text-base-content/80">Priority</th>
                <th class="text-xs font-semibold text-base-content/80">Status</th>
                <th class="text-xs font-semibold text-base-content/80">Assigned To</th>
                <th class="text-xs font-semibold text-base-content/80">Created</th>
                <th class="text-xs font-semibold text-base-content/80">Last Updated</th>
                <th class="text-xs font-semibold text-base-content/80">Actions</th>
              </tr>
            </thead>
            <tbody>
              <%= for ticket <- @active_tickets do %>
                <tr class="hover:bg-base-300/50">
                  <td class="text-xs font-mono text-primary">#<%= ticket.id %></td>
                  <td class="text-xs text-base-content max-w-xs truncate"><%= ticket.subject %></td>
                  <td class="text-xs text-base-content"><%= ticket.user %></td>
                  <td>
                    <span class={[
                      "badge badge-xs",
                      ticket.priority == "High" && "badge-error",
                      ticket.priority == "Medium" && "badge-warning",
                      ticket.priority == "Low" && "badge-info"
                    ]}>
                      <%= ticket.priority %>
                    </span>
                  </td>
                  <td>
                    <span class={[
                      "badge badge-xs",
                      ticket.status == "Open" && "badge-warning",
                      ticket.status == "In Progress" && "badge-info",
                      ticket.status == "Waiting" && "badge-ghost"
                    ]}>
                      <%= ticket.status %>
                    </span>
                  </td>
                  <td class="text-xs text-base-content">
                    <%= if ticket.assigned_to do %>
                      <div class="flex items-center space-x-2">
                        <div class="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center">
                          <span class="text-primary text-[10px] font-bold">
                            <%= ticket.assigned_to |> String.split() |> Enum.map(&String.first/1) |> Enum.join() %>
                          </span>
                        </div>
                        <span><%= ticket.assigned_to %></span>
                      </div>
                    <% else %>
                      <span class="text-base-content/40 italic">Unassigned</span>
                    <% end %>
                  </td>
                  <td class="text-xs text-base-content/60"><%= ticket.created %></td>
                  <td class="text-xs text-base-content/60"><%= ticket.last_updated %></td>
                  <td>
                    <div class="flex items-center space-x-1">
                      <button
                        phx-click="view_ticket"
                        phx-value-id={ticket.id}
                        class="btn btn-ghost btn-xs"
                      >
                        <.icon name="hero-eye" class="size-3" />
                      </button>
                      <button class="btn btn-ghost btn-xs">
                        <.icon name="hero-pencil" class="size-3" />
                      </button>
                      <button class="btn btn-ghost btn-xs text-success">
                        <.icon name="hero-check" class="size-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              <% end %>
            </tbody>
          </table>
        </div>

        <div class="p-4 border-t border-base-300 flex items-center justify-between">
          <span class="text-xs text-base-content/60">Showing <%= length(@active_tickets) %> tickets</span>
          <div class="flex items-center space-x-2">
            <button class="btn btn-ghost btn-xs">Previous</button>
            <button class="btn btn-ghost btn-xs btn-active">1</button>
            <button class="btn btn-ghost btn-xs">2</button>
            <button class="btn btn-ghost btn-xs">3</button>
            <button class="btn btn-ghost btn-xs">Next</button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <!-- Live Chat Monitoring -->
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-semibold text-base-content">Live Chat Sessions</h2>
              <span class="badge badge-success badge-sm">
                <%= @stats.live_chats %> Active
              </span>
            </div>
          </div>
          <div class="p-4 space-y-3 max-h-96 overflow-y-auto">
            <%= for chat <- @live_chats do %>
              <div class="bg-base-300 rounded p-3 border border-base-300/50">
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center space-x-2">
                    <div class="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center">
                      <span class="text-primary text-xs font-bold">
                        <%= chat.user |> String.split() |> Enum.map(&String.first/1) |> Enum.join() %>
                      </span>
                    </div>
                    <div>
                      <div class="text-xs font-medium text-base-content"><%= chat.user %></div>
                      <div class="text-[10px] text-base-content/60">ID: #<%= chat.user_id %></div>
                    </div>
                  </div>
                  <span class={[
                    "badge badge-xs",
                    chat.waiting && "badge-warning",
                    !chat.waiting && "badge-success"
                  ]}>
                    <%= if chat.waiting, do: "Waiting", else: "Active" %>
                  </span>
                </div>
                <div class="text-xs text-base-content/70 mb-2"><%= chat.last_message %></div>
                <div class="flex items-center justify-between">
                  <span class="text-[10px] text-base-content/50"><%= chat.duration %></span>
                  <%= if chat.agent do %>
                    <span class="text-[10px] text-base-content/60">Agent: <%= chat.agent %></span>
                  <% else %>
                    <button class="btn btn-primary btn-xs">Assign Agent</button>
                  <% end %>
                </div>
              </div>
            <% end %>
          </div>
        </div>

        <!-- Team Performance -->
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Team Performance (Today)</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="table table-sm w-full">
              <thead class="bg-base-300">
                <tr>
                  <th class="text-xs font-semibold text-base-content/80">Agent</th>
                  <th class="text-xs font-semibold text-base-content/80">Active</th>
                  <th class="text-xs font-semibold text-base-content/80">Resolved</th>
                  <th class="text-xs font-semibold text-base-content/80">Avg Time</th>
                  <th class="text-xs font-semibold text-base-content/80">Rating</th>
                </tr>
              </thead>
              <tbody>
                <%= for agent <- @team_performance do %>
                  <tr class="hover:bg-base-300/50">
                    <td>
                      <div class="flex items-center space-x-2">
                        <div class="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center">
                          <span class="text-primary text-[10px] font-bold">
                            <%= agent.name |> String.split() |> Enum.map(&String.first/1) |> Enum.join() %>
                          </span>
                        </div>
                        <div>
                          <div class="text-xs font-medium text-base-content"><%= agent.name %></div>
                          <div class={[
                            "text-[10px]",
                            agent.status == "Online" && "text-success",
                            agent.status == "Away" && "text-warning",
                            agent.status == "Offline" && "text-base-content/40"
                          ]}>
                            <%= agent.status %>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="text-xs text-base-content"><%= agent.active_tickets %></td>
                    <td class="text-xs text-base-content"><%= agent.resolved_today %></td>
                    <td class="text-xs text-base-content"><%= agent.avg_response_time %></td>
                    <td>
                      <div class="flex items-center space-x-1">
                        <.icon name="hero-star-solid" class="size-3 text-warning" />
                        <span class="text-xs text-base-content"><%= agent.rating %></span>
                      </div>
                    </td>
                  </tr>
                <% end %>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Ticket Detail Modal -->
    <%= if @show_ticket_modal && @selected_ticket do %>
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" phx-click="close_modal">
        <div class="bg-base-200 rounded border border-base-300 w-full max-w-2xl max-h-[90vh] overflow-y-auto" phx-click="stop_propagation">
          <div class="p-4 border-b border-base-300 flex items-center justify-between">
            <h3 class="text-base font-semibold text-base-content">Ticket #<%= @selected_ticket.id %></h3>
            <button phx-click="close_modal" class="btn btn-ghost btn-sm btn-circle">
              <.icon name="hero-x-mark" class="size-4" />
            </button>
          </div>

          <div class="p-4 space-y-4">
            <!-- Ticket Info -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-xs text-base-content/60">User</label>
                <div class="text-sm text-base-content"><%= @selected_ticket.user %></div>
              </div>
              <div>
                <label class="text-xs text-base-content/60">Priority</label>
                <div>
                  <span class={[
                    "badge badge-sm",
                    @selected_ticket.priority == "High" && "badge-error",
                    @selected_ticket.priority == "Medium" && "badge-warning",
                    @selected_ticket.priority == "Low" && "badge-info"
                  ]}>
                    <%= @selected_ticket.priority %>
                  </span>
                </div>
              </div>
              <div>
                <label class="text-xs text-base-content/60">Status</label>
                <div>
                  <span class="badge badge-sm badge-info"><%= @selected_ticket.status %></span>
                </div>
              </div>
              <div>
                <label class="text-xs text-base-content/60">Assigned To</label>
                <div class="text-sm text-base-content">
                  <%= @selected_ticket.assigned_to || "Unassigned" %>
                </div>
              </div>
            </div>

            <div>
              <label class="text-xs text-base-content/60">Subject</label>
              <div class="text-sm font-medium text-base-content"><%= @selected_ticket.subject %></div>
            </div>

            <div>
              <label class="text-xs text-base-content/60">Description</label>
              <div class="text-sm text-base-content bg-base-300 rounded p-3">
                Unable to withdraw funds. Getting error "Insufficient balance" even though I have enough USDT in my account.
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center space-x-2 pt-2">
              <button class="btn btn-primary btn-sm">
                Assign to Me
              </button>
              <button class="btn btn-ghost btn-sm">
                Change Priority
              </button>
              <button class="btn btn-success btn-sm">
                Mark Resolved
              </button>
            </div>
          </div>
        </div>
      </div>
    <% end %>
    """
  end

  @impl true
  def handle_event("filter", %{"type" => type}, socket) do
    {:noreply, assign(socket, :filter, type)}
  end

  @impl true
  def handle_event("view_ticket", %{"id" => id}, socket) do
    ticket = Enum.find(socket.assigns.active_tickets, fn t -> t.id == String.to_integer(id) end)
    {:noreply, socket |> assign(:selected_ticket, ticket) |> assign(:show_ticket_modal, true)}
  end

  @impl true
  def handle_event("close_modal", _params, socket) do
    {:noreply, assign(socket, :show_ticket_modal, false)}
  end

  @impl true
  def handle_event("stop_propagation", _params, socket) do
    {:noreply, socket}
  end

  defp support_stats do
    %{
      open: 143,
      in_progress: 87,
      resolved_today: 124,
      avg_response_time: "2.4m",
      satisfaction_rate: "94.2%",
      live_chats: 45
    }
  end

  defp active_tickets do
    [
      %{
        id: 10234,
        subject: "Unable to withdraw funds",
        user: "Sarah Johnson",
        priority: "High",
        status: "Open",
        assigned_to: nil,
        created: "5m ago",
        last_updated: "2m ago"
      },
      %{
        id: 10233,
        subject: "2FA not working on mobile app",
        user: "Mike Chen",
        priority: "High",
        status: "In Progress",
        assigned_to: "Alex Turner",
        created: "18m ago",
        last_updated: "5m ago"
      },
      %{
        id: 10232,
        subject: "Copy trade not executing properly",
        user: "Emma Davis",
        priority: "Medium",
        status: "Waiting",
        assigned_to: "Sofia Martinez",
        created: "32m ago",
        last_updated: "12m ago"
      },
      %{
        id: 10231,
        subject: "Question about trading fees",
        user: "David Park",
        priority: "Low",
        status: "In Progress",
        assigned_to: "James Wilson",
        created: "1h ago",
        last_updated: "25m ago"
      },
      %{
        id: 10230,
        subject: "Account verification pending",
        user: "Lisa Anderson",
        priority: "Medium",
        status: "Open",
        assigned_to: nil,
        created: "1h ago",
        last_updated: "45m ago"
      },
      %{
        id: 10229,
        subject: "API key generation failed",
        user: "Tom Rodriguez",
        priority: "High",
        status: "In Progress",
        assigned_to: "Alex Turner",
        created: "2h ago",
        last_updated: "1h ago"
      },
      %{
        id: 10228,
        subject: "Chart not loading properly",
        user: "Nina Patel",
        priority: "Low",
        status: "In Progress",
        assigned_to: "Sofia Martinez",
        created: "2h ago",
        last_updated: "1h ago"
      },
      %{
        id: 10227,
        subject: "Referral bonus not credited",
        user: "Chris Brown",
        priority: "Medium",
        status: "Open",
        assigned_to: nil,
        created: "3h ago",
        last_updated: "2h ago"
      }
    ]
  end

  defp live_chats do
    [
      %{
        user: "Robert Williams",
        user_id: 4521,
        last_message: "I need help with KYC verification...",
        duration: "2m 34s",
        waiting: true,
        agent: nil
      },
      %{
        user: "Jessica Lee",
        user_id: 3892,
        last_message: "Thanks, that worked!",
        duration: "8m 12s",
        waiting: false,
        agent: "Alex Turner"
      },
      %{
        user: "Michael Scott",
        user_id: 2156,
        last_message: "Can you explain the trading fees?",
        duration: "5m 45s",
        waiting: false,
        agent: "Sofia Martinez"
      },
      %{
        user: "Amy Zhang",
        user_id: 7834,
        last_message: "Hello? Anyone there?",
        duration: "4m 08s",
        waiting: true,
        agent: nil
      },
      %{
        user: "Carlos Gomez",
        user_id: 5621,
        last_message: "Let me check my account...",
        duration: "11m 23s",
        waiting: false,
        agent: "James Wilson"
      }
    ]
  end

  defp team_performance do
    [
      %{
        name: "Alex Turner",
        status: "Online",
        active_tickets: 5,
        resolved_today: 18,
        avg_response_time: "1.8m",
        rating: 4.9
      },
      %{
        name: "Sofia Martinez",
        status: "Online",
        active_tickets: 4,
        resolved_today: 22,
        avg_response_time: "2.1m",
        rating: 4.8
      },
      %{
        name: "James Wilson",
        status: "Online",
        active_tickets: 6,
        resolved_today: 15,
        avg_response_time: "2.5m",
        rating: 4.7
      },
      %{
        name: "Emma Thompson",
        status: "Away",
        active_tickets: 2,
        resolved_today: 19,
        avg_response_time: "1.9m",
        rating: 4.9
      },
      %{
        name: "Ryan Cooper",
        status: "Online",
        active_tickets: 7,
        resolved_today: 12,
        avg_response_time: "3.2m",
        rating: 4.6
      },
      %{
        name: "Olivia Brown",
        status: "Offline",
        active_tickets: 0,
        resolved_today: 20,
        avg_response_time: "2.0m",
        rating: 4.8
      }
    ]
  end
end
