# For trade_engine_web
import Config
config :trade_engine,
  ecto_repos: [TradeEngine.Repo]
config :trade_engine, TradeEngine.Repo,
  username: "postgres",
  password: "REDACTED",
  hostname: "170.168.103.207",
  port: 3212,
  database: "stella_platform_new",
  stacktrace: true,
  show_sensitive_data_on_connection_error: true,
  pool_size: 10,
  log: false


config :trade_engine, :kucoin,
  # API Version 2 is standard now
  api_key: System.get_env("KUCOIN_API_KEY"),
  api_secret: System.get_env("KUCOIN_API_SECRET"),
  api_passphrase: System.get_env("KUCOIN_API_PASSPHRASE"),
  base_url: System.get_env("KUCOIN_BASE_URL") || "https://api.kucoin.com"



config :trade_engine, :alpaca,
  # Trading API (for orders, positions, account)
  api_key: System.get_env("ALPACA_API_KEY"),
  secret_key: System.get_env("ALPACA_SECRET_KEY"),
  base_url: "https://paper-api.alpaca.markets",  # paper trading
  startup_delay_ms: 15_000,
  # Data API (for market data/bars) - can be same keys for paper trading
  data_api_key: System.get_env("ALPACA_DATA_API_KEY", System.get_env("ALPACA_API_KEY")),
  data_secret_key: System.get_env("ALPACA_DATA_SECRET_KEY", System.get_env("ALPACA_SECRET_KEY"))


# ========== TRADING AUTO-START CONFIGURATION ==========

# Enable/disable automatic trading startup
#config :trade_engine,
#  auto_start_long: true,      # Auto-start long (bullish) trading
#  auto_start_short: true,     # Auto-start short (bearish) trading
#  startup_delay_ms: 15_000,   # Wait 15s for market data to load
#  max_pairs: 100              # Number of trading pairs to analyze

# ========== ENVIRONMENT-SPECIFIC OVERRIDES ==========

# Development - Quick startup for testing
#if config_env() == :dev do
#  config :trade_engine,
#    auto_start_long: true,
#    auto_start_short: true,
#    startup_delay_ms: 10_000  # Shorter delay in dev
#end

# Production - Stable startup
#if config_env() == :prod do
#  config :trade_engine,
#    auto_start_long: true,
#    auto_start_short: true,
#    startup_delay_ms: 20_000  # Longer delay for production stability
#end

# Test - Disabled for unit tests
#if config_env() == :test do
#  config :trade_engine,
#    auto_start_long: false,
#    auto_start_short: false,
#    startup_delay_ms: 0
#end



# ============================================================================
# ADD THIS TO YOUR config/config.exs
# ============================================================================

# Binance Exchange Configuration
#config :trade_engine, :binance,
  # Set to false for mainnet
#  testnet: true,
  
  # Enable/disable WebSocket streams
#  enable_websocket_streams: true,
  
  # Number of top symbols to track
#  max_tracked_symbols: 300,
  
  # Timeframes to subscribe
#  timeframes: ~w(1m 5m 15m 30m 1h 4h 1d)

# ============================================================================
# ADD THIS TO YOUR config/runtime.exs
# ============================================================================

# Binance API Keys (from environment variables)
#config :trade_engine, :binance,
#  api_key: System.get_env("BINANCE_API_KEY", ""),
#  api_secret: System.get_env("BINANCE_API_SECRET", ""),
#  testnet: System.get_env("BINANCE_TESTNET", "true") == "true"

# ============================================================================
# ADD THIS TO YOUR .env file
# ============================================================================
# BINANCE_API_KEY=your_api_key_here
# BINANCE_API_SECRET=your_api_secret_here
# BINANCE_TESTNET=true

# ============================================================================
# PHASE 3 CONFIGURATION - Add to config/config.exs
# ============================================================================

