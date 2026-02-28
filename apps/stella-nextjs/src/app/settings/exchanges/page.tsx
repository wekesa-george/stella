"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getSettingsExchanges } from "@/lib/stellaAdminApi";

// ── Types ────────────────────────────────────────────────────────

interface AdapterKpis {
  active: number;
  inactive: number;
  maintenance: number;
  total: number;
}

interface Adapter {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive" | "maintenance" | "deprecated";
  authModel: string;
  supportsSpot: boolean;
  supportsMargin: boolean;
  supportsFutures: boolean;
  supportsOptions: boolean;
  supportsStaking: boolean;
  requiresPlatformAuth: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncPairCount: number | null;
}

// ── Page ─────────────────────────────────────────────────────────

export default function ExchangeAdaptersPage() {
  const router = useRouter();
  const [kpis, setKpis] = useState<AdapterKpis>({ active: 0, inactive: 0, maintenance: 0, total: 0 });
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAdapters = useCallback(async () => {
    setLoading(true);
    const res = await getSettingsExchanges();
    if (res.data) {
      const d = res.data as any;
      setKpis(d.kpis || { active: 0, inactive: 0, maintenance: 0, total: 0 });
      setAdapters(d.adapters || []);
      setError(null);
    } else {
      setError(res.error || "Failed to load adapters");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAdapters(); }, [fetchAdapters]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Page Header */}
      <div className="mb-1">
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Exchange Adapters</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          Configure exchange adapters — status, credentials, trading pairs, and execution capabilities.
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded px-3 py-2">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-[#5a7090] hover:text-[#e8edf3]">&times;</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Active" value={kpis.active} color="#00e5a0" />
        <KpiCard label="Inactive" value={kpis.inactive} color="#5a7090" />
        <KpiCard label="Maintenance" value={kpis.maintenance} color="#3d9df3" />
        <KpiCard label="Total" value={kpis.total} color="#f5a623" />
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-8 font-mono text-[10px] text-[#5a7090]">Loading adapters...</div>
      )}

      {/* Adapter Cards */}
      {!loading && adapters.map((a) => (
        <div
          key={a.id}
          onClick={() => router.push(`/settings/exchanges/${a.id}`)}
          className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden cursor-pointer hover:bg-[#131920] hover:border-[#253550] transition-all"
          style={{ borderTop: `2px solid ${statusColor(a.status)}` }}
        >
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 overflow-hidden relative" style={{ background: `${statusColor(a.status)}18` }}>
                  <Image
                    src={`/exchanges/${a.code}.png`}
                    alt={`${a.name} logo`}
                    width={28}
                    height={28}
                    className="object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      const parent = target.parentElement;
                      if (parent) parent.innerHTML = `<span class="font-mono text-[10px] font-bold" style="color: ${statusColor(a.status)}">${a.code.slice(0, 2).toUpperCase()}</span>`;
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-[#e8edf3]">{a.name}</span>
                    <span className="font-mono text-[9px] text-[#5a7090]">{a.code}</span>
                    <StatusBadge status={a.status} />
                    {a.requiresPlatformAuth && (
                      <span className="px-1.5 py-0.5 rounded-sm bg-[rgba(245,166,35,0.10)] text-[#f5a623] font-mono text-[8px] uppercase tracking-wide font-bold">
                        Auth Required
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[9px] text-[#5a7090] mt-0.5 flex items-center gap-2">
                    <MarketIcons adapter={a} />
                    {a.lastSyncAt && (
                      <>
                        <span className="text-[#253550]">·</span>
                        <span className="text-[#3a5068]">
                          Last sync: {formatDate(a.lastSyncAt)}
                          {a.lastSyncStatus && (
                            <span className={`ml-1 px-1 py-0.5 rounded-sm text-[7px] uppercase font-bold ${
                              a.lastSyncStatus === "success"
                                ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                                : a.lastSyncStatus === "running"
                                ? "bg-[rgba(61,157,243,0.10)] text-[#3d9df3]"
                                : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                            }`}>
                              {a.lastSyncStatus}
                            </span>
                          )}
                          {a.lastSyncPairCount != null && (
                            <span className="ml-1 text-[#5a7090]">({a.lastSyncPairCount} pairs)</span>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span className="font-mono text-[11px] text-[#5a7090]">&#8250;</span>
            </div>
          </div>
        </div>
      ))}

      {!loading && adapters.length === 0 && (
        <div className="text-center py-8 font-mono text-[10px] text-[#5a7090]">No exchange adapters configured.</div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-[#0d1117] border border-[#1e2d40] rounded px-3.5 py-3" style={{ borderTop: `2px solid ${color}` }}>
      <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090] mb-1">{label}</div>
      <div className="font-mono text-[20px] font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

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

function MarketIcons({ adapter: a }: { adapter: Adapter }) {
  const markets = [];
  if (a.supportsSpot) markets.push("Spot");
  if (a.supportsMargin) markets.push("Margin");
  if (a.supportsFutures) markets.push("Futures");
  if (a.supportsOptions) markets.push("Options");
  if (a.supportsStaking) markets.push("Staking");
  if (markets.length === 0) return <span className="text-[#3a5068]">No markets</span>;
  return (
    <span className="flex gap-1">
      {markets.map((m) => (
        <span key={m} className="px-1 py-0 rounded bg-[rgba(90,112,144,0.08)] text-[#8fa3b8] text-[8px] font-mono">{m}</span>
      ))}
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
