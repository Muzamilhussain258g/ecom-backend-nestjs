import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterUserDto } from './dtos/registerUser.dto';
import { LoginUserDto } from './dtos/loginUser.dto';
import { PrismaService } from 'prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { TokenService } from './services/token.service';
import { RefreshAccessTokenDto } from './dtos/refreshAccessToken.dto';
import { randomUUID } from 'node:crypto';
import { LogoutUserDto } from './dtos/logoutUser.dto';
import { UpdateProfileDto } from './dtos/updateProfile.dto';
import { UpdatePasswordDto } from './dtos/updatePassword.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async createUser(dto: RegisterUserDto) {
    try {
      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          password: hashedPassword,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
      return user;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  async loginUser(dto: LoginUserDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { accessToken, refreshToken } =
      await this.tokenService.generateAccessAndRefreshToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const refreshTokenId = randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        refreshTokenHash,
        refreshTokenId,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const loggedInUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    return {
      loggedInUser,
      accessToken,
      refreshToken,
      refreshTokenId,
    };
  }

  async refreshTheAccessToken(dto: RefreshAccessTokenDto) {
    const token = await this.prisma.refreshToken.findUnique({
      where: {
        refreshTokenId: dto.refreshTokenId,
      },
      include: {
        user: true,
      },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (token.isRevoked || token.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      dto.refreshToken,
      token.refreshTokenHash,
    );

    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: token.userId,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { accessToken } = await this.tokenService.onlyGenerateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      newAccessToken: accessToken,
    };
  }

  async logoutUser(dto: LogoutUserDto) {
    const token = await this.prisma.refreshToken.findUnique({
      where: {
        refreshTokenId: dto.refreshTokenId,
      },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isValid = await bcrypt.compare(
      dto.refreshToken,
      token.refreshTokenHash,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { refreshTokenId: dto.refreshTokenId },
          { expiresAt: { lte: new Date() } },
        ],
      },
    });

    return;
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: dto.email }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  async updatePassword(userId: number, dto: UpdatePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const [hashedPassword, tokens] = await Promise.all([
      bcrypt.hash(dto.newPassword, 10),
      this.tokenService.generateAccessAndRefreshToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      }),
    ]);
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    const refreshTokenId = randomUUID();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      await transaction.refreshToken.deleteMany({
        where: { userId: user.id },
      });

      await transaction.refreshToken.create({
        data: {
          refreshTokenHash,
          refreshTokenId,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshTokenId,
    };
  }
}
