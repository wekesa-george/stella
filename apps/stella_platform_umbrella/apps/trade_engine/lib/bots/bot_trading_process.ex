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
  alias TradeEngine.Exchanges.{Executor, HealthMonitor}
  alias TradeEngine.Trading.{OrderManager, Position}
  alias TradeEngine.Risk.{AssetTierManager, VirtualBalanceManager}
  alias TradeEngine.Strategies.Behaviour, as: StrategyBehaviour
  alias TradeEngine.Repo

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

        is_grid = strategy_module == TradeEngine.Strategies.GridBot

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
          max_positions: Map.get(merged_config, "max_positions", 3),
          # Grid bot state (only used when strategy is GridBot)
          is_grid: is_grid,
          grid_orders: %{},          # %{price_level => %{order_id, side, status}}
          grid_initialized: false,
          grid_restart_pending: false  # Set true after stop-loss to trigger grid redeployment
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

        # Grid bot: check for filled orders every 10s
        if is_grid do
          Process.send_after(self(), :grid_check_fills, 10_000)
        end

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
      "LONG" -> OrderManager.execute_long(state.credential_id, symbol, quantity, bot_context)
      "SHORT" -> OrderManager.execute_short(state.credential_id, symbol, quantity, bot_context)
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
  def handle_info(:grid_check_fills, state) do
    if state.is_grid do
      Process.send_after(self(), :grid_check_fills, 10_000)
      {:noreply, grid_check_fills(state)}
    else
      {:noreply, state}
    end
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
    # Grid restart: if stop-loss triggered, recenter grid before processing
    state = if state.is_grid, do: maybe_restart_grid(state), else: state

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

      # Add grid_orders to context so the strategy can see existing orders
      context = if state.is_grid do
        Map.put(context, :grid_orders, state.grid_orders)
      else
        context
      end

      case strategy.generate_signal(candle_buffer, nil, context) do
        {:ok, %{direction: :grid} = signal} ->
          # Grid signal → manage grid of limit orders
          BotLogger.debug(state.bot_id, :signal, "Grid signal generated", %{
            symbol: symbol,
            buy_levels: length(signal.buy_levels),
            sell_levels: length(signal.sell_levels),
            current_price: signal.current_price
          })

          new_state = %{state |
            recent_signals: Map.put(state.recent_signals, symbol, now)
          }

          execute_grid_orders(signal, new_state)

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
          BotLogger.warning(state.bot_id, :signal, "Signal rejected", %{
            symbol: symbol,
            reason: inspect(reason),
            config_upper: state.config["upper_price"],
            config_lower: state.config["lower_price"],
            config_keys: inspect(Map.keys(state.config))
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

    cond do
      balance <= 0 ->
        {:error, :no_balance}

      # Exchange health gate: block trades if exchange is disconnected
      check_exchange_health() != :ok ->
        Logger.warning("[BotTrading] Exchange disconnected — halting trade")
        {:error, :exchange_disconnected}

      true ->
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
          # Stale price guard: verify we have a fresh price before trading
          case get_fresh_price(state.credential_id, signal.symbol, state.market_type) do
            {:ok, price} ->
              current_price = Decimal.to_float(price)

              # Pre-trade balance verification against exchange
              case verify_exchange_balance(state.credential_id, signal.symbol, balance, signal.direction, current_price) do
                {:error, :insufficient_balance, details} ->
                  Logger.warning("[BotTrading] Insufficient exchange balance: need #{details.required}, have #{details.available} #{details.asset}")
                  {:error, :insufficient_exchange_balance}

                _ ->
                  # Pre-entry correlation/concentration check
                  case TradeEngine.Risk.CorrelationMonitor.can_open?(signal.symbol, signal.direction, current_price * 100) do
                    :ok ->
                      execute_with_strategy(signal, state, strategy, context, current_price)
                    {:blocked, reason} ->
                      Logger.warning("[BotTrading] Blocked by correlation monitor: #{reason}")
                      {:error, :correlation_blocked}
                  end
              end

            {:error, :stale_price} ->
              Logger.warning("[BotTrading] Stale price for #{signal.symbol} — skipping trade")
              {:error, :stale_price}

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
        # Round quantity to exchange precision (Binance truncates to step size)
        qty_precision = exchange_qty_precision(signal.symbol, state.market_type)
        rounded_qty = Float.floor(quantity * :math.pow(10, qty_precision)) / :math.pow(10, qty_precision)

        # If rounded notional is below minimum, bump quantity up to meet it
        rounded_notional = rounded_qty * current_price
        quantity = if rounded_notional < effective_min_notional and current_price > 0 do
          min_qty = Float.ceil(effective_min_notional / current_price * :math.pow(10, qty_precision)) / :math.pow(10, qty_precision)
          Logger.info("[BotTrading] Bumping qty from #{Float.round(rounded_qty, 6)} to #{Float.round(min_qty, 6)} to meet $#{effective_min_notional} min notional")
          min_qty
        else
          rounded_qty
        end

        notional = quantity * current_price
        if notional < effective_min_notional do
          Logger.warning("[BotTrading] Notional too low: $#{Float.round(notional, 2)} < $#{effective_min_notional} min for #{signal.symbol}")
          {:error, :notional_too_low}
        else
          # Delegate stop loss to strategy module
          stop_loss = strategy.calculate_stop_loss(signal, current_price, context)

          # Get impulse target from signal
          impulse_target = get_signal_target(signal) || current_price

          # ML pre-trade filter: check if classifier predicts a win
          classifier_features = %{
            confidence: signal.confidence || 65,
            momentum: signal[:momentum] || context[:momentum] || 0.0,
            gravity: signal[:gravity] || context[:gravity] || 0.0,
            atr_pct: signal[:atr_pct] || context[:atr_pct] || 0.003,
            momentum_acceleration: signal[:momentum_acceleration] || context[:momentum_acceleration] || 0.0,
            trajectory_angle: signal[:trajectory_angle] || context[:trajectory_angle] || 0.0,
            kinetic_energy: signal[:kinetic_energy] || context[:kinetic_energy] || 0.0,
            entry_price: current_price,
            stop_loss: stop_loss || current_price,
            impulse_target: impulse_target,
            position_value: position_value,
            direction: signal.direction,
            energy_state: signal[:energy_state] || context[:energy_state] || :medium,
            regime: signal[:regime] || context[:regime] || :unknown
          }

          case TradeEngine.AI.TradeClassifier.should_trade?(classifier_features) do
            {:blocked, reason} ->
              Logger.info("[BotTrading] ML classifier blocked trade: #{reason}")
              BotLogger.info(state.bot_id, :trade, "Trade blocked by ML classifier", %{
                symbol: signal.symbol, direction: signal.direction, reason: reason
              })
              {:error, :ml_classifier_blocked}

            _ ->
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
                peak_time: max_hold,
                expected_price: current_price
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
                  OrderManager.execute_long(state.credential_id, signal.symbol, quantity, bot_context)
                :short ->
                  Logger.info("Bot #{state.bot_id} SHORT: #{signal.symbol} qty=#{Float.round(quantity, 6)} via #{inspect(strategy)}")
                  OrderManager.execute_short(state.credential_id, signal.symbol, quantity, bot_context)
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

                  # Persist position to DB
                  persist_position_open(position)

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

    had_positions = map_size(state.positions) > 0
    state = Enum.reduce(to_close, state, fn pos, acc -> close_position(pos, acc) end)
    all_closed = had_positions and map_size(state.positions) == 0 and length(to_close) > 0

    # Grid bot stop-loss restart: if all positions were closed and this is a grid bot
    # with restart_on_stop_loss enabled, cancel pending grid orders and flag for restart
    if all_closed and state.is_grid and get_strategy_param(state.config, "restart_on_stop_loss", true) do
      BotLogger.info(state.bot_id, :grid, "Stop-loss triggered — cancelling grid orders and scheduling restart", %{
        closed_count: length(to_close),
        pending_grid_orders: map_size(state.grid_orders)
      })

      state = cancel_all_grid_orders(state)
      %{state | grid_restart_pending: true, grid_initialized: false}
    else
      state
    end
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
      :long -> OrderManager.close_long(state.credential_id, pos.symbol, pos.quantity, pos.entry_price, bot_context)
      :short -> OrderManager.close_short(state.credential_id, pos.symbol, pos.quantity, pos.entry_price, bot_context)
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

    # Persist closed position to DB
    persist_position_close(pos, final_exit_price, pnl)

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
  # STALE PRICE GUARD
  # ========================================================================

  @max_price_age_ms 60_000  # 60 seconds — reject trades with older prices

  defp check_exchange_health do
    case HealthMonitor.get_health("binance") do
      {:ok, %{status: "healthy"}} -> :ok
      {:ok, %{status: "degraded"}} ->
        Logger.warning("[BotTrading] Exchange degraded — proceeding with caution")
        :ok
      {:ok, %{status: "disconnected"}} -> {:error, :exchange_disconnected}
      {:error, :not_found} -> :ok  # Monitor not tracking this exchange yet
      {:error, :not_started} -> :ok  # Monitor hasn't started yet
      _ -> :ok
    end
  rescue
    _ -> :ok  # Don't block trading if health check itself fails
  end

  defp verify_exchange_balance(credential_id, symbol, quantity, side, current_price) do
    # Use Executor.get_balance instead of legacy BinanceClient
    market_type = "spot"
    case Executor.get_balance(credential_id, market_type: market_type) do
      {:ok, balance_data} ->
        assets = balance_data[:assets] || []

        case side do
          :long ->
            # Buying: need quote currency (USDT)
            usdt = Enum.find(assets, fn a ->
              asset_name = to_string(a[:asset] || a["asset"] || "")
              String.upcase(asset_name) == "USDT"
            end)
            available = parse_balance(usdt[:wallet_balance] || usdt["wallet_balance"] || 0)
            required = quantity * current_price

            if available >= required do
              {:ok, %{required: required, available: available}}
            else
              {:error, :insufficient_balance, %{required: required, available: available, asset: "USDT"}}
            end

          :short ->
            # Selling: need base currency
            norm = symbol |> String.split(":") |> List.first() |> String.replace("/", "") |> String.upcase()
            base = Enum.find_value(["USDT", "USDC", "BUSD"], norm, fn q ->
              if String.ends_with?(norm, q), do: String.replace_suffix(norm, q, "")
            end)

            asset = Enum.find(assets, fn a ->
              asset_name = to_string(a[:asset] || a["asset"] || "")
              String.upcase(asset_name) == base
            end)
            available = parse_balance(asset[:wallet_balance] || asset["wallet_balance"] || 0)

            if available >= quantity do
              {:ok, %{required: quantity, available: available, asset: base}}
            else
              {:error, :insufficient_balance, %{required: quantity, available: available, asset: base}}
            end

          _ -> {:ok, %{}}
        end

      {:error, _reason} ->
        # Can't verify — proceed with trade (don't block on balance check failure)
        {:ok, %{}}
    end
  rescue
    _ -> {:ok, %{}}
  end

  defp parse_balance(v) when is_number(v), do: v * 1.0
  defp parse_balance(v) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  defp parse_balance(%Decimal{} = d), do: Decimal.to_float(d)
  defp parse_balance(_), do: 0.0

  defp get_fresh_price(credential_id, symbol, market_type) do
    # Try ETS cache first and check freshness
    norm = symbol |> String.split(":") |> List.first() |> String.replace("/", "") |> String.upcase()

    cached_result = try do
      case :ets.lookup(:binance_ticker_cache, norm) do
        [{_, %{last_price: p, updated_at: ts}}] when is_number(p) ->
          age = System.system_time(:millisecond) - ts
          if age < @max_price_age_ms, do: {:ok, p, age}, else: {:stale, age}

        [{_, %{"last_price" => p}}] when is_number(p) ->
          # No timestamp — treat as potentially stale, fall through to REST
          {:no_ts, p}

        _ -> :miss
      end
    rescue
      _ -> :miss
    end

    case cached_result do
      {:ok, price, _age} ->
        {:ok, Decimal.from_float(price)}

      {:stale, age} ->
        Logger.warning("[BotTrading] ETS price for #{norm} is #{div(age, 1000)}s old — fetching fresh from REST")
        fetch_rest_price(credential_id, symbol, market_type)

      {:no_ts, _price} ->
        # No timestamp in cache — fetch fresh to be safe
        fetch_rest_price(credential_id, symbol, market_type)

      :miss ->
        fetch_rest_price(credential_id, symbol, market_type)
    end
  end

  defp fetch_rest_price(credential_id, symbol, market_type) do
    case Executor.get_price(credential_id, symbol, market_type: market_type) do
      {:ok, price} -> {:ok, price}
      error -> error
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

  # Price precision matching Binance tick sizes (PRICE_FILTER)
  defp exchange_price_precision(symbol, _market_type) do
    cond do
      String.starts_with?(symbol, "BTC") -> 2
      String.starts_with?(symbol, "ETH") -> 2
      String.starts_with?(symbol, "BNB") -> 2
      String.starts_with?(symbol, "SOL") -> 2
      String.starts_with?(symbol, "XRP") -> 4
      String.starts_with?(symbol, "DOGE") -> 5
      String.starts_with?(symbol, "ADA") -> 4
      String.starts_with?(symbol, "DOT") -> 3
      String.starts_with?(symbol, "LINK") -> 3
      String.starts_with?(symbol, "AVAX") -> 2
      true -> 2
    end
  end

  # Quantity precision matching Binance step sizes
  defp exchange_qty_precision(symbol, market_type) do
    is_futures = market_type in ["usds_futures", "coinm_futures"]
    cond do
      String.starts_with?(symbol, "BTC") and is_futures -> 3
      String.starts_with?(symbol, "ETH") and is_futures -> 3
      String.starts_with?(symbol, "BTC") -> 5
      String.starts_with?(symbol, "ETH") -> 4
      true -> 3
    end
  end

  defp to_float(nil), do: nil
  defp to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp to_float(n) when is_float(n), do: n
  defp to_float(n) when is_integer(n), do: n * 1.0
  defp to_float(_), do: nil

  # ========================================================================
  # GRID BOT — ORDER MANAGEMENT
  # ========================================================================

  defp execute_grid_orders(signal, state) do
    max_orders = get_strategy_param(state.config, "max_open_orders", 20)
    current_order_count = map_size(state.grid_orders)
    available_slots = max(0, max_orders - current_order_count)

    if available_slots == 0 do
      BotLogger.debug(state.bot_id, :grid, "Grid full, no slots available", %{
        max_orders: max_orders,
        current: current_order_count
      })
      state
    else
      symbol = signal.symbol
      raw_qty = signal.quantity_per_grid
      is_spot = state.market_type in [nil, "spot"]

      # Round quantity to exchange precision upfront (floor to avoid overspend)
      qty_precision = exchange_qty_precision(symbol, state.market_type)
      qty = Float.floor(raw_qty * :math.pow(10, qty_precision)) / :math.pow(10, qty_precision)

      # Cap buy orders by available capital
      total_investment = get_strategy_param(state.config, "total_investment", state.allocated_capital)
      locked_capital = state.grid_orders
        |> Enum.filter(fn {_level, entry} -> entry.side == "BUY" end)
        |> Enum.reduce(0.0, fn {_level, entry}, acc -> acc + entry.quantity * entry.price end)
      remaining_capital = max(0.0, total_investment - locked_capital)

      BotLogger.info(state.bot_id, :grid, "Grid order execution starting", %{
        symbol: symbol,
        current_price: signal.current_price,
        raw_qty_per_grid: Float.round(raw_qty, 8),
        rounded_qty: qty,
        qty_precision: qty_precision,
        total_investment: total_investment,
        locked_capital: Float.round(locked_capital, 2),
        remaining_capital: Float.round(remaining_capital, 2),
        buy_levels: length(signal.buy_levels),
        sell_levels: length(signal.sell_levels),
        existing_orders: current_order_count,
        available_slots: available_slots,
        market_type: state.market_type
      })

      if qty <= 0 do
        BotLogger.error(state.bot_id, :grid, "Grid qty rounds to zero — increase total_investment or reduce grid_levels", %{
          raw_qty: Float.round(raw_qty, 8),
          qty_precision: qty_precision,
          total_investment: total_investment,
          grid_levels: get_strategy_param(state.config, "grid_levels", 10),
          current_price: signal.current_price
        })
        state
      else
        buy_levels = Enum.take(signal.buy_levels, available_slots)

        {state, _capital_left} = Enum.reduce(buy_levels, {state, remaining_capital}, fn price_level, {acc, capital} ->
          order_cost = qty * price_level
          if map_size(acc.grid_orders) < max_orders and capital >= order_cost do
            new_state = place_grid_limit_order(acc, symbol, "BUY", qty, price_level)
            if map_size(new_state.grid_orders) > map_size(acc.grid_orders) do
              {new_state, capital - order_cost}
            else
              {new_state, capital}
            end
          else
            {acc, capital}
          end
        end)

        placed_buy_count = map_size(state.grid_orders) - current_order_count

        if is_spot do
          BotLogger.info(state.bot_id, :grid, "Spot grid orders placed", %{
            buy_orders_placed: placed_buy_count,
            buy_levels_available: length(buy_levels),
            sell_levels_skipped: length(signal.sell_levels)
          })
          state
        else
          # Futures: can place sells (shorts) upfront
          remaining_slots = max(0, max_orders - map_size(state.grid_orders))
          sell_levels = Enum.take(signal.sell_levels, remaining_slots)

          state = Enum.reduce(sell_levels, state, fn price_level, acc ->
            if map_size(acc.grid_orders) < max_orders do
              place_grid_limit_order(acc, symbol, "SELL", qty, price_level)
            else
              acc
            end
          end)

          placed_sell_count = map_size(state.grid_orders) - current_order_count - placed_buy_count

          BotLogger.info(state.bot_id, :grid, "Futures grid orders placed", %{
            buy_orders_placed: placed_buy_count,
            sell_orders_placed: placed_sell_count,
            total_grid_orders: map_size(state.grid_orders)
          })
          state
        end
      end
    end
  end

  defp place_grid_limit_order(state, symbol, side, quantity, price_level) do
    # Round price and quantity to exchange precision to avoid PRICE_FILTER errors
    price_precision = exchange_price_precision(symbol, state.market_type)
    qty_precision = exchange_qty_precision(symbol, state.market_type)
    rounded_price = Float.round(price_level / 1, price_precision)
    # Use floor for quantity — never round up beyond what capital allows
    rounded_qty = Float.floor(quantity * :math.pow(10, qty_precision)) / :math.pow(10, qty_precision)

    # Validate: quantity must be > 0 and notional must meet exchange minimum ($5 futures, $10 spot)
    is_futures = state.market_type in ["usds_futures", "coinm_futures"]
    min_notional = if is_futures, do: 5.0, else: 10.0
    notional = rounded_qty * rounded_price

    cond do
      rounded_qty <= 0 ->
        BotLogger.warning(state.bot_id, :grid, "Grid order skipped: quantity rounds to zero", %{
          side: side,
          raw_qty: Float.round(quantity, 8),
          rounded_qty: rounded_qty,
          price: rounded_price,
          qty_precision: qty_precision
        })
        state

      notional < min_notional ->
        BotLogger.warning(state.bot_id, :grid, "Grid order skipped: below min notional", %{
          side: side,
          notional: Float.round(notional, 2),
          min_notional: min_notional,
          qty: rounded_qty,
          price: rounded_price
        })
        state

      true ->
        bot_context = [
          user_id: state.user_id,
          bot_id: state.bot_id,
          credential_id: state.credential_id,
          strategy_id: state.strategy_id,
          market_type: state.market_type,
          grid_level: price_level
        ]

        case OrderManager.place_limit_order(
          state.credential_id, symbol, side, rounded_qty, rounded_price, bot_context
        ) do
          {:ok, result} ->
            order_id = result[:order_id]

            BotLogger.info(state.bot_id, :grid, "Grid order placed", %{
              side: side,
              price: rounded_price,
              quantity: rounded_qty,
              notional: Float.round(notional, 2),
              order_id: order_id
            })

            grid_entry = %{
              order_id: order_id,
              side: side,
              quantity: rounded_qty,
              price: rounded_price,
              symbol: symbol,
              status: "NEW",
              placed_at: DateTime.utc_now()
            }

            %{state |
              grid_orders: Map.put(state.grid_orders, rounded_price, grid_entry),
              total_trades: state.total_trades + 1
            }

          {:error, reason} ->
            BotLogger.warning(state.bot_id, :grid, "Grid order failed", %{
              side: side,
              price: rounded_price,
              quantity: rounded_qty,
              notional: Float.round(notional, 2),
              reason: inspect(reason)
            })
            state
        end
    end
  end

  # Cancel all pending grid limit orders on the exchange and clear local state
  defp cancel_all_grid_orders(state) do
    symbol = List.first(state.trading_pairs)

    Enum.each(state.grid_orders, fn {_level, entry} ->
      order_id = entry.order_id
      if order_id do
        case OrderManager.cancel_order(state.credential_id, symbol, order_id) do
          {:ok, _} ->
            BotLogger.debug(state.bot_id, :grid, "Cancelled grid order", %{order_id: order_id, price: entry.price})
          {:error, reason} ->
            BotLogger.warning(state.bot_id, :grid, "Failed to cancel grid order", %{order_id: order_id, reason: inspect(reason)})
        end
      end
    end)

    %{state | grid_orders: %{}}
  end

  # Restart grid after stop-loss: recenter around current price and redeploy
  defp maybe_restart_grid(state) do
    if not state.grid_restart_pending do
      state
    else
      symbol = List.first(state.trading_pairs)
      current_price = Map.get(state.price_cache, symbol, 0.0)

      if current_price <= 0 do
        # No price yet — wait for next tick
        state
      else
        new_config = TradeEngine.Strategies.GridBot.recentered_config(state.config, current_price)

        BotLogger.info(state.bot_id, :grid, "Grid restarting after stop-loss", %{
          current_price: current_price,
          new_lower: new_config["lower_price"],
          new_upper: new_config["upper_price"],
          new_stop_loss: new_config["stop_loss_price"]
        })

        %{state |
          config: new_config,
          grid_restart_pending: false,
          grid_initialized: false,
          grid_orders: %{}
        }
      end
    end
  end

  # Check exchange for filled grid orders and place counter-orders
  defp grid_check_fills(state) do
    if map_size(state.grid_orders) == 0 do
      state
    else
      symbol = List.first(state.trading_pairs)
      if is_nil(symbol), do: state, else: do_grid_check_fills(state, symbol)
    end
  end

  defp do_grid_check_fills(state, symbol) do
    case OrderManager.get_open_orders(state.credential_id, symbol, market_type: state.market_type) do
      {:ok, open_orders} ->
        open_ids = MapSet.new(open_orders, fn o -> o.order_id end)

        # Find grid orders that are no longer open on exchange → they were filled
        {filled, still_open} = state.grid_orders
          |> Enum.split_with(fn {_level, entry} ->
            entry.order_id && not MapSet.member?(open_ids, entry.order_id)
          end)

        if length(filled) == 0 do
          state
        else
          BotLogger.info(state.bot_id, :grid, "Grid fills detected", %{
            filled_count: length(filled),
            open_count: length(still_open)
          })

          # Process each filled order: place counter-order
          state = %{state | grid_orders: Map.new(still_open)}

          Enum.reduce(filled, state, fn {price_level, entry}, acc ->
            process_grid_fill(acc, symbol, entry, price_level)
          end)
        end

      {:error, reason} ->
        BotLogger.warning(state.bot_id, :grid, "Failed to check open orders", %{
          reason: inspect(reason)
        })
        state
    end
  end

  defp process_grid_fill(state, symbol, filled_entry, filled_price) do
    config = state.config
    grid_levels = TradeEngine.Strategies.GridBot.compute_grid_levels(config)
    sorted_levels = Enum.sort(grid_levels)

    # Find the next level for a counter-order
    counter_side = if filled_entry.side == "BUY", do: "SELL", else: "BUY"

    counter_price = if filled_entry.side == "BUY" do
      # Buy filled → place sell one level above
      sorted_levels |> Enum.find(fn l -> l > filled_price end)
    else
      # Sell filled → place buy one level below
      sorted_levels |> Enum.reverse() |> Enum.find(fn l -> l < filled_price end)
    end

    pnl = if filled_entry.side == "SELL" do
      # A sell fill completes a grid cycle — estimate profit
      # (sell_price - buy_price) * quantity, approximated by grid spacing
      grid_spacing = if length(sorted_levels) >= 2 do
        Enum.at(sorted_levels, 1) - Enum.at(sorted_levels, 0)
      else
        0.0
      end
      grid_spacing * filled_entry.quantity
    else
      0.0
    end

    if pnl > 0 do
      BotRegistry.report_trade(state.bot_id, pnl, true)
    end

    state = if pnl > 0 do
      %{state |
        winning_trades: state.winning_trades + 1,
        total_realized_pnl: state.total_realized_pnl + pnl
      }
    else
      state
    end

    BotLogger.info(state.bot_id, :grid, "Grid fill processed", %{
      filled_side: filled_entry.side,
      filled_price: filled_price,
      counter_side: counter_side,
      counter_price: counter_price,
      estimated_pnl: Float.round(pnl, 4)
    })

    # Place counter-order if we have a valid price level
    if counter_price do
      place_grid_limit_order(state, symbol, counter_side, filled_entry.quantity, counter_price)
    else
      BotLogger.warning(state.bot_id, :grid, "No counter-level found (price at grid boundary)", %{
        filled_price: filled_price,
        side: filled_entry.side
      })
      state
    end
  end

  # ════════════════════════════════════════════════════════════════════════════
  # POSITION DB PERSISTENCE
  # ════════════════════════════════════════════════════════════════════════════

  defp persist_position_open(pos) do
    direction = to_string(pos.direction)
    side = if direction in ["long", "short"], do: direction, else: "long"

    attrs = %{
      symbol: pos.symbol,
      position_type: side,
      quantity: Decimal.from_float(pos.quantity + 0.0),
      entry_price: Decimal.from_float(pos.entry_price + 0.0),
      current_price: Decimal.from_float(pos.entry_price + 0.0),
      status: "open",
      entry_time: pos.entry_time,
      user_id: pos.user_id,
      bot_id: pos.bot_id,
      credential_id: pos.credential_id,
      strategy_id: pos.strategy_id,
      entry_order_id: pos.exchange_order_id
    }

    case Repo.insert(Position.changeset(%Position{id: pos.id}, attrs)) do
      {:ok, _} ->
        Logger.info("[BotTrading] Position persisted to DB: #{pos.id} #{side} #{pos.symbol}")
      {:error, changeset} ->
        Logger.warning("[BotTrading] Failed to persist position #{pos.id}: #{inspect(changeset.errors)}")
    end
  rescue
    e -> Logger.warning("[BotTrading] Position persist exception: #{inspect(e)}")
  end

  defp persist_position_close(pos, exit_price, pnl) do
    case Repo.get(Position, pos.id) do
      nil ->
        Logger.warning("[BotTrading] Position #{pos.id} not found in DB for close update")
      db_pos ->
        changeset = Position.changeset(db_pos, %{
          status: "closed",
          exit_price: Decimal.from_float(exit_price + 0.0),
          current_price: Decimal.from_float(exit_price + 0.0),
          profit_loss: Decimal.from_float(pnl + 0.0),
          exit_time: DateTime.utc_now(),
          exit_reason: "strategy_exit"
        })

        case Repo.update(changeset) do
          {:ok, _} ->
            Logger.info("[BotTrading] Position closed in DB: #{pos.id} pnl=#{Float.round(pnl, 4)}")
          {:error, changeset} ->
            Logger.warning("[BotTrading] Failed to close position #{pos.id} in DB: #{inspect(changeset.errors)}")
        end
    end
  rescue
    e -> Logger.warning("[BotTrading] Position close persist exception: #{inspect(e)}")
  end
end
