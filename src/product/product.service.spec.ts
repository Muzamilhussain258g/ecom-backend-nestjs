import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { ProductService } from './product.service';
import { MediaService } from '@/media/media.service';

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
  variantCombinationValue: ModelMock<'createMany'>;
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
    media: [
      {
        providerPublicId: 'ecommerce/product/test-image',
        providerAssetId: 'asset-1',
        version: 1,
        signature: 'verified',
        format: 'webp',
        isPrimary: true,
        position: 0,
      },
    ],
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
        create: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ id: prisma.variant.create.mock.calls.length }),
          ),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      variantCombinationValue: { createMany: jest.fn() },
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
    const mediaService = {
      toMediaCreateInput: jest.fn(() => ({
        providerPublicId: 'ecommerce/product/test-image',
        url: 'https://res.cloudinary.com/demo/image/upload/test-image.webp',
        format: 'webp',
      })),
    } as unknown as MediaService;
    service = new ProductService(
      prisma as unknown as PrismaService,
      mediaService,
    );
  });

  it('creates a default sellable variant for a simple product', async () => {
    const created = { id: 100, basePrice: 1500 };
    const response = { ...created, variants: [{ sku: 'P-100-DEFAULT' }] };
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.product.create.mockResolvedValue(created);
    prisma.product.findUniqueOrThrow.mockResolvedValue(response);

    await expect(service.create(baseDto)).resolves.toBe(response);
    const expectedProductData: unknown = expect.objectContaining({
      slug: 'shirt',
    });
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expectedProductData,
      }),
    );
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
      variantQuantities: [
        { variantValueIds: [10, 20], quantity: 7 },
        { variantValueIds: [10, 21], quantity: 8 },
        { variantValueIds: [11, 20], quantity: 9 },
        { variantValueIds: [11, 21], quantity: 10 },
      ],
    });

    expect(prisma.variant.create).toHaveBeenCalledTimes(4);
    const smallRedVariant: unknown = expect.objectContaining({
      combinationKey: '10-20',
      sku: 'P-100-S-RED',
      stock: 7,
    });
    expect(prisma.variant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: smallRedVariant,
      }),
    );
    const mediumBlueVariant: unknown = expect.objectContaining({
      combinationKey: '11-21',
      sku: 'P-100-M-BLUE',
      stock: 10,
    });
    expect(prisma.variant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: mediumBlueVariant,
      }),
    );
  });

  it('creates the requested round-neck T-shirt variant combinations', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 2 }]);
    prisma.variantType.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.variantValue.findMany.mockResolvedValue([
      { id: 1, code: 'RED', variantTypeId: 1 },
      { id: 2, code: 'BLUE', variantTypeId: 1 },
      { id: 3, code: 'BLACK', variantTypeId: 1 },
      { id: 5, code: 'S', variantTypeId: 2 },
      { id: 6, code: 'M', variantTypeId: 2 },
    ]);
    prisma.product.create.mockResolvedValue({ id: 101, basePrice: 700 });
    prisma.product.findUniqueOrThrow.mockResolvedValue({ id: 101 });

    await service.create({
      name: 'Round Neck T-Shirt 2026',
      description:
        'Comfortable round neck t-shirt available in multiple colors and sizes.',
      basePrice: 700,
      hasVariants: true,
      categories: [{ categoryId: 2, isPrimary: true }],
      media: baseDto.media,
      variantSelections: [
        { variantTypeId: 1, variantValueIds: [1, 2, 3] },
        { variantTypeId: 2, variantValueIds: [5, 6] },
      ],
      variantQuantities: [
        { variantValueIds: [1, 5], quantity: 5 },
        { variantValueIds: [1, 6], quantity: 6 },
        { variantValueIds: [2, 5], quantity: 7 },
        { variantValueIds: [2, 6], quantity: 8 },
        { variantValueIds: [3, 5], quantity: 9 },
        { variantValueIds: [3, 6], quantity: 10 },
      ],
    });

    expect(prisma.variant.create).toHaveBeenCalledTimes(6);
    expect(
      prisma.variant.create.mock.calls.map(
        ([call]: [{ data: { combinationKey: string; stock: number } }]) => [
          call.data.combinationKey,
          call.data.stock,
        ],
      ),
    ).toEqual([
      ['1-5', 5],
      ['1-6', 6],
      ['2-5', 7],
      ['2-6', 8],
      ['3-5', 9],
      ['3-6', 10],
    ]);
  });

  it('requires a quantity for every generated variant combination', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.variantType.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.variantValue.findMany.mockResolvedValue([
      { id: 10, code: 'S', variantTypeId: 1 },
      { id: 11, code: 'M', variantTypeId: 1 },
    ]);

    await expect(
      service.create({
        ...baseDto,
        hasVariants: true,
        variantSelections: [{ variantTypeId: 1, variantValueIds: [10, 11] }],
        variantQuantities: [{ variantValueIds: [10], quantity: 4 }],
      }),
    ).rejects.toThrow('Quantities are required for variant combinations: 11');
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

  it('filters products by category together with search', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findAll({
      search: 'shirt',
      category: 'clothing',
      sortOrder: 'asc',
      page: 1,
      limit: 10,
    });

    const where = {
      OR: [
        { name: { contains: 'shirt', mode: 'insensitive' } },
        { description: { contains: 'shirt', mode: 'insensitive' } },
      ],
      productCategories: { some: { category: { slug: 'clothing' } } },
    };
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ name: 'asc' }, { id: 'desc' }],
      }),
    );
    expect(prisma.product.count).toHaveBeenCalledWith({ where });
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

    await expect(service.findOne('shirt')).resolves.toEqual({
      id: 1,
      hasVariants: false,
      productCategories: [],
      images: [],
      variantOptions: [],
      variants: [],
      reviews: { averageRating: 0, totalReviews: 0, items: [] },
    });
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'shirt', productStatus: true },
      }),
    );
    expect(prisma.review.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { product: { slug: 'shirt' } } }),
    );
  });

  it('regenerates the product slug when its name changes', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 1 });
    prisma.product.update.mockResolvedValue({
      id: 1,
      name: 'Premium Cotton Shirt',
      slug: 'premium-cotton-shirt',
    });

    await service.update(1, { name: 'Premium Cotton Shirt' });

    const expectedProductUpdate: unknown = expect.objectContaining({
      slug: 'premium-cotton-shirt',
    });
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expectedProductUpdate,
      }),
    );
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
        variantValues: [{ id: 70, variantValue: blue }],
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
            imageId: 'blue-shirt',
            isPrimary: true,
            variantValue: blue,
          },
        ],
        reviews: [],
      },
      { _avg: { stars: null }, _count: { _all: 0 } },
    ]);

    const result = await service.findOne('blue-shirt');

    expect(result.variantOptions).toEqual([
      {
        ...colorType,
        values: [{ ...blue, productVariantValueId: 70 }],
      },
    ]);
    expect(result.variants).toEqual([
      { id: 1000, sku: 'P-100-BLUE', values: [blue] },
    ]);
    expect(result.images).toEqual([
      {
        id: 50,
        productImageUrl: 'https://example.com/blue-shirt.jpg',
        imageId: 'blue-shirt',
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
    await expect(service.findOne('missing-product')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
