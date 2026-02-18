defmodule StellaAdmin.Kyc do
  @moduledoc """
  The KYC context for managing KYC verification records.
  """

  import Ecto.Query, warn: false
  alias StellaAdmin.Repo
  alias StellaAdmin.Auth.KycRecord
  alias StellaAdmin.Users
  alias StellaAdmin.Admin

  @doc """
  Returns the list of pending KYC submissions.

  ## Options
    * `:page` - Page number (default: 1)
    * `:page_size` - Items per page (default: 20)
    * `:status` - Filter by status (default: :pending or :in_review)

  ## Examples

      iex> list_pending_kyc_submissions()
      {[%KycRecord{}, ...], %{total_count: 50, page: 1, page_size: 20, total_pages: 3}}
  """
  def list_pending_kyc_submissions(opts \\ %{}) do
    page = Map.get(opts, :page, 1)
    page_size = Map.get(opts, :page_size, 20)
    offset = (page - 1) * page_size

    query =
      from k in KycRecord,
        where: k.status in [:pending, :in_review],
        order_by: [asc: k.submitted_at],
        preload: []

    # Get total count
    total_count = Repo.aggregate(query, :count, :id)
    total_pages = ceil(total_count / page_size)

    # Get paginated results
    kyc_records =
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

    {kyc_records, pagination}
  end

  @doc """
  Gets a single KYC record.

  Raises `Ecto.NoResultsError` if the KYC record does not exist.

  ## Examples

      iex> get_kyc_record!(123)
      %KycRecord{}

      iex> get_kyc_record!(456)
      ** (Ecto.NoResultsError)
  """
  def get_kyc_record!(id), do: Repo.get!(KycRecord, id)

  @doc """
  Gets a KYC record by ID with user information.

  Returns `nil` if the KYC record does not exist.

  ## Examples

      iex> get_kyc_detail("123e4567-e89b-12d3-a456-426614174000")
      %{kyc_record: %KycRecord{}, user: %User{}}

      iex> get_kyc_detail("nonexistent")
      nil
  """
  def get_kyc_detail(id) do
    kyc_record = Repo.get(KycRecord, id)

    if kyc_record do
      user = Users.get_user_detail(kyc_record.user_id)
      %{kyc_record: kyc_record, user: user}
    else
      nil
    end
  end

  @doc """
  Approves a KYC submission.

  ## Examples

      iex> approve_kyc(kyc_record, admin_user_id, "Verified documents")
      {:ok, %KycRecord{}}

      iex> approve_kyc(kyc_record, admin_user_id, notes)
      {:error, %Ecto.Changeset{}}
  """
  def approve_kyc(kyc_record, admin_user_id, notes \\ nil) do
    changeset =
      kyc_record
      |> KycRecord.changeset(%{
        status: :approved,
        reviewed_at: DateTime.utc_now(),
        reviewed_by: admin_user_id,
        notes: notes
      })

    result = Repo.update(changeset)

    case result do
      {:ok, updated_kyc} ->
        # Log audit trail
        Admin.log_action(
          admin_user_id,
          "kyc.approve",
          "kyc_record",
          kyc_record.id,
          "approved",
          %{
            user_id: kyc_record.user_id,
            level: kyc_record.level,
            notes: notes
          },
          nil,
          %{
            old_status: kyc_record.status,
            new_status: :approved
          }
        )

        # Maybe upgrade user tier based on KYC level
        maybe_upgrade_tier(kyc_record.user_id, kyc_record.level)

        {:ok, updated_kyc}

      error ->
        error
    end
  end

  @doc """
  Rejects a KYC submission.

  ## Examples

      iex> reject_kyc(kyc_record, admin_user_id, "Invalid document")
      {:ok, %KycRecord{}}

      iex> reject_kyc(kyc_record, admin_user_id, reason)
      {:error, %Ecto.Changeset{}}
  """
  def reject_kyc(kyc_record, admin_user_id, rejection_reason) do
    changeset =
      kyc_record
      |> KycRecord.changeset(%{
        status: :rejected,
        reviewed_at: DateTime.utc_now(),
        reviewed_by: admin_user_id,
        rejection_reason: rejection_reason
      })

    result = Repo.update(changeset)

    case result do
      {:ok, updated_kyc} ->
        # Log audit trail
        Admin.log_action(
          admin_user_id,
          "kyc.reject",
          "kyc_record",
          kyc_record.id,
          "rejected",
          %{
            user_id: kyc_record.user_id,
            level: kyc_record.level,
            rejection_reason: rejection_reason
          },
          nil,
          %{
            old_status: kyc_record.status,
            new_status: :rejected
          }
        )

        {:ok, updated_kyc}

      error ->
        error
    end
  end

  @doc """
  Maybe upgrades user tier based on KYC level.

  - basic KYC → stella_one (if currently lower)
  - standard KYC → stella_unum (if currently lower)
  - enhanced KYC → stella_eon (if currently lower)

  ## Examples

      iex> maybe_upgrade_tier(user_id, :enhanced)
      {:ok, %User{}} | {:ok, :no_upgrade_needed}
  """
  def maybe_upgrade_tier(user_id, kyc_level) do
    user = Users.get_user_detail(user_id)

    if user do
      new_tier = determine_tier_from_kyc_level(kyc_level)
      current_tier_rank = tier_rank(user.tier)
      new_tier_rank = tier_rank(new_tier)

      if new_tier_rank > current_tier_rank do
        # Use a system admin ID for automatic tier upgrades
        system_admin_id = get_system_admin_id()

        Users.change_user_tier(
          user,
          new_tier,
          system_admin_id,
          "Automatic upgrade based on KYC level: #{kyc_level}"
        )
      else
        {:ok, :no_upgrade_needed}
      end
    else
      {:error, :user_not_found}
    end
  end

  defp determine_tier_from_kyc_level(:basic), do: :stella_one
  defp determine_tier_from_kyc_level(:standard), do: :stella_unum
  defp determine_tier_from_kyc_level(:enhanced), do: :stella_eon
  defp determine_tier_from_kyc_level(_), do: :stella_one

  defp tier_rank(:stella_one), do: 1
  defp tier_rank(:stella_unum), do: 2
  defp tier_rank(:stella_eon), do: 3
  defp tier_rank(:stella_plenum), do: 4
  defp tier_rank(_), do: 0

  defp get_system_admin_id do
    # TODO: Get actual system admin ID
    # For now, return nil which will need to be handled
    nil
  end

  @doc """
  Returns statistics about KYC records.

  ## Examples

      iex> get_kyc_stats()
      %{
        pending: 15,
        in_review: 5,
        approved_today: 8,
        rejected_today: 2
      }
  """
  def get_kyc_stats do
    pending_count =
      KycRecord
      |> where([k], k.status == :pending)
      |> Repo.aggregate(:count, :id)

    in_review_count =
      KycRecord
      |> where([k], k.status == :in_review)
      |> Repo.aggregate(:count, :id)

    today = DateTime.utc_now() |> DateTime.to_date()

    approved_today =
      KycRecord
      |> where([k], k.status == :approved)
      |> where([k], fragment("DATE(?)", k.reviewed_at) == ^today)
      |> Repo.aggregate(:count, :id)

    rejected_today =
      KycRecord
      |> where([k], k.status == :rejected)
      |> where([k], fragment("DATE(?)", k.reviewed_at) == ^today)
      |> Repo.aggregate(:count, :id)

    %{
      pending: pending_count,
      in_review: in_review_count,
      approved_today: approved_today,
      rejected_today: rejected_today
    }
  end
end
