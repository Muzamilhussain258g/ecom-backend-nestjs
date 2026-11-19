import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { AdminFaqQueryDto, CreateFaqDto, UpdateFaqDto } from './dto/faq.dto';

@Injectable()
export class FaqService {
  constructor(private readonly prisma: PrismaService) {}

  private list(where: Prisma.FaqWhereInput) {
    return this.prisma.faq.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  findWebsite() {
    return this.list({ productId: null, isActive: true });
  }

  async findProduct(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, productStatus: true },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.list({ productId: product.id, isActive: true });
  }

  findAdmin(query: AdminFaqQueryDto) {
    if (query.scope === 'website' && query.productId !== undefined) {
      throw new BadRequestException(
        'productId cannot be combined with website scope',
      );
    }
    return this.list({
      productId:
        query.productId ??
        (query.scope === 'website'
          ? null
          : query.scope === 'product'
            ? { not: null }
            : undefined),
      isActive: query.isActive,
    });
  }

  async create(dto: CreateFaqDto) {
    if (dto.productId != null) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { id: true },
      });
      if (!product) throw new NotFoundException('Product not found');
    }
    try {
      return await this.prisma.faq.create({
        data: {
          question: dto.question,
          answer: dto.answer,
          productId: dto.productId ?? null,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateFaqDto) {
    try {
      return await this.prisma.faq.update({
        where: { id },
        data: {
          question: dto.question,
          answer: dto.answer,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  async remove(id: number) {
    try {
      return await this.prisma.faq.delete({ where: { id } });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  private rethrowMissing(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('FAQ not found');
    }
    throw error;
  }
}
