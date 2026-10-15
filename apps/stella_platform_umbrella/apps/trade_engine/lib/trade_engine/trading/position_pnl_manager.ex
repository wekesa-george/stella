defmodule TradeEngine.Trading.PositionPnLManager do
  @moduledoc """
  Real-time P&L calculator for open positions.

  Reads open positions from DB (capped), fetches current prices from ETS,
  calculates unrealized P&L, writes to :position_pnl_cache ETS, and
  broadcasts batch updates via PubSub for the PositionChannel.

  Runs every 1 second — lightweight because it only reads ETS + writes ETS.
  DB writes are handled separately by PositionManager on a slower cycle.
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position

  @pubsub TradeEngine.PubSub
  @ets_table :position_pnl_cache
  @tick_interval_ms 1_000
  @max_positions 1_000
  @reload_interval_ms 30_000

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Get cached P&L for a position"
  def get_pnl(position_id) do
    case :ets.lookup(@ets_table, position_id) do
      [{^position_id, pnl_data}] -> {:ok, pnl_data}
      [] -> {:error, :not_found}
    end
  rescue
    ArgumentError -> {:error, :not_started}
  end

  @doc "Get all cached P&L entries"
  def all_pnl do
    :ets.tab2list(@ets_table)
    |> Enum.map(fn {_id, data} -> data end)
  rescue
    _ -> []
  end

  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    Logger.info("📈 PositionPnLManager started — tick every #{@tick_interval_ms}ms")

    Process.send_after(self(), :load_positions, 2_000)
    Process.send_after(self(), :tick, @tick_interval_ms)

    {:ok, %{positions: [], last_reload: nil}}
  end

  @impl true
  def handle_info(:load_positions, state) do
    positions = load_open_positions()
    Process.send_after(self(), :load_positions, @reload_interval_ms)
    {:noreply, %{state | positions: positions, last_reload: DateTime.utc_now()}}
  end

  def handle_info(:tick, state) do
    Process.send_after(self(), :tick, @tick_interval_ms)

    if state.positions != [] do
      updates = calculate_all_pnl(state.positions)
      write_to_ets(updates)
      broadcast_updates(updates)
    end

    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ============================================================================
  # INTERNALS
  # ============================================================================

  defp load_open_positions do
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
        bot_id: p.bot_id
      }
    )
    |> Repo.all(timeout: 10_000)
  rescue
    e ->
      Logger.warning("PositionPnLManager: failed to load positions: #{Exception.message(e)}")
      []
  end

  defp calculate_all_pnl(positions) do
    positions
    |> Enum.reduce([], fn pos, acc ->
      case get_cached_price(pos.symbol) do
        nil -> acc
        price ->
          pnl = calc_pnl(pos, price)
          entry = to_float(pos.entry_price) || 0.0
          pnl_pct = if entry > 0, do: pnl / (entry * to_float(pos.quantity)) * 100, else: 0.0

          [%{
            position_id: pos.id,
            bot_id: pos.bot_id,
            symbol: pos.symbol,
            side: pos.position_type,
            entry_price: entry,
            current_price: price,
            quantity: to_float(pos.quantity) || 0.0,
            unrealized_pnl: Float.round(pnl, 4),
            pnl_pct: Float.round(pnl_pct, 2),
            updated_at: System.system_time(:millisecond)
          } | acc]
      end
    end)
  end

  defp write_to_ets(updates) do
    Enum.each(updates, fn u ->
      :ets.insert(@ets_table, {u.position_id, u})
    end)
  end

  defp broadcast_updates([]), do: :ok

  defp broadcast_updates(updates) do
    Phoenix.PubSub.broadcast(@pubsub, "positions:pnl_update", {:pnl_batch_update, updates})
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

  defp calc_pnl(pos, current_price) do
    entry = to_float(pos.entry_price) || 0.0
    qty = to_float(pos.quantity) || 0.0

    case pos.position_type do
      "long" -> (current_price - entry) * qty
      "short" -> (entry - current_price) * qty
      _ -> 0.0
    end
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
