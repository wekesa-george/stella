import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from './entities/shift.entity';
import { ShiftActivity } from './entities/shift-activity.entity';
import { WatchListItem } from './entities/watch-list-item.entity';
import { StartShiftDto } from './dto/start-shift.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateWatchItemDto } from './dto/create-watch-item.dto';
import { HandoffDto } from './dto/handoff.dto';
import { UpdateNotesDto } from './dto/update-notes.dto';
import { QueryShiftHistoryDto } from './dto/query-shift-history.dto';
import { PaginatedResponse } from '../../common/dto/pagination.dto';
import { FindOptionsWhere } from 'typeorm';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift)
    private readonly shiftsRepo: Repository<Shift>,
    @InjectRepository(ShiftActivity)
    private readonly activitiesRepo: Repository<ShiftActivity>,
    @InjectRepository(WatchListItem)
    private readonly watchListRepo: Repository<WatchListItem>,
  ) {}

  async getCurrent(): Promise<Shift | null> {
    return this.shiftsRepo.findOne({
      where: { status: 'active' },
      order: { startTime: 'DESC' },
      relations: ['activities'],
    });
  }

  async start(dto: StartShiftDto): Promise<Shift> {
    const existing = await this.shiftsRepo.findOneBy({ userId: dto.userId, status: 'active' });
    if (existing) {
      throw new ConflictException('User already has an active shift');
    }

    const shift = this.shiftsRepo.create({
      userId: dto.userId,
      startTime: new Date(),
      status: 'active',
    });
    return this.shiftsRepo.save(shift);
  }

  async getActivities(shiftId: string): Promise<ShiftActivity[]> {
    return this.activitiesRepo.find({
      where: { shiftId },
      order: { createdAt: 'DESC' },
    });
  }

  async createActivity(dto: CreateActivityDto): Promise<ShiftActivity> {
    const activity = this.activitiesRepo.create(dto);
    const saved = await this.activitiesRepo.save(activity);

    // Increment shift actions count
    await this.shiftsRepo.increment({ shiftId: dto.shiftId }, 'actionsCount', 1);
    if (dto.priority === 'critical') {
      await this.shiftsRepo.increment({ shiftId: dto.shiftId }, 'incidentsCount', 1);
    }

    return saved;
  }

  async getWatchList(shiftId?: string): Promise<WatchListItem[]> {
    const where: any = { status: 'active' };
    if (shiftId) where.shiftId = shiftId;

    return this.watchListRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async createWatchItem(dto: CreateWatchItemDto): Promise<WatchListItem> {
    const item = this.watchListRepo.create(dto);
    return this.watchListRepo.save(item);
  }

  async handoff(dto: HandoffDto): Promise<Shift> {
    const shift = await this.shiftsRepo.findOneBy({ shiftId: dto.shiftId });
    if (!shift) throw new NotFoundException(`Shift ${dto.shiftId} not found`);

    shift.status = 'ended';
    shift.endTime = new Date();
    shift.durationMinutes = Math.round(
      (shift.endTime.getTime() - shift.startTime.getTime()) / 60000,
    );
    shift.handoffNotes = dto.handoffNotes;
    shift.handoffSubmittedAt = new Date();
    shift.handoffReceivedBy = dto.receivedBy;

    return this.shiftsRepo.save(shift);
  }

  async updateNotes(shiftId: string, dto: UpdateNotesDto): Promise<Shift> {
    const shift = await this.shiftsRepo.findOneBy({ shiftId });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);

    shift.handoffNotes = dto.handoffNotes;
    return this.shiftsRepo.save(shift);
  }

  async getHistory(query: QueryShiftHistoryDto): Promise<PaginatedResponse<Shift>> {
    const where: FindOptionsWhere<Shift> = {};
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;

    const [data, total] = await this.shiftsRepo.findAndCount({
      where,
      relations: ['activities', 'watchItems'],
      order: { startTime: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
