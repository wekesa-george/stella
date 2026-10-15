defmodule TradeEngine.MixProject do
  use Mix.Project

  def project do
    [
      app: :trade_engine,
      version: "0.1.0",
      build_path: "../../_build",
      config_path: "../../config/config.exs",
      deps_path: "../../deps",
      lockfile: "../../mix.lock",
      elixir: "~> 1.18",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      aliases: aliases()
    ]
  end

  # Run "mix help compile.app" to learn about applications.
  def application do
    [
      extra_applications: [:logger , :runtime_tools],
      mod: {TradeEngine.Application, []}
    ]
  end

  # Run "mix help deps" to learn about dependencies.
  defp deps do
    [
      # {:dep_from_hexpm, "~> 0.3.0"},
      # {:dep_from_git, git: "https://github.com/elixir-lang/my_dep.git", tag: "0.1.0"},
      # {:sibling_app_in_umbrella, in_umbrella: true}
      {:phoenix_pubsub, "~> 2.1"}, # FIX: Added for internal messaging
      {:phoenix_ecto, "~> 4.4"},
      {:ecto_sql, "~> 3.11"},
      {:postgrex, "~> 0.17"},
      {:bcrypt_elixir, "~> 3.3"},
      {:httpoison, "~> 2.0"},
      {:jason, "~> 1.4"},
      {:decimal, "~> 2.0"},
      {:ccxtex, "~> 0.4.0"},
      {:websockex, "~> 0.4.3"},
      {:nx, "~> 0.7"},
      # {:ortex, "~> 0.1"},  # Requires Rust toolchain — re-enable when cargo is installed
      {:axon, "~> 0.6"},
      {:scholar, "~> 0.3"}
    ]
  end
  defp aliases do
    [
      "ecto.setup": ["ecto.create --quiet", "ecto.migrate --quiet"],
      "ecto.reset": ["ecto.drop", "ecto.setup"],
      test: ["test"]
    ]
  end
end
