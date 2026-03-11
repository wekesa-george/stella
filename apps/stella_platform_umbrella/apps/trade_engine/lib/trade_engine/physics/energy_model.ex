defmodule TradeEngine.Physics.EnergyModel do
  @moduledoc """
  Kinetic energy analysis for normalized momentum.

  E_k = ½ · m · v²
  With normalized momentum (% per candle), we use a dimensionless mass
  so energy is directly comparable across price levels.

  Energy states:
  - :high — strong momentum, likely to reach target
  - :medium — moderate momentum
  - :low — weak/exhausted momentum
  """

  def calculate_kinetic_energy(momentum, _price) do
    # With normalized momentum (e.g., 0.002 = 0.2%/candle),
    # use a fixed mass so energy is purely about momentum strength.
    # Scale factor 1e6 puts typical values in a useful range:
    # momentum=0.001 → E=0.5, momentum=0.002 → E=2.0, momentum=0.003 → E=4.5
    kinetic_energy = 0.5 * 1_000_000 * (momentum ** 2)

    Float.round(kinetic_energy, 4)
  end

  def classify_energy(kinetic_energy) do
    cond do
      kinetic_energy > 2.0 -> :high      # momentum > ~0.002 (0.2%/candle)
      kinetic_energy > 0.5 -> :medium    # momentum > ~0.001 (0.1%/candle)
      true -> :low
    end
  end

  @doc "Calculate bounce energy from peak to support"
  def calculate_bounce_energy(peak_price, support_price, retention_alpha \\ 0.4) do
    energy_available = peak_price - support_price
    bounce_energy = energy_available * retention_alpha
    Float.round(bounce_energy, 4)
  end

  @doc "Calculate energy decay over time"
  def energy_decay_at_time(initial_energy, decay_rate, time) do
    decayed = initial_energy * :math.exp(-decay_rate * time)
    Float.round(decayed, 4)
  end
end
