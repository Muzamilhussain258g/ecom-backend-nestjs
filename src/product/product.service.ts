import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import {
  CreateProductDto,
  ProductVariantQuantityDto,
  ProductVariantSelectionDto,
} from './dto/create-product.dto';
import {
  GetAllProductsDto,
  ProductSortBy,
  ProductSortOrder,
} from './dto/get-all-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { UpdateVariantOptionsDto } from './dto/update-variant-options.dto';
import { MediaService } from '@/media/media.service';

const categoryAssignments = {
  orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
  select: {
    isPrimary: true,
    category: {
      select: {
        id: true,
        categoryName: true,
        slug: true,
        parentId: true,
      },
    },
  },
} satisfies Prisma.ProductCategoryFindManyArgs;

const variantValueSelect = {
  id: true,
  value: true,
  code: true,
  metadata: true,
  sortOrder: true,
  variantType: {
    select: { id: true, name: true, slug: true, sortOrder: true },
  },
} satisfies Prisma.VariantValueSelect;

const productInclude = {
  productCategories: categoryAssignments,
  images: {
    where: { isPrimary: true },
    orderBy: { id: 'asc' },
    take: 1,
    select: {
      id: true,
      isPrimary: true,
      position: true,
      altText: true,
      media: true,
      variantValue: { select: variantValueSelect },
    },
  },
} satisfies Prisma.ProductInclude;

const productWriteInclude = {
  productCategories: categoryAssignments,
  variantTypes: {
    orderBy: { variantType: { sortOrder: 'asc' } },
    include: {
      variantType: true,
      productVariantValues: {
        include: { variantValue: { select: variantValueSelect } },
      },
    },
  },
  variants: {
    orderBy: { id: 'asc' },
    include: {
      combinationValues: {
        include: { variantValue: { select: variantValueSelect } },
      },
    },
  },
} satisfies Prisma.ProductInclude;

const productDetailSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  basePrice: true,
  productStatus: true,
  hasVariants: true,
  createdAt: true,
  updatedAt: true,
  productCategories: categoryAssignments,
  variantTypes: {
    orderBy: { variantType: { sortOrder: 'asc' } },
    select: {
      variantType: true,
      productVariantValues: {
        select: { id: true, variantValue: { select: variantValueSelect } },
      },
    },
  },
  variants: {
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      sku: true,
      price: true,
      stock: true,
      isActive: true,
      combinationKey: true,
      combinationValues: {
        select: { variantValue: { select: variantValueSelect } },
      },
    },
  },
  images: {
    orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      isPrimary: true,
      position: true,
      altText: true,
      media: true,
      variantValue: { select: variantValueSelect },
    },
  },
  reviews: {
    orderBy: { id: 'desc' },
    take: 5,
    select: {
      id: true,
      review: true,
      stars: true,
      user: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.ProductSelect;

type ValidatedSelection = {
  variantTypeId: number;
  values: Array<{ id: number; code: string }>;
};

type Combination = { valueIds: number[]; codes: string[]; key: string };

export interface ProductListResult {
  products: Array<
    Prisma.ProductGetPayload<{ include: typeof productInclude }> & {
      isWishlisted?: boolean;
    }
  >;
  meta: {
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
}

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async create(dto: CreateProductDto, user?: AuthenticatedUser) {
    const categoryIds = dto.categories.map(({ categoryId }) => categoryId);
    this.validateCategoryAssignments(dto.categories);
    await this.ensureCategoriesExist(categoryIds);

    const slug = this.createSlug(dto.name);
    const existingProduct = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existingProduct) {
      throw new ConflictException(`Product with slug '${slug}' already exists`);
    }

    if (dto.hasVariants && dto.stock !== undefined && dto.stock > 0) {
      throw new BadRequestException(
        'stock can only be specified when hasVariants is false; use variantQuantities for variants',
      );
    }

    const selections = await this.prepareSelections(
      dto.hasVariants,
      dto.variantSelections,
    );
    this.validateProductMedia(dto, selections);

    const publicIds = (dto.media ?? []).map(
      ({ providerPublicId }) => providerPublicId,
    );
    const verifiedMediaMap = await this.mediaService.verifyMediaBatch(
      publicIds,
      user,
    );

    let newlyUploadedPublicIds: string[] = [];
    if (publicIds.length > 0) {
      const existingMedia = await this.prisma.media.findMany({
        where: { providerPublicId: { in: publicIds } },
        select: { providerPublicId: true },
      });
      const existingPublicIds = new Set(
        existingMedia.map((m) => m.providerPublicId),
      );
      newlyUploadedPublicIds = publicIds.filter(
        (id) => !existingPublicIds.has(id),
      );
    }

    const combinations = this.buildCombinations(selections);
    const quantities = this.prepareVariantQuantities(
      dto.hasVariants,
      combinations,
      dto.variantQuantities,
    );

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const product = await transaction.product.create({
          data: {
            name: dto.name,
            slug,
            description: dto.description,
            basePrice: dto.basePrice,
            hasVariants: dto.hasVariants,
            productCategories: {
              create: dto.categories.map(({ categoryId, isPrimary }) => ({
                isPrimary,
                category: { connect: { id: categoryId } },
              })),
            },
            variantTypes: selections.length
              ? {
                  create: selections.map(({ variantTypeId, values }) => ({
                    variantType: { connect: { id: variantTypeId } },
                    productVariantValues: {
                      create: values.map(({ id }) => ({
                        variantValue: { connect: { id } },
                      })),
                    },
                  })),
                }
              : undefined,
          },
        });

        for (const item of dto.media ?? []) {
          const verified = verifiedMediaMap.get(item.providerPublicId)!;
          const mediaRecord = await transaction.media.upsert({
            where: { providerPublicId: verified.providerPublicId },
            update: {
              url: verified.url,
              format: verified.format,
              bytes: verified.bytes,
              width: verified.width,
              height: verified.height,
              providerAssetId: verified.providerAssetId,
            },
            create: {
              providerPublicId: verified.providerPublicId,
              url: verified.url,
              format: verified.format,
              bytes: verified.bytes,
              width: verified.width,
              height: verified.height,
              providerAssetId: verified.providerAssetId,
            },
          });

          await transaction.productMedia.create({
            data: {
              productId: product.id,
              mediaId: mediaRecord.id,
              isPrimary: item.isPrimary,
              position: item.position,
              altText: item.altText,
              variantValueId: item.variantValueId,
            },
          });
        }

        if (dto.hasVariants) {
          await this.createVariantsInBulk(
            transaction,
            product.id,
            product.basePrice,
            combinations,
            quantities,
          );
        } else {
          await transaction.variant.create({
            data: {
              productId: product.id,
              combinationKey: 'default',
              sku: `P-${product.id}-DEFAULT`,
              price: product.basePrice,
              stock: dto.stock ?? 0,
            },
          });
        }

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          basePrice: product.basePrice,
          hasVariants: product.hasVariants,
          variantsCreated: dto.hasVariants ? combinations.length : 1,
          createdAt: product.createdAt,
        };
      });
    } catch (error) {
      if (newlyUploadedPublicIds.length > 0) {
        await this.mediaService
          .deleteResources(newlyUploadedPublicIds)
          .catch(() => {});
      }
      this.handleCreateError(error, slug);
    }
  }

  async findAll(
    {
      search,
      category,
      minPrice,
      maxPrice,
      inStock,
      sortBy,
      sortOrder,
      page,
      limit,
    }: GetAllProductsDto,
    userId?: number,
  ): Promise<ProductListResult> {
    const skip = (page - 1) * limit;
    const where: Prisma.ProductWhereInput = {
      productStatus: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(category && {
        productCategories: { some: { category: { slug: category } } },
      }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        basePrice: {
          ...(minPrice !== undefined && { gte: minPrice }),
          ...(maxPrice !== undefined && { lte: maxPrice }),
        },
      }),
      ...(inStock !== undefined &&
        (inStock
          ? {
              variants: { some: { isActive: true, stock: { gt: 0 } } },
            }
          : {
              NOT: {
                variants: { some: { isActive: true, stock: { gt: 0 } } },
              },
            })),
    };

    const effectiveSortBy =
      sortBy ?? (sortOrder ? ProductSortBy.NAME : ProductSortBy.CREATED_AT);
    const effectiveSortOrder = sortOrder ?? ProductSortOrder.DESC;
    const sort: Prisma.ProductOrderByWithRelationInput =
      effectiveSortBy === ProductSortBy.NAME
        ? { name: effectiveSortOrder }
        : effectiveSortBy === ProductSortBy.PRICE
          ? { basePrice: effectiveSortOrder }
          : { createdAt: effectiveSortOrder };

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [sort, { id: 'desc' }],
        skip,
        take: limit,
        include: productInclude,
      }),
      this.prisma.product.count({ where }),
    ]);

    const productsWithWishlist =
      userId === undefined
        ? products
        : await this.addWishlistState(products, userId);

    const totalPages = Math.ceil(total / limit);
    return {
      products: productsWithWishlist,
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1 && totalPages > 0,
        },
      },
    };
  }

  async findOne(slug: string, userId?: number) {
    const [product, reviewStats] = await this.prisma.$transaction(
      [
        this.prisma.product.findFirst({
          where: { slug, productStatus: true },
          select: productDetailSelect,
        }),
        this.prisma.review.aggregate({
          where: { product: { slug } },
          _avg: { stars: true },
          _count: { _all: true },
        }),
      ],
      {
        maxWait: 10_000,
        timeout: 20_000,
      },
    );

    if (!product)
      throw new NotFoundException(`Product with slug ${slug} not found`);

    const wishlistEntry =
      userId === undefined
        ? undefined
        : await this.prisma.wishList.findFirst({
            where: { userId, productId: product.id },
            select: { id: true },
          });

    const { reviews, variantTypes, variants, ...details } = product;
    return {
      ...details,
      ...(userId !== undefined && { isWishlisted: Boolean(wishlistEntry) }),
      variantOptions: (variantTypes ?? []).map(
        ({ variantType, productVariantValues }) => ({
          ...variantType,
          values: (productVariantValues ?? []).map(({ id, variantValue }) => ({
            ...variantValue,
            productVariantValueId: id,
          })),
        }),
      ),
      variants: (variants ?? []).map(({ combinationValues, ...variant }) => ({
        ...variant,
        values: (combinationValues ?? []).map(
          ({ variantValue }) => variantValue,
        ),
      })),
      reviews: {
        averageRating: Number(reviewStats._avg.stars ?? 0),
        totalReviews: reviewStats._count._all,
        items: reviews,
      },
    };
  }

  private async addWishlistState<T extends { id: number }>(
    products: T[],
    userId: number,
  ): Promise<Array<T & { isWishlisted: boolean }>> {
    if (products.length === 0) {
      return [];
    }

    const wishlistEntries = await this.prisma.wishList.findMany({
      where: {
        userId,
        productId: { in: products.map(({ id }) => id) },
      },
      select: { productId: true },
    });
    const wishlistedProductIds = new Set(
      wishlistEntries.map(({ productId }) => productId),
    );

    return products.map((product) => ({
      ...product,
      isWishlisted: wishlistedProductIds.has(product.id),
    }));
  }

  async update(id: number, dto: UpdateProductDto) {
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.basePrice === undefined &&
      dto.productStatus === undefined &&
      dto.categories === undefined
    ) {
      throw new BadRequestException('Provide at least one field to update');
    }

    await this.ensureProductExists(id);
    if (dto.categories !== undefined) {
      this.validateCategoryAssignments(dto.categories);
      await this.ensureCategoriesExist(
        dto.categories.map(({ categoryId }) => categoryId),
      );
    }

    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.name === undefined ? undefined : this.createSlug(dto.name),
          description: dto.description,
          basePrice: dto.basePrice,
          productStatus: dto.productStatus,
          ...(dto.categories !== undefined && {
            productCategories: {
              deleteMany: {},
              create: dto.categories.map(({ categoryId, isPrimary }) => ({
                isPrimary,
                category: { connect: { id: categoryId } },
              })),
            },
          }),
        },
        include: productInclude,
      });
    } catch (error) {
      this.handleWriteError(error, id);
    }
  }

  async updateVariantOptions(id: number, dto: UpdateVariantOptionsDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, basePrice: true },
    });
    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);

    const selections = await this.loadAndValidateSelections(
      dto.variantSelections,
    );
    const desiredCombinations = this.buildCombinations(selections);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingVariants = await transaction.variant.findMany({
          where: { productId: id },
          select: { id: true, combinationKey: true },
        });
        const existingByKey = new Map(
          existingVariants.map((variant) => [variant.combinationKey, variant]),
        );
        const desiredKeys = new Set(desiredCombinations.map(({ key }) => key));

        // Cascade deletes ProductVariantValue rows via productVariantType relation
        await transaction.productVariantType.deleteMany({
          where: { productId: id },
        });

        for (const selection of selections) {
          await transaction.productVariantType.create({
            data: {
              productId: id,
              variantTypeId: selection.variantTypeId,
              productVariantValues: {
                create: selection.values.map(({ id: variantValueId }) => ({
                  variantValueId,
                })),
              },
            },
          });
        }

        await transaction.product.update({
          where: { id },
          data: { hasVariants: true },
        });

        // Preserve historical SKU/stock data: removed combinations are deactivated.
        for (const existing of existingVariants) {
          if (!desiredKeys.has(existing.combinationKey)) {
            await transaction.variant.update({
              where: { id: existing.id },
              data: { isActive: false },
            });
          }
        }

        for (const combination of desiredCombinations) {
          const existing = existingByKey.get(combination.key);
          if (existing) {
            await transaction.variant.update({
              where: { id: existing.id },
              data: { isActive: true },
            });
          } else {
            await this.createVariant(
              transaction,
              id,
              product.basePrice,
              combination,
              0,
            );
          }
        }

        return transaction.product.findUniqueOrThrow({
          where: { id },
          include: productWriteInclude,
        });
      });
    } catch (error) {
      this.handleWriteError(error, id);
    }
  }

  async updateVariant(
    productId: number,
    variantId: number,
    dto: UpdateVariantDto,
  ) {
    if (
      dto.sku === undefined &&
      dto.price === undefined &&
      dto.stock === undefined &&
      dto.isActive === undefined
    ) {
      throw new BadRequestException('Provide at least one field to update');
    }

    const variant = await this.prisma.variant.findFirst({
      where: { id: variantId, productId },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException(
        `Variant with id ${variantId} was not found for product ${productId}`,
      );
    }

    try {
      return await this.prisma.variant.update({
        where: { id: variantId },
        data: dto,
        include: {
          combinationValues: {
            include: { variantValue: { select: variantValueSelect } },
          },
        },
      });
    } catch (error) {
      this.handleWriteError(error, productId);
    }
  }

  private async prepareSelections(
    hasVariants: boolean,
    selections?: ProductVariantSelectionDto[],
  ): Promise<ValidatedSelection[]> {
    if (!hasVariants) {
      if (selections !== undefined) {
        throw new BadRequestException(
          'variantSelections are only allowed when hasVariants is true',
        );
      }
      return [];
    }
    if (!selections?.length) {
      throw new BadRequestException(
        'variantSelections are required when hasVariants is true',
      );
    }
    return this.loadAndValidateSelections(selections);
  }

  private async loadAndValidateSelections(
    selections: ProductVariantSelectionDto[],
  ): Promise<ValidatedSelection[]> {
    const typeIds = selections.map(({ variantTypeId }) => variantTypeId);
    if (new Set(typeIds).size !== typeIds.length) {
      throw new BadRequestException('Variant type IDs must be unique');
    }

    const valueIds = selections.flatMap(
      ({ variantValueIds }) => variantValueIds,
    );
    const [types, values] = await Promise.all([
      this.prisma.variantType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true },
      }),
      this.prisma.variantValue.findMany({
        where: { id: { in: valueIds } },
        select: { id: true, code: true, variantTypeId: true },
      }),
    ]);

    const foundTypeIds = new Set(types.map(({ id }) => id));
    const missingTypeIds = typeIds.filter((id) => !foundTypeIds.has(id));
    if (missingTypeIds.length) {
      throw new NotFoundException(
        `Variant types with ids ${missingTypeIds.join(', ')} not found`,
      );
    }

    const valueById = new Map(values.map((value) => [value.id, value]));
    const missingValueIds = valueIds.filter((id) => !valueById.has(id));
    if (missingValueIds.length) {
      throw new NotFoundException(
        `Variant values with ids ${[...new Set(missingValueIds)].join(', ')} not found`,
      );
    }

    const validated = selections.map(({ variantTypeId, variantValueIds }) => {
      const selectedValues = variantValueIds.map((id) => valueById.get(id)!);
      if (
        selectedValues.some((value) => value.variantTypeId !== variantTypeId)
      ) {
        throw new BadRequestException(
          `One or more values do not belong to variant type ${variantTypeId}`,
        );
      }
      return {
        variantTypeId,
        values: selectedValues
          .map(({ id, code }) => ({ id, code }))
          .sort((a, b) => a.id - b.id),
      };
    });

    return validated.sort((a, b) => a.variantTypeId - b.variantTypeId);
  }

  private buildCombinations(selections: ValidatedSelection[]): Combination[] {
    let combinations: Array<{ valueIds: number[]; codes: string[] }> = [
      { valueIds: [], codes: [] },
    ];

    // Cartesian expansion turns [S,M] x [Red,Blue] into four sellable SKUs.
    for (const selection of selections) {
      combinations = combinations.flatMap((combination) =>
        selection.values.map((value) => ({
          valueIds: [...combination.valueIds, value.id],
          codes: [...combination.codes, value.code],
        })),
      );
    }

    return combinations.map(({ valueIds, codes }) => ({
      valueIds,
      codes,
      key: [...valueIds].sort((a, b) => a - b).join('-'),
    }));
  }

  private async createVariant(
    transaction: Prisma.TransactionClient,
    productId: number,
    price: Prisma.Decimal,
    combination: Combination,
    quantity: number,
  ) {
    const variant = await transaction.variant.create({
      data: {
        productId,
        combinationKey: combination.key,
        sku: `P-${productId}-${combination.codes.join('-')}`,
        price,
        stock: quantity,
      },
    });

    await transaction.variantCombinationValue.createMany({
      data: combination.valueIds.map((variantValueId) => ({
        variantId: variant.id,
        variantValueId,
      })),
    });

    return variant;
  }

  /**
   * Inserts all product variants and their value links in two database calls.
   * `createManyAndReturn` is required here because the generated variant IDs
   * are needed for the VariantCombinationValue rows.
   */
  private async createVariantsInBulk(
    transaction: Prisma.TransactionClient,
    productId: number,
    price: Prisma.Decimal,
    combinations: Combination[],
    quantities: Map<string, number>,
  ): Promise<void> {
    const createdVariants = await transaction.variant.createManyAndReturn({
      data: combinations.map((combination) => ({
        productId,
        combinationKey: combination.key,
        sku: `P-${productId}-${combination.codes.join('-')}`,
        price,
        stock: quantities.get(combination.key)!,
      })),
      select: { id: true, combinationKey: true },
    });

    const variantIdByCombinationKey = new Map(
      createdVariants.map(({ id, combinationKey }) => [combinationKey, id]),
    );

    await transaction.variantCombinationValue.createMany({
      data: combinations.flatMap((combination) => {
        const variantId = variantIdByCombinationKey.get(combination.key);
        if (variantId === undefined) {
          throw new ConflictException(
            `Variant for combination ${combination.key} was not created`,
          );
        }

        return combination.valueIds.map((variantValueId) => ({
          variantId,
          variantValueId,
        }));
      }),
    });
  }

  private prepareVariantQuantities(
    hasVariants: boolean,
    combinations: Combination[],
    variantQuantities?: ProductVariantQuantityDto[],
  ): Map<string, number> {
    if (!hasVariants) {
      if (variantQuantities !== undefined) {
        throw new BadRequestException(
          'variantQuantities are only allowed when hasVariants is true',
        );
      }
      return new Map();
    }

    if (!variantQuantities?.length) {
      throw new BadRequestException(
        'variantQuantities are required when hasVariants is true',
      );
    }

    const quantityByKey = new Map<string, number>();
    for (const { variantValueIds, quantity } of variantQuantities) {
      const key = [...variantValueIds].sort((a, b) => a - b).join('-');
      if (quantityByKey.has(key)) {
        throw new BadRequestException(
          `Quantity for variant combination ${key} was provided more than once`,
        );
      }
      quantityByKey.set(key, quantity);
    }

    const expectedKeys = new Set(combinations.map(({ key }) => key));
    const unexpectedKeys = [...quantityByKey.keys()].filter(
      (key) => !expectedKeys.has(key),
    );
    if (unexpectedKeys.length) {
      throw new BadRequestException(
        `Quantities contain invalid variant combinations: ${unexpectedKeys.join(', ')}`,
      );
    }

    const missingKeys = combinations
      .map(({ key }) => key)
      .filter((key) => !quantityByKey.has(key));
    if (missingKeys.length) {
      throw new BadRequestException(
        `Quantities are required for variant combinations: ${missingKeys.join(', ')}`,
      );
    }

    return quantityByKey;
  }

  private validateCategoryAssignments(
    categories: CreateProductDto['categories'],
  ): void {
    const categoryIds = categories.map(({ categoryId }) => categoryId);
    if (new Set(categoryIds).size !== categoryIds.length) {
      throw new BadRequestException('Category IDs must be unique');
    }
    const primaryCount = categories.filter(({ isPrimary }) => isPrimary).length;
    if (primaryCount !== 1) {
      throw new BadRequestException(
        'Exactly one category must be marked as primary',
      );
    }
  }

  private validateProductMedia(
    dto: CreateProductDto,
    selections: ValidatedSelection[],
  ): void {
    // media is optional — skip all checks when not provided
    if (!dto.media?.length) return;

    if (dto.media.length > 10) {
      throw new BadRequestException('At most 10 media items are allowed');
    }

    const publicIds = dto.media.map(({ providerPublicId }) => providerPublicId);
    if (new Set(publicIds).size !== publicIds.length) {
      throw new BadRequestException('Product media must be unique');
    }

    const positions = dto.media.map(({ position }) => position);
    if (new Set(positions).size !== positions.length) {
      throw new BadRequestException('Product media positions must be unique');
    }

    if (dto.media.filter(({ isPrimary }) => isPrimary).length !== 1) {
      throw new BadRequestException(
        'Exactly one product image must be marked as primary',
      );
    }

    if (!dto.hasVariants) {
      const hasVariantValue = dto.media.some(
        ({ variantValueId }) => variantValueId !== undefined,
      );
      if (hasVariantValue) {
        throw new BadRequestException(
          'Media cannot be linked to a variant value when hasVariants is false',
        );
      }
    } else {
      const selectedValueIds = new Set(
        selections.flatMap(({ values }) => values.map(({ id }) => id)),
      );
      const invalidVariantValue = dto.media.find(
        ({ variantValueId }) =>
          variantValueId !== undefined && !selectedValueIds.has(variantValueId),
      );
      if (invalidVariantValue) {
        throw new BadRequestException(
          'A media variant value is not assigned to this product',
        );
      }
    }
  }

  private createSlug(value: string): string {
    const slug = value
      .normalize('NFKD')
      .toLowerCase()
      .trim()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) {
      throw new BadRequestException(
        'Product name must contain at least one letter or number',
      );
    }
    return slug;
  }

  private async ensureProductExists(id: number): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);
  }

  private async ensureCategoriesExist(categoryIds: number[]): Promise<void> {
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    });
    const existing = new Set(categories.map(({ id }) => id));
    const missing = categoryIds.filter((id) => !existing.has(id));
    if (missing.length) {
      throw new NotFoundException(
        `Categories with ids ${missing.join(', ')} not found`,
      );
    }
  }

  private handleCreateError(error: unknown, slug?: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(',')
          : typeof error.meta?.target === 'string'
            ? error.meta.target
            : '';
        if (target.includes('slug') || (slug && target.includes('slug'))) {
          throw new ConflictException(
            slug
              ? `Product with slug '${slug}' already exists`
              : 'Product with this slug already exists',
          );
        }
        if (target.includes('sku')) {
          throw new ConflictException('Generated SKU already exists');
        }
        if (target.includes('providerPublicId')) {
          throw new ConflictException('Media public ID conflict');
        }
        throw new ConflictException('Product or generated SKU already exists');
      }
      if (error.code === 'P2003' || error.code === 'P2025') {
        throw new NotFoundException(
          'A selected category or variant option no longer exists',
        );
      }
    }
    throw error;
  }

  private handleWriteError(error: unknown, id: number): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'Product variant data conflicts with an existing record',
        );
      }
      if (error.code === 'P2003') {
        throw new ConflictException('Product variant data is still referenced');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Product with id ${id} not found`);
      }
    }
    throw error;
  }
}
