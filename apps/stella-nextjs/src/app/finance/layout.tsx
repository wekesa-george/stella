"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const financeTabs = [
  { label: "Platform Overview", href: "/finance/overview" },
  { label: "Strategy Performance", href: "/finance/strategies" },
  { label: "User Analytics", href: "/finance/users" },
  { label: "Risk Dashboard", href: "/finance/risk" },
  { label: "Market Intelligence", href: "/finance/market" },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString());
      setCurrentDate(now.toLocaleDateString("en-US", { month: "long", year: "numeric" }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header Bar */}
      <div className="bg-card border-b border-dark px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-foreground">Stella Analytics</h1>
              <p className="text-xs text-[#8fa3b8] uppercase tracking-wider mt-1">
                Platform Intelligence{currentDate && ` · ${currentDate}`}
              </p>
            </div>
            <div className="text-left md:text-right">
              <div className="text-[10px] text-[#8fa3b8] mb-2">
                {currentTime && `Last updated: ${currentTime}`}
              </div>
              <div className="flex gap-1 md:gap-2 flex-wrap">
                {["7D", "30D", "90D", "1Y", "ALL"].map(p => (
                  <button
                    key={p}
                    className="px-2 md:px-3 py-1 rounded-sm text-[9px] md:text-[10px] font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-[#253550] hover:text-foreground transition-all"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-card border-b border-dark overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex gap-0">
          {financeTabs.map((tab) => {
            const isActive = pathname === tab.href;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-3 md:px-4 py-2.5 text-[10px] md:text-xs font-medium uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                  isActive
                    ? "text-[#00e5a0] border-[#00e5a0]"
                    : "text-[#5a7090] border-transparent hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
