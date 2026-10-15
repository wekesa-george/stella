defmodule TradeEngine.MarketData.CandlePersister do
  @moduledoc """
  Subscribes to PubSub candle_closed events and bulk-inserts completed candles
  into market_data.ohlcv_1m (TimescaleDB).

  Buffers candles and flushes every 60s or when buffer hits 100 candles.
  Uses ON CONFLICT DO NOTHING to handle duplicates gracefully.
  """

  use GenServer
  require Logger

  alias TradeEngine.Repo

  @pubsub TradeEngine.PubSub
  @flush_interval_ms 60_000
  @max_buffer_size 100

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Get persister stats"
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    # Subscribe to candle close events for all timeframes
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:1m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:5m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:15m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:1h")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:1d")

    schedule_flush()
    Logger.info("📊 CandlePersister started — flush every #{@flush_interval_ms}ms, buffer max #{@max_buffer_size}")

    {:ok, %{
      buffer_1m: [],
      buffer_5m: [],
      buffer_15m: [],
      buffer_1h: [],
      buffer_1d: [],
      total_persisted: 0,
      total_batches: 0
    }}
  end

  # Handle the actual message format from KlineStream: {:candle_closed, %Candle{}}
  # The timeframe is embedded in the PubSub topic and in the candle struct itself
  @impl true
  def handle_info({:candle_closed, %{timeframe: timeframe} = candle_data}, state) do
    buffer_key = timeframe_to_buffer(timeframe)

    state = Map.update!(state, buffer_key, fn buf -> [candle_to_persist_map(candle_data) | buf] end)

    # Flush if any buffer exceeds max size
    if buffer_size(state) >= @max_buffer_size do
      {:noreply, flush_all(state)}
    else
      {:noreply, state}
    end
  end

  # Also handle the legacy 3-element tuple format in case anything else sends it
  def handle_info({:candle_closed, timeframe, candle_data}, state) when is_binary(timeframe) do
    buffer_key = timeframe_to_buffer(timeframe)

    state = Map.update!(state, buffer_key, fn buf -> [candle_data | buf] end)

    if buffer_size(state) >= @max_buffer_size do
      {:noreply, flush_all(state)}
    else
      {:noreply, state}
    end
  end

  def handle_info(:flush, state) do
    schedule_flush()
    {:noreply, flush_all(state)}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  @impl true
  def handle_call(:stats, _from, state) do
    stats = %{
      buffer_1m: length(state.buffer_1m),
      buffer_5m: length(state.buffer_5m),
      buffer_15m: length(state.buffer_15m),
      buffer_1h: length(state.buffer_1h),
      buffer_1d: length(state.buffer_1d),
      total_persisted: state.total_persisted,
      total_batches: state.total_batches
    }
    {:reply, stats, state}
  end

  # ============================================================================
  # PRIVATE
  # ============================================================================

  defp flush_all(state) do
    state
    |> flush_buffer(:buffer_1m, "market_data.ohlcv_1m")
    |> flush_buffer(:buffer_5m, "market_data.ohlcv_5m")
    |> flush_buffer(:buffer_15m, "market_data.ohlcv_15m")
    |> flush_buffer(:buffer_1h, "market_data.ohlcv_1h")
    |> flush_buffer(:buffer_1d, "market_data.ohlcv_1d")
  end

  defp flush_buffer(state, buffer_key, table) do
    buffer = Map.get(state, buffer_key, [])

    if buffer == [] do
      state
    else
      rows = Enum.map(buffer, &candle_to_row/1)
      count = length(rows)

      try do
        # Extract values in consistent column order to match INSERT statement
        params = Enum.flat_map(rows, fn row ->
          [row.time, row.exchange_code, row.trading_pair, row.open, row.high, row.low, row.close, row.volume, row.quote_volume, row.trade_count, row.is_complete]
        end)

        Repo.query!(
          insert_sql(table, count),
          params
        )

        Logger.info("📊 CandlePersister: flushed #{count} candles to #{table}")

        state
        |> Map.put(buffer_key, [])
        |> Map.update!(:total_persisted, &(&1 + count))
        |> Map.update!(:total_batches, &(&1 + 1))
      rescue
        e ->
          Logger.error("📊 CandlePersister: flush failed for #{table} — #{Exception.message(e)}")
          state
      end
    end
  end

  # Convert a Candle struct from KlineStream into a map suitable for persistence
  defp candle_to_persist_map(%{} = candle) do
    %{
      time: Map.get(candle, :timestamp),
      exchange_code: to_string(Map.get(candle, :exchange, "binance")),
      trading_pair: Map.get(candle, :symbol),
      open: Map.get(candle, :open),
      high: Map.get(candle, :high),
      low: Map.get(candle, :low),
      close: Map.get(candle, :close),
      volume: Map.get(candle, :volume, 0),
      quote_volume: Map.get(candle, :quote_volume, 0),
      trade_count: Map.get(candle, :trade_count, 0),
      is_complete: Map.get(candle, :closed, true)
    }
  end

  defp candle_to_row(candle) do
    %{
      time: candle[:time] || candle["time"],
      exchange_code: candle[:exchange_code] || candle["exchange_code"] || "binance",
      trading_pair: candle[:trading_pair] || candle["trading_pair"] || candle[:symbol] || candle["symbol"],
      open: to_decimal(candle[:open] || candle["open"]),
      high: to_decimal(candle[:high] || candle["high"]),
      low: to_decimal(candle[:low] || candle["low"]),
      close: to_decimal(candle[:close] || candle["close"]),
      volume: to_decimal(candle[:volume] || candle["volume"] || 0),
      quote_volume: to_decimal(candle[:quote_volume] || candle["quote_volume"] || 0),
      trade_count: candle[:trade_count] || candle["trade_count"] || 0,
      is_complete: candle[:is_complete] || candle["is_complete"] || true
    }
  end

  defp insert_sql(table, count) do
    placeholders =
      1..count
      |> Enum.map(fn i ->
        offset = (i - 1) * 11
        "($#{offset+1}, $#{offset+2}, $#{offset+3}, $#{offset+4}, $#{offset+5}, $#{offset+6}, $#{offset+7}, $#{offset+8}, $#{offset+9}, $#{offset+10}, $#{offset+11})"
      end)
      |> Enum.join(", ")

    """
    INSERT INTO #{table} (time, exchange_code, trading_pair, open, high, low, close, volume, quote_volume, trade_count, is_complete)
    VALUES #{placeholders}
    ON CONFLICT DO NOTHING
    """
  end

  defp to_decimal(nil), do: Decimal.new(0)
  defp to_decimal(%Decimal{} = d), do: d
  defp to_decimal(n) when is_float(n), do: Decimal.from_float(n)
  defp to_decimal(n) when is_integer(n), do: Decimal.new(n)
  defp to_decimal(n) when is_binary(n) do
    case Decimal.parse(n) do
      {d, ""} -> d
      _ -> Decimal.new(0)
    end
  end
  defp to_decimal(_), do: Decimal.new(0)

  defp timeframe_to_buffer("1m"), do: :buffer_1m
  defp timeframe_to_buffer("5m"), do: :buffer_5m
  defp timeframe_to_buffer("15m"), do: :buffer_15m
  defp timeframe_to_buffer("1h"), do: :buffer_1h
  defp timeframe_to_buffer("1d"), do: :buffer_1d
  defp timeframe_to_buffer(_), do: :buffer_1m

  defp buffer_size(state) do
    length(state.buffer_1m) + length(state.buffer_5m) + length(state.buffer_15m) + length(state.buffer_1h) + length(state.buffer_1d)
  end

  defp schedule_flush do
    Process.send_after(self(), :flush, @flush_interval_ms)
  end
end
