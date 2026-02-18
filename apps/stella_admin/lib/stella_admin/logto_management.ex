defmodule StellaAdmin.LogtoManagement do
  @moduledoc """
  Logto Management API client for admin user management.
  Handles creating users, assigning roles, and other administrative tasks in Logto.
  """

  require Logger

  @doc """
  Gets a management API token from Logto using M2M authentication.

  This requires a separate M2M application in Logto with Management API permissions.
  The M2M app credentials should be configured in config/runtime.exs as:
  - :m2m_app_id
  - :m2m_app_secret
  """
  def get_m2m_token do
    config = Application.get_env(:stella_admin, :logto)
    endpoint = config[:endpoint]

    # Use M2M app credentials (separate from OAuth app)
    m2m_app_id = config[:m2m_app_id] || System.get_env("LOGTO_M2M_APP_ID")
    m2m_app_secret = config[:m2m_app_secret] || System.get_env("LOGTO_M2M_APP_SECRET")

    if !m2m_app_id || !m2m_app_secret do
      {:error, "M2M app credentials not configured. Please set LOGTO_M2M_APP_ID and LOGTO_M2M_APP_SECRET"}
    else
      # Encode credentials as Base64 for Basic auth
      auth_string = Base.encode64("#{m2m_app_id}:#{m2m_app_secret}")

      body =
        URI.encode_query(%{
          grant_type: "client_credentials",
          resource: "https://default.logto.app/api",
          scope: "all"
        })

      case Req.post("#{endpoint}/oidc/token",
             body: body,
             headers: [
               {"Content-Type", "application/x-www-form-urlencoded"},
               {"Authorization", "Basic #{auth_string}"}
             ]
           ) do
        {:ok, %Req.Response{status: 200, body: %{"access_token" => token}}} ->
          Logger.info("Successfully obtained M2M access token")
          {:ok, token}

        {:ok, %Req.Response{status: status, body: body}} ->
          {:error, "Failed to get M2M token: #{status} - #{inspect(body)}"}

        {:error, reason} ->
          {:error, "HTTP request failed: #{inspect(reason)}"}
      end
    end
  end

  @doc """
  Creates a new user in Logto.
  Returns {:ok, logto_user_id} or {:error, reason}
  """
  def create_user(access_token, attrs) do
    config = Application.get_env(:stella_admin, :logto)
    endpoint = config[:endpoint]

    user_payload = %{
      primaryEmail: attrs.email,
      primaryPhone: attrs[:phone],
      username: attrs[:username] || String.replace(attrs.email, "@", "_"),
      name: "#{attrs.first_name} #{attrs.last_name}",
      profile: %{
        familyName: attrs.last_name,
        givenName: attrs.first_name
      }
    }

    case Req.post("#{endpoint}/api/users",
           json: user_payload,
           headers: [
             {"Authorization", "Bearer #{access_token}"}
           ]
         ) do
      {:ok, %Req.Response{status: code, body: %{"id" => logto_user_id}}}
      when code in [200, 201] ->
        Logger.info("Created Logto user: #{logto_user_id}")
        {:ok, logto_user_id}

      {:ok, %Req.Response{status: 422, body: body}} ->
        message =
          case body do
            %{"message" => msg} when is_binary(msg) -> msg
            _ -> inspect(body)
          end

        cond do
          String.contains?(message, "already") or String.contains?(message, "exists") ->
            {:error, "A user with this email already exists in Logto"}

          true ->
            {:error, message}
        end

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, "Failed to create user in Logto: #{status} - #{inspect(body)}"}

      {:error, reason} ->
        {:error, "HTTP request failed: #{inspect(reason)}"}
    end
  end

  @doc """
  Deletes a user from Logto (used for rollback).
  """
  def delete_user(access_token, logto_user_id) do
    config = Application.get_env(:stella_admin, :logto)
    endpoint = config[:endpoint]

    case Req.delete("#{endpoint}/api/users/#{logto_user_id}",
           headers: [
             {"Authorization", "Bearer #{access_token}"}
           ]
         ) do
      {:ok, %Req.Response{status: code}} when code in [200, 204] ->
        Logger.info("Deleted Logto user: #{logto_user_id}")
        {:ok, :deleted}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, "Failed to delete user from Logto: #{status} - #{inspect(body)}"}

      {:error, reason} ->
        {:error, "HTTP request failed: #{inspect(reason)}"}
    end
  end

  @doc """
  Sends a password reset email to a user in Logto.
  """
  def send_password_reset(access_token, logto_user_id) do
    config = Application.get_env(:stella_admin, :logto)
    endpoint = config[:endpoint]

    payload = %{
      userId: logto_user_id
    }

    case Req.post("#{endpoint}/api/verification-codes",
           json: payload,
           headers: [
             {"Authorization", "Bearer #{access_token}"}
           ]
         ) do
      {:ok, %Req.Response{status: code}} when code in [200, 201, 204] ->
        {:ok, :sent}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, "Failed to send password reset: #{status} - #{inspect(body)}"}

      {:error, reason} ->
        {:error, "HTTP request failed: #{inspect(reason)}"}
    end
  end
end
