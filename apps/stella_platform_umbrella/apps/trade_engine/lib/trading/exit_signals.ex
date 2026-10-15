defmodule TradeEngine.Trading.ExitSignals do
  @moduledoc """
  Exit signal logic with take profit, stop loss, and time-based peak detection.
  """
  require Logger
  import Ecto.Query
  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position

  # Exit thresholds
  @take_profit_pct 0.05      # +5%
  @stop_loss_pct -0.02       # -2%
  @peak_time_window_mins 30  # Expected peak within 30 minutes

  @doc """
  Check all open positions for exit signals
  Returns list of {position, exit_reason, exit_price}
  """
  def check_all_positions(current_prices_map) do
    open_positions = Repo.all(
      from(p in Position,
        where: p.status == "open",
        preload: [:user]
      )
    )

    Enum.map(open_positions, fn position ->
      current_price = Map.get(current_prices_map, position.symbol)
      check_position_exit(position, current_price)
    end)
    |> Enum.filter(&elem(&1, 0))
  end

  @doc """
  Check single position for exit signal
  Returns {should_exit, position, exit_reason, exit_price, profit}
  """
  def check_position_exit(position, current_price) when is_nil(current_price) do
    {false, position, nil, nil, nil}
  end

  def check_position_exit(position, current_price) do
    entry_price = Decimal.to_float(position.entry_price)
    current_float = Decimal.to_float(current_price)
    profit_pct = (current_float - entry_price) / entry_price
    time_elapsed = NaiveDateTime.diff(NaiveDateTime.utc_now(), position.entry_time, :minute)

    cond do
      # Take Profit: +5%
      profit_pct >= @take_profit_pct ->
        {true, position, :take_profit, current_price, profit_pct}

      # Stop Loss: -2%
      profit_pct <= @stop_loss_pct ->
        {true, position, :stop_loss, current_price, profit_pct}

      # Time-based Exit: If peak was expected soon but price is declining
      time_elapsed > @peak_time_window_mins and profit_pct > 0 and profit_pct < @take_profit_pct ->
        Logger.info("⏰ Time-based exit: #{position.symbol} passed peak window without hitting TP")
        {true, position, :time_based_exit, current_price, profit_pct}

      # Time-based Exit: If no movement after peak window
      time_elapsed > @peak_time_window_mins and profit_pct <= 0 ->
        Logger.info("⏰ Time-based exit: #{position.symbol} no upside after #{time_elapsed}m")
        {true, position, :time_based_exit, current_price, profit_pct}

      true ->
        {false, position, nil, nil, nil}
    end
  end

  @doc """
  Execute exit for a position
  """
  def execute_exit(position, exit_reason, exit_price) do
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    profit = Decimal.mult(
      Decimal.sub(exit_price, position.entry_price),
      position.quantity
    )

    profit_pct = Decimal.div(
      Decimal.sub(exit_price, position.entry_price),
      position.entry_price
    )

    changes = %{
      status: "closed",
      exit_price: exit_price,
      profit_loss: profit,
      roi_percentage: profit_pct,
      exit_time: now,
      exit_reason: Atom.to_string(exit_reason),
      updated_at: now
    }

    case Repo.update(position, changes) do
      {:ok, closed_position} ->
        log_position_exit(closed_position, exit_reason, profit, profit_pct)
        {:ok, closed_position}

      {:error, e} ->
        Logger.error("Failed to close position: #{inspect(e)}")
        {:error, e}
    end
  end

  defp log_position_exit(position, exit_reason, profit, profit_pct) do
    reason_str = case exit_reason do
      :take_profit -> "✅ TAKE PROFIT (+5%)"
      :stop_loss -> "🔴 STOP LOSS (-2%)"
      :time_based_exit -> "⏰ TIME-BASED EXIT"
      _ -> "EXIT"
    end

    Logger.info("""
    #{reason_str}: #{position.symbol}
      Entry:  $#{Decimal.to_string(position.entry_price)} @ #{NaiveDateTime.to_string(position.entry_time)}
      Exit:   $#{Decimal.to_string(position.exit_price)} @ #{NaiveDateTime.to_string(position.exit_time)}
      Qty:    #{Decimal.to_string(position.quantity)}
      Profit: $#{Decimal.to_string(profit)} (#{Float.round(Decimal.to_float(profit_pct) * 100, 2)}%)
      Hold:   #{NaiveDateTime.diff(position.exit_time, position.entry_time, :minute)}m
    """)
  end

  @doc """
  Get peak timing estimate from MTF signal
  """
  def estimate_peak_time(mtf_signal) do
    # Extract trigger-level details for peak prediction
    trigger_detail = Enum.find(mtf_signal.details, fn d -> d.timeframe == "1m" end)
      || Enum.find(mtf_signal.details, fn d -> d.timeframe == "5m" end)
      || List.first(mtf_signal.details)

    if trigger_detail do
      velocity = trigger_detail.velocity
      acceleration = trigger_detail.acceleration

      if acceleration != 0 and velocity > 0 do
        # Time to peak: t = -v/a (physics formula)
        time_to_peak = abs(velocity / acceleration)
        min(time_to_peak, @peak_time_window_mins)
      else
        @peak_time_window_mins
      end
    else
      @peak_time_window_mins
    end
  end
end