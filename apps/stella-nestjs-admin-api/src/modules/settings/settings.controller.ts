import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
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
import { ToggleTradingPairDto, BulkToggleTradingPairsDto } from './dto/toggle-trading-pair.dto';
import { TradingPairSyncService } from './trading-pair-sync.service';
import { UpdateInfrastructureDto } from './dto/update-infrastructure.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { UpdateRoutingDto } from './dto/update-routing.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { UpdateAlertTypeDto } from './dto/update-alert-type.dto';
import { UpdateAssetTierConfigDto } from './dto/update-asset-tier-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly tradingPairSyncService: TradingPairSyncService,
  ) {}

  // === Settings Risk ===

  @Get('risk')
  @RequirePermissions('risk.view')
  @ApiOperation({ summary: 'Get risk controls configuration' })
  getRiskControls() {
    return this.settingsService.getRiskControls();
  }

  @Put('risk')
  @RequirePermissions('risk.update_limits')
  @ApiOperation({ summary: 'Update risk controls configuration' })
  updateRiskControls(@Body() dto: UpdateRiskControlsDto) {
    return this.settingsService.updateRiskControls(dto);
  }

  // === Settings Billing ===

  @Get('billing')
  @RequirePermissions('billing.view')
  @ApiOperation({ summary: 'Get billing configuration' })
  getBillingConfig() {
    return this.settingsService.getBillingConfig();
  }

  @Put('billing')
  @RequirePermissions('billing.manage')
  @ApiOperation({ summary: 'Update billing configuration' })
  updateBillingConfig(@Body() dto: UpdateBillingConfigDto) {
    return this.settingsService.updateBillingConfig(dto);
  }

  @Get('billing/revenue-stats')
  @RequirePermissions('billing.view')
  @ApiOperation({ summary: 'Get platform revenue statistics' })
  getBillingRevenueStats() {
    return this.settingsService.getBillingRevenueStats();
  }

  // === Settings Integrations ===

  @Get('integrations')
  @RequirePermissions('integrations.view_webhooks')
  @ApiOperation({ summary: 'Get integrations and webhooks' })
  getIntegrationsAndWebhooks() {
    return this.settingsService.getIntegrationsAndWebhooks();
  }

  @Put('integrations/:id')
  @RequirePermissions('integrations.manage_webhooks')
  @ApiOperation({ summary: 'Update integration config' })
  updateIntegration(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateIntegration(id, data);
  }

  @Post('integrations/webhooks')
  @RequirePermissions('integrations.manage_webhooks')
  @ApiOperation({ summary: 'Add outbound webhook' })
  createWebhook(@Body() dto: CreateWebhookDto) {
    return this.settingsService.createWebhook(dto);
  }

  @Put('integrations/webhooks/:id')
  @RequirePermissions('integrations.manage_webhooks')
  @ApiOperation({ summary: 'Update webhook' })
  updateWebhook(@Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.settingsService.updateWebhook(id, dto);
  }

  @Delete('integrations/webhooks/:id')
  @RequirePermissions('integrations.manage_webhooks')
  @ApiOperation({ summary: 'Remove webhook' })
  deleteWebhook(@Param('id') id: string) {
    return this.settingsService.deleteWebhook(id);
  }

  @Post('integrations/rotate-signing-key')
  @RequirePermissions('integrations.rotate_key')
  @ApiOperation({ summary: 'Rotate webhook signing key' })
  rotateSigningKey() {
    return this.settingsService.rotateSigningKey();
  }

  // === Settings Bot Engine ===

  @Get('bot-engine')
  @RequirePermissions('system.view_bot_engine')
  @ApiOperation({ summary: 'Get bot engine defaults' })
  getBotEngineDefaults() {
    return this.settingsService.getBotEngineDefaults();
  }

  @Put('bot-engine')
  @RequirePermissions('system.manage_bot_engine')
  @ApiOperation({ summary: 'Update bot engine defaults' })
  updateBotEngineDefaults(@Body() dto: UpdateBotEngineDto) {
    return this.settingsService.updateBotEngineDefaults(dto);
  }

  // === Settings Security ===

  @Get('security')
  @RequirePermissions('system.view_security')
  @ApiOperation({ summary: 'Get security configuration' })
  getSecurityConfig() {
    return this.settingsService.getSecurityConfig();
  }

  @Put('security')
  @RequirePermissions('system.manage_security')
  @ApiOperation({ summary: 'Update security configuration' })
  updateSecurityConfig(@Body() dto: UpdateSecurityConfigDto) {
    return this.settingsService.updateSecurityConfig(dto);
  }

  // === Settings Communications ===

  @Get('communications')
  @RequirePermissions('communications.view_config')
  @ApiOperation({ summary: 'Get email settings and templates' })
  getCommunicationsSettings() {
    return this.settingsService.getCommunicationsSettings();
  }

  @Put('communications/email')
  @RequirePermissions('communications.edit_config')
  @ApiOperation({ summary: 'Update email sender settings' })
  updateEmailSettings(@Body() dto: UpdateEmailSettingsDto) {
    return this.settingsService.updateEmailSettings(dto);
  }

  @Put('communications/templates/:id')
  @RequirePermissions('communications.edit_config')
  @ApiOperation({ summary: 'Update email template' })
  updateEmailTemplate(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.settingsService.updateEmailTemplate(id, dto);
  }

  // === Settings Compliance ===

  @Get('compliance')
  @RequirePermissions('compliance.view_config')
  @ApiOperation({ summary: 'Get compliance settings and jurisdiction restrictions' })
  getComplianceSettings() {
    return this.settingsService.getComplianceSettings();
  }

  @Put('compliance')
  @RequirePermissions('compliance.edit_config')
  @ApiOperation({ summary: 'Update compliance settings' })
  updateComplianceSettings(@Body() dto: UpdateComplianceDto) {
    return this.settingsService.updateComplianceSettings(dto);
  }

  @Post('compliance/restrictions')
  @RequirePermissions('compliance.manage_jurisdictions')
  @ApiOperation({ summary: 'Add jurisdiction restriction' })
  createRestriction(@Body() dto: CreateRestrictionDto) {
    return this.settingsService.createRestriction(dto);
  }

  @Put('compliance/restrictions/:id')
  @RequirePermissions('compliance.manage_jurisdictions')
  @ApiOperation({ summary: 'Update jurisdiction restriction' })
  updateRestriction(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateRestriction(id, data);
  }

  // === Settings Exchanges (Adapters) ===

  @Get('exchanges')
  @RequirePermissions('exchanges.view')
  @ApiOperation({ summary: 'List exchange adapters with KPIs' })
  getExchanges() {
    return this.settingsService.getExchanges();
  }

  @Get('exchanges/:id')
  @RequirePermissions('exchanges.view')
  @ApiOperation({ summary: 'Get single exchange adapter with masked credentials and pair stats' })
  getExchange(@Param('id') id: string) {
    return this.settingsService.getExchange(id);
  }

  @Put('exchanges/:id')
  @RequirePermissions('exchanges.configure')
  @ApiOperation({ summary: 'Update exchange adapter configuration' })
  updateExchange(@Param('id') id: string, @Body() dto: UpdateAdapterDto) {
    return this.settingsService.updateExchange(id, dto);
  }

  @Post('exchanges/:id/test-connection')
  @RequirePermissions('exchanges.view')
  @ApiOperation({ summary: 'Test exchange connection health' })
  testExchangeConnection(@Param('id') id: string) {
    return this.settingsService.testExchangeConnection(id);
  }

  // === Trading Pairs ===

  @Get('exchanges/:id/trading-pairs')
  @RequirePermissions('exchanges.view')
  @ApiOperation({ summary: 'List trading pairs for an adapter' })
  getAdapterTradingPairs(
    @Param('id') id: string,
    @Query('isActive') isActive?: string,
    @Query('delisted') delisted?: string,
    @Query('search') search?: string,
    @Query('marketType') marketType?: string,
  ) {
    return this.tradingPairSyncService.getTradingPairs(id, {
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      delisted: delisted !== undefined ? delisted === 'true' : undefined,
      search,
      marketType,
    });
  }

  @Get('exchanges/:id/trading-pairs/stats')
  @RequirePermissions('exchanges.view')
  @ApiOperation({ summary: 'Get trading pair stats for an adapter' })
  getAdapterPairStats(@Param('id') id: string) {
    return this.tradingPairSyncService.getAdapterPairStats(id);
  }

  @Post('exchanges/:id/sync-pairs')
  @RequirePermissions('exchanges.configure')
  @ApiOperation({ summary: 'Trigger manual trading pair sync for an adapter' })
  syncAdapterPairs(
    @Param('id') id: string,
    @Body() body?: { mode?: 'live' | 'sandbox' },
  ) {
    return this.tradingPairSyncService.syncAdapter(id, body?.mode);
  }

  @Put('exchanges/trading-pairs/:pairId')
  @RequirePermissions('exchanges.configure')
  @ApiOperation({ summary: 'Toggle a single trading pair active/inactive' })
  toggleTradingPair(
    @Param('pairId') pairId: string,
    @Body() dto: ToggleTradingPairDto,
  ) {
    return this.tradingPairSyncService.togglePair(pairId, dto.isActive);
  }

  @Put('exchanges/:id/trading-pairs/bulk-toggle')
  @RequirePermissions('exchanges.configure')
  @ApiOperation({ summary: 'Bulk toggle trading pairs active/inactive' })
  bulkToggleTradingPairs(
    @Param('id') id: string,
    @Body() dto: BulkToggleTradingPairsDto,
  ) {
    return this.tradingPairSyncService.bulkTogglePairs(id, dto.pairIds, dto.isActive);
  }

  // === Asset Tier Config ===

  @Get('exchanges/:id/asset-tiers')
  @RequirePermissions('exchanges.view')
  @ApiOperation({ summary: 'Get asset tier configuration for an exchange adapter' })
  getAssetTierConfig(@Param('id') id: string) {
    return this.settingsService.getAssetTierConfig(id);
  }

  @Put('exchanges/:id/asset-tiers')
  @RequirePermissions('exchanges.configure')
  @ApiOperation({ summary: 'Update asset tier configuration for an exchange adapter' })
  updateAssetTierConfig(
    @Param('id') id: string,
    @Body() dto: UpdateAssetTierConfigDto,
  ) {
    return this.settingsService.updateAssetTierConfig(id, dto);
  }

  // === Settings Infrastructure ===

  @Get('infrastructure/status')
  @RequirePermissions('infrastructure.view')
  @ApiOperation({ summary: 'Get Coolify infrastructure service status' })
  getInfrastructureStatus() {
    return this.settingsService.getInfraStatus();
  }

  @Get('infrastructure')
  @RequirePermissions('infrastructure.view')
  @ApiOperation({ summary: 'Get infrastructure settings, feature flags, and background jobs' })
  getInfrastructure() {
    return this.settingsService.getInfrastructure();
  }

  @Put('infrastructure')
  @RequirePermissions('infrastructure.edit_config')
  @ApiOperation({ summary: 'Update infrastructure settings' })
  updateInfrastructure(@Body() dto: UpdateInfrastructureDto) {
    return this.settingsService.updateInfrastructure(dto);
  }

  @Put('infrastructure/feature-flags/:id')
  @RequirePermissions('infrastructure.edit_config')
  @ApiOperation({ summary: 'Toggle feature flag per environment' })
  updateFeatureFlag(@Param('id') id: string, @Body() dto: UpdateFeatureFlagDto) {
    return this.settingsService.updateFeatureFlag(id, dto);
  }

  @Post('infrastructure/jobs/:jobName/trigger')
  @RequirePermissions('infrastructure.restart_service')
  @ApiOperation({ summary: 'Manually trigger a background job' })
  triggerJob(@Param('jobName') jobName: string) {
    return this.settingsService.triggerJob(jobName);
  }

  // === Settings Notifications ===

  @Get('notifications')
  @RequirePermissions('system.view_notifications')
  @ApiOperation({ summary: 'Get notification channels, routing, settings, and alert types' })
  getNotifications() {
    return this.settingsService.getNotifications();
  }

  @Put('notifications/channels/:id')
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Update notification channel config' })
  updateNotificationChannel(@Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.settingsService.updateNotificationChannel(id, dto);
  }

  @Put('notifications/routing/:id')
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Toggle severity routing' })
  updateNotificationRouting(@Param('id') id: string, @Body() dto: UpdateRoutingDto) {
    return this.settingsService.updateNotificationRouting(id, dto);
  }

  @Put('notifications/settings')
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Update notification dedup settings' })
  updateNotificationSettings(@Body() dto: UpdateNotificationSettingsDto) {
    return this.settingsService.updateNotificationSettings(dto);
  }

  @Put('notifications/alert-types/:id')
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Toggle alert type enabled' })
  updateAlertType(@Param('id') id: string, @Body() dto: UpdateAlertTypeDto) {
    return this.settingsService.updateAlertType(id, dto);
  }
}
