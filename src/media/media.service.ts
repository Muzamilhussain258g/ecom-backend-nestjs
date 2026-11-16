import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Prisma } from 'generated/prisma/client';
import { UserRole } from 'generated/prisma/enums';
import { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { MediaPurpose } from './dto/create-upload-signature.dto';
import { UploadedMediaDto } from './dto/uploaded-media.dto';
import { PrismaService } from 'prisma/prisma.service';

export interface VerifiedMediaResource {
  providerAssetId?: string;
  providerPublicId: string;
  url: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
}

export const ALLOWED_MEDIA_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // 5 MB
export const MIN_MEDIA_DIMENSION = 10;

@Injectable()
export class MediaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private ensureCloudinaryConfig() {
    cloudinary.config({
      cloud_name: this.configService.getOrThrow<string>(
        'CLOUDINARY_CLOUD_NAME',
      ),
      api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_SECRET',
      ),
    });
  }

  createUploadSignature(purpose: MediaPurpose, user?: AuthenticatedUser) {
    const cloudName = this.configService.getOrThrow<string>(
      'CLOUDINARY_CLOUD_NAME',
    );
    const apiKey = this.configService.getOrThrow<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.getOrThrow<string>(
      'CLOUDINARY_API_SECRET',
    );
    const timestamp = Math.floor(Date.now() / 1000);

    const folder =
      purpose === MediaPurpose.product && user
        ? `products/seller_${user.id}`
        : undefined;

    const uploadParams: Record<string, string | number> = {
      timestamp,
      ...(folder ? { folder } : {}),
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
      ...(folder ? { folder } : {}),
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    };
  }

  async verifyMediaBatch(
    publicIds: string[],
    user?: AuthenticatedUser,
  ): Promise<Map<string, VerifiedMediaResource>> {
    if (!publicIds.length) {
      return new Map();
    }

    this.ensureCloudinaryConfig();

    let response: {
      resources?: Array<{
        asset_id?: string;
        public_id: string;
        format?: string;
        bytes?: number;
        width?: number;
        height?: number;
        resource_type?: string;
        type?: string;
        secure_url?: string;
        url?: string;
      }>;
    };

    try {
      response = (await cloudinary.api.resources_by_ids(publicIds, {
        resource_type: 'image',
        type: 'upload',
      })) as { resources?: Array<any> };
    } catch (err: unknown) {
      throw new BadRequestException(
        `Failed to verify media resources with Cloudinary: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }

    const resources = response?.resources ?? [];
    const resourceMap = new Map<string, (typeof resources)[0]>();
    for (const res of resources) {
      resourceMap.set(res.public_id, res);
    }

    const missingIds = publicIds.filter((id) => !resourceMap.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Invalid or non-existent media public IDs: ${missingIds.join(', ')}`,
      );
    }

    const verifiedMap = new Map<string, VerifiedMediaResource>();

    for (const publicId of publicIds) {
      const res = resourceMap.get(publicId)!;

      if (res.resource_type !== 'image') {
        throw new BadRequestException(
          `Media '${publicId}' must be of resource_type 'image', received '${res.resource_type}'`,
        );
      }

      if (res.type !== 'upload') {
        throw new BadRequestException(
          `Media '${publicId}' must be of type 'upload', received '${res.type}'`,
        );
      }

      const format = res.format?.toLowerCase() ?? '';
      if (!ALLOWED_MEDIA_FORMATS.includes(format)) {
        throw new BadRequestException(
          `Media '${publicId}' has unsupported format '${format}'. Allowed formats: ${ALLOWED_MEDIA_FORMATS.join(', ')}`,
        );
      }

      if (res.bytes !== undefined && res.bytes > MAX_MEDIA_BYTES) {
        throw new BadRequestException(
          `Media '${publicId}' exceeds maximum allowed size of 5MB (${res.bytes} bytes)`,
        );
      }

      if (
        (res.width !== undefined && res.width < MIN_MEDIA_DIMENSION) ||
        (res.height !== undefined && res.height < MIN_MEDIA_DIMENSION)
      ) {
        throw new BadRequestException(
          `Media '${publicId}' dimensions must be at least ${MIN_MEDIA_DIMENSION}x${MIN_MEDIA_DIMENSION}`,
        );
      }

      if (
        user &&
        user.role === UserRole.seller &&
        !publicId.startsWith(`products/seller_${user.id}/`)
      ) {
        throw new ForbiddenException(
          `You do not own media asset '${publicId}'. Public ID must start with 'products/seller_${user.id}/'`,
        );
      }

      const cloudName = this.configService.getOrThrow<string>(
        'CLOUDINARY_CLOUD_NAME',
      );
      const url =
        res.secure_url ||
        res.url ||
        cloudinary.url(publicId, {
          cloud_name: cloudName,
          format,
          resource_type: 'image',
          secure: true,
        });

      verifiedMap.set(publicId, {
        providerAssetId: res.asset_id,
        providerPublicId: publicId,
        url,
        format,
        bytes: res.bytes ?? 0,
        width: res.width ?? 0,
        height: res.height ?? 0,
      });
    }

    return verifiedMap;
  }

  async deleteResources(publicIds: string[]): Promise<void> {
    if (!publicIds.length) return;
    this.ensureCloudinaryConfig();
    try {
      await cloudinary.api.delete_resources(publicIds, {
        resource_type: 'image',
        invalidate: true,
      });
    } catch {
      // Best-effort cleanup: do not throw to caller
    }
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
