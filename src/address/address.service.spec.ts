import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AddressType } from 'generated/prisma/enums';
import { PrismaService } from 'prisma/prisma.service';
import { AddressService, addressSelect } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';

describe('AddressService', () => {
  let service: AddressService;
  let prisma: {
    $transaction: jest.Mock;
    address: {
      count: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
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
    createdAt: new Date('2026-10-16T12:00:00.000Z'),
  };

  const sampleCreateDto: CreateAddressDto = {
    label: AddressType.home,
    fullName: 'Jane Doe',
    phone: '+1-555-0101',
    street: '100 Main St',
    city: 'Springfield',
    province: 'IL',
    postalCode: '62701',
    country: 'United States',
    isDefault: false,
  };

  beforeEach(async () => {
    const mockAddressRepo = {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    };

    const mockPrisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof mockAddressRepo) => Promise<unknown>) =>
          callback({
            ...mockAddressRepo,
            address: mockAddressRepo,
          } as unknown as typeof mockAddressRepo),
      ),
      address: mockAddressRepo,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AddressService>(AddressService);
    prisma = mockPrisma as unknown as typeof prisma;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create (US1)', () => {
    it('should set isDefault to true when creating the first address for a user', async () => {
      prisma.address.count.mockResolvedValue(0);
      prisma.address.create.mockResolvedValue({
        ...sampleAddress,
        isDefault: true,
      });

      const result = await service.create(10, {
        ...sampleCreateDto,
        isDefault: false,
      });

      expect(prisma.address.count).toHaveBeenCalledWith({ where: { userId: 10 } });
      expect(prisma.address.create).toHaveBeenCalledWith({
        data: {
          ...sampleCreateDto,
          userId: 10,
          isDefault: true,
        },
        select: addressSelect,
      });
      expect(result.isDefault).toBe(true);
    });

    it('should maintain isDefault as false when user already has addresses and does not request default', async () => {
      prisma.address.count.mockResolvedValue(2);
      prisma.address.create.mockResolvedValue({
        ...sampleAddress,
        id: 2,
        isDefault: false,
      });

      const result = await service.create(10, {
        ...sampleCreateDto,
        isDefault: false,
      });

      expect(prisma.address.count).toHaveBeenCalledWith({ where: { userId: 10 } });
      expect(prisma.address.updateMany).not.toHaveBeenCalled();
      expect(prisma.address.create).toHaveBeenCalledWith({
        data: {
          ...sampleCreateDto,
          userId: 10,
          isDefault: false,
        },
        select: addressSelect,
      });
      expect(result.isDefault).toBe(false);
    });

    it('should demote existing default addresses when creating a new address marked as default', async () => {
      prisma.address.count.mockResolvedValue(1);
      prisma.address.updateMany.mockResolvedValue({ count: 1 });
      prisma.address.create.mockResolvedValue({
        ...sampleAddress,
        id: 3,
        isDefault: true,
      });

      const result = await service.create(10, {
        ...sampleCreateDto,
        isDefault: true,
      });

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 10, isDefault: true },
        data: { isDefault: false },
      });
      expect(prisma.address.create).toHaveBeenCalledWith({
        data: {
          ...sampleCreateDto,
          userId: 10,
          isDefault: true,
        },
        select: addressSelect,
      });
      expect(result.isDefault).toBe(true);
    });
  });

  describe('findAll (US2)', () => {
    it('should return all addresses belonging to the user ordered by createdAt descending', async () => {
      const addresses = [sampleAddress, { ...sampleAddress, id: 2, isDefault: false }];
      prisma.address.findMany.mockResolvedValue(addresses);

      const result = await service.findAll(10);

      expect(prisma.address.findMany).toHaveBeenCalledWith({
        where: { userId: 10 },
        orderBy: { createdAt: 'desc' },
        select: addressSelect,
      });
      expect(result).toEqual(addresses);
    });
  });

  describe('findById (US2)', () => {
    it('should return the address when owned by the authenticated user', async () => {
      prisma.address.findFirst.mockResolvedValue(sampleAddress);

      const result = await service.findById(10, 1);

      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: 10 },
        select: addressSelect,
      });
      expect(result).toEqual(sampleAddress);
    });

    it('should throw NotFoundException when address does not exist or belongs to another user', async () => {
      prisma.address.findFirst.mockResolvedValue(null);

      await expect(service.findById(10, 999)).rejects.toThrow(
        new NotFoundException('Address not found'),
      );

      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { id: 999, userId: 10 },
        select: addressSelect,
      });
    });
  });

  describe('update (US3)', () => {
    it('should update fields on an owned address', async () => {
      prisma.address.findFirst.mockResolvedValue({ id: 1, isDefault: false });
      prisma.address.update.mockResolvedValue({
        ...sampleAddress,
        phone: '+1-555-9999',
      });

      const result = await service.update(10, 1, { phone: '+1-555-9999' });

      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { phone: '+1-555-9999' },
        select: addressSelect,
      });
      expect(result.phone).toBe('+1-555-9999');
    });

    it('should demote existing default when promoting another address to default', async () => {
      prisma.address.findFirst.mockResolvedValue({ id: 2, isDefault: false });
      prisma.address.updateMany.mockResolvedValue({ count: 1 });
      prisma.address.update.mockResolvedValue({
        ...sampleAddress,
        id: 2,
        isDefault: true,
      });

      const result = await service.update(10, 2, { isDefault: true });

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 10, isDefault: true },
        data: { isDefault: false },
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { isDefault: true },
        select: addressSelect,
      });
      expect(result.isDefault).toBe(true);
    });

    it('should throw BadRequestException when unsetting default on default address with multiple addresses', async () => {
      prisma.address.findFirst.mockResolvedValue({ id: 1, isDefault: true });
      prisma.address.count.mockResolvedValue(3);

      await expect(service.update(10, 1, { isDefault: false })).rejects.toThrow(
        new BadRequestException(
          'Cannot unset default status on the default address while multiple addresses exist. Designate another address as default instead.',
        ),
      );
    });

    it('should throw BadRequestException when unsetting default on the only saved address', async () => {
      prisma.address.findFirst.mockResolvedValue({ id: 1, isDefault: true });
      prisma.address.count.mockResolvedValue(1);

      await expect(service.update(10, 1, { isDefault: false })).rejects.toThrow(
        new BadRequestException(
          'The only saved address must remain the default address.',
        ),
      );
    });

    it('should throw NotFoundException when updating an unowned address', async () => {
      prisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.update(10, 999, { phone: '+1-555-0000' }),
      ).rejects.toThrow(new NotFoundException('Address not found'));
    });
  });

  describe('remove (US4)', () => {
    it('should delete non-default address without auto-promoting remaining addresses', async () => {
      prisma.address.findFirst.mockResolvedValue({ id: 2, isDefault: false });
      prisma.address.delete.mockResolvedValue({ id: 2 });

      const result = await service.remove(10, 2);

      expect(prisma.address.delete).toHaveBeenCalledWith({ where: { id: 2 } });
      expect(result).toEqual({ id: 2 });
    });

    it('should auto-promote the latest remaining address when the default address is deleted', async () => {
      prisma.address.findFirst
        .mockResolvedValueOnce({ id: 1, isDefault: true }) // lookup existing
        .mockResolvedValueOnce({ id: 3 }); // lookup latest remaining
      prisma.address.delete.mockResolvedValue({ id: 1 });
      prisma.address.update.mockResolvedValue({ id: 3, isDefault: true });

      const result = await service.remove(10, 1);

      expect(prisma.address.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(prisma.address.findFirst).toHaveBeenNthCalledWith(2, {
        where: { userId: 10 },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { isDefault: true },
      });
      expect(result).toEqual({ id: 1 });
    });

    it('should delete cleanly when deleting the only saved address (0 remaining)', async () => {
      prisma.address.findFirst
        .mockResolvedValueOnce({ id: 1, isDefault: true })
        .mockResolvedValueOnce(null); // no remaining
      prisma.address.delete.mockResolvedValue({ id: 1 });

      const result = await service.remove(10, 1);

      expect(prisma.address.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(prisma.address.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 1 });
    });

    it('should throw NotFoundException when deleting an unowned address', async () => {
      prisma.address.findFirst.mockResolvedValue(null);

      await expect(service.remove(10, 999)).rejects.toThrow(
        new NotFoundException('Address not found'),
      );
    });
  });
});
