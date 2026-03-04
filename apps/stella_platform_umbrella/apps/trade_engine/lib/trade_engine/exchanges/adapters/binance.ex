defmodule TradeEngine.Exchanges.Adapters.Binance do
  @moduledoc """
  Binance exchange adapter. Implements ExchangeAdapter behaviour
  with HMAC-SHA256 request signing and dynamic credentials.

  Credential map expected:
    %{
      api_key: "...",
      secret_key: "...",
      base_url: "https://testnet.binance.vision/api",   # spot
      futures_base_url: "https://testnet.binancefuture.com/fapi",  # optional
      simulate_shorts: true                               # optional, default true
    }
  """

  @behaviour TradeEngine.Exchanges.ExchangeAdapter

  require Logger

  @http_timeout_ms 10_000

  # ========================================================================
  # TRADING — ExchangeAdapter callbacks
  # ========================================================================

  @impl true
  def execute_long(symbol, quantity, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = opts[:market_type] || "spot"
    qty_str = format_quantity(trading_symbol, quantity, market_type: market_type)

    {label, url} = case market_type do
      "usds_futures" ->
        {"USDS-M FUTURES BUY", usds_futures_order_url(credentials)}
      "coinm_futures" ->
        {"COIN-M FUTURES BUY", coinm_futures_order_url(credentials)}
      _ ->
        {"SPOT BUY", spot_url(credentials) <> "/v3/order"}
    end

    Logger.info("Binance #{label}: #{trading_symbol} qty=#{qty_str}")

    params = %{
      "symbol" => trading_symbol,
      "side" => "BUY",
      "type" => "MARKET",
      "quantity" => qty_str
    }

    case signed_request(:post, url, params, credentials) do
      {:ok, order} ->
        {:ok, %{
          order_id: order["orderId"],
          executed_qty: extract_executed_qty(order),
          executed_price: extract_executed_price(order),
          status: order["status"]
        }}

      error ->
        error
    end
  end

  @impl true
  def execute_short(symbol, quantity, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = opts[:market_type] || "spot"

    # Futures market types use real short orders; spot uses simulation (or spot SELL)
    if market_type in ["usds_futures", "coinm_futures"] do
      qty_str = format_quantity(trading_symbol, quantity, market_type: market_type)

      {label, url} = case market_type do
        "usds_futures" -> {"USDS-M FUTURES SHORT", usds_futures_order_url(credentials)}
        "coinm_futures" -> {"COIN-M FUTURES SHORT", coinm_futures_order_url(credentials)}
      end

      Logger.info("Binance #{label}: #{trading_symbol} qty=#{qty_str}")

      params = %{
        "symbol" => trading_symbol,
        "side" => "SELL",
        "type" => "MARKET",
        "quantity" => qty_str
      }

      case signed_request(:post, url, params, credentials) do
        {:ok, order} ->
          {:ok, %{
            order_id: order["orderId"],
            executed_qty: extract_executed_qty(order),
            executed_price: extract_executed_price(order),
            status: order["status"]
          }}

        error ->
          error
      end
    else
      # Spot: simulate shorts (default) or execute as spot SELL
      if Map.get(credentials, :simulate_shorts, true) do
        Logger.info("Binance SIMULATED SHORT: #{trading_symbol} qty=#{quantity}")

        case get_price(symbol, credentials) do
          {:ok, price} ->
            current_price = Decimal.to_float(price)
            {:ok, %{
              order_id: "SIM_SHORT_#{:erlang.system_time(:millisecond)}",
              executed_qty: quantity,
              executed_price: current_price,
              status: "simulated"
            }}

          error ->
            error
        end
      else
        qty_str = format_quantity(trading_symbol, quantity)
        Logger.info("Binance SPOT SELL (short): #{trading_symbol} qty=#{qty_str}")

        params = %{
          "symbol" => trading_symbol,
          "side" => "SELL",
          "type" => "MARKET",
          "quantity" => qty_str
        }

        case signed_request(:post, spot_url(credentials) <> "/v3/order", params, credentials) do
          {:ok, order} ->
            {:ok, %{
              order_id: order["orderId"],
              executed_qty: extract_executed_qty(order),
              executed_price: extract_executed_price(order),
              status: order["status"]
            }}

          error ->
            error
        end
      end
    end
  end

  @impl true
  def close_long(symbol, quantity, entry_price, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = opts[:market_type] || "spot"
    qty_str = format_quantity(trading_symbol, quantity, market_type: market_type)

    {label, url} = case market_type do
      "usds_futures" ->
        {"USDS-M FUTURES SELL (close long)", usds_futures_order_url(credentials)}
      "coinm_futures" ->
        {"COIN-M FUTURES SELL (close long)", coinm_futures_order_url(credentials)}
      _ ->
        {"SPOT SELL (close long)", spot_url(credentials) <> "/v3/order"}
    end

    Logger.info("Binance #{label}: #{trading_symbol} qty=#{qty_str}")

    params = %{
      "symbol" => trading_symbol,
      "side" => "SELL",
      "type" => "MARKET",
      "quantity" => qty_str
    }

    case signed_request(:post, url, params, credentials) do
      {:ok, order} ->
        executed_price = extract_executed_price(order)
        executed_qty = extract_executed_qty(order)
        pnl = (executed_price - entry_price) * executed_qty
        pnl_pct = if entry_price > 0, do: ((executed_price - entry_price) / entry_price) * 100, else: 0.0

        {:ok, %{
          order_id: order["orderId"],
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
  def close_short(symbol, quantity, entry_price, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = opts[:market_type] || "spot"

    # Futures market types use real cover orders
    if market_type in ["usds_futures", "coinm_futures"] do
      qty_str = format_quantity(trading_symbol, quantity, market_type: market_type)

      {label, url} = case market_type do
        "usds_futures" -> {"USDS-M FUTURES BUY (close short)", usds_futures_order_url(credentials)}
        "coinm_futures" -> {"COIN-M FUTURES BUY (close short)", coinm_futures_order_url(credentials)}
      end

      Logger.info("Binance #{label}: #{trading_symbol} qty=#{qty_str}")

      params = %{
        "symbol" => trading_symbol,
        "side" => "BUY",
        "type" => "MARKET",
        "quantity" => qty_str
      }

      case signed_request(:post, url, params, credentials) do
        {:ok, order} ->
          executed_price = extract_executed_price(order)
          executed_qty = extract_executed_qty(order)
          pnl = (entry_price - executed_price) * executed_qty
          pnl_pct = if entry_price > 0, do: ((entry_price - executed_price) / entry_price) * 100, else: 0.0

          {:ok, %{
            order_id: order["orderId"],
            executed_qty: executed_qty,
            executed_price: executed_price,
            pnl: pnl,
            pnl_percent: pnl_pct,
            status: order["status"]
          }}

        error ->
          error
      end
    else
      # Spot: simulated short cover or real spot BUY
      if Map.get(credentials, :simulate_shorts, true) do
        Logger.info("Binance SIMULATED SHORT COVER: #{trading_symbol} qty=#{quantity}")

        case get_price(symbol, credentials) do
          {:ok, price} ->
            current_price = Decimal.to_float(price)
            pnl = (entry_price - current_price) * quantity
            pnl_pct = if entry_price > 0, do: ((entry_price - current_price) / entry_price) * 100, else: 0.0

            {:ok, %{
              order_id: "SIM_COVER_#{:erlang.system_time(:millisecond)}",
              executed_qty: quantity,
              executed_price: current_price,
              pnl: pnl,
              pnl_percent: pnl_pct,
              status: "simulated"
            }}

          error ->
            error
        end
      else
        qty_str = format_quantity(trading_symbol, quantity)
        Logger.info("Binance SPOT BUY (close short): #{trading_symbol} qty=#{qty_str}")

        params = %{
          "symbol" => trading_symbol,
          "side" => "BUY",
          "type" => "MARKET",
          "quantity" => qty_str
        }

        case signed_request(:post, spot_url(credentials) <> "/v3/order", params, credentials) do
          {:ok, order} ->
            executed_price = extract_executed_price(order)
            executed_qty = extract_executed_qty(order)
            pnl = (entry_price - executed_price) * executed_qty
            pnl_pct = if entry_price > 0, do: ((entry_price - executed_price) / entry_price) * 100, else: 0.0

            {:ok, %{
              order_id: order["orderId"],
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
    end
  end

  # ========================================================================
  # MARKET DATA — ExchangeAdapter callbacks
  # ========================================================================

  @impl true
  def get_price(symbol, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = if is_list(opts), do: Keyword.get(opts, :market_type), else: nil

    url = case resolve_api_type(symbol, market_type) do
      :coinm_futures ->
        coinm_base = Map.get(credentials, :coinm_futures_base_url) || resolve_futures_base_url(credentials)
        "#{coinm_base}/v1/ticker/price?symbol=#{trading_symbol}"
      :usds_futures ->
        "#{resolve_futures_base_url(credentials)}/v1/ticker/price?symbol=#{trading_symbol}"
      _ ->
        "#{spot_url(credentials)}/v3/ticker/price?symbol=#{trading_symbol}"
    end

    case HTTPoison.get(url, [], timeout: 5_000, recv_timeout: 5_000) do
      {:ok, %{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"price" => p}} -> {:ok, Decimal.new(p)}
          {:ok, [%{"price" => p} | _]} -> {:ok, Decimal.new(p)}
          _ -> {:error, :decode_error}
        end

      {:ok, %{status_code: code, body: body}} ->
        {:error, {code, body}}

      {:error, %HTTPoison.Error{reason: reason}} ->
        {:error, reason}
    end
  end

  @impl true
  def get_bars(symbol, timeframe, limit, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    interval = normalize_timeframe(timeframe)
    market_type = Keyword.get(opts, :market_type)

    url = case resolve_api_type(symbol, market_type) do
      :coinm_futures ->
        coinm_base = Map.get(credentials, :coinm_futures_base_url) || resolve_futures_base_url(credentials)
        "#{coinm_base}/v1/klines?symbol=#{trading_symbol}&interval=#{interval}&limit=#{limit}"
      :usds_futures ->
        "#{resolve_futures_base_url(credentials)}/v1/klines?symbol=#{trading_symbol}&interval=#{interval}&limit=#{limit}"
      _ ->
        "#{spot_url(credentials)}/v3/klines?symbol=#{trading_symbol}&interval=#{interval}&limit=#{limit}"
    end

    case HTTPoison.get(url, [], timeout: 5_000, recv_timeout: 5_000) do
      {:ok, %{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, klines} when is_list(klines) ->
            bars = Enum.map(klines, fn k ->
              %{
                "t" => Enum.at(k, 0),
                "o" => parse_kline_float(Enum.at(k, 1)),
                "h" => parse_kline_float(Enum.at(k, 2)),
                "l" => parse_kline_float(Enum.at(k, 3)),
                "c" => parse_kline_float(Enum.at(k, 4)),
                "v" => parse_kline_float(Enum.at(k, 5))
              }
            end)
            {:ok, bars}

          _ ->
            {:error, :decode_error}
        end

      {:ok, %{status_code: code, body: body}} ->
        {:error, {code, body}}

      {:error, %HTTPoison.Error{reason: reason}} ->
        {:error, reason}
    end
  end

  @impl true
  def get_account(credentials) do
    case signed_request(:get, spot_url(credentials) <> "/v3/account", %{}, credentials) do
      {:ok, %{"balances" => balances}} ->
        non_zero = Enum.filter(balances, fn b ->
          {free, _} = Float.parse(b["free"] || "0")
          {locked, _} = Float.parse(b["locked"] || "0")
          free > 0 or locked > 0
        end)
        {:ok, %{balances: non_zero}}

      error ->
        error
    end
  end

  # ========================================================================
  # SYMBOL NORMALIZATION
  # ========================================================================

  @impl true
  def normalize_symbol(symbol, _purpose) do
    normalized = strip_ccxt_suffix(symbol) |> String.replace("/", "") |> String.upcase()

    cond do
      # Delivery futures: "BTCUSDT_260327" — already has quote + expiry, leave as-is
      String.match?(normalized, ~r/_\d+$/) -> normalized
      String.ends_with?(normalized, "USDT") -> normalized
      String.ends_with?(normalized, "USDC") -> normalized
      String.ends_with?(normalized, "BUSD") -> normalized
      String.ends_with?(normalized, "USD") -> normalized <> "T"
      true -> normalized <> "USDT"
    end
  end

  @doc "Returns true if the symbol represents a futures contract (perpetual or delivery)"
  def futures_symbol?(symbol) do
    String.contains?(symbol, ":") or String.match?(normalize_symbol(symbol, :trading), ~r/_\d+$/)
  end

  # Resolve which API endpoint to use. Prefers explicit market_type from opts,
  # falls back to guessing from symbol format for backward compatibility.
  defp resolve_api_type(_symbol, "usds_futures"), do: :usds_futures
  defp resolve_api_type(_symbol, "coinm_futures"), do: :coinm_futures
  defp resolve_api_type(_symbol, "spot"), do: :spot
  defp resolve_api_type(symbol, _) do
    trading = normalize_symbol(symbol, :trading)
    cond do
      String.match?(trading, ~r/_\d+$/) -> :coinm_futures
      String.contains?(symbol, ":") -> :usds_futures
      true -> :spot
    end
  end

  # Strip CCXT unified format suffixes:
  #   "BTC/USDT:USDT-260327" -> "BTC/USDT" with expiry "_260327"
  #   "BTC/USDT:USDT"        -> "BTC/USDT" (perpetual, no expiry)
  #   "BTC/USDT"             -> "BTC/USDT" (spot, unchanged)
  defp strip_ccxt_suffix(symbol) do
    case String.split(symbol, ":") do
      [base_quote, settle_part] ->
        case String.split(settle_part, "-") do
          [_settle, expiry] ->
            # Quarterly delivery: append _EXPIRY (Binance format)
            base_quote <> "_" <> expiry
          [_settle] ->
            # Perpetual swap: just use base/quote
            base_quote
        end
      [_spot] ->
        symbol
    end
  end

  # ========================================================================
  # PRIVATE — HMAC-signed requests
  # ========================================================================

  defp signed_request(method, url, params, credentials) do
    timestamp = System.system_time(:millisecond)

    params_with_ts = Map.put(params, "timestamp", timestamp)
    query_string = URI.encode_query(params_with_ts)

    signature =
      :crypto.mac(:hmac, :sha256, credentials.secret_key, query_string)
      |> Base.encode16(case: :lower)

    final_query = "#{query_string}&signature=#{signature}"

    headers = [
      {"X-MBX-APIKEY", credentials.api_key},
      {"Content-Type", "application/x-www-form-urlencoded"}
    ]

    final_url = case method do
      :get -> "#{url}?#{final_query}"
      :post -> url
    end

    result = case method do
      :get -> HTTPoison.get(final_url, headers, timeout: @http_timeout_ms, recv_timeout: @http_timeout_ms)
      :post -> HTTPoison.post(final_url, final_query, headers, timeout: @http_timeout_ms, recv_timeout: @http_timeout_ms)
    end

    case result do
      {:ok, %{status_code: 200, body: body}} ->
        Jason.decode(body)

      {:ok, %{status_code: code, body: body}} ->
        Logger.error("Binance API error [#{code}]: #{body}")
        {:error, %{code: code, body: body}}

      {:error, %HTTPoison.Error{reason: reason}} ->
        {:error, reason}
    end
  end

  # ========================================================================
  # PRIVATE — Helpers
  # ========================================================================

  defp spot_url(credentials), do: credentials.base_url

  defp resolve_futures_base_url(credentials) do
    Map.get(credentials, :usds_futures_base_url) ||
      Map.get(credentials, :futures_base_url) ||
      Logger.warning("Binance: no futures_base_url configured in credentials") || ""
  end

  defp usds_futures_order_url(credentials) do
    base = resolve_futures_base_url(credentials)
    base <> "/v1/order"
  end

  defp coinm_futures_order_url(credentials) do
    base = Map.get(credentials, :coinm_futures_base_url) ||
      Map.get(credentials, :futures_base_url) ||
      Logger.warning("Binance: no coinm_futures_base_url configured in credentials") || ""
    base <> "/v1/order"
  end

  defp extract_executed_price(order) do
    cond do
      order["avgPrice"] && order["avgPrice"] not in ["", "0"] ->
        parse_float_safe(order["avgPrice"])

      order["fills"] && is_list(order["fills"]) && length(order["fills"]) > 0 ->
        fills = order["fills"]
        total_qty = Enum.reduce(fills, 0.0, fn f, acc -> acc + parse_float_safe(f["qty"]) end)

        if total_qty > 0 do
          weighted_sum = Enum.reduce(fills, 0.0, fn f, acc ->
            acc + (parse_float_safe(f["price"]) * parse_float_safe(f["qty"]))
          end)
          weighted_sum / total_qty
        else
          parse_float_safe(List.first(fills)["price"])
        end

      order["price"] && order["price"] not in ["0.00000000", "0"] ->
        parse_float_safe(order["price"])

      order["cumQuote"] && order["executedQty"] ->
        cum_quote = parse_float_safe(order["cumQuote"])
        exec_qty = parse_float_safe(order["executedQty"])
        if exec_qty > 0, do: cum_quote / exec_qty, else: 0.0

      true ->
        0.0
    end
  end

  defp extract_executed_qty(order) do
    cond do
      order["executedQty"] -> parse_float_safe(order["executedQty"])
      order["origQty"] -> parse_float_safe(order["origQty"])
      true -> 0.0
    end
  end

  defp format_quantity(symbol, quantity, opts \\ []) do
    precision = get_quantity_precision(symbol, opts)
    :erlang.float_to_binary(quantity * 1.0, decimals: precision)
  end

  # Binance futures use different step sizes than spot
  # BTCUSDT futures: stepSize=0.001 (3 decimals), spot: stepSize=0.00001 (5 decimals)
  # ETHUSDT futures: stepSize=0.001 (3 decimals), spot: stepSize=0.0001 (4 decimals)
  defp get_quantity_precision(symbol, opts \\ []) do
    market_type = Keyword.get(opts, :market_type)
    is_futures = market_type in ["usds_futures", "coinm_futures"]

    cond do
      String.starts_with?(symbol, "BTC") and is_futures -> 3
      String.starts_with?(symbol, "ETH") and is_futures -> 3
      String.starts_with?(symbol, "BTC") -> 5
      String.starts_with?(symbol, "ETH") -> 4
      true -> 3
    end
  end

  defp parse_float_safe(nil), do: 0.0
  defp parse_float_safe(n) when is_float(n), do: n
  defp parse_float_safe(n) when is_integer(n), do: n * 1.0
  defp parse_float_safe(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> 0.0
    end
  end

  defp parse_kline_float(nil), do: 0.0
  defp parse_kline_float(n) when is_number(n), do: n * 1.0
  defp parse_kline_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> 0.0
    end
  end

  defp normalize_timeframe(tf) do
    case tf do
      "1Min" -> "1m"
      "5Min" -> "5m"
      "15Min" -> "15m"
      "1Hour" -> "1h"
      "4Hour" -> "4h"
      "1Day" -> "1d"
      other -> other
    end
  end
end
