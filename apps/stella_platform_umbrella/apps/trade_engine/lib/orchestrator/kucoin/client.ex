defmodule TradeEngine.Exchange.KuCoin.Client do
  @moduledoc """
  Production-ready wrapper for KuCoin Spot API.
  """
  require Logger
  alias TradeEngine.Orchestrator.KuCoin.Auth

  @base_url Application.compile_env(:trade_engine, [:kucoin, :base_url], "https://api.kucoin.com")

  # --- Public API ---

  @doc "Fetches account balance for a specific currency (e.g., 'USDT')"
  def get_balance(currency) do
    path = "/api/v1/accounts?currency=#{currency}&type=trade"
    request(:get, path)
  end

  @doc """
  Places a LIMIT order.
  side: "buy" or "sell"
  symbol: "BTC-USDT" (Note: KuCoin uses dashes, not slashes)
  """
  def place_limit_order(symbol, side, size, price) do
    path = "/api/v1/orders"
    
    # KuCoin requires a unique clientOid (UUID) to prevent double-spending
    body = %{
      clientOid: Ecto.UUID.generate(),
      side: side,
      symbol: normalize_symbol(symbol),
      type: "limit",
      size: Float.to_string(size),
      price: Float.to_string(price)
    }
    
    request(:post, path, body)
  end

  @doc "Places a MARKET order."
  def place_market_order(symbol, side, size) do
    path = "/api/v1/orders"
    
    body = %{
      clientOid: Ecto.UUID.generate(),
      side: side,
      symbol: normalize_symbol(symbol),
      type: "market",
      size: Float.to_string(size)
    }
    
    request(:post, path, body)
  end

  @doc "Cancels an active order by ID."
  def cancel_order(order_id) do
    path = "/api/v1/orders/#{order_id}"
    request(:delete, path)
  end

  # --- Internal Helpers ---

  defp request(method, path, body \\ %{}) do
    url = @base_url <> path
    json_body = if body == %{}, do: "", else: Jason.encode!(body)
    
    headers = Auth.get_headers(Atom.to_string(method), path, json_body)

    options = [
      timeout: 10_000, 
      recv_timeout: 10_000
    ]

    # Perform Request
    response = case method do
      :get -> HTTPoison.get(url, headers, options)
      :delete -> HTTPoison.delete(url, headers, options)
      :post -> HTTPoison.post(url, json_body, headers, options)
    end

    handle_response(response)
  end

  defp handle_response({:ok, %HTTPoison.Response{status_code: 200, body: body}}) do
    case Jason.decode(body) do
      {:ok, %{"code" => "200000", "data" => data}} -> 
        {:ok, data} # Success
      {:ok, %{"code" => code, "msg" => msg}} -> 
        Logger.error("❌ KuCoin API Error [#{code}]: #{msg}")
        {:error, msg}
      _ -> 
        {:error, :parsing_error}
    end
  end

  defp handle_response({:ok, %HTTPoison.Response{status_code: code, body: body}}) do
    Logger.error("❌ HTTP Error [#{code}]: #{body}")
    {:error, :http_error}
  end

  defp handle_response({:error, %HTTPoison.Error{reason: reason}}) do
    Logger.error("❌ Network Error: #{inspect(reason)}")
    {:error, reason}
  end
  
  defp normalize_symbol(symbol) do
    # Convert internal "BTC/USDT" or "BTCUSDT" to KuCoin's "BTC-USDT"
    symbol
    |> String.replace("/", "-")
    |> String.replace("_", "-")
  end
end