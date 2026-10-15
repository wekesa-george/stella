import Config

# ==============================================
# Admin Gateway (Phoenix WebSocket + API)
# ==============================================

config :admin_gateway,
  generators: [timestamp_type: :utc_datetime],
  logto_domain: System.get_env("LOGTO_DOMAIN", "https://auth.stella.praetocloud.com"),
  permissions_cache_ttl_ms: :timer.minutes(5)

config :admin_gateway, AdminGatewayWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: AdminGatewayWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: AdminGateway.PubSub,
  live_view: [signing_salt: "ITV4Jdez"]

# ==============================================
# Trade Engine (Core Trading Logic + DB)
# ==============================================

import_config "../apps/trade_engine/config/config.exs"

config :trade_engine, ecto_repos: [TradeEngine.Repo]

config :trade_engine, :binance,
  api_key: System.get_env("BINANCE_API_KEY", ""),
  api_secret: System.get_env("BINANCE_API_SECRET", ""),
  testnet: System.get_env("BINANCE_TESTNET", "true") == "true"

config :trade_engine,
  enable_websocket_streams: true,
  enable_phase3_bridges: true,
  binance_testnet: true,
  tracked_symbols: ~w(BTCUSDT ETHUSDT BNBUSDT SOLUSDT XRPUSDT
    ADAUSDT DOGEUSDT AVAXUSDT DOTUSDT MATICUSDT
    LINKUSDT UNIUSDT ATOMUSDT LTCUSDT NEARUSDT
    APTUSDT ARBUSDT OPUSDT INJUSDT SUIUSDT)

# ==============================================
# Shared
# ==============================================

config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

# Import environment specific config (MUST BE LAST)
import_config "#{config_env()}.exs"
