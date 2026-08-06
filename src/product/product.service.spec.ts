import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { ProductService } from './product.service';

type ModelMock<T extends string> = Record<T, jest.Mock>;
type PrismaMock = {
  category: ModelMock<'findMany'>;
  review: ModelMock<'aggregate'>;
  variantType: ModelMock<'findMany'>;
  variantValue: ModelMock<'findMany'>;
  product: ModelMock<
    | 'create'
    | 'findMany'
    | 'count'
    | 'findFirst'
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'update'
  >;
  variant: ModelMock<'create' | 'findMany' | 'findFirst' | 'update'>;
  productVariantType: ModelMock<'deleteMany' | 'createMany'>;
  productVariantValue: ModelMock<'deleteMany' | 'createMany'>;
  $transaction: jest.Mock;
};

describe('ProductService', () => {
  const baseDto = {
    name: 'Shirt',
    description: 'Cotton shirt',
    basePrice: 1500,
    hasVariants: false,
    stock: 12,
    categories: [{ categoryId: 3, isPrimary: true }],
  };

  let service: ProductService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      category: { findMany: jest.fn() },
      review: { aggregate: jest.fn() },
      variantType: { findMany: jest.fn() },
      variantValue: { findMany: jest.fn() },
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      variant: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      productVariantType: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      productVariantValue: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((input: unknown) => {
      if (typeof input === 'function') {
        return (input as (client: PrismaMock) => unknown)(prisma);
      }
      return Promise.resolve(input);
    });
    service = new ProductService(prisma as unknown as PrismaService);
  });

  it('creates a default sellable variant for a simple product', async () => {
    const created = { id: 100, basePrice: 1500 };
    const response = { ...created, variants: [{ sku: 'P-100-DEFAULT' }] };
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.product.create.mockResolvedValue(created);
    prisma.product.findUniqueOrThrow.mockResolvedValue(response);

    await expect(service.create(baseDto)).resolves.toBe(response);
    expect(prisma.variant.create).toHaveBeenCalledWith({
      data: {
        productId: 100,
        combinationKey: 'default',
        sku: 'P-100-DEFAULT',
        price: 1500,
        stock: 12,
      },
    });
  });

  it('generates the Cartesian product for flexible variant selections', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.variantType.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.variantValue.findMany.mockResolvedValue([
      { id: 10, code: 'S', variantTypeId: 1 },
      { id: 11, code: 'M', variantTypeId: 1 },
      { id: 20, code: 'RED', variantTypeId: 2 },
      { id: 21, code: 'BLUE', variantTypeId: 2 },
    ]);
    prisma.product.create.mockResolvedValue({ id: 100, basePrice: 1500 });
    prisma.product.findUniqueOrThrow.mockResolvedValue({ id: 100 });

    await service.create({
      ...baseDto,
      hasVariants: true,
      variantSelections: [
        { variantTypeId: 1, variantValueIds: [10, 11] },
        { variantTypeId: 2, variantValueIds: [20, 21] },
      ],
    });

    expect(prisma.variant.create).toHaveBeenCalledTimes(4);
    const smallRedVariant: unknown = expect.objectContaining({
      combinationKey: '10-20',
      sku: 'P-100-S-RED',
      stock: 0,
    });
    expect(prisma.variant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: smallRedVariant,
      }),
    );
    const mediumBlueVariant: unknown = expect.objectContaining({
      combinationKey: '11-21',
      sku: 'P-100-M-BLUE',
    });
    expect(prisma.variant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: mediumBlueVariant,
      }),
    );
  });

  it('rejects selections whose values belong to another type', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.variantType.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.variantValue.findMany.mockResolvedValue([
      { id: 20, code: 'RED', variantTypeId: 2 },
    ]);

    await expect(
      service.create({
        ...baseDto,
        hasVariants: true,
        variantSelections: [{ variantTypeId: 1, variantValueIds: [20] }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects variant selections for a simple product', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create({
        ...baseDto,
        variantSelections: [{ variantTypeId: 1, variantValueIds: [10] }],
      }),
    ).rejects.toThrow(
      'variantSelections are only allowed when hasVariants is true',
    );
  });

  it('returns paginated searched products with filtered metadata', async () => {
    const products = [{ id: 2, name: 'Infinix Note 40 Pro' }];
    prisma.$transaction.mockResolvedValue([products, 11]);

    const result = await service.findAll({
      search: 'infinix',
      page: 2,
      limit: 10,
    });

    const where = {
      OR: [
        { name: { contains: 'infinix', mode: 'insensitive' } },
        { description: { contains: 'infinix', mode: 'insensitive' } },
      ],
    };
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 10, take: 10 }),
    );
    expect(prisma.product.count).toHaveBeenCalledWith({ where });
    expect(result.meta.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 11,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it('returns a product safely when optional variant relations are empty', async () => {
    const product = {
      id: 1,
      hasVariants: false,
      productCategories: [],
      variantTypes: [],
      variantValues: [],
      variants: [],
      images: [],
      reviews: [],
    };
    prisma.$transaction.mockResolvedValue([
      product,
      { _avg: { stars: null }, _count: { _all: 0 } },
    ]);

    await expect(service.findOne(1)).resolves.toEqual({
      id: 1,
      hasVariants: false,
      productCategories: [],
      images: [],
      variantOptions: [],
      variants: [],
      reviews: { averageRating: 0, totalReviews: 0, items: [] },
    });
  });

  it('returns value-specific images and grouped generic variant options', async () => {
    const colorType = { id: 2, name: 'Color', slug: 'color', sortOrder: 0 };
    const blue = {
      id: 21,
      value: 'Blue',
      code: 'BLUE',
      metadata: { hex: '#0000FF' },
      sortOrder: 0,
      variantType: colorType,
    };
    prisma.$transaction.mockResolvedValue([
      {
        id: 100,
        productCategories: [],
        variantTypes: [{ variantType: colorType }],
        variantValues: [{ variantValue: blue }],
        variants: [
          {
            id: 1000,
            sku: 'P-100-BLUE',
            combinationValues: [{ variantValue: blue }],
          },
        ],
        images: [
          {
            id: 50,
            productImageUrl: 'https://example.com/blue-shirt.jpg',
            isPrimary: true,
            variantValue: blue,
          },
        ],
        reviews: [],
      },
      { _avg: { stars: null }, _count: { _all: 0 } },
    ]);

    const result = await service.findOne(100);

    expect(result.variantOptions).toEqual([{ ...colorType, values: [blue] }]);
    expect(result.variants).toEqual([
      { id: 1000, sku: 'P-100-BLUE', values: [blue] },
    ]);
    expect(result.images).toEqual([
      {
        id: 50,
        productImageUrl: 'https://example.com/blue-shirt.jpg',
        isPrimary: true,
        variantValue: blue,
      },
    ]);
  });

  it('deactivates removed combinations and creates missing combinations', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 100, basePrice: 1500 });
    prisma.variantType.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.variantValue.findMany.mockResolvedValue([
      { id: 10, code: 'S', variantTypeId: 1 },
    ]);
    prisma.variant.findMany.mockResolvedValue([
      { id: 1, combinationKey: 'default' },
    ]);
    prisma.product.findUniqueOrThrow.mockResolvedValue({ id: 100 });

    await service.updateVariantOptions(100, {
      variantSelections: [{ variantTypeId: 1, variantValueIds: [10] }],
    });

    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isActive: false },
    });
    const createdVariant: unknown = expect.objectContaining({
      combinationKey: '10',
      sku: 'P-100-S',
    });
    expect(prisma.variant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: createdVariant,
      }),
    );
  });

  it('updates only a variant owned by the selected product', async () => {
    prisma.variant.findFirst.mockResolvedValue({ id: 8 });
    prisma.variant.update.mockResolvedValue({ id: 8, stock: 20 });

    await expect(service.updateVariant(100, 8, { stock: 20 })).resolves.toEqual(
      {
        id: 8,
        stock: 20,
      },
    );
    expect(prisma.variant.findFirst).toHaveBeenCalledWith({
      where: { id: 8, productId: 100 },
      select: { id: true },
    });
  });

  it('returns not found for a missing product detail', async () => {
    prisma.$transaction.mockResolvedValue([
      null,
      { _avg: { stars: null }, _count: { _all: 0 } },
    ]);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
