defmodule TradeEngine.Orchestrator.MarginScalperPersistence do
  @moduledoc """
  DB persistence bridge for MarginScalper.

  Writes position open/close events and order/fill records to the trading schema
  so that PlatformStatsAggregator, SlippageMonitor, and the Mission Critical
  dashboard have real data to query.

  All writes are fire-and-forget (async Task) so they never block the trading loop.
  Failures are logged but do not affect trading.
  """

  require Logger
  alias TradeEngine.Repo
  alias TradeEngine.Trading.{Position, Order}
  import Ecto.Query

  # Resolve identifiers from env or config, cached at compile time is not safe
  # so we resolve at runtime with memoization in process dictionary.

  @doc "Persist a newly opened position to trading.positions"
  def persist_position_open(position_map) do
    Task.Supervisor.start_child(TradeEngine.TaskSupervisor, fn ->
      try do
        do_persist_open(position_map)
      rescue
        e ->
          Logger.warning("MarginScalperPersistence: failed to persist open: #{Exception.message(e)}")
      end
    end)
  end

  @doc "Persist a closed position: update position + insert exit order + exit fill"
  def persist_position_close(trade_record) do
    Task.Supervisor.start_child(TradeEngine.TaskSupervisor, fn ->
      try do
        do_persist_close(trade_record)
      rescue
        e ->
          Logger.warning("MarginScalperPersistence: failed to persist close: #{Exception.message(e)}")
      end
    end)
  end

  # ============================================================================
  # OPEN
  # ============================================================================

  defp do_persist_open(pos) do
    {user_id, credential_id, bot_id} = resolve_ids()

    side = to_string(pos.direction)
    symbol = pos.symbol
    {base, quote} = split_pair(symbol)
    order_type = if pos.order_type == :limit, do: "limit", else: "market"

    now = DateTime.utc_now()

    # 1. Insert entry order
    order_attrs = %{
      id: Ecto.UUID.generate(),
      symbol: symbol,
      side: if(side == "long", do: "buy", else: "sell"),
      order_type: order_type,
      quantity: Decimal.from_float(pos.quantity),
      price: Decimal.from_float(pos.entry_price),
      status: "filled",
      filled_quantity: Decimal.from_float(pos.quantity),
      execution_price: Decimal.from_float(pos.entry_price),
      execution_time: now,
      exchange_order_id: to_string(pos.order_id || ""),
      exchange_name: "binance",
      credential_id: credential_id,
      user_id: user_id,
      bot_id: bot_id,
      position_id: pos.id,
      base_asset: base,
      quote_asset: quote,
      leverage: Decimal.new(pos.leverage),
      is_margin: true,
      submitted_at: now,
      first_fill_at: now,
      total_fees: Decimal.from_float(pos.entry_fee || 0.0),
      fee_asset: "USDT",
      fee_usd: Decimal.from_float(pos.entry_fee || 0.0),
      metadata: %{
        "source" => "margin_scalper",
        "confidence" => pos.confidence,
        "entry_slippage" => Map.get(pos, :entry_slippage, 0),
        "entry_latency_us" => Map.get(pos, :entry_latency_us, 0),
        "expected_price" => pos.entry_price
      }
    }

    case %Order{} |> Order.changeset(order_attrs) |> Repo.insert() do
      {:ok, order} ->
        Logger.debug("MarginScalperPersistence: entry order #{order.id} saved for #{symbol}")

        # 2. Insert entry fill
        persist_fill(order, pos, user_id, now)

        # 3. Insert position
        position_attrs = %{
          id: pos.id,
          user_id: user_id,
          bot_id: bot_id,
          credential_id: credential_id,
          exchange_code: "binance",
          symbol: symbol,
          base_asset: base,
          quote_asset: quote,
          position_type: side,
          status: "open",
          entry_price: Decimal.from_float(pos.entry_price),
          current_price: Decimal.from_float(pos.entry_price),
          quantity: Decimal.from_float(pos.quantity),
          remaining_quantity: Decimal.from_float(pos.quantity),
          leverage: pos.leverage,
          unrealized_profit_loss: Decimal.new(0),
          profit_loss: Decimal.new(0),
          roi_percentage: Decimal.new(0),
          total_fees_usd: Decimal.from_float(pos.entry_fee || 0.0),
          stop_loss_price: decimal_or_nil(pos.stop_loss),
          take_profit_price: decimal_or_nil(pos.take_profit),
          liquidation_price: decimal_or_nil(pos.liquidation_price),
          margin_used_usd: Decimal.from_float(pos.margin || 0.0),
          entry_order_id: order.id,
          entry_time: pos.opened_at || now,
          highest_price: Decimal.from_float(pos.entry_price),
          lowest_price: Decimal.from_float(pos.entry_price),
          metadata: %{
            "source" => "margin_scalper",
            "confidence" => pos.confidence,
            "notional" => pos.notional,
            "fee_floor" => Map.get(pos, :fee_floor, 0)
          }
        }

        case %Position{} |> Position.changeset(position_attrs) |> Repo.insert() do
          {:ok, _} ->
            Logger.debug("MarginScalperPersistence: position #{pos.id} saved for #{symbol}")
          {:error, cs} ->
            Logger.warning("MarginScalperPersistence: position insert failed: #{inspect(cs.errors)}")
        end

      {:error, cs} ->
        Logger.warning("MarginScalperPersistence: entry order insert failed: #{inspect(cs.errors)}")
    end
  end

  # ============================================================================
  # CLOSE
  # ============================================================================

  defp do_persist_close(trade) do
    {user_id, credential_id, bot_id} = resolve_ids()

    side = to_string(trade.direction)
    symbol = trade.symbol
    {base, quote} = split_pair(symbol)
    now = DateTime.utc_now()
    exit_price = trade.exit_price || trade.entry_price
    close_fee = Map.get(trade, :close_fee, 0.0)
    pnl = Map.get(trade, :pnl, 0.0)
    pnl_pct = Map.get(trade, :pnl_pct, 0.0)
    hold_time = Map.get(trade, :hold_time, 0)
    exit_reason = to_string(Map.get(trade, :exit_reason, "unknown"))

    # 1. Insert exit order
    order_attrs = %{
      id: Ecto.UUID.generate(),
      symbol: symbol,
      side: if(side == "long", do: "sell", else: "buy"),
      order_type: "market",
      quantity: Decimal.from_float(trade.quantity),
      price: Decimal.from_float(exit_price),
      status: "filled",
      filled_quantity: Decimal.from_float(trade.quantity),
      execution_price: Decimal.from_float(exit_price),
      execution_time: now,
      exchange_name: "binance",
      credential_id: credential_id,
      user_id: user_id,
      bot_id: bot_id,
      position_id: trade.id,
      base_asset: base,
      quote_asset: quote,
      leverage: Decimal.new(trade.leverage),
      is_margin: true,
      submitted_at: now,
      first_fill_at: now,
      total_fees: Decimal.from_float(close_fee),
      fee_asset: "USDT",
      fee_usd: Decimal.from_float(close_fee),
      metadata: %{
        "source" => "margin_scalper",
        "exit_reason" => exit_reason,
        "exit_slippage" => Map.get(trade, :exit_slippage, 0),
        "expected_price" => exit_price
      }
    }

    exit_order_id =
      case %Order{} |> Order.changeset(order_attrs) |> Repo.insert() do
        {:ok, order} ->
          Logger.debug("MarginScalperPersistence: exit order #{order.id} saved for #{symbol}")
          # Insert exit fill
          persist_fill(order, trade, user_id, now)
          order.id
        {:error, cs} ->
          Logger.warning("MarginScalperPersistence: exit order insert failed: #{inspect(cs.errors)}")
          nil
      end

    # 2. Update position to closed
    total_fees = (Map.get(trade, :fee, 0.0) || 0.0) + (close_fee || 0.0)

    update_query =
      from(p in Position,
        where: p.id == ^trade.id
      )

    updates = [
      status: "closed",
      exit_price: Decimal.from_float(exit_price),
      profit_loss: Decimal.from_float(pnl),
      roi_percentage: Decimal.from_float(pnl_pct),
      total_fees_usd: Decimal.from_float(total_fees),
      exit_time: trade.closed_at || now,
      hold_duration_sec: hold_time,
      exit_reason: exit_reason,
      highest_price: decimal_or_nil(Map.get(trade, :highest_price)),
      lowest_price: decimal_or_nil(Map.get(trade, :lowest_price)),
      exit_order_id: exit_order_id,
      metadata: %{
        "source" => "margin_scalper",
        "peak_profit" => Map.get(trade, :peak_profit, 0),
        "locked_profit" => Map.get(trade, :locked_profit, 0),
        "total_slippage" => Map.get(trade, :total_slippage, 0)
      }
    ]

    case Repo.update_all(update_query, set: updates) do
      {1, _} ->
        Logger.debug("MarginScalperPersistence: position #{trade.id} closed in DB (PnL: $#{Float.round(pnl, 2)})")
      {0, _} ->
        Logger.warning("MarginScalperPersistence: position #{trade.id} not found in DB for close update")
      error ->
        Logger.warning("MarginScalperPersistence: position close update failed: #{inspect(error)}")
    end
  end

  # ============================================================================
  # FILL RECORDING
  # ============================================================================

  defp persist_fill(order, pos_or_trade, user_id, now) do
    price = safe_to_float(order.execution_price)
    qty = pos_or_trade.quantity || 0.0
    notional = price * qty
    fee = Map.get(pos_or_trade, :entry_fee) || Map.get(pos_or_trade, :close_fee) || 0.0

    fill_id = Ecto.UUID.generate()

    Repo.query!(
      """
      INSERT INTO trading.fills
        (id, order_id, user_id, fill_price, fill_quantity, fill_value_usd,
         fee_amount, fee_asset, fee_usd, is_maker, filled_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      """,
      [
        fill_id,
        order.id,
        user_id,
        Decimal.from_float(price),
        Decimal.from_float(qty),
        Decimal.from_float(notional),
        Decimal.from_float(fee),
        "USDT",
        Decimal.from_float(fee),
        Map.get(pos_or_trade, :order_type) == :limit,
        now,
        now
      ]
    )

    Logger.debug("MarginScalperPersistence: fill #{fill_id} saved")
  rescue
    e ->
      Logger.warning("MarginScalperPersistence: fill insert failed: #{Exception.message(e)}")
  end

  # ============================================================================
  # HELPERS
  # ============================================================================

  defp resolve_ids do
    # Cache in process dictionary for the lifetime of the Task
    case Process.get(:ms_persistence_ids) do
      {_, _, _} = ids -> ids
      _ ->
        user_id = resolve_user_id()
        credential_id = resolve_credential_id()
        bot_id = resolve_bot_id()
        ids = {user_id, credential_id, bot_id}
        Process.put(:ms_persistence_ids, ids)
        ids
    end
  end

  defp resolve_user_id do
    # Try env var first, then fall back to first active user in DB
    case System.get_env("MARGIN_SCALPER_USER_ID") do
      nil ->
        case Repo.one(from u in "users", prefix: "auth", where: u.status == "active", select: u.id, limit: 1) do
          nil ->
            Logger.warning("MarginScalperPersistence: no active user found, using placeholder")
            Ecto.UUID.generate()
          id -> id
        end
      id -> id
    end
  end

  defp resolve_credential_id do
    case System.get_env("MARGIN_SCALPER_CREDENTIAL_ID") do
      nil ->
        # Use the Binance Sandbox credential that existing bots use
        case Repo.one(from c in "user_credentials", prefix: "exchange",
          where: c.status == "active",
          select: c.id, limit: 1) do
          nil ->
            Logger.warning("MarginScalperPersistence: no credential found, using placeholder")
            Ecto.UUID.generate()
          id -> id
        end
      id -> id
    end
  end

  defp resolve_bot_id do
    case System.get_env("MARGIN_SCALPER_BOT_ID") do
      nil -> nil
      "" -> nil
      id -> id
    end
  end

  defp split_pair(symbol) do
    cond do
      String.ends_with?(symbol, "USDT") ->
        base = String.replace_trailing(symbol, "USDT", "")
        {base, "USDT"}
      String.ends_with?(symbol, "BUSD") ->
        base = String.replace_trailing(symbol, "BUSD", "")
        {base, "BUSD"}
      true ->
        {symbol, "USDT"}
    end
  end

  defp safe_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp safe_to_float(n) when is_float(n), do: n
  defp safe_to_float(n) when is_integer(n), do: n * 1.0
  defp safe_to_float(_), do: 0.0

  defp decimal_or_nil(nil), do: nil
  defp decimal_or_nil(0), do: nil
  defp decimal_or_nil(0.0), do: nil
  defp decimal_or_nil(n) when is_float(n), do: Decimal.from_float(n)
  defp decimal_or_nil(n) when is_integer(n), do: Decimal.new(n)
  defp decimal_or_nil(%Decimal{} = d), do: d
  defp decimal_or_nil(_), do: nil
end
