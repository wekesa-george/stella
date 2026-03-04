defmodule TradeEngine.Repo.Migrations.AddMarketTypeToBots do
  use Ecto.Migration

  def change do
    alter table(:bots, prefix: "trading") do
      add :market_type, :string, default: "spot", null: false
    end
  end
end
