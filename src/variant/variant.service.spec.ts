import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { VariantService } from './variant.service';

describe('VariantService', () => {
  let service: VariantService;
  let prisma: {
    variantType: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    variantValue: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      variantType: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      variantValue: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new VariantService(prisma as unknown as PrismaService);
  });

  it('lists globally reusable types with their ordered values', async () => {
    const types = [{ id: 1, name: 'Color', values: [{ value: 'Blue' }] }];
    prisma.variantType.findMany.mockResolvedValue(types);

    await expect(service.findAllTypes()).resolves.toBe(types);
    expect(prisma.variantType.findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        values: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });
  });

  it('creates a normalized variant type slug', async () => {
    prisma.variantType.create.mockResolvedValue({
      id: 1,
      name: 'Storage Size',
      slug: 'storage-size',
    });

    await service.createType({ name: 'Storage Size', sortOrder: 2 });

    expect(prisma.variantType.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Storage Size', slug: 'storage-size', sortOrder: 2 },
      }),
    );
  });

  it('creates a reusable value under an existing type', async () => {
    prisma.variantType.findUnique.mockResolvedValue({ id: 1 });
    prisma.variantValue.create.mockResolvedValue({ id: 20, value: 'Blue' });

    await service.createValue(1, {
      value: 'Blue',
      code: 'BLUE',
      metadata: { hex: '#0000FF' },
      sortOrder: 0,
    });

    expect(prisma.variantValue.create).toHaveBeenCalledWith({
      data: {
        variantTypeId: 1,
        value: 'Blue',
        code: 'BLUE',
        metadata: { hex: '#0000FF' },
        sortOrder: 0,
      },
      include: { variantType: true },
    });
  });

  it('returns not found when a value parent type does not exist', async () => {
    prisma.variantType.findUnique.mockResolvedValue(null);

    await expect(
      service.createValue(99, {
        value: 'Blue',
        code: 'BLUE',
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('prevents deleting a value that is in use', async () => {
    prisma.variantValue.findUnique.mockResolvedValue({ id: 20 });
    prisma.variantValue.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
        code: 'P2003',
        clientVersion: '7.8.0',
      }),
    );

    await expect(service.removeValue(20)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
