import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RiskControls } from './entities/risk-controls.entity';
import { BillingConfig } from './entities/billing-config.entity';
import { Integration } from './entities/integration.entity';
import { OutboundWebhook } from './entities/outbound-webhook.entity';
import { WebhookSigningKey } from './entities/webhook-signing-key.entity';
import { BotEngineDefaults } from './entities/bot-engine-defaults.entity';
import { SecurityConfig } from './entities/security-config.entity';
import { IpAllowlist } from './entities/ip-allowlist.entity';
import { EmailSettings } from './entities/email-settings.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { ComplianceSettings } from './entities/compliance-settings.entity';
import { JurisdictionRestriction } from './entities/jurisdiction-restriction.entity';
import { PlatformExchange } from './entities/platform-exchange.entity';
import { Adapter } from './entities/adapter.entity';
import { ExchangeHealthCheck } from './entities/exchange-health-check.entity';
import { ExchangeTradingPair } from './entities/exchange-trading-pair.entity';
import { InfrastructureSettings } from './entities/infrastructure-settings.entity';
import { FeatureFlag } from './entities/feature-flag.entity';
import { BackgroundJobRun } from './entities/background-job-run.entity';
import { NotificationChannel } from './entities/notification-channel.entity';
import { NotificationRouting } from './entities/notification-routing.entity';
import { NotificationSettings } from './entities/notification-settings.entity';
import { AlertType } from './entities/alert-type.entity';
import { UpdateRiskControlsDto } from './dto/update-risk-controls.dto';
import { UpdateBillingConfigDto } from './dto/update-billing-config.dto';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { UpdateBotEngineDto } from './dto/update-bot-engine.dto';
import { UpdateSecurityConfigDto } from './dto/update-security-config.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { UpdateComplianceDto } from './dto/update-compliance.dto';
import { CreateRestrictionDto } from './dto/create-restriction.dto';
import { UpdateAdapterDto } from './dto/update-adapter.dto';
import { UpdateInfrastructureDto } from './dto/update-infrastructure.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { UpdateRoutingDto } from './dto/update-routing.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { UpdateAlertTypeDto } from './dto/update-alert-type.dto';
import { UpdateAssetTierConfigDto } from './dto/update-asset-tier-config.dto';
import { AssetTierConfig } from './entities/asset-tier-config.entity';
import { randomBytes } from 'crypto';
import { CoolifyService } from '../../common/services/coolify.service';
import { TradingPairSyncService } from './trading-pair-sync.service';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(RiskControls)
    private readonly riskRepo: Repository<RiskControls>,
    @InjectRepository(BillingConfig)
    private readonly billingRepo: Repository<BillingConfig>,
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
    @InjectRepository(OutboundWebhook)
    private readonly webhookRepo: Repository<OutboundWebhook>,
    @InjectRepository(WebhookSigningKey)
    private readonly signingKeyRepo: Repository<WebhookSigningKey>,
    @InjectRepository(BotEngineDefaults)
    private readonly botEngineRepo: Repository<BotEngineDefaults>,
    @InjectRepository(SecurityConfig)
    private readonly securityRepo: Repository<SecurityConfig>,
    @InjectRepository(IpAllowlist)
    private readonly ipAllowlistRepo: Repository<IpAllowlist>,
    @InjectRepository(EmailSettings)
    private readonly emailSettingsRepo: Repository<EmailSettings>,
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepo: Repository<EmailTemplate>,
    @InjectRepository(ComplianceSettings)
    private readonly complianceRepo: Repository<ComplianceSettings>,
    @InjectRepository(JurisdictionRestriction)
    private readonly restrictionRepo: Repository<JurisdictionRestriction>,
    @InjectRepository(PlatformExchange)
    private readonly exchangeRepo: Repository<PlatformExchange>,
    @InjectRepository(Adapter)
    private readonly adapterRepo: Repository<Adapter>,
    @InjectRepository(ExchangeHealthCheck)
    private readonly healthCheckRepo: Repository<ExchangeHealthCheck>,
    @InjectRepository(ExchangeTradingPair)
    private readonly tradingPairRepo: Repository<ExchangeTradingPair>,
    @InjectRepository(InfrastructureSettings)
    private readonly infraRepo: Repository<InfrastructureSettings>,
    @InjectRepository(FeatureFlag)
    private readonly featureFlagRepo: Repository<FeatureFlag>,
    @InjectRepository(BackgroundJobRun)
    private readonly jobRunRepo: Repository<BackgroundJobRun>,
    @InjectRepository(NotificationChannel)
    private readonly channelRepo: Repository<NotificationChannel>,
    @InjectRepository(NotificationRouting)
    private readonly routingRepo: Repository<NotificationRouting>,
    @InjectRepository(NotificationSettings)
    private readonly notifSettingsRepo: Repository<NotificationSettings>,
    @InjectRepository(AlertType)
    private readonly alertTypeRepo: Repository<AlertType>,
    @InjectRepository(AssetTierConfig)
    private readonly assetTierConfigRepo: Repository<AssetTierConfig>,
    private readonly coolifyService: CoolifyService,
    private readonly tradingPairSyncService: TradingPairSyncService,
  ) {}

  // === Settings Risk ===

  async getRiskControls() {
    const controls = await this.riskRepo.find();
    return controls[0] || null;
  }

  async updateRiskControls(dto: UpdateRiskControlsDto) {
    const controls = await this.riskRepo.find();
    if (!controls[0]) throw new NotFoundException('Risk controls not initialized');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.maxDrawdownPct !== undefined) fieldsToUpdate.maxDrawdownPct = dto.maxDrawdownPct;
    if (dto.dailyLossLimitPct !== undefined) fieldsToUpdate.dailyLossLimitPct = dto.dailyLossLimitPct;
    if (dto.circuitBreakerPct !== undefined) fieldsToUpdate.circuitBreakerPct = dto.circuitBreakerPct;
    if (dto.circuitBreakerWindowHours !== undefined) fieldsToUpdate.circuitBreakerWindowHours = dto.circuitBreakerWindowHours;
    if (dto.maxSlippagePct !== undefined) fieldsToUpdate.maxSlippagePct = dto.maxSlippagePct;
    if (dto.maxPositionSizePct !== undefined) fieldsToUpdate.maxPositionSizePct = dto.maxPositionSizePct;
    if (dto.maxConcurrentPositions !== undefined) fieldsToUpdate.maxConcurrentPositions = dto.maxConcurrentPositions;
    if (dto.maxLeverage !== undefined) fieldsToUpdate.maxLeverage = dto.maxLeverage;
    if (dto.maxBotsPerUser !== undefined) fieldsToUpdate.maxBotsPerUser = dto.maxBotsPerUser;
    if (dto.forceLimitOrders !== undefined) fieldsToUpdate.forceLimitOrders = dto.forceLimitOrders;
    if (dto.autoHaltOnCircuit !== undefined) fieldsToUpdate.autoHaltOnCircuit = dto.autoHaltOnCircuit;
    if (dto.notifyOnDrawdown !== undefined) fieldsToUpdate.notifyOnDrawdown = dto.notifyOnDrawdown;
    if (dto.allowMarketOrders !== undefined) fieldsToUpdate.allowMarketOrders = dto.allowMarketOrders;
    if (dto.requireStopLoss !== undefined) fieldsToUpdate.requireStopLoss = dto.requireStopLoss;

    await this.riskRepo.update(controls[0].id, fieldsToUpdate);
    return this.riskRepo.findOneBy({ id: controls[0].id });
  }

  // === Settings Billing ===

  async getBillingConfig() {
    const config = await this.billingRepo.find();
    return config[0] || null;
  }

  async updateBillingConfig(dto: UpdateBillingConfigDto) {
    const config = await this.billingRepo.find();
    if (!config[0]) throw new NotFoundException('Billing config not initialized');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.platformFeePct !== undefined) fieldsToUpdate.platformFeePct = dto.platformFeePct;
    if (dto.minAumFreeTier !== undefined) fieldsToUpdate.minAumFreeTier = dto.minAumFreeTier;
    if (dto.maxAumFreeTier !== undefined) fieldsToUpdate.maxAumFreeTier = dto.maxAumFreeTier;
    if (dto.tierStandardFeePct !== undefined) fieldsToUpdate.tierStandardFeePct = dto.tierStandardFeePct;
    if (dto.tierProFeePct !== undefined) fieldsToUpdate.tierProFeePct = dto.tierProFeePct;
    if (dto.tierEnterpriseFeePct !== undefined) fieldsToUpdate.tierEnterpriseFeePct = dto.tierEnterpriseFeePct;

    await this.billingRepo.update(config[0].id, fieldsToUpdate);
    return this.billingRepo.findOneBy({ id: config[0].id });
  }

  async getBillingRevenueStats() {
    const manager = this.billingRepo.manager;
    const result = await manager.query(`
      WITH fee_stats AS (
        SELECT
          COALESCE(SUM(amount_usd), 0) AS total_revenue,
          COUNT(DISTINCT user_id)::int AS active_users
        FROM finance.fees_collected
        WHERE collected_at >= DATE_TRUNC('month', NOW())
      ),
      sub_stats AS (
        SELECT COUNT(*)::int AS active_subs
        FROM finance.subscriptions
        WHERE status = 'active'
      )
      SELECT
        fs.total_revenue,
        CASE WHEN fs.active_users > 0
          THEN ROUND((fs.total_revenue / fs.active_users)::numeric, 2)
          ELSE 0 END AS avg_revenue_per_user,
        fs.active_users,
        ss.active_subs
      FROM fee_stats fs
      CROSS JOIN sub_stats ss
    `);
    return result[0] || {};
  }

  // === Settings Integrations ===

  async getIntegrationsAndWebhooks() {
    const integrations = await this.integrationRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
    const webhooks = await this.webhookRepo.find({
      order: { createdAt: 'DESC' },
    });
    const activeKey = await this.signingKeyRepo.findOne({
      where: { isActive: true },
    });

    return {
      integrations,
      webhooks: webhooks.map((w) => ({
        ...w,
        url: this.maskUrl(w.url),
      })),
      currentSigningKey: activeKey?.signingSecret || null,
    };
  }

  async updateIntegration(id: string, data: Partial<Integration>) {
    const integration = await this.integrationRepo.findOneBy({ id });
    if (!integration) throw new NotFoundException('Integration not found');
    await this.integrationRepo.update(id, data);
    return this.integrationRepo.findOneBy({ id });
  }

  async createWebhook(dto: CreateWebhookDto) {
    const activeKey = await this.signingKeyRepo.findOne({
      where: { isActive: true },
    });

    const webhook = this.webhookRepo.create({
      url: dto.url,
      events: dto.events,
      isActive: true,
      signingSecret: activeKey?.signingSecret || randomBytes(32).toString('hex').substring(0, 64),
    });
    const saved = await this.webhookRepo.save(webhook);
    return { webhook: saved, signingSecret: saved.signingSecret };
  }

  async updateWebhook(id: string, dto: UpdateWebhookDto) {
    const webhook = await this.webhookRepo.findOneBy({ id });
    if (!webhook) throw new NotFoundException('Webhook not found');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.events !== undefined) fieldsToUpdate.events = dto.events;
    if (dto.isActive !== undefined) fieldsToUpdate.isActive = dto.isActive;

    await this.webhookRepo.update(id, fieldsToUpdate);
    return this.webhookRepo.findOneBy({ id });
  }

  async deleteWebhook(id: string) {
    const webhook = await this.webhookRepo.findOneBy({ id });
    if (!webhook) throw new NotFoundException('Webhook not found');
    await this.webhookRepo.remove(webhook);
    return { message: 'Webhook removed successfully' };
  }

  async rotateSigningKey() {
    const oldKey = await this.signingKeyRepo.findOne({
      where: { isActive: true },
    });

    if (oldKey) {
      await this.signingKeyRepo.update(oldKey.id, {
        isActive: false,
        retiredAt: new Date(),
      });
    }

    const newSecret = randomBytes(32).toString('hex').substring(0, 64);
    const newKey = this.signingKeyRepo.create({
      signingSecret: newSecret,
      isActive: true,
    });
    await this.signingKeyRepo.save(newKey);

    // Update all webhooks with new secret
    await this.webhookRepo
      .createQueryBuilder()
      .update()
      .set({ signingSecret: newSecret })
      .execute();

    return {
      newSigningKey: newSecret,
      oldKeyRetiredAt: oldKey ? new Date() : null,
      message: 'Signing key rotated. Update all webhook endpoints to use the new secret.',
    };
  }

  // === Settings Bot Engine ===

  async getBotEngineDefaults() {
    const defaults = await this.botEngineRepo.find();
    return defaults[0] || null;
  }

  async updateBotEngineDefaults(dto: UpdateBotEngineDto) {
    const defaults = await this.botEngineRepo.find();
    if (!defaults[0]) throw new NotFoundException('Bot engine defaults not initialized');

    const fieldsToUpdate: Record<string, any> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) fieldsToUpdate[key] = value;
    }

    await this.botEngineRepo.update(defaults[0].id, fieldsToUpdate);
    return this.botEngineRepo.findOneBy({ id: defaults[0].id });
  }

  // === Settings Security ===

  async getSecurityConfig() {
    const config = await this.securityRepo.findOneBy({ id: 1 });
    const ipAddresses = await this.ipAllowlistRepo.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    return {
      config,
      ipAddresses: ipAddresses.map((ip) => ip.ipCidr),
    };
  }

  async updateSecurityConfig(dto: UpdateSecurityConfigDto) {
    const config = await this.securityRepo.findOneBy({ id: 1 });
    if (!config) throw new NotFoundException('Security config not initialized');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.sessionTimeoutMinutes !== undefined) fieldsToUpdate.sessionTimeoutMinutes = dto.sessionTimeoutMinutes;
    if (dto.forceTwoFa !== undefined) fieldsToUpdate.forceTwoFa = dto.forceTwoFa;
    if (dto.minPasswordLength !== undefined) fieldsToUpdate.minPasswordLength = dto.minPasswordLength;
    if (dto.requireSpecialChars !== undefined) fieldsToUpdate.requireSpecialChars = dto.requireSpecialChars;
    if (dto.maxLoginAttempts !== undefined) fieldsToUpdate.maxLoginAttempts = dto.maxLoginAttempts;
    if (dto.ipAllowlistEnabled !== undefined) fieldsToUpdate.ipAllowlistEnabled = dto.ipAllowlistEnabled;
    if (dto.auditRetentionYears !== undefined) fieldsToUpdate.auditRetentionYears = dto.auditRetentionYears;

    await this.securityRepo.update(1, fieldsToUpdate);

    // Sync IP allowlist if provided
    if (dto.ipAddresses !== undefined) {
      // Soft-delete removed IPs
      const existing = await this.ipAllowlistRepo.find({ where: { deletedAt: IsNull() } });
      for (const ip of existing) {
        if (!dto.ipAddresses.includes(ip.ipCidr)) {
          await this.ipAllowlistRepo.update(ip.id, { deletedAt: new Date() });
        }
      }
      // Add new IPs
      const existingCidrs = existing.map((ip) => ip.ipCidr);
      for (const cidr of dto.ipAddresses) {
        if (!existingCidrs.includes(cidr)) {
          const newIp = this.ipAllowlistRepo.create({ ipCidr: cidr });
          await this.ipAllowlistRepo.save(newIp);
        }
      }
    }

    return this.getSecurityConfig();
  }

  // === Settings Communications ===

  async getCommunicationsSettings() {
    const emailSettings = await this.emailSettingsRepo.find();
    const templates = await this.emailTemplateRepo.find({
      where: { isActive: true },
      order: { templateKey: 'ASC' },
    });

    return {
      emailSettings: emailSettings[0] || null,
      templates,
    };
  }

  async updateEmailSettings(dto: UpdateEmailSettingsDto) {
    const settings = await this.emailSettingsRepo.find();
    if (!settings[0]) throw new NotFoundException('Email settings not initialized');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.senderName !== undefined) fieldsToUpdate.senderName = dto.senderName;
    if (dto.senderEmail !== undefined) fieldsToUpdate.senderEmail = dto.senderEmail;
    if (dto.supportEmail !== undefined) fieldsToUpdate.supportEmail = dto.supportEmail;

    await this.emailSettingsRepo.update(settings[0].id, fieldsToUpdate);
    return this.emailSettingsRepo.findOneBy({ id: settings[0].id });
  }

  async updateEmailTemplate(id: string, dto: UpdateEmailTemplateDto) {
    const template = await this.emailTemplateRepo.findOneBy({ id });
    if (!template) throw new NotFoundException('Email template not found');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.subjectLine !== undefined) fieldsToUpdate.subjectLine = dto.subjectLine;
    if (dto.bodyMarkdown !== undefined) fieldsToUpdate.bodyMarkdown = dto.bodyMarkdown;

    await this.emailTemplateRepo.update(id, fieldsToUpdate);
    return this.emailTemplateRepo.findOneBy({ id });
  }

  // === Settings Compliance ===

  async getComplianceSettings() {
    const settings = await this.complianceRepo.find();
    const restrictions = await this.restrictionRepo.find({
      where: { isActive: true },
      order: { countryName: 'ASC' },
    });

    return {
      complianceSettings: settings[0] || null,
      jurisdictionRestrictions: restrictions,
    };
  }

  async updateComplianceSettings(dto: UpdateComplianceDto) {
    const settings = await this.complianceRepo.find();
    if (!settings[0]) throw new NotFoundException('Compliance settings not initialized');

    const fieldsToUpdate: Record<string, any> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) fieldsToUpdate[key] = value;
    }

    await this.complianceRepo.update(settings[0].id, fieldsToUpdate);
    return this.complianceRepo.findOneBy({ id: settings[0].id });
  }

  async createRestriction(dto: CreateRestrictionDto) {
    const restriction = this.restrictionRepo.create({
      countryCode: dto.countryCode.toUpperCase(),
      countryName: dto.countryName,
      reason: dto.reason,
      status: dto.status,
      isActive: true,
    });
    return this.restrictionRepo.save(restriction);
  }

  async updateRestriction(id: string, data: Partial<JurisdictionRestriction>) {
    const restriction = await this.restrictionRepo.findOneBy({ id });
    if (!restriction) throw new NotFoundException('Restriction not found');

    const fieldsToUpdate: Record<string, any> = {};
    if (data.reason !== undefined) fieldsToUpdate.reason = data.reason;
    if (data.status !== undefined) fieldsToUpdate.status = data.status;

    await this.restrictionRepo.update(id, fieldsToUpdate);
    return this.restrictionRepo.findOneBy({ id });
  }

  // === Settings Exchanges (Adapters) ===

  async getExchanges() {
    const manager = this.adapterRepo.manager;

    const kpis = await manager.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive,
        COUNT(*) FILTER (WHERE status = 'maintenance')::int AS maintenance,
        COUNT(*)::int AS total
      FROM exchange.adapters
    `);

    const adapters = await this.adapterRepo.find({
      order: { name: 'ASC' },
    });

    // Mask platform + sandbox credentials before returning
    const maskedAdapters = adapters.map((a) => ({
      ...a,
      platformApiKey: a.platformApiKey ? this.maskCredential(a.platformApiKey) : null,
      platformApiSecret: a.platformApiSecret ? this.maskCredential(a.platformApiSecret) : null,
      sandboxApiKey: a.sandboxApiKey ? this.maskCredential(a.sandboxApiKey) : null,
      sandboxApiSecret: a.sandboxApiSecret ? this.maskCredential(a.sandboxApiSecret) : null,
    }));

    return {
      kpis: kpis[0] || { active: 0, inactive: 0, maintenance: 0, total: 0 },
      adapters: maskedAdapters,
    };
  }

  async getExchange(id: string) {
    const adapter = await this.adapterRepo.findOneBy({ id });
    if (!adapter) throw new NotFoundException('Adapter not found');

    const pairStats = await this.tradingPairSyncService.getAdapterPairStats(id);

    return {
      ...adapter,
      platformApiKey: adapter.platformApiKey ? this.maskCredential(adapter.platformApiKey) : null,
      platformApiSecret: adapter.platformApiSecret ? this.maskCredential(adapter.platformApiSecret) : null,
      sandboxApiKey: adapter.sandboxApiKey ? this.maskCredential(adapter.sandboxApiKey) : null,
      sandboxApiSecret: adapter.sandboxApiSecret ? this.maskCredential(adapter.sandboxApiSecret) : null,
      pairStats,
    };
  }

  async updateExchange(id: string, dto: UpdateAdapterDto) {
    const adapter = await this.adapterRepo.findOneBy({ id });
    if (!adapter) throw new NotFoundException('Adapter not found');

    const fieldsToUpdate: Record<string, any> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) fieldsToUpdate[key] = value;
    }

    await this.adapterRepo.update(id, fieldsToUpdate);
    return this.adapterRepo.findOneBy({ id });
  }

  async testExchangeConnection(id: string) {
    const adapter = await this.adapterRepo.findOneBy({ id });
    if (!adapter) throw new NotFoundException('Adapter not found');

    // Look up matching platform_exchange for FK
    const platformExchange = await this.exchangeRepo.findOne({
      where: { exchangeKey: adapter.code },
    });

    // Simulate connection test (Phoenix not available)
    const latency = Math.round(Math.random() * 200 + 50);
    const isHealthy = Math.random() > 0.2;

    const result = {
      status: isHealthy ? 'healthy' : 'degraded',
      responseTimeMs: latency,
      errorMessage: isHealthy ? null : 'Simulated timeout on REST endpoint',
    };

    // Only persist if there's a matching platform_exchange (FK constraint)
    if (platformExchange) {
      const healthCheck = this.healthCheckRepo.create({
        exchangeId: platformExchange.id,
        ...result,
      });
      return this.healthCheckRepo.save(healthCheck);
    }

    return { id: null, ...result, checkedAt: new Date() };
  }

  // === Settings Infrastructure: Coolify Status ===

  async getInfraStatus() {
    const services = await this.coolifyService.getProjectResources();
    return {
      services,
      fetchedAt: new Date().toISOString(),
    };
  }

  // === Settings Infrastructure ===

  private readonly BACKGROUND_JOBS = [
    { jobName: 'portfolio-snapshot', schedule: '*/5 * * * *', description: 'Snapshot portfolio balances every 5 min' },
    { jobName: 'fee-collection', schedule: '0 0 * * *', description: 'Daily fee collection sweep' },
    { jobName: 'kyc-expiry-check', schedule: '0 6 * * *', description: 'Check for expiring KYC documents' },
    { jobName: 'exchange-health-ping', schedule: '*/2 * * * *', description: 'Ping exchange APIs every 2 min' },
    { jobName: 'risk-recalculation', schedule: '*/15 * * * *', description: 'Recalculate risk metrics every 15 min' },
    { jobName: 'audit-log-cleanup', schedule: '0 3 * * 0', description: 'Weekly cleanup of old audit logs' },
    { jobName: 'market-data-sync', schedule: '*/1 * * * *', description: 'Sync market data every minute' },
    { jobName: 'notification-digest', schedule: '0 9 * * *', description: 'Daily notification digest email' },
    { jobName: 'trading-pair-sync', schedule: '0 */6 * * *', description: 'Sync trading pairs from exchanges every 6 hours' },
  ];

  async getInfrastructure() {
    const settings = await this.infraRepo.find();
    const featureFlags = await this.featureFlagRepo.find({
      order: { flagKey: 'ASC' },
    });

    // Enrich background jobs with last run info
    const lastRuns = await this.jobRunRepo.manager.query(`
      SELECT DISTINCT ON (job_name)
        job_name, status, started_at, finished_at, duration_ms, triggered_by, error_message
      FROM platform.background_job_runs
      ORDER BY job_name, started_at DESC
    `);
    const lastRunMap = new Map(lastRuns.map((r: any) => [r.job_name, r]));

    const backgroundJobs = this.BACKGROUND_JOBS.map((job) => ({
      ...job,
      lastRun: lastRunMap.get(job.jobName) || null,
    }));

    return {
      settings: settings[0] || null,
      featureFlags,
      backgroundJobs,
    };
  }

  async updateInfrastructure(dto: UpdateInfrastructureDto) {
    const settings = await this.infraRepo.find();
    if (!settings[0]) throw new NotFoundException('Infrastructure settings not initialized');

    const fieldsToUpdate: Record<string, any> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) fieldsToUpdate[key] = value;
    }

    await this.infraRepo.update(settings[0].id, fieldsToUpdate);
    return this.infraRepo.findOneBy({ id: settings[0].id });
  }

  async updateFeatureFlag(id: string, dto: UpdateFeatureFlagDto) {
    const flag = await this.featureFlagRepo.findOneBy({ id });
    if (!flag) throw new NotFoundException('Feature flag not found');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.enabledProduction !== undefined) fieldsToUpdate.enabledProduction = dto.enabledProduction;
    if (dto.enabledStaging !== undefined) fieldsToUpdate.enabledStaging = dto.enabledStaging;
    if (dto.enabledDevelopment !== undefined) fieldsToUpdate.enabledDevelopment = dto.enabledDevelopment;

    await this.featureFlagRepo.update(id, fieldsToUpdate);
    return this.featureFlagRepo.findOneBy({ id });
  }

  async triggerJob(jobName: string) {
    const validJob = this.BACKGROUND_JOBS.find((j) => j.jobName === jobName);
    if (!validJob) throw new NotFoundException(`Background job '${jobName}' not found`);

    const run = this.jobRunRepo.create({
      jobName,
      status: 'running',
      triggeredBy: 'manual',
    });
    const saved = await this.jobRunRepo.save(run);

    // Real handler for trading-pair-sync
    if (jobName === 'trading-pair-sync') {
      const startTime = Date.now();
      try {
        const results = await this.tradingPairSyncService.syncAllActiveAdapters();
        const durationMs = Date.now() - startTime;
        await this.jobRunRepo.update(saved.id, {
          status: 'completed',
          durationMs,
          finishedAt: new Date(),
        });
        const updatedRun = await this.jobRunRepo.findOneBy({ id: saved.id });
        return { ...updatedRun, syncResults: results };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        await this.jobRunRepo.update(saved.id, {
          status: 'failed',
          durationMs,
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return this.jobRunRepo.findOneBy({ id: saved.id });
      }
    }

    // Simulate job completion for other jobs
    const durationMs = Math.round(Math.random() * 5000 + 500);
    await this.jobRunRepo.update(saved.id, {
      status: 'completed',
      durationMs,
      finishedAt: new Date(),
    });

    return this.jobRunRepo.findOneBy({ id: saved.id });
  }

  // === Settings Notifications ===

  async getNotifications() {
    const channels = await this.channelRepo.find({
      order: { channelKey: 'ASC' },
    });

    const routing = await this.routingRepo.manager.query(`
      SELECT r.*, c.channel_key
      FROM platform.notification_routing r
      JOIN platform.notification_channels c ON r.channel_id = c.id
      ORDER BY c.channel_key, r.severity
    `);

    const settings = await this.notifSettingsRepo.find();
    const alertTypes = await this.alertTypeRepo.find({
      order: { alertKey: 'ASC' },
    });

    return {
      channels,
      routing,
      settings: settings[0] || null,
      alertTypes,
    };
  }

  async updateNotificationChannel(id: string, dto: UpdateChannelDto) {
    const channel = await this.channelRepo.findOneBy({ id });
    if (!channel) throw new NotFoundException('Notification channel not found');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.name !== undefined) fieldsToUpdate.name = dto.name;
    if (dto.isActive !== undefined) fieldsToUpdate.isActive = dto.isActive;
    if (dto.config !== undefined) fieldsToUpdate.config = dto.config;

    await this.channelRepo.update(id, fieldsToUpdate);
    return this.channelRepo.findOneBy({ id });
  }

  async updateNotificationRouting(id: string, dto: UpdateRoutingDto) {
    const route = await this.routingRepo.findOneBy({ id });
    if (!route) throw new NotFoundException('Notification routing not found');

    await this.routingRepo.update(id, { isEnabled: dto.isEnabled });
    return this.routingRepo.findOneBy({ id });
  }

  async updateNotificationSettings(dto: UpdateNotificationSettingsDto) {
    const settings = await this.notifSettingsRepo.find();
    if (!settings[0]) throw new NotFoundException('Notification settings not initialized');

    const fieldsToUpdate: Record<string, any> = {};
    if (dto.dedupWindowSeconds !== undefined) fieldsToUpdate.dedupWindowSeconds = dto.dedupWindowSeconds;

    await this.notifSettingsRepo.update(settings[0].id, fieldsToUpdate);
    return this.notifSettingsRepo.findOneBy({ id: settings[0].id });
  }

  async updateAlertType(id: string, dto: UpdateAlertTypeDto) {
    const alertType = await this.alertTypeRepo.findOneBy({ id });
    if (!alertType) throw new NotFoundException('Alert type not found');

    await this.alertTypeRepo.update(id, { isEnabled: dto.isEnabled });
    return this.alertTypeRepo.findOneBy({ id });
  }

  // === Asset Tier Config ===

  async getAssetTierConfig(adapterId: string) {
    let config = await this.assetTierConfigRepo.findOneBy({ adapterId });

    if (!config) {
      // Auto-create with defaults if adapter exists
      const adapter = await this.adapterRepo.findOneBy({ id: adapterId });
      if (!adapter) throw new NotFoundException('Adapter not found');

      config = this.assetTierConfigRepo.create({ adapterId });
      config = await this.assetTierConfigRepo.save(config);
    }

    return config;
  }

  async updateAssetTierConfig(adapterId: string, dto: UpdateAssetTierConfigDto) {
    let config = await this.assetTierConfigRepo.findOneBy({ adapterId });

    if (!config) {
      const adapter = await this.adapterRepo.findOneBy({ id: adapterId });
      if (!adapter) throw new NotFoundException('Adapter not found');

      config = this.assetTierConfigRepo.create({ adapterId });
    }

    // Apply all provided fields
    Object.entries(dto).forEach(([key, value]) => {
      if (value !== undefined) {
        (config as any)[key] = value;
      }
    });

    return this.assetTierConfigRepo.save(config);
  }

  private maskUrl(url: string): string {
    return url.replace(/([a-zA-Z0-9]{8})[a-zA-Z0-9]{8,}/g, '$1••••');
  }

  private maskCredential(value: string): string {
    if (value.length <= 4) return '****';
    return '****' + value.slice(-4);
  }
}
