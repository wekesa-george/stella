import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'exchange', name: 'platform_exchanges' })
export class PlatformExchange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'exchange_key', length: 50, unique: true })
  exchangeKey: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column('varchar', { length: 10, nullable: true })
  icon: string | null;

  @Column('boolean', { name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column('boolean', { name: 'supports_testnet', default: false })
  supportsTestnet: boolean;

  @Column('varchar', { name: 'api_base_url', length: 255 })
  apiBaseUrl: string;

  @Column('varchar', { name: 'api_base_url_testnet', length: 255, nullable: true })
  apiBaseUrlTestnet: string | null;

  @Column('int', { name: 'rate_limit_per_second', default: 10 })
  rateLimitPerSecond: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
