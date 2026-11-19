import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from 'generated/prisma/enums';
import { Role } from '@/common/decorators/role.decorator';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { AdminFaqQueryDto, CreateFaqDto, UpdateFaqDto } from './dto/faq.dto';
import { FaqService } from './faq.service';

@ApiTags('FAQs')
@Controller()
export class FaqController {
  constructor(private readonly service: FaqService) {}

  @Get('faqs')
  @ApiOperation({
    summary: 'Public: List active website FAQs in display order',
  })
  @ResponseMessage('FAQs fetched successfully')
  findWebsite() {
    return this.service.findWebsite();
  }

  @Get('products/:slug/faqs')
  @ApiOperation({ summary: 'Public: List active FAQs for an active product' })
  @ApiNotFoundResponse({ description: 'Product missing or inactive' })
  @ResponseMessage('Product FAQs fetched successfully')
  findProduct(@Param('slug') slug: string) {
    return this.service.findProduct(slug);
  }
}

@ApiTags('FAQs')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({
  description: 'Authentication required or invalid token',
})
@ApiForbiddenResponse({ description: 'Admin role required' })
@ApiBadRequestResponse({
  description: 'Invalid FAQ input or conflicting filters',
})
@ApiNotFoundResponse({ description: 'FAQ or product not found' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Role(UserRole.admin)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@Controller('admin/faqs')
export class AdminFaqController {
  constructor(private readonly service: FaqService) {}

  @Get()
  @ApiOperation({
    summary:
      'Admin: List FAQs including inactive entries; optional scope, productId and isActive filters',
  })
  @ResponseMessage('FAQs fetched successfully')
  findAll(@Query() query: AdminFaqQueryDto) {
    return this.service.findAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: 'Admin: Create a website or product FAQ' })
  @ResponseMessage('FAQ created successfully')
  create(@Body() dto: CreateFaqDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Admin: Edit FAQ content, order or visibility; product association is immutable',
  })
  @ResponseMessage('FAQ updated successfully')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFaqDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Admin: Permanently delete a FAQ' })
  @ResponseMessage('FAQ deleted successfully')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
