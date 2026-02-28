defmodule TradeEngine.Platform.BotEngineDefaults do
  @moduledoc """
  Singleton table for tunable bot engine parameters.
  Read by BotRegistry, HeartbeatTracker, StaleOrderCanceller.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  @schema_prefix "platform"
  schema "bot_engine_defaults" do
    # Timing & Retry
    field :heartbeat_interval_sec, :integer, default: 5
    field :order_timeout_sec, :integer, default: 30
    field :max_order_age_sec, :integer, default: 300
    field :retry_attempts, :integer, default: 3
    field :retry_backoff_multiplier, :decimal, default: Decimal.new("2.0")
    field :reconcile_frequency_min, :integer, default: 15

    # Order Defaults
    field :default_slippage_pct, :decimal, default: Decimal.new("0.10")
    field :position_precision, :integer, default: 4

    # Feature Toggles
    field :enable_heartbeat_alert, :boolean, default: true
    field :enable_stale_order_cancel, :boolean, default: true
    field :enable_auto_reconcile, :boolean, default: true
    field :enable_partial_fill_continue, :boolean, default: true

    timestamps(type: :utc_datetime, inserted_at: false)
  end

  @cast_fields [
    :heartbeat_interval_sec, :order_timeout_sec, :max_order_age_sec,
    :retry_attempts, :retry_backoff_multiplier, :reconcile_frequency_min,
    :default_slippage_pct, :position_precision,
    :enable_heartbeat_alert, :enable_stale_order_cancel,
    :enable_auto_reconcile, :enable_partial_fill_continue
  ]

  def changeset(defaults, attrs) do
    defaults
    |> cast(attrs, @cast_fields)
    |> validate_number(:heartbeat_interval_sec, greater_than_or_equal_to: 1, less_than_or_equal_to: 60)
    |> validate_number(:order_timeout_sec, greater_than_or_equal_to: 5, less_than_or_equal_to: 300)
    |> validate_number(:max_order_age_sec, greater_than_or_equal_to: 60, less_than_or_equal_to: 3600)
    |> validate_number(:retry_attempts, greater_than_or_equal_to: 0, less_than_or_equal_to: 10)
    |> validate_number(:reconcile_frequency_min, greater_than_or_equal_to: 1, less_than_or_equal_to: 60)
    |> validate_number(:position_precision, greater_than_or_equal_to: 0, less_than_or_equal_to: 8)
  end
end
