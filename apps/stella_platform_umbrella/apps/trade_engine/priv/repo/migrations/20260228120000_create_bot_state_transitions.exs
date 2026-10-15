defmodule TradeEngine.Repo.Migrations.CreateBotStateTransitions do
  use Ecto.Migration

  def change do
    create table(:bot_state_transitions, prefix: "trading", primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :bot_id, references(:bots, type: :binary_id, on_delete: :delete_all, prefix: "trading"), null: false
      add :from_status, :string, null: false
      add :to_status, :string, null: false
      add :trigger, :string
      add :reason, :text
      add :metadata, :map, default: %{}
      add :triggered_by, :string
      add :transitioned_at, :utc_datetime, default: fragment("now()")
    end

    create index(:bot_state_transitions, [:bot_id], prefix: "trading")
    create index(:bot_state_transitions, [:bot_id, :transitioned_at], prefix: "trading", using: "btree")

    alter table(:bots, prefix: "trading") do
      add :init_step, :string, size: 50
    end
  end
end
