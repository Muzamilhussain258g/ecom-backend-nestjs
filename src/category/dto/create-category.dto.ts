import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { UploadedMediaDto } from '@/media/dto/uploaded-media.dto';

export class CreateCategoryImageDto extends UploadedMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  altText?: string;
}

export class CreateCategoryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  categoryName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCategoryImageDto)
  image?: CreateCategoryImageDto;
}
