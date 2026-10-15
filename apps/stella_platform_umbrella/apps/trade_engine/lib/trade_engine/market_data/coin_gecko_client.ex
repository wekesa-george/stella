defmodule TradeEngine.MarketData.CoinGeckoClient do
  @moduledoc """
  Handles HTTP requests to the CoinGecko API.
  """
  require Logger

  @base_url "https://api.coingecko.com/api/v3"

  @doc """
  Fetches current market data for a list of coins.
  Example: fetch_markets(["bitcoin", "ethereum"])
  """
  def fetch_markets(coin_ids, currency \\ "usd") do
    ids_param = Enum.join(coin_ids, ",")
    url = "#{@base_url}/coins/markets?vs_currency=#{currency}&ids=#{ids_param}"

    case HTTPoison.get(url) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        {:ok, Jason.decode!(body)}

      {:ok, %HTTPoison.Response{status_code: 429}} ->
        Logger.warning("CoinGecko Rate Limit Hit! Backing off.")
        {:error, :rate_limit}

      {:error, %HTTPoison.Error{reason: reason}} ->
        Logger.error("CoinGecko HTTP Error: #{inspect(reason)}")
        {:error, reason}
        
      _ ->
        {:error, :unknown}
    end
  end

  @doc """
  Fetches tickers (depth/liquidity proxy) for a specific coin.
  """
  def fetch_tickers(coin_id) do
    url = "#{@base_url}/coins/#{coin_id}/tickers"
    
    case HTTPoison.get(url) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        {:ok, Jason.decode!(body)}
      _ ->
        {:error, :request_failed}
    end
  end
end