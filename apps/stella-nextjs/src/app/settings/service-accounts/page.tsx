"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listServiceAccounts,
  createServiceAccount,
  updateServiceAccount,
  deleteServiceAccount,
  listServiceAccountCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
  listAdapters,
} from "@/lib/tradingEngineApi";
import { getSettingsExchanges } from "@/lib/stellaAdminApi";

// ── Types ────────────────────────────────────────────────────────

interface ConfigOverrides {
  base_url?: string;
  ws_url?: string;
  sandbox_base_url?: string;
  sandbox_ws_url?: string;
  futures_base_url?: string;
  futures_sandbox_base_url?: string;
  rate_limit_orders?: number;
  rate_limit_queries?: number;
  custom_headers?: Record<string, string>;
}

interface Credential {
  id: string;
  user_id: string | null;
  service_account_id: string | null;
  adapter_id: string;
  label: string | null;
  status: string;
  auth_model: string;
  is_enabled: boolean;
  is_sandbox: boolean;
  permissions: string[] | null;
  ip_whitelist: string[] | null;
  config_overrides: ConfigOverrides;
  wallet_address: string | null;
  last_validated_at: string | null;
  validation_error: string | null;
  connected_at: string | null;
  last_used_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface ServiceAccount {
  id: string;
  name: string;
  account_type: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface Adapter {
  id: string;
  code: string;
  name: string;
  status: string;
  // NestJS returns camelCase, Elixir returns snake_case — support both
  authModel?: string;
  auth_model?: string;
  baseUrl?: string | null;
  base_url?: string | null;
  wsUrl?: string | null;
  ws_url?: string | null;
  sandboxBaseUrl?: string | null;
  sandbox_base_url?: string | null;
  sandboxWsUrl?: string | null;
  sandbox_ws_url?: string | null;
  supportsSpot?: boolean;
  supports_spot?: boolean;
  supportsMargin?: boolean;
  supports_margin?: boolean;
  supportsFutures?: boolean;
  supports_futures?: boolean;
  rateLimitOrders?: number;
  rate_limit_orders?: number;
  rateLimitQueries?: number;
  rate_limit_queries?: number;
  config?: Record<string, any>;
}

type ModalMode = null | "create" | "edit";

const ACCOUNT_TYPES = ["system", "demo", "admin_managed"] as const;
const PERMISSIONS = ["read", "trade", "withdraw"] as const;

// ── Page ─────────────────────────────────────────────────────────

export default function ServiceAccountsPage() {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded service account + credentials
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [credsByAccount, setCredsByAccount] = useState<Record<string, Credential[]>>({});
  const [credsLoading, setCredsLoading] = useState<Record<string, boolean>>({});

  // Account modal
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingAccount, setEditingAccount] = useState<ServiceAccount | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<string>("system");
  const [formDesc, setFormDesc] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Credential modal
  const [credModal, setCredModal] = useState<{ saId: string; cred: Credential | null } | null>(null);
  const [credForm, setCredForm] = useState({
    adapter_id: "",
    label: "",
    auth_model: "api_key_secret",
    api_key: "",
    api_secret: "",
    passphrase: "",
    is_sandbox: false,
    permissions: ["read", "trade"] as string[],
    // Config overrides
    base_url: "",
    ws_url: "",
    sandbox_base_url: "",
    sandbox_ws_url: "",
    futures_base_url: "",
    futures_sandbox_base_url: "",
    rate_limit_orders: "",
    rate_limit_queries: "",
  });
  const [credSaving, setCredSaving] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Data loading ──────────────────────────────────────────────

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const res = await listServiceAccounts();
    if (res.data && Array.isArray(res.data)) {
      setAccounts(res.data);
      setError(null);
    } else {
      setError(res.error || "Failed to load service accounts");
    }
    setLoading(false);
  }, []);

  const fetchAdapters = useCallback(async () => {
    // Try Elixir adapters endpoint first, fall back to NestJS
    const res = await listAdapters();
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      setAdapters(res.data);
    } else {
      const nestRes = await getSettingsExchanges();
      if (nestRes.data) {
        const d = nestRes.data as any;
        setAdapters(d.adapters || d.exchanges || []);
      }
    }
  }, []);

  const fetchCredentials = useCallback(async (saId: string) => {
    setCredsLoading((p) => ({ ...p, [saId]: true }));
    const res = await listServiceAccountCredentials(saId);
    if (res.data && Array.isArray(res.data)) {
      setCredsByAccount((p) => ({ ...p, [saId]: res.data as Credential[] }));
    } else {
      setCredsByAccount((p) => ({ ...p, [saId]: [] }));
    }
    setCredsLoading((p) => ({ ...p, [saId]: false }));
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchAdapters();
  }, [fetchAccounts, fetchAdapters]);

  // Fetch credentials when expanding
  useEffect(() => {
    if (expandedId && !credsByAccount[expandedId]) {
      fetchCredentials(expandedId);
    }
  }, [expandedId, credsByAccount, fetchCredentials]);

  // ── Helpers ────────────────────────────────────────────────────

  function getAdapter(adapterId: string): Adapter | undefined {
    return adapters.find((a) => a.id === adapterId);
  }

  function getAdapterName(adapterId: string): string {
    return getAdapter(adapterId)?.name || adapterId.slice(0, 8) + "...";
  }

  // Normalize adapter fields (NestJS=camelCase, Elixir=snake_case)
  function a(adapter: Adapter | undefined) {
    if (!adapter) return { baseUrl: null, wsUrl: null, sandboxBaseUrl: null, sandboxWsUrl: null, rateLimitOrders: 0, rateLimitQueries: 0, authModel: "" };
    return {
      baseUrl: adapter.baseUrl ?? adapter.base_url ?? null,
      wsUrl: adapter.wsUrl ?? adapter.ws_url ?? null,
      sandboxBaseUrl: adapter.sandboxBaseUrl ?? adapter.sandbox_base_url ?? null,
      sandboxWsUrl: adapter.sandboxWsUrl ?? adapter.sandbox_ws_url ?? null,
      rateLimitOrders: adapter.rateLimitOrders ?? adapter.rate_limit_orders ?? 0,
      rateLimitQueries: adapter.rateLimitQueries ?? adapter.rate_limit_queries ?? 0,
      authModel: adapter.authModel ?? adapter.auth_model ?? "",
    };
  }

  // ── Account Modal ─────────────────────────────────────────────

  const openCreate = () => {
    setModalMode("create");
    setEditingAccount(null);
    setFormName("");
    setFormType("system");
    setFormDesc("");
    setFormActive(true);
    setFormError(null);
  };

  const openEdit = (sa: ServiceAccount) => {
    setModalMode("edit");
    setEditingAccount(sa);
    setFormName(sa.name);
    setFormType(sa.account_type);
    setFormDesc(sa.description || "");
    setFormActive(sa.is_active);
    setFormError(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingAccount(null);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) { setFormError("Name is required"); return; }
    setSaving(true);
    setFormError(null);

    const payload = {
      name: formName.trim(),
      account_type: formType,
      description: formDesc.trim() || undefined,
      is_active: formActive,
    };

    let res;
    if (modalMode === "create") {
      res = await createServiceAccount(payload);
    } else if (editingAccount) {
      res = await updateServiceAccount(editingAccount.id, payload);
    }

    if (res?.error) {
      setFormError(res.error);
    } else {
      closeModal();
      fetchAccounts();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    const res = await deleteServiceAccount(id);
    if (res.error) {
      setError(res.error);
    } else {
      setDeletingId(null);
      fetchAccounts();
    }
    setDeleting(false);
  };

  // ── Credential Modal ──────────────────────────────────────────

  const openAddCred = (saId: string) => {
    const firstAdapter = adapters[0];
    setCredModal({ saId, cred: null });
    setCredForm({
      adapter_id: firstAdapter?.id || "",
      label: "",
      auth_model: firstAdapter?.auth_model || "api_key_secret",
      api_key: "",
      api_secret: "",
      passphrase: "",
      is_sandbox: false,
      permissions: ["read", "trade"],
      base_url: "",
      ws_url: "",
      sandbox_base_url: "",
      sandbox_ws_url: "",
      futures_base_url: "",
      futures_sandbox_base_url: "",
      rate_limit_orders: "",
      rate_limit_queries: "",
    });
    setCredError(null);
    setShowOverrides(false);
  };

  const openEditCred = (saId: string, cred: Credential) => {
    const overrides = cred.config_overrides || {};
    setCredModal({ saId, cred });
    setCredForm({
      adapter_id: cred.adapter_id,
      label: cred.label || "",
      auth_model: cred.auth_model,
      api_key: "",
      api_secret: "",
      passphrase: "",
      is_sandbox: cred.is_sandbox,
      permissions: cred.permissions || ["read", "trade"],
      base_url: overrides.base_url || "",
      ws_url: overrides.ws_url || "",
      sandbox_base_url: overrides.sandbox_base_url || "",
      sandbox_ws_url: overrides.sandbox_ws_url || "",
      futures_base_url: overrides.futures_base_url || "",
      futures_sandbox_base_url: overrides.futures_sandbox_base_url || "",
      rate_limit_orders: overrides.rate_limit_orders?.toString() || "",
      rate_limit_queries: overrides.rate_limit_queries?.toString() || "",
    });
    setCredError(null);
    setShowOverrides(Object.keys(overrides).length > 0);
  };

  const handleSaveCred = async () => {
    if (!credForm.adapter_id) { setCredError("Select an exchange"); return; }
    if (!credForm.label.trim()) { setCredError("Label is required"); return; }

    // Only require keys for new credentials
    if (!credModal!.cred && (!credForm.api_key.trim() || !credForm.api_secret.trim())) {
      setCredError("API Key and Secret are required for new credentials");
      return;
    }

    setCredSaving(true);
    setCredError(null);

    // Build config_overrides — only include non-empty values
    const config_overrides: ConfigOverrides = {};
    if (credForm.base_url.trim()) config_overrides.base_url = credForm.base_url.trim();
    if (credForm.ws_url.trim()) config_overrides.ws_url = credForm.ws_url.trim();
    if (credForm.sandbox_base_url.trim()) config_overrides.sandbox_base_url = credForm.sandbox_base_url.trim();
    if (credForm.sandbox_ws_url.trim()) config_overrides.sandbox_ws_url = credForm.sandbox_ws_url.trim();
    if (credForm.futures_base_url.trim()) config_overrides.futures_base_url = credForm.futures_base_url.trim();
    if (credForm.futures_sandbox_base_url.trim()) config_overrides.futures_sandbox_base_url = credForm.futures_sandbox_base_url.trim();
    if (credForm.rate_limit_orders.trim()) config_overrides.rate_limit_orders = parseInt(credForm.rate_limit_orders);
    if (credForm.rate_limit_queries.trim()) config_overrides.rate_limit_queries = parseInt(credForm.rate_limit_queries);

    const payload: Record<string, any> = {
      adapter_id: credForm.adapter_id,
      auth_model: credForm.auth_model,
      exchange_name: credForm.label.trim(),
      is_sandbox: credForm.is_sandbox,
      permissions: credForm.permissions,
      config_overrides,
      status: "active",
    };

    // Only send credentials if provided (for create, or for rotation on edit)
    if (credForm.api_key.trim()) payload.encrypted_api_key = credForm.api_key.trim();
    if (credForm.api_secret.trim()) payload.encrypted_api_secret = credForm.api_secret.trim();
    if (credForm.passphrase.trim()) payload.encrypted_passphrase = credForm.passphrase.trim();

    let res;
    if (credModal!.cred) {
      res = await updateCredential(credModal!.cred.id, payload);
    } else {
      payload.service_account_id = credModal!.saId;
      res = await createCredential(payload as Parameters<typeof createCredential>[0]);
    }

    if (res.error) {
      setCredError(typeof res.error === "string" ? res.error : JSON.stringify(res.error));
    } else {
      setCredModal(null);
      fetchCredentials(credModal!.saId);
    }
    setCredSaving(false);
  };

  const handleDeleteCred = async (saId: string, credId: string) => {
    const res = await deleteCredential(credId);
    if (res.error) {
      setError(typeof res.error === "string" ? res.error : JSON.stringify(res.error));
    } else {
      fetchCredentials(saId);
    }
  };

  const handleToggleCredStatus = async (saId: string, cred: Credential) => {
    const newStatus = cred.status === "active" ? "revoked" : "active";
    const res = await updateCredential(cred.id, { status: newStatus });
    if (!res.error) fetchCredentials(saId);
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">
            Service Accounts
          </div>
          <div className="font-mono text-[10px] text-[#5a7090]">
            Manage service accounts with exchange credentials and config overrides.
          </div>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 rounded border bg-[rgba(255,215,0,0.10)] text-[#FFD700] border-[rgba(255,215,0,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#FFD700] hover:text-black transition-all"
        >
          + New Account
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded px-3 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-[#ff4757] hover:text-white ml-2">&times;</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-[#0d1117] border border-[#1e2d40] rounded px-4 py-8 text-center">
          <div className="font-mono text-[10px] text-[#5a7090]">Loading service accounts...</div>
        </div>
      )}

      {/* Empty */}
      {!loading && accounts.length === 0 && (
        <div className="bg-[#0d1117] border border-[#1e2d40] rounded px-4 py-8 text-center">
          <div className="font-mono text-[10px] text-[#5a7090]">No service accounts found.</div>
          <button onClick={openCreate} className="mt-2 font-mono text-[10px] text-[#FFD700] hover:underline">
            Create your first service account
          </button>
        </div>
      )}

      {/* Account Cards */}
      {!loading &&
        accounts.map((sa) => {
          const isExpanded = expandedId === sa.id;
          const creds = credsByAccount[sa.id] || [];
          const isLoadingCreds = credsLoading[sa.id];

          return (
            <div key={sa.id} className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
              {/* Header Row */}
              <div
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[#131920] transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : sa.id)}
              >
                <svg className={`w-3 h-3 text-[#5a7090] transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[#e8edf3] font-medium">{sa.name}</span>
                    <span className={`inline-block px-1.5 py-0.5 rounded-sm font-mono text-[8px] font-bold uppercase ${typeColor(sa.account_type)}`}>
                      {sa.account_type}
                    </span>
                    <span className={`inline-block px-1.5 py-0.5 rounded-sm font-mono text-[8px] font-bold uppercase ${sa.is_active ? "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]" : "bg-[rgba(90,112,144,0.12)] text-[#5a7090]"}`}>
                      {sa.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {sa.description && (
                    <div className="font-mono text-[9px] text-[#5a7090] mt-0.5 truncate">{sa.description}</div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {credsByAccount[sa.id] !== undefined && (
                    <span className="font-mono text-[9px] text-[#5a7090]">
                      {creds.length} credential{creds.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="font-mono text-[8px] text-[#3a5068]">{sa.id.slice(0, 8)}</span>
                </div>

                <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(sa)} className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all">
                    Edit
                  </button>
                  {deletingId === sa.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => handleDelete(sa.id)} disabled={deleting} className="px-2 py-1 rounded border border-[rgba(255,71,87,0.3)] bg-[rgba(255,71,87,0.08)] text-[#ff4757] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#ff4757] hover:text-white transition-all disabled:opacity-50">
                        {deleting ? "..." : "Yes"}
                      </button>
                      <button onClick={() => setDeletingId(null)} className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#5a7090] font-mono text-[8px] font-semibold uppercase tracking-wide hover:text-[#8fa3b8] transition-all">
                        No
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeletingId(sa.id)} className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#5a7090] font-mono text-[8px] font-semibold uppercase tracking-wide hover:border-[rgba(255,71,87,0.3)] hover:text-[#ff4757] transition-all">
                      Del
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded: Credentials Panel */}
              {isExpanded && (
                <div className="border-t border-[#1e2d40] bg-[#0a0e14]">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2d40]/60">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-[#3a5068]">
                      Exchange Credentials
                    </span>
                    <button onClick={() => openAddCred(sa.id)} className="px-2 py-1 rounded border bg-[rgba(61,157,243,0.08)] text-[#3d9df3] border-[rgba(61,157,243,0.25)] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#3d9df3] hover:text-white transition-all">
                      + Add Credential
                    </button>
                  </div>

                  {isLoadingCreds && (
                    <div className="px-4 py-6 text-center">
                      <div className="font-mono text-[10px] text-[#5a7090]">Loading credentials...</div>
                    </div>
                  )}

                  {!isLoadingCreds && creds.length === 0 && (
                    <div className="px-4 py-6 text-center">
                      <div className="font-mono text-[10px] text-[#5a7090]">No exchange credentials configured.</div>
                      <button onClick={() => openAddCred(sa.id)} className="mt-1.5 font-mono text-[10px] text-[#3d9df3] hover:underline">
                        Add your first credential
                      </button>
                    </div>
                  )}

                  {!isLoadingCreds && creds.map((cred) => (
                    <CredentialRow
                      key={cred.id}
                      cred={cred}
                      saId={sa.id}
                      adapterName={getAdapterName(cred.adapter_id)}
                      adapter={getAdapter(cred.adapter_id)}
                      onEdit={() => openEditCred(sa.id, cred)}
                      onDelete={() => handleDeleteCred(sa.id, cred.id)}
                      onToggleStatus={() => handleToggleCredStatus(sa.id, cred)}
                    />
                  ))}

                  {/* Account footer */}
                  <div className="px-4 py-2 border-t border-[#1e2d40]/40 flex items-center gap-4">
                    <span className="font-mono text-[8px] text-[#3a5068]">Created {formatDate(sa.created_at)}</span>
                    <span className="font-mono text-[8px] text-[#3a5068]">Updated {formatDate(sa.updated_at)}</span>
                    <span className="font-mono text-[8px] text-[#3a5068]">ID: {sa.id}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

      {/* Create/Edit Account Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1117] border border-[#1e2d40] rounded-lg w-full max-w-md">
            <div className="px-5 py-4 border-b border-[#1e2d40] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#e8edf3] uppercase tracking-wider">
                {modalMode === "create" ? "New Service Account" : "Edit Service Account"}
              </h3>
              <button onClick={closeModal} className="text-[#5a7090] hover:text-[#e8edf3] transition-colors text-lg leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="font-mono text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Account Name</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. System Trading" autoFocus className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-3 py-2 text-xs text-[#e8edf3] placeholder:text-[#5a7090] font-mono focus:outline-none focus:border-[#253550]" />
              </div>
              <div>
                <label className="font-mono text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Account Type</label>
                <div className="flex gap-2">
                  {ACCOUNT_TYPES.map((t) => (
                    <button key={t} onClick={() => setFormType(t)} className={`px-3 py-1.5 rounded-sm text-[11px] font-bold uppercase border transition-all ${formType === t ? "border-[#FFD700] bg-[rgba(255,215,0,0.08)] text-[#FFD700]" : "border-[#1e2d40] text-[#8fa3b8] hover:border-[#253550]"}`}>
                      {t.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="font-mono text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Description</label>
                <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Optional description..." rows={2} className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-3 py-2 text-xs text-[#e8edf3] placeholder:text-[#5a7090] font-mono focus:outline-none focus:border-[#253550] resize-none" />
              </div>
              {modalMode === "edit" && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-[12px] text-[#e8edf3] font-medium">Active</div>
                    <div className="font-mono text-[9px] text-[#5a7090] mt-0.5">Inactive accounts cannot be assigned to new bots.</div>
                  </div>
                  <ToggleSwitch checked={formActive} onChange={setFormActive} />
                </div>
              )}
              {formError && (
                <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2">{formError}</div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-[#1e2d40] flex gap-2.5 justify-end">
              <button onClick={closeModal} disabled={saving} className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-[#1e2d40] hover:border-[#253550] hover:text-[#e8edf3] transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all disabled:opacity-50">
                {saving ? "Saving..." : modalMode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Credential Modal */}
      {credModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1117] border border-[#1e2d40] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-[#1e2d40] flex items-center justify-between sticky top-0 bg-[#0d1117] z-10">
              <h3 className="text-sm font-bold text-[#e8edf3] uppercase tracking-wider">
                {credModal.cred ? "Edit Credential" : "Add Exchange Credential"}
              </h3>
              <button onClick={() => setCredModal(null)} className="text-[#5a7090] hover:text-[#e8edf3] transition-colors text-lg leading-none">&times;</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Exchange select */}
              <div>
                <label className="font-mono text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Exchange</label>
                <select
                  value={credForm.adapter_id}
                  onChange={(e) => {
                    const adapter = adapters.find((a) => a.id === e.target.value);
                    setCredForm((f) => ({
                      ...f,
                      adapter_id: e.target.value,
                      auth_model: adapter?.authModel || adapter?.auth_model || f.auth_model,
                    }));
                  }}
                  disabled={!!credModal.cred}
                  className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-3 py-2 text-xs text-[#e8edf3] font-mono focus:outline-none focus:border-[#253550] disabled:opacity-50"
                >
                  <option value="">Select exchange...</option>
                  {adapters.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.code}) — {a.authModel || a.auth_model}</option>
                  ))}
                </select>
              </div>

              {/* Adapter defaults preview */}
              {credForm.adapter_id && (() => {
                const adapter = getAdapter(credForm.adapter_id);
                if (!adapter) return null;
                const n = a(adapter);
                return (
                  <div className="bg-[#131920] border border-[#1e2d40]/60 rounded-sm px-3 py-2">
                    <div className="font-mono text-[8px] text-[#3a5068] uppercase mb-1">Platform Defaults</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[9px]">
                      <div className="text-[#5a7090]">Base URL: <span className="text-[#8fa3b8]">{n.baseUrl || "—"}</span></div>
                      <div className="text-[#5a7090]">WS URL: <span className="text-[#8fa3b8]">{n.wsUrl || "—"}</span></div>
                      <div className="text-[#5a7090]">Sandbox: <span className="text-[#8fa3b8]">{n.sandboxBaseUrl || "—"}</span></div>
                      <div className="text-[#5a7090]">Rate Orders: <span className="text-[#8fa3b8]">{n.rateLimitOrders}/min</span></div>
                      <div className="text-[#5a7090]">Rate Queries: <span className="text-[#8fa3b8]">{n.rateLimitQueries}/min</span></div>
                    </div>
                  </div>
                );
              })()}

              {/* Label */}
              <div>
                <label className="font-mono text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Label</label>
                <input value={credForm.label} onChange={(e) => setCredForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Main Trading, Hedging, Testnet" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-3 py-2 text-xs text-[#e8edf3] placeholder:text-[#5a7090] font-mono focus:outline-none focus:border-[#253550]" />
              </div>

              {/* API Key */}
              <div>
                <label className="font-mono text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
                  API Key {credModal.cred && <span className="text-[#3a5068]">(leave blank to keep current)</span>}
                </label>
                <input value={credForm.api_key} onChange={(e) => setCredForm((f) => ({ ...f, api_key: e.target.value }))} placeholder={credModal.cred ? "••••••••" : "Paste your API key"} className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-3 py-2 text-xs text-[#e8edf3] placeholder:text-[#5a7090] font-mono focus:outline-none focus:border-[#253550]" />
              </div>

              {/* API Secret */}
              <div>
                <label className="font-mono text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
                  API Secret {credModal.cred && <span className="text-[#3a5068]">(leave blank to keep current)</span>}
                </label>
                <input type="password" value={credForm.api_secret} onChange={(e) => setCredForm((f) => ({ ...f, api_secret: e.target.value }))} placeholder={credModal.cred ? "••••••••" : "Paste your API secret"} className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-3 py-2 text-xs text-[#e8edf3] placeholder:text-[#5a7090] font-mono focus:outline-none focus:border-[#253550]" />
              </div>

              {/* Passphrase */}
              <div>
                <label className="font-mono text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">
                  Passphrase <span className="text-[#3a5068]">(OKX, KuCoin)</span>
                </label>
                <input type="password" value={credForm.passphrase} onChange={(e) => setCredForm((f) => ({ ...f, passphrase: e.target.value }))} placeholder="Exchange passphrase if required" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-3 py-2 text-xs text-[#e8edf3] placeholder:text-[#5a7090] font-mono focus:outline-none focus:border-[#253550]" />
              </div>

              {/* Sandbox + Permissions */}
              <div className="flex items-start gap-6">
                <div className="flex items-center gap-2">
                  <ToggleSwitch checked={credForm.is_sandbox} onChange={(v) => setCredForm((f) => ({ ...f, is_sandbox: v }))} />
                  <span className="font-mono text-[9px] text-[#8fa3b8]">Sandbox / Testnet</span>
                </div>
                <div className="flex-1">
                  <label className="font-mono text-[8px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Permissions</label>
                  <div className="flex gap-2">
                    {PERMISSIONS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setCredForm((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }))}
                        className={`px-2 py-1 rounded-sm text-[9px] font-bold uppercase border transition-all ${credForm.permissions.includes(p) ? "border-[#3d9df3] bg-[rgba(61,157,243,0.08)] text-[#3d9df3]" : "border-[#1e2d40] text-[#5a7090] hover:border-[#253550]"}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Config Overrides Section */}
              <div className="border-t border-[#1e2d40]/60 pt-3">
                <button
                  onClick={() => setShowOverrides(!showOverrides)}
                  className="flex items-center gap-2 font-mono text-[9px] text-[#3d9df3] hover:text-[#5aacf5] transition-colors"
                >
                  <svg className={`w-3 h-3 transition-transform ${showOverrides ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="uppercase tracking-widest font-semibold">Config Overrides</span>
                  <span className="text-[#5a7090] normal-case tracking-normal font-normal">Override platform defaults for this credential</span>
                </button>

                {showOverrides && (
                  <div className="mt-3 space-y-3 pl-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-mono text-[8px] text-[#5a7090] uppercase tracking-widest block mb-1">Base URL</label>
                        <input value={credForm.base_url} onChange={(e) => setCredForm((f) => ({ ...f, base_url: e.target.value }))} placeholder="https://api.example.com" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-2.5 py-1.5 text-[10px] text-[#e8edf3] placeholder:text-[#3a5068] font-mono focus:outline-none focus:border-[#253550]" />
                      </div>
                      <div>
                        <label className="font-mono text-[8px] text-[#5a7090] uppercase tracking-widest block mb-1">WebSocket URL</label>
                        <input value={credForm.ws_url} onChange={(e) => setCredForm((f) => ({ ...f, ws_url: e.target.value }))} placeholder="wss://stream.example.com" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-2.5 py-1.5 text-[10px] text-[#e8edf3] placeholder:text-[#3a5068] font-mono focus:outline-none focus:border-[#253550]" />
                      </div>
                      <div>
                        <label className="font-mono text-[8px] text-[#5a7090] uppercase tracking-widest block mb-1">Sandbox Base URL</label>
                        <input value={credForm.sandbox_base_url} onChange={(e) => setCredForm((f) => ({ ...f, sandbox_base_url: e.target.value }))} placeholder="https://testnet.example.com" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-2.5 py-1.5 text-[10px] text-[#e8edf3] placeholder:text-[#3a5068] font-mono focus:outline-none focus:border-[#253550]" />
                      </div>
                      <div>
                        <label className="font-mono text-[8px] text-[#5a7090] uppercase tracking-widest block mb-1">Sandbox WS URL</label>
                        <input value={credForm.sandbox_ws_url} onChange={(e) => setCredForm((f) => ({ ...f, sandbox_ws_url: e.target.value }))} placeholder="wss://testnet.example.com" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-2.5 py-1.5 text-[10px] text-[#e8edf3] placeholder:text-[#3a5068] font-mono focus:outline-none focus:border-[#253550]" />
                      </div>
                      {(() => {
                        const selAdapter = getAdapter(credForm.adapter_id);
                        const sf = selAdapter?.supportsFutures ?? selAdapter?.supports_futures;
                        if (!sf) return null;
                        return (<>
                          <div>
                            <label className="font-mono text-[8px] text-[#5a7090] uppercase tracking-widest block mb-1">Futures Base URL</label>
                            <input value={credForm.futures_base_url} onChange={(e) => setCredForm((f) => ({ ...f, futures_base_url: e.target.value }))} placeholder="https://fapi.binance.com/fapi" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-2.5 py-1.5 text-[10px] text-[#e8edf3] placeholder:text-[#3a5068] font-mono focus:outline-none focus:border-[#253550]" />
                          </div>
                          <div>
                            <label className="font-mono text-[8px] text-[#5a7090] uppercase tracking-widest block mb-1">Futures Sandbox Base URL</label>
                            <input value={credForm.futures_sandbox_base_url} onChange={(e) => setCredForm((f) => ({ ...f, futures_sandbox_base_url: e.target.value }))} placeholder="https://testnet.binancefuture.com/fapi" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-2.5 py-1.5 text-[10px] text-[#e8edf3] placeholder:text-[#3a5068] font-mono focus:outline-none focus:border-[#253550]" />
                          </div>
                        </>);
                      })()}
                      <div>
                        <label className="font-mono text-[8px] text-[#5a7090] uppercase tracking-widest block mb-1">Rate Limit Orders (/min)</label>
                        <input type="number" value={credForm.rate_limit_orders} onChange={(e) => setCredForm((f) => ({ ...f, rate_limit_orders: e.target.value }))} placeholder="Default" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-2.5 py-1.5 text-[10px] text-[#e8edf3] placeholder:text-[#3a5068] font-mono focus:outline-none focus:border-[#253550]" />
                      </div>
                      <div>
                        <label className="font-mono text-[8px] text-[#5a7090] uppercase tracking-widest block mb-1">Rate Limit Queries (/min)</label>
                        <input type="number" value={credForm.rate_limit_queries} onChange={(e) => setCredForm((f) => ({ ...f, rate_limit_queries: e.target.value }))} placeholder="Default" className="w-full bg-[#131920] border border-[#1e2d40] rounded-sm px-2.5 py-1.5 text-[10px] text-[#e8edf3] placeholder:text-[#3a5068] font-mono focus:outline-none focus:border-[#253550]" />
                      </div>
                    </div>
                    <div className="font-mono text-[8px] text-[#3a5068]">
                      Empty fields inherit from the platform adapter defaults shown above.
                    </div>
                  </div>
                )}
              </div>

              {credError && (
                <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2">{credError}</div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-[#1e2d40] flex gap-2.5 justify-end sticky bottom-0 bg-[#0d1117]">
              <button onClick={() => setCredModal(null)} disabled={credSaving} className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-[#1e2d40] hover:border-[#253550] hover:text-[#e8edf3] transition-all">Cancel</button>
              <button onClick={handleSaveCred} disabled={credSaving} className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#3d9df3] text-white hover:bg-[#5aacf5] transition-all disabled:opacity-50">
                {credSaving ? "Saving..." : credModal.cred ? "Update" : "Add Credential"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Credential Row Component ────────────────────────────────────

function CredentialRow({
  cred, saId, adapterName, adapter, onEdit, onDelete, onToggleStatus,
}: {
  cred: Credential;
  saId: string;
  adapterName: string;
  adapter: Adapter | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}) {
  const [showOverrides, setShowOverrides] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const overrides = cred.config_overrides || {};
  const hasOverrides = Object.values(overrides).some((v) => v !== undefined && v !== null && v !== "");

  return (
    <div className="px-4 py-3 border-b border-[#1e2d40]/40 last:border-b-0 hover:bg-[#0d1117]/50 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          {/* Header line */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${credStatusDot(cred.status)}`} />
            <span className="text-[11px] text-[#e8edf3] font-medium">{adapterName}</span>
            <span className="font-mono text-[9px] text-[#5a7090]">{cred.label || "—"}</span>
            {cred.is_sandbox && (
              <span className="px-1 py-0.5 rounded-sm bg-[rgba(245,166,35,0.12)] text-[#f5a623] font-mono text-[7px] font-bold uppercase">Sandbox</span>
            )}
            <span className={`px-1 py-0.5 rounded-sm font-mono text-[7px] font-bold uppercase ${credStatusColor(cred.status)}`}>
              {cred.status}
            </span>
            {hasOverrides && (
              <span className="px-1 py-0.5 rounded-sm bg-[rgba(168,85,247,0.12)] text-[#a855f7] font-mono text-[7px] font-bold uppercase">
                Overrides
              </span>
            )}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-1">
            <div>
              <span className="font-mono text-[8px] text-[#3a5068] uppercase">Auth Model</span>
              <div className="font-mono text-[10px] text-[#8fa3b8] mt-0.5">{cred.auth_model}</div>
            </div>
            <div>
              <span className="font-mono text-[8px] text-[#3a5068] uppercase">Permissions</span>
              <div className="flex gap-1 mt-0.5">
                {(cred.permissions || []).map((p) => (
                  <span key={p} className="px-1 py-0.5 rounded-sm bg-[rgba(90,112,144,0.12)] text-[#8fa3b8] font-mono text-[7px] uppercase">{p}</span>
                ))}
              </div>
            </div>
            <div>
              <span className="font-mono text-[8px] text-[#3a5068] uppercase">Last Used</span>
              <div className="font-mono text-[10px] text-[#8fa3b8] mt-0.5">{cred.last_used_at ? formatDate(cred.last_used_at) : "Never"}</div>
            </div>
          </div>

          {/* Config overrides detail */}
          {hasOverrides && (
            <div className="mt-2">
              <button
                onClick={() => setShowOverrides(!showOverrides)}
                className="font-mono text-[8px] text-[#a855f7] hover:text-[#c084fc] transition-colors flex items-center gap-1"
              >
                <svg className={`w-2.5 h-2.5 transition-transform ${showOverrides ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                CONFIG OVERRIDES
              </button>
              {showOverrides && (
                <div className="mt-1.5 pl-3.5 grid grid-cols-2 gap-x-6 gap-y-0.5 font-mono text-[9px]">
                  {(() => {
                    const n = adapter ? {
                      baseUrl: adapter.baseUrl ?? adapter.base_url ?? null,
                      rateLimitOrders: adapter.rateLimitOrders ?? adapter.rate_limit_orders ?? 0,
                      rateLimitQueries: adapter.rateLimitQueries ?? adapter.rate_limit_queries ?? 0,
                    } : null;
                    return (<>
                      {overrides.base_url && (
                        <div className="text-[#5a7090]">Base URL: <span className="text-[#a855f7]">{overrides.base_url}</span>
                          {n?.baseUrl && <span className="text-[#3a5068] ml-1">(was: {n.baseUrl})</span>}
                        </div>
                      )}
                      {overrides.ws_url && (
                        <div className="text-[#5a7090]">WS URL: <span className="text-[#a855f7]">{overrides.ws_url}</span></div>
                      )}
                      {overrides.sandbox_base_url && (
                        <div className="text-[#5a7090]">Sandbox: <span className="text-[#a855f7]">{overrides.sandbox_base_url}</span></div>
                      )}
                      {overrides.sandbox_ws_url && (
                        <div className="text-[#5a7090]">Sandbox WS: <span className="text-[#a855f7]">{overrides.sandbox_ws_url}</span></div>
                      )}
                      {overrides.rate_limit_orders && (
                        <div className="text-[#5a7090]">Rate Orders: <span className="text-[#a855f7]">{overrides.rate_limit_orders}/min</span>
                          {n && <span className="text-[#3a5068] ml-1">(was: {n.rateLimitOrders})</span>}
                        </div>
                      )}
                      {overrides.rate_limit_queries && (
                        <div className="text-[#5a7090]">Rate Queries: <span className="text-[#a855f7]">{overrides.rate_limit_queries}/min</span>
                          {n && <span className="text-[#3a5068] ml-1">(was: {n.rateLimitQueries})</span>}
                        </div>
                      )}
                    </>);
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button onClick={onEdit} className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[7px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all">
            Edit
          </button>
          <button
            onClick={onToggleStatus}
            className={`px-2 py-1 rounded border font-mono text-[7px] font-semibold uppercase tracking-wide transition-all ${
              cred.status === "active"
                ? "border-[rgba(255,71,87,0.25)] text-[#ff4757] hover:bg-[rgba(255,71,87,0.08)]"
                : "border-[rgba(255,215,0,0.25)] text-[#FFD700] hover:bg-[rgba(255,215,0,0.08)]"
            }`}
          >
            {cred.status === "active" ? "Revoke" : "Activate"}
          </button>
          {confirmDelete ? (
            <div className="flex gap-0.5">
              <button onClick={onDelete} className="px-1.5 py-1 rounded border border-[rgba(255,71,87,0.3)] bg-[rgba(255,71,87,0.08)] text-[#ff4757] font-mono text-[7px] font-semibold uppercase hover:bg-[#ff4757] hover:text-white transition-all">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="px-1.5 py-1 rounded border border-[#1e2d40] text-[#5a7090] font-mono text-[7px] font-semibold uppercase hover:text-[#8fa3b8] transition-all">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#5a7090] font-mono text-[7px] font-semibold uppercase tracking-wide hover:border-[rgba(255,71,87,0.3)] hover:text-[#ff4757] transition-all">
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function ToggleSwitch({ checked: rawChecked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const checked = !!rawChecked;
  return (
    <label className="relative w-9 h-5 flex-shrink-0 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="opacity-0 w-0 h-0" />
      <span className={`absolute inset-0 rounded-full border transition-all duration-200 ${checked ? "bg-[rgba(255,215,0,0.10)] border-[rgba(255,215,0,0.4)]" : "bg-[#1a2230] border-[#253550]"}`}>
        <span className={`absolute h-3.5 w-3.5 rounded-full transition-all duration-200 left-0.5 top-0.5 ${checked ? "translate-x-4 bg-[#FFD700]" : "translate-x-0 bg-[#5a7090]"}`} />
      </span>
    </label>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function typeColor(type: string): string {
  switch (type) {
    case "system": return "bg-[rgba(61,157,243,0.12)] text-[#3d9df3]";
    case "demo": return "bg-[rgba(245,166,35,0.12)] text-[#f5a623]";
    case "admin_managed": return "bg-[rgba(168,85,247,0.12)] text-[#a855f7]";
    default: return "bg-[rgba(90,112,144,0.12)] text-[#5a7090]";
  }
}

function credStatusColor(status: string): string {
  switch (status) {
    case "active": return "bg-[rgba(0,229,160,0.12)] text-[#00e5a0]";
    case "pending_validation": return "bg-[rgba(245,166,35,0.12)] text-[#f5a623]";
    case "expired": return "bg-[rgba(90,112,144,0.12)] text-[#5a7090]";
    case "revoked": case "failed_validation": return "bg-[rgba(255,71,87,0.12)] text-[#ff4757]";
    default: return "bg-[rgba(90,112,144,0.12)] text-[#5a7090]";
  }
}

function credStatusDot(status: string): string {
  switch (status) {
    case "active": return "bg-[#00e5a0]";
    case "pending_validation": return "bg-[#f5a623]";
    case "revoked": case "failed_validation": return "bg-[#ff4757]";
    default: return "bg-[#5a7090]";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
