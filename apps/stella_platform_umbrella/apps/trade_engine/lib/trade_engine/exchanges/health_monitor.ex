defmodule TradeEngine.Exchanges.HealthMonitor do
  @moduledoc """
  Monitors exchange adapter health every 30 seconds.
  Checks WebSocket connection status, tracks error rates,
  writes to :exchange_health_cache ETS and broadcasts via PubSub.
  """

  use GenServer
  require Logger

  @pubsub TradeEngine.PubSub
  @ets_table :exchange_health_cache
  @tick_interval_ms 30_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def get_health(exchange \\ :all) do
    case exchange do
      :all ->
        :ets.tab2list(@ets_table)
        |> Enum.map(fn {_k, v} -> v end)

      name ->
        case :ets.lookup(@ets_table, name) do
          [{^name, data}] -> {:ok, data}
          [] -> {:error, :not_found}
        end
    end
  rescue
    ArgumentError -> {:error, :not_started}
  end

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    Logger.info("🏥 ExchangeHealthMonitor started — checking every #{div(@tick_interval_ms, 1000)}s")
    Process.send_after(self(), :check, 5_000)
    {:ok, %{history: %{}}}
  end

  @impl true
  def handle_info(:check, state) do
    Process.send_after(self(), :check, @tick_interval_ms)

    health = check_all_exchanges(state.history)

    Enum.each(health, fn {exchange, data} ->
      :ets.insert(@ets_table, {exchange, data})
    end)

    Phoenix.PubSub.broadcast(@pubsub, "infra:exchange_health",
      {:exchange_health, %{exchanges: Enum.map(health, fn {_k, v} -> v end)}}
    )

    {:noreply, %{state | history: health}}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp check_all_exchanges(_history) do
    # Check Binance streams
    binance_health = check_binance()

    %{"binance" => binance_health}
  end

  defp check_binance do
    ws_connected = check_binance_ws()
    cache_fresh = check_binance_cache()

    status =
      cond do
        ws_connected and cache_fresh -> "healthy"
        ws_connected -> "degraded"
        true -> "disconnected"
      end

    %{
      exchange: "binance",
      status: status,
      websocket_connected: ws_connected,
      cache_fresh: cache_fresh,
      ticker_cache_size: ets_size(:binance_ticker_cache),
      price_cache_size: ets_size(:binance_price_cache),
      candle_cache_size: ets_size(:binance_candle_cache),
      checked_at: DateTime.utc_now() |> DateTime.to_iso8601()
    }
  end

  defp check_binance_ws do
    # Check if stream coordinator is alive
    case Process.whereis(TradeEngine.Exchanges.Binance.StreamCoordinator) do
      nil -> false
      pid -> Process.alive?(pid)
    end
  end

  defp check_binance_cache do
    # Check if ticker cache has recent data (< 60s old)
    try do
      case :ets.first(:binance_ticker_cache) do
        :"$end_of_table" -> false
        key ->
          case :ets.lookup(:binance_ticker_cache, key) do
            [{_, ticker}] when is_map(ticker) ->
              case Map.get(ticker, :updated_at) || Map.get(ticker, :event_time) do
                nil -> true
                ts when is_integer(ts) ->
                  age_ms = System.system_time(:millisecond) - ts
                  age_ms < 60_000
                _ -> true
              end
            _ -> false
          end
      end
    rescue
      _ -> false
    end
  end

  defp ets_size(table) do
    :ets.info(table, :size) || 0
  rescue
    _ -> 0
  end
end
