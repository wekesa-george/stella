defmodule TradeEngine.Trading.PositionCloseManager do
  @moduledoc """
  Detects exit conditions (TP, SL, trailing stop, max hold time) for open
  positions and closes them by updating DB status + broadcasting events.

  Runs every 5 seconds. Loads positions with their SLTP config, checks
  each against current price, and executes closes when conditions are met.
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.{Position, StopLossTakeProfit}

  @pubsub TradeEngine.PubSub
  @tick_interval_ms 5_000
  @max_positions 500
  @reload_interval_ms 15_000

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    Logger.info("🔒 PositionCloseManager started — checking exits every #{@tick_interval_ms}ms")

    Process.send_after(self(), :load_positions, 3_000)
    Process.send_after(self(), :check_exits, @tick_interval_ms)

    {:ok, %{
      positions: [],
      sltp_map: %{},
      last_reload: nil,
      closed_count: 0,
      last_close: nil
    }}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply, %{
      tracked_positions: length(state.positions),
      closed_count: state.closed_count,
      last_close: state.last_close,
      last_reload: state.last_reload
    }, state}
  end

  @impl true
  def handle_info(:load_positions, state) do
    {positions, sltp_map} = load_positions_with_sltp()
    Process.send_after(self(), :load_positions, @reload_interval_ms)

    {:noreply, %{state |
      positions: positions,
      sltp_map: sltp_map,
      last_reload: DateTime.utc_now()
    }}
  end

  def handle_info(:check_exits, state) do
    Process.send_after(self(), :check_exits, @tick_interval_ms)

    {closed_ids, state} = check_all_exits(state)

    # Remove closed positions from local cache
    if closed_ids != [] do
      remaining = Enum.reject(state.positions, fn p -> p.id in closed_ids end)
      {:noreply, %{state | positions: remaining}}
    else
      {:noreply, state}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ============================================================================
  # CORE LOGIC
  # ============================================================================

  defp load_positions_with_sltp do
    positions =
      from(p in Position,
        where: p.status == "open",
        order_by: [desc: p.updated_at],
        limit: ^@max_positions,
        select: %{
          id: p.id,
          symbol: p.symbol,
          position_type: p.position_type,
          entry_price: p.entry_price,
          quantity: p.quantity,
          bot_id: p.bot_id,
          entry_time: p.entry_time,
          highest_price: p.highest_price,
          lowest_price: p.lowest_price,
          max_hold_time: p.max_hold_time
        }
      )
      |> Repo.all(timeout: 10_000)

    position_ids = Enum.map(positions, & &1.id)

    sltp_map =
      if position_ids != [] do
        from(s in StopLossTakeProfit,
          where: s.position_id in ^position_ids and s.status == "active",
          select: %{
            position_id: s.position_id,
            stop_loss_price: s.stop_loss_price,
            stop_loss_type: s.stop_loss_type,
            stop_loss_percentage: s.stop_loss_percentage,
            trailing_stop_distance: s.trailing_stop_distance,
            take_profit_price: s.take_profit_price,
            take_profit_type: s.take_profit_type,
            take_profit_percentage: s.take_profit_percentage
          }
        )
        |> Repo.all(timeout: 10_000)
        |> Map.new(fn s -> {s.position_id, s} end)
      else
        %{}
      end

    {positions, sltp_map}
  rescue
    e ->
      Logger.warning("PositionCloseManager: failed to load: #{Exception.message(e)}")
      {[], %{}}
  end

  defp check_all_exits(state) do
    state.positions
    |> Enum.reduce({[], state}, fn pos, {closed, st} ->
      case get_cached_price(pos.symbol) do
        nil ->
          {closed, st}

        price ->
          sltp = Map.get(st.sltp_map, pos.id)

          case check_exit_condition(pos, sltp, price) do
            nil ->
              # Update highest/lowest tracking
              update_price_extremes(pos, price)
              {closed, st}

            reason ->
              close_position(pos, price, reason)
              {[pos.id | closed], %{st |
                closed_count: st.closed_count + 1,
                last_close: DateTime.utc_now()
              }}
          end
      end
    end)
  end

  defp check_exit_condition(pos, sltp, price) do
    cond do
      # Take profit (fixed price)
      sltp && sltp.take_profit_price && hit_take_profit?(pos, sltp, price) ->
        "take_profit"

      # Stop loss (fixed price)
      sltp && sltp.stop_loss_price && hit_stop_loss?(pos, sltp, price) ->
        "stop_loss"

      # Take profit (percentage)
      sltp && sltp.take_profit_percentage && hit_tp_percentage?(pos, sltp, price) ->
        "take_profit_pct"

      # Stop loss (percentage)
      sltp && sltp.stop_loss_percentage && hit_sl_percentage?(pos, sltp, price) ->
        "stop_loss_pct"

      # Trailing stop
      sltp && sltp.trailing_stop_distance && hit_trailing_stop?(pos, sltp, price) ->
        "trailing_stop"

      # Max hold time exceeded
      pos.max_hold_time && exceeded_hold_time?(pos) ->
        "max_hold_time"

      true ->
        nil
    end
  end

  defp hit_take_profit?(pos, sltp, price) do
    tp = to_float(sltp.take_profit_price)

    case pos.position_type do
      "long" -> price >= tp
      "short" -> price <= tp
      _ -> false
    end
  end

  defp hit_stop_loss?(pos, sltp, price) do
    sl = to_float(sltp.stop_loss_price)

    case pos.position_type do
      "long" -> price <= sl
      "short" -> price >= sl
      _ -> false
    end
  end

  defp hit_tp_percentage?(pos, sltp, price) do
    entry = to_float(pos.entry_price)
    tp_pct = to_float(sltp.take_profit_percentage) / 100

    case pos.position_type do
      "long" -> price >= entry * (1 + tp_pct)
      "short" -> price <= entry * (1 - tp_pct)
      _ -> false
    end
  end

  defp hit_sl_percentage?(pos, sltp, price) do
    entry = to_float(pos.entry_price)
    sl_pct = to_float(sltp.stop_loss_percentage) / 100

    case pos.position_type do
      "long" -> price <= entry * (1 - sl_pct)
      "short" -> price >= entry * (1 + sl_pct)
      _ -> false
    end
  end

  defp hit_trailing_stop?(pos, sltp, price) do
    distance = to_float(sltp.trailing_stop_distance)

    case pos.position_type do
      "long" ->
        peak = to_float(pos.highest_price) || to_float(pos.entry_price)
        price <= peak - distance

      "short" ->
        trough = to_float(pos.lowest_price) || to_float(pos.entry_price)
        price >= trough + distance

      _ ->
        false
    end
  end

  defp exceeded_hold_time?(pos) do
    case pos.entry_time do
      nil -> false
      entry_time ->
        max_seconds = (pos.max_hold_time || 0) * 60
        diff = NaiveDateTime.diff(NaiveDateTime.utc_now(), entry_time, :second)
        diff >= max_seconds
    end
  end

  defp close_position(pos, exit_price, reason) do
    entry = to_float(pos.entry_price) || 0.0
    qty = to_float(pos.quantity) || 0.0

    pnl =
      case pos.position_type do
        "long" -> (exit_price - entry) * qty
        "short" -> (entry - exit_price) * qty
        _ -> 0.0
      end

    now = NaiveDateTime.utc_now()

    # Update position in DB
    from(p in Position, where: p.id == ^pos.id)
    |> Repo.update_all(set: [
      status: "closed",
      exit_price: Decimal.from_float(exit_price),
      current_price: Decimal.from_float(exit_price),
      profit_loss: Decimal.from_float(pnl),
      exit_time: now,
      exit_reason: reason,
      updated_at: now
    ])

    # Mark SLTP as triggered
    from(s in StopLossTakeProfit,
      where: s.position_id == ^pos.id and s.status == "active"
    )
    |> Repo.update_all(set: [
      status: "triggered",
      triggered_type: reason,
      triggered_at: now
    ])

    Logger.info("🔒 Closed position #{pos.id} (#{pos.symbol} #{pos.position_type}) — reason: #{reason}, P&L: $#{Float.round(pnl, 2)}")

    # Broadcast close event
    Phoenix.PubSub.broadcast(@pubsub, "trading:positions", {:position_closed, %{
      id: pos.id,
      symbol: pos.symbol,
      side: pos.position_type,
      exit_price: exit_price,
      profit_loss: pnl,
      exit_reason: reason,
      bot_id: pos.bot_id
    }})
  rescue
    e ->
      Logger.error("Failed to close position #{pos.id}: #{Exception.message(e)}")
  end

  defp update_price_extremes(pos, price) do
    updates =
      []
      |> maybe_update_highest(pos, price)
      |> maybe_update_lowest(pos, price)

    if updates != [] do
      from(p in Position, where: p.id == ^pos.id)
      |> Repo.update_all(set: updates)
    end
  rescue
    _ -> :ok
  end

  defp maybe_update_highest(updates, pos, price) do
    current_highest = to_float(pos.highest_price) || 0.0

    if price > current_highest do
      [{:highest_price, Decimal.from_float(price)} | updates]
    else
      updates
    end
  end

  defp maybe_update_lowest(updates, pos, price) do
    current_lowest = to_float(pos.lowest_price)

    if is_nil(current_lowest) or price < current_lowest do
      [{:lowest_price, Decimal.from_float(price)} | updates]
    else
      updates
    end
  end

  defp get_cached_price(symbol) do
    case :ets.lookup(:binance_ticker_cache, symbol) do
      [{^symbol, ticker}] when is_map(ticker) ->
        price = ticker[:last_price] || ticker[:price] || ticker["price"]
        if price, do: to_float(price), else: nil

      _ ->
        case :ets.lookup(:binance_price_cache, symbol) do
          [{^symbol, price, _ts}] -> to_float(price)
          [{^symbol, price}] -> to_float(price)
          _ -> nil
        end
    end
  rescue
    _ -> nil
  end

  defp to_float(nil), do: nil
  defp to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp to_float(n) when is_float(n), do: n
  defp to_float(n) when is_integer(n), do: n * 1.0
  defp to_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> nil
    end
  end
  defp to_float(_), do: nil
end
