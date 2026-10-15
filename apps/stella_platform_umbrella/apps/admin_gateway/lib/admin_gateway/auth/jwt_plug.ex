defmodule AdminGateway.Auth.JwtPlug do
  @moduledoc """
  Plug that verifies the Logto JWT from the Authorization header,
  resolves the admin user + permissions from DB, and assigns them to conn.

  After this plug runs:
  - `conn.assigns.jwt_claims` — raw JWT claims
  - `conn.assigns.admin_user` — admin user with permissions

  If verification fails, responds with 401.
  If admin not found or inactive, responds with 403.
  """

  import Plug.Conn
  require Logger

  alias AdminGateway.Auth.Token
  alias AdminGateway.Auth.Permissions

  def init(opts), do: opts

  def call(conn, _opts) do
    with {:ok, token} <- extract_bearer(conn),
         {:ok, claims} <- Token.verify(token),
         logto_user_id <- Map.get(claims, "sub"),
         {:ok, admin} <- Permissions.get_admin(logto_user_id),
         :ok <- check_active(admin) do
      conn
      |> assign(:jwt_claims, claims)
      |> assign(:admin_user, admin)
    else
      {:error, :no_bearer_token} ->
        conn |> send_json(401, %{error: "Missing Authorization header"}) |> halt()

      {:error, :token_expired} ->
        conn |> send_json(401, %{error: "Token expired"}) |> halt()

      {:error, :invalid_signature} ->
        conn |> send_json(401, %{error: "Invalid token signature"}) |> halt()

      {:error, :not_found} ->
        conn |> send_json(403, %{error: "No admin account linked to this user"}) |> halt()

      {:error, :inactive} ->
        conn |> send_json(403, %{error: "Admin account is not active"}) |> halt()

      {:error, reason} ->
        Logger.warning("Auth failed: #{inspect(reason)}")
        conn |> send_json(401, %{error: "Authentication failed"}) |> halt()
    end
  end

  defp extract_bearer(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] -> {:ok, String.trim(token)}
      _ -> {:error, :no_bearer_token}
    end
  end

  defp check_active(%{status: "active"}), do: :ok
  defp check_active(_), do: {:error, :inactive}

  defp send_json(conn, status, body) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(body))
  end
end
