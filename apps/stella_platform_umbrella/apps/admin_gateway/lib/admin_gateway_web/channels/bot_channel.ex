defmodule AdminGatewayWeb.BotChannel do
  use AdminGatewayWeb, :channel

  alias TradeEngine.Bots.BotRegistry

  @pubsub TradeEngine.PubSub

  @impl true
  def join("bot:lobby", _params, socket) do
    send(self(), :after_join)
    {:ok, socket}
  end

  def join("bot:" <> bot_id, _params, socket) do
    send(self(), :after_join)
    {:ok, assign(socket, :bot_id, bot_id)}
  end

  @impl true
  def handle_info(:after_join, socket) do
    Phoenix.PubSub.subscribe(@pubsub, "bots:updates")

    case socket.assigns do
      %{bot_id: bot_id} ->
        Phoenix.PubSub.subscribe(@pubsub, "bot:#{bot_id}")

        case BotRegistry.get_bot(bot_id) do
          {:ok, runtime} -> push(socket, "bot_snapshot", serialize_bot(runtime))
          _ -> :ok
        end

      _ ->
        bots = BotRegistry.list_bots() |> Enum.map(&serialize_bot/1)
        push(socket, "bot_list", %{bots: bots})
    end

    {:noreply, socket}
  end

  # PubSub events from trade_engine
  def handle_info({:bot_started, bot}, socket) do
    push(socket, "bot_started", serialize_bot(bot))
    {:noreply, socket}
  end

  def handle_info({:bot_stopped, bot}, socket) do
    push(socket, "bot_stopped", serialize_bot(bot))
    {:noreply, socket}
  end

  def handle_info({:bot_updated, bot}, socket) do
    push(socket, "bot_updated", serialize_bot(bot))
    {:noreply, socket}
  end

  def handle_info({:bot_heartbeat, bot_id, stats}, socket) do
    push(socket, "bot_heartbeat", Map.put(stats, :bot_id, bot_id))
    {:noreply, socket}
  end

  # BotRegistry broadcasts heartbeats as {atom, map} — handle that pattern too
  def handle_info({:bot_heartbeat, payload}, socket) when is_map(payload) do
    push(socket, "bot_heartbeat", payload)
    {:noreply, socket}
  end

  def handle_info({:bot_error, bot_id, error}, socket) do
    push(socket, "bot_error", %{bot_id: bot_id, error: to_string(error)})
    {:noreply, socket}
  end

  def handle_info({:bot_error, payload}, socket) when is_map(payload) do
    push(socket, "bot_error", payload)
    {:noreply, socket}
  end

  def handle_info({:bot_transition, payload}, socket) do
    push(socket, "bot_transition", payload)
    {:noreply, socket}
  end

  def handle_info({:bot_init_step, payload}, socket) do
    push(socket, "bot_init_step", payload)
    {:noreply, socket}
  end

  def handle_info({:bot_log, entry}, socket) do
    push(socket, "bot_log", %{
      id: Ecto.UUID.generate(),
      bot_id: entry.bot_id,
      level: to_string(entry.level),
      category: to_string(entry.category),
      message: entry.message,
      metadata: entry.metadata || %{},
      created_at: DateTime.to_iso8601(entry.created_at)
    })
    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  # Inbound commands from frontend
  @impl true
  def handle_in("start_bot", %{"bot_id" => bot_id}, socket) do
    case BotRegistry.start_bot(bot_id) do
      :ok -> {:reply, {:ok, %{status: "started"}}, socket}
      {:error, reason} -> {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  def handle_in("stop_bot", %{"bot_id" => bot_id}, socket) do
    case BotRegistry.stop_bot(bot_id) do
      :ok -> {:reply, {:ok, %{status: "stopped"}}, socket}
      {:error, reason} -> {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  def handle_in("pause_bot", %{"bot_id" => bot_id}, socket) do
    case BotRegistry.pause_bot(bot_id) do
      :ok -> {:reply, {:ok, %{status: "paused"}}, socket}
      {:error, reason} -> {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  defp serialize_bot(bot) when is_map(bot) do
    %{
      id: Map.get(bot, :id) || Map.get(bot, :bot_id),
      name: Map.get(bot, :name, "unnamed"),
      status: Map.get(bot, :status, "unknown"),
      user_id: Map.get(bot, :user_id),
      service_account_id: Map.get(bot, :service_account_id),
      strategy_id: Map.get(bot, :strategy_id),
      strategy: Map.get(bot, :strategy),
      strategy_type: Map.get(bot, :strategy_type),
      exchange: Map.get(bot, :exchange),
      owner_name: Map.get(bot, :owner_name),
      owner_email: Map.get(bot, :owner_email),
      credential_id: Map.get(bot, :credential_id),
      trading_pairs: Map.get(bot, :trading_pairs, []),
      config: Map.get(bot, :config, %{}),
      uptime_seconds: Map.get(bot, :uptime_seconds, 0),
      total_pnl: Map.get(bot, :total_pnl, 0),
      total_trades: Map.get(bot, :total_trades, 0),
      winning_trades: Map.get(bot, :winning_trades, 0),
      losing_trades: Map.get(bot, :losing_trades, 0),
      win_rate: Map.get(bot, :win_rate),
      open_positions: Map.get(bot, :open_positions, 0),
      allocated_capital: Map.get(bot, :allocated_capital, 0),
      active_capital: Map.get(bot, :active_capital, 0),
      error_count: Map.get(bot, :error_count, 0),
      last_error: Map.get(bot, :last_error),
      started_at: Map.get(bot, :started_at),
      stopped_at: Map.get(bot, :stopped_at),
      last_heartbeat: Map.get(bot, :last_heartbeat),
      last_trade_at: Map.get(bot, :last_trade_at),
      created_at: Map.get(bot, :created_at),
      init_step: Map.get(bot, :init_step)
    }
  end
end
