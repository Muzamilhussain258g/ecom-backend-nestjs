import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from 'generated/prisma/enums';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { Role } from '@/common/decorators/role.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { UserQueryDto } from './dto/user-query.dto';
import { UserService } from './user.service';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Role(UserRole.admin)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'Admin: List and search users with pagination' })
  @ResponseMessage('Users fetched successfully')
  findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }
}
