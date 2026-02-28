defmodule TradeEngine.Trading.Position do
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "positions" do
    # Core fields — Elixir name → DB column via source:
    field :symbol, :string, source: :trading_pair
    field :position_type, :string, source: :side
    field :quantity, :decimal
    field :entry_price, :decimal
    field :exit_price, :decimal
    field :current_price, :decimal

    # P&L
    field :profit_loss, :decimal, default: Decimal.new(0), source: :realized_pnl_usd
    field :unrealized_profit_loss, :decimal, default: Decimal.new(0), source: :unrealized_pnl_usd
    field :roi_percentage, :decimal, default: Decimal.new(0)

    # Status & timing
    field :status, :string, default: "open"
    field :entry_time, :utc_datetime, source: :opened_at
    field :exit_time, :utc_datetime, source: :closed_at

    # Physics fields (kept as-is, these exist in DB)
    field :momentum, :float
    field :gravity, :float
    field :peak_price, :decimal
    field :peak_time, :integer
    field :trajectory_angle, :float
    field :kinetic_energy, :float
    field :energy_state, :string
    field :max_hold_time, :integer
    field :exit_reason, :string
    # Price extremes — persisted for trailing stop survival across restarts
    field :highest_price, :decimal
    field :lowest_price, :decimal

    # New DB fields
    field :credential_id, :binary_id
    field :exchange_code, :string
    field :base_asset, :string
    field :quote_asset, :string
    field :remaining_quantity, :decimal
    field :leverage, :integer
    field :total_fees_usd, :decimal
    field :stop_loss_price, :decimal
    field :take_profit_price, :decimal
    field :liquidation_price, :decimal
    field :margin_used_usd, :decimal
    field :signal_id, :binary_id
    field :entry_order_id, :binary_id
    field :exit_order_id, :binary_id
    field :hold_duration_sec, :integer
    field :metadata, :map

    # Relationships
    belongs_to :user, SysAdmin.Accounts.User, foreign_key: :user_id
    belongs_to :strategy, SysAdmin.Strategies.Strategy, foreign_key: :strategy_id
    belongs_to :credential, SysAdmin.Exchanges.ExchangeConfig, foreign_key: :credential_id, define_field: false
    belongs_to :bot, TradeEngine.Bots.Bot, foreign_key: :bot_id

    has_one :stop_loss_take_profit, TradeEngine.Trading.StopLossTakeProfit, foreign_key: :position_id
    has_many :orders, TradeEngine.Trading.Order, foreign_key: :position_id

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(position, attrs) do
    position
    |> cast(attrs, [
      :symbol, :position_type, :quantity, :entry_price, :exit_price, :current_price,
      :profit_loss, :unrealized_profit_loss, :roi_percentage,
      :status, :entry_time, :exit_time,
      :user_id, :strategy_id, :credential_id,
      :bot_id, :exchange_code, :base_asset, :quote_asset,
      :remaining_quantity, :leverage, :total_fees_usd,
      :stop_loss_price, :take_profit_price, :liquidation_price,
      :margin_used_usd, :signal_id, :entry_order_id, :exit_order_id,
      :hold_duration_sec, :metadata,
      :momentum, :gravity, :peak_price, :peak_time, :trajectory_angle,
      :kinetic_energy, :energy_state, :max_hold_time, :exit_reason,
      :highest_price, :lowest_price
    ])
    |> validate_required([:symbol, :position_type, :quantity, :entry_price, :user_id])
    |> validate_inclusion(:position_type, ["long", "short"])
    |> validate_inclusion(:status, ["open", "closed", "liquidated"])
  end

  def calculate_pnl(position, current_price) do
    current_price_dec = Decimal.new(current_price)
    entry_price_dec = Decimal.cast(position.entry_price) || Decimal.new(0)
    quantity_dec = Decimal.cast(position.quantity) || Decimal.new(0)

    case position.position_type do
      "long" ->
        Decimal.mult(Decimal.sub(current_price_dec, entry_price_dec), quantity_dec)
      "short" ->
        Decimal.mult(Decimal.sub(entry_price_dec, current_price_dec), quantity_dec)
      _ ->
        Decimal.new(0)
    end
  end
end
