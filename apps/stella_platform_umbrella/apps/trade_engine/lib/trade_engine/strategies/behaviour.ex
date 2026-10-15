defmodule TradeEngine.Strategies.Behaviour do
  @moduledoc """
  Behaviour that all trading strategy modules must implement.

  Each strategy type (physics impulse, grid, DCA, etc.) implements these callbacks.
  BotTradingProcess dispatches to the appropriate module at runtime based on
  the bot's strategy.class_module field.

  ## Context Map

  The `context` map passed to callbacks contains:
    - `:bot_id` - Bot identifier
    - `:user_id` - Owner user ID (nil for system bots)
    - `:credential_id` - Exchange credential
    - `:strategy_id` - Strategy DB record ID
    - `:config` - Resolved strategy config (merged defaults + user overrides)
    - `:positions` - Current open positions map
    - `:price_cache` - Latest prices %{symbol => float}
    - `:balance` - Available balance

  ## Signal Map

  Signals returned by `generate_signal/3` must include:
    - `:symbol` - Trading pair
    - `:direction` - :long | :short | :neutral
    - `:confidence` - 0-100 score
    - `:entry_price` - Suggested entry (Decimal)
    - `:stop_loss` - Stop loss level (Decimal)
    - `:take_profit` - Take profit level (Decimal)
    - `:physics` - Strategy-specific analysis data (map, optional)
  """

  @type candle :: map()
  @type signal :: map()
  @type context :: map()
  @type position :: map()

  @doc """
  Generate a trading signal from recent candle data.
  Returns `{:ok, signal}` or `{:error, reason}`.
  """
  @callback generate_signal(candles :: [candle()], order_flow :: any(), context :: context()) ::
              {:ok, signal()} | {:error, atom()}

  @doc """
  Determine whether to enter a trade based on the signal and current context.
  Called after `generate_signal/3` returns a non-neutral signal.
  """
  @callback should_enter?(signal :: signal(), context :: context()) :: boolean()

  @doc """
  Determine whether to exit an open position.
  Called periodically for each open position.
  """
  @callback should_exit?(position :: position(), context :: context()) :: boolean()

  @doc """
  Calculate position size for a given signal.
  Returns `{:ok, quantity, position_value}` or `{:error, reason}`.
  """
  @callback calculate_position_size(signal :: signal(), context :: context()) ::
              {:ok, float(), float()} | {:error, atom()}

  @doc """
  Calculate stop loss price for a position.
  """
  @callback calculate_stop_loss(signal :: signal(), entry_price :: float(), context :: context()) :: float()

  @doc """
  Return the default config map for this strategy type.
  Used when seeding strategy.strategies.config and as fallback values.
  """
  @callback default_config() :: map()

  @doc """
  Return the strategy type string matching the DB enum.
  """
  @callback strategy_type() :: String.t()

  # ========================================================================
  # MODULE RESOLUTION
  # ========================================================================

  @strategy_modules %{
    "core_momentum" => TradeEngine.Strategies.PhysicsImpulse,
    "core_grid" => TradeEngine.Strategies.GridBot,
    "core_dca" => TradeEngine.Strategies.DCA,
    "core_mean_reversion" => TradeEngine.Strategies.MeanReversionGrid,
    "core_trend_following" => TradeEngine.Strategies.TrendFollower
  }

  @doc """
  Resolve a strategy module from a class_module string or strategy type.

  Tries in order:
  1. Direct module name (e.g. "Elixir.TradeEngine.Strategies.PhysicsImpulse")
  2. Short module name (e.g. "TradeEngine.Strategies.PhysicsImpulse")
  3. Strategy type lookup (e.g. "core_momentum")
  4. Fallback to PhysicsImpulse
  """
  def resolve_module(nil), do: TradeEngine.Strategies.PhysicsImpulse

  def resolve_module(class_module) when is_binary(class_module) do
    cond do
      # Try as full Elixir module atom
      mod = safe_module(class_module) ->
        mod

      # Try with Elixir prefix
      mod = safe_module("Elixir.#{class_module}") ->
        mod

      # Try strategy type lookup
      mod = Map.get(@strategy_modules, class_module) ->
        mod

      # Fallback
      true ->
        TradeEngine.Strategies.PhysicsImpulse
    end
  end

  def resolve_module(_), do: TradeEngine.Strategies.PhysicsImpulse

  defp safe_module(name) do
    mod = String.to_existing_atom(name)
    if Code.ensure_loaded?(mod) and function_exported?(mod, :generate_signal, 3), do: mod
  rescue
    ArgumentError -> nil
  end

  @doc "List all registered strategy modules"
  def registered_modules, do: @strategy_modules
end
