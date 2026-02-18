"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

// Mock data - would come from Logto API
const MOCK_ADMIN_USERS = [
  {
    id: "usr_01h8g3j9k2m4n5p6",
    firstName: "Sarah",
    lastName: "Chen",
    email: "sarah.chen@stella.io",
    status: "active",
    isSuperAdmin: true,
    lastLoginAt: "2026-02-18T14:23:00Z",
    lastLoginIp: "192.168.1.100",
    createdAt: "2025-11-15T08:00:00Z",
    mfaEnabled: true,
  },
  {
    id: "usr_01h8g3k4l5m6n7p8",
    firstName: "James",
    lastName: "Wilson",
    email: "james.wilson@stella.io",
    status: "active",
    isSuperAdmin: false,
    lastLoginAt: "2026-02-18T12:45:00Z",
    lastLoginIp: "192.168.1.101",
    createdAt: "2025-12-01T10:30:00Z",
    mfaEnabled: true,
  },
  {
    id: "usr_01h8g3l5m6n7p8q9",
    firstName: "Emily",
    lastName: "Rodriguez",
    email: "emily.rodriguez@stella.io",
    status: "invited",
    isSuperAdmin: false,
    lastLoginAt: null,
    lastLoginIp: null,
    createdAt: "2026-02-10T16:20:00Z",
    mfaEnabled: false,
  },
  {
    id: "usr_01h8g3m6n7p8q9r0",
    firstName: "Michael",
    lastName: "Kim",
    email: "michael.kim@stella.io",
    status: "active",
    isSuperAdmin: false,
    lastLoginAt: "2026-02-17T18:15:00Z",
    lastLoginIp: "192.168.1.102",
    createdAt: "2026-01-05T09:00:00Z",
    mfaEnabled: true,
  },
  {
    id: "usr_01h8g3n7p8q9r0s1",
    firstName: "Alex",
    lastName: "Thompson",
    email: "alex.thompson@stella.io",
    status: "suspended",
    isSuperAdmin: false,
    lastLoginAt: "2026-02-10T11:30:00Z",
    lastLoginIp: "192.168.1.103",
    createdAt: "2025-10-20T14:45:00Z",
    mfaEnabled: false,
  },
  {
    id: "usr_01h8g3p8q9r0s1t2",
    firstName: "Lisa",
    lastName: "Anderson",
    email: "lisa.anderson@stella.io",
    status: "deactivated",
    isSuperAdmin: false,
    lastLoginAt: "2026-01-25T09:20:00Z",
    lastLoginIp: "192.168.1.104",
    createdAt: "2025-09-12T11:00:00Z",
    mfaEnabled: true,
  },
];

type AdminUserStatus = "active" | "invited" | "suspended" | "deactivated";

function formatDateTime(date: string | null) {
  if (!date) return "Never";
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminUsersPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: "" as AdminUserStatus | "",
    search: "",
  });

  // Filter admin users
  const filteredUsers = useMemo(() => {
    return MOCK_ADMIN_USERS.filter((user) => {
      const matchesStatus = !filters.status || user.status === filters.status;
      const matchesSearch =
        !filters.search ||
        user.firstName.toLowerCase().includes(filters.search.toLowerCase()) ||
        user.lastName.toLowerCase().includes(filters.search.toLowerCase()) ||
        user.email.toLowerCase().includes(filters.search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [filters]);

  // Count by status
  const statusCounts = useMemo(() => {
    return {
      active: MOCK_ADMIN_USERS.filter((u) => u.status === "active").length,
      invited: MOCK_ADMIN_USERS.filter((u) => u.status === "invited").length,
      suspended: MOCK_ADMIN_USERS.filter((u) => u.status === "suspended").length,
      deactivated: MOCK_ADMIN_USERS.filter((u) => u.status === "deactivated").length,
    };
  }, []);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl md:text-2xl font-semibold text-[#e8edf3]">Admin Users</h1>
          <p className="mt-1 font-mono text-[11px] text-[#5a7090]">
            Manage admin users and their permissions. Total: {MOCK_ADMIN_USERS.length}
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span>{showFilters ? "Hide Filters" : "Show Filters"}</span>
          </button>
          <Link
            href="/admin-users/invite"
            className="inline-flex items-center gap-2 px-3 py-2 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Invite Admin</span>
          </Link>
        </div>
      </div>

      {/* Status KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCard label="Active" count={statusCounts.active} color="#00e5a0" />
        <StatusCard label="Invited" count={statusCounts.invited} color="#3d9df3" />
        <StatusCard label="Suspended" count={statusCounts.suspended} color="#f5a623" />
        <StatusCard label="Deactivated" count={statusCounts.deactivated} color="#5a7090" />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-[#131920] border border-[#1e2d40] rounded p-4">
          <h3 className="font-mono text-xs font-semibold text-[#e8edf3] mb-3">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Search
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Email, name..."
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0]"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as AdminUserStatus | "" })}
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] focus:outline-none focus:border-[#00e5a0]"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="suspended">Suspended</option>
                <option value="deactivated">Deactivated</option>
              </select>
            </div>

            {/* Actions */}
            <div className="flex items-end gap-2">
              <button
                onClick={() => setFilters({ status: "", search: "" })}
                className="px-3 py-2 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Users Table */}
      <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[768px]">
            <thead className="bg-[#0d1117] border-b border-[#1e2d40]">
              <tr>
                <th className="px-4 py-3 text-left font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">
                  Email
                </th>
                <th className="px-4 py-3 text-left font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">
                  Last Login
                </th>
                <th className="px-4 py-3 text-left font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">
                  MFA
                </th>
                <th className="px-4 py-3 text-right font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d40]">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-[#0d1117] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-[#e8edf3]">
                        {user.firstName} {user.lastName}
                      </span>
                      {user.isSuperAdmin && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[rgba(167,139,250,0.15)] text-[#a78bfa] border border-[rgba(167,139,250,0.3)] font-mono text-[8px] font-bold uppercase tracking-wide">
                          Super Admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[#8fa3b8]">{user.email}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[#8fa3b8]">
                    {formatDateTime(user.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3">
                    {user.mfaEnabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[rgba(0,229,160,0.10)] text-[#00e5a0] font-mono text-[8px] font-bold">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[rgba(90,112,144,0.10)] text-[#5a7090] font-mono text-[8px] font-bold">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin-users/${user.id}`}
                      className="font-mono text-[10px] font-semibold text-[#3d9df3] hover:text-[#00e5a0] transition-colors"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <p className="font-mono text-[11px] text-[#5a7090]">No admin users found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="bg-[#0d1117] border border-[#1e2d40] rounded p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-2">{label}</div>
      <div className="font-mono text-2xl font-semibold text-[#e8edf3] leading-none">{count}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    active: {
      label: "Active",
      bg: "rgba(0,229,160,0.10)",
      color: "#00e5a0",
      border: "rgba(0,229,160,0.3)",
    },
    invited: {
      label: "Invited",
      bg: "rgba(61,157,243,0.10)",
      color: "#3d9df3",
      border: "rgba(61,157,243,0.3)",
    },
    suspended: {
      label: "Suspended",
      bg: "rgba(245,166,35,0.10)",
      color: "#f5a623",
      border: "rgba(245,166,35,0.3)",
    },
    deactivated: {
      label: "Deactivated",
      bg: "rgba(90,112,144,0.10)",
      color: "#5a7090",
      border: "rgba(90,112,144,0.3)",
    },
  };

  const { label, bg, color, border } = config[status as keyof typeof config] || config.active;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {label}
    </span>
  );
}
