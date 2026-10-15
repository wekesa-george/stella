defmodule TradeEngine.Strategies.TrendFollower do
  @moduledoc """
  Multi-timeframe trend following strategy.

  Uses EMAs across multiple timeframes with volume confirmation.
  Enters when macro + intermediate + trigger timeframes align.
  Uses trailing stops to ride trends.

  Config keys:
    - fast_ema: integer (default 9)
    - slow_ema: integer (default 21)
    - signal_ema: integer (default 50) — trend filter
    - timeframes: list (default ["1h", "4h", "1d"])
    - volume_confirmation: boolean (default true)
    - trailing_stop_pct: float (default 2.0)
    - trailing_step_pct: float (default 0.5) — trail step size
    - min_trend_strength: float (default 0.6) — 0-1 alignment score
    - max_positions: integer (default 5)
  """

  @behaviour TradeEngine.Strategies.Behaviour

  @defaults %{
    "fast_ema" => 9,
    "slow_ema" => 21,
    "signal_ema" => 50,
    "timeframes" => ["1h", "4h", "1d"],
    "volume_confirmation" => true,
    "trailing_stop_pct" => 2.0,
    "trailing_step_pct" => 0.5,
    "min_trend_strength" => 0.6,
    "max_positions" => 5
  }

  @impl true
  def strategy_type, do: "core_trend_following"

  @impl true
  def default_config, do: @defaults

  @impl true
  def generate_signal(_candles, _order_flow, _context) do
    # TODO: Implement multi-timeframe trend signal
    # Wire into existing MultiTimeframe module in strategy/multi_timeframe.ex
    {:error, :not_implemented}
  end

  @impl true
  def should_enter?(_signal, _context), do: false

  @impl true
  def should_exit?(_position, _context), do: false

  @impl true
  def calculate_position_size(_signal, context) do
    balance = Map.get(context, :balance, 0.0)
    value = balance * 0.05
    {:ok, value, value}
  end

  @impl true
  def calculate_stop_loss(_signal, entry_price, context) do
    config = Map.merge(@defaults, Map.get(context, :config, %{}))
    trail_pct = config["trailing_stop_pct"] / 100.0
    entry_price * (1 - trail_pct)
  end
end
