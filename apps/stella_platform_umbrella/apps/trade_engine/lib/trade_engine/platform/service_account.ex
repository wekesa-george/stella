defmodule TradeEngine.Platform.ServiceAccount do
  @moduledoc """
  Service account for admin-managed bots.
  Allows bots to be owned by a system entity instead of a real client user.
  Maps to platform.service_accounts in the database.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "platform"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @valid_account_types ~w(system demo admin_managed)

  schema "service_accounts" do
    field :name, :string
    field :account_type, :string, default: "system"
    field :description, :string
    field :is_active, :boolean, default: true
    field :created_by, :binary_id
    field :metadata, :map, default: %{}

    has_many :bots, TradeEngine.Bots.Bot, foreign_key: :service_account_id

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(service_account, attrs) do
    service_account
    |> cast(attrs, [:name, :account_type, :description, :is_active, :created_by, :metadata])
    |> validate_required([:name, :account_type])
    |> validate_inclusion(:account_type, @valid_account_types)
    |> validate_length(:name, min: 1, max: 200)
    |> unique_constraint(:name, name: :unique_service_account_name)
  end
end
