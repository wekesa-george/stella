# File: apps/trade_engine/lib/trade_engine/market_data/breakout_detector.ex
# Updated to handle new MTF details array format

defmodule TradeEngine.MarketData.BreakoutDetector do
  @moduledoc """
  Detects when consolidation periods end and real trends begin.
  Tracks market state over time to identify "coiling" price action.
  Works with the new 7-timeframe MTF strategy.
  """
  
  use GenServer
  require Logger
  
  # State structure: %{symbol => %{history: [], consolidation_start: time, ...}}
  defstruct symbol_states: %{}
  
  # Thresholds
  @r_squared_breakout_threshold 0.5      # 5m R² must cross this to signal breakout
  @r_squared_consolidation_max 0.35      # Below this = consolidating
  @velocity_surge_multiplier 2.0         # Velocity must increase 2x vs recent avg
  @min_consolidation_minutes 15          # Must consolidate for at least 15min
  
  # ============================================================================
  # PUBLIC API
  # ============================================================================
  
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end
  
  @doc """
  Check if current market conditions represent a breakout.
  Accepts detector_details array from new MTF format.
  """
  def check_breakout(symbol, detector_details, liquidity_pct) do
    GenServer.call(__MODULE__, {:check_breakout, symbol, detector_details, liquidity_pct})
  end
  
  @doc "Get consolidation statistics for a symbol"
  def get_stats(symbol) do
    GenServer.call(__MODULE__, {:get_stats, symbol})
  end
  
  @doc "Reset tracking for a symbol (useful after a breakout completes)"
  def reset(symbol) do
    GenServer.cast(__MODULE__, {:reset, symbol})
  end
  
  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================
  
  @impl true
  def init(_opts) do
    Logger.info("🕵️ Breakout Detector STARTED")
    {:ok, %{symbol_states: %{}}}
  end
  
  @impl true
  def handle_call({:check_breakout, symbol, detector_details, liquidity_pct}, _from, state) do
    # Get or create symbol state
    symbol_state = Map.get(state.symbol_states, symbol, %{
      history: [],
      consolidation_start: nil,
      last_breakout: nil,
      consecutive_low_confidence: 0
    })
    
    # Convert new MTF details format to detector data point
    data_point = map_mtf_details_to_detector_data(detector_details, liquidity_pct)
    
    # Keep last 60 data points (1 hour at 1-minute intervals)
    history = [data_point | symbol_state.history] |> Enum.take(60)
    
    # Detect breakout conditions
    {result, updated_symbol_state} = analyze_for_breakout(symbol, history, symbol_state)
    
    # Update global state
    new_symbol_states = Map.put(state.symbol_states, symbol, updated_symbol_state)
    
    {:reply, result, %{state | symbol_states: new_symbol_states}}
  end
  
  @impl true
  def handle_call({:get_stats, symbol}, _from, state) do
    stats = case Map.get(state.symbol_states, symbol) do
      nil -> {:error, :no_data}
      symbol_state -> calculate_stats(symbol_state)
    end
    {:reply, stats, state}
  end
  
  @impl true
  def handle_cast({:reset, symbol}, state) do
    new_symbol_states = Map.delete(state.symbol_states, symbol)
    {:noreply, %{state | symbol_states: new_symbol_states}}
  end
  
  # ============================================================================
  # DATA CONVERSION
  # ============================================================================

  @doc """
  Convert MTF details array to detector data point
  Details is an array of %{timeframe: "1m"|"5m"|"15m", velocity: ..., r_squared: ..., ...}
  """
  defp map_mtf_details_to_detector_data(details, liquidity_pct) when is_list(details) do
    # Create a map from timeframe name to detail
    details_map = Enum.reduce(details, %{}, fn detail, acc ->
      Map.put(acc, detail.timeframe, detail)
    end)

    # Extract key timeframes (default to 0.0 if not present)
    detail_15m = Map.get(details_map, "15m", default_detail("15m"))
    detail_5m = Map.get(details_map, "5m", default_detail("5m"))
    detail_1m = Map.get(details_map, "1m", default_detail("1m"))

    # Build detector data point
    %{
      r_squared_15m: detail_15m.r_squared,
      r_squared_5m: detail_5m.r_squared,
      r_squared_1m: detail_1m.r_squared,
      velocity_15m: detail_15m.velocity,
      velocity_5m: detail_5m.velocity,
      velocity_1m: detail_1m.velocity,
      acceleration_15m: detail_15m.acceleration,
      acceleration_5m: detail_5m.acceleration,
      acceleration_1m: detail_1m.acceleration,
      pressure_ratio_15m: detail_15m.pressure_ratio,
      pressure_ratio_5m: detail_5m.pressure_ratio,
      pressure_ratio_1m: detail_1m.pressure_ratio,
      liquidity_pct: liquidity_pct,
      timestamp: DateTime.utc_now()
    }
  end

  defp default_detail(timeframe) do
    %{
      timeframe: timeframe,
      r_squared: 0.0,
      velocity: 0.0,
      acceleration: 0.0,
      pressure_ratio: 0.5,
      signal: :neutral,
      targets: %{t_30m: 0.0, t_5m: 0.0}
    }
  end

  # ============================================================================
  # BREAKOUT ANALYSIS LOGIC
  # ============================================================================
  
  defp analyze_for_breakout(_symbol, history, state) when length(history) < 5 do
    # Not enough data yet
    updated_state = %{state | history: history}
    {{:no_signal, :insufficient_data}, updated_state}
  end
  
  defp analyze_for_breakout(symbol, history, state) do
    current = hd(history)
    
    # Check if currently in consolidation
    is_consolidating = current.r_squared_5m < @r_squared_consolidation_max
    
    cond do
      # CASE 1: BREAKOUT DETECTED
      is_breakout?(current, history, state) ->
        consolidation_duration = calculate_consolidation_duration(state)
        
        # Calculate stats for reporting
        avg_prev_r2 = average_r_squared(history, 5, :r_squared_5m)
        avg_prev_vel = average_velocity(history, 5)
        
        details = %{
          type: :breakout,
          direction: determine_direction(current.velocity_5m),
          consolidation_minutes: consolidation_duration,
          r_squared_surge: current.r_squared_5m / max(avg_prev_r2, 0.01),
          velocity_surge: abs(current.velocity_5m) / max(abs(avg_prev_vel), 0.01),
          liquidity_pct: current.liquidity_pct,
          confidence_score: current.r_squared_5m,
          strength: classify_breakout_strength(current.r_squared_5m, avg_prev_r2)
        }
        
        log_breakout(symbol, details)
        
        # Reset state after breakout
        updated_state = %{state | 
          consolidation_start: nil,
          last_breakout: DateTime.utc_now(),
          consecutive_low_confidence: 0,
          history: history
        }
        
        {{:breakout, details}, updated_state}
        
      # CASE 2: ENTERING CONSOLIDATION
      is_consolidating and state.consolidation_start == nil ->
        updated_state = %{state | 
          consolidation_start: DateTime.utc_now(),
          consecutive_low_confidence: 1,
          history: history
        }
        {{:consolidation, 0}, updated_state}
        
      # CASE 3: CONTINUING CONSOLIDATION
      is_consolidating and state.consolidation_start != nil ->
        duration = calculate_consolidation_duration(state)
        consecutive = state.consecutive_low_confidence + 1
        
        updated_state = %{state | 
          consecutive_low_confidence: consecutive,
          history: history
        }
        
        {{:consolidation, duration}, updated_state}
        
      # CASE 4: FALSE BREAKOUT (R² spiked but fell back down)
      not is_consolidating and recent_false_breakout?(history) ->
        Logger.warn("⚠️  #{symbol}: False Breakout Detected - R² spiked then retreated")
        
        updated_state = %{state | 
          consolidation_start: DateTime.utc_now(),  # Restart consolidation tracking
          history: history
        }
        
        {{:false_breakout, :reset}, updated_state}
        
      # CASE 5: NORMAL TRADING
      true ->
        updated_state = %{state | 
          consolidation_start: nil,
          consecutive_low_confidence: 0,
          history: history
        }
        {{:no_signal, :normal}, updated_state}
    end
  end
  
  defp is_breakout?(current, history, state) do
    # 1. Must have been consolidating previously
    if state.consolidation_start do
      # 2. Check consolidation duration
      consolidation_minutes = calculate_consolidation_duration(state)
      
      if consolidation_minutes >= @min_consolidation_minutes do
        # 3. Get recent averages (excluding current point)
        recent_history = Enum.slice(history, 1, 5)
        recent_avg_r2 = average_r_squared(recent_history, 5, :r_squared_5m)
        recent_avg_vel = average_velocity(recent_history, 5)
        
        # 4. Verify Breakout Conditions
        r2_spike = current.r_squared_5m > @r_squared_breakout_threshold and 
                   current.r_squared_5m > (recent_avg_r2 * 1.5)
                   
        vel_surge = abs(current.velocity_5m) > abs(recent_avg_vel) * @velocity_surge_multiplier
        
        aligned = signs_match?(current.velocity_15m, current.velocity_5m, current.velocity_1m)
        
        r2_spike and vel_surge and aligned
      else
        false
      end
    else
      false
    end
  end

  defp recent_false_breakout?(history) when length(history) < 5, do: false
  defp recent_false_breakout?(history) do
    # Check if R² spiked in last 5 data points then retreated
    last_5 = Enum.take(history, 5)
    r_squared_values = Enum.map(last_5, & &1.r_squared_5m)
    
    max_r2 = Enum.max(r_squared_values)
    current_r2 = hd(r_squared_values)
    
    # False breakout if: peaked above threshold then fell back below
    max_r2 > @r_squared_breakout_threshold and 
    current_r2 < @r_squared_consolidation_max and
    max_r2 > current_r2 * 1.5
  end

  # ============================================================================
  # HELPER FUNCTIONS
  # ============================================================================

  defp average_r_squared(history, count, field) do
    history
    |> Enum.take(count)
    |> Enum.map(&Map.get(&1, field, 0.0))
    |> Enum.sum()
    |> then(&(&1 / max(count, 1)))
  end

  defp average_velocity(history, count) do
    history
    |> Enum.take(count)
    |> Enum.map(&Map.get(&1, :velocity_5m, 0.0))
    |> Enum.sum()
    |> then(&(&1 / max(count, 1)))
  end

  defp signs_match?(v1, v2, v3) do
    # All velocities should have same sign (all positive or all negative)
    sign1 = if v1 >= 0, do: 1, else: -1
    sign2 = if v2 >= 0, do: 1, else: -1
    sign3 = if v3 >= 0, do: 1, else: -1
    
    sign1 == sign2 and sign2 == sign3
  end

  defp determine_direction(velocity) when velocity > 0, do: :up
  defp determine_direction(velocity) when velocity < 0, do: :down
  defp determine_direction(_), do: :neutral

  defp classify_breakout_strength(current_r2, prev_avg_r2) do
    ratio = current_r2 / max(prev_avg_r2, 0.01)
    cond do
      ratio > 3.0 -> :very_strong
      ratio > 2.0 -> :strong
      ratio > 1.5 -> :moderate
      true -> :weak
    end
  end

  defp calculate_consolidation_duration(state) do
    case state.consolidation_start do
      nil -> 0
      start_time -> DateTime.diff(DateTime.utc_now(), start_time, :minute)
    end
  end
  
  defp calculate_stats(symbol_state) do
    case symbol_state.history do
      [] -> {:ok, %{message: "No data collected yet"}}
      history ->
        %{
          data_points: length(history),
          consolidation_duration: calculate_consolidation_duration(symbol_state),
          current_5m_r_squared: hd(history).r_squared_5m,
          average_5m_r_squared: average_r_squared(history, min(20, length(history)), :r_squared_5m),
          last_breakout: symbol_state.last_breakout,
          consecutive_low_confidence_periods: symbol_state.consecutive_low_confidence
        }
    end
  end

  defp log_breakout(symbol, details) do
    Logger.warn("""
    🚀 BREAKOUT DETECTED: #{symbol}
       Direction: #{String.upcase(to_string(details.direction))}
       Strength: #{inspect(details.strength)}
       Consolidation: #{details.consolidation_minutes} mins
       R² Surge: #{Float.round(details.r_squared_surge, 1)}x
       Vel Surge: #{Float.round(details.velocity_surge, 1)}x
       Liquidity: #{Float.round(details.liquidity_pct, 1)}%
       Confidence: #{Float.round(details.confidence_score * 100, 1)}%
    """)
  end
end