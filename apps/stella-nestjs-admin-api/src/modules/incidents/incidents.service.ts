import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  FindOptionsWhere,
  IsNull,
  Not,
  In,
} from 'typeorm';
import { Incident } from './entities/incident.entity';
import { KillSwitchActivation } from './entities/kill-switch-activation.entity';
import { RogueBotIncident } from './entities/rogue-bot-incident.entity';
import { IncidentCounter } from './entities/incident-counter.entity';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { CreateKillSwitchDto } from './dto/create-kill-switch.dto';
import { CreateRogueBotDto } from './dto/create-rogue-bot.dto';
import { NilShiftDto } from './dto/nil-shift.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidentsRepo: Repository<Incident>,
    @InjectRepository(KillSwitchActivation)
    private readonly killSwitchRepo: Repository<KillSwitchActivation>,
    @InjectRepository(RogueBotIncident)
    private readonly rogueBotRepo: Repository<RogueBotIncident>,
    @InjectRepository(IncidentCounter)
    private readonly counterRepo: Repository<IncidentCounter>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Atomically generate the next incident number for the current year.
   * Format: INC-YYYY-NNNN
   */
  async generateIncidentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await this.dataSource.query(
      `INSERT INTO operations.incident_counters (year, last_number)
       VALUES ($1, 1)
       ON CONFLICT (year)
       DO UPDATE SET last_number = operations.incident_counters.last_number + 1
       RETURNING last_number`,
      [year],
    );
    const seq = result[0].last_number;
    return `INC-${year}-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Create an incident, optionally with kill switch and/or rogue bot records in a transaction.
   */
  async create(dto: CreateIncidentDto): Promise<Incident> {
    const incidentNumber = await this.generateIncidentNumber();
    const date = dto.date || new Date().toISOString().split('T')[0];

    return this.dataSource.transaction(async (manager) => {
      const incidentData: Partial<Incident> = {
        incidentNumber,
        operatorId: dto.operatorId,
        date,
        shiftType: dto.shiftType,
        priority: dto.priority,
        category: dto.category,
        title: dto.title,
        supervisorNotified: dto.supervisorNotified || false,
        pnlImpactUsd: dto.pnlImpactUsd ?? 0,
        killSwitchActivated: dto.killSwitchActivated || false,
        isCorrection: false,
      };

      if (dto.shiftId) incidentData.shiftId = dto.shiftId;
      if (dto.timeDetected) incidentData.timeDetected = dto.timeDetected;
      if (dto.botRef) incidentData.botRef = dto.botRef;
      if (dto.accountRef) incidentData.accountRef = dto.accountRef;
      if (dto.description) incidentData.description = dto.description;
      if (dto.actionTaken) incidentData.actionTaken = dto.actionTaken;
      if (dto.supervisorId) incidentData.supervisorId = dto.supervisorId;
      if (dto.supervisorNotified) incidentData.supervisorNotifiedAt = new Date();
      if (dto.rootCause) incidentData.rootCause = dto.rootCause;
      if (dto.preventable) incidentData.preventable = dto.preventable;
      if (dto.notes) incidentData.notes = dto.notes;

      const incident = manager.create(Incident, incidentData);
      const savedIncident = await manager.save(incident);

      // Optionally create kill switch activation
      if (dto.killSwitch) {
        const ksData: Partial<KillSwitchActivation> = {
          incidentId: savedIncident.id,
          timeActivated: dto.killSwitch.timeActivated,
          operatorId: dto.killSwitch.operatorId,
          scope: dto.killSwitch.scope,
          reason: dto.killSwitch.reason,
        };
        if (dto.killSwitch.date) ksData.date = dto.killSwitch.date;
        if (dto.killSwitch.botsAffected) ksData.botsAffected = dto.killSwitch.botsAffected;
        if (dto.killSwitch.accountRefs) ksData.accountRefs = dto.killSwitch.accountRefs;
        if (dto.killSwitch.openOrdersAtActivation) ksData.openOrdersAtActivation = dto.killSwitch.openOrdersAtActivation;
        if (dto.killSwitch.pnlAtActivationUsd !== undefined) ksData.pnlAtActivationUsd = dto.killSwitch.pnlAtActivationUsd;
        if (dto.killSwitch.timeToResolveInterval) ksData.timeToResolveInterval = dto.killSwitch.timeToResolveInterval;
        if (dto.killSwitch.authorizedRestartBy) ksData.authorizedRestartBy = dto.killSwitch.authorizedRestartBy;
        if (dto.killSwitch.notes) ksData.notes = dto.killSwitch.notes;

        const ks = manager.create(KillSwitchActivation, ksData);
        await manager.save(ks);

        savedIncident.killSwitchActivated = true;
        await manager.save(savedIncident);
      }

      // Optionally create rogue bot incident
      if (dto.rogueBot) {
        const rbData: Partial<RogueBotIncident> = {
          incidentId: savedIncident.id,
          timeDetected: dto.rogueBot.timeDetected,
          operatorId: dto.rogueBot.operatorId,
          botRef: dto.rogueBot.botRef,
          rogueBehaviourObserved: dto.rogueBot.rogueBehaviourObserved,
          wrongPair: dto.rogueBot.wrongPair || false,
          wrongDirection: dto.rogueBot.wrongDirection || false,
          killSwitchActivated: dto.rogueBot.killSwitchActivated || false,
          pnlImpactUsd: dto.rogueBot.pnlImpactUsd ?? 0,
        };
        if (dto.rogueBot.date) rbData.date = dto.rogueBot.date;
        if (dto.rogueBot.accountRef) rbData.accountRef = dto.rogueBot.accountRef;
        if (dto.rogueBot.normalFreqPerHour !== undefined) rbData.normalFreqPerHour = dto.rogueBot.normalFreqPerHour;
        if (dto.rogueBot.rogueFreqPerHour !== undefined) rbData.rogueFreqPerHour = dto.rogueBot.rogueFreqPerHour;
        if (dto.rogueBot.immediateAction) rbData.immediateAction = dto.rogueBot.immediateAction;
        if (dto.rogueBot.rootCause) rbData.rootCause = dto.rogueBot.rootCause;

        const rb = manager.create(RogueBotIncident, rbData);
        await manager.save(rb);
      }

      // Auto-create shift activity if shiftId is provided
      if (dto.shiftId) {
        await manager.query(
          `INSERT INTO operations.shift_activities
           (activity_id, shift_id, user_id, action, notes, priority, created_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW())`,
          [
            dto.shiftId,
            dto.operatorId,
            `Incident logged: ${savedIncident.incidentNumber}`,
            `[${dto.priority}] ${dto.title}`,
            dto.priority === 'P1' ? 'critical' : 'normal',
          ],
        );
      }

      return savedIncident;
    });
  }

  /**
   * Find all incidents with pagination and filters.
   */
  async findAll(query: QueryIncidentsDto): Promise<PaginatedResponse<Incident>> {
    const qb = this.incidentsRepo.createQueryBuilder('incident');

    if (query.priority) qb.andWhere('incident.priority = :priority', { priority: query.priority });
    if (query.category) qb.andWhere('incident.category = :category', { category: query.category });
    if (query.status) qb.andWhere('incident.status = :status', { status: query.status });
    if (query.shiftId) qb.andWhere('incident.shift_id = :shiftId', { shiftId: query.shiftId });
    if (query.operatorId) qb.andWhere('incident.operator_id = :operatorId', { operatorId: query.operatorId });
    if (query.dateFrom) qb.andWhere('incident.date >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('incident.date <= :dateTo', { dateTo: query.dateTo });

    if (query.month) {
      qb.andWhere("to_char(incident.date, 'YYYY-MM') = :month", { month: query.month });
    }

    if (query.archived === true) {
      qb.andWhere('incident.archived_at IS NOT NULL');
    } else if (query.archived === false) {
      qb.andWhere('incident.archived_at IS NULL');
    }

    qb.orderBy('incident.created_at', 'DESC');
    qb.skip((query.page - 1) * query.limit);
    qb.take(query.limit);

    const [data, total] = await qb.getManyAndCount();

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

  /**
   * Find a single incident by ID with relations.
   */
  async findOne(id: string): Promise<Incident> {
    const incident = await this.incidentsRepo.findOne({
      where: { id },
      relations: ['killSwitchActivations', 'rogueBotIncidents'],
    });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    return incident;
  }

  /**
   * Partial update of an incident.
   */
  async update(id: string, dto: UpdateIncidentDto): Promise<Incident> {
    const incident = await this.incidentsRepo.findOneBy({ id });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);

    if (dto.status !== undefined) incident.status = dto.status;
    if (dto.actionTaken !== undefined) incident.actionTaken = dto.actionTaken;
    if (dto.rootCause !== undefined) incident.rootCause = dto.rootCause;
    if (dto.notes !== undefined) incident.notes = dto.notes;
    if (dto.escalatedTo !== undefined) incident.escalatedTo = dto.escalatedTo;
    if (dto.timeToContainMins !== undefined) incident.timeToContainMins = dto.timeToContainMins;
    if (dto.timeToResolveMins !== undefined) incident.timeToResolveMins = dto.timeToResolveMins;
    if (dto.pnlImpactUsd !== undefined) incident.pnlImpactUsd = dto.pnlImpactUsd;
    if (dto.preventable !== undefined) incident.preventable = dto.preventable;
    if (dto.supervisorNotified !== undefined) incident.supervisorNotified = dto.supervisorNotified;
    if (dto.supervisorId !== undefined) incident.supervisorId = dto.supervisorId;

    incident.updatedAt = new Date();
    return this.incidentsRepo.save(incident);
  }

  /**
   * Escalate an incident.
   */
  async escalate(id: string): Promise<Incident> {
    const incident = await this.incidentsRepo.findOneBy({ id });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);

    incident.status = 'escalated';
    incident.supervisorNotified = true;
    incident.supervisorNotifiedAt = new Date();
    incident.updatedAt = new Date();
    return this.incidentsRepo.save(incident);
  }

  /**
   * Resolve an incident.
   */
  async resolve(id: string, dto: UpdateIncidentDto): Promise<Incident> {
    const incident = await this.incidentsRepo.findOneBy({ id });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);

    incident.status = 'resolved';
    if (dto.timeToResolveMins !== undefined) incident.timeToResolveMins = dto.timeToResolveMins;
    if (dto.timeToContainMins !== undefined) incident.timeToContainMins = dto.timeToContainMins;
    if (dto.actionTaken !== undefined) incident.actionTaken = dto.actionTaken;
    if (dto.rootCause !== undefined) incident.rootCause = dto.rootCause;
    if (dto.notes !== undefined) incident.notes = dto.notes;
    incident.updatedAt = new Date();
    return this.incidentsRepo.save(incident);
  }

  /**
   * Countersign an incident — supervisor signs off.
   */
  async countersign(id: string, adminId: string): Promise<Incident> {
    const incident = await this.incidentsRepo.findOneBy({ id });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);

    incident.supervisorCountersignedBy = adminId;
    incident.supervisorCountersignedAt = new Date();
    incident.updatedAt = new Date();
    return this.incidentsRepo.save(incident);
  }

  /**
   * Create a correction incident linked to the original.
   */
  async createCorrection(id: string, dto: CreateIncidentDto): Promise<Incident> {
    const original = await this.incidentsRepo.findOneBy({ id });
    if (!original) throw new NotFoundException(`Incident ${id} not found`);

    const incidentNumber = await this.generateIncidentNumber();
    const date = dto.date || new Date().toISOString().split('T')[0];

    const correctionData: Partial<Incident> = {
      incidentNumber,
      operatorId: dto.operatorId,
      date,
      shiftType: dto.shiftType,
      priority: dto.priority,
      category: dto.category,
      title: dto.title,
      supervisorNotified: dto.supervisorNotified || false,
      pnlImpactUsd: dto.pnlImpactUsd ?? 0,
      killSwitchActivated: dto.killSwitchActivated || false,
      correctsIncidentId: id,
      isCorrection: true,
    };

    if (dto.shiftId) correctionData.shiftId = dto.shiftId;
    else if (original.shiftId) correctionData.shiftId = original.shiftId;
    if (dto.timeDetected) correctionData.timeDetected = dto.timeDetected;
    if (dto.botRef) correctionData.botRef = dto.botRef;
    else if (original.botRef) correctionData.botRef = original.botRef;
    if (dto.accountRef) correctionData.accountRef = dto.accountRef;
    else if (original.accountRef) correctionData.accountRef = original.accountRef;
    if (dto.description) correctionData.description = dto.description;
    if (dto.actionTaken) correctionData.actionTaken = dto.actionTaken;
    if (dto.supervisorId) correctionData.supervisorId = dto.supervisorId;
    if (dto.rootCause) correctionData.rootCause = dto.rootCause;
    if (dto.preventable) correctionData.preventable = dto.preventable;
    if (dto.notes) correctionData.notes = dto.notes;

    const correction = this.incidentsRepo.create(correctionData);
    return this.incidentsRepo.save(correction);
  }

  /**
   * Log a nil shift — no incidents occurred during the shift.
   */
  async logNilShift(dto: NilShiftDto): Promise<Incident> {
    const incidentNumber = await this.generateIncidentNumber();
    const date = new Date().toISOString().split('T')[0];

    const nilData: Partial<Incident> = {
      incidentNumber,
      operatorId: dto.operatorId,
      date,
      shiftType: dto.shiftType,
      priority: 'P4',
      category: 'nil_shift',
      title: `No incidents during ${dto.shiftType} shift on ${date}`,
      status: 'resolved',
      supervisorNotified: false,
      pnlImpactUsd: 0,
      killSwitchActivated: false,
      isCorrection: false,
    };

    if (dto.shiftId) nilData.shiftId = dto.shiftId;

    const incident = this.incidentsRepo.create(nilData);
    return this.incidentsRepo.save(incident);
  }

  /**
   * List kill switch activations with pagination.
   */
  async getKillSwitchActivations(
    query: QueryIncidentsDto,
  ): Promise<PaginatedResponse<KillSwitchActivation>> {
    const [data, total] = await this.killSwitchRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      relations: ['incident'],
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

  /**
   * Create a kill switch activation for an existing incident.
   */
  async createKillSwitch(
    incidentId: string,
    dto: CreateKillSwitchDto,
  ): Promise<KillSwitchActivation> {
    const incident = await this.incidentsRepo.findOneBy({ id: incidentId });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    const ksData: Partial<KillSwitchActivation> = {
      incidentId,
      timeActivated: dto.timeActivated,
      operatorId: dto.operatorId,
      scope: dto.scope,
      reason: dto.reason,
    };
    if (dto.date) ksData.date = dto.date;
    if (dto.botsAffected) ksData.botsAffected = dto.botsAffected;
    if (dto.accountRefs) ksData.accountRefs = dto.accountRefs;
    if (dto.openOrdersAtActivation) ksData.openOrdersAtActivation = dto.openOrdersAtActivation;
    if (dto.pnlAtActivationUsd !== undefined) ksData.pnlAtActivationUsd = dto.pnlAtActivationUsd;
    if (dto.timeToResolveInterval) ksData.timeToResolveInterval = dto.timeToResolveInterval;
    if (dto.authorizedRestartBy) ksData.authorizedRestartBy = dto.authorizedRestartBy;
    if (dto.notes) ksData.notes = dto.notes;

    const ks = this.killSwitchRepo.create(ksData);
    const saved = await this.killSwitchRepo.save(ks);

    // Update incident to reflect kill switch activation
    incident.killSwitchActivated = true;
    incident.updatedAt = new Date();
    await this.incidentsRepo.save(incident);

    return saved;
  }

  /**
   * List rogue bot incidents with pagination.
   */
  async getRogueBotIncidents(
    query: QueryIncidentsDto,
  ): Promise<PaginatedResponse<RogueBotIncident>> {
    const [data, total] = await this.rogueBotRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      relations: ['incident'],
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

  /**
   * Create a rogue bot incident record for an existing incident.
   */
  async createRogueBot(
    incidentId: string,
    dto: CreateRogueBotDto,
  ): Promise<RogueBotIncident> {
    const incident = await this.incidentsRepo.findOneBy({ id: incidentId });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    const rbData: Partial<RogueBotIncident> = {
      incidentId,
      timeDetected: dto.timeDetected,
      operatorId: dto.operatorId,
      botRef: dto.botRef,
      rogueBehaviourObserved: dto.rogueBehaviourObserved,
      wrongPair: dto.wrongPair || false,
      wrongDirection: dto.wrongDirection || false,
      killSwitchActivated: dto.killSwitchActivated || false,
      pnlImpactUsd: dto.pnlImpactUsd ?? 0,
    };
    if (dto.date) rbData.date = dto.date;
    if (dto.accountRef) rbData.accountRef = dto.accountRef;
    if (dto.normalFreqPerHour !== undefined) rbData.normalFreqPerHour = dto.normalFreqPerHour;
    if (dto.rogueFreqPerHour !== undefined) rbData.rogueFreqPerHour = dto.rogueFreqPerHour;
    if (dto.immediateAction) rbData.immediateAction = dto.immediateAction;
    if (dto.rootCause) rbData.rootCause = dto.rootCause;

    const rb = this.rogueBotRepo.create(rbData);
    return this.rogueBotRepo.save(rb);
  }

  /**
   * Get all open or escalated incidents with calculated days_open.
   */
  async getOpenIncidents(): Promise<any[]> {
    const incidents = await this.incidentsRepo.find({
      where: [{ status: 'open' }, { status: 'escalated' }],
      order: { createdAt: 'DESC' },
      relations: ['killSwitchActivations', 'rogueBotIncidents'],
    });

    const now = new Date();
    return incidents.map((incident) => {
      const created = new Date(incident.date);
      const daysOpen = Math.max(
        1,
        Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)),
      );
      return { ...incident, daysOpen };
    });
  }

  /**
   * Get monthly summary with aggregations.
   */
  async getSummary(query: SummaryQueryDto) {
    const { month } = query;

    const [byPriority, byCategory, byShift, metrics] = await Promise.all([
      this.dataSource.query(
        `SELECT priority, COUNT(*)::int as count
         FROM operations.incidents
         WHERE to_char(date, 'YYYY-MM') = $1 AND is_correction = false
         GROUP BY priority`,
        [month],
      ),
      this.dataSource.query(
        `SELECT category, COUNT(*)::int as count
         FROM operations.incidents
         WHERE to_char(date, 'YYYY-MM') = $1 AND is_correction = false
         GROUP BY category`,
        [month],
      ),
      this.dataSource.query(
        `SELECT shift_type, COUNT(*)::int as count
         FROM operations.incidents
         WHERE to_char(date, 'YYYY-MM') = $1 AND is_correction = false
         GROUP BY shift_type`,
        [month],
      ),
      this.dataSource.query(
        `SELECT
           COUNT(*)::int as total_incidents,
           COUNT(*) FILTER (WHERE kill_switch_activated = true)::int as kill_switch_count,
           COUNT(*) FILTER (WHERE category = 'rogue_bot')::int as rogue_bot_count,
           COUNT(*) FILTER (WHERE status != 'resolved')::int as open_count,
           COUNT(*) FILTER (WHERE category = 'nil_shift')::int as nil_shift_count,
           ROUND(AVG(time_to_contain_mins) FILTER (WHERE priority = 'P1'), 0)::int as avg_contain_p1_mins,
           COALESCE(SUM(pnl_impact_usd), 0)::numeric as total_pnl_impact
         FROM operations.incidents
         WHERE to_char(date, 'YYYY-MM') = $1 AND is_correction = false`,
        [month],
      ),
    ]);

    return {
      month,
      byPriority,
      byCategory,
      byShift,
      metrics: metrics[0] || {
        total_incidents: 0,
        kill_switch_count: 0,
        rogue_bot_count: 0,
        open_count: 0,
        nil_shift_count: 0,
        avg_contain_p1_mins: null,
        total_pnl_impact: 0,
      },
    };
  }

  /**
   * Get shift register — shifts joined with incident counts for a given month.
   */
  async getShiftRegister(query: SummaryQueryDto) {
    const { month } = query;

    const rows = await this.dataSource.query(
      `SELECT
         s.shift_id,
         s.user_id as operator_id,
         s.start_time,
         s.end_time,
         s.status as shift_status,
         s.shift_type,
         s.handoff_notes,
         COUNT(i.id)::int as total_incidents,
         COUNT(i.id) FILTER (WHERE i.priority = 'P1')::int as p1_count,
         COUNT(i.id) FILTER (WHERE i.priority = 'P2')::int as p2_count,
         COUNT(i.id) FILTER (WHERE i.priority = 'P3')::int as p3_count,
         COUNT(i.id) FILTER (WHERE i.priority = 'P4')::int as p4_count,
         BOOL_OR(i.kill_switch_activated) as kill_switch_activated
       FROM operations.shifts s
       LEFT JOIN operations.incidents i
         ON i.shift_id = s.shift_id
         AND i.is_correction = false
       WHERE to_char(s.start_time, 'YYYY-MM') = $1
       GROUP BY s.shift_id, s.user_id, s.start_time, s.end_time, s.status, s.shift_type, s.handoff_notes
       ORDER BY s.start_time DESC`,
      [month],
    );

    return { month, shifts: rows };
  }

  /**
   * Archive all incidents for a given month.
   */
  async archiveMonth(month: string, adminId: string): Promise<{ affected: number }> {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }

    const result = await this.dataSource.query(
      `UPDATE operations.incidents
       SET archived_at = NOW(),
           archived_by = $2::uuid,
           archive_month = $1,
           updated_at = NOW()
       WHERE to_char(date, 'YYYY-MM') = $1
         AND archived_at IS NULL
         AND is_correction = false`,
      [month, adminId],
    );

    return { affected: result[1] || 0 };
  }

  /**
   * List distinct archived months.
   */
  async getArchivedMonths(): Promise<{ month: string; count: number }[]> {
    return this.dataSource.query(
      `SELECT archive_month as month, COUNT(*)::int as count
       FROM operations.incidents
       WHERE archived_at IS NOT NULL AND archive_month IS NOT NULL
       GROUP BY archive_month
       ORDER BY archive_month DESC`,
    );
  }
}
