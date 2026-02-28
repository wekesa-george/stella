import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'platform', name: 'feature_flags' })
export class FeatureFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'flag_key', length: 100, unique: true })
  flagKey: string;

  @Column('varchar', { length: 200 })
  description: string;

  @Column('boolean', { name: 'enabled_production', default: false })
  enabledProduction: boolean;

  @Column('boolean', { name: 'enabled_staging', default: false })
  enabledStaging: boolean;

  @Column('boolean', { name: 'enabled_development', default: true })
  enabledDevelopment: boolean;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
