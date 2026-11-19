import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Header,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { ChatService } from './chat.service';
import { ChatMediaService } from './chat-media.service';
import {
  InboxQueryDto,
  MessageQueryDto,
  ReadChatDto,
  SendMessageDto,
  UploadChatDto,
} from './chat.dto';

@ApiTags('Support chat')
@ApiBearerAuth('JWT-auth')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly media: ChatMediaService,
  ) {}
  @Post('conversations') open(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.open(user);
  }
  @Get('conversations') inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InboxQueryDto,
  ) {
    return this.chat.inbox(user, query);
  }
  @Get('conversations/:id/messages') messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: MessageQueryDto,
  ) {
    return this.chat.messages(user, id, query);
  }
  @Post('conversations/:id/messages') send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(user, id, dto);
  }
  @Put('conversations/:id/read') read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReadChatDto,
  ) {
    return this.chat.read(user, id, dto.sequence);
  }
  @Post('conversations/:id/uploads') reserve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadChatDto,
  ) {
    return this.media.reserve(user, id, dto.resourceType);
  }
  @Post('conversations/:id/uploads/:uploadId/complete') complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
  ) {
    return this.media.complete(user, id, uploadId);
  }
  @Get('attachments/:id/access') @Header('Cache-Control', 'no-store') access(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.media.access(user, id);
  }
}
