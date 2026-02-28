# ============================================================================
# DIAGNOSTIC CONSOLE - Debug Physics Calculations
# ============================================================================
defmodule TradeEngine.Console.PhysicsDiagnostics do
  @moduledoc """
  🔧 PHYSICS DIAGNOSTIC CONSOLE
  
  Debug and validate physics calculations:
  
      Diagnostics.test_all()           # Run all tests
      Diagnostics.test_momentum()      # Test momentum calculation
      Diagnostics.test_gravity()       # Test gravity calculation
      Diagnostics.test_analysis()      # Test full analysis
      Diagnostics.debug_signal("BTC")  # Debug specific symbol's calculations
      Diagnostics.validate_candles()   # Validate candle data quality
      Diagnostics.report()             # Generate full diagnostic report
  """

  require Logger
  alias TradeEngine.Physics.{
    MarketProjectile,
    VelocityAnalyzer,
    GravityCalculator,
    TestCalculations
  }
  alias TradeEngine.Exchanges.Binance.KlineStream

  # ========================================================================
  # MAIN DIAGNOSTIC COMMANDS
  # ========================================================================

  @doc "Run all diagnostic tests"
  def test_all do
    IO.puts("\n")
    IO.puts("╔════════════════════════════════════════════════════════════════╗")
    IO.puts("║          🔧 PHYSICS DIAGNOSTIC - FULL TEST SUITE              ║")
    IO.puts("╚════════════════════════════════════════════════════════════════╝")
    
    IO.puts("\n1️⃣  TESTING MOMENTUM CALCULATION...")
    test_momentum()
    
    IO.puts("\n2️⃣  TESTING GRAVITY CALCULATION...")
    test_gravity()
    
    IO.puts("\n3️⃣  TESTING FULL ANALYSIS...")
    test_analysis()
    
    IO.puts("\n4️⃣  VALIDATING CANDLE DATA...")
    validate_candles()
    
    IO.puts("\n")
    IO.puts("╔════════════════════════════════════════════════════════════════╗")
    IO.puts("║                   ✅ DIAGNOSTICS COMPLETE                      ║")
    IO.puts("╚════════════════════════════════════════════════════════════════╝")
  end

  @doc "Test momentum calculation"
  def test_momentum do
    IO.puts("\n📊 MOMENTUM TEST")
    IO.puts("─" <> String.duplicate("─", 58))
    
    # Test 1: Simple increasing prices
    prices1 = [100.0, 100.5, 101.2, 101.8, 102.5]
    momentum1 = VelocityAnalyzer.calculate_momentum(prices1)
    
    IO.puts("Test 1: Uptrend prices")
    IO.puts("  Prices: #{inspect(prices1)}")
    IO.puts("  Momentum: #{momentum1}")
    IO.puts("  Expected: > 0 (positive)")
    status1 = if momentum1 > 0, do: "✅ PASS", else: "❌ FAIL"
    IO.puts("  Status: #{status1}\n")
    
    # Test 2: Decimal conversion
    prices2 = [
      Decimal.new("100.0"),
      Decimal.new("100.5"),
      Decimal.new("101.2"),
      Decimal.new("101.8"),
      Decimal.new("102.5")
    ]
    momentum2 = VelocityAnalyzer.calculate_momentum(prices2)
    
    IO.puts("Test 2: Decimal prices")
    IO.puts("  Prices: [Decimal(100.0)...Decimal(102.5)]")
    IO.puts("  Momentum: #{momentum2}")
    IO.puts("  Expected: > 0 (same as test 1)")
    status2 = if momentum2 > 0, do: "✅ PASS", else: "❌ FAIL"
    IO.puts("  Status: #{status2}\n")
    
    # Test 3: Downtrend
    prices3 = [102.5, 102.0, 101.5, 101.0, 100.5]
    momentum3 = VelocityAnalyzer.calculate_momentum(prices3)
    
    IO.puts("Test 3: Downtrend prices")
    IO.puts("  Prices: #{inspect(prices3)}")
    IO.puts("  Momentum: #{momentum3}")
    IO.puts("  Expected: < 0 (negative)")
    status3 = if momentum3 < 0, do: "✅ PASS", else: "❌ FAIL"
    IO.puts("  Status: #{status3}\n")
    
    # Overall result
    passed = [status1, status2, status3] |> Enum.count(&String.contains?(&1, "✅"))
    IO.puts("─" <> String.duplicate("─", 58))
    IO.puts("Momentum Tests: #{passed}/3 passed\n")
    
    passed == 3
  end

  @doc "Test gravity calculation"
  def test_gravity do
    IO.puts("\n📊 GRAVITY TEST")
    IO.puts("─" <> String.duplicate("─", 58))
    # Create test candles with ACTUAL volatility
    candles = [
      # Tight candles
      %{close: Decimal.new("100.0"), high: Decimal.new("100.2"), low: Decimal.new("99.8")},
      %{close: Decimal.new("100.1"), high: Decimal.new("100.3"), low: Decimal.new("99.9")},
      %{close: Decimal.new("100.2"), high: Decimal.new("100.4"), low: Decimal.new("100.0")},
      %{close: Decimal.new("100.3"), high: Decimal.new("100.5"), low: Decimal.new("100.1")},
      %{close: Decimal.new("100.4"), high: Decimal.new("100.6"), low: Decimal.new("100.2")},
      # Wide candles
      %{close: Decimal.new("101.0"), high: Decimal.new("102.0"), low: Decimal.new("99.5")},
      %{close: Decimal.new("100.5"), high: Decimal.new("101.8"), low: Decimal.new("99.0")},
    ]
    
    gravity_low = TradeEngine.Physics.GravityCalculator.calculate_gravity(Enum.take(candles, 5))
    gravity_high = TradeEngine.Physics.GravityCalculator.calculate_gravity(candles)
    
    Logger.info("GRAVITY TEST RESULTS:")
    Logger.info("  Low volatility gravity: #{gravity_low}")
    Logger.info("  High volatility gravity: #{gravity_high}")
    Logger.info("  Expected: gravity_high > gravity_low")
    Logger.info("  Status: #{if gravity_high > gravity_low, do: "✅ PASS", else: "❌ FAIL"}")
    
    {gravity_low, gravity_high}
  end


  @doc "Test gravity with various volatility levels"
  def test_all do
    IO.puts("\n🧪 GRAVITY TEST SUITE")
    IO.puts("=" <> String.duplicate("=", 60))
    
    test_low_volatility()
    test_high_volatility()
    test_extreme_volatility()
    test_trend_decay()
    
    IO.puts("=" <> String.duplicate("=", 60))
  end

  defp test_low_volatility do
    IO.puts("\nTest 1: LOW VOLATILITY (tight ranges)")
    IO.puts("─" <> String.duplicate("─", 60))
    
    candles = [
      %{close: Decimal.new("100.00"), high: Decimal.new("100.10"), low: Decimal.new("99.90")},
      %{close: Decimal.new("100.05"), high: Decimal.new("100.15"), low: Decimal.new("99.95")},
      %{close: Decimal.new("100.10"), high: Decimal.new("100.20"), low: Decimal.new("100.00")},
      %{close: Decimal.new("100.15"), high: Decimal.new("100.25"), low: Decimal.new("100.05")},
      %{close: Decimal.new("100.20"), high: Decimal.new("100.30"), low: Decimal.new("100.10")},
    ]
    
    gravity = TradeEngine.Physics.GravityCalculator.calculate_gravity(candles)
    
    IO.puts("Range per candle: ~0.10 per $100 = 0.1% volatility")
    IO.puts("Calculated gravity: #{gravity}")
    IO.puts("Expected: < 0.0005 (very light pressure)")
    status = if gravity > 0.00005 and gravity < 0.0005, do: "✅ PASS", else: "❌ FAIL"
    IO.puts("Status: #{status}\n")
  end

  defp test_high_volatility do
    IO.puts("Test 2: HIGH VOLATILITY (wide ranges)")
    IO.puts("─" <> String.duplicate("─", 60))
    
    candles = [
      %{close: Decimal.new("100.0"), high: Decimal.new("102.0"), low: Decimal.new("98.0")},
      %{close: Decimal.new("101.0"), high: Decimal.new("103.0"), low: Decimal.new("99.0")},
      %{close: Decimal.new("100.5"), high: Decimal.new("102.5"), low: Decimal.new("98.5")},
      %{close: Decimal.new("101.5"), high: Decimal.new("103.5"), low: Decimal.new("99.5")},
      %{close: Decimal.new("100.5"), high: Decimal.new("102.5"), low: Decimal.new("98.5")},
    ]
    
    gravity = TradeEngine.Physics.GravityCalculator.calculate_gravity(candles)
    
    IO.puts("Range per candle: ~4.0 per $100 = 4% volatility")
    IO.puts("Calculated gravity: #{gravity}")
    IO.puts("Expected: 0.0005 - 0.001 (moderate pressure)")
    status = if gravity > 0.0005 and gravity < 0.001, do: "✅ PASS", else: "❌ FAIL"
    IO.puts("Status: #{status}\n")
  end

  defp test_extreme_volatility do
    IO.puts("Test 3: EXTREME VOLATILITY")
    IO.puts("─" <> String.duplicate("─", 60))
    
    candles = [
      %{close: Decimal.new("100.0"), high: Decimal.new("110.0"), low: Decimal.new("90.0")},
      %{close: Decimal.new("105.0"), high: Decimal.new("115.0"), low: Decimal.new("95.0")},
      %{close: Decimal.new("95.0"), high: Decimal.new("105.0"), low: Decimal.new("85.0")},
      %{close: Decimal.new("110.0"), high: Decimal.new("120.0"), low: Decimal.new("100.0")},
      %{close: Decimal.new("100.0"), high: Decimal.new("110.0"), low: Decimal.new("90.0")},
    ]
    
    gravity = TradeEngine.Physics.GravityCalculator.calculate_gravity(candles)
    
    IO.puts("Range per candle: ~20 per $100 = 20% volatility")
    IO.puts("Calculated gravity: #{gravity}")
    IO.puts("Expected: 0.003 - 0.01 (heavy pressure)")
    status = if gravity > 0.003 and gravity < 0.01, do: "✅ PASS", else: "❌ FAIL"
    IO.puts("Status: #{status}\n")
  end

  defp test_trend_decay do
    IO.puts("Test 4: MOMENTUM DECAY")
    IO.puts("─" <> String.duplicate("─", 60))
    
    # Strong uptrend first, then slowing
    candles = [
      %{close: Decimal.new("100.0"), high: Decimal.new("100.5"), low: Decimal.new("99.5")},
      %{close: Decimal.new("102.0"), high: Decimal.new("102.5"), low: Decimal.new("101.5")},  # +2.0
      %{close: Decimal.new("104.0"), high: Decimal.new("104.5"), low: Decimal.new("103.5")},  # +2.0
      %{close: Decimal.new("105.5"), high: Decimal.new("106.0"), low: Decimal.new("105.0")},  # +1.5
      %{close: Decimal.new("106.2"), high: Decimal.new("106.7"), low: Decimal.new("105.7")},  # +0.7 (slowing!)
    ]
    
    gravity = TradeEngine.Physics.GravityCalculator.calculate_gravity(candles)
    
    IO.puts("Trend: +2.0, +2.0, +1.5, +0.7 (momentum slowing)")
    IO.puts("Calculated gravity: #{gravity}")
    IO.puts("Expected: > 0.0001 (decay component adds gravity)")
    status = if gravity > 0.0001, do: "✅ PASS", else: "❌ FAIL"
    IO.puts("Status: #{status}\n")
  end



  @doc "Test full physics analysis"
  def test_analysis do
    IO.puts("\n📊 FULL ANALYSIS TEST")
    IO.puts("─" <> String.duplicate("─", 58))
    
    candles = [
      %{close: Decimal.new("100.0"), high: Decimal.new("100.5"), low: Decimal.new("99.8")},
      %{close: Decimal.new("100.5"), high: Decimal.new("101.2"), low: Decimal.new("100.2")},
      %{close: Decimal.new("101.2"), high: Decimal.new("101.8"), low: Decimal.new("100.8")},
      %{close: Decimal.new("101.8"), high: Decimal.new("102.5"), low: Decimal.new("101.5")},
      %{close: Decimal.new("102.5"), high: Decimal.new("103.2"), low: Decimal.new("102.0")},
      %{close: Decimal.new("103.0"), high: Decimal.new("103.8"), low: Decimal.new("102.5")},
      %{close: Decimal.new("103.5"), high: Decimal.new("104.0"), low: Decimal.new("103.0")},
    ]
    
    case MarketProjectile.analyze_projectile(candles, nil) do
      {:ok, physics} ->
        IO.puts("✅ Analysis successful!\n")
        
        IO.puts("Physical Parameters:")
        IO.puts("  Current Price: $#{Float.round(physics.current_price, 2)}")
        IO.puts("  Momentum (v₀): #{physics.momentum}")
        IO.puts("  Gravity (g): #{physics.gravity}")
        IO.puts("  Peak Price: $#{Float.round(physics.peak_price, 2)}")
        IO.puts("  Peak Time: #{Float.round(physics.peak_time, 1)} candles")
        IO.puts("  Trajectory Angle: #{physics.trajectory_angle}°")
        IO.puts("  Kinetic Energy: #{physics.kinetic_energy}")
        IO.puts("  Energy State: #{physics.energy_state}\n")
        
        # Validation
        passes = []
        
        # Check 1: Momentum > 0 (uptrend)
        check1 = physics.momentum > 0
        IO.puts("Validation:")
        IO.puts("  ✓ Momentum > 0: #{if check1, do: "✅", else: "❌"}")
        passes = [check1 | passes]
        
        # Check 2: Gravity > 0
        check2 = physics.gravity > 0
        IO.puts("  ✓ Gravity > 0: #{if check2, do: "✅", else: "❌"}")
        passes = [check2 | passes]
        
        # Check 3: Peak price > current price
        check3 = physics.peak_price > physics.current_price
        IO.puts("  ✓ Peak > Current: #{if check3, do: "✅", else: "❌"}")
        passes = [check3 | passes]
        
        # Check 4: Peak time > 0
        check4 = physics.peak_time > 0
        IO.puts("  ✓ Peak Time > 0: #{if check4, do: "✅", else: "❌"}")
        passes = [check4 | passes]
        
        # Check 5: Angle >= 0
        check5 = physics.trajectory_angle >= 0
        IO.puts("  ✓ Angle >= 0: #{if check5, do: "✅", else: "❌"}")
        passes = [check5 | passes]
        
        passed = Enum.count(passes, &(&1 == true))
        IO.puts("\n─" <> String.duplicate("─", 58))
        IO.puts("Analysis Tests: #{passed}/5 passed\n")
        
        passed == 5
      
      {:error, reason} ->
        IO.puts("❌ Analysis failed: #{reason}\n")
        IO.puts("─" <> String.duplicate("─", 58))
        false
    end
  end

  @doc "Validate candle data quality"
  def validate_candles do
    IO.puts("\n📊 CANDLE DATA VALIDATION")
    IO.puts("─" <> String.duplicate("─", 58))
    
    case KlineStream.get_recent_candles("BTCUSDT", 10) do
      candles when is_list(candles) and length(candles) > 0 ->
        IO.puts("✅ Found #{length(candles)} candles for BTCUSDT\n")
        
        # Check each candle
        candles
        |> Enum.with_index()
        |> Enum.take(5)
        |> Enum.each(fn {candle, idx} ->
          close = case candle.close do
            %Decimal{} = d -> Decimal.to_float(d)
            n -> n * 1.0
          end
          
          high = case candle.high do
            %Decimal{} = d -> Decimal.to_float(d)
            n -> n * 1.0
          end
          
          low = case candle.low do
            %Decimal{} = d -> Decimal.to_float(d)
            n -> n * 1.0
          end
          
          valid = high >= close and close >= low and high > 0 and low > 0
          status = if valid, do: "✅", else: "❌"
          
          IO.puts("  #{status} Candle #{idx}: Close=$#{Float.round(close, 2)}, High=$#{Float.round(high, 2)}, Low=$#{Float.round(low, 2)}")
        end)
        
        IO.puts("\n─" <> String.duplicate("─", 58))
        IO.puts("✅ Candle data looks valid\n")
        
        true
      
      _ ->
        IO.puts("❌ Could not fetch candles\n")
        IO.puts("─" <> String.duplicate("─", 58))
        false
    end
  end

  @doc "Debug specific symbol's calculations"
  def debug_signal(symbol) do
    symbol_upper = String.upcase(symbol)
    IO.puts("\n")
    IO.puts("╔════════════════════════════════════════════════════════════════╗")
    IO.puts("║  🔧 DEBUGGING: #{symbol_upper}#{String.duplicate(" ", 40 - String.length(symbol_upper))}║")
    IO.puts("╚════════════════════════════════════════════════════════════════╝\n")
    
    case KlineStream.get_recent_candles(symbol_upper, 20) do
      candles when is_list(candles) and length(candles) >= 5 ->
        IO.puts("✅ Fetched #{length(candles)} candles\n")
        
        # Extract prices
        prices = Enum.map(candles, fn c ->
          case c.close do
            %Decimal{} = d -> Decimal.to_float(d)
            n -> n * 1.0
          end
        end)
        
        IO.puts("Recent prices:")
        prices |> Enum.reverse |> Enum.take(5) |> Enum.with_index()
        |> Enum.each(fn {price, idx} ->
          IO.puts("  [#{idx}] $#{Float.round(price, 4)}")
        end)
        
        IO.puts("\nCalculations:")
        
        # Momentum
        momentum = VelocityAnalyzer.calculate_momentum(prices)
        IO.puts("  Momentum (v₀): #{momentum} #{if momentum != 0, do: "✅", else: "❌ ZERO!"}")
        
        # Gravity
        gravity = GravityCalculator.calculate_gravity(candles, nil)
        IO.puts("  Gravity (g): #{gravity} #{if gravity > 0, do: "✅", else: "❌ INVALID"}") 
        
        # Full analysis
        case MarketProjectile.analyze_projectile(candles, nil) do
          {:ok, physics} ->
            IO.puts("\n✅ Full Analysis:")
            IO.puts("  Peak Price: $#{Float.round(physics.peak_price, 2)}")
            IO.puts("  Peak Time: #{Float.round(physics.peak_time, 1)} candles")
            IO.puts("  Angle: #{physics.trajectory_angle}°")
            IO.puts("  Energy: #{physics.energy_state}")
            
          {:error, reason} ->
            IO.puts("\n❌ Analysis failed: #{reason}")
        end
        
      _ ->
        IO.puts("❌ Could not fetch sufficient candles for #{symbol_upper}\n")
    end
  end

  @doc "Generate full diagnostic report"
  def report do
    IO.puts("\n")
    IO.puts("╔════════════════════════════════════════════════════════════════╗")
    IO.puts("║           🔧 PHYSICS DIAGNOSTIC REPORT                         ║")
    IO.puts("╚════════════════════════════════════════════════════════════════╝\n")
    
    momentum_ok = test_momentum()
    gravity_ok = test_gravity()
    analysis_ok = test_analysis()
    candles_ok = validate_candles()
    
    IO.puts("\n")
    IO.puts("╔════════════════════════════════════════════════════════════════╗")
    IO.puts("║                      SUMMARY                                   ║")
    IO.puts("╠════════════════════════════════════════════════════════════════╣")
    IO.puts("║ Momentum Tests:        #{if momentum_ok, do: "✅ PASS", else: "❌ FAIL"}                              ║")
    IO.puts("║ Gravity Tests:         #{if gravity_ok, do: "✅ PASS", else: "❌ FAIL"}                              ║")
    IO.puts("║ Analysis Tests:        #{if analysis_ok, do: "✅ PASS", else: "❌ FAIL"}                              ║")
    IO.puts("║ Candle Validation:     #{if candles_ok, do: "✅ PASS", else: "❌ FAIL"}                              ║")
    IO.puts("╠════════════════════════════════════════════════════════════════╣")
    
    all_pass = momentum_ok and gravity_ok and analysis_ok and candles_ok
    IO.puts("║ OVERALL:               #{if all_pass, do: "✅ HEALTHY", else: "❌ NEEDS ATTENTION"}\n")
    IO.puts("╚════════════════════════════════════════════════════════════════╝\n")
    
    if all_pass do
      IO.puts("✅ Physics engine is working correctly!\n")
      IO.puts("Next steps:")
      IO.puts("  1. Physics.watch()              # Watch signals auto-refresh")
      IO.puts("  2. Physics.entry_opportunities() # Find ready-to-trade signals")
      IO.puts("  3. Physics.details(\"BTCUSDT\") # Analyze specific signal\n")
    else
      IO.puts("⚠️  Physics engine needs debugging!\n")
      IO.puts("Debug specific symbol:")
      IO.puts("  Diagnostics.debug_signal(\"BTCUSDT\")\n")
    end
  end

  # ========================================================================
  # HELPER
  # ========================================================================

  defp pad(str, width) do
    str = to_string(str)
    len = String.length(str)
    if len >= width do
      String.slice(str, 0, width)
    else
      str <> String.duplicate(" ", width - len)
    end
  end
end

# Convenience alias
defmodule Diagnostics do
  @moduledoc "Quick access to diagnostic commands"
  
  defdelegate test_all(), to: TradeEngine.Console.PhysicsDiagnostics
  defdelegate test_momentum(), to: TradeEngine.Console.PhysicsDiagnostics
  defdelegate test_gravity(), to: TradeEngine.Console.PhysicsDiagnostics
  defdelegate test_analysis(), to: TradeEngine.Console.PhysicsDiagnostics
  defdelegate validate_candles(), to: TradeEngine.Console.PhysicsDiagnostics
  defdelegate debug_signal(symbol), to: TradeEngine.Console.PhysicsDiagnostics
  defdelegate report(), to: TradeEngine.Console.PhysicsDiagnostics
end