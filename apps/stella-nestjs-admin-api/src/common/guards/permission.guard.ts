import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PermissionsService } from '../../modules/auth/permissions.service';
import { JwtPayload } from '../strategies/jwt.strategy';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip if route is @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    // Get required permissions from @RequirePermissions() decorator
    const requiredPermissions = this.reflector.getAllAndOverride<
      string[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    const request = context.switchToHttp().getRequest();
    const jwtPayload: JwtPayload = request.user;

    if (!jwtPayload?.sub) {
      throw new UnauthorizedException('No authenticated user');
    }

    // Resolve Logto user → admin user with permissions
    const adminUser = await this.permissionsService.getAdminByLogtoId(
      jwtPayload.sub,
    );

    if (!adminUser) {
      throw new ForbiddenException(
        'No admin account linked to this Logto user',
      );
    }

    if (adminUser.status !== 'active') {
      throw new ForbiddenException(
        `Admin account is ${adminUser.status}`,
      );
    }

    // Attach admin user to request for use in controllers
    request.adminUser = adminUser;

    // If no specific permissions required, just need to be an active admin
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Check all required permissions
    if (
      !this.permissionsService.hasAllPermissions(
        adminUser,
        requiredPermissions,
      )
    ) {
      this.logger.warn(
        `Access denied for ${adminUser.email}: missing permissions [${requiredPermissions.join(', ')}]`,
      );
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
