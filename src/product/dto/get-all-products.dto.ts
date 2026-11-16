import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export enum ProductSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export enum ProductSortBy {
  NAME = 'name',
  PRICE = 'price',
  CREATED_AT = 'createdAt',
}

@ValidatorConstraint({ name: 'maxPriceNotBelowMinPrice' })
class MaxPriceNotBelowMinPriceConstraint
  implements ValidatorConstraintInterface
{
  validate(maxPrice: number | undefined, args: ValidationArguments): boolean {
    const { minPrice } = args.object as { minPrice?: number };
    return (
      maxPrice === undefined || minPrice === undefined || maxPrice >= minPrice
    );
  }

  defaultMessage(): string {
    return 'maxPrice must be greater than or equal to minPrice';
  }
}

export class GetAllProductsDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Validate(MaxPriceNotBelowMinPriceConstraint)
  maxPrice?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @IsEnum(ProductSortBy)
  sortBy?: ProductSortBy;

  @IsOptional()
  @IsEnum(ProductSortOrder)
  sortOrder?: ProductSortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;
}
