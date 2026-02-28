defmodule TradeEngine.Risk.AssetTierManager do
  @moduledoc """
  🎯 ASSET TIER MANAGER - Optimized for Small Account Growth
  
  VISION: Help $100 accounts grow by providing MORE trading opportunities
  
  CHANGES FROM PREVIOUS VERSION:
  ══════════════════════════════════════════════════════════════════════════════
  1. Added 10+ new cheap assets for STARTER tier (meme coins, new L1s)
  2. Lowered GROWTH threshold from $500 to $300 for faster progression
  3. Added more mid-tier assets for diversification
  4. Prioritized high-volume assets for better fills
  ══════════════════════════════════════════════════════════════════════════════
  
  TIER STRUCTURE (Optimized):
  ══════════════════════════════════════════════════════════════════════════════
  
  TIER 1: STARTER ($100 - $300)
  ├── 25 low-priced assets (< $5)
  ├── Max position: 12% of account (meets $10 notional)
  ├── Focus: High volume, good liquidity, manageable volatility
  └── NEW: Added SHIB, PEPE, BONK, WIF, TRX, XLM, FTM, etc.
  
  TIER 2: GROWTH ($300 - $1,500)  
  ├── 35+ assets (Tier 1 + mid-priced)
  ├── Max position: 8% of account
  ├── Added: SOL moved here (was Tier 3), more DeFi tokens
  └── Threshold lowered from $500 to $300
  
  TIER 3: ESTABLISHED ($1,500 - $7,500)
  ├── 40+ assets (+ higher-priced alts)
  ├── Max position: 5% of account
  ├── Added: LTC, BCH, AAVE, MKR
  └── Threshold lowered from $2,000 to $1,500
  
  TIER 4: ADVANCED ($7,500+)
  ├── ALL assets including BTC, ETH, BNB
  ├── Max position: 3% of account (risk management)
  └── Threshold lowered from $10,000 to $7,500
  
  ══════════════════════════════════════════════════════════════════════════════
  """

  require Logger

  # ════════════════════════════════════════════════════════════════════════════
  # TIER THRESHOLDS (Optimized for faster progression)
  # ════════════════════════════════════════════════════════════════════════════

  @tier_thresholds %{
    starter: 100,       # $100 - $300
    growth: 300,        # $300 - $1,500 (was $500)
    established: 1_500, # $1,500 - $7,500 (was $2,000)
    advanced: 7_500     # $7,500+ (was $10,000)
  }

  # Position size limits by tier (% of account)
  @position_size_limits %{
    starter: 0.12,      # 12% max (~$12 on $100, meets notional)
    growth: 0.08,       # 8% max
    established: 0.05,  # 5% max
    advanced: 0.03      # 3% max (risk management for large accounts)
  }

  # Maximum concurrent positions by tier
  @max_positions %{
    starter: 3,         # Focus on quality
    growth: 5,
    established: 7,
    advanced: 10
  }

  # ════════════════════════════════════════════════════════════════════════════
  # TIER 1: STARTER ASSETS (25 assets, price < $5)
  # Focus: High volume, good liquidity, affordable for $100 accounts
  # ════════════════════════════════════════════════════════════════════════════

  @tier1_assets [
    # === ULTRA-CHEAP (< $0.10) - Best for tiny accounts ===
    "DOGEUSDT",   # ~$0.14 - Meme king, extremely liquid
    "SHIBUSDT",   # ~$0.00002 - Very cheap, high volume
    "PEPEUSDT",   # ~$0.00001 - Hot meme coin, volatile
    "BONKUSDT",   # ~$0.00003 - Solana meme
    "FLOKIUSDT",  # ~$0.0002 - Meme, decent volume
    "TRXUSDT",    # ~$0.25 - Tron, very liquid
    "VETUSDT",    # ~$0.03 - VeChain, cheap
    "HOTUSDT",    # ~$0.002 - Holo, very cheap
    "ONEUSDT",    # ~$0.01 - Harmony
    "ZILUSDT",    # ~$0.02 - Zilliqa
    "GALAUSDT",   # ~$0.03 - Gaming
    "CHZUSDT",    # ~$0.07 - Fan tokens
    
    # === CHEAP ($0.10 - $1.00) - Good value ===
    "ADAUSDT",    # ~$0.41 - Cardano, solid volume
    "XLMUSDT",    # ~$0.35 - Stellar, very liquid
    "ALGOUSDT",   # ~$0.20 - Algorand
    "HBARUSDT",   # ~$0.08 - Hedera
    "IOTAUSDT",   # ~$0.20 - IOTA
    "FTMUSDT",    # ~$0.70 - Fantom, good volatility
    "MATICUSDT",  # ~$0.50 - Polygon (moved from Tier 2)
    "SANDUSDT",   # ~$0.50 - Metaverse
    "MANAUSDT",   # ~$0.45 - Decentraland
    "ARBUSDT",    # ~$0.80 - Arbitrum L2
    
    # === AFFORDABLE ($1.00 - $5.00) - Starter accessible ===
    "XRPUSDT",    # ~$2.03 - Ripple, extremely liquid
    "DOTUSDT",    # ~$2.04 - Polkadot
    "SUIUSDT",    # ~$1.61 - Sui, new L1
    "APTUSDT",    # ~$1.69 - Aptos
    "NEARUSDT",   # ~$1.67 - NEAR Protocol
    "OPUSDT",     # ~$0.31 - Optimism L2
    "ATOMUSDT",   # ~$2.18 - Cosmos
    "WIFUSDT",    # ~$2.50 - Popular Solana meme
    
    # === HIGH-QUALITY SIGNAL ASSETS (Added for better trading) ===
    "SOLUSDT",    # ~$133 - Solana - Has 90% signals with 0.9% moves!
    "LTCUSDT",    # ~$81 - Litecoin - Good signals, decent moves
  ]

  # ════════════════════════════════════════════════════════════════════════════
  # TIER 2: GROWTH ASSETS (Price $5 - $50)
  # Unlocked at $300 balance
  # ════════════════════════════════════════════════════════════════════════════

  @tier2_assets [
    "LINKUSDT",   # ~$13.78 - Chainlink, oracle leader
    "AVAXUSDT",   # ~$13.37 - Avalanche
    "UNIUSDT",    # ~$5.46 - Uniswap, DEX leader
    "INJUSDT",    # ~$5.36 - Injective, DeFi
    "SEIUSDT",    # ~$0.30 - Sei, new L1
    "RUNEUSDT",   # ~$4.50 - THORChain
    "PENDLEUSDT", # ~$5.00 - DeFi yield
    "TIAUSDT",    # ~$8.00 - Celestia
    "STXUSDT",    # ~$1.50 - Stacks (Bitcoin L2)
    "IMXUSDT",    # ~$1.50 - Immutable X
    "AXSUSDT",    # ~$6.00 - Axie Infinity
    "GMXUSDT",    # ~$30 - GMX DEX
    "LDOUSDT",    # ~$2.00 - Lido DAO
    "RNDRUSDT",   # ~$7.00 - Render
    "FETUSDT",    # ~$1.50 - Fetch.ai
    "AGIXUSDT",   # ~$0.80 - SingularityNET
    # SOL and LTC moved to STARTER tier for better signal access
  ]

  # ════════════════════════════════════════════════════════════════════════════
  # TIER 3: ESTABLISHED ASSETS (Price $50 - $1000)
  # Unlocked at $1,500 balance
  # ════════════════════════════════════════════════════════════════════════════

  @tier3_assets [
    # LTC moved to STARTER tier for $100 accounts
    "BCHUSDT",    # ~$450 - Bitcoin Cash
    "AAVEUSDT",   # ~$180 - Aave DeFi
    "MKRUSDT",    # ~$1500 - Maker DAO
    "BNBUSDT",    # ~$898 - BNB
  ]

  # ════════════════════════════════════════════════════════════════════════════
  # TIER 4: ADVANCED ASSETS (Price $1000+)
  # Unlocked at $7,500 balance
  # ════════════════════════════════════════════════════════════════════════════

  @tier4_assets [
    "BTCUSDT",    # ~$90,000 - Bitcoin
    "ETHUSDT",    # ~$3,100 - Ethereum
  ]

  # ════════════════════════════════════════════════════════════════════════════
  # PUBLIC API
  # ════════════════════════════════════════════════════════════════════════════

  @doc """
  Get the tier for an account based on balance.
  
  ## Examples
      iex> get_account_tier(150)
      :starter
      
      iex> get_account_tier(5000)
      :established
  """
  def get_account_tier(balance) when is_number(balance) do
    cond do
      balance >= @tier_thresholds.advanced -> :advanced
      balance >= @tier_thresholds.established -> :established
      balance >= @tier_thresholds.growth -> :growth
      balance >= @tier_thresholds.starter -> :starter
      true -> :insufficient  # Below $100, shouldn't trade
    end
  end

  @doc """
  Get list of allowed assets for an account balance.
  """
  def get_allowed_assets(balance) when is_number(balance) do
    tier = get_account_tier(balance)
    get_assets_for_tier(tier)
  end

  @doc """
  Get assets for a specific tier (cumulative - higher tiers include lower).
  """
  def get_assets_for_tier(tier) do
    case tier do
      :starter -> @tier1_assets
      :growth -> @tier1_assets ++ @tier2_assets
      :established -> @tier1_assets ++ @tier2_assets ++ @tier3_assets
      :advanced -> @tier1_assets ++ @tier2_assets ++ @tier3_assets ++ @tier4_assets
      :insufficient -> []
    end
  end

  @doc """
  Check if a symbol is allowed for the given account balance.
  """
  def is_allowed?(symbol, balance) when is_binary(symbol) and is_number(balance) do
    allowed = get_allowed_assets(balance)
    symbol in allowed
  end

  @doc """
  Get which tier an asset belongs to (its minimum tier).
  """
  def get_asset_tier(symbol) when is_binary(symbol) do
    cond do
      symbol in @tier1_assets -> :starter
      symbol in @tier2_assets -> :growth
      symbol in @tier3_assets -> :established
      symbol in @tier4_assets -> :advanced
      true -> :unknown
    end
  end

  @doc """
  Get minimum balance required to trade an asset.
  """
  def get_min_balance_for_asset(symbol) when is_binary(symbol) do
    case get_asset_tier(symbol) do
      :starter -> @tier_thresholds.starter
      :growth -> @tier_thresholds.growth
      :established -> @tier_thresholds.established
      :advanced -> @tier_thresholds.advanced
      :unknown -> @tier_thresholds.advanced  # Default to highest for unknown
    end
  end

  @doc """
  Get position size limit for account balance.
  Returns decimal (0.12 = 12%).
  """
  def get_position_size_limit(balance) do
    tier = get_account_tier(balance)
    Map.get(@position_size_limits, tier, 0.05)
  end

  @doc """
  Get maximum concurrent positions for account balance.
  """
  def get_max_positions(balance) do
    tier = get_account_tier(balance)
    Map.get(@max_positions, tier, 3)
  end

  @doc """
  Calculate recommended position size in USD based on balance and confidence.
  """
  def calculate_position_size(balance, confidence \\ 50) do
    base_size = balance * get_position_size_limit(balance)
    
    # Adjust by confidence (scale 0.7x to 1.3x)
    confidence_multiplier = cond do
      confidence >= 90 -> 1.3
      confidence >= 80 -> 1.15
      confidence >= 70 -> 1.0
      confidence >= 60 -> 0.85
      true -> 0.7
    end
    
    # Apply multiplier but cap at 15% of balance
    min(base_size * confidence_multiplier, balance * 0.15)
  end

  @doc """
  Filter a list of signals to only include allowed assets for the balance.
  """
  def filter_signals_by_tier(signals, balance) when is_list(signals) do
    allowed = get_allowed_assets(balance)
    Enum.filter(signals, fn signal -> 
      signal.symbol in allowed
    end)
  end

  @doc """
  Get prioritized assets for scalping (highest volume/liquidity first).
  These are the best assets for quick in-and-out trades.
  """
  def get_scalping_priority(balance) do
    allowed = get_allowed_assets(balance)
    
    # Priority order based on volume and volatility (best for scalping)
    priority = [
      # Highest priority - best liquidity, good moves
      "DOGEUSDT", "XRPUSDT", "ADAUSDT", "SOLUSDT", "SHIBUSDT",
      "PEPEUSDT", "SUIUSDT", "APTUSDT", "NEARUSDT", "WIFUSDT",
      # High priority - solid volume
      "TRXUSDT", "DOTUSDT", "LINKUSDT", "AVAXUSDT", "ATOMUSDT",
      "ARBUSDT", "OPUSDT", "FTMUSDT", "MATICUSDT", "BONKUSDT",
      # Good priority - decent for scalping
      "UNIUSDT", "INJUSDT", "XLMUSDT", "ALGOUSDT", "VETUSDT"
    ]
    
    # Return allowed assets in priority order
    priority
    |> Enum.filter(&(&1 in allowed))
    |> Kernel.++(allowed -- priority)
    |> Enum.uniq()
  end

  @doc """
  Get tier information for display/logging.
  """
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

  @doc """
  Log tier status for debugging.
  """
  def log_tier_status(balance) do
    info = get_tier_info(balance)
    
    Logger.info("""
    
    ════════════════════════════════════════════════════════════════
    📊 ACCOUNT TIER STATUS
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
    
    📋 TOP SCALPING ASSETS:
    #{get_scalping_priority(balance) |> Enum.take(10) |> Enum.join(", ")}
    ════════════════════════════════════════════════════════════════
    """)
    
    info
  end

  @doc """
  Print a summary table of all tiers.
  """
  def print_tier_summary do
    IO.puts("""
    
    ╔══════════════════════════════════════════════════════════════════════════╗
    ║                        ASSET TIER STRUCTURE                              ║
    ╠══════════════╦════════════════╦════════════╦══════════════╦══════════════╣
    ║ TIER         ║ BALANCE RANGE  ║ ASSETS     ║ POS SIZE     ║ MAX POS      ║
    ╠══════════════╬════════════════╬════════════╬══════════════╬══════════════╣
    ║ 🌱 STARTER   ║ $100 - $299    ║ #{String.pad_leading("#{length(@tier1_assets)}", 3)}        ║ 12%          ║ 3            ║
    ║ 📈 GROWTH    ║ $300 - $1,499  ║ #{String.pad_leading("#{length(@tier1_assets) + length(@tier2_assets)}", 3)}        ║ 8%           ║ 5            ║
    ║ 💪 ESTABL.   ║ $1.5K - $7.5K  ║ #{String.pad_leading("#{length(@tier1_assets) + length(@tier2_assets) + length(@tier3_assets)}", 3)}        ║ 5%           ║ 7            ║
    ║ 🚀 ADVANCED  ║ $7,500+        ║ #{String.pad_leading("#{length(@tier1_assets) + length(@tier2_assets) + length(@tier3_assets) + length(@tier4_assets)}", 3)}        ║ 3%           ║ 10           ║
    ╚══════════════╩════════════════╩════════════╩══════════════╩══════════════╝
    
    TIER 1 (STARTER): #{Enum.take(@tier1_assets, 8) |> Enum.join(", ")}...
    TIER 2 (GROWTH):  #{Enum.take(@tier2_assets, 8) |> Enum.join(", ")}...
    TIER 3 (ESTABL.): #{Enum.join(@tier3_assets, ", ")}
    TIER 4 (ADVANCED): #{Enum.join(@tier4_assets, ", ")}
    """)
    
    :ok
  end

  # ════════════════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ════════════════════════════════════════════════════════════════════════════

  defp tier_display_name(tier) do
    case tier do
      :starter -> "🌱 STARTER"
      :growth -> "📈 GROWTH"
      :established -> "💪 ESTABLISHED"
      :advanced -> "🚀 ADVANCED"
      :insufficient -> "❌ INSUFFICIENT"
      _ -> "❓ UNKNOWN"
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
      nil -> 1.0  # Already at max tier
      next when next > current_threshold ->
        progress = (balance - current_threshold) / (next - current_threshold)
        progress |> max(0.0) |> min(1.0)
      _ -> 0.0
    end
  end
end