defmodule TradeEngine.Physics.Engine do
  @moduledoc """
  Main interface for the Financial Physics Engine.
  Orchestrates Phase 3 (Entry Signal Generation) and Phase 4 (Position Management).
  """

  alias TradeEngine.Physics.Calculator
  alias TradeEngine.Physics.Constants
  alias TradeEngine.Physics.Trajectory

  # ============================================================================
  # Phase 3: Entry Signal Generation
  # ============================================================================

  def generate_entry_signal(candles) when length(candles) > 20 do
    current = List.first(candles)
    history = Enum.drop(candles, 1)
    
    # 0. Context (Support/Resistance)
    # Simple 50-period High/Low
    {support, resistance} = calculate_support_resistance(candles)

    # 1. Extract physics parameters
    v0 = Calculator.calculate_initial_momentum(current, history)
    g = Calculator.calculate_gravity(candles)
    theta = Calculator.calculate_trajectory_angle(v0, current.close)
    mass = Calculator.calculate_mass(current.volume, Enum.map(history, & &1.volume))
    
    # Friction heuristic (not defined in prompt, assuming small drag)
    friction = 0.01 * mass

    # 2. Calculate predictions
    t_peak = Calculator.calculate_time_to_peak(v0, g)
    p_peak = Calculator.calculate_peak_price(current.close, v0, g)

    # 3. Calculate energy
    energy = Calculator.calculate_energy_states(mass, v0, current.close, support, resistance)

    # 4. Validate entry
    validation = validate_entry(v0, theta, g, energy)

    if validation.valid do
      # 5. Determine direction
      direction = cond do
        v0 > 0 -> :bullish
        v0 < 0 -> :bearish
        true -> :neutral
      end

      # 6. Calculate confidence
      confidence = calculate_confidence(v0, theta, g, mass, energy.ke)

      # 7. Calculate stop loss
      stop_loss = calculate_stop_loss(current.close, g, mass, direction)

      %{
        valid: true,
        direction: direction,
        confidence: confidence,
        entry_price: to_float(current.close),
        target_price: p_peak,
        stop_loss: stop_loss,
        time_to_peak: t_peak,
        
        # Physics metadata
        physics: %{
          initial_momentum: v0,
          trajectory_angle: theta,
          gravity: g,
          mass: mass,
          kinetic_energy: energy.ke,
          energy_state: energy.state,
          friction: friction
        },
        
        risk_reward_ratio: calculate_risk_reward(current.close, p_peak, stop_loss)
      }
    else
      %{valid: false, reason: validation.reason}
    end
  end

  def generate_entry_signal(_), do: %{valid: false, reason: "Insufficient data"}

  # 3.1 Validate Entry Conditions
  defp validate_entry(momentum, angle, gravity, energy) do
    cond do
      angle < Constants.min_angle() ->
        %{valid: false, reason: "Angle too shallow (#{Float.round(angle, 1)}°)"}
      
      angle > Constants.max_angle() ->
        %{valid: false, reason: "Angle too steep (#{Float.round(angle, 1)}°)"}
      
      abs(momentum) < 0.1 ->
        %{valid: false, reason: "Insufficient momentum"}
      
      gravity > 4.0 ->
        %{valid: false, reason: "Excessive gravity/volatility"}
      
      energy.state == :critical ->
        %{valid: false, reason: "Energy exhausted"}
        
      true ->
        %{valid: true}
    end
  end

  # 3.2 Calculate Entry Confidence
  defp calculate_confidence(momentum, angle, gravity, mass, energy_ke) do
    base_score = 50.0

    # Angle contribution (max +25)
    angle_score = min((angle / 45.0) * 25.0, 25.0)

    # Momentum contribution (max +20)
    momentum_score = min(abs(momentum) * 10.0, 20.0)

    # Mass contribution (max +10)
    mass_score = min(mass * 5.0, 10.0)

    # Gravity penalty
    gravity_penalty = if gravity > 3.0, do: -10.0, else: 0.0

    # Energy bonus
    energy_bonus = if energy_ke > 1.0, do: 5.0, else: 0.0

    score = base_score + angle_score + momentum_score + mass_score + gravity_penalty + energy_bonus
    
    # Clamp 0-100
    score |> max(0.0) |> min(100.0)
  end

  # Helper: Calculate Stop Loss
  # SL = P0 * (1 ± (base_stop% * (2/g) * mass))
  defp calculate_stop_loss(price, g, mass, direction) do
    p0 = to_float(price)
    base_stop_pct = 0.01 # 1% base
    
    # Dynamic multiplier: Lower gravity = tighter stop? 
    # Formula says: (2/g). So Higher gravity = Tighter stop (smaller multiplier).
    # This makes sense: High volatility (high g) usually requires WIDER stops, 
    # but the formula implies the opposite? 
    # "Gravity" here is deceleration. High gravity means price won't go far?
    # Let's trust the formula: (2/g) * mass
    
    multiplier = (2.0 / max(g, 0.1)) * mass
    stop_distance = p0 * base_stop_pct * multiplier

    case direction do
      :bullish -> p0 - stop_distance
      :bearish -> p0 + stop_distance
      _ -> p0
    end
  end

  defp calculate_risk_reward(entry, target, stop) do
    entry = to_float(entry)
    reward = abs(target - entry)
    risk = abs(entry - stop)
    
    if risk > 0, do: reward / risk, else: 0.0
  end

  defp calculate_support_resistance(candles) do
    closes = Enum.map(candles, &to_float(&1.close))
    {Enum.min(closes), Enum.max(closes)}
  end

  defp to_float(val) do
    try do
      cond do
        is_float(val) -> val
        is_integer(val) -> val * 1.0
        is_struct(val, Decimal) -> Decimal.to_float(val)
        true -> 0.0
      end
    rescue
      _ -> 0.0
    end
  end
end
