import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'prisma/prisma.module';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [MediaController],
  providers: [MediaService, JwtAuthGuard, RolesGuard],
  exports: [MediaService],
})
export class MediaModule {}
