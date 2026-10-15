defmodule TradeEngine.Infra.HealthChecks.Noop do
  @moduledoc """
  Placeholder health check for services registered but not yet wired to real checks.
  """

  def check do
    {:ok, %{status: :healthy, message: "No check implemented", details: %{}}}
  end
end
