"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo } from "react";
import { useAlertChannel, usePlatformChannel, useBotChannel } from "@/hooks/usePhoenixChannel";
import { useAlerts } from "@/hooks/useQueries";

const dashboardTabs = [
  { label: "Mission Critical", href: "/dashboard/mission-critical" },
  { label: "Mission Control", href: "/dashboard/mission-control" },
  { label: "Bot Fleet", href: "/dashboard/bot-fleet" },
  { label: "Strategies", href: "/dashboard/strategies" },
  { label: "Alerts", href: "/dashboard/alerts", showBadge: true },
  { label: "Operations Log", href: "/dashboard/incidents" },
  { label: "Infrastructure", href: "/dashboard/infra" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [unackedAlertCount, setUnackedAlertCount] = useState(0);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Hide stats bar + nav tabs on bot detail pages and mission-critical (full-screen mode)
  const isBotDetail = pathname ? /^\/dashboard\/bot\/[^/]+$/.test(pathname) : false;
  const isMissionCritical = pathname === "/dashboard/mission-critical";

  // Real-time WS hooks for top stats bar
  const { alerts: wsAlerts } = useAlertChannel();
  const { stats: platformStats } = usePlatformChannel();
  const { bots: wsBots } = useBotChannel();

  // Derived stats from WS (with defaults)
  const totalEquity = platformStats?.total_equity;
  const pnl24h = platformStats?.pnl_24h ?? platformStats?.total_pnl;
  const activeBots = wsBots.length > 0
    ? wsBots.filter((b: any) => b.status === 'running' || b.status === 'active').length
    : null;
  const totalBots = wsBots.length > 0 ? wsBots.length : null;
  const openTrades = platformStats?.open_positions;

  // Use React Query cached alerts (shared with alerts page — no duplicate request)
  const { data: cachedAlerts = [] } = useAlerts({ limit: 100 });

  // Compute unacked count from cached alerts + WS additions
  const baseUnacked = useMemo(() => cachedAlerts.filter((a: any) => !a.acked).length, [cachedAlerts]);

  // Update badge count from WS alerts (increment beyond cached count)
  useEffect(() => {
    setUnackedAlertCount(baseUnacked);
  }, [baseUnacked]);

  useEffect(() => {
    if (wsAlerts.length > 0) {
      setUnackedAlertCount((prev) => prev + 1);
    }
  }, [wsAlerts]);

  if (isBotDetail || isMissionCritical) {
    return (
      <div className="flex flex-col h-screen">
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] sm:h-[calc(100vh-64px)]">
      {/* Top Stats Bar */}
      <div className="bg-card border-b border-dark px-2 sm:px-3 md:px-4 py-1.5 overflow-x-auto">
        <div className="flex items-center gap-3 sm:gap-4 min-w-max">
          <div className="flex items-center gap-1">
            <span className="text-[#5a7090] text-[9px] sm:text-[10px] font-mono uppercase tracking-wider whitespace-nowrap">Total Equity</span>
            <span className="text-foreground font-bold text-xs sm:text-sm">
              {totalEquity != null ? `$${(totalEquity / 1000).toFixed(1)}k` : '$--'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#5a7090] text-[9px] sm:text-[10px] font-mono uppercase tracking-wider whitespace-nowrap">24h P&L</span>
            <span className={`font-bold text-xs sm:text-sm ${pnl24h != null && pnl24h >= 0 ? 'text-[#00e5a0]' : pnl24h != null ? 'text-[#ff4757]' : 'text-foreground'}`}>
              {pnl24h != null ? `${pnl24h >= 0 ? '+' : ''}$${(pnl24h / 1000).toFixed(1)}k` : '$--'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#5a7090] text-[9px] sm:text-[10px] font-mono uppercase tracking-wider whitespace-nowrap">Active Bots</span>
            <span className="text-foreground font-bold text-xs sm:text-sm">
              {activeBots != null && totalBots != null ? `${activeBots} / ${totalBots}` : '--'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#5a7090] text-[9px] sm:text-[10px] font-mono uppercase tracking-wider whitespace-nowrap">Open Trades</span>
            <span className="text-foreground font-bold text-xs sm:text-sm">
              {openTrades != null ? openTrades : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-card border-b border-dark overflow-x-auto">
        <div className="px-3 sm:px-5 flex gap-0 min-w-max">
          {dashboardTabs.map((tab) => {
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
                    ? "text-[#FFD700] border-[#FFD700]"
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
