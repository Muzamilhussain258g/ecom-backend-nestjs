import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { MediaModule } from '@/media/media.module';

@Module({
  imports: [PrismaModule, AuthModule, MediaModule],
  controllers: [CategoryController],
  providers: [CategoryService, RolesGuard],
})
export class CategoryModule {}
