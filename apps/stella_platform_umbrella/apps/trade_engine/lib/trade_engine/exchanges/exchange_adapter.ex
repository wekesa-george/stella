defmodule TradeEngine.Exchanges.ExchangeAdapter do
  @moduledoc """
  Behaviour contract for exchange adapters.

  Each adapter implements exchange-specific logic: HTTP auth, request signing,
  response parsing, and symbol normalization. The Executor dispatcher resolves
  which adapter to call based on the credential's adapter_code.

  All callbacks receive a `credentials` map with at minimum:
    %{api_key: String.t(), secret_key: String.t(), base_url: String.t()}
  Plus any adapter-specific keys (e.g. data_base_url for Alpaca).
  """

  @type symbol :: String.t()
  @type quantity :: number()
  @type credentials :: %{
          required(:api_key) => String.t(),
          required(:secret_key) => String.t(),
          required(:base_url) => String.t(),
          optional(atom()) => any()
        }
  @type opts :: keyword()

  @callback execute_long(symbol, quantity, credentials, opts) ::
              {:ok, map()} | {:error, term()}

  @callback execute_short(symbol, quantity, credentials, opts) ::
              {:ok, map()} | {:error, term()}

  @callback close_long(symbol, quantity, entry_price :: number(), credentials, opts) ::
              {:ok, map()} | {:error, term()}

  @callback close_short(symbol, quantity, entry_price :: number(), credentials, opts) ::
              {:ok, map()} | {:error, term()}

  @callback get_price(symbol, credentials, opts) ::
              {:ok, Decimal.t()} | {:error, term()}

  @callback get_bars(symbol, timeframe :: String.t(), limit :: pos_integer(), credentials, opts) ::
              {:ok, [map()]} | {:error, term()}

  @callback get_account(credentials) ::
              {:ok, map()} | {:error, term()}

  @doc """
  Normalize a symbol for a specific purpose.
  - `:trading` — format needed for placing orders (e.g. "BTCUSD" for Alpaca, "BTCUSDT" for Binance)
  - `:data` — format needed for market data queries (e.g. "BTC/USD" for Alpaca data API)
  """
  @callback normalize_symbol(symbol, purpose :: :trading | :data) :: String.t()
end
