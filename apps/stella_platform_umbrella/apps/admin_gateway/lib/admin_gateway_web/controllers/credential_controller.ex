defmodule AdminGatewayWeb.CredentialController do
  use AdminGatewayWeb, :controller
  require Logger

  alias TradeEngine.Exchanges.Executor

  @doc """
  GET /api/credentials/:id/balance

  Fetches the live exchange balance for a credential.
  Supports both spot and futures via ?market_type= query param.

  Returns:
    %{
      credential_id: "...",
      total_balance: 1234.56,
      available_balance: 1100.00,
      currency: "USDT",
      market_type: "usds_futures",
      assets: [%{asset: "USDT", wallet_balance: ..., available_balance: ..., unrealized_pnl: ...}],
      fetched_at: "2026-03-07T10:30:00Z"
    }
  """
  def balance(conn, %{"id" => credential_id} = params) do
    market_type = params["market_type"] || "spot"

    case Executor.get_balance(credential_id, market_type: market_type) do
      {:ok, balance_data} ->
        json(conn, %{
          data: Map.merge(balance_data, %{
            credential_id: credential_id,
            fetched_at: DateTime.utc_now() |> DateTime.to_iso8601()
          })
        })

      {:error, :credential_not_found} ->
        conn
        |> put_status(404)
        |> json(%{error: "Credential not found"})

      {:error, :no_futures_url_configured} ->
        conn
        |> put_status(422)
        |> json(%{error: "No futures URL configured for this credential's adapter"})

      {:error, %{code: code, message: msg}} ->
        conn
        |> put_status(502)
        |> json(%{error: "Exchange error: #{msg}", code: code})

      {:error, reason} ->
        conn
        |> put_status(502)
        |> json(%{error: "Failed to fetch balance: #{inspect(reason)}"})
    end
  end

  @doc """
  GET /api/credentials/:id/positions

  Fetches open positions from the exchange for a futures credential.
  Returns the raw position risk data from Binance /fapi/v2/positionRisk.

  Returns:
    %{
      data: %{
        credential_id: "...",
        positions: [%{symbol, position_side, position_amount, entry_price, mark_price,
                      unrealized_pnl, liquidation_price, leverage, margin_type, notional}],
        count: 2,
        fetched_at: "..."
      }
    }
  """
  def positions(conn, %{"id" => credential_id}) do
    case Executor.get_position_risk(credential_id) do
      {:ok, positions} when is_list(positions) ->
        json(conn, %{
          data: %{
            credential_id: credential_id,
            positions: positions,
            count: length(positions),
            fetched_at: DateTime.utc_now() |> DateTime.to_iso8601()
          }
        })

      {:error, :credential_not_found} ->
        conn |> put_status(404) |> json(%{error: "Credential not found"})

      {:error, :position_risk_not_supported} ->
        conn |> put_status(422) |> json(%{error: "Position risk not supported for this adapter"})

      {:error, %{code: code, message: msg}} ->
        conn |> put_status(502) |> json(%{error: "Exchange error: #{msg}", code: code})

      {:error, reason} ->
        conn |> put_status(502) |> json(%{error: "Failed to fetch positions: #{inspect(reason)}"})
    end
  end

  @doc """
  POST /api/credentials/:id/positions/close-all

  Closes all open futures positions for a credential by placing market orders
  in the opposite direction.

  Returns:
    %{
      data: %{
        credential_id: "...",
        results: [%{symbol, side, quantity, status, ...}],
        closed: 2,
        failed: 0
      }
    }
  """
  def close_all_positions(conn, %{"id" => credential_id}) do
    with {:ok, positions} when is_list(positions) <- Executor.get_position_risk(credential_id) do
      if positions == [] do
        json(conn, %{data: %{credential_id: credential_id, results: [], closed: 0, failed: 0, message: "No open positions"}})
      else
        results = Enum.map(positions, fn pos ->
          symbol = pos.symbol || pos[:symbol]
          raw_amount = parse_float(pos.position_amount || pos[:position_amount])
          amount = abs(raw_amount)
          entry = parse_float(pos.entry_price || pos[:entry_price])
          position_side = to_string(pos.position_side || pos[:position_side] || "") |> String.upcase()

          # Determine actual side: negative positionAmt = SHORT, positive = LONG
          # position_side "BOTH" means one-way mode — use the sign of positionAmt
          side = cond do
            position_side == "SHORT" -> "SHORT"
            position_side == "LONG" -> "LONG"
            raw_amount < 0 -> "SHORT"
            true -> "LONG"
          end

          cond do
            amount == 0.0 ->
              %{symbol: symbol, status: "skipped", reason: "zero quantity"}

            side == "SHORT" ->
              cancel_open_orders(credential_id, symbol)
              case Executor.close_short(credential_id, symbol, amount, entry, market_type: "usds_futures") do
                {:ok, result} -> Map.merge(%{symbol: symbol, side: "SHORT", status: "closed"}, result)
                {:error, reason} -> %{symbol: symbol, side: "SHORT", status: "failed", error: inspect(reason)}
              end

            true ->
              cancel_open_orders(credential_id, symbol)
              case Executor.close_long(credential_id, symbol, amount, entry, market_type: "usds_futures") do
                {:ok, result} -> Map.merge(%{symbol: symbol, side: "LONG", status: "closed"}, result)
                {:error, reason} -> %{symbol: symbol, side: "LONG", status: "failed", error: inspect(reason)}
              end
          end
        end)

        closed = Enum.count(results, &(&1.status == "closed"))
        failed = Enum.count(results, &(&1.status == "failed"))

        json(conn, %{
          data: %{
            credential_id: credential_id,
            results: results,
            closed: closed,
            failed: failed
          }
        })
      end
    else
      {:error, :credential_not_found} ->
        conn |> put_status(404) |> json(%{error: "Credential not found"})

      {:error, :position_risk_not_supported} ->
        conn |> put_status(422) |> json(%{error: "Position risk not supported for this adapter"})

      {:error, reason} ->
        conn |> put_status(502) |> json(%{error: "Failed to fetch positions: #{inspect(reason)}"})
    end
  end

  @doc """
  POST /api/credentials/:id/positions/close

  Closes a single futures position by symbol.
  Body: {"symbol": "BTCUSDT_260327", "side": "LONG", "quantity": 0.109, "entry_price": 71786.16}

  If quantity is omitted, fetches position risk to get current amount.
  """
  def close_position(conn, %{"id" => credential_id} = params) do
    symbol = params["symbol"]

    if is_nil(symbol) or symbol == "" do
      conn |> put_status(400) |> json(%{error: "symbol is required"})
    else
      # Get current position details from exchange if quantity not provided
      {quantity, entry, side} = case {params["quantity"], params["entry_price"], params["side"]} do
        {q, e, s} when not is_nil(q) and not is_nil(e) and not is_nil(s) ->
          {parse_float(q), parse_float(e), String.upcase(to_string(s))}

        _ ->
          # Fetch from exchange
          case Executor.get_position_risk(credential_id, symbol: symbol) do
            {:ok, [pos | _]} ->
              raw_amt = parse_float(pos.position_amount)
              ep = parse_float(pos.entry_price)
              ps = to_string(pos.position_side || "") |> String.upcase()
              # Determine side from positionAmt sign (negative = short) or explicit position_side
              sd = cond do
                ps == "SHORT" -> "SHORT"
                ps == "LONG" -> "LONG"
                raw_amt < 0 -> "SHORT"
                true -> "LONG"
              end
              {abs(raw_amt), ep, sd}

            _ ->
              {0.0, 0.0, "LONG"}
          end
      end

      if quantity == 0.0 do
        conn |> put_status(400) |> json(%{error: "No open position found for #{symbol}"})
      else
        # Cancel all open orders for this symbol first to avoid -2025 max open order limit
        cancel_open_orders(credential_id, symbol)

        result = if side == "SHORT" do
          Executor.close_short(credential_id, symbol, quantity, entry, market_type: "usds_futures")
        else
          Executor.close_long(credential_id, symbol, quantity, entry, market_type: "usds_futures")
        end

        case result do
          {:ok, data} ->
            json(conn, %{
              data: Map.merge(%{symbol: symbol, side: side, quantity: quantity, status: "closed"}, data)
            })

          {:error, %{code: code, message: msg}} ->
            conn |> put_status(502) |> json(%{error: "Exchange error: #{msg}", code: code})

          {:error, reason} ->
            conn |> put_status(502) |> json(%{error: "Failed to close position: #{inspect(reason)}"})
        end
      end
    end
  end

  defp cancel_open_orders(credential_id, symbol) do
    case Executor.get_open_orders(credential_id, symbol, market_type: "usds_futures") do
      {:ok, orders} when is_list(orders) and orders != [] ->
        Enum.each(orders, fn order ->
          order_id = order[:order_id] || order["order_id"] || order["orderId"]
          if order_id do
            Executor.cancel_order(credential_id, symbol, order_id, market_type: "usds_futures")
          end
        end)
        Logger.info("[CredentialController] Cancelled #{length(orders)} open orders for #{symbol} before closing position")
      _ ->
        :ok
    end
  end

  defp parse_float(nil), do: 0.0
  defp parse_float(n) when is_number(n), do: n * 1.0
  defp parse_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> 0.0
    end
  end
end
