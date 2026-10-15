defmodule TradeEngine.Risk.SlippageMonitor do
  @moduledoc """
  Monitors execution slippage by comparing expected_price (market price at signal time)
  vs actual avg_fill_price from exchange.

  Runs every 5 minutes to analyze recent fills and compute:
  - Average slippage (bps) per symbol, per bot, platform-wide
  - Slippage cost in USD
  - Anomaly detection (sudden spikes)

  Stores results in ETS for dashboard display.
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Order

  @pubsub TradeEngine.PubSub
  @ets_table :slippage_monitor_cache
  @tick_interval_ms 300_000  # 5 minutes

  # Alert thresholds (basis points)
  @warning_avg_bps 5.0
  @critical_avg_bps 15.0
  @critical_single_bps 30.0

  # ---------------------------------------------------------------------------
  # CLIENT API
  # ---------------------------------------------------------------------------

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Get current slippage stats for dashboard"
  def stats do
    case :ets.lookup(@ets_table, :stats) do
      [{:stats, data}] -> data
      _ -> default_stats()
    end
  rescue
    ArgumentError -> default_stats()
  end

  # ---------------------------------------------------------------------------
  # GENSERVER
  # ---------------------------------------------------------------------------

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    :ets.insert(@ets_table, {:stats, default_stats()})

    Logger.info("SlippageMonitor started — analyzing fills every #{div(@tick_interval_ms, 1000)}s")
    Process.send_after(self(), :analyze, 60_000)

    {:ok, %{
      total_orders_analyzed: 0,
      total_slippage_usd: 0.0,
      alert_count: 0
    }}
  end

  @impl true
  def handle_info(:analyze, state) do
    Process.send_after(self(), :analyze, @tick_interval_ms)
    new_state = run_analysis(state)
    {:noreply, new_state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ---------------------------------------------------------------------------
  # ANALYSIS
  # ---------------------------------------------------------------------------

  defp run_analysis(state) do
    # Get filled orders from last 1 hour that have slippage data
    orders_1h = load_recent_fills(60)
    orders_24h = load_recent_fills(1440)

    analysis_1h = analyze_orders(orders_1h)
    analysis_24h = analyze_orders(orders_24h)

    # Check for alerts
    alerts = check_alerts(analysis_1h)
    broadcast_alerts(alerts)

    stats = %{
      last_1h: analysis_1h,
      last_24h: analysis_24h,
      alerts: Enum.map(alerts, fn a -> %{severity: a.severity, message: a.message} end),
      analyzed_at: DateTime.utc_now() |> DateTime.to_iso8601(),
      status: cond do
        Enum.any?(alerts, & &1.severity == "critical") -> "critical"
        Enum.any?(alerts, & &1.severity == "warning") -> "warning"
        true -> "normal"
      end
    }

    :ets.insert(@ets_table, {:stats, stats})

    %{state |
      total_orders_analyzed: state.total_orders_analyzed + length(orders_1h),
      total_slippage_usd: state.total_slippage_usd + (analysis_1h.total_slippage_usd || 0.0),
      alert_count: state.alert_count + length(alerts)
    }
  rescue
    e ->
      Logger.warning("SlippageMonitor analysis error: #{Exception.message(e)}")
      state
  end

  defp load_recent_fills(minutes) do
    cutoff = DateTime.utc_now() |> DateTime.add(-minutes * 60, :second)

    from(o in Order,
      where: o.status == "filled" and o.execution_time >= ^cutoff,
      select: %{
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        bot_id: o.bot_id,
        quantity: o.quantity,
        execution_price: o.execution_price,
        metadata: o.metadata,
        execution_time: o.execution_time
      }
    )
    |> Repo.all(timeout: 10_000)
  rescue
    _ -> []
  end

  defp analyze_orders([]), do: empty_analysis()
  defp analyze_orders(orders) do
    # Extract slippage from orders that have expected_price in metadata
    slippage_data = orders
    |> Enum.map(fn order ->
      expected = get_expected_price(order)
      actual = decimal_to_float(order.execution_price)
      qty = decimal_to_float(order.quantity)

      if expected > 0 and actual > 0 do
        slippage_bps = abs(actual - expected) / expected * 10_000
        slippage_usd = abs(actual - expected) * qty
        direction = if actual > expected, do: "unfavorable", else: "favorable"
        # For buys, higher price = unfavorable. For sells, lower price = unfavorable.
        actual_direction = case order.side do
          "buy" -> if(actual > expected, do: "unfavorable", else: "favorable")
          "sell" -> if(actual < expected, do: "unfavorable", else: "favorable")
          _ -> direction
        end

        %{
          order_id: order.id,
          symbol: order.symbol,
          bot_id: order.bot_id,
          side: order.side,
          expected_price: expected,
          actual_price: actual,
          slippage_bps: slippage_bps,
          slippage_usd: slippage_usd,
          direction: actual_direction,
          executed_at: order.execution_time
        }
      end
    end)
    |> Enum.reject(&is_nil/1)

    if slippage_data == [] do
      %{
        total_orders: length(orders),
        orders_with_slippage_data: 0,
        avg_slippage_bps: nil,
        max_slippage_bps: nil,
        total_slippage_usd: 0.0,
        unfavorable_pct: nil,
        by_symbol: %{},
        by_bot: %{},
        worst_fills: [],
        status: "no_data"
      }
    else
      avg_bps = Enum.reduce(slippage_data, 0.0, fn d, acc -> acc + d.slippage_bps end) / length(slippage_data)
      max_bps = Enum.max_by(slippage_data, & &1.slippage_bps) |> Map.get(:slippage_bps)
      total_usd = Enum.reduce(slippage_data, 0.0, fn d, acc -> acc + d.slippage_usd end)
      unfavorable = Enum.count(slippage_data, & &1.direction == "unfavorable")
      unfavorable_pct = unfavorable / length(slippage_data) * 100

      by_symbol = slippage_data
      |> Enum.group_by(& &1.symbol)
      |> Enum.map(fn {symbol, fills} ->
        avg = Enum.reduce(fills, 0.0, fn d, acc -> acc + d.slippage_bps end) / length(fills)
        cost = Enum.reduce(fills, 0.0, fn d, acc -> acc + d.slippage_usd end)
        {symbol, %{
          avg_bps: Float.round(avg, 2),
          count: length(fills),
          total_cost_usd: Float.round(cost, 4)
        }}
      end)
      |> Map.new()

      by_bot = slippage_data
      |> Enum.reject(fn d -> is_nil(d.bot_id) end)
      |> Enum.group_by(& &1.bot_id)
      |> Enum.map(fn {bot_id, fills} ->
        avg = Enum.reduce(fills, 0.0, fn d, acc -> acc + d.slippage_bps end) / length(fills)
        {bot_id, %{avg_bps: Float.round(avg, 2), count: length(fills)}}
      end)
      |> Map.new()

      worst_fills = slippage_data
      |> Enum.sort_by(& &1.slippage_bps, :desc)
      |> Enum.take(5)
      |> Enum.map(fn d ->
        %{
          symbol: d.symbol,
          slippage_bps: Float.round(d.slippage_bps, 2),
          slippage_usd: Float.round(d.slippage_usd, 4),
          direction: d.direction,
          expected: d.expected_price,
          actual: d.actual_price
        }
      end)

      %{
        total_orders: length(orders),
        orders_with_slippage_data: length(slippage_data),
        avg_slippage_bps: Float.round(avg_bps, 2),
        max_slippage_bps: Float.round(max_bps, 2),
        total_slippage_usd: Float.round(total_usd, 4),
        unfavorable_pct: Float.round(unfavorable_pct, 1),
        by_symbol: by_symbol,
        by_bot: by_bot,
        worst_fills: worst_fills,
        status: "active"
      }
    end
  end

  defp check_alerts(analysis) do
    alerts = []

    # Check average slippage
    alerts = case analysis.avg_slippage_bps do
      nil -> alerts
      avg when avg >= @critical_avg_bps ->
        [%{severity: "critical", message: "Avg slippage #{Float.round(avg, 1)} bps exceeds #{@critical_avg_bps} bps threshold"} | alerts]
      avg when avg >= @warning_avg_bps ->
        [%{severity: "warning", message: "Avg slippage #{Float.round(avg, 1)} bps exceeds #{@warning_avg_bps} bps threshold"} | alerts]
      _ -> alerts
    end

    # Check max single fill
    alerts = case analysis.max_slippage_bps do
      nil -> alerts
      max when max >= @critical_single_bps ->
        [%{severity: "critical", message: "Single fill slippage #{Float.round(max, 1)} bps exceeds #{@critical_single_bps} bps"} | alerts]
      _ -> alerts
    end

    alerts
  end

  defp broadcast_alerts([]), do: :ok
  defp broadcast_alerts(alerts) do
    Enum.each(alerts, fn alert ->
      Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, %{
        id: Ecto.UUID.generate(),
        alert_type: "slippage",
        category: "execution",
        severity: alert.severity,
        title: "Slippage Alert",
        message: alert.message,
        metadata: %{},
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
      }})
    end)
  end

  # ---------------------------------------------------------------------------
  # HELPERS
  # ---------------------------------------------------------------------------

  defp get_expected_price(order) do
    cond do
      is_map(order.metadata) and is_number(order.metadata["expected_price"]) ->
        order.metadata["expected_price"] * 1.0

      is_map(order.metadata) and is_binary(order.metadata["expected_price"]) ->
        case Float.parse(order.metadata["expected_price"]) do
          {f, _} -> f
          :error -> 0.0
        end

      true -> 0.0
    end
  end

  defp empty_analysis do
    %{
      total_orders: 0,
      orders_with_slippage_data: 0,
      avg_slippage_bps: nil,
      max_slippage_bps: nil,
      total_slippage_usd: 0.0,
      unfavorable_pct: nil,
      by_symbol: %{},
      by_bot: %{},
      worst_fills: [],
      status: "no_data"
    }
  end

  defp default_stats do
    %{
      last_1h: empty_analysis(),
      last_24h: empty_analysis(),
      alerts: [],
      analyzed_at: nil,
      status: "not_started"
    }
  end

  defp decimal_to_float(nil), do: 0.0
  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(n) when is_number(n), do: n * 1.0
  defp decimal_to_float(_), do: 0.0
end
