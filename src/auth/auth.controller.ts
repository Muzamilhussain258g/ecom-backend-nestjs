import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dtos/registerUser.dto';
import { LoginUserDto } from './dtos/loginUser.dto';
import { LogoutUserDto } from './dtos/logoutUser.dto';
import { RefreshAccessTokenDto } from './dtos/refreshAccessToken.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }
    @Post("signup")
    signUp(@Body() dto: RegisterUserDto) {
        return this.authService.createUser(dto)
    }

    @Post("signin")
    signIn(@Body() dto: LoginUserDto) {
        return this.authService.loginUser(dto)
    }

    @Post("signout")
    signOut(@Body() dto: LogoutUserDto) {
        return this.authService.logoutUser(dto)
    }

    @Post("refresh")
    refreshToken(@Body() dto: RefreshAccessTokenDto) {
        return this.authService.refreshTheAccessToken(dto)
    }
}
