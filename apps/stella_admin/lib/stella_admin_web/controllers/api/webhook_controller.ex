defmodule StellaAdminWeb.Api.WebhookController do
  use StellaAdminWeb, :controller
  alias StellaAdmin.Repo
  alias StellaAdmin.Accounts.User
  alias StellaAdmin.Auth
  require Logger

  @doc """
  Handles Logto webhook events for user sync
  """
  def user_webhooks(conn, params) do
    # Verify webhook signature
    signature = get_req_header(conn, "logto-signature-sha-256") |> List.first()

    case verify_signature(conn, signature, params) do
      :ok ->
        handle_webhook_event(conn, params)

      {:error, reason} ->
        Logger.warning("Webhook signature verification failed: #{inspect(reason)}")
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Unauthorized", message: "Invalid webhook signature"})
    end
  end

  defp verify_signature(_conn, nil, _params) do
    {:error, :missing_signature}
  end

  defp verify_signature(_conn, signature, params) do
    signing_key = Application.get_env(:stella_admin, :logto)[:webhook_signing_key]

    if is_nil(signing_key) do
      Logger.error("LOGTO_WEBHOOK_SIGNING_KEY not configured")
      {:error, :missing_signing_key}
    else
      # Reconstruct the raw body as JSON string (same as what Logto signed)
      raw_body = Jason.encode!(params)

      # Compute HMAC SHA-256
      computed_signature =
        :crypto.mac(:hmac, :sha256, signing_key, raw_body)
        |> Base.encode16(case: :lower)

      if secure_compare(signature, computed_signature) do
        :ok
      else
        Logger.warning("Signature mismatch. Expected: #{computed_signature}, Got: #{signature}")
        {:error, :signature_mismatch}
      end
    end
  end

  # Constant-time comparison to prevent timing attacks
  defp secure_compare(a, b) when byte_size(a) == byte_size(b) do
    secure_compare(a, b, 0) == 0
  end

  defp secure_compare(_, _), do: false

  defp secure_compare(<<x, rest_a::binary>>, <<y, rest_b::binary>>, acc) do
    import Bitwise
    secure_compare(rest_a, rest_b, acc ||| bxor(x, y))
  end

  defp secure_compare(<<>>, <<>>, acc), do: acc

  defp handle_webhook_event(conn, %{"event" => event} = params) do
    Logger.info("Received webhook event: #{event}")

    case event do
      "PostSignIn" ->
        handle_post_signin(conn, params)

      "PostRegister" ->
        handle_post_register(conn, params)

      "User.Created" ->
        handle_user_created(conn, params)

      "User.Data.Updated" ->
        handle_user_updated(conn, params)

      "User.Deleted" ->
        handle_user_deleted(conn, params)

      _ ->
        Logger.info("Unhandled webhook event: #{event}")
        conn
        |> put_status(:ok)
        |> json(%{status: "success", message: "Event received but not processed", timestamp: DateTime.utc_now()})
    end
  end

  defp handle_webhook_event(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{status: "error", message: "Invalid webhook payload - missing event field"})
  end

  defp handle_post_signin(conn, %{"user" => user_data}) do
    Logger.info("Processing PostSignIn webhook for user: #{user_data["primaryEmail"]}")

    # Extract user information
    attrs = %{
      id: user_data["id"],
      email: user_data["primaryEmail"] || user_data["primaryPhone"],
      status: if(user_data["isSuspended"], do: "suspended", else: "active")
    }

    # Upsert user (create or update)
    case upsert_user(attrs) do
      {:ok, user} ->
        Logger.info("User synced successfully: #{user.id}")
        conn
        |> put_status(:ok)
        |> json(%{
          status: "success",
          message: "User login processed successfully",
          user_id: user.id,
          timestamp: DateTime.utc_now()
        })

      {:error, changeset} ->
        Logger.error("Failed to sync user: #{inspect(changeset.errors)}")
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{
          status: "error",
          message: "Failed to process user",
          details: format_errors(changeset)
        })
    end
  end

  defp handle_post_signin(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{status: "error", message: "Missing user data in PostSignIn event"})
  end

  defp handle_post_register(conn, %{"user" => user_data}) do
    Logger.info("Processing PostRegister webhook for user: #{user_data["primaryEmail"]}")

    attrs = %{
      id: user_data["id"],
      email: user_data["primaryEmail"] || user_data["primaryPhone"],
      status: "active"
    }

    changeset = User.webhook_changeset(%User{}, attrs)

    case Repo.insert(changeset, on_conflict: :nothing) do
      {:ok, user} ->
        Logger.info("User created from webhook: #{user.id}")
        conn
        |> put_status(:created)
        |> json(%{
          status: "success",
          message: "User registered successfully",
          user_id: user.id,
          timestamp: DateTime.utc_now()
        })

      {:error, changeset} ->
        Logger.error("Failed to create user from webhook: #{inspect(changeset.errors)}")
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{
          status: "error",
          message: "Failed to create user",
          details: format_errors(changeset)
        })
    end
  end

  defp handle_post_register(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{status: "error", message: "Missing user data in PostRegister event"})
  end

  defp handle_user_created(conn, %{"data" => user_data}) do
    attrs = %{
      id: user_data["id"],
      email: user_data["primaryEmail"] || user_data["primaryPhone"],
      status: "active"
    }

    changeset = User.webhook_changeset(%User{}, attrs)

    case Repo.insert(changeset, on_conflict: :nothing) do
      {:ok, user} ->
        Logger.info("User created from webhook: #{user.id}")
        conn
        |> put_status(:created)
        |> json(%{status: "success", message: "User created", user_id: user.id})

      {:error, changeset} ->
        Logger.error("Failed to create user from webhook: #{inspect(changeset.errors)}")
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{status: "error", message: "Failed to create user", details: format_errors(changeset)})
    end
  end

  defp handle_user_updated(conn, %{"data" => user_data}) do
    user_id = user_data["id"]

    attrs = %{
      id: user_id,
      email: user_data["primaryEmail"] || user_data["primaryPhone"],
      status: if(user_data["isSuspended"], do: "suspended", else: "active")
    }

    case upsert_user(attrs) do
      {:ok, user} ->
        Logger.info("User updated from webhook: #{user.id}")
        conn
        |> put_status(:ok)
        |> json(%{status: "success", message: "User updated", user_id: user.id})

      {:error, changeset} ->
        Logger.error("Failed to update user from webhook: #{inspect(changeset.errors)}")
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{status: "error", message: "Failed to update user", details: format_errors(changeset)})
    end
  end

  defp handle_user_deleted(conn, %{"data" => user_data}) do
    user_id = user_data["id"]

    case Repo.get(User, user_id) do
      nil ->
        Logger.warning("Attempted to delete non-existent user: #{user_id}")
        conn
        |> put_status(:not_found)
        |> json(%{status: "error", message: "User not found"})

      user ->
        case Repo.delete(user) do
          {:ok, _user} ->
            Logger.info("User deleted from webhook: #{user_id}")
            conn
            |> put_status(:ok)
            |> json(%{status: "success", message: "User deleted", user_id: user_id})

          {:error, _changeset} ->
            Logger.error("Failed to delete user from webhook: #{user_id}")
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{status: "error", message: "Failed to delete user"})
        end
    end
  end

  # Upsert user (create or update)
  defp upsert_user(attrs) do
    case Repo.get(User, attrs.id) do
      nil ->
        # User doesn't exist, create it
        %User{}
        |> User.webhook_changeset(attrs)
        |> Repo.insert()

      user ->
        # User exists, update it
        user
        |> User.webhook_changeset(attrs)
        |> Repo.update()
    end
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end

  ## Admin Webhooks

  @doc """
  Handles Logto webhook events for admin user sync
  """
  def admin_webhooks(conn, params) do
    # Verify webhook signature
    signature = get_req_header(conn, "logto-signature-sha-256") |> List.first()

    case verify_signature(conn, signature, params) do
      :ok ->
        handle_admin_webhook_event(conn, params)

      {:error, reason} ->
        Logger.warning("Admin webhook signature verification failed: #{inspect(reason)}")
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Unauthorized", message: "Invalid webhook signature"})
    end
  end

  defp handle_admin_webhook_event(conn, %{"event" => event} = params) do
    Logger.info("Received admin webhook event: #{event}")

    case event do
      "PostSignIn" ->
        handle_admin_post_signin(conn, params)

      "PostRegister" ->
        handle_admin_post_register(conn, params)

      _ ->
        Logger.info("Unhandled admin webhook event: #{event}")
        conn
        |> put_status(:ok)
        |> json(%{status: "success", message: "Event received but not processed", timestamp: DateTime.utc_now()})
    end
  end

  defp handle_admin_webhook_event(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{status: "error", message: "Invalid webhook payload - missing event field"})
  end

  defp handle_admin_post_signin(conn, %{"user" => user_data}) do
    Logger.info("Processing admin PostSignIn webhook for: #{user_data["primaryEmail"]}")

    # Extract admin user information
    attrs = %{
      id: user_data["id"],
      email: user_data["primaryEmail"] || user_data["primaryPhone"],
      name: user_data["name"],
      status: if(user_data["isSuspended"], do: "suspended", else: "active")
    }

    # Authenticate admin (create or update)
    case Auth.authenticate_admin(attrs) do
      {:ok, admin} ->
        Logger.info("Admin user synced successfully: #{admin.id}")
        conn
        |> put_status(:ok)
        |> json(%{
          status: "success",
          message: "Admin login processed successfully",
          admin_id: admin.id,
          timestamp: DateTime.utc_now()
        })

      {:error, changeset} ->
        Logger.error("Failed to sync admin user: #{inspect(changeset.errors)}")
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{
          status: "error",
          message: "Failed to process admin user",
          details: format_errors(changeset)
        })
    end
  end

  defp handle_admin_post_signin(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{status: "error", message: "Missing user data in admin PostSignIn event"})
  end

  defp handle_admin_post_register(conn, %{"user" => user_data}) do
    Logger.info("Processing admin PostRegister webhook for: #{user_data["primaryEmail"]}")

    attrs = %{
      id: user_data["id"],
      email: user_data["primaryEmail"] || user_data["primaryPhone"],
      name: user_data["name"],
      status: "active"
    }

    case Auth.authenticate_admin(attrs) do
      {:ok, admin} ->
        Logger.info("Admin user registered from webhook: #{admin.id}")
        conn
        |> put_status(:created)
        |> json(%{
          status: "success",
          message: "Admin registered successfully",
          admin_id: admin.id,
          timestamp: DateTime.utc_now()
        })

      {:error, changeset} ->
        Logger.error("Failed to register admin user: #{inspect(changeset.errors)}")
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{
          status: "error",
          message: "Failed to create admin user",
          details: format_errors(changeset)
        })
    end
  end

  defp handle_admin_post_register(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{status: "error", message: "Missing user data in admin PostRegister event"})
  end
end
