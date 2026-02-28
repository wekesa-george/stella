defmodule TradeEngine.Exchanges.Binance.RestClient do
  @moduledoc """
  Binance REST API client implementing the Exchange behaviour.
  
  Features:
  - Full behaviour implementation for spot trading
  - Automatic rate limiting via RateLimiter
  - Request signing (HMAC-SHA256)
  - Retry logic with exponential backoff
  - Response normalization to standard types
  
  ## Usage
  
      config = Binance.Config.new(:testnet, api_key: "...", api_secret: "...")
      
      {:ok, ticker} = RestClient.get_ticker(config, "BTCUSDT")
      {:ok, candles} = RestClient.fetch_klines(config, "BTCUSDT", "1h", limit: 100)
      {:ok, order} = RestClient.place_order(config, %{
        symbol: "BTCUSDT",
        side: :buy,
        type: :limit,
        quantity: 0.001,
        price: 50000.0
      })
  """

  @behaviour TradeEngine.Exchanges.Behaviour

  require Logger

  alias TradeEngine.Exchanges.Binance.{Config, RateLimiter}
  alias TradeEngine.Exchanges.Types
  alias TradeEngine.Exchanges.Types.{Candle, Ticker, OrderBook, Order, Account, Balance, SymbolInfo}

  # HTTP settings
  @default_timeout 15_000
  @default_recv_timeout 15_000
  @max_retries 3
  @retry_base_delay 1_000

  # API weight costs (approximate)
  @weights %{
    ping: 1,
    time: 1,
    exchange_info: 10,
    depth: 5,       # 5-50 depending on limit
    trades: 1,
    klines: 1,
    ticker_24h: 1,  # 1 per symbol, 40 for all
    ticker_price: 1,
    account: 10,
    order: 1,
    open_orders: 3,
    all_orders: 10
  }

  # ============================================================================
  # BEHAVIOUR IMPLEMENTATION - ACCOUNT & INFO
  # ============================================================================

  @impl true
  def ping(config) do
    case request(:get, config, "/v3/ping", [], weight: @weights.ping) do
      {:ok, %{}} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def get_server_time(config) do
    case request(:get, config, "/v3/time", [], weight: @weights.time) do
      {:ok, %{"serverTime" => ts}} ->
        {:ok, DateTime.from_unix!(ts, :millisecond)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def get_account(config) do
    case signed_request(:get, config, "/v3/account", [], weight: @weights.account) do
      {:ok, data} ->
        {:ok, parse_account(data)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def get_exchange_info(config, symbols \\ nil) do
    params = if symbols && length(symbols) > 0 do
      # Binance accepts symbols as JSON array or comma-separated for single
      if length(symbols) == 1 do
        [symbol: hd(symbols)]
      else
        [symbols: Jason.encode!(symbols)]
      end
    else
      []
    end

    case request(:get, config, "/v3/exchangeInfo", params, weight: @weights.exchange_info) do
      {:ok, %{"symbols" => symbols_data}} ->
        {:ok, Enum.map(symbols_data, &parse_symbol_info/1)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  # ============================================================================
  # BEHAVIOUR IMPLEMENTATION - MARKET DATA
  # ============================================================================

  @impl true
  def fetch_klines(config, symbol, timeframe, opts \\ []) do
    limit = Keyword.get(opts, :limit, 500)
    
    params = [
      symbol: normalize_symbol!(symbol),
      interval: timeframe,
      limit: limit
    ]
    
    params = maybe_add_time_params(params, opts)

    case request(:get, config, "/v3/klines", params, weight: @weights.klines) do
      {:ok, klines} when is_list(klines) ->
        {:ok, Enum.map(klines, fn k -> parse_kline(k, symbol, timeframe) end)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def get_ticker(config, symbol) when is_binary(symbol) do
    params = [symbol: normalize_symbol!(symbol)]
    
    case request(:get, config, "/v3/ticker/24hr", params, weight: @weights.ticker_24h) do
      {:ok, data} ->
        {:ok, parse_ticker(data)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  def get_ticker(config, symbols) when is_list(symbols) do
    # For multiple symbols, use the batch endpoint
    normalized = Enum.map(symbols, &normalize_symbol!/1)
    params = [symbols: Jason.encode!(normalized)]
    
    case request(:get, config, "/v3/ticker/24hr", params, weight: length(symbols)) do
      {:ok, data} when is_list(data) ->
        {:ok, Enum.map(data, &parse_ticker/1)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Get simple price ticker (lighter weight than full 24hr ticker).
  """
  def get_price(config, symbol) do
    params = [symbol: normalize_symbol!(symbol)]
    
    case request(:get, config, "/v3/ticker/price", params, weight: @weights.ticker_price) do
      {:ok, %{"symbol" => sym, "price" => price}} ->
        {:ok, %Ticker{
          symbol: sym,
          exchange: :binance,
          price: Decimal.new(price),
          timestamp: DateTime.utc_now()
        }}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def get_order_book(config, symbol, limit \\ 100) do
    # Weight varies: 5 for 100, 10 for 500, 50 for 1000
    weight = cond do
      limit <= 100 -> 5
      limit <= 500 -> 10
      true -> 50
    end

    params = [
      symbol: normalize_symbol!(symbol),
      limit: limit
    ]

    case request(:get, config, "/v3/depth", params, weight: weight) do
      {:ok, data} ->
        {:ok, parse_order_book(data, symbol)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  # ============================================================================
  # BEHAVIOUR IMPLEMENTATION - ORDERS
  # ============================================================================

  @impl true
  def place_order(config, order_params) do
    params = build_order_params(order_params)
    
    # Acquire order rate limit
    :ok = RateLimiter.acquire!(:orders_second, 1, timeout: 5000)
    
    case signed_request(:post, config, "/v3/order", params, weight: @weights.order) do
      {:ok, data} ->
        {:ok, parse_order(data)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def cancel_order(config, symbol, order_id) do
    params = [
      symbol: normalize_symbol!(symbol),
      orderId: order_id
    ]

    case signed_request(:delete, config, "/v3/order", params, weight: @weights.order) do
      {:ok, data} ->
        {:ok, parse_order(data)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def get_order(config, symbol, order_id) do
    params = [
      symbol: normalize_symbol!(symbol),
      orderId: order_id
    ]

    case signed_request(:get, config, "/v3/order", params, weight: @weights.order) do
      {:ok, data} ->
        {:ok, parse_order(data)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def get_open_orders(config, symbol \\ nil) do
    params = if symbol do
      [symbol: normalize_symbol!(symbol)]
    else
      []
    end

    weight = if symbol, do: @weights.open_orders, else: 40

    case signed_request(:get, config, "/v3/openOrders", params, weight: weight) do
      {:ok, data} when is_list(data) ->
        {:ok, Enum.map(data, &parse_order/1)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  # ============================================================================
  # BEHAVIOUR IMPLEMENTATION - WEBSOCKET HELPERS
  # ============================================================================

  @impl true
  def build_kline_stream_url(config, symbol_timeframe_pairs) do
    streams = Enum.map(symbol_timeframe_pairs, fn {symbol, timeframe} ->
      normalized = String.downcase(normalize_symbol!(symbol))
      "#{normalized}@kline_#{timeframe}"
    end)

    {:ok, Config.build_ws_url(config, streams)}
  end

  @impl true
  def build_depth_stream_url(config, symbols, update_speed \\ 100) do
    speed_suffix = if update_speed == 100, do: "@100ms", else: ""
    
    streams = Enum.map(symbols, fn symbol ->
      normalized = String.downcase(normalize_symbol!(symbol))
      "#{normalized}@depth#{speed_suffix}"
    end)

    {:ok, Config.build_ws_url(config, streams)}
  end

  @impl true
  def build_ticker_stream_url(config, :all) do
    {:ok, Config.build_ws_url(config, ["!ticker@arr"])}
  end

  def build_ticker_stream_url(config, symbols) when is_list(symbols) do
    streams = Enum.map(symbols, fn symbol ->
      normalized = String.downcase(normalize_symbol!(symbol))
      "#{normalized}@ticker"
    end)

    {:ok, Config.build_ws_url(config, streams)}
  end

  @impl true
  def parse_ws_message(%{"e" => "kline", "k" => kline_data, "s" => symbol}) do
    {:kline, parse_ws_kline(kline_data, symbol)}
  end

  def parse_ws_message(%{"e" => "depthUpdate"} = data) do
    {:depth, parse_ws_depth(data)}
  end

  def parse_ws_message(%{"e" => "24hrTicker"} = data) do
    {:ticker, parse_ws_ticker(data)}
  end

  def parse_ws_message(%{"e" => "24hrMiniTicker"} = data) do
    {:ticker, parse_ws_mini_ticker(data)}
  end

  def parse_ws_message(%{"result" => _, "id" => id}) do
    {:subscription_result, %{id: id, success: true}}
  end

  def parse_ws_message(%{"error" => error, "id" => id}) do
    {:subscription_result, %{id: id, success: false, error: error}}
  end

  def parse_ws_message(_), do: :ignore

  @impl true
  def build_subscribe_message(streams) do
    %{
      method: "SUBSCRIBE",
      params: streams,
      id: System.unique_integer([:positive])
    }
  end

  @impl true
  def build_unsubscribe_message(streams) do
    %{
      method: "UNSUBSCRIBE",
      params: streams,
      id: System.unique_integer([:positive])
    }
  end

  # ============================================================================
  # BEHAVIOUR IMPLEMENTATION - UTILITIES
  # ============================================================================

  @impl true
  def normalize_symbol(symbol) do
    normalized = symbol
      |> String.replace("/", "")
      |> String.replace("-", "")
      |> String.upcase()
    
    {:ok, normalized}
  end

  @impl true
  def validate_quantity(_config, _symbol, quantity) do
    # Full implementation would look up symbol info and validate
    # For now, just convert to Decimal
    {:ok, to_decimal(quantity)}
  end

  @impl true
  def validate_price(_config, _symbol, price) do
    {:ok, to_decimal(price)}
  end

  @impl true
  def get_rate_limit_status(_config) do
    weight_status = RateLimiter.status(:weight)
    order_status = RateLimiter.status(:orders_second)
    
    %{
      requests_remaining: weight_status[:available],
      requests_limit: weight_status[:capacity],
      reset_at: nil,  # Would need to track from headers
      weight_used: weight_status[:capacity] - weight_status[:available],
      weight_limit: weight_status[:capacity],
      orders_remaining: order_status[:available],
      orders_limit: order_status[:capacity]
    }
  end

  # ============================================================================
  # PRIVATE - HTTP REQUESTS
  # ============================================================================

  defp request(method, config, path, params, opts \\ []) do
    weight = Keyword.get(opts, :weight, 1)
    
    # Acquire rate limit tokens
    case RateLimiter.acquire(:weight, weight) do
      :ok ->
        do_request(method, config, path, params, opts)
      
      {:error, :rate_limited, wait_ms} ->
        Logger.warning("⏳ Rate limited, waiting #{wait_ms}ms")
        Process.sleep(wait_ms)
        request(method, config, path, params, opts)
    end
  end

  defp signed_request(method, config, path, params, opts \\ []) do
    timestamp = System.system_time(:millisecond)
    params_with_ts = params ++ [timestamp: timestamp]
    
    query_string = build_query_string(params_with_ts)
    signature = sign(query_string, config.api_secret)
    
    signed_params = params_with_ts ++ [signature: signature]
    
    request(method, config, path, signed_params, opts)
  end

  defp do_request(method, config, path, params, opts) do
    url = build_url(config, path, method, params)
    headers = build_headers(config)
    body = if method in [:post, :put], do: build_body(params), else: ""
    
    http_opts = [
      timeout: Keyword.get(opts, :timeout, @default_timeout),
      recv_timeout: Keyword.get(opts, :recv_timeout, @default_recv_timeout)
    ]

    Logger.debug("🌐 #{method |> to_string() |> String.upcase()} #{url}")

    result = case method do
      :get -> HTTPoison.get(url, headers, http_opts)
      :post -> HTTPoison.post(url, body, headers, http_opts)
      :delete -> HTTPoison.delete(url, headers, http_opts)
      :put -> HTTPoison.put(url, body, headers, http_opts)
    end

    handle_response(result, method, config, path, params, opts)
  end

  defp handle_response({:ok, %HTTPoison.Response{status_code: code, body: body, headers: headers}}, 
                       _method, _config, _path, _params, _opts) when code in 200..299 do
    # Update rate limits from headers
    RateLimiter.update_from_headers(headers)
    
    case Jason.decode(body) do
      {:ok, data} -> {:ok, data}
      {:error, _} -> {:error, {:decode_error, body}}
    end
  end

  defp handle_response({:ok, %HTTPoison.Response{status_code: code, body: body, headers: headers}},
                       method, config, path, params, opts) do
    RateLimiter.update_from_headers(headers)
    
    error = case Jason.decode(body) do
      {:ok, %{"code" => err_code, "msg" => msg}} ->
        parse_api_error(err_code, msg)
      _ ->
        {:api_error, code, body}
    end

    # Retry on certain errors
    retries = Keyword.get(opts, :retries, 0)
    
    if should_retry?(error, retries) do
      delay = @retry_base_delay * :math.pow(2, retries) |> round()
      Logger.warning("🔄 Retrying after #{delay}ms (attempt #{retries + 1})")
      Process.sleep(delay)
      
      do_request(method, config, path, params, Keyword.put(opts, :retries, retries + 1))
    else
      {:error, error}
    end
  end

  defp handle_response({:error, %HTTPoison.Error{reason: reason}}, 
                       method, config, path, params, opts) do
    retries = Keyword.get(opts, :retries, 0)
    
    if retries < @max_retries do
      delay = @retry_base_delay * :math.pow(2, retries) |> round()
      Logger.warning("🔄 HTTP error: #{inspect(reason)}, retrying after #{delay}ms")
      Process.sleep(delay)
      
      do_request(method, config, path, params, Keyword.put(opts, :retries, retries + 1))
    else
      {:error, {:connection_error, reason}}
    end
  end

  defp should_retry?(error, retries) when retries >= @max_retries, do: false
  defp should_retry?(:rate_limited, _), do: true
  defp should_retry?({:api_error, code, _}, _) when code in [500, 502, 503, 504], do: true
  defp should_retry?(_, _), do: false

  defp parse_api_error(-1000, msg), do: {:unknown, msg}
  defp parse_api_error(-1001, _), do: :connection_error
  defp parse_api_error(-1002, _), do: :authentication_error
  defp parse_api_error(-1003, _), do: :rate_limited
  defp parse_api_error(-1013, _), do: :invalid_quantity
  defp parse_api_error(-1021, _), do: :timestamp_error
  defp parse_api_error(-1022, _), do: :authentication_error
  defp parse_api_error(-2010, _), do: :insufficient_balance
  defp parse_api_error(-2011, _), do: :order_not_found
  defp parse_api_error(-2013, _), do: :order_not_found
  defp parse_api_error(-2014, _), do: :authentication_error
  defp parse_api_error(-2015, _), do: :authentication_error
  defp parse_api_error(code, msg), do: {:api_error, code, msg}

  # ============================================================================
  # PRIVATE - REQUEST BUILDING
  # ============================================================================

  defp build_url(config, path, method, params) do
    base = Config.rest_url(config) <> path
    
    if method == :get && length(params) > 0 do
      query = build_query_string(params)
      "#{base}?#{query}"
    else
      base
    end
  end

  defp build_headers(config) do
    headers = [{"Content-Type", "application/x-www-form-urlencoded"}]
    
    if config.api_key do
      [{"X-MBX-APIKEY", config.api_key} | headers]
    else
      headers
    end
  end

  defp build_body(params) do
    build_query_string(params)
  end

  defp build_query_string(params) do
    params
    |> Enum.reject(fn {_, v} -> is_nil(v) end)
    |> Enum.map(fn {k, v} -> "#{k}=#{URI.encode_www_form(to_string(v))}" end)
    |> Enum.join("&")
  end

  defp sign(query_string, secret) do
    :crypto.mac(:hmac, :sha256, secret, query_string)
    |> Base.encode16(case: :lower)
  end

  defp normalize_symbol!(symbol) do
    {:ok, normalized} = normalize_symbol(symbol)
    normalized
  end

  defp maybe_add_time_params(params, opts) do
    params
    |> maybe_add_param(:startTime, opts[:start_time], &to_timestamp/1)
    |> maybe_add_param(:endTime, opts[:end_time], &to_timestamp/1)
  end

  defp maybe_add_param(params, _key, nil, _converter), do: params
  defp maybe_add_param(params, key, value, converter) do
    [{key, converter.(value)} | params]
  end

  defp to_timestamp(%DateTime{} = dt), do: DateTime.to_unix(dt, :millisecond)
  defp to_timestamp(ts) when is_integer(ts), do: ts

  # ============================================================================
  # PRIVATE - RESPONSE PARSING
  # ============================================================================

  defp parse_account(data) do
    %Account{
      exchange: :binance,
      account_type: data["accountType"],
      can_trade: data["canTrade"],
      can_withdraw: data["canWithdraw"],
      can_deposit: data["canDeposit"],
      balances: Enum.map(data["balances"] || [], &parse_balance/1),
      permissions: data["permissions"] || [],
      raw: data
    }
  end

  defp parse_balance(%{"asset" => asset, "free" => free, "locked" => locked}) do
    free_dec = to_decimal(free)
    locked_dec = to_decimal(locked)
    
    %Balance{
      asset: asset,
      free: free_dec,
      locked: locked_dec,
      total: Decimal.add(free_dec, locked_dec)
    }
  end

  defp parse_symbol_info(data) do
    filters = data["filters"] || []
    
    %SymbolInfo{
      symbol: data["symbol"],
      exchange: :binance,
      base_asset: data["baseAsset"],
      quote_asset: data["quoteAsset"],
      status: data["status"],
      min_qty: get_filter_value(filters, "LOT_SIZE", "minQty"),
      max_qty: get_filter_value(filters, "LOT_SIZE", "maxQty"),
      step_size: get_filter_value(filters, "LOT_SIZE", "stepSize"),
      min_notional: get_filter_value(filters, "NOTIONAL", "minNotional") ||
                    get_filter_value(filters, "MIN_NOTIONAL", "minNotional"),
      tick_size: get_filter_value(filters, "PRICE_FILTER", "tickSize"),
      min_price: get_filter_value(filters, "PRICE_FILTER", "minPrice"),
      max_price: get_filter_value(filters, "PRICE_FILTER", "maxPrice"),
      is_spot: data["isSpotTradingAllowed"] || false,
      is_margin: data["isMarginTradingAllowed"] || false,
      is_futures: false,
      base_precision: data["baseAssetPrecision"] || 8,
      quote_precision: data["quoteAssetPrecision"] || 8
    }
  end

  defp get_filter_value(filters, filter_type, field) do
    case Enum.find(filters, fn f -> f["filterType"] == filter_type end) do
      nil -> nil
      filter -> to_decimal(filter[field])
    end
  end

  defp parse_kline([open_time, open, high, low, close, volume, close_time, 
                    quote_volume, trades, taker_buy_vol, taker_buy_quote_vol | _], symbol, timeframe) do
    %Candle{
      symbol: symbol,
      exchange: :binance,
      timeframe: timeframe,
      timestamp: DateTime.from_unix!(open_time, :millisecond),
      open: to_decimal(open),
      high: to_decimal(high),
      low: to_decimal(low),
      close: to_decimal(close),
      volume: to_decimal(volume),
      quote_volume: to_decimal(quote_volume),
      taker_buy_volume: to_decimal(taker_buy_vol),
      taker_buy_quote_volume: to_decimal(taker_buy_quote_vol),
      trade_count: trades,
      closed: close_time < System.system_time(:millisecond)
    }
  end

  defp parse_ticker(data) do
    %Ticker{
      symbol: data["symbol"],
      exchange: :binance,
      price: to_decimal(data["lastPrice"]),
      bid: to_decimal(data["bidPrice"]),
      bid_qty: to_decimal(data["bidQty"]),
      ask: to_decimal(data["askPrice"]),
      ask_qty: to_decimal(data["askQty"]),
      open_24h: to_decimal(data["openPrice"]),
      high_24h: to_decimal(data["highPrice"]),
      low_24h: to_decimal(data["lowPrice"]),
      volume_24h: to_decimal(data["volume"]),
      quote_volume_24h: to_decimal(data["quoteVolume"]),
      price_change_24h: to_decimal(data["priceChange"]),
      price_change_percent_24h: to_decimal(data["priceChangePercent"]),
      timestamp: DateTime.from_unix!(data["closeTime"] || System.system_time(:millisecond), :millisecond)
    }
  end

  defp parse_order_book(data, symbol) do
    %OrderBook{
      symbol: symbol,
      exchange: :binance,
      bids: Enum.map(data["bids"] || [], &parse_depth_level/1),
      asks: Enum.map(data["asks"] || [], &parse_depth_level/1),
      timestamp: DateTime.utc_now(),
      last_update_id: data["lastUpdateId"]
    }
  end

  defp parse_depth_level([price, qty]) do
    {to_decimal(price), to_decimal(qty)}
  end

  defp parse_order(data) do
    %Order{
      order_id: to_string(data["orderId"]),
      client_order_id: data["clientOrderId"],
      exchange: :binance,
      symbol: data["symbol"],
      side: parse_side(data["side"]),
      type: parse_order_type(data["type"]),
      status: parse_order_status(data["status"]),
      quantity: to_decimal(data["origQty"]),
      filled_quantity: to_decimal(data["executedQty"]),
      price: to_decimal(data["price"]),
      stop_price: to_decimal(data["stopPrice"]),
      executed_price: to_decimal(data["avgPrice"] || data["cummulativeQuoteQty"]),
      time_in_force: data["timeInForce"],
      created_at: DateTime.from_unix!(data["time"] || data["transactTime"] || 0, :millisecond),
      updated_at: DateTime.from_unix!(data["updateTime"] || 0, :millisecond),
      raw: data
    }
  end

  defp parse_side("BUY"), do: :buy
  defp parse_side("SELL"), do: :sell
  defp parse_side(_), do: nil

  defp parse_order_type("MARKET"), do: :market
  defp parse_order_type("LIMIT"), do: :limit
  defp parse_order_type("STOP_LOSS"), do: :stop_loss
  defp parse_order_type("STOP_LOSS_LIMIT"), do: :stop_loss_limit
  defp parse_order_type("TAKE_PROFIT"), do: :take_profit
  defp parse_order_type("TAKE_PROFIT_LIMIT"), do: :take_profit_limit
  defp parse_order_type(_), do: nil

  defp parse_order_status("NEW"), do: :new
  defp parse_order_status("PARTIALLY_FILLED"), do: :partially_filled
  defp parse_order_status("FILLED"), do: :filled
  defp parse_order_status("CANCELED"), do: :canceled
  defp parse_order_status("PENDING_CANCEL"), do: :pending_cancel
  defp parse_order_status("REJECTED"), do: :rejected
  defp parse_order_status("EXPIRED"), do: :expired
  defp parse_order_status(_), do: nil

  # WebSocket message parsers
  defp parse_ws_kline(k, symbol) do
    %Candle{
      symbol: symbol,
      exchange: :binance,
      timeframe: k["i"],
      timestamp: DateTime.from_unix!(k["t"], :millisecond),
      open: to_decimal(k["o"]),
      high: to_decimal(k["h"]),
      low: to_decimal(k["l"]),
      close: to_decimal(k["c"]),
      volume: to_decimal(k["v"]),
      quote_volume: to_decimal(k["q"]),
      taker_buy_volume: to_decimal(k["V"]),
      taker_buy_quote_volume: to_decimal(k["Q"]),
      trade_count: k["n"],
      closed: k["x"]
    }
  end

  defp parse_ws_depth(data) do
    %OrderBook{
      symbol: data["s"],
      exchange: :binance,
      bids: Enum.map(data["b"] || [], &parse_depth_level/1),
      asks: Enum.map(data["a"] || [], &parse_depth_level/1),
      timestamp: DateTime.from_unix!(data["E"], :millisecond),
      last_update_id: data["u"],
      first_update_id: data["U"]
    }
  end

  defp parse_ws_ticker(data) do
    %Ticker{
      symbol: data["s"],
      exchange: :binance,
      price: to_decimal(data["c"]),
      bid: to_decimal(data["b"]),
      bid_qty: to_decimal(data["B"]),
      ask: to_decimal(data["a"]),
      ask_qty: to_decimal(data["A"]),
      open_24h: to_decimal(data["o"]),
      high_24h: to_decimal(data["h"]),
      low_24h: to_decimal(data["l"]),
      volume_24h: to_decimal(data["v"]),
      quote_volume_24h: to_decimal(data["q"]),
      price_change_24h: to_decimal(data["p"]),
      price_change_percent_24h: to_decimal(data["P"]),
      timestamp: DateTime.from_unix!(data["E"], :millisecond)
    }
  end

  defp parse_ws_mini_ticker(data) do
    %Ticker{
      symbol: data["s"],
      exchange: :binance,
      price: to_decimal(data["c"]),
      open_24h: to_decimal(data["o"]),
      high_24h: to_decimal(data["h"]),
      low_24h: to_decimal(data["l"]),
      volume_24h: to_decimal(data["v"]),
      quote_volume_24h: to_decimal(data["q"]),
      timestamp: DateTime.from_unix!(data["E"], :millisecond)
    }
  end

  defp build_order_params(params) do
    base = [
      symbol: normalize_symbol!(params.symbol),
      side: params.side |> to_string() |> String.upcase(),
      type: params.type |> to_string() |> String.upcase() |> String.replace("_", "_"),
      quantity: format_decimal(params.quantity)
    ]

    base
    |> maybe_add_param(:price, params[:price], &format_decimal/1)
    |> maybe_add_param(:stopPrice, params[:stop_price], &format_decimal/1)
    |> maybe_add_param(:timeInForce, params[:time_in_force] || default_tif(params.type), &to_string/1)
    |> maybe_add_param(:newClientOrderId, params[:client_order_id], &to_string/1)
  end

  defp default_tif(:limit), do: "GTC"
  defp default_tif(:stop_loss_limit), do: "GTC"
  defp default_tif(:take_profit_limit), do: "GTC"
  defp default_tif(_), do: nil

  defp to_decimal(nil), do: Decimal.new(0)
  defp to_decimal(""), do: Decimal.new(0)
  defp to_decimal(val) when is_binary(val), do: Decimal.new(val)
  defp to_decimal(val) when is_float(val), do: Decimal.from_float(val)
  defp to_decimal(val) when is_integer(val), do: Decimal.new(val)
  defp to_decimal(%Decimal{} = val), do: val

  defp format_decimal(val) do
    val
    |> to_decimal()
    |> Decimal.to_string(:normal)
    |> String.trim_trailing("0")
    |> String.trim_trailing(".")
  end
end