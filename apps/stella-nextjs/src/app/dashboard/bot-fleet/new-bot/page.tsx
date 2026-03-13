"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  deployBot,
  deploySystemBot,
  listServiceAccounts,
  listStrategies,
  listUserCredentials,
  listServiceAccountCredentials,
} from "@/lib/tradingEngineApi";
import { getUsers, getAdapterTradingPairs, getSettingsExchanges } from "@/lib/stellaAdminApi";

import { ArrowLeft, Search, Check, AlertCircle, Loader2 } from "lucide-react";
import { TokenIcon } from "@web3icons/react/dynamic";

// ── Types ────────────────────────────────────────────────────────

interface ServiceAccount {
  id: string;
  name: string;
  account_type: string;
  description: string | null;
  is_active: boolean;
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

interface TradingPairRow {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  isActive: boolean;
  marketType?: string;
}

interface CredentialRow {
  id: string;
  label: string;
  status: string;
  auth_model: string;
  adapter_id: string;
  is_sandbox: boolean;
  adapter_name?: string;
}

interface AdapterInfo {
  id: string;
  code: string;
  name: string;
  supportsSpot?: boolean;
  supports_spot?: boolean;
  supportsFutures?: boolean;
  supports_futures?: boolean;
  supportsMargin?: boolean;
  supports_margin?: boolean;
}

type MarketType = "spot" | "usds_futures" | "coinm_futures" | "margin";

// ── Constants ────────────────────────────────────────────────────

const STEPS = [
  { label: "Owner Type", short: "1" },
  { label: "Account", short: "2" },
  { label: "Credential", short: "3" },
  { label: "Trading Pairs", short: "4" },
  { label: "Strategy", short: "5" },
  { label: "Review & Deploy", short: "6" },
] as const;

const TOTAL_STEPS = STEPS.length;

const STRATEGY_TYPE_COLORS: Record<string, string> = {
  core_momentum: "text-[#FFD700] bg-[rgba(255,215,0,0.12)]",
  core_grid: "text-[#3d9df3] bg-[rgba(61,157,243,0.12)]",
  core_dca: "text-[#f5a623] bg-[rgba(245,166,35,0.12)]",
  core_mean_reversion: "text-[#a855f7] bg-[rgba(168,85,247,0.12)]",
  core_trend_following: "text-[#ec4899] bg-[rgba(236,72,153,0.12)]",
};

// ── Page Component ───────────────────────────────────────────────

export default function NewBotPage() {
  const router = useRouter();

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
  const [saLoading, setSaLoading] = useState(false);
  const [selectedSaId, setSelectedSaId] = useState("");

  // Step 3 — Credential + Market Type
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [marketType, setMarketType] = useState<MarketType>("spot");

  // Step 4 — Trading Pairs
  const [tradingPairs, setTradingPairs] = useState<TradingPairRow[]>([]);
  const [pairsLoading, setPairsLoading] = useState(false);
  const [selectedPair, setSelectedPair] = useState<string>("");
  const [pairSearch, setPairSearch] = useState("");

  // Step 5 — Strategy
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [selectedStrategyId, setSelectedStrategyId] = useState("");

  // Step 6 — Review / Deploy
  const [botName, setBotName] = useState("");
  const [allocatedCapital, setAllocatedCapital] = useState("");
  const [botCount, setBotCount] = useState(1);
  const [deployProgress, setDeployProgress] = useState<{ total: number; done: number; errors: string[] } | null>(null);

  // Grid bot config (only used when strategy is core_grid)
  const [gridUpperPrice, setGridUpperPrice] = useState("");
  const [gridLowerPrice, setGridLowerPrice] = useState("");
  const [gridLevels, setGridLevels] = useState("20");
  const [gridType, setGridType] = useState<"arithmetic" | "geometric">("geometric");
  const [gridStopLoss, setGridStopLoss] = useState("");
  const [gridTakeProfit, setGridTakeProfit] = useState("");
  const [gridFeeRate, setGridFeeRate] = useState("0.001");
  const [gridMaxOpenOrders, setGridMaxOpenOrders] = useState("20");
  const [gridRestartOnStopLoss, setGridRestartOnStopLoss] = useState(true);
  const [gridLeverage, setGridLeverage] = useState("1");

  // Shared state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derived values ─────────────────────────────────────────────

  const selectedCredential = credentials.find((c) => c.id === selectedCredentialId);
  const selectedStrategy = strategies.find((s) => s.id === selectedStrategyId);
  const selectedUser = users.find((u) => u.id === selectedUserId);
  const selectedSa = serviceAccounts.find((sa) => sa.id === selectedSaId);
  const isGridStrategy = selectedStrategy?.type === "core_grid";

  // Grid computed metrics
  const gridMetrics = useMemo(() => {
    const upper = Number(gridUpperPrice);
    const lower = Number(gridLowerPrice);
    const levels = Number(gridLevels) || 2;
    const feeRate = Number(gridFeeRate) || 0.001;
    const capital = Number(allocatedCapital) || 0;

    if (!upper || !lower || upper <= lower || levels < 2) return null;

    const spacingPct = gridType === "geometric"
      ? (Math.pow(upper / lower, 1 / levels) - 1) * 100
      : ((upper - lower) / levels / lower) * 100;

    const profitPerGridPct = spacingPct - feeRate * 2 * 100;
    const investmentPerGrid = capital > 0 ? capital / levels : 0;
    const rangePct = ((upper - lower) / lower) * 100;
    const minSpacingRequired = feeRate * 2 * 100 * 2; // 2x round-trip fees minimum

    return { spacingPct, profitPerGridPct, investmentPerGrid, rangePct, minSpacingRequired, isProfitable: profitPerGridPct > 0 };
  }, [gridUpperPrice, gridLowerPrice, gridLevels, gridType, gridFeeRate, allocatedCapital]);

  const selectedAdapterRaw = selectedCredential ? adapters.find((a) => a.id === selectedCredential.adapter_id) : undefined;
  const adapterFlags = selectedAdapterRaw ? {
    spot: selectedAdapterRaw.supportsSpot ?? selectedAdapterRaw.supports_spot ?? false,
    futures: selectedAdapterRaw.supportsFutures ?? selectedAdapterRaw.supports_futures ?? false,
    margin: selectedAdapterRaw.supportsMargin ?? selectedAdapterRaw.supports_margin ?? false,
  } : null;

  // ── Data loading ───────────────────────────────────────────────

  // Load adapters once
  useEffect(() => {
    getSettingsExchanges().then((res) => {
      if (res.data) {
        const list = Array.isArray(res.data) ? res.data : (res.data as any).items || [];
        setAdapters(list);
      }
    });
  }, []);

  // Load users (debounced search)
  useEffect(() => {
    if (ownerType !== "user") return;
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
  }, [ownerType, userSearch]);

  // Load service accounts
  useEffect(() => {
    if (ownerType !== "system") return;
    setSaLoading(true);
    listServiceAccounts().then((res) => {
      if (res.data && Array.isArray(res.data)) {
        setServiceAccounts(res.data);
      }
      setSaLoading(false);
    });
  }, [ownerType]);

  // Load credentials when owner is selected
  useEffect(() => {
    setCredentials([]);
    setSelectedCredentialId("");
    setMarketType("spot");
    setTradingPairs([]);
    setSelectedPair("");

    const ownerId = ownerType === "user" ? selectedUserId : selectedSaId;
    if (!ownerId) return;

    setCredentialsLoading(true);
    const fetcher =
      ownerType === "user"
        ? listUserCredentials(ownerId)
        : listServiceAccountCredentials(ownerId);

    fetcher.then((res) => {
      if (res.data && Array.isArray(res.data)) {
        setCredentials(res.data);
      }
      setCredentialsLoading(false);
    });
  }, [selectedUserId, selectedSaId, ownerType]);

  // Load trading pairs when credential is selected (by adapter_id)
  useEffect(() => {
    setTradingPairs([]);
    setSelectedPair("");
    if (!selectedCredential?.adapter_id) return;

    setPairsLoading(true);
    getAdapterTradingPairs(selectedCredential.adapter_id, { isActive: true }).then((res) => {
      if (res.data) {
        const list = Array.isArray(res.data) ? res.data : (res.data as any).pairs || [];
        setTradingPairs(list);
      }
      setPairsLoading(false);
    });
  }, [selectedCredentialId]);

  // Load strategies when entering step 5
  useEffect(() => {
    if (step < 5 || strategies.length > 0) return;
    setStrategiesLoading(true);
    listStrategies({ status: "active" }).then((res) => {
      if (res.data && Array.isArray(res.data)) {
        setStrategies(res.data);
      }
      setStrategiesLoading(false);
    });
  }, [step]);

  // ── Filtered values ────────────────────────────────────────────

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

  const filteredPairs = useMemo(() => {
    if (!pairSearch) return tradingPairs;
    const q = pairSearch.toLowerCase();
    return tradingPairs.filter(
      (p) =>
        p.symbol?.toLowerCase().includes(q) ||
        p.baseCurrency?.toLowerCase().includes(q) ||
        p.quoteCurrency?.toLowerCase().includes(q)
    );
  }, [tradingPairs, pairSearch]);

  // ── Navigation ─────────────────────────────────────────────────

  const canNext = () => {
    switch (step) {
      case 1:
        return true;
      case 2:
        return ownerType === "user" ? !!selectedUserId : !!selectedSaId;
      case 3:
        return !!selectedCredentialId && !!marketType;
      case 4:
        return !!selectedPair;
      case 5:
        return !!selectedStrategyId;
      case 6: {
        if (!botName.trim()) return false;
        if (botCount < 1 || botCount > 20) return false;
        if (isGridStrategy) {
          const upper = Number(gridUpperPrice);
          const lower = Number(gridLowerPrice);
          if (!upper || !lower || upper <= lower) return false;
        }
        return true;
      }
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

  // ── Submit ─────────────────────────────────────────────────────

  const handleDeploy = async () => {
    setError(null);
    if (!botName.trim()) {
      setError("Bot name is required");
      return;
    }

    if (isGridStrategy && gridMetrics && !gridMetrics.isProfitable) {
      setError(`Grid spacing (${gridMetrics.spacingPct.toFixed(3)}%) is too tight to cover fees. Reduce grid levels or widen the price range.`);
      return;
    }

    const total = Math.max(1, Math.min(20, botCount));
    setSubmitting(true);
    setDeployProgress({ total, done: 0, errors: [] });

    const errors: string[] = [];

    for (let i = 1; i <= total; i++) {
      const name = total === 1 ? botName.trim() : `${botName.trim()} #${i}`;

      const payload: Record<string, any> = {
        name,
        trading_pairs: [selectedPair],
        strategy_id: selectedStrategyId || undefined,
        credential_id: selectedCredentialId || undefined,
        allocated_capital: allocatedCapital ? Number(allocatedCapital) : undefined,
        market_type: marketType,
      };

      if (isGridStrategy) {
        payload.config = {
          upper_price: Number(gridUpperPrice),
          lower_price: Number(gridLowerPrice),
          grid_levels: Number(gridLevels) || 20,
          grid_type: gridType,
          total_investment: allocatedCapital ? Number(allocatedCapital) : 2000,
          quantity_per_grid: 0,
          max_open_orders: Number(gridMaxOpenOrders) || 20,
          fee_rate: Number(gridFeeRate) || 0.001,
          restart_on_stop_loss: gridRestartOnStopLoss,
          ...(gridStopLoss ? { stop_loss_price: Number(gridStopLoss) } : {}),
          ...(gridTakeProfit ? { take_profit_price: Number(gridTakeProfit) } : {}),
          ...(Number(gridLeverage) > 1 ? { leverage: Number(gridLeverage) } : {}),
        };
      }

      try {
        const result = ownerType === "system"
          ? await deploySystemBot({ service_account_id: selectedSaId, ...payload })
          : await deployBot({ user_id: selectedUserId, ...payload });

        if (result.error) {
          errors.push(`${name}: ${result.error}`);
        }
      } catch {
        errors.push(`${name}: Failed to deploy`);
      }

      setDeployProgress({ total, done: i, errors: [...errors] });
    }

    setSubmitting(false);

    if (errors.length === 0) {
      router.push("/dashboard/bot-fleet");
    } else if (errors.length < total) {
      setError(`${total - errors.length} deployed, ${errors.length} failed:\n${errors.join("\n")}`);
    } else {
      setError(`All deploys failed:\n${errors.join("\n")}`);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6 pb-8">
        {/* Breadcrumb + Back */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/bot-fleet")}
            className="text-[#5a7090] hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5a7090]">Dashboard</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#5a7090]">Bot Fleet</span>
            <span className="text-[#5a7090]">/</span>
            <span className="text-[#FFD700]">New Bot</span>
          </div>
        </div>

        {/* Page Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Deploy New Bot</h1>
          <p className="text-xs sm:text-sm text-[#8fa3b8]">
            Step {step} of {TOTAL_STEPS} — {STEPS[step - 1].label}
          </p>
        </div>

        {/* Step Progress Bar */}
        <div className="flex gap-1">
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

        {/* Step Content */}
        <div className="bg-card border border-dark rounded-lg p-5 sm:p-6">
          {/* Step 1 — Owner Type */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-[#8fa3b8]">
                Who will own this bot? User bots trade on behalf of a specific client.
                System bots are managed by admin service accounts.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["user", "system"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setOwnerType(type);
                      setSelectedUserId("");
                      setSelectedSaId("");
                      setCredentials([]);
                      setSelectedCredentialId("");
                      setTradingPairs([]);
                      setSelectedPair("");
                    }}
                    className={`p-5 rounded-md border text-left transition-all ${
                      ownerType === type
                        ? "border-[#FFD700] bg-[rgba(255,215,0,0.06)]"
                        : "border-dark hover:border-dark-2"
                    }`}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5">
                      {type === "user" ? "Client User" : "System / Service Account"}
                    </div>
                    <p className="text-[11px] text-[#5a7090] leading-relaxed">
                      {type === "user"
                        ? "Bot trades using a client's exchange credentials and capital."
                        : "Bot is owned by a service account for system trading, testing, or demo purposes."}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — User Picker */}
          {step === 2 && ownerType === "user" && (
            <div className="space-y-3">
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block">
                Search Users
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5a7090]" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name, email, or ID..."
                  className="w-full pl-9 pr-4 py-2 bg-dark-elevated border border-dark rounded-sm text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                  autoFocus
                />
              </div>
              <div className="border border-dark rounded-sm max-h-[400px] overflow-y-auto">
                {usersLoading && (
                  <div className="px-3 py-8 text-center text-[10px] text-[#5a7090] flex items-center justify-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading users...
                  </div>
                )}
                {!usersLoading && filteredUsers.length === 0 && (
                  <div className="px-3 py-8 text-center text-[10px] text-[#5a7090]">
                    {userSearch ? "No users found" : "Type to search users"}
                  </div>
                )}
                {!usersLoading &&
                  filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      className={`w-full px-3 py-2.5 flex items-center justify-between text-left border-b border-dark last:border-b-0 transition-all ${
                        selectedUserId === u.id
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
                        {selectedUserId === u.id && (
                          <Check className="h-3.5 w-3.5 text-[#FFD700]" />
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Step 2 — Service Account Picker */}
          {step === 2 && ownerType === "system" && (
            <div className="space-y-3">
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block">
                Select Service Account
              </label>
              {saLoading ? (
                <div className="text-xs text-[#5a7090] py-8 text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading service accounts...
                </div>
              ) : serviceAccounts.length === 0 ? (
                <div className="text-xs text-[#5a7090] py-8 text-center">
                  No service accounts found. Create one in Settings first.
                </div>
              ) : (
                <div className="space-y-2">
                  {serviceAccounts.map((sa) => (
                    <button
                      key={sa.id}
                      onClick={() => setSelectedSaId(sa.id)}
                      className={`w-full p-4 rounded-md border text-left transition-all ${
                        selectedSaId === sa.id
                          ? "border-[#FFD700] bg-[rgba(255,215,0,0.06)]"
                          : "border-dark hover:border-dark-2"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-foreground">{sa.name}</div>
                          <div className="text-[10px] text-[#5a7090] mt-0.5">
                            Type: {sa.account_type} &middot; {sa.id.slice(0, 8)}...
                          </div>
                          {sa.description && (
                            <p className="text-[10px] text-[#5a7090] mt-1 line-clamp-1">
                              {sa.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                              sa.is_active
                                ? "bg-[rgba(255,215,0,0.12)] text-[#FFD700]"
                                : "bg-[rgba(90,112,144,0.12)] text-[#5a7090]"
                            }`}
                          >
                            {sa.is_active ? "active" : "inactive"}
                          </span>
                          {selectedSaId === sa.id && (
                            <Check className="h-3.5 w-3.5 text-[#FFD700]" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Credential Selection */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-[#8fa3b8]">
                Select an exchange credential. Trading pairs will be loaded based on the credential's adapter.
              </p>
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block">
                Available Credentials
              </label>
              {credentialsLoading ? (
                <div className="text-xs text-[#5a7090] py-8 text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading credentials...
                </div>
              ) : credentials.length === 0 ? (
                <div className="border border-dark rounded-md p-6 text-center">
                  <AlertCircle className="h-5 w-5 text-[#5a7090] mx-auto mb-2" />
                  <div className="text-xs text-[#5a7090] mb-2">
                    No credentials found for this {ownerType === "user" ? "user" : "service account"}.
                  </div>
                  <button
                    onClick={() => router.push("/settings/service-accounts")}
                    className="text-[10px] text-[#FFD700] hover:underline"
                  >
                    Go to Settings to create one
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {credentials.map((cred) => (
                    <button
                      key={cred.id}
                      onClick={() => { setSelectedCredentialId(cred.id); setMarketType("spot"); }}
                      className={`w-full p-4 rounded-md border text-left transition-all ${
                        selectedCredentialId === cred.id
                          ? "border-[#FFD700] bg-[rgba(255,215,0,0.06)]"
                          : "border-dark hover:border-dark-2"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-foreground">
                            {cred.label || `Credential ${cred.id.slice(0, 8)}`}
                          </div>
                          <div className="text-[10px] text-[#5a7090] mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="font-mono">{cred.auth_model}</span>
                            <span>&middot;</span>
                            <span className="font-mono">{cred.adapter_id.slice(0, 8)}...</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {cred.is_sandbox && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-[rgba(245,166,35,0.12)] text-[#f5a623]">
                              sandbox
                            </span>
                          )}
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                              cred.status === "active"
                                ? "bg-[rgba(255,215,0,0.12)] text-[#FFD700]"
                                : cred.status === "inactive"
                                ? "bg-[rgba(90,112,144,0.12)] text-[#5a7090]"
                                : "bg-[rgba(255,71,87,0.12)] text-[#ff4757]"
                            }`}
                          >
                            {cred.status}
                          </span>
                          {selectedCredentialId === cred.id && (
                            <Check className="h-3.5 w-3.5 text-[#FFD700]" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Market Type selector — shown after credential is selected */}
              {selectedCredentialId && adapterFlags && (
                <div className="mt-4">
                  <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-2">
                    Market Type
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {adapterFlags.spot && (
                      <button
                        onClick={() => setMarketType("spot")}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
                          marketType === "spot"
                            ? "border-[#FFD700] bg-[rgba(255,215,0,0.1)] text-[#FFD700]"
                            : "border-dark text-[#5a7090] hover:border-dark-2"
                        }`}
                      >
                        Spot
                      </button>
                    )}
                    {adapterFlags.futures && (
                      <button
                        onClick={() => setMarketType("usds_futures")}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
                          marketType === "usds_futures"
                            ? "border-[#FFD700] bg-[rgba(255,215,0,0.1)] text-[#FFD700]"
                            : "border-dark text-[#5a7090] hover:border-dark-2"
                        }`}
                      >
                        USDS-M Futures
                      </button>
                    )}
                    {adapterFlags.futures && (
                      <button
                        onClick={() => setMarketType("coinm_futures")}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
                          marketType === "coinm_futures"
                            ? "border-[#FFD700] bg-[rgba(255,215,0,0.1)] text-[#FFD700]"
                            : "border-dark text-[#5a7090] hover:border-dark-2"
                        }`}
                      >
                        COIN-M Futures
                      </button>
                    )}
                    {adapterFlags.margin && (
                      <button
                        onClick={() => setMarketType("margin")}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
                          marketType === "margin"
                            ? "border-[#FFD700] bg-[rgba(255,215,0,0.1)] text-[#FFD700]"
                            : "border-dark text-[#5a7090] hover:border-dark-2"
                        }`}
                      >
                        Margin
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-[#5a7090] mt-1.5">
                    Same API key works across all market types — select which endpoint to trade on.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4 — Trading Pair */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-xs text-[#8fa3b8]">
                Select the trading pair for this bot.
              </p>
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block">
                Trading Pair
              </label>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5a7090]" />
                <input
                  value={pairSearch}
                  onChange={(e) => setPairSearch(e.target.value)}
                  placeholder="Search pairs..."
                  className="w-full pl-9 pr-4 py-2 bg-dark-elevated border border-dark rounded-sm text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                  autoFocus
                />
              </div>

              {pairsLoading ? (
                <div className="text-xs text-[#5a7090] py-8 text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading trading pairs...
                </div>
              ) : filteredPairs.length === 0 ? (
                <div className="text-xs text-[#5a7090] py-8 text-center">
                  {pairSearch ? "No pairs match your search" : "No trading pairs available for this adapter"}
                </div>
              ) : (
                <div className="border border-dark rounded-sm divide-y divide-[#1e2d40] overflow-y-auto" style={{ maxHeight: "min(420px, 55vh)" }}>
                  {filteredPairs.map((tp) => (
                    <button
                      key={tp.id}
                      onClick={() => {
                        setSelectedPair(tp.symbol);
                        // Auto-infer market type from the pair's tag
                        if (tp.marketType) {
                          const mt = tp.marketType.toLowerCase();
                          if (mt.includes("future") || mt === "usds_futures" || mt === "linear") {
                            setMarketType("usds_futures");
                          } else if (mt === "coinm_futures" || mt === "inverse") {
                            setMarketType("coinm_futures");
                          } else if (mt === "margin") {
                            setMarketType("margin");
                          } else if (mt === "spot") {
                            setMarketType("spot");
                          }
                        }
                      }}
                      className={`w-full px-3 py-2.5 flex items-center justify-between transition-all ${
                        selectedPair === tp.symbol
                          ? "bg-[rgba(255,215,0,0.06)]"
                          : "hover:bg-dark-elevated"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex items-center -space-x-1.5 flex-shrink-0">
                          <CryptoIcon symbol={tp.baseCurrency} size={22} />
                          <CryptoIcon symbol={tp.quoteCurrency} size={18} />
                        </span>
                        <div className="text-left">
                          <div className="text-xs text-foreground font-medium">
                            <span className="font-bold">{tp.baseCurrency}</span>
                            <span className="text-[#5a7090]"> / {tp.quoteCurrency}</span>
                          </div>
                          <div className="text-[10px] text-[#5a7090] font-mono mt-0.5">
                            {tp.symbol}
                            {tp.marketType && (
                              <span className="ml-1.5 text-[8px] uppercase px-1 py-0 rounded-sm bg-[rgba(90,112,144,0.08)]">
                                {tp.marketType}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {selectedPair === tp.symbol && (
                        <Check className="h-4 w-4 text-[#FFD700] flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 5 — Strategy Selection */}
          {step === 5 && (
            <div className="space-y-3">
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block">
                Select Strategy
              </label>
              {strategiesLoading ? (
                <div className="text-xs text-[#5a7090] py-8 text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading strategies...
                </div>
              ) : strategies.length === 0 ? (
                <div className="text-xs text-[#5a7090] py-8 text-center">
                  No active strategies found.
                </div>
              ) : (
                <div className="space-y-2">
                  {strategies.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStrategyId(s.id)}
                      className={`w-full p-4 rounded-md border text-left transition-all ${
                        selectedStrategyId === s.id
                          ? "border-[#FFD700] bg-[rgba(255,215,0,0.06)]"
                          : "border-dark hover:border-dark-2"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs font-bold text-foreground">{s.name}</div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                              STRATEGY_TYPE_COLORS[s.type] || "text-[#5a7090] bg-[rgba(90,112,144,0.12)]"
                            }`}
                          >
                            {s.type.replace("core_", "")}
                          </span>
                          {s.is_live_enabled && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-[rgba(255,215,0,0.12)] text-[#FFD700]">
                              LIVE
                            </span>
                          )}
                          {selectedStrategyId === s.id && (
                            <Check className="h-3.5 w-3.5 text-[#FFD700]" />
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
          )}

          {/* Step 6 — Review & Deploy */}
          {step === 6 && (
            <div className="space-y-4">
              {/* Bot Name */}
              <div>
                <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
                  Bot Name <span className="text-[#ff4757]">*</span>
                </label>
                <input
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  placeholder="e.g. BTC Scalper Alpha"
                  className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                  autoFocus
                />
              </div>

              {/* Number of Bots */}
              <div>
                <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
                  Number of Bots
                </label>
                <input
                  value={botCount}
                  onChange={(e) => setBotCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  type="number"
                  min={1}
                  max={20}
                  className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                />
                <p className="text-[9px] text-[#5a7090] mt-1">
                  {botCount > 1
                    ? `Names will be suffixed #1, #2, ... #${botCount}`
                    : "Deploy a single bot with this configuration"}
                </p>
                {botCount > 1 && (
                  <div className="mt-2 bg-dark-elevated border border-dark rounded-sm px-3 py-2 space-y-0.5 max-h-[120px] overflow-y-auto">
                    {Array.from({ length: botCount }, (_, i) => (
                      <div key={i} className="text-[10px] text-[#8fa3b8] font-mono">
                        {botName.trim() || "Bot"} #{i + 1}
                      </div>
                    ))}
                  </div>
                )}
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

              {/* Grid Bot Config */}
              {isGridStrategy && (
                <div className="border border-[rgba(61,157,243,0.25)] rounded-md overflow-hidden">
                  <div className="px-3 py-2 bg-[rgba(61,157,243,0.06)] border-b border-[rgba(61,157,243,0.15)]">
                    <span className="text-[9px] text-[#3d9df3] uppercase tracking-widest font-bold">
                      Grid Configuration
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">
                          Lower Price <span className="text-[#ff4757]">*</span>
                        </label>
                        <input
                          value={gridLowerPrice}
                          onChange={(e) => setGridLowerPrice(e.target.value)}
                          placeholder="90000"
                          type="number"
                          min="0"
                          step="any"
                          className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">
                          Upper Price <span className="text-[#ff4757]">*</span>
                        </label>
                        <input
                          value={gridUpperPrice}
                          onChange={(e) => setGridUpperPrice(e.target.value)}
                          placeholder="110000"
                          type="number"
                          min="0"
                          step="any"
                          className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                        />
                      </div>
                    </div>
                    {gridMetrics && (
                      <p className="text-[10px] text-[#5a7090]">
                        Range: ${Number(gridLowerPrice).toLocaleString()} — ${Number(gridUpperPrice).toLocaleString()}
                        {" "}({gridMetrics.rangePct.toFixed(1)}% spread)
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">
                          Grid Levels
                        </label>
                        <input
                          value={gridLevels}
                          onChange={(e) => setGridLevels(e.target.value)}
                          placeholder="20"
                          type="number"
                          min="2"
                          max="500"
                          className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">
                          Grid Type
                        </label>
                        <div className="flex gap-2">
                          {(["arithmetic", "geometric"] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setGridType(t)}
                              className={`flex-1 px-2 py-2 rounded-sm text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                gridType === t
                                  ? "border-[#3d9df3] bg-[rgba(61,157,243,0.1)] text-[#3d9df3]"
                                  : "border-dark text-[#5a7090] hover:border-dark-2"
                              }`}
                            >
                              {t === "arithmetic" ? "Arithmetic (equal $)" : "Geometric (equal %)"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Computed metrics panel */}
                    {gridMetrics && (
                      <div className="bg-dark-elevated border border-dark rounded-sm px-3 py-2.5 space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-[#5a7090]">Grid spacing</span>
                          <span className="text-foreground font-mono">{gridMetrics.spacingPct.toFixed(3)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-[#5a7090]">Net profit per grid (after fees)</span>
                          <span className={`font-mono ${gridMetrics.isProfitable ? "text-[#00d4aa]" : "text-[#ff4757]"}`}>
                            {gridMetrics.profitPerGridPct.toFixed(3)}%
                          </span>
                        </div>
                        {gridMetrics.investmentPerGrid > 0 && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-[#5a7090]">Investment per grid</span>
                            <span className="text-foreground font-mono">${gridMetrics.investmentPerGrid.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fee warning */}
                    {gridMetrics && !gridMetrics.isProfitable && (
                      <div className="text-[10px] text-[#ff4757] bg-[rgba(255,71,87,0.06)] border border-[rgba(255,71,87,0.15)] rounded-sm px-2.5 py-1.5">
                        Grid spacing ({gridMetrics.spacingPct.toFixed(3)}%) is less than 2x round-trip fees ({(Number(gridFeeRate) * 2 * 100).toFixed(2)}%). Every trade will lose money. Reduce grid levels or widen the price range.
                      </div>
                    )}

                    {/* Execution settings */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">
                          Fee Rate (per side)
                        </label>
                        <input
                          value={gridFeeRate}
                          onChange={(e) => setGridFeeRate(e.target.value)}
                          placeholder="0.001"
                          type="number"
                          min="0"
                          max="0.01"
                          step="0.0001"
                          className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                        />
                        <p className="text-[9px] text-[#5a7090] mt-0.5">0.001 = 0.1% (Binance spot maker)</p>
                      </div>
                      <div>
                        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">
                          Max Open Orders
                        </label>
                        <input
                          value={gridMaxOpenOrders}
                          onChange={(e) => setGridMaxOpenOrders(e.target.value)}
                          placeholder="20"
                          type="number"
                          min="1"
                          max="200"
                          className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                        />
                      </div>
                    </div>

                    {/* Leverage (futures only) */}
                    {(marketType === "usds_futures" || marketType === "coinm_futures") && (
                      <div>
                        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">
                          Leverage
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            value={gridLeverage}
                            onChange={(e) => setGridLeverage(e.target.value)}
                            min="1"
                            max="125"
                            step="1"
                            className="flex-1 accent-[#3d9df3]"
                          />
                          <input
                            value={gridLeverage}
                            onChange={(e) => setGridLeverage(String(Math.max(1, Math.min(125, parseInt(e.target.value) || 1))))}
                            type="number"
                            min="1"
                            max="125"
                            className="w-16 bg-dark-elevated border border-dark rounded-sm px-2 py-2 text-xs text-foreground font-mono text-center focus:outline-none focus:border-dark-2"
                          />
                          <span className="text-xs text-foreground font-mono">x</span>
                        </div>
                        {Number(gridLeverage) > 10 && (
                          <p className="text-[9px] text-[#ffaa00] mt-1">
                            High leverage increases liquidation risk. Platform max is enforced server-side.
                          </p>
                        )}
                        {Number(gridLeverage) > 1 && allocatedCapital && (
                          <p className="text-[9px] text-[#5a7090] mt-0.5">
                            Effective capital: <span className="text-foreground font-mono">${(Number(allocatedCapital) * Number(gridLeverage)).toLocaleString()}</span>
                            {" "}({gridLeverage}x of ${Number(allocatedCapital).toLocaleString()})
                          </p>
                        )}
                      </div>
                    )}

                    {/* Risk management */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">
                          Stop Loss Price
                        </label>
                        <input
                          value={gridStopLoss}
                          onChange={(e) => setGridStopLoss(e.target.value)}
                          placeholder="Optional — below grid floor"
                          type="number"
                          min="0"
                          step="any"
                          className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                        />
                        {gridLowerPrice && gridStopLoss && Number(gridStopLoss) > 0 && (
                          <p className="text-[9px] text-[#5a7090] mt-0.5">
                            {((1 - Number(gridStopLoss) / Number(gridLowerPrice)) * 100).toFixed(1)}% below grid floor
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">
                          Take Profit Price
                        </label>
                        <input
                          value={gridTakeProfit}
                          onChange={(e) => setGridTakeProfit(e.target.value)}
                          placeholder="Optional — above grid ceiling"
                          type="number"
                          min="0"
                          step="any"
                          className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
                        />
                      </div>
                    </div>

                    {/* Restart on stop-loss toggle */}
                    <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={gridRestartOnStopLoss}
                        onChange={(e) => setGridRestartOnStopLoss(e.target.checked)}
                        className="accent-[#3d9df3]"
                      />
                      <div>
                        <span className="text-[10px] text-foreground font-medium">Restart grid after stop-loss</span>
                        <p className="text-[9px] text-[#5a7090] mt-0.5">
                          When stop-loss triggers, redeploy the grid centered around the new price instead of stopping
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="border border-dark rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-dark-elevated border-b border-dark">
                  <span className="text-[9px] text-[#5a7090] uppercase tracking-widest font-bold">
                    Configuration Summary
                  </span>
                </div>
                <div className="divide-y divide-[#1e2d40]">
                  <SummaryRow
                    label="Owner Type"
                    value={ownerType === "user" ? "Client User" : "Service Account"}
                  />
                  <SummaryRow
                    label="Owner"
                    value={
                      ownerType === "user"
                        ? selectedUser
                          ? `${selectedUser.username || selectedUser.email} (${selectedUser.id.slice(0, 8)}...)`
                          : "—"
                        : selectedSa
                        ? `${selectedSa.name} (${selectedSa.account_type})`
                        : "—"
                    }
                  />
                  <SummaryRow
                    label="Credential"
                    value={
                      selectedCredential
                        ? `${selectedCredential.label || selectedCredential.id.slice(0, 8)} ${selectedCredential.is_sandbox ? "[sandbox]" : ""}`
                        : "—"
                    }
                  />
                  <SummaryRow
                    label="Market Type"
                    value={
                      marketType === "usds_futures" ? "USDS-M Futures" :
                      marketType === "coinm_futures" ? "COIN-M Futures" :
                      marketType === "margin" ? "Margin" : "Spot"
                    }
                  />
                  <SummaryRow
                    label="Trading Pair"
                    value={selectedPair || "—"}
                  />
                  <SummaryRow
                    label="Strategy"
                    value={
                      selectedStrategy
                        ? `${selectedStrategy.name} (${selectedStrategy.type.replace("core_", "")})`
                        : "—"
                    }
                  />
                  {botCount > 1 && (
                    <SummaryRow label="Number of Bots" value={String(botCount)} />
                  )}
                  {allocatedCapital && (
                    <SummaryRow
                      label={botCount > 1 ? "Capital (per bot)" : "Capital"}
                      value={`$${Number(allocatedCapital).toLocaleString()}`}
                    />
                  )}
                  {allocatedCapital && botCount > 1 && (
                    <SummaryRow
                      label="Total Capital"
                      value={`$${(Number(allocatedCapital) * botCount).toLocaleString()}`}
                    />
                  )}
                  {isGridStrategy && gridUpperPrice && gridLowerPrice && (
                    <>
                      <SummaryRow
                        label="Grid Range"
                        value={`$${Number(gridLowerPrice).toLocaleString()} — $${Number(gridUpperPrice).toLocaleString()}`}
                      />
                      <SummaryRow label="Grid Levels" value={`${gridLevels} (${gridType})`} />
                      <SummaryRow label="Fee Rate" value={`${(Number(gridFeeRate) * 100).toFixed(2)}% per side`} />
                      {gridMetrics && (
                        <SummaryRow
                          label="Net Profit/Grid"
                          value={`${gridMetrics.profitPerGridPct.toFixed(3)}%`}
                        />
                      )}
                      <SummaryRow label="Max Open Orders" value={gridMaxOpenOrders} />
                      {gridStopLoss && (
                        <SummaryRow label="Stop Loss" value={`$${Number(gridStopLoss).toLocaleString()}`} />
                      )}
                      {gridTakeProfit && (
                        <SummaryRow label="Take Profit" value={`$${Number(gridTakeProfit).toLocaleString()}`} />
                      )}
                      <SummaryRow label="Restart on SL" value={gridRestartOnStopLoss ? "Yes" : "No"} />
                      {Number(gridLeverage) > 1 && (
                        <SummaryRow label="Leverage" value={`${gridLeverage}x`} />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Deploy Progress */}
          {submitting && deployProgress && deployProgress.total > 1 && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#8fa3b8]">Deploying bots...</span>
                <span className="text-foreground font-mono">{deployProgress.done}/{deployProgress.total}</span>
              </div>
              <div className="w-full h-1.5 bg-[#1e2d40] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FFD700] rounded-full transition-all duration-300"
                  style={{ width: `${(deployProgress.done / deployProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Deploy Results (partial failure) */}
          {!submitting && deployProgress && deployProgress.total > 1 && deployProgress.errors.length > 0 && deployProgress.errors.length < deployProgress.total && (
            <div className="mt-4 space-y-1.5">
              {Array.from({ length: deployProgress.total }, (_, i) => {
                const name = `${botName.trim()} #${i + 1}`;
                const failed = deployProgress.errors.find((e) => e.startsWith(name));
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    {failed ? (
                      <AlertCircle className="h-3 w-3 text-[#ff4757] shrink-0" />
                    ) : (
                      <Check className="h-3 w-3 text-[#00d4aa] shrink-0" />
                    )}
                    <span className={failed ? "text-[#ff4757]" : "text-[#00d4aa]"}>{name}</span>
                    {failed && <span className="text-[#5a7090]">— {failed.split(": ").slice(1).join(": ")}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2 flex items-start gap-2 whitespace-pre-line">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex gap-2.5 justify-between">
          <button
            onClick={step === 1 ? () => router.push("/dashboard/bot-fleet") : handleBack}
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
                className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                {submitting
                  ? deployProgress && deployProgress.total > 1
                    ? `Deploying ${deployProgress.done}/${deployProgress.total}...`
                    : "Deploying..."
                  : botCount > 1
                  ? `Deploy ${botCount} Bots`
                  : "Deploy Bot"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 flex justify-between items-center">
      <span className="text-[10px] text-[#5a7090] uppercase tracking-wider">{label}</span>
      <span className="text-[11px] text-foreground font-mono text-right max-w-[60%] truncate">
        {value}
      </span>
    </div>
  );
}

function CryptoIcon({ symbol, size = 16 }: { symbol: string; size?: number }) {
  if (!symbol) return null;
  const fallback = (
    <span
      className="inline-flex items-center justify-center rounded-full bg-[#1e2d40] font-mono font-bold text-[#8fa3b8]"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {symbol.slice(0, 2)}
    </span>
  );
  return (
    <TokenIcon
      symbol={symbol.toUpperCase()}
      size={size}
      variant="branded"
      fallback={fallback}
    />
  );
}
