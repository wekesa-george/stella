import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AdapterStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
  DEPRECATED = 'deprecated',
}

export enum AuthModel {
  API_KEY = 'api_key',
  OAUTH2 = 'oauth2',
  HMAC = 'hmac',
  JWT = 'jwt',
}

@Entity({ schema: 'exchange', name: 'adapters' })
export class Adapter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 50, unique: true })
  code: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column('text', { nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: AdapterStatus,
    default: AdapterStatus.INACTIVE,
  })
  status: AdapterStatus;

  @Column('varchar', {
    name: 'auth_model',
    length: 20,
    default: 'api_key',
  })
  authModel: string;

  @Column('varchar', { name: 'base_url', length: 255, nullable: true })
  baseUrl: string | null;

  @Column('varchar', { name: 'ws_url', length: 255, nullable: true })
  wsUrl: string | null;

  @Column('varchar', { name: 'sandbox_base_url', length: 255, nullable: true })
  sandboxBaseUrl: string | null;

  @Column('varchar', { name: 'sandbox_ws_url', length: 255, nullable: true })
  sandboxWsUrl: string | null;

  @Column('varchar', { name: 'futures_base_url', length: 500, nullable: true })
  futuresBaseUrl: string | null;

  @Column('varchar', { name: 'futures_sandbox_base_url', length: 500, nullable: true })
  futuresSandboxBaseUrl: string | null;

  @Column('varchar', { name: 'futures_ws_url', length: 500, nullable: true })
  futuresWsUrl: string | null;

  @Column('varchar', { name: 'futures_sandbox_ws_url', length: 500, nullable: true })
  futuresSandboxWsUrl: string | null;

  @Column('boolean', { name: 'supports_spot', default: false })
  supportsSpot: boolean;

  @Column('boolean', { name: 'supports_margin', default: false })
  supportsMargin: boolean;

  @Column('boolean', { name: 'supports_futures', default: false })
  supportsFutures: boolean;

  @Column('boolean', { name: 'supports_options', default: false })
  supportsOptions: boolean;

  @Column('boolean', { name: 'supports_staking', default: false })
  supportsStaking: boolean;

  @Column('jsonb', { name: 'execution_capabilities', nullable: true })
  executionCapabilities: Record<string, any> | null;

  @Column('jsonb', { name: 'fee_schedule', nullable: true })
  feeSchedule: Record<string, any> | null;

  @Column('int', { name: 'rate_limit_orders', default: 10 })
  rateLimitOrders: number;

  @Column('int', { name: 'rate_limit_queries', default: 20 })
  rateLimitQueries: number;

  @Column('int', { name: 'rate_limit_ws', default: 5 })
  rateLimitWs: number;

  @Column('numeric', { name: 'min_order_size_usd', precision: 18, scale: 2, nullable: true })
  minOrderSizeUsd: number | null;

  @Column('numeric', { name: 'max_order_size_usd', precision: 18, scale: 2, nullable: true })
  maxOrderSizeUsd: number | null;

  @Column('jsonb', { name: 'supported_pairs', nullable: true })
  supportedPairs: any[] | null;

  @Column('text', { name: 'available_tiers', array: true, nullable: true })
  availableTiers: string[] | null;

  @Column('varchar', { name: 'oauth_client_id', length: 255, nullable: true })
  oauthClientId: string | null;

  @Column('varchar', { name: 'oauth_authorize_url', length: 500, nullable: true })
  oauthAuthorizeUrl: string | null;

  @Column('varchar', { name: 'oauth_token_url', length: 500, nullable: true })
  oauthTokenUrl: string | null;

  @Column('text', { name: 'oauth_scopes', array: true, nullable: true })
  oauthScopes: string[] | null;

  @Column('uuid', { name: 'activated_by', nullable: true })
  activatedBy: string | null;

  @Column('timestamptz', { name: 'activated_at', nullable: true })
  activatedAt: Date | null;

  @Column('uuid', { name: 'deactivated_by', nullable: true })
  deactivatedBy: string | null;

  @Column('timestamptz', { name: 'deactivated_at', nullable: true })
  deactivatedAt: Date | null;

  @Column('text', { name: 'maintenance_message', nullable: true })
  maintenanceMessage: string | null;

  @Column('jsonb', { nullable: true })
  config: Record<string, any> | null;

  @Column('boolean', { name: 'requires_platform_auth', default: false })
  requiresPlatformAuth: boolean;

  @Column('varchar', { name: 'platform_api_key', length: 255, nullable: true })
  platformApiKey: string | null;

  @Column('varchar', { name: 'platform_api_secret', length: 255, nullable: true })
  platformApiSecret: string | null;

  @Column('varchar', { name: 'platform_api_password', length: 255, nullable: true })
  platformApiPassword: string | null;

  @Column('varchar', { name: 'sandbox_api_key', length: 255, nullable: true })
  sandboxApiKey: string | null;

  @Column('varchar', { name: 'sandbox_api_secret', length: 255, nullable: true })
  sandboxApiSecret: string | null;

  @Column('varchar', { name: 'sandbox_api_password', length: 255, nullable: true })
  sandboxApiPassword: string | null;

  @Column('boolean', { name: 'allow_all_pairs', default: false })
  allowAllPairs: boolean;

  @Column('timestamptz', { name: 'last_sync_at', nullable: true })
  lastSyncAt: Date | null;

  @Column('varchar', { name: 'last_sync_status', length: 20, nullable: true })
  lastSyncStatus: string | null;

  @Column('int', { name: 'last_sync_pair_count', nullable: true })
  lastSyncPairCount: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
