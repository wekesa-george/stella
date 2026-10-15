defmodule TradeEngine.Repo.Migrations.AddFuturesUrlsToAdapters do
  use Ecto.Migration

  def up do
    execute """
    ALTER TABLE exchange.adapters
      ADD COLUMN IF NOT EXISTS futures_base_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS futures_sandbox_base_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS futures_ws_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS futures_sandbox_ws_url VARCHAR(500);
    """

    execute """
    UPDATE exchange.adapters SET
      futures_base_url = 'https://fapi.binance.com/fapi',
      futures_sandbox_base_url = 'https://testnet.binancefuture.com/fapi',
      futures_ws_url = 'wss://fstream.binance.com/ws',
      futures_sandbox_ws_url = 'wss://stream.binancefuture.com/ws'
    WHERE code = 'binance';
    """
  end

  def down do
    execute """
    ALTER TABLE exchange.adapters
      DROP COLUMN IF EXISTS futures_base_url,
      DROP COLUMN IF EXISTS futures_sandbox_base_url,
      DROP COLUMN IF EXISTS futures_ws_url,
      DROP COLUMN IF EXISTS futures_sandbox_ws_url;
    """
  end
end
