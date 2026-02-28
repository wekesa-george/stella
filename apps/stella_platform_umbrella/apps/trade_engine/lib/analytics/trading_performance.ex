defmodule TradeEngine.Analytics.TradingPerformance do
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "trading_performance" do
    field :performance_date, :date
    field :period_type, :string
    
    field :total_profit_loss, :decimal, default: 0
    field :realized_profit_loss, :decimal, default: 0
    field :unrealized_profit_loss, :decimal, default: 0
    
    field :trades_count, :integer, default: 0
    field :winning_trades, :integer, default: 0
    field :losing_trades, :integer, default: 0
    field :win_rate, :decimal, default: 0
    
    field :daily_roi, :decimal, default: 0
    field :cumulative_roi, :decimal, default: 0
    
    field :max_drawdown, :decimal, default: 0
    field :sharpe_ratio, :decimal
    field :sortino_ratio, :decimal
    field :profit_factor, :decimal
    
    field :best_trade, :decimal
    field :worst_trade, :decimal
    field :avg_trade, :decimal
    field :avg_winner, :decimal
    field :avg_loser, :decimal
    
    field :total_fees, :decimal, default: 0
    field :starting_balance, :decimal
    field :ending_balance, :decimal
    
    belongs_to :user, SysAdmin.Accounts.User, type: :binary_id
    belongs_to :strategy, SysAdmin.Strategies.Strategy, type: :binary_id
    
    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(perf, attrs) do
    perf
    |> cast(attrs, [
      :performance_date, :period_type,
      :total_profit_loss, :realized_profit_loss, :unrealized_profit_loss,
      :trades_count, :winning_trades, :losing_trades, :win_rate,
      :daily_roi, :cumulative_roi,
      :max_drawdown, :sharpe_ratio, :sortino_ratio, :profit_factor,
      :best_trade, :worst_trade, :avg_trade, :avg_winner, :avg_loser,
      :total_fees, :starting_balance, :ending_balance,
      :user_id, :strategy_id
    ])
    |> validate_required([:performance_date, :period_type, :user_id])
    |> validate_inclusion(:period_type, ["daily", "weekly", "monthly", "yearly"])
  end
end
