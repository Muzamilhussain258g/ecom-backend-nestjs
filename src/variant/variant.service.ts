import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateVariantTypeDto } from './dto/create-variant-type.dto';
import { CreateVariantValueDto } from './dto/create-variant-value.dto';
import { UpdateVariantTypeDto } from './dto/update-variant-type.dto';
import { UpdateVariantValueDto } from './dto/update-variant-value.dto';

const variantTypeInclude = {
  values: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.VariantTypeInclude;

@Injectable()
export class VariantService {
  constructor(private readonly prisma: PrismaService) {}

  findAllTypes() {
    return this.prisma.variantType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: variantTypeInclude,
    });
  }

  findAllValues() {
    return this.prisma.variantValue.findMany({
      orderBy: [
        { variantType: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { id: 'asc' },
      ],
      include: { variantType: true },
    });
  }

  async findValuesByType(variantTypeId: number) {
    await this.ensureTypeExists(variantTypeId);

    return this.prisma.variantValue.findMany({
      where: { variantTypeId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { variantType: true },
    });
  }

  async removeValuesByType(variantTypeId: number) {
    await this.ensureTypeExists(variantTypeId);

    try {
      return await this.prisma.variantValue.deleteMany({
        where: { variantTypeId },
      });
    } catch (error) {
      this.handleWriteError(error, 'One or more variant values are in use');
    }
  }

  async createType(dto: CreateVariantTypeDto) {
    const slug = this.createSlug(dto.name);

    try {
      return await this.prisma.variantType.create({
        data: { name: dto.name, slug, sortOrder: dto.sortOrder },
        include: variantTypeInclude,
      });
    } catch (error) {
      this.handleWriteError(error, 'A variant type with this name exists');
    }
  }

  async updateType(id: number, dto: UpdateVariantTypeDto) {
    if (dto.name === undefined && dto.sortOrder === undefined) {
      throw new BadRequestException('Provide at least one field to update');
    }

    await this.ensureTypeExists(id);

    try {
      return await this.prisma.variantType.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.name === undefined ? undefined : this.createSlug(dto.name),
          sortOrder: dto.sortOrder,
        },
        include: variantTypeInclude,
      });
    } catch (error) {
      this.handleWriteError(error, 'A variant type with this name exists');
    }
  }

  async removeType(id: number) {
    await this.ensureTypeExists(id);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.variantValue.deleteMany({
          where: { variantTypeId: id },
        });

        return transaction.variantType.delete({ where: { id } });
      });
    } catch (error) {
      this.handleWriteError(error, 'Variant type is currently in use');
    }
  }

  async createValue(variantTypeId: number, dto: CreateVariantValueDto) {
    await this.ensureTypeExists(variantTypeId);

    try {
      return await this.prisma.variantValue.create({
        data: {
          variantTypeId,
          value: dto.value,
          code: dto.code,
          metadata: dto.metadata,
          sortOrder: dto.sortOrder,
        },
        include: { variantType: true },
      });
    } catch (error) {
      this.handleWriteError(
        error,
        'A value with this code already exists for the variant type',
      );
    }
  }

  async updateValue(id: number, dto: UpdateVariantValueDto) {
    if (
      dto.value === undefined &&
      dto.code === undefined &&
      dto.metadata === undefined &&
      dto.sortOrder === undefined
    ) {
      throw new BadRequestException('Provide at least one field to update');
    }

    await this.ensureValueExists(id);

    try {
      return await this.prisma.variantValue.update({
        where: { id },
        data: {
          value: dto.value,
          code: dto.code,
          metadata: dto.metadata,
          sortOrder: dto.sortOrder,
        },
        include: { variantType: true },
      });
    } catch (error) {
      this.handleWriteError(
        error,
        'A value with this code already exists for the variant type',
      );
    }
  }

  async removeValue(id: number) {
    await this.ensureValueExists(id);

    try {
      return await this.prisma.variantValue.delete({ where: { id } });
    } catch (error) {
      this.handleWriteError(error, 'Variant value is currently in use');
    }
  }

  private async ensureTypeExists(id: number) {
    const type = await this.prisma.variantType.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!type)
      throw new NotFoundException(`Variant type with id ${id} not found`);
  }

  private async ensureValueExists(id: number) {
    const value = await this.prisma.variantValue.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!value) {
      throw new NotFoundException(`Variant value with id ${id} not found`);
    }
  }

  private createSlug(value: string): string {
    const slug = value
      .normalize('NFKD')
      .toLowerCase()
      .trim()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug)
      throw new BadRequestException('Name must contain a letter or number');
    return slug;
  }

  private handleWriteError(error: unknown, conflictMessage: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException(conflictMessage);
      if (error.code === 'P2003') {
        throw new ConflictException(
          'Variant type or value is currently in use',
        );
      }
      if (error.code === 'P2025')
        throw new NotFoundException('Variant record not found');
    }
    throw error;
  }
}
