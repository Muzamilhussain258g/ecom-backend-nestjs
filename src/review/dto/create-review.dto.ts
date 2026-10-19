import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({
    example: 5,
    minimum: 1,
    maximum: 5,
    description: 'Rating from 1 to 5 stars',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  @IsNotEmpty()
  stars: number;

  @ApiPropertyOptional({
    example: 'Great quality, highly recommend!',
    maxLength: 1000,
    description: 'Optional review text feedback',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  review?: string;
}
