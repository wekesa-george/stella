defmodule TradeEngine.Orchestrator.SignalTrader do
  @moduledoc """
  🚀 IMPULSE SCALPING ENGINE - Physics-Based $1 Per Trade Strategy
  
  CORE PRINCIPLE:
  ══════════════════════════════════════════════════════════════════
  Capture the IMPULSE (first 5 minutes), not the full arc.
  
  Physics shows:
    5 min:  P0 → P1 (MAX impulse) ← WE TRADE THIS
    15 min: P0 → P2 (decayed)
    30 min: P0 → P3 (exhausted)
  
  GOAL: Make $1 on every peak/trough, repeatedly.
  ══════════════════════════════════════════════════════════════════
  
  EXECUTION FLOW:
  1. Signal detected with P0 (current) and P1 (5-min target)
  2. Calculate: impulse_size = |P1 - P0|
  3. If impulse_size >= min_profit_target → ENTER at P0
  4. Position size = target_profit / impulse_size
  5. EXIT at P1 OR after 5 minutes (whichever first)
  6. Stop loss = P0 - (impulse * 0.618) [Golden Ratio]
  ══════════════════════════════════════════════════════════════════
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  # TradingAccount removed — table replaced by trading.equity_snapshots
  alias TradeEngine.Physics.SignalGenerator
  alias TradeEngine.Exchanges.Binance.KlineStream
  alias TradeEngine.Exchanges.Binance.TestnetExecutor
  alias TradeEngine.Risk.AssetTierManager
  alias TradeEngine.Risk.VirtualBalanceManager
  alias SysAdmin.Accounts.User

  @pubsub TradeEngine.PubSub

  # ════════════════════════════════════════════════════════════════════════════
  # IMPULSE SCALPING CONFIGURATION (compile-time defaults)
  # These are fallbacks — runtime values come from strategy.strategies.config JSONB
  # ════════════════════════════════════════════════════════════════════════════

  @min_confidence_long 55
  @min_confidence_short 60
  @max_positions_per_user 3
  @max_users_per_signal 10
  @max_positions_to_check 20
  @target_profit_usd 0.50
  @min_impulse_pct 0.001
  @max_hold_minutes 5
  @golden_ratio 0.618
  @min_notional 10.0
  @min_trade_value 12.0
  @execute_on_exchange true
  @use_asset_tiers true
  @use_virtual_balance true

  # ════════════════════════════════════════════════════════════════════════════
  # EXPANDED ASSET LIST FOR SMALL ACCOUNTS
  # ════════════════════════════════════════════════════════════════════════════
  # Small accounts need MORE cheap assets to trade
  
  @small_account_assets [
    # Ultra-cheap (< $1) - Great for $100 accounts
    "DOGEUSDT", "ADAUSDT", "XRPUSDT", "DOTUSDT", "ATOMUSDT",
    "NEARUSDT", "OPUSDT", "ARBUSDT", "SUIUSDT", "APTUSDT",
    # Medium cheap ($1-20) - Good for $100-500 accounts  
    "LINKUSDT", "AVAXUSDT", "UNIUSDT", "INJUSDT", "LTCUSDT",
    # Additional cheap assets
    "MATICUSDT", "SANDUSDT", "MANAUSDT", "GALAUSDT", "AXSUSDT",
    "FTMUSDT", "ALGOUSDT", "VETUSDT", "ICPUSDT", "FILUSDT"
  ]

  # ========================================================================
  # PUBLIC API
  # ========================================================================

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  def start_trading, do: GenServer.cast(__MODULE__, :start_trading)
  def stop_trading, do: GenServer.cast(__MODULE__, :stop_trading)
  def get_stats, do: GenServer.call(__MODULE__, :get_stats, 10_000)
  def get_open_positions, do: GenServer.call(__MODULE__, :get_open_positions, 10_000)
  def analyze_symbol(symbol), do: GenServer.call(__MODULE__, {:analyze_symbol, symbol}, 10_000)
  def reset, do: GenServer.call(__MODULE__, :reset, 10_000)
  def close_all_positions, do: GenServer.call(__MODULE__, :close_all_positions, 30_000)
  
  def restart do
    stop_trading()
    Process.sleep(1000)
    reset()
    Process.sleep(500)
    start_trading()
    :ok
  end

  # ========================================================================
  # INIT
  # ========================================================================

  @impl true
  def init(_opts) do
    Logger.info("""
    
    🚀 IMPULSE SCALPING ENGINE INITIALIZED
    ═══════════════════════════════════════════════════════════════
    Strategy:           Capture 5-minute impulse, exit at P1
    Target Profit:      $#{@target_profit_usd} per trade
    Min Impulse:        #{@min_impulse_pct * 100}%
    Max Hold Time:      #{@max_hold_minutes} minutes
    Stop Loss:          Golden Ratio (φ = #{@golden_ratio})
    Min LONG Conf:      #{@min_confidence_long}%
    Min SHORT Conf:     #{@min_confidence_short}%
    Exchange Execution: #{if @execute_on_exchange, do: "✅ ENABLED", else: "❌ DISABLED"}
    ═══════════════════════════════════════════════════════════════
    """)
    
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:5m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:15m")

    state = %{
      trading_active: false,
      started_at: nil,
      positions: %{},
      price_cache: %{},
      recent_signals: %{},
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_realized_pnl: 0.0,
      total_unrealized_pnl: 0.0,
      signals_processed: 0,
      errors: 0,
      trade_history: [],
      # Track $1 targets hit
      dollar_targets_hit: 0,
      total_impulse_captures: 0
    }

    {:ok, state}
  end

  # ========================================================================
  # GENSERVER HANDLERS
  # ========================================================================

  @impl true
  def handle_cast(:start_trading, state) do
    Logger.info("🟢 IMPULSE SCALPING ACTIVE - Target: $#{@target_profit_usd}/trade")
    Process.send_after(self(), :check_exits, 5_000)  # Check every 5 seconds
    Process.send_after(self(), :update_prices, 3_000)
    Process.send_after(self(), :update_pnl, 15_000)
    {:noreply, %{state | trading_active: true, started_at: DateTime.utc_now()}}
  end

  @impl true
  def handle_cast(:stop_trading, state) do
    Logger.info("🔴 TRADING STOPPED")
    {:noreply, %{state | trading_active: false}}
  end

  @impl true
  def handle_cast({:check_reversal, symbol, expected_direction}, state) do
    if state.trading_active do
      case analyze_candles(symbol) do
        {:ok, signal} ->
          if signal.direction == expected_direction and should_trade?(signal) do
            Logger.info("🔄 REVERSAL: #{symbol} #{expected_direction} (#{signal.confidence}%)")
            new_state = process_signal(signal, %{state | signals_processed: state.signals_processed + 1})
            {:noreply, new_state}
          else
            {:noreply, state}
          end
        {:error, _} ->
          {:noreply, state}
      end
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    total = state.winning_trades + state.losing_trades
    win_rate = if total > 0, do: Float.round(state.winning_trades / total * 100, 1), else: 0.0
    
    stats = %{
      status: if(state.trading_active, do: "ACTIVE", else: "STOPPED"),
      uptime: if(state.started_at, do: DateTime.diff(DateTime.utc_now(), state.started_at), else: 0),
      open_positions: map_size(state.positions),
      closed_positions: total,
      total_trades: state.total_trades,
      winning_trades: state.winning_trades,
      losing_trades: state.losing_trades,
      win_rate: win_rate,
      total_pnl: Float.round(state.total_realized_pnl + state.total_unrealized_pnl, 2),
      realized_pnl: Float.round(state.total_realized_pnl, 2),
      unrealized_pnl: Float.round(state.total_unrealized_pnl, 2),
      signals_processed: state.signals_processed,
      errors: state.errors,
      exchange_execution: @execute_on_exchange,
      dollar_targets_hit: state.dollar_targets_hit,
      avg_profit_per_trade: if(total > 0, do: Float.round(state.total_realized_pnl / total, 2), else: 0),
      timestamp: DateTime.utc_now()
    }
    {:reply, stats, state}
  end

  @impl true
  def handle_call(:get_open_positions, _from, state) do
    positions = state.positions |> Map.values() |> Enum.take(50)
    {:reply, positions, state}
  end

  @impl true
  def handle_call({:analyze_symbol, symbol}, _from, state) do
    case analyze_candles(symbol) do
      {:ok, signal} -> {:reply, {:ok, signal}, state}
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call(:reset, _from, state) do
    Logger.info("🔄 IMPULSE ENGINE RESET")
    
    if @use_virtual_balance and VirtualBalanceManager.running?() do
      state.positions
      |> Map.values()
      |> Enum.each(fn pos ->
        VirtualBalanceManager.release_reservation(pos.user_id, pos.id)
      end)
    end
    
    new_state = %{state |
      positions: %{},
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_realized_pnl: 0.0,
      total_unrealized_pnl: 0.0,
      signals_processed: 0,
      errors: 0,
      price_cache: %{},
      dollar_targets_hit: 0,
      total_impulse_captures: 0,
      started_at: if(state.trading_active, do: DateTime.utc_now(), else: nil)
    }
    
    {:reply, :ok, new_state}
  end

  @impl true
  def handle_call(:close_all_positions, _from, state) do
    position_count = map_size(state.positions)
    
    if position_count == 0 do
      {:reply, {:ok, 0}, state}
    else
      final_state = state.positions
        |> Map.values()
        |> Enum.reduce(state, &close_position(&1, &2))
      
      {:reply, {:ok, position_count}, final_state}
    end
  end

  # ========================================================================
  # INFO HANDLERS
  # ========================================================================

  @impl true
  def handle_info({:candle_closed, candle}, state) do
    if state.trading_active do
      {:noreply, process_candle(candle, state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:check_exits, state) do
    if state.trading_active do
      Process.send_after(self(), :check_exits, 5_000)  # Every 5 seconds for impulse trading
      {:noreply, process_exits(state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:update_prices, state) do
    if state.trading_active do
      Process.send_after(self(), :update_prices, 3_000)  # Faster price updates
      {:noreply, update_prices(state)}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info(:update_pnl, state) do
    if state.trading_active do
      Process.send_after(self(), :update_pnl, 15_000)
      {:noreply, calculate_pnl(state)}
    else
      {:noreply, state}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ========================================================================
  # CANDLE PROCESSING
  # ========================================================================

  defp process_candle(candle, state) do
    symbol = candle.symbol
    now = DateTime.utc_now()
    
    # Rate limit: 30 seconds between same symbol signals
    last = Map.get(state.recent_signals, symbol)
    if last && DateTime.diff(now, last, :second) < 30 do
      state
    else
      case analyze_candles(symbol) do
        {:ok, signal} ->
          new_state = %{state | 
            signals_processed: state.signals_processed + 1,
            recent_signals: Map.put(state.recent_signals, symbol, now)
          }
          if should_trade?(signal), do: process_signal(signal, new_state), else: new_state
        {:error, _} ->
          %{state | errors: state.errors + 1}
      end
    end
  end

  # ════════════════════════════════════════════════════════════════════════════
  # IMPULSE VALIDATION - Only trade if impulse is worth capturing
  # ════════════════════════════════════════════════════════════════════════════

  defp should_trade?(signal) do
    config = get_strategy_config()
    min_conf_long = get_param(config, "min_confidence_long", @min_confidence_long)
    min_conf_short = get_param(config, "min_confidence_short", @min_confidence_short)

    confidence_ok = case signal.direction do
      :long -> signal.confidence >= min_conf_long
      :short -> signal.confidence >= min_conf_short
      _ -> false
    end

    impulse_ok = has_tradeable_impulse?(signal)

    confidence_ok and impulse_ok
  end

  @doc """
  Check if the impulse is large enough to capture profit.
  """
  defp has_tradeable_impulse?(signal) do
    entry = to_float(signal.entry_price)
    config = get_strategy_config()
    min_impulse = get_param(config, "min_impulse_pct", @min_impulse_pct)

    p1 = get_impulse_target(signal)

    if entry && p1 && entry > 0 do
      impulse_pct = abs(p1 - entry) / entry

      if impulse_pct >= min_impulse do
        # Check direction alignment
        direction_ok = case signal.direction do
          :long -> p1 > entry
          :short -> p1 < entry
          _ -> false
        end
        
        if direction_ok do
          Logger.info("✅ #{signal.symbol} impulse OK: #{Float.round(impulse_pct * 100, 2)}% (min: #{@min_impulse_pct * 100}%)")
          true
        else
          Logger.debug("⚠️ #{signal.symbol} direction mismatch: #{signal.direction} but P1 #{if p1 > entry, do: ">", else: "<"} entry")
          false
        end
      else
        Logger.debug("⚠️ Impulse too small: #{signal.symbol} #{Float.round(impulse_pct * 100, 3)}% < #{@min_impulse_pct * 100}%")
        false
      end
    else
      Logger.debug("⚠️ #{signal.symbol} missing price data: entry=#{inspect(entry)}, p1=#{inspect(p1)}")
      false
    end
  end

  @doc """
  Get the impulse target (P1) based on direction.
  - LONG signals: use peak_price (price going UP)
  - SHORT signals: use trough_price (price going DOWN)
  """
  defp get_impulse_target(signal) do
    # Direction-aware target extraction
    physics_target = if signal.physics do
      case signal.direction do
        :long -> 
          # For longs, we want the PEAK (where price goes UP to)
          Map.get(signal.physics, :peak_price) || 
          Map.get(signal.physics, :predicted_price)
        :short ->
          # For shorts, we want the TROUGH (where price goes DOWN to)
          Map.get(signal.physics, :trough_price) || 
          Map.get(signal.physics, :peak_price) ||  # Fallback - some signals store both in peak_price
          Map.get(signal.physics, :predicted_price)
        _ ->
          Map.get(signal.physics, :peak_price) || 
          Map.get(signal.physics, :predicted_price)
      end
    else
      nil
    end
    
    target = cond do
      physics_target -> to_float(physics_target)
      Map.get(signal, :take_profit) -> to_float(Map.get(signal, :take_profit))
      Map.get(signal, :target_price) -> to_float(Map.get(signal, :target_price))
      true -> nil
    end
    
    # Debug logging to track what we're getting
    if target do
      entry = to_float(signal.entry_price)
      if entry && entry > 0 do
        impulse_pct = abs(target - entry) / entry * 100
        Logger.debug("🎯 #{signal.symbol} #{signal.direction}: Entry=$#{Float.round(entry, 4)} Target=$#{Float.round(target, 4)} Impulse=#{Float.round(impulse_pct, 2)}%")
      end
    end
    
    target
  end

  defp process_signal(signal, state) do
    users = get_eligible_users()
    
    if length(users) == 0 do
      Logger.debug("⚠️ No eligible users for #{signal.symbol}")
      state
    else
      Enum.reduce(users, state, fn {user, account}, acc ->
        if can_open?(user, signal, acc) do
          case execute_impulse_trade(user, account, signal, acc) do
            {:ok, _pos, new_state} -> new_state
            _ -> acc
          end
        else
          acc
        end
      end)
    end
  end

  # ========================================================================
  # IMPULSE TRADE EXECUTION
  # ========================================================================

  defp execute_impulse_trade(user, account, signal, state) do
    balance = get_user_balance(user, account)
    config = get_strategy_config()
    use_tiers = get_param(config, "use_asset_tiers", @use_asset_tiers)

    if balance <= 0 do
      {:error, :no_balance}
    else
      tier_symbol = signal.symbol |> String.split(":") |> List.first() |> String.replace("/", "") |> String.upcase() |> String.split("_") |> List.first()
      tier_symbol = if String.ends_with?(tier_symbol, "USDT"), do: tier_symbol, else: tier_symbol <> "T"
      if use_tiers and not AssetTierManager.is_allowed_by_code?(tier_symbol, balance, "binance") do
        account_tier = AssetTierManager.get_account_tier_by_code(balance, "binance")
        Logger.warning("[SignalTrader] ❌ ASSET BLOCKED: #{tier_symbol} | balance=$#{Float.round(balance, 2)} account_tier=#{account_tier} | user=#{inspect(user)}")
        {:error, :asset_not_in_tier}
      else
        case get_price(signal.symbol) do
          {:ok, price} ->
            execute_with_impulse_sizing(user, account, signal, state, balance, Decimal.to_float(price))
          _ ->
            {:error, :price_error}
        end
      end
    end
  end

  defp execute_with_impulse_sizing(user, account, signal, state, balance, current_price) do
    config = get_strategy_config()
    target_profit = get_param(config, "target_profit_usd", @target_profit_usd)
    min_notional = get_param(config, "min_notional", @min_notional)
    min_trade_val = get_param(config, "min_trade_value", @min_trade_value)
    golden_ratio = get_param(config, "golden_ratio", @golden_ratio)
    max_hold = get_param(config, "max_hold_minutes", @max_hold_minutes)
    execute_on_exch = get_param(config, "execute_on_exchange", @execute_on_exchange)
    use_vb = get_param(config, "use_virtual_balance", @use_virtual_balance)

    # Get impulse target (P1)
    p1 = get_impulse_target(signal) || current_price
    entry = current_price

    impulse_size = abs(p1 - entry)
    impulse_pct = if entry > 0, do: impulse_size / entry, else: 0

    # Impulse-based position sizing: position = target_profit / impulse_size
    ideal_quantity = if impulse_size > 0, do: target_profit / impulse_size, else: 0

    ideal_position_value = ideal_quantity * entry

    max_position_value = balance * 0.15
    position_value = min(ideal_position_value, max_position_value)
    position_value = max(position_value, min_trade_val)

    quantity = position_value / entry

    notional = quantity * entry
    if notional < min_notional do
      Logger.debug("⚠️ Notional $#{Float.round(notional, 2)} below minimum")
      {:error, :notional_too_low}
    else
      # ════════════════════════════════════════════════════════════════
      # 🎯 PHYSICS-BASED STOP LOSS (Golden Ratio)
      # Stop = Entry - (Impulse * φ)
      # ════════════════════════════════════════════════════════════════
      
      stop_loss = case signal.direction do
        :long -> entry - (impulse_size * golden_ratio)
        :short -> entry + (impulse_size * golden_ratio)
        _ -> entry
      end

      position_id = Ecto.UUID.generate()

      # Reserve virtual balance
      use_vb = use_vb and VirtualBalanceManager.running?()
      vb_reserved = if use_vb do
        case VirtualBalanceManager.reserve_for_position(user.id, position_id, position_value) do
          {:ok, _} -> true
          _ -> false
        end
      else
        false
      end
      
      # Execute on exchange
      exchange_result = if execute_on_exch do
        case signal.direction do
          :long ->
            Logger.info("🟢 IMPULSE BUY: #{signal.symbol} qty=#{Float.round(quantity, 6)} | Target: $#{Float.round(p1, 4)} (+#{Float.round(impulse_pct * 100, 2)}%)")
            TestnetExecutor.execute_long(signal.symbol, quantity,
              user_id: user.id,
              position_id: position_id,
              trading_account_id: account.id,
              confidence: signal.confidence,
              peak_price: p1,
              peak_time: max_hold
            )

          :short ->
            Logger.info("IMPULSE SHORT: #{signal.symbol} qty=#{Float.round(quantity, 6)} | Target: $#{Float.round(p1, 4)} (-#{Float.round(impulse_pct * 100, 2)}%)")
            TestnetExecutor.execute_short(signal.symbol, quantity,
              user_id: user.id,
              position_id: position_id,
              trading_account_id: account.id,
              confidence: signal.confidence,
              peak_price: p1,
              peak_time: max_hold
            )
          
          _ ->
            {:error, :invalid_direction}
        end
      else
        {:ok, %{order_id: "PAPER_#{position_id}", executed_qty: quantity, executed_price: entry}}
      end
      
      case exchange_result do
        {:ok, order_result} ->
          executed_price = order_result[:executed_price] || entry
          executed_qty = order_result[:executed_qty] || quantity
          
          position = %{
            id: position_id,
            user_id: user.id,
            trading_account_id: account.id,
            symbol: signal.symbol,
            direction: signal.direction,
            quantity: executed_qty,
            entry_price: executed_price,
            current_price: executed_price,
            # Impulse targets
            impulse_target: p1,           # P1 - where we want to exit
            impulse_size: impulse_size,
            stop_loss: stop_loss,         # Physics-based stop
            confidence: signal.confidence,
            entry_time: DateTime.utc_now(),
            opened_at: DateTime.utc_now(),
            # Exit after 5 minutes max
            target_exit_time: DateTime.add(DateTime.utc_now(), trunc(max_hold) * 60, :second),
            status: :open,
            exit_reason: nil,
            exit_time: nil,
            realized_pnl: 0.0,
            exchange_order_id: order_result[:order_id],
            position_value: position_value,
            virtual_balance_user: use_vb
          }
          
          expected_profit = impulse_size * executed_qty
          Logger.info("🎯 Expected profit: $#{Float.round(expected_profit, 2)} | SL: $#{Float.round(stop_loss, 4)} | Exit in #{@max_hold_minutes}m")
          
          new_state = %{state |
            positions: Map.put(state.positions, position.id, position),
            total_trades: state.total_trades + 1,
            price_cache: Map.put(state.price_cache, signal.symbol, executed_price)
          }
          
          {:ok, position, new_state}
        
        {:error, reason} ->
          if vb_reserved, do: VirtualBalanceManager.release_reservation(user.id, position_id)
          Logger.error("❌ Trade failed: #{signal.symbol} | #{inspect(reason)}")
          {:error, reason}
      end
    end
  end

  defp can_open?(user, signal, state) do
    config = get_strategy_config()
    max_pos = get_param(config, "max_positions_per_user", @max_positions_per_user)

    user_positions = state.positions
      |> Map.values()
      |> Enum.filter(& &1.user_id == user.id)

    count = length(user_positions)
    has_symbol = Enum.any?(user_positions, & &1.symbol == signal.symbol)

    count < max_pos and not has_symbol
  end

  defp get_user_balance(user, account) do
    config = get_strategy_config()
    use_vb = get_param(config, "use_virtual_balance", @use_virtual_balance)
    if use_vb and VirtualBalanceManager.running?() do
      case VirtualBalanceManager.get_available_balance(user.id) do
        {:ok, vb} -> vb
        _ -> Decimal.to_float(account.available_balance)
      end
    else
      Decimal.to_float(account.available_balance)
    end
  end

  defp get_eligible_users do
    config = get_strategy_config()
    use_vb = get_param(config, "use_virtual_balance", @use_virtual_balance)
    if use_vb and VirtualBalanceManager.running?() do
      case VirtualBalanceManager.get_all_users() do
        {:ok, users} when length(users) > 0 ->
          users
          |> Enum.filter(fn {_user_id, balance} -> balance.available >= @min_trade_value end)
          |> Enum.take(@max_users_per_signal)
          |> Enum.map(fn {user_id, _balance} ->
            case get_user_with_account(user_id) do
              {:ok, user, account} -> {user, account}
              _ -> nil
            end
          end)
          |> Enum.reject(&is_nil/1)
        
        {:ok, []} ->
          auto_setup_trading_user()
        
        _ ->
          []
      end
    else
      try do
        # TradingAccount table removed — use VirtualBalanceManager instead
        Repo.all(from u in User, limit: ^@max_users_per_signal, order_by: fragment("RANDOM()"))
        |> Enum.map(fn u -> {u, %{id: nil, user_id: u.id, available_balance: Decimal.new("100")}} end)
      rescue
        _ -> []
      end
    end
  end
  
  defp auto_setup_trading_user do
    try do
      case Repo.one(from u in User, limit: 1) do
        nil -> []
        user ->
          starting_balance = 100.0  # Start with $100 for small account testing
          VirtualBalanceManager.set_balance(user.id, starting_balance)
          Logger.info("✅ AUTO-SETUP: User #{user.id} with $#{starting_balance}")
          account = %{id: nil, user_id: user.id, available_balance: Decimal.new("#{starting_balance}")}
          [{user, account}]
      end
    rescue
      _ -> []
    end
  end
  
  defp get_user_with_account(user_id) do
    try do
      case Repo.one(from u in User, where: u.id == ^user_id, limit: 1) do
        nil -> {:error, :user_not_found}
        user ->
          # TradingAccount table removed — use placeholder
          account = %{id: nil, user_id: user_id, available_balance: Decimal.new("100")}
          {:ok, user, account}
      end
    rescue
      _ -> {:error, :exception}
    end
  end

  # ========================================================================
  # EXIT PROCESSING - IMPULSE CAPTURE LOGIC
  # ========================================================================

  defp process_exits(state) do
    now = DateTime.utc_now()
    position_count = map_size(state.positions)
    
    if position_count > 0 do
      Logger.debug("📊 Checking #{position_count} impulse positions")
    end
    
    to_check = state.positions |> Map.values() |> Enum.take(@max_positions_to_check)
    to_close = Enum.filter(to_check, &should_exit_impulse?(&1, now, state))
    
    if length(to_close) > 0 do
      Logger.info("🎯 Closing #{length(to_close)} impulse trades")
    end
    
    Enum.reduce(to_close, state, &close_position(&1, &2))
  end

  @doc """
  Impulse exit logic:
  1. Hit impulse target (P1) → EXIT with profit
  2. Hit stop loss (φ-based) → EXIT with controlled loss
  3. Time expired (5 min) → EXIT regardless
  """
  defp should_exit_impulse?(pos, now, state) do
    current = Map.get(state.price_cache, pos.symbol, pos.entry_price)
    entry = pos.entry_price
    target = pos.impulse_target
    stop = pos.stop_loss
    
    # Time check - max 5 minutes
    time_expired = DateTime.compare(now, pos.target_exit_time) == :gt
    
    # Price checks
    {hit_target, hit_stop} = case pos.direction do
      :long ->
        {current >= target, current <= stop}
      :short ->
        {current <= target, current >= stop}
      _ ->
        {false, false}
    end
    
    cond do
      hit_target ->
        Logger.debug("🎯 #{pos.symbol} hit impulse target!")
        true
      hit_stop ->
        Logger.debug("🛑 #{pos.symbol} hit stop loss")
        true
      time_expired ->
        Logger.debug("⏰ #{pos.symbol} time expired (#{@max_hold_minutes}m)")
        true
      true ->
        false
    end
  end

  defp close_position(pos, state) do
    exit_price = Map.get(state.price_cache, pos.symbol, pos.current_price)
    entry = pos.entry_price
    config = get_strategy_config()
    execute_on_exch = get_param(config, "execute_on_exchange", @execute_on_exchange)

    # Execute close on exchange
    exchange_result = if execute_on_exch do
      case pos.direction do
        :long ->
          TestnetExecutor.close_long(pos.symbol, pos.quantity, entry,
            user_id: pos.user_id,
            position_id: pos.id,
            trading_account_id: pos.trading_account_id
          )
        :short ->
          TestnetExecutor.close_short(pos.symbol, pos.quantity, entry,
            user_id: pos.user_id,
            position_id: pos.id,
            trading_account_id: pos.trading_account_id
          )
        _ ->
          {:error, :invalid_direction}
      end
    else
      pnl = calculate_pnl_value(pos, exit_price)
      {:ok, %{executed_price: exit_price, pnl: pnl}}
    end
    
    {final_exit_price, pnl} = case exchange_result do
      {:ok, result} ->
        {result[:executed_price] || exit_price, result[:pnl] || calculate_pnl_value(pos, exit_price)}
      {:error, _} ->
        {exit_price, calculate_pnl_value(pos, exit_price)}
    end
    
    pnl_pct = if entry > 0, do: (pnl / (entry * pos.quantity)) * 100, else: 0.0
    is_win = pnl >= 0
    target_profit = get_param(config, "target_profit_usd", @target_profit_usd)
    use_vb = get_param(config, "use_virtual_balance", @use_virtual_balance)
    hit_dollar_target = pnl >= target_profit * 0.8

    # Update virtual balance
    if use_vb and Map.get(pos, :virtual_balance_user, false) do
      principal = Map.get(pos, :position_value, entry * pos.quantity)
      VirtualBalanceManager.close_position(pos.user_id, pos.id, principal, pnl)
    end
    
    # Log result with impulse context
    emoji = cond do
      hit_dollar_target -> "🎯"  # Hit $1 target
      is_win -> "✅"
      true -> "❌"
    end
    
    Logger.info("#{emoji} #{pos.direction} #{pos.symbol} | Entry: $#{Float.round(entry, 2)} Exit: $#{Float.round(final_exit_price, 2)} | P&L: $#{Float.round(pnl, 2)} (#{Float.round(pnl_pct, 1)}%)")
    
    new_state = %{state |
      positions: Map.delete(state.positions, pos.id),
      winning_trades: state.winning_trades + if(is_win, do: 1, else: 0),
      losing_trades: state.losing_trades + if(is_win, do: 0, else: 1),
      total_realized_pnl: state.total_realized_pnl + pnl,
      dollar_targets_hit: state.dollar_targets_hit + if(hit_dollar_target, do: 1, else: 0),
      trade_history: [Map.put(pos, :realized_pnl, pnl) | state.trade_history] |> Enum.take(100),
      recent_signals: Map.delete(state.recent_signals, pos.symbol)
    }
    
    # Check for reversal
    spawn(fn -> 
      Process.sleep(500)
      check_reversal_opportunity(pos.symbol, pos.direction)
    end)
    
    new_state
  end

  defp calculate_pnl_value(pos, exit_price) do
    case pos.direction do
      :long -> (exit_price - pos.entry_price) * pos.quantity
      :short -> (pos.entry_price - exit_price) * pos.quantity
      _ -> 0.0
    end
  end

  defp check_reversal_opportunity(symbol, closed_direction) do
    expected = case closed_direction do
      :long -> :short
      :short -> :long
      _ -> nil
    end
    if expected, do: GenServer.cast(__MODULE__, {:check_reversal, symbol, expected})
  end

  # ========================================================================
  # PRICE & P&L UPDATES
  # ========================================================================

  defp update_prices(state) do
    symbols = state.positions |> Map.values() |> Enum.map(& &1.symbol) |> Enum.uniq() |> Enum.take(20)
    
    new_cache = Enum.reduce(symbols, state.price_cache, fn sym, cache ->
      case get_price(sym) do
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

  defp calculate_pnl(state) do
    total = state.positions
      |> Map.values()
      |> Enum.reduce(0.0, fn pos, acc ->
        current = Map.get(state.price_cache, pos.symbol, pos.entry_price)
        pnl = calculate_pnl_value(pos, current)
        acc + pnl
      end)
    
    %{state | total_unrealized_pnl: total}
  end

  # ========================================================================
  # HELPERS
  # ========================================================================

  defp analyze_candles(symbol) do
    case KlineStream.get_recent_candles(symbol, 20) do
      candles when is_list(candles) and length(candles) >= 5 ->
        SignalGenerator.generate_signal(candles, nil, symbol)
      _ ->
        {:error, :insufficient_candles}
    end
  end

  defp get_price(symbol) do
    url = "https://testnet.binance.vision/api/v3/ticker/price?symbol=#{symbol}"
    case HTTPoison.get(url, [], timeout: 2000, recv_timeout: 2000) do
      {:ok, %{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"price" => p}} -> {:ok, Decimal.new(p)}
          _ -> {:error, :decode}
        end
      _ -> {:error, :http}
    end
  rescue
    _ -> {:error, :exception}
  end

  # ════════════════════════════════════════════════════════════════════════════
  # STRATEGY CONFIG READER
  # Reads runtime overrides from strategy.strategies.config JSONB.
  # Falls back to compile-time @attr defaults.
  # ════════════════════════════════════════════════════════════════════════════

  defp get_strategy_config do
    # Load active strategy config from DB (cached in ETS by the schema module)
    case load_active_strategy_config() do
      %{} = config when map_size(config) > 0 -> config
      _ -> %{}
    end
  end

  defp load_active_strategy_config do
    alias SysAdmin.Strategies.Strategy
    try do
      case Repo.one(
        from(s in Strategy,
          where: s.status == "active" and s.type == "core_momentum",
          select: s.config,
          limit: 1
        )
      ) do
        nil -> %{}
        config when is_map(config) -> config
        _ -> %{}
      end
    rescue
      _ -> %{}
    end
  end

  defp get_param(config, key, default) when is_map(config) do
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

  defp get_param(_, _, default), do: default

  defp to_float(nil), do: nil
  defp to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp to_float(n) when is_float(n), do: n
  defp to_float(n) when is_integer(n), do: n * 1.0
  defp to_float(_), do: nil
end


