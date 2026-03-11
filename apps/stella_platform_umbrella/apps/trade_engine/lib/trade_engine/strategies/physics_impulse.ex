defmodule TradeEngine.Strategies.PhysicsImpulse do
  @moduledoc """
  Physics-based impulse scalping strategy.

  Applies Newtonian mechanics to price time-series:
  - Velocity (v₀) = linear regression slope (momentum)
  - Gravity (g) = market resistance (volatility + decay + reversals)
  - Peak prediction = P₀ + v₀²/2g (projectile apex)
  - Stop loss = golden ratio (0.618) × impulse size below entry
  - Position sizing = target_profit_usd / impulse_size

  ## Per-Asset Configuration

  Only assets with proven profitable filter combinations (from 5-year backtest)
  are eligible for this strategy. Currently supported: ETHUSDT, BTCUSDT, BNBUSDT.

  Each asset has its own:
  - Confidence thresholds (min_confidence_long/short)
  - Minimum MAR (momentum-ATR ratio) floor
  - KE (kinetic energy) percentile range

  Assets not in the supported list will be rejected at signal generation.
  Use `supported_symbols/0` or `supported_symbol?/1` to check eligibility.

  ## Global Config Keys (from strategy.strategies.config or bot.config)

    - target_profit_usd: float (default 0.50)
    - min_impulse_pct: float (default 0.001)
    - max_hold_minutes: integer (default 5)
    - golden_ratio: float (default 0.618)
    - min_notional: float (default 10.0)
    - min_trade_value: float (default 12.0)
    - min_confidence_long: integer (default 55, overridden per-asset)
    - min_confidence_short: integer (default 60, overridden per-asset)
    - max_positions: integer (default 3)
    - max_position_pct: float (default 0.15)
  """

  @behaviour TradeEngine.Strategies.Behaviour

  alias TradeEngine.Physics.SignalGenerator
  alias TradeEngine.Exchanges.Binance.KlineStream

  # Default config values
  @defaults %{
    "target_profit_usd" => 0.50,
    "min_impulse_pct" => 0.001,
    "max_hold_minutes" => 5,
    "golden_ratio" => 0.618,
    "min_notional" => 10.0,
    "min_trade_value" => 12.0,
    "min_confidence_long" => 55,
    "min_confidence_short" => 60,
    "max_positions" => 3,
    "max_position_pct" => 0.15
  }

  # Per-asset physics configs — data-driven from 5-year backtest (1,724 trades)
  # Only assets with proven profitable filter combinations are included.
  # Assets not listed here are NOT eligible for the physics strategy.
  @asset_configs %{
    "ETHUSDT" => %{
      "min_confidence_long" => 60,
      "min_confidence_short" => 60,
      "min_mar" => 0.4,           # MAR < 0.4 loses money on ETH
      "ke_pct_min" => 50,         # KE percentile floor
      "ke_pct_max" => 95,         # KE percentile ceiling (overextended above)
      # 5yr stats: 132 trades, WR 53.8%, PF 1.39 with these filters
    },
    "BTCUSDT" => %{
      "min_confidence_long" => 68,
      "min_confidence_short" => 65,
      "min_mar" => 0.4,
      "ke_pct_min" => 75,         # BTC needs higher KE to perform
      "ke_pct_max" => 90,
      # 5yr stats: 35 trades, WR 54.3%, PF 1.17 with these filters
    },
    "BNBUSDT" => %{
      "min_confidence_long" => 65,
      "min_confidence_short" => 70,
      "min_mar" => 0.4,
      "ke_pct_min" => 75,
      "ke_pct_max" => 90,
      # 5yr stats: 36 trades, WR 52.8%, PF 1.61 with these filters (small sample)
    }
  }

  @doc """
  Returns the per-asset physics config for a given symbol.
  Returns nil if the asset is not supported by the physics strategy.
  """
  def asset_config(symbol) do
    normalized = normalize_symbol(symbol)
    Map.get(@asset_configs, normalized)
  end

  @doc """
  Returns the list of symbols supported by the physics strategy.
  """
  def supported_symbols do
    Map.keys(@asset_configs)
  end

  @doc """
  Returns true if the given symbol is supported by the physics strategy.
  """
  def supported_symbol?(symbol) do
    normalized = normalize_symbol(symbol)
    Map.has_key?(@asset_configs, normalized)
  end

  # ========================================================================
  # BEHAVIOUR CALLBACKS
  # ========================================================================

  @impl true
  def strategy_type, do: "core_momentum"

  @impl true
  def default_config, do: @defaults

  @impl true
  def generate_signal(candles, order_flow, context) do
    symbol = Map.get(context, :symbol, "UNKNOWN")
    normalized = normalize_symbol(symbol)

    if not Map.has_key?(@asset_configs, normalized) do
      {:error, {:asset_not_supported, normalized, Map.keys(@asset_configs)}}
    else
      asset_opts = Map.get(@asset_configs, normalized, %{})

      case KlineStream.get_recent_candles(symbol, 20) do
        recent when is_list(recent) and length(recent) >= 5 ->
          SignalGenerator.generate_signal(recent, order_flow, symbol, asset_opts)
        _ ->
          if is_list(candles) and length(candles) >= 5 do
            SignalGenerator.generate_signal(candles, order_flow, symbol, asset_opts)
          else
            {:error, :insufficient_candles}
          end
      end
    end
  end

  @impl true
  def should_enter?(signal, context) do
    config = get_config(context)
    max_positions = config["max_positions"]
    symbol = signal.symbol
    normalized = normalize_symbol(symbol)

    # Get per-asset config (overrides defaults for confidence)
    asset_cfg = Map.get(@asset_configs, normalized, %{})

    # Per-asset confidence thresholds take priority over global defaults
    min_conf_long = Map.get(asset_cfg, "min_confidence_long", config["min_confidence_long"])
    min_conf_short = Map.get(asset_cfg, "min_confidence_short", config["min_confidence_short"])

    positions = Map.get(context, :positions, %{})
    count = map_size(positions)
    has_symbol = Enum.any?(Map.values(positions), &(&1.symbol == signal.symbol))

    # Asset must be in the supported list
    asset_ok = Map.has_key?(@asset_configs, normalized)

    confidence_ok = case signal.direction do
      :long -> signal.confidence >= min_conf_long
      :short -> signal.confidence >= min_conf_short
      _ -> false
    end

    # Per-asset MAR filter — reject weak momentum signals
    mar_ok = check_mar_filter(signal, asset_cfg)

    # Per-asset KE percentile filter — reject out-of-range energy
    ke_ok = check_ke_filter(signal, asset_cfg)

    impulse_ok = has_tradeable_impulse?(signal, config)
    position_ok = count < max_positions and not has_symbol

    asset_ok and confidence_ok and mar_ok and ke_ok and impulse_ok and position_ok
  end

  @impl true
  def should_exit?(position, context) do
    price_cache = Map.get(context, :price_cache, %{})
    current = Map.get(price_cache, position.symbol, position.entry_price)
    now = DateTime.utc_now()

    target = position.impulse_target
    stop = position.stop_loss
    time_expired = DateTime.compare(now, position.target_exit_time) == :gt

    {hit_target, hit_stop} = case position.direction do
      :long -> {current >= target, current <= stop}
      :short -> {current <= target, current >= stop}
      _ -> {false, false}
    end

    hit_target or hit_stop or time_expired
  end

  @impl true
  def calculate_position_size(signal, context) do
    config = get_config(context)
    balance = Map.get(context, :balance, 0.0)
    entry = to_float(signal.entry_price) || 0.0

    if balance <= 0 or entry <= 0 do
      {:error, :no_balance}
    else
      target_profit = config["target_profit_usd"]
      max_pct = config["max_position_pct"]
      min_trade = config["min_trade_value"]
      min_notional = config["min_notional"]

      impulse_target = get_impulse_target(signal)
      impulse_size = if impulse_target, do: abs(impulse_target - entry), else: 0

      # Ensure min_notional is at least 100 for futures compatibility
      effective_min_notional = max(min_notional, 100.0)
      effective_min_trade = max(min_trade, effective_min_notional)

      ideal_qty = if impulse_size > 0, do: target_profit / impulse_size, else: 0
      ideal_value = ideal_qty * entry
      max_value = balance * max_pct
      position_value = ideal_value |> min(max_value) |> max(effective_min_trade)
      quantity = position_value / entry
      notional = quantity * entry

      if notional < effective_min_notional or position_value > balance do
        {:error, :notional_too_low}
      else
        {:ok, quantity, position_value}
      end
    end
  end

  @impl true
  def calculate_stop_loss(signal, entry_price, context) do
    config = get_config(context)
    golden = config["golden_ratio"]
    impulse_target = get_impulse_target(signal)
    impulse_size = if impulse_target, do: abs(impulse_target - entry_price), else: entry_price * 0.02

    case signal.direction do
      :long -> entry_price - (impulse_size * golden)
      :short -> entry_price + (impulse_size * golden)
      _ -> entry_price
    end
  end

  # ========================================================================
  # INTERNAL HELPERS
  # ========================================================================

  defp get_config(context) do
    user_config = Map.get(context, :config, %{})
    Map.merge(@defaults, user_config)
  end

  # Normalize symbol from various formats to uppercase no-separator form
  # "BTC/USDT" → "BTCUSDT", "BTC/USDT:USDT" → "BTCUSDT", "BTCUSDT" → "BTCUSDT"
  defp normalize_symbol(symbol) when is_binary(symbol) do
    symbol
    |> String.split(":")
    |> List.first()
    |> String.replace("/", "")
    |> String.upcase()
  end
  defp normalize_symbol(_), do: "UNKNOWN"

  # Check MAR (momentum-ATR ratio) filter from per-asset config
  defp check_mar_filter(signal, asset_cfg) do
    min_mar = Map.get(asset_cfg, "min_mar")

    if min_mar && signal[:physics] do
      momentum = signal.physics[:momentum] || 0
      atr_pct = signal.physics[:atr_pct] || 0.0001
      mar = abs(momentum) / max(atr_pct, 0.0001)
      mar >= min_mar
    else
      true  # No MAR filter configured — pass through
    end
  end

  # Check KE (kinetic energy) percentile filter from per-asset config
  # We approximate percentile using absolute KE thresholds derived from backtest data
  # ETH KE percentile 50 ≈ 0.15, 95 ≈ 8.0
  # BTC KE percentile 75 ≈ 0.5, 90 ≈ 3.0
  # BNB KE percentile 75 ≈ 0.4, 90 ≈ 2.5
  defp check_ke_filter(signal, asset_cfg) do
    ke_pct_min = Map.get(asset_cfg, "ke_pct_min")
    ke_pct_max = Map.get(asset_cfg, "ke_pct_max")

    if ke_pct_min && ke_pct_max && signal[:physics] do
      ke = signal.physics[:kinetic_energy] || 0
      energy_state = signal.physics[:energy_state]

      # Use energy_state as a proxy for KE percentile ranges:
      # :low ≈ p0-25, :medium ≈ p25-85, :high ≈ p85+
      # For tighter filters (p75-90), we check both state and relative KE
      cond do
        # If asset wants p50-95 range (ETH): allow medium and moderate-high
        ke_pct_min <= 50 and ke_pct_max >= 95 ->
          energy_state in [:medium, :high] and ke < ke_overextended_threshold(signal.symbol)

        # If asset wants p75-90 range (BTC, BNB): need elevated but not extreme KE
        ke_pct_min >= 75 ->
          ke >= ke_elevated_threshold(signal.symbol) and
            ke < ke_overextended_threshold(signal.symbol)

        # Default — just check not overextended
        true ->
          ke < ke_overextended_threshold(signal.symbol)
      end
    else
      true  # No KE filter configured — pass through
    end
  end

  # KE thresholds derived from per-asset backtest percentile analysis
  # These approximate the percentile boundaries from 5-year data
  defp ke_elevated_threshold(symbol) do
    normalized = normalize_symbol(symbol)
    case normalized do
      "BTCUSDT" -> 0.5    # ~p75
      "BNBUSDT" -> 0.4    # ~p75
      _ -> 0.3            # Conservative default
    end
  end

  defp ke_overextended_threshold(symbol) do
    normalized = normalize_symbol(symbol)
    case normalized do
      "ETHUSDT" -> 8.0    # ~p95
      "BTCUSDT" -> 3.0    # ~p90
      "BNBUSDT" -> 2.5    # ~p90
      _ -> 5.0            # Conservative default
    end
  end

  defp has_tradeable_impulse?(signal, config) do
    entry = to_float(signal.entry_price)
    target = get_impulse_target(signal)
    min_pct = config["min_impulse_pct"]

    if entry && target && entry > 0 do
      impulse_pct = abs(target - entry) / entry
      impulse_pct >= min_pct and direction_aligned?(signal.direction, entry, target)
    else
      false
    end
  end

  defp direction_aligned?(:long, entry, target), do: target > entry
  defp direction_aligned?(:short, entry, target), do: target < entry
  defp direction_aligned?(_, _, _), do: false

  @doc false
  def get_impulse_target(signal) do
    physics_target = if signal[:physics] do
      case signal.direction do
        :long -> signal.physics[:peak_price] || signal.physics[:predicted_price]
        :short -> signal.physics[:trough_price] || signal.physics[:peak_price] || signal.physics[:predicted_price]
        _ -> signal.physics[:peak_price] || signal.physics[:predicted_price]
      end
    end

    cond do
      physics_target -> to_float(physics_target)
      signal[:take_profit] -> to_float(signal[:take_profit])
      signal[:target_price] -> to_float(signal[:target_price])
      true -> nil
    end
  end

  defp to_float(nil), do: nil
  defp to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp to_float(n) when is_float(n), do: n
  defp to_float(n) when is_integer(n), do: n * 1.0
  defp to_float(_), do: nil
end
