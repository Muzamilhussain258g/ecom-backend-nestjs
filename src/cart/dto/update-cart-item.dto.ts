import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateCartItemDto {
  @ApiPropertyOptional({
    example: 2,
    description: 'Updated quantity of items to purchase',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buyingQuantity?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether this item is selected for checkout',
  })
  @IsOptional()
  @IsBoolean()
  isSelected?: boolean;
}
