import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { WishlistPaginationDto } from './dto/wishlist-pagination.dto';

const wishlistProductSelect = {
  id: true,
  name: true,
  slug: true,
  basePrice: true,
  productStatus: true,
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
      variantValue: { select: { id: true, value: true, code: true } },
    },
  },
} satisfies Prisma.ProductSelect;

const wishlistEntrySelect = {
  id: true,
  userId: true,
  productId: true,
  product: { select: wishlistProductSelect },
} satisfies Prisma.WishListSelect;

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) { }

  async add(userId: number, productId: number) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, productStatus: true },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(
        `Active product with id ${productId} not found`,
      );
    }

    const existing = await this.prisma.wishList.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Product is already in your wishlist');
    }

    try {
      return await this.prisma.wishList.create({
        data: { userId, productId },
        select: wishlistEntrySelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product is already in your wishlist');
      }
      throw error;
    }
  }

  async findAll(userId: number, { page, limit }: WishlistPaginationDto) {
    const skip = (page - 1) * limit;
    const where: Prisma.WishListWhereInput = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.wishList.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
        select: wishlistEntrySelect,
      }),
      this.prisma.wishList.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
    };
  }

  async remove(userId: number, productId: number) {
    const existing = await this.prisma.wishList.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Product is not in your wishlist');
    }

    await this.prisma.wishList.delete({ where: { id: existing.id } });
    return { productId };
  }
}
