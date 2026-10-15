defmodule StellaAdmin.Trading.Bot do
  @moduledoc """
  Schema for trading.bots table in the stella_platform_new database.
  Represents trading bots created by users on the platform.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "trading"

  schema "bots" do
    field :user_id, :binary_id
    field :strategy_id, :binary_id
    field :credential_id, :binary_id
    field :name, :string
    field :status, Ecto.Enum, values: [:initializing, :running, :paused, :stopping, :stopped, :error, :circuit_broken, :maintenance]
    field :trading_pairs, {:array, :string}
    field :config, :map, default: %{}
    field :risk_overrides, :map, default: %{}
    field :started_at, :utc_datetime
    field :stopped_at, :utc_datetime
    field :last_heartbeat_at, :utc_datetime
    field :last_trade_at, :utc_datetime
    field :error_message, :string
    field :error_count, :integer, default: 0
    field :total_trades, :integer, default: 0
    field :total_pnl_usd, :decimal
    field :win_rate, :decimal
    field :elixir_node, :string
    field :elixir_pid, :string
    field :metadata, :map, default: %{}

    field :created_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  @doc false
  def changeset(bot, attrs) do
    bot
    |> cast(attrs, [
      :user_id,
      :strategy_id,
      :credential_id,
      :name,
      :status,
      :trading_pairs,
      :config,
      :risk_overrides,
      :started_at,
      :stopped_at,
      :last_heartbeat_at,
      :last_trade_at,
      :error_message,
      :error_count,
      :total_trades,
      :total_pnl_usd,
      :win_rate,
      :elixir_node,
      :elixir_pid,
      :metadata
    ])
    |> validate_required([:user_id, :credential_id, :status, :trading_pairs, :config])
  end
end
