defmodule TradeEngine.Exchanges.Adapter do
  @moduledoc """
  Exchange adapter registry and unified price lookup.

  Provides a single entry point for multi-exchange price queries
  using composite keys `{exchange, pair}`. Falls back to the
  Binance-only caches for backward compatibility.

  ## Usage

      Adapter.get_price("binance", "BTCUSDT")
      Adapter.get_price("bybit", "BTCUSDT")
      Adapter.all_prices()  # returns %{{"binance", "BTCUSDT"} => price, ...}
  """

  require Logger

  @adapters %{
    "alpaca" => TradeEngine.Exchanges.Adapters.Alpaca,
    "binance" => TradeEngine.Exchanges.Adapters.Binance,
    "binance_testnet" => TradeEngine.Exchanges.Adapters.Binance,
    "bybit" => TradeEngine.Exchanges.Bybit
  }

  @doc "Get the module for a given exchange name"
  def get_adapter(exchange) do
    case Map.get(@adapters, exchange) do
      nil -> {:error, :unknown_exchange}
      mod -> {:ok, mod}
    end
  end

  @doc "List registered exchange adapters"
  def list_adapters, do: Map.keys(@adapters)

  @doc "Resolve adapter module from adapter code string"
  def resolve_adapter(adapter_code) do
    case Map.get(@adapters, adapter_code) do
      nil -> {:error, {:unknown_adapter, adapter_code}}
      mod -> {:ok, mod}
    end
  end

  @doc """
  Get price using composite key {exchange, pair}.
  Falls back to Binance ETS caches for backward compatibility.
  """
  def get_price(exchange, pair) do
    # Try the unified :price_cache first (composite key)
    try do
      case :ets.lookup(:price_cache, {exchange, pair}) do
        [{{^exchange, ^pair}, price, _ts}] -> {:ok, price}
        [{{^exchange, ^pair}, price}] -> {:ok, price}
        _ -> get_price_legacy(exchange, pair)
      end
    rescue
      ArgumentError -> get_price_legacy(exchange, pair)
    end
  end

  @doc "Get price using legacy single-exchange cache"
  def get_price_legacy("binance" <> _, pair) do
    TradeEngine.Exchanges.Binance.CacheManager.get_price(pair)
  end

  def get_price_legacy(_exchange, _pair), do: {:error, :not_found}

  @doc """
  Get all prices across all exchanges.
  Returns map with composite keys: %{{"binance", "BTCUSDT"} => price, ...}
  """
  def all_prices do
    # Start with unified cache
    unified =
      try do
        :ets.tab2list(:price_cache)
        |> Map.new(fn
          {{exchange, pair}, price, _ts} -> {{exchange, pair}, price}
          {{exchange, pair}, price} -> {{exchange, pair}, price}
        end)
      rescue
        _ -> %{}
      end

    # Merge in Binance legacy prices
    binance =
      try do
        TradeEngine.Exchanges.Binance.CacheManager.all_prices()
        |> Enum.map(fn {pair, price} -> {{"binance", pair}, price} end)
        |> Map.new()
      rescue
        _ -> %{}
      end

    Map.merge(binance, unified)
  end

  @doc """
  Broadcast a price update to the exchange-qualified PubSub topic.
  Also broadcasts to legacy topic for backward compatibility.
  """
  def broadcast_ticker(exchange, symbol, price) do
    pubsub = TradeEngine.PubSub

    # New format: "ticker:binance:BTCUSDT"
    Phoenix.PubSub.broadcast(pubsub, "ticker:#{exchange}:#{symbol}", {:ticker_update, %{
      exchange: exchange,
      symbol: symbol,
      price: price
    }})

    # Legacy format: "ticker:BTCUSDT" (backward compat)
    Phoenix.PubSub.broadcast(pubsub, "ticker:#{symbol}", {:ticker_update, %{
      symbol: symbol,
      price: price
    }})
  end
end
