defmodule SysAdmin.Strategies.UserStrategy do
  @moduledoc """
  Stub schema for SysAdmin.Strategies.UserStrategy.
  Maps to trading.user_strategies in the real database.
  """
  use Ecto.Schema

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "user_strategies" do
    field :parameters, :map, default: %{}
    field :is_active, :boolean, default: false
    field :allocated_capital, :decimal
    field :credential_id, :binary_id
    field :selected_pairs, {:array, :string}
    field :validation_status, :string

    belongs_to :user, SysAdmin.Accounts.User
    belongs_to :strategy, SysAdmin.Strategies.Strategy
    belongs_to :credential, SysAdmin.Exchanges.ExchangeConfig, foreign_key: :credential_id, define_field: false

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end
end
