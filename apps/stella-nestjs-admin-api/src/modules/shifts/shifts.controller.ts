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
import { ShiftsService } from './shifts.service';
import { StartShiftDto } from './dto/start-shift.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateWatchItemDto } from './dto/create-watch-item.dto';
import { HandoffDto } from './dto/handoff.dto';
import { UpdateNotesDto } from './dto/update-notes.dto';
import { QueryShiftHistoryDto } from './dto/query-shift-history.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('Shifts')
@ApiBearerAuth()
@Controller('shift')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('history')
  @RequirePermissions('shifts.start')
  @ApiOperation({ summary: 'Get shift history with pagination' })
  getHistory(@Query() query: QueryShiftHistoryDto) {
    return this.shiftsService.getHistory(query);
  }

  @Get('current')
  @RequirePermissions('shifts.start')
  @ApiOperation({ summary: 'Get current active shift' })
  getCurrent() {
    return this.shiftsService.getCurrent();
  }

  @Post('start')
  @RequirePermissions('shifts.start')
  @ApiOperation({ summary: 'Start a new shift' })
  start(@Body() dto: StartShiftDto) {
    return this.shiftsService.start(dto);
  }

  @Get('activities')
  @RequirePermissions('shifts.log_activity')
  @ApiOperation({ summary: 'Get shift activity log' })
  getActivities(@Query('shiftId', ParseUUIDPipe) shiftId: string) {
    return this.shiftsService.getActivities(shiftId);
  }

  @Post('activities')
  @RequirePermissions('shifts.log_activity')
  @ApiOperation({ summary: 'Log a new shift activity' })
  createActivity(@Body() dto: CreateActivityDto) {
    return this.shiftsService.createActivity(dto);
  }

  @Get('watch-list')
  @RequirePermissions('shifts.manage_watchlist')
  @ApiOperation({ summary: 'Get watch list items' })
  getWatchList(@Query('shiftId') shiftId?: string) {
    return this.shiftsService.getWatchList(shiftId);
  }

  @Post('watch-list')
  @RequirePermissions('shifts.manage_watchlist')
  @ApiOperation({ summary: 'Add a watch list item' })
  createWatchItem(@Body() dto: CreateWatchItemDto) {
    return this.shiftsService.createWatchItem(dto);
  }

  @Post('handoff')
  @RequirePermissions('shifts.submit_handoff')
  @ApiOperation({ summary: 'Submit shift handoff' })
  handoff(@Body() dto: HandoffDto) {
    return this.shiftsService.handoff(dto);
  }

  @Put(':id/notes')
  @RequirePermissions('shifts.manage_watchlist')
  @ApiOperation({ summary: 'Save handoff draft notes (autosave)' })
  updateNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotesDto,
  ) {
    return this.shiftsService.updateNotes(id, dto);
  }
}
