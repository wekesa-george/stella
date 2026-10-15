defmodule TradeEngine.Exchanges.Binance.KlineStream1 do
  @moduledoc """
  WebSocket stream for real-time candlestick (kline) data from Binance.
  
  PROFESSIONAL IMPLEMENTATION:
  - Maintains rolling buffer of 20 recent candles per symbol/timeframe
  - Proper ETS structure: {{symbol, timeframe}, [candles]}
  - Handles partial candles (in-progress updates)
  - Efficient candle deduplication by timestamp
  - Production-grade error recovery
  """

  use WebSockex
  require Logger

  alias TradeEngine.Exchanges.Types.Candle

  @heartbeat_interval 25_000
  @candle_table :binance_candle_cache
  @max_candles_per_buffer 20  # Rolling window size
  
  # Testnet endpoints
  @testnet_base "wss://stream.testnet.binance.vision/ws"
  @testnet_combined "wss://stream.testnet.binance.vision/stream"
  
  # Connection timeouts (longer for testnet)
  @connect_timeout 15_000
  @recv_timeout 15_000
  @handshake_timeout 15_000

  # ============================================================================
  # CLIENT API
  # ============================================================================

  def start_link(opts) do
    config = Keyword.fetch!(opts, :config)
    symbols = Keyword.get(opts, :symbols, default_symbols())
    timeframes = Keyword.get(opts, :timeframes, default_timeframes())
    name = Keyword.get(opts, :name, __MODULE__)
    
    ensure_ets_table()
    
    # Build streams BEFORE trying to connect
    streams = build_streams(symbols, timeframes)
    url = build_url(config, streams)
    
    Logger.info("🕯️ KlineStream (#{length(streams)} streams) connecting to testnet...")
    Logger.debug("   URL: #{url |> String.slice(0..100)}...")
    
    state = %{
      config: config,
      symbols: symbols,
      timeframes: timeframes,
      streams: streams,
      url: url,
      connected: false,
      message_count: 0,
      candles_closed: 0,
      started_at: DateTime.utc_now(),
      reconnect_attempts: 0,
      last_connect_time: nil,
      connection_stable: false,
      consecutive_failures: 0
    }
    
    WebSockex.start_link(
      url, 
      __MODULE__, 
      state,
      name: name,
      handle_initial_conn_failure: true,
      async: true,
      extra_headers: [{"User-Agent", "TradeEngine/1.0"}],
      connect_timeout: @connect_timeout,
      recv_timeout: @recv_timeout,
      handshake_timeout: @handshake_timeout
    )
  end

  def child_spec(opts) do
    name = Keyword.get(opts, :name, __MODULE__)
    %{
      id: name,
      start: {__MODULE__, :start_link, [opts]},
      restart: :transient,
      type: :worker,
      shutdown: 5_000
    }
  end

  def status(name \\ __MODULE__) do
    case Process.whereis(name) do
      nil -> {:error, :not_running}
      pid ->
        try do
          state = :sys.get_state(pid)
          {:ok, %{
            connected: state.connected,
            symbols: state.symbols,
            timeframes: state.timeframes,
            stream_count: length(state.streams),
            message_count: state.message_count,
            candles_closed: state.candles_closed,
            started_at: state.started_at,
            uptime_seconds: DateTime.diff(DateTime.utc_now(), state.started_at),
            reconnect_attempts: state.reconnect_attempts,
            connection_stable: state.connection_stable,
            consecutive_failures: state.consecutive_failures
          }}
        catch
          _, _ -> {:error, :unavailable}
        end
    end
  end

  def get_candle(symbol, timeframe) do
    key = {String.upcase(symbol), timeframe}
    case :ets.lookup(@candle_table, key) do
      [{^key, candles}] when is_list(candles) and length(candles) > 0 ->
        {:ok, List.last(candles)}  # Return latest
      _ -> {:error, :not_found}
    end
  end

  def all_candles do
    :ets.tab2list(@candle_table)
  end

  def get_recent_candles(symbol, count \\ 20) do
    symbol_upper = String.upcase(symbol)
    
    :ets.tab2list(@candle_table)
    |> Enum.filter(fn {{sym, _tf}, _candles} -> sym == symbol_upper end)
    |> Enum.flat_map(fn {_key, candles} -> 
      if is_list(candles), do: candles, else: [candles]
    end)
    |> Enum.sort_by(& &1.timestamp, {:desc, DateTime})
    |> Enum.take(count)
  end

  def has_capacity?(name \\ __MODULE__) do
    case Process.whereis(name) do
      nil -> false
      pid ->
        try do
          state = :sys.get_state(pid)
          length(state.streams) < 900
        catch
          _, _ -> false
        end
    end
  end

  # ============================================================================
  # WEBSOCKEX CALLBACKS
  # ============================================================================

  @impl true
  def handle_connect(_conn, state) do
    Logger.info("✅ KlineStream connected! Ready to receive klines.")
    schedule_heartbeat()
    
    {:ok, %{state | 
      connected: true, 
      reconnect_attempts: 0,
      last_connect_time: DateTime.utc_now(),
      connection_stable: false,
      consecutive_failures: 0
    }}
  end

  @impl true
  def handle_disconnect(disconnect_map, state) do
    Logger.warning("⚠️ KlineStream disconnected: #{inspect(disconnect_map.reason)}")
    
    connection_duration = if state.last_connect_time do
      DateTime.diff(DateTime.utc_now(), state.last_connect_time, :millisecond)
    else
      0
    end
    
    was_stable = connection_duration >= 120_000
    new_attempts = state.reconnect_attempts + 1
    new_failures = state.consecutive_failures + 1
    
    delay = calculate_reconnect_delay(new_attempts, was_stable)
    
    Logger.warning("🔄 KlineStream reconnecting in #{delay}ms (attempt #{new_attempts})")
    
    Process.send_after(self(), {:reconnect, delay}, delay)
    
    {:ok, %{state | 
      connected: false, 
      reconnect_attempts: new_attempts,
      consecutive_failures: new_failures,
      connection_stable: false
    }}
  end

  @impl true
  def handle_frame({:text, msg}, state) do
    case Jason.decode(msg) do
      {:ok, data} -> handle_message(data, state)
      {:error, _} -> {:ok, state}
    end
  end

  def handle_frame({:ping, data}, state) do
    {:reply, {:pong, data}, state}
  end

  def handle_frame({:pong, _data}, state) do
    {:ok, state}
  end

  def handle_frame(frame, state) do
    Logger.debug("Unknown frame: #{inspect(frame)}")
    {:ok, state}
  end

  @impl true
  def handle_info(:heartbeat, state) do
    if state.connected do
      schedule_heartbeat()
      Logger.debug("🕯️ KlineStream alive - #{state.message_count} messages, #{state.candles_closed} closed")
      {:ok, state}
    else
      {:ok, state}
    end
  end

  def handle_info({:reconnect, _delay}, state) do
    Logger.info("🔄 KlineStream reconnection initiated...")
    {:reconnect, state}
  end

  def handle_info(_msg, state), do: {:ok, state}

  # ============================================================================
  # MESSAGE HANDLING - PROFESSIONAL IMPLEMENTATION
  # ============================================================================

  defp handle_message(%{"stream" => _stream, "data" => %{"e" => "kline", "k" => kline_data, "s" => symbol}}, state) do
    timeframe = kline_data["i"]
    process_kline(symbol, timeframe, kline_data)
    
    new_count = state.message_count + 1
    new_closed = if kline_data["x"], do: state.candles_closed + 1, else: state.candles_closed
    
    if rem(new_count, 500) == 0 do
      Logger.info("🕯️ KlineStream: #{new_count} updates, #{new_closed} candles closed")
    end
    
    {:ok, %{state | message_count: new_count, candles_closed: new_closed}}
  end

  defp handle_message(%{"e" => "kline", "k" => kline_data, "s" => symbol}, state) do
    timeframe = kline_data["i"]
    process_kline(symbol, timeframe, kline_data)
    {:ok, %{state | message_count: state.message_count + 1}}
  end

  defp handle_message(%{"result" => nil}, state) do
    Logger.debug("KlineStream subscription confirmed")
    {:ok, state}
  end

  defp handle_message(_data, state), do: {:ok, state}

  # ============================================================================
  # CORE: MAINTAIN ROLLING CANDLE BUFFER
  # ============================================================================
  
  defp process_kline(symbol, timeframe, k) do
    candle = %Candle{
      exchange: :binance,
      symbol: symbol,
      timeframe: timeframe,
      timestamp: DateTime.from_unix!(k["t"], :millisecond),
      open: Decimal.new(k["o"]),
      high: Decimal.new(k["h"]),
      low: Decimal.new(k["l"]),
      close: Decimal.new(k["c"]),
      volume: Decimal.new(k["v"]),
      quote_volume: Decimal.new(k["q"]),
      taker_buy_volume: safe_decimal(k["V"]),
      taker_buy_quote_volume: safe_decimal(k["Q"]),
      trade_count: k["n"],
      closed: k["x"]
    }
    
    # PROFESSIONAL: Maintain rolling buffer of candles
    key = {symbol, timeframe}
    
    # Get existing candles
    current_buffer = case :ets.lookup(@candle_table, key) do
      [{^key, candles}] when is_list(candles) -> candles
      [{^key, single_candle}] -> [single_candle]  # Upgrade old format
      [] -> []
    end
    
    # Build new buffer:
    # 1. Add new candle to front
    # 2. Remove duplicates (same timestamp)
    # 3. Keep only most recent N candles
    # 4. Sort oldest first
    new_buffer = [candle | current_buffer]
      |> Enum.uniq_by(& &1.timestamp)  # Dedup by timestamp
      |> Enum.sort_by(& &1.timestamp, {:asc, DateTime})
      |> Enum.take(-@max_candles_per_buffer)  # Keep last N (oldest first)
    
    # Store updated buffer
    :ets.insert(@candle_table, {key, new_buffer})
    
    # Broadcast updates
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "kline:#{symbol}:#{timeframe}", {:kline, candle})
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "kline:#{symbol}", {:kline, candle})
    
    # Broadcast closed candles
    if candle.closed do
      Phoenix.PubSub.broadcast(TradeEngine.PubSub, "candle_closed:#{timeframe}", {:candle_closed, candle})
      Phoenix.PubSub.broadcast(TradeEngine.PubSub, "candle_closed:#{symbol}:#{timeframe}", {:candle_closed, candle})
      Logger.debug("🕯️ Candle closed: #{symbol} #{timeframe} - Buffer size: #{length(new_buffer)}")
    end
  end

  # ============================================================================
  # PRIVATE HELPERS
  # ============================================================================

  defp build_streams(symbols, timeframes) do
    for symbol <- symbols, tf <- timeframes do
      "#{String.downcase(symbol)}@kline_#{tf}"
    end
  end

  defp build_url(config, streams) do
    is_testnet = config.testnet || String.contains?(config.ws_base_url || "", "testnet")
    
    if is_testnet do
      Logger.info("🕯️ Building testnet URL with #{length(streams)} streams")
      
      streams_param = Enum.join(streams, "/")
      url = "#{@testnet_combined}?streams=#{streams_param}"
      
      if String.length(url) > 2000 do
        Logger.warning("⚠️ URL length #{String.length(url)} > 2000, may be rejected by testnet")
      end
      
      url
    else
      base_clean = String.trim_trailing(config.ws_base_url || "", "/")
      if String.ends_with?(base_clean, "/ws") do
        "#{base_clean}/!kline@arr"
      else
        "#{base_clean}/ws/!kline@arr"
      end
    end
  end

  defp calculate_reconnect_delay(attempt, was_stable) do
    base_delay = if was_stable do
      2_000
    else
      min(attempt * 3_000, 30_000)
    end
    
    jitter = :rand.uniform(2_000)
    base_delay + jitter
  end

  defp default_symbols do
    Application.get_env(:trade_engine, :tracked_symbols, 
      ~w(BTCUSDT ETHUSDT BNBUSDT SOLUSDT XRPUSDT))
  end

  defp default_timeframes do
    Application.get_env(:trade_engine, :strategy_timeframes, ~w(5m 15m 1h 4h))
  end

  defp ensure_ets_table do
    if :ets.whereis(@candle_table) == :undefined do
      :ets.new(@candle_table, [:named_table, :public, :set, read_concurrency: true])
      Logger.info("📦 Created ETS table: #{@candle_table}")
    end
  end

  defp schedule_heartbeat do
    Process.send_after(self(), :heartbeat, @heartbeat_interval)
  end

  defp safe_decimal(nil), do: nil
  defp safe_decimal(""), do: nil
  defp safe_decimal(val) when is_binary(val), do: Decimal.new(val)
  defp safe_decimal(val) when is_number(val), do: Decimal.from_float(val * 1.0)
end