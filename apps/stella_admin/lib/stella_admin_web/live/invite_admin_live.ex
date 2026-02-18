defmodule StellaAdminWeb.InviteAdminLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Admin

  @impl true
  def mount(_params, _session, socket) do
    roles = Admin.list_roles()
    form = to_form(changeset(), as: "admin")

    {:ok,
     socket
     |> assign(:page_title, "Invite Admin User")
     |> assign(:current_page, :admin_users)
     |> assign(:roles, roles)
     |> assign(:form, form)
     |> assign(:submitting, false)}
  end

  @impl true
  def handle_event("validate", %{"admin" => admin_params}, socket) do
    form =
      admin_params
      |> changeset(:validate)
      |> to_form(as: "admin")

    {:noreply, assign(socket, :form, form)}
  end

  @impl true
  def handle_event("invite", %{"admin" => admin_params}, socket) do
    current_admin = socket.assigns.current_admin

    socket = assign(socket, :submitting, true)

    attrs = %{
      email: admin_params["email"],
      first_name: admin_params["first_name"],
      last_name: admin_params["last_name"],
      phone: admin_params["phone"],
      display_name: admin_params["display_name"],
      is_super_admin: admin_params["is_super_admin"] == "true"
    }

    case Admin.invite_admin_user(attrs, current_admin.id) do
      {:ok, admin_user} ->
        {:noreply,
         socket
         |> put_flash(:info, "Admin user invited successfully!")
         |> push_navigate(to: ~p"/system/admins/#{admin_user.id}")}

      {:error, reason} ->
        {:noreply,
         socket
         |> assign(:submitting, false)
         |> put_flash(:error, "Failed to invite admin: #{reason}")}
    end
  end

  defp changeset(params \\ %{}, action \\ nil) do
    types = %{
      email: :string,
      first_name: :string,
      last_name: :string,
      phone: :string,
      display_name: :string,
      is_super_admin: :boolean
    }

    changeset =
      {%{}, types}
      |> Ecto.Changeset.cast(params, Map.keys(types))
      |> Ecto.Changeset.validate_required([:email, :first_name, :last_name])
      |> Ecto.Changeset.validate_format(:email, ~r/@/)

    if action, do: Map.put(changeset, :action, action), else: changeset
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="px-4 sm:px-6 lg:px-8">
      <nav class="flex mb-4">
        <ol class="inline-flex items-center space-x-1 md:space-x-3">
          <li class="inline-flex items-center">
            <.link navigate={~p"/system/admins"} class="inline-flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">
              <.icon name="hero-arrow-left" class="size-4 mr-2" />
              Admin Users
            </.link>
          </li>
          <li>
            <div class="flex items-center">
              <.icon name="hero-chevron-right" class="size-4 text-gray-400" />
              <span class="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400 md:ml-2">Invite</span>
            </div>
          </li>
        </ol>
      </nav>

      <div class="max-w-2xl">
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Invite Admin User</h1>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-8">
          This will create a new user in Logto and send them an invitation email.
        </p>

        <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg border dark:border-gray-700 p-6">
          <.form for={@form} phx-change="validate" phx-submit="invite">
            <div class="space-y-6">
              <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label for="first_name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    First Name *
                  </label>
                  <input type="text" name="admin[first_name]" id="first_name" required class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                </div>

                <div>
                  <label for="last_name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Last Name *
                  </label>
                  <input type="text" name="admin[last_name]" id="last_name" required class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                </div>
              </div>

              <div>
                <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email Address *
                </label>
                <input type="email" name="admin[email]" id="email" required class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
              </div>

              <div>
                <label for="phone" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="admin[phone]"
                  id="phone"
                  phx-hook="PhoneInput"
                  placeholder="+1 (555) 000-0000"
                  class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Include country code (e.g., +1 for US)</p>
              </div>

              <div>
                <label for="display_name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Display Name
                </label>
                <input type="text" name="admin[display_name]" id="display_name" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
              </div>

              <div class="flex items-center">
                <input type="checkbox" name="admin[is_super_admin]" id="is_super_admin" value="true" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600" />
                <label for="is_super_admin" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Grant Super Admin privileges
                </label>
              </div>
            </div>

            <div class="mt-6 flex items-center justify-end gap-x-3">
              <.link navigate={~p"/system/admins"} class="rounded-md bg-white dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600">
                Cancel
              </.link>
              <button type="submit" disabled={@submitting} class="inline-flex items-center gap-2 rounded-md bg-indigo-600 dark:bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed">
                <%= if @submitting do %>
                  <.icon name="hero-arrow-path" class="size-4 animate-spin" />
                  <span>Inviting...</span>
                <% else %>
                  <.icon name="hero-paper-airplane" class="size-4" />
                  <span>Send Invitation</span>
                <% end %>
              </button>
            </div>
          </.form>
        </div>
      </div>
    </div>
    """
  end
end
