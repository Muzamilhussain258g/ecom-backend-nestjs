import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { RolesGuard } from '@/common/guards/roles.guard';
import { UserQueryDto } from './dto/user-query.dto';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('Users listing', () => {
  const prisma = {
    user: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((queries: unknown[]) => Promise.all(queries)),
  };
  const service = new UserService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
  });

  it('applies search to both the page and count and only selects safe fields', async () => {
    prisma.user.count.mockResolvedValue(25);
    const result = await service.findAll({
      page: 2,
      limit: 10,
      search: 'Alice',
    });
    const where = {
      OR: [
        { name: { contains: 'Alice', mode: 'insensitive' } },
        { email: { contains: 'Alice', mode: 'insensitive' } },
      ],
    };
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where,
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({ where });
    expect(result.meta.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('returns empty pagination without search', async () => {
    const result = await service.findAll(new UserQueryDto());
    expect(prisma.user.count).toHaveBeenCalledWith({ where: {} });
    expect(result.users).toEqual([]);
    expect(result.meta.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('transforms pagination query parameters and trims search', async () => {
    const query = plainToInstance(UserQueryDto, {
      page: '2',
      limit: '20',
      search: ' Alice ',
    });
    expect(await validate(query)).toHaveLength(0);
    expect(query).toEqual({ page: 2, limit: 20, search: 'Alice' });
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { limit: '101' },
    { limit: 'abc' },
    { search: ['Alice'] },
  ])('rejects invalid query %j', async (input) => {
    expect(
      (await validate(plainToInstance(UserQueryDto, input))).length,
    ).toBeGreaterThan(0);
  });

  it.each(['customer', 'seller', 'admin'])(
    'restricts access for %s',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      const context = {
        getHandler: () => UserController.prototype.findAll,
        getClass: () => UserController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      } as unknown as ExecutionContext;
      if (role === 'admin') {
        expect(guard.canActivate(context)).toBe(true);
      } else {
        expect(() => guard.canActivate(context)).toThrow(
          'You do not have permission to access this resource',
        );
      }
    },
  );
});
