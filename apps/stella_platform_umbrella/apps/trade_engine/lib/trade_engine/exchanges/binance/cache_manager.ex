defmodule TradeEngine.Exchanges.Binance.CacheManager do
  @moduledoc """
  ETS-based cache for Binance market data.
  """

  use GenServer
  require Logger

  @ticker_table :binance_ticker_cache
  @price_table :binance_price_cache
  @candle_table :binance_candle_cache
  @orderbook_table :binance_orderbook_cache

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_) do
    # Create ETS tables
    create_table(@ticker_table)
    create_table(@price_table)
    create_table(@candle_table)
    create_table(@orderbook_table)
    
    Logger.info("📦 CacheManager started - ETS tables initialized")
    {:ok, %{}}
  end

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def get_price(symbol) do
    case :ets.lookup(@price_table, symbol) do
      [{^symbol, price}] -> {:ok, price}
      [] -> {:error, :not_found}
    end
  end

  def get_ticker(symbol) do
    case :ets.lookup(@ticker_table, symbol) do
      [{^symbol, ticker}] -> {:ok, ticker}
      [] -> {:error, :not_found}
    end
  end

  def all_prices do
    :ets.tab2list(@price_table) |> Map.new()
  end

  def all_tickers do
    :ets.tab2list(@ticker_table) |> Map.new()
  end

  def put_ticker(symbol, ticker) do
    :ets.insert(@ticker_table, {symbol, ticker})
    :ets.insert(@price_table, {symbol, ticker.price})
    :ok
  end

  def get_candle(symbol, timeframe) do
    key = {symbol, timeframe}
    case :ets.lookup(@candle_table, key) do
      [{^key, candle}] -> {:ok, candle}
      [] -> {:error, :not_found}
    end
  end

  def put_candle(symbol, timeframe, candle) do
    :ets.insert(@candle_table, {{symbol, timeframe}, candle})
    :ok
  end

  def get_orderbook(symbol) do
    case :ets.lookup(@orderbook_table, symbol) do
      [{^symbol, book}] -> {:ok, book}
      [] -> {:error, :not_found}
    end
  end

  def put_orderbook(symbol, book) do
    :ets.insert(@orderbook_table, {symbol, book})
    :ok
  end

  def stats do
    %{
      ticker_count: safe_table_size(@ticker_table),
      price_count: safe_table_size(@price_table),
      candle_count: safe_table_size(@candle_table),
      orderbook_count: safe_table_size(@orderbook_table)
    }
  end

  # ============================================================================
  # PRIVATE
  # ============================================================================

  defp create_table(name) do
    if :ets.whereis(name) == :undefined do
      :ets.new(name, [:named_table, :public, :set, read_concurrency: true])
    end
  end

  defp safe_table_size(table) do
    case :ets.whereis(table) do
      :undefined -> 0
      _ -> :ets.info(table, :size)
    end
  end
end
