defmodule TradeEngine.Exchanges.Binance do
  @moduledoc """
  High-level facade for Binance exchange operations.
  
  Provides unified access to:
  - Real-time prices (via TickerStream)
  - Candlestick data (via KlineStream)
  - Order book depth (via DepthStream)
  - Order flow analysis
  - REST API for orders
  
  ## Quick Start
  
      # Get current price
      Binance.get_price("BTCUSDT")
      #=> {:ok, Decimal.new("90000.00")}
      
      # Get all tracked prices
      Binance.all_prices()
      #=> %{"BTCUSDT" => Decimal.new("90000"), "ETHUSDT" => ...}
      
      # Get candle
      Binance.get_candle("BTCUSDT", "1h")
      #=> {:ok, %Candle{...}}
      
      # Get order flow
      Binance.get_order_flow("BTCUSDT")
      #=> {:ok, %{imbalance: 0.15, wall: :balanced, ...}}
      
      # Subscribe to updates
      Binance.subscribe_ticker("BTCUSDT")
      Binance.subscribe_candles("BTCUSDT", "5m")
      Binance.subscribe_depth("BTCUSDT")
  """

  alias TradeEngine.Exchanges.Binance.{
    TickerStream,
    KlineStream,
    DepthStream,
    StreamSupervisor,
    CacheManager,
    RestClient,
    Config
  }

  # ============================================================================
  # PRICE DATA
  # ============================================================================

  @doc """
  Get current price for a symbol.
  """
  def get_price(symbol) do
    TickerStream.get_price(String.upcase(symbol))
  end

  @doc """
  Get all cached prices.
  """
  def all_prices do
    TickerStream.all_prices()
  end

  @doc """
  Get multiple prices at once.
  """
  def get_prices(symbols) when is_list(symbols) do
    prices = all_prices()
    Map.take(prices, Enum.map(symbols, &String.upcase/1))
  end

  @doc """
  Get full ticker with 24h stats.
  """
  def get_ticker(symbol) do
    CacheManager.get_ticker(String.upcase(symbol))
  end

  @doc """
  Fetch ticker from REST API (bypasses cache).
  """
  def fetch_ticker(symbol) do
    config = get_config()
    RestClient.get_ticker(config, symbol)
  end

  # ============================================================================
  # CANDLE DATA
  # ============================================================================

  @doc """
  Get latest cached candle for symbol/timeframe.
  """
  def get_candle(symbol, timeframe) do
    KlineStream.get_candle(symbol, timeframe)
  end

  @doc """
  Get all cached candles.
  """
  def all_candles do
    KlineStream.all_candles()
  end

  @doc """
  Fetch historical klines from REST API.
  """
  def fetch_klines(symbol, timeframe, opts \\ []) do
    config = get_config()
    RestClient.fetch_klines(config, symbol, timeframe, opts)
  end

  # ============================================================================
  # ORDER BOOK DATA
  # ============================================================================

  @doc """
  Get current order book for a symbol.
  """
  def get_orderbook(symbol) do
    DepthStream.get_orderbook(symbol)
  end

  @doc """
  Get order book summary with best bid/ask and spread.
  """
  def get_orderbook_summary(symbol) do
    case get_orderbook(symbol) do
      {:ok, book} ->
        best_bid = List.first(book.bids)
        best_ask = List.first(book.asks)
        
        summary = %{
          symbol: symbol,
          best_bid: best_bid && elem(best_bid, 0),
          best_bid_qty: best_bid && elem(best_bid, 1),
          best_ask: best_ask && elem(best_ask, 0),
          best_ask_qty: best_ask && elem(best_ask, 1),
          spread: calculate_spread(best_bid, best_ask),
          bid_levels: length(book.bids),
          ask_levels: length(book.asks),
          timestamp: book.timestamp
        }
        {:ok, summary}
        
      error -> error
    end
  end

  @doc """
  Fetch order book from REST API.
  """
  def fetch_orderbook(symbol, limit \\ 100) do
    config = get_config()
    RestClient.get_order_book(config, symbol, limit)
  end

  # ============================================================================
  # ORDER FLOW ANALYSIS
  # ============================================================================

  @doc """
  Get order flow metrics for a symbol.
  
  Returns:
  - `imbalance` - Range -1.0 (bearish) to +1.0 (bullish)
  - `pressure_ratio` - 0.0 to 1.0 (bid volume percentage)
  - `wall` - :buy_wall, :sell_wall, or :balanced
  - `spread` - Current bid-ask spread
  """
  def get_order_flow(symbol) do
    DepthStream.get_order_flow(String.upcase(symbol))
  end

  # ============================================================================
  # PUBSUB SUBSCRIPTIONS
  # ============================================================================

  @doc """
  Subscribe to ticker updates for a symbol.
  Messages: {:ticker, %Ticker{}}
  """
  def subscribe_ticker(symbol) do
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, "ticker:#{String.upcase(symbol)}")
  end

  @doc """
  Subscribe to all ticker updates.
  """
  def subscribe_all_tickers do
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, "ticker:all")
  end

  @doc """
  Subscribe to candle updates for a symbol/timeframe.
  Messages: {:kline, %Candle{}}
  """
  def subscribe_candles(symbol, timeframe) do
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, "kline:#{String.upcase(symbol)}:#{timeframe}")
  end

  @doc """
  Subscribe to candle close events for a timeframe.
  Messages: {:candle_closed, %Candle{}}
  """
  def subscribe_candle_closes(timeframe) do
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, "candle_closed:#{timeframe}")
  end

  @doc """
  Subscribe to depth updates for a symbol.
  Messages: {:depth, %OrderBook{}}
  """
  def subscribe_depth(symbol) do
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, "depth:#{String.upcase(symbol)}")
  end

  @doc """
  Subscribe to order flow updates for a symbol.
  Messages: {:order_flow, %{imbalance: ..., wall: ..., ...}}
  """
  def subscribe_order_flow(symbol) do
    Phoenix.PubSub.subscribe(TradeEngine.PubSub, "order_flow:#{String.upcase(symbol)}")
  end

  # ============================================================================
  # ACCOUNT & ORDERS (requires API keys)
  # ============================================================================

  @doc """
  Get account information.
  """
  def get_account do
    config = get_config()
    RestClient.get_account(config)
  end

  @doc """
  Get balance for a specific asset.
  """
  def get_balance(asset) do
    case get_account() do
      {:ok, account} ->
        balance = Enum.find(account.balances, fn b -> b.asset == String.upcase(asset) end)
        if balance, do: {:ok, balance}, else: {:error, :not_found}
      error -> error
    end
  end

  @doc """
  Get all non-zero balances.
  """
  def get_non_zero_balances do
    case get_account() do
      {:ok, account} ->
        non_zero = Enum.filter(account.balances, fn b ->
          Decimal.gt?(b.free, Decimal.new(0)) or Decimal.gt?(b.locked, Decimal.new(0))
        end)
        {:ok, non_zero}
      error -> error
    end
  end

  @doc """
  Place an order.
  """
  def place_order(params) do
    config = get_config()
    RestClient.place_order(config, params)
  end

  @doc """
  Cancel an order.
  """
  def cancel_order(symbol, order_id) do
    config = get_config()
    RestClient.cancel_order(config, symbol, order_id)
  end

  @doc """
  Get order status.
  """
  def get_order(symbol, order_id) do
    config = get_config()
    RestClient.get_order(config, symbol, order_id)
  end

  @doc """
  Get open orders.
  """
  def get_open_orders(symbol \\ nil) do
    config = get_config()
    RestClient.get_open_orders(config, symbol)
  end

  # ============================================================================
  # SYSTEM STATUS
  # ============================================================================

  @doc """
  Get status of all WebSocket streams.
  """
  def stream_status do
    StreamSupervisor.status()
  end

  @doc """
  Get cache statistics.
  """
  def cache_stats do
    CacheManager.stats()
  end

  @doc """
  Get rate limit status.
  """
  def rate_limit_status do
    TradeEngine.Exchanges.Binance.RateLimiter.status()
  end

  @doc """
  Ping the exchange.
  """
  def ping do
    config = get_config()
    RestClient.ping(config)
  end

  @doc """
  Get server time.
  """
  def server_time do
    config = get_config()
    RestClient.get_server_time(config)
  end

  @doc """
  Get list of tracked symbols.
  """
  def tracked_symbols do
    Application.get_env(:trade_engine, :tracked_symbols, ~w(BTCUSDT ETHUSDT BNBUSDT SOLUSDT))
  end

  # ============================================================================
  # UTILITIES
  # ============================================================================

  @doc """
  Normalize a symbol (remove separators, uppercase).
  """
  def normalize_symbol(symbol) do
    symbol
    |> strip_ccxt_suffix()
    |> String.replace("/", "")
    |> String.upcase()
  end

  # Strip CCXT unified format suffixes:
  #   "BTC/USDT:USDT-260327" -> "BTC/USDT_260327" (quarterly delivery)
  #   "BTC/USDT:USDT"        -> "BTC/USDT" (perpetual swap)
  #   "BTC/USDT"             -> "BTC/USDT" (spot, unchanged)
  defp strip_ccxt_suffix(symbol) do
    case String.split(symbol, ":") do
      [base_quote, settle_part] ->
        case String.split(settle_part, "-") do
          [_settle, expiry] -> base_quote <> "_" <> expiry
          [_settle] -> base_quote
        end
      [_spot] -> symbol
    end
  end

  @doc """
  Check if a timeframe is valid.
  """
  def valid_timeframe?(tf) do
    tf in ~w(1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M)
  end

  @doc """
  Convert timeframe to milliseconds.
  """
  def timeframe_to_ms(tf) do
    case tf do
      "1m" -> 60_000
      "3m" -> 180_000
      "5m" -> 300_000
      "15m" -> 900_000
      "30m" -> 1_800_000
      "1h" -> 3_600_000
      "2h" -> 7_200_000
      "4h" -> 14_400_000
      "6h" -> 21_600_000
      "8h" -> 28_800_000
      "12h" -> 43_200_000
      "1d" -> 86_400_000
      "3d" -> 259_200_000
      "1w" -> 604_800_000
      _ -> nil
    end
  end

  # ============================================================================
  # PRIVATE
  # ============================================================================

  defp get_config do
    StreamSupervisor.get_config()
  rescue
    _ -> Config.from_env()
  end

  defp calculate_spread(nil, _), do: nil
  defp calculate_spread(_, nil), do: nil
  defp calculate_spread({bid_price, _}, {ask_price, _}) do
    Decimal.sub(ask_price, bid_price)
  end
end