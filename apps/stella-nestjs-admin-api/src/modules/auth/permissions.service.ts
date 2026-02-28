import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AdminUser } from '../admin-users/entities/admin-user.entity';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { AdminUserRole } from '../admin-users/entities/admin-user-role.entity';

interface CachedAdminUser {
  id: string;
  email: string;
  displayName: string;
  isSuperAdmin: boolean;
  status: string;
  permissions: string[]; // permission codes
  cachedAt: number;
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private cache = new Map<string, CachedAdminUser>();
  private readonly cacheTtlMs: number;

  constructor(
    @InjectRepository(AdminUser)
    private adminUserRepo: Repository<AdminUser>,
    @InjectRepository(Permission)
    private permissionRepo: Repository<Permission>,
    private configService: ConfigService,
  ) {
    const ttlSeconds =
      this.configService.get<number>('auth.permissionsCacheTtlSeconds') ?? 300;
    this.cacheTtlMs = ttlSeconds * 1000;
  }

  /**
   * Resolve a Logto user ID to an admin user with their permission codes.
   * Uses an in-memory cache with configurable TTL.
   */
  async getAdminByLogtoId(
    logtoUserId: string,
  ): Promise<CachedAdminUser | null> {
    const cached = this.cache.get(logtoUserId);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs) {
      return cached;
    }

    // Single query: admin_user → admin_user_roles → role_permissions → permissions
    const adminUser = await this.adminUserRepo.findOne({
      where: { logtoUserId },
      select: [
        'id',
        'email',
        'displayName',
        'isSuperAdmin',
        'status',
      ],
    });

    if (!adminUser) {
      this.cache.delete(logtoUserId);
      return null;
    }

    let permissionCodes: string[];

    if (adminUser.isSuperAdmin) {
      // Super admin gets all permissions
      const allPermissions = await this.permissionRepo.find({
        select: ['code'],
      });
      permissionCodes = allPermissions.map((p) => p.code);
    } else {
      // Load permission codes via role assignments (excluding expired roles)
      const result = await this.permissionRepo
        .createQueryBuilder('p')
        .innerJoin(RolePermission, 'rp', 'rp.permission_id = p.id')
        .innerJoin(AdminUserRole, 'aur', 'aur.role_id = rp.role_id')
        .where('aur.admin_user_id = :adminUserId', {
          adminUserId: adminUser.id,
        })
        .andWhere(
          '(aur.expires_at IS NULL OR aur.expires_at > NOW())',
        )
        .select('DISTINCT p.code', 'code')
        .getRawMany();

      permissionCodes = result.map((r) => r.code);
    }

    const entry: CachedAdminUser = {
      id: adminUser.id,
      email: adminUser.email,
      displayName: adminUser.displayName,
      isSuperAdmin: adminUser.isSuperAdmin,
      status: adminUser.status,
      permissions: permissionCodes,
      cachedAt: Date.now(),
    };

    this.cache.set(logtoUserId, entry);
    this.logger.debug(
      `Cached ${permissionCodes.length} permissions for admin ${adminUser.email}`,
    );

    return entry;
  }

  /**
   * Check if an admin has a specific permission.
   */
  hasPermission(admin: CachedAdminUser, permissionCode: string): boolean {
    if (admin.isSuperAdmin) return true;
    return admin.permissions.includes(permissionCode);
  }

  /**
   * Check if an admin has ALL of the given permissions.
   */
  hasAllPermissions(
    admin: CachedAdminUser,
    permissionCodes: string[],
  ): boolean {
    if (admin.isSuperAdmin) return true;
    return permissionCodes.every((code) =>
      admin.permissions.includes(code),
    );
  }

  /**
   * Invalidate cache for a specific admin (call after role changes).
   */
  invalidateCache(logtoUserId: string): void {
    this.cache.delete(logtoUserId);
  }

  /**
   * Clear the entire permissions cache.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('Permissions cache cleared');
  }
}
