defmodule SysAdmin.Exchanges.PlatformExchange do
  @moduledoc "Ecto schema for exchange.platform_exchanges (admin-configured exchanges)"

  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @schema_prefix "exchange"
  schema "platform_exchanges" do
    field :exchange_key, :string
    field :name, :string
    field :status, :string, default: "inactive"
    field :environment, :string, default: "production"
    field :is_active, :boolean, default: false
    field :rate_limit_per_second, :integer
    field :max_open_orders, :integer
    field :logo_filename, :string
    field :color, :string
    field :trading_pairs_count, :integer
    field :avg_latency_ms, :decimal

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end
end
