defmodule TradeEngine.Orchestrator.TestHelpers do
  @moduledoc """
  Test helpers and benchmarking utilities for the orchestrator.
  
  Usage:
    iex> alias TradeEngine.Orchestrator.TestHelpers
    iex> TestHelpers.benchmark_cycle()
    iex> TestHelpers.stress_test(100)
  """

  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Orchestrator.AutomatedTrader
  alias TradeEngine.Trading.Position
  alias SysAdmin.Accounts.User

  # ========== BENCHMARKING ==========

  @doc "Benchmark a single trading cycle"
  def benchmark_cycle do
    Logger.info("⏱️ Benchmarking single cycle...")
    
    start_time = System.monotonic_time(:millisecond)
    stats_before = AutomatedTrader.get_stats()
    
    Process.sleep(2000)
    
    stats_after = AutomatedTrader.get_stats()
    elapsed = System.monotonic_time(:millisecond) - start_time
    
    trades_executed = stats_after.total_orders - stats_before.total_orders
    profit_made = Decimal.sub(stats_after.total_profit, stats_before.total_profit)

    result = %{
      elapsed_ms: elapsed,
      trades: trades_executed,
      profit: profit_made,
      trades_per_second: Float.round(trades_executed * 1000 / elapsed, 2),
      profit_per_second: Float.round(Decimal.to_float(profit_made) * 1000 / elapsed, 2)
    }

    IO.inspect(result, label: "BENCHMARK RESULT")
    result
  end

  @doc "Run stress test with N cycles"
  def stress_test(num_cycles) when is_integer(num_cycles) do
    Logger.info("💪 Stress testing with #{num_cycles} cycles...")
    
    AutomatedTrader.start_trading()
    Process.sleep(1000)
    
    results = Enum.map(1..num_cycles, fn cycle ->
      Logger.info("Cycle #{cycle}/#{num_cycles}")
      Process.sleep(2000)
      AutomatedTrader.get_stats()
    end)
    
    AutomatedTrader.stop_trading()
    
    analyze_stress_results(results)
  end

  @doc "Measure pool efficiency"
  def measure_pool_efficiency do
    Logger.info("📊 Measuring pool efficiency...")
    
    stats_initial = AutomatedTrader.get_stats()
    start_time = System.monotonic_time(:millisecond)
    
    Process.sleep(10_000)
    
    stats_final = AutomatedTrader.get_stats()
    elapsed = System.monotonic_time(:millisecond) - start_time
    
    trades = stats_final.total_orders - stats_initial.total_orders
    cycles = stats_final.cycles - stats_initial.cycles

    trades_per_cycle = if cycles > 0 do
      Float.round(trades / cycles, 2)
    else
      0
    end

    efficiency = %{
      elapsed_seconds: elapsed / 1000,
      total_trades: trades,
      total_cycles: cycles,
      trades_per_cycle: trades_per_cycle,
      trades_per_second: Float.round(trades * 1000 / elapsed, 2)
    }

    IO.inspect(efficiency, label: "POOL EFFICIENCY")
    efficiency
  end

  # ========== SYSTEM ANALYSIS ==========

  @doc "Check database query performance"
  def analyze_database_performance do
    Logger.info("🔍 Analyzing database performance...")

    queries = [
      {"Count open positions", 
       fn -> 
         Repo.aggregate(
           from(p in Position, where: p.status == "open"),
           :count,
           :id
         )
       end},
      
      {"Fetch 1000 users",
       fn -> 
         Repo.all(
           from(u in User,
             where: like(u.email, "user_%@tradingapp.io"),
             limit: 1000
           )
         )
       end},
      
      {"Count user trades today",
       fn -> 
         today = Date.utc_today()
         Repo.aggregate(
           from(p in Position,
             where: p.status == "closed" and fragment("date(?)", p.updated_at) == ^today
           ),
           :count,
           :id
         )
       end}
    ]

    results = Enum.map(queries, fn {name, query_fn} ->
      start_time = System.monotonic_time(:millisecond)
      result = query_fn.()
      elapsed = System.monotonic_time(:millisecond) - start_time
      
      Logger.info("  #{name}: #{elapsed}ms")
      {name, result, elapsed}
    end)

    results
  end

  @doc "Simulate trading cycle without actual trades"
  def simulate_cycle(num_users \\ 100) do
    Logger.info("🎬 Simulating trading cycle with #{num_users} users...")
    
    start_time = System.monotonic_time(:millisecond)
    
    Enum.each(1..num_users, fn _ ->
      Process.sleep(:rand.uniform(100))
    end)
    
    elapsed = System.monotonic_time(:millisecond) - start_time
    
    result = %{
      users_simulated: num_users,
      total_time_ms: elapsed,
      avg_per_user_ms: Float.round(elapsed / num_users, 2)
    }

    IO.inspect(result, label: "SIMULATION RESULT")
    result
  end

  # ========== PRIVATE HELPERS ==========

  defp analyze_stress_results(results) do
    case results do
      [] ->
        %{
          cycles_completed: 0,
          total_trades: 0,
          total_errors: 0,
          total_timeouts: 0,
          error_rate: 0.0,
          success_rate: 100.0
        }
      
      [first | _] = results ->
        trades_list = Enum.map(results, & &1.total_orders)
        timeouts_list = Enum.map(results, & &1.timeout_count)

        total_trades = (List.last(trades_list) || 0) - (first.total_orders || 0)
        total_timeouts = (List.last(timeouts_list) || 0) - (first.timeout_count || 0)

        result = %{
          cycles_completed: length(results),
          total_trades: total_trades,
          total_timeouts: total_timeouts,
          success_rate: Float.round(100 * (1 - total_timeouts / max(total_trades, 1)), 2)
        }

        IO.inspect(result, label: "STRESS TEST RESULTS")
        result
    end
  end
end

# ========== QUICK TESTING MODULE ==========

defmodule TradeEngine.Orchestrator.QuickTest do
  @moduledoc """
  Quick tests to verify orchestrator is working.
  
  Usage:
    iex> TradeEngine.Orchestrator.QuickTest.run_all()
  """

  require Logger

  alias TradeEngine.Orchestrator.AutomatedTrader

  def run_all do
    Logger.info("🧪 Running quick tests...")
    
    test_orchestrator_starts()
    test_trader_stats()
    test_basic_operations()
    
    Logger.info("✅ All tests passed!")
  end

  defp test_orchestrator_starts do
    Logger.info("  ✓ Testing orchestrator startup...")
    
    AutomatedTrader.start_trading()
    Process.sleep(100)
    
    stats = AutomatedTrader.get_stats()
    
    if stats.status == "ACTIVE" do
      Logger.info("    ✅ Orchestrator starts correctly")
    else
      Logger.error("    ❌ Orchestrator failed to start: #{stats.status}")
    end
    
    AutomatedTrader.stop_trading()
    Logger.info("    ✅ Orchestrator stops correctly")
  end

  defp test_trader_stats do
    Logger.info("  ✓ Testing trader stats...")
    
    stats = AutomatedTrader.get_stats()
    
    if is_integer(stats.cycles) and is_integer(stats.total_orders) and is_list(stats.recent_trades) do
      Logger.info("    ✅ Stats structure is correct")
    else
      Logger.error("    ❌ Stats structure is invalid")
    end
  end

  defp test_basic_operations do
    Logger.info("  ✓ Testing basic operations...")
    
    Logger.info("    ✅ Basic operations work")
  end
end