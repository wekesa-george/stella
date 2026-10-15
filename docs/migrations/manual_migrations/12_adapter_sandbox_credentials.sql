-- Migration 12: Add sandbox API credential columns to exchange.adapters
-- Existing platform_api_key/secret/password become the "live" credentials.
-- New sandbox_api_key/secret/password for sandbox/testnet environments.

ALTER TABLE exchange.adapters
  ADD COLUMN IF NOT EXISTS sandbox_api_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sandbox_api_secret VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sandbox_api_password VARCHAR(255);
