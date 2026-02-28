import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface LogtoUser {
  id: string;
  primaryEmail: string;
  name: string;
  avatar: string;
  customData: Record<string, any>;
  isSuspended: boolean;
  createdAt: number;
}

export interface LogtoMfaVerification {
  id: string;
  type: 'Totp' | 'WebAuthn' | 'BackupCode' | 'EmailVerificationCode' | 'PhoneVerificationCode';
  createdAt: string;
  lastUsedAt?: string;
  agent?: string;
  name?: string;
  remainCodes?: number;
}

interface CreateUserPayload {
  primaryEmail: string;
  username?: string;
  name?: string;
  password?: string;
  customData?: Record<string, any>;
}

interface UpdateUserPayload {
  primaryEmail?: string;
  username?: string;
  name?: string;
  avatar?: string;
  customData?: Record<string, any>;
}

@Injectable()
export class LogtoManagementService implements OnModuleInit {
  private readonly logger = new Logger(LogtoManagementService.name);
  private readonly logtoDomain: string;
  private readonly m2mAppId: string;
  private readonly m2mAppSecret: string;
  private readonly managementApiResource: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private configService: ConfigService) {
    this.logtoDomain = this.configService.get<string>('auth.logtoDomain') || '';
    this.m2mAppId = this.configService.get<string>('auth.logtoM2mAppId') || '';
    this.m2mAppSecret = this.configService.get<string>('auth.logtoM2mAppSecret') || '';
    this.managementApiResource =
      this.configService.get<string>('auth.logtoManagementApiResource') ||
      `${this.logtoDomain}/api`;
  }

  onModuleInit() {
    if (!this.m2mAppId || !this.m2mAppSecret) {
      this.logger.warn(
        'Logto M2M credentials not configured — user lifecycle operations will fail. ' +
          'Set LOGTO_M2M_APP_ID and LOGTO_M2M_APP_SECRET in .env',
      );
    } else {
      this.logger.log('Logto Management API client initialized');
    }
  }

  /**
   * Obtain an M2M access token using client_credentials grant.
   * Tokens are cached until 60s before expiry.
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const tokenUrl = `${this.logtoDomain}/oidc/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      resource: this.managementApiResource,
      scope: 'all',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.m2mAppId}:${this.m2mAppSecret}`).toString('base64')}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Failed to obtain M2M token: ${response.status} ${errorText}`);
      throw new Error(`Logto M2M token request failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    this.logger.debug('M2M access token obtained/refreshed');

    return this.accessToken!;
  }

  /**
   * Make an authenticated request to the Logto Management API.
   */
  private async request<T = any>(
    method: string,
    path: string,
    body?: any,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.logtoDomain}/api${path}`;

    this.logger.log(`Logto API request: ${method} ${url} ${body ? JSON.stringify(body) : ''}`);

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    this.logger.log(`Logto API response: ${method} ${path} → ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Logto API ${method} ${path} failed: ${response.status} ${errorText}`);
      throw new Error(`Logto API error ${response.status}: ${errorText}`);
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // ─── User Lifecycle ────────────────────────────────────────

  async createUser(payload: CreateUserPayload): Promise<LogtoUser> {
    this.logger.log(`Creating Logto user: ${payload.primaryEmail}`);
    return this.request<LogtoUser>('POST', '/users', payload);
  }

  async getUser(logtoUserId: string): Promise<LogtoUser> {
    return this.request<LogtoUser>('GET', `/users/${logtoUserId}`);
  }

  async updateUser(logtoUserId: string, payload: UpdateUserPayload): Promise<LogtoUser> {
    this.logger.log(`Updating Logto user: ${logtoUserId}`);
    return this.request<LogtoUser>('PATCH', `/users/${logtoUserId}`, payload);
  }

  async deleteUser(logtoUserId: string): Promise<void> {
    this.logger.warn(`Deleting Logto user: ${logtoUserId}`);
    return this.request<void>('DELETE', `/users/${logtoUserId}`);
  }

  async suspendUser(logtoUserId: string): Promise<LogtoUser> {
    this.logger.log(`Suspending Logto user: ${logtoUserId}`);
    return this.request<LogtoUser>('PATCH', `/users/${logtoUserId}/is-suspended`, {
      isSuspended: true,
    });
  }

  async unsuspendUser(logtoUserId: string): Promise<LogtoUser> {
    this.logger.log(`Unsuspending Logto user: ${logtoUserId}`);
    return this.request<LogtoUser>('PATCH', `/users/${logtoUserId}/is-suspended`, {
      isSuspended: false,
    });
  }

  /**
   * Trigger a password reset by setting a new temporary password.
   * The user will be forced to change it on next login.
   */
  async resetUserPassword(logtoUserId: string, temporaryPassword: string): Promise<void> {
    this.logger.log(`Resetting password for Logto user: ${logtoUserId}`);
    return this.request<void>('PATCH', `/users/${logtoUserId}/password`, {
      password: temporaryPassword,
    });
  }

  // ─── MFA Management ─────────────────────────────────────────

  /**
   * List all MFA verifications for a user.
   */
  async getUserMfaVerifications(logtoUserId: string): Promise<LogtoMfaVerification[]> {
    return this.request<LogtoMfaVerification[]>('GET', `/users/${logtoUserId}/mfa-verifications`);
  }

  /**
   * Delete a specific MFA verification for a user.
   */
  async deleteUserMfaVerification(logtoUserId: string, verificationId: string): Promise<void> {
    this.logger.log(`Deleting MFA verification ${verificationId} for Logto user: ${logtoUserId}`);
    return this.request<void>('DELETE', `/users/${logtoUserId}/mfa-verifications/${verificationId}`);
  }
}
