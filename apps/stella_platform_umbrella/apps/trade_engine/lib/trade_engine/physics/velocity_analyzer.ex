defmodule TradeEngine.Physics.VelocityAnalyzer do
  @moduledoc """
  ✅ FIXED: Physics Engine - Proper Momentum Calculation
  
  KEY CHANGES:
  - Negative momentum is VALID (bearish/downtrend)
  - Positive momentum is VALID (bullish/uptrend)
  - Returns actual momentum (not absolute value)
  - Momentum = slope of price trend (can be negative)
  """
  require Logger

  @doc """
  Calculate momentum from price series
  
  Returns: float (can be positive or negative)
  - Positive: upward trend (bullish lift)
  - Negative: downward trend (bearish dump/dip)
  """
  def calculate_momentum(prices) when is_list(prices) and length(prices) >= 2 do
    prices = Enum.map(prices, fn
      %Decimal{} = d -> Decimal.to_float(d)
      n when is_number(n) -> n * 1.0
      _ -> 0.0
    end)
    
    # Remove any invalid numbers
    prices = Enum.filter(prices, &is_float/1)
    
    case length(prices) do
      n when n < 2 -> 
        0.0
      _ ->
        # Linear regression: slope = momentum
        n = length(prices)
        x_vals = Enum.to_list(0..(n-1)) |> Enum.map(&(&1 * 1.0))
        
        mean_x = Enum.sum(x_vals) / n
        mean_y = Enum.sum(prices) / n
        
        numerator = Enum.zip(x_vals, prices)
          |> Enum.reduce(0.0, fn {x, y}, acc ->
            acc + (x - mean_x) * (y - mean_y)
          end)
        
        denominator = Enum.map(x_vals, fn x ->
          (x - mean_x) ** 2
        end) |> Enum.sum()
        
        if denominator == 0 do
          0.0
        else
          # ✅ FIX: Keep the sign! Negative momentum is valid!
          momentum = numerator / denominator
          momentum = Float.round(momentum, 6)
          
          direction = if momentum > 0, do: "BULLISH ↑", else: if momentum < 0, do: "BEARISH ↓", else: "NEUTRAL"
          Logger.debug("✅ Momentum calculated: #{momentum} (#{direction}) from #{n} prices")
          
          momentum
        end
    end
  rescue
    e ->
      Logger.warning("⚠️ Momentum calculation error: #{inspect(e)}")
      0.0
  end

  @doc """
  Get absolute speed (magnitude of momentum, ignoring direction)
  Used for confidence scoring and energy calculations
  """
  def get_speed(momentum) do
    abs(momentum)
  end

  @doc """
  Determine direction from momentum value
  """
  def get_direction(momentum) when momentum > 0.0001, do: :bullish
  def get_direction(momentum) when momentum < -0.0001, do: :bearish
  def get_direction(_), do: :neutral

  @doc """
  Calculate current velocity at time t
  v(t) = v₀ - g*t
  
  Where:
  - v₀ = initial momentum
  - g = gravity (market resistance)
  - t = time elapsed (in candles)
  """
  def velocity_at_time(momentum, gravity, time_elapsed) do
    momentum - (gravity * time_elapsed)
  end

  @doc """
  Calculate velocity at peak (when v(t) = 0)
  Used to determine exhaustion point
  """
  def peak_time(momentum, gravity) when gravity > 0 do
    abs(momentum) / gravity
  end
  def peak_time(_, _), do: 999.0

  @doc """
  Detect if velocity has reversed (crossed zero)
  Signals momentum exhaustion
  """
  def has_velocity_reversal?(momentum, gravity, time_held) when time_held > 0 do
    current_v = velocity_at_time(momentum, gravity, time_held)
    
    # Reversal if:
    # 1. Started bullish (momentum > 0) and now velocity <= 0
    # 2. Started bearish (momentum < 0) and now velocity >= 0
    (momentum > 0 and current_v <= 0.0001) or 
    (momentum < 0 and current_v >= -0.0001)
  end
  def has_velocity_reversal?(_, _, _), do: false

  @doc """
  Check if momentum is exhausted (approaching zero)
  """
  def is_exhausted?(momentum, threshold \\ 0.0001) do
    abs(momentum) < threshold
  end
end