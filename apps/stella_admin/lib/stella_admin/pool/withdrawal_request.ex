defmodule StellaAdmin.Pool.WithdrawalRequest do
  @moduledoc """
  Schema for pool.withdrawal_requests table in the stella_platform_new database.
  Represents withdrawal requests from users for their pool allocations.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "pool"

  schema "withdrawal_requests" do
    field :allocation_id, :binary_id
    field :user_id, :binary_id
    field :pool_wallet_id, :binary_id
    field :amount_usd, :decimal
    field :available_profit_usd, :decimal
    field :currency, :string
    field :wallet_address, :string
    field :network, :string
    field :withdrawal_method, :string
    field :status, :string
    field :requested_at, :utc_datetime
    field :approved_at, :utc_datetime
    field :rejected_at, :utc_datetime
    field :processed_at, :utc_datetime
    field :approved_by_admin_id, :binary_id
    field :admin_notes, :string
    field :rejection_reason, :string
    field :transaction_hash, :string
    field :gas_fee_usd, :decimal
    field :network_fee_usd, :decimal
    field :net_amount_usd, :decimal
    field :processing_time_minutes, :integer
    field :metadata, :map, default: %{}

    field :created_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  @doc false
  def changeset(withdrawal_request, attrs) do
    withdrawal_request
    |> cast(attrs, [
      :allocation_id,
      :user_id,
      :pool_wallet_id,
      :amount_usd,
      :available_profit_usd,
      :currency,
      :wallet_address,
      :network,
      :withdrawal_method,
      :status,
      :requested_at,
      :approved_at,
      :rejected_at,
      :processed_at,
      :approved_by_admin_id,
      :admin_notes,
      :rejection_reason,
      :transaction_hash,
      :gas_fee_usd,
      :network_fee_usd,
      :net_amount_usd,
      :processing_time_minutes,
      :metadata
    ])
    |> validate_required([
      :allocation_id,
      :user_id,
      :pool_wallet_id,
      :amount_usd,
      :available_profit_usd,
      :currency,
      :wallet_address,
      :withdrawal_method,
      :status
    ])
  end
end
