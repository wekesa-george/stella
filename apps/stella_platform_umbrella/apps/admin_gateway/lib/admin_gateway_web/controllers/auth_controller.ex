defmodule AdminGatewayWeb.AuthController do
  use AdminGatewayWeb, :controller

  @doc """
  Returns the current admin user profile and permissions.
  Same contract as NestJS GET /api/admin/me.
  """
  def me(conn, _params) do
    admin = conn.assigns.admin_user
    json(conn, admin)
  end
end
