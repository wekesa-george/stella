defmodule TradeEngine.Exchanges.Behaviour do
  @moduledoc """
  Behaviour definition for exchange adapters.
  
  This module defines the contract that all exchange implementations must follow.
  It ensures consistent APIs across different exchanges (Binance, Alpaca, etc.)
  while allowing each to have exchange-specific features.
  
  ## Implementing a New Exchange
  
      defmodule MyExchange do
        @behaviour TradeEngine.Exchanges.Behaviour
        
        @impl true
        def get_price(symbol) do
          # Fetch price for symbol
        end
        
        # ... implement all callbacks
      end
  
  ## Categories
  
  Callbacks are organized into categories:
  
  1. **Market Data** - Prices, candles, order books
  2. **Account** - Balances, account info
  3. **Orders** - Place, cancel, query orders
  4. **Subscriptions** - Real-time data streams
  5. **System** - Health checks, status
  """

  alias TradeEngine.Exchanges.Types.{Candle, Ticker, OrderBook}

  # ============================================================================
  # MARKET DATA
  # ============================================================================

  @doc """
  Get current price for a trading pair.
  
  Returns `{:ok, price}` or `{:error, reason}`.
  """
  @callback get_price(symbol :: String.t()) :: {:ok, Decimal.t()} | {:error, term()}

  @doc """
  Get prices for multiple symbols.
  """
  @callback get_prices(symbols :: [String.t()]) :: {:ok, [%{symbol: String.t(), price: Decimal.t()}]} | {:error, term()}

  @doc """
  Get ticker data with 24h stats.
  """
  @callback get_ticker(symbol :: String.t()) :: {:ok, Ticker.t()} | {:error, term()}

  @doc """
  Get historical candles/klines.
  """
  @callback get_klines(
    symbol :: String.t(),
    timeframe :: String.t(),
    opts :: keyword()
  ) :: {:ok, [Candle.t()]} | {:error, term()}

  @doc """
  Get order book depth.
  """
  @callback get_orderbook(symbol :: String.t(), limit :: non_neg_integer()) :: 
    {:ok, OrderBook.t()} | {:error, term()}

  # ============================================================================
  # ACCOUNT
  # ============================================================================

  @doc """
  Get account information including balances.
  """
  @callback get_account() :: {:ok, map()} | {:error, term()}

  @doc """
  Get balance for a specific asset.
  """
  @callback get_balance(asset :: String.t()) :: 
    {:ok, %{free: Decimal.t(), locked: Decimal.t()}} | {:error, term()}

  # ============================================================================
  # ORDERS
  # ============================================================================

  @doc """
  Place a new order.
  
  ## Required Parameters
  
  - `:symbol` - Trading pair
  - `:side` - "BUY" or "SELL"
  - `:type` - Order type ("LIMIT", "MARKET", etc.)
  - `:quantity` - Order quantity
  
  ## Optional Parameters
  
  - `:price` - Limit price (required for LIMIT orders)
  - `:time_in_force` - "GTC", "IOC", "FOK"
  - `:stop_price` - For stop orders
  """
  @callback place_order(params :: map()) :: {:ok, map()} | {:error, term()}

  @doc """
  Cancel an existing order.
  """
  @callback cancel_order(symbol :: String.t(), order_id :: String.t() | integer()) ::
    {:ok, map()} | {:error, term()}

  @doc """
  Get order status.
  """
  @callback get_order(symbol :: String.t(), order_id :: String.t() | integer()) ::
    {:ok, map()} | {:error, term()}

  @doc """
  Get all open orders, optionally filtered by symbol.
  """
  @callback get_open_orders(symbol :: String.t() | nil) :: {:ok, [map()]} | {:error, term()}

  # ============================================================================
  # SUBSCRIPTIONS
  # ============================================================================

  @doc """
  Subscribe calling process to ticker updates for a symbol.
  """
  @callback subscribe_ticker(symbol :: String.t()) :: :ok | {:error, term()}

  @doc """
  Subscribe calling process to candle updates.
  """
  @callback subscribe_candles(symbol :: String.t(), timeframe :: String.t()) :: :ok | {:error, term()}

  @doc """
  Subscribe calling process to order book updates.
  """
  @callback subscribe_depth(symbol :: String.t()) :: :ok | {:error, term()}

  # ============================================================================
  # SYSTEM
  # ============================================================================

  @doc """
  Check connectivity to exchange.
  """
  @callback ping() :: {:ok, :pong} | {:error, term()}

  @doc """
  Get exchange server time.
  """
  @callback server_time() :: {:ok, DateTime.t()} | {:error, term()}

  @doc """
  Get rate limit status.
  """
  @callback rate_limit_status() :: %{
    used_weight: non_neg_integer(),
    max_weight: non_neg_integer(),
    reset_at: DateTime.t()
  }

  # ============================================================================
  # OPTIONAL CALLBACKS
  # ============================================================================

  @doc """
  Normalize symbol to exchange format.
  """
  @callback normalize_symbol(symbol :: String.t()) :: String.t()

  @doc """
  Check if a symbol is valid on this exchange.
  """
  @callback valid_symbol?(symbol :: String.t()) :: boolean()

  @doc """
  Get list of valid timeframes.
  """
  @callback valid_timeframes() :: [String.t()]

  # Mark some callbacks as optional
  @optional_callbacks [
    normalize_symbol: 1,
    valid_symbol?: 1,
    valid_timeframes: 0
  ]
end