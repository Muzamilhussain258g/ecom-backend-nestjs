import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  OmitType,
} from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;

export class CreateFaqDto {
  @ApiProperty({ example: 'Is a charger included?', maxLength: 300 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  question!: string;

  @ApiProperty({
    example: 'Yes, a charger is included in the box.',
    maxLength: 5000,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  answer!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 1,
    description: 'Omit or use null for a website FAQ.',
  })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsInt()
  @Min(1)
  productId?: number | null;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFaqDto extends PartialType(
  OmitType(CreateFaqDto, ['productId'] as const),
  { skipNullProperties: false },
) {}

export class AdminFaqQueryDto {
  @ApiPropertyOptional({ enum: ['website', 'product'] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['website', 'product'])
  scope?: 'website' | 'product';

  @ApiPropertyOptional({ minimum: 1 })
  @Transform(integer)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  productId?: number;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
