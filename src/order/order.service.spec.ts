import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AddressType,
  OrderStatus,
  PaymentGateway,
  PaymentStatus,
  UserRole,
} from 'generated/prisma/enums';
import { PrismaService } from 'prisma/prisma.service';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;
  let prisma: {
    $transaction: jest.Mock;
    address: { findFirst: jest.Mock };
    cart: { findUnique: jest.Mock };
    cartItem: { deleteMany: jest.Mock };
    order: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    variant: { findMany: jest.Mock; update: jest.Mock };
    payment: { updateMany: jest.Mock };
  };

  const sampleAddress = {
    id: 1,
    userId: 10,
    label: AddressType.home,
    fullName: 'Jane Doe',
    phone: '+1-555-0101',
    street: '100 Main St',
    city: 'Springfield',
    province: 'IL',
    postalCode: '62701',
    country: 'United States',
    isDefault: true,
  };

  const sampleVariant = {
    id: 1,
    sku: 'WH-BLK-001',
    price: '99.99',
    stock: 10,
    isActive: true,
    combinationKey: 'color:black',
    product: {
      id: 1,
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      productStatus: true,
    },
  };

  const sampleOrder = {
    id: 100,
    userId: 10,
    shippingAddressId: 1,
    shippingFullName: 'Jane Doe',
    shippingPhone: '+1-555-0101',
    shippingStreet: '100 Main St',
    shippingCity: 'Springfield',
    shippingProvince: 'IL',
    shippingPostalCode: '62701',
    shippingCountry: 'United States',
    totalAmount: '199.98',
    status: OrderStatus.pending,
    createdAt: new Date('2026-10-16T12:00:00.000Z'),
    items: [
      {
        id: 1,
        orderId: 100,
        variantId: 1,
        quantity: 2,
        price: '99.99',
        variant: sampleVariant,
      },
    ],
    payments: [
      {
        id: 1,
        orderId: 100,
        amount: '199.98',
        currency: 'PKR',
        status: PaymentStatus.pending,
        gateway: PaymentGateway.cod,
        transactionId: 'COD-100-123456',
        paidAt: null,
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      address: { findFirst: jest.fn() },
      cart: { findUnique: jest.fn() },
      cartItem: { deleteMany: jest.fn() },
      order: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      variant: { findMany: jest.fn(), update: jest.fn() },
      payment: { updateMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  describe('createOrder', () => {
    it('should successfully place a COD order from selected cart items', async () => {
      prisma.address.findFirst.mockResolvedValue(sampleAddress);
      prisma.cart.findUnique.mockResolvedValue({
        id: 5,
        items: [{ id: 101, variantId: 1, buyingQuantity: 2, isSelected: true }],
      });
      prisma.variant.findMany.mockResolvedValue([sampleVariant]);
      prisma.variant.update.mockResolvedValue({ ...sampleVariant, stock: 8 });
      prisma.order.create.mockResolvedValue(sampleOrder);
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.createOrder(10, {});

      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { userId: 10, isDefault: true },
      });
      expect(prisma.variant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { stock: { decrement: 2 } },
      });
      expect(prisma.order.create).toHaveBeenCalled();
      expect(prisma.cartItem.deleteMany).toHaveBeenCalled();
      expect(result.id).toBe(100);
      expect(result.status).toBe(OrderStatus.pending);
      expect(result.payments[0].gateway).toBe(PaymentGateway.cod);
    });

    it('should throw BadRequestException if cart has no selected items', async () => {
      prisma.address.findFirst.mockResolvedValue(sampleAddress);
      prisma.cart.findUnique.mockResolvedValue({ id: 5, items: [] });

      await expect(service.createOrder(10, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if requested quantity exceeds stock', async () => {
      prisma.address.findFirst.mockResolvedValue(sampleAddress);
      prisma.cart.findUnique.mockResolvedValue({
        id: 5,
        items: [{ id: 101, variantId: 1, buyingQuantity: 20, isSelected: true }],
      });
      prisma.variant.findMany.mockResolvedValue([sampleVariant]); // stock is 10

      await expect(service.createOrder(10, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getUserOrders', () => {
    it('should return paginated user orders', async () => {
      prisma.order.count.mockResolvedValue(1);
      prisma.order.findMany.mockResolvedValue([sampleOrder]);

      const result = await service.getUserOrders(10, { page: 1, limit: 10 });

      expect(result.orders.length).toBe(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });
  });

  describe('getOrderById', () => {
    it('should return order details for the owner', async () => {
      prisma.order.findUnique.mockResolvedValue(sampleOrder);

      const result = await service.getOrderById(10, UserRole.customer, 100);

      expect(result.id).toBe(100);
      expect(result.shipping.shippingFullName).toBe('Jane Doe');
    });

    it('should throw ForbiddenException if user does not own the order', async () => {
      prisma.order.findUnique.mockResolvedValue(sampleOrder);

      await expect(
        service.getOrderById(999, UserRole.customer, 100),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to access any order', async () => {
      prisma.order.findUnique.mockResolvedValue(sampleOrder);

      const result = await service.getOrderById(999, UserRole.admin, 100);

      expect(result.id).toBe(100);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel pending order, restock items and fail payment', async () => {
      prisma.order.findUnique.mockResolvedValue(sampleOrder);
      prisma.variant.update.mockResolvedValue({});
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.update.mockResolvedValue({
        ...sampleOrder,
        status: OrderStatus.cancelled,
      });

      const result = await service.cancelOrder(10, UserRole.customer, 100);

      expect(prisma.variant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { stock: { increment: 2 } },
      });
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { orderId: 100 },
        data: { status: PaymentStatus.failed },
      });
      expect(result.status).toBe(OrderStatus.cancelled);
    });

    it('should reject cancellation if order is not pending', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...sampleOrder,
        status: OrderStatus.shipped,
      });

      await expect(
        service.cancelOrder(10, UserRole.customer, 100),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateOrderStatus', () => {
    it('should mark payment success upon delivery of COD order', async () => {
      prisma.order.findUnique.mockResolvedValue(sampleOrder);
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.update.mockResolvedValue({
        ...sampleOrder,
        status: OrderStatus.delivered,
      });

      const result = await service.updateOrderStatus(100, {
        status: OrderStatus.delivered,
      });

      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.success,
          }),
        }),
      );
      expect(result.status).toBe(OrderStatus.delivered);
    });

    it('should restock variants if admin cancels an order', async () => {
      prisma.order.findUnique.mockResolvedValue(sampleOrder);
      prisma.variant.update.mockResolvedValue({});
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.update.mockResolvedValue({
        ...sampleOrder,
        status: OrderStatus.cancelled,
      });

      const result = await service.updateOrderStatus(100, {
        status: OrderStatus.cancelled,
      });

      expect(prisma.variant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { stock: { increment: 2 } },
      });
      expect(result.status).toBe(OrderStatus.cancelled);
    });
  });
});
