defmodule StellaAdminWeb.AdminUsersLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Admin

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Admin Users")
     |> assign(:current_page, :admin_users)
     |> assign(:filters, %{status: nil, role: nil, search: ""})
     |> assign(:show_filters, false)
     |> load_admin_users()}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    filters = %{
      status: parse_status(params["status"]),
      role: params["role"],
      search: params["search"] || ""
    }

    {:noreply,
     socket
     |> assign(:filters, filters)
     |> load_admin_users()}
  end

  @impl true
  def handle_event("filter", %{"filters" => filter_params}, socket) do
    {:noreply,
     push_patch(socket,
       to:
         ~p"/system/admins?#{build_query_params(filter_params)}"
     )}
  end

  @impl true
  def handle_event("clear_filters", _params, socket) do
    {:noreply, push_patch(socket, to: ~p"/system/admins")}
  end

  @impl true
  def handle_event("toggle_filters", _params, socket) do
    {:noreply, assign(socket, :show_filters, !socket.assigns.show_filters)}
  end

  defp load_admin_users(socket) do
    filters = socket.assigns.filters
    opts = [status: filters.status, role: filters.role, search: filters.search, limit: 50]

    admin_users = Admin.list_admin_users(opts)
    total_count = Admin.count_admin_users(opts)

    socket
    |> assign(:admin_users, admin_users)
    |> assign(:total_count, total_count)
  end

  defp parse_status(nil), do: nil
  defp parse_status(""), do: nil
  defp parse_status(status) when is_binary(status), do: String.to_existing_atom(status)

  defp build_query_params(params) do
    params
    |> Enum.filter(fn {_key, value} -> value != "" and value != nil end)
    |> Enum.into(%{})
  end

  defp format_status(:invited), do: "Invited"
  defp format_status(:active), do: "Active"
  defp format_status(:suspended), do: "Suspended"
  defp format_status(:deactivated), do: "Deactivated"

  defp status_badge_class(:active), do: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
  defp status_badge_class(:invited), do: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
  defp status_badge_class(:suspended), do: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300"
  defp status_badge_class(:deactivated), do: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"

  @impl true
  def render(assigns) do
    ~H"""
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="sm:flex sm:items-center">
        <div class="sm:flex-auto">
          <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Admin Users</h1>
          <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">
            Manage admin users and their permissions. Total: {@total_count}
          </p>
        </div>
        <div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none flex items-center gap-3">
          <button
            type="button"
            phx-click="toggle_filters"
            class="inline-flex items-center gap-2 rounded-md bg-white dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            <.icon name="hero-funnel" class="size-4" />
            <span><%= if @show_filters, do: "Hide Filters", else: "Show Filters" %></span>
          </button>
          <.link
            navigate={~p"/system/admins/new"}
            class="inline-flex items-center gap-2 rounded-md bg-indigo-600 dark:bg-indigo-500 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <.icon name="hero-plus" class="size-4" />
            <span>Invite Admin</span>
          </.link>
        </div>
      </div>

      <!-- Filters -->
      <%= if @show_filters do %>
        <div class="mt-8 bg-white dark:bg-gray-800 shadow sm:rounded-lg border dark:border-gray-700">
        <div class="px-4 py-5 sm:p-6">
          <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100">Filters</h3>
          <form phx-submit="filter" class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <!-- Search -->
            <div>
              <label for="search" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Search</label>
              <input
                type="text"
                name="filters[search]"
                id="search"
                value={@filters.search}
                placeholder="Email, name..."
                class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <!-- Status Filter -->
            <div>
              <label for="status" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
              <select
                name="filters[status]"
                id="status"
                class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="">All Statuses</option>
                <option value="active" selected={@filters.status == :active}>Active</option>
                <option value="invited" selected={@filters.status == :invited}>Invited</option>
                <option value="suspended" selected={@filters.status == :suspended}>
                  Suspended
                </option>
                <option value="deactivated" selected={@filters.status == :deactivated}>
                  Deactivated
                </option>
              </select>
            </div>

            <!-- Actions -->
            <div class="flex items-end gap-2">
              <button
                type="submit"
                class="rounded-md bg-indigo-600 dark:bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Apply Filters
              </button>
              <button
                type="button"
                phx-click="clear_filters"
                class="rounded-md bg-white dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Clear
              </button>
            </div>
          </form>
        </div>
        </div>
      <% end %>

      <!-- Admin Users Table -->
      <div class="mt-8 flow-root">
        <div class="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div class="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <table class="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
              <thead>
                <tr>
                  <th
                    scope="col"
                    class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 sm:pl-0"
                  >
                    Name
                  </th>
                  <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Email
                  </th>
                  <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Status
                  </th>
                  <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Last Login
                  </th>
                  <th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-0">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <%= for admin_user <- @admin_users do %>
                  <tr>
                    <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-100 sm:pl-0">
                      <%= admin_user.first_name %> <%= admin_user.last_name %>
                      <%= if admin_user.is_super_admin do %>
                        <span class="ml-2 inline-flex items-center rounded-md bg-purple-100 dark:bg-purple-900/30 px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-300">
                          Super Admin
                        </span>
                      <% end %>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <%= admin_user.email %>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                      <span class={"inline-flex items-center rounded-md px-2 py-1 text-xs font-medium #{status_badge_class(admin_user.status)}"}>
                        <%= format_status(admin_user.status) %>
                      </span>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <%= if admin_user.last_login_at do %>
                        <%= Calendar.strftime(admin_user.last_login_at, "%Y-%m-%d %H:%M") %>
                      <% else %>
                        Never
                      <% end %>
                    </td>
                    <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                      <.link
                        navigate={~p"/system/admins/#{admin_user.id}"}
                        class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
                      >
                        View
                      </.link>
                    </td>
                  </tr>
                <% end %>
              </tbody>
            </table>

            <%= if @admin_users == [] do %>
              <div class="text-center py-12">
                <p class="text-sm text-gray-500 dark:text-gray-400">No admin users found.</p>
              </div>
            <% end %>
          </div>
        </div>
      </div>
    </div>
    """
  end
end
