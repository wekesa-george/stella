defmodule TradeEngine.Physics.RiskManagement do
# ============================================================================
# MODULE 6: RISK MANAGEMENT (PHYSICS-BASED)
# ============================================================================
  @moduledoc """
  Risk sizing using physics model:
  - Position size inversely proportional to gravity
  - Stop loss based on peak-to-bottom range
  - Max hold time based on peak_time
  """

  alias TradeEngine.Physics.EnergyModel

  def calculate_position_size(account_balance, physics, risk_percent \\ 0.02) do
    # Risk is inversely proportional to gravity (higher gravity = more risk)
    gravity_risk_factor = min(physics.gravity * 5, 1.0)
    
    # Adjusted risk based on energy state
    energy_factor = case physics.energy_state do
      :high -> 1.0
      :medium -> 0.8
      :low -> 0.5
    end
    
    effective_risk = risk_percent * gravity_risk_factor * energy_factor
    position_size = account_balance * effective_risk
    
    position_size
  end

  def calculate_optimal_exit_time(physics) do
    # Exit time should be related to peak_time
    # Exit at 1.2x peak_time to catch momentum reversal
    physics.peak_time * 1.2
  end

  def calculate_drawdown_risk(physics) do
    # Maximum expected drawdown based on peak-to-bottom
    physics.peak_price - (physics.current_price * 0.95)
  end

  def validate_trade(physics, min_confidence \\ 55, min_angle \\ 18.0) do
    cond do
      physics.trajectory_angle < min_angle ->
        {:error, "Angle too shallow: #{physics.trajectory_angle}° < #{min_angle}°"}
      
      physics.kinetic_energy < 0.2 ->
        {:error, "Insufficient energy: #{physics.kinetic_energy} < 0.2"}
      
      true ->
        :ok
    end
  end
end