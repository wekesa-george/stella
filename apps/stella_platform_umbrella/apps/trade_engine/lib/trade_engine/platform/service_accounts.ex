defmodule TradeEngine.Platform.ServiceAccounts do
  @moduledoc """
  Context module for service account CRUD operations.
  """

  import Ecto.Query
  alias TradeEngine.Repo
  alias TradeEngine.Platform.ServiceAccount

  def list do
    Repo.all(from sa in ServiceAccount, order_by: [asc: sa.name])
  end

  def get(id) do
    case Repo.get(ServiceAccount, id) do
      nil -> {:error, :not_found}
      sa -> {:ok, sa}
    end
  end

  def create(attrs) do
    %ServiceAccount{}
    |> ServiceAccount.changeset(attrs)
    |> Repo.insert()
  end

  def update(%ServiceAccount{} = sa, attrs) do
    sa
    |> ServiceAccount.changeset(attrs)
    |> Repo.update()
  end

  def delete(%ServiceAccount{} = sa) do
    Repo.delete(sa)
  end
end
