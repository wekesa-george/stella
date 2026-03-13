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
  const [batchMode, setBatchMode] = useState(false);
  const [batchBots, setBatchBots] = useState<{ name: string; capital: string; pairs: string[] }[]>([]);

  // Shared state
  const [submitting, setSubmitting] = useState(false);
  const [deployProgress, setDeployProgress] = useState<{ total: number; done: number; errors: string[] } | null>(null);
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
        return batchMode
          ? batchBots.length > 0 && batchBots.every((b) => b.name.trim())
          : !!botName.trim();
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
    setBatchMode(false);
    setBatchBots([]);
    setDeployProgress(null);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // ── Submit ───────────────────────────────────────────────────

  const deployOne = async (name: string, capital: string, pairs: string[]) => {
    const payload: Record<string, any> = {
      name: name.trim(),
      exchange: selectedExchange?.exchange_key || "binance",
      trading_pairs: pairs,
      strategy_id: selectedStrategyId || undefined,
      credential_id: selectedCredentialId || undefined,
      allocated_capital: capital ? Number(capital) : undefined,
    };

    if (ownerType === "system") {
      return createSystemBot({ service_account_id: selectedSaId, ...payload });
    } else {
      return createBot({ user_id: selectedUserId, ...payload });
    }
  };

  const handleDeploy = async () => {
    setError(null);

    const items = batchMode
      ? batchBots.filter((b) => b.name.trim())
      : [{ name: botName, capital: allocatedCapital, pairs: selectedPairs }];

    if (items.length === 0) {
      setError("Add at least one bot to deploy");
      return;
    }

    setSubmitting(true);
    setDeployProgress({ total: items.length, done: 0, errors: [] });

    const errors: string[] = [];
    let lastBot: Bot | null = null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const result = await deployOne(item.name, item.capital, item.pairs);
        if (result.error) {
          errors.push(`${item.name}: ${result.error}`);
        } else if (result.data) {
          lastBot = mapApiBotToUiBot(result.data);
          onDeployed(lastBot);
        }
      } catch {
        errors.push(`${item.name}: Failed to deploy`);
      }
      setDeployProgress({ total: items.length, done: i + 1, errors: [...errors] });
    }

    setSubmitting(false);

    if (errors.length === 0) {
      handleClose();
    } else if (errors.length < items.length) {
      setError(`${items.length - errors.length} deployed, ${errors.length} failed:\n${errors.join("\n")}`);
    } else {
      setError(`All deploys failed:\n${errors.join("\n")}`);
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
                  ? "bg-[#FFD700]"
                  : i + 1 < step
                  ? "bg-[#FFD700]/40 cursor-pointer hover:bg-[#FFD700]/60"
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
              batchMode={batchMode}
              setBatchMode={setBatchMode}
              batchBots={batchBots}
              setBatchBots={setBatchBots}
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
                className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleDeploy}
                disabled={submitting || !canNext()}
                className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all disabled:opacity-50"
              >
                {submitting && deployProgress
                  ? `Deploying ${deployProgress.done}/${deployProgress.total}...`
                  : batchMode
                  ? `Deploy ${batchBots.length} Bot${batchBots.length !== 1 ? "s" : ""}`
                  : "Deploy Bot"}
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
                ? "border-[#FFD700] bg-[rgba(255,215,0,0.06)]"
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
                  ? "bg-[rgba(255,215,0,0.06)]"
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
                      ? "bg-[rgba(255,215,0,0.12)] text-[#FFD700]"
                      : "bg-[rgba(90,112,144,0.12)] text-[#5a7090]"
                  }`}
                >
                  {u.status}
                </span>
                {selectedId === u.id && (
                  <span className="text-[#FFD700] text-sm">&#10003;</span>
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
                  ? "border-[#FFD700] bg-[rgba(255,215,0,0.06)]"
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
                    ? "border-[#FFD700] bg-[rgba(255,215,0,0.08)] text-[#FFD700]"
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
            <span className="text-[#FFD700] ml-2">{selectedPairs.length} selected</span>
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
                      ? "bg-[rgba(255,215,0,0.06)] text-[#FFD700]"
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
    core_momentum: "text-[#FFD700] bg-[rgba(255,215,0,0.12)]",
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
                  ? "border-[#FFD700] bg-[rgba(255,215,0,0.06)]"
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
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-[rgba(255,215,0,0.12)] text-[#FFD700]">
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
  batchMode,
  setBatchMode,
  batchBots,
  setBatchBots,
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
  batchMode: boolean;
  setBatchMode: (v: boolean) => void;
  batchBots: { name: string; capital: string; pairs: string[] }[];
  setBatchBots: (v: { name: string; capital: string; pairs: string[] }[]) => void;
}) {
  const addBatchBot = () => {
    const idx = batchBots.length + 1;
    const stratLabel = strategy?.name?.split(" ")[0] || "Bot";
    const pairLabel = selectedPairs[0]?.replace(/[/:]/g, "") || "";
    setBatchBots([
      ...batchBots,
      { name: `${stratLabel} ${pairLabel} #${idx}`, capital: allocatedCapital || "", pairs: [...selectedPairs] },
    ]);
  };

  const removeBatchBot = (i: number) => {
    setBatchBots(batchBots.filter((_, j) => j !== i));
  };

  const updateBatchBot = (i: number, field: string, value: string | string[]) => {
    setBatchBots(batchBots.map((b, j) => (j === i ? { ...b, [field]: value } : b)));
  };

  const duplicateBatchBot = (i: number) => {
    const src = batchBots[i];
    setBatchBots([
      ...batchBots,
      { ...src, name: `${src.name} (copy)` },
    ]);
  };

  const quickBatchFromPairs = () => {
    const stratLabel = strategy?.name?.split(" ")[0] || "Bot";
    const bots = selectedPairs.map((pair, i) => ({
      name: `${stratLabel} ${pair.replace(/[/:]/g, "")} #${i + 1}`,
      capital: allocatedCapital || "",
      pairs: [pair],
    }));
    setBatchBots(bots);
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex items-center justify-between">
        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest">Deploy Mode</label>
        <div className="flex gap-1 bg-[#0d1520] rounded-sm p-0.5 border border-dark">
          <button
            onClick={() => setBatchMode(false)}
            className={`px-3 py-1 rounded-sm text-[10px] font-bold uppercase transition-all ${
              !batchMode ? "bg-[#FFD700] text-black" : "text-[#5a7090] hover:text-foreground"
            }`}
          >
            Single
          </button>
          <button
            onClick={() => {
              setBatchMode(true);
              if (batchBots.length === 0) addBatchBot();
            }}
            className={`px-3 py-1 rounded-sm text-[10px] font-bold uppercase transition-all ${
              batchMode ? "bg-[#FFD700] text-black" : "text-[#5a7090] hover:text-foreground"
            }`}
          >
            Batch
          </button>
        </div>
      </div>

      {!batchMode ? (
        <>
          {/* Single bot — Bot Name */}
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
        </>
      ) : (
        <>
          {/* Batch mode */}
          <div className="flex items-center gap-2">
            <button
              onClick={addBatchBot}
              className="px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase border border-dark hover:border-[#FFD700] text-[#8fa3b8] hover:text-[#FFD700] transition-all"
            >
              + Add Bot
            </button>
            {selectedPairs.length > 1 && (
              <button
                onClick={quickBatchFromPairs}
                className="px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase border border-dark hover:border-[#3d9df3] text-[#8fa3b8] hover:text-[#3d9df3] transition-all"
                title="Create one bot per selected trading pair"
              >
                1 Bot per Pair ({selectedPairs.length})
              </button>
            )}
            <span className="text-[10px] text-[#5a7090] ml-auto">{batchBots.length} bot{batchBots.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {batchBots.map((bot, i) => (
              <div key={i} className="border border-dark rounded-md p-3 space-y-2 bg-[rgba(255,255,255,0.01)]">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[#5a7090] font-bold w-4 shrink-0">#{i + 1}</span>
                  <input
                    value={bot.name}
                    onChange={(e) => updateBatchBot(i, "name", e.target.value)}
                    placeholder="Bot name"
                    className="flex-1 bg-dark-elevated border border-dark rounded-sm px-2 py-1.5 text-[11px] text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                  />
                  <input
                    value={bot.capital}
                    onChange={(e) => updateBatchBot(i, "capital", e.target.value)}
                    placeholder="Capital"
                    type="number"
                    min="0"
                    className="w-24 bg-dark-elevated border border-dark rounded-sm px-2 py-1.5 text-[11px] text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                  />
                  <button
                    onClick={() => duplicateBatchBot(i)}
                    title="Duplicate"
                    className="text-[#5a7090] hover:text-[#3d9df3] text-sm transition-colors"
                  >
                    &#x2398;
                  </button>
                  <button
                    onClick={() => removeBatchBot(i)}
                    title="Remove"
                    className="text-[#5a7090] hover:text-[#ff4757] text-sm transition-colors"
                  >
                    &times;
                  </button>
                </div>
                {/* Per-bot pair override */}
                <div className="flex flex-wrap gap-1">
                  {selectedPairs.map((pair) => (
                    <button
                      key={pair}
                      onClick={() => {
                        const has = bot.pairs.includes(pair);
                        const next = has ? bot.pairs.filter((p) => p !== pair) : [...bot.pairs, pair];
                        if (next.length > 0) updateBatchBot(i, "pairs", next);
                      }}
                      className={`px-1.5 py-0.5 rounded-sm text-[9px] font-mono border transition-all ${
                        bot.pairs.includes(pair)
                          ? "border-[#FFD700]/40 text-[#FFD700] bg-[rgba(255,215,0,0.06)]"
                          : "border-dark text-[#5a7090] hover:border-dark-2"
                      }`}
                    >
                      {pair.replace(/[/:]/g, "")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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
          {batchMode && (
            <SummaryRow
              label="Bots to Deploy"
              value={`${batchBots.length} bot${batchBots.length !== 1 ? "s" : ""} — Total capital: $${batchBots.reduce((s, b) => s + (Number(b.capital) || 0), 0).toLocaleString()}`}
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
