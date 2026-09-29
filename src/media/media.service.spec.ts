import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { MediaService } from './media.service';
import { MediaPurpose } from './dto/create-upload-signature.dto';
import { PrismaService } from 'prisma/prisma.service';

describe('MediaService', () => {
  it('returns a signed payload without exposing the API secret', () => {
    const values: Record<string, string> = {
      CLOUDINARY_CLOUD_NAME: 'demo-cloud',
      CLOUDINARY_API_KEY: 'demo-key',
      CLOUDINARY_API_SECRET: 'demo-secret',
      CLOUDINARY_UPLOAD_FOLDER: 'ecommerce',
    };
    const configService = {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    const service = new MediaService(
      configService,
      {} as unknown as PrismaService,
    );
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const result = service.createUploadSignature(MediaPurpose.product);

    expect(result).toEqual({
      signature: cloudinary.utils.api_sign_request(
        result.uploadParams,
        'demo-secret',
      ),
      timestamp: 1_700_000_000,
      apiKey: 'demo-key',
      cloudName: 'demo-cloud',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
      uploadParams: {
        allowed_formats: 'jpg,jpeg,png,webp,avif',
        folder: 'ecommerce/product',
        overwrite: false,
        public_id: result.uploadParams.public_id,
        timestamp: 1_700_000_000,
      },
    });
    expect(typeof result.uploadParams.public_id).toBe('string');
    expect(result).not.toHaveProperty('apiSecret');

    nowSpy.mockRestore();
  });
});
