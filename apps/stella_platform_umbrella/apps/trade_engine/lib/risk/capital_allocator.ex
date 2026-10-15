defmodule TradeEngine.Risk.CapitalAllocator do
  @moduledoc """
  💰 CAPITAL ALLOCATOR - Phased Capital Deployment

  PROBLEM:
  ══════════════════════════════════════════════════════════════════════════════
  You have $50,000 total capital but want to test with only $5,000 first.
  Once results prove the system works, gradually scale up.

  SOLUTION:
  ══════════════════════════════════════════════════════════════════════════════
  1. Set TOTAL capital:    $50,000 (what's in your exchange account)
  2. Set ACTIVE capital:   $5,000  (what the bot is allowed to trade with)
  3. Set scaling rules:    Auto-increase after hitting profit targets
  4. Dashboard controls:   Change allocation from sys_admin at any time

  SCALING MODES:
  ══════════════════════════════════════════════════════════════════════════════
  • manual    - Only change allocation via API/dashboard
  • milestone - Auto-scale when profit milestones are hit
  • gradual   - Increase by X% every N profitable days
  • compound  - Reinvest a % of profits into active capital

  SAFETY:
  ══════════════════════════════════════════════════════════════════════════════
  • Active capital can NEVER exceed total capital
  • Auto-scaling has a max step size (e.g., +$2,500 max per step)
  • Drawdown circuit breaker: if active capital drops X%, PAUSE scaling
  • Manual override always available from dashboard
  ══════════════════════════════════════════════════════════════════════════════
  """

  use GenServer
  require Logger

  @ets_table :capital_allocations

  # ============================================================================
  # CLIENT API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Configure capital allocation for a user.

  ## Parameters
  - user_id: User identifier
  - config: Map with allocation settings

  ## Example
      CapitalAllocator.configure("user_1", %{
        total_capital: 50_000.0,
        active_capital: 5_000.0,
        scaling_mode: :manual,
        max_step_size: 2_500.0,
        drawdown_pause_pct: 0.10,
        milestone_targets: [10, 20, 30],  # % profit to trigger scale-up
        compound_reinvest_pct: 0.50,       # reinvest 50% of profits
        gradual_increase_pct: 0.10,        # increase by 10% per step
        gradual_min_profitable_days: 5
      })
  """
  def configure(user_id, config) do
    GenServer.call(__MODULE__, {:configure, user_id, config})
  end

  @doc "Get current allocation for a user"
  def get_allocation(user_id) do
    try do
      case :ets.lookup(@ets_table, user_id) do
        [{^user_id, allocation}] -> {:ok, allocation}
        [] -> {:error, :not_configured}
      end
    rescue
      ArgumentError -> {:error, :not_started}
    end
  end

  @doc "Get the active trading capital (what the bot should use)"
  def get_active_capital(user_id) do
    case get_allocation(user_id) do
      {:ok, alloc} ->
        if alloc.paused do
          {:ok, 0.0}
        else
          {:ok, alloc.active_capital}
        end
      error -> error
    end
  end

  @doc "Get total capital (full account)"
  def get_total_capital(user_id) do
    case get_allocation(user_id) do
      {:ok, alloc} -> {:ok, alloc.total_capital}
      error -> error
    end
  end

  @doc """
  Update the active capital amount directly (manual mode or dashboard control).
  Cannot exceed total capital.
  """
  def set_active_capital(user_id, amount) when is_number(amount) and amount >= 0 do
    GenServer.call(__MODULE__, {:set_active_capital, user_id, amount})
  end

  @doc "Update total capital (e.g., after deposit/withdrawal)"
  def set_total_capital(user_id, amount) when is_number(amount) and amount >= 0 do
    GenServer.call(__MODULE__, {:set_total_capital, user_id, amount})
  end

  @doc "Change scaling mode"
  def set_scaling_mode(user_id, mode) when mode in [:manual, :milestone, :gradual, :compound] do
    GenServer.call(__MODULE__, {:set_scaling_mode, user_id, mode})
  end

  @doc "Pause trading (sets active capital to 0 effectively)"
  def pause_trading(user_id) do
    GenServer.call(__MODULE__, {:pause, user_id, true})
  end

  @doc "Resume trading"
  def resume_trading(user_id) do
    GenServer.call(__MODULE__, {:pause, user_id, false})
  end

  @doc """
  Report a completed trade result. Used for auto-scaling decisions.
  Called by SignalTrader after closing a position.
  """
  def report_trade_result(user_id, pnl, trade_date \\ nil) do
    GenServer.cast(__MODULE__, {:trade_result, user_id, pnl, trade_date || Date.utc_today()})
  end

  @doc "Get summary of all allocations"
  def all_allocations do
    try do
      :ets.tab2list(@ets_table)
      |> Map.new(fn {user_id, alloc} -> {user_id, alloc} end)
    rescue
      _ -> %{}
    end
  end

  @doc "Get deployment ratio (active/total) as percentage"
  def deployment_ratio(user_id) do
    case get_allocation(user_id) do
      {:ok, alloc} when alloc.total_capital > 0 ->
        {:ok, Float.round(alloc.active_capital / alloc.total_capital * 100, 1)}
      {:ok, _} ->
        {:ok, 0.0}
      error -> error
    end
  end

  @doc "Get detailed status for dashboard display"
  def get_dashboard_status(user_id) do
    case get_allocation(user_id) do
      {:ok, alloc} ->
        pnl_on_active = alloc.realized_pnl
        pnl_pct = if alloc.active_capital > 0,
          do: Float.round(pnl_on_active / alloc.initial_active * 100, 2),
          else: 0.0

        deploy_pct = if alloc.total_capital > 0,
          do: Float.round(alloc.active_capital / alloc.total_capital * 100, 1),
          else: 0.0

        {:ok, %{
          total_capital: alloc.total_capital,
          active_capital: alloc.active_capital,
          reserved_capital: alloc.total_capital - alloc.active_capital,
          deployment_pct: deploy_pct,
          scaling_mode: alloc.scaling_mode,
          paused: alloc.paused,
          realized_pnl: Float.round(pnl_on_active, 2),
          pnl_pct_on_active: pnl_pct,
          total_trades: alloc.trade_count,
          winning_trades: alloc.winning_trades,
          losing_trades: alloc.losing_trades,
          win_rate: if(alloc.trade_count > 0,
            do: Float.round(alloc.winning_trades / alloc.trade_count * 100, 1),
            else: 0.0),
          profitable_days: alloc.profitable_days,
          scale_ups_performed: alloc.scale_ups,
          current_drawdown_pct: calculate_drawdown_pct(alloc),
          next_milestone: next_milestone(alloc),
          history: Enum.take(alloc.scaling_history, 10)
        }}

      error -> error
    end
  end

  # ============================================================================
  # SERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :public, :set, read_concurrency: true])
    Logger.info("💰 CapitalAllocator started")
    {:ok, %{}}
  end

  @impl true
  def handle_call({:configure, user_id, config}, _from, state) do
    total = Map.get(config, :total_capital, 50_000.0)
    active = Map.get(config, :active_capital, 5_000.0) |> min(total)

    allocation = %{
      user_id: user_id,
      total_capital: total,
      active_capital: active,
      initial_active: active,
      scaling_mode: Map.get(config, :scaling_mode, :manual),
      paused: false,

      # Scaling parameters
      max_step_size: Map.get(config, :max_step_size, 2_500.0),
      drawdown_pause_pct: Map.get(config, :drawdown_pause_pct, 0.10),
      milestone_targets: Map.get(config, :milestone_targets, [10, 20, 30, 50]),
      compound_reinvest_pct: Map.get(config, :compound_reinvest_pct, 0.50),
      gradual_increase_pct: Map.get(config, :gradual_increase_pct, 0.10),
      gradual_min_profitable_days: Map.get(config, :gradual_min_profitable_days, 5),

      # Tracking
      realized_pnl: 0.0,
      peak_active_balance: active,
      trade_count: 0,
      winning_trades: 0,
      losing_trades: 0,
      profitable_days: 0,
      daily_pnl: 0.0,
      current_day: Date.utc_today(),
      consecutive_profitable_days: 0,
      scale_ups: 0,
      scaling_history: [],

      created_at: DateTime.utc_now(),
      updated_at: DateTime.utc_now()
    }

    :ets.insert(@ets_table, {user_id, allocation})

    # Sync with VirtualBalanceManager
    sync_virtual_balance(user_id, active)

    Logger.info("""

    💰 CAPITAL ALLOCATION CONFIGURED
    ═══════════════════════════════════════════════════════════════
    User:           #{user_id}
    Total Capital:  $#{Float.round(total, 2)}
    Active Capital: $#{Float.round(active, 2)} (#{Float.round(active / total * 100, 1)}%)
    Reserved:       $#{Float.round(total - active, 2)}
    Scaling Mode:   #{config[:scaling_mode] || :manual}
    ═══════════════════════════════════════════════════════════════
    """)

    {:reply, {:ok, allocation}, state}
  end

  @impl true
  def handle_call({:set_active_capital, user_id, amount}, _from, state) do
    case :ets.lookup(@ets_table, user_id) do
      [{^user_id, alloc}] ->
        capped = min(amount, alloc.total_capital)
        new_alloc = %{alloc |
          active_capital: capped,
          peak_active_balance: max(alloc.peak_active_balance, capped),
          updated_at: DateTime.utc_now(),
          scaling_history: [
            %{action: :manual_set, amount: capped, at: DateTime.utc_now()}
            | alloc.scaling_history
          ]
        }
        :ets.insert(@ets_table, {user_id, new_alloc})
        sync_virtual_balance(user_id, capped)

        Logger.info("💰 Active capital set to $#{Float.round(capped, 2)} for #{user_id}")
        {:reply, {:ok, new_alloc}, state}

      [] ->
        {:reply, {:error, :not_configured}, state}
    end
  end

  @impl true
  def handle_call({:set_total_capital, user_id, amount}, _from, state) do
    case :ets.lookup(@ets_table, user_id) do
      [{^user_id, alloc}] ->
        new_active = min(alloc.active_capital, amount)
        new_alloc = %{alloc |
          total_capital: amount,
          active_capital: new_active,
          updated_at: DateTime.utc_now()
        }
        :ets.insert(@ets_table, {user_id, new_alloc})
        {:reply, {:ok, new_alloc}, state}

      [] ->
        {:reply, {:error, :not_configured}, state}
    end
  end

  @impl true
  def handle_call({:set_scaling_mode, user_id, mode}, _from, state) do
    case :ets.lookup(@ets_table, user_id) do
      [{^user_id, alloc}] ->
        new_alloc = %{alloc | scaling_mode: mode, updated_at: DateTime.utc_now()}
        :ets.insert(@ets_table, {user_id, new_alloc})
        Logger.info("💰 Scaling mode changed to #{mode} for #{user_id}")
        {:reply, {:ok, new_alloc}, state}

      [] ->
        {:reply, {:error, :not_configured}, state}
    end
  end

  @impl true
  def handle_call({:pause, user_id, paused}, _from, state) do
    case :ets.lookup(@ets_table, user_id) do
      [{^user_id, alloc}] ->
        new_alloc = %{alloc | paused: paused, updated_at: DateTime.utc_now()}
        :ets.insert(@ets_table, {user_id, new_alloc})
        action = if paused, do: "PAUSED", else: "RESUMED"
        Logger.info("💰 Trading #{action} for #{user_id}")
        {:reply, {:ok, new_alloc}, state}

      [] ->
        {:reply, {:error, :not_configured}, state}
    end
  end

  @impl true
  def handle_cast({:trade_result, user_id, pnl, trade_date}, state) do
    case :ets.lookup(@ets_table, user_id) do
      [{^user_id, alloc}] ->
        # Handle day rollover
        alloc = if trade_date != alloc.current_day do
          # Previous day was profitable
          days = if alloc.daily_pnl > 0,
            do: alloc.profitable_days + 1,
            else: alloc.profitable_days

          consec = if alloc.daily_pnl > 0,
            do: alloc.consecutive_profitable_days + 1,
            else: 0

          %{alloc |
            current_day: trade_date,
            daily_pnl: 0.0,
            profitable_days: days,
            consecutive_profitable_days: consec
          }
        else
          alloc
        end

        # Update stats
        new_alloc = %{alloc |
          realized_pnl: alloc.realized_pnl + pnl,
          daily_pnl: alloc.daily_pnl + pnl,
          trade_count: alloc.trade_count + 1,
          winning_trades: if(pnl > 0, do: alloc.winning_trades + 1, else: alloc.winning_trades),
          losing_trades: if(pnl < 0, do: alloc.losing_trades + 1, else: alloc.losing_trades),
          updated_at: DateTime.utc_now()
        }

        # Check auto-scaling
        new_alloc = maybe_auto_scale(new_alloc)

        # Check drawdown circuit breaker
        new_alloc = check_drawdown_breaker(new_alloc)

        :ets.insert(@ets_table, {user_id, new_alloc})
        {:noreply, state}

      [] ->
        {:noreply, state}
    end
  end

  @impl true
  def handle_info(_, state), do: {:noreply, state}

  # ============================================================================
  # AUTO-SCALING LOGIC
  # ============================================================================

  defp maybe_auto_scale(%{scaling_mode: :manual} = alloc), do: alloc

  defp maybe_auto_scale(%{scaling_mode: :milestone} = alloc) do
    pnl_pct = if alloc.initial_active > 0,
      do: alloc.realized_pnl / alloc.initial_active * 100,
      else: 0.0

    # Find the highest milestone we've passed
    passed = Enum.filter(alloc.milestone_targets, &(&1 <= pnl_pct))
    milestones_hit = length(passed)

    if milestones_hit > alloc.scale_ups do
      # Scale up!
      step = min(alloc.max_step_size, alloc.total_capital - alloc.active_capital)
      new_active = min(alloc.active_capital + step, alloc.total_capital)

      Logger.info("📈 MILESTONE SCALE-UP: #{pnl_pct}% profit → Active capital $#{Float.round(alloc.active_capital, 2)} → $#{Float.round(new_active, 2)}")

      sync_virtual_balance(alloc.user_id, new_active)

      %{alloc |
        active_capital: new_active,
        initial_active: new_active,
        realized_pnl: 0.0,
        peak_active_balance: new_active,
        scale_ups: milestones_hit,
        scaling_history: [
          %{action: :milestone_scale_up, from: alloc.active_capital, to: new_active,
            trigger_pct: pnl_pct, at: DateTime.utc_now()}
          | alloc.scaling_history
        ]
      }
    else
      alloc
    end
  end

  defp maybe_auto_scale(%{scaling_mode: :gradual} = alloc) do
    if alloc.consecutive_profitable_days >= alloc.gradual_min_profitable_days do
      increase = alloc.active_capital * alloc.gradual_increase_pct
      step = min(increase, alloc.max_step_size)
      new_active = min(alloc.active_capital + step, alloc.total_capital)

      if new_active > alloc.active_capital do
        Logger.info("📈 GRADUAL SCALE-UP: #{alloc.consecutive_profitable_days} profitable days → +$#{Float.round(step, 2)}")

        sync_virtual_balance(alloc.user_id, new_active)

        %{alloc |
          active_capital: new_active,
          peak_active_balance: new_active,
          consecutive_profitable_days: 0,
          scale_ups: alloc.scale_ups + 1,
          scaling_history: [
            %{action: :gradual_scale_up, from: alloc.active_capital, to: new_active,
              profitable_days: alloc.consecutive_profitable_days, at: DateTime.utc_now()}
            | alloc.scaling_history
          ]
        }
      else
        alloc
      end
    else
      alloc
    end
  end

  defp maybe_auto_scale(%{scaling_mode: :compound} = alloc) do
    if alloc.realized_pnl > 0 do
      reinvest = alloc.realized_pnl * alloc.compound_reinvest_pct
      reinvest = min(reinvest, alloc.max_step_size)
      new_active = min(alloc.active_capital + reinvest, alloc.total_capital)

      if reinvest >= 10.0 do  # Min $10 reinvestment
        Logger.info("📈 COMPOUND: Reinvesting $#{Float.round(reinvest, 2)} of $#{Float.round(alloc.realized_pnl, 2)} profit")

        sync_virtual_balance(alloc.user_id, new_active)

        %{alloc |
          active_capital: new_active,
          realized_pnl: alloc.realized_pnl - reinvest,
          peak_active_balance: max(alloc.peak_active_balance, new_active),
          scale_ups: alloc.scale_ups + 1,
          scaling_history: [
            %{action: :compound_reinvest, amount: reinvest,
              new_active: new_active, at: DateTime.utc_now()}
            | alloc.scaling_history
          ]
        }
      else
        alloc
      end
    else
      alloc
    end
  end

  # ============================================================================
  # DRAWDOWN CIRCUIT BREAKER
  # ============================================================================

  defp check_drawdown_breaker(alloc) do
    dd_pct = calculate_drawdown_pct(alloc)

    if dd_pct >= alloc.drawdown_pause_pct and not alloc.paused do
      Logger.warning("🚨 DRAWDOWN BREAKER: #{Float.round(dd_pct * 100, 1)}% drawdown → PAUSING trading for #{alloc.user_id}")

      %{alloc |
        paused: true,
        scaling_history: [
          %{action: :drawdown_pause, drawdown_pct: dd_pct, at: DateTime.utc_now()}
          | alloc.scaling_history
        ]
      }
    else
      alloc
    end
  end

  defp calculate_drawdown_pct(%{peak_active_balance: peak} = alloc) when peak > 0 do
    current = alloc.active_capital + alloc.realized_pnl
    max(0.0, (peak - current) / peak)
  end
  defp calculate_drawdown_pct(_), do: 0.0

  defp next_milestone(alloc) do
    pnl_pct = if alloc.initial_active > 0,
      do: alloc.realized_pnl / alloc.initial_active * 100,
      else: 0.0

    alloc.milestone_targets
    |> Enum.find(fn target -> target > pnl_pct end)
  end

  # ============================================================================
  # VIRTUAL BALANCE SYNC
  # ============================================================================

  defp sync_virtual_balance(user_id, active_capital) do
    if Code.ensure_loaded?(TradeEngine.Risk.VirtualBalanceManager) do
      try do
        TradeEngine.Risk.VirtualBalanceManager.set_balance(user_id, active_capital)
      rescue
        _ -> :ok
      end
    end
  end
end
