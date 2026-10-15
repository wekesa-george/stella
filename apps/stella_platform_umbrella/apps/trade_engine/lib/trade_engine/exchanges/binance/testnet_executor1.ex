defmodule TradeEngine.Exchanges.Binance.TestnetExecutor1 do
  @moduledoc """
  🚀 BINANCE EXECUTION MODULE
  
  Executes real trades on Binance Demo or Testnet accounts.
  
  SUPPORTED ENVIRONMENTS:
  ═══════════════════════════════════════════════════════════════════════════════
  
  1. DEMO MODE (demo.binance.com) - RECOMMENDED ✅
     - Uses PRODUCTION API endpoints with virtual money
     - API keys from: https://demo.binance.com/en/my/settings/api-management
     - Spot: https://api.binance.com/api
     - Futures: https://fapi.binance.com/fapi
     - More realistic, better liquidity simulation
  
  2. TESTNET MODE (testnet.binance.vision)
     - Separate testnet infrastructure  
     - API keys from: https://testnet.binance.vision/
     - Spot: https://testnet.binance.vision/api
     - Futures: https://testnet.binancefuture.com/fapi
     - May have different symbols/precision rules
  
  ═══════════════════════════════════════════════════════════════════════════════
  
  CONFIGURATION (in config/runtime.exs):
  
    config :trade_engine,
      binance_mode: :demo,  # :demo or :testnet
      binance_api_key: System.get_env("BINANCE_API_KEY"),
      binance_api_secret: System.get_env("BINANCE_API_SECRET")
  
  ═══════════════════════════════════════════════════════════════════════════════
  
  EXECUTION FLOW:
  
  LONG POSITION (Bullish):
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │ ENTRY: execute_long()  →  SPOT BUY   →  Buy asset at market price          │
  │ EXIT:  close_long()    →  SPOT SELL  →  Sell asset, realize P&L            │
  └─────────────────────────────────────────────────────────────────────────────┘
  
  SHORT POSITION (Bearish):
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │ ENTRY: execute_short() →  FUTURES SELL  →  Open short position             │
  │ EXIT:  close_short()   →  FUTURES BUY   →  Cover short, realize P&L        │
  └─────────────────────────────────────────────────────────────────────────────┘
  
  ═══════════════════════════════════════════════════════════════════════════════
  """

  require Logger

  # ========================================================================
  # ENVIRONMENT CONFIGURATION
  # ========================================================================

  # Demo mode - uses PRODUCTION endpoints (with virtual money from demo.binance.com)
  @demo_spot_url "https://api.binance.com/api"
  @demo_futures_url "https://fapi.binance.com/fapi"

  # Testnet mode - uses separate testnet infrastructure
  @testnet_spot_url "https://testnet.binance.vision/api"
  @testnet_futures_url "https://testnet.binancefuture.com/fapi"

  # Get current mode from config (default: testnet - demo.binance.com requires IP whitelisting)
  defp mode do
    Application.get_env(:trade_engine, :binance_mode, :testnet)
  end

  defp spot_base_url do
    case mode() do
      :demo -> @demo_spot_url
      :testnet -> @testnet_spot_url
      _ -> @testnet_spot_url
    end
  end

  defp futures_base_url do
    case mode() do
      :demo -> @demo_futures_url
      :testnet -> @testnet_futures_url
      _ -> @testnet_futures_url
    end
  end
  
  # ========================================================================
  # API CREDENTIALS - Spot and Futures have SEPARATE keys on testnet!
  # ========================================================================
  #
  # IMPORTANT: Binance Spot Testnet and Futures Testnet are DIFFERENT systems
  # with DIFFERENT API keys. You need to get keys from BOTH:
  #
  #   Spot:    https://testnet.binance.vision/
  #   Futures: https://testnet.binancefuture.com/
  #
  # Configure in runtime.exs:
  #
  #   config :trade_engine,
  #     binance_mode: :testnet,
  #     # Spot Testnet credentials
  #     binance_spot_api_key: System.get_env("BINANCE_SPOT_API_KEY"),
  #     binance_spot_api_secret: System.get_env("BINANCE_SPOT_API_SECRET"),
  #     # Futures Testnet credentials  
  #     binance_futures_api_key: System.get_env("BINANCE_FUTURES_API_KEY"),
  #     binance_futures_api_secret: System.get_env("BINANCE_FUTURES_API_SECRET")
  #
  # OR use unified keys (if using demo mode or same keys):
  #     binance_api_key: System.get_env("BINANCE_API_KEY"),
  #     binance_api_secret: System.get_env("BINANCE_API_SECRET")
  #
  # ========================================================================

  defp spot_api_key do
    Application.get_env(:trade_engine, :binance_spot_api_key) ||
      Application.get_env(:trade_engine, :binance_api_key) ||
      Application.get_env(:trade_engine, :binance_testnet_api_key) ||
      System.get_env("BINANCE_SPOT_API_KEY") ||
      System.get_env("BINANCE_API_KEY") ||
      System.get_env("BINANCE_TESTNET_API_KEY") ||
      ""
  end
  
  defp spot_api_secret do
    Application.get_env(:trade_engine, :binance_spot_api_secret) ||
      Application.get_env(:trade_engine, :binance_api_secret) ||
      Application.get_env(:trade_engine, :binance_testnet_api_secret) ||
      System.get_env("BINANCE_SPOT_API_SECRET") ||
      System.get_env("BINANCE_API_SECRET") ||
      System.get_env("BINANCE_TESTNET_API_SECRET") ||
      ""
  end

  defp futures_api_key do
    Application.get_env(:trade_engine, :binance_futures_api_key) ||
      Application.get_env(:trade_engine, :binance_api_key) ||
      Application.get_env(:trade_engine, :binance_testnet_api_key) ||
      System.get_env("BINANCE_FUTURES_API_KEY") ||
      System.get_env("BINANCE_API_KEY") ||
      System.get_env("BINANCE_TESTNET_API_KEY") ||
      ""
  end
  
  defp futures_api_secret do
    Application.get_env(:trade_engine, :binance_futures_api_secret) ||
      Application.get_env(:trade_engine, :binance_api_secret) ||
      Application.get_env(:trade_engine, :binance_testnet_api_secret) ||
      System.get_env("BINANCE_FUTURES_API_SECRET") ||
      System.get_env("BINANCE_API_SECRET") ||
      System.get_env("BINANCE_TESTNET_API_SECRET") ||
      ""
  end

  @doc """
  Check current configuration and test connectivity
  """
  def config_info do
    %{
      mode: mode(),
      spot_url: spot_base_url(),
      futures_url: futures_base_url(),
      spot_api_key_configured: String.length(spot_api_key()) > 0,
      spot_api_secret_configured: String.length(spot_api_secret()) > 0,
      futures_api_key_configured: String.length(futures_api_key()) > 0,
      futures_api_secret_configured: String.length(futures_api_secret()) > 0,
      # Show if using same or different keys
      using_separate_keys: spot_api_key() != futures_api_key()
    }
  end

  @doc """
  Test API connectivity for both Spot and Futures
  """
  def test_connection do
    Logger.info("🔌 Testing Binance connection (mode: #{mode()})...")
    Logger.info("   Spot URL: #{spot_base_url()}")
    Logger.info("   Futures URL: #{futures_base_url()}")
    
    spot_result = case get_spot_balance() do
      {:ok, balances} ->
        Logger.info("✅ Spot connection OK - #{length(balances)} assets with balance")
        :ok
      {:error, reason} ->
        Logger.error("❌ Spot connection failed: #{inspect(reason)}")
        {:error, :spot_failed}
    end
    
    futures_result = case get_futures_balance() do
      {:ok, balances} ->
        Logger.info("✅ Futures connection OK - #{length(balances)} assets with balance")
        :ok
      {:error, reason} ->
        Logger.error("❌ Futures connection failed: #{inspect(reason)}")
        Logger.error("   ⚠️  Futures testnet requires SEPARATE API keys!")
        Logger.error("   ⚠️  Get them from: https://testnet.binancefuture.com/")
        {:error, :futures_failed}
    end
    
    case {spot_result, futures_result} do
      {:ok, :ok} -> {:ok, :both_connected}
      {:ok, _} -> {:partial, :spot_only}
      {_, :ok} -> {:partial, :futures_only}
      _ -> {:error, :both_failed}
    end
  end

  # ========================================================================
  # PUBLIC API - Called from SignalTrader
  # ========================================================================

  @doc """
  Execute a LONG position entry (SPOT BUY)
  Called when: SignalTrader detects bullish signal and enters LONG
  
  Options:
    - user_id: User executing the trade
    - position_id: Associated position ID
    - trading_account_id: Trading account ID
    - confidence: Signal confidence (0-100)
    - peak_price: Physics predicted peak price
    - peak_time: Physics predicted time to peak
  
  Returns: {:ok, %{order_id, executed_qty, executed_price}} | {:error, reason}
  """
  def execute_long(symbol, quantity, opts \\ []) do
    user_id = Keyword.get(opts, :user_id)
    position_id = Keyword.get(opts, :position_id)
    trading_account_id = Keyword.get(opts, :trading_account_id)
    confidence = Keyword.get(opts, :confidence)
    peak_price = Keyword.get(opts, :peak_price)
    peak_time = Keyword.get(opts, :peak_time)
    
    Logger.info("🟢 SPOT BUY: #{symbol} qty=#{Float.round(quantity, 6)}")
    
    case place_spot_order(symbol, "BUY", quantity) do
      {:ok, order} ->
        executed_price = extract_executed_price(order)
        executed_qty = extract_executed_qty(order)
        
        # Log transaction to database
        log_transaction(%{
          type: :spot_buy,
          action: :entry,
          direction: :long,
          symbol: symbol,
          quantity: executed_qty,
          price: executed_price,
          order_id: order["orderId"],
          client_order_id: order["clientOrderId"],
          status: order["status"],
          user_id: user_id,
          position_id: position_id,
          trading_account_id: trading_account_id,
          confidence: confidence,
          peak_price: peak_price,
          peak_time: peak_time,
          raw_response: order
        })
        
        {:ok, %{
          order_id: order["orderId"],
          executed_qty: executed_qty,
          executed_price: executed_price,
          status: order["status"]
        }}
      
      {:error, reason} = error ->
        log_transaction(%{
          type: :spot_buy,
          action: :entry,
          direction: :long,
          symbol: symbol,
          quantity: quantity,
          status: :failed,
          error: reason,
          user_id: user_id,
          position_id: position_id,
          trading_account_id: trading_account_id
        })
        error
    end
  end

  @doc """
  Close a LONG position (SPOT SELL)
  Called when: SignalTrader exits a LONG position (take profit, stop loss, or physics target)
  
  Returns: {:ok, %{order_id, executed_qty, executed_price, pnl}} | {:error, reason}
  """
  def close_long(symbol, quantity, entry_price, opts \\ []) do
    user_id = Keyword.get(opts, :user_id)
    position_id = Keyword.get(opts, :position_id)
    
    Logger.info("🔴 SPOT SELL: #{symbol} qty=#{Float.round(quantity, 6)}")
    
    case place_spot_order(symbol, "SELL", quantity) do
      {:ok, order} ->
        executed_price = extract_executed_price(order)
        executed_qty = extract_executed_qty(order)
        
        # Calculate realized P&L
        pnl = (executed_price - entry_price) * executed_qty
        pnl_pct = ((executed_price - entry_price) / entry_price) * 100
        
        Logger.info("💰 LONG CLOSED: #{symbol} | Entry: $#{Float.round(entry_price, 2)} Exit: $#{Float.round(executed_price, 2)} | P&L: $#{Float.round(pnl, 2)} (#{Float.round(pnl_pct, 2)}%)")
        
        log_transaction(%{
          type: :spot_sell,
          action: :exit,
          direction: :long,
          symbol: symbol,
          quantity: executed_qty,
          price: executed_price,
          entry_price: entry_price,
          pnl: pnl,
          pnl_percent: pnl_pct,
          order_id: order["orderId"],
          status: order["status"],
          user_id: user_id,
          position_id: position_id,
          raw_response: order
        })
        
        {:ok, %{
          order_id: order["orderId"],
          executed_qty: executed_qty,
          executed_price: executed_price,
          pnl: pnl,
          pnl_percent: pnl_pct,
          status: order["status"]
        }}
      
      {:error, reason} = error ->
        log_transaction(%{
          type: :spot_sell,
          action: :exit,
          direction: :long,
          symbol: symbol,
          quantity: quantity,
          status: :failed,
          error: reason,
          user_id: user_id,
          position_id: position_id
        })
        error
    end
  end

  @doc """
  Execute a SHORT position entry (SIMULATED - No Futures/Margin on Testnet)
  
  Since Binance Spot Testnet doesn't support Futures or Margin trading,
  we simulate SHORT positions with paper trading:
  - Record the entry price from real market data
  - Track P&L based on actual price movements
  - No actual exchange order (would need Futures testnet keys)
  
  Set @simulate_shorts to false once you have Futures testnet API keys.
  
  Options:
    - user_id: User executing the trade
    - position_id: Associated position ID
    - trading_account_id: Trading account ID
    - confidence: Signal confidence (0-100)
    - peak_price: Physics predicted trough price
    - peak_time: Physics predicted time to trough
  
  Returns: {:ok, %{order_id, executed_qty, executed_price}} | {:error, reason}
  """
  
  # Configuration: Set to false to use real Futures API (requires separate Futures testnet keys)
  @simulate_shorts true
  
  def execute_short(symbol, quantity, opts \\ []) do
    user_id = Keyword.get(opts, :user_id)
    position_id = Keyword.get(opts, :position_id)
    trading_account_id = Keyword.get(opts, :trading_account_id)
    confidence = Keyword.get(opts, :confidence)
    peak_price = Keyword.get(opts, :peak_price)
    peak_time = Keyword.get(opts, :peak_time)
    
    if @simulate_shorts do
      # SIMULATED SHORT - Paper trade using real market price
      Logger.info("🔴 SIMULATED SHORT: #{symbol} qty=#{Float.round(quantity, 6)} (paper trade)")
      
      case get_price(symbol) do
        {:ok, current_price} ->
          order_id = "SIM_SHORT_#{:erlang.system_time(:millisecond)}"
          
          log_transaction(%{
            type: :simulated_short,
            action: :entry,
            direction: :short,
            symbol: symbol,
            quantity: quantity,
            price: current_price,
            order_id: order_id,
            client_order_id: "PAPER_#{position_id}",
            status: "SIMULATED",
            user_id: user_id,
            position_id: position_id,
            trading_account_id: trading_account_id,
            confidence: confidence,
            peak_price: peak_price,
            peak_time: peak_time,
            raw_response: %{simulated: true, reason: "Futures/Margin not available on Spot Testnet"}
          })
          
          Logger.info("✅ SIMULATED SHORT OPENED: #{symbol} @ $#{Float.round(current_price, 4)}")
          
          {:ok, %{
            order_id: order_id,
            executed_qty: quantity,
            executed_price: current_price,
            status: "SIMULATED"
          }}
          
        {:error, reason} ->
          Logger.error("❌ Failed to get price for simulated short: #{inspect(reason)}")
          {:error, reason}
      end
    else
      # REAL FUTURES SHORT - Requires Futures Testnet API keys
      Logger.info("🔴 FUTURES SHORT: #{symbol} qty=#{Float.round(quantity, 6)}")
      
      case place_futures_order(symbol, "SELL", quantity) do
        {:ok, order} ->
          executed_price = extract_executed_price(order)
          executed_qty = extract_executed_qty(order)
          
          log_transaction(%{
            type: :futures_short,
            action: :entry,
            direction: :short,
            symbol: symbol,
            quantity: executed_qty,
            price: executed_price,
            order_id: order["orderId"],
            client_order_id: order["clientOrderId"],
            status: order["status"],
            user_id: user_id,
            position_id: position_id,
            trading_account_id: trading_account_id,
            confidence: confidence,
            peak_price: peak_price,
            peak_time: peak_time,
            raw_response: order
          })
          
          {:ok, %{
            order_id: order["orderId"],
            executed_qty: executed_qty,
            executed_price: executed_price,
            status: order["status"]
          }}
        
        {:error, reason} = error ->
          log_transaction(%{
            type: :futures_short,
            action: :entry,
            direction: :short,
            symbol: symbol,
            quantity: quantity,
            status: :failed,
            error: reason,
            user_id: user_id,
            position_id: position_id,
            trading_account_id: trading_account_id
          })
          error
      end
    end
  end

  @doc """
  Close a SHORT position (SIMULATED or FUTURES COVER)
  
  For simulated shorts: Calculate P&L from real price movement
  For real futures: Execute BUY to cover the short
  
  Returns: {:ok, %{order_id, executed_qty, executed_price, pnl}} | {:error, reason}
  """


  @doc """
  Get account balances (spot)
  """
  def get_spot_balance do
    case signed_request(:get, spot_base_url() <> "/v3/account", %{}, :spot) do
      {:ok, %{"balances" => balances}} ->
        non_zero = Enum.filter(balances, fn b ->
          {free, _} = Float.parse(b["free"] || "0")
          {locked, _} = Float.parse(b["locked"] || "0")
          free > 0 or locked > 0
        end)
        {:ok, non_zero}
      error -> error
    end
  end

  @doc """
  Get futures account balance
  """
  def get_futures_balance do
    case signed_request(:get, futures_base_url() <> "/v2/balance", %{}, :futures) do
      {:ok, balances} when is_list(balances) ->
        non_zero = Enum.filter(balances, fn b ->
          {balance, _} = Float.parse(b["balance"] || "0")
          balance > 0
        end)
        {:ok, non_zero}
      error -> error
    end
  end

  @doc """
  Get current price for a symbol
  """
  def get_price(symbol) do
    # Always use production API for prices (faster, more reliable)
    url = "https://api.binance.com/api/v3/ticker/price?symbol=#{symbol}"
    case HTTPoison.get(url, [], timeout: 5000, recv_timeout: 5000) do
      {:ok, %{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"price" => price}} -> {:ok, String.to_float(price)}
          _ -> {:error, :decode_error}
        end
      {:ok, %{status_code: code, body: body}} -> {:error, {code, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  # ========================================================================
  # PRIVATE - Order Placement
  # ========================================================================

  defp place_spot_order(symbol, side, quantity) do
    # Round quantity to appropriate precision
    qty_str = format_quantity(symbol, quantity)
    
    params = %{
      "symbol" => symbol,
      "side" => side,
      "type" => "MARKET",
      "quantity" => qty_str
    }
    
    Logger.debug("📤 SPOT ORDER: #{inspect(params)}")
    
    case signed_request(:post, spot_base_url() <> "/v3/order", params, :spot) do
      {:ok, response} ->
        Logger.info("✅ SPOT ORDER SUCCESS: #{response["orderId"]} | #{response["status"]}")
        {:ok, response}
      {:error, reason} ->
        Logger.error("❌ SPOT ORDER FAILED: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp place_futures_order(symbol, side, quantity) do
    qty_str = format_quantity(symbol, quantity)
    
    params = %{
      "symbol" => symbol,
      "side" => side,
      "type" => "MARKET",
      "quantity" => qty_str
    }
    
    Logger.debug("📤 FUTURES ORDER: #{inspect(params)}")
    
    case signed_request(:post, futures_base_url() <> "/v1/order", params, :futures) do
      {:ok, response} ->
        Logger.info("✅ FUTURES ORDER SUCCESS: #{response["orderId"]} | #{response["status"]}")
        {:ok, response}
      {:error, reason} ->
        Logger.error("❌ FUTURES ORDER FAILED: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ========================================================================
  # PRIVATE - Request Signing
  # ========================================================================

  # Default to spot credentials for backwards compatibility
  defp signed_request(method, url, params), do: signed_request(method, url, params, :spot)

  defp signed_request(method, url, params, credential_type) do
    timestamp = System.system_time(:millisecond)
    
    # Select correct API key/secret based on credential type
    {api_key, api_secret} = case credential_type do
      :futures -> {futures_api_key(), futures_api_secret()}
      :spot -> {spot_api_key(), spot_api_secret()}
      _ -> {spot_api_key(), spot_api_secret()}
    end
    
    params_with_ts = Map.put(params, "timestamp", timestamp)
    query_string = URI.encode_query(params_with_ts)
    
    signature = :crypto.mac(:hmac, :sha256, api_secret, query_string)
                |> Base.encode16(case: :lower)
    
    final_query = "#{query_string}&signature=#{signature}"
    
    headers = [
      {"X-MBX-APIKEY", api_key},
      {"Content-Type", "application/x-www-form-urlencoded"}
    ]
    
    final_url = case method do
      :get -> "#{url}?#{final_query}"
      :post -> url
    end
    
    result = case method do
      :get -> HTTPoison.get(final_url, headers, timeout: 10_000, recv_timeout: 10_000)
      :post -> HTTPoison.post(final_url, final_query, headers, timeout: 10_000, recv_timeout: 10_000)
    end
    
    case result do
      {:ok, %{status_code: 200, body: body}} ->
        Jason.decode(body)
      {:ok, %{status_code: code, body: body}} ->
        Logger.error("API Error #{code}: #{body}")
        {:error, %{code: code, body: body}}
      {:error, %HTTPoison.Error{reason: reason}} ->
        {:error, reason}
    end
  end

  # ========================================================================
  # PRIVATE - Helpers
  # ========================================================================

  defp extract_executed_price(order) do
    cond do
      # MARKET orders: avgPrice is sometimes returned (especially futures)
      order["avgPrice"] && order["avgPrice"] != "" && order["avgPrice"] != "0" -> 
        parse_float_safe(order["avgPrice"])
      
      # MARKET orders on spot: parse fills array
      order["fills"] && is_list(order["fills"]) && length(order["fills"]) > 0 ->
        # Calculate weighted average price from fills
        fills = order["fills"]
        total_qty = Enum.reduce(fills, 0.0, fn f, acc -> 
          acc + parse_float_safe(f["qty"])
        end)
        
        if total_qty > 0 do
          weighted_sum = Enum.reduce(fills, 0.0, fn f, acc ->
            acc + (parse_float_safe(f["price"]) * parse_float_safe(f["qty"]))
          end)
          weighted_sum / total_qty
        else
          parse_float_safe(List.first(fills)["price"])
        end
      
      # Limit orders: use price field
      order["price"] && order["price"] != "0.00000000" && order["price"] != "0" -> 
        parse_float_safe(order["price"])
      
      # Futures: sometimes uses cumQuote / executedQty
      order["cumQuote"] && order["executedQty"] ->
        cum_quote = parse_float_safe(order["cumQuote"])
        exec_qty = parse_float_safe(order["executedQty"])
        if exec_qty > 0, do: cum_quote / exec_qty, else: 0.0
      
      true -> 
        Logger.warning("⚠️ Could not extract price from order: #{inspect(Map.keys(order))}")
        0.0
    end
  end

  defp extract_executed_qty(order) do
    cond do
      order["executedQty"] && order["executedQty"] != "0" -> 
        parse_float_safe(order["executedQty"])
      order["origQty"] -> 
        parse_float_safe(order["origQty"])
      true -> 
        0.0
    end
  end

  defp parse_float_safe(nil), do: 0.0
  defp parse_float_safe(""), do: 0.0
  defp parse_float_safe(val) when is_float(val), do: val
  defp parse_float_safe(val) when is_integer(val), do: val * 1.0
  defp parse_float_safe(val) when is_binary(val) do
    case Float.parse(val) do
      {f, _} -> f
      :error -> 0.0
    end
  end

  @doc """
  Format quantity with correct precision for each symbol.
  Binance has strict LOT_SIZE rules per symbol.
  """
  defp format_quantity(symbol, quantity) do
    # Precision rules based on Binance exchange info
    # FUTURES precision (step size) - must match exactly
    {precision, min_qty} = get_symbol_precision(symbol)
    
    # Round DOWN to step size (never round up to avoid insufficient balance)
    step = :math.pow(10, -precision)
    rounded = Float.floor(quantity / step) * step
    
    # Ensure minimum
    final_qty = max(rounded, min_qty)
    
    # Format with exact precision (no trailing zeros issues)
    :erlang.float_to_binary(final_qty, decimals: precision)
  end

  # Binance Futures LOT_SIZE rules (step size determines precision)
  # Source: GET /fapi/v1/exchangeInfo
  defp get_symbol_precision(symbol) do
    case symbol do
      # Major pairs - 3 decimals
      "BTCUSDT" -> {3, 0.001}      # stepSize: 0.001, minQty: 0.001
      "ETHUSDT" -> {3, 0.001}      # stepSize: 0.001, minQty: 0.001
      
      # Medium pairs - 2 decimals  
      "BNBUSDT" -> {2, 0.01}       # stepSize: 0.01, minQty: 0.01
      "SOLUSDT" -> {2, 0.01}       # stepSize: 0.01 (TESTNET may differ)
      "AVAXUSDT" -> {2, 0.01}
      "LTCUSDT" -> {2, 0.01}       # stepSize: 0.01
      "BCHUSDT" -> {2, 0.01}
      
      # Smaller pairs - 1 decimal
      "XRPUSDT" -> {1, 0.1}        # stepSize: 0.1, minQty: 0.1
      "ADAUSDT" -> {0, 1.0}        # stepSize: 1, minQty: 1
      "DOGEUSDT" -> {0, 1.0}       # stepSize: 1, minQty: 1
      "TRXUSDT" -> {0, 1.0}
      "MATICUSDT" -> {0, 1.0}
      
      # DeFi/Alt pairs - varies
      "DOTUSDT" -> {1, 0.1}
      "LINKUSDT" -> {1, 0.1}
      "ATOMUSDT" -> {1, 0.1}
      "UNIUSDT" -> {1, 0.1}
      "NEARUSDT" -> {0, 1.0}
      "APTUSDT" -> {1, 0.1}
      "ARBUSDT" -> {0, 1.0}
      "OPUSDT" -> {0, 1.0}
      "INJUSDT" -> {1, 0.1}
      "SUIUSDT" -> {0, 1.0}
      "SEIUSDT" -> {0, 1.0}
      
      # Default - 2 decimals, safe for most
      _ -> {2, 0.01}
    end
  end

  # ========================================================================
  # PRIVATE - Transaction Logging
  # ========================================================================

  defp log_transaction(attrs) do
    # Log to console
    emoji = case {attrs[:action], attrs[:direction]} do
      {:entry, :long} -> "🟢📈"
      {:exit, :long} -> "🔴📈"
      {:entry, :short} -> "🔴📉"
      {:exit, :short} -> "🟢📉"
      _ -> "📝"
    end
    
    status_str = if attrs[:status] == :failed, do: "FAILED", else: "OK"
    pnl_str = if attrs[:pnl], do: " | P&L: $#{Float.round(attrs[:pnl], 2)}", else: ""
    
    Logger.info("#{emoji} TRANSACTION: #{attrs[:type]} #{attrs[:symbol]} | Qty: #{attrs[:quantity]} | Price: $#{attrs[:price] || 0}#{pnl_str} | Status: #{status_str}")
    
    # Save to database
    save_transaction_to_db(attrs)
  end

  defp save_transaction_to_db(attrs) do
    try do
      alias TradeEngine.Trading.Transaction
      alias TradeEngine.Repo
      
      # Determine status string
      status_str = case attrs[:status] do
        :failed -> "failed"
        :rejected -> "rejected"
        :cancelled -> "cancelled"
        "FILLED" -> "filled"
        "NEW" -> "pending"
        "PARTIALLY_FILLED" -> "partial"
        "CANCELED" -> "cancelled"
        "REJECTED" -> "rejected"
        "EXPIRED" -> "expired"
        s when is_binary(s) -> String.downcase(s)
        _ -> "completed"
      end
      
      # Prepare transaction attributes
      txn_attrs = %{
        # Core fields
        transaction_type: to_string(attrs[:type]),
        amount: safe_decimal(attrs[:quantity], attrs[:price]),
        status: status_str,
        order_id: to_string(attrs[:order_id] || ""),
        description: build_description(attrs),
        
        # Trading execution fields
        symbol: attrs[:symbol],
        action: to_string(attrs[:action]),
        direction: to_string(attrs[:direction]),
        quantity: safe_decimal_single(attrs[:quantity]),
        price: safe_decimal_single(attrs[:price]),
        entry_price: safe_decimal_single(attrs[:entry_price]),
        executed_at: DateTime.utc_now(),
        
        # P&L (for exit transactions)
        pnl: safe_decimal_single(attrs[:pnl]),
        pnl_percent: safe_decimal_single(attrs[:pnl_percent]),
        
        # Exchange details
        client_order_id: attrs[:client_order_id],
        exchange: "binance_testnet",
        exchange_response: if(attrs[:raw_response], do: Jason.encode!(attrs[:raw_response]), else: nil),
        error_message: if(attrs[:error], do: inspect(attrs[:error]), else: nil),
        
        # Physics context
        signal_confidence: attrs[:confidence],
        physics_peak_price: safe_decimal_single(attrs[:peak_price]),
        physics_peak_time: safe_decimal_single(attrs[:peak_time]),
        
        # Relationships
        user_id: attrs[:user_id],
        position_id: attrs[:position_id],
        trading_account_id: attrs[:trading_account_id]
      }
      
      # Use appropriate changeset based on action
      changeset = case attrs[:action] do
        :entry -> Transaction.entry_changeset(%Transaction{}, txn_attrs)
        :exit -> Transaction.exit_changeset(%Transaction{}, txn_attrs)
        _ -> Transaction.changeset(%Transaction{}, txn_attrs)
      end
      
      case Repo.insert(changeset) do
        {:ok, txn} -> 
          Logger.debug("💾 Transaction saved: #{txn.id}")
          {:ok, txn}
        {:error, changeset} -> 
          Logger.warning("Failed to save transaction: #{inspect(changeset.errors)}")
          {:error, changeset.errors}
      end
    rescue
      e -> 
        Logger.warning("Transaction logging error: #{inspect(e)}")
        {:error, e}
    end
  end

  defp safe_decimal(nil, _), do: Decimal.new(0)
  defp safe_decimal(_, nil), do: Decimal.new(0)
  defp safe_decimal(qty, price) when is_number(qty) and is_number(price) do
    Decimal.mult(Decimal.from_float(qty * 1.0), Decimal.from_float(price * 1.0))
  end
  defp safe_decimal(_, _), do: Decimal.new(0)

  defp safe_decimal_single(nil), do: nil
  defp safe_decimal_single(0), do: nil
  defp safe_decimal_single(0.0), do: nil
  defp safe_decimal_single(val) when is_float(val), do: Decimal.from_float(val)
  defp safe_decimal_single(val) when is_integer(val), do: Decimal.new(val)
  defp safe_decimal_single(%Decimal{} = val), do: val
  defp safe_decimal_single(_), do: nil

  defp build_description(attrs) do
    action_str = case attrs[:action] do
      :entry -> "Opened"
      :exit -> "Closed"
      _ -> "Executed"
    end
    
    direction_str = case attrs[:direction] do
      :long -> "LONG"
      :short -> "SHORT"
      _ -> ""
    end
    
    pnl_str = if attrs[:pnl] do
      " | P&L: $#{Float.round(attrs[:pnl], 2)}"
    else
      ""
    end
    
    "#{action_str} #{direction_str} #{attrs[:symbol]} @ $#{attrs[:price] || 0}#{pnl_str}"
  end
end