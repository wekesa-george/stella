defmodule TradeEngine.API.Enrichment do
  @moduledoc """
  📊 DATA ENRICHMENT

  Transforms raw Ecto schemas and GenServer state into the full
  dashboard-ready format with every field the UI needs.
  """

  require Logger
  import Ecto.Query
  alias TradeEngine.Repo

  # ============================================================================
  # BOT ENRICHMENT
  # ============================================================================

  @doc """
  Enrich a bot with all dashboard fields.

  Returns:
    %{
      bot_id, bot_name, owner_email, strategy_type, exchange,
      trading_pairs, status, pnl, pnl_pct, total_equity,
      open_positions_count, total_trades, win_rate,
      uptime_duration, cpu_utilization, ram_utilization,
      last_heartbeat
    }
  """
  def enrich_bot(runtime_bot) do
    # Get owner email
    email = get_user_email(runtime_bot.user_id)

    # Resolve strategy name & type from strategy table
    strategy_id = Map.get(runtime_bot, :strategy_id)
    {strategy_name, strategy_type} = resolve_strategy_info(strategy_id)

    # Resolve exchange name from credential → adapter
    credential_id = Map.get(runtime_bot, :credential_id)
    exchange_name = resolve_exchange_name(credential_id)

    # Resolve owner display name (user email or service account name)
    sa_id = Map.get(runtime_bot, :service_account_id)
    sa_name = resolve_service_account_name(sa_id)
    owner_name = email || sa_name

    Logger.info("📊 enrich_bot #{runtime_bot.id}: strategy_id=#{inspect(strategy_id)} → strategy=#{inspect(strategy_name)}/#{inspect(strategy_type)}, credential_id=#{inspect(credential_id)} → exchange=#{inspect(exchange_name)}, user_id=#{inspect(runtime_bot.user_id)} → email=#{inspect(email)}, sa_id=#{inspect(sa_id)} → sa_name=#{inspect(sa_name)}, owner_name=#{inspect(owner_name)}")

    uptime = if runtime_bot[:started_at] && runtime_bot.status == "running" do
      DateTime.diff(DateTime.utc_now(), runtime_bot.started_at)
    else
      0
    end

    win_rate = if runtime_bot.total_trades > 0 do
      Float.round(runtime_bot.winning_trades / runtime_bot.total_trades * 100, 1)
    else
      0.0
    end

    pnl_pct = if runtime_bot.active_capital > 0 do
      Float.round(runtime_bot.total_pnl / runtime_bot.active_capital * 100, 2)
    else
      0.0
    end

    sys = TradeEngine.Bots.BotRegistry.get_system_metrics()

    %{
      bot_id: runtime_bot.id,
      bot_name: runtime_bot.name,
      owner_user_id: runtime_bot.user_id,
      owner_email: email,
      owner_name: owner_name,
      strategy: strategy_name,
      strategy_type: strategy_type || Map.get(runtime_bot, :strategy_type),
      strategy_id: Map.get(runtime_bot, :strategy_id),
      exchange: exchange_name || Map.get(runtime_bot, :exchange),
      credential_id: Map.get(runtime_bot, :credential_id),
      service_account_id: Map.get(runtime_bot, :service_account_id),
      trading_pairs: runtime_bot.trading_pairs,
      status: runtime_bot.status,
      pnl: Float.round(runtime_bot.total_pnl + 0.0, 2),
      pnl_pct: pnl_pct,
      total_equity: Float.round((runtime_bot.active_capital + runtime_bot.total_pnl) + 0.0, 2),
      open_positions_count: runtime_bot[:open_positions] || 0,
      total_trades: runtime_bot.total_trades,
      winning_trades: runtime_bot.winning_trades,
      losing_trades: runtime_bot.losing_trades,
      win_rate: win_rate,
      uptime_seconds: uptime,
      uptime_formatted: format_duration(uptime),
      cpu_utilization: sys.cpu_pct,
      ram_utilization_mb: sys.ram_total_mb,
      last_heartbeat: runtime_bot.last_heartbeat,
      last_trade_at: runtime_bot[:last_trade_at],
      last_error: runtime_bot[:last_error],
      error_count: runtime_bot[:error_count] || 0,
      allocated_capital: runtime_bot.allocated_capital,
      active_capital: runtime_bot.active_capital,
      created_at: runtime_bot[:created_at],
      config: runtime_bot[:config] || %{},
      market_type: runtime_bot[:market_type] || "spot",
      init_step: runtime_bot[:init_step]
    }
  end

  # ============================================================================
  # POSITION ENRICHMENT
  # ============================================================================

  @doc """
  Enrich a position (DB or state) with all dashboard fields.

  Returns:
    %{
      position_id, trading_pair, side, entry_price,
      current_price, position_size, unrealized_pnl,
      unrealized_pnl_pct, position_age_seconds,
      bot_id, bot_name, strategy_name,
      physics_data, stop_loss, take_profit
    }
  """
  def enrich_position(position, opts \\ []) do
    price_cache = Keyword.get(opts, :price_cache, %{})
    bot_names = Keyword.get(opts, :bot_names, %{})

    # Get current price from cache, position, or fetch
    current_price = resolve_current_price(position, price_cache)

    # Determine side
    side = resolve_side(position)

    # Entry price
    entry_price = resolve_decimal(position, [:entry_price])

    # Quantity
    quantity = resolve_decimal(position, [:quantity])

    # Calculate unrealized PnL
    {unrealized_pnl, unrealized_pnl_pct} = calculate_unrealized(
      side, entry_price, current_price, quantity
    )

    # Position age
    entry_time = position[:entry_time] || position[:opened_at] || position[:created_at]
    age_seconds = if entry_time do
      case entry_time do
        %DateTime{} -> DateTime.diff(DateTime.utc_now(), entry_time)
        %NaiveDateTime{} ->
          DateTime.diff(DateTime.utc_now(), DateTime.from_naive!(entry_time, "Etc/UTC"))
        _ -> 0
      end
    else
      0
    end

    # Bot info
    bot_id = position[:bot_id]
    bot_name = Map.get(bot_names, bot_id, "Unassigned")

    # Strategy
    strategy_name = position[:strategy_type] || resolve_strategy(position)

    # Physics data
    physics = extract_physics(position)

    %{
      position_id: position[:id],
      trading_pair: position[:symbol],
      side: side,
      entry_price: entry_price,
      current_price: current_price,
      position_size: quantity,
      position_value: Float.round(quantity * current_price, 2),
      unrealized_pnl: Float.round(unrealized_pnl, 4),
      unrealized_pnl_pct: Float.round(unrealized_pnl_pct, 2),
      position_age_seconds: age_seconds,
      position_age_formatted: format_duration(age_seconds),
      bot_id: bot_id,
      bot_name: bot_name,
      strategy_name: strategy_name,
      user_id: position[:user_id],
      status: to_string(position[:status] || "open"),
      exit_reason: position[:exit_reason],
      stop_loss: position[:stop_loss],
      take_profit: position[:impulse_target] || position[:take_profit],
      exchange_order_id: position[:exchange_order_id],
      physics_data: physics,
      entry_time: entry_time,
      exit_time: position[:exit_time],
      realized_pnl: resolve_decimal(position, [:profit_loss, :realized_pnl])
    }
  end

  @doc "Enrich a list of positions"
  def enrich_positions(positions, opts \\ []) do
    # Build bot name lookup
    bot_names = build_bot_names()
    opts = Keyword.put(opts, :bot_names, bot_names)

    Enum.map(positions, &enrich_position(&1, opts))
  end

  # ============================================================================
  # ORDER ENRICHMENT
  # ============================================================================

  @doc """
  Enrich an order with all dashboard fields.

  Returns:
    %{
      order_id, timestamp, bot_id, bot_name,
      exchange, trading_pair, side, order_size,
      order_price, order_status, order_type, fill_status
    }
  """
  def enrich_order(order, opts \\ []) do
    bot_names = Keyword.get(opts, :bot_names, %{})

    bot_id = get_field(order, :bot_id)
    bot_name = Map.get(bot_names, bot_id, "Unassigned")

    filled_qty = resolve_decimal(order, [:filled_quantity])
    total_qty = resolve_decimal(order, [:quantity])

    fill_status = cond do
      get_field(order, :status) == "filled" -> "fully_filled"
      filled_qty > 0 and filled_qty < total_qty -> "partially_filled"
      filled_qty > 0 -> "fully_filled"
      get_field(order, :status) == "cancelled" -> "cancelled"
      get_field(order, :status) == "rejected" -> "rejected"
      true -> "unfilled"
    end

    %{
      order_id: get_field(order, :id),
      timestamp: get_field(order, :created_at) || get_field(order, :execution_time),
      bot_id: bot_id,
      bot_name: bot_name,
      exchange: get_field(order, :exchange_name) || "binance_testnet",
      trading_pair: get_field(order, :symbol),
      side: String.upcase(to_string(get_field(order, :side) || "")),
      order_size: total_qty,
      order_price: resolve_decimal(order, [:price]),
      execution_price: resolve_decimal(order, [:execution_price]),
      order_status: get_field(order, :status),
      order_type: String.upcase(to_string(get_field(order, :order_type) || "MARKET")),
      fill_status: fill_status,
      filled_quantity: filled_qty,
      exchange_order_id: get_field(order, :exchange_order_id),
      time_in_force: get_field(order, :time_in_force) || "GTC",
      position_id: get_field(order, :position_id),
      user_id: get_field(order, :user_id),
      submitted_at: get_field(order, :submitted_at),
      first_fill_at: get_field(order, :first_fill_at),
      completed_at: get_field(order, :execution_time)
    }
  end

  @doc "Enrich a list of orders"
  def enrich_orders(orders, opts \\ []) do
    bot_names = build_bot_names()
    opts = Keyword.put(opts, :bot_names, bot_names)
    Enum.map(orders, &enrich_order(&1, opts))
  end

  # ============================================================================
  # TRANSACTION ENRICHMENT (for order history when orders table is sparse)
  # ============================================================================

  @doc """
  Convert transactions to enriched order-like records.
  Useful since real trades are logged in transactions.
  """
  def transactions_as_orders(user_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 100)
    bot_names = build_bot_names()

    try do
      Repo.all(
        from t in TradeEngine.Trading.Transaction,
          where: t.user_id == ^user_id and
                 t.transaction_type in [
                   "spot_buy", "spot_sell", "futures_short", "futures_cover",
                   "trade_buy", "trade_sell", "margin_short", "margin_cover",
                   "simulated_short", "simulated_cover"
                 ],
          order_by: [desc: t.created_at],
          limit: ^limit
      )
      |> Enum.map(fn txn ->
        %{
          order_id: txn.id,
          timestamp: txn.executed_at || txn.created_at,
          bot_id: txn[:bot_id],
          bot_name: Map.get(bot_names, txn[:bot_id], "Unassigned"),
          exchange: txn.exchange || "binance_testnet",
          trading_pair: txn.symbol,
          side: transaction_to_side(txn.transaction_type),
          order_size: safe_float(txn.quantity),
          order_price: safe_float(txn.price),
          execution_price: safe_float(txn.price),
          order_status: txn.status,
          order_type: "MARKET",
          fill_status: if(txn.status in ["completed", "filled"], do: "fully_filled", else: txn.status),
          filled_quantity: safe_float(txn.quantity),
          position_id: txn.position_id,
          user_id: txn.user_id,
          pnl: safe_float(txn.pnl),
          pnl_pct: safe_float(txn.pnl_percent),
          confidence: txn.signal_confidence,
          source: "transaction"
        }
      end)
    rescue
      _ -> []
    end
  end

  # ============================================================================
  # PRIVATE HELPERS
  # ============================================================================

  defp resolve_current_price(position, price_cache) do
    # Try in order: price_cache, position.current_price, entry_price
    symbol = position[:symbol]
    cached = Map.get(price_cache, symbol)

    cond do
      cached != nil -> cached + 0.0
      position[:current_price] != nil -> safe_float(position[:current_price])
      true -> safe_float(position[:entry_price])
    end
  end

  defp resolve_side(position) do
    case position[:direction] || position[:position_type] do
      :long -> "LONG"
      :short -> "SHORT"
      "long" -> "LONG"
      "short" -> "SHORT"
      _ -> "UNKNOWN"
    end
  end

  defp resolve_decimal(map, keys) do
    Enum.reduce_while(keys, 0.0, fn key, _acc ->
      case map[key] do
        nil -> {:cont, 0.0}
        val -> {:halt, safe_float(val)}
      end
    end)
  end

  defp calculate_unrealized(side, entry, current, qty) when entry > 0 and qty > 0 do
    pnl = case side do
      "LONG" -> (current - entry) * qty
      "SHORT" -> (entry - current) * qty
      _ -> 0.0
    end
    pnl_pct = pnl / (entry * qty) * 100
    {pnl, pnl_pct}
  end
  defp calculate_unrealized(_, _, _, _), do: {0.0, 0.0}

  defp resolve_strategy(position) do
    cond do
      position[:confidence] != nil -> "impulse_scalper"
      position[:user_strategy_id] != nil -> "custom"
      true -> "impulse_scalper"
    end
  end

  defp extract_physics(position) do
    keys = [:momentum, :gravity, :peak_price, :peak_time,
            :trajectory_angle, :kinetic_energy, :energy_state,
            :impulse_target, :impulse_size]

    physics = Enum.reduce(keys, %{}, fn key, acc ->
      case position[key] do
        nil -> acc
        val -> Map.put(acc, key, safe_float_or_pass(val))
      end
    end)

    if map_size(physics) > 0, do: physics, else: nil
  end

  defp build_bot_names do
    try do
      TradeEngine.Bots.BotRegistry.list_bots()
      |> Enum.map(fn bot -> {bot.id, bot.name} end)
      |> Map.new()
    rescue
      _ -> %{}
    end
  end

  defp uuid_to_bin(str) when is_binary(str) do
    {:ok, bin} = Ecto.UUID.dump(str)
    bin
  end

  defp resolve_strategy_info(nil), do: {nil, nil}
  defp resolve_strategy_info(strategy_id) do
    case Repo.query("SELECT name, type FROM strategy.strategies WHERE id = $1 LIMIT 1", [uuid_to_bin(strategy_id)]) do
      {:ok, %{rows: [[name, type] | _]}} -> {name, type}
      other ->
        Logger.warning("resolve_strategy_info(#{inspect(strategy_id)}): #{inspect(other)}")
        {nil, nil}
    end
  rescue
    e ->
      Logger.error("resolve_strategy_info CRASH: #{Exception.message(e)}")
      {nil, nil}
  end

  defp resolve_exchange_name(nil), do: nil
  defp resolve_exchange_name(credential_id) do
    case Repo.query(
      "SELECT a.name FROM exchange.user_credentials c JOIN exchange.adapters a ON a.id = c.adapter_id WHERE c.id = $1 LIMIT 1",
      [uuid_to_bin(credential_id)]
    ) do
      {:ok, %{rows: [[name] | _]}} -> name
      other ->
        Logger.warning("resolve_exchange_name(#{inspect(credential_id)}): #{inspect(other)}")
        nil
    end
  rescue
    e ->
      Logger.error("resolve_exchange_name CRASH: #{Exception.message(e)}")
      nil
  end

  defp resolve_service_account_name(nil), do: nil
  defp resolve_service_account_name(sa_id) do
    case Repo.query("SELECT name FROM platform.service_accounts WHERE id = $1 LIMIT 1", [uuid_to_bin(sa_id)]) do
      {:ok, %{rows: [[name] | _]}} -> name
      other ->
        Logger.warning("resolve_service_account_name(#{inspect(sa_id)}): #{inspect(other)}")
        nil
    end
  rescue
    e ->
      Logger.error("resolve_service_account_name CRASH: #{Exception.message(e)}")
      nil
  end

  defp get_user_email(nil), do: nil
  defp get_user_email(user_id) do
    try do
      case Repo.one(
        from u in "users",
          where: u.id == ^user_id,
          select: u.email,
          limit: 1
      ) do
        nil -> nil
        email -> email
      end
    rescue
      _ -> nil
    end
  end

  defp get_field(map, key) when is_map(map) do
    # Works for both maps and structs
    Map.get(map, key) || Map.get(map, to_string(key))
  end

  defp transaction_to_side(type) do
    case type do
      t when t in ["spot_buy", "trade_buy", "futures_cover", "margin_cover", "simulated_cover"] -> "BUY"
      t when t in ["spot_sell", "trade_sell", "futures_short", "margin_short", "simulated_short"] -> "SELL"
      _ -> "UNKNOWN"
    end
  end

  defp safe_float(nil), do: 0.0
  defp safe_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp safe_float(n) when is_float(n), do: n
  defp safe_float(n) when is_integer(n), do: n + 0.0
  defp safe_float(_), do: 0.0

  defp safe_float_or_pass(val) when is_binary(val), do: val
  defp safe_float_or_pass(val) when is_atom(val), do: to_string(val)
  defp safe_float_or_pass(val), do: safe_float(val)

  defp format_duration(seconds) when is_integer(seconds) and seconds >= 0 do
    days = div(seconds, 86400)
    hours = div(rem(seconds, 86400), 3600)
    mins = div(rem(seconds, 3600), 60)
    secs = rem(seconds, 60)

    cond do
      days > 0 -> "#{days}d #{hours}h #{mins}m"
      hours > 0 -> "#{hours}h #{mins}m"
      mins > 0 -> "#{mins}m #{secs}s"
      true -> "#{secs}s"
    end
  end
  defp format_duration(_), do: "0s"
end
