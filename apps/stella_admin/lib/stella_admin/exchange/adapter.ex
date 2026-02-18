defmodule StellaAdmin.Exchange.Adapter do
  @moduledoc """
  Schema for exchange.adapters table in the stella_platform_new database.
  Represents exchange adapters configuration for connecting to trading platforms.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "exchange"

  schema "adapters" do
    field :code, :string
    field :name, :string
    field :description, :string
    field :status, Ecto.Enum, values: [:active, :inactive, :maintenance, :deprecated]
    field :auth_model, Ecto.Enum, values: [:api_key_secret, :oauth2, :wallet_connect, :hybrid]
    field :base_url, :string
    field :ws_url, :string
    field :sandbox_base_url, :string
    field :sandbox_ws_url, :string
    field :supports_spot, :boolean, default: true
    field :supports_margin, :boolean, default: false
    field :supports_futures, :boolean, default: false
    field :supports_options, :boolean, default: false
    field :supports_staking, :boolean, default: false
    field :execution_capabilities, :map
    field :rate_limit_orders, :integer, default: 60
    field :rate_limit_queries, :integer, default: 120
    field :rate_limit_ws, :integer, default: 10
    field :min_order_size_usd, :decimal
    field :max_order_size_usd, :decimal
    field :supported_pairs, :map
    field :fee_schedule, :map
    field :available_tiers, {:array, Ecto.Enum}, values: [:stella_one, :stella_unum, :stella_eon, :stella_plenum]
    field :oauth_client_id, :string
    field :oauth_authorize_url, :string
    field :oauth_token_url, :string
    field :oauth_scopes, {:array, :string}
    field :activated_by, :binary_id
    field :activated_at, :utc_datetime
    field :deactivated_by, :binary_id
    field :deactivated_at, :utc_datetime
    field :maintenance_message, :string
    field :config, :map, default: %{}

    field :created_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  @doc false
  def changeset(adapter, attrs) do
    adapter
    |> cast(attrs, [
      :code,
      :name,
      :description,
      :status,
      :auth_model,
      :base_url,
      :ws_url,
      :sandbox_base_url,
      :sandbox_ws_url,
      :supports_spot,
      :supports_margin,
      :supports_futures,
      :supports_options,
      :supports_staking,
      :execution_capabilities,
      :rate_limit_orders,
      :rate_limit_queries,
      :rate_limit_ws,
      :min_order_size_usd,
      :max_order_size_usd,
      :supported_pairs,
      :fee_schedule,
      :available_tiers,
      :oauth_client_id,
      :oauth_authorize_url,
      :oauth_token_url,
      :oauth_scopes,
      :activated_by,
      :activated_at,
      :deactivated_by,
      :deactivated_at,
      :maintenance_message,
      :config
    ])
    |> validate_required([:code, :name, :status, :auth_model])
    |> unique_constraint(:code)
  end
end
