import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kyc', name: 'region_routing' })
export class RegionRouting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'region_name', length: 100 })
  regionName: string;

  @Column('text', { name: 'country_codes', array: true })
  countryCodes: string[];

  @Column('varchar', { name: 'primary_provider', length: 50 })
  primaryProvider: string;

  @Column('varchar', { name: 'fallback_provider', length: 50, nullable: true })
  fallbackProvider: string | null;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @Column('uuid', { name: 'created_by_user_id', nullable: true })
  createdByUserId: string | null;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
