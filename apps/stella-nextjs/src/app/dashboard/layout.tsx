"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { generateAlerts } from "@/lib/data/generators";

const dashboardTabs = [
  { label: "Mission Control", href: "/dashboard/mission-control" },
  { label: "Bot Fleet", href: "/dashboard/bot-fleet" },
  { label: "Alerts", href: "/dashboard/alerts", showBadge: true },
  { label: "Infrastructure", href: "/dashboard/infra" },
  { label: "Shift Handoff", href: "/dashboard/shift-handoff" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [unackedAlertCount, setUnackedAlertCount] = useState(0);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    // Generate alerts and count unacked ones
    const alerts = generateAlerts();
    const unacked = alerts.filter(a => !a.acked).length;
    setUnackedAlertCount(unacked);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] sm:h-[calc(100vh-64px)]">
      {/* Top Stats Bar */}
      <div className="bg-card border-b border-dark px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 overflow-x-auto">
        <div className="flex items-center gap-4 sm:gap-6 min-w-max">
          <div className="flex items-center gap-2">
            <span className="text-[#5a7090] text-[10px] sm:text-xs font-mono uppercase tracking-wider whitespace-nowrap">Total Equity</span>
            <span className="text-foreground font-semibold text-sm sm:text-base">$823.4k</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#5a7090] text-[10px] sm:text-xs font-mono uppercase tracking-wider whitespace-nowrap">24h P&L</span>
            <span className="text-[#00e5a0] font-semibold text-sm sm:text-base">+$12.8k</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#5a7090] text-[10px] sm:text-xs font-mono uppercase tracking-wider whitespace-nowrap">Active Bots</span>
            <span className="text-foreground font-semibold text-sm sm:text-base">16 / 18</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#5a7090] text-[10px] sm:text-xs font-mono uppercase tracking-wider whitespace-nowrap">Open Trades</span>
            <span className="text-foreground font-semibold text-sm sm:text-base">42</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-card border-b border-dark overflow-x-auto">
        <div className="px-3 sm:px-5 flex gap-0 min-w-max">
          {dashboardTabs.map((tab) => {
            // Check if current path matches the tab or is a sub-route
            let isActive = pathname === tab.href || pathname?.startsWith(tab.href + '/');

            // Special case: /dashboard/bot/[id] should activate Bot Fleet tab
            if (tab.href === '/dashboard/bot-fleet' && pathname?.startsWith('/dashboard/bot/')) {
              isActive = true;
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-3 sm:px-4 py-2.5 text-[10px] sm:text-xs font-medium uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap",
                  isActive
                    ? "text-[#00e5a0] border-[#00e5a0]"
                    : "text-[#5a7090] border-transparent hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.showBadge && unackedAlertCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-sm bg-[#ff4757] text-white text-[9px] font-bold min-w-[18px] text-center">
                    {unackedAlertCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
