import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycApplicant } from './entities/kyc-applicant.entity';
import { KycProvider } from './entities/kyc-provider.entity';
import { RegionRouting } from './entities/region-routing.entity';
import { ReverificationRule } from './entities/reverification-rule.entity';
import { KycAuditLog } from './entities/kyc-audit-log.entity';
import { QueryApplicantsDto } from './dto/query-applicants.dto';
import { KycActionDto } from './dto/kyc-action.dto';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { CreateReverificationRuleDto } from './dto/create-reverification-rule.dto';
import { UpdateReverificationRuleDto } from './dto/update-reverification-rule.dto';
import { QueryAuditDto } from './dto/query-audit.dto';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KycApplicant)
    private readonly applicantsRepo: Repository<KycApplicant>,
    @InjectRepository(KycProvider)
    private readonly providersRepo: Repository<KycProvider>,
    @InjectRepository(RegionRouting)
    private readonly regionRepo: Repository<RegionRouting>,
    @InjectRepository(ReverificationRule)
    private readonly reverificationRepo: Repository<ReverificationRule>,
    @InjectRepository(KycAuditLog)
    private readonly auditRepo: Repository<KycAuditLog>,
  ) {}

  async getApplicantStats() {
    const result = await this.applicantsRepo.manager.query(`
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE status = 'approved'), 0)::int AS approved,
        COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0)::int AS pending,
        COALESCE(COUNT(*) FILTER (WHERE status = 'review'), 0)::int AS review,
        COALESCE(COUNT(*) FILTER (WHERE status = 'declined'), 0)::int AS declined,
        COALESCE(COUNT(*) FILTER (WHERE status = 'expiring'), 0)::int AS expiring,
        COALESCE(COUNT(*) FILTER (WHERE status = 're-verify'), 0)::int AS "reVerify"
      FROM kyc.applicants
      WHERE deleted_at IS NULL
    `);

    const workQueue = await this.applicantsRepo.manager.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'review')::int AS "manualReviewCount",
        COUNT(*) FILTER (WHERE status = 'approved' AND document_expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days')::int AS "expiringWithin30Days",
        COUNT(*) FILTER (WHERE status = 're-verify')::int AS "reVerifyCount"
      FROM kyc.applicants
      WHERE deleted_at IS NULL
    `);

    return { stats: result[0], workQueue: workQueue[0] };
  }

  async findAllApplicants(query: QueryApplicantsDto) {
    const { page, limit, search, status, provider, region } = query;

    let sql = `
      SELECT
        a.id, a.user_id, a.provider, a.status, a.risk_score,
        a.document_type, a.submitted_at, a.updated_at,
        a.document_expires_at, a.watchlist_hit, a.face_match_score,
        a.document_authenticity_score, a.account_tier,
        a.provider_applicant_id, a.country_code,
        u.email, u.username
      FROM kyc.applicants a
      JOIN auth.users u ON a.user_id = u.id
      WHERE a.deleted_at IS NULL
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      sql += ` AND a.status = $${paramIdx++}`;
      params.push(status);
    }
    if (provider) {
      sql += ` AND a.provider = $${paramIdx++}`;
      params.push(provider);
    }
    if (search) {
      sql += ` AND (u.email ILIKE $${paramIdx} OR u.username ILIKE $${paramIdx} OR a.id ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const countSql = sql.replace(/SELECT[\s\S]+?FROM/, 'SELECT COUNT(*)::int AS total FROM');
    const countResult = await this.applicantsRepo.manager.query(countSql, params);
    const total = countResult[0]?.total ?? 0;

    sql += ` ORDER BY
      CASE
        WHEN a.status = 'review' THEN 1
        WHEN a.status = 're-verify' THEN 2
        WHEN a.status = 'pending' THEN 3
        WHEN a.status = 'expiring' THEN 4
        ELSE 5
      END,
      a.submitted_at DESC
    `;
    sql += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, (page - 1) * limit);

    const data = await this.applicantsRepo.manager.query(sql, params);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneApplicant(id: string) {
    const applicant = await this.applicantsRepo.findOne({
      where: { id, deletedAt: null as any },
    });
    if (!applicant) throw new NotFoundException(`KYC applicant ${id} not found`);

    const complianceNotes = await this.applicantsRepo.manager.query(
      `SELECT cn.id, cn.action, cn.note, cn.created_at, cn.created_by_user_id
       FROM kyc.compliance_notes cn
       WHERE cn.applicant_id = $1
       ORDER BY cn.created_at DESC`,
      [id],
    );

    const verificationHistory = await this.applicantsRepo.manager.query(
      `SELECT vh.id, vh.event, vh.timestamp, vh.provider, vh.score, vh.metadata
       FROM kyc.verification_history vh
       WHERE vh.applicant_id = $1
       ORDER BY vh.timestamp ASC`,
      [id],
    );

    return { ...applicant, complianceNotes, verificationHistory };
  }

  async performAction(id: string, dto: KycActionDto) {
    const applicant = await this.applicantsRepo.findOneBy({ id });
    if (!applicant) throw new NotFoundException(`KYC applicant ${id} not found`);

    const statusMap: Record<string, string> = {
      approve: 'approved',
      decline: 'declined',
      're-verify': 're-verify',
    };

    const newStatus = statusMap[dto.action];

    await this.applicantsRepo.manager.query(
      `UPDATE kyc.applicants SET status = $1, account_tier = CASE WHEN $1 = 'approved' THEN $3 ELSE account_tier END, reviewed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [newStatus, id, dto.tier || null],
    );

    await this.applicantsRepo.manager.query(
      `INSERT INTO kyc.compliance_notes (applicant_id, action, note, created_by_user_id, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      [id, dto.action, dto.note, applicant.userId],
    );

    await this.applicantsRepo.manager.query(
      `INSERT INTO kyc.verification_history (applicant_id, event, timestamp, metadata) VALUES ($1, $2, NOW(), $3)`,
      [id, dto.action, JSON.stringify({ note: dto.note, tier: dto.tier })],
    );

    if (dto.action === 'approve' && dto.tier) {
      await this.applicantsRepo.manager.query(
        `UPDATE auth.users SET account_tier = $1 WHERE id = $2`,
        [dto.tier, applicant.userId],
      );
    }

    return { success: true, applicantId: id, status: newStatus };
  }

  // KYC Providers
  async getProviderStats() {
    const result = await this.providersRepo.manager.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = true)::int AS "connectedProviders"
      FROM kyc.provider_config
    `);
    return { stats: result[0] };
  }

  async findAllProviders() {
    return this.providersRepo.find({
      order: { provider: 'ASC' },
    });
  }

  async updateProvider(id: string, data: Partial<KycProvider>) {
    const provider = await this.providersRepo.findOneBy({ id });
    if (!provider) throw new NotFoundException(`Provider ${id} not found`);
    Object.assign(provider, data);
    return this.providersRepo.save(provider);
  }

  // === KYC Regions ===

  async getRegions() {
    const manager = this.regionRepo.manager;

    const stats = await manager.query(`
      SELECT
        COUNT(*)::int AS total_regions,
        COUNT(*) FILTER (WHERE is_active = true)::int AS active_regions,
        (SELECT COUNT(DISTINCT unnest)::int FROM kyc.region_routing, LATERAL unnest(country_codes) WHERE is_active = true) AS countries_covered,
        (SELECT fallback_provider FROM kyc.region_routing WHERE is_active = true AND fallback_provider IS NOT NULL LIMIT 1) AS fallback_provider
      FROM kyc.region_routing
    `);

    const regions = await this.regionRepo.find({
      order: { regionName: 'ASC' },
    });

    return {
      stats: stats[0] || {},
      regions,
    };
  }

  async createRegion(dto: CreateRegionDto) {
    // Validate no country code conflicts with other active regions
    const codes = dto.countryCodes.map((c) => c.toUpperCase());
    const conflicts = await this.regionRepo.manager.query(
      `SELECT id, region_name, country_codes
       FROM kyc.region_routing
       WHERE is_active = true AND country_codes && $1::text[]`,
      [codes],
    );

    if (conflicts.length > 0) {
      throw new ConflictException(
        `Country codes conflict with existing region: ${conflicts[0].region_name}`,
      );
    }

    const region = this.regionRepo.create({
      regionName: dto.regionName,
      countryCodes: codes,
      primaryProvider: dto.primaryProvider,
      fallbackProvider: dto.fallbackProvider || null,
      isActive: true,
    });
    return this.regionRepo.save(region);
  }

  async updateRegion(id: string, dto: UpdateRegionDto) {
    const region = await this.regionRepo.findOneBy({ id });
    if (!region) throw new NotFoundException('Region not found');

    // Validate country code conflicts if updating codes
    if (dto.countryCodes) {
      const codes = dto.countryCodes.map((c) => c.toUpperCase());
      const conflicts = await this.regionRepo.manager.query(
        `SELECT id, region_name, country_codes
         FROM kyc.region_routing
         WHERE is_active = true AND id != $1 AND country_codes && $2::text[]`,
        [id, codes],
      );

      if (conflicts.length > 0) {
        throw new ConflictException(
          `Country codes conflict with existing region: ${conflicts[0].region_name}`,
        );
      }
    }

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.regionName !== undefined) fieldsToUpdate.regionName = dto.regionName;
    if (dto.countryCodes !== undefined) fieldsToUpdate.countryCodes = dto.countryCodes.map((c) => c.toUpperCase());
    if (dto.primaryProvider !== undefined) fieldsToUpdate.primaryProvider = dto.primaryProvider;
    if (dto.fallbackProvider !== undefined) fieldsToUpdate.fallbackProvider = dto.fallbackProvider;
    if (dto.isActive !== undefined) fieldsToUpdate.isActive = dto.isActive;

    await this.regionRepo.update(id, fieldsToUpdate);
    return this.regionRepo.findOneBy({ id });
  }

  // === Reverification Rules ===

  async getReverificationRules() {
    return this.reverificationRepo.find({
      order: { ruleName: 'ASC' },
    });
  }

  async createReverificationRule(dto: CreateReverificationRuleDto) {
    const rule = this.reverificationRepo.create({
      ruleName: dto.ruleName,
      triggerEvent: dto.triggerEvent,
      frequencyDays: dto.frequencyDays || null,
      targetTier: dto.targetTier || null,
      isActive: true,
    });
    return this.reverificationRepo.save(rule);
  }

  async updateReverificationRule(id: string, dto: UpdateReverificationRuleDto) {
    const rule = await this.reverificationRepo.findOneBy({ id });
    if (!rule) throw new NotFoundException('Reverification rule not found');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.ruleName !== undefined) fieldsToUpdate.ruleName = dto.ruleName;
    if (dto.triggerEvent !== undefined) fieldsToUpdate.triggerEvent = dto.triggerEvent;
    if (dto.frequencyDays !== undefined) fieldsToUpdate.frequencyDays = dto.frequencyDays;
    if (dto.targetTier !== undefined) fieldsToUpdate.targetTier = dto.targetTier;
    if (dto.isActive !== undefined) fieldsToUpdate.isActive = dto.isActive;

    await this.reverificationRepo.update(id, fieldsToUpdate);
    return this.reverificationRepo.findOneBy({ id });
  }

  // === KYC Audit ===

  private buildAuditQuery(query: QueryAuditDto) {
    let sql = `FROM kyc.audit_log WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (query.eventType) {
      sql += ` AND event_type = $${paramIdx++}`;
      params.push(query.eventType);
    }
    if (query.actor) {
      sql += ` AND actor ILIKE $${paramIdx++}`;
      params.push(`%${query.actor}%`);
    }
    if (query.targetType) {
      sql += ` AND target_type = $${paramIdx++}`;
      params.push(query.targetType);
    }
    if (query.targetId) {
      sql += ` AND target_id = $${paramIdx++}`;
      params.push(query.targetId);
    }
    if (query.dateFrom) {
      sql += ` AND created_at >= $${paramIdx++}`;
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      sql += ` AND created_at <= $${paramIdx++}`;
      params.push(query.dateTo);
    }

    return { sql, params, paramIdx };
  }

  async getAuditLog(query: QueryAuditDto) {
    const { page, limit } = query;
    const { sql: whereSql, params, paramIdx: idx } = this.buildAuditQuery(query);

    const countResult = await this.auditRepo.manager.query(
      `SELECT COUNT(*)::int AS total ${whereSql}`,
      params,
    );
    const total = countResult[0]?.total ?? 0;

    let paramIdx = idx;
    const dataSql = `SELECT id, event_type, actor, target_type, target_id, description, metadata, ip_address, created_at ${whereSql} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, (page - 1) * limit);

    const data = await this.auditRepo.manager.query(dataSql, params);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async exportAuditLogCsv(query: QueryAuditDto) {
    // Override pagination for full export
    const { sql: whereSql, params } = this.buildAuditQuery(query);

    const data = await this.auditRepo.manager.query(
      `SELECT id, event_type, actor, target_type, target_id, description, ip_address, created_at ${whereSql} ORDER BY created_at DESC`,
      params,
    );

    const header = 'id,event_type,actor,target_type,target_id,description,ip_address,created_at';
    const rows = data.map((row: any) =>
      [
        row.id,
        row.event_type,
        `"${(row.actor || '').replace(/"/g, '""')}"`,
        row.target_type || '',
        row.target_id || '',
        `"${(row.description || '').replace(/"/g, '""')}"`,
        row.ip_address || '',
        row.created_at,
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }
}
