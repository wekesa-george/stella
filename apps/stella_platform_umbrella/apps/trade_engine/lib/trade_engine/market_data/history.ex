defmodule TradeEngine.MarketData.History do
  require Logger

  alias TradeEngine.MarketData.APIThrottle
  alias TradeEngine.Orchestrator.BinanceClient

  # HTTP Configuration
  @max_retries 3
  @backoff_increment_ms 1000
  @http_timeout_ms 15000       # 15 second timeout for HTTP requests
  @recv_timeout_ms 15000       # 15 second timeout for receiving response
  @connect_timeout_ms 10000    # 10 second timeout for connection

  @doc """
  Fetch candles with built-in throttling and retry logic.
  Only processes USDT pairs.
  """
  def fetch_candles(exchange, symbol, timeframe, limit) do
    # Step 0: Validate symbol ends with USDT
    normalized_symbol = normalize_symbol(symbol)
    
    case validate_usdt_symbol(normalized_symbol) do
      :ok ->
        # Step 1: Wait for throttle clearance
        :ok = APIThrottle.acquire()

        # Step 2: Fetch with retry on rate limit
        fetch_with_backoff(exchange, normalized_symbol, timeframe, limit, 0)

      :error ->
        #Logger.debug("⚠️  Skipping non-USDT pair: #{symbol}")
        {:error, :not_usdt_pair}
    end
  end

  # ========== SYMBOL VALIDATION ==========

  @doc "Normalize symbol to uppercase and remove forward slash"
  defp normalize_symbol(symbol) when is_binary(symbol) do
    symbol
    |> String.replace("/", "")
    |> String.upcase()
  end

  defp normalize_symbol(symbol), do: to_string(symbol)

  @doc "Validate that symbol ends with USDT"
  defp validate_usdt_symbol(symbol) do
    if String.ends_with?(symbol, "USDT") do
      :ok
    else
      :error
    end
  end

  # ========== FETCH WITH RETRY ==========

  defp fetch_with_backoff(exchange, symbol, timeframe, limit, retry_count) do
    case do_fetch(exchange, symbol, timeframe, limit) do
      {:ok, candles} ->
        {:ok, format_candles(candles)}

      {:error, :not_usdt_pair} ->
        # BinanceClient returned this - symbol passed our check but failed theirs (shouldn't happen)
        #Logger.warning("❌ Symbol validation mismatch - rejected by BinanceClient: #{symbol}")
        {:error, :not_usdt_pair}

      {:error, :invalid_symbol} ->
        #Logger.warning("❌ Invalid symbol: #{symbol}")
        {:error, :invalid_symbol}

      {:error, "Binance Error: 418"} ->
        if retry_count < @max_retries do
          backoff_ms = @backoff_increment_ms * (retry_count + 1)
          Logger.warning(
            "⚠️  Rate limited (418) #{symbol}@#{timeframe}. " <>
            "Waiting #{backoff_ms}ms before retry #{retry_count + 1}/#{@max_retries}..."
          )
          Process.sleep(backoff_ms)
          fetch_with_backoff(exchange, symbol, timeframe, limit, retry_count + 1)
        else
          Logger.error("❌ Rate limit failed after #{@max_retries} retries: #{symbol}@#{timeframe}")
          {:error, "Binance Error: 418"}
        end

      {:error, "Binance Error: 429"} ->
        if retry_count < @max_retries do
          backoff_ms = @backoff_increment_ms * (retry_count + 2)
          Logger.warning(
            "⚠️  Too many requests (429) #{symbol}@#{timeframe}. " <>
            "Waiting #{backoff_ms}ms before retry..."
          )
          Process.sleep(backoff_ms)
          fetch_with_backoff(exchange, symbol, timeframe, limit, retry_count + 1)
        else
          Logger.error("❌ Too many requests after #{@max_retries} retries")
          {:error, "Binance Error: 429"}
        end

      {:error, "timeout"} ->
        if retry_count < @max_retries do
          backoff_ms = @backoff_increment_ms * (retry_count + 3)
          Logger.warning(
            "⚠️  Timeout on #{symbol}@#{timeframe}. " <>
            "Waiting #{backoff_ms}ms before retry #{retry_count + 1}/#{@max_retries}..."
          )
          Process.sleep(backoff_ms)
          fetch_with_backoff(exchange, symbol, timeframe, limit, retry_count + 1)
        else
          Logger.error("❌ Timeout failed after #{@max_retries} retries: #{symbol}@#{timeframe}")
          {:error, "timeout"}
        end

      {:error, reason} ->
        Logger.error("❌ Fetch error #{symbol}@#{timeframe}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ========== FETCH IMPLEMENTATION ==========

  defp do_fetch("binance", symbol, timeframe, limit) do
    BinanceClient.fetch_klines(
      symbol,
      timeframe,
      limit,
      @http_timeout_ms,
      @recv_timeout_ms,
      @connect_timeout_ms
    )
  end

  defp do_fetch(exchange, _symbol, _timeframe, _limit) do
    {:error, "Unknown exchange: #{exchange}"}
  end

  # ========== RESPONSE FORMATTING ==========

  defp format_candles(candles) do
    Enum.map(candles, fn candle ->
      %{
        open: parse_decimal(candle.open),
        high: parse_decimal(candle.high),
        low: parse_decimal(candle.low),
        close: parse_decimal(candle.close),
        volume: parse_decimal(candle.volume),
        quote_asset_volume: parse_decimal(candle.quote_asset_volume),
        taker_buy_volume: parse_decimal(candle.taker_buy_volume),
        taker_buy_quote_volume: parse_decimal(candle.taker_buy_quote_volume)
      }
    end)
  end

  # ========== DECIMAL PARSING ==========

  defp parse_decimal(value) when is_float(value) do
    Decimal.from_float(value)
  end

  defp parse_decimal(value) when is_binary(value) do
    case Decimal.parse(value) do
      {decimal, ""} -> decimal
      :error -> Decimal.new("0")
    end
  end

  defp parse_decimal(value) when is_integer(value) do
    Decimal.new(value)
  end

  defp parse_decimal(value) do
    case Decimal.cast(value) do
      {:ok, decimal} -> decimal
      :error -> Decimal.new("0")
    end
  end
end

