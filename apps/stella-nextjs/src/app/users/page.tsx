"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateUsers } from "@/lib/data/generators";
import type { User } from "@/lib/types/dashboard";
import { Search } from "lucide-react";

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterVerification, setFilterVerification] = useState<string>("all");

  useEffect(() => {
    setUsers(generateUsers(50));
  }, []);

  // Filter users
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || user.type === filterType;
    const matchesStatus = filterStatus === "all" || user.status === filterStatus;
    const matchesVerification = filterVerification === "all" || user.verificationLevel === filterVerification;
    return matchesSearch && matchesType && matchesStatus && matchesVerification;
  });

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === "active").length;
  const traders = users.filter(u => u.type === "trader" || u.type === "both").length;
  const followers = users.filter(u => u.type === "follower" || u.type === "both").length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Users</h1>
          <p className="text-sm text-[#8fa3b8]">
            Manage platform users ({filteredUsers.length} of {totalUsers} shown)
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Total Users</div>
            <div className="font-mono text-[28px] font-semibold text-foreground leading-none mb-1.5">{totalUsers}</div>
            <div className="text-xs text-[#5a7090]">{activeUsers} active</div>
          </div>
          <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Traders</div>
            <div className="font-mono text-[28px] font-semibold text-[#00e5a0] leading-none mb-1.5">{traders}</div>
            <div className="text-xs text-[#5a7090]">providing signals</div>
          </div>
          <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Followers</div>
            <div className="font-mono text-[28px] font-semibold text-[#3d9df3] leading-none mb-1.5">{followers}</div>
            <div className="text-xs text-[#5a7090]">copy trading</div>
          </div>
          <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
            <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Verified</div>
            <div className="font-mono text-[28px] font-semibold text-foreground leading-none mb-1.5">
              {users.filter(u => u.verified).length}
            </div>
            <div className="text-xs text-[#5a7090]">{((users.filter(u => u.verified).length / totalUsers) * 100).toFixed(0)}% verified</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8fa3b8]" />
            <input
              type="text"
              placeholder="Search by name, email, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-dark-elevated border border-dark rounded-sm text-sm text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-[#253550]"
            />
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full md:w-auto px-3 py-2 bg-dark-elevated border border-dark rounded-sm text-sm text-foreground focus:outline-none focus:border-[#253550]"
          >
            <option value="all">All Types</option>
            <option value="trader">Traders</option>
            <option value="follower">Followers</option>
            <option value="both">Both</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full md:w-auto px-3 py-2 bg-dark-elevated border border-dark rounded-sm text-sm text-foreground focus:outline-none focus:border-[#253550]"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>

          {/* Verification Filter */}
          <select
            value={filterVerification}
            onChange={(e) => setFilterVerification(e.target.value)}
            className="w-full md:w-auto px-3 py-2 bg-dark-elevated border border-dark rounded-sm text-sm text-foreground focus:outline-none focus:border-[#253550]"
          >
            <option value="all">All Verification</option>
            <option value="unverified">Unverified</option>
            <option value="basic">Basic</option>
            <option value="advanced">Advanced</option>
            <option value="full">Full</option>
          </select>
        </div>

        {/* Users Table - Desktop */}
        <div className="hidden md:block bg-dark-elevated border border-dark rounded-md overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
            <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">All Users</span>
            <span className="text-[10px] text-[#5a7090]">{filteredUsers.length} users</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark">
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">User</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Type</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Status</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Verification</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Trades</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Total P&L</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Win Rate</th>
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Joined</th>
                  <th className="px-3.5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors cursor-pointer"
                    onClick={() => router.push(`/users/${user.id}`)}
                  >
                    <td className="px-3.5 py-2">
                      <div>
                        <div className="text-xs text-foreground font-medium">{user.name}</div>
                        <div className="text-[10px] text-[#5a7090] font-mono">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                        user.type === "trader" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                        user.type === "follower" ? "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]" :
                        "bg-[rgba(245,166,35,0.12)] text-[#f5a623]"
                      }`}>
                        {user.type}
                      </span>
                    </td>
                    <td className="px-3.5 py-2">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                        user.status === "active" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                        user.status === "suspended" ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]" :
                        "bg-[rgba(143,163,184,0.12)] text-[#8fa3b8]"
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-xs text-foreground capitalize">{user.verificationLevel}</td>
                    <td className="px-3.5 py-2 font-mono text-xs text-foreground">{user.totalTrades}</td>
                    <td className="px-3.5 py-2 font-mono text-xs" style={{ color: user.totalPnl >= 0 ? "#00e5a0" : "#ff4757" }}>
                      {user.totalPnl >= 0 ? "+" : ""}${user.totalPnl.toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2 font-mono text-xs text-foreground">{user.winRate}%</td>
                    <td className="px-3.5 py-2 text-[10px] text-[#5a7090]">{user.joinDate}</td>
                    <td className="px-3.5 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/users/${user.id}`);
                        }}
                        className="px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase bg-transparent text-[#8fa3b8] border border-dark hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all"
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Users Cards - Mobile */}
        <div className="md:hidden space-y-3">
          <div className="px-3.5 py-2.5 bg-dark-elevated border border-dark rounded-md flex justify-between items-center">
            <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">All Users</span>
            <span className="text-[10px] text-[#5a7090]">{filteredUsers.length} users</span>
          </div>
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="bg-dark-elevated border border-dark rounded-md p-4 hover:bg-[#0d1117] transition-colors cursor-pointer"
              onClick={() => router.push(`/users/${user.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="text-sm text-foreground font-medium mb-0.5">{user.name}</div>
                  <div className="text-[10px] text-[#5a7090] font-mono">{user.email}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/users/${user.id}`);
                  }}
                  className="px-2 py-1 rounded-sm text-[9px] font-bold uppercase bg-transparent text-[#8fa3b8] border border-dark hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all"
                >
                  View →
                </button>
              </div>

              <div className="flex gap-2 mb-3">
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                  user.type === "trader" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                  user.type === "follower" ? "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]" :
                  "bg-[rgba(245,166,35,0.12)] text-[#f5a623]"
                }`}>
                  {user.type}
                </span>
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                  user.status === "active" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                  user.status === "suspended" ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]" :
                  "bg-[rgba(143,163,184,0.12)] text-[#8fa3b8]"
                }`}>
                  {user.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-0.5">Verification</div>
                  <div className="text-xs text-foreground capitalize">{user.verificationLevel}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-0.5">Trades</div>
                  <div className="font-mono text-xs text-foreground">{user.totalTrades}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-0.5">Total P&L</div>
                  <div className="font-mono text-xs" style={{ color: user.totalPnl >= 0 ? "#00e5a0" : "#ff4757" }}>
                    {user.totalPnl >= 0 ? "+" : ""}${user.totalPnl.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-0.5">Win Rate</div>
                  <div className="font-mono text-xs text-foreground">{user.winRate}%</div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-dark/50">
                <div className="text-[10px] text-[#5a7090]">Joined {user.joinDate}</div>
              </div>
            </div>
          ))}
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#8fa3b8]">No users match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
