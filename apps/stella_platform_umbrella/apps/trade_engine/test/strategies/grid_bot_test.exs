defmodule TradeEngine.Strategies.GridBotTest do
  use ExUnit.Case, async: true

  alias TradeEngine.Strategies.GridBot

  # ========================================================================
  # GRID LEVEL COMPUTATION
  # ========================================================================

  describe "compute_grid_levels/1 arithmetic" do
    test "produces correct number of levels (n+1 levels for n grid_levels)" do
      config = %{"upper_price" => 76000.0, "lower_price" => 65000.0, "grid_levels" => 20, "grid_type" => "arithmetic"}
      levels = GridBot.compute_grid_levels(config)
      assert length(levels) == 21
    end

    test "first level equals lower_price, last equals upper_price" do
      config = %{"upper_price" => 76000.0, "lower_price" => 65000.0, "grid_levels" => 10, "grid_type" => "arithmetic"}
      levels = GridBot.compute_grid_levels(config)
      assert hd(levels) == 65000.0
      assert List.last(levels) == 76000.0
    end

    test "levels are evenly spaced" do
      config = %{"upper_price" => 70000.0, "lower_price" => 60000.0, "grid_levels" => 10, "grid_type" => "arithmetic"}
      levels = GridBot.compute_grid_levels(config)
      step = 1000.0
      Enum.chunk_every(levels, 2, 1, :discard)
      |> Enum.each(fn [a, b] ->
        assert_in_delta b - a, step, 0.01
      end)
    end

    test "returns empty list when upper <= lower" do
      config = %{"upper_price" => 60000.0, "lower_price" => 70000.0, "grid_levels" => 10, "grid_type" => "arithmetic"}
      assert GridBot.compute_grid_levels(config) == []
    end

    test "returns empty list when grid_levels < 2" do
      config = %{"upper_price" => 76000.0, "lower_price" => 65000.0, "grid_levels" => 1, "grid_type" => "arithmetic"}
      assert GridBot.compute_grid_levels(config) == []
    end
  end

  describe "compute_grid_levels/1 geometric" do
    test "produces correct number of levels" do
      config = %{"upper_price" => 76000.0, "lower_price" => 65000.0, "grid_levels" => 20, "grid_type" => "geometric"}
      levels = GridBot.compute_grid_levels(config)
      assert length(levels) == 21
    end

    test "first level equals lower_price, last approximately equals upper_price" do
      config = %{"upper_price" => 76000.0, "lower_price" => 65000.0, "grid_levels" => 20, "grid_type" => "geometric"}
      levels = GridBot.compute_grid_levels(config)
      assert_in_delta hd(levels), 65000.0, 0.01
      assert_in_delta List.last(levels), 76000.0, 0.01
    end

    test "levels have equal percentage spacing" do
      config = %{"upper_price" => 100000.0, "lower_price" => 50000.0, "grid_levels" => 10, "grid_type" => "geometric"}
      levels = GridBot.compute_grid_levels(config)
      ratios = Enum.chunk_every(levels, 2, 1, :discard)
                |> Enum.map(fn [a, b] -> b / a end)
      # All ratios should be equal
      first_ratio = hd(ratios)
      Enum.each(ratios, fn r ->
        assert_in_delta r, first_ratio, 0.0001
      end)
    end

    test "all levels are strictly increasing" do
      config = %{"upper_price" => 76000.0, "lower_price" => 65000.0, "grid_levels" => 25, "grid_type" => "geometric"}
      levels = GridBot.compute_grid_levels(config)
      Enum.chunk_every(levels, 2, 1, :discard)
      |> Enum.each(fn [a, b] ->
        assert b > a, "Expected #{b} > #{a}"
      end)
    end
  end

  # ========================================================================
  # GRID STATE ANALYSIS
  # ========================================================================

  describe "analyze_grid_state/3" do
    test "splits levels into buy (below price) and sell (above price)" do
      levels = [60000.0, 62000.0, 64000.0, 66000.0, 68000.0, 70000.0, 72000.0, 74000.0]
      current_price = 67000.0
      context = %{}

      state = GridBot.analyze_grid_state(levels, current_price, context)

      # Buy levels: 60k, 62k, 64k, 66k (below 67k), sorted desc (closest first)
      assert state.buy_levels == [66000.0, 64000.0, 62000.0, 60000.0]
      # Sell levels: 68k, 70k, 72k, 74k (above 67k), sorted asc (closest first)
      assert state.sell_levels == [68000.0, 70000.0, 72000.0, 74000.0]
    end

    test "excludes levels that already have grid orders" do
      levels = [60000.0, 62000.0, 64000.0, 66000.0, 68000.0, 70000.0]
      current_price = 65000.0
      context = %{grid_orders: %{62000.0 => %{side: "BUY"}, 68000.0 => %{side: "SELL"}}}

      state = GridBot.analyze_grid_state(levels, current_price, context)

      refute 62000.0 in state.buy_levels
      refute 68000.0 in state.sell_levels
      assert 60000.0 in state.buy_levels
      assert 64000.0 in state.buy_levels
      assert 70000.0 in state.sell_levels
    end

    test "returns correct current_zone" do
      levels = [60000.0, 65000.0, 70000.0, 75000.0]
      state = GridBot.analyze_grid_state(levels, 67000.0, %{})
      assert state.current_zone == 1  # between 65k and 70k
    end
  end

  # ========================================================================
  # SIGNAL GENERATION
  # ========================================================================

  describe "generate_signal/3" do
    test "returns error when upper_price is 0" do
      context = %{config: %{"upper_price" => 0, "lower_price" => 65000}}
      candles = [%{close: 70000.0}]
      assert {:error, :invalid_grid_range} = GridBot.generate_signal(candles, nil, context)
    end

    test "returns error when lower_price is 0" do
      context = %{config: %{"upper_price" => 76000, "lower_price" => 0}}
      candles = [%{close: 70000.0}]
      assert {:error, :invalid_grid_range} = GridBot.generate_signal(candles, nil, context)
    end

    test "returns error when upper <= lower" do
      context = %{config: %{"upper_price" => 60000, "lower_price" => 70000}}
      candles = [%{close: 65000.0}]
      assert {:error, :invalid_grid_range} = GridBot.generate_signal(candles, nil, context)
    end

    test "returns error with no candles" do
      context = %{config: %{"upper_price" => 76000, "lower_price" => 65000}}
      assert {:error, :no_price} = GridBot.generate_signal([], nil, context)
    end

    test "generates valid grid signal with proper config" do
      config = %{
        "upper_price" => 76000,
        "lower_price" => 65000,
        "grid_levels" => 20,
        "grid_type" => "geometric",
        "total_investment" => 500,
        "quantity_per_grid" => 0
      }
      context = %{config: config, symbol: "BTCUSDT"}
      candles = [%{close: 70000.0}]

      assert {:ok, signal} = GridBot.generate_signal(candles, nil, context)
      assert signal.direction == :grid
      assert signal.current_price == 70000.0
      assert is_list(signal.grid_levels)
      assert length(signal.grid_levels) == 21
      assert is_list(signal.buy_levels)
      assert is_list(signal.sell_levels)
      assert length(signal.buy_levels) > 0
      assert length(signal.sell_levels) > 0
      assert signal.quantity_per_grid > 0
    end

    test "quantity_per_grid is derived from total_investment when quantity_per_grid is 0" do
      config = %{
        "upper_price" => 76000,
        "lower_price" => 65000,
        "grid_levels" => 20,
        "grid_type" => "arithmetic",
        "total_investment" => 1000,
        "quantity_per_grid" => 0
      }
      context = %{config: config, symbol: "BTCUSDT"}
      candles = [%{close: 70000.0}]

      {:ok, signal} = GridBot.generate_signal(candles, nil, context)

      # Expected: 1000 / 20 / 70000 = 0.000714...
      expected_qty = 1000.0 / 20 / 70000.0
      assert_in_delta signal.quantity_per_grid, expected_qty, 0.0001
    end

    test "explicit quantity_per_grid is used when > 0" do
      config = %{
        "upper_price" => 76000,
        "lower_price" => 65000,
        "grid_levels" => 20,
        "grid_type" => "arithmetic",
        "total_investment" => 1000,
        "quantity_per_grid" => 0.001
      }
      context = %{config: config, symbol: "BTCUSDT"}
      candles = [%{close: 70000.0}]

      {:ok, signal} = GridBot.generate_signal(candles, nil, context)
      assert signal.quantity_per_grid == 0.001
    end

    test "config from context overrides defaults" do
      # Simulates the real flow: DB config merged with defaults
      config = %{
        "upper_price" => 76000,
        "lower_price" => 65000,
        "grid_levels" => 20,
        "grid_type" => "geometric",
        "total_investment" => 500,
        "quantity_per_grid" => 0,
        "max_open_orders" => 15,
        "stop_loss_price" => 62000,
        "take_profit_price" => 78000,
        "restart_on_stop_loss" => true
      }
      context = %{config: config, symbol: "BTCUSDT"}
      candles = [%{close: 70000.0}]

      {:ok, signal} = GridBot.generate_signal(candles, nil, context)
      assert signal.stop_loss_price == 62000
      assert signal.take_profit_price == 78000
    end
  end

  # ========================================================================
  # QUANTITY PRECISION VALIDATION
  # ========================================================================

  describe "quantity precision for grid orders" do
    test "BTC futures quantity at $500/20 levels rounds to valid value" do
      # Simulates: total_investment=500, grid_levels=20, price=70000
      # Raw qty = 500 / 20 / 70000 = 0.000357...
      # BTC futures precision = 3 decimals, so floor → 0.000
      # This is the bug we're fixing — qty rounds to zero!
      raw_qty = 500.0 / 20 / 70000.0
      precision = 3
      floored = Float.floor(raw_qty * :math.pow(10, precision)) / :math.pow(10, precision)

      # With $500 and 20 levels, per-grid = $25. At $70k/BTC, qty = 0.000357
      # Floor to 3 decimals = 0.000 — THIS IS ZERO!
      assert floored == 0.0,
        "This test documents the bug: $500/20 levels is too little for BTC futures at 3-decimal precision"
    end

    test "BTC futures quantity at $2000/20 levels rounds to valid value" do
      raw_qty = 2000.0 / 20 / 70000.0
      precision = 3
      floored = Float.floor(raw_qty * :math.pow(10, precision)) / :math.pow(10, precision)
      # $2000/20 = $100/grid, at $70k = 0.001428, floor to 3 = 0.001
      assert floored == 0.001
      assert floored * 70000.0 >= 5.0, "Must meet $5 min notional"
    end

    test "BTC futures minimum viable investment per grid" do
      # At $70k BTC with 3-decimal precision, minimum qty = 0.001 = $70
      # So minimum total_investment = $70 * grid_levels
      price = 70000.0
      min_qty = 0.001
      min_notional = min_qty * price
      assert min_notional == 70.0

      # For 20 levels: minimum total = 20 * 70 = $1400
      min_total_for_20 = 20 * min_notional
      assert min_total_for_20 == 1400.0
    end

    test "ETH futures quantity at $500/20 levels is valid" do
      raw_qty = 500.0 / 20 / 2000.0
      precision = 3
      floored = Float.floor(raw_qty * :math.pow(10, precision)) / :math.pow(10, precision)
      # $500/20 = $25/grid, at $2000 = 0.0125, floor to 3 = 0.012
      assert floored == 0.012
      assert floored * 2000.0 >= 5.0
    end
  end

  # ========================================================================
  # RECENTERED CONFIG (restart_on_stop_loss)
  # ========================================================================

  describe "recentered_config/2" do
    setup do
      config = %{
        "upper_price" => 76000.0,
        "lower_price" => 65000.0,
        "grid_levels" => 20,
        "grid_type" => "geometric",
        "total_investment" => 500.0,
        "stop_loss_price" => 62000.0,
        "take_profit_price" => 78000.0
      }
      %{config: config}
    end

    test "recenters grid around current price", %{config: config} do
      new_config = GridBot.recentered_config(config, 60000.0)

      assert new_config["lower_price"] < 60000.0
      assert new_config["upper_price"] > 60000.0
    end

    test "preserves range width percentage", %{config: config} do
      original_range_pct = (76000.0 - 65000.0) / 65000.0

      new_config = GridBot.recentered_config(config, 60000.0)
      new_range = new_config["upper_price"] - new_config["lower_price"]
      new_range_pct = new_range / new_config["lower_price"]

      # Range percentage should be approximately preserved
      assert_in_delta new_range_pct, original_range_pct, original_range_pct * 0.3
    end

    test "clears take_profit_price on restart", %{config: config} do
      new_config = GridBot.recentered_config(config, 60000.0)
      assert new_config["take_profit_price"] == nil
    end

    test "recalculates stop_loss proportionally", %{config: config} do
      new_config = GridBot.recentered_config(config, 60000.0)
      assert new_config["stop_loss_price"] != nil
      assert new_config["stop_loss_price"] < new_config["lower_price"]
    end

    test "preserves non-price config keys", %{config: config} do
      new_config = GridBot.recentered_config(config, 60000.0)
      assert new_config["grid_levels"] == 20
      assert new_config["grid_type"] == "geometric"
      assert new_config["total_investment"] == 500.0
    end

    test "returns original config when upper <= lower" do
      bad_config = %{"upper_price" => 50000.0, "lower_price" => 60000.0}
      assert GridBot.recentered_config(bad_config, 55000.0) == bad_config
    end

    test "returns original config when current_price <= 0" do
      config = %{"upper_price" => 76000.0, "lower_price" => 65000.0}
      assert GridBot.recentered_config(config, 0.0) == config
    end
  end

  # ========================================================================
  # SHOULD_ENTER? / SHOULD_EXIT?
  # ========================================================================

  describe "should_enter?/2" do
    test "returns true when grid signal has levels and under max orders" do
      signal = %{direction: :grid, buy_levels: [65000.0, 64000.0], sell_levels: [70000.0]}
      context = %{positions: %{}, config: %{"max_open_orders" => 20}}
      assert GridBot.should_enter?(signal, context)
    end

    test "returns false when at max open orders" do
      signal = %{direction: :grid, buy_levels: [65000.0], sell_levels: [70000.0]}
      positions = for i <- 1..20, into: %{}, do: {i, %{}}
      context = %{positions: positions, config: %{"max_open_orders" => 20}}
      refute GridBot.should_enter?(signal, context)
    end

    test "returns false when no levels to place" do
      signal = %{direction: :grid, buy_levels: [], sell_levels: []}
      context = %{positions: %{}, config: %{}}
      refute GridBot.should_enter?(signal, context)
    end

    test "returns false for non-grid signals" do
      signal = %{direction: :long, confidence: 80}
      context = %{}
      refute GridBot.should_enter?(signal, context)
    end
  end

  describe "should_exit?/2" do
    test "triggers exit when price hits stop_loss" do
      position = %{symbol: "BTCUSDT", current_price: 61000.0}
      context = %{
        config: %{"stop_loss_price" => 62000.0, "take_profit_price" => nil},
        price_cache: %{"BTCUSDT" => 61000.0}
      }
      assert GridBot.should_exit?(position, context)
    end

    test "triggers exit when price hits take_profit" do
      position = %{symbol: "BTCUSDT", current_price: 80000.0}
      context = %{
        config: %{"stop_loss_price" => nil, "take_profit_price" => 78000.0},
        price_cache: %{"BTCUSDT" => 80000.0}
      }
      assert GridBot.should_exit?(position, context)
    end

    test "does not trigger exit in normal grid range" do
      position = %{symbol: "BTCUSDT", current_price: 70000.0}
      context = %{
        config: %{"stop_loss_price" => 62000.0, "take_profit_price" => 78000.0},
        price_cache: %{"BTCUSDT" => 70000.0}
      }
      refute GridBot.should_exit?(position, context)
    end
  end

  # ========================================================================
  # POSITION SIZING
  # ========================================================================

  describe "calculate_position_size/2" do
    test "divides total_investment by grid_levels" do
      signal = %{}
      context = %{config: %{"total_investment" => 1000.0, "grid_levels" => 20}}
      {:ok, size, _} = GridBot.calculate_position_size(signal, context)
      assert size == 50.0
    end

    test "handles zero grid_levels without crash" do
      signal = %{}
      context = %{config: %{"total_investment" => 1000.0, "grid_levels" => 0}}
      {:ok, size, _} = GridBot.calculate_position_size(signal, context)
      assert size == 1000.0  # divides by max(0, 1) = 1
    end
  end
end
