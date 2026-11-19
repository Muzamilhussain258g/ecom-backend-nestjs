import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { ChatModule } from '@/chat/chat.module';
import { PrismaService } from 'prisma/prisma.service';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ChatMediaService } from '@/chat/chat-media.service';
import { v2 as cloudinary } from 'cloudinary';

// Explicit opt-in: never connects to DATABASE_URL or modifies application tables.
const databaseUrl = process.env.CHAT_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const body = <T>(response: { body: unknown }): T => response.body as T;
integration('Support chat with PostgreSQL and Socket.IO', () => {
  jest.setTimeout(30_000);
  const schema = `chat_test_${randomUUID().replaceAll('-', '')}`;
  const secret = 'chat-integration-only-secret';
  const jwt = new JwtService();
  let app: INestApplication;
  let adminPool: Pool;
  let testPool: Pool;
  let prisma: PrismaClient;
  let baseUrl: string;
  let conversationId: number;
  const sockets: Socket[] = [];
  const token = (id: number, expiresIn = 900) =>
    jwt.sign({ sub: id, tokenType: 'access' }, { secret, expiresIn });
  const auth = (id: number) => `Bearer ${token(id)}`;
  const connect = async (id: number) => {
    const socket = io(`${baseUrl}/chat`, {
      auth: { token: token(id) },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  };
  const emit = (
    socket: Socket,
    event: string,
    payload: object,
  ): Promise<{ success: boolean; data: { id: number } }> =>
    socket.timeout(5000).emitWithAck(event, payload);

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: databaseUrl });
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    testPool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    });
    await testPool.query(`CREATE TYPE "UserRole" AS ENUM ('customer', 'admin', 'seller');
      CREATE TABLE "User" ("id" SERIAL PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "password" TEXT NOT NULL,
      "role" "UserRole" NOT NULL DEFAULT 'customer', "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20261119000000_support_chat/migration.sql',
      ),
      'utf8',
    );
    await testPool.query(migration.replaceAll('"public".', `"${schema}".`));
    await testPool.query(`INSERT INTO "User" (id,email,password,role,name) VALUES
      (1,'customer@test.invalid','unused','customer','Customer'), (2,'other@test.invalid','unused','customer','Other'),
      (3,'admin@test.invalid','unused','admin','Admin'), (4,'admin2@test.invalid','unused','admin','Admin Two')`);
    const url = new URL(databaseUrl!);
    url.searchParams.set('options', `-c search_path=${schema}`);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
    });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              DATABASE_URL: url.toString(),
              JWT_ACCESS_TOKEN_SECRET: secret,
              CLOUDINARY_CLOUD_NAME: 'test',
              CLOUDINARY_API_KEY: 'test',
              CLOUDINARY_API_SECRET: 'test',
            }),
          ],
        }),
        ChatModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    const opened = await request(baseUrl)
      .post('/api/v1/chat/conversations')
      .set('Authorization', auth(1))
      .expect(201);
    conversationId = body<{ id: number }>(opened).id;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (testPool) await testPool.end();
    if (adminPool) {
      // The identifier is generated above, never read from configuration or user input.
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
    jest.restoreAllMocks();
  });

  it('creates exactly one thread under concurrent requests', async () => {
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        request(baseUrl)
          .post('/api/v1/chat/conversations')
          .set('Authorization', auth(1))
          .expect(201),
      ),
    );
    expect(results.map((r) => body<{ id: number }>(r).id)).toEqual([
      conversationId,
      conversationId,
      conversationId,
    ]);
  });
  it('blocks anonymous requests and cross-user HTTP/socket access', async () => {
    await request(baseUrl)
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .expect(401);
    await request(baseUrl)
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', auth(2))
      .expect(404);
    const other = await connect(2);
    expect(
      await emit(other, 'conversation:join', { conversationId }),
    ).toMatchObject({ success: false, error: { statusCode: 404 } });
  });
  it('delivers live messages and deduplicates concurrent HTTP/socket retries', async () => {
    const customer = await connect(1);
    const admin = await connect(3);
    expect(
      await emit(admin, 'conversation:join', { conversationId }),
    ).toMatchObject({ success: true });
    const received = new Promise<{ id: number }>((resolve) =>
      admin.once('message:created', resolve),
    );
    const payload = { clientMessageId: randomUUID(), text: 'Support request' };
    const [socketResult, httpResult] = await Promise.all([
      emit(customer, 'message:send', { conversationId, ...payload }),
      request(baseUrl)
        .post(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', auth(1))
        .send(payload)
        .expect(201),
    ]);
    expect(socketResult.success).toBe(true);
    expect(socketResult.data.id).toBe(body<{ id: number }>(httpResult).id);
    expect((await received).id).toBe(body<{ id: number }>(httpResult).id);
    expect(await prisma.chatMessage.count()).toBe(1);
    await request(baseUrl)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', auth(1))
      .send({ ...payload, text: 'Different' })
      .expect(409);
  });
  it('allocates ordered sequences and recovers offline messages', async () => {
    await Promise.all(
      [1, 2, 3].map((n) =>
        request(baseUrl)
          .post(`/api/v1/chat/conversations/${conversationId}/messages`)
          .set('Authorization', auth(3))
          .send({ clientMessageId: randomUUID(), text: `Reply ${n}` })
          .expect(201),
      ),
    );
    const response = await request(baseUrl)
      .get(
        `/api/v1/chat/conversations/${conversationId}/messages?afterSequence=1`,
      )
      .set('Authorization', auth(1))
      .expect(200);
    expect(
      body<{ items: { sequence: number }[] }>(response).items.map(
        (m) => m.sequence,
      ),
    ).toEqual([2, 3, 4]);
  });
  it('keeps read positions monotonic and unread counts independent per admin', async () => {
    await request(baseUrl)
      .put(`/api/v1/chat/conversations/${conversationId}/read`)
      .set('Authorization', auth(3))
      .send({ sequence: 4 })
      .expect(200);
    const read = await request(baseUrl)
      .put(`/api/v1/chat/conversations/${conversationId}/read`)
      .set('Authorization', auth(3))
      .send({ sequence: 1 })
      .expect(200);
    expect(body<{ sequence: number }>(read).sequence).toBe(4);
    const inbox = await request(baseUrl)
      .get('/api/v1/chat/conversations')
      .set('Authorization', auth(4))
      .expect(200);
    expect(
      body<{ items: { unreadCount: number }[] }>(inbox).items[0].unreadCount,
    ).toBe(4);
  });
  it('verifies private uploads, sends attachment-only messages, and rejects reuse', async () => {
    const reserved = await request(baseUrl)
      .post(`/api/v1/chat/conversations/${conversationId}/uploads`)
      .set('Authorization', auth(1))
      .send({ resourceType: 'video' })
      .expect(201);
    const id = body<{ uploadId: string }>(reserved).uploadId;
    const upload = await prisma.chatAttachment.findUniqueOrThrow({
      where: { id },
    });
    const provider = jest.spyOn(cloudinary.api, 'resource').mockResolvedValue({
      public_id: upload.publicId,
      resource_type: 'video',
      type: 'authenticated',
      format: 'mp4',
      bytes: 100,
      width: 100,
      height: 100,
      duration: 30,
    });
    await request(baseUrl)
      .post(
        `/api/v1/chat/conversations/${conversationId}/uploads/${id}/complete`,
      )
      .set('Authorization', auth(2))
      .expect(404);
    await request(baseUrl)
      .post(
        `/api/v1/chat/conversations/${conversationId}/uploads/${id}/complete`,
      )
      .set('Authorization', auth(1))
      .expect(201);
    await request(baseUrl)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', auth(1))
      .send({ clientMessageId: randomUUID(), attachmentIds: [id] })
      .expect(201);
    await request(baseUrl)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', auth(1))
      .send({ clientMessageId: randomUUID(), attachmentIds: [id] })
      .expect(400);
    await request(baseUrl)
      .get(`/api/v1/chat/attachments/${id}/access`)
      .set('Authorization', auth(2))
      .expect(404);
    const access = await request(baseUrl)
      .get(`/api/v1/chat/attachments/${id}/access`)
      .set('Authorization', auth(3))
      .expect(200);
    expect(
      Date.parse(body<{ expiresAt: string }>(access).expiresAt) - Date.now(),
    ).toBeLessThanOrEqual(300_000);
    expect(body<{ url: string }>(access).url).toContain('expires_at=');
    provider.mockRestore();
  });
  it('cleans abandoned uploads while keeping attached media', async () => {
    await prisma.chatAttachment.create({
      data: {
        id: randomUUID(),
        conversationId,
        uploaderId: 1,
        publicId: 'abandoned-test',
        resourceType: 'image',
        createdAt: new Date(Date.now() - 25 * 3600_000),
      },
    });
    const destroy = jest
      .spyOn(cloudinary.uploader, 'destroy')
      .mockResolvedValue({ result: 'ok' });
    destroy.mockRejectedValueOnce(new Error('Temporary provider failure'));
    await app.get(ChatMediaService).cleanup();
    expect(
      await prisma.chatAttachment.findUnique({
        where: { publicId: 'abandoned-test' },
      }),
    ).toMatchObject({ status: 'deleting' });
    await app.get(ChatMediaService).cleanup();
    expect(
      await prisma.chatAttachment.count({
        where: { publicId: 'abandoned-test' },
      }),
    ).toBe(0);
    expect(
      await prisma.chatAttachment.count({ where: { status: 'attached' } }),
    ).toBe(1);
    destroy.mockRestore();
  });
  it('rejects expired tokens on handshake', async () => {
    const socket = io(`${baseUrl}/chat`, {
      auth: { token: token(1, -1) },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    const error = await new Promise<Error>((resolve) =>
      socket.once('connect_error', resolve),
    );
    expect(error.message).toContain('Unauthorized');
  });
});
