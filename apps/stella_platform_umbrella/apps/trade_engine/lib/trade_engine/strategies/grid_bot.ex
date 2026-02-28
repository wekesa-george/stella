defmodule TradeEngine.Strategies.GridBot do
  @moduledoc """
  Grid trading strategy.

  Places a grid of buy and sell orders at fixed intervals between an upper and
  lower price boundary. Profits from price oscillation within the range.

  Config keys:
    - upper_price: float — top of grid range
    - lower_price: float — bottom of grid range
    - grid_levels: integer (default 20) — number of grid lines
    - investment_per_grid: float — USD per grid order
    - total_investment: float — total allocated capital
    - rebalance_on_breakout: boolean (default true)
  """

  @behaviour TradeEngine.Strategies.Behaviour

  @defaults %{
    "upper_price" => 0.0,
    "lower_price" => 0.0,
    "grid_levels" => 20,
    "investment_per_grid" => 100.0,
    "total_investment" => 2000.0,
    "rebalance_on_breakout" => true,
    "max_positions" => 20
  }

  @impl true
  def strategy_type, do: "core_grid"

  @impl true
  def default_config, do: @defaults

  @impl true
  def generate_signal(_candles, _order_flow, _context) do
    # TODO: Implement grid signal logic
    # Grid bots don't use traditional signal generation — they maintain
    # a grid of limit orders. Implementation will use a different execution
    # model (place_grid_orders instead of market orders).
    {:error, :not_implemented}
  end

  @impl true
  def should_enter?(_signal, _context), do: false

  @impl true
  def should_exit?(_position, _context), do: false

  @impl true
  def calculate_position_size(_signal, context) do
    config = Map.merge(@defaults, Map.get(context, :config, %{}))
    per_grid = config["investment_per_grid"]
    {:ok, per_grid, per_grid}
  end

  @impl true
  def calculate_stop_loss(_signal, entry_price, context) do
    config = Map.merge(@defaults, Map.get(context, :config, %{}))
    config["lower_price"] || entry_price * 0.95
  end
end
