import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import * as bcrypt from 'bcrypt';
import { UserRole } from 'generated/prisma/enums';

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
  let tokenService: {
    generateAccessAndRefreshToken: jest.Mock;
  };
  let prisma: {
    refreshToken: {
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    tokenService = {
      generateAccessAndRefreshToken: jest.fn(),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      tokenService as unknown as TokenService,
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

  describe('updateProfile', () => {
    it('updates only supplied fields and never selects the password', async () => {
      const updatedUser = {
        id: 10,
        name: 'Updated User',
        email: 'user@example.com',
      };
      prisma.user.update.mockResolvedValue(updatedUser);

      await expect(
        service.updateProfile(10, { name: 'Updated User' }),
      ).resolves.toEqual(updatedUser);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { name: 'Updated User' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  });

  describe('updatePassword', () => {
    const user = {
      id: 10,
      name: 'Test User',
      email: 'user@example.com',
      password: 'stored-password-hash',
      role: UserRole.customer,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('changes the password, revokes old sessions, and creates new tokens', async () => {
      const passwordChangedAt = new Date('2026-08-12T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(passwordChangedAt);
      prisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      (bcrypt.hash as jest.Mock)
        .mockResolvedValueOnce('new-password-hash')
        .mockResolvedValueOnce('new-refresh-token-hash');
      tokenService.generateAccessAndRefreshToken.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const result = await service.updatePassword(user.id, {
        currentPassword: 'current-password',
        newPassword: 'new-password',
      });

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        refreshTokenId: result.refreshTokenId,
      });
      expect(typeof result.refreshTokenId).toBe('string');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { password: 'new-password-hash' },
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: user.id },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          refreshTokenHash: 'new-refresh-token-hash',
          refreshTokenId: result.refreshTokenId,
          userId: user.id,
          expiresAt: new Date(passwordChangedAt.getTime() + 7 * 86400000),
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects an incorrect current password without changing data', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.updatePassword(user.id, {
          currentPassword: 'wrong-password',
          newPassword: 'new-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await expect(
        service.updatePassword(user.id, {
          currentPassword: 'same-password',
          newPassword: 'same-password',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
