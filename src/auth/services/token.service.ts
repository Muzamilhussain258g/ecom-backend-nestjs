import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

interface GenerateAccessAndRefreshTokens {
    userId: number,
    email: string,
    role: string
}

export interface Tokens {
    accessToken: string;
    refreshToken: string;
}

@Injectable()
export class TokenService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly config: ConfigService
    ) { }

    async generateAccessAndRefreshToken({ userId, email, role }: GenerateAccessAndRefreshTokens): Promise<Tokens> {
        const payload = { sub: userId, email, role }

        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync({
                ...payload,
                tokenType: 'access',
            }, {
                secret: this.config.getOrThrow<string>("JWT_ACCESS_TOKEN_SECRET"),
                expiresIn: '15m',
            }),
            this.jwtService.signAsync({
                ...payload,
                tokenType: 'refresh',
            }, {
                secret: this.config.getOrThrow<string>("JWT_REFRESH_TOKEN_SECRET"),
                expiresIn: '7d',
            }),
        ])

        return {
            accessToken,
            refreshToken
        }
    }
}
