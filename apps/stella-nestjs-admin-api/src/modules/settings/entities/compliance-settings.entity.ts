import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'compliance', name: 'compliance_settings' })
export class ComplianceSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('boolean', { name: 'kyc_required' })
  kycRequired: boolean;

  @Column('numeric', { name: 'enhanced_dd_threshold_usd', precision: 15, scale: 2 })
  enhancedDdThresholdUsd: number;

  @Column('boolean', { name: 'sanctions_screening_enabled' })
  sanctionsScreeningEnabled: boolean;

  @Column('boolean', { name: 'aml_monitoring_enabled' })
  amlMonitoringEnabled: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;
}
