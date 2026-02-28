defmodule TradeEngine.Infra.ServiceRegistry do
  @moduledoc """
  Central registry of all external services the platform depends on.
  Adding a new service = adding one map to the appropriate list.
  """

  alias TradeEngine.Infra.HealthChecks

  @doc "Returns all registered service definitions."
  def services do
    List.flatten([
      exchanges(),
      notification_channels(),
      kyc_providers(),
      webhooks(),
      infrastructure()
    ])
  end

  @doc "Exchange services."
  def exchanges do
    [
      %{
        name: :binance_mainnet,
        category: :exchange,
        environment: :prod,
        check_interval_ms: 30_000,
        severity: :critical,
        health_check: &HealthChecks.Exchange.check_binance/0,
        description: "Binance mainnet exchange"
      },
      %{
        name: :binance_testnet,
        category: :exchange,
        environment: :sandbox,
        check_interval_ms: 60_000,
        severity: :low,
        health_check: &HealthChecks.Exchange.check_binance_testnet/0,
        description: "Binance testnet (sandbox)"
      }
    ]
  end

  @doc "Notification channel services."
  def notification_channels do
    [
      %{
        name: :email_smtp,
        category: :notification,
        environment: :prod,
        check_interval_ms: 120_000,
        severity: :warning,
        health_check: &HealthChecks.Noop.check/0,
        description: "SMTP email delivery"
      },
      %{
        name: :telegram_bot,
        category: :notification,
        environment: :prod,
        check_interval_ms: 60_000,
        severity: :warning,
        health_check: &HealthChecks.Noop.check/0,
        description: "Telegram bot notifications"
      }
    ]
  end

  @doc "KYC provider services."
  def kyc_providers do
    [
      %{
        name: :kyc_provider,
        category: :kyc,
        environment: :prod,
        check_interval_ms: 300_000,
        severity: :warning,
        health_check: &HealthChecks.Noop.check/0,
        description: "KYC identity verification provider"
      }
    ]
  end

  @doc "Webhook services."
  def webhooks do
    [
      %{
        name: :webhook_delivery,
        category: :webhook,
        environment: :prod,
        check_interval_ms: 120_000,
        severity: :warning,
        health_check: &HealthChecks.Noop.check/0,
        description: "Outbound webhook delivery"
      }
    ]
  end

  @doc "Infrastructure services (Coolify-managed)."
  def infrastructure do
    [
      %{
        name: :coolify_platform,
        category: :infrastructure,
        environment: :prod,
        check_interval_ms: 60_000,
        severity: :critical,
        health_check: &HealthChecks.Coolify.check_all/0,
        description: "Coolify infrastructure platform health"
      }
    ]
  end
end
