import { Module, Global } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { PermissionsService } from './permissions.service';
import { LogtoManagementService } from '../../common/services/logto-management.service';
import { CoolifyService } from '../../common/services/coolify.service';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { AdminUser } from '../admin-users/entities/admin-user.entity';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    ConfigModule,
    TypeOrmModule.forFeature([Permission, RolePermission, AdminUser]),
  ],
  providers: [JwtStrategy, PermissionsService, LogtoManagementService, CoolifyService],
  exports: [JwtStrategy, PassportModule, PermissionsService, LogtoManagementService, CoolifyService],
})
export class AuthModule {}
