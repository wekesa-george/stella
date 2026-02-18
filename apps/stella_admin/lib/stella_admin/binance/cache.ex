defmodule StellaAdmin.Binance.Cache do
  @moduledoc """
  In-memory cache for Binance market data using ETS.
  Stores live prices, candlestick data, and 24h statistics.
  """
  use GenServer
  require Logger

  @prices_table :binance_prices
  @candles_table :binance_candles
  @stats_table :binance_stats

  # Client API

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Get current price for a trading pair.
  Returns: %{price: float, timestamp: integer, change_24h: float} | nil
  """
  def get_price(pair) do
    case :ets.lookup(@prices_table, normalize_pair(pair)) do
      [{_pair, data}] -> data
      [] -> nil
    end
  end

  @doc """
  Get all current prices.
  Returns: map of pair => price data
  """
  def get_all_prices do
    @prices_table
    |> :ets.tab2list()
    |> Map.new()
  end

  @doc """
  Update price for a trading pair.
  """
  def update_price(pair, price, opts \\ []) do
    GenServer.cast(__MODULE__, {:update_price, normalize_pair(pair), price, opts})
  end

  @doc """
  Get candlestick data for a pair and interval.
  Returns: list of candles or nil
  """
  def get_candles(pair, interval \\ "1h") do
    key = {normalize_pair(pair), interval}

    case :ets.lookup(@candles_table, key) do
      [{_key, candles}] -> candles
      [] -> nil
    end
  end

  @doc """
  Store candlestick data for a pair and interval.
  """
  def put_candles(pair, interval, candles) do
    GenServer.cast(__MODULE__, {:put_candles, normalize_pair(pair), interval, candles})
  end

  @doc """
  Get 24h statistics for a pair.
  """
  def get_stats(pair) do
    case :ets.lookup(@stats_table, normalize_pair(pair)) do
      [{_pair, stats}] -> stats
      [] -> nil
    end
  end

  @doc """
  Update 24h statistics for a pair.
  """
  def update_stats(pair, stats) do
    GenServer.cast(__MODULE__, {:update_stats, normalize_pair(pair), stats})
  end

  @doc """
  Clear all cached data.
  """
  def clear_all do
    GenServer.call(__MODULE__, :clear_all)
  end

  # Server Callbacks

  @impl true
  def init(_opts) do
    # Create ETS tables
    :ets.new(@prices_table, [:named_table, :set, :public, read_concurrency: true])
    :ets.new(@candles_table, [:named_table, :set, :public, read_concurrency: true])
    :ets.new(@stats_table, [:named_table, :set, :public, read_concurrency: true])

    Logger.info("Binance.Cache started with ETS tables")

    {:ok, %{}}
  end

  @impl true
  def handle_cast({:update_price, pair, price, opts}, state) do
    timestamp = Keyword.get(opts, :timestamp, System.system_time(:millisecond))
    change_24h = Keyword.get(opts, :change_24h, 0.0)

    price_data = %{
      price: price,
      timestamp: timestamp,
      change_24h: change_24h
    }

    :ets.insert(@prices_table, {pair, price_data})

    # Broadcast price update via PubSub
    Phoenix.PubSub.broadcast(
      StellaAdmin.PubSub,
      "binance:prices",
      {:price_update, pair, price_data}
    )

    {:noreply, state}
  end

  @impl true
  def handle_cast({:put_candles, pair, interval, candles}, state) do
    key = {pair, interval}
    :ets.insert(@candles_table, {key, candles})

    Logger.debug("Cached #{length(candles)} candles for #{pair} #{interval}")

    {:noreply, state}
  end

  @impl true
  def handle_cast({:update_stats, pair, stats}, state) do
    :ets.insert(@stats_table, {pair, stats})
    {:noreply, state}
  end

  @impl true
  def handle_call(:clear_all, _from, state) do
    :ets.delete_all_objects(@prices_table)
    :ets.delete_all_objects(@candles_table)
    :ets.delete_all_objects(@stats_table)

    Logger.info("Cleared all cache data")

    {:reply, :ok, state}
  end

  # Private Helpers

  defp normalize_pair(pair) do
    pair
    |> String.upcase()
    |> String.replace("/", "")
  end
end
