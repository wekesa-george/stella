defmodule TradeEngine.Physics.MarketProjectile do
  @moduledoc """
  ✅ SCALPING OPTIMIZED: Market Projectile with Tight Time Constraints
  
  KEY FEATURES:
  1. ✅ Peak time clamped to max 30 minutes (scalping mode)
  2. ✅ Peak price clamped to ±10% of current price (realistic scalp targets)
  3. ✅ Predictions clamped to realistic ranges
  4. ✅ Gravity floored to prevent time explosion
  """

  require Logger
  alias TradeEngine.Physics.{VelocityAnalyzer, GravityCalculator, EnergyModel}

  # ========================================================================
  # CONSTRAINTS - Optimized for scalping (quick trades)
  # ========================================================================
  
  @max_peak_time_minutes 30       # Max 30 minutes (scalping mode)
  @min_peak_time_minutes 1        # Min 1 minute
  @max_price_change_pct 0.10      # Max ±10% price movement (realistic for scalping)
  @min_gravity 0.00001            # Floor gravity to prevent explosion
  @max_gravity 1.0                # Cap gravity

  # Safe float rounding - handles NaN, Infinity, and non-floats
  defp safe_round(value, decimals \\ 2)
  defp safe_round(value, decimals) when is_float(value) do
    if value != value do  # NaN check
      0.0
    else
      case value do
        :infinity -> 0.0
        :neg_infinity -> 0.0
        v -> Float.round(v, decimals)
      end
    end
  end
  defp safe_round(value, decimals) when is_integer(value), do: Float.round(value * 1.0, decimals)
  defp safe_round(value, _decimals) when is_number(value), do: value * 1.0
  defp safe_round(_, _), do: 0.0

  def analyze_projectile(candles, order_flow \\ nil) do
    n = length(candles)
    
    if n < 5 do
      Logger.warning("⚠️ Insufficient candles: #{n}")
      {:error, :insufficient_data}
    else
      try do
        # Extract prices safely
        prices = Enum.map(candles, fn c ->
          case c.close do
            %Decimal{} = d -> Decimal.to_float(d)
            n when is_number(n) -> n * 1.0
            _ -> 0.0
          end
        end)
        
        current_price = List.last(prices) || 0.0
        
        if current_price == 0.0 do
          Logger.error("❌ Invalid price data")
          {:error, :invalid_price}
        else
          # ========================================================================
          # 1. CALCULATE MOMENTUM
          # ========================================================================
          momentum = VelocityAnalyzer.calculate_momentum(prices)
          momentum = clamp_momentum(momentum)
          
          # ========================================================================
          # 2. CALCULATE GRAVITY - WITH FLOOR
          # ========================================================================
          raw_gravity = GravityCalculator.calculate_gravity(candles, order_flow)
          gravity = clamp_gravity(raw_gravity)
          
          Logger.debug("📊 Physics: momentum=#{safe_round(momentum, 6)}, gravity=#{safe_round(gravity, 6)}, price=#{current_price}")
          
          # ========================================================================
          # 3. CALCULATE PEAK TIME - CLAMPED
          # ========================================================================
          raw_peak_time = if gravity > 0, do: abs(momentum) / gravity, else: @max_peak_time_minutes
          peak_time = clamp_peak_time(raw_peak_time)
          
          # ========================================================================
          # 4. CALCULATE PEAK PRICE - CLAMPED TO ±20%
          # ========================================================================
          peak_price = calculate_peak_price_clamped(current_price, momentum, gravity)
          
          # ========================================================================
          # 5. TRAJECTORY ANGLE
          # ========================================================================
          trajectory_angle = calculate_trajectory_angle(momentum, gravity)
          
          # ========================================================================
          # 6. ENERGY CALCULATIONS
          # ========================================================================
          kinetic_energy = EnergyModel.calculate_kinetic_energy(momentum, current_price)
          energy_state = EnergyModel.classify_energy(kinetic_energy)
          
          # ========================================================================
          # 7. PHASES
          # ========================================================================
          phases = analyze_phases(current_price, momentum, gravity, peak_price, peak_time)
          
          # ========================================================================
          # 8. PREDICTIONS - SCALPING TIMEFRAMES
          # ========================================================================
          predictions = %{
            "1m" => predict_clamped(current_price, momentum, gravity, 1),
            "5m" => predict_clamped(current_price, momentum, gravity, 5),
            "15m" => predict_clamped(current_price, momentum, gravity, 15),
            "30m" => predict_clamped(current_price, momentum, gravity, 30)
          }
          
          # Ensure all values are safe floats
          result = %{
            current_price: safe_round(current_price, 2),
            momentum: safe_round(momentum, 6),
            velocity: safe_round(momentum, 6),
            gravity: safe_round(gravity, 6),
            peak_time: safe_round(peak_time, 1),
            peak_price: safe_round(peak_price, 2),
            trajectory_angle: safe_round(trajectory_angle, 2),
            kinetic_energy: safe_round(kinetic_energy, 4),
            energy_state: energy_state,
            time_remaining: safe_round(peak_time, 1),
            phases: phases,
            prediction: predictions
          }
          
          peak_type = if momentum > 0, do: "Peak", else: "Trough"
          Logger.info("✅ Physics: #{peak_type}=$#{safe_round(peak_price, 2)} in #{safe_round(peak_time, 1)}m | v=#{safe_round(momentum, 6)}")
          
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
  # CLAMPING FUNCTIONS
  # ========================================================================

  defp clamp_momentum(momentum) when is_number(momentum) do
    # Clamp momentum to reasonable range (-1 to 1)
    # Ensure it's a float for Float.round
    momentum_float = momentum * 1.0
    max(-1.0, min(1.0, momentum_float))
  end
  defp clamp_momentum(_), do: 0.0

  defp clamp_gravity(gravity) when is_number(gravity) and gravity > 0 do
    max(@min_gravity, min(@max_gravity, gravity))
  end
  defp clamp_gravity(_), do: @min_gravity

  defp clamp_peak_time(time) when is_number(time) do
    max(@min_peak_time_minutes, min(@max_peak_time_minutes, time))
  end
  defp clamp_peak_time(_), do: 30.0  # Default 30 minutes

  @doc """
  Calculate peak price with clamping to ±20% of current price
  """
  defp calculate_peak_price_clamped(current_price, momentum, gravity) when is_number(current_price) and is_number(momentum) and is_number(gravity) and gravity > 0 do
    # Ensure all are floats
    current = current_price * 1.0
    mom = momentum * 1.0
    grav = gravity * 1.0
    
    # Raw calculation
    momentum_squared = mom ** 2
    height = momentum_squared / (2 * grav)
    
    raw_peak = if mom >= 0 do
      current + height
    else
      current - height
    end
    
    # Clamp to ±20% of current price
    min_price = current * (1 - @max_price_change_pct)
    max_price = current * (1 + @max_price_change_pct)
    
    clamped = max(min_price, min(max_price, raw_peak))
    Float.round(clamped * 1.0, 2)
  end
  defp calculate_peak_price_clamped(price, _, _) when is_number(price), do: Float.round(price * 1.0, 2)
  defp calculate_peak_price_clamped(_, _, _), do: 0.0

  @doc """
  Predict price at future time with clamping
  """
  defp predict_clamped(current_price, momentum, gravity, time_minutes) when is_number(current_price) and is_number(momentum) and is_number(gravity) and is_number(time_minutes) do
    # Ensure all floats
    p0 = current_price * 1.0
    v0 = momentum * 1.0
    g = gravity * 1.0
    t = time_minutes * 1.0
    
    # P(t) = P₀ + v₀*t - 0.5*g*t²
    raw_prediction = p0 + (v0 * t) - (0.5 * g * (t ** 2))
    
    # Clamp to ±20% of current price
    min_price = p0 * (1 - @max_price_change_pct)
    max_price = p0 * (1 + @max_price_change_pct)
    
    clamped = max(min_price, min(max_price, raw_prediction))
    Float.round(clamped * 1.0, 2)
  end
  defp predict_clamped(current_price, _, _, _) when is_number(current_price), do: Float.round(current_price * 1.0, 2)
  defp predict_clamped(_, _, _, _), do: 0.0

  defp calculate_trajectory_angle(momentum, gravity) when is_number(momentum) and is_number(gravity) and gravity > 0 do
    mom = momentum * 1.0
    grav = gravity * 1.0
    
    angle_rad = :math.atan(mom / grav)
    angle_deg = angle_rad * 180 / :math.pi
    
    # Handle NaN/Infinity
    if is_float(angle_deg) and not (angle_deg != angle_deg) do  # NaN check
      max(-90.0, min(90.0, Float.round(angle_deg, 2)))
    else
      0.0
    end
  end
  defp calculate_trajectory_angle(_, _), do: 0.0

  defp analyze_phases(current_price, momentum, gravity, peak_price, peak_time) do
    # Ensure all are floats
    current = current_price * 1.0
    peak = peak_price * 1.0
    mom = momentum * 1.0
    time = peak_time * 1.0
    
    price_distance = abs(peak - current) * 0.618
    
    support_level = if mom > 0 do
      current - price_distance
    else
      peak + price_distance
    end
    
    [
      %{
        name: "initial_thrust",
        status: if(abs(mom) > 0.0001, do: "active", else: "inactive"),
        momentum: mom,
        velocity: mom,
        direction: if(mom > 0, do: "bullish", else: "bearish"),
        duration_estimated: time,
        description: if(mom > 0, do: "Bullish lift phase", else: "Bearish dump phase")
      },
      %{
        name: "peak_zone",
        status: if(abs(mom) > 0.00001, do: "approaching", else: "reached"),
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
        description: if(mom > 0, do: "Selling pressure emerging", else: "Buying pressure emerging")
      },
      %{
        name: "bounce_zone",
        support_level: support_level,
        bounce_energy: abs(peak - support_level) * 0.5,
        description: if(mom > 0, do: "Oversold rebound zone", else: "Overbought correction zone")
      }
    ]
  end
end