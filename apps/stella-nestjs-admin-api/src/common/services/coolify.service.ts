import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface InfraServiceStatus {
  id: string;
  name: string;
  type: 'application' | 'database' | 'service';
  coolifyType?: string;
  status: 'running' | 'stopped' | 'exited' | 'restarting' | 'degraded' | 'unknown';
  healthy: boolean;
  fqdn?: string;
  updatedAt: string;
}

@Injectable()
export class CoolifyService implements OnModuleInit {
  private readonly logger = new Logger(CoolifyService.name);
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly projectUuid: string;
  private readonly environment: string;

  private cachedServices: InfraServiceStatus[] | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('coolify.apiUrl') || '';
    this.apiToken = this.configService.get<string>('coolify.apiToken') || '';
    this.projectUuid = this.configService.get<string>('coolify.projectUuid') || '';
    this.environment = this.configService.get<string>('coolify.environment') || 'development';
  }

  onModuleInit() {
    if (!this.apiUrl || !this.apiToken || !this.projectUuid) {
      this.logger.warn(
        'Coolify API credentials not configured — infrastructure status will be unavailable. ' +
          'Set COOLIFY_API_URL, COOLIFY_API_TOKEN, and COOLIFY_PROJECT_UUID in .env',
      );
    } else {
      this.logger.log('Coolify API client initialized');
    }
  }

  private async request<T = any>(path: string): Promise<T> {
    const url = `${this.apiUrl}/api/v1${path}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Coolify API GET ${path} failed: ${response.status} ${errorText}`);
      throw new Error(`Coolify API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  private parseStatus(rawStatus: string | undefined): { status: InfraServiceStatus['status']; healthy: boolean } {
    if (!rawStatus) return { status: 'unknown', healthy: false };

    const parts = rawStatus.split(':');
    const runtimeStatus = parts[0]?.toLowerCase() || 'unknown';
    const healthStatus = parts[1]?.toLowerCase() || '';

    let status: InfraServiceStatus['status'];
    switch (runtimeStatus) {
      case 'running':
        status = 'running';
        break;
      case 'stopped':
        status = 'stopped';
        break;
      case 'exited':
        status = 'exited';
        break;
      case 'restarting':
        status = 'restarting';
        break;
      case 'degraded':
        status = 'degraded';
        break;
      default:
        status = 'unknown';
    }

    const healthy = healthStatus === 'healthy';

    return { status, healthy };
  }

  private formatName(rawName: string): string {
    return rawName
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private mapResource(resource: any, type: InfraServiceStatus['type']): InfraServiceStatus {
    const { status, healthy } = this.parseStatus(resource.status);

    return {
      id: resource.uuid || resource.id || '',
      name: this.formatName(resource.name || resource.description || 'Unknown'),
      type,
      coolifyType: resource.type || undefined,
      status,
      healthy,
      fqdn: resource.fqdn || undefined,
      updatedAt: resource.updated_at || resource.created_at || new Date().toISOString(),
    };
  }

  async getProjectResources(): Promise<InfraServiceStatus[]> {
    // Return cached data if still fresh
    if (this.cachedServices && Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cachedServices;
    }

    try {
      const data = await this.request<any>(
        `/projects/${this.projectUuid}/${this.environment}`,
      );

      const services: InfraServiceStatus[] = [];

      // Map applications
      if (Array.isArray(data.applications)) {
        for (const app of data.applications) {
          services.push(this.mapResource(app, 'application'));
        }
      }

      // Map databases (could be postgresql, mysql, redis, etc.)
      for (const key of ['postgresqls', 'mysqls', 'mariadbs', 'mongodbs', 'redises', 'keydbs', 'dragonflies', 'clickhouses']) {
        if (Array.isArray(data[key])) {
          for (const db of data[key]) {
            services.push(this.mapResource(db, 'database'));
          }
        }
      }

      // Map services (compose-based services like Logto, Unleash, etc.)
      if (Array.isArray(data.services)) {
        for (const svc of data.services) {
          services.push(this.mapResource(svc, 'service'));
        }
      }

      this.cachedServices = services;
      this.cacheTimestamp = Date.now();

      this.logger.debug(`Fetched ${services.length} resources from Coolify`);
      return services;
    } catch (error) {
      this.logger.error(`Failed to fetch Coolify resources: ${error}`);

      // Return stale cache if available
      if (this.cachedServices) {
        this.logger.warn('Returning stale cached Coolify data');
        return this.cachedServices;
      }

      return [];
    }
  }
}
