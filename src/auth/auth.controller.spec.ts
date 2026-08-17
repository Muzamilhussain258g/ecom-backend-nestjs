import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { UserRole } from 'generated/prisma/enums';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
  };

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    });

    const module: TestingModule = await moduleBuilder
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it.each([
    ['signUp', HttpStatus.CREATED],
    ['signIn', HttpStatus.OK],
    ['signOut', HttpStatus.OK],
    ['refreshToken', HttpStatus.OK],
    ['getMe', HttpStatus.OK],
    ['updateProfile', HttpStatus.OK],
    ['updatePassword', HttpStatus.OK],
  ] as const)('uses the correct status code for %s', (method, statusCode) => {
    const configuredStatus = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      AuthController.prototype[method],
    ) as unknown;

    expect(configuredStatus).toBe(statusCode);
  });

  it('returns the authenticated user from getMe', () => {
    const user = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      role: UserRole.customer,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(controller.getMe(user)).toBe(user);
  });

  it('updates the authenticated user profile', () => {
    const user = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      role: UserRole.customer,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const dto = { name: 'Updated User' };

    void controller.updateProfile(user, dto);

    expect(authService.updateProfile).toHaveBeenCalledWith(user.id, dto);
  });

  it('updates the authenticated user password', () => {
    const user = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      role: UserRole.customer,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const dto = {
      currentPassword: 'current-password',
      newPassword: 'new-password',
    };

    void controller.updatePassword(user, dto);

    expect(authService.updatePassword).toHaveBeenCalledWith(user.id, dto);
  });
});
