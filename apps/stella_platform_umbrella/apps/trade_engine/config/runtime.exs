import Config

# Binance Configuration
binance_testnet = System.get_env("BINANCE_TESTNET") == "true"

config :trade_engine, :binance,
  testnet: binance_testnet,
  api_key: System.get_env("BINANCE_API_KEY", ""),
  api_secret: System.get_env("BINANCE_API_SECRET", ""),
  rate_limit: 1200  # requests per minute

config :trade_engine,
  # Use :demo for demo.binance.com keys (RECOMMENDED)
  # Use :testnet for testnet.binance.vision keys
  binance_mode: :demo,
  
  # Your API keys from demo.binance.com
  binance_api_key: System.get_env("BINANCE_API_KEY"),
  binance_api_secret: System.get_env("BINANCE_API_SECRET")
  
# Alert Notifications
config :trade_engine,
  slack_webhook_url: System.get_env("SLACK_WEBHOOK_URL"),
  notifications_enabled: System.get_env("NOTIFICATIONS_ENABLED", "false") == "true",
  nestjs_admin_url: System.get_env("NESTJS_ADMIN_URL", "http://localhost:3000")

# Conditional: Use testnet URL if enabled
if binance_testnet do
  Logger.info("🧪 Using BINANCE TESTNET (no rate limits)")
  
  config :binance,
    api_key: System.get_env("BINANCE_TEST_KEY", ""),
    api_secret: System.get_env("BINANCE_TEST_SECRET", ""),
    api_url: "https://testnet.binance.vision"
else
  Logger.info("🔴 Using BINANCE LIVE API (rate limited)")
  
  config :binance,
    api_key: System.get_env("BINANCE_API_KEY", ""),
    api_secret: System.get_env("BINANCE_API_SECRET", ""),
    api_url: "https://api.binance.com"
end