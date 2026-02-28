defmodule AdminGateway.Auth.JWKS do
  @moduledoc """
  GenServer that fetches and caches JWKS (JSON Web Key Set) from Logto.
  Keys are refreshed every 10 minutes or on-demand if a key ID is not found.
  """

  use GenServer
  require Logger

  @refresh_interval :timer.minutes(10)

  # ── Client API ──

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Get the signing key for a given key ID (kid).
  Returns {:ok, jwk} or {:error, reason}.
  """
  def get_key(kid) do
    GenServer.call(__MODULE__, {:get_key, kid})
  end

  # ── Server Callbacks ──

  @impl true
  def init(_opts) do
    domain = Application.get_env(:admin_gateway, :logto_domain)

    unless domain do
      Logger.warning("LOGTO_DOMAIN not configured — JWT verification disabled")
    end

    state = %{
      domain: domain,
      keys: %{},
      last_fetched: nil
    }

    # Fetch keys on startup
    state = if domain, do: fetch_keys(state), else: state

    schedule_refresh()
    {:ok, state}
  end

  @impl true
  def handle_call({:get_key, kid}, _from, state) do
    case Map.get(state.keys, kid) do
      nil ->
        # Key not found — try a refresh in case keys were rotated
        state = fetch_keys(state)

        case Map.get(state.keys, kid) do
          nil -> {:reply, {:error, :key_not_found}, state}
          jwk -> {:reply, {:ok, jwk}, state}
        end

      jwk ->
        {:reply, {:ok, jwk}, state}
    end
  end

  @impl true
  def handle_info(:refresh, state) do
    state = if state.domain, do: fetch_keys(state), else: state
    schedule_refresh()
    {:noreply, state}
  end

  # ── Private ──

  defp fetch_keys(%{domain: nil} = state), do: state

  defp fetch_keys(%{domain: domain} = state) do
    jwks_uri = "#{String.trim_trailing(domain, "/")}/oidc/jwks"

    case HTTPoison.get(jwks_uri, [], recv_timeout: 5_000) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"keys" => raw_keys}} ->
            keys =
              raw_keys
              |> Enum.map(fn key_data ->
                jwk = JOSE.JWK.from_map(key_data)
                kid = Map.get(key_data, "kid")
                {kid, jwk}
              end)
              |> Enum.reject(fn {kid, _} -> is_nil(kid) end)
              |> Map.new()

            Logger.info("JWKS: cached #{map_size(keys)} keys from #{jwks_uri}")
            %{state | keys: keys, last_fetched: DateTime.utc_now()}

          {:error, reason} ->
            Logger.error("JWKS: failed to parse response from #{jwks_uri}: #{inspect(reason)}")
            state
        end

      {:ok, %HTTPoison.Response{status_code: status}} ->
        Logger.error("JWKS: #{jwks_uri} returned status #{status}")
        state

      {:error, %HTTPoison.Error{reason: reason}} ->
        Logger.error("JWKS: failed to fetch #{jwks_uri}: #{inspect(reason)}")
        state
    end
  end

  defp schedule_refresh do
    Process.send_after(self(), :refresh, @refresh_interval)
  end
end
