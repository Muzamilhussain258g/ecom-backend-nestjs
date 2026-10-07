import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { AiAgentService } from './ai-agent.service';
import { ChatDto } from './dto/chat.dto';

@Controller('ai-agent')
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('AI agent response generated successfully')
  chat(@Body() dto: ChatDto) {
    return this.aiAgentService.handleUserQuery(dto.message);
  }
}
