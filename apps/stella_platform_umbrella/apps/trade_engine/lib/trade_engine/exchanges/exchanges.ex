defmodule TradeEngine.Exchanges.Exchanges do
  @moduledoc """
  Context module for querying exchanges, trading pairs, and user credentials.
  Supports both user-owned and service-account-owned credentials.
  """

  import Ecto.Query
  alias TradeEngine.Repo
  alias SysAdmin.Exchanges.{PlatformExchange, ExchangeTradingPair, ExchangeConfig}

  # ========================================================================
  # EXCHANGES
  # ========================================================================

  @doc "List all active platform exchanges"
  def list_exchanges do
    PlatformExchange
    |> where([e], e.is_active == true)
    |> order_by([e], asc: e.name)
    |> Repo.all()
  end

  @doc "Get a platform exchange by ID"
  def get_exchange(id) do
    case Repo.get(PlatformExchange, id) do
      nil -> {:error, :not_found}
      exchange -> {:ok, exchange}
    end
  end

  # ========================================================================
  # TRADING PAIRS
  # ========================================================================

  @doc "List trading pairs for an exchange (legacy, by exchange_id)"
  def list_trading_pairs(exchange_id) do
    ExchangeTradingPair
    |> where([p], p.exchange_id == ^exchange_id and p.is_active == true)
    |> order_by([p], asc: p.symbol)
    |> Repo.all()
  end

  @doc "List active, non-delisted trading pairs for an adapter"
  def list_trading_pairs_by_adapter(adapter_id) do
    ExchangeTradingPair
    |> where([p], p.adapter_id == ^adapter_id and p.is_active == true and p.delisted == false)
    |> order_by([p], asc: p.symbol)
    |> Repo.all()
  end

  # ========================================================================
  # USER CREDENTIALS
  # ========================================================================

  @doc "List exchange credentials for a user (without encrypted fields)"
  def list_user_credentials(user_id) do
    adapter_names = adapter_name_map()

    ExchangeConfig
    |> where([c], c.user_id == ^user_id)
    |> order_by([c], desc: :created_at)
    |> Repo.all()
    |> Enum.map(&sanitize_credential(&1, adapter_names))
  end

  @doc "List exchange credentials for a service account (without encrypted fields)"
  def list_service_account_credentials(service_account_id) do
    adapter_names = adapter_name_map()

    ExchangeConfig
    |> where([c], c.service_account_id == ^service_account_id)
    |> order_by([c], desc: :created_at)
    |> Repo.all()
    |> Enum.map(&sanitize_credential(&1, adapter_names))
  end

  @doc "Get a specific credential by ID (without encrypted fields)"
  def get_credential(id) do
    case Repo.get(ExchangeConfig, id) do
      nil -> {:error, :not_found}
      cred -> {:ok, sanitize_credential(cred, adapter_name_map())}
    end
  end

  @doc "Create a new credential (for user or service account)"
  def create_credential(attrs) do
    %ExchangeConfig{}
    |> ExchangeConfig.changeset(attrs)
    |> Repo.insert()
    |> case do
      {:ok, cred} -> {:ok, sanitize_credential(cred, adapter_name_map())}
      {:error, changeset} -> {:error, format_errors(changeset)}
    end
  end

  @doc "Update an existing credential"
  def update_credential(id, attrs) do
    case Repo.get(ExchangeConfig, id) do
      nil ->
        {:error, :not_found}

      cred ->
        cred
        |> ExchangeConfig.changeset(attrs)
        |> Repo.update()
        |> case do
          {:ok, updated} -> {:ok, sanitize_credential(updated, adapter_name_map())}
          {:error, changeset} -> {:error, format_errors(changeset)}
        end
    end
  end

  @doc "Delete a credential"
  def delete_credential(id) do
    case Repo.get(ExchangeConfig, id) do
      nil -> {:error, :not_found}
      cred -> Repo.delete(cred)
    end
  end

  # ========================================================================
  # ADAPTERS (for listing available exchanges to connect)
  # ========================================================================

  @doc "List all exchange adapters"
  def list_adapters do
    Repo.query("""
      SELECT id, code, name, status, auth_model, base_url, ws_url,
             sandbox_base_url, sandbox_ws_url, supports_spot, supports_margin,
             supports_futures, rate_limit_orders, rate_limit_queries, config
      FROM exchange.adapters
      ORDER BY name
    """)
    |> case do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)

      _ ->
        []
    end
  end

  # ========================================================================
  # PRIVATE
  # ========================================================================

  # Build a map of adapter_id => %{name, code} for enriching credentials
  defp adapter_name_map do
    case Repo.query("SELECT id, code, name FROM exchange.adapters") do
      {:ok, %{rows: rows}} ->
        Map.new(rows, fn [id, code, name] -> {id, %{name: name, code: code}} end)
      _ ->
        %{}
    end
  end

  # Strip encrypted fields — never expose API keys through admin endpoints
  defp sanitize_credential(cred, adapter_names \\ %{}) do
    adapter_info = Map.get(adapter_names, cred.adapter_id, %{})

    %{
      id: cred.id,
      user_id: cred.user_id,
      service_account_id: cred.service_account_id,
      adapter_id: cred.adapter_id,
      adapter_name: adapter_info[:name],
      adapter_code: adapter_info[:code],
      label: cred.exchange_name,
      status: cred.status,
      auth_model: cred.auth_model,
      is_sandbox: cred.is_sandbox,
      permissions: cred.permissions,
      ip_whitelist: cred.ip_whitelist,
      config_overrides: cred.config_overrides,
      wallet_address: cred.wallet_address,
      last_validated_at: cred.last_validated_at,
      validation_error: cred.validation_error,
      connected_at: cred.connected_at,
      last_used_at: cred.last_used_at,
      metadata: cred.metadata,
      created_at: cred.created_at,
      updated_at: cred.updated_at
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
    |> Enum.map(fn {field, msgs} -> "#{field}: #{Enum.join(msgs, ", ")}" end)
    |> Enum.join("; ")
  end
end
