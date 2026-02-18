defmodule StellaAdmin.Repo do
  use Ecto.Repo,
    otp_app: :stella_admin,
    adapter: Ecto.Adapters.Postgres
end
