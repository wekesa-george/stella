defmodule TradeEngine.Bots.BotTradingProcess do
  @moduledoc """
  Per-bot trading GenServer. Each running bot gets its own process that:

  - Polls candles from the bot's exchange via REST (exchange-agnostic)
  - On new candle close: delegates to the strategy module for signal generation
  - Tags all positions/orders with bot_id, credential_id, strategy_id
  - Reports heartbeats to BotRegistry
  - Stops cleanly when BotRegistry.stop_bot/1 is called

  This does NOT replace SignalTrader's strategy logic — it delegates to it
  while providing per-bot identity and credential context.
  """

  use GenServer
  require Logger

  alias TradeEngine.Bots.{BotRegistry, BotLogger}
  alias TradeEngine.Exchanges.Executor
  alias TradeEngine.Risk.{AssetTierManager, VirtualBalanceManager}
  alias TradeEngine.Strategies.Behaviour, as: StrategyBehaviour

  @heartbeat_interval_ms 10_000
  @exit_check_interval_ms 5_000
  @price_update_interval_ms 3_000
  @candle_poll_interval_ms 60_000

  # Legacy defaults — used only when no strategy config override exists
  @max_hold_minutes 5
  @min_notional 10.0
  @candle_buffer_size_default 25

  # ========================================================================
  # CLIENT API
  # ========================================================================

  def start_link(opts) do
    bot_id = Keyword.fetch!(opts, :bot_id)
    GenServer.start_link(__MODULE__, bot_id)
  end

  def child_spec(opts) do
    bot_id = Keyword.fetch!(opts, :bot_id)
    %{
      id: {__MODULE__, bot_id},
      start: {__MODULE__, :start_link, [opts]},
      restart: :temporary,
      shutdown: 10_000
    }
  end

  # ========================================================================
  # INIT
  # ========================================================================

  @impl true
  def init(bot_id) do
    case BotRegistry.get_bot(bot_id) do
      {:ok, bot} ->
        # Step 1: Validating credentials
        BotRegistry.report_init_step(bot_id, "validating_credentials")
        BotLogger.info(bot_id, :lifecycle, "Validating credentials", %{credential_id: bot.credential_id})

        # Step 2: Loading strategy
        BotRegistry.report_init_step(bot_id, "loading_strategy")
        config = Map.get(bot, :config, %{})

        # Resolve strategy module from class_module or strategy type
        strategy_module = resolve_strategy_module(bot)
        strategy_defaults = strategy_module.default_config()
        merged_config = Map.merge(strategy_defaults, config)
        BotLogger.info(bot_id, :lifecycle, "Loading strategy", %{strategy: inspect(strategy_module)})

        # Step 3: Subscribing to market data (polling mode)
        BotRegistry.report_init_step(bot_id, "subscribing_market_data")
        BotLogger.info(bot_id, :lifecycle, "Polling candles for pairs", %{
          pairs: bot.trading_pairs,
          poll_interval_ms: @candle_poll_interval_ms
        })

        # Step 4: Allocating capital
        BotRegistry.report_init_step(bot_id, "allocating_capital")

        state = %{
          bot_id: bot_id,
          user_id: bot.user_id,
          credential_id: bot.credential_id,
          strategy_id: bot.strategy_id,
          market_type: Map.get(bot, :market_type, "spot"),
          trading_pairs: bot.trading_pairs,
          config: merged_config,
          strategy_module: strategy_module,
          # Trading state
          positions: %{},
          price_cache: %{},
          recent_signals: %{},
          # Candle polling state: %{symbol => last_candle_timestamp}
          last_candle_times: %{},
          # Rolling candle buffer: %{symbol => [candle_map, ...]} (most recent last)
          candle_buffers: %{},
          # Stats
          total_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
          total_realized_pnl: 0.0,
          # Capital
          allocated_capital: bot.allocated_capital || 0.0,
          # Derived from merged config
          max_positions: Map.get(merged_config, "max_positions", 3)
        }

        # Step 5: Ready
        BotRegistry.report_init_step(bot_id, "ready")
        BotLogger.info(bot_id, :lifecycle, "Bot ready", %{
          name: bot.name,
          strategy: inspect(strategy_module),
          pairs: bot.trading_pairs,
          max_positions: Map.get(merged_config, "max_positions", 3)
        })

        # Schedule periodic tasks
        Process.send_after(self(), :heartbeat, @heartbeat_interval_ms)
        Process.send_after(self(), :check_exits, @exit_check_interval_ms)
        Process.send_after(self(), :update_prices, @price_update_interval_ms)
        Process.send_after(self(), :poll_candles, @candle_poll_interval_ms)

        Logger.info("BotTradingProcess started for #{bot.name} (#{bot_id}) — strategy: #{inspect(strategy_module)} — pairs: #{inspect(bot.trading_pairs)}")
        {:ok, state}

      {:error, _} ->
        BotLogger.error(bot_id, :lifecycle, "Bot not found in registry")
        {:stop, :bot_not_found}
    end
  end

  # ========================================================================
  # HANDLERS
  # ========================================================================

  @impl true
  def handle_call(:get_bot_id, _from, state) do
    {:reply, state.bot_id, state}
  end

  @impl true
  def handle_call({:manual_order, params}, _from, state) do
    %{side: side, size: size} = params
    symbol = List.first(state.trading_pairs) || "BTC/USD"

    quantity = if is_binary(size), do: String.to_float(size), else: size / 1

    BotLogger.info(state.bot_id, :trade, "Manual order received", %{
      symbol: symbol,
      side: side,
      quantity: quantity
    })

    bot_context = [
      user_id: state.user_id,
      bot_id: state.bot_id,
      credential_id: state.credential_id,
      strategy_id: state.strategy_id,
      market_type: state.market_type,
      position_id: Ecto.UUID.generate(),
      manual: true
    ]

    result = case String.upcase(to_string(side)) do
      "LONG" -> Executor.execute_long(state.credential_id, symbol, quantity, bot_context)
      "SHORT" -> Executor.execute_short(state.credential_id, symbol, quantity, bot_context)
      _ -> {:error, :invalid_side}
    end

    case result do
      {:ok, order_result} ->
        executed_price = order_result[:executed_price] || 0.0
        executed_qty = order_result[:executed_qty] || quantity
        position_id = Keyword.get(bot_context, :position_id)

        position = %{
          id: position_id,
          bot_id: state.bot_id,
          user_id: state.user_id,
          credential_id: state.credential_id,
          strategy_id: state.strategy_id,
          symbol: symbol,
          direction: String.downcase(to_string(side)) |> String.to_atom(),
          quantity: executed_qty,
          entry_price: executed_price,
          current_price: executed_price,
          impulse_target: executed_price,
          impulse_size: 0.0,
          stop_loss: nil,
          confidence: 100,
          entry_time: DateTime.utc_now(),
          target_exit_time: DateTime.add(DateTime.utc_now(), 60 * 60, :second),
          status: :open,
          position_value: executed_qty * executed_price,
          virtual_balance_user: false,
          exchange_order_id: order_result[:order_id],
          manual: true
        }

        BotRegistry.update_position_count(state.bot_id, map_size(state.positions) + 1)

        new_state = %{state |
          positions: Map.put(state.positions, position.id, position),
          total_trades: state.total_trades + 1,
          price_cache: Map.put(state.price_cache, symbol, executed_price)
        }

        BotLogger.info(state.bot_id, :trade, "Manual order executed", %{
          symbol: symbol,
          side: side,
          quantity: executed_qty,
          price: executed_price,
          order_id: order_result[:order_id]
        })

        {:reply, {:ok, %{order_id: order_result[:order_id], price: executed_price, quantity: executed_qty}}, new_state}

      {:error, reason} ->
        BotLogger.error(state.bot_id, :trade, "Manual order failed", %{
          symbol: symbol,
          side: side,
          reason: inspect(reason)
        })
        {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_info(:poll_candles, state) do
    Process.send_after(self(), :poll_candles, @candle_poll_interval_ms)
    {:noreply, poll_candles(state)}
  end

  @impl true
  def handle_info(:heartbeat, state) do
    BotRegistry.heartbeat(state.bot_id)
    Process.send_after(self(), :heartbeat, @heartbeat_interval_ms)
    {:noreply, state}
  end

  @impl true
  def handle_info(:check_exits, state) do
    Process.send_after(self(), :check_exits, @exit_check_interval_ms)
    {:noreply, process_exits(state)}
  end

  @impl true
  def handle_info(:update_prices, state) do
    Process.send_after(self(), :update_prices, @price_update_interval_ms)
    {:noreply, update_prices(state)}
  end

  @impl true
  def handle_info(_msg, state), do: {:noreply, state}

  @impl true
  def terminate(reason, state) do
    BotLogger.warning(state.bot_id, :lifecycle, "Bot terminating", %{
      reason: inspect(reason),
      open_positions: map_size(state.positions)
    })
    Logger.info("BotTradingProcess #{state.bot_id} terminating: #{inspect(reason)}")
    # Close all open positions on graceful shutdown
    Enum.each(state.positions, fn {_id, pos} ->
      close_position(pos, state)
    end)
    :ok
  end

  # ========================================================================
  # CANDLE POLLING
  # ========================================================================

  defp poll_candles(state) do
    Enum.reduce(state.trading_pairs, state, fn pair, acc ->
      poll_candles_for_pair(pair, acc)
    end)
  end

  defp poll_candles_for_pair(pair, state) do
    candle_buffer_size = get_strategy_param(state.config, "candle_buffer_size", @candle_buffer_size_default)
    case Executor.get_bars(state.credential_id, pair, "5Min", candle_buffer_size, market_type: state.market_type) do
      {:ok, bars} when is_list(bars) and length(bars) > 0 ->
        # Get the second-to-last bar (most recently closed candle)
        # The last bar may still be forming
        closed_bar = if length(bars) >= 2 do
          Enum.at(bars, length(bars) - 2)
        else
          List.first(bars)
        end

        bar_time = closed_bar["t"]
        last_seen = Map.get(state.last_candle_times, pair)

        # Convert all bars (except the last forming one) to candle maps for the buffer
        closed_bars = if length(bars) >= 2 do
          Enum.slice(bars, 0..(length(bars) - 2)//1)
        else
          bars
        end

        candle_buffer = Enum.map(closed_bars, fn bar ->
          %{
            symbol: pair,
            open: to_float(bar["o"]),
            high: to_float(bar["h"]),
            low: to_float(bar["l"]),
            close: to_float(bar["c"]),
            volume: to_float(bar["v"]),
            timestamp: bar["t"]
          }
        end)

        # Always update the candle buffer with fresh data from exchange
        new_state = %{state |
          candle_buffers: Map.put(state.candle_buffers, pair, candle_buffer),
          last_candle_times: Map.put(state.last_candle_times, pair, bar_time)
        }

        if bar_time && bar_time != last_seen do
          # New candle detected — process with full buffer
          latest_candle = List.last(candle_buffer)
          process_candle(latest_candle, new_state)
        else
          new_state
        end

      {:error, reason} ->
        BotLogger.warning(state.bot_id, :system, "Candle poll failed", %{
          pair: pair,
          reason: inspect(reason)
        })
        state
    end
  end

  # ========================================================================
  # CANDLE PROCESSING
  # ========================================================================

  defp process_candle(candle, state) do
    symbol = candle.symbol
    now = DateTime.utc_now()
    strategy = state.strategy_module

    BotLogger.debug(state.bot_id, :signal, "Candle received", %{
      symbol: symbol,
      close: candle.close,
      volume: candle.volume
    })

    # Rate limit: 30s between same symbol signals
    last = Map.get(state.recent_signals, symbol)
    if last && DateTime.diff(now, last, :second) < 30 do
      state
    else
      context = build_strategy_context(state, symbol)

      # Pass full candle buffer to strategy (not just latest candle)
      candle_buffer = Map.get(state.candle_buffers, symbol, [candle])

      case strategy.generate_signal(candle_buffer, nil, context) do
        {:ok, signal} ->
          BotLogger.debug(state.bot_id, :signal, "Signal generated", %{
            symbol: symbol,
            direction: signal[:direction],
            confidence: signal[:confidence]
          })

          new_state = %{state |
            recent_signals: Map.put(state.recent_signals, symbol, now)
          }

          if strategy.should_enter?(signal, context) do
            case execute_trade(signal, new_state) do
              {:ok, _pos, updated} -> updated
              {:error, reason} ->
                BotLogger.warning(state.bot_id, :trade, "Trade not executed", %{
                  symbol: symbol,
                  reason: inspect(reason)
                })
                new_state
            end
          else
            BotLogger.debug(state.bot_id, :signal, "Entry conditions not met", %{symbol: symbol})
            new_state
          end

        {:error, reason} ->
          BotLogger.debug(state.bot_id, :signal, "Signal rejected", %{
            symbol: symbol,
            reason: inspect(reason)
          })
          state
      end
    end
  end

  defp build_strategy_context(state, symbol) do
    %{
      bot_id: state.bot_id,
      user_id: state.user_id,
      credential_id: state.credential_id,
      strategy_id: state.strategy_id,
      symbol: symbol,
      config: state.config,
      positions: state.positions,
      price_cache: state.price_cache,
      balance: get_balance(state)
    }
  end

  # ========================================================================
  # TRADE EXECUTION
  # ========================================================================

  defp execute_trade(signal, state) do
    strategy = state.strategy_module
    balance = get_balance(state)
    context = build_strategy_context(state, signal.symbol)

    if balance <= 0 do
      {:error, :no_balance}
    else
      # Normalize symbol to Binance format for tier check (tier lists use "BTCUSDT" format)
      base_pair = signal.symbol |> String.split(":") |> List.first()
      tier_symbol = base_pair |> String.replace("/", "") |> String.upcase()
      tier_symbol = tier_symbol |> String.split("_") |> List.first()
      tier_symbol = if String.ends_with?(tier_symbol, "USDT"), do: tier_symbol, else: tier_symbol <> "T"

      # Use DB-backed tier check via adapter code (falls back to hardcoded if no DB config)
      config = AssetTierManager.get_config_by_code("binance")
      allowed = AssetTierManager.is_allowed_by_code?(tier_symbol, balance, "binance")
      Logger.info("[BotTrading] Tier check: symbol=#{tier_symbol} balance=$#{Float.round(balance, 2)} allowed=#{allowed} | thresholds=#{inspect(config.tier_thresholds)} | tier_assets=#{inspect(Map.values(config.tier_assets) |> List.flatten() |> Enum.member?(tier_symbol))}")

      if not allowed do
        account_tier = AssetTierManager.get_account_tier_by_code(balance, "binance")
        Logger.warning("[BotTrading] ❌ ASSET BLOCKED: #{tier_symbol} | balance=$#{Float.round(balance, 2)} account_tier=#{account_tier} | allocated_capital=#{state.allocated_capital} | bot=#{state.bot_id}")
        {:error, :asset_not_in_tier}
      else
        case Executor.get_price(state.credential_id, signal.symbol, market_type: state.market_type) do
          {:ok, price} ->
            current_price = Decimal.to_float(price)
            execute_with_strategy(signal, state, strategy, context, current_price)
          _ ->
            {:error, :price_error}
        end
      end
    end
  end

  defp execute_with_strategy(signal, state, strategy, context, current_price) do
    # Read from strategy config JSONB with fallback to module attributes
    max_hold = get_strategy_param(state.config, "max_hold_minutes", @max_hold_minutes)
    min_notional = get_strategy_param(state.config, "min_notional", @min_notional)

    # Binance futures requires minimum $100 notional
    effective_min_notional = if state.market_type in ["usds_futures", "coinm_futures"],
      do: max(min_notional, 100.0),
      else: min_notional

    # Delegate position sizing to strategy module
    case strategy.calculate_position_size(signal, context) do
      {:ok, quantity, position_value} ->
        notional = quantity * current_price
        if notional < effective_min_notional do
          Logger.warning("[BotTrading] Notional too low: $#{Float.round(notional, 2)} < $#{effective_min_notional} min for #{signal.symbol}")
          {:error, :notional_too_low}
        else
          # Delegate stop loss to strategy module
          stop_loss = strategy.calculate_stop_loss(signal, current_price, context)

          # Get impulse target from signal
          impulse_target = get_signal_target(signal) || current_price

          position_id = Ecto.UUID.generate()

          bot_context = [
            user_id: state.user_id,
            bot_id: state.bot_id,
            credential_id: state.credential_id,
            strategy_id: state.strategy_id,
            market_type: state.market_type,
            position_id: position_id,
            confidence: signal.confidence,
            peak_price: impulse_target,
            peak_time: max_hold
          ]

          # Reserve virtual balance
          vb_reserved = if VirtualBalanceManager.running?() do
            case VirtualBalanceManager.reserve_for_position(state.user_id, position_id, position_value) do
              {:ok, _} -> true
              _ -> false
            end
          else
            false
          end

          BotLogger.info(state.bot_id, :trade, "Opening position", %{
            symbol: signal.symbol,
            direction: signal.direction,
            quantity: Float.round(quantity, 6),
            price: current_price
          })

          exchange_result = case signal.direction do
            :long ->
              Logger.info("Bot #{state.bot_id} BUY: #{signal.symbol} qty=#{Float.round(quantity, 6)} via #{inspect(strategy)}")
              Executor.execute_long(state.credential_id, signal.symbol, quantity, bot_context)
            :short ->
              Logger.info("Bot #{state.bot_id} SHORT: #{signal.symbol} qty=#{Float.round(quantity, 6)} via #{inspect(strategy)}")
              Executor.execute_short(state.credential_id, signal.symbol, quantity, bot_context)
            _ ->
              {:error, :invalid_direction}
          end

          case exchange_result do
            {:ok, order_result} ->
              executed_price = order_result[:executed_price] || current_price
              executed_qty = order_result[:executed_qty] || quantity

              position = %{
                id: position_id,
                bot_id: state.bot_id,
                user_id: state.user_id,
                credential_id: state.credential_id,
                strategy_id: state.strategy_id,
                symbol: signal.symbol,
                direction: signal.direction,
                quantity: executed_qty,
                entry_price: executed_price,
                current_price: executed_price,
                impulse_target: impulse_target,
                impulse_size: abs(impulse_target - executed_price),
                stop_loss: stop_loss,
                confidence: signal.confidence,
                entry_time: DateTime.utc_now(),
                target_exit_time: DateTime.add(DateTime.utc_now(), max_hold * 60, :second),
                status: :open,
                position_value: position_value,
                virtual_balance_user: vb_reserved,
                exchange_order_id: order_result[:order_id]
              }

              BotRegistry.update_position_count(state.bot_id, map_size(state.positions) + 1)

              new_state = %{state |
                positions: Map.put(state.positions, position.id, position),
                total_trades: state.total_trades + 1,
                price_cache: Map.put(state.price_cache, signal.symbol, executed_price)
              }

              {:ok, position, new_state}

            {:error, reason} ->
              if vb_reserved, do: VirtualBalanceManager.release_reservation(state.user_id, position_id)
              Logger.error("Bot #{state.bot_id} trade failed: #{inspect(reason)}")
              BotLogger.error(state.bot_id, :trade, "Trade execution failed", %{
                symbol: signal.symbol,
                reason: inspect(reason)
              })
              BotRegistry.report_error(state.bot_id, "Trade failed: #{inspect(reason)}")
              {:error, reason}
          end
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  # ========================================================================
  # EXIT PROCESSING
  # ========================================================================

  defp process_exits(state) do
    strategy = state.strategy_module
    context = %{
      config: state.config,
      positions: state.positions,
      price_cache: state.price_cache,
      balance: get_balance(state)
    }

    to_close = state.positions
      |> Map.values()
      |> Enum.filter(&strategy.should_exit?(&1, context))

    Enum.reduce(to_close, state, fn pos, acc -> close_position(pos, acc) end)
  end

  defp close_position(pos, state) do
    exit_price = Map.get(state.price_cache, pos.symbol, pos.current_price)

    bot_context = [
      user_id: pos.user_id,
      bot_id: pos.bot_id,
      credential_id: pos.credential_id,
      strategy_id: pos.strategy_id,
      market_type: state.market_type,
      position_id: pos.id
    ]

    exchange_result = case pos.direction do
      :long -> Executor.close_long(state.credential_id, pos.symbol, pos.quantity, pos.entry_price, bot_context)
      :short -> Executor.close_short(state.credential_id, pos.symbol, pos.quantity, pos.entry_price, bot_context)
      _ -> {:error, :invalid_direction}
    end

    {final_exit_price, pnl} = case exchange_result do
      {:ok, result} -> {result[:executed_price] || exit_price, result[:pnl] || calc_pnl(pos, exit_price)}
      {:error, _} -> {exit_price, calc_pnl(pos, exit_price)}
    end

    is_win = pnl >= 0

    BotLogger.info(state.bot_id, :exit, "Position closed", %{
      symbol: pos.symbol,
      direction: pos.direction,
      pnl: Float.round(pnl, 4),
      entry_price: pos.entry_price,
      exit_price: final_exit_price
    })

    # Release virtual balance
    if Map.get(pos, :virtual_balance_user, false) do
      principal = Map.get(pos, :position_value, pos.entry_price * pos.quantity)
      VirtualBalanceManager.close_position(pos.user_id, pos.id, principal, pnl)
    end

    # Report to BotRegistry
    BotRegistry.report_trade(state.bot_id, pnl, is_win)

    %{state |
      positions: Map.delete(state.positions, pos.id),
      winning_trades: state.winning_trades + if(is_win, do: 1, else: 0),
      losing_trades: state.losing_trades + if(is_win, do: 0, else: 1),
      total_realized_pnl: state.total_realized_pnl + pnl,
      recent_signals: Map.delete(state.recent_signals, pos.symbol)
    }
  end

  defp calc_pnl(pos, exit_price) do
    case pos.direction do
      :long -> (exit_price - pos.entry_price) * pos.quantity
      :short -> (pos.entry_price - exit_price) * pos.quantity
      _ -> 0.0
    end
  end

  # ========================================================================
  # PRICE UPDATES
  # ========================================================================

  defp update_prices(state) do
    symbols = state.positions |> Map.values() |> Enum.map(& &1.symbol) |> Enum.uniq()

    new_cache = Enum.reduce(symbols, state.price_cache, fn sym, cache ->
      case Executor.get_price(state.credential_id, sym, market_type: state.market_type) do
        {:ok, price} -> Map.put(cache, sym, Decimal.to_float(price))
        _ -> cache
      end
    end)

    updated_positions = state.positions
      |> Enum.map(fn {id, pos} ->
        {id, %{pos | current_price: Map.get(new_cache, pos.symbol, pos.current_price)}}
      end)
      |> Enum.into(%{})

    %{state | price_cache: new_cache, positions: updated_positions}
  end

  defp get_balance(state) do
    if VirtualBalanceManager.running?() do
      case VirtualBalanceManager.get_available_balance(state.user_id) do
        {:ok, vb} when vb > 0 -> vb
        _ -> state.allocated_capital || 100.0
      end
    else
      state.allocated_capital || 100.0
    end
  end

  # ========================================================================
  # HELPERS
  # ========================================================================

  defp resolve_strategy_module(bot) do
    # Try class_module from strategy, then strategy type, then fallback
    class_module = Map.get(bot, :class_module) || Map.get(bot, :strategy_type)
    StrategyBehaviour.resolve_module(class_module)
  end

  # Read a parameter from strategy config JSONB, falling back to a default.
  # This is the core mechanism for making hardcoded params DB-configurable:
  # the admin saves values into strategy.strategies.config JSONB, and this
  # function reads them at runtime with compile-time @attr as fallback.
  defp get_strategy_param(config, key, default) when is_map(config) do
    case Map.get(config, key) do
      nil -> default
      val when is_binary(val) ->
        case Float.parse(val) do
          {num, ""} -> num
          _ -> default
        end
      val -> val
    end
  end

  defp get_strategy_param(_, _, default), do: default

  defp get_signal_target(signal) do
    cond do
      signal[:physics] && signal.physics[:peak_price] -> to_float(signal.physics[:peak_price])
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
