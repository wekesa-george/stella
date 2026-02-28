defmodule TradeEngine.Strategy.CandleBridge do
  @moduledoc """
  🕯️ CANDLE BRIDGE - Enhanced with Balance Point & Energy Zones
  
  OPTIMIZATION STEP 1 & 2:
  1. ✅ Peak price fix deployed
  2. ✅ Explicit balance point marker added
  3. ✅ Enhanced energy zone visualization
  """

  use GenServer
  require Logger

  alias TradeEngine.Physics.{MarketProjectile, VelocityAnalyzer}
  alias TradeEngine.Exchanges.Binance.{DepthStream}

  @pubsub TradeEngine.PubSub
  @candle_table :binance_candle_cache

  # PUBLIC API
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def analyze_now(symbol) do
    GenServer.call(__MODULE__, {:analyze_now, symbol}, 10_000)
  end

  def get_signals do
    GenServer.call(__MODULE__, :get_signals, 10_000)
  end

  def get_signal(symbol) do
    GenServer.call(__MODULE__, {:get_signal, symbol}, 10_000)
  end

  def status do
    GenServer.call(__MODULE__, :status, 10_000)
  end

  # GENSERVER INIT
  @impl true
  def init(_opts) do
    Logger.info("""
    
    🕯️ CandleBridge OPTIMIZED - Enhanced Analysis Engine
    ═════════════════════════════════════════════════════════════════
    ✅ Step 1: Peak price fix deployed
    ✅ Step 2: Balance point added
    ✅ Step 3: Energy zones enhanced
    Ready for: Step 4 (prediction tracking) & Step 5 (momentum validation)
    ═════════════════════════════════════════════════════════════════
    """)
    
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:5m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:15m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:1h")
    
    state = %{
      signals: %{},
      signal_count: 0,
      total_analyses: 0,
      symbols: [],
      last_signal_time: nil,
      started_at: DateTime.utc_now()
    }
    
    {:ok, state}
  end

  # GENSERVER HANDLERS
  @impl true
  def handle_call({:analyze_now, symbol}, _from, state) do
    symbol_upper = String.upcase(symbol)
    
    case analyze_symbol_physics(symbol_upper) do
      {:ok, signal} ->
        new_signals = Map.put(state.signals, symbol_upper, signal)
        new_symbols = if symbol_upper in state.symbols, do: state.symbols, else: [symbol_upper | state.symbols]
        
        Logger.info("📢 Signal: #{symbol_upper} #{signal.direction} (#{signal.confidence}%)")
        broadcast_signal(signal)
        
        new_state = %{state |
          signals: new_signals,
          signal_count: state.signal_count + 1,
          total_analyses: state.total_analyses + 1,
          symbols: new_symbols,
          last_signal_time: DateTime.utc_now()
        }
        
        {:reply, {:ok, signal}, new_state}
      
      {:error, reason} ->
        Logger.debug("⚠️ Analysis failed for #{symbol_upper}: #{reason}")
        {:reply, {:error, reason}, %{state | total_analyses: state.total_analyses + 1}}
    end
  end

  @impl true
  def handle_call(:get_signals, _from, state) do
    {:reply, state.signals, state}
  end

  @impl true
  def handle_call({:get_signal, symbol}, _from, state) do
    signal = Map.get(state.signals, String.upcase(symbol))
    {:reply, signal, state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    status = %{
      symbols: length(state.symbols),
      signal_count: state.signal_count,
      total_analyses: state.total_analyses,
      last_signal_time: state.last_signal_time,
      active_signals: map_size(state.signals),
      started_at: state.started_at,
      uptime_seconds: DateTime.diff(DateTime.utc_now(), state.started_at)
    }
    {:reply, {:ok, status}, state}
  end

  # PUBSUB MESSAGE HANDLING
  @impl true
  def handle_info({:candle_closed, candle}, state) do
    symbol = candle.symbol
    timeframe = candle.timeframe
    
    Logger.debug("🕯️ Candle closed: #{symbol} #{timeframe}")
    
    case analyze_symbol_physics(symbol) do
      {:ok, signal} ->
        new_signals = Map.put(state.signals, symbol, signal)
        new_symbols = if symbol in state.symbols, do: state.symbols, else: [symbol | state.symbols]
        
        Logger.info("📢 Signal: #{symbol} #{signal.direction} (#{signal.confidence}%) @ #{timeframe}")
        broadcast_signal(signal)
        
        new_state = %{state |
          signals: new_signals,
          signal_count: state.signal_count + 1,
          total_analyses: state.total_analyses + 1,
          symbols: new_symbols,
          last_signal_time: DateTime.utc_now()
        }
        
        {:noreply, new_state}
      
      {:error, reason} ->
        Logger.debug("⚠️ Analysis error: #{reason}")
        {:noreply, %{state | total_analyses: state.total_analyses + 1}}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ========================================================================
  # CORE ANALYSIS
  # ========================================================================

  defp analyze_symbol_physics(symbol) do
    symbol_upper = String.upcase(symbol)
    
    case get_candles_from_ets(symbol_upper) do
      candles when is_list(candles) and length(candles) >= 5 ->
        Logger.debug("📊 Got #{length(candles)} candles for #{symbol_upper} from ETS")
        run_physics_analysis(symbol_upper, candles)
      
      candles when is_list(candles) ->
        Logger.debug("⚠️ Only #{length(candles)} candles for #{symbol_upper} (need 5+)")
        {:error, :insufficient_candles}
      
      _ ->
        Logger.warning("⚠️ No candle data for #{symbol_upper}")
        {:error, :no_candles}
    end
  end

  defp get_candles_from_ets(symbol) do
    all_entries = :ets.tab2list(@candle_table)
    
    symbol_entries = Enum.filter(all_entries, fn {{sym, _tf}, _candle_data} -> 
      sym == symbol 
    end)
    
    if Enum.empty?(symbol_entries) do
      Logger.debug("❌ No ETS entries for #{symbol}")
      []
    else
      by_timeframe = Enum.group_by(
        symbol_entries,
        fn {{_sym, tf}, _candle_data} -> tf end,
        fn {_key, candle_data} -> candle_data end
      )
      
      Enum.each(by_timeframe, fn {tf, candle_lists} ->
        total = Enum.reduce(candle_lists, 0, fn list, acc ->
          if is_list(list), do: length(list) + acc, else: acc + 1
        end)
        Logger.debug("   #{symbol} #{tf}: #{total} candle(s)")
      end)
      
      {_best_tf, best_candle_lists} = Enum.max_by(
        by_timeframe, 
        fn {_tf, candle_lists} ->
          Enum.reduce(candle_lists, 0, fn list, acc ->
            if is_list(list), do: length(list) + acc, else: acc + 1
          end)
        end,
        fn -> {"5m", [[]]} end
      )
      
      flattened_candles = best_candle_lists
        |> List.flatten()
        |> Enum.filter(fn item -> is_map(item) and Map.has_key?(item, :timestamp) end)
      
      flattened_candles
        |> Enum.sort_by(fn candle -> candle.timestamp end, {:asc, DateTime})
    end
  end

  # ========================================================================
  # RUN PHYSICS ANALYSIS - ENHANCED WITH BALANCE POINT
  # ========================================================================

  defp run_physics_analysis(symbol, candles) do
    try do
      order_flow = case DepthStream.get_order_flow(symbol) do
        {:ok, flow} -> flow
        _ -> nil
      end
      
      case MarketProjectile.analyze_projectile(candles, order_flow) do
        {:ok, physics} ->
          momentum = physics.momentum
          velocity = physics.velocity
          gravity = physics.gravity
          peak_price = physics.peak_price
          peak_time = physics.peak_time
          trajectory_angle = physics.trajectory_angle
          kinetic_energy = physics.kinetic_energy
          energy_state = physics.energy_state
          current_price = physics.current_price
          
          {direction, confidence} = determine_direction_and_confidence(physics)
          {entry, stop_loss, take_profit} = calculate_levels(current_price, direction, peak_price)
          
          # ✅ STEP 2: Calculate balance point (equilibrium)
          balance_point = calculate_balance_point(current_price, momentum, gravity)
          
          # ✅ STEP 3: Enhanced energy zone classification
          energy_zones = classify_energy_zones(physics, balance_point, current_price)
          
          signal = %{
            symbol: symbol,
            direction: direction,
            confidence: confidence,
            entry_price: Decimal.from_float(entry),
            current_price: Decimal.from_float(current_price),
            stop_loss: Decimal.from_float(stop_loss),
            take_profit: Decimal.from_float(take_profit),
            
            # PHYSICS FIELDS
            momentum: momentum,
            velocity: velocity,
            gravity: gravity,
            peak_price: peak_price,
            peak_time: peak_time,
            trajectory_angle: trajectory_angle,
            kinetic_energy: kinetic_energy,
            energy_state: energy_state,
            
            # ✅ NEW: BALANCE POINT (Step 2)
            balance_point: balance_point,
            distance_from_balance: current_price - balance_point,
            
            # ✅ NEW: ENERGY ZONES (Step 3)
            energy_zones: energy_zones,
            
            # ORDER FLOW & PREDICTIONS
            order_flow: order_flow,
            target_5m: physics.prediction["5m"],
            target_30m: physics.prediction["30m"],
            target_15m: physics.prediction["15m"],
            target_60m: physics.prediction["60m"],
            
            timestamp: DateTime.utc_now()
          }
          
          Logger.debug("✅ Physics: v₀=#{Float.round(momentum, 6)}, balance=#{Float.round(balance_point, 2)}, energy_zones=#{inspect(energy_zones)}")
          {:ok, signal}
        
        {:error, reason} ->
          Logger.warning("⚠️ Physics analysis failed: #{reason}")
          {:error, reason}
      end
    rescue
      e ->
        Logger.error("❌ Analysis crash: #{inspect(e)}")
        {:error, :crash}
    end
  end

  # ========================================================================
  # ✅ STEP 2: BALANCE POINT CALCULATION
  # ========================================================================
  
  @doc """
  Calculate the equilibrium/balance point
  
  This is the price level where market forces are balanced:
  - Above = bullish zone (prices elevated)
  - Below = bearish zone (prices depressed)
  - At = neutral equilibrium
  
  Formula: Balance = Peak/Trough midpoint + gravity adjustment
  """
  defp calculate_balance_point(current_price, momentum, gravity) do
    if gravity > 0 do
      # Distance from current to peak/trough
      peak_distance = (momentum ** 2) / (2 * gravity)
      
      # For bullish: balance is between current and peak
      # For bearish: balance is between current and trough
      balance = if momentum >= 0 do
        # Bullish: midpoint between current and peak
        current_price + (peak_distance / 2)
      else
        # Bearish: midpoint between trough and current
        current_price - (peak_distance / 2)
      end
      
      Float.round(balance, 2)
    else
      current_price  # No gravity = no balance point change
    end
  end

  # ========================================================================
  # ✅ STEP 3: ENHANCED ENERGY ZONES
  # ========================================================================
  
  @doc """
  Classify energy zones based on physics model
  
  Returns detailed energy zone information:
  - injection_zone: Where momentum enters
  - peak_zone: Where energy exhausts
  - dissipation_zone: Where gravity wins
  - bounce_zone: Where reversal happens
  """
  defp classify_energy_zones(physics, balance_point, current_price) do
    momentum = physics.momentum
    gravity = physics.gravity
    peak_price = physics.peak_price
    kinetic_energy = physics.kinetic_energy
    
    # Calculate zone boundaries
    peak_distance = abs(peak_price - current_price)
    
    injection_boundary = if momentum > 0 do
      current_price + (peak_distance * 0.33)
    else
      current_price - (peak_distance * 0.33)
    end
    
    peak_boundary = if momentum > 0 do
      current_price + (peak_distance * 0.67)
    else
      current_price - (peak_distance * 0.67)
    end
    
    # Determine current zone
    current_zone = cond do
      momentum > 0 and current_price < injection_boundary -> :injection
      momentum > 0 and current_price < peak_boundary -> :rising
      momentum > 0 and current_price < peak_price -> :peaking
      momentum < 0 and current_price > injection_boundary -> :injection
      momentum < 0 and current_price > peak_boundary -> :falling
      momentum < 0 and current_price > peak_price -> :bottoming
      true -> :neutral
    end
    
    %{
      current_zone: current_zone,
      energy_level: physics.energy_state,
      kinetic_energy: Float.round(kinetic_energy, 4),
      zone_boundaries: %{
        injection: injection_boundary,
        peak: peak_boundary,
        balance_point: balance_point
      },
      zone_distances: %{
        to_peak: Float.round(peak_distance, 2),
        to_balance: Float.round(abs(current_price - balance_point), 2),
        to_injection: Float.round(abs(current_price - injection_boundary), 2)
      }
    }
  end

  # ========================================================================
  # DIRECTION & CONFIDENCE
  # ========================================================================

  defp determine_direction_and_confidence(physics) do
    momentum = physics.momentum
    gravity = physics.gravity
    angle = physics.trajectory_angle
    energy = physics.energy_state
    
    direction = cond do
      momentum > 0.0001 -> :long
      momentum < -0.0001 -> :short
      true -> :neutral
    end
    
    base_confidence = 50
    
    speed = abs(momentum)
    momentum_boost = cond do
      speed > 0.01 -> 25
      speed > 0.005 -> 15
      speed > 0.001 -> 8
      true -> 0
    end
    
    abs_angle = abs(angle)
    angle_boost = cond do
      abs_angle >= 25 -> 15
      abs_angle >= 20 -> 10
      abs_angle >= 15 -> 5
      true -> 0
    end
    
    energy_boost = case energy do
      :high -> 10
      :medium -> 5
      :low -> 0
      _ -> 0
    end
    
    gravity_penalty = cond do
      gravity > 0.01 -> -10
      gravity > 0.005 -> -5
      true -> 0
    end
    
    confidence = base_confidence + momentum_boost + angle_boost + energy_boost + gravity_penalty
    confidence = min(max(confidence, 10), 100)
    
    {direction, confidence}
  end

  # ========================================================================
  # LEVEL CALCULATIONS
  # ========================================================================

  defp calculate_levels(current_price, direction, peak_price) do
    case direction do
      :long ->
        {current_price, current_price * 0.98, peak_price * 0.96}
      
      :short ->
        {current_price, current_price * 1.02, peak_price}
      
      :neutral ->
        {current_price, current_price * 0.98, current_price * 1.02}
    end
  end

  # ========================================================================
  # BROADCAST
  # ========================================================================

  defp broadcast_signal(signal) do
    Phoenix.PubSub.broadcast(@pubsub, "signals:all", {:signal, signal})
    Phoenix.PubSub.broadcast(@pubsub, "signals:#{signal.symbol}", {:signal, signal})
  end
end