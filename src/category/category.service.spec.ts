import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CategoryService } from './category.service';

describe('CategoryService', () => {
  const category = {
    id: 1,
    categoryName: 'Electronics',
    slug: 'electronics',
    parentId: null,
  };

  let service: CategoryService;
  let prisma: {
    $transaction: jest.Mock;
    category: {
      count: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      category: {
        count: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new CategoryService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('returns only the first level when depth is one', async () => {
      const root = { ...category, _count: { productCategories: 2 } };
      const secondRoot = {
        id: 2,
        categoryName: 'Fashion',
        slug: 'fashion',
        parentId: null,
        _count: { productCategories: 0 },
      };

      prisma.$transaction.mockResolvedValue([[root, secondRoot], 2]);

      const result = await service.findAll({ page: 1, limit: 10, depth: 1 });

      expect(result.categories[0]).toMatchObject({
        id: 1,
        _count: { productCategories: 2 },
      });
      expect(result.categories[1]).toMatchObject({ id: 2 });
      expect(result.categories[0].children).toBeUndefined();
      expect(result.meta).toMatchObject({ parentId: null, depth: 1 });
      expect(result.meta.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
      expect(prisma.category.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns children of parentId up to the requested depth', async () => {
      const child = {
        id: 2,
        categoryName: 'Phones',
        slug: 'phones',
        parentId: 1,
        _count: { productCategories: 3 },
      };
      const grandchild = {
        id: 3,
        categoryName: 'Smartphones',
        slug: 'smartphones',
        parentId: 2,
        _count: { productCategories: 1 },
      };
      const childWithChildren = {
        ...child,
        children: [grandchild],
      };

      prisma.$transaction.mockResolvedValue([[childWithChildren], 1]);

      const result = await service.findAll({
        parentId: 1,
        depth: 2,
        page: 1,
        limit: 10,
      });

      expect(result.categories[0]).toMatchObject({
        id: 2,
        children: [{ id: 3 }],
      });
      expect(result.meta).toMatchObject({ parentId: 1, depth: 2 });
      expect(prisma.category.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { parentId: 1 },
        orderBy: [{ categoryName: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 10,
        select: {
          id: true,
          categoryName: true,
          slug: true,
          parentId: true,
          _count: { select: { productCategories: true } },
          media: { include: { media: true } },
          children: {
            orderBy: [{ categoryName: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              categoryName: true,
              slug: true,
              parentId: true,
              _count: { select: { productCategories: true } },
              media: { include: { media: true } },
            },
          },
        },
      });
    });

    it('does not query deeper levels when the requested page is empty', async () => {
      prisma.$transaction.mockResolvedValue([[], 2]);

      const result = await service.findAll({
        depth: 3,
        page: 2,
        limit: 10,
      });

      expect(result.categories).toEqual([]);
      expect(prisma.category.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('create', () => {
    it('normalizes the slug and creates a child category', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 1 });
      prisma.category.findFirst.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue({
        ...category,
        id: 2,
        categoryName: 'Mobile Phones',
        slug: 'mobile-phones',
        parentId: 1,
        _count: { productCategories: 0 },
      });

      const result = await service.create({
        categoryName: 'Mobile Phones',
        parentId: 1,
      });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          categoryName: 'Mobile Phones',
          slug: 'mobile-phones',
          parentId: 1,
        },
        select: {
          id: true,
          categoryName: true,
          slug: true,
          parentId: true,
          _count: { select: { productCategories: true } },
          media: { include: { media: true } },
        },
      });
      expect(result.slug).toBe('mobile-phones');
      expect(result.productCount).toBe(0);
    });

    it('creates readable slugs for non-English category names', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue({
        ...category,
        categoryName: 'گھر اور باغ',
        slug: 'گھر-اور-باغ',
        _count: { productCategories: 0 },
      });

      const result = await service.create({ categoryName: 'گھر اور باغ' });

      expect(result.slug).toBe('گھر-اور-باغ');
    });

    it('rejects a duplicate sibling category', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 2 });

      await expect(
        service.create({ categoryName: 'Electronics' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('rejects an empty update without querying the database', async () => {
      await expect(service.update(1, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
    });

    it('rejects moving a category below its descendant', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(category)
        .mockResolvedValueOnce({ parentId: 2 })
        .mockResolvedValueOnce({ parentId: 1 });

      await expect(service.update(1, { parentId: 3 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown parent category', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(category)
        .mockResolvedValueOnce(null);

      await expect(service.update(1, { parentId: 99 })).rejects.toThrow(
        'Parent category with id 99 not found',
      );
    });

    it('throws when the category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.update(99, { categoryName: 'Missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('rejects deleting a category assigned to products', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 1,
        _count: { children: 0, productCategories: 1 },
      });

      await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });
  });
});
