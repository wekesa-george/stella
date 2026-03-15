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
  @credential_health_table :executor_credential_health
  @cache_ttl_ms 300_000  # 5 minutes
  @health_check_interval_ms 600_000  # 10 minutes
  @stale_credential_threshold_ms 86_400_000  # 24 hours without successful use

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
      |> track_result(credential_id)
    end
  end

  @doc "Execute a short position entry"
  def execute_short(credential_id, symbol, quantity, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      trading_symbol = adapter.normalize_symbol(symbol, :trading)
      adapter.execute_short(trading_symbol, quantity, creds, opts)
      |> track_result(credential_id)
    end
  end

  @doc "Close a long position"
  def close_long(credential_id, symbol, quantity, entry_price, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      trading_symbol = adapter.normalize_symbol(symbol, :trading)
      adapter.close_long(trading_symbol, quantity, entry_price, creds, opts)
      |> track_result(credential_id)
    end
  end

  @doc "Close a short position"
  def close_short(credential_id, symbol, quantity, entry_price, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      trading_symbol = adapter.normalize_symbol(symbol, :trading)
      adapter.close_short(trading_symbol, quantity, entry_price, creds, opts)
      |> track_result(credential_id)
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

  defp normalize_balance(%{total_wallet_balance: total, total_available_balance: avail, assets: assets} = data, _adapter, market_type) do
    cross_unrealized = Enum.reduce(assets, 0.0, fn a, acc -> acc + (a[:unrealized_pnl] || 0.0) end)
    %{
      total_balance: total,
      total_wallet_balance: total,
      available_balance: avail,
      unrealized_pnl: cross_unrealized,
      cross_unrealized_pnl: cross_unrealized,
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

  @doc "Get futures position risk (open positions on exchange)"
  def get_position_risk(credential_id, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :get_position_risk, 2) do
        adapter.get_position_risk(creds, opts)
      else
        {:error, :position_risk_not_supported}
      end
    end
  end

  @doc "Get all orders (including historical) for a symbol"
  def get_all_orders(credential_id, symbol, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :get_all_orders, 3) do
        adapter.get_all_orders(symbol, creds, opts)
      else
        {:error, :all_orders_not_supported}
      end
    end
  end

  @doc "Get user trades (fills) for a symbol"
  def get_user_trades(credential_id, symbol, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :get_user_trades, 3) do
        adapter.get_user_trades(symbol, creds, opts)
      else
        {:error, :user_trades_not_supported}
      end
    end
  end

  @doc "Get 24hr ticker statistics"
  def get_24h_ticker(credential_id, symbol, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :get_24h_ticker, 3) do
        adapter.get_24h_ticker(symbol, creds, opts)
      else
        {:error, :ticker_24h_not_supported}
      end
    end
  end

  @doc "Get exchange info (symbol filters, precisions)"
  def get_exchange_info(credential_id, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :get_exchange_info, 2) do
        adapter.get_exchange_info(creds, opts)
      else
        {:error, :exchange_info_not_supported}
      end
    end
  end

  @doc "Set leverage for a futures symbol on the exchange"
  def set_leverage(credential_id, symbol, leverage) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :set_leverage, 3) do
        adapter.set_leverage(symbol, leverage, creds)
      else
        {:error, :set_leverage_not_supported}
      end
    end
  end

  @doc "Get income history (funding fees, realized PnL, commissions)"
  def get_income_history(credential_id, opts \\ []) do
    with {:ok, adapter, creds} <- resolve(credential_id) do
      if function_exported?(adapter, :get_income_history, 2) do
        adapter.get_income_history(creds, opts)
      else
        {:error, :income_history_not_supported}
      end
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
      record_credential_event(credential_id, :invalidated)
      :ok
    rescue
      _ -> :ok
    end
  end

  @doc "Record a successful API call for a credential"
  def record_success(credential_id) do
    record_credential_event(credential_id, :success)
  end

  @doc "Record a failed API call for a credential"
  def record_failure(credential_id, reason \\ :unknown) do
    record_credential_event(credential_id, {:failure, reason})
  end

  @doc "Get credential health stats for dashboard"
  def credential_health_stats do
    try do
      :ets.tab2list(@credential_health_table)
      |> Enum.map(fn {cred_id, health} -> {cred_id, health} end)
      |> Map.new()
    rescue
      _ -> %{}
    end
  end

  # ========================================================================
  # GENSERVER CALLBACKS
  # ========================================================================

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    :ets.new(@credential_health_table, [:named_table, :set, :public, read_concurrency: true])
    Process.send_after(self(), :check_credential_health, @health_check_interval_ms)
    Logger.info("Executor started — config-driven exchange dispatcher")
    {:ok, %{}}
  end

  @impl true
  def handle_info(:check_credential_health, state) do
    Process.send_after(self(), :check_credential_health, @health_check_interval_ms)
    check_stale_credentials()
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

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
        # Ensure module is loaded so function_exported? works reliably
        Code.ensure_loaded(adapter_module)

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

  defp track_result({:ok, _} = result, credential_id) do
    record_credential_event(credential_id, :success)
    result
  end

  defp track_result({:error, reason} = result, credential_id) do
    record_credential_event(credential_id, {:failure, reason})
    result
  end

  defp track_result(other, _credential_id), do: other

  # ========================================================================
  # CREDENTIAL HEALTH TRACKING
  # ========================================================================

  defp record_credential_event(credential_id, event) do
    now = System.system_time(:millisecond)

    existing = try do
      case :ets.lookup(@credential_health_table, credential_id) do
        [{^credential_id, health}] -> health
        _ -> nil
      end
    rescue
      _ -> nil
    end

    health = case {existing, event} do
      {nil, :success} ->
        %{
          credential_id: credential_id,
          first_seen: now,
          last_success: now,
          last_failure: nil,
          success_count: 1,
          failure_count: 0,
          consecutive_failures: 0,
          last_failure_reason: nil,
          status: :healthy
        }

      {nil, {:failure, reason}} ->
        %{
          credential_id: credential_id,
          first_seen: now,
          last_success: nil,
          last_failure: now,
          success_count: 0,
          failure_count: 1,
          consecutive_failures: 1,
          last_failure_reason: inspect(reason),
          status: :degraded
        }

      {nil, :invalidated} ->
        %{
          credential_id: credential_id,
          first_seen: now,
          last_success: nil,
          last_failure: now,
          success_count: 0,
          failure_count: 0,
          consecutive_failures: 0,
          last_failure_reason: "invalidated",
          status: :invalidated
        }

      {h, :success} ->
        %{h |
          last_success: now,
          success_count: h.success_count + 1,
          consecutive_failures: 0,
          status: :healthy
        }

      {h, {:failure, reason}} ->
        consecutive = h.consecutive_failures + 1
        status = if consecutive >= 3, do: :failing, else: :degraded

        %{h |
          last_failure: now,
          failure_count: h.failure_count + 1,
          consecutive_failures: consecutive,
          last_failure_reason: inspect(reason),
          status: status
        }

      {h, :invalidated} ->
        %{h | status: :invalidated, last_failure: now, last_failure_reason: "invalidated"}
    end

    :ets.insert(@credential_health_table, {credential_id, health})
  rescue
    _ -> :ok
  end

  defp check_stale_credentials do
    now = System.system_time(:millisecond)

    try do
      :ets.tab2list(@credential_health_table)
      |> Enum.each(fn {cred_id, health} ->
        # Check for credentials that haven't been used successfully in 24h
        stale? = case health.last_success do
          nil -> health.first_seen && (now - health.first_seen) > @stale_credential_threshold_ms
          ts -> (now - ts) > @stale_credential_threshold_ms
        end

        if stale? do
          Logger.warning("Executor: credential #{cred_id} has not been used successfully in 24h (status: #{health.status})")

          Phoenix.PubSub.broadcast(TradeEngine.PubSub, "alerts:new", {:new_alert, %{
            id: Ecto.UUID.generate(),
            alert_type: "credential_stale",
            category: "infrastructure",
            severity: "warning",
            title: "Stale Exchange Credential",
            message: "Credential #{String.slice(to_string(cred_id), 0, 8)}... unused for 24h+ (#{health.failure_count} failures)",
            metadata: %{credential_id: cred_id, status: health.status, last_success: health.last_success},
            timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
          }})
        end

        # Check for credentials with 3+ consecutive failures
        if health.consecutive_failures >= 3 and health.status == :failing do
          Logger.error("Executor: credential #{cred_id} has #{health.consecutive_failures} consecutive failures: #{health.last_failure_reason}")

          Phoenix.PubSub.broadcast(TradeEngine.PubSub, "alerts:new", {:new_alert, %{
            id: Ecto.UUID.generate(),
            alert_type: "credential_failing",
            category: "infrastructure",
            severity: "critical",
            title: "Exchange Credential Failing",
            message: "Credential #{String.slice(to_string(cred_id), 0, 8)}... has #{health.consecutive_failures} consecutive failures",
            metadata: %{credential_id: cred_id, reason: health.last_failure_reason},
            timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
          }})
        end
      end)
    rescue
      _ -> :ok
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
