import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { hash } from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  OrderStatus,
  PaymentGateway,
  PaymentStatus,
  UserRole,
} from 'generated/prisma/enums';
import { PrismaClient } from 'generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

const products = [
  {
    name: 'Dashboard Demo Wireless Headphones',
    slug: 'dashboard-demo-wireless-headphones',
    sku: 'DASHBOARD-DEMO-HEADPHONES',
    price: 8500,
    stock: 3,
  },
  {
    name: 'Dashboard Demo Backpack',
    slug: 'dashboard-demo-backpack',
    sku: 'DASHBOARD-DEMO-BACKPACK',
    price: 4200,
    stock: 2,
  },
  {
    name: 'Dashboard Demo Water Bottle',
    slug: 'dashboard-demo-water-bottle',
    sku: 'DASHBOARD-DEMO-BOTTLE',
    price: 1500,
    stock: 20,
  },
] as const;

const customers = [
  'dashboard-demo-customer-1@example.test',
  'dashboard-demo-customer-2@example.test',
  'dashboard-demo-customer-3@example.test',
  'dashboard-demo-customer-4@example.test',
  'dashboard-demo-customer-5@example.test',
] as const;

const orders = [
  {
    daysAgo: 1,
    status: OrderStatus.delivered,
    paymentStatus: PaymentStatus.success,
    items: [
      { sku: products[0].sku, quantity: 1 },
      { sku: products[2].sku, quantity: 2 },
    ],
  },
  {
    daysAgo: 3,
    status: OrderStatus.delivered,
    paymentStatus: PaymentStatus.success,
    items: [{ sku: products[0].sku, quantity: 1 }],
  },
  {
    daysAgo: 5,
    status: OrderStatus.shipped,
    paymentStatus: PaymentStatus.success,
    items: [{ sku: products[1].sku, quantity: 1 }],
  },
  {
    daysAgo: 7,
    status: OrderStatus.processing,
    paymentStatus: PaymentStatus.pending,
    items: [{ sku: products[1].sku, quantity: 1 }],
  },
  {
    daysAgo: 9,
    status: OrderStatus.pending,
    paymentStatus: PaymentStatus.pending,
    items: [{ sku: products[2].sku, quantity: 2 }],
  },
  {
    daysAgo: 12,
    status: OrderStatus.delivered,
    paymentStatus: PaymentStatus.success,
    items: [
      { sku: products[1].sku, quantity: 1 },
      { sku: products[2].sku, quantity: 1 },
    ],
  },
  {
    daysAgo: 15,
    status: OrderStatus.cancelled,
    paymentStatus: PaymentStatus.failed,
    items: [{ sku: products[0].sku, quantity: 1 }],
  },
  {
    daysAgo: 20,
    status: OrderStatus.returned,
    paymentStatus: PaymentStatus.refunded,
    items: [{ sku: products[1].sku, quantity: 1 }],
  },
  {
    daysAgo: 27,
    status: OrderStatus.delivered,
    paymentStatus: PaymentStatus.success,
    items: [{ sku: products[0].sku, quantity: 1 }],
  },
  {
    daysAgo: 34,
    status: OrderStatus.delivered,
    paymentStatus: PaymentStatus.success,
    items: [{ sku: products[2].sku, quantity: 3 }],
  },
  {
    daysAgo: 42,
    status: OrderStatus.pending,
    paymentStatus: PaymentStatus.pending,
    items: [{ sku: products[1].sku, quantity: 1 }],
  },
  {
    daysAgo: 55,
    status: OrderStatus.delivered,
    paymentStatus: PaymentStatus.success,
    items: [{ sku: products[0].sku, quantity: 1 }],
  },
] as const;

function dateDaysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

async function seedDashboardData() {
  const variants = new Map<string, { id: number; price: number }>();

  for (const productSeed of products) {
    const product = await prisma.product.upsert({
      where: { slug: productSeed.slug },
      update: {
        name: productSeed.name,
        description:
          'Sample product used to populate admin dashboard analytics.',
        basePrice: productSeed.price,
        productStatus: true,
        hasVariants: true,
      },
      create: {
        name: productSeed.name,
        slug: productSeed.slug,
        description:
          'Sample product used to populate admin dashboard analytics.',
        basePrice: productSeed.price,
        productStatus: true,
        hasVariants: true,
      },
    });

    const variant = await prisma.variant.upsert({
      where: { sku: productSeed.sku },
      update: {
        productId: product.id,
        combinationKey: `dashboard-demo-${productSeed.slug}`,
        price: productSeed.price,
        stock: productSeed.stock,
        isActive: true,
      },
      create: {
        productId: product.id,
        combinationKey: `dashboard-demo-${productSeed.slug}`,
        sku: productSeed.sku,
        price: productSeed.price,
        stock: productSeed.stock,
        isActive: true,
      },
    });

    variants.set(productSeed.sku, {
      id: variant.id,
      price: productSeed.price,
    });
  }

  const customerRecords: Array<{ id: number; name: string }> = [];
  for (const [index, email] of customers.entries()) {
    const createdAt = dateDaysAgo(index + 2);
    const customer = await prisma.user.upsert({
      where: { email },
      update: {
        name: `Dashboard Demo Customer ${index + 1}`,
        role: UserRole.customer,
        createdAt,
      },
      create: {
        email,
        name: `Dashboard Demo Customer ${index + 1}`,
        password: await hash(randomBytes(32).toString('hex'), 10),
        role: UserRole.customer,
        createdAt,
      },
    });
    customerRecords.push(customer);
  }

  for (const [index, orderSeed] of orders.entries()) {
    const orderDate = dateDaysAgo(orderSeed.daysAgo);
    const customer = customerRecords[index % customerRecords.length];
    const lineItems = orderSeed.items.map((item) => {
      const variant = variants.get(item.sku);
      if (!variant) {
        throw new Error(`Missing dashboard demo variant for SKU ${item.sku}`);
      }
      return {
        variantId: variant.id,
        quantity: item.quantity,
        price: variant.price.toFixed(2),
      };
    });
    const totalAmount = lineItems.reduce(
      (total, item) => total + Number(item.price) * item.quantity,
      0,
    );
    const transactionId = `DASHBOARD-DEMO-${String(index + 1).padStart(3, '0')}`;

    await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findUnique({
        where: { transactionId },
        select: { orderId: true },
      });
      const orderData = {
        userId: customer.id,
        shippingFullName: customer.name,
        shippingPhone: '+92-300-0000000',
        shippingStreet: 'Demo Street',
        shippingCity: 'Lahore',
        shippingProvince: 'Punjab',
        shippingPostalCode: '54000',
        shippingCountry: 'Pakistan',
        totalAmount: totalAmount.toFixed(2),
        status: orderSeed.status,
        createdAt: orderDate,
      };
      const order = existingPayment
        ? await tx.order.update({
            where: { id: existingPayment.orderId },
            data: orderData,
          })
        : await tx.order.create({ data: orderData });

      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      await tx.orderItem.createMany({
        data: lineItems.map((item) => ({ ...item, orderId: order.id })),
      });
      await tx.payment.upsert({
        where: { transactionId },
        update: {
          amount: totalAmount.toFixed(2),
          currency: 'PKR',
          status: orderSeed.paymentStatus,
          gateway: PaymentGateway.payfast,
          paidAt:
            orderSeed.paymentStatus === PaymentStatus.success
              ? orderDate
              : null,
        },
        create: {
          orderId: order.id,
          transactionId,
          amount: totalAmount.toFixed(2),
          currency: 'PKR',
          status: orderSeed.paymentStatus,
          gateway: PaymentGateway.payfast,
          paidAt:
            orderSeed.paymentStatus === PaymentStatus.success
              ? orderDate
              : null,
        },
      });
    });
  }

  console.log(
    `Dashboard demo data ready: ${products.length} products, ${customers.length} customers, ${orders.length} orders.`,
  );
}

seedDashboardData()
  .catch((error: unknown) => {
    console.error('Failed to seed dashboard demo data:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
