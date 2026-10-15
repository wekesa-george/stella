defmodule TradeEngine.Orchestrator.Alpaca.Client do
  @moduledoc """
  🚀 Alpaca Crypto Trading Client (Paper Account)
  
  ✅ DUAL API SUPPORT:
  - Trading API: https://paper-api.alpaca.markets/v2 (orders, positions, account)
  - Data API: https://data.alpaca.markets/v1beta3 (market data, bars)
  
  ✅ FEATURES:
  - Crypto pairs (BTCUSD, ETHUSD, etc.)
  - Bracket orders (auto TP/SL)
  - Position management
  - Account balance tracking
  - Market data & historical bars
  
  ✅ CRYPTO PAIR FORMAT:
  - Trading API: BTCUSD (no slashes)
  - Data API: BTC/USD (with slashes)
  - This module handles conversion automatically
  """
  require Logger

  # ========== CONFIGURATION ==========
  
  defp trading_base_url, do: Application.get_env(:trade_engine, :alpaca)[:base_url]
  defp data_base_url, do: "https://data.alpaca.markets"
  
  defp api_key, do: Application.get_env(:trade_engine, :alpaca)[:api_key]
  defp secret_key, do: Application.get_env(:trade_engine, :alpaca)[:secret_key]
  
  # Optional: separate data API credentials (falls back to trading credentials)
  defp data_api_key, do: 
    Application.get_env(:trade_engine, :alpaca)[:data_api_key] || api_key()
  defp data_secret_key, do: 
    Application.get_env(:trade_engine, :alpaca)[:data_secret_key] || secret_key()

  # Timeouts
  @http_timeout_ms 5_000
  @trading_timeout_ms 10_000
  @data_timeout_ms 8_000

  # ========== ACCOUNT & POSITIONS (TRADING API) ==========

  @doc "Get account details (buying power, equity, cash balance)"
  def get_account do
    request(:get, trading_base_url(), "/v2/account", api_key(), secret_key(), @trading_timeout_ms)
  end

  @doc "Get all open positions"
  def get_positions do
    request(:get, trading_base_url(), "/v2/positions", api_key(), secret_key(), @trading_timeout_ms)
  end

  @doc "Get specific position for a symbol (e.g., BTCUSD)"
  def get_position(symbol) do
    symbol = normalize_symbol_for_trading(symbol)
    request(:get, trading_base_url(), "/v2/positions/#{symbol}", api_key(), secret_key(), @trading_timeout_ms)
  end

  # ========== ORDER MANAGEMENT (TRADING API) ==========

  @doc """
  Places a market order for crypto.
  
  Examples:
    place_market_order("BTCUSD", "buy", 0.1)
    place_market_order("ETHUSD", "sell", 2.5)
  """
  def place_market_order(symbol, side, qty) when side in ["buy", "sell"] do
    body = %{
      symbol: normalize_symbol_for_trading(symbol),
      qty: Float.to_string(qty),
      side: side,
      type: "market",
      time_in_force: "gtc"
    }
    request(:post, trading_base_url(), "/v2/orders", api_key(), secret_key(), @trading_timeout_ms, body)
  end

  @doc """
  Places a bracket order with automatic Take Profit and Stop Loss.
  
  Ideal for automated crypto trading - ensures risk management is set immediately.
  
  Examples:
    place_bracket_order("BTCUSD", "buy", 0.1, 45000.0, 47250.0, 44100.0)
    # Entry: $45k, TP: $47.25k (+5%), SL: $44.1k (-2%)
  """
  def place_bracket_order(symbol, side, qty, limit_price, tp_price, sl_price) when side in ["buy", "sell"] do
    body = %{
      symbol: normalize_symbol_for_trading(symbol),
      qty: Float.to_string(qty),
      side: side,
      type: "limit",
      limit_price: Float.to_string(limit_price),
      time_in_force: "gtc",
      order_class: "bracket",
      take_profit: %{
        limit_price: Float.to_string(tp_price)
      },
      stop_loss: %{
        stop_price: Float.to_string(sl_price)
      }
    }
    request(:post, trading_base_url(), "/v2/orders", api_key(), secret_key(), @trading_timeout_ms, body)
  end

  @doc "Close all positions for a specific symbol (market order)"
  def close_position(symbol) do
    symbol = normalize_symbol_for_trading(symbol)
    request(:delete, trading_base_url(), "/v2/positions/#{symbol}", api_key(), secret_key(), @trading_timeout_ms)
  end

  @doc "Get order status by order ID"
  def get_order(order_id) do
    request(:get, trading_base_url(), "/v2/orders/#{order_id}", api_key(), secret_key(), @trading_timeout_ms)
  end

  @doc "Cancel an order by order ID"
  def cancel_order(order_id) do
    request(:delete, trading_base_url(), "/v2/orders/#{order_id}", api_key(), secret_key(), @trading_timeout_ms)
  end

  # ========== MARKET DATA (DATA API) ==========

  @doc """
  Fetch historical bars (candles) from Alpaca Data API.

  Examples:
    get_bars("BTCUSD", "4Hour", 12)
    get_bars("ETHUSD", "5Min", 30)

  Returns: {:ok, [%{"o" => ..., "h" => ..., "l" => ..., "c" => ..., "v" => ...}, ...]}
  """
  def get_bars(symbol, timeframe, limit) do
    symbol_with_slash = normalize_symbol_for_data(symbol)
    
    query_params = URI.encode_query(%{
      "symbols" => symbol_with_slash,
      "timeframe" => timeframe,
      "limit" => limit,
      "sort" => "asc"
    })

    case request(:get, data_base_url(), "/v1beta3/crypto/us/bars", data_api_key(), data_secret_key(), @data_timeout_ms, %{}, query_params) do
      {:ok, response} ->
        #Logger.debug("📊 Alpaca bars response for #{symbol_with_slash}: #{inspect(response)}")
        
        case response do
          %{"bars" => bars_map} when is_map(bars_map) ->
            # Response format: {"bars": {"BTC/USD": [...]}}
            bars_data = Map.get(bars_map, symbol_with_slash)
            
            case bars_data do
              bars when is_list(bars) and length(bars) > 0 ->
                formatted = Enum.map(bars, fn bar ->
                  %{
                    "o" => bar["o"],
                    "h" => bar["h"],
                    "l" => bar["l"],
                    "c" => bar["c"],
                    "v" => bar["v"] || 0
                  }
                end)
                #Logger.debug("✅ Alpaca bars #{symbol}: #{length(formatted)} candles (#{timeframe})")
                {:ok, formatted}
              
              [] ->
                Logger.debug("⚠️ Empty bars array for #{symbol_with_slash}")
                {:error, "no_bars"}
              
              nil ->
                # Symbol not found in response - try without slash
                case Map.get(bars_map, symbol) do
                  bars when is_list(bars) and length(bars) > 0 ->
                    formatted = Enum.map(bars, fn bar ->
                      %{
                        "o" => bar["o"],
                        "h" => bar["h"],
                        "l" => bar["l"],
                        "c" => bar["c"],
                        "v" => bar["v"] || 0
                      }
                    end)
                    Logger.debug("✅ Alpaca bars #{symbol}: #{length(formatted)} candles (#{timeframe})")
                    {:ok, formatted}
                  
                  _ ->
                    Logger.debug("⚠️ Symbol #{symbol_with_slash} not in bars response. Available: #{Map.keys(bars_map) |> inspect()}")
                    {:error, "symbol_not_found"}
                end
              
              _ ->
                Logger.debug("⚠️ Unexpected bars format: #{inspect(bars_data)}")
                {:error, "invalid_bars_format"}
            end
          
          %{"message" => msg} ->
            Logger.debug("⚠️ API message: #{msg}")
            {:error, msg}
          
          _ ->
            Logger.debug("⚠️ Unexpected response structure: #{inspect(response)}")
            {:error, "invalid_response"}
        end
      
      {:error, reason} ->
        Logger.debug("❌ Bars fetch error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc "Debug: Fetch and inspect raw bars response"
  def debug_get_bars(symbol, timeframe \\ "1Hour", limit \\ 5) do
    symbol_with_slash = normalize_symbol_for_data(symbol)
    
    query_params = URI.encode_query(%{
      "symbols" => symbol_with_slash,
      "timeframe" => timeframe,
      "limit" => limit,
      "sort" => "asc"
    })

    Logger.info("🔍 DEBUG: Fetching bars for #{symbol_with_slash}")
    Logger.info("   Timeframe: #{timeframe}")
    Logger.info("   Limit: #{limit}")
    
    case request(:get, data_base_url(), "/v1beta3/crypto/us/bars", data_api_key(), data_secret_key(), @data_timeout_ms, %{}, query_params) do
      {:ok, response} ->
        Logger.info("✅ Raw response: #{Jason.encode!(response, pretty: true)}")
        {:ok, response}
      
      {:error, reason} ->
        Logger.error("❌ Error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc "List known working crypto symbols"
  def known_working_symbols do
    [
      "BTCUSD",
      "ETHUSD",
      "SOLUSD",
      "DOGEUSD",
      "XRPUSD",
      "ADAUSD",
      "LTCUSD",
      "AVAXUSD"
    ]
  end


  @doc """
  Get latest quote (bid/ask) for a crypto symbol.
  
  Example:
    get_latest_quote("BTCUSD")
    # Returns: {:ok, %{"ap" => 47250.50, "bp" => 47250.00, ...}}
  """
  def get_latest_quote(symbol) do
    symbol_with_slash = normalize_symbol_for_data(symbol)
    
    query_params = URI.encode_query(%{
      "symbols" => symbol_with_slash
    })

    case request(:get, data_base_url(), "/v1beta3/crypto/us/latest/quotes", data_api_key(), data_secret_key(), @data_timeout_ms, %{}, query_params) do
      {:ok, %{"quotes" => quotes_map}} when is_map(quotes_map) ->
        case Map.get(quotes_map, symbol_with_slash) do
          quote when is_map(quote) ->
            Logger.debug("✅ Alpaca quote #{symbol}: bid=$#{quote["bp"]} ask=$#{quote["ap"]}")
            {:ok, quote}
          
          _ ->
            {:error, "no_quote"}
        end
      
      {:error, reason} ->
        {:error, reason}
    end
  end

  # ========== HTTP REQUEST HANDLER ==========

  defp request(method, base_url, endpoint, api_key_val, secret_key_val, timeout, body \\ %{}, query_params \\ nil) do
    # 🚦 Acquire throttle slot BEFORE making the request
    :ok = TradeEngine.MarketData.APIThrottle.acquire(timeout)
    
    url = build_url(base_url, endpoint, query_params)
    headers = get_headers(api_key_val, secret_key_val)
    json_body = if body == %{}, do: "", else: Jason.encode!(body)

    options = [recv_timeout: timeout, timeout: timeout]

    result = case method do
      :get -> HTTPoison.get(url, headers, options)
      :post -> HTTPoison.post(url, json_body, headers, options)
      :delete -> HTTPoison.delete(url, headers, options)
    end

    # Handle 429 responses by signaling throttler
    case result do
      {:ok, %HTTPoison.Response{status_code: 429}} ->
        Logger.warning("⚠️ Alpaca 429 - triggering backoff")
        TradeEngine.MarketData.APIThrottle.on_rate_limit_error()
      
      _ ->
        nil
    end

    handle_response(result, method, endpoint)
  end

  defp build_url(base_url, endpoint, nil), do: base_url <> endpoint
  defp build_url(base_url, endpoint, query_params), do: base_url <> endpoint <> "?" <> query_params

  defp get_headers(api_key_val, secret_key_val) do
    if is_nil(api_key_val) or is_nil(secret_key_val) do
      Logger.error("❌ Missing Alpaca credentials - set ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables")
      []
    else
      [
        {"APCA-API-KEY-ID", api_key_val},
        {"APCA-API-SECRET-KEY", secret_key_val},
        {"Content-Type", "application/json"}
      ]
    end
  end

  defp handle_response({:ok, %HTTPoison.Response{status_code: code, body: body}}, _method, endpoint) when code in 200..299 do
    case Jason.decode(body) do
      {:ok, data} ->
        #Logger.debug("✅ Alpaca #{endpoint}: #{code}")
        {:ok, data}
      
      {:error, _} ->
        # Handle empty responses (e.g., successful deletes)
        if byte_size(body) == 0, do: {:ok, %{}}, else: {:ok, body}
    end
  end

  defp handle_response({:ok, %HTTPoison.Response{status_code: code, body: body}}, method, endpoint) do
    Logger.error("❌ Alpaca API Error [#{code}] #{method |> to_string() |> String.upcase()} #{endpoint}")
    Logger.error("   Response: #{inspect(body)}")
    {:error, parse_error_message(body)}
  end

  defp handle_response({:error, %HTTPoison.Error{reason: reason}}, _method, endpoint) do
    Logger.error("❌ Alpaca Network Error on #{endpoint}: #{inspect(reason)}")
    {:error, reason}
  end

  defp handle_response({:error, reason}, _method, endpoint) do
    Logger.error("❌ Alpaca Request Failed on #{endpoint}: #{inspect(reason)}")
    {:error, reason}
  end

  defp parse_error_message(body) do
    case Jason.decode(body) do
      {:ok, %{"message" => msg}} -> msg
      {:ok, error_map} -> inspect(error_map)
      {:error, _} -> body
    end
  end

  # ========== SYMBOL NORMALIZATION ==========

  @doc """
  Normalizes symbol for Alpaca TRADING API.
  
  Alpaca crypto pairs ALWAYS end with USD:
    "BTC/USD" → "BTCUSD"
    "BTCUSD" → "BTCUSD"
    "BTC" → "BTCUSD"
  """
  def normalize_symbol_for_trading(symbol) do
    normalized = symbol
      |> String.upcase()
      |> String.replace("/", "")
      |> String.replace("USDT", "USD")
    
    if String.ends_with?(normalized, "USD") do
      normalized
    else
      normalized <> "USD"
    end
  end

  @doc """
  Normalizes symbol for Alpaca DATA API (uses slashes).
  
  Converts to BTC/USD format for data endpoints:
    "BTCUSD" → "BTC/USD"
    "BTC/USD" → "BTC/USD"
    "BTC" → "BTC/USD"
  """
  def normalize_symbol_for_data(symbol) do
    # First normalize to BTCUSD format
    normalized = normalize_symbol_for_trading(symbol)
    
    # Then add slash: BTCUSD → BTC/USD
    size = String.length(normalized)
    prefix_size = size - 3
    
    if prefix_size > 0 do
      # FIXED: Use 3..-1//1 syntax for Elixir 1.18+
      String.slice(normalized, 0..prefix_size - 1) <> "/" <> String.slice(normalized, prefix_size..-1//1)
    else
      normalized <> "/USD"
    end
  end

  # Keep old function name for backwards compatibility
  def normalize_symbol(symbol), do: normalize_symbol_for_trading(symbol)

  # ========== TESTING ==========

  @doc "Test connection and credentials"
  def test_connection do
    case get_account() do
      {:ok, account} ->
        Logger.info("✅ Alpaca Connection Verified")
        Logger.info("   Account: #{account["account_number"]}")
        Logger.info("   Status: #{account["status"]}")
        Logger.info("   Buying Power: $#{account["buying_power"]}")
        {:ok, account}
      
      {:error, reason} ->
        Logger.error("❌ Alpaca Connection Failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc "Test data API connection"
  def test_data_connection do
    case get_bars("BTCUSD", "1Hour", 1) do
      {:ok, _bars} ->
        Logger.info("✅ Alpaca Data API Connection Verified")
        {:ok, "data_ok"}
      
      {:error, reason} ->
        Logger.error("❌ Alpaca Data API Connection Failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc "Test both APIs"
  def test_all_connections do
    Logger.info("🧪 Testing Alpaca connections...")
    
    trading_result = test_connection()
    data_result = test_data_connection()
    
    case {trading_result, data_result} do
      {{:ok, _}, {:ok, _}} -> 
        Logger.info("✅ Both APIs ready!")
        {:ok, "all_ready"}
      
      _ -> 
        Logger.error("❌ Connection test failed")
        {:error, "connection_failed"}
    end
  end
end