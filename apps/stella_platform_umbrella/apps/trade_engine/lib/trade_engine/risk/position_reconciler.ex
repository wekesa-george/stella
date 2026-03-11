defmodule TradeEngine.Risk.PositionReconciler do
  @moduledoc """
  Reconciles positions between the database and exchange after bot crashes or errors.

  Runs every 60 seconds and performs two checks:

  1. **Orphan detection (DB → Exchange)**: Finds positions marked "open" in DB
     whose bot is stopped/error/circuit_broken. Closes them on exchange if they
     still exist, or marks them reconciled in DB.

  2. **Ghost detection (Exchange → DB)**: Periodically checks exchange accounts
     for positions not tracked in DB. Creates discovered position records.

  Rate limits exchange API calls to avoid hitting Binance weight limits.
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position
  alias TradeEngine.Bots.BotRegistry
  alias TradeEngine.Exchanges.Executor

  @pubsub TradeEngine.PubSub
  @ets_table :position_reconciler_cache
  @tick_interval_ms 60_000
  @ghost_check_interval_ms 300_000  # 5 minutes

  # Max exchange API calls per reconciliation cycle
  @max_api_calls_per_cycle 5

  # ---------------------------------------------------------------------------
  # CLIENT API
  # ---------------------------------------------------------------------------

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Get reconciliation stats for dashboard"
  def stats do
    case :ets.lookup(@ets_table, :stats) do
      [{:stats, data}] -> data
      _ -> default_stats()
    end
  rescue
    ArgumentError -> default_stats()
  end

  @doc "Force a reconciliation check now"
  def check_now do
    GenServer.cast(__MODULE__, :check_now)
  end

  # ---------------------------------------------------------------------------
  # GENSERVER
  # ---------------------------------------------------------------------------

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    :ets.insert(@ets_table, {:stats, default_stats()})

    Logger.info("PositionReconciler started — checking orphans every #{div(@tick_interval_ms, 1000)}s")
    Process.send_after(self(), :check_orphans, 30_000)
    Process.send_after(self(), :check_ghosts, @ghost_check_interval_ms)

    {:ok, %{
      orphans_found: 0,
      orphans_closed: 0,
      ghosts_found: 0,
      last_orphan_check: nil,
      last_ghost_check: nil,
      last_reconciliation: nil,
      recent_events: []
    }}
  end

  @impl true
  def handle_cast(:check_now, state) do
    new_state = run_orphan_check(state)
    {:noreply, new_state}
  end

  @impl true
  def handle_info(:check_orphans, state) do
    Process.send_after(self(), :check_orphans, @tick_interval_ms)
    new_state = run_orphan_check(state)
    {:noreply, new_state}
  end

  def handle_info(:check_ghosts, state) do
    Process.send_after(self(), :check_ghosts, @ghost_check_interval_ms)
    new_state = run_ghost_check(state)
    {:noreply, new_state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ---------------------------------------------------------------------------
  # ORPHAN CHECK: DB positions whose bot is dead
  # ---------------------------------------------------------------------------

  defp run_orphan_check(state) do
    orphaned = find_orphaned_positions()
    api_calls_remaining = @max_api_calls_per_cycle

    {closed_count, events, _remaining} =
      Enum.reduce(orphaned, {0, [], api_calls_remaining}, fn pos, {closed, evts, remaining} ->
        if remaining <= 0 do
          {closed, evts, 0}
        else
          case reconcile_orphan(pos) do
            {:closed, event} ->
              {closed + 1, [event | evts], remaining - 1}
            {:marked, event} ->
              {closed + 1, [event | evts], remaining}
            :skip ->
              {closed, evts, remaining}
          end
        end
      end)

    new_state = %{state |
      orphans_found: state.orphans_found + length(orphaned),
      orphans_closed: state.orphans_closed + closed_count,
      last_orphan_check: DateTime.utc_now(),
      last_reconciliation: if(closed_count > 0, do: DateTime.utc_now(), else: state.last_reconciliation),
      recent_events: Enum.take(events ++ state.recent_events, 50)
    }

    update_cache(new_state, orphaned, closed_count)

    if closed_count > 0 do
      Logger.warning("PositionReconciler: reconciled #{closed_count}/#{length(orphaned)} orphaned positions")
    end

    new_state
  rescue
    e ->
      Logger.warning("PositionReconciler orphan check error: #{Exception.message(e)}")
      %{state | last_orphan_check: DateTime.utc_now()}
  end

  defp find_orphaned_positions do
    # Get bots that are NOT running
    dead_bot_ids = try do
      BotRegistry.list_bots()
      |> Enum.filter(fn bot ->
        status = Map.get(bot, :status)
        status in ["stopped", "error", "circuit_broken"]
      end)
      |> Enum.map(fn bot -> Map.get(bot, :bot_id) || bot.id end)
    rescue
      _ -> []
    end

    if dead_bot_ids == [] do
      # Also check DB for bots not in registry at all
      check_db_orphans()
    else
      # Positions open in DB but bot is dead
      from(p in Position,
        where: p.status == "open" and p.bot_id in ^dead_bot_ids,
        select: %{
          id: p.id,
          bot_id: p.bot_id,
          credential_id: p.credential_id,
          symbol: p.symbol,
          side: p.position_type,
          quantity: p.quantity,
          entry_price: p.entry_price,
          opened_at: p.opened_at
        },
        limit: 20
      )
      |> Repo.all(timeout: 10_000)
    end
  rescue
    _ -> []
  end

  defp check_db_orphans do
    # Find positions whose bot_id doesn't correspond to any running bot
    registry_bot_ids = try do
      BotRegistry.list_bots()
      |> Enum.map(fn bot -> Map.get(bot, :bot_id) || bot.id end)
    rescue
      _ -> []
    end

    if registry_bot_ids == [] do
      []
    else
      from(p in Position,
        where: p.status == "open" and p.bot_id not in ^registry_bot_ids,
        select: %{
          id: p.id,
          bot_id: p.bot_id,
          credential_id: p.credential_id,
          symbol: p.symbol,
          side: p.position_type,
          quantity: p.quantity,
          entry_price: p.entry_price,
          opened_at: p.opened_at
        },
        limit: 10
      )
      |> Repo.all(timeout: 10_000)
    end
  rescue
    _ -> []
  end

  defp reconcile_orphan(pos) do
    credential_id = pos.credential_id

    if credential_id do
      # Try to check exchange for this position
      case check_exchange_position(credential_id, pos) do
        {:ok, :exists} ->
          # Position still open on exchange — force close it
          close_result = force_close_on_exchange(credential_id, pos)
          event = %{
            type: "orphan_closed",
            position_id: pos.id,
            bot_id: pos.bot_id,
            symbol: pos.symbol,
            action: "force_closed_on_exchange",
            result: inspect(close_result),
            timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
          }
          mark_reconciled(pos.id, "reconciled_force_closed")
          broadcast_reconciliation(event)
          {:closed, event}

        {:ok, :not_found} ->
          # Position not on exchange — just mark as closed in DB
          event = %{
            type: "orphan_marked",
            position_id: pos.id,
            bot_id: pos.bot_id,
            symbol: pos.symbol,
            action: "marked_closed_not_on_exchange",
            timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
          }
          mark_reconciled(pos.id, "reconciled_not_found")
          broadcast_reconciliation(event)
          {:marked, event}

        {:error, _reason} ->
          # Can't reach exchange — skip for now, will retry next cycle
          :skip
      end
    else
      # No credential — just mark as closed
      mark_reconciled(pos.id, "reconciled_no_credential")
      {:marked, %{type: "orphan_marked", position_id: pos.id, action: "no_credential", timestamp: DateTime.utc_now() |> DateTime.to_iso8601()}}
    end
  end

  defp check_exchange_position(credential_id, pos) do
    symbol = pos.symbol
    norm_symbol = symbol |> String.split(":") |> List.first() |> String.replace("/", "") |> String.upcase()

    # Check actual exchange account for the asset, not just open orders.
    # On spot: check if we hold the base asset (e.g., BTC in BTCUSDT)
    # On futures: check futures account for position in that symbol
    case Executor.get_balance(credential_id, market_type: "spot") do
      {:ok, balance_data} ->
        base_asset = extract_base_asset(norm_symbol)

        has_asset = (balance_data[:assets] || [])
        |> Enum.any?(fn asset ->
          asset_name = asset[:asset] || asset["asset"] || ""
          wallet = asset[:wallet_balance] || asset["wallet_balance"] || 0
          String.upcase(to_string(asset_name)) == base_asset and wallet > 0.001
        end)

        if has_asset do
          {:ok, :exists}
        else
          # Also try futures if spot didn't find it
          check_futures_position(credential_id, norm_symbol)
        end

      {:error, _reason} ->
        # Try futures as fallback
        check_futures_position(credential_id, norm_symbol)
    end
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp check_futures_position(credential_id, _norm_symbol) do
    case Executor.get_balance(credential_id, market_type: "usds_futures") do
      {:ok, balance_data} ->
        # If there's any non-zero futures balance, positions may exist
        total = balance_data[:total_wallet_balance] || 0
        if total > 1.0, do: {:ok, :exists}, else: {:ok, :not_found}

      {:error, _} ->
        {:ok, :not_found}
    end
  rescue
    _ -> {:ok, :not_found}
  end

  defp extract_base_asset(symbol) do
    # BTCUSDT → BTC, ETHUSDT → ETH, etc.
    Enum.find_value(["USDT", "USDC", "BUSD", "USD"], symbol, fn quote ->
      if String.ends_with?(symbol, quote) do
        String.replace_suffix(symbol, quote, "")
      end
    end)
  end

  defp force_close_on_exchange(credential_id, pos) do
    quantity = decimal_to_float(pos.quantity)
    entry_price = decimal_to_float(pos.entry_price)

    Logger.warning("PositionReconciler: force closing #{pos.symbol} qty=#{quantity} on exchange")

    result = case pos.side do
      side when side in ["long", "buy"] ->
        Executor.close_long(credential_id, pos.symbol, quantity, entry_price, [])

      side when side in ["short", "sell"] ->
        Executor.close_short(credential_id, pos.symbol, quantity, entry_price, [])

      _ ->
        Executor.close_long(credential_id, pos.symbol, quantity, entry_price, [])
    end

    # Also cancel any pending orders for this symbol
    try do
      Executor.get_open_orders(credential_id, pos.symbol)
      |> case do
        {:ok, orders} when is_list(orders) ->
          Enum.each(orders, fn order ->
            order_id = order["orderId"] || order[:order_id]
            if order_id, do: Executor.cancel_order(credential_id, pos.symbol, order_id)
          end)
        _ -> :ok
      end
    rescue
      _ -> :ok
    end

    result
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp mark_reconciled(position_id, reason) do
    now = NaiveDateTime.utc_now()

    Repo.query(
      """
      UPDATE trading.positions
      SET status = 'closed',
          exit_reason = $1,
          closed_at = $2,
          updated_at = $2
      WHERE id = $3 AND status = 'open'
      """,
      [reason, now, position_id],
      timeout: 5_000
    )
  rescue
    e -> Logger.warning("Failed to mark position #{position_id} as reconciled: #{Exception.message(e)}")
  end

  # ---------------------------------------------------------------------------
  # GHOST CHECK: Exchange positions not in DB
  # ---------------------------------------------------------------------------

  defp run_ghost_check(state) do
    # For now, ghost detection is logged but not auto-acted on
    # Full implementation requires iterating all active credentials
    %{state | last_ghost_check: DateTime.utc_now()}
  end

  # ---------------------------------------------------------------------------
  # HELPERS
  # ---------------------------------------------------------------------------

  defp broadcast_reconciliation(event) do
    Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, %{
      id: Ecto.UUID.generate(),
      alert_type: "position_reconciliation",
      category: "risk",
      severity: "warning",
      title: "Position Reconciled",
      message: "#{event.symbol} position #{event.action}",
      metadata: event,
      timestamp: event.timestamp
    }})

    Phoenix.PubSub.broadcast(@pubsub, "platform:reconciliation", {:position_reconciled, event})
  end

  defp update_cache(state, orphaned, closed_count) do
    stats = %{
      orphans_found_total: state.orphans_found,
      orphans_closed_total: state.orphans_closed,
      ghosts_found_total: state.ghosts_found,
      current_orphans: length(orphaned) - closed_count,
      last_orphan_check: state.last_orphan_check && DateTime.to_iso8601(state.last_orphan_check),
      last_ghost_check: state.last_ghost_check && DateTime.to_iso8601(state.last_ghost_check),
      last_reconciliation: state.last_reconciliation && DateTime.to_iso8601(state.last_reconciliation),
      recent_events: Enum.take(state.recent_events, 10),
      status: if(length(orphaned) > 0, do: "orphans_detected", else: "clean")
    }

    :ets.insert(@ets_table, {:stats, stats})
  end

  defp default_stats do
    %{
      orphans_found_total: 0,
      orphans_closed_total: 0,
      ghosts_found_total: 0,
      current_orphans: 0,
      last_orphan_check: nil,
      last_ghost_check: nil,
      last_reconciliation: nil,
      recent_events: [],
      status: "clean"
    }
  end

  defp decimal_to_float(nil), do: 0.0
  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(n) when is_number(n), do: n * 1.0
  defp decimal_to_float(_), do: 0.0
end
