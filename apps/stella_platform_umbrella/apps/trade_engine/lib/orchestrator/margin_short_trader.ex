defmodule TradeEngine.Orchestrator.MarginShortTrader do
  @moduledoc """
  AGGRESSIVELY OPTIMIZED margin short trader for Binance Testnet.
  
  Conservative short strategy with dynamic pair discovery:
  - Only shorts with >70% confidence bearish signals
  - Macro (1d/4h): MUST be bearish
  - Intermediate (1h/30m): MUST be bearish or neutral
  - Trigger (15m/5m/1m): Should be bearish
  
  CRITICAL OPTIMIZATIONS:
  - Process ONLY 2 pairs per user (not all 100)
  - Timeout at EVERY level (500ms per pair, 800ms per user)
  - Early exit after first short found
  - DB preloading (no N+1 queries)
  - Aggressive timeouts on HTTP/analysis
  
  BUSINESS CONSTRAINTS (ENFORCED):
  ✅ Each user can have MAX 1 short per symbol
  ✅ Position size: 5% of account (conservative)
  ✅ Each short must be $100 minimum value
  ✅ Stop loss: +2% (price goes UP)
  ✅ Take profit: -5% (price goes DOWN)
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Strategy.MultiTimeframe
  alias TradeEngine.MarketData.BinanceExchange
  alias SysAdmin.Accounts.User
  # TradingAccount removed — table replaced by trading.equity_snapshots
  alias TradeEngine.Trading.Position
  alias TradeEngine.Orchestrator.BinanceClient

  # ========== CONFIGURATION ==========

  @binance_testnet_url "https://testnet.binance.vision/api"
  @max_pairs 100
  @use_testnet true
  
  # Short entry requirements - VERY CONSERVATIVE
  @min_short_confidence 0.70
  @position_size_percent 0.05
  @short_stop_loss 0.02
  @short_take_profit -0.05
  @max_short_hold_time_mins 120
  @max_short_positions_per_user_per_symbol 1
  
  @pairs_refresh_interval 3_600_000
  
  # ⚡ AGGRESSIVE TIMEOUTS
  @task_timeout_ms 60_000
  @batch_size 20
  @max_concurrent_batches 3
  @per_user_timeout_ms 800     # 800ms per user
  @per_pair_timeout_ms 500     # 500ms per pair
  @pairs_per_user 2            # Only 2 pairs per user

  # ========== PUBLIC API ==========

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def start_shorting do
    GenServer.cast(__MODULE__, :start_shorting)
  end

  def stop_shorting do
    GenServer.cast(__MODULE__, :stop_shorting)
  end

  def get_stats do
    GenServer.call(__MODULE__, :get_stats, 5000)
  end

  # ========== GENSERVER CALLBACKS ==========

  @impl true
  def init(_opts) do
    Logger.info("🩳 Margin Short Trader INITIALIZED (AGGRESSIVE OPTIMIZATION)")
    send(self(), :refresh_pairs)
    
    state = %{
      shorting_active: false,
      total_shorts: 0,
      total_short_profit: Decimal.new("0"),
      started_at: nil,
      trading_pairs: [],
      cycle_count: 0
    }
    {:ok, state}
  end

  @impl true
  def handle_cast(:start_shorting, state) do
    Logger.info("🩳 SHORT TRADING STARTED - #{@pairs_per_user} pairs/user, #{@per_user_timeout_ms}ms timeout")
    send(self(), :execute_shorts)
    {:noreply, %{state | shorting_active: true, started_at: DateTime.utc_now()}}
  end

  @impl true
  def handle_cast(:stop_shorting, state) do
    Logger.info("🛑 SHORT TRADING STOPPED")
    {:noreply, %{state | shorting_active: false}}
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    stats = %{
      shorting_active: state.shorting_active,
      total_shorts: state.total_shorts,
      total_short_profit: state.total_short_profit,
      cycles: state.cycle_count,
      uptime_seconds: if(state.started_at, do: DateTime.diff(DateTime.utc_now(), state.started_at), else: 0)
    }
    {:reply, stats, state}
  end

  @impl true
  def handle_info(:refresh_pairs, state) do
    Logger.info("🔄 Refreshing short pairs...")
    
    pairs = BinanceExchange.get_top_pairs(@max_pairs, @use_testnet)
    pair_symbols = Enum.map(pairs, & &1.symbol)
    
    Logger.info("✅ #{length(pair_symbols)} short pairs ready (#{@pairs_per_user} per user)")
    
    Process.send_after(self(), :refresh_pairs, @pairs_refresh_interval)
    new_state = %{state | trading_pairs: pair_symbols}
    
    if state.shorting_active and Enum.empty?(state.trading_pairs) do
      send(self(), :execute_shorts)
    end
    
    {:noreply, new_state}
  end

  @impl true
  def handle_info(:execute_shorts, state) do
    if state.shorting_active do
      if Enum.empty?(state.trading_pairs) do
        Logger.warning("⚠️ No pairs loaded yet")
        Process.send_after(self(), :execute_shorts, 60_000)
        {:noreply, state}
      else
        Logger.info("\n" <> String.duplicate("=", 60))
        Logger.info("Short Cycle #{state.cycle_count + 1} - #{DateTime.utc_now()}")
        Logger.info(String.duplicate("=", 60))

        Logger.info("📋 Checking short exits...")
        :ok = process_short_exits()

        Logger.info("📋 Scanning for short entries...")
        new_state = execute_short_scanning(%{state | cycle_count: state.cycle_count + 1})

        Logger.info(String.duplicate("=", 60) <> "\n")

        Process.send_after(self(), :execute_shorts, 60_000)
        {:noreply, new_state}
      end
    else
      {:noreply, state}
    end
  end

  # ========== SHORT EXIT MANAGEMENT ==========

  defp process_short_exits do
    short_positions = Repo.all(
      from(p in Position,
        where: p.status == "open" and p.position_type == "short"
      )
    )

    Logger.info("📊 Checking #{length(short_positions)} open shorts...")

    Enum.each(short_positions, fn position ->
      case get_current_price_fast(position.symbol) do
        {:ok, current_price} ->
          check_short_exit_fast(position, current_price)
        
        {:error, _reason} ->
          Logger.debug("Price fetch failed for #{position.symbol}")
      end
    end)

    :ok
  end

  defp check_short_exit_fast(position, current_price) do
    entry_float = Decimal.to_float(position.entry_price)
    current_float = Decimal.to_float(current_price)
    
    # For shorts: profit when price GOES DOWN (negative change)
    price_change_pct = (current_float - entry_float) / entry_float
    time_held_mins = NaiveDateTime.diff(NaiveDateTime.utc_now(), position.entry_time, :minute)

    should_exit = cond do
      # Take profit: -5% (price down = profit for short)
      price_change_pct <= @short_take_profit ->
        {:exit, :take_profit, price_change_pct}

      # Stop loss: +2% (price up = loss for short)
      price_change_pct >= @short_stop_loss ->
        {:exit, :stop_loss, price_change_pct}

      # Time-based exit
      time_held_mins > @max_short_hold_time_mins ->
        {:exit, :time_exit, price_change_pct}

      true ->
        :hold
    end

    case should_exit do
      {:exit, reason, pct} ->
        close_short_position_fast(position, current_price, reason, pct)
      :hold ->
        Logger.debug("🩳 #{position.symbol}: #{Float.round(price_change_pct * 100, 2)}% (#{time_held_mins}m)")
    end
  end

  defp close_short_position_fast(position, exit_price, reason, price_change_pct) do
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
    profit = Decimal.mult(
      Decimal.sub(position.entry_price, exit_price),
      position.quantity
    )

    reason_label = case reason do
      :take_profit -> "✅ TP"
      :stop_loss -> "🔴 SL"
      :time_exit -> "⏰ EXIT"
      _ -> "EXIT"
    end

    case Repo.update(position, %{
      status: "closed",
      exit_price: exit_price,
      profit_loss: profit,
      roi_percentage: Decimal.from_float(price_change_pct),
      exit_reason: Atom.to_string(reason),
      exit_time: now,
      updated_at: now
    }) do
      {:ok, _} ->
        Logger.info(
          "#{reason_label} SHORT: #{position.symbol} | Profit: $#{Decimal.to_string(profit)} (#{Float.round(price_change_pct * 100, 2)}%)"
        )
        :ok

      {:error, e} ->
        Logger.error("Failed to close short: #{inspect(e)}")
        :error
    end
  end

  # ========== SHORT ENTRY SCANNING ==========

  defp execute_short_scanning(state) do
    # ⚡ Preload accounts to avoid N+1
    users_with_accounts = Repo.all(
      from(u in User,
        where: like(u.email, "user_%@tradingapp.io"),
        select: {u, nil},
        limit: 1000
      )
    )

    Logger.info("Processing #{length(users_with_accounts)} users (batches of #{@batch_size})...")

    results =
      users_with_accounts
      |> Enum.chunk_every(@batch_size)
      |> process_short_batches_concurrent(state.trading_pairs, [])

    successful_shorts = Enum.count(results)

    Logger.info("✅ Short scan complete: #{successful_shorts} new positions")

    %{state | total_shorts: state.total_shorts + successful_shorts}
  end

  defp process_short_batches_concurrent(batches, _trading_pairs, results) when batches == [] do
    results
  end

  defp process_short_batches_concurrent(batches, trading_pairs, results) do
    {current_batches, remaining_batches} = Enum.split(batches, @max_concurrent_batches)

    batch_tasks = Enum.map(current_batches, fn chunk ->
      Task.async(fn -> process_short_batch(chunk, trading_pairs) end)
    end)

    batch_results =
      batch_tasks
      |> Enum.map(fn task ->
        case Task.yield(task, @task_timeout_ms) || Task.shutdown(task, :brutal_kill) do
          {:ok, result} -> result || []
          nil -> 
            Logger.debug("⚠️ Batch timeout (#{@task_timeout_ms}ms)")
            []
          {:exit, _} -> []
        end
      end)
      |> Enum.concat()

    process_short_batches_concurrent(remaining_batches, trading_pairs, results ++ batch_results)
  end

  defp process_short_batch(user_tuples, trading_pairs) do
    user_tuples
    |> Enum.map(fn {user, trading_account} ->
      task = Task.async(fn ->
        try do
          # ⚡ Skip if no account or insufficient balance
          if trading_account && trading_account.available_balance > Decimal.new("100") do
            scan_user_for_shorts_fast(user, trading_account, trading_pairs)
          else
            nil
          end
        rescue
          e ->
            Logger.debug("User error: #{inspect(e)}")
            nil
        end
      end)

      case Task.yield(task, @per_user_timeout_ms) || Task.shutdown(task, :brutal_kill) do
        {:ok, result} -> result
        nil -> 
          Logger.debug("User #{user.id} timeout")
          nil
        {:exit, _} -> nil
      end
    end)
    |> Enum.filter(&(&1 != nil))
  end

  # ⚡ OPTIMIZED: Only scan 2 random pairs
  defp scan_user_for_shorts_fast(user, trading_account, trading_pairs) do
    selected_pairs = Enum.take_random(trading_pairs, @pairs_per_user)
    
    # Early exit after first short found
    selected_pairs
    |> Enum.find_value(nil, fn pair ->
      case check_short_opportunity_fast(user, trading_account, pair) do
        {:short_executed, _profit} -> {:short_executed, Decimal.new("0")}
        _ -> nil
      end
    end)
  end

  # ⚡ AGGRESSIVE: 500ms timeout on analysis
  defp check_short_opportunity_fast(user, trading_account, pair) do
    task = Task.async(fn ->
      try do
        MultiTimeframe.analyze_alignment(pair, "binance")
      rescue
        _e -> {:error, "Analysis failed"}
      end
    end)

    case Task.yield(task, @per_pair_timeout_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, {:ok, signal}} ->
        # ✅ CONSTRAINT: Max 1 short per symbol per user
        if should_open_short?(signal) && count_open_shorts(user.id, pair) == 0 do
          Logger.info("🔴 SHORT #{pair} for #{user.email} (#{Float.round(signal.confidence * 100, 1)}%)")
          execute_short_fast(user, trading_account, pair, signal)
        else
          nil
        end

      {:ok, {:error, _reason}} -> nil
      nil -> nil
      {:exit, _} -> nil
    end
  end

  defp should_open_short?(signal) do
    cond do
      signal.direction != :bearish -> false
      signal.confidence < @min_short_confidence -> false
      signal.macro_direction != :bearish -> false
      signal.intermediate_direction == :bullish -> false
      signal.trigger_direction == :bullish -> false
      true -> true
    end
  end

  defp execute_short_fast(user, trading_account, pair, _signal) do
    # ✅ CONSTRAINT: Position size 5% of account
    position_size_usd = Decimal.mult(
      trading_account.available_balance,
      Decimal.from_float(@position_size_percent)
    )

    # ✅ CONSTRAINT: Each short must be $100 minimum
    if Decimal.compare(position_size_usd, Decimal.new("100")) == :lt do
      Logger.debug("⚠️ Position size $#{Decimal.to_string(position_size_usd)} < $100 minimum")
      nil
    else
      case get_current_price_fast(pair) do
        {:ok, current_price} ->
          current_price_float = Decimal.to_float(current_price)
          raw_quantity = position_size_usd
            |> Decimal.div(current_price)
            |> Decimal.to_float()

          symbol = pair |> String.replace("/", "") |> String.upcase()

          case TradeEngine.Trading.BinanceFilterValidator.validate_quantity(symbol, raw_quantity) do
            {:ok, validated_quantity} ->
              min_order_value = validated_quantity * current_price_float
              
              # ✅ CONSTRAINT: Final order must be $100+ (not just $10)
              if min_order_value >= 100.0 do
                Logger.info("✅ Short: #{symbol} | Qty: #{validated_quantity} | Value: $#{Float.round(min_order_value, 2)}")
                create_short_position_fast(user, pair, Decimal.new("#{validated_quantity}"), current_price)
                {:short_executed, Decimal.new("0")}
              else
                Logger.debug("⚠️ Order value $#{Float.round(min_order_value, 2)} < $100 minimum")
                nil
              end

            {:error, _reason} -> nil
          end

        {:error, _reason} -> nil
      end
    end
  end

  defp create_short_position_fast(user, pair, quantity, entry_price) do
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    position_data = %{
      id: Ecto.UUID.generate(),
      user_id: user.id,
      symbol: pair,
      position_type: "short",
      quantity: quantity,
      entry_price: entry_price,
      current_price: entry_price,
      profit_loss: Decimal.new("0"),
      unrealized_profit_loss: Decimal.new("0"),
      roi_percentage: Decimal.new("0"),
      status: "open",
      entry_time: now,
      created_at: now,
      updated_at: now
    }

    case Repo.insert(Position.changeset(%Position{}, position_data)) do
      {:ok, _position} ->
        Logger.info("🩳 Short position: #{pair} | Qty: #{quantity}")
        :ok

      {:error, e} ->
        Logger.error("Failed to create short: #{inspect(e)}")
        nil
    end
  end

  defp count_open_shorts(user_id, symbol) do
    Repo.aggregate(
      from(p in Position,
        where: p.user_id == ^user_id and p.status == "open" and 
               p.position_type == "short" and p.symbol == ^symbol
      ),
      :count,
      :id
    ) || 0
  end

  # ⚡ CRITICAL: Timeout on price fetch
  defp get_current_price_fast(pair) do
    symbol = pair |> String.replace("/", "") |> String.upcase()
    url = "#{@binance_testnet_url}/v3/ticker/price?symbol=#{symbol}"

    task = Task.async(fn ->
      HTTPoison.get(url, [], timeout: 1500, recv_timeout: 1500)
    end)

    case Task.yield(task, 2000) || Task.shutdown(task, :brutal_kill) do
      {:ok, {:ok, %HTTPoison.Response{status_code: 200, body: body}}} ->
        case Jason.decode(body) do
          {:ok, %{"price" => price_str}} ->
            {:ok, Decimal.from_float(String.to_float(price_str))}
          {:error, _} -> {:error, "decode"}
        end
      _ -> {:error, "http"}
    end
  end
end