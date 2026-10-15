defmodule TradeEngine.MarketData.DetectorUtil do
  @moduledoc """
  Utilities for the Breakout Detector, including data mapping and structs.
  """
  
  # Defines the struct that stores historical telemetry data for R^2 tracking
  defstruct [:timestamp, :r_squared_15m, :r_squared_5m, :r_squared_1m, :velocity_15m, :velocity_5m, :liquidity_pct]

  @doc """
  Maps MultiTimeframe results into the simplified struct needed for detector state.
  """
  def map_mtf_to_detector_data(mtf_data, liquidity_pct) do
    %__MODULE__{
      timestamp: DateTime.utc_now(),
      r_squared_15m: mtf_data.primary.r_squared,
      r_squared_5m: mtf_data.secondary.r_squared,
      r_squared_1m: mtf_data.trigger.r_squared,
      velocity_15m: mtf_data.primary.v0,
      velocity_5m: mtf_data.secondary.v0,
      liquidity_pct: liquidity_pct
    }
  end

  @doc """
  Helper to determine the direction based on 5m velocity.
  """
  def determine_direction(velocity_5m) do
    cond do
      velocity_5m > 0 -> :bullish
      velocity_5m < 0 -> :bearish
      true -> :neutral
    end
  end

  @doc """
  Checks if all three timeframes agree on direction (sign).
  """
  def signs_match?(v1, v2, v3) do
    all_positive = v1 > 0 and v2 > 0 and v3 > 0
    all_negative = v1 < 0 and v2 < 0 and v3 < 0
    all_positive or all_negative
  end

  @doc """
  Returns the average R-squared over the last 'count' periods.
  """
  def average_r_squared(history, count, field) when length(history) > 0 do
    history
    |> Enum.take(count)
    |> Enum.map(& Map.get(&1, field))
    |> Enum.sum()
    |> Kernel./(min(count, length(history)))
  end
  def average_r_squared(_history, _count, _field), do: 0.0

  @doc """
  Returns the average 5m velocity over the last 'count' periods.
  """
  def average_velocity(history, count \\ 5) when length(history) > 0 do
    history
    |> Enum.take(count)
    |> Enum.map(& &1.velocity_5m)
    |> Enum.sum()
    |> Kernel./(min(count, length(history)))
  end
  def average_velocity(_history, _count), do: 0.0
end