defmodule AdminGatewayWeb.InfraController do
  use AdminGatewayWeb, :controller

  @doc "GET /api/phoenix/infra/metrics — current BEAM/ETS/DB metrics"
  def metrics(conn, _params) do
    case TradeEngine.Infra.Monitor.get_metrics() do
      {:ok, metrics} ->
        json(conn, %{data: metrics})

      {:error, reason} ->
        conn
        |> put_status(503)
        |> json(%{error: to_string(reason)})
    end
  end

  @doc "GET /api/phoenix/services/health — all service health entries"
  def services_health(conn, _params) do
    case TradeEngine.Infra.ServiceHealthMonitor.get_all_health() do
      {:error, reason} ->
        conn
        |> put_status(503)
        |> json(%{error: to_string(reason)})

      services when is_list(services) ->
        serialized =
          Enum.map(services, fn entry ->
            %{
              service_name: to_string(entry.service_name),
              category: to_string(entry.category),
              environment: to_string(entry.environment),
              status: to_string(entry.status),
              message: entry.message,
              response_time_ms: entry.response_time_ms,
              checked_at: DateTime.to_iso8601(entry.checked_at),
              description: entry[:description]
            }
          end)

        json(conn, %{data: %{services: serialized}})
    end
  end

  @doc "GET /api/phoenix/services/health/:name — single service health"
  def service_health_by_name(conn, %{"name" => name}) do
    case TradeEngine.Infra.ServiceHealthMonitor.get_health(name) do
      {:ok, entry} ->
        json(conn, %{
          data: %{
            service_name: to_string(entry.service_name),
            category: to_string(entry.category),
            environment: to_string(entry.environment),
            status: to_string(entry.status),
            message: entry.message,
            response_time_ms: entry.response_time_ms,
            checked_at: DateTime.to_iso8601(entry.checked_at)
          }
        })

      {:error, reason} ->
        conn
        |> put_status(404)
        |> json(%{error: to_string(reason)})
    end
  end

  @doc "GET /api/phoenix/services/health/category/:category"
  def services_health_by_category(conn, %{"category" => category}) do
    case TradeEngine.Infra.ServiceHealthMonitor.get_health_by_category(category) do
      {:error, reason} ->
        conn
        |> put_status(503)
        |> json(%{error: to_string(reason)})

      services when is_list(services) ->
        serialized =
          Enum.map(services, fn entry ->
            %{
              service_name: to_string(entry.service_name),
              category: to_string(entry.category),
              environment: to_string(entry.environment),
              status: to_string(entry.status),
              message: entry.message,
              response_time_ms: entry.response_time_ms,
              checked_at: DateTime.to_iso8601(entry.checked_at)
            }
          end)

        json(conn, %{data: %{services: serialized}})
    end
  end

  @doc "GET /api/phoenix/infra/exchanges — exchange health from ETS"
  def exchanges_health(conn, _params) do
    health =
      try do
        :ets.tab2list(:exchange_health_cache)
        |> Enum.map(fn {exchange, data} -> Map.put(data, :exchange, exchange) end)
      rescue
        _ -> []
      end

    json(conn, %{data: %{exchanges: health}})
  end
end
