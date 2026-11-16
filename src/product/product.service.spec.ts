import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from 'generated/prisma/enums';
import { PrismaService } from 'prisma/prisma.service';
import { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { ProductService } from './product.service';
import { MediaService, VerifiedMediaResource } from '@/media/media.service';

type ModelMock<T extends string> = Record<T, jest.Mock>;
type PrismaMock = {
  category: ModelMock<'findMany'>;
  review: ModelMock<'aggregate'>;
  wishList: ModelMock<'findMany' | 'findFirst'>;
  variantType: ModelMock<'findMany'>;
  variantValue: ModelMock<'findMany'>;
  media: ModelMock<'findMany' | 'upsert'>;
  productMedia: ModelMock<'create'>;
  product: ModelMock<
    | 'create'
    | 'findMany'
    | 'count'
    | 'findFirst'
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'update'
  >;
  variant: ModelMock<
    'create' | 'createManyAndReturn' | 'findMany' | 'findFirst' | 'update'
  >;
  variantCombinationValue: ModelMock<'createMany'>;
  productVariantType: ModelMock<'deleteMany' | 'create' | 'createMany'>;
  productVariantValue: ModelMock<'deleteMany' | 'createMany'>;
  $transaction: jest.Mock;
};

describe('ProductService', () => {
  const sellerUser: AuthenticatedUser = {
    id: 10,
    email: 'seller@example.com',
    name: 'Test Seller',
    role: UserRole.seller,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseDto = {
    name: 'Shirt',
    description: 'Cotton shirt',
    basePrice: 1500,
    hasVariants: false,
    categories: [{ categoryId: 3, isPrimary: true }],
    media: [
      {
        providerPublicId: 'products/seller_10/test-image',
        isPrimary: true,
        position: 0,
      },
    ],
  };

  let service: ProductService;
  let prisma: PrismaMock;
  let mediaService: {
    verifyMediaBatch: jest.Mock;
    deleteResources: jest.Mock;
    toMediaCreateInput: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      category: { findMany: jest.fn() },
      review: { aggregate: jest.fn() },
      wishList: { findMany: jest.fn(), findFirst: jest.fn() },
      variantType: { findMany: jest.fn() },
      variantValue: { findMany: jest.fn() },
      media: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }) =>
          Promise.resolve({ id: 1, ...create }),
        ),
      },
      productMedia: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 1, ...data }),
        ),
      },
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
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
        createManyAndReturn: jest.fn(({ data }) =>
          Promise.resolve(
            data.map(
              (
                variant: { combinationKey: string },
                index: number,
              ) => ({ id: index + 1, combinationKey: variant.combinationKey }),
            ),
          ),
        ),
      },
      variantCombinationValue: { createMany: jest.fn() },
      productVariantType: {
        deleteMany: jest.fn(),
        create: jest.fn(),
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

    mediaService = {
      verifyMediaBatch: jest.fn().mockImplementation((publicIds: string[]) => {
        const map = new Map<string, VerifiedMediaResource>();
        for (const id of publicIds) {
          map.set(id, {
            providerAssetId: `asset-${id}`,
            providerPublicId: id,
            url: `https://res.cloudinary.com/demo/image/upload/${id}.webp`,
            format: 'webp',
            bytes: 1024,
            width: 400,
            height: 400,
          });
        }
        return Promise.resolve(map);
      }),
      deleteResources: jest.fn().mockResolvedValue(undefined),
      toMediaCreateInput: jest.fn(() => ({
        providerPublicId: 'products/seller_10/test-image',
        url: 'https://res.cloudinary.com/demo/image/upload/test-image.webp',
        format: 'webp',
      })),
    };

    service = new ProductService(
      prisma as unknown as PrismaService,
      mediaService as unknown as MediaService,
    );
  });

  it('creates a default sellable variant for a simple product', async () => {
    const created = {
      id: 100,
      name: 'Shirt',
      slug: 'shirt',
      basePrice: 1500,
      hasVariants: false,
      createdAt: new Date('2026-10-23T00:00:00.000Z'),
    };
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.product.create.mockResolvedValue(created);

    await expect(
      service.create({ ...baseDto, stock: 12 }, sellerUser),
    ).resolves.toEqual({
      id: 100,
      name: 'Shirt',
      slug: 'shirt',
      basePrice: 1500,
      hasVariants: false,
      variantsCreated: 1,
      createdAt: created.createdAt,
    });

    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { slug: 'shirt' },
      select: { id: true },
    });
    expect(mediaService.verifyMediaBatch).toHaveBeenCalledWith(
      ['products/seller_10/test-image'],
      sellerUser,
    );
    expect(prisma.media.upsert).toHaveBeenCalledWith({
      where: { providerPublicId: 'products/seller_10/test-image' },
      update: expect.objectContaining({
        format: 'webp',
      }),
      create: expect.objectContaining({
        providerPublicId: 'products/seller_10/test-image',
      }),
    });
    expect(prisma.productMedia.create).toHaveBeenCalledWith({
      data: {
        productId: 100,
        mediaId: 1,
        isPrimary: true,
        position: 0,
        altText: undefined,
        variantValueId: undefined,
      },
    });
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

  it('reuses existing media when same public id already exists in database', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.product.create.mockResolvedValue({
      id: 100,
      name: 'Shirt',
      slug: 'shirt',
      basePrice: 1500,
      hasVariants: false,
      createdAt: new Date(),
    });
    // Simulate that the media is already in the Media table
    prisma.media.findMany.mockResolvedValue([
      { providerPublicId: 'products/seller_10/test-image' },
    ]);
    prisma.media.upsert.mockResolvedValue({
      id: 99,
      providerPublicId: 'products/seller_10/test-image',
    });

    await service.create(baseDto, sellerUser);

    expect(prisma.media.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.productMedia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mediaId: 99,
          productId: 100,
        }),
      }),
    );
  });

  it('rejects duplicate public ids in the same request', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create(
        {
          ...baseDto,
          media: [
            {
              providerPublicId: 'products/seller_10/img1',
              isPrimary: true,
              position: 0,
            },
            {
              providerPublicId: 'products/seller_10/img1',
              isPrimary: false,
              position: 1,
            },
          ],
        },
        sellerUser,
      ),
    ).rejects.toThrow('Product media must be unique');
  });

  it('rejects payload with two primary images', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create(
        {
          ...baseDto,
          media: [
            {
              providerPublicId: 'products/seller_10/img1',
              isPrimary: true,
              position: 0,
            },
            {
              providerPublicId: 'products/seller_10/img2',
              isPrimary: true,
              position: 1,
            },
          ],
        },
        sellerUser,
      ),
    ).rejects.toThrow('Exactly one product image must be marked as primary');
  });

  it('rejects payload with zero primary images when media is provided', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create(
        {
          ...baseDto,
          media: [
            {
              providerPublicId: 'products/seller_10/img1',
              isPrimary: false,
              position: 0,
            },
          ],
        },
        sellerUser,
      ),
    ).rejects.toThrow('Exactly one product image must be marked as primary');
  });

  it('rejects more than 10 media items', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    const elevenImages = Array.from({ length: 11 }, (_, i) => ({
      providerPublicId: `products/seller_10/img${i}`,
      isPrimary: i === 0,
      position: i,
    }));

    await expect(
      service.create({ ...baseDto, media: elevenImages }, sellerUser),
    ).rejects.toThrow('At most 10 media items are allowed');
  });

  it('rejects media linking to variant value when hasVariants is false', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create(
        {
          ...baseDto,
          media: [
            {
              providerPublicId: 'products/seller_10/test-image',
              isPrimary: true,
              position: 0,
              variantValueId: 5,
            },
          ],
        },
        sellerUser,
      ),
    ).rejects.toThrow(
      'Media cannot be linked to a variant value when hasVariants is false',
    );
  });

  it('rejects product creation if slug already exists', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.product.findUnique.mockResolvedValue({ id: 5 });

    await expect(service.create(baseDto, sellerUser)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('propagates ForbiddenException if seller attempts to use another seller media', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    mediaService.verifyMediaBatch.mockRejectedValue(
      new ForbiddenException("You do not own media asset 'products/seller_999/img'"),
    );

    await expect(
      service.create(
        {
          ...baseDto,
          media: [
            {
              providerPublicId: 'products/seller_999/img',
              isPrimary: true,
              position: 0,
            },
          ],
        },
        sellerUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cleans up orphan newly uploaded media if transaction fails', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.media.findMany.mockResolvedValue([]); // newly uploaded
    prisma.product.create.mockRejectedValue(new Error('DB transaction crash'));

    await expect(service.create(baseDto, sellerUser)).rejects.toThrow(
      'DB transaction crash',
    );

    expect(mediaService.deleteResources).toHaveBeenCalledWith([
      'products/seller_10/test-image',
    ]);
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

    await service.create(
      {
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
      },
      sellerUser,
    );

    expect(prisma.variant.create).not.toHaveBeenCalled();
    expect(prisma.variant.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          productId: 100,
          combinationKey: '10-20',
          sku: 'P-100-S-RED',
          price: 1500,
          stock: 7,
        },
        {
          productId: 100,
          combinationKey: '10-21',
          sku: 'P-100-S-BLUE',
          price: 1500,
          stock: 8,
        },
        {
          productId: 100,
          combinationKey: '11-20',
          sku: 'P-100-M-RED',
          price: 1500,
          stock: 9,
        },
        {
          productId: 100,
          combinationKey: '11-21',
          sku: 'P-100-M-BLUE',
          price: 1500,
          stock: 10,
        },
      ],
      select: { id: true, combinationKey: true },
    });
    expect(prisma.variantCombinationValue.createMany).toHaveBeenCalledWith({
      data: [
        { variantId: 1, variantValueId: 10 },
        { variantId: 1, variantValueId: 20 },
        { variantId: 2, variantValueId: 10 },
        { variantId: 2, variantValueId: 21 },
        { variantId: 3, variantValueId: 11 },
        { variantId: 3, variantValueId: 20 },
        { variantId: 4, variantValueId: 11 },
        { variantId: 4, variantValueId: 21 },
      ],
    });
  });

  it('rejects positive stock when hasVariants is true', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create(
        {
          ...baseDto,
          hasVariants: true,
          stock: 10,
          variantSelections: [{ variantTypeId: 1, variantValueIds: [10] }],
          variantQuantities: [{ variantValueIds: [10], quantity: 5 }],
        },
        sellerUser,
      ),
    ).rejects.toThrow('stock can only be specified when hasVariants is false');
  });

  it('requires a quantity for every generated variant combination', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.variantType.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.variantValue.findMany.mockResolvedValue([
      { id: 10, code: 'S', variantTypeId: 1 },
      { id: 11, code: 'M', variantTypeId: 1 },
    ]);

    await expect(
      service.create(
        {
          ...baseDto,
          hasVariants: true,
          variantSelections: [{ variantTypeId: 1, variantValueIds: [10, 11] }],
          variantQuantities: [{ variantValueIds: [10], quantity: 4 }],
        },
        sellerUser,
      ),
    ).rejects.toThrow('Quantities are required for variant combinations: 11');
  });

  it('rejects selections whose values belong to another type', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.variantType.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.variantValue.findMany.mockResolvedValue([
      { id: 20, code: 'RED', variantTypeId: 2 },
    ]);

    await expect(
      service.create(
        {
          ...baseDto,
          hasVariants: true,
          variantSelections: [{ variantTypeId: 1, variantValueIds: [20] }],
        },
        sellerUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects variant selections for a simple product', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create(
        {
          ...baseDto,
          variantSelections: [{ variantTypeId: 1, variantValueIds: [10] }],
        },
        sellerUser,
      ),
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
      productStatus: true,
      OR: [
        { name: { contains: 'infinix', mode: 'insensitive' } },
        { description: { contains: 'infinix', mode: 'insensitive' } },
      ],
    };
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toEqual({
      products,
      meta: {
        pagination: {
          page: 2,
          limit: 10,
          total: 11,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      },
    });
    expect(prisma.wishList.findMany).not.toHaveBeenCalled();
  });

  it('adds wishlist state to products for an authenticated user', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        { id: 2, name: 'Infinix Note 40 Pro' },
        { id: 3, name: 'Phone case' },
      ],
      2,
    ]);
    prisma.wishList.findMany.mockResolvedValue([{ productId: 3 }]);

    const result = await service.findAll({ page: 1, limit: 10 }, 42);

    expect(result.products).toEqual([
      { id: 2, name: 'Infinix Note 40 Pro', isWishlisted: false },
      { id: 3, name: 'Phone case', isWishlisted: true },
    ]);
    expect(prisma.wishList.findMany).toHaveBeenCalledWith({
      where: { userId: 42, productId: { in: [2, 3] } },
      select: { productId: true },
    });
  });

  it('filters by base price and stock and sorts by price', async () => {
    const products = [{ id: 2, name: 'Infinix Note 40 Pro' }];
    prisma.$transaction.mockResolvedValue([products, 1]);

    await service.findAll({
      minPrice: 100,
      maxPrice: 500,
      inStock: true,
      sortBy: 'price',
      sortOrder: 'asc',
      page: 1,
      limit: 10,
    });

    const where = {
      productStatus: true,
      basePrice: { gte: 100, lte: 500 },
      variants: { some: { isActive: true, stock: { gt: 0 } } },
    };
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ basePrice: 'asc' }, { id: 'desc' }],
      }),
    );
    expect(prisma.product.count).toHaveBeenCalledWith({ where });
  });

  it('filters out in-stock products when inStock is false', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findAll({
      inStock: false,
      page: 1,
      limit: 10,
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productStatus: true,
          NOT: {
            variants: { some: { isActive: true, stock: { gt: 0 } } },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('returns a product safely when optional variant relations are empty', async () => {
    const product = {
      id: 1,
      hasVariants: false,
      productCategories: [],
      variantTypes: [],
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

  it('adds wishlist state to product details for an authenticated user', async () => {
    const product = {
      id: 7,
      hasVariants: false,
      productCategories: [],
      variantTypes: [],
      variants: [],
      images: [],
      reviews: [],
    };
    prisma.$transaction.mockResolvedValue([
      product,
      { _avg: { stars: null }, _count: { _all: 0 } },
    ]);
    prisma.wishList.findFirst.mockResolvedValue({ id: 1 });

    const result = await service.findOne('shirt', 42);

    expect(result.isWishlisted).toBe(true);
    expect(prisma.wishList.findFirst).toHaveBeenCalledWith({
      where: { userId: 42, productId: 7 },
      select: { id: true },
    });
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
        variantTypes: [
          {
            variantType: colorType,
            productVariantValues: [{ id: 70, variantValue: blue }],
          },
        ],
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
