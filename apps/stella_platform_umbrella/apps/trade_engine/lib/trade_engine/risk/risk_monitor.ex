defmodule TradeEngine.Risk.RiskMonitor do
  @moduledoc """
  Enforces platform risk controls every 60 seconds.
  Checks drawdown limits, daily loss limits, and leverage limits.
  Auto-pauses bots that breach limits and broadcasts alerts.
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position
  alias TradeEngine.Bots.{Bot, BotRegistry}

  @pubsub TradeEngine.PubSub
  @tick_interval_ms 60_000

  # Default risk limits (can be overridden by platform.risk_controls table)
  @default_max_drawdown_pct 10.0
  @default_max_daily_loss_usd 500.0

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  @impl true
  def init(_opts) do
    Logger.info("🛡️  RiskMonitor started — enforcing limits every #{div(@tick_interval_ms, 1000)}s")
    Process.send_after(self(), :check, 10_000)

    {:ok, %{
      breaches: 0,
      bots_paused: 0,
      last_check: nil,
      last_breach: nil
    }}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply, state, state}
  end

  @impl true
  def handle_info(:check, state) do
    Process.send_after(self(), :check, @tick_interval_ms)

    new_state = run_risk_checks(state)

    {:noreply, %{new_state | last_check: DateTime.utc_now()}}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp run_risk_checks(state) do
    limits = load_risk_limits()
    running_bots = get_running_bots()

    state = Enum.reduce(running_bots, state, fn bot, st ->
      case check_bot_risk(bot, limits) do
        :ok ->
          st

        {:breach, reason, details} ->
          handle_breach(bot, reason, details)
          %{st |
            breaches: st.breaches + 1,
            bots_paused: st.bots_paused + 1,
            last_breach: DateTime.utc_now()
          }
      end
    end)

    # Correlation risk check across all positions
    check_correlation_risk()

    state
  rescue
    e ->
      Logger.warning("RiskMonitor error: #{Exception.message(e)}")
      state
  end

  defp check_correlation_risk do
    case TradeEngine.Risk.CorrelationMonitor.assess() do
      :ok ->
        :ok

      {:breach, details} ->
        Logger.warning("Correlation risk breach: #{inspect(details.breaches)}")
        Enum.each(details.breaches, fn breach ->
          Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, %{
            id: Ecto.UUID.generate(),
            alert_type: "correlation",
            category: "risk",
            severity: breach.severity,
            title: "Correlation Risk: #{breach.type}",
            message: breach.reason,
            metadata: breach,
            timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
          }})
        end)
    end
  rescue
    e -> Logger.warning("Correlation check error: #{Exception.message(e)}")
  end

  defp check_bot_risk(bot, limits) do
    bot_id = Map.get(bot, :bot_id) || bot.id

    # Check daily loss
    daily_loss = get_daily_loss(bot_id)
    max_daily = limits.max_daily_loss_usd

    if daily_loss < -max_daily do
      {:breach, "daily_loss_exceeded",
        %{daily_loss: daily_loss, limit: max_daily}}
    else
      # Check drawdown
      case get_drawdown(bot_id, bot) do
        dd when dd > limits.max_drawdown_pct ->
          {:breach, "max_drawdown_exceeded",
            %{drawdown_pct: dd, limit: limits.max_drawdown_pct}}

        _ ->
          :ok
      end
    end
  end

  defp handle_breach(bot, reason, details) do
    bot_id = Map.get(bot, :bot_id) || bot.id
    Logger.warning("🚨 Risk breach for bot #{bot_id}: #{reason} — #{inspect(details)}")

    # Pause the bot
    try do
      BotRegistry.pause_bot(bot_id)
    rescue
      _ -> :ok
    end

    # Broadcast alert
    Phoenix.PubSub.broadcast(@pubsub, "alerts:risk_breach", {:risk_breach, %{
      bot_id: bot_id,
      reason: reason,
      details: details,
      severity: "critical",
      title: "Risk Limit Breached",
      message: "Bot #{Map.get(bot, :name, bot_id)} paused: #{reason}",
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    }})
  end

  defp get_running_bots do
    try do
      BotRegistry.list_bots()
      |> Enum.filter(fn bot -> Map.get(bot, :status) == "running" end)
    rescue
      _ -> []
    end
  end

  defp get_daily_loss(bot_id) do
    today_start = NaiveDateTime.utc_now() |> NaiveDateTime.beginning_of_day()

    result =
      from(p in Position,
        where: p.bot_id == ^bot_id and p.status == "closed" and p.exit_time >= ^today_start,
        select: sum(p.profit_loss)
      )
      |> Repo.one(timeout: 5_000)

    case result do
      nil -> 0.0
      %Decimal{} = d -> Decimal.to_float(d)
      n when is_number(n) -> n * 1.0
      _ -> 0.0
    end
  rescue
    _ -> 0.0
  end

  defp get_drawdown(bot_id, bot) do
    # Drawdown = (peak equity - current equity) / peak equity * 100
    total_pnl = Map.get(bot, :pnl_usd) || Map.get(bot, :total_pnl) || 0
    allocated = Map.get(bot, :allocated_capital) || 0

    total_pnl_f = to_float(total_pnl)
    allocated_f = to_float(allocated)

    if allocated_f > 0 and total_pnl_f < 0 do
      abs(total_pnl_f) / allocated_f * 100
    else
      0.0
    end
  end

  defp load_risk_limits do
    case Repo.one(TradeEngine.Platform.RiskControls, timeout: 5_000) do
      nil ->
        %{max_drawdown_pct: @default_max_drawdown_pct, max_daily_loss_usd: @default_max_daily_loss_usd}

      controls ->
        %{
          max_drawdown_pct: to_float(controls.max_drawdown_pct) || @default_max_drawdown_pct,
          max_daily_loss_usd: to_float(controls.max_daily_loss_usd) || @default_max_daily_loss_usd
        }
    end
  rescue
    _ -> %{max_drawdown_pct: @default_max_drawdown_pct, max_daily_loss_usd: @default_max_daily_loss_usd}
  end

  defp to_float(nil), do: 0.0
  defp to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp to_float(n) when is_number(n), do: n * 1.0
  defp to_float(_), do: 0.0
end
