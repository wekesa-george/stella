defmodule TradeEngine.Physics.EnergyModel do
# ============================================================================
# MODULE 4: ENERGY MODEL
# ============================================================================
  @moduledoc """
  Kinetic energy analysis:
  E_k = ½·m·v²
  
  In trading context:
  E_k = market_mass × momentum²
  
  Energy states:
  - :high (>0.7): Strong momentum
  - :medium (0.3-0.7): Moderate momentum
  - :low (<0.3): Exhausted momentum
  """

  def calculate_kinetic_energy(momentum, price) do
    # Market "mass" proportional to price
    market_mass = price / 100.0
    
    # Kinetic energy: E_k = ½·m·v²
    kinetic_energy = 0.5 * market_mass * (momentum ** 2)
    
    Float.round(kinetic_energy, 4)
  end

  def classify_energy(kinetic_energy) do
    cond do
      kinetic_energy > 0.7 -> :high
      kinetic_energy > 0.3 -> :medium
      true -> :low
    end
  end

  @doc "Calculate bounce energy from peak to support"
  def calculate_bounce_energy(peak_price, support_price, retention_alpha \\ 0.4) do
    # E_bounce = α·(P_peak - P_support)
    # α typical range: 0.25 - 0.60 (market retention)
    
    energy_available = peak_price - support_price
    bounce_energy = energy_available * retention_alpha
    
    Float.round(bounce_energy, 4)
  end

  @doc "Calculate energy decay over time"
  def energy_decay_at_time(initial_energy, decay_rate, time) do
    # E(t) = E₀ · e^(-decay_rate·t)
    decayed = initial_energy * :math.exp(-decay_rate * time)
    Float.round(decayed, 4)
  end
end
