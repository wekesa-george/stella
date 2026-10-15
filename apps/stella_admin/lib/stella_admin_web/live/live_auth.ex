defmodule StellaAdminWeb.LiveAuth do
  @moduledoc """
  LiveView authentication hooks for both regular users and admin users.
  """

  import Phoenix.LiveView
  import Phoenix.Component
  alias StellaAdmin.Auth

  ## Regular User Authentication (existing)

  def on_mount(:require_authenticated_user, _params, session, socket) do
    # Following Logto JS SDK pattern: check for ID token to determine authentication
    # See: @js/packages/client/src/client.ts:166-168
    case session["id_token"] do
      nil ->
        socket =
          socket
          |> put_flash(:error, "You must be signed in to access this page.")
          |> redirect(to: "/auth/sign-in")

        {:halt, socket}

      _id_token ->
        # Handle migration from old JSON-encoded format
        current_user = case session["current_user"] do
          user when is_map(user) -> user
          user when is_binary(user) ->
            case Jason.decode(user) do
              {:ok, decoded} -> decoded
              _ -> nil
            end
          _ -> nil
        end

        socket =
          socket
          |> assign(:current_user, current_user)
          |> assign(:access_token, session["access_token"])
          |> assign(:id_token, session["id_token"])

        {:cont, socket}
    end
  end

  ## Admin User Authentication (new for admin features)

  @doc """
  Ensures admin user is authenticated for LiveView.
  Use in live_session like: on_mount: {StellaAdminWeb.LiveAuth, :require_admin}
  """
  def on_mount(:require_admin, _params, session, socket) do
    case session["admin_session_token"] do
      nil ->
        socket =
          socket
          |> put_flash(:error, "You must be signed in to access this page.")
          |> redirect(to: "/auth/sign-in")

        {:halt, socket}

      session_token ->
        case Auth.get_session_by_token(session_token) do
          nil ->
            socket =
              socket
              |> put_flash(:error, "Your session has expired.")
              |> redirect(to: "/auth/sign-in")

            {:halt, socket}

          session ->
            if DateTime.compare(session.expires_at, DateTime.utc_now()) == :gt do
              # Load the admin user
              case Auth.get_admin_user(session.admin_user_id) do
                nil ->
                  socket =
                    socket
                    |> put_flash(:error, "Admin user not found.")
                    |> redirect(to: "/auth/sign-in")

                  {:halt, socket}

                admin_user ->
                  {:cont, assign(socket, current_admin: admin_user)}
              end
            else
              socket =
                socket
                |> put_flash(:error, "Your session has expired.")
                |> redirect(to: "/auth/sign-in")

              {:halt, socket}
            end
        end
    end
  end

  @doc """
  Ensures admin user has a specific permission.
  Use in live_session or LiveView like: on_mount: {StellaAdminWeb.LiveAuth, {:require_permission, "users.view"}}
  """
  def on_mount({:require_permission, permission_code}, _params, _session, socket) do
    if socket.assigns[:current_admin] && Auth.has_permission?(socket.assigns.current_admin, permission_code) do
      {:cont, socket}
    else
      socket =
        socket
        |> put_flash(:error, "You don't have permission to access this page.")
        |> redirect(to: "/")

      {:halt, socket}
    end
  end
end
