defmodule TradeEngine.API.Client do
  @moduledoc """
  🔌 API CLIENT v2 for SysAdmin Dashboard

  Clean interface for sys_admin_web LiveViews to call TradeEngine.
  Works in :direct mode (umbrella) or :http mode (distributed).
  """

  @mode Application.compile_env(:trade_engine, :api_mode, :direct)

  # Trading Controls
  def start_trading, do: call(:start_trading, [])
  def stop_trading, do: call(:stop_trading, [])
  def restart_trading, do: call(:restart_trading, [])
  def close_all_positions, do: call(:close_all_positions, [])
  def pause_user_trading(uid), do: call(:pause_user_trading, [uid])
  def resume_user_trading(uid), do: call(:resume_user_trading, [uid])

  # Trading Control (Launch, Signals, Trades)
  def launch_trading(uid, opts \\ %{}), do: call(:launch_trading, [uid, opts])
  def quick_start(uid), do: call(:quick_start, [uid])
  def shutdown_trading, do: call(:shutdown_trading, [])
  def emergency_stop, do: call(:emergency_stop, [])
  def get_live_signals, do: call(:get_live_signals, [])
  def get_signal_detail(sym), do: call(:get_signal_detail, [sym])
  def analyze_fresh(sym), do: call(:analyze_fresh, [sym])
  def get_active_trades, do: call(:get_active_trades, [])
  def close_position(id, reason \\ :manual), do: call(:close_position, [id, reason])
  def close_all_and_capture, do: call(:close_all_and_capture, [])
  def get_trading_status, do: call(:get_trading_status, [])

  # Capital Management
  def configure_capital(uid, cfg), do: call(:configure_capital, [uid, cfg])
  def set_active_capital(uid, amt), do: call(:set_active_capital, [uid, amt])
  def set_total_capital(uid, amt), do: call(:set_total_capital, [uid, amt])
  def set_scaling_mode(uid, mode), do: call(:set_scaling_mode, [uid, mode])
  def get_capital_status(uid), do: call(:get_capital_status, [uid])
  def get_all_allocations, do: call(:get_all_allocations, [])

  # Bot Management
  def create_bot(uid, attrs), do: call(:create_bot, [uid, attrs])
  def get_bot(bot_id), do: call(:get_bot, [bot_id])
  def list_bots, do: call(:list_bots, [])
  def list_user_bots(uid), do: call(:list_user_bots, [uid])
  def start_bot(bot_id), do: call(:start_bot, [bot_id])
  def pause_bot(bot_id), do: call(:pause_bot, [bot_id])
  def stop_bot(bot_id), do: call(:stop_bot, [bot_id])
  def update_bot(bot_id, attrs), do: call(:update_bot, [bot_id, attrs])
  def delete_bot(bot_id), do: call(:delete_bot, [bot_id])
  def get_bot_positions(bot_id), do: call(:get_bot_positions, [bot_id])
  def get_bot_orders(bot_id), do: call(:get_bot_orders, [bot_id])
  def get_system_metrics, do: call(:get_system_metrics, [])

  # Positions (Enriched)
  def get_open_positions, do: call(:get_open_positions, [])
  def get_user_positions(uid, status \\ :all), do: call(:get_user_positions, [uid, status])

  # Orders (Enriched)
  def get_user_orders(uid, status \\ :all), do: call(:get_user_orders, [uid, status])
  def get_trade_history(uid, opts \\ []), do: call(:get_trade_history, [uid, opts])

  # Performance
  def get_trading_stats, do: call(:get_trading_stats, [])
  def get_account_stats(uid), do: call(:get_account_stats, [uid])
  def get_risk_analytics(uid), do: call(:get_risk_analytics, [uid])
  def get_virtual_balance(uid), do: call(:get_virtual_balance, [uid])
  def get_balance_summary, do: call(:get_balance_summary, [])
  def get_transactions(uid), do: call(:get_transactions, [uid])

  # Risk
  def get_tier_info(bal), do: call(:get_tier_info, [bal])
  def get_allowed_assets(bal), do: call(:get_allowed_assets, [bal])
  def get_position_size(bal, conf \\ 50), do: call(:get_position_size, [bal, conf])
  def get_risk_limits(uid), do: call(:get_risk_limits, [uid])
  def update_risk_limits(uid, attrs), do: call(:update_risk_limits, [uid, attrs])

  # Market Data
  def get_signals, do: call(:get_signals, [])
  def analyze_symbol(sym), do: call(:analyze_symbol, [sym])
  def get_scalping_assets(bal \\ 5000), do: call(:get_scalping_assets, [bal])

  # System
  def health_check, do: call(:health_check, [])
  def get_process_info, do: call(:get_process_info, [])
  def get_dashboard(uid), do: call(:get_dashboard_payload, [uid])

  # Dispatch
  defp call(function, args) do
    case @mode do
      :direct -> apply(TradeEngine.API, function, args)
      :http -> http_call(function, args)
    end
  end

  defp http_call(function, args) do
    base = Application.get_env(:trade_engine, :api_base_url, "http://localhost:4002")
    {method, path, body} = route_for(function, args)
    url = "#{base}#{path}"
    headers = [{"content-type", "application/json"}]

    result = case method do
      :get -> HTTPoison.get(url, headers)
      :post -> HTTPoison.post(url, if(body, do: Jason.encode!(body), else: "{}"), headers)
      :put -> HTTPoison.put(url, if(body, do: Jason.encode!(body), else: "{}"), headers)
      :delete -> HTTPoison.delete(url, headers)
    end

    case result do
      {:ok, %{status_code: 200, body: b}} -> {:ok, Jason.decode!(b)["data"]}
      {:ok, %{body: b}} -> {:error, Jason.decode!(b)["error"]}
      {:error, reason} -> {:error, reason}
    end
  end

  defp route_for(:start_trading, []), do: {:post, "/api/trading/start", nil}
  defp route_for(:stop_trading, []), do: {:post, "/api/trading/stop", nil}
  defp route_for(:restart_trading, []), do: {:post, "/api/trading/restart", nil}
  defp route_for(:close_all_positions, []), do: {:post, "/api/trading/close-all", nil}
  defp route_for(:pause_user_trading, [u]), do: {:post, "/api/trading/pause/#{u}", nil}
  defp route_for(:resume_user_trading, [u]), do: {:post, "/api/trading/resume/#{u}", nil}
  defp route_for(:launch_trading, [u, o]), do: {:post, "/api/trading/launch", Map.put(o, :user_id, u)}
  defp route_for(:quick_start, [u]), do: {:post, "/api/trading/quick-start/#{u}", nil}
  defp route_for(:shutdown_trading, []), do: {:post, "/api/trading/shutdown", nil}
  defp route_for(:emergency_stop, []), do: {:post, "/api/trading/emergency-stop", nil}
  defp route_for(:get_live_signals, []), do: {:get, "/api/signals/live", nil}
  defp route_for(:get_signal_detail, [s]), do: {:get, "/api/signals/#{s}", nil}
  defp route_for(:analyze_fresh, [s]), do: {:post, "/api/signals/#{s}/analyze", nil}
  defp route_for(:get_active_trades, []), do: {:get, "/api/trades/active", nil}
  defp route_for(:close_position, [id, r]), do: {:post, "/api/positions/#{id}/close", %{reason: r}}
  defp route_for(:close_all_and_capture, []), do: {:post, "/api/trades/close-all", nil}
  defp route_for(:get_trading_status, []), do: {:get, "/api/trading/status", nil}
  defp route_for(:configure_capital, [u, c]), do: {:post, "/api/capital/configure", Map.put(c, :user_id, u)}
  defp route_for(:set_active_capital, [u, a]), do: {:put, "/api/capital/#{u}/active", %{amount: a}}
  defp route_for(:set_total_capital, [u, a]), do: {:put, "/api/capital/#{u}/total", %{amount: a}}
  defp route_for(:set_scaling_mode, [u, m]), do: {:put, "/api/capital/#{u}/mode", %{mode: m}}
  defp route_for(:get_capital_status, [u]), do: {:get, "/api/capital/#{u}", nil}
  defp route_for(:get_all_allocations, []), do: {:get, "/api/capital", nil}
  defp route_for(:create_bot, [u, a]), do: {:post, "/api/bots", Map.put(a, :user_id, u)}
  defp route_for(:get_bot, [id]), do: {:get, "/api/bots/#{id}", nil}
  defp route_for(:list_bots, []), do: {:get, "/api/bots", nil}
  defp route_for(:list_user_bots, [u]), do: {:get, "/api/bots/user/#{u}", nil}
  defp route_for(:start_bot, [id]), do: {:post, "/api/bots/#{id}/start", nil}
  defp route_for(:pause_bot, [id]), do: {:post, "/api/bots/#{id}/pause", nil}
  defp route_for(:stop_bot, [id]), do: {:post, "/api/bots/#{id}/stop", nil}
  defp route_for(:update_bot, [id, a]), do: {:put, "/api/bots/#{id}", a}
  defp route_for(:delete_bot, [id]), do: {:delete, "/api/bots/#{id}", nil}
  defp route_for(:get_bot_positions, [id]), do: {:get, "/api/bots/#{id}/positions", nil}
  defp route_for(:get_bot_orders, [id]), do: {:get, "/api/bots/#{id}/orders", nil}
  defp route_for(:get_system_metrics, []), do: {:get, "/api/system/metrics", nil}
  defp route_for(:get_open_positions, []), do: {:get, "/api/positions/open", nil}
  defp route_for(:get_user_positions, [u, :all]), do: {:get, "/api/positions/#{u}", nil}
  defp route_for(:get_user_positions, [u, s]), do: {:get, "/api/positions/#{u}/#{s}", nil}
  defp route_for(:get_user_orders, [u, _]), do: {:get, "/api/orders/#{u}", nil}
  defp route_for(:get_trade_history, [u, _]), do: {:get, "/api/trade-history/#{u}", nil}
  defp route_for(:get_trading_stats, []), do: {:get, "/api/stats", nil}
  defp route_for(:get_account_stats, [u]), do: {:get, "/api/stats/#{u}", nil}
  defp route_for(:get_risk_analytics, [u]), do: {:get, "/api/analytics/#{u}", nil}
  defp route_for(:get_virtual_balance, [u]), do: {:get, "/api/balance/#{u}", nil}
  defp route_for(:get_balance_summary, []), do: {:get, "/api/balance/summary", nil}
  defp route_for(:get_transactions, [u]), do: {:get, "/api/transactions/#{u}", nil}
  defp route_for(:get_tier_info, [b]), do: {:get, "/api/risk/tier/#{b}", nil}
  defp route_for(:get_allowed_assets, [b]), do: {:get, "/api/risk/assets/#{b}", nil}
  defp route_for(:get_position_size, [b, c]), do: {:get, "/api/risk/position-size?balance=#{b}&confidence=#{c}", nil}
  defp route_for(:get_risk_limits, [u]), do: {:get, "/api/risk/limits/#{u}", nil}
  defp route_for(:update_risk_limits, [u, a]), do: {:put, "/api/risk/limits/#{u}", a}
  defp route_for(:get_signals, []), do: {:get, "/api/market/signals", nil}
  defp route_for(:analyze_symbol, [s]), do: {:get, "/api/market/analyze/#{s}", nil}
  defp route_for(:get_scalping_assets, [b]), do: {:get, "/api/market/scalping-assets?balance=#{b}", nil}
  defp route_for(:health_check, []), do: {:get, "/api/health", nil}
  defp route_for(:get_process_info, []), do: {:get, "/api/processes", nil}
  defp route_for(:get_dashboard_payload, [u]), do: {:get, "/api/dashboard/#{u}", nil}
end
