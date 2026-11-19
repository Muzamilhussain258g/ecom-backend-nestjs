import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'prisma/prisma.service';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { ChatService } from './chat.service';
import { ChatRateService } from './chat-rate.service';

export const CHAT_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
export const CHAT_VIDEO_FORMATS = ['mp4', 'webm'];
interface VerifiedChatResource {
  public_id: string;
  resource_type: string;
  type: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  duration?: number;
}
export function validateChatResource(
  input: unknown,
  resourceType: string,
  publicId: string,
): asserts input is VerifiedChatResource {
  if (!input || typeof input !== 'object')
    throw new BadRequestException('Missing media metadata');
  const resource = input as Record<string, unknown>;
  const maxBytes = (resourceType === 'image' ? 5 : 20) * 1024 * 1024;
  const formats =
    resourceType === 'image' ? CHAT_IMAGE_FORMATS : CHAT_VIDEO_FORMATS;
  if (
    resource.public_id !== publicId ||
    resource.resource_type !== resourceType ||
    resource.type !== 'authenticated' ||
    typeof resource.format !== 'string' ||
    !formats.includes(resource.format) ||
    typeof resource.bytes !== 'number' ||
    !Number.isInteger(resource.bytes) ||
    resource.bytes <= 0 ||
    resource.bytes > maxBytes ||
    typeof resource.width !== 'number' ||
    !Number.isInteger(resource.width) ||
    resource.width <= 0 ||
    typeof resource.height !== 'number' ||
    !Number.isInteger(resource.height) ||
    resource.height <= 0 ||
    (resourceType === 'video' &&
      (typeof resource.duration !== 'number' ||
        !Number.isFinite(resource.duration) ||
        resource.duration <= 0 ||
        resource.duration > 30))
  ) {
    throw new BadRequestException(
      'Invalid chat media: images must be <=5 MB; videos must be <=20 MB and <=30 seconds',
    );
  }
}

@Injectable()
export class ChatMediaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatMediaService.name);
  private timer?: ReturnType<typeof setInterval>;
  private cleaning = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly chat: ChatService,
    private readonly rates: ChatRateService,
  ) {}

  private credentials() {
    return {
      cloud_name: this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
    };
  }

  async reserve(
    user: AuthenticatedUser,
    conversationId: number,
    resourceType: 'image' | 'video',
  ) {
    await this.chat.authorize(user, conversationId);
    this.rates.consume(user.id, 'upload');
    const credentials = this.credentials();
    const id = randomUUID();
    const publicId = `chat/${conversationId}/${user.id}/${id}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      timestamp,
      public_id: publicId,
      type: 'authenticated',
      overwrite: false,
      allowed_formats: (resourceType === 'image'
        ? CHAT_IMAGE_FORMATS
        : CHAT_VIDEO_FORMATS
      ).join(','),
    };
    await this.prisma.chatAttachment.create({
      data: { id, conversationId, uploaderId: user.id, publicId, resourceType },
    });
    return {
      uploadId: id,
      uploadUrl: `https://api.cloudinary.com/v1_1/${credentials.cloud_name}/${resourceType}/upload`,
      fields: {
        ...params,
        api_key: credentials.api_key,
        signature: cloudinary.utils.api_sign_request(
          params,
          credentials.api_secret,
        ),
      },
      maxBytes: (resourceType === 'image' ? 5 : 20) * 1024 * 1024,
      maxDuration: resourceType === 'video' ? 30 : null,
    };
  }

  async complete(user: AuthenticatedUser, conversationId: number, id: string) {
    await this.chat.authorize(user, conversationId);
    const upload = await this.prisma.chatAttachment.findUnique({
      where: { id },
    });
    if (
      !upload ||
      upload.uploaderId !== user.id ||
      upload.conversationId !== conversationId
    )
      throw new NotFoundException('Upload not found');
    if (upload.status === 'ready' || upload.status === 'attached')
      return this.metadata(upload);
    if (
      upload.status !== 'pending' ||
      upload.createdAt.getTime() <= Date.now() - 24 * 3600_000
    )
      throw new ConflictException('Upload expired or unavailable');
    let resource: unknown;
    try {
      resource = await cloudinary.api.resource(upload.publicId, {
        ...this.credentials(),
        resource_type: upload.resourceType,
        type: 'authenticated',
      });
    } catch {
      throw new ServiceUnavailableException(
        'Upload could not be verified; retry after upload completes',
      );
    }
    try {
      validateChatResource(resource, upload.resourceType, upload.publicId);
    } catch (error) {
      await this.prisma.chatAttachment.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'rejected' },
      });
      throw error;
    }
    const updated = await this.prisma.chatAttachment.updateMany({
      where: { id, status: 'pending', messageId: null },
      data: {
        status: 'ready',
        format: resource.format,
        bytes: resource.bytes,
        width: resource.width,
        height: resource.height,
        duration: upload.resourceType === 'video' ? resource.duration : null,
      },
    });
    if (!updated.count) {
      const current = await this.prisma.chatAttachment.findUniqueOrThrow({
        where: { id },
      });
      if (current.status === 'ready' || current.status === 'attached')
        return this.metadata(current);
      throw new ConflictException('Upload is no longer available');
    }
    return this.metadata(
      await this.prisma.chatAttachment.findUniqueOrThrow({ where: { id } }),
    );
  }

  private metadata(upload: {
    id: string;
    resourceType: string;
    format: string | null;
    bytes: number | null;
    width: number | null;
    height: number | null;
    duration: number | null;
  }) {
    return {
      id: upload.id,
      resourceType: upload.resourceType,
      format: upload.format,
      bytes: upload.bytes,
      width: upload.width,
      height: upload.height,
      duration: upload.duration,
    };
  }

  async access(user: AuthenticatedUser, id: string) {
    const attachment = await this.prisma.chatAttachment.findUnique({
      where: { id },
    });
    if (
      !attachment ||
      attachment.status !== 'attached' ||
      !attachment.messageId ||
      !attachment.format
    )
      throw new NotFoundException('Attachment not found');
    await this.chat.authorize(user, attachment.conversationId);
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const url = cloudinary.utils.private_download_url(
      attachment.publicId,
      attachment.format,
      {
        ...this.credentials(),
        resource_type: attachment.resourceType,
        type: 'authenticated',
        expires_at: expiresAt,
        attachment: false,
      },
    );
    return { url, expiresAt: new Date(expiresAt * 1000).toISOString() };
  }

  onModuleInit() {
    this.timer = setInterval(
      () =>
        void this.cleanup().catch(() =>
          this.logger.error('Chat upload cleanup failed; will retry'),
        ),
      3600_000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const uploads = await this.prisma.chatAttachment.findMany({
        where: {
          messageId: null,
          status: { in: ['pending', 'ready', 'rejected', 'deleting'] },
          createdAt: { lt: new Date(Date.now() - 24 * 3600_000) },
        },
        take: 200,
        orderBy: { createdAt: 'asc' },
      });
      for (const upload of uploads) {
        // Claim before provider deletion so send/complete cannot race cleanup.
        const claimed = await this.prisma.chatAttachment.updateMany({
          where: {
            id: upload.id,
            messageId: null,
            status: { in: ['pending', 'ready', 'rejected', 'deleting'] },
          },
          data: { status: 'deleting' },
        });
        if (!claimed.count) continue;
        try {
          // Resource type is not signed by Cloudinary; remove both possible upload endpoints.
          for (const resourceType of ['image', 'video']) {
            const result: unknown = await cloudinary.uploader.destroy(
              upload.publicId,
              {
                ...this.credentials(),
                resource_type: resourceType,
                type: 'authenticated',
                invalidate: true,
              },
            );
            if (
              !result ||
              typeof result !== 'object' ||
              !('result' in result) ||
              typeof result.result !== 'string' ||
              !['ok', 'not found'].includes(result.result)
            )
              throw new Error('Provider deletion failed');
          }
          await this.prisma.chatAttachment.deleteMany({
            where: { id: upload.id, status: 'deleting', messageId: null },
          });
        } catch {
          this.logger.warn(`Chat attachment cleanup will retry: ${upload.id}`);
        }
      }
    } finally {
      this.cleaning = false;
    }
  }
}
