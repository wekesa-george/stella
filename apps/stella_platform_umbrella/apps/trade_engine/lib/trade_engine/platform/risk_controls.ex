defmodule TradeEngine.Platform.RiskControls do
  @moduledoc """
  Singleton table for platform-wide risk control settings.
  Read by RiskMonitor to enforce limits.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  @schema_prefix "platform"
  schema "risk_controls" do
    field :max_drawdown_pct, :decimal, default: Decimal.new("10.0")
    field :circuit_breaker_pct, :decimal, default: Decimal.new("25.0")
    field :max_leverage, :decimal, default: Decimal.new("5.0")
    field :max_daily_loss_usd, :decimal, default: Decimal.new("500.0")
    field :max_position_size_usd, :decimal, default: Decimal.new("10000.0")
    field :is_active, :boolean, default: true

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(controls, attrs) do
    controls
    |> cast(attrs, [
      :max_drawdown_pct, :circuit_breaker_pct, :max_leverage,
      :max_daily_loss_usd, :max_position_size_usd, :is_active
    ])
  end
end
