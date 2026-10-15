"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getBotLogs } from "@/lib/tradingEngineApi";

interface BotLogEntry {
  id: string;
  bot_id: string;
  level: string;
  category: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

type LevelFilter = "ALL" | "INFO" | "WARNING" | "ERROR";

const LEVEL_COLORS: Record<string, string> = {
  debug: "#5a7090",
  info: "#00e5a0",
  warning: "#f5a623",
  error: "#ff4757",
};

const CATEGORY_COLORS: Record<string, string> = {
  lifecycle: "#3d9df3",
  signal: "#a78bfa",
  trade: "#00e5a0",
  exit: "#f5a623",
  risk: "#ff4757",
  error: "#ff4757",
  system: "#5a7090",
};

const MAX_CLIENT_LOGS = 500;

export default function BotLogPanel({
  botId,
  channelEvents,
}: {
  botId: string;
  channelEvents?: BotLogEntry[];
}) {
  const [logs, setLogs] = useState<BotLogEntry[]>([]);
  const [filter, setFilter] = useState<LevelFilter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initial REST load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getBotLogs(botId, { limit: 100 });
      if (!cancelled && res.data) {
        // API returns DESC order, reverse so oldest first for chronological display
        setLogs((res.data as BotLogEntry[]).reverse());
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [botId]);

  // Live WS append — only process NEW events (channelEvents grows cumulatively)
  const lastProcessedCount = useRef(0);
  useEffect(() => {
    if (!channelEvents || channelEvents.length === 0) return;
    const newEvents = channelEvents.slice(lastProcessedCount.current);
    lastProcessedCount.current = channelEvents.length;
    if (newEvents.length === 0) return;
    setLogs((prev) => {
      const merged = [...prev, ...newEvents];
      return merged.length > MAX_CLIENT_LOGS
        ? merged.slice(merged.length - MAX_CLIENT_LOGS)
        : merged;
    });
  }, [channelEvents]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const filtered = filter === "ALL"
    ? logs
    : logs.filter((l) => l.level.toUpperCase() === filter.toLowerCase() ||
        (filter === "ERROR" && l.level === "error") ||
        (filter === "WARNING" && l.level === "warning") ||
        (filter === "INFO" && l.level === "info"));

  const filters: LevelFilter[] = ["ALL", "INFO", "WARNING", "ERROR"];

  return (
    <div className="bg-[#0d1117] border border-[#1e2d40] rounded-md overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-2 border-b border-[#1e2d40] flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">
          Bot Logs
        </span>
        <div className="flex items-center gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-wider border transition-all ${
                filter === f
                  ? "bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border-[rgba(61,157,243,0.35)]"
                  : "bg-transparent text-[#5a7090] border-[#1e2d40] hover:text-[#e8edf3] hover:border-[#253550]"
              }`}
            >
              {f}
            </button>
          ))}
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (containerRef.current) {
                  containerRef.current.scrollTop = containerRef.current.scrollHeight;
                }
              }}
              className="ml-1 px-2 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-wider bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border border-[rgba(61,157,243,0.35)]"
            >
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto min-h-[200px] max-h-[400px]"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#253550 #0d1117" }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#3d9df3]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-[11px] text-[#5a7090]">
            No log entries
          </div>
        ) : (
          <div className="divide-y divide-[#1e2d40]/50">
            {filtered.map((entry) => (
              <div key={entry.id} className="group">
                <div
                  className="px-4 py-1.5 flex items-start gap-3 hover:bg-[#131920] transition-colors cursor-pointer"
                  onClick={() =>
                    setExpandedId(expandedId === entry.id ? null : entry.id)
                  }
                >
                  {/* Timestamp */}
                  <span className="font-mono text-[10px] text-[#5a7090] shrink-0 pt-px">
                    {formatTime(entry.created_at)}
                  </span>

                  {/* Level indicator */}
                  <span
                    className="font-mono text-[9px] font-bold uppercase tracking-wider shrink-0 w-[38px] text-center pt-px"
                    style={{ color: LEVEL_COLORS[entry.level] || "#5a7090" }}
                  >
                    {entry.level === "warning" ? "WARN" : entry.level.toUpperCase()}
                  </span>

                  {/* Category badge */}
                  <span
                    className="shrink-0 px-1.5 py-px rounded-sm text-[8px] font-bold uppercase tracking-widest"
                    style={{
                      color: CATEGORY_COLORS[entry.category] || "#5a7090",
                      backgroundColor: `${CATEGORY_COLORS[entry.category] || "#5a7090"}18`,
                    }}
                  >
                    {entry.category}
                  </span>

                  {/* Message */}
                  <span className="font-mono text-[11px] text-[#c9d1d9] flex-1 break-words">
                    {entry.message}
                  </span>

                  {/* Expand indicator for metadata */}
                  {entry.metadata &&
                    Object.keys(entry.metadata).length > 0 && (
                      <span className="text-[#5a7090] text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {expandedId === entry.id ? "▼" : "▶"}
                      </span>
                    )}
                </div>

                {/* Expanded metadata */}
                {expandedId === entry.id &&
                  entry.metadata &&
                  Object.keys(entry.metadata).length > 0 && (
                    <div className="px-4 pb-2 pl-[140px]">
                      <pre className="font-mono text-[10px] text-[#8fa3b8] bg-[#080c10] rounded-sm px-3 py-2 overflow-x-auto border border-[#1e2d40]/50">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}
