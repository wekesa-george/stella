defmodule TradeEngine.MarketData.Fetcher do
  use GenServer
  require Logger
  
  alias TradeEngine.MarketData.{CoinGeckoClient, History, OrderBook, BreakoutDetector, BinanceExchange, BinanceStream}
  alias TradeEngine.Strategy.MultiTimeframe
  alias TradeEngine.MarketData.Prediction
  alias TradeEngine.Repo

  @interval 60_000  # Analyze every 60 seconds (Backup polling)
  @pairs_refresh_interval 3_600_000  # Refresh pair list every hour
  @pubsub_topic "market_data:updates"
  @max_pairs 100  # Limit to top 100 pairs by volume for performance
  @use_testnet true
  @task_timeout 8000  # 8 second timeout per task

  def start_link(_opts), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  @impl true
  def init(state) do
    Logger.info("🚀 TradeEngine Fetcher STARTED. Fetching dynamic pairs...")
    
    # 1. Fetch initial pairs
    initial_state = do_refresh_pairs(state)
    
    # 2. Subscribe to internal PubSub for WebSocket updates
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, @pubsub_topic)
    
    # 3. Start Binance Stream for these pairs
    pairs = Map.get(initial_state, :trading_pairs, [])
    if length(pairs) > 0 do
      start_websocket_stream(pairs)
    end

    # 4. Schedule recurring tasks (Backup & Refresh)
    Process.send_after(self(), :tick, @interval)
    Process.send_after(self(), :refresh_pairs, @pairs_refresh_interval)
    
    {:ok, initial_state}
  end

  @impl true
  def handle_info(:refresh_pairs, state) do
    Logger.info("\n🔄 REFRESHING TRADING PAIRS (every hour)...")
    new_state = do_refresh_pairs(state)
    
    # Update WebSocket subscription with new pairs
    pairs = Map.get(new_state, :trading_pairs, [])
    if length(pairs) > 0 do
      start_websocket_stream(pairs)
    end
    
    Process.send_after(self(), :refresh_pairs, @pairs_refresh_interval)
    {:noreply, new_state}
  end

  @impl true
  def handle_info(:tick, state) do
    # Backup polling / Heartbeat
    Process.send_after(self(), :tick, @interval)
    {:noreply, state}
  end

  # ✅ NEW: Handle Real-time Ticker Updates from WebSocket
  @impl true
  def handle_info({:binance_ticker, payload}, state) do
    # Run analysis asynchronously to not block the GenServer
    Task.start(fn -> 
      analyze_mtf_safe(payload.symbol)
    end)
    {:noreply, state}
  end

  # Ignore other PubSub messages
  @impl true
  def handle_info({:physics_update, _}, state), do: {:noreply, state}

  @impl true
  def handle_info({_ref, _result}, state), do: {:noreply, state}

  @impl true
  def handle_info({:DOWN, _ref, :process, _pid, _reason}, state), do: {:noreply, state}

  # ========== HELPERS ==========

  defp start_websocket_stream(pairs) do
    # Convert symbols to Binance stream format (lowercase)
    streams = Enum.map(pairs, fn symbol -> 
      "#{String.downcase(symbol)}@miniTicker"
    end)
    
    # Subscribe via the BinanceStream process
    # Note: In a real app, we might want to batch these or use a dynamic supervisor
    # for multiple connections if we exceed 1024 streams.
    BinanceStream.subscribe(streams)
  end

  defp do_refresh_pairs(state) do
    Logger.info("🔍 Calling BinanceExchange.get_top_pairs(#{@max_pairs}, #{@use_testnet})...")
    
    case BinanceExchange.get_top_pairs(@max_pairs, @use_testnet) do
      pairs when is_list(pairs) and pairs != [] ->
        pair_symbols = Enum.map(pairs, & &1.symbol)
        Map.put(state, :trading_pairs, pair_symbols)
      
      _ -> 
        Logger.error("❌ PAIR REFRESH FAILED")
        state
    end
  rescue
    e ->
      Logger.error("❌ PAIR REFRESH EXCEPTION: #{inspect(e)}")
      state
  end

  # ========== ANALYSIS CORE (Unchanged logic, just called differently) ==========

  defp analyze_mtf_safe(symbol) do
    try do
      analyze_mtf(symbol)
    rescue
      e -> Logger.debug("⚠️ Error analyzing #{symbol}: #{inspect(e)}")
    end
  end

  defp analyze_mtf(symbol) do
    # 1. Fetch Order Book (Still REST for now, could be upgraded later)
    book_data = case OrderBook.fetch_depth(symbol) do
      {:ok, data} -> data
      _ -> nil
    end

    # 2. Run Multi-Timeframe Analysis
    mtf_result = MultiTimeframe.analyze_alignment(symbol, "binance", nil, book_data)

    # 3. Process Result
    case mtf_result do
      {:ok, signal} ->
        if signal.confidence > 0.3 do
          log_multiframe_status(symbol, signal, book_data)
          save_mtf_prediction(symbol, signal)
          broadcast_mtf(symbol, signal)
        end
        
        # 4. Run Breakout Detection
        liquidity_pct = if book_data, do: book_data.imbalance_ratio * 100, else: 50.0
        run_breakout_check(symbol, signal, liquidity_pct)

      {:error, _reason} -> :ok
    end
  end

  defp run_breakout_check(symbol, signal, liquidity_pct) do
    detector_details = signal.details
    case BreakoutDetector.check_breakout(symbol, detector_details, liquidity_pct) do
      {:breakout, details} ->
        Logger.warning("🔥 BREAKOUT SIGNAL: #{symbol} (#{details.strength})")
      _ -> :ok
    end
  end

  # --- Logging & Persistence (Simplified for brevity, logic remains same) ---

  defp log_multiframe_status(symbol, signal, _book) do
    # Only log very strong signals to avoid spamming logs with WS speed
    if signal.strength == :very_strong or signal.strength == :strong do
      Logger.info("✅ #{symbol} [#{signal.direction}] Conf: #{Float.round(signal.confidence * 100, 1)}%")
    end
  end

  defp save_mtf_prediction(symbol, signal) do
    # Implementation same as before
    trigger_detail = List.first(signal.details)
    if trigger_detail do
      attrs = %{
        run_id: Ecto.UUID.generate(),
        exchange: "binance",
        symbol: symbol,
        model_type: "mtf_v2_ws",
        prediction_timestamp: DateTime.utc_now(),
        target_timestamp: DateTime.add(DateTime.utc_now(), 300, :second),
        p0: Decimal.from_float(trigger_detail.velocity),
        v0: trigger_detail.velocity,
        acceleration: trigger_detail.acceleration,
        r_squared: signal.confidence,
        predicted_signal: Atom.to_string(signal.direction),
        confidence: signal.confidence,
        predicted_peak_price: Decimal.from_float(Map.get(trigger_detail.targets, :t_30m, 0.0)),
        predicted_dip_price: Decimal.from_float(Map.get(trigger_detail.targets, :t_5m, 0.0)),
        pressure_ratio: trigger_detail.pressure_ratio,
        order_flow_delta: 0.0
      }
      Repo.insert(Prediction.changeset(%Prediction{}, attrs))
    end
  end

  defp broadcast_mtf(symbol, signal) do
    trigger_detail = List.first(signal.details)
    if trigger_detail do
      payload = %{
        symbol: symbol,
        signal_direction: signal.direction,
        signal_strength: signal.strength,
        confidence: Float.round(signal.confidence * 100, 2),
        price: extract_price(signal.current_price),
        velocity: trigger_detail.velocity,
        acceleration: trigger_detail.acceleration,
        timestamp: DateTime.utc_now()
      }
      
      Phoenix.PubSub.broadcast(
        TradeEngine.PubSub, 
        @pubsub_topic, 
        {:physics_update, payload}
      )
    end
  end

  defp extract_price(nil), do: 0.0
  defp extract_price(p) when is_number(p), do: p
  defp extract_price(_), do: 0.0
end