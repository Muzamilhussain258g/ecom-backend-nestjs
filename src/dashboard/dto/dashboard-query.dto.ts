import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsDateString,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01', format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export enum DashboardGroupBy {
  day = 'day',
  week = 'week',
  month = 'month',
}

export class SalesQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: DashboardGroupBy, default: DashboardGroupBy.day })
  @IsOptional()
  @IsEnum(DashboardGroupBy)
  groupBy = DashboardGroupBy.day;
}

export class TopProductsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ example: 5, default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 5;
}

export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 10, default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

export class RecentOrdersQueryDto extends PaginationQueryDto {}

export class InventoryAlertsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 5,
    default: 5,
    minimum: 0,
    maximum: 100000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  threshold = 5;
}
