import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import type { Server } from 'http';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { AdminFaqController, FaqController } from './faq.controller';
import { FaqService } from './faq.service';

describe('FAQ HTTP API', () => {
  let app: INestApplication;
  const prisma = {
    faq: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: { findFirst: jest.fn(), findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const jwt = new JwtService({ secret: 'faq-test-secret' });
  const token = (id = 1) =>
    jwt.sign({ sub: id, tokenType: 'access' }, { expiresIn: '5m' });
  const missing = () =>
    new Prisma.PrismaClientKnownRequestError('Missing', {
      code: 'P2025',
      clientVersion: '7.8.0',
    });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ session: false })],
      controllers: [FaqController, AdminFaqController],
      providers: [
        FaqService,
        JwtStrategy,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'faq-test-secret' },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor(new Reflector()));
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id: number } }) => ({
        id: where.id,
        role: where.id === 1 ? 'admin' : where.id === 2 ? 'seller' : 'customer',
      }),
    );
    prisma.faq.findMany.mockResolvedValue([]);
    prisma.product.findFirst.mockResolvedValue({ id: 8 });
    prisma.product.findUnique.mockResolvedValue({ id: 8 });
  });
  it('allows guest website reads with active website filtering and deterministic order', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/faqs')
      .expect(200);
    expect((response.body as { data: unknown }).data).toEqual([]);
    expect(prisma.faq.findMany).toHaveBeenCalledWith({
      where: { productId: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  });
  it('reads only active FAQs for the selected active product, including empty results', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/products/phone/faqs')
      .expect(200);
    expect((response.body as { data: unknown }).data).toEqual([]);
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { slug: 'phone', productStatus: true },
      select: { id: true },
    });
    expect(prisma.faq.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 8, isActive: true } }),
    );
    prisma.product.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer() as Server)
      .get('/api/v1/products/hidden/faqs')
      .expect(404);
  });
  it.each(['get', 'post', 'patch', 'delete'] as const)(
    'protects admin %s from guests and non-admins',
    async (method) => {
      const path =
        '/api/v1/admin/faqs' +
        (method === 'patch' || method === 'delete' ? '/1' : '');
      await request(app.getHttpServer() as Server)
        [method](path)
        .expect(401);
      await request(app.getHttpServer() as Server)
        [method](path)
        .set('Authorization', 'Bearer invalid')
        .expect(401);
      for (const id of [2, 3]) {
        await request(app.getHttpServer() as Server)
          [method](path)
          .set('Authorization', 'Bearer ' + token(id))
          .expect(403);
      }
    },
  );
  it('rejects expired tokens', async () => {
    const expired = jwt.sign(
      { sub: 1, tokenType: 'access' },
      { expiresIn: -1 },
    );
    await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/faqs')
      .set('Authorization', 'Bearer ' + expired)
      .expect(401);
  });
  it('supports admin filters including false and rejects conflicting filters', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/faqs?scope=product&productId=8&isActive=false')
      .set('Authorization', 'Bearer ' + token())
      .expect(200);
    expect(prisma.faq.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 8, isActive: false } }),
    );
    await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/faqs?scope=website&productId=8')
      .set('Authorization', 'Bearer ' + token())
      .expect(400);
    await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/faqs?isActive=no')
      .set('Authorization', 'Bearer ' + token())
      .expect(400);
  });
  it('creates website and product FAQs, trimming plain text', async () => {
    prisma.faq.create.mockResolvedValue({ id: 1 });
    for (const productId of [undefined, null, 8]) {
      await request(app.getHttpServer() as Server)
        .post('/api/v1/admin/faqs')
        .set('Authorization', 'Bearer ' + token())
        .send({ question: ' Question? ', answer: ' Answer. ', productId })
        .expect(201);
      expect(prisma.faq.create).toHaveBeenLastCalledWith({
        data: {
          question: 'Question?',
          answer: 'Answer.',
          productId: productId ?? null,
          sortOrder: undefined,
          isActive: undefined,
        },
      });
    }
    prisma.product.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer() as Server)
      .post('/api/v1/admin/faqs')
      .set('Authorization', 'Bearer ' + token())
      .send({ question: 'Q', answer: 'A', productId: 999 })
      .expect(404);
  });
  it.each([
    { question: ' ' },
    { answer: '' },
    { question: 'a'.repeat(301) },
    { answer: 'a'.repeat(5001) },
    { question: null },
    { answer: null },
    { sortOrder: null },
    { isActive: null },
    { sortOrder: -1 },
    { sortOrder: 1.5 },
    { isActive: 'false' },
  ])('rejects invalid create/update input %j', async (invalid) => {
    await request(app.getHttpServer() as Server)
      .post('/api/v1/admin/faqs')
      .set('Authorization', 'Bearer ' + token())
      .send({ question: 'Q', answer: 'A', ...invalid })
      .expect(400);
    await request(app.getHttpServer() as Server)
      .patch('/api/v1/admin/faqs/1')
      .set('Authorization', 'Bearer ' + token())
      .send(invalid)
      .expect(400);
  });
  it('updates visibility and ordering, forbids scope reassignment, and deletes', async () => {
    prisma.faq.update.mockResolvedValue({
      id: 1,
      isActive: false,
      sortOrder: 2,
    });
    prisma.faq.delete.mockResolvedValue({ id: 1 });
    await request(app.getHttpServer() as Server)
      .patch('/api/v1/admin/faqs/1')
      .set('Authorization', 'Bearer ' + token())
      .send({ isActive: false, sortOrder: 2 })
      .expect(200);
    expect(prisma.faq.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        question: undefined,
        answer: undefined,
        isActive: false,
        sortOrder: 2,
      },
    });
    await request(app.getHttpServer() as Server)
      .patch('/api/v1/admin/faqs/1')
      .set('Authorization', 'Bearer ' + token())
      .send({ productId: 8 })
      .expect(400);
    await request(app.getHttpServer() as Server)
      .delete('/api/v1/admin/faqs/1')
      .set('Authorization', 'Bearer ' + token())
      .expect(200);
    prisma.faq.update.mockRejectedValue(missing());
    prisma.faq.delete.mockRejectedValue(missing());
    await request(app.getHttpServer() as Server)
      .patch('/api/v1/admin/faqs/99')
      .set('Authorization', 'Bearer ' + token())
      .send({ answer: 'A' })
      .expect(404);
    await request(app.getHttpServer() as Server)
      .delete('/api/v1/admin/faqs/99')
      .set('Authorization', 'Bearer ' + token())
      .expect(404);
  });
});
