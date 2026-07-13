import { Injectable } from '@nestjs/common';
import { RegisterUserDto } from './dtos/registerUser.dto';
import { LoginUserDto } from './dtos/loginUser.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService) { }
    async createUser(dto: RegisterUserDto) {
        // const user = this.prisma.
    }
    async loginUser(dto: LoginUserDto) {

    }
}
