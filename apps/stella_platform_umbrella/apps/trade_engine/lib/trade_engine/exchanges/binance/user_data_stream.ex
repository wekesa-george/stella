defmodule TradeEngine.Exchanges.Binance.UserDataStream do
  @moduledoc """
  Binance User Data Stream — real-time order fills, balance changes, and liquidations.

  Manages listenKey lifecycle and WebSocket connection per credential:
  1. Creates listenKey via POST /fapi/v1/listenKey (or /api/v3/userDataStream for spot)
  2. Opens WebSocket to wss://stream.binancefuture.com/ws/{listenKey}
  3. Handles ORDER_TRADE_UPDATE → updates trading.orders + trading.fills
  4. Handles ACCOUNT_UPDATE → broadcasts balance changes
  5. Keeps listenKey alive every 30 minutes via PUT
  6. Recreates listenKey on disconnect or expiry

  ## Architecture

  UserDataStreamSupervisor (DynamicSupervisor) spawns one UserDataStream per
  active credential. BotTradingProcess starts/stops streams when bots start/stop.

  ## Events Broadcast

  - `"user_data:{credential_id}"` — all raw events
  - `"orders:updates"` — order state changes (for OrderManager compatibility)
  - `"fills:updates"` — fill events
  - `"balances:updates"` — account balance changes
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.{Order, Transaction}
  alias TradeEngine.Exchanges.Executor

  @pubsub TradeEngine.PubSub

  # ListenKey keepalive every 30 minutes (Binance expires at 60 min)
  @keepalive_interval_ms 1_800_000
  # Reconnect delay on WebSocket disconnect
  @initial_reconnect_delay 2_000
  @max_reconnect_delay 60_000
  # Health check interval
  @health_check_interval_ms 30_000

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  @doc "Start a user data stream for a credential"
  def start_link(opts) do
    credential_id = Keyword.fetch!(opts, :credential_id)
    market_type = Keyword.get(opts, :market_type, "spot")
    name = via_name(credential_id, market_type)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Start a user data stream under the DynamicSupervisor"
  def start_stream(credential_id, opts \\ []) do
    market_type = Keyword.get(opts, :market_type, "spot")
    child_opts = [credential_id: credential_id, market_type: market_type] ++ opts

    DynamicSupervisor.start_child(
      TradeEngine.Exchanges.Binance.UserDataStreamSupervisor,
      {__MODULE__, child_opts}
    )
  end

  @doc "Stop a user data stream"
  def stop_stream(credential_id, market_type \\ "spot") do
    name = via_name(credential_id, market_type)
    case GenServer.whereis(name) do
      nil -> :ok
      pid ->
        DynamicSupervisor.terminate_child(
          TradeEngine.Exchanges.Binance.UserDataStreamSupervisor,
          pid
        )
    end
  end

  @doc "Get stream status"
  def status(credential_id, market_type \\ "spot") do
    name = via_name(credential_id, market_type)
    case GenServer.whereis(name) do
      nil -> %{status: :not_running}
      _pid -> GenServer.call(name, :status)
    end
  catch
    :exit, _ -> %{status: :not_running}
  end

  @doc "List all active streams"
  def active_streams do
    DynamicSupervisor.which_children(TradeEngine.Exchanges.Binance.UserDataStreamSupervisor)
    |> Enum.map(fn {_, pid, _, _} ->
      try do
        GenServer.call(pid, :status, 2_000)
      catch
        :exit, _ -> nil
      end
    end)
    |> Enum.reject(&is_nil/1)
  end

  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(opts) do
    credential_id = Keyword.fetch!(opts, :credential_id)
    market_type = Keyword.get(opts, :market_type, "spot")

    Logger.info("UserDataStream: starting for credential #{short_id(credential_id)} (#{market_type})")

    state = %{
      credential_id: credential_id,
      market_type: market_type,
      listen_key: nil,
      ws_pid: nil,
      connected: false,
      reconnect_attempts: 0,
      last_event: nil,
      events_received: 0,
      orders_updated: 0,
      fills_recorded: 0,
      started_at: DateTime.utc_now()
    }

    # Start the stream after a short delay (let credentials resolve)
    Process.send_after(self(), :create_listen_key, 1_000)
    Process.send_after(self(), :health_check, @health_check_interval_ms)

    {:ok, state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    status = %{
      status: if(state.connected, do: :connected, else: :disconnected),
      credential_id: state.credential_id,
      market_type: state.market_type,
      listen_key: if(state.listen_key, do: "#{String.slice(state.listen_key, 0, 8)}...", else: nil),
      connected: state.connected,
      events_received: state.events_received,
      orders_updated: state.orders_updated,
      fills_recorded: state.fills_recorded,
      last_event: state.last_event,
      started_at: state.started_at
    }
    {:reply, status, state}
  end

  @impl true
  def handle_info(:create_listen_key, state) do
    case create_listen_key(state.credential_id, state.market_type) do
      {:ok, listen_key} ->
        Logger.info("UserDataStream: listenKey created for #{short_id(state.credential_id)}")
        # Schedule keepalive
        Process.send_after(self(), :keepalive, @keepalive_interval_ms)
        # Connect WebSocket
        send(self(), :connect_ws)
        {:noreply, %{state | listen_key: listen_key, reconnect_attempts: 0}}

      {:error, reason} ->
        Logger.error("UserDataStream: failed to create listenKey: #{inspect(reason)}")
        delay = calculate_reconnect_delay(state.reconnect_attempts)
        Process.send_after(self(), :create_listen_key, delay)
        {:noreply, %{state | reconnect_attempts: state.reconnect_attempts + 1}}
    end
  end

  def handle_info(:connect_ws, %{listen_key: nil} = state) do
    # No listen key yet, wait
    Process.send_after(self(), :create_listen_key, 2_000)
    {:noreply, state}
  end

  def handle_info(:connect_ws, state) do
    ws_url = build_ws_url(state.credential_id, state.listen_key, state.market_type)

    case WebSockex.start(ws_url, __MODULE__.WebSocketHandler, %{parent: self()},
           extra_headers: [],
           handle_initial_conn_failure: true,
           async: true
         ) do
      {:ok, pid} ->
        Process.monitor(pid)
        Logger.info("UserDataStream: WebSocket connected for #{short_id(state.credential_id)}")
        {:noreply, %{state | ws_pid: pid, connected: true, reconnect_attempts: 0}}

      {:error, reason} ->
        Logger.error("UserDataStream: WebSocket connect failed: #{inspect(reason)}")
        delay = calculate_reconnect_delay(state.reconnect_attempts)
        Process.send_after(self(), :connect_ws, delay)
        {:noreply, %{state | reconnect_attempts: state.reconnect_attempts + 1}}
    end
  end

  def handle_info(:keepalive, %{listen_key: nil} = state) do
    {:noreply, state}
  end

  def handle_info(:keepalive, state) do
    case keepalive_listen_key(state.credential_id, state.listen_key, state.market_type) do
      :ok ->
        Process.send_after(self(), :keepalive, @keepalive_interval_ms)

      {:error, _reason} ->
        # ListenKey may have expired — recreate
        Logger.warning("UserDataStream: keepalive failed, recreating listenKey")
        send(self(), :create_listen_key)
    end

    {:noreply, state}
  end

  def handle_info(:health_check, state) do
    Process.send_after(self(), :health_check, @health_check_interval_ms)

    if not state.connected and state.listen_key do
      Logger.warning("UserDataStream: not connected, attempting reconnect")
      send(self(), :connect_ws)
    end

    {:noreply, state}
  end

  # WebSocket process died — reconnect
  def handle_info({:DOWN, _ref, :process, pid, reason}, %{ws_pid: pid} = state) do
    Logger.warning("UserDataStream: WebSocket disconnected: #{inspect(reason)}")
    delay = calculate_reconnect_delay(state.reconnect_attempts)
    Process.send_after(self(), :connect_ws, delay)
    {:noreply, %{state | ws_pid: nil, connected: false, reconnect_attempts: state.reconnect_attempts + 1}}
  end

  # Incoming WebSocket event from handler
  def handle_info({:ws_event, data}, state) do
    new_state = process_event(data, state)
    {:noreply, new_state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  @impl true
  def terminate(_reason, state) do
    # Close WebSocket if running
    if state.ws_pid && Process.alive?(state.ws_pid) do
      try do
        WebSockex.send_frame(state.ws_pid, :close)
      catch
        _, _ -> :ok
      end
    end

    # Delete listenKey
    if state.listen_key do
      delete_listen_key(state.credential_id, state.listen_key, state.market_type)
    end

    Logger.info("UserDataStream: stopped for #{short_id(state.credential_id)}")
    :ok
  end

  # ============================================================================
  # EVENT PROCESSING
  # ============================================================================

  defp process_event(%{"e" => "ORDER_TRADE_UPDATE", "o" => order_data} = event, state) do
    credential_id = state.credential_id
    symbol = order_data["s"]
    side = order_data["S"]       # BUY or SELL
    order_type = order_data["o"] # MARKET, LIMIT, etc.
    status = order_data["X"]     # NEW, PARTIALLY_FILLED, FILLED, CANCELED, etc.
    order_id = order_data["i"]   # orderId
    client_order_id = order_data["c"]
    executed_qty = parse_float(order_data["l"])      # last filled quantity
    executed_price = parse_float(order_data["L"])     # last filled price
    cumulative_qty = parse_float(order_data["z"])     # cumulative filled quantity
    avg_price = parse_float(order_data["ap"])         # average price
    commission = parse_float(order_data["n"])         # commission amount
    commission_asset = order_data["N"]                # commission asset
    realized_pnl = parse_float(order_data["rp"])      # realized PnL (futures)
    order_time = order_data["T"]                      # order trade time

    Logger.info("UserDataStream: ORDER_TRADE_UPDATE #{symbol} #{side} #{status} " <>
      "price=#{executed_price} qty=#{executed_qty} orderId=#{order_id}")

    # Update matching order in DB
    update_order_from_stream(credential_id, order_id, %{
      symbol: symbol,
      side: String.downcase(side),
      status: normalize_order_status(status),
      execution_price: avg_price,
      filled_quantity: cumulative_qty,
      exchange_order_id: to_string(order_id),
      commission: commission,
      commission_asset: commission_asset
    })

    # Record fill if there was an execution
    if executed_qty > 0 and status in ["FILLED", "PARTIALLY_FILLED"] do
      record_stream_fill(credential_id, %{
        symbol: symbol,
        side: String.downcase(side),
        price: executed_price,
        quantity: executed_qty,
        commission: commission,
        commission_asset: commission_asset,
        order_id: to_string(order_id),
        realized_pnl: realized_pnl,
        timestamp: order_time
      })
    end

    # Broadcast to channels
    Phoenix.PubSub.broadcast(@pubsub, "user_data:#{credential_id}", {:order_update, event})

    %{state |
      events_received: state.events_received + 1,
      orders_updated: state.orders_updated + 1,
      fills_recorded: if(executed_qty > 0, do: state.fills_recorded + 1, else: state.fills_recorded),
      last_event: DateTime.utc_now()
    }
  rescue
    e ->
      Logger.warning("UserDataStream: ORDER_TRADE_UPDATE processing error: #{Exception.message(e)}")
      %{state | events_received: state.events_received + 1, last_event: DateTime.utc_now()}
  end

  defp process_event(%{"e" => "ACCOUNT_UPDATE", "a" => account_data} = event, state) do
    credential_id = state.credential_id

    # Extract balance changes
    balances = account_data["B"] || []
    positions = account_data["P"] || []
    reason = account_data["m"] # DEPOSIT, WITHDRAW, ORDER, FUNDING_FEE, etc.

    Logger.info("UserDataStream: ACCOUNT_UPDATE reason=#{reason} " <>
      "balances=#{length(balances)} positions=#{length(positions)}")

    # Broadcast balance update for dashboard
    balance_update = %{
      credential_id: credential_id,
      reason: reason,
      balances: Enum.map(balances, fn b ->
        %{
          asset: b["a"],
          wallet_balance: parse_float(b["wb"]),
          cross_wallet_balance: parse_float(b["cw"]),
          balance_change: parse_float(b["bc"])
        }
      end),
      positions: Enum.map(positions, fn p ->
        %{
          symbol: p["s"],
          position_amount: parse_float(p["pa"]),
          entry_price: parse_float(p["ep"]),
          unrealized_pnl: parse_float(p["up"]),
          margin_type: p["mt"],
          position_side: p["ps"]
        }
      end),
      timestamp: DateTime.utc_now()
    }

    Phoenix.PubSub.broadcast(@pubsub, "balances:updates", {:balance_update, balance_update})
    Phoenix.PubSub.broadcast(@pubsub, "user_data:#{credential_id}", {:account_update, event})

    # Check for liquidations
    if reason == "LIQUIDATION" do
      Logger.error("UserDataStream: LIQUIDATION detected for #{short_id(credential_id)}!")
      Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, %{
        id: Ecto.UUID.generate(),
        alert_type: "liquidation",
        category: "risk",
        severity: "critical",
        title: "Position Liquidated",
        message: "Liquidation on credential #{short_id(credential_id)}",
        metadata: balance_update,
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
      }})
    end

    %{state | events_received: state.events_received + 1, last_event: DateTime.utc_now()}
  rescue
    e ->
      Logger.warning("UserDataStream: ACCOUNT_UPDATE processing error: #{Exception.message(e)}")
      %{state | events_received: state.events_received + 1, last_event: DateTime.utc_now()}
  end

  defp process_event(%{"e" => "listenKeyExpired"}, state) do
    Logger.warning("UserDataStream: listenKey expired, recreating")
    send(self(), :create_listen_key)
    %{state | listen_key: nil, connected: false}
  end

  defp process_event(data, state) do
    Logger.debug("UserDataStream: unhandled event: #{inspect(Map.get(data, "e", "unknown"))}")
    %{state | events_received: state.events_received + 1, last_event: DateTime.utc_now()}
  end

  # ============================================================================
  # DB OPERATIONS
  # ============================================================================

  defp update_order_from_stream(credential_id, exchange_order_id, data) do
    order_id_str = to_string(exchange_order_id)

    # Find order by exchange_order_id
    query = from(o in Order,
      where: o.exchange_order_id == ^order_id_str,
      limit: 1
    )

    case Repo.one(query) do
      nil ->
        # Order not tracked by us (manual exchange order) — skip
        Logger.debug("UserDataStream: order #{order_id_str} not found in DB (external order)")

      order ->
        update_attrs = %{
          status: data.status,
          execution_price: to_decimal(data.execution_price),
          filled_quantity: to_decimal(data.filled_quantity),
          exchange_order_id: data.exchange_order_id,
          execution_time: DateTime.utc_now()
        }

        case Repo.update(Order.changeset(order, update_attrs)) do
          {:ok, updated} ->
            event = case data.status do
              "filled" -> {:order_filled, updated}
              "partially_filled" -> {:order_partially_filled, updated}
              "cancelled" -> {:order_cancelled, updated}
              _ -> {:order_updated, updated}
            end

            Phoenix.PubSub.broadcast(@pubsub, "orders:updates", event)
            if updated.bot_id do
              Phoenix.PubSub.broadcast(@pubsub, "orders:bot:#{updated.bot_id}", event)
            end

          {:error, _} ->
            :ok
        end
    end
  rescue
    e -> Logger.warning("UserDataStream: order update error: #{Exception.message(e)}")
  end

  defp record_stream_fill(credential_id, data) do
    fill_attrs = %{
      transaction_type: "trade",
      symbol: data.symbol,
      direction: data.side,
      action: "stream_fill",
      quantity: to_decimal(data.quantity),
      price: to_decimal(data.price),
      amount: to_decimal(data.quantity * data.price),
      order_id: data.order_id,
      status: "completed",
      executed_at: DateTime.utc_now(),
      exchange: "binance",
      fee_amount: to_decimal(data.commission),
      fee_asset: data.commission_asset,
      description: "#{data.side} #{data.symbol} qty=#{data.quantity} @ #{data.price}"
    }

    case Repo.insert(Transaction.changeset(%Transaction{}, fill_attrs)) do
      {:ok, fill} ->
        Phoenix.PubSub.broadcast(@pubsub, "fills:updates", {:fill_recorded, fill})
      {:error, err} ->
        Logger.debug("UserDataStream: fill insert skipped: #{inspect(err)}")
    end
  rescue
    e -> Logger.warning("UserDataStream: fill record error: #{Exception.message(e)}")
  end

  # ============================================================================
  # LISTEN KEY MANAGEMENT
  # ============================================================================

  defp create_listen_key(credential_id, market_type) do
    with {:ok, adapter, creds} <- Executor.resolve(credential_id) do
      url = listen_key_url(creds, market_type)
      headers = [{"X-MBX-APIKEY", creds.api_key}]

      case HTTPoison.post(url, "", headers, timeout: 10_000, recv_timeout: 10_000) do
        {:ok, %{status_code: 200, body: body}} ->
          case Jason.decode(body) do
            {:ok, %{"listenKey" => key}} -> {:ok, key}
            _ -> {:error, :invalid_response}
          end

        {:ok, %{status_code: code, body: body}} ->
          {:error, {:http_error, code, body}}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  defp keepalive_listen_key(credential_id, listen_key, market_type) do
    with {:ok, _adapter, creds} <- Executor.resolve(credential_id) do
      url = listen_key_url(creds, market_type) <> "?listenKey=#{listen_key}"
      headers = [{"X-MBX-APIKEY", creds.api_key}]

      case HTTPoison.put(url, "", headers, timeout: 10_000, recv_timeout: 10_000) do
        {:ok, %{status_code: 200}} -> :ok
        {:ok, %{status_code: code}} -> {:error, {:http_error, code}}
        {:error, reason} -> {:error, reason}
      end
    end
  end

  defp delete_listen_key(credential_id, listen_key, market_type) do
    with {:ok, _adapter, creds} <- Executor.resolve(credential_id) do
      url = listen_key_url(creds, market_type) <> "?listenKey=#{listen_key}"
      headers = [{"X-MBX-APIKEY", creds.api_key}]
      HTTPoison.delete(url, headers, timeout: 5_000, recv_timeout: 5_000)
    end
  rescue
    _ -> :ok
  end

  defp listen_key_url(creds, market_type) do
    case market_type do
      "usds_futures" ->
        base = Map.get(creds, :usds_futures_base_url) || Map.get(creds, :futures_base_url) || ""
        base <> "/v1/listenKey"

      "coinm_futures" ->
        base = Map.get(creds, :coinm_futures_base_url) || Map.get(creds, :futures_base_url) || ""
        base <> "/v1/listenKey"

      _ ->
        # Spot
        creds.base_url <> "/api/v3/userDataStream"
    end
  end

  defp build_ws_url(credential_id, listen_key, market_type) do
    # Resolve base WS URL from credential config
    base = case market_type do
      "usds_futures" ->
        # Testnet: wss://stream.binancefuture.com/ws
        # Mainnet: wss://fstream.binance.com/ws
        testnet? = Application.get_env(:trade_engine, :binance_testnet, true)
        if testnet?,
          do: "wss://stream.binancefuture.com/ws",
          else: "wss://fstream.binance.com/ws"

      "coinm_futures" ->
        testnet? = Application.get_env(:trade_engine, :binance_testnet, true)
        if testnet?,
          do: "wss://dstream.binancefuture.com/ws",
          else: "wss://dstream.binance.com/ws"

      _ ->
        # Spot
        testnet? = Application.get_env(:trade_engine, :binance_testnet, true)
        if testnet?,
          do: "wss://testnet.binance.vision/ws",
          else: "wss://stream.binance.com:9443/ws"
    end

    "#{base}/#{listen_key}"
  end

  # ============================================================================
  # HELPERS
  # ============================================================================

  defp via_name(credential_id, market_type) do
    {:via, Registry, {:binance_user_data_registry, {credential_id, market_type}}}
  end

  defp short_id(id) when is_binary(id), do: String.slice(id, 0, 8)
  defp short_id(id), do: to_string(id) |> String.slice(0, 8)

  defp calculate_reconnect_delay(attempts) do
    delay = @initial_reconnect_delay * :math.pow(2, min(attempts, 6))
    min(round(delay), @max_reconnect_delay)
  end

  defp normalize_order_status("NEW"), do: "open"
  defp normalize_order_status("PARTIALLY_FILLED"), do: "partially_filled"
  defp normalize_order_status("FILLED"), do: "filled"
  defp normalize_order_status("CANCELED"), do: "cancelled"
  defp normalize_order_status("REJECTED"), do: "rejected"
  defp normalize_order_status("EXPIRED"), do: "expired"
  defp normalize_order_status(other), do: String.downcase(to_string(other))

  defp parse_float(nil), do: 0.0
  defp parse_float(n) when is_float(n), do: n
  defp parse_float(n) when is_integer(n), do: n * 1.0
  defp parse_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  defp parse_float(_), do: 0.0

  defp to_decimal(nil), do: nil
  defp to_decimal(%Decimal{} = d), do: d
  defp to_decimal(n) when is_float(n), do: Decimal.from_float(n)
  defp to_decimal(n) when is_integer(n), do: Decimal.new(n)
  defp to_decimal(_), do: nil
end

# ============================================================================
# WEBSOCKET HANDLER (WebSockex callback module)
# ============================================================================

defmodule TradeEngine.Exchanges.Binance.UserDataStream.WebSocketHandler do
  @moduledoc false
  use WebSockex
  require Logger

  @impl true
  def handle_frame({:text, msg}, state) do
    case Jason.decode(msg) do
      {:ok, data} ->
        send(state.parent, {:ws_event, data})
        {:ok, state}

      {:error, _} ->
        {:ok, state}
    end
  end

  def handle_frame({:ping, _}, state) do
    {:reply, {:pong, ""}, state}
  end

  def handle_frame(_frame, state), do: {:ok, state}

  @impl true
  def handle_connect(_conn, state) do
    Logger.debug("UserDataStream.WebSocketHandler: connected")
    {:ok, state}
  end

  @impl true
  def handle_disconnect(%{reason: reason}, state) do
    Logger.warning("UserDataStream.WebSocketHandler: disconnected: #{inspect(reason)}")
    {:reconnect, 5_000, state}
  end

  @impl true
  def terminate(_reason, _state), do: :ok
end
