defmodule TradeEngine.Physics.MarketProjectile do
  @moduledoc """
  Market Projectile — Realistic Price Prediction

  Uses normalized momentum (% per candle) to predict price movement.
  Peak price is based on momentum vs gravity balance, clamped to
  volatility-realistic ranges (ATR-based, not arbitrary ±10%).
  """

  require Logger
  alias TradeEngine.Physics.{VelocityAnalyzer, GravityCalculator, EnergyModel, RegimeDetector}

  # Constraints
  @max_peak_time_minutes 120
  @min_peak_time_minutes 1
  @min_gravity 0.00001
  @max_gravity 1.0

  defp safe_round(value, decimals \\ 2)

  defp safe_round(value, decimals) when is_float(value) do
    if value != value do
      0.0
    else
      Float.round(value, decimals)
    end
  end

  defp safe_round(value, decimals) when is_integer(value),
    do: Float.round(value * 1.0, decimals)

  defp safe_round(value, _decimals) when is_number(value), do: value * 1.0
  defp safe_round(_, _), do: 0.0

  def analyze_projectile(candles, order_flow \\ nil) do
    n = length(candles)

    if n < 5 do
      Logger.warning("⚠️ Insufficient candles: #{n}")
      {:error, :insufficient_data}
    else
      try do
        # Extract prices
        prices =
          Enum.map(candles, fn c ->
            case c.close do
              %Decimal{} = d -> Decimal.to_float(d)
              n when is_number(n) -> n * 1.0
              _ -> 0.0
            end
          end)

        current_price = List.last(prices) || 0.0

        if current_price == 0.0 do
          {:error, :invalid_price}
        else
          # 1. NORMALIZED MOMENTUM (% per candle)
          momentum = VelocityAnalyzer.calculate_momentum(prices)

          # 1b. MOMENTUM ACCELERATION (is momentum speeding up or slowing down?)
          accel_result = VelocityAnalyzer.calculate_momentum_acceleration(prices)
          momentum_acceleration = accel_result.acceleration

          # 2. ATR for volatility context
          atr_pct = VelocityAnalyzer.calculate_atr_pct(candles)

          # 3. GRAVITY (unchanged — already normalized)
          raw_gravity = GravityCalculator.calculate_gravity(candles, order_flow)
          gravity = clamp_gravity(raw_gravity)

          Logger.debug(
            "📊 Physics: momentum=#{safe_round(momentum, 6)}, gravity=#{safe_round(gravity, 6)}, atr=#{safe_round(atr_pct, 6)}, price=#{current_price}"
          )

          # 4. PEAK TIME — how many candles until momentum exhausted
          # v(t) = v₀ - g*t → t_peak = |v₀| / g (in candle units)
          raw_peak_candles = if gravity > 0, do: abs(momentum) / gravity, else: 30.0

          # Convert candles to minutes (assuming 5m candles for now)
          peak_time = clamp_peak_time(raw_peak_candles * 5.0)

          # 5. PEAK PRICE — realistic based on normalized momentum
          # P_peak = P₀ * (1 + v₀²/2g) for longs
          # But clamp the move to max 3x ATR (realistic for the timeframe)
          peak_price = calculate_peak_price(current_price, momentum, gravity, atr_pct)

          # 6. TRAJECTORY ANGLE
          trajectory_angle = calculate_trajectory_angle(momentum, gravity)

          # 7. ENERGY
          kinetic_energy = EnergyModel.calculate_kinetic_energy(momentum, current_price)
          energy_state = EnergyModel.classify_energy(kinetic_energy)

          # 8. PHASES
          phases = analyze_phases(current_price, momentum, gravity, peak_price, peak_time)

          # 9. PREDICTIONS
          predictions = %{
            "5m" => predict_clamped(current_price, momentum, gravity, 1, atr_pct),
            "15m" => predict_clamped(current_price, momentum, gravity, 3, atr_pct),
            "30m" => predict_clamped(current_price, momentum, gravity, 6, atr_pct),
            "60m" => predict_clamped(current_price, momentum, gravity, 12, atr_pct)
          }

          # 10. REGIME DETECTION — wrapped for safety
          regime =
            try do
              RegimeDetector.detect(candles)
            rescue
              _ -> %{regime: :unknown, strength: 0.0, details: %{}}
            end

          result = %{
            current_price: safe_round(current_price, 2),
            momentum: safe_round(momentum, 8),
            velocity: safe_round(momentum, 8),
            gravity: safe_round(gravity, 6),
            atr_pct: safe_round(atr_pct, 6),
            momentum_acceleration: safe_round(momentum_acceleration, 8),
            peak_time: safe_round(peak_time, 1),
            peak_price: safe_round(peak_price, 2),
            trajectory_angle: safe_round(trajectory_angle, 2),
            kinetic_energy: safe_round(kinetic_energy, 4),
            energy_state: energy_state,
            time_remaining: safe_round(peak_time, 1),
            phases: phases,
            prediction: predictions,
            regime: regime
          }

          peak_type = if momentum > 0, do: "Peak", else: "Trough"
          move_pct = safe_round(abs(peak_price - current_price) / current_price * 100, 3)

          Logger.info(
            "✅ Physics: #{peak_type}=$#{safe_round(peak_price, 2)} (#{move_pct}%) in #{safe_round(peak_time, 1)}m | v=#{safe_round(momentum, 6)} atr=#{safe_round(atr_pct, 4)}"
          )

          {:ok, result}
        end
      rescue
        e ->
          Logger.error("❌ Physics analysis error: #{inspect(e)}")
          {:error, :calculation_failed}
      end
    end
  end

  # ========================================================================
  # PEAK PRICE — realistic, ATR-clamped
  # ========================================================================

  defp calculate_peak_price(current_price, momentum, gravity, atr_pct)
       when is_number(current_price) and is_number(momentum) and
              is_number(gravity) and gravity > 0 do
    # Physics: peak height = v²/2g (in percentage terms since momentum is normalized)
    height_pct = momentum ** 2 / (2 * gravity)

    # Clamp to max 3x ATR — a move bigger than 3 ATRs in one prediction window
    # is statistically unlikely and indicates the physics model is overfitting noise
    max_move_pct = atr_pct * 3.0

    clamped_height_pct = min(height_pct, max_move_pct)

    peak_price =
      if momentum >= 0 do
        current_price * (1 + clamped_height_pct)
      else
        current_price * (1 - clamped_height_pct)
      end

    # Floor at 0
    peak_price = max(peak_price, current_price * 0.5)
    Float.round(peak_price * 1.0, 2)
  end

  defp calculate_peak_price(price, _, _, _) when is_number(price),
    do: Float.round(price * 1.0, 2)

  defp calculate_peak_price(_, _, _, _), do: 0.0

  # ========================================================================
  # PREDICTIONS — ATR-clamped
  # ========================================================================

  defp predict_clamped(current_price, momentum, gravity, candles_ahead, atr_pct)
       when is_number(current_price) and is_number(momentum) and
              is_number(gravity) and is_number(candles_ahead) do
    p0 = current_price * 1.0
    v0 = momentum * 1.0
    g = gravity * 1.0
    t = candles_ahead * 1.0

    # P(t) = P₀ * (1 + v₀*t - 0.5*g*t²)
    # Using percentage-based momentum
    move_pct = v0 * t - 0.5 * g * t * t
    raw_prediction = p0 * (1 + move_pct)

    # Clamp to ±3 ATR * sqrt(candles) from current
    max_move = atr_pct * 3.0 * :math.sqrt(max(t, 1.0))
    min_price = p0 * (1 - max_move)
    max_price = p0 * (1 + max_move)

    clamped = max(min_price, min(max_price, raw_prediction))
    Float.round(clamped * 1.0, 2)
  end

  defp predict_clamped(current_price, _, _, _, _) when is_number(current_price),
    do: Float.round(current_price * 1.0, 2)

  defp predict_clamped(_, _, _, _, _), do: 0.0

  # ========================================================================
  # HELPERS
  # ========================================================================

  defp clamp_gravity(gravity) when is_number(gravity) and gravity > 0 do
    max(@min_gravity, min(@max_gravity, gravity))
  end

  defp clamp_gravity(_), do: @min_gravity

  defp clamp_peak_time(time) when is_number(time) do
    max(@min_peak_time_minutes, min(@max_peak_time_minutes, time))
  end

  defp clamp_peak_time(_), do: 30.0

  defp calculate_trajectory_angle(momentum, gravity)
       when is_number(momentum) and is_number(gravity) and gravity > 0 do
    # Momentum/gravity ratio gives angle — but now both are in % terms
    angle_rad = :math.atan(momentum / gravity)
    angle_deg = angle_rad * 180 / :math.pi

    if is_float(angle_deg) and not (angle_deg != angle_deg) do
      max(-90.0, min(90.0, Float.round(angle_deg, 2)))
    else
      0.0
    end
  end

  defp calculate_trajectory_angle(_, _), do: 0.0

  defp analyze_phases(current_price, momentum, gravity, peak_price, peak_time) do
    current = current_price * 1.0
    peak = peak_price * 1.0
    mom = momentum * 1.0
    time = peak_time * 1.0

    price_distance = abs(peak - current) * 0.618

    support_level =
      if mom > 0 do
        current - price_distance
      else
        peak + price_distance
      end

    [
      %{
        name: "initial_thrust",
        status: if(abs(mom) > 0.0002, do: "active", else: "inactive"),
        momentum: mom,
        velocity: mom,
        direction: if(mom > 0, do: "bullish", else: "bearish"),
        duration_estimated: time,
        description: if(mom > 0, do: "Bullish lift phase", else: "Bearish dump phase")
      },
      %{
        name: "peak_zone",
        status: if(abs(mom) > 0.00005, do: "approaching", else: "reached"),
        price_target: peak,
        price_type: if(mom > 0, do: "peak", else: "trough"),
        time_to_target: time,
        momentum_at_target: 0.0,
        description: if(mom > 0, do: "Bullish peak", else: "Bearish trough")
      },
      %{
        name: "reversal_potential",
        status: if(mom > 0, do: "bearish_forming", else: "bullish_forming"),
        momentum: -mom,
        gravity_effect: gravity,
        description:
          if(mom > 0, do: "Selling pressure emerging", else: "Buying pressure emerging")
      },
      %{
        name: "bounce_zone",
        support_level: support_level,
        bounce_energy: abs(peak - support_level) * 0.5,
        description:
          if(mom > 0, do: "Oversold rebound zone", else: "Overbought correction zone")
      }
    ]
  end
end
