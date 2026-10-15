defmodule TradeEngine.Risk.CorrelationMonitor do
  @moduledoc """
  Monitors cross-bot position concentration and directional exposure.

  Called by RiskMonitor on its 60s tick. Checks:
  1. Single-asset concentration — too much capital in one symbol
  2. Directional exposure — too much net long or short
  3. Correlated exposure — highly correlated assets compounding risk

  Also exposes stats for the mission-critical dashboard via ETS cache.
  """

  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position

  @pubsub TradeEngine.PubSub
  @ets_table :correlation_monitor_cache

  # Default thresholds (can be overridden via risk_controls)
  @max_single_asset_pct 40.0
  @max_directional_pct 70.0
  @max_correlated_exposure_pct 60.0

  # Static correlation matrix for major pairs (vs BTC)
  # Values represent approximate 30-day rolling correlation
  @correlation_matrix %{
    {"BTCUSDT", "ETHUSDT"} => 0.85,
    {"BTCUSDT", "SOLUSDT"} => 0.75,
    {"BTCUSDT", "BNBUSDT"} => 0.70,
    {"BTCUSDT", "XRPUSDT"} => 0.65,
    {"BTCUSDT", "DOGEUSDT"} => 0.60,
    {"ETHUSDT", "SOLUSDT"} => 0.80,
    {"ETHUSDT", "BNBUSDT"} => 0.65,
    {"ETHUSDT", "XRPUSDT"} => 0.60,
    {"ETHUSDT", "DOGEUSDT"} => 0.55,
    {"SOLUSDT", "BNBUSDT"} => 0.60,
    {"SOLUSDT", "XRPUSDT"} => 0.55,
    {"SOLUSDT", "DOGEUSDT"} => 0.50,
    {"BNBUSDT", "XRPUSDT"} => 0.55,
    {"BNBUSDT", "DOGEUSDT"} => 0.50,
    {"XRPUSDT", "DOGEUSDT"} => 0.50
  }

  # ---------------------------------------------------------------------------
  # PUBLIC API
  # ---------------------------------------------------------------------------

  @doc "Initialize ETS cache (call from application.ex or a GenServer init)"
  def init_cache do
    if :ets.info(@ets_table) == :undefined do
      :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    end
    :ok
  end

  @doc """
  Assess correlation risk across all open positions.
  Returns :ok or {:breach, details}.
  Called by RiskMonitor on each 60s tick.
  """
  def assess do
    init_cache()
    positions = load_open_positions()

    if positions == [] do
      update_cache(%{status: "no_positions", breaches: []})
      :ok
    else
      total_capital = get_total_capital()
      analysis = analyze_positions(positions, total_capital)
      update_cache(analysis)

      case analysis.breaches do
        [] -> :ok
        breaches -> {:breach, %{breaches: breaches, analysis: analysis}}
      end
    end
  rescue
    e ->
      Logger.warning("CorrelationMonitor assess error: #{Exception.message(e)}")
      :ok
  end

  @doc "Get cached analysis for dashboard display"
  def stats do
    case :ets.lookup(@ets_table, :analysis) do
      [{:analysis, data}] -> data
      _ -> %{status: "not_started", breaches: []}
    end
  rescue
    ArgumentError -> %{status: "not_started", breaches: []}
  end

  @doc """
  Pre-entry check: can a new position be opened without breaching limits?
  Returns :ok or {:blocked, reason}.
  """
  def can_open?(symbol, side, size_usd) do
    positions = load_open_positions()
    total_capital = get_total_capital()

    if total_capital <= 0 do
      :ok
    else
      # Simulate adding the new position
      simulated = [%{symbol: normalize_symbol(symbol), side: to_string(side), value: size_usd} | positions]
      analysis = analyze_positions(simulated, total_capital)

      case analysis.breaches do
        [] -> :ok
        [breach | _] -> {:blocked, breach.reason}
      end
    end
  rescue
    _ -> :ok  # Don't block trading on errors
  end

  # ---------------------------------------------------------------------------
  # ANALYSIS
  # ---------------------------------------------------------------------------

  defp analyze_positions(positions, total_capital) do
    by_symbol = group_by_symbol(positions)
    by_direction = group_by_direction(positions)
    breaches = []

    # 1. Single-asset concentration
    {asset_concentration, asset_breaches} = check_asset_concentration(by_symbol, total_capital)
    breaches = breaches ++ asset_breaches

    # 2. Directional exposure
    {directional, dir_breaches} = check_directional_exposure(by_direction, total_capital)
    breaches = breaches ++ dir_breaches

    # 3. Correlated exposure
    {correlated, corr_breaches} = check_correlated_exposure(by_symbol, total_capital)
    breaches = breaches ++ corr_breaches

    %{
      status: if(breaches == [], do: "clear", else: "warning"),
      total_positions: length(positions),
      total_exposure_usd: Enum.reduce(positions, 0.0, fn p, acc -> acc + p.value end),
      total_capital: total_capital,
      asset_concentration: asset_concentration,
      directional_exposure: directional,
      correlated_exposure: correlated,
      breaches: breaches,
      checked_at: DateTime.utc_now() |> DateTime.to_iso8601()
    }
  end

  defp check_asset_concentration(by_symbol, total_capital) when total_capital > 0 do
    concentration = Enum.map(by_symbol, fn {symbol, positions} ->
      total_value = Enum.reduce(positions, 0.0, fn p, acc -> acc + p.value end)
      pct = total_value / total_capital * 100
      long_value = positions |> Enum.filter(&(&1.side in ["long", "buy"])) |> Enum.reduce(0.0, fn p, acc -> acc + p.value end)
      short_value = positions |> Enum.filter(&(&1.side in ["short", "sell"])) |> Enum.reduce(0.0, fn p, acc -> acc + p.value end)

      %{
        symbol: symbol,
        total_value: Float.round(total_value, 2),
        pct_of_capital: Float.round(pct, 1),
        position_count: length(positions),
        long_value: Float.round(long_value, 2),
        short_value: Float.round(short_value, 2)
      }
    end)
    |> Enum.sort_by(& &1.pct_of_capital, :desc)

    breaches = Enum.flat_map(concentration, fn c ->
      if c.pct_of_capital > @max_single_asset_pct do
        [%{
          type: "asset_concentration",
          severity: if(c.pct_of_capital > @max_single_asset_pct * 1.5, do: "critical", else: "warning"),
          reason: "#{c.symbol}: #{c.pct_of_capital}% of capital (limit: #{@max_single_asset_pct}%)",
          symbol: c.symbol,
          value: c.pct_of_capital,
          threshold: @max_single_asset_pct
        }]
      else
        []
      end
    end)

    {concentration, breaches}
  end
  defp check_asset_concentration(_, _), do: {[], []}

  defp check_directional_exposure(by_direction, total_capital) when total_capital > 0 do
    long_total = Map.get(by_direction, "long", 0.0) + Map.get(by_direction, "buy", 0.0)
    short_total = Map.get(by_direction, "short", 0.0) + Map.get(by_direction, "sell", 0.0)
    gross = long_total + short_total
    net = long_total - short_total
    net_pct = if gross > 0, do: abs(net) / total_capital * 100, else: 0.0

    directional = %{
      long_usd: Float.round(long_total, 2),
      short_usd: Float.round(short_total, 2),
      net_usd: Float.round(net, 2),
      net_direction: if(net >= 0, do: "long", else: "short"),
      net_pct_of_capital: Float.round(net_pct, 1),
      gross_usd: Float.round(gross, 2),
      long_short_ratio: if(short_total > 0, do: Float.round(long_total / short_total, 2), else: nil)
    }

    breaches = if net_pct > @max_directional_pct do
      [%{
        type: "directional_exposure",
        severity: if(net_pct > @max_directional_pct * 1.3, do: "critical", else: "warning"),
        reason: "Net #{directional.net_direction} exposure: #{Float.round(net_pct, 1)}% (limit: #{@max_directional_pct}%)",
        direction: directional.net_direction,
        value: net_pct,
        threshold: @max_directional_pct
      }]
    else
      []
    end

    {directional, breaches}
  end
  defp check_directional_exposure(_, _), do: {%{long_usd: 0, short_usd: 0, net_usd: 0, net_pct_of_capital: 0}, []}

  defp check_correlated_exposure(by_symbol, total_capital) when total_capital > 0 do
    # Calculate correlation-adjusted exposure
    symbols = Map.keys(by_symbol)

    # For each pair of symbols with known correlation, calculate effective exposure
    correlated_groups = for s1 <- symbols, s2 <- symbols, s1 < s2 do
      norm_s1 = normalize_symbol(s1)
      norm_s2 = normalize_symbol(s2)
      corr = get_correlation(norm_s1, norm_s2)

      if corr > 0.5 do
        v1 = by_symbol[s1] |> net_directional_value()
        v2 = by_symbol[s2] |> net_directional_value()

        # If both same direction, correlation amplifies risk
        if (v1 > 0 and v2 > 0) or (v1 < 0 and v2 < 0) do
          effective = abs(v1) + abs(v2) * corr
          %{
            pair: {norm_s1, norm_s2},
            correlation: corr,
            effective_exposure: Float.round(effective, 2),
            pct_of_capital: Float.round(effective / total_capital * 100, 1),
            values: %{s1 => Float.round(v1, 2), s2 => Float.round(v2, 2)}
          }
        end
      end
    end
    |> Enum.reject(&is_nil/1)
    |> Enum.sort_by(& &1.pct_of_capital, :desc)

    breaches = Enum.flat_map(correlated_groups, fn group ->
      if group.pct_of_capital > @max_correlated_exposure_pct do
        {s1, s2} = group.pair
        [%{
          type: "correlated_exposure",
          severity: "warning",
          reason: "#{s1}+#{s2} (#{Float.round(group.correlation * 100, 0)}% corr): #{group.pct_of_capital}% effective exposure",
          symbols: [s1, s2],
          value: group.pct_of_capital,
          threshold: @max_correlated_exposure_pct
        }]
      else
        []
      end
    end)

    {correlated_groups, breaches}
  end
  defp check_correlated_exposure(_, _), do: {[], []}

  # ---------------------------------------------------------------------------
  # DATA HELPERS
  # ---------------------------------------------------------------------------

  defp load_open_positions do
    from(p in Position,
      where: p.status == "open",
      select: %{
        id: p.id,
        bot_id: p.bot_id,
        symbol: p.symbol,
        side: p.position_type,
        quantity: p.quantity,
        entry_price: p.entry_price,
        current_price: p.current_price
      }
    )
    |> Repo.all(timeout: 5_000)
    |> Enum.map(fn pos ->
      qty = decimal_to_float(pos.quantity)
      price = decimal_to_float(pos.current_price) |> max(decimal_to_float(pos.entry_price))
      %{
        id: pos.id,
        bot_id: pos.bot_id,
        symbol: normalize_symbol(pos.symbol),
        side: pos.side || "long",
        value: qty * price
      }
    end)
  rescue
    _ -> []
  end

  defp get_total_capital do
    try do
      allocations = TradeEngine.Risk.CapitalAllocator.all_allocations()
      allocations
      |> Map.values()
      |> Enum.reduce(0.0, fn alloc, acc -> acc + (alloc[:total_capital] || 0.0) end)
    rescue
      _ -> 0.0
    end
  end

  defp group_by_symbol(positions) do
    Enum.group_by(positions, & &1.symbol)
  end

  defp group_by_direction(positions) do
    Enum.reduce(positions, %{}, fn pos, acc ->
      Map.update(acc, pos.side, pos.value, &(&1 + pos.value))
    end)
  end

  defp net_directional_value(positions) do
    Enum.reduce(positions, 0.0, fn pos, acc ->
      case pos.side do
        side when side in ["long", "buy"] -> acc + pos.value
        side when side in ["short", "sell"] -> acc - pos.value
        _ -> acc
      end
    end)
  end

  defp get_correlation(s1, s2) do
    Map.get(@correlation_matrix, {s1, s2}) ||
    Map.get(@correlation_matrix, {s2, s1}) ||
    0.0
  end

  defp normalize_symbol(symbol) do
    symbol
    |> String.split(":")
    |> List.first()
    |> String.replace("/", "")
    |> String.upcase()
  end

  defp update_cache(analysis) do
    :ets.insert(@ets_table, {:analysis, analysis})
  end

  defp decimal_to_float(nil), do: 0.0
  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(n) when is_number(n), do: n * 1.0
  defp decimal_to_float(_), do: 0.0
end
