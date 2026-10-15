"use client";

import { useQuery } from "@tanstack/react-query";
import { listBots } from "@/lib/tradingEngineApi";
import type { BotListFilters } from "@/lib/tradingEngineApi";
import { listStrategies, getInfraMetrics, getServiceHealth, getExchangeHealth, listServiceAccounts, listAdapters } from "@/lib/tradingEngineApi";
import { getAlerts, getInfrastructureStatus } from "@/lib/stellaAdminApi";
import { mapApiBotToUiBot, mapApiAlertToUiAlert } from "@/lib/api/mappers";
import type { Bot, Alert } from "@/lib/types/dashboard";
import type { Strategy } from "@/lib/types/strategy";

// ── Query Keys ──────────────────────────────────────────────────────────
export const queryKeys = {
  bots: (filters?: BotListFilters) => ["bots", filters ?? {}] as const,
  strategies: () => ["strategies"] as const,
  alerts: (params?: { limit?: number }) => ["alerts", params ?? {}] as const,
  infraMetrics: () => ["infra-metrics"] as const,
  serviceHealth: () => ["service-health"] as const,
  exchangeHealth: () => ["exchange-health"] as const,
  coolifyStatus: () => ["coolify-status"] as const,
  serviceAccounts: () => ["service-accounts"] as const,
  adapters: () => ["adapters"] as const,
};

// ── Hooks ───────────────────────────────────────────────────────────────

/** Fetch bots with optional filters, auto-maps to UI types */
export function useBots(filters?: BotListFilters) {
  return useQuery({
    queryKey: queryKeys.bots(filters),
    queryFn: async () => {
      const result = await listBots(filters);
      const raw = result.data as any;
      const botsArr = Array.isArray(raw)
        ? raw
        : raw?.bots && Array.isArray(raw.bots)
          ? raw.bots
          : [];
      return {
        bots: botsArr.map(mapApiBotToUiBot) as Bot[],
        totalCount: raw?.total_count ?? botsArr.length,
        totalPages: raw?.total_pages ?? 1,
        runningBots: raw?.running_bots ?? 0,
        totalPnl: raw?.total_pnl ?? 0,
      };
    },
    staleTime: 15 * 1000, // Bots update via WS, REST is fallback
  });
}

/** Fetch strategies */
export function useStrategies() {
  return useQuery({
    queryKey: queryKeys.strategies(),
    queryFn: async () => {
      const result = await listStrategies();
      if (result.data && Array.isArray(result.data)) {
        return result.data as Strategy[];
      }
      return [] as Strategy[];
    },
    staleTime: 60 * 1000, // Strategies change infrequently
  });
}

/** Fetch alerts */
export function useAlerts(params?: { limit?: number }) {
  return useQuery({
    queryKey: queryKeys.alerts(params),
    queryFn: async () => {
      const result = await getAlerts(params);
      if (result.data && Array.isArray(result.data)) {
        return result.data.map(mapApiAlertToUiAlert) as Alert[];
      }
      return [] as Alert[];
    },
    staleTime: 10 * 1000, // Alerts refresh frequently
  });
}

/** Fetch infrastructure metrics from trading engine */
export function useInfraMetrics() {
  return useQuery({
    queryKey: queryKeys.infraMetrics(),
    queryFn: async () => {
      const result = await getInfraMetrics();
      return result.data ?? null;
    },
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000, // Poll every 30s as fallback
  });
}

/** Fetch service health */
export function useServiceHealth() {
  return useQuery({
    queryKey: queryKeys.serviceHealth(),
    queryFn: async () => {
      const result = await getServiceHealth();
      return result.data ?? null;
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/** Fetch exchange health */
export function useExchangeHealth() {
  return useQuery({
    queryKey: queryKeys.exchangeHealth(),
    queryFn: async () => {
      const result = await getExchangeHealth();
      return result.data ?? null;
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/** Fetch Coolify infrastructure status */
export function useCoolifyStatus() {
  return useQuery({
    queryKey: queryKeys.coolifyStatus(),
    queryFn: async () => {
      const result = await getInfrastructureStatus();
      const body = result.data as any;
      if (body?.services && Array.isArray(body.services)) {
        return body.services;
      }
      return [];
    },
    staleTime: 25 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/** Fetch service accounts */
export function useServiceAccounts() {
  return useQuery({
    queryKey: queryKeys.serviceAccounts(),
    queryFn: async () => {
      const result = await listServiceAccounts();
      return result.data ?? [];
    },
    staleTime: 60 * 1000,
  });
}

/** Fetch exchange adapters */
export function useAdapters() {
  return useQuery({
    queryKey: queryKeys.adapters(),
    queryFn: async () => {
      const result = await listAdapters();
      return result.data ?? [];
    },
    staleTime: 60 * 1000,
  });
}
