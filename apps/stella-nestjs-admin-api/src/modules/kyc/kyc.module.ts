import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { KycApplicant } from './entities/kyc-applicant.entity';
import { KycProvider } from './entities/kyc-provider.entity';
import { RegionRouting } from './entities/region-routing.entity';
import { ReverificationRule } from './entities/reverification-rule.entity';
import { KycAuditLog } from './entities/kyc-audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KycApplicant,
      KycProvider,
      RegionRouting,
      ReverificationRule,
      KycAuditLog,
    ]),
  ],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
