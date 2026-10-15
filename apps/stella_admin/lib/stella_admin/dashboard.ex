defmodule StellaAdmin.Dashboard do
  @moduledoc """
  The Dashboard context provides real-time metrics and statistics for the admin panel.
  All functions query the stella_platform_new database for live data.
  """

  import Ecto.Query
  alias StellaAdmin.Repo
  alias StellaAdmin.Auth.{User, KycRecord}
  alias StellaAdmin.Trading.{Bot, Position}
  alias StellaAdmin.Pool.WithdrawalRequest
  alias StellaAdmin.Risk.CircuitBreakerEvent
  alias StellaAdmin.Exchange.Adapter

  @doc """
  Returns a comprehensive map of platform metrics for the dashboard.
  """
  def get_platform_metrics do
    %{
      users: %{
        total: count_total_users(),
        active: count_active_users()
      },
      bots: %{
        active: count_active_bots(),
        by_status: get_bot_status_counts()
      },
      trading: %{
        total_equity_usd: calculate_total_platform_equity(),
        todays_pnl_usd: calculate_todays_aggregate_pnl(),
        open_positions: count_open_positions()
      },
      risk: %{
        recent_breakers: count_recent_breakers()
      },
      operations: %{
        pending_kyc: count_pending_kyc(),
        pending_withdrawals: count_pending_withdrawals()
      },
      services: %{
        exchanges: get_exchange_status_summary()
      }
    }
  end

  @doc """
  Counts total number of users on the platform.
  """
  def count_total_users do
    Repo.one(from u in User, select: count(u.id))
  end

  @doc """
  Counts active users (status: active).
  """
  def count_active_users do
    Repo.one(
      from u in User,
      where: u.status == :active,
      select: count(u.id)
    )
  end

  @doc """
  Counts currently active bots (status: running).
  """
  def count_active_bots do
    Repo.one(
      from b in Bot,
      where: b.status == :running,
      select: count(b.id)
    )
  end

  @doc """
  Returns counts of bots grouped by status.
  Example: %{running: 5, paused: 2, stopped: 10, error: 1}
  """
  def get_bot_status_counts do
    results = Repo.all(
      from b in Bot,
      group_by: b.status,
      select: {b.status, count(b.id)}
    )

    Enum.into(results, %{})
  end

  @doc """
  Calculates total platform equity in USD by summing:
  - All bot total_pnl_usd
  - All position unrealized_pnl_usd for open positions
  """
  def calculate_total_platform_equity do
    bot_pnl = Repo.one(
      from b in Bot,
      select: sum(b.total_pnl_usd)
    ) || Decimal.new(0)

    position_pnl = Repo.one(
      from p in Position,
      where: p.status == :open,
      select: sum(p.unrealized_pnl_usd)
    ) || Decimal.new(0)

    Decimal.add(bot_pnl, position_pnl)
  end

  @doc """
  Calculates today's aggregate P&L across all positions.
  Sums realized_pnl_usd for positions closed today.
  """
  def calculate_todays_aggregate_pnl do
    today_start = DateTime.utc_now() |> DateTime.to_date() |> DateTime.new!(~T[00:00:00])

    Repo.one(
      from p in Position,
      where: p.closed_at >= ^today_start,
      select: sum(p.realized_pnl_usd)
    ) || Decimal.new(0)
  end

  @doc """
  Counts the number of open positions.
  """
  def count_open_positions do
    Repo.one(
      from p in Position,
      where: p.status == :open,
      select: count(p.id)
    )
  end

  @doc """
  Counts recent circuit breaker events (last 24 hours).
  """
  def count_recent_breakers do
    twenty_four_hours_ago = DateTime.utc_now() |> DateTime.add(-24, :hour)

    Repo.one(
      from e in CircuitBreakerEvent,
      where: e.created_at >= ^twenty_four_hours_ago,
      select: count(e.id)
    )
  end

  @doc """
  Returns a summary of service health.
  Currently returns bot heartbeat status.
  """
  def get_service_health_summary do
    five_minutes_ago = DateTime.utc_now() |> DateTime.add(-5, :minute)

    healthy_bots = Repo.one(
      from b in Bot,
      where: b.status == :running and b.last_heartbeat_at >= ^five_minutes_ago,
      select: count(b.id)
    )

    stale_bots = Repo.one(
      from b in Bot,
      where: b.status == :running and (is_nil(b.last_heartbeat_at) or b.last_heartbeat_at < ^five_minutes_ago),
      select: count(b.id)
    )

    %{
      bots_healthy: healthy_bots,
      bots_stale: stale_bots
    }
  end

  @doc """
  Counts pending KYC records (status: pending or in_review).
  """
  def count_pending_kyc do
    Repo.one(
      from k in KycRecord,
      where: k.status in [:pending, :in_review],
      select: count(k.id)
    )
  end

  @doc """
  Counts pending withdrawal requests (status: pending).
  """
  def count_pending_withdrawals do
    Repo.one(
      from w in WithdrawalRequest,
      where: w.status == "pending",
      select: count(w.id)
    )
  end

  @doc """
  Returns exchange adapter status summary.
  Example: %{active: 5, inactive: 2, maintenance: 1}
  """
  def get_exchange_status_summary do
    results = Repo.all(
      from a in Adapter,
      group_by: a.status,
      select: {a.status, count(a.id)}
    )

    Enum.into(results, %{})
  end
end
