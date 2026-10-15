defmodule StellaAdminWeb.Plugs.RequireAuth do
  @moduledoc """
  Plug to ensure user is authenticated via Logto OAuth2.
  Redirects to sign-in page if not authenticated.
  """

  import Plug.Conn
  import Phoenix.Controller

  def init(opts), do: opts

  def call(conn, _opts) do
    # Following Logto JS SDK pattern: check for ID token to determine authentication
    # See: @js/packages/client/src/client.ts:166-168
    case get_session(conn, :id_token) do
      nil ->
        conn
        |> put_flash(:error, "You must be signed in to access this page.")
        |> redirect(to: "/auth/sign-in")
        |> halt()

      _id_token ->
        conn
    end
  end
end
