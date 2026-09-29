import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { Prisma } from 'generated/prisma/client';
import { MediaPurpose } from './dto/create-upload-signature.dto';
import { UploadedMediaDto } from './dto/uploaded-media.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class MediaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  createUploadSignature(purpose: MediaPurpose) {
    const cloudName = this.configService.getOrThrow<string>(
      'CLOUDINARY_CLOUD_NAME',
    );
    const apiKey = this.configService.getOrThrow<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.getOrThrow<string>(
      'CLOUDINARY_API_SECRET',
    );
    const rootFolder =
      this.configService.get<string>('CLOUDINARY_UPLOAD_FOLDER') ?? 'ecommerce';
    const folder = `${rootFolder}/${purpose}`;
    const timestamp = Math.floor(Date.now() / 1000);
    // The backend owns the public ID so a client cannot overwrite another asset.
    const publicId = randomUUID();
    const uploadParams = {
      allowed_formats: 'jpg,jpeg,png,webp,avif',
      folder,
      overwrite: false,
      public_id: publicId,
      timestamp,
    };

    const signature = cloudinary.utils.api_sign_request(
      uploadParams,
      apiSecret,
    );

    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      uploadParams,
    };
  }

  /**
   * Verifies that the payload came from Cloudinary, then converts it into the
   * only Media fields entity services are allowed to persist.
   */
  toMediaCreateInput(
    upload: UploadedMediaDto,
  ): Prisma.MediaCreateWithoutProductsInput {
    const apiSecret = this.configService.getOrThrow<string>(
      'CLOUDINARY_API_SECRET',
    );
    const expectedSignature = cloudinary.utils.api_sign_request(
      { public_id: upload.providerPublicId, version: upload.version },
      apiSecret,
    );

    if (expectedSignature !== upload.signature) {
      throw new BadRequestException('Invalid Cloudinary upload signature');
    }

    const cloudName = this.configService.getOrThrow<string>(
      'CLOUDINARY_CLOUD_NAME',
    );
    const url = cloudinary.url(upload.providerPublicId, {
      cloud_name: cloudName,
      format: upload.format,
      resource_type: 'image',
      secure: true,
      version: upload.version,
    });

    return {
      providerAssetId: upload.providerAssetId,
      providerPublicId: upload.providerPublicId,
      url,
      format: upload.format,
      bytes: upload.bytes,
      width: upload.width,
      height: upload.height,
    };
  }

  async remove(id: number) {
    const media = await this.prisma.media.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true, categories: true, collections: true },
        },
      },
    });
    if (!media) throw new NotFoundException(`Media with id ${id} not found`);

    const references =
      media._count.products +
      media._count.categories +
      media._count.collections;
    if (references > 0) {
      throw new ConflictException(
        'Detach media from all entities before deleting it',
      );
    }

    cloudinary.config({
      cloud_name: this.configService.getOrThrow<string>(
        'CLOUDINARY_CLOUD_NAME',
      ),
      api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_SECRET',
      ),
    });
    // invalidate removes already-cached CDN copies as well as the source asset.
    // Cloudinary currently declares destroy as Promise<any>; keep that unsafe
    // SDK boundary isolated and validate the response before using it.
    const result: unknown = await cloudinary.uploader.destroy(
      media.providerPublicId,
      {
        invalidate: true,
        resource_type: 'image',
      },
    );
    if (
      typeof result !== 'object' ||
      result === null ||
      !('result' in result) ||
      typeof result.result !== 'string' ||
      !['ok', 'not found'].includes(result.result)
    ) {
      throw new ConflictException('Cloudinary could not delete the media');
    }

    return this.prisma.media.delete({ where: { id } });
  }
}
