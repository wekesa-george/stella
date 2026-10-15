defmodule TradeEngine.Trading.Transaction do
  @moduledoc """
  Transaction schema — maps to trading.fills in the real database.
  Records trade fill events from exchanges.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "fills" do
    field :transaction_type, :string, source: :fill_type
    field :amount, :decimal
    field :fee_amount, :decimal, default: Decimal.new(0), source: :fee

    field :status, :string, default: "completed"
    field :order_id, :string, source: :exchange_order_id
    field :description, :string

    # Trade identification
    field :symbol, :string, source: :trading_pair
    field :action, :string
    field :direction, :string, source: :side

    # Execution details
    field :quantity, :decimal
    field :price, :decimal
    field :entry_price, :decimal
    field :executed_at, :utc_datetime

    # P&L tracking
    field :pnl, :decimal
    field :pnl_percent, :decimal

    # Exchange details
    field :client_order_id, :string
    field :exchange, :string, default: "binance", source: :exchange_code
    field :exchange_response, :string
    field :error_message, :string

    # Physics engine context
    field :signal_confidence, :integer
    field :physics_peak_price, :decimal
    field :physics_peak_time, :decimal

    # Fee details
    field :fee_asset, :string
    field :fee_usd, :decimal

    # Relationships
    belongs_to :user, SysAdmin.Accounts.User, foreign_key: :user_id
    belongs_to :position, TradeEngine.Trading.Position, foreign_key: :position_id
    belongs_to :order, TradeEngine.Trading.Order, foreign_key: :order_id, define_field: false

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(transaction, attrs) do
    transaction
    |> cast(attrs, [
      :transaction_type, :amount, :fee_amount,
      :status, :order_id, :description,
      :symbol, :action, :direction,
      :quantity, :price, :entry_price, :executed_at,
      :pnl, :pnl_percent,
      :client_order_id, :exchange, :exchange_response, :error_message,
      :signal_confidence, :physics_peak_price, :physics_peak_time,
      :fee_asset, :fee_usd,
      :user_id, :position_id
    ])
    |> validate_required([:transaction_type])
  end

  def entry_changeset(transaction, attrs) do
    changeset = transaction
    |> changeset(attrs)
    |> put_change(:action, "entry")

    if get_field(changeset, :status) in ["failed", "rejected", "cancelled"] do
      changeset
    else
      changeset
      |> validate_required([:symbol, :direction])
      |> validate_number(:quantity, greater_than: 0)
      |> validate_number(:price, greater_than: 0)
    end
  end

  def exit_changeset(transaction, attrs) do
    changeset = transaction
    |> changeset(attrs)
    |> put_change(:action, "exit")

    if get_field(changeset, :status) in ["failed", "rejected", "cancelled"] do
      changeset
    else
      changeset
      |> validate_required([:symbol, :direction, :entry_price])
      |> validate_number(:quantity, greater_than: 0)
      |> validate_number(:price, greater_than: 0)
      |> calculate_pnl()
    end
  end

  defp calculate_pnl(changeset) do
    with entry_price when not is_nil(entry_price) <- get_field(changeset, :entry_price),
         exit_price when not is_nil(exit_price) <- get_field(changeset, :price),
         quantity when not is_nil(quantity) <- get_field(changeset, :quantity),
         direction when not is_nil(direction) <- get_field(changeset, :direction) do

      entry_f = Decimal.to_float(entry_price)
      exit_f = Decimal.to_float(exit_price)
      qty_f = Decimal.to_float(quantity)

      pnl = case direction do
        "long" -> (exit_f - entry_f) * qty_f
        "short" -> (entry_f - exit_f) * qty_f
        _ -> 0.0
      end

      pnl_pct = if entry_f > 0, do: (pnl / (entry_f * qty_f)) * 100, else: 0.0

      changeset
      |> put_change(:pnl, Decimal.from_float(pnl))
      |> put_change(:pnl_percent, Decimal.from_float(pnl_pct))
    else
      _ -> changeset
    end
  end
end
