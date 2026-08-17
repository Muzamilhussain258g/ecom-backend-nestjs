import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { VariantService } from './variant.service';

describe('VariantService', () => {
  let service: VariantService;
  let prisma: {
    $transaction: jest.Mock;
    variantType: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    variantValue: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof prisma) => unknown): unknown =>
          callback(prisma),
      ),
      variantType: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      variantValue: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
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

  it('lists all values ordered by type and value sort order', async () => {
    const values = [{ id: 20, value: 'Blue', variantType: { id: 1 } }];
    prisma.variantValue.findMany.mockResolvedValue(values);

    await expect(service.findAllValues()).resolves.toBe(values);
    expect(prisma.variantValue.findMany).toHaveBeenCalledWith({
      orderBy: [
        { variantType: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { id: 'asc' },
      ],
      include: { variantType: true },
    });
  });

  it('lists values belonging to one variant type', async () => {
    const values = [{ id: 20, value: 'Blue', variantTypeId: 1 }];
    prisma.variantType.findUnique.mockResolvedValue({ id: 1 });
    prisma.variantValue.findMany.mockResolvedValue(values);

    await expect(service.findValuesByType(1)).resolves.toBe(values);
    expect(prisma.variantValue.findMany).toHaveBeenCalledWith({
      where: { variantTypeId: 1 },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { variantType: true },
    });
  });

  it('returns not found when listing values for a missing type', async () => {
    prisma.variantType.findUnique.mockResolvedValue(null);

    await expect(service.findValuesByType(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.variantValue.findMany).not.toHaveBeenCalled();
  });

  it('deletes all values belonging to one variant type', async () => {
    prisma.variantType.findUnique.mockResolvedValue({ id: 1 });
    prisma.variantValue.deleteMany.mockResolvedValue({ count: 3 });

    await expect(service.removeValuesByType(1)).resolves.toEqual({ count: 3 });
    expect(prisma.variantValue.deleteMany).toHaveBeenCalledWith({
      where: { variantTypeId: 1 },
    });
    expect(prisma.variantType.delete).not.toHaveBeenCalled();
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

  it('deletes a variant type together with all of its values', async () => {
    const deletedType = { id: 1, name: 'Color' };
    prisma.variantType.findUnique.mockResolvedValue({ id: 1 });
    prisma.variantValue.deleteMany.mockResolvedValue({ count: 2 });
    prisma.variantType.delete.mockResolvedValue(deletedType);

    await expect(service.removeType(1)).resolves.toBe(deletedType);
    expect(prisma.variantValue.deleteMany).toHaveBeenCalledWith({
      where: { variantTypeId: 1 },
    });
    expect(prisma.variantType.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });
});
