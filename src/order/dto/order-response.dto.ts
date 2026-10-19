import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentGateway,
  PaymentStatus,
} from 'generated/prisma/enums';

export class OrderShippingSnapshotDto {
  @ApiProperty({ example: 'Jane Doe' })
  shippingFullName: string;

  @ApiProperty({ example: '+1-555-0199' })
  shippingPhone: string;

  @ApiProperty({ example: '123 Elm Street, Apt 4B' })
  shippingStreet: string;

  @ApiProperty({ example: 'Metropolis' })
  shippingCity: string;

  @ApiProperty({ example: 'Central State' })
  shippingProvince: string;

  @ApiProperty({ example: '12345' })
  shippingPostalCode: string;

  @ApiProperty({ example: 'United States' })
  shippingCountry: string;
}

export class OrderItemVariantProductDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Wireless Headphones' })
  name: string;

  @ApiProperty({ example: 'wireless-headphones' })
  slug: string;
}

export class OrderItemVariantDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'WH-BLK-001' })
  sku: string;

  @ApiProperty({ example: 'color:black|size:standard' })
  combinationKey: string;

  @ApiProperty({ type: () => OrderItemVariantProductDto })
  product: OrderItemVariantProductDto;
}

export class OrderItemResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  orderId: number;

  @ApiProperty({ example: 1 })
  variantId: number;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: '99.99' })
  price: string;

  @ApiProperty({ example: 199.98 })
  lineTotal: number;

  @ApiProperty({ type: () => OrderItemVariantDto })
  variant: OrderItemVariantDto;
}

export class OrderPaymentResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  orderId: number;

  @ApiProperty({ example: '199.98' })
  amount: string;

  @ApiProperty({ example: 'PKR' })
  currency: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.pending })
  status: PaymentStatus;

  @ApiProperty({ enum: PaymentGateway, example: PaymentGateway.cod })
  gateway: PaymentGateway;

  @ApiPropertyOptional({ example: 'COD-1-1729094400000' })
  transactionId?: string | null;

  @ApiPropertyOptional({ example: null })
  paidAt?: Date | null;
}

export class OrderResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 10 })
  userId: number;

  @ApiPropertyOptional({ example: 1 })
  shippingAddressId?: number | null;

  @ApiProperty({ type: () => OrderShippingSnapshotDto })
  shipping: OrderShippingSnapshotDto;

  @ApiProperty({ example: '199.98' })
  totalAmount: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.pending })
  status: OrderStatus;

  @ApiProperty({ example: '2026-10-16T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ type: () => [OrderItemResponseDto] })
  items: OrderItemResponseDto[];

  @ApiProperty({ type: () => [OrderPaymentResponseDto] })
  payments: OrderPaymentResponseDto[];
}

export class PaginatedOrderResponseDto {
  @ApiProperty({ type: () => [OrderResponseDto] })
  orders: OrderResponseDto[];

  @ApiProperty({
    example: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
