defmodule TradeEngine.Exchanges.Adapters.Alpaca do
  @moduledoc """
  Alpaca exchange adapter. Implements ExchangeAdapter behaviour
  by wrapping Alpaca's Trading API and Data API with dynamic credentials.

  Credential map expected:
    %{
      api_key: "APCA-...",
      secret_key: "...",
      base_url: "https://paper-api.alpaca.markets",   # or live
      data_base_url: "https://data.alpaca.markets"     # optional, defaults to production
    }
  """

  @behaviour TradeEngine.Exchanges.ExchangeAdapter

  require Logger

  @default_data_base_url "https://data.alpaca.markets"
  @http_timeout_ms 10_000
  @data_timeout_ms 8_000

  # ========================================================================
  # TRADING — ExchangeAdapter callbacks
  # ========================================================================

  @impl true
  def execute_long(symbol, quantity, credentials, _opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    Logger.info("Alpaca BUY: #{trading_symbol} qty=#{quantity}")

    case place_market_order(trading_symbol, "buy", quantity, credentials) do
      {:ok, order} ->
        {:ok, %{
          order_id: order["id"],
          executed_qty: parse_float(order["filled_qty"]) || quantity,
          executed_price: parse_float(order["filled_avg_price"]) || 0.0,
          status: order["status"]
        }}

      error ->
        error
    end
  end

  @impl true
  def execute_short(symbol, quantity, credentials, _opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    Logger.info("Alpaca SHORT (sell): #{trading_symbol} qty=#{quantity}")

    case place_market_order(trading_symbol, "sell", quantity, credentials) do
      {:ok, order} ->
        {:ok, %{
          order_id: order["id"],
          executed_qty: parse_float(order["filled_qty"]) || quantity,
          executed_price: parse_float(order["filled_avg_price"]) || 0.0,
          status: order["status"]
        }}

      error ->
        error
    end
  end

  @impl true
  def close_long(symbol, quantity, entry_price, credentials, _opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    Logger.info("Alpaca SELL (close long): #{trading_symbol} qty=#{quantity}")

    case place_market_order(trading_symbol, "sell", quantity, credentials) do
      {:ok, order} ->
        executed_price = parse_float(order["filled_avg_price"]) || 0.0
        executed_qty = parse_float(order["filled_qty"]) || quantity
        pnl = (executed_price - entry_price) * executed_qty
        pnl_pct = if entry_price > 0, do: ((executed_price - entry_price) / entry_price) * 100, else: 0.0

        {:ok, %{
          order_id: order["id"],
          executed_qty: executed_qty,
          executed_price: executed_price,
          pnl: pnl,
          pnl_percent: pnl_pct,
          status: order["status"]
        }}

      error ->
        error
    end
  end

  @impl true
  def close_short(symbol, quantity, entry_price, credentials, _opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    Logger.info("Alpaca BUY (close short): #{trading_symbol} qty=#{quantity}")

    case place_market_order(trading_symbol, "buy", quantity, credentials) do
      {:ok, order} ->
        executed_price = parse_float(order["filled_avg_price"]) || 0.0
        executed_qty = parse_float(order["filled_qty"]) || quantity
        pnl = (entry_price - executed_price) * executed_qty
        pnl_pct = if entry_price > 0, do: ((entry_price - executed_price) / entry_price) * 100, else: 0.0

        {:ok, %{
          order_id: order["id"],
          executed_qty: executed_qty,
          executed_price: executed_price,
          pnl: pnl,
          pnl_percent: pnl_pct,
          status: order["status"]
        }}

      error ->
        error
    end
  end

  # ========================================================================
  # MARKET DATA — ExchangeAdapter callbacks
  # ========================================================================

  @impl true
  def get_price(symbol, credentials) do
    data_symbol = normalize_symbol(symbol, :data)

    query = URI.encode_query(%{"symbols" => data_symbol})

    case data_request(:get, "/v1beta3/crypto/us/latest/quotes", credentials, query) do
      {:ok, %{"quotes" => quotes}} when is_map(quotes) ->
        case Map.get(quotes, data_symbol) do
          %{"bp" => bid, "ap" => ask} when is_number(bid) and is_number(ask) ->
            mid = (bid + ask) / 2.0
            {:ok, Decimal.from_float(mid)}

          _ ->
            {:error, :no_quote}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def get_bars(symbol, timeframe, limit, credentials) do
    data_symbol = normalize_symbol(symbol, :data)

    query = URI.encode_query(%{
      "symbols" => data_symbol,
      "timeframe" => timeframe,
      "limit" => limit,
      "sort" => "asc"
    })

    case data_request(:get, "/v1beta3/crypto/us/bars", credentials, query) do
      {:ok, %{"bars" => bars_map}} when is_map(bars_map) ->
        bars_data = Map.get(bars_map, data_symbol) || Map.get(bars_map, normalize_symbol(symbol, :trading))

        case bars_data do
          bars when is_list(bars) and length(bars) > 0 ->
            formatted = Enum.map(bars, fn bar ->
              %{
                "t" => bar["t"],
                "o" => bar["o"],
                "h" => bar["h"],
                "l" => bar["l"],
                "c" => bar["c"],
                "v" => bar["v"] || 0
              }
            end)
            {:ok, formatted}

          _ ->
            {:error, :no_bars}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def get_account(credentials) do
    case trading_request(:get, "/v2/account", credentials) do
      {:ok, account} ->
        {:ok, %{
          buying_power: parse_float(account["buying_power"]) || 0.0,
          equity: parse_float(account["equity"]) || 0.0,
          cash: parse_float(account["cash"]) || 0.0,
          status: account["status"],
          account_number: account["account_number"]
        }}

      error ->
        error
    end
  end

  # ========================================================================
  # SYMBOL NORMALIZATION
  # ========================================================================

  @impl true
  def normalize_symbol(symbol, :trading) do
    symbol
    |> String.upcase()
    |> String.replace("/", "")
    |> String.replace("USDT", "USD")
    |> then(fn s ->
      if String.ends_with?(s, "USD"), do: s, else: s <> "USD"
    end)
  end

  def normalize_symbol(symbol, :data) do
    trading = normalize_symbol(symbol, :trading)
    # BTCUSD → BTC/USD (split 3 chars from end)
    size = String.length(trading)
    prefix_size = size - 3

    if prefix_size > 0 do
      String.slice(trading, 0, prefix_size) <> "/" <> String.slice(trading, prefix_size..-1//1)
    else
      trading <> "/USD"
    end
  end

  # ========================================================================
  # PRIVATE — HTTP helpers with dynamic credentials
  # ========================================================================

  defp place_market_order(symbol, side, qty, credentials) do
    body = %{
      symbol: symbol,
      qty: to_string(qty),
      side: side,
      type: "market",
      time_in_force: "gtc"
    }

    trading_request(:post, "/v2/orders", credentials, body)
  end

  defp trading_request(method, endpoint, credentials, body \\ nil) do
    base_url = String.trim_trailing(credentials.base_url, "/")
    # Strip trailing /v2 from base_url if present — the endpoint already includes /v2
    base_url = String.replace_suffix(base_url, "/v2", "")
    url = if body == nil or body == %{} do
      base_url <> endpoint
    else
      base_url <> endpoint
    end

    headers = auth_headers(credentials)
    do_request(method, url, headers, body, @http_timeout_ms)
  end

  defp data_request(method, endpoint, credentials, query_params) do
    base_url = Map.get(credentials, :data_base_url, @default_data_base_url)

    url = if query_params do
      base_url <> endpoint <> "?" <> query_params
    else
      base_url <> endpoint
    end

    headers = auth_headers(credentials)
    do_request(method, url, headers, nil, @data_timeout_ms)
  end

  defp auth_headers(credentials) do
    [
      {"APCA-API-KEY-ID", credentials.api_key},
      {"APCA-API-SECRET-KEY", credentials.secret_key},
      {"Content-Type", "application/json"}
    ]
  end

  defp do_request(method, url, headers, body, timeout) do
    json_body = if body && body != %{}, do: Jason.encode!(body), else: ""
    opts = [recv_timeout: timeout, timeout: timeout]

    result = case method do
      :get -> HTTPoison.get(url, headers, opts)
      :post -> HTTPoison.post(url, json_body, headers, opts)
      :delete -> HTTPoison.delete(url, headers, opts)
    end

    case result do
      {:ok, %{status_code: code, body: resp_body}} when code in 200..299 ->
        case Jason.decode(resp_body) do
          {:ok, data} -> {:ok, data}
          {:error, _} ->
            if byte_size(resp_body) == 0, do: {:ok, %{}}, else: {:error, :decode_error}
        end

      {:ok, %{status_code: code, body: resp_body}} ->
        Logger.error("Alpaca API error [#{code}] #{method} #{url}: #{resp_body}")
        {:error, parse_error(resp_body)}

      {:error, %HTTPoison.Error{reason: reason}} ->
        {:error, reason}
    end
  end

  defp parse_error(body) do
    case Jason.decode(body) do
      {:ok, %{"message" => msg}} -> msg
      _ -> body
    end
  end

  defp parse_float(nil), do: nil
  defp parse_float(n) when is_float(n), do: n
  defp parse_float(n) when is_integer(n), do: n * 1.0
  defp parse_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> nil
    end
  end
end
