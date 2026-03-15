defmodule TradeEngine.Reconciliation do
  @moduledoc """
  On-demand reconciliation between local DB state and exchange state.
  Used by the admin dashboard to inspect discrepancies across all credentials.

  This is NOT a GenServer — it's a stateless context module called by the
  ReconciliationController. The automated background reconciliation remains
  in PositionReconciler.
  """

  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.{Position, Order, Transaction}
  alias TradeEngine.Bots.BotRegistry
  alias TradeEngine.Exchanges.{Executor, CredentialDiscovery}
  alias TradeEngine.Risk.PositionReconciler

  @max_credentials 10
  @max_symbols_per_credential 10

  # ---------------------------------------------------------------------------
  # POSITION RECONCILIATION
  # ---------------------------------------------------------------------------

  @doc """
  Compares exchange positions (via get_position_risk) against DB positions
  for all enabled futures credentials.

  Returns {:ok, %{matched, orphaned_exchange, orphaned_db, drifted, ...}}
  """
  def reconcile_positions do
    credentials = get_futures_credentials()
    started_at = System.monotonic_time(:millisecond)

    {results, errors} =
      credentials
      |> Enum.take(@max_credentials)
      |> Enum.reduce({[], []}, fn cred_id, {results_acc, errors_acc} ->
        case reconcile_positions_for_credential(cred_id) do
          {:ok, items} -> {items ++ results_acc, errors_acc}
          {:error, reason} -> {results_acc, [%{credential_id: cred_id, error: inspect(reason)} | errors_acc]}
        end
      end)

    # Also find DB positions with no credential match on exchange
    orphaned_db = find_orphaned_db_positions(credentials)

    # Categorize exchange results
    matched = Enum.filter(results, &(&1.status == :matched))
    orphaned_exchange = Enum.filter(results, &(&1.status == :orphaned_exchange))
    drifted = Enum.filter(results, &(&1.status == :drifted))

    elapsed = System.monotonic_time(:millisecond) - started_at

    {:ok, %{
      checked_at: DateTime.utc_now() |> DateTime.to_iso8601(),
      credentials_checked: length(credentials),
      credentials_failed: length(errors),
      elapsed_ms: elapsed,
      totals: %{
        matched: length(matched),
        orphaned_exchange: length(orphaned_exchange),
        orphaned_db: length(orphaned_db),
        drifted: length(drifted)
      },
      matched: matched,
      orphaned_exchange: orphaned_exchange,
      orphaned_db: orphaned_db,
      drifted: drifted,
      errors: errors
    }}
  rescue
    e ->
      Logger.warning("Reconciliation.reconcile_positions error: #{Exception.message(e)}")
      {:error, Exception.message(e)}
  end

  defp reconcile_positions_for_credential(credential_id) do
    # Get exchange positions
    exchange_positions = case Executor.get_position_risk(credential_id) do
      {:ok, positions} -> positions
      {:error, reason} -> throw({:exchange_error, reason})
    end

    # Get DB open positions for this credential
    db_positions = from(p in Position,
      where: p.status == "open" and p.credential_id == ^credential_id,
      select: %{
        id: p.id,
        bot_id: p.bot_id,
        symbol: p.symbol,
        side: p.position_type,
        quantity: p.quantity,
        entry_price: p.entry_price,
        unrealized_pnl: p.unrealized_profit_loss,
        opened_at: p.entry_time,
        credential_id: p.credential_id
      }
    )
    |> Repo.all(timeout: 10_000)

    # Build lookup maps
    db_by_symbol = db_positions
    |> Enum.group_by(fn p -> normalize_symbol(p.symbol) end)

    # Running bot symbols for this credential
    running_bot_symbols = get_running_bot_symbols(credential_id)

    # Compare each exchange position
    items = Enum.map(exchange_positions, fn ep ->
      norm = ep.symbol
      db_match = Map.get(db_by_symbol, norm, []) |> List.first()
      has_running_bot = MapSet.member?(running_bot_symbols, norm)

      cond do
        is_nil(db_match) and not has_running_bot ->
          %{
            status: :orphaned_exchange,
            credential_id: credential_id,
            symbol: ep.symbol,
            exchange_side: ep.position_side || (if parse_float(ep.position_amount) >= 0, do: "LONG", else: "SHORT"),
            exchange_quantity: abs(parse_float(ep.position_amount)),
            entry_price: parse_float(ep.entry_price),
            mark_price: parse_float(ep.mark_price),
            unrealized_pnl: parse_float(ep.unrealized_pnl),
            leverage: ep.leverage,
            liquidation_price: parse_float(ep.liquidation_price),
            notional: parse_float(ep.notional),
            update_time: ep[:update_time],
            has_running_bot: false,
            has_db_position: false,
            orphan_type: "no_bot_no_db"
          }

        is_nil(db_match) ->
          # Has running bot but no DB record — bot may be about to adopt it
          %{
            status: :orphaned_exchange,
            credential_id: credential_id,
            symbol: ep.symbol,
            exchange_side: ep.position_side || "LONG",
            exchange_quantity: abs(parse_float(ep.position_amount)),
            entry_price: parse_float(ep.entry_price),
            mark_price: parse_float(ep.mark_price),
            unrealized_pnl: parse_float(ep.unrealized_pnl),
            leverage: ep.leverage,
            update_time: ep[:update_time],
            has_running_bot: true,
            has_db_position: false,
            orphan_type: "no_db_record"
          }

        true ->
          # Compare quantities
          db_qty = decimal_to_float(db_match.quantity)
          ex_qty = abs(parse_float(ep.position_amount))
          drift_pct = if db_qty > 0, do: abs(ex_qty - db_qty) / db_qty * 100, else: 0.0

          if drift_pct > 1.0 do
            %{
              status: :drifted,
              credential_id: credential_id,
              symbol: ep.symbol,
              position_id: db_match.id,
              bot_id: db_match.bot_id,
              db_quantity: db_qty,
              exchange_quantity: ex_qty,
              db_side: db_match.side,
              exchange_side: ep.position_side || "LONG",
              drift_pct: Float.round(drift_pct, 2),
              entry_price: parse_float(ep.entry_price),
              unrealized_pnl: parse_float(ep.unrealized_pnl),
              has_running_bot: has_running_bot
            }
          else
            %{
              status: :matched,
              credential_id: credential_id,
              symbol: ep.symbol,
              position_id: db_match.id,
              bot_id: db_match.bot_id,
              db_quantity: db_qty,
              exchange_quantity: ex_qty,
              db_side: db_match.side,
              exchange_side: ep.position_side || "LONG",
              entry_price: parse_float(ep.entry_price),
              mark_price: parse_float(ep.mark_price),
              unrealized_pnl: parse_float(ep.unrealized_pnl),
              leverage: ep.leverage,
              has_running_bot: has_running_bot
            }
          end
      end
    end)

    {:ok, items}
  catch
    {:exchange_error, reason} -> {:error, reason}
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp find_orphaned_db_positions(credential_ids) do
    # DB positions marked open but no exchange position exists
    # This catches positions where the exchange side was closed/liquidated
    # but our DB still thinks it's open
    if credential_ids == [] do
      []
    else
      from(p in Position,
        where: p.status == "open" and p.credential_id in ^credential_ids,
        select: %{
          id: p.id,
          bot_id: p.bot_id,
          symbol: p.symbol,
          side: p.position_type,
          quantity: p.quantity,
          entry_price: p.entry_price,
          opened_at: p.entry_time,
          credential_id: p.credential_id
        },
        limit: 100
      )
      |> Repo.all(timeout: 10_000)
      |> Enum.map(fn p ->
        %{
          status: :orphaned_db,
          credential_id: p.credential_id,
          position_id: p.id,
          bot_id: p.bot_id,
          symbol: p.symbol,
          db_side: p.side,
          db_quantity: decimal_to_float(p.quantity),
          entry_price: decimal_to_float(p.entry_price),
          opened_at: p.opened_at && DateTime.to_iso8601(p.opened_at)
        }
      end)
    end
  rescue
    _ -> []
  end

  # ---------------------------------------------------------------------------
  # ORDER RECONCILIATION
  # ---------------------------------------------------------------------------

  @doc """
  Compares open exchange orders against DB orders for all futures credentials.
  Returns {:ok, %{matched, stale_exchange, missing_db, status_mismatch, ...}}
  """
  def reconcile_orders do
    credentials = get_futures_credentials()
    started_at = System.monotonic_time(:millisecond)

    {all_results, errors} =
      credentials
      |> Enum.take(@max_credentials)
      |> Enum.reduce({[], []}, fn cred_id, {results_acc, errors_acc} ->
        case reconcile_orders_for_credential(cred_id) do
          {:ok, items} -> {items ++ results_acc, errors_acc}
          {:error, reason} -> {results_acc, [%{credential_id: cred_id, error: inspect(reason)} | errors_acc]}
        end
      end)

    matched = Enum.filter(all_results, &(&1.status == :matched))
    stale_exchange = Enum.filter(all_results, &(&1.status == :stale_exchange))
    missing_db = Enum.filter(all_results, &(&1.status == :missing_db))
    status_mismatch = Enum.filter(all_results, &(&1.status == :status_mismatch))

    elapsed = System.monotonic_time(:millisecond) - started_at

    {:ok, %{
      checked_at: DateTime.utc_now() |> DateTime.to_iso8601(),
      credentials_checked: length(credentials),
      elapsed_ms: elapsed,
      totals: %{
        matched: length(matched),
        stale_exchange: length(stale_exchange),
        missing_db: length(missing_db),
        status_mismatch: length(status_mismatch)
      },
      matched: matched,
      stale_exchange: stale_exchange,
      missing_db: missing_db,
      status_mismatch: status_mismatch,
      errors: errors
    }}
  rescue
    e ->
      Logger.warning("Reconciliation.reconcile_orders error: #{Exception.message(e)}")
      {:error, Exception.message(e)}
  end

  defp reconcile_orders_for_credential(credential_id) do
    # Get symbols with open DB orders for this credential
    symbols = from(o in Order,
      where: o.credential_id == ^credential_id and o.status in ["pending", "submitted", "open", "partially_filled"],
      distinct: true,
      select: o.symbol
    )
    |> Repo.all(timeout: 10_000)
    |> Enum.take(@max_symbols_per_credential)

    # Get DB orders grouped by exchange_order_id
    db_orders = from(o in Order,
      where: o.credential_id == ^credential_id and o.status in ["pending", "submitted", "open", "partially_filled"],
      select: %{
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        order_type: o.order_type,
        quantity: o.quantity,
        price: o.price,
        status: o.status,
        exchange_order_id: o.exchange_order_id,
        bot_id: o.bot_id,
        submitted_at: o.submitted_at
      }
    )
    |> Repo.all(timeout: 10_000)

    db_by_exchange_id = db_orders
    |> Enum.filter(&(&1.exchange_order_id))
    |> Map.new(fn o -> {to_string(o.exchange_order_id), o} end)

    # Fetch open orders from exchange for each symbol
    exchange_orders = symbols
    |> Enum.flat_map(fn symbol ->
      case Executor.get_open_orders(credential_id, symbol, market_type: "usds_futures") do
        {:ok, orders} when is_list(orders) ->
          Enum.map(orders, &Map.put(&1, :credential_id, credential_id))
        _ -> []
      end
    end)

    exchange_by_id = exchange_orders
    |> Map.new(fn o ->
      oid = to_string(o[:order_id] || o["orderId"])
      {oid, o}
    end)

    # Compare
    items = []

    # Check each exchange order against DB
    exchange_items = Enum.map(exchange_orders, fn eo ->
      oid = to_string(eo[:order_id] || eo["orderId"])
      db_match = Map.get(db_by_exchange_id, oid)

      if db_match do
        %{
          status: :matched,
          credential_id: credential_id,
          symbol: eo[:symbol],
          exchange_order_id: oid,
          side: eo[:side],
          order_type: eo[:type] || eo[:order_type],
          quantity: parse_float(eo[:orig_qty] || eo[:quantity]),
          price: parse_float(eo[:price]),
          db_status: db_match.status,
          exchange_status: eo[:status],
          bot_id: db_match.bot_id
        }
      else
        %{
          status: :missing_db,
          credential_id: credential_id,
          symbol: eo[:symbol],
          exchange_order_id: oid,
          side: eo[:side],
          order_type: eo[:type] || eo[:order_type],
          quantity: parse_float(eo[:orig_qty] || eo[:quantity]),
          price: parse_float(eo[:price]),
          exchange_status: eo[:status],
          client_order_id: eo[:client_order_id]
        }
      end
    end)

    # Check DB orders not on exchange (stale)
    stale_items = db_orders
    |> Enum.filter(fn o ->
      o.exchange_order_id && not Map.has_key?(exchange_by_id, to_string(o.exchange_order_id))
    end)
    |> Enum.map(fn o ->
      %{
        status: :stale_exchange,
        credential_id: credential_id,
        symbol: o.symbol,
        exchange_order_id: o.exchange_order_id,
        side: o.side,
        order_type: o.order_type,
        quantity: decimal_to_float(o.quantity),
        price: decimal_to_float(o.price),
        db_status: o.status,
        bot_id: o.bot_id,
        submitted_at: o.submitted_at && DateTime.to_iso8601(o.submitted_at)
      }
    end)

    {:ok, items ++ exchange_items ++ stale_items}
  rescue
    e -> {:error, Exception.message(e)}
  end

  # ---------------------------------------------------------------------------
  # BALANCE RECONCILIATION
  # ---------------------------------------------------------------------------

  @doc """
  Compares exchange balances against virtual/allocated balances per credential.
  """
  def reconcile_balances do
    credentials = get_futures_credentials()
    started_at = System.monotonic_time(:millisecond)

    {results, errors} =
      credentials
      |> Enum.take(@max_credentials)
      |> Enum.reduce({[], []}, fn cred_id, {results_acc, errors_acc} ->
        case get_balance_comparison(cred_id) do
          {:ok, item} -> {[item | results_acc], errors_acc}
          {:error, reason} -> {results_acc, [%{credential_id: cred_id, error: inspect(reason)} | errors_acc]}
        end
      end)

    elapsed = System.monotonic_time(:millisecond) - started_at

    {:ok, %{
      checked_at: DateTime.utc_now() |> DateTime.to_iso8601(),
      credentials_checked: length(credentials),
      elapsed_ms: elapsed,
      balances: results,
      errors: errors
    }}
  rescue
    e ->
      Logger.warning("Reconciliation.reconcile_balances error: #{Exception.message(e)}")
      {:error, Exception.message(e)}
  end

  defp get_balance_comparison(credential_id) do
    case Executor.get_balance(credential_id, market_type: "usds_futures") do
      {:ok, balance_data} ->
        total_wallet = parse_float(balance_data[:total_wallet_balance] || balance_data[:total_balance])
        available = parse_float(balance_data[:available_balance])
        cross_unrealized = parse_float(balance_data[:cross_unrealized_pnl] || balance_data[:unrealized_pnl])

        # Get virtual balance from ETS
        virtual = try do
          case :ets.lookup(:virtual_balances, credential_id) do
            [{_, data}] -> data
            _ -> nil
          end
        rescue
          _ -> nil
        end

        active_capital = if virtual, do: parse_float(virtual[:active_capital] || virtual["active_capital"]), else: 0.0

        {:ok, %{
          credential_id: credential_id,
          exchange_wallet_balance: total_wallet,
          exchange_available_balance: available,
          exchange_unrealized_pnl: cross_unrealized,
          virtual_active_capital: active_capital,
          drift_amount: total_wallet - active_capital,
          drift_pct: if(active_capital > 0, do: Float.round((total_wallet - active_capital) / active_capital * 100, 2), else: 0.0),
          assets: balance_data[:assets] || []
        }}

      {:error, reason} -> {:error, reason}
    end
  end

  # ---------------------------------------------------------------------------
  # TRADE RECONCILIATION
  # ---------------------------------------------------------------------------

  @doc """
  Compares recent exchange trades against DB fills for a specific credential + symbol.
  """
  def reconcile_trades(credential_id, symbol, limit \\ 50) do
    started_at = System.monotonic_time(:millisecond)

    # Fetch trades from exchange
    exchange_trades = case Executor.get_user_trades(credential_id, symbol, market_type: "usds_futures", limit: limit) do
      {:ok, trades} when is_list(trades) -> trades
      _ -> []
    end

    # Get DB fills for this symbol
    norm = normalize_symbol(symbol)
    db_fills = from(t in Transaction,
      where: fragment("UPPER(REPLACE(REPLACE(?, '/', ''), ':', ''))", t.symbol) == ^norm,
      order_by: [desc: t.executed_at],
      limit: ^limit,
      select: %{
        id: t.id,
        symbol: t.symbol,
        side: t.direction,
        quantity: t.quantity,
        price: t.price,
        exchange_order_id: t.order_id,
        executed_at: t.executed_at,
        pnl: t.pnl,
        fee: t.fee_amount,
        fee_asset: t.fee_asset
      }
    )
    |> Repo.all(timeout: 10_000)

    # Build lookup by exchange_order_id
    db_by_order_id = db_fills
    |> Enum.filter(&(&1.exchange_order_id))
    |> Enum.group_by(fn f -> to_string(f.exchange_order_id) end)

    # Compare
    results = Enum.map(exchange_trades, fn et ->
      oid = to_string(et[:order_id] || et["orderId"])
      trade_id = to_string(et[:trade_id] || et["id"])
      db_matches = Map.get(db_by_order_id, oid, [])

      if db_matches != [] do
        %{
          status: :matched,
          trade_id: trade_id,
          exchange_order_id: oid,
          symbol: et[:symbol],
          side: et[:side],
          quantity: parse_float(et[:qty] || et[:quantity]),
          price: parse_float(et[:price]),
          commission: parse_float(et[:commission]),
          realized_pnl: parse_float(et[:realized_pnl]),
          time: et[:time],
          db_fill_count: length(db_matches)
        }
      else
        %{
          status: :missing_local,
          trade_id: trade_id,
          exchange_order_id: oid,
          symbol: et[:symbol],
          side: et[:side],
          quantity: parse_float(et[:qty] || et[:quantity]),
          price: parse_float(et[:price]),
          commission: parse_float(et[:commission]),
          realized_pnl: parse_float(et[:realized_pnl]),
          time: et[:time]
        }
      end
    end)

    # Find DB fills with no matching exchange trade
    exchange_order_ids = exchange_trades
    |> Enum.map(fn t -> to_string(t[:order_id] || t["orderId"]) end)
    |> MapSet.new()

    extra_local = db_fills
    |> Enum.filter(fn f ->
      f.exchange_order_id && not MapSet.member?(exchange_order_ids, to_string(f.exchange_order_id))
    end)
    |> Enum.map(fn f ->
      %{
        status: :extra_local,
        fill_id: f.id,
        exchange_order_id: f.exchange_order_id,
        symbol: f.symbol,
        side: f.side,
        quantity: decimal_to_float(f.quantity),
        price: decimal_to_float(f.price),
        pnl: decimal_to_float(f.pnl),
        executed_at: f.executed_at && DateTime.to_iso8601(f.executed_at)
      }
    end)

    matched = Enum.filter(results, &(&1.status == :matched))
    missing_local = Enum.filter(results, &(&1.status == :missing_local))

    elapsed = System.monotonic_time(:millisecond) - started_at

    {:ok, %{
      checked_at: DateTime.utc_now() |> DateTime.to_iso8601(),
      credential_id: credential_id,
      symbol: symbol,
      elapsed_ms: elapsed,
      totals: %{
        matched: length(matched),
        missing_local: length(missing_local),
        extra_local: length(extra_local)
      },
      matched: matched,
      missing_local: missing_local,
      extra_local: extra_local
    }}
  rescue
    e ->
      Logger.warning("Reconciliation.reconcile_trades error: #{Exception.message(e)}")
      {:error, Exception.message(e)}
  end

  # ---------------------------------------------------------------------------
  # SUMMARY
  # ---------------------------------------------------------------------------

  @doc """
  Quick summary from ETS cache — no exchange API calls.
  """
  def get_summary do
    reconciler_stats = PositionReconciler.stats()

    # Count open DB positions and orders
    open_positions = try do
      Repo.one(from(p in Position, where: p.status == "open", select: count(p.id)), timeout: 5_000) || 0
    rescue
      _ -> 0
    end

    open_orders = try do
      Repo.one(from(o in Order, where: o.status in ["pending", "submitted", "open", "partially_filled"], select: count(o.id)), timeout: 5_000) || 0
    rescue
      _ -> 0
    end

    %{
      position_reconciler: reconciler_stats,
      db_open_positions: open_positions,
      db_open_orders: open_orders,
      credentials: length(get_futures_credentials()),
      checked_at: DateTime.utc_now() |> DateTime.to_iso8601()
    }
  end

  # ---------------------------------------------------------------------------
  # SHARED HELPERS
  # ---------------------------------------------------------------------------

  defp get_futures_credentials do
    CredentialDiscovery.get_futures_credentials()
  end

  defp get_running_bot_symbols(credential_id) do
    try do
      BotRegistry.list_bots()
      |> Enum.filter(fn bot ->
        Map.get(bot, :credential_id) == credential_id and
        Map.get(bot, :status) in ["running", "initializing"]
      end)
      |> Enum.flat_map(fn bot ->
        (Map.get(bot, :trading_pairs) || [])
        |> Enum.map(&normalize_symbol/1)
      end)
      |> MapSet.new()
    rescue
      _ -> MapSet.new()
    end
  end

  # Normalize CCXT symbol to exchange format
  # "BTC/USDT:USDT-260327" → "BTCUSDT_260327" (delivery futures)
  # "BTC/USDT:USDT" → "BTCUSDT" (perpetual)
  # "BTC/USDT" → "BTCUSDT" (spot)
  # "BTCUSDT_260327" → "BTCUSDT_260327" (already exchange format)
  defp normalize_symbol(sym) when is_binary(sym) do
    case String.split(sym, ":") do
      [base_quote, settle_part] ->
        base = String.replace(base_quote, "/", "") |> String.upcase()
        case String.split(settle_part, "-") do
          [_settle, expiry] -> base <> "_" <> expiry
          _ -> base
        end
      _ ->
        sym |> String.replace("/", "") |> String.upcase()
    end
  end
  defp normalize_symbol(_), do: ""

  defp parse_float(nil), do: 0.0
  defp parse_float(n) when is_number(n), do: n * 1.0
  defp parse_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp parse_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  defp parse_float(_), do: 0.0

  defp decimal_to_float(nil), do: 0.0
  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(n) when is_number(n), do: n * 1.0
  defp decimal_to_float(_), do: 0.0
end
