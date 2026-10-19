import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class AddToCartDto {
  @ApiProperty({
    example: 1,
    description: 'ID of the product variant to add to cart',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  variantId: number;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Quantity of items to purchase',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buyingQuantity?: number = 1;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Whether this item is selected for checkout',
  })
  @IsOptional()
  @IsBoolean()
  isSelected?: boolean = true;
}
