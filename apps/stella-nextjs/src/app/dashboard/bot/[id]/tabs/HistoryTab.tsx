"use client";

import { useState, useEffect } from "react";
import { getBotPositions, getBotOrders } from "@/lib/tradingEngineApi";

interface ClosedPosition {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  profit_loss: number;
  pnl_pct: number;
  opened_at: string;
  closed_at: string;
}

interface HistoricalOrder {
  id: string;
  symbol: string;
  side: string;
  order_type: string;
  price: number;
  quantity: number;
  status: string;
  created_at: string;
  filled_at: string | null;
}

interface HistoryTabProps {
  botId: string;
}

export default function HistoryTab({ botId }: HistoryTabProps) {
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [orders, setOrders] = useState<HistoricalOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [posRes, ordRes] = await Promise.all([
          getBotPositions(botId),
          getBotOrders(botId),
        ]);

        if (cancelled) return;

        // Filter to closed positions
        if (posRes.data && Array.isArray(posRes.data)) {
          setClosedPositions(
            posRes.data
              .filter((p: any) => p.status === "closed" || p.closed_at)
              .map((p: any) => ({
                id: p.id ?? p.position_id ?? "",
                symbol: p.symbol ?? p.pair ?? "",
                side: (p.side ?? "LONG").toUpperCase(),
                entry_price: Number(p.entry_price ?? 0),
                exit_price: Number(p.exit_price ?? 0),
                quantity: Number(p.quantity ?? p.size ?? 0),
                profit_loss: Number(p.profit_loss ?? p.pnl ?? 0),
                pnl_pct: Number(p.pnl_pct ?? 0),
                opened_at: p.opened_at ?? p.created_at ?? "",
                closed_at: p.closed_at ?? "",
              }))
          );
        }

        if (ordRes.data && Array.isArray(ordRes.data)) {
          setOrders(
            ordRes.data.map((o: any) => ({
              id: o.id ?? o.order_id ?? "",
              symbol: o.symbol ?? "",
              side: (o.side ?? "").toUpperCase(),
              order_type: o.order_type ?? o.type ?? "market",
              price: Number(o.price ?? 0),
              quantity: Number(o.quantity ?? o.amount ?? 0),
              status: o.status ?? "",
              created_at: o.created_at ?? "",
              filled_at: o.filled_at ?? null,
            }))
          );
        }
      } catch (err) {
        console.error("Error loading history:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [botId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FFD700]" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Closed Positions */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
          <span className="text-xs font-semibold text-foreground">Closed Positions</span>
          <span className="text-[10px] text-[#5a7090]">{closedPositions.length} trades</span>
        </div>
        {closedPositions.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-[11px] text-[#5a7090]">
            No closed positions yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-dark">
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Side</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Symbol</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Entry</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Exit</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Size</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">PnL</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Closed</th>
                </tr>
              </thead>
              <tbody>
                {closedPositions.map((p) => (
                  <tr key={p.id} className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors">
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase font-mono ${
                        p.side === "LONG"
                          ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                          : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                      }`}>{p.side}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#e8edf3]">{p.symbol}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{p.entry_price.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{p.exit_price.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{p.quantity}</td>
                    <td className="px-3 py-2 font-mono text-[11px] font-semibold" style={{ color: p.profit_loss >= 0 ? "#00e5a0" : "#ff4757" }}>
                      {p.profit_loss >= 0 ? "+" : ""}${p.profit_loss.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#5a7090]">
                      {p.closed_at ? new Date(p.closed_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order History */}
      <div className="bg-dark-elevated border border-dark rounded-md overflow-hidden">
        <div className="px-3 sm:px-3.5 py-2.5 border-b border-dark flex justify-between items-center">
          <span className="text-xs font-semibold text-foreground">Order History</span>
          <span className="text-[10px] text-[#5a7090]">{orders.length} orders</span>
        </div>
        {orders.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-[11px] text-[#5a7090]">
            No orders yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-dark">
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Side</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Symbol</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Type</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Price</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Qty</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Status</th>
                  <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-1.5 text-left bg-[#131920]">Time</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-dark/50 hover:bg-[#0d1117] transition-colors">
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase font-mono ${
                        o.side === "BUY" || o.side === "LONG"
                          ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                          : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                      }`}>{o.side}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#e8edf3]">{o.symbol}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8] uppercase">{o.order_type}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{o.price.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8fa3b8]">{o.quantity}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${
                        o.status === "filled" ? "text-[#00e5a0]" :
                        o.status === "cancelled" || o.status === "rejected" || o.status === "failed" ? "text-[#ff4757]" :
                        o.status === "pending" || o.status === "open" ? "text-[#3d9df3]" :
                        "text-[#5a7090]"
                      }`}>{o.status}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#5a7090]">
                      {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
