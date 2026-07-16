import { ConflictException, Injectable } from '@nestjs/common';
import { RegisterUserDto } from './dtos/registerUser.dto';
import { LoginUserDto } from './dtos/loginUser.dto';
import { PrismaService } from 'prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { TokenService } from './services/token.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly tokenService: TokenService
    ) { }

    async createUser(dto: RegisterUserDto) {
        try {
            const hashedPassword = await bcrypt.hash(dto.password, 10);

            const user = await this.prisma.user.create({
                data: {
                    name: dto.name,
                    email: dto.email,
                    password: hashedPassword,
                }, select: {
                    id: true,
                    name: true,
                    email: true,
                }
            });
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
        const user = await this.prisma.user.findUnique({
            where: {
                email: dto.email,
            },
        });

        if (!user) {
            throw new ConflictException('User with this email does not exist');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new ConflictException('Invalid email or password');
        }


        const { accessToken, refreshToken } = await this.tokenService.generateAccessAndRefreshToken({
            userId: user.id,
            email: user.email,
            role: user.role
        })

        

        const { password, ...loggedInUser } = user;
        return {
            loggedInUser,
            accessToken
        };
    }
}
