import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

export const cartItemSelect = {
  id: true,
  cartId: true,
  variantId: true,
  isSelected: true,
  buyingQuantity: true,
  variant: {
    select: {
      id: true,
      sku: true,
      price: true,
      stock: true,
      isActive: true,
      combinationKey: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          productStatus: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            select: {
              id: true,
              altText: true,
              media: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartItemSelect;

type SelectedCartItem = Prisma.CartItemGetPayload<{
  select: typeof cartItemSelect;
}>;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateCart(userId: number): Promise<{ id: number; userId: number }> {
    const existing = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.cart.create({
      data: { userId },
      select: { id: true, userId: true },
    });
  }

  async getCart(userId: number) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: { id: 'asc' },
      select: cartItemSelect,
    });
    return this.formatCartResponse(cart.id, userId, items);
  }

  async addItem(userId: number, dto: AddToCartDto) {
    const variant = await this.prisma.variant.findUnique({
      where: { id: dto.variantId },
      select: { id: true, stock: true, isActive: true, price: true },
    });

    if (!variant || !variant.isActive) {
      throw new NotFoundException(
        `Active product variant with id ${dto.variantId} not found`,
      );
    }

    const quantityToAdd = dto.buyingQuantity ?? 1;

    if (variant.stock < quantityToAdd) {
      throw new BadRequestException(
        `Insufficient stock. Only ${variant.stock} units available.`,
      );
    }

    const cart = await this.getOrCreateCart(userId);

    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_variantId: {
          cartId: cart.id,
          variantId: dto.variantId,
        },
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.buyingQuantity + quantityToAdd;
      if (variant.stock < newQuantity) {
        throw new BadRequestException(
          `Cannot add ${quantityToAdd} more unit(s). Total would exceed available stock (${variant.stock}).`,
        );
      }
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          buyingQuantity: newQuantity,
          isSelected:
            dto.isSelected !== undefined
              ? dto.isSelected
              : existingItem.isSelected,
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: dto.variantId,
          buyingQuantity: quantityToAdd,
          isSelected: dto.isSelected !== undefined ? dto.isSelected : true,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: number, itemId: number, dto: UpdateCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: {
        variant: {
          select: { stock: true, isActive: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    if (dto.buyingQuantity !== undefined) {
      if (item.variant.stock < dto.buyingQuantity) {
        throw new BadRequestException(
          `Insufficient stock. Only ${item.variant.stock} units available.`,
        );
      }
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        ...(dto.buyingQuantity !== undefined && {
          buyingQuantity: dto.buyingQuantity,
        }),
        ...(dto.isSelected !== undefined && { isSelected: dto.isSelected }),
      },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number) {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    return this.getCart(userId);
  }

  async clearCart(userId: number) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
    return this.getCart(userId);
  }

  private formatCartResponse(
    cartId: number,
    userId: number,
    items: SelectedCartItem[],
  ) {
    let totalItems = 0;
    let selectedItemsCount = 0;
    let subtotal = 0;

    const formattedItems = items.map((item) => {
      const priceNum = Number(item.variant.price);
      const itemTotal = Number((priceNum * item.buyingQuantity).toFixed(2));

      totalItems += item.buyingQuantity;
      if (item.isSelected) {
        selectedItemsCount += item.buyingQuantity;
        subtotal += itemTotal;
      }

      return {
        ...item,
        itemTotal,
      };
    });

    return {
      id: cartId,
      userId,
      items: formattedItems,
      summary: {
        totalItems,
        selectedItemsCount,
        subtotal: Number(subtotal.toFixed(2)),
      },
    };
  }
}
