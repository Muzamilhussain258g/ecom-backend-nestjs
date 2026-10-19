import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'prisma/prisma.service';
import { ReviewService } from './review.service';

describe('ReviewService', () => {
  let service: ReviewService;
  let prisma: {
    product: {
      findUnique: jest.Mock;
    };
    review: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      aggregate: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const sampleReview = {
    id: 1,
    userId: 10,
    productId: 5,
    stars: 4.5,
    review: 'Awesome product!',
    createdAt: new Date('2026-10-16T12:00:00.000Z'),
    updatedAt: new Date('2026-10-16T12:00:00.000Z'),
    user: {
      id: 10,
      name: 'John Doe',
    },
  };

  beforeEach(async () => {
    const mockProduct = {
      findUnique: jest.fn(),
    };
    const mockReview = {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        {
          provide: PrismaService,
          useValue: {
            product: mockProduct,
            review: mockReview,
          },
        },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
    prisma = {
      product: mockProduct,
      review: mockReview,
    };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReview', () => {
    it('should throw NotFoundException if product is not found or inactive', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.createReview(10, 999, { stars: 5, review: 'Good' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user already reviewed this product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 5, productStatus: true });
      prisma.review.findFirst.mockResolvedValue({ id: 1 });

      await expect(
        service.createReview(10, 5, { stars: 5 }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create review successfully with optional review text', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 5, productStatus: true });
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(sampleReview);

      const result = await service.createReview(10, 5, {
        stars: 4.5,
        review: 'Awesome product!',
      });

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          userId: 10,
          productId: 5,
          stars: 4.5,
          review: 'Awesome product!',
        },
        select: expect.any(Object),
      });
      expect(result.stars).toBe(4.5);
      expect(result.review).toBe('Awesome product!');
    });
  });

  describe('getProductReviews', () => {
    it('should return aggregated rating, total, and review list', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 5 });
      prisma.review.aggregate.mockResolvedValue({ _avg: { stars: 4.5 } });
      prisma.review.count.mockResolvedValue(1);
      prisma.review.findMany.mockResolvedValue([sampleReview]);

      const result = await service.getProductReviews(5, { page: 1, limit: 10 });

      expect(result.summary.averageStars).toBe(4.5);
      expect(result.summary.totalReviews).toBe(1);
      expect(result.reviews.length).toBe(1);
    });

    it('should throw NotFoundException if product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.getProductReviews(999, { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateReview', () => {
    it('should throw NotFoundException if review does not exist', async () => {
      prisma.review.findFirst.mockResolvedValue(null);

      await expect(
        service.updateReview(10, 999, { stars: 4 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the author of the review', async () => {
      prisma.review.findFirst.mockResolvedValue({ id: 1, userId: 20 });

      await expect(
        service.updateReview(10, 1, { stars: 4 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update review successfully', async () => {
      prisma.review.findFirst.mockResolvedValue({ id: 1, userId: 10 });
      prisma.review.update.mockResolvedValue({
        ...sampleReview,
        stars: 5,
        review: 'Updated feedback',
      });

      const result = await service.updateReview(10, 1, {
        stars: 5,
        review: 'Updated feedback',
      });

      expect(result.stars).toBe(5);
      expect(result.review).toBe('Updated feedback');
    });
  });

  describe('deleteReview', () => {
    it('should delete review successfully by author', async () => {
      prisma.review.findFirst.mockResolvedValue({ id: 1, userId: 10 });
      prisma.review.delete.mockResolvedValue({ id: 1 });

      const result = await service.deleteReview(10, 1, 'customer');

      expect(prisma.review.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual({ id: 1 });
    });

    it('should allow admin to delete any review', async () => {
      prisma.review.findFirst.mockResolvedValue({ id: 1, userId: 20 });
      prisma.review.delete.mockResolvedValue({ id: 1 });

      const result = await service.deleteReview(999, 1, 'admin');

      expect(prisma.review.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual({ id: 1 });
    });

    it('should throw ForbiddenException when non-admin deletes someone else review', async () => {
      prisma.review.findFirst.mockResolvedValue({ id: 1, userId: 20 });

      await expect(
        service.deleteReview(10, 1, 'customer'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
