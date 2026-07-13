import { ConflictException, Injectable } from '@nestjs/common';
import { RegisterUserDto } from './dtos/registerUser.dto';
import { LoginUserDto } from './dtos/loginUser.dto';
import { PrismaService } from 'prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService) { }

    async createUser(dto: RegisterUserDto) {
        try {
            const hashedPassword = await bcrypt.hash(dto.password, 10);

            const user = await this.prisma.user.create({
                data: {
                    name: dto.name,
                    email: dto.email,
                    password: hashedPassword,
                },
            });

            // TODO: Generate Access Token
            // TODO: Generate Refresh Token

            return user
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Email already exists');
            }

            throw error;
        }
    }

    async loginUser(dto: LoginUserDto) {

    }
}
