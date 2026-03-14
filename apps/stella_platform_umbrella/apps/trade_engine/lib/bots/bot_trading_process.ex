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
        raw_config = Map.get(bot, :config, %{})
        config = stringify_keys(raw_config)

        # Resolve strategy module from class_module or strategy type
        strategy_module = resolve_strategy_module(bot)
        strategy_defaults = strategy_module.default_config()
        merged_config = Map.merge(strategy_defaults, config)
        BotLogger.info(bot_id, :lifecycle, "Loading strategy", %{
          strategy: inspect(strategy_module),
          raw_config_keys: inspect(Map.keys(raw_config)),
          stringified_keys: inspect(Map.keys(config)),
          upper_price: config["upper_price"],
          lower_price: config["lower_price"],
          merged_upper: merged_config["upper_price"],
          merged_lower: merged_config["lower_price"]
        })

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
          grid_orders: if(is_grid, do: load_grid_orders_from_db(bot_id), else: %{}),  # %{price_level => %{order_id, side, status}}
          grid_initialized: false,  # set true below if orders were recovered from DB
          grid_restart_pending: false, # Set true after stop-loss to trigger grid redeployment
          grid_placement_cooldown_until: nil,  # DateTime — backoff after exchange rejects
          grid_consecutive_failures: 0         # Track consecutive placement failures for backoff
        }

        # If grid orders were recovered from DB, mark grid as initialized
        state = if is_grid and map_size(state.grid_orders) > 0 do
          BotLogger.info(bot_id, :grid, "Recovered grid orders from DB on restart", %{
            recovered_count: map_size(state.grid_orders),
            price_levels: Map.keys(state.grid_orders) |> Enum.sort()
          })
          %{state | grid_initialized: true}
        else
          state
        end

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

        # Grid bot: check for filled orders every 10s + adopt exchange positions
        # Reconcile exchange orders with DB-recovered grid orders on startup
        if is_grid do
          Process.send_after(self(), :grid_check_fills, 10_000)
          Process.send_after(self(), :adopt_exchange_positions, 3_000)
          Process.send_after(self(), :reconcile_grid_orders_with_exchange, 5_000)
          Process.send_after(self(), :sync_exchange_positions, 60_000)
        end

        # Futures: sync leverage on exchange to match bot config
        if Map.get(bot, :market_type, "spot") != "spot" do
          Process.send_after(self(), :sync_leverage, 2_000)
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
  def handle_info(:adopt_exchange_positions, state) do
    if state.is_grid do
      {:noreply, adopt_exchange_positions(state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:sync_leverage, state) do
    {:noreply, sync_leverage_on_exchange(state)}
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

  def handle_info(:reconcile_grid_orders_with_exchange, state) do
    if state.is_grid do
      symbol = List.first(state.trading_pairs)
      if symbol do
        {:noreply, reconcile_grid_orders_with_exchange(state, symbol)}
      else
        {:noreply, state}
      end
    else
      {:noreply, state}
    end
  end

  def handle_info(:sync_exchange_positions, state) do
    if state.is_grid and state.market_type in ["usds_futures", "coinm_futures"] do
      Process.send_after(self(), :sync_exchange_positions, 60_000)
      {:noreply, sync_exchange_positions_to_db(state)}
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

          # Grid boundary protection: alert when price breaks outside grid range
          if signal[:grid_breakout] do
            upper = get_strategy_param(state.config, "upper_price", 0)
            lower = get_strategy_param(state.config, "lower_price", 0)
            severity = if signal[:grid_breakout_pct] >= 2.0, do: :warning, else: :info
            log_fn = if severity == :warning, do: &BotLogger.warning/4, else: &BotLogger.info/4

            log_fn.(state.bot_id, :grid, "Price outside grid range", %{
              current_price: signal.current_price,
              upper: upper,
              lower: lower,
              breach: signal[:grid_breakout],
              breach_pct: signal[:grid_breakout_pct]
            })
          end

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

    # Grid bot stop-loss: if all positions were closed and this is a grid bot,
    # either restart with recentered grid or stop entirely based on config
    if all_closed and state.is_grid do
      restart_enabled = get_strategy_param(state.config, "restart_on_stop_loss", false)

      if restart_enabled do
        BotLogger.info(state.bot_id, :grid, "Stop-loss triggered — cancelling grid orders and scheduling restart", %{
          closed_count: length(to_close),
          pending_grid_orders: map_size(state.grid_orders)
        })

        state = cancel_all_grid_orders(state)
        %{state | grid_restart_pending: true, grid_initialized: false}
      else
        BotLogger.info(state.bot_id, :grid, "Stop-loss triggered — stopping bot (restart_on_stop_loss=false)", %{
          closed_count: length(to_close),
          pending_grid_orders: map_size(state.grid_orders)
        })

        state = cancel_all_grid_orders(state)
        # Request bot stop via registry so it transitions properly
        spawn(fn -> BotRegistry.stop_bot(state.bot_id) end)
        state
      end
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
            norm = normalize_to_exchange_symbol(symbol)
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
    norm = normalize_to_exchange_symbol(symbol)

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

  # Normalize CCXT symbol to exchange format
  # "BTC/USDT:USDT-260327" → "BTCUSDT_260327" (delivery futures)
  # "BTC/USDT:USDT" → "BTCUSDT" (perpetual)
  # "BTC/USDT" → "BTCUSDT" (spot)
  defp normalize_to_exchange_symbol(pair) do
    case String.split(pair, ":") do
      [base_quote, settle_part] ->
        base = String.replace(base_quote, "/", "") |> String.upcase()
        case String.split(settle_part, "-") do
          [_settle, expiry] -> base <> "_" <> expiry
          _ -> base
        end
      _ ->
        pair |> String.replace("/", "") |> String.upcase()
    end
  end

  defp get_signal_target(signal) do
    cond do
      signal[:physics] && signal.physics[:peak_price] -> to_float(signal.physics[:peak_price])
      signal[:take_profit] -> to_float(signal[:take_profit])
      signal[:target_price] -> to_float(signal[:target_price])
      true -> nil
    end
  end

  # Price precision matching Binance tick sizes (PRICE_FILTER)
  # Futures tick sizes: BTC=0.1 (1dp), ETH=0.01 (2dp), BNB=0.01 (2dp), SOL=0.01 (2dp)
  # Spot tick sizes are generally finer but these work for both
  defp exchange_price_precision(symbol, market_type) do
    is_futures = market_type in ["usds_futures", "coinm_futures"]
    base = symbol |> String.split("/") |> List.first() |> String.split(":") |> List.first()

    cond do
      String.starts_with?(base, "BTC") and is_futures -> 1
      String.starts_with?(base, "BTC") -> 2
      String.starts_with?(base, "ETH") -> 2
      String.starts_with?(base, "BNB") -> 2
      String.starts_with?(base, "SOL") -> 2
      String.starts_with?(base, "XRP") -> 4
      String.starts_with?(base, "DOGE") -> 5
      String.starts_with?(base, "ADA") -> 4
      String.starts_with?(base, "DOT") -> 3
      String.starts_with?(base, "LINK") -> 3
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

    # Cooldown check: if we recently hit exchange order limits, back off
    now = DateTime.utc_now()
    in_cooldown = state.grid_placement_cooldown_until &&
      DateTime.compare(now, state.grid_placement_cooldown_until) == :lt

    cond do
      in_cooldown ->
        BotLogger.debug(state.bot_id, :grid, "Grid placement in cooldown", %{
          until: DateTime.to_iso8601(state.grid_placement_cooldown_until),
          consecutive_failures: state.grid_consecutive_failures
        })
        state

      available_slots == 0 ->
        BotLogger.debug(state.bot_id, :grid, "Grid full, no slots available", %{
          max_orders: max_orders,
          current: current_order_count
        })
        state

      # No new levels to place — all grid levels already have orders
      length(signal.buy_levels) == 0 and length(signal.sell_levels) == 0 ->
        BotLogger.debug(state.bot_id, :grid, "All grid levels covered, nothing to place", %{
          existing_orders: current_order_count
        })
        state

      true ->
      symbol = signal.symbol
      qty = signal.quantity_per_grid
      is_spot = state.market_type in [nil, "spot"]

      # Cap buy orders by available capital
      total_investment = get_strategy_param(state.config, "total_investment", state.allocated_capital)
      locked_capital = state.grid_orders
        |> Enum.filter(fn {_level, entry} -> entry.side == "BUY" end)
        |> Enum.reduce(0.0, fn {_level, entry}, acc -> acc + entry.quantity * entry.price end)
      remaining_capital = max(0.0, total_investment - locked_capital)

      BotLogger.info(state.bot_id, :grid, "Grid order execution starting", %{
        symbol: symbol,
        current_price: signal.current_price,
        qty_per_grid: Float.round(qty * 1.0, 8),
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
        BotLogger.error(state.bot_id, :grid, "Grid qty is zero — increase total_investment or reduce grid_levels", %{
          qty: qty,
          total_investment: total_investment,
          grid_levels: get_strategy_param(state.config, "grid_levels", 10),
          current_price: signal.current_price
        })
        state
      else
        buy_levels = Enum.take(signal.buy_levels, available_slots)

        pre_buy_count = map_size(state.grid_orders)
        {state, _capital_left} = Enum.reduce(buy_levels, {state, remaining_capital}, fn price_level, {acc, capital} ->
          order_cost = qty * price_level
          if map_size(acc.grid_orders) < max_orders and capital >= order_cost do
            pre = map_size(acc.grid_orders)
            new_state = place_grid_limit_order(acc, symbol, "BUY", qty, price_level)
            if map_size(new_state.grid_orders) > pre do
              {new_state, capital - order_cost}
            else
              {new_state, capital}
            end
          else
            {acc, capital}
          end
        end)

        placed_buy_count = map_size(state.grid_orders) - pre_buy_count

        state = if is_spot do
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

          pre_sell_count = map_size(state.grid_orders)
          state = Enum.reduce(sell_levels, state, fn price_level, acc ->
            if map_size(acc.grid_orders) < max_orders do
              place_grid_limit_order(acc, symbol, "SELL", qty, price_level)
            else
              acc
            end
          end)

          placed_sell_count = map_size(state.grid_orders) - pre_sell_count

          BotLogger.info(state.bot_id, :grid, "Futures grid orders placed", %{
            buy_orders_placed: placed_buy_count,
            sell_orders_placed: placed_sell_count,
            total_grid_orders: map_size(state.grid_orders)
          })
          state
        end

        # Update active capital in registry based on locked capital in open grid orders
        locked = state.grid_orders
          |> Enum.reduce(0.0, fn {_level, entry}, acc -> acc + entry.quantity * entry.price end)
        BotRegistry.update_active_capital(state.bot_id, locked)

        state
      end
    end
  end

  defp place_grid_limit_order(state, symbol, side, quantity, price_level, opts \\ []) do
    alias TradeEngine.Trading.BinanceFilterValidator

    # Round price to exchange precision
    price_precision = exchange_price_precision(symbol, state.market_type)
    rounded_price = Float.round(price_level / 1, price_precision)

    # Validate quantity against Binance LOT_SIZE filter (live step size from exchange)
    validated_qty = case BinanceFilterValidator.validate_quantity(symbol, quantity, market_type: state.market_type) do
      {:ok, adj_qty} -> adj_qty
      {:error, reason} ->
        BotLogger.warning(state.bot_id, :grid, "Grid order skipped: LOT_SIZE validation failed", %{
          side: side,
          raw_qty: Float.round(quantity, 8),
          price: rounded_price,
          reason: reason
        })
        nil
    end

    if is_nil(validated_qty) or validated_qty <= 0 do
      state
    else
      # Validate notional meets exchange minimum (fetched from exchange info, fallback to safe defaults)
      is_futures = state.market_type in ["usds_futures", "coinm_futures"]
      trading_sym = normalize_to_exchange_symbol(symbol)
      exchange_min = TradeEngine.Exchanges.Binance.ExchangeInfoCache.min_notional(trading_sym)
      min_notional = exchange_min || if(is_futures, do: 100.0, else: 10.0)
      notional = validated_qty * rounded_price

      if notional < min_notional do
        BotLogger.warning(state.bot_id, :grid, "Grid order skipped: below min notional", %{
          side: side,
          notional: Float.round(notional, 2),
          min_notional: min_notional,
          qty: validated_qty,
          price: rounded_price
        })
        state
      else
        # Generate a unique client_order_id prefixed with bot_id (first 8 chars)
        # This prevents multi-bot credential collision when bots share the same exchange credential
        bot_prefix = String.slice(state.bot_id, 0, 8)
        client_oid = "#{bot_prefix}_#{System.system_time(:millisecond)}_#{:erlang.unique_integer([:positive, :monotonic])}"

        is_reduce_only = Keyword.get(opts, :reduce_only, false)

        bot_context = [
          user_id: state.user_id,
          bot_id: state.bot_id,
          credential_id: state.credential_id,
          strategy_id: state.strategy_id,
          market_type: state.market_type,
          grid_level: price_level,
          client_order_id: client_oid,
          reduce_only: is_reduce_only
        ]

        case OrderManager.place_limit_order(
          state.credential_id, symbol, side, validated_qty, rounded_price, bot_context
        ) do
          {:ok, result} ->
            order_id = result[:order_id]

            BotLogger.info(state.bot_id, :grid, "Grid order placed", %{
              side: side,
              price: rounded_price,
              quantity: validated_qty,
              notional: Float.round(notional, 2),
              order_id: order_id
            })

            grid_entry = %{
              order_id: order_id,
              side: side,
              quantity: validated_qty,
              price: rounded_price,
              symbol: symbol,
              status: "NEW",
              placed_at: DateTime.utc_now()
            }

            %{state |
              grid_orders: Map.put(state.grid_orders, rounded_price, grid_entry),
              total_trades: state.total_trades + 1,
              grid_consecutive_failures: 0,
              grid_placement_cooldown_until: nil
            }

          {:error, reason} ->
            reason_str = inspect(reason)
            is_max_order_error = String.contains?(reason_str, "max open order") or
                                 String.contains?(reason_str, "-2025") or
                                 String.contains?(reason_str, "MAX_NUM_ORDERS")

            new_failures = state.grid_consecutive_failures + 1

            # On first hit or every 5 failures: cancel all open exchange orders to clear the limit
            cooldown_state = if is_max_order_error do
              state = if new_failures == 1 or rem(new_failures, 5) == 0 do
                BotLogger.info(state.bot_id, :grid, "Cancelling all open exchange orders to clear -2025 limit", %{
                  consecutive_failures: new_failures, symbol: symbol
                })
                cancel_all_exchange_orders_for_symbol(state, symbol)
              else
                state
              end

              # Short cooldown after cancel (30s), longer if still failing
              backoff_seconds = if new_failures <= 2, do: 30, else: min(5 * 60, 60 * min(new_failures, 5))
              cooldown_until = DateTime.add(DateTime.utc_now(), backoff_seconds, :second)

              BotLogger.warning(state.bot_id, :grid, "Exchange order limit hit — backing off", %{
                consecutive_failures: new_failures,
                cooldown_seconds: backoff_seconds,
                cooldown_until: DateTime.to_iso8601(cooldown_until)
              })

              %{state |
                grid_consecutive_failures: new_failures,
                grid_placement_cooldown_until: cooldown_until
              }
            else
              BotLogger.warning(state.bot_id, :grid, "Grid order failed", %{
                side: side,
                price: rounded_price,
                quantity: validated_qty,
                reason: reason_str
              })
              %{state | grid_consecutive_failures: new_failures}
            end

            cooldown_state
        end
      end
    end
  end

  # Load grid orders from the trading.orders table for a bot that is restarting.
  # Returns a map of %{price_level => %{order_id, side, quantity, price, symbol, status, placed_at}}
  # matching the in-memory grid_orders structure.
  defp load_grid_orders_from_db(bot_id) do
    import Ecto.Query

    alias TradeEngine.Trading.Order

    orders = Repo.all(
      from o in Order,
        where: o.bot_id == ^bot_id and o.status in ["open", "submitted", "partially_filled"],
        select: o
    )

    Map.new(orders, fn o ->
      price = to_float(o.price) || to_float(o.execution_price) || 0.0
      {price, %{
        order_id: o.exchange_order_id,
        side: String.upcase(o.side || ""),
        quantity: to_float(o.quantity),
        price: price,
        symbol: o.symbol,
        status: String.upcase(o.status || "NEW"),
        placed_at: o.submitted_at || o.created_at
      }}
    end)
  rescue
    e ->
      Logger.warning("[BotTrading] Failed to load grid orders from DB for bot #{bot_id}: #{inspect(e)}")
      %{}
  end

  # Reconcile DB-recovered grid orders with actual exchange open orders on startup.
  # - Exchange orders matching our recovered set are kept (they're valid).
  # - Exchange orders NOT in our recovered set are orphans from before DB tracking — cancel them.
  # - DB entries whose orders are no longer on exchange are removed from state.
  defp reconcile_grid_orders_with_exchange(state, symbol) do
    bot_prefix = String.slice(state.bot_id, 0, 8)

    recovered_order_ids = state.grid_orders
      |> Map.values()
      |> Enum.map(& &1.order_id)
      |> MapSet.new()

    case Executor.get_open_orders(state.credential_id, symbol, market_type: state.market_type) do
      {:ok, exchange_orders} when is_list(exchange_orders) ->
        # Only consider orders belonging to THIS bot (by clientOrderId prefix)
        my_exchange_orders = Enum.filter(exchange_orders, fn o ->
          coid = o[:client_order_id] || ""
          String.starts_with?(coid, bot_prefix)
        end)

        my_exchange_order_ids = my_exchange_orders
          |> Enum.map(fn o -> o[:order_id] || o["orderId"] end)
          |> Enum.filter(& &1)
          |> MapSet.new()

        # Cancel MY orphan orders (mine but not in local grid_orders)
        orphans_to_cancel = Enum.filter(my_exchange_orders, fn o ->
          oid = o[:order_id] || o["orderId"]
          oid && not MapSet.member?(recovered_order_ids, oid)
        end)

        cancelled_count = Enum.reduce(orphans_to_cancel, 0, fn order, count ->
          oid = order[:order_id] || order["orderId"]
          case OrderManager.cancel_order(state.credential_id, symbol, oid, market_type: state.market_type) do
            {:ok, _} -> count + 1
            {:error, _} -> count
          end
        end)

        # Remove local entries whose orders are no longer on exchange (filled/cancelled)
        pruned_grid_orders = state.grid_orders
          |> Enum.filter(fn {_level, entry} ->
            MapSet.member?(my_exchange_order_ids, entry.order_id)
          end)
          |> Map.new()

        removed_count = map_size(state.grid_orders) - map_size(pruned_grid_orders)

        BotLogger.info(state.bot_id, :grid, "Startup reconciliation complete", %{
          symbol: symbol,
          recovered_from_db: map_size(state.grid_orders),
          still_on_exchange: map_size(pruned_grid_orders),
          removed_stale_db_entries: removed_count,
          orphans_cancelled: cancelled_count,
          my_exchange_orders: length(my_exchange_orders),
          total_exchange_orders: length(exchange_orders)
        })

        %{state | grid_orders: pruned_grid_orders, grid_consecutive_failures: 0}

      _ ->
        BotLogger.warning(state.bot_id, :grid, "Could not fetch exchange orders for reconciliation", %{symbol: symbol})
        state
    end
  rescue
    e ->
      BotLogger.warning(state.bot_id, :grid, "reconcile_grid_orders_with_exchange failed", %{
        error: Exception.message(e)
      })
      state
  end

  # Cancel open orders on exchange for a symbol — only orders belonging to THIS bot
  # Uses clientOrderId prefix to avoid cancelling other bots' orders on shared credentials
  defp cancel_all_exchange_orders_for_symbol(state, symbol) do
    bot_prefix = String.slice(state.bot_id, 0, 8)

    case Executor.get_open_orders(state.credential_id, symbol, market_type: state.market_type) do
      {:ok, open_orders} when is_list(open_orders) ->
        # Only cancel orders that belong to this bot (matching clientOrderId prefix)
        my_orders = Enum.filter(open_orders, fn order ->
          coid = order[:client_order_id] || ""
          String.starts_with?(coid, bot_prefix)
        end)

        cancelled = Enum.reduce(my_orders, 0, fn order, count ->
          oid = order[:order_id] || order["orderId"]
          if oid do
            case OrderManager.cancel_order(state.credential_id, symbol, oid, market_type: state.market_type) do
              {:ok, _} -> count + 1
              {:error, _} -> count
            end
          else
            count
          end
        end)

        BotLogger.info(state.bot_id, :grid, "Cancelled stale exchange orders", %{
          found: length(open_orders), mine: length(my_orders), cancelled: cancelled, symbol: symbol
        })

        # Clear local grid orders since we cancelled our orders
        %{state | grid_orders: %{}, grid_consecutive_failures: 0}

      _ ->
        BotLogger.warning(state.bot_id, :grid, "Could not fetch open orders for cancel", %{symbol: symbol})
        state
    end
  rescue
    e ->
      BotLogger.warning(state.bot_id, :grid, "cancel_all_exchange_orders_for_symbol failed", %{
        error: Exception.message(e)
      })
      state
  end

  # Cancel all pending grid limit orders on the exchange and clear local state
  defp cancel_all_grid_orders(state) do
    symbol = List.first(state.trading_pairs)

    Enum.each(state.grid_orders, fn {_level, entry} ->
      order_id = entry.order_id
      if order_id do
        case OrderManager.cancel_order(state.credential_id, symbol, order_id, market_type: state.market_type) do
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
        # Filter exchange orders to only those belonging to this bot.
        # Prevents multi-bot credential collision on shared credentials.
        bot_prefix = String.slice(state.bot_id, 0, 8)
        my_open_orders = Enum.filter(open_orders, fn o ->
          coid = o[:client_order_id] || ""
          String.starts_with?(coid, bot_prefix) or coid == ""
        end)

        # Build set of exchange order IDs as strings (DB stores them as strings)
        open_ids = MapSet.new(my_open_orders, fn o -> to_string(o.order_id) end)

        # Reconcile DB: cancel orphaned "open" orders not on exchange
        reconcile_stale_db_orders(state.bot_id, open_ids)

        # Find grid orders that are no longer open on exchange → they were filled
        {filled, still_open} = state.grid_orders
          |> Enum.split_with(fn {_level, entry} ->
            entry.order_id && not MapSet.member?(open_ids, to_string(entry.order_id))
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

    # Update the DB order to "filled" and record the fill transaction
    update_grid_order_filled(filled_entry, filled_price, state)

    # Update aggregate grid position in DB (async)
    update_grid_position(state, symbol, filled_entry, filled_price)

    # Find the next level for a counter-order
    counter_side = if filled_entry.side == "BUY", do: "SELL", else: "BUY"

    counter_price = if filled_entry.side == "BUY" do
      # Buy filled → place sell one level above
      sorted_levels |> Enum.find(fn l -> l > filled_price end)
    else
      # Sell filled → place buy one level below
      sorted_levels |> Enum.reverse() |> Enum.find(fn l -> l < filled_price end)
    end

    # Fetch actual fill details from exchange (price, commission)
    fill_details = fetch_fill_for_order(state, filled_entry)
    actual_fill_price = (fill_details[:price] || filled_price) / 1.0
    commission = (fill_details[:commission] || 0.0) / 1.0

    {pnl, net_pnl} = if filled_entry.side == "SELL" do
      # A sell fill completes a grid cycle — compute actual profit
      # The corresponding buy was at the grid level below this sell level
      buy_level = counter_price || filled_price
      gross_pnl = (actual_fill_price - buy_level) * filled_entry.quantity
      net = gross_pnl - commission
      {gross_pnl, net}
    else
      {0.0, 0.0}
    end

    if net_pnl != 0 do
      BotRegistry.report_trade(state.bot_id, net_pnl, net_pnl >= 0)
    end

    state = cond do
      net_pnl > 0 ->
        %{state |
          winning_trades: state.winning_trades + 1,
          total_realized_pnl: state.total_realized_pnl + net_pnl
        }
      net_pnl < 0 ->
        %{state |
          losing_trades: state.losing_trades + 1,
          total_realized_pnl: state.total_realized_pnl + net_pnl
        }
      true ->
        state
    end

    BotLogger.info(state.bot_id, :grid, "Grid fill processed", %{
      filled_side: filled_entry.side,
      filled_price: filled_price,
      actual_fill_price: actual_fill_price,
      filled_qty: filled_entry.quantity,
      counter_side: counter_side,
      counter_price: counter_price,
      gross_pnl: Float.round(pnl, 4),
      commission: Float.round(commission, 6),
      net_pnl: Float.round(net_pnl, 4),
      exchange_order_id: filled_entry.order_id
    })

    # Place counter-order if we have a valid price level
    # Counter-orders use reduceOnly on futures to close the position opened by the fill
    if counter_price do
      place_grid_limit_order(state, symbol, counter_side, filled_entry.quantity, counter_price, reduce_only: true)
    else
      upper = get_strategy_param(state.config, "upper_price", 0)
      lower = get_strategy_param(state.config, "lower_price", 0)
      boundary = if filled_entry.side == "BUY", do: "lower (no sell level above)", else: "upper (no buy level below)"

      BotLogger.warning(state.bot_id, :grid, "GRID BOUNDARY BREACHED — no counter-level available", %{
        filled_price: filled_price,
        side: filled_entry.side,
        boundary: boundary,
        upper: upper,
        lower: lower,
        action: "Position held without counter-order. Monitor manually or adjust grid range."
      })
      state
    end
  end

  # Maintain one aggregate position per grid bot.
  # BUY fills increase position size (or create it), SELL fills reduce it.
  # Also accumulates fees from exchange fill details.
  defp update_grid_position(state, symbol, filled_entry, filled_price) do
    Task.start(fn ->
      try do
        import Ecto.Query
        alias TradeEngine.Trading.Position

        # Find existing open position for this bot
        existing = TradeEngine.Repo.one(
          from(p in Position,
            where: p.bot_id == ^state.bot_id and p.status == "open",
            limit: 1
          )
        )

        qty = filled_entry.quantity / 1.0
        price = filled_price / 1.0

        case {filled_entry.side, existing} do
          {"BUY", nil} ->
            # First buy — create new position
            attrs = %{
              symbol: symbol,
              position_type: "long",
              quantity: Decimal.from_float(qty),
              remaining_quantity: Decimal.from_float(qty),
              entry_price: Decimal.from_float(price),
              current_price: Decimal.from_float(price),
              status: "open",
              entry_time: DateTime.utc_now(),
              user_id: state.user_id,
              strategy_id: state.strategy_id,
              credential_id: state.credential_id,
              bot_id: state.bot_id,
              metadata: %{"type" => "grid_aggregate"}
            }
            case TradeEngine.Repo.insert(Position.changeset(%Position{}, attrs)) do
              {:ok, pos} -> Logger.debug("Grid position created: #{pos.id}")
              {:error, err} -> Logger.warning("Failed to create grid position: #{inspect(err)}")
            end

          {"BUY", pos} ->
            # Add to existing position — weighted average entry price
            old_qty = Decimal.to_float(pos.quantity)
            new_qty = old_qty + qty
            avg_entry = (Decimal.to_float(pos.entry_price) * old_qty + price * qty) / new_qty

            TradeEngine.Repo.update(Position.changeset(pos, %{
              quantity: Decimal.from_float(new_qty),
              remaining_quantity: Decimal.from_float(new_qty),
              entry_price: Decimal.from_float(avg_entry),
              current_price: Decimal.from_float(price)
            }))

          {"SELL", nil} ->
            # Sell without position — shouldn't happen, but log it
            Logger.warning("Grid SELL fill with no open position for bot #{state.bot_id}")

          {"SELL", pos} ->
            # Reduce position
            old_qty = Decimal.to_float(pos.quantity)
            new_qty = max(0.0, old_qty - qty)
            entry_price_f = Decimal.to_float(pos.entry_price)
            pnl_increment = (price - entry_price_f) * qty
            old_pnl = Decimal.to_float(pos.profit_loss || Decimal.new(0))

            if new_qty < 0.0000001 do
              # Position fully closed
              TradeEngine.Repo.update(Position.changeset(pos, %{
                quantity: Decimal.new(0),
                remaining_quantity: Decimal.new(0),
                exit_price: Decimal.from_float(price),
                current_price: Decimal.from_float(price),
                profit_loss: Decimal.from_float(old_pnl + pnl_increment),
                status: "closed",
                exit_time: DateTime.utc_now()
              }))
            else
              TradeEngine.Repo.update(Position.changeset(pos, %{
                quantity: Decimal.from_float(new_qty),
                remaining_quantity: Decimal.from_float(new_qty),
                current_price: Decimal.from_float(price),
                profit_loss: Decimal.from_float(old_pnl + pnl_increment)
              }))
            end
        end
      rescue
        e -> Logger.warning("Grid position update failed: #{Exception.message(e)}")
      end
    end)
  end

  # Periodic sync: fetch exchange positions and update DB to match reality
  defp sync_exchange_positions_to_db(state) do
    symbol = List.first(state.trading_pairs)
    if is_nil(symbol) do
      state
    else
      case Executor.get_position_risk(state.credential_id, symbol: symbol) do
        {:ok, exchange_positions} when is_list(exchange_positions) ->
          Task.start(fn ->
            try do
              import Ecto.Query
              alias TradeEngine.Trading.Position

              # Find our DB position for this bot
              db_pos = Repo.one(
                from(p in Position,
                  where: p.bot_id == ^state.bot_id and p.status == "open",
                  limit: 1
                )
              )

              # Get exchange position for our symbol (non-zero)
              exchange_pos = Enum.find(exchange_positions, fn p ->
                amt = if is_number(p.position_amount), do: p.position_amount, else: 0.0
                amt != 0.0
              end)

              cond do
                # Exchange has position, DB doesn't → create it
                exchange_pos && is_nil(db_pos) ->
                  amt = if is_number(exchange_pos.position_amount), do: exchange_pos.position_amount, else: 0.0
                  entry = if is_number(exchange_pos.entry_price), do: exchange_pos.entry_price, else: 0.0
                  mark = if is_number(exchange_pos.mark_price), do: exchange_pos.mark_price, else: entry
                  pnl = if is_number(exchange_pos.unrealized_pnl), do: exchange_pos.unrealized_pnl, else: 0.0
                  pos_type = if amt >= 0, do: "long", else: "short"

                  attrs = %{
                    symbol: symbol,
                    position_type: pos_type,
                    quantity: Decimal.from_float(abs(amt)),
                    remaining_quantity: Decimal.from_float(abs(amt)),
                    entry_price: Decimal.from_float(entry),
                    current_price: Decimal.from_float(mark),
                    profit_loss: Decimal.from_float(pnl),
                    status: "open",
                    entry_time: DateTime.utc_now(),
                    user_id: state.user_id,
                    strategy_id: state.strategy_id,
                    credential_id: state.credential_id,
                    bot_id: state.bot_id,
                    metadata: %{"type" => "grid_aggregate", "synced_from" => "exchange"}
                  }
                  case Repo.insert(Position.changeset(%Position{}, attrs)) do
                    {:ok, pos} -> Logger.info("Position synced from exchange: #{pos.id} #{pos_type} #{abs(amt)} #{symbol}")
                    {:error, err} -> Logger.warning("Failed to sync position from exchange: #{inspect(err)}")
                  end

                # Exchange has position, DB has position → update mark price + PnL
                exchange_pos && db_pos ->
                  amt = if is_number(exchange_pos.position_amount), do: exchange_pos.position_amount, else: 0.0
                  mark = if is_number(exchange_pos.mark_price), do: exchange_pos.mark_price, else: 0.0
                  pnl = if is_number(exchange_pos.unrealized_pnl), do: exchange_pos.unrealized_pnl, else: 0.0

                  Repo.update(Position.changeset(db_pos, %{
                    quantity: Decimal.from_float(abs(amt)),
                    remaining_quantity: Decimal.from_float(abs(amt)),
                    current_price: Decimal.from_float(mark),
                    profit_loss: Decimal.from_float(pnl)
                  }))

                # Exchange has NO position, DB has open position → close it
                is_nil(exchange_pos) && db_pos ->
                  mark = Decimal.to_float(db_pos.current_price)
                  Repo.update(Position.changeset(db_pos, %{
                    quantity: Decimal.new(0),
                    remaining_quantity: Decimal.new(0),
                    exit_price: Decimal.from_float(mark),
                    status: "closed",
                    exit_time: DateTime.utc_now()
                  }))
                  Logger.info("Position closed in DB (no longer on exchange): #{db_pos.id}")

                # Both nil — nothing to do
                true -> :ok
              end
            rescue
              e -> Logger.warning("sync_exchange_positions_to_db failed: #{Exception.message(e)}")
            end
          end)

          # Update open position count in registry
          active_count = Enum.count(exchange_positions, fn p ->
            amt = if is_number(p.position_amount), do: p.position_amount, else: 0.0
            amt != 0.0
          end)
          BotRegistry.update_position_count(state.bot_id, active_count)

          state

        {:error, reason} ->
          BotLogger.warning(state.bot_id, :grid, "Failed to sync exchange positions", %{reason: inspect(reason)})
          state
      end
    end
  rescue
    e ->
      BotLogger.warning(state.bot_id, :grid, "sync_exchange_positions_to_db failed", %{error: Exception.message(e)})
      state
  end

  # Update DB order from "open" to "filled" when grid_check_fills detects fill.
  # Also queries exchange for actual trade details and records a fill/transaction.
  defp update_grid_order_filled(filled_entry, filled_price, state) do
    Task.start(fn ->
      try do
        import Ecto.Query
        exchange_oid = to_string(filled_entry.order_id)
        now = DateTime.utc_now()

        # Try to get actual fill details from exchange
        fill_details = fetch_fill_for_order(state, filled_entry)
        actual_price = (fill_details[:price] || filled_price) / 1.0
        actual_qty = (fill_details[:quantity] || filled_entry.quantity) / 1.0
        commission = fill_details[:commission] || 0.0
        commission_asset = fill_details[:commission_asset]

        query = from(o in TradeEngine.Trading.Order,
          where: o.exchange_order_id == ^exchange_oid and o.status == "open"
        )

        case TradeEngine.Repo.update_all(query, set: [
          status: "filled",
          execution_price: Decimal.from_float(actual_price),
          filled_quantity: Decimal.from_float(actual_qty),
          remaining_quantity: Decimal.new(0),
          execution_time: now,
          first_fill_at: now
        ]) do
          {n, _} when n > 0 ->
            Logger.debug("Grid order #{exchange_oid} updated to filled @ #{actual_price}")

            # Record the fill as a Transaction
            record_grid_fill(state, filled_entry, actual_price, actual_qty, commission, commission_asset)

          _ ->
            Logger.debug("Grid order #{exchange_oid} not found as open (may already be filled)")
        end
      rescue
        e -> Logger.warning("Failed to update grid order to filled: #{Exception.message(e)}")
      end
    end)
  end

  # Query exchange for actual fill details of a specific order
  defp fetch_fill_for_order(state, filled_entry) do
    symbol = filled_entry.symbol
    order_id = filled_entry.order_id

    case Executor.get_user_trades(
      state.credential_id, symbol,
      market_type: state.market_type, limit: 20
    ) do
      {:ok, trades} when is_list(trades) ->
        # Find the trade matching our order_id
        oid = to_string(order_id)
        case Enum.find(trades, fn t -> to_string(t[:order_id]) == oid end) do
          nil -> %{}
          trade -> trade
        end
      _ -> %{}
    end
  rescue
    _ -> %{}
  end

  # Insert a Transaction record for a grid fill
  defp record_grid_fill(state, filled_entry, price, quantity, commission, commission_asset) do
    alias TradeEngine.Trading.Transaction

    fill_attrs = %{
      transaction_type: "trade",
      symbol: filled_entry.symbol,
      direction: String.downcase(filled_entry.side),
      action: "grid_#{String.downcase(filled_entry.side)}",
      quantity: Decimal.from_float(quantity / 1.0),
      price: Decimal.from_float(price / 1.0),
      amount: Decimal.from_float(quantity * price / 1.0),
      order_id: to_string(filled_entry.order_id),
      status: "completed",
      executed_at: DateTime.utc_now(),
      exchange: "binance",
      user_id: state.user_id,
      fee_amount: Decimal.from_float((commission || 0) / 1.0),
      fee_asset: commission_asset,
      description: "Grid #{filled_entry.side} #{filled_entry.symbol} qty=#{quantity} @ #{price}"
    }

    case TradeEngine.Repo.insert(Transaction.changeset(%Transaction{}, fill_attrs)) do
      {:ok, fill} ->
        Phoenix.PubSub.broadcast(TradeEngine.PubSub, "fills:updates", {:fill_recorded, fill})
        Logger.debug("Grid fill recorded: #{filled_entry.side} #{quantity} @ #{price}")
      {:error, err} ->
        Logger.warning("Failed to record grid fill: #{inspect(err)}")
    end
  rescue
    e -> Logger.warning("Grid fill record error: #{Exception.message(e)}")
  end

  # Reconcile DB: mark "open" orders as "cancelled" if they're not on the exchange
  # and not tracked in our grid_orders state. Runs async to not block the fill check.
  defp reconcile_stale_db_orders(bot_id, exchange_open_ids) do
    Task.start(fn ->
      try do
        import Ecto.Query

        # Get all DB orders marked "open" for this bot
        db_open_orders = TradeEngine.Repo.all(
          from(o in TradeEngine.Trading.Order,
            where: o.bot_id == ^bot_id and o.status == "open",
            select: {o.id, o.exchange_order_id}
          )
        )

        # Find orders in DB that are NOT on the exchange
        stale_orders = Enum.filter(db_open_orders, fn {_id, exchange_oid} ->
          exchange_oid && not MapSet.member?(exchange_open_ids, exchange_oid)
        end)

        if length(stale_orders) > 0 do
          stale_ids = Enum.map(stale_orders, fn {id, _} -> id end)

          {updated, _} = TradeEngine.Repo.update_all(
            from(o in TradeEngine.Trading.Order,
              where: o.id in ^stale_ids and o.status == "open"
            ),
            set: [status: "cancelled", metadata: %{"reconciled" => true, "reconciled_at" => DateTime.to_iso8601(DateTime.utc_now())}]
          )

          if updated > 0 do
            Logger.info("Grid reconciliation: marked #{updated} stale DB orders as cancelled for bot #{bot_id}")
          end
        end
      rescue
        e -> Logger.warning("Grid reconciliation failed: #{Exception.message(e)}")
      end
    end)
  end

  # ════════════════════════════════════════════════════════════════════════════
  # EXCHANGE POSITION ADOPTION (on bot startup)
  # ════════════════════════════════════════════════════════════════════════════

  defp adopt_exchange_positions(state) do
    credential_id = state.credential_id
    bot_id = state.bot_id
    trading_pairs = state.trading_pairs || []

    # Normalize bot's trading pairs to match exchange symbol format
    # Handles CCXT delivery futures format: "BTC/USDT:USDT-260327" → "BTCUSDT_260327"
    bot_symbols = Enum.map(trading_pairs, fn pair ->
      normalize_to_exchange_symbol(pair)
    end) |> MapSet.new()

    case Executor.get_position_risk(credential_id) do
      {:ok, positions} when is_list(positions) ->
        # Filter to positions matching this bot's symbols
        matching = Enum.filter(positions, fn pos ->
          MapSet.member?(bot_symbols, pos.symbol)
        end)

        if matching == [] do
          BotLogger.info(bot_id, :grid, "No existing exchange positions to adopt", %{})
          state
        else
          Enum.each(matching, fn pos ->
            amt = pos.position_amount || 0
            entry = pos.entry_price || 0
            pnl = pos.unrealized_pnl || 0
            side = to_string(pos.position_side || "") |> String.upcase()
            direction = if amt < 0 or side == "SHORT", do: "short", else: "long"

            BotLogger.info(bot_id, :grid, "Adopting exchange position", %{
              symbol: pos.symbol,
              side: direction,
              quantity: abs(amt),
              entry_price: entry,
              unrealized_pnl: pnl,
              leverage: pos.leverage
            })

            # Check if DB already has this position
            import Ecto.Query
            existing = TradeEngine.Repo.one(
              from(p in TradeEngine.Trading.Position,
                where: p.bot_id == ^bot_id and p.status == "open",
                where: fragment("? LIKE ?", p.symbol, ^"%#{pos.symbol}%"),
                limit: 1
              )
            )

            if existing do
              # Update existing DB position with exchange values
              TradeEngine.Repo.query(
                """
                UPDATE trading.positions
                SET quantity = $1, entry_price = $2, current_price = $3,
                    unrealized_pnl_usd = $4, leverage = $5, updated_at = NOW()
                WHERE id = $6
                """,
                [Decimal.from_float(abs(amt + 0.0)), Decimal.from_float(entry + 0.0),
                 Decimal.from_float((pos.mark_price || entry) + 0.0),
                 Decimal.from_float(pnl + 0.0), trunc(pos.leverage || 1),
                 existing.id]
              )
            else
              # Create new DB position record
              now = DateTime.utc_now()
              symbol = List.first(trading_pairs) || pos.symbol

              TradeEngine.Repo.query(
                """
                INSERT INTO trading.positions
                  (id, bot_id, user_id, credential_id, trading_pair, side, status,
                   entry_price, current_price, quantity, leverage,
                   unrealized_pnl_usd, opened_at, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9, $10, $11, $12, $12, $12)
                ON CONFLICT DO NOTHING
                """,
                [Ecto.UUID.generate(), bot_id, state.user_id, credential_id,
                 symbol, direction,
                 Decimal.from_float(entry + 0.0), Decimal.from_float((pos.mark_price || entry) + 0.0),
                 Decimal.from_float(abs(amt + 0.0)), trunc(pos.leverage || 1),
                 Decimal.from_float(pnl + 0.0), now]
              )
            end

            # Alert about adoption
            Phoenix.PubSub.broadcast(TradeEngine.PubSub, "alerts:new", {:new_alert, %{
              alert_type: "position_adopted",
              category: "bot",
              severity: "info",
              title: "Bot adopted exchange position: #{pos.symbol}",
              message: "Bot #{bot_id |> String.slice(0, 8)} adopted existing #{direction} #{abs(amt)} #{pos.symbol} @ $#{entry} (PnL: $#{pnl})",
              metadata: %{bot_id: bot_id, symbol: pos.symbol, side: direction, quantity: abs(amt), entry_price: entry, unrealized_pnl: pnl},
              source: "bot_trading_process"
            }})
          end)

          state
        end

      {:error, reason} ->
        BotLogger.warning(bot_id, :grid, "Could not check exchange positions for adoption", %{error: inspect(reason)})
        state
    end
  rescue
    e ->
      BotLogger.warning(state.bot_id, :grid, "Exchange position adoption failed", %{error: Exception.message(e)})
      state
  end

  # ════════════════════════════════════════════════════════════════════════════
  # LEVERAGE SYNC (on bot startup)
  # ════════════════════════════════════════════════════════════════════════════

  defp sync_leverage_on_exchange(state) do
    credential_id = state.credential_id
    bot_id = state.bot_id
    config = state.config || %{}
    trading_pairs = state.trading_pairs || []

    # Get leverage from bot config — default to nil (don't change if not set)
    target_leverage = config["leverage"] || config[:leverage]

    if target_leverage && target_leverage > 0 do
      Enum.each(trading_pairs, fn pair ->
        case Executor.set_leverage(credential_id, pair, target_leverage) do
          {:ok, result} ->
            BotLogger.info(bot_id, :lifecycle, "Leverage set to #{target_leverage}x for #{pair}", %{
              symbol: result[:symbol],
              leverage: result[:leverage]
            })

          {:error, %{code: -4028}} ->
            # Already at target leverage
            BotLogger.debug(bot_id, :lifecycle, "Leverage already #{target_leverage}x for #{pair}")

          {:error, reason} ->
            BotLogger.warning(bot_id, :lifecycle, "Failed to set leverage for #{pair}", %{
              target: target_leverage,
              error: inspect(reason)
            })
        end
      end)
    else
      BotLogger.debug(bot_id, :lifecycle, "No leverage configured — exchange default applies")
    end

    state
  rescue
    e ->
      BotLogger.warning(state.bot_id, :lifecycle, "Leverage sync failed", %{error: Exception.message(e)})
      state
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

  # Normalize config map keys to strings so strategies always see "upper_price" not :upper_price.
  # Atom keys can sneak in from the API controller's atomize_keys() or ETS caching.
  defp stringify_keys(map) when is_map(map) do
    Map.new(map, fn
      {k, v} when is_atom(k) -> {Atom.to_string(k), stringify_keys(v)}
      {k, v} -> {k, stringify_keys(v)}
    end)
  end
  defp stringify_keys(other), do: other
end
