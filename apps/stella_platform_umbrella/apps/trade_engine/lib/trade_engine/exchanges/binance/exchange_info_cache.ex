defmodule TradeEngine.Exchanges.Binance.ExchangeInfoCache do
  @moduledoc """
  Persistent ETS cache for Binance exchange info (symbol filters, precisions).

  Refreshes every 6 hours from the Binance exchangeInfo endpoint.
  Provides instant lookups for:
  - Price filter (tick size, min/max price)
  - Lot size (step size, min/max qty)
  - Min notional
  - Precision (price/quantity decimals)

  Used by OrderManager and Executor to validate orders before submission.
  """

  use GenServer
  require Logger

  @ets_table :exchange_info_cache
  @refresh_interval_ms 21_600_000  # 6 hours
  @initial_load_delay_ms 10_000    # 10s after boot

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Get symbol info from cache. Returns nil if not cached."
  def get_symbol(symbol) do
    normalized = normalize(symbol)
    case :ets.lookup(@ets_table, normalized) do
      [{^normalized, info}] -> info
      _ -> nil
    end
  rescue
    _ -> nil
  end

  @doc "Get tick size for a symbol"
  def tick_size(symbol) do
    case get_symbol(symbol) do
      %{tick_size: ts} when is_number(ts) and ts > 0 -> ts
      _ -> nil
    end
  end

  @doc "Get step size (quantity precision) for a symbol"
  def step_size(symbol) do
    case get_symbol(symbol) do
      %{step_size: ss} when is_number(ss) and ss > 0 -> ss
      _ -> nil
    end
  end

  @doc "Get min notional for a symbol"
  def min_notional(symbol) do
    case get_symbol(symbol) do
      %{min_notional: mn} when is_number(mn) and mn > 0 -> mn
      _ -> nil
    end
  end

  @doc "Get all cached symbols"
  def all_symbols do
    :ets.tab2list(@ets_table)
    |> Enum.reject(fn {k, _} -> k == :_metadata end)
    |> Enum.map(fn {symbol, info} -> {symbol, info} end)
  rescue
    _ -> []
  end

  @doc "Get cache metadata (last refresh time, symbol count)"
  def metadata do
    case :ets.lookup(@ets_table, :_metadata) do
      [{:_metadata, meta}] -> meta
      _ -> %{last_refresh: nil, symbol_count: 0, status: :empty}
    end
  rescue
    _ -> %{last_refresh: nil, symbol_count: 0, status: :empty}
  end

  @doc "Force a refresh"
  def refresh do
    GenServer.cast(__MODULE__, :refresh)
  end

  # ============================================================================
  # GENSERVER
  # ============================================================================

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    :ets.insert(@ets_table, {:_metadata, %{last_refresh: nil, symbol_count: 0, status: :initializing}})

    Process.send_after(self(), :load, @initial_load_delay_ms)

    Logger.info("ExchangeInfoCache started — refreshes every #{div(@refresh_interval_ms, 3_600_000)}h")
    {:ok, %{loading: false}}
  end

  @impl true
  def handle_cast(:refresh, state) do
    send(self(), :load)
    {:noreply, state}
  end

  @impl true
  def handle_info(:load, %{loading: true} = state) do
    {:noreply, state}
  end

  def handle_info(:load, state) do
    Process.send_after(self(), :load, @refresh_interval_ms)
    load_exchange_info()
    {:noreply, %{state | loading: false}}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ============================================================================
  # LOADING
  # ============================================================================

  defp load_exchange_info do
    # Load from Binance directly (no credential needed for exchangeInfo)
    testnet = Application.get_env(:trade_engine, :binance_testnet, true)

    # Try futures first, then spot
    futures_url = if testnet,
      do: "https://testnet.binancefuture.com/fapi/v1/exchangeInfo",
      else: "https://fapi.binance.com/fapi/v1/exchangeInfo"

    spot_url = if testnet,
      do: "https://testnet.binance.vision/api/v3/exchangeInfo",
      else: "https://api.binance.com/api/v3/exchangeInfo"

    count = load_from_url(futures_url, "futures") + load_from_url(spot_url, "spot")

    :ets.insert(@ets_table, {:_metadata, %{
      last_refresh: DateTime.utc_now(),
      symbol_count: count,
      status: :loaded
    }})

    Logger.info("ExchangeInfoCache: loaded #{count} symbols")
  rescue
    e ->
      Logger.warning("ExchangeInfoCache: load failed: #{Exception.message(e)}")
      :ets.insert(@ets_table, {:_metadata, %{
        last_refresh: DateTime.utc_now(),
        symbol_count: 0,
        status: :error
      }})
  end

  defp load_from_url(url, source) do
    case HTTPoison.get(url, [], timeout: 30_000, recv_timeout: 30_000) do
      {:ok, %{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"symbols" => symbols}} ->
            Enum.each(symbols, fn s ->
              filters = s["filters"] || []
              price_filter = find_filter(filters, "PRICE_FILTER")
              lot_size = find_filter(filters, "LOT_SIZE")
              min_notional_filter = find_filter(filters, "MIN_NOTIONAL") || find_filter(filters, "NOTIONAL")

              info = %{
                symbol: s["symbol"],
                status: s["status"],
                base_asset: s["baseAsset"],
                quote_asset: s["quoteAsset"],
                source: source,
                price_precision: s["pricePrecision"],
                quantity_precision: s["quantityPrecision"],
                tick_size: safe_float(price_filter["tickSize"]),
                min_price: safe_float(price_filter["minPrice"]),
                max_price: safe_float(price_filter["maxPrice"]),
                step_size: safe_float(lot_size["stepSize"]),
                min_qty: safe_float(lot_size["minQty"]),
                max_qty: safe_float(lot_size["maxQty"]),
                min_notional: safe_float(min_notional_filter["minNotional"] || min_notional_filter["notional"]),
                updated_at: DateTime.utc_now()
              }

              :ets.insert(@ets_table, {s["symbol"], info})
            end)

            length(symbols)

          _ ->
            0
        end

      _ ->
        0
    end
  rescue
    e ->
      Logger.debug("ExchangeInfoCache: failed to load from #{url}: #{Exception.message(e)}")
      0
  end

  defp find_filter(filters, type) do
    Enum.find(filters, %{}, fn f -> f["filterType"] == type end)
  end

  defp normalize(symbol) when is_binary(symbol) do
    symbol
    |> String.split(":")
    |> List.first()
    |> String.replace("/", "")
    |> String.upcase()
  end
  defp normalize(_), do: ""

  defp safe_float(nil), do: nil
  defp safe_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> nil
    end
  end
  defp safe_float(n) when is_number(n), do: n * 1.0
  defp safe_float(_), do: nil
end
