defmodule TradeEngine.AI.FeatureExtractor do
  @moduledoc """
  Extracts and normalizes features from physics signals for RL Brain input.

  ## Feature Schema (6 inputs)

  | # | Feature              | Description                              | Source                    |
  |---|----------------------|------------------------------------------|---------------------------|
  | 0 | momentum             | Price velocity (v₀)                      | signal.physics.momentum   |
  | 1 | gravity              | Mean reversion strength                  | signal.physics.gravity    |
  | 2 | kinetic_energy       | Move magnitude indicator                 | energy_zones.kinetic_energy |
  | 3 | dist_to_peak_pct     | Distance to predicted peak (%)           | zone_distances.to_peak / price |
  | 4 | dist_to_injection_pct| Distance to injection zone (%)           | zone_distances.to_injection / price |
  | 5 | unrealized_pnl_pct   | Current position P&L (%)                 | position.unrealized_pnl_pct |

  ## Usage

  ```elixir
  features = TradeEngine.AI.FeatureExtractor.extract(signal, position)
  {:ok, decision} = TradeEngine.AI.Brain.decide(features)
  ```
  """

  @doc """
  Extract features from a physics signal and optional position.

  ## Parameters
  - `signal` - Physics signal with energy zones
  - `position` - Optional open position (nil if no position)

  ## Returns
  Map with 6 normalized features ready for AI Brain.
  """
  @spec extract(map(), map() | nil) :: map()
  def extract(signal, position \\ nil) do
    physics = extract_physics(signal)
    energy = extract_energy_zones(signal)
    pnl = extract_pnl(position)
    
    %{
      # Core physics
      momentum: physics.momentum,
      gravity: physics.gravity,
      kinetic_energy: energy.kinetic_energy,
      
      # Zone distances (as percentage of price)
      dist_to_peak_pct: energy.dist_to_peak_pct,
      dist_to_injection_pct: energy.dist_to_injection_pct,
      
      # Position context
      unrealized_pnl_pct: pnl
    }
  end

  @doc """
  Extract features from raw physics calculation output.
  """
  @spec from_physics(map(), float(), map() | nil) :: map()
  def from_physics(physics_result, current_price, position \\ nil) do
    momentum = physics_result[:momentum] || physics_result[:v0] || 0.0
    gravity = physics_result[:gravity] || 0.0001
    
    energy_zones = physics_result[:energy_zones] || %{}
    kinetic_energy = energy_zones[:kinetic_energy] || 0.0
    
    zone_distances = energy_zones[:zone_distances] || %{}
    to_peak = zone_distances[:to_peak] || 0.0
    to_injection = zone_distances[:to_injection] || 0.0
    
    # Convert absolute distances to percentages
    dist_to_peak_pct = if current_price > 0, do: to_peak / current_price, else: 0.0
    dist_to_injection_pct = if current_price > 0, do: to_injection / current_price, else: 0.0
    
    %{
      momentum: clamp(momentum, -1.0, 1.0),
      gravity: gravity,
      kinetic_energy: kinetic_energy,
      dist_to_peak_pct: clamp(dist_to_peak_pct, -0.10, 0.10),
      dist_to_injection_pct: clamp(dist_to_injection_pct, -0.10, 0.10),
      unrealized_pnl_pct: extract_pnl(position)
    }
  end

  @doc """
  Create features for a signal that was converted from legacy format.
  """
  @spec from_signal_map(map()) :: map()
  def from_signal_map(signal) do
    # Handle both atom and string keys
    get = fn key -> 
      signal[key] || signal[to_string(key)] || 0.0
    end
    
    physics = signal[:physics] || signal["physics"] || %{}
    energy_zones = physics[:energy_zones] || physics["energy_zones"] || %{}
    zone_distances = energy_zones[:zone_distances] || energy_zones["zone_distances"] || %{}
    
    price = get.(:price) || get.(:current_price) || 1.0
    
    momentum = physics[:momentum] || physics["momentum"] || 
               physics[:v0] || physics["v0"] || 0.0
    
    gravity = physics[:gravity] || physics["gravity"] || 0.0001
    
    kinetic_energy = energy_zones[:kinetic_energy] || 
                     energy_zones["kinetic_energy"] || 0.0
    
    to_peak = zone_distances[:to_peak] || zone_distances["to_peak"] || 0.0
    to_injection = zone_distances[:to_injection] || zone_distances["to_injection"] || 0.0
    
    %{
      momentum: clamp(momentum, -1.0, 1.0),
      gravity: gravity,
      kinetic_energy: kinetic_energy,
      dist_to_peak_pct: clamp(to_peak / max(price, 0.01), -0.10, 0.10),
      dist_to_injection_pct: clamp(to_injection / max(price, 0.01), -0.10, 0.10),
      unrealized_pnl_pct: 0.0
    }
  end

  # ============================================================================
  # Private Helpers
  # ============================================================================

  defp extract_physics(signal) do
    physics = signal[:physics] || signal["physics"] || %{}
    
    %{
      momentum: physics[:momentum] || physics[:v0] || 0.0,
      gravity: physics[:gravity] || 0.0001
    }
  end

  defp extract_energy_zones(signal) do
    physics = signal[:physics] || signal["physics"] || %{}
    energy_zones = physics[:energy_zones] || %{}
    zone_distances = energy_zones[:zone_distances] || %{}
    
    price = signal[:price] || signal[:current_price] || 1.0
    
    to_peak = zone_distances[:to_peak] || 0.0
    to_injection = zone_distances[:to_injection] || 0.0
    
    %{
      kinetic_energy: energy_zones[:kinetic_energy] || 0.0,
      dist_to_peak_pct: if(price > 0, do: to_peak / price, else: 0.0),
      dist_to_injection_pct: if(price > 0, do: to_injection / price, else: 0.0)
    }
  end

  defp extract_pnl(nil), do: 0.0
  defp extract_pnl(position) do
    pnl_pct = position[:unrealized_pnl_pct] || position["unrealized_pnl_pct"] || 0.0
    clamp(pnl_pct / 100.0, -1.0, 1.0)  # Convert from percentage to decimal
  end

  defp clamp(value, min_val, max_val) do
    value
    |> max(min_val)
    |> min(max_val)
  end
end