import Config

config :admin_gateway, AdminGatewayWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "REDACTED",
  server: false

config :trade_engine,
  enable_websocket_streams: false,
  enable_phase3_bridges: false,
  binance_testnet: true,
  tracked_symbols: []

config :trade_engine, TradeEngine.Repo,
  pool: Ecto.Adapters.SQL.Sandbox

config :logger, level: :warning

config :phoenix, :plug_init_mode, :runtime
