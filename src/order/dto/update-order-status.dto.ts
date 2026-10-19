import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrderStatus } from 'generated/prisma/enums';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'Target order status',
    enum: OrderStatus,
    example: OrderStatus.confirmed,
  })
  @IsNotEmpty()
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
