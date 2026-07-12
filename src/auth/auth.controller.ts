import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dtos/registerUser.dto';
import { LoginUserDto } from './dtos/loginUser.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }
    @Post("signup")
    signUp(@Body() dto:RegisterUserDto) {
        return this.authService.createUser(dto)
    }

    @Post("signin")
    signIn(@Body() dto:LoginUserDto) {
        return this.authService.loginUser(dto)
    }
}
