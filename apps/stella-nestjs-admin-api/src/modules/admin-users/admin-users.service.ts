import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Not, In, DataSource } from 'typeorm';
import { AdminUser } from './entities/admin-user.entity';
import { Role } from './entities/role.entity';
import { AdminUserRole } from './entities/admin-user-role.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { DeactivateAdminDto } from './dto/deactivate-admin.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { InviteAdminDto } from './dto/invite-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { PermissionsService } from '../auth/permissions.service';
import { LogtoManagementService } from '../../common/services/logto-management.service';
import * as crypto from 'crypto';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUsersRepo: Repository<AdminUser>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectRepository(AdminUserRole)
    private readonly adminUserRolesRepo: Repository<AdminUserRole>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogRepo: Repository<AdminAuditLog>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly logtoManagement: LogtoManagementService,
  ) {}

  async findAll(query: QueryAdminUsersDto) {
    const { page, limit, search, status, sortBy, sortOrder } = query;

    const where: any = {};
    if (status) where.status = status;

    if (search) {
      const qb = this.adminUsersRepo.createQueryBuilder('au');
      qb.andWhere(
        '(au.email ILIKE :search OR au.first_name ILIKE :search OR au.last_name ILIKE :search)',
        { search: `%${search}%` },
      );
      if (status) qb.andWhere('au.status = :status', { status });

      const sortMap: Record<string, string> = {
        created_at: 'au.created_at',
        email: 'au.email',
        last_login_at: 'au.last_login_at',
      };
      qb.orderBy(sortMap[sortBy] || 'au.created_at', sortOrder === 'ASC' ? 'ASC' : 'DESC');

      const total = await qb.getCount();
      qb.skip((page - 1) * limit).take(limit);
      const data = await qb.getMany();

      const summary = await this.getSummary();
      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) }, summary };
    }

    const sortMap: Record<string, string> = {
      created_at: 'createdAt',
      email: 'email',
      last_login_at: 'lastLoginAt',
    };

    const [data, total] = await this.adminUsersRepo.findAndCount({
      where,
      order: { [sortMap[sortBy] || 'createdAt']: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    const summary = await this.getSummary();
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) }, summary };
  }

  private async getSummary() {
    const result = await this.adminUsersRepo.manager.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'invited')::int AS invited,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE status = 'deactivated')::int AS deactivated
      FROM admin.admin_users
    `);
    return result[0];
  }

  async findOne(id: string): Promise<AdminUser> {
    const user = await this.adminUsersRepo.findOneBy({ id });
    if (!user) throw new NotFoundException(`Admin user ${id} not found`);
    return user;
  }

  async getRoles(adminUserId: string) {
    await this.findOne(adminUserId);
    const assignments = await this.adminUserRolesRepo.find({
      where: { adminUserId },
      relations: ['role', 'assignedByAdmin'],
      order: { assignedAt: 'DESC' },
    });

    return assignments.map((a) => ({
      id: a.role.id,
      name: a.role.name,
      code: a.role.code,
      hierarchyLevel: a.role.hierarchyLevel,
      isSystem: a.role.isSystem,
      assignedAt: a.assignedAt,
      expiresAt: a.expiresAt,
      assignedBy: a.assignedByAdmin
        ? { id: a.assignedByAdmin.id, email: a.assignedByAdmin.email, name: a.assignedByAdmin.displayName }
        : null,
    }));
  }

  async getAvailableRoles(adminUserId: string) {
    const assigned = await this.adminUserRolesRepo.find({
      where: { adminUserId },
      select: ['roleId'],
    });
    const assignedIds = assigned.map((a) => a.roleId);

    const where: any = { isActive: true };
    if (assignedIds.length > 0) {
      where.id = Not(In(assignedIds));
    }

    return this.rolesRepo.find({
      where,
      order: { hierarchyLevel: 'ASC' },
    });
  }

  async deactivate(id: string, dto: DeactivateAdminDto): Promise<AdminUser> {
    const user = await this.findOne(id);
    user.status = 'deactivated';
    user.deactivatedAt = new Date();
    user.deactivationReason = dto.reason;
    const saved = await this.adminUsersRepo.save(user);

    await this.auditLogRepo.save({
      adminUserId: id,
      adminEmail: user.email,
      adminName: user.displayName || `${user.firstName} ${user.lastName}`,
      action: 'admin_user.deactivated',
      resourceType: 'admin_user',
      resourceId: id,
      reason: dto.reason,
      newValue: { status: 'deactivated', reason: dto.reason },
    });

    // Invalidate permissions cache — deactivated users should be blocked immediately
    this.logger.log(`Deactivate: user.logtoUserId = "${user.logtoUserId}" (type: ${typeof user.logtoUserId})`);
    if (user.logtoUserId) {
      this.permissionsService.invalidateCache(user.logtoUserId);

      // Suspend user in Logto so they can't authenticate at all
      this.logger.log(`Calling logtoManagement.suspendUser("${user.logtoUserId}")...`);
      this.logtoManagement
        .suspendUser(user.logtoUserId)
        .then((result) => this.logger.log(`Logto suspend success for ${user.logtoUserId}: isSuspended=${result?.isSuspended}`))
        .catch((err) =>
          this.logger.error(`Failed to suspend Logto user ${user.logtoUserId}: ${err.message}`, err.stack),
        );
    } else {
      this.logger.warn(`Deactivate: skipping Logto suspend — logtoUserId is falsy for admin ${id}`);
    }

    return saved;
  }

  async reactivate(id: string): Promise<AdminUser> {
    const user = await this.findOne(id);
    if (user.status !== 'deactivated' && user.status !== 'suspended') {
      return user;
    }

    const oldStatus = user.status;
    user.status = 'active';
    user.deactivatedAt = null as any;
    user.deactivationReason = null as any;
    const saved = await this.adminUsersRepo.save(user);

    await this.auditLogRepo.save({
      adminUserId: id,
      adminEmail: user.email,
      adminName: user.displayName || `${user.firstName} ${user.lastName}`,
      action: 'admin_user.reactivated',
      resourceType: 'admin_user',
      resourceId: id,
      oldValue: { status: oldStatus },
      newValue: { status: 'active' },
    });

    // Unsuspend in Logto
    this.logger.log(`Reactivate: user.logtoUserId = "${user.logtoUserId}" (type: ${typeof user.logtoUserId})`);
    if (user.logtoUserId) {
      this.permissionsService.invalidateCache(user.logtoUserId);
      this.logger.log(`Calling logtoManagement.unsuspendUser("${user.logtoUserId}")...`);
      this.logtoManagement
        .unsuspendUser(user.logtoUserId)
        .then((result) => this.logger.log(`Logto unsuspend success for ${user.logtoUserId}: isSuspended=${result?.isSuspended}`))
        .catch((err) =>
          this.logger.error(`Failed to unsuspend Logto user ${user.logtoUserId}: ${err.message}`, err.stack),
        );
    } else {
      this.logger.warn(`Reactivate: skipping Logto unsuspend — logtoUserId is falsy for admin ${id}`);
    }

    return saved;
  }

  async assignRole(adminUserId: string, dto: AssignRoleDto) {
    await this.findOne(adminUserId);
    const role = await this.rolesRepo.findOneBy({ id: dto.roleId });
    if (!role) throw new NotFoundException(`Role ${dto.roleId} not found`);

    const existing = await this.adminUserRolesRepo.findOneBy({
      adminUserId,
      roleId: dto.roleId,
    });
    if (existing) throw new ConflictException('Role already assigned');

    const assignment = new AdminUserRole();
    assignment.adminUserId = adminUserId;
    assignment.roleId = dto.roleId;
    assignment.assignedAt = new Date();
    assignment.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    await this.adminUserRolesRepo.save(assignment);

    // Invalidate permissions cache so changes take effect immediately
    const adminUser = await this.adminUsersRepo.findOneBy({ id: adminUserId });
    if (adminUser?.logtoUserId) {
      this.permissionsService.invalidateCache(adminUser.logtoUserId);
    }

    return { success: true, message: 'Role assigned successfully', role: { id: role.id, name: role.name } };
  }

  async removeRole(adminUserId: string, roleId: string) {
    await this.findOne(adminUserId);
    const assignment = await this.adminUserRolesRepo.findOneBy({ adminUserId, roleId });
    if (!assignment) throw new NotFoundException('Role assignment not found');

    await this.adminUserRolesRepo.remove(assignment);

    // Invalidate permissions cache
    const adminUser = await this.adminUsersRepo.findOneBy({ id: adminUserId });
    if (adminUser?.logtoUserId) {
      this.permissionsService.invalidateCache(adminUser.logtoUserId);
    }

    return { success: true, message: 'Role removed successfully' };
  }

  async resetPassword(id: string) {
    const user = await this.findOne(id);

    // Generate a temporary password and push it to Logto
    if (user.logtoUserId) {
      const tempPassword = this.generateTemporaryPassword();
      await this.logtoManagement.resetUserPassword(user.logtoUserId, tempPassword);
      // TODO: send tempPassword to user via email
    }

    user.forcePasswordChange = true;
    await this.adminUsersRepo.save(user);

    await this.auditLogRepo.save({
      adminUserId: id,
      adminEmail: user.email,
      adminName: user.displayName || `${user.firstName} ${user.lastName}`,
      action: 'admin_user.password_reset',
      resourceType: 'admin_user',
      resourceId: id,
    });

    return { success: true, message: 'Password reset initiated successfully' };
  }

  // ─── Invite Admin User ──────────────────────────────────────

  async invite(dto: InviteAdminDto, invitedById?: string) {
    // Check email uniqueness
    const existing = await this.adminUsersRepo.findOneBy({ email: dto.email });
    if (existing) {
      throw new ConflictException(`Admin user with email ${dto.email} already exists`);
    }

    // Check username uniqueness
    const existingUsername = await this.adminUsersRepo.findOneBy({ username: dto.username });
    if (existingUsername) {
      throw new ConflictException(`Username "${dto.username}" is already taken`);
    }

    // Validate roles upfront if provided
    let rolesToAssign: Role[] = [];
    if (dto.roleIds?.length) {
      rolesToAssign = await this.rolesRepo.findBy({ id: In(dto.roleIds), isActive: true });
      if (rolesToAssign.length !== dto.roleIds.length) {
        throw new NotFoundException('One or more role IDs are invalid or inactive');
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let logtoUserId: string | null = null;

    try {
      // Step 1: Create Postgres record
      const adminUser = new AdminUser();
      adminUser.email = dto.email;
      adminUser.username = dto.username;
      adminUser.firstName = dto.firstName;
      adminUser.lastName = dto.lastName;
      adminUser.phone = dto.phone as any;
      adminUser.status = 'invited';
      adminUser.invitedBy = invitedById as any;
      adminUser.invitedAt = new Date();
      await queryRunner.manager.save(adminUser);

      // Step 2: Create user in Logto
      const tempPassword = this.generateTemporaryPassword();
      const logtoUser = await this.logtoManagement.createUser({
        primaryEmail: dto.email,
        username: dto.username,
        name: `${dto.firstName} ${dto.lastName}`,
        password: tempPassword,
        customData: { stellaAdminId: adminUser.id },
      });
      logtoUserId = logtoUser.id;

      // Step 3: Link accounts
      adminUser.logtoUserId = logtoUser.id;
      adminUser.forcePasswordChange = true;
      await queryRunner.manager.save(adminUser);

      // Step 4: Assign roles if provided
      if (rolesToAssign.length > 0) {
        const assignments = rolesToAssign.map((role) => {
          const aur = new AdminUserRole();
          aur.adminUserId = adminUser.id;
          aur.roleId = role.id;
          aur.assignedBy = invitedById as any;
          aur.assignedAt = new Date();
          return aur;
        });
        await queryRunner.manager.save(assignments);
      }

      // Step 5: Commit transaction
      await queryRunner.commitTransaction();

      // Step 6: Audit log (non-transactional)
      this.auditLogRepo.save({
        adminUserId: invitedById || adminUser.id,
        adminEmail: dto.email,
        adminName: `${dto.firstName} ${dto.lastName}`,
        action: 'admin_user.invited',
        resourceType: 'admin_user',
        resourceId: adminUser.id,
        newValue: {
          email: dto.email,
          roles: rolesToAssign.map((r) => r.name),
        },
      }).catch((err) => this.logger.error('Audit log failed', err));

      this.logger.log(`Admin user invited: ${dto.email} (logto: ${logtoUser.id})`);

      return {
        success: true,
        message: 'Admin user invited successfully',
        user: {
          id: adminUser.id,
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          status: adminUser.status,
          logtoUserId: adminUser.logtoUserId,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Clean up Logto user if it was created
      if (logtoUserId) {
        await this.logtoManagement.deleteUser(logtoUserId).catch((err) =>
          this.logger.error(`Failed to rollback Logto user ${logtoUserId}`, err),
        );
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── Update Admin User ──────────────────────────────────────

  async update(id: string, dto: UpdateAdminDto) {
    const user = await this.findOne(id);

    // Check username uniqueness if changing
    if (dto.username && dto.username !== user.username) {
      const existingUsername = await this.adminUsersRepo.findOneBy({ username: dto.username });
      if (existingUsername && existingUsername.id !== id) {
        throw new ConflictException(`Username "${dto.username}" is already taken`);
      }
    }

    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    // Track changes
    const fields: (keyof UpdateAdminDto)[] = ['username', 'firstName', 'lastName', 'phone', 'timezone', 'avatarUrl'];
    for (const field of fields) {
      if (dto[field] !== undefined && dto[field] !== (user as any)[field]) {
        oldValues[field] = (user as any)[field];
        newValues[field] = dto[field];
        (user as any)[field] = dto[field];
      }
    }

    if (Object.keys(newValues).length === 0) {
      return user;
    }

    const saved = await this.adminUsersRepo.save(user);

    // Sync changes to Logto if applicable
    if (user.logtoUserId && (newValues.firstName || newValues.lastName || newValues.username)) {
      const logtoPayload: { name?: string; username?: string } = {};
      if (newValues.firstName || newValues.lastName) {
        logtoPayload.name = `${saved.firstName} ${saved.lastName}`;
      }
      if (newValues.username) {
        logtoPayload.username = saved.username;
      }
      this.logtoManagement
        .updateUser(user.logtoUserId, logtoPayload)
        .catch((err) =>
          this.logger.error(`Failed to sync profile to Logto for ${user.logtoUserId}`, err),
        );
    }

    // Audit log
    this.auditLogRepo.save({
      adminUserId: id,
      adminEmail: user.email,
      adminName: user.displayName || `${user.firstName} ${user.lastName}`,
      action: 'admin_user.updated',
      resourceType: 'admin_user',
      resourceId: id,
      oldValue: oldValues,
      newValue: newValues,
    }).catch((err) => this.logger.error('Audit log failed', err));

    return saved;
  }

  // ─── Audit Log ──────────────────────────────────────────────

  async getAuditLog(adminUserId: string, page = 1, limit = 20) {
    await this.findOne(adminUserId); // ensure user exists

    const [data, total] = await this.auditLogRepo.findAndCount({
      where: [
        { adminUserId },
        { resourceId: adminUserId, resourceType: 'admin_user' },
      ],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── MFA Management ────────────────────────────────────────

  async getMfaVerifications(id: string) {
    const user = await this.findOne(id);
    if (!user.logtoUserId) {
      return { verifications: [], mfaEnabled: false };
    }

    try {
      const verifications = await this.logtoManagement.getUserMfaVerifications(user.logtoUserId);
      const mfaEnabled = verifications.length > 0;

      // Sync mfaEnabled flag in Postgres if out of sync
      if (user.mfaEnabled !== mfaEnabled) {
        user.mfaEnabled = mfaEnabled;
        await this.adminUsersRepo.save(user);
      }

      return { verifications, mfaEnabled };
    } catch (error) {
      this.logger.error(`Failed to fetch MFA verifications for user ${id}`, error);
      // Fall back to Postgres value
      return { verifications: [], mfaEnabled: user.mfaEnabled };
    }
  }

  async deleteMfaVerification(id: string, verificationId: string) {
    const user = await this.findOne(id);
    if (!user.logtoUserId) {
      throw new NotFoundException('User has no linked Logto account');
    }

    await this.logtoManagement.deleteUserMfaVerification(user.logtoUserId, verificationId);

    // Check remaining verifications to update mfaEnabled flag
    const remaining = await this.logtoManagement.getUserMfaVerifications(user.logtoUserId);
    user.mfaEnabled = remaining.length > 0;
    await this.adminUsersRepo.save(user);

    // Audit log
    this.auditLogRepo.save({
      adminUserId: id,
      adminEmail: user.email,
      adminName: user.displayName || `${user.firstName} ${user.lastName}`,
      action: 'admin_user.mfa_removed',
      resourceType: 'admin_user',
      resourceId: id,
      newValue: { verificationId, mfaEnabled: user.mfaEnabled, remainingFactors: remaining.length },
    }).catch((err) => this.logger.error('Audit log failed', err));

    return { success: true, message: 'MFA verification removed', mfaEnabled: user.mfaEnabled };
  }

  // ─── Helpers ────────────────────────────────────────────────

  private generateTemporaryPassword(): string {
    // 16 chars: mix of upper, lower, digits, symbols
    return crypto.randomBytes(12).toString('base64url').slice(0, 16) + '!A1';
  }
}
