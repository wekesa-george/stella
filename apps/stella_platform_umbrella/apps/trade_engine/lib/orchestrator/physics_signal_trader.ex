# ============================================================================
# PHYSICS-ENHANCED SIGNAL TRADER
# ============================================================================
defmodule TradeEngine.Orchestrator.PhysicsSignalTrader do
  @moduledoc """
  🚀 PHYSICS-FINANCE ENHANCED TRADER
  
  Integrates MarketProjectile model into trading decisions:
  1. Entry: Bullish lift (momentum > 0, angle > 18°)
  2. Peak: Take profit when v(t) → 0
  3. Bearish: Short on velocity reversal
  4. Bounce: Buy oversold zones
  
  Key improvements:
  - Physics-predicted peak prices (not guess-based)
  - Gravity-adjusted position sizing
  - Energy-aware risk management
  - Time-bound exits (peak_time derived)
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position
  # TradingAccount removed — table replaced by trading.equity_snapshots
  alias TradeEngine.Physics.{
    MarketProjectile,
    SignalGenerator,
    RiskManagement,
    EnergyModel
  }
  alias TradeEngine.Exchanges.Binance.{TickerStream, DepthStream}
  alias SysAdmin.Accounts.User

  @pubsub TradeEngine.PubSub

  # ========================================================================
  # PHYSICS-BASED CONFIGURATION (compile-time defaults)
  # Runtime overrides come from strategy.strategies.config JSONB
  # ========================================================================

  @min_momentum 0.001
  @min_trajectory_angle 18.0
  @min_kinetic_energy 0.3
  @min_confidence 55
  @velocity_reversal_threshold -0.001
  @energy_exhaustion_threshold 0.2
  @max_hold_time_multiplier 1.2
  @risk_percent_per_trade 0.02
  @max_positions_per_user 5
  @min_account_balance 100.0

  @signal_check_interval_ms 5_000
  @exit_check_interval_ms 3_000
  @broadcast_stats_interval_ms 10_000

  # ========================================================================
  # PUBLIC API
  # ========================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def start_trading, do: GenServer.cast(__MODULE__, :start_trading)
  def stop_trading, do: GenServer.cast(__MODULE__, :stop_trading)
  def get_stats, do: GenServer.call(__MODULE__, :get_stats, 10_000)
  def get_open_positions, do: GenServer.call(__MODULE__, :get_open_positions, 10_000)
  def analyze_symbol(symbol), do: GenServer.call(__MODULE__, {:analyze_symbol, symbol}, 10_000)

  # ========================================================================
  # GENSERVER INIT
  # ========================================================================

  @impl true
  def init(_opts) do
    Logger.info("""
    
    🚀 PHYSICS-FINANCE SIGNAL TRADER INITIALIZED
    ═════════════════════════════════════════════════════════════════
    Entry Rules (Bullish Lift):
    ├─ Momentum (v₀): > #{@min_momentum}
    ├─ Trajectory Angle (θ): > #{@min_trajectory_angle}°
    ├─ Kinetic Energy (E_k): > #{@min_kinetic_energy}
    └─ Confidence Score: > #{@min_confidence}%
    
    Exit Rules (Physics-Based):
    ├─ Velocity Reversal: v(t) < #{@velocity_reversal_threshold}
    ├─ Energy Exhaustion: E_k < #{@energy_exhaustion_threshold}
    ├─ Time Limit: t > #{@max_hold_time_multiplier}x t_peak
    └─ Peak Zone: Approaching v(t) → 0
    
    Risk Management:
    ├─ Position Sizing: #{@risk_percent_per_trade * 100}% risk per trade
    ├─ Max Positions: #{@max_positions_per_user}
    └─ Gravity-Adjusted: Higher gravity = smaller position
    ═════════════════════════════════════════════════════════════════
    """)

    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:5m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:15m")

    state = %{
      trading_active: false,
      started_at: nil,
      positions: %{},
      stats: build_empty_stats(),
      pending_analyses: [],
      physics_cache: %{}
    }

    {:ok, state}
  end

  # ========================================================================
  # GENSERVER HANDLERS
  # ========================================================================

  @impl true
  def handle_cast(:start_trading, state) do
    Logger.info("🟢 PHYSICS TRADER ACTIVE - Monitoring signals...")
    Process.send_after(self(), :check_signals, @signal_check_interval_ms)
    Process.send_after(self(), :check_exits, @exit_check_interval_ms)
    Process.send_after(self(), :broadcast_stats, @broadcast_stats_interval_ms)

    {:noreply, %{state | trading_active: true, started_at: DateTime.utc_now()}}
  end

  @impl true
  def handle_cast(:stop_trading, state) do
    Logger.info("🔴 PHYSICS TRADER STOPPED")
    {:noreply, %{state | trading_active: false}}
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    {:reply, state.stats, state}
  end

  @impl true
  def handle_call(:get_open_positions, _from, state) do
    positions = state.positions |> Map.values() |> Enum.sort_by(& &1.entry_time, {:desc, DateTime})
    {:reply, positions, state}
  end

  @impl true
  def handle_call({:analyze_symbol, symbol}, _from, state) do
    # Manual analysis request
    case analyze_candles_for_symbol(symbol) do
      {:ok, signal} ->
        Logger.info("📊 Manual Analysis - #{symbol}: #{signal.type} (#{signal.confidence}%)")
        {:reply, {:ok, signal}, state}
      
      {:error, reason} ->
        Logger.warning("⚠️ Analysis failed for #{symbol}: #{reason}")
        {:reply, {:error, reason}, state}
    end
  end

  # ========================================================================
  # SIGNAL PROCESSING (FROM CANDLEBRIDGE)
  # ========================================================================

  @impl true
  def handle_info({:candle_closed, candle}, state) do
    if state.trading_active do
      GenServer.cast(self(), {:process_candle, candle})
    end
    {:noreply, state}
  end

  @impl true
  def handle_cast({:process_candle, candle}, state) do
    symbol = candle.symbol
    
    case analyze_candles_for_symbol(symbol) do
      {:ok, signal} ->
        new_state = process_signal(signal, state)
        {:noreply, new_state}
      
      {:error, _reason} ->
        {:noreply, state}
    end
  end

  @impl true
  def handle_info(:check_exits, state) do
    if state.trading_active do
      new_state = check_physics_exits(state)
      Process.send_after(self(), :check_exits, @exit_check_interval_ms)
      {:noreply, new_state}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:check_signals, state) do
    if state.trading_active do
      # Could add periodic analysis here
      Process.send_after(self(), :check_signals, @signal_check_interval_ms)
    end
    {:noreply, state}
  end

  @impl true
  def handle_info(:broadcast_stats, state) do
    if state.trading_active do
      new_state = update_stats(state)
      Phoenix.PubSub.broadcast(@pubsub, "physics:stats", {:stats, new_state.stats})
      Process.send_after(self(), :broadcast_stats, @broadcast_stats_interval_ms)
      {:noreply, new_state}
    else
      {:noreply, state}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ========================================================================
  # PHYSICS-BASED SIGNAL PROCESSING
  # ========================================================================

  defp process_signal(signal, state) do
    %{type: signal_type, confidence: confidence, physics: physics} = signal
    config = get_strategy_config()
    min_conf = get_param(config, "min_confidence", @min_confidence)

    case signal_type do
      :bullish_lift ->
        if confidence >= min_conf do
          Logger.info("""
          ✅ BULLISH ENTRY SIGNAL
          ═════════════════════════════════════════
          Physics:
          ├─ Momentum (v₀): #{Float.round(physics.momentum, 4)}
          ├─ Gravity (g): #{Float.round(physics.gravity, 4)}
          ├─ Peak Time (t*): #{Float.round(physics.peak_time, 1)} candles
          ├─ Peak Price (P*): $#{Float.round(physics.peak_price, 2)}
          ├─ Trajectory Angle: #{physics.trajectory_angle}°
          ├─ Kinetic Energy: #{Float.round(physics.kinetic_energy, 4)}
          └─ Confidence: #{confidence}%
          ═════════════════════════════════════════
          """)
          
          # Execute trades for eligible users
          new_positions = execute_bullish_entry(signal, state.positions)
          %{state | positions: new_positions}
        else
          state
        end

      :bearish_dump ->
        Logger.info("🔴 BEARISH DUMP: v(t) < 0, gravity dominance")
        # Short entry logic
        state

      :bounce_zone ->
        Logger.info("🔵 BOUNCE ZONE: Energy exhausted, buying opportunity")
        state

      :peak_approaching ->
        Logger.info("⚠️  PEAK ZONE: Take profit time")
        state

      _ ->
        state
    end
  end

  defp execute_bullish_entry(signal, positions) do
    users = get_eligible_users()
    
    Enum.reduce(users, positions, fn {user, account}, acc_positions ->
      if can_open_position?(user, acc_positions) do
        case create_physics_position(user, account, signal) do
          {:ok, position} ->
            Logger.info("✅ Position opened: #{position.symbol} (#{user.id})")
            Map.put(acc_positions, position.id, position)
          
          {:error, reason} ->
            Logger.debug("Position creation failed: #{reason}")
            acc_positions
        end
      else
        acc_positions
      end
    end)
  end

  defp create_physics_position(user, account, signal) do
    %{physics: physics, entry_price: entry_price, type: signal_type} = signal
    config = get_strategy_config()
    risk_pct = get_param(config, "risk_percent_per_trade", @risk_percent_per_trade)
    hold_mult = get_param(config, "max_hold_time_multiplier", @max_hold_time_multiplier)

    balance = Decimal.to_float(account.available_balance)
    position_size = RiskManagement.calculate_position_size(balance, physics, risk_pct)
    quantity = position_size / entry_price

    position = %{
      id: Ecto.UUID.generate(),
      user_id: user.id,
      trading_account_id: account.id,
      symbol: signal.entry_price |> Decimal.to_string() |> String.split(".") |> List.first(),
      direction: :long,
      quantity: quantity,
      entry_price: entry_price,
      current_price: entry_price,
      entry_time: DateTime.utc_now(),
      
      # PHYSICS PARAMETERS
      physics: %{
        momentum: physics.momentum,
        gravity: physics.gravity,
        peak_time: physics.peak_time,
        peak_price: physics.peak_price,
        trajectory_angle: physics.trajectory_angle,
        kinetic_energy: physics.kinetic_energy,
        energy_state: physics.energy_state,
        max_hold_time: physics.peak_time * hold_mult
      },
      
      # RISK MANAGEMENT
      stop_loss: physics.current_price * 0.98,
      take_profit: physics.peak_price * 0.96,
      
      status: :open,
      exit_reason: nil
    }
    
    {:ok, position}
  end

  # ========================================================================
  # PHYSICS-BASED EXIT LOGIC
  # ========================================================================

  defp check_physics_exits(state) do
    now = DateTime.utc_now()
    
    {to_close, to_keep} = state.positions
      |> Map.values()
      |> Enum.split_with(fn pos -> should_exit_by_physics?(pos, now) end)

    new_positions = Enum.reduce(to_close, state.positions, fn pos, acc ->
      case close_position_physics(pos, now) do
        {:ok, closed_pos} ->
          broadcast_position_closed(closed_pos)
          Map.delete(acc, pos.id)
        
        {:error, _} ->
          acc
      end
    end)

    %{state | positions: new_positions}
  end

  defp should_exit_by_physics?(position, now) do
    time_held = DateTime.diff(now, position.entry_time, :minute)
    current_price = position.current_price
    entry_price = position.entry_price
    pnl_pct = (current_price - entry_price) / entry_price

    physics = position.physics
    config = get_strategy_config()
    vel_threshold = get_param(config, "velocity_reversal_threshold", @velocity_reversal_threshold)
    energy_threshold = get_param(config, "energy_exhaustion_threshold", @energy_exhaustion_threshold)

    cond do
      # Rule 1: Velocity reversal v(t) < 0
      physics.momentum < vel_threshold and pnl_pct > -0.01 ->
        true

      # Rule 2: Energy exhaustion
      physics.kinetic_energy < energy_threshold and
      time_held >= physics.peak_time * 0.8 ->
        true

      # Rule 3: Time limit exceeded
      time_held >= physics.max_hold_time ->
        true

      # Rule 4: Peak zone (approaching v→0)
      physics.momentum < 0.0005 and pnl_pct > 0.02 ->
        true

      # Rule 5: Traditional TP/SL
      pnl_pct >= 0.05 -> true
      pnl_pct <= -0.02 -> true

      true -> false
    end
  end

  defp close_position_physics(position, exit_time) do
    current_price = position.current_price
    entry_price = position.entry_price
    pnl = (current_price - entry_price) * position.quantity
    pnl_pct = (current_price - entry_price) / entry_price * 100

    exit_reason = determine_physics_exit_reason(position, exit_time)

    closed = position
      |> Map.put(:current_price, current_price)
      |> Map.put(:realized_pnl, pnl)
      |> Map.put(:pnl_percentage, pnl_pct)
      |> Map.put(:status, :closed)
      |> Map.put(:exit_reason, exit_reason)
      |> Map.put(:exit_time, exit_time)

    emoji = if pnl >= 0, do: "✅", else: "❌"
    Logger.info("#{emoji} CLOSED #{position.symbol} | P&L: $#{Float.round(pnl, 2)} (#{Float.round(pnl_pct, 1)}%) | Exit: #{exit_reason}")

    {:ok, closed}
  end

  defp determine_physics_exit_reason(position, exit_time) do
    time_held = DateTime.diff(exit_time, position.entry_time, :minute)
    current_price = position.current_price
    entry_price = position.entry_price
    pnl_pct = (current_price - entry_price) / entry_price

    physics = position.physics
    config = get_strategy_config()
    vel_threshold = get_param(config, "velocity_reversal_threshold", @velocity_reversal_threshold)
    energy_threshold = get_param(config, "energy_exhaustion_threshold", @energy_exhaustion_threshold)

    cond do
      pnl_pct >= 0.05 -> :take_profit
      pnl_pct <= -0.02 -> :stop_loss
      physics.momentum < vel_threshold and pnl_pct > -0.01 -> :velocity_reversal
      physics.kinetic_energy < energy_threshold -> :energy_exhaustion
      time_held >= physics.max_hold_time -> :physics_timeout
      physics.momentum < 0.0005 and pnl_pct > 0.02 -> :peak_zone
      true -> :manual
    end
  end

  # ========================================================================
  # ANALYSIS & HELPERS
  # ========================================================================

  defp analyze_candles_for_symbol(symbol) do
    case TradeEngine.Exchanges.Binance.KlineStream.get_recent_candles(symbol, 20) do
      candles when is_list(candles) and length(candles) >= 5 ->
        order_flow = case DepthStream.get_order_flow(symbol) do
          {:ok, flow} -> flow
          _ -> nil
        end

        case SignalGenerator.generate_signal(candles, order_flow) do
          {:ok, signal} -> {:ok, signal}
          {:error, reason} -> {:error, reason}
        end

      _ ->
        {:error, :insufficient_candles}
    end
  end

  defp can_open_position?(user, positions) do
    config = get_strategy_config()
    max_pos = get_param(config, "max_positions_per_user", @max_positions_per_user)

    user_open_count = positions
      |> Map.values()
      |> Enum.count(&(&1.user_id == user.id and &1.status == :open))

    user_open_count < max_pos
  end

  defp get_eligible_users do
    # TradingAccount table removed — use placeholder
    Repo.all(from u in User, limit: 50)
    |> Enum.map(fn u -> {u, %{id: nil, user_id: u.id, available_balance: Decimal.new("100")}} end)
  rescue
    _ -> []
  end

  defp update_stats(state) do
        positions = Map.values(state.positions)

        open_pos =
            positions
            |> Enum.count(fn pos -> pos.status == :open end)

        closed_pos =
            positions
            |> Enum.count(fn pos -> pos.status == :closed end)

        total_pnl =
            positions
            |> Enum.reduce(0.0, fn pos, acc -> acc + (pos.realized_pnl || 0) end)

        winning =
            positions
            |> Enum.count(fn pos -> (pos.realized_pnl || 0) >= 0 end)

        new_stats = %{
            status: if(state.trading_active, do: "ACTIVE", else: "STOPPED"),
            uptime: if(state.started_at, do: DateTime.diff(DateTime.utc_now(), state.started_at), else: 0),
            open_positions: open_pos,
            closed_positions: closed_pos,
            winning_trades: winning,
            total_trades: closed_pos,
            win_rate: if(closed_pos > 0, do: Float.round(winning / closed_pos * 100, 1), else: 0),
            total_pnl: Float.round(total_pnl, 2),
            timestamp: DateTime.utc_now()
        }

        %{state | stats: new_stats}
  end


  defp build_empty_stats do
    %{
      status: "INITIALIZING",
      uptime: 0,
      open_positions: 0,
      closed_positions: 0,
      winning_trades: 0,
      total_trades: 0,
      win_rate: 0.0,
      total_pnl: 0.0,
      timestamp: DateTime.utc_now()
    }
  end

  defp broadcast_position_closed(position) do
    Phoenix.PubSub.broadcast(@pubsub, "physics:positions", {:position_closed, position})
  end

  # ════════════════════════════════════════════════════════════════════════════
  # STRATEGY CONFIG READER (DB-backed with fallback)
  # ════════════════════════════════════════════════════════════════════════════

  defp get_strategy_config do
    alias SysAdmin.Strategies.Strategy
    try do
      case Repo.one(
        from(s in Strategy,
          where: s.status == "active" and s.type == "core_momentum",
          select: s.config,
          limit: 1
        )
      ) do
        nil -> %{}
        config when is_map(config) -> config
        _ -> %{}
      end
    rescue
      _ -> %{}
    end
  end

  defp get_param(config, key, default) when is_map(config) do
    case Map.get(config, key) do
      nil -> default
      val when is_binary(val) ->
        case Float.parse(val) do
          {num, ""} -> num
          _ -> default
        end
      val -> val
    end
  end

  defp get_param(_, _, default), do: default
end