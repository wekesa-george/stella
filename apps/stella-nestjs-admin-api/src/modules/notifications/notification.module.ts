import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationLog } from './notification.entity';
import { NotificationChannel } from '../settings/entities/notification-channel.entity';
import { NotificationSettings } from '../settings/entities/notification-settings.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationLog,
      NotificationChannel,
      NotificationSettings,
    ]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
