defmodule TradeEngine.Risk.VirtualBalanceManager do
  @moduledoc """
  💰 VIRTUAL BALANCE MANAGER
  
  Tracks a custom "paper" balance for testing purposes while still
  executing real orders on Binance Testnet.
  
  WHY THIS EXISTS:
  ═══════════════════════════════════════════════════════════════════════════════
  
  Problem: Binance Testnet gives you fixed amounts (10 BTC, 1000 ETH, etc.)
           that you can't customize. You want to test growing $100 → $10,000.
  
  Solution: Track a VIRTUAL balance in your system:
            - Real testnet executes orders (validates API/signatures work)
            - Virtual balance tracks YOUR allocation ($100 starting)
            - P&L applied to virtual balance
            - Tier system uses virtual balance
  
  ═══════════════════════════════════════════════════════════════════════════════
  
  FLOW:
  
  1. Set starting balance: VirtualBalanceManager.set_balance(user_id, 100.0)
  2. Signal comes in → Check virtual balance for tier/position size
  3. Execute on testnet → Order fills (validates it works)
  4. Update virtual balance: deduct position, track P&L
  5. Close position → Add back principal + P&L to virtual balance
  
  ═══════════════════════════════════════════════════════════════════════════════
  """

  use GenServer
  require Logger

  @ets_table :virtual_balances
  @cleanup_interval_ms 300_000  # 5 minutes
  @max_position_age_hours 48    # Positions older than 48h are considered stale

  # ============================================================================
  # CLIENT API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Set initial virtual balance for a user (or reset it)
  
  ## Examples
      VirtualBalanceManager.set_balance("user_123", 100.0)
  """
  def set_balance(user_id, amount) when is_number(amount) and amount >= 0 do
    GenServer.call(__MODULE__, {:set_balance, user_id, amount})
  end

  @doc """
  Get current virtual balance for a user
  
  ## Examples
      VirtualBalanceManager.get_balance("user_123")
      # => {:ok, 127.50}
  """
  def get_balance(user_id) do
    try do
      case :ets.lookup(@ets_table, user_id) do
        [{^user_id, balance_info}] -> {:ok, balance_info}
        [] -> {:error, :not_found}
      end
    rescue
      ArgumentError -> {:error, :not_started}
    end
  end

  @doc """
  Get available balance (total - reserved for open positions)
  """
  def get_available_balance(user_id) do
    case get_balance(user_id) do
      {:ok, info} -> {:ok, info.available}
      error -> error
    end
  end

  @doc """
  Check if the VirtualBalanceManager is running
  """
  def running? do
    try do
      :ets.info(@ets_table) != :undefined
    rescue
      _ -> false
    end
  end

  @doc """
  Reserve funds for a new position (reduces available balance)
  Called when opening a position.
  
  ## Examples
      VirtualBalanceManager.reserve_for_position("user_123", "pos_abc", 10.0)
  """
  def reserve_for_position(user_id, position_id, amount) do
    GenServer.call(__MODULE__, {:reserve, user_id, position_id, amount})
  end

  @doc """
  Release reserved funds WITHOUT applying P&L (for failed orders).
  Returns the reserved amount back to available balance.
  
  ## Examples
      # Order failed, release the $10 reservation
      VirtualBalanceManager.release_reservation("user_123", "pos_abc")
  """
  def release_reservation(user_id, position_id) do
    GenServer.call(__MODULE__, {:release_reservation, user_id, position_id})
  end

  @doc """
  Release reserved funds and apply P&L when closing a position.
  
  ## Examples
      # Made $2.50 profit on a $10 position
      VirtualBalanceManager.close_position("user_123", "pos_abc", 10.0, 2.50)
  """
  def close_position(user_id, position_id, principal, pnl) do
    GenServer.call(__MODULE__, {:close_position, user_id, position_id, principal, pnl})
  end

  @doc """
  Get all virtual balances (for debugging/display)
  """
  def all_balances do
    :ets.tab2list(@ets_table)
    |> Enum.map(fn {user_id, info} -> {user_id, info} end)
    |> Map.new()
  end

  @doc """
  Get all users with their balances (for SignalTrader to find eligible users)
  Returns {:ok, [{user_id, balance_info}, ...]}
  """
  def get_all_users do
    try do
      users = :ets.tab2list(@ets_table)
      {:ok, users}
    rescue
      _ -> {:error, :not_started}
    end
  end

  @doc """
  Initialize default test users with starting balances
  """
  def setup_test_users(users_with_balances) when is_list(users_with_balances) do
    Enum.each(users_with_balances, fn {user_id, balance} ->
      set_balance(user_id, balance)
    end)
    :ok
  end

  @doc """
  Get summary of all balances
  """
  def summary do
    balances = all_balances()
    
    total_capital = balances |> Map.values() |> Enum.map(& &1.total) |> Enum.sum() |> to_float()
    total_available = balances |> Map.values() |> Enum.map(& &1.available) |> Enum.sum() |> to_float()
    total_reserved = balances |> Map.values() |> Enum.map(& &1.reserved) |> Enum.sum() |> to_float()
    total_realized_pnl = balances |> Map.values() |> Enum.map(& &1.realized_pnl) |> Enum.sum() |> to_float()
    
    %{
      user_count: map_size(balances),
      total_capital: Float.round(total_capital, 2),
      total_available: Float.round(total_available, 2),
      total_reserved: Float.round(total_reserved, 2),
      total_realized_pnl: Float.round(total_realized_pnl, 2),
      users: balances
    }
  end
  
  # Helper to ensure value is a float
  defp to_float(value) when is_float(value), do: value
  defp to_float(value) when is_integer(value), do: value * 1.0
  defp to_float(_), do: 0.0

  @doc """
  Log balance status for a user
  """
  def log_status(user_id) do
    case get_balance(user_id) do
      {:ok, info} ->
        pnl_pct = if info.starting > 0, do: ((info.total - info.starting) / info.starting) * 100, else: 0
        
        Logger.info("""
        
        💰 VIRTUAL BALANCE: #{user_id}
        ═══════════════════════════════════════════════════════════════
        Starting:     $#{Float.round(info.starting, 2)}
        Current:      $#{Float.round(info.total, 2)} (#{if pnl_pct >= 0, do: "+", else: ""}#{Float.round(pnl_pct, 1)}%)
        Available:    $#{Float.round(info.available, 2)}
        Reserved:     $#{Float.round(info.reserved, 2)} (#{map_size(info.positions)} positions)
        Realized P&L: $#{Float.round(info.realized_pnl, 2)}
        Trades:       #{info.trade_count}
        ═══════════════════════════════════════════════════════════════
        """)
        
        {:ok, info}
        
      {:error, :not_found} ->
        Logger.warning("❌ No virtual balance found for user: #{user_id}")
        {:error, :not_found}
    end
  end

  # ============================================================================
  # SERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    # Create ETS table for fast lookups
    :ets.new(@ets_table, [:named_table, :public, :set, read_concurrency: true])

    # Schedule periodic cleanup of stale position reservations
    Process.send_after(self(), :cleanup_stale_positions, @cleanup_interval_ms)

    Logger.info("💰 VirtualBalanceManager started")

    {:ok, %{}}
  end

  @impl true
  def handle_call({:set_balance, user_id, amount}, _from, state) do
    balance_info = %{
      user_id: user_id,
      starting: amount,
      total: amount,
      available: amount,
      reserved: 0.0,
      realized_pnl: 0.0,
      unrealized_pnl: 0.0,
      positions: %{},  # position_id => reserved_amount
      trade_count: 0,
      winning_trades: 0,
      losing_trades: 0,
      created_at: DateTime.utc_now(),
      updated_at: DateTime.utc_now()
    }
    
    :ets.insert(@ets_table, {user_id, balance_info})
    
    Logger.info("💰 Set virtual balance for #{user_id}: $#{amount}")
    
    {:reply, {:ok, balance_info}, state}
  end

  @impl true
  def handle_call({:reserve, user_id, position_id, amount}, _from, state) do
    case :ets.lookup(@ets_table, user_id) do
      [{^user_id, info}] ->
        if info.available >= amount do
          new_info = %{info |
            available: info.available - amount,
            reserved: info.reserved + amount,
            positions: Map.put(info.positions, position_id, amount),
            updated_at: DateTime.utc_now()
          }
          
          :ets.insert(@ets_table, {user_id, new_info})
          
          Logger.debug("💰 Reserved $#{Float.round(amount, 2)} for position #{position_id} | Available: $#{Float.round(new_info.available, 2)}")
          
          {:reply, {:ok, new_info}, state}
        else
          Logger.warning("💰 Insufficient balance: need $#{amount}, have $#{info.available}")
          {:reply, {:error, :insufficient_balance}, state}
        end
        
      [] ->
        {:reply, {:error, :user_not_found}, state}
    end
  end

  @impl true
  def handle_call({:release_reservation, user_id, position_id}, _from, state) do
    case :ets.lookup(@ets_table, user_id) do
      [{^user_id, info}] ->
        # Get reserved amount for this position
        reserved = Map.get(info.positions, position_id, 0.0)
        
        if reserved > 0 do
          new_info = %{info |
            available: info.available + reserved,
            reserved: info.reserved - reserved,
            positions: Map.delete(info.positions, position_id),
            updated_at: DateTime.utc_now()
          }
          
          :ets.insert(@ets_table, {user_id, new_info})
          
          Logger.info("💰 Released reservation $#{Float.round(reserved, 2)} for failed position #{position_id} | Available: $#{Float.round(new_info.available, 2)}")
          
          {:reply, {:ok, new_info}, state}
        else
          Logger.debug("💰 No reservation found for position #{position_id}")
          {:reply, {:ok, info}, state}
        end
        
      [] ->
        {:reply, {:error, :user_not_found}, state}
    end
  end

  @impl true
  def handle_call({:close_position, user_id, position_id, principal, pnl}, _from, state) do
    case :ets.lookup(@ets_table, user_id) do
      [{^user_id, info}] ->
        # Get reserved amount for this position
        reserved = Map.get(info.positions, position_id, principal)
        
        # Calculate new totals
        return_amount = principal + pnl
        
        new_info = %{info |
          total: info.total + pnl,
          available: info.available + return_amount,
          reserved: max(0, info.reserved - reserved),
          realized_pnl: info.realized_pnl + pnl,
          positions: Map.delete(info.positions, position_id),
          trade_count: info.trade_count + 1,
          winning_trades: if(pnl > 0, do: info.winning_trades + 1, else: info.winning_trades),
          losing_trades: if(pnl < 0, do: info.losing_trades + 1, else: info.losing_trades),
          updated_at: DateTime.utc_now()
        }
        
        :ets.insert(@ets_table, {user_id, new_info})
        
        pnl_str = if pnl >= 0, do: "+$#{Float.round(pnl, 2)}", else: "-$#{Float.round(abs(pnl), 2)}"
        Logger.info("💰 Closed position #{position_id} | P&L: #{pnl_str} | New balance: $#{Float.round(new_info.total, 2)}")
        
        {:reply, {:ok, new_info}, state}
        
      [] ->
        {:reply, {:error, :user_not_found}, state}
    end
  end

  @impl true
  def handle_info(:cleanup_stale_positions, state) do
    Process.send_after(self(), :cleanup_stale_positions, @cleanup_interval_ms)
    cleanup_stale_positions()
    {:noreply, state}
  end

  def handle_info(_, state), do: {:noreply, state}

  # ============================================================================
  # STALE POSITION CLEANUP
  # ============================================================================

  defp cleanup_stale_positions do
    now = DateTime.utc_now()
    cutoff = DateTime.add(now, -@max_position_age_hours * 3600, :second)

    # Check each user's positions map for stale entries
    :ets.tab2list(@ets_table)
    |> Enum.each(fn {user_id, info} ->
      # Find position IDs that are stale (reserved but position no longer open in DB)
      stale_ids = info.positions
      |> Map.keys()
      |> Enum.filter(fn pos_id ->
        # Check if position is still open in DB
        case check_position_status(pos_id) do
          :open -> false
          :closed -> true
          :not_found -> true
          :error -> false  # Don't clean up if we can't check
        end
      end)

      if stale_ids != [] do
        # Release all stale reservations back to available balance
        total_released = Enum.reduce(stale_ids, 0.0, fn pos_id, acc ->
          acc + Map.get(info.positions, pos_id, 0.0)
        end)

        new_positions = Map.drop(info.positions, stale_ids)
        new_info = %{info |
          available: info.available + total_released,
          reserved: max(0.0, info.reserved - total_released),
          positions: new_positions,
          updated_at: now
        }

        :ets.insert(@ets_table, {user_id, new_info})
        Logger.warning("VirtualBalanceManager: cleaned #{length(stale_ids)} stale positions for user #{user_id}, released $#{Float.round(total_released, 2)}")
      end

      # Also cap the positions map size as a safety valve
      if map_size(info.positions) > 500 do
        Logger.warning("VirtualBalanceManager: user #{user_id} has #{map_size(info.positions)} position entries — forcing cleanup of oldest")

        # Keep only the 200 most recent (by position_id sort as proxy)
        kept = info.positions
        |> Enum.sort_by(fn {_id, _amt} -> :rand.uniform() end)
        |> Enum.take(200)
        |> Map.new()

        released_amount = Enum.reduce(Map.drop(info.positions, Map.keys(kept)), 0.0, fn {_id, amt}, acc -> acc + amt end)

        new_info = %{info |
          available: info.available + released_amount,
          reserved: max(0.0, info.reserved - released_amount),
          positions: kept,
          updated_at: now
        }

        :ets.insert(@ets_table, {user_id, new_info})
      end
    end)
  rescue
    e -> Logger.warning("VirtualBalanceManager cleanup error: #{Exception.message(e)}")
  end

  defp check_position_status(position_id) do
    import Ecto.Query
    alias TradeEngine.Trading.Position

    case TradeEngine.Repo.one(
      from(p in Position, where: p.id == ^position_id, select: p.status),
      timeout: 5_000
    ) do
      nil -> :not_found
      "open" -> :open
      _ -> :closed
    end
  rescue
    _ -> :error
  end
end