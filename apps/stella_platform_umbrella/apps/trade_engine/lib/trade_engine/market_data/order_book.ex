defmodule TradeEngine.MarketData.OrderBook do
  @moduledoc """
  Fetches Order Book Depth to determine Support (Bids) and Resistance (Asks).
  """
  require Logger
  
  @binance_api "https://api.binance.com/api/v3/depth"

  def fetch_depth(symbol, limit \\ 20) do
    clean_symbol = String.replace(symbol, "/", "")
    url = "#{@binance_api}?symbol=#{clean_symbol}&limit=#{limit}"

    case HTTPoison.get(url) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"bids" => bids, "asks" => asks}} ->
            {:ok, calculate_liquidity_metrics(bids, asks)}
          _ -> {:error, :decode_error}
        end
      _ -> {:error, :request_failed}
    end
  end

  defp calculate_liquidity_metrics(bids, asks) do
    # Sum up the volume (Quantity) of the top 20 levels
    total_bid_vol = sum_depth(bids)
    total_ask_vol = sum_depth(asks)
    
    total_liquidity = total_bid_vol + total_ask_vol
    
    # Imbalance Ratio: > 0.5 means more Support, < 0.5 means more Resistance
    ratio = if total_liquidity > 0, do: total_bid_vol / total_liquidity, else: 0.5
    
    # Wall Detection: Is one side 2x bigger than the other?
    wall_status = cond do
      total_bid_vol > total_ask_vol * 2.0 -> :buy_wall
      total_ask_vol > total_bid_vol * 2.0 -> :sell_wall
      true -> :balanced
    end

    %{
      bid_vol: total_bid_vol,
      ask_vol: total_ask_vol,
      imbalance_ratio: ratio,
      wall: wall_status
    }
  end

  defp sum_depth(levels) do
    Enum.reduce(levels, 0.0, fn [_price, qty], acc -> 
      {v, _} = Float.parse(qty)
      acc + v
    end)
  end
end