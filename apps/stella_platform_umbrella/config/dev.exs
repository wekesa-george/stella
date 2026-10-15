import Config

# Admin Gateway — dev endpoint
config :admin_gateway, AdminGatewayWeb.Endpoint,
  http: [ip: {0, 0, 0, 0}, port: 4000],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: "oL0MTEEQMWS8cj4+UTxu/3aA91Q7GtmfdL4a9TR9CfLinmvpNXQ8Tl3iE1awWKdh",
  watchers: []

config :admin_gateway, dev_routes: true

# Trade Engine — dev overrides
config :trade_engine,
  enable_websocket_streams: true,
  enable_phase3_bridges: false,
  binance_testnet: true,
  tracked_symbols: ~w(BTCUSDT ETHUSDT BNBUSDT SOLUSDT)

config :logger, :default_formatter, format: "[$level] $message\n"

config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime
