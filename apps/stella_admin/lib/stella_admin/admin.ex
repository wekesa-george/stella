defmodule StellaAdmin.Admin do
  @moduledoc """
  The Admin context handles admin user management and audit logging.
  """

  import Ecto.Query
  alias StellaAdmin.Repo
  alias StellaAdmin.Auth.AdminUser
  alias StellaAdmin.Admin.{AuditLog, Role, Permission, AdminUserRole}

  ## Admin User Management

  @doc """
  Returns the list of admin users with optional filters.

  ## Options

  - `:status` - Filter by status (e.g., :active, :invited, :suspended, :deactivated)
  - `:role` - Filter by role code
  - `:search` - Search by email, first_name, or last_name
  - `:limit` - Limit number of results (default: 50)
  - `:offset` - Offset for pagination (default: 0)
  """
  def list_admin_users(opts \\ []) do
    AdminUser
    |> apply_admin_user_filters(opts)
    |> limit(^Keyword.get(opts, :limit, 50))
    |> offset(^Keyword.get(opts, :offset, 0))
    |> order_by([a], desc: a.created_at)
    |> Repo.all()
  end

  @doc """
  Gets a single admin user by ID.
  """
  def get_admin_user!(id), do: Repo.get!(AdminUser, id)

  @doc """
  Gets a single admin user by email.
  """
  def get_admin_user_by_email(email) do
    Repo.get_by(AdminUser, email: email)
  end

  @doc """
  Creates an admin user.
  """
  def create_admin_user(attrs \\ %{}) do
    %AdminUser{}
    |> AdminUser.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates an admin user.
  """
  def update_admin_user(%AdminUser{} = admin_user, attrs) do
    admin_user
    |> AdminUser.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deactivates an admin user.
  """
  def deactivate_admin_user(%AdminUser{} = admin_user, deactivated_by_id, reason) do
    admin_user
    |> AdminUser.changeset(%{
      status: :deactivated,
      deactivated_at: DateTime.utc_now(),
      deactivated_by: deactivated_by_id,
      deactivation_reason: reason
    })
    |> Repo.update()
  end

  @doc """
  Counts total admin users with optional filters.
  """
  def count_admin_users(opts \\ []) do
    AdminUser
    |> apply_admin_user_filters(opts)
    |> Repo.aggregate(:count, :id)
  end

  defp apply_admin_user_filters(query, opts) do
    Enum.reduce(opts, query, fn
      {:status, status}, query when not is_nil(status) ->
        where(query, [a], a.status == ^status)

      {:search, search}, query when not is_nil(search) and search != "" ->
        search_term = "%#{search}%"

        where(
          query,
          [a],
          ilike(a.email, ^search_term) or
            ilike(a.first_name, ^search_term) or
            ilike(a.last_name, ^search_term)
        )

      {:role, role_code}, query when not is_nil(role_code) ->
        query
        |> join(:inner, [a], aur in AdminUserRole, on: aur.admin_user_id == a.id)
        |> join(:inner, [a, aur], r in Role, on: r.id == aur.role_id)
        |> where([a, aur, r], r.code == ^role_code)

      _other, query ->
        query
    end)
  end

  ## Admin User Invitation with Logto Integration

  @doc """
  Invites a new admin user with transactional Logto and PostgreSQL creation.
  This function:
  1. Creates user in Logto
  2. Creates user in PostgreSQL with logto_user_id
  3. Rolls back Logto user if PostgreSQL fails

  Returns {:ok, admin_user} or {:error, reason}
  """
  def invite_admin_user(attrs, invited_by_id) do
    # Step 1: Get Logto Management API token
    with {:ok, access_token} <- StellaAdmin.LogtoManagement.get_m2m_token(),
         # Step 2: Create user in Logto
         {:ok, logto_user_id} <-
           StellaAdmin.LogtoManagement.create_user(access_token, attrs),
         # Step 3: Create user in PostgreSQL with transaction
         {:ok, admin_user} <- create_admin_in_db(logto_user_id, attrs, invited_by_id) do
      {:ok, admin_user}
    else
      {:error, :db_failed, logto_user_id, access_token, reason} ->
        # Rollback: Delete user from Logto
        StellaAdmin.LogtoManagement.delete_user(access_token, logto_user_id)
        {:error, "Database creation failed: #{reason}. Logto user has been rolled back."}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp create_admin_in_db(logto_user_id, attrs, invited_by_id) do
    # Get access token for potential rollback
    {:ok, access_token} = StellaAdmin.LogtoManagement.get_m2m_token()

    admin_attrs = %{
      logto_user_id: logto_user_id,
      email: attrs.email,
      phone: attrs[:phone],
      first_name: attrs.first_name,
      last_name: attrs.last_name,
      display_name: attrs[:display_name],
      status: :invited,
      invited_by: invited_by_id,
      invited_at: DateTime.utc_now(),
      is_super_admin: attrs[:is_super_admin] || false
    }

    case create_admin_user(admin_attrs) do
      {:ok, admin_user} ->
        {:ok, admin_user}

      {:error, changeset} ->
        # Return error with rollback info
        {:error, :db_failed, logto_user_id, access_token,
         inspect(changeset.errors)}
    end
  end

  ## Audit Logging

  @doc """
  Logs an admin action to the audit log.
  This function should be called for every write operation in the system.
  """
  def log_action(
        admin_id,
        action,
        resource_type,
        resource_id,
        old_value,
        new_value,
        reason,
        permission_used
      ) do
    admin = Repo.get!(AdminUser, admin_id)

    %AuditLog{}
    |> AuditLog.changeset(%{
      admin_user_id: admin_id,
      admin_email: admin.email,
      admin_name: "#{admin.first_name} #{admin.last_name}",
      action: action,
      resource_type: resource_type,
      resource_id: resource_id,
      old_value: old_value,
      new_value: new_value,
      reason: reason,
      permission_used: permission_used,
      correlation_id: Ecto.UUID.generate()
    })
    |> Repo.insert!()
  end

  ## Role Management

  @doc """
  Returns all roles.
  """
  def list_roles do
    Repo.all(from r in Role, where: r.is_active == true, order_by: r.hierarchy_level)
  end

  @doc """
  Assigns a role to an admin user.
  """
  def assign_role(admin_user_id, role_id, assigned_by_id) do
    %AdminUserRole{}
    |> AdminUserRole.changeset(%{
      admin_user_id: admin_user_id,
      role_id: role_id,
      assigned_by: assigned_by_id,
      assigned_at: DateTime.utc_now()
    })
    |> Repo.insert()
  end

  @doc """
  Removes a role from an admin user.
  """
  def remove_role(admin_user_id, role_id) do
    from(aur in AdminUserRole,
      where: aur.admin_user_id == ^admin_user_id and aur.role_id == ^role_id
    )
    |> Repo.delete_all()
  end

  @doc """
  Gets all roles for an admin user.
  """
  def get_admin_user_roles(admin_user_id) do
    from(r in Role,
      join: aur in AdminUserRole,
      on: aur.role_id == r.id,
      where: aur.admin_user_id == ^admin_user_id,
      select: r
    )
    |> Repo.all()
  end
end
