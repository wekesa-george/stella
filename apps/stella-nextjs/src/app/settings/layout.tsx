"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

// Icon components
const Icons = {
  bolt: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  exchange: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  bot: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  bell: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  creditCard: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  scale: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  ),
  shield: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  mail: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  server: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  puzzle: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
    </svg>
  ),
};

const NAV_CONFIG = [
  {
    group: "Operations",
    items: [
      { key: "risk", label: "Risk Controls", href: "/settings/risk", icon: Icons.bolt, critical: true },
      { key: "exchanges", label: "Exchange Management", href: "/settings/exchanges", icon: Icons.exchange },
      { key: "bot-engine", label: "Bot Engine Defaults", href: "/settings/bot-engine", icon: Icons.bot },
    ],
  },
  {
    group: "Platform",
    items: [
      { key: "subscriptions", label: "Users & Subscriptions", href: "/settings/subscriptions", icon: Icons.users },
      { key: "notifications", label: "Notifications & Alerts", href: "/settings/notifications", icon: Icons.bell },
      { key: "billing", label: "Billing & Fees", href: "/settings/billing", icon: Icons.creditCard },
    ],
  },
  {
    group: "Compliance",
    items: [{ key: "compliance", label: "Compliance", href: "/settings/compliance", icon: Icons.scale }],
  },
  {
    group: "Admin",
    items: [
      { key: "security", label: "Security & Access", href: "/settings/security", icon: Icons.shield },
      { key: "communications", label: "Communications", href: "/settings/communications", icon: Icons.mail },
      { key: "infrastructure", label: "Infrastructure", href: "/settings/infrastructure", icon: Icons.server },
      { key: "integrations", label: "Integrations", href: "/settings/integrations", icon: Icons.puzzle },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Mobile menu button */}
      <button
        className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#00e5a0] text-black flex items-center justify-center shadow-lg"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {mobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav
        className={`
          w-[220px] flex-shrink-0 bg-[#0d1117] border-r border-[#1e2d40] overflow-y-auto py-3.5
          md:relative md:translate-x-0 md:block
          fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-in-out
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {NAV_CONFIG.map((group, groupIndex) => (
          <div key={group.group}>
            <div className="px-4 py-1.5 font-mono text-[8px] uppercase tracking-widest text-[#3a5068]">{group.group}</div>
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-all border-l-2 ${
                    isActive
                      ? "bg-[#131920] border-l-[#00e5a0] text-[#00e5a0]"
                      : "border-l-transparent text-[#8fa3b8] hover:bg-[#131920] hover:text-[#e8edf3]"
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className={`font-sans text-[12px] font-medium flex-1 ${isActive ? "text-[#00e5a0]" : "text-inherit"}`}>
                    {item.label}
                  </span>
                  {item.critical && !isActive && (
                    <span className="ml-auto px-1.5 py-0.5 rounded-sm bg-[rgba(245,166,35,0.15)] text-[#f5a623] font-mono text-[8px] font-bold">
                      !
                    </span>
                  )}
                </Link>
              );
            })}
            {groupIndex < NAV_CONFIG.length - 1 && <div className="h-px bg-[#1e2d40] my-2 mx-0" />}
          </div>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-[#080c10]">{children}</main>
    </div>
  );
}
