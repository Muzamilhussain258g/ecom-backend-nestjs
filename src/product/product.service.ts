import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import {
  CreateProductDto,
  ProductVariantQuantityDto,
  ProductVariantSelectionDto,
} from './dto/create-product.dto';
import { GetAllProductsDto } from './dto/get-all-products.dto';
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
    include: { variantType: true },
  },
  variantValues: {
    include: { variantValue: { select: variantValueSelect } },
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
    select: { variantType: true },
  },
  variantValues: {
    select: { id: true, variantValue: { select: variantValueSelect } },
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
  products: Prisma.ProductGetPayload<{ include: typeof productInclude }>[];
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
  ) { }

  async create(dto: CreateProductDto) {
    const categoryIds = dto.categories.map(({ categoryId }) => categoryId);
    this.validateCategoryAssignments(dto.categories);
    await this.ensureCategoriesExist(categoryIds);

    const selections = await this.prepareSelections(
      dto.hasVariants,
      dto.variantSelections,
    );
    this.validateProductMedia(dto, selections);
    // Verify every Cloudinary proof before opening the database transaction.
    const verifiedMedia = dto.media.map((item) => ({
      association: item,
      media: this.mediaService.toMediaCreateInput(item),
    }));
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
            slug: this.createSlug(dto.name),
            description: dto.description,
            basePrice: dto.basePrice,
            hasVariants: dto.hasVariants,
            productCategories: {
              create: dto.categories.map(({ categoryId, isPrimary }) => ({
                isPrimary,
                category: { connect: { id: categoryId } },
              })),
            },
            variantTypes: {
              create: selections.map(({ variantTypeId }) => ({
                variantType: { connect: { id: variantTypeId } },
              })),
            },
            variantValues: {
              create: selections.flatMap(({ values }) =>
                values.map(({ id }) => ({
                  variantValue: { connect: { id } },
                })),
              ),
            },
            images: {
              create: verifiedMedia.map(({ association, media }) => ({
                isPrimary: association.isPrimary,
                position: association.position,
                altText: association.altText,
                variantValue:
                  association.variantValueId === undefined
                    ? undefined
                    : { connect: { id: association.variantValueId } },
                media: { create: media },
              })),
            },
          },
        });

        if (dto.hasVariants) {
          for (const combination of combinations) {
            await this.createVariant(
              transaction,
              product.id,
              product.basePrice,
              combination,
              quantities.get(combination.key)!,
            );
          }
        } else {
          await transaction.variant.create({
            data: {
              productId: product.id,
              combinationKey: 'default',
              sku: `P-${product.id}-DEFAULT`,
              price: product.basePrice,
              stock: dto.stock,
            },
          });
        }

        return transaction.product.findUniqueOrThrow({
          where: { id: product.id },
          include: productWriteInclude,
        });
      });
    } catch (error) {
      this.handleCreateError(error);
    }
  }

  async findAll({
    search,
    category,
    sortOrder,
    page,
    limit,
  }: GetAllProductsDto): Promise<ProductListResult> {
    const skip = (page - 1) * limit;
    const where: Prisma.ProductWhereInput = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(category && {
        productCategories: { some: { category: { slug: category } } },
      }),
    };

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: sortOrder
          ? [{ name: sortOrder }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: productInclude,
      }),
      this.prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      products,
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

  async findOne(slug: string) {
    const [product, reviewStats] = await this.prisma.$transaction([
      this.prisma.product.findFirst({
        where: { slug, productStatus: true },
        select: productDetailSelect,
      }),
      this.prisma.review.aggregate({
        where: { product: { slug } },
        _avg: { stars: true },
        _count: { _all: true },
      }),
    ]);

    if (!product)
      throw new NotFoundException(`Product with slug ${slug} not found`);

    const { reviews, variantTypes, variantValues, variants, ...details } =
      product;
    return {
      ...details,
      variantOptions: variantTypes.map(({ variantType }) => ({
        ...variantType,
        values: variantValues
          .filter(
            ({ variantValue }) =>
              variantValue.variantType.id === variantType.id,
          )
          .map(({ id, variantValue }) => ({
            ...variantValue,
            productVariantValueId: id,
          })),
      })),
      variants: variants.map(({ combinationValues, ...variant }) => ({
        ...variant,
        values: combinationValues.map(({ variantValue }) => variantValue),
      })),
      reviews: {
        averageRating: Number(reviewStats._avg.stars ?? 0),
        totalReviews: reviewStats._count._all,
        items: reviews,
      },
    };
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

        await transaction.productVariantType.deleteMany({
          where: { productId: id },
        });
        await transaction.productVariantValue.deleteMany({
          where: { productId: id },
        });
        await transaction.productVariantType.createMany({
          data: selections.map(({ variantTypeId }) => ({
            productId: id,
            variantTypeId,
          })),
        });
        await transaction.productVariantValue.createMany({
          data: selections.flatMap(({ values }) =>
            values.map(({ id: variantValueId }) => ({
              productId: id,
              variantValueId,
            })),
          ),
        });
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

  private handleCreateError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
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
