defmodule TradeEngine.Trading.Order do
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "orders" do
    # Core fields — source: maps Elixir name → DB column
    field :symbol, :string, source: :trading_pair
    field :side, :string
    field :order_type, :string, source: :type
    field :quantity, :decimal
    field :price, :decimal
    field :stop_price, :decimal
    field :time_in_force, :string, default: "GTC"

    # Execution
    field :status, :string, default: "pending"
    field :filled_quantity, :decimal, default: Decimal.new(0)
    field :execution_price, :decimal, source: :avg_fill_price
    field :execution_time, :utc_datetime, source: :completed_at

    # Exchange
    field :exchange_order_id, :string
    field :exchange_name, :string, source: :exchange_code

    # New DB fields
    field :base_asset, :string
    field :quote_asset, :string
    field :client_order_id, :string
    field :credential_id, :binary_id
    field :limit_price, :decimal
    field :remaining_quantity, :decimal
    field :total_fees, :decimal
    field :fee_asset, :string
    field :fee_usd, :decimal
    field :leverage, :decimal
    field :is_margin, :boolean, default: false
    field :signal_id, :binary_id
    field :submitted_at, :utc_datetime
    field :first_fill_at, :utc_datetime
    field :cancelled_at, :utc_datetime
    field :cancel_reason, :string
    field :rejection_reason, :string
    field :exchange_response, :map
    field :metadata, :map
    field :retry_count, :integer, default: 0
    field :correlation_id, :binary_id
    field :parent_order_id, :binary_id

    # Relationships
    belongs_to :user, SysAdmin.Accounts.User, foreign_key: :user_id
    belongs_to :strategy, SysAdmin.Strategies.Strategy, foreign_key: :strategy_id
    belongs_to :credential, SysAdmin.Exchanges.ExchangeConfig, foreign_key: :credential_id, define_field: false
    belongs_to :position, TradeEngine.Trading.Position, foreign_key: :position_id
    belongs_to :bot, TradeEngine.Bots.Bot, foreign_key: :bot_id

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(order, attrs) do
    order
    |> cast(attrs, [
      :symbol, :side, :order_type, :quantity, :price, :stop_price, :time_in_force,
      :status, :filled_quantity, :execution_price, :execution_time,
      :exchange_order_id, :exchange_name,
      :user_id, :strategy_id, :credential_id, :position_id, :bot_id,
      :base_asset, :quote_asset, :client_order_id, :limit_price,
      :remaining_quantity, :total_fees, :fee_asset, :fee_usd,
      :leverage, :is_margin, :signal_id, :submitted_at, :first_fill_at,
      :cancelled_at, :cancel_reason, :rejection_reason,
      :exchange_response, :metadata,
      :retry_count, :correlation_id, :parent_order_id
    ])
    |> validate_required([:symbol, :side, :order_type, :quantity])
    |> validate_inclusion(:side, ["buy", "sell"])
    |> validate_inclusion(:order_type, ["market", "limit", "stop", "stop_limit"])
    |> validate_inclusion(:status, ["pending", "submitted", "open", "filled", "partially_filled", "cancelled", "rejected", "failed"])
  end
end
