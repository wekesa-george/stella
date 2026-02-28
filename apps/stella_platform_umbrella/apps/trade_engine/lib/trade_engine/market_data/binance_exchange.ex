defmodule TradeEngine.MarketData.BinanceExchange do
  @moduledoc """
  Dynamic discovery and management of all Binance trading pairs.
  
  Features:
  - Fetch all trading pairs from Binance
  - Filter by volume, liquidity, and trading requirements
  - Cache results with TTL
  - Automatic refresh
  """
  
  require Logger
  alias TradeEngine.Repo
  
  @binance_api_url "https://api.binance.com/api/v3"
  @binance_testnet_url "https://testnet.binance.vision/api/v3"
  @cache_ttl_seconds 3600  # Refresh every hour
  @min_24h_volume 100_000  # Min $100k daily volume
  @quote_currencies ["USDT", "BUSD", "USDC"]  # Only these quote pairs

  # ========== PUBLIC API ==========

  @doc """
  Get all active trading pairs, with caching
  """
  def get_all_trading_pairs(use_testnet \\ true) do
    cache_key = if use_testnet, do: "binance_pairs_testnet", else: "binance_pairs_mainnet"
    
    case get_cached_pairs(cache_key) do
      {:ok, pairs} ->
        Logger.debug("📦 Using cached pairs: #{length(pairs)} pairs")
        pairs
      
      :expired ->
        Logger.info("🔄 Fetching fresh pairs from Binance...")
        fetch_and_cache_pairs(use_testnet, cache_key)
    end
  end

  @doc """
  Get top trading pairs by 24h volume
  """
  def get_top_pairs(limit \\ 50, use_testnet \\ true) do
    get_all_trading_pairs(use_testnet)
    |> Enum.sort_by(fn pair -> pair.volume_24h end, :desc)
    |> Enum.take(limit)
  end

  @doc """
  Get pairs by quote currency
  """
  def get_pairs_for_quote(quote_currency \\ "USDT", limit \\ nil, use_testnet \\ true) do
    pairs = get_all_trading_pairs(use_testnet)
    
    filtered = Enum.filter(pairs, fn pair ->
      String.ends_with?(pair.symbol, quote_currency)
    end)
    
    if limit, do: Enum.take(filtered, limit), else: filtered
  end

  @doc """
  Get high-liquidity pairs (suitable for trading)
  """
  def get_liquid_pairs(limit \\ 100, use_testnet \\ true) do
    get_all_trading_pairs(use_testnet)
    |> Enum.filter(fn pair ->
      pair.volume_24h >= @min_24h_volume and pair.status == "TRADING"
    end)
    |> Enum.sort_by(fn pair -> pair.volume_24h end, :desc)
    |> Enum.take(limit)
  end

  @doc """
  Get sector/category of pairs
  """
  def get_sector_pairs(sector_filter \\ nil, use_testnet \\ true) do
    all_pairs = get_all_trading_pairs(use_testnet)
    
    if sector_filter do
      Enum.filter(all_pairs, fn pair ->
        String.contains?(pair.symbol, sector_filter)
      end)
    else
      all_pairs
    end
  end

  @doc """
  Manually refresh the cache
  """
  def refresh_pairs_cache(use_testnet \\ true) do
    cache_key = if use_testnet, do: "binance_pairs_testnet", else: "binance_pairs_mainnet"
    Logger.info("🔄 Manually refreshing pairs cache...")
    fetch_and_cache_pairs(use_testnet, cache_key)
  end

  @doc """
  Debug function - test API connectivity and response
  """
  def debug_fetch(use_testnet \\ true) do
    api_url = if use_testnet, do: @binance_testnet_url, else: @binance_api_url
    
    Logger.info("🔍 DEBUG: Testing API connectivity...")
    Logger.info("🔍 API URL: #{api_url}")
    
    IO.puts("\n=== STEP 1: Testing exchangeInfo ===")
    case fetch_exchange_info(api_url) do
      {:ok, pairs} ->
        IO.puts("✅ exchangeInfo SUCCESS: #{length(pairs)} pairs")
        IO.puts("Sample pair: #{inspect(List.first(pairs))}")
        
        IO.puts("\n=== STEP 2: Testing ticker/24hr ===")
        case fetch_24h_ticker(api_url) do
          {:ok, volume_map} ->
            IO.puts("✅ ticker/24hr SUCCESS: #{map_size(volume_map)} symbols")
            sample_symbol = pairs |> List.first() |> Map.get(:symbol)
            sample_volume = Map.get(volume_map, sample_symbol, "NOT FOUND")
            IO.puts("Sample volume for #{sample_symbol}: #{inspect(sample_volume)}")
            
            IO.puts("\n=== STEP 3: Merging data ===")
            merged = merge_volume_data(pairs, volume_map)
            pairs_with_volume = Enum.filter(merged, fn p -> p.volume_24h > 0 end)
            IO.puts("✅ MERGE SUCCESS: #{length(pairs_with_volume)} pairs have volume > 0")
            
            top_5 = merged
              |> Enum.sort_by(& &1.volume_24h, :desc)
              |> Enum.take(5)
            
            IO.puts("\nTop 5 by volume:")
            Enum.each(top_5, fn p ->
              IO.puts("  #{p.symbol}: $#{Float.round(p.volume_24h, 2)}")
            end)
            
            {:ok, merged}
          
          {:error, reason} ->
            IO.puts("❌ ticker/24hr FAILED: #{inspect(reason)}")
            {:error, reason}
        end
      
      {:error, reason} ->
        IO.puts("❌ exchangeInfo FAILED: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ========== PRIVATE HELPERS ==========

  defp fetch_and_cache_pairs(use_testnet, cache_key) do
    api_url = if use_testnet, do: @binance_testnet_url, else: @binance_api_url
    
    with {:ok, exchange_pairs} <- fetch_exchange_info(api_url),
         {:ok, volume_data} <- fetch_24h_ticker(api_url) do
      
      # Merge volume data with exchange info
      pairs = merge_volume_data(exchange_pairs, volume_data)
      
      Logger.info("✅ Fetched #{length(pairs)} pairs from Binance (#{map_size(volume_data)} symbols with volume data)")
      
      # Cache in memory with TTL
      cache_pairs(cache_key, pairs, @cache_ttl_seconds)
      pairs
    else
      {:error, reason} ->
        Logger.error("❌ Failed to fetch pairs: #{inspect(reason)}")
        Logger.warning("⚠️ Falling back to hardcoded popular pairs...")
        get_fallback_pairs()
    end
  end

  # Fallback pairs in case API is unreachable
  defp get_fallback_pairs do
    [
      "BTCUSDT", "ETHUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT",
      "XRPUSDT", "DOTUSDT", "UNIUSDT", "LTCUSDT", "LINKUSDT",
      "SOLUSDT", "MATICUSDT", "AVAXUSDT", "ATOMUSDT", "NEARUSDT",
      "APTUSDT", "ARBUSDT", "OPUSDT", "SHIBUSDT", "TRXUSDT"
    ]
    |> Enum.map(fn symbol ->
      %{
        symbol: symbol,
        base_asset: String.replace(symbol, "USDT", ""),
        quote_asset: "USDT",
        status: "TRADING",
        volume_24h: 1_000_000.0,  # Fake volume for sorting
        is_margin_trading: false,
        is_spot_trading: true,
        filters: [],
        lot_size_filter: nil,
        min_notional: 10.0
      }
    end)
  end

  defp fetch_exchange_info(api_url) do
    url = "#{api_url}/exchangeInfo"
    
    case HTTPoison.get(url, [], timeout: 15_000, recv_timeout: 15_000) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, data} ->
            pairs = parse_exchange_info(data)
            {:ok, pairs}
          
          {:error, reason} ->
            {:error, "Failed to decode exchange info: #{reason}"}
        end
      
      {:ok, %HTTPoison.Response{status_code: status}} ->
        {:error, "HTTP #{status} from exchangeInfo"}
      
      {:error, reason} ->
        {:error, "HTTP error: #{inspect(reason)}"}
    end
  end

  defp fetch_24h_ticker(api_url) do
    url = "#{api_url}/ticker/24hr"
    
    #Logger.debug("🌐 Fetching 24h ticker data from #{url}...")
    
    case HTTPoison.get(url, [], timeout: 15_000, recv_timeout: 15_000) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, data} when is_list(data) ->
            # Convert to map for faster lookup: symbol -> volume
            volume_map = Map.new(data, fn ticker ->
              symbol = ticker["symbol"]
              volume = parse_float(ticker["quoteVolume"], 0.0)
              {symbol, volume}
            end)
            
            Logger.debug("✅ Fetched 24h volume for #{map_size(volume_map)} symbols")
            {:ok, volume_map}
          
          {:error, reason} ->
            Logger.warning("⚠️ Failed to decode 24h ticker, using zero volumes: #{reason}")
            {:ok, %{}}
        end
      
      {:ok, %HTTPoison.Response{status_code: status}} ->
        Logger.warning("⚠️ HTTP #{status} from ticker/24hr, using zero volumes")
        {:ok, %{}}
      
      {:error, reason} ->
        Logger.warning("⚠️ HTTP error fetching ticker: #{inspect(reason)}, using zero volumes")
        {:ok, %{}}
    end
  end

  defp merge_volume_data(exchange_pairs, volume_map) do
    Enum.map(exchange_pairs, fn pair ->
      volume = Map.get(volume_map, pair.symbol, 0.0)
      %{pair | volume_24h: volume}
    end)
  end

  defp parse_exchange_info(exchange_data) do
    exchange_data["symbols"]
    |> Enum.filter(&valid_trading_pair?/1)
    |> Enum.map(&format_pair/1)
  end

  defp valid_trading_pair?(symbol) do
    status_ok = symbol["status"] == "TRADING"
    quote_ok = Enum.any?(@quote_currencies, fn quote ->
      String.ends_with?(symbol["symbol"], quote)
    end)
    
    status_ok and quote_ok and symbol["isSpotTradingAllowed"]
  end

  defp format_pair(symbol_data) do
    %{
      symbol: symbol_data["symbol"],
      base_asset: symbol_data["baseAsset"],
      quote_asset: symbol_data["quoteAsset"],
      status: symbol_data["status"],
      volume_24h: 0.0,  # Will be filled by merge_volume_data
      is_margin_trading: symbol_data["isMarginTradingAllowed"],
      is_spot_trading: symbol_data["isSpotTradingAllowed"],
      filters: extract_filters(symbol_data["filters"]),
      lot_size_filter: extract_lot_size_filter(symbol_data["filters"]),
      min_notional: extract_min_notional(symbol_data["filters"])
    }
  end

  defp extract_filters(filters) when is_list(filters) do
    filters
    |> Enum.map(fn f -> f["filterType"] end)
    |> Enum.uniq()
  end
  defp extract_filters(_), do: []

  defp extract_lot_size_filter(filters) when is_list(filters) do
    Enum.find_value(filters, nil, fn f ->
      if f["filterType"] == "LOT_SIZE" do
        %{
          min_qty: parse_float(f["minQty"], 0.0),
          max_qty: parse_float(f["maxQty"], 0.0),
          step_size: parse_float(f["stepSize"], 0.0)
        }
      end
    end)
  end
  defp extract_lot_size_filter(_), do: nil

  defp extract_min_notional(filters) when is_list(filters) do
    Enum.find_value(filters, 10.0, fn f ->
      if f["filterType"] == "MIN_NOTIONAL" do
        parse_float(f["notional"], 10.0)
      end
    end)
  end
  defp extract_min_notional(_), do: 10.0

  defp parse_float(nil, default), do: default
  defp parse_float(value, default) when is_number(value), do: value * 1.0
  defp parse_float(value, default) when is_binary(value) do
    case Float.parse(value) do
      {float, _} -> float
      :error -> default
    end
  end
  defp parse_float(_, default), do: default

  # ========== CACHING ==========

  defp get_cached_pairs(cache_key) do
    case :ets.lookup(:binance_pairs_cache, cache_key) do
      [{^cache_key, pairs, expires_at}] ->
        if System.monotonic_time(:second) < expires_at do
          {:ok, pairs}
        else
          :expired
        end
      
      [] ->
        :expired
    end
  rescue
    _ -> :expired
  end

  defp cache_pairs(cache_key, pairs, ttl_seconds) do
    expires_at = System.monotonic_time(:second) + ttl_seconds
    
    # Initialize ETS table if needed
    try do
      :ets.new(:binance_pairs_cache, [:public, :named_table])
    rescue
      ArgumentError -> :ok  # Table already exists
    end
    
    :ets.insert(:binance_pairs_cache, {cache_key, pairs, expires_at})
  end
end