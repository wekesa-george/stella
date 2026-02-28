defmodule TradeEngine.Strategies.Backtests do
  @moduledoc """
  Context module for managing strategy.backtest_runs.
  """

  import Ecto.Query
  alias TradeEngine.Repo
  alias TradeEngine.Strategies.BacktestRun

  @doc "Create a new backtest run with strategy config snapshot"
  def create(strategy_id, user_id, config) do
    # Snapshot the strategy config at queue time
    config_snapshot = build_config_snapshot(strategy_id, config)

    attrs =
      config
      |> Map.take(~w(trading_pair exchange_code timeframe start_date end_date initial_capital_usd metadata)a)
      |> Map.merge(%{
        strategy_id: strategy_id,
        user_id: user_id,
        config_snapshot: config_snapshot
      })

    %BacktestRun{}
    |> BacktestRun.create_changeset(attrs)
    |> Repo.insert()
  end

  @doc "Get a single backtest run by ID"
  def get(id) do
    case Repo.get(BacktestRun, id) do
      nil -> {:error, :not_found}
      run -> {:ok, run}
    end
  end

  @doc "List backtest runs with optional filters"
  def list(filters \\ %{}) do
    BacktestRun
    |> maybe_filter(:strategy_id, filters)
    |> maybe_filter(:user_id, filters)
    |> maybe_filter(:status, filters)
    |> order_by([r], desc: r.created_at)
    |> maybe_limit(filters)
    |> Repo.all()
  end

  @doc "List all backtest runs for a strategy"
  def list_by_strategy(strategy_id) do
    BacktestRun
    |> where([r], r.strategy_id == ^strategy_id)
    |> order_by([r], desc: r.created_at)
    |> Repo.all()
  end

  @doc "Update status and optional result fields"
  def update_status(id, status, attrs \\ %{}) do
    case get(id) do
      {:ok, run} ->
        run
        |> BacktestRun.complete_changeset(Map.put(attrs, :status, status))
        |> Repo.update()

      error ->
        error
    end
  end

  @doc "Update progress percentage and candles processed"
  def update_progress(id, pct, candles) do
    case get(id) do
      {:ok, run} ->
        run
        |> BacktestRun.progress_changeset(%{
          progress_pct: pct,
          candles_processed: candles,
          status: "running",
          started_at: run.started_at || DateTime.utc_now()
        })
        |> Repo.update()

      error ->
        error
    end
  end

  @doc "Cancel a backtest run (only if queued or running)"
  def cancel(id) do
    case get(id) do
      {:ok, %{status: status} = run} when status in ["queued", "running"] ->
        run
        |> BacktestRun.complete_changeset(%{status: "cancelled", completed_at: DateTime.utc_now()})
        |> Repo.update()

      {:ok, _} ->
        {:error, :not_cancellable}

      error ->
        error
    end
  end

  # ============================================================================
  # PRIVATE
  # ============================================================================

  defp build_config_snapshot(strategy_id, config) do
    strategy_data =
      case TradeEngine.Strategies.Strategies.get(strategy_id) do
        {:ok, strategy} ->
          %{
            name: strategy.name,
            type: strategy.type,
            config: strategy.config,
            entry_conditions: strategy.entry_conditions,
            exit_conditions: strategy.exit_conditions,
            indicators: strategy.indicators,
            position_sizing: strategy.position_sizing
          }

        _ ->
          %{}
      end

    # Merge strategy defaults with user overrides
    user_overrides = Map.get(config, :config_overrides, %{})
    Map.merge(strategy_data, %{user_overrides: user_overrides})
  end

  defp maybe_filter(query, field, filters) do
    case Map.get(filters, field) do
      nil -> query
      value -> where(query, [r], field(r, ^field) == ^value)
    end
  end

  defp maybe_limit(query, %{limit: limit}) when is_integer(limit), do: limit(query, ^limit)
  defp maybe_limit(query, _), do: query
end
