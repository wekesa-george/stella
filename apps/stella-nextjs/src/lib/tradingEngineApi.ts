'use server';

import { getAccessToken } from '@logto/next/server-actions';
import { logtoConfig, TRADING_ENGINE_API_RESOURCE } from '@/app/logto';

// Backend base URLs
const BACKENDS = {
  /** Admin Gateway (Phoenix) — WS socket, infra metrics, auth */
  gateway: process.env.ADMIN_GATEWAY_URL || 'http://localhost:4000',
  /** Trade Engine (Bandit) — bots, service accounts, trading, positions */
  engine: process.env.TRADING_ENGINE_API_URL || 'http://localhost:4002',
} as const;

type Backend = keyof typeof BACKENDS;

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getAccessToken(logtoConfig, TRADING_ENGINE_API_RESOURCE);
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  backend: Backend = 'engine',
): Promise<ApiResponse<T>> {
  try {
    const headers = await getAuthHeaders();
    const url = `${BACKENDS[backend]}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) : {};

    if (!response.ok) {
      return {
        error: json.error || json.message || `HTTP ${response.status}`,
        message: json.message,
        statusCode: response.status,
      };
    }

    // Backend endpoints wrap responses in { data: ..., ok: true }.
    // Unwrap so callers get the inner payload directly.
    return { data: json.data !== undefined ? json.data : json };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ==================== AUTH ====================

export async function getTradingEngineHealth() {
  return request('/api/health', {}, 'gateway');
}

export async function getTradingEngineMe() {
  return request('/api/admin/me', {}, 'gateway');
}

// ==================== BOTS API ====================

export async function createBot(config: {
  user_id: string;
  name?: string;
  strategy?: string;
  market_type?: 'spot' | 'usds_futures' | 'coinm_futures' | 'margin';
  [key: string]: any;
}) {
  return request('/api/bots', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export interface BotListFilters {
  status?: string;
  exchange?: string;
  strategy_type?: string;
  user_id?: string;
  search?: string;
  owner_type?: 'user' | 'service_account';
  equity_min?: number;
  equity_max?: number;
  pnl_min?: number;
  pnl_max?: number;
  pnl_preset?: 'profitable' | 'losing' | 'breakeven';
  uptime_min?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export async function listBots(filters?: BotListFilters) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'all') params.set(k, String(v));
    });
  }
  const qs = params.toString();
  return request(`/api/bots${qs ? `?${qs}` : ''}`);
}

export async function listUserBots(userId: string) {
  return request(`/api/bots/user/${userId}`);
}

export async function getBot(botId: string) {
  return request(`/api/bots/${botId}`);
}

export async function getBotConfig(botId: string) {
  return request(`/api/bots/${botId}/config`);
}

export async function updateBot(
  botId: string,
  config: Record<string, any>,
) {
  return request(`/api/bots/${botId}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function deleteBot(botId: string) {
  return request(`/api/bots/${botId}`, { method: 'DELETE' });
}

export async function startBot(botId: string) {
  return request(`/api/bots/${botId}/start`, { method: 'POST' });
}

export async function pauseBot(botId: string) {
  return request(`/api/bots/${botId}/pause`, { method: 'POST' });
}

export async function stopBot(botId: string) {
  return request(`/api/bots/${botId}/stop`, { method: 'POST' });
}

export async function killAllBots() {
  return request('/api/bots/kill-all', { method: 'POST' });
}

export async function placeManualOrder(botId: string, order: { side: string; size: number }) {
  return request(`/api/bots/${botId}/manual-order`, {
    method: 'POST',
    body: JSON.stringify(order),
  });
}

export async function getBotPositions(botId: string) {
  return request(`/api/bots/${botId}/positions`);
}

export async function getBotOrders(botId: string) {
  return request(`/api/bots/${botId}/orders`);
}

export async function getRecentOrders(limit: number = 50) {
  return request(`/api/orders/recent?limit=${limit}`);
}

export async function getSystemAlerts(limit: number = 100) {
  return request(`/api/phoenix/alerts?limit=${limit}`);
}

export async function getUnacknowledgedAlerts(limit: number = 100) {
  return request(`/api/phoenix/alerts/unacknowledged?limit=${limit}`);
}

export async function acknowledgeSystemAlert(id: string) {
  return request(`/api/phoenix/alerts/${id}/acknowledge`, { method: 'POST' });
}

export async function getIncidents(limit: number = 50) {
  return request(`/api/incidents?limit=${limit}`);
}

export async function getOpenIncidents(limit: number = 50) {
  return request(`/api/incidents/open?limit=${limit}`);
}

export async function resolveIncident(id: string, notes?: string) {
  return request(`/api/incidents/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export async function updateIncident(id: string, attrs: Record<string, any>) {
  return request(`/api/incidents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(attrs),
  });
}

export async function createSystemBot(config: {
  service_account_id: string;
  name?: string;
  credential_id?: string;
  trading_pairs?: string[];
  [key: string]: any;
}) {
  return request('/api/bots/system', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function deployBot(config: {
  user_id: string;
  name?: string;
  market_type?: 'spot' | 'usds_futures' | 'coinm_futures' | 'margin';
  [key: string]: any;
}) {
  return request('/api/bots/deploy', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function deploySystemBot(config: {
  service_account_id: string;
  name?: string;
  credential_id?: string;
  trading_pairs?: string[];
  [key: string]: any;
}) {
  return request('/api/bots/system/deploy', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function getBotBars(
  botId: string,
  timeframe: string = '5Min',
  limit: number = 120,
) {
  const params = new URLSearchParams({ timeframe, limit: String(limit) });
  return request(`/api/bots/${botId}/bars?${params}`);
}

export async function getBotEquityCurve(botId: string, since?: string) {
  const params = new URLSearchParams({ limit: '500' });
  if (since) params.set('since', since);
  return request(`/api/bots/${botId}/equity-curve?${params}`);
}

export async function getPlatformEquityCurve(limit: number = 200, since?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (since) params.set('since', since);
  return request(`/api/platform/equity-curve?${params}`);
}

export async function getBotTransitions(botId: string, limit?: number) {
  const qs = limit ? `?limit=${limit}` : '';
  return request(`/api/bots/${botId}/transitions${qs}`);
}

export async function getBotLogs(
  botId: string,
  opts?: { limit?: number; level?: string; category?: string },
) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.level) params.set('level', opts.level);
  if (opts?.category) params.set('category', opts.category);
  const qs = params.toString();
  return request(`/api/bots/${botId}/logs${qs ? `?${qs}` : ''}`);
}

// ==================== SERVICE ACCOUNTS API ====================

export async function listServiceAccounts() {
  return request('/api/service-accounts');
}

export async function getServiceAccount(id: string) {
  return request(`/api/service-accounts/${id}`);
}

export async function createServiceAccount(data: {
  name: string;
  account_type?: string;
  description?: string;
}) {
  return request('/api/service-accounts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateServiceAccount(id: string, data: Record<string, any>) {
  return request(`/api/service-accounts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteServiceAccount(id: string) {
  return request(`/api/service-accounts/${id}`, { method: 'DELETE' });
}

// ==================== STRATEGIES API ====================

export async function listStrategies(filters?: {
  type?: string;
  status?: string;
  live_only?: boolean;
}) {
  const query = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/api/strategies${qs ? `?${qs}` : ''}`);
}

export async function getStrategy(id: string) {
  return request(`/api/strategies/${id}`);
}

export async function createStrategy(attrs: Record<string, any>) {
  return request('/api/strategies', { method: 'POST', body: JSON.stringify(attrs) });
}

export async function updateStrategy(id: string, attrs: Record<string, any>) {
  return request(`/api/strategies/${id}`, { method: 'PUT', body: JSON.stringify(attrs) });
}

// ==================== BACKTESTS API ====================

export async function createBacktest(config: {
  strategy_id: string;
  user_id?: string;
  trading_pair: string;
  exchange_code: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  initial_capital_usd: number;
  config_overrides?: Record<string, any>;
  metadata?: Record<string, any>;
}) {
  return request('/api/backtests', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function listBacktests(filters?: {
  strategy_id?: string;
  user_id?: string;
  status?: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, String(v));
    });
  }
  const qs = params.toString();
  return request(`/api/backtests${qs ? `?${qs}` : ''}`);
}

export async function getBacktest(id: string) {
  return request(`/api/backtests/${id}`);
}

export async function cancelBacktest(id: string) {
  return request(`/api/backtests/${id}/cancel`, { method: 'POST' });
}

export async function listStrategyBacktests(strategyId: string) {
  return request(`/api/strategies/${strategyId}/backtests`);
}

// ==================== EXCHANGES API ====================

export async function listExchanges() {
  return request('/api/exchanges');
}

export async function getExchange(id: string) {
  return request(`/api/exchanges/${id}`);
}

export async function listTradingPairs(exchangeId: string) {
  return request(`/api/exchanges/${exchangeId}/trading-pairs`);
}

export async function listUserCredentials(userId: string) {
  return request(`/api/users/${userId}/credentials`);
}

// ==================== SERVICE ACCOUNT CREDENTIALS API ====================

export async function listServiceAccountCredentials(serviceAccountId: string) {
  return request(`/api/service-accounts/${serviceAccountId}/credentials`);
}

export async function getCredential(id: string) {
  return request(`/api/credentials/${id}`);
}

export async function getCredentialBalance(id: string, marketType: string = 'spot') {
  return request(`/api/credentials/${id}/balance?market_type=${marketType}`, {}, 'gateway');
}

export async function getCredentialPositions(id: string) {
  return request(`/api/credentials/${id}/positions`, {}, 'gateway');
}

export async function closeAllCredentialPositions(id: string) {
  return request(`/api/credentials/${id}/positions/close-all`, { method: 'POST' }, 'gateway');
}

export async function closeCredentialPosition(id: string, symbol: string, side: string, quantity: number, entryPrice: number) {
  return request(`/api/credentials/${id}/positions/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, side, quantity, entry_price: entryPrice }),
  }, 'gateway');
}

// ── Reconciliation ──
export async function getReconciliationSummary() {
  return request('/api/reconciliation/summary', {}, 'gateway');
}
export async function getReconciliationPositions() {
  return request('/api/reconciliation/positions', {}, 'gateway');
}
export async function getReconciliationOrders() {
  return request('/api/reconciliation/orders', {}, 'gateway');
}
export async function getReconciliationBalances() {
  return request('/api/reconciliation/balances', {}, 'gateway');
}
export async function getReconciliationTrades(credentialId: string, symbol: string, limit = 50) {
  return request(`/api/reconciliation/trades/${credentialId}?symbol=${encodeURIComponent(symbol)}&limit=${limit}`, {}, 'gateway');
}
export async function cancelOrphanOrders() {
  return request('/api/reconciliation/cancel-orphans', { method: 'POST' }, 'gateway');
}
export async function cleanStaleOrders() {
  return request('/api/reconciliation/clean-stale', { method: 'POST' }, 'gateway');
}

export async function runSyncNow() {
  return request('/api/sync/run', { method: 'POST' }, 'gateway');
}

export async function getSyncAnomalies() {
  return request('/api/sync/anomalies', {}, 'gateway');
}

export async function createCredential(data: {
  service_account_id?: string;
  user_id?: string;
  adapter_id: string;
  auth_model: string;
  exchange_name?: string;
  status?: string;
  is_sandbox?: boolean;
  permissions?: string[];
  config_overrides?: Record<string, any>;
  encrypted_api_key?: string;
  encrypted_api_secret?: string;
  encrypted_passphrase?: string;
}) {
  return request('/api/credentials', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCredential(id: string, data: Record<string, any>) {
  return request(`/api/credentials/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCredential(id: string) {
  return request(`/api/credentials/${id}`, { method: 'DELETE' });
}

export async function listAdapters() {
  return request('/api/adapters');
}

// ==================== BOT ENGINE DEFAULTS API ====================

export async function getBotEngineDefaults() {
  return request('/api/bot-engine-defaults');
}

export async function updateBotEngineDefaults(config: Record<string, any>) {
  return request('/api/bot-engine-defaults', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// ==================== TRADING CONTROLS API ====================

export async function startTrading() {
  return request('/api/trading/start', { method: 'POST' });
}

export async function stopTrading() {
  return request('/api/bots/kill-all', { method: 'POST' });
}

export async function restartTrading() {
  return request('/api/trading/restart', { method: 'POST' });
}

export async function closeAllPositions() {
  return request('/api/trading/close-all', { method: 'POST' });
}

export async function pauseUserTrading(userId: string) {
  return request(`/api/trading/pause/${userId}`, { method: 'POST' });
}

export async function resumeUserTrading(userId: string) {
  return request(`/api/trading/resume/${userId}`, { method: 'POST' });
}

// ==================== CAPITAL MANAGEMENT API ====================

export async function configureCapital(config: {
  user_id: string;
  total_capital: number;
  active_capital: number;
  scaling_mode: string;
  [key: string]: any;
}) {
  return request('/api/capital/configure', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function setActiveCapital(userId: string, amount: number) {
  return request(`/api/capital/${userId}/active`, {
    method: 'PUT',
    body: JSON.stringify({ amount }),
  });
}

export async function setTotalCapital(userId: string, amount: number) {
  return request(`/api/capital/${userId}/total`, {
    method: 'PUT',
    body: JSON.stringify({ amount }),
  });
}

export async function setScalingMode(userId: string, mode: string) {
  return request(`/api/capital/${userId}/mode`, {
    method: 'PUT',
    body: JSON.stringify({ mode }),
  });
}

export async function getCapitalStatus(userId: string) {
  return request(`/api/capital/${userId}`);
}

export async function getAllCapitalAllocations() {
  return request('/api/capital');
}

// ==================== POSITIONS API ====================

export async function getOpenPositions() {
  return request('/api/positions/open');
}

export async function getUserPositions(userId: string) {
  return request(`/api/positions/${userId}`);
}

export async function getUserOpenPositions(userId: string) {
  return request(`/api/positions/${userId}/open`);
}

export async function getUserClosedPositions(userId: string) {
  return request(`/api/positions/${userId}/closed`);
}

// ==================== RISK MANAGEMENT API ====================

export async function getRiskTier(balance: number) {
  return request(`/api/risk/tier/${balance}`);
}

export async function getAllowedAssets(balance: number) {
  return request(`/api/risk/assets/${balance}`);
}

export async function getRecommendedPositionSize(
  balance: number,
  confidence: number,
) {
  return request(
    `/api/risk/position-size?balance=${balance}&confidence=${confidence}`,
  );
}

export async function getUserRiskLimits(userId: string) {
  return request(`/api/risk/limits/${userId}`);
}

export async function updateUserRiskLimits(
  userId: string,
  limits: Record<string, any>,
) {
  return request(`/api/risk/limits/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(limits),
  });
}

// ==================== INFRASTRUCTURE & SERVICE HEALTH ====================

export async function getServiceHealth() {
  return request('/api/phoenix/services/health', {}, 'gateway');
}

export async function getServiceHealthByName(name: string) {
  return request(`/api/phoenix/services/health/${name}`, {}, 'gateway');
}

export async function getServiceHealthByCategory(category: string) {
  return request(`/api/phoenix/services/health/category/${category}`, {}, 'gateway');
}

export async function getInfraMetrics() {
  return request('/api/phoenix/infra/metrics', {}, 'gateway');
}

export async function getExchangeHealth() {
  return request('/api/phoenix/infra/exchanges', {}, 'gateway');
}

// ==================== RISK MONITORING ====================

export async function getRiskStatus() {
  return request('/api/phoenix/risk/status', {}, 'gateway');
}

export async function getCircuitBreakerStatus() {
  return request('/api/phoenix/risk/circuit-breaker', {}, 'gateway');
}

export async function resetCircuitBreaker() {
  return request('/api/phoenix/risk/circuit-breaker/reset', { method: 'POST' }, 'gateway');
}

export async function getReconcilerStatus() {
  return request('/api/phoenix/risk/reconciler', {}, 'gateway');
}

export async function triggerReconciliation() {
  return request('/api/phoenix/risk/reconciler/check', { method: 'POST' }, 'gateway');
}

export async function getSlippageStats() {
  return request('/api/phoenix/risk/slippage', {}, 'gateway');
}

export async function getCorrelationRisk() {
  return request('/api/phoenix/risk/correlation', {}, 'gateway');
}

export async function getCredentialHealth() {
  return request('/api/phoenix/risk/credentials', {}, 'gateway');
}

// ==================== WEBSOCKET HELPER ====================

/**
 * Get a JWT token for authenticating Phoenix WebSocket connections.
 * Usage: pass the returned token as `params.token` when connecting to the socket.
 *
 * Example:
 *   const token = await getWebSocketToken();
 *   const socket = new Phoenix.Socket(WS_URL, { params: { token } });
 */
export async function getWebSocketToken(): Promise<string | null> {
  try {
    return await getAccessToken(logtoConfig, TRADING_ENGINE_API_RESOURCE);
  } catch {
    return null;
  }
}
