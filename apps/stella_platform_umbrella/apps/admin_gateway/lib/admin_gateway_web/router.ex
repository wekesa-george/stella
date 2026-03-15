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

    # Credential endpoints
    get "/credentials/:id/balance", CredentialController, :balance
    get "/credentials/:id/positions", CredentialController, :positions
    post "/credentials/:id/positions/close", CredentialController, :close_position
    post "/credentials/:id/positions/close-all", CredentialController, :close_all_positions

    # Bot control endpoints
    post "/bots/kill-all", BotController, :kill_all
    post "/bots/:id/stop", BotController, :stop

    # Reconciliation endpoints (admin dashboard)
    get "/reconciliation/summary", ReconciliationController, :summary
    get "/reconciliation/positions", ReconciliationController, :positions
    get "/reconciliation/orders", ReconciliationController, :orders
    get "/reconciliation/balances", ReconciliationController, :balances
    get "/reconciliation/trades/:credential_id", ReconciliationController, :trades
    post "/reconciliation/cancel-orphans", ReconciliationController, :cancel_orphans
    post "/reconciliation/recover-orders", ReconciliationController, :recover_orders
    post "/reconciliation/clean-stale", ReconciliationController, :clean_stale

    # Sync routine
    get "/sync/anomalies", BotController, :sync_anomalies
    post "/sync/run", BotController, :sync_run
  end

  # Authenticated admin routes
  scope "/api", AdminGatewayWeb do
    pipe_through [:api, :authenticated]

    get "/admin/me", AuthController, :me
  end
end
