defmodule AdminGatewayWeb.Router do
  use AdminGatewayWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :authenticated do
    plug AdminGateway.Auth.JwtPlug
  end

  # Public routes (health check, etc.)
  scope "/api", AdminGatewayWeb do
    pipe_through :api

    get "/health", HealthController, :index

    # Infra REST endpoints (used as fallback when WS is unavailable)
    get "/phoenix/infra/metrics", InfraController, :metrics
    get "/phoenix/infra/exchanges", InfraController, :exchanges_health
    get "/phoenix/services/health", InfraController, :services_health
    get "/phoenix/services/health/category/:category", InfraController, :services_health_by_category
    get "/phoenix/services/health/:name", InfraController, :service_health_by_name
  end

  # Authenticated admin routes
  scope "/api", AdminGatewayWeb do
    pipe_through [:api, :authenticated]

    get "/admin/me", AuthController, :me
  end
end
