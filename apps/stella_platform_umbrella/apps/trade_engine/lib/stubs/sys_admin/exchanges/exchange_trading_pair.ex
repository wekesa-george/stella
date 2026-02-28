defmodule SysAdmin.Exchanges.ExchangeTradingPair do
  @moduledoc "Ecto schema for exchange.exchange_trading_pairs"

  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @schema_prefix "exchange"
  schema "exchange_trading_pairs" do
    field :exchange_id, :binary_id
    field :adapter_id, :binary_id
    field :symbol, :string
    field :base_currency, :string
    field :quote_currency, :string
    field :is_active, :boolean, default: true
    field :delisted, :boolean, default: false
    field :last_seen_at, :utc_datetime
    field :exchange_status, :string
    field :market_type, :string

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end
end
