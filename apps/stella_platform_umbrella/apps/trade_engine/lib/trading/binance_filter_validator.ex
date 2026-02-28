defmodule TradeEngine.Trading.BinanceFilterValidator do
  @moduledoc """
  Validates order quantities against Binance LOT_SIZE filter requirements.
  Fetches live filter data from Binance and ensures quantities comply.
  """
  require Logger

  @base_url "https://testnet.binance.vision/api"
  @cache_ttl 3600  # Cache filter info for 1 hour

  @doc """
  Validate and adjust order quantity to meet LOT_SIZE filter.
  Returns {:ok, adjusted_quantity} or {:error, reason}
  """
  def validate_quantity(symbol, quantity) do
    case get_lot_size_filter(symbol) do
      {:ok, filter} ->
        validate_against_filter(quantity, filter, symbol)
      
      {:error, reason} ->
        Logger.error("Failed to get LOT_SIZE filter for #{symbol}: #{reason}")
        {:error, reason}
    end
  end

  @doc """
  Get LOT_SIZE filter for a symbol (with caching)
  """
  def get_lot_size_filter(symbol) do
    symbol_upper = String.upcase(symbol)
    
    case fetch_exchange_info(symbol_upper) do
      {:ok, symbol_info} ->
        case extract_lot_size_filter(symbol_info) do
          {:ok, filter} ->
            Logger.debug("✅ LOT_SIZE Filter for #{symbol_upper}: minQty=#{filter.min_qty}, maxQty=#{filter.max_qty}, stepSize=#{filter.step_size}")
            {:ok, filter}
          
          {:error, reason} ->
            {:error, reason}
        end
      
      {:error, reason} ->
        {:error, reason}
    end
  end

  # ========== PRIVATE HELPERS ==========

  defp fetch_exchange_info(symbol) do
    url = "#{@base_url}/v3/exchangeInfo?symbol=#{symbol}"
    
    case HTTPoison.get(url, [], recv_timeout: 10000) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"symbols" => symbols}} ->
            case Enum.find(symbols, &(&1["symbol"] == symbol)) do
              nil -> {:error, "Symbol not found: #{symbol}"}
              symbol_info -> {:ok, symbol_info}
            end
          
          {:error, e} ->
            {:error, "JSON decode failed: #{inspect(e)}"}
        end
      
      {:ok, %HTTPoison.Response{status_code: code}} ->
        {:error, "HTTP #{code}"}
      
      {:error, reason} ->
        {:error, inspect(reason)}
    end
  end

  defp extract_lot_size_filter(symbol_info) do
    case Enum.find(symbol_info["filters"], &(&1["filterType"] == "LOT_SIZE")) do
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

    Logger.debug("Validating #{symbol} quantity #{quantity}")
    Logger.debug("  minQty: #{filter.min_qty}, maxQty: #{filter.max_qty}, stepSize: #{filter.step_size}")

    cond do
      Decimal.lt?(qty_decimal, filter.min_qty) ->
        Logger.warning("❌ #{symbol} quantity #{quantity} < minimum #{filter.min_qty}")
        {:error, "Quantity #{quantity} below minimum #{Decimal.to_string(filter.min_qty)}"}

      Decimal.gt?(qty_decimal, filter.max_qty) ->
        Logger.warning("❌ #{symbol} quantity #{quantity} > maximum #{filter.max_qty}")
        {:error, "Quantity #{quantity} exceeds maximum #{Decimal.to_string(filter.max_qty)}"}

      true ->
        adjusted = round_to_step_size(qty_decimal, filter.step_size)
        
        if Decimal.equal?(adjusted, qty_decimal) do
          Logger.debug("✅ #{symbol} quantity #{quantity} is valid")
          {:ok, Decimal.to_float(qty_decimal)}
        else
          Logger.info("📊 #{symbol} quantity adjusted from #{quantity} to #{Decimal.to_string(adjusted)} (step: #{Decimal.to_string(filter.step_size)})")
          {:ok, Decimal.to_float(adjusted)}
        end
    end
  end

  defp round_to_step_size(quantity, step_size) do
    # Divide by step_size, floor, multiply back
    # This ensures quantity is a multiple of step_size
    divided = Decimal.div(quantity, step_size)
    floored = Decimal.round(divided, 0, :down)
    Decimal.mult(floored, step_size)
  end
end