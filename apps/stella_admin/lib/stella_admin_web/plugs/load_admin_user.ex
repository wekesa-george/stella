defmodule StellaAdminWeb.Plugs.LoadAdminUser do
  @moduledoc """
  Loads the current admin user from the session.
  This plug should be added to the browser pipeline.
  """
  import Plug.Conn
  alias StellaAdmin.Auth

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_session(conn, :admin_session_token) do
      nil ->
        assign(conn, :current_admin, nil)

      session_token ->
        case Auth.get_session_by_token(session_token) do
          nil ->
            conn
            |> delete_session(:admin_session_token)
            |> assign(:current_admin, nil)

          session ->
            # Check if session is expired
            if DateTime.compare(session.expires_at, DateTime.utc_now()) == :gt do
              # Session valid, update activity
              Auth.update_session_activity(session)

              # Load the admin user
              case Auth.get_admin_user(session.admin_user_id) do
                nil ->
                  conn
                  |> delete_session(:admin_session_token)
                  |> assign(:current_admin, nil)

                admin_user ->
                  assign(conn, :current_admin, admin_user)
              end
            else
              # Session expired
              conn
              |> delete_session(:admin_session_token)
              |> assign(:current_admin, nil)
            end
        end
    end
  end
end
