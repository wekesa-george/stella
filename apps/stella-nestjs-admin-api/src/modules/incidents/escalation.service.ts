import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { EscalationMatrix } from './entities/escalation-matrix.entity';
import { EscalationLog } from './entities/escalation-log.entity';
import { Incident } from './entities/incident.entity';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  // Auto-escalation timers: incidentId -> setTimeout handle
  private autoEscalationTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    @InjectRepository(EscalationMatrix)
    private readonly matrixRepo: Repository<EscalationMatrix>,
    @InjectRepository(EscalationLog)
    private readonly logRepo: Repository<EscalationLog>,
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {}

  // ===========================================================================
  // MATRIX CRUD
  // ===========================================================================

  async getMatrixRules(): Promise<EscalationMatrix[]> {
    return this.matrixRepo.find({
      order: { priority: 'ASC', tier: 'ASC' },
    });
  }

  async createMatrixRule(dto: Partial<EscalationMatrix>): Promise<EscalationMatrix> {
    const rule = this.matrixRepo.create(dto);
    return this.matrixRepo.save(rule);
  }

  async updateMatrixRule(id: string, dto: Partial<EscalationMatrix>): Promise<EscalationMatrix> {
    const rule = await this.matrixRepo.findOneBy({ id });
    if (!rule) throw new NotFoundException(`Escalation rule ${id} not found`);
    Object.assign(rule, dto);
    rule.updatedAt = new Date();
    return this.matrixRepo.save(rule);
  }

  async deleteMatrixRule(id: string): Promise<void> {
    const result = await this.matrixRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Escalation rule ${id} not found`);
  }

  // ===========================================================================
  // RESOLVE MATRIX
  // ===========================================================================

  /** Find the matching matrix rule for a given priority + category + tier */
  async resolveMatrix(
    priority: string,
    category: string | null,
    tier: number,
  ): Promise<EscalationMatrix | null> {
    // Try category-specific first, then fall back to catch-all (category IS NULL)
    let rule = category
      ? await this.matrixRepo.findOne({
          where: { priority, category, tier, isActive: true },
        })
      : null;

    if (!rule) {
      rule = await this.matrixRepo.findOne({
        where: { priority, category: IsNull(), tier, isActive: true },
      });
    }

    return rule;
  }

  /** Preview the full escalation chain for a priority + category */
  async previewChain(priority: string, category?: string): Promise<EscalationMatrix[]> {
    const rules: EscalationMatrix[] = [];
    for (let tier = 1; tier <= 5; tier++) {
      const rule = await this.resolveMatrix(priority, category || null, tier);
      if (!rule) break;
      rules.push(rule);
    }
    return rules;
  }

  // ===========================================================================
  // ESCALATE INCIDENT
  // ===========================================================================

  /** Escalate an incident to the next tier using the matrix */
  async escalateIncident(
    incidentId: string,
    escalatedBy?: string,
  ): Promise<{ incident: Incident; log: EscalationLog; rule: EscalationMatrix | null }> {
    const incident = await this.incidentRepo.findOneBy({ id: incidentId });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    const currentTier = incident.currentEscalationTier ?? 0;
    const nextTier = currentTier + 1;

    const rule = await this.resolveMatrix(incident.priority, incident.category, nextTier);

    // Resolve target info for display
    let targetRoleName: string | null = null;
    let targetUserName: string | null = null;

    if (rule?.targetRoleId) {
      const roleRow = await this.dataSource.query(
        `SELECT name, code FROM admin.roles WHERE id = $1`,
        [rule.targetRoleId],
      );
      if (roleRow.length) targetRoleName = roleRow[0].name;
    }
    if (rule?.targetUserId) {
      const userRow = await this.dataSource.query(
        `SELECT display_name FROM admin.admin_users WHERE id = $1`,
        [rule.targetUserId],
      );
      if (userRow.length) targetUserName = userRow[0].display_name;
    }

    // Update incident
    incident.status = 'escalated';
    incident.currentEscalationTier = nextTier;
    incident.supervisorNotified = true;
    incident.supervisorNotifiedAt = new Date();
    incident.escalatedTo = targetRoleName || targetUserName || `Tier ${nextTier}`;
    incident.updatedAt = new Date();

    if (rule?.responseTimeMins) {
      incident.escalationDeadline = new Date(
        Date.now() + rule.responseTimeMins * 60 * 1000,
      );
    }

    await this.incidentRepo.save(incident);

    // Create escalation log entry
    const log = this.logRepo.create({
      incidentId: incident.id,
      matrixRuleId: rule?.id || null,
      tier: nextTier,
      escalatedBy: escalatedBy || null,
      targetRoleId: rule?.targetRoleId || null,
      targetUserId: rule?.targetUserId || null,
      notificationChannelsUsed: rule?.notificationChannels || ['ntfy'],
      notificationStatus: {},
      autoEscalated: !escalatedBy,
    });
    const savedLog = await this.logRepo.save(log);

    // Send notifications
    const channels = rule?.notificationChannels || ['ntfy'];
    const severity = incident.priority === 'P1' ? 'critical' : incident.priority === 'P2' ? 'warning' : 'info';
    const escalationTarget = targetUserName || targetRoleName || `Tier ${nextTier}`;

    const notificationResults: Record<string, any> = {};
    for (const channel of channels) {
      try {
        const result = await this.notificationService.send({
          channel,
          severity,
          title: `${incident.priority} Escalated → ${escalationTarget} (Tier ${nextTier})`,
          message: [
            `Incident: ${incident.incidentNumber}`,
            `Title: ${incident.title}`,
            `Category: ${incident.category}`,
            incident.botRef ? `Bot: ${incident.botRef}` : null,
            rule?.responseTimeMins ? `SLA: Respond within ${rule.responseTimeMins} min` : null,
          ].filter(Boolean).join('\n'),
          tags: [
            incident.priority === 'P1' ? 'rotating_light' : 'warning',
            'escalation',
            `tier-${nextTier}`,
          ],
          topic: 'stella-ops',
          metadata: {
            incidentId: incident.id,
            incidentNumber: incident.incidentNumber,
            priority: incident.priority,
            category: incident.category,
            tier: nextTier,
            targetRole: targetRoleName,
            slaMinutes: rule?.responseTimeMins,
          },
          dedupKey: `escalate:${incident.id}:tier${nextTier}`,
        });
        notificationResults[channel] = { success: result.success, logId: result.logId };
      } catch (err: any) {
        notificationResults[channel] = { success: false, error: err.message };
      }
    }

    // Update log with notification results
    savedLog.notificationStatus = notificationResults;
    await this.logRepo.save(savedLog);

    // Schedule auto-escalation if rule has auto_escalate_to_tier
    if (rule?.autoEscalateToTier && rule.responseTimeMins) {
      this.scheduleAutoEscalation(incident.id, rule.responseTimeMins);
    }

    this.logger.log(
      `Escalated ${incident.incidentNumber} to tier ${nextTier} (${escalationTarget})`,
    );

    return { incident, log: savedLog, rule };
  }

  // ===========================================================================
  // ACKNOWLEDGE
  // ===========================================================================

  async acknowledgeEscalation(
    incidentId: string,
    adminId: string,
  ): Promise<EscalationLog> {
    // Find the latest unacknowledged escalation log
    const log = await this.logRepo.findOne({
      where: { incidentId, acknowledgedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!log) throw new BadRequestException('No pending escalation to acknowledge');

    log.acknowledgedAt = new Date();
    log.acknowledgedBy = adminId;
    await this.logRepo.save(log);

    // Cancel auto-escalation timer
    this.cancelAutoEscalation(incidentId);

    // Clear escalation deadline on incident
    await this.incidentRepo.update(incidentId, {
      escalationDeadline: null,
      updatedAt: new Date(),
    });

    this.logger.log(`Escalation acknowledged for incident ${incidentId} by ${adminId}`);
    return log;
  }

  // ===========================================================================
  // ESCALATION LOG
  // ===========================================================================

  async getEscalationLog(incidentId: string): Promise<EscalationLog[]> {
    return this.logRepo.find({
      where: { incidentId },
      order: { createdAt: 'ASC' },
    });
  }

  // ===========================================================================
  // AUTO-ESCALATION TIMER
  // ===========================================================================

  private scheduleAutoEscalation(incidentId: string, delayMinutes: number) {
    this.cancelAutoEscalation(incidentId);

    const timer = setTimeout(async () => {
      try {
        // Check if already acknowledged
        const log = await this.logRepo.findOne({
          where: { incidentId, acknowledgedAt: IsNull() },
          order: { createdAt: 'DESC' },
        });
        if (!log) return; // already acknowledged

        this.logger.warn(
          `Auto-escalating incident ${incidentId} (SLA breached after ${delayMinutes} min)`,
        );
        await this.escalateIncident(incidentId); // no escalatedBy = auto
      } catch (err: any) {
        this.logger.error(`Auto-escalation failed for ${incidentId}: ${err.message}`);
      } finally {
        this.autoEscalationTimers.delete(incidentId);
      }
    }, delayMinutes * 60 * 1000);

    this.autoEscalationTimers.set(incidentId, timer);
  }

  private cancelAutoEscalation(incidentId: string) {
    const existing = this.autoEscalationTimers.get(incidentId);
    if (existing) {
      clearTimeout(existing);
      this.autoEscalationTimers.delete(incidentId);
    }
  }
}
