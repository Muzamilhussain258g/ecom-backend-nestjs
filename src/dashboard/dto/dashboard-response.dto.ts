import { ApiProperty } from '@nestjs/swagger';
import { DashboardGroupBy } from './dashboard-query.dto';

export class DashboardPeriodDto {
  @ApiProperty({ example: '2026-11-01' })
  from: string;

  @ApiProperty({ example: '2026-11-30' })
  to: string;
}

export class DashboardMetricDto {
  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }] })
  value: number | string;

  @ApiProperty({ nullable: true, example: 12.5 })
  changePercent: number | null;
}

export class DashboardMetricsDto {
  @ApiProperty({ type: DashboardMetricDto })
  revenue: DashboardMetricDto;

  @ApiProperty({ type: DashboardMetricDto })
  totalOrders: DashboardMetricDto;

  @ApiProperty({ type: DashboardMetricDto })
  averageOrderValue: DashboardMetricDto;

  @ApiProperty({ type: DashboardMetricDto })
  newCustomers: DashboardMetricDto;

  @ApiProperty({ type: DashboardMetricDto })
  pendingOrders: DashboardMetricDto;

  @ApiProperty({ type: DashboardMetricDto })
  lowStockVariants: DashboardMetricDto;
}

export class DashboardOverviewResponseDto {
  @ApiProperty({ type: DashboardPeriodDto })
  period: DashboardPeriodDto;

  @ApiProperty({ type: DashboardMetricsDto })
  metrics: DashboardMetricsDto;
}

export class SalesPointDto {
  @ApiProperty({ example: '2026-11-19' })
  date: string;

  @ApiProperty({ example: '42000.00' })
  revenue: string;

  @ApiProperty({ example: 12 })
  orders: number;
}

export class SalesResponseDto {
  @ApiProperty({ enum: DashboardGroupBy })
  groupBy: DashboardGroupBy;

  @ApiProperty({ type: [SalesPointDto] })
  points: SalesPointDto[];
}

export class OrderStatusCountDto {
  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({ example: 4 })
  count: number;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 25 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage: boolean;
}

export class TopProductDto {
  @ApiProperty({ example: 10 })
  productId: number;

  @ApiProperty({ example: 'Wireless Headphones' })
  name: string;

  @ApiProperty({ example: 'wireless-headphones' })
  slug: string;

  @ApiProperty({ example: 24 })
  unitsSold: number;

  @ApiProperty({ example: '2399.76' })
  revenue: string;
}

export class RecentOrderDto {
  @ApiProperty({ example: 100 })
  id: number;

  @ApiProperty({ example: 'Jane Doe' })
  customerName: string;

  @ApiProperty({ example: 'jane@example.com' })
  customerEmail: string;

  @ApiProperty({ example: '199.98' })
  totalAmount: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({ example: 2 })
  itemCount: number;

  @ApiProperty({ example: '2026-11-19T10:00:00.000Z' })
  createdAt: Date;
}

export class InventoryAlertDto {
  @ApiProperty({ example: 12 })
  variantId: number;

  @ApiProperty({ example: 'WH-BLK-001' })
  sku: string;

  @ApiProperty({ example: 2 })
  stock: number;

  @ApiProperty({ example: 'Wireless Headphones' })
  productName: string;

  @ApiProperty({ example: 'wireless-headphones' })
  productSlug: string;
}

export class PaginatedMetaResponseDto {
  @ApiProperty({ type: PaginationMetaDto })
  pagination: PaginationMetaDto;
}

export class RecentOrdersResponseDto extends PaginatedMetaResponseDto {
  @ApiProperty({ type: [RecentOrderDto] })
  orders: RecentOrderDto[];
}

export class InventoryAlertsResponseDto extends PaginatedMetaResponseDto {
  @ApiProperty({ example: 5 })
  threshold: number;

  @ApiProperty({ type: [InventoryAlertDto] })
  variants: InventoryAlertDto[];
}
