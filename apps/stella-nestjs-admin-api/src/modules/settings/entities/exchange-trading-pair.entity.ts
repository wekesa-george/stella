import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'exchange', name: 'exchange_trading_pairs' })
export class ExchangeTradingPair {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'exchange_id', nullable: true })
  exchangeId: string | null;

  @Column('uuid', { name: 'adapter_id', nullable: true })
  adapterId: string | null;

  @Column('varchar', { length: 50 })
  symbol: string;

  @Column('varchar', { name: 'base_currency', length: 20 })
  baseCurrency: string;

  @Column('varchar', { name: 'quote_currency', length: 20 })
  quoteCurrency: string;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @Column('boolean', { default: false })
  delisted: boolean;

  @Column('timestamptz', { name: 'last_seen_at', nullable: true })
  lastSeenAt: Date | null;

  @Column('varchar', { name: 'exchange_status', length: 50, nullable: true })
  exchangeStatus: string | null;

  @Column('varchar', { name: 'market_type', length: 20, nullable: true })
  marketType: string | null;

  @Column('numeric', { name: 'min_amount', nullable: true })
  minAmount: number | null;

  @Column('numeric', { name: 'min_cost', nullable: true })
  minCost: number | null;

  @Column('int', { name: 'price_precision', nullable: true })
  pricePrecision: number | null;

  @Column('int', { name: 'amount_precision', nullable: true })
  amountPrecision: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
