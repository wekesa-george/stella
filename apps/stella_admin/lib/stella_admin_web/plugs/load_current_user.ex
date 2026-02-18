defmodule StellaAdminWeb.Plugs.LoadCurrentUser do
  @moduledoc """
  Plug to load the current authenticated user from session into conn.assigns.
  This makes the user available to all controllers and LiveViews.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    id_token = get_session(conn, :id_token)
    current_user_raw = get_session(conn, :current_user)
    access_token = get_session(conn, :access_token)

    # Handle migration from old JSON-encoded format
    current_user = case current_user_raw do
      user when is_map(user) -> user
      user when is_binary(user) ->
        case Jason.decode(user) do
          {:ok, decoded} -> decoded
          _ -> nil
        end
      _ -> nil
    end

    conn
    |> assign(:id_token, id_token)
    |> assign(:current_user, current_user)
    |> assign(:access_token, access_token)
  end
end
