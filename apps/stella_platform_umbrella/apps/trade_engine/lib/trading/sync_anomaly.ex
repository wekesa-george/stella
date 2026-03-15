defmodule TradeEngine.Trading.SyncAnomaly do
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "sync_anomalies" do
    field :anomaly_key, :string
    field :anomaly_type, :string
    field :bot_id, :binary_id
    field :credential_id, :binary_id
    field :order_id, :binary_id
    field :exchange_order_id, :string
    field :symbol, :string
    field :side, :string
    field :price, :decimal
    field :severity, :string, default: "info"
    field :details, :map, default: %{}
    field :seen_count, :integer, default: 1
    field :first_seen_at, :utc_datetime
    field :last_seen_at, :utc_datetime
    field :resolved_at, :utc_datetime
    field :fix_action, :string
    field :auto_fixed, :boolean, default: false

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(anomaly, attrs) do
    anomaly
    |> cast(attrs, [
      :anomaly_key, :anomaly_type, :bot_id, :credential_id,
      :order_id, :exchange_order_id, :symbol, :side, :price,
      :severity, :details, :seen_count, :first_seen_at, :last_seen_at,
      :resolved_at, :fix_action, :auto_fixed
    ])
    |> validate_required([:anomaly_key, :anomaly_type])
  end
end
