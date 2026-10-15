import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { BulkAcknowledgeDto } from './dto/bulk-acknowledge.dto';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertsRepo: Repository<Alert>,
  ) {}

  async findAll(query: QueryAlertsDto): Promise<PaginatedResponse<Alert>> {
    const { page, limit, status, alertType, monitoredEntity, from, to } = query;
    const qb = this.alertsRepo.createQueryBuilder('a');

    if (status) {
      qb.andWhere('a.status = :status', { status });
    }
    if (alertType) {
      qb.andWhere('a.alert_type = :alertType', { alertType });
    }
    if (monitoredEntity) {
      qb.andWhere('a.monitored_entity = :monitoredEntity', { monitoredEntity });
    }
    if (from) {
      qb.andWhere('a.created_at >= :from', { from });
    }
    if (to) {
      qb.andWhere('a.created_at <= :to', { to });
    }

    qb.orderBy('a.created_at', 'DESC');
    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getMany();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async acknowledge(id: string): Promise<Alert> {
    const alert = await this.alertsRepo.findOneBy({ id });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);

    alert.status = 'acknowledged';
    return this.alertsRepo.save(alert);
  }

  async bulkAcknowledge(dto: BulkAcknowledgeDto): Promise<{ updated: number }> {
    const result = await this.alertsRepo.update(
      { id: In(dto.ids) },
      { status: 'acknowledged' },
    );
    return { updated: result.affected || 0 };
  }

  async softDelete(id: string): Promise<{ message: string }> {
    const alert = await this.alertsRepo.findOneBy({ id });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);

    alert.status = 'resolved';
    await this.alertsRepo.save(alert);
    return { message: `Alert ${id} resolved` };
  }
}
