defmodule TradeEngine.Exchanges.PriceCache do
  @moduledoc """
  Unified multi-exchange price cache using composite keys `{exchange, pair}`.

  This is the new canonical price store. Binance's CacheManager continues
  to write to `:binance_price_cache` for backward compatibility, while this
  module provides the exchange-qualified lookup layer on top.

  ## ETS Key Format

      {:price_cache, {"binance", "BTCUSDT"}} => {price, timestamp_ms}
  """

  use GenServer
  require Logger

  @ets_table :price_cache

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    Logger.info("💱 PriceCache started — multi-exchange composite key store")
    {:ok, %{}}
  end

  @doc "Store a price with composite key"
  def put(exchange, pair, price) do
    ts = System.system_time(:millisecond)
    :ets.insert(@ets_table, {{exchange, pair}, price, ts})
    :ok
  end

  @doc "Get price by composite key"
  def get(exchange, pair) do
    case :ets.lookup(@ets_table, {exchange, pair}) do
      [{{^exchange, ^pair}, price, _ts}] -> {:ok, price}
      [] -> {:error, :not_found}
    end
  rescue
    ArgumentError -> {:error, :not_started}
  end

  @doc "Get all prices as a map of {exchange, pair} => price"
  def all do
    :ets.tab2list(@ets_table)
    |> Map.new(fn {{exchange, pair}, price, _ts} -> {{exchange, pair}, price} end)
  rescue
    _ -> %{}
  end

  @doc "Get all prices for a specific exchange"
  def for_exchange(exchange) do
    :ets.tab2list(@ets_table)
    |> Enum.filter(fn {{ex, _pair}, _price, _ts} -> ex == exchange end)
    |> Map.new(fn {{_ex, pair}, price, _ts} -> {pair, price} end)
  rescue
    _ -> %{}
  end
end
