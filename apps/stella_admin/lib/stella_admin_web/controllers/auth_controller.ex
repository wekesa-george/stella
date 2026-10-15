defmodule StellaAdminWeb.AuthController do
  use StellaAdminWeb, :controller
  require Logger

  alias StellaAdminWeb.Logto
  alias StellaAdmin.Auth

  @doc """
  Initiates the OAuth2 sign-in flow by redirecting to Logto
  """
  def sign_in(conn, _params) do
    client = Logto.client()

    # Generate state for CSRF protection
    state = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)

    # Store state in session for verification in callback
    conn = put_session(conn, :oauth_state, state)

    # Build authorization URL
    authorize_url = Logto.authorize_url!(client, %{
      state: state,
      scope: "openid profile email offline_access"
    })

    redirect(conn, external: authorize_url)
  end

  @doc """
  Handles the OAuth2 callback from Logto
  Exchanges the authorization code for tokens and creates a user session
  """
  def callback(conn, %{"code" => code, "state" => state} = _params) do
    # Verify state to prevent CSRF attacks
    session_state = get_session(conn, :oauth_state)

    if state != session_state do
      conn
      |> put_flash(:error, "Invalid state parameter. Please try again.")
      |> redirect(to: "/")
    else
      # Exchange code for tokens
      case Logto.exchange_code_for_token(code) do
        {:ok, token} ->
          # Parse the token response - OAuth2 lib returns JSON string in access_token field
          token_data = Jason.decode!(token.access_token)

          # Extract tokens from the parsed response
          id_token = token_data["id_token"]
          access_token = token_data["access_token"]
          refresh_token = token_data["refresh_token"]

          # Build proper OAuth2 token for userinfo request
          proper_token = %OAuth2.AccessToken{
            access_token: access_token,
            token_type: "Bearer"
          }

          # Get user info from Logto
          case Logto.get_user_info(proper_token) do
            {:ok, user_info} ->
              # Parse user_info if it's a JSON string
              user_info = if is_binary(user_info), do: Jason.decode!(user_info), else: user_info

              # Sync admin user to our database
              # Parse name into first_name and last_name
              name = user_info["name"] || user_info["username"] || user_info["email"]
              name_parts = String.split(name, " ", parts: 2)
              first_name = Enum.at(name_parts, 0) || "Unknown"
              last_name = Enum.at(name_parts, 1) || ""

              admin_attrs = %{
                logto_user_id: user_info["sub"],  # Logto user ID (sub claim from OIDC)
                email: user_info["email"],
                first_name: first_name,
                last_name: last_name,
                status: "active",
                avatar_url: user_info["picture"]
              }

              case Auth.authenticate_admin(admin_attrs) do
                {:ok, admin_user} ->
                  # Create admin session in our system
                  {:ok, {_session, token}} = Auth.create_admin_session(admin_user.id, %{
                    ip_address: to_string(:inet_parse.ntoa(conn.remote_ip)),
                    user_agent: get_req_header(conn, "user-agent") |> List.first()
                  })

                  Logger.info("Admin user signed in: #{admin_user.email}")

                  conn
                  |> delete_session(:oauth_state)
                  |> put_session(:admin_session_token, token)
                  |> put_session(:id_token, id_token)
                  |> put_session(:access_token, access_token)
                  |> put_flash(:info, "Successfully signed in as #{admin_user.email}")
                  |> redirect(to: "/")

                {:error, changeset} ->
                  Logger.error("Failed to create/update admin user: #{inspect(changeset.errors)}")

                  conn
                  |> put_flash(:error, "Failed to create admin session. Please contact support.")
                  |> redirect(to: "/auth/sign-in")
              end

            {:error, error} ->
              Logger.error("Failed to fetch user info: #{inspect(error)}")

              conn
              |> put_flash(:error, "Failed to fetch user information from Logto.")
              |> redirect(to: "/auth/sign-in")
          end

        {:error, error} ->
          Logger.error("Failed to exchange code for token: #{inspect(error)}")

          conn
          |> put_flash(:error, "Authentication failed. Please try again.")
          |> redirect(to: "/")
      end
    end
  end

  def callback(conn, _params) do
    conn
    |> put_flash(:error, "Missing authorization code.")
    |> redirect(to: "/")
  end

  @doc """
  Signs out the admin user by clearing the session
  """
  def sign_out(conn, _params) do
    # Expire admin session in our database
    case get_session(conn, :admin_session_token) do
      nil -> :ok
      session_token -> Auth.expire_admin_session(session_token)
    end

    client = Logto.client()
    post_logout_redirect_uri = StellaAdminWeb.Endpoint.url()

    # Build Logto logout URL
    logout_url = Logto.logout_url(client, post_logout_redirect_uri)

    conn
    |> configure_session(drop: true)
    |> put_flash(:info, "Successfully signed out.")
    |> redirect(external: logout_url)
  end
end
