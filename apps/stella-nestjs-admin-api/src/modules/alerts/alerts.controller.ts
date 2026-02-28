import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { BulkAcknowledgeDto } from './dto/bulk-acknowledge.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('Alerts')
@ApiBearerAuth()
@Controller('alerts')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @RequirePermissions('alerts.view')
  @ApiOperation({ summary: 'List alerts with filters and pagination' })
  findAll(@Query() query: QueryAlertsDto) {
    return this.alertsService.findAll(query);
  }

  @Post(':id/acknowledge')
  @RequirePermissions('alerts.acknowledge')
  @ApiOperation({ summary: 'Acknowledge a single alert' })
  acknowledge(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertsService.acknowledge(id);
  }

  @Post('acknowledge-bulk')
  @RequirePermissions('alerts.acknowledge_bulk')
  @ApiOperation({ summary: 'Bulk acknowledge alerts' })
  bulkAcknowledge(@Body() dto: BulkAcknowledgeDto) {
    return this.alertsService.bulkAcknowledge(dto);
  }

  @Delete(':id')
  @RequirePermissions('alerts.delete')
  @ApiOperation({ summary: 'Soft-delete (resolve) an alert' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertsService.softDelete(id);
  }
}
