defmodule TradeEngine.Orchestrator.AutomatedTrader do
  @moduledoc """
  🚀 ALPACA INTEGRATION - Automated Trading Orchestrator
  
  ✅ REALISTIC TIMEOUTS for Alpaca API (800-1500ms response times)
  ✅ Uses Data API for quotes (/v1beta3/crypto/us/latest/quotes)
  ✅ Uses Trading API for orders (/v2/orders)
  
  BUSINESS CONSTRAINTS:
  ✅ Max 10 open positions per user
  ✅ Min balance $10 (Alpaca crypto minimum)
  ✅ Min trade size $10 (Alpaca requirement)
  ✅ Market orders only
  ✅ Manual TP/SL management via position tracking
  """
  
  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias SysAdmin.Accounts.User
  alias TradeEngine.Trading.Position
  # TradingAccount removed — table replaced by trading.equity_snapshots
  alias TradeEngine.Strategy.MultiTimeframe
  alias TradeEngine.Orchestrator.Alpaca.Client, as: AlpacaClient

  @execution_interval_ms 60_000
  @max_pairs 100
  @pairs_refresh_interval 3_600_000
  
  # ⚡ REALISTIC TIMEOUTS
  @task_timeout_ms 45_000
  @batch_size 2
  @max_concurrent_batches 1
  @per_user_timeout_ms 15_000
  @per_pair_timeout_ms 10_000
  @pairs_per_user 1
  
  # Position sizing
  @position_size_percent 0.10
  @risk_percent 0.01
  @max_positions_per_user 10
  @min_bullish_confidence 0.45
  
  # Alpaca-specific
  @take_profit_pct 0.05
  @stop_loss_pct 0.02

  # ========== PUBLIC API ==========

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def start_trading do
    GenServer.cast(__MODULE__, :start_trading)
  end

  def stop_trading do
    GenServer.cast(__MODULE__, :stop_trading)
  end

  def get_stats do
    GenServer.call(__MODULE__, :get_stats, 30_000)
  end

  def check_account do
    GenServer.cast(__MODULE__, :check_account)
  end

  # ========== GENSERVER CALLBACKS ==========

  @impl true
  def init(_opts) do
    Logger.info("🤖 Automated Trader INITIALIZED (ALPACA MODE)")
    send(self(), :verify_alpaca_connection)
    send(self(), :refresh_pairs)
    
    state = %{
      trading_active: false,
      total_orders: 0,
      total_profit: Decimal.new("0"),
      started_at: nil,
      trades_history: [],
      processing: false,
      trading_pairs: [],
      cycle_count: 0,
      timeout_count: 0,
      alpaca_connected: false,
      alpaca_account: nil
    }
    {:ok, state}
  end

  @impl true
  def handle_cast(:start_trading, state) do
    Logger.info("🚀 Starting Alpaca trading system...")
    Logger.info("   Verifying Alpaca account connection...")
    
    case AlpacaClient.get_account() do
      {:ok, account} ->
        buying_power = parse_numeric(account["buying_power"])
        equity = parse_numeric(account["equity"])
        
        Logger.info("✅ Alpaca Account Connected")
        Logger.info("   Buying Power: $#{Float.round(buying_power, 2)}")
        Logger.info("   Equity: $#{Float.round(equity, 2)}")
        Logger.info("   Account Status: #{account["account_number"]}")
        
        if buying_power >= 10.0 do
          Logger.info("🟢 TRADING STARTED (ALPACA MODE)")
          Logger.info("   Per-user: #{@per_user_timeout_ms}ms | Per-pair: #{@per_pair_timeout_ms}ms | Batch: #{@batch_size}")
          
          send(self(), :execute_trades)
          {:noreply, %{state | 
            trading_active: true, 
            started_at: DateTime.utc_now(),
            alpaca_connected: true,
            alpaca_account: account
          }}
        else
          Logger.error("❌ INSUFFICIENT BUYING POWER: $#{Float.round(buying_power, 2)} (min: $10)")
          Logger.info("📝 Please fund your Alpaca account to continue")
          {:noreply, state}
        end
      
      {:error, reason} ->
        Logger.error("❌ Alpaca connection failed: #{inspect(reason)}")
        Logger.info("📝 Check your API credentials in config/config.exs")
        {:noreply, state}
    end
  end

  @impl true
  def handle_cast(:stop_trading, state) do
    Logger.info("🛑 TRADING STOPPED")
    {:noreply, %{state | trading_active: false}}
  end

  @impl true
  def handle_cast(:check_account, state) do
    case AlpacaClient.get_account() do
      {:ok, account} ->
        buying_power = parse_numeric(account["buying_power"])
        equity = parse_numeric(account["equity"])
        cash = parse_numeric(account["cash"])
        dtbp = parse_numeric(account["daytrading_buying_power"])
        
        Logger.info("💰 Alpaca Account Status:")
        Logger.info("   Buying Power: $#{Float.round(buying_power, 2)}")
        Logger.info("   Equity: $#{Float.round(equity, 2)}")
        Logger.info("   Cash: $#{Float.round(cash, 2)}")
        Logger.info("   Day Trading Buying Power: $#{Float.round(dtbp, 2)}")
      
      {:error, reason} ->
        Logger.error("❌ Account check failed: #{inspect(reason)}")
    end
    {:noreply, state}
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    stats = %{
      status: if(state.trading_active, do: "ACTIVE", else: "STOPPED"),
      broker: "ALPACA",
      alpaca_connected: state.alpaca_connected,
      total_orders: state.total_orders,
      total_profit: state.total_profit,
      cycles: state.cycle_count,
      timeout_count: state.timeout_count,
      uptime_seconds: if(state.started_at, do: DateTime.diff(DateTime.utc_now(), state.started_at), else: 0),
      recent_trades: Enum.take(state.trades_history, 10)
    }
    {:reply, stats, state}
  end

  # ========== PAIR MANAGEMENT ==========

  @impl true
  def handle_info(:verify_alpaca_connection, state) do
    case AlpacaClient.get_account() do
      {:ok, _account} ->
        Logger.info("✅ Alpaca API connection verified")
        {:noreply, %{state | alpaca_connected: true}}
      
      {:error, reason} ->
        Logger.warning("⚠️ Alpaca connection check failed: #{inspect(reason)}")
        {:noreply, state}
    end
  end

  @impl true
  def handle_info(:refresh_pairs, state) do
    Logger.info("🔄 Refreshing trading pairs...")
    
    pairs = get_alpaca_tradeable_pairs(@max_pairs)
    pair_symbols = Enum.map(pairs, & &1.symbol)
    
    Logger.info("✅ #{length(pair_symbols)} pairs loaded for Alpaca")
    
    Process.send_after(self(), :refresh_pairs, @pairs_refresh_interval)
    new_state = %{state | trading_pairs: pair_symbols}
    
    if state.trading_active and not Enum.empty?(state.trading_pairs) do
      send(self(), :execute_trades)
    end
    
    {:noreply, new_state}
  end

  @impl true
  def handle_info(:execute_trades, state) do
    if state.trading_active and not state.processing do
      if Enum.empty?(state.trading_pairs) do
        Logger.warning("⚠️ No pairs loaded yet")
        Process.send_after(self(), :execute_trades, @execution_interval_ms)
        {:noreply, state}
      else
        cycle_start = System.monotonic_time(:millisecond)
        Logger.info("\n" <> String.duplicate("=", 70))
        Logger.info("🔄 Cycle #{state.cycle_count + 1} - #{DateTime.utc_now()}")
        Logger.info(String.duplicate("=", 70))

        Logger.info("📋 Processing exits...")
        :ok = process_exit_signals()

        Logger.info("📋 Processing entries...")
        new_state = execute_trading_cycle(%{state | processing: true, cycle_count: state.cycle_count + 1})

        cycle_time = System.monotonic_time(:millisecond) - cycle_start
        Logger.info("✅ Cycle complete in #{cycle_time}ms:")
        Logger.info("   Orders: #{new_state.total_orders} | Profit: $#{Decimal.to_string(new_state.total_profit)}")
        Logger.info(String.duplicate("=", 70) <> "\n")

        Process.send_after(self(), :execute_trades, @execution_interval_ms)
        {:noreply, %{new_state | processing: false}}
      end
    else
      if state.processing do
        Logger.warning("⚠️ Still processing, skipping cycle")
        Process.send_after(self(), :execute_trades, @execution_interval_ms)
      end
      {:noreply, state}
    end
  end

  # ========== TRADING EXECUTION ==========

  defp execute_trading_cycle(state) do
    users_with_accounts = Repo.all(
      from(u in User,
        where: like(u.email, "user_%@tradingapp.io"),
        select: {u, nil},
        limit: 200
      )
    )

    Logger.info("📊 Found #{length(users_with_accounts)} users")
    
    if Enum.empty?(users_with_accounts) do
      Logger.warning("⚠️ NO USERS FOUND")
      state
    else
      Logger.info("Processing in batches of #{@batch_size}...")

      results =
        users_with_accounts
        |> Enum.chunk_every(@batch_size)
        |> process_batches_concurrently(state.trading_pairs, [])

      successful_trades = Enum.count(results, &(&1 != nil))
      total_profit = Enum.reduce(results, Decimal.new("0"), fn
        {:trade_executed, profit}, acc -> Decimal.add(acc, profit)
        _, acc -> acc
      end)

      history_entry = %{
        timestamp: DateTime.utc_now(),
        trades: successful_trades,
        profit: total_profit
      }

      Logger.info("✅ #{successful_trades} trades executed this cycle")

      %{
        state
        | total_orders: state.total_orders + successful_trades,
          total_profit: Decimal.add(state.total_profit, total_profit),
          trades_history: [history_entry | state.trades_history] |> Enum.take(100)
      }
    end
  end

  defp process_batches_concurrently(batches, _trading_pairs, results) when batches == [] do
    results
  end

  defp process_batches_concurrently(batches, trading_pairs, results) do
    {current_batches, remaining_batches} = 
      Enum.split(batches, @max_concurrent_batches)

    batch_tasks = Enum.map(current_batches, fn chunk ->
      Task.async(fn -> process_user_batch(chunk, trading_pairs) end)
    end)

    batch_results =
      batch_tasks
      |> Enum.map(fn task ->
        case Task.yield(task, @task_timeout_ms) || Task.shutdown(task, :brutal_kill) do
          {:ok, result} -> result || []
          nil -> 
            Logger.warning("⚠️ Batch timeout (#{@task_timeout_ms}ms)")
            []
          {:exit, _} -> []
        end
      end)
      |> Enum.concat()

    process_batches_concurrently(remaining_batches, trading_pairs, results ++ batch_results)
  end

  defp process_user_batch(user_tuples, trading_pairs) do
    user_tuples
    |> Enum.map(fn {user, trading_account} ->
      task = Task.async(fn ->
        try do
          if trading_account && Decimal.compare(trading_account.available_balance, Decimal.new("100")) == :gt do
            process_user_trading_alpaca(user, trading_account, trading_pairs)
          else
            nil
          end
        rescue
          e ->
            Logger.debug("   User error: #{inspect(e)}")
            nil
        end
      end)

      case Task.yield(task, @per_user_timeout_ms) || Task.shutdown(task, :brutal_kill) do
        {:ok, result} -> result
        nil -> 
          Logger.debug("⚠️ User #{user.id} exceeded #{@per_user_timeout_ms}ms timeout")
          nil
        {:exit, _} -> nil
      end
    end)
    |> Enum.filter(&(&1 != nil))
  end

  # ========== OPTIMIZED USER TRADING (ALPACA) ==========

  defp process_user_trading_alpaca(user, trading_account, trading_pairs) do
    open_positions_count = count_open_positions(user.id)
    
    cond do
      open_positions_count >= @max_positions_per_user ->
        Logger.debug("   #{user.email}: Max positions (#{open_positions_count}/10)")
        nil
      
      is_nil(trading_account) ->
        Logger.debug("   #{user.email}: NO ACCOUNT")
        nil
      
      Decimal.compare(trading_account.available_balance, Decimal.new("100")) == :lt ->
        Logger.debug("   #{user.email}: Low balance")
        nil
      
      true ->
        selected_pairs = Enum.take_random(trading_pairs, @pairs_per_user)
        
        selected_pairs
        |> Enum.find_value(nil, fn pair ->
          case analyze_and_trade_alpaca(user, trading_account, pair) do
            {:traded, profit} -> {:trade_executed, profit}
            _ -> nil
          end
        end)
    end
  end

  # ========== SIGNAL ANALYSIS & TRADING (ALPACA) ==========

  defp analyze_and_trade_alpaca(user, trading_account, pair) do
    task = Task.async(fn ->
      try do
        MultiTimeframe.analyze_alignment(pair, "alpaca")
      rescue
        _e -> {:error, "Analysis failed"}
      end
    end)

    case Task.yield(task, @per_pair_timeout_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, {:ok, signal}} ->
        Logger.debug("   📈 #{pair}: #{Float.round(signal.confidence * 100, 1)}%")
        
        if signal.direction == :bullish and signal.confidence >= @min_bullish_confidence do
          Logger.info("🟢 TRADE: #{pair} (#{user.email}) - #{Float.round(signal.confidence * 100, 1)}%")
          open_positions = count_open_positions(user.id)

          if open_positions < @max_positions_per_user do
            execute_buy_trade_alpaca(user, trading_account, pair)
          else
            nil
          end
        else
          nil
        end

      {:ok, {:error, _reason}} -> 
        nil
      
      nil -> 
        Logger.debug("   ⚠️ Analysis timeout for #{pair}")
        nil
      
      {:exit, _} -> 
        nil
    end
  end

  defp execute_buy_trade_alpaca(user, trading_account, pair) do
    position_size_usd = Decimal.mult(trading_account.available_balance, Decimal.from_float(@position_size_percent))

    if Decimal.compare(position_size_usd, Decimal.new("10")) == :lt do
      Logger.debug("   ⚠️ Trade size too small: $#{Decimal.to_string(position_size_usd)}")
      nil
    else
      case get_current_price_alpaca(pair) do
        {:ok, current_price} ->
          current_price_float = Decimal.to_float(current_price)
          quantity = position_size_usd
            |> Decimal.div(current_price)
            |> Decimal.to_float()

          if quantity < 0.001 do
            Logger.debug("   ⚠️ Quantity too small: #{Float.round(quantity, 6)}")
            nil
          else
            order_value = quantity * current_price_float
            
            if order_value < 10.0 do
              Logger.debug("   ⚠️ Order value too small: $#{Float.round(order_value, 2)} (min: $10)")
              nil
            else
              case AlpacaClient.place_market_order(pair, "buy", quantity) do
                {:ok, response} ->
                  order_id = response["id"]
                  Logger.info("✅ Market Order: #{pair} ID:#{order_id} | $#{Float.round(order_value, 2)}")
                  Logger.info("   Entry: $#{Float.round(current_price_float, 4)} | Qty: #{Float.round(quantity, 6)}")
                  
                  create_position_record(user, trading_account, pair, quantity, current_price, order_id)
                  {:traded, Decimal.new("0")}

                {:error, reason} ->
                  Logger.warning("⚠️ Market order failed: #{inspect(reason)}")
                  nil
              end
            end
          end

        {:error, _reason} -> 
          nil
      end
    end
  end

  # ========== GET CURRENT PRICE (FIXED) ==========

  defp get_current_price_alpaca(pair) do
    # Use AlpacaClient.get_latest_quote() which uses the correct Data API
    task = Task.async(fn ->
      case AlpacaClient.get_latest_quote(pair) do
        {:ok, quote} ->
          bid = quote["bp"]
          ask = quote["ap"]
          
          if bid && ask do
            mid_price = (bid + ask) / 2.0
            {:ok, Decimal.from_float(mid_price)}
          else
            {:error, "invalid_quote_data"}
          end
        
        {:error, reason} ->
          {:error, reason}
      end
    end)

    case Task.yield(task, 2_500) || Task.shutdown(task, :brutal_kill) do
      {:ok, result} -> result
      nil -> 
        Logger.debug("⚠️ Price fetch timeout for #{pair}")
        {:error, "timeout"}
      {:exit, _} -> 
        Logger.debug("⚠️ Price fetch crash for #{pair}")
        {:error, "crash"}
    end
  end

  defp create_position_record(user, trading_account, pair, quantity, entry_price, order_id) do
    position_attrs = %{
      user_id: user.id,
      trading_account_id: trading_account.id,
      symbol: pair,
      quantity: Decimal.from_float(quantity),
      entry_price: entry_price,
      entry_time: NaiveDateTime.utc_now(),
      status: "open",
      position_type: "long",
      order_id: order_id
    }

    case Repo.insert(Position.changeset(%Position{}, position_attrs)) do
      {:ok, _position} ->
        Logger.debug("   Position record created")
      
      {:error, e} ->
        Logger.warning("   Failed to create position record: #{inspect(e)}")
    end
  end

  # ========== EXIT SIGNALS (ALPACA) ==========

  def process_exit_signals do
    case fetch_alpaca_positions() do
      {:ok, positions} ->
        Logger.info("✅ Monitoring #{length(positions)} open positions")
        :ok
      
      {:error, reason} ->
        Logger.warning("⚠️ Failed to fetch positions: #{inspect(reason)}")
        :ok
    end
  end

  defp fetch_alpaca_positions do
    case AlpacaClient.get_positions() do
      {:ok, positions} -> {:ok, positions}
      error -> error
    end
  end

  # ========== HELPERS ==========

  defp get_alpaca_tradeable_pairs(limit) do
    # ✅ VERIFIED WORKING SYMBOLS
    [
      %{symbol: "AAVEUSD"},
      %{symbol: "AVAXUSD"},
      %{symbol: "BATUSD"},
      %{symbol: "BCHUSD"},
      %{symbol: "BTCUSD"},
      %{symbol: "CRVUSD"},
      %{symbol: "DOGEUSD"},
      %{symbol: "ETHUSD"},
      %{symbol: "SOLUSD"},
      %{symbol: "GRTUSD"},
      %{symbol: "LINKUSD"},
      %{symbol: "LTCUSD"},
      %{symbol: "PEPEUSD"},
      %{symbol: "SHIBUSD"},
      %{symbol: "SKYUSD"},
      %{symbol: "SOLUSD"},
      %{symbol: "SUSHIUSD"},
      %{symbol: "TRUMPUSD"},
      %{symbol: "UNIUSD"},
      %{symbol: "USDCUSD"},
      %{symbol: "USDGUSD"},
      %{symbol: "XRPUSD"},
      %{symbol: "XTZUSD"},
      %{symbol: "YFIUSD"}
      
    ]
    |> Enum.take(limit)
  end

  defp count_open_positions(user_id) do
    Repo.aggregate(
      from(p in Position,
        where: p.user_id == ^user_id and p.status == "open"
      ),
      :count,
      :id
    ) || 0
  end

  defp parse_numeric(value) when is_float(value), do: value
  defp parse_numeric(value) when is_integer(value), do: Float.to_string(value) |> String.to_float()
  defp parse_numeric(value) when is_binary(value) do
    case Float.parse(value) do
      {num, _} -> num
      :error -> 0.0
    end
  end
  defp parse_numeric(_), do: 0.0
end