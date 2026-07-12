import { Injectable } from '@nestjs/common';
import { RegisterUserDto } from './dtos/registerUser.dto';
import { LoginUserDto } from './dtos/loginUser.dto';

@Injectable()
export class AuthService {
    async createUser(dto:RegisterUserDto) {
        return "i am create user function"
    }
    async loginUser(dto:LoginUserDto) {

    }
}
