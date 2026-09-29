import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { UploadedMediaDto } from '@/media/dto/uploaded-media.dto';

export class CollectionProductDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  position!: number;
}

export class CollectionCoverImageDto extends UploadedMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  altText?: string;
}

export class CreateCollectionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive = true;

  @IsArray()
  @ArrayUnique((item: CollectionProductDto) => item.productId)
  @ValidateNested({ each: true })
  @Type(() => CollectionProductDto)
  products!: CollectionProductDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CollectionCoverImageDto)
  coverImage?: CollectionCoverImageDto;
}
