"use client";

import { useState, useEffect, useMemo } from "react";
import { acknowledgeAlert as ackAlertApi, acknowledgeAlertsBulk, deleteAlert as deleteAlertApi } from "@/lib/stellaAdminApi";
import { useAlertChannel } from "@/hooks/usePhoenixChannel";
import { mapWsAlertToUiAlert } from "@/lib/api/mappers";
import type { Alert } from "@/lib/types/dashboard";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { useAlerts as useAlertsQuery } from "@/hooks/useQueries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { data: apiAlerts = [], isLoading: loading } = useAlertsQuery({ limit: 100 });
  const [localAlerts, setLocalAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Sync API alerts to local state for optimistic updates
  useEffect(() => {
    if (apiAlerts.length > 0) {
      setLocalAlerts(apiAlerts);
    }
  }, [apiAlerts]);

  const alerts = localAlerts.length > 0 ? localAlerts : apiAlerts;

  // Real-time alerts from WS
  const { alerts: wsAlerts } = useAlertChannel();

  // Prepend real-time WS alerts
  useEffect(() => {
    if (wsAlerts.length > 0) {
      const latest = wsAlerts[0];
      const mapped = mapWsAlertToUiAlert(latest);
      setLocalAlerts((prev) => {
        if (prev.some((a) => a.id === mapped.id)) return prev;
        return [mapped, ...prev];
      });
    }
  }, [wsAlerts]);

  const handleAck = async (id: number | string) => {
    // Optimistic update
    setLocalAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acked: true } : a))
    );
    await ackAlertApi(String(id)).catch(console.error);
  };

  const handleAckAll = async (severity?: string) => {
    const toAck = alerts.filter((a) => {
      if (a.acked) return false;
      return severity ? a.sev === severity : true;
    });
    // Optimistic update
    setLocalAlerts((prev) =>
      prev.map((a) => {
        if (severity) {
          return a.sev === severity && !a.acked ? { ...a, acked: true } : a;
        }
        return { ...a, acked: true };
      })
    );
    const ids = toAck.map((a) => String(a.id));
    if (ids.length > 0) {
      await acknowledgeAlertsBulk(ids).catch(console.error);
    }
  };

  const handleDelete = async (id: number | string) => {
    setLocalAlerts((prev) => prev.filter((a) => a.id !== id));
    await deleteAlertApi(String(id)).catch(console.error);
  };

  // Filter alerts (memoized)
  const filteredAlerts = useMemo(() => alerts.filter((alert) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "unacked" && !alert.acked) ||
      (filter === "acked" && alert.acked) ||
      alert.sev === filter;
    const matchesSearch =
      alert.msg.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.service.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  }), [alerts, filter, searchQuery]);

  const unackedAlerts = useMemo(() => alerts.filter((a) => !a.acked), [alerts]);
  const criticalCount = unackedAlerts.filter((a) => a.sev === "critical").length;
  const warningCount = unackedAlerts.filter((a) => a.sev === "warning").length;
  const infoCount = unackedAlerts.filter((a) => a.sev === "info").length;

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#FFD700]">Alerts</span>
          </div>

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Alerts</h1>
              <p className="text-xs sm:text-sm text-[#8fa3b8]">
                Monitor and manage system alerts ({unackedAlerts.length} unacknowledged)
              </p>
            </div>
            <button
              onClick={() => handleAckAll()}
              disabled={unackedAlerts.length === 0}
              className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Acknowledge All
            </button>
          </div>

          {/* Alert Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
              <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Total Alerts</div>
              <div className="font-mono text-[28px] font-semibold text-foreground leading-none mb-1.5">
                {alerts.length}
              </div>
              <div className="text-xs text-[#5a7090]">{unackedAlerts.length} unacked</div>
            </div>
            <div className="bg-dark-elevated border border-[#ff4757] rounded-md p-3.5">
              <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Critical</div>
              <div className="font-mono text-[28px] font-semibold text-[#ff4757] leading-none mb-1.5">
                {criticalCount}
              </div>
              <div className="text-xs text-[#5a7090]">requires attention</div>
            </div>
            <div className="bg-dark-elevated border border-[#f5a623] rounded-md p-3.5">
              <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Warning</div>
              <div className="font-mono text-[28px] font-semibold text-[#f5a623] leading-none mb-1.5">
                {warningCount}
              </div>
              <div className="text-xs text-[#5a7090]">monitor closely</div>
            </div>
            <div className="bg-dark-elevated border border-[#3d9df3] rounded-md p-3.5">
              <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Info</div>
              <div className="font-mono text-[28px] font-semibold text-[#3d9df3] leading-none mb-1.5">
                {infoCount}
              </div>
              <div className="text-xs text-[#5a7090]">informational</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3">
            {/* Search */}
            <div className="w-full">
              <input
                type="text"
                placeholder="Search alerts by message or service..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-dark-elevated border border-dark rounded-sm text-sm text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-[#253550]"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex gap-2 flex-wrap">
                {["all", "unacked", "critical", "warning", "info", "acked"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-sm text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                      filter === f
                        ? "bg-[#FFD700] text-black"
                        : "bg-transparent text-[#8fa3b8] border border-dark hover:border-[#253550] hover:text-foreground"
                    }`}
                  >
                    {f === "unacked" ? "Unacked" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              <span className="flex items-center text-xs text-[#5a7090] ml-auto">
                {filteredAlerts.length} / {alerts.length} shown
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Quick Actions</span>
            </div>
            <div className="p-3 sm:p-3.5 flex gap-2 sm:gap-2.5 flex-wrap">
              <button
                onClick={() => handleAckAll("critical")}
                disabled={criticalCount === 0}
                className="px-2.5 sm:px-3 py-1.5 rounded-sm text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-[rgba(255,71,87,0.12)] text-[#ff4757] border border-[rgba(255,71,87,0.3)] hover:bg-[#ff4757] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Ack All Critical
              </button>
              <button
                onClick={() => handleAckAll("warning")}
                disabled={warningCount === 0}
                className="px-2.5 sm:px-3 py-1.5 rounded-sm text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-[rgba(245,166,35,0.12)] text-[#f5a623] border border-[rgba(245,166,35,0.3)] hover:bg-[#f5a623] hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Ack All Warnings
              </button>
              <button
                onClick={() => handleAckAll("info")}
                disabled={infoCount === 0}
                className="px-2.5 sm:px-3 py-1.5 rounded-sm text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-[rgba(61,157,243,0.12)] text-[#3d9df3] border border-[rgba(61,157,243,0.3)] hover:bg-[#3d9df3] hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Ack All Info
              </button>
            </div>
          </div>

          {/* Alerts List */}
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Alert Feed</span>
              <span className="text-[10px] text-[#5a7090]">{filteredAlerts.length} alerts</span>
            </div>
            <div className="divide-y divide-dark/50">
              {filteredAlerts.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-[#8fa3b8]">No alerts match your filters</p>
                </div>
              ) : (
                filteredAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-2.5 sm:p-3.5 flex gap-2 sm:gap-3 hover:bg-[#0d1117] transition-colors ${
                      alert.acked ? "opacity-40" : ""
                    }`}
                  >
                    {/* Severity Indicator */}
                    <div className="flex items-start pt-1">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          alert.sev === "critical"
                            ? "bg-[#ff4757] shadow-[0_0_6px_#ff4757]"
                            : alert.sev === "warning"
                            ? "bg-[#f5a623]"
                            : "bg-[#3d9df3]"
                        }`}
                      />
                    </div>

                    {/* Alert Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3 mb-1">
                        <div>
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm mr-2 ${
                              alert.sev === "critical"
                                ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
                                : alert.sev === "warning"
                                ? "bg-[rgba(245,166,35,0.12)] text-[#f5a623]"
                                : "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]"
                            }`}
                          >
                            {alert.sev}
                          </span>
                          <span className="text-xs font-mono text-[#5a7090]">{alert.service}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[#5a7090] whitespace-nowrap">
                          {alert.time}
                        </span>
                      </div>
                      <div className="text-xs text-foreground leading-relaxed mb-2">{alert.msg}</div>
                      {alert.acked && (
                        <div className="text-[10px] text-[#FFD700] flex items-center gap-1.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Acknowledged
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-1.5">
                      {!alert.acked && (
                        <button
                          onClick={() => handleAck(alert.id)}
                          className="px-2 py-1 rounded-sm text-[9px] font-bold uppercase bg-transparent text-[#8fa3b8] border border-dark hover:border-[#FFD700] hover:text-[#FFD700] transition-all whitespace-nowrap"
                        >
                          ACK
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(alert.id)}
                        className="px-2 py-1 rounded-sm text-[9px] font-bold uppercase bg-transparent text-[#8fa3b8] border border-dark hover:border-[#ff4757] hover:text-[#ff4757] transition-all whitespace-nowrap"
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
