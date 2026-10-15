# ============================================================================
# DEBUG: Test the calculations
# ============================================================================
defmodule TradeEngine.Physics.TestCalculations do
  @moduledoc "Test and validate physics calculations"
  require Logger

  def test_momentum do
    # Test with realistic price data
    prices = [100.0, 100.5, 101.2, 101.8, 102.5, 103.2, 104.0, 104.5, 105.0, 105.3]
    
    momentum = TradeEngine.Physics.VelocityAnalyzer.calculate_momentum(prices)
    
    Logger.info("📊 Test Momentum:")
    Logger.info("   Prices: #{inspect(prices)}")
    Logger.info("   Calculated momentum: #{momentum}")
    Logger.info("   Expected: ~0.5 (positive trend)")
    
    momentum
  end

  def test_gravity do
    # Create mock candles
    candles = [
      %{close: Decimal.new("100.0"), high: Decimal.new("100.5"), low: Decimal.new("99.8")},
      %{close: Decimal.new("100.5"), high: Decimal.new("101.2"), low: Decimal.new("100.2")},
      %{close: Decimal.new("101.2"), high: Decimal.new("101.8"), low: Decimal.new("100.8")},
      %{close: Decimal.new("101.8"), high: Decimal.new("102.5"), low: Decimal.new("101.5")},
      %{close: Decimal.new("102.5"), high: Decimal.new("103.2"), low: Decimal.new("102.0")},
    ]
    
    gravity = TradeEngine.Physics.GravityCalculator.calculate_gravity(candles, nil)
    
    Logger.info("📊 Test Gravity:")
    Logger.info("   Candles: 5 increasing prices")
    Logger.info("   Calculated gravity: #{gravity}")
    Logger.info("   Expected: 0.0001-0.003 (light resistance)")
    
    gravity
  end

  def test_full_analysis do
    # Create realistic test candles
    candles = [
      %{close: Decimal.new("100.0"), high: Decimal.new("100.5"), low: Decimal.new("99.8")},
      %{close: Decimal.new("100.5"), high: Decimal.new("101.2"), low: Decimal.new("100.2")},
      %{close: Decimal.new("101.2"), high: Decimal.new("101.8"), low: Decimal.new("100.8")},
      %{close: Decimal.new("101.8"), high: Decimal.new("102.5"), low: Decimal.new("101.5")},
      %{close: Decimal.new("102.5"), high: Decimal.new("103.2"), low: Decimal.new("102.0")},
      %{close: Decimal.new("103.0"), high: Decimal.new("103.8"), low: Decimal.new("102.5")},
      %{close: Decimal.new("103.5"), high: Decimal.new("104.0"), low: Decimal.new("103.0")},
    ]
    
    case TradeEngine.Physics.MarketProjectile.analyze_projectile(candles, nil) do
      {:ok, physics} ->
        Logger.info("✅ FULL ANALYSIS TEST")
        Logger.info("   Momentum: #{physics.momentum}")
        Logger.info("   Gravity: #{physics.gravity}")
        Logger.info("   Peak Price: #{Float.round(physics.peak_price, 2)}")
        Logger.info("   Peak Time: #{Float.round(physics.peak_time, 1)} candles")
        Logger.info("   Trajectory Angle: #{physics.trajectory_angle}°")
        Logger.info("   Energy State: #{physics.energy_state}")
        physics
      
      {:error, reason} ->
        Logger.error("❌ Analysis failed: #{reason}")
        nil
    end
  end
end