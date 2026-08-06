import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  const storedToken = {
    id: 1,
    userId: 10,
    refreshTokenId: 'token-id',
    refreshTokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 60_000),
    isRevoked: false,
    createdAt: new Date(),
  };

  let service: AuthService;
  let prisma: {
    refreshToken: {
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      {} as TokenService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('logoutUser', () => {
    it('deletes the current token and every expired refresh token', async () => {
      const logoutTime = new Date('2026-08-05T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(logoutTime);
      prisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

      await service.logoutUser({
        refreshToken: 'valid-token',
        refreshTokenId: storedToken.refreshTokenId,
      });

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { refreshTokenId: storedToken.refreshTokenId },
            { expiresAt: { lte: logoutTime } },
          ],
        },
      });
    });

    it('returns 401 when the refresh token does not exist', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.logoutUser({
          refreshToken: 'missing-token',
          refreshTokenId: 'missing-id',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });
  });
});
