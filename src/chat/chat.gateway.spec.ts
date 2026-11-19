import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { io, Socket } from 'socket.io-client';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { PrismaService } from 'prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { ChatEvents } from './chat.events';
import { ChatRateService } from './chat-rate.service';
import { ChatService } from './chat.service';

describe('Chat Socket.IO transport', () => {
  let app: INestApplication;
  let baseUrl: string;
  const secret = 'socket-transport-test-secret';
  const jwt = new JwtService();
  const sockets: Socket[] = [];
  const events = new ChatEvents();
  const db = { user: { findUnique: jest.fn() } };
  const chat = {
    authorize: jest.fn(),
    summary: jest.fn(),
    send: jest.fn(),
    read: jest.fn(),
  };
  const ack = (socket: Socket, event: string, payload: unknown) =>
    socket.timeout(3000).emitWithAck(event, payload) as Promise<{
      success: boolean;
      data?: unknown;
      error?: { statusCode: number };
    }>;
  async function connect(id: number, expiresIn = 900, origin?: string) {
    const socket = io(`${baseUrl}/chat`, {
      auth: {
        token: jwt.sign(
          { sub: id, tokenType: 'access' },
          { secret, expiresIn },
        ),
      },
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: origin ? { origin } : undefined,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ChatGateway,
        ChatRateService,
        JwtStrategy,
        { provide: ChatEvents, useValue: events },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            JWT_ACCESS_TOKEN_SECRET: secret,
            CHAT_ALLOWED_ORIGINS: 'http://localhost:5173',
          }),
        },
        { provide: PrismaService, useValue: db },
        { provide: ChatService, useValue: chat },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockImplementation(
      ({ where }: { where: { id: number } }) =>
        Promise.resolve({
          id: where.id,
          role: where.id === 3 ? 'admin' : 'customer',
          name: 'Test',
        }),
    );
    chat.authorize.mockImplementation((user: { id: number; role: string }) => {
      if (user.id !== 1 && user.role !== 'admin') throw new NotFoundException();
      return Promise.resolve({ id: 10, userId: 1 });
    });
    chat.summary.mockResolvedValue({ id: 10, userId: 1, unreadCount: 0 });
    chat.send.mockResolvedValue({ id: 1, conversationId: 10, sequence: 1 });
  });
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });
  afterAll(async () => {
    await app.close();
  });

  it('authorizes joined viewers and delivers committed events', async () => {
    const admin = await connect(3);
    expect(
      await ack(admin, 'conversation:join', { conversationId: 10 }),
    ).toMatchObject({ success: true });
    const received = new Promise<unknown>((resolve) =>
      admin.once('message:created', resolve),
    );
    events.emit('message', { id: 1, conversationId: 10, sequence: 1 });
    expect(await received).toEqual({ id: 1, conversationId: 10, sequence: 1 });
  });
  it('rejects foreign thread joins and malformed sender fields', async () => {
    const other = await connect(2);
    expect(
      await ack(other, 'conversation:join', { conversationId: 10 }),
    ).toMatchObject({ success: false, error: { statusCode: 404 } });
    const customer = await connect(1);
    expect(
      await ack(customer, 'message:send', {
        conversationId: 10,
        clientMessageId: 'invalid',
        senderId: 3,
        text: 'hello',
      }),
    ).toMatchObject({ success: false, error: { statusCode: 400 } });
    expect(chat.send).not.toHaveBeenCalled();
  });
  it('returns a failed acknowledgement when persistence fails', async () => {
    chat.send.mockRejectedValue(new Error('database failed'));
    const customer = await connect(1);
    expect(
      await ack(customer, 'message:send', {
        conversationId: 10,
        clientMessageId: '548fdc0c-73d5-4fb5-b908-43af9c798ac8',
        text: 'hello',
      }),
    ).toMatchObject({ success: false, error: { statusCode: 500 } });
  });
  it('rejects expired tokens and unapproved browser origins', async () => {
    await expect(connect(1, -1)).rejects.toThrow('Unauthorized');
    await expect(connect(1, 900, 'https://untrusted.invalid')).rejects.toThrow(
      'Unauthorized',
    );
  });
  it('disconnects a revoked admin before sending private data', async () => {
    const admin = await connect(3);
    await ack(admin, 'conversation:join', { conversationId: 10 });
    db.user.findUnique.mockResolvedValue({
      id: 3,
      role: 'customer',
      name: 'Former Admin',
    });
    const leaked = jest.fn();
    admin.on('message:created', leaked);
    const disconnected = new Promise<void>((resolve) =>
      admin.once('disconnect', () => resolve()),
    );
    events.emit('message', { id: 2, conversationId: 10, sequence: 2 });
    await disconnected;
    expect(leaked).not.toHaveBeenCalled();
  });
  it('expires live connections when their access token expires', async () => {
    const customer = await connect(1, 2);
    await new Promise<void>((resolve) =>
      customer.once('disconnect', () => resolve()),
    );
    expect(customer.connected).toBe(false);
  });
  it('broadcasts typing, rate limits updates, and expires the indicator', async () => {
    const customer = await connect(1);
    await ack(customer, 'conversation:join', { conversationId: 10 });
    const expired = new Promise<unknown>((resolve) =>
      customer.on('typing:changed', (payload: { typing: boolean }) => {
        if (!payload.typing) resolve(payload);
      }),
    );
    expect(
      await ack(customer, 'typing:set', { conversationId: 10, typing: true }),
    ).toMatchObject({ success: true });
    await ack(customer, 'typing:set', { conversationId: 10, typing: true });
    expect(
      await ack(customer, 'typing:set', { conversationId: 10, typing: true }),
    ).toMatchObject({ success: false, error: { statusCode: 429 } });
    expect(await expired).toMatchObject({ typing: false, expiresAt: null });
  }, 10000);
});
