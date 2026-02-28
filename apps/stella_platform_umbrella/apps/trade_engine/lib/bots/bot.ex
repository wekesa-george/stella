defmodule TradeEngine.Bots.Bot do
  @moduledoc """
  Bot schema — persistent bot identity and configuration.
  Maps to trading.bots in the real database.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "bots" do
    field :name, :string
    field :status, :string, default: "initializing"

    # Trading configuration
    field :trading_pairs, {:array, :string}, default: []

    # Capital — not in DB, tracked via trading.equity_snapshots
    field :initial_equity_usd, :decimal, virtual: true

    # Multi-exchange credential link
    field :credential_id, :binary_id

    # Service account for admin-managed bots (alternative to user_id)
    field :service_account_id, :binary_id

    # Runtime stats
    field :total_trades, :integer, default: 0
    field :total_pnl, :decimal, default: Decimal.new(0), source: :total_pnl_usd
    field :win_rate, :decimal

    # Error tracking
    field :last_error, :string, source: :error_message
    field :error_count, :integer, default: 0

    # Lifecycle
    field :started_at, :utc_datetime
    field :stopped_at, :utc_datetime
    field :last_heartbeat, :utc_datetime, source: :last_heartbeat_at
    field :last_trade_at, :utc_datetime

    # New DB fields
    field :config, :map
    field :risk_overrides, :map
    field :metadata, :map
    field :elixir_node, :string
    field :elixir_pid, :string
    field :init_step, :string

    # Persisted capital & trade counters — survive restarts
    field :allocated_capital, :decimal, default: Decimal.new(0)
    field :active_capital, :decimal, default: Decimal.new(0)
    field :winning_trades, :integer, default: 0
    field :losing_trades, :integer, default: 0

    # Virtual fields — not in DB, used by in-memory logic only
    field :strategy_type, :string, virtual: true
    field :exchange, :string, virtual: true, default: "binance"
    field :max_positions, :integer, virtual: true, default: 3
    field :target_profit_usd, :decimal, virtual: true, default: Decimal.new("0.50")
    field :max_hold_minutes, :integer, virtual: true, default: 5
    field :min_confidence, :integer, virtual: true, default: 55
    field :total_pnl_pct, :decimal, virtual: true, default: Decimal.new(0)

    # Relationships
    belongs_to :user, SysAdmin.Accounts.User, foreign_key: :user_id
    belongs_to :strategy, SysAdmin.Strategies.Strategy, foreign_key: :strategy_id
    belongs_to :credential, SysAdmin.Exchanges.ExchangeConfig, foreign_key: :credential_id, define_field: false
    belongs_to :service_account, TradeEngine.Platform.ServiceAccount, foreign_key: :service_account_id, define_field: false

    has_many :positions, TradeEngine.Trading.Position, foreign_key: :bot_id
    has_many :orders, TradeEngine.Trading.Order, foreign_key: :bot_id

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  @valid_statuses ~w(initializing running paused stopping stopped error circuit_broken maintenance)

  @cast_fields [
    :name, :status,
    :trading_pairs, :credential_id,
    :total_trades, :total_pnl, :win_rate,
    :allocated_capital, :active_capital, :winning_trades, :losing_trades,
    :last_error, :error_count,
    :started_at, :stopped_at, :last_heartbeat, :last_trade_at,
    :user_id, :strategy_id, :service_account_id,
    :config, :risk_overrides, :metadata, :elixir_node, :elixir_pid, :init_step
  ]

  def changeset(bot, attrs) do
    bot
    |> cast(attrs, @cast_fields)
    |> validate_required([:name])
    |> validate_has_owner()
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_length(:name, min: 1, max: 100)
    |> unique_constraint([:user_id, :name])
  end

  @doc "Changeset for creating a new bot with required FK relationships (user-owned)"
  def create_changeset(bot, attrs) do
    bot
    |> cast(attrs, @cast_fields)
    |> validate_required([:name, :user_id, :credential_id, :trading_pairs])
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_length(:name, min: 1, max: 100)
    |> validate_length(:trading_pairs, min: 1, message: "must have at least one trading pair")
    |> unique_constraint([:user_id, :name])
    |> foreign_key_constraint(:credential_id)
    |> foreign_key_constraint(:strategy_id)
    |> put_default_status()
  end

  @doc "Changeset for creating a system bot owned by a service account (no user required)"
  def create_system_changeset(bot, attrs) do
    bot
    |> cast(attrs, @cast_fields)
    |> validate_required([:name, :service_account_id, :trading_pairs])
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_length(:name, min: 1, max: 100)
    |> validate_length(:trading_pairs, min: 1, message: "must have at least one trading pair")
    |> foreign_key_constraint(:service_account_id)
    |> foreign_key_constraint(:credential_id)
    |> foreign_key_constraint(:strategy_id)
    |> put_default_status()
  end

  defp validate_has_owner(changeset) do
    user_id = get_field(changeset, :user_id)
    service_account_id = get_field(changeset, :service_account_id)

    if is_nil(user_id) and is_nil(service_account_id) do
      add_error(changeset, :user_id, "either user_id or service_account_id must be present")
    else
      changeset
    end
  end

  defp put_default_status(changeset) do
    if get_field(changeset, :status) do
      changeset
    else
      put_change(changeset, :status, "initializing")
    end
  end

  def start_changeset(bot) do
    bot
    |> change(%{
      status: "running",
      started_at: DateTime.utc_now(),
      stopped_at: nil,
      last_heartbeat: DateTime.utc_now()
    })
  end

  def stop_changeset(bot) do
    bot
    |> change(%{
      status: "stopped",
      stopped_at: DateTime.utc_now()
    })
  end

  def error_changeset(bot, error_message) do
    bot
    |> change(%{
      status: "error",
      last_error: error_message,
      error_count: (bot.error_count || 0) + 1
    })
  end

  def heartbeat_changeset(bot) do
    bot
    |> change(%{last_heartbeat: DateTime.utc_now()})
  end

  @doc "Changeset for FSM-driven status transitions with appropriate timestamp updates."
  def transition_changeset(bot, to_status, extra_attrs \\ %{}) do
    now = DateTime.utc_now()

    base = %{status: to_status}

    base = case to_status do
      "running" -> Map.merge(base, %{started_at: now, stopped_at: nil, last_heartbeat: now, init_step: nil})
      "stopped" -> Map.put(base, :stopped_at, now)
      "error" -> base
      "initializing" -> Map.put(base, :init_step, nil)
      _ -> base
    end

    bot
    |> change(Map.merge(base, extra_attrs))
  end
end
