import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'exchange', name: 'asset_tier_config' })
export class AssetTierConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'adapter_id', unique: true })
  adapterId: string;

  // Tier balance thresholds (USD)
  @Column('numeric', { name: 'tier1_min_balance', precision: 18, scale: 2, default: 100 })
  tier1MinBalance: number;

  @Column('numeric', { name: 'tier2_min_balance', precision: 18, scale: 2, default: 300 })
  tier2MinBalance: number;

  @Column('numeric', { name: 'tier3_min_balance', precision: 18, scale: 2, default: 1500 })
  tier3MinBalance: number;

  @Column('numeric', { name: 'tier4_min_balance', precision: 18, scale: 2, default: 7500 })
  tier4MinBalance: number;

  // Position size limits (fraction of balance)
  @Column('numeric', { name: 'tier1_max_position_pct', precision: 5, scale: 4, default: 0.12 })
  tier1MaxPositionPct: number;

  @Column('numeric', { name: 'tier2_max_position_pct', precision: 5, scale: 4, default: 0.08 })
  tier2MaxPositionPct: number;

  @Column('numeric', { name: 'tier3_max_position_pct', precision: 5, scale: 4, default: 0.05 })
  tier3MaxPositionPct: number;

  @Column('numeric', { name: 'tier4_max_position_pct', precision: 5, scale: 4, default: 0.03 })
  tier4MaxPositionPct: number;

  // Max concurrent positions per tier
  @Column('int', { name: 'tier1_max_positions', default: 3 })
  tier1MaxPositions: number;

  @Column('int', { name: 'tier2_max_positions', default: 5 })
  tier2MaxPositions: number;

  @Column('int', { name: 'tier3_max_positions', default: 7 })
  tier3MaxPositions: number;

  @Column('int', { name: 'tier4_max_positions', default: 10 })
  tier4MaxPositions: number;

  // Asset lists per tier
  @Column('text', { name: 'tier1_assets', array: true, default: '{}' })
  tier1Assets: string[];

  @Column('text', { name: 'tier2_assets', array: true, default: '{}' })
  tier2Assets: string[];

  @Column('text', { name: 'tier3_assets', array: true, default: '{}' })
  tier3Assets: string[];

  @Column('text', { name: 'tier4_assets', array: true, default: '{}' })
  tier4Assets: string[];

  // Global position size cap
  @Column('numeric', { name: 'max_position_pct', precision: 5, scale: 4, default: 0.15 })
  maxPositionPct: number;

  // Confidence multipliers
  @Column('jsonb', { name: 'confidence_multipliers', default: () => `'{"90": 1.3, "80": 1.15, "70": 1.0, "60": 0.85, "default": 0.7}'` })
  confidenceMultipliers: Record<string, number>;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;
}
