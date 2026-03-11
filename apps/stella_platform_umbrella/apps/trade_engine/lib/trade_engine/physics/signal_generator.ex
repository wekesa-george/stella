defmodule TradeEngine.Physics.SignalGenerator do
  @moduledoc """
  Signal Generator — Volatility-Aware with Realistic Confidence

  Key principles:
  1. Momentum is normalized (% per candle) — comparable across price levels
  2. Direction requires momentum > 1x ATR per candle (not noise)
  3. Confidence is relative to volatility — strong means significantly above noise
  4. Take profit based on physics peak, clamped to ATR multiples
  5. Stop loss based on ATR, not arbitrary percentages
  """

  require Logger

  @doc """
  Generate complete trading signal from candles.
  Returns {:ok, signal} or {:error, reason}.
  """
  def generate_signal(candles, order_flow \\ nil, symbol \\ "UNKNOWN", asset_opts \\ %{}) when is_list(candles) do
    case TradeEngine.Physics.MarketProjectile.analyze_projectile(candles, order_flow) do
      {:ok, physics} ->
        try do
          momentum = physics.momentum
          gravity = physics.gravity
          atr_pct = physics.atr_pct
          peak_price = physics.peak_price
          peak_time = physics.peak_time
          trajectory_angle = physics.trajectory_angle
          kinetic_energy = physics.kinetic_energy
          energy_state = physics.energy_state
          current_price = physics.current_price
          velocity = physics.velocity

          momentum_acceleration = physics.momentum_acceleration
          regime = physics.regime

          # Direction and confidence — volatility-relative
          {direction, confidence} =
            determine_direction_and_confidence(momentum, gravity, trajectory_angle, energy_state, atr_pct, momentum_acceleration, regime)

          # Entry/exit levels — ATR-based
          {entry_price, stop_loss, take_profit} =
            calculate_levels(current_price, direction, peak_price, atr_pct)

          # Balance point
          balance_point = calculate_balance_point(current_price, momentum, gravity)

          # Energy zones
          energy_zones = classify_energy_zones(physics, balance_point, current_price)

          # Recommendation
          recommendation = format_recommendation(direction, confidence, physics)

          signal = %{
            symbol: symbol,
            direction: direction,
            type: determine_signal_type(direction, confidence),
            confidence: confidence,
            physics: %{
              momentum: momentum,
              velocity: velocity,
              gravity: gravity,
              atr_pct: atr_pct,
              momentum_acceleration: momentum_acceleration,
              peak_time: peak_time,
              peak_price: peak_price,
              trajectory_angle: trajectory_angle,
              kinetic_energy: kinetic_energy,
              energy_state: energy_state,
              current_price: current_price,
              regime: regime
            },
            current_price: Decimal.from_float(current_price),
            entry_price: Decimal.from_float(entry_price),
            stop_loss: Decimal.from_float(stop_loss),
            take_profit: Decimal.from_float(take_profit),
            balance_point: balance_point,
            distance_from_balance: current_price - balance_point,
            energy_zones: energy_zones,
            predictions: %{
              "5m" => physics.prediction["5m"],
              "15m" => physics.prediction["15m"],
              "30m" => physics.prediction["30m"],
              "60m" => physics.prediction["60m"]
            },
            order_flow: order_flow,
            recommendation: recommendation,
            timestamp: DateTime.utc_now()
          }

          Logger.debug("""
          ✅ Signal: #{symbol} #{direction} conf=#{confidence}%
             Entry: $#{Float.round(entry_price, 2)} | TP: $#{Float.round(take_profit, 2)} | SL: $#{Float.round(stop_loss, 2)}
             Momentum: #{Float.round(momentum, 6)} | ATR: #{Float.round(atr_pct, 5)} | m/ATR: #{Float.round(abs(momentum) / max(atr_pct, 0.0001), 2)}x
          """)

          {:ok, signal}
        rescue
          e ->
            Logger.error("❌ Exception in signal generation: #{inspect(e)}")
            {:error, :signal_generation_failed}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  # ========================================================================
  # DIRECTION & CONFIDENCE — Volatility-Relative
  # ========================================================================

  defp determine_direction_and_confidence(momentum, gravity, angle, energy_state, atr_pct, momentum_acceleration, regime) do
    # Momentum-to-ATR ratio: how many ATRs per candle is momentum moving?
    # This is the core measure of signal strength
    momentum_atr_ratio = abs(momentum) / max(atr_pct, 0.0001)

    # Direction: require momentum > 0.3x ATR per candle to have a direction
    # Keep threshold at 0.3 (data median MAR is 0.37 — 0.4 cuts 65% of signals)
    # Instead, use MAR in scoring to penalize weak signals via confidence
    direction =
      cond do
        momentum > atr_pct * 0.3 -> :long
        momentum < -(atr_pct * 0.3) -> :short
        true -> :neutral
      end

    # Confidence scoring — data-driven from 1133 trades across 6 assets, 12 months
    #
    # Key data insights:
    # - Angle >= 75° = 40.4% WR vs < 75° = 44.8% WR → penalize steep angles
    # - Gravity < 0.0003 = 40.0% WR (too thin/noisy) vs 0.0003-0.0005 = 44.0%
    # - KE 0.5-1.0 = 45.1% WR (sweet spot), KE >= 5.0 = 55.6% WR (strong breakout)
    # - KE 1.0-2.0 = 40.8% WR (overextended moderate)
    # - Decelerating momentum = 41.5% WR vs accelerating = 43.6%
    # - MAR 0.3-0.35 weakest, 0.5-0.7 best

    # 1. Momentum strength — data: MAR 0.5-0.7 = 45.7% WR, 0.3-0.5 = 43.1% (0-20 points)
    # Penalize sub-0.35 MAR trades hard (weakest noise bucket)
    momentum_score =
      cond do
        momentum_atr_ratio >= 3.0 -> -5    # Overextended — data shows mean reversion
        momentum_atr_ratio >= 2.0 -> 5     # Strong but risky
        momentum_atr_ratio >= 1.0 -> 15    # Good
        momentum_atr_ratio >= 0.7 -> 20    # Sweet spot — best bucket in data
        momentum_atr_ratio >= 0.5 -> 18    # Also strong
        momentum_atr_ratio >= 0.4 -> 10    # Moderate
        momentum_atr_ratio >= 0.35 -> 5    # Weak — barely above noise
        true -> -5                          # Sub-0.35 — penalize, likely noise
      end

    # 2. Gravity assessment — data shows 0.0003-0.001 is the productive range (0-20 points)
    # Very low gravity (<0.0003) = 40% WR — too thin, erratic moves
    # 0.0003-0.0005 = 44% WR — best. Moderate structure.
    # >= 0.001 = insufficient data but high gravity = choppy
    gravity_score =
      cond do
        gravity < 0.0003 -> 5     # Too low — erratic, no structure
        gravity < 0.0005 -> 20    # Sweet spot — enough structure, not too resistant
        gravity < 0.001 -> 12     # Moderate — acceptable
        gravity < 0.002 -> 0      # High resistance
        true -> -15               # Very high — strongly avoid
      end

    # 3. Momentum/gravity ratio — can the move sustain? (0-15 points)
    mom_gravity_ratio = if gravity > 0, do: abs(momentum) / gravity, else: 0
    sustainability_score =
      cond do
        mom_gravity_ratio >= 5.0 -> 15    # Momentum dominates gravity
        mom_gravity_ratio >= 3.0 -> 10
        mom_gravity_ratio >= 1.5 -> 5
        true -> -5                         # Gravity dominates — likely stalls
      end

    # 4. Trajectory angle — data: angle < 75° = 44.8% WR, >= 75° = 40.4% WR
    # Steep angles = overextended, moderate = sustainable
    abs_angle = abs(angle)
    angle_score =
      cond do
        abs_angle >= 75 -> -10    # Nearly vertical — data shows 40.4% WR, penalize hard
        abs_angle >= 65 -> 0      # Steep but not extreme
        abs_angle >= 45 -> 10     # Strong but sustainable — best zone
        abs_angle >= 25 -> 8      # Moderate — good continuation
        abs_angle >= 10 -> 4      # Gentle trend
        true -> 0
      end

    # 5. Energy state — data: KE 0.5-1.0 = 45.1%, KE <0.5 = 47.1%, KE 1.0-2.0 = 40.8%
    # Lower energy actually performs better (less overextension)
    energy_score =
      case energy_state do
        :high -> 0       # KE > 2.0 = 42-55% depending on extreme. Neutral.
        :medium -> 8     # KE 0.5-2.0 range — decent
        :low -> 10       # KE < 0.5 = 47.1% — best WR, not overextended
        _ -> 0
      end

    # 6. Momentum acceleration — penalty-only (−10 to +0 points)
    # Data: decelerating = 41.5% vs accelerating = 43.6% — modest but real
    acceleration_score =
      cond do
        # Acceleration opposing momentum — trend is DECELERATING
        (momentum > 0 and momentum_acceleration < -0.00005) or
          (momentum < 0 and momentum_acceleration > 0.00005) -> -10

        # Everything else — no adjustment
        true -> 0
      end

    # 7. Regime score — data: ranging = 28.6% WR, trending_up longs = 40.9%
    # Counter-trend and ranging are clear losers
    regime_type = if is_map(regime), do: regime.regime, else: :unknown

    regime_score =
      cond do
        # Ranging market — 28.6% WR, strongly avoid
        regime_type == :ranging -> -20
        # Counter-trend trades — penalize
        regime_type == :trending_up and direction == :short -> -10
        regime_type == :trending_down and direction == :long -> -10
        # Everything else — no boost
        true -> 0
      end

    # 8. Neutral penalty
    neutral_penalty = if direction == :neutral, do: -25, else: 0

    base = 25
    confidence = base + momentum_score + gravity_score + sustainability_score +
                 angle_score + energy_score + acceleration_score + regime_score + neutral_penalty
    confidence = min(max(confidence, 5), 95)

    {direction, confidence}
  end

  # ========================================================================
  # SIGNAL TYPE
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
  # LEVEL CALCULATIONS — ATR-based
  # ========================================================================

  defp calculate_levels(current_price, direction, peak_price, atr_pct) do
    current_price = if is_number(current_price), do: max(current_price, 0.00001), else: 0.00001
    peak_price = if is_number(peak_price), do: max(peak_price, 0.00001), else: current_price
    atr_pct = if is_number(atr_pct) and atr_pct > 0, do: atr_pct, else: 0.005

    # ATR-based levels — data shows 27% of SL hits in first 10min (noise stops)
    # Widening SL from 1.2x to 1.5x ATR gives trades room to breathe
    # R:R at 1.8x balances hit rate vs payoff (2.0x too aggressive, 1.5x too thin)
    sl_distance = current_price * atr_pct * 1.5
    min_tp_distance = sl_distance * 1.8

    case direction do
      :long ->
        entry = current_price
        stop_loss = current_price - sl_distance
        # TP at peak, but enforce minimum R:R
        take_profit = if peak_price > entry do
          max(peak_price, entry + min_tp_distance)
        else
          entry + min_tp_distance
        end
        {entry, stop_loss, take_profit}

      :short ->
        entry = current_price
        stop_loss = current_price + sl_distance
        # TP at trough, but enforce minimum R:R
        take_profit = if peak_price < entry do
          min(peak_price, entry - min_tp_distance)
        else
          entry - min_tp_distance
        end
        {entry, stop_loss, take_profit}

      :neutral ->
        entry = current_price
        stop_loss = current_price - sl_distance
        take_profit = current_price + sl_distance
        {entry, stop_loss, take_profit}
    end
  end

  # ========================================================================
  # BALANCE POINT
  # ========================================================================

  defp calculate_balance_point(current_price, momentum, gravity) do
    if gravity > 0 and is_number(current_price) do
      peak_distance_pct = momentum ** 2 / (2 * gravity)

      balance =
        if momentum >= 0 do
          current_price * (1 + peak_distance_pct / 2)
        else
          current_price * (1 - peak_distance_pct / 2)
        end

      balance = max(balance, current_price * 0.9)
      balance = min(balance, current_price * 1.1)
      Float.round(balance, 2)
    else
      current_price
    end
  end

  # ========================================================================
  # ENERGY ZONES
  # ========================================================================

  defp classify_energy_zones(physics, balance_point, current_price) do
    momentum = physics.momentum
    peak_price = physics.peak_price
    kinetic_energy = physics.kinetic_energy

    peak_distance = abs(peak_price - current_price)
    peak_distance = if peak_distance < 0.00001, do: 0.00001, else: peak_distance

    injection_boundary =
      if momentum > 0,
        do: current_price + peak_distance * 0.33,
        else: current_price - peak_distance * 0.33

    peak_boundary =
      if momentum > 0,
        do: current_price + peak_distance * 0.67,
        else: current_price - peak_distance * 0.67

    current_zone =
      cond do
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
        injection: Float.round(injection_boundary, 2),
        peak: Float.round(peak_boundary, 2),
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
  # RECOMMENDATION
  # ========================================================================

  defp format_recommendation(direction, confidence, physics) do
    momentum = physics.momentum
    angle = physics.trajectory_angle
    energy = physics.energy_state

    case direction do
      :long ->
        if confidence >= 70 do
          "STRONG LONG | momentum=#{Float.round(momentum, 6)} angle=#{angle}° energy=#{energy} conf=#{confidence}%"
        else
          "MODERATE LONG | momentum=#{Float.round(momentum, 6)} conf=#{confidence}%"
        end

      :short ->
        if confidence >= 70 do
          "STRONG SHORT | momentum=#{Float.round(momentum, 6)} angle=#{angle}° energy=#{energy} conf=#{confidence}%"
        else
          "MODERATE SHORT | momentum=#{Float.round(momentum, 6)} conf=#{confidence}%"
        end

      :neutral ->
        "NEUTRAL — no clear direction | momentum=#{Float.round(momentum, 6)} conf=#{confidence}%"
    end
  end
end
