import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentGateway } from 'generated/prisma/enums';

export class OrderItemInputDto {
  @ApiProperty({ description: 'Variant ID to purchase', example: 1 })
  @IsInt()
  @Min(1)
  variantId: number;

  @ApiProperty({ description: 'Quantity to purchase', example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiPropertyOptional({
    description:
      'ID of the saved shipping address. If omitted, the user default address is used.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  shippingAddressId?: number;

  @ApiPropertyOptional({
    description:
      'Optional specific items for direct checkout. If omitted, all selected items from user cart are checked out.',
    type: [OrderItemInputDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];

  @ApiPropertyOptional({
    description: 'Payment gateway to use. Currently only COD is supported.',
    enum: PaymentGateway,
    default: PaymentGateway.cod,
    example: PaymentGateway.cod,
  })
  @IsOptional()
  @IsEnum(PaymentGateway)
  paymentGateway?: PaymentGateway = PaymentGateway.cod;
}
