"use client";

import { useState, useEffect } from "react";
import { BotCard } from "@/components/dashboard/bot-card";
import { AlertSidebar } from "@/components/dashboard/alert-sidebar";
import { generateBots, generateAlerts, STRATEGIES, EXCHANGES, USERS } from "@/lib/data/generators";
import type { Bot, Alert } from "@/lib/types/dashboard";
import { Search } from "lucide-react";

export default function BotFleetPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [killModal, setKillModal] = useState<string | null>(null);

  // Initialize data on client side
  useEffect(() => {
    setBots(generateBots(18));
    setAlerts(generateAlerts());
  }, []);

  const handleAck = (id: number) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acked: true } : a))
    );
  };

  const handleKill = (botId: string) => {
    setKillModal(botId);
  };

  const confirmKill = () => {
    if (killModal) {
      setBots((prev) => prev.filter((b) => b.id !== killModal));
      setKillModal(null);
    }
  };

  // Filter bots
  const filteredBots = bots.filter((bot) => {
    const matchesSearch =
      bot.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bot.user.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || bot.status === filterStatus;
    const matchesUser = filterUser === "all" || bot.user === filterUser;
    return matchesSearch && matchesStatus && matchesUser;
  });

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#00e5a0]">Bot Fleet</span>
          </div>

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Bot Fleet</h1>
              <p className="text-xs sm:text-sm text-[#8fa3b8]">
                Manage and monitor all trading bots ({filteredBots.length} of {bots.length} shown)
              </p>
            </div>
            <button className="px-4 py-2 rounded bg-[#00e5a0] text-black text-xs font-bold uppercase tracking-wider hover:bg-[#00ffb2] transition-all whitespace-nowrap">
              + Deploy New Bot
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8fa3b8]" />
              <input
                type="text"
                placeholder="Search bots by ID, name, or user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-elevated border border-dark rounded text-sm text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
              />
            </div>

            <div className="flex gap-2 sm:gap-3">
              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 sm:flex-none px-3 py-2 bg-dark-elevated border border-dark rounded text-sm text-foreground focus:outline-none focus:border-dark-2"
              >
                <option value="all">All Status</option>
                <option value="running">Running</option>
                <option value="paused">Paused</option>
                <option value="error">Error</option>
              </select>

              {/* User Filter */}
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="flex-1 sm:flex-none px-3 py-2 bg-dark-elevated border border-dark rounded text-sm text-foreground focus:outline-none focus:border-dark-2"
              >
                <option value="all">All Users</option>
                {USERS.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bot Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {filteredBots.map((bot) => (
              <BotCard
                key={bot.id}
                bot={bot}
                onKill={handleKill}
                onSelect={setSelectedBot}
                selected={selectedBot === bot.id}
              />
            ))}
          </div>

          {filteredBots.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[#8fa3b8]">No bots match your filters</p>
            </div>
          )}
        </div>
      </div>

      {/* Alert Sidebar */}
      <AlertSidebar alerts={alerts} onAck={handleAck} />

      {/* Kill Modal */}
      {killModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-dark rounded-lg p-6 w-96 space-y-4">
            <h3 className="text-sm font-bold text-foreground">Confirm Bot Termination</h3>
            <p className="text-xs text-[#8fa3b8] leading-relaxed">
              Are you sure you want to kill bot <span className="font-mono text-foreground">{killModal}</span>?
              This will close all open positions and stop the bot immediately.
            </p>
            <textarea
              placeholder="Reason for termination (optional)..."
              className="w-full bg-dark-elevated border border-dark rounded text-xs text-foreground p-2.5 resize-none focus:outline-none focus:border-dark-2 placeholder:text-[#5a7090]"
              rows={3}
            />
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setKillModal(null)}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmKill}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-[#ff4757] text-white hover:bg-[#ff2233] transition-all"
              >
                Kill Bot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
