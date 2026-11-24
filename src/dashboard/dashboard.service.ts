import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, UserRole } from 'generated/prisma/enums';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import {
  DashboardGroupBy,
  DateRangeQueryDto,
  InventoryAlertsQueryDto,
  PaginationQueryDto,
  SalesQueryDto,
  TopProductsQueryDto,
} from './dto/dashboard-query.dto';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

interface DateRange {
  from: Date;
  toExclusive: Date;
  fromLabel: string;
  toLabel: string;
}

interface PaidMetrics {
  revenue: string;
  paidOrderCount: number;
}

interface SalesBucket {
  bucket: Date;
  revenue: string;
  orders: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: DateRangeQueryDto) {
    const range = resolveDateRange(query);
    const previousRange = getPreviousRange(range);
    const [paid, previousPaid, orders, previousOrders, customers, previousCustomers, pendingOrders, lowStockVariants] =
      await Promise.all([
        this.getPaidMetrics(range),
        this.getPaidMetrics(previousRange),
        this.countOrders(range),
        this.countOrders(previousRange),
        this.countNewCustomers(range),
        this.countNewCustomers(previousRange),
        this.prisma.order.count({ where: { status: OrderStatus.pending } }),
        this.countLowStockVariants(DEFAULT_LOW_STOCK_THRESHOLD),
      ]);

    const averageOrderValue =
      paid.paidOrderCount === 0
        ? 0
        : Number(paid.revenue) / paid.paidOrderCount;
    const previousAverageOrderValue =
      previousPaid.paidOrderCount === 0
        ? 0
        : Number(previousPaid.revenue) / previousPaid.paidOrderCount;

    return {
      period: { from: range.fromLabel, to: range.toLabel },
      metrics: {
        revenue: {
          value: paid.revenue,
          changePercent: percentageChange(
            Number(paid.revenue),
            Number(previousPaid.revenue),
          ),
        },
        totalOrders: {
          value: orders,
          changePercent: percentageChange(orders, previousOrders),
        },
        averageOrderValue: {
          value: averageOrderValue.toFixed(2),
          changePercent: percentageChange(
            averageOrderValue,
            previousAverageOrderValue,
          ),
        },
        newCustomers: {
          value: customers,
          changePercent: percentageChange(customers, previousCustomers),
        },
        pendingOrders: { value: pendingOrders, changePercent: null },
        lowStockVariants: { value: lowStockVariants, changePercent: null },
      },
    };
  }

  async getSales(query: SalesQueryDto) {
    const range = resolveDateRange(query);
    const groupBy = query.groupBy ?? DashboardGroupBy.day;
    const bucketExpression =
      groupBy === DashboardGroupBy.week
        ? Prisma.sql`date_trunc('week', p."paidAt")`
        : groupBy === DashboardGroupBy.month
          ? Prisma.sql`date_trunc('month', p."paidAt")`
          : Prisma.sql`date_trunc('day', p."paidAt")`;

    const rows = await this.prisma.$queryRaw<SalesBucket[]>`
      SELECT
        ${bucketExpression} AS bucket,
        COALESCE(SUM(p."amount"), 0)::text AS revenue,
        COUNT(DISTINCT p."orderId")::int AS orders
      FROM "Payment" p
      WHERE p."status" = 'success'
        AND p."paidAt" >= ${range.from}
        AND p."paidAt" < ${range.toExclusive}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const rowsByBucket = new Map(
      rows.map((row) => [new Date(row.bucket).toISOString(), row]),
    );

    return {
      groupBy,
      points: createBuckets(range, groupBy).map((bucket) => {
        const row = rowsByBucket.get(bucket.toISOString());
        return {
          date: bucket.toISOString().slice(0, 10),
          revenue: row?.revenue ?? '0',
          orders: row?.orders ?? 0,
        };
      }),
    };
  }

  async getOrdersBreakdown(query: DateRangeQueryDto) {
    const range = resolveDateRange(query);
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: range.from, lt: range.toExclusive },
      },
      _count: { _all: true },
    });

    const countByStatus = new Map(
      grouped.map((row) => [row.status, row._count._all]),
    );

    return Object.values(OrderStatus).map((status) => ({
      status,
      count: countByStatus.get(status) ?? 0,
    }));
  }

  async getTopProducts(query: TopProductsQueryDto) {
    const range = resolveDateRange(query);
    const limit = query.limit ?? 5;
    return this.prisma.$queryRaw<
      Array<{
        productId: number;
        name: string;
        slug: string;
        unitsSold: number;
        revenue: string;
      }>
    >`
      SELECT
        p."id" AS "productId",
        p."name" AS name,
        p."slug" AS slug,
        SUM(oi."quantity")::int AS "unitsSold",
        SUM(oi."price" * oi."quantity")::text AS revenue
      FROM "OrderItem" oi
      INNER JOIN "Order" o ON o."id" = oi."orderId"
      INNER JOIN "Variant" v ON v."id" = oi."variantId"
      INNER JOIN "Product" p ON p."id" = v."productId"
      WHERE o."created_at" >= ${range.from}
        AND o."created_at" < ${range.toExclusive}
        AND o."status" NOT IN ('cancelled', 'returned')
      GROUP BY p."id", p."name", p."slug"
      ORDER BY SUM(oi."price" * oi."quantity") DESC, SUM(oi."quantity") DESC
      LIMIT ${limit}
    `;
  }

  async getRecentOrders(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = {};
    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          totalAmount: true,
          status: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        customerName: order.user.name,
        customerEmail: order.user.email,
        totalAmount: String(order.totalAmount),
        status: order.status,
        itemCount: order._count.items,
        createdAt: order.createdAt,
      })),
      pagination: createPagination(page, limit, total),
    };
  }

  async getInventoryAlerts(query: InventoryAlertsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const threshold = query.threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    const where = {
      isActive: true,
      stock: { lt: threshold },
      product: { productStatus: true },
    };
    const [total, variants] = await Promise.all([
      this.prisma.variant.count({ where }),
      this.prisma.variant.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ stock: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          sku: true,
          stock: true,
          product: { select: { name: true, slug: true } },
        },
      }),
    ]);

    return {
      threshold,
      variants: variants.map((variant) => ({
        variantId: variant.id,
        sku: variant.sku,
        stock: variant.stock,
        productName: variant.product.name,
        productSlug: variant.product.slug,
      })),
      pagination: createPagination(page, limit, total),
    };
  }

  private async getPaidMetrics(range: DateRange): Promise<PaidMetrics> {
    const [result] = await this.prisma.$queryRaw<PaidMetrics[]>`
      SELECT
        COALESCE(SUM(p."amount"), 0)::text AS revenue,
        COUNT(DISTINCT p."orderId")::int AS "paidOrderCount"
      FROM "Payment" p
      WHERE p."status" = 'success'
        AND p."paidAt" >= ${range.from}
        AND p."paidAt" < ${range.toExclusive}
    `;
    return result ?? { revenue: '0', paidOrderCount: 0 };
  }

  private countOrders(range: DateRange) {
    return this.prisma.order.count({
      where: {
        createdAt: { gte: range.from, lt: range.toExclusive },
      },
    });
  }

  private countNewCustomers(range: DateRange) {
    return this.prisma.user.count({
      where: {
        role: UserRole.customer,
        createdAt: { gte: range.from, lt: range.toExclusive },
      },
    });
  }

  private countLowStockVariants(threshold: number) {
    return this.prisma.variant.count({
      where: {
        isActive: true,
        stock: { lt: threshold },
        product: { productStatus: true },
      },
    });
  }
}

function resolveDateRange(
  query: DateRangeQueryDto,
  now = new Date(),
): DateRange {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const defaultTo = query.to ?? today.toISOString().slice(0, 10);
  const toDate = parseDate(defaultTo);
  const defaultFromDate = new Date(toDate);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const fromLabel = query.from ?? defaultFromDate.toISOString().slice(0, 10);
  const fromDate = parseDate(fromLabel);

  if (fromDate > toDate) {
    throw new BadRequestException('"from" must be on or before "to"');
  }

  const toExclusive = new Date(toDate);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return {
    from: fromDate,
    toExclusive,
    fromLabel,
    toLabel: defaultTo,
  };
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('Dates must use YYYY-MM-DD format');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`Invalid date: ${value}`);
  }
  return date;
}

function getPreviousRange(range: DateRange): DateRange {
  const duration = range.toExclusive.getTime() - range.from.getTime();
  const previousFrom = new Date(range.from.getTime() - duration);
  return {
    from: previousFrom,
    toExclusive: range.from,
    fromLabel: previousFrom.toISOString().slice(0, 10),
    toLabel: new Date(range.from.getTime() - DAY_IN_MS)
      .toISOString()
      .slice(0, 10),
  };
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function createBuckets(range: DateRange, groupBy: DashboardGroupBy): Date[] {
  const first = new Date(range.from);
  if (groupBy === DashboardGroupBy.week) {
    first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  } else if (groupBy === DashboardGroupBy.month) {
    first.setUTCDate(1);
  }

  const buckets: Date[] = [];
  for (const bucket = first; bucket < range.toExclusive; ) {
    buckets.push(new Date(bucket));
    if (groupBy === DashboardGroupBy.month) {
      bucket.setUTCMonth(bucket.getUTCMonth() + 1);
    } else {
      bucket.setUTCDate(
        bucket.getUTCDate() +
          (groupBy === DashboardGroupBy.week ? 7 : 1),
      );
    }
  }
  return buckets;
}

function createPagination(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}
