import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { Server } from 'node:http';
import { PrismaService } from 'prisma/prisma.service';
import { UserRole } from 'generated/prisma/enums';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Role } from '@/common/decorators/role.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';

@Controller('passport-test')
class ProtectedController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin)
  admin() {
    return { allowed: true };
  }
}

describe('Passport JWT authentication (HTTP)', () => {
  const secret = 'test-only-access-secret';
  const jwt = new JwtService();
  const user: AuthenticatedUser = {
    id: 1,
    email: 'user@example.com',
    name: 'User',
    role: UserRole.customer,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const prisma = { user: { findUnique: jest.fn() } };
  let app: INestApplication;
  let server: Server;
  const sign = (
    payload: Record<string, unknown> = {},
    signingSecret = secret,
  ) =>
    jwt.sign(
      { sub: 1, tokenType: 'access', role: UserRole.admin, ...payload },
      { secret: signingSecret, expiresIn: '15m' },
    );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ JWT_ACCESS_TOKEN_SECRET: secret })],
        }),
        PassportModule.register({ session: false }),
      ],
      controllers: [ProtectedController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(user);
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns safe database fields rather than token claims', async () => {
    const response = await request(server)
      .get('/passport-test/me')
      .set('Authorization', `Bearer ${sign()}`)
      .expect(200);
    expect(response.body).toEqual({
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(response.body).not.toHaveProperty('password');
  });

  it.each([undefined, 'Basic token', 'Bearer', 'Bearer token extra'])(
    'rejects missing or malformed headers: %s',
    async (header) => {
      const call = request(server).get('/passport-test/me');
      if (header !== undefined) call.set('Authorization', header);
      await call.expect(401);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['invalid signature', () => sign({}, 'wrong-secret')],
    [
      'expired token',
      () =>
        jwt.sign({ sub: 1, tokenType: 'access' }, { secret, expiresIn: -1 }),
    ],
    ['refresh token', () => sign({ tokenType: 'refresh' })],
    [
      'missing token type',
      () => jwt.sign({ sub: 1 }, { secret, expiresIn: '15m' }),
    ],
    ['string subject', () => sign({ sub: '1' })],
    [
      'missing subject',
      () => jwt.sign({ tokenType: 'access' }, { secret, expiresIn: '15m' }),
    ],
    ['nonpositive subject', () => sign({ sub: 0 })],
    ['fractional subject', () => sign({ sub: 1.5 })],
    [
      'missing expiry',
      () => jwt.sign({ sub: 1, tokenType: 'access' }, { secret }),
    ],
    [
      'wrong algorithm',
      () =>
        jwt.sign(
          { sub: 1, tokenType: 'access' },
          { secret, algorithm: 'HS384', expiresIn: '15m' },
        ),
    ],
  ])('rejects %s before querying users', async (_name, token) => {
    await request(server)
      .get('/passport-test/me')
      .set('Authorization', `Bearer ${token()}`)
      .expect(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a deleted user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await request(server)
      .get('/passport-test/me')
      .set('Authorization', `Bearer ${sign()}`)
      .expect(401);
  });

  it('uses the current database role to forbid access despite an admin token claim', async () => {
    await request(server)
      .get('/passport-test/admin')
      .set('Authorization', `Bearer ${sign()}`)
      .expect(403);
  });

  it('allows a current admin despite a customer token claim', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, role: UserRole.admin });
    await request(server)
      .get('/passport-test/admin')
      .set('Authorization', `Bearer ${sign({ role: UserRole.customer })}`)
      .expect(200);
  });

  it('authenticates before role checks', async () => {
    await request(server).get('/passport-test/admin').expect(401);
  });

  it('fails initialization without the access secret', () => {
    const config = new ConfigService({});
    expect(
      () => new JwtStrategy(config, app.get<PrismaService>(PrismaService)),
    ).toThrow('JWT_ACCESS_TOKEN_SECRET');
  });
});
