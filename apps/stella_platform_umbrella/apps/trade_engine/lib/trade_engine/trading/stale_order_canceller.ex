defmodule TradeEngine.Trading.StaleOrderCanceller do
  @moduledoc """
  Periodically scans for stale pending orders and cancels them.
  An order is stale if it's been in "pending" status longer than the
  configured timeout (default 5 minutes).
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Order

  @pubsub TradeEngine.PubSub
  @tick_interval_ms 30_000
  @order_timeout_minutes 5

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  @impl true
  def init(_opts) do
    Logger.info("🧹 StaleOrderCanceller started — scanning every #{div(@tick_interval_ms, 1000)}s, timeout #{@order_timeout_minutes}m")
    Process.send_after(self(), :scan, @tick_interval_ms)
    {:ok, %{cancelled_count: 0, last_scan: nil}}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply, state, state}
  end

  @impl true
  def handle_info(:scan, state) do
    Process.send_after(self(), :scan, @tick_interval_ms)

    cancelled = cancel_stale_orders()
    new_count = state.cancelled_count + cancelled

    if cancelled > 0 do
      Logger.info("🧹 Cancelled #{cancelled} stale orders")
    end

    {:noreply, %{state | cancelled_count: new_count, last_scan: DateTime.utc_now()}}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp cancel_stale_orders do
    cutoff = DateTime.add(DateTime.utc_now(), -@order_timeout_minutes * 60, :second)

    stale_orders =
      from(o in Order,
        where: o.status == "pending" and o.created_at < ^cutoff,
        select: %{id: o.id, symbol: o.symbol, bot_id: o.bot_id},
        limit: 100
      )
      |> Repo.all(timeout: 10_000)

    if stale_orders != [] do
      ids = Enum.map(stale_orders, & &1.id)

      {count, _} =
        from(o in Order, where: o.id in ^ids)
        |> Repo.update_all(set: [status: "cancelled", updated_at: NaiveDateTime.utc_now()])

      # Broadcast cancellation events
      Enum.each(stale_orders, fn order ->
        Phoenix.PubSub.broadcast(@pubsub, "orders:updates",
          {:order_cancelled, %{id: order.id, symbol: order.symbol, bot_id: order.bot_id, reason: "stale_timeout"}}
        )
      end)

      count
    else
      0
    end
  rescue
    e ->
      Logger.warning("StaleOrderCanceller error: #{Exception.message(e)}")
      0
  end
end
