defmodule TradeEngine.MarketData.Backfill do
  @moduledoc """
  Historical OHLCV data backfill from Binance REST API.

  Fetches kline data in paginated batches (1000 per request),
  respects rate limits, and bulk-inserts into the appropriate
  market_data.ohlcv_* TimescaleDB hypertable.

  ## Usage (IEx)

      TradeEngine.MarketData.Backfill.run("binance", "BTCUSDT", "1m", ~U[2026-02-21 00:00:00Z], ~U[2026-02-28 00:00:00Z])
  """

  require Logger

  alias TradeEngine.Repo

  @max_klines_per_request 1000
  @rate_limit_delay_ms 500

  # Timeframe durations in milliseconds
  @timeframe_ms %{
    "1m" => 60_000,
    "3m" => 180_000,
    "5m" => 300_000,
    "15m" => 900_000,
    "30m" => 1_800_000,
    "1h" => 3_600_000,
    "4h" => 14_400_000,
    "1d" => 86_400_000
  }

  @timeframe_tables %{
    "1m" => "market_data.ohlcv_1m",
    "1h" => "market_data.ohlcv_1h",
    "1d" => "market_data.ohlcv_1d"
  }

  @doc """
  Backfill OHLCV data for a given exchange, pair, timeframe, and date range.
  Returns {:ok, %{total_candles: n, batches: n}} or {:error, reason}.
  """
  def run(exchange, pair, timeframe, start_date, end_date) do
    table = Map.get(@timeframe_tables, timeframe)

    unless table do
      {:error, "Unsupported timeframe for persistence: #{timeframe}. Supported: #{inspect(Map.keys(@timeframe_tables))}"}
    else
      Logger.info("📥 Backfill starting: #{exchange}/#{pair} #{timeframe} from #{start_date} to #{end_date}")

      start_ms = DateTime.to_unix(start_date, :millisecond)
      end_ms = DateTime.to_unix(end_date, :millisecond)

      result = fetch_and_persist_loop(exchange, pair, timeframe, table, start_ms, end_ms, 0, 0)

      case result do
        {:ok, stats} ->
          Logger.info("📥 Backfill complete: #{stats.total_candles} candles in #{stats.batches} batches")
          {:ok, stats}

        {:error, _} = error ->
          error
      end
    end
  end

  # ============================================================================
  # PRIVATE
  # ============================================================================

  defp fetch_and_persist_loop(_exchange, _pair, _timeframe, _table, start_ms, end_ms, total, batches)
       when start_ms >= end_ms do
    {:ok, %{total_candles: total, batches: batches}}
  end

  defp fetch_and_persist_loop(exchange, pair, timeframe, table, start_ms, end_ms, total, batches) do
    case fetch_klines(exchange, pair, timeframe, start_ms, end_ms) do
      {:ok, []} ->
        {:ok, %{total_candles: total, batches: batches}}

      {:ok, klines} ->
        count = persist_klines(klines, exchange, pair, table)
        Logger.info("📥 Backfill batch #{batches + 1}: #{count} candles (#{pair} #{timeframe})")

        # Move start forward past the last candle
        last_time_ms = klines |> List.last() |> elem(0)
        next_start = last_time_ms + Map.get(@timeframe_ms, timeframe, 60_000)

        # Rate limit
        Process.sleep(@rate_limit_delay_ms)

        fetch_and_persist_loop(exchange, pair, timeframe, table, next_start, end_ms, total + count, batches + 1)

      {:error, reason} ->
        Logger.error("📥 Backfill fetch error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp fetch_klines("binance", pair, timeframe, start_ms, end_ms) do
    testnet = Application.get_env(:trade_engine, :binance_testnet, true)

    base_url =
      if testnet,
        do: "https://testnet.binance.vision/api",
        else: "https://api.binance.com"

    url = "#{base_url}/v3/klines"

    params = [
      symbol: pair,
      interval: timeframe,
      startTime: start_ms,
      endTime: end_ms,
      limit: @max_klines_per_request
    ]

    case Req.get(url, params: params, receive_timeout: 15_000) do
      {:ok, %{status: 200, body: body}} when is_list(body) ->
        klines =
          Enum.map(body, fn
            [open_time, open, high, low, close, volume, _close_time, quote_vol, trades | _] ->
              {open_time, open, high, low, close, volume, quote_vol, trades}
          end)

        {:ok, klines}

      {:ok, %{status: 429}} ->
        Logger.warning("📥 Rate limited (429), waiting 5s...")
        Process.sleep(5_000)
        fetch_klines("binance", pair, timeframe, start_ms, end_ms)

      {:ok, %{status: status, body: body}} ->
        {:error, "Binance API error #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp fetch_klines(exchange, _pair, _timeframe, _start_ms, _end_ms) do
    {:error, "Unsupported exchange: #{exchange}"}
  end

  defp persist_klines(klines, exchange, pair, table) do
    rows =
      Enum.map(klines, fn {open_time_ms, open, high, low, close, volume, quote_vol, trades} ->
        time = DateTime.from_unix!(open_time_ms, :millisecond)
        [time, exchange, pair, open, high, low, close, volume, quote_vol, trades]
      end)

    count = length(rows)

    if count > 0 do
      {placeholders, params} =
        rows
        |> Enum.with_index()
        |> Enum.reduce({[], []}, fn {row, i}, {phs, ps} ->
          offset = i * 10
          ph = "($#{offset+1}, $#{offset+2}, $#{offset+3}, $#{offset+4}, $#{offset+5}, $#{offset+6}, $#{offset+7}, $#{offset+8}, $#{offset+9}, $#{offset+10})"
          {[ph | phs], ps ++ row}
        end)

      sql = """
      INSERT INTO #{table} (time, exchange_code, trading_pair, open, high, low, close, volume, quote_volume, trade_count)
      VALUES #{placeholders |> Enum.reverse() |> Enum.join(", ")}
      ON CONFLICT DO NOTHING
      """

      try do
        Repo.query!(sql, params)
        count
      rescue
        e ->
          Logger.error("📥 Persist error: #{Exception.message(e)}")
          0
      end
    else
      0
    end
  end
end
