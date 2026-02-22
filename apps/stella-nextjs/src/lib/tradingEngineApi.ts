/**
 * Trading Engine API Client
 *
 * A comprehensive utility class for interacting with the Trading Engine API.
 * Provides methods for managing bots, trading controls, capital management,
 * positions, and risk management.
 */

const BASE_URL = 'http://170.168.103.207:4000';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

interface BotConfig {
  user_id: string;
  name?: string;
  strategy?: string;
  [key: string]: any;
}

interface CapitalConfig {
  user_id: string;
  total_capital: number;
  active_capital: number;
  scaling_mode: string;
  [key: string]: any;
}

interface RiskLimits {
  [key: string]: any;
}

/**
 * Trading Engine API Client
 */
export class TradingEngineApi {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic HTTP request handler
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          error: data.error || `HTTP ${response.status}: ${response.statusText}`,
          message: data.message,
        };
      }

      return { data };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  // ==================== BOTS API (11 routes) ====================

  /**
   * Create a new bot
   */
  async createBot(config: BotConfig): Promise<ApiResponse> {
    return this.request('/api/bots', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  /**
   * List all bots (enriched + system metrics)
   */
  async listBots(): Promise<ApiResponse> {
    return this.request('/api/bots', {
      method: 'GET',
    });
  }

  /**
   * List bots for a specific user
   */
  async listUserBots(userId: string): Promise<ApiResponse> {
    return this.request(`/api/bots/user/${userId}`, {
      method: 'GET',
    });
  }

  /**
   * Get single bot (full runtime data)
   */
  async getBot(botId: string): Promise<ApiResponse> {
    return this.request(`/api/bots/${botId}`, {
      method: 'GET',
    });
  }

  /**
   * Update bot configuration
   */
  async updateBot(botId: string, config: Partial<BotConfig>): Promise<ApiResponse> {
    return this.request(`/api/bots/${botId}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  /**
   * Delete bot (must be stopped)
   */
  async deleteBot(botId: string): Promise<ApiResponse> {
    return this.request(`/api/bots/${botId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Start bot
   */
  async startBot(botId: string): Promise<ApiResponse> {
    return this.request(`/api/bots/${botId}/start`, {
      method: 'POST',
    });
  }

  /**
   * Pause bot
   */
  async pauseBot(botId: string): Promise<ApiResponse> {
    return this.request(`/api/bots/${botId}/pause`, {
      method: 'POST',
    });
  }

  /**
   * Stop bot
   */
  async stopBot(botId: string): Promise<ApiResponse> {
    return this.request(`/api/bots/${botId}/stop`, {
      method: 'POST',
    });
  }

  /**
   * Get bot's positions (enriched)
   */
  async getBotPositions(botId: string): Promise<ApiResponse> {
    return this.request(`/api/bots/${botId}/positions`, {
      method: 'GET',
    });
  }

  /**
   * Get bot's orders (enriched)
   */
  async getBotOrders(botId: string): Promise<ApiResponse> {
    return this.request(`/api/bots/${botId}/orders`, {
      method: 'GET',
    });
  }

  // ==================== TRADING CONTROLS API (6 routes) ====================

  /**
   * Start signal trader
   */
  async startTrading(): Promise<ApiResponse> {
    return this.request('/api/trading/start', {
      method: 'POST',
    });
  }

  /**
   * Stop signal trader
   */
  async stopTrading(): Promise<ApiResponse> {
    return this.request('/api/trading/stop', {
      method: 'POST',
    });
  }

  /**
   * Restart (stop → reset → start)
   */
  async restartTrading(): Promise<ApiResponse> {
    return this.request('/api/trading/restart', {
      method: 'POST',
    });
  }

  /**
   * Emergency close all positions
   */
  async closeAllPositions(): Promise<ApiResponse> {
    return this.request('/api/trading/close-all', {
      method: 'POST',
    });
  }

  /**
   * Pause trading for user
   */
  async pauseUserTrading(userId: string): Promise<ApiResponse> {
    return this.request(`/api/trading/pause/${userId}`, {
      method: 'POST',
    });
  }

  /**
   * Resume trading for user
   */
  async resumeUserTrading(userId: string): Promise<ApiResponse> {
    return this.request(`/api/trading/resume/${userId}`, {
      method: 'POST',
    });
  }

  // ==================== CAPITAL MANAGEMENT API (6 routes) ====================

  /**
   * Configure capital allocation
   */
  async configureCapital(config: CapitalConfig): Promise<ApiResponse> {
    return this.request('/api/capital/configure', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  /**
   * Set active trading capital
   */
  async setActiveCapital(userId: string, amount: number): Promise<ApiResponse> {
    return this.request(`/api/capital/${userId}/active`, {
      method: 'PUT',
      body: JSON.stringify({ amount }),
    });
  }

  /**
   * Set total capital
   */
  async setTotalCapital(userId: string, amount: number): Promise<ApiResponse> {
    return this.request(`/api/capital/${userId}/total`, {
      method: 'PUT',
      body: JSON.stringify({ amount }),
    });
  }

  /**
   * Set scaling mode
   */
  async setScalingMode(userId: string, mode: string): Promise<ApiResponse> {
    return this.request(`/api/capital/${userId}/mode`, {
      method: 'PUT',
      body: JSON.stringify({ mode }),
    });
  }

  /**
   * Get capital status for user
   */
  async getCapitalStatus(userId: string): Promise<ApiResponse> {
    return this.request(`/api/capital/${userId}`, {
      method: 'GET',
    });
  }

  /**
   * Get all capital allocations
   */
  async getAllCapitalAllocations(): Promise<ApiResponse> {
    return this.request('/api/capital', {
      method: 'GET',
    });
  }

  // ==================== POSITIONS API (4 routes) ====================

  /**
   * Get live open positions from SignalTrader (enriched)
   */
  async getOpenPositions(): Promise<ApiResponse> {
    return this.request('/api/positions/open', {
      method: 'GET',
    });
  }

  /**
   * Get all user positions (enriched)
   */
  async getUserPositions(userId: string): Promise<ApiResponse> {
    return this.request(`/api/positions/${userId}`, {
      method: 'GET',
    });
  }

  /**
   * Get user open positions only
   */
  async getUserOpenPositions(userId: string): Promise<ApiResponse> {
    return this.request(`/api/positions/${userId}/open`, {
      method: 'GET',
    });
  }

  /**
   * Get user closed positions only
   */
  async getUserClosedPositions(userId: string): Promise<ApiResponse> {
    return this.request(`/api/positions/${userId}/closed`, {
      method: 'GET',
    });
  }

  // ==================== RISK MANAGEMENT API (5 routes) ====================

  /**
   * Get tier info for balance amount
   */
  async getRiskTier(balance: number): Promise<ApiResponse> {
    return this.request(`/api/risk/tier/${balance}`, {
      method: 'GET',
    });
  }

  /**
   * Get allowed trading assets for balance
   */
  async getAllowedAssets(balance: number): Promise<ApiResponse> {
    return this.request(`/api/risk/assets/${balance}`, {
      method: 'GET',
    });
  }

  /**
   * Get recommended position size
   */
  async getRecommendedPositionSize(
    balance: number,
    confidence: number
  ): Promise<ApiResponse> {
    return this.request(
      `/api/risk/position-size?balance=${balance}&confidence=${confidence}`,
      {
        method: 'GET',
      }
    );
  }

  /**
   * Get user risk limits
   */
  async getUserRiskLimits(userId: string): Promise<ApiResponse> {
    return this.request(`/api/risk/limits/${userId}`, {
      method: 'GET',
    });
  }

  /**
   * Update user risk limits
   */
  async updateUserRiskLimits(
    userId: string,
    limits: RiskLimits
  ): Promise<ApiResponse> {
    return this.request(`/api/risk/limits/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(limits),
    });
  }
}

// Export a singleton instance for convenience
export const tradingEngineApi = new TradingEngineApi();

// Export default
export default TradingEngineApi;
