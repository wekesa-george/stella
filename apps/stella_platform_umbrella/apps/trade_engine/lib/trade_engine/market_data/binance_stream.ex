defmodule TradeEngine.MarketData.BinanceStream do
  use WebSockex
  require Logger
  alias TradeEngine.Repo

  @stream_endpoint "wss://stream.binance.com:9443/ws"
  @pubsub_topic "market_data:updates"

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    # Start with a default stream or empty
    initial_streams = opts[:streams] || ["!miniTicker@arr"]
    url = "#{@stream_endpoint}/#{Enum.join(initial_streams, "/")}"
    
    Logger.info("🔌 Connecting to Binance WebSocket: #{url}")
    WebSockex.start_link(url, __MODULE__, %{streams: initial_streams}, name: __MODULE__)
  end

  def subscribe(streams) when is_list(streams) do
    payload = %{
      method: "SUBSCRIBE",
      params: streams,
      id: System.unique_integer([:positive])
    }
    WebSockex.cast(__MODULE__, {:send, payload})
  end

  # ============================================================================
  # CALLBACKS
  # ============================================================================

  @impl true
  def handle_connect(_conn, state) do
    Logger.info("✅ Connected to Binance WebSocket")
    {:ok, state}
  end

  @impl true
  def handle_disconnect(%{reason: reason}, state) do
    Logger.warning("⚠️ Disconnected from Binance WebSocket: #{inspect(reason)}")
    {:ok, state}
  end

  @impl true
  def handle_frame({:text, msg}, state) do
    case Jason.decode(msg) do
      {:ok, data} -> 
        process_message(data)
      {:error, _} -> 
        Logger.debug("❌ Failed to decode WS message")
    end
    {:ok, state}
  end

  @impl true
  def handle_cast({:send, payload}, state) do
    {:reply, {:text, Jason.encode!(payload)}, state}
  end

  @impl true
  def terminate(reason, _state) do
    Logger.error("❌ BinanceStream Terminating: #{inspect(reason)}")
    exit(reason)
  end

  # ============================================================================
  # MESSAGE PROCESSING
  # ============================================================================

  defp process_message(data) when is_list(data) do
    # Handle array of mini-tickers (!miniTicker@arr)
    Enum.each(data, &process_single_ticker/1)
  end

  defp process_message(%{"e" => "24hrMiniTicker"} = data) do
    process_single_ticker(data)
  end

  defp process_message(_other), do: :ok

  defp process_single_ticker(%{"s" => symbol, "c" => close_price, "E" => event_time}) do
    # Only process USDT pairs to reduce noise
    if String.ends_with?(symbol, "USDT") do
      price = parse_float(close_price)
      
      payload = %{
        symbol: symbol,
        price: price,
        timestamp: DateTime.from_unix!(event_time, :millisecond)
      }

      # Broadcast to internal PubSub for Fetcher and Channels
      Phoenix.PubSub.broadcast(
        TradeEngine.PubSub,
        @pubsub_topic,
        {:binance_ticker, payload}
      )
    end
  end

  defp parse_float(val) when is_binary(val), do: String.to_float(val)
  defp parse_float(val) when is_number(val), do: val / 1.0
  defp parse_float(_), do: 0.0
end
