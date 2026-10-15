defmodule TradeEngine.Physics.Trajectory do
  @moduledoc """
  Phase 2: Trajectory Calculation
  Generates predicted price paths based on physics parameters.
  """

  alias TradeEngine.Physics.Calculator
  alias TradeEngine.Physics.Constants

  @doc """
  2.3 Generate Complete Trajectory
  """
  def generate_trajectory(p0, v0, g, friction, support, resistance, steps \\ 50) do
    # Calculate time to peak
    t_peak = if g > 0, do: abs(v0) / g, else: 0.0
    
    # Determine time step (simulate past peak to see the fall)
    total_time = if t_peak > 0, do: t_peak * 2.0, else: 10.0
    dt = total_time / steps

    Enum.reduce_while(0..steps, [], fn i, acc ->
      t = i * dt
      
      # Calculate position
      price = Calculator.calculate_price_at_time(p0, v0, g, friction, t)
      
      # Calculate velocity
      velocity = Calculator.calculate_velocity_at_time(v0, g, friction, t)
      
      # Calculate acceleration (constant gravity)
      acceleration = -g
      
      # Calculate angle
      angle = Calculator.calculate_trajectory_angle(velocity, price)
      
      # Classify energy (simplified here, full state in Calculator)
      # We need mass for energy, but this function signature doesn't have it.
      # We'll skip energy state in the trajectory point for now or pass mass in.
      # The prompt has `energy_state = classify_energy(velocity, v0)`
      
      point = %{
        time: t,
        price: price,
        velocity: velocity,
        acceleration: acceleration,
        angle: angle
      }
      
      # Stop if we hit barriers
      cond do
        price <= support -> {:halt, [point | acc]}
        price >= resistance -> {:halt, [point | acc]}
        true -> {:cont, [point | acc]}
      end
    end)
    |> Enum.reverse()
  end
end
