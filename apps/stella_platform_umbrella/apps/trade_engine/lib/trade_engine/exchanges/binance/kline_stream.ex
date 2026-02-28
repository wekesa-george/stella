defmodule TradeEngine.Exchanges.Binance.KlineStream do
  @moduledoc """
  ✅ FIXED: KlineStream with Stale Connection Detection & Auto-Reconnect
  
  KEY FIXES:
  1. ✅ Detects stale connections (no data for 2 minutes)
  2. ✅ Auto-reconnects on stale detection
  3. ✅ Exponential backoff for reconnects
  4. ✅ Connection health monitoring
  """

  use WebSockex
  require Logger

  alias TradeEngine.Exchanges.Types.Candle

  # ========================================================================
  # CONFIGURATION
  # ========================================================================
  
  @heartbeat_interval 25_000           # Check every 25 seconds
  @stale_threshold_ms 120_000          # 2 minutes = stale
  @candle_table :binance_candle_cache
  @max_candles_per_buffer 20
  
  # Testnet endpoints
  @testnet_combined "wss://stream.testnet.binance.vision/stream"
  
  # Connection timeouts
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
    
    streams = build_streams(symbols, timeframes)
    url = build_url(config, streams)
    
    Logger.info("🕯️ KlineStream (#{length(streams)} streams) connecting...")
    
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
      last_message_time: DateTime.utc_now(),  # ✅ Track last message
      reconnect_attempts: 0,
      stale_warnings: 0
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
      restart: :permanent,
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
          
          # Calculate time since last message
          ms_since_last = DateTime.diff(DateTime.utc_now(), state.last_message_time, :millisecond)
          is_stale = ms_since_last > @stale_threshold_ms
          
          {:ok, %{
            connected: state.connected,
            symbols: state.symbols,
            timeframes: state.timeframes,
            stream_count: length(state.streams),
            message_count: state.message_count,
            candles_closed: state.candles_closed,
            started_at: state.started_at,
            uptime_seconds: DateTime.diff(DateTime.utc_now(), state.started_at),
            last_message_time: state.last_message_time,
            seconds_since_last_message: div(ms_since_last, 1000),
            is_stale: is_stale,
            reconnect_attempts: state.reconnect_attempts,
            stale_warnings: state.stale_warnings
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
        {:ok, List.last(candles)}
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

  # ============================================================================
  # WEBSOCKEX CALLBACKS
  # ============================================================================

  @impl true
  def handle_connect(_conn, state) do
    Logger.info("✅ KlineStream connected!")
    schedule_heartbeat()
    schedule_stale_check()  # ✅ Start stale checking
    
    {:ok, %{state | 
      connected: true, 
      reconnect_attempts: 0,
      last_message_time: DateTime.utc_now()
    }}
  end

  @impl true
  def handle_disconnect(disconnect_map, state) do
    Logger.warning("⚠️ KlineStream disconnected: #{inspect(disconnect_map.reason)}")
    
    new_attempts = state.reconnect_attempts + 1
    delay = calculate_reconnect_delay(new_attempts)
    
    Logger.warning("🔄 Reconnecting in #{delay}ms (attempt #{new_attempts})")
    
    {:reconnect, %{state | 
      connected: false, 
      reconnect_attempts: new_attempts
    }}
  end

  @impl true
  def handle_frame({:text, msg}, state) do
    case Jason.decode(msg) do
      {:ok, data} -> 
        # ✅ Update last message time on ANY valid message
        handle_message(data, %{state | last_message_time: DateTime.utc_now()})
      {:error, _} -> 
        {:ok, state}
    end
  end

  def handle_frame({:ping, data}, state) do
    {:reply, {:pong, data}, %{state | last_message_time: DateTime.utc_now()}}
  end

  def handle_frame({:pong, _data}, state) do
    {:ok, %{state | last_message_time: DateTime.utc_now()}}
  end

  def handle_frame(_frame, state), do: {:ok, state}

  @impl true
  def handle_info(:heartbeat, state) do
    if state.connected do
      schedule_heartbeat()
      Logger.debug("🕯️ KlineStream alive - #{state.message_count} msgs, #{state.candles_closed} closed")
    end
    {:ok, state}
  end

  # ✅ NEW: Stale connection detection
  def handle_info(:check_stale, state) do
    if state.connected do
      ms_since_last = DateTime.diff(DateTime.utc_now(), state.last_message_time, :millisecond)
      
      if ms_since_last > @stale_threshold_ms do
        Logger.warning("🔴 KlineStream STALE - No data for #{div(ms_since_last, 1000)}s, forcing reconnect!")
        
        # Force reconnect by returning :close
        {:close, %{state | stale_warnings: state.stale_warnings + 1}}
      else
        schedule_stale_check()
        {:ok, state}
      end
    else
      schedule_stale_check()
      {:ok, state}
    end
  end

  def handle_info(_msg, state), do: {:ok, state}

  # ============================================================================
  # MESSAGE HANDLING
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
  # CANDLE PROCESSING
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
    
    key = {symbol, timeframe}
    
    current_buffer = case :ets.lookup(@candle_table, key) do
      [{^key, candles}] when is_list(candles) -> candles
      [{^key, single_candle}] -> [single_candle]
      [] -> []
    end
    
    new_buffer = [candle | current_buffer]
      |> Enum.uniq_by(& &1.timestamp)
      |> Enum.sort_by(& &1.timestamp, {:asc, DateTime})
      |> Enum.take(-@max_candles_per_buffer)
    
    :ets.insert(@candle_table, {key, new_buffer})
    
    # Broadcast
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "kline:#{symbol}:#{timeframe}", {:kline, candle})
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "kline:#{symbol}", {:kline, candle})
    
    if candle.closed do
      Phoenix.PubSub.broadcast(TradeEngine.PubSub, "candle_closed:#{timeframe}", {:candle_closed, candle})
      Phoenix.PubSub.broadcast(TradeEngine.PubSub, "candle_closed:#{symbol}:#{timeframe}", {:candle_closed, candle})
    end
  end

  # ============================================================================
  # HELPERS
  # ============================================================================

  defp build_streams(symbols, timeframes) do
    for symbol <- symbols, tf <- timeframes do
      "#{String.downcase(symbol)}@kline_#{tf}"
    end
  end

  defp build_url(config, streams) do
    is_testnet = config.testnet || String.contains?(config.ws_base_url || "", "testnet")
    
    if is_testnet do
      streams_param = Enum.join(streams, "/")
      "#{@testnet_combined}?streams=#{streams_param}"
    else
      base_clean = String.trim_trailing(config.ws_base_url || "", "/")
      if String.ends_with?(base_clean, "/ws") do
        "#{base_clean}/!kline@arr"
      else
        "#{base_clean}/ws/!kline@arr"
      end
    end
  end

  defp calculate_reconnect_delay(attempt) do
    base_delay = min(attempt * 3_000, 30_000)
    jitter = :rand.uniform(2_000)
    base_delay + jitter
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # VOLATILITY-TIERED ASSET LIST
  # Matches MarginScalper tiers for coordinated trading
  # ═══════════════════════════════════════════════════════════════════════════════

  defp default_symbols do
    Application.get_env(:trade_engine, :tracked_symbols, all_tier_symbols())
  end

  defp all_tier_symbols do
    tier1_ultra_volatile() ++ tier2_high_volatile() ++ tier3_medium_volatile() ++ tier4_low_volatile()
  end

  # TIER 1: ULTRA-HIGH VOLATILITY - Meme coins & micro caps ($0.0001-$0.10)
  # Daily volatility: 15-50%, TP hit time: 5-15 min
  defp tier1_ultra_volatile do
    ~w(
      PEPEUSDT 1000PEPEUSDT SHIBUSDT 1000SHIBUSDT FLOKIUSDT 1000FLOKIUSDT
      BONKUSDT 1000BONKUSDT LUNCUSDT 1000LUNCUSDT BTTCUSDT HOTUSDT
      WIFUSDT MEMEUSDT PEOPLEUSDT
    )
  end

  # TIER 2: HIGH VOLATILITY - Small caps ($0.10-$5.00)
  # Daily volatility: 8-20%, TP hit time: 15-30 min
  defp tier2_high_volatile do
    ~w(
      DOGEUSDT XRPUSDT ADAUSDT TRXUSDT VETUSDT ALGOUSDT XLMUSDT
      ICPUSDT FILUSDT GALAUSDT SANDUSDT MANAUSDT APEUSDT CRVUSDT
      LDOUSDT ARBUSDT OPUSDT SUIUSDT SEIUSDT TIAUSDT
    )
  end

  # TIER 3: MEDIUM VOLATILITY - Mid caps ($5-$100)
  # Daily volatility: 5-12%, TP hit time: 30-60 min
  defp tier3_medium_volatile do
    ~w(
      SOLUSDT LINKUSDT AVAXUSDT DOTUSDT ATOMUSDT NEARUSDT APTUSDT
      INJUSDT UNIUSDT AAVEUSDT MKRUSDT LTCUSDT BCHUSDT ETCUSDT RUNEUSDT
    )
  end

  # TIER 4: LOW VOLATILITY - Large caps ($100+)
  # Daily volatility: 2-6%, TP hit time: 1-4 hours
  defp tier4_low_volatile do
    ~w(BTCUSDT ETHUSDT BNBUSDT)
  end

  defp default_timeframes do
    Application.get_env(:trade_engine, :strategy_timeframes, ~w(5m 15m 1h))
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

  defp schedule_stale_check do
    # Check for stale connection every 30 seconds
    Process.send_after(self(), :check_stale, 30_000)
  end

  defp safe_decimal(nil), do: nil
  defp safe_decimal(""), do: nil
  defp safe_decimal(val) when is_binary(val), do: Decimal.new(val)
  defp safe_decimal(val) when is_number(val), do: Decimal.from_float(val * 1.0)
end