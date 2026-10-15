import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from '../admin-users/entities/admin-user.entity';
import { AdminAuditLog } from '../admin-users/entities/admin-audit-log.entity';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUsersRepo: Repository<AdminUser>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogRepo: Repository<AdminAuditLog>,
  ) {}

  async trackAdminLogin(logtoUserId: string, ipAddress: string) {
    const user = await this.adminUsersRepo.findOneBy({ logtoUserId });

    if (!user) {
      this.logger.warn(`Login tracked for unknown Logto user: ${logtoUserId}`);
      return { success: false, message: 'Admin user not found' };
    }

    // Update login tracking fields
    user.lastLoginAt = new Date();
    user.lastLoginIp = ipAddress;
    user.failedLoginCount = 0;

    // If user was invited and this is their first login, activate them
    if (user.status === 'invited') {
      user.status = 'active';
      user.activatedAt = new Date();
      this.logger.log(`Admin user ${user.email} activated on first login`);
    }

    await this.adminUsersRepo.save(user);

    // Audit log (fire and forget)
    this.auditLogRepo
      .save({
        adminUserId: user.id,
        adminEmail: user.email,
        adminName: user.displayName || `${user.firstName} ${user.lastName}`,
        action: 'admin_user.login',
        resourceType: 'admin_user',
        resourceId: user.id,
        ipAddress,
        newValue: { lastLoginAt: user.lastLoginAt, ip: ipAddress },
      })
      .catch((err) => this.logger.error('Audit log failed', err));

    return { success: true };
  }
}
