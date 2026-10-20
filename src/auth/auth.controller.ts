import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dtos/registerUser.dto';
import { LoginUserDto } from './dtos/loginUser.dto';
import { LogoutUserDto } from './dtos/logoutUser.dto';
import { RefreshAccessTokenDto } from './dtos/refreshAccessToken.dto';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { UpdateProfileDto } from './dtos/updateProfile.dto';
import { UpdatePasswordDto } from './dtos/updatePassword.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signUp(@Body() dto: RegisterUserDto) {
    return this.authService.createUser(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signIn(@Body() dto: LoginUserDto) {
    return this.authService.loginUser(dto);
  }

  @Post('signout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('User signed out successfully')
  signOut(@Body() dto: LogoutUserDto) {
    return this.authService.logoutUser(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshToken(@Body() dto: RefreshAccessTokenDto) {
    return this.authService.refreshTheAccessToken(dto);
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get the current authenticated user (any role)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns id, name, email, role, createdAt and updatedAt in data.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid or expired access token, or user no longer exists.',
  })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Profile fetched successfully')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Profile updated successfully')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Password updated successfully')
  updatePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePasswordDto,
  ) {
    return this.authService.updatePassword(user.id, dto);
  }
}
