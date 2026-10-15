defmodule TradeEngine.Exchanges.Binance.DepthStream do
  @moduledoc """
  WebSocket stream for real-time order book depth data from Binance.
  
  CORRECT TESTNET ENDPOINTS (per official docs):
  - Base: wss://stream.testnet.binance.vision/ws
  - Single stream: wss://stream.testnet.binance.vision/ws/<streamName>
  - Combined: wss://stream.testnet.binance.vision/stream?streams=<stream1>/<stream2>
  
  MAINNET ENDPOINTS:
  - Base: wss://stream.binance.com:9443/ws
  - Single stream: wss://stream.binance.com:9443/ws/<streamName>
  - Combined: wss://stream.binance.com:9443/stream?streams=<stream1>/<stream2>
  """

  use WebSockex
  require Logger

  alias TradeEngine.Exchanges.Types.OrderBook

  @heartbeat_interval 25_000
  @orderbook_table :binance_orderbook_cache
  @order_flow_table :binance_order_flow_cache

  def start_link(opts) do
    config = Keyword.fetch!(opts, :config)
    symbols = Keyword.get(opts, :symbols, default_symbols())
    tier = Keyword.get(opts, :tier, :tier2)
    name = Keyword.get(opts, :name, __MODULE__)
    
    ensure_ets_tables()
    
    validated_symbols = validate_symbols(symbols)
    
    if Enum.empty?(validated_symbols) do
      Logger.error("❌ No valid symbols provided for DepthStream")
      {:error, :no_valid_symbols}
    else
      # Start with single symbol for simplicity
      symbol = List.first(validated_symbols)
      url = build_url(symbol, tier, config.testnet)
      
      Logger.info("📊 DepthStream (#{tier}) starting for #{symbol}")
      Logger.info("🔗 Connecting to: #{url}")
      
      state = %{
        config: config,
        symbol: symbol,
        tier: tier,
        connected: false,
        message_count: 0,
        started_at: DateTime.utc_now(),
        last_update_id: nil
      }
      
      WebSockex.start_link(url, __MODULE__, state,
        name: name,
        handle_initial_conn_failure: true,
        async: true
      )
    end
  end

  def child_spec(opts) do
    name = Keyword.get(opts, :name, __MODULE__)
    %{
      id: name,
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
            symbol: state.symbol,
            tier: state.tier,
            message_count: state.message_count,
            started_at: state.started_at,
            uptime_seconds: DateTime.diff(DateTime.utc_now(), state.started_at),
            last_update_id: state.last_update_id
          }}
        catch
          _, _ -> {:error, :unavailable}
        end
    end
  end

  def get_orderbook(symbol) do
    case :ets.lookup(@orderbook_table, String.upcase(symbol)) do
      [{_, book}] -> {:ok, book}
      [] -> {:error, :not_found}
    end
  end

  def get_order_flow(symbol) do
    case :ets.lookup(@order_flow_table, String.upcase(symbol)) do
      [{_, flow}] -> {:ok, flow}
      [] -> {:error, :not_found}
    end
  end

  def all_order_flows do
    :ets.tab2list(@order_flow_table) |> Map.new()
  end

  # ============================================================================
  # WEBSOCKEX CALLBACKS
  # ============================================================================

  @impl true
  def handle_connect(_conn, state) do
    Logger.info("✅ DepthStream connected for #{state.symbol}")
    schedule_heartbeat()
    
    # Initialize orderbook snapshot
    Task.start(fn -> initialize_orderbook(state.symbol, state.config.testnet) end)
    
    {:ok, %{state | connected: true}}
  end

  @impl true
  def handle_disconnect(%{reason: reason}, state) do
    Logger.warning("⚠️ DepthStream disconnected: #{inspect(reason)}")
    Process.sleep(5000)
    {:reconnect, %{state | connected: false}}
  end

  @impl true
  def handle_frame({:text, msg}, state) do
    case Jason.decode(msg) do
      {:ok, data} -> handle_message(data, state)
      {:error, reason} -> 
        Logger.error("❌ JSON decode error: #{inspect(reason)}")
        {:ok, state}
    end
  end

  def handle_frame({:ping, data}, state) do
    {:reply, {:pong, data}, state}
  end

  def handle_frame(_frame, state), do: {:ok, state}

  @impl true
  def handle_info(:heartbeat, state) do
    schedule_heartbeat()
    {:ok, state}
  end

  def handle_info(_, state), do: {:ok, state}

  # ============================================================================
  # MESSAGE HANDLING
  # ============================================================================

  defp handle_message(%{"e" => "depthUpdate"} = data, state) do
    process_depth_update(data, state)
  end

  defp handle_message(%{"result" => nil}, state) do
    Logger.debug("✅ Subscription confirmed")
    {:ok, state}
  end

  defp handle_message(data, state) do
    Logger.debug("🔍 Unknown message: #{inspect(Map.keys(data))}")
    {:ok, state}
  end

  defp process_depth_update(%{
    "s" => symbol,
    "U" => first_update_id,
    "u" => final_update_id,
    "b" => bids,
    "a" => asks,
    "E" => event_time
  }, state) do
    
    book = %OrderBook{
      exchange: :binance,
      symbol: symbol,
      bids: parse_levels(bids),
      asks: parse_levels(asks),
      timestamp: DateTime.from_unix!(event_time, :millisecond),
      last_update_id: final_update_id,
      first_update_id: first_update_id
    }
    
    :ets.insert(@orderbook_table, {symbol, book})
    
    order_flow = calculate_order_flow(symbol, book)
    :ets.insert(@order_flow_table, {symbol, order_flow})
    
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "depth:#{symbol}", {:depth, book})
    Phoenix.PubSub.broadcast(TradeEngine.PubSub, "order_flow:#{symbol}", {:order_flow, order_flow})
    
    new_count = state.message_count + 1
    if rem(new_count, 50) == 0 do
      Logger.info("📊 DepthStream: #{new_count} updates for #{symbol}")
    end
    
    {:ok, %{state | message_count: new_count, last_update_id: final_update_id}}
  end

  defp process_depth_update(data, state) do
    Logger.warning("⚠️ Malformed depth update: missing required fields")
    {:ok, state}
  end

  # ============================================================================
  # ORDER FLOW CALCULATIONS
  # ============================================================================

  defp calculate_order_flow(symbol, book) do
    bids = Enum.take(book.bids, 20)
    asks = Enum.take(book.asks, 20)
    
    bid_volume = sum_volume(bids)
    ask_volume = sum_volume(asks)
    total_volume = Decimal.add(bid_volume, ask_volume)
    
    imbalance = if Decimal.gt?(total_volume, Decimal.new(0)) do
      diff = Decimal.sub(bid_volume, ask_volume)
      Decimal.to_float(Decimal.div(diff, total_volume))
    else
      0.0
    end
    
    pressure_ratio = if Decimal.gt?(total_volume, Decimal.new(0)) do
      Decimal.to_float(Decimal.div(bid_volume, total_volume))
    else
      0.5
    end
    
    wall = detect_wall(bids, asks)
    {best_bid, best_ask, spread} = calculate_spread(bids, asks)
    
    %{
      symbol: symbol,
      imbalance: imbalance,
      pressure_ratio: pressure_ratio,
      wall: wall,
      best_bid: best_bid,
      best_ask: best_ask,
      spread: spread,
      bid_volume: bid_volume,
      ask_volume: ask_volume,
      total_volume: total_volume,
      timestamp: DateTime.utc_now()
    }
  end

  defp detect_wall(bids, asks) do
    bid_vol = sum_volume(bids)
    ask_vol = sum_volume(asks)
    
    ratio = if Decimal.gt?(ask_vol, Decimal.new(0)) do
      Decimal.to_float(Decimal.div(bid_vol, ask_vol))
    else
      999.0
    end
    
    cond do
      ratio > 3.0 -> :buy_wall
      ratio < 0.33 -> :sell_wall
      true -> :balanced
    end
  end

  defp calculate_spread([], _), do: {nil, nil, nil}
  defp calculate_spread(_, []), do: {nil, nil, nil}
  defp calculate_spread([{bid_price, _} | _], [{ask_price, _} | _]) do
    spread = Decimal.sub(ask_price, bid_price)
    {bid_price, ask_price, spread}
  end

  defp sum_volume(levels) do
    Enum.reduce(levels, Decimal.new(0), fn {_price, qty}, acc ->
      Decimal.add(acc, qty)
    end)
  end

  # ============================================================================
  # PRIVATE HELPERS
  # ============================================================================

  defp validate_symbols(symbols) do
    symbols
    |> Enum.map(&String.upcase/1)
    |> Enum.filter(&valid_symbol?/1)
  end

  defp valid_symbol?(symbol) do
    String.match?(symbol, ~r/^[A-Z0-9]+$/) and String.length(symbol) >= 6
  end

  defp build_url(symbol, tier, testnet) do
    # CORRECT BASE URLS per official Binance docs
    base = if testnet do
      # Testnet: NO PORT, includes /ws base path
      "wss://stream.testnet.binance.vision"
    else
      # Mainnet: includes port 9443
      "wss://stream.binance.com:9443"
    end
    
    stream_name = case tier do
      :tier1 -> "#{String.downcase(symbol)}@depth20@100ms"
      :tier2 -> "#{String.downcase(symbol)}@depth"
      :tier3 -> "#{String.downcase(symbol)}@depth10@100ms"
    end
    
    # Single stream format: /ws/<streamName>
    "#{base}/ws/#{stream_name}"
  end

  defp parse_levels(levels) when is_list(levels) do
    Enum.map(levels, fn [price, qty] ->
      {Decimal.new(price), Decimal.new(qty)}
    end)
  end
  defp parse_levels(_), do: []

  # ═══════════════════════════════════════════════════════════════════════════════
  # DEPTH STREAM SYMBOLS
  # Order book data is heavier than kline data - prioritize high-volume assets
  # ═══════════════════════════════════════════════════════════════════════════════

  defp default_symbols do
    Application.get_env(:trade_engine, :depth_symbols, priority_depth_symbols())
  end

  # Priority symbols for order flow analysis
  # These have highest volume and most reliable depth data
  defp priority_depth_symbols do
    ~w(
      BTCUSDT ETHUSDT BNBUSDT SOLUSDT XRPUSDT DOGEUSDT ADAUSDT
      PEPEUSDT 1000PEPEUSDT SHIBUSDT 1000SHIBUSDT WIFUSDT
      AVAXUSDT LINKUSDT DOTUSDT LTCUSDT ARBUSDT OPUSDT
      SUIUSDT NEARUSDT APTUSDT INJUSDT ATOMUSDT UNIUSDT
    )
  end

  defp ensure_ets_tables do
    if :ets.whereis(@orderbook_table) == :undefined do
      :ets.new(@orderbook_table, [:named_table, :public, :set, read_concurrency: true])
    end
    if :ets.whereis(@order_flow_table) == :undefined do
      :ets.new(@order_flow_table, [:named_table, :public, :set, read_concurrency: true])
    end
  end

  defp schedule_heartbeat do
    Process.send_after(self(), :heartbeat, @heartbeat_interval)
  end

  defp initialize_orderbook(symbol, testnet) do
    base_url = if testnet do
      "https://testnet.binance.vision"
    else
      "https://api.binance.com"
    end
    
    url = "#{base_url}/api/v3/depth?symbol=#{symbol}&limit=100"
    
    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"lastUpdateId" => last_id, "bids" => bids, "asks" => asks}} ->
            book = %OrderBook{
              exchange: :binance,
              symbol: symbol,
              bids: parse_levels(bids),
              asks: parse_levels(asks),
              timestamp: DateTime.utc_now(),
              last_update_id: last_id
            }
            
            :ets.insert(@orderbook_table, {symbol, book})
            Logger.info("📚 Initialized orderbook for #{symbol}")
            
          {:error, reason} ->
            Logger.error("❌ Failed to parse orderbook: #{inspect(reason)}")
        end
        
      {:error, reason} ->
        Logger.error("❌ Failed to fetch orderbook: #{inspect(reason)}")
    end
  end
end
