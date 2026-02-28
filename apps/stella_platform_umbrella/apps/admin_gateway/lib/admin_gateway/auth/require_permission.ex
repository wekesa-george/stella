defmodule AdminGateway.Auth.RequirePermission do
  @moduledoc """
  Plug that checks if the current admin has the required permission(s).
  Must be used AFTER `AdminGateway.Auth.JwtPlug` in the pipeline.

  ## Usage in router:

      # Single permission
      plug AdminGateway.Auth.RequirePermission, "users.view"

      # Multiple permissions (ALL required)
      plug AdminGateway.Auth.RequirePermission, ["kyc.approve", "kyc.view_applicants"]

  ## Usage in a controller (per-action):

      plug AdminGateway.Auth.RequirePermission, "alerts.acknowledge"
        when action in [:acknowledge, :bulk_acknowledge]

      plug AdminGateway.Auth.RequirePermission, "alerts.view"
        when action in [:index]
  """

  import Plug.Conn

  alias AdminGateway.Auth.Permissions

  def init(permission) when is_binary(permission), do: [permission]
  def init(permissions) when is_list(permissions), do: permissions

  def call(conn, required_permissions) do
    admin = conn.assigns[:admin_user]

    if admin && Permissions.has_all_permissions?(admin, required_permissions) do
      conn
    else
      missing = required_permissions -- Map.get(admin || %{}, :permissions, [])

      conn
      |> put_resp_content_type("application/json")
      |> send_resp(403, Jason.encode!(%{
        error: "Missing required permissions",
        missing: missing
      }))
      |> halt()
    end
  end
end
