import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { EscalationService } from './escalation.service';
import type { EscalationMatrix } from './entities/escalation-matrix.entity';

@ApiTags('Escalation Matrix')
@Controller('escalation-matrix')
export class EscalationController {
  constructor(private readonly escalationService: EscalationService) {}

  @Get()
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'List all escalation matrix rules' })
  async getRules() {
    const data = await this.escalationService.getMatrixRules();
    return { ok: true, data };
  }

  @Post()
  @HttpCode(200)
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Create an escalation matrix rule' })
  async createRule(@Body() dto: Partial<EscalationMatrix>) {
    const data = await this.escalationService.createMatrixRule(dto);
    return { ok: true, data };
  }

  @Put(':id')
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Update an escalation matrix rule' })
  async updateRule(@Param('id') id: string, @Body() dto: Partial<EscalationMatrix>) {
    const data = await this.escalationService.updateMatrixRule(id, dto);
    return { ok: true, data };
  }

  @Delete(':id')
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Delete an escalation matrix rule' })
  async deleteRule(@Param('id') id: string) {
    await this.escalationService.deleteMatrixRule(id);
    return { ok: true };
  }

  @Get('resolve')
  @RequirePermissions('system.manage_notifications')
  @ApiOperation({ summary: 'Preview escalation chain for a given priority + category' })
  async resolveChain(
    @Query('priority') priority: string,
    @Query('category') category?: string,
  ) {
    const data = await this.escalationService.previewChain(priority, category);
    return { ok: true, data };
  }
}

@ApiTags('Incidents — Escalation')
@Controller('incidents')
export class IncidentEscalationController {
  constructor(private readonly escalationService: EscalationService) {}

  @Post(':id/acknowledge-escalation')
  @HttpCode(200)
  @RequirePermissions('shifts.manage_incidents')
  @ApiOperation({ summary: 'Acknowledge an escalation (stops auto-escalation timer)' })
  async acknowledge(
    @Param('id') id: string,
    @Body() body: { adminId: string },
  ) {
    const data = await this.escalationService.acknowledgeEscalation(id, body.adminId);
    return { ok: true, data };
  }

  @Get(':id/escalation-log')
  @RequirePermissions('shifts.view_incidents')
  @ApiOperation({ summary: 'Get escalation timeline for an incident' })
  async getLog(@Param('id') id: string) {
    const data = await this.escalationService.getEscalationLog(id);
    return { ok: true, data };
  }
}
