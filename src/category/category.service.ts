import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CategoryPaginationDto } from './dto/category-pagination.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryQueryNode } from './types/category-tree-node.type';

const categorySummarySelect = {
  id: true,
  categoryName: true,
  slug: true,
  parentId: true,
  _count: {
    select: {
      productCategories: true,
    },
  },
} satisfies Prisma.CategorySelect;

type CategorySummaryRecord = Prisma.CategoryGetPayload<{
  select: typeof categorySummarySelect;
}>;

export interface CategoryListResult {
  categories: CategoryQueryNode[];
  meta: {
    parentId: number | null;
    depth: number;
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
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({
    parentId,
    depth,
    page,
    limit,
  }: CategoryPaginationDto): Promise<CategoryListResult> {
    const skip = (page - 1) * limit;
    const selectedParentId = parentId ?? null;

    const categorySelect = this.buildCategorySelect(depth);
    const [categories, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where: { parentId: selectedParentId },
        orderBy: [{ categoryName: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
        select: categorySelect,
      }),
      this.prisma.category.count({
        where: { parentId: selectedParentId },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      categories: categories as unknown as CategoryQueryNode[],
      meta: {
        parentId: selectedParentId,
        depth,
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

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: {
        ...categorySummarySelect,
        parent: { select: categorySummarySelect },
        children: {
          orderBy: [{ categoryName: 'asc' }, { id: 'asc' }],
          select: categorySummarySelect,
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    return {
      ...this.toSummary(category),
      parent: category.parent ? this.toSummary(category.parent) : null,
      children: category.children.map((child) => this.toSummary(child)),
    };
  }

  async create(dto: CreateCategoryDto) {
    const parentId = dto.parentId ?? null;

    await this.ensureParentExists(parentId);

    const slug = this.createSlug(dto.categoryName);
    await this.ensureUnique(dto.categoryName, slug, parentId);

    try {
      const category = await this.prisma.category.create({
        data: {
          categoryName: dto.categoryName,
          slug,
          parentId,
        },
        select: categorySummarySelect,
      });

      return this.toSummary(category);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(id: number, dto: UpdateCategoryDto) {
    if (dto.categoryName === undefined && dto.parentId === undefined) {
      throw new BadRequestException(
        'Provide categoryName or parentId to update the category',
      );
    }

    const current = await this.getExisting(id);
    const parentId =
      dto.parentId === undefined ? current.parentId : dto.parentId;
    const categoryName = dto.categoryName ?? current.categoryName;
    const slug = dto.categoryName
      ? this.createSlug(dto.categoryName)
      : current.slug;

    if (parentId === id) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    await this.ensureNoHierarchyCycle(id, parentId);
    await this.ensureUnique(categoryName, slug, parentId, id);

    try {
      const category = await this.prisma.category.update({
        where: { id },
        data: { categoryName, slug, parentId },
        select: categorySummarySelect,
      });

      return this.toSummary(category);
    } catch (error) {
      this.handleWriteError(error, id);
    }
  }

  async remove(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            children: true,
            productCategories: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    if (category._count.children > 0) {
      throw new ConflictException('Delete or move child categories first');
    }

    if (category._count.productCategories > 0) {
      throw new ConflictException(
        'Remove the products assigned to this category first',
      );
    }

    try {
      const deletedCategory = await this.prisma.category.delete({
        where: { id },
        select: categorySummarySelect,
      });

      return this.toSummary(deletedCategory);
    } catch (error) {
      this.handleWriteError(error, id);
    }
  }

  private buildCategorySelect(depth: number): Prisma.CategorySelect {
    return {
      ...categorySummarySelect,
      ...(depth > 1 && {
        children: {
          orderBy: [{ categoryName: 'asc' }, { id: 'asc' }],
          select: this.buildCategorySelect(depth - 1),
        },
      }),
    };
  }

  private toSummary(category: CategorySummaryRecord) {
    return {
      id: category.id,
      categoryName: category.categoryName,
      slug: category.slug,
      parentId: category.parentId,
      productCount: category._count.productCategories,
    };
  }

  private async getExisting(id: number) {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    return category;
  }

  private async ensureParentExists(parentId: number | null) {
    if (parentId === null) return;

    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true },
    });

    if (!parent) {
      throw new BadRequestException(
        `Parent category with id ${parentId} not found`,
      );
    }
  }

  private async ensureUnique(
    categoryName: string,
    slug: string,
    parentId: number | null,
    excludeId?: number,
  ) {
    const duplicate = await this.prisma.category.findFirst({
      where: {
        parentId,
        id: excludeId === undefined ? undefined : { not: excludeId },
        OR: [{ categoryName }, { slug }],
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        'A category with this name already exists under the selected parent',
      );
    }
  }

  private async ensureNoHierarchyCycle(id: number, parentId: number | null) {
    let nextParentId = parentId;
    const visitedIds = new Set<number>();
    let isSelectedParent = true;

    while (nextParentId !== null) {
      if (nextParentId === id) {
        throw new BadRequestException(
          'A category cannot be moved under one of its descendants',
        );
      }

      if (visitedIds.has(nextParentId)) {
        throw new ConflictException('The category hierarchy is corrupted');
      }

      visitedIds.add(nextParentId);
      const parent = await this.prisma.category.findUnique({
        where: { id: nextParentId },
        select: { parentId: true },
      });

      if (!parent) {
        if (isSelectedParent) {
          throw new BadRequestException(
            `Parent category with id ${nextParentId} not found`,
          );
        }

        throw new ConflictException('The category hierarchy is corrupted');
      }

      isSelectedParent = false;
      nextParentId = parent.parentId;
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
        'Category name must contain at least one letter or number',
      );
    }

    return slug;
  }

  private handleWriteError(error: unknown, id?: number): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'A category with this name already exists under the selected parent',
        );
      }

      if (error.code === 'P2003') {
        throw new ConflictException(
          'The category is still referenced by another record',
        );
      }

      if (error.code === 'P2025' && id !== undefined) {
        throw new NotFoundException(`Category with id ${id} not found`);
      }
    }

    throw error;
  }
}
