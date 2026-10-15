defmodule StellaAdmin.Repo.Migrations.CreateCandleSnapshots do
  use Ecto.Migration

  def change do
    create table(:candle_snapshots) do
      add :pair, :string, null: false
      add :interval, :string, null: false
      add :open_time, :utc_datetime, null: false
      add :open, :decimal, precision: 20, scale: 8, null: false
      add :high, :decimal, precision: 20, scale: 8, null: false
      add :low, :decimal, precision: 20, scale: 8, null: false
      add :close, :decimal, precision: 20, scale: 8, null: false
      add :volume, :decimal, precision: 20, scale: 8, null: false
      add :close_time, :utc_datetime, null: false

      timestamps(type: :utc_datetime)
    end

    # Index for time-based queries
    create index(:candle_snapshots, [:open_time])

    # Unique constraint to prevent duplicate candles (also serves as index for pair+interval+time queries)
    create unique_index(:candle_snapshots, [:pair, :interval, :open_time])
  end
end
