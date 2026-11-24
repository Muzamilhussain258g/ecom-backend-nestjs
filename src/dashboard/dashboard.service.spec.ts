import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Reflector } from '@nestjs/core';
import { OrderStatus, UserRole } from 'generated/prisma/enums';
import { RolesGuard } from '@/common/guards/roles.guard';
import { PrismaService } from 'prisma/prisma.service';
import {
  DashboardGroupBy,
  DateRangeQueryDto,
  InventoryAlertsQueryDto,
  SalesQueryDto,
} from './dto/dashboard-query.dto';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    order: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    user: { count: jest.fn() },
    variant: { count: jest.fn(), findMany: jest.fn() },
  };
  const service = new DashboardService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the last 30 UTC days and compares overview metrics to the prior period', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-20T18:00:00.000Z'));
    prisma.$queryRaw
      .mockResolvedValueOnce([{ revenue: '100.00', paidOrderCount: 2 }])
      .mockResolvedValueOnce([{ revenue: '80.00', paidOrderCount: 2 }]);
    prisma.order.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    prisma.user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.variant.count.mockResolvedValueOnce(4);

    try {
      const result = await service.getOverview(new DateRangeQueryDto());

      expect(result.period).toEqual({
        from: '2026-10-22',
        to: '2026-11-20',
      });
      expect(result.metrics).toEqual({
        revenue: { value: '100.00', changePercent: 25 },
        totalOrders: { value: 5, changePercent: 25 },
        averageOrderValue: { value: '50.00', changePercent: 25 },
        newCustomers: { value: 3, changePercent: 50 },
        pendingOrders: { value: 2, changePercent: null },
        lowStockVariants: { value: 4, changePercent: null },
      });
      expect(prisma.order.count).toHaveBeenLastCalledWith({
        where: { status: OrderStatus.pending },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects reversed date ranges before querying the database', async () => {
    await expect(
      service.getOverview({
        from: '2026-11-21',
        to: '2026-11-20',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('fills missing sales buckets with zero values', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        bucket: new Date('2026-11-19T00:00:00.000Z'),
        revenue: '50.00',
        orders: 1,
      },
    ]);

    const result = await service.getSales({
      from: '2026-11-19',
      to: '2026-11-20',
      groupBy: DashboardGroupBy.day,
    });

    expect(result.points).toEqual([
      { date: '2026-11-19', revenue: '50.00', orders: 1 },
      { date: '2026-11-20', revenue: '0', orders: 0 },
    ]);
  });

  it('limits top products and excludes cancelled and returned orders', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await service.getTopProducts({
      from: '2026-11-01',
      to: '2026-11-30',
      limit: 3,
    });

    const queryText = (
      prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray
    ).join('?');
    expect(queryText).toContain(
      `o."status" NOT IN ('cancelled', 'returned')`,
    );
    expect(prisma.$queryRaw.mock.calls[0]).toContain(3);
  });

  it('applies the requested low-stock threshold and pagination', async () => {
    prisma.variant.count.mockResolvedValue(1);
    prisma.variant.findMany.mockResolvedValue([
      {
        id: 8,
        sku: 'SKU-8',
        stock: 2,
        product: { name: 'Low stock item', slug: 'low-stock-item' },
      },
    ]);

    const result = await service.getInventoryAlerts({
      threshold: 5,
      page: 2,
      limit: 10,
    });

    expect(prisma.variant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          stock: { lt: 5 },
          product: { productStatus: true },
        },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.variants[0]).toEqual({
      variantId: 8,
      sku: 'SKU-8',
      stock: 2,
      productName: 'Low stock item',
      productSlug: 'low-stock-item',
    });
    expect(result.pagination).toMatchObject({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('returns a zero-filled status breakdown', async () => {
    prisma.order.groupBy.mockResolvedValue([
      { status: OrderStatus.pending, _count: { _all: 2 } },
    ]);

    const result = await service.getOrdersBreakdown({
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(result).toHaveLength(Object.values(OrderStatus).length);
    expect(result.find((row) => row.status === OrderStatus.pending)).toEqual({
      status: OrderStatus.pending,
      count: 2,
    });
    expect(result.find((row) => row.status === OrderStatus.delivered)).toEqual({
      status: OrderStatus.delivered,
      count: 0,
    });
  });
});

describe('Dashboard query validation and access', () => {
  it('rejects invalid date strings and unsupported grouping values', async () => {
    const invalidDate = plainToInstance(DateRangeQueryDto, {
      from: '2026-02-31',
    });
    const invalidGroup = plainToInstance(SalesQueryDto, {
      groupBy: 'year',
    });

    expect(await validate(invalidDate)).not.toHaveLength(0);
    expect(await validate(invalidGroup)).not.toHaveLength(0);
  });

  it('transforms and validates stock alert query values', async () => {
    const query = plainToInstance(InventoryAlertsQueryDto, {
      page: '2',
      limit: '20',
      threshold: '5',
    });

    expect(await validate(query)).toHaveLength(0);
    expect(query).toEqual({ page: 2, limit: 20, threshold: 5 });
  });

  it.each([UserRole.customer, UserRole.seller])(
    'denies dashboard access to %s',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      const context = {
        getHandler: () => DashboardController.prototype.getOverview,
        getClass: () => DashboardController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(
        'You do not have permission to access this resource',
      );
    },
  );
});
