defmodule TradeEngine.Trading.TransactionLog do
  @moduledoc """
  Logs all trading transactions for audit and reporting.
  """
  require Logger
  import Ecto.Query
  alias TradeEngine.Repo

  @doc """
  Log a buy order transaction
  """
  def log_entry(user_id, symbol, quantity, entry_price, order_id, status \\ "FILLED") do
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
    
    transaction = %{
      id: Ecto.UUID.generate(),
      user_id: user_id,
      symbol: symbol,
      transaction_type: "BUY",
      quantity: Decimal.new("#{quantity}"),
      price: entry_price,
      total_value: Decimal.mult(Decimal.new("#{quantity}"), entry_price),
      order_id: order_id,
      status: status,
      fees: Decimal.new("0"),
      created_at: now,
      updated_at: now
    }

    case Repo.insert(transaction_schema(), transaction) do
      {:ok, tx} ->
        Logger.info("📝 Transaction logged - BUY #{symbol} #{quantity} @ $#{Decimal.to_string(entry_price)}")
        {:ok, tx}
      
      {:error, e} ->
        Logger.error("Failed to log transaction: #{inspect(e)}")
        {:error, e}
    end
  end

  @doc """
  Log a sell order transaction
  """
  def log_exit(position, exit_price, order_id, exit_reason, status \\ "FILLED") do
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
    
    total_value = Decimal.mult(position.quantity, exit_price)
    profit = Decimal.sub(total_value, Decimal.mult(position.quantity, position.entry_price))
    
    transaction = %{
      id: Ecto.UUID.generate(),
      user_id: position.user_id,
      symbol: position.symbol,
      transaction_type: "SELL",
      quantity: position.quantity,
      price: exit_price,
      total_value: total_value,
      order_id: order_id,
      status: status,
      fees: Decimal.new("0"),
      profit: profit,
      exit_reason: Atom.to_string(exit_reason),
      created_at: now,
      updated_at: now
    }

    case Repo.insert(transaction_schema(), transaction) do
      {:ok, tx} ->
        Logger.info("📝 Transaction logged - SELL #{position.symbol} #{Decimal.to_string(position.quantity)} @ $#{Decimal.to_string(exit_price)} | Profit: $#{Decimal.to_string(profit)}")
        {:ok, tx}
      
      {:error, e} ->
        Logger.error("Failed to log exit transaction: #{inspect(e)}")
        {:error, e}
    end
  end

  @doc """
  Get transaction history for user
  """
  def get_user_transactions(user_id, limit \\ 100) do
    Repo.all(
      from(tx in transaction_schema(),
        where: tx.user_id == ^user_id,
        order_by: [desc: tx.created_at],
        limit: ^limit
      )
    )
  end

  @doc """
  Get transaction summary
  """
  def get_transaction_summary(user_id) do
    transactions = get_user_transactions(user_id, 1000)
    
    buy_count = Enum.count(transactions, &(&1.transaction_type == "BUY"))
    sell_count = Enum.count(transactions, &(&1.transaction_type == "SELL"))
    
    total_bought = Enum.filter(transactions, &(&1.transaction_type == "BUY"))
      |> Enum.reduce(Decimal.new("0"), &Decimal.add(&2, &1.total_value))
    
    total_sold = Enum.filter(transactions, &(&1.transaction_type == "SELL"))
      |> Enum.reduce(Decimal.new("0"), &Decimal.add(&2, &1.total_value))
    
    total_profit = Enum.filter(transactions, &(&1.transaction_type == "SELL"))
      |> Enum.reduce(Decimal.new("0"), &Decimal.add(&2, &1.profit || Decimal.new("0")))
    
    %{
      total_transactions: length(transactions),
      buy_count: buy_count,
      sell_count: sell_count,
      total_bought: total_bought,
      total_sold: total_sold,
      total_profit: total_profit,
      win_rate: if(sell_count > 0, do: (Enum.count(Enum.filter(transactions, &(&1.transaction_type == "SELL" and Decimal.positive?(&1.profit || Decimal.new("0"))))) / sell_count * 100), else: 0)
    }
  end

  @doc """
  Export transactions to CSV format
  """
  def export_transactions_csv(user_id) do
    transactions = get_user_transactions(user_id, 10000)
    
    header = "Date,Type,Symbol,Quantity,Price,Total Value,Profit,Order ID,Status,Exit Reason\n"
    
    rows = Enum.map(transactions, fn tx ->
      "#{NaiveDateTime.to_string(tx.created_at)},#{tx.transaction_type},#{tx.symbol},#{Decimal.to_string(tx.quantity)},#{Decimal.to_string(tx.price)},#{Decimal.to_string(tx.total_value)},#{Decimal.to_string(tx.profit || Decimal.new("0"))},#{tx.order_id},#{tx.status},#{tx.exit_reason || ""}\n"
    end)
    |> Enum.join("")
    
    header <> rows
  end

  defp transaction_schema do
    quote do
      @schema_prefix "trading"
      schema "fills" do
        field :user_id, Ecto.UUID
        field :symbol, :string
        field :transaction_type, :string
        field :quantity, :decimal
        field :price, :decimal
        field :total_value, :decimal
        field :order_id, :integer
        field :status, :string
        field :fees, :decimal
        field :profit, :decimal
        field :exit_reason, :string
        
        timestamps()
      end
    end
  end
end