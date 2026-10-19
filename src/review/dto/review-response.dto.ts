import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewUserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'John Doe' })
  name: string;
}

export class ReviewResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 10 })
  userId: number;

  @ApiProperty({ example: 2 })
  productId: number;

  @ApiProperty({ example: 4.5 })
  stars: number;

  @ApiPropertyOptional({ example: 'Great quality, highly recommend!', nullable: true })
  review: string | null;

  @ApiProperty({ example: '2026-10-16T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-16T12:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ type: () => ReviewUserDto })
  user: ReviewUserDto;
}

export class ProductReviewsSummaryDto {
  @ApiProperty({ example: 4.8 })
  averageStars: number;

  @ApiProperty({ example: 24 })
  totalReviews: number;
}

export class ProductReviewsPaginationDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage: boolean;
}

export class ProductReviewsResponseDto {
  @ApiProperty({ type: () => [ReviewResponseDto] })
  reviews: ReviewResponseDto[];

  @ApiProperty({ type: () => ProductReviewsSummaryDto })
  summary: ProductReviewsSummaryDto;

  @ApiProperty({ type: () => ProductReviewsPaginationDto })
  pagination: ProductReviewsPaginationDto;
}
