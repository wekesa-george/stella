defmodule TradeEngine.Risk.AssetTierManager do
  @moduledoc """
  ASSET TIER MANAGER - DB-Driven with Hardcoded Fallbacks

  Reads tier configuration from `exchange.asset_tier_config` via ETS cache.
  Falls back to compile-time defaults if no DB config exists for the adapter.

  Cache hierarchy:
    1. ETS `:asset_tier_config_cache` (5-min TTL, sub-microsecond reads)
    2. PostgreSQL `exchange.asset_tier_config` table (~2ms)
    3. Hardcoded `@` module attributes (compile-time, zero cost)

  DB-BACKED FUNCTIONS (take adapter_id):
    - is_allowed?/3, get_account_tier/2, get_allowed_assets/2
    - get_position_size_limit/2, get_max_positions/2, calculate_position_size/3

  LEGACY FUNCTIONS (use hardcoded defaults):
    - is_allowed?/2, get_account_tier/1, get_allowed_assets/1
    - get_position_size_limit/1, get_max_positions/1, calculate_position_size/2
  """

  require Logger

  alias TradeEngine.Platform.AssetTierConfig

  # ════════════════════════════════════════════════════════════════════════════
  # COMPILE-TIME FALLBACK DEFAULTS
  # These are used ONLY when no DB config exists for the adapter.
  # ════════════════════════════════════════════════════════════════════════════

  @tier_thresholds %{
    starter: 100,
    growth: 300,
    established: 1_500,
    advanced: 7_500
  }

  @position_size_limits %{
    starter: 0.12,
    growth: 0.08,
    established: 0.05,
    advanced: 0.03
  }

  @max_positions %{
    starter: 3,
    growth: 5,
    established: 7,
    advanced: 10
  }

  @tier1_assets [
    "DOGEUSDT", "SHIBUSDT", "PEPEUSDT", "BONKUSDT", "FLOKIUSDT", "TRXUSDT",
    "VETUSDT", "HOTUSDT", "ONEUSDT", "ZILUSDT", "GALAUSDT", "CHZUSDT",
    "ADAUSDT", "XLMUSDT", "ALGOUSDT", "HBARUSDT", "IOTAUSDT", "FTMUSDT",
    "MATICUSDT", "SANDUSDT", "MANAUSDT", "ARBUSDT", "XRPUSDT", "DOTUSDT",
    "SUIUSDT", "APTUSDT", "NEARUSDT", "OPUSDT", "ATOMUSDT", "WIFUSDT",
    "SOLUSDT", "LTCUSDT", "BTCUSDT", "ETHUSDT"
  ]

  @tier2_assets [
    "LINKUSDT", "AVAXUSDT", "UNIUSDT", "INJUSDT", "SEIUSDT", "RUNEUSDT",
    "PENDLEUSDT", "TIAUSDT", "STXUSDT", "IMXUSDT", "AXSUSDT", "GMXUSDT",
    "LDOUSDT", "RNDRUSDT", "FETUSDT", "AGIXUSDT", "BTCUSDT", "ETHUSDT"
  ]

  @tier3_assets ["BCHUSDT", "AAVEUSDT", "MKRUSDT", "BNBUSDT", "BTCUSDT", "ETHUSDT"]

  @tier4_assets ["BTCUSDT", "ETHUSDT"]

  @default_max_position_pct 0.15

  @default_confidence_multipliers %{
    "90" => 1.3, "80" => 1.15, "70" => 1.0, "60" => 0.85, "default" => 0.7
  }

  # ════════════════════════════════════════════════════════════════════════════
  # DB-BACKED CONFIG RESOLVER (ETS-cached)
  # ════════════════════════════════════════════════════════════════════════════

  @doc """
  Get resolved tier config map for an adapter. Returns a map with
  :tier_thresholds, :position_size_limits, :max_positions, :tier_assets,
  :max_position_pct, :confidence_multipliers.

  Tries DB (via ETS cache) first, falls back to hardcoded defaults.
  """
  def get_config(adapter_id) when is_binary(adapter_id) do
    case AssetTierConfig.get_by_adapter_id(adapter_id) do
      %AssetTierConfig{} = db_config ->
        AssetTierConfig.to_tier_map(db_config)
      nil ->
        default_config()
    end
  end

  def get_config(_), do: default_config()

  @doc "Get config by adapter code (e.g. 'binance')."
  def get_config_by_code(code) when is_binary(code) do
    case AssetTierConfig.get_by_adapter_code(code) do
      %AssetTierConfig{} = db_config ->
        Logger.info("[AssetTierManager] ✅ Using DB config for code=#{code}")
        AssetTierConfig.to_tier_map(db_config)
      nil ->
        Logger.warning("[AssetTierManager] ⚠️ No DB config for code=#{code}, using HARDCODED fallback defaults")
        default_config()
    end
  end

  defp default_config do
    %{
      tier_thresholds: @tier_thresholds,
      position_size_limits: @position_size_limits,
      max_positions: @max_positions,
      tier_assets: %{
        starter: @tier1_assets,
        growth: @tier2_assets,
        established: @tier3_assets,
        advanced: @tier4_assets
      },
      max_position_pct: @default_max_position_pct,
      confidence_multipliers: @default_confidence_multipliers
    }
  end

  # ════════════════════════════════════════════════════════════════════════════
  # DB-BACKED PUBLIC API (3-arity with adapter_id)
  # ════════════════════════════════════════════════════════════════════════════

  @doc "Get account tier using DB config for the given adapter."
  def get_account_tier(balance, adapter_id) when is_number(balance) and is_binary(adapter_id) do
    config = get_config(adapter_id)
    do_get_account_tier(balance, config)
  end

  @doc "Check if symbol is allowed for balance using DB config."
  def is_allowed?(symbol, balance, adapter_id)
      when is_binary(symbol) and is_number(balance) and is_binary(adapter_id) do
    config = get_config(adapter_id)
    tier = get_account_tier(balance, adapter_id)
    allowed = get_assets_for_tier_from_config(tier, config)
    symbol in allowed
  end

  @doc "Check if symbol is allowed using adapter code (e.g. 'binance') instead of adapter_id."
  def is_allowed_by_code?(symbol, balance, adapter_code)
      when is_binary(symbol) and is_number(balance) and is_binary(adapter_code) do
    config = get_config_by_code(adapter_code)
    tier = do_get_account_tier(balance, config)
    allowed = get_assets_for_tier_from_config(tier, config)
    symbol in allowed
  end

  @doc "Get account tier using adapter code (e.g. 'binance')."
  def get_account_tier_by_code(balance, adapter_code)
      when is_number(balance) and is_binary(adapter_code) do
    config = get_config_by_code(adapter_code)
    do_get_account_tier(balance, config)
  end

  @doc "Get allowed assets for a balance using DB config."
  def get_allowed_assets(balance, adapter_id) when is_number(balance) and is_binary(adapter_id) do
    config = get_config(adapter_id)
    tier = get_account_tier(balance, adapter_id)
    get_assets_for_tier_from_config(tier, config)
  end

  @doc "Get position size limit using DB config."
  def get_position_size_limit(balance, adapter_id) when is_number(balance) and is_binary(adapter_id) do
    config = get_config(adapter_id)
    tier = get_account_tier(balance, adapter_id)
    Map.get(config.position_size_limits, tier, 0.05)
  end

  @doc "Get max concurrent positions using DB config."
  def get_max_positions(balance, adapter_id) when is_number(balance) and is_binary(adapter_id) do
    config = get_config(adapter_id)
    tier = get_account_tier(balance, adapter_id)
    Map.get(config.max_positions, tier, 3)
  end

  @doc "Calculate position size using DB config (with confidence multipliers from DB)."
  def calculate_position_size(balance, confidence, adapter_id)
      when is_number(balance) and is_number(confidence) and is_binary(adapter_id) do
    config = get_config(adapter_id)
    tier = get_account_tier(balance, adapter_id)
    limit = Map.get(config.position_size_limits, tier, 0.05)
    base_size = balance * limit

    multipliers = config.confidence_multipliers || @default_confidence_multipliers
    confidence_multiplier = cond do
      confidence >= 90 -> Map.get(multipliers, "90", 1.3)
      confidence >= 80 -> Map.get(multipliers, "80", 1.15)
      confidence >= 70 -> Map.get(multipliers, "70", 1.0)
      confidence >= 60 -> Map.get(multipliers, "60", 0.85)
      true -> Map.get(multipliers, "default", 0.7)
    end

    max_pct = config.max_position_pct || @default_max_position_pct
    min(base_size * confidence_multiplier, balance * max_pct)
  end

  @doc "Get asset's minimum tier using DB config."
  def get_asset_tier(symbol, adapter_id) when is_binary(symbol) and is_binary(adapter_id) do
    config = get_config(adapter_id)
    assets = config.tier_assets

    cond do
      symbol in (assets.starter || []) -> :starter
      symbol in (assets.growth || []) -> :growth
      symbol in (assets.established || []) -> :established
      symbol in (assets.advanced || []) -> :advanced
      true -> :unknown
    end
  end

  @doc "Filter signals by tier using DB config."
  def filter_signals_by_tier(signals, balance, adapter_id)
      when is_list(signals) and is_number(balance) and is_binary(adapter_id) do
    allowed = get_allowed_assets(balance, adapter_id)
    Enum.filter(signals, fn signal -> signal.symbol in allowed end)
  end

  # ════════════════════════════════════════════════════════════════════════════
  # LEGACY PUBLIC API (2-arity, hardcoded defaults — backward compat)
  # ════════════════════════════════════════════════════════════════════════════

  def get_account_tier(balance) when is_number(balance) do
    cond do
      balance >= @tier_thresholds.advanced -> :advanced
      balance >= @tier_thresholds.established -> :established
      balance >= @tier_thresholds.growth -> :growth
      balance >= @tier_thresholds.starter -> :starter
      true -> :insufficient
    end
  end

  def get_allowed_assets(balance) when is_number(balance) do
    tier = get_account_tier(balance)
    get_assets_for_tier(tier)
  end

  def get_assets_for_tier(tier) do
    case tier do
      :starter -> @tier1_assets
      :growth -> @tier1_assets ++ @tier2_assets
      :established -> @tier1_assets ++ @tier2_assets ++ @tier3_assets
      :advanced -> @tier1_assets ++ @tier2_assets ++ @tier3_assets ++ @tier4_assets
      :insufficient -> []
    end
  end

  def is_allowed?(symbol, balance) when is_binary(symbol) and is_number(balance) do
    allowed = get_allowed_assets(balance)
    symbol in allowed
  end

  def get_asset_tier(symbol) when is_binary(symbol) do
    cond do
      symbol in @tier1_assets -> :starter
      symbol in @tier2_assets -> :growth
      symbol in @tier3_assets -> :established
      symbol in @tier4_assets -> :advanced
      true -> :unknown
    end
  end

  def get_min_balance_for_asset(symbol) when is_binary(symbol) do
    case get_asset_tier(symbol) do
      :starter -> @tier_thresholds.starter
      :growth -> @tier_thresholds.growth
      :established -> @tier_thresholds.established
      :advanced -> @tier_thresholds.advanced
      :unknown -> @tier_thresholds.advanced
    end
  end

  def get_position_size_limit(balance) do
    tier = get_account_tier(balance)
    Map.get(@position_size_limits, tier, 0.05)
  end

  def get_max_positions(balance) do
    tier = get_account_tier(balance)
    Map.get(@max_positions, tier, 3)
  end

  def calculate_position_size(balance, confidence \\ 50) do
    base_size = balance * get_position_size_limit(balance)

    confidence_multiplier = cond do
      confidence >= 90 -> 1.3
      confidence >= 80 -> 1.15
      confidence >= 70 -> 1.0
      confidence >= 60 -> 0.85
      true -> 0.7
    end

    min(base_size * confidence_multiplier, balance * 0.15)
  end

  def filter_signals_by_tier(signals, balance) when is_list(signals) do
    allowed = get_allowed_assets(balance)
    Enum.filter(signals, fn signal -> signal.symbol in allowed end)
  end

  def get_scalping_priority(balance) do
    allowed = get_allowed_assets(balance)

    priority = [
      "DOGEUSDT", "XRPUSDT", "ADAUSDT", "SOLUSDT", "SHIBUSDT",
      "PEPEUSDT", "SUIUSDT", "APTUSDT", "NEARUSDT", "WIFUSDT",
      "TRXUSDT", "DOTUSDT", "LINKUSDT", "AVAXUSDT", "ATOMUSDT",
      "ARBUSDT", "OPUSDT", "FTMUSDT", "MATICUSDT", "BONKUSDT",
      "UNIUSDT", "INJUSDT", "XLMUSDT", "ALGOUSDT", "VETUSDT"
    ]

    priority
    |> Enum.filter(&(&1 in allowed))
    |> Kernel.++(allowed -- priority)
    |> Enum.uniq()
  end

  def get_tier_info(balance) do
    tier = get_account_tier(balance)

    %{
      tier: tier,
      tier_name: tier_display_name(tier),
      balance: balance,
      allowed_assets: get_assets_for_tier(tier),
      asset_count: length(get_assets_for_tier(tier)),
      position_size_pct: get_position_size_limit(balance) * 100,
      max_positions: get_max_positions(balance),
      next_tier: next_tier(tier),
      next_tier_threshold: next_tier_threshold(tier),
      progress_to_next: progress_to_next_tier(balance, tier)
    }
  end

  def log_tier_status(balance) do
    info = get_tier_info(balance)

    Logger.info("""

    ════════════════════════════════════════════════════════════════
    ACCOUNT TIER STATUS
    ════════════════════════════════════════════════════════════════
    Balance:          $#{Float.round(balance, 2)}
    Tier:             #{info.tier_name}
    Allowed Assets:   #{info.asset_count} symbols
    Position Size:    #{info.position_size_pct}% max
    Max Positions:    #{info.max_positions}
    ────────────────────────────────────────────────────────────────
    Next Tier:        #{if info.next_tier, do: tier_display_name(info.next_tier), else: "MAX TIER"}
    Threshold:        #{if info.next_tier_threshold, do: "$#{info.next_tier_threshold}", else: "N/A"}
    Progress:         #{Float.round(info.progress_to_next * 100, 1)}%
    ════════════════════════════════════════════════════════════════
    """)

    info
  end

  # ════════════════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ════════════════════════════════════════════════════════════════════════════

  defp do_get_account_tier(balance, config) do
    thresholds = config.tier_thresholds

    cond do
      balance >= thresholds.advanced -> :advanced
      balance >= thresholds.established -> :established
      balance >= thresholds.growth -> :growth
      balance >= thresholds.starter -> :starter
      true -> :insufficient
    end
  end

  defp get_assets_for_tier_from_config(tier, config) do
    assets = config.tier_assets
    case tier do
      :starter -> assets.starter || []
      :growth -> (assets.starter || []) ++ (assets.growth || [])
      :established -> (assets.starter || []) ++ (assets.growth || []) ++ (assets.established || [])
      :advanced -> (assets.starter || []) ++ (assets.growth || []) ++ (assets.established || []) ++ (assets.advanced || [])
      :insufficient -> []
    end
  end

  defp tier_display_name(tier) do
    case tier do
      :starter -> "STARTER"
      :growth -> "GROWTH"
      :established -> "ESTABLISHED"
      :advanced -> "ADVANCED"
      :insufficient -> "INSUFFICIENT"
      _ -> "UNKNOWN"
    end
  end

  defp next_tier(tier) do
    case tier do
      :starter -> :growth
      :growth -> :established
      :established -> :advanced
      :advanced -> nil
      _ -> :starter
    end
  end

  defp next_tier_threshold(tier) do
    case next_tier(tier) do
      :growth -> @tier_thresholds.growth
      :established -> @tier_thresholds.established
      :advanced -> @tier_thresholds.advanced
      nil -> nil
      _ -> @tier_thresholds.starter
    end
  end

  defp progress_to_next_tier(balance, tier) do
    current_threshold = Map.get(@tier_thresholds, tier, 0)
    next_threshold = next_tier_threshold(tier)

    case next_threshold do
      nil -> 1.0
      next when next > current_threshold ->
        progress = (balance - current_threshold) / (next - current_threshold)
        progress |> max(0.0) |> min(1.0)
      _ -> 0.0
    end
  end
end
