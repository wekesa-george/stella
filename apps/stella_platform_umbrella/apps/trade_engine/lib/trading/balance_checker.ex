defmodule TradeEngine.Trading.BalanceChecker do
  @moduledoc """
  Checks Binance account balance before executing trades
  """
  require Logger
  alias TradeEngine.Orchestrator.BinanceClient

  @binance_testnet_url "https://testnet.binance.vision/api"
  @min_balance_usdt 100.0

  @doc """
  Check if account has sufficient balance for trading
  Returns {:ok, balance_info} or {:error, reason}
  """
  def check_trading_balance do
    case fetch_account_balance() do
      {:ok, balances} ->
        usdt_balance = get_usdt_balance(balances)
        
        if usdt_balance >= @min_balance_usdt do
          Logger.info("✅ Sufficient balance: $#{Float.round(usdt_balance, 2)} USDT")
          {:ok, %{usdt: usdt_balance, balances: balances}}
        else
          Logger.warning("⚠️ Insufficient balance: $#{Float.round(usdt_balance, 2)} USDT (min: $#{@min_balance_usdt})")
          {:error, :insufficient_balance}
        end

      {:error, reason} = error ->
        Logger.error("❌ Failed to fetch balance: #{inspect(reason)}")
        error
    end
  end

  @doc """
  Check if account has enough balance for a specific trade
  """
  def has_sufficient_balance_for_trade?(symbol, quantity, side \\ :buy) do
    case fetch_account_balance() do
      {:ok, balances} ->
        case get_required_balance(symbol, quantity, side, balances) do
          {:ok, required, available} ->
            if available >= required do
              {:ok, %{required: required, available: available}}
            else
              {:error, :insufficient_balance, %{required: required, available: available}}
            end

          {:error, reason} ->
            {:error, reason}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Get full account balance details
  """
  def get_account_info do
    case BinanceClient.get_account_info() do
      {:ok, account_info} ->
        balances = account_info["balances"]
          |> Enum.filter(fn b -> 
            String.to_float(b["free"]) > 0 or String.to_float(b["locked"]) > 0
          end)
          |> Enum.map(fn b ->
            %{
              asset: b["asset"],
              free: String.to_float(b["free"]),
              locked: String.to_float(b["locked"]),
              total: String.to_float(b["free"]) + String.to_float(b["locked"])
            }
          end)

        {:ok, %{
          balances: balances,
          usdt: get_usdt_balance(account_info["balances"]),
          can_trade: account_info["canTrade"],
          permissions: account_info["permissions"]
        }}

      error ->
        error
    end
  end

  @doc """
  Log all non-zero balances
  """
  def log_all_balances do
    case get_account_info() do
      {:ok, info} ->
        Logger.info("\n" <> String.duplicate("=", 50))
        Logger.info("💰 ACCOUNT BALANCES")
        Logger.info(String.duplicate("=", 50))
        
        if Enum.empty?(info.balances) do
          Logger.warning("⚠️ NO BALANCES FOUND")
          Logger.info("📝 To fund testnet account:")
          Logger.info("   1. Visit: https://testnet.binance.vision/")
          Logger.info("   2. Login and use the faucet")
          Logger.info("   3. Get free USDT, BTC, etc.")
        else
          Enum.each(info.balances, fn b ->
            Logger.info("   #{b.asset}: #{Float.round(b.total, 8)} (Free: #{Float.round(b.free, 8)})")
          end)
        end
        
        Logger.info(String.duplicate("=", 50) <> "\n")
        {:ok, info}

      {:error, reason} = error ->
        Logger.error("❌ Failed to fetch balances: #{inspect(reason)}")
        error
    end
  end

  # Private functions

  defp fetch_account_balance do
    case BinanceClient.get_account_info() do
      {:ok, account_info} ->
        {:ok, account_info["balances"]}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp get_usdt_balance(balances) when is_list(balances) do
    balances
    |> Enum.find(fn b -> b["asset"] == "USDT" end)
    |> case do
      nil -> 0.0
      balance -> String.to_float(balance["free"])
    end
  end

  defp get_required_balance(symbol, quantity, side, balances) do
    case side do
      :buy ->
        # For BUY orders, need USDT (quote currency)
        case get_current_price(symbol) do
          {:ok, price} ->
            required = quantity * price
            available = get_usdt_balance(balances)
            {:ok, required, available}

          error ->
            error
        end

      :sell ->
        # For SELL orders, need the base currency
        base_asset = String.replace(symbol, "USDT", "")
        available = balances
          |> Enum.find(fn b -> b["asset"] == base_asset end)
          |> case do
            nil -> 0.0
            balance -> String.to_float(balance["free"])
          end

        {:ok, quantity, available}
    end
  end

  defp get_current_price(symbol) do
    url = "#{@binance_testnet_url}/v3/ticker/price?symbol=#{symbol}"

    case HTTPoison.get(url, [], timeout: 2000, recv_timeout: 2000) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"price" => price_str}} ->
            {:ok, String.to_float(price_str)}
          {:error, _} ->
            {:error, :decode_error}
        end

      {:ok, %HTTPoison.Response{status_code: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end
end