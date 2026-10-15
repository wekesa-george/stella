defmodule StellaAdmin.Binance.WebSocket do
  @moduledoc """
  WebSocket client for Binance real-time market data streams.
  Connects to Binance WebSocket API and streams live price updates.
  """
  use GenServer
  require Logger

  alias StellaAdmin.Binance.Cache

  @base_url "wss://stream.binance.com:9443/ws"
  @reconnect_interval 5_000
  @ping_interval 30_000

  defmodule State do
    @moduledoc false
    defstruct [
      :conn,
      :pairs,
      :reconnect_timer,
      :ping_timer,
      :stream_name
    ]
  end

  # Client API

  def start_link(opts) do
    pairs = Keyword.get(opts, :pairs, [])
    GenServer.start_link(__MODULE__, pairs, name: __MODULE__)
  end

  @doc """
  Subscribe to additional trading pairs.
  """
  def subscribe(pairs) when is_list(pairs) do
    GenServer.cast(__MODULE__, {:subscribe, pairs})
  end

  @doc """
  Get connection status.
  """
  def status do
    GenServer.call(__MODULE__, :status)
  end

  # Server Callbacks

  @impl true
  def init(pairs) do
    # Start connection after init
    send(self(), :connect)

    {:ok, %State{pairs: normalize_pairs(pairs)}}
  end

  @impl true
  def handle_info(:connect, state) do
    case connect(state.pairs) do
      {:ok, conn, stream_name} ->
        Logger.info("Connected to Binance WebSocket: #{stream_name}")

        # Schedule ping
        ping_timer = Process.send_after(self(), :ping, @ping_interval)

        {:noreply, %{state | conn: conn, stream_name: stream_name, ping_timer: ping_timer}}

      {:error, reason} ->
        Logger.error("Failed to connect to Binance WebSocket: #{inspect(reason)}")
        schedule_reconnect()
        {:noreply, state}
    end
  end

  @impl true
  def handle_info(:reconnect, state) do
    Logger.info("Attempting to reconnect to Binance WebSocket...")
    send(self(), :connect)
    {:noreply, %{state | conn: nil}}
  end

  @impl true
  def handle_info(:ping, %{conn: conn} = state) when not is_nil(conn) do
    # Send ping frame
    WebSockex.send_frame(conn, :ping)

    # Schedule next ping
    ping_timer = Process.send_after(self(), :ping, @ping_interval)

    {:noreply, %{state | ping_timer: ping_timer}}
  end

  @impl true
  def handle_info(:ping, state) do
    # No connection, skip ping
    {:noreply, state}
  end

  @impl true
  def handle_info({:websocket, data}, state) do
    handle_message(data, state)
  end

  @impl true
  def handle_cast({:subscribe, new_pairs}, state) do
    all_pairs = Enum.uniq(state.pairs ++ normalize_pairs(new_pairs))

    # Reconnect with new pairs
    if state.conn do
      WebSockex.cast(state.conn, :close)
    end

    send(self(), :connect)

    {:noreply, %{state | pairs: all_pairs}}
  end

  @impl true
  def handle_call(:status, _from, state) do
    status = %{
      connected: !is_nil(state.conn),
      pairs: state.pairs,
      stream: state.stream_name
    }

    {:reply, status, state}
  end

  # Private Functions

  defp connect(pairs) when length(pairs) > 0 do
    # Build stream name for multiple pairs
    # Format: btcusdt@ticker/ethusdt@ticker
    stream_name =
      pairs
      |> Enum.map(&String.downcase/1)
      |> Enum.map(&"#{&1}@ticker")
      |> Enum.join("/")

    url = "#{@base_url}/#{stream_name}"

    case WebSockex.start_link(url, __MODULE__.Handler, self()) do
      {:ok, conn} -> {:ok, conn, stream_name}
      error -> error
    end
  end

  defp connect(_pairs) do
    {:error, :no_pairs}
  end

  defp normalize_pairs(pairs) do
    Enum.map(pairs, fn pair ->
      pair
      |> String.upcase()
      |> String.replace("/", "")
    end)
  end

  defp handle_message(data, state) do
    case Jason.decode(data) do
      {:ok, %{"e" => "24hrTicker"} = ticker} ->
        process_ticker(ticker)
        {:noreply, state}

      {:ok, _other} ->
        {:noreply, state}

      {:error, reason} ->
        Logger.warning("Failed to decode WebSocket message: #{inspect(reason)}")
        {:noreply, state}
    end
  end

  defp process_ticker(ticker) do
    %{
      "s" => symbol,
      "c" => last_price,
      "P" => price_change_percent,
      "E" => event_time
    } = ticker

    case Float.parse(last_price) do
      {price, _} ->
        {change_percent, _} = Float.parse(price_change_percent)

        Cache.update_price(symbol, price,
          timestamp: event_time,
          change_24h: change_percent
        )

      :error ->
        Logger.warning("Invalid price format: #{last_price}")
    end
  end

  defp schedule_reconnect do
    Process.send_after(self(), :reconnect, @reconnect_interval)
  end

  # WebSocket Handler Module
  defmodule Handler do
    @moduledoc false
    use WebSockex
    require Logger

    def handle_frame({:text, msg}, parent_pid) do
      send(parent_pid, {:websocket, msg})
      {:ok, parent_pid}
    end

    def handle_frame({:binary, msg}, parent_pid) do
      send(parent_pid, {:websocket, msg})
      {:ok, parent_pid}
    end

    def handle_frame(:ping, parent_pid) do
      {:reply, :pong, parent_pid}
    end

    def handle_frame(:pong, parent_pid) do
      {:ok, parent_pid}
    end

    def handle_frame(_frame, parent_pid) do
      {:ok, parent_pid}
    end

    def handle_disconnect(%{reason: reason}, parent_pid) do
      Logger.warning("WebSocket disconnected: #{inspect(reason)}")
      send(parent_pid, :reconnect)
      {:ok, parent_pid}
    end

    def handle_cast(:close, parent_pid) do
      {:close, parent_pid}
    end
  end
end
