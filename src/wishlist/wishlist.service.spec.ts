import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { WishlistService } from './wishlist.service';

describe('WishlistService', () => {
  const prisma = {
    product: { findFirst: jest.fn() },
    wishList: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: WishlistService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((queries: unknown[]) =>
      Promise.all(queries),
    );
    service = new WishlistService(prisma as unknown as PrismaService);
  });

  it('adds an active product for the authenticated user', async () => {
    const entry = {
      id: 9,
      userId: 4,
      productId: 12,
      product: { id: 12, images: [] },
    };
    prisma.product.findFirst.mockResolvedValue({ id: 12 });
    prisma.wishList.findUnique.mockResolvedValue(null);
    prisma.wishList.create.mockResolvedValue(entry);

    await expect(service.add(4, 12)).resolves.toEqual({
      id: 9,
      userId: 4,
      productId: 12,
      product: { id: 12, images: [] },
    });
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 12, productStatus: true },
      select: { id: true },
    });
    expect(prisma.wishList.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 4, productId: 12 } }),
    );
  });

  it('rejects missing or inactive products', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.add(4, 12)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.wishList.create).not.toHaveBeenCalled();
  });

  it('returns conflict when the product is already saved', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 12 });
    prisma.wishList.findUnique.mockResolvedValue({ id: 9 });

    await expect(service.add(4, 12)).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a concurrent duplicate insert to conflict', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 12 });
    prisma.wishList.findUnique.mockResolvedValue(null);
    prisma.wishList.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(service.add(4, 12)).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a user-scoped paginated wishlist including product status', async () => {
    const items = [
      {
        id: 10,
        userId: 4,
        productId: 12,
        product: { id: 12, productStatus: false },
      },
    ];
    prisma.wishList.findMany.mockResolvedValue(items);
    prisma.wishList.count.mockResolvedValue(21);

    await expect(service.findAll(4, { page: 2, limit: 10 })).resolves.toEqual({
      items,
      meta: {
        pagination: {
          page: 2,
          limit: 10,
          total: 21,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: true,
        },
      },
    });
    expect(prisma.wishList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 4 },
        orderBy: { id: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('removes only the authenticated user product entry', async () => {
    prisma.wishList.findUnique.mockResolvedValue({ id: 9 });
    prisma.wishList.delete.mockResolvedValue({ id: 9 });

    await expect(service.remove(4, 12)).resolves.toEqual({ productId: 12 });
    expect(prisma.wishList.findUnique).toHaveBeenCalledWith({
      where: { userId_productId: { userId: 4, productId: 12 } },
      select: { id: true },
    });
    expect(prisma.wishList.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it('returns not found when removing an unsaved product', async () => {
    prisma.wishList.findUnique.mockResolvedValue(null);

    await expect(service.remove(4, 12)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.wishList.delete).not.toHaveBeenCalled();
  });
});
