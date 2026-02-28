"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  getSettingsExchange,
  updateSettingsExchange,
  testExchangeConnection,
  getAdapterTradingPairs,
  getAdapterPairStats,
  syncAdapterPairs,
  toggleTradingPair,
  bulkToggleTradingPairs,
} from "@/lib/stellaAdminApi";
import { TokenIcon } from "@web3icons/react/dynamic";

// ── Types ────────────────────────────────────────────────────────

interface ExecutionCapabilities {
  orderTypes?: string[];
  timeInForce?: string[];
  marginModes?: string[];
  positionModes?: string[];
  supportsOco?: boolean;
  nativeStopLoss?: boolean;
  nativeTakeProfit?: boolean;
  trailingStop?: boolean;
  bracketOrders?: boolean;
  paperTrading?: boolean;
  maxGlobalLeverage?: number;
}

interface Adapter {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive" | "maintenance" | "deprecated";
  authModel: string;
  baseUrl: string | null;
  wsUrl: string | null;
  sandboxBaseUrl: string | null;
  sandboxWsUrl: string | null;
  supportsSpot: boolean;
  supportsMargin: boolean;
  supportsFutures: boolean;
  supportsOptions: boolean;
  supportsStaking: boolean;
  executionCapabilities: ExecutionCapabilities | null;
  feeSchedule: Record<string, any> | null;
  rateLimitOrders: number;
  rateLimitQueries: number;
  rateLimitWs: number;
  minOrderSizeUsd: number | null;
  maxOrderSizeUsd: number | null;
  maintenanceMessage: string | null;
  config: Record<string, any> | null;
  requiresPlatformAuth: boolean;
  platformApiKey: string | null;
  platformApiSecret: string | null;
  platformApiPassword: string | null;
  sandboxApiKey: string | null;
  sandboxApiSecret: string | null;
  sandboxApiPassword: string | null;
  allowAllPairs: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncPairCount: number | null;
  pairStats: PairStats;
  createdAt: string;
  updatedAt: string;
}

interface TradingPair {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  isActive: boolean;
  delisted: boolean;
  lastSeenAt: string | null;
  exchangeStatus: string | null;
  marketType: string | null;
  minAmount: number | null;
  minCost: number | null;
  pricePrecision: number | null;
  amountPrecision: number | null;
}

interface PairStats {
  total: number;
  active: number;
  inactive: number;
  delisted: number;
}

type TabKey = "overview" | "connectivity" | "credentials" | "trading-pairs";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "connectivity", label: "Connectivity" },
  { key: "credentials", label: "API Credentials" },
  { key: "trading-pairs", label: "Trading Pairs" },
];

// ── Page ─────────────────────────────────────────────────────────

export default function ExchangeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [adapter, setAdapter] = useState<Adapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; latencyMs: number } | null>(null);

  // Trading pairs state
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [pairStats, setPairStats] = useState<PairStats>({ total: 0, active: 0, inactive: 0, delisted: 0 });
  const [pairsLoading, setPairsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pairSearch, setPairSearch] = useState("");
  const [pairMarketFilter, setPairMarketFilter] = useState("all");
  const [pairShowCount, setPairShowCount] = useState(50);
  const [capExpanded, setCapExpanded] = useState(false);
  const [syncMode, setSyncMode] = useState<"auto" | "live" | "sandbox">("auto");

  const fetchAdapter = useCallback(async () => {
    setLoading(true);
    const res = await getSettingsExchange(id);
    if (res.data) {
      const a = res.data as Adapter;
      setAdapter(a);
      setEditFields({
        status: a.status,
        maintenanceMessage: a.maintenanceMessage || "",
        baseUrl: a.baseUrl || "",
        wsUrl: a.wsUrl || "",
        sandboxBaseUrl: a.sandboxBaseUrl || "",
        sandboxWsUrl: a.sandboxWsUrl || "",
        authModel: a.authModel || "api_key",
        rateLimitOrders: a.rateLimitOrders,
        rateLimitQueries: a.rateLimitQueries,
        rateLimitWs: a.rateLimitWs,
        minOrderSizeUsd: a.minOrderSizeUsd ?? "",
        maxOrderSizeUsd: a.maxOrderSizeUsd ?? "",
        supportsSpot: a.supportsSpot,
        supportsMargin: a.supportsMargin,
        supportsFutures: a.supportsFutures,
        supportsOptions: a.supportsOptions,
        supportsStaking: a.supportsStaking,
        requiresPlatformAuth: a.requiresPlatformAuth ?? false,
        platformApiKey: "",
        platformApiSecret: "",
        platformApiPassword: "",
        sandboxApiKey: "",
        sandboxApiSecret: "",
        sandboxApiPassword: "",
        allowAllPairs: a.allowAllPairs ?? false,
      });
      setPairStats(a.pairStats || { total: 0, active: 0, inactive: 0, delisted: 0 });
      setError(null);
    } else {
      setError(res.error || "Failed to load adapter");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAdapter(); }, [fetchAdapter]);

  const fetchPairs = useCallback(async (search?: string, marketType?: string) => {
    setPairsLoading(true);
    const filters: any = { delisted: false };
    if (search) filters.search = search;
    if (marketType && marketType !== "all") filters.marketType = marketType;
    const [pairsRes, statsRes] = await Promise.all([
      getAdapterTradingPairs(id, filters),
      getAdapterPairStats(id),
    ]);
    if (pairsRes.data) setPairs(pairsRes.data as TradingPair[]);
    if (statsRes.data) setPairStats(statsRes.data as PairStats);
    setPairShowCount(50);
    setPairsLoading(false);
  }, [id]);

  // Lazy-load trading pairs on first tab switch
  const [pairsLoaded, setPairsLoaded] = useState(false);
  useEffect(() => {
    if (activeTab === "trading-pairs" && !pairsLoaded) {
      setPairsLoaded(true);
      fetchPairs();
    }
  }, [activeTab, pairsLoaded, fetchPairs]);

  const setField = (key: string, value: any) => setEditFields((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    const payload: Record<string, any> = { ...editFields };
    if (payload.baseUrl === "") payload.baseUrl = null;
    if (payload.wsUrl === "") payload.wsUrl = null;
    if (payload.sandboxBaseUrl === "") payload.sandboxBaseUrl = null;
    if (payload.sandboxWsUrl === "") payload.sandboxWsUrl = null;
    if (payload.minOrderSizeUsd === "") payload.minOrderSizeUsd = null;
    if (payload.maxOrderSizeUsd === "") payload.maxOrderSizeUsd = null;
    if (payload.status !== "maintenance") delete payload.maintenanceMessage;
    // Only send credential fields if the user entered a new value
    if (!payload.platformApiKey) delete payload.platformApiKey;
    if (!payload.platformApiSecret) delete payload.platformApiSecret;
    if (!payload.platformApiPassword) delete payload.platformApiPassword;
    if (!payload.sandboxApiKey) delete payload.sandboxApiKey;
    if (!payload.sandboxApiSecret) delete payload.sandboxApiSecret;
    if (!payload.sandboxApiPassword) delete payload.sandboxApiPassword;
    const res = await updateSettingsExchange(id, payload);
    if (res.error) {
      setError(res.error);
    } else {
      await fetchAdapter();
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testExchangeConnection(id);
    if (res.data) {
      const d = res.data as any;
      setTestResult({ status: d.status, latencyMs: d.responseTimeMs || d.latencyMs || d.latency_ms });
    }
    setTesting(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    const mode = syncMode === "auto" ? undefined : syncMode;
    const res = await syncAdapterPairs(id, mode);
    if (res.error) {
      setError(res.error);
    } else {
      await fetchPairs(pairSearch, pairMarketFilter);
      await fetchAdapter();
    }
    setSyncing(false);
  };

  const handleTogglePair = async (pairId: string, isActive: boolean) => {
    const res = await toggleTradingPair(pairId, { isActive });
    if (res.data) {
      setPairs((p) => p.map((pair) => pair.id === pairId ? { ...pair, isActive } : pair));
      const statsRes = await getAdapterPairStats(id);
      if (statsRes.data) setPairStats(statsRes.data as PairStats);
    }
  };

  const handleBulkToggle = async (isActive: boolean) => {
    const pairIds = pairs.map((p) => p.id);
    if (pairIds.length === 0) return;
    const res = await bulkToggleTradingPairs(id, { pairIds, isActive });
    if (!res.error) {
      await fetchPairs(pairSearch, pairMarketFilter);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-[1100px]">
        <div className="text-center py-16 font-mono text-[10px] text-[#5a7090]">Loading adapter...</div>
      </div>
    );
  }

  if (!adapter) {
    return (
      <div className="p-4 md:p-6 max-w-[1100px]">
        <div className="text-center py-16 font-mono text-[11px] text-[#ff4757]">
          {error || "Adapter not found"}
        </div>
        <div className="text-center">
          <Link href="/settings/exchanges" className="font-mono text-[10px] text-[#3d9df3] hover:underline">
            &larr; Back to Exchanges
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Breadcrumb */}
      <div className="font-mono text-[10px] text-[#5a7090] flex items-center gap-1.5">
        <Link href="/settings/exchanges" className="hover:text-[#e8edf3] transition-colors">Exchanges</Link>
        <span>/</span>
        <span className="text-[#e8edf3]">{adapter.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0 overflow-hidden relative" style={{ background: `${statusColor(adapter.status)}18` }}>
            <Image
              src={`/exchanges/${adapter.code}.png`}
              alt={`${adapter.name} logo`}
              width={36}
              height={36}
              className="object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                const parent = target.parentElement;
                if (parent) parent.innerHTML = `<span class="font-mono text-[12px] font-bold" style="color: ${statusColor(adapter.status)}">${adapter.code.slice(0, 2).toUpperCase()}</span>`;
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[14px] font-semibold text-[#e8edf3]">{adapter.name}</span>
              <span className="font-mono text-[10px] text-[#5a7090]">{adapter.code}</span>
              <StatusBadge status={adapter.status} />
            </div>
            <div className="font-mono text-[9px] text-[#5a7090] mt-0.5">
              ID: {adapter.id}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all disabled:opacity-50"
          >
            {testing ? "Testing..." : testResult ? `${testResult.status} ${testResult.latencyMs}ms` : "Test Connection"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded px-3 py-2">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-[#5a7090] hover:text-[#e8edf3]">&times;</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[#1e2d40]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px ${
              activeTab === tab.key
                ? "text-[#00e5a0] border-b-[#00e5a0]"
                : "text-[#5a7090] border-b-transparent hover:text-[#8fa3b8]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "overview" && (
          <OverviewTab
            adapter={adapter}
            editFields={editFields}
            setField={setField}
            capExpanded={capExpanded}
            setCapExpanded={setCapExpanded}
            pairStats={pairStats}
          />
        )}
        {activeTab === "connectivity" && (
          <ConnectivityTab
            adapter={adapter}
            editFields={editFields}
            setField={setField}
          />
        )}
        {activeTab === "credentials" && (
          <CredentialsTab
            adapter={adapter}
            editFields={editFields}
            setField={setField}
          />
        )}
        {activeTab === "trading-pairs" && (
          <TradingPairsTab
            adapter={adapter}
            pairs={pairs}
            stats={pairStats}
            loading={pairsLoading}
            syncing={syncing}
            search={pairSearch}
            marketFilter={pairMarketFilter}
            showCount={pairShowCount}
            allowAllPairs={editFields.allowAllPairs ?? adapter.allowAllPairs}
            syncMode={syncMode}
            onSyncModeChange={setSyncMode}
            onSync={handleSync}
            onSearch={(val) => { setPairSearch(val); fetchPairs(val, pairMarketFilter); }}
            onMarketFilter={(val) => { setPairMarketFilter(val); fetchPairs(pairSearch, val); }}
            onTogglePair={handleTogglePair}
            onBulkToggle={handleBulkToggle}
            onToggleAllowAll={(val) => setField("allowAllPairs", val)}
            onLoadMore={() => setPairShowCount((p) => p + 50)}
          />
        )}
      </div>
    </div>
  );
}

// ── Tab 1: Overview ──────────────────────────────────────────────

function OverviewTab({
  adapter,
  editFields,
  setField,
  capExpanded,
  setCapExpanded,
  pairStats,
}: {
  adapter: Adapter;
  editFields: Record<string, any>;
  setField: (key: string, value: any) => void;
  capExpanded: boolean;
  setCapExpanded: (v: boolean) => void;
  pairStats: PairStats;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Status + Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Field label="Status">
          <select
            className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full cursor-pointer"
            value={editFields.status ?? adapter.status}
            onChange={(e) => setField("status", e.target.value)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </Field>
        {(editFields.status ?? adapter.status) === "maintenance" && (
          <Field label="Maintenance Message">
            <textarea
              className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550] resize-y min-h-[60px]"
              value={editFields.maintenanceMessage ?? ""}
              onChange={(e) => setField("maintenanceMessage", e.target.value)}
              placeholder="Scheduled maintenance until..."
            />
          </Field>
        )}
      </div>

      {/* Description */}
      {adapter.description && (
        <div>
          <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[#5a7090] mb-1">Description</div>
          <div className="font-mono text-[10px] text-[#8fa3b8] bg-[#131920] border border-[#1e2d40] rounded px-3 py-2">
            {adapter.description}
          </div>
        </div>
      )}

      {/* Market Support */}
      <div>
        <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[#5a7090] mb-2">Market Support</div>
        <div className="flex flex-wrap gap-3">
          <Toggle label="Spot" checked={editFields.supportsSpot ?? adapter.supportsSpot} onChange={(v) => setField("supportsSpot", v)} />
          <Toggle label="Margin" checked={editFields.supportsMargin ?? adapter.supportsMargin} onChange={(v) => setField("supportsMargin", v)} />
          <Toggle label="Futures" checked={editFields.supportsFutures ?? adapter.supportsFutures} onChange={(v) => setField("supportsFutures", v)} />
          <Toggle label="Options" checked={editFields.supportsOptions ?? adapter.supportsOptions} onChange={(v) => setField("supportsOptions", v)} />
          <Toggle label="Staking" checked={editFields.supportsStaking ?? adapter.supportsStaking} onChange={(v) => setField("supportsStaking", v)} />
        </div>
      </div>

      {/* Allow All Pairs */}
      <div>
        <Toggle label="Allow All Pairs" checked={editFields.allowAllPairs ?? adapter.allowAllPairs} onChange={(v) => setField("allowAllPairs", v)} />
      </div>

      {/* Execution Capabilities */}
      {adapter.executionCapabilities && Object.keys(adapter.executionCapabilities).length > 0 && (
        <div>
          <button
            className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[#5a7090] mb-2 flex items-center gap-1 hover:text-[#8fa3b8] transition-colors"
            onClick={() => setCapExpanded(!capExpanded)}
          >
            Execution Capabilities {capExpanded ? "\u25B2" : "\u25BC"}
          </button>
          {capExpanded && <CapabilitiesDisplay caps={adapter.executionCapabilities} />}
        </div>
      )}

      {/* Sync Stats */}
      <div>
        <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[#5a7090] mb-2">Sync Stats</div>
        <div className="bg-[#131920] border border-[#1e2d40] rounded px-3 py-2.5 flex flex-wrap gap-4">
          <div className="font-mono text-[9px]">
            <span className="text-[#5a7090]">Last Sync: </span>
            <span className="text-[#e8edf3]">{adapter.lastSyncAt ? formatDate(adapter.lastSyncAt) : "Never"}</span>
          </div>
          {adapter.lastSyncStatus && (
            <div className="font-mono text-[9px]">
              <span className="text-[#5a7090]">Status: </span>
              <span className={`px-1.5 py-0.5 rounded-sm text-[8px] uppercase font-bold ${
                adapter.lastSyncStatus === "success"
                  ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                  : adapter.lastSyncStatus === "running"
                  ? "bg-[rgba(61,157,243,0.10)] text-[#3d9df3]"
                  : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
              }`}>
                {adapter.lastSyncStatus}
              </span>
            </div>
          )}
          <div className="font-mono text-[9px]">
            <span className="text-[#5a7090]">Pairs: </span>
            <span className="text-[#e8edf3]">{pairStats.total}</span>
            <span className="text-[#5a7090] ml-1">(Active: {pairStats.active})</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: Connectivity ──────────────────────────────────────────

function ConnectivityTab({
  adapter,
  editFields,
  setField,
}: {
  adapter: Adapter;
  editFields: Record<string, any>;
  setField: (key: string, value: any) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* URLs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Field label="Base URL">
          <input
            className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
            value={editFields.baseUrl ?? ""}
            onChange={(e) => setField("baseUrl", e.target.value)}
            placeholder="https://api.exchange.com"
          />
        </Field>
        <Field label="WebSocket URL">
          <input
            className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
            value={editFields.wsUrl ?? ""}
            onChange={(e) => setField("wsUrl", e.target.value)}
            placeholder="wss://ws.exchange.com"
          />
        </Field>
        <Field label="Sandbox Base URL">
          <input
            className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
            value={editFields.sandboxBaseUrl ?? ""}
            onChange={(e) => setField("sandboxBaseUrl", e.target.value)}
            placeholder="https://testnet.exchange.com"
          />
        </Field>
        <Field label="Sandbox WS URL">
          <input
            className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
            value={editFields.sandboxWsUrl ?? ""}
            onChange={(e) => setField("sandboxWsUrl", e.target.value)}
            placeholder="wss://testnet-ws.exchange.com"
          />
        </Field>
      </div>

      {/* Auth Model */}
      <Field label="Auth Model">
        <select
          className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full max-w-xs cursor-pointer"
          value={editFields.authModel ?? adapter.authModel}
          onChange={(e) => setField("authModel", e.target.value)}
        >
          <option value="api_key">API Key</option>
          <option value="oauth2">OAuth 2.0</option>
          <option value="hmac">HMAC</option>
          <option value="jwt">JWT</option>
        </select>
      </Field>

      {/* Rate Limits */}
      <div>
        <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[#5a7090] mb-2">Rate Limits</div>
        <div className="grid grid-cols-3 gap-3 max-w-lg">
          <Field label="Orders/s">
            <input
              className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
              type="number"
              value={editFields.rateLimitOrders ?? adapter.rateLimitOrders}
              onChange={(e) => setField("rateLimitOrders", +e.target.value)}
            />
          </Field>
          <Field label="Queries/s">
            <input
              className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
              type="number"
              value={editFields.rateLimitQueries ?? adapter.rateLimitQueries}
              onChange={(e) => setField("rateLimitQueries", +e.target.value)}
            />
          </Field>
          <Field label="WS/s">
            <input
              className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
              type="number"
              value={editFields.rateLimitWs ?? adapter.rateLimitWs}
              onChange={(e) => setField("rateLimitWs", +e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Order Size */}
      <div>
        <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[#5a7090] mb-2">Order Size (USD)</div>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <Field label="Min">
            <input
              className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
              type="number"
              value={editFields.minOrderSizeUsd ?? ""}
              onChange={(e) => setField("minOrderSizeUsd", e.target.value === "" ? "" : +e.target.value)}
              placeholder="—"
            />
          </Field>
          <Field label="Max">
            <input
              className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
              type="number"
              value={editFields.maxOrderSizeUsd ?? ""}
              onChange={(e) => setField("maxOrderSizeUsd", e.target.value === "" ? "" : +e.target.value)}
              placeholder="—"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Tab 3: API Credentials ───────────────────────────────────────

function CredentialsTab({
  adapter,
  editFields,
  setField,
}: {
  adapter: Adapter;
  editFields: Record<string, any>;
  setField: (key: string, value: any) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Toggle
        label="Requires Platform Auth"
        checked={editFields.requiresPlatformAuth ?? adapter.requiresPlatformAuth}
        onChange={(v) => setField("requiresPlatformAuth", v)}
      />

      {(editFields.requiresPlatformAuth ?? adapter.requiresPlatformAuth) && (
        <>
          <div className="font-mono text-[8px] text-[#5a7090]">
            Sandbox credentials are used when available. Otherwise live credentials are used.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Live Credentials */}
            <div className="bg-[#131920] border border-[#1e2d40] rounded p-4 space-y-3">
              <div className="font-mono text-[10px] font-semibold text-[#e8edf3] mb-1">Live Credentials</div>
              <Field label="API Key">
                <input
                  className="bg-[#0d1117] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  value={editFields.platformApiKey ?? ""}
                  onChange={(e) => setField("platformApiKey", e.target.value)}
                  placeholder={adapter.platformApiKey || "Enter API key"}
                />
              </Field>
              <Field label="API Secret">
                <input
                  type="password"
                  className="bg-[#0d1117] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  value={editFields.platformApiSecret ?? ""}
                  onChange={(e) => setField("platformApiSecret", e.target.value)}
                  placeholder={adapter.platformApiSecret ? "••••••••" : "Enter API secret"}
                />
              </Field>
              <Field label="Passphrase">
                <input
                  type="password"
                  className="bg-[#0d1117] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  value={editFields.platformApiPassword ?? ""}
                  onChange={(e) => setField("platformApiPassword", e.target.value)}
                  placeholder={adapter.platformApiPassword ? "••••••••" : "Enter passphrase (if required)"}
                />
              </Field>
            </div>

            {/* Sandbox Credentials */}
            <div className="bg-[#131920] border border-[#1e2d40] rounded p-4 space-y-3">
              <div className="font-mono text-[10px] font-semibold text-[#f5a623] mb-1">Sandbox Credentials</div>
              <Field label="API Key">
                <input
                  className="bg-[#0d1117] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  value={editFields.sandboxApiKey ?? ""}
                  onChange={(e) => setField("sandboxApiKey", e.target.value)}
                  placeholder={adapter.sandboxApiKey || "Enter sandbox API key"}
                />
              </Field>
              <Field label="API Secret">
                <input
                  type="password"
                  className="bg-[#0d1117] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  value={editFields.sandboxApiSecret ?? ""}
                  onChange={(e) => setField("sandboxApiSecret", e.target.value)}
                  placeholder={adapter.sandboxApiSecret ? "••••••••" : "Enter sandbox API secret"}
                />
              </Field>
              <Field label="Passphrase">
                <input
                  type="password"
                  className="bg-[#0d1117] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  value={editFields.sandboxApiPassword ?? ""}
                  onChange={(e) => setField("sandboxApiPassword", e.target.value)}
                  placeholder={adapter.sandboxApiPassword ? "••••••••" : "Enter sandbox passphrase (if required)"}
                />
              </Field>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab 4: Trading Pairs ─────────────────────────────────────────

function TradingPairsTab({
  adapter,
  pairs,
  stats,
  loading,
  syncing,
  search,
  marketFilter,
  showCount,
  allowAllPairs,
  syncMode,
  onSyncModeChange,
  onSync,
  onSearch,
  onMarketFilter,
  onTogglePair,
  onBulkToggle,
  onToggleAllowAll,
  onLoadMore,
}: {
  adapter: Adapter;
  pairs: TradingPair[];
  stats: PairStats;
  loading: boolean;
  syncing: boolean;
  search: string;
  marketFilter: string;
  showCount: number;
  allowAllPairs: boolean;
  syncMode: "auto" | "live" | "sandbox";
  onSyncModeChange: (mode: "auto" | "live" | "sandbox") => void;
  onSync: () => void;
  onSearch: (val: string) => void;
  onMarketFilter: (val: string) => void;
  onTogglePair: (pairId: string, isActive: boolean) => void;
  onBulkToggle: (isActive: boolean) => void;
  onToggleAllowAll: (val: boolean) => void;
  onLoadMore: () => void;
}) {
  const s = stats;
  const marketTypes = ["all", "spot", "futures", "swap", "option"];
  const visiblePairs = pairs.slice(0, showCount);
  const syncModes: { key: "auto" | "live" | "sandbox"; label: string }[] = [
    { key: "auto", label: "Auto" },
    { key: "live", label: "Live" },
    { key: "sandbox", label: "Sandbox" },
  ];

  return (
    <div>
      {/* Stats row + Sync controls + Allow All toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex gap-2 text-[9px] font-mono">
          <span className="text-[#8fa3b8]">Total: <span className="text-[#e8edf3] font-semibold">{s.total}</span></span>
          <span className="text-[#253550]">·</span>
          <span className="text-[#00e5a0]">Active: {s.active}</span>
          <span className="text-[#253550]">·</span>
          <span className="text-[#5a7090]">Inactive: {s.inactive}</span>
          <span className="text-[#253550]">·</span>
          <span className="text-[#ff4757]">Delisted: {s.delisted}</span>
        </div>
        {adapter.lastSyncAt && (
          <span className="text-[8px] font-mono text-[#3a5068]">
            Last sync: {formatDate(adapter.lastSyncAt)}
            {adapter.lastSyncStatus && (
              <span className={`ml-1 px-1 py-0.5 rounded-sm text-[7px] uppercase font-bold ${
                adapter.lastSyncStatus === "success"
                  ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                  : adapter.lastSyncStatus === "running"
                  ? "bg-[rgba(61,157,243,0.10)] text-[#3d9df3]"
                  : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
              }`}>
                {adapter.lastSyncStatus}
              </span>
            )}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Toggle label="Allow All Pairs" checked={allowAllPairs} onChange={onToggleAllowAll} />
          {/* Sync mode selector */}
          <div className="flex rounded overflow-hidden border border-[#1e2d40]">
            {syncModes.map((m) => (
              <button
                key={m.key}
                onClick={() => onSyncModeChange(m.key)}
                className={`px-2 py-1 font-mono text-[8px] uppercase tracking-wide transition-all ${
                  syncMode === m.key
                    ? "bg-[rgba(61,157,243,0.15)] text-[#3d9df3]"
                    : "bg-transparent text-[#5a7090] hover:text-[#8fa3b8]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            className="px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#3d9df3] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[rgba(61,157,243,0.10)] hover:border-[rgba(61,157,243,0.3)] transition-all disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </div>

      {/* Search + Market type filter */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2.5 py-1.5 rounded outline-none w-48 transition-all focus:border-[#253550]"
          placeholder="Search pairs..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <div className="flex gap-1">
          {marketTypes.map((mt) => (
            <button
              key={mt}
              onClick={() => onMarketFilter(mt)}
              className={`px-2 py-1 rounded font-mono text-[8px] uppercase tracking-wide transition-all ${
                marketFilter === mt
                  ? "bg-[rgba(61,157,243,0.15)] text-[#3d9df3] border border-[rgba(61,157,243,0.3)]"
                  : "bg-transparent text-[#5a7090] border border-[#1e2d40] hover:text-[#8fa3b8]"
              }`}
            >
              {mt}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => onBulkToggle(true)}
            className="px-2 py-1 rounded border border-[rgba(0,229,160,0.2)] bg-transparent text-[#00e5a0] font-mono text-[8px] uppercase tracking-wide hover:bg-[rgba(0,229,160,0.08)] transition-all"
          >
            Enable All Filtered
          </button>
          <button
            onClick={() => onBulkToggle(false)}
            className="px-2 py-1 rounded border border-[rgba(255,71,87,0.2)] bg-transparent text-[#ff4757] font-mono text-[8px] uppercase tracking-wide hover:bg-[rgba(255,71,87,0.08)] transition-all"
          >
            Disable All Filtered
          </button>
        </div>
      </div>

      {/* Pairs list */}
      {loading ? (
        <div className="text-center py-4 font-mono text-[10px] text-[#5a7090]">Loading pairs...</div>
      ) : pairs.length === 0 ? (
        <div className="text-center py-4 font-mono text-[10px] text-[#5a7090]">
          No trading pairs found. {s.total === 0 ? 'Click "Sync Now" to fetch pairs from the exchange.' : "Try adjusting your filters."}
        </div>
      ) : (
        <>
          <div className="border border-[#1e2d40] rounded overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_80px_60px_100px] gap-2 px-3 py-1.5 bg-[#0a0e14] border-b border-[#1e2d40]">
              <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090]">Symbol</div>
              <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090]">Type</div>
              <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090]">Status</div>
              <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090]">Active</div>
              <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090] text-right">Last Seen</div>
            </div>
            {/* Rows */}
            {visiblePairs.map((pair) => (
              <div
                key={pair.id}
                className="grid grid-cols-[1fr_80px_80px_60px_100px] gap-2 px-3 py-1.5 border-b border-[#1e2d40] last:border-b-0 hover:bg-[rgba(90,112,144,0.04)] transition-colors"
              >
                <div className="font-mono text-[10px] text-[#e8edf3] flex items-center gap-1.5">
                  <span className="flex items-center -space-x-1 flex-shrink-0">
                    <CryptoIcon symbol={pair.baseCurrency} size={16} />
                    <CryptoIcon symbol={pair.quoteCurrency} size={14} />
                  </span>
                  {pair.symbol}
                  {pair.delisted && (
                    <span className="px-1 py-0 rounded-sm bg-[rgba(255,71,87,0.10)] text-[#ff4757] text-[7px] font-bold uppercase">delisted</span>
                  )}
                </div>
                <div>
                  <span className="px-1.5 py-0.5 rounded-sm bg-[rgba(90,112,144,0.08)] text-[#8fa3b8] font-mono text-[8px] uppercase">
                    {pair.marketType || "—"}
                  </span>
                </div>
                <div>
                  <span className={`px-1.5 py-0.5 rounded-sm font-mono text-[8px] uppercase ${
                    pair.exchangeStatus === "active"
                      ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                      : "bg-[rgba(90,112,144,0.08)] text-[#5a7090]"
                  }`}>
                    {pair.exchangeStatus || "—"}
                  </span>
                </div>
                <div>
                  <button
                    onClick={() => onTogglePair(pair.id, !pair.isActive)}
                    className={`relative w-7 h-[16px] rounded-full transition-colors ${pair.isActive ? "bg-[#00e5a0]" : "bg-[#253550]"}`}
                  >
                    <span className={`absolute top-[2px] w-[12px] h-[12px] rounded-full bg-white transition-transform ${pair.isActive ? "left-[13px]" : "left-[2px]"}`} />
                  </button>
                </div>
                <div className="font-mono text-[8px] text-[#3a5068] text-right">
                  {pair.lastSeenAt ? formatDate(pair.lastSeenAt) : "—"}
                </div>
              </div>
            ))}
          </div>
          {pairs.length > showCount && (
            <button
              onClick={onLoadMore}
              className="mt-2 w-full py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] hover:bg-[#1a2230] transition-all"
            >
              Load More ({pairs.length - showCount} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Shared Sub-components ────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    active: "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]",
    inactive: "bg-[rgba(90,112,144,0.10)] text-[#5a7090]",
    maintenance: "bg-[rgba(61,157,243,0.10)] text-[#3d9df3]",
    deprecated: "bg-[rgba(255,71,87,0.10)] text-[#ff4757]",
  };
  return (
    <span className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide ${cls[status] || cls.inactive}`}>
      {status}
    </span>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-[18px] rounded-full transition-colors ${checked ? "bg-[#00e5a0]" : "bg-[#253550]"}`}
      >
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${checked ? "left-[16px]" : "left-[2px]"}`} />
      </button>
      <span className="font-mono text-[10px] text-[#8fa3b8]">{label}</span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">{label}</div>
      {children}
    </div>
  );
}

function CapabilitiesDisplay({ caps }: { caps: ExecutionCapabilities }) {
  return (
    <div className="bg-[#131920] border border-[#1e2d40] rounded p-3 space-y-3">
      {caps.orderTypes && caps.orderTypes.length > 0 && (
        <ChipRow label="Order Types" items={caps.orderTypes} />
      )}
      {caps.timeInForce && caps.timeInForce.length > 0 && (
        <ChipRow label="Time in Force" items={caps.timeInForce} />
      )}
      {caps.marginModes && caps.marginModes.length > 0 && (
        <ChipRow label="Margin Modes" items={caps.marginModes} />
      )}
      {caps.positionModes && caps.positionModes.length > 0 && (
        <ChipRow label="Position Modes" items={caps.positionModes} />
      )}
      <div className="flex flex-wrap gap-2 mt-1">
        <BoolChip label="OCO" value={caps.supportsOco} />
        <BoolChip label="Native SL" value={caps.nativeStopLoss} />
        <BoolChip label="Take Profit" value={caps.nativeTakeProfit} />
        <BoolChip label="Trailing Stop" value={caps.trailingStop} />
        <BoolChip label="Bracket" value={caps.bracketOrders} />
        <BoolChip label="Paper Trading" value={caps.paperTrading} />
        {caps.maxGlobalLeverage !== undefined && (
          <span className="px-2 py-0.5 rounded bg-[rgba(245,166,35,0.10)] text-[#f5a623] font-mono text-[8px]">
            Max Lev: {caps.maxGlobalLeverage}x
          </span>
        )}
      </div>
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

function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090] mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span key={item} className="px-2 py-0.5 rounded bg-[rgba(90,112,144,0.12)] text-[#8fa3b8] font-mono text-[9px]">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function BoolChip({ label, value }: { label: string; value?: boolean }) {
  if (value === undefined) return null;
  return (
    <span className={`px-2 py-0.5 rounded font-mono text-[8px] ${value ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]" : "bg-[rgba(90,112,144,0.08)] text-[#3a5068]"}`}>
      {value ? "\u2713" : "\u2717"} {label}
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case "active": return "#00e5a0";
    case "maintenance": return "#3d9df3";
    case "deprecated": return "#ff4757";
    default: return "#5a7090";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "\u2014"; }
}
