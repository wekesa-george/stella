defmodule TradeEngine.Risk.BalanceVerifier do
  @moduledoc """
  Periodically verifies exchange balances against virtual/allocated capital.

  Runs every 60 seconds. For each enabled futures credential:
  1. Fetches real exchange balance via Executor.get_balance
  2. Compares against virtual balance from CapitalAllocator (ETS)
  3. Fires alert if drift exceeds threshold

  Processes one credential per cycle (round-robin) to respect rate limits.
  With N credentials, full verification takes N minutes.
  """

  use GenServer
  require Logger

  alias TradeEngine.Exchanges.{Executor, CredentialDiscovery}

  @pubsub TradeEngine.PubSub
  @ets_table :balance_verifier_cache
  @tick_interval_ms 60_000
  @drift_alert_threshold_pct 10.0
  @drift_alert_threshold_usd 50.0

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

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    :ets.insert(@ets_table, {:stats, %{
      status: "running",
      last_check: nil,
      credentials_checked: 0,
      alerts_fired: 0,
      balances: %{}
    }})

    Logger.info("BalanceVerifier started — checking every #{div(@tick_interval_ms, 1000)}s")
    Process.send_after(self(), :verify, @tick_interval_ms)

    {:ok, %{
      credential_index: 0,
      credentials: [],
      last_refresh: nil,
      alerts_fired: 0,
      credentials_checked: 0
    }}
  end

  @impl true
  def handle_info(:verify, state) do
    Process.send_after(self(), :verify, @tick_interval_ms)
    {:noreply, verify_next_credential(state)}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp verify_next_credential(state) do
    # Refresh credential list every 5 minutes
    state = if state.last_refresh == nil or
               System.monotonic_time(:millisecond) - state.last_refresh > 300_000 do
      credentials = get_futures_credentials()
      %{state | credentials: credentials, last_refresh: System.monotonic_time(:millisecond), credential_index: 0}
    else
      state
    end

    if state.credentials == [] do
      state
    else
      # Round-robin: pick next credential
      idx = rem(state.credential_index, length(state.credentials))
      credential_id = Enum.at(state.credentials, idx)

      state = %{state | credential_index: idx + 1}
      check_credential_balance(credential_id, state)
    end
  end

  defp check_credential_balance(credential_id, state) do
    case Executor.get_balance(credential_id, market_type: "usds_futures") do
      {:ok, balance_data} ->
        total_wallet = parse_float(balance_data[:total_wallet_balance])
        available = parse_float(balance_data[:available_balance])
        unrealized = parse_float(balance_data[:cross_unrealized_pnl])

        # Get virtual balance
        virtual_capital = get_virtual_capital(credential_id)

        # Calculate drift
        drift_usd = total_wallet - virtual_capital
        drift_pct = if virtual_capital > 0, do: abs(drift_usd) / virtual_capital * 100, else: 0.0

        # Store in ETS
        balance_entry = %{
          credential_id: credential_id,
          exchange_wallet: total_wallet,
          exchange_available: available,
          exchange_unrealized: unrealized,
          virtual_capital: virtual_capital,
          drift_usd: drift_usd,
          drift_pct: Float.round(drift_pct, 2),
          checked_at: DateTime.utc_now() |> DateTime.to_iso8601()
        }

        update_stats(credential_id, balance_entry, state)

        # Alert if drift exceeds threshold
        if drift_pct > @drift_alert_threshold_pct and abs(drift_usd) > @drift_alert_threshold_usd do
          fire_drift_alert(credential_id, balance_entry)
          %{state | credentials_checked: state.credentials_checked + 1, alerts_fired: state.alerts_fired + 1}
        else
          %{state | credentials_checked: state.credentials_checked + 1}
        end

      {:error, _reason} ->
        state
    end
  rescue
    e ->
      Logger.debug("BalanceVerifier check failed for #{String.slice(to_string(credential_id), 0, 8)}: #{Exception.message(e)}")
      state
  end

  defp fire_drift_alert(credential_id, entry) do
    Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, %{
      alert_type: "balance_drift",
      category: "risk",
      severity: if(abs(entry.drift_usd) > 200, do: "critical", else: "warning"),
      title: "Balance drift: #{entry.drift_pct}% ($#{Float.round(entry.drift_usd, 2)})",
      message: "Credential #{String.slice(to_string(credential_id), 0, 8)}: exchange wallet $#{entry.exchange_wallet} vs virtual capital $#{entry.virtual_capital} (drift: $#{Float.round(entry.drift_usd, 2)})",
      metadata: entry,
      source: "balance_verifier"
    }})
  end

  defp update_stats(credential_id, entry, state) do
    [{:stats, current}] = :ets.lookup(@ets_table, :stats)
    balances = Map.put(current[:balances] || %{}, credential_id, entry)

    :ets.insert(@ets_table, {:stats, %{
      status: "running",
      last_check: DateTime.utc_now() |> DateTime.to_iso8601(),
      credentials_checked: state.credentials_checked + 1,
      alerts_fired: state.alerts_fired,
      credential_count: length(state.credentials),
      balances: balances
    }})
  rescue
    _ -> :ok
  end

  defp get_virtual_capital(credential_id) do
    try do
      case :ets.lookup(:virtual_balances, credential_id) do
        [{_, data}] -> parse_float(data[:active_capital] || data["active_capital"])
        _ -> 0.0
      end
    rescue
      _ -> 0.0
    end
  end

  defp get_futures_credentials do
    CredentialDiscovery.get_futures_credentials()
  end

  defp parse_float(nil), do: 0.0
  defp parse_float(n) when is_number(n), do: n * 1.0
  defp parse_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp parse_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  defp parse_float(_), do: 0.0
end
