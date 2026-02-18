defmodule StellaAdmin.Trading.Position do
  @moduledoc """
  Schema for trading.positions table in the stella_platform_new database.
  Represents trading positions opened and managed by bots.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "trading"

  schema "positions" do
    field :user_id, :binary_id
    field :bot_id, :binary_id
    field :credential_id, :binary_id
    field :exchange_code, :string
    field :trading_pair, :string
    field :base_asset, :string
    field :quote_asset, :string
    field :side, Ecto.Enum, values: [:long, :short]
    field :status, Ecto.Enum, values: [:open, :closing, :closed, :liquidated]
    field :entry_price, :decimal
    field :exit_price, :decimal
    field :current_price, :decimal
    field :quantity, :decimal
    field :remaining_quantity, :decimal
    field :leverage, :decimal
    field :unrealized_pnl_usd, :decimal
    field :realized_pnl_usd, :decimal
    field :roi_percentage, :decimal
    field :total_fees_usd, :decimal
    field :stop_loss_price, :decimal
    field :take_profit_price, :decimal
    field :liquidation_price, :decimal
    field :margin_used_usd, :decimal
    field :strategy_id, :binary_id
    field :signal_id, :binary_id
    field :entry_order_id, :binary_id
    field :exit_order_id, :binary_id
    field :opened_at, :utc_datetime
    field :closed_at, :utc_datetime
    field :hold_duration_sec, :integer
    field :exit_reason, :string
    field :momentum, :float
    field :gravity, :float
    field :peak_price, :decimal
    field :peak_time, :integer
    field :trajectory_angle, :float
    field :kinetic_energy, :float
    field :energy_state, :string
    field :max_hold_time, :integer
    field :metadata, :map, default: %{}

    field :created_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  @doc false
  def changeset(position, attrs) do
    position
    |> cast(attrs, [
      :user_id,
      :bot_id,
      :credential_id,
      :exchange_code,
      :trading_pair,
      :base_asset,
      :quote_asset,
      :side,
      :status,
      :entry_price,
      :exit_price,
      :current_price,
      :quantity,
      :remaining_quantity,
      :leverage,
      :unrealized_pnl_usd,
      :realized_pnl_usd,
      :roi_percentage,
      :total_fees_usd,
      :stop_loss_price,
      :take_profit_price,
      :liquidation_price,
      :margin_used_usd,
      :strategy_id,
      :signal_id,
      :entry_order_id,
      :exit_order_id,
      :opened_at,
      :closed_at,
      :hold_duration_sec,
      :exit_reason,
      :momentum,
      :gravity,
      :peak_price,
      :peak_time,
      :trajectory_angle,
      :kinetic_energy,
      :energy_state,
      :max_hold_time,
      :metadata
    ])
    |> validate_required([
      :user_id,
      :credential_id,
      :exchange_code,
      :trading_pair,
      :base_asset,
      :quote_asset,
      :side,
      :status,
      :entry_price,
      :quantity,
      :remaining_quantity,
      :leverage
    ])
  end
end
