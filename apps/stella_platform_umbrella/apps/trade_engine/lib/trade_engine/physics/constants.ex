defmodule TradeEngine.Physics.Constants do
  @moduledoc """
  Physics constants for the Financial Market Physics Engine.
  """

  # Trajectory Angles
  def min_angle, do: 18.0
  def max_angle, do: 75.0

  # Gravity
  def gravity_range, do: {0.5, 5.0}
  def gravity_multiplier, do: 2.0

  # Thresholds
  def velocity_reversal, do: 0.1
  def energy_exhaustion, do: 0.3
  
  # Confidence
  def confidence_threshold, do: 60.0
end
