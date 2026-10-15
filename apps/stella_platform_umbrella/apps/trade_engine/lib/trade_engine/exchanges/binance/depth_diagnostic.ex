defmodule TradeEngine.Exchanges.Binance.DepthDiagnostic do
  @moduledoc """
  Diagnostic tool to test Binance depth stream endpoints and find working configurations.
  """

  require Logger

  @doc """
  Test various depth stream configurations to find what works.
  
  ## Usage
  
      iex> DepthDiagnostic.test_all()
      iex> DepthDiagnostic.test_symbol("BTCUSDT")
      iex> DepthDiagnostic.test_combined_stream(["BTCUSDT", "ETHUSDT"])
  """
  def test_all do
    Logger.info("🔍 Starting Binance Depth Stream Diagnostics...")
    
    test_rest_api()
    test_single_stream()
    test_combined_stream(["BTCUSDT", "ETHUSDT"])
    test_all_formats("BTCUSDT")
  end

  @doc """
  Test if REST API works (to verify symbols exist).
  """
  def test_rest_api do
    Logger.info("\n📡 Testing REST API for orderbook...")
    
    url = "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=5"
    
    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        Logger.info("✅ REST API works! Sample response:")
        body |> Jason.decode!() |> Map.take(["lastUpdateId", "bids", "asks"]) |> inspect() |> Logger.info()
        :ok
        
      {:ok, %{status_code: code}} ->
        Logger.error("❌ REST API returned #{code}")
        :error
        
      {:error, reason} ->
        Logger.error("❌ REST API failed: #{inspect(reason)}")
        :error
    end
  end

  @doc """
  Test a single symbol with individual stream (not combined).
  """
  def test_single_stream(symbol \\ "BTCUSDT") do
    Logger.info("\n🔌 Testing SINGLE stream for #{symbol}...")
    
    formats = [
      # Different possible formats
      "wss://stream.binance.com:9443/ws/#{String.downcase(symbol)}@depth",
      "wss://stream.binance.com:9443/ws/#{String.downcase(symbol)}@depth@100ms",
      "wss://stream.binance.com:9443/ws/#{String.downcase(symbol)}@depth5",
      "wss://stream.binance.com:9443/ws/#{String.downcase(symbol)}@depth10",
      "wss://stream.binance.com:9443/ws/#{String.downcase(symbol)}@depth20",
    ]
    
    Enum.each(formats, fn url ->
      Logger.info("  Testing: #{url}")
      test_connection(url, 3000)
    end)
  end

  @doc """
  Test combined stream format.
  """
  def test_combined_stream(symbols) do
    Logger.info("\n🔗 Testing COMBINED stream for #{inspect(symbols)}...")
    
    formats = [
      # Different combined formats
      build_combined_url(symbols, "depth"),
      build_combined_url(symbols, "depth@100ms"),
      build_combined_url(symbols, "depth@1000ms"),
      build_combined_url(symbols, "depth5@100ms"),
      build_combined_url(symbols, "depth10@100ms"),
      build_combined_url(symbols, "depth20@100ms"),
    ]
    
    Enum.each(formats, fn url ->
      Logger.info("  Testing: #{url}")
      test_connection(url, 3000)
    end)
  end

  @doc """
  Test all possible depth formats for a symbol.
  """
  def test_all_formats(symbol) do
    Logger.info("\n📋 Testing ALL formats for #{symbol}...")
    
    s = String.downcase(symbol)
    
    formats = [
      # Partial Book Depth Streams
      "@depth@100ms",
      "@depth@1000ms",
      
      # Diff Depth Stream
      "@depth",
      
      # Top levels (5, 10, 20)
      "@depth5",
      "@depth5@100ms",
      "@depth5@1000ms",
      "@depth10",
      "@depth10@100ms", 
      "@depth10@1000ms",
      "@depth20",
      "@depth20@100ms",
      "@depth20@1000ms",
    ]
    
    # Test single stream endpoint
    Logger.info("\n  🔸 Single stream endpoint (/ws/):")
    Enum.each(formats, fn format ->
      url = "wss://stream.binance.com:9443/ws/#{s}#{format}"
      Logger.info("    #{format}")
      test_connection(url, 2000)
    end)
    
    # Test combined stream endpoint
    Logger.info("\n  🔸 Combined stream endpoint (/stream?streams=):")
    Enum.each(formats, fn format ->
      url = "wss://stream.binance.com:9443/stream?streams=#{s}#{format}"
      Logger.info("    #{format}")
      test_connection(url, 2000)
    end)
  end

  @doc """
  Quick test a specific URL.
  """
  def test_url(url) do
    Logger.info("🔍 Testing: #{url}")
    test_connection(url, 5000)
  end

  # ============================================================================
  # PRIVATE HELPERS
  # ============================================================================

  defp build_combined_url(symbols, suffix) do
    streams = Enum.map(symbols, fn s -> "#{String.downcase(s)}@#{suffix}" end)
    streams_param = Enum.join(streams, "/")
    "wss://stream.binance.com:9443/stream?streams=#{streams_param}"
  end

  defp test_connection(url, timeout_ms) do
    parent = self()
    
    # Spawn a test process
    {:ok, pid} = Task.start(fn ->
      case WebSockex.start_link(url, __MODULE__.TestClient, %{parent: parent, url: url}) do
        {:ok, ws_pid} ->
          # Wait for messages
          receive do
            {:test_result, result} -> 
              send(parent, {:test_done, url, result})
          after
            timeout_ms ->
              send(parent, {:test_done, url, :timeout})
          end
          
          # Cleanup
          if Process.alive?(ws_pid), do: WebSockex.cast(ws_pid, :close)
          
        {:error, reason} ->
          send(parent, {:test_done, url, {:error, reason}})
      end
    end)
    
    # Wait for result
    receive do
      {:test_done, ^url, :timeout} ->
        Logger.warning("    ⏱️  Timeout (no data received)")
        :timeout
        
      {:test_done, ^url, {:error, %WebSockex.RequestError{code: 404}}} ->
        Logger.error("    ❌ 404 Not Found")
        :not_found
        
      {:test_done, ^url, {:error, reason}} ->
        Logger.error("    ❌ Error: #{inspect(reason)}")
        :error
        
      {:test_done, ^url, :success} ->
        Logger.info("    ✅ SUCCESS! Data received")
        :success
    after
      timeout_ms + 1000 ->
        Logger.warning("    ⏱️  Test timeout")
        if Process.alive?(pid), do: Process.exit(pid, :kill)
        :timeout
    end
  end

  # ============================================================================
  # TEST CLIENT MODULE
  # ============================================================================

  defmodule TestClient do
    use WebSockex
    require Logger

    def handle_connect(_conn, state) do
      Logger.debug("    🔗 Connected to #{state.url}")
      {:ok, state}
    end

    def handle_frame({:text, msg}, state) do
      Logger.debug("    📦 Received data!")
      
      # Parse and show sample
      case Jason.decode(msg) do
        {:ok, data} ->
          sample = data |> Map.take(["e", "s", "stream"]) |> inspect()
          Logger.debug("    📋 Sample: #{sample}")
          
        _ ->
          Logger.debug("    📋 Raw: #{String.slice(msg, 0, 100)}")
      end
      
      send(state.parent, {:test_result, :success})
      {:close, state}
    end

    def handle_frame(_frame, state) do
      {:ok, state}
    end

    def handle_disconnect(disconnect_map, state) do
      Logger.debug("    ⚠️  Disconnected: #{inspect(disconnect_map.reason)}")
      send(state.parent, {:test_result, {:error, disconnect_map.reason}})
      {:ok, state}
    end

    def handle_cast(:close, state) do
      {:close, state}
    end
  end
end

# ============================================================================
# CORRECTED DEPTH STREAM (based on diagnostic results)
# ============================================================================

defmodule TradeEngine.Exchanges.Binance.DepthStreamFixed do
  @moduledoc """
  Fixed DepthStream using the CORRECT Binance WebSocket format.
  
  Based on Binance docs:
  - Single stream: wss://stream.binance.com:9443/ws/<streamName>
  - Combined: wss://stream.binance.com:9443/stream?streams=<stream1>/<stream2>
  
  Stream names:
  - <symbol>@depth OR <symbol>@depth@100ms - Partial Book Depth
  - <symbol>@depth<levels>@100ms - Top N levels (5, 10, or 20)
  """

  use WebSockex
  require Logger
  alias TradeEngine.Exchanges.Types.OrderBook

  @heartbeat_interval 25_000
  @orderbook_table :binance_orderbook_cache
  @order_flow_table :binance_order_flow_cache

  def start_link(opts) do
    config = Keyword.fetch!(opts, :config)
    symbols = Keyword.get(opts, :symbols, ["BTCUSDT", "ETHUSDT"])
    tier = Keyword.get(opts, :tier, :tier2)
    name = Keyword.get(opts, :name, __MODULE__)
    
    ensure_ets_tables()
    
    # Build URL using SINGLE STREAM endpoint (not combined)
    # This is more reliable for depth streams
    symbol = List.first(symbols)  # Start with one symbol
    url = build_single_stream_url(symbol, tier, config.testnet)
    
    Logger.info("📊 DepthStream starting for #{symbol}")
    Logger.info("📊 URL: #{url}")
    
    state = %{
      config: config,
      symbol: symbol,
      tier: tier,
      connected: false,
      message_count: 0,
      started_at: DateTime.utc_now()
    }
    
    WebSockex.start_link(url, __MODULE__, state, 
      name: name,
      handle_initial_conn_failure: true
    )
  end

  # Use SINGLE stream endpoint - this is the correct format!
  defp build_single_stream_url(symbol, tier, testnet) do
    base = if testnet, do: "wss://testnet.binance.vision", else: "wss://stream.binance.com:9443"
    
    stream_name = case tier do
      :tier1 -> "#{String.downcase(symbol)}@depth@100ms"
      :tier2 -> "#{String.downcase(symbol)}@depth"  # Default depth stream
      :tier3 -> "#{String.downcase(symbol)}@depth20@1000ms"
    end
    
    "#{base}/ws/#{stream_name}"
  end

  def handle_connect(_conn, state) do
    Logger.info("✅ DepthStream connected for #{state.symbol}")
    {:ok, %{state | connected: true}}
  end

  def handle_disconnect(%{reason: reason}, state) do
    Logger.warning("⚠️ DepthStream disconnected: #{inspect(reason)}")
    {:reconnect, %{state | connected: false}}
  end

  def handle_frame({:text, msg}, state) do
    case Jason.decode(msg) do
      {:ok, data} -> 
        process_message(data, state)
      {:error, _} -> 
        {:ok, state}
    end
  end

  def handle_frame(_, state), do: {:ok, state}

  defp process_message(%{"e" => "depthUpdate", "s" => symbol} = data, state) do
    Logger.info("📦 Depth update for #{symbol}")
    
    new_count = state.message_count + 1
    {:ok, %{state | message_count: new_count}}
  end

  defp process_message(data, state) do
    Logger.debug("📋 Message: #{inspect(Map.keys(data))}")
    {:ok, state}
  end

  defp ensure_ets_tables do
    if :ets.whereis(@orderbook_table) == :undefined do
      :ets.new(@orderbook_table, [:named_table, :public, :set, read_concurrency: true])
    end
    if :ets.whereis(@order_flow_table) == :undefined do
      :ets.new(@order_flow_table, [:named_table, :public, :set, read_concurrency: true])
    end
  end
end