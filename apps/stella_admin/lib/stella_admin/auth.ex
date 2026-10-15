defmodule StellaAdmin.Auth do
  @moduledoc """
  The Auth context handles admin user authentication and authorization.
  """

  import Ecto.Query
  alias StellaAdmin.Repo
  alias StellaAdmin.Auth.{AdminUser, AdminRole, AdminPermission, AdminUserRole, AdminSession}

  ## Admin User Functions

  @doc """
  Gets a single admin user by ID.
  """
  def get_admin_user(id) do
    Repo.get(AdminUser, id)
    |> Repo.preload([:sessions])
  end

  @doc """
  Gets a single admin user by email.
  """
  def get_admin_user_by_email(email) do
    Repo.get_by(AdminUser, email: email)
  end

  @doc """
  Gets a single admin user by Logto user ID.
  """
  def get_admin_user_by_logto_id(logto_user_id) do
    Repo.get_by(AdminUser, logto_user_id: logto_user_id)
  end

  @doc """
  Creates or updates an admin user from Logto OAuth callback.
  This is called when an admin signs in via Logto.
  Searches by logto_user_id (the stable identifier from Logto's sub claim).
  """
  def authenticate_admin(attrs) do
    logto_user_id = attrs[:logto_user_id] || attrs["logto_user_id"]

    case get_admin_user_by_logto_id(logto_user_id) do
      nil ->
        # Create new admin user
        %AdminUser{}
        |> AdminUser.changeset(attrs)
        |> Repo.insert()

      admin_user ->
        # Update existing admin user with latest info from Logto
        admin_user
        |> AdminUser.changeset(Map.merge(attrs, %{last_login_at: DateTime.utc_now() |> DateTime.truncate(:second)}))
        |> Repo.update()
    end
  end

  ## Session Management

  @doc """
  Creates a new admin session.
  Returns {:ok, {session, token}} where token is the unhashed session token to store in cookie.
  """
  def create_admin_session(admin_user_id, session_attrs \\ %{}) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    token = generate_session_token()
    token_hash = hash_token(token)

    # Convert IP address string to INET struct
    ip_address = case session_attrs[:ip_address] do
      nil -> %Postgrex.INET{address: {0, 0, 0, 0}}
      ip_string when is_binary(ip_string) ->
        case :inet.parse_address(String.to_charlist(ip_string)) do
          {:ok, parsed_ip} -> %Postgrex.INET{address: parsed_ip}
          {:error, _} -> %Postgrex.INET{address: {0, 0, 0, 0}}
        end
      ip -> ip
    end

    result = %AdminSession{}
    |> Ecto.Changeset.change(%{
      admin_user_id: admin_user_id,
      session_token_hash: token_hash,
      ip_address: ip_address,
      user_agent: session_attrs[:user_agent],
      is_active: true,
      expires_at: DateTime.add(now, 8 * 3600, :second),
      last_activity_at: now
    })
    |> Repo.insert()

    case result do
      {:ok, session} -> {:ok, {session, token}}
      error -> error
    end
  end

  @doc """
  Gets an admin session by token.
  """
  def get_session_by_token(token) do
    token_hash = hash_token(token)

    Repo.get_by(AdminSession, session_token_hash: token_hash, is_active: true)
    |> case do
      nil -> nil
      session ->
        # Check if session is expired
        if DateTime.compare(session.expires_at, DateTime.utc_now()) == :gt do
          session
        else
          nil
        end
    end
  end

  @doc """
  Updates session last activity timestamp.
  """
  def update_session_activity(session) do
    session
    |> Ecto.Changeset.change(last_activity_at: DateTime.utc_now() |> DateTime.truncate(:second))
    |> Repo.update()
  end

  @doc """
  Expires an admin session.
  """
  def expire_admin_session(session_token) do
    case get_session_by_token(session_token) do
      nil -> {:error, :not_found}
      session ->
        session
        |> Ecto.Changeset.change(expires_at: DateTime.utc_now() |> DateTime.truncate(:second))
        |> Repo.update()
    end
  end

  @doc """
  Expires all sessions for an admin user.
  """
  def expire_all_sessions(admin_user_id) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    from(s in AdminSession,
      where: s.admin_user_id == ^admin_user_id,
      where: s.expires_at > ^now
    )
    |> Repo.update_all(set: [expires_at: now])
  end

  ## Permission Checking

  @doc """
  Checks if an admin user has a specific permission.
  Super admins bypass all permission checks.
  """
  def has_permission?(admin_user, permission_code) do
    admin_user = Repo.preload(admin_user, [:roles])

    # Super admins have all permissions
    if Enum.any?(admin_user.roles, & &1.is_super_admin) do
      true
    else
      # Check if any of the user's roles have this permission
      permission_codes = get_effective_permissions(admin_user)
      permission_code in permission_codes
    end
  end

  @doc """
  Gets all effective permissions for an admin user.
  Returns a list of permission codes.
  """
  def get_effective_permissions(admin_user) do
    admin_user = Repo.preload(admin_user, roles: :permissions)

    admin_user.roles
    |> Enum.flat_map(& &1.permissions)
    |> Enum.map(& &1.code)
    |> Enum.uniq()
  end

  ## Role Management

  @doc """
  Lists all available roles.
  """
  def list_roles do
    Repo.all(AdminRole)
    |> Repo.preload(:permissions)
  end

  @doc """
  Assigns a role to an admin user.
  """
  def assign_role(admin_user_id, role_id, assigned_by_admin_id, expires_at \\ nil) do
    %AdminUserRole{}
    |> AdminUserRole.changeset(%{
      admin_user_id: admin_user_id,
      role_id: role_id,
      assigned_by: assigned_by_admin_id,
      assigned_at: DateTime.utc_now(),
      expires_at: expires_at
    })
    |> Repo.insert()
  end

  @doc """
  Removes a role from an admin user.
  """
  def remove_role(admin_user_id, role_id) do
    from(aur in AdminUserRole,
      where: aur.admin_user_id == ^admin_user_id,
      where: aur.role_id == ^role_id
    )
    |> Repo.delete_all()
  end

  ## Private Functions

  defp generate_session_token do
    :crypto.strong_rand_bytes(32) |> Base.encode64()
  end

  defp hash_token(token) do
    :crypto.hash(:sha256, token) |> Base.encode16(case: :lower)
  end
end
