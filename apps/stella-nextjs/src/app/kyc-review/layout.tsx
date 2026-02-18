"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState } from "react";

const ROLES = { COMPLIANCE: "Compliance Officer", PLATFORM: "Platform Admin" };

const kycTabs = [
  { key: "providers", label: "Provider Connections", href: "/kyc-review/providers" },
  { key: "regions", label: "Region Routing", href: "/kyc-review/regions" },
  { key: "applicants", label: "Applicant Queue", href: "/kyc-review/applicants", count: 2 },
  { key: "audit", label: "Audit Log", href: "/kyc-review/audit" },
];

export default function KYCReviewLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState(ROLES.COMPLIANCE);

  // Mock data - would come from API/context in production
  const approvedCount = 9;
  const pendingCount = 2;
  const reviewCount = 2;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* TOPBAR */}
      <div className="flex items-center h-[50px] px-5 bg-[#0d1117] border-b border-[#1e2d40] flex-shrink-0 gap-5 z-100">
        <div className="flex flex-col">
          <div className="text-[9px] uppercase tracking-wider text-[#5a7090]">Approved</div>
          <div className="font-mono text-xs font-semibold text-[#00e5a0]">{approvedCount}</div>
        </div>
        <div className="flex flex-col">
          <div className="text-[9px] uppercase tracking-wider text-[#5a7090]">Pending</div>
          <div className="font-mono text-xs font-semibold text-[#3d9df3]">{pendingCount}</div>
        </div>
        <div className="flex flex-col">
          <div className="text-[9px] uppercase tracking-wider text-[#5a7090]">Manual Review</div>
          <div className="font-mono text-xs font-semibold text-[#f5a623]">{reviewCount}</div>
        </div>
        <div className="w-px h-6 bg-[#1e2d40]" />
        <div className="flex flex-col">
          <div className="text-[9px] uppercase tracking-wider text-[#5a7090]">Providers</div>
          <div className="font-mono text-xs font-semibold text-[#e8edf3]">SumSub · Onfido · Persona</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="font-mono text-[9px] text-[#5a7090]">Viewing as:</div>
          <button
            onClick={() => setRole((r) => (r === ROLES.COMPLIANCE ? ROLES.PLATFORM : ROLES.COMPLIANCE))}
            className="px-3 py-1 rounded-sm font-mono text-[9px] font-semibold uppercase tracking-wider border transition-all cursor-pointer"
            style={{
              background: role === ROLES.COMPLIANCE ? "rgba(0,229,160,0.08)" : "rgba(61,157,243,0.08)",
              color: role === ROLES.COMPLIANCE ? "#00e5a0" : "#3d9df3",
              borderColor: role === ROLES.COMPLIANCE ? "rgba(0,229,160,0.25)" : "rgba(61,157,243,0.25)",
            }}
          >
            {role} ↔
          </button>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="flex bg-[#0d1117] border-b border-[#1e2d40] px-5 overflow-x-auto flex-shrink-0">
        {kycTabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                "px-5 py-3 text-[11px] font-medium cursor-pointer border-b-2 whitespace-nowrap transition-all uppercase tracking-wide flex items-center gap-2",
                isActive
                  ? "text-[#00e5a0] border-[#00e5a0]"
                  : "text-[#5a7090] border-transparent hover:text-[#e8edf3]"
              )}
            >
              {tab.label}
              {tab.count && tab.count > 0 && (
                <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-sm bg-[rgba(245,166,35,0.15)] text-[#f5a623]">
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto bg-[#080c10]">
        {children}
      </div>
    </div>
  );
}
