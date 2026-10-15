defmodule StellaAdminWeb.Plugs.RequireAdminAuth do
  @moduledoc """
  Ensures that an admin user is authenticated.
  Redirects to sign-in page if not authenticated.
  """
  import Plug.Conn
  import Phoenix.Controller

  def init(opts), do: opts

  def call(conn, _opts) do
    if conn.assigns[:current_admin] do
      conn
    else
      conn
      |> put_flash(:error, "You must be signed in to access this page.")
      |> redirect(to: "/auth/sign-in")
      |> halt()
    end
  end
end
