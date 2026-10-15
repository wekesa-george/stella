"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getUsers } from "@/lib/stellaAdminApi";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

// ── Types (matches auth.users + auth.user_profiles from DB) ──────

interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  countryCode: string | null;
  avatarUrl: string | null;
  riskTolerance: string | null;
  investmentExperience: string | null;
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  status: string;
  tier: string;
  kycStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  profile: UserProfile | null;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]",
  suspended: "bg-[rgba(255,71,87,0.12)] text-[#ff4757]",
  banned: "bg-[rgba(255,71,87,0.12)] text-[#ff4757]",
  deactivated: "bg-[rgba(143,163,184,0.12)] text-[#8fa3b8]",
  pending_verification: "bg-[rgba(245,166,35,0.12)] text-[#f5a623]",
};

const TIER_STYLES: Record<string, string> = {
  stella_one: "bg-[rgba(143,163,184,0.12)] text-[#8fa3b8]",
  stella_unum: "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]",
  stella_eon: "bg-[rgba(168,85,247,0.12)] text-[#a855f7]",
  stella_plenum: "bg-[rgba(255,215,0,0.12)] text-[#FFD700]",
};

const KYC_STYLES: Record<string, string> = {
  not_submitted: "text-[#5a7090]",
  pending: "text-[#f5a623]",
  approved: "text-[#00e5a0]",
  declined: "text-[#ff4757]",
  expired: "text-[#8fa3b8]",
};

function formatTier(tier: string) {
  return tier.replace("stella_", "").replace(/_/g, " ");
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRelative(dateStr: string | null) {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

function displayName(user: UserRow) {
  if (user.profile?.displayName) return user.profile.displayName;
  if (user.profile?.firstName || user.profile?.lastName) {
    return [user.profile.firstName, user.profile.lastName].filter(Boolean).join(" ");
  }
  return user.username || user.email.split("@")[0];
}

// ── Page Component ───────────────────────────────────────────────

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 25, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterKyc, setFilterKyc] = useState<string>("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC");
  const [page, setPage] = useState(1);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params: Record<string, any> = {
      page,
      limit: 25,
      sortBy,
      sortOrder,
    };
    if (searchQuery.trim()) params.search = searchQuery.trim();
    if (filterStatus !== "all") params.status = filterStatus;
    if (filterTier !== "all") params.tier = filterTier;
    if (filterKyc !== "all") params.kycStatus = filterKyc;

    const res = await getUsers(params);
    if (res.data) {
      const payload = res.data as any;
      setUsers(payload.data || []);
      if (payload.meta) setMeta(payload.meta);
    }
    setLoading(false);
  }, [page, searchQuery, filterStatus, filterTier, filterKyc, sortBy, sortOrder]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterStatus, filterTier, filterKyc]);

  // Stats from current meta
  const totalUsers = meta.total;
  const statusCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Users</h1>
          <p className="text-sm text-[#8fa3b8]">
            Platform users ({totalUsers} total)
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Total Users</div>
            <div className="font-mono text-[28px] font-semibold text-foreground leading-none">{totalUsers}</div>
          </div>
          <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Active</div>
            <div className="font-mono text-[28px] font-semibold text-[#00e5a0] leading-none">{statusCounts["active"] || 0}</div>
          </div>
          <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Suspended</div>
            <div className="font-mono text-[28px] font-semibold text-[#ff4757] leading-none">{statusCounts["suspended"] || 0}</div>
          </div>
          <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Pending</div>
            <div className="font-mono text-[28px] font-semibold text-[#f5a623] leading-none">{statusCounts["pending_verification"] || 0}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8fa3b8]" />
            <input
              type="text"
              placeholder="Search by name, email, or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-dark-elevated border border-dark rounded-sm text-sm text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-[#253550]"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full md:w-auto px-3 py-2 bg-dark-elevated border border-dark rounded-sm text-sm text-foreground focus:outline-none focus:border-[#253550]"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending_verification">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="deactivated">Deactivated</option>
          </select>

          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="w-full md:w-auto px-3 py-2 bg-dark-elevated border border-dark rounded-sm text-sm text-foreground focus:outline-none focus:border-[#253550]"
          >
            <option value="all">All Tiers</option>
            <option value="stella_one">Stella One</option>
            <option value="stella_unum">Stella Unum</option>
            <option value="stella_eon">Stella Eon</option>
            <option value="stella_plenum">Stella Plenum</option>
          </select>

          <select
            value={filterKyc}
            onChange={(e) => setFilterKyc(e.target.value)}
            className="w-full md:w-auto px-3 py-2 bg-dark-elevated border border-dark rounded-sm text-sm text-foreground focus:outline-none focus:border-[#253550]"
          >
            <option value="all">All KYC</option>
            <option value="not_submitted">Not Submitted</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>
        </div>

        {/* Users Table - Desktop */}
        <div className="hidden md:block bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
            <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">All Users</span>
            <span className="text-[10px] text-[#5a7090]">{users.length} of {totalUsers}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#5a7090]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-sm text-[#5a7090]">
              No users match your filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark">
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">User</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Status</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Tier</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">KYC</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Email</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Last Login</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Joined</th>
                    <th className="px-3.5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors cursor-pointer"
                      onClick={() => router.push(`/users/${user.id}`)}
                    >
                      <td className="px-3.5 py-2">
                        <div>
                          <div className="text-xs text-foreground font-medium">{displayName(user)}</div>
                          <div className="text-[10px] text-[#5a7090] font-mono">@{user.username}</div>
                        </div>
                      </td>
                      <td className="px-3.5 py-2">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${STATUS_STYLES[user.status] || STATUS_STYLES.deactivated}`}>
                          {user.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3.5 py-2">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${TIER_STYLES[user.tier] || TIER_STYLES.stella_one}`}>
                          {formatTier(user.tier)}
                        </span>
                      </td>
                      <td className="px-3.5 py-2">
                        <span className={`text-[10px] capitalize ${KYC_STYLES[user.kycStatus] || "text-[#5a7090]"}`}>
                          {(user.kycStatus || "not_submitted").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-foreground font-mono">{user.email}</span>
                          {user.emailVerified && (
                            <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded-sm bg-[rgba(0,229,160,0.12)] text-[#00e5a0]">
                              verified
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2 text-[10px] text-[#5a7090]">{formatRelative(user.lastLoginAt)}</td>
                      <td className="px-3.5 py-2 text-[10px] text-[#5a7090]">{formatDate(user.createdAt)}</td>
                      <td className="px-3.5 py-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/users/${user.id}`);
                          }}
                          className="px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase bg-transparent text-[#8fa3b8] border border-dark hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Users Cards - Mobile */}
        <div className="md:hidden space-y-3">
          <div className="px-3.5 py-2.5 bg-dark-elevated border border-dark rounded-md flex justify-between items-center">
            <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">All Users</span>
            <span className="text-[10px] text-[#5a7090]">{users.length} of {totalUsers}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#5a7090]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-sm text-[#5a7090]">
              No users match your filters
            </div>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className="bg-dark-elevated border border-dark rounded-md p-4 hover:bg-[#0d1117] transition-colors cursor-pointer"
                onClick={() => router.push(`/users/${user.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="text-sm text-foreground font-medium mb-0.5">{displayName(user)}</div>
                    <div className="text-[10px] text-[#5a7090] font-mono">@{user.username} &middot; {user.email}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/users/${user.id}`);
                    }}
                    className="px-2 py-1 rounded-sm text-[9px] font-bold uppercase bg-transparent text-[#8fa3b8] border border-dark hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all"
                  >
                    View
                  </button>
                </div>

                <div className="flex gap-2 mb-3">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${STATUS_STYLES[user.status] || STATUS_STYLES.deactivated}`}>
                    {user.status.replace(/_/g, " ")}
                  </span>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${TIER_STYLES[user.tier] || TIER_STYLES.stella_one}`}>
                    {formatTier(user.tier)}
                  </span>
                  {user.emailVerified && (
                    <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded-sm bg-[rgba(0,229,160,0.12)] text-[#00e5a0]">
                      verified
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-0.5">KYC Status</div>
                    <div className={`text-xs capitalize ${KYC_STYLES[user.kycStatus] || "text-[#5a7090]"}`}>
                      {(user.kycStatus || "not_submitted").replace(/_/g, " ")}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-0.5">Last Login</div>
                    <div className="text-xs text-foreground">{formatRelative(user.lastLoginAt)}</div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-dark/50">
                  <div className="text-[10px] text-[#5a7090]">Joined {formatDate(user.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#5a7090]">
              Page {meta.page} of {meta.totalPages}
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1.5 rounded-sm text-xs bg-dark-elevated border border-dark text-[#8fa3b8] hover:border-dark-2 hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                className="px-2.5 py-1.5 rounded-sm text-xs bg-dark-elevated border border-dark text-[#8fa3b8] hover:border-dark-2 hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
