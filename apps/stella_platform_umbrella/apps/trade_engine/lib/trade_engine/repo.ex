defmodule TradeEngine.Repo do
  use Ecto.Repo,
    otp_app: :trade_engine,
    adapter: Ecto.Adapters.Postgres

  # Note: Scrivener commented out to avoid compilation errors
  # Uncomment if you have scrivener properly installed in mix.exs
  # use Scrivener, page_size: 20
end