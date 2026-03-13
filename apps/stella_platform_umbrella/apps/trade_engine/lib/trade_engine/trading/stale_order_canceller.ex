defmodule TradeEngine.Trading.StaleOrderCanceller do
  @moduledoc """
  Periodically scans for stale orders and cancels them BOTH on exchange and in DB.

  Scans two categories:
  1. DB "pending" orders older than 5 minutes — these never made it to the exchange
     or got stuck. Cancel on exchange (best-effort) then mark DB as cancelled.
  2. DB "open"/"submitted" orders older than timeout — these are on the exchange
     but may be orphaned (bot stopped, etc). Cancel on exchange then update DB.

  Processes orders per-credential to respect rate limits and avoid cross-credential
  interference. Max 10 exchange cancel calls per scan cycle.
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Order
  alias TradeEngine.Exchanges.Executor

  @pubsub TradeEngine.PubSub
  @tick_interval_ms 30_000
  @pending_timeout_minutes 5
  @open_stale_timeout_minutes 60
  @max_exchange_cancels_per_cycle 10

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  @impl true
  def init(_opts) do
    Logger.info("StaleOrderCanceller started — scanning every #{div(@tick_interval_ms, 1000)}s")
    Process.send_after(self(), :scan, @tick_interval_ms)
    {:ok, %{cancelled_count: 0, exchange_cancelled: 0, last_scan: nil}}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply, state, state}
  end

  @impl true
  def handle_info(:scan, state) do
    Process.send_after(self(), :scan, @tick_interval_ms)

    {db_cancelled, exchange_cancelled} = cancel_stale_orders()

    new_state = %{state |
      cancelled_count: state.cancelled_count + db_cancelled,
      exchange_cancelled: state.exchange_cancelled + exchange_cancelled,
      last_scan: DateTime.utc_now()
    }

    if db_cancelled > 0 do
      Logger.info("StaleOrderCanceller: cancelled #{db_cancelled} DB orders (#{exchange_cancelled} on exchange)")
    end

    {:noreply, new_state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp cancel_stale_orders do
    pending_cutoff = DateTime.add(DateTime.utc_now(), -@pending_timeout_minutes * 60, :second)
    open_cutoff = DateTime.add(DateTime.utc_now(), -@open_stale_timeout_minutes * 60, :second)

    # Category 1: Stuck pending orders (never confirmed by exchange)
    pending_stale = from(o in Order,
      where: o.status == "pending" and o.created_at < ^pending_cutoff,
      select: %{
        id: o.id, symbol: o.symbol, bot_id: o.bot_id,
        exchange_order_id: o.exchange_order_id, credential_id: o.credential_id
      },
      limit: 50
    )
    |> Repo.all(timeout: 10_000)

    # Category 2: Open/submitted orders that are very old (bot likely stopped)
    open_stale = from(o in Order,
      where: o.status in ["open", "submitted"] and o.created_at < ^open_cutoff,
      select: %{
        id: o.id, symbol: o.symbol, bot_id: o.bot_id,
        exchange_order_id: o.exchange_order_id, credential_id: o.credential_id
      },
      limit: 50
    )
    |> Repo.all(timeout: 10_000)

    all_stale = pending_stale ++ open_stale
    if all_stale == [] do
      {0, 0}
    else
      # Group by credential to batch exchange cancels
      by_credential = Enum.group_by(all_stale, & &1.credential_id)

      exchange_cancelled = by_credential
      |> Enum.take(5)  # max 5 credentials per cycle
      |> Enum.reduce(0, fn {credential_id, orders}, acc ->
        if credential_id do
          cancelled = cancel_on_exchange(credential_id, orders)
          acc + cancelled
        else
          acc
        end
      end)

      # Mark all as cancelled in DB regardless of exchange result
      ids = Enum.map(all_stale, & &1.id)
      {db_count, _} = from(o in Order, where: o.id in ^ids)
      |> Repo.update_all(set: [
        status: "cancelled",
        cancel_reason: "stale_timeout",
        cancelled_at: NaiveDateTime.utc_now(),
        updated_at: NaiveDateTime.utc_now()
      ])

      # Broadcast
      Enum.each(all_stale, fn order ->
        Phoenix.PubSub.broadcast(@pubsub, "orders:updates",
          {:order_cancelled, %{id: order.id, symbol: order.symbol, bot_id: order.bot_id, reason: "stale_timeout"}}
        )
      end)

      {db_count, exchange_cancelled}
    end
  rescue
    e ->
      Logger.warning("StaleOrderCanceller error: #{Exception.message(e)}")
      {0, 0}
  end

  defp cancel_on_exchange(credential_id, orders) do
    orders
    |> Enum.filter(& &1.exchange_order_id)
    |> Enum.take(@max_exchange_cancels_per_cycle)
    |> Enum.reduce(0, fn order, acc ->
      case Executor.cancel_order(credential_id, order.symbol, order.exchange_order_id, market_type: "usds_futures") do
        {:ok, _} ->
          Logger.debug("StaleOrderCanceller: cancelled #{order.exchange_order_id} on exchange for #{order.symbol}")
          acc + 1
        {:error, reason} ->
          # -2011 = unknown order (already cancelled/filled) — this is fine
          if match?(%{code: -2011}, reason) do
            acc
          else
            Logger.debug("StaleOrderCanceller: exchange cancel failed for #{order.exchange_order_id}: #{inspect(reason)}")
            acc
          end
      end
    end)
  rescue
    e ->
      Logger.warning("StaleOrderCanceller exchange cancel error for credential #{String.slice(to_string(credential_id), 0, 8)}: #{Exception.message(e)}")
      0
  end
end
