import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from 'prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { ChatEvents } from './chat.events';
import { ChatRateService } from './chat-rate.service';
import { InboxQueryDto, MessageQueryDto, SendMessageDto } from './chat.dto';

export const chatMessageInclude = {
  sender: { select: { id: true, name: true, role: true } },
  attachments: {
    select: {
      id: true,
      resourceType: true,
      format: true,
      bytes: true,
      width: true,
      height: true,
      duration: true,
    },
  },
} as const;

export function publicMessage<T extends { requestHash: string }>(message: T) {
  const { requestHash: _hash, ...result } = message;
  void _hash;
  return result;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChatEvents,
    private readonly rates: ChatRateService,
  ) {}

  async authorize(user: AuthenticatedUser, id: number) {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id },
    });
    if (
      !conversation ||
      (user.role !== 'admin' && conversation.userId !== user.id)
    )
      throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async open(user: AuthenticatedUser) {
    if (user.role === 'admin')
      throw new ForbiddenException('Admins reply through the support inbox');
    const conversation = await this.prisma.chatConversation.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    this.events.emit('updated', {
      conversationId: conversation.id,
      userId: user.id,
    });
    return conversation;
  }

  async summary(user: AuthenticatedUser, id: number) {
    const conversation = await this.authorize(user, id);
    const read = await this.prisma.chatReadPosition.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
    });
    const [unreadCount, latest, owner, readPositions] = await Promise.all([
      this.prisma.chatMessage.count({
        where: {
          conversationId: id,
          senderId: { not: user.id },
          sequence: { gt: read?.sequence ?? 0 },
        },
      }),
      this.prisma.chatMessage.findFirst({
        where: { conversationId: id },
        orderBy: { sequence: 'desc' },
        include: chatMessageInclude,
      }),
      this.prisma.user.findUnique({
        where: { id: conversation.userId },
        select: { id: true, name: true },
      }),
      this.prisma.chatReadPosition.findMany({
        where: { conversationId: id },
        select: { userId: true, sequence: true },
      }),
    ]);
    return {
      ...conversation,
      user: owner,
      readSequence: read?.sequence ?? 0,
      unreadCount,
      readPositions,
      lastMessage: latest ? publicMessage(latest) : null,
    };
  }

  async inbox(user: AuthenticatedUser, query: InboxQueryDto) {
    const where = user.role === 'admin' ? {} : { userId: user.id };
    const [rows, total] = await Promise.all([
      this.prisma.chatConversation.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.chatConversation.count({ where }),
    ]);
    return {
      items: await Promise.all(rows.map((row) => this.summary(user, row.id))),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async messages(user: AuthenticatedUser, id: number, query: MessageQueryDto) {
    await this.authorize(user, id);
    if (query.beforeSequence !== undefined && query.afterSequence !== undefined)
      throw new BadRequestException(
        'Use beforeSequence or afterSequence, not both',
      );
    const forward = query.afterSequence !== undefined;
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId: id,
        sequence: forward
          ? { gt: query.afterSequence }
          : query.beforeSequence !== undefined
            ? { lt: query.beforeSequence }
            : undefined,
      },
      orderBy: { sequence: forward ? 'asc' : 'desc' },
      take: query.limit + 1,
      include: chatMessageInclude,
    });
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map(publicMessage);
    if (!forward) items.reverse();
    return {
      items,
      hasMore,
      nextCursor: hasMore
        ? forward
          ? items.at(-1)?.sequence
          : items[0]?.sequence
        : null,
    };
  }

  async send(user: AuthenticatedUser, id: number, dto: SendMessageDto) {
    const conversation = await this.authorize(user, id);
    const text = dto.text?.trim() || null;
    const attachmentIds = [...(dto.attachmentIds ?? [])].sort();
    if (!text && !attachmentIds.length)
      throw new BadRequestException('Message must contain text or attachments');
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ id, text, attachmentIds }))
      .digest('hex');
    const key = {
      senderId_clientMessageId: {
        senderId: user.id,
        clientMessageId: dto.clientMessageId,
      },
    };
    const existing = await this.prisma.chatMessage.findUnique({
      where: key,
      include: chatMessageInclude,
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ConflictException(
          'Message UUID was already used with different content',
        );
      return publicMessage(existing);
    }
    this.rates.consume(user.id, 'message');
    try {
      const message = await this.prisma.$transaction(async (tx) => {
        // Updating this row serializes sends and gives committed messages stable per-thread ordering.
        const updated = await tx.chatConversation.update({
          where: { id },
          data: { lastSequence: { increment: 1 } },
        });
        const message = await tx.chatMessage.create({
          data: {
            conversationId: id,
            senderId: user.id,
            clientMessageId: dto.clientMessageId,
            requestHash,
            sequence: updated.lastSequence,
            text,
          },
        });
        if (attachmentIds.length) {
          const attached = await tx.chatAttachment.updateMany({
            where: {
              id: { in: attachmentIds },
              conversationId: id,
              uploaderId: user.id,
              messageId: null,
              status: 'ready',
              createdAt: { gt: new Date(Date.now() - 24 * 3600_000) },
            },
            data: { messageId: message.id, status: 'attached' },
          });
          if (attached.count !== attachmentIds.length)
            throw new BadRequestException(
              'Attachments are unavailable, expired, or do not belong to you',
            );
        }
        return tx.chatMessage.findUniqueOrThrow({
          where: { id: message.id },
          include: chatMessageInclude,
        });
      });
      const result = publicMessage(message);
      this.events.emit('message', result);
      this.events.emit('updated', {
        conversationId: id,
        userId: conversation.userId,
      });
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.chatMessage.findUnique({
          where: key,
          include: chatMessageInclude,
        });
        if (duplicate?.requestHash === requestHash)
          return publicMessage(duplicate);
        throw new ConflictException(
          'Message UUID was already used with different content',
        );
      }
      if (error instanceof HttpException) throw error;
      this.logger.error('Chat message persistence failed');
      throw new ServiceUnavailableException(
        'Message could not be saved; retry with the same clientMessageId',
      );
    }
  }

  async read(user: AuthenticatedUser, id: number, sequence: number) {
    const conversation = await this.authorize(user, id);
    if (sequence > conversation.lastSequence)
      throw new BadRequestException('Read position exceeds message history');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.chatReadPosition.upsert({
        where: {
          conversationId_userId: { conversationId: id, userId: user.id },
        },
        create: { conversationId: id, userId: user.id, sequence: 0 },
        update: {},
      });
      await tx.chatReadPosition.updateMany({
        where: {
          conversationId: id,
          userId: user.id,
          sequence: { lt: sequence },
        },
        data: { sequence },
      });
      return tx.chatReadPosition.findUniqueOrThrow({
        where: {
          conversationId_userId: { conversationId: id, userId: user.id },
        },
      });
    });
    this.events.emit('read', result);
    this.events.emit('updated', {
      conversationId: id,
      userId: conversation.userId,
    });
    return result;
  }
}
