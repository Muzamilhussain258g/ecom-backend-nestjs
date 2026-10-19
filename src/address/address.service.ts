import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

export const addressSelect = {
  id: true,
  userId: true,
  label: true,
  fullName: true,
  phone: true,
  street: true,
  city: true,
  province: true,
  postalCode: true,
  country: true,
  isDefault: true,
  createdAt: true,
} satisfies Prisma.AddressSelect;

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({ where: { userId } });
      const isDefault = existingCount === 0 ? true : Boolean(dto.isDefault);

      if (isDefault && existingCount > 0) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          ...dto,
          userId,
          isDefault,
        },
        select: addressSelect,
      });
    });
  }

  async findAll(userId: number) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: addressSelect,
    });
  }

  async findById(userId: number, id: number) {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
      select: addressSelect,
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }

  async update(userId: number, id: number, dto: UpdateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({
        where: { id, userId },
        select: { id: true, isDefault: true },
      });

      if (!existing) {
        throw new NotFoundException('Address not found');
      }

      if (dto.isDefault === false && existing.isDefault) {
        const count = await tx.address.count({ where: { userId } });
        if (count > 1) {
          throw new BadRequestException(
            'Cannot unset default status on the default address while multiple addresses exist. Designate another address as default instead.',
          );
        } else {
          throw new BadRequestException(
            'The only saved address must remain the default address.',
          );
        }
      }

      if (dto.isDefault === true && !existing.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id },
        data: dto,
        select: addressSelect,
      });
    });
  }

  async remove(userId: number, id: number) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({
        where: { id, userId },
        select: { id: true, isDefault: true },
      });

      if (!existing) {
        throw new NotFoundException('Address not found');
      }

      await tx.address.delete({ where: { id } });

      if (existing.isDefault) {
        const remainingLatest = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });

        if (remainingLatest) {
          await tx.address.update({
            where: { id: remainingLatest.id },
            data: { isDefault: true },
          });
        }
      }

      return { id };
    });
  }
}
