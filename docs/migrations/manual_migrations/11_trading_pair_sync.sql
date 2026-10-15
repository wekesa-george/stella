-- =============================================================================
-- 11_trading_pair_sync.sql
-- Hybrid Trading Pair Sync System
-- Adds adapter-based pair sync fields to exchange_trading_pairs + adapters
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add new columns to exchange.exchange_trading_pairs
--    (symbol is already VARCHAR(50), base_currency/quote_currency already VARCHAR(20))
-- ---------------------------------------------------------------------------
ALTER TABLE exchange.exchange_trading_pairs
  ADD COLUMN IF NOT EXISTS adapter_id UUID REFERENCES exchange.adapters(id),
  ADD COLUMN IF NOT EXISTS delisted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exchange_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS market_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS min_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS min_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS price_precision INT,
  ADD COLUMN IF NOT EXISTS amount_precision INT;

-- Make exchange_id nullable (new rows will use adapter_id instead)
ALTER TABLE exchange.exchange_trading_pairs
  ALTER COLUMN exchange_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill adapter_id from platform_exchanges → adapters via code match
-- ---------------------------------------------------------------------------
UPDATE exchange.exchange_trading_pairs tp
SET adapter_id = a.id
FROM exchange.platform_exchanges pe
JOIN exchange.adapters a ON LOWER(a.code) = LOWER(pe.exchange_key)
WHERE tp.exchange_id = pe.id
  AND tp.adapter_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Add UNIQUE constraint and partial index
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_adapter_symbol'
  ) THEN
    ALTER TABLE exchange.exchange_trading_pairs
      ADD CONSTRAINT uq_adapter_symbol UNIQUE (adapter_id, symbol);
  END IF;
END $$;

-- Partial index for active non-delisted pairs per adapter
CREATE INDEX IF NOT EXISTS idx_trading_pairs_adapter_active
  ON exchange.exchange_trading_pairs (adapter_id, is_active)
  WHERE delisted = false;

-- ---------------------------------------------------------------------------
-- 4. Add sync columns to exchange.adapters
-- ---------------------------------------------------------------------------
ALTER TABLE exchange.adapters
  ADD COLUMN IF NOT EXISTS allow_all_pairs BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS last_sync_pair_count INT;

COMMIT;
