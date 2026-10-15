defmodule StellaAdminWeb.Logto do
  @moduledoc """
  OAuth2 client for Logto authentication
  Based on the Logto OIDC implementation
  """

  use OAuth2.Strategy

  # OAuth2 Client Configuration

  def client do
    config = Application.get_env(:stella_admin, :logto)

    OAuth2.Client.new([
      strategy: __MODULE__,
      client_id: config[:app_id],
      client_secret: config[:app_secret],
      site: config[:endpoint],
      redirect_uri: config[:redirect_uri],
      authorize_url: "#{config[:endpoint]}/oidc/auth",
      token_url: "#{config[:endpoint]}/oidc/token",
      userinfo_url: "#{config[:endpoint]}/oidc/me"
    ])
  end

  # OAuth2 Strategy Callbacks (required by OAuth2.Strategy)

  def authorize_url(client, params) do
    OAuth2.Strategy.AuthCode.authorize_url(client, params)
  end

  def get_token(client, params, headers) do
    OAuth2.Strategy.AuthCode.get_token(client, params, headers)
  end

  # Helper Functions

  def authorize_url!(client, params \\ %{}) do
    params = Map.merge(%{
      response_type: "code",
      prompt: "consent"
    }, params)

    OAuth2.Client.authorize_url!(client, params)
  end

  def exchange_code_for_token(code) do
    client = client()

    params = [
      code: code,
      grant_type: "authorization_code",
      redirect_uri: client.redirect_uri
    ]

    case OAuth2.Client.get_token(client, params) do
      {:ok, %OAuth2.Client{token: token}} -> {:ok, token}
      {:error, %OAuth2.Response{body: body}} -> {:error, body}
      {:error, %OAuth2.Error{reason: reason}} -> {:error, reason}
    end
  end

  def get_user_info(token) do
    config = Application.get_env(:stella_admin, :logto)
    userinfo_url = "#{config[:endpoint]}/oidc/me"

    client = client()
    client = %{client | token: token}

    case OAuth2.Client.get(client, userinfo_url) do
      {:ok, %OAuth2.Response{status_code: 200, body: user}} ->
        {:ok, user}

      {:ok, %OAuth2.Response{status_code: status_code, body: body}} ->
        {:error, "Failed to fetch user info: #{status_code} - #{inspect(body)}"}

      {:error, %OAuth2.Error{reason: reason}} ->
        {:error, reason}

      {:error, error} ->
        {:error, error}
    end
  end

  def logout_url(client, post_logout_redirect_uri) do
    query_params = URI.encode_query(%{
      post_logout_redirect_uri: post_logout_redirect_uri
    })

    "#{client.site}/oidc/session/end?#{query_params}"
  end

  # Refresh token function for future use
  def refresh_token(refresh_token) do
    client = client()

    params = [
      grant_type: "refresh_token",
      refresh_token: refresh_token
    ]

    case OAuth2.Client.get_token(client, params) do
      {:ok, %OAuth2.Client{token: token}} -> {:ok, token}
      {:error, %OAuth2.Response{body: body}} -> {:error, body}
      {:error, %OAuth2.Error{reason: reason}} -> {:error, reason}
    end
  end
end
