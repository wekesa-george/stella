import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { CreateKillSwitchDto } from './dto/create-kill-switch.dto';
import { CreateRogueBotDto } from './dto/create-rogue-bot.dto';
import { NilShiftDto } from './dto/nil-shift.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentAdmin } from '../../common/decorators/current-user.decorator';

@ApiTags('Incidents')
@ApiBearerAuth()
@Controller('incidents')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  // ─── Specific routes BEFORE :id param routes ───────────────────────

  @Get('open')
  @RequirePermissions('incidents.view')
  @ApiOperation({ summary: 'Get all open and escalated incidents' })
  getOpenIncidents() {
    return this.incidentsService.getOpenIncidents();
  }

  @Get('kill-switch')
  @RequirePermissions('incidents.view')
  @ApiOperation({ summary: 'List kill switch activations with pagination' })
  getKillSwitchActivations(@Query() query: QueryIncidentsDto) {
    return this.incidentsService.getKillSwitchActivations(query);
  }

  @Get('rogue-bot')
  @RequirePermissions('incidents.view')
  @ApiOperation({ summary: 'List rogue bot incidents with pagination' })
  getRogueBotIncidents(@Query() query: QueryIncidentsDto) {
    return this.incidentsService.getRogueBotIncidents(query);
  }

  @Get('summary')
  @RequirePermissions('incidents.view')
  @ApiOperation({ summary: 'Get monthly incident summary with aggregations' })
  getSummary(@Query() query: SummaryQueryDto) {
    return this.incidentsService.getSummary(query);
  }

  @Get('shift-register')
  @RequirePermissions('incidents.view')
  @ApiOperation({ summary: 'Get shift register with incident counts for a month' })
  getShiftRegister(@Query() query: SummaryQueryDto) {
    return this.incidentsService.getShiftRegister(query);
  }

  @Get('archived')
  @RequirePermissions('incidents.view')
  @ApiOperation({ summary: 'List distinct archived months' })
  getArchivedMonths() {
    return this.incidentsService.getArchivedMonths();
  }

  @Post('nil-shift')
  @RequirePermissions('incidents.create')
  @ApiOperation({ summary: 'Log a nil shift (no incidents occurred)' })
  logNilShift(@Body() dto: NilShiftDto) {
    return this.incidentsService.logNilShift(dto);
  }

  @Post('archive')
  @RequirePermissions('incidents.archive')
  @ApiOperation({ summary: 'Archive all incidents for a given month' })
  archiveMonth(
    @Body() body: SummaryQueryDto,
    @CurrentAdmin() admin: any,
  ) {
    const adminId = admin?.id || admin?.sub;
    return this.incidentsService.archiveMonth(body.month, adminId);
  }

  // ─── Parameterized routes ──────────────────────────────────────────

  @Get()
  @RequirePermissions('incidents.view')
  @ApiOperation({ summary: 'List incidents with filters and pagination' })
  findAll(@Query() query: QueryIncidentsDto) {
    return this.incidentsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('incidents.view')
  @ApiOperation({ summary: 'Get a single incident by ID with relations' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.findOne(id);
  }

  @Post()
  @RequirePermissions('incidents.create')
  @ApiOperation({ summary: 'Create a new incident (optionally with kill switch / rogue bot)' })
  create(@Body() dto: CreateIncidentDto) {
    return this.incidentsService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('incidents.update')
  @ApiOperation({ summary: 'Update an incident' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.incidentsService.update(id, dto);
  }

  @Post(':id/escalate')
  @RequirePermissions('incidents.escalate')
  @ApiOperation({ summary: 'Escalate an incident' })
  escalate(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.escalate(id);
  }

  @Post(':id/resolve')
  @RequirePermissions('incidents.update')
  @ApiOperation({ summary: 'Resolve an incident' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.incidentsService.resolve(id, dto);
  }

  @Post(':id/countersign')
  @RequirePermissions('incidents.escalate')
  @ApiOperation({ summary: 'Supervisor countersign an incident' })
  countersign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: any,
  ) {
    const adminId = admin?.id || admin?.sub;
    return this.incidentsService.countersign(id, adminId);
  }

  @Post(':id/correction')
  @RequirePermissions('incidents.create')
  @ApiOperation({ summary: 'Create a correction incident linked to the original' })
  createCorrection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateIncidentDto,
  ) {
    return this.incidentsService.createCorrection(id, dto);
  }

  @Post(':id/kill-switch')
  @RequirePermissions('incidents.create')
  @ApiOperation({ summary: 'Add a kill switch activation to an incident' })
  createKillSwitch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateKillSwitchDto,
  ) {
    return this.incidentsService.createKillSwitch(id, dto);
  }

  @Post(':id/rogue-bot')
  @RequirePermissions('incidents.create')
  @ApiOperation({ summary: 'Add a rogue bot record to an incident' })
  createRogueBot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRogueBotDto,
  ) {
    return this.incidentsService.createRogueBot(id, dto);
  }
}
