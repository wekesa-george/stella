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
  # HEDGE MODE (position side) DETECTION
  # ========================================================================

  @doc """
  Check if the account uses hedge mode (dual position side).
  Calls GET /fapi/v1/positionSide/dual on the futures endpoint.
  Returns {:ok, true} for hedge mode, {:ok, false} for one-way mode.
  """
  def get_position_mode(credentials, _opts \\ []) do
    futures_url = resolve_futures_base_url(credentials)

    if futures_url == "" do
      {:ok, false}
    else
      case signed_request(:get, futures_url <> "/v1/positionSide/dual", %{}, credentials) do
        {:ok, %{"dualSidePosition" => dual}} -> {:ok, dual}
        {:ok, _} -> {:ok, false}
        {:error, _} -> {:ok, false}
      end
    end
  end

  # Lazy-cached hedge mode check per API key. Uses process dictionary
  # to avoid repeated network calls within the same process (e.g. BotTradingProcess).
  # Position mode rarely changes, so caching per-process lifetime is safe.
  defp get_hedge_mode(credentials) do
    key = {:binance_hedge_mode, credentials.api_key}

    case Process.get(key) do
      nil ->
        {:ok, dual} = get_position_mode(credentials)
        Process.put(key, dual)
        dual

      val ->
        val
    end
  end

  # Check hedge mode only for futures market types, returns false for spot.
  defp is_hedge_mode?(market_type, credentials) do
    if market_type in ["usds_futures", "coinm_futures"] do
      get_hedge_mode(credentials)
    else
      false
    end
  end

  # Add positionSide param when in hedge mode. Must NOT include reduceOnly
  # when positionSide is set (Binance rejects the combination).
  defp maybe_add_position_side(params, false, _position_side), do: params

  defp maybe_add_position_side(params, true, position_side) do
    params
    |> Map.put("positionSide", position_side)
    |> Map.delete("reduceOnly")
  end

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

    is_hedge = is_hedge_mode?(market_type, credentials)

    params = %{
      "symbol" => trading_symbol,
      "side" => "BUY",
      "type" => "MARKET",
      "quantity" => qty_str,
      "newOrderRespType" => "RESULT"
    }
    |> maybe_add_position_side(is_hedge, "LONG")

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

      is_hedge = is_hedge_mode?(market_type, credentials)

      Logger.info("Binance #{label}: #{trading_symbol} qty=#{qty_str}")

      params = %{
        "symbol" => trading_symbol,
        "side" => "SELL",
        "type" => "MARKET",
        "quantity" => qty_str,
        "newOrderRespType" => "RESULT"
      }
      |> maybe_add_position_side(is_hedge, "SHORT")

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

    is_hedge = is_hedge_mode?(market_type, credentials)

    Logger.info("Binance #{label}: #{trading_symbol} qty=#{qty_str}")

    params = %{
      "symbol" => trading_symbol,
      "side" => "SELL",
      "type" => "MARKET",
      "quantity" => qty_str,
      "newOrderRespType" => "RESULT"
    }
    # For futures in hedge mode, use positionSide instead of reduceOnly.
    # For futures in one-way mode, use reduceOnly to avoid opening a new short.
    params = cond do
      is_hedge ->
        maybe_add_position_side(params, true, "LONG")
      market_type in ["usds_futures", "coinm_futures"] ->
        Map.put(params, "reduceOnly", "true")
      true ->
        params
    end

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

      is_hedge = is_hedge_mode?(market_type, credentials)

      Logger.info("Binance #{label}: #{trading_symbol} qty=#{qty_str}")

      params = %{
        "symbol" => trading_symbol,
        "side" => "BUY",
        "type" => "MARKET",
        "quantity" => qty_str,
        "newOrderRespType" => "RESULT"
      }
      # For hedge mode, use positionSide; for one-way mode, use reduceOnly
      params = if is_hedge do
        maybe_add_position_side(params, true, "SHORT")
      else
        Map.put(params, "reduceOnly", "true")
      end

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
    url = spot_url(credentials) <> "/v3/account"
    Logger.info("Binance get_account: url=#{url} base_url=#{credentials.base_url} has_key=#{credentials.api_key != nil}")

    case signed_request(:get, url, %{}, credentials) do
      {:ok, %{"balances" => balances}} ->
        non_zero = Enum.filter(balances, fn b ->
          {free, _} = Float.parse(b["free"] || "0")
          {locked, _} = Float.parse(b["locked"] || "0")
          free > 0 or locked > 0
        end)
        Logger.info("Binance get_account: success, #{length(non_zero)} non-zero assets")
        {:ok, %{balances: non_zero}}

      {:error, reason} = error ->
        Logger.warning("Binance get_account FAILED: url=#{url} | error=#{inspect(reason)}")
        error

      other ->
        Logger.warning("Binance get_account unexpected: url=#{url} | response=#{inspect(other)}")
        other
    end
  end

  @doc """
  Get USDS-M futures account balance via /fapi/v2/balance.
  Returns non-zero asset balances with wallet and available amounts.
  """
  def get_futures_account(credentials) do
    futures_url = resolve_futures_base_url(credentials)
    cred_id = Map.get(credentials, :credential_id, "unknown")
    Logger.info("Binance get_futures_account: url=#{futures_url}/v2/balance cred_id=#{cred_id} base_url=#{credentials.base_url}")

    if futures_url == "" do
      {:error, :no_futures_url_configured}
    else
      case signed_request(:get, futures_url <> "/v2/balance", %{}, credentials) do
        {:ok, balances} when is_list(balances) ->
          non_zero = Enum.filter(balances, fn b ->
            {wb, _} = Float.parse(b["balance"] || "0")
            wb != 0.0
          end)

          assets = Enum.map(non_zero, fn b ->
            %{
              asset: b["asset"],
              wallet_balance: parse_float_safe(b["balance"]),
              available_balance: parse_float_safe(b["availableBalance"] || b["withdrawAvailable"]),
              unrealized_pnl: parse_float_safe(b["crossUnPnl"] || "0")
            }
          end)

          total_wallet = Enum.reduce(assets, 0.0, fn a, acc -> acc + a.wallet_balance end)
          total_available = Enum.reduce(assets, 0.0, fn a, acc -> acc + a.available_balance end)

          {:ok, %{
            assets: assets,
            total_wallet_balance: total_wallet,
            total_available_balance: total_available,
            market_type: "usds_futures"
          }}

        {:ok, %{"code" => code, "msg" => msg}} ->
          {:error, %{code: code, message: msg}}

        error ->
          error
      end
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
  # LIMIT ORDERS — used by grid bot and other limit-order strategies
  # ========================================================================

  @doc "Place a limit order on Binance (spot or futures)"
  def place_limit_order(symbol, side, quantity, price, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = opts[:market_type] || "spot"
    qty_str = format_quantity(trading_symbol, quantity, market_type: market_type)
    price_str = format_price(price)

    url = case market_type do
      "usds_futures" -> usds_futures_order_url(credentials)
      "coinm_futures" -> coinm_futures_order_url(credentials)
      _ -> spot_url(credentials) <> "/v3/order"
    end

    is_hedge = is_hedge_mode?(market_type, credentials)
    side_str = String.upcase(to_string(side))

    # In hedge mode, determine positionSide from the order side.
    # An explicit :position_side opt can override this for close orders.
    position_side = case Keyword.get(opts, :position_side) do
      nil -> if(side_str == "BUY", do: "LONG", else: "SHORT")
      ps -> String.upcase(to_string(ps))
    end

    params = %{
      "symbol" => trading_symbol,
      "side" => side_str,
      "type" => "LIMIT",
      "quantity" => qty_str,
      "price" => price_str,
      "timeInForce" => Keyword.get(opts, :time_in_force, "GTC"),
      "newOrderRespType" => "RESULT"
    }
    |> maybe_add_position_side(is_hedge, position_side)

    # For futures counter-orders (closing a position), add reduceOnly in one-way mode
    params = if Keyword.get(opts, :reduce_only, false) and not is_hedge and
                market_type in ["usds_futures", "coinm_futures"] do
      Map.put(params, "reduceOnly", "true")
    else
      params
    end

    # Add client order ID if provided (useful for grid order tracking)
    params = case Keyword.get(opts, :client_order_id) do
      nil -> params
      id -> Map.put(params, "newClientOrderId", id)
    end

    case signed_request(:post, url, params, credentials) do
      {:ok, order} ->
        {:ok, %{
          order_id: order["orderId"],
          client_order_id: order["clientOrderId"],
          status: order["status"],
          executed_qty: extract_executed_qty(order),
          executed_price: extract_executed_price(order),
          price: parse_float_safe(order["price"]),
          symbol: order["symbol"]
        }}
      error -> error
    end
  end

  @doc "Cancel an order by orderId"
  def cancel_order(symbol, order_id, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = opts[:market_type] || "spot"

    url = case market_type do
      "usds_futures" -> usds_futures_order_url(credentials)
      "coinm_futures" -> coinm_futures_order_url(credentials)
      _ -> spot_url(credentials) <> "/v3/order"
    end

    params = %{
      "symbol" => trading_symbol,
      "orderId" => order_id
    }

    case signed_request(:delete, url, params, credentials) do
      {:ok, order} ->
        Logger.info("Binance cancel_order response: symbol=#{trading_symbol} orderId=#{order_id} market=#{market_type} | status=#{order["status"]} | raw=#{inspect(order)}")
        {:ok, %{
          order_id: order["orderId"],
          status: order["status"],
          symbol: order["symbol"]
        }}
      {:error, reason} = err ->
        Logger.warning("Binance cancel_order FAILED: symbol=#{trading_symbol} orderId=#{order_id} market=#{market_type} | error=#{inspect(reason)}")
        err
    end
  end

  @doc "Get all open orders for a symbol"
  def get_open_orders(symbol, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = opts[:market_type] || "spot"

    url = case market_type do
      "usds_futures" ->
        base = resolve_futures_base_url(credentials)
        base <> "/v1/openOrders"
      "coinm_futures" ->
        base = Map.get(credentials, :coinm_futures_base_url) || Map.get(credentials, :futures_base_url) || ""
        base <> "/v1/openOrders"
      _ ->
        spot_url(credentials) <> "/v3/openOrders"
    end

    params = %{"symbol" => trading_symbol}

    case signed_request(:get, url, params, credentials) do
      {:ok, orders} when is_list(orders) ->
        Logger.info("Binance get_open_orders: symbol=#{trading_symbol} market=#{market_type} | count=#{length(orders)} | sample=#{inspect(Enum.take(orders, 2))}")
        parsed = Enum.map(orders, fn order ->
          %{
            order_id: order["orderId"],
            client_order_id: order["clientOrderId"],
            symbol: order["symbol"],
            side: order["side"],
            type: order["type"],
            price: parse_float_safe(order["price"]),
            quantity: parse_float_safe(order["origQty"]),
            executed_qty: parse_float_safe(order["executedQty"]),
            status: order["status"],
            time: order["time"]
          }
        end)
        {:ok, parsed}
      error -> error
    end
  end

  # ========================================================================
  # POSITION & ORDER QUERIES — for reconciliation and analytics
  # ========================================================================

  @doc """
  Get futures position risk for all positions or a specific symbol.
  Calls /fapi/v2/positionRisk (USDS-M futures).
  Returns list of positions with entry price, position amount, unrealized PnL.
  """
  def get_position_risk(credentials, opts \\ []) do
    futures_url = resolve_futures_base_url(credentials)

    if futures_url == "" do
      {:error, :no_futures_url_configured}
    else
      params = case Keyword.get(opts, :symbol) do
        nil -> %{}
        sym -> %{"symbol" => normalize_symbol(sym, :trading)}
      end

      case signed_request(:get, futures_url <> "/v2/positionRisk", params, credentials) do
        {:ok, positions} when is_list(positions) ->
          non_zero = Enum.filter(positions, fn p ->
            amt = parse_float_safe(p["positionAmt"])
            amt != 0.0
          end)

          Logger.info("Binance positionRisk: url=#{futures_url}/v2/positionRisk total=#{length(positions)} non_zero=#{length(non_zero)} | raw_non_zero=#{inspect(non_zero)}")

          parsed = Enum.map(non_zero, fn p ->
            %{
              symbol: p["symbol"],
              position_side: p["positionSide"],
              position_amount: parse_float_safe(p["positionAmt"]),
              entry_price: parse_float_safe(p["entryPrice"]),
              mark_price: parse_float_safe(p["markPrice"]),
              unrealized_pnl: parse_float_safe(p["unRealizedProfit"]),
              liquidation_price: parse_float_safe(p["liquidationPrice"]),
              leverage: parse_float_safe(p["leverage"]),
              margin_type: p["marginType"],
              notional: parse_float_safe(p["notional"]),
              update_time: p["updateTime"]
            }
          end)

          {:ok, parsed}

        {:ok, %{"code" => code, "msg" => msg}} ->
          {:error, %{code: code, message: msg}}

        error ->
          error
      end
    end
  end

  @doc """
  Get all orders for a symbol (including historical).
  Calls /fapi/v1/allOrders (futures) or /api/v3/allOrders (spot).
  """
  def get_all_orders(symbol, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = Keyword.get(opts, :market_type, "spot")
    limit = Keyword.get(opts, :limit, 50)

    url = case market_type do
      "usds_futures" -> resolve_futures_base_url(credentials) <> "/v1/allOrders"
      _ -> spot_url(credentials) <> "/v3/allOrders"
    end

    params = %{
      "symbol" => trading_symbol,
      "limit" => limit
    }

    case signed_request(:get, url, params, credentials) do
      {:ok, orders} when is_list(orders) ->
        parsed = Enum.map(orders, fn order ->
          %{
            order_id: order["orderId"],
            client_order_id: order["clientOrderId"],
            symbol: order["symbol"],
            side: order["side"],
            type: order["type"],
            status: order["status"],
            price: parse_float_safe(order["price"]),
            avg_price: parse_float_safe(order["avgPrice"]),
            quantity: parse_float_safe(order["origQty"]),
            executed_qty: parse_float_safe(order["executedQty"]),
            cumulative_quote_qty: parse_float_safe(order["cumQuote"] || order["cummulativeQuoteQty"]),
            time: order["time"],
            update_time: order["updateTime"]
          }
        end)
        {:ok, parsed}

      error ->
        error
    end
  end

  @doc """
  Get recent trades (fills) for a symbol.
  Calls /fapi/v1/userTrades (futures) or /api/v3/myTrades (spot).
  """
  def get_user_trades(symbol, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = Keyword.get(opts, :market_type, "spot")
    limit = Keyword.get(opts, :limit, 50)

    url = case market_type do
      "usds_futures" -> resolve_futures_base_url(credentials) <> "/v1/userTrades"
      _ -> spot_url(credentials) <> "/v3/myTrades"
    end

    params = %{
      "symbol" => trading_symbol,
      "limit" => limit
    }

    case signed_request(:get, url, params, credentials) do
      {:ok, trades} when is_list(trades) ->
        parsed = Enum.map(trades, fn t ->
          %{
            trade_id: t["id"],
            order_id: t["orderId"],
            symbol: t["symbol"],
            side: t["side"],
            price: parse_float_safe(t["price"]),
            quantity: parse_float_safe(t["qty"]),
            quote_qty: parse_float_safe(t["quoteQty"]),
            commission: parse_float_safe(t["commission"]),
            commission_asset: t["commissionAsset"],
            realized_pnl: parse_float_safe(t["realizedPnl"]),
            maker: t["maker"] || t["isMaker"],
            time: t["time"]
          }
        end)
        {:ok, parsed}

      error ->
        error
    end
  end

  @doc """
  Get 24hr ticker statistics for a symbol.
  Calls /fapi/v1/ticker/24hr (futures) or /api/v3/ticker/24hr (spot).
  """
  def get_24h_ticker(symbol, credentials, opts \\ []) do
    trading_symbol = normalize_symbol(symbol, :trading)
    market_type = Keyword.get(opts, :market_type, "spot")

    url = case market_type do
      "usds_futures" -> resolve_futures_base_url(credentials) <> "/v1/ticker/24hr"
      _ -> spot_url(credentials) <> "/v3/ticker/24hr"
    end

    params = %{"symbol" => trading_symbol}

    case signed_request(:get, url, params, credentials) do
      {:ok, data} when is_map(data) ->
        {:ok, %{
          symbol: data["symbol"],
          price_change: parse_float_safe(data["priceChange"]),
          price_change_pct: parse_float_safe(data["priceChangePercent"]),
          weighted_avg_price: parse_float_safe(data["weightedAvgPrice"]),
          last_price: parse_float_safe(data["lastPrice"]),
          open_price: parse_float_safe(data["openPrice"]),
          high_price: parse_float_safe(data["highPrice"]),
          low_price: parse_float_safe(data["lowPrice"]),
          volume: parse_float_safe(data["volume"]),
          quote_volume: parse_float_safe(data["quoteVolume"]),
          open_time: data["openTime"],
          close_time: data["closeTime"],
          count: data["count"]
        }}

      error ->
        error
    end
  end

  @doc """
  Get exchange info with filters for specific symbols.
  Returns price filter, lot size, min notional for each symbol.
  """
  def get_exchange_info(credentials, opts \\ []) do
    market_type = Keyword.get(opts, :market_type, "spot")

    url = case market_type do
      "usds_futures" -> resolve_futures_base_url(credentials) <> "/v1/exchangeInfo"
      _ -> spot_url(credentials) <> "/v3/exchangeInfo"
    end

    # exchangeInfo doesn't need signing
    case HTTPoison.get(url, [], timeout: 15_000, recv_timeout: 15_000) do
      {:ok, %{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"symbols" => symbols}} ->
            parsed = Enum.map(symbols, fn s ->
              filters = s["filters"] || []

              price_filter = Enum.find(filters, fn f -> f["filterType"] == "PRICE_FILTER" end)
              lot_size = Enum.find(filters, fn f -> f["filterType"] == "LOT_SIZE" end)
              min_notional = Enum.find(filters, fn f -> f["filterType"] in ["MIN_NOTIONAL", "NOTIONAL"] end)

              %{
                symbol: s["symbol"],
                status: s["status"],
                base_asset: s["baseAsset"],
                quote_asset: s["quoteAsset"],
                price_precision: s["pricePrecision"],
                quantity_precision: s["quantityPrecision"],
                tick_size: price_filter && parse_float_safe(price_filter["tickSize"]),
                min_price: price_filter && parse_float_safe(price_filter["minPrice"]),
                max_price: price_filter && parse_float_safe(price_filter["maxPrice"]),
                step_size: lot_size && parse_float_safe(lot_size["stepSize"]),
                min_qty: lot_size && parse_float_safe(lot_size["minQty"]),
                max_qty: lot_size && parse_float_safe(lot_size["maxQty"]),
                min_notional: min_notional && parse_float_safe(min_notional["minNotional"] || min_notional["notional"])
              }
            end)

            {:ok, parsed}

          _ ->
            {:error, :decode_error}
        end

      {:ok, %{status_code: code, body: body}} ->
        {:error, {code, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Set leverage for a futures symbol.
  Calls POST /fapi/v1/leverage.
  """
  def set_leverage(symbol, leverage, credentials) do
    futures_url = resolve_futures_base_url(credentials)
    if futures_url == "" do
      {:error, :no_futures_url_configured}
    else
      trading_symbol = normalize_symbol(symbol, :trading)
      params = %{"symbol" => trading_symbol, "leverage" => leverage}

      case signed_request(:post, futures_url <> "/v1/leverage", params, credentials) do
        {:ok, data} when is_map(data) ->
          {:ok, %{
            symbol: data["symbol"],
            leverage: data["leverage"],
            max_notional_value: data["maxNotionalValue"]
          }}
        {:ok, %{"code" => code, "msg" => msg}} ->
          {:error, %{code: code, message: msg}}
        error -> error
      end
    end
  end

  @doc """
  Get income history (funding fees, realized PnL, commissions, etc.).
  Calls GET /fapi/v1/income.
  """
  def get_income_history(credentials, opts \\ []) do
    futures_url = resolve_futures_base_url(credentials)
    if futures_url == "" do
      {:error, :no_futures_url_configured}
    else
      params = %{"limit" => Keyword.get(opts, :limit, 100)}
      params = if sym = Keyword.get(opts, :symbol), do: Map.put(params, "symbol", normalize_symbol(sym, :trading)), else: params
      params = if type = Keyword.get(opts, :income_type), do: Map.put(params, "incomeType", type), else: params
      params = if st = Keyword.get(opts, :start_time), do: Map.put(params, "startTime", st), else: params
      params = if et = Keyword.get(opts, :end_time), do: Map.put(params, "endTime", et), else: params

      case signed_request(:get, futures_url <> "/v1/income", params, credentials) do
        {:ok, records} when is_list(records) ->
          parsed = Enum.map(records, fn r ->
            %{
              symbol: r["symbol"],
              income_type: r["incomeType"],
              income: parse_float_safe(r["income"]),
              asset: r["asset"],
              info: r["info"],
              time: r["time"],
              tran_id: r["tranId"],
              trade_id: r["tradeId"]
            }
          end)
          {:ok, parsed}
        {:ok, %{"code" => code, "msg" => msg}} ->
          {:error, %{code: code, message: msg}}
        error -> error
      end
    end
  end

  # ========================================================================
  # PRIVATE — HMAC-signed requests
  # ========================================================================

  defp estimate_weight(url, method) do
    cond do
      String.contains?(url, "/openOrders") -> 3
      String.contains?(url, "/order") and method == :post -> 1
      String.contains?(url, "/order") and method == :delete -> 1
      String.contains?(url, "/order") -> 2
      String.contains?(url, "/positionRisk") -> 5
      String.contains?(url, "/account") -> 5
      String.contains?(url, "/userTrades") -> 5
      String.contains?(url, "/exchangeInfo") -> 10
      String.contains?(url, "/leverage") -> 1
      true -> 1
    end
  end

  defp signed_request(method, url, params, credentials, retries \\ 2) do
    # Enforce rate limits before making the request
    weight = estimate_weight(url, method)
    rate_type = if String.contains?(url, "/order") and method == :post, do: :orders_second, else: :weight

    result =
      case acquire_rate_limit(rate_type, weight) do
        :ok -> do_signed_request(method, url, params, credentials)
        {:error, :rate_limited, wait_ms} ->
          Logger.warning("Binance rate limited — waiting #{wait_ms}ms before retry")
          Process.sleep(min(wait_ms, 5_000))
          do_signed_request(method, url, params, credentials)
      end

    case result do
      {:error, reason} when retries > 0 ->
        if retryable_network_error?(reason) do
          backoff_ms = (3 - retries) * 1_000
          Logger.warning("Binance network error, retrying in #{backoff_ms}ms (#{retries} left): #{inspect(reason)}")
          Process.sleep(backoff_ms)
          signed_request(method, url, params, credentials, retries - 1)
        else
          {:error, reason}
        end

      other ->
        other
    end
  end

  # Only retry on network-level failures — never on auth, rate limit, or business logic errors
  defp retryable_network_error?(reason) do
    case reason do
      :timeout -> true
      :connect_timeout -> true
      :checkout_timeout -> true
      :closed -> true
      :econnrefused -> true
      :econnreset -> true
      :ehostunreach -> true
      :enetunreach -> true
      %{auth_failed: true} -> false
      %{rate_limited: true} -> false
      %{code: _} -> false
      _ -> false
    end
  end

  defp do_signed_request(method, url, params, credentials) do
    timestamp = System.system_time(:millisecond)

    params_with_ts = params
      |> Map.put("timestamp", timestamp)
      |> Map.put("recvWindow", "5000")
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
      :delete -> "#{url}?#{final_query}"
      :post -> url
    end

    result = case method do
      :get -> HTTPoison.get(final_url, headers, timeout: @http_timeout_ms, recv_timeout: @http_timeout_ms)
      :delete -> HTTPoison.delete(final_url, headers, timeout: @http_timeout_ms, recv_timeout: @http_timeout_ms)
      :post -> HTTPoison.post(final_url, final_query, headers, timeout: @http_timeout_ms, recv_timeout: @http_timeout_ms)
    end

    case result do
      {:ok, %{status_code: 200, body: body, headers: resp_headers}} ->
        # Update rate limiter with actual usage from response headers
        try do
          TradeEngine.Exchanges.Binance.RateLimiter.update_from_headers(resp_headers)
        rescue
          _ -> :ok
        end
        Jason.decode(body)

      {:ok, %{status_code: 200, body: body}} ->
        Jason.decode(body)

      {:ok, %{status_code: code, body: body}} when code in [401, 403] ->
        cred_id = Map.get(credentials, :credential_id, "unknown")
        Logger.error("Binance AUTH error [#{code}]: url=#{url} | cred_id=#{cred_id} | body=#{body}")
        # Only invalidate cache for futures auth failures (spot may have different permissions)
        is_futures_url = String.contains?(url, "fapi") or String.contains?(url, "dapi")
        if is_futures_url do
          try do
            credential_id = Map.get(credentials, :credential_id)
            if credential_id, do: TradeEngine.Exchanges.Executor.invalidate_cache(credential_id)
          rescue
            _ -> :ok
          end
        end
        {:error, %{code: code, body: body, auth_failed: true}}

      {:ok, %{status_code: 429, body: body}} ->
        Logger.warning("Binance rate limited [429]: #{body}")
        {:error, %{code: 429, body: body, rate_limited: true}}

      {:ok, %{status_code: code, body: body}} ->
        Logger.error("Binance API error [#{code}]: url=#{url} | method=#{method} | body=#{body}")
        {:error, %{code: code, body: body}}

      {:error, %HTTPoison.Error{reason: reason}} ->
        {:error, reason}
    end
  end

  defp acquire_rate_limit(type, count) do
    try do
      TradeEngine.Exchanges.Binance.RateLimiter.acquire(type, count)
    rescue
      _ -> :ok  # Don't block trading if rate limiter is down
    end
  end

  # ========================================================================
  # PRIVATE — Helpers
  # ========================================================================

  defp spot_url(credentials), do: credentials.base_url <> "/api"

  defp resolve_futures_base_url(credentials) do
    case Map.get(credentials, :usds_futures_base_url) || Map.get(credentials, :futures_base_url) do
      nil ->
        Logger.warning("Binance: no futures_base_url configured in credentials")
        ""
      url -> url
    end
  end

  defp usds_futures_order_url(credentials) do
    base = resolve_futures_base_url(credentials)
    base <> "/v1/order"
  end

  defp coinm_futures_order_url(credentials) do
    base = case Map.get(credentials, :coinm_futures_base_url) || Map.get(credentials, :futures_base_url) do
      nil ->
        Logger.warning("Binance: no coinm_futures_base_url configured in credentials")
        ""
      url -> url
    end
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

  defp format_price(price) when is_float(price) do
    # Use enough decimals to cover most tick sizes (8 is Binance's max)
    :erlang.float_to_binary(price, decimals: 8)
    |> String.trim_trailing("0")
    |> String.trim_trailing(".")
  end
  defp format_price(price) when is_integer(price), do: Integer.to_string(price)
  defp format_price(price) when is_binary(price), do: price

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
