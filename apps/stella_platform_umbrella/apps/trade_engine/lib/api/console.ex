defmodule TradeEngine.API.Console do
  @moduledoc """
  🎮 IEx Console Helpers for quick API testing.

  Usage in IEx:
      alias TradeEngine.API.Console, as: C

      C.setup_hudson()           # Configure with $50K total, $5K active
      C.status()                 # Full trading status
      C.capital()                # Capital allocation status
      C.scale_up(10_000)         # Increase active capital to $10K
      C.start()                  # Start trading
      C.stop()                   # Stop trading
      C.emergency()              # Close all positions
  """

  alias TradeEngine.API

  @default_user "hudson"

  @doc "Quick setup: $50K total, $5K active, manual scaling"
  def setup_hudson(opts \\ []) do
    total = Keyword.get(opts, :total, 50_000.0)
    active = Keyword.get(opts, :active, 5_000.0)
    mode = Keyword.get(opts, :mode, :manual)

    API.configure_capital(@default_user, %{
      total_capital: total,
      active_capital: active,
      scaling_mode: mode,
      max_step_size: 5_000.0,
      drawdown_pause_pct: 0.15,
      milestone_targets: [10, 20, 30, 50]
    })
  end

  @doc "Get full trading status"
  def status do
    IO.puts("\n")
    {:ok, stats} = API.get_trading_stats()
    {:ok, health} = API.health_check()

    IO.puts("""
    ╔══════════════════════════════════════════════════════════════╗
    ║  🎯 TRADE ENGINE STATUS                                     ║
    ╠══════════════════════════════════════════════════════════════╣
    ║  Trading:     #{pad(to_string(stats.status), 43)}║
    ║  Open Pos:    #{pad(to_string(stats.open_positions), 43)}║
    ║  Total Trades: #{pad(to_string(stats.total_trades), 42)}║
    ║  Win Rate:    #{pad(format_pct(stats.win_rate), 43)}║
    ║  Signals:     #{pad(to_string(stats.signals_processed), 43)}║
    ║  Health:      #{pad(to_string(health.status), 43)}║
    ╚══════════════════════════════════════════════════════════════╝
    """)

    :ok
  end

  @doc "Get capital allocation status"
  def capital(user_id \\ @default_user) do
    case API.get_capital_status(user_id) do
      {:ok, c} ->
        IO.puts("""

        💰 CAPITAL ALLOCATION: #{user_id}
        ═══════════════════════════════════════════════════════════════
        Total Capital:    $#{format_num(c.total_capital)}
        Active Capital:   $#{format_num(c.active_capital)} (#{c.deployment_pct}%)
        Reserved:         $#{format_num(c.reserved_capital)}
        ───────────────────────────────────────────────────────────────
        Scaling Mode:     #{c.scaling_mode}
        Paused:           #{c.paused}
        ───────────────────────────────────────────────────────────────
        Realized P&L:     $#{format_num(c.realized_pnl)} (#{c.pnl_pct_on_active}%)
        Win Rate:         #{c.win_rate}%
        Trades:           #{c.total_trades} (W:#{c.winning_trades} L:#{c.losing_trades})
        Scale-ups:        #{c.scale_ups_performed}
        Drawdown:         #{Float.round(c.current_drawdown_pct * 100, 1)}%
        ═══════════════════════════════════════════════════════════════
        """)
        :ok

      {:error, :not_configured} ->
        IO.puts("❌ Capital not configured. Run: C.setup_hudson()")
        :not_configured
    end
  end

  @doc "Set active capital"
  def scale_up(amount, user_id \\ @default_user) do
    API.set_active_capital(user_id, amount)
  end

  @doc "Start trading"
  def start, do: API.start_trading()

  @doc "Stop trading"
  def stop, do: API.stop_trading()

  @doc "Emergency close all"
  def emergency, do: API.close_all_positions()

  @doc "Pause trading"
  def pause(user_id \\ @default_user), do: API.pause_user_trading(user_id)

  @doc "Resume trading"
  def resume(user_id \\ @default_user), do: API.resume_user_trading(user_id)

  @doc "Get open positions"
  def positions, do: API.get_open_positions()

  @doc "Get signals"
  def signals, do: API.get_signals()

  @doc "🚀 Launch trading — full setup in one call"
  def launch(user_id \\ @default_user, balance \\ 5000.0) do
    API.launch_trading(user_id, %{balance: balance, total_capital: 50_000.0})
  end

  @doc "📡 Live signals with entry/exit/target"
  def live_signals do
    case API.get_live_signals() do
      {:ok, %{signals: sigs, summary: sum}} ->
        IO.puts("\n📡 LIVE SIGNALS (#{sum.total_signals} total, #{sum.tradeable} tradeable)\n")
        sigs
        |> Enum.sort_by(fn {_, s} -> -s.confidence end)
        |> Enum.each(fn {sym, s} ->
          arrow = if s.direction == "long", do: "🟢↑", else: "🔴↓"
          grade = s.trade_grade
          IO.puts("  #{arrow} #{String.pad_trailing(sym, 12)} #{s.direction} #{s.confidence}% | Entry: $#{s.entry_price} → Exit: $#{s.exit_target} | #{s.impulse_pct}% | Grade: #{grade} #{if s.tradeable, do: "✅", else: "⛔"}")
        end)
        IO.puts("\n  Best long: #{sum.best_long || "none"} | Best short: #{sum.best_short || "none"}\n")
        :ok
      error -> error
    end
  end

  @doc "🎯 Active trades with PnL and recommendations"
  def trades do
    case API.get_active_trades() do
      {:ok, %{trades: trades, summary: sum}} ->
        IO.puts("\n🎯 ACTIVE TRADES (#{sum.total_positions})\n")
        if length(trades) == 0 do
          IO.puts("  No open positions. Run C.launch() first, then C.start()\n")
        else
          Enum.each(trades, fn t ->
            pnl_sign = if t.unrealized_pnl >= 0, do: "+", else: ""
            IO.puts("  #{t.symbol} #{t.direction} | Entry: $#{t.entry_price} → Current: $#{t.current_price} | PnL: #{pnl_sign}$#{t.unrealized_pnl} (#{t.unrealized_pnl_pct}%) | #{t.time_remaining} left | #{t.recommendation}")
          end)
          IO.puts("\n  Total PnL: $#{sum.total_pnl} | P:#{sum.profitable} L:#{sum.losing}\n")
        end
        :ok
      error -> error
    end
  end

  @doc "📊 Full trading status overview"
  def full_status do
    case API.get_trading_status() do
      {:ok, s} ->
        IO.puts("""

        ╔══════════════════════════════════════════════════════════════╗
        ║  📊 FULL TRADING STATUS                                     ║
        ╠══════════════════════════════════════════════════════════════╣
        ║  ENGINE                                                      ║
        ║  Active: #{pad(to_string(s.engine.active), 48)}║
        ║  Uptime: #{pad(s.engine.uptime, 48)}║
        ╠──────────────────────────────────────────────────────────────╣
        ║  TRADES                                                      ║
        ║  Total:    #{pad(to_string(s.trading.total_trades), 46)}║
        ║  Win Rate: #{pad(format_pct(s.trading.win_rate), 46)}║
        ║  PnL:     $#{pad(format_num(s.trading.total_pnl), 45)}║
        ║  $1 Hits:  #{pad(to_string(s.trading.dollar_targets_hit), 46)}║
        ╠──────────────────────────────────────────────────────────────╣
        ║  POSITIONS: #{pad(to_string(s.positions.total_positions), 45)}║
        ║  SIGNALS:   #{pad(to_string(s.signals.total_signals), 45)}║
        ║  TRADEABLE: #{pad(to_string(s.signals.tradeable), 45)}║
        ╚══════════════════════════════════════════════════════════════╝
        """)
        :ok
      error -> error
    end
  end

  @doc "💰 Close all and show profit"
  def take_profit, do: API.close_all_and_capture()

  @doc "Full health check"
  def health, do: API.health_check()

  @doc "Get dashboard payload"
  def dashboard(user_id \\ @default_user), do: API.get_dashboard_payload(user_id)

  # Helpers
  defp pad(str, len), do: String.pad_trailing(str, len)
  defp format_num(n), do: :erlang.float_to_binary(n * 1.0, decimals: 2)
  defp format_pct(nil), do: "N/A"
  defp format_pct(n) when is_number(n), do: "#{Float.round(n * 1.0, 1)}%"
  defp format_pct(_), do: "N/A"
end
