import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { UserRole } from 'generated/prisma/enums';
import { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { MediaService } from './media.service';
import { MediaPurpose } from './dto/create-upload-signature.dto';
import { PrismaService } from 'prisma/prisma.service';

describe('MediaService', () => {
  const values: Record<string, string> = {
    CLOUDINARY_CLOUD_NAME: 'demo-cloud',
    CLOUDINARY_API_KEY: 'demo-key',
    CLOUDINARY_API_SECRET: 'demo-secret',
  };
  let configService: ConfigService;
  let service: MediaService;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    service = new MediaService(
      configService,
      {} as unknown as PrismaService,
    );
  });

  it('returns a signed payload without exposing the API secret', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const result = service.createUploadSignature(MediaPurpose.product);

    expect(result).toEqual({
      signature: cloudinary.utils.api_sign_request(
        { timestamp: 1_700_000_000 },
        'demo-secret',
      ),
      timestamp: 1_700_000_000,
      apiKey: 'demo-key',
      cloudName: 'demo-cloud',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
    });
    expect(result).not.toHaveProperty('apiSecret');

    nowSpy.mockRestore();
  });

  it('forces seller folder in upload signature when seller user is provided', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const sellerUser = {
      id: 42,
      role: UserRole.seller,
    } as AuthenticatedUser;

    const result = service.createUploadSignature(MediaPurpose.product, sellerUser);

    expect(result).toEqual({
      signature: cloudinary.utils.api_sign_request(
        { timestamp: 1_700_000_000, folder: 'products/seller_42' },
        'demo-secret',
      ),
      timestamp: 1_700_000_000,
      apiKey: 'demo-key',
      cloudName: 'demo-cloud',
      folder: 'products/seller_42',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
    });

    nowSpy.mockRestore();
  });

  describe('verifyMediaBatch', () => {
    const sellerUser = {
      id: 10,
      role: UserRole.seller,
    } as AuthenticatedUser;

    it('verifies a batch of media in a single Cloudinary call and returns metadata map', async () => {
      const publicIds = ['products/seller_10/img1', 'products/seller_10/img2'];
      const resourcesSpy = jest
        .spyOn(cloudinary.api, 'resources_by_ids')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({
          resources: [
            {
              asset_id: 'asset-1',
              public_id: 'products/seller_10/img1',
              format: 'webp',
              bytes: 1024,
              width: 500,
              height: 500,
              resource_type: 'image',
              type: 'upload',
              secure_url: 'https://res.cloudinary.com/demo/image/upload/img1.webp',
            },
            {
              asset_id: 'asset-2',
              public_id: 'products/seller_10/img2',
              format: 'jpg',
              bytes: 2048,
              width: 600,
              height: 600,
              resource_type: 'image',
              type: 'upload',
              secure_url: 'https://res.cloudinary.com/demo/image/upload/img2.jpg',
            },
          ],
        } as never);

      const result = await service.verifyMediaBatch(publicIds, sellerUser);

      expect(resourcesSpy).toHaveBeenCalledTimes(1);
      expect(resourcesSpy).toHaveBeenCalledWith(publicIds, {
        resource_type: 'image',
        type: 'upload',
      });
      expect(result.size).toBe(2);
      expect(result.get('products/seller_10/img1')).toEqual({
        providerAssetId: 'asset-1',
        providerPublicId: 'products/seller_10/img1',
        url: 'https://res.cloudinary.com/demo/image/upload/img1.webp',
        format: 'webp',
        bytes: 1024,
        width: 500,
        height: 500,
      });

      resourcesSpy.mockRestore();
    });

    it('throws BadRequestException if any public ID is missing from Cloudinary', async () => {
      const resourcesSpy = jest
        .spyOn(cloudinary.api, 'resources_by_ids')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({
          resources: [
            {
              public_id: 'products/seller_10/img1',
              format: 'webp',
              bytes: 100,
              width: 100,
              height: 100,
              resource_type: 'image',
              type: 'upload',
            },
          ],
        } as never);

      await expect(
        service.verifyMediaBatch(
          ['products/seller_10/img1', 'products/seller_10/missing-id'],
          sellerUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      resourcesSpy.mockRestore();
    });

    it('rejects media that is not an image', async () => {
      const resourcesSpy = jest
        .spyOn(cloudinary.api, 'resources_by_ids')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({
          resources: [
            {
              public_id: 'products/seller_10/video1',
              format: 'mp4',
              bytes: 100,
              width: 100,
              height: 100,
              resource_type: 'video',
              type: 'upload',
            },
          ],
        } as never);

      await expect(
        service.verifyMediaBatch(['products/seller_10/video1'], sellerUser),
      ).rejects.toThrow("must be of resource_type 'image'");

      resourcesSpy.mockRestore();
    });

    it('rejects media that is not upload type (e.g. private)', async () => {
      const resourcesSpy = jest
        .spyOn(cloudinary.api, 'resources_by_ids')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({
          resources: [
            {
              public_id: 'products/seller_10/priv1',
              format: 'jpg',
              bytes: 100,
              width: 100,
              height: 100,
              resource_type: 'image',
              type: 'private',
            },
          ],
        } as never);

      await expect(
        service.verifyMediaBatch(['products/seller_10/priv1'], sellerUser),
      ).rejects.toThrow("must be of type 'upload'");

      resourcesSpy.mockRestore();
    });

    it('rejects media exceeding 5MB limit', async () => {
      const resourcesSpy = jest
        .spyOn(cloudinary.api, 'resources_by_ids')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({
          resources: [
            {
              public_id: 'products/seller_10/huge',
              format: 'jpg',
              bytes: 6 * 1024 * 1024,
              width: 500,
              height: 500,
              resource_type: 'image',
              type: 'upload',
            },
          ],
        } as never);

      await expect(
        service.verifyMediaBatch(['products/seller_10/huge'], sellerUser),
      ).rejects.toThrow('exceeds maximum allowed size of 5MB');

      resourcesSpy.mockRestore();
    });

    it('rejects media belonging to another seller with ForbiddenException', async () => {
      const otherSellerMedia = 'products/seller_999/stolen-img';
      const resourcesSpy = jest
        .spyOn(cloudinary.api, 'resources_by_ids')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({
          resources: [
            {
              public_id: otherSellerMedia,
              format: 'jpg',
              bytes: 100,
              width: 100,
              height: 100,
              resource_type: 'image',
              type: 'upload',
            },
          ],
        } as never);

      await expect(
        service.verifyMediaBatch([otherSellerMedia], sellerUser),
      ).rejects.toBeInstanceOf(ForbiddenException);

      resourcesSpy.mockRestore();
    });
  });

  describe('deleteResources', () => {
    it('calls cloudinary.api.delete_resources with publicIds', async () => {
      const deleteSpy = jest
        .spyOn(cloudinary.api, 'delete_resources')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({ deleted: { 'products/seller_1/file1': 'deleted' } } as never);

      await service.deleteResources(['products/seller_1/file1']);

      expect(deleteSpy).toHaveBeenCalledWith(['products/seller_1/file1'], {
        resource_type: 'image',
        invalidate: true,
      });

      deleteSpy.mockRestore();
    });
  });
});
