defmodule TradeEngine.Strategies.PhysicsImpulse do
  @moduledoc """
  Physics-based impulse scalping strategy.

  Applies Newtonian mechanics to price time-series:
  - Velocity (v₀) = linear regression slope (momentum)
  - Gravity (g) = market resistance (volatility + decay + reversals)
  - Peak prediction = P₀ + v₀²/2g (projectile apex)
  - Stop loss = golden ratio (0.618) × impulse size below entry
  - Position sizing = target_profit_usd / impulse_size

  Config keys (from strategy.strategies.config or bot.config):
    - target_profit_usd: float (default 0.50)
    - min_impulse_pct: float (default 0.001)
    - max_hold_minutes: integer (default 5)
    - golden_ratio: float (default 0.618)
    - min_notional: float (default 10.0)
    - min_trade_value: float (default 12.0)
    - min_confidence_long: integer (default 55)
    - min_confidence_short: integer (default 60)
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

    case KlineStream.get_recent_candles(symbol, 20) do
      recent when is_list(recent) and length(recent) >= 5 ->
        # Use the real candles from cache (more recent than passed candles)
        SignalGenerator.generate_signal(recent, order_flow, symbol)
      _ ->
        # Fall back to passed candles
        if is_list(candles) and length(candles) >= 5 do
          SignalGenerator.generate_signal(candles, order_flow, symbol)
        else
          {:error, :insufficient_candles}
        end
    end
  end

  @impl true
  def should_enter?(signal, context) do
    config = get_config(context)
    min_conf_long = config["min_confidence_long"]
    min_conf_short = config["min_confidence_short"]
    max_positions = config["max_positions"]

    positions = Map.get(context, :positions, %{})
    count = map_size(positions)
    has_symbol = Enum.any?(Map.values(positions), &(&1.symbol == signal.symbol))

    confidence_ok = case signal.direction do
      :long -> signal.confidence >= min_conf_long
      :short -> signal.confidence >= min_conf_short
      _ -> false
    end

    impulse_ok = has_tradeable_impulse?(signal, config)
    position_ok = count < max_positions and not has_symbol

    confidence_ok and impulse_ok and position_ok
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
