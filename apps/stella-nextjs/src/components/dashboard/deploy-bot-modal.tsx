"use client";

import { useState, useEffect, useMemo } from "react";
import {
  createBot,
  createSystemBot,
  listServiceAccounts,
  listStrategies,
  listExchanges,
  listTradingPairs,
  listUserCredentials,
  listServiceAccountCredentials,
} from "@/lib/tradingEngineApi";
import { getUsers } from "@/lib/stellaAdminApi";
import { mapApiBotToUiBot } from "@/lib/api/mappers";
import type { Bot } from "@/lib/types/dashboard";

// ── Types ────────────────────────────────────────────────────────

interface ServiceAccount {
  id: string;
  name: string;
  account_type: string;
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  status: string;
}

interface StrategyRow {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string;
  is_live_enabled: boolean;
  timeframe: string | null;
  config: Record<string, any>;
  supported_pairs: string[];
  supported_exchanges: string[];
}

interface ExchangeRow {
  id: string;
  exchange_key: string;
  name: string;
  status: string;
  is_active: boolean;
}

interface TradingPairRow {
  id: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  is_active: boolean;
}

interface CredentialRow {
  id: string;
  label: string;
  status: string;
  auth_model: string;
  adapter_id: string;
  is_sandbox: boolean;
}

interface DeployBotModalProps {
  open: boolean;
  onClose: () => void;
  onDeployed: (bot: Bot) => void;
}

// ── Constants ────────────────────────────────────────────────────

const STEPS = [
  { label: "Owner", short: "1" },
  { label: "Account", short: "2" },
  { label: "Exchange", short: "3" },
  { label: "Strategy", short: "4" },
  { label: "Review", short: "5" },
] as const;

const TOTAL_STEPS = STEPS.length;

// ── Component ────────────────────────────────────────────────────

export function DeployBotModal({ open, onClose, onDeployed }: DeployBotModalProps) {
  // Wizard state
  const [step, setStep] = useState(1);

  // Step 1 — Owner type
  const [ownerType, setOwnerType] = useState<"user" | "system">("user");

  // Step 2 — User / Service Account
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>([]);
  const [selectedSaId, setSelectedSaId] = useState("");

  // Step 3 — Exchange / Pairs / Credential
  const [exchanges, setExchanges] = useState<ExchangeRow[]>([]);
  const [selectedExchangeId, setSelectedExchangeId] = useState("");
  const [tradingPairs, setTradingPairs] = useState<TradingPairRow[]>([]);
  const [selectedPairs, setSelectedPairs] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState("");

  // Step 4 — Strategy
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState("");

  // Step 5 — Review / Deploy
  const [botName, setBotName] = useState("");
  const [allocatedCapital, setAllocatedCapital] = useState("");

  // Shared state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Data loading ─────────────────────────────────────────────

  // Load service accounts when opening in system mode
  useEffect(() => {
    if (!open) return;
    listServiceAccounts().then((res) => {
      if (res.data && Array.isArray(res.data)) {
        setServiceAccounts(res.data);
        if (res.data.length > 0 && !selectedSaId) setSelectedSaId(res.data[0].id);
      }
    });
  }, [open]);

  // Load users when searching
  useEffect(() => {
    if (!open || ownerType !== "user") return;
    setUsersLoading(true);
    const timeout = setTimeout(() => {
      getUsers({ search: userSearch || undefined, limit: 20 }).then((res) => {
        if (res.data) {
          const d = res.data as any;
          const list = Array.isArray(d) ? d : d.users || d.items || [];
          setUsers(list);
        }
        setUsersLoading(false);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [open, ownerType, userSearch]);

  // Load exchanges when entering step 3
  useEffect(() => {
    if (!open || step < 3) return;
    listExchanges().then((res) => {
      if (res.data && Array.isArray(res.data)) {
        setExchanges(res.data);
        if (res.data.length > 0 && !selectedExchangeId) setSelectedExchangeId(res.data[0].id);
      }
    });
  }, [open, step]);

  // Load trading pairs when exchange selected
  useEffect(() => {
    if (!selectedExchangeId) return;
    setTradingPairs([]);
    setSelectedPairs([]);
    listTradingPairs(selectedExchangeId).then((res) => {
      if (res.data && Array.isArray(res.data)) {
        setTradingPairs(res.data);
      }
    });
  }, [selectedExchangeId]);

  // Load credentials for selected user or service account
  useEffect(() => {
    setCredentials([]);
    setSelectedCredentialId("");
    if (ownerType === "user" && selectedUserId) {
      listUserCredentials(selectedUserId).then((res) => {
        if (res.data && Array.isArray(res.data)) {
          setCredentials(res.data);
          if (res.data.length > 0) setSelectedCredentialId(res.data[0].id);
        }
      });
    } else if (ownerType === "system" && selectedSaId) {
      listServiceAccountCredentials(selectedSaId).then((res) => {
        if (res.data && Array.isArray(res.data)) {
          setCredentials(res.data);
          if (res.data.length > 0) setSelectedCredentialId(res.data[0].id);
        }
      });
    }
  }, [selectedUserId, selectedSaId, ownerType]);

  // Load strategies when entering step 4
  useEffect(() => {
    if (!open || step < 4) return;
    listStrategies({ status: "active" }).then((res) => {
      if (res.data && Array.isArray(res.data)) {
        setStrategies(res.data);
        if (res.data.length > 0 && !selectedStrategyId) setSelectedStrategyId(res.data[0].id);
      }
    });
  }, [open, step]);

  // ── Derived values ───────────────────────────────────────────

  const selectedExchange = exchanges.find((e) => e.id === selectedExchangeId);
  const selectedStrategy = strategies.find((s) => s.id === selectedStrategyId);
  const selectedUser = users.find((u) => u.id === selectedUserId);
  const selectedSa = serviceAccounts.find((sa) => sa.id === selectedSaId);

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  // ── Navigation ───────────────────────────────────────────────

  const canNext = () => {
    switch (step) {
      case 1:
        return true; // owner type is always selected
      case 2:
        return ownerType === "user" ? !!selectedUserId : !!selectedSaId;
      case 3:
        return !!selectedExchangeId && selectedPairs.length > 0;
      case 4:
        return !!selectedStrategyId;
      case 5:
        return !!botName.trim();
      default:
        return false;
    }
  };

  const handleNext = () => {
    setError(null);
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
  };

  const resetForm = () => {
    setStep(1);
    setOwnerType("user");
    setSelectedUserId("");
    setUserSearch("");
    setSelectedSaId(serviceAccounts[0]?.id ?? "");
    setSelectedExchangeId("");
    setSelectedPairs([]);
    setSelectedCredentialId("");
    setSelectedStrategyId("");
    setBotName("");
    setAllocatedCapital("");
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // ── Submit ───────────────────────────────────────────────────

  const handleDeploy = async () => {
    setError(null);
    if (!botName.trim()) {
      setError("Bot name is required");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        name: botName.trim(),
        exchange: selectedExchange?.exchange_key || "binance",
        trading_pairs: selectedPairs,
        strategy_id: selectedStrategyId || undefined,
        credential_id: selectedCredentialId || undefined,
        allocated_capital: allocatedCapital ? Number(allocatedCapital) : undefined,
      };

      let result;
      if (ownerType === "system") {
        result = await createSystemBot({ service_account_id: selectedSaId, ...payload });
      } else {
        result = await createBot({ user_id: selectedUserId, ...payload });
      }

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) {
        const bot = mapApiBotToUiBot(result.data);
        onDeployed(bot);
        handleClose();
      }
    } catch {
      setError("Failed to deploy bot");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Toggle pair selection ────────────────────────────────────

  const togglePair = (symbol: string) => {
    setSelectedPairs((prev) =>
      prev.includes(symbol) ? prev.filter((p) => p !== symbol) : [...prev, symbol]
    );
  };

  // ── Render ───────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-dark rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Deploy New Bot
            </h2>
            <p className="text-[10px] text-[#5a7090] mt-0.5">
              Step {step} of {TOTAL_STEPS} — {STEPS[step - 1].label}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-[#5a7090] hover:text-foreground transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Step Indicators */}
        <div className="px-5 py-3 border-b border-dark flex gap-1 shrink-0">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => i + 1 < step && setStep(i + 1)}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                i + 1 === step
                  ? "bg-[#00e5a0]"
                  : i + 1 < step
                  ? "bg-[#00e5a0]/40 cursor-pointer hover:bg-[#00e5a0]/60"
                  : "bg-[#1e2d40]"
              }`}
              disabled={i + 1 >= step}
              title={s.label}
            />
          ))}
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          {step === 1 && <StepOwnerType ownerType={ownerType} setOwnerType={setOwnerType} />}

          {step === 2 && ownerType === "user" && (
            <StepUserPicker
              users={filteredUsers}
              loading={usersLoading}
              search={userSearch}
              onSearch={setUserSearch}
              selectedId={selectedUserId}
              onSelect={setSelectedUserId}
            />
          )}

          {step === 2 && ownerType === "system" && (
            <StepServiceAccountPicker
              accounts={serviceAccounts}
              selectedId={selectedSaId}
              onSelect={setSelectedSaId}
            />
          )}

          {step === 3 && (
            <StepExchange
              exchanges={exchanges}
              selectedExchangeId={selectedExchangeId}
              onSelectExchange={setSelectedExchangeId}
              tradingPairs={tradingPairs}
              selectedPairs={selectedPairs}
              onTogglePair={togglePair}
              credentials={credentials}
              selectedCredentialId={selectedCredentialId}
              onSelectCredential={setSelectedCredentialId}
              showCredentials={ownerType === "user" ? !!selectedUserId : !!selectedSaId}
            />
          )}

          {step === 4 && (
            <StepStrategy
              strategies={strategies}
              selectedId={selectedStrategyId}
              onSelect={setSelectedStrategyId}
            />
          )}

          {step === 5 && (
            <StepReview
              ownerType={ownerType}
              user={selectedUser}
              serviceAccount={selectedSa}
              exchange={selectedExchange}
              selectedPairs={selectedPairs}
              strategy={selectedStrategy}
              credential={credentials.find((c) => c.id === selectedCredentialId)}
              botName={botName}
              setBotName={setBotName}
              allocatedCapital={allocatedCapital}
              setAllocatedCapital={setAllocatedCapital}
            />
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-dark flex gap-2.5 justify-between shrink-0">
          <button
            onClick={step === 1 ? handleClose : handleBack}
            disabled={submitting}
            className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          <div className="flex gap-2.5">
            {step < TOTAL_STEPS ? (
              <button
                onClick={handleNext}
                disabled={!canNext()}
                className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#00e5a0] text-black hover:bg-[#00ffb2] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleDeploy}
                disabled={submitting || !canNext()}
                className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#00e5a0] text-black hover:bg-[#00ffb2] transition-all disabled:opacity-50"
              >
                {submitting ? "Deploying..." : "Deploy Bot"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step Components ──────────────────────────────────────────────

function StepOwnerType({
  ownerType,
  setOwnerType,
}: {
  ownerType: "user" | "system";
  setOwnerType: (t: "user" | "system") => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-[#8fa3b8]">
        Who will own this bot? User bots trade on behalf of a specific client.
        System bots are managed by admin service accounts.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(["user", "system"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setOwnerType(type)}
            className={`p-4 rounded-md border text-left transition-all ${
              ownerType === type
                ? "border-[#00e5a0] bg-[rgba(0,229,160,0.06)]"
                : "border-dark hover:border-dark-2"
            }`}
          >
            <div className="text-xs font-bold uppercase tracking-wider text-foreground mb-1">
              {type === "user" ? "Client User" : "System / Service Account"}
            </div>
            <p className="text-[10px] text-[#5a7090] leading-relaxed">
              {type === "user"
                ? "Bot trades using a client's exchange credentials and capital."
                : "Bot is owned by a service account for system trading, testing, or demo purposes."}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepUserPicker({
  users,
  loading,
  search,
  onSearch,
  selectedId,
  onSelect,
}: {
  users: UserRow[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block">
        Search Users
      </label>
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search by name, email, or ID..."
        className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
        autoFocus
      />
      <div className="border border-dark rounded-sm max-h-[320px] overflow-y-auto">
        {loading && (
          <div className="px-3 py-6 text-center text-[10px] text-[#5a7090]">Loading users...</div>
        )}
        {!loading && users.length === 0 && (
          <div className="px-3 py-6 text-center text-[10px] text-[#5a7090]">
            {search ? "No users found" : "Type to search users"}
          </div>
        )}
        {!loading &&
          users.map((u) => (
            <button
              key={u.id}
              onClick={() => onSelect(u.id)}
              className={`w-full px-3 py-2.5 flex items-center justify-between text-left border-b border-dark last:border-b-0 transition-all ${
                selectedId === u.id
                  ? "bg-[rgba(0,229,160,0.06)]"
                  : "hover:bg-dark-elevated"
              }`}
            >
              <div>
                <div className="text-xs text-foreground font-medium">
                  {u.username || u.email}
                </div>
                <div className="text-[10px] text-[#5a7090] font-mono mt-0.5">
                  {u.email} &middot; {u.id.slice(0, 8)}...
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                    u.status === "active"
                      ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]"
                      : "bg-[rgba(90,112,144,0.12)] text-[#5a7090]"
                  }`}
                >
                  {u.status}
                </span>
                {selectedId === u.id && (
                  <span className="text-[#00e5a0] text-sm">&#10003;</span>
                )}
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}

function StepServiceAccountPicker({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: ServiceAccount[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block">
        Select Service Account
      </label>
      {accounts.length === 0 ? (
        <div className="text-xs text-[#5a7090] py-4 text-center">
          No service accounts found. Create one in Settings.
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((sa) => (
            <button
              key={sa.id}
              onClick={() => onSelect(sa.id)}
              className={`w-full p-3 rounded-md border text-left transition-all ${
                selectedId === sa.id
                  ? "border-[#00e5a0] bg-[rgba(0,229,160,0.06)]"
                  : "border-dark hover:border-dark-2"
              }`}
            >
              <div className="text-xs font-bold text-foreground">{sa.name}</div>
              <div className="text-[10px] text-[#5a7090] mt-0.5">
                Type: {sa.account_type} &middot; {sa.id.slice(0, 8)}...
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepExchange({
  exchanges,
  selectedExchangeId,
  onSelectExchange,
  tradingPairs,
  selectedPairs,
  onTogglePair,
  credentials,
  selectedCredentialId,
  onSelectCredential,
  showCredentials,
}: {
  exchanges: ExchangeRow[];
  selectedExchangeId: string;
  onSelectExchange: (id: string) => void;
  tradingPairs: TradingPairRow[];
  selectedPairs: string[];
  onTogglePair: (symbol: string) => void;
  credentials: CredentialRow[];
  selectedCredentialId: string;
  onSelectCredential: (id: string) => void;
  showCredentials: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Exchange Selection */}
      <div>
        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
          Exchange
        </label>
        {exchanges.length === 0 ? (
          <div className="text-xs text-[#5a7090]">Loading exchanges...</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {exchanges.map((ex) => (
              <button
                key={ex.id}
                onClick={() => onSelectExchange(ex.id)}
                className={`px-3 py-1.5 rounded-sm text-[11px] font-bold uppercase border transition-all ${
                  selectedExchangeId === ex.id
                    ? "border-[#00e5a0] bg-[rgba(0,229,160,0.08)] text-[#00e5a0]"
                    : "border-dark text-[#8fa3b8] hover:border-dark-2"
                }`}
              >
                {ex.name || ex.exchange_key}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Trading Pairs */}
      <div>
        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
          Trading Pairs
          {selectedPairs.length > 0 && (
            <span className="text-[#00e5a0] ml-2">{selectedPairs.length} selected</span>
          )}
        </label>
        {tradingPairs.length === 0 ? (
          <div className="text-xs text-[#5a7090] py-2">
            {selectedExchangeId ? "No trading pairs found for this exchange" : "Select an exchange first"}
          </div>
        ) : (
          <div className="border border-dark rounded-sm max-h-[200px] overflow-y-auto">
            <div className="grid grid-cols-3 gap-0">
              {tradingPairs.map((tp) => (
                <button
                  key={tp.id}
                  onClick={() => onTogglePair(tp.symbol)}
                  className={`px-2.5 py-2 text-[11px] font-mono border-b border-r border-dark text-left transition-all ${
                    selectedPairs.includes(tp.symbol)
                      ? "bg-[rgba(0,229,160,0.06)] text-[#00e5a0]"
                      : "text-[#8fa3b8] hover:bg-dark-elevated"
                  }`}
                >
                  <span className="font-bold">{tp.base_asset}</span>
                  <span className="text-[#5a7090]">/{tp.quote_asset}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Credentials */}
      {showCredentials && (
        <div>
          <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
            Exchange Credential
          </label>
          {credentials.length === 0 ? (
            <div className="text-xs text-[#5a7090]">No credentials found for this user</div>
          ) : (
            <select
              value={selectedCredentialId}
              onChange={(e) => onSelectCredential(e.target.value)}
              className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground focus:outline-none focus:border-dark-2"
            >
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.id.slice(0, 8)} {c.is_sandbox ? "[sandbox]" : ""} {c.status !== "active" ? `(${c.status})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

function StepStrategy({
  strategies,
  selectedId,
  onSelect,
}: {
  strategies: StrategyRow[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const typeColors: Record<string, string> = {
    core_momentum: "text-[#00e5a0] bg-[rgba(0,229,160,0.12)]",
    core_grid: "text-[#3d9df3] bg-[rgba(61,157,243,0.12)]",
    core_dca: "text-[#f5a623] bg-[rgba(245,166,35,0.12)]",
    core_mean_reversion: "text-[#a855f7] bg-[rgba(168,85,247,0.12)]",
    core_trend_following: "text-[#ec4899] bg-[rgba(236,72,153,0.12)]",
  };

  return (
    <div className="space-y-3">
      <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block">
        Select Strategy
      </label>
      {strategies.length === 0 ? (
        <div className="text-xs text-[#5a7090] py-4 text-center">
          Loading strategies...
        </div>
      ) : (
        <div className="space-y-2">
          {strategies.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full p-3 rounded-md border text-left transition-all ${
                selectedId === s.id
                  ? "border-[#00e5a0] bg-[rgba(0,229,160,0.06)]"
                  : "border-dark hover:border-dark-2"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold text-foreground">{s.name}</div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                      typeColors[s.type] || "text-[#5a7090] bg-[rgba(90,112,144,0.12)]"
                    }`}
                  >
                    {s.type.replace("core_", "")}
                  </span>
                  {s.is_live_enabled && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-[rgba(0,229,160,0.12)] text-[#00e5a0]">
                      LIVE
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-[#5a7090] leading-relaxed line-clamp-2">
                {s.description}
              </p>
              {s.timeframe && (
                <div className="text-[9px] text-[#5a7090] mt-1.5 font-mono">
                  Timeframe: {s.timeframe}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepReview({
  ownerType,
  user,
  serviceAccount,
  exchange,
  selectedPairs,
  strategy,
  credential,
  botName,
  setBotName,
  allocatedCapital,
  setAllocatedCapital,
}: {
  ownerType: "user" | "system";
  user?: UserRow;
  serviceAccount?: ServiceAccount;
  exchange?: ExchangeRow;
  selectedPairs: string[];
  strategy?: StrategyRow;
  credential?: CredentialRow;
  botName: string;
  setBotName: (n: string) => void;
  allocatedCapital: string;
  setAllocatedCapital: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Bot Name */}
      <div>
        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
          Bot Name
        </label>
        <input
          value={botName}
          onChange={(e) => setBotName(e.target.value)}
          placeholder="e.g. BTC Scalper Alpha"
          className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
          autoFocus
        />
      </div>

      {/* Allocated Capital */}
      <div>
        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
          Allocated Capital (USD)
        </label>
        <input
          value={allocatedCapital}
          onChange={(e) => setAllocatedCapital(e.target.value)}
          placeholder="10000"
          type="number"
          min="0"
          className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
        />
      </div>

      {/* Summary */}
      <div className="border border-dark rounded-md overflow-hidden">
        <div className="px-3 py-2 bg-dark-elevated border-b border-dark">
          <span className="text-[9px] text-[#5a7090] uppercase tracking-widest font-bold">
            Configuration Summary
          </span>
        </div>
        <div className="divide-y divide-[#1e2d40]">
          <SummaryRow label="Owner" value={
            ownerType === "user"
              ? user ? `${user.username || user.email} (${user.id.slice(0, 8)}...)` : "—"
              : serviceAccount ? `${serviceAccount.name} (${serviceAccount.account_type})` : "—"
          } />
          <SummaryRow
            label="Exchange"
            value={exchange?.name || exchange?.exchange_key || "—"}
          />
          <SummaryRow
            label="Trading Pairs"
            value={selectedPairs.length > 0 ? selectedPairs.join(", ") : "—"}
          />
          <SummaryRow
            label="Strategy"
            value={strategy ? `${strategy.name} (${strategy.type.replace("core_", "")})` : "—"}
          />
          {credential && (
            <SummaryRow
              label="Credential"
              value={credential.label || credential.id.slice(0, 8)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 flex justify-between items-center">
      <span className="text-[10px] text-[#5a7090] uppercase tracking-wider">{label}</span>
      <span className="text-[11px] text-foreground font-mono">{value}</span>
    </div>
  );
}
