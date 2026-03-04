'use server';

import { getAccessToken } from '@logto/next/server-actions';
import { logtoConfig, STELLA_ADMIN_API_RESOURCE } from '@/app/logto';

const BASE_URL = process.env.STELLA_ADMIN_API_URL || 'http://localhost:3001';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getAccessToken(logtoConfig, STELLA_ADMIN_API_RESOURCE);
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
): Promise<ApiResponse<T>> {
  try {
    const headers = await getAuthHeaders();
    const url = `${BASE_URL}/api${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        error: data.error || data.message || `HTTP ${response.status}`,
        message: data.message,
        statusCode: response.status,
      };
    }

    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ==================== AUTH / ME ====================

export async function getAdminMe() {
  return request('/admin/me');
}

// ==================== ADMIN USERS ====================

export async function getAdminUsers(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/admin/admin-users${qs ? `?${qs}` : ''}`);
}

export async function createAdminUser(body: {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone?: string;
  password?: string;
  roleIds?: string[];
}) {
  return request('/admin/admin-users/invite', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getAdminUser(id: string) {
  return request(`/admin/admin-users/${id}`);
}

export async function getAdminUserRoles(adminUserId: string) {
  return request(`/admin/admin-users/${adminUserId}/roles`);
}

export async function assignAdminUserRole(
  adminUserId: string,
  body: { roleId: string; expiresAt?: string },
) {
  return request(`/admin/admin-users/${adminUserId}/roles`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function removeAdminUserRole(adminUserId: string, roleId: string) {
  return request(`/admin/admin-users/${adminUserId}/roles/${roleId}`, {
    method: 'DELETE',
  });
}

export async function getAvailableRoles(userId?: string) {
  const qs = userId ? `?userId=${userId}` : '';
  return request(`/admin/admin-users/roles/available${qs}`);
}

export async function updateAdminUser(
  id: string,
  body: { username?: string; firstName?: string; lastName?: string; phone?: string; timezone?: string; avatarUrl?: string },
) {
  return request(`/admin/admin-users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function reactivateAdminUser(id: string) {
  return request(`/admin/admin-users/${id}/reactivate`, {
    method: 'POST',
  });
}

export async function deactivateAdminUser(
  id: string,
  body: { reason: string },
) {
  return request(`/admin/admin-users/${id}/deactivate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function resetAdminPassword(id: string) {
  return request(`/admin/admin-users/${id}/reset-password`, {
    method: 'POST',
  });
}

export async function getAdminUserMfa(id: string) {
  return request(`/admin/admin-users/${id}/mfa`);
}

export async function deleteAdminUserMfa(id: string, verificationId: string) {
  return request(`/admin/admin-users/${id}/mfa/${verificationId}`, {
    method: 'DELETE',
  });
}

// ==================== USERS ====================

export async function getUsers(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/users${qs ? `?${qs}` : ''}`);
}

export async function getUser(id: string) {
  return request(`/users/${id}`);
}

export async function getUserTransactions(id: string) {
  return request(`/users/${id}/transactions`);
}

export async function updateUser(id: string, body: Record<string, any>) {
  return request(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function suspendUser(id: string, body?: { reason?: string }) {
  return request(`/users/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

export async function reactivateUser(id: string) {
  return request(`/users/${id}/reactivate`, { method: 'POST' });
}

// ==================== ALERTS ====================

export async function getAlerts(params?: {
  page?: number;
  limit?: number;
  type?: string;
  severity?: string;
}) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/alerts${qs ? `?${qs}` : ''}`);
}

export async function acknowledgeAlert(id: string) {
  return request(`/alerts/${id}/acknowledge`, { method: 'POST' });
}

export async function acknowledgeAlertsBulk(ids: string[]) {
  return request('/alerts/acknowledge-bulk', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function deleteAlert(id: string) {
  return request(`/alerts/${id}`, { method: 'DELETE' });
}

// ==================== KYC ====================

export async function getKycApplicantsStats() {
  return request('/kyc/applicants/stats');
}

export async function getKycApplicants(params?: Record<string, any>) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/kyc/applicants${qs ? `?${qs}` : ''}`);
}

export async function getKycApplicant(id: string) {
  return request(`/kyc/applicants/${id}`);
}

export async function kycApplicantAction(
  id: string,
  body: { action: string; reason?: string },
) {
  return request(`/kyc/applicants/${id}/action`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getKycProvidersStats() {
  return request('/kyc/providers/stats');
}

export async function getKycProviders() {
  return request('/kyc/providers');
}

export async function updateKycProvider(id: string, body: Record<string, any>) {
  return request(`/kyc/providers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function getKycRegions() {
  return request('/kyc/regions');
}

export async function createKycRegion(body: Record<string, any>) {
  return request('/kyc/regions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateKycRegion(id: string, body: Record<string, any>) {
  return request(`/kyc/regions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function getKycReverificationRules() {
  return request('/kyc/reverification-rules');
}

export async function createKycReverificationRule(body: Record<string, any>) {
  return request('/kyc/reverification-rules', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateKycReverificationRule(
  id: string,
  body: Record<string, any>,
) {
  return request(`/kyc/reverification-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function getKycAudit(params?: Record<string, any>) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/kyc/audit${qs ? `?${qs}` : ''}`);
}

export async function exportKycAudit(params?: Record<string, any>) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/kyc/audit/export${qs ? `?${qs}` : ''}`);
}

// ==================== FINANCE ====================

export async function getFinancePlatformKpis() {
  return request('/finance/platform-kpis');
}

export async function getFinanceEquityCurve() {
  return request('/finance/equity-curve');
}

export async function getFinanceMonthlyReturns() {
  return request('/finance/monthly-returns');
}

export async function getFinanceDrawdownCurve() {
  return request('/finance/drawdown-curve');
}

export async function getFinanceStrategiesPerformance() {
  return request('/finance/strategies/performance');
}

export async function getFinanceStrategiesEquityCurves() {
  return request('/finance/strategies/equity-curves');
}

export async function getFinanceRiskOverview() {
  return request('/finance/risk/overview');
}

export async function getFinanceRiskConcentration() {
  return request('/finance/risk/concentration');
}

export async function getFinanceRiskCorrelationMatrix() {
  return request('/finance/risk/correlation-matrix');
}

export async function getFinanceRiskPositionSizing() {
  return request('/finance/risk/position-sizing');
}

export async function getFinanceMarketKpis() {
  return request('/finance/market/kpis');
}

export async function getFinanceMarketPairs() {
  return request('/finance/market/pairs');
}

export async function getFinanceMarketHourlyHeatmap() {
  return request('/finance/market/hourly-heatmap');
}

export async function getFinanceMarketExchanges() {
  return request('/finance/market/exchanges');
}

export async function getFinanceUsersKpis() {
  return request('/finance/users/kpis');
}

export async function getFinanceUsersPerformance() {
  return request('/finance/users/performance');
}

export async function getFinanceUsersTiers() {
  return request('/finance/users/tiers');
}

export async function getFinanceUsersGrowth() {
  return request('/finance/users/growth');
}

// ==================== SHIFTS ====================

export async function getCurrentShift() {
  return request('/shift/current');
}

export async function startShift(body: Record<string, any>) {
  return request('/shift/start', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getShiftActivities(shiftId: string) {
  return request(`/shift/activities?shiftId=${shiftId}`);
}

export async function logShiftActivity(body: Record<string, any>) {
  return request('/shift/activities', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getShiftWatchList() {
  return request('/shift/watch-list');
}

export async function addToShiftWatchList(body: Record<string, any>) {
  return request('/shift/watch-list', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function submitHandoff(body: Record<string, any>) {
  return request('/shift/handoff', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateShiftNotes(
  id: string,
  body: { handoffNotes: string },
) {
  return request(`/shift/${id}/notes`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function getShiftHistory(params?: {
  page?: number;
  limit?: number;
  status?: string;
  userId?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  if (params?.userId) qs.set('userId', params.userId);
  return request(`/shift/history?${qs.toString()}`);
}

// ==================== SETTINGS: RISK ====================

export async function getSettingsRisk() {
  return request('/settings/risk');
}

export async function updateSettingsRisk(body: Record<string, any>) {
  return request('/settings/risk', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ==================== SETTINGS: BILLING ====================

export async function getSettingsBilling() {
  return request('/settings/billing');
}

export async function updateSettingsBilling(body: Record<string, any>) {
  return request('/settings/billing', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function getSettingsBillingRevenueStats() {
  return request('/settings/billing/revenue-stats');
}

// ==================== SETTINGS: INTEGRATIONS ====================

export async function getSettingsIntegrations() {
  return request('/settings/integrations');
}

export async function updateSettingsIntegration(
  id: string,
  body: Record<string, any>,
) {
  return request(`/settings/integrations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function createSettingsWebhook(body: Record<string, any>) {
  return request('/settings/integrations/webhooks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateSettingsWebhook(
  id: string,
  body: Record<string, any>,
) {
  return request(`/settings/integrations/webhooks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteSettingsWebhook(id: string) {
  return request(`/settings/integrations/webhooks/${id}`, {
    method: 'DELETE',
  });
}

export async function rotateSigningKey() {
  return request('/settings/integrations/rotate-signing-key', {
    method: 'POST',
  });
}

// ==================== SETTINGS: BOT ENGINE ====================

export async function getSettingsBotEngine() {
  return request('/settings/bot-engine');
}

export async function updateSettingsBotEngine(body: Record<string, any>) {
  return request('/settings/bot-engine', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ==================== SETTINGS: SECURITY ====================

export async function getSettingsSecurity() {
  return request('/settings/security');
}

export async function updateSettingsSecurity(body: Record<string, any>) {
  return request('/settings/security', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ==================== SETTINGS: COMMUNICATIONS ====================

export async function getSettingsCommunications() {
  return request('/settings/communications');
}

export async function updateSettingsEmail(body: Record<string, any>) {
  return request('/settings/communications/email', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function updateSettingsTemplate(
  id: string,
  body: Record<string, any>,
) {
  return request(`/settings/communications/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ==================== SETTINGS: COMPLIANCE ====================

export async function getSettingsCompliance() {
  return request('/settings/compliance');
}

export async function updateSettingsCompliance(body: Record<string, any>) {
  return request('/settings/compliance', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function createComplianceRestriction(body: Record<string, any>) {
  return request('/settings/compliance/restrictions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateComplianceRestriction(
  id: string,
  body: Record<string, any>,
) {
  return request(`/settings/compliance/restrictions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ==================== SETTINGS: EXCHANGES ====================

export async function getSettingsExchanges() {
  return request('/settings/exchanges');
}

export async function getSettingsExchange(id: string) {
  return request(`/settings/exchanges/${id}`);
}

export async function updateSettingsExchange(
  id: string,
  body: Record<string, any>,
) {
  return request(`/settings/exchanges/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function testExchangeConnection(id: string) {
  return request(`/settings/exchanges/${id}/test-connection`, {
    method: 'POST',
  });
}

export async function getAdapterTradingPairs(
  adapterId: string,
  params?: { isActive?: boolean; delisted?: boolean; search?: string; marketType?: string },
) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/settings/exchanges/${adapterId}/trading-pairs${qs ? `?${qs}` : ''}`);
}

export async function getAdapterPairStats(adapterId: string) {
  return request(`/settings/exchanges/${adapterId}/trading-pairs/stats`);
}

export async function syncAdapterPairs(adapterId: string, mode?: 'live' | 'sandbox') {
  return request(`/settings/exchanges/${adapterId}/sync-pairs`, {
    method: 'POST',
    body: mode ? JSON.stringify({ mode }) : undefined,
  });
}

export async function toggleTradingPair(pairId: string, body: { isActive: boolean }) {
  return request(`/settings/exchanges/trading-pairs/${pairId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function bulkToggleTradingPairs(
  adapterId: string,
  body: { pairIds: string[]; isActive: boolean },
) {
  return request(`/settings/exchanges/${adapterId}/trading-pairs/bulk-toggle`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ==================== SETTINGS: ASSET TIER CONFIG ====================

export async function getAssetTierConfig(adapterId: string) {
  return request(`/settings/exchanges/${adapterId}/asset-tiers`);
}

export async function updateAssetTierConfig(
  adapterId: string,
  body: Record<string, any>,
) {
  return request(`/settings/exchanges/${adapterId}/asset-tiers`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ==================== SETTINGS: INFRASTRUCTURE ====================

export async function getInfrastructureStatus() {
  return request('/settings/infrastructure/status');
}

export async function getSettingsInfrastructure() {
  return request('/settings/infrastructure');
}

export async function updateSettingsInfrastructure(
  body: Record<string, any>,
) {
  return request('/settings/infrastructure', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function updateFeatureFlag(
  id: string,
  body: Record<string, any>,
) {
  return request(`/settings/infrastructure/feature-flags/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function triggerJob(jobName: string) {
  return request(`/settings/infrastructure/jobs/${jobName}/trigger`, {
    method: 'POST',
  });
}

// ==================== SETTINGS: NOTIFICATIONS ====================

export async function getSettingsNotifications() {
  return request('/settings/notifications');
}

export async function updateNotificationChannel(
  id: string,
  body: Record<string, any>,
) {
  return request(`/settings/notifications/channels/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function updateNotificationRouting(
  id: string,
  body: Record<string, any>,
) {
  return request(`/settings/notifications/routing/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function updateNotificationSettings(body: Record<string, any>) {
  return request('/settings/notifications/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function updateAlertType(
  id: string,
  body: Record<string, any>,
) {
  return request(`/settings/notifications/alert-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ==================== INCIDENTS ====================

export async function getIncidents(params?: Record<string, any>) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/incidents${qs ? `?${qs}` : ''}`);
}

export async function getIncident(id: string) {
  return request(`/incidents/${id}`);
}

export async function createIncident(body: Record<string, any>) {
  return request('/incidents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateIncident(id: string, body: Record<string, any>) {
  return request(`/incidents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function escalateIncident(id: string) {
  return request(`/incidents/${id}/escalate`, { method: 'POST' });
}

export async function resolveIncident(id: string, body?: Record<string, any>) {
  return request(`/incidents/${id}/resolve`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function countersignIncident(id: string) {
  return request(`/incidents/${id}/countersign`, { method: 'POST' });
}

export async function createIncidentCorrection(
  id: string,
  body: Record<string, any>,
) {
  return request(`/incidents/${id}/correction`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function logNilShift(body: Record<string, any>) {
  return request('/incidents/nil-shift', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getOpenIncidents() {
  return request('/incidents/open');
}

export async function getKillSwitchActivations(params?: {
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/incidents/kill-switch${qs ? `?${qs}` : ''}`);
}

export async function createKillSwitch(
  incidentId: string,
  body: Record<string, any>,
) {
  return request(`/incidents/${incidentId}/kill-switch`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getRogueBotIncidents(params?: {
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  return request(`/incidents/rogue-bot${qs ? `?${qs}` : ''}`);
}

export async function createRogueBotIncident(
  incidentId: string,
  body: Record<string, any>,
) {
  return request(`/incidents/${incidentId}/rogue-bot`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getIncidentSummary(month: string) {
  return request(`/incidents/summary?month=${month}`);
}

export async function getShiftRegister(month: string) {
  return request(`/incidents/shift-register?month=${month}`);
}

export async function archiveIncidentMonth(month: string) {
  return request('/incidents/archive', {
    method: 'POST',
    body: JSON.stringify({ month }),
  });
}

export async function getArchivedMonths() {
  return request('/incidents/archived');
}
