defmodule TradeEngine.Trading.PositionManager do
  @moduledoc """
  ═══════════════════════════════════════════════════════════════════════════════
  POSITION MANAGER v2 - AGGRESSIVE DB OPTIMIZATION
  ═══════════════════════════════════════════════════════════════════════════════
  
  PROBLEM: 31,468 positions × individual updates = DB connection exhaustion
  
  SOLUTION v2:
  1. TRUE BULK UPDATE - Single SQL statement per batch (not individual updates)
  2. HARD LIMIT - Only update 500 positions per cycle (most recent/active)
  3. LONGER INTERVAL - 60 seconds between update cycles
  4. SKIP UNCHANGED - Don't update if price hasn't moved
  5. FIRE AND FORGET - Async updates, don't block GenServer
  
  ═══════════════════════════════════════════════════════════════════════════════
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position

  @pubsub TradeEngine.PubSub

  # ═══════════════════════════════════════════════════════════════════════════════
  # AGGRESSIVE CONFIGURATION
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @update_interval_ms 60_000       # 60 seconds (was 10s, then 30s)
  @max_positions_per_cycle 500     # HARD LIMIT - only update 500 most recent
  @batch_size 50                   # Positions per SQL statement
  @batch_delay_ms 100              # Delay between batches
  @price_change_threshold 0.0001   # 0.01% - skip if price change smaller
  @db_timeout 15_000               # 15 second timeout per batch

  # ═══════════════════════════════════════════════════════════════════════════════
  # PUBLIC API
  # ═══════════════════════════════════════════════════════════════════════════════

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def get_positions do
    GenServer.call(__MODULE__, :get_positions, 10_000)
  end

  def get_stats do
    GenServer.call(__MODULE__, :get_stats, 10_000)
  end

  def force_update do
    GenServer.cast(__MODULE__, :force_update)
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # GENSERVER INIT
  # ═══════════════════════════════════════════════════════════════════════════════

  @impl true
  def init(_opts) do
    Logger.info("""
    
    📊 ═══════════════════════════════════════════════════════════════════════════════
    📊 POSITION MANAGER v2 - AGGRESSIVE DB OPTIMIZATION
    📊 ═══════════════════════════════════════════════════════════════════════════════
    📊 Update interval: #{@update_interval_ms / 1000}s
    📊 Max positions/cycle: #{@max_positions_per_cycle}
    📊 Batch size: #{@batch_size}
    📊 Price threshold: #{@price_change_threshold * 100}%
    📊 ═══════════════════════════════════════════════════════════════════════════════
    """)

    # Schedule first update
    Process.send_after(self(), :update_positions, 5_000)

    state = %{
      last_update: nil,
      update_in_progress: false,
      positions_updated: 0,
      batches_processed: 0,
      last_error: nil,
      price_cache: %{},
      total_pnl: 0.0,
      update_count: 0
    }

    {:ok, state}
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # HANDLE CALLS
  # ═══════════════════════════════════════════════════════════════════════════════

  @impl true
  def handle_call(:get_positions, _from, state) do
    # Return cached data, don't query DB
    {:reply, {:ok, state.positions_updated}, state}
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    stats = %{
      last_update: state.last_update,
      update_in_progress: state.update_in_progress,
      positions_updated: state.positions_updated,
      batches_processed: state.batches_processed,
      total_pnl: state.total_pnl,
      update_count: state.update_count,
      last_error: state.last_error
    }
    {:reply, {:ok, stats}, state}
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # HANDLE CASTS
  # ═══════════════════════════════════════════════════════════════════════════════

  @impl true
  def handle_cast(:force_update, state) do
    if not state.update_in_progress do
      send(self(), :update_positions)
    end
    {:noreply, state}
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # UPDATE POSITIONS - MAIN LOOP
  # ═══════════════════════════════════════════════════════════════════════════════

  @impl true
  def handle_info(:update_positions, state) do
    # Schedule next update first (ensures it always runs)
    Process.send_after(self(), :update_positions, @update_interval_ms)

    # Skip if already in progress (use Map.get for hot-reload safety)
    if Map.get(state, :update_in_progress, false) do
      Logger.debug("⏭️ Position update skipped - already in progress")
      {:noreply, state}
    else
      # Run update in background task to not block GenServer
      state = Map.put(state, :update_in_progress, true)
      
      Task.start(fn ->
        result = do_update_positions(state.price_cache)
        send(__MODULE__, {:update_complete, result})
      end)
      
      {:noreply, state}
    end
  end

  @impl true
  def handle_info({:update_complete, result}, state) do
    new_state = case result do
      {:ok, stats} ->
        Logger.info("✅ Position update: #{stats.updated} positions, #{stats.batches} batches, PnL: $#{Float.round(stats.pnl * 1.0, 2)}")
        
        # Broadcast update
        Phoenix.PubSub.broadcast(@pubsub, "positions:updates", {:positions_updated, stats})
        
        state
        |> Map.put(:update_in_progress, false)
        |> Map.put(:last_update, DateTime.utc_now())
        |> Map.put(:positions_updated, stats.updated)
        |> Map.put(:batches_processed, stats.batches)
        |> Map.put(:total_pnl, stats.pnl)
        |> Map.put(:update_count, Map.get(state, :update_count, 0) + 1)
        |> Map.put(:price_cache, stats.price_cache)
        |> Map.put(:last_error, nil)
        
      {:error, reason} ->
        Logger.error("❌ Position update failed: #{inspect(reason)}")
        state
        |> Map.put(:update_in_progress, false)
        |> Map.put(:last_error, reason)
    end
    
    {:noreply, new_state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ═══════════════════════════════════════════════════════════════════════════════
  # CORE UPDATE LOGIC
  # ═══════════════════════════════════════════════════════════════════════════════

  defp do_update_positions(old_price_cache) do
    try do
      # 1. Fetch LIMITED open positions (most recently updated first)
      positions = fetch_limited_positions()
      
      if Enum.empty?(positions) do
        {:ok, %{updated: 0, batches: 0, pnl: 0.0, price_cache: old_price_cache}}
      else
        # 2. Get unique symbols
        symbols = positions |> Enum.map(& &1.symbol) |> Enum.uniq()
        
        # 3. Fetch current prices (from ETS cache, no HTTP)
        prices = fetch_prices_bulk(symbols)
        
        # 4. Calculate updates (filter out unchanged prices)
        updates = calculate_updates(positions, prices, old_price_cache)
        
        # 5. Execute TRUE BULK updates
        {batches, total_pnl} = execute_bulk_updates(updates)
        
        {:ok, %{
          updated: length(updates),
          batches: batches,
          pnl: total_pnl,
          price_cache: prices
        }}
      end
    rescue
      e ->
        Logger.error("Position update exception: #{Exception.message(e)}")
        {:error, Exception.message(e)}
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # FETCH LIMITED POSITIONS
  # ═══════════════════════════════════════════════════════════════════════════════

  defp fetch_limited_positions do
    try do
      from(p in Position,
        where: p.status == "open",
        order_by: [desc: p.updated_at],
        limit: ^@max_positions_per_cycle,
        select: %{
          id: p.id,
          symbol: p.symbol,
          position_type: p.position_type,
          entry_price: p.entry_price,
          quantity: p.quantity,
          current_price: p.current_price
        }
      )
      |> Repo.all(timeout: 10_000)
    rescue
      e ->
        Logger.error("Failed to fetch positions: #{Exception.message(e)}")
        []
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # FETCH PRICES FROM ETS CACHE ONLY
  # ═══════════════════════════════════════════════════════════════════════════════

  defp fetch_prices_bulk(symbols) do
    symbols
    |> Enum.reduce(%{}, fn symbol, acc ->
      case get_cached_price(symbol) do
        {:ok, price} -> Map.put(acc, symbol, price)
        _ -> acc
      end
    end)
  end

  defp get_cached_price(symbol) do
    case :ets.lookup(:binance_ticker_cache, symbol) do
      [{^symbol, ticker}] when is_map(ticker) ->
        price = ticker[:last_price] || ticker[:price] || ticker["price"]
        if price, do: {:ok, to_float(price)}, else: :error
      _ -> :error
    end
  rescue
    _ -> :error
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # CALCULATE UPDATES - SKIP UNCHANGED
  # ═══════════════════════════════════════════════════════════════════════════════

  defp calculate_updates(positions, prices, old_cache) do
    now = DateTime.utc_now()
    
    positions
    |> Enum.filter(fn pos ->
      # Only include if we have a price AND price has changed significantly
      case Map.get(prices, pos.symbol) do
        nil -> false
        new_price ->
          old_price = Map.get(old_cache, pos.symbol, 0)
          price_changed?(old_price, new_price)
      end
    end)
    |> Enum.map(fn pos ->
      price = Map.get(prices, pos.symbol)
      pnl = calculate_pnl(pos, price)
      
      %{
        id: pos.id,
        current_price: price,
        unrealized_pnl: pnl,
        updated_at: now
      }
    end)
  end

  defp price_changed?(old_price, new_price) when old_price == 0, do: true
  defp price_changed?(old_price, new_price) do
    change_pct = abs(new_price - old_price) / old_price
    change_pct >= @price_change_threshold
  end

  defp calculate_pnl(pos, current_price) do
    entry = to_float(pos.entry_price) || 0
    qty = to_float(pos.quantity) || 0
    
    case pos.position_type do
      "long" -> (current_price - entry) * qty
      "short" -> (entry - current_price) * qty
      _ -> 0.0
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # TRUE BULK UPDATE - SINGLE SQL PER BATCH
  # ═══════════════════════════════════════════════════════════════════════════════

  defp execute_bulk_updates([]), do: {0, 0.0}
  defp execute_bulk_updates(updates) do
    updates
    |> Enum.chunk_every(@batch_size)
    |> Enum.reduce({0, 0.0}, fn batch, {batch_count, total_pnl} ->
      batch_pnl = execute_single_bulk_update(batch)
      
      # Delay between batches
      Process.sleep(@batch_delay_ms)
      
      {batch_count + 1, total_pnl + batch_pnl}
    end)
  end

  # This is the KEY optimization - ONE SQL statement for entire batch
  defp execute_single_bulk_update(batch) do
    try do
      # Build a single UPDATE with CASE WHEN for all positions
      ids = Enum.map(batch, & &1.id)
      now = DateTime.utc_now()
      
      # Use Ecto's update_all with dynamic values
      # This generates: UPDATE positions SET current_price = CASE WHEN id = x THEN y ... END
      
      price_cases = batch
      |> Enum.map(fn u -> {u.id, u.current_price} end)
      |> Map.new()
      
      pnl_cases = batch
      |> Enum.map(fn u -> {u.id, u.unrealized_pnl} end)
      |> Map.new()

      # For simplicity, do a multi-row update using VALUES
      # This is PostgreSQL-specific but very efficient
      sql = build_bulk_update_sql(batch)
      
      case Ecto.Adapters.SQL.query(Repo, sql, [], timeout: @db_timeout) do
        {:ok, _result} ->
          Enum.reduce(batch, 0.0, fn u, acc -> acc + (u.unrealized_pnl || 0) end)
        {:error, reason} ->
          Logger.warning("Bulk update failed: #{inspect(reason)}")
          0.0
      end
    rescue
      e ->
        Logger.warning("Bulk update exception: #{Exception.message(e)}")
        0.0
    end
  end

  # Build efficient PostgreSQL bulk update
  defp build_bulk_update_sql(batch) do
    now = DateTime.utc_now() |> DateTime.to_iso8601()
    
    values = batch
    |> Enum.map(fn u ->
      id = if is_binary(u.id), do: "'#{u.id}'", else: "'#{u.id}'"
      price = u.current_price || 0.0
      pnl = u.unrealized_pnl || 0.0
      "(#{id}::uuid, #{price}::decimal, #{pnl}::decimal)"
    end)
    |> Enum.join(",\n")
    
    """
    UPDATE trading.positions AS p
    SET
      current_price = v.price,
      unrealized_pnl_usd = v.pnl,
      updated_at = '#{now}'::timestamp
    FROM (VALUES
      #{values}
    ) AS v(id, price, pnl)
    WHERE p.id = v.id
    """
  end

  # ═══════════════════════════════════════════════════════════════════════════════
  # HELPERS
  # ═══════════════════════════════════════════════════════════════════════════════

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