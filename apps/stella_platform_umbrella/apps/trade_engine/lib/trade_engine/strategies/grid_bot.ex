defmodule TradeEngine.Strategies.GridBot do
  @moduledoc """
  Grid trading strategy.

  Places a grid of buy and sell limit orders at fixed intervals between an upper
  and lower price boundary. Profits from price oscillation within the range.

  ## Execution Model

  Unlike signal-based strategies (PhysicsImpulse, TrendFollower), the grid bot
  does NOT use the standard candle → signal → market order pipeline. Instead:

  1. On init: calculate grid levels between lower_price and upper_price
  2. Place buy limit orders below current price, sell limit orders above
  3. When a buy fills → place a sell limit one grid level above (take profit)
  4. When a sell fills → place a buy limit one grid level below (re-entry)
  5. Repeat until stopped or price breaks out of range

  ## Config keys
    - upper_price: float — top of grid range (REQUIRED, must be > 0)
    - lower_price: float — bottom of grid range (REQUIRED, must be > 0)
    - grid_levels: integer (default 10) — number of grid lines
    - grid_type: "arithmetic" | "geometric" (default "arithmetic")
    - quantity_per_grid: float — base asset quantity per grid order
    - total_investment: float — total allocated capital (USD)
    - stop_loss_price: float — emergency exit below grid (optional)
    - take_profit_price: float — close all above this price (optional)
    - restart_on_stop_loss: boolean (default false) — after stop-loss exit, redeploy
      grid centered around current price instead of stopping
    - rebalance_on_breakout: boolean (default false)
    - max_open_orders: integer (default 20) — exchange order limit
  """

  @behaviour TradeEngine.Strategies.Behaviour

  require Logger

  @defaults %{
    "upper_price" => 0.0,
    "lower_price" => 0.0,
    "grid_levels" => 10,
    "grid_type" => "arithmetic",
    "quantity_per_grid" => 0.0,
    "total_investment" => 2000.0,
    "stop_loss_price" => nil,
    "take_profit_price" => nil,
    "rebalance_on_breakout" => false,
    "restart_on_stop_loss" => false,
    "max_open_orders" => 20,
    "max_positions" => 20
  }

  @impl true
  def strategy_type, do: "core_grid"

  @impl true
  def default_config, do: @defaults

  @impl true
  def generate_signal(candles, _order_flow, context) do
    raw_config = Map.get(context, :config, %{})
    # Normalize: ensure all keys are strings and numeric values are floats
    normalized = normalize_config(raw_config)
    config = Map.merge(@defaults, normalized)

    upper = config["upper_price"]
    lower = config["lower_price"]

    if upper <= 0 or lower <= 0 or upper <= lower do
      Logger.error("GridBot: invalid_grid_range — upper=#{inspect(upper)} lower=#{inspect(lower)} | raw_keys=#{inspect(Map.keys(raw_config))} | normalized_keys=#{inspect(Map.keys(normalized))}")
      {:error, {:invalid_grid_range, %{upper: upper, lower: lower, raw_keys: Map.keys(raw_config)}}}
    else
      # Get current price from latest candle
      latest = List.last(candles)
      current_price = if latest, do: latest[:close] || latest.close, else: nil

      if is_nil(current_price) or current_price <= 0 do
        {:error, :no_price}
      else
        grid_levels = compute_grid_levels(config)
        grid_state = analyze_grid_state(grid_levels, current_price, context)

        # Detect if price has broken outside the grid range
        breakout = cond do
          current_price > upper -> :above
          current_price < lower -> :below
          true -> nil
        end

        # Calculate how far outside the range (as percentage of range width)
        breakout_pct = case breakout do
          :above -> (current_price - upper) / upper * 100
          :below -> (lower - current_price) / lower * 100
          nil -> 0.0
        end

        {:ok, %{
          direction: :grid,
          symbol: Map.get(context, :symbol),
          confidence: 100,
          current_price: current_price,
          grid_levels: grid_levels,
          grid_state: grid_state,
          buy_levels: grid_state.buy_levels,
          sell_levels: grid_state.sell_levels,
          grid_type: config["grid_type"],
          quantity_per_grid: resolve_quantity_per_grid(config, current_price),
          stop_loss_price: config["stop_loss_price"],
          take_profit_price: config["take_profit_price"],
          grid_breakout: breakout,
          grid_breakout_pct: Float.round(breakout_pct, 2)
        }}
      end
    end
  end

  @impl true
  def should_enter?(%{direction: :grid} = signal, context) do
    # Grid bots always "enter" — the signal contains the grid levels to manage
    positions = Map.get(context, :positions, %{})
    max = Map.get(context, :config, %{}) |> Map.get("max_open_orders", 20)
    open_count = map_size(positions)

    # Only proceed if we have levels to place and haven't hit the limit
    has_levels = length(signal.buy_levels) > 0 or length(signal.sell_levels) > 0
    has_levels and open_count < max
  end
  def should_enter?(_signal, _context), do: false

  @impl true
  def should_exit?(position, context) do
    config = Map.merge(@defaults, normalize_config(Map.get(context, :config, %{})))
    price_cache = Map.get(context, :price_cache, %{})
    current_price = Map.get(price_cache, position.symbol, position.current_price)

    cond do
      # Stop loss triggered
      config["stop_loss_price"] && is_number(config["stop_loss_price"]) &&
        config["stop_loss_price"] > 0 && current_price <= config["stop_loss_price"] ->
        true

      # Take profit triggered
      config["take_profit_price"] && is_number(config["take_profit_price"]) &&
        config["take_profit_price"] > 0 && current_price >= config["take_profit_price"] ->
        true

      # Grid bots don't exit individual positions via this callback —
      # exits are managed by the grid order fill cycle
      true ->
        false
    end
  end

  @impl true
  def calculate_position_size(_signal, context) do
    config = Map.merge(@defaults, normalize_config(Map.get(context, :config, %{})))
    total = config["total_investment"]
    grid_count = config["grid_levels"] || 10
    per_grid = total / max(grid_count, 1)
    {:ok, per_grid, per_grid}
  end

  @impl true
  def calculate_stop_loss(_signal, _entry_price, context) do
    config = Map.merge(@defaults, normalize_config(Map.get(context, :config, %{})))
    config["stop_loss_price"] || config["lower_price"] || 0.0
  end

  # ===========================================================================
  # GRID COMPUTATION
  # ===========================================================================

  @doc "Compute the grid price levels"
  def compute_grid_levels(config) do
    upper = config["upper_price"]
    lower = config["lower_price"]
    n = config["grid_levels"] || 10
    grid_type = config["grid_type"] || "arithmetic"

    if upper <= lower or n < 2, do: [], else: do_compute_levels(grid_type, lower, upper, n)
  end

  defp do_compute_levels("geometric", lower, upper, n) do
    # Geometric: equal percentage spacing
    ratio = :math.pow(upper / lower, 1.0 / n)
    for i <- 0..n, do: Float.round(lower * :math.pow(ratio, i), 8)
  end

  defp do_compute_levels(_arithmetic, lower, upper, n) do
    # Arithmetic: equal price spacing
    step = (upper - lower) / n
    for i <- 0..n, do: Float.round(lower + step * i, 8)
  end

  @doc """
  Analyze grid state: which levels need buy orders, which need sell orders.
  Returns a map with :buy_levels and :sell_levels based on current price
  and existing positions/orders.
  """
  def analyze_grid_state(grid_levels, current_price, context) do
    # Grid positions tracked in bot state (keyed by rounded price from exchange)
    existing_grid_orders = Map.get(context, :grid_orders, %{})

    # Build a set of existing order prices for fast lookup.
    # grid_orders keys are rounded to exchange precision (e.g. 71285.7),
    # but grid_levels are raw floats (e.g. 71285.71428571).
    # We need to check if any existing key is "close enough" to the level.
    existing_prices = Map.keys(existing_grid_orders) |> MapSet.new()

    # A level is covered if any existing order price rounds to the same value
    # or is within 0.01% of the level (handles float precision differences)
    level_covered? = fn level ->
      MapSet.member?(existing_prices, level) or
        Enum.any?(existing_prices, fn p ->
          abs(p - level) / max(abs(level), 1) < 0.0001
        end)
    end

    # Levels below current price → buy orders
    # Levels above current price → sell orders
    buy_levels = grid_levels
      |> Enum.filter(fn level -> level < current_price and not level_covered?.(level) end)
      |> Enum.sort(:desc) # Closest to price first

    sell_levels = grid_levels
      |> Enum.filter(fn level -> level > current_price and not level_covered?.(level) end)
      |> Enum.sort(:asc) # Closest to price first

    %{
      buy_levels: buy_levels,
      sell_levels: sell_levels,
      total_levels: length(grid_levels),
      current_zone: find_current_zone(grid_levels, current_price)
    }
  end

  defp find_current_zone(grid_levels, price) do
    sorted = Enum.sort(grid_levels)
    idx = Enum.find_index(sorted, fn l -> l > price end)
    case idx do
      nil -> length(sorted) - 1
      0 -> 0
      n -> n - 1
    end
  end

  @doc """
  Compute a new grid config centered around `current_price`, preserving the
  original range width and all other parameters. Used for grid restart after
  stop-loss exit.

  The new grid keeps the same percentage range width as the original but
  shifts it so `current_price` sits at 40% from the bottom (slightly bullish
  bias — more room to run up than down).
  """
  def recentered_config(config, current_price) do
    original_upper = config["upper_price"]
    original_lower = config["lower_price"]

    if original_upper <= original_lower or current_price <= 0 do
      config
    else
      # Preserve the percentage width of the original range
      range_pct = (original_upper - original_lower) / original_lower
      half_range = current_price * range_pct

      # Place current price at 40% from bottom (bullish bias)
      new_lower = Float.round(current_price - half_range * 0.4, 2)
      new_upper = Float.round(current_price + half_range * 0.6, 2)

      # Ensure lower is positive
      new_lower = max(new_lower, current_price * 0.5)

      # Update stop-loss relative to new lower bound (same % gap as original)
      new_stop = if config["stop_loss_price"] && original_lower > 0 do
        sl_gap_pct = 1.0 - config["stop_loss_price"] / original_lower
        Float.round(new_lower * (1.0 - sl_gap_pct), 2)
      else
        nil
      end

      config
      |> Map.put("upper_price", new_upper)
      |> Map.put("lower_price", new_lower)
      |> Map.put("stop_loss_price", new_stop)
      |> Map.put("take_profit_price", nil)  # Clear TP on restart
    end
  end

  defp resolve_quantity_per_grid(config, current_price) do
    explicit = config["quantity_per_grid"]
    if explicit && explicit > 0 do
      explicit
    else
      # Derive from total_investment / grid_levels / current_price
      total = config["total_investment"] || 2000.0
      n = config["grid_levels"] || 10
      usd_per_grid = total / max(n, 1)
      if current_price > 0, do: usd_per_grid / current_price, else: 0.0
    end
  end

  # Normalize config map: convert all atom keys to strings and Decimals to floats.
  # Handles mixed atom/string key maps by splitting into two maps and merging
  # with atom-key values taking priority (they come from the actual DB config,
  # while string-key duplicates may be stale defaults from a prior merge).
  defp normalize_config(map) when is_map(map) do
    {atom_entries, string_entries} =
      Enum.reduce(map, {%{}, %{}}, fn
        {k, v}, {atoms, strings} when is_atom(k) ->
          {Map.put(atoms, Atom.to_string(k), normalize_value(v)), strings}
        {k, v}, {atoms, strings} ->
          {atoms, Map.put(strings, k, normalize_value(v))}
      end)

    # Atom-key values override string-key values (atom keys are from the real config)
    Map.merge(string_entries, atom_entries)
  end
  defp normalize_config(other), do: other

  defp normalize_value(%Decimal{} = d), do: Decimal.to_float(d)
  defp normalize_value(v), do: v
end
