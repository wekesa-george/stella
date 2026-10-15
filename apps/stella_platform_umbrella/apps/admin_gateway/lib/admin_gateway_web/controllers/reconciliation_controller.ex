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

  @doc "POST /api/reconciliation/cancel-orphans — Cancel exchange orders not in DB"
  @doc "POST /api/reconciliation/recover-orders — Recover exchange orders back to DB (only for running bots within grid range)"
  def recover_orders(conn, _params) do
    case Reconciliation.reconcile_orders() do
      {:ok, %{missing_db: orphans}} when is_list(orphans) and length(orphans) > 0 ->
        # Get running bots with their configs
        running_bots = try do
          TradeEngine.Bots.BotRegistry.list_bots()
          |> Enum.filter(fn b -> Map.get(b, :status) in ["running", "initializing"] end)
          |> Map.new(fn b -> {Map.get(b, :id), b} end)
        rescue
          _ -> %{}
        end

        results = Enum.map(orphans, fn order ->
          coid = order[:client_order_id] || ""
          # Extract bot_id from clientOrderId prefix (first 8 chars)
          bot_prefix = if String.length(coid) >= 8, do: String.slice(coid, 0, 8), else: nil

          # Find matching running bot
          bot = if bot_prefix do
            Enum.find_value(running_bots, fn {bot_id, bot} ->
              if String.starts_with?(bot_id, bot_prefix), do: bot
            end)
          end

          cond do
            is_nil(bot) ->
              %{exchange_order_id: order[:exchange_order_id], symbol: order[:symbol], status: "skipped", reason: "bot not running"}

            true ->
              # Check if order price falls within bot's grid range
              config = Map.get(bot, :config, %{})
              upper = config["upper_price"] || 0
              lower = config["lower_price"] || 0
              price = order[:price] || 0

              if upper > 0 and lower > 0 and price >= lower and price <= upper do
                # Recover: create DB order record
                bot_id = Map.get(bot, :id)
                order_attrs = %{
                  symbol: List.first(Map.get(bot, :trading_pairs, [])) || order[:symbol],
                  side: to_string(order[:side] || "") |> String.downcase(),
                  order_type: "limit",
                  quantity: to_decimal(order[:quantity]),
                  price: to_decimal(order[:price]),
                  limit_price: to_decimal(order[:price]),
                  status: "open",
                  submitted_at: DateTime.utc_now(),
                  exchange_order_id: to_string(order[:exchange_order_id]),
                  client_order_id: coid,
                  bot_id: bot_id,
                  credential_id: Map.get(bot, :credential_id),
                  user_id: Map.get(bot, :user_id),
                  strategy_id: Map.get(bot, :strategy_id),
                  metadata: %{"recovered" => true, "recovered_at" => DateTime.to_iso8601(DateTime.utc_now())}
                }

                case TradeEngine.Repo.insert(TradeEngine.Trading.Order.changeset(%TradeEngine.Trading.Order{}, order_attrs)) do
                  {:ok, _} -> %{exchange_order_id: order[:exchange_order_id], symbol: order[:symbol], price: order[:price], status: "recovered"}
                  {:error, err} -> %{exchange_order_id: order[:exchange_order_id], symbol: order[:symbol], status: "failed", reason: inspect(err)}
                end
              else
                %{exchange_order_id: order[:exchange_order_id], symbol: order[:symbol], price: price, status: "skipped", reason: "outside grid range (#{lower}-#{upper})"}
              end
          end
        end)

        recovered = Enum.count(results, &(&1.status == "recovered"))
        skipped = Enum.count(results, &(&1.status == "skipped"))
        json(conn, %{data: sanitize(%{recovered: recovered, skipped: skipped, total: length(results), results: results})})

      {:ok, _} ->
        json(conn, %{data: %{recovered: 0, skipped: 0, total: 0, message: "No orphan orders found"}})

      {:error, reason} ->
        conn |> put_status(502) |> json(%{error: "Failed to reconcile: #{inspect(reason)}"})
    end
  end

  defp to_decimal(nil), do: nil
  defp to_decimal(n) when is_number(n), do: Decimal.from_float(n + 0.0)
  defp to_decimal(%Decimal{} = d), do: d
  defp to_decimal(s) when is_binary(s) do
    case Decimal.parse(s) do
      {d, _} -> d
      :error -> nil
    end
  end

  def cancel_orphans(conn, _params) do
    case Reconciliation.reconcile_orders() do
      {:ok, %{missing_db: orphans}} when is_list(orphans) and length(orphans) > 0 ->
        results = Enum.map(orphans, fn order ->
          cred_id = order[:credential_id]
          symbol = order[:symbol]
          order_id = order[:exchange_order_id]
          market_type = order[:market_type] || "usds_futures"

          if cred_id && symbol && order_id do
            case TradeEngine.Exchanges.Executor.cancel_order(cred_id, symbol, order_id, market_type: market_type) do
              {:ok, _} -> %{order_id: order_id, symbol: symbol, status: "cancelled"}
              {:error, reason} -> %{order_id: order_id, symbol: symbol, status: "failed", error: inspect(reason)}
            end
          else
            %{order_id: order_id, symbol: symbol, status: "skipped", error: "missing credential or symbol"}
          end
        end)

        cancelled = Enum.count(results, &(&1.status == "cancelled"))
        failed = Enum.count(results, &(&1.status == "failed"))
        json(conn, %{data: sanitize(%{cancelled: cancelled, failed: failed, total: length(results), results: results})})

      {:ok, _} ->
        json(conn, %{data: %{cancelled: 0, failed: 0, total: 0, message: "No orphan orders found"}})

      {:error, reason} ->
        conn |> put_status(502) |> json(%{error: "Failed to reconcile: #{inspect(reason)}"})
    end
  end

  @doc "POST /api/reconciliation/clean-stale — Mark DB orders as cancelled if gone from exchange"
  def clean_stale(conn, _params) do
    case Reconciliation.reconcile_orders() do
      {:ok, %{stale_exchange: stale}} when is_list(stale) and length(stale) > 0 ->
        import Ecto.Query
        alias TradeEngine.Repo
        alias TradeEngine.Trading.Order

        results = Enum.map(stale, fn order ->
          db_id = order[:id]
          if db_id do
            case Repo.get(Order, db_id) do
              nil -> %{id: db_id, status: "not_found"}
              record ->
                changeset = Order.changeset(record, %{status: "cancelled", cancel_reason: "reconciliation: gone from exchange"})
                case Repo.update(changeset) do
                  {:ok, _} -> %{id: db_id, exchange_order_id: order[:exchange_order_id], status: "cleaned"}
                  {:error, _} -> %{id: db_id, status: "update_failed"}
                end
            end
          else
            %{id: nil, status: "skipped"}
          end
        end)

        cleaned = Enum.count(results, &(&1.status == "cleaned"))
        json(conn, %{data: sanitize(%{cleaned: cleaned, total: length(results), results: results})})

      {:ok, _} ->
        json(conn, %{data: %{cleaned: 0, total: 0, message: "No stale orders found"}})

      {:error, reason} ->
        conn |> put_status(502) |> json(%{error: "Failed to reconcile: #{inspect(reason)}"})
    end
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
