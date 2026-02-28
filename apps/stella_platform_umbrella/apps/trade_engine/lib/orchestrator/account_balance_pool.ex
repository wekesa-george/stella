defmodule TradeEngine.Orchestrator.AccountBalancePool do
  @moduledoc """
  Pool for managing account balance updates efficiently.
  """

  require Logger

  # ========== CHILD SPEC ==========

  @doc """
  Child spec for supervisor integration.
  """
  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]},
      type: :worker,
      restart: :permanent,
      shutdown: 5000
    }
  end

  # ========== START LINK ==========

  def start_link(opts \\ []) do
    Logger.info("🏊 AccountBalancePool started")
    {:ok, self()}
  end

  # ========== PUBLIC API ==========

  @doc "Submit a balance update task"
  def submit_update(user_id) do
    # Async balance update
    Task.start(fn ->
      update_account_balance(user_id)
    end)
  end

  @doc "Batch update multiple users"
  def batch_update(user_ids) when is_list(user_ids) do
    Enum.each(user_ids, &submit_update/1)
  end

  # ========== PRIVATE HELPERS ==========

  defp update_account_balance(user_id) do
    try do
      TradeEngine.Trading.PositionTracker.update_account_balance(user_id)
    rescue
      _e ->
        Logger.debug("Failed to update balance for user #{user_id}")
    end
  end
end