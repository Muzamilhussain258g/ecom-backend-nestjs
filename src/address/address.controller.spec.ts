import { Test, TestingModule } from '@nestjs/testing';
import { AddressType, UserRole } from 'generated/prisma/enums';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

describe('AddressController', () => {
  let controller: AddressController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 10,
    email: 'user@example.com',
    name: 'Jane Doe',
    role: UserRole.customer,
    createdAt: new Date(),
    updatedAt: new Date(),
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

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressController],
      providers: [
        {
          provide: AddressService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<AddressController>(AddressController);
    service = mockService;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should delegate address creation to service with user.id', async () => {
      const dto: CreateAddressDto = {
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
      service.create.mockResolvedValue(sampleAddress);

      const result = await controller.create(mockUser, dto);

      expect(service.create).toHaveBeenCalledWith(10, dto);
      expect(result).toEqual(sampleAddress);
    });
  });

  describe('findAll', () => {
    it('should delegate fetching address list to service with user.id', async () => {
      service.findAll.mockResolvedValue([sampleAddress]);

      const result = await controller.findAll(mockUser);

      expect(service.findAll).toHaveBeenCalledWith(10);
      expect(result).toEqual([sampleAddress]);
    });
  });

  describe('findById', () => {
    it('should delegate finding address by ID to service with user.id and id', async () => {
      service.findById.mockResolvedValue(sampleAddress);

      const result = await controller.findById(mockUser, 1);

      expect(service.findById).toHaveBeenCalledWith(10, 1);
      expect(result).toEqual(sampleAddress);
    });
  });

  describe('update', () => {
    it('should delegate address update to service with user.id, id, and dto', async () => {
      const dto: UpdateAddressDto = { phone: '+1-555-9999' };
      const updated = { ...sampleAddress, phone: '+1-555-9999' };
      service.update.mockResolvedValue(updated);

      const result = await controller.update(mockUser, 1, dto);

      expect(service.update).toHaveBeenCalledWith(10, 1, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should delegate address deletion to service with user.id and id', async () => {
      service.remove.mockResolvedValue({ id: 1 });

      const result = await controller.remove(mockUser, 1);

      expect(service.remove).toHaveBeenCalledWith(10, 1);
      expect(result).toEqual({ id: 1 });
    });
  });
});
