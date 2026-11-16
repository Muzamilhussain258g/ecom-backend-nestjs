import {
  Controller,
  Body,
  Delete,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from 'generated/prisma/enums';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { Role } from '@/common/decorators/role.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { MediaService } from './media.service';
import { CreateUploadSignatureDto } from './dto/create-upload-signature.dto';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-signature')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin, UserRole.seller)
  @ResponseMessage('Cloudinary upload signature generated successfully')
  createUploadSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUploadSignatureDto,
  ) {
    return this.mediaService.createUploadSignature(dto.purpose, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin, UserRole.seller)
  @ResponseMessage('Media deleted successfully')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.remove(id);
  }
}
