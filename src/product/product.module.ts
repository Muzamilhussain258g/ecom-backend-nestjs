import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { MediaModule } from '@/media/media.module';

@Module({
  imports: [PrismaModule, AuthModule, MediaModule],
  controllers: [ProductController],
  providers: [ProductService, RolesGuard],
})
export class ProductModule {}
