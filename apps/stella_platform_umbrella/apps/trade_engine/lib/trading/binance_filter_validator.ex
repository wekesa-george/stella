defmodule TradeEngine.Trading.BinanceFilterValidator do
  @moduledoc """
  Validates order quantities against Binance LOT_SIZE filter requirements.
  Fetches live filter data from Binance and caches in ETS for 1 hour.
  Supports both spot and futures, testnet and production.
  """
  require Logger

  @cache_table :binance_filter_cache
  @cache_ttl_seconds 3600

  @spot_prod "https://api.binance.com/api"
  @spot_testnet "https://testnet.binance.vision/api"
  @futures_prod "https://fapi.binance.com/fapi"
  @futures_testnet "https://testnet.binancefuture.com/fapi"

  @doc """
  Validate and adjust order quantity to meet LOT_SIZE filter.
  Returns {:ok, adjusted_quantity} or {:error, reason}.
  Falls back to the original quantity if filter lookup fails.
  """
  def validate_quantity(symbol, quantity, opts \\ []) do
    case get_lot_size_filter(symbol, opts) do
      {:ok, filter} ->
        validate_against_filter(quantity, filter, symbol)

      {:error, reason} ->
        Logger.warning("BinanceFilterValidator: LOT_SIZE lookup failed for #{symbol}: #{reason} — using raw quantity")
        {:ok, quantity}
    end
  end

  @doc """
  Get LOT_SIZE filter for a symbol (with ETS caching).
  """
  def get_lot_size_filter(symbol, opts \\ []) do
    symbol_upper = normalize_symbol(symbol)
    market_type = Keyword.get(opts, :market_type, "spot")
    cache_key = {symbol_upper, market_type}

    case lookup_cache(cache_key) do
      {:ok, filter} -> {:ok, filter}
      :miss -> fetch_and_cache(symbol_upper, market_type, cache_key)
    end
  end

  # ========== PRIVATE HELPERS ==========

  defp normalize_symbol(symbol) do
    symbol
    |> String.upcase()
    |> String.replace("/", "")
    |> String.replace(":", "")
  end

  defp lookup_cache(key) do
    try do
      case :ets.lookup(@cache_table, key) do
        [{^key, filter, inserted_at}] ->
          age = System.monotonic_time(:second) - inserted_at
          if age < @cache_ttl_seconds, do: {:ok, filter}, else: :miss
        _ -> :miss
      end
    rescue
      ArgumentError -> :miss
    end
  end

  defp insert_cache(key, filter) do
    try do
      :ets.insert(@cache_table, {key, filter, System.monotonic_time(:second)})
    rescue
      ArgumentError ->
        # Table doesn't exist yet — create it
        :ets.new(@cache_table, [:set, :public, :named_table])
        :ets.insert(@cache_table, {key, filter, System.monotonic_time(:second)})
    end
  end

  defp fetch_and_cache(symbol, market_type, cache_key) do
    base_url = get_base_url(market_type)
    api_path = if is_futures?(market_type), do: "/v1/exchangeInfo", else: "/v3/exchangeInfo"
    url = "#{base_url}#{api_path}?symbol=#{symbol}"

    case HTTPoison.get(url, [], recv_timeout: 10_000) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"symbols" => symbols}} ->
            case Enum.find(symbols, &(&1["symbol"] == symbol)) do
              nil -> {:error, "Symbol #{symbol} not found"}
              symbol_info ->
                case extract_lot_size_filter(symbol_info) do
                  {:ok, filter} ->
                    insert_cache(cache_key, filter)
                    Logger.debug("BinanceFilterValidator: cached LOT_SIZE for #{symbol}: step=#{filter.step_size}, min=#{filter.min_qty}")
                    {:ok, filter}
                  error -> error
                end
            end

          {:error, e} ->
            {:error, "JSON decode failed: #{inspect(e)}"}
        end

      {:ok, %HTTPoison.Response{status_code: code}} ->
        {:error, "HTTP #{code}"}

      {:error, reason} ->
        {:error, inspect(reason)}
    end
  rescue
    e -> {:error, "Exception: #{Exception.message(e)}"}
  end

  defp get_base_url(market_type) do
    is_testnet = Application.get_env(:trade_engine, :binance_testnet, true)
    case {is_futures?(market_type), is_testnet} do
      {true, true} -> @futures_testnet
      {true, false} -> @futures_prod
      {false, true} -> @spot_testnet
      {false, false} -> @spot_prod
    end
  end

  defp is_futures?(market_type), do: market_type in ["usds_futures", "coinm_futures"]

  defp extract_lot_size_filter(symbol_info) do
    filters = symbol_info["filters"] || []
    case Enum.find(filters, &(&1["filterType"] == "LOT_SIZE")) do
      nil ->
        {:error, "LOT_SIZE filter not found"}

      filter ->
        {:ok, %{
          min_qty: Decimal.new(filter["minQty"]),
          max_qty: Decimal.new(filter["maxQty"]),
          step_size: Decimal.new(filter["stepSize"])
        }}
    end
  end

  defp validate_against_filter(quantity, filter, symbol) do
    qty_decimal = Decimal.new("#{quantity}")

    cond do
      Decimal.lt?(qty_decimal, filter.min_qty) ->
        Logger.warning("BinanceFilterValidator: #{symbol} qty #{quantity} < min #{filter.min_qty}")
        {:error, "Quantity #{quantity} below minimum #{Decimal.to_string(filter.min_qty)}"}

      Decimal.gt?(qty_decimal, filter.max_qty) ->
        Logger.warning("BinanceFilterValidator: #{symbol} qty #{quantity} > max #{filter.max_qty}")
        {:error, "Quantity #{quantity} exceeds maximum #{Decimal.to_string(filter.max_qty)}"}

      true ->
        adjusted = round_to_step_size(qty_decimal, filter.step_size)

        if Decimal.lt?(adjusted, filter.min_qty) do
          Logger.warning("BinanceFilterValidator: #{symbol} qty #{quantity} rounds to #{adjusted} which is < min #{filter.min_qty}")
          {:error, "Adjusted quantity #{Decimal.to_string(adjusted)} below minimum #{Decimal.to_string(filter.min_qty)}"}
        else
          adj_float = Decimal.to_float(adjusted)
          if not Decimal.equal?(adjusted, qty_decimal) do
            Logger.info("BinanceFilterValidator: #{symbol} qty adjusted #{quantity} -> #{adj_float} (step: #{filter.step_size})")
          end
          {:ok, adj_float}
        end
    end
  end

  defp round_to_step_size(quantity, step_size) do
    divided = Decimal.div(quantity, step_size)
    floored = Decimal.round(divided, 0, :down)
    Decimal.mult(floored, step_size)
  end
end
