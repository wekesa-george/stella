import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminUsersService } from './admin-users.service';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { DeactivateAdminDto } from './dto/deactivate-admin.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { InviteAdminDto } from './dto/invite-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentAdmin } from '../../common/decorators/current-user.decorator';

@ApiTags('Admin Users')
@ApiBearerAuth()
@Controller('admin/admin-users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @RequirePermissions('admins.view')
  @ApiOperation({ summary: 'List admin users with filters and pagination' })
  findAll(@Query() query: QueryAdminUsersDto) {
    return this.adminUsersService.findAll(query);
  }

  @Get('roles/available')
  @RequirePermissions('admins.update')
  @ApiOperation({ summary: 'Get all available roles (optionally excluding already assigned)' })
  getAvailableRoles(@Query('userId') userId?: string) {
    if (userId) {
      return this.adminUsersService.getAvailableRoles(userId);
    }
    return this.adminUsersService.getAvailableRoles('00000000-0000-0000-0000-000000000000');
  }

  @Post('invite')
  @RequirePermissions('admins.create')
  @ApiOperation({ summary: 'Invite a new admin user (creates in Postgres + Logto)' })
  invite(
    @Body() dto: InviteAdminDto,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminUsersService.invite(dto, admin?.id);
  }

  @Get(':id')
  @RequirePermissions('admins.view')
  @ApiOperation({ summary: 'Get admin user detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('admins.update')
  @ApiOperation({ summary: 'Update admin user profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.adminUsersService.update(id, dto);
  }

  @Post(':id/deactivate')
  @RequirePermissions('admins.delete')
  @ApiOperation({ summary: 'Deactivate admin user' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeactivateAdminDto,
  ) {
    return this.adminUsersService.deactivate(id, dto);
  }

  @Post(':id/reactivate')
  @RequirePermissions('admins.update')
  @ApiOperation({ summary: 'Reactivate a deactivated/suspended admin user' })
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.reactivate(id);
  }

  @Get(':id/roles')
  @RequirePermissions('admins.view')
  @ApiOperation({ summary: 'Get assigned roles for admin user' })
  getRoles(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.getRoles(id);
  }

  @Post(':id/roles')
  @RequirePermissions('admins.update')
  @ApiOperation({ summary: 'Assign role to admin user' })
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.adminUsersService.assignRole(id, dto);
  }

  @Delete(':id/roles/:roleId')
  @RequirePermissions('admins.update')
  @ApiOperation({ summary: 'Remove role from admin user' })
  removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.adminUsersService.removeRole(id, roleId);
  }

  @Get(':id/audit-log')
  @RequirePermissions('admins.view')
  @ApiOperation({ summary: 'Get audit log for an admin user' })
  getAuditLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminUsersService.getAuditLog(id, page, limit);
  }

  @Post(':id/reset-password')
  @RequirePermissions('admins.update')
  @ApiOperation({ summary: 'Reset admin user password via Logto' })
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.resetPassword(id);
  }

  @Get(':id/mfa')
  @RequirePermissions('admins.view')
  @ApiOperation({ summary: 'Get MFA verifications for admin user (from Logto)' })
  getMfaVerifications(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.getMfaVerifications(id);
  }

  @Delete(':id/mfa/:verificationId')
  @RequirePermissions('admins.update')
  @ApiOperation({ summary: 'Remove an MFA verification for admin user' })
  deleteMfaVerification(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('verificationId') verificationId: string,
  ) {
    return this.adminUsersService.deleteMfaVerification(id, verificationId);
  }
}
