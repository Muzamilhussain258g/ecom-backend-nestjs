import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '@/auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatMediaService } from './chat-media.service';
import { ChatRateService } from './chat-rate.service';
import { ChatEvents } from './chat.events';

@Module({
  imports: [AuthModule, PrismaModule, JwtModule.register({})],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatMediaService,
    ChatRateService,
    ChatEvents,
    ChatGateway,
  ],
})
export class ChatModule {}
