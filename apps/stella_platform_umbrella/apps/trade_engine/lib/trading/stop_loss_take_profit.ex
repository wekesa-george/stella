defmodule TradeEngine.Trading.StopLossTakeProfit do
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "stop_loss_take_profit" do
    # Stop Loss
    field :stop_loss_price, :decimal
    field :stop_loss_type, :string, default: "fixed"
    field :stop_loss_percentage, :decimal
    field :trailing_stop_distance, :decimal

    # Take Profit
    field :take_profit_price, :decimal
    field :take_profit_type, :string, default: "fixed"
    field :take_profit_percentage, :decimal

    # Status
    field :status, :string, default: "active"
    field :triggered_type, :string
    field :triggered_at, :utc_datetime

    # New DB fields
    field :user_strategy_id, :binary_id
    field :trailing_stop_highest, :decimal
    field :source, :string
    field :is_exchange_native, :boolean, default: false
    field :exchange_order_id, :string

    belongs_to :position, TradeEngine.Trading.Position, foreign_key: :position_id

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(sltp, attrs) do
    sltp
    |> cast(attrs, [
      :stop_loss_price, :stop_loss_type, :stop_loss_percentage, :trailing_stop_distance,
      :take_profit_price, :take_profit_type, :take_profit_percentage,
      :status, :triggered_type, :triggered_at, :position_id,
      :user_strategy_id, :trailing_stop_highest, :source,
      :is_exchange_native, :exchange_order_id
    ])
    |> validate_required([:position_id])
    |> validate_inclusion(:stop_loss_type, ["fixed", "trailing", "percentage"])
    |> validate_inclusion(:take_profit_type, ["fixed", "percentage"])
    |> validate_inclusion(:status, ["active", "triggered", "cancelled"])
    |> unique_constraint(:position_id)
  end
end
