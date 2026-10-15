defmodule StellaAdmin.Users do
  @moduledoc """
  The Users context for managing platform users.
  """

  import Ecto.Query, warn: false
  alias StellaAdmin.Repo
  alias StellaAdmin.Auth.User
  alias StellaAdmin.Admin

  @doc """
  Returns the list of users with optional filters and pagination.

  ## Options
    * `:page` - Page number (default: 1)
    * `:page_size` - Items per page (default: 20)
    * `:email` - Filter by email (partial match)
    * `:status` - Filter by status
    * `:tier` - Filter by tier
    * `:email_verified` - Filter by email verification status
    * `:phone_verified` - Filter by phone verification status
    * `:created_after` - Filter by created_at >= date
    * `:created_before` - Filter by created_at <= date

  ## Examples

      iex> list_users(%{page: 1, page_size: 20})
      {[%User{}, ...], %{total_count: 100, page: 1, page_size: 20, total_pages: 5}}

      iex> list_users(%{status: :active, tier: :stella_unum})
      {[%User{}, ...], %{total_count: 50, page: 1, page_size: 20, total_pages: 3}}
  """
  def list_users(filters \\ %{}) do
    page = Map.get(filters, :page, 1)
    page_size = Map.get(filters, :page_size, 20)
    offset = (page - 1) * page_size

    query =
      User
      |> apply_user_filters(filters)
      |> order_by([u], desc: u.created_at)

    # Get total count for pagination
    total_count = Repo.aggregate(query, :count, :id)
    total_pages = ceil(total_count / page_size)

    # Get paginated results
    users =
      query
      |> limit(^page_size)
      |> offset(^offset)
      |> Repo.all()

    pagination = %{
      total_count: total_count,
      page: page,
      page_size: page_size,
      total_pages: total_pages
    }

    {users, pagination}
  end

  defp apply_user_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:email, email}, query when is_binary(email) and email != "" ->
        email_pattern = "%#{email}%"
        where(query, [u], ilike(u.email, ^email_pattern))

      {:status, status}, query when not is_nil(status) ->
        where(query, [u], u.status == ^status)

      {:tier, tier}, query when not is_nil(tier) ->
        where(query, [u], u.tier == ^tier)

      {:email_verified, verified}, query when is_boolean(verified) ->
        where(query, [u], u.email_verified == ^verified)

      {:phone_verified, verified}, query when is_boolean(verified) ->
        where(query, [u], u.phone_verified == ^verified)

      {:created_after, date}, query when not is_nil(date) ->
        where(query, [u], u.created_at >= ^date)

      {:created_before, date}, query when not is_nil(date) ->
        where(query, [u], u.created_at <= ^date)

      _other, query ->
        query
    end)
  end

  @doc """
  Gets a single user.

  Raises `Ecto.NoResultsError` if the User does not exist.

  ## Examples

      iex> get_user!(123)
      %User{}

      iex> get_user!(456)
      ** (Ecto.NoResultsError)
  """
  def get_user!(id), do: Repo.get!(User, id)

  @doc """
  Gets a user by ID with detailed information for the detail page.

  Returns `nil` if the user does not exist.

  ## Examples

      iex> get_user_detail("123e4567-e89b-12d3-a456-426614174000")
      %User{}

      iex> get_user_detail("nonexistent")
      nil
  """
  def get_user_detail(id) do
    Repo.get(User, id)
  end

  @doc """
  Updates a user's status.

  ## Examples

      iex> update_user_status(user, :suspended, admin_user_id, "Suspicious activity")
      {:ok, %User{}}

      iex> update_user_status(user, :invalid_status, admin_user_id, "reason")
      {:error, %Ecto.Changeset{}}
  """
  def update_user_status(user, new_status, admin_user_id, reason) do
    changeset = User.changeset(user, %{status: new_status})

    result = Repo.update(changeset)

    case result do
      {:ok, updated_user} ->
        # Log audit trail
        Admin.log_action(
          admin_user_id,
          "users.update_status",
          "user",
          user.id,
          "updated",
          %{
            old_status: user.status,
            new_status: new_status,
            reason: reason
          },
          nil,
          %{
            old_status: user.status,
            new_status: new_status
          }
        )

        {:ok, updated_user}

      error ->
        error
    end
  end

  @doc """
  Changes a user's tier.

  ## Examples

      iex> change_user_tier(user, :stella_eon, admin_user_id, "Manual upgrade")
      {:ok, %User{}}

      iex> change_user_tier(user, :invalid_tier, admin_user_id, "reason")
      {:error, %Ecto.Changeset{}}
  """
  def change_user_tier(user, new_tier, admin_user_id, reason) do
    changeset = User.changeset(user, %{tier: new_tier})

    result = Repo.update(changeset)

    case result do
      {:ok, updated_user} ->
        # Log audit trail
        Admin.log_action(
          admin_user_id,
          "users.change_tier",
          "user",
          user.id,
          "updated",
          %{
            old_tier: user.tier,
            new_tier: new_tier,
            reason: reason
          },
          nil,
          %{
            old_tier: user.tier,
            new_tier: new_tier
          }
        )

        # TODO: Create tier history record when tier_history table is available
        # create_tier_history_record(user.id, user.tier, new_tier, admin_user_id, reason)

        {:ok, updated_user}

      error ->
        error
    end
  end

  @doc """
  Suspends a user account.

  This will:
  - Set status to :suspended
  - Log the suspension in audit trail
  - TODO: Stop all active bots
  - TODO: Close open positions (if configured)

  ## Examples

      iex> suspend_user(user, admin_user_id, "Violation of terms")
      {:ok, %User{}}
  """
  def suspend_user(user, admin_user_id, reason) do
    update_user_status(user, :suspended, admin_user_id, reason)

    # TODO: Stop all active bots for this user
    # TODO: Close open positions if configured
    # TODO: Send suspension notification email
  end

  @doc """
  Exports all user data for GDPR compliance.

  Returns a map containing all user data that can be serialized to JSON.

  ## Examples

      iex> export_user_data("user-id")
      {:ok, %{user: %{...}, trades: [...], bots: [...]}}
  """
  def export_user_data(user_id) do
    user = get_user_detail(user_id)

    if user do
      data = %{
        user: %{
          id: user.id,
          email: user.email,
          phone: user.phone,
          username: user.username,
          status: user.status,
          tier: user.tier,
          email_verified: user.email_verified,
          phone_verified: user.phone_verified,
          referral_code: user.referral_code,
          metadata: user.metadata,
          created_at: user.created_at,
          updated_at: user.updated_at
        }
        # TODO: Add trades data when trading context is available
        # trades: list_user_trades(user_id),
        # TODO: Add bots data when bots context is available
        # bots: list_user_bots(user_id),
        # TODO: Add KYC records when KYC context is available
        # kyc_records: list_user_kyc_records(user_id),
        # TODO: Add exchange connections when exchange context is available
        # exchanges: list_user_exchanges(user_id),
      }

      {:ok, data}
    else
      {:error, :not_found}
    end
  end

  @doc """
  Calculates the current equity for a user.

  This includes:
  - Cash balance
  - Value of open positions
  - Value of active bot positions

  ## Examples

      iex> calculate_user_equity("user-id")
      {:ok, %{total_equity: 45230.50, cash: 10000, positions_value: 35230.50}}
  """
  def calculate_user_equity(_user_id) do
    # TODO: Implement when trading accounts context is available
    # For now, return placeholder
    {:ok, %{
      total_equity: 0.0,
      cash: 0.0,
      positions_value: 0.0
    }}
  end

  @doc """
  Calculates the profit and loss for a user.

  ## Examples

      iex> calculate_user_pnl("user-id")
      {:ok, %{total_pnl: 12450.00, realized_pnl: 10000.00, unrealized_pnl: 2450.00}}
  """
  def calculate_user_pnl(_user_id) do
    # TODO: Implement when trading transactions context is available
    # For now, return placeholder
    {:ok, %{
      total_pnl: 0.0,
      realized_pnl: 0.0,
      unrealized_pnl: 0.0
    }}
  end

  @doc """
  Returns statistics about users.

  ## Examples

      iex> get_user_stats()
      %{
        total_users: 12543,
        active_users: 8234,
        verified_users: 9876,
        suspended_users: 45,
        new_this_week: 234
      }
  """
  def get_user_stats do
    total_users = Repo.aggregate(User, :count, :id)

    active_users =
      User
      |> where([u], u.status == :active)
      |> Repo.aggregate(:count, :id)

    verified_users =
      User
      |> where([u], u.email_verified == true)
      |> Repo.aggregate(:count, :id)

    suspended_users =
      User
      |> where([u], u.status == :suspended)
      |> Repo.aggregate(:count, :id)

    one_week_ago = DateTime.utc_now() |> DateTime.add(-7, :day)

    new_this_week =
      User
      |> where([u], u.created_at >= ^one_week_ago)
      |> Repo.aggregate(:count, :id)

    %{
      total_users: total_users,
      active_users: active_users,
      verified_users: verified_users,
      suspended_users: suspended_users,
      new_this_week: new_this_week
    }
  end
end
