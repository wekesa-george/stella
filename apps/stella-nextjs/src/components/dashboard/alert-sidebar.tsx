"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Alert } from "@/lib/types/dashboard";

interface AlertSidebarProps {
  alerts: Alert[];
  onAck: (id: number) => void;
}

export function AlertSidebar({ alerts, onAck }: AlertSidebarProps) {
  const [showAlerts, setShowAlerts] = useState(false);
  const criticalCount = alerts.filter((a) => a.sev === "critical" && !a.acked).length;
  const warningCount = alerts.filter((a) => a.sev === "warning" && !a.acked).length;

  return (
    <>
      {/* Mobile Alert Toggle Button */}
      <button
        onClick={() => setShowAlerts(!showAlerts)}
        className="fixed bottom-4 right-4 z-50 lg:hidden bg-red text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-semibold"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
        </span>
        {criticalCount} Alerts
      </button>

      {/* Alert Sidebar Overlay (Mobile) */}
      {showAlerts && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setShowAlerts(false)}
        />
      )}

      {/* Alert Sidebar */}
      <div className={cn(
        "w-80 bg-card border-l border-dark flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 fixed right-0 top-0 bottom-0 z-40",
        showAlerts ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-dark flex justify-between items-center">
        <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Alerts</span>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-[9px] font-mono">
            <span className="text-[#ff4757]">{criticalCount} CRIT</span>
            <span className="text-[#f5a623]">{warningCount} WARN</span>
          </div>
          <button
            onClick={() => setShowAlerts(false)}
            className="lg:hidden text-muted hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Alerts List */}
      <div className="flex-1 overflow-y-auto">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              "px-3.5 py-2.5 border-b border-dark flex gap-2.5 items-start transition-all hover:bg-dark-elevated",
              alert.acked && "opacity-40"
            )}
          >
            {/* Severity Indicator */}
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1",
                alert.sev === "critical" && "bg-[#ff4757] shadow-[0_0_6px_#ff4757]",
                alert.sev === "warning" && "bg-[#f5a623]",
                alert.sev === "info" && "bg-blue-500"
              )}
            />

            {/* Alert Content */}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-foreground leading-tight">{alert.msg}</div>
              <div className="text-[9px] text-[#5a7090] font-mono mt-0.5">{alert.time}</div>
            </div>

            {/* Acknowledge Button */}
            {!alert.acked && (
              <button
                onClick={() => onAck(alert.id)}
                className="text-[9px] text-[#5a7090] px-1.5 py-0.5 border border-dark rounded hover:text-[#00e5a0] hover:border-[#00e5a0] transition-colors flex-shrink-0"
              >
                ACK
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
