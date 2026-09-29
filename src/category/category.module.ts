import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'prisma/prisma.module';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { MediaModule } from '@/media/media.module';

@Module({
  imports: [PrismaModule, JwtModule.register({}), MediaModule],
  controllers: [CategoryController],
  providers: [CategoryService, JwtAuthGuard, RolesGuard],
})
export class CategoryModule {}
