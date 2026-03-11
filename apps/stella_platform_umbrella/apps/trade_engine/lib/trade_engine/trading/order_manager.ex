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
  alias TradeEngine.Trading.Transaction
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

  @doc "Place a limit order with order tracking"
  def place_limit_order(credential_id, symbol, side, quantity, price, opts \\ []) do
    order_attrs = %{
      symbol: symbol,
      side: to_string(side) |> String.downcase(),
      order_type: "limit",
      quantity: to_decimal(quantity),
      status: "submitted",
      submitted_at: DateTime.utc_now(),
      user_id: Keyword.get(opts, :user_id),
      bot_id: Keyword.get(opts, :bot_id),
      credential_id: Keyword.get(opts, :credential_id, credential_id),
      strategy_id: Keyword.get(opts, :strategy_id),
      position_id: Keyword.get(opts, :position_id),
      metadata: %{
        action: "limit_#{side}",
        market_type: Keyword.get(opts, :market_type, "spot"),
        limit_price: price,
        grid_level: Keyword.get(opts, :grid_level),
        client_order_id: Keyword.get(opts, :client_order_id)
      }
    }

    case Repo.insert(Order.changeset(%Order{}, order_attrs)) do
      {:ok, order} ->
        broadcast({:order_created, order})
        broadcast_bot(order.bot_id, {:order_created, order})

        exchange_result = Executor.place_limit_order(
          credential_id, symbol, side, quantity, price, opts
        )

        finalize_order(order, exchange_result)

      {:error, changeset} ->
        Logger.error("OrderManager: failed to insert limit order: #{inspect(changeset.errors)}")
        Executor.place_limit_order(credential_id, symbol, side, quantity, price, opts)
    end
  end

  @doc "Cancel an order with tracking"
  def cancel_order(credential_id, symbol, order_id, opts \\ []) do
    Executor.cancel_order(credential_id, symbol, order_id, opts)
  end

  @doc "Get open orders for a symbol"
  def get_open_orders(credential_id, symbol, opts \\ []) do
    Executor.get_open_orders(credential_id, symbol, opts)
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

    # Capture expected price for slippage tracking
    expected_price = Keyword.get(opts, :expected_price) || fetch_current_price(credential_id, symbol, opts)

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
        confidence: Keyword.get(opts, :confidence),
        expected_price: expected_price
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

    # Calculate slippage in basis points
    expected_price = deep_get(order.metadata || %{}, ["expected_price"])
    slippage_bps = compute_slippage_bps(expected_price, executed_price)

    # Merge slippage data into metadata
    slippage_meta = if slippage_bps do
      %{"slippage_bps" => slippage_bps, "expected_price" => expected_price}
    else
      %{}
    end

    # Detect partial fills: if executed_qty < order.quantity, mark as partially_filled
    order_qty = safe_decimal_to_float(order.quantity)
    status = if executed_qty > 0 and executed_qty < order_qty * 0.99 do
      "partially_filled"
    else
      "filled"
    end

    remaining = if status == "partially_filled", do: to_decimal(order_qty - executed_qty), else: Decimal.new(0)

    update_attrs = %{
      status: status,
      execution_price: to_decimal(executed_price),
      filled_quantity: to_decimal(executed_qty),
      remaining_quantity: remaining,
      execution_time: now,
      first_fill_at: now,
      exchange_order_id: to_string(exchange_order_id || ""),
      exchange_response: sanitize_exchange_response(result),
      metadata: Map.merge(order.metadata || %{}, slippage_meta)
    }

    case Repo.update(Order.changeset(order, update_attrs)) do
      {:ok, filled_order} ->
        # Record fill in trading.fills table
        record_fill(filled_order, executed_price, executed_qty, exchange_order_id, result)

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

  defp record_fill(order, executed_price, executed_qty, exchange_order_id, result) do
    action = deep_get(order.metadata || %{}, ["action"]) || order.side

    fill_attrs = %{
      transaction_type: "trade",
      symbol: order.symbol,
      direction: order.side,
      action: action,
      quantity: to_decimal(executed_qty),
      price: to_decimal(executed_price),
      amount: to_decimal((executed_qty || 0) * (executed_price || 0)),
      order_id: to_string(exchange_order_id || ""),
      status: "completed",
      executed_at: DateTime.utc_now(),
      exchange: "binance",
      user_id: order.user_id,
      position_id: order.position_id,
      fee_amount: to_decimal(result[:commission] || result[:fee] || 0),
      fee_asset: result[:commission_asset] || result[:fee_asset],
      description: "#{action} #{order.symbol} qty=#{executed_qty}"
    }

    # Also set entry_price for exit fills (enables P&L calc in Transaction schema)
    fill_attrs = if action in ["close_long", "close_short", "exit"] do
      entry_price = deep_get(order.metadata || %{}, ["entry_price"])
      Map.put(fill_attrs, :entry_price, to_decimal(entry_price))
    else
      fill_attrs
    end

    case Repo.insert(Transaction.changeset(%Transaction{}, fill_attrs)) do
      {:ok, fill} ->
        Phoenix.PubSub.broadcast(@pubsub, "fills:updates", {:fill_recorded, fill})
      {:error, err} ->
        Logger.warning("OrderManager: failed to record fill: #{inspect(err)}")
    end
  rescue
    e -> Logger.warning("OrderManager: fill record error: #{Exception.message(e)}")
  end

  defp safe_decimal_to_float(nil), do: 0.0
  defp safe_decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp safe_decimal_to_float(n) when is_number(n), do: n * 1.0
  defp safe_decimal_to_float(_), do: 0.0

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

  defp fetch_current_price(credential_id, symbol, opts) do
    market_type = Keyword.get(opts, :market_type, "spot")

    # Try ETS cache first (fastest)
    cached = try do
      norm = symbol |> String.split(":") |> List.first() |> String.replace("/", "") |> String.upcase()
      case :ets.lookup(:binance_ticker_cache, norm) do
        [{_, %{last_price: p}}] when is_number(p) -> p
        [{_, %{"last_price" => p}}] when is_number(p) -> p
        _ -> nil
      end
    rescue
      _ -> nil
    end

    if cached do
      cached
    else
      case Executor.get_price(credential_id, symbol, market_type: market_type) do
        {:ok, price} when is_number(price) -> price * 1.0
        {:ok, %Decimal{} = d} -> Decimal.to_float(d)
        _ -> nil
      end
    end
  rescue
    _ -> nil
  end

  defp compute_slippage_bps(nil, _), do: nil
  defp compute_slippage_bps(_, nil), do: nil
  defp compute_slippage_bps(expected, actual) do
    exp = to_float(expected)
    act = to_float(actual)

    if exp > 0 and act > 0 do
      Float.round(abs(act - exp) / exp * 10_000, 2)
    end
  rescue
    _ -> nil
  end

  defp to_float(n) when is_float(n), do: n
  defp to_float(n) when is_integer(n), do: n * 1.0
  defp to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp to_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  defp to_float(_), do: 0.0

  defp deep_get(map, [key]) when is_map(map), do: Map.get(map, key)
  defp deep_get(map, [key | rest]) when is_map(map), do: deep_get(Map.get(map, key, %{}), rest)
  defp deep_get(_, _), do: nil
end
