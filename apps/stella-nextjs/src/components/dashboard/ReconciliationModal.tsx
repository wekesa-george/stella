'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  getReconciliationSummary,
  getReconciliationPositions,
  getReconciliationOrders,
  getReconciliationBalances,
  cancelOrphanOrders,
  cleanStaleOrders,
  runSyncNow,
  recoverOrphanOrders,
} from '@/lib/tradingEngineApi';

type Tab = 'positions' | 'orders' | 'balances';

interface CredentialInfo {
  name: string;
  sandbox: boolean;
}

interface ReconciliationModalProps {
  onClose: () => void;
  /** If provided, filter to only this credential */
  credentialId?: string;
  /** Display name for the filtered credential (e.g. "Binance") */
  credentialName?: string;
  /** Whether the credential is a sandbox */
  credentialSandbox?: boolean;
  /** Map of credential ID → display info for all known credentials */
  credentialMap?: Record<string, CredentialInfo>;
}

export default function ReconciliationModal({ onClose, credentialId, credentialName, credentialSandbox, credentialMap }: ReconciliationModalProps) {
  const [tab, setTab] = useState<Tab>('positions');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posData, setPosData] = useState<any>(null);
  const [ordData, setOrdData] = useState<any>(null);
  const [balData, setBalData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const summaryRef = useRef<any>(null);
  const mountedRef = useRef(false);

  // Helper to filter reconciliation data by credential_id when filtering to a single credential
  const filterByCredential = useCallback((data: any) => {
    if (!credentialId || !data) return data;
    const filtered = { ...data };
    // Filter array fields that contain credential-specific items
    for (const key of ['orphaned_exchange', 'orphaned_db', 'drifted', 'matched', 'missing_db', 'stale_exchange', 'status_mismatch']) {
      if (Array.isArray(filtered[key])) {
        filtered[key] = filtered[key].filter((item: any) => item.credential_id === credentialId);
      }
    }
    // Filter balances array and inject display name
    if (Array.isArray(filtered.balances)) {
      filtered.balances = filtered.balances
        .filter((b: any) => b.credential_id === credentialId)
        .map((b: any) => ({
          ...b,
          exchange_name: b.exchange_name || credentialName || b.adapter_name,
          is_sandbox: b.is_sandbox ?? credentialSandbox ?? false,
        }));
    }
    // Filter errors
    if (Array.isArray(filtered.errors)) {
      filtered.errors = filtered.errors.filter((e: any) => e.credential_id === credentialId);
    }
    // Recount totals if present
    if (filtered.totals) {
      filtered.totals = {
        matched: filtered.matched?.length ?? filtered.totals.matched,
        orphaned_exchange: filtered.orphaned_exchange?.length ?? filtered.totals.orphaned_exchange,
        orphaned_db: filtered.orphaned_db?.length ?? filtered.totals.orphaned_db,
        drifted: filtered.drifted?.length ?? filtered.totals.drifted,
        missing_db: filtered.missing_db?.length ?? filtered.totals.missing_db,
        stale_exchange: filtered.stale_exchange?.length ?? filtered.totals.stale_exchange,
        status_mismatch: filtered.status_mismatch?.length ?? filtered.totals.status_mismatch,
      };
    }
    return filtered;
  }, [credentialId]);

  const fetchTab = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      if (!summaryRef.current) {
        const s = await getReconciliationSummary();
        if (s?.data) {
          summaryRef.current = s.data;
          setSummary(s.data);
        }
      }
      if (t === 'positions') {
        const r = await getReconciliationPositions();
        if (r?.error) throw new Error(r.error);
        setPosData(filterByCredential(r?.data));
      } else if (t === 'orders') {
        const r = await getReconciliationOrders();
        if (r?.error) throw new Error(r.error);
        setOrdData(filterByCredential(r?.data));
      } else if (t === 'balances') {
        const r = await getReconciliationBalances();
        if (r?.error) throw new Error(r.error);
        setBalData(filterByCredential(r?.data));
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [filterByCredential]);

  const handleTabSwitch = useCallback((t: Tab) => {
    setTab(t);
    const cached = t === 'positions' ? posData : t === 'orders' ? ordData : balData;
    if (!cached) fetchTab(t);
  }, [posData, ordData, balData, fetchTab]);

  // Fetch on mount — deferred to avoid state updates during parent render
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      // Use setTimeout to ensure we're fully outside the render cycle
      const id = setTimeout(() => fetchTab('positions'), 0);
      return () => clearTimeout(id);
    }
  }, [fetchTab]);

  const data = tab === 'positions' ? posData : tab === 'orders' ? ordData : balData;

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  }, [onClose]);

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg1)', border: '1px solid var(--b2)', borderRadius: 6,
          width: 'min(900px, 94vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--b2)',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--t0)' }}>
              Platform Reconciliation
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t2)', marginTop: 2 }}>
              Exchange vs Local DB — {credentialId ? `${credentialName || 'Selected Credential'}${credentialSandbox ? ' (Sandbox)' : ''}` : 'All Futures Credentials'}
              {summary && ` — ${credentialId ? '1' : summary.credentials || 0} credential(s)`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => fetchTab(tab)}
              disabled={loading}
              style={{
                background: 'none', border: '1px solid var(--b2)', borderRadius: 3,
                color: 'var(--t1)', cursor: loading ? 'default' : 'pointer',
                fontFamily: 'var(--mono)', fontSize: 9, padding: '4px 8px',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? 'CHECKING...' : 'REFRESH'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer',
                fontSize: 18, lineHeight: 1, padding: '0 4px',
              }}
            >
              x
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {summary && (
          <div style={{
            display: 'flex', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--b1)',
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t2)',
          }}>
            <span>DB Open Positions: <b style={{ color: 'var(--t0)' }}>{summary.db_open_positions}</b></span>
            <span>DB Open Orders: <b style={{ color: 'var(--t0)' }}>{summary.db_open_orders}</b></span>
            <span>Reconciler: <b style={{ color: summary.position_reconciler?.status === 'clean' ? 'var(--g)' : 'var(--y)' }}>
              {summary.position_reconciler?.status || '—'}
            </b></span>
            <span>Ghosts Found: <b style={{ color: (summary.position_reconciler?.ghosts_found_total || 0) > 0 ? 'var(--r)' : 'var(--t0)' }}>
              {summary.position_reconciler?.ghosts_found_total || 0}
            </b></span>
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--b1)', padding: '0 16px',
        }}>
          {(['positions', 'orders', 'balances'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => handleTabSwitch(t)}
              style={{
                background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--a)' : '2px solid transparent',
                color: tab === t ? 'var(--t0)' : 'var(--t2)', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                padding: '8px 16px', textTransform: 'uppercase',
              }}
            >
              {t}
              {t === 'positions' && posData && (
                <span style={{ marginLeft: 4, fontSize: 8, color: 'var(--t3)' }}>
                  ({(posData.totals?.orphaned_exchange || 0) + (posData.totals?.orphaned_db || 0) + (posData.totals?.drifted || 0)} issues)
                </span>
              )}
              {t === 'orders' && ordData && (
                <span style={{ marginLeft: 4, fontSize: 8, color: 'var(--t3)' }}>
                  ({(ordData.totals?.stale_exchange || 0) + (ordData.totals?.missing_db || 0) + (ordData.totals?.status_mismatch || 0)} issues)
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)', textAlign: 'center', padding: 32 }}>
              Reconciling with exchange... This may take 10-30 seconds.
            </div>
          ) : error ? (
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--r)', textAlign: 'center', padding: 32,
              background: 'rgba(255,71,87,0.05)', borderRadius: 4,
            }}>
              {error}
            </div>
          ) : tab === 'positions' && posData ? (
            <PositionsTab data={posData} credentialMap={credentialMap} />
          ) : tab === 'orders' && ordData ? (
            <OrdersTab data={ordData} credentialMap={credentialMap} onRefresh={() => fetchTab('orders')} />
          ) : tab === 'balances' && balData ? (
            <BalancesTab data={balData} credentialMap={credentialMap} />
          ) : (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)', textAlign: 'center', padding: 32 }}>
              Click REFRESH to load data
            </div>
          )}
        </div>

        {/* Footer */}
        {data && (
          <div style={{
            padding: '8px 16px', borderTop: '1px solid var(--b1)',
            fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--t3)',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Checked: {data.checked_at ? new Date(data.checked_at).toLocaleTimeString() : '—'}</span>
            <span>Elapsed: {data.elapsed_ms ?? '—'}ms</span>
            <span>Credentials: {data.credentials_checked ?? '—'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── POSITIONS TAB ── */
function PositionsTab({ data, credentialMap }: { data: any; credentialMap?: Record<string, CredentialInfo> }) {
  const totals = data.totals || {};
  const sections: { key: string; label: string; color: string; items: any[] }[] = [
    { key: 'orphaned_exchange', label: 'Orphaned on Exchange (no DB / no bot)', color: 'var(--r)', items: data.orphaned_exchange || [] },
    { key: 'drifted', label: 'Quantity Drift (exchange != DB)', color: 'var(--y)', items: data.drifted || [] },
    { key: 'orphaned_db', label: 'Orphaned in DB (not on exchange)', color: 'var(--o, #ff9800)', items: data.orphaned_db || [] },
    { key: 'matched', label: 'Matched (exchange = DB)', color: 'var(--g)', items: data.matched || [] },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Totals row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Matched', value: totals.matched || 0, color: 'var(--g)' },
          { label: 'Orphaned Exchange', value: totals.orphaned_exchange || 0, color: 'var(--r)' },
          { label: 'Orphaned DB', value: totals.orphaned_db || 0, color: 'var(--o, #ff9800)' },
          { label: 'Drifted', value: totals.drifted || 0, color: 'var(--y)' },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, minWidth: 100, padding: '8px 12px', background: 'var(--bg2)',
            border: '1px solid var(--b2)', borderRadius: 4, fontFamily: 'var(--mono)',
          }}>
            <div style={{ fontSize: 8, color: 'var(--t2)', marginBottom: 2 }}>{t.label.toUpperCase()}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.value > 0 && t.color !== 'var(--g)' ? t.color : 'var(--t0)' }}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* Sections */}
      {sections.map(sec => sec.items.length > 0 && (
        <div key={sec.key}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: sec.color,
            marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sec.color, display: 'inline-block' }} />
            {sec.label} ({sec.items.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--b2)' }}>
                  <th style={th}>Symbol</th>
                  <th style={th}>Side</th>
                  <th style={th}>Qty (Exchange)</th>
                  <th style={th}>Qty (DB)</th>
                  <th style={th}>Entry</th>
                  <th style={th}>PnL</th>
                  <th style={th}>Lev</th>
                  <th style={th}>Bot</th>
                  <th style={th}>Type</th>
                </tr>
              </thead>
              <tbody>
                {sec.items.map((p: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--b1)' }}>
                    <td style={td}>{p.symbol}</td>
                    <td style={{ ...td, color: (p.exchange_side || p.db_side || '').includes('SHORT') ? 'var(--r)' : 'var(--g)' }}>
                      {p.exchange_side || p.db_side || '—'}
                    </td>
                    <td style={td}>{p.exchange_quantity != null ? Number(p.exchange_quantity).toFixed(4) : '—'}</td>
                    <td style={td}>{p.db_quantity != null ? Number(p.db_quantity).toFixed(4) : '—'}</td>
                    <td style={td}>${Number(p.entry_price || 0).toFixed(2)}</td>
                    <td style={{ ...td, color: (p.unrealized_pnl || 0) >= 0 ? 'var(--g)' : 'var(--r)' }}>
                      {p.unrealized_pnl != null ? `$${Number(p.unrealized_pnl).toFixed(2)}` : '—'}
                    </td>
                    <td style={td}>{p.leverage || '—'}</td>
                    <td style={td}>{p.bot_id ? String(p.bot_id).slice(0, 8) : p.has_running_bot ? 'running' : '—'}</td>
                    <td style={{ ...td, color: sec.color }}>{p.orphan_type || p.status || (p.drift_pct ? `${p.drift_pct}%` : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {data.errors?.length > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--r)', marginTop: 8 }}>
          Errors: {data.errors.map((e: any, i: number) => (
            <div key={i}>{e.exchange_name || e.adapter_name || e.label || credentialMap?.[e.credential_id]?.name || e.credential_id?.slice(0, 8)}: {e.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── ORDERS TAB ── */
function OrdersTab({ data, credentialMap, onRefresh }: { data: any; credentialMap?: Record<string, CredentialInfo>; onRefresh?: () => void }) {
  const totals = data.totals || {};
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<any>(null);

  const handleCancelOrphans = async () => {
    if (!confirm(`Cancel ${totals.missing_db || 0} orphan orders on exchange?`)) return;
    setActionLoading('cancel');
    setActionResult(null);
    try {
      const res = await cancelOrphanOrders();
      const body = (res.data as any)?.data ?? res.data;
      setActionResult({ type: 'cancel', ...body });
      onRefresh?.();
    } catch (e: any) {
      setActionResult({ type: 'cancel', error: e.message || 'Failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanStale = async () => {
    if (!confirm(`Mark ${totals.stale_exchange || 0} stale DB orders as cancelled?`)) return;
    setActionLoading('clean');
    setActionResult(null);
    try {
      const res = await cleanStaleOrders();
      const body = (res.data as any)?.data ?? res.data;
      setActionResult({ type: 'clean', ...body });
      onRefresh?.();
    } catch (e: any) {
      setActionResult({ type: 'clean', error: e.message || 'Failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncNow = async () => {
    setActionLoading('sync');
    setActionResult(null);
    try {
      const res = await runSyncNow();
      const body = (res.data as any)?.data ?? res.data;
      const anomalyCount = body?.anomalies?.length ?? 0;
      setActionResult({ type: 'sync', message: `Sync complete. ${anomalyCount} anomalies found.`, ...body });
      onRefresh?.();
    } catch (e: any) {
      setActionResult({ type: 'sync', error: e.message || 'Sync failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecoverOrders = async () => {
    if (!confirm('Recover exchange orders back to DB? Only orders from running bots within their grid range will be recovered.')) return;
    setActionLoading('recover');
    setActionResult(null);
    try {
      const res = await recoverOrphanOrders();
      const body = (res.data as any)?.data ?? res.data;
      setActionResult({ type: 'recover', ...body });
      onRefresh?.();
    } catch (e: any) {
      setActionResult({ type: 'recover', error: e.message || 'Recovery failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const sections = [
    { key: 'missing_db', label: 'On Exchange but Missing in DB', color: 'var(--r)', items: data.missing_db || [] },
    { key: 'stale_exchange', label: 'In DB but Gone from Exchange', color: 'var(--y)', items: data.stale_exchange || [] },
    { key: 'status_mismatch', label: 'Status Mismatch', color: 'var(--o, #ff9800)', items: data.status_mismatch || [] },
    { key: 'matched', label: 'Matched', color: 'var(--g)', items: data.matched || [] },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(totals.missing_db || 0) > 0 && (
          <button
            onClick={handleCancelOrphans}
            disabled={!!actionLoading}
            style={{
              padding: '6px 14px', borderRadius: 4, border: '1px solid var(--r)',
              background: 'rgba(255,71,87,0.1)', color: 'var(--r)', fontFamily: 'var(--mono)',
              fontSize: 10, fontWeight: 700, cursor: actionLoading ? 'wait' : 'pointer', opacity: actionLoading ? 0.5 : 1,
            }}
          >
            {actionLoading === 'cancel' ? 'CANCELLING...' : `CANCEL ${totals.missing_db} ORPHANS`}
          </button>
        )}
        {(totals.missing_db || 0) > 0 && (
          <button
            onClick={handleRecoverOrders}
            disabled={!!actionLoading}
            style={{
              padding: '6px 14px', borderRadius: 4, border: '1px solid var(--g, #00e5a0)',
              background: 'rgba(0,229,160,0.1)', color: 'var(--g, #00e5a0)', fontFamily: 'var(--mono)',
              fontSize: 10, fontWeight: 700, cursor: actionLoading ? 'wait' : 'pointer', opacity: actionLoading ? 0.5 : 1,
            }}
          >
            {actionLoading === 'recover' ? 'RECOVERING...' : `RECOVER ${totals.missing_db} ORDERS`}
          </button>
        )}
        {(totals.stale_exchange || 0) > 0 && (
          <button
            onClick={handleCleanStale}
            disabled={!!actionLoading}
            style={{
              padding: '6px 14px', borderRadius: 4, border: '1px solid var(--y)',
              background: 'rgba(255,193,7,0.1)', color: 'var(--y)', fontFamily: 'var(--mono)',
              fontSize: 10, fontWeight: 700, cursor: actionLoading ? 'wait' : 'pointer', opacity: actionLoading ? 0.5 : 1,
            }}
          >
            {actionLoading === 'clean' ? 'CLEANING...' : `CLEAN ${totals.stale_exchange} STALE`}
          </button>
        )}
        <button
          onClick={handleSyncNow}
          disabled={!!actionLoading}
          style={{
            padding: '6px 14px', borderRadius: 4, border: '1px solid var(--cy, #3d9df3)',
            background: 'rgba(61,157,243,0.1)', color: 'var(--cy, #3d9df3)', fontFamily: 'var(--mono)',
            fontSize: 10, fontWeight: 700, cursor: actionLoading ? 'wait' : 'pointer', opacity: actionLoading ? 0.5 : 1,
          }}
        >
          {actionLoading === 'sync' ? 'SYNCING...' : 'SYNC NOW'}
        </button>
      </div>

      {/* Action result banner */}
      {actionResult && (
        <div style={{
          padding: '6px 10px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 10,
          background: actionResult.error ? 'rgba(255,71,87,0.1)' : 'rgba(0,212,170,0.1)',
          border: `1px solid ${actionResult.error ? 'rgba(255,71,87,0.3)' : 'rgba(0,212,170,0.3)'}`,
          color: actionResult.error ? 'var(--r)' : 'var(--g)',
        }}>
          {actionResult.error
            ? `Error: ${actionResult.error}`
            : actionResult.type === 'cancel'
              ? `Cancelled: ${actionResult.cancelled ?? 0} | Failed: ${actionResult.failed ?? 0}`
              : `Cleaned: ${actionResult.cleaned ?? 0} / ${actionResult.total ?? 0}`
          }
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Matched', value: totals.matched || 0, color: 'var(--g)' },
          { label: 'Missing DB', value: totals.missing_db || 0, color: 'var(--r)' },
          { label: 'Stale Exchange', value: totals.stale_exchange || 0, color: 'var(--y)' },
          { label: 'Status Mismatch', value: totals.status_mismatch || 0, color: 'var(--o, #ff9800)' },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, minWidth: 100, padding: '8px 12px', background: 'var(--bg2)',
            border: '1px solid var(--b2)', borderRadius: 4, fontFamily: 'var(--mono)',
          }}>
            <div style={{ fontSize: 8, color: 'var(--t2)', marginBottom: 2 }}>{t.label.toUpperCase()}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.value > 0 && t.color !== 'var(--g)' ? t.color : 'var(--t0)' }}>{t.value}</div>
          </div>
        ))}
      </div>

      {sections.map(sec => sec.items.length > 0 && (
        <div key={sec.key}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: sec.color,
            marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sec.color, display: 'inline-block' }} />
            {sec.label} ({sec.items.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--b2)' }}>
                  <th style={th}>Symbol</th>
                  <th style={th}>Side</th>
                  <th style={th}>Type</th>
                  <th style={th}>Qty</th>
                  <th style={th}>Price</th>
                  <th style={th}>Exchange ID</th>
                  <th style={th}>DB Status</th>
                  <th style={th}>Exchange Status</th>
                  <th style={th}>Bot</th>
                </tr>
              </thead>
              <tbody>
                {sec.items.map((o: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--b1)' }}>
                    <td style={td}>{o.symbol}</td>
                    <td style={{ ...td, color: o.side === 'SELL' ? 'var(--r)' : 'var(--g)' }}>{o.side || '—'}</td>
                    <td style={td}>{o.order_type || '—'}</td>
                    <td style={td}>{o.quantity != null ? Number(o.quantity).toFixed(4) : '—'}</td>
                    <td style={td}>{o.price != null ? `$${Number(o.price).toFixed(2)}` : '—'}</td>
                    <td style={td}>{o.exchange_order_id ? String(o.exchange_order_id).slice(-8) : '—'}</td>
                    <td style={td}>{o.db_status || '—'}</td>
                    <td style={td}>{o.exchange_status || '—'}</td>
                    <td style={td}>{o.bot_id ? String(o.bot_id).slice(0, 8) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {data.errors?.length > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--r)', marginTop: 8 }}>
          Errors: {data.errors.map((e: any, i: number) => (
            <div key={i}>{e.exchange_name || e.adapter_name || e.label || credentialMap?.[e.credential_id]?.name || e.credential_id?.slice(0, 8)}: {e.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── BALANCES TAB ── */
function BalancesTab({ data, credentialMap }: { data: any; credentialMap?: Record<string, CredentialInfo> }) {
  const balances = data.balances || [];

  const resolveCredential = (b: any, i: number) => {
    // Try the map first, then fallback to API fields, then numbered fallback
    const mapped = credentialMap?.[b.credential_id];
    const name = b.exchange_name || b.adapter_name || b.label || mapped?.name || `Credential ${i + 1}`;
    const isSandbox = b.is_sandbox ?? mapped?.sandbox ?? false;
    return { name, isSandbox };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {balances.length === 0 ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)', textAlign: 'center', padding: 24 }}>
          No futures credentials found
        </div>
      ) : balances.map((b: any, i: number) => {
        const { name, isSandbox } = resolveCredential(b, i);
        return (
        <div key={i} style={{
          padding: 12, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 4,
          fontFamily: 'var(--mono)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t0)' }}>
                {name}
              </div>
              {isSandbox && (
                <span style={{
                  fontSize: 7, padding: '1px 4px', borderRadius: 2, fontWeight: 600,
                  background: 'rgba(0,150,255,0.1)', color: 'rgba(100,180,255,1)',
                  border: '1px solid rgba(0,150,255,0.2)',
                }}>SANDBOX</span>
              )}
            </div>
            <div style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 3,
              background: Math.abs(b.drift_pct || 0) > 5 ? 'rgba(255,71,87,0.1)' : 'rgba(0,212,170,0.1)',
              color: Math.abs(b.drift_pct || 0) > 5 ? 'var(--r)' : 'var(--g)',
              border: `1px solid ${Math.abs(b.drift_pct || 0) > 5 ? 'rgba(255,71,87,0.3)' : 'rgba(0,212,170,0.3)'}`,
            }}>
              Drift: {b.drift_pct != null ? `${b.drift_pct > 0 ? '+' : ''}${Number(b.drift_pct).toFixed(1)}%` : '—'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Exchange Wallet', value: `$${Number(b.exchange_wallet_balance || 0).toFixed(2)}` },
              { label: 'Exchange Available', value: `$${Number(b.exchange_available_balance || 0).toFixed(2)}` },
              { label: 'Unrealized PnL', value: `$${Number(b.exchange_unrealized_pnl || 0).toFixed(2)}`, color: (b.exchange_unrealized_pnl || 0) >= 0 ? 'var(--g)' : 'var(--r)' },
              { label: 'Virtual Capital', value: `$${Number(b.virtual_active_capital || 0).toFixed(2)}` },
              { label: 'Drift Amount', value: `$${Number(b.drift_amount || 0).toFixed(2)}`, color: Math.abs(b.drift_amount || 0) > 10 ? 'var(--y)' : undefined },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 8, color: 'var(--t2)', marginBottom: 1 }}>{f.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: f.color || 'var(--t0)' }}>{f.value}</div>
              </div>
            ))}
          </div>
          {b.assets?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
              {b.assets.filter((a: any) => parseFloat(a.wallet_balance || a.walletBalance || '0') > 0.01).map((a: any, j: number) => (
                <span key={j} style={{
                  fontSize: 8, padding: '1px 5px', borderRadius: 2,
                  background: 'var(--bg3)', border: '1px solid var(--b1)', color: 'var(--t1)',
                }}>
                  {a.asset}: {Number(a.wallet_balance || a.walletBalance || 0).toFixed(2)}
                </span>
              ))}
            </div>
          )}
        </div>
        );
      })}

      {data.errors?.length > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--r)', marginTop: 8 }}>
          Errors: {data.errors.map((e: any, i: number) => (
            <div key={i}>{e.exchange_name || e.adapter_name || e.label || credentialMap?.[e.credential_id]?.name || e.credential_id?.slice(0, 8)}: {e.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Shared table styles ── */
const th: React.CSSProperties = {
  textAlign: 'left', padding: '4px 8px', fontSize: 8, fontWeight: 600,
  color: 'var(--t2)', textTransform: 'uppercase', whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '4px 8px', fontSize: 10, color: 'var(--t1)', whiteSpace: 'nowrap',
};
