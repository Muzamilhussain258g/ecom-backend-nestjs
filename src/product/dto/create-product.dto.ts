import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  IsOptional,
} from 'class-validator';

export class ProductCategoryAssignmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId!: number;

  @IsBoolean()
  isPrimary!: boolean;
}

export class ProductVariantSelectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  variantTypeId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  variantValueIds!: number[];
}

export class ProductVariantQuantityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  variantValueIds!: number[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class CreateProductDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  basePrice!: number;

  @IsOptional()
  @IsBoolean()
  hasVariants = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock = 0;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductCategoryAssignmentDto)
  categories!: ProductCategoryAssignmentDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantSelectionDto)
  variantSelections?: ProductVariantSelectionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantQuantityDto)
  variantQuantities?: ProductVariantQuantityDto[];
}
