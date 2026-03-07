defmodule TradeEngine.Trading.OrderManager do
  @moduledoc """
  Wraps Executor calls with order persistence and PubSub broadcasts.

  Instead of calling Executor directly, BotTradingProcess calls OrderManager
  which:
    1. Inserts a `trading.orders` row with status "submitted"
    2. Broadcasts {:order_created, order} via PubSub
    3. Calls the Executor
    4. Updates the order to "filled" or "failed"
    5. Broadcasts {:order_filled, order} or {:order_failed, order_id, reason}

  This enables the Live Order Stream card and populates the orders table
  for fill rate, slippage, and execution latency analytics.
  """

  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Order
  alias TradeEngine.Exchanges.Executor

  @pubsub TradeEngine.PubSub

  # ---------------------------------------------------------------------------
  # PUBLIC API
  # ---------------------------------------------------------------------------

  @doc "Execute a long entry with order tracking"
  def execute_long(credential_id, symbol, quantity, opts \\ []) do
    execute(:long, credential_id, symbol, quantity, nil, opts)
  end

  @doc "Execute a short entry with order tracking"
  def execute_short(credential_id, symbol, quantity, opts \\ []) do
    execute(:short, credential_id, symbol, quantity, nil, opts)
  end

  @doc "Close a long position with order tracking"
  def close_long(credential_id, symbol, quantity, entry_price, opts \\ []) do
    execute(:close_long, credential_id, symbol, quantity, entry_price, opts)
  end

  @doc "Close a short position with order tracking"
  def close_short(credential_id, symbol, quantity, entry_price, opts \\ []) do
    execute(:close_short, credential_id, symbol, quantity, entry_price, opts)
  end

  @doc "List recent orders across all bots (for dashboard feed)"
  def list_recent(limit \\ 50) do
    Order
    |> order_by([o], desc: o.created_at)
    |> limit(^limit)
    |> Repo.all()
  end

  @doc "List recent orders for a specific bot"
  def list_recent_for_bot(bot_id, limit \\ 50) do
    Order
    |> where([o], o.bot_id == ^bot_id)
    |> order_by([o], desc: o.created_at)
    |> limit(^limit)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # PRIVATE
  # ---------------------------------------------------------------------------

  defp execute(action, credential_id, symbol, quantity, entry_price, opts) do
    side = case action do
      :long -> "buy"
      :short -> "sell"
      :close_long -> "sell"
      :close_short -> "buy"
    end

    order_attrs = %{
      symbol: symbol,
      side: side,
      order_type: "market",
      quantity: to_decimal(quantity),
      status: "submitted",
      submitted_at: DateTime.utc_now(),
      user_id: Keyword.get(opts, :user_id),
      bot_id: Keyword.get(opts, :bot_id),
      credential_id: Keyword.get(opts, :credential_id, credential_id),
      strategy_id: Keyword.get(opts, :strategy_id),
      position_id: Keyword.get(opts, :position_id),
      metadata: %{
        action: to_string(action),
        market_type: Keyword.get(opts, :market_type, "spot"),
        manual: Keyword.get(opts, :manual, false),
        confidence: Keyword.get(opts, :confidence)
      }
    }

    # 1. Persist order with status "submitted"
    case Repo.insert(Order.changeset(%Order{}, order_attrs)) do
      {:ok, order} ->
        # 2. Broadcast order_created
        broadcast({:order_created, order})
        broadcast_bot(order.bot_id, {:order_created, order})

        # 3. Call Executor
        exchange_result = call_executor(action, credential_id, symbol, quantity, entry_price, opts)

        # 4. Update order based on result
        finalize_order(order, exchange_result)

      {:error, changeset} ->
        Logger.error("OrderManager: failed to insert order: #{inspect(changeset.errors)}")
        # Fall through to Executor anyway so trading isn't blocked by DB issues
        call_executor(action, credential_id, symbol, quantity, entry_price, opts)
    end
  end

  defp call_executor(:long, cred, sym, qty, _entry, opts),
    do: Executor.execute_long(cred, sym, qty, opts)
  defp call_executor(:short, cred, sym, qty, _entry, opts),
    do: Executor.execute_short(cred, sym, qty, opts)
  defp call_executor(:close_long, cred, sym, qty, entry, opts),
    do: Executor.close_long(cred, sym, qty, entry, opts)
  defp call_executor(:close_short, cred, sym, qty, entry, opts),
    do: Executor.close_short(cred, sym, qty, entry, opts)

  defp finalize_order(order, {:ok, result}) do
    executed_price = result[:executed_price]
    executed_qty = result[:executed_qty] || Decimal.to_float(order.quantity)
    exchange_order_id = result[:order_id]
    now = DateTime.utc_now()

    update_attrs = %{
      status: "filled",
      execution_price: to_decimal(executed_price),
      filled_quantity: to_decimal(executed_qty),
      execution_time: now,
      first_fill_at: now,
      exchange_order_id: to_string(exchange_order_id || ""),
      exchange_response: sanitize_exchange_response(result)
    }

    case Repo.update(Order.changeset(order, update_attrs)) do
      {:ok, filled_order} ->
        broadcast({:order_filled, filled_order})
        broadcast_bot(filled_order.bot_id, {:order_filled, filled_order})
        {:ok, result}

      {:error, _} ->
        # DB update failed but exchange succeeded — log and return success
        Logger.warning("OrderManager: order #{order.id} filled on exchange but DB update failed")
        {:ok, result}
    end
  end

  defp finalize_order(order, {:error, reason}) do
    update_attrs = %{
      status: "failed",
      rejection_reason: inspect(reason),
      metadata: Map.put(order.metadata || %{}, "error", inspect(reason))
    }

    case Repo.update(Order.changeset(order, update_attrs)) do
      {:ok, _} -> :ok
      {:error, _} -> :ok
    end

    broadcast({:order_failed, order.id, reason})
    broadcast_bot(order.bot_id, {:order_failed, order.id, reason})

    {:error, reason}
  end

  defp broadcast(msg) do
    Phoenix.PubSub.broadcast(@pubsub, "orders:updates", msg)
  end

  defp broadcast_bot(nil, _msg), do: :ok
  defp broadcast_bot(bot_id, msg) do
    Phoenix.PubSub.broadcast(@pubsub, "orders:bot:#{bot_id}", msg)
  end

  defp to_decimal(nil), do: nil
  defp to_decimal(%Decimal{} = d), do: d
  defp to_decimal(n) when is_float(n), do: Decimal.from_float(n)
  defp to_decimal(n) when is_integer(n), do: Decimal.new(n)
  defp to_decimal(s) when is_binary(s) do
    case Decimal.parse(s) do
      {d, _} -> d
      :error -> nil
    end
  end

  defp sanitize_exchange_response(result) when is_map(result) do
    result
    |> Map.drop([:__struct__])
    |> Map.new(fn {k, v} -> {to_string(k), sanitize_value(v)} end)
  end
  defp sanitize_exchange_response(_), do: %{}

  defp sanitize_value(v) when is_pid(v), do: inspect(v)
  defp sanitize_value(v) when is_reference(v), do: inspect(v)
  defp sanitize_value(v) when is_function(v), do: "function"
  defp sanitize_value(%Decimal{} = d), do: Decimal.to_float(d)
  defp sanitize_value(v), do: v
end
