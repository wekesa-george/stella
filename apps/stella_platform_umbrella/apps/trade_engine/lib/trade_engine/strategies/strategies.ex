defmodule TradeEngine.Strategies.Strategies do
  @moduledoc """
  Context module for querying and managing strategy.strategies table.
  """

  import Ecto.Query
  alias TradeEngine.Repo
  alias SysAdmin.Strategies.Strategy

  @doc "List all strategies, optionally filtered by type or status"
  def list(filters \\ %{}) do
    Strategy
    |> maybe_filter_type(filters)
    |> maybe_filter_status(filters)
    |> maybe_filter_live(filters)
    |> order_by([s], asc: s.name)
    |> Repo.all()
  end

  @doc "Get a strategy by ID"
  def get(id) do
    case Repo.get(Strategy, id) do
      nil -> {:error, :not_found}
      strategy -> {:ok, strategy}
    end
  end

  @doc "Get strategies by type"
  def list_by_type(type) do
    Strategy
    |> where([s], s.type == ^type)
    |> order_by([s], asc: s.name)
    |> Repo.all()
  end

  @doc "Create a new strategy"
  def create(attrs) do
    %Strategy{}
    |> Strategy.changeset(attrs)
    |> Repo.insert()
  end

  @doc "Update a strategy"
  def update(%Strategy{} = strategy, attrs) do
    strategy
    |> Strategy.changeset(attrs)
    |> Repo.update()
  end

  # ========================================================================
  # FILTERS
  # ========================================================================

  defp maybe_filter_type(query, %{type: type}) when is_binary(type) do
    where(query, [s], s.type == ^type)
  end
  defp maybe_filter_type(query, _), do: query

  defp maybe_filter_status(query, %{status: status}) when is_binary(status) do
    where(query, [s], s.status == ^status)
  end
  defp maybe_filter_status(query, _), do: query

  defp maybe_filter_live(query, %{live_only: true}) do
    where(query, [s], s.is_live_enabled == true)
  end
  defp maybe_filter_live(query, _), do: query
end
