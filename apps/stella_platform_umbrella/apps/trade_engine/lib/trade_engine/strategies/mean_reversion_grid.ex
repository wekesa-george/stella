defmodule TradeEngine.Strategies.MeanReversionGrid do
  @moduledoc """
  Mean Reversion Grid strategy.

  Places grid orders around a moving average (EMA). When price deviates
  from the mean, the strategy buys (below mean) or sells (above mean),
  profiting from reversion to the mean.

  Different from pure GridBot: grid levels are anchored to EMA, not fixed prices.

  Config keys:
    - ema_period: integer (default 20) — EMA lookback
    - grid_levels: integer (default 8) — orders per side
    - grid_spacing_pct: float (default 0.8) — % between grid lines
    - position_size_pct: float (default 5.0) — % of capital per grid order
    - rebalance_mode: string (default "auto") — "auto" | "manual"
    - max_deviation_pct: float (default 5.0) — pause if price deviates beyond this
  """

  @behaviour TradeEngine.Strategies.Behaviour

  @defaults %{
    "ema_period" => 20,
    "grid_levels" => 8,
    "grid_spacing_pct" => 0.8,
    "position_size_pct" => 5.0,
    "rebalance_mode" => "auto",
    "max_deviation_pct" => 5.0,
    "max_positions" => 16
  }

  @impl true
  def strategy_type, do: "core_mean_reversion"

  @impl true
  def default_config, do: @defaults

  @impl true
  def generate_signal(_candles, _order_flow, _context) do
    # TODO: Implement mean reversion signal
    # Calculate EMA, determine grid levels, generate buy/sell at deviations
    {:error, :not_implemented}
  end

  @impl true
  def should_enter?(_signal, _context), do: false

  @impl true
  def should_exit?(_position, _context), do: false

  @impl true
  def calculate_position_size(_signal, context) do
    config = Map.merge(@defaults, Map.get(context, :config, %{}))
    balance = Map.get(context, :balance, 0.0)
    pct = config["position_size_pct"] / 100.0
    value = balance * pct
    {:ok, value, value}
  end

  @impl true
  def calculate_stop_loss(_signal, entry_price, context) do
    config = Map.merge(@defaults, Map.get(context, :config, %{}))
    max_dev = config["max_deviation_pct"] / 100.0
    entry_price * (1 - max_dev)
  end
end
