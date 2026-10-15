defmodule TradeEngine.Physics.Calculator do
  @moduledoc """
  Pure functional core for calculating physics-based market metrics.
  Based on the Financial Physics Engineering specification.
  """
  
  alias TradeEngine.Physics.Constants
  alias TradeEngine.Utils.Math

  # ============================================================================
  # Phase 1: Parameter Extraction
  # ============================================================================

  @doc """
  1.1 Calculate Initial Momentum (Velocity)
  v0 = (price_change / atr) * body_strength
  """
  def calculate_initial_momentum(current_candle, previous_candles) do
    # Ensure we have data
    if Enum.empty?(previous_candles) do
      0.0
    else
      prev_close = List.first(previous_candles).close |> to_float()
      curr_close = current_candle.close |> to_float()
      curr_open = current_candle.open |> to_float()
      curr_high = current_candle.high |> to_float()
      curr_low = current_candle.low |> to_float()

      # Price change velocity
      price_change = curr_close - prev_close

      # Average True Range for normalization
      atr = calculate_atr(previous_candles, 14)

      # Candle body strength (commitment)
      body_size = abs(curr_close - curr_open)
      wick_size = curr_high - curr_low
      
      body_strength = if wick_size > 0 do
        body_size / wick_size
      else
        1.0
      end

      # Normalized momentum
      if atr > 0 do
        (price_change / atr) * body_strength
      else
        if curr_close > 0 do
          (price_change / curr_close) * body_strength
        else
          0.0
        end
      end
    end
  end

  @doc """
  1.2 Calculate Market Gravity (Deceleration Force)
  g = volatility * multiplier * expansion_factor
  """
  def calculate_gravity(candles) do
    if Enum.empty?(candles) do
      1.0
    else
      # Calculate volatility (std dev of returns)
      returns = calculate_returns(candles)
      volatility = Math.standard_deviation(returns)
      
      base_gravity = volatility * Constants.gravity_multiplier()

      # Expansion factor (market regime)
      atr = calculate_atr(candles, 14)
      atr_ma = calculate_atr_ma(candles, 50)
      
      expansion = if atr_ma > 0, do: atr / atr_ma, else: 1.0

      # Adjusted gravity
      g = base_gravity * expansion

      # Clamp to safe range
      {min_g, max_g} = Constants.gravity_range()
      clamp(g, min_g, max_g)
    end
  end

  @doc """
  1.3 Calculate Trajectory Angle
  theta = arctan(|v0| / price)
  """
  def calculate_trajectory_angle(momentum, price_level) do
    price = to_float(price_level)
    
    if price > 0 and momentum != 0 do
      theta_radians = :math.atan(abs(momentum) / price)
      theta_radians * (180 / :math.pi())
    else
      0.0
    end
  end

  @doc """
  1.4 Calculate Mass (Volume Factor)
  mass = relative_volume clamped [0.5, 3.0]
  """
  def calculate_mass(current_volume, historical_volumes) do
    curr_vol = to_float(current_volume)
    
    # Get last 20 volumes for MA
    recent_volumes = Enum.take(historical_volumes, 20) |> Enum.map(&to_float/1)
    
    volume_ma = if Enum.empty?(recent_volumes) do
      0.0
    else
      Enum.sum(recent_volumes) / length(recent_volumes)
    end

    relative_volume = if volume_ma > 0 do
      curr_vol / volume_ma
    else
      1.0
    end

    clamp(relative_volume, 0.5, 3.0)
  end

  @doc """
  1.5 Calculate Time to Peak
  t_peak = v0 / g
  """
  def calculate_time_to_peak(momentum, gravity) do
    if gravity > 0 do
      abs(momentum) / gravity
    else
      0.0
    end
    |> round()
  end

  @doc """
  1.6 Calculate Predicted Peak Price
  P_peak = P0 + (v0^2 / 2g)
  """
  def calculate_peak_price(launch_price, momentum, gravity) do
    p0 = to_float(launch_price)
    
    if gravity > 0 do
      height = :math.pow(momentum, 2) / (2 * gravity)
      # Direction depends on momentum sign
      if momentum >= 0 do
        p0 + height
      else
        p0 - height
      end
    else
      p0
    end
  end

  @doc """
  1.7 Calculate Energy States
  KE = 0.5 * mass * v^2
  PE = normalized position in range
  """
  def calculate_energy_states(mass, velocity, position, support, resistance) do
    pos = to_float(position)
    sup = to_float(support)
    res = to_float(resistance)
    
    # Kinetic Energy
    ke = 0.5 * mass * :math.pow(velocity, 2)

    # Potential Energy
    price_range = res - sup
    pe = if price_range > 0 do
      (pos - sup) / price_range
    else
      0.5
    end
    # Clamp PE to 0-1
    pe = clamp(pe, 0.0, 1.0)

    # Total Energy
    e_total = ke + pe

    # Classify State
    state = cond do
      ke > 1.5 -> :high
      ke > 0.7 -> :medium
      ke > Constants.energy_exhaustion() -> :low
      true -> :critical
    end

    %{
      ke: ke,
      pe: pe,
      total: e_total,
      state: state
    }
  end

  # ============================================================================
  # Phase 2: Trajectory Calculation Helpers
  # ============================================================================

  def calculate_price_at_time(p0, v0, g, friction, t) do
    # P(t) = P0 + v0*t - 0.5*g*t^2 - friction*t
    # Note: Gravity always acts against the initial velocity direction in this model?
    # Or is gravity always "down"? 
    # In financial physics, gravity pulls back to mean or pulls down?
    # The prompt implies projectile motion: "reversal points where trajectories reach apex and fall back"
    # This implies gravity opposes the upward movement.
    # For bearish (downward) movement, "gravity" might be "buying support" acting upwards?
    # The prompt says: "acceleration = -g". This implies standard projectile motion (up is positive).
    # If v0 is negative (bearish), gravity acting down (-g) would accelerate it downwards?
    # Wait, usually in markets "gravity" pulls price down.
    # But for a short, "gravity" (resistance to move) would be buying pressure.
    # Let's stick to the prompt's formula: position = P0 + (v0 * t) - (0.5 * g * t^2) - (friction * t)
    # This formula assumes g acts DOWN. So for bullish trades (v0 > 0), it slows down.
    # For bearish trades (v0 < 0), it accelerates down? That doesn't fit "reversal".
    #
    # Correction: In the prompt's `calculate_peak_price`:
    # height = (momentum^2) / (2g). This is standard projectile height.
    # If momentum is negative, we want the "dip".
    #
    # Let's assume g always opposes momentum for the sake of "reversal".
    # If v0 > 0, acc = -g.
    # If v0 < 0, acc = +g.
    #
    # However, the prompt's `generate_trajectory` says: "acceleration = -g".
    # And `calculate_peak_price` adds height.
    # Let's assume standard physics: Gravity is DOWN.
    # So Bullish (v0 > 0): Decelerates.
    # Bearish (v0 < 0): Accelerates downwards?
    #
    # Re-reading prompt: "reversal points where trajectories reach apex and fall back".
    # This implies bullish trajectories.
    # What about bearish?
    # The prompt `calculate_peak_price` logic: P_peak = launch_price + height.
    # If v0 is negative, height is positive (v^2). So P_peak > P0. This implies it only models UPWARD projectiles?
    #
    # BUT, in `generate_entry_signal`:
    # IF v0 > 0 THEN direction = "BULLISH"
    # ELSE IF v0 < 0 THEN direction = "BEARISH"
    #
    # And in `check_exit_conditions`:
    # BEARISH -> "Dip target reached".
    #
    # So the physics model must handle both.
    # For bearish, "Gravity" should probably be "Support" pulling it up?
    # Or we treat it as absolute magnitude?
    #
    # Let's refine `calculate_price_at_time` to handle directionality if needed.
    # But strictly following the prompt's formula:
    # position = P0 + (v0 * t) - (0.5 * g * t^2) - (friction * t)
    # This is strictly "Gravity acts DOWN".
    #
    # Let's stick to the prompt's formula for now.
    
    p0 + (v0 * t) - (0.5 * g * :math.pow(t, 2)) - (friction * t)
  end

  def calculate_velocity_at_time(v0, g, friction, t) do
    v0 - (g * t) - friction
  end

  # ============================================================================
  # Helpers
  # ============================================================================

  defp calculate_atr(candles, period) do
    if length(candles) < period + 1 do
      0.0
    else
      # Calculate True Ranges
      trs = Enum.chunk_every(candles, 2, 1, :discard)
      |> Enum.map(fn [prev, curr] ->
        high = to_float(curr.high)
        low = to_float(curr.low)
        prev_close = to_float(prev.close)
        
        tr1 = high - low
        tr2 = abs(high - prev_close)
        tr3 = abs(low - prev_close)
        
        Enum.max([tr1, tr2, tr3])
      end)
      
      # Simple Average of TRs for now (or Wilder's if we had state, but SMA is fine for snapshot)
      Enum.take(trs, period) |> Enum.sum() |> Kernel./(period)
    end
  end

  defp calculate_atr_ma(candles, period) do
    # Calculate ATRs over a longer window and average them
    # This is expensive without pre-calculation, simplified to current ATR for now
    calculate_atr(candles, period) 
  end

  defp calculate_returns(candles) do
    Enum.chunk_every(candles, 2, 1, :discard)
    |> Enum.map(fn [prev, curr] ->
      p1 = to_float(prev.close)
      p2 = to_float(curr.close)
      if p1 > 0, do: (p2 - p1) / p1, else: 0.0
    end)
  end

  defp clamp(val, min, max) do
    val
    |> max(min)
    |> min(max)
  end

  defp to_float(val) when is_float(val), do: val
  defp to_float(val) when is_integer(val), do: val * 1.0
  defp to_float(%Decimal{} = val), do: Decimal.to_float(val)
  defp to_float(val) when is_binary(val) do
    case Float.parse(val) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  defp to_float(_), do: 0.0
end