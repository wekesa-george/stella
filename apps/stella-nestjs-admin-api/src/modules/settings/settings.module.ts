import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
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
import { AssetTierConfig } from './entities/asset-tier-config.entity';
import { TradingPairSyncService } from './trading-pair-sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RiskControls,
      BillingConfig,
      Integration,
      OutboundWebhook,
      WebhookSigningKey,
      BotEngineDefaults,
      SecurityConfig,
      IpAllowlist,
      EmailSettings,
      EmailTemplate,
      ComplianceSettings,
      JurisdictionRestriction,
      PlatformExchange,
      Adapter,
      ExchangeHealthCheck,
      ExchangeTradingPair,
      InfrastructureSettings,
      FeatureFlag,
      BackgroundJobRun,
      NotificationChannel,
      NotificationRouting,
      NotificationSettings,
      AlertType,
      AssetTierConfig,
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService, TradingPairSyncService],
  exports: [SettingsService, TradingPairSyncService],
})
export class SettingsModule {}
