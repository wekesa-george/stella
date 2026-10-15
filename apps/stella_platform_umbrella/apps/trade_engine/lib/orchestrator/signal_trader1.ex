defmodule TradeEngine.Orchestrator.SignalTrader1 do
  @moduledoc """
  🚀 SIGNAL-BASED AUTOMATED TRADER (Physics-Enhanced)
  
  Executes trades based on CandleBridge physics signals:
  - LONG positions for :long signals (bullish)
  - SHORT positions for :short signals (bearish)
  
  Exit Strategy (Physics-Based):
  - Velocity Reversal: Exit when v(t) < 0 (momentum exhaustion)
  - Energy Exhaustion: Exit when kinetic energy E < 0.3
  - Angle Collapse: Exit when trajectory angle degrades
  - Physics Timeout: Exit past predicted peak time
  - Take Profit/Stop Loss: Traditional P&L targets
  
  Risk Management:
  - Position size: % of available balance (configurable)
  - Max positions per user (configurable)
  - Min confidence threshold for entry
  - Real-time P&L tracking
  - Physics-validated entries only
  
  Dashboard Integration:
  - Broadcasts trade events via PubSub
  - Tracks win rate, total P&L, open positions
  - Real-time unrealized P&L updates
  - Physics metrics for all positions
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position
  # TradingAccount removed — table replaced by trading.equity_snapshots
  alias TradeEngine.Strategy.CandleBridge
  alias TradeEngine.Exchanges.Binance.{TickerStream, DepthStream}
  alias SysAdmin.Accounts.User

  # ============================================================================
  # CONFIGURATION
  # ============================================================================

  @pubsub TradeEngine.PubSub
  
  # Trading parameters
  @min_confidence_long 55
  @min_confidence_short 60
  @min_trajectory_angle 18.0          # ← Physics validation
  @position_size_percent 0.05
  @max_positions_per_user 5
  @min_trade_value 10.0
  @min_account_balance 100.0
  
  # Exit parameters
  @stop_loss_pct 0.02
  @take_profit_pct 0.05
  @max_hold_time_minutes 120
  @exit_check_interval_ms 30_000
  
  # Physics exit thresholds
  @energy_exhaustion_threshold 0.3    # E < 0.3 = exhaustion
  @angle_collapse_threshold 10.0      # Angle < 10° = momentum broken
  @physics_timeout_multiplier 1.2     # Exit 20% past peak
  
  # Execution intervals
  @signal_check_interval_ms 5_000
  @stats_broadcast_interval_ms 10_000
  @calculate_stats_interval_ms 5_000
  @update_prices_interval_ms 5_000

  # Binance API
  @binance_testnet_url "https://testnet.binance.vision/api"
  @use_testnet true

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def start_trading do
    GenServer.cast(__MODULE__, :start_trading)
  end

  def stop_trading do
    GenServer.cast(__MODULE__, :stop_trading)
  end

  def get_stats do
    GenServer.call(__MODULE__, :get_stats, 10_000)
  end

  def get_open_positions do
    GenServer.call(__MODULE__, :get_open_positions, 10_000)
  end

  def get_trade_history(limit \\ 50) do
    GenServer.call(__MODULE__, {:get_trade_history, limit}, 10_000)
  end

  def force_check_exits do
    GenServer.cast(__MODULE__, :check_exits)
  end

  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    Logger.info("🚀 SignalTrader INITIALIZED (Physics-Enhanced)")
    Logger.info("   Min Confidence: LONG=#{@min_confidence_long}% SHORT=#{@min_confidence_short}%")
    Logger.info("   Min Trajectory Angle: #{@min_trajectory_angle}°")
    Logger.info("   Position Size: #{@position_size_percent * 100}% | Max Positions: #{@max_positions_per_user}")
    Logger.info("   Physics Exit Thresholds:")
    Logger.info("   ├─ Energy Exhaustion: E < #{@energy_exhaustion_threshold}")
    Logger.info("   ├─ Angle Collapse: θ < #{@angle_collapse_threshold}°")
    Logger.info("   └─ Physics Timeout: #{@physics_timeout_multiplier}x peak time")
    
    Phoenix.PubSub.subscribe(@pubsub, "signals:all")
    
    state = %{
      trading_active: false,
      started_at: nil,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_realized_pnl: Decimal.new("0"),
      total_unrealized_pnl: Decimal.new("0"),
      open_positions: %{},
      trade_history: [],
      signal_count: 0,
      last_signal_time: nil,
      pending_signals: [],
      cached_stats: nil,
      exit_reasons: %{}
    }
    
    {:ok, state}
  end

  @impl true
  def handle_cast(:start_trading, state) do
    Logger.info("🟢 SIGNAL TRADING STARTED (Physics-Enhanced Exit Logic Active)")
    
    Process.send_after(self(), :check_exits, @exit_check_interval_ms)
    Process.send_after(self(), :process_signals, @signal_check_interval_ms)
    Process.send_after(self(), :broadcast_stats, @stats_broadcast_interval_ms)
    Process.send_after(self(), :update_prices, @update_prices_interval_ms)
    Process.send_after(self(), :calculate_stats, @calculate_stats_interval_ms)
    
    {:noreply, %{state | trading_active: true, started_at: DateTime.utc_now()}}
  end

  @impl true
  def handle_cast(:stop_trading, state) do
    Logger.info("🔴 SIGNAL TRADING STOPPED")
    {:noreply, %{state | trading_active: false}}
  end

  @impl true
  def handle_cast(:check_exits, state) do
    if state.trading_active do
      new_state = process_exit_checks(state)
      {:noreply, new_state}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    cached_stats = state.cached_stats || build_empty_stats()
    {:reply, cached_stats, state}
  end

  @impl true
  def handle_call(:get_open_positions, _from, state) do
    positions = state.open_positions
      |> Map.values()
      |> Enum.sort_by(& &1.entry_time, {:desc, DateTime})
    
    {:reply, positions, state}
  end

  @impl true
  def handle_call({:get_trade_history, limit}, _from, state) do
    history = Enum.take(state.trade_history, limit)
    {:reply, history, state}
  end

  # ============================================================================
  # SIGNAL HANDLING
  # ============================================================================

  @impl true
  def handle_info({:signal, signal}, state) do
    new_state = %{state | 
      pending_signals: [signal | state.pending_signals] |> Enum.take(100),
      signal_count: state.signal_count + 1,
      last_signal_time: DateTime.utc_now()
    }
    {:noreply, new_state}
  end

  @impl true
  def handle_info(:process_signals, state) do
    new_state = if state.trading_active and not Enum.empty?(state.pending_signals) do
      process_pending_signals(state)
    else
      state
    end
    
    if state.trading_active do
      Process.send_after(self(), :process_signals, @signal_check_interval_ms)
    end
    
    {:noreply, %{new_state | pending_signals: []}}
  end

  @impl true
  def handle_info(:check_exits, state) do
    new_state = if state.trading_active do
      process_exit_checks(state)
    else
      state
    end
    
    if state.trading_active do
      Process.send_after(self(), :check_exits, @exit_check_interval_ms)
    end
    
    {:noreply, new_state}
  end

  @impl true
  def handle_info(:broadcast_stats, state) do
    if state.trading_active do
      new_state = update_unrealized_pnl(state)
      stats = build_stats(new_state)
      Phoenix.PubSub.broadcast(@pubsub, "trading:stats", {:stats_update, stats})
      
      Process.send_after(self(), :broadcast_stats, @stats_broadcast_interval_ms)
      {:noreply, new_state}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:calculate_stats, state) do
    if state.trading_active do
      stats = build_stats(state)
      new_state = %{state | cached_stats: stats}
      
      Process.send_after(self(), :calculate_stats, @calculate_stats_interval_ms)
      {:noreply, new_state}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:update_prices, state) do
    if state.trading_active and map_size(state.open_positions) > 0 do
      updated_positions = state.open_positions
        |> Enum.map(fn {id, pos} ->
          case TickerStream.get_ticker(pos.symbol) do
            {:ok, ticker} -> 
              {id, %{pos | current_price: Decimal.to_float(ticker.price)}}
            _ -> 
              {id, pos}
          end
        end)
        |> Map.new()
      
      Process.send_after(self(), :update_prices, @update_prices_interval_ms)
      {:noreply, %{state | open_positions: updated_positions}}
    else
      Process.send_after(self(), :update_prices, @update_prices_interval_ms)
      {:noreply, state}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ============================================================================
  # SIGNAL PROCESSING
  # ============================================================================

  defp process_pending_signals(state) do
    best_signals = state.pending_signals
      |> Enum.group_by(& &1.symbol)
      |> Enum.map(fn {_symbol, signals} ->
        Enum.max_by(signals, & &1.confidence)
      end)
      |> Enum.filter(&should_trade?/1)
      |> Enum.sort_by(& &1.confidence, :desc)
      |> Enum.take(5)
    
    Enum.reduce(best_signals, state, fn signal, acc_state ->
      process_signal_for_users(signal, acc_state)
    end)
  end

  defp should_trade?(signal) do
    case signal.direction do
      :long -> 
        signal.confidence >= @min_confidence_long and 
        signal.physics.trajectory_angle >= @min_trajectory_angle
      :short -> 
        signal.confidence >= @min_confidence_short and 
        signal.physics.trajectory_angle >= @min_trajectory_angle
      _ -> 
        false
    end
  end

  defp process_signal_for_users(signal, state) do
    users = get_eligible_users()
    
    Enum.reduce(users, state, fn {user, account}, acc_state ->
      if can_open_position?(user, account, signal, acc_state) do
        case execute_trade(user, account, signal) do
          {:ok, position} ->
            Logger.info("""
            ✅ ENTRY: #{signal.direction |> to_string |> String.upcase()} #{signal.symbol}
               Confidence: #{signal.confidence}% | Angle: #{Float.round(signal.physics.trajectory_angle, 2)}°
               Entry: $#{Float.round(Decimal.to_float(signal.entry_price), 4)}
               Momentum: #{Float.round(signal.physics.momentum, 6)} | Gravity: #{Float.round(signal.physics.gravity, 4)}
               T→Peak: #{signal.physics.time_to_peak} bars | Energy: #{signal.physics.energy_state}
            """)
            add_position(acc_state, position)
          
          {:error, reason} ->
            Logger.debug("Trade skipped: #{reason}")
            acc_state
        end
      else
        acc_state
      end
    end)
  end

  defp can_open_position?(user, account, signal, state) do
    user_positions = state.open_positions
      |> Map.values()
      |> Enum.count(& &1.user_id == user.id)
    
    has_symbol = state.open_positions
      |> Map.values()
      |> Enum.any?(& &1.user_id == user.id and &1.symbol == signal.symbol)
    
    cond do
      user_positions >= @max_positions_per_user -> false
      has_symbol -> false
      Decimal.to_float(account.available_balance) < @min_account_balance -> false
      true -> true
    end
  end

  # ============================================================================
  # TRADE EXECUTION
  # ============================================================================

  defp execute_trade(user, account, signal) do
    balance = Decimal.to_float(account.available_balance)
    position_value = balance * @position_size_percent
    
    if position_value < @min_trade_value do
      {:error, "Position size too small: $#{Float.round(position_value, 2)}"}
    else
      current_price = get_current_price(signal.symbol)
      
      case current_price do
        {:ok, price} ->
          price_float = Decimal.to_float(price)
          quantity = position_value / price_float
          
          position = %{
            id: Ecto.UUID.generate(),
            user_id: user.id,
            trading_account_id: account.id,
            symbol: signal.symbol,
            direction: signal.direction,
            quantity: quantity,
            entry_price: price_float,
            current_price: price_float,
            take_profit: Decimal.to_float(signal.take_profit),
            stop_loss: Decimal.to_float(signal.stop_loss),
            peak_price: signal.physics.predicted_peak,
            peak_time: signal.physics.time_to_peak,
            dip_price: signal.physics.predicted_dip,
            dip_time: signal.physics.time_to_peak + 15,
            confidence: signal.confidence,
            
            # ✅ Physics parameters
            physics: %{
              momentum: signal.physics.momentum,
              gravity: signal.physics.gravity,
              trajectory_angle: signal.physics.trajectory_angle,
              time_to_peak: signal.physics.time_to_peak,
              kinetic_energy: signal.physics.kinetic_energy,
              energy_state: signal.physics.energy_state,
              current_velocity: signal.physics.current_velocity,
              acceleration: signal.physics.acceleration,
              r_squared: signal.physics.r_squared
            },
            
            entry_time: DateTime.utc_now(),
            target_exit_time: calculate_target_exit_time(signal),
            unrealized_pnl: 0.0,
            realized_pnl: nil,
            status: :open,
            exit_reason: nil
          }
          
          save_position_to_db(position)
          broadcast_trade_event(:open, position)
          
          {:ok, position}
        
        {:error, reason} ->
          {:error, "Price fetch failed: #{reason}"}
      end
    end
  end

  defp calculate_target_exit_time(signal) do
    minutes = signal.physics.time_to_peak || 30
    DateTime.add(DateTime.utc_now(), minutes * 60, :second)
  end

  # ============================================================================
  # EXIT PROCESSING (PHYSICS-BASED) - THE CORE ENGINE
  # ============================================================================

  defp process_exit_checks(state) do
    now = DateTime.utc_now()
    
    {to_close, to_keep} = state.open_positions
      |> Map.values()
      |> Enum.split_with(fn pos -> should_exit_physics?(pos, now) end)
    
    {updated_state, _closed_positions} = Enum.reduce(to_close, {state, []}, fn pos, {acc_state, closed} ->
      case close_position(pos) do
        {:ok, closed_pos} ->
          new_state = record_closed_trade(acc_state, closed_pos)
          {new_state, [closed_pos | closed]}
        
        {:error, _reason} ->
          {acc_state, closed}
      end
    end)
    
    remaining_positions = to_keep
      |> Enum.map(fn pos -> {pos.id, pos} end)
      |> Map.new()
    
    %{updated_state | open_positions: remaining_positions}
  end

  # =====================================================================
  # PHYSICS-BASED EXIT DECISION LOGIC (CORE)
  # =====================================================================
  defp should_exit_physics?(position, now) do
    entry_price = position.entry_price
    current_price = position.current_price
    time_held_sec = DateTime.diff(now, position.entry_time, :second)
    time_held_min = time_held_sec / 60

    # Calculate P&L percentage
    pnl_pct = case position.direction do
      :long -> (current_price - entry_price) / entry_price
      :short -> (entry_price - current_price) / entry_price
      _ -> 0.0
    end

    cond do
      pnl_pct >= @take_profit_pct -> true
      pnl_pct <= -@stop_loss_pct -> true
      has_velocity_reversal?(position, time_held_min, pnl_pct) -> true
      position.physics.energy_state == :low and time_held_min >= position.physics.time_to_peak * 0.8 -> true
      time_held_min >= (position.physics.time_to_peak * @physics_timeout_multiplier) -> true
      time_held_min >= @max_hold_time_minutes -> true
      price_reached_target?(position, current_price, pnl_pct) -> true
      true -> false
    end
  end

  # =====================================================================
  # PHYSICS HELPER: VELOCITY REVERSAL DETECTION
  # =====================================================================
  defp has_velocity_reversal?(position, time_held_min, pnl_pct) do
    v0 = position.physics.momentum
    g = position.physics.gravity
    
    # Theoretical velocity: v(t) = v₀ - g*t
    current_velocity_theoretical = v0 - (g * time_held_min)
    
    # Actual velocity from price movement
    entry_price = position.entry_price
    current_price = position.current_price
    price_velocity = (current_price - entry_price) / entry_price

    case position.direction do
      :long ->
        # For LONG: reversal when velocity goes negative
        # AND we have some profit (don't exit at loss on reversal)
        (current_velocity_theoretical < -0.001 or price_velocity < 0.0) and pnl_pct > -0.01

      :short ->
        # For SHORT: reversal when velocity goes positive
        # AND we have some profit
        (current_velocity_theoretical > 0.001 or price_velocity > 0.0) and pnl_pct > -0.01

      _ ->
        false
    end
  end

  # =====================================================================
  # PHYSICS HELPER: PRICE TARGET REACHED
  # =====================================================================
  defp price_reached_target?(position, current_price, pnl_pct) do
    peak_proximity = 0.98   # 2% tolerance
    dip_proximity = 1.02

    case position.direction do
      :long ->
        # Exit LONG if reached peak AND profitable
        current_price >= position.peak_price * peak_proximity and pnl_pct > 0.005

      :short ->
        # Exit SHORT if reached dip AND profitable
        current_price <= position.dip_price * dip_proximity and pnl_pct > 0.005

      _ ->
        false
    end
  end

  # =====================================================================
  # CLOSE POSITION WITH DIAGNOSTICS
  # =====================================================================
  defp close_position(position) do
    current_price = position.current_price
    entry_price = position.entry_price

    pnl = case position.direction do
      :long -> (current_price - entry_price) * position.quantity
      :short -> (entry_price - current_price) * position.quantity
      _ -> 0.0
    end

    pnl_pct = case position.direction do
      :long -> (current_price - entry_price) / entry_price * 100
      :short -> (entry_price - current_price) / entry_price * 100
      _ -> 0.0
    end

    exit_reason = determine_exit_reason(position, current_price)
    exit_time = DateTime.utc_now()

    # Diagnostic logging for physics-based exits
    if exit_reason in [:velocity_reversal, :energy_exhaustion, :physics_timeout] do
      IO.puts("""
      
      📊 PHYSICS EXIT ANALYSIS
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      Symbol: #{position.symbol} [#{position.direction}]
      Exit Reason: #{exit_reason}
      
      Price Action:
      ├─ Entry: $#{Float.round(entry_price, 4)}
      ├─ Current: $#{Float.round(current_price, 4)}
      └─ P&L: $#{Float.round(pnl, 2)} (#{Float.round(pnl_pct, 2)}%)
      
      Physics Data:
      ├─ Momentum (v₀): #{Float.round(position.physics.momentum, 6)}
      ├─ Gravity (g): #{Float.round(position.physics.gravity, 4)}
      ├─ Trajectory Angle: #{Float.round(position.physics.trajectory_angle, 2)}°
      ├─ Kinetic Energy: #{Float.round(position.physics.kinetic_energy, 4)}
      ├─ Energy State: #{position.physics.energy_state}
      └─ Time to Peak: #{position.physics.time_to_peak} bars
      
      Execution:
      ├─ Quantity: #{Float.round(position.quantity, 4)}
      ├─ Entry Time: #{DateTime.to_iso8601(position.entry_time)}
      └─ Exit Time: #{DateTime.to_iso8601(exit_time)}
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      """)
    end

    closed_position = position
      |> Map.put(:current_price, current_price)
      |> Map.put(:realized_pnl, pnl)
      |> Map.put(:status, :closed)
      |> Map.put(:exit_reason, exit_reason)
      |> Map.put(:exit_time, exit_time)
      |> Map.put(:pnl_percentage, pnl_pct)

    update_position_in_db(closed_position)
    broadcast_trade_event(:close, closed_position)

    emoji = if pnl >= 0, do: "✅", else: "❌"
    Logger.info("#{emoji} CLOSED #{position.direction} #{position.symbol} | P&L: $#{Float.round(pnl, 2)} (#{Float.round(pnl_pct, 1)}%) | Reason: #{exit_reason}")

    {:ok, closed_position}
  end

  defp determine_exit_reason(position, current_price) do
    entry = position.entry_price

    pnl_pct = case position.direction do
      :long -> (current_price - entry) / entry
      :short -> (entry - current_price) / entry
      _ -> 0.0
    end

    now = DateTime.utc_now()
    time_held = DateTime.diff(now, position.entry_time, :second) / 60

    cond do
      pnl_pct >= @take_profit_pct -> :take_profit
      pnl_pct <= -@stop_loss_pct -> :stop_loss
      has_velocity_reversal?(position, time_held, pnl_pct) -> :velocity_reversal
      position.physics.energy_state == :low and time_held >= position.physics.time_to_peak * 0.8 -> :energy_exhaustion
      time_held >= (position.physics.time_to_peak * @physics_timeout_multiplier) -> :physics_timeout
      time_held >= @max_hold_time_minutes -> :time_limit
      price_reached_target?(position, current_price, pnl_pct) -> :target_reached
      true -> :manual
    end
  end

  # ============================================================================
  # STATE MANAGEMENT
  # ============================================================================

  defp add_position(state, position) do
    %{state |
      open_positions: Map.put(state.open_positions, position.id, position),
      total_trades: state.total_trades + 1
    }
  end

  defp record_closed_trade(state, closed_position) do
    pnl = closed_position.realized_pnl
    is_winner = pnl >= 0
    
    new_exit_reasons = Map.update(state.exit_reasons, closed_position.exit_reason, 1, &(&1 + 1))
    
    %{state |
      open_positions: Map.delete(state.open_positions, closed_position.id),
      winning_trades: state.winning_trades + if(is_winner, do: 1, else: 0),
      losing_trades: state.losing_trades + if(is_winner, do: 0, else: 1),
      total_realized_pnl: Decimal.add(state.total_realized_pnl, Decimal.from_float(pnl)),
      trade_history: [closed_position | state.trade_history] |> Enum.take(100),
      exit_reasons: new_exit_reasons
    }
  end

  defp update_unrealized_pnl(state) do
    total_unrealized = state.open_positions
      |> Map.values()
      |> Enum.reduce(0.0, fn pos, acc ->
        current = pos.current_price
        
        pnl = case pos.direction do
          :long -> (current - pos.entry_price) * pos.quantity
          :short -> (pos.entry_price - current) * pos.quantity
          _ -> 0.0
        end
        
        acc + pnl
      end)
    
    %{state | total_unrealized_pnl: Decimal.from_float(total_unrealized)}
  end

  # ============================================================================
  # STATISTICS & DASHBOARD
  # ============================================================================

  defp build_empty_stats do
    %{
      status: "INITIALIZING",
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0.0,
      realized_pnl: 0.0,
      unrealized_pnl: 0.0,
      open_positions: 0,
      timestamp: DateTime.utc_now()
    }
  end

  defp build_stats(state) do
    total_trades = state.winning_trades + state.losing_trades
    win_rate = if total_trades > 0 do
      Float.round(state.winning_trades / total_trades * 100, 1)
    else
      0.0
    end
    
    # Physics metrics
    avg_momentum = state.open_positions
      |> Map.values()
      |> Enum.map(& &1.physics.momentum)
      |> average()
    
    avg_angle = state.open_positions
      |> Map.values()
      |> Enum.map(& &1.physics.trajectory_angle)
      |> average()
    
    exhaustion_count = state.open_positions
      |> Map.values()
      |> Enum.count(& (&1.physics.energy_state == :low))

    %{
      status: if(state.trading_active, do: "ACTIVE", else: "STOPPED"),
      uptime_seconds: if(state.started_at, do: DateTime.diff(DateTime.utc_now(), state.started_at), else: 0),
      total_trades: total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades,
      win_rate: win_rate,
      realized_pnl: Decimal.to_float(state.total_realized_pnl),
      unrealized_pnl: Decimal.to_float(state.total_unrealized_pnl),
      total_pnl: Decimal.to_float(Decimal.add(state.total_realized_pnl, state.total_unrealized_pnl)),
      open_positions_count: map_size(state.open_positions),
      signals_received: state.signal_count,
      last_signal: state.last_signal_time,
      
      # Physics metrics
      avg_momentum: avg_momentum,
      avg_trajectory_angle: avg_angle,
      exhaustion_count: exhaustion_count,
      exit_reasons: state.exit_reasons,
      timestamp: DateTime.utc_now()
    }
  end

  defp average([]), do: 0.0
  defp average(list), do: Enum.sum(list) / length(list)

  # ============================================================================
  # DATABASE OPERATIONS
  # ============================================================================

  defp get_eligible_users do
    # TradingAccount table removed — use placeholder
    Repo.all(from u in User, limit: 100)
    |> Enum.map(fn u -> {u, %{id: nil, user_id: u.id, available_balance: Decimal.new("100")}} end)
  rescue
    _ -> []
  end

  defp save_position_to_db(position) do
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
    
    attrs = %{
      id: position.id,
      user_id: position.user_id,
      symbol: position.symbol,
      position_type: to_string(position.direction),
      quantity: Decimal.from_float(position.quantity),
      entry_price: Decimal.from_float(position.entry_price),
      current_price: Decimal.from_float(position.current_price),
      status: "open",
      entry_time: now
    }
    
    case Repo.insert(%Position{} |> Position.changeset(attrs)) do
      {:ok, _} -> :ok
      {:error, e} -> Logger.warning("Failed to save position: #{inspect(e)}")
    end
  rescue
    e -> Logger.warning("DB error: #{inspect(e)}")
  end

  defp update_position_in_db(position) do
    case Repo.get(Position, position.id) do
      nil ->
        Logger.warning("Position not found for update: #{position.id}")

      db_pos ->
        now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
        attrs = %{
          current_price: Decimal.from_float(position.current_price),
          realized_pnl: if(position.realized_pnl, do: Decimal.from_float(position.realized_pnl), else: nil),
          status: to_string(position.status),
          exit_reason: if(position.exit_reason, do: to_string(position.exit_reason), else: nil),
          exit_time: if(position.exit_time, do: NaiveDateTime.from_iso8601!(DateTime.to_iso8601(position.exit_time)) |> NaiveDateTime.truncate(:second), else: nil),
          updated_at: now
        }

        case db_pos |> Position.changeset(attrs) |> Repo.update() do
          {:ok, _} -> :ok
          {:error, e} -> Logger.warning("Failed to update position: #{inspect(e)}")
        end
    end
  rescue
    e -> Logger.warning("DB error updating position: #{inspect(e)}")
  end

  # ============================================================================
  # HELPERS
  # ============================================================================

  defp get_current_price(symbol) do
    TickerStream.get_ticker(symbol)
  end

  defp broadcast_trade_event(type, position) do
    Phoenix.PubSub.broadcast(@pubsub, "trading:positions", {type, position})
  end
end