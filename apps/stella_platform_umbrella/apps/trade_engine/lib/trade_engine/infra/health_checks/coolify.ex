defmodule TradeEngine.Infra.HealthChecks.Coolify do
  @moduledoc """
  Health check for infrastructure services managed by Coolify.
  Calls the NestJS admin API to get Coolify service statuses.
  """

  require Logger

  @doc """
  Checks overall platform health via NestJS admin API.
  Returns unified health format compatible with ServiceHealthMonitor.
  """
  def check_all do
    url = "#{nestjs_url()}/infrastructure/status"

    case HTTPoison.get(url, [{"content-type", "application/json"}], recv_timeout: 10_000) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"data" => services}} when is_list(services) ->
            aggregate_health(services)

          {:ok, %{"data" => data}} when is_map(data) ->
            aggregate_health_from_map(data)

          {:ok, _other} ->
            {:ok, %{status: :healthy, message: "Coolify API responded OK", details: %{}}}

          {:error, _} ->
            {:ok, %{status: :degraded, message: "Coolify API returned invalid JSON", details: %{}}}
        end

      {:ok, %HTTPoison.Response{status_code: code}} ->
        {:ok, %{status: :degraded, message: "Coolify API returned HTTP #{code}", details: %{}}}

      {:error, %HTTPoison.Error{reason: reason}} ->
        Logger.warning("[Coolify] Health check failed: #{inspect(reason)}")
        {:ok, %{status: :unknown, message: "Coolify API unreachable", details: %{error: inspect(reason)}}}
    end
  rescue
    e ->
      Logger.warning("[Coolify] Health check exception: #{Exception.message(e)}")
      {:ok, %{status: :unknown, message: "Coolify API unreachable", details: %{}}}
  end

  # --- Private ---

  defp aggregate_health(services) when is_list(services) do
    statuses = Enum.map(services, fn svc ->
      name = Map.get(svc, "name", "unknown")
      raw_status = Map.get(svc, "status", "unknown")
      {name, map_status(raw_status)}
    end)

    down_count = Enum.count(statuses, fn {_, s} -> s == :down end)
    degraded_count = Enum.count(statuses, fn {_, s} -> s == :degraded end)
    total = length(statuses)

    {overall, message} =
      cond do
        down_count > 0 ->
          {:down, "#{down_count}/#{total} services down"}

        degraded_count > 0 ->
          {:degraded, "#{degraded_count}/#{total} services degraded"}

        true ->
          {:healthy, "All #{total} Coolify services healthy"}
      end

    details = Map.new(statuses, fn {name, status} -> {name, Atom.to_string(status)} end)

    {:ok, %{status: overall, message: message, details: details}}
  end

  defp aggregate_health_from_map(data) do
    services =
      Enum.map(data, fn {name, info} ->
        raw_status =
          cond do
            is_map(info) -> Map.get(info, "status", "unknown")
            is_binary(info) -> info
            true -> "unknown"
          end

        %{"name" => name, "status" => raw_status}
      end)

    aggregate_health(services)
  end

  defp map_status("running"), do: :healthy
  defp map_status("healthy"), do: :healthy
  defp map_status("stopped"), do: :down
  defp map_status("exited"), do: :down
  defp map_status("restarting"), do: :degraded
  defp map_status("degraded"), do: :degraded
  defp map_status(_), do: :unknown

  defp nestjs_url do
    Application.get_env(:trade_engine, :nestjs_admin_url, "http://localhost:3000")
  end
end
