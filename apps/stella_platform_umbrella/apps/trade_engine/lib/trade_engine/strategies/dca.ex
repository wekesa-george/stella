defmodule TradeEngine.Strategies.DCA do
  @moduledoc """
  Dollar-Cost Averaging strategy.

  Executes scheduled buys at fixed intervals with optional dip-enhancement:
  enhanced buy amounts when price drops below configurable thresholds.

  Config keys:
    - interval: string (default "4h") — buy interval ("1h", "4h", "12h", "1d")
    - amount_usd: float (default 100.0) — base buy amount per interval
    - max_budget_usd: float (default 3000.0) — total budget cap
    - dip_thresholds: list of maps — enhanced buy levels
      e.g. [%{drop_pct: 3, multiplier: 1.5}, %{drop_pct: 6, multiplier: 2.0}, %{drop_pct: 10, multiplier: 3.0}]
    - take_profit_pct: float (default 10.0) — close all at this % gain
    - use_twap: boolean (default false) — split buys into smaller chunks
  """

  @behaviour TradeEngine.Strategies.Behaviour

  @defaults %{
    "interval" => "4h",
    "amount_usd" => 100.0,
    "max_budget_usd" => 3000.0,
    "dip_thresholds" => [
      %{"drop_pct" => 3.0, "multiplier" => 1.5},
      %{"drop_pct" => 6.0, "multiplier" => 2.0},
      %{"drop_pct" => 10.0, "multiplier" => 3.0}
    ],
    "take_profit_pct" => 10.0,
    "use_twap" => false,
    "max_positions" => 50
  }

  @impl true
  def strategy_type, do: "core_dca"

  @impl true
  def default_config, do: @defaults

  @impl true
  def generate_signal(_candles, _order_flow, _context) do
    # TODO: Implement DCA signal logic
    # DCA strategies are timer-driven, not candle-driven.
    # Implementation will use a scheduled process that fires on interval.
    {:error, :not_implemented}
  end

  @impl true
  def should_enter?(_signal, _context), do: false

  @impl true
  def should_exit?(_position, context) do
    config = Map.merge(@defaults, Map.get(context, :config, %{}))
    tp_pct = config["take_profit_pct"]
    price_cache = Map.get(context, :price_cache, %{})

    # Check if aggregate position has reached take profit
    positions = Map.get(context, :positions, %{}) |> Map.values()
    if Enum.empty?(positions), do: false, else: false

    # TODO: calculate average entry across all DCA buys, compare to current
    false
  end

  @impl true
  def calculate_position_size(_signal, context) do
    config = Map.merge(@defaults, Map.get(context, :config, %{}))
    amount = config["amount_usd"]
    {:ok, amount, amount}
  end

  @impl true
  def calculate_stop_loss(_signal, entry_price, _context) do
    # DCA typically doesn't use stop losses — it buys dips
    entry_price * 0.80
  end
end
