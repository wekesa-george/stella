defmodule TradeEngine.Bots.BotFSM do
  @moduledoc """
  Finite State Machine for bot lifecycle transitions.

  Pure module (no GenServer) that:
  - Validates transitions against a defined transition table
  - Runs guards before certain transitions
  - Records transition history to the database
  - Returns {:ok, record} or {:error, reason}
  """

  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Bots.BotStateTransition

  # Valid state transitions: from_status => [list of valid to_statuses]
  @transitions %{
    "initializing" => ~w(running error stopped),
    "running"      => ~w(paused stopping error circuit_broken maintenance),
    "paused"       => ~w(running stopping stopped error),
    "stopping"     => ~w(stopped error),
    "stopped"      => ~w(initializing error),
    "error"        => ~w(initializing stopped maintenance),
    "circuit_broken" => ~w(running stopped error maintenance),
    "maintenance"  => ~w(initializing stopped running error)
  }

  @doc "Check if a transition from `from` to `to` is valid."
  @spec valid_transition?(String.t(), String.t()) :: boolean()
  def valid_transition?(from, to) do
    to in Map.get(@transitions, from, [])
  end

  @doc "Get the list of valid next states from a given status."
  @spec valid_next_states(String.t()) :: [String.t()]
  def valid_next_states(from) do
    Map.get(@transitions, from, [])
  end

  @doc """
  Execute a state transition for a bot.

  Options:
  - `:trigger` - what caused the transition ("api_call", "auto_start", "heartbeat_timeout", "system")
  - `:reason` - human-readable explanation
  - `:metadata` - additional data (sub-step info, error details)
  - `:triggered_by` - user_id or "system"
  - `:bot` - the bot runtime map (used for guards)

  Returns `{:ok, transition_record}` or `{:error, reason}`.
  """
  @spec transition(String.t(), String.t(), String.t(), keyword()) ::
          {:ok, BotStateTransition.t()} | {:error, term()}
  def transition(bot_id, from, to, opts \\ []) do
    with :ok <- validate(from, to),
         :ok <- run_guards(from, to, opts) do
      attrs = %{
        bot_id: bot_id,
        from_status: from,
        to_status: to,
        trigger: Keyword.get(opts, :trigger, "api_call"),
        reason: Keyword.get(opts, :reason),
        metadata: Keyword.get(opts, :metadata, %{}),
        triggered_by: Keyword.get(opts, :triggered_by, "system")
      }

      case %BotStateTransition{} |> BotStateTransition.changeset(attrs) |> Repo.insert() do
        {:ok, record} ->
          Logger.info("🔄 Bot #{bot_id} transition: #{from} → #{to} (#{attrs.trigger})")
          {:ok, record}

        {:error, changeset} ->
          Logger.error("🔄❌ Failed to record transition #{from} → #{to}: #{inspect(changeset.errors)}")
          {:error, {:db_error, changeset}}
      end
    end
  rescue
    e ->
      Logger.error("🔄❌ Transition exception: #{inspect(e)}")
      {:error, {:exception, e}}
  end

  @doc "Get transition history for a bot, newest first."
  @spec get_history(String.t(), keyword()) :: [BotStateTransition.t()]
  def get_history(bot_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 50)

    from(t in BotStateTransition,
      where: t.bot_id == ^bot_id,
      order_by: [desc: t.transitioned_at],
      limit: ^limit
    )
    |> Repo.all()
  rescue
    _ -> []
  end

  # ── Private ──────────────────────────────────────────────────

  defp validate(from, to) do
    if valid_transition?(from, to) do
      :ok
    else
      {:error, {:invalid_transition, from, to}}
    end
  end

  # Guards for specific transitions
  defp run_guards(_from, "running", opts) do
    bot = Keyword.get(opts, :bot)

    cond do
      is_nil(bot) ->
        :ok

      (bot[:trading_pairs] || []) == [] ->
        {:error, :no_trading_pairs}

      true ->
        :ok
    end
  end

  defp run_guards(_from, _to, _opts), do: :ok
end
