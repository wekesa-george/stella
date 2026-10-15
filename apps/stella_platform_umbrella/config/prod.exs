import Config

config :admin_gateway, AdminGatewayWeb.Endpoint,
  cache_static_manifest: "priv/static/cache_manifest.json"

config :logger, level: :info
