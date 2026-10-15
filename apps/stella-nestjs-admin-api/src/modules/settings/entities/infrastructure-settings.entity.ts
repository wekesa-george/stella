import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'platform', name: 'infrastructure_settings' })
export class InfrastructureSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int', { name: 'db_pool_size', default: 20 })
  dbPoolSize: number;

  @Column('int', { name: 'redis_pool_size', default: 10 })
  redisPoolSize: number;

  @Column('int', { name: 'cache_ttl_seconds', default: 300 })
  cacheTtlSeconds: number;

  @Column('int', { name: 'rate_limit_global', default: 1000 })
  rateLimitGlobal: number;

  @Column('int', { name: 'rate_limit_per_user', default: 100 })
  rateLimitPerUser: number;

  @Column('int', { name: 'websocket_max_connections', default: 5000 })
  websocketMaxConnections: number;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
