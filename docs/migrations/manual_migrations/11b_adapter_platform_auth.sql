-- 11b: Add platform-level API credentials for adapters
-- Some exchanges (e.g. Alpaca) require API credentials even for public endpoints
-- like fetching market data. This adds dedicated columns for platform-level auth.

ALTER TABLE exchange.adapters
  ADD COLUMN IF NOT EXISTS requires_platform_auth BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS platform_api_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS platform_api_secret VARCHAR(255),
  ADD COLUMN IF NOT EXISTS platform_api_password VARCHAR(255);

-- Backfill: alpaca needs auth for public data
UPDATE exchange.adapters SET requires_platform_auth = true WHERE code = 'alpaca';
