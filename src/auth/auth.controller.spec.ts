import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {},
        },
      ],
    }).compile();

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
  ] as const)('uses the correct status code for %s', (method, statusCode) => {
    const configuredStatus = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      AuthController.prototype[method],
    ) as unknown;

    expect(configuredStatus).toBe(statusCode);
  });
});
