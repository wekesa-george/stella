defmodule SysAdmin.Exchanges.ExchangeConfig do
  @moduledoc """
  Stub schema for SysAdmin.Exchanges.ExchangeConfig.
  Maps to exchange.user_credentials in the real database.
  Module name kept for backward compatibility (other schemas reference it).

  Supports both user-owned and service-account-owned credentials.
  The config_overrides JSONB allows per-credential overrides of adapter defaults
  (base_url, ws_url, rate limits, etc.).
  """
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "exchange"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "user_credentials" do
    field :exchange_name, :string, source: :label
    field :status, :string
    field :auth_model, :string
    field :adapter_id, :binary_id
    field :is_sandbox, :boolean, default: false
    field :ip_whitelist, {:array, :string}
    field :permissions, {:array, :string}, default: ["read", "trade"]
    field :metadata, :map, default: %{}
    field :config_overrides, :map, default: %{}
    field :wallet_address, :string
    field :last_validated_at, :utc_datetime
    field :validation_error, :string
    field :connected_at, :utc_datetime
    field :last_used_at, :utc_datetime

    # Encrypted fields — write-only, never exposed through API
    field :encrypted_api_key, :binary
    field :encrypted_api_secret, :binary
    field :encrypted_passphrase, :binary

    belongs_to :user, SysAdmin.Accounts.User
    belongs_to :service_account, TradeEngine.Platform.ServiceAccount

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  @required_fields [:adapter_id, :auth_model]
  @optional_fields [
    :exchange_name, :status, :is_sandbox,
    :ip_whitelist, :permissions, :metadata, :config_overrides,
    :wallet_address, :user_id, :service_account_id,
    :encrypted_api_key, :encrypted_api_secret, :encrypted_passphrase,
    :last_validated_at, :validation_error, :connected_at, :last_used_at
  ]

  def changeset(cred, attrs) do
    cred
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_owner()
    |> validate_inclusion(:status, ~w(active pending_validation expired revoked failed_validation))
    |> validate_inclusion(:auth_model, ~w(api_key_secret oauth2 wallet_connect hybrid))
    |> foreign_key_constraint(:adapter_id)
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:service_account_id)
  end

  # Ensure at least one owner is set
  defp validate_owner(changeset) do
    user_id = get_field(changeset, :user_id)
    sa_id = get_field(changeset, :service_account_id)

    if is_nil(user_id) and is_nil(sa_id) do
      add_error(changeset, :user_id, "either user_id or service_account_id must be set")
    else
      changeset
    end
  end
end
