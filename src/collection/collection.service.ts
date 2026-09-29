import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { MediaService } from '@/media/media.service';
import { CreateCollectionDto } from './dto/create-collection.dto';

const collectionInclude = {
  media: { include: { media: true } },
  products: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: { product: true },
  },
} satisfies Prisma.CollectionInclude;

@Injectable()
export class CollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  findAll() {
    return this.prisma.collection.findMany({
      where: { isActive: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: collectionInclude,
    });
  }

  async findOne(slug: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { slug },
      include: collectionInclude,
    });
    if (!collection) {
      throw new NotFoundException(`Collection with slug ${slug} not found`);
    }
    return collection;
  }

  async create(dto: CreateCollectionDto) {
    this.validateProductPositions(dto);
    await this.ensureProductsExist(
      dto.products.map(({ productId }) => productId),
    );
    const cover = dto.coverImage
      ? this.mediaService.toMediaCreateInput(dto.coverImage)
      : undefined;

    try {
      // Nested writes make collection, media and both join tables atomic.
      return await this.prisma.collection.create({
        data: {
          name: dto.name,
          slug: this.createSlug(dto.name),
          description: dto.description,
          isActive: dto.isActive,
          products: { create: dto.products },
          media:
            cover === undefined
              ? undefined
              : {
                  create: {
                    altText: dto.coverImage?.altText,
                    media: { create: cover },
                  },
                },
        },
        include: collectionInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Collection already exists');
      }
      throw error;
    }
  }

  private validateProductPositions(dto: CreateCollectionDto): void {
    const positions = dto.products.map(({ position }) => position);
    if (new Set(positions).size !== positions.length) {
      throw new BadRequestException(
        'Collection product positions must be unique',
      );
    }
  }

  private async ensureProductsExist(productIds: number[]): Promise<void> {
    const count = await this.prisma.product.count({
      where: { id: { in: productIds } },
    });
    if (count !== new Set(productIds).size) {
      throw new NotFoundException(
        'One or more collection products do not exist',
      );
    }
  }

  private createSlug(name: string): string {
    const slug = name
      .normalize('NFKD')
      .toLowerCase()
      .trim()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) throw new BadRequestException('Invalid collection name');
    return slug;
  }
}
