# File: apps/trade_engine/lib/trade_engine/trading.ex

defmodule TradeEngine.Trading do
  @moduledoc """
  Context for trading operations: positions, orders, transactions, and risk management
  """

  import Ecto.Query
  alias TradeEngine.Repo
  alias TradeEngine.Trading.{Position, Order, Transaction, StopLossTakeProfit}
  # TradingAccount removed — table replaced by trading.equity_snapshots

  # ============================================================================
  # POSITIONS
  # ============================================================================

  def create_position(attrs) do
    %Position{}
    |> Position.changeset(attrs)
    |> Repo.insert()
  end

  def get_position!(id) do
    Repo.get!(Position, id)
    |> Repo.preload([:stop_loss_take_profit])
  end

  def list_user_positions(user_id) do
    Position
    |> where(user_id: ^user_id)
    |> order_by(desc: :created_at)
    |> Repo.all()
  end

  def list_open_positions(user_id) do
    Position
    |> where(user_id: ^user_id, status: "open")
    |> Repo.all()
  end

  def list_closed_positions(user_id) do
    Position
    |> where(user_id: ^user_id, status: "closed")
    |> Repo.all()
  end

  def update_position(position, attrs) do
    position
    |> Position.changeset(attrs)
    |> Repo.update()
  end

  def close_position(position, exit_price, exit_time) do
    profit_loss = Position.calculate_pnl(position, exit_price)
    
    update_position(position, %{
      status: "closed",
      exit_price: exit_price,
      exit_time: exit_time,
      profit_loss: profit_loss,
      current_price: exit_price
    })
  end

  def liquidate_position(position) do
    update_position(position, %{status: "liquidated"})
  end

  def get_position_pnl(position_id) do
    position = get_position!(position_id)
    Position.calculate_pnl(position, Decimal.to_float(position.current_price))
  end

  # ============================================================================
  # ORDERS
  # ============================================================================

  def create_order(attrs) do
    %Order{}
    |> Order.changeset(attrs)
    |> Repo.insert()
  end

  def get_order!(id) do
    Repo.get!(Order, id)
  end

  def list_user_orders(user_id) do
    Order
    |> where(user_id: ^user_id)
    |> order_by(desc: :created_at)
    |> Repo.all()
  end

  def list_pending_orders(user_id) do
    Order
    |> where(user_id: ^user_id, status: "pending")
    |> Repo.all()
  end

  def list_open_orders(user_id) do
    Order
    |> where(user_id: ^user_id, status: "open")
    |> Repo.all()
  end

  def update_order(order, attrs) do
    order
    |> Order.changeset(attrs)
    |> Repo.update()
  end

  def fill_order(order, execution_price, filled_quantity) do
    update_order(order, %{
      status: "filled",
      execution_price: execution_price,
      filled_quantity: filled_quantity,
      execution_time: NaiveDateTime.utc_now()
    })
  end

  def cancel_order(order) do
    update_order(order, %{status: "cancelled"})
  end

  # ============================================================================
  # TRANSACTIONS
  # ============================================================================

  def create_transaction(attrs) do
    %Transaction{}
    |> Transaction.changeset(attrs)
    |> Repo.insert()
  end

  def list_user_transactions(user_id) do
    Transaction
    |> where(user_id: ^user_id)
    |> order_by(desc: :created_at)
    |> Repo.all()
  end

  # TradingAccount removed — list by user_id instead
  def list_account_transactions(_trading_account_id), do: []

  def get_transaction!(id) do
    Repo.get!(Transaction, id)
  end

  def record_deposit(user_id, _trading_account_id, amount, description \\ "Deposit") do
    create_transaction(%{
      user_id: user_id,
      transaction_type: "deposit",
      amount: amount,
      status: "completed",
      description: description
    })
  end

  def record_withdrawal(user_id, _trading_account_id, amount, description \\ "Withdrawal") do
    create_transaction(%{
      user_id: user_id,
      transaction_type: "withdrawal",
      amount: Decimal.negate(amount),
      status: "completed",
      description: description
    })
  end

  def record_fee(user_id, _trading_account_id, fee_amount, description \\ "Trading Fee") do
    create_transaction(%{
      user_id: user_id,
      transaction_type: "fee",
      amount: Decimal.negate(fee_amount),
      fee_amount: fee_amount,
      status: "completed",
      description: description
    })
  end

  # ============================================================================
  # STOP LOSS & TAKE PROFIT
  # ============================================================================

  def create_sl_tp(position_id, attrs) do
    attrs = Map.put(attrs, :position_id, position_id)
    
    %StopLossTakeProfit{}
    |> StopLossTakeProfit.changeset(attrs)
    |> Repo.insert()
  end

  def get_sl_tp!(position_id) do
    Repo.get_by!(StopLossTakeProfit, position_id: position_id)
  end

  def update_sl_tp(sltp, attrs) do
    sltp
    |> StopLossTakeProfit.changeset(attrs)
    |> Repo.update()
  end

  def trigger_stop_loss(sltp) do
    update_sl_tp(sltp, %{
      status: "triggered",
      triggered_type: "stop_loss",
      triggered_at: NaiveDateTime.utc_now()
    })
  end

  def trigger_take_profit(sltp) do
    update_sl_tp(sltp, %{
      status: "triggered",
      triggered_type: "take_profit",
      triggered_at: NaiveDateTime.utc_now()
    })
  end

  # ============================================================================
  # ACCOUNT CALCULATIONS
  # ============================================================================

  def calculate_total_pnl(user_id) do
    user_id
    |> list_user_positions()
    |> Enum.reduce(Decimal.new(0), fn position, acc ->
      pnl = Decimal.cast(position.profit_loss) || Decimal.new(0)
      unrealized = Decimal.cast(position.unrealized_profit_loss) || Decimal.new(0)
      Decimal.add(acc, Decimal.add(pnl, unrealized))
    end)
  end

  def calculate_realized_pnl(user_id) do
    user_id
    |> list_closed_positions()
    |> Enum.reduce(Decimal.new(0), fn position, acc ->
      pnl = Decimal.cast(position.profit_loss) || Decimal.new(0)
      Decimal.add(acc, pnl)
    end)
  end

  def calculate_unrealized_pnl(user_id) do
    user_id
    |> list_open_positions()
    |> Enum.reduce(Decimal.new(0), fn position, acc ->
      unrealized = Decimal.cast(position.unrealized_profit_loss) || Decimal.new(0)
      Decimal.add(acc, unrealized)
    end)
  end

  def calculate_locked_balance(user_id) do
    user_id
    |> list_open_positions()
    |> Enum.reduce(Decimal.new(0), fn position, acc ->
      quantity = Decimal.cast(position.quantity) || Decimal.new(0)
      price = Decimal.cast(position.entry_price) || Decimal.new(0)
      locked = Decimal.mult(quantity, price)
      Decimal.add(acc, locked)
    end)
  end

  def get_account_statistics(user_id) do
    positions = list_user_positions(user_id)
    total_trades = Enum.count(positions)
    winning_trades = Enum.count(positions, &(Decimal.positive?(Decimal.cast(&1.profit_loss) || Decimal.new(0))))
    losing_trades = total_trades - winning_trades
    win_rate = if total_trades > 0, do: (winning_trades / total_trades) * 100, else: 0
    
    %{
      total_trades: total_trades,
      winning_trades: winning_trades,
      losing_trades: losing_trades,
      win_rate: win_rate,
      total_pnl: calculate_total_pnl(user_id),
      realized_pnl: calculate_realized_pnl(user_id),
      unrealized_pnl: calculate_unrealized_pnl(user_id),
      locked_balance: calculate_locked_balance(user_id)
    }
  end
end