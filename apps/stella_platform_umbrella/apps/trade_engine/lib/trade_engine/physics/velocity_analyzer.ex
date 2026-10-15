defmodule TradeEngine.Physics.VelocityAnalyzer do
  @moduledoc """
  Physics Engine - Normalized Momentum Calculation

  Returns momentum as percentage rate of change per candle, not raw $/candle.
  This makes momentum comparable across different price levels and assets.

  Momentum = slope / mean_price → percentage change per candle
  """
  require Logger

  @doc """
  Calculate normalized momentum from price series.

  Returns: float (percentage per candle, e.g., 0.002 = 0.2% per candle)
  - Positive: upward trend (bullish)
  - Negative: downward trend (bearish)
  """
  def calculate_momentum(prices) when is_list(prices) and length(prices) >= 2 do
    prices = Enum.map(prices, fn
      %Decimal{} = d -> Decimal.to_float(d)
      n when is_number(n) -> n * 1.0
      _ -> 0.0
    end)

    prices = Enum.filter(prices, &(is_float(&1) and &1 > 0))

    case length(prices) do
      n when n < 2 ->
        0.0

      _ ->
        n = length(prices)
        x_vals = Enum.to_list(0..(n - 1)) |> Enum.map(&(&1 * 1.0))

        mean_x = Enum.sum(x_vals) / n
        mean_y = Enum.sum(prices) / n

        if mean_y <= 0 do
          0.0
        else
          numerator =
            Enum.zip(x_vals, prices)
            |> Enum.reduce(0.0, fn {x, y}, acc ->
              acc + (x - mean_x) * (y - mean_y)
            end)

          denominator =
            Enum.map(x_vals, fn x -> (x - mean_x) ** 2 end)
            |> Enum.sum()

          if denominator == 0 do
            0.0
          else
            # Raw slope in $/candle
            raw_slope = numerator / denominator

            # Normalize: convert to % per candle relative to mean price
            momentum = raw_slope / mean_y

            momentum = Float.round(momentum, 8)

            direction =
              cond do
                momentum > 0.0001 -> "BULLISH ↑"
                momentum < -0.0001 -> "BEARISH ↓"
                true -> "NEUTRAL"
              end

            Logger.debug(
              "✅ Momentum calculated: #{Float.round(momentum, 6)} (#{direction}) from #{n} prices [slope=#{Float.round(raw_slope, 4)}/candle, mean=$#{Float.round(mean_y, 2)}]"
            )

            momentum
          end
        end
    end
  rescue
    e ->
      Logger.warning("⚠️ Momentum calculation error: #{inspect(e)}")
      0.0
  end

  def calculate_momentum(_), do: 0.0

  @doc """
  Calculate ATR (Average True Range) as percentage of price.
  Used to measure volatility and set realistic targets.
  """
  def calculate_atr_pct(candles) when is_list(candles) and length(candles) >= 2 do
    closes = Enum.map(candles, &safe_float(&1.close))
    highs = Enum.map(candles, &safe_float(&1.high))
    lows = Enum.map(candles, &safe_float(&1.low))

    if Enum.any?(closes, &(&1 <= 0)) do
      0.001
    else
      # True Range for each candle
      true_ranges =
        Enum.zip([highs, lows, closes])
        |> Enum.chunk_every(2, 1, :discard)
        |> Enum.map(fn [{h, l, _prev_c}, {_h2, _l2, _c2}] ->
          # For simplicity, use H-L range (first candle in pair)
          h - l
        end)

      # Also include the first candle's range
      first_range = List.first(highs, 0) - List.first(lows, 0)
      all_ranges = [first_range | true_ranges]

      mean_price = Enum.sum(closes) / length(closes)

      if mean_price > 0 and length(all_ranges) > 0 do
        atr = Enum.sum(all_ranges) / length(all_ranges)
        Float.round(atr / mean_price, 6)
      else
        0.001
      end
    end
  end

  def calculate_atr_pct(_), do: 0.001

  @doc """
  Calculate momentum acceleration — whether momentum is increasing or decreasing.

  Splits prices into two halves, calculates normalized momentum for each,
  and returns the difference. Positive acceleration means momentum is increasing
  (trend strengthening), negative means decelerating (trend weakening).

  Requires at least 10 prices. Returns a map with:
  - `acceleration` — recent_momentum - older_momentum (normalized % per candle)
  - `recent_momentum` — momentum of the second half
  - `older_momentum` — momentum of the first half
  """
  def calculate_momentum_acceleration(prices) when is_list(prices) and length(prices) >= 10 do
    prices = Enum.map(prices, fn
      %Decimal{} = d -> Decimal.to_float(d)
      n when is_number(n) -> n * 1.0
      _ -> 0.0
    end)

    prices = Enum.filter(prices, &(is_float(&1) and &1 > 0))

    if length(prices) < 10 do
      %{acceleration: 0.0, recent_momentum: 0.0, older_momentum: 0.0}
    else
      midpoint = div(length(prices), 2)
      {older_prices, recent_prices} = Enum.split(prices, midpoint)

      older_momentum = calculate_momentum(older_prices)
      recent_momentum = calculate_momentum(recent_prices)

      acceleration = Float.round(recent_momentum - older_momentum, 8)

      Logger.debug(
        "📈 Momentum acceleration: #{Float.round(acceleration, 6)} [recent=#{Float.round(recent_momentum, 6)}, older=#{Float.round(older_momentum, 6)}]"
      )

      %{
        acceleration: acceleration,
        recent_momentum: Float.round(recent_momentum, 8),
        older_momentum: Float.round(older_momentum, 8)
      }
    end
  rescue
    e ->
      Logger.warning("⚠️ Momentum acceleration calculation error: #{inspect(e)}")
      %{acceleration: 0.0, recent_momentum: 0.0, older_momentum: 0.0}
  end

  def calculate_momentum_acceleration(_),
    do: %{acceleration: 0.0, recent_momentum: 0.0, older_momentum: 0.0}

  @doc "Get absolute speed (magnitude of momentum)"
  def get_speed(momentum), do: abs(momentum)

  @doc "Determine direction from momentum value"
  def get_direction(momentum) when momentum > 0.0005, do: :bullish
  def get_direction(momentum) when momentum < -0.0005, do: :bearish
  def get_direction(_), do: :neutral

  @doc """
  Calculate current velocity at time t (in candles).
  v(t) = v₀ - g*t
  """
  def velocity_at_time(momentum, gravity, time_elapsed) do
    momentum - (gravity * time_elapsed)
  end

  @doc "Time to peak (when v(t) = 0)"
  def peak_time(momentum, gravity) when gravity > 0 do
    abs(momentum) / gravity
  end

  def peak_time(_, _), do: 999.0

  @doc "Detect if velocity has reversed (crossed zero)"
  def has_velocity_reversal?(momentum, gravity, time_held) when time_held > 0 do
    current_v = velocity_at_time(momentum, gravity, time_held)

    (momentum > 0 and current_v <= 0.0001) or
      (momentum < 0 and current_v >= -0.0001)
  end

  def has_velocity_reversal?(_, _, _), do: false

  @doc "Check if momentum is exhausted"
  def is_exhausted?(momentum, threshold \\ 0.0002) do
    abs(momentum) < threshold
  end

  defp safe_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp safe_float(n) when is_number(n), do: n * 1.0
  defp safe_float(_), do: 0.0
end
