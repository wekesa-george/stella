defmodule TradeEngine.Exchanges.Executor do
  @moduledoc """
  Config-driven exchange executor. Resolves credential_id → adapter module + credentials,
  then dispatches to the appropriate adapter.

  Caches resolved credentials in ETS for 5 minutes to avoid DB hits on every call.

  ## Usage

      Executor.execute_long(credential_id, "BTC/USD", 0.001, bot_context)
      Executor.get_price(credential_id, "BTC/USD")
      Executor.get_bars(credential_id, "BTC/USD", "5Min", 5)
      Executor.normalize_symbol(credential_id, "BTC/USD", :trading)
  """

  use GenServer
  require Logger

  alias TradeEngine.Repo

  @ets_table :executor_credential_cache
  @cache_ttl_ms 300_000  # 5 minutes

  @adapter_modules %{
    "alpaca" => TradeEngine.Exchanges.Adapters.Alpaca,
    "binance" => TradeEngine.Exchanges.Adapters.Binance,
    "binance_testnet" => TradeEngine.Exchanges.Adapters.Binance
  }

  # ========================================================================
  # CLIENT API
  # ========================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Execute a long position entry"
  def execute_long(credential_id, symbol, quantity, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      trading_symbol = adapter.normalize_symbol(symbol, :trading)
      adapter.execute_long(trading_symbol, quantity, creds, opts)
    end
  end

  @doc "Execute a short position entry"
  def execute_short(credential_id, symbol, quantity, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      trading_symbol = adapter.normalize_symbol(symbol, :trading)
      adapter.execute_short(trading_symbol, quantity, creds, opts)
    end
  end

  @doc "Close a long position"
  def close_long(credential_id, symbol, quantity, entry_price, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      trading_symbol = adapter.normalize_symbol(symbol, :trading)
      adapter.close_long(trading_symbol, quantity, entry_price, creds, opts)
    end
  end

  @doc "Close a short position"
  def close_short(credential_id, symbol, quantity, entry_price, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      trading_symbol = adapter.normalize_symbol(symbol, :trading)
      adapter.close_short(trading_symbol, quantity, entry_price, creds, opts)
    end
  end

  @doc "Place a limit order (used by grid bot and other limit-order strategies)"
  def place_limit_order(credential_id, symbol, side, quantity, price, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :place_limit_order, 6) do
        adapter.place_limit_order(symbol, side, quantity, price, creds, opts)
      else
        {:error, :limit_orders_not_supported}
      end
    end
  end

  @doc "Cancel an order by orderId"
  def cancel_order(credential_id, symbol, order_id, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :cancel_order, 4) do
        adapter.cancel_order(symbol, order_id, creds, opts)
      else
        {:error, :cancel_not_supported}
      end
    end
  end

  @doc "Get all open orders for a symbol"
  def get_open_orders(credential_id, symbol, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :get_open_orders, 3) do
        adapter.get_open_orders(symbol, creds, opts)
      else
        {:error, :open_orders_not_supported}
      end
    end
  end

  @doc "Get current price for a symbol. Pass market_type: in opts for correct endpoint routing."
  def get_price(credential_id, symbol, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      adapter.get_price(symbol, creds, opts)
    end
  end

  @doc "Get historical bars/candles. Pass market_type: in opts for correct endpoint routing."
  def get_bars(credential_id, symbol, timeframe, limit, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      adapter.get_bars(symbol, timeframe, limit, creds, opts)
    end
  end

  @doc "Get account info"
  def get_account(credential_id) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      adapter.get_account(creds)
    end
  end

  @doc """
  Get normalized balance for a credential. Supports both spot and futures.
  Pass market_type: "usds_futures" to fetch futures balance for Binance.
  Returns a normalized map with :total_balance, :available_balance, :assets, :currency.
  """
  def get_balance(credential_id, opts \\ []) do
    market_type = Keyword.get(opts, :market_type, "spot")

    with {:ok, adapter, creds} <- resolve(credential_id) do
      result = if market_type in ["usds_futures", "coinm_futures"] and
                  function_exported?(adapter, :get_futures_account, 1) do
        adapter.get_futures_account(creds)
      else
        adapter.get_account(creds)
      end

      case result do
        {:ok, data} ->
          {:ok, normalize_balance(data, adapter, market_type)}

        error ->
          error
      end
    end
  end

  defp normalize_balance(%{total_wallet_balance: total, total_available_balance: avail, assets: assets}, _adapter, market_type) do
    %{
      total_balance: total,
      available_balance: avail,
      currency: "USDT",
      market_type: market_type,
      assets: assets
    }
  end

  # Alpaca returns equity/cash/buying_power
  defp normalize_balance(%{equity: equity, cash: cash, buying_power: bp} = data, _adapter, _market_type) do
    %{
      total_balance: equity,
      available_balance: bp,
      currency: "USD",
      market_type: "spot",
      assets: [%{asset: "USD", wallet_balance: cash, available_balance: bp, unrealized_pnl: equity - cash}],
      account_status: data[:status]
    }
  end

  # Binance spot returns balances list
  defp normalize_balance(%{balances: balances}, _adapter, _market_type) when is_list(balances) do
    assets = Enum.map(balances, fn b ->
      free = parse_balance_float(b["free"])
      locked = parse_balance_float(b["locked"])
      %{asset: b["asset"], wallet_balance: free + locked, available_balance: free, unrealized_pnl: 0.0}
    end)

    total = Enum.reduce(assets, 0.0, fn a, acc -> acc + a.wallet_balance end)
    avail = Enum.reduce(assets, 0.0, fn a, acc -> acc + a.available_balance end)

    %{
      total_balance: total,
      available_balance: avail,
      currency: "MULTI",
      market_type: "spot",
      assets: assets
    }
  end

  defp normalize_balance(data, _adapter, market_type) do
    %{total_balance: 0.0, available_balance: 0.0, currency: "UNKNOWN", market_type: market_type, raw: data}
  end

  defp parse_balance_float(nil), do: 0.0
  defp parse_balance_float(n) when is_number(n), do: n * 1.0
  defp parse_balance_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> 0.0
    end
  end

  @doc "Normalize a symbol for a specific purpose"
  def normalize_symbol(credential_id, symbol, purpose) do
    with {:ok, adapter, _creds} <- resolve(credential_id) do
      {:ok, adapter.normalize_symbol(symbol, purpose)}
    end
  end

  @doc "Invalidate cached credentials for a credential_id"
  def invalidate_cache(credential_id) do
    try do
      :ets.delete(@ets_table, credential_id)
      :ok
    rescue
      _ -> :ok
    end
  end

  # ========================================================================
  # GENSERVER CALLBACKS
  # ========================================================================

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    Logger.info("Executor started — config-driven exchange dispatcher")
    {:ok, %{}}
  end

  # ========================================================================
  # CREDENTIAL RESOLUTION
  # ========================================================================

  @doc false
  def resolve(credential_id) do
    now = System.system_time(:millisecond)

    case lookup_cache(credential_id, now) do
      {:ok, adapter, creds} ->
        {:ok, adapter, creds}

      :miss ->
        case load_from_db(credential_id) do
          {:ok, adapter, creds} ->
            cache_put(credential_id, adapter, creds, now)
            {:ok, adapter, creds}

          error ->
            error
        end
    end
  end

  defp lookup_cache(credential_id, now) do
    try do
      case :ets.lookup(@ets_table, credential_id) do
        [{^credential_id, adapter, creds, cached_at}] when now - cached_at < @cache_ttl_ms ->
          {:ok, adapter, creds}

        _ ->
          :miss
      end
    rescue
      ArgumentError -> :miss
    end
  end

  defp cache_put(credential_id, adapter, creds, now) do
    :ets.insert(@ets_table, {credential_id, adapter, creds, now})
  end

  defp load_from_db(credential_id) do
    import Ecto.Query

    # Query credential with its adapter info joined
    query = from(c in {"user_credentials", SysAdmin.Exchanges.ExchangeConfig},
      prefix: "exchange",
      join: a in fragment("exchange.adapters"),
      on: c.adapter_id == a.id,
      where: c.id == ^credential_id,
      select: %{
        adapter_code: a.code,
        adapter_base_url: a.base_url,
        adapter_sandbox_base_url: a.sandbox_base_url,
        adapter_ws_url: a.ws_url,
        adapter_futures_base_url: fragment("?.futures_base_url", a),
        adapter_futures_sandbox_base_url: fragment("?.futures_sandbox_base_url", a),
        adapter_futures_ws_url: fragment("?.futures_ws_url", a),
        adapter_futures_sandbox_ws_url: fragment("?.futures_sandbox_ws_url", a),
        adapter_config: a.config,
        platform_api_key: fragment("?->>'platform_api_key'", a.config),
        platform_api_secret: fragment("?->>'platform_api_secret'", a.config),
        is_sandbox: c.is_sandbox,
        encrypted_api_key: c.encrypted_api_key,
        encrypted_api_secret: c.encrypted_api_secret,
        config_overrides: c.config_overrides,
        auth_model: c.auth_model
      }
    )

    case Repo.one(query) do
      nil ->
        Logger.error("Executor: credential #{credential_id} not found")
        {:error, :credential_not_found}

      row ->
        build_adapter_result(row)
    end
  rescue
    e ->
      Logger.error("Executor: DB query failed for #{credential_id}: #{inspect(e)}")
      {:error, :db_error}
  end

  defp build_adapter_result(row) do
    adapter_code = row.adapter_code

    case Map.get(@adapter_modules, adapter_code) do
      nil ->
        Logger.error("Executor: unknown adapter_code '#{adapter_code}'")
        {:error, {:unknown_adapter, adapter_code}}

      adapter_module ->
        base_url = if row.is_sandbox do
          row.adapter_sandbox_base_url || row.adapter_base_url
        else
          row.adapter_base_url
        end

        futures_base_url = if row.is_sandbox do
          row.adapter_futures_sandbox_base_url || row.adapter_futures_base_url
        else
          row.adapter_futures_base_url
        end

        # Resolve API credentials:
        # 1. Per-credential encrypted keys (user_auth)
        # 2. Platform-level keys from adapter config (platform_auth)
        {api_key, secret_key} = resolve_api_keys(row)

        # Build credential map with adapter-specific extras
        creds = %{
          api_key: api_key,
          secret_key: secret_key,
          base_url: base_url || ""
        }

        # Add futures_base_url from adapter if available
        creds = if futures_base_url, do: Map.put(creds, :futures_base_url, futures_base_url), else: creds

        # Add adapter-specific fields from config_overrides
        creds = merge_overrides(creds, row.config_overrides || %{}, adapter_code)

        {:ok, adapter_module, creds}
    end
  end

  defp resolve_api_keys(row) do
    # Prefer per-credential encrypted keys
    encrypted_key = row.encrypted_api_key
    encrypted_secret = row.encrypted_api_secret

    if encrypted_key && byte_size(encrypted_key) > 0 do
      # TODO: Implement actual decryption when encryption is set up
      # For now, treat as plaintext (Alpaca credentials are stored as plaintext)
      {to_string(encrypted_key), to_string(encrypted_secret || "")}
    else
      # Fall back to platform-level keys from adapter config
      {row.platform_api_key || "", row.platform_api_secret || ""}
    end
  end

  defp merge_overrides(creds, overrides, "alpaca") do
    creds
    |> maybe_put(:data_base_url, overrides["data_base_url"] || "https://data.alpaca.markets")
  end

  defp merge_overrides(creds, overrides, "binance" <> _) do
    creds
    |> maybe_put(:futures_base_url, overrides["futures_base_url"])
    |> maybe_put(:usds_futures_base_url, overrides["usds_futures_base_url"])
    |> maybe_put(:coinm_futures_base_url, overrides["coinm_futures_base_url"])
    |> maybe_put(:simulate_shorts, Map.get(overrides, "simulate_shorts", true))
  end

  defp merge_overrides(creds, _overrides, _adapter_code), do: creds

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)
end
