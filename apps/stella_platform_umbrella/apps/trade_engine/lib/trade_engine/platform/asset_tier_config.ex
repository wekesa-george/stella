defmodule TradeEngine.Platform.AssetTierConfig do
  @moduledoc """
  Ecto schema for `exchange.asset_tier_config` — per-exchange asset tier configuration.

  Provides DB-backed tier thresholds, position limits, asset lists, and confidence multipliers.
  Uses an ETS cache (`:asset_tier_config_cache`) with 5-minute TTL to avoid DB hits on every
  trade evaluation. The trading engine reads from ETS first, falling back to DB, falling back
  to hardcoded defaults.

  Cache flow:
    ETS lookup (0μs) → DB query (~2ms) → hardcoded defaults (compile-time)
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  alias TradeEngine.Repo

  @primary_key {:id, :binary_id, autogenerate: true}

  @schema_prefix "exchange"
  schema "asset_tier_config" do
    field :adapter_id, :binary_id

    # Tier balance thresholds (USD)
    field :tier1_min_balance, :decimal
    field :tier2_min_balance, :decimal
    field :tier3_min_balance, :decimal
    field :tier4_min_balance, :decimal

    # Position size limits (fraction of balance)
    field :tier1_max_position_pct, :decimal
    field :tier2_max_position_pct, :decimal
    field :tier3_max_position_pct, :decimal
    field :tier4_max_position_pct, :decimal

    # Max concurrent positions per tier
    field :tier1_max_positions, :integer
    field :tier2_max_positions, :integer
    field :tier3_max_positions, :integer
    field :tier4_max_positions, :integer

    # Asset lists per tier
    field :tier1_assets, {:array, :string}
    field :tier2_assets, {:array, :string}
    field :tier3_assets, {:array, :string}
    field :tier4_assets, {:array, :string}

    # Global cap
    field :max_position_pct, :decimal

    # Confidence multipliers (JSONB)
    field :confidence_multipliers, :map

    field :updated_at, :utc_datetime
    field :updated_by_user_id, :binary_id
  end

  @cache_table :asset_tier_config_cache
  @cache_ttl_ms 300_000  # 5 minutes

  # ════════════════════════════════════════════════════════════════════════════
  # ETS CACHE
  # ════════════════════════════════════════════════════════════════════════════

  @doc "Ensure ETS table exists. Safe to call multiple times."
  def ensure_cache do
    if :ets.whereis(@cache_table) == :undefined do
      :ets.new(@cache_table, [:named_table, :set, :public, read_concurrency: true])
    end
    :ok
  end

  @doc "Invalidate cached config for an adapter (called after admin updates)."
  def invalidate_cache(adapter_id) do
    ensure_cache()
    :ets.delete(@cache_table, adapter_id)
    :ok
  end

  @doc "Invalidate all cached configs."
  def invalidate_all do
    ensure_cache()
    :ets.delete_all_objects(@cache_table)
    :ok
  end

  # ════════════════════════════════════════════════════════════════════════════
  # PUBLIC API
  # ════════════════════════════════════════════════════════════════════════════

  @doc """
  Get asset tier config for an adapter. Checks ETS first, then DB.
  Returns `nil` if no config exists (caller should use hardcoded defaults).
  """
  def get_by_adapter_id(adapter_id) when is_binary(adapter_id) do
    ensure_cache()

    case :ets.lookup(@cache_table, adapter_id) do
      [{^adapter_id, config, cached_at}] ->
        if System.monotonic_time(:millisecond) - cached_at < @cache_ttl_ms do
          config
        else
          fetch_and_cache(adapter_id)
        end

      [] ->
        fetch_and_cache(adapter_id)
    end
  end

  def get_by_adapter_id(_), do: nil

  @doc "Get config by adapter code (e.g. 'binance'). Looks up adapter_id first."
  def get_by_adapter_code(code) when is_binary(code) do
    ensure_cache()

    cache_key = {:code, code}
    adapter_id = case :ets.lookup(@cache_table, cache_key) do
      [{^cache_key, id, _}] -> id
      [] ->
        id = case Repo.query("SELECT id FROM exchange.adapters WHERE code = $1 LIMIT 1", [code]) do
          {:ok, %{rows: [[found_id]]}} -> found_id
          _ -> nil
        end

        if id do
          :ets.insert(@cache_table, {cache_key, id, System.monotonic_time(:millisecond)})
        end

        id
    end

    if adapter_id, do: get_by_adapter_id(adapter_id), else: nil
  end

  @doc """
  Convert a config struct to the map format expected by AssetTierManager.
  Returns a map with :tier_thresholds, :position_size_limits, :max_positions,
  :tier_assets, :max_position_pct, :confidence_multipliers.
  """
  def to_tier_map(%__MODULE__{} = config) do
    %{
      tier_thresholds: %{
        starter: decimal_to_float(config.tier1_min_balance),
        growth: decimal_to_float(config.tier2_min_balance),
        established: decimal_to_float(config.tier3_min_balance),
        advanced: decimal_to_float(config.tier4_min_balance)
      },
      position_size_limits: %{
        starter: decimal_to_float(config.tier1_max_position_pct),
        growth: decimal_to_float(config.tier2_max_position_pct),
        established: decimal_to_float(config.tier3_max_position_pct),
        advanced: decimal_to_float(config.tier4_max_position_pct)
      },
      max_positions: %{
        starter: config.tier1_max_positions,
        growth: config.tier2_max_positions,
        established: config.tier3_max_positions,
        advanced: config.tier4_max_positions
      },
      tier_assets: %{
        starter: config.tier1_assets || [],
        growth: config.tier2_assets || [],
        established: config.tier3_assets || [],
        advanced: config.tier4_assets || []
      },
      max_position_pct: decimal_to_float(config.max_position_pct),
      confidence_multipliers: config.confidence_multipliers || %{}
    }
  end

  def to_tier_map(nil), do: nil

  @doc "Changeset for updates from admin API."
  def changeset(config, attrs) do
    config
    |> cast(attrs, [
      :adapter_id,
      :tier1_min_balance, :tier2_min_balance, :tier3_min_balance, :tier4_min_balance,
      :tier1_max_position_pct, :tier2_max_position_pct, :tier3_max_position_pct, :tier4_max_position_pct,
      :tier1_max_positions, :tier2_max_positions, :tier3_max_positions, :tier4_max_positions,
      :tier1_assets, :tier2_assets, :tier3_assets, :tier4_assets,
      :max_position_pct, :confidence_multipliers, :updated_by_user_id
    ])
    |> validate_required([:adapter_id])
    |> unique_constraint(:adapter_id)
  end

  # ════════════════════════════════════════════════════════════════════════════
  # PRIVATE
  # ════════════════════════════════════════════════════════════════════════════

  defp fetch_and_cache(adapter_id) do
    config = Repo.one(
      from c in __MODULE__,
        where: c.adapter_id == ^adapter_id
    )

    if config do
      :ets.insert(@cache_table, {adapter_id, config, System.monotonic_time(:millisecond)})
    end

    config
  rescue
    _ -> nil
  end

  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(n) when is_number(n), do: n / 1
  defp decimal_to_float(_), do: 0.0
end
