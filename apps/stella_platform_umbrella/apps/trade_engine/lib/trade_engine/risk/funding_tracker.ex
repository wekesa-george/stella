defmodule TradeEngine.Risk.FundingTracker do
  @moduledoc """
  Tracks funding rate payments for futures positions.

  Binance charges/pays funding fees every 8 hours (00:00, 08:00, 16:00 UTC).
  These payments affect real P&L but are NOT part of order fills.

  Runs every 30 minutes. For each enabled futures credential:
  1. Fetches recent income history (FUNDING_FEE type) from Binance
  2. Stores in ETS for dashboard display
  3. Fires alert if cumulative daily funding exceeds threshold

  Processes one credential per cycle (round-robin) like BalanceVerifier.
  """

  use GenServer
  require Logger

  alias TradeEngine.Exchanges.{Executor, CredentialDiscovery}

  @pubsub TradeEngine.PubSub
  @ets_table :funding_tracker_cache
  @tick_interval_ms 1_800_000  # 30 minutes
  @daily_funding_alert_threshold_usd 20.0

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def stats do
    case :ets.lookup(@ets_table, :stats) do
      [{:stats, data}] -> data
      _ -> %{status: "initializing"}
    end
  rescue
    ArgumentError -> %{status: "not_started"}
  end

  @doc "Get all funding records for a specific credential"
  def get_funding(credential_id) do
    case :ets.lookup(@ets_table, {:funding, credential_id}) do
      [{_, records}] -> records
      _ -> []
    end
  rescue
    _ -> []
  end

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    :ets.insert(@ets_table, {:stats, %{
      status: "running",
      last_check: nil,
      credentials_checked: 0,
      total_funding_today_usd: 0.0
    }})

    Logger.info("FundingTracker started — checking every #{div(@tick_interval_ms, 60_000)}min")
    # First check after 2 minutes (let other services start)
    Process.send_after(self(), :check_funding, 120_000)

    {:ok, %{
      credential_index: 0,
      credentials: [],
      last_refresh: nil,
      credentials_checked: 0
    }}
  end

  @impl true
  def handle_info(:check_funding, state) do
    Process.send_after(self(), :check_funding, @tick_interval_ms)
    {:noreply, check_next_credential(state)}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp check_next_credential(state) do
    # Refresh credential list every 10 minutes
    state = if state.last_refresh == nil or
               System.monotonic_time(:millisecond) - state.last_refresh > 600_000 do
      credentials = get_futures_credentials()
      %{state | credentials: credentials, last_refresh: System.monotonic_time(:millisecond), credential_index: 0}
    else
      state
    end

    if state.credentials == [] do
      state
    else
      idx = rem(state.credential_index, length(state.credentials))
      credential_id = Enum.at(state.credentials, idx)
      state = %{state | credential_index: idx + 1}
      fetch_funding_for_credential(credential_id, state)
    end
  end

  defp fetch_funding_for_credential(credential_id, state) do
    # Fetch last 24h of funding fees
    start_time = System.system_time(:millisecond) - 24 * 60 * 60 * 1000

    case Executor.get_income_history(credential_id,
      income_type: "FUNDING_FEE",
      start_time: start_time,
      limit: 100
    ) do
      {:ok, records} when is_list(records) ->
        # Store in ETS
        :ets.insert(@ets_table, {{:funding, credential_id}, records})

        # Calculate daily total
        daily_total = records
        |> Enum.map(fn r -> r.income || 0.0 end)
        |> Enum.sum()

        # Update stats
        update_stats(credential_id, daily_total, length(records), state)

        # Alert if daily funding exceeds threshold
        if abs(daily_total) > @daily_funding_alert_threshold_usd do
          direction = if daily_total < 0, do: "paid", else: "received"
          Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, %{
            alert_type: "funding_fee_high",
            category: "risk",
            severity: "warning",
            title: "High funding fees #{direction}: $#{Float.round(abs(daily_total), 2)} (24h)",
            message: "Credential #{String.slice(to_string(credential_id), 0, 8)}: #{length(records)} funding payments totaling $#{Float.round(daily_total, 2)} in last 24h",
            metadata: %{
              credential_id: credential_id,
              daily_total: daily_total,
              payment_count: length(records),
              direction: direction
            },
            source: "funding_tracker"
          }})
        end

        %{state | credentials_checked: state.credentials_checked + 1}

      {:error, _reason} ->
        state
    end
  rescue
    e ->
      Logger.debug("FundingTracker check failed: #{Exception.message(e)}")
      state
  end

  defp update_stats(credential_id, daily_total, count, state) do
    [{:stats, current}] = :ets.lookup(@ets_table, :stats)

    per_cred = Map.get(current, :per_credential, %{})
    per_cred = Map.put(per_cred, credential_id, %{
      daily_total: daily_total,
      payment_count: count,
      checked_at: DateTime.utc_now() |> DateTime.to_iso8601()
    })

    total_across_creds = per_cred
    |> Enum.map(fn {_, v} -> v.daily_total end)
    |> Enum.sum()

    :ets.insert(@ets_table, {:stats, %{
      status: "running",
      last_check: DateTime.utc_now() |> DateTime.to_iso8601(),
      credentials_checked: state.credentials_checked + 1,
      total_funding_today_usd: Float.round(total_across_creds, 2),
      per_credential: per_cred
    }})
  rescue
    _ -> :ok
  end

  defp get_futures_credentials do
    CredentialDiscovery.get_futures_credentials()
  end
end
