import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatEvents } from './chat.events';
import { ChatRateService } from './chat-rate.service';
import { validateChatResource } from './chat-media.service';
import { PrismaService } from 'prisma/prisma.service';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { createHash } from 'node:crypto';

const user = { id: 1, role: 'customer' } as AuthenticatedUser;
describe('Chat authorization and message persistence', () => {
  let service: ChatService;
  let events: ChatEvents;
  const db = {
    chatConversation: { findUnique: jest.fn(), update: jest.fn() },
    chatMessage: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
    chatAttachment: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    events = new ChatEvents();
    service = new ChatService(
      db as unknown as PrismaService,
      events,
      new ChatRateService(),
    );
    db.chatConversation.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      lastSequence: 3,
    });
    db.chatMessage.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
      work(db),
    );
  });
  it('conceals other users conversations but admits admins', async () => {
    await expect(
      service.authorize({ ...user, id: 2 }, 10),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.authorize({ ...user, role: 'admin' }, 10),
    ).resolves.toHaveProperty('id', 10);
  });
  it('rejects empty messages before opening a transaction', async () => {
    await expect(
      service.send(user, 10, { clientMessageId: 'uuid', text: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('returns the committed message on retry without rebroadcasting', async () => {
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ id: 10, text: 'hello', attachmentIds: [] }))
      .digest('hex');
    db.chatMessage.findUnique.mockResolvedValue({ id: 5, requestHash });
    const emitted = jest.spyOn(events, 'emit');
    await expect(
      service.send(user, 10, { clientMessageId: 'uuid', text: 'hello' }),
    ).resolves.toEqual({ id: 5 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();
  });
  it('rejects UUID reuse with different content', async () => {
    db.chatMessage.findUnique.mockResolvedValue({
      id: 5,
      requestHash: 'different',
    });
    await expect(
      service.send(user, 10, { clientMessageId: 'uuid', text: 'hello' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not broadcast failed database writes', async () => {
    db.$transaction.mockRejectedValue(new Error('database unavailable'));
    const emitted = jest.spyOn(events, 'emit');
    await expect(
      service.send(user, 10, { clientMessageId: 'uuid', text: 'hello' }),
    ).rejects.toThrow('Message could not be saved');
    expect(emitted).not.toHaveBeenCalled();
  });
  it('rejects missing, already attached, or unauthorized attachments', async () => {
    db.chatConversation.update.mockResolvedValue({ lastSequence: 4 });
    db.chatMessage.create.mockResolvedValue({ id: 5 });
    db.chatAttachment.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.send(user, 10, {
        clientMessageId: 'uuid',
        attachmentIds: ['attachment'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('returns chronological pages and correct older cursor', async () => {
    db.chatMessage.findMany.mockResolvedValue(
      [3, 2, 1].map((sequence) => ({ sequence, requestHash: 'private' })),
    );
    await expect(service.messages(user, 10, { limit: 2 })).resolves.toEqual({
      items: [{ sequence: 2 }, { sequence: 3 }],
      hasMore: true,
      nextCursor: 2,
    });
    await expect(
      service.messages(user, 10, {
        limit: 2,
        beforeSequence: 3,
        afterSequence: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Chat media verification', () => {
  const image = {
    public_id: 'owned',
    resource_type: 'image',
    type: 'authenticated',
    format: 'png',
    bytes: 5 * 1024 * 1024,
    width: 10,
    height: 10,
  };
  it('accepts images and videos exactly at their limits', () => {
    expect(() => validateChatResource(image, 'image', 'owned')).not.toThrow();
    expect(() =>
      validateChatResource(
        {
          ...image,
          resource_type: 'video',
          format: 'mp4',
          bytes: 20 * 1024 * 1024,
          duration: 30,
        },
        'video',
        'owned',
      ),
    ).not.toThrow();
  });
  it.each([
    { bytes: image.bytes + 1 },
    { bytes: undefined },
    { public_id: 'stolen' },
    { type: 'upload' },
    { format: 'svg' },
    { width: 0 },
  ])('rejects invalid image metadata %j', (override) => {
    expect(() =>
      validateChatResource({ ...image, ...override }, 'image', 'owned'),
    ).toThrow(BadRequestException);
  });
  it.each([undefined, 0, -1, 30.01, NaN])(
    'rejects invalid video duration %s',
    (duration) => {
      expect(() =>
        validateChatResource(
          { ...image, resource_type: 'video', format: 'webm', duration },
          'video',
          'owned',
        ),
      ).toThrow(BadRequestException);
    },
  );
});

describe('Shared chat rate limits', () => {
  it('limits by account/action and resets after the window', () => {
    jest.useFakeTimers();
    try {
      const rate = new ChatRateService();
      for (let i = 0; i < 30; i++) rate.consume(1, 'message');
      expect(() => rate.consume(1, 'message')).toThrow('rate limit');
      expect(() => rate.consume(2, 'message')).not.toThrow();
      expect(() => rate.consume(1, 'upload')).not.toThrow();
      jest.advanceTimersByTime(60_000);
      expect(() => rate.consume(1, 'message')).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });
});
