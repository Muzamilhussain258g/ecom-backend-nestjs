import { ApiProperty } from '@nestjs/swagger';

export class CartVariantProductDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Wireless Headphones' })
  name: string;

  @ApiProperty({ example: 'wireless-headphones' })
  slug: string;

  @ApiProperty({ example: true })
  productStatus: boolean;

  @ApiProperty({ example: [] })
  images: unknown[];
}

export class CartVariantDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'WH-BLK-001' })
  sku: string;

  @ApiProperty({ example: '99.99' })
  price: string;

  @ApiProperty({ example: 50 })
  stock: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: 'color:black|size:standard' })
  combinationKey: string;

  @ApiProperty({ type: () => CartVariantProductDto })
  product: CartVariantProductDto;
}

export class CartItemResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  cartId: number;

  @ApiProperty({ example: 1 })
  variantId: number;

  @ApiProperty({ example: true })
  isSelected: boolean;

  @ApiProperty({ example: 2 })
  buyingQuantity: number;

  @ApiProperty({ example: 199.98 })
  itemTotal: number;

  @ApiProperty({ type: () => CartVariantDto })
  variant: CartVariantDto;
}

export class CartSummaryDto {
  @ApiProperty({ example: 2 })
  totalItems: number;

  @ApiProperty({ example: 2 })
  selectedItemsCount: number;

  @ApiProperty({ example: 199.98 })
  subtotal: number;
}

export class CartResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 10 })
  userId: number;

  @ApiProperty({ type: () => [CartItemResponseDto] })
  items: CartItemResponseDto[];

  @ApiProperty({ type: () => CartSummaryDto })
  summary: CartSummaryDto;
}
