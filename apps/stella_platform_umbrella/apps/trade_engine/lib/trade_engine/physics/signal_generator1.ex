defmodule TradeEngine.Physics.SignalGenerator1 do
# ============================================================================
# MODULE 5: TRADING SIGNALS (PHYSICS-BASED)
# ============================================================================
  @moduledoc """
  Generate trading signals using physics-finance model:
  
  1. BULLISH ENTRY: momentum > 0, angle > 18°
  2. TAKE PROFIT: approaching peak (v→0)
  3. BEARISH ENTRY: velocity reversal (v<0)
  4. BOUNCE BUY: energy exhaustion + velocity inflection
  """
  require Logger
  alias TradeEngine.Physics.{MarketProjectile, EnergyModel}

  def generate_signal(candles, order_flow \\ nil) when is_list(candles) do
    case MarketProjectile.analyze_projectile(candles, order_flow) do
      {:ok, physics} ->
        # Extract all physics values
        momentum = physics.momentum
        gravity = physics.gravity
        peak_price = physics.peak_price
        peak_time = physics.peak_time
        trajectory_angle = physics.trajectory_angle
        kinetic_energy = physics.kinetic_energy
        energy_state = physics.energy_state
        current_price = physics.current_price
        velocity = physics.velocity

        # Determine direction and confidence
        {direction, confidence} = determine_direction_and_confidence(physics)

        # Calculate entry and exit levels
        {entry_price, stop_loss, take_profit} = calculate_levels(
          current_price,
          direction,
          peak_price,
          momentum,
          gravity
        )

        # Calculate balance point
        balance_point = calculate_balance_point(current_price, momentum, gravity)

        # Classify energy zones
        energy_zones = classify_energy_zones(physics, balance_point, current_price)

        # Format recommendation
        recommendation = format_recommendation(direction, confidence, physics)

        # Build complete signal
        signal = %{
          symbol: physics.symbol || "UNKNOWN",
          direction: direction,
          type: determine_signal_type(direction, confidence),
          confidence: confidence,
          
          # ========================================================================
          # PHYSICS FIELDS
          # ========================================================================
          physics: %{
            momentum: momentum,
            velocity: velocity,
            gravity: gravity,
            peak_time: peak_time,
            peak_price: peak_price,
            trajectory_angle: trajectory_angle,
            kinetic_energy: kinetic_energy,
            energy_state: energy_state,
            current_price: current_price
          },
          
          # ========================================================================
          # PRICE LEVELS
          # ========================================================================
          current_price: Decimal.from_float(current_price),
          entry_price: Decimal.from_float(entry_price),
          stop_loss: Decimal.from_float(stop_loss),
          take_profit: Decimal.from_float(take_profit),
          
          # ========================================================================
          # ENHANCED FIELDS (Steps 2 & 3)
          # ========================================================================
          balance_point: balance_point,
          distance_from_balance: current_price - balance_point,
          energy_zones: energy_zones,
          
          # ========================================================================
          # PREDICTIONS
          # ========================================================================
          predictions: %{
            "5m" => physics.prediction["5m"],
            "15m" => physics.prediction["15m"],
            "30m" => physics.prediction["30m"],
            "60m" => physics.prediction["60m"]
          },
          
          # ========================================================================
          # ORDER FLOW (if available)
          # ========================================================================
          order_flow: order_flow,
          
          # ========================================================================
          # METADATA
          # ========================================================================
          recommendation: recommendation,
          timestamp: DateTime.utc_now()
        }

        Logger.debug("""
        ✅ Signal generated: #{signal.symbol} #{signal.direction}
           Entry: $#{entry_price}
           TP: $#{take_profit}
           SL: $#{stop_loss}
           Confidence: #{confidence}%
        """)

        {:ok, signal}

      {:error, reason} ->
        Logger.error("❌ Signal generation failed: #{reason}")
        {:error, reason}
    end
  end

  # ========================================================================
  # DIRECTION & CONFIDENCE DETERMINATION
  # ========================================================================

  defp determine_direction_and_confidence(physics) do
    momentum = physics.momentum
    gravity = physics.gravity
    angle = physics.trajectory_angle
    energy = physics.energy_state

    # Determine direction
    direction = cond do
      momentum > 0.0001 -> :long
      momentum < -0.0001 -> :short
      true -> :neutral
    end

    # Base confidence
    base_confidence = 50

    # Momentum boost
    speed = abs(momentum)
    momentum_boost = cond do
      speed > 0.01 -> 25
      speed > 0.005 -> 15
      speed > 0.001 -> 8
      true -> 0
    end

    # Angle boost
    abs_angle = abs(angle)
    angle_boost = cond do
      abs_angle >= 25 -> 15
      abs_angle >= 20 -> 10
      abs_angle >= 15 -> 5
      true -> 0
    end

    # Energy boost
    energy_boost = case energy do
      :high -> 10
      :medium -> 5
      :low -> 0
      _ -> 0
    end

    # Gravity penalty
    gravity_penalty = cond do
      gravity > 0.01 -> -10
      gravity > 0.005 -> -5
      true -> 0
    end

    # Calculate final confidence
    confidence = base_confidence + momentum_boost + angle_boost + energy_boost + gravity_penalty
    confidence = min(max(confidence, 10), 100)

    {direction, confidence}
  end


  def generate_signal1(candles, order_flow \\ nil, current_price \\ nil) do
    case MarketProjectile.analyze_projectile(candles, order_flow) do
      {:ok, physics} ->
        current = current_price || physics.current_price
        signal_type = determine_signal_type(physics, current)
        confidence = calculate_confidence(physics, signal_type)
        
        {:ok, %{
          type: signal_type,
          confidence: confidence,
          physics: physics,
          entry_price: current,
          stop_loss: calculate_stop_loss(physics, signal_type),
          take_profit: calculate_take_profit(physics, signal_type),
          recommendation: format_recommendation(signal_type, confidence, physics)
        }}
      
      {:error, reason} ->
        {:error, reason}
    end
  end
  # ========================================================================
  # SIGNAL TYPE DETERMINATION
  # ========================================================================

  defp determine_signal_type(direction, confidence) do
    case direction do
      :long when confidence >= 70 -> :bullish_strong
      :long when confidence >= 55 -> :bullish_moderate
      :long -> :bullish_weak
      :short when confidence >= 70 -> :bearish_strong
      :short when confidence >= 55 -> :bearish_moderate
      :short -> :bearish_weak
      :neutral -> :neutral
    end
  end
  # ========================================================================
  # LEVEL CALCULATIONS - Fixed
  # ========================================================================

  defp calculate_levels(current_price, direction, peak_price, momentum, gravity) do
    case direction do
      :long ->
        # Long entry: at current, SL below, TP at peak
        entry = current_price
        stop_loss = current_price * 0.98
        take_profit = peak_price * 0.96
        {entry, stop_loss, take_profit}

      :short ->
        # Short entry: at current, SL above, TP at trough (peak for shorts is actually trough)
        entry = current_price
        stop_loss = current_price * 1.02
        take_profit = peak_price  # For shorts, this is already the trough
        {entry, stop_loss, take_profit}

      :neutral ->
        # Neutral: tight stop/profit
        entry = current_price
        stop_loss = current_price * 0.99
        take_profit = current_price * 1.01
        {entry, stop_loss, take_profit}
    end
  end
    # ========================================================================
  # BALANCE POINT CALCULATION
  # ========================================================================

  defp calculate_balance_point(current_price, momentum, gravity) do
    if gravity > 0 do
      peak_distance = (momentum ** 2) / (2 * gravity)

      balance = if momentum >= 0 do
        current_price + (peak_distance / 2)
      else
        current_price - (peak_distance / 2)
      end

      Float.round(balance, 2)
    else
      current_price
    end
  end

  # ========================================================================
  # ENERGY ZONE CLASSIFICATION
  # ========================================================================

  defp classify_energy_zones(physics, balance_point, current_price) do
    momentum = physics.momentum
    gravity = physics.gravity
    peak_price = physics.peak_price
    kinetic_energy = physics.kinetic_energy

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
  # RECOMMENDATION FORMATTING
  # ========================================================================

  defp format_recommendation(direction, confidence, physics) do
    momentum = physics.momentum
    angle = physics.trajectory_angle
    energy = physics.energy_state

    case direction do
      :long ->
        if confidence >= 70 do
          """
          ✅ STRONG LONG SIGNAL
          ├─ Momentum: #{Float.round(momentum, 6)} (positive, uptrend)
          ├─ Angle: #{angle}° (trajectory steep)
          ├─ Energy: #{energy} (potential strong)
          ├─ Confidence: #{confidence}%
          └─ Action: BUY at current, target peak
          """
        else
          """
          🟢 MODERATE LONG SIGNAL
          ├─ Momentum: #{Float.round(momentum, 6)}
          ├─ Confidence: #{confidence}%
          └─ Action: Consider entry with caution
          """
        end

      :short ->
        if confidence >= 70 do
          """
          ❌ STRONG SHORT SIGNAL
          ├─ Momentum: #{Float.round(momentum, 6)} (negative, downtrend)
          ├─ Angle: #{angle}° (trajectory steep downward)
          ├─ Energy: #{energy}
          ├─ Confidence: #{confidence}%
          └─ Action: SHORT/MARGIN CALL, target trough
          """
        else
          """
          🔴 MODERATE SHORT SIGNAL
          ├─ Momentum: #{Float.round(momentum, 6)}
          ├─ Confidence: #{confidence}%
          └─ Action: Consider short with caution
          """
        end

      :neutral ->
        """
        ➖ NEUTRAL SIGNAL
        ├─ Momentum: Near zero
        ├─ Confidence: #{confidence}%
        └─ Action: WAIT for clarity
        """
    end
  end
  defp determine_signal_type1(physics, current_price) do
    momentum = physics.momentum
    gravity = physics.gravity
    kinetic_energy = physics.kinetic_energy
    peak_price = physics.peak_price
    
    cond do
      # BULLISH: Positive momentum, energy available, below peak
      momentum > 0.01 and kinetic_energy > 0.3 and current_price < peak_price * 0.99 ->
        :bullish_lift
      
      # PEAK WARNING: Approaching velocity exhaustion
      momentum > 0 and momentum < 0.005 and current_price > peak_price * 0.95 ->
        :peak_approaching
      
      # BEARISH: Negative momentum, gravity dominance
      momentum < -0.01 ->
        :bearish_dump
      
      # BOUNCE: Low energy + velocity reversal
      kinetic_energy < 0.3 and gravity > 0.1 ->
        :bounce_zone
      
      true ->
        :hold
    end
  end

  defp calculate_confidence(physics, signal_type) do
    base_confidence = case signal_type do
      :bullish_lift -> 60
      :peak_approaching -> 70
      :bearish_dump -> 65
      :bounce_zone -> 55
      :hold -> 30
    end
    
    # Adjust by trajectory angle
    angle_boost = min(physics.trajectory_angle / 18 * 20, 20)
    
    # Adjust by energy state
    energy_boost = case physics.energy_state do
      :high -> 15
      :medium -> 8
      :low -> 0
    end
    
    confidence = base_confidence + angle_boost + energy_boost
    min(round(confidence), 100)
  end

  defp calculate_stop_loss(physics, signal_type) do
    case signal_type do
      :bullish_lift ->
        physics.current_price * 0.98  # 2% below
      :bearish_dump ->
        physics.current_price * 1.02  # 2% above
      _ ->
        physics.current_price
    end
  end

  defp calculate_take_profit(physics, signal_type) do
    case signal_type do
      :bullish_lift ->
        physics.peak_price * 0.96  # Take profit before peak
      :bearish_dump ->
        physics.current_price * 0.97  # Quick profit on dump
      _ ->
        physics.current_price
    end
  end

  defp format_recommendation1(signal_type, confidence, physics) do
    case signal_type do
      :bullish_lift ->
        "🟢 BUY: Bullish lift detected. Momentum=#{Float.round(physics.momentum, 4)}, " <>
        "Peak in #{Float.round(physics.peak_time, 1)} candles @ $#{Float.round(physics.peak_price, 2)}. " <>
        "Confidence: #{confidence}%"
      
      :peak_approaching ->
        "⚠️  TAKE PROFIT: Peak approaching. Velocity near zero. Exit zone: $#{Float.round(physics.take_profit, 2)}"
      
      :bearish_dump ->
        "🔴 SHORT: Bearish momentum detected. Gravity=#{Float.round(physics.gravity, 4)}. " <>
        "Target support: $#{Float.round(physics.peak_price * 0.95, 2)}"
      
      :bounce_zone ->
        "🔵 BOUNCE BUY: Oversold energy. Bounce target: $#{Float.round(physics.peak_price * 0.8, 2)}"
      
      :hold ->
        "⏸️  HOLD: Insufficient signal clarity. Momentum=#{Float.round(physics.momentum, 4)}"
    end
  end
end
