import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profilesRepo: Repository<UserProfile>,
  ) {}

  async findAll(query: QueryUsersDto): Promise<PaginatedResponse<User>> {
    const { page, limit, search, status, kycStatus, tier, sortBy, sortOrder } = query;

    // Use find() API to avoid TypeORM cross-schema orderBy bug with createQueryBuilder
    const where: any = {};
    if (status) where.status = status;
    if (kycStatus) where.kycStatus = kycStatus;
    if (tier) where.tier = tier;

    // For search queries, use query builder with a subquery approach
    if (search) {
      const qb = this.usersRepo
        .createQueryBuilder('u')
        .leftJoin('u.profile', 'p');

      qb.andWhere(
        '(u.email ILIKE :search OR u.username ILIKE :search OR p.display_name ILIKE :search OR p.first_name ILIKE :search OR p.last_name ILIKE :search)',
        { search: `%${search}%` },
      );
      if (status) qb.andWhere('u.status = :status', { status });
      if (kycStatus) qb.andWhere('u.kyc_status = :kycStatus', { kycStatus });
      if (tier) qb.andWhere('u.tier = :tier', { tier });

      const allowedSorts: Record<string, string> = {
        created_at: 'u.created_at',
        email: 'u.email',
        status: 'u.status',
        tier: 'u.tier',
        last_login_at: 'u.last_login_at',
      };
      const sortColumn = allowedSorts[sortBy] || 'u.created_at';
      qb.orderBy(sortColumn, sortOrder === 'ASC' ? 'ASC' : 'DESC');

      const total = await qb.getCount();
      const userIds = await qb
        .select('u.id')
        .skip((page - 1) * limit)
        .take(limit)
        .getRawMany();

      const ids = userIds.map((r) => r.u_id);
      let data: User[] = [];
      if (ids.length > 0) {
        data = await this.usersRepo.find({
          where: { id: In(ids) },
          relations: ['profile'],
          order: { [sortBy === 'last_login_at' ? 'lastLoginAt' : sortBy === 'created_at' ? 'createdAt' : sortBy]: sortOrder },
        });
      }

      return {
        data,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }

    // Non-search: use find() API which handles cross-schema relations correctly
    const sortMap: Record<string, string> = {
      created_at: 'createdAt',
      email: 'email',
      status: 'status',
      tier: 'tier',
      last_login_at: 'lastLoginAt',
    };
    const orderField = sortMap[sortBy] || 'createdAt';

    const [data, total] = await this.usersRepo.findAndCount({
      where,
      relations: ['profile'],
      order: { [orderField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['profile'],
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async getTransactions(userId: string, page = 1, limit = 25) {
    const offset = (page - 1) * limit;
    const manager = this.usersRepo.manager;

    const [data, countResult] = await Promise.all([
      manager.query(
        `SELECT * FROM billing.payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
      manager.query(
        `SELECT COUNT(*)::int AS total FROM billing.payments WHERE user_id = $1`,
        [userId],
      ),
    ]);

    const total = countResult[0]?.total ?? 0;
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, dto);
    return this.usersRepo.save(user);
  }

  async suspend(id: string, dto: SuspendUserDto): Promise<User> {
    const user = await this.findOne(id);
    user.status = 'suspended';
    user.metadata = {
      ...user.metadata,
      suspendedAt: new Date().toISOString(),
      suspendReason: dto.reason,
    };
    return this.usersRepo.save(user);
  }

  async reactivate(id: string): Promise<User> {
    const user = await this.findOne(id);
    user.status = 'active';
    user.metadata = {
      ...user.metadata,
      reactivatedAt: new Date().toISOString(),
    };
    return this.usersRepo.save(user);
  }
}
