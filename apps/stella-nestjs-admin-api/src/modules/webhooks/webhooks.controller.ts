import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly webhooksService: WebhooksService,
    private configService: ConfigService,
  ) {
    this.webhookSecret = this.configService.get<string>('STELLA_WEBHOOK_SECRET') || '';
  }

  @Post('admin-login')
  @ApiOperation({ summary: 'Track admin user login (called by logto-webhooks)' })
  async trackAdminLogin(
    @Body() body: { logtoUserId: string; ipAddress: string },
    @Headers('x-webhook-secret') secret: string,
  ) {
    if (this.webhookSecret && secret !== this.webhookSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    return this.webhooksService.trackAdminLogin(body.logtoUserId, body.ipAddress);
  }
}
