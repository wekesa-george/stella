defmodule StellaAdmin.Binance.Client do
  @moduledoc """
  HTTP client for Binance REST API.
  Handles fetching candlestick data, market info, and other REST endpoints.
  """
  require Logger

  alias StellaAdmin.Binance.Cache

  @base_url "https://api.binance.com"
  @timeout 10_000

  @doc """
  Fetch candlestick/kline data for a trading pair.

  ## Parameters
    - pair: Trading pair (e.g., "BTCUSDT" or "BTC/USDT")
    - interval: Timeframe (e.g., "1m", "5m", "15m", "1h", "4h", "1d")
    - opts: Optional parameters
      - limit: Number of candles to fetch (default: 100, max: 1000)
      - start_time: Start time in milliseconds
      - end_time: End time in milliseconds

  ## Returns
    {:ok, candles} | {:error, reason}

  ## Example
      iex> Client.get_klines("BTCUSDT", "1h", limit: 100)
      {:ok, [
        %{
          open_time: 1708272000000,
          open: 44000.0,
          high: 44500.0,
          low: 43800.0,
          close: 44200.0,
          volume: 1234.5,
          close_time: 1708275599999
        },
        ...
      ]}
  """
  def get_klines(pair, interval \\ "1h", opts \\ []) do
    symbol = normalize_pair(pair)
    limit = Keyword.get(opts, :limit, 100)

    params = [
      symbol: symbol,
      interval: interval,
      limit: min(limit, 1000)
    ]

    params =
      params
      |> maybe_add_param(:startTime, Keyword.get(opts, :start_time))
      |> maybe_add_param(:endTime, Keyword.get(opts, :end_time))

    case request(:get, "/api/v3/klines", params) do
      {:ok, data} when is_list(data) ->
        candles = Enum.map(data, &parse_kline/1)
        {:ok, candles}

      {:error, reason} = error ->
        Logger.error("Failed to fetch klines for #{symbol}: #{inspect(reason)}")
        error
    end
  end

  @doc """
  Fetch candlestick data and cache it.
  """
  def fetch_and_cache_klines(pair, interval \\ "1h", opts \\ []) do
    case get_klines(pair, interval, opts) do
      {:ok, candles} ->
        Cache.put_candles(pair, interval, candles)
        {:ok, candles}

      error ->
        error
    end
  end

  @doc """
  Get 24hr ticker price change statistics.

  ## Parameters
    - pair: Trading pair (optional, if nil returns all pairs)

  ## Returns
    {:ok, stats} | {:error, reason}
  """
  def get_24hr_ticker(pair \\ nil) do
    params =
      if pair do
        [symbol: normalize_pair(pair)]
      else
        []
      end

    case request(:get, "/api/v3/ticker/24hr", params) do
      {:ok, data} ->
        {:ok, parse_ticker_stats(data)}

      error ->
        error
    end
  end

  @doc """
  Get current average price for a symbol.
  """
  def get_avg_price(pair) do
    symbol = normalize_pair(pair)

    case request(:get, "/api/v3/avgPrice", symbol: symbol) do
      {:ok, %{"price" => price}} ->
        {price_float, _} = Float.parse(price)
        {:ok, price_float}

      error ->
        error
    end
  end

  @doc """
  Get exchange information (trading rules, symbols, etc).
  """
  def get_exchange_info do
    case request(:get, "/api/v3/exchangeInfo") do
      {:ok, data} -> {:ok, data}
      error -> error
    end
  end

  @doc """
  Test connectivity to the Binance API.
  """
  def ping do
    case request(:get, "/api/v3/ping") do
      {:ok, _} -> :ok
      error -> error
    end
  end

  @doc """
  Get server time.
  """
  def get_server_time do
    case request(:get, "/api/v3/time") do
      {:ok, %{"serverTime" => time}} -> {:ok, time}
      error -> error
    end
  end

  # Private Functions

  defp request(method, path, params \\ []) do
    url = build_url(path, params)

    case Req.request(
           method: method,
           url: url,
           receive_timeout: @timeout,
           retry: :transient,
           max_retries: 3,
           retry_delay: 1000
         ) do
      {:ok, %{status: 200, body: body}} ->
        {:ok, body}

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp build_url(path, []) do
    "#{@base_url}#{path}"
  end

  defp build_url(path, params) do
    query = URI.encode_query(params)
    "#{@base_url}#{path}?#{query}"
  end

  defp normalize_pair(pair) do
    pair
    |> String.upcase()
    |> String.replace("/", "")
  end

  defp maybe_add_param(params, _key, nil), do: params

  defp maybe_add_param(params, key, value) do
    Keyword.put(params, key, value)
  end

  defp parse_kline([
         open_time,
         open,
         high,
         low,
         close,
         volume,
         close_time,
         _quote_volume,
         _trades,
         _taker_buy_base,
         _taker_buy_quote,
         _ignore
       ]) do
    %{
      open_time: open_time,
      open: parse_float(open),
      high: parse_float(high),
      low: parse_float(low),
      close: parse_float(close),
      volume: parse_float(volume),
      close_time: close_time,
      # Format for ApexCharts candlestick
      x: open_time,
      y: [
        parse_float(open),
        parse_float(high),
        parse_float(low),
        parse_float(close)
      ]
    }
  end

  defp parse_ticker_stats(data) when is_list(data) do
    Enum.map(data, &parse_ticker_stats/1)
  end

  defp parse_ticker_stats(data) when is_map(data) do
    %{
      symbol: Map.get(data, "symbol"),
      price_change: parse_float(Map.get(data, "priceChange")),
      price_change_percent: parse_float(Map.get(data, "priceChangePercent")),
      last_price: parse_float(Map.get(data, "lastPrice")),
      volume: parse_float(Map.get(data, "volume")),
      quote_volume: parse_float(Map.get(data, "quoteVolume")),
      high_price: parse_float(Map.get(data, "highPrice")),
      low_price: parse_float(Map.get(data, "lowPrice")),
      open_price: parse_float(Map.get(data, "openPrice"))
    }
  end

  defp parse_float(value) when is_binary(value) do
    case Float.parse(value) do
      {float, _} -> float
      :error -> 0.0
    end
  end

  defp parse_float(value) when is_number(value), do: value / 1
  defp parse_float(_), do: 0.0
end
