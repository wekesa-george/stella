# Add this helper module to validate which symbols actually have data

defmodule TradeEngine.Orchestrator.Alpaca.SymbolValidator do
  @moduledoc """
  Validates which crypto symbols have active trading and data availability on Alpaca.
  
  Some symbols may not have 24/7 data or might be delisted.
  """
  require Logger
  alias TradeEngine.Orchestrator.Alpaca.Client

  # Common crypto pairs that should work
  @test_symbols [
    "BTCUSD",
    "ETHUSD",
    "SOLUSD",
    "DOGEUSD",
    "XRPUSD",
    "ADAUSD",
    "AVAXUSD",
    "POLKAUSD",
    "LINKUSD",
    "UNIUSD",
    "MATICUSD",
    "LTCUSD",
    "BCHUSD",
    "XLMUSD",
    "VETOUSD"
  ]

  @doc """
  Check which symbols have available data.
  
  Usage:
    SymbolValidator.validate_all_symbols()
    SymbolValidator.validate_symbol("BTCUSD")
  """
  def validate_all_symbols do
    Logger.info("🔍 Validating #{length(@test_symbols)} symbols...")
    Logger.info("   This may take 30-60 seconds...")
    
    results = @test_symbols
      |> Enum.map(fn symbol ->
        validate_symbol(symbol)
      end)
    
    working = Enum.filter(results, &(&1.status == :ok))
    failed = Enum.filter(results, &(&1.status == :error))
    
    Logger.info("\n✅ WORKING SYMBOLS (#{length(working)}):")
    Enum.each(working, fn r ->
      Logger.info("   ✓ #{r.symbol}: #{r.candles} candles available")
    end)
    
    Logger.info("\n❌ FAILED SYMBOLS (#{length(failed)}):")
    Enum.each(failed, fn r ->
      Logger.info("   ✗ #{r.symbol}: #{r.reason}")
    end)
    
    Logger.info("\n📝 UPDATE your trading pairs list to only use working symbols:")
    working_symbols = Enum.map(working, & &1.symbol) |> Enum.join(", ")
    Logger.info("   #{working_symbols}")
    
    working
  end

  def validate_symbol(symbol) do
    case Client.get_bars(symbol, "1Hour", 5) do
      {:ok, bars} when is_list(bars) and length(bars) > 0 ->
        Logger.info("   ✅ #{symbol}: #{length(bars)} bars")
        %{symbol: symbol, status: :ok, candles: length(bars)}
      
      {:ok, bars} when is_list(bars) ->
        Logger.info("   ⚠️ #{symbol}: empty response")
        %{symbol: symbol, status: :error, reason: "empty_response", candles: 0}
      
      {:error, reason} ->
        Logger.info("   ❌ #{symbol}: #{inspect(reason)}")
        %{symbol: symbol, status: :error, reason: reason, candles: 0}
    end
  end

  @doc "Get only working symbols"
  def get_working_symbols do
    validate_all_symbols()
    |> Enum.map(& &1.symbol)
  end

  @doc "Update AutomatedTrader to use validated symbols"
  def update_trading_pairs do
    working = get_working_symbols()
    
    Logger.info("🔄 Update this function in AutomatedTrader:")
    Logger.info("")
    Logger.info("defp get_alpaca_tradeable_pairs(limit) do")
    Logger.info("  [")
    
    Enum.each(working, fn symbol ->
      Logger.info("    %{symbol: \"#{symbol}\"},")
    end)
    
    Logger.info("  ]")
    Logger.info("  |> Enum.take(limit)")
    Logger.info("end")
  end
end


