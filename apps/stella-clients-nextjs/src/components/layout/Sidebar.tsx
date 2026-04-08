"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Bot,
  Target,
  Wallet2,
  TrendingUp,
  Coins,
  ShieldAlert,
  CreditCard,
  User,
  HelpCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface NavItem {
  key: string;
  label: string;
  icon: any;
  badge?: number;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "bots", label: "My Bots", icon: Bot, badge: 5 },
  { key: "strategies", label: "Strategies", icon: Target },
  { key: "positions", label: "Positions", icon: Wallet2, badge: 4 },
  { key: "analytics", label: "Analytics", icon: TrendingUp },
  { key: "capital", label: "Capital", icon: Coins },
  { key: "risk", label: "Risk", icon: ShieldAlert },
];

const NAV_B: NavItem[] = [
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "account", label: "Account", icon: User },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "help", label: "Help", icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const active = pathname.split("/")[1] || "dashboard";

  return (
    <div
      className={`${
        collapsed ? "w-16" : "w-[200px]"
      } min-h-screen bg-[var(--color-sidebar)] border-r border-border flex flex-col flex-shrink-0 sticky top-0 transition-all duration-300`}
    >
      {/* Logo Section */}
      <div className="h-[52px] flex items-center justify-between px-4 border-b border-border">
        {collapsed ? (
          <Image
            src="/stellaa.png"
            alt="Stella Logo"
            width={32}
            height={32}
            className="flex-shrink-0"
          />
        ) : (
          <Image
            src="/stella.svg"
            alt="Stella Logo"
            width={120}
            height={32}
            className="flex-shrink-0"
          />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 flex items-center justify-center bg-transparent border-none cursor-pointer"
        >
          {collapsed ? (
            <ChevronRight size={18} className="text-muted-foreground" />
          ) : (
            <ChevronLeft size={18} className="text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-2.5">
        {NAV.map((item) => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={`/${item.key}`}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 py-2.5 px-4 border-l-2 ${
                isActive
                  ? "bg-[var(--color-green-dim)] border-primary text-primary"
                  : "bg-transparent border-transparent text-muted-foreground hover:bg-[var(--color-surface-alt)] transition-colors"
              } ${collapsed ? "justify-center" : "justify-start"} relative no-underline`}
            >
              <Icon
                size={18}
                strokeWidth={2}
                className={isActive ? "text-primary" : "text-muted-foreground"}
              />
              {!collapsed && (
                <div className="flex items-center justify-between flex-1">
                  <span
                    className={`text-xs tracking-wide ${
                      isActive ? "font-bold text-primary" : "font-medium"
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-border text-muted-foreground"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
              {collapsed && item.badge && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        <div className="h-px bg-[var(--color-border-subtle)] my-2.5 mx-4" />

        {/* Secondary Navigation */}
        {NAV_B.map((item) => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={`/${item.key}`}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 py-2 px-4 border-l-2 ${
                isActive
                  ? "bg-[var(--color-green-dim)] border-primary text-primary"
                  : "bg-transparent border-transparent text-muted-foreground hover:bg-[var(--color-surface-alt)] transition-colors"
              } ${collapsed ? "justify-center" : "justify-start"} no-underline`}
            >
              <Icon
                size={16}
                strokeWidth={2}
                className={isActive ? "text-primary" : "text-muted-foreground"}
              />
              {!collapsed && (
                <span
                  className={`text-xs tracking-wide ${
                    isActive ? "font-bold text-primary" : "font-medium"
                  }`}
                >
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`${collapsed ? "p-3" : "p-4"} border-t border-border`}>
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className={`w-full flex items-center gap-2.5 py-2 px-3 bg-transparent border border-border rounded ${
            collapsed ? "justify-center mb-0" : "justify-start mb-3"
          } cursor-pointer hover:bg-[var(--color-surface-alt)] transition-colors`}
        >
          {theme === "dark" ? (
            <Sun size={16} strokeWidth={2} className="text-muted-foreground" />
          ) : (
            <Moon size={16} strokeWidth={2} className="text-muted-foreground" />
          )}
          {!collapsed && (
            <span className="text-[10px] text-muted-foreground font-semibold tracking-wider uppercase">
              {theme === "dark" ? "LIGHT MODE" : "DARK MODE"}
            </span>
          )}
        </button>

        {/* Plan Info */}
        {!collapsed && (
          <div className="bg-[var(--color-green-dim)] border border-[var(--color-green-mid)] rounded px-2.5 py-2">
            <div className="text-[9px] text-muted-foreground font-semibold tracking-wider uppercase mb-1">
              Stella Unum
            </div>
            <div className="text-[9px] text-muted-foreground">
              3 bots · $16,600 deployed
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
