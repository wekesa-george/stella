defmodule TradeEngine.Trading.LotSizeValidator do
  @moduledoc """
  Validates order quantities against Binance LOT_SIZE filter requirements
  """
  require Logger

  @doc """
  Validate and adjust order quantity to meet LOT_SIZE filter
  
  Returns {:ok, adjusted_quantity} or {:error, reason}
  """
  def validate_quantity(symbol, quantity, side \\ :buy) do
    case get_symbol_filters(symbol) do
      {:ok, filters} ->
        case Enum.find(filters, &(&1["filterType"] == "LOT_SIZE")) do
          nil ->
            Logger.warning("No LOT_SIZE filter found for #{symbol}")
            {:ok, quantity}
          
          lot_size_filter ->
            validate_against_filter(quantity, lot_size_filter, symbol)
        end
      
      {:error, reason} ->
        {:error, "Could not fetch filters: #{reason}"}
    end
  end

  defp validate_against_filter(quantity, filter, symbol) do
    min_qty = Decimal.new(filter["minQty"])
    max_qty = Decimal.new(filter["maxQty"])
    step_size = Decimal.new(filter["stepSize"])
    
    qty_decimal = Decimal.new("#{quantity}")

    cond do
      Decimal.lt?(qty_decimal, min_qty) ->
        adjusted = min_qty
        Logger.warning(
          "Order quantity #{quantity} below minimum #{min_qty} for #{symbol}. " <>
          "Adjusting to #{adjusted}"
        )
        {:ok, Decimal.to_float(adjusted)}

      Decimal.gt?(qty_decimal, max_qty) ->
        {:error, "Order quantity #{quantity} exceeds maximum #{max_qty} for #{symbol}"}

      true ->
        # Round to step size
        adjusted = round_to_step_size(qty_decimal, step_size)
        
        if Decimal.equal?(adjusted, qty_decimal) do
          {:ok, Decimal.to_float(qty_decimal)}
        else
          Logger.info(
            "Adjusted quantity from #{qty_decimal} to #{adjusted} " <>
            "(step size: #{step_size}) for #{symbol}"
          )
          {:ok, Decimal.to_float(adjusted)}
        end
    end
  end

  defp round_to_step_size(quantity, step_size) do
    # Divide quantity by step size, round down, multiply back
    divided = Decimal.div(quantity, step_size)
    rounded = Decimal.round(divided, 0, :down)
    Decimal.mult(rounded, step_size)
  end

  defp get_symbol_filters(symbol) do
    case HTTPoison.get("https://api.binance.com/api/v3/exchangeInfo?symbol=#{symbol}") do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, data} ->
            symbols = data["symbols"]
            symbol_info = Enum.find(symbols, &(&1["symbol"] == symbol))
            
            if symbol_info do
              {:ok, symbol_info["filters"]}
            else
              {:error, "Symbol not found: #{symbol}"}
            end
          
          {:error, reason} ->
            {:error, "JSON decode failed: #{reason}"}
        end
      
      {:ok, %HTTPoison.Response{status_code: status}} ->
        {:error, "HTTP #{status}"}
      
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Format quantity for Binance API (remove trailing zeros)
  """
  def format_quantity(quantity) do
    quantity
    |> Decimal.from_float()
    |> Decimal.to_string(:normal)
  end
end