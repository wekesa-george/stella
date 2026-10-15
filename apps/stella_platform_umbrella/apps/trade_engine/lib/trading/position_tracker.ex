defmodule TradeEngine.Trading.PositionTracker do
  @moduledoc """
  Tracks open positions, updates P&L, and aggregates account metrics.

  NOTE: TradingAccount table was removed (replaced by trading.equity_snapshots).
  Account balance functions now return stubs. Position tracking still works.
  """
  require Logger
  import Ecto.Query
  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position

  @doc """
  Update P&L for all open positions
  """
  def update_all_positions_pnl(current_prices_map) do
    open_positions = Repo.all(
      from(p in Position, where: p.status == "open")
    )

    Enum.each(open_positions, fn position ->
      case Map.get(current_prices_map, position.symbol) do
        nil -> :ok
        current_price -> update_position_pnl(position, current_price)
      end
    end)
  end

  @doc """
  Update single position P&L
  """
  def update_position_pnl(position, current_price) do
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    unrealized_profit = Decimal.mult(
      Decimal.sub(current_price, position.entry_price),
      position.quantity
    )

    roi_pct = Decimal.div(
      Decimal.sub(current_price, position.entry_price),
      position.entry_price
    )

    Repo.update_all(
      from(p in Position, where: p.id == ^position.id),
      set: [
        current_price: current_price,
        unrealized_profit_loss: unrealized_profit,
        roi_percentage: roi_pct,
        updated_at: now
      ]
    )
  end

  @doc """
  Get account aggregated statistics (positions only, no TradingAccount)
  """
  def get_account_stats(user_id) do
    open_positions = Repo.all(
      from(p in Position,
        where: p.user_id == ^user_id and p.status == "open"
      )
    )

    closed_positions = Repo.all(
      from(p in Position,
        where: p.user_id == ^user_id and p.status == "closed"
      )
    )

    %{
      open_count: length(open_positions),
      closed_count: length(closed_positions),
      total_positions: length(open_positions) + length(closed_positions),
      open_positions: open_positions,
      closed_positions: closed_positions,
      account: nil,
      unrealized_pl: calculate_unrealized_pl(open_positions),
      realized_pl: calculate_realized_pl(closed_positions),
      win_rate: calculate_win_rate(closed_positions),
      avg_hold_time: calculate_avg_hold_time(closed_positions)
    }
  end

  @doc """
  Get all accounts aggregated statistics (stub — TradingAccount removed)
  """
  def get_all_accounts_stats do
    {[], %{total_accounts: 0, total_open_positions: 0, total_closed_positions: 0,
           total_unrealized_pl: Decimal.new("0"), total_realized_pl: Decimal.new("0"),
           total_account_balance: Decimal.new("0"), average_win_rate: 0.0, average_hold_time: 0}}
  end

  @doc "Stub — TradingAccount table removed"
  def update_account_balance(_user_id), do: {:error, "TradingAccount removed"}

  @doc "Stub — TradingAccount table removed"
  def recalculate_account_balance(_user_id), do: {:error, "TradingAccount removed"}

  @doc "Stub — TradingAccount table removed"
  def recalculate_all_accounts, do: []

  # ========== PRIVATE HELPERS ==========

  defp calculate_unrealized_pl(positions) do
    Enum.reduce(positions, Decimal.new("0"), fn pos, acc ->
      profit = pos.unrealized_profit_loss || Decimal.new("0")
      Decimal.add(acc, profit)
    end)
  end

  defp calculate_realized_pl(positions) do
    Enum.reduce(positions, Decimal.new("0"), fn pos, acc ->
      profit = pos.profit_loss || Decimal.new("0")
      Decimal.add(acc, profit)
    end)
  end

  defp calculate_win_rate(closed_positions) when length(closed_positions) == 0 do
    0.0
  end

  defp calculate_win_rate(closed_positions) do
    winners = Enum.count(closed_positions, fn pos ->
      Decimal.compare(pos.profit_loss, Decimal.new("0")) in [:gt, :eq]
    end)

    (winners / length(closed_positions)) * 100
  end

  defp calculate_avg_hold_time(closed_positions) when length(closed_positions) == 0 do
    0
  end

  defp calculate_avg_hold_time(closed_positions) do
    total_mins = Enum.reduce(closed_positions, 0, fn pos, acc ->
      if pos.exit_time && pos.entry_time do
        hold_time = NaiveDateTime.diff(pos.exit_time, pos.entry_time, :minute)
        acc + hold_time
      else
        acc
      end
    end)

    div(total_mins, length(closed_positions))
  end
end
