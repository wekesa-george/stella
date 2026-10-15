defmodule TradeEngine.Exchanges.Binance.TickerStream do
  @moduledoc """
  WebSocket stream for real-time ticker data from Binance.
  
  Critical fixes:
  1. Proper ping/pong frame handling (no nested frames)
  2. Intelligent backoff with connection health tracking
  3. Testnet-specific rate limit handling
  """

  use WebSockex
  require Logger

  alias TradeEngine.Exchanges.Binance.{Config, CacheManager}
  alias TradeEngine.Exchanges.Types.Ticker

  # Testnet-optimized intervals
  @stable_connection_threshold 120_000  # 2 minutes to be considered stable
  @health_check_interval 90_000  # Check health every 90s
  @server_ping_timeout 120_000  # If no server ping in 2min, connection may be dead

  # ============================================================================
  # CLIENT API
  # ============================================================================

  def start_link(opts) do
    config = Keyword.fetch!(opts, :config)
    symbols = Keyword.get(opts, :symbols, default_symbols())
    
    url = build_url(config, symbols)
    Logger.info("🔌 TickerStream connecting to: #{url}")
    
    state = %{
      config: config,
      symbols: symbols,
      connected: false,
      last_message: nil,
      message_count: 0,
      started_at: DateTime.utc_now(),
      reconnect_attempts: 0,
      last_connect_time: nil,
      connection_stable: false,
      last_pong: nil,
      ping_ref: nil,
      consecutive_failures: 0
    }
    
    WebSockex.start_link(
      url, 
      __MODULE__, 
      state,
      name: __MODULE__,
      handle_initial_conn_failure: true,
      async: true,
      extra_headers: [{"User-Agent", "TradeEngine/1.0"}],
      # Don't let WebSockex handle pings automatically - we do it manually
      insecure: true
    )
  end

  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]},
      restart: :permanent,
      type: :worker
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
            message_count: state.message_count,
            last_message: state.last_message,
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

  def get_price(symbol) do
    case CacheManager.get_ticker(symbol) do
      {:ok, ticker} -> {:ok, ticker.price}
      error -> error
    end
  end

  def get_ticker(symbol) do
    CacheManager.get_ticker(symbol)
  end

  # ============================================================================
  # WEBSOCKEX CALLBACKS
  # ============================================================================

  @impl true
  def handle_connect(_conn, state) do
    Logger.info("✅ TickerStream connected")
    
    # Start health monitoring (no active pings, passive only)
    schedule_health_check()
    
    {:ok, %{state | 
      connected: true, 
      reconnect_attempts: 0,
      last_connect_time: DateTime.utc_now(),
      connection_stable: false,
      last_pong: DateTime.utc_now(),  # Consider initial connection as "activity"
      consecutive_failures: 0,
      ping_ref: nil
    }}
  end

  @impl true
  def handle_disconnect(disconnect_map, state) do
    Logger.warning("⚠️ TickerStream disconnected: #{inspect(disconnect_map, limit: :infinity)}")
    
    # Calculate connection duration
    connection_duration = if state.last_connect_time do
      DateTime.diff(DateTime.utc_now(), state.last_connect_time, :millisecond)
    else
      0
    end
    
    was_stable = connection_duration >= @stable_connection_threshold
    
    # Analyze disconnect reason
    {is_rate_limited, is_protocol_error} = analyze_disconnect(disconnect_map)
    
    # Calculate backoff
    {delay, new_attempts, new_failures} = calculate_reconnect_strategy(
      state.reconnect_attempts,
      state.consecutive_failures,
      was_stable,
      is_rate_limited,
      is_protocol_error
    )
    
    log_reconnect_strategy(delay, new_attempts, new_failures, was_stable, is_rate_limited, is_protocol_error)
    
    # Schedule reconnect
    Process.send_after(self(), {:reconnect, delay}, delay)
    
    {:ok, %{state | 
      connected: false, 
      reconnect_attempts: new_attempts,
      consecutive_failures: new_failures,
      connection_stable: false,
      ping_ref: nil
    }}
  end

  @impl true
  def handle_frame({:text, msg}, state) do
    case Jason.decode(msg) do
      {:ok, data} ->
        handle_message(data, state)
      {:error, _} ->
        Logger.warning("Failed to decode ticker message")
        {:ok, state}
    end
  end

  # CRITICAL FIX: Handle incoming ping from server
  def handle_frame({:ping, data}, state) do
    Logger.debug("📥 Server ping received")
    # Respond with pong and update last activity time
    {:reply, {:pong, data}, %{state | last_pong: DateTime.utc_now()}}
  end

  # Handle incoming pong from server (shouldn't happen since we don't send pings)
  def handle_frame({:pong, _data}, state) do
    Logger.debug("📥 Unexpected server pong received")
    {:ok, %{state | last_pong: DateTime.utc_now()}}
  end

  def handle_frame(frame, state) do
    Logger.debug("Unknown frame type: #{inspect(frame)}")
    {:ok, state}
  end

  @impl true
  def handle_info(:health_check, state) do
    if state.connected do
      # Track last server activity (either ping or data)
      last_activity = [state.last_pong, state.last_message]
        |> Enum.reject(&is_nil/1)
        |> Enum.max(DateTime, fn -> nil end)
      
      last_activity_age = if last_activity do
        DateTime.diff(DateTime.utc_now(), last_activity, :millisecond)
      else
        999_999
      end
      
      connection_age = if state.last_connect_time do
        DateTime.diff(DateTime.utc_now(), state.last_connect_time, :second)
      else
        0
      end
      
      # Mark as stable if running for threshold duration
      new_stable = connection_age >= div(@stable_connection_threshold, 1000)
      
      if new_stable and not state.connection_stable do
        Logger.info("✅ Connection marked stable after #{connection_age}s")
      end
      
      # Warn if no activity for a long time
      if last_activity_age > @server_ping_timeout do
        Logger.warning("⚠️ No server activity in #{div(last_activity_age, 1000)}s - connection may be stale")
      else
        Logger.debug("🏥 Health: msgs=#{state.message_count}, uptime=#{connection_age}s, stable=#{new_stable}, last_activity=#{div(last_activity_age, 1000)}s ago")
      end
      
      schedule_health_check()
      {:ok, %{state | connection_stable: new_stable}}
    else
      {:ok, state}
    end
  end

  def handle_info({:reconnect, _delay}, state) do
    Logger.info("🔄 Initiating reconnection...")
    {:reconnect, state}
  end

  def handle_info(_msg, state), do: {:ok, state}

  # REMOVED: handle_ping and handle_pong callbacks
  # These are handled in handle_frame instead to avoid nested frames

  # ============================================================================
  # MESSAGE HANDLING
  # ============================================================================

  defp handle_message(data, state) when is_list(data) do
    Enum.each(data, &process_ticker/1)
    new_count = state.message_count + length(data)
    {:ok, %{state | last_message: DateTime.utc_now(), message_count: new_count}}
  end

  defp handle_message(%{"e" => "24hrMiniTicker"} = data, state) do
    process_ticker(data)
    new_count = state.message_count + 1
    
    if rem(new_count, 500) == 0 do
      Logger.info("📊 Processed #{new_count} ticker updates")
    end
    
    {:ok, %{state | last_message: DateTime.utc_now(), message_count: new_count}}
  end

  defp handle_message(%{"e" => "24hrTicker"} = data, state) do
    process_full_ticker(data)
    {:ok, %{state | last_message: DateTime.utc_now(), message_count: state.message_count + 1}}
  end

  defp handle_message(%{"stream" => _, "data" => data}, state) do
    handle_message(data, state)
  end

  defp handle_message(%{"result" => nil, "id" => _}, state) do
    Logger.debug("Subscription confirmed")
    {:ok, state}
  end

  defp handle_message(data, state) do
    Logger.debug("Unknown ticker message: #{inspect(data)}")
    {:ok, state}
  end

  defp process_ticker(%{"s" => symbol, "c" => close, "o" => open, "h" => high, "l" => low, "v" => volume, "q" => quote_vol} = data) do
    ticker = %Ticker{
      exchange: :binance,
      symbol: symbol,
      price: Decimal.new(close),
      open_24h: Decimal.new(open),
      high_24h: Decimal.new(high),
      low_24h: Decimal.new(low),
      volume_24h: Decimal.new(volume),
      quote_volume_24h: Decimal.new(quote_vol),
      timestamp: DateTime.from_unix!(data["E"] || System.system_time(:millisecond), :millisecond)
    }
    
    CacheManager.put_ticker(symbol, ticker)
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "ticker:#{symbol}", {:ticker, ticker})
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "ticker:all", {:ticker, ticker})
  end

  defp process_ticker(_), do: :ok

  defp process_full_ticker(%{"s" => symbol} = data) do
    ticker = %Ticker{
      exchange: :binance,
      symbol: symbol,
      price: Decimal.new(data["c"]),
      bid: safe_decimal(data["b"]),
      bid_qty: safe_decimal(data["B"]),
      ask: safe_decimal(data["a"]),
      ask_qty: safe_decimal(data["A"]),
      open_24h: Decimal.new(data["o"]),
      high_24h: Decimal.new(data["h"]),
      low_24h: Decimal.new(data["l"]),
      volume_24h: Decimal.new(data["v"]),
      quote_volume_24h: Decimal.new(data["q"]),
      price_change_24h: safe_decimal(data["p"]),
      price_change_percent_24h: safe_decimal(data["P"]),
      timestamp: DateTime.from_unix!(data["E"] || System.system_time(:millisecond), :millisecond)
    }
    
    CacheManager.put_ticker(symbol, ticker)
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "ticker:#{symbol}", {:ticker, ticker})
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "ticker:all", {:ticker, ticker})
  end

  # ============================================================================
  # PRIVATE HELPERS
  # ============================================================================

  defp analyze_disconnect(disconnect_map) do
    is_rate_limited = case disconnect_map do
      %{reason: {:remote, 1008, msg}} when is_binary(msg) ->
        String.contains?(msg, "Too many requests")
      _ -> false
    end
    
    is_protocol_error = case disconnect_map do
      %{reason: {:error, %WebSockex.InvalidFrameError{}}} -> true
      _ -> false
    end
    
    {is_rate_limited, is_protocol_error}
  end

  defp calculate_reconnect_strategy(attempts, failures, was_stable, is_rate_limited, is_protocol_error) do
    cond do
      # Protocol errors are code bugs - aggressive backoff
      is_protocol_error ->
        new_failures = failures + 1
        delay = min(10_000 * new_failures, 120_000)  # 10s -> 120s max
        {delay, attempts + 1, new_failures}
      
      # Rate limited - exponential backoff with jitter
      is_rate_limited ->
        new_attempts = if was_stable, do: 1, else: attempts + 1
        base_delay = min(5000 * :math.pow(2, new_attempts - 1), 60_000) |> round()
        jitter = :rand.uniform(2000)  # Add 0-2s jitter
        delay = base_delay + jitter
        {delay, new_attempts, 0}
      
      # Stable connection died normally - quick reconnect
      was_stable ->
        {2000, 1, 0}
      
      # Unstable connection - moderate backoff
      true ->
        new_attempts = attempts + 1
        delay = min(new_attempts * 3000, 15_000)
        {delay, new_attempts, 0}
    end
  end

  defp log_reconnect_strategy(delay, attempts, failures, was_stable, is_rate_limited, is_protocol_error) do
    reason = cond do
      is_protocol_error -> "protocol error (likely code bug)"
      is_rate_limited -> "rate limit"
      was_stable -> "stable connection dropped"
      true -> "unstable connection"
    end
    
    Logger.warning("🔄 Reconnect in #{delay}ms due to #{reason} (attempt: #{attempts}, failures: #{failures})")
  end

  defp build_url(config, symbols) do
    base = config.ws_base_url
    is_testnet = config.testnet || String.contains?(base, "testnet")
    
    if is_testnet do
      # Testnet: individual streams
      streams = symbols
        |> Enum.map(fn s -> "#{String.downcase(s)}@miniTicker" end)
        |> Enum.join("/")
      
      url = "wss://stream.testnet.binance.vision/stream?streams=#{streams}"
      Logger.debug("TickerStream testnet URL: #{url}")
      url
    else
      # Mainnet: combined stream
      base_clean = String.trim_trailing(base, "/")
      
      if String.ends_with?(base_clean, "/ws") do
        "#{base_clean}/!miniTicker@arr"
      else
        "#{base_clean}/ws/!miniTicker@arr"
      end
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # VOLATILITY-TIERED ASSET LIST (for real-time price updates)
  # Ticker data is lightweight - include all assets
  # ═══════════════════════════════════════════════════════════════════════════════

  defp default_symbols do
    Application.get_env(:trade_engine, :tracked_symbols, all_tier_symbols())
  end

  defp all_tier_symbols do
    # TIER 1: Ultra-volatile meme coins
    tier1 = ~w(PEPEUSDT 1000PEPEUSDT SHIBUSDT 1000SHIBUSDT FLOKIUSDT 1000FLOKIUSDT
               BONKUSDT 1000BONKUSDT LUNCUSDT 1000LUNCUSDT BTTCUSDT HOTUSDT
               WIFUSDT MEMEUSDT PEOPLEUSDT)
    
    # TIER 2: High-volatile small caps
    tier2 = ~w(DOGEUSDT XRPUSDT ADAUSDT TRXUSDT VETUSDT ALGOUSDT XLMUSDT
               ICPUSDT FILUSDT GALAUSDT SANDUSDT MANAUSDT APEUSDT CRVUSDT
               LDOUSDT ARBUSDT OPUSDT SUIUSDT SEIUSDT TIAUSDT)
    
    # TIER 3: Medium-volatile mid caps
    tier3 = ~w(SOLUSDT LINKUSDT AVAXUSDT DOTUSDT ATOMUSDT NEARUSDT APTUSDT
               INJUSDT UNIUSDT AAVEUSDT MKRUSDT LTCUSDT BCHUSDT ETCUSDT RUNEUSDT)
    
    # TIER 4: Low-volatile large caps
    tier4 = ~w(BTCUSDT ETHUSDT BNBUSDT)
    
    tier1 ++ tier2 ++ tier3 ++ tier4
  end

  defp schedule_health_check do
    Process.send_after(self(), :health_check, @health_check_interval)
  end

  defp safe_decimal(nil), do: nil
  defp safe_decimal(""), do: nil
  defp safe_decimal(val), do: Decimal.new(val)
end