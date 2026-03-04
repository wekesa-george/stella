defmodule TradeEngine.Repo.Migrations.CreateAssetTierConfig do
  use Ecto.Migration

  def up do
    execute """
    CREATE TABLE IF NOT EXISTS exchange.asset_tier_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      adapter_id UUID NOT NULL REFERENCES exchange.adapters(id),

      -- Tier balance thresholds (USD)
      tier1_min_balance NUMERIC(18,2) NOT NULL DEFAULT 100,
      tier2_min_balance NUMERIC(18,2) NOT NULL DEFAULT 300,
      tier3_min_balance NUMERIC(18,2) NOT NULL DEFAULT 1500,
      tier4_min_balance NUMERIC(18,2) NOT NULL DEFAULT 7500,

      -- Position size limits (fraction of balance)
      tier1_max_position_pct NUMERIC(5,4) NOT NULL DEFAULT 0.12,
      tier2_max_position_pct NUMERIC(5,4) NOT NULL DEFAULT 0.08,
      tier3_max_position_pct NUMERIC(5,4) NOT NULL DEFAULT 0.05,
      tier4_max_position_pct NUMERIC(5,4) NOT NULL DEFAULT 0.03,

      -- Max concurrent positions per tier
      tier1_max_positions INT NOT NULL DEFAULT 3,
      tier2_max_positions INT NOT NULL DEFAULT 5,
      tier3_max_positions INT NOT NULL DEFAULT 7,
      tier4_max_positions INT NOT NULL DEFAULT 10,

      -- Asset lists per tier (symbols like "BTCUSDT", "ETHUSDT")
      tier1_assets TEXT[] NOT NULL DEFAULT '{}',
      tier2_assets TEXT[] NOT NULL DEFAULT '{}',
      tier3_assets TEXT[] NOT NULL DEFAULT '{}',
      tier4_assets TEXT[] NOT NULL DEFAULT '{}',

      -- Global position size cap (absolute max regardless of tier)
      max_position_pct NUMERIC(5,4) NOT NULL DEFAULT 0.15,

      -- Confidence multipliers
      confidence_multipliers JSONB NOT NULL DEFAULT '{"90": 1.3, "80": 1.15, "70": 1.0, "60": 0.85, "default": 0.7}',

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by_user_id UUID,

      UNIQUE(adapter_id)
    )
    """

    # Seed Binance adapter with current hardcoded values
    execute """
    INSERT INTO exchange.asset_tier_config (
      adapter_id,
      tier1_min_balance, tier2_min_balance, tier3_min_balance, tier4_min_balance,
      tier1_max_position_pct, tier2_max_position_pct, tier3_max_position_pct, tier4_max_position_pct,
      tier1_max_positions, tier2_max_positions, tier3_max_positions, tier4_max_positions,
      tier1_assets, tier2_assets, tier3_assets, tier4_assets,
      max_position_pct,
      confidence_multipliers
    ) VALUES (
      'f9e570e5-60d6-4ec5-80f0-4ce96c345665',
      100, 300, 1500, 7500,
      0.12, 0.08, 0.05, 0.03,
      3, 5, 7, 10,
      ARRAY['DOGEUSDT','SHIBUSDT','PEPEUSDT','BONKUSDT','FLOKIUSDT','TRXUSDT','VETUSDT','HOTUSDT','ONEUSDT','ZILUSDT','GALAUSDT','CHZUSDT','ADAUSDT','XLMUSDT','ALGOUSDT','HBARUSDT','IOTAUSDT','FTMUSDT','MATICUSDT','SANDUSDT','MANAUSDT','ARBUSDT','XRPUSDT','DOTUSDT','SUIUSDT','APTUSDT','NEARUSDT','OPUSDT','ATOMUSDT','WIFUSDT','SOLUSDT','LTCUSDT'],
      ARRAY['LINKUSDT','AVAXUSDT','UNIUSDT','INJUSDT','SEIUSDT','RUNEUSDT','PENDLEUSDT','TIAUSDT','STXUSDT','IMXUSDT','AXSUSDT','GMXUSDT','LDOUSDT','RNDRUSDT','FETUSDT','AGIXUSDT'],
      ARRAY['BCHUSDT','AAVEUSDT','MKRUSDT','BNBUSDT'],
      ARRAY['BTCUSDT','ETHUSDT'],
      0.15,
      '{"90": 1.3, "80": 1.15, "70": 1.0, "60": 0.85, "default": 0.7}'
    ) ON CONFLICT (adapter_id) DO NOTHING
    """
  end

  def down do
    execute "DROP TABLE IF EXISTS exchange.asset_tier_config"
  end
end
