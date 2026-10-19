import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentGateway,
  PaymentStatus,
  UserRole,
} from 'generated/prisma/enums';
import { PrismaService } from 'prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import {
  OrderResponseDto,
  PaginatedOrderResponseDto,
} from './dto/order-response.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const orderInclude = {
  items: {
    include: {
      variant: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  },
  payments: true,
} as const;

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async createOrder(
    userId: number,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    // 1. Resolve user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    // 2. Resolve shipping address
    let address: any = null;
    if (dto.shippingAddressId) {
      address = await this.prisma.address.findFirst({
        where: { id: dto.shippingAddressId, userId },
      });
      if (!address) {
        throw new NotFoundException(
          `Shipping address with ID ${dto.shippingAddressId} not found or not owned by user`,
        );
      }
    } else {
      address = await this.prisma.address.findFirst({
        where: { userId, isDefault: true },
      });
      if (!address) {
        const fallbackAddress = await this.prisma.address.findFirst({
          where: { userId },
          orderBy: { id: 'desc' },
        });
        if (fallbackAddress) {
          address = fallbackAddress;
        } else {
          throw new BadRequestException(
            'Shipping address is required. Please create an address first or provide shippingAddressId.',
          );
        }
      }
    }

    // 2. Resolve items to checkout
    let itemsToCheckout: Array<{ variantId: number; quantity: number }> = [];

    if (dto.items && dto.items.length > 0) {
      const seen = new Set<number>();
      for (const item of dto.items) {
        if (seen.has(item.variantId)) {
          throw new BadRequestException(
            `Duplicate variantId ${item.variantId} in items list.`,
          );
        }
        seen.add(item.variantId);
      }
      itemsToCheckout = dto.items;
    } else {
      const cart = await this.prisma.cart.findUnique({
        where: { userId },
        include: {
          items: {
            where: { isSelected: true },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException(
          'Your cart has no selected items for checkout.',
        );
      }

      itemsToCheckout = cart.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.buyingQuantity,
      }));
    }

    const variantIds = itemsToCheckout.map((i) => i.variantId);

    // 3. Process transaction
    const order = await this.prisma.$transaction(async (tx) => {
      const variants = await tx.variant.findMany({
        where: { id: { in: variantIds } },
        include: { product: true },
      });

      const variantsMap = new Map(variants.map((v) => [v.id, v]));

      let subtotal = 0;

      for (const item of itemsToCheckout) {
        const variant = variantsMap.get(item.variantId);
        if (!variant || !variant.isActive) {
          throw new BadRequestException(
            `Variant with ID ${item.variantId} is not available.`,
          );
        }
        if (!variant.product.productStatus) {
          throw new BadRequestException(
            `Product "${variant.product.name}" is currently unavailable.`,
          );
        }
        if (variant.stock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${variant.product.name}" (${variant.sku}). Available: ${variant.stock}, Requested: ${item.quantity}.`,
          );
        }

        // Deduct inventory
        await tx.variant.update({
          where: { id: variant.id },
          data: { stock: { decrement: item.quantity } },
        });

        const linePrice = Number(variant.price);
        subtotal += linePrice * item.quantity;
      }

      const totalFormatted = subtotal.toFixed(2);
      const transactionId = `COD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Create Order, OrderItems, and Payment record
      const createdOrder = await tx.order.create({
        data: {
          userId,
          shippingAddressId: address.id,
          shippingFullName: address.fullName,
          shippingPhone: address.phone,
          shippingStreet: address.street,
          shippingCity: address.city,
          shippingProvince: address.province,
          shippingPostalCode: address.postalCode,
          shippingCountry: address.country,
          totalAmount: totalFormatted,
          status: OrderStatus.pending,
          items: {
            create: itemsToCheckout.map((item) => {
              const variant = variantsMap.get(item.variantId)!;
              return {
                variantId: item.variantId,
                quantity: item.quantity,
                price: variant.price,
              };
            }),
          },
          payments: {
            create: {
              amount: totalFormatted,
              currency: 'PKR',
              status: PaymentStatus.pending,
              gateway: PaymentGateway.cod,
              transactionId,
            },
          },
        },
        include: orderInclude,
      });

      // Remove purchased items from cart if they exist
      await tx.cartItem.deleteMany({
        where: {
          cart: { userId },
          variantId: { in: variantIds },
        },
      });

      return createdOrder;
    });

    const response = this.formatOrderResponse(order);

    if (user?.email) {
      this.mailService
        .sendOrderConfirmation({
          to: user.email,
          customerName: user.name || response.shipping.shippingFullName,
          orderId: response.id,
          orderDate: new Date(response.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
          status: response.status,
          totalAmount: response.totalAmount,
          items: response.items.map((item) => ({
            productName: item.variant.product.name,
            sku: item.variant.sku,
            combinationKey: item.variant.combinationKey,
            quantity: item.quantity,
            unitPrice: item.price,
            lineTotal: item.lineTotal,
          })),
          shipping: {
            fullName: response.shipping.shippingFullName,
            phone: response.shipping.shippingPhone,
            street: response.shipping.shippingStreet,
            city: response.shipping.shippingCity,
            province: response.shipping.shippingProvince,
            postalCode: response.shipping.shippingPostalCode,
            country: response.shipping.shippingCountry,
          },
        })
        .catch((err) => {
          this.logger.error(
            `Failed to send order confirmation email: ${err?.message}`,
            err?.stack,
          );
        });
    }

    return response;
  }

  async getUserOrders(
    userId: number,
    query: OrderQueryDto,
  ): Promise<PaginatedOrderResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: orderInclude,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      orders: orders.map((o) => this.formatOrderResponse(o)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getOrderById(
    userId: number,
    role: UserRole,
    orderId: number,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (
      role !== UserRole.admin &&
      role !== UserRole.seller &&
      order.userId !== userId
    ) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return this.formatOrderResponse(order);
  }

  async cancelOrder(
    userId: number,
    role: UserRole,
    orderId: number,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (
      role !== UserRole.admin &&
      role !== UserRole.seller &&
      order.userId !== userId
    ) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (order.status !== OrderStatus.pending) {
      throw new BadRequestException(
        `Only pending orders can be cancelled. Current status is "${order.status}".`,
      );
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // Restock items
      for (const item of order.items) {
        await tx.variant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }

      // Update payment to failed
      await tx.payment.updateMany({
        where: { orderId: order.id },
        data: { status: PaymentStatus.failed },
      });

      // Update order status
      return tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.cancelled },
        include: orderInclude,
      });
    });

    return this.formatOrderResponse(updatedOrder);
  }

  async getAllOrdersAdmin(
    query: AdminOrderQueryDto,
  ): Promise<PaginatedOrderResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: orderInclude,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      orders: orders.map((o) => this.formatOrderResponse(o)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async updateOrderStatus(
    orderId: number,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (
      order.status === OrderStatus.cancelled ||
      order.status === OrderStatus.returned
    ) {
      throw new BadRequestException(
        `Cannot change status of an order that is already "${order.status}".`,
      );
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // If moving to cancelled or returned, restock products
      if (
        dto.status === OrderStatus.cancelled ||
        dto.status === OrderStatus.returned
      ) {
        for (const item of order.items) {
          await tx.variant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }

        const newPaymentStatus =
          dto.status === OrderStatus.cancelled
            ? PaymentStatus.failed
            : PaymentStatus.refunded;

        await tx.payment.updateMany({
          where: { orderId: order.id },
          data: { status: newPaymentStatus },
        });
      } else if (dto.status === OrderStatus.delivered) {
        // COD collected upon delivery: mark payment success
        await tx.payment.updateMany({
          where: { orderId: order.id },
          data: {
            status: PaymentStatus.success,
            paidAt: new Date(),
          },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: dto.status },
        include: orderInclude,
      });
    });

    return this.formatOrderResponse(updatedOrder);
  }

  private formatOrderResponse(order: any): OrderResponseDto {
    return {
      id: order.id,
      userId: order.userId,
      shippingAddressId: order.shippingAddressId,
      shipping: {
        shippingFullName: order.shippingFullName,
        shippingPhone: order.shippingPhone,
        shippingStreet: order.shippingStreet,
        shippingCity: order.shippingCity,
        shippingProvince: order.shippingProvince,
        shippingPostalCode: order.shippingPostalCode,
        shippingCountry: order.shippingCountry,
      },
      totalAmount: String(order.totalAmount),
      status: order.status,
      createdAt: order.createdAt,
      items: order.items.map((item: any) => ({
        id: item.id,
        orderId: item.orderId,
        variantId: item.variantId,
        quantity: item.quantity,
        price: String(item.price),
        lineTotal: Number((Number(item.price) * item.quantity).toFixed(2)),
        variant: {
          id: item.variant.id,
          sku: item.variant.sku,
          combinationKey: item.variant.combinationKey,
          product: {
            id: item.variant.product.id,
            name: item.variant.product.name,
            slug: item.variant.product.slug,
          },
        },
      })),
      payments: order.payments.map((p: any) => ({
        id: p.id,
        orderId: p.orderId,
        amount: String(p.amount),
        currency: p.currency,
        status: p.status,
        gateway: p.gateway,
        transactionId: p.transactionId,
        paidAt: p.paidAt,
      })),
    };
  }
}
