import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'platform', name: 'billing_config' })
export class BillingConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('numeric', { name: 'platform_fee_pct', precision: 5, scale: 4 })
  platformFeePct: number;

  @Column('numeric', { name: 'min_aum_free_tier', precision: 15, scale: 2 })
  minAumFreeTier: number;

  @Column('numeric', { name: 'max_aum_free_tier', precision: 15, scale: 2 })
  maxAumFreeTier: number;

  @Column('numeric', { name: 'tier_standard_fee_pct', precision: 5, scale: 4 })
  tierStandardFeePct: number;

  @Column('numeric', { name: 'tier_pro_fee_pct', precision: 5, scale: 4 })
  tierProFeePct: number;

  @Column('numeric', { name: 'tier_enterprise_fee_pct', precision: 5, scale: 4 })
  tierEnterpriseFeePct: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;
}
