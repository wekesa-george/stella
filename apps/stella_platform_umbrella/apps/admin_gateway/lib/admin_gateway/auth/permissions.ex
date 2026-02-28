defmodule AdminGateway.Auth.Permissions do
  @moduledoc """
  Loads and caches admin permissions from the shared PostgreSQL database.
  Uses ETS for in-process caching with configurable TTL.

  Reads from the same `admin.*` tables as the NestJS API:
  - admin.admin_users
  - admin.admin_user_roles
  - admin.role_permissions
  - admin.permissions
  """

  use GenServer
  require Logger

  alias TradeEngine.Repo

  @table :admin_permissions_cache
  @default_ttl_ms :timer.minutes(5)

  # ── Client API ──

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Get admin user with permissions by Logto user ID.
  Returns {:ok, admin_info} or {:error, :not_found}.

  admin_info shape:
  %{
    id: uuid,
    email: string,
    display_name: string,
    is_super_admin: boolean,
    status: string,
    permissions: [string]
  }
  """
  def get_admin(logto_user_id) when is_binary(logto_user_id) do
    ttl_ms = Application.get_env(:admin_gateway, :permissions_cache_ttl_ms, @default_ttl_ms)

    case :ets.lookup(@table, logto_user_id) do
      [{^logto_user_id, admin_info, cached_at}] ->
        if System.monotonic_time(:millisecond) - cached_at < ttl_ms do
          {:ok, admin_info}
        else
          load_and_cache(logto_user_id)
        end

      [] ->
        load_and_cache(logto_user_id)
    end
  end

  @doc """
  Check if an admin has a specific permission.
  """
  def has_permission?(%{is_super_admin: true}, _permission_code), do: true

  def has_permission?(%{permissions: permissions}, permission_code) do
    permission_code in permissions
  end

  def has_permission?(_, _), do: false

  @doc """
  Check if an admin has ALL of the given permissions.
  """
  def has_all_permissions?(%{is_super_admin: true}, _), do: true

  def has_all_permissions?(%{permissions: permissions}, required) do
    Enum.all?(required, &(&1 in permissions))
  end

  @doc """
  Invalidate cache for a specific admin (call after role changes).
  """
  def invalidate(logto_user_id) do
    :ets.delete(@table, logto_user_id)
    :ok
  end

  @doc """
  Clear the entire permissions cache.
  """
  def clear_cache do
    :ets.delete_all_objects(@table)
    :ok
  end

  # ── Server Callbacks ──

  @impl true
  def init(_opts) do
    table = :ets.new(@table, [:named_table, :set, :public, read_concurrency: true])
    {:ok, %{table: table}}
  end

  # ── Private ──

  defp load_and_cache(logto_user_id) do
    case load_from_db(logto_user_id) do
      {:ok, admin_info} ->
        :ets.insert(@table, {logto_user_id, admin_info, System.monotonic_time(:millisecond)})
        {:ok, admin_info}

      {:error, _} = error ->
        :ets.delete(@table, logto_user_id)
        error
    end
  end

  defp load_from_db(logto_user_id) do
    # Step 1: Find the admin user
    admin_query = """
    SELECT id, email, display_name, is_super_admin, status
    FROM admin.admin_users
    WHERE logto_user_id = $1
    LIMIT 1
    """

    case Repo.query(admin_query, [logto_user_id]) do
      {:ok, %{rows: [[id, email, display_name, is_super_admin, status]]}} ->
        permissions = load_permissions(id, is_super_admin)

        {:ok,
         %{
           id: id,
           email: email,
           display_name: display_name,
           is_super_admin: is_super_admin,
           status: status,
           permissions: permissions
         }}

      {:ok, %{rows: []}} ->
        {:error, :not_found}

      {:error, reason} ->
        Logger.error("Failed to load admin for logto_user_id #{logto_user_id}: #{inspect(reason)}")
        {:error, :db_error}
    end
  end

  defp load_permissions(_admin_id, true = _is_super_admin) do
    # Super admin gets all permissions
    case Repo.query("SELECT code FROM admin.permissions") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [code] -> code end)
      _ -> []
    end
  end

  defp load_permissions(admin_id, false) do
    query = """
    SELECT DISTINCT p.code
    FROM admin.permissions p
    INNER JOIN admin.role_permissions rp ON rp.permission_id = p.id
    INNER JOIN admin.admin_user_roles aur ON aur.role_id = rp.role_id
    WHERE aur.admin_user_id = $1
      AND (aur.expires_at IS NULL OR aur.expires_at > NOW())
    """

    case Repo.query(query, [admin_id]) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [code] -> code end)
      {:error, _} -> []
    end
  end
end
