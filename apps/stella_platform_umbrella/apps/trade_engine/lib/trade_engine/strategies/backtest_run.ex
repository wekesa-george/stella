defmodule TradeEngine.Strategies.BacktestRun do
  @moduledoc """
  Ecto schema for strategy.backtest_runs table.
  Tracks backtesting runs dispatched to the VectorBT Python worker.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "strategy"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "backtest_runs" do
    field :strategy_id, :binary_id
    field :user_id, :binary_id
    field :status, :string, default: "queued"
    field :trading_pair, :string
    field :exchange_code, :string
    field :timeframe, :string
    field :start_date, :utc_datetime
    field :end_date, :utc_datetime
    field :initial_capital_usd, :decimal

    # Strategy config frozen at queue time
    field :config_snapshot, :map

    # Result metrics (written on completion)
    field :final_capital_usd, :decimal
    field :total_return_pct, :decimal
    field :max_drawdown_pct, :decimal
    field :sharpe_ratio, :decimal
    field :sortino_ratio, :decimal
    field :calmar_ratio, :decimal
    field :win_rate, :decimal
    field :profit_factor, :decimal
    field :total_trades, :integer
    field :winning_trades, :integer
    field :losing_trades, :integer
    field :avg_trade_return_pct, :decimal
    field :avg_win_pct, :decimal
    field :avg_loss_pct, :decimal
    field :largest_win_usd, :decimal
    field :largest_loss_usd, :decimal
    field :avg_hold_duration_sec, :integer

    # Detailed data (JSONB)
    field :equity_curve, {:array, :map}
    field :trade_log, {:array, :map}

    # Progress tracking
    field :progress_pct, :decimal, default: Decimal.new(0)
    field :started_at, :utc_datetime
    field :completed_at, :utc_datetime
    field :error_message, :string
    field :elixir_node, :string
    field :candles_processed, :integer, default: 0
    field :execution_time_ms, :integer
    field :metadata, :map, default: %{}

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  @create_fields [
    :strategy_id, :user_id, :trading_pair, :exchange_code, :timeframe,
    :start_date, :end_date, :initial_capital_usd, :config_snapshot, :metadata
  ]

  @complete_fields [
    :status, :final_capital_usd, :total_return_pct, :max_drawdown_pct,
    :sharpe_ratio, :sortino_ratio, :calmar_ratio, :win_rate, :profit_factor,
    :total_trades, :winning_trades, :losing_trades, :avg_trade_return_pct,
    :avg_win_pct, :avg_loss_pct, :largest_win_usd, :largest_loss_usd,
    :avg_hold_duration_sec, :equity_curve, :trade_log, :completed_at,
    :execution_time_ms, :error_message
  ]

  @doc "Changeset for queuing a new backtest run"
  def create_changeset(run \\ %__MODULE__{}, attrs) do
    run
    |> cast(attrs, @create_fields)
    |> validate_required([:strategy_id, :user_id, :trading_pair, :exchange_code,
                          :timeframe, :start_date, :end_date, :initial_capital_usd,
                          :config_snapshot])
    |> validate_inclusion(:timeframe, ~w(1m 5m 15m 30m 1h 4h 1d))
    |> foreign_key_constraint(:strategy_id, name: "backtest_runs_strategy_id_fkey")
    |> foreign_key_constraint(:user_id, name: "backtest_runs_user_id_fkey")
    |> put_change(:status, "queued")
    |> put_change(:elixir_node, to_string(node()))
  end

  @doc "Changeset for writing results after completion or failure"
  def complete_changeset(run, attrs) do
    run
    |> cast(attrs, @complete_fields)
    |> validate_inclusion(:status, ~w(completed failed cancelled))
  end

  @doc "Changeset for updating progress during a run"
  def progress_changeset(run, attrs) do
    run
    |> cast(attrs, [:status, :progress_pct, :candles_processed, :started_at])
    |> validate_inclusion(:status, ~w(queued running completed failed cancelled))
  end
end
