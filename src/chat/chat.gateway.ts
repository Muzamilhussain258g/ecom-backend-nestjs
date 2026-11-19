import {
  BadRequestException,
  HttpException,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { IsBoolean, IsInt, Min } from 'class-validator';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { ChatService } from './chat.service';
import { ChatEvents } from './chat.events';
import { ChatRateService } from './chat-rate.service';
import { ReadChatDto, SendMessageDto } from './chat.dto';

class ConversationEvent {
  @IsInt() @Min(1) conversationId: number;
}
class SendEvent extends SendMessageDto {
  @IsInt() @Min(1) conversationId: number;
}
class ReadEvent extends ReadChatDto {
  @IsInt() @Min(1) conversationId: number;
}
class TypingEvent extends ConversationEvent {
  @IsBoolean() typing: boolean;
}
interface ChatEventPayload {
  conversationId: number;
  userId?: number;
  [key: string]: unknown;
}

@WebSocketGateway({
  namespace: '/chat',
  maxHttpBufferSize: 32 * 1024,
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const allowed = (
        process.env.CHAT_ALLOWED_ORIGINS ??
        'http://localhost:3000,http://localhost:5173'
      )
        .split(',')
        .map((s) => s.trim());
      callback(null, !origin || allowed.includes(origin));
    },
  },
})
export class ChatGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer() server: Namespace;
  private readonly logger = new Logger(ChatGateway.name);
  private readonly validation = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  private readonly typing = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly listeners: Array<
    [string, (payload: ChatEventPayload) => void]
  > = [];
  private readonly expirations = new WeakMap<Socket, number>();
  constructor(
    private readonly chat: ChatService,
    private readonly events: ChatEvents,
    private readonly rates: ChatRateService,
    private readonly jwt: JwtService,
    private readonly strategy: JwtStrategy,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Namespace) {
    server.use((socket, next) => {
      void (async () => {
        const origin = socket.handshake.headers.origin;
        const allowed = (
          this.config.get<string>('CHAT_ALLOWED_ORIGINS') ??
          'http://localhost:3000,http://localhost:5173'
        )
          .split(',')
          .map((s) => s.trim());
        if (origin && !allowed.includes(origin))
          throw new UnauthorizedException('Origin is not allowed');
        await this.authenticate(socket);
        const expiry = setTimeout(
          () => socket.disconnect(true),
          Math.min(
            this.expirations.get(socket)! * 1000 - Date.now(),
            2_147_483_647,
          ),
        );
        expiry.unref();
        socket.once('disconnect', () => clearTimeout(expiry));
        next();
      })().catch(() => {
        this.logger.warn('Chat connection authentication rejected');
        next(new Error('Unauthorized chat connection'));
      });
    });
    this.listen('message', (payload) =>
      this.broadcast('message:created', payload, payload.conversationId),
    );
    this.listen('read', (payload) =>
      this.broadcast('conversation:read', payload, payload.conversationId),
    );
    this.listen('updated', (payload) =>
      this.broadcast(
        'conversation:updated',
        payload,
        payload.conversationId,
        true,
      ),
    );
  }

  private listen(
    event: string,
    work: (payload: ChatEventPayload) => Promise<void>,
  ) {
    const listener = (payload: ChatEventPayload) => {
      void work(payload).catch(() =>
        this.logger.error(
          `Chat ${event} delivery failed; clients can recover through history`,
        ),
      );
    };
    this.listeners.push([event, listener]);
    this.events.on(event, listener);
  }

  private async authenticate(socket: Socket) {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string')
      throw new UnauthorizedException('Access token required');
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_TOKEN_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    const user = await this.strategy.validate(payload);
    this.expirations.set(socket, (payload as { exp: number }).exp);
    // Admin membership is recalculated, never trusted from the handshake or cached role.
    if (user.role === 'admin') await socket.join('admin:inbox');
    else await socket.leave('admin:inbox');
    return user;
  }

  private async broadcast(
    event: string,
    payload: ChatEventPayload,
    conversationId: number,
    summary = false,
  ) {
    await Promise.all(
      [...this.server.sockets.values()].map(async (socket) => {
        try {
          const user = await this.authenticate(socket);
          if (summary) {
            if (user.role !== 'admin' && user.id !== payload.userId) return;
            socket.emit(event, await this.chat.summary(user, conversationId));
          } else if (socket.rooms.has(`conversation:${conversationId}`)) {
            await this.chat.authorize(user, conversationId);
            socket.emit(event, payload);
          }
        } catch {
          socket.disconnect(true);
        }
      }),
    );
  }

  private async handle<T extends object>(
    socket: Socket,
    raw: unknown,
    type: new () => T,
    work: (
      user: Awaited<ReturnType<ChatGateway['authenticate']>>,
      dto: T,
    ) => Promise<unknown>,
  ) {
    try {
      const user = await this.authenticate(socket);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new BadRequestException('Event payload must be an object');
      const dto = (await this.validation.transform(raw, {
        type: 'body',
        metatype: type,
      })) as T;
      return { success: true, data: await work(user, dto) };
    } catch (error) {
      const statusCode =
        error instanceof HttpException ? error.getStatus() : 500;
      if (statusCode === 401) socket.disconnect(true);
      if (statusCode >= 500) this.logger.error('Chat operation failed');
      return {
        success: false,
        error: {
          statusCode,
          message:
            error instanceof HttpException
              ? error.getResponse()
              : 'Chat operation failed',
        },
      };
    }
  }

  @SubscribeMessage('conversation:join') join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    return this.handle(socket, raw, ConversationEvent, async (user, dto) => {
      await this.chat.authorize(user, dto.conversationId);
      await socket.join(`conversation:${dto.conversationId}`);
      return this.chat.summary(user, dto.conversationId);
    });
  }
  @SubscribeMessage('conversation:leave') leave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    return this.handle(socket, raw, ConversationEvent, async (user, dto) => {
      await this.chat.authorize(user, dto.conversationId);
      await socket.leave(`conversation:${dto.conversationId}`);
      return { conversationId: dto.conversationId };
    });
  }
  @SubscribeMessage('message:send') send(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    return this.handle(socket, raw, SendEvent, (user, dto) =>
      this.chat.send(user, dto.conversationId, dto),
    );
  }
  @SubscribeMessage('conversation:read') read(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    return this.handle(socket, raw, ReadEvent, (user, dto) =>
      this.chat.read(user, dto.conversationId, dto.sequence),
    );
  }
  @SubscribeMessage('typing:set') setTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    return this.handle(socket, raw, TypingEvent, async (user, dto) => {
      await this.chat.authorize(user, dto.conversationId);
      this.rates.consume(user.id, 'typing');
      const key = `${dto.conversationId}:${user.id}`;
      const previous = this.typing.get(key);
      if (previous) clearTimeout(previous);
      this.typing.delete(key);
      const payload = {
        conversationId: dto.conversationId,
        userId: user.id,
        typing: dto.typing,
        expiresAt: dto.typing
          ? new Date(Date.now() + 5000).toISOString()
          : null,
      };
      await this.broadcast('typing:changed', payload, dto.conversationId);
      if (dto.typing) {
        const timer = setTimeout(() => {
          this.typing.delete(key);
          void this.broadcast(
            'typing:changed',
            { ...payload, typing: false, expiresAt: null },
            dto.conversationId,
          ).catch(() => this.logger.warn('Typing expiry delivery failed'));
        }, 5000);
        timer.unref();
        this.typing.set(key, timer);
      }
      return payload;
    });
  }
  onModuleDestroy() {
    for (const [event, listener] of this.listeners)
      this.events.off(event, listener);
    for (const timer of this.typing.values()) clearTimeout(timer);
  }
}
