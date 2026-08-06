import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dtos/registerUser.dto';
import { LoginUserDto } from './dtos/loginUser.dto';
import { LogoutUserDto } from './dtos/logoutUser.dto';
import { RefreshAccessTokenDto } from './dtos/refreshAccessToken.dto';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

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
}
