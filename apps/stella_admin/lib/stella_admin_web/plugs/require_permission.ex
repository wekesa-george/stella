defmodule StellaAdminWeb.Plugs.RequirePermission do
  @moduledoc """
  Ensures that the current admin user has a specific permission.
  Returns 403 Forbidden if unauthorized.
  """
  import Plug.Conn
  import Phoenix.Controller
  alias StellaAdmin.Auth

  def init(opts), do: opts

  def call(conn, permission_code) do
    if conn.assigns[:current_admin] && Auth.has_permission?(conn.assigns.current_admin, permission_code) do
      conn
    else
      conn
      |> put_status(:forbidden)
      |> put_view(html: StellaAdminWeb.ErrorHTML)
      |> render(:"403")
      |> halt()
    end
  end
end
