import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

export const reviewSelect = {
  id: true,
  userId: true,
  productId: true,
  stars: true,
  review: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ReviewSelect;

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async createReview(
    userId: number,
    productId: number,
    dto: CreateReviewDto,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, productStatus: true },
    });

    if (!product || !product.productStatus) {
      throw new NotFoundException(
        `Active product with id ${productId} not found`,
      );
    }

    const existing = await this.prisma.review.findFirst({
      where: { userId, productId },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'You have already reviewed this product. You can update your existing review.',
      );
    }

    const review = await this.prisma.review.create({
      data: {
        userId,
        productId,
        stars: dto.stars,
        review: dto.review?.trim() || null,
      },
      select: reviewSelect,
    });

    return {
      ...review,
      stars: Number(review.stars),
    };
  }

  async getProductReviews(productId: number, query: ReviewQueryDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [aggregate, count, reviews] = await Promise.all([
      this.prisma.review.aggregate({
        where: { productId },
        _avg: { stars: true },
      }),
      this.prisma.review.count({ where: { productId } }),
      this.prisma.review.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: reviewSelect,
      }),
    ]);

    const averageStars = aggregate._avg.stars
      ? Number(Number(aggregate._avg.stars).toFixed(1))
      : 0;
    const totalPages = Math.ceil(count / limit);

    return {
      reviews: reviews.map((r) => ({
        ...r,
        stars: Number(r.stars),
      })),
      summary: {
        averageStars,
        totalReviews: count,
      },
      pagination: {
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async updateReview(
    userId: number,
    reviewId: number,
    dto: UpdateReviewDto,
  ) {
    const existing = await this.prisma.review.findFirst({
      where: { id: reviewId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only update your own review');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(dto.stars !== undefined && { stars: dto.stars }),
        ...(dto.review !== undefined && {
          review: dto.review.trim() || null,
        }),
      },
      select: reviewSelect,
    });

    return {
      ...updated,
      stars: Number(updated.stars),
    };
  }

  async deleteReview(
    userId: number,
    reviewId: number,
    userRole?: string,
  ) {
    const existing = await this.prisma.review.findFirst({
      where: { id: reviewId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    if (existing.userId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('You can only delete your own review');
    }

    await this.prisma.review.delete({
      where: { id: reviewId },
    });

    return { id: reviewId };
  }
}
