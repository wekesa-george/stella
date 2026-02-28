defmodule TradeEngine.Alerts.TradingAlert do
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "monitoring_alerts" do
    field :alert_type, :string
    field :symbol, :string
    field :alert_name, :string
    field :alert_message, :string

    field :condition_type, :string
    field :condition_value, :decimal

    field :status, :string, default: "active"
    field :triggered_at, :utc_datetime
    field :triggered_count, :integer, default: 0

    field :notify_email, :boolean, default: true
    field :notify_sms, :boolean, default: false
    field :notify_push, :boolean, default: true
    field :repeat_alert, :boolean, default: false
    field :repeat_interval_minutes, :integer

    # New DB fields
    field :condition_window_minutes, :integer
    field :monitored_entity, :string
    field :snooze_until, :utc_datetime
    field :last_evaluated_at, :utc_datetime

    belongs_to :user, SysAdmin.Accounts.User, type: :binary_id
    belongs_to :bot, TradeEngine.Bots.Bot, type: :binary_id
    belongs_to :user_strategy, SysAdmin.Strategies.UserStrategy, type: :binary_id

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(alert, attrs) do
    alert
    |> cast(attrs, [
      :alert_type, :symbol, :alert_name, :alert_message,
      :condition_type, :condition_value,
      :status, :triggered_at, :triggered_count,
      :notify_email, :notify_sms, :notify_push,
      :repeat_alert, :repeat_interval_minutes,
      :condition_window_minutes, :monitored_entity,
      :snooze_until, :last_evaluated_at,
      :user_id, :bot_id, :user_strategy_id
    ])
    |> validate_required([:alert_type, :alert_message, :user_id])
    |> validate_inclusion(:alert_type, ["price_alert", "margin_alert", "take_profit", "stop_loss", "position_alert"])
    |> validate_inclusion(:status, ["active", "triggered", "cancelled"])
  end
end
