defmodule AdminGatewayWeb.CredentialController do
  use AdminGatewayWeb, :controller

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
end
