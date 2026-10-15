defmodule TradeEngine.Physics.Projectile do
  alias TradeEngine.Utils.Math

  def analyze_with_flow(candles, order_book \\ nil) do
    n = length(candles)
    if n < 5 do
      {:error, :insufficient_data}
    else
      prices = Enum.map(candles, &Decimal.to_float(&1.close))
      x_vals = Enum.to_list(0..(n - 1)) |> Enum.map(&(&1 * 1.0))
      
      # 1. Base Kinematics
      {slope, _intercept, r2} = Math.linear_regression(x_vals, prices)
      velocity = slope
      raw_acceleration = Math.solve_quadratic_regression(x_vals, prices)

      # 2. Order Flow (The Fuel)
      {total_vol, total_buy_vol} = Enum.reduce(candles, {0.0, 0.0}, fn c, {tv, tb} ->
        {tv + Decimal.to_float(c.volume), tb + Decimal.to_float(c.taker_buy_volume)}
      end)
      pressure_ratio = if total_vol > 0, do: total_buy_vol / total_vol, else: 0.5
      delta = total_buy_vol - (total_vol - total_buy_vol)

      # 3. Order Book Physics (The Terrain)
      # FIX: Now passing pressure_ratio to handle "Balanced" states
      adjusted_acceleration = if order_book do
        apply_liquidity_physics(raw_acceleration, velocity, order_book, pressure_ratio)
      else
        raw_acceleration
      end

      # 4. Predictions
      current_price = List.last(prices)
      targets = %{
        t_5m:  predict_at_time(current_price, velocity, adjusted_acceleration, 5.0),
        t_30m: predict_at_time(current_price, velocity, adjusted_acceleration, 30.0)
      }

      {:ok, %{
        current_price: current_price,
        velocity: velocity,
        acceleration: adjusted_acceleration,
        r_squared: r2,
        pressure_ratio: pressure_ratio,
        order_flow_delta: delta,
        targets: targets,
        liquidity: order_book
      }}
    end
  end

  defp apply_liquidity_physics(acc, vel, ob, pressure) do
    cond do
      # Case A: Hitting a Wall (Drag)
      # Moving UP into a SELL WALL -> Increase Gravity (Drag)
      vel > 0 and ob.wall == :sell_wall -> acc - 0.05 
      
      # Moving DOWN into a BUY WALL -> Increase Support (Bounce)
      vel < 0 and ob.wall == :buy_wall  -> acc + 0.05

      # Case B: Balanced Book (Free Flow) -> FIX IMPLEMENTED HERE
      # If book is balanced, Order Flow (Pressure) determines the boost
      ob.wall == :balanced ->
        cond do
          # High Buying Pressure (>60%) on flat terrain = Acceleration Boost
          pressure > 0.60 -> acc + 0.02 
          
          # High Selling Pressure (<40%) on flat terrain = Downward Boost
          pressure < 0.40 -> acc - 0.02
          
          # Truly neutral
          true -> acc
        end

      # Default
      true -> acc
    end
  end

  defp predict_at_time(p0, v0, a, t) do
    p0 + (v0 * t) + (0.5 * a * t * t)
  end
end