defmodule AdminGatewayWeb.ReconciliationController do
  use AdminGatewayWeb, :controller

  alias TradeEngine.Reconciliation

  @doc "GET /api/reconciliation/positions"
  def positions(conn, _params) do
    case Reconciliation.reconcile_positions() do
      {:ok, result} -> json(conn, %{data: sanitize(result)})
      {:error, reason} -> conn |> put_status(502) |> json(%{error: "Position reconciliation failed: #{inspect(reason)}"})
    end
  end

  @doc "GET /api/reconciliation/orders"
  def orders(conn, _params) do
    case Reconciliation.reconcile_orders() do
      {:ok, result} -> json(conn, %{data: sanitize(result)})
      {:error, reason} -> conn |> put_status(502) |> json(%{error: "Order reconciliation failed: #{inspect(reason)}"})
    end
  end

  @doc "GET /api/reconciliation/balances"
  def balances(conn, _params) do
    case Reconciliation.reconcile_balances() do
      {:ok, result} -> json(conn, %{data: sanitize(result)})
      {:error, reason} -> conn |> put_status(502) |> json(%{error: "Balance reconciliation failed: #{inspect(reason)}"})
    end
  end

  @doc "GET /api/reconciliation/trades/:credential_id?symbol=BTCUSDT&limit=50"
  def trades(conn, %{"credential_id" => credential_id} = params) do
    symbol = params["symbol"]

    if is_nil(symbol) or symbol == "" do
      conn |> put_status(400) |> json(%{error: "symbol query param is required"})
    else
      limit = parse_int(params["limit"], 50)
      case Reconciliation.reconcile_trades(credential_id, symbol, limit) do
        {:ok, result} -> json(conn, %{data: sanitize(result)})
        {:error, reason} -> conn |> put_status(502) |> json(%{error: "Trade reconciliation failed: #{inspect(reason)}"})
      end
    end
  end

  @doc "GET /api/reconciliation/summary"
  def summary(conn, _params) do
    json(conn, %{data: sanitize(Reconciliation.get_summary())})
  end

  defp parse_int(nil, default), do: default
  defp parse_int(s, default) when is_binary(s) do
    case Integer.parse(s) do
      {n, _} -> n
      :error -> default
    end
  end
  defp parse_int(n, _default) when is_integer(n), do: n
  defp parse_int(_, default), do: default

  # Recursively convert raw binary UUIDs and atoms to JSON-safe values
  defp sanitize(map) when is_map(map) do
    Map.new(map, fn {k, v} -> {sanitize_key(k), sanitize(v)} end)
  end
  defp sanitize(list) when is_list(list), do: Enum.map(list, &sanitize/1)
  defp sanitize(bin) when is_binary(bin) do
    if String.printable?(bin), do: bin, else: encode_uuid(bin)
  end
  defp sanitize(atom) when is_atom(atom), do: atom
  defp sanitize(other), do: other

  defp sanitize_key(key) when is_atom(key), do: key
  defp sanitize_key(key) when is_binary(key) do
    if String.printable?(key), do: key, else: encode_uuid(key)
  end
  defp sanitize_key(key), do: key

  defp encode_uuid(<<a::32, b::16, c::16, d::16, e::48>>) do
    :io_lib.format("~8.16.0b-~4.16.0b-~4.16.0b-~4.16.0b-~12.16.0b", [a, b, c, d, e])
    |> to_string()
    |> String.downcase()
  end
  defp encode_uuid(bin), do: Base.encode16(bin, case: :lower)
end
