import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from 'prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { TokenService } from './services/token.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    PassportModule.register({ session: false }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard, JwtStrategy],
  exports: [JwtAuthGuard, PassportModule],
})
export class AuthModule {}
