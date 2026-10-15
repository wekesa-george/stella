import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Adapter, AdapterStatus } from './entities/adapter.entity';
import { ExchangeTradingPair } from './entities/exchange-trading-pair.entity';
import * as ccxt from 'ccxt';

@Injectable()
export class TradingPairSyncService {
  private readonly logger = new Logger(TradingPairSyncService.name);

  constructor(
    @InjectRepository(Adapter)
    private readonly adapterRepo: Repository<Adapter>,
    @InjectRepository(ExchangeTradingPair)
    private readonly pairRepo: Repository<ExchangeTradingPair>,
  ) {}

  async syncAdapter(adapterId: string, mode?: 'live' | 'sandbox') {
    const adapter = await this.adapterRepo.findOneBy({ id: adapterId });
    if (!adapter) throw new NotFoundException('Adapter not found');
    if (adapter.status !== AdapterStatus.ACTIVE) {
      throw new ConflictException('Adapter is not active');
    }
    if (adapter.lastSyncStatus === 'running') {
      throw new ConflictException('Sync already in progress for this adapter');
    }

    // Mark as running
    await this.adapterRepo.update(adapterId, { lastSyncStatus: 'running' });

    try {
      const ExchangeClass = (ccxt as any)[adapter.code];
      if (!ExchangeClass) {
        throw new Error(`ccxt does not support exchange: ${adapter.code}`);
      }

      // Determine which credential set to use based on explicit mode or auto-detect.
      const exchangeOpts: Record<string, any> = { enableRateLimit: true };
      const useSandbox = mode === 'sandbox' || (mode !== 'live' && !!adapter.sandboxApiKey);

      if (useSandbox && adapter.sandboxApiKey) {
        exchangeOpts.apiKey = adapter.sandboxApiKey;
        exchangeOpts.secret = adapter.sandboxApiSecret;
        exchangeOpts.password = adapter.sandboxApiPassword;
        exchangeOpts.sandbox = true;
      } else if (adapter.platformApiKey) {
        exchangeOpts.apiKey = adapter.platformApiKey;
        exchangeOpts.secret = adapter.platformApiSecret;
        exchangeOpts.password = adapter.platformApiPassword;
      }

      this.logger.log(
        `Initializing ${adapter.code} with credentials: apiKey=${exchangeOpts.apiKey ? 'SET' : 'MISSING'}, secret=${exchangeOpts.secret ? 'SET' : 'MISSING'}, sandbox=${!!exchangeOpts.sandbox}`,
      );

      const exchange = new ExchangeClass(exchangeOpts);

      let markets: any[];
      try {
        markets = await exchange.fetchMarkets();
      } catch (fetchErr: any) {
        this.logger.error(`fetchMarkets error for ${adapter.code}: ${fetchErr.constructor.name}: ${fetchErr.message}`);
        if (fetchErr instanceof ccxt.AuthenticationError) {
          const hasCredentials = !!adapter.platformApiKey;
          const detail = hasCredentials
            ? `Credentials were provided but the exchange rejected them (${fetchErr.constructor.name}). Check that the API key has the correct permissions and is not expired.`
            : `Enable "Requires Platform Auth" and add platform API credentials on the adapter settings page.`;
          throw new Error(
            `${adapter.code}: ${detail}`,
          );
        }
        throw fetchErr;
      }

      const now = new Date();
      const manager = this.pairRepo.manager;

      // Batch upsert via raw SQL for performance
      const batchSize = 500;
      for (let i = 0; i < markets.length; i += batchSize) {
        const batch = markets.slice(i, i + batchSize);
        const values = batch
          .map((m: any) => {
            const symbol = this.escSql(m.symbol || '');
            const base = this.escSql(m.base || '');
            const quote = this.escSql(m.quote || '');
            const status = this.escSql(m.active !== undefined ? (m.active ? 'active' : 'inactive') : 'unknown');
            const marketType = this.escSql(m.type || 'spot');
            const minAmount = m.limits?.amount?.min != null ? m.limits.amount.min : 'NULL';
            const minCost = m.limits?.cost?.min != null ? m.limits.cost.min : 'NULL';
            const pricePrecision = m.precision?.price != null ? Math.round(m.precision.price) : 'NULL';
            const amountPrecision = m.precision?.amount != null ? Math.round(m.precision.amount) : 'NULL';
            const isActive = adapter.allowAllPairs ? 'true' : 'false';

            return `(gen_random_uuid(), '${adapterId}', '${symbol}', '${base}', '${quote}', ${isActive}, false, '${now.toISOString()}', '${status}', '${marketType}', ${minAmount}, ${minCost}, ${pricePrecision}, ${amountPrecision}, NOW(), NOW())`;
          })
          .join(',\n');

        await manager.query(`
          INSERT INTO exchange.exchange_trading_pairs
            (id, adapter_id, symbol, base_currency, quote_currency, is_active, delisted, last_seen_at, exchange_status, market_type, min_amount, min_cost, price_precision, amount_precision, created_at, updated_at)
          VALUES ${values}
          ON CONFLICT (adapter_id, symbol) DO UPDATE SET
            last_seen_at = EXCLUDED.last_seen_at,
            exchange_status = EXCLUDED.exchange_status,
            market_type = EXCLUDED.market_type,
            min_amount = EXCLUDED.min_amount,
            min_cost = EXCLUDED.min_cost,
            price_precision = EXCLUDED.price_precision,
            amount_precision = EXCLUDED.amount_precision,
            delisted = false,
            updated_at = NOW()
        `);
      }

      // Flag pairs not seen in this sync as delisted
      await manager.query(`
        UPDATE exchange.exchange_trading_pairs
        SET delisted = true, updated_at = NOW()
        WHERE adapter_id = $1
          AND (last_seen_at IS NULL OR last_seen_at < $2)
          AND delisted = false
      `, [adapterId, now]);

      // Update adapter sync metadata
      await this.adapterRepo.update(adapterId, {
        lastSyncAt: now,
        lastSyncStatus: 'success',
        lastSyncPairCount: markets.length,
      });

      this.logger.log(`Synced ${markets.length} pairs for adapter ${adapter.code}`);

      return {
        adapterId,
        adapterCode: adapter.code,
        pairsFound: markets.length,
        status: 'success',
        syncedAt: now,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync failed for adapter ${adapter.code}: ${errMsg}`);

      await this.adapterRepo.update(adapterId, {
        lastSyncStatus: 'failed',
      });

      throw error;
    }
  }

  async syncAllActiveAdapters() {
    const adapters = await this.adapterRepo.find({
      where: { status: AdapterStatus.ACTIVE },
    });

    const results: any[] = [];
    for (const adapter of adapters) {
      try {
        const result = await this.syncAdapter(adapter.id);
        results.push(result);
      } catch (error) {
        results.push({
          adapterId: adapter.id,
          adapterCode: adapter.code,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  async getTradingPairs(
    adapterId: string,
    filters?: {
      isActive?: boolean;
      delisted?: boolean;
      search?: string;
      marketType?: string;
    },
  ) {
    const adapter = await this.adapterRepo.findOneBy({ id: adapterId });
    if (!adapter) throw new NotFoundException('Adapter not found');

    let qb = this.pairRepo
      .createQueryBuilder('p')
      .where('p.adapter_id = :adapterId', { adapterId });

    if (filters?.isActive !== undefined) {
      qb = qb.andWhere('p.is_active = :isActive', { isActive: filters.isActive });
    }
    if (filters?.delisted !== undefined) {
      qb = qb.andWhere('p.delisted = :delisted', { delisted: filters.delisted });
    }
    if (filters?.search) {
      qb = qb.andWhere('p.symbol ILIKE :search', { search: `%${filters.search}%` });
    }
    if (filters?.marketType) {
      qb = qb.andWhere('p.market_type = :marketType', { marketType: filters.marketType });
    }

    qb = qb.orderBy('p.symbol', 'ASC');

    return qb.getMany();
  }

  async togglePair(pairId: string, isActive: boolean) {
    const pair = await this.pairRepo.findOneBy({ id: pairId });
    if (!pair) throw new NotFoundException('Trading pair not found');

    await this.pairRepo.update(pairId, { isActive });
    return this.pairRepo.findOneBy({ id: pairId });
  }

  async bulkTogglePairs(adapterId: string, pairIds: string[], isActive: boolean) {
    const adapter = await this.adapterRepo.findOneBy({ id: adapterId });
    if (!adapter) throw new NotFoundException('Adapter not found');

    if (pairIds.length === 0) return { updated: 0 };

    const result = await this.pairRepo
      .createQueryBuilder()
      .update()
      .set({ isActive })
      .where('adapter_id = :adapterId AND id IN (:...pairIds)', {
        adapterId,
        pairIds,
      })
      .execute();

    return { updated: result.affected || 0 };
  }

  async getAdapterPairStats(adapterId: string) {
    const adapter = await this.adapterRepo.findOneBy({ id: adapterId });
    if (!adapter) throw new NotFoundException('Adapter not found');

    const result = await this.pairRepo.manager.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active = true AND delisted = false)::int AS active,
        COUNT(*) FILTER (WHERE is_active = false AND delisted = false)::int AS inactive,
        COUNT(*) FILTER (WHERE delisted = true)::int AS delisted
      FROM exchange.exchange_trading_pairs
      WHERE adapter_id = $1
    `,
      [adapterId],
    );

    return result[0] || { total: 0, active: 0, inactive: 0, delisted: 0 };
  }

  private escSql(val: string): string {
    return val.replace(/'/g, "''");
  }
}
