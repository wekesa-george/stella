defmodule TradeEngine.MarketData.OhlcvCandle do
  @moduledoc """
  Ecto schemas for market_data.ohlcv_* TimescaleDB hypertables.

  Three timeframes share the same column structure:
  - `ohlcv_1m` — 1-minute candles
  - `ohlcv_1h` — 1-hour candles
  - `ohlcv_1d` — 1-day candles

  Composite PK: (time, exchange_code, trading_pair)
  """

  defmodule Fields do
    @moduledoc false

    defmacro ohlcv_fields do
      quote do
        field :time, :utc_datetime, primary_key: true
        field :exchange_code, :string, primary_key: true
        field :trading_pair, :string, primary_key: true
        field :open, :decimal
        field :high, :decimal
        field :low, :decimal
        field :close, :decimal
        field :volume, :decimal
        field :quote_volume, :decimal
        field :trade_count, :integer, default: 0
        field :is_complete, :boolean, default: true
      end
    end

    def cast_fields do
      [:time, :exchange_code, :trading_pair, :open, :high, :low, :close,
       :volume, :quote_volume, :trade_count, :is_complete]
    end

    def required_fields do
      [:time, :exchange_code, :trading_pair, :open, :high, :low, :close]
    end
  end
end

defmodule TradeEngine.MarketData.OhlcvCandle1m do
  use Ecto.Schema
  import Ecto.Changeset
  require TradeEngine.MarketData.OhlcvCandle.Fields
  alias TradeEngine.MarketData.OhlcvCandle.Fields

  @schema_prefix "market_data"
  @primary_key false

  schema "ohlcv_1m" do
    Fields.ohlcv_fields()
  end

  def changeset(candle \\ %__MODULE__{}, attrs) do
    candle
    |> cast(attrs, Fields.cast_fields())
    |> validate_required(Fields.required_fields())
  end
end

defmodule TradeEngine.MarketData.OhlcvCandle1h do
  use Ecto.Schema
  import Ecto.Changeset
  require TradeEngine.MarketData.OhlcvCandle.Fields
  alias TradeEngine.MarketData.OhlcvCandle.Fields

  @schema_prefix "market_data"
  @primary_key false

  schema "ohlcv_1h" do
    Fields.ohlcv_fields()
  end

  def changeset(candle \\ %__MODULE__{}, attrs) do
    candle
    |> cast(attrs, Fields.cast_fields())
    |> validate_required(Fields.required_fields())
  end
end

defmodule TradeEngine.MarketData.OhlcvCandle1d do
  use Ecto.Schema
  import Ecto.Changeset
  require TradeEngine.MarketData.OhlcvCandle.Fields
  alias TradeEngine.MarketData.OhlcvCandle.Fields

  @schema_prefix "market_data"
  @primary_key false

  schema "ohlcv_1d" do
    Fields.ohlcv_fields()
  end

  def changeset(candle \\ %__MODULE__{}, attrs) do
    candle
    |> cast(attrs, Fields.cast_fields())
    |> validate_required(Fields.required_fields())
  end
end
