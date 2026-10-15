defmodule TradeEngine.MarketData.Candle do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "candles" do
    field :exchange, :string
    field :symbol, :string
    field :timeframe, :string
    field :timestamp, :utc_datetime
    field :open, :decimal
    field :high, :decimal
    field :low, :decimal
    field :close, :decimal
    field :volume, :decimal
    
    # New Field: The volume that was initiated by BUYERS
    field :taker_buy_volume, :decimal

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(candle, attrs) do
    candle
    |> cast(attrs, [:exchange, :symbol, :timeframe, :timestamp, :open, :high, :low, :close, :volume, :taker_buy_volume])
    |> validate_required([:exchange, :symbol, :timestamp, :close])
    |> unique_constraint([:exchange, :symbol, :timeframe, :timestamp])
  end
end