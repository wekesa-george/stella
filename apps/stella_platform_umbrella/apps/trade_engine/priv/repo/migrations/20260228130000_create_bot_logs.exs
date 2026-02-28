defmodule TradeEngine.Repo.Migrations.CreateBotLogs do
  use Ecto.Migration

  def change do
    create table(:bot_logs, prefix: "trading", primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :bot_id, references(:bots, type: :binary_id, on_delete: :delete_all, prefix: "trading"), null: false
      add :level, :string, null: false
      add :category, :string, null: false
      add :message, :text, null: false
      add :metadata, :map, default: %{}
      add :created_at, :utc_datetime, default: fragment("now()")
    end

    create index(:bot_logs, [:bot_id, :created_at], prefix: "trading", using: "btree")
    create index(:bot_logs, [:level], prefix: "trading", where: "level IN ('warning', 'error')")
  end
end
