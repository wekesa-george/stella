import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { AdminUser } from '../admin-users/entities/admin-user.entity';
import { AdminAuditLog } from '../admin-users/entities/admin-audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser, AdminAuditLog])],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
