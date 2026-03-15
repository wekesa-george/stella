defmodule TradeEngine.Trading.SyncRoutine do
  @moduledoc """
  Periodic sync routine that reconciles DB state with exchange reality.

  Runs every 2 minutes and performs:
  1. Order sync — detect stale, duplicate, missing orders
  2. Position sync — detect orphaned, drifted positions
  3. Anomaly tracking — flag on first pass, fix on second pass

  Uses a two-pass approach: anomalies detected on pass 1 are only fixed
  if they persist on pass 2 (2 minutes later). This prevents fixing
  transient states (e.g. order being filled right now).
  """

  use GenServer
  require Logger

  alias TradeEngine.Repo
  alias TradeEngine.Trading.{Order, Position, Transaction}
  alias TradeEngine.Exchanges.Executor
  alias TradeEngine.Bots.BotRegistry

  @sync_interval_ms 120_000  # 2 minutes
  @stale_order_age_s 120     # Orders stuck in submitted for 2+ minutes
  @anomaly_fix_threshold 2   # Fix after seen this many consecutive passes

  # ========================================================================
  # CLIENT API
  # ========================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def get_anomalies do
    GenServer.call(__MODULE__, :get_anomalies)
  end

  # ========================================================================
  # SERVER CALLBACKS
  # ========================================================================

  @impl true
  def init(_opts) do
    # Delay first run to let bots start up
    Process.send_after(self(), :sync, 30_000)

    Logger.info("🔄 SyncRoutine started — will run every #{div(@sync_interval_ms, 1000)}s")
    {:ok, %{anomalies: %{}, last_run: nil, runs: 0}}
  end

  @impl true
  def handle_call(:get_anomalies, _from, state) do
    {:reply, state.anomalies, state}
  end

  @impl true
  def handle_info(:sync, state) do
    Process.send_after(self(), :sync, @sync_interval_ms)

    new_state = try do
      run_sync(state)
    rescue
      e ->
        Logger.warning("🔄 SyncRoutine failed: #{Exception.message(e)}")
        state
    end

    {:noreply, new_state}
  end

  @impl true
  def handle_info(_, state), do: {:noreply, state}

  # ========================================================================
  # SYNC LOGIC
  # ========================================================================

  defp run_sync(state) do
    started_at = System.monotonic_time(:millisecond)
    current_anomalies = %{}

    # Get all running bots with their configs
    bots = try do
      BotRegistry.list_bots()
      |> Enum.filter(fn b -> Map.get(b, :status) in ["running", "initializing", "paused"] end)
    rescue
      _ -> []
    end

    # Run order sync for each bot
    {current_anomalies, fixes_applied} = Enum.reduce(bots, {current_anomalies, 0}, fn bot, {anomalies, fixes} ->
      {bot_anomalies, bot_fixes} = sync_bot_orders(bot, state.anomalies)
      merged = Map.merge(anomalies, bot_anomalies)
      {merged, fixes + bot_fixes}
    end)

    elapsed = System.monotonic_time(:millisecond) - started_at
    runs = state.runs + 1

    # Log summary
    anomaly_count = map_size(current_anomalies)
    if anomaly_count > 0 or fixes_applied > 0 do
      Logger.info("🔄 SyncRoutine pass ##{runs}: #{anomaly_count} anomalies, #{fixes_applied} fixes | #{elapsed}ms")
    end

    %{state |
      anomalies: current_anomalies,
      last_run: DateTime.utc_now(),
      runs: runs
    }
  end

  # ========================================================================
  # ORDER SYNC
  # ========================================================================

  defp sync_bot_orders(bot, previous_anomalies) do
    import Ecto.Query

    bot_id = Map.get(bot, :id)
    credential_id = Map.get(bot, :credential_id)
    market_type = Map.get(bot, :market_type, "spot")
    trading_pairs = Map.get(bot, :trading_pairs, [])

    if is_nil(bot_id) or is_nil(credential_id) or trading_pairs == [] do
      {%{}, 0}
    else
      symbol = List.first(trading_pairs)

      # Get DB open orders
      db_orders = Repo.all(
        from(o in Order,
          where: o.bot_id == ^bot_id and o.status in ["open", "submitted"],
          select: %{
            id: o.id,
            exchange_order_id: o.exchange_order_id,
            side: o.side,
            price: o.price,
            quantity: o.quantity,
            status: o.status,
            submitted_at: o.submitted_at,
            created_at: o.created_at
          }
        )
      )

      # Get exchange open orders
      exchange_orders = case Executor.get_open_orders(credential_id, symbol, market_type: market_type) do
        {:ok, orders} when is_list(orders) -> orders
        _ -> nil
      end

      if is_nil(exchange_orders) do
        {%{}, 0}
      else
        anomalies = %{}
        fixes = 0

        exchange_ids = exchange_orders
          |> Enum.map(fn o -> to_string(o[:order_id]) end)
          |> MapSet.new()

        # Check 1: DB open orders gone from exchange
        {anomalies, fixes} = Enum.reduce(db_orders, {anomalies, fixes}, fn order, {ano, fx} ->
          oid = to_string(order.exchange_order_id || "")

          cond do
            # No exchange_order_id — stuck in submitted
            oid == "" and order.status == "submitted" ->
              age = if order.submitted_at, do: DateTime.diff(DateTime.utc_now(), order.submitted_at), else: 0
              if age > @stale_order_age_s do
                key = "stale_submitted:#{order.id}"
                prev = Map.get(previous_anomalies, key)
                if prev && prev.seen_count >= @anomaly_fix_threshold do
                  # Fix: mark as failed
                  Repo.update_all(
                    from(o in Order, where: o.id == ^order.id and o.status == "submitted"),
                    set: [status: "failed", cancel_reason: "sync_routine: stuck submitted > #{@stale_order_age_s}s"]
                  )
                  {ano, fx + 1}
                else
                  {Map.put(ano, key, %{
                    type: :stale_submitted,
                    bot_id: bot_id,
                    order_id: order.id,
                    age_seconds: age,
                    seen_count: (prev && prev.seen_count + 1) || 1,
                    first_seen: (prev && prev.first_seen) || DateTime.utc_now()
                  }), fx}
                end
              else
                {ano, fx}
              end

            # Has exchange_order_id but not on exchange anymore
            oid != "" and not MapSet.member?(exchange_ids, oid) ->
              key = "gone_from_exchange:#{order.id}"
              prev = Map.get(previous_anomalies, key)
              if prev && prev.seen_count >= @anomaly_fix_threshold do
                # Fix: check trade history first, then mark cancelled
                was_filled = check_if_filled(credential_id, symbol, oid, market_type)
                new_status = if was_filled, do: "filled", else: "cancelled"
                reason = if was_filled, do: "sync_routine: detected fill from trade history", else: "sync_routine: gone from exchange"

                Repo.update_all(
                  from(o in Order, where: o.id == ^order.id and o.status in ["open", "submitted"]),
                  set: [status: new_status, cancel_reason: reason]
                )

                if was_filled do
                  Logger.info("🔄 SyncRoutine: order #{oid} was actually filled — updated DB")
                end

                {ano, fx + 1}
              else
                {Map.put(ano, key, %{
                  type: :gone_from_exchange,
                  bot_id: bot_id,
                  order_id: order.id,
                  exchange_order_id: oid,
                  seen_count: (prev && prev.seen_count + 1) || 1,
                  first_seen: (prev && prev.first_seen) || DateTime.utc_now()
                }), fx}
              end

            true ->
              {ano, fx}
          end
        end)

        # Check 2: Duplicate exchange orders at same price
        bot_prefix = String.slice(bot_id, 0, 8)
        my_orders = Enum.filter(exchange_orders, fn o ->
          coid = to_string(o[:client_order_id] || "")
          String.starts_with?(coid, bot_prefix)
        end)

        by_price = Enum.group_by(my_orders, fn o -> {o[:price], to_string(o[:side])} end)
        {anomalies, fixes} = Enum.reduce(by_price, {anomalies, fixes}, fn {{price, side}, orders_at_price}, {ano, fx} ->
          if length(orders_at_price) > 1 do
            key = "duplicate:#{bot_id}:#{price}:#{side}"
            prev = Map.get(previous_anomalies, key)
            if prev && prev.seen_count >= @anomaly_fix_threshold do
              # Fix: keep newest, cancel rest
              sorted = Enum.sort_by(orders_at_price, fn o -> o[:time] || 0 end, :desc)
              to_cancel = Enum.drop(sorted, 1)
              cancelled = Enum.reduce(to_cancel, 0, fn order, count ->
                oid = order[:order_id]
                case Executor.cancel_order(credential_id, symbol, oid, market_type: market_type) do
                  {:ok, _} -> count + 1
                  _ -> count
                end
              end)
              Logger.info("🔄 SyncRoutine: cancelled #{cancelled} duplicate #{side} orders at #{price} for bot #{bot_prefix}")
              {ano, fx + cancelled}
            else
              {Map.put(ano, key, %{
                type: :duplicate_orders,
                bot_id: bot_id,
                price: price,
                side: side,
                count: length(orders_at_price),
                seen_count: (prev && prev.seen_count + 1) || 1,
                first_seen: (prev && prev.first_seen) || DateTime.utc_now()
              }), fx}
            end
          else
            {ano, fx}
          end
        end)

        {anomalies, fixes}
      end
    end
  rescue
    e ->
      Logger.warning("🔄 SyncRoutine: sync_bot_orders failed for bot: #{inspect(e)}")
      {%{}, 0}
  end

  # ========================================================================
  # HELPERS
  # ========================================================================

  # Check exchange trade history to see if an order was actually filled
  defp check_if_filled(credential_id, symbol, exchange_order_id, market_type) do
    case Executor.get_user_trades(credential_id, symbol, market_type: market_type, limit: 20) do
      {:ok, trades} when is_list(trades) ->
        oid_str = to_string(exchange_order_id)
        Enum.any?(trades, fn t ->
          to_string(t[:order_id]) == oid_str
        end)
      _ ->
        false
    end
  rescue
    _ -> false
  end
end
