import { Controller, Post, Get, Body, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { NotificationService } from './notification.service';
import type { SendNotificationDto } from './notification.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('send')
  @HttpCode(200)
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Send a notification to a specific channel' })
  async send(@Body() dto: SendNotificationDto) {
    const result = await this.notificationService.send(dto);
    return { ok: true, data: result };
  }

  @Post('send-multi')
  @HttpCode(200)
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Send a notification to multiple channels' })
  async sendMulti(@Body() body: { channels: string[]; title: string; message: string; severity: string; metadata?: Record<string, any> }) {
    const results = await this.notificationService.sendMulti(body.channels, body);
    return { ok: true, data: results };
  }

  @Post('test')
  @HttpCode(200)
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Send a test notification to verify channel config' })
  async test(@Body() body: { channel: string }) {
    const result = await this.notificationService.send({
      channel: body.channel,
      severity: 'info',
      title: 'Stella Test Notification',
      message: `Test notification sent at ${new Date().toISOString()}. If you see this, the ${body.channel} channel is working.`,
      tags: ['white_check_mark', 'test'],
    });
    return { ok: true, data: result };
  }

  @Get('logs')
  @RequirePermissions('system.view_notifications')
  @ApiOperation({ summary: 'Get recent notification delivery logs' })
  async getLogs(@Query('limit') limit?: string) {
    const logs = await this.notificationService.getLogs(Number(limit) || 50);
    return { ok: true, data: logs };
  }

  @Post('refresh-channels')
  @HttpCode(200)
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Reload notification channel configs from DB' })
  async refreshChannels() {
    await this.notificationService.refreshChannels();
    return { ok: true, message: 'Channels refreshed' };
  }
}
