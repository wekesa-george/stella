defmodule TradeEngine.MarketData.TickerMetadata do
  @moduledoc """
  Ecto schema for market_data.ticker_metadata table.
  Tracks exchange trading pair metadata for OHLCV caching.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "market_data"
  @primary_key {:id, :binary_id, autogenerate: true}

  schema "ticker_metadata" do
    field :exchange_code, :string
    field :trading_pair, :string
    field :base_asset, :string
    field :quote_asset, :string
    field :price_precision, :integer, default: 8
    field :quantity_precision, :integer, default: 8
    field :min_quantity, :decimal
    field :max_quantity, :decimal
    field :min_notional_usd, :decimal
    field :tick_size, :decimal
    field :is_active, :boolean, default: true
    field :is_cached, :boolean, default: false
    field :cache_since, :utc_datetime
    field :last_candle_at, :utc_datetime
    field :metadata, :map, default: %{}

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  @cast_fields [
    :exchange_code, :trading_pair, :base_asset, :quote_asset,
    :price_precision, :quantity_precision, :min_quantity, :max_quantity,
    :min_notional_usd, :tick_size, :is_active, :is_cached,
    :cache_since, :last_candle_at, :metadata
  ]

  def changeset(meta \\ %__MODULE__{}, attrs) do
    meta
    |> cast(attrs, @cast_fields)
    |> validate_required([:exchange_code, :trading_pair, :base_asset, :quote_asset])
    |> unique_constraint([:exchange_code, :trading_pair], name: :uq_ticker_exchange_pair)
  end
end
