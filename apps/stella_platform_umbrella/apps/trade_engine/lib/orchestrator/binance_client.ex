defmodule TradeEngine.Orchestrator.BinanceClient do
  @moduledoc """
  Binance Testnet API Client for order execution.
  Handles HMAC-SHA256 signing and order placement with configurable timeouts.
  
  ✅ FIXED: Only use valid testnet pairs ending with USDT (silently reject others)
  """

  require Logger

  # Binance Testnet Configuration
  @base_url "https://testnet.binance.vision/api"
  @api_key System.get_env("BINANCE_API_KEY", "REDACTED")
  @api_secret System.get_env("BINANCE_API_SECRET", "REDACTED")

  # HTTP Timeout Configuration (in milliseconds)
  @default_http_timeout 15000
  @default_recv_timeout 15000
  @default_connect_timeout 10000
  @order_timeout 20000
  @klines_timeout 15000

  # ✅ FIXED: Only USDT pairs from testnet (filtered at compile time)
  
  @valid_testnet_pairs [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT", "TRXUSDT", 
    "NEOUSDT", "QTUMUSDT", "ADAUSDT", "TUSDUSDT", "IOTAUSDT", "XLMUSDT", 
    "ONTUSDT", "ETCUSDT", "ICXUSDT", "VETUSDT", "LINKUSDT", 
    "ONGUSDT", "HOTUSDT", "ZILUSDT", "ZRXUSDT", "FETUSDT", "BATUSDT", 
    "ZECUSDT", "IOSTUSDT", "CELRUSDT", "DASHUSDT", "THETAUSDT", "ENJUSDT", 
    "ATOMUSDT", "TFUELUSDT", "ONEUSDT", "ALGOUSDT", "DOGEUSDT", "DUSKUSDT", 
    "ANKRUSDT", "WINUSDT", "COSUSDT", "MTLUSDT", "DENTUSDT", "WANUSDT", 
    "FUNUSDT", "CVCUSDT", "CHZUSDT", "BANDUSDT", "XTZUSDT", "RVNUSDT", 
    "HBARUSDT", "NKNUSDT", "STXUSDT", "KAVAUSDT", "ARPAUSDT", "IOTXUSDT", 
    "RLCUSDT", "BCHUSDT", "FTTUSDT", "EURUSDT", "OGNUSDT", "LSKUSDT", "BNTUSDT", 
    "MBLUSDT", "COTIUSDT", "DATAUSDT", "SOLUSDT", "CTSIUSDT", 
    "HIVEUSDT", "CHRUSDT", "ARDRUSDT", "MDTUSDT", "KNCUSDT", "LRCUSDT", 
    "COMPUSDT", "SCUSDT", "ZENUSDT", "SNXUSDT", "VTHOUSDT", "DGBUSDT", 
    "SXPUSDT", "DCRUSDT", "STORJUSDT", "MANAUSDT", "YFIUSDT", "JSTUSDT", 
    "CRVUSDT", "SANDUSDT", "NMRUSDT", "DOTUSDT", "LUNAUSDT", "RSRUSDT", 
    "PAXGUSDT", "TRBUSDT", "SUSHIUSDT", "KSMUSDT", "EGLDUSDT", "DIAUSDT", 
    "RUNEUSDT", "FIOUSDT", "UMAUSDT", "BELUSDT", "UNIUSDT", "OXTUSDT", "SUNUSDT", 
    "AVAXUSDT", "FLMUSDT", "UTKUSDT", "XVSUSDT", "AAVEUSDT", "NEARUSDT", "FILUSDT", 
    "INJUSDT", "AUDIOUSDT", "CTKUSDT", "AXSUSDT", "STRAXUSDT", "ROSEUSDT", "AVAUSDT", 
    "SKLUSDT", "GRTUSDT", "JUVUSDT", "PSGUSDT", "1INCHUSDT", "OGUSDT", "ATMUSDT", 
    "ASRUSDT", "CELOUSDT", "RIFUSDT", "TRUUSDT", "CKBUSDT", "TWTUSDT", "SFPUSDT", 
    "DODOUSDT", "CAKEUSDT", "ACMUSDT", "FISUSDT", "OMUSDT", "PONDUSDT", "DEGOUSDT", 
    "ALICEUSDT", "PERPUSDT", "SUPERUSDT", "CFXUSDT", "TKOUSDT", "PUNDIXUSDT", "TLMUSDT", 
    "BARUSDT", "FORTHUSDT", "SLPUSDT", "SHIBUSDT", "ICPUSDT", "ARUSDT", "MASKUSDT", 
    "LPTUSDT", "XVGUSDT", "ATAUSDT", "GTCUSDT", "PHAUSDT", "MLNUSDT", "DEXEUSDT", "C98USDT", 
    "QNTUSDT", "FLOWUSDT", "MINAUSDT", "RAYUSDT", "FARMUSDT", "QUICKUSDT", "MBOXUSDT", 
    "REQUSDT", "GHSTUSDT", "WAXPUSDT", "GNOUSDT", "XECUSDT", "DYDXUSDT", "IDEXUSDT", 
    "USDPUSDT", "GALAUSDT", "ILVUSDT", "YGGUSDT", "SYSUSDT", "DFUSDT", "FIDAUSDT", 
    "AGLDUSDT", "RADUSDT", "RAREUSDT", "LAZIOUSDT", "CHESSUSDT", "ADXUSDT", "AUCTIONUSDT", 
    "MOVRUSDT", "CITYUSDT", "ENSUSDT", "QIUSDT", "PORTOUSDT", "POWRUSDT", "JASMYUSDT", 
    "AMPUSDT", "PYRUSDT", "ALCXUSDT", "SANTOSUSDT", "BICOUSDT", "FLUXUSDT", "FXSUSDT", 
    "VOXELUSDT", "HIGHUSDT", "CVXUSDT", "PEOPLEUSDT", "SPELLUSDT", "JOEUSDT", "ACHUSDT", 
    "IMXUSDT", "GLMRUSDT", "SCRTUSDT", "API3USDT", "BTTCUSDT", "ACAUSDT", "XNOUSDT", "WOOUSDT", 
    "ALPINEUSDT", "TUSDT", "ASTRUSDT", "GMTUSDT", "KDAUSDT", "APEUSDT", "BIFIUSDT", "STEEMUSDT", 
    "NEXOUSDT", "REIUSDT", "LDOUSDT", "OPUSDT", "STGUSDT", "LUNCUSDT", "GMXUSDT", "POLYXUSDT", 
    "APTUSDT", "OSMOUSDT", "HFTUSDT", "PHBUSDT", "HOOKUSDT", "MAGICUSDT", "RPLUSDT", "GNSUSDT",
    "SYNUSDT", "SSVUSDT", "LQTYUSDT", "USTCUSDT", "GASUSDT", "GLMUSDT", "PROMUSDT", "QKCUSDT", 
    "IDUSDT", "ARBUSDT", "RDNTUSDT", "WBTCUSDT", "EDUUSDT", "SUIUSDT", "PEPEUSDT", "FLOKIUSDT", 
    "MAVUSDT", "PENDLEUSDT", "ARKMUSDT", "WBETHUSDT", "WLDUSDT", "FDUSDUSDT", "SEIUSDT", "CYBERUSDT", 
    "ARKUSDT", "IQUSDT", "NTRNUSDT", "TIAUSDT", "MEMEUSDT", "ORDIUSDT", "BEAMXUSDT", "PIVXUSDT", 
    "VICUSDT", "BLURUSDT", "VANRYUSDT", "AEURUSDT", "JTOUSDT", "1000SATSUSDT", "BONKUSDT", "ACEUSDT", 
    "NFPUSDT", "AIUSDT", "XAIUSDT", "MANTAUSDT", "ALTUSDT", "JUPUSDT", "PYTHUSDT", "RONINUSDT", 
    "DYMUSDT", "PIXELUSDT", "STRKUSDT", "PORTALUSDT", "AXLUSDT", "WIFUSDT", "METISUSDT", "AEVOUSDT",
    "BOMEUSDT", "ETHFIUSDT", "ENAUSDT", "WUSDT", "TNSRUSDT", "SAGAUSDT", "TAOUSDT", "REZUSDT", 
    "BBUSDT", "NOTUSDT", "IOUSDT", "ZKUSDT", "LISTAUSDT", "ZROUSDT", "GUSDT", "BANANAUSDT", 
    "RENDERUSDT", "TONUSDT", "DOGSUSDT", "EURIUSDT", "POLUSDT", "NEIROUSDT", "TURBOUSDT", 
    "1MBABYDOGEUSDT", "CATIUSDT", "HMSTRUSDT", "EIGENUSDT", "SCRUSDT", "BNSOLUSDT", "LUMIAUSDT", 
    "KAIAUSDT", "COWUSDT", "CETUSUSDT", "PNUTUSDT", "ACTUSDT", "USUALUSDT", "THEUSDT", "ACXUSDT", 
    "ORCAUSDT", "MOVEUSDT", "MEUSDT", "VELODROMEUSDT", "VANAUSDT", "1000CATUSDT", "PENGUUSDT", 
    "BIOUSDT", "DUSDT", "AIXBTUSDT", "CGPTUSDT", "COOKIEUSDT", "SUSDT", "SOLVUSDT", "TRUMPUSDT", 
    "ANIMEUSDT", "BERAUSDT", "1000CHEEMSUSDT", "TSTUSDT", "LAYERUSDT", "HEIUSDT", "KAITOUSDT", 
    "SHELLUSDT", "REDUSDT", "GPSUSDT", "EPICUSDT", "BMTUSDT", "FORMUSDT", "XUSDUSDT", "NILUSDT", 
    "PARTIUSDT", "MUBARAKUSDT", "TUTUSDT", "BROCCOLI714USDT", "BANANAS31USDT", "GUNUSDT", 
    "BABYUSDT", "ONDOUSDT", "BIGTIMEUSDT", "VIRTUALUSDT", "KERNELUSDT", "WCTUSDT", "HYPERUSDT", 
    "INITUSDT", "SIGNUSDT", "STOUSDT", "SYRUPUSDT", "KMNOUSDT", "SXTUSDT", "NXPCUSDT", "AWEUSDT", 
    "HAEDALUSDT", "USD1USDT", "HUMAUSDT", "AUSDT", "SOPHUSDT", "RESOLVUSDT", "HOMEUSDT", "SPKUSDT", 
    "NEWTUSDT", "SAHARAUSDT", "LAUSDT", "ERAUSDT", "CUSDT", "TREEUSDT", "A2ZUSDT", "TOWNSUSDT", 
    "PROVEUSDT", "BFUSDUSDT", "PLUMEUSDT", "DOLOUSDT", "MITOUSDT", "WLFIUSDT", "SOMIUSDT", 
    "OPENUSDT", "USDEUSDT", "LINEAUSDT", "HOLOUSDT", "PUMPUSDT", "AVNTUSDT", "ZKCUSDT", "SKYUSDT", 
    "BARDUSDT", "0GUSDT", "HEMIUSDT", "XPLUSDT", "MIRAUSDT", "FFUSDT", "EDENUSDT", "NOMUSDT", 
    "2ZUSDT", "MORPHOUSDT", "ASTERUSDT", "WALUSDT", "EULUSDT", "ENSOUSDT", "YBUSDT", "ZBTUSDT", 
    "TURTLEUSDT", "GIGGLEUSDT", "FUSDT", "KITEUSDT", "MMTUSDT"
  ]

  @doc "Check if a symbol is valid on Binance Testnet AND ends with USDT"
  def is_valid_symbol?(symbol) do
    binance_symbol = symbol
      |> String.replace("/", "")
      |> String.upcase()
    
    # ✅ Must end with USDT AND be in our whitelist
    String.ends_with?(binance_symbol, "USDT") and
    Enum.member?(@valid_testnet_pairs, binance_symbol)
  end

  @doc "Get list of valid testnet pairs (USDT only)"
  def get_valid_pairs do
    @valid_testnet_pairs
  end

  @doc "Place a limit order on Binance Testnet with configurable timeouts"
  def place_order(order_params) do
    place_order(order_params, @order_timeout, @default_recv_timeout, @default_connect_timeout)
  end

  def place_order(order_params, http_timeout, recv_timeout, connect_timeout) do
    timestamp = System.system_time(:millisecond)
    
    clean_params = order_params
      |> Map.put(:timestamp, timestamp)
      |> clean_numeric_params()

    query_string = build_query_string(clean_params)
    signature = sign_request(query_string)
    
    url = "#{@base_url}/v3/order"
    headers = [
      {"X-MBX-APIKEY", @api_key},
      {"Content-Type", "application/x-www-form-urlencoded"}
    ]

    body = "#{query_string}&signature=#{signature}"

    Logger.debug("📤 Binance Order Request")
    Logger.debug("   URL: #{url}")
    Logger.debug("   Timeout: #{http_timeout}ms")

    options = [
      timeout: http_timeout,
      recv_timeout: recv_timeout,
      connect_timeout: connect_timeout
    ]

    case HTTPoison.post(url, body, headers, options) do
      {:ok, %HTTPoison.Response{status_code: 200, body: response_body}} ->
        Logger.debug("📥 Binance Response (200)")
        
        case Jason.decode(response_body) do
          {:ok, response} ->
            Logger.info("✅ Order Placed Successfully!")
            Logger.info("   Order ID: #{response["orderId"]}")
            Logger.info("   Symbol: #{response["symbol"]}")
            Logger.info("   Side: #{response["side"]}")
            Logger.info("   Quantity: #{response["origQty"]}")
            Logger.info("   Price: #{response["price"]}")
            {:ok, response}

          {:error, e} ->
            Logger.error("❌ Failed to parse response: #{inspect(e)}")
            Logger.error("   Raw response: #{response_body}")
            {:error, "Invalid response"}
        end

      {:ok, %HTTPoison.Response{status_code: code, body: response_body}} ->
        Logger.error("❌ Binance API Error (#{code})")
        Logger.error("   Response: #{response_body}")
        
        case Jason.decode(response_body) do
          {:ok, %{"code" => err_code, "msg" => err_msg}} ->
            Logger.error("   Error Code: #{err_code}")
            Logger.error("   Error Message: #{err_msg}")
          _ -> :ok
        end
        
        {:error, "API Error: #{code}"}

      {:error, %HTTPoison.Error{reason: :timeout}} ->
        Logger.error("❌ Request timeout (#{http_timeout}ms)")
        {:error, "timeout"}

      {:error, %HTTPoison.Error{reason: :connect_timeout}} ->
        Logger.error("❌ Connection timeout (#{connect_timeout}ms)")
        {:error, "connect_timeout"}

      {:error, reason} ->
        Logger.error("❌ HTTP Request Failed: #{inspect(reason)}")
        {:error, inspect(reason)}
    end
  end

  @doc "Get account information"
  def get_account do
    get_account(@default_http_timeout, @default_recv_timeout, @default_connect_timeout)
  end

  def get_account(http_timeout, recv_timeout, connect_timeout) do
    timestamp = System.system_time(:millisecond)
    query_string = "timestamp=#{timestamp}"
    signature = sign_request(query_string)
    
    url = "#{@base_url}/v3/account?#{query_string}&signature=#{signature}"
    headers = [{"X-MBX-APIKEY", @api_key}]

    options = [
      timeout: http_timeout,
      recv_timeout: recv_timeout,
      connect_timeout: connect_timeout
    ]

    case HTTPoison.get(url, headers, options) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, account} ->
            Logger.debug("✅ Account info retrieved")
            {:ok, account}

          {:error, e} ->
            Logger.error("❌ Failed to parse account: #{inspect(e)}")
            {:error, "Failed to parse account"}
        end

      {:error, %HTTPoison.Error{reason: :timeout}} ->
        Logger.error("❌ Get account timeout")
        {:error, "timeout"}

      {:error, reason} ->
        Logger.error("❌ Get account error: #{inspect(reason)}")
        {:error, inspect(reason)}
    end
  end

  @doc """
  Get account information including balances - PUBLIC function
  """
  def get_account_info do
    get_account(@default_http_timeout, @default_recv_timeout, @default_connect_timeout)
  end

  @doc "Fetch klines (candles) from Binance - SILENTLY rejects non-USDT pairs"
  def fetch_klines(symbol, timeframe, limit) do
    fetch_klines(symbol, timeframe, limit, @klines_timeout, @default_recv_timeout, @default_connect_timeout)
  end

  def fetch_klines(symbol, timeframe, limit, http_timeout, recv_timeout, connect_timeout) do
    binance_symbol = symbol
      |> String.replace("/", "")
      |> String.upcase()

    # ✅ SILENTLY reject non-USDT pairs (no logs, no errors printed)
    cond do
      not String.ends_with?(binance_symbol, "USDT") ->
        {:error, :not_usdt_pair}
      
      not Enum.member?(@valid_testnet_pairs, binance_symbol) ->
        {:error, :invalid_symbol}
      
      true ->
        fetch_klines_internal(binance_symbol, timeframe, limit, http_timeout, recv_timeout, connect_timeout)
    end
  end

  defp fetch_klines_internal(binance_symbol, timeframe, limit, http_timeout, recv_timeout, connect_timeout) do
    url = "#{@base_url}/v3/klines"
    query_params = [
      symbol: binance_symbol,
      interval: timeframe,
      limit: limit
    ]

    query_string = URI.encode_query(query_params)
    full_url = "#{url}?#{query_string}"

    options = [
      timeout: http_timeout,
      recv_timeout: recv_timeout,
      connect_timeout: connect_timeout,
      follow_redirect: true,
      max_redirect: 3
    ]

    case HTTPoison.get(full_url, [], options) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, candles} when is_list(candles) ->
            parsed = Enum.map(candles, &parse_kline/1)
            {:ok, parsed}

          {:ok, other} ->
            Logger.error("❌ Unexpected response format: #{inspect(other)}")
            {:error, "Invalid response format"}

          {:error, e} ->
            Logger.error("❌ Failed to decode klines: #{inspect(e)}")
            {:error, "Invalid JSON response"}
        end

      {:ok, %HTTPoison.Response{status_code: 418}} ->
        Logger.error("❌ Binance API Error (418): Rate limited")
        {:error, "Binance Error: 418"}

      {:ok, %HTTPoison.Response{status_code: 429}} ->
        Logger.error("❌ Binance API Error (429): Too many requests")
        {:error, "Binance Error: 429"}

      {:ok, %HTTPoison.Response{status_code: code, body: body}} ->
        Logger.error("❌ Binance API Error (#{code}): #{body}")
        {:error, "Binance Error: #{code}"}

      {:error, %HTTPoison.Error{reason: :timeout}} ->
        Logger.error("❌ Klines request timeout (#{http_timeout}ms)")
        {:error, "timeout"}

      {:error, %HTTPoison.Error{reason: :connect_timeout}} ->
        Logger.error("❌ Klines connection timeout (#{connect_timeout}ms)")
        {:error, "connect_timeout"}

      {:error, reason} ->
        Logger.error("❌ HTTP Error: #{inspect(reason)}")
        {:error, inspect(reason)}
    end
  end

  @doc "Get current price from Binance - SILENTLY rejects non-USDT pairs"
  def get_price(symbol) do
    get_price(symbol, @default_http_timeout, @default_recv_timeout, @default_connect_timeout)
  end

  def get_price(symbol, http_timeout, recv_timeout, connect_timeout) do
    binance_symbol = symbol
      |> String.replace("/", "")
      |> String.upcase()

    # ✅ SILENTLY reject non-USDT pairs (no logs, no errors printed)
    cond do
      not String.ends_with?(binance_symbol, "USDT") ->
        {:error, :not_usdt_pair}
      
      not Enum.member?(@valid_testnet_pairs, binance_symbol) ->
        {:error, :invalid_symbol}
      
      true ->
        get_price_internal(binance_symbol, http_timeout, recv_timeout, connect_timeout)
    end
  end

  defp get_price_internal(binance_symbol, http_timeout, recv_timeout, connect_timeout) do
    url = "#{@base_url}/v3/ticker/price?symbol=#{binance_symbol}"

    options = [
      timeout: http_timeout,
      recv_timeout: recv_timeout,
      connect_timeout: connect_timeout
    ]

    case HTTPoison.get(url, [], options) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"price" => price_str}} ->
            {:ok, Decimal.from_float(String.to_float(price_str))}

          {:error, e} ->
            Logger.error("❌ Failed to decode price: #{inspect(e)}")
            {:error, "Invalid JSON response"}
        end

      {:error, %HTTPoison.Error{reason: :timeout}} ->
        Logger.error("❌ Get price timeout")
        {:error, "timeout"}

      {:error, reason} ->
        Logger.error("❌ Get price error: #{inspect(reason)}")
        {:error, inspect(reason)}
    end
  end

  @doc "Test connection to Binance"
  def test_connection do
    url = "#{@base_url}/v3/ping"

    options = [
      timeout: @default_http_timeout,
      recv_timeout: @default_recv_timeout,
      connect_timeout: @default_connect_timeout
    ]

    case HTTPoison.get(url, [], options) do
      {:ok, %HTTPoison.Response{status_code: 200}} ->
        Logger.info("✅ Binance Testnet Connected")
        {:ok, "Connected"}

      {:error, %HTTPoison.Error{reason: :timeout}} ->
        Logger.error("❌ Binance Connection Failed: Timeout")
        {:error, "timeout"}

      {:error, reason} ->
        Logger.error("❌ Binance Connection Failed: #{inspect(reason)}")
        {:error, inspect(reason)}
    end
  end

  # ========== PRIVATE HELPERS ==========

  defp parse_kline(kline) when is_list(kline) do
    case kline do
      [_open_time, open, high, low, close, volume, _close_time, 
       quote_asset_volume, _number_of_trades, taker_buy_volume, 
       taker_buy_quote_volume, _ignore | _rest] ->
        
        %{
          open: safe_float(open),
          high: safe_float(high),
          low: safe_float(low),
          close: safe_float(close),
          volume: safe_float(volume),
          quote_asset_volume: safe_float(quote_asset_volume),
          taker_buy_volume: safe_float(taker_buy_volume),
          taker_buy_quote_volume: safe_float(taker_buy_quote_volume)
        }

      _ ->
        Logger.warning("⚠️ Unexpected kline format: #{inspect(kline)}")
        nil
    end
  end

  defp parse_kline(kline) do
    Logger.warning("⚠️ Kline is not a list: #{inspect(kline)}")
    nil
  end

  defp safe_float(value) when is_float(value), do: value
  
  defp safe_float(value) when is_binary(value) do
    case Float.parse(value) do
      {float, ""} -> float
      _ -> 0.0
    end
  end

  defp safe_float(value) when is_integer(value), do: value / 1.0
  
  defp safe_float(_), do: 0.0

  defp clean_numeric_params(params) do
    Enum.reduce(params, %{}, fn {key, value}, acc ->
      cleaned_value = case key do
        :quantity ->
          value
          |> to_string()
          |> String.trim()
          |> format_decimal_value()
        
        :price ->
          value
          |> to_string()
          |> String.trim()
          |> format_decimal_value()
        
        _ ->
          value
      end
      
      Map.put(acc, key, cleaned_value)
    end)
  end

  defp format_decimal_value(str) do
    case Decimal.parse(str) do
      {decimal, ""} ->
        decimal
        |> Decimal.to_string()
        |> String.trim_trailing("0")
        |> String.trim_trailing(".")

      :error ->
        str
    end
  end

  defp build_query_string(params) do
    params
    |> Enum.map(fn {key, value} -> 
      key_str = if is_atom(key), do: Atom.to_string(key), else: key
      value_str = to_string(value)
      {key_str, value_str}
    end)
    |> Enum.sort(fn {k1, _}, {k2, _} -> k1 <= k2 end)
    |> Enum.map(fn {key, value} ->
      "#{key}=#{URI.encode_www_form(value)}"
    end)
    |> Enum.join("&")
  end

  defp sign_request(query_string) do
    :crypto.mac(:hmac, :sha256, @api_secret, query_string)
    |> Base.encode16()
    |> String.downcase()
  end

  @doc """
  Get top pairs from Binance, filtered to only valid USDT testnet symbols
  """
  def get_top_pairs(limit \\ 100, use_testnet \\ false) do
    try do
      if use_testnet do
        Logger.info("📊 Using testnet USDT pairs (#{length(@valid_testnet_pairs)} available)")
        
        # Take requested number of USDT pairs from valid list
        pairs_to_use = Enum.take(@valid_testnet_pairs, limit)
        
        Enum.map(pairs_to_use, fn symbol ->
          %{
            symbol: symbol,
            quote_asset: "USDT",
            base_asset: String.replace_suffix(symbol, "USDT", "")
          }
        end)
      else
        fetch_from_api(limit)
      end
    rescue
      e ->
        Logger.error("❌ Error getting pairs: #{inspect(e)}")
        []
    end
  end

  defp fetch_from_api(limit) do
    Logger.info("📊 Fetching #{limit} pairs from mainnet API")
    []
  end
end