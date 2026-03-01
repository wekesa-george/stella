import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { CurrentAdmin } from './common/decorators/current-user.decorator';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public()
  health(): string {
    return 'OK';
  }

  @Get('admin/me')
  @ApiBearerAuth()
  @ApiTags('Auth')
  @ApiOperation({ summary: 'Get current admin user profile and permissions' })
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getMe(@CurrentAdmin() admin: any) {
    return admin;
  }
}
