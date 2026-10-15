# For trade_engine_web
import Config
config :trade_engine,
  ecto_repos: [TradeEngine.Repo]
config :trade_engine, TradeEngine.Repo,
  username: "trading_nile_rivers",
  password: "REDACTED",
  hostname: "localhost",
  database: "trading_engine",
  stacktrace: true,
  show_sensitive_data_on_connection_error: true,
  pool_size: 10,
  log: false