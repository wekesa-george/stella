defmodule StellaAdmin.Risk.CircuitBreakerEvent do
  @moduledoc """
  Schema for risk.circuit_breaker_events table in the stella_platform_new database.
  Represents circuit breaker events triggered by risk management system.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "risk"

  schema "circuit_breaker_events" do
    field :user_id, :binary_id
    field :bot_id, :binary_id
    field :trigger_type, Ecto.Enum, values: [:drawdown_breach, :daily_volume_exceeded, :rapid_loss, :exchange_error_rate, :admin_manual, :system_anomaly]
    field :status, Ecto.Enum, values: [:triggered, :cooling_down, :reset_pending, :resolved]
    field :severity, :string
    field :trigger_value, :decimal
    field :threshold_value, :decimal
    field :limit_config_id, :binary_id
    field :positions_closed, :integer, default: 0
    field :orders_cancelled, :integer, default: 0
    field :total_pnl_impact_usd, :decimal
    field :cooldown_until, :utc_datetime
    field :resolved_at, :utc_datetime
    field :resolved_by, :binary_id
    field :resolution_type, :string
    field :resolution_notes, :string
    field :snapshot, :map, default: %{}
    field :metadata, :map, default: %{}

    field :created_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  @doc false
  def changeset(circuit_breaker_event, attrs) do
    circuit_breaker_event
    |> cast(attrs, [
      :user_id,
      :bot_id,
      :trigger_type,
      :status,
      :severity,
      :trigger_value,
      :threshold_value,
      :limit_config_id,
      :positions_closed,
      :orders_cancelled,
      :total_pnl_impact_usd,
      :cooldown_until,
      :resolved_at,
      :resolved_by,
      :resolution_type,
      :resolution_notes,
      :snapshot,
      :metadata
    ])
    |> validate_required([:user_id, :trigger_type, :status, :severity])
  end
end
