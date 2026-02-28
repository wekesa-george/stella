import Config

if System.get_env("PHX_SERVER") do
  config :admin_gateway, AdminGatewayWeb.Endpoint, server: true
end

config :admin_gateway, AdminGatewayWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT", "4000"))]

# Logto domain (override in production)
if logto_domain = System.get_env("LOGTO_DOMAIN") do
  config :admin_gateway, logto_domain: logto_domain
end

if cache_ttl = System.get_env("PERMISSIONS_CACHE_TTL") do
  config :admin_gateway, permissions_cache_ttl_ms: String.to_integer(cache_ttl) * 1000
end

# VectorBT backtesting worker
config :trade_engine, :vectorbt,
  worker_url: System.get_env("VECTORBT_WORKER_URL", "http://localhost:8100"),
  max_concurrent: String.to_integer(System.get_env("VECTORBT_MAX_CONCURRENT", "3")),
  timeout_ms: String.to_integer(System.get_env("VECTORBT_TIMEOUT_MS", "600000"))

if config_env() == :prod do
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"

  config :admin_gateway, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :admin_gateway, AdminGatewayWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [ip: {0, 0, 0, 0, 0, 0, 0, 0}],
    secret_key_base: secret_key_base

  # Production database
  database_url =
    System.get_env("DATABASE_URL") ||
      raise "environment variable DATABASE_URL is missing"

  config :trade_engine, TradeEngine.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10")
end
