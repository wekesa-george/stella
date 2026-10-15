"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateUsers, generateUserTransactions, generateUserActivity } from "@/lib/data/generators";
import type { User, UserTransaction, UserActivity } from "@/lib/types/dashboard";

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "activity">("overview");

  useEffect(() => {
    const users = generateUsers(50);
    const foundUser = users.find(u => u.id === params.id);

    if (foundUser) {
      setUser(foundUser);
      setTransactions(generateUserTransactions(foundUser.id));
      setActivities(generateUserActivity(foundUser.id));
    }
  }, [params.id]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-[#8fa3b8]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header Section */}
      <div className="border-b border-dark bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <button onClick={() => router.push('/users')} className="text-[#5a7090] hover:text-[#00e5a0] transition-colors">
              Users
            </button>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#00e5a0]">{user.id}</span>
          </div>

          {/* User Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00e5a0]/20 text-[#00e5a0] text-2xl font-bold">
                {user.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-xl font-bold text-foreground">{user.name}</span>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-sm ${
                    user.status === "active" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                    user.status === "suspended" ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]" :
                    "bg-[rgba(143,163,184,0.12)] text-[#8fa3b8]"
                  }`}>
                    {user.status}
                  </span>
                  {user.verified && (
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-sm bg-[rgba(0,229,160,0.12)] text-[#00e5a0]">
                      VERIFIED
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#5a7090]">{user.email} · {user.id}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-[#253550] hover:text-foreground transition-all">
                Edit User
              </button>
              <button className="px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,71,87,0.12)] text-[#ff4757] border border-[rgba(255,71,87,0.3)] hover:bg-[#ff4757] hover:text-white transition-all">
                Suspend
              </button>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-6 gap-3">
            {[
              ["Type", user.type, user.type === "trader" ? "text-[#00e5a0]" : user.type === "follower" ? "text-[#3d9df3]" : "text-[#f5a623]"],
              ["Verification", user.verificationLevel, ""],
              ["Total Trades", user.totalTrades, ""],
              ["Followers", user.followers, ""],
              ["Following", user.following, ""],
              ["Last Active", user.lastActive, ""],
            ].map(([label, val, cls]) => (
              <div key={label} className="bg-dark-elevated border border-dark rounded-md p-3">
                <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1">
                  {label}
                </div>
                <div className={`font-mono text-sm font-semibold capitalize ${cls || "text-foreground"}`}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-dark bg-card">
        <div className="max-w-7xl mx-auto px-6 flex gap-0">
          {[
            { key: "overview", label: "Overview" },
            { key: "transactions", label: "Transactions" },
            { key: "activity", label: "Activity Log" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wider border-b-2 transition-all ${
                activeTab === tab.key
                  ? "text-[#00e5a0] border-[#00e5a0]"
                  : "text-[#5a7090] border-transparent hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Performance Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
                <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Total P&L</div>
                <div className="font-mono text-[28px] font-semibold leading-none mb-1.5" style={{ color: user.totalPnl >= 0 ? "#00e5a0" : "#ff4757" }}>
                  {user.totalPnl >= 0 ? "+" : ""}${user.totalPnl.toLocaleString()}
                </div>
                <div className="text-xs text-[#5a7090]">lifetime earnings</div>
              </div>
              <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
                <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Win Rate</div>
                <div className="font-mono text-[28px] font-semibold text-foreground leading-none mb-1.5">
                  {user.winRate}%
                </div>
                <div className="text-xs text-[#5a7090]">success rate</div>
              </div>
              <div className="bg-dark-elevated border border-dark rounded-md p-3.5">
                <div className="text-[10px] text-[#5a7090] uppercase tracking-widest mb-1.5">Member Since</div>
                <div className="font-mono text-[28px] font-semibold text-foreground leading-none mb-1.5">
                  {new Date(user.joinDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </div>
                <div className="text-xs text-[#5a7090]">{user.joinDate}</div>
              </div>
            </div>

            {/* User Details */}
            <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-dark">
                <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">User Details</span>
              </div>
              <div className="p-3.5 grid grid-cols-2 gap-x-8 gap-y-3">
                {[
                  ["User ID", user.id],
                  ["Email", user.email],
                  ["Name", user.name],
                  ["Account Type", user.type],
                  ["Status", user.status],
                  ["Verification Level", user.verificationLevel],
                  ["Copy Trading", user.copyTrading ? "Enabled" : "Disabled"],
                  ["Join Date", user.joinDate],
                  ["Last Active", user.lastActive],
                  ["Total Trades", user.totalTrades.toString()],
                  ["Followers", user.followers.toString()],
                  ["Following", user.following.toString()],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center py-1">
                    <span className="text-xs text-[#5a7090]">{label}</span>
                    <span className="text-xs text-foreground font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Transaction History</span>
              <span className="text-[10px] text-[#5a7090]">{transactions.length} transactions</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark">
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">ID</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Type</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Amount</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Currency</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Status</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Description</th>
                    <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-[#8fa3b8] uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors">
                      <td className="px-3.5 py-2 font-mono text-xs text-[#5a7090]">{txn.id}</td>
                      <td className="px-3.5 py-2">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                          txn.type === "deposit" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                          txn.type === "withdrawal" ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]" :
                          txn.type === "trade" ? "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]" :
                          "bg-[rgba(143,163,184,0.12)] text-[#8fa3b8]"
                        }`}>
                          {txn.type}
                        </span>
                      </td>
                      <td className="px-3.5 py-2 font-mono text-xs text-foreground">${txn.amount.toLocaleString()}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-foreground">{txn.currency}</td>
                      <td className="px-3.5 py-2">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                          txn.status === "completed" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                          txn.status === "pending" ? "bg-[rgba(245,166,35,0.12)] text-[#f5a623]" :
                          "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
                        }`}>
                          {txn.status}
                        </span>
                      </td>
                      <td className="px-3.5 py-2 text-xs text-[#8fa3b8]">{txn.description}</td>
                      <td className="px-3.5 py-2 text-[10px] text-[#5a7090]">
                        {new Date(txn.timestamp).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "activity" && (
          <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
              <span className="text-xs font-semibold text-[#8fa3b8] uppercase tracking-wider">Activity Log</span>
              <span className="text-[10px] text-[#5a7090]">{activities.length} activities</span>
            </div>
            <div className="divide-y divide-dark/50">
              {activities.map((activity) => (
                <div key={activity.id} className="p-3.5 hover:bg-[#0d1117] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                      activity.type === "login" ? "bg-[#3d9df3]" :
                      activity.type === "trade" ? "bg-[#00e5a0]" :
                      activity.type === "withdraw" ? "bg-[#ff4757]" :
                      activity.type === "deposit" ? "bg-[#00e5a0]" :
                      "bg-[#8fa3b8]"
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs text-foreground mb-0.5">{activity.description}</div>
                          <div className="text-[10px] text-[#5a7090]">
                            {new Date(activity.timestamp).toLocaleString()} {activity.ip && `· ${activity.ip}`}
                          </div>
                        </div>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                          activity.type === "login" ? "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]" :
                          activity.type === "trade" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                          activity.type === "withdraw" ? "bg-[rgba(255,71,87,0.12)] text-[#ff4757]" :
                          activity.type === "deposit" ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" :
                          "bg-[rgba(143,163,184,0.12)] text-[#8fa3b8]"
                        }`}>
                          {activity.type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
